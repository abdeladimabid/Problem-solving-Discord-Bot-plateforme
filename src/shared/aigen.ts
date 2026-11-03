// "✨ Generate with AI" buttons in the dashboard:
//   - a lesson for a skill (in the class's programming languages, English + French)
//   - new challenges for a skill and level (checked like every AI challenge, then tagged)
//   - a GitHub project (statement + tests whose expected outputs come from really running
//     the AI's reference solution)
// plus how many challenges the bank has for each skill and level.
import type { ChallengeRow, Difficulty, Env, GuildRow } from "./types.ts";
import { aiBudgetOk, aiBudgetUse, all } from "./db.ts";
import { chat, extractJson, generateQuick, generateWrite, whyWriteFailed } from "./ai.ts";
import { bankExamples, guildLangs, pickGuildLang, saveGeneratedQuick, saveGeneratedWrite } from "./challenges.ts";
import { SKILLS, guessSkills, setSkills, skillsOf } from "./skills.ts";
import { LANGS, RunnerUnavailable, runOnce } from "./runner.ts";
import type { CodeLang } from "./runner.ts";
import { lessonLinks } from "./lessons.ts";
import { runSqlCases } from "./sqlrx.ts";
import { sqlSkills } from "./skills.ts";
import type { SkillDef } from "./skills.ts";
import { getChallenge } from "./challenges.ts";
import { now, run } from "./db.ts";
import { trackOf } from "./tracks.ts";
import { pathCfg } from "./path.ts";

export class GenError extends Error {}
const DIFFS: Difficulty[] = ["easy", "medium", "hard"];
const skillDef = (key: string, g?: GuildRow) => (g ? pathCfg(g).customSkills.find((s) => s.key === key) : null) || SKILLS.find((s) => s.key === key);
const langLabel = (l: string) => LANGS[l as CodeLang]?.label ?? l;

