// One-time import from GitHub Watcher (its KV namespace bound to ClassBot as WATCHER_KV):
// GitHub links of the students, briefs (deadlines with their text, competencies, grid, squads), hand-ins and reviews.
// Safe to run again: what was already imported is skipped or updated.
import type { Env, GuildRow } from "./types.ts";
import { all, getPlayer, now, one, run } from "./db.ts";
import { briefFromText } from "./briefs.ts";
import { parseSkills } from "./review/engine.ts";
import { programOf } from "./program.ts";

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
    async list(o: { prefix?: string }) { return { keys: Object.keys(data).filter((k) => k.startsWith(o.prefix ?? "")).map((name) => ({ name })), list_complete: true, cursor: undefined }; },
  };
}

// ---- the Cloudflare API (a token with "Workers KV Storage: Read"), a few calls per request (Workers allow 50)
const CF = "https://api.cloudflare.com/client/v4";
const cfHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
export class WatcherError extends Error {}
const clean = (v: unknown, rx: RegExp) => { const s = String(v ?? "").trim(); if (!rx.test(s)) throw new WatcherError("Check the account ID, the namespace ID and the token."); return s; };
export async function watcherKeys(acc: string, ns: string, token: string): Promise<string[]> {
  const a = clean(acc, /^[a-f0-9]{32}$/i), n = clean(ns, /^[a-f0-9]{32}$/i), t = clean(token, /^[\w-]{20,}$/);
  const keys: string[] = [];
  let cursor = "";
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${CF}/accounts/${a}/storage/kv/namespaces/${n}/keys?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { headers: cfHeaders(t) });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.success) throw new WatcherError(`Cloudflare refused: ${j?.errors?.[0]?.message || r.status}. The token needs “Workers KV Storage: Read” on this account.`);
    keys.push(...(j.result ?? []).map((k: any) => String(k.name)));
    cursor = j.result_info?.cursor || "";
    if (!cursor) break;
  }
  // only what the import uses
  return keys.filter((k) => /^(inst:|sub:|subsq:|ai:|thread:)/.test(k) || ["names", "deadlines", "hidden_repos"].includes(k));
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

