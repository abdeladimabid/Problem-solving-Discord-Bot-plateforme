// AI providers of a class (Settings → AI): the teacher adds one or more AIs (Groq, Google Gemini, OpenRouter,
// Cerebras, Mistral, OpenAI, Anthropic Claude, DeepSeek, or any OpenAI-compatible address) with their own keys.
// ClassBot asks them in order: when one fails (limit reached, key refused, down), the next one answers, and
// Cloudflare's free AI is the last backup. Keys are stored in this ClassBot's database and never sent back to
// the browser. The ClassBot's own key (the Cloudflare secret GROQ_API_KEY) is only used by the classes allowed to.
import type { Env } from "./types.ts";
import { type AiProvider, type ClassAi, classAi, classOf, dropClassAi } from "./aictx.ts";

export interface Preset {
  label: string; base: string; models: string[]; keyUrl: string; keyHint: string; free: string;
  anthropic?: boolean; custom?: boolean; noKey?: boolean;
}
export const PRESETS: Record<string, Preset> = {
  groq: { label: "Groq", base: "https://api.groq.com/openai/v1", models: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"],
    keyUrl: "https://console.groq.com/keys", keyHint: "gsk_…", free: "Free, fast. Daily limits per model." },
  gemini: { label: "Google Gemini", base: "https://generativelanguage.googleapis.com/v1beta/openai", models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    keyUrl: "https://aistudio.google.com/apikey", keyHint: "AIza…", free: "Free tier with a Google account." },
  openrouter: { label: "OpenRouter", base: "https://openrouter.ai/api/v1", models: ["openai/gpt-oss-120b:free", "meta-llama/llama-3.3-70b-instruct:free", "deepseek/deepseek-chat-v3-0324:free"],
    keyUrl: "https://openrouter.ai/keys", keyHint: "sk-or-…", free: "Many models; the “:free” ones cost nothing." },
  cerebras: { label: "Cerebras", base: "https://api.cerebras.ai/v1", models: ["gpt-oss-120b", "llama-3.3-70b"],
    keyUrl: "https://cloud.cerebras.ai", keyHint: "csk-…", free: "Free tier, very fast." },
  mistral: { label: "Mistral", base: "https://api.mistral.ai/v1", models: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"],
    keyUrl: "https://console.mistral.ai/api-keys", keyHint: "", free: "Free “Experiment” plan." },
  openai: { label: "OpenAI (ChatGPT)", base: "https://api.openai.com/v1", models: ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1"],
    keyUrl: "https://platform.openai.com/api-keys", keyHint: "sk-…", free: "Paid (pay as you go)." },
  anthropic: { label: "Anthropic (Claude)", base: "https://api.anthropic.com/v1", models: ["claude-haiku-5-5", "claude-sonnet-5-5"], anthropic: true,
    keyUrl: "https://console.anthropic.com/settings/keys", keyHint: "sk-ant-…", free: "Paid (pay as you go)." },
  deepseek: { label: "DeepSeek", base: "https://api.deepseek.com/v1", models: ["deepseek-chat"],
    keyUrl: "https://platform.deepseek.com/api_keys", keyHint: "sk-…", free: "Paid, very cheap." },
  custom: { label: "Other (OpenAI-compatible)", base: "", models: [], custom: true,
    keyUrl: "", keyHint: "", free: "Any OpenAI-compatible address: Together, Fireworks, Ollama or LM Studio through a tunnel…" },
};

export type Msg = { role: "system" | "user" | "assistant"; content: string };
export type ChatOpts = { maxTokens: number; temperature: number; timeoutMs?: number; json?: boolean };
/** One AI that can answer: a class provider, the ClassBot's key, or Cloudflare's AI. */
export interface Step { id: string; label: string; type: string; key: string; model: string; base: string; source: "class" | "server" }

const NAME_LEN = 120;
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p.finally(() => clearTimeout(timer)), new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), ms); })]);
}
function pick(raw: any): string {
  const c = raw?.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((x: any) => x?.text ?? "").join("");
  if (Array.isArray(raw?.content)) return raw.content.filter((x: any) => x?.type === "text").map((x: any) => x.text).join("");
  return "";
}

