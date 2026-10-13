// "✨ Generate with AI" buttons in the dashboard:
//   - a lesson for a skill (in the class's programming languages, English + French)
//   - new challenges for a skill and level (checked like every AI challenge, then tagged)
//   - a GitHub project (statement + tests whose expected outputs come from really running
//     the AI's reference solution)
// plus how many challenges the bank has for each skill and level.
import type { ChallengeRow, Difficulty, Env, GuildRow } from "./types.ts";
import { aiBudgetOk, aiBudgetUse, all } from "./db.ts";
import { chat, extractJson, generateQuick, generateWrite } from "./ai.ts";
import { bankExamples, guildLangs, pickGuildLang, saveGeneratedQuick, saveGeneratedWrite } from "./challenges.ts";
import { SKILLS, guessSkills, setSkills, skillsOf } from "./skills.ts";
import { LANGS, RunnerUnavailable, runOnce } from "./runner.ts";
import type { CodeLang } from "./runner.ts";
import { lessonLinks } from "./lessons.ts";
import { runSqlCases } from "./sqlrx.ts";
import { sqlSkills } from "./skills.ts";
import { getChallenge } from "./challenges.ts";
import { now, run } from "./db.ts";
import { trackOf } from "./tracks.ts";

export class GenError extends Error {}
const DIFFS: Difficulty[] = ["easy", "medium", "hard"];
const skillDef = (key: string) => SKILLS.find((s) => s.key === key);
const langLabel = (l: string) => LANGS[l as CodeLang]?.label ?? l;

// ----------------------------------------------------------------- lesson
export async function writeLesson(env: Env, g: GuildRow, skill: string, hint = ""): Promise<{ en: string; fr: string }> {
  const s = skillDef(skill);
  if (!s) throw new GenError("unknown skill");
  if (!(await aiBudgetOk(env, 2))) throw new GenError("ClassBot's free AI is used up for this class today: add your own AI key in Settings → AI (free with Groq or Gemini), or try again tomorrow.");
  await aiBudgetUse(env, 2);
  const tr = trackOf(g);
  const langs = tr.family === "sql" ? "SQL (SQLite)" : tr.family === "mern" ? "JavaScript (the MERN stack: MongoDB, Express, React, Node)"
    : tr.family === "ai" ? "Python (pandas, scikit-learn, LLM libraries)" : langLabel(tr.code ?? guildLangs(g)[0]);
  const codeLang = [tr.code ?? guildLangs(g)[0]];
  // the AI may only use links we know exist (it invents URLs otherwise)
  const linksEn = lessonLinks(skill, "en", codeLang), linksFr = lessonLinks(skill, "fr", codeLang);
  const fmt = (ls: [string, string][]) => ls.map(([l, u]) => `[${l}](${u})`).join(" · ") || "(none)";
  const raw = await chat(env, [
    { role: "system", content: `You write lessons for complete BEGINNERS in programming (first-year students). Topic: "${s.en}". The class programs in ${langs}.
Rules: simple words, short sentences, no jargon without explaining it. Start with an everyday comparison (cooking, a queue at the bakery, lockers…).
Format (Markdown for Discord), at most 1000 characters per language:
**${s.en}**
2 to 4 short sentences: what it is, with the everyday comparison, and why it's useful.
ONE code block in the class's language (fence: \`\`\`sql, \`\`\`js, \`\`\`php, \`\`\`py, \`\`\`java, \`\`\`c, \`\`\`cpp), 3 to 8 lines, a tiny example with the printed result as a comment (// 8).
💡 one beginner tip.
📚 **Learn more:** then the links below, exactly as given (never invent a link).
Write it twice: "en" in English and "fr" in French (French title: "${s.fr}", "📚 **Pour aller plus loin :**"). Code stays identical.
English links: ${fmt(linksEn)}
French links: ${fmt(linksFr)}
Answer ONLY with JSON: {"en": "...", "fr": "..."}` },
    { role: "user", content: hint ? `Teacher's wishes: ${hint.slice(0, 500)}` : "Write the lesson." },
  ], { maxTokens: 2200, temperature: 0.3, timeoutMs: 90000 }).catch(() => "");
  let j: any = null;
  try { j = extractJson(raw); } catch { j = null; }
  if (!j?.en || !j?.fr) throw new GenError("The AI couldn't write the lesson right now. Try again in a minute.");
  return { en: String(j.en).slice(0, 3500), fr: String(j.fr).slice(0, 3500) };
}

