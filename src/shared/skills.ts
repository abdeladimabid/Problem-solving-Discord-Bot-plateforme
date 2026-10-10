// The skill map: which skills each challenge trains, how well each student
// masters them, and what kind of mistakes they make.
import type { ChallengeRow, Env, GuildRow } from "./types.ts";
import { all, run } from "./db.ts";

export interface SkillDef { key: string; en: string; fr: string; emoji: string }

// In teaching order: it is also the order of /path.
export const SKILLS: SkillDef[] = [
  { key: "basics", en: "Variables & conditions", fr: "Variables et conditions", emoji: "🧱" },
  { key: "loops", en: "Loops", fr: "Boucles", emoji: "🔁" },
  { key: "strings", en: "Strings", fr: "Chaînes", emoji: "🔤" },
  { key: "arrays", en: "Arrays & lists", fr: "Tableaux et listes", emoji: "📚" },
  { key: "functions", en: "Functions & scope", fr: "Fonctions et portée", emoji: "🧩" },
  { key: "dicts", en: "Dictionaries & sets", fr: "Dictionnaires et ensembles", emoji: "🗂️" },
  { key: "oop", en: "Objects & classes", fr: "Objets et classes", emoji: "🏗️" },
  { key: "math", en: "Math tricks", fr: "Astuces de maths", emoji: "🔢" },
  { key: "sorting", en: "Sorting", fr: "Tri", emoji: "📶" },
  { key: "complexity", en: "Complexity (Big-O)", fr: "Complexité (grand O)", emoji: "⏱️" },
  { key: "recursion", en: "Recursion", fr: "Récursivité", emoji: "🪆" },
  { key: "stack", en: "Stacks & queues", fr: "Piles et files", emoji: "🥞" },
  { key: "twopointers", en: "Two pointers & sliding window", fr: "Deux pointeurs et fenêtre glissante", emoji: "👉" },
  { key: "prefix", en: "Prefix sums", fr: "Sommes préfixes", emoji: "➕" },
  { key: "binsearch", en: "Binary search", fr: "Recherche dichotomique", emoji: "🎯" },
  { key: "greedy", en: "Greedy", fr: "Glouton", emoji: "🍰" },
  { key: "dp", en: "Dynamic programming", fr: "Programmation dynamique", emoji: "🧮" },
  { key: "graphs", en: "Graphs", fr: "Graphes", emoji: "🕸️" },
  { key: "async", en: "Asynchronous code", fr: "Code asynchrone", emoji: "⏳" },
  { key: "sql", en: "SQL", fr: "SQL", emoji: "🗄️" },
  { key: "regex", en: "Regular expressions", fr: "Expressions régulières", emoji: "🔎" },
  { key: "git", en: "Git", fr: "Git", emoji: "🌿" },
  { key: "web", en: "Web development", fr: "Développement web", emoji: "🌐" },
  // SQL track
  { key: "sql_select", en: "SQL: SELECT basics", fr: "SQL : bases de SELECT", emoji: "📋" },
  { key: "sql_filter", en: "SQL: filtering with WHERE", fr: "SQL : filtrer avec WHERE", emoji: "🔍" },
  { key: "sql_sort", en: "SQL: ORDER BY & LIMIT", fr: "SQL : ORDER BY et LIMIT", emoji: "↕️" },
  { key: "sql_agg", en: "SQL: COUNT, SUM, AVG", fr: "SQL : COUNT, SUM, AVG", emoji: "🧮" },
  { key: "sql_group", en: "SQL: GROUP BY & HAVING", fr: "SQL : GROUP BY et HAVING", emoji: "🧺" },
  { key: "sql_join", en: "SQL: JOIN", fr: "SQL : jointures", emoji: "🔗" },
  { key: "sql_sub", en: "SQL: subqueries", fr: "SQL : sous-requêtes", emoji: "🪆" },
  { key: "sql_change", en: "SQL: INSERT, UPDATE, DELETE", fr: "SQL : INSERT, UPDATE, DELETE", emoji: "✏️" },
  { key: "sql_design", en: "SQL: tables & keys", fr: "SQL : tables et clés", emoji: "🏛️" },
  // MERN track
  { key: "node", en: "Node.js", fr: "Node.js", emoji: "🟩" },
  { key: "express", en: "Express & REST APIs", fr: "Express et API REST", emoji: "🚏" },
  { key: "mongodb", en: "MongoDB", fr: "MongoDB", emoji: "🍃" },
  { key: "react", en: "React", fr: "React", emoji: "⚛️" },
  // AI & LLMs track
  { key: "ai_data", en: "Data with pandas", fr: "Données avec pandas", emoji: "📊" },
  { key: "ai_ml", en: "Machine learning basics", fr: "Bases du machine learning", emoji: "🧠" },
  { key: "ai_llm", en: "Using an LLM", fr: "Utiliser un LLM", emoji: "💬" },
  { key: "ai_rag", en: "Embeddings & RAG", fr: "Embeddings et RAG", emoji: "📚" },
];
export const SKILL_KEYS = SKILLS.map((s) => s.key);
export const skillName = (key: string, lang: string) => {
  const s = SKILLS.find((x) => x.key === key);
  return s ? `${s.emoji} ${lang === "fr" ? s.fr : s.en}` : key;
};

