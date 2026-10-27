// 💼 A student's portfolio: the public page they share (/u/<key>) with recruiters and companies.
// What they write (a headline, a few lines about them, their contacts, whether they look for an internship…) and the
// projects they add from Discord (/portfolio add: one of their GitHub repos, or any link), plus what ClassBot knows and
// can vouch for: their training projects (finalized briefs), the competencies validated, their GitHub and VS Code
// activity, the challenges solved, their badges. The student decides what is shown (/portfolio show).
// Kept in app_settings (pf:<guild>:<student>): no new table.
import type { Env, GuildRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { installationToken } from "./review/gh.ts";
import { ghAppOf } from "./github.ts";
import { REF_NAMES, assessBase } from "./review/engine.ts";
import { compLabel } from "./program.ts";
import { parseAgg } from "./vscodedb.ts";
import { addDays, dayOf } from "./vscode.ts";
import { profileData } from "./share.ts";
import { statesOf } from "./review/debrief.ts";

export class PortfolioError extends Error {}

export interface PfProject {
  id: string; url: string; repo: string | null; title: string; desc: string; tags: string[]; lang: string | null;
  stars: number; forks: number; demo: string | null; pushed: string | null; featured: boolean; added_at: number;
}
export const SECTIONS = ["projects", "training", "skills", "activity", "hours", "practice", "badges"] as const;
export type Section = (typeof SECTIONS)[number];
export const OPEN = ["", "stage", "alternance", "emploi", "freelance"] as const;
export interface Portfolio {
  headline: string; bio: string; city: string; email: string; linkedin: string; website: string; cv: string;
  open: (typeof OPEN)[number]; hide: Section[]; hiddenBriefs: number[]; projects: PfProject[]; updated_at: number;
}
const EMPTY = (): Portfolio => ({ headline: "", bio: "", city: "", email: "", linkedin: "", website: "", cv: "", open: "", hide: [], hiddenBriefs: [], projects: [], updated_at: 0 });
const KEY = (gid: string, uid: string) => `pf:${gid}:${uid}`;
const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const httpUrl = (v: unknown) => { const u = s(v, 400); try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };

export async function getPortfolio(env: Env, gid: string, uid: string): Promise<Portfolio> {
  const r = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", KEY(gid, uid)).catch(() => null);
  if (!r) return EMPTY();
  try { return { ...EMPTY(), ...JSON.parse(r.v) }; } catch { return EMPTY(); }
}
async function putPortfolio(env: Env, gid: string, uid: string, p: Portfolio) {
  p.updated_at = now();
  await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", KEY(gid, uid), JSON.stringify(p), p.updated_at);
}

/** Their « about me »: from the Discord form (empty fields clear them). */
export async function saveAbout(env: Env, gid: string, uid: string, b: Partial<Record<"headline" | "bio" | "city" | "email" | "linkedin" | "website" | "cv", string>>) {
  const p = await getPortfolio(env, gid, uid);
  if ("headline" in b) p.headline = s(b.headline, 90);
  if ("bio" in b) p.bio = s(b.bio, 800);
  if ("city" in b) p.city = s(b.city, 60);
  if ("email" in b) { const e = s(b.email, 120); if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new PortfolioError("email"); p.email = e; }
  for (const k of ["linkedin", "website", "cv"] as const) if (k in b) {
    const raw = s(b[k], 400);
    const u = raw && !/^https?:\/\//i.test(raw) ? httpUrl("https://" + raw) : httpUrl(raw);
    if (raw && !u) throw new PortfolioError(k);
    p[k] = u;
  }
  await putPortfolio(env, gid, uid, p);
  return p;
}
export async function setOpen(env: Env, gid: string, uid: string, v: string) {
  const p = await getPortfolio(env, gid, uid);
  p.open = (OPEN as readonly string[]).includes(v) ? (v as Portfolio["open"]) : "";
  await putPortfolio(env, gid, uid, p);
  return p;
}
export async function setShown(env: Env, gid: string, uid: string, section: string, on: boolean) {
  if (!(SECTIONS as readonly string[]).includes(section)) throw new PortfolioError("section");
  const p = await getPortfolio(env, gid, uid);
  p.hide = p.hide.filter((x) => x !== section);
  if (!on) p.hide.push(section as Section);
  await putPortfolio(env, gid, uid, p);
  return p;
}

// ------------------------------------------------------------------ GitHub
/** owner/name from a GitHub link (or « owner/name »), else null. */
export function repoOf(v: string): string | null {
  const t = s(v, 300).replace(/\.git$/, "").replace(/\/+$/, "");
  const m = t.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:[/?#].*)?$/i) || t.match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}
async function ghFetch(path: string, token: string | null) {
  const res = await fetch("https://api.github.com" + path, { headers: { Accept: "application/vnd.github+json", "User-Agent": "classbot", "X-GitHub-Api-Version": "2022-11-28", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (res.status === 404) return null;
  if (!res.ok) throw new PortfolioError("github");
  return res.json() as Promise<any>;
}
/** The student's GitHub App token when they linked GitHub (more requests per hour), else none (public data). */
async function tokenFor(env: Env, gid: string, uid: string): Promise<string | null> {
  const pl = await one<{ gh_inst: string | null }>(env, "SELECT gh_inst FROM players WHERE guild_id = ? AND discord_id = ?", gid, uid).catch(() => null);
  if (!pl?.gh_inst) return null;
  try { const app = await ghAppOf(env, gid); return app.appId && app.privateKey ? await installationToken(env, app, pl.gh_inst) : null; } catch { return null; }
}
/** Their public repos, newest first (for the Discord autocomplete): cached 10 minutes. */
export async function myRepos(env: Env, gid: string, uid: string): Promise<{ full: string; desc: string; lang: string | null }[]> {
  const pl = await one<{ github_login: string | null }>(env, "SELECT github_login FROM players WHERE guild_id = ? AND discord_id = ?", gid, uid).catch(() => null);
  if (!pl?.github_login) return [];
  const ck = `ghrepos:${pl.github_login.toLowerCase()}`;
  const c = await one<{ v: string; updated_at: number }>(env, "SELECT v, updated_at FROM app_settings WHERE k = ?", ck).catch(() => null);
  if (c && c.updated_at > now() - 600) { try { return JSON.parse(c.v); } catch { /* refresh */ } }
  const list = await ghFetch(`/users/${encodeURIComponent(pl.github_login)}/repos?sort=pushed&per_page=60&type=owner`, await tokenFor(env, gid, uid)).catch(() => null);
  const out = (Array.isArray(list) ? list : []).filter((r: any) => !r.private && !r.fork).map((r: any) => ({ full: String(r.full_name), desc: s(r.description, 90), lang: r.language ?? null }));
  await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", ck, JSON.stringify(out), now()).catch(() => null);
  return out;
}
const prettyName = (n: string) => n.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());

/** Adds a project: a GitHub repo (its description, languages, stars, live demo read from GitHub) or any link. */
export async function addProject(env: Env, gid: string, uid: string, b: { url: string; title?: string; desc?: string; demo?: string; featured?: boolean }) {
  const p = await getPortfolio(env, gid, uid);
  if (p.projects.length >= 24) throw new PortfolioError("full");
  const repo = repoOf(b.url);
  let proj: PfProject;
  if (repo) {
    if (p.projects.some((x) => x.repo?.toLowerCase() === repo.toLowerCase())) throw new PortfolioError("dup");
    const tok = await tokenFor(env, gid, uid);
    const r = await ghFetch(`/repos/${repo}`, tok);
    if (!r || r.private) throw new PortfolioError("repo");
    const langs = await ghFetch(`/repos/${repo}/languages`, tok).catch(() => null);
    const tags = [...Object.keys(langs || {}).slice(0, 5), ...((r.topics as string[]) || []).slice(0, 4)];
    proj = { id: Math.random().toString(36).slice(2, 8), url: String(r.html_url || `https://github.com/${repo}`), repo: String(r.full_name || repo),
      title: s(b.title, 80) || prettyName(String(r.name || repo.split("/")[1])), desc: s(b.desc, 400) || s(r.description, 400),
      tags: [...new Set(tags.map((x) => s(x, 30)).filter(Boolean))].slice(0, 8), lang: r.language ?? null, stars: Number(r.stargazers_count) || 0, forks: Number(r.forks_count) || 0,
      demo: httpUrl(b.demo) || httpUrl(r.homepage) || null, pushed: r.pushed_at ? String(r.pushed_at).slice(0, 10) : null, featured: !!b.featured, added_at: now() };
  } else {
    const url = httpUrl(/^https?:\/\//i.test(b.url) ? b.url : "https://" + b.url);
    if (!url) throw new PortfolioError("url");
    if (p.projects.some((x) => x.url === url)) throw new PortfolioError("dup");
    proj = { id: Math.random().toString(36).slice(2, 8), url, repo: null, title: s(b.title, 80) || new URL(url).hostname.replace(/^www\./, ""), desc: s(b.desc, 400),
      tags: [], lang: null, stars: 0, forks: 0, demo: httpUrl(b.demo) || null, pushed: null, featured: !!b.featured, added_at: now() };
  }
  if (proj.featured) for (const x of p.projects) x.featured = false;
  p.projects.unshift(proj);
  await putPortfolio(env, gid, uid, p);
  return proj;
}
export async function removeProject(env: Env, gid: string, uid: string, id: string) {
  const p = await getPortfolio(env, gid, uid);
  const x = p.projects.find((q) => q.id === id || q.title.toLowerCase() === id.toLowerCase());
  if (!x) throw new PortfolioError("unknown");
  p.projects = p.projects.filter((q) => q !== x);
  await putPortfolio(env, gid, uid, p);
  return x;
}
export async function featureProject(env: Env, gid: string, uid: string, id: string) {
  const p = await getPortfolio(env, gid, uid);
  const x = p.projects.find((q) => q.id === id || q.title.toLowerCase() === id.toLowerCase());
  if (!x) throw new PortfolioError("unknown");
  for (const q of p.projects) q.featured = q === x;
  p.projects = [x, ...p.projects.filter((q) => q !== x)];
  await putPortfolio(env, gid, uid, p);
  return x;
}
/** A training project hidden from (or shown again on) the portfolio. */
export async function toggleBrief(env: Env, gid: string, uid: string, briefId: number, show: boolean) {
  const p = await getPortfolio(env, gid, uid);
  p.hiddenBriefs = p.hiddenBriefs.filter((x) => x !== briefId);
  if (!show) p.hiddenBriefs.push(briefId);
  await putPortfolio(env, gid, uid, p);
}

// ------------------------------------------------------------------ what ClassBot can vouch for
/** Their training projects: the briefs whose debrief is finalized (alone or in their squad), with the repo. */
export async function trainingProjects(env: Env, gid: string, uid: string) {
  const rows = await all<{ brief_id: number; who: string; record: string | null; final_at: number | null; updated_at: number | null }>(env,
    "SELECT brief_id, who, record, final_at, updated_at FROM brief_reviews WHERE guild_id = ? AND status = 'final' AND (who = ? OR who LIKE 's:%')", gid, `u:${uid}`).catch(() => []);
  const out: { id: number; title: string; summary: string; tags: string[]; repo: string | null; squad: string | null; comps: string[]; at: number }[] = [];
  for (const r of rows) {
    let rec: any = {};
    try { rec = JSON.parse(r.record || "{}"); } catch { rec = {}; }
    const squad = r.who.startsWith("s:") ? rec.squad : null;
    if (squad && !(squad.members || []).some((m: any) => String(m.gid ?? m) === uid)) continue;
    const b = await one<{ title: string; data: string | null }>(env, "SELECT title, data FROM briefs WHERE id = ? AND guild_id = ?", r.brief_id, gid).catch(() => null);
    if (!b) continue;
    let d: any = {};
    try { d = JSON.parse(b.data || "{}"); } catch { d = {}; }
    const repo = (Array.isArray(rec.repos) ? rec.repos : []).map(String).find((x: string) => /^[\w.-]+\/[\w.-]+$/.test(x)) || null;
    const comps = Object.entries((squad ? rec.members?.[uid]?.co : null) || (rec.result ? statesOf(rec)?.co : null) || {}).filter(([, v]) => v === true).map(([k]) => compLabel(assessBase(k)));
    out.push({ id: r.brief_id, title: s(d.title || b.title, 120), summary: s(d.summary, 300), tags: (Array.isArray(d.tags) ? d.tags : []).map((x: unknown) => s(x, 30)).filter(Boolean).slice(0, 6),
      repo, squad: squad ? s(squad.name, 40) : null, comps: [...new Set(comps)].slice(0, 6), at: r.final_at || r.updated_at || 0 });
  }
  return out.sort((a, b) => b.at - a.at);
}
/** The competencies validated: the last result of each one is a yes. */
async function validatedComps(env: Env, gid: string, uid: string) {
  const rows = await all<{ code: string; level: number | null; ok: number; at: number }>(env,
    "SELECT code, level, ok, at FROM competency_results WHERE guild_id = ? AND discord_id = ? ORDER BY at", gid, uid).catch(() => []);
  const last = new Map<string, { ok: boolean; level: number }>();
  for (const r of rows) { const k = assessBase(r.code); const prev = last.get(k); last.set(k, { ok: !!r.ok, level: r.ok ? Math.max(Number(r.level) || 1, prev?.ok ? prev.level : 0) : Number(r.level) || 1 }); }
  return [...last.entries()].filter(([, v]) => v.ok).map(([k, v]) => ({ code: compLabel(k), name: (REF_NAMES as Record<string, string>)[k] || "", level: v.level }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}
/** GitHub commits and VS Code time, day by day over the last 26 weeks, the coding hours and the languages. */
async function activity(env: Env, gid: string, uid: string) {
  const since = now() - 182 * 86400;
  const commits = await all<{ t: number; repo: string | null }>(env, "SELECT t, repo FROM gh_log WHERE guild_id = ? AND discord_id = ? AND kind = 'commit' AND t >= ?", gid, uid, since).catch(() => []);
  const vsc = await all<{ day: string; active_s: number; agg: string | null }>(env, "SELECT day, active_s, agg FROM vsc_days WHERE guild_id = ? AND discord_id = ? AND day >= ?", gid, uid, dayOf(since)).catch(() => []);
  const total = await one<{ s: number | null; d: number | null }>(env, "SELECT SUM(active_s) AS s, COUNT(*) AS d FROM vsc_days WHERE guild_id = ? AND discord_id = ? AND active_s > 0", gid, uid).catch(() => null);
  const allCommits = await one<{ n: number | null; r: number | null }>(env, "SELECT COUNT(*) AS n, COUNT(DISTINCT repo) AS r FROM gh_log WHERE guild_id = ? AND discord_id = ? AND kind = 'commit'", gid, uid).catch(() => null);
  const days: Record<string, { c: number; m: number }> = {};
  for (const c of commits) { const d = dayOf(c.t); (days[d] ||= { c: 0, m: 0 }).c++; }
  const langs = new Map<string, number>();
  for (const v of vsc) {
    (days[v.day] ||= { c: 0, m: 0 }).m += Math.round((v.active_s || 0) / 60);
    for (const [l, a] of parseAgg(v.agg).langs) if (l) langs.set(l, (langs.get(l) || 0) + a);
  }
  const today = dayOf(now()), weeks: number[] = [];
  for (let w = 11; w >= 0; w--) { let m = 0; for (let i = 0; i < 7; i++) m += days[addDays(today, -(w * 7 + i))]?.m || 0; weeks.push(Math.round(m / 6) / 10); }
  // the streak: consecutive days with a commit or some coding, up to today (or yesterday)
  let streak = 0;
  for (let i = days[today] ? 0 : 1; i < 182; i++) { const d = days[addDays(today, -i)]; if (d && (d.c || d.m >= 10)) streak++; else break; }
  const langTotal = [...langs.values()].reduce((a, b) => a + b, 0) || 1;
  return {
    days, today, weeks, streak,
    hours: Math.round((total?.s || 0) / 360) / 10, codingDays: total?.d || 0,
    last30: Math.round(vsc.filter((v) => v.day >= addDays(today, -29)).reduce((a, v) => a + (v.active_s || 0), 0) / 360) / 10,
    commits: allCommits?.n || 0, repos: allCommits?.r || 0, commits182: commits.length,
    activeDays: Object.values(days).filter((d) => d.c || d.m >= 10).length,
    langs: [...langs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l, a]) => ({ name: l, pct: Math.round((100 * a) / langTotal) })).filter((x) => x.pct > 0),
  };
}

/** Everything the page shows. */
export async function portfolioData(env: Env, g: GuildRow, uid: string) {
  const base = await profileData(env, g, uid);
  if (!base) return null;
  const pf = await getPortfolio(env, g.id, uid);
  const pl = await one<{ github_login: string | null }>(env, "SELECT github_login FROM players WHERE guild_id = ? AND discord_id = ?", g.id, uid).catch(() => null);
  const training = (await trainingProjects(env, g.id, uid)).filter((x) => !pf.hiddenBriefs.includes(x.id));
  return { ...base, pf, github: pl?.github_login || null, training, comps: await validatedComps(env, g.id, uid), act: await activity(env, g.id, uid) };
}

export const _test = { repoOf, prettyName };
