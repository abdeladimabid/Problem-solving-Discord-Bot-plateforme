// Shared library: the teachers of one programme (e.g. every A1 class, each on its own ClassBot) share the same
// Activités (week overviews, veilles, live codings), assessments, live quizzes and class games content (SQL cases,
// Code Relay challenges, Battle Royale question sets). One ClassBot hosts the library; the others join with its link.
// One shared copy: whoever edits, everyone gets the new version (last edit wins; each item has a version number).
// Only teachers' content travels: never a student's name, answer, paper or grade.
import { intranetTrainer } from "./intranet.ts";
import type { Env, GuildRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";

export class LibraryError extends Error {}
const fail = (m: string): never => { throw new LibraryError(m); };
export const LIB_KINDS = ["activity", "assessment", "quiz", "case", "task", "royale"] as const;
export type LibKind = (typeof LIB_KINDS)[number];
export interface LibItem { kind: string; key: string; title: string | null; data: any; version: number; by: string | null; author?: string | null; updated_at: number; deleted: number }

const base = (env: Env) => (env.PUBLIC_URL || "").replace(/\/$/, "");
const LINK_RX = /^(https?:\/\/[^\s]+?)\/library\/([a-f0-9]{12})\.([A-Za-z0-9_-]{32})\/?$/;
const rnd = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"[b % 64]).join("");
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
export const newKey = () => hex(8);
const parse = (s: string | null | undefined, d: any = null) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
/** A stable key for content shared as it is (a SQL case, a relay challenge…): the same content gets the same key. */
export async function contentKey(v: unknown): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(v)));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// =============================================================== the hub (the ClassBot that hosts a library)
async function team(env: Env, id: string, secret: string) {
  const t = await one<{ id: string; name: string; secret: string }>(env, "SELECT id, name, secret FROM library_teams WHERE id = ?", id);
  return t && t.secret === secret ? t : null;
}
/** What changed since a moment (everything with since = 0). */
export async function hubRead(env: Env, id: string, secret: string, since: number) {
  const t = await team(env, id, secret);
  if (!t) return null;
  const rows = await all<any>(env, "SELECT kind, key, title, data, version, by, author, updated_at, deleted FROM library_items WHERE team = ? AND updated_at >= ? ORDER BY updated_at, kind, key LIMIT 1000", t.id, Math.max(0, since || 0));
  return { kind: "classbot-library", v: 1, name: t.name, at: now(), more: rows.length === 1000, items: rows.map((r) => ({ ...r, data: parse(r.data) })) as LibItem[] };
}
/** New versions from a class (last edit wins). */
export async function hubWrite(env: Env, id: string, secret: string, items: any[], by: string, author: string | null = null) {
  const t = await team(env, id, secret);
  if (!t) return null;
  const out: { kind: string; key: string; version: number; updated_at: number }[] = [];
  for (const it of (Array.isArray(items) ? items : []).slice(0, 40)) {
    const kind = String(it?.kind || ""), key = String(it?.key || "").slice(0, 60);
    if (!LIB_KINDS.includes(kind as LibKind) || !key) continue;
    const data = it.deleted ? null : JSON.stringify(it.data ?? null);
    if (data && data.length > 300_000) continue;
    const at = now();
    // the author is whoever made it first: later edits never change it
    await run(env, `INSERT INTO library_items (team, kind, key, title, data, version, by, author, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT (team, kind, key) DO UPDATE SET title = excluded.title, data = COALESCE(excluded.data, library_items.data), version = library_items.version + 1,
        by = excluded.by, author = COALESCE(library_items.author, excluded.author), updated_at = excluded.updated_at, deleted = excluded.deleted`,
      t.id, kind, key, String(it.title ?? "").slice(0, 200) || null, data, String(by || "").slice(0, 80) || null, String(author || "").slice(0, 120) || null, at, it.deleted ? 1 : 0);
    const r = await one<{ version: number; updated_at: number }>(env, "SELECT version, updated_at FROM library_items WHERE team = ? AND kind = ? AND key = ?", t.id, kind, key);
    out.push({ kind, key, version: r!.version, updated_at: r!.updated_at });
  }
  return { items: out };
}
/** /library/<id>.<secret> on the bot's address: GET (read), POST (write). Other ClassBots call it. */
export async function libraryRoute(request: Request, env: Env, id: string, secret: string): Promise<Response> {
  const cors = { "cache-control": "no-store" };
  if (request.method === "POST") {
    let b: any = {};
    try { b = await request.json(); } catch { /* empty */ }
    const r = await hubWrite(env, id, secret, b.items, b.by, b.author ?? null);
    return Response.json(r ?? { error: "This library link doesn't work anymore." }, { status: r ? 200 : 404, headers: cors });
  }
  const r = await hubRead(env, id, secret, Number(new URL(request.url).searchParams.get("since")) || 0);
  return Response.json(r ?? { error: "This library link doesn't work anymore." }, { status: r ? 200 : 404, headers: cors });
}

