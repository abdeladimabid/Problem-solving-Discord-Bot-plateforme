// VS Code activity in D1: the learners' keys and consent, the heartbeats of each day, and what the dashboard reads.
// The rules (time, writing, privacy) are in vscode.ts; the endpoint the WakaTime extension calls is bot/wakatime.ts.
//   • one row per learner and day: each request re-reads the day, adds its heartbeats and recomputes it (1 row written)
//   • the raw heartbeats are cleared after the class's retention days; the day's totals stay
import type { Env, GuildRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { currentSquads } from "./squads.ts";
import { cleanSquads } from "./review/debrief.ts";
import {
  type Commit, type DayAgg, type Hb, type VscSettings,
  addDays, computeDay, dayClock, dayOf, emptyAgg, hashKey, mergeHeartbeats, mergeSettings, mondayOf, newKey, packRaw, sameProject, signals, sumDays, unpackRaw, vscSettings,
} from "./vscode.ts";

export class VscError extends Error {}
/** The learner "Run checks" (Settings) uses: never a student, deleted right after. */
export const DIAG_ID = "vscode-check";

export interface Learner {
  guild_id: string; discord_id: string; key_hash: string | null; key_hint: string | null; consent_at: number | null; consent_v: number | null;
  paused: number; hide_files: number; first_seen: number | null; created_at: number; updated_at: number;
}

// --------------------------------------------------------------- settings
export const settingsOf = async (env: Env, gid: string) => vscSettings((await one<{ vscode: string | null }>(env, "SELECT vscode FROM guilds WHERE id = ?", gid))?.vscode);
export async function saveSettings(env: Env, g: GuildRow, body: any): Promise<VscSettings> {
  const next = mergeSettings(vscSettings(g.vscode), body ?? {});
  await run(env, "UPDATE guilds SET vscode = ? WHERE id = ?", JSON.stringify(next), g.id);
  return next;
}

// ---------------------------------------------------------------- learners
export const learnerOf = (env: Env, gid: string, uid: string) => one<Learner>(env, "SELECT * FROM vsc_learners WHERE guild_id = ? AND discord_id = ?", gid, uid);

/** The learner said yes: a new key (an older one stops working right away), returned once, never stored in clear. */
export async function acceptConsent(env: Env, gid: string, uid: string, version: number): Promise<string> {
  const key = newKey(), h = await hashKey(key), t = now();
  await run(env, `INSERT INTO vsc_learners (guild_id, discord_id, key_hash, key_hint, consent_at, consent_v, paused, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT (guild_id, discord_id) DO UPDATE SET key_hash = excluded.key_hash, key_hint = excluded.key_hint, consent_at = excluded.consent_at, consent_v = excluded.consent_v, paused = 0, updated_at = excluded.updated_at`,
  gid, uid, h, key.slice(-4), t, version, t, t);
  return key;
}
/** /vscode newkey: the old key gets 401 from now on. Null when they never said yes. */
export async function renewKey(env: Env, gid: string, uid: string): Promise<string | null> {
  const l = await learnerOf(env, gid, uid);
  if (!l?.consent_at) return null;
  const key = newKey();
  await run(env, "UPDATE vsc_learners SET key_hash = ?, key_hint = ?, updated_at = ? WHERE guild_id = ? AND discord_id = ?", await hashKey(key), key.slice(-4), now(), gid, uid);
  return key;
}
export async function setPaused(env: Env, gid: string, uid: string, paused: boolean): Promise<boolean> {
  const r = await run(env, "UPDATE vsc_learners SET paused = ?, updated_at = ? WHERE guild_id = ? AND discord_id = ? AND consent_at IS NOT NULL", paused ? 1 : 0, now(), gid, uid);
  return !!r.meta?.changes;
}
/** /vscode delete: every day, the key and the consent. Returns how many days were deleted. */
export async function deleteLearner(env: Env, gid: string, uid: string): Promise<number> {
  const n = (await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM vsc_days WHERE guild_id = ? AND discord_id = ?", gid, uid))?.n ?? 0;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM vsc_days WHERE guild_id = ? AND discord_id = ?").bind(gid, uid),
    env.DB.prepare("DELETE FROM vsc_learners WHERE guild_id = ? AND discord_id = ?").bind(gid, uid),
  ]);
  return n;
}
export async function learnerByKey(env: Env, key: string) {
  return one<Learner & { vscode: string | null; lang: string }>(env,
    "SELECT l.*, g.vscode, g.lang FROM vsc_learners l JOIN guilds g ON g.id = l.guild_id WHERE l.key_hash = ? AND l.consent_at IS NOT NULL", await hashKey(key));
}

