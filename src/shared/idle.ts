// 💤 Students idle for too long during class time: a DM asks if they need help, with buttons that raise their hand
// (✋ Help queue) or ask a question (❓ FAQ / the teacher), or say all is fine.
//   • the teacher sets it (Settings → Notifications): on/off, how long is too long, the class hours and days
//   • only students who were active earlier in that day's class hours (absent students are left alone), not staff, not
//     a student whose hand is already raised; once per idle spell, at most `max` times a day
//   • activity: their last interaction with the bot, their pushes on GitHub, their coding time in VS Code
import type { Env, GuildRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { dayOf, localTime, tzOffset, weekday } from "./vscode.ts";
import { withoutStaff } from "./staff.ts";

export interface IdleCfg { on: boolean; minutes: number; from: string; to: string; days: number[]; max: number }
export const IDLE_DEFAULT: IdleCfg = { on: false, minutes: 60, from: "09:00", to: "17:00", days: [0, 1, 2, 3, 4], max: 2 };
const KEY = (gid: string) => `idle:${gid}`;
const NUDGE = (gid: string, uid: string) => `idlenudge:${gid}:${uid}`;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

export function cleanIdle(b: any): IdleCfg {
  const o = b && typeof b === "object" ? b : {};
  const from = HHMM.test(String(o.from)) ? String(o.from) : IDLE_DEFAULT.from;
  let to = HHMM.test(String(o.to)) ? String(o.to) : IDLE_DEFAULT.to;
  if (mins(to) <= mins(from)) to = IDLE_DEFAULT.to;
  const days = Array.isArray(o.days) ? [...new Set(o.days.map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() as number[] : IDLE_DEFAULT.days;
  return {
    on: !!o.on, minutes: Math.min(480, Math.max(15, Math.round(Number(o.minutes) || IDLE_DEFAULT.minutes))),
    from, to, days: days.length ? days : IDLE_DEFAULT.days, max: Math.min(5, Math.max(1, Math.round(Number(o.max) || IDLE_DEFAULT.max))),
  };
}
export async function idleCfg(env: Env, gid: string): Promise<IdleCfg> {
  const r = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", KEY(gid)).catch(() => null);
  try { return cleanIdle(r ? JSON.parse(r.v) : {}); } catch { return { ...IDLE_DEFAULT }; }
}
export async function saveIdleCfg(env: Env, gid: string, b: any): Promise<IdleCfg> {
  const c = cleanIdle(b);
  await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", KEY(gid), JSON.stringify(c), now());
  return c;
}

/** The students to nudge now: idle for too long, during class time, after being active in it today. */
export async function idleStudents(env: Env, g: GuildRow, c: IdleCfg, t0 = now()) {
  const day = dayOf(t0), local = Math.floor(((t0 + tzOffset(t0)) % 86400) / 60);
  if (!c.days.includes(weekday(day)) || local < mins(c.from) || local > mins(c.to)) return [];
  const start = localTime(day, mins(c.from));
  const [players, gh, vsc, hands, nudges] = await Promise.all([
    all<{ discord_id: string; name: string | null; last_active: number | null }>(env, "SELECT discord_id, name, last_active FROM players WHERE guild_id = ?", g.id),
    all<{ discord_id: string; t: number }>(env, "SELECT discord_id, MAX(t) AS t FROM gh_activity WHERE guild_id = ? AND t >= ? GROUP BY discord_id", g.id, start).catch(() => []),
    all<{ discord_id: string; t: number }>(env, "SELECT discord_id, last_t AS t FROM vsc_days WHERE guild_id = ? AND day = ?", g.id, day).catch(() => []),
    all<{ discord_id: string }>(env, "SELECT DISTINCT discord_id FROM hands WHERE guild_id = ? AND status IN ('waiting', 'helping')", g.id).catch(() => []),
    all<{ k: string; v: string }>(env, "SELECT k, v FROM app_settings WHERE k LIKE ?", `idlenudge:${g.id}:%`).catch(() => []),
  ]);
  const last = new Map<string, number>();
  const see = (id: string, t: number | null | undefined) => { if (t && t > (last.get(id) || 0)) last.set(id, t); };
  for (const p of players) see(p.discord_id, p.last_active);
  for (const r of gh) see(r.discord_id, r.t);
  for (const r of vsc) see(r.discord_id, r.t);
  const raised = new Set(hands.map((h) => h.discord_id));
  const nudged = new Map<string, { day: string; n: number; at: number }>();
  for (const r of nudges) { try { nudged.set(r.k.split(":").pop()!, JSON.parse(r.v)); } catch { /* skip */ } }
  const students = await withoutStaff(env, g.id, players);
  return students.filter((p) => {
    const t = last.get(p.discord_id) || 0;
    if (t < start || t0 - t < c.minutes * 60 || raised.has(p.discord_id)) return false;
    const n = nudged.get(p.discord_id);
    // once per idle spell (active again since the last DM), at most `max` a day
    return !n || n.day !== day || (n.n < c.max && n.at < t);
  }).map((p) => ({ id: p.discord_id, name: p.name || p.discord_id, last: last.get(p.discord_id)!, idle: Math.floor((t0 - last.get(p.discord_id)!) / 60) }));
}

/** The DM: in the class's language, with the buttons (the class is in their id: a DM has no server). */
export function idleMessage(g: GuildRow, idleMin: number) {
  const fr = g.lang !== "en";
  const h = idleMin >= 60 ? `${Math.floor(idleMin / 60)} h${idleMin % 60 ? ` ${idleMin % 60}` : ""}` : `${idleMin} min`;
  return {
    content: fr
      ? `👋 Ça fait ${h} qu'on ne te voit plus avancer. Tu as besoin d'aide ? Quelque chose que tu ne comprends pas ?\nTon formateur est là pour ça : lève la main ou pose ta question, il te répond.`
      : `👋 No activity from you for ${h}. Do you need help? Something you don't understand?\nYour teacher is here for that: raise your hand or ask your question, they'll answer.`,
    components: [{ type: 1, components: [
      { type: 2, style: 1, label: fr ? "Demander de l'aide" : "Ask for help", emoji: { name: "✋" }, custom_id: `idle:hand:${g.id}` },
      { type: 2, style: 2, label: fr ? "Poser une question" : "Ask a question", emoji: { name: "❓" }, custom_id: `idle:ask:${g.id}` },
      { type: 2, style: 2, label: fr ? "Ça va, merci" : "I'm fine, thanks", emoji: { name: "👍" }, custom_id: `idle:ok:${g.id}` },
    ] }],
  };
}

/** Every 5 minutes: each class that turned it on. `send` is the DM (Discord), given by the caller. */
export async function idleCron(env: Env, send: (uid: string, payload: Record<string, unknown>) => Promise<boolean>, t0 = now()) {
  if (Math.floor(t0 / 60) % 5) return 0;
  const rows = await all<{ k: string; v: string }>(env, "SELECT k, v FROM app_settings WHERE k LIKE 'idle:%'").catch(() => []);
  let sent = 0;
  for (const r of rows) {
    let c: IdleCfg;
    try { c = cleanIdle(JSON.parse(r.v)); } catch { continue; }
    if (!c.on) continue;
    const g = await one<GuildRow>(env, "SELECT * FROM guilds WHERE id = ?", r.k.slice(5));
    if (!g) continue;
    const day = dayOf(t0);
    for (const s of (await idleStudents(env, g, c, t0)).slice(0, 25)) {
      const ok = await send(s.id, idleMessage(g, s.idle));
      const prev = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", NUDGE(g.id, s.id)).catch(() => null);
      let n = 0;
      try { const p = prev ? JSON.parse(prev.v) : null; n = p && p.day === day ? p.n : 0; } catch { /* first */ }
      // counted even when Discord refused (DMs closed): never retried every 5 minutes
      await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", NUDGE(g.id, s.id), JSON.stringify({ day, n: n + 1, at: t0, ok }), t0);
      if (ok) sent++;
    }
  }
  return sent;
}

/** For the teacher's page: who was nudged today. */
export async function idleToday(env: Env, gid: string, t0 = now()) {
  const day = dayOf(t0);
  const rows = await all<{ k: string; v: string }>(env, "SELECT k, v FROM app_settings WHERE k LIKE ?", `idlenudge:${gid}:%`).catch(() => []);
  const out: { id: string; n: number; at: number; ok: boolean }[] = [];
  for (const r of rows) { try { const v = JSON.parse(r.v); if (v.day === day) out.push({ id: r.k.split(":").pop()!, n: v.n, at: v.at, ok: v.ok !== false }); } catch { /* skip */ } }
  return out.sort((a, b) => b.at - a.at);
}
