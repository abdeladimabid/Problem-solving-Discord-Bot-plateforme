// One-time import from GitHub Watcher (its KV namespace bound to ClassBot as WATCHER_KV): GitHub links of the students,
// briefs (deadlines with their text, competencies, grid, squads), hand-ins, debriefs (switches, level, comment, and the
// decisions of earlier briefs), forum posts, GitHub activity and first pushes, sprint decisions, hidden repos.
// Safe to run again: what was already imported is skipped or updated.
import type { Env, GuildRow } from "./types.ts";
import { all, getGuild, now, one, run } from "./db.ts";
import { RULES } from "./game.ts";
import { briefFromText } from "./briefs.ts";
import { parseSkills } from "./review/engine.ts";
import { programOf, weekAt } from "./program.ts";
import { ghAppOf } from "./github.ts";
import { GH_API, appJwt } from "./review/gh.ts";

async function listAll(kv: any, prefix: string) {
  const keys: any[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}

/** The Watcher's data, read in the dashboard through the Cloudflare API (key → value), used like its KV namespace. */
export function memoryKv(data: Record<string, unknown>) {
  const val = (k: string) => (k in data ? data[k] : null);
  return {
    async get(k: string, type?: string) { const v = val(k); if (v == null) return null; if (type !== "json") return typeof v === "string" ? v : JSON.stringify(v); return typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v; },
    async list(o: { prefix?: string }) {
      const metaOf = (k: string) => { const v: any = data[k]; return v && typeof v === "object" && "__meta" in v ? v.__meta : undefined; };
      return { keys: Object.keys(data).filter((k) => k.startsWith(o.prefix ?? "")).map((name) => ({ name, metadata: metaOf(name) })), list_complete: true, cursor: undefined };
    },
  };
}

// ---- the Cloudflare API (a token with "Workers KV Storage: Read"), a few calls per request (Workers allow 50)
const CF = "https://api.cloudflare.com/client/v4";
const cfHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
export class WatcherError extends Error {}
const clean = (v: unknown, rx: RegExp) => { const s = String(v ?? "").trim(); if (!rx.test(s)) throw new WatcherError("Check the account ID, the namespace ID and the token."); return s; };
export async function watcherKeys(acc: string, ns: string, token: string): Promise<{ keys: string[]; meta: Record<string, unknown> }> {
  const a = clean(acc, /^[a-f0-9]{32}$/i), n = clean(ns, /^[a-f0-9]{32}$/i), t = clean(token, /^[\w-]{20,}$/);
  const keys: string[] = [];
  // the GitHub activity is in the keys' metadata ("ev:…"): it comes with the listing, no value to read
  const meta: Record<string, unknown> = {};
  let cursor = "";
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${CF}/accounts/${a}/storage/kv/namespaces/${n}/keys?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { headers: cfHeaders(t) });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.success) throw new WatcherError(`Cloudflare refused: ${j?.errors?.[0]?.message || r.status}. The token needs “Workers KV Storage: Read” on this account.`);
    keys.push(...(j.result ?? []).map((k: any) => String(k.name)));
    for (const k of j.result ?? []) if (String(k.name).startsWith("ev:") && k.metadata) meta[String(k.name)] = k.metadata;
    cursor = j.result_info?.cursor || "";
    if (!cursor) break;
  }
  // only what the import uses
  return { keys: keys.filter((k) => /^(inst:|sub:|subsq:|ai:|thread:|fb:|dl:)/.test(k) || ["names", "aliases", "deadlines", "hidden_repos", "evals", "sprints", "sprintdec"].includes(k)), meta };
}
export async function watcherValues(acc: string, ns: string, token: string, keys: string[]): Promise<Record<string, unknown>> {
  const a = clean(acc, /^[a-f0-9]{32}$/i), n = clean(ns, /^[a-f0-9]{32}$/i), t = clean(token, /^[\w-]{20,}$/);
  const out: Record<string, unknown> = {};
  await Promise.all(keys.slice(0, 40).map(async (k) => {
    const r = await fetch(`${CF}/accounts/${a}/storage/kv/namespaces/${n}/values/${encodeURIComponent(k)}`, { headers: cfHeaders(t) });
    if (r.ok) out[k] = await r.text();
  }));
  return out;
}