// --------------------------------------------------------------- ingestion
interface DayRow { day: string; raw: string | null; agg: string | null; rev: number; n: number; first_t: number | null; last_t: number | null }
export const parseAgg = (s: string | null | undefined): DayAgg => {
  try { return { ...emptyAgg(), ...(JSON.parse(s || "{}") || {}) }; } catch { return emptyAgg(); }
};
export interface Who { gid: string; uid: string; settings: VscSettings }

/** Heartbeats already checked (vscode.ts checkHeartbeat), grouped by day. Returns how many were new. */
export async function ingest(env: Env, who: Who, hbs: Hb[]): Promise<number> {
  const byDay = new Map<string, Hb[]>();
  for (const h of hbs) {
    const d = dayOf(h.t);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(h);
  }
  let added = 0;
  for (const day of [...byDay.keys()].sort().slice(0, 4)) added += await writeDay(env, who, day, byDay.get(day)!);
  if (added) await run(env, "UPDATE vsc_learners SET first_seen = ? WHERE guild_id = ? AND discord_id = ? AND first_seen IS NULL", now(), who.gid, who.uid);
  return added;
}

async function saveDay(env: Env, who: Who, day: string, agg: DayAgg, raw: string, rev: number | null): Promise<boolean> {
  const cols = [agg.active, agg.write, agg.first, agg.last, agg.n, agg.ai, agg.hu, JSON.stringify(agg), raw];
  if (rev === null) {
    const r = await run(env, `INSERT INTO vsc_days (guild_id, discord_id, day, active_s, write_s, first_t, last_t, n, ai_lines, human_lines, agg, raw, rev, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT (guild_id, discord_id, day) DO NOTHING`, who.gid, who.uid, day, ...cols, now());
    return !!r.meta?.changes;
  }
  const r = await run(env, `UPDATE vsc_days SET active_s = ?, write_s = ?, first_t = ?, last_t = ?, n = ?, ai_lines = ?, human_lines = ?, agg = ?, raw = ?, rev = rev + 1, updated_at = ?
    WHERE guild_id = ? AND discord_id = ? AND day = ? AND rev = ?`, ...cols, now(), who.gid, who.uid, day, rev);
  return !!r.meta?.changes;
}

