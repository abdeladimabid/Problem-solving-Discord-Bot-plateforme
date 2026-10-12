// Settings of this ClassBot saved from the dashboard (Settings → AI): the Groq API key and model.
// They apply to every class of this ClassBot and win over the Cloudflare secrets (GROQ_API_KEY, GROQ_MODEL),
// so a teacher can set the AI up without the command line. The key is never sent back to the browser.
import type { Env } from "./types.ts";
import { now, one, run } from "./db.ts";
import { GROQ_MODELS, GROQ_URL } from "./ai.ts";

export interface AiCfg { groqKey?: string; groqModel?: string }
const CACHE_MS = 30_000;
let cached: { at: number; cfg: AiCfg } | null = null;
const SECRET = Symbol("secret");

async function read(env: Env): Promise<AiCfg> {
  try {
    const r = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = 'ai'");
    return r ? JSON.parse(r.v) : {};
  } catch { return {}; }   // table not created yet (migration not applied)
}
/** At the start of each request / cron: the dashboard's AI settings go into env (cached 30 s per Worker). */
export async function applyAppSettings(env: Env, fresh = false) {
  const e = env as any;
  if (!(SECRET in e)) e[SECRET] = { key: env.GROQ_API_KEY, model: env.GROQ_MODEL };
  if (fresh || !cached || Date.now() - cached.at > CACHE_MS) cached = { at: Date.now(), cfg: await read(env) };
  const c = cached.cfg;
  env.GROQ_API_KEY = c.groqKey || e[SECRET].key;
  env.GROQ_MODEL = c.groqModel || e[SECRET].model;
}
const mask = (k?: string) => (k ? `${k.slice(0, 4)}…${k.slice(-4)}` : "");

/** What the dashboard shows: where the key comes from, never the key itself. */
export async function aiSettingsView(env: Env) {
  const c = await read(env);
  const secret: string | undefined = SECRET in (env as any) ? (env as any)[SECRET].key : c.groqKey ? undefined : env.GROQ_API_KEY;
  return {
    source: c.groqKey ? "settings" : secret ? "secret" : "none",
    masked: c.groqKey ? mask(c.groqKey) : secret ? mask(secret) : "",
    model: c.groqModel || "", models: GROQ_MODELS, hasWorkersAi: !!env.AI,
  };
}
export class AiSettingsError extends Error {}

/** Check a Groq key with a tiny request (before saving it). */
export async function testGroqKey(key: string, model?: string): Promise<{ ok: boolean; model?: string; error?: string }> {
  const m = model || GROQ_MODELS[0];
  try {
    const res = await fetch(GROQ_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: m, messages: [{ role: "user", content: "Reply with: ok" }], max_tokens: 20, temperature: 0 }), signal: AbortSignal.timeout(20000) });
    if (res.status === 401) return { ok: false, error: "Groq refused this key (401). Copy it again from console.groq.com → API Keys." };
    if (res.status === 404) return { ok: false, error: `This model isn't available on Groq: ${m}` };
    if (res.status === 429) return { ok: true, model: m, error: "The key works, but Groq's limit for now is reached (429): it will answer again in a moment." };
    if (!res.ok) return { ok: false, error: `Groq answered ${res.status}.` };
    return { ok: true, model: m };
  } catch { return { ok: false, error: "Groq didn't answer (network or timeout)." }; }
}

export async function saveAiSettings(env: Env, b: { key?: string; model?: string; clear?: boolean }) {
  const cur = await read(env);
  const next: AiCfg = { ...cur };
  if (b.clear) delete next.groqKey;
  const key = String(b.key ?? "").trim();
  if (key) {
    if (!/^gsk_[A-Za-z0-9]{20,}$/.test(key)) throw new AiSettingsError("This doesn't look like a Groq key: it starts with gsk_ (console.groq.com → API Keys).");
    const t = await testGroqKey(key, b.model || cur.groqModel);
    if (!t.ok) throw new AiSettingsError(t.error || "Groq refused this key.");
    next.groqKey = key;
  }
  if (b.model !== undefined) {
    const m = String(b.model).trim().slice(0, 80);
    if (m && !/^[\w./:-]+$/.test(m)) throw new AiSettingsError("Unknown model name.");
    if (m) next.groqModel = m; else delete next.groqModel;
  }
  await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES ('ai', ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", JSON.stringify(next), now());
  await applyAppSettings(env, true);
  return aiSettingsView(env);
}