// -------------------------------------------------------------- challenges
export type GenKind = "write" | "quick" | "mcq" | "output" | "bug" | "complexity";
export const NO_RUN = ["node", "express", "mongodb", "react", "ai_data", "ai_ml", "ai_llm", "ai_rag", "web"];
/** One new challenge for a skill (saved in the bank, tagged with the skill). */
export async function challengeForSkill(env: Env, g: GuildRow, o: { skill?: string | null; difficulty: Difficulty; kind: GenKind; topic?: string | null; codeLang?: string | null }): Promise<ChallengeRow> {
  const s = o.skill ? skillDef(o.skill) : null;
  if (o.skill && !s) throw new GenError("unknown skill");
  if (o.skill === "sql" || o.skill?.startsWith("sql_")) return sqlChallenge(env, g, { skill: o.skill === "sql" ? "sql_select" : o.skill, difficulty: o.difficulty, topic: o.topic });
  if (["regex", "git"].includes(o.skill ?? "")) throw new GenError("Regex and Git challenges come from the verified bank: the AI can't check them yet. Pick another skill.");
  // code from React, Express, MongoDB or AI libraries can't run on the judge: multiple choice / find the bug only
  if (NO_RUN.includes(o.skill ?? "") && (o.kind === "output" || o.kind === "write" || o.kind === "quick")) o = { ...o, kind: "mcq" };
  const difficulty = DIFFS.includes(o.difficulty) ? o.difficulty : "medium";
  const topic = [s?.en, o.topic].filter(Boolean).join(": ") || null;
  let c: ChallengeRow | null;
  try {
    if (o.kind === "write") {
      const w = await generateWrite(env, { difficulty, topic, lang: g.lang });
      if (!w) throw new GenError("The AI couldn't produce a problem that passed its own checks (busy or daily limit reached). Try again.");
      c = await saveGeneratedWrite(env, g, w, difficulty, "ai", "ai");
    } else {
      const codeLang = o.codeLang && guildLangs(g).includes(o.codeLang) ? o.codeLang : pickGuildLang(g);
      const kind = o.kind === "quick" ? null : o.kind;
      const q = await generateQuick(env, { difficulty, kind, topic, lang: g.lang, codeLang, examples: await bankExamples(env, g, kind, difficulty, codeLang) });
      if (!q) throw new GenError("The AI couldn't produce a checked challenge right now (busy or daily limit reached). Try again.");
      c = await saveGeneratedQuick(env, g, q, difficulty, "ai", codeLang);
    }
  } catch (e) {
    if (e instanceof RunnerUnavailable) throw new GenError("The code runner is unreachable right now, so the challenge can't be checked. Try again later.");
    throw e;
  }
  if (!c) throw new GenError("saving failed");
  const tags = [...new Set([...(o.skill ? [o.skill] : []), ...guessSkills(c)])].slice(0, 3);
  await setSkills(env, c.id, tags);
  return { ...c, skills: tags.join(",") } as ChallengeRow;
}

/** How many active challenges the class can get, per skill and level ("loops-easy": 12). */
export async function bankCoverage(env: Env, g: GuildRow): Promise<Record<string, number>> {
  const langs = guildLangs(g);
  const rows = await all<any>(env,
    `SELECT skills, difficulty, kind, title, topic, question, code, test_set, hr_slug FROM challenges WHERE status = 'active' AND (guild_id IS NULL OR guild_id = ?) AND (lang = ? OR lang = 'any')
       AND kind != 'code' AND (code_lang IS NULL OR kind IN ('write', 'sql', 'regex') OR code_lang IN (${langs.map(() => "?").join(", ")}))`,
    g.id, g.lang, ...langs);
  const out: Record<string, number> = {};
  for (const r of rows) for (const k of skillsOf(r)) out[`${k}-${r.difficulty}`] = (out[`${k}-${r.difficulty}`] ?? 0) + 1;   // untagged ones: best guess
  return out;
}