// ------------------------------------------------------------ which AIs answer for this call
let classCountCache: { at: number; n: number } | null = null;
export const resetAiCaches = () => { classCountCache = null; };
async function classCount(env: Env): Promise<number> {
  if (classCountCache && Date.now() - classCountCache.at < 60_000) return classCountCache.n;
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM guilds").first<{ n: number }>().catch(() => null);
  classCountCache = { at: Date.now(), n: Number(r?.n ?? 1) };
  return classCountCache.n;
}
/** May this call use the ClassBot's own key (the Cloudflare secret, or the one saved for all classes)? */
export async function serverAllowed(env: Env, cfg: ClassAi | null): Promise<boolean> {
  if (cfg?.server === true) return true;
  if (cfg?.server === false) return false;
  return (await classCount(env)) <= 1;   // a ClassBot with one class: it's that teacher's key
}
function serverSteps(env: Env): Step[] {
  const out: Step[] = [];
  if (env.GROQ_API_KEY) out.push({ id: "server-groq", label: "Groq (ClassBot's key)", type: "groq", key: env.GROQ_API_KEY, model: env.GROQ_MODEL || "", base: PRESETS.groq.base, source: "server" });
  if (env.LLM_BASE_URL) out.push({ id: "server-llm", label: `${env.LLM_MODEL || "AI"} (ClassBot's address)`, type: "custom", key: env.LLM_API_KEY || "", model: env.LLM_MODEL || "", base: env.LLM_BASE_URL.replace(/\/$/, ""), source: "server" });
  return out;
}
export const stepOf = (p: AiProvider): Step => ({ id: p.id, type: p.type, key: p.key, model: p.model || PRESETS[p.type]?.models[0] || "",
  base: (p.type === "custom" ? p.base || "" : PRESETS[p.type]?.base || "").replace(/\/$/, ""), label: `${PRESETS[p.type]?.label || p.type}${p.model ? ` · ${p.model}` : ""}`, source: "class" });

/** The keyed AIs to try, in order, for the class of this call (Cloudflare's AI is separate: see workersAllowed). */
export async function keyedSteps(env: Env): Promise<Step[]> {
  const gid = classOf(env);
  const cfg = gid ? await classAi(env, gid) : null;
  const mine = (cfg?.providers ?? []).filter((p) => !p.off && (p.key || p.type === "custom")).map(stepOf);
  return [...mine, ...((await serverAllowed(env, cfg)) ? serverSteps(env) : [])];
}
export async function workersAllowed(env: Env): Promise<boolean> {
  if (!env.AI) return false;
  const gid = classOf(env);
  return !gid || (await classAi(env, gid)).workers !== false;
}

// ------------------------------------------------------------ OpenRouter: its free models change often
// A ":free" model can stop being free (OpenRouter then answers 404 "This model is unavailable for free"). ClassBot asks
// OpenRouter which models are free right now and uses the best one it finds.
const OR_PREFER = [/gpt-oss-120b/i, /llama-3\.3-70b/i, /deepseek.*(v3|chat|r1)/i, /qwen.*(235b|72b|coder)/i, /gemma-3-27b/i, /mistral-(small|medium)/i, /llama-4/i, /glm/i, /kimi/i];
let orCache: { at: number; ids: string[] } | null = null;
export async function openRouterFree(fresh = false): Promise<string[]> {
  if (!fresh && orCache && Date.now() - orCache.at < 3 * 3600_000) return orCache.ids;
  try {
    const res = await withTimeout(fetch("https://openrouter.ai/api/v1/models"), 15000);
    if (!res.ok) return orCache?.ids ?? [];
    const j: any = await res.json();
    const free = (Array.isArray(j?.data) ? j.data : []).filter((m: any) => {
      const id = String(m?.id || "");
      const zero = (v: unknown) => v != null && Number(v) === 0;
      const textOut = !m?.architecture?.output_modalities || (m.architecture.output_modalities as string[]).includes("text");
      return id && textOut && (id.endsWith(":free") || (zero(m?.pricing?.prompt) && zero(m?.pricing?.completion))) && !/router|auto$/i.test(id);
    });
    const rank = (m: any) => { const i = OR_PREFER.findIndex((rx) => rx.test(m.id)); return i < 0 ? OR_PREFER.length : i; };
    free.sort((a: any, b: any) => rank(a) - rank(b) || (Number(b.context_length) || 0) - (Number(a.context_length) || 0));
    orCache = { at: Date.now(), ids: free.map((m: any) => String(m.id)).slice(0, 25) };
    return orCache.ids;
  } catch { return orCache?.ids ?? []; }
}
/** OpenRouter says this model isn't there (or isn't free anymore). */
const orGone = (s: { type: string }, e: unknown) => s.type === "openrouter" && e instanceof AiCallError && (e.status === 404 || /unavailable for free|not a valid model|no endpoints found/i.test(e.message));
/** This model can't be used (gone, or blocked for this account), but the key may work with another one. */
const modelProblem = (e: unknown) => e instanceof AiCallError && (e.status === 404 || /model not allowed|unavailable for free|not a valid model|no endpoints found|model.*(not found|does not exist|decommissioned|blocked)/i.test(e.message));

