// 🐙 GitHub project autograder. The teacher creates a project (a file to write, its language,
// input/output tests, points, due date). Students link a PUBLIC GitHub repository with
// /project submit. The bot downloads the entry file from GitHub, runs it against the tests
// with the same judge as write-code challenges, DMs the result and awards points for the
// best score. It re-checks by itself every 15 minutes (only when the file changed), right
// away with /project check, or on every push if the student adds a GitHub webhook.
import type { Env, GuildRow } from "./types.ts";
import { addPoints, all, now, one, run } from "./db.ts";
import { t } from "./i18n.ts";
import { COLORS, dm, mention, send, truncate, ts } from "./discord.ts";
import { LANGS, RunnerUnavailable, isCodeLang, judge, normOut, sha256 } from "./runner.ts";
import type { CodeLang, Judgement, TestCase } from "./runner.ts";
import { arenaChannel } from "./arena.ts";

export interface ProjectRow {
  id: number; guild_id: string; title: string; description: string | null; lang: string; entry: string; tests: string;
  time_limit: number; points: number; due_at: number | null; status: "open" | "closed"; created_at: number;
}
export interface RepoRow {
  project_id: number; guild_id: string; discord_id: string; repo: string; branch: string; content_hash: string | null;
  passed: number; total: number; best: number; points: number; result: string | null; error: string | null; runs: number;
  due_check: number; checked_at: number | null; created_at: number;
}
export class ProjectError extends Error {}
export const RECHECK_SECONDS = 15 * 60, SAMPLE_TESTS = 2, MAX_FILE = 100_000;

// ------------------------------------------------------------- parsing
/** "https://github.com/ana/tp1", "ana/tp1", "github.com/ana/tp1/tree/dev" → { repo, branch } */
export function parseRepo(s: string): { repo: string; branch: string } | null {
  const m = s.trim().replace(/\.git$/, "").match(/^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})(?:\/tree\/([A-Za-z0-9._\/-]{1,100}))?\/?$/);
  if (!m || m[2] === "." || m[2] === "..") return null;
  return { repo: `${m[1]}/${m[2]}`, branch: m[3]?.replace(/\/$/, "") || "HEAD" };
}

/** Teacher's test format: blocks separated by a line "---", input and expected output separated by a line ">>>". */
export function parseTests(text: string): { input: string; output: string }[] {
  return text.replace(/\r/g, "").split(/^---[ \t]*$/m).map((b) => b.replace(/^\n+|\n+$/g, "")).filter(Boolean).map((b) => {
    const [input, output] = b.split(/^>>>[ \t]*$/m);
    if (output === undefined) throw new ProjectError("each test needs a line >>> between the input and the expected output");
    return { input: input.replace(/^\n+/, "").replace(/\n*$/, "\n"), output: output.replace(/^\n+|\n+$/g, "") };
  });
}
export const testsText = (tests: { input: string; output: string }[]) => tests.map((x) => `${x.input.replace(/\n$/, "")}\n>>>\n${x.output}`).join("\n---\n");

function testCases(p: ProjectRow): TestCase[] {
  const raw: { input: string; output: string }[] = JSON.parse(p.tests || "[]");
  return raw.map((x, i) => ({ idx: i, input: x.input, gen: null, expected: normOut(x.output), sample: i < SAMPLE_TESTS ? 1 : 0 }));
}

