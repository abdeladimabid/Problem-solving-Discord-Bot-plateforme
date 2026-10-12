// AI: challenge generation, code feedback, and a fallback judge.
//
// Provider: Cloudflare Workers AI (free 10,000 neurons/day) with a strong
// reasoning model, OR any OpenAI-compatible endpoint if LLM_BASE_URL is set
// (Ollama exposed through a tunnel, Groq, OpenRouter, a local LM Studio…).
//
// Nothing the AI writes is trusted blindly:
//  - "predict the output" answers come from actually running the code,
//  - write-code problems are validated by running the AI's reference AND
//    brute-force solutions (they must agree) before any test is stored,
//  - multiple-choice answers are re-solved by an independent second pass.
import type { Difficulty, Env } from "./types.ts";
import { aiBudgetOk, aiBudgetUse } from "./db.ts";
import { isCorrectOutput } from "./game.ts";
import { LANGS, RunnerUnavailable, isCodeLang, normOut, runOnce, runPythonTests } from "./runner.ts";
import type { CodeLang, Judgement } from "./runner.ts";

export const DEFAULT_MODELS = ["@cf/openai/gpt-oss-120b", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"];
const LETTERS = ["A", "B", "C", "D"];
const CODE_STYLE: Record<string, string> = {
  python: "Python 3 (print to stdout)",
  javascript: "modern JavaScript run with Node.js 20 (print with console.log; no browser APIs like document or alert)",
  php: "PHP 8 run from the command line (print with echo or var_dump). Write the code WITHOUT the opening <?php tag",
  java: "Java 17 (a class with public static void main, print with System.out.println)",
  c: "C (printf)",
  cpp: "C++17 (std::cout)",
};

export const AI_COST = { quick: 2, write: 4, feedback: 1, judge: 2 };

export type Msg = { role: "system" | "user" | "assistant"; content: string };

// ------------------------------------------------------------------- calls
function pickText(raw: any): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw.response === "string") return raw.response;
  if (raw.response && typeof raw.response === "object") return JSON.stringify(raw.response);
  const c = raw.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (typeof raw.output_text === "string") return raw.output_text;
  if (Array.isArray(raw.output)) {
    const texts: string[] = [];
    for (const item of raw.output) {
      if (item?.type === "message" && Array.isArray(item.content)) {
        for (const part of item.content) if (typeof part?.text === "string") texts.push(part.text);
      }
    }
    if (texts.length) return texts[texts.length - 1];
  }
  if (raw.result) return pickText(raw.result);
  return JSON.stringify(raw);
}

/** Find the first JSON object in a model answer (ignoring prose and code fences around it). */
export function extractJson(text: string): any {
  if (!text) return null;
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try {
          const v = JSON.parse(text.slice(start, i + 1));
          if (v && typeof v === "object" && !Array.isArray(v)) return v;
        } catch { /* try the next opening brace */ }
        break;
      }
    }
  }
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error("AI timeout")), ms); }),
  ]);
}

export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODELS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"];

export function aiProviderLabel(env: Env): string {
  if (env.GROQ_API_KEY) return `Groq · ${(env.GROQ_MODEL || GROQ_MODELS[0]).split("/").pop()} (Workers AI as backup)`;
  if (env.LLM_BASE_URL) return `${env.LLM_MODEL || "model"} @ ${env.LLM_BASE_URL.replace(/^https?:\/\//, "").split("/")[0]}`;
  return `Workers AI · ${(env.AI_MODEL || DEFAULT_MODELS[0]).replace("@cf/", "")}`;
}

/** Groq only (needs GROQ_API_KEY). Tries the models in turn; throws when none answers. */
export async function groqChat(env: Env, messages: Msg[], o: { maxTokens: number; temperature: number; timeoutMs?: number; json?: boolean }): Promise<{ text: string; model: string }> {
  if (!env.GROQ_API_KEY) throw new Error("no Groq key");
  const models = env.GROQ_MODEL ? [env.GROQ_MODEL, ...GROQ_MODELS.filter((m) => m !== env.GROQ_MODEL)] : GROQ_MODELS;
  let last = "Groq unavailable";
  for (const model of models) {
    try {
      const body = (json: boolean) => JSON.stringify({ model, messages, max_tokens: o.maxTokens, temperature: o.temperature,
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}), ...(json ? { response_format: { type: "json_object" } } : {}) });
      let res = await withTimeout(fetch(GROQ_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GROQ_API_KEY}` }, body: body(!!o.json) }), o.timeoutMs ?? 90000);
      if (res.status === 400 && o.json) res = await withTimeout(fetch(GROQ_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GROQ_API_KEY}` }, body: body(false) }), o.timeoutMs ?? 90000);
      if (res.status === 401) throw new Error("Groq refused the key (GROQ_API_KEY)");
      if (!res.ok) { last = `Groq ${res.status} (${model})`; continue; }
      const text = pickText(await res.json());
      if (text.trim()) return { text, model };
    } catch (e) {
      last = String((e as Error)?.message ?? e);
      if (/refused the key/.test(last)) throw e;
    }
  }
  throw new Error(last);
}