// ------------------------------------------------------------ calling one AI
export class AiCallError extends Error { status: number; constructor(msg: string, status = 0) { super(msg); this.status = status; } }

async function callStep(s: Step, messages: Msg[], o: ChatOpts, model = s.model): Promise<string> {
  const timeout = o.timeoutMs ?? 90000;
  if (PRESETS[s.type]?.anthropic) {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n") + (o.json ? "\n\nAnswer with one JSON object only." : "");
    const res = await withTimeout(fetch(`${s.base}/messages`, {
      method: "POST", headers: { "content-type": "application/json", "x-api-key": s.key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: o.maxTokens, temperature: o.temperature, ...(system.trim() ? { system } : {}), messages: messages.filter((m) => m.role !== "system") }),
    }), timeout);
    if (!res.ok) throw new AiCallError(await errText(res), res.status);
    return pick(await res.json());
  }
  const headers: Record<string, string> = { "content-type": "application/json", ...(s.key ? { authorization: `Bearer ${s.key}` } : {}) };
  if (s.type === "openrouter") { headers["x-title"] = "ClassBot"; }
  const reasoning = /gpt-oss/.test(model) && (s.type === "groq" || s.type === "cerebras") ? { reasoning_effort: "low" } : {};
  const full = (json: boolean) => JSON.stringify({ model, messages, max_tokens: o.maxTokens, temperature: o.temperature, ...reasoning, ...(json ? { response_format: { type: "json_object" } } : {}) });
  const send = (body: string) => withTimeout(fetch(`${s.base}/chat/completions`, { method: "POST", headers, body }), timeout);
  let res = await send(full(!!o.json));
  // some models refuse JSON mode, max_tokens or temperature: try again with the basics
  if (res.status === 400 && o.json) res = await send(full(false));
  if (res.status === 400) res = await send(JSON.stringify({ model, messages, max_completion_tokens: o.maxTokens }));
  if (!res.ok) throw new AiCallError(await errText(res), res.status);
  return pick(await res.json());
}
async function errText(res: Response): Promise<string> {
  let msg = "";
  try { const j: any = await res.json(); msg = j?.error?.message || j?.message || j?.error || ""; } catch { /* not JSON */ }
  msg = String(msg).replace(/\s+/g, " ").slice(0, 160);
  // a model the account may not use (Groq: "blocked at the organization level", terms to accept…) isn't a wrong key
  if (res.status === 403 && /model/i.test(msg)) return `model not allowed for this account (403)${msg ? `: ${msg}` : ""}`;
  if (res.status === 401 || res.status === 403) return `key refused (${res.status})${msg ? `: ${msg}` : ""}`;
  if (res.status === 429) return `limit reached (429)${msg ? `: ${msg}` : ""}`;
  if (res.status === 404) return `model or address not found (404)${msg ? `: ${msg}` : ""}`;
  return `answered ${res.status}${msg ? `: ${msg}` : ""}`;
}

