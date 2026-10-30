// Which class an AI call is for. Each class has its own AI keys (Settings → AI), so the AI code needs to know the
// class: the entry points (Discord interactions, the dashboard API, the cron loops…) wrap `env` with forClass().
// This file has no imports, so db.ts (the AI budget) and ai.ts can both use it.

export const CLASS = Symbol.for("classbot.aiClass");

/** The same env, marked for one class (a thin copy: the bindings stay shared). */
export function forClass<T extends object>(env: T, guildId: unknown): T {
  const id = guildId == null ? "" : String(guildId);
  if (!id || (env as any)[CLASS] === id) return env;
  const e = Object.create(env);
  e[CLASS] = id;
  return e;
}
export const classOf = (env: any): string | null => (env && env[CLASS]) || null;

export interface AiProvider { id: string; type: string; key: string; model: string; base?: string; off?: boolean }
/** A class's AI: its providers in order (each one is the backup of the one before), and two switches. */
export interface ClassAi {
  providers: AiProvider[];
  workers?: boolean;   // Cloudflare's free AI as the last backup (default: on)
  server?: boolean;    // may use the ClassBot's own key (Cloudflare secret): default only when the ClassBot has one class
  rotate?: boolean;    // several keys of the same provider take turns (default: on)
  search?: { providers?: { id: string; type: string; key: string }[]; key?: string };   // web search services of the chat (websearch.ts)
}

const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; cfg: ClassAi }>();

export async function classAi(env: any, gid: string, fresh = false): Promise<ClassAi> {
  const c = cache.get(gid);
  if (!fresh && c && Date.now() - c.at < CACHE_MS) return c.cfg;
  let cfg: ClassAi = { providers: [] };
  try {
    const r = await env.DB.prepare("SELECT v FROM app_settings WHERE k = ?").bind(`ai:${gid}`).first();
    if (r?.v) { const o = JSON.parse(r.v); cfg = { ...o, providers: Array.isArray(o.providers) ? o.providers : [] }; }
  } catch { /* table not there yet */ }
  cache.set(gid, { at: Date.now(), cfg });
  return cfg;
}
export const dropClassAi = (gid: string) => { cache.delete(gid); };

/** Does the class of this call have AI keys of its own? (Then ClassBot's daily limit doesn't apply.) */
export async function hasOwnAi(env: any): Promise<boolean> {
  const gid = classOf(env);
  if (!gid) return false;
  return (await classAi(env, gid)).providers.some((p) => !p.off);
}
