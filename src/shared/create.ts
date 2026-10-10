// Challenges written by students: /create → the teacher approves in the dashboard →
// the author earns points every time a classmate solves it.
import type { ChallengeRow, Difficulty, Env, GuildRow } from "./types.ts";
import { addPoints, all, now, one, run } from "./db.ts";
import { RunnerUnavailable, isCodeLang, normOut, runHarness } from "./runner.ts";
import type { CodeLang } from "./runner.ts";
import { t } from "./i18n.ts";
import { dm } from "./discord.ts";
import { guessSkills } from "./skills.ts";

export const AUTHOR_POINTS = 3;          // per classmate who solves it
export const AUTHOR_MAX_SOLVERS = 20;    // then it stops paying
export const APPROVAL_POINTS = 10;       // when the teacher accepts it
export const MAX_PENDING = 3;            // proposals waiting for review per student

export class CreateError extends Error {}

export async function pendingCount(env: Env, g: GuildRow, uid: string) {
  return (await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM challenges WHERE guild_id = ? AND created_by = ? AND source = 'student' AND status = 'pending'", g.id, uid))?.n ?? 0;
}

/** A write-code problem: the student's own solution computes the expected outputs. */
export async function createWrite(env: Env, g: GuildRow, uid: string, o: { title: string; statement: string; tests: string; solution: string; lang: string; difficulty: Difficulty }) {
  const lang = (isCodeLang(o.lang.trim().toLowerCase()) ? o.lang.trim().toLowerCase() : "python") as CodeLang;
  const inputs = o.tests.replace(/\r/g, "").split(/\n-{3,}\n/).map((x) => x.trim()).filter(Boolean).map((x) => x + "\n");
  if (inputs.length < 2) throw new CreateError("create.need_tests");
  if (inputs.length > 10) throw new CreateError("create.too_many_tests");
  if (o.title.trim().length < 3 || o.statement.trim().length < 30) throw new CreateError("create.too_short");
  let res;
  try {
    res = await runHarness(env, lang, o.solution, inputs.map((i) => ({ input: i, gen: null })), 3, 6000);
  } catch (e) {
    if (e instanceof RunnerUnavailable) throw new CreateError("create.runner_down");
    throw e;
  }
  if (res.compile) throw new CreateError("create.compile|" + res.compile.slice(0, 400));
  const bad = res.rows.findIndex((r) => r.s !== "ok" || !normOut(r.o));
  if (bad >= 0) throw new CreateError(`create.test_failed|${bad + 1}|${res.rows[bad]?.s === "tle" ? "too slow" : (res.rows[bad]?.e || "no output").slice(0, 300)}`);
  const set = `student-${crypto.randomUUID().slice(0, 8)}`;
  await env.DB.batch(inputs.map((input, i) => env.DB.prepare("INSERT INTO challenge_tests (test_set, idx, input, gen, expected, sample) VALUES (?, ?, ?, NULL, ?, ?)")
    .bind(set, i, input, normOut(res.rows[i].o), i === 0 ? 1 : 0)));
  const r = await run(env,
    `INSERT INTO challenges (guild_id, source, kind, difficulty, lang, title, question, test_set, time_limit, solution, status, created_by, created_at, topic)
     VALUES (?, 'student', 'write', ?, ?, ?, ?, ?, 2, ?, 'pending', ?, ?, ?)`,
    g.id, o.difficulty, g.lang, o.title.trim().slice(0, 80), o.statement.trim().slice(0, 3500), set, lang === "python" ? o.solution : null, uid, now(), `by a student (${lang})`);
  const id = Number(r.meta.last_row_id);
  const c = (await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ?", id))!;
  await run(env, "UPDATE challenges SET skills = ? WHERE id = ?", guessSkills(c).join(","), id);
  return { id, tests: inputs.length, sampleOut: normOut(res.rows[0].o) };
}

/** A multiple-choice question. */
export async function createMcq(env: Env, g: GuildRow, uid: string, o: { title: string; question: string; choices: string; answer: string; explanation: string; difficulty: Difficulty }) {
  const choices = o.choices.replace(/\r/g, "").split("\n").map((x) => x.replace(/^\s*[A-Da-d][).:-]\s*/, "").trim()).filter(Boolean);
  const ans = o.answer.trim().toUpperCase().replace(/[^A-D]/g, "").slice(0, 1);
  if (choices.length !== 4) throw new CreateError("create.four_choices");
  if (!ans) throw new CreateError("create.bad_answer");
  if (o.title.trim().length < 3 || o.question.trim().length < 10) throw new CreateError("create.too_short");
  const r = await run(env,
    `INSERT INTO challenges (guild_id, source, kind, difficulty, lang, title, question, choices, answer, explanation, status, created_by, created_at, topic)
     VALUES (?, 'student', 'mcq', ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 'by a student')`,
    g.id, o.difficulty, g.lang, o.title.trim().slice(0, 80), o.question.trim().slice(0, 1500), JSON.stringify(choices.map((x) => x.slice(0, 200))), ans, o.explanation.trim().slice(0, 800) || null, uid, now());
  const id = Number(r.meta.last_row_id);
  const c = (await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ?", id))!;
  await run(env, "UPDATE challenges SET skills = ? WHERE id = ?", guessSkills(c).join(","), id);
  return { id };
}

/** Teacher's decision (dashboard). */
export async function reviewStudentChallenge(env: Env, g: GuildRow, id: number, approve: boolean, reason = "") {
  const c = await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ? AND guild_id = ? AND source = 'student'", id, g.id);
  if (!c) return null;
  await run(env, "UPDATE challenges SET status = ? WHERE id = ?", approve ? "active" : "archived", id);
  if (c.created_by) {
    if (approve && c.status === "pending") await addPoints(env, g, { discordId: c.created_by, amount: APPROVAL_POINTS, reason: "author", ref: id, note: "challenge approved" });
    await dm(env, c.created_by, { content: t(g.lang, approve ? "create.approved" : "create.rejected", { title: c.title, pts: APPROVAL_POINTS, per: AUTHOR_POINTS, reason: reason ? ` · ${reason}` : "" }) }).catch(() => {});
  }
  return { ok: true };
}

/** Called when someone solves a challenge: its student author gets points (not for their own solves). */
export async function rewardAuthor(env: Env, g: GuildRow, c: ChallengeRow, solverId: string) {
  if (c.source !== "student" || !c.created_by || c.created_by === solverId) return;
  const paid = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM ledger WHERE guild_id = ? AND discord_id = ? AND reason = 'author' AND ref = ? AND note IS NULL", g.id, c.created_by, String(c.id));
  if ((paid?.n ?? 0) >= AUTHOR_MAX_SOLVERS) return;
  await addPoints(env, g, { discordId: c.created_by, amount: AUTHOR_POINTS, reason: "author", ref: c.id });
}

export async function pendingStudentChallenges(env: Env, g: GuildRow) {
  return all<any>(env,
    `SELECT c.id, c.kind, c.difficulty, c.title, c.question, c.choices, c.answer, c.explanation, c.created_by, c.created_at, c.topic, c.test_set, p.name AS author
       FROM challenges c LEFT JOIN players p ON p.guild_id = c.guild_id AND p.discord_id = c.created_by
      WHERE c.guild_id = ? AND c.source = 'student' AND c.status = 'pending' ORDER BY c.id`, g.id);
}