// remember each provider's last problem (for the settings page) and the last one that answered
const lastSeen = new Map<string, number>();
async function note(env: Env, s: Step, err: string | null) {
  const gid = classOf(env);
  if (!gid || s.source !== "class") return;
  const k = `${gid}|${s.id}|${err ? "e" : "ok"}`;
  if (!err && Date.now() - (lastSeen.get(k) ?? 0) < 10 * 60_000) return;   // a success is written at most every 10 minutes
  lastSeen.set(k, Date.now());
  try {
    const r = await env.DB.prepare("SELECT v FROM app_settings WHERE k = ?").bind(`aist:${gid}`).first<{ v: string }>();
    const st = r?.v ? JSON.parse(r.v) : {};
    st[s.id] = err ? { ...(st[s.id] || {}), err: err.slice(0, 200), errAt: Math.floor(Date.now() / 1000) } : { ...(st[s.id] || {}), err: null, okAt: Math.floor(Date.now() / 1000) };
    await env.DB.prepare("INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at")
      .bind(`aist:${gid}`, JSON.stringify(st), Math.floor(Date.now() / 1000)).run();
  } catch { /* best effort */ }
}

/**
 * Ask the keyed AIs of this class in order; the first good answer wins. Groq also tries its other models when one
 * is busy. Throws when none answers (the caller then tries Cloudflare's AI).
 */
export async function keyedChat(env: Env, messages: Msg[], o: ChatOpts): Promise<{ text: string; model: string; provider: string }> {
  const steps = await keyedSteps(env);
  if (!steps.length) throw new AiCallError("no AI key");
  const errors: string[] = [];
  for (const s of steps) {
    const models = s.type === "groq" ? [...new Set([s.model || PRESETS.groq.models[0], ...PRESETS.groq.models])] : [s.model];
    let err = "", swapped = false;
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      try {
        const text = await callStep(s, messages, o, model);
        if (text.trim()) {
          await note(env, s, null);
          if (model !== s.model && s.type === "openrouter") await keepModel(env, s.id, model);
          return { text, model, provider: s.label };
        }
        err = "empty answer";
      } catch (e) {
        err = String((e as Error)?.message ?? e);
        if (e instanceof AiCallError && (e.status === 401 || e.status === 403) && !modelProblem(e)) break;   // a refused key: the other models won't help
        // OpenRouter: this model isn't free anymore (or is gone): try the ones free right now
        if (!swapped && orGone(s, e)) { swapped = true; models.push(...(await openRouterFree(true)).filter((m) => !models.includes(m)).slice(0, 3)); }
      }
    }
    errors.push(`${s.label}: ${err}`);
    await note(env, s, err);
  }
  throw new AiCallError(errors.join(" · ").slice(0, 400));
}

/** A tiny request to check a provider before saving it. */
export async function testProvider(p: AiProvider): Promise<{ ok: boolean; warn?: string; error?: string; model: string; gone?: boolean }> {
  const s = stepOf(p);
  if (!s.base) return { ok: false, error: "Give the address of the API (it ends with /v1).", model: s.model };
  if (!s.model) return { ok: false, error: "Choose a model.", model: s.model };
  try {
    await callStep(s, [{ role: "user", content: "Reply with the word: ok" }], { maxTokens: 300, temperature: 0, timeoutMs: 25000 });
    return { ok: true, model: s.model };
  } catch (e) {
    const status = (e as AiCallError)?.status ?? 0;
    const msg = String((e as Error)?.message ?? e);
    if (status === 429) return { ok: true, warn: `The key works, but its limit is reached right now: ${msg}`, model: s.model };
    if (msg === "timeout") return { ok: false, error: "It didn't answer within 25 seconds.", model: s.model };
    return { ok: false, error: `${PRESETS[p.type]?.label || "The AI"}: ${msg}`, model: s.model, gone: orGone(s, e) || modelProblem(e) };
  }
}

// ------------------------------------------------------------ settings (one class)
export class AiKeyError extends Error {}
const mask = (k: string) => (k ? (k.length > 12 ? `${k.slice(0, 4)}…${k.slice(-4)}` : "••••") : "");

async function save(env: Env, gid: string, cfg: ClassAi) {
  await env.DB.prepare("INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at")
    .bind(`ai:${gid}`, JSON.stringify(cfg), Math.floor(Date.now() / 1000)).run();
  dropClassAi(gid);
}