/** Workers AI (or the OpenAI-compatible endpoint in LLM_BASE_URL). Throws on failure. */
export async function workersChat(env: Env, messages: Msg[], o: { maxTokens: number; temperature: number; timeoutMs?: number }): Promise<{ text: string; model: string }> {
  const timeout = o.timeoutMs ?? 90000;
  if (env.LLM_BASE_URL) {
    const res = await withTimeout(fetch(env.LLM_BASE_URL.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(env.LLM_API_KEY ? { Authorization: `Bearer ${env.LLM_API_KEY}` } : {}) },
      body: JSON.stringify({ model: env.LLM_MODEL, messages, max_tokens: o.maxTokens, temperature: o.temperature }),
    }), timeout);
    if (!res.ok) throw new Error(`AI provider answered ${res.status}`);
    return { text: pickText(await res.json()), model: env.LLM_MODEL || "llm" };
  }
  const models = env.AI_MODEL ? [env.AI_MODEL, ...DEFAULT_MODELS.filter((m) => m !== env.AI_MODEL)] : DEFAULT_MODELS;
  let last: unknown;
  for (const model of models) {
    try {
      const raw = await withTimeout(env.AI.run(model, { messages, max_tokens: o.maxTokens, temperature: o.temperature }), timeout);
      const text = pickText(raw);
      if (text.trim()) return { text, model: model.replace("@cf/", "cloudflare/") };
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("AI unavailable");
}

/**
 * One chat completion. Returns the raw text. Throws on failure.
 * Groq first when a key is set (a big model, fast, good at long French documents); if it fails
 * (limit reached, busy, timeout), Workers AI answers instead.
 */
export async function chat(env: Env, messages: Msg[], o: { maxTokens: number; temperature: number; timeoutMs?: number; json?: boolean }): Promise<string> {
  if (env.GROQ_API_KEY) {
    try { return (await groqChat(env, messages, o)).text; } catch (e) { console.error("groq", e); }
  }
  return (await workersChat(env, messages, o)).text;
}

export async function chatJson(env: Env, messages: Msg[], o: { maxTokens: number; temperature: number; timeoutMs?: number }): Promise<any> {
  return extractJson(await chat(env, messages, { ...o, json: true }));
}

// ------------------------------------------------------------- difficulty
const LEVEL: Record<Difficulty, string> = {
  easy: "EASY means a first-year student who paid attention can solve it in 2-5 minutes, but it still needs one careful thought: an edge case, an off-by-one, a subtle rule of the language. Not trivia, not a one-liner a beginner reads at a glance.",
  medium: "MEDIUM means a solid student needs 5-15 minutes and must truly understand the concept (closures, mutability/aliasing, generators, recursion, hashing, two pointers, prefix sums, sorting with keys, BFS, basic DP). Most of the class should get it wrong on the first try if they rush.",
  hard: "HARD means only the strongest students solve it, after 15-30 minutes of careful reasoning: interaction of several concepts, non-obvious traps, amortized analysis, MRO/super, generator protocol, descriptors, tricky recursion, graph algorithms, dynamic programming with a twist. If an average student can answer it quickly, it is NOT hard enough.",
};

const KIND_RULES: Record<string, string> = {
  output: 'kind "output": a short deterministic program (no input, no randomness, no time, no files). The student types EXACTLY what it prints. Set "choices" to null. "answer" = your best guess of the output (it will be replaced by the real output after running the code).',
  mcq: 'kind "mcq": a CONCEPTUAL question (algorithms, data structures, complexity, language semantics) with exactly 4 choices. All wrong choices must be plausible misconceptions, not jokes. "answer" = the letter A-D of the only correct choice.',
  bug: 'kind "bug": a short program with ONE real bug (wrong result, crash, infinite loop or catastrophic slowness on realistic input). The question says what the code should do. 4 choices describe possible causes; exactly one is right, the others must be things a student could believe. "answer" = its letter.',
  complexity: 'kind "complexity": a snippet whose time complexity requires real analysis (nested loops whose bounds interact, halving/doubling, amortized pointers, recursion trees, hidden costs like list.pop(0) or "in" on a list). 4 Big-O choices. "answer" = the letter of the correct one.',
};

const pickKind = (): string => {
  const r = Math.random();
  return r < 0.3 ? "output" : r < 0.6 ? "bug" : r < 0.8 ? "complexity" : "mcq";
};

export interface QuickExample { title: string; question: string | null; code: string | null; choices: string | null; answer: string | null }

export interface GeneratedQuick {
  kind: "output" | "mcq" | "bug" | "complexity";
  title: string; question: string; code: string | null; choices: string[] | null; answer: string;
  hint: string; explanation: string; topic: string;
}

function validateQuick(j: any, kind: string): GeneratedQuick | null {
  if (!j || typeof j !== "object") return null;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const title = str(j.title, 60), question = str(j.question, 700);
  let answer = str(j.answer, 400);
  if (!title || !question || !answer) return null;
  const code = str(j.code, 1500);
  const out: GeneratedQuick = { kind: kind as GeneratedQuick["kind"], title, question, code, answer, choices: null, hint: str(j.hint, 300) ?? "", explanation: str(j.explanation, 900) ?? "", topic: str(j.topic, 40) ?? "" };
  if (kind === "output") {
    if (!code) return null;
    return out;
  }
  if (kind !== "mcq" && !code) return null;
  if (!Array.isArray(j.choices) || j.choices.length !== 4) return null;
  const choices = j.choices.map((c: unknown) => String(c ?? "").trim().replace(/^[A-D][).:\-]\s+/, "").slice(0, 180));
  if (choices.some((c: string) => !c) || new Set(choices).size !== 4) return null;
  const idx = LETTERS.indexOf(answer.toUpperCase()[0]);
  if (idx < 0) return null;
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  out.choices = order.map((i) => choices[i]);
  out.answer = LETTERS[order.indexOf(idx)];
  return out;
}

