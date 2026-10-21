// Dashboard API for the learning part: programmes (planning + competencies), briefs (generator, editor, hand-ins,
// debriefs), GitHub (settings, activity, import from GitHub Watcher) and assessments.
// Returns null when the path isn't one of ours (the main API goes on).
import type { Ctx, Env, GuildRow, PlayerRow } from "../shared/types.ts";
import { libAssessment, syncLibrary } from "../shared/library.ts";
import { all, now, one, run } from "../shared/db.ts";
import { send } from "../shared/discord.ts";
import { t } from "../shared/i18n.ts";
import { BUILTIN, TECHS, compLabel, compName, parseComp, programList, programOf, saveProgram, techFound, techOfWeek, weekAt } from "../shared/program.ts";
import type { Program } from "../shared/program.ts";
import { BriefError, SECTIONS, brainstorm, briefChecks, briefFromText, cleanBrief, deleteBrief, generateBrief, getBrief, listBriefs, rewriteSection, saveBrief, simplonFields, simplonText } from "../shared/briefs.ts";
import type { Section } from "../shared/briefs.ts";
import { DebriefError, analyze, saveRemarks, writeComment, makeMemberLevel, setMemberLevel, briefAssessments, studentRepos, cleanSquads, delOral, getReview, gridToText, loadBriefCtx, makeChallenge, makeGrid, makeOral, makeReviewLevel, parseGrid, progressView, saveCommentText, saveMembers, saveStates, setReviewLevel, squadOf, statesOf } from "../shared/review/debrief.ts";
import { CHECK_IDS, checkLabel } from "../shared/review/engine.ts";
import { memberLevels } from "../shared/review/members.ts";
import { activityOf, backfillRepos, briefChannel, ensureGithubChannels, ghAppOf, githubCanRead, githubCfg, githubReady, githubUrls, parseRepo, pushStatus, saveGhApp, saveGithubCfg, sendDaily, sendWeekly, testGithubChannels } from "../shared/github.ts";
import { ManifestError, finishManifest, githubManifest } from "../shared/github.ts";
import { WatcherMsgError, announceFr, postStatus } from "../shared/watcher_discord.ts";
import { SprintError, proposeLevels, saveDecision, saveSprintComment, sprintComment, sprintView, sprintsOverview } from "../shared/sprints.ts";
import { appJwt, GH_API, githubGet, installationToken } from "../shared/review/gh.ts";
import { classCompetencies, competencyMap, finalizeReview, reopenReview, rewardsOf, setManualCompetency } from "../shared/learning.ts";
import { AssessError, generateQuestions, gradeTaker, invite, needsGrading, saveOptions, letBackIn, paperFor, questionsOf, saveAssessment, sendResults, setGrade, settingsOf, takerLinks } from "../shared/assess.ts";
import type { AssessRow, TakerRow } from "../shared/assess.ts";
import { planLinkIn } from "../shared/review/engine.ts";
import { perMinuteWait, aiStatus } from "../shared/aikeys.ts";
import { ShareError, importShared, renewShareLink, shareLink } from "../shared/assessshare.ts";
import { GhDetailError, studentGithub, summarizeStudentGithub, syncStudentGithub } from "../shared/ghdetail.ts";
import { StepError, makeSteps, parseSteps, proposeStep, redate, saveStep, stepRecs, stepsFallback, stepsFrom, stepsOf, stepsToText } from "../shared/review/steps.ts";
import { WatcherError, importWatcher, markWatcherImport, memoryKv, watcherImportOf, watcherKeys, watcherValues } from "../shared/watcher.ts";
import { programFromSheets } from "../shared/planning_import.ts";

export class ApiError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status; } }
const ok = (data: unknown) => Response.json(data);
const bad = (msg: string) => { throw new ApiError(400, msg); };
/** The technologies the teacher picked for a brief (list, or comma-separated text). */
const techList = (v: unknown): string[] => [...new Set((Array.isArray(v) ? v : String(v ?? "").split(/[,;\n]+/)).map((x) => String(x).trim().slice(0, 40)).filter(Boolean))].slice(0, 20);