// --------------------------------------------------------------- teacher
export async function saveProject(env: Env, g: GuildRow, b: any): Promise<ProjectRow> {
  const title = String(b.title ?? "").trim().slice(0, 100);
  const lang = String(b.lang ?? "");
  const entry = String(b.entry ?? "").trim().replace(/^\/+/, "");
  if (!title) throw new ProjectError("give the project a title");
  if (!isCodeLang(lang)) throw new ProjectError("unknown language");
  if (!/^[A-Za-z0-9._\/ -]{1,200}$/.test(entry) || entry.includes("..")) throw new ProjectError("the entry file must be a path inside the repository, like main.py or src/app.js");
  const tests = Array.isArray(b.tests) ? b.tests : parseTests(String(b.testsText ?? ""));
  if (!tests.length) throw new ProjectError("add at least one test");
  if (tests.length > 40) throw new ProjectError("40 tests at most");
  const clean = tests.map((x: any) => ({ input: String(x.input ?? "").slice(0, 20000), output: String(x.output ?? "").slice(0, 20000) }));
  const points = Math.max(0, Math.min(1000, Math.round(Number(b.points ?? 50))));
  const limit = Math.max(0.5, Math.min(10, Number(b.time_limit ?? 2) || 2));
  const due = b.due_at ? Math.floor(Number(b.due_at)) : null;
  const desc = String(b.description ?? "").trim().slice(0, 3000) || null;
  if (b.id) {
    const p = await one<ProjectRow>(env, "SELECT * FROM projects WHERE id = ? AND guild_id = ?", Number(b.id), g.id);
    if (!p) throw new ProjectError("unknown project");
    await run(env, "UPDATE projects SET title = ?, description = ?, lang = ?, entry = ?, tests = ?, time_limit = ?, points = ?, due_at = ?, status = ? WHERE id = ?",
      title, desc, lang, entry, JSON.stringify(clean), limit, points, due, b.status === "closed" ? "closed" : "open", p.id);
    // tests or file changed: grade everyone again
    await run(env, "UPDATE project_repos SET content_hash = NULL, due_check = 1 WHERE project_id = ?", p.id);
    return (await one<ProjectRow>(env, "SELECT * FROM projects WHERE id = ?", p.id))!;
  }
  const r = await run(env, "INSERT INTO projects (guild_id, title, description, lang, entry, tests, time_limit, points, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    g.id, title, desc, lang, entry, JSON.stringify(clean), limit, points, due, now());
  const p = (await one<ProjectRow>(env, "SELECT * FROM projects WHERE id = ?", Number(r.meta.last_row_id)))!;
  if (b.announce) {
    const ch = await arenaChannel(env, g);
    if (ch) await send(env, ch, { embeds: [projectEmbed(g, p, true)] }).catch(() => {});
  }
  return p;
}

export function projectEmbed(g: GuildRow, p: ProjectRow, announce = false) {
  const L = g.lang;
  const tests: { input: string; output: string }[] = JSON.parse(p.tests || "[]");
  const ex = tests.slice(0, SAMPLE_TESTS).map((x, i) => `**${t(L, "ch.sample", { n: i + 1 })}**\n\`\`\`\n${truncate(x.input.replace(/\n$/, ""), 300)}\n\`\`\`→\n\`\`\`\n${truncate(x.output, 200)}\n\`\`\``).join("\n");
  return {
    title: `${announce ? "🐙 " + t(L, "proj.new") + " · " : "🐙 "}${p.title}`,
    description: truncate([p.description ?? "", "", t(L, "proj.rules", { file: p.entry, lang: LANGS[p.lang as CodeLang]?.label ?? p.lang, n: tests.length, pts: p.points }),
      p.due_at ? t(L, "proj.due", { when: ts(p.due_at, "F") }) : "", "", ex, "", t(L, "proj.how")].join("\n"), 4000),
    color: COLORS.purple,
  };
}

// ---------------------------------------------------------------- student
export async function openProjects(env: Env, g: GuildRow) {
  return all<ProjectRow>(env, "SELECT * FROM projects WHERE guild_id = ? AND status = 'open' ORDER BY COALESCE(due_at, 9999999999), id", g.id);
}
export async function findProject(env: Env, g: GuildRow, ref: string | number | null): Promise<ProjectRow | null> {
  const open = await openProjects(env, g);
  if (ref == null || ref === "") return open.length === 1 ? open[0] : null;
  const s = String(ref).trim().toLowerCase();
  return open.find((p) => String(p.id) === s || p.title.toLowerCase() === s) ?? open.find((p) => p.title.toLowerCase().includes(s)) ?? null;
}

export async function linkRepo(env: Env, g: GuildRow, uid: string, p: ProjectRow, url: string) {
  const r = parseRepo(url);
  if (!r) throw new ProjectError("proj.bad_repo");
  const taken = await one<{ discord_id: string }>(env, "SELECT discord_id FROM project_repos WHERE project_id = ? AND lower(repo) = lower(?) AND discord_id != ?", p.id, r.repo, uid);
  if (taken) throw new ProjectError("proj.repo_taken");
  await run(env, `INSERT INTO project_repos (project_id, guild_id, discord_id, repo, branch, due_check, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT (project_id, discord_id) DO UPDATE SET repo = excluded.repo, branch = excluded.branch, content_hash = NULL, due_check = 1, error = NULL`,
    p.id, g.id, uid, r.repo, r.branch, now());
  return (await one<RepoRow>(env, "SELECT * FROM project_repos WHERE project_id = ? AND discord_id = ?", p.id, uid))!;
}

// ---------------------------------------------------------------- grading
async function fetchEntry(repo: string, branch: string, path: string): Promise<{ ok: true; code: string } | { ok: false; key: string }> {
  const url = `https://raw.githubusercontent.com/${repo}/${branch.split("/").map(encodeURIComponent).join("/")}/${path.split("/").map(encodeURIComponent).join("/")}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "user-agent": "ClassBot autograder" } });
  } catch {
    return { ok: false, key: "proj.err_github" };
  }
  if (res.status === 404) return { ok: false, key: "proj.err_missing" };
  if (!res.ok) return { ok: false, key: "proj.err_github" };
  const code = await res.text();
  if (code.length > MAX_FILE) return { ok: false, key: "proj.err_big" };
  return { ok: true, code };
}

export type GradeResult =
  | { kind: "graded"; j: Judgement; earned: number; late: boolean; firstFull: boolean }
  | { kind: "unchanged" } | { kind: "error"; key: string } | { kind: "runner_down" };

/** Download, judge, store the result and award points for a new best score. */
export async function gradeRepo(env: Env, g: GuildRow, p: ProjectRow, pr: RepoRow, force = false): Promise<GradeResult> {
  await run(env, "UPDATE project_repos SET due_check = 0, checked_at = ? WHERE project_id = ? AND discord_id = ?", now(), p.id, pr.discord_id);
  const f = await fetchEntry(pr.repo, pr.branch, p.entry);
  if (!f.ok) {
    const key = (f as { key: string }).key;
    await run(env, "UPDATE project_repos SET error = ? WHERE project_id = ? AND discord_id = ?", key, p.id, pr.discord_id);
    return { kind: "error", key };
  }
  const code = (f as { code: string }).code;
  const hash = await sha256(p.lang + "\n" + code);
  if (!force && hash === pr.content_hash) return { kind: "unchanged" };
  const tests = testCases(p);
  let j: Judgement;
  try {
    j = await judge(env, code, p.lang as CodeLang, tests, p.time_limit);
  } catch (e) {
    if (e instanceof RunnerUnavailable) {
      await run(env, "UPDATE project_repos SET due_check = 1 WHERE project_id = ? AND discord_id = ?", p.id, pr.discord_id);
      return { kind: "runner_down" };
    }
    throw e;
  }
  const late = !!p.due_at && now() > p.due_at;
  const best = late ? pr.best : Math.max(pr.best, j.passed);
  const earned = tests.length ? Math.round((p.points * best) / tests.length) : 0;
  const delta = earned - pr.points;
  const firstFull = j.passed === tests.length && pr.best < tests.length && !late;
  const stored = { ...j, failed: j.failed ? { ...j.failed, ...(j.failed.sample ? {} : { input: undefined, expected: undefined, got: undefined }) } : undefined };
  await run(env, "UPDATE project_repos SET content_hash = ?, passed = ?, total = ?, best = ?, points = ?, result = ?, error = NULL, runs = runs + 1 WHERE project_id = ? AND discord_id = ?",
    hash, j.passed, tests.length, best, Math.max(pr.points, earned), JSON.stringify(stored), p.id, pr.discord_id);
  if (delta > 0) await addPoints(env, g, { discordId: pr.discord_id, amount: delta, reason: "project", ref: p.id, note: `${j.passed}/${tests.length}` });
  if (firstFull) {
    const ch = await arenaChannel(env, g);
    if (ch) await send(env, ch, { content: t(g.lang, "proj.arena_full", { user: mention(pr.discord_id), title: p.title }) }).catch(() => {});
  }
  return { kind: "graded", j, earned: Math.max(0, delta), late, firstFull };
}

/** The message a student gets after a check (reply or DM). */
export function resultText(L: string, p: ProjectRow, pr: RepoRow, r: GradeResult): string {
  const head = `🐙 **${p.title}** · \`${pr.repo}\` · \`${p.entry}\``;
  if (r.kind === "unchanged") return `${head}\n${t(L, "proj.unchanged", { passed: pr.passed, total: pr.total || JSON.parse(p.tests).length })}`;
  if (r.kind === "error") return `${head}\n${t(L, r.key, { file: p.entry, repo: pr.repo })}`;
  if (r.kind === "runner_down") return `${head}\n${t(L, "proj.runner_down")}`;
  const j = r.j;
  const lines = [head, t(L, j.verdict === "accepted" ? "proj.all_pass" : "proj.some_pass", { passed: j.passed, total: j.total })];
  if (j.verdict === "compile") lines.push(t(L, "proj.compile"), "```\n" + truncate(j.error ?? "", 700) + "\n```");
  else if (j.failed) {
    const f = j.failed;
    const why = t(L, `proj.v.${j.verdict}`);
    lines.push(t(L, "proj.first_fail", { n: f.idx, why }));
    if (f.sample) lines.push("```\n" + truncate(f.input ?? "", 300) + "\n```" + `${t(L, "judge.expected")} \`${truncate(f.expected ?? "", 150)}\` · ${t(L, "judge.got")} \`${truncate(f.got || "∅", 150)}\``);
    if (f.error) lines.push("```\n" + truncate(f.error, 500) + "\n```");
  }
  if (r.earned) lines.push(t(L, "proj.earned", { p: r.earned }));
  if (r.late) lines.push(t(L, "proj.late"));
  return lines.join("\n");
}

/** Cron: grade repos flagged by a push / button first, then anything not checked for 15 minutes. */
export async function checkProjects(env: Env, limit = 3) {
  const due = await all<RepoRow & { p_id: number }>(env,
    `SELECT r.*, p.id AS p_id FROM project_repos r JOIN projects p ON p.id = r.project_id
      WHERE p.status = 'open' AND (r.due_check = 1 OR r.checked_at IS NULL OR r.checked_at < ?)
      ORDER BY r.due_check DESC, COALESCE(r.checked_at, 0) LIMIT ?`, now() - RECHECK_SECONDS, limit);
  for (const pr of due) {
    const p = (await one<ProjectRow>(env, "SELECT * FROM projects WHERE id = ?", pr.project_id))!;
    const g = (await one<GuildRow>(env, "SELECT * FROM guilds WHERE id = ?", p.guild_id))!;
    const r = await gradeRepo(env, g, p, pr).catch((e) => { console.error("project grade", e); return null; });
    // tell the student when something new happened (a new grade, or a new problem with their repo)
    if (r && (r.kind === "graded" || (r.kind === "error" && pr.error !== r.key))) {
      const fresh = (await one<RepoRow>(env, "SELECT * FROM project_repos WHERE project_id = ? AND discord_id = ?", p.id, pr.discord_id))!;
      await dm(env, pr.discord_id, { content: resultText(g.lang, p, fresh, r) }).catch(() => false);
    }
  }
}

/** GitHub push webhook (optional): mark the pushed repository for a check right away. */
export async function onPush(env: Env, payload: any): Promise<number> {
  const name = String(payload?.repository?.full_name ?? "");
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(name)) return 0;
  const r = await run(env, "UPDATE project_repos SET due_check = 1 WHERE lower(repo) = lower(?) AND project_id IN (SELECT id FROM projects WHERE status = 'open')", name);
  return r.meta.changes ?? 0;
}