// =============================================================== a class's side
export interface LibCfg { link: string; name: string; cursor: number; synced: number; error?: string | null }
export async function libCfg(env: Env, gid: string): Promise<LibCfg | null> {
  const r = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", `lib:${gid}`).catch(() => null);
  const v = parse(r?.v);
  return v?.link ? v : null;
}
const saveCfg = (env: Env, gid: string, c: LibCfg | null) => c
  ? run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", `lib:${gid}`, JSON.stringify(c), now())
  : run(env, "DELETE FROM app_settings WHERE k = ?", `lib:${gid}`);

/** Talk to the hub: this ClassBot directly, another one through the internet. */
async function call(env: Env, link: string, body?: unknown, since = 0): Promise<any> {
  const m = link.match(LINK_RX);
  if (!m) fail("This isn't a library link. It looks like https://…/library/1a2b3c4d5e6f.Ab3…");
  if (base(env) && m![1] === base(env)) {
    const r = body ? await hubWrite(env, m![2], m![3], (body as any).items, (body as any).by, (body as any).author ?? null) : await hubRead(env, m![2], m![3], since);
    if (!r) fail("This library link doesn't work anymore (the library was deleted).");
    return r;
  }
  if (!link.startsWith("https://")) fail("The link must start with https://");
  let res: Response;
  try {
    res = await fetch(body ? link : `${link}?since=${since}`, {
      method: body ? "POST" : "GET", headers: { "content-type": "application/json", accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
    });
  } catch { return fail("The ClassBot that hosts the library didn't answer. Try again in a minute."); }
  if (res.status === 404) fail("This library link doesn't work anymore (the library was deleted).");
  if (!res.ok) fail("The ClassBot that hosts the library didn't answer. Try again in a minute.");
  const j = await res.json().catch(() => null);
  if (!j || (!body && j.kind !== "classbot-library")) fail("This isn't a library link.");
  return j;
}

/** A new library hosted on this ClassBot; this class joins it. */
export async function createLibrary(env: Env, g: GuildRow, name: string) {
  if (!base(env)) fail("The bot's address (PUBLIC_URL) isn't set: run npm run setup first.");
  const clean = String(name || "").trim().slice(0, 60) || "Shared library";
  const id = hex(6), secret = rnd(32);
  await run(env, "INSERT INTO library_teams (id, name, secret, created_at) VALUES (?, ?, ?, ?)", id, clean, secret, now());
  return joinLibrary(env, g, `${base(env)}/library/${id}.${secret}`);
}
/** Join with a link: what the library has comes here; then what this class already has goes there. */
export async function joinLibrary(env: Env, g: GuildRow, link: string) {
  const l = String(link || "").trim().replace(/\/$/, "");
  const first = await call(env, l, undefined, 0);
  await saveCfg(env, g.id, { link: l, name: String(first.name || "Shared library"), cursor: 0, synced: 0 });
  await run(env, "DELETE FROM library_cache WHERE guild_id = ?", g.id);
  await syncLibrary(env, g, { force: true, shareAll: true });
  return libStatus(env, g);
}
export async function leaveLibrary(env: Env, g: GuildRow) {
  await saveCfg(env, g.id, null);
  await run(env, "DELETE FROM library_cache WHERE guild_id = ?", g.id);
  await run(env, "DELETE FROM library_outbox WHERE guild_id = ?", g.id);
  // the local copies stay this class's own
  await run(env, "UPDATE activities SET lib_v = NULL, lib_at = NULL WHERE guild_id = ?", g.id);
  await run(env, "UPDATE assessments SET lib_key = NULL, lib_v = NULL WHERE guild_id = ?", g.id);
  return libStatus(env, g);
}

export async function libStatus(env: Env, g: GuildRow) {
  const c = await libCfg(env, g.id);
  if (!c) return { connected: false as const };
  const counts = await all<{ kind: string; n: number }>(env, "SELECT kind, COUNT(*) AS n FROM library_cache WHERE guild_id = ? AND deleted = 0 GROUP BY kind", g.id);
  const recent = await all<{ kind: string; title: string | null; by: string | null; updated_at: number }>(env,
    "SELECT kind, title, by, updated_at FROM library_cache WHERE guild_id = ? AND deleted = 0 ORDER BY updated_at DESC LIMIT 8", g.id);
  const m = c.link.match(LINK_RX);
  return { connected: true as const, name: c.name, link: c.link, host: m ? m[1] : "", hostedHere: !!m && m[1] === base(env), synced: c.synced, error: c.error ?? null,
    counts: Object.fromEntries(counts.map((r) => [r.kind, r.n])), recent };
}

// ---------------------------------------------------------------- push: what this class wrote
const activityData = (r: any) => ({ program: r.program, week: r.week, title: r.title, data: parse(r.data), md: r.md, warnings: parse(r.warnings, []), edited: r.edited, model: r.model });
const assessmentData = (a: any) => {
  const st = parse(a.settings, {}) || {};
  delete st.target;   // the students it's for: this class only
  return { title: a.title, settings: st, questions: parse(a.questions, []) };
};
/** An activity removed here: removed for everyone (unless another class already has presenters on it). */
export async function libGone(env: Env, gid: string, kind: "activity", key: string) {
  if (!(await libCfg(env, gid))) return;
  await run(env, "INSERT INTO library_outbox (guild_id, kind, key, at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, kind, key) DO UPDATE SET at = excluded.at", gid, kind, key, now());
}
/** An assessment changed here (or removed: deleted = true). */
export async function libAssessment(env: Env, g: GuildRow, id: number, deleted = false) {
  const c = await libCfg(env, g.id);
  if (!c) return;
  const a = await one<any>(env, "SELECT * FROM assessments WHERE id = ? AND guild_id = ?", id, g.id);
  if (!a) return;
  let key = a.lib_key as string | null;
  if (!key) { key = newKey(); await run(env, "UPDATE assessments SET lib_key = ? WHERE id = ?", key, id); }
  await send(env, g, c, [{ kind: "assessment", key, title: a.title, data: deleted ? null : assessmentData(a), deleted }]).catch((e) => note(env, g, c, e));
}
/** A template shared as it is: a live quiz, a SQL case, a relay challenge, a Battle Royale question set. */
export async function libTemplate(env: Env, g: GuildRow, kind: "quiz" | "case" | "task" | "royale", title: string, data: unknown) {
  const c = await libCfg(env, g.id);
  if (!c) return;
  const key = await contentKey({ kind, data });
  if (await one(env, "SELECT 1 AS x FROM library_cache WHERE guild_id = ? AND kind = ? AND key = ? AND deleted = 0", g.id, kind, key)) return;
  await send(env, g, c, [{ kind, key, title, data }]).catch((e) => note(env, g, c, e));
}
/** Take a template out of the library (for everyone). */
export async function libRemoveTemplate(env: Env, g: GuildRow, kind: string, key: string) {
  const c = (await libCfg(env, g.id)) ?? fail("This class isn't in a shared library.");
  const r = await one<{ title: string | null }>(env, "SELECT title FROM library_cache WHERE guild_id = ? AND kind = ? AND key = ?", g.id, kind, key);
  if (!r) fail("Not found in the library.");
  await send(env, g, c, [{ kind, key, title: r!.title, data: null, deleted: true }]);
}
async function note(env: Env, g: GuildRow, c: LibCfg, e: unknown) {
  console.warn("library", g.id, e);
  await saveCfg(env, g.id, { ...c, error: String((e as Error)?.message || e).slice(0, 200) });
}
/** The teacher's name for what this class makes: their intranet name when connected, else their Discord name. */
async function authorOf(env: Env, g: GuildRow): Promise<string | null> {
  const t = await intranetTrainer(env, g.id).catch(() => null);
  if (t?.name) return t.name.slice(0, 120);
  const p = g.teacher_id ? await one<{ name: string | null }>(env, "SELECT name FROM players WHERE guild_id = ? AND discord_id = ?", g.id, g.teacher_id) : null;
  return p?.name ? p.name.slice(0, 120) : null;
}
/** Send items to the hub and keep the versions it gives back. */
async function send(env: Env, g: GuildRow, c: LibCfg, items: { kind: string; key: string; title: string | null; data: any; deleted?: boolean }[]) {
  for (let i = 0; i < items.length; i += 20) {
    const part = items.slice(i, i + 20);
    const author = await authorOf(env, g);
    const r = await call(env, c.link, { items: part, by: g.name || "A class", author });
    for (const v of r.items || []) {
      const it = part.find((x) => x.kind === v.kind && x.key === v.key)!;
      await run(env, `INSERT INTO library_cache (guild_id, kind, key, title, data, version, by, author, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (guild_id, kind, key) DO UPDATE SET title = excluded.title, data = COALESCE(excluded.data, library_cache.data), version = excluded.version, by = excluded.by,
          author = COALESCE(library_cache.author, excluded.author), updated_at = excluded.updated_at, deleted = excluded.deleted`,
        g.id, v.kind, v.key, it.title, it.deleted ? null : JSON.stringify(it.data), v.version, g.name || null, author, v.updated_at, it.deleted ? 1 : 0);
      if (v.kind === "activity") await run(env, "UPDATE activities SET lib_v = ?, lib_at = COALESCE(updated_at, created_at, 1) WHERE guild_id = ? AND day || ':' || kind = ?", v.version, g.id, v.key);
      if (v.kind === "assessment") await run(env, "UPDATE assessments SET lib_v = ? WHERE guild_id = ? AND lib_key = ?", v.version, g.id, v.key);
    }
  }
}
/** Everything changed here since the last time: activities (and deletions), then the assessments never shared. */
async function pushPending(env: Env, g: GuildRow, c: LibCfg, shareAll: boolean) {
  const acts = await all<any>(env, "SELECT * FROM activities WHERE guild_id = ? AND lib_at IS NULL ORDER BY day LIMIT 300", g.id);
  const gone = await all<{ kind: string; key: string }>(env, "SELECT kind, key FROM library_outbox WHERE guild_id = ?", g.id);
  const items = [
    ...acts.map((r) => ({ kind: "activity", key: `${r.day}:${r.kind}`, title: r.title, data: activityData(r) })),
    ...gone.filter((x) => !acts.some((r) => `${r.day}:${r.kind}` === x.key)).map((x) => ({ kind: x.kind, key: x.key, title: null, data: null, deleted: true })),
  ];
  if (shareAll) {
    for (const a of await all<any>(env, "SELECT * FROM assessments WHERE guild_id = ? AND lib_key IS NULL ORDER BY id LIMIT 60", g.id)) {
      const key = newKey();
      await run(env, "UPDATE assessments SET lib_key = ? WHERE id = ?", key, a.id);
      items.push({ kind: "assessment", key, title: a.title, data: assessmentData(a) });
    }
  }
  if (items.length) await send(env, g, c, items);
  if (gone.length) await run(env, "DELETE FROM library_outbox WHERE guild_id = ?", g.id);
}

// ---------------------------------------------------------------- pull: what the others wrote
/** Send what changed here, then take what changed there (at most every 20 s unless forced). Never throws when
 *  not forced: a library that doesn't answer just waits for the next time. */
export async function syncLibrary(env: Env, g: GuildRow, o: { force?: boolean; shareAll?: boolean; pushOnly?: boolean } = {}) {
  const c = await libCfg(env, g.id);
  if (!c) return null;
  if (o.pushOnly) { try { await pushPending(env, g, c, false); } catch (e) { await note(env, g, c, e); } return null; }
  if (!o.force && now() - (c.synced || 0) < 20) return null;
  try {
    // joining: the library's versions win, then what only this class has goes there
    if (!o.shareAll) await pushPending(env, g, c, false);
    let cursor = c.cursor || 0, changed = 0;
    for (let page = 0; page < 10; page++) {
      const r = await call(env, c.link, undefined, cursor);
      for (const it of r.items as LibItem[]) {
        cursor = Math.max(cursor, it.updated_at);
        const cur = await one<{ version: number }>(env, "SELECT version FROM library_cache WHERE guild_id = ? AND kind = ? AND key = ?", g.id, it.kind, it.key);
        if (cur && cur.version >= it.version) continue;
        await run(env, `INSERT INTO library_cache (guild_id, kind, key, title, data, version, by, author, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (guild_id, kind, key) DO UPDATE SET title = excluded.title, data = excluded.data, version = excluded.version, by = excluded.by,
            author = COALESCE(excluded.author, library_cache.author), updated_at = excluded.updated_at, deleted = excluded.deleted`,
          g.id, it.kind, it.key, it.title, it.data == null ? null : JSON.stringify(it.data), it.version, it.by, it.author ?? null, it.updated_at, it.deleted);
        await apply(env, g, it);
        changed++;
      }
      if (!r.more) break;
    }
    if (o.shareAll) await pushPending(env, g, (await libCfg(env, g.id))!, true);
    await saveCfg(env, g.id, { ...c, cursor, synced: now(), error: null });
    return { changed };
  } catch (e) {
    await note(env, g, { ...c, synced: now() }, e);
    if (o.force) throw e;
    return null;
  }
}

/** A new version from the library, into this class. */
async function apply(env: Env, g: GuildRow, it: LibItem) {
  if (it.kind === "activity") {
    const [day, kind] = it.key.split(":");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !["week", "veille", "live", "workshop"].includes(kind)) return;
    const local = await one<{ id: number; lib_v: number | null }>(env, "SELECT id, lib_v FROM activities WHERE guild_id = ? AND day = ? AND kind = ?", g.id, day, kind);
    if (it.deleted) {
      if (!local) return;
      // students of this class already present it: it stays here
      const busy = await one(env, "SELECT 1 AS x FROM activity_claims WHERE activity_id = ? AND status IN ('approved', 'done')", local.id).catch(() => null);
      if (busy) { await run(env, "UPDATE activities SET lib_v = NULL, lib_at = NULL WHERE id = ?", local.id); return; }
      await run(env, "DELETE FROM activities WHERE id = ?", local.id);
      await run(env, "DELETE FROM activity_slots WHERE activity_id = ?", local.id).catch(() => {});
      await run(env, "UPDATE activity_claims SET status = 'cancelled' WHERE activity_id = ? AND status = 'pending'", local.id).catch(() => {});
      return;
    }
    if (local && (local.lib_v ?? 0) >= it.version) return;
    // 11:00 is a live coding OR a workshop: the library's one replaces the other kind here, unless students already present it
    if (kind === "live" || kind === "workshop") {
      const other = await one<{ id: number }>(env, "SELECT id FROM activities WHERE guild_id = ? AND day = ? AND kind = ?", g.id, day, kind === "live" ? "workshop" : "live");
      if (other) {
        const busy = await one(env, "SELECT 1 AS x FROM activity_claims WHERE activity_id = ? AND status IN ('approved', 'done')", other.id).catch(() => null);
        if (busy) return;
        await run(env, "DELETE FROM activities WHERE id = ?", other.id);
        await run(env, "DELETE FROM activity_slots WHERE activity_id = ?", other.id).catch(() => {});
        await run(env, "UPDATE activity_claims SET status = 'cancelled' WHERE activity_id = ? AND status = 'pending'", other.id).catch(() => {});
      }
    }
    const d = it.data || {};
    const t = now();
    await run(env, `INSERT INTO activities (guild_id, program, day, kind, week, title, data, md, warnings, edited, model, created_at, updated_at, lib_v, lib_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (guild_id, day, kind) DO UPDATE SET program = excluded.program, week = excluded.week, title = excluded.title, data = excluded.data, md = excluded.md,
        warnings = excluded.warnings, edited = excluded.edited, model = excluded.model, updated_at = excluded.updated_at, lib_v = excluded.lib_v, lib_at = excluded.lib_at`,
      g.id, d.program ?? null, day, kind, d.week ?? null, d.title ?? it.title, JSON.stringify(d.data ?? null), String(d.md ?? ""), JSON.stringify(d.warnings ?? []), d.edited ? 1 : 0, d.model ?? null, t, t, it.version, t);
    return;
  }
  if (it.kind === "assessment") {
    const local = await one<any>(env, "SELECT * FROM assessments WHERE guild_id = ? AND lib_key = ?", g.id, it.key);
    const taken = local ? await one(env, "SELECT 1 AS x FROM assessment_takers WHERE assessment_id = ? LIMIT 1", local.id) : null;
    if (it.deleted) {
      if (!local) return;
      if (taken) await run(env, "UPDATE assessments SET lib_key = NULL, lib_v = NULL WHERE id = ?", local.id);   // its papers stay here
      else await run(env, "DELETE FROM assessments WHERE id = ?", local.id);
      return;
    }
    const d = it.data || {};
    const qs = Array.isArray(d.questions) ? d.questions : [];
    if (local) {
      if ((local.lib_v ?? 0) >= it.version) return;
      const st = { ...(parse(d.settings && JSON.stringify(d.settings), {}) || {}), target: (parse(local.settings, {}) || {}).target };
      // students already have it: the questions can be fixed, not added or removed
      const same = parse(local.questions, []).map((q: any) => q.id).sort().join(",") === qs.map((q: any) => q.id).sort().join(",");
      if (local.status !== "draft" && taken && !same) {
        await run(env, "UPDATE assessments SET title = ?, settings = ?, lib_v = ? WHERE id = ?", String(d.title || it.title || local.title), JSON.stringify(st), it.version, local.id);
        return;
      }
      await run(env, "UPDATE assessments SET title = ?, questions = ?, settings = ?, lib_v = ? WHERE id = ?", String(d.title || it.title || local.title), JSON.stringify(qs), JSON.stringify(st), it.version, local.id);
      return;
    }
    await run(env, "INSERT INTO assessments (guild_id, title, brief_id, status, settings, questions, created_at, lib_key, lib_v) VALUES (?, ?, NULL, 'draft', ?, ?, ?, ?, ?)",
      g.id, String(d.title || it.title || "Assessment").slice(0, 120), JSON.stringify(d.settings || {}), JSON.stringify(qs), now(), it.key, it.version);
  }
  // quizzes, cases, relay challenges, question sets: read from the cache when the teacher picks one
}

/** The templates of a kind (newest first). */
export async function libTemplates(env: Env, gid: string, kind: string) {
  const rows = await all<{ key: string; title: string | null; data: string | null; by: string | null; updated_at: number }>(env,
    "SELECT key, title, data, by, updated_at FROM library_cache WHERE guild_id = ? AND kind = ? AND deleted = 0 ORDER BY updated_at DESC LIMIT 100", gid, kind).catch(() => []);
  return rows.map((r) => ({ key: r.key, title: r.title, by: r.by, at: r.updated_at, data: parse(r.data) }));
}