/** Independent second pass: re-solve a multiple-choice question. */
async function agrees(env: Env, c: GeneratedQuick, codeLang: string): Promise<boolean> {
  const choices = c.choices!.map((x, i) => `${LETTERS[i]}) ${x}`).join("\n");
  const j = await chatJson(env, [
    { role: "system", content: 'You are an expert computer-science teacher. Solve the multiple-choice question carefully (trace code if any). Reply ONLY with JSON: {"answer": "A|B|C|D", "why": "one sentence"}' },
    { role: "user", content: `${c.question}\n\n${c.code ? "```" + codeLang + "\n" + c.code + "\n```\n\n" : ""}${choices}` },
  ], { maxTokens: 2500, temperature: 0 });
  return typeof j?.answer === "string" && j.answer.trim().toUpperCase()[0] === c.answer;
}

export async function generateQuick(env: Env, o: {
  difficulty: Difficulty; kind?: string | null; topic?: string | null; lang: string; codeLang: string; examples?: QuickExample[];
}): Promise<GeneratedQuick | null> {
  const language = o.lang === "fr" ? "French" : "English";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await aiBudgetOk(env, AI_COST.quick))) return null;
    await aiBudgetUse(env, AI_COST.quick);
    const kind = o.kind && KIND_RULES[o.kind] ? o.kind : pickKind();
    const examples = (o.examples ?? []).slice(0, 2).map((e, i) =>
      `Example ${i + 1} of the expected difficulty:\nTitle: ${e.title}\nQuestion: ${e.question ?? ""}\n${e.code ? "Code:\n" + e.code + "\n" : ""}${e.choices ? "Choices: " + e.choices + "\n" : ""}Answer: ${e.answer ?? ""}`).join("\n\n");
    const system = [
      "You write challenging, original programming quiz questions for computer-science students. Quality and correctness matter more than anything.",
      `Language for all text: ${language}. Code language: ${CODE_STYLE[o.codeLang] ?? o.codeLang}.`,
      LEVEL[o.difficulty],
      KIND_RULES[kind],
      "Code: at most 15 lines, idiomatic, no comments that give the answer away. Do not repeat the code inside the question text.",
      "Avoid famous textbook examples (FizzBuzz, plain Fibonacci, swapping two variables, reversing a string).",
      "The hint helps without revealing the answer. The explanation (1-3 sentences) teaches WHY.",
      'Reply with ONLY one JSON object: {"kind": "...", "title": "max 40 chars", "question": "...", "code": "... or null", "choices": ["...","...","...","..."] or null, "answer": "...", "hint": "...", "explanation": "...", "topic": "2-3 words"}',
    ].join("\n");
    const user = `${examples ? examples + "\n\n" : ""}Now write ONE new ${o.difficulty.toUpperCase()} "${kind}" challenge${o.topic ? ` about: ${o.topic}` : " on a different topic than the examples"}. It must be at least as hard as the examples.`;
    try {
      const c = validateQuick(await chatJson(env, [{ role: "system", content: system }, { role: "user", content: user }], { maxTokens: 4000, temperature: 0.9 }), kind);
      if (!c) continue;
      if (c.kind === "output") {
        // the real output, not the model's guess
        if (!isCodeLang(o.codeLang)) {
          if (await agreesOutput(env, c, o.codeLang)) return c;
          continue;
        }
        const r = await runOnce(env, o.codeLang, c.code!);
        if (!r.ok || !r.out.trim() || r.out.length > 200) continue;
        if (!isCorrectOutput(c.answer, r.out)) c.explanation = ""; // the model's reasoning was wrong: drop it
        c.answer = r.out;
        return c;
      }
      if (await agrees(env, c, o.codeLang)) return c;
    } catch (e) {
      if (e instanceof RunnerUnavailable) return null;
    }
  }
  return null;
}

