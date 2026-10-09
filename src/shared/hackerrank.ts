// HackerRank's public (unofficial) JSON endpoints, the ones hackerrank.com
// itself uses. They are undocumented and can change without notice.
import type { Entry } from "./types.ts";

const BASE = "https://www.hackerrank.com/rest";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json",
};

export class HackerRankError extends Error {}

async function getJson(url: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { headers: HEADERS });
  } catch (e) {
    throw new HackerRankError(`network error (${(e as Error).message})`);
  }
  if (res.status === 404) throw new HackerRankError("not found (404)");
  if (res.status === 401 || res.status === 403) throw new HackerRankError("access refused (private, hidden, or blocked)");
  if (!res.ok) throw new HackerRankError(`HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new HackerRankError("unexpected (non-JSON) answer");
  }
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || Number.isNaN(n) ? null : n;
};

export function parseContestSlug(text: string): string | null {
  const t = text.trim();
  const m = t.match(/hackerrank\.com\/contests\/([A-Za-z0-9_-]+)/i);
  if (m) return m[1].toLowerCase();
  return /^[A-Za-z0-9_-]+$/.test(t) ? t.toLowerCase() : null;
}

export function parseChallengeSlug(text: string): string | null {
  const t = text.trim();
  const m = t.match(/hackerrank\.com\/(?:contests\/[^/]+\/)?challenges\/([A-Za-z0-9_-]+)/i);
  if (m) return m[1].toLowerCase();
  return /^[A-Za-z0-9_-]+$/.test(t) ? t.toLowerCase() : null;
}

export async function fetchContest(slug: string) {
  const data = await getJson(`${BASE}/contests/${slug}`);
  const m = data?.model;
  if (!m) throw new HackerRankError("contest not found");
  return { slug: String(m.slug ?? slug), name: String(m.name ?? slug), start: num(m.epoch_starttime), end: num(m.epoch_endtime) };
}

export async function fetchLeaderboard(slug: string, maxEntries = 500): Promise<Entry[]> {
  const out: Entry[] = [];
  const page = 100;
  for (let offset = 0; offset < maxEntries; offset += page) {
    const data = await getJson(`${BASE}/contests/${slug}/leaderboard?offset=${offset}&limit=${page}`);
    const models: any[] = data?.models ?? [];
    for (const m of models) {
      let name = m.hacker ?? m.username;
      if (name && typeof name === "object") name = name.username;
      const rank = num(m.rank);
      if (!name || rank === null) continue;
      out.push({ username: String(name), rank: Math.round(rank), score: num(m.score) ?? 0, time_taken: num(m.time_taken) });
    }
    const total = Number(data?.total ?? 0);
    if (!models.length || offset + page >= total) break;
  }
  out.sort((a, b) => a.rank - b.rank || b.score - a.score);
  return out;
}

/** Details of a public practice challenge (title, difficulty). */
export async function fetchChallenge(slug: string) {
  const data = await getJson(`${BASE}/contests/master/challenges/${slug}`);
  const m = data?.model;
  if (!m) throw new HackerRankError("challenge not found");
  const d = String(m.difficulty_name ?? "").toLowerCase();
  const difficulty = d.startsWith("easy") ? "easy" : d.startsWith("medium") ? "medium" : d ? "hard" : null;
  return { slug: String(m.slug ?? slug), title: String(m.name ?? slug), difficulty };
}

/**
 * Recently solved challenges of a user (from their public profile).
 * Returns slug -> unix time of the solve. Throws if HackerRank can't be read.
 */
export async function recentSolves(username: string): Promise<Map<string, number>> {
  const data = await getJson(`${BASE}/hackers/${encodeURIComponent(username)}/recent_challenges?limit=50&response_version=v2`);
  const models: any[] = data?.models ?? (Array.isArray(data) ? data : []);
  const out = new Map<string, number>();
  for (const m of models) {
    let slug: string | undefined = m.ch_slug ?? m.slug ?? m.challenge_slug;
    if (!slug && typeof m.url === "string") slug = m.url.match(/challenges\/([^/]+)/)?.[1];
    if (!slug) continue;
    const when = m.created_at ? Math.floor(new Date(m.created_at).getTime() / 1000) : 0;
    out.set(slug.toLowerCase(), Number.isFinite(when) ? when : 0);
  }
  return out;
}

/** Public profile text fields, used to check the ownership code a student added. */
export async function profileText(username: string): Promise<string> {
  const data = await getJson(`${BASE}/contests/master/hackers/${encodeURIComponent(username)}/profile`);
  const m = data?.model;
  if (!m) throw new HackerRankError("profile not found");
  return ["name", "personal_first_name", "personal_last_name", "short_bio", "school", "company", "job_title", "website", "title", "jobs_headline"]
    .map((k) => (typeof m[k] === "string" ? m[k] : "")).join(" \n ");
}

export async function hackerrankHealth(): Promise<{ ok: boolean; ms: number; detail: string }> {
  const t = Date.now();
  try {
    const solves = await recentSolves("gennady");
    return { ok: solves.size > 0, ms: Date.now() - t, detail: `read ${solves.size} recent solves of a public profile` };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, detail: (e as Error).message };
  }
}
