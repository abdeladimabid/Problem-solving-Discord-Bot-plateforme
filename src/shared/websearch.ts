// Web search for the chat with the class (Settings → AI → Web search). The class can add search services with its own
// keys (Tavily, Brave Search), asked in order: when one fails (key refused, limit reached, service gone) the next one
// answers. Free sources without any key are always there too (MDN's own search, Stack Overflow), so the chat finds real
// resources even with no key at all, or when every service is down. Keys are kept with the class's AI keys and never
// sent back to the browser; the query is written by the AI and never holds a student's name or code.
import type { Env } from "./types.ts";
import { classAi, dropClassAi } from "./aictx.ts";

export class SearchKeyError extends Error {}
export interface WebResult { title: string; url: string; snippet: string; via: string }
interface SearchProvider { id: string; type: string; key: string }

export const SEARCH_PRESETS: Record<string, { label: string; keyUrl: string; keyHint: string; free: string }> = {
  tavily: { label: "Tavily", keyUrl: "https://app.tavily.com", keyHint: "tvly-…", free: "1000 free searches a month." },
  brave: { label: "Brave Search", keyUrl: "https://api-search.brave.com/app/keys", keyHint: "BSA…", free: "2000 free searches a month (a card is asked at sign-up)." },
};
const FREE = ["MDN", "Stack Overflow"];

const mask = (k: string) => (k.length > 12 ? `${k.slice(0, 5)}…${k.slice(-4)}` : "••••");
const clip = (t: unknown, n: number) => String(t ?? "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, n);
const http = (u: unknown) => /^https?:\/\//.test(String(u || ""));

/** The class's search services, in order (an older single Tavily key counts as the first). */
async function providers(env: Env, gid: string): Promise<SearchProvider[]> {
  const s: any = (await classAi(env, gid))?.search;
  if (!s) return [];
  if (Array.isArray(s.providers)) return s.providers.filter((p: any) => p && SEARCH_PRESETS[p.type] && typeof p.key === "string" && p.key);
  return typeof s.key === "string" && s.key ? [{ id: "tavily", type: "tavily", key: s.key }] : [];
}

/** What the settings page shows: the services (never a key, only its ends) and the free sources. */
export async function searchView(env: Env, gid: string) {
  return { providers: (await providers(env, gid)).map((p) => ({ id: p.id, type: p.type, label: SEARCH_PRESETS[p.type].label, masked: mask(p.key) })),
    free: FREE, presets: SEARCH_PRESETS };
}

// ------------------------------------------------------------ the services
async function tavily(key: string, query: string, max: number): Promise<WebResult[]> {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: max, search_depth: "basic", include_answer: false }), signal: AbortSignal.timeout(12000),
  });
  if (r.status === 401 || r.status === 403) throw new SearchKeyError("Tavily refused this key: copy it again from app.tavily.com.");
  if (r.status === 429 || r.status === 432) throw new SearchKeyError("Tavily's limit is reached for this key.");
  if (!r.ok) throw new SearchKeyError(`Tavily didn't answer (${r.status}).`);
  const j: any = await r.json().catch(() => ({}));
  return (Array.isArray(j.results) ? j.results : []).filter((x: any) => http(x?.url)).slice(0, max)
    .map((x: any) => ({ title: clip(x.title, 160), url: String(x.url).slice(0, 500), snippet: clip(x.content, 300), via: "Tavily" }));
}
async function brave(key: string, query: string, max: number): Promise<WebResult[]> {
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}`, {
    headers: { accept: "application/json", "x-subscription-token": key }, signal: AbortSignal.timeout(12000),
  });
  if (r.status === 401 || r.status === 403 || r.status === 422) throw new SearchKeyError("Brave Search refused this key.");
  if (r.status === 429) throw new SearchKeyError("Brave Search's limit is reached for this key.");
  if (!r.ok) throw new SearchKeyError(`Brave Search didn't answer (${r.status}).`);
  const j: any = await r.json().catch(() => ({}));
  return (Array.isArray(j.web?.results) ? j.web.results : []).filter((x: any) => http(x?.url)).slice(0, max)
    .map((x: any) => ({ title: clip(x.title, 160), url: String(x.url).slice(0, 500), snippet: clip(x.description, 300), via: "Brave" }));
}
const KEYED: Record<string, (key: string, q: string, max: number) => Promise<WebResult[]>> = { tavily, brave };