async function writeDay(env: Env, who: Who, day: string, add: Hb[]): Promise<number> {
  const clk = dayClock(day), limit = who.settings.idle * 60, o = { idle: who.settings.idle, window: who.settings.window };
  const before = addDays(day, -1), after = addDays(day, 1);
  for (let attempt = 0; attempt < 3; attempt++) {
    const rows = await all<DayRow>(env, "SELECT day, raw, agg, rev, n, first_t, last_t FROM vsc_days WHERE guild_id = ? AND discord_id = ? AND day IN (?, ?, ?)", who.gid, who.uid, before, day, after);
    const cur = rows.find((r) => r.day === day), prevR = rows.find((r) => r.day === before), nextR = rows.find((r) => r.day === after);
    if (cur && !cur.raw && cur.n > 0) return 0;   // past the retention days: that day's totals are final
    const { list, added } = mergeHeartbeats(unpackRaw(cur?.raw, clk.start), add);
    if (!added) return 0;
    const nextAgg = nextR ? parseAgg(nextR.agg) : null;
    const agg = computeDay(list, clk, { ...o, prev: prevR?.last_t != null ? { t: prevR.last_t } : null, next: nextAgg?.head ?? null });
    if (!(await saveDay(env, who, day, agg, packRaw(list, clk.start), cur?.rev ?? null))) continue;   // written meanwhile: read again
    // a session across midnight: the day before ends on today's first heartbeat, the day after starts from today's last
    if (prevR?.raw && prevR.last_t != null && (prevR.last_t >= clk.start - limit - 1 || parseAgg(prevR.agg).edge.next)) {
      const pc = dayClock(before), pa = parseAgg(prevR.agg);
      const re = computeDay(unpackRaw(prevR.raw, pc.start), pc, { ...o, prev: pa.edge.prev, next: agg.head });
      if (JSON.stringify(re.edge.next) !== JSON.stringify(pa.edge.next)) await saveDay(env, who, before, re, prevR.raw, prevR.rev);
    }
    if (nextR?.raw && nextAgg?.head && agg.last != null && (nextAgg.head.t <= clk.end + limit + 1 || nextAgg.edge.prev)) {
      const nc = dayClock(after);
      const re = computeDay(unpackRaw(nextR.raw, nc.start), nc, { ...o, prev: { t: agg.last }, next: nextAgg.edge.next });
      if (JSON.stringify(re.edge.prev) !== JSON.stringify(nextAgg.edge.prev)) await saveDay(env, who, after, re, nextR.raw, nextR.rev);
    }
    return added;
  }
  throw new VscError("busy: try again");   // → 500: wakatime-cli keeps the heartbeats and sends them again
}

/** Today's totals of a learner (the status bar). */
export async function todayOf(env: Env, gid: string, uid: string) {
  return (await one<{ active_s: number; write_s: number }>(env, "SELECT active_s, write_s FROM vsc_days WHERE guild_id = ? AND discord_id = ? AND day = ?", gid, uid, dayOf(now()))) ?? { active_s: 0, write_s: 0 };
}
/** /vscode status: connected, the last heartbeat, today and this week. */
export async function learnerStatus(env: Env, gid: string, uid: string) {
  const l = await learnerOf(env, gid, uid);
  const today = dayOf(now()), mon = mondayOf(today);
  const days = await all<{ day: string; active_s: number; write_s: number; last_t: number | null }>(env,
    "SELECT day, active_s, write_s, last_t FROM vsc_days WHERE guild_id = ? AND discord_id = ? AND day >= ? AND day <= ?", gid, uid, mon, today);
  const last = (await one<{ t: number | null }>(env, "SELECT MAX(last_t) AS t FROM vsc_days WHERE guild_id = ? AND discord_id = ?", gid, uid))?.t ?? null;
  const td = days.find((d) => d.day === today);
  return {
    learner: l, last,
    today: { active: td?.active_s ?? 0, write: td?.write_s ?? 0 },
    week: { active: days.reduce((s, d) => s + d.active_s, 0), write: days.reduce((s, d) => s + d.write_s, 0) },
  };
}

/** Each night: the raw heartbeats older than each class's retention days go (the totals stay). */
export async function purgeRaw(env: Env): Promise<number> {
  const gs = await all<{ id: string; vscode: string | null }>(env, "SELECT id, vscode FROM guilds WHERE id IN (SELECT DISTINCT guild_id FROM vsc_learners)");
  let n = 0;
  for (const g of gs) {
    const cut = addDays(dayOf(now()), -vscSettings(g.vscode).retention);
    const r = await run(env, "UPDATE vsc_days SET raw = NULL WHERE guild_id = ? AND day < ? AND raw IS NOT NULL", g.id, cut);
    n += r.meta?.changes ?? 0;
  }
  return n;
}