export async function learningApi(env: Env, ctx: Ctx, path: string, method: string, body: any, url: URL, guild: () => Promise<GuildRow>): Promise<Response | null> {
  if (!/^\/(programs?|briefs|github|assessments|competencies|sprints|progress)(\/|$)/.test(path) && !/^\/students\/[\w-]+\/(competency|github(\/sync|\/summary)?)$/.test(path)) return null;
  try {
    return await route(env, ctx, path, method, body, url, guild);
  } catch (e) {
    if (e instanceof ApiError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof BriefError || e instanceof DebriefError || e instanceof AssessError || e instanceof StepError || e instanceof SprintError || e instanceof WatcherMsgError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

async function route(env: Env, ctx: Ctx, path: string, method: string, body: any, url: URL, guild: () => Promise<GuildRow>): Promise<Response | null> {
  let m: RegExpMatchArray | null;
  // ------------------------------------------------------------ programmes
  if (path === "/programs" && method === "GET") {
    const g = await guild();
    const p = await programOf(env, g);
    const today = new Date().toISOString().slice(0, 10);
    const briefs = await all<{ id: number; week: number | null; title: string; status: string }>(env, "SELECT id, week, title, status FROM briefs WHERE guild_id = ? AND week IS NOT NULL", g.id);
    return ok({ list: await programList(env, g), current: p, now: weekAt(p, today)?.n ?? null, briefs,
      // the technologies a brief can use, and those each week of the planning uses (the generator starts from them)
      techs: TECHS.map((x) => ({ name: x.name, tool: !!x.tool })), weekTech: Object.fromEntries(p.weeks.map((w) => [w.n, techOfWeek(w)])) });
  }
  if (path === "/program" && method === "PUT") {
    const g = await guild();
    const id = String(body.id || "");
    if (!(await programList(env, g)).some((p) => p.id === id)) bad("Unknown programme.");
    await run(env, "UPDATE guilds SET program = ? WHERE id = ?", id, g.id);
    return ok({ id });
  }
  if (path === "/programs/parse" && method === "POST") {
    // an Excel workbook read in the browser (rows of each sheet) → a programme to check before saving it
    const g = await guild();
    const sheets: Record<string, unknown[][]> = {};
    let cells = 0;
    for (const [name, rows] of Object.entries(body.sheets && typeof body.sheets === "object" ? body.sheets : {}).slice(0, 12)) {
      if (!Array.isArray(rows)) continue;
      sheets[String(name).slice(0, 60)] = rows.slice(0, 1500).map((r: unknown) => (Array.isArray(r) ? r.slice(0, 40).map((c) => (c == null ? "" : String(c).slice(0, 6000))) : []));
      cells += sheets[String(name).slice(0, 60)].reduce((n, r) => n + r.length, 0);
    }
    if (!cells) bad("This file is empty, or isn't an Excel workbook.");
    const r = programFromSheets(sheets, await programOf(env, g), String(body.fileName || ""));
    if (!r.program.weeks.length && !r.program.sprints.length) bad(r.warnings.join(" "));
    return ok(r);
  }
  if (path === "/programs" && method === "POST") {
    // save a class's own programme (editing a built-in one makes a copy)
    const g = await guild();
    const id = String(body.id || "").startsWith("db:") ? String(body.id) : null;
    const newId = await saveProgram(env, g, id, body.data);
    if (body.use !== false) await run(env, "UPDATE guilds SET program = ? WHERE id = ?", newId, g.id);
    return ok({ id: newId, current: await programOf(env, { ...g, program: newId } as any) });
  }
  if ((m = path.match(/^\/programs\/(db:\d+)$/)) && method === "DELETE") {
    const g = await guild();
    await run(env, "DELETE FROM programs WHERE id = ? AND guild_id = ?", Number(m[1].slice(3)), g.id);
    if ((g as any).program === m[1]) await run(env, "UPDATE guilds SET program = NULL WHERE id = ?", g.id);
    return ok({ ok: true });
  }

  // ------------------------------------------------------------ briefs
  if (path === "/briefs" && method === "GET") {
    const g = await guild();
    const p = await programOf(env, g);
    const app = await ghAppOf(env, g.id);
    return ok({ items: await listBriefs(env, g), program: { id: p.id, name: p.name }, ai: !!(await aiStatus(env)), github: { ready: githubReady(app), read: githubCanRead(app) } });
  }
  if (path === "/briefs/brainstorm" && method === "POST") {
    const g = await guild();
    const p = await programOf(env, g);
    const w = p.weeks.find((x) => x.n === Number(body.week)) ?? null;
    const used = (await all<{ title: string }>(env, "SELECT title FROM briefs WHERE guild_id = ? ORDER BY id DESC LIMIT 30", g.id)).map((r) => r.title);
    return ok({ ideas: await brainstorm(env, p, w, { theme: String(body.theme || "").slice(0, 400), avoid: used, tech: techList(body.tech) }) });
  }
  if (path === "/briefs/generate" && method === "POST") {
    const g = await guild();
    const p = await programOf(env, g);
    const w = p.weeks.find((x) => x.n === Number(body.week)) ?? null;
    // "similar to this brief": a page (its text) or one of the class's briefs
    const how = ["close", "twist", "loose"].includes(body.similar?.how) ? body.similar.how : "close";
    const modelOf = async () => {
      const sm = body.similar;
      if (!sm) return undefined;
      if (sm.brief) {
        const b = await getBrief(env, g, Number(sm.brief));
        if (!b) bad("That brief doesn't exist anymore.");
        return { text: simplonText(b!.data, p), title: b!.data.title, comps: b!.data.competencies, how };
      }
      const text = String(sm.text || "").slice(0, 60000);
      if (text.trim().length < 200) bad("The reference brief is empty: choose its page or paste its text.");
      const d = briefFromText(text, String(sm.title || "").slice(0, 160), Array.isArray(sm.comps) ? sm.comps : []);
      return { text: d.context || d.groups.length ? simplonText(d, p) : text, title: d.title, comps: d.competencies, how };
    };
    const r = await generateBrief(env, p, w, {
      idea: String(body.idea || "").slice(0, 1500), client: String(body.client || "").slice(0, 4000), wishes: String(body.wishes || "").slice(0, 800),
      days: body.days ? Number(body.days) : undefined, mode: body.mode ? String(body.mode).slice(0, 30) : undefined,
      start: /^\d{4}-\d{2}-\d{2}$/.test(String(body.start)) ? String(body.start) : w?.start, due: /^\d{4}-\d{2}-\d{2}$/.test(String(body.due)) ? String(body.due) : w?.end,
      tech: techList(body.tech), model: await modelOf(),
    });
    const id = await saveBrief(env, g, null, { data: r.data, internal: r.internal, program: p.id, week: w?.n ?? null, source: "ai" });
    return ok(await briefView(env, g, id));
  }
  if (path === "/briefs/import" && method === "POST") {
    const g = await guild();
    const p = await programOf(env, g);
    const text = String(body.text || "").slice(0, 60000);
    const data = briefFromText(text, String(body.title || "").slice(0, 160), Array.isArray(body.comps) ? body.comps : []);
    if (!data.groups.length && !data.context) bad("No brief found in this text. Save the brief page from Simplonline (or copy its text) and try again.");
    // the technologies it asks for: the teacher's pick, else those the page names
    const detected = techFound(text);
    if (!data.tags.length) data.tags = Array.isArray(body.tech) && body.tech.length ? techList(body.tech) : detected;
    if (body.preview) return ok({ data, detected, hidden: (() => { const m = text.match(/(\d{1,2})\s+comp[ée]tences\s+vis[ée]es/i); const n = m ? Number(m[1]) : 0; return n > data.competencies.length ? n - data.competencies.length : 0; })() });
    if (Array.isArray(body.tech) && body.tech.length) data.tags = techList(body.tech);
    const md = data.modalities;
    if (body.days) md.days = Math.max(1, Math.min(30, Number(body.days) || md.days));
    if (body.mode) md.mode = String(body.mode).slice(0, 40);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(body.start || ""))) md.start = String(body.start);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(body.due || ""))) md.due = String(body.due);
    const w = body.week ? p.weeks.find((x) => x.n === Number(body.week)) ?? null : null;
    const id = await saveBrief(env, g, null, { data, program: p.id, week: w?.n ?? null, source: "import" });
    // the steps written in the page ("Etape 1, fin du jour 1 : …"), dated from the brief's days (publishing dates them again)
    const fb = stepsFallback(text);
    if (fb.length) {
      const nb = (await getBrief(env, g, id))!;
      const start = nb.start_at ?? now(), steps = stepsFrom(fb, start, nb.due_at ?? start + 5 * 86400);
      if (steps.length) await run(env, "UPDATE briefs SET steps = ? WHERE id = ?", JSON.stringify(steps), id);
    }
    return ok(await briefView(env, g, id));
  }
  if (path === "/briefs" && method === "POST") {
    const g = await guild();
    const p = await programOf(env, g);
    const id = await saveBrief(env, g, null, { data: body.data ?? { title: body.title || "Nouveau brief" }, internal: body.internal, program: p.id, week: body.week ? Number(body.week) : null, source: "manual" });
    return ok(await briefView(env, g, id));
  }
  if ((m = path.match(/^\/briefs\/(\d+)$/))) {
    const g = await guild();
    const id = Number(m[1]);
    if (method === "GET") return ok(await briefView(env, g, id));
    if (method === "DELETE") {
      await deleteBrief(env, g, id);
      await env.DB.batch([env.DB.prepare("DELETE FROM brief_handins WHERE brief_id = ?").bind(id), env.DB.prepare("DELETE FROM brief_reviews WHERE brief_id = ? AND status != 'final'").bind(id)]);
      return ok({ ok: true });
    }
    if (method === "PUT") {
      const cur = await getBrief(env, g, id);
      if (!cur) throw new ApiError(404, "This brief doesn't exist anymore.");
      await saveBrief(env, g, id, { data: body.data ?? cur.data, internal: body.internal ?? cur.internal, status: body.status ?? cur.status, week: body.week ?? null });
      const students = new Set((await all<{ discord_id: string }>(env, "SELECT discord_id FROM players WHERE guild_id = ?", g.id)).map((r) => r.discord_id));
      // the brief's "Work" (individuel / binôme / groupe) says if students work alone or in squads
      if (body.data?.modalities?.mode && !("kind" in body)) {
        const kind = /bin|group|squad|[ée]quipe|team|pair/i.test(String(body.data.modalities.mode)) ? "squad" : "solo";
        if (kind !== (cur as any).kind) await run(env, "UPDATE briefs SET kind = ? WHERE id = ?", kind, id);
      }
      if ("kind" in body || "squads" in body || "repo_hint" in body) {
        await run(env, "UPDATE briefs SET kind = ?, squads = ?, repo_hint = ? WHERE id = ?", body.kind === "squad" ? "squad" : "solo",
          JSON.stringify(body.kind === "squad" ? cleanSquads(body.squads ?? [], students) : []), String(body.repo_hint ?? "").slice(0, 100) || null, id);
      }
      return ok(await briefView(env, g, id));
    }
  }
  if ((m = path.match(/^\/briefs\/(\d+)\/rewrite$/)) && method === "POST") {
    const g = await guild();
    const cur = await getBrief(env, g, Number(m[1]));
    if (!cur) throw new ApiError(404, "This brief doesn't exist anymore.");
    if (!SECTIONS.includes(body.section)) bad("Unknown section.");
    const p = await programOf(env, g);
    const w = p.weeks.find((x) => x.n === cur.week) ?? null;
    const data = await rewriteSection(env, p, w, body.data ? cleanBrief(body.data) : cur.data, body.section as Section, String(body.instruction || "").slice(0, 600));
    return ok({ data });
  }
  if ((m = path.match(/^\/briefs\/(\d+)\/grid$/))) {
    const g = await guild();
    const id = Number(m[1]);
    const cur = await getBrief(env, g, id);
    if (!cur) throw new ApiError(404, "This brief doesn't exist anymore.");
    const grid = method === "PUT" ? { ...parseGrid(String(body.text || "").slice(0, 20000)), by: "edit", at: Date.now() } : await makeGrid(env, cur.data);
    if (!grid.items.length) bad("The grid is empty: write one line per requirement, like “[fonctionnalité] Créer la page Contact (vérif : form, map)”.");
    await run(env, "UPDATE briefs SET grid = ? WHERE id = ?", JSON.stringify(grid), id);
    return ok(await briefView(env, g, id));
  }
  // Watcher: the brief's announcement in French, and who pushed, posted in Discord when the teacher clicks
  if ((m = path.match(/^\/briefs\/(\d+)\/watcher\/(announce|status)$/)) && method === "POST") {
    const g = await guild();
    return ok(m[2] === "announce" ? await announceFr(env, g, Number(m[1])) : await postStatus(env, g, Number(m[1])));
  }
  if ((m = path.match(/^\/briefs\/(\d+)\/steps$/)) && (method === "PUT" || method === "POST")) {
    const g = await guild();
    const id = Number(m[1]);
    const cur = await getBrief(env, g, id);
    if (!cur) throw new ApiError(404, "This brief doesn't exist anymore.");
    const start = cur.start_at ?? now(), due = cur.due_at ?? start + 5 * 86400;
    const steps = method === "PUT" ? parseSteps(String(body.text || "").slice(0, 6000)) : await makeSteps(env, simplonText(cur.data, await programOf(env, g)), start, due);
    if (method === "PUT" && String(body.text || "").trim() && !steps.length) bad("One step per line: name | YYYY-MM-DD HH:MM | what is expected.");
    await run(env, "UPDATE briefs SET steps = ? WHERE id = ?", steps.length ? JSON.stringify(steps) : null, id);
    return ok(await briefView(env, g, id));
  }
  if ((m = path.match(/^\/briefs\/(\d+)\/assign$/)) && method === "POST") {
    // publish: dates, grid, and the announcement in Discord
    const g = await guild();
    const id = Number(m[1]);
    const cur = await getBrief(env, g, id);
    if (!cur) throw new ApiError(404, "This brief doesn't exist anymore.");
    const data = { ...cur.data, modalities: { ...cur.data.modalities, start: String(body.start || cur.data.modalities.start || ""), due: String(body.due || cur.data.modalities.due || "") } };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.modalities.due)) bad("Choose the due date first.");
    if ("time" in body) { if (/^\d\d:\d\d$/.test(String(body.time))) data.modalities.time = String(body.time); else delete data.modalities.time; }
    await saveBrief(env, g, id, { data, internal: cur.internal, status: "assigned" });
    // its sprint: "" = by its week or due date, "none" = not in a sprint (e.g. a cross defense), n = sprint n
    if ("sprint" in body) await run(env, "UPDATE briefs SET sprint = ? WHERE id = ?", body.sprint === "none" ? 0 : Number(body.sprint) > 0 ? Number(body.sprint) : null, id);
    if (!(cur as any).grid) await run(env, "UPDATE briefs SET grid = ? WHERE id = ?", JSON.stringify(await makeGrid(env, data)), id);
    {
      const nb = (await getBrief(env, g, id))!;
      const start = nb.start_at ?? now(), due = nb.due_at ?? start + 5 * 86400;
      const had = stepsOf((nb as any).steps);
      const steps = had.length ? redate(had, start, due) : stepsFrom(stepsFallback(simplonText(nb.data, await programOf(env, g))), start, due);
      if (steps.length) await run(env, "UPDATE briefs SET steps = ? WHERE id = ?", JSON.stringify(steps), id);
    }
    if (body.announce) {
      const p = await programOf(env, g);
      const ch = await briefChannel(env, g);   // #general unless the teacher chose another channel
      const b = (await getBrief(env, g, id))!;
      const f = simplonFields(b.data, p);
      let squads: any[] = [];
      try { squads = JSON.parse((b as any).squads || "[]"); } catch { squads = []; }
      if (ch && await send(env, ch, { embeds: [{ color: 0x2563eb, title: t(g.lang, "brief.announce_title", { title: b.data.title }),
        description: [b.data.summary, b.due_at ? t(g.lang, "brief.due_line", { when: `<t:${b.due_at}:F>` }) : "",
          b.data.competencies.length ? `🎯 ${f.competencies.split("\n").map((l) => l.split(".")[0]).join(", ")}` : "",
          squads.length ? squads.map((s) => `• **${s.name}** : ${s.members.map((x: string) => `<@${x}>`).join(" ")}${s.sm ? ` (SM <@${s.sm}>)` : ""}`).join("\n") : "",
          t(g.lang, "brief.handin_hint")].filter(Boolean).join("\n\n").slice(0, 4000) }] }).then(() => true, () => false)) await run(env, "UPDATE briefs SET announced_at = ? WHERE id = ?", now(), id);
    }
    return ok(await briefView(env, g, id));
  }
  if ((m = path.match(/^\/briefs\/(\d+)\/handin$/)) && method === "POST") {
    const g = await guild();
    const id = Number(m[1]);
    const who = String(body.who || "");
    if (!/^(u:\d+|s:[a-f0-9]{6})$/.test(who)) bad("Unknown student or squad.");
    if (!String(body.repo || "").trim()) { await run(env, "DELETE FROM brief_handins WHERE brief_id = ? AND who = ?", id, who); return ok(await briefView(env, g, id)); }
    const repo = parseRepo(String(body.repo));
    if (!repo) bad("Write the repo as owner/repo, or paste its GitHub link.");
    const plan = String(body.plan || "").trim() ? planLinkIn(String(body.plan)) : "";
    if (String(body.plan || "").trim() && !plan) bad("The planning link is not a board (Trello board, Jira or GitHub Project).");
    await run(env, `INSERT INTO brief_handins (brief_id, guild_id, who, repo, plan, at, by) VALUES (?, ?, ?, ?, ?, ?, 'teacher')
      ON CONFLICT (brief_id, who) DO UPDATE SET repo = excluded.repo, plan = excluded.plan, at = excluded.at, by = 'teacher'`, id, g.id, who, repo, plan || null, now());
    return ok(await briefView(env, g, id));
  }
  // ---- debrief of one student / squad
  if ((m = path.match(/^\/briefs\/(\d+)\/review(?:\/(analyze|repos|states|comment|commentai|challenge|members|finalize|reopen|step|stepcheck|oral|level|remarks))?$/))) {
    const g = await guild();
    const id = Number(m[1]);
    const who = String(body.who || url.searchParams.get("who") || "");
    if (!/^(u:\d+|s:[a-f0-9]{6})$/.test(who)) bad("Unknown student or squad.");
    const b = await loadBriefCtx(env, g, id);
    if (!b) throw new ApiError(404, "This brief doesn't exist anymore.");
    const act = m[2];
    if (!act && method === "GET") return ok(await reviewView(env, g, id, who));
    if (!act && method === "DELETE") { await reopenReview(env, g, id, who, true); await run(env, "DELETE FROM brief_reviews WHERE brief_id = ? AND who = ?", id, who); return ok({ ok: true }); }
    if (act === "repos" && method === "GET") {
      let members: PlayerRow[];
      if (who.startsWith("s:")) {
        const sq = b.squads.find((s) => `s:${s.id}` === who);
        if (!sq) bad("Unknown squad.");
        members = await all<PlayerRow>(env, `SELECT * FROM players WHERE guild_id = ? AND discord_id IN (${sq!.members.map(() => "?").join(",")})`, g.id, ...sq!.members);
      } else members = await all<PlayerRow>(env, "SELECT * FROM players WHERE guild_id = ? AND discord_id = ?", g.id, who.slice(2));
      return ok(await studentRepos(env, g, b, who, members));
    }
    if (act === "analyze") {
      if ((await getReview(env, id, who))?.status === "final") bad("This debrief is finalized: reopen it first to analyze the repo again.");
      if (!b.grid) { const grid = await makeGrid(env, b.data); await run(env, "UPDATE briefs SET grid = ? WHERE id = ?", JSON.stringify(grid), id); b.grid = grid as any; }
      let r;
      if (who.startsWith("s:")) {
        const sq = b.squads.find((s) => `s:${s.id}` === who);
        if (!sq) bad("Unknown squad.");
        const members = await all<PlayerRow>(env, `SELECT * FROM players WHERE guild_id = ? AND discord_id IN (${sq!.members.map(() => "?").join(",")})`, g.id, ...sq!.members);
        r = await analyze(env, g, b, { squad: sq!, members, repoFilter: body.repo });
      } else {
        const p = await one<PlayerRow>(env, "SELECT * FROM players WHERE guild_id = ? AND discord_id = ?", g.id, who.slice(2));
        if (!p) bad("Unknown student.");
        r = await analyze(env, g, b, { player: p!, repoFilter: body.repo });
      }
      if (!r.ok) bad(r.msg);
      const chosen = body.saveHandin && String(body.repo || "").includes("/") ? parseRepo(String(body.repo)) : null;
      if (chosen) await run(env, `INSERT INTO brief_handins (brief_id, guild_id, who, repo, plan, at, by) VALUES (?, ?, ?, ?, NULL, ?, 'teacher')
        ON CONFLICT (brief_id, who) DO UPDATE SET repo = excluded.repo, at = excluded.at, by = 'teacher'`, id, g.id, who, chosen, now());
      return ok({ msg: r.msg, ...(await reviewView(env, g, id, who)) });
    }
    if (act === "states") { await saveStates(env, g, id, who, body.states ?? {}); return ok(await reviewView(env, g, id, who)); }
    if (act === "comment") { await saveCommentText(env, g, id, who, String(body.text ?? "")); return ok(await reviewView(env, g, id, who)); }
    // ✨ the comment phrased by the AI from the switches on the screen (the template when it can't)
    if (act === "commentai" && method === "POST") { const w = await writeComment(env, g, id, who, body.states ?? null); return ok({ ...w, ...(await reviewView(env, g, id, who)) }); }
    if (act === "challenge") { await makeChallenge(env, g, b, who, body.states ?? null, String(body.member || ""), String(body.proposal || "")); return ok(await reviewView(env, g, id, who)); }
    // oral questions (at most 5) and the debrief's level (proposed, then the teacher's)
    if (act === "remarks" && method === "POST") { await saveRemarks(env, g, b, who, String(body.text ?? ""), !!body.ai); return ok(await reviewView(env, g, id, who)); }
    if (act === "oral" && method === "POST") {
      if (body.del != null) await delOral(env, g, id, who, Number(body.del), body.states?.oral);
      else await makeOral(env, g, b, who);
      return ok(await reviewView(env, g, id, who));
    }
    if (act === "level" && method === "POST") {
      // a squad member's own level (their card), or the debrief's
      if (body.member) {
        if (body.ai) await makeMemberLevel(env, g, id, who, String(body.member));
        else await setMemberLevel(env, g, id, who, String(body.member), String(body.level || ""));
        return ok(await reviewView(env, g, id, who));
      }
      if (body.ai) await makeReviewLevel(env, g, id, who, body.states ?? null, String(body.comment || "").slice(0, 6000));
      else await setReviewLevel(env, g, id, who, String(body.level || ""));
      return ok(await reviewView(env, g, id, who));
    }
    if (act === "members") { await saveMembers(env, g, id, who, body.members ?? {}); return ok(await reviewView(env, g, id, who)); }
    if (act === "finalize") {
      if (body.states) await saveStates(env, g, id, who, body.states);
      if (typeof body.comment === "string" && body.comment.trim()) await saveCommentText(env, g, id, who, body.comment);
      const r = await finalizeReview(env, g, { id, title: b.title, competencies: b.skills.join(",") }, who, { notify: !!body.notify });
      return ok({ ...r, ...(await reviewView(env, g, id, who)) });
    }
    if (act === "reopen") { await reopenReview(env, g, id, who); return ok(await reviewView(env, g, id, who)); }
    // steps: the bot proposes from the repo at the step's date, the teacher decides
    if (act === "stepcheck" && method === "POST") { const prop = await proposeStep(env, g, b, who, Number(body.n)); return ok({ prop, ...(await reviewView(env, g, id, who)) }); }
    if (act === "step" && method === "POST") { await saveStep(env, g, b, who, Number(body.n), String(body.final || ""), String(body.note || "")); return ok(await reviewView(env, g, id, who)); }
  }

  // ------------------------------------------------------------ progress: the level of each debrief, brief by brief
  if (path === "/progress" && method === "GET") return ok(await progressView(env, await guild()));

  // ------------------------------------------------------------ sprints (the sprint review for the administration's report)
  if (path === "/sprints" && method === "GET") return ok(await sprintsOverview(env, await guild()));
  if ((m = path.match(/^\/sprints\/(\d+)(?:\/(levels|decide|comment))?$/))) {
    const g = await guild();
    const n = Number(m[1]), act = m[2];
    if (!act && method === "GET") return ok(await sprintView(env, g, n));
    if (act === "levels" && method === "POST") { const r = await proposeLevels(env, g, n); return ok({ ...r, ...(await sprintView(env, g, n)) }); }
    if (act === "decide" && method === "POST") {
      await saveDecision(env, g, n, String(body.discord_id || ""), { level: body.level, decision: body.decision, note: body.note });
      return ok({ ok: true });
    }
    if (act === "comment" && method === "POST") return ok(await sprintComment(env, g, n));
    if (act === "comment" && method === "PUT") return ok(await saveSprintComment(env, g, n, String(body.text ?? "")));
  }

  // ------------------------------------------------------------ competencies (class view)
  if (path === "/competencies" && method === "GET") {
    const g = await guild();
    const p = await programOf(env, g);
    const students = await all<{ discord_id: string; name: string | null }>(env, "SELECT discord_id, name FROM players WHERE guild_id = ? ORDER BY name", g.id);
    return ok({ referential: p.referential.map((c) => ({ ...c, label: compLabel(c.code) })), levels: p.levels, students, cells: await classCompetencies(env, g) });
  }

  // the GitHub tab of a student page: commits, pull requests, repos and briefs, AI summary of the features
  if ((m = path.match(/^\/students\/([\w-]{1,30})\/github(\/sync|\/summary)?$/))) {
    const g = await guild();
    const days = Number(url.searchParams.get("days") || body?.days || 30);
    try {
      if (!m[2] && method === "GET") return ok(await studentGithub(env, g, m[1], days));
      if (m[2] === "/sync" && method === "POST") { const r = await syncStudentGithub(env, g, m[1], Math.min(120, Math.max(7, days || 30))); return ok({ ...r, ...(await studentGithub(env, g, m[1], days)) }); }
      if (m[2] === "/summary" && method === "POST") return ok({ summary: await summarizeStudentGithub(env, g, m[1], days) });
    } catch (e) { if (e instanceof GhDetailError) bad(e.message); throw e; }
  }
  // a teacher's decision on one student's competency: validate at a level, invalidate, or back to automatic
  if ((m = path.match(/^\/students\/([\w-]{1,30})\/competency$/)) && method === "POST") {
    const g = await guild();
    const p = await programOf(env, g);
    const pc = parseComp(String(body.code || ""));
    if (!pc || !p.referential.some((c) => c.code === pc.code)) return bad("Unknown competency");
    await setManualCompetency(env, g, m[1], pc.code, body.reset ? null : { ok: !!body.ok, level: body.level ?? pc.level ?? 1, note: body.note ?? null });
    const map = await competencyMap(env, g, m[1], p);
    return ok({ competency: map.find((c) => c.code === pc.code) });
  }

  // ------------------------------------------------------------ GitHub
  if (path === "/github" && method === "GET") {
    const g = await guild();
    const cfg = await ensureGithubChannels(env, g);
    const linked = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM players WHERE guild_id = ? AND github_id IS NOT NULL", g.id);
    const total = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM players WHERE guild_id = ?", g.id);
    const app = await ghAppOf(env, g.id);
    return ok({
      cfg, fallback: g.announce_channel || g.daily_channel || null, rewards: rewardsOf(g), linked: linked?.n ?? 0, students: total?.n ?? 0,
      setup: {
        // own: this class has its own GitHub App; shared: the Worker's secrets have one the class can use instead
        own: app.own, shared: !!(env.GITHUB_CLIENT_ID && env.GITHUB_APP_SLUG),
        app: !!app.slug, oauth: !!(app.clientId && app.clientSecret), webhook: !!app.webhookSecret, key: !!app.privateKey,
        ai: await aiStatus(env), watcher: !!env.WATCHER_KV, watcherDone: watcherImportOf(g), slug: app.slug || null,
        appId: app.appId || "", clientId: app.clientId || "",          // never the secrets
        urls: githubUrls(env, app), ownUrls: githubUrls(env, { ...app, own: true, guildId: g.id }),
      },
      checks: CHECK_IDS.map((id) => ({ id, label: checkLabel(id) })),
    });
  }
  if (path === "/github/app" && method === "PUT") {
    // this class's own GitHub App (empty secret fields keep what was saved)
    const g = await guild();
    try { await saveGhApp(env, g.id, body); } catch (e) { bad((e as Error).message); }
    return ok({ ok: true });
  }
  // "Create the GitHub App for me": the dashboard posts the manifest to GitHub, which comes back here with a code
  if (path === "/github/manifest" && method === "POST") {
    try { return ok(await githubManifest(env, await guild(), url.origin)); } catch (e) { if (e instanceof ManifestError) bad(e.message); throw e; }
  }
  if (path === "/github/manifest/done" && method === "GET") {
    const back = (q: string) => new Response(null, { status: 303, headers: { location: `/?${q}#/settings/github` } });
    try {
      const r = await finishManifest(env, String(url.searchParams.get("state") || ""), String(url.searchParams.get("code") || ""));
      return back(`gh=created&slug=${encodeURIComponent(r.slug)}`);
    } catch (e) {
      if (e instanceof ManifestError) return back(`gh=failed&why=${encodeURIComponent(e.message)}`);
      throw e;
    }
  }
  if (path === "/github/app" && method === "DELETE") {
    const g = await guild();
    await run(env, "DELETE FROM gh_apps WHERE guild_id = ?", g.id);
    return ok({ ok: true });
  }
  if (path === "/github/app/test" && method === "POST") {
    // signs in as the App with its private key: proves that the App ID and the key go together
    const g = await guild();
    const app = await ghAppOf(env, g.id);
    if (!githubCanRead(app)) bad("Save the App ID and the private key first.");
    let info: any = null, status = 0;
    try {
      const r = await fetch(`${GH_API}/app`, { headers: { Authorization: `Bearer ${await appJwt(app)}`, Accept: "application/vnd.github+json", "User-Agent": "classbot" } });
      status = r.status;
      info = await r.json().catch(() => null);
    } catch { bad("The private key could not be read, or GitHub didn't answer. Paste the whole .pem file again."); }
    if (status !== 200) bad(`GitHub refused (${info?.message || status}). Check the App ID and the private key.`);
    const warn = info?.slug && app.slug && info.slug !== app.slug ? `The App's slug is “${info.slug}”, not “${app.slug}”: fix it.` : "";
    return ok({ name: info?.name ?? "", slug: info?.slug ?? "", owner: info?.owner?.login ?? "", installs: info?.installations_count ?? null, warn });
  }
  if (path === "/github" && method === "PUT") {
    const g = await guild();
    const patch: any = {};
    for (const k of ["channel", "forum", "briefs"]) if (k in body) patch[k] = body[k] ? String(body[k]).replace(/\D/g, "") || null : null;
    if ("briefs" in body) patch.autoGeneral = !!patch.briefs;   // left empty: #general is looked for again
    if ("links" in body) patch.links = body.links === "off" ? "off" : body.links ? String(body.links).replace(/\D/g, "") || null : null;
    if ("channel" in body || "forum" in body) { patch.auto = true; patch.forumError = null; }
    for (const k of ["daily", "weekly", "reminders"]) if (k in body) patch[k] = !!body[k];
    for (const k of ["hour", "minute", "inactiveDays", "weeklyDay", "tiny", "huge"]) if (k in body) patch[k] = Number(body[k]);
    if ("skip" in body) patch.skip = (Array.isArray(body.skip) ? body.skip : []).map(Number).filter((d: number) => d >= 0 && d <= 6);
    if ("hidden" in body) patch.hidden = (Array.isArray(body.hidden) ? body.hidden : String(body.hidden || "").split(/[\s,]+/)).map((r: string) => parseRepo(r)?.toLowerCase()).filter(Boolean);
    if ("rewards" in body) patch.rewards = { comp: Number(body.rewards?.comp), coins: Number(body.rewards?.coins), bonus: Number(body.rewards?.bonus) };
    const cfg = await saveGithubCfg(env, g, patch);
    return ok({ cfg, rewards: rewardsOf(g) });
  }
  if (path === "/github/test" && method === "POST") return ok(await testGithubChannels(env, await guild()));
  if (path === "/github/activity" && method === "GET") return ok(await activityOf(env, await guild(), 14));
  // a student's pushes GitHub never sent (a repo shared late): counted since the brief in progress started
  if (path === "/github/recount" && method === "POST") {
    const g = await guild();
    const pl = await one<PlayerRow>(env, "SELECT * FROM players WHERE guild_id = ? AND discord_id = ?", g.id, String(body.discord_id || ""));
    if (!pl?.gh_inst) bad("This student isn't connected to GitHub.");
    const app = await ghAppOf(env, g.id);
    if (!githubCanRead(app)) bad("Save the App ID and the private key first.");
    let token = "";
    try { token = await installationToken(env, app, pl!.gh_inst); } catch { bad("Could not reach GitHub."); }
    const r: any = await githubGet("/installation/repositories?per_page=100", token).catch(() => null);
    const recent = ((r?.repositories || []) as any[]).filter((x) => Date.parse(x.pushed_at || 0) >= Date.now() - 14 * 86400000)
      .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at)).map((x) => String(x.full_name));
    return ok(await backfillRepos(env, app, String(pl!.gh_inst), [g.id], recent));
  }
  // which students let the App see only some repos: their new projects are not counted until they add them
  if (path === "/github/check-repos" && method === "POST") {
    const g = await guild();
    const app = await ghAppOf(env, g.id);
    if (!githubCanRead(app)) bad("Save the App ID and the private key first.");
    const rows = (await all<{ discord_id: string; name: string | null; github_login: string; gh_inst: string; gh_sel: string | null }>(env,
      "SELECT discord_id, name, github_login, gh_inst, gh_sel FROM players WHERE guild_id = ? AND gh_inst IS NOT NULL", g.id)).slice(0, 45);
    const jwt = await appJwt(app);
    const some: string[] = [];
    let checked = 0;
    for (const r of rows) {
      const res = await fetch(`${GH_API}/app/installations/${r.gh_inst}`, { headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "User-Agent": "classbot" } }).catch(() => null);
      if (!res || !res.ok) continue;
      const sel = String(((await res.json().catch(() => ({}))) as any).repository_selection || "");
      checked++;
      if (sel && sel !== r.gh_sel) await run(env, "UPDATE players SET gh_sel = ? WHERE gh_inst = ?", sel, r.gh_inst);
      if (sel === "selected") some.push(r.name || r.github_login);
    }
    return ok({ checked, some });
  }
  if (path === "/github/report" && method === "POST") {
    const g = await guild();
    if (body.kind === "weekly") await sendWeekly(env, g); else await sendDaily(env, g);
    return ok({ ok: true });
  }
  if (path === "/github/unlink" && method === "POST") {
    const g = await guild();
    await run(env, "UPDATE players SET github_id = NULL, github_login = NULL, gh_inst = NULL WHERE guild_id = ? AND discord_id = ?", g.id, String(body.discord_id || ""));
    return ok({ ok: true });
  }
  if (path === "/github/import" && method === "POST") {
    // from the Watcher's data read through the Cloudflare API (sent by the dashboard), or from the WATCHER_KV binding
    const gg = await guild();
    if (!(body.data && typeof body.data === "object") && !env.WATCHER_KV) bad("Give the Watcher's Cloudflare account, namespace and token first.");
    const out = await importWatcher(env, gg, body.data && typeof body.data === "object" ? memoryKv(body.data) : env.WATCHER_KV);
    await markWatcherImport(env, gg.id, { at: now(), by: "you", ...out });
    return ok(out);
  }
  if (path === "/github/watcher/keys" && method === "POST") {
    await guild();
    try { return ok(await watcherKeys(body.account, body.namespace, body.token)); } catch (e) { if (e instanceof WatcherError) bad(e.message); throw e; }
  }
  if (path === "/github/watcher/values" && method === "POST") {
    await guild();
    try { return ok({ values: await watcherValues(body.account, body.namespace, body.token, Array.isArray(body.keys) ? body.keys.map(String) : []) }); } catch (e) { if (e instanceof WatcherError) bad(e.message); throw e; }
  }

  // ------------------------------------------------------------ assessments
  if (path === "/assessments" && method === "GET") {
    const g = await guild();
    await syncLibrary(env, g).catch(() => null);   // the shared library's assessments come in first
    const rows = await all<AssessRow & { takers: number; done: number; avg: number | null; locked: number }>(env,
      `SELECT a.*, (SELECT COUNT(*) FROM assessment_takers t WHERE t.assessment_id = a.id) AS takers,
              (SELECT COUNT(*) FROM assessment_takers t WHERE t.assessment_id = a.id AND t.status IN ('submitted', 'graded')) AS done,
              (SELECT COUNT(*) FROM assessment_takers t WHERE t.assessment_id = a.id AND t.status = 'locked') AS locked,
              (SELECT ROUND(AVG(score)) FROM assessment_takers t WHERE t.assessment_id = a.id AND t.status = 'graded') AS avg
         FROM assessments a WHERE a.guild_id = ? ORDER BY a.id DESC LIMIT 100`, g.id);
    return ok({ items: rows.map(({ questions, ...a }) => ({ ...a, n: (() => { try { return JSON.parse(questions).length; } catch { return 0; } })(), settings: settingsOf(a as any) })) });
  }
  if (path === "/assessments/generate" && method === "POST") {
    const g = await guild();
    const p = await programOf(env, g);
    let context = String(body.context || "");
    let scope: string[] = [];
    if (body.brief_id) { const b = await getBrief(env, g, Number(body.brief_id)); if (b) { context = simplonText(b.data, p).slice(0, 3000); scope = (b.data.competencies ?? []).map(String); } }
    // questions on what a student still has to consolidate (their weak skills, competencies not validated)
    let comps: string[] = Array.isArray(body.comps) ? body.comps.map(String) : [];
    let skills: string[] = Array.isArray(body.skills) ? body.skills.map(String) : [];
    if (body.for_student) {
      const uid = String(body.for_student);
      const cells = (await classCompetencies(env, g)).filter((c) => c.discord_id === uid && !c.best && c.fails);
      comps = [...comps, ...cells.map((c) => `${c.code}N1`)];
      const ev = await all<{ skill: string; n: number }>(env, "SELECT skill, COUNT(*) AS n FROM skill_evidence WHERE guild_id = ? AND discord_id = ? AND ok = 0 GROUP BY skill ORDER BY n DESC LIMIT 4", g.id, uid);
      skills = [...skills, ...ev.map((r) => r.skill)];
    }
    const mix = { code: Number(body.mix?.code ?? 50), explain: Number(body.mix?.explain ?? 20), mcq: Number(body.mix?.mcq ?? 30) };
    const qs = await generateQuestions(env, { topic: String(body.topic || "").slice(0, 400), count: Number(body.count) || 10, mix, lang: body.lang === "en" ? "en" : "fr",
      codeLang: String(body.codeLang || "javascript"), techs: Array.isArray(body.techs) ? body.techs.map((x: unknown) => String(x).slice(0, 40)).filter(Boolean).slice(0, 8) : [], level: Math.max(1, Math.min(3, Number(body.level) || 1)), comps: comps.map((c) => { const pc = parseComp(c); return pc ? `${compLabel(pc.code)}${pc.level ? "N" + pc.level : ""} (${compName(p, pc.code)})` : c; }), skills, context, referential: p.referential.map((c) => ({ code: c.code, name: c.name })), scope });
    return ok({ questions: qs });
  }
  if (path === "/assessments/import" && method === "POST") {
    // a link shared by another teacher (this ClassBot or another one): preview first, then a draft copy
    const g = await guild();
    try {
      const r: any = await importShared(env, g, String(body.url || ""), !!body.import);
      if (r.id) await libAssessment(env, g, r.id);
      return ok(r);
    } catch (e) { if (e instanceof ShareError) bad(e.message); throw e; }
  }
  if (path === "/assessments" && method === "POST") {
    const g = await guild();
    const id = await saveAssessment(env, g, null, body);
    await libAssessment(env, g, id);
    return ok(await assessView(env, g, id));
  }
  if ((m = path.match(/^\/assessments\/(\d+)(?:\/(invite|unlock|grade|close|reopen|results|links|remove|share|link|options))?$/))) {
    const g = await guild();
    const id = Number(m[1]);
    const a = await one<AssessRow>(env, "SELECT * FROM assessments WHERE id = ? AND guild_id = ?", id, g.id);
    if (!a) throw new ApiError(404, "This assessment doesn't exist anymore.");
    const act = m[2];
    if (!act && method === "GET") { await syncLibrary(env, g).catch(() => null); return ok(await assessView(env, g, id)); }
    if (!act && method === "PUT") { await saveAssessment(env, g, id, body); await libAssessment(env, g, id); return ok(await assessView(env, g, id)); }
    if (!act && method === "DELETE") {
      await libAssessment(env, g, id, true);   // shared: removed for the other classes too (their papers stay with them)
      await env.DB.batch([env.DB.prepare("DELETE FROM assessment_takers WHERE assessment_id = ?").bind(id), env.DB.prepare("DELETE FROM assessments WHERE id = ?").bind(id)]);
      return ok({ ok: true });
    }
    if (act === "invite") {
      const r = await invite(env, g, id, body.students === "all" ? "all" : (Array.isArray(body.students) ? body.students : []), { days: Number(body.days) || 7, send: body.send !== false });
      return ok({ ...r, ...(await assessView(env, g, id)) });
    }
    if (act === "options" && method === "POST") { await saveOptions(env, g, id, body); await libAssessment(env, g, id); return ok(await assessView(env, g, id)); }
    if (act === "link" && method === "POST") {
      // linked to a brief (from the debrief): its results count in that brief's debriefs
      const bid = Number(body.brief_id) || null;
      if (bid && !(await one(env, "SELECT 1 AS x FROM briefs WHERE id = ? AND guild_id = ?", bid, g.id))) throw new ApiError(404, "This brief doesn't exist anymore.");
      await run(env, "UPDATE assessments SET brief_id = ? WHERE id = ?", bid, id);
      return ok({ ok: true, brief_id: bid });
    }
    if (act === "remove") {
      // take back an invitation (their link stops working); a paper already handed in stays
      const ids = (Array.isArray(body.takers) ? body.takers : [body.taker]).map(Number).filter(Boolean);
      for (const tk of ids) await run(env, "DELETE FROM assessment_takers WHERE id = ? AND assessment_id = ? AND status IN ('invited', 'active', 'locked')", tk, id);
      return ok(await assessView(env, g, id));
    }
    if (act === "unlock") { await letBackIn(env, g, Number(body.taker), Number(body.minutes) || 0); return ok(await assessView(env, g, id)); }
    if (act === "grade" && method === "PUT") { await setGrade(env, g, Number(body.taker), String(body.qid), body); return ok(await assessView(env, g, id)); }
    if (act === "grade" && method === "POST") {
      // the students whose debrief of the linked brief is finalized: their grade doesn't move anymore
      const locked = await finalizedIn(env, a.brief_id);
      const rows = await all<{ id: number; discord_id: string; status: string; grades: string | null }>(env,
        "SELECT id, discord_id, status, grades FROM assessment_takers WHERE assessment_id = ? AND status IN ('submitted', 'graded') ORDER BY id", id);
      if (body.taker) {
        const t = rows.find((x) => x.id === Number(body.taker));
        if (!t) bad("This paper isn't handed in.");
        if (locked.has(t!.discord_id)) bad("This student's debrief is finalized: reopen it before grading again.");
        const r = await gradeTaker(env, t!.id, false);
        if (!r.ok) bad(`The AI couldn't grade it: ${r.error}. Try again in a minute.`);
        return ok(await assessView(env, g, id));
      }
      // in lots: the papers still to grade (or, asked, every paper again), never the finalized ones; it stops at the
      // first AI failure (its limit reached): the next run continues from there
      const after = Number(body.after) || 0;   // every paper again: in lots, after the last one done
      const todo = rows.filter((t) => !locked.has(t.discord_id) && t.id > after && (body.all ? true : needsGrading(t)));
      const lot = todo.slice(0, Math.max(1, Math.min(5, Number(body.lot) || 3)));
      let graded = 0, error = "";
      for (const t of lot) {
        const r = await gradeTaker(env, t.id, false);
        if (!r.ok && /every question/.test(r.error || "")) continue;   // the AI forgot a question: this paper stays to grade, the next ones go on
        if (!r.ok) { error = r.error || "The AI didn't answer"; break; }
        graded++;
      }
      // the AI's per-minute limit (not the daily one): the page waits that long and goes on by itself
      const retryIn = error ? perMinuteWait(error) : 0;
      return ok({ ...(await assessView(env, g, id)), batch: { graded, left: todo.length - graded, error, retryIn, last: graded ? lot[graded - 1].id : after, skipped: rows.filter((t) => locked.has(t.discord_id)).length } });
    }
    if (act === "close") { await run(env, "UPDATE assessments SET status = 'closed' WHERE id = ?", id); return ok(await assessView(env, g, id)); }
    if (act === "reopen") { await run(env, "UPDATE assessments SET status = 'open', closes_at = MAX(COALESCE(closes_at, 0), ?) WHERE id = ?", now() + 86400, id); return ok(await assessView(env, g, id)); }
    if (act === "results") return ok({ sent: await sendResults(env, g, a) });
    if (act === "links") return ok({ links: await takerLinks(env, a) });
    if (act === "share") return ok({ url: method === "DELETE" ? await renewShareLink(env, id) : await shareLink(env, id) });
  }
  return null;
}

