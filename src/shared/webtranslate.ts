// "🌐 Translate" on the assessment page: the question (not the code) in Arabic, French or English, with
// Google Translate (its free web endpoint), the AI when Google doesn't answer. Each text is translated once.
import type { Env } from "./types.ts";
import { aiBudgetOk, aiBudgetUse, now, one, run } from "./db.ts";
import { chat, extractJson } from "./ai.ts";

export const TR_LANGS = ["ar", "fr", "en"] as const;
export type TrLang = typeof TR_LANGS[number];
const LANG_NAME: Record<TrLang, string> = { ar: "Arabic", fr: "French", en: "English" };

async function key(to: string, text: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(to + "\u0000" + text));
  return to + ":" + [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function google(text: string, to: TrLang): Promise<string | null> {
  try {
    const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    const out = Array.isArray(j?.[0]) ? j[0].map((x: any) => (Array.isArray(x) ? String(x[0] ?? "") : "")).join("") : "";
    return out.trim() ? out : null;
  } catch { return null; }
}
async function ai(env: Env, texts: string[], to: TrLang): Promise<(string | null)[]> {
  if (!(await aiBudgetOk(env, 1))) return texts.map(() => null);
  await aiBudgetUse(env, 1);
  try {
    const raw = await chat(env, [
      { role: "system", content: `Translate each text into ${LANG_NAME[to]} for programming students. Keep code, identifiers, HTML tags and technical keywords as they are. Answer ONLY with JSON: {"t": ["…", …]} (same number, same order).` },
      { role: "user", content: JSON.stringify(texts) },
    ], { maxTokens: 2500, temperature: 0.1, timeoutMs: 30000 });
    const j = extractJson(raw);
    return texts.map((_, i) => (Array.isArray(j?.t) && j.t[i] ? String(j.t[i]) : null));
  } catch { return texts.map(() => null); }
}

/** Translations of `texts` into `to` (null where none could be made). */
export async function translateTexts(env: Env, texts: string[], to: TrLang): Promise<(string | null)[]> {
  const list = texts.slice(0, 12).map((t) => String(t ?? "").slice(0, 1500));
  const out: (string | null)[] = list.map(() => null);
  const missing: number[] = [];
  const keys = await Promise.all(list.map((t) => key(to, t)));
  for (let i = 0; i < list.length; i++) {
    if (!list[i].trim()) { out[i] = ""; continue; }
    const c = await one<{ v: string }>(env, "SELECT v FROM tr_cache WHERE k = ?", keys[i]);
    if (c) out[i] = c.v; else missing.push(i);
  }
  const g = await Promise.all(missing.map((i) => google(list[i], to)));
  const still = missing.filter((_, n) => !g[n]);
  missing.forEach((i, n) => { if (g[n]) out[i] = g[n]; });
  if (still.length) { const a = await ai(env, still.map((i) => list[i]), to); still.forEach((i, n) => { out[i] = a[n]; }); }
  for (const i of missing) if (out[i]) await run(env, "INSERT OR REPLACE INTO tr_cache (k, v, at) VALUES (?, ?, ?)", keys[i], out[i], now());
  return out;
}