/** MDN's own search (French first, else English): the reference for HTML, CSS and JavaScript, free and without a key. */
async function mdn(query: string, max: number): Promise<WebResult[]> {
  const one = async (locale: string) => {
    const r = await fetch(`https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(query)}&locale=${locale}&size=${max}`, { signal: AbortSignal.timeout(8000) });
    const j: any = r.ok ? await r.json().catch(() => ({})) : {};
    return (Array.isArray(j.documents) ? j.documents : []).filter((d: any) => typeof d?.mdn_url === "string").slice(0, max)
      .map((d: any) => ({ title: clip(d.title, 160), url: `https://developer.mozilla.org${d.mdn_url}`, snippet: clip(d.summary, 300), via: "MDN" }));
  };
  const fr = await one("fr").catch(() => []);
  return fr.length ? fr : one("en-US").catch(() => []);
}
/** Stack Overflow's answered questions (no key: a few hundred searches a day per address). */
async function stackOverflow(query: string, max: number): Promise<WebResult[]> {
  const r = await fetch(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&answers=1&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=${max}`, { signal: AbortSignal.timeout(8000) });
  const j: any = r.ok ? await r.json().catch(() => ({})) : {};
  return (Array.isArray(j.items) ? j.items : []).filter((x: any) => http(x?.link)).slice(0, max)
    .map((x: any) => ({ title: clip(x.title, 160), url: String(x.link).slice(0, 500), snippet: `Question avec ${Number(x.answer_count) || 0} réponse(s)${x.is_answered ? ", résolue" : ""}`, via: "Stack Overflow" }));
}

// ------------------------------------------------------------ settings
async function saveSearch(env: Env, gid: string, list: SearchProvider[]) {
  const cfg: any = await classAi(env, gid, true);
  if (list.length) cfg.search = { providers: list }; else delete cfg.search;
  await env.DB.prepare("INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at")
    .bind(`ai:${gid}`, JSON.stringify(cfg), Math.floor(Date.now() / 1000)).run();
  dropClassAi(gid);
}

/** Add a search service (tried first: a key that doesn't work is not saved). */
export async function addSearchProvider(env: Env, gid: string, b: { type?: unknown; key?: unknown }) {
  const type = String(b.type || "");
  if (!SEARCH_PRESETS[type]) throw new SearchKeyError("Choose a search service.");
  const key = String(b.key ?? "").trim();
  if (!key || /\s/.test(key) || key.length > 200) throw new SearchKeyError("Paste the API key (without spaces).");
  if (type === "tavily" && !/^tvly-/.test(key)) throw new SearchKeyError("A Tavily key starts with tvly-.");
  await KEYED[type](key, "MDN CSS grid", 1);
  const list = await providers(env, gid);
  if (list.length >= 5) throw new SearchKeyError("5 search services at most: remove one first.");
  await saveSearch(env, gid, [...list, { id: crypto.randomUUID().slice(0, 8), type, key }]);
  return searchView(env, gid);
}
export async function removeSearchProvider(env: Env, gid: string, id: string) {
  await saveSearch(env, gid, (await providers(env, gid)).filter((p) => p.id !== id));
  return searchView(env, gid);
}

// ------------------------------------------------------------ the chat's search
/**
 * The chat's search: the class's services in order (the first that answers), then MDN's own pages on top; with no
 * service, or none answering, the free sources (MDN, Stack Overflow). The query loses anything like a student's code.
 */
export async function webSearch(env: Env, gid: string, query: string): Promise<WebResult[]> {
  const q = String(query || "").replace(/\bE\d{1,3}\b/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  if (q.length < 3) return [];
  let found: WebResult[] = [];
  for (const p of await providers(env, gid)) {
    found = await KEYED[p.type](p.key, q, 6).catch(() => []);
    if (found.length) break;
  }
  const [ref, so] = await Promise.all([mdn(q, found.length ? 3 : 5).catch(() => []), found.length ? Promise.resolve([]) : stackOverflow(q, 4).catch(() => [])]);
  const seen = new Set<string>();
  return [...found, ...ref, ...so].filter((r) => { const k = r.url.replace(/[#?].*$/, "").replace(/\/$/, ""); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
}