// ---------------------------------------------------------------- the dashboard
interface Student { discord_id: string; name: string | null }
async function classStudents(env: Env, g: GuildRow) {
  const students = await all<Student>(env, "SELECT discord_id, name FROM players WHERE guild_id = ? AND discord_id != ? ORDER BY name COLLATE NOCASE", g.id, g.teacher_id ?? "");
  const squads = await currentSquads(env, g).catch(() => null);
  const squadOf = new Map<string, string>();
  for (const s of squads?.squads ?? []) for (const m of s.members) squadOf.set(m, s.name);
  return { students, squadOf, squads: (squads?.squads ?? []).map((s) => ({ id: s.id, name: s.name, members: s.members })) };
}
const STATUS_NOW = 300;   // a heartbeat in the last 5 minutes: coding now

/** The class on one day: one row per student, the cards, and who isn't connected yet. */
export async function classDay(env: Env, g: GuildRow, day: string, live = false) {
  const st = vscSettings(g.vscode);
  const { students, squadOf, squads } = await classStudents(env, g);
  const [ls, ds] = await Promise.all([
    all<Learner>(env, "SELECT * FROM vsc_learners WHERE guild_id = ?", g.id),
    all<{ discord_id: string; active_s: number; write_s: number; first_t: number | null; last_t: number | null; ai_lines: number; human_lines: number; agg: string | null }>(env,
      "SELECT discord_id, active_s, write_s, first_t, last_t, ai_lines, human_lines, agg FROM vsc_days WHERE guild_id = ? AND day = ?", g.id, day),
  ]);
  // the last day seen (not on the live refreshes: it reads every day of the class)
  const lastDay = live ? new Map<string, string>() : new Map((await all<{ discord_id: string; d: string }>(env, "SELECT discord_id, MAX(day) AS d FROM vsc_days WHERE guild_id = ? GROUP BY discord_id", g.id)).map((r) => [r.discord_id, r.d]));
  const L = new Map(ls.map((l) => [l.discord_id, l])), D = new Map(ds.map((d) => [d.discord_id, d]));
  const t = now(), today = dayOf(t) === day;
  const rows = students.map((p) => {
    const l = L.get(p.discord_id), d = D.get(p.discord_id), a = d ? parseAgg(d.agg) : null;
    const status = !l?.consent_at ? "none" : l.paused ? "paused" : !l.first_seen ? "waiting" : today && d?.last_t && t - d.last_t <= STATUS_NOW ? "coding" : "idle";
    return {
      id: p.discord_id, name: p.name || p.discord_id, squad: squadOf.get(p.discord_id) ?? null, status,
      consent: !!l?.consent_at, consentOld: !!l?.consent_at && (l.consent_v ?? 0) < st.consent_v, connected: !!l?.first_seen,
      active: d?.active_s ?? 0, write: d?.write_s ?? 0, first: d?.first_t ?? null, last: d?.last_t ?? null, lastDay: lastDay.get(p.discord_id) ?? null,
      cur: a?.cur ? { ...a.cur, f: st.files ? a.cur.f : "" } : null, hours: a?.hours ?? null,
      ai: d?.ai_lines ?? 0, hu: d?.human_lines ?? 0, lineData: !!a?.lineData, aiTime: a?.aiTime ?? 0, editor: a?.editors?.[0]?.[0] ?? null,
    };
  });
  const conn = rows.filter((r) => r.connected);
  return {
    day, today, settings: st, squads,
    cards: { connected: conn.length, students: rows.length, codingNow: rows.filter((r) => r.status === "coding").length, write: rows.reduce((s, r) => s + r.write, 0), active: rows.reduce((s, r) => s + r.active, 0), idleToday: conn.filter((r) => !r.active && r.status !== "paused").length },
    rows,
    notConnected: rows.filter((r) => !r.connected).map((r) => ({ id: r.id, name: r.name, squad: r.squad, status: r.status })),
  };
}