async function agreesOutput(env: Env, c: GeneratedQuick, codeLang: string): Promise<boolean> {
  const j = await chatJson(env, [
    { role: "system", content: `You are a precise ${codeLang} interpreter. Trace the program step by step, then give its exact standard output. Reply ONLY with JSON: {"output": "..."}` },
    { role: "user", content: c.code ?? "" },
  ], { maxTokens: 2500, temperature: 0 });
  return typeof j?.output === "string" && isCorrectOutput(j.output, c.answer);
}

// ------------------------------------------------------- write-code problems
export interface GeneratedWrite {
  title: string; statement: string; hint: string; topic: string; reference: string; timeLimit: number;
  tests: { input: string | null; gen: string | null; expected: string; sample: number }[];
}

const WRITE_LEVEL: Record<Difficulty, string> = {
  easy: "EASY: one loop or a dictionary/set, but with at least one edge case that naive code misses (duplicates, empty runs, single element, negative numbers). n up to 10^5.",
  medium: "MEDIUM: needs a known technique (prefix sums + hashing, two pointers / sliding window, sorting + sweep, BFS on a grid, 1D DP). The obvious O(n^2) solution must be TOO SLOW: n up to 2*10^5.",
  hard: "HARD: needs a non-trivial algorithm (DP with a clever state, binary search on the answer, monotonic stack/deque, Dijkstra, union-find, Fenwick tree, greedy with a proof). The naive solution must be MUCH too slow: n up to 2*10^5.",
};

const GEN_HEADER = `def gen():
    _s = [__SEED__]
    def _n():
        _s[0] = (_s[0] * 1103515245 + 12345) % 2147483648
        return _s[0] >> 8
    def r(lo, hi):
        return lo + ((_n() << 23) | _n()) % (hi - lo + 1)
`;
const indent = (body: string) => body.replace(/\r/g, "").split("\n").map((l) => (l.trim() ? "    " + l : "")).join("\n");
export const makeGen = (body: string, seed: number) => GEN_HEADER.replace("__SEED__", String(seed)) + indent(body);

