// 🔍 Plan d'action: the GitHub repo a student handed in for their mini brief, read objective by objective.
// The AI reads the repo (its files, its pages' outline, the main files) and says, for each objective of the brief,
// done / partly done / not there, with what in the code shows it. The teacher sees how far each student is in their
// project, even when the student ticks nothing. Kept on the step (step.scan): no new table.
import type { Env, GuildRow } from "./types.ts";
import { aiBudgetOk, aiBudgetUse, all, now } from "./db.ts";
import { chatJson } from "./ai.ts";
import { ghAppOf, githubCanRead, parseRepo } from "./github.ts";
import { githubGet, installationToken, repoSnapshot } from "./review/gh.ts";
import { WorkPlanError, getPlan, listPlans, putPlan, type RepoScan, type Step, type WorkPlan } from "./workplan.ts";

/** A scan younger than this is kept by « Scan all » (unless the link changed): the AI isn't asked again for nothing. */
export const SCAN_FRESH = 6 * 3600;
/** Repos read by one « Scan all » call: the page calls again for the next ones. */
const PER_CALL = 4;

/** The repo of a link: github.com/owner/repo/…, or owner.github.io/repo (the page of the repo). */
export function repoOfLink(link: string): string | null {
  const u = String(link || "").trim();
  const pages = u.match(/^https?:\/\/([\w-]+)\.github\.io\/([\w.-]+)/i);
  if (pages) return `${pages[1]}/${pages[2]}`;
  const userSite = u.match(/^https?:\/\/(([\w-]+)\.github\.io)\/?$/i);
  if (userSite) return `${userSite[2]}/${userSite[1]}`;
  if (!/^https?:\/\/(www\.)?github\.com\//i.test(u)) return null;
  const r = parseRepo(u);
  return r && !/^(orgs|users|settings|features|topics|marketplace)\//i.test(r) ? r : null;
}

/** The scan cleaned from the AI's answer: one state per objective, in order, the missing ones « missing ». */
export function cleanScan(r: any, n: number): { tasks: RepoScan["tasks"]; summary: string } {
  const list: any[] = Array.isArray(r?.objectifs) ? r.objectifs : Array.isArray(r?.objectives) ? r.objectives : [];
  const tasks: RepoScan["tasks"] = [];
  for (let k = 0; k < n; k++) {
    const x = list.find((o) => Number(o?.n) === k + 1) ?? list[k];
    const e = String(x?.etat ?? x?.state ?? "").toLowerCase();
    const state = e.startsWith("fait") || e === "done" ? "done" : e.startsWith("partiel") || e === "partial" ? "partial" : "missing";
    tasks.push({ state, why: String(x?.preuve ?? x?.why ?? "").replace(/\s+/g, " ").trim().slice(0, 240) });
  }
  return { tasks, summary: String(r?.resume ?? r?.summary ?? "").replace(/\s+/g, " ").trim().slice(0, 500) };
}

/** How far the code is: done objectives, the partial ones count half. */
export const scanPct = (s: RepoScan | null | undefined) =>
  s && s.tasks.length ? Math.round((100 * s.tasks.reduce((a, t) => a + (t.state === "done" ? 1 : t.state === "partial" ? 0.5 : 0), 0)) / s.tasks.length) : null;

/** A token that can read the repo: the student's own GitHub (connected with /github), else a classmate's (a public repo). */
async function tokenFor(env: Env, g: GuildRow, sid: string, repo: string): Promise<{ token: string; info: any } | null> {
  const app = await ghAppOf(env, g.id);
  if (!githubCanRead(app)) throw new WorkPlanError("Set up the class's GitHub App first (Settings → GitHub & Watcher): it's what reads the repos.");
  const rows = await all<{ discord_id: string; gh_inst: string }>(env,
    "SELECT discord_id, gh_inst FROM players WHERE guild_id = ? AND gh_inst IS NOT NULL ORDER BY CASE WHEN discord_id = ? THEN 0 ELSE 1 END, last_active DESC LIMIT 6", g.id, sid).catch(() => []);
  for (const r of rows) {
    try {
      const token = await installationToken(env, app, r.gh_inst);
      const info = await githubGet(`/repos/${repo}`, token);
      if (info?.full_name) return { token, info };
    } catch { /* the next one */ }
  }
  return null;
}

/** Reads one mini brief's repo and keeps what was found on the step. Never throws for the repo itself: the error is kept. */
async function scanOne(env: Env, g: GuildRow, p: WorkPlan, s: Step): Promise<RepoScan> {
  const link = s.work?.link || "";
  const tasks = s.brief?.tasks || [];
  const base = { at: now(), link, repo: "", pushed_at: null, tasks: [], summary: "" } as RepoScan;
  const repo = repoOfLink(link);
  if (!repo) return { ...base, error: "The link handed in isn't a GitHub repo (github.com/owner/repo)." };
  base.repo = repo;
  const got = await tokenFor(env, g, p.sid, repo);
  if (!got) return { ...base, error: `ClassBot can't read ${repo}: it's private and ${p.name} hasn't connected GitHub (/github), or the repo doesn't exist.` };
  base.repo = String(got.info.full_name);
  base.pushed_at = got.info.pushed_at ? String(got.info.pushed_at) : null;
  const brief = [s.brief?.context || "", ...tasks].join("\n");
  let snap: any;
  try { snap = await repoSnapshot(got.token, base.repo, 14000, [], brief); }
  catch (e) { return { ...base, error: `The repo couldn't be read (${String((e as Error).message || e).slice(0, 120)}).` }; }
  if (!snap.paths?.length) return { ...base, tasks: tasks.map(() => ({ state: "missing" as const, why: "" })), summary: "The repo is empty." };
  if (!(await aiBudgetOk(env, 1))) return { ...base, error: "The AI is used up for today (see Settings → AI): try again tomorrow." };
  await aiBudgetUse(env, 1);
  const r = await chatJson(env, [
    { role: "system", content: [
      "Tu es formateur en développement web. Tu lis le dépôt GitHub d'un apprenant et tu dis, pour CHAQUE objectif de son mini-projet, s'il est fait dans le code.",
      "Réponds UNIQUEMENT en JSON : {\"objectifs\":[{\"n\":1,\"etat\":\"fait|partiel|absent\",\"preuve\":\"…\"}],\"resume\":\"…\"}.",
      "- \"fait\" : le code le réalise vraiment (pas seulement un titre ou un commentaire). \"partiel\" : commencé ou incomplet. \"absent\" : rien dans le code.",
      "- \"preuve\" : une phrase courte, le fichier et ce qui le montre (ou ce qui manque). Rien d'inventé : seulement ce que tu vois.",
      "- Tu ne vois que le début des gros fichiers : la liste des fichiers et le plan des pages montrent le reste. Dans le doute entre fait et partiel, choisis partiel.",
      "- \"resume\" : 1 à 2 phrases pour le formateur : où en est l'apprenant dans le projet.",
    ].join("\n") },
    { role: "user", content: [
      `OBJECTIFS DU MINI-PROJET :\n${tasks.map((t, k) => `${k + 1}. ${t}`).join("\n")}`,
      s.brief?.deliverable ? `LIVRABLE : ${s.brief.deliverable}` : "",
      `FICHIERS DU DÉPÔT ${base.repo} :\n${snap.files}`,
      snap.outline ? `PLAN DES PAGES :\n${snap.outline}` : "",
      `CODE (début des fichiers principaux) :${snap.contents}`,
    ].filter(Boolean).join("\n\n") },
  ], { maxTokens: 1800, temperature: 0.1, timeoutMs: 40000 }).catch(() => null);
  if (!r) return { ...base, error: "The AI couldn't read the repo right now (see Settings → AI): try again." };
  return { ...base, ...cleanScan(r, tasks.length) };
}

/** 🔍 One mini brief's repo, read now (the teacher's button on the plan). */
export async function scanStep(env: Env, g: GuildRow, id: number, stepId: string): Promise<WorkPlan> {
  const p = await getPlan(env, g.id, id);
  if (!p) throw new WorkPlanError("This plan doesn't exist anymore.");
  const s = p.steps.find((x) => x.id === stepId);
  if (!s || s.kind !== "brief" || !s.brief) throw new WorkPlanError("Choose a mini brief.");
  if (!s.work?.link) throw new WorkPlanError(`${p.name} hasn't handed in the link of their repo yet.`);
  s.scan = await scanOne(env, g, p, s);
  await putPlan(env, p);
  return p;
}

/** Does this mini brief need a (new) scan? Never read: read for another link: older than SCAN_FRESH (or `force`). */
export const needsScan = (s: Step, force = false, t0 = now()) =>
  s.kind === "brief" && !!s.brief?.tasks.length && !!s.work?.link && (!s.scan || s.scan.link !== s.work.link || force || t0 - s.scan.at >= SCAN_FRESH);

/** 🔍 Every handed-in repo of the class, a few per call (the page calls again while some are left). `since`: the
 *  call's start, so a repo read by an earlier call of the same round isn't read again when `force` is on. */
export async function scanAll(env: Env, g: GuildRow, o: { force?: boolean; since?: number } = {}) {
  const t0 = now(), since = Number(o.since) || t0;
  const plans = (await listPlans(env, g.id)).filter((p) => p.status !== "draft");
  const todo: { p: WorkPlan; s: Step }[] = [];
  for (const p of plans) for (const s of p.steps) if (needsScan(s, !!o.force && (!s.scan || s.scan.at < since), t0)) todo.push({ p, s });
  const batch = todo.slice(0, PER_CALL), scanned: { sid: string; name: string; pct: number | null; error: string | null }[] = [];
  // a few repos at the same time; each plan saved once
  await Promise.all(batch.map(async ({ p, s }) => {
    s.scan = await scanOne(env, g, p, s).catch((e) => ({ at: now(), link: s.work!.link!, repo: "", pushed_at: null, tasks: [], summary: "", error: String((e as Error).message || e).slice(0, 200) }));
    scanned.push({ sid: p.sid, name: p.name, pct: scanPct(s.scan), error: s.scan.error || null });
  }));
  for (const p of new Set(batch.map((x) => x.p))) await putPlan(env, p);
  const handedIn = plans.reduce((a, p) => a + p.steps.filter((s) => s.kind === "brief" && s.work?.link).length, 0);
  return { scanned, left: todo.length - batch.length, handedIn, since };
}

export const _test = { repoOfLink, cleanScan, scanPct, needsScan };
