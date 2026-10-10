// "What to work on" for the teacher: for each skill the student should work on, the EVIDENCE
// behind it, so the teacher can see why: write-code challenges they failed (and how), mistakes
// found in their code on other challenges, and quick questions they missed. No AI: built from their answers.
import type { Env, GuildRow } from "./types.ts";
import { all, now } from "./db.ts";
import { skillName, skillsOf, studentProfile } from "./skills.ts";
import type { SkillScore } from "./skills.ts";
import { roadmapFor } from "./tracks.ts";

export interface Evidence { attempt_id: number; challenge_id: number; title: string; kind: string; difficulty: string; when: number; detail: string }
export interface WorkOn {
  skill: string; name: string; mastery: number; code: number | null; quick: number | null; status: string; level: string;
  why: string;                // one plain sentence
  failedCode: Evidence[];     // write-code / SQL / HackerRank challenges on this skill they didn't solve
  codeMistakes: Evidence[];   // mistakes in this skill found in their code (any challenge)
  missedQuick: Evidence[];    // quick questions on this skill they got wrong
  solved: number;
}

const KIND: Record<string, string> = { mcq: "multiple choice", complexity: "complexity", output: "predict the output", bug: "find the bug", regex: "regex", sql: "SQL query", write: "write code", code: "HackerRank" };
const CODE = ["write", "code", "sql"];

/** How a write-code submission went wrong, in a few words. */
function verdictText(result: string | null): string {
  let j: any = null;
  try { j = result ? JSON.parse(result) : null; } catch { j = null; }
  if (!j) return "no submission";
  const f = j.failed ?? {};
  const where = f.idx ? (f.sample ? ` on sample ${f.idx}` : f.big ? ` on big test ${f.idx}` : ` on hidden test ${f.idx}`) : "";
  switch (j.verdict) {
    case "wrong": return `wrong answer${where} (${j.passed}/${j.total} tests passed)`;
    case "tle": return `too slow${where}`;
    case "runtime": return `crashed${where}${f.error ? `: ${String(f.error).split("\n").pop()!.slice(0, 70)}` : ""}`;
    case "compile": return "doesn't compile";
    case "accepted": return "accepted";
    default: return String(j.verdict ?? "");
  }
}
/** "B" → "B) the text of choice B" when the challenge has choices. */
function choice(r: any, v: string | null): string {
  const t = String(v ?? "").trim();
  let list: string[] = [];
  try { list = JSON.parse(r.choices || "[]"); } catch { list = []; }
  const i = "ABCD".indexOf(t.toUpperCase());
  return t.length === 1 && i >= 0 && list[i] ? `${t}) ${list[i]}` : t;
}
const short = (s: string | null | undefined, n = 160) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