/** Ask the AI for a full problem, then PROVE it by running its solutions on the code runner. */
export async function generateWrite(env: Env, o: { difficulty: Difficulty; topic?: string | null; lang: string }): Promise<GeneratedWrite | null> {
  const language = o.lang === "fr" ? "French" : "English";
  const limit = o.difficulty === "hard" ? 3 : 2;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await aiBudgetOk(env, AI_COST.write))) return null;
    await aiBudgetUse(env, AI_COST.write);
    const system = [
      "You design programming problems for a class, in the style of HackerRank / Codeforces: a short story, then precise Input, Output and Constraints sections. Students read stdin and write stdout.",
      `Write the title, statement and hint in ${language}. Use Markdown (**bold** section titles, inline code).`,
      WRITE_LEVEL[o.difficulty],
      "The OUTPUT must be short: one or a few numbers / words (at most 200 characters). Never ask to print an array of n values.",
      "Do NOT include examples in the statement: they are added automatically from the sample tests.",
      "Provide: `reference` = a correct, efficient Python 3 solution reading stdin; `brute` = an obviously-correct slow Python 3 solution (used to check the reference on small inputs); `samples` = 2 small input strings; `small` = 5 small input strings (n <= 8) covering edge cases; `big_gens` = 2 Python function BODIES that build and RETURN a big input string at the maximum constraints. In those bodies use only the helper r(lo, hi) (a seeded random integer in [lo, hi], inclusive) and the standard library; no imports of random.",
      'Reply with ONLY one JSON object: {"title": "max 40 chars", "statement": "...", "hint": "...", "topic": "2-3 words", "reference": "...", "brute": "...", "samples": ["..."], "small": ["..."], "big_gens": ["..."]}',
    ].join("\n");
    const user = `Create one ${o.difficulty.toUpperCase()} problem${o.topic ? ` about: ${o.topic}` : ""}. Make it original (not a famous LeetCode title).`;
    let j: any;
    try {
      j = await chatJson(env, [{ role: "system", content: system }, { role: "user", content: user }], { maxTokens: 9000, temperature: 0.8, timeoutMs: 150000 });
    } catch { continue; }
    const s = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    const title = s(j?.title, 60), statement = s(j?.statement, 3500), reference = s(j?.reference, 6000), brute = s(j?.brute, 6000);
    const samples: string[] = Array.isArray(j?.samples) ? j.samples.filter((x: unknown) => typeof x === "string" && x.trim()).slice(0, 3) : [];
    const small: string[] = Array.isArray(j?.small) ? j.small.filter((x: unknown) => typeof x === "string" && x.trim()).slice(0, 6) : [];
    const gens: string[] = Array.isArray(j?.big_gens) ? j.big_gens.filter((x: unknown) => typeof x === "string" && x.includes("return")).slice(0, 2) : [];
    if (!title || !statement || !reference || !brute || samples.length < 1 || small.length < 3) continue;
    const withNl = (x: string) => (x.endsWith("\n") ? x : x + "\n");
    const lits = [...samples, ...small].map(withNl);
    const bigs = gens.map((b, i) => makeGen(b, 1000 + i * 7919 + Math.floor(Math.random() * 100000)));
    try {
      const all = [...lits.map((input) => ({ input, gen: null })), ...bigs.map((gen) => ({ input: null, gen }))];
      const [ref, br] = await Promise.all([
        runPythonTests(env, reference, all, limit * 2, 2500),
        runPythonTests(env, brute, lits.map((input) => ({ input, gen: null })), 10, 2500),
      ]);
      if (ref.compile || br.compile || ref.rows.length !== all.length) continue;
      let ok = true;
      for (let i = 0; i < all.length; i++) {
        const r = ref.rows[i];
        if (r.s !== "ok" || !r.o || r.n > 2000) { ok = false; break; }
        if (i < lits.length && (br.rows[i]?.s !== "ok" || br.rows[i].o !== r.o)) { ok = false; break; }   // brute must agree
        if (i >= lits.length && r.t > limit * 0.4) { ok = false; break; }                                  // reference must be fast
      }
      if (!ok) continue;
      return {
        title, statement, reference, timeLimit: limit,
        hint: s(j?.hint, 400) ?? "", topic: s(j?.topic, 40) ?? "",
        tests: all.map((t, i) => ({ input: t.input, gen: t.gen, expected: normOut(ref.rows[i].o), sample: i < samples.length ? 1 : 0 })),
      };
    } catch (e) {
      if (e instanceof RunnerUnavailable) return null;
    }
  }
  return null;
}

// ----------------------------------------------------------------- feedback
export async function codeFeedback(env: Env, o: {
  lang: string; codeLang: CodeLang; statement: string; code: string; judgement: Judgement; accepted: boolean;
}): Promise<string | null> {
  return (await codeReview(env, o))?.text ?? null;
}