// -------------------------------------------------------------------- SQL
const SQL_FOCUS: Record<string, string> = {
  sql_select: "choosing columns with SELECT ... FROM (maybe renaming with AS, DISTINCT)",
  sql_filter: "filtering rows with WHERE (comparisons, AND/OR, LIKE, IN, BETWEEN, IS NULL)",
  sql_sort: "sorting with ORDER BY (ASC/DESC, several columns) and LIMIT",
  sql_agg: "aggregate functions COUNT, SUM, AVG, MIN, MAX over a whole table or a filtered part",
  sql_group: "GROUP BY with aggregates, and HAVING to filter groups",
  sql_join: "joining two or three tables with JOIN ... ON (and LEFT JOIN when rows may have no match)",
  sql_sub: "a subquery inside WHERE or FROM (IN (SELECT ...), comparison with (SELECT AVG ...))",
  sql_change: "a SELECT that checks the effect of data rules (the student still writes ONE SELECT query): e.g. find rows that an UPDATE would change",
  sql_design: "reading a schema with keys and relationships: a SELECT that uses foreign keys correctly",
};
/** A SQL challenge written by the AI and proven by running its reference query on every dataset. */
export async function sqlChallenge(env: Env, g: GuildRow, o: { skill: string; difficulty: Difficulty; topic?: string | null }): Promise<ChallengeRow> {
  const difficulty = DIFFS.includes(o.difficulty) ? o.difficulty : "easy";
  const language = g.lang === "fr" ? "French" : "English";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await aiBudgetOk(env, 3))) throw new GenError("ClassBot's free AI is used up for this class today: add your own AI key in Settings → AI (free with Groq or Gemini), or try again tomorrow.");
    await aiBudgetUse(env, 3);
    const raw = await chat(env, [
      { role: "system", content: `You write SQL exercises (SQLite) for ${difficulty} level students. Focus: ${SQL_FOCUS[o.skill] ?? "SELECT queries"}.${o.topic ? " Theme: " + o.topic + "." : ""}
The student writes ONE SELECT query. Write all text in ${language}. Use a small realistic schema (2 or 3 tables, simple names in English: students, courses, orders…).
Answer ONLY with JSON:
{"title": "short title",
 "question": "what to return, the exact columns in order, and the exact sort order (always ask for an ORDER BY that makes the order unique, unless order doesn't matter)",
 "schema": "CREATE TABLE statements only",
 "sample": "INSERT statements for the dataset shown to the student (6 to 12 rows per table)",
 "hidden": ["INSERT statements for a 2nd dataset with tricky cases (ties, NULLs, no match)", "INSERT statements for a 3rd dataset"],
 "query": "the correct SELECT query",
 "ordered": true,
 "hint": "one short hint"}` },
      { role: "user", content: "Write the exercise." },
    ], { maxTokens: 2500, temperature: 0.5, timeoutMs: 90000 }).catch(() => "");
    let j: any = null;
    try { j = extractJson(raw); } catch { j = null; }
    if (!j?.schema || !j?.sample || !j?.query || !Array.isArray(j.hidden) || !j.hidden.length) continue;
    if (!/^\s*(select|with)\b/i.test(j.query) || /;\s*\S/.test(String(j.query).trim().replace(/;\s*$/, ""))) continue;
    const cases = [String(j.sample), ...j.hidden.slice(0, 3).map(String)].map((d) => `${j.schema}\n${d}`);
    let res;
    try { res = await runSqlCases(env, String(j.query), cases); } catch (e) {
      if (e instanceof RunnerUnavailable) throw new GenError("The code runner is unreachable, so the SQL can't be checked. Try again later.");
      throw e;
    }
    // every dataset must run, the shown one must return rows, and the query must train the asked skill
    if (res.some((r) => r.error) || !res[0]?.rows?.length) continue;
    const tags = sqlSkills(String(j.query));
    if (!tags.includes(o.skill) && o.skill !== "sql_select" && o.skill !== "sql_change" && o.skill !== "sql_design") continue;
    const set = `ai-sql-${crypto.randomUUID().slice(0, 8)}`;
    await env.DB.batch(cases.map((input, i) => env.DB.prepare("INSERT INTO challenge_tests (test_set, idx, input, gen, expected, sample) VALUES (?, ?, ?, NULL, ?, ?)")
      .bind(set, i, input, JSON.stringify(res[i].rows), i === 0 ? 1 : 0)));
    const r = await run(env,
      `INSERT INTO challenges (guild_id, source, kind, difficulty, lang, title, question, code, answer, hint, topic, test_set, time_limit, solution, status, created_by, created_at)
       VALUES (?, 'ai', 'sql', ?, ?, ?, ?, ?, ?, ?, 'sql', ?, 2, ?, 'active', 'ai', ?)`,
      g.id, difficulty, g.lang, String(j.title).slice(0, 100), String(j.question).slice(0, 1500), `${j.schema}\n${j.sample}`.slice(0, 6000),
      j.ordered === false ? "unordered" : "ordered", String(j.hint ?? "").slice(0, 300) || null, set, String(j.query), now());
    const c = (await getChallenge(env, Number(r.meta.last_row_id)))!;
    const skills = [...new Set([o.skill, ...tags, "sql"])].slice(0, 4);
    await setSkills(env, c.id, skills);
    return { ...c, skills: skills.join(",") } as ChallengeRow;
  }
  throw new GenError("The AI couldn't write a SQL exercise that passed its checks. Try again.");
}
