// Teacher insight: class skill heatmap, targeted practice sets, mistake grouping,
// difficulty check, and the Monday summary.
import type { ChallengeRow, Difficulty, Env, GuildRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { t } from "./i18n.ts";
import { COLORS, dm } from "./discord.ts";
import { SKILL_KEYS, skillName, skillsOf } from "./skills.ts";
import { pickForSkill } from "./coach.ts";
import { weekKey } from "./report.ts";

const W: Record<string, number> = { easy: 1, medium: 2, hard: 3 };

// ------------------------------------------------------------- heatmap
/** Mastery of every student on every skill, from aggregated counts (cheap enough for a whole class). */
export async function classHeatmap(env: Env, g: GuildRow) {
  const rows = await all<{ discord_id: string; skills: string | null; kind: string; difficulty: string; test_set: string | null; hr_slug: string | null; title: string; topic: string | null; ok: number; hinted: number; n: number }>(env,
    `SELECT a.discord_id, c.skills, c.kind, c.difficulty, c.test_set, c.hr_slug, c.title, c.topic,
            (a.status = 'solved') AS ok, (a.used_hint > 0) AS hinted, COUNT(*) AS n
       FROM attempts a JOIN challenges c ON c.id = a.challenge_id
      WHERE a.guild_id = ? AND a.status IN ('solved', 'failed', 'expired') AND a.finished_at >= ?
      GROUP BY a.discord_id, c.id, ok, hinted`, g.id, now() - 120 * 86400);
  const acc = new Map<string, Map<string, { w: number; s: number }>>();
  for (const r of rows) {
    const m = acc.get(r.discord_id) ?? new Map();
    for (const k of skillsOf(r as any)) {
      const e = m.get(k) ?? { w: 0, s: 0 };
      const w = (W[r.difficulty] ?? 1) * r.n;
      e.w += w; e.s += r.ok ? w * (r.hinted ? 0.7 : 1) : 0;
      m.set(k, e);
    }
    acc.set(r.discord_id, m);
  }
  const names = new Map((await all<{ discord_id: string; name: string | null }>(env, "SELECT discord_id, name FROM players WHERE guild_id = ?", g.id)).map((p) => [p.discord_id, p.name]));
  const students = [...acc.entries()].map(([id, m]) => ({
    discord_id: id, name: names.get(id) ?? null,
    skills: Object.fromEntries([...m.entries()].map(([k, e]) => [k, { mastery: Math.round((100 * (e.s + 0.5)) / (e.w + 1)), evidence: Math.round(e.w) }])),
  })).sort((a, b) => String(a.name ?? a.discord_id).localeCompare(String(b.name ?? b.discord_id)));
  const used = SKILL_KEYS.filter((k) => students.some((s) => s.skills[k]));
  const average = Object.fromEntries(used.map((k) => {
    const v = students.map((s) => s.skills[k]).filter((x) => x && x.evidence >= 2);
    return [k, v.length ? Math.round(v.reduce((a, b) => a + b.mastery, 0) / v.length) : null];
  }));
  return { skills: used, average, students };
}

/**
 * Give each chosen student their own practice challenges on one skill, at their level,
 * as assignments (DM + reminder like any assignment).
 */
export async function practiceSet(env: Env, g: GuildRow, o: { skill: string; students: string[]; count: number; dueAt: number | null; note?: string | null },
  levelOf: (uid: string) => Difficulty) {
  const made: { discord_id: string; challenges: number[] }[] = [];
  for (const uid of o.students.slice(0, 40)) {
    const picked: number[] = [];
    for (let i = 0; i < Math.min(5, Math.max(1, o.count)); i++) {
      const c = await pickForSkill(env, g, uid, o.skill, levelOf(uid), { exclude: picked });
      if (!c) break;
      picked.push(c.id);
      await run(env, "INSERT INTO assignments (guild_id, discord_id, challenge_id, due_at, note, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)",
        g.id, uid, c.id, o.dueAt, o.note ?? null, now());
    }
    made.push({ discord_id: uid, challenges: picked });
  }
  return made;
}

// ------------------------------------------------------ mistake grouping
/** Why students fail a challenge: wrong answers grouped by cause, with who and one example. */
export async function challengeMistakes(env: Env, g: GuildRow, c: ChallengeRow) {
  const rows = await all<{ discord_id: string; name: string | null; status: string; answer_given: string | null; result: string | null; lang: string | null; tries: number }>(env,
    `SELECT a.discord_id, p.name, a.status, a.answer_given, a.result, a.lang, a.tries FROM attempts a
       LEFT JOIN players p ON p.guild_id = a.guild_id AND p.discord_id = a.discord_id
      WHERE a.guild_id = ? AND a.challenge_id = ? AND a.status != 'pending' ORDER BY a.id DESC LIMIT 300`, g.id, c.id);
  const groups = new Map<string, { key: string; label: string; count: number; students: { id: string; name: string | null }[]; example?: any }>();
  const add = (key: string, label: string, r: (typeof rows)[number], example?: any) => {
    const e = groups.get(key) ?? { key, label, count: 0, students: [], example };
    e.count++;
    if (e.students.length < 12) e.students.push({ id: r.discord_id, name: r.name });
    groups.set(key, e);
  };
  let solved = 0;
  for (const r of rows) {
    if (r.status === "solved") { solved++; continue; }
    if (c.kind === "write" || c.kind === "sql") {
      let j: any = null;
      try { j = r.result ? JSON.parse(r.result) : null; } catch { j = null; }
      if (!j) { add("none", "No submission", r); continue; }
      const f = j.failed ?? {};
      const where = f.sample ? `sample ${f.idx}` : f.big ? `big test ${f.idx}` : `hidden test ${f.idx}`;
      const label = { wrong: "Wrong answer", tle: "Too slow", runtime: "Crashed", compile: "Doesn't compile" }[j.verdict as string] ?? j.verdict;
      add(`${j.verdict}:${f.idx ?? ""}`, `${label}${f.idx != null && j.verdict !== "compile" ? ` · ${where}` : ""}`, r, { code: r.answer_given?.slice(0, 1500), lang: r.lang, expected: f.expected, got: f.got, error: f.error ?? j.error });
    } else {
      const ans = (r.answer_given ?? "").trim() || "(no answer)";
      add(`ans:${ans.slice(0, 60)}`, c.choices ? `Picked ${ans}` : `Answered “${ans.slice(0, 60)}”`, r);
    }
  }
  // the failing tests' inputs help the teacher see the edge case
  const idxs = [...groups.values()].map((x) => Number(x.key.split(":")[1])).filter((n) => Number.isFinite(n));
  const tests = c.test_set && idxs.length
    ? await all<{ idx: number; input: string | null; gen: string | null; expected: string }>(env, `SELECT idx, input, gen, expected FROM challenge_tests WHERE test_set = ? AND idx IN (${idxs.map(() => "?").join(", ")})`, c.test_set, ...idxs)
    : [];
  for (const gr of groups.values()) {
    const tc = tests.find((x) => x.idx === Number(gr.key.split(":")[1]));
    if (tc && gr.example) gr.example.input = tc.input ? tc.input.slice(0, 400) : tc.gen ? "(generated big input)" : null;
  }
  return { total: rows.length, solved, groups: [...groups.values()].sort((a, b) => b.count - a.count) };
}

// ------------------------------------------------------ difficulty check
/** Challenges whose real success rate doesn't match their label. */
export async function difficultyCheck(env: Env, g: GuildRow) {
  const rows = await all<{ id: number; title: string; kind: string; difficulty: string; n: number; ok: number }>(env,
    `SELECT c.id, c.title, c.kind, c.difficulty, COUNT(*) AS n, SUM(a.status = 'solved' OR (a.status = 'claimed' AND a.verified = 1)) AS ok
       FROM attempts a JOIN challenges c ON c.id = a.challenge_id
      WHERE a.guild_id = ? AND a.status IN ('solved', 'failed', 'claimed') AND c.status = 'active' AND a.origin != 'exam'
      GROUP BY c.id HAVING n >= 6`, g.id);
  const out: { id: number; title: string; kind: string; difficulty: string; attempts: number; rate: number; suggest: string | null; reason: string }[] = [];
  for (const r of rows) {
    const rate = Math.round((100 * r.ok) / r.n);
    let suggest: string | null = null, reason = "";
    if (r.ok === 0) { reason = "nobody solved it: check the statement and the answer"; }
    else if (r.difficulty === "easy" && rate < 30) { suggest = "medium"; reason = `only ${rate}% solve it`; }
    else if (r.difficulty === "medium" && rate < 15) { suggest = "hard"; reason = `only ${rate}% solve it`; }
    else if (r.difficulty === "medium" && rate > 90) { suggest = "easy"; reason = `${rate}% solve it`; }
    else if (r.difficulty === "hard" && rate > 75) { suggest = "medium"; reason = `${rate}% solve it`; }
    else continue;
    out.push({ id: r.id, title: r.title, kind: r.kind, difficulty: r.difficulty, attempts: r.n, rate, suggest, reason });
  }
  return out.sort((a, b) => b.attempts - a.attempts);
}

// ------------------------------------------------------- Monday summary
export async function teacherSummary(env: Env, g: GuildRow) {
  const t0 = now(), week = t0 - 7 * 86400, prev = t0 - 14 * 86400;
  const active = await one<{ n: number }>(env, "SELECT COUNT(DISTINCT discord_id) AS n FROM attempts WHERE guild_id = ? AND started_at >= ?", g.id, week);
  const students = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM players WHERE guild_id = ?", g.id);
  const solved = await one<{ n: number; p: number }>(env,
    `SELECT SUM(a.started_at >= ?) AS n, SUM(a.started_at < ?) AS p FROM attempts a WHERE a.guild_id = ? AND a.status = 'solved' AND a.started_at >= ?`, week, week, g.id, prev);
  const movers = await all<{ discord_id: string; name: string | null; pts: number }>(env,
    `SELECT l.discord_id, p.name, SUM(l.amount) AS pts FROM ledger l LEFT JOIN players p ON p.guild_id = l.guild_id AND p.discord_id = l.discord_id
      WHERE l.guild_id = ? AND l.created_at >= ? AND l.discord_id IS NOT NULL GROUP BY l.discord_id ORDER BY pts DESC LIMIT 3`, g.id, week);
  const quiet = await all<{ discord_id: string; name: string | null }>(env,
    `SELECT p.discord_id, p.name FROM players p WHERE p.guild_id = ?
        AND EXISTS (SELECT 1 FROM attempts a WHERE a.guild_id = p.guild_id AND a.discord_id = p.discord_id AND a.started_at < ? AND a.started_at >= ?)
        AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.guild_id = p.guild_id AND a.discord_id = p.discord_id AND a.started_at >= ?) LIMIT 8`, g.id, week, t0 - 60 * 86400, week);
  const stuck = await all<{ discord_id: string; name: string | null; failed: number }>(env,
    `SELECT a.discord_id, p.name, SUM(a.status = 'failed') AS failed FROM attempts a LEFT JOIN players p ON p.guild_id = a.guild_id AND p.discord_id = a.discord_id
      WHERE a.guild_id = ? AND a.finished_at >= ? GROUP BY a.discord_id HAVING failed >= 4 AND SUM(a.status = 'solved') <= 1 LIMIT 8`, g.id, week);
  const heat = await classHeatmap(env, g);
  const weakest = Object.entries(heat.average).filter(([, v]) => v !== null).sort((a, b) => (a[1] as number) - (b[1] as number))[0];
  const flagged = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM attempts WHERE guild_id = ? AND integrity IS NOT NULL AND reviewed = 0 AND json_extract(integrity, '$.level') > 0", g.id);
  const actions: string[] = [];
  if (weakest) actions.push(`practice:${weakest[0]}`);
  if (quiet.length) actions.push("checkin");
  if (stuck.length) actions.push("stuck");
  if (flagged?.n) actions.push("integrity");
  return {
    week: weekKey(t0), active: active?.n ?? 0, students: students?.n ?? 0, solved: solved?.n ?? 0, solvedPrev: solved?.p ?? 0,
    movers, quiet, stuck, weakest: weakest ? { skill: weakest[0], mastery: weakest[1] } : null, flagged: flagged?.n ?? 0, actions,
  };
}

/** Mondays: DM the summary to the teacher who ran /teacher setup. */
export async function sendTeacherSummaries(env: Env) {
  const t0 = now(), d = new Date(t0 * 1000);
  if (d.getUTCDay() !== 1) return;
  const week = weekKey(t0);
  const g = await one<GuildRow>(env, "SELECT * FROM guilds WHERE teacher_id IS NOT NULL AND daily_hour <= ? AND (last_teacher_digest IS NULL OR last_teacher_digest != ?) LIMIT 1", d.getUTCHours(), week);
  if (!g) return;
  await run(env, "UPDATE guilds SET last_teacher_digest = ? WHERE id = ?", week, g.id);
  const s = await teacherSummary(env, g);
  const L = g.lang;
  const names = (xs: { name: string | null; discord_id: string }[]) => xs.map((x) => x.name ?? x.discord_id).join(", ");
  const lines = [
    t(L, "tsum.numbers", { active: s.active, students: s.students, solved: s.solved, prev: s.solvedPrev }),
    s.movers.length ? t(L, "tsum.movers", { list: s.movers.map((m) => `${m.name ?? m.discord_id} (+${m.pts})`).join(", ") }) : "",
    s.stuck.length ? t(L, "tsum.stuck", { list: names(s.stuck) }) : "",
    s.quiet.length ? t(L, "tsum.quiet", { list: names(s.quiet) }) : "",
    s.weakest ? t(L, "tsum.weakest", { skill: skillName(s.weakest.skill, L), pct: s.weakest.mastery }) : "",
    s.flagged ? t(L, "tsum.flagged", { n: s.flagged }) : "",
    "", t(L, "tsum.actions"),
    ...s.actions.map((a) => "• " + (a.startsWith("practice:") ? t(L, "tsum.do_practice", { skill: skillName(a.split(":")[1], L) }) : t(L, `tsum.do_${a}`))),
    env.DASHBOARD_URL ? `\n${env.DASHBOARD_URL}` : "",
  ].filter((x) => x !== "");
  await dm(env, g.teacher_id!, { embeds: [{ title: t(L, "tsum.title", { name: g.name ?? "" }), description: lines.join("\n").slice(0, 4000), color: COLORS.blue }] }).catch(() => {});
}