/** A provider's model changed by itself (OpenRouter's free model was gone): keep the one that answered. */
async function keepModel(env: Env, providerId: string, model: string) {
  const gid = classOf(env);
  if (!gid) return;
  try {
    const cfg = await classAi(env, gid, true);
    const p = cfg.providers.find((x) => x.id === providerId);
    if (p && p.model !== model) { p.model = model; await save(env, gid, cfg); }
  } catch { /* best effort */ }
}

/** What the dashboard shows for a class: never a key, only its first and last characters. */
export async function classAiView(env: Env, gid: string) {
  const cfg = await classAi(env, gid, true);
  const st = await env.DB.prepare("SELECT v FROM app_settings WHERE k = ?").bind(`aist:${gid}`).first<{ v: string }>().catch(() => null);
  const stats = st?.v ? JSON.parse(st.v) : {};
  const day = new Date().toISOString().slice(0, 10);
  const used = await env.DB.prepare("SELECT count FROM ai_usage WHERE day = ?").bind(`${day}|${gid}`).first<{ count: number }>().catch(() => null);
  const server = serverSteps(env);
  const classes = await env.DB.prepare("SELECT id, name FROM guilds ORDER BY name").all<{ id: string; name: string | null }>().then((r) => r.results ?? []).catch(() => []);
  return {
    providers: cfg.providers.map((p) => ({ id: p.id, type: p.type, label: PRESETS[p.type]?.label || p.type, model: p.model, base: p.type === "custom" ? p.base || "" : "",
      masked: mask(p.key), off: !!p.off, err: stats[p.id]?.err ?? null, errAt: stats[p.id]?.errAt ?? null, okAt: stats[p.id]?.okAt ?? null })),
    workers: cfg.workers !== false, hasWorkers: !!env.AI,
    server: server.length ? { label: server.map((s) => s.label).join(" + "), masked: mask(server[0].key), allowed: await serverAllowed(env, cfg), choice: cfg.server ?? null } : null,
    usage: { today: used?.count ?? 0, limit: Number(env.AI_DAILY_LIMIT || 80), own: cfg.providers.some((p) => !p.off) },
    presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, { label: v.label, models: v.models, keyUrl: v.keyUrl, keyHint: v.keyHint, free: v.free, custom: !!v.custom }])),
    classes: classes.filter((c) => c.id !== gid).map((c) => ({ id: c.id, name: c.name || c.id })),
  };
}