/** A week (Monday → Sunday): the heatmap learners × days, totals, and the week before for the trend. */
export async function classWeek(env: Env, g: GuildRow, day: string) {
  const mon = mondayOf(day), sun = addDays(mon, 6), prevMon = addDays(mon, -7);
  const { students, squadOf, squads } = await classStudents(env, g);
  // the lines too: written by an AI (agent, completion), typed by the learner, and pasted (a big jump of a file's line
  // count in a few seconds, not by an AI: see vscode.ts BIG_LINES)
  const rows = await all<{ discord_id: string; day: string; active_s: number; write_s: number; ai_lines: number | null; human_lines: number | null; big: string | null }>(env,
    "SELECT discord_id, day, active_s, write_s, ai_lines, human_lines, json_extract(agg, '$.big') AS big FROM vsc_days WHERE guild_id = ? AND day >= ? AND day <= ?", g.id, prevMon, sun);
  const pasted = (r: { big: string | null } | undefined) => { if (!r?.big) return [0, 0]; try { const b = JSON.parse(r.big); return Array.isArray(b) ? [b.reduce((s: number, x: any) => s + (Number(x?.[3]) || 0), 0), b.length] : [0, 0]; } catch { return [0, 0]; } };
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const cell = new Map(rows.map((r) => [`${r.discord_id}|${r.day}`, r]));
  const prev = new Map<string, [number, number]>();
  for (const r of rows) if (r.day < mon) { const v = prev.get(r.discord_id) ?? [0, 0]; v[0] += r.active_s; v[1] += r.write_s; prev.set(r.discord_id, v); }
  const learners = students.map((p) => {
    const cells = days.map((d) => { const c = cell.get(`${p.discord_id}|${d}`); return [c?.active_s ?? 0, c?.write_s ?? 0] as [number, number]; });
    const pv = prev.get(p.discord_id) ?? [0, 0];
    const mine = days.map((d) => cell.get(`${p.discord_id}|${d}`));
    const lines = mine.map((c) => { const [n, k] = pasted(c); return { ai: c?.ai_lines ?? 0, hu: c?.human_lines ?? 0, pasted: n, pastes: k }; });
    const sum = (k: "ai" | "hu" | "pasted" | "pastes") => lines.reduce((s, x) => s + x[k], 0);
    return { id: p.discord_id, name: p.name || p.discord_id, squad: squadOf.get(p.discord_id) ?? null, cells, lines, active: cells.reduce((s, c) => s + c[0], 0), write: cells.reduce((s, c) => s + c[1], 0), prevActive: pv[0], prevWrite: pv[1],
      ai: sum("ai"), hu: sum("hu"), pasted: sum("pasted"), pastes: sum("pastes") };
  });
  const perDay = days.map((_, i) => learners.reduce((s, l) => [s[0] + l.cells[i][0], s[1] + l.cells[i][1]], [0, 0]));
  return {
    monday: mon, days, squads, learners, perDay,
    totals: { active: learners.reduce((s, l) => s + l.active, 0), write: learners.reduce((s, l) => s + l.write, 0), prevActive: learners.reduce((s, l) => s + l.prevActive, 0), prevWrite: learners.reduce((s, l) => s + l.prevWrite, 0),
      ai: learners.reduce((s, l) => s + l.ai, 0), hu: learners.reduce((s, l) => s + l.hu, 0), pasted: learners.reduce((s, l) => s + l.pasted, 0), pastes: learners.reduce((s, l) => s + l.pastes, 0),
      aiLearners: learners.filter((l) => l.ai > 0).length, pasteLearners: learners.filter((l) => l.pasted > 0).length },
    weekend: perDay.slice(5).some((d) => d[0] > 0),
  };
}

const commitsBetween = (env: Env, gid: string, uid: string, a: number, b: number) =>
  all<Commit & { title: string | null; url: string | null; files: number | null; branch: string | null }>(env,
    "SELECT t, repo, adds, dels, size, title, url, files, branch FROM gh_log WHERE guild_id = ? AND discord_id = ? AND kind = 'commit' AND t >= ? AND t < ? ORDER BY t", gid, uid, a, b);