// ------------------------------------------------------------- tagging
// Hand-tagged: the built-in write-code problems and the HackerRank problems.
const BY_SET: Record<string, string[]> = {
  "second-largest": ["arrays", "loops"], "run-length": ["strings", "loops"], "balanced-brackets": ["stack", "strings"],
  "longest-plateau": ["arrays", "loops"], "anagram-groups": ["dicts", "strings", "sorting"], "digit-rounds": ["math", "loops"],
  "lis": ["dp", "binsearch"], "inversions": ["sorting", "recursion"], "cheapest-route": ["graphs"], "window-max-sum": ["twopointers", "stack"],
  "histogram": ["stack"], "edit-distance": ["dp", "strings"], "subarray-sum-k": ["prefix", "dicts"], "longest-unique": ["twopointers", "dicts", "strings"],
  "covered-length": ["sorting", "greedy"], "meeting-rooms": ["sorting", "greedy"], "grid-escape": ["graphs"], "coin-combinations": ["dp"],
};
const BY_SLUG: Record<string, string[]> = {
  "solve-me-first": ["basics"], "simple-array-sum": ["arrays", "loops"], "compare-the-triplets": ["arrays", "basics"], "a-very-big-sum": ["arrays", "loops"],
  "diagonal-difference": ["arrays", "loops"], "plus-minus": ["arrays", "loops"], "staircase": ["loops", "strings"], "mini-max-sum": ["arrays", "sorting"],
  "birthday-cake-candles": ["arrays"], "time-conversion": ["strings", "basics"], "grading": ["basics", "loops"], "apple-and-orange": ["arrays", "loops"],
  "kangaroo": ["math", "basics"], "between-two-sets": ["math", "loops"], "breaking-best-and-worst-records": ["arrays", "loops"], "migratory-birds": ["dicts", "arrays"],
  "sock-merchant": ["dicts"], "counting-valleys": ["strings", "loops"], "electronics-shop": ["arrays", "loops"], "cats-and-a-mouse": ["basics"],
  "picking-numbers": ["dicts", "arrays"], "the-hurdle-race": ["arrays"], "designer-pdf-viewer": ["strings", "arrays"], "utopian-tree": ["loops", "math"],
  "angry-professor": ["arrays", "loops"], "beautiful-days-at-the-movies": ["math", "loops"], "strange-advertising": ["loops", "math"], "save-the-prisoner": ["math"],
  "circular-array-rotation": ["arrays", "math"], "jumping-on-the-clouds": ["greedy", "arrays"], "repeated-string": ["strings", "math"], "equality-in-a-array": ["dicts", "arrays"],
  "cut-the-sticks": ["sorting", "arrays"], "find-digits": ["math", "loops"], "divisible-sum-pairs": ["arrays", "loops"], "drawing-book": ["math", "basics"],
  "camelcase": ["strings"], "mars-exploration": ["strings"], "pangrams": ["strings", "dicts"], "alternating-characters": ["strings"],
  "caesar-cipher-1": ["strings"], "funny-string": ["strings"], "making-anagrams": ["strings", "dicts"], "two-strings": ["strings", "dicts"],
  "marcs-cakewalk": ["greedy", "sorting"], "grid-challenge": ["sorting", "strings"], "crush": ["prefix"], "matrix-rotation-algo": ["arrays"],
  "maximum-subarray-sum": ["prefix", "binsearch"], "poisonous-plants": ["stack"], "queries-with-fixed-length": ["twopointers", "stack"], "and-xor-or": ["stack"],
  "climbing-the-leaderboard": ["binsearch", "arrays"], "extra-long-factorials": ["math"], "magic-square-forming": ["arrays", "math"], "the-time-in-words": ["strings", "basics"],
  "organizing-containers-of-balls": ["sorting", "math"], "encryption": ["strings", "math"], "bigger-is-greater": ["strings", "greedy"], "queens-attack-2": ["arrays", "math"],
  "non-divisible-subset": ["math", "dicts"], "3d-surface-area": ["arrays", "loops"], "absolute-permutation": ["math", "greedy"], "the-grid-search": ["strings", "arrays"],
  "almost-sorted": ["sorting", "arrays"], "larrys-array": ["sorting", "math"], "bomber-man": ["arrays", "loops"], "coin-change": ["dp"],
  "sherlock-and-valid-string": ["dicts", "strings"], "common-child": ["dp", "strings"], "sherlock-and-anagrams": ["dicts", "strings"], "pairs": ["dicts", "binsearch"],
  "journey-to-the-moon": ["graphs"], "count-triplets-1": ["dicts"], "frequency-queries": ["dicts"], "candies": ["greedy", "dp"], "abbr": ["dp", "strings"],
  "largest-rectangle": ["stack"],
};
// Topic words (from the challenge's topic, title or statement) → skills
const TOPIC_RULES: [RegExp, string][] = [
  [/\breact\b|usestate|useeffect|\bjsx\b|\bprops\b|component/i, "react"],
  [/\bexpress\b|middleware|\bapp\.(get|post|use)\b|rest api|endpoint/i, "express"],
  [/mongo|mongoose|\bnosql\b|collection|document database/i, "mongodb"],
  [/node\.?js|\bnpm\b|require\(|\bfs\.|event emitter/i, "node"],
  [/\bpandas\b|dataframe|\bnumpy\b|\bcsv\b/i, "ai_data"],
  [/machine learning|scikit|sklearn|overfit|train(ing)? set|classifier|regression model/i, "ai_ml"],
  [/\bllm\b|language model|prompt|chatbot|token(s|izer)?\b|temperature/i, "ai_llm"],
  [/embedding|\brag\b|retrieval|vector (search|database|store)|similarity search/i, "ai_rag"],
  [/\bsql\b|select\s.+\sfrom\b|\bjoin\b.*\bon\b/i, "sql"],
  [/\bregex|regular expression|expression régulière|preg_match|\bRegExp\b/i, "regex"],
  [/\bgit\b|\bcommit\b|\brebase\b|\bcheckout\b|\bstash\b/i, "git"],
  [/\bhttp\b|\bhtml\b|\bjson\b|\burl\b|\broute|status code|\bapi\b|cookie|session|\bdom\b|\bforms?\b|validat|\bslug|security|login/i, "web"],
  [/promise|async|await|event loop|settimeout|callback/i, "async"],
  [/\bclass|\bobject|inherit|prototype|\bthis\b|\bstatic\b|\bmethods?\b|\boop\b|getter|constructor/i, "oop"],
  [/closure|hoisting|scope|default argument|higher-order|function|lambda|arrow|generator/i, "functions"],
  [/dynamic programming|\bdp\b|memoi|knapsack|subsequence|edit distance/i, "dp"],
  [/graph|bfs|dfs|dijkstra|union-find|shortest path|tree|maze|grid escape/i, "graphs"],
  [/binary search|dichoto|bisect/i, "binsearch"],
  [/prefix sum|cumulative|somme préfixe/i, "prefix"],
  [/two pointers|sliding window|fenêtre|deux pointeurs/i, "twopointers"],
  [/stack|queue|deque|\bpile\b|bracket|parenth/i, "stack"],
  [/recurs|récurs|divide and conquer/i, "recursion"],
  [/greedy|glouton|sweep line|interval/i, "greedy"],
  [/complexit|big-?o|amortized|harmonic|recurrence/i, "complexity"],
  [/sort|\btri\b|trier/i, "sorting"],
  [/hash|dict|\bmap\b(?!\()|\bsets?\b|ensemble|frequenc|counter|anagram|isset/i, "dicts"],
  [/string|chaîne|char|substring|slic|palindrom|letter|word/i, "strings"],
  [/array|list|tableau|liste|index|matrix|matrice/i, "arrays"],
  [/loop|boucle|iterat|\brange\b/i, "loops"],
  [/number|digit|prime|gcd|modulo|integer division|math|divis|chiffre|nombre/i, "math"],
  [/variable|condition|boolean|truthiness|type|coercion|equality|comparison|operator|initiali|input/i, "basics"],
];
// What the code itself shows (quick challenges)
const CODE_RULES: [RegExp, string][] = [
  [/\bawait\b|\.then\(|Promise|setTimeout/, "async"],
  [/\bclass\s+\w+|new\s+(?!Map|Set|Array|Date|Promise|Error|Object)[A-Z]\w*\(|\$this->|\bself\./, "oop"],
  [/function\s*\(|\blambda\b|\byield\b|\bfn\s*\(|\)\s*=>/, "functions"],
  [/\.sort\(|sorted\(|\bsort\(|usort|asort|ksort/, "sorting"],
  [/\{\s*['"]?\w+['"]?\s*:|\bdict\(|\bnew Map\b|\bnew Set\b|\bset\(|=>\s*['"\d]|array_count_values|isset\(\$\w+\[/, "dicts"],
  [/\[[^\]]*\]|\barray\(|\bpush\(|\.append\(|\blen\(|\.length\b|count\(\$/, "arrays"],
  [/\.split\(|\.join\(|substr|\.slice\(|\.upper\(|\.lower\(|toUpperCase|strlen|str_|f"|`[^`]*\$\{/, "strings"],
  [/\bfor\b|\bwhile\b|foreach/, "loops"],
  [/%|\/\/|Math\.|intdiv|\babs\(|\*\*/, "math"],
  [/\bif\b|\?.*:/, "basics"],
];

/** Best guess of the skills a challenge trains (at most 3, most specific first). */
export function guessSkills(c: Pick<ChallengeRow, "kind" | "title"> & Partial<ChallengeRow>): string[] {
  if (c.test_set && BY_SET[c.test_set]) return BY_SET[c.test_set];
  if (c.hr_slug && BY_SLUG[c.hr_slug]) return BY_SLUG[c.hr_slug];
  const out: string[] = [];
  const add = (k: string) => { if (!out.includes(k)) out.push(k); };
  if (c.kind === "sql") { for (const k of sqlSkills(c.solution ?? "")) add(k); add("sql"); return out.slice(0, 4); }
  if (c.kind === "regex") add("regex");
  if (c.kind === "complexity") add("complexity");
  // the topic and title say what the challenge is about; the statement only if they say nothing
  const words = `${c.topic ?? ""} ${c.title ?? ""}`;
  for (const [re, k] of TOPIC_RULES) if (re.test(words)) add(k);
  if (out.length < 3 && c.code) for (const [re, k] of CODE_RULES) if (out.length < 3 && re.test(c.code)) add(k);
  if (!out.length && c.question) for (const [re, k] of TOPIC_RULES) if (out.length < 2 && re.test(c.question)) add(k);
  if (!out.length) add(c.kind === "write" || c.kind === "code" ? "loops" : "basics");
  return out.slice(0, 3);
}
export const skillsOf = (c: { skills?: string | null } & Parameters<typeof guessSkills>[0]): string[] =>
  c.skills ? c.skills.split(",").filter((k) => SKILL_KEYS.includes(k)) : guessSkills(c);

/** Fill in the skills of challenges that don't have them yet (AI-made, teacher-made, imported). */
export async function backfillSkills(env: Env, limit = 60) {
  const rows = await all<ChallengeRow>(env, "SELECT * FROM challenges WHERE skills IS NULL LIMIT ?", limit);
  if (!rows.length) return 0;
  await env.DB.batch(rows.map((c) => env.DB.prepare("UPDATE challenges SET skills = ? WHERE id = ?").bind(guessSkills(c).join(","), c.id)));
  return rows.length;
}
export async function setSkills(env: Env, id: number, skills: string[]) {
  const clean = [...new Set(skills.filter((k) => SKILL_KEYS.includes(k)))].slice(0, 4);
  await run(env, "UPDATE challenges SET skills = ? WHERE id = ?", clean.length ? clean.join(",") : null, id);
}

// ------------------------------------------------------------ mastery
const DIFF_W: Record<string, number> = { easy: 1, medium: 2, hard: 3 };
export interface SkillScore {
  key: string; mastery: number; evidence: number; solved: number; failed: number;
  best: "easy" | "medium" | "hard" | null;   // hardest level solved
  status: "new" | "weak" | "ok" | "strong";
  target: "easy" | "medium" | "hard";        // the level to work at next
}
export interface AttemptLite {
  status: string; used_hint: number; tries: number; kind: string; difficulty: string; skills: string | null;
  result: string | null; finished_at: number | null; challenge_id: number; title?: string; test_set?: string | null; hr_slug?: string | null; topic?: string | null; code?: string | null; question?: string | null;
}

export async function studentAttempts(env: Env, guildId: string, discordId: string): Promise<AttemptLite[]> {
  return all<AttemptLite>(env,
    `SELECT a.status, a.used_hint, a.tries, a.result, a.finished_at, a.challenge_id, c.kind, c.difficulty, c.skills, c.title, c.test_set, c.hr_slug, c.topic
       FROM attempts a JOIN challenges c ON c.id = a.challenge_id
      WHERE a.guild_id = ? AND a.discord_id = ? AND a.status IN ('solved', 'failed', 'expired', 'claimed') ORDER BY a.id DESC LIMIT 400`, guildId, discordId);
}

/** Mastery of every skill from a student's attempts (recent ones count more). */
export function masteryFrom(attempts: AttemptLite[]): SkillScore[] {
  const acc = new Map<string, { w: number; s: number; solved: number; failed: number; best: number }>();
  attempts.forEach((a, i) => {
    if (a.status === "claimed") return;
    const recency = i < 40 ? 1 : i < 120 ? 0.6 : 0.3;
    const w = (DIFF_W[a.difficulty] ?? 1) * recency;
    const ok = a.status === "solved";
    const v = ok ? (a.used_hint ? 0.7 : 1) * (a.tries > 2 ? 0.8 : 1) : 0;
    for (const k of skillsOf({ ...a, skills: a.skills } as any)) {
      const e = acc.get(k) ?? { w: 0, s: 0, solved: 0, failed: 0, best: 0 };
      e.w += w; e.s += w * v;
      if (ok) { e.solved++; e.best = Math.max(e.best, DIFF_W[a.difficulty] ?? 1); } else e.failed++;
      acc.set(k, e);
    }
  });
  return SKILL_KEYS.map((key) => {
    const e = acc.get(key);
    if (!e) return { key, mastery: 0, evidence: 0, solved: 0, failed: 0, best: null, status: "new", target: "easy" } as SkillScore;
    const mastery = Math.round((100 * (e.s + 0.5)) / (e.w + 1));       // gentle prior: 50% after nothing
    const best = e.best === 3 ? "hard" : e.best === 2 ? "medium" : e.best === 1 ? "easy" : null;
    const status = e.w < 2 ? "new" : mastery < 45 ? "weak" : mastery < 75 ? "ok" : "strong";
    // the next level: one step above what they reliably solve
    const target = best === "hard" || (best === "medium" && mastery >= 70) ? "hard" : best === "medium" || (best === "easy" && mastery >= 60) ? "medium" : "easy";
    return { key, mastery, evidence: Math.round(e.w * 10) / 10, solved: e.solved, failed: e.failed, best, status, target } as SkillScore;
  });
}

// ------------------------------------------------------- mistake profile
export interface Mistake { key: string; count: number; total: number }
/**
 * What kind of mistakes a student makes, from the judge's verdicts and quick-challenge failures.
 * Keys: tle (too slow), hidden (passes samples, fails hidden tests = edge cases), crash (runtime errors),
 * compile, tracing (predict the output), bugs (find the bug), bigo (complexity), concepts (multiple choice), hints.
 */
export function mistakesFrom(attempts: AttemptLite[]): Mistake[] {
  const recent = attempts.slice(0, 120);
  const write = recent.filter((a) => (a.kind === "write" || a.kind === "sql") && a.result);
  const verdicts = write.map((a) => { try { return JSON.parse(a.result!); } catch { return null; } }).filter(Boolean);
  const failedW = verdicts.filter((r: any) => r.verdict && r.verdict !== "accepted");
  const out: Mistake[] = [];
  const push = (key: string, count: number, total: number, min = 2) => { if (count >= min && total) out.push({ key, count, total }); };
  push("tle", failedW.filter((r: any) => r.verdict === "tle").length, verdicts.length);
  push("hidden", failedW.filter((r: any) => r.verdict === "wrong" && r.failed && r.failed.sample === false).length, verdicts.length);
  push("crash", failedW.filter((r: any) => r.verdict === "runtime").length, verdicts.length);
  push("compile", failedW.filter((r: any) => r.verdict === "compile").length, verdicts.length);
  const quick = (kind: string, key: string) => {
    const q = recent.filter((a) => a.kind === kind);
    const bad = q.filter((a) => a.status !== "solved").length;
    if (q.length >= 3 && bad / q.length >= 0.4) out.push({ key, count: bad, total: q.length });
  };
  quick("output", "tracing"); quick("bug", "bugs"); quick("complexity", "bigo"); quick("mcq", "concepts");
  const hinted = recent.filter((a) => a.used_hint).length;
  if (recent.length >= 6 && hinted / recent.length >= 0.4) out.push({ key: "hints", count: hinted, total: recent.length });
  return out.sort((a, b) => b.count / b.total - a.count / a.total);
}

/** Everything the coach needs about one student. */
export async function studentProfile(env: Env, g: GuildRow, discordId: string) {
  const attempts = await studentAttempts(env, g.id, discordId);
  return { attempts, skills: masteryFrom(attempts), mistakes: mistakesFrom(attempts) };
}

/** Text bar for Discord, e.g. ▰▰▰▱▱ */
export const bar = (pct: number, n = 8) => { const f = Math.max(0, Math.min(n, Math.round((pct / 100) * n))); return "▰".repeat(f) + "▱".repeat(n - f); };

/** SQL skills a reference query uses, most advanced first. */
export function sqlSkills(q: string): string[] {
  const s = q.toUpperCase().replace(/'[^']*'/g, "''");
  const out: string[] = [];
  if (/\bINSERT\b|\bUPDATE\b|\bDELETE\b/.test(s)) out.push("sql_change");
  if (/\bCREATE\s+TABLE\b|\bPRIMARY\s+KEY\b|\bFOREIGN\s+KEY\b/.test(s)) out.push("sql_design");
  if (/\(\s*SELECT\b/.test(s)) out.push("sql_sub");
  if (/\bJOIN\b/.test(s)) out.push("sql_join");
  if (/\bGROUP\s+BY\b|\bHAVING\b/.test(s)) out.push("sql_group");
  if (/\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/.test(s)) out.push("sql_agg");
  if (/\bORDER\s+BY\b|\bLIMIT\b/.test(s) && out.length < 2) out.push("sql_sort");
  if (/\bWHERE\b/.test(s) && out.length < 2) out.push("sql_filter");
  // every query reads data: it also trains SELECT
  return [...out.slice(0, 2), "sql_select"];
}