/** Add an AI to a class (tested first: a key that doesn't work is not saved). */
export async function addProvider(env: Env, gid: string, b: { type?: string; key?: string; model?: string; base?: string }) {
  const type = String(b.type || "");
  if (!PRESETS[type]) throw new AiKeyError("Choose an AI provider.");
  const key = String(b.key ?? "").trim();
  if (!key && type !== "custom") throw new AiKeyError("Paste the API key.");
  if (/\s/.test(key) || key.length > 400) throw new AiKeyError("This doesn't look like an API key (copy it again, without spaces).");
  const model = String(b.model ?? "").trim().slice(0, NAME_LEN) || PRESETS[type].models[0] || "";
  if (model && !/^[\w./:@-]+$/.test(model)) throw new AiKeyError("Unknown model name.");
  let base = String(b.base ?? "").trim().replace(/\/(chat\/completions)?$/, "");
  if (type === "custom" && !/^https:\/\/[^\s]+$/i.test(base)) throw new AiKeyError("The address must start with https:// (e.g. https://api.together.xyz/v1).");
  if (type !== "custom") base = "";
  const p: AiProvider = { id: crypto.randomUUID().slice(0, 8), type, key, model, ...(base ? { base } : {}) };
  let t = await testProvider(p);
  // the model asked for can't be used (OpenRouter: not free anymore; Groq: blocked by the account's settings…):
  // the key may work with another model: OpenRouter's free models of today, else the provider's other suggested models
  if (!t.ok && t.gone) {
    const asked = p.model;
    const others = type === "openrouter" ? (await openRouterFree(true)).slice(0, 6) : PRESETS[type].models;
    for (const m of others.filter((x) => x !== asked).slice(0, 5)) {
      const r = await testProvider({ ...p, model: m });
      if (r.ok) {
        p.model = m;
        const why = type === "openrouter" ? `“${asked}” isn't free on OpenRouter anymore: ClassBot uses “${m}”, free today` : `“${asked}” can't be used with this key (${String(t.error).replace(/^[^:]+:\s*/, "").slice(0, 120)}): ClassBot uses “${m}”`;
        t = { ...r, warn: [`${why} (you can change it in the list).`, r.warn].filter(Boolean).join(" ") };
        break;
      }
      if (r.error && /key refused/.test(r.error)) { t = r; break; }
    }
    if (!t.ok && t.gone) t.error = type === "openrouter" ? `${t.error} · No free OpenRouter model answered right now: try again later, or choose a paid model (your account needs credits).`
      : `${t.error} · None of the suggested models answered with this key: allow one in the provider's settings, or type another model name.`;
  }
  if (!t.ok) throw new AiKeyError(t.error || "This AI didn't answer.");
  const cfg = await classAi(env, gid, true);
  if (cfg.providers.length >= 8) throw new AiKeyError("8 AIs at most: remove one first.");
  cfg.providers.push(p);
  await save(env, gid, cfg);
  return { view: await classAiView(env, gid), warn: t.warn || null };
}
/** Order, switches, model of a provider. */
export async function updateClassAi(env: Env, gid: string, b: { order?: string[]; workers?: boolean; server?: boolean | null; off?: Record<string, boolean>; models?: Record<string, string> }) {
  const cfg = await classAi(env, gid, true);
  if (Array.isArray(b.order)) {
    const by = new Map(cfg.providers.map((p) => [p.id, p]));
    const sorted = b.order.map((id) => by.get(String(id))).filter(Boolean) as AiProvider[];
    cfg.providers = [...sorted, ...cfg.providers.filter((p) => !sorted.includes(p))];
  }
  if (typeof b.workers === "boolean") cfg.workers = b.workers;
  if (b.server === null) delete cfg.server; else if (typeof b.server === "boolean") cfg.server = b.server;
  for (const p of cfg.providers) {
    if (b.off && p.id in b.off) p.off = !!b.off[p.id] || undefined;
    if (b.models && p.id in b.models) { const m = String(b.models[p.id]).trim().slice(0, NAME_LEN); if (m && /^[\w./:@-]+$/.test(m)) p.model = m; }
  }
  await save(env, gid, cfg);
  return classAiView(env, gid);
}
export async function removeProvider(env: Env, gid: string, id: string) {
  const cfg = await classAi(env, gid, true);
  cfg.providers = cfg.providers.filter((p) => p.id !== id);
  await save(env, gid, cfg);
  return classAiView(env, gid);
}
export async function testSaved(env: Env, gid: string, id: string) {
  const p = (await classAi(env, gid, true)).providers.find((x) => x.id === id);
  if (!p) throw new AiKeyError("This AI was removed.");
  const t = await testProvider(p);
  await note(env, stepOf(p), t.ok ? null : t.error || "failed");
  return t;
}
/** Copy this class's AIs (keys included) to other classes of this ClassBot. */
export async function copyClassAi(env: Env, gid: string, to: string[]) {
  const cfg = await classAi(env, gid, true);
  let n = 0;
  for (const other of [...new Set(to.map(String))].filter((x) => x && x !== gid).slice(0, 50)) {
    const exists = await env.DB.prepare("SELECT 1 AS x FROM guilds WHERE id = ?").bind(other).first().catch(() => null);
    if (!exists) continue;
    const cur = await classAi(env, other, true);
    await save(env, other, { ...cur, providers: cfg.providers.map((p) => ({ ...p, id: crypto.randomUUID().slice(0, 8) })), workers: cfg.workers });
    n++;
  }
  return { copied: n };
}

/** For the diagnostics page and the status lines: what answers for this class. */
export async function aiChainLabel(env: Env): Promise<string> {
  const steps = await keyedSteps(env);
  const w = await workersAllowed(env);
  const names = [...steps.map((s) => s.label), ...(w ? ["Cloudflare AI"] : [])];
  return names.length ? names.join(" → ") : "no AI";
}
export async function aiStatus(env: Env): Promise<"keys" | "workers" | null> {
  if ((await keyedSteps(env)).length) return "keys";
  return (await workersAllowed(env)) ? "workers" : null;
}