/** One learner: the day (sessions, projects, files, languages), the week's bars, the day's commits and the signals. */
export async function learnerDetail(env: Env, g: GuildRow, uid: string, day: string) {
  const st = vscSettings(g.vscode);
  const p = await one<Student>(env, "SELECT discord_id, name FROM players WHERE guild_id = ? AND discord_id = ?", g.id, uid);
  if (!p) throw new VscError("This student isn't in the class.");
  const mon = mondayOf(day), days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const rows = await all<{ day: string; active_s: number; write_s: number; agg: string | null }>(env,
    "SELECT day, active_s, write_s, agg FROM vsc_days WHERE guild_id = ? AND discord_id = ? AND day >= ? AND day <= ?", g.id, uid, mon, days[6]);
  const byDay = new Map(rows.map((r) => [r.day, parseAgg(r.agg)]));
  const wk = { start: dayClock(mon).start, end: dayClock(days[6]).end };
  const commits = await commitsBetween(env, g.id, uid, wk.start, wk.end);
  const commitsOf = (d: string) => commits.filter((c) => dayOf(c.t) === d);
  const a = byDay.get(day) ?? emptyAgg();
  const hide = (x: DayAgg) => (st.files ? x : { ...x, files: [], big: x.big.map(([t, pr, , n]) => [t, pr, "", n] as [number, string, string, number]), cur: x.cur ? { ...x.cur, f: "" } : null });
  const sig = days.flatMap((d) => (byDay.has(d) ? signals(d, byDay.get(d)!, commitsOf(d)) : []));
  const l = await learnerOf(env, g.id, uid);
  return {
    id: uid, name: p.name || uid, day, settings: st,
    learner: l ? { consent: !!l.consent_at, paused: !!l.paused, connected: !!l.first_seen, key_hint: l.key_hint } : null,
    agg: hide(a),
    week: days.map((d) => ({ day: d, active: byDay.get(d)?.active ?? 0, write: byDay.get(d)?.write ?? 0, commits: commitsOf(d).length })),
    commits: commitsOf(day).map((c) => ({ t: c.t, repo: c.repo, adds: c.adds, dels: c.dels, files: c.files, title: c.title, url: c.url, size: c.size })),
    signals: st.files ? sig : sig.map((s) => ({ ...s, file: undefined })),
  };
}

/** Time per member and per file of a brief's project, between its dates (all the members, or the given ones). */
export async function briefTime(env: Env, g: GuildRow, b: { start_at: number | null; due_at: number | null; created_at: number }, members: string[], repo: string | null) {
  const from = dayOf(b.start_at ?? b.created_at), to = dayOf(Math.min(b.due_at ?? now(), now()));
  if (!members.length || to < from) return { from, to, members: new Map<string, ReturnType<typeof sumDays> & { onProject: { active: number; write: number }; projectFiles: { file: string; active: number; write: number }[] }>() };
  const rows = await all<{ discord_id: string; agg: string | null }>(env,
    `SELECT discord_id, agg FROM vsc_days WHERE guild_id = ? AND day >= ? AND day <= ? AND discord_id IN (${members.map(() => "?").join(",")})`, g.id, from, to, ...members.slice(0, 90));
  const out = new Map<string, any>();
  for (const m of members) {
    const s = sumDays(rows.filter((r) => r.discord_id === m).map((r) => parseAgg(r.agg)));
    const mine = repo ? s.projects.filter((x) => sameProject(x.project, repo)) : [];
    out.set(m, {
      ...s,
      onProject: { active: mine.reduce((t, x) => t + x.active, 0), write: mine.reduce((t, x) => t + x.write, 0) },
      projectFiles: repo ? s.files.filter((f) => sameProject(f.project, repo)).map((f) => ({ file: f.file, active: f.active, write: f.write })) : [],
    });
  }
  return { from, to, members: out };
}