/**
 * The AI's note on a submission, plus (when `skills` is given) the skills where the student's
 * mistake is, e.g. a binary search that fails because of an off-by-one in the loop → ["loops"].
 */
export async function codeReview(env: Env, o: {
  lang: string; codeLang: CodeLang; statement: string; code: string; judgement: Judgement; accepted: boolean;
  skills?: { key: string; name: string }[];
}): Promise<{ text: string; skills: string[] } | null> {
  if (!(await aiBudgetOk(env, AI_COST.feedback))) return null;
  await aiBudgetUse(env, AI_COST.feedback);
  const language = o.lang === "fr" ? "French" : "English";
  const j = o.judgement;
  const situation = o.accepted
    ? `The solution PASSED all ${j.total} tests (slowest test ${j.maxTime.toFixed(2)} s). Give a short code review: its time complexity, one concrete improvement (readability or efficiency), and praise what is good.`
    : j.verdict === "compile"
      ? `The code does not compile / has a syntax error:\n${j.error}`
      : j.verdict === "tle"
        ? `The code is TOO SLOW on test ${j.failed?.idx}${j.failed?.big ? " (a big input at the maximum constraints)" : ""}. Estimate its complexity and name the technique that would make it fast enough, without writing the solution.`
        : j.verdict === "runtime"
          ? `The code CRASHED on test ${j.failed?.idx}: ${j.failed?.error ?? ""}`
          : j.failed?.sample
            ? `WRONG ANSWER on a sample test.\nInput:\n${j.failed.input}\nExpected: ${j.failed.expected}\nGot: ${j.failed.got || "(nothing)"}`
            : `WRONG ANSWER on hidden test ${j.failed?.idx}${j.failed?.big ? " (big input)" : ""}. ${j.passed}/${j.total} tests passed. Find the most likely bug or missed edge case by reading the code.`;
  const tagging = o.skills?.length && !o.accepted
    ? `\n\nThen, on a LAST separate line, write "SKILLS:" followed by the 1 or 2 keys (comma-separated) of the basic skills where the student's MISTAKE actually is (not the topic of the problem unless the mistake is in it), chosen ONLY from: ${o.skills.map((x) => `${x.key} (${x.name})`).join(", ")}. Example: "SKILLS: loops, arrays". Write "SKILLS: none" if you can't tell.`
    : "";
  const raw = await chat(env, [
    { role: "system", content: `You are a kind but demanding programming teacher. Write in ${language}, 2 to 4 short sentences, addressed to the student ("you"). Point to the exact line or idea that is wrong and why. NEVER write the corrected code or the full solution. Plain text, no headings.${tagging}` },
    { role: "user", content: `Problem:\n${o.statement.slice(0, 2500)}\n\nStudent code (${LANGS[o.codeLang].label}):\n${o.code.slice(0, 4000)}\n\n${situation}` },
  ], { maxTokens: 2500, temperature: 0.3, timeoutMs: 25000 }).catch(() => "");
  const allowed = new Set((o.skills ?? []).map((x) => x.key));
  let skills: string[] = [];
  const text = raw.replace(/^\s*\**\s*(SKILLS|COMPÉTENCES|COMPETENCES)\s*\**\s*:\s*(.*)$/gim, (_, __, list: string) => {
    skills = list.toLowerCase().split(/[,;\s]+/).map((x) => x.trim()).filter((x) => allowed.has(x)).slice(0, 2);
    return "";
  }).replace(/```[\s\S]*?```/g, "").trim();
  return text || skills.length ? { text: text.slice(0, 900), skills } : null;
}