export async function workOn(env: Env, g: GuildRow, uid: string, max = 5): Promise<WorkOn[]> {
  const prof = await studentProfile(env, g, uid);
  const road = [...new Set(roadmapFor(g).map((s) => s.skill))];
  // the skills to look at: weak ones first (failing in code before quiz-only), then "getting there", then any with code mistakes
  const order = (s: SkillScore) => (s.status === "weak" ? 0 : s.codeMistakes >= 2 ? 1 : 2) * 1000 + (s.code == null ? 100 : 0) + s.mastery;
  const pick = prof.skills.filter((s) => s.evidence >= 1 && (s.status !== "strong" || s.codeMistakes >= 2))
    .sort((a, b) => order(a) - order(b) || road.indexOf(a.key) - road.indexOf(b.key)).slice(0, max);
  if (!pick.length) return [];
  const since = now() - 120 * 86400;
  const failed = await all<any>(env,
    `SELECT a.id AS attempt_id, a.status, a.result, a.feedback, a.answer_given, COALESCE(a.finished_at, a.started_at) AS at,
            c.id AS challenge_id, c.title, c.kind, c.difficulty, c.skills, c.test_set, c.hr_slug, c.topic, c.code, c.answer, c.choices
       FROM attempts a JOIN challenges c ON c.id = a.challenge_id
      WHERE a.guild_id = ? AND a.discord_id = ? AND a.status IN ('failed', 'expired') AND COALESCE(a.finished_at, a.started_at) >= ?
      ORDER BY a.id DESC LIMIT 200`, g.id, uid, since);
  const ev = await all<any>(env,
    `SELECT e.skill, e.why, e.created_at, e.attempt_id, a.feedback, a.status, c.id AS challenge_id, c.title, c.kind, c.difficulty
       FROM skill_evidence e JOIN attempts a ON a.id = e.attempt_id JOIN challenges c ON c.id = a.challenge_id
      WHERE e.guild_id = ? AND e.discord_id = ? AND e.ok = 0 AND e.created_at >= ? ORDER BY e.id DESC LIMIT 200`, g.id, uid, since).catch(() => []);

  return pick.map((s) => {
    const on = failed.filter((r) => skillsOf(r).includes(s.key));
    const failedCode: Evidence[] = on.filter((r) => CODE.includes(r.kind)).slice(0, 5).map((r) => ({
      attempt_id: r.attempt_id, challenge_id: r.challenge_id, title: r.title, kind: r.kind, difficulty: r.difficulty, when: r.at,
      detail: r.kind === "code" ? "not solved on HackerRank" : r.status === "expired" ? "started, never finished" : [verdictText(r.result), r.feedback ? `coach: “${short(r.feedback, 140)}”` : ""].filter(Boolean).join(" · "),
    }));
    // one line per challenge where their code showed this mistake (several submissions → one line)
    const seen = new Set<number>();
    const codeMistakes: Evidence[] = [];
    for (const e of ev.filter((x) => x.skill === s.key)) {
      if (seen.has(e.attempt_id) || codeMistakes.length >= 5) continue;
      seen.add(e.attempt_id);
      const n = ev.filter((x) => x.skill === s.key && x.attempt_id === e.attempt_id).length;
      const how = String(e.why ?? "").startsWith("AI review") && e.feedback ? `coach: “${short(e.feedback, 140)}”` : String(e.why ?? "").replace(/^error: /, "error: ");
      codeMistakes.push({ attempt_id: e.attempt_id, challenge_id: e.challenge_id, title: e.title, kind: e.kind, difficulty: e.difficulty, when: e.created_at,
        detail: `${how}${n > 1 ? ` (${n} submissions)` : ""}${e.status === "solved" ? " · solved in the end" : ""}` });
    }
    const missedQuick: Evidence[] = on.filter((r) => !CODE.includes(r.kind)).slice(0, 5).map((r) => ({
      attempt_id: r.attempt_id, challenge_id: r.challenge_id, title: r.title, kind: r.kind, difficulty: r.difficulty, when: r.at,
      detail: r.status === "expired" ? `${KIND[r.kind] ?? r.kind}, not answered` : `${KIND[r.kind] ?? r.kind}: answered “${short(choice(r, r.answer_given), 60)}”${r.answer ? `, right answer “${short(choice(r, r.answer), 60)}”` : ""}`,
    }));
    // the sentence: what the numbers say, from the most telling evidence
    const parts: string[] = [];
    const codeFails = on.filter((r) => CODE.includes(r.kind)).length;
    if (codeFails) parts.push(`didn't solve ${codeFails} code challenge${codeFails > 1 ? "s" : ""} on it`);
    if (seen.size) parts.push(`made mistakes in ${s.key === "basics" ? "basic syntax/variables" : "this"} in their code on ${seen.size} challenge${seen.size > 1 ? "s" : ""}`);
    const qf = on.filter((r) => !CODE.includes(r.kind)).length;
    if (qf) parts.push(`missed ${qf} quick question${qf > 1 ? "s" : ""}`);
    if (s.code == null && s.quick != null) parts.push("hasn't shown it in code yet (quizzes alone count for 20% at most)");
    const why = parts.length ? `${parts[0][0].toUpperCase()}${parts.join(", ").slice(1)}.` : `Few tries so far (${s.solved} solved, ${s.failed} not).`;
    return { skill: s.key, name: skillName(s.key, "en"), mastery: s.mastery, code: s.code, quick: s.quick, status: s.status, level: s.target, why, failedCode, codeMistakes, missedQuick, solved: s.solved };
  });
}