// ----------------------------------------------------------------- lesson
/** A link the AI proposes is kept only if it really opens (https, answers 2xx/3xx in a few seconds). */
async function linkWorks(url: string): Promise<boolean> {
  if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s<>()"']*)?$/i.test(url) || url.length > 300) return false;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
  try {
    let r = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; ClassBot lesson link check)" } });
    if (r.status === 405 || r.status === 403) r = await fetch(url, { method: "GET", redirect: "follow", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; ClassBot lesson link check)" } });
    return r.status < 400;
  } catch { return false; } finally { clearTimeout(t); }
}
/** Searches that always work: the topic on MDN/Google/YouTube, in the lesson's language. */
function searchLinks(topic: string, fr: boolean): [string, string][] {
  const q = encodeURIComponent(`${topic} ${fr ? "tutoriel débutant" : "beginner tutorial"}`);
  return [[fr ? `Vidéos : ${topic}` : `Videos: ${topic}`, `https://www.youtube.com/results?search_query=${q}`], [fr ? `Rechercher : ${topic}` : `Search: ${topic}`, `https://www.google.com/search?q=${q}`]];
}
export async function writeLesson(env: Env, g: GuildRow, skill: string, hint = "", custom?: SkillDef | null): Promise<{ en: string; fr: string }> {
  const s = custom || skillDef(skill, g) || (/^[a-z0-9_]{1,30}$/.test(skill) ? { key: skill, en: skill.replace(/_/g, " "), fr: skill.replace(/_/g, " "), emoji: "📘" } : null);
  if (!s) throw new GenError("unknown skill");
  if (!(await aiBudgetOk(env, 2))) throw new GenError("ClassBot's free AI is used up for this class today: add your own AI key in Settings → AI (free with Groq or Gemini), or try again tomorrow.");
  await aiBudgetUse(env, 2);
  const tr = trackOf(g);
  const langs = tr.family === "sql" ? "SQL (SQLite)" : tr.family === "mern" ? "JavaScript (the MERN stack: MongoDB, Express, React, Node)"
    : tr.family === "ai" ? "Python (pandas, scikit-learn, LLM libraries)" : langLabel(tr.code ?? guildLangs(g)[0]);
  const codeLang = [tr.code ?? guildLangs(g)[0]];
  // links we know exist first; the AI may add official documentation pages, each one checked before it's kept
  const linksEn = lessonLinks(skill, "en", codeLang), linksFr = lessonLinks(skill, "fr", codeLang);
  const fmt = (ls: [string, string][]) => ls.map(([l, u]) => `${l} — ${u}`).join("\n") || "(none)";
  const wishes = hint.trim().slice(0, 800);
  const system = `You write a lesson for BEGINNER students (first year of a web/software development course). Topic: "${s.en}" (French: "${s.fr}"). The class programs in ${langs}.
It is read in Discord before they practise: it must TEACH the topic, with real, accurate, useful information, not generalities.

CONTENT (in this order, Markdown for Discord, 2200 to 3400 characters per language):
**${s.en}**
1. What it is and why it matters, in 2-3 sentences, with ONE everyday comparison.
2. **Key ideas** (or **L'essentiel**): 4 to 6 bullet points: the vocabulary, the rules and the commands/syntax they must know, each one explained in one line.
3. **Example**: ONE code block that fits the TOPIC (a Dockerfile and shell commands for Docker, SQL for databases, Git commands for Git, ${langs} for programming notions), 6 to 15 lines, commented, realistic (a small project a student could do). Fence with the right language (\`\`\`dockerfile, \`\`\`bash, \`\`\`sql, \`\`\`js, \`\`\`php, \`\`\`py, \`\`\`html, \`\`\`css…). Then one sentence on what it does / what it prints.
4. **Common mistakes** (or **Erreurs fréquentes**): 2 or 3 mistakes beginners really make, each with how to avoid it.
5. **Try it** (or **À toi**): one small exercise (2-3 lines) they can do in 10 minutes.
6. 💡 one practical tip.
(Resources are added after your text: do NOT write links in "en" or "fr".)

RESOURCES: in "resources", 3 to 5 pages of OFFICIAL documentation or well-known tutorials (MDN, docs.docker.com, php.net, dev.mysql.com, git-scm.com, react.dev, nodejs.org, developer.mozilla.org, w3schools, OpenClassrooms, freeCodeCamp…) that you are SURE exist, each {"title": "…", "url": "https://…", "lang": "en" or "fr"}. Prefer French pages for "fr" when they exist. Each link is opened to check it: a wrong one is dropped.
Known good links you can reuse: English:\n${fmt(linksEn)}\nFrench:\n${fmt(linksFr)}

Write it twice: "en" in English and "fr" in French (title "**${s.fr}**"). Code identical in both.${wishes ? `

THE TEACHER'S REQUIREMENTS — follow EVERY one of them exactly; they come before the rules above (length, sections, example, tone). If they ask for a specific example, notion, comparison, exercise or level, it MUST be in both languages:
${wishes}` : ""}
Answer ONLY with JSON: {"en": "...", "fr": "...", "resources": [{"title": "...", "url": "...", "lang": "en"}], "followed": ["each teacher requirement, and where you applied it"]}`;
  const raw = await chat(env, [
    { role: "system", content: system },
    { role: "user", content: wishes ? `Write the lesson on "${s.en}". My requirements (mandatory): ${wishes}` : `Write the lesson on "${s.en}".` },
  ], { maxTokens: 7000, temperature: 0.3, timeoutMs: 120000, json: true }).catch(() => "");
  let j: any = null;
  try { j = extractJson(raw); } catch { j = null; }
  if (!j?.en || !j?.fr) throw new GenError("The AI couldn't write the lesson right now. Try again in a minute.");
  // the resources: ours, then the AI's that really open (checked at the same time), then searches that always work
  const proposed = (Array.isArray(j.resources) ? j.resources : []).slice(0, 8)
    .map((r: any) => ({ title: String(r?.title ?? "").replace(/[[\]\n]/g, " ").trim().slice(0, 80), url: String(r?.url ?? "").trim(), lang: r?.lang === "fr" ? "fr" : "en" }))
    .filter((r: { title: string; url: string }) => r.title && r.url);
  const ok = await Promise.all(proposed.map((r: { url: string }) => linkWorks(r.url)));
  const checked = proposed.filter((_: unknown, i: number) => ok[i]);
  const list = (fr: boolean) => {
    const seen = new Set<string>();
    const out: [string, string][] = [];
    for (const [t, u] of [...(fr ? linksFr : linksEn), ...checked.filter((r: { lang: string }) => (r.lang === "fr") === fr).map((r: { title: string; url: string }) => [r.title, r.url] as [string, string]),
      ...checked.filter((r: { lang: string }) => (r.lang === "fr") !== fr).map((r: { title: string; url: string }) => [r.title, r.url] as [string, string]), ...searchLinks(fr ? s.fr : s.en, fr)]) {
      if (seen.has(u) || out.length >= 6) continue;
      seen.add(u); out.push([t, u]);
    }
    return `\n\n📚 **${fr ? "Ressources pour aller plus loin :" : "Resources to learn more:"}**\n${out.map(([t, u]) => `• [${t}](${u})`).join("\n")}`;
  };
  // never a link the AI wrote in the text itself (unchecked): only the list above
  const clean = (x: unknown) => String(x).replace(/\n*📚[^\n]*(\n[•*-][^\n]*)*/g, "").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1").trim();
  const fit = (body: string, tail: string) => {
    if (body.length + tail.length <= 3950) return body + tail;
    let b = body.slice(0, 3950 - tail.length - 8).replace(/\n[^\n]*$/, "");
    if ((b.match(/```/g) || []).length % 2) b += "\n```";   // never a code block left open
    return b + tail;
  };
  return { en: fit(clean(j.en), list(false)), fr: fit(clean(j.fr), list(true)) };
}

// -------------------------------------------------------------- challenges
export type GenKind = "write" | "quick" | "mcq" | "output" | "bug" | "complexity";
export const NO_RUN = ["node", "express", "mongodb", "react", "ai_data", "ai_ml", "ai_llm", "ai_rag", "web"];
/** One new challenge for a skill (saved in the bank, tagged with the skill). */
export async function challengeForSkill(env: Env, g: GuildRow, o: { skill?: string | null; difficulty: Difficulty; kind: GenKind; topic?: string | null; codeLang?: string | null }): Promise<ChallengeRow> {
  const s = o.skill ? (skillDef(o.skill, g) || (/^[a-z0-9_]{1,30}$/.test(o.skill) ? { key: o.skill, en: o.skill.replace(/_/g, " "), fr: o.skill.replace(/_/g, " "), emoji: "📘" } : null)) : null;
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
      if (!w) throw new GenError(`The AI couldn't produce a problem that passed its own checks: ${whyWriteFailed()}. Try again.`);
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