/** Fallback when the code runner is unreachable: the AI reads the code and decides. */
export async function aiJudge(env: Env, o: { lang: string; codeLang: CodeLang; statement: string; samples: { input: string; expected: string }[]; code: string })
  : Promise<{ accepted: boolean; feedback: string } | null> {
  if (!(await aiBudgetOk(env, AI_COST.judge))) return null;
  await aiBudgetUse(env, AI_COST.judge);
  const language = o.lang === "fr" ? "French" : "English";
  const j = await chatJson(env, [
    { role: "system", content: `You are a strict programming judge. Decide if the student's program is correct for ALL valid inputs AND fast enough for the constraints. Trace it on the samples. Be strict: when in doubt, it is not accepted. Reply ONLY with JSON: {"verdict": "accepted" | "wrong" | "too_slow" | "error", "feedback": "2-3 sentences in ${language}, no corrected code"}` },
    { role: "user", content: `Problem:\n${o.statement.slice(0, 3000)}\n\nSamples:\n${o.samples.map((s) => `Input:\n${s.input}\nExpected output: ${s.expected}`).join("\n\n")}\n\nStudent code (${LANGS[o.codeLang].label}):\n${o.code.slice(0, 4000)}` },
  ], { maxTokens: 4000, temperature: 0, timeoutMs: 25000 }).catch(() => null);
  if (!j || typeof j.verdict !== "string") return null;
  return { accepted: j.verdict === "accepted", feedback: String(j.feedback ?? "").slice(0, 900) };
}

export async function aiHealth(env: Env): Promise<{ ok: boolean; ms: number; detail: string }> {
  const t = Date.now();
  try {
    const text = await chat(env, [{ role: "user", content: 'Reply with only this JSON: {"ok": true}' }], { maxTokens: 300, temperature: 0, timeoutMs: 30000 });
    const j = extractJson(text);
    return { ok: !!j?.ok, ms: Date.now() - t, detail: aiProviderLabel(env) + (j?.ok ? "" : ` · unexpected answer: ${text.slice(0, 120)}`) };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, detail: `${aiProviderLabel(env)} · ${(e as Error).message}` };
  }
}

// ------------------------------------------------------- explain your code
/** Two short questions that only the author of this code can answer quickly. */
export async function explainQuestions(env: Env, o: { lang: string; codeLang: CodeLang; statement: string; code: string }): Promise<string[] | null> {
  if (!o.code.trim() || !(await aiBudgetOk(env, AI_COST.feedback))) return null;
  await aiBudgetUse(env, AI_COST.feedback);
  const language = o.lang === "fr" ? "French" : "English";
  const j = await chatJson(env, [
    { role: "system", content: `You check that a student really wrote and understands their own program. Ask exactly 2 short questions (max 160 characters each) in ${language}, about THIS code specifically: name a variable, a line or a construct from it. Good questions: "What is the role of the variable \`seen\`?", "What does your code return when the list is empty, and why?", "Why does the loop on line 7 start at 1?". The answers must take 1-2 sentences. Don't ask about the problem in general, don't reveal the answers. Reply ONLY with JSON: {"questions": ["...", "..."]}` },
    { role: "user", content: `Problem:\n${o.statement.slice(0, 1500)}\n\nStudent code (${LANGS[o.codeLang].label}), with line numbers:\n${o.code.split("\n").slice(0, 120).map((l, i) => `${i + 1}: ${l}`).join("\n")}` },
  ], { maxTokens: 2000, temperature: 0.4, timeoutMs: 25000 }).catch(() => null);
  const qs = Array.isArray(j?.questions) ? j.questions.filter((q: unknown) => typeof q === "string" && q.trim()).map((q: string) => q.trim().slice(0, 220)).slice(0, 2) : [];
  return qs.length === 2 ? qs : null;
}

/** Score the student's answers about their own code, 0..1. */
export async function gradeExplanation(env: Env, o: { lang: string; codeLang: CodeLang; code: string; questions: string[]; answers: string[] }): Promise<{ score: number; feedback: string } | null> {
  if (!(await aiBudgetOk(env, AI_COST.feedback))) return null;
  await aiBudgetUse(env, AI_COST.feedback);
  const language = o.lang === "fr" ? "French" : "English";
  const j = await chatJson(env, [
    { role: "system", content: `You grade a student's short answers about their OWN code. For each answer give 0 (wrong, empty or generic), 1 (partly right) or 2 (right and specific to the code). Be fair: simple words and small spelling mistakes are fine. Reply ONLY with JSON: {"points": [0-2, 0-2], "feedback": "one sentence in ${language}"}` },
    { role: "user", content: `Code (${LANGS[o.codeLang].label}):\n${o.code.split("\n").slice(0, 120).map((l, i) => `${i + 1}: ${l}`).join("\n")}\n\n${o.questions.map((q, i) => `Question ${i + 1}: ${q}\nAnswer ${i + 1}: ${(o.answers[i] ?? "").slice(0, 800) || "(empty)"}`).join("\n\n")}` },
  ], { maxTokens: 1500, temperature: 0, timeoutMs: 25000 }).catch(() => null);
  if (!j || !Array.isArray(j.points)) return null;
  const pts = j.points.slice(0, 2).map((x: unknown) => Math.max(0, Math.min(2, Number(x) || 0)));
  while (pts.length < 2) pts.push(0);
  return { score: (pts[0] + pts[1]) / 4, feedback: String(j.feedback ?? "").slice(0, 400) };
}