export async function importWatcher(env: Env, g: GuildRow, source: any = env.WATCHER_KV) {
  const kv = source;
  const out: Record<string, number> = { students: 0, briefs: 0, handins: 0, reviews: 0, hidden: 0, threads: 0 };
  // 1. links: GitHub account + installation, by Discord id
  const names = ((await kv.get("names", "json")) || {}) as Record<string, { n: string }>;
  const ghToDiscord = new Map<string, string>();
  for (const k of await listAll(kv, "inst:")) {
    const l = await kv.get(k.name, "json");
    if (!l?.discordId || !l?.githubId) continue;
    const inst = k.name.slice(5);
    await getPlayer(env, g.id, String(l.discordId), names[l.discordId]?.n ?? l.discordName ?? undefined);
    await run(env, "UPDATE players SET github_id = ?, github_login = ?, gh_inst = ?, gh_linked_at = COALESCE(gh_linked_at, ?) WHERE guild_id = ? AND discord_id = ?",
      String(l.githubId), String(l.login), inst, Math.floor((Date.parse(l.linkedAt || "") || Date.now()) / 1000), g.id, String(l.discordId));
    ghToDiscord.set(String(l.githubId), String(l.discordId));
    out.students++;
  }
  // 2. briefs
  const p = await programOf(env, g);
  const deadlines = ((await kv.get("deadlines", "json")) || []) as any[];
  const briefIds = new Map<string, number>();
  for (const d of deadlines) {
    const src = `watcher:${d.id}`;
    const start = Math.floor((Date.parse(d.createdAt) || Date.now()) / 1000), due = Math.floor((Date.parse(d.due) || Date.now()) / 1000);
    const data = briefFromText(String(d.brief || ""), String(d.name || "Brief"), parseSkills(d.skills || ""));
    data.modalities.start = new Date(start * 1000).toISOString().slice(0, 10);
    data.modalities.due = new Date(due * 1000).toISOString().slice(0, 10);
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
      const r = await run(env, `INSERT INTO briefs (guild_id, program, title, data, competencies, start_at, due_at, kind, squads, grid, repo_hint, sent, status, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, g.id, p.id, ...fields, src, now(), now());
      briefIds.set(d.id, Number(r.meta.last_row_id));
    }
    out.briefs++;
  }
  // 3. hand-ins
  for (const k of [...await listAll(kv, "sub:"), ...await listAll(kv, "subsq:")]) {
    const [kind, dl, who] = k.name.split(":");
    const bid = briefIds.get(dl);
    const h = await kv.get(k.name, "json");
    if (!bid || !h?.repo) continue;
    const w = kind === "subsq" ? `s:${who}` : ghToDiscord.has(who) ? `u:${ghToDiscord.get(who)}` : null;
    if (!w) continue;
    await run(env, `INSERT INTO brief_handins (brief_id, guild_id, who, repo, plan, at, by) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (brief_id, who) DO UPDATE SET repo = excluded.repo, plan = excluded.plan`, bid, g.id, w, h.repo, h.plan ?? null, Math.floor((Date.parse(h.at) || Date.now()) / 1000), h.by ?? "student");
    out.handins++;
  }
  // 4. reviews (the debriefs in progress keep the teacher's switches, challenge and comment)
  for (const k of await listAll(kv, "ai:")) {
    const rec = await kv.get(k.name, "json");
    if (!rec?.result || !rec.dl) continue;
    const bid = briefIds.get(rec.dl);
    if (!bid) continue;
    const key = k.name.slice(3);
    let who: string | null = null;
    if (key.startsWith("sq:")) {
      who = `s:${key.split(":")[2]}`;
      const map = (gid: string) => ghToDiscord.get(String(gid)) ?? String(gid);
      if (rec.squad) rec.squad = { ...rec.squad, sm: map(rec.squad.sm), members: (rec.squad.members || []).map((m: any) => ({ ...m, gid: map(m.gid) })) };
      if (Array.isArray(rec.contrib)) rec.contrib = rec.contrib.map((m: any) => ({ ...m, gid: map(m.gid) }));
      if (rec.members) rec.members = Object.fromEntries(Object.entries(rec.members).map(([gid, v]) => [map(gid), v]));
    } else if (ghToDiscord.has(key)) who = `u:${ghToDiscord.get(key)}`;
    if (!who) continue;
    await run(env, `INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, updated_at) VALUES (?, ?, ?, ?, 'draft', ?)
      ON CONFLICT (brief_id, who) DO UPDATE SET record = excluded.record, updated_at = excluded.updated_at`, bid, g.id, who, JSON.stringify(rec), now());
    out.reviews++;
  }
  // 5. each student's post in the GitHub activity forum: the bot keeps posting in the same one
  for (const k of await listAll(kv, "thread:")) {
    const tid = await kv.get(k.name);
    const did = ghToDiscord.get(k.name.slice(7));
    if (!did || !/^\d{5,25}$/.test(String(tid ?? "").trim())) continue;
    await run(env, "UPDATE players SET gh_thread = ? WHERE guild_id = ? AND discord_id = ?", String(tid).trim(), g.id, did);
    out.threads = (out.threads ?? 0) + 1;
  }
  // 6. hidden repos
  const hidden = ((await kv.get("hidden_repos", "json")) || []) as string[];
  if (hidden.length) {
    let cfg: any = {};
    try { cfg = JSON.parse((g as any).github || "{}") || {}; } catch { cfg = {}; }
    cfg.hidden = [...new Set([...(cfg.hidden || []), ...hidden.map((r) => r.toLowerCase())])];
    await run(env, "UPDATE guilds SET github = ? WHERE id = ?", JSON.stringify(cfg), g.id);
    out.hidden = hidden.length;
  }
  return out;
}