/** Is this installation one of the class's App (asked to GitHub as the App)? */
async function appOwns(env: Env, guildId: string, inst: string): Promise<boolean> {
  try {
    const app = await ghAppOf(env, guildId);
    if (!app.privateKey || !(app.appId || app.clientId) || !/^\d+$/.test(inst)) return false;
    const r = await fetch(`${GH_API}/app/installations/${inst}`, { headers: { Authorization: `Bearer ${await appJwt(app)}`, Accept: "application/vnd.github+json", "User-Agent": "classbot", "X-GitHub-Api-Version": "2022-11-28" } });
    return r.ok;
  } catch { return false; }
}

export async function importWatcher(env: Env, g: GuildRow, source: any = env.WATCHER_KV) {
  const kv = source;
  const out: Record<string, number> = { students: 0, briefs: 0, handins: 0, reviews: 0, levels: 0, comments: 0, hidden: 0, threads: 0, activity: 0, pushes: 0, sprints: 0, skipped: 0 };
  // every write is batched (a batch is one round trip): a class of 30 stays far inside Cloudflare's free limits
  const writes: any[] = [];
  const w = (sql: string, ...args: unknown[]) => writes.push(env.DB.prepare(sql).bind(...args.map((v) => (v === undefined ? null : v))));
  const flush = async () => { for (let i = 0; i < writes.length; i += 50) await env.DB.batch(writes.slice(i, i + 50)); writes.length = 0; };
  const json = async (k: string) => { try { return await kv.get(k, "json"); } catch { return null; } };
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  // the students' installations belong to the Watcher's App: kept when the class uses that App (the Worker's App, or
  // the class's own App when GitHub says the installation is its own): students do nothing. Another App: each
  // student connects again with /github (their history and debriefs are kept)
  const instKeys = await listAll(kv, "inst:");
  const own = await one<{ app_id: string | null }>(env, "SELECT app_id FROM gh_apps WHERE guild_id = ?", g.id).catch(() => null);
  const keepInst = !own || (instKeys.length > 0 && (await appOwns(env, g.id, instKeys[0].name.slice(5))));
  out.keepInst = keepInst ? 1 : 0;

  // 1. links: GitHub account (+ installation), by Discord id; the name the teacher gave in the Watcher
  const names = ((await json("names")) || {}) as Record<string, { n: string }>;
  const aliases = ((await json("aliases")) || {}) as Record<string, string>;
  const ghToDiscord = new Map<string, string>();
  for (const k of instKeys) {
    const l = await json(k.name);
    if (!l?.discordId || !l?.githubId) continue;
    const did = String(l.discordId), gid = String(l.githubId);
    const name = aliases[gid] || names[did]?.n || l.discordName || null;
    const linked = Math.floor((Date.parse(l.linkedAt || "") || Date.now()) / 1000);
    w(`INSERT INTO players (guild_id, discord_id, name, coins, created_at, last_active) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (guild_id, discord_id) DO UPDATE SET name = COALESCE(players.name, excluded.name)`, g.id, did, name, RULES.startCoins, now(), now());
    // a link made in ClassBot since then wins
    w(`UPDATE players SET github_id = COALESCE(github_id, ?), github_login = COALESCE(github_login, ?), gh_inst = CASE WHEN github_id IS NULL OR github_id = ? THEN COALESCE(gh_inst, ?) ELSE gh_inst END,
      gh_linked_at = COALESCE(gh_linked_at, ?) WHERE guild_id = ? AND discord_id = ?`, gid, String(l.login || ""), gid, keepInst ? k.name.slice(5) : null, linked, g.id, did);
    ghToDiscord.set(gid, did);
    out.students++;
  }
  await flush();

  // 2. briefs, in the sprint of the programme that holds their due date
  const p = await programOf(env, g);
  const deadlines = ((await json("deadlines")) || []) as any[];
  const briefIds = new Map<string, number>(), briefKind = new Map<string, string>();
  for (const d of deadlines) {
    const src = `watcher:${d.id}`;
    const start = Math.floor((Date.parse(d.createdAt) || Date.now()) / 1000), due = Math.floor((Date.parse(d.due) || Date.now()) / 1000);
    const data = briefFromText(String(d.brief || ""), String(d.name || "Brief"), parseSkills(d.skills || ""));
    data.modalities.start = new Date(start * 1000).toISOString().slice(0, 10);
    data.modalities.due = new Date(due * 1000).toISOString().slice(0, 10);
    const wk = weekAt(p, data.modalities.due);
    const squads = (Array.isArray(d.squads) ? d.squads : []).map((s: any) => ({
      id: s.id, name: s.name, members: (s.members || []).map((m: any) => ghToDiscord.get(String(m.gid))).filter(Boolean), sm: ghToDiscord.get(String(s.sm)) ?? null,
    })).filter((s: any) => s.members.length).map((s: any) => ({ ...s, sm: s.sm ?? s.members[0] }));
    const existing = await one<{ id: number }>(env, "SELECT id FROM briefs WHERE guild_id = ? AND source = ?", g.id, src);
    const fields = [data.title, JSON.stringify(data), parseSkills(d.skills || "").join(","), start, due, d.kind === "squad" ? "squad" : "solo", JSON.stringify(squads),
      d.grid ? JSON.stringify(d.grid) : null, d.repo || null, JSON.stringify(d.sent || {}), now() - due > 30 * 86400 ? "archived" : "assigned"];
    if (existing) {
      await run(env, "UPDATE briefs SET title = ?, data = ?, competencies = ?, start_at = ?, due_at = ?, kind = ?, squads = ?, grid = ?, repo_hint = ?, sent = ?, status = ?, updated_at = ? WHERE id = ?", ...fields, now(), existing.id);
      briefIds.set(d.id, existing.id);
    } else {
      const r = await run(env, `INSERT INTO briefs (guild_id, program, week, sprint, title, data, competencies, start_at, due_at, kind, squads, grid, repo_hint, sent, status, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, g.id, p.id, wk?.n ?? null, wk?.sprint ?? null, ...fields, src, now(), now());
      briefIds.set(d.id, Number(r.meta.last_row_id));
    }
    briefKind.set(d.id, d.kind === "squad" ? "squad" : "solo");
    out.briefs++;
  }

  // 3. hand-ins
  for (const k of [...await listAll(kv, "sub:"), ...await listAll(kv, "subsq:")]) {
    const [kind, dl, who] = k.name.split(":");
    const bid = briefIds.get(dl);
    const h = bid ? await json(k.name) : null;
    if (!bid || !h?.repo) continue;
    const wh = kind === "subsq" ? `s:${who}` : ghToDiscord.has(who) ? `u:${ghToDiscord.get(who)}` : null;
    if (!wh) continue;
    w(`INSERT INTO brief_handins (brief_id, guild_id, who, repo, plan, at, by) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (brief_id, who) DO UPDATE SET repo = excluded.repo, plan = excluded.plan`, bid, g.id, wh, h.repo, h.plan ?? null, Math.floor((Date.parse(h.at) || Date.now()) / 1000), h.by ?? "student");
    out.handins++;
  }
  await flush();

  // 4. debriefs: the teacher's switches, oral questions, mise en situation, level and comment come with them (as drafts:
  //    the teacher finalizes). The Watcher kept the full debrief of a student's latest brief only: for an earlier brief,
  //    its "evals" (the decisions) and "fb:" (the comment) still make a debrief to open.
  const evals = ((await json("evals")) || {}) as Record<string, any>;
  const fbKeys = new Set((await listAll(kv, "fb:")).map((k: any) => k.name));
  const fbOf = async (dl: string, gid: string) => (fbKeys.has(`fb:${dl}:${gid}`) ? String((await kv.get(`fb:${dl}:${gid}`)) || "") : "");
  const put = (bid: number, who: string, rec: any) => {
    const lv = rec.level || {};
    if (lv.lvl || lv.prop) out.levels++;
    w(`INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, level, plevel, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)
      ON CONFLICT (brief_id, who) DO UPDATE SET record = excluded.record, level = excluded.level, plevel = excluded.plevel, updated_at = excluded.updated_at
      WHERE brief_reviews.status != 'final'`, bid, g.id, who, JSON.stringify(rec), lv.lvl || null, lv.prop || null, now());
    out.reviews++;
  };
  const done = new Set<string>();
  for (const k of await listAll(kv, "ai:")) {
    const rec = await json(k.name);
    const bid = rec?.result && rec.dl ? briefIds.get(rec.dl) : undefined;
    if (!bid) { out.skipped++; continue; }
    const key = k.name.slice(3);
    let who: string | null = null;
    if (key.startsWith("sq:")) {
      who = `s:${key.split(":")[2]}`;
      const map = (gid: string) => ghToDiscord.get(String(gid)) ?? String(gid);
      for (const m of rec.squad?.members || []) {
        const fb = await fbOf(rec.dl, String(m.gid));
        if (fb && rec.members?.[m.gid]) { rec.members[m.gid].comment = fb; out.comments++; }
        done.add(`${rec.dl}:${m.gid}`);
      }
      if (rec.squad) rec.squad = { ...rec.squad, sm: map(rec.squad.sm), members: (rec.squad.members || []).map((m: any) => ({ ...m, gid: map(m.gid) })) };
      if (Array.isArray(rec.contrib)) rec.contrib = rec.contrib.map((m: any) => ({ ...m, gid: map(m.gid) }));
      if (rec.members) rec.members = Object.fromEntries(Object.entries(rec.members).map(([gid, v]) => [map(gid), v]));
    } else if (ghToDiscord.has(key)) {
      who = `u:${ghToDiscord.get(key)}`;
      // the comment as the teacher last edited or copied it
      const fb = await fbOf(rec.dl, key);
      if (fb) { rec.result.feedback = fb; out.comments++; }
      done.add(`${rec.dl}:${key}`);
    }
    if (!who) { out.skipped++; continue; }
    rec.imported = "watcher";
    put(bid, who, rec);
  }
  for (const [k, e] of Object.entries(evals)) {
    const [dl, gid] = k.split(":");
    const bid = briefIds.get(dl), did = ghToDiscord.get(gid);
    if (!bid || !did || done.has(k) || !e || typeof e !== "object") continue;
    const co = e.co && typeof e.co === "object" ? e.co : {};
    const feedback = await fbOf(dl, gid);
    if (feedback) out.comments++;
    put(bid, `u:${did}`, {
      at: e.at || Date.now(), imported: "watcher-eval", repos: [], count: 0, checks: [],
      result: { resume: "Debrief imported from GitHub Watcher (the decisions and the comment; the analysis itself was not kept).", commits: [], forts: [], ameliorer: [], exigences: [],
        competences: Object.keys(co).map((code) => ({ code, avis: co[code] ? "validable" : "non_visible", raison: "Watcher" })), feedback },
      final: { co }, level: e.lv || e.plv ? { lvl: e.lv || "", prop: e.plv || "", by: "you" } : undefined,
    });
  }
  await flush();

  // 5. each student's post in the GitHub activity forum: the bot keeps posting in the same one
  for (const k of await listAll(kv, "thread:")) {
    const did = ghToDiscord.get(k.name.slice(7));
    const tid = did ? await kv.get(k.name) : null;
    if (!did || !/^\d{5,25}$/.test(String(tid ?? "").trim())) continue;
    w("UPDATE players SET gh_thread = COALESCE(gh_thread, ?) WHERE guild_id = ? AND discord_id = ?", String(tid).trim(), g.id, did);
    out.threads++;
  }

  // 6. GitHub activity (the Watcher keeps 15 days, each event's counts in its key's metadata), for the GitHub page and
  //    who pushed on time; then each student's first push of a brief, when it is older than that
  const first = new Map<string, number>();
  for (const k of await listAll(kv, "ev:")) {
    const m = k.metadata, [, , gid, ...rest] = String(k.name).split(":");
    const did = ghToDiscord.get(gid);
    if (!did || !m || !Number(m.t)) continue;
    const t = Math.floor(Number(m.t) / 1000), n = (x: unknown) => Math.max(0, Math.floor(Number(x) || 0));
    w(`INSERT OR IGNORE INTO gh_activity (guild_id, discord_id, delivery, day, t, repo, commits, real, tiny, flagged, bad, lines, prs, other) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      g.id, did, `w-${rest.join(":")}`.slice(0, 200), day(Number(m.t)), t, m.r ? String(m.r).slice(0, 120) : null, n(m.commits), n(m.real), n(m.tiny), n(m.flagged), n(m.bad), n(m.lines), n(m.prs), n(m.other));
    if (n(m.commits)) first.set(did, Math.min(first.get(did) ?? Infinity, t));
    out.activity++;
  }
  for (const k of await listAll(kv, "dl:")) {
    const [, dl, gid] = String(k.name).split(":");
    const did = ghToDiscord.get(gid);
    if (!did || !briefIds.has(dl)) continue;
    const at = Date.parse(String((await kv.get(k.name)) || ""));
    if (!at) continue;
    const t = Math.floor(at / 1000);
    if ((first.get(did) ?? Infinity) <= t) continue;   // already in the activity
    w(`INSERT OR IGNORE INTO gh_activity (guild_id, discord_id, delivery, day, t, repo, commits, real) VALUES (?, ?, ?, ?, ?, NULL, 1, 0)`, g.id, did, `wdl-${dl}`, day(at), t);
    out.pushes++;
  }

  // 7. the sprint reviews: the Watcher's sprint goes to the programme's sprint holding its start (yours stay)
  const sprints = ((await json("sprints")) || []) as any[];
  const dec = ((await json("sprintdec")) || {}) as Record<string, any>;
  for (const [k, v] of Object.entries(dec)) {
    const [sid, gid] = k.split(":");
    const sp = sprints.find((s) => s.id === sid), did = ghToDiscord.get(gid);
    const n = sp ? weekAt(p, String(sp.start || ""))?.sprint : null;
    if (!n || !did || !v) continue;
    w(`INSERT OR IGNORE INTO sprint_reviews (guild_id, program, sprint, discord_id, plevel, why, level, decision, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      g.id, p.id, n, did, v.plvl || null, v.why || null, v.lvl || null, v.r || null, v.note || null, now());
    out.sprints++;
  }

  // 8. hidden repos
  const hidden = ((await json("hidden_repos")) || []) as string[];
  if (hidden.length) {
    let cfg: any = {};
    try { cfg = JSON.parse((g as any).github || "{}") || {}; } catch { cfg = {}; }
    cfg.hidden = [...new Set([...(cfg.hidden || []), ...hidden.map((r) => r.toLowerCase())])];
    w("UPDATE guilds SET github = ? WHERE id = ?", JSON.stringify(cfg), g.id);
    out.hidden = hidden.length;
  }
  await flush();
  return out;
}

/** Remember that this class's Watcher data came in (the result, shown in Settings → GitHub & Watcher). */
export async function markWatcherImport(env: Env, guildId: string, mark: Record<string, unknown>) {
  const row = await one<{ github: string | null }>(env, "SELECT github FROM guilds WHERE id = ?", guildId);
  let cfg: any = {};
  try { cfg = JSON.parse(row?.github || "{}") || {}; } catch { cfg = {}; }
  cfg.watcherImport = mark;
  await run(env, "UPDATE guilds SET github = ? WHERE id = ?", JSON.stringify(cfg), guildId);
}
export function watcherImportOf(g: Pick<GuildRow, "github"> | null): any {
  try { return JSON.parse((g as any)?.github || "{}")?.watcherImport ?? null; } catch { return null; }
}

/**
 * `npm run setup` found an old GitHub Watcher and bound its storage as WATCHER_KV: the bot imports it by itself, once,
 * for the Discord server the Watcher was used on (or the only class). At most 3 tries; the teacher can run it again
 * from the dashboard. Runs alone in its minute (the import uses ~25 of the 50 database round trips allowed).
 */
export async function watcherAutoImport(env: Env): Promise<boolean> {
  const kv = env.WATCHER_KV;
  if (!kv) return false;
  let gid = String((await kv.get("guild_id").catch(() => null)) || "").trim().slice(0, 40);
  // the Watcher's server (a Discord id, or a class ClassBot already has), else the only class
  if (!/^\d{5,25}$/.test(gid) && !(gid && (await one(env, "SELECT 1 AS x FROM guilds WHERE id = ?", gid)))) {
    const gs = await all<{ id: string }>(env, "SELECT id FROM guilds");
    if (gs.length !== 1) return false;
    gid = gs[0].id;
  }
  const g = await getGuild(env, gid);
  const st = watcherImportOf(g);
  if (st?.at || (st?.tries ?? 0) >= 3) return false;
  await markWatcherImport(env, gid, { tries: (st?.tries ?? 0) + 1 });   // a failed try isn't repeated forever
  const out = await importWatcher(env, g, kv);
  await markWatcherImport(env, gid, { at: now(), by: "setup", ...out });
  return true;
}