// ------------------------------------------------------------- coaching
/** Two more hint steps for a write-code problem: the approach (no code), then pseudocode. Written once, cached. */
export async function generateHints(env: Env, o: { lang: string; statement: string; reference?: string | null }): Promise<{ approach: string; pseudo: string } | null> {
  if (!(await aiBudgetOk(env, AI_COST.feedback))) return null;
  await aiBudgetUse(env, AI_COST.feedback);
  const language = o.lang === "fr" ? "French" : "English";
  const j = await chatJson(env, [
    { role: "system", content: `You help students who are stuck on a programming problem, in ${language}, without giving the code away. Reply ONLY with JSON: {"approach": "2-3 sentences: the key idea and the data structure or technique to use, and its time complexity. No code.", "pseudo": "6 to 12 lines of language-neutral pseudocode (plain words like 'for each', 'if', 'return'), no real syntax from any language"}` },
    { role: "user", content: `Problem:\n${o.statement.slice(0, 3000)}${o.reference ? `\n\nA correct reference solution (do NOT copy it, only use it to understand the intended idea):\n${o.reference.slice(0, 3000)}` : ""}` },
  ], { maxTokens: 2500, temperature: 0.2, timeoutMs: 25000 }).catch(() => null);
  if (!j || typeof j.approach !== "string" || typeof j.pseudo !== "string") return null;
  return { approach: j.approach.replace(/```[\s\S]*?```/g, "").trim().slice(0, 700), pseudo: j.pseudo.replace(/```\w*\n?|```/g, "").trim().slice(0, 900) };
}

/** A clean model solution in the student's language, with a one-line complexity note. Written once per language, cached. */
export async function modelSolution(env: Env, o: { lang: string; codeLang: CodeLang; statement: string; reference: string; header?: string | null }): Promise<{ code: string; note: string } | null> {
  if (!(await aiBudgetOk(env, AI_COST.feedback))) return null;
  await aiBudgetUse(env, AI_COST.feedback);
  const language = o.lang === "fr" ? "French" : "English";
  const j = await chatJson(env, [
    { role: "system", content: `You write model solutions for students. Translate the reference solution into clean, idiomatic ${LANGS[o.codeLang].label} with short comments in ${language}. Same algorithm, readable names.${o.header ? ` The solution must be a function with exactly this signature: ${o.header} (no input reading, no printing).` : " It must read standard input and print the answer exactly like the reference."} Reply ONLY with JSON: {"code": "...", "note": "one sentence in ${language}: the idea and its time complexity"}` },
    { role: "user", content: `Problem:\n${o.statement.slice(0, 2500)}\n\nReference solution (Python):\n${o.reference.slice(0, 4000)}` },
  ], { maxTokens: 4000, temperature: 0.1, timeoutMs: 30000 }).catch(() => null);
  if (!j || typeof j.code !== "string" || !j.code.trim()) return null;
  return { code: j.code.replace(/^```\w*\n?|```$/g, "").trim().slice(0, 3500), note: String(j.note ?? "").slice(0, 300) };
}

/** A short, warm weekly note for one student, from their numbers. */
export async function weeklyNote(env: Env, o: { lang: string; name: string; facts: string }): Promise<string | null> {
  if (!(await aiBudgetOk(env, 1))) return null;
  await aiBudgetUse(env, 1);
  const language = o.lang === "fr" ? "French" : "English";
  const text = await chat(env, [
    { role: "system", content: `You are a programming coach writing a weekly note to one student, in ${language}, addressed as "you". 3 to 4 sentences: one specific thing they did well, the one habit to fix (from their mistakes), and one concrete goal for next week. Warm and direct, no generic praise, no headings, no lists.` },
    { role: "user", content: `Student: ${o.name}\n${o.facts}` },
  ], { maxTokens: 1200, temperature: 0.5, timeoutMs: 20000 }).catch(() => "");
  return text.trim() ? text.trim().slice(0, 700) : null;
}
