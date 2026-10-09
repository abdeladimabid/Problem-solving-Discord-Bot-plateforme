// Class sessions: the teacher picks challenges and a duration; students work in
// the code editor (anti-cheat on), and the dashboard shows a results grid.
import type { Env, GuildRow } from "./types.ts";
import { all, getGuild, now, one, run } from "./db.ts";
import { t } from "./i18n.ts";
import { COLORS, btn, mention, pingUsers, row, send, ts } from "./discord.ts";
import { arenaChannel } from "./arena.ts";

export interface SessionRow {
  id: number; guild_id: string; title: string; challenges: string; team_id: number | null; channel_id: string | null;
  starts_at: number; ends_at: number; status: string; created_at: number;
}

export async function createSession(env: Env, g: GuildRow, o: { title: string; challenges: number[]; minutes: number; teamId?: number | null; channelId?: string | null }) {
  const t0 = now();
  const r = await run(env, "INSERT INTO sessions (guild_id, title, challenges, team_id, channel_id, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    g.id, o.title, JSON.stringify(o.challenges), o.teamId ?? null, o.channelId ?? null, t0, t0 + o.minutes * 60, t0);
  const id = Number(r.meta.last_row_id);
  const s = (await one<SessionRow>(env, "SELECT * FROM sessions WHERE id = ?", id))!;
  const channel = o.channelId || (await arenaChannel(env, g));
  if (channel) {
    const L = g.lang;
    const members = o.teamId ? (await all<{ discord_id: string }>(env, "SELECT discord_id FROM team_members WHERE team_id = ?", o.teamId)).map((m) => m.discord_id) : [];
    await send(env, channel, {
      content: members.length ? members.slice(0, 80).map(mention).join(" ") : "",
      embeds: [{
        title: t(L, "session.title", { title: o.title }),
        description: t(L, "session.desc", { n: o.challenges.length, end: ts(s.ends_at), endAbs: ts(s.ends_at, "t") }),
        color: COLORS.blue,
      }],
      components: [row(btn(t(L, "session.open_btn"), `sopen:${id}`, 1, "📝"))],
      allowed_mentions: pingUsers(members),
    }).catch((e) => console.error("session post", e));
  }
  return s;
}

/** Cron: close finished sessions (unfinished answers expire) and post a short summary. */
export async function endDueSessions(env: Env) {
  const due = await all<SessionRow>(env, "SELECT * FROM sessions WHERE status = 'active' AND ends_at <= ? LIMIT 5", now());
  for (const s of due) await endSession(env, s);
}

export async function endSession(env: Env, s: SessionRow) {
  const res = await run(env, "UPDATE sessions SET status = 'finished', ends_at = MIN(ends_at, ?) WHERE id = ? AND status = 'active'", now(), s.id);
  if (!res.meta.changes) return;
  await run(env, "UPDATE attempts SET status = 'expired', finished_at = ? WHERE origin = 'session' AND ref = ? AND status = 'pending'", now(), s.id);
  const g = await getGuild(env, s.guild_id);
  const stats = await one<{ students: number; solved: number }>(env,
    "SELECT COUNT(DISTINCT discord_id) AS students, SUM(status = 'solved') AS solved FROM attempts WHERE origin = 'session' AND ref = ?", s.id);
  const channel = s.channel_id || (await arenaChannel(env, g));
  if (channel) await send(env, channel, { content: t(g.lang, "session.ended", { title: s.title, n: stats?.students ?? 0, solved: stats?.solved ?? 0 }) }).catch(() => {});
}

/** Results grid for the dashboard: one row per student, one cell per challenge. */
export async function sessionResults(env: Env, g: GuildRow, id: number) {
  const s = await one<SessionRow>(env, "SELECT * FROM sessions WHERE id = ? AND guild_id = ?", id, g.id);
  if (!s) return null;
  const ids: number[] = JSON.parse(s.challenges || "[]");
  const challenges = await all<any>(env, `SELECT id, title, kind, difficulty FROM challenges WHERE id IN (${ids.map(() => "?").join(", ") || "0"})`, ...ids);
  const attempts = await all<any>(env,
    `SELECT a.id, a.discord_id, p.name, a.challenge_id, a.status, a.tries, a.points, a.held, a.started_at, a.finished_at, a.lang, a.integrity, a.explain, a.reviewed
       FROM attempts a LEFT JOIN players p ON p.guild_id = a.guild_id AND p.discord_id = a.discord_id
      WHERE a.origin = 'session' AND a.ref = ? ORDER BY a.id`, id);
  const students = new Map<string, { discord_id: string; name: string | null; cells: Record<number, any>; solved: number; points: number; flags: number }>();
  for (const a of attempts) {
    if (!students.has(a.discord_id)) students.set(a.discord_id, { discord_id: a.discord_id, name: a.name, cells: {}, solved: 0, points: 0, flags: 0 });
    const st = students.get(a.discord_id)!;
    let level = 0;
    try { level = JSON.parse(a.integrity || "null")?.level ?? 0; } catch { level = 0; }
    st.cells[a.challenge_id] = { attempt: a.id, status: a.status, tries: a.tries, points: a.points, minutes: a.finished_at ? Math.round((a.finished_at - a.started_at) / 60) : null, lang: a.lang, level, reviewed: a.reviewed };
    if (a.status === "solved") st.solved++;
    st.points += a.points;
    if (level && !a.reviewed) st.flags++;
  }
  return { session: { ...s, challenges: ids }, challenges: ids.map((cid) => challenges.find((c) => c.id === cid)).filter(Boolean), students: [...students.values()].sort((a, b) => b.solved - a.solved || b.points - a.points) };
}