/** A squad brief: for each squad's handed-in repo, the time of each member and who worked on which file. */
export async function squadView(env: Env, g: GuildRow, briefId: number) {
  const st = vscSettings(g.vscode);
  const b = await one<{ id: number; title: string; kind: string; squads: string | null; start_at: number | null; due_at: number | null; created_at: number }>(env,
    "SELECT id, title, kind, squads, start_at, due_at, created_at FROM briefs WHERE id = ? AND guild_id = ?", briefId, g.id);
  if (!b) throw new VscError("This brief doesn't exist anymore.");
  const squads = b.squads ? cleanSquads(b.squads) : (await currentSquads(env, g))?.squads ?? [];
  const handins = new Map((await all<{ who: string; repo: string }>(env, "SELECT who, repo FROM brief_handins WHERE brief_id = ?", b.id)).map((h) => [h.who, h.repo]));
  const names = new Map((await all<Student>(env, "SELECT discord_id, name FROM players WHERE guild_id = ?", g.id)).map((p) => [p.discord_id, p.name || p.discord_id]));
  const out = [];
  for (const s of squads) {
    const repo = handins.get(`s:${s.id}`) ?? s.members.map((m) => handins.get(`u:${m}`)).find(Boolean) ?? null;
    const t = await briefTime(env, g, b, s.members, repo);
    const files = new Map<string, Record<string, [number, number]>>();
    const members = s.members.map((m) => {
      const x = t.members.get(m);
      for (const f of x?.projectFiles ?? []) { const row = files.get(f.file) ?? {}; row[m] = [f.active, f.write]; files.set(f.file, row); }
      return { id: m, name: names.get(m) ?? m, active: x?.active ?? 0, write: x?.write ?? 0, onProject: x?.onProject ?? { active: 0, write: 0 }, ai: x?.ai ?? 0, hu: x?.hu ?? 0, lineData: !!x?.lineData };
    });
    out.push({
      id: s.id, name: s.name, repo, members,
      files: st.files ? [...files].map(([file, by]) => ({ file, by, total: Object.values(by).reduce((n, v) => n + v[0], 0) })).sort((x, y) => y.total - x.total).slice(0, 40) : [],
    });
  }
  return { brief: { id: b.id, title: b.title, kind: b.kind }, from: dayOf(b.start_at ?? b.created_at), to: dayOf(Math.min(b.due_at ?? now(), now())), squads: out };
}

