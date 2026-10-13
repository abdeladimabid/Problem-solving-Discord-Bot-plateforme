// The GitHub tab of a student page: every commit and pull request (from the webhook, and from GitHub on demand
// for older work), what the bot noticed (tiny, vague, huge, node_modules), the repos and the briefs they belong to,
// and an AI summary of the features the student built.
import type { Env, GuildRow, PlayerRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { ghAppOf, githubCanRead, githubCfg } from "./github.ts";
import { commitSizes, githubGet, installationToken } from "./review/gh.ts";
import { classifyCommit } from "./review/engine.ts";
import { askReview } from "./review/debrief.ts";

const firstLines = (m: unknown) => String(m ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 3).join(" · ").slice(0, 300);
const toT = (iso: unknown) => { const x = Date.parse(String(iso ?? "")); return Number.isFinite(x) ? Math.floor(x / 1000) : now(); };

/** Webhook: the commits of a push, one row each (classified like the reports do). */
export async function logPush(env: Env, g: GuildRow, discordId: string, p: any, commits: any[], analysis: Record<string, any> | null) {
  const repo = p?.repository?.full_name ? String(p.repository.full_name).slice(0, 120) : null;
  const branch = String(p?.ref || "").replace(/^refs\/heads\//, "").slice(0, 80) || null;
  for (const c of commits.slice(-60)) {
    if (!/^[0-9a-f]{40}$/.test(String(c?.id))) continue;
    const a = analysis?.[c.id] ?? classifyCommit(c, null, {});
    const files = (c.added?.length || 0) + (c.modified?.length || 0) + (c.removed?.length || 0);
    await run(env, `INSERT OR IGNORE INTO gh_log (guild_id, id, discord_id, kind, repo, branch, t, title, size, bad, flags, adds, dels, files, url)
      VALUES (?, ?, ?, 'commit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, g.id, c.id, discordId, repo, branch, toT(c.timestamp), firstLines(c.message),
      a.kind, a.bad ? 1 : 0, (a.flags || []).join(",") || null, a.add ?? null, a.del ?? null, files || null, String(c.url || "").slice(0, 300) || null);
  }
}
/** Webhook: a pull request opened, merged or closed. */
export async function logPr(env: Env, g: GuildRow, discordId: string, p: any) {
  const pr = p?.pull_request;
  if (!pr || !p?.repository?.full_name) return;
  const action = pr.merged && p.action === "closed" ? "merged" : String(p.action || "");
  if (!["opened", "closed", "merged", "reopened", "ready_for_review"].includes(action)) return;
  await run(env, `INSERT OR IGNORE INTO gh_log (guild_id, id, discord_id, kind, repo, branch, t, title, adds, dels, files, action, url)
    VALUES (?, ?, ?, 'pr', ?, ?, ?, ?, ?, ?, ?, ?, ?)`, g.id, `pr:${p.repository.full_name}#${pr.number}:${action}`, discordId, String(p.repository.full_name).slice(0, 120),
    String(pr.head?.ref || "").slice(0, 80) || null, toT(pr.merged_at || pr.closed_at || pr.updated_at || pr.created_at), String(pr.title || "").slice(0, 300),
    pr.additions ?? null, pr.deletions ?? null, pr.changed_files ?? null, action, String(pr.html_url || "").slice(0, 300) || null);
}

export class GhDetailError extends Error {}

/**
 * Older work, read from GitHub with the class's App: the student's commits (authored by them) on the default branch of
 * the repos they pushed to in the period, with their size. Safe to run again (rows already there are kept).
 */
export async function syncStudentGithub(env: Env, g: GuildRow, did: string, days = 30) {
  const pl = await one<PlayerRow>(env, "SELECT * FROM players WHERE guild_id = ? AND discord_id = ?", g.id, did);
  if (!pl?.github_login || !pl.gh_inst) throw new GhDetailError("This student hasn't linked GitHub yet (/github in Discord).");
  const app = await ghAppOf(env, g.id);
  if (!githubCanRead(app)) throw new GhDetailError("Set up the class's GitHub App first (Settings → GitHub & Watcher): its private key is needed to read the repos.");
  const cfg = githubCfg(g);
  let token: string;
  try { token = await installationToken(env, app, pl.gh_inst); } catch { throw new GhDetailError("GitHub refused the App's access to this student's account: they may have removed the App. They can run /github again."); }
  const since = now() - days * 86400;
  let list: any[] = [];
  try { list = (await githubGet(`/installation/repositories?per_page=100`, token))?.repositories ?? []; } catch { throw new GhDetailError("GitHub didn't answer. Try again in a minute."); }
  const repos = list.filter((r) => r.pushed_at && toT(r.pushed_at) >= since && !cfg.hidden.includes(String(r.full_name).toLowerCase()))
    .sort((a, b) => toT(b.pushed_at) - toT(a.pushed_at)).slice(0, 6);
  let added = 0;
  for (const r of repos) {
    let commits: any[] = [];
    try {
      commits = await githubGet(`/repos/${r.full_name}/commits?per_page=60&since=${new Date(since * 1000).toISOString()}&author=${encodeURIComponent(pl.github_login)}`, token);
    } catch { continue; }
    if (!Array.isArray(commits) || !commits.length) continue;
    let sizes: Record<string, any> = {};
    try { sizes = await commitSizes(env, app, pl.gh_inst, r.full_name, commits.map((c) => c.sha).filter((s: string) => /^[0-9a-f]{40}$/.test(s)).slice(0, 60)); } catch { /* sizes unknown */ }
    for (const c of commits) {
      if (!/^[0-9a-f]{40}$/.test(String(c.sha))) continue;
      const info = sizes[c.sha] ?? ((c.parents?.length ?? 1) > 1 ? { merge: true } : null);
      const a = classifyCommit({ message: c.commit?.message ?? "" }, info, { TINY_LINES: cfg.tiny, HUGE_LINES: cfg.huge });
      const res = await run(env, `INSERT OR IGNORE INTO gh_log (guild_id, id, discord_id, kind, repo, branch, t, title, size, bad, flags, adds, dels, url)
        VALUES (?, ?, ?, 'commit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, g.id, c.sha, did, String(r.full_name).slice(0, 120), String(r.default_branch || "").slice(0, 80) || null,
        toT(c.commit?.author?.date || c.commit?.committer?.date), firstLines(c.commit?.message), a.kind, a.bad ? 1 : 0, (a.flags || []).join(",") || null,
        a.add ?? null, a.del ?? null, String(c.html_url || "").slice(0, 300) || null);
      added += Number((res as any)?.meta?.changes ?? 0);
    }
  }
  return { added, repoCount: repos.length };
}

type LogRow = { id: string; kind: string; repo: string | null; branch: string | null; t: number; title: string | null; size: string | null; bad: number; flags: string | null; adds: number | null; dels: number | null; files: number | null; action: string | null; url: string | null };

/** Everything the GitHub tab shows, for the last `days` days. */
export async function studentGithub(env: Env, g: GuildRow, did: string, days = 30) {
  days = Math.max(7, Math.min(120, Math.round(days) || 30));
  const pl = await one<PlayerRow & { gh_linked_at: number | null }>(env, "SELECT * FROM players WHERE guild_id = ? AND discord_id = ?", g.id, did);
  const since = now() - days * 86400;
  const log = await all<LogRow>(env, "SELECT id, kind, repo, branch, t, title, size, bad, flags, adds, dels, files, action, url FROM gh_log WHERE guild_id = ? AND discord_id = ? AND t >= ? ORDER BY t DESC LIMIT 600", g.id, did, since);
  // the briefs of the period, and the repos handed in for them (by the student or their squad)
  const briefs = await all<{ id: number; title: string; start_at: number | null; due_at: number | null; created_at: number; kind: string; squads: string | null }>(env,
    "SELECT id, title, start_at, due_at, created_at, kind, squads FROM briefs WHERE guild_id = ? AND status != 'draft' AND COALESCE(due_at, created_at) >= ? ORDER BY COALESCE(start_at, created_at)", g.id, since - 14 * 86400);
  const mine = briefs.filter((b) => b.kind !== "squad" || (() => { try { return (JSON.parse(b.squads || "[]") as any[]).some((s) => (s.members || []).includes(did)); } catch { return false; } })());
  const whoKeys = new Map<number, string[]>();
  for (const b of mine) {
    const keys = [`u:${did}`];
    try { for (const s of JSON.parse(b.squads || "[]") as any[]) if ((s.members || []).includes(did)) keys.push(`s:${s.id}`); } catch { /* none */ }
    whoKeys.set(b.id, keys);
  }
  const handins = mine.length ? await all<{ brief_id: number; who: string; repo: string }>(env,
    `SELECT brief_id, who, repo FROM brief_handins WHERE brief_id IN (${mine.map(() => "?").join(",")})`, ...mine.map((b) => b.id)) : [];
  const repoBrief = new Map<string, { id: number; title: string }>();
  for (const h of handins) if (whoKeys.get(h.brief_id)?.includes(h.who)) repoBrief.set(String(h.repo).toLowerCase(), { id: h.brief_id, title: mine.find((b) => b.id === h.brief_id)!.title });
  // a repo not handed in belongs to the brief running when most of its commits were made
  const briefAt = (t: number) => mine.find((b) => (b.start_at ?? b.created_at) <= t && t <= (b.due_at ?? b.created_at + 14 * 86400) + 2 * 86400) ?? null;

  const commits = log.filter((r) => r.kind === "commit" && r.size !== "merge");
  const flagged = (r: LogRow) => !!r.flags;
  const repos = new Map<string, any>();
  for (const r of log) {
    if (!r.repo) continue;
    const x = repos.get(r.repo) ?? repos.set(r.repo, { repo: r.repo, commits: 0, real: 0, tiny: 0, docs: 0, bad: 0, flagged: 0, prs: 0, adds: 0, dels: 0, first: r.t, last: r.t, during: new Map<number, number>() }).get(r.repo);
    x.first = Math.min(x.first, r.t); x.last = Math.max(x.last, r.t);
    if (r.kind === "pr") { x.prs++; continue; }
    if (r.size === "merge") continue;
    x.commits++;
    if (flagged(r)) x.flagged++; else if (r.size === "real") x.real++; else if (r.size === "docs") x.docs++; else x.tiny++;
    if (r.bad) x.bad++;
    x.adds += r.adds || 0; x.dels += r.dels || 0;
    const b = briefAt(r.t);
    if (b) x.during.set(b.id, (x.during.get(b.id) || 0) + 1);
  }
  const repoList = [...repos.values()].map((x) => {
    let brief = repoBrief.get(x.repo.toLowerCase()) ?? null, how = brief ? "handed in" : null;
    if (!brief && x.during.size) { const [id] = [...x.during.entries()].sort((a, b) => b[1] - a[1])[0]; const b = mine.find((y) => y.id === id)!; brief = { id: b.id, title: b.title }; how = "during"; }
    const { during, ...rest } = x;
    return { ...rest, brief, how };
  }).sort((a, b) => b.last - a.last);
  const totals = {
    commits: commits.length, real: commits.filter((r) => r.size === "real" && !flagged(r)).length, tiny: commits.filter((r) => (r.size === "tiny") && !flagged(r)).length,
    docs: commits.filter((r) => r.size === "docs" && !flagged(r)).length, bad: commits.filter((r) => r.bad).length, flagged: commits.filter(flagged).length,
    merges: log.filter((r) => r.size === "merge").length, prs: log.filter((r) => r.kind === "pr").length,
    adds: commits.reduce((s, r) => s + (r.adds || 0), 0), dels: commits.reduce((s, r) => s + (r.dels || 0), 0),
    activeDays: new Set(log.map((r) => new Date(r.t * 1000).toISOString().slice(0, 10))).size, repos: repoList.length,
  };
  const sum = await one<{ data: string; at: number }>(env, "SELECT data, at FROM gh_summaries WHERE guild_id = ? AND discord_id = ?", g.id, did);
  const any = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM gh_log WHERE guild_id = ? AND discord_id = ?", g.id, did);
  let summary: any = null;
  try { summary = sum ? { ...JSON.parse(sum.data), at: sum.at } : null; } catch { summary = null; }
  return {
    login: pl?.github_login ?? null, linkedAt: pl?.gh_linked_at ?? null, days, since, log, repos: repoList, totals,
    briefs: mine.map((b) => ({ id: b.id, title: b.title, start: b.start_at ?? b.created_at, due: b.due_at })), summary, everSynced: (any?.n ?? 0) > 0,
    thresholds: { tiny: githubCfg(g).tiny, huge: githubCfg(g).huge },
  };
}

const SUMMARY_SYSTEM = `You help a web development teacher see what a student really built, from their git history.
You get the student's commits (repo, date, message, lines added/removed, and flags: TINY = 1-2 lines, VAGUE = a message that says nothing, HUGE = thousands of lines at once, NODE_MODULES = dependencies committed) and the requirements of the briefs (projects) of the period.
Answer in JSON only:
{"overview": "2-3 sentences: what they worked on and how (regular or last-minute, size of steps)",
 "repos": [{"repo": "owner/name", "features": [{"title": "a feature they implemented, in plain words (e.g. 'Responsive navigation bar with a burger menu')", "commits": ["first 7 characters of the commits"], "status": "done" | "in progress"}]}],
 "brief": [{"brief": "brief title", "requirement": "a requirement of the brief", "status": "done" | "partial" | "no sign", "evidence": "short: which commits show it"}],
 "habits": {"good": ["..."], "improve": ["concrete advice about their commits, e.g. 'write what changed: “add contact form validation” instead of “update”'"]}}
Judge only from the commits: a message can lie, say "seems" when unsure. Group small commits into one feature. Keep each text short. Write in English.`;

/** AI: the features the student implemented, per repo, and how they match the briefs' requirements. */
export async function summarizeStudentGithub(env: Env, g: GuildRow, did: string, days = 30) {
  const d = await studentGithub(env, g, did, days);
  const commits = d.log.filter((r) => r.kind === "commit" && r.size !== "merge").slice(0, 160);
  if (!commits.length) throw new GhDetailError("No commit to read yet: load the history from GitHub first.");
  const flags = (r: LogRow) => [r.size === "tiny" ? "TINY" : "", r.bad ? "VAGUE" : "", ...(r.flags ? r.flags.toUpperCase().split(",") : [])].filter(Boolean).join(" ");
  const reqs: string[] = [];
  for (const b of d.briefs.slice(-3)) {
    const row = await one<{ data: string }>(env, "SELECT data FROM briefs WHERE id = ?", b.id);
    let data: any = {};
    try { data = JSON.parse(row?.data || "{}"); } catch { data = {}; }
    const stories = (data.groups || []).flatMap((x: any) => x.stories || []).slice(0, 25);
    if (stories.length) reqs.push(`Brief "${b.title}":\n${stories.map((s: string) => `- ${String(s).slice(0, 200)}`).join("\n")}`);
  }
  const user = (compact: boolean) => [
    `Commits (newest first):`,
    ...commits.slice(0, compact ? 100 : 160).map((r) => `${r.id.slice(0, 7)} | ${r.repo} | ${new Date(r.t * 1000).toISOString().slice(0, 10)} | +${r.adds ?? "?"}/-${r.dels ?? "?"} | ${flags(r)} | ${String(r.title || "").slice(0, compact ? 120 : 200)}`),
    "", reqs.length ? reqs.join("\n\n") : "No brief requirements for this period.",
  ].join("\n").slice(0, compact ? 14000 : 24000);
  const r = await askReview(env, SUMMARY_SYSTEM, user, 2);
  if (!r.ok) throw new GhDetailError(r.msg);
  const x = r.data || {};
  const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  const data = {
    overview: str(x.overview, 600),
    repos: (Array.isArray(x.repos) ? x.repos : []).slice(0, 8).map((p: any) => ({ repo: str(p.repo, 120),
      features: (Array.isArray(p.features) ? p.features : []).slice(0, 15).map((f: any) => ({ title: str(f.title, 160), commits: (Array.isArray(f.commits) ? f.commits : []).map((c: unknown) => str(c, 12)).slice(0, 12), status: f.status === "in progress" ? "in progress" : "done" })).filter((f: any) => f.title) })).filter((p: any) => p.repo),
    brief: (Array.isArray(x.brief) ? x.brief : []).slice(0, 30).map((q: any) => ({ brief: str(q.brief, 120), requirement: str(q.requirement, 220), status: ["done", "partial"].includes(q.status) ? q.status : "no sign", evidence: str(q.evidence, 200) })).filter((q: any) => q.requirement),
    habits: { good: (x.habits?.good || []).slice(0, 4).map((v: unknown) => str(v, 200)), improve: (x.habits?.improve || []).slice(0, 4).map((v: unknown) => str(v, 220)) },
    days, model: r.model,
  };
  await run(env, `INSERT INTO gh_summaries (guild_id, discord_id, data, at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, discord_id) DO UPDATE SET data = excluded.data, at = excluded.at`,
    g.id, did, JSON.stringify(data), now());
  return { ...data, at: now() };
}
