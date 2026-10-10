// Every code submission says something about the skills it USES, not only the challenge's topic.
// A binary-search solution that crashes on an array index is a mistake in "arrays"; one that
// loops forever or stops one step early is a mistake in "loops". Correct code that uses loops,
// strings or dictionaries is (light) proof the student can use them.
// Sources, most reliable first: the AI review ("SKILLS: loops"), the error message, the words of the review.
import type { AttemptRow, ChallengeRow, Env, GuildRow } from "./types.ts";
import type { Judgement } from "./runner.ts";
import { all, now, run } from "./db.ts";
import { CODE_RULES, SKILLS, TOPIC_RULES, sqlSkills } from "./skills.ts";

/** The everyday building blocks a mistake can be in (what the AI may name). */
export const BASIC_SKILLS = ["basics", "loops", "arrays", "strings", "dicts", "math", "functions", "recursion", "oop", "sorting", "stack", "async"];
export const skillChoices = (lang = "en") =>
  SKILLS.filter((s) => BASIC_SKILLS.includes(s.key)).map((s) => ({ key: s.key, name: lang === "fr" ? s.fr : s.en }));

const ERROR_RULES: [RegExp, string][] = [
  [/IndexError|index (is )?out of (range|bounds)|ArrayIndexOutOfBounds|out_of_range|Undefined (array key|offset) -?\d|Cannot read propert(y|ies) of undefined|undefined offset/i, "arrays"],
  [/StringIndexOutOfBounds|string index out of range|Uninitialized string offset/i, "strings"],
  [/KeyError|Undefined (array )?(key|index) ["']|NoSuchElementException/i, "dicts"],
  [/RecursionError|maximum (call stack|recursion depth)|StackOverflowError|too much recursion/i, "recursion"],
  [/ZeroDivision|division by zero|DivisionByZeroError|ArithmeticException|Modulo by zero/i, "math"],
  [/TypeError|NameError|is not defined|Undefined variable|cannot find symbol|was not declared|incompatible types|unsupported operand|NullPointerException|ValueError: invalid literal|NumberFormatException|UnboundLocalError/i, "basics"],
];

/** Skills a piece of code uses (comments and strings removed first). */
export function skillsInCode(code: string): string[] {
  const clean = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)(#|\/\/).*$/gm, "$1");
  const out: string[] = [];
  for (const [re, k] of CODE_RULES) if (re.test(clean) && BASIC_SKILLS.includes(k) && !out.includes(k)) out.push(k);
  return out.slice(0, 4);
}

/** Where the mistake is, from the error message and the review's words (when the AI didn't say). */
export function mistakeSkills(j: Pick<Judgement, "verdict" | "error" | "failed">, review = "", aiSkills: string[] = []): { skills: string[]; why: string } {
  if (aiSkills.length) return { skills: aiSkills.filter((k) => BASIC_SKILLS.includes(k)).slice(0, 2), why: "AI review" };
  const err = `${j.error ?? ""} ${(j.failed as any)?.error ?? ""}`;
  for (const [re, k] of ERROR_RULES) if (re.test(err)) return { skills: [k], why: `error: ${err.trim().split("\n").pop()!.slice(0, 80)}` };
  if (j.verdict === "compile") return { skills: ["basics"], why: "doesn't compile" };
  const out: string[] = [];
  for (const [re, k] of TOPIC_RULES) if (BASIC_SKILLS.includes(k) && re.test(review) && !out.includes(k)) out.push(k);
  return { skills: out.slice(0, 2), why: "review" };
}

async function save(env: Env, g: GuildRow, a: AttemptRow, rows: { skill: string; ok: boolean; weight: number; why: string }[]) {
  if (!rows.length) return 0;
  // the same mistake again and again in one challenge still counts, but less each time
  const before = await all<{ skill: string; n: number }>(env,
    "SELECT skill, COUNT(*) AS n FROM skill_evidence WHERE attempt_id = ? AND ok = 0 GROUP BY skill", a.id);
  const seen = new Map(before.map((r) => [r.skill, r.n]));
  await env.DB.batch(rows.map((r) => env.DB.prepare(
    "INSERT INTO skill_evidence (guild_id, discord_id, attempt_id, skill, ok, weight, why, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(g.id, a.discord_id, a.id, r.skill, r.ok ? 1 : 0, r.ok ? r.weight : r.weight / (1 + (seen.get(r.skill) ?? 0)), r.why.slice(0, 120), now())));
  return rows.length;
}

/** A write-code submission: correct code proves the skills it uses; a failure lowers the skills of the mistake. */
export async function recordCodeEvidence(env: Env, g: GuildRow, a: AttemptRow, c: ChallengeRow, code: string, j: Judgement, review = "", aiSkills: string[] = []) {
  if (j.judge === "ai") return 0;           // the runner was down: not reliable enough
  const own = (c.skills ?? "").split(",");
  if (j.verdict === "accepted") {
    // the challenge's own skills are already counted by the solve itself
    const used = skillsInCode(code).filter((k) => !own.includes(k));
    return save(env, g, a, used.map((skill) => ({ skill, ok: true, weight: 0.5, why: "used correctly" })));
  }
  const m = mistakeSkills(j, review, aiSkills);
  return save(env, g, a, m.skills.map((skill) => ({ skill, ok: false, weight: 1, why: m.why })));
}

/** A SQL answer: clauses used in a correct query count; a wrong one lowers the clauses it misses. */
export async function recordSqlEvidence(env: Env, g: GuildRow, a: AttemptRow, c: ChallengeRow, query: string, ok: boolean, error = "") {
  const used = sqlSkills(query).filter((k) => k !== "sql");
  const need = sqlSkills(c.solution ?? "").filter((k) => k !== "sql");
  if (ok) return save(env, g, a, used.filter((k) => !(c.skills ?? "").split(",").includes(k)).map((skill) => ({ skill, ok: true, weight: 0.5, why: "used correctly" })));
  const missing = need.filter((k) => !used.includes(k));
  const blame = missing.length ? missing.slice(0, 2) : error ? ["sql_select"] : [];
  return save(env, g, a, blame.map((skill) => ({ skill, ok: false, weight: 1, why: missing.length ? "missing in the query" : `error: ${error.slice(0, 80)}` })));
}