/** The selected day or week as CSV (minutes), for a spreadsheet. */
export async function exportCsv(env: Env, g: GuildRow, period: "day" | "week", day: string): Promise<string> {
  const cell = (v: unknown) => { const s = String(v ?? ""); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const min = (s: number) => Math.round(s / 60);
  const hm = (t: number | null) => (t ? new Date(t * 1000).toLocaleTimeString("fr-FR", { timeZone: "Africa/Casablanca", hour: "2-digit", minute: "2-digit" }) : "");
  const lines: unknown[][] = [];
  if (period === "day") {
    const d = await classDay(env, g, day, true);
    lines.push(["learner", "squad", "status", "active_min", "writing_min", "first", "last", "project", "ai_lines", "human_lines"]);
    for (const r of d.rows) lines.push([r.name, r.squad, r.status, min(r.active), min(r.write), hm(r.first), hm(r.last), r.cur?.p ?? "", r.lineData ? r.ai : "", r.lineData ? r.hu : ""]);
  } else {
    const w = await classWeek(env, g, day);
    lines.push(["learner", "squad", ...w.days.flatMap((d) => [`${d}_active_min`, `${d}_writing_min`]), "week_active_min", "week_writing_min", "previous_week_writing_min", "week_ai_lines", "week_typed_lines", "week_pasted_lines"]);
    for (const l of w.learners) lines.push([l.name, l.squad, ...l.cells.flatMap(([a, wr]) => [min(a), min(wr)]), min(l.active), min(l.write), min(l.prevWrite), l.ai, l.hu, l.pasted]);
  }
  return "﻿" + lines.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

/** A learner's days (the GitHub tab shows the coding time next to each day's commits). */
export async function learnerDays(env: Env, g: GuildRow, uid: string, days: number) {
  const l = await learnerOf(env, g.id, uid);
  const rows = await all<{ day: string; active_s: number; write_s: number }>(env,
    "SELECT day, active_s, write_s FROM vsc_days WHERE guild_id = ? AND discord_id = ? AND day >= ?", g.id, uid, addDays(dayOf(now()), -Math.max(1, Math.min(120, days))));
  return { connected: !!l?.first_seen, paused: !!l?.paused, days: Object.fromEntries(rows.map((r) => [r.day, [r.active_s, r.write_s]])) };
}

/**
 * A debrief (« s:<squad> » or « u:<learner> »): each member's VS Code time between the brief's dates, on the
 * handed-in repo, and their most worked files of it. Facts only, for the member card (and their note if the teacher wants).
 */
export async function briefMembersTime(env: Env, g: GuildRow, briefId: number, who: string) {
  const st = vscSettings(g.vscode);
  const b = await one<{ id: number; squads: string | null; start_at: number | null; due_at: number | null; created_at: number }>(env,
    "SELECT id, squads, start_at, due_at, created_at FROM briefs WHERE id = ? AND guild_id = ?", briefId, g.id);
  if (!b) throw new VscError("This brief doesn't exist anymore.");
  let members: string[] = [];
  if (who.startsWith("s:")) {
    const sq = (b.squads ? cleanSquads(b.squads) : (await currentSquads(env, g))?.squads ?? []).find((s) => s.id === who.slice(2));
    members = sq?.members ?? [];
  } else if (who.startsWith("u:")) members = [who.slice(2)];
  const hand = await one<{ repo: string }>(env, "SELECT repo FROM brief_handins WHERE brief_id = ? AND who = ?", b.id, who);
  const t = await briefTime(env, g, b, members, hand?.repo ?? null);
  const ls = members.length ? await all<{ discord_id: string; first_seen: number | null }>(env,
    `SELECT discord_id, first_seen FROM vsc_learners WHERE guild_id = ? AND discord_id IN (${members.map(() => "?").join(",")})`, g.id, ...members) : [];
  const conn = new Set(ls.filter((l) => l.first_seen).map((l) => l.discord_id));
  return {
    from: t.from, to: t.to, repo: hand?.repo ?? null,
    members: Object.fromEntries(members.map((m) => {
      const x = t.members.get(m);
      const files = (hand?.repo ? x?.projectFiles ?? [] : x?.files ?? []).slice(0, 5).map((f: any) => ({ file: f.file, active: f.active, write: f.write }));
      return [m, { connected: conn.has(m), active: x?.active ?? 0, write: x?.write ?? 0, onProject: x?.onProject ?? { active: 0, write: 0 }, files: st.files ? files : [] }];
    })),
  };
}

/** Overview, needs attention: connected learners with no writing time for the last 2 working days, during a brief. */
export async function quietWriters(env: Env, g: GuildRow) {
  const today = dayOf(now());
  const work: string[] = [];
  for (let d = addDays(today, -1); work.length < 2; d = addDays(d, -1)) if (new Date(d + "T12:00:00Z").getUTCDay() % 6 !== 0) work.push(d);
  const brief = await one<{ id: number; title: string }>(env, "SELECT id, title FROM briefs WHERE guild_id = ? AND status = 'assigned' AND (start_at IS NULL OR start_at <= ?) AND (due_at IS NULL OR due_at >= ?) ORDER BY id DESC LIMIT 1", g.id, dayClock(work[1]).start, dayClock(work[0]).start);
  if (!brief) return { brief: null, days: work, learners: [] as { id: string; name: string }[] };
  const ls = await all<{ discord_id: string; name: string | null }>(env,
    `SELECT l.discord_id, p.name FROM vsc_learners l JOIN players p ON p.guild_id = l.guild_id AND p.discord_id = l.discord_id
     WHERE l.guild_id = ? AND l.first_seen IS NOT NULL AND l.first_seen < ? AND l.paused = 0
       AND NOT EXISTS (SELECT 1 FROM vsc_days d WHERE d.guild_id = l.guild_id AND d.discord_id = l.discord_id AND d.day IN (?, ?) AND d.write_s > 0)`,
    g.id, dayClock(work[1]).start, work[0], work[1]);
  return { brief, days: work, learners: ls.map((r) => ({ id: r.discord_id, name: r.name || r.discord_id })) };
}