// ------------------------------------------------------------ views
/** The students whose debrief of this brief is finalized (alone, or in a finalized squad). */
async function finalizedIn(env: Env, briefId: number | null): Promise<Set<string>> {
  const out = new Set<string>();
  if (!briefId) return out;
  const rows = await all<{ who: string }>(env, "SELECT who FROM brief_reviews WHERE brief_id = ? AND status = 'final'", briefId).catch(() => []);
  if (!rows.length) return out;
  const b = await one<{ squads: string | null }>(env, "SELECT squads FROM briefs WHERE id = ?", briefId);
  const squads = cleanSquads(b?.squads || "[]");
  for (const r of rows) {
    if (r.who.startsWith("u:")) out.add(r.who.slice(2));
    else for (const m of squads.find((x) => `s:${x.id}` === r.who)?.members ?? []) out.add(String(m));
  }
  return out;
}

async function briefView(env: Env, g: GuildRow, id: number) {
  const b = await getBrief(env, g, id);
  if (!b) throw new ApiError(404, "This brief doesn't exist anymore.");
  const p = await programOf(env, g);
  const w = p.weeks.find((x) => x.n === b.week) ?? null;
  const row = b as any;
  let grid: any = null;
  try { grid = row.grid ? JSON.parse(row.grid) : null; } catch { grid = null; }
  const squads = cleanSquads(row.squads || "[]");
  const students = await all<{ discord_id: string; name: string | null; github_login: string | null }>(env, "SELECT discord_id, name, github_login FROM players WHERE guild_id = ? ORDER BY name", g.id);
  const handins = await all<{ who: string; repo: string; plan: string | null; at: number; by: string | null }>(env, "SELECT who, repo, plan, at, by FROM brief_handins WHERE brief_id = ?", id);
  const reviews = await all<{ who: string; status: string; final_at: number | null; sent_at: number | null; record: string }>(env, "SELECT who, status, final_at, sent_at, record FROM brief_reviews WHERE brief_id = ?", id);
  const push = b.status === "assigned" ? await pushStatus(env, g, b as any) : new Map();
  const reviewOf = (who: string) => {
    const r = reviews.find((x) => x.who === who);
    if (!r) return null;
    let pct: number | null = null, ok: string[] = [], ko: string[] = [];
    try {
      const rec = JSON.parse(r.record);
      const st = statesOf(rec);
      if (st) {
        const ex = rec.result?.exigences ?? [];
        const main = ex.map((e: any, i: number) => [e, st.ex[i]]).filter(([e]: any) => !/bonus/i.test(String(e.type || "")));
        pct = main.length ? Math.round((main.filter(([, v]: any) => v).length / main.length) * 100) : null;
        ok = Object.entries(st.co).filter(([, v]) => v).map(([c]) => c);
        ko = Object.entries(st.co).filter(([, v]) => !v).map(([c]) => c);
      }
    } catch { /* old record */ }
    return { status: r.status, final_at: r.final_at, sent_at: r.sent_at, pct, ok, ko };
  };
  return {
    brief: { ...b, grid: undefined, squads: undefined, steps: undefined }, grid, gridText: grid ? gridToText(grid) : "", squads, kind: row.kind === "squad" ? "squad" : "solo", repo_hint: row.repo_hint ?? "",
    steps: stepsOf(row.steps), stepsText: stepsToText(stepsOf(row.steps)),
    fields: simplonFields(b.data, p), text: simplonText(b.data, p), checks: briefChecks(b.data, w), week: w,
    referential: p.referential.map((c) => ({ ...c, label: compLabel(c.code) })), levels: p.levels,
    students: students.map((s) => ({ ...s, push: push.get(s.discord_id) ?? null, handin: handins.find((h) => h.who === `u:${s.discord_id}`) ?? null, review: reviewOf(`u:${s.discord_id}`), squad: squadOf(squads, s.discord_id)?.id ?? null })),
    squadRows: squads.map((s) => ({ ...s, handin: handins.find((h) => h.who === `s:${s.id}`) ?? null, review: reviewOf(`s:${s.id}`) })),
    sections: SECTIONS,
    // the assessments linked to this brief (for every student's debrief), and where the class is with them
    assessments: await all<{ id: number; title: string; status: string; takers: number; done: number; graded: number }>(env,
      `SELECT a.id, a.title, a.status, (SELECT COUNT(*) FROM assessment_takers t WHERE t.assessment_id = a.id) AS takers,
              (SELECT COUNT(*) FROM assessment_takers t WHERE t.assessment_id = a.id AND t.status IN ('submitted', 'graded')) AS done,
              (SELECT COUNT(*) FROM assessment_takers t WHERE t.assessment_id = a.id AND t.status = 'graded') AS graded
         FROM assessments a WHERE a.brief_id = ? AND a.guild_id = ? ORDER BY a.id`, id, g.id).catch(() => []),
  };
}