/** Dashboard: one project with every student's status. */
export async function projectDetail(env: Env, g: GuildRow, id: number) {
  const p = await one<ProjectRow>(env, "SELECT * FROM projects WHERE id = ? AND guild_id = ?", id, g.id);
  if (!p) return null;
  const repos = await all<RepoRow & { name: string | null }>(env,
    "SELECT r.*, pl.name FROM project_repos r LEFT JOIN players pl ON pl.guild_id = r.guild_id AND pl.discord_id = r.discord_id WHERE r.project_id = ? ORDER BY r.best DESC, pl.name", p.id);
  return { project: { ...p, tests: JSON.parse(p.tests), testsText: testsText(JSON.parse(p.tests)) }, repos: repos.map((r) => ({ ...r, result: r.result ? JSON.parse(r.result) : null })) };
}

export async function projectList(env: Env, g: GuildRow) {
  return all(env, `SELECT p.id, p.title, p.lang, p.entry, p.points, p.due_at, p.status, p.created_at,
      (SELECT COUNT(*) FROM project_repos r WHERE r.project_id = p.id) AS linked,
      (SELECT COUNT(*) FROM project_repos r WHERE r.project_id = p.id AND r.total > 0 AND r.best = r.total) AS complete,
      json_array_length(p.tests) AS tests
    FROM projects p WHERE p.guild_id = ? ORDER BY p.status = 'open' DESC, p.id DESC`, g.id);
}
