// "🌐 Français / English" on a challenge: the same challenge in the other language.
// Built-in challenges exist in both languages (twins), so the twin is shown; for the others
// the AI translates once and the translation is kept in challenges.translations.
import type { ChallengeRow, Env } from "./types.ts";
import { aiBudgetOk, aiBudgetUse, one, run } from "./db.ts";
import { chat, extractJson } from "./ai.ts";

export interface Translation { title: string; question: string | null; choices: string[] | null; hint: string | null }
const CHOICE_KINDS = ["mcq", "bug", "complexity"];

function parseChoices(c: { choices: string | null }): string[] | null {
  try { const v = JSON.parse(c.choices || "null"); return Array.isArray(v) ? v.map(String) : null; } catch { return null; }
}
const of = (c: ChallengeRow): Translation => ({ title: c.title, question: c.question, choices: parseChoices(c), hint: c.hint });

/** The built-in twin in the other language (same tests, or same code next to it in the bank). */
async function twin(env: Env, c: ChallengeRow, to: string): Promise<ChallengeRow | null> {
  if (c.test_set) return one<ChallengeRow>(env, "SELECT * FROM challenges WHERE test_set = ? AND lang = ? LIMIT 1", c.test_set, to);
  if (c.source !== "seed") return null;
  const t = await one<ChallengeRow>(env,
    `SELECT * FROM challenges WHERE source = 'seed' AND kind = ? AND difficulty = ? AND lang = ? AND id IN (?, ?)
       AND COALESCE(code, '') = COALESCE(?, '') AND COALESCE(code_lang, '') = COALESCE(?, '') AND COALESCE(topic, '') = COALESCE(?, '')`,
    c.kind, c.difficulty, to, c.id - 1, c.id + 1, c.code, c.code_lang, c.topic);
  // a twin whose answer differs (choices in another order) would mislead: don't use it
  if (t && CHOICE_KINDS.includes(c.kind) && (t.answer !== c.answer || parseChoices(t)?.length !== parseChoices(c)?.length)) return null;
  return t;
}

/** The challenge's text in `to` ("en" or "fr"); null when it can't be translated right now. */
export async function translateChallenge(env: Env, c: ChallengeRow, to: "en" | "fr"): Promise<Translation | null> {
  if (c.lang === to) return of(c);
  const tw = await twin(env, c, to);
  if (tw) return of(tw);
  let cache: Record<string, Translation> = {};
  try { cache = JSON.parse((c as any).translations || "{}") ?? {}; } catch { cache = {}; }
  if (cache[to]) return cache[to];
  if (!(await aiBudgetOk(env, 1))) return null;
  await aiBudgetUse(env, 1);
  const src = of(c);
  const raw = await chat(env, [
    { role: "system", content: `Translate this programming exercise into ${to === "fr" ? "French" : "English"} for students. Keep code, identifiers, numbers, inline \`code\` and Markdown exactly as they are; translate only the human text. Keep the same number of choices, in the same order. Answer ONLY with JSON: {"title": "...", "question": "...", "choices": [...] or null, "hint": "..." or null}` },
    { role: "user", content: JSON.stringify(src) },
  ], { maxTokens: 1500, temperature: 0.1, timeoutMs: 40000 }).catch(() => "");
  let j: any = null;
  try { j = extractJson(raw); } catch { j = null; }
  if (!j?.title) return null;
  const tr: Translation = {
    title: String(j.title).slice(0, 120),
    question: j.question ? String(j.question).slice(0, 3500) : src.question,
    choices: Array.isArray(j.choices) && src.choices && j.choices.length === src.choices.length ? j.choices.map((x: unknown) => String(x).slice(0, 300)) : src.choices,
    hint: j.hint ? String(j.hint).slice(0, 400) : src.hint,
  };
  cache[to] = tr;
  await run(env, "UPDATE challenges SET translations = ? WHERE id = ?", JSON.stringify(cache), c.id);
  return tr;
}