async function reviewView(env: Env, g: GuildRow, briefId: number, who: string) {
  const steps = stepsOf((await one<{ steps: string | null }>(env, "SELECT steps FROM briefs WHERE id = ?", briefId))?.steps);
  const stepRes = steps.length ? await stepRecs(env, briefId, who) : {};
  const r = await getReview(env, briefId, who);
  if (!r) return { review: null, status: null, steps, stepRecs: stepRes, assess: await briefAssessments(env, briefId, who) };
  const states = statesOf(r.rec);
  return { review: r.rec, states, status: r.status, final_at: r.final_at, sent_at: r.sent_at, steps, stepRecs: stepRes, memberLevels: r.rec.squad ? memberLevels(r.rec) : null };
}

async function assessView(env: Env, g: GuildRow, id: number) {
  const a = (await one<AssessRow>(env, "SELECT * FROM assessments WHERE id = ? AND guild_id = ?", id, g.id))!;
  const qs = questionsOf(a);
  const takers = await all<TakerRow & { name: string | null }>(env,
    `SELECT t.*, p.name FROM assessment_takers t LEFT JOIN players p ON p.guild_id = t.guild_id AND p.discord_id = t.discord_id WHERE t.assessment_id = ? ORDER BY p.name`, id);
  const students = await all<{ discord_id: string; name: string | null }>(env, "SELECT discord_id, name FROM players WHERE guild_id = ? ORDER BY name", g.id);
  return {
    assessment: { ...a, questions: qs, settings: settingsOf(a) }, students,
    takers: takers.map((tk) => {
      let answers: any = {}, grades: any = {}, events: any[] = [];
      try { answers = JSON.parse(tk.answers || "{}"); } catch { answers = {}; }
      try { grades = JSON.parse(tk.grades || "{}"); } catch { grades = {}; }
      try { events = JSON.parse(tk.events || "[]"); } catch { events = []; }
      // a paper with a question not graded yet (old ones: "Correction automatique indisponible") shows as "to grade"
      return { id: tk.id, discord_id: tk.discord_id, name: tk.name, status: tk.status === "graded" && needsGrading(tk) ? "submitted" : tk.status, pos: tk.pos, answered: Object.values(answers).filter((v: any) => (Array.isArray(v) ? v.length : String(v ?? "").trim())).length,
        started_at: tk.started_at, deadline: tk.deadline, submitted_at: tk.submitted_at, locked_at: tk.locked_at, lock_reason: tk.lock_reason, resume_ok: tk.resume_ok, unlocks: tk.unlocks,
        score: tk.score, summary: tk.summary, answers, grades, events, order: paperFor(qs, tk.seed, settingsOf(a).shuffle).map((q: any) => q.id) };
    }),
  };
}
