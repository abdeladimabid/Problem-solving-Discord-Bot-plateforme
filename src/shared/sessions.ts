// Class sessions: the teacher picks challenges and a duration; students work in
// the code editor (anti-cheat on), and the dashboard shows a results grid.
import type { Env, GuildRow } from "./types.ts";
import { all, getGuild, now, one, run } from "./db.ts";
import { t } from "./i18n.ts";
import { COLORS, btn, dm, mention, pingUsers, row, send, ts } from "./discord.ts";
import { arenaChannel } from "./arena.ts";

export interface SessionRow {
  id: number; guild_id: string; title: string; challenges: string; team_id: number | null; channel_id: string | null;
  starts_at: number; ends_at: number; status: string; created_at: number; mode?: string; grades?: string | null; notified?: string | null;
}

export async function createSession(env: Env, g: GuildRow, o: { title: string; challenges: number[]; minutes: number; teamId?: number | null; channelId?: string | null; mode?: "class" | "exam" }) {
  const t0 = now();
  const mode = o.mode === "exam" ? "exam" : "class";
  const r = await run(env, "INSERT INTO sessions (guild_id, title, challenges, team_id, channel_id, starts_at, ends_at, created_at, mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    g.id, o.title, JSON.stringify(o.challenges), o.teamId ?? null, o.channelId ?? null, t0, t0 + o.minutes * 60, t0, mode);
  const id = Number(r.meta.last_row_id);
  const s = (await one<SessionRow>(env, "SELECT * FROM sessions WHERE id = ?", id))!;
  const channel = o.channelId || (await arenaChannel(env, g));
  if (channel) {
    const L = g.lang;
    const members = o.teamId ? (await all<{ discord_id: string }>(env, "SELECT discord_id FROM team_members WHERE team_id = ?", o.teamId)).map((m) => m.discord_id) : [];
    await send(env, channel, {
      content: members.length ? members.slice(0, 80).map(mention).join(" ") : "",
      embeds: [{
        title: t(L, mode === "exam" ? "exam.title" : "session.title", { title: o.title }),
        description: t(L, mode === "exam" ? "exam.desc" : "session.desc", { n: o.challenges.length, end: ts(s.ends_at), endAbs: ts(s.ends_at, "t") }),
        color: COLORS.blue,
      }],
      components: [row(btn(t(L, mode === "exam" ? "exam.open_btn" : "session.open_btn"), `sopen:${id}`, 1, "📝"))],
      allowed_mentions: pingUsers(members),
    }).catch((e) => console.error("session post", e));
  }
  return s;
}

/** Cron: close finished sessions (unfinished answers expire) and post a short summary. */
export async function endDueSessions(env: Env) {
  const due = await all<SessionRow>(env, "SELECT * FROM sessions WHERE status = 'active' AND ends_at <= ? LIMIT 5", now());
  for (const s of due) await endSession(env, s);
  await notifyExamGrades(env);
}

export async function endSession(env: Env, s: SessionRow) {
  const res = await run(env, "UPDATE sessions SET status = 'finished', ends_at = MIN(ends_at, ?) WHERE id = ? AND status = 'active'", now(), s.id);
  if (!res.meta.changes) return;
  const g = await getGuild(env, s.guild_id);
  if (s.mode === "exam") {
    // the best submission counts: accepted → solved, anything else → failed
    await run(env, `UPDATE attempts SET status = CASE WHEN json_extract(result, '$.verdict') = 'accepted' THEN 'solved' ELSE 'failed' END, finished_at = ?
                     WHERE origin = 'exam' AND ref = ? AND status = 'pending' AND tries > 0`, now(), s.id);
    await run(env, "UPDATE attempts SET status = 'expired', finished_at = ? WHERE origin = 'exam' AND ref = ? AND status = 'pending'", now(), s.id);
    const grades = await examGrades(env, { ...s, status: "finished" });
    await run(env, "UPDATE sessions SET grades = ?, notified = '[]' WHERE id = ?", JSON.stringify(grades), s.id);
    const channel = s.channel_id || (await arenaChannel(env, g));
    if (channel) await send(env, channel, { content: t(g.lang, "exam.ended", { title: s.title, n: Object.keys(grades).length }) }).catch(() => {});
    await notifyExamGrades(env);
    return;
  }
  await run(env, "UPDATE attempts SET status = 'expired', finished_at = ? WHERE origin = 'session' AND ref = ? AND status = 'pending'", now(), s.id);
  const stats = await one<{ students: number; solved: number }>(env,
    "SELECT COUNT(DISTINCT discord_id) AS students, SUM(status = 'solved') AS solved FROM attempts WHERE origin = 'session' AND ref = ?", s.id);
  const channel = s.channel_id || (await arenaChannel(env, g));
  if (channel) await send(env, channel, { content: t(g.lang, "session.ended", { title: s.title, n: stats?.students ?? 0, solved: stats?.solved ?? 0 }) }).catch(() => {});
}

// ------------------------------------------------------------------ exams
/** Score of one exam answer between 0 and 1: share of tests passed (write code), right or wrong (quick). */
function scoreOf(a: { status: string; result: string | null; kind: string }): number {
  if (a.kind === "write" || a.kind === "sql") {
    try {
      const r = a.result ? JSON.parse(a.result) : null;
      return r && r.total ? Math.max(0, Math.min(1, r.passed / r.total)) : 0;
    } catch { return 0; }
  }
  return a.status === "solved" ? 1 : 0;
}

/** Grades out of 20: every question weighs the same. */
export async function examGrades(env: Env, s: SessionRow): Promise<Record<string, { grade: number; scores: Record<number, number> }>> {
  const ids: number[] = JSON.parse(s.challenges || "[]");
  const rows = await all<{ discord_id: string; challenge_id: number; status: string; result: string | null; kind: string }>(env,
    "SELECT a.discord_id, a.challenge_id, a.status, a.result, c.kind FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.origin = 'exam' AND a.ref = ?", s.id);
  const out: Record<string, { grade: number; scores: Record<number, number> }> = {};
  for (const r of rows) {
    out[r.discord_id] ??= { grade: 0, scores: {} };
    out[r.discord_id].scores[r.challenge_id] = Math.max(out[r.discord_id].scores[r.challenge_id] ?? 0, scoreOf(r));
  }
  for (const v of Object.values(out)) v.grade = Math.round((20 * ids.reduce((sum, id) => sum + (v.scores[id] ?? 0), 0)) / Math.max(1, ids.length) * 10) / 10;
  return out;
}

/** DM each student their exam grade (a few per run: Discord limits). */
export async function notifyExamGrades(env: Env, perRun = 12) {
  const s = await one<SessionRow>(env, "SELECT * FROM sessions WHERE mode = 'exam' AND status = 'finished' AND grades IS NOT NULL AND notified IS NOT NULL AND notified != 'done' ORDER BY id LIMIT 1");
  if (!s) return;
  const g = await getGuild(env, s.guild_id);
  const grades = JSON.parse(s.grades || "{}");
  const done: string[] = JSON.parse(s.notified || "[]");
  const ids: number[] = JSON.parse(s.challenges || "[]");
  const titles = new Map((await all<{ id: number; title: string }>(env, `SELECT id, title FROM challenges WHERE id IN (${ids.map(() => "?").join(", ") || "0"})`, ...ids)).map((c) => [c.id, c.title]));
  const todo = Object.keys(grades).filter((u) => !done.includes(u)).slice(0, perRun);
  for (const u of todo) {
    const v = grades[u];
    const lines = ids.map((id, i) => `${i + 1}. ${titles.get(id) ?? "?"} · ${Math.round((v.scores[id] ?? 0) * 100)}%`);
    await dm(env, u, { content: t(g.lang, "exam.grade_dm", { title: s.title, grade: v.grade, lines: lines.join("\n") }) }).catch(() => {});
    done.push(u);
  }
  const all_ = Object.keys(grades).every((u) => done.includes(u));
  await run(env, "UPDATE sessions SET notified = ? WHERE id = ?", all_ ? "done" : JSON.stringify(done), s.id);
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
      WHERE a.origin IN ('session', 'exam') AND a.ref = ? ORDER BY a.id`, id);
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
  const exam = s.mode === "exam";
  const grades = exam ? (s.grades ? JSON.parse(s.grades) : await examGrades(env, s)) : {};
  for (const st of students.values()) {
    (st as any).grade = exam ? grades[st.discord_id]?.grade ?? 0 : null;
    if (exam) for (const [cid, cell] of Object.entries(st.cells)) cell.score = grades[st.discord_id]?.scores?.[Number(cid)] ?? 0;
  }
  return { session: { ...s, challenges: ids, grades: undefined, notified: undefined }, exam, challenges: ids.map((cid) => challenges.find((c) => c.id === cid)).filter(Boolean), students: [...students.values()].sort((a, b) => b.solved - a.solved || b.points - a.points) };
}
