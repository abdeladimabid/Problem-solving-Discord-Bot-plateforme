// JSON API behind the teacher dashboard.
import { BlockError, blockVars, classBlocks, getBlocks, removeBlock, setBlock, typeName } from "../shared/practiceblock.ts";
import { SeasonError, cancelSeasonPlan, planSeason, seasonPlan, startSeason } from "../shared/season.ts";
import { IntranetError, intranetAutoLink, intranetClassOf, intranetClassrooms, intranetLogin, intranetLogout, intranetMatchView, intranetPing, intranetSetup, sendSquads, setIntranetClass, setIntranetLink, squadsPreview , intranetPhoto, intranetPhotos } from "../shared/intranet.ts";
import type { ChallengeRow, ContestRow, Ctx, D1Stmt, Difficulty, Env, GuildRow } from "../shared/types.ts";
import { addPoints, aiBudgetLeft, challengeCoins, all, confirmHackerRank, getGuild, now, one, playerStats, run } from "../shared/db.ts";
import { DEFAULT_SCORING, SCORE_KINDS, dayKey, levelInfo, pointsFor, scoringOf, titleKey } from "../shared/game.ts";
import { t } from "../shared/i18n.ts";
import { btn, dapi, dm, linkBtn, mention, pingUsers, row, send, ts } from "../shared/discord.ts";
import { forClass } from "../shared/aictx.ts";
import { AiKeyError, addProvider, classAiView, copyClassAi, removeProvider, testSaved, updateClassAi } from "../shared/aikeys.ts";
import { aiHealth, aiProviderLabel, chatJson, generateQuick, generateWrite, whyWriteFailed } from "../shared/ai.ts";
import { bankExamples, guildLangs, loadTests, pickGuildLang, regrade, saveGeneratedWrite } from "../shared/challenges.ts";
import { stopContest, trackContest, trackingEmbed } from "../shared/contests.ts";
import { fetchChallenge, hackerrankHealth, parseChallengeSlug } from "../shared/hackerrank.ts";
import { RunnerUnavailable, runPythonTests, runnerHealth } from "../shared/runner.ts";
import { arenaChannel } from "../shared/arena.ts";
import { MIGRATIONS } from "../shared/schema.ts";
import { BOSS_BANK } from "../shared/bossbank.ts";
import { integrityOf } from "../shared/integrity.ts";
import { createSession, endSession, sessionResults } from "../shared/sessions.ts";
import { ROLE_DEFS, autoRolesOf, setAutoRoles, syncAutoRoles, wantedHolders } from "../shared/roles.ts";
import { SKILLS, setSkills, skillName, studentProfile } from "../shared/skills.ts";
import { classLangs, defaultLessons, defaultSteps, pathCfg, pathCustom, pathProgress, savePath } from "../shared/path.ts";
import { GenError, bankCoverage, challengeForSkill, writeLesson } from "../shared/aigen.ts";
import type { GenKind } from "../shared/aigen.ts";
import { leagueOf as leagueCfgOf } from "../shared/league.ts";
import { TRACKS, setTrack, skillFitsTrack, trackOf } from "../shared/tracks.ts";
import { challengeMistakes, classHeatmap, difficultyCheck, practiceSet, teacherSummary } from "../shared/insight.ts";
import { examGrades } from "../shared/sessions.ts";
import { pendingStudentChallenges, reviewStudentChallenge } from "../shared/create.ts";
import { focusSkills } from "../shared/plan.ts";
import { PlanError, aiPlanNote, gapsOf, niveaux, planView, savePlan } from "../shared/actionplan.ts";
import { ChatError, chatCheck, chatFeedback, classChat } from "../shared/classchat.ts";
import { WorkPlanError, createPlan, deletePlan, diagnose, plansSummary, reviewStep, savePlanEdits, sendPlan, stepAi, planView as workPlanView } from "../shared/workplan.ts";
import { classReport, reportCsv } from "../shared/classreport.ts";
import { studentSprints } from "../shared/sprints.ts";
import { staffIds, withoutStaff } from "../shared/staff.ts";
import type { SessionRow } from "../shared/sessions.ts";
import { DAILY_KINDS, dailyConfig, dailyOverview, pickDaily, postDaily } from "../shared/daily.ts";
import type { DailyKind } from "../shared/daily.ts";
import { levelsOf } from "../shared/actsignup.ts";
import { LibraryError, createLibrary, joinLibrary, leaveLibrary, libCfg, libRemoveTemplate, libStatus, libTemplate, libTemplates, syncLibrary } from "../shared/library.ts";
import { QUIZ_KINDS, cleanLore, createBoss, createBounty, createQuiz, quizEnd, quizNext, quizReveal, quizStandings, sweepEvents } from "../shared/events.ts";
import type { QuizRow } from "../shared/events.ts";
import { SHOP, ShopError, activeTitle, changeCoins, clearCosmetic, cosmeticsOf, saveShop, settlePurchase, shopCfg, shopItems } from "../shared/shop.ts";
import { HandError, handQueue, updateHand } from "../shared/hands.ts";
import { FaqError, draftAnswer, faqList, saveFaq } from "../shared/faq.ts";
import { GAME_KINDS, GameError, RELAY_TASKS, clearPlayers, postJoin, removePlayer, setRoyaleQuestions, setSquads, cleanSettings as cleanGameSettings, createGame, fromAssessment, getGame, joinUrl as gameJoinUrl, listGames, liveGame, royaleQuestions, hostTvUrl as gameTvUrl, tvView as gameTvView } from "../shared/games.ts";
import { SQL_CASES } from "../shared/sqlcases.ts";
import { RELAY_LANGS, buildCase, generateCase, generateTask, starterFor } from "../shared/gamecontent.ts";
import { BANK_TOPICS, BattleError, QKINDS, cleanSettings, createBattle, generateQuestions as generateBattleQuestions, getBattle, judgeUrl, listBattles, liveBattle, tvUrl, tvView, updateBattle } from "../shared/battle.ts";
import { qrSvg } from "../shared/qr.ts";
import { AiSettingsError, aiSettingsView, saveAiSettings } from "../shared/appsettings.ts";
import { SquadError, createSquadSet, deleteSquadSet, notifySquads, pendingBuddies, sentAt, squadSets, updateSquadSet } from "../shared/squads.ts";
import { LeagueError, addRemote, compareClasses, leagueLink, leagueOf, leagueTable, refreshRemotes, remoteRows, removeRemote, setLeague, weekStart } from "../shared/league.ts";
import { certUrl, sendCertificates } from "../shared/share.ts";
import { boardHidden, inClass, setTeacherRank, standings, teacherRank } from "../shared/db.ts";
import { notifyCfg, notifyTest, saveNotifyCfg } from "../shared/notify.ts";
import { workOn, workOnNote } from "../shared/workon.ts";
import { learningApi } from "./learnapi.ts";
import { activitiesApi } from "./actapi.ts";
import { vscodeApi } from "./vscapi.ts";
import { quietWriters } from "../shared/vscodedb.ts";
import { TECHS, programOf } from "../shared/program.ts";
import { activityOf } from "../shared/github.ts";
import { competencyMap, studentBriefs } from "../shared/learning.ts";
import { SheetError, fillSheet, markSheetDirty, namesView, saveKey, saveNames, saveSheet, sheetView } from "../shared/gsheet.ts";

class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}
const ok = (data: unknown) => Response.json(data);
/** A chat's work sent as it goes: one JSON line per step, then {"done": result} or {"error": "…"}. */
function chatStream(ctx: Ctx, run: (line: (o: any) => void) => Promise<unknown>): Response {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter(), enc = new TextEncoder();
  const line = (o: unknown) => { w.write(enc.encode(JSON.stringify(o) + "\n")).catch(() => {}); };
  ctx.waitUntil((async () => {
    try { line({ done: await run(line) }); }
    catch (e) { line({ error: e instanceof ChatError ? e.message : "The chat failed. Try again in a moment." }); if (!(e instanceof ChatError)) console.error("chat", e); }
    finally { w.close().catch(() => {}); }
  })());
  return new Response(readable, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
const DIFFS = ["easy", "medium", "hard"];
const KINDS = ["code", "write", "mcq", "output", "bug", "complexity"];

export async function handleApi(request: Request, env: Env, ctx: Ctx, user: { email: string; mode?: string }): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "");
  const method = request.method;
  // a DELETE may carry its details in a JSON body too (the league's ✕ did, and was ignored)
  const body: any = method === "GET" ? {} : await request.json().catch(() => ({}));
  const gid = url.searchParams.get("g") ?? body.g;
  if (gid) env = forClass(env, gid);   // the AI uses this class's keys (Settings → AI)
  const guild = async () => {
    if (!gid) throw new HttpError(400, "missing server (g)");
    const g = await one<GuildRow>(env, "SELECT * FROM guilds WHERE id = ?", gid);
    if (!g) throw new HttpError(404, "unknown server");
    return g;
  };
  const id = (i: number) => Number(path.split("/")[i]);

  try {
    // ------------------------------------------------------------ general
    if (path === "/me") return ok({ email: user.email, mode: user.mode ?? "access", publicUrl: env.PUBLIC_URL?.replace(/\/$/, "") ?? null });
    if (path === "/guilds") return ok(await guilds(env));
    if (path === "/overview") return ok(await overview(env, await guild()));
    if (path === "/discord") return ok(await discordInfo(env, await guild()));
    if (path === "/export.csv") return exportCsv(env, await guild());
    if (path === "/diagnostics") return ok(await diagnostics(env, await guild()));
    // programmes, briefs, debriefs, GitHub, assessments
    const learn = await learningApi(env, ctx, path, method, body, url, guild);
    if (learn) return learn;
    // the daily veilles and live codings (Activités)
    const acts = await activitiesApi(env, path, method, body, url, guild);
    if (acts) return acts;
    // « Suivi VS Code »: the learners' coding time (WakaTime extension)
    const vsc = await vscodeApi(env, ctx, path, method, body, url, guild);
    if (vsc) return vsc;

    // -------------------------------------------------------------- daily
    if (path === "/daily" && method === "GET") return ok(await dailyOverview(env, await guild()));
    if (path === "/daily/settings" && method === "PUT") return ok(await dailySettings(env, await guild(), body));
    if (path === "/daily/pins" && method === "POST") {
      const g = await guild();
      const day = String(body.day ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < dayKey(now())) throw new HttpError(400, "pick today or a future date");
      const c = await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ? AND (guild_id IS NULL OR guild_id = ?) AND status != 'archived'", Number(body.challenge_id), g.id);
      if (!c) throw new HttpError(404, "unknown challenge");
      await run(env, "INSERT OR REPLACE INTO daily_pins (guild_id, day, challenge_id, created_at) VALUES (?, ?, ?, ?)", g.id, day, c.id, now());
      return ok(await dailyOverview(env, g));
    }
    const pinDel = path.match(/^\/daily\/pins\/(\d{4}-\d{2}-\d{2})$/);
    if (pinDel && method === "DELETE") {
      const g = await guild();
      await run(env, "DELETE FROM daily_pins WHERE guild_id = ? AND day = ?", g.id, pinDel[1]);
      return ok(await dailyOverview(env, g));
    }
    if (path === "/daily/post" && method === "POST") {
      const g = await guild();
      let c: ChallengeRow | null = null;
      if (body.challenge_id) c = await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ? AND (guild_id IS NULL OR guild_id = ?) AND status != 'archived'", Number(body.challenge_id), g.id);
      else c = await pickDaily(env, g, (DIFFS.includes(body.difficulty) ? body.difficulty : "medium") as Difficulty,
        (DAILY_KINDS.includes(body.kind) ? body.kind : "quick") as DailyKind, false, Array.isArray(body.langs) ? body.langs : undefined);
      if (!c) throw new HttpError(404, "no challenge left for that choice: pick another type, level or language");
      const r = await postDaily(env, g, c, body.channel_id || null);
      if (!r.channel) throw new HttpError(400, "no channel: pick one for the daily challenge first");
      return ok({ ...(await dailyOverview(env, await getGuild(env, g.id))), postedNow: c.title });
    }

    // ---------------------------------------------------------- integrity
    if (path === "/integrity" && method === "GET") return ok(await integrityList(env, await guild(), url.searchParams.get("all") === "1"));
    const logM = path.match(/^\/attempts\/(\d+)\/log$/);
    if (logM && method === "GET") return ok(await attemptLog(env, await guild(), Number(logM[1])));
    const revM = path.match(/^\/attempts\/(\d+)\/integrity$/);
    if (revM && method === "POST") return ok(await reviewIntegrity(env, await guild(), Number(revM[1]), body, ctx));

    // ---------------------------------------------------- skills & coaching
    if (path === "/skills/class" && method === "GET") return ok({ ...(await classHeatmap(env, await guild())), defs: SKILLS });
    if (path === "/skills/practice-set" && method === "POST") return ok(await sendPracticeSet(env, await guild(), body, ctx));
    if (path === "/summary" && method === "GET") return ok(await teacherSummary(env, await guild()));
    if (path === "/difficulty" && method === "GET") return ok(await difficultyCheck(env, await guild()));
    if (path === "/path" && method === "GET") {
      const g = await guild();
      return ok(await pathView(env, g));
    }
    if (path === "/path" && method === "PUT") {
      const g = await guild();
      await savePath(env, g, { steps: body.steps, lessons: body.lessons, reset: !!body.reset });
      const g2 = await getGuild(env, g.id);
      return ok(await pathView(env, g2));
    }
    const misM = path.match(/^\/challenges\/(\d+)\/mistakes$/);
    if (misM && method === "GET") {
      const g = await guild();
      const c = await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ? AND (guild_id IS NULL OR guild_id = ?)", Number(misM[1]), g.id);
      if (!c) throw new HttpError(404, "unknown challenge");
      return ok(await challengeMistakes(env, g, c));
    }
    const difM = path.match(/^\/challenges\/(\d+)\/difficulty$/);
    if (difM && method === "POST") {
      if (!["easy", "medium", "hard"].includes(body.difficulty)) throw new HttpError(400, "difficulty?");
      await run(env, "UPDATE challenges SET difficulty = ? WHERE id = ? AND (guild_id IS NULL OR guild_id = ?)", body.difficulty, Number(difM[1]), (await guild()).id);
      return ok({ ok: true });
    }
    if (path === "/student-challenges" && method === "GET") return ok(await pendingStudentChallenges(env, await guild()));
    const srvM = path.match(/^\/student-challenges\/(\d+)$/);
    if (srvM && method === "POST") {
      const r = await reviewStudentChallenge(env, await guild(), Number(srvM[1]), !!body.approve, String(body.reason ?? "").slice(0, 200));
      if (!r) throw new HttpError(404, "unknown challenge");
      return ok(r);
    }
    const csvM = path.match(/^\/sessions\/(\d+)\/grades\.csv$/);
    if (csvM && method === "GET") return examCsv(env, await guild(), Number(csvM[1]));

    // --------------------------------------------------------- class events
    if (path === "/events" && method === "GET") return ok(await eventsState(env, await guild()));
    if (path === "/quizzes" && method === "POST") {
      const g = await guild();
      // a quiz from the shared library: its questions become this class's challenges (the same ones are reused)
      if (body.template) {
        const tpl = (await libTemplates(env, g.id, "quiz")).find((x) => x.key === String(body.template));
        if (!tpl) throw new HttpError(404, "This quiz isn't in the shared library anymore.");
        body.challenge_ids = await quizChallengesFor(env, g, tpl.data?.questions || [], user.email);
        body.title = body.title || tpl.title;
        body.seconds = body.seconds || tpl.data?.seconds;
      }
      const ids = (Array.isArray(body.challenge_ids) ? body.challenge_ids : []).map(Number).filter((x: number) => x > 0).slice(0, 30);
      if (ids.length < 1) throw new HttpError(400, "choose at least one question");
      const found = await all<{ id: number; kind: string; choices: string | null }>(env, `SELECT id, kind, choices FROM challenges WHERE id IN (${ids.map(() => "?").join(", ")}) AND (guild_id IS NULL OR guild_id = ?) AND status != 'archived'`, ...ids, g.id);
      if (found.length !== new Set(ids).size || found.some((c) => !QUIZ_KINDS.includes(c.kind) || !c.choices)) throw new HttpError(400, "a live quiz only takes multiple-choice questions (MCQ, find the bug, Big-O)");
      if (await one(env, "SELECT 1 FROM quizzes WHERE guild_id = ? AND status != 'done'", g.id)) throw new HttpError(409, "a quiz is already running, end it first");
      const seconds = Math.min(120, Math.max(10, Math.round(Number(body.seconds) || 20)));
      const q = await createQuiz(env, g, { title: String(body.title ?? "").trim().slice(0, 80) || "Live quiz", questions: ids, seconds, channelId: body.channel_id || null, givePoints: body.give_points !== false });
      if (!q.channel_id) throw new HttpError(400, "no arena channel: run /teacher setup in Discord first");
      if (!body.template) await libTemplate(env, g, "quiz", q.title, { seconds, questions: await quizContentOf(env, ids) }).catch(() => null);
      return ok(q);
    }
    const qzM = path.match(/^\/quizzes\/(\d+)(?:\/(next|reveal|end))?$/);
    if (qzM) {
      const g = await guild();
      const q = await one<QuizRow>(env, "SELECT * FROM quizzes WHERE id = ? AND guild_id = ?", Number(qzM[1]), g.id);
      if (!q) throw new HttpError(404, "unknown quiz");
      if (method === "POST" && qzM[2] === "next") { if (q.status === "done") throw new HttpError(409, "quiz is over"); await quizNext(env, g, q); }
      else if (method === "POST" && qzM[2] === "reveal") await quizReveal(env, g, q);
      else if (method === "POST" && qzM[2] === "end") await quizEnd(env, g, q);
      else if (method !== "GET" || qzM[2]) throw new HttpError(405, "method not allowed");
      return ok(await quizLive(env, Number(qzM[1])));
    }
    if (path === "/bosses" && method === "POST") {
      const g = await guild();
      const n = (v: unknown, lo: number, hi: number, d: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || d)));
      try {
        return ok(await createBoss(env, g, { challengeId: Number(body.challenge_id), name: String(body.name ?? "").trim().slice(0, 60) || "The Bug King", hp: n(body.hp, 40, 5000, 200), hours: n(body.hours, 1, 336, 48), reward: n(body.reward, 0, 200, 30), coins: n(body.coins, 0, 500, 20), channelId: body.channel_id || null, lore: body.lore }));
      } catch (e: any) { throw new HttpError(400, e.message); }
    }
    if (path === "/bosses/bank" && method === "GET") {
      const L = (await guild()).lang === "fr" ? "fr" : "en";
      return ok({ bosses: BOSS_BANK.map((b) => ({ id: b.id, emoji: b.emoji, name: b.name[L], title: b.title[L], skill: b.skill, skill_name: skillName(b.skill, L), difficulty: b.difficulty, intro: b.lore[L].intro })) });
    }
    const bankM = path.match(/^\/bosses\/bank\/([a-z0-9-]+)$/);
    if (bankM && method === "POST") {
      const g = await guild();
      const b = BOSS_BANK.find((x) => x.id === bankM[1]);
      if (!b) throw new HttpError(404, "unknown boss");
      return ok(await bankBoss(env, g, b, user.email));
    }
    if (path === "/events/ai" && method === "POST") {
      try { return ok(await eventWithAi(env, await guild(), body, user.email)); }
      catch (e) {
        if (e instanceof RunnerUnavailable) throw new HttpError(503, "The code runner is unreachable right now, so the challenge can't be checked. Try again later.");
        throw e;
      }
    }
    if (path === "/bounties" && method === "POST") {
      const g = await guild();
      const n = (v: unknown, lo: number, hi: number, d: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || d)));
      try {
        return ok(await createBounty(env, g, { challengeId: Number(body.challenge_id), points: n(body.points, 0, 300, 40), coins: n(body.coins, 0, 500, 30), hours: body.hours ? n(body.hours, 1, 720, 24) : null, channelId: body.channel_id || null }));
      } catch (e: any) { throw new HttpError(400, e.message); }
    }
    const btyDel = path.match(/^\/bounties\/(\d+)\/cancel$/);
    if (btyDel && method === "POST") {
      const g = await guild();
      await run(env, "UPDATE bounties SET status = 'expired' WHERE id = ? AND guild_id = ? AND status = 'open'", Number(btyDel[1]), g.id);
      return ok({ ok: true });
    }
    const bossDel = path.match(/^\/bosses\/(\d+)\/cancel$/);
    if (bossDel && method === "POST") {
      const g = await guild();
      await run(env, "UPDATE bosses SET deadline = ? WHERE id = ? AND guild_id = ? AND status = 'active'", now() - 1, Number(bossDel[1]), g.id);
      await sweepEvents(env);
      return ok({ ok: true });
    }

    // ------------------------------------------------------ automatic roles
    if (path === "/roles" && method === "GET") return ok(await rolesState(env, await guild()));
    if (path === "/roles" && method === "PUT") {
      const g = await guild();
      await setAutoRoles(env, g, { on: body.on, off: body.off });
      return ok(await rolesState(env, await getGuild(env, g.id)));
    }
    if (path === "/roles/sync" && method === "POST") {
      const g = await guild();
      await syncAutoRoles(env, g, { budget: 40 });
      return ok(await rolesState(env, await getGuild(env, g.id)));
    }

    // ----------------------------------------------------------- sessions
    if (path === "/sessions" && method === "GET") {
      const g = await guild();
      return ok(await all(env, `SELECT s.*, (SELECT COUNT(DISTINCT discord_id) FROM attempts a WHERE a.origin = 'session' AND a.ref = s.id) AS students,
        (SELECT COUNT(*) FROM attempts a WHERE a.origin = 'session' AND a.ref = s.id AND a.status = 'solved') AS solved FROM sessions s WHERE s.guild_id = ? ORDER BY s.id DESC LIMIT 100`, g.id));
    }
    if (path === "/sessions" && method === "POST") {
      const g = await guild();
      const ids = (Array.isArray(body.challenge_ids) ? body.challenge_ids : []).map(Number).filter((x: number) => x > 0).slice(0, 10);
      if (!ids.length) throw new HttpError(400, "choose at least one challenge");
      const found = await all<{ id: number }>(env, `SELECT id FROM challenges WHERE id IN (${ids.map(() => "?").join(", ")}) AND (guild_id IS NULL OR guild_id = ?) AND status != 'archived'`, ...ids, g.id);
      if (found.length !== ids.length) throw new HttpError(400, "unknown challenge in the list");
      const minutes = Math.min(600, Math.max(5, Math.round(Number(body.minutes) || 60)));
      const title = String(body.title ?? "").trim().slice(0, 80) || "Class session";
      const s = await createSession(env, g, { title, challenges: ids, minutes, teamId: body.team_id ? Number(body.team_id) : null, channelId: body.channel_id || null, mode: body.mode === "exam" ? "exam" : "class" });
      return ok(s);
    }
    const sesM = path.match(/^\/sessions\/(\d+)$/);
    if (sesM && method === "GET") {
      const r = await sessionResults(env, await guild(), Number(sesM[1]));
      if (!r) throw new HttpError(404, "unknown session");
      return ok(r);
    }
    const sesEnd = path.match(/^\/sessions\/(\d+)\/end$/);
    if (sesEnd && method === "POST") {
      const g = await guild();
      const s = await one<SessionRow>(env, "SELECT * FROM sessions WHERE id = ? AND guild_id = ?", Number(sesEnd[1]), g.id);
      if (!s) throw new HttpError(404, "unknown session");
      await endSession(env, s);
      return ok(await sessionResults(env, g, s.id));
    }

    // ------------------------------------------------------------- points
    if (path === "/points/bulk" && method === "POST") return ok(await bulkPoints(env, await guild(), body, ctx));

    // ----------------------------------------------------------- students
    if (path === "/students") {
      const g = await guild();
      const [list, lv] = await Promise.all([students(env, g), niveaux(env, g).catch(() => ({} as Record<string, any>))]);
      return ok(list.map((r) => ({ ...r, niveau: lv[r.discord_id] ?? null })));
    }
    let m = path.match(/^\/students\/(\d+)$/);
    if (m && method === "GET") return ok(await studentDetail(env, await guild(), m[1]));
    // the teacher's name for the student (kept: the Discord nickname no longer replaces it); empty = the Discord name again
    if (m && method === "PUT") {
      const g = await guild();
      const name = String(body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
      const r = await run(env, "UPDATE players SET name = COALESCE(?, name), name_lock = ? WHERE guild_id = ? AND discord_id = ?", name || null, name ? 1 : 0, g.id, m[1]);
      if (!r.meta?.changes) throw new HttpError(404, "This student isn't in the class.");
      return ok({ ok: true, name });
    }
    // remove from the class: the profile and what is only theirs (links, team, brief work, GitHub activity, competencies);
    // the class's past statistics keep their answers, without a name. Using ClassBot again starts a new profile.
    if (m && method === "DELETE") {
      const g = await guild(), id = m[1], who = `u:${id}`;
      const exists = await one(env, "SELECT 1 AS x FROM players WHERE guild_id = ? AND discord_id = ?", g.id, id);
      if (!exists) throw new HttpError(404, "This student isn't in the class.");
      const by = (table: string) => env.DB.prepare(`DELETE FROM ${table} WHERE guild_id = ? AND discord_id = ?`).bind(g.id, id);
      await env.DB.batch([
        ...["team_members", "gh_activity", "gh_log", "gh_summaries", "sprint_reviews", "daily_plans", "weekly_reports", "assessment_takers",
          "competency_results", "skill_evidence", "hands", "purchases", "vsc_days", "vsc_learners"].map(by),
        env.DB.prepare("DELETE FROM rivals WHERE guild_id = ? AND (owner_id = ? OR rival_id = ?)").bind(g.id, id, id),
        env.DB.prepare("DELETE FROM brief_handins WHERE guild_id = ? AND who = ?").bind(g.id, who),
        env.DB.prepare("DELETE FROM brief_reviews WHERE guild_id = ? AND who = ?").bind(g.id, who),
        env.DB.prepare("DELETE FROM players WHERE guild_id = ? AND discord_id = ?").bind(g.id, id),
      ]);
      return ok({ ok: true });
    }
    // 🚫 practice blocks (practiceblock.ts): one student can't practice a type of challenge (some levels, for some days)
    m = path.match(/^\/students\/(\d+)\/blocks$/);
    if (m) {
      const g = await guild(), id = m[1];
      if (method === "GET") return ok({ blocks: await getBlocks(env, g.id, id) });
      if (method === "PUT") {
        let list;
        try { list = await setBlock(env, g.id, id, body); } catch (e) { if (e instanceof BlockError) throw new HttpError(400, e.message); throw e; }
        let dmSent: boolean | null = null;
        if (body.notify) {
          const b = list.find((x) => x.type === body.type)!;
          dmSent = await dm(env, id, { content: t(g.lang, "blk.dm", blockVars(g.lang, b)) }).catch(() => false);
        }
        return ok({ blocks: list, dm: dmSent });
      }
      if (method === "DELETE") {
        const type = url.searchParams.get("type");
        const before = await getBlocks(env, g.id, id);
        const list = await removeBlock(env, g.id, id, type);
        if (body?.notify !== false && type && before.some((b) => b.type === type)) ctx.waitUntil(dm(env, id, { content: t(g.lang, "blk.dm_lifted", { type: typeName(g.lang, type) }) }).catch(() => false));
        return ok({ blocks: list });
      }
    }
    if (path === "/practice-blocks" && method === "GET") return ok({ students: await classBlocks(env, (await guild()).id) });
    m = path.match(/^\/students\/(\d+)\/points$/);
    if (m && method === "POST") {
      const g = await guild();
      const amount = Math.round(Number(body.amount));
      if (!amount || Math.abs(amount) > 10000) throw new HttpError(400, "amount must be a non-zero number");
      await addPoints(env, g, { discordId: m[1], amount, reason: "bonus", note: String(body.reason ?? "").slice(0, 200) });
      if (body.notify && amount > 0) ctx.waitUntil(dm(env, m[1], { content: `🎁 +${amount} pts${body.reason ? ` · ${String(body.reason).slice(0, 200)}` : ""}` }));
      return ok({ ok: true });
    }
    m = path.match(/^\/students\/(\d+)\/workon-note$/);
    if (m && method === "POST") {
      const g = await guild();
      const p = await one<{ name: string | null }>(env, "SELECT name FROM players WHERE guild_id = ? AND discord_id = ?", g.id, m[1]);
      const text = await workOnNote(env, g, m[1], String(body.skill ?? ""), p?.name ?? "");
      if (!text) throw new HttpError(503, "The AI couldn't write the note right now (the AI is used up or unavailable: see Settings → AI; or nothing to say on this skill). Write it yourself below.");
      return ok({ text });
    }
    m = path.match(/^\/students\/(\d+)\/message$/);
    if (m && method === "POST") {
      const g = await guild();
      const text = String(body.text ?? "").trim().slice(0, 1900);
      if (!text) throw new HttpError(400, "Write a message first");
      const sent = await dm(env, m[1], { embeds: [{ title: t(g.lang, "teacher.note_title"), description: text, color: 0x2a78d6 }] });
      if (!sent) throw new HttpError(400, "Discord refused the DM (the student blocks DMs from server members).");
      return ok({ ok: true });
    }
    m = path.match(/^\/students\/(\d+)\/hackerrank$/);
    if (m && method === "POST") {
      const g = await guild();
      if (body.action === "unlink") {
        await run(env, "UPDATE players SET hr_username = NULL, hr_display = NULL, hr_verified = 0, hr_code = NULL WHERE guild_id = ? AND discord_id = ?", g.id, m[1]);
      } else if (!(await confirmHackerRank(env, g.id, m[1]))) throw new HttpError(400, "this student hasn't linked a HackerRank account (/link)");
      return ok({ ok: true });
    }
    m = path.match(/^\/attempts\/(\d+)\/review$/);
    if (m && method === "POST") return ok(await reviewAttempt(env, await guild(), Number(m[1]), !!body.approve));

    // --------------------------------------------------------- challenges
    if (path === "/challenges" && method === "GET") return ok(await challenges(env, await guild()));
    if (path === "/challenges" && method === "POST") return ok(await createChallenge(env, await guild(), body, user.email));
    if (path === "/challenges/import" && method === "POST") return ok(await importChallenge(env, await guild(), body, user.email));
    if (path === "/challenges/generate" && method === "POST") {
      const g = await guild();
      const difficulty = (DIFFS.includes(body.difficulty) ? body.difficulty : "medium") as Difficulty;
      const lang = body.lang === "fr" || body.lang === "en" ? body.lang : g.lang;
      const skill = SKILLS.find((x) => x.key === body.skill);
      if (skill) body.topic = [skill.en, body.topic].filter(Boolean).join(": ");
      try {
        if (body.kind === "write") {
          // checked on the runner, then saved (the tests are part of the problem)
          const w = await generateWrite(env, { difficulty, topic: body.topic || null, lang });
          if (!w) throw new HttpError(503, `The AI couldn't produce a problem that passed its own checks: ${whyWriteFailed()}. Try again.`);
          const c = await saveGeneratedWrite(env, { ...g, lang }, w, difficulty, user.email, "ai");
          if (skill && c) await setSkills(env, c.id, [skill.key]);
          return ok({ saved: true, challenge: c });
        }
        const kind = ["mcq", "complexity", "output", "bug"].includes(body.kind) ? body.kind : null;
        const codeLang = guildLangs({ code_lang: body.code_lang || "" }).includes(body.code_lang) ? body.code_lang : pickGuildLang(g);
        const gen = await generateQuick(env, { difficulty, kind, topic: body.topic || null, lang, codeLang, examples: await bankExamples(env, { ...g, lang }, kind, difficulty, codeLang) });
        if (!gen) throw new HttpError(503, "The AI couldn't produce a checked challenge right now (busy or daily limit reached). Try again.");
        return ok({ ...gen, code_lang: codeLang, skills: skill?.key ?? null });
      } catch (e) {
        if (e instanceof RunnerUnavailable) throw new HttpError(503, "The code runner is unreachable right now: " + e.message);
        throw e;
      }
    }
    m = path.match(/^\/challenges\/(\d+)$/);
    if (m && method === "GET") return ok(await challengeDetail(env, await guild(), Number(m[1])));
    if (m && method === "PUT") return ok(await updateChallenge(env, await guild(), Number(m[1]), body));
    if (m && method === "DELETE") {
      await run(env, "UPDATE challenges SET status = 'archived' WHERE id = ?", Number(m[1]));
      return ok({ ok: true });
    }
    if (path === "/reports") return ok(await reports(env, await guild()));
    if (path === "/reports/resolve" && method === "POST") return ok(await resolveReports(env, await guild(), body));

    // -------------------------------------------------------- plan d'action (the students who need help)
    if (path === "/plan" && method === "GET") { const g = await guild(); return ok(await planView(env, g, await students(env, g))); }
    // a student's plan d'action: a diagnosis, then actions built for them (challenge, code, question, QCM, mini brief)
    if (path === "/wplans" && method === "GET") return ok(await plansSummary(env, await guild(), url.searchParams.get("student") || undefined));
    if (path === "/wplans" && method === "POST") return ok(await createPlan(env, await guild(), String(body.student ?? "")));
    m = path.match(/^\/wplans\/(\d{10,16})(?:\/(diagnose|ai|send|review))?$/);
    if (m) {
      const g = await guild(), pid = Number(m[1]);
      if (!m[2] && method === "GET") return ok(await workPlanView(env, g, pid));
      if (!m[2] && method === "PUT") { await savePlanEdits(env, g, pid, body); return ok(await workPlanView(env, g, pid)); }
      if (!m[2] && method === "DELETE") return ok(await deletePlan(env, g, pid));
      if (m[2] === "diagnose" && method === "POST") { await diagnose(env, g, pid, String(body.ask ?? "")); return ok(await workPlanView(env, g, pid)); }
      if (m[2] === "ai" && method === "POST") return ok(await stepAi(env, g, pid, body));
      if (m[2] === "review" && method === "POST") { await reviewStep(env, g, pid, String(body.step ?? ""), body); return ok(await workPlanView(env, g, pid)); }
      if (m[2] === "send" && method === "POST") {
        if (body.edits) await savePlanEdits(env, g, pid, body.edits);
        const r = await sendPlan(env, g, pid, { dm: (sid, text, link) => dm(env, sid, { content: text, components: [row(linkBtn("Ouvrir mon plan d'action", link, "🧭"))] }) });
        await markSheetDirty(env, g.id);
        return ok({ ...(await workPlanView(env, g, pid)), dm: r.dm });
      }
    }
    m = path.match(/^\/plan\/(\d+)$/);
    if (m && method === "PUT") return ok(await savePlan(env, await guild(), m[1], body));
    m = path.match(/^\/plan\/(\d+)\/gaps$/);
    if (m && method === "GET") return ok(await gapsOf(env, await guild(), m[1]));
    m = path.match(/^\/plan\/(\d+)\/ai$/);
    if (m && method === "POST") {
      const g = await guild();
      const v = await planView(env, g, await students(env, g));
      const row = [...v.plan, ...v.others].find((r) => r.discord_id === m![1]);
      if (!row) throw new HttpError(404, "unknown student");
      return ok(await aiPlanNote(env, g, row));
    }

    // -------------------------------------------------------- assignments
    if (path === "/assignments" && method === "GET") return ok(await assignments(env, await guild()));
    if (path === "/assignments" && method === "POST") return ok(await assign(env, await guild(), body));
    m = path.match(/^\/assignments\/(\d+)$/);
    if (m && method === "DELETE") {
      await run(env, "UPDATE assignments SET status = 'cancelled' WHERE id = ? AND status = 'open'", Number(m[1]));
      return ok({ ok: true });
    }

    // ----------------------------------------------------------- contests
    if (path === "/contests" && method === "GET") {
      const g = await guild();
      return ok(await all(env, `SELECT c.id, c.slug, c.name, c.channel_id, c.start_at, c.end_at, c.status, c.season, c.interval_min, c.freeze_min, c.created_at, c.finished_at,
        (SELECT COUNT(*) FROM contest_results r WHERE r.contest_id = c.id) AS participants FROM contests c WHERE c.guild_id = ? ORDER BY c.id DESC`, g.id));
    }
    if (path === "/contests" && method === "POST") {
      const g = await guild();
      if (!body.channel_id) throw new HttpError(400, "pick a channel");
      const r = await trackContest(env, g, String(body.link ?? ""), String(body.channel_id), Math.max(2, Number(body.interval) || 5), Math.max(0, Number(body.freeze ?? 15)));
      if (!r.contest) throw new HttpError(400, r.error ?? "could not track");
      ctx.waitUntil(send(env, r.contest.channel_id, { embeds: [trackingEmbed(g, r.contest)] }).catch(() => {}));
      return ok(r.contest);
    }
    m = path.match(/^\/contests\/(\d+)$/);
    if (m && method === "GET") return ok(await contestDetail(env, await guild(), Number(m[1])));
    m = path.match(/^\/contests\/(\d+)\/stop$/);
    if (m && method === "POST") {
      const g = await guild();
      const c = await one<ContestRow>(env, "SELECT * FROM contests WHERE id = ? AND guild_id = ? AND status = 'active'", Number(m[1]), g.id);
      if (!c) throw new HttpError(404, "contest not active");
      await stopContest(env, c, body.announce !== false);
      return ok({ ok: true });
    }

    // -------------------------------------------------------------- teams
    // -------------------------------------------------------------- 🤖 AI: this class's AIs (keys), in order, with backups
    // the YouCode intranet: what is set (never the secret), and "Test the connection" (a signed ping)
    // Chat with your class: a message (and the last turns) → the answer from the class's data
    if (path === "/chat" && method === "POST") {
      const g = await guild(), list = await students(env, g);
      const question = String(body.question ?? ""), history = Array.isArray(body.history) ? body.history : [];
      if (!body.stream) return ok(await classChat(env, g, list, question, history));
      // streamed: one JSON line per step (what is being read, then writing), then the answer, so the teacher sees it work
      return chatStream(ctx, (line) => classChat(env, g, list, question, history, line));
    }
    // "Is the chat reliable?": questions with a known answer, each result as it comes, then the score
    if (path === "/chat/check" && method === "POST") {
      const g = await guild(), list = await students(env, g);
      return chatStream(ctx, (line) => chatCheck(env, g, list, (item, i, total) => line({ item, i, total })));
    }
    if (path === "/chat/feedback" && method === "POST") { const g = await guild(); return ok(await chatFeedback(env, g.id, body)); }
    if (path === "/intranet" && method === "GET") { const g = await guild(); return ok(await intranetSetup(env, g.id)); }
    // the students' intranet photos: which ones exist, and each image (from Cloudflare's cache after the first time)
    if (path === "/intranet/photos" && method === "GET") { const g = await guild(); return ok({ photos: await intranetPhotos(env, g.id) }); }
    if ((m = path.match(/^\/intranet\/photo\/(\d{1,25})$/)) && method === "GET") {
      const g = await guild();
      const img = await intranetPhoto(env, g.id, m[1]);
      if (!img) return new Response(null, { status: 404 });
      const h = new Headers(img.headers);
      h.set("cache-control", "private, max-age=86400");
      return new Response(img.body, { status: 200, headers: h });
    }
    if (path.startsWith("/intranet/")) {
      const g = await guild();
      try {
        if (path === "/intranet/ping" && method === "POST") return ok(await intranetPing(env, g.id));
        // the trainer connects this class's ClassBot with their intranet account (the password is never kept)
        if (path === "/intranet/login" && method === "POST") return ok({ trainer: await intranetLogin(env, g.id, String(body.url || ""), String(body.email || ""), String(body.password || "")) });
        if (path === "/intranet/logout" && method === "POST") { await intranetLogout(env, g.id); return ok({ trainer: null }); }
        // the class's intranet classroom (among those the intranet allows this key)
        if (path === "/intranet/classrooms" && method === "GET") return ok({ current: intranetClassOf(g as any), classrooms: await intranetClassrooms(env, g.id) });
        if (path === "/intranet/classroom" && method === "PUT") {
          const id = Math.floor(Number(body.id)) || 0;
          const c = id ? (await intranetClassrooms(env, g.id)).find((x) => x.id === id) : null;
          if (id && !c) throw new HttpError(400, "This classroom isn't one of yours on the intranet.");
          await setIntranetClass(env, g.id, c ? { id: c.id, name: c.name } : null);
          return ok({ current: c ? { id: c.id, name: c.name } : null });
        }
        // which intranet learner each student is: matched by name, the teacher fixes the rare ones
        if (path === "/intranet/match" && method === "GET") return ok(await intranetMatchView(env, g.id));
        if (path === "/intranet/match/auto" && method === "POST") { const n = await intranetAutoLink(env, g.id); return ok({ linked: n, ...(await intranetMatchView(env, g.id)) }); }
        if (path === "/intranet/link" && method === "PUT") {
          const sid = String(body.discord_id || "");
          if (!(await one(env, "SELECT 1 AS x FROM players WHERE guild_id = ? AND discord_id = ?", g.id, sid))) throw new HttpError(404, "This student isn't in the class.");
          const v = await intranetMatchView(env, g.id);
          const lid = Math.floor(Number(body.learner_id)) || 0;
          const l = lid ? v.learners.find((x) => x.id === lid) : null;
          if (lid && !l) throw new HttpError(400, "This learner isn't in the intranet classroom.");
          await setIntranetLink(env, g.id, sid, l ? l.id : null, l ? l.name : null);
          return ok(await intranetMatchView(env, g.id));
        }
      } catch (e) { if (e instanceof IntranetError) throw new HttpError(400, e.message); throw e; }
    }
    // 📗 the trainer's Google Sheet (Suivi Formateur), filled by ClassBot
    if (path === "/settings/gsheet" || path.startsWith("/settings/gsheet/")) {
      const g = await guild();
      try {
        if (path === "/settings/gsheet" && method === "GET") return ok(await sheetView(env, g));
        if (path === "/settings/gsheet" && method === "PUT") { const r = await saveSheet(env, g, body); return ok({ ...(await sheetView(env, g)), tabs: r.tabs }); }
        if (path === "/settings/gsheet/key" && method === "PUT") { await saveKey(env, String(body.key ?? "")); return ok(await sheetView(env, g)); }
        if (path === "/settings/gsheet/key" && method === "DELETE") { await saveKey(env, null); return ok(await sheetView(env, g)); }
        if (path === "/settings/gsheet/names" && method === "GET") return ok(await namesView(env, g));
        if (path === "/settings/gsheet/names" && method === "PUT") { await saveNames(env, g, body.map && typeof body.map === "object" ? body.map : {}); return ok(await namesView(env, g)); }
        if (path === "/settings/gsheet/fill" && method === "POST") return ok({ result: await fillSheet(env, g, "manual"), ...(await sheetView(env, g)) });
      } catch (e) { if (e instanceof SheetError) throw new HttpError(400, e.message); throw e; }
    }
    if (path === "/settings/ai" || path.startsWith("/settings/ai/")) {
      const g = await guild();
      const view = async () => ({ ...(await classAiView(env, g.id)), legacy: (await aiSettingsView(env)).source === "settings" ? (await aiSettingsView(env)).masked : null });
      try {
        if (path === "/settings/ai" && method === "GET") return ok(await view());
        if (path === "/settings/ai" && method === "PUT") { await updateClassAi(env, g.id, body); return ok(await view()); }
        if (path === "/settings/ai/providers" && method === "POST") { const r = await addProvider(env, g.id, body); return ok({ ...(await view()), warn: r.warn }); }
        let am = path.match(/^\/settings\/ai\/providers\/([\w-]{1,20})$/);
        if (am && method === "DELETE") { await removeProvider(env, g.id, am[1]); return ok(await view()); }
        am = path.match(/^\/settings\/ai\/providers\/([\w-]{1,20})\/test$/);
        if (am && method === "POST") return ok({ test: await testSaved(env, g.id, am[1]), ...(await view()) });
        if (path === "/settings/ai/copy" && method === "POST") return ok(await copyClassAi(env, g.id, Array.isArray(body.to) ? body.to : []));
        if (path === "/settings/ai/legacy" && method === "DELETE") { await saveAiSettings(env, { clear: true }); return ok(await view()); }
      } catch (e) { if (e instanceof AiKeyError || e instanceof AiSettingsError) throw new HttpError(400, e.message); throw e; }
    }
    // -------------------------------------------------------------- 📚 shared library (with the other classes)
    if (path === "/library" || path.startsWith("/library/")) {
      const g = await guild();
      try {
        if (path === "/library" && method === "GET") { await syncLibrary(env, g).catch(() => null); return ok(await libStatus(env, g)); }
        if (path === "/library" && method === "POST") return ok(body.create ? await createLibrary(env, g, String(body.name || "")) : await joinLibrary(env, g, String(body.link || "")));
        if (path === "/library" && method === "DELETE") return ok(await leaveLibrary(env, g));
        if (path === "/library/sync" && method === "POST") { await syncLibrary(env, g, { force: true, shareAll: !!body.shareAll }); return ok(await libStatus(env, g)); }
        if (path === "/library/templates" && method === "GET") { await syncLibrary(env, g).catch(() => null); return ok({ items: await libTemplates(env, g.id, String(url.searchParams.get("kind") || "")) }); }
        const tm = path.match(/^\/library\/templates\/(quiz|case|task|royale)\/([\w-]{1,60})$/);
        if (tm && method === "DELETE") { await libRemoveTemplate(env, g, tm[1], tm[2]); return ok({ items: await libTemplates(env, g.id, tm[1]) }); }
      } catch (e) { if (e instanceof LibraryError) throw new HttpError(400, e.message); throw e; }
    }
    // -------------------------------------------------------------- 🧩 squads by sprint
    if (path === "/squads" || path.startsWith("/squads/")) {
      const g = await guild();
      // each student's last debrief level, so balanced squads mix the levels
      const sview = async () => {
        const lv = await levelsOf(env, g), staff = await staffIds(env, g.id);
        const sets = await squadSets(env, g), sent = await sentAt(env, sets.map((x) => x.id));
        return { sets: sets.map((x) => ({ ...x, sent_at: sent[x.id] ?? null })), buddies: await pendingBuddies(env, g), students: (await all<{ id: string; name: string | null }>(env, "SELECT discord_id AS id, name FROM players WHERE guild_id = ? ORDER BY name COLLATE NOCASE", g.id)).filter((x) => !staff.has(x.id)).map((x) => ({ id: x.id, name: x.name || x.id, lv: lv.get(x.id) || null })) };
      };
      try {
        if (path === "/squads" && method === "GET") return ok(await sview());
        if (path === "/squads" && method === "POST") { const id = await createSquadSet(env, g, body); return ok({ id, ...(await sview()) }); }
        const sm = path.match(/^\/squads\/(\d+)$/);
        if (sm && method === "PUT") { await updateSquadSet(env, g, Number(sm[1]), body); return ok(await sview()); }
        if (sm && method === "DELETE") { await deleteSquadSet(env, g, Number(sm[1])); return ok(await sview()); }
        // the squads → the intranet's groups (preview first; all or nothing)
        const im = path.match(/^\/squads\/(\d+)\/intranet$/);
        if (im) {
          try {
            if (method === "GET") return ok(await squadsPreview(env, g.id, Number(im[1])));
            if (method === "POST") return ok(await sendSquads(env, g.id, Number(im[1])));
          } catch (e) { if (e instanceof IntranetError) throw new HttpError(400, e.message); throw e; }
        }
        const nm = path.match(/^\/squads\/(\d+)\/notify$/);
        if (nm && method === "POST") return ok({ ...(await notifySquads(env, g, Number(nm[1]), body.note, Number.isInteger(body.only) ? body.only : null)), ...(body.last === false ? {} : await sview()) });
      } catch (e) { if (e instanceof SquadError) throw new HttpError(400, e.message); throw e; }
    }
    /** The squads of the class: the squad sets (current first), then each brief's squads (latest first). */
    async function squadSources(g: GuildRow) {
      const sq = await all<{ id: number; title: string; week: number | null; squads: string | null }>(env, "SELECT id, title, week, squads FROM briefs WHERE guild_id = ? AND squads IS NOT NULL AND length(squads) > 2 ORDER BY COALESCE(start_at, created_at) DESC, id DESC LIMIT 12", g.id);
      const squads = sq.map((r) => {
        let list: any[] = [];
        try { list = JSON.parse(r.squads || "[]"); } catch { list = []; }
        return { brief: r.id, from: r.title, week: r.week, squads: list.map((x) => ({ name: String(x.name || "Squad"), members: (x.members || []).map(String) })).filter((x) => x.members.length) };
      }).filter((x) => x.squads.length);
      for (const set of (await squadSets(env, g)).reverse()) if (set.squads.length) squads.unshift({ brief: 0, from: `${set.name}${set.active ? " (current)" : ""}`, week: null, squads: set.squads.map((x) => ({ name: x.name, members: x.members })) });
      return squads;
    }
    // -------------------------------------------------------------- 🎮 class games (royale, SQL detective, code relay)
    if (path === "/games" || path.startsWith("/games/")) {
      const g = await guild();
      try {
        const gview = async (id: number) => {
          const x = await getGame(env, id, g.id);
          if (!x) throw new HttpError(404, "This game doesn't exist anymore.");
          await liveGame(env, x);
          return { id: x.id, kind: x.kind, mode: x.mode, title: x.title, settings: x.settings, squads: x.squads, status: x.status, created_at: x.created_at,
            content: x.kind === "royale" ? { questions: x.content.questions } : x.kind === "relay" ? { task: x.content.task, starter: starterFor({ fn: x.content.task.fn, params: x.content.task.params || [] }, x.settings.codeLang || "javascript"), lang: RELAY_LANGS[x.settings.codeLang || "javascript"] }
              : { caseId: x.content.caseId, case: x.content.case ?? SQL_CASES.find((c) => c.id === x.content.caseId) ?? null },
            tv: await gameTvUrl(env, x), join: gameJoinUrl(env, x), code: x.join_code, qr: qrSvg(gameJoinUrl(env, x), { dark: "#0b1020" }), live: await gameTvView(env, x) };
        };
        if (path === "/games" && method === "GET") {
          await syncLibrary(env, g).catch(() => null);
          const assess = await all<{ id: number; title: string; questions: string }>(env, "SELECT id, title, questions FROM assessments WHERE guild_id = ? ORDER BY id DESC LIMIT 40", g.id).catch(() => []);
          return ok({ items: await listGames(env, g), kinds: GAME_KINDS, lang: g.lang, squads: await squadSources(g),
            cases: SQL_CASES.map((c) => ({ id: c.id, title: c.title, level: c.level, notions: c.notions, steps: c.steps.length, story: c.story })),
            tasks: RELAY_TASKS.map((t, i) => ({ i, title: t.title, text: t.text, fn: t.fn, tests: t.tests.length, level: t.level })), langs: RELAY_LANGS,
            ...(await (async () => {
              // what the teacher wrote or generated before: to play it again
              const rows = await all<{ id: number; kind: string; content: string }>(env, "SELECT id, kind, content FROM games WHERE guild_id = ? AND kind IN ('sql', 'relay') ORDER BY id DESC LIMIT 80", g.id);
              const myTasks: any[] = [], myCases: any[] = [], seen = new Set<string>();
              for (const r of rows) {
                let c: any = {};
                try { c = JSON.parse(r.content); } catch { continue; }
                if (r.kind === "relay" && c.task && c.task.by && c.task.by !== "builtin" && !seen.has("t" + c.task.fn + c.task.title)) { seen.add("t" + c.task.fn + c.task.title); myTasks.push(c.task); }
                if (r.kind === "sql" && c.case && !seen.has("c" + c.case.title)) { seen.add("c" + c.case.title); myCases.push(c.case); }
              }
              // the shared library's cases, challenges and question sets (from the other classes too)
              const libCases = (await libTemplates(env, g.id, "case")).filter((x) => x.data?.title && !seen.has("c" + x.data.title)).map((x) => ({ ...x.data, shared: x.by || true, libKey: x.key }));
              const libTasks = (await libTemplates(env, g.id, "task")).filter((x) => x.data?.fn && !seen.has("t" + x.data.fn + x.data.title)).map((x) => ({ ...x.data, shared: x.by || true, libKey: x.key }));
              const royaleSets = (await libTemplates(env, g.id, "royale")).filter((x) => Array.isArray(x.data?.questions)).map((x) => ({ key: x.key, title: x.title, by: x.by, n: x.data.questions.length, questions: x.data.questions }));
              return { myTasks: [...myTasks.slice(0, 20), ...libTasks.slice(0, 30)], myCases: [...myCases.slice(0, 20), ...libCases.slice(0, 30)], royaleSets: royaleSets.slice(0, 30), library: !!(await libCfg(env, g.id)) };
            })()),
            battles: await listBattles(env, g),
            assessments: assess.map((a) => { let qs: any[] = []; try { qs = JSON.parse(a.questions || "[]"); } catch { qs = []; } return { id: a.id, title: a.title, mcq: fromAssessment(qs).length }; }).filter((a) => a.mcq > 0),
            topics: [...new Set([...BANK_TOPICS, ...TECHS.filter((t) => !t.tool).map((t) => t.name)])] });
        }
        if (path === "/games/questions" && method === "POST") {
          const set = cleanGameSettings(body, g.lang);
          if (body.assessment) {
            const a = await one<{ questions: string }>(env, "SELECT questions FROM assessments WHERE id = ? AND guild_id = ?", Number(body.assessment), g.id);
            if (!a) throw new HttpError(404, "This assessment doesn't exist anymore.");
            return ok({ questions: fromAssessment(JSON.parse(a.questions || "[]")), ai: false });
          }
          const topics = (Array.isArray(body.topics) ? body.topics : []).map((t: unknown) => String(t).slice(0, 40)).filter(Boolean).slice(0, 12);
          return ok(await royaleQuestions(env, { topics, count: Math.max(5, Math.min(60, Number(body.count) || 20)), level: body.level === "medium" ? "medium" : "easy", lang: set.lang }));
        }
        // Code Relay: a challenge by the AI (the teacher's idea or its own), checked by running its solution
        if (path === "/games/task" && method === "POST") {
          const r = await generateTask(env, { prompt: String(body.prompt || ""), level: String(body.level || "medium"), lang: body.lang === "en" ? "en" : g.lang === "en" ? "en" : "fr", avoid: Array.isArray(body.avoid) ? body.avoid.map(String) : [] });
          if (!r.task) throw new HttpError(400, r.error || "No challenge: try again.");
          return ok({ task: r.task });
        }
        // SQL Detective: a case by the AI, or the teacher's own case checked (its queries run on its database)
        if (path === "/games/case" && method === "POST") {
          const r = body.case ? await buildCase(env, body.case, "teacher") : await generateCase(env, { prompt: String(body.prompt || ""), level: String(body.level || "easy"), lang: body.lang === "en" ? "en" : g.lang === "en" ? "en" : "fr", avoid: Array.isArray(body.avoid) ? body.avoid.map(String) : [] });
          if (!r.case) throw new HttpError(400, r.error || "No case: try again.");
          return ok({ case: r.case, dropped: r.dropped });
        }
        if (path === "/games" && method === "POST") {
          const id = await createGame(env, g, body);
          // what the teacher wrote or generated goes to the shared library (the built-in ones are already everywhere)
          const x = await getGame(env, id, g.id);
          if (x?.kind === "sql" && x.content.case) await libTemplate(env, g, "case", x.content.case.title, x.content.case).catch(() => null);
          if (x?.kind === "relay" && x.content.task && x.content.task.by && x.content.task.by !== "builtin") await libTemplate(env, g, "task", x.content.task.title, x.content.task).catch(() => null);
          if (x?.kind === "royale" && !body.fromLibrary && !body.fromAssessment) await libTemplate(env, g, "royale", String(body.setTitle || x.title).slice(0, 80), { questions: x.content.questions }).catch(() => null);
          return ok(await gview(id));
        }
        // reuse a game: free everyone, remove one player, change the squads
        const gr = path.match(/^\/games\/(\d+)\/(clear|remove|squads|announce)$/);
        if (gr && method !== "GET") {
          const x = await getGame(env, Number(gr[1]), g.id);
          if (!x) throw new HttpError(404, "This game doesn't exist anymore.");
          if (gr[2] === "clear") await clearPlayers(env, x);
          else if (gr[2] === "remove") await removePlayer(env, x, String(body.pid || ""));
          else if (gr[2] === "announce") await postJoin(env, x);
          else await setSquads(env, x, body.squads);
          return ok(await gview(x.id));
        }
        const gm = path.match(/^\/games\/(\d+)$/);
        if (gm) {
          const id = Number(gm[1]);
          if (method === "GET") return ok(await gview(id));
          if (method === "PUT") {
            const x = await getGame(env, id, g.id);
            if (!x) throw new HttpError(404, "This game doesn't exist anymore.");
            await setRoyaleQuestions(env, x, body.questions);
            return ok(await gview(id));
          }
          if (method === "DELETE") {
            if (!(await getGame(env, id, g.id))) throw new HttpError(404, "This game doesn't exist anymore.");
            for (const t of ["game_players", "game_moves", "game_teams"]) await run(env, `DELETE FROM ${t} WHERE game_id = ?`, id);
            await run(env, "DELETE FROM games WHERE id = ? AND guild_id = ?", id, g.id);
            return ok({ ok: true });
          }
        }
      } catch (e) { if (e instanceof GameError) throw new HttpError(400, e.message); throw e; }
    }
    // -------------------------------------------------------------- ⚔️ squad battles
    if (path === "/battles" || path.startsWith("/battles/")) {
      const g = await guild();
      try {
        const bview = async (id: number) => {
          const b = await getBattle(env, id, g.id);
          if (!b) throw new HttpError(404, "This battle doesn't exist anymore.");
          await liveBattle(env, b);
          return { id: b.id, title: b.title, teams: b.teams, settings: b.settings, questions: b.questions, status: b.status, pin: b.judge_pin, judgeTaken: !!b.judge_key,
            tv: tvUrl(env, b), judge: judgeUrl(env, b), qr: qrSvg(judgeUrl(env, b), { dark: "#0b1020" }), live: tvView(b), log: b.state.log, created_at: b.created_at };
        };
        if (path === "/battles" && method === "GET") {
          const p = await programOf(env, g);
          const squads = await squadSources(g);
          const staffSet = await staffIds(env, g.id);
          const students = (await all<{ id: string; name: string | null }>(env, "SELECT discord_id AS id, name FROM players WHERE guild_id = ? ORDER BY name COLLATE NOCASE", g.id)).filter((x) => !staffSet.has(x.id));
          return ok({ items: await listBattles(env, g), teams: await teams(env, g), squads, students: students.map((x) => ({ id: x.id, name: x.name || x.id })), kinds: QKINDS, topics: [...new Set([...BANK_TOPICS, ...TECHS.filter((t) => !t.tool).map((t) => t.name)])], lang: g.lang, program: p.name });
        }
        if (path === "/battles/generate" && method === "POST") {
          const set = cleanSettings(body, g.lang);
          const avoid = body.battle ? (await getBattle(env, Number(body.battle), g.id))?.questions ?? [] : [];
          return ok(await generateBattleQuestions(env, { topics: set.topics, kinds: set.kinds, count: Number(body.count) || 30, level: set.level, lang: set.lang, avoid }));
        }
        if (path === "/battles" && method === "POST") return ok(await bview(await createBattle(env, g, body)));
        const bm = path.match(/^\/battles\/(\d+)(?:\/(judge-reset))?$/);
        if (bm) {
          const id = Number(bm[1]);
          if (!bm[2] && method === "GET") return ok(await bview(id));
          if (!bm[2] && method === "PUT") { await updateBattle(env, g, id, body); return ok(await bview(id)); }
          if (!bm[2] && method === "DELETE") { await run(env, "DELETE FROM battles WHERE id = ? AND guild_id = ?", id, g.id); return ok({ ok: true }); }
          if (bm[2] === "judge-reset" && method === "POST") { await run(env, "UPDATE battles SET judge_key = NULL, judge_seen = NULL WHERE id = ? AND guild_id = ?", id, g.id); return ok(await bview(id)); }
        }
      } catch (e) { if (e instanceof BattleError) throw new HttpError(400, e.message); throw e; }
    }
    if (path === "/teams" && method === "GET") return ok(await teams(env, await guild()));
    if (path === "/teams" && method === "POST") {
      const g = await guild();
      const name = String(body.name ?? "").trim().slice(0, 40);
      if (!name) throw new HttpError(400, "name required");
      await run(env, "INSERT OR IGNORE INTO teams (guild_id, name) VALUES (?, ?)", g.id, name);
      return ok(await teams(env, g));
    }
    m = path.match(/^\/teams\/(\d+)$/);
    if (m && method === "DELETE") {
      const g = await guild();
      await env.DB.batch([
        env.DB.prepare("DELETE FROM team_members WHERE team_id = ? AND guild_id = ?").bind(Number(m[1]), g.id),
        env.DB.prepare("DELETE FROM teams WHERE id = ? AND guild_id = ?").bind(Number(m[1]), g.id),
      ]);
      return ok(await teams(env, g));
    }
    m = path.match(/^\/teams\/(\d+)\/members$/);
    if (m && method === "PUT") {
      const g = await guild();
      const teamId = Number(m[1]);
      const members: string[] = (body.members ?? []).map(String);
      await run(env, "DELETE FROM team_members WHERE team_id = ? AND guild_id = ?", teamId, g.id);
      for (const d of members) {
        await run(env, "INSERT OR REPLACE INTO team_members (team_id, guild_id, discord_id) VALUES (?, ?, ?)", teamId, g.id, d);
      }
      return ok(await teams(env, g));
    }

    // ----------------------------------------------------------- settings
    // ---- coins & shop
    if (path === "/coins" && method === "GET") return ok(await coinsView(env, await guild()));
    if (path === "/coins" && method === "POST") {
      const g = await guild();
      const op = ["add", "remove", "set"].includes(body.op) ? body.op : "add";
      let changed;
      try {
        changed = await changeCoins(env, g, { students: body.students === "all" ? "all" : (Array.isArray(body.students) ? body.students : []), op, amount: Number(body.amount), reason: body.reason });
      } catch (e) { if (e instanceof ShopError) throw new HttpError(400, e.message); throw e; }
      if (body.notify && changed.length) {
        const why = body.reason ? ` (${String(body.reason).slice(0, 120)})` : "";
        ctx.waitUntil((async () => {
          for (const c of changed.slice(0, 20)) {
            const n = Math.abs(c.after - c.before);
            await dm(env, c.discord_id, { content: t(g.lang, op === "set" ? "coins.dm_set" : op === "add" ? "coins.dm_add" : "coins.dm_remove", { n, total: c.after, reason: why }) }).catch(() => {});
          }
        })());
      }
      return ok({ changed: changed.length, ...(await coinsView(env, await getGuild(env, g.id))) });
    }
    if (path === "/shop" && method === "PUT") {
      const g = await guild();
      await saveShop(env, g, body);
      return ok(await coinsView(env, await getGuild(env, g.id)));
    }
    if (path === "/shop/clear" && method === "POST") {
      // the teacher removes a student's title, motto, emoji or victory message (e.g. not appropriate); no refund
      const g = await guild();
      await clearCosmetic(env, g, String(body.student ?? ""), String(body.key ?? ""));
      return ok(await coinsView(env, g));
    }
    const pm = path.match(/^\/shop\/purchases\/(\d+)$/);
    if (pm && method === "POST") {
      const g = await guild();
      try { await settlePurchase(env, g, Number(pm[1]), body.action === "refund" ? "refund" : "given"); }
      catch (e) { if (e instanceof ShopError) throw new HttpError(400, e.message); throw e; }
      return ok(await coinsView(env, g));
    }
    if (path === "/notify" && method === "GET") return ok(await notifyState(env, await guild()));
    if (path === "/notify" && method === "PUT") {
      const g = await guild();
      await saveNotifyCfg(env, g, body);
      return ok(await notifyState(env, await getGuild(env, g.id)));
    }
    if (path === "/notify/test" && method === "POST") {
      const r = await notifyTest(env, await guild());
      return ok({ ...r, ...(await notifyState(env, await guild())) });
    }
    if (path === "/settings" && method === "GET") return ok(await settings(env, await guild()));
    if (path === "/settings/teacher-rank") {
      // does the teacher's score count in the class's leaderboards and in the league? (default: no)
      const g = await guild();
      if (method === "PUT") await setTeacherRank(env, g.id, { board: body.board === undefined ? undefined : !!body.board, league: body.league === undefined ? undefined : !!body.league });
      const tp = g.teacher_id ? await one<{ name: string | null }>(env, "SELECT name FROM players WHERE guild_id = ? AND discord_id = ?", g.id, g.teacher_id) : null;
      return ok({ ...(await teacherRank(env, g.id)), teacher: g.teacher_id ? { id: g.teacher_id, name: tp?.name || null } : null });
    }
    if (path === "/settings" && method === "PUT") {
      const g = await guild();
      const v = (k: string, def: unknown) => (body[k] === undefined ? def : body[k] === "" ? null : body[k]);
      const lang = v("lang", g.lang);
      if (!["en", "fr"].includes(String(lang))) throw new HttpError(400, "language must be en or fr");
      const hour = Number(v("daily_hour", g.daily_hour));
      let integrity = g.integrity ?? null;
      if (body.integrity !== undefined) integrity = body.integrity ? JSON.stringify(integrityOf({ integrity: JSON.stringify({ ...integrityOf(g), ...body.integrity }) })) : null;
      if (integrity !== (g.integrity ?? null)) await run(env, "UPDATE guilds SET integrity = ? WHERE id = ?", integrity, g.id);
      let scoring = g.scoring;
      if (body.scoring !== undefined) scoring = body.scoring ? JSON.stringify(scoringOf({ scoring: JSON.stringify(body.scoring) })) : null;
      await run(env, `UPDATE guilds SET lang = ?, code_lang = ?, arena_channel = ?, announce_channel = ?, daily_channel = ?, daily_hour = ?, champion_role = ?, streak_role = ?, scoring = ?, name = ? WHERE id = ?`,
        lang, body.code_lang !== undefined ? guildLangs({ code_lang: String(body.code_lang) }).join(",") : g.code_lang, v("arena_channel", g.arena_channel), v("announce_channel", g.announce_channel), v("daily_channel", g.daily_channel),
        Math.min(23, Math.max(0, Number.isFinite(hour) ? hour : 9)), v("champion_role", g.champion_role), v("streak_role", g.streak_role),
        scoring, v("name", g.name), g.id);
      return ok(await settings(env, await getGuild(env, g.id)));
    }
    // a new season: now, or at a time (the cron starts it); the end of the old one is announced in #arena
    if (path === "/season" && method === "POST") {
      const g = await guild();
      try {
        if (body.at) return ok({ plan: await planSeason(env, g, body), guild: g });
        await startSeason(env, g, String(body.name ?? ""), { announce: !!body.announce, certificates: body.certificates !== false, wait: (p) => ctx.waitUntil(p) });
      } catch (e) { if (e instanceof SeasonError) throw new HttpError(400, e.message); throw e; }
      return ok(await getGuild(env, g.id));
    }
    if (path === "/season/plan" && method === "GET") return ok({ plan: await seasonPlan(env, (await guild()).id) });
    if (path === "/season/plan" && method === "DELETE") { await cancelSeasonPlan(env, (await guild()).id); return ok({ plan: null }); }
    // ---------------------------------------------------------- 🎯 track
    if (path === "/track" && method === "GET") { const g = await guild(); return ok({ track: trackOf(g), tracks: TRACKS }); }
    if (path === "/track" && method === "PUT") {
      const g = await guild();
      if (!TRACKS.some((t) => t.key === body.track)) throw new HttpError(400, "unknown track");
      const t = await setTrack(env, g, String(body.track));
      return ok({ track: t, guild: await getGuild(env, g.id) });
    }
    if (path === "/pills" && method === "GET") {
      const g = await guild();
      const h = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM hands WHERE guild_id = ? AND status = 'waiting'", g.id);
      const f = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM faq WHERE guild_id = ? AND status = 'pending'", g.id);
      const sh = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM purchases WHERE guild_id = ? AND status = 'pending'", g.id);
      // students stopped during an assessment (they left full screen) and waiting to be let back in
      const lk = await one<{ n: number }>(env, `SELECT COUNT(*) AS n FROM assessment_takers t JOIN assessments a ON a.id = t.assessment_id
        WHERE t.guild_id = ? AND t.status = 'locked' AND t.resume_ok = 0 AND a.status = 'open'`, g.id);
      // work handed in for a brief whose deadline passed, not debriefed yet
      const db = await one<{ n: number }>(env, `SELECT COUNT(*) AS n FROM brief_handins h JOIN briefs b ON b.id = h.brief_id
        WHERE h.guild_id = ? AND b.status = 'assigned' AND b.due_at < ? AND NOT EXISTS (SELECT 1 FROM brief_reviews r WHERE r.brief_id = h.brief_id AND r.who = h.who AND r.status = 'final')`, g.id, now());
      // presentations: requests to approve, and presentations already held that wait for their grade
      const pr = await one<{ n: number }>(env, `SELECT COUNT(*) AS n FROM activity_claims c JOIN activities a ON a.id = c.activity_id
        WHERE c.guild_id = ? AND (c.status = 'pending' OR (c.status = 'approved' AND a.day <= ?))`, g.id, new Date().toISOString().slice(0, 10)).catch(() => null);
      return ok({ hands: h?.n ?? 0, faq: f?.n ?? 0, shop: sh?.n ?? 0, assess: lk?.n ?? 0, debriefs: db?.n ?? 0, pres: pr?.n ?? 0 });
    }
    // -------------------------------------------------- ✨ AI generation
    if (path === "/path/lesson-ai" && method === "POST") return ok(await writeLesson(env, await guild(), String(body.skill ?? ""), String(body.hint ?? "")));
    if (path === "/coverage" && method === "GET") return ok(await bankCoverage(env, await guild()));
    if (path === "/ai/challenge" && method === "POST") {
      const g = await guild();
      const kind = (["write", "quick", "mcq", "output", "bug", "complexity"].includes(body.kind) ? body.kind : "quick") as GenKind;
      const c = await challengeForSkill(env, g, { skill: body.skill || null, difficulty: body.difficulty, kind, topic: body.topic || null, codeLang: body.code_lang || null });
      return ok({ challenge: c, coverage: await bankCoverage(env, g) });
    }
    if (path === "/overview/live" && method === "GET") return ok(await overviewLive(env, await guild()));

    // ------------------------------------------------------ ✋ help queue
    if (path === "/hands" && method === "GET") return ok(await handQueue(env, await guild()));
    let hm = path.match(/^\/hands\/(\d+)$/);
    if (hm && method === "PUT") {
      const g = await guild();
      const action = ["take", "reply", "done", "requeue"].includes(body.action) ? body.action : "done";
      await updateHand(env, g, Number(hm[1]), action, String(body.reply ?? ""));
      return ok(await handQueue(env, g));
    }

    // ---------------------------------------------------- ❓ questions/FAQ
    if (path === "/faq" && method === "GET") return ok({ items: await faqList(env, await guild()) });
    if (path === "/faq" && method === "POST") { const g = await guild(); await saveFaq(env, g, { ...body, id: undefined }); return ok({ items: await faqList(env, g) }); }
    hm = path.match(/^\/faq\/(\d+)$/);
    if (hm && method === "PUT") { const g = await guild(); await saveFaq(env, g, { ...body, id: Number(hm[1]) }); return ok({ items: await faqList(env, g) }); }
    if (hm && method === "DELETE") { const g = await guild(); await run(env, "DELETE FROM faq WHERE id = ? AND guild_id = ?", Number(hm[1]), g.id); return ok({ items: await faqList(env, g) }); }
    hm = path.match(/^\/faq\/(\d+)\/draft$/);
    if (hm && method === "POST") {
      const g = await guild();
      await run(env, "UPDATE faq SET draft = NULL WHERE id = ? AND guild_id = ? AND status = 'pending'", Number(hm[1]), g.id);
      const d = await draftAnswer(env, g, Number(hm[1]));
      if (!d) throw new HttpError(503, "The AI couldn't write a draft right now: the free AI is used up for today, or your AI keys failed (see Settings → AI). Write the answer yourself.");
      return ok({ items: await faqList(env, g) });
    }

    // ------------------------------------------- 🏆 league & all classes
    if (path === "/compare" && method === "GET") return ok(await compareClasses(env));
    if (path.startsWith("/league")) {
      const g = await guild();
      const view = async () => ({ cfg: leagueOf(g), link: leagueLink(env, g), remotes: await remoteRows(env, g), table: await leagueTable(env, undefined, g), last: await leagueTable(env, weekStart(now()) - 7 * 86400, g) });
      try {
        if (path === "/league" && method === "GET") {
          if (leagueOf(g).on && !leagueOf(g).token) await setLeague(env, g, {});   // joined before league links existed
          await refreshRemotes(env, g, 1800);
          return ok(await view());
        }
        if (path === "/league" && method === "PUT") { await setLeague(env, g, body); return ok(await view()); }
        if (path === "/league/remotes" && method === "POST") { await addRemote(env, g, String(body.url || ""), body.label ? String(body.label) : undefined); return ok(await view()); }
        if (path === "/league/remotes" && method === "DELETE") { await removeRemote(env, g, String(body.url || url.searchParams.get("url") || "")); return ok(await view()); }
        if (path === "/league/refresh" && method === "POST") { await refreshRemotes(env, g, 0); return ok(await view()); }
      } catch (e) { if (e instanceof LeagueError) throw new HttpError(400, e.message); throw e; }
    }

    // ----------------------------------------------------- 🎓 certificates
    if (path === "/certificates" && method === "GET") {
      const g = await guild();
      const season = url.searchParams.get("season") || g.season;
      const seasons = await all<{ season: string }>(env, "SELECT DISTINCT season FROM ledger WHERE guild_id = ? ORDER BY season", g.id);
      const rows = (await standings(env, g.id, season, 200)).filter((r) => r.discord_id && r.points > 0);
      return ok({
        season, current: g.season, seasons: seasons.map((x) => x.season),
        items: await Promise.all(rows.map(async (r, i) => ({ rank: i + 1, name: r.name, discord_id: r.discord_id, points: r.points, url: await certUrl(env, g.id, r.discord_id!, season) }))),
      });
    }
    if (path === "/certificates/send" && method === "POST") {
      const g = await guild();
      return ok({ sent: await sendCertificates(env, g, String(body.season || g.season)) });
    }

    // ---------------------------------------------------- 🎤 interviews
    if (path === "/interviews" && method === "GET") {
      const g = await guild();
      const rows = await all<any>(env, `SELECT i.id, i.discord_id, i.status, i.scores, i.transcript, i.created_at, i.finished_at, c.title, c.difficulty, p.name, a.status AS code_status
        FROM interviews i JOIN challenges c ON c.id = i.challenge_id LEFT JOIN players p ON p.guild_id = i.guild_id AND p.discord_id = i.discord_id
        LEFT JOIN attempts a ON a.id = i.attempt_id WHERE i.guild_id = ? ORDER BY i.id DESC LIMIT 100`, g.id);
      return ok({ items: rows.map((r) => ({ ...r, scores: r.scores ? JSON.parse(r.scores) : null, transcript: JSON.parse(r.transcript || "[]") })) });
    }

    throw new HttpError(404, "not found");
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof ChatError || e instanceof HandError || e instanceof PlanError || e instanceof WorkPlanError || e instanceof FaqError || e instanceof GenError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    if (/no such (table|column)|has no column named/i.test(String((e as Error)?.message))) {
      return Response.json({ error: "The database hasn't been updated for this version. In the classbot folder run: npm run db:migrate", code: "migrate" }, { status: 500 });
    }
    return Response.json({ error: (e as Error).message ?? "server error" }, { status: 500 });
  }
}

// ================================================================ guilds
async function guilds(env: Env) {
  const rows = await all<GuildRow & { students: number }>(env,
    "SELECT g.*, (SELECT COUNT(*) FROM players p WHERE p.guild_id = g.id) AS students FROM guilds g ORDER BY g.created_at");
  for (const g of rows.filter((r) => !r.name).slice(0, 5)) {
    try {
      const info = await dapi<{ name: string }>(env, "GET", `/guilds/${g.id}`);
      g.name = info.name;
      await run(env, "UPDATE guilds SET name = ? WHERE id = ?", info.name, g.id);
    } catch { /* bot may have been removed */ }
  }
  return rows;
}

async function discordInfo(env: Env, g: GuildRow) {
  const [channels, roles] = await Promise.all([
    dapi<any[]>(env, "GET", `/guilds/${g.id}/channels`).catch(() => []),
    dapi<any[]>(env, "GET", `/guilds/${g.id}/roles`).catch(() => []),
  ]);
  return {
    channels: channels.filter((c) => c.type === 0 || c.type === 5).sort((a, b) => a.position - b.position).map((c) => ({ id: c.id, name: c.name })),
    forums: channels.filter((c) => c.type === 15).sort((a, b) => a.position - b.position).map((c) => ({ id: c.id, name: c.name })),
    roles: roles.filter((r) => r.name !== "@everyone" && !r.managed).sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, name: r.name, color: r.color })),
  };
}

// ============================================================== students
async function students(env: Env, g: GuildRow) {
  // the trend: this week's points against last week's (a class only needs two weeks of history)
  const t0 = now(), d7 = t0 - 7 * 86400, d14 = t0 - 14 * 86400;
  // the class's students only: the teacher (who also uses the bot) is never one
  const rows = await withoutStaff(env, g.id, await all<any>(env,
    `SELECT p.discord_id, p.name, p.hr_display, p.hr_verified, p.coins, p.rating, p.daily_streak, p.last_active, p.created_at,
       COALESCE((SELECT SUM(amount) FROM ledger l WHERE l.guild_id = p.guild_id AND l.discord_id = p.discord_id AND l.season = ?), 0) AS season_pts,
       COALESCE((SELECT SUM(amount) FROM ledger l WHERE l.guild_id = p.guild_id AND l.discord_id = p.discord_id), 0) AS total_pts,
       COALESCE((SELECT SUM(amount) FROM ledger l WHERE l.guild_id = p.guild_id AND l.discord_id = p.discord_id AND l.created_at >= ?), 0) AS pts7,
       COALESCE((SELECT SUM(amount) FROM ledger l WHERE l.guild_id = p.guild_id AND l.discord_id = p.discord_id AND l.created_at >= ? AND l.created_at < ?), 0) AS pts_prev7,
       (SELECT MIN(created_at) FROM ledger l WHERE l.guild_id = p.guild_id AND l.discord_id = p.discord_id) AS first_pts,
       (SELECT COUNT(*) FROM attempts a WHERE a.guild_id = p.guild_id AND a.discord_id = p.discord_id AND (a.status = 'solved' OR (a.status = 'claimed' AND a.verified = 1))) AS solved,
       (SELECT COUNT(*) FROM attempts a WHERE a.guild_id = p.guild_id AND a.discord_id = p.discord_id AND a.status = 'failed') AS failed,
       (SELECT COUNT(*) FROM assignments s WHERE s.guild_id = p.guild_id AND s.discord_id = p.discord_id AND s.status = 'open') AS open_asg,
       (SELECT COUNT(*) FROM assignments s WHERE s.guild_id = p.guild_id AND s.discord_id = p.discord_id AND s.status = 'missed') AS missed_asg,
       (SELECT t.name FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.guild_id = p.guild_id AND m.discord_id = p.discord_id) AS team
     FROM players p WHERE p.guild_id = ? ORDER BY season_pts DESC`,
    g.season, d7, d14, d7, g.id));
  // VS Code: connected, and no writing time at all for the last 2 working days while a brief runs
  const quiet = new Set((await quietWriters(env, g).catch(() => ({ learners: [] as { id: string }[] }))).learners.map((l) => l.id));
  return rows.map((r) => {
    const tries = r.solved + r.failed;
    const accuracy = tries ? Math.round((100 * r.solved) / tries) : null;
    const lv = levelInfo(r.total_pts);
    let trend: string;
    if (!r.last_active || r.last_active < t0 - 10 * 86400) trend = "inactive";
    else if ((r.first_pts ?? r.created_at) > d7) trend = "new";      // their first points are less than a week old
    else if (r.pts7 > r.pts_prev7 * 1.15 + 5) trend = "up";
    else if (r.pts7 < r.pts_prev7 * 0.85 - 5) trend = "down";
    else trend = "flat";
    const reasons: string[] = [];
    if (trend === "inactive") reasons.push("inactive 10+ days");
    if (trend === "down") reasons.push("points dropping");
    if (accuracy !== null && tries >= 5 && accuracy < 40) reasons.push(`low accuracy (${accuracy}%)`);
    if (r.missed_asg) reasons.push(`${r.missed_asg} missed assignment(s)`);
    if (quiet.has(r.discord_id)) reasons.push("no VS Code writing for 2 working days");
    return { ...r, accuracy, level: lv.level, title: t("en", titleKey(lv.level)), trend, attention: reasons };
  });
}

async function studentDetail(env: Env, g: GuildRow, did: string) {
  const s = await playerStats(env, g, did);
  if (!s.player) throw new HttpError(404, "unknown student");
  const t0 = now();
  const weekStart = t0 - 12 * 7 * 86400;
  const weekly = await all<{ w: number; pts: number }>(env,
    "SELECT CAST((created_at - ?) / 604800 AS INTEGER) AS w, SUM(amount) AS pts FROM ledger WHERE guild_id = ? AND discord_id = ? AND created_at >= ? GROUP BY w",
    weekStart, g.id, did, weekStart);
  const weeks = Array.from({ length: 12 }, (_, i) => ({ start: weekStart + i * 604800, pts: weekly.find((w) => w.w === i)?.pts ?? 0 }));
  const byReason = await all(env, "SELECT reason, SUM(amount) AS pts, COUNT(*) AS n FROM ledger WHERE guild_id = ? AND discord_id = ? AND season = ? GROUP BY reason ORDER BY pts DESC", g.id, did, g.season);
  const attempts = await all(env,
    `SELECT a.id, a.origin, a.status, a.tries, a.used_hint, a.verified, a.points, a.started_at, a.finished_at, a.answer_given, a.lang, a.result, a.feedback, a.integrity, a.reviewed, a.held, a.explain,
            c.id AS challenge_id, c.title, c.kind, c.difficulty, c.url, c.source
       FROM attempts a JOIN challenges c ON c.id = a.challenge_id
      WHERE a.guild_id = ? AND a.discord_id = ? ORDER BY a.id DESC LIMIT 300`, g.id, did);
  const matrix = await all(env,
    `SELECT c.difficulty, c.kind, SUM(a.status = 'solved' OR (a.status = 'claimed' AND a.verified = 1)) AS solved, SUM(a.status = 'failed') AS failed
       FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.guild_id = ? AND a.discord_id = ? GROUP BY c.difficulty, c.kind`, g.id, did);
  const contests = await all(env,
    `SELECT r.contest_id, c.name, c.finished_at, r.rank, r.score, r.participants FROM contest_results r JOIN contests c ON c.id = r.contest_id
      WHERE r.guild_id = ? AND r.discord_id = ? ORDER BY r.contest_id`, g.id, did);
  const asg = await all(env,
    `SELECT s.id, s.status, s.due_at, s.note, s.created_at, s.completed_at, c.title, c.difficulty, c.kind
       FROM assignments s JOIN challenges c ON c.id = s.challenge_id WHERE s.guild_id = ? AND s.discord_id = ? ORDER BY s.id DESC`, g.id, did);
  const duels = await all(env,
    `SELECT d.id, d.mode, d.difficulty, d.stake, d.status, d.winner_id, d.finished_at,
            CASE WHEN d.challenger_id = ? THEN d.opponent_id ELSE d.challenger_id END AS opponent_id,
            (SELECT name FROM players p WHERE p.guild_id = d.guild_id AND p.discord_id = CASE WHEN d.challenger_id = ? THEN d.opponent_id ELSE d.challenger_id END) AS opponent
       FROM duels d WHERE d.guild_id = ? AND d.status = 'finished' AND (d.challenger_id = ? OR d.opponent_id = ?) ORDER BY d.id DESC LIMIT 30`,
    did, did, g.id, did, did);
  const ledger = await all(env, "SELECT amount, reason, note, created_at FROM ledger WHERE guild_id = ? AND discord_id = ? ORDER BY id DESC LIMIT 40", g.id, did);
  const team = await one(env, "SELECT t.id, t.name FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.guild_id = ? AND m.discord_id = ?", g.id, did);
  const prof = await studentProfile(env, g, did);
  const path = await pathProgress(env, g, did);
  const coach = {
    skills: prof.skills.filter((x) => x.evidence > 0), mistakes: prof.mistakes, focus: focusSkills(prof.skills, 2).map((x) => x.key),
    ...(await workOn(env, g, did).then((list) => ({ workOn: list, workOnError: null }), (e) => { console.error("workOn", e); return { workOn: [], workOnError: String(e?.message ?? e).slice(0, 300) }; })),
    path: { done: path.steps.filter((x) => x.done).length, total: path.steps.length, current: path.current >= 0 ? path.steps[path.current] : null },
    plan: { streak: (s.player as any)?.plan_streak ?? 0, best: (s.player as any)?.plan_best ?? 0, remind: !!(s.player as any)?.plan_dm },
  };
  // the learning record beyond challenges: GitHub, competencies, briefs and their debriefs, assessments
  const program = await programOf(env, g);
  const actAll = (s.player as any)?.github_id ? await activityOf(env, g, 14) : null;
  const act = actAll?.students.find((x) => x.discord_id === did) ?? null;
  // each assessment: score, the competencies it validated or not, question by question (verdict and points)
  const arows = await all<{ id: number; title: string; status: string; score: number | null; submitted_at: number | null; summary: string | null; taker: number; grades: string | null; questions: string; brief_id: number | null; brief: string | null; settings: string | null }>(env,
    `SELECT a.id, a.title, t.status, t.score, t.submitted_at, t.summary, t.id AS taker, t.grades, a.questions, a.brief_id, a.settings, b.title AS brief
       FROM assessment_takers t JOIN assessments a ON a.id = t.assessment_id LEFT JOIN briefs b ON b.id = a.brief_id
      WHERE t.guild_id = ? AND t.discord_id = ? ORDER BY t.id DESC LIMIT 20`, g.id, did);
  const acomps = await all<{ ref: number; code: string; ok: number; level: number | null; note: string | null }>(env,
    "SELECT ref, code, ok, level, note FROM competency_results WHERE guild_id = ? AND discord_id = ? AND source = 'assessment'", g.id, did);
  const assessments = arows.map((r) => {
    let qs: any[] = [], gr: Record<string, any> = {}, st: any = {};
    try { qs = JSON.parse(r.questions || "[]"); } catch { qs = []; }
    try { gr = JSON.parse(r.grades || "{}"); } catch { gr = {}; }
    try { st = JSON.parse(r.settings || "{}"); } catch { st = {}; }
    return { id: r.id, title: r.title, status: r.status, score: r.score, submitted_at: r.submitted_at, summary: r.summary, taker: r.taker, passAt: Number(st.passAt) || 60,
      brief: r.brief_id ? { id: r.brief_id, title: r.brief } : null,
      questions: qs.map((q, i) => ({ n: i + 1, type: q.type, prompt: String(q.prompt || "").slice(0, 140), points: q.points || 1, verdict: gr[q.id]?.verdict ?? null, score: gr[q.id]?.score ?? null })),
      comps: acomps.filter((c) => c.ref === r.id).map((c) => ({ code: c.code, ok: !!c.ok, level: c.level, note: c.note })) };
  });
  // the sprint reviews (level and decision per sprint), as the Sprints page shows them
  const sprints = await studentSprints(env, g, did).catch(() => []);
  const learning = {
    github: { login: (s.player as any)?.github_login ?? null, linkedAt: (s.player as any)?.gh_linked_at ?? null, activity: act, days: actAll?.days ?? [] },
    competencies: await competencyMap(env, g, did, program), levels: program.levels, program: program.name,
    briefs: await studentBriefs(env, g, did), assessments,
    sprints,
  };
  return {
    ...s, level: { ...s.level, title: t("en", titleKey(s.level.level)) },
    weeks, byReason, attempts, matrix, contestList: contests, assignments: asg, duelList: duels, ledger, team, coach, learning,
  };
}

async function reviewAttempt(env: Env, g: GuildRow, attemptId: number, approve: boolean) {
  const a = await one<any>(env, "SELECT a.*, c.kind, c.difficulty, c.title FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.id = ? AND a.guild_id = ?", attemptId, g.id);
  if (!a || a.status !== "claimed") throw new HttpError(404, "no self-reported solve to review");
  if (approve) {
    if (!a.points) {
      const pts = pointsFor(scoringOf(g), { kind: a.kind, difficulty: a.difficulty, origin: a.origin, usedHint: false, tries: 1, seconds: 999 });
      await run(env, "UPDATE attempts SET verified = 1, points = ? WHERE id = ?", pts, a.id);
      await addPoints(env, g, { discordId: a.discord_id, amount: pts, reason: a.origin, ref: a.id, note: "approved by teacher" });
      await challengeCoins(env, g, a.discord_id, pts);
    } else await run(env, "UPDATE attempts SET verified = 1 WHERE id = ?", a.id);
  } else {
    if (a.points) { await addPoints(env, g, { discordId: a.discord_id, amount: -a.points, reason: "bonus", ref: a.id, note: "self-report rejected" }); await challengeCoins(env, g, a.discord_id, -a.points); }
    await run(env, "UPDATE attempts SET status = 'failed', points = 0 WHERE id = ?", a.id);
  }
  const L = g.lang;
  await dm(env, a.discord_id, { content: t(L, approve ? "claim.approved" : "claim.rejected", { title: a.title }) }).catch(() => {});
  return { ok: true };
}

// ============================================================ challenges
async function challenges(env: Env, g: GuildRow) {
  // one pass over this class's attempts and the open reports, instead of 4 subqueries per challenge
  return all(env,
    `SELECT c.id, c.guild_id, c.source, c.kind, c.difficulty, c.lang, c.code_lang, c.title, c.topic, c.url, c.status, c.created_at, c.created_by, c.time_limit, c.skills,
       COALESCE(s.attempts, 0) AS attempts, COALESCE(s.solved, 0) AS solved, COALESCE(s.failed, 0) AS failed, COALESCE(r.n, 0) AS reports
     FROM challenges c
     LEFT JOIN (SELECT challenge_id, COUNT(*) AS attempts,
                       SUM(status = 'solved' OR (status = 'claimed' AND verified = 1)) AS solved, SUM(status = 'failed') AS failed
                  FROM attempts WHERE guild_id = ? GROUP BY challenge_id) s ON s.challenge_id = c.id
     LEFT JOIN (SELECT challenge_id, COUNT(*) AS n FROM reports WHERE status = 'open' GROUP BY challenge_id) r ON r.challenge_id = c.id
     WHERE (c.guild_id IS NULL OR c.guild_id = ?) AND c.status != 'archived'
       AND (c.kind = 'code' OR c.lang = ? OR c.guild_id = ?)
     ORDER BY c.id DESC LIMIT 1000`, g.id, g.id, g.lang, g.id);
}

async function challengeDetail(env: Env, g: GuildRow, cid: number) {
  const c = await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ? AND (guild_id IS NULL OR guild_id = ?)", cid, g.id);
  if (!c) throw new HttpError(404, "unknown challenge");
  const results = await all(env,
    `SELECT a.id, a.discord_id, p.name, a.status, a.origin, a.answer_given, a.lang, a.result, a.tries, a.used_hint, a.points, a.finished_at
       FROM attempts a LEFT JOIN players p ON p.guild_id = a.guild_id AND p.discord_id = a.discord_id
      WHERE a.challenge_id = ? AND a.guild_id = ? ORDER BY a.id DESC LIMIT 200`, cid, g.id);
  const reps = await all(env,
    "SELECT r.id, r.reason, r.status, r.created_at, p.name FROM reports r LEFT JOIN players p ON p.guild_id = r.guild_id AND p.discord_id = r.discord_id WHERE r.challenge_id = ? ORDER BY r.id DESC", cid);
  const tests = (await loadTests(env, c)).map((x) => ({
    idx: x.idx, sample: x.sample, generated: !x.input,
    input: x.input && x.input.length > 1500 ? x.input.slice(0, 1500) + `… (${x.input.length} chars)` : x.input,
    expected: x.expected.length > 600 ? x.expected.slice(0, 600) + `… (${x.expected.length} chars)` : x.expected,
  }));
  return { ...c, choices: c.choices ? JSON.parse(c.choices) : null, alternatives: c.alternatives ? JSON.parse(c.alternatives) : [], tests, results, reports: reps };
}

function cleanChallenge(b: any) {
  const kind = String(b.kind ?? "");
  const difficulty = String(b.difficulty ?? "");
  if (!KINDS.includes(kind)) throw new HttpError(400, "invalid kind");
  if (!DIFFS.includes(difficulty)) throw new HttpError(400, "invalid difficulty");
  const title = String(b.title ?? "").trim().slice(0, 80);
  if (!title) throw new HttpError(400, "title required");
  const out: Record<string, unknown> = {
    kind, difficulty, title,
    question: b.question ? String(b.question).slice(0, kind === "write" ? 5000 : 2000) : null,
    code: b.code ? String(b.code).slice(0, 3000) : null,
    hint: b.hint ? String(b.hint).slice(0, 500) : null,
    explanation: b.explanation ? String(b.explanation).slice(0, 1500) : null,
    topic: b.topic ? String(b.topic).slice(0, 60) : null,
    choices: null, answer: null, alternatives: null, url: null, hr_slug: null,
  };
  if (kind === "write") {
    if (!out.question) throw new HttpError(400, "the problem statement is required");
    out.code = null;
  } else if (kind === "code") {
    const slug = parseChallengeSlug(String(b.url ?? b.hr_slug ?? ""));
    if (!slug) throw new HttpError(400, "HackerRank challenge URL required");
    out.hr_slug = slug;
    out.url = `https://www.hackerrank.com/challenges/${slug}/problem`;
  } else if (kind === "output") {
    if (!b.answer && b.answer !== 0) throw new HttpError(400, "expected output required");
    out.answer = String(b.answer);
    const alts = Array.isArray(b.alternatives) ? b.alternatives.map(String).filter(Boolean) : [];
    out.alternatives = alts.length ? JSON.stringify(alts) : null;
    if (!out.code) throw new HttpError(400, "code required for an output challenge");
  } else {
    const choices = Array.isArray(b.choices) ? b.choices.map((c: unknown) => String(c ?? "").trim()) : [];
    if (choices.length < 2 || choices.length > 4 || choices.some((c: string) => !c)) throw new HttpError(400, "2 to 4 non-empty choices required");
    const answer = String(b.answer ?? "").toUpperCase();
    if (!"ABCD".slice(0, choices.length).includes(answer) || answer.length !== 1) throw new HttpError(400, "answer must be the letter of a choice");
    out.choices = JSON.stringify(choices);
    out.answer = answer;
  }
  return out;
}

/** A live quiz's questions as content (to share them through the library). */
async function quizContentOf(env: Env, ids: number[]) {
  const rows = ids.length ? await all<ChallengeRow>(env, `SELECT * FROM challenges WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids) : [];
  return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean).map((c) => ({
    kind: c!.kind, difficulty: c!.difficulty, lang: c!.lang, code_lang: c!.code_lang, title: c!.title, question: c!.question, code: c!.code,
    choices: (() => { try { return JSON.parse(c!.choices || "null"); } catch { return null; } })(), answer: c!.answer, hint: c!.hint, explanation: c!.explanation, topic: c!.topic,
  }));
}
/** The library quiz's questions in this class: the same challenge if it's already here, else a new one. */
async function quizChallengesFor(env: Env, g: GuildRow, qs: any[], by: string) {
  const ids: number[] = [];
  for (const q of qs.slice(0, 30)) {
    if (!q || !QUIZ_KINDS.includes(q.kind)) continue;
    const found = await one<{ id: number }>(env, `SELECT id FROM challenges WHERE (guild_id IS NULL OR guild_id = ?) AND kind = ? AND title = ? AND COALESCE(question, '') = ? AND COALESCE(code, '') = ? AND answer = ? AND status != 'archived' LIMIT 1`,
      g.id, q.kind, q.title, q.question ?? "", q.code ?? "", q.answer);
    if (found) { ids.push(found.id); continue; }
    const c: any = await createChallenge(env, g, { ...q, source: "ai" }, by).catch(() => null);
    if (c?.id) ids.push(c.id);
  }
  return ids;
}

/** ✨ AI helper for a boss battle or a bounty: a name and an angle from the teacher's idea, a new checked challenge, and settings sized to the class. */
async function eventWithAi(env: Env, g: GuildRow, b: any, by: string) {
  const boss = b.kind === "boss";
  const difficulty = (DIFFS.includes(b.difficulty) ? b.difficulty : boss ? "hard" : "medium") as Difficulty;
  const qtype = boss ? "write" : ["write", "mcq", "output", "bug", "complexity"].includes(b.qtype) ? b.qtype : "write";
  const skill = SKILLS.find((x) => x.key === b.skill);
  const idea = String(b.idea ?? "").trim().slice(0, 300);
  const lang = g.lang === "fr" ? "fr" : "en";
  // who plays: the students active in the last 2 weeks (at least 4)
  const act = await one<{ n: number }>(env, "SELECT COUNT(DISTINCT discord_id) AS n FROM attempts WHERE guild_id = ? AND started_at >= ?", g.id, now() - 14 * 86400);
  const players = Math.max(4, Number(act?.n) || 0);

  // 1. a name, a story and a precise topic (one AI call; a plain fallback if it fails). A boss is told like a
  //    tabletop RPG: an intro, a line for each hero's strike, half health, almost dead, victory, escape.
  const theme = String(b.theme ?? "").trim().slice(0, 300);
  const lg = lang === "fr" ? "French" : "English";
  let plan: any = null;
  try {
    plan = await chatJson(env, [
      { role: "system", content: (boss ? [
        "You are the game master of a class boss battle, told like Dungeons & Dragons: the whole class of programming students are the heroes, the boss is a creature they defeat by solving one coding problem together (every hidden test their code passes is a strike).",
        `Write in ${lg}, epic and vivid but short, for students aged 18-25; no gore. Answer with JSON only:`,
        '{"name": "the boss, 2-4 words", "topic": "the programming problem in English, one precise sentence under 20 words (a self-contained problem reading input and printing output; no web, files or libraries)", "setting": "the setting of the quest in English, 1-2 sentences, used to write the problem\'s story", "why": "one sentence for the teacher: what the students practise",',
        '"intro": "the boss appears: 3-5 sentences that set the scene and call the heroes to battle", "hits": ["6 different one-sentence strike descriptions, each with {hero} (the student) and {dmg} (the damage), varied weapons and spells"], "bloodied": "one or two sentences: the boss is at half health, wounded and furious", "dying": "one or two sentences: the boss is almost dead, staggering; one last push", "victory": "2-3 sentences of glory: the heroes win; {hero} is the one who struck hardest", "escape": "1-2 sentences: the boss escapes into the shadows, promising to return"}',
      ] : [
        "You help a programming teacher prepare a class bounty (the first student to solve a problem wins).",
        `Write in ${lg}. Answer with JSON only: {"topic": "one precise programming topic for the problem, in English, under 12 words", "why": "one sentence for the teacher: what the students will practise"}.`,
        "The topic must fit a self-contained problem that reads input and prints output (no web, no files, no libraries).",
      ]).join("\n") },
      { role: "user", content: `Difficulty: ${difficulty}. ${skill ? `Skill: ${skill.en}. ` : ""}${boss && theme ? `Theme of the story: ${theme}. ` : ""}${idea ? `Teacher's idea: ${idea}` : boss ? "" : "No idea given: pick a classic but interesting topic for this level."}` },
    ], { maxTokens: boss ? 1600 : 300, temperature: 0.9, timeoutMs: 45000 });
  } catch { /* the fallback below */ }
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : "");
  const NAMES = ["The Bug King", "The Null Pointer", "Lord Segfault", "The Infinite Loop", "The Off-By-One Ogre"];
  const name = str(plan?.name, 60) || NAMES[Math.floor(Math.random() * NAMES.length)];
  const topic = [skill?.en, str(plan?.topic, 160) || idea].filter(Boolean).join(": ") || null;
  const why = str(plan?.why, 300);
  const lore = boss ? cleanLore(plan) : null;
  const quest = boss ? [theme, str(plan?.setting, 400), lore?.intro ? `The boss: ${name}. ${lore.intro}` : `The boss: ${name}.`].filter(Boolean).join(" ") : null;

  // 2. the challenge: written, then checked (write-code runs on the runner) and saved in the bank
  let ch: any;
  if (qtype === "write") {
    const w = await generateWrite(env, { difficulty, topic, lang, quest });
    if (!w) {
      if (!boss) throw new HttpError(503, `The AI couldn't produce a problem that passed its own checks: ${whyWriteFailed()}. Try again.`);
      // no checked problem from the AI: a ready-made boss instead (same skill if there is one), so the battle can still start
      const pick = BOSS_BANK.filter((x) => x.skill === skill?.key);
      const pool = pick.length ? pick : BOSS_BANK.filter((x) => x.difficulty === difficulty).length ? BOSS_BANK.filter((x) => x.difficulty === difficulty) : BOSS_BANK;
      const r = await bankBoss(env, g, pool[Math.floor(Math.random() * pool.length)], by);
      return { ...r, fallback: true };
    }
    ch = await saveGeneratedWrite(env, { ...g, lang }, w, difficulty, by, "ai");
  } else {
    const codeLang = guildLangs({ code_lang: b.code_lang || "" }).includes(b.code_lang) ? b.code_lang : pickGuildLang(g);
    const gen = await generateQuick(env, { difficulty, kind: qtype, topic, lang, codeLang, examples: await bankExamples(env, { ...g, lang }, qtype, difficulty, codeLang) });
    if (!gen) throw new HttpError(503, "The AI couldn't produce a checked challenge right now (busy or daily limit reached). Try again.");
    ch = await createChallenge(env, g, { ...gen, difficulty, code_lang: codeLang, lang, source: "ai" }, by);
  }
  if (!ch) throw new HttpError(503, "The AI couldn't produce a checked challenge right now (busy or daily limit reached). Try again.");
  if (skill) await setSkills(env, ch.id, [skill.key]);
  const challenge = { id: ch.id, title: ch.title, difficulty: ch.difficulty, kind: ch.kind };

  // 3. settings sized to the class
  const lvl = { easy: 0, medium: 1, hard: 2 }[difficulty as "easy" | "medium" | "hard"] ?? 1;
  if (boss) {
    const fighters = Math.max(3, Math.round(players * 0.6)); // about 60% of the active class must hit it
    return { name, why, lore, challenge, players, fighters, hp: Math.min(5000, fighters * 40), hours: lvl === 2 ? 48 : 24, reward: [15, 25, 40][lvl], coins: [10, 15, 25][lvl] };
  }
  return { why, challenge, players, points: [25, 40, 60][lvl], coins: [15, 25, 40][lvl], hours: lvl === 2 ? 48 : 24 };
}

/** A ready-made boss (see bossbank.ts): its problem saved in the bank (once per class) and the same shape as the AI helper. */
async function bankBoss(env: Env, g: GuildRow, b: (typeof BOSS_BANK)[number], by: string) {
  const L = g.lang === "fr" ? "fr" : "en";
  const title = b.title[L];
  let ch = await one<any>(env, "SELECT id, title, difficulty, kind FROM challenges WHERE guild_id = ? AND kind = 'write' AND title = ? AND status != 'archived' ORDER BY id DESC LIMIT 1", g.id, title);
  if (!ch) {
    ch = await saveGeneratedWrite(env, { ...g, lang: L }, { title, statement: b.statement[L], hint: b.hint[L], topic: skillName(b.skill, L), reference: b.solution, timeLimit: 3, tests: b.tests }, b.difficulty as Difficulty, by, "teacher");
    if (!ch) throw new HttpError(500, "couldn't save the boss's challenge");
    await setSkills(env, ch.id, [b.skill]);
  }
  const act = await one<{ n: number }>(env, "SELECT COUNT(DISTINCT discord_id) AS n FROM attempts WHERE guild_id = ? AND started_at >= ?", g.id, now() - 14 * 86400);
  const players = Math.max(4, Number(act?.n) || 0);
  const lvl = { easy: 0, medium: 1, hard: 2 }[b.difficulty] ?? 1;
  const fighters = Math.max(3, Math.round(players * 0.6));
  return {
    name: b.name[L], why: L === "fr" ? `Boss prêt à l'emploi : ${skillName(b.skill, L)}.` : `Ready-made boss: ${skillName(b.skill, L)}.`,
    lore: { ...b.lore[L], hits: [...b.lore[L].hits] }, challenge: { id: ch.id, title: ch.title, difficulty: ch.difficulty, kind: ch.kind },
    players, fighters, hp: Math.min(5000, fighters * 40), hours: lvl === 2 ? 48 : 24, reward: [15, 25, 40][lvl], coins: [10, 15, 25][lvl], bank: b.id,
  };
}

async function createChallenge(env: Env, g: GuildRow, b: any, by: string) {
  const c = cleanChallenge(b);
  if (c.kind === "write") return createWrite(env, g, b, c, by);
  const r = await run(env,
    `INSERT INTO challenges (guild_id, source, kind, difficulty, lang, code_lang, title, question, code, choices, answer, alternatives, hint, explanation, topic, hr_slug, url, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    g.id, b.source === "ai" ? "ai" : c.kind === "code" ? "hackerrank" : "teacher", c.kind, c.difficulty,
    c.kind === "code" ? "any" : (b.lang ?? g.lang), c.kind === "code" ? null : (guildLangs({ code_lang: b.code_lang || "" }).includes(b.code_lang) ? b.code_lang : guildLangs(g)[0]),
    c.title, c.question, c.code, c.choices, c.answer, c.alternatives, c.hint, c.explanation, c.topic, c.hr_slug, c.url, by, now());
  if (Array.isArray(b.skills) && b.skills.length) await setSkills(env, Number(r.meta.last_row_id), b.skills);
  return one(env, "SELECT * FROM challenges WHERE id = ?", Number(r.meta.last_row_id));
}

async function importChallenge(env: Env, g: GuildRow, b: any, by: string) {
  const slug = parseChallengeSlug(String(b.url ?? ""));
  if (!slug) throw new HttpError(400, "Paste a link like https://www.hackerrank.com/challenges/<name>/problem");
  let title = slug.replace(/-/g, " ").replace(/\b\w/g, (x) => x.toUpperCase());
  let difficulty: string | null = b.difficulty ?? null;
  try {
    const info = await fetchChallenge(slug);
    title = info.title;
    difficulty = difficulty ?? info.difficulty;
  } catch { /* HackerRank unreachable: fall back to what the teacher typed */ }
  return createChallenge(env, g, { kind: "code", difficulty: difficulty ?? "medium", title: b.title || title, url: slug }, by);
}

async function updateChallenge(env: Env, g: GuildRow, cid: number, b: any) {
  const old = await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ? AND (guild_id IS NULL OR guild_id = ?)", cid, g.id);
  if (!old) throw new HttpError(404, "unknown challenge");
  const c = cleanChallenge({ ...old, choices: old.choices ? JSON.parse(old.choices) : null, alternatives: old.alternatives ? JSON.parse(old.alternatives) : [], ...b });
  await run(env,
    `UPDATE challenges SET kind = ?, difficulty = ?, title = ?, question = ?, code = ?, choices = ?, answer = ?, alternatives = ?, hint = ?, explanation = ?, topic = ?, hr_slug = ?, url = ?, status = ? WHERE id = ?`,
    c.kind, c.difficulty, c.title, c.question, c.code, c.choices, c.answer, c.alternatives, c.hint, c.explanation, c.topic, c.hr_slug, c.url,
    b.status && ["active", "flagged", "archived"].includes(b.status) ? b.status : old.status, cid);
  if (c.kind === "write" && (b.solution !== undefined || b.tests !== undefined || b.time_limit !== undefined)) {
    await saveWriteTests(env, old, b);
  }
  if (Array.isArray(b.skills)) await setSkills(env, cid, b.skills);
  if (b.solution !== undefined && b.solution !== old.solution) await run(env, "UPDATE challenges SET hints = NULL, solutions = NULL WHERE id = ?", cid);
  let regraded = 0;
  if (old.kind !== "write" && b.regrade && (c.answer !== old.answer || c.alternatives !== old.alternatives)) {
    regraded = await regrade(env, g, (await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ?", cid))!);
  }
  return { ...(await challengeDetail(env, g, cid)), regraded };
}

async function reports(env: Env, g: GuildRow) {
  return all(env,
    `SELECT c.id AS challenge_id, c.title, c.kind, c.difficulty, c.status AS challenge_status, COUNT(r.id) AS n,
            GROUP_CONCAT(COALESCE(p.name, '?') || ': ' || COALESCE(r.reason, ''), ' | ') AS reasons, MAX(r.created_at) AS last
       FROM reports r JOIN challenges c ON c.id = r.challenge_id
       LEFT JOIN players p ON p.guild_id = r.guild_id AND p.discord_id = r.discord_id
      WHERE r.guild_id = ? AND r.status = 'open' GROUP BY c.id ORDER BY last DESC`, g.id);
}

async function resolveReports(env: Env, g: GuildRow, b: any) {
  const cid = Number(b.challenge_id);
  const action = String(b.action);
  let regraded = 0;
  if (action === "archive") await run(env, "UPDATE challenges SET status = 'archived' WHERE id = ?", cid);
  else if (action === "fix") regraded = (await updateChallenge(env, g, cid, { ...b.fields, status: "active", regrade: true })).regraded;
  else await run(env, "UPDATE challenges SET status = 'active' WHERE id = ? AND status = 'flagged'", cid);
  await run(env, "UPDATE reports SET status = 'resolved' WHERE challenge_id = ? AND guild_id = ?", cid, g.id);
  return { ok: true, regraded };
}

// =========================================================== assignments
async function assignments(env: Env, g: GuildRow) {
  return all(env,
    `SELECT s.id, s.challenge_id, s.discord_id, s.status, s.due_at, s.note, s.created_at, s.completed_at,
            c.title, c.difficulty, c.kind, p.name, a.points
       FROM assignments s JOIN challenges c ON c.id = s.challenge_id
       LEFT JOIN players p ON p.guild_id = s.guild_id AND p.discord_id = s.discord_id
       LEFT JOIN attempts a ON a.id = s.attempt_id
      WHERE s.guild_id = ? AND s.status != 'cancelled' ORDER BY s.created_at DESC, s.id LIMIT 2000`, g.id);
}

async function assign(env: Env, g: GuildRow, b: any) {
  const c = await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ? AND (guild_id IS NULL OR guild_id = ?)", Number(b.challenge_id), g.id);
  if (!c) throw new HttpError(404, "unknown challenge");
  let targets: string[] = (b.students ?? []).map(String);
  if (b.all) targets = (await withoutStaff(env, g.id, await all<{ discord_id: string }>(env, "SELECT discord_id FROM players WHERE guild_id = ?", g.id))).map((r) => r.discord_id);
  if (b.team_id) targets.push(...(await all<{ discord_id: string }>(env, "SELECT discord_id FROM team_members WHERE team_id = ? AND guild_id = ?", Number(b.team_id), g.id)).map((r) => r.discord_id));
  targets = [...new Set(targets)];
  if (!targets.length) throw new HttpError(400, "choose at least one student");
  const due = b.due_at ? Number(b.due_at) : null;
  const note = b.note ? String(b.note).slice(0, 300) : null;
  const ids: number[] = [];
  for (const d of targets) {
    const r = await run(env, "INSERT INTO assignments (guild_id, challenge_id, discord_id, note, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?)", g.id, c.id, d, note, due, now());
    ids.push(Number(r.meta.last_row_id));
  }
  // notify: one channel message for everyone (+ DMs for small groups, Workers allow ~50 calls per request)
  const L = g.lang;
  const vars = {
    title: c.title, difficulty: t(L, `diff.${c.difficulty}`),
    due: due ? t(L, "asg.due", { when: ts(due) }) : "", note: note ? t(L, "asg.note", { note }) : "",
  };
  let dms = 0;
  if (b.notify !== "channel" && targets.length <= 20) {
    for (let i = 0; i < targets.length; i++) {
      if (await dm(env, targets[i], { content: t(L, "asg.dm", vars), components: [row(btn(t(L, "asg.start_btn"), `astart:${ids[i]}`, 1, "📚"))] })) dms++;
    }
  }
  let posted = false;
  const channel = await arenaChannel(env, g);
  if (channel && (b.notify !== "dm" || dms < targets.length)) {
    await send(env, channel, {
      content: t(L, "asg.channel", { ...vars, users: targets.slice(0, 80).map(mention).join(" ") }),
      components: [row(btn(t(L, "asg.start_btn"), `abatch:${c.id}`, 1, "📚"))],
      allowed_mentions: pingUsers(targets),
    }).then(() => (posted = true)).catch(() => {});
  }
  return { created: ids.length, dms, posted };
}

// ============================================================== contests
async function contestDetail(env: Env, g: GuildRow, cid: number) {
  const c = await one<ContestRow>(env, "SELECT * FROM contests WHERE id = ? AND guild_id = ?", cid, g.id);
  if (!c) throw new HttpError(404, "unknown contest");
  const results = await all(env, "SELECT r.*, p.name FROM contest_results r LEFT JOIN players p ON p.guild_id = r.guild_id AND p.discord_id = r.discord_id WHERE r.contest_id = ? ORDER BY r.rank", cid);
  const awards = await all(env, "SELECT award, hr_username, discord_id, detail FROM awards WHERE contest_id = ?", cid);
  const bets = await all(env, "SELECT b.*, p.name FROM bets b LEFT JOIN players p ON p.guild_id = ? AND p.discord_id = b.discord_id WHERE b.contest_id = ?", g.id, cid);
  const teamRows = await all(env, "SELECT t.name, tp.rank, tp.avg_score, tp.points FROM team_points tp JOIN teams t ON t.id = tp.team_id WHERE tp.contest_id = ? ORDER BY tp.rank", cid);
  const st = JSON.parse(c.state || "{}");
  return { ...c, state: undefined, snaps: JSON.parse(c.snaps || "[]"), live: st.frozen_board ?? null, results, awards, bets, teams: teamRows };
}

// ================================================================= teams
async function teams(env: Env, g: GuildRow) {
  const rows = await all<{ id: number; name: string; discord_id: string | null; pname: string | null; pts: number }>(env,
    `SELECT t.id, t.name, m.discord_id, p.name AS pname,
            (SELECT COALESCE(SUM(points), 0) FROM team_points tp WHERE tp.team_id = t.id AND tp.season = ?) AS pts
       FROM teams t LEFT JOIN team_members m ON m.team_id = t.id
       LEFT JOIN players p ON p.guild_id = m.guild_id AND p.discord_id = m.discord_id
      WHERE t.guild_id = ? ORDER BY t.name`, g.season, g.id);
  const map = new Map<number, { id: number; name: string; points: number; members: { id: string; name: string | null }[] }>();
  for (const r of rows) {
    if (!map.has(r.id)) map.set(r.id, { id: r.id, name: r.name, points: r.pts, members: [] });
    if (r.discord_id) map.get(r.id)!.members.push({ id: r.discord_id, name: r.pname });
  }
  return [...map.values()];
}

// ============================================================== overview
async function overview(env: Env, g: GuildRow) {
  const t0 = now(), d7 = t0 - 7 * 86400, d14 = t0 - 14 * 86400, d30 = t0 - 30 * 86400;
  const SOLVED = "(status = 'solved' OR (status = 'claimed' AND verified = 1))";
  const prev = await one<any>(env,
    `SELECT (SELECT COUNT(DISTINCT discord_id) FROM attempts WHERE guild_id = ? AND started_at >= ? AND started_at < ?) AS active_prev7,
            (SELECT COUNT(*) FROM attempts WHERE guild_id = ? AND finished_at >= ? AND finished_at < ? AND ${SOLVED}) AS solved_prev7,
            (SELECT COUNT(*) FROM duels WHERE guild_id = ? AND finished_at >= ? AND finished_at < ?) AS duels_prev7`,
    g.id, d14, d7, g.id, d14, d7, g.id, d14, d7);
  const byKind = await all(env,
    `SELECT c.kind, SUM(a.status = 'solved' OR (a.status = 'claimed' AND a.verified = 1)) AS solved, SUM(a.status = 'failed') AS failed
       FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.guild_id = ? AND a.finished_at >= ? GROUP BY c.kind`, g.id, d30);
  const byDiff = await all(env,
    `SELECT c.difficulty, SUM(a.status = 'solved' OR (a.status = 'claimed' AND a.verified = 1)) AS solved, SUM(a.status = 'failed') AS failed
       FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.guild_id = ? AND a.finished_at >= ? GROUP BY c.difficulty`, g.id, d30);
  const langs = await all(env,
    "SELECT lang, COUNT(*) AS n FROM attempts WHERE guild_id = ? AND lang IS NOT NULL AND answer_given IS NOT NULL GROUP BY lang ORDER BY n DESC", g.id);
  const counts = await one<any>(env,
    `SELECT (SELECT COUNT(*) FROM players WHERE guild_id = ?) AS students,
            (SELECT COUNT(*) FROM players WHERE guild_id = ? AND hr_username IS NOT NULL AND hr_verified = 1) AS linked,
            (SELECT COUNT(DISTINCT discord_id) FROM attempts WHERE guild_id = ? AND started_at >= ?) AS active7,
            (SELECT COUNT(*) FROM attempts WHERE guild_id = ? AND finished_at >= ? AND (status = 'solved' OR (status = 'claimed' AND verified = 1))) AS solved7,
            (SELECT COUNT(*) FROM attempts WHERE guild_id = ? AND finished_at >= ? AND (status = 'solved' OR (status = 'claimed' AND verified = 1))) AS solved30,
            (SELECT COUNT(*) FROM attempts WHERE guild_id = ? AND finished_at >= ? AND status = 'failed') AS failed30,
            (SELECT COUNT(*) FROM duels WHERE guild_id = ? AND finished_at >= ?) AS duels7,
            (SELECT COUNT(*) FROM contests WHERE guild_id = ? AND status = 'finished') AS contests,
            (SELECT COUNT(*) FROM contests WHERE guild_id = ? AND status = 'active') AS live_contests,
            (SELECT COUNT(DISTINCT challenge_id) FROM reports WHERE guild_id = ? AND status = 'open') AS reports,
            (SELECT COUNT(*) FROM attempts WHERE guild_id = ? AND status = 'claimed' AND verified = 0) AS claims,
            (SELECT COUNT(*) FROM assignments WHERE guild_id = ? AND status = 'open') AS open_asg,
            (SELECT COUNT(*) FROM attempts WHERE guild_id = ? AND integrity IS NOT NULL AND reviewed = 0 AND json_extract(integrity, '$.level') > 0) AS flagged,
            (SELECT COUNT(*) FROM sessions WHERE guild_id = ? AND status = 'active') AS live_sessions`,
    g.id, g.id, g.id, d7, g.id, d7, g.id, d30, g.id, d30, g.id, d7, g.id, g.id, g.id, g.id, g.id, g.id, g.id);
  const dayStart = Math.floor(t0 / 86400) * 86400 - 29 * 86400;
  const act = await all<{ d: number; solved: number; failed: number; active: number }>(env,
    `SELECT CAST((COALESCE(finished_at, started_at) - ?) / 86400 AS INTEGER) AS d, SUM(status = 'solved' OR (status = 'claimed' AND verified = 1)) AS solved,
            SUM(status = 'failed') AS failed, COUNT(DISTINCT discord_id) AS active
       FROM attempts WHERE guild_id = ? AND COALESCE(finished_at, started_at) >= ? GROUP BY d`, dayStart, g.id, dayStart);
  const activity = Array.from({ length: 30 }, (_, i) => {
    const r = act.find((a) => a.d === i);
    return { day: new Date((dayStart + i * 86400) * 1000).toISOString().slice(0, 10), solved: r?.solved ?? 0, failed: r?.failed ?? 0, active: r?.active ?? 0 };
  });
  const movers = await all(env,
    `SELECT l.discord_id, p.name, SUM(l.amount) AS pts FROM ledger l LEFT JOIN players p ON p.guild_id = l.guild_id AND p.discord_id = l.discord_id
      WHERE l.guild_id = ? AND l.created_at >= ? AND l.discord_id IS NOT NULL AND l.discord_id != ? AND ${inClass("l.discord_id", "l.guild_id")} GROUP BY l.discord_id ORDER BY pts DESC LIMIT 5`, g.id, d7, await boardHidden(env, g.id));
  const feedA = await all<any>(env,
    `SELECT a.finished_at AS at, a.discord_id, p.name, a.status, a.origin, a.points, c.title, c.difficulty
       FROM attempts a JOIN challenges c ON c.id = a.challenge_id LEFT JOIN players p ON p.guild_id = a.guild_id AND p.discord_id = a.discord_id
      WHERE a.guild_id = ? AND a.finished_at IS NOT NULL AND a.status IN ('solved', 'claimed', 'failed') ORDER BY a.finished_at DESC LIMIT 15`, g.id);
  const claimList = await all(env,
    `SELECT a.id, a.discord_id, p.name, p.hr_display, p.hr_verified, a.answer_given, a.finished_at, c.title, c.url, c.difficulty
       FROM attempts a JOIN challenges c ON c.id = a.challenge_id LEFT JOIN players p ON p.guild_id = a.guild_id AND p.discord_id = a.discord_id
      WHERE a.guild_id = ? AND a.status = 'claimed' AND a.verified = 0 ORDER BY a.finished_at DESC LIMIT 20`, g.id);
  const studentsList = await students(env, g);
  const applied = new Set((await all<{ name: string }>(env, "SELECT name FROM d1_migrations").catch(() => [])).map((r) => r.name));
  return {
    guild: g, ...counts, ...prev, byKind, byDiff, langs,
    top: studentsList.slice(0, 8),
    missingMigrations: applied.size ? MIGRATIONS.filter((m) => !applied.has(m)) : [],
    accuracy30: counts.solved30 + counts.failed30 ? Math.round((100 * counts.solved30) / (counts.solved30 + counts.failed30)) : null,
    activity, movers, feed: feedA, claimList,
    attention: studentsList.filter((s) => s.attention.length).slice(0, 12),
  };
}

// ================================================================ export
/** Export grades: each student's level, briefs validated or not, competencies to work on, recurring problems, plan d'action. */
async function exportCsv(env: Env, g: GuildRow) {
  const rows = await classReport(env, g, await students(env, g));
  return new Response(reportCsv(rows, g.lang === "fr"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="report-${g.season.replace(/[^\w-]+/g, "_")}.csv"` },
  });
}

// ======================================================== write-code problems
const MAX_TESTS = 12;

/** Validate a teacher's write-code problem: run the reference solution on every test to get the expected outputs. */
async function computeTests(env: Env, solution: string, rawTests: any[], limit: number) {
  if (!solution.trim()) throw new HttpError(400, "a reference solution (Python) is required: it computes the expected outputs");
  const tests = (Array.isArray(rawTests) ? rawTests : [])
    .map((x: any) => ({ input: String(x?.input ?? "").replace(/\r/g, ""), sample: x?.sample ? 1 : 0 }))
    .filter((x) => x.input.trim());
  if (tests.length < 2) throw new HttpError(400, "add at least 2 tests (one shown as a sample, the others hidden)");
  if (tests.length > MAX_TESTS) throw new HttpError(400, `at most ${MAX_TESTS} tests`);
  if (!tests.some((x) => x.sample)) tests[0].sample = 1;
  if (tests.some((x) => x.input.length > 60000)) throw new HttpError(400, "each test input must be under 60,000 characters");
  let res;
  try {
    res = await runPythonTests(env, solution, tests.map((x) => ({ input: x.input, gen: null })), Math.max(limit, 5), 2500);
  } catch (e) {
    throw new HttpError(503, "The code runner is unreachable right now: " + (e as Error).message);
  }
  if (res.compile) throw new HttpError(400, "the reference solution doesn't compile: " + res.compile);
  return tests.map((x, i) => {
    const r = res.rows[i];
    if (!r) throw new HttpError(400, `the reference solution ran out of time before test ${i + 1}`);
    if (r.s === "tle") throw new HttpError(400, `the reference solution is too slow on test ${i + 1}`);
    if (r.s === "re") throw new HttpError(400, `the reference solution crashed on test ${i + 1}: ${r.e}`);
    if (r.n > 2500) throw new HttpError(400, `test ${i + 1}: the expected output is too long (max 2,500 characters)`);
    if (!r.o) throw new HttpError(400, `test ${i + 1}: the reference solution printed nothing`);
    return { input: x.input, gen: null, expected: r.o, sample: x.sample };
  });
}

async function createWrite(env: Env, g: GuildRow, b: any, c: Record<string, unknown>, by: string) {
  const limit = Math.min(10, Math.max(1, Number(b.time_limit) || 2));
  const tests = await computeTests(env, String(b.solution ?? ""), b.tests, limit);
  const lang = b.lang === "fr" || b.lang === "en" ? b.lang : g.lang;
  const saved = await saveGeneratedWrite(env, { ...g, lang }, {
    title: String(c.title), statement: String(c.question), hint: String(c.hint ?? ""), topic: String(c.topic ?? ""),
    reference: String(b.solution), timeLimit: limit, tests,
  }, c.difficulty as Difficulty, by, "teacher");
  if (c.explanation) await run(env, "UPDATE challenges SET explanation = ? WHERE id = ?", c.explanation, saved!.id);
  return saved;
}

async function saveWriteTests(env: Env, old: ChallengeRow, b: any) {
  const limit = Math.min(10, Math.max(1, Number(b.time_limit ?? old.time_limit) || 2));
  const solution = String(b.solution ?? old.solution ?? "");
  let tests: any[] = b.tests;
  if (!Array.isArray(tests)) {
    // keep the current tests, recompute nothing unless the solution changed
    if (b.solution === undefined || b.solution === old.solution) {
      await run(env, "UPDATE challenges SET time_limit = ? WHERE id = ?", limit, old.id);
      return;
    }
    const cur = await loadTests(env, old);
    if (cur.some((x) => !x.input)) throw new HttpError(400, "this problem has generated tests: edit the tests too when you change the solution");
    tests = cur.map((x) => ({ input: x.input, sample: x.sample }));
  }
  const computed = await computeTests(env, solution, tests, limit);
  const set = `teacher-${crypto.randomUUID().slice(0, 8)}`;
  await env.DB.batch(computed.map((tc, i) => env.DB.prepare("INSERT INTO challenge_tests (test_set, idx, input, gen, expected, sample) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(set, i, tc.input, null, tc.expected, tc.sample)));
  // a new test set: the same problem in the other language (bank) keeps its own
  await run(env, "UPDATE challenges SET test_set = ?, solution = ?, time_limit = ? WHERE id = ?", set, solution, limit, old.id);
}

// ============================================================== settings
async function settings(env: Env, g: GuildRow) {
  return { ...g, scoring: scoringOf(g), scoring_custom: !!g.scoring, default_scoring: DEFAULT_SCORING, score_kinds: SCORE_KINDS, integrity: integrityOf(g) };
}

// =========================================================== diagnostics
async function diagnostics(env: Env, g: GuildRow) {
  const timed = async <T>(fn: () => Promise<T>) => {
    try { return await fn(); } catch (e) { return { ok: false, ms: 0, detail: (e as Error).message } as any; }
  };
  const [runner, ai, hackerrank, arena] = await Promise.all([
    timed(() => runnerHealth(env)),
    timed(() => aiHealth(env)),
    timed(() => hackerrankHealth()),
    arenaChannel(env, g).catch(() => null),
  ]);
  const budget = await aiBudgetLeft(env);
  const applied = new Set((await all<{ name: string }>(env, "SELECT name FROM d1_migrations").catch(() => [])).map((r) => r.name));
  const migrations = { ok: applied.size ? MIGRATIONS.every((m) => applied.has(m)) : null, missing: applied.size ? MIGRATIONS.filter((m) => !applied.has(m)) : [] };
  const queue = await all(env, "SELECT status, COUNT(*) AS n FROM ai_queue WHERE guild_id = ? AND created_at > ? GROUP BY status", g.id, now() - 86400);
  const bank = await all(env, `SELECT kind, difficulty, COUNT(*) AS n FROM challenges WHERE status = 'active' AND (guild_id IS NULL OR guild_id = ?)
    AND (kind = 'code' OR lang = ?) GROUP BY kind, difficulty`, g.id, g.lang);
  return { runner, ai: { ...ai, provider: await aiProviderLabel(env) }, hackerrank, arena, budget, queue, bank, migrations };
}

// ================================================================ daily
async function dailySettings(env: Env, g: GuildRow, b: any) {
  const cfg = dailyConfig(g);
  if (b.enabled !== undefined) cfg.enabled = !!b.enabled;
  if (Array.isArray(b.langs)) cfg.langs = b.langs.filter((l: unknown) => typeof l === "string" && ["python", "javascript", "php", "java", "c", "cpp"].includes(l as string));
  if (Array.isArray(b.plan) && b.plan.length === 7) {
    cfg.plan = b.plan.map((p: any, i: number) => [DIFFS.includes(p?.[0]) ? p[0] : cfg.plan[i][0], DAILY_KINDS.includes(p?.[1]) ? p[1] : cfg.plan[i][1]]);
  }
  const hour = b.hour === undefined ? g.daily_hour : Math.min(23, Math.max(0, Math.round(Number(b.hour)) || 0));
  const channel = b.channel_id === undefined ? g.daily_channel : b.channel_id || null;
  await run(env, "UPDATE guilds SET daily_cfg = ?, daily_hour = ?, daily_channel = ? WHERE id = ?", JSON.stringify(cfg), hour, channel, g.id);
  return dailyOverview(env, await getGuild(env, g.id));
}

// =============================================================== points
/**
 * Change many students' points at once. Everything goes through the ledger
 * (nothing is deleted), so the history stays readable.
 *   action "add" / "remove": +amount / -amount
 *   action "set": bring each student to exactly `amount` (0 = reset)
 *   scope "season": this season's points · "all": every season (also resets levels)
 */
async function bulkPoints(env: Env, g: GuildRow, b: any, ctx: Ctx) {
  const action = String(b.action);
  if (!["add", "remove", "set"].includes(action)) throw new HttpError(400, "action must be add, remove or set");
  const amount = Math.round(Number(b.amount));
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) throw new HttpError(400, "amount must be a number between 0 and 100000");
  if (action !== "set" && !amount) throw new HttpError(400, "amount must be more than 0");
  const scope = b.scope === "all" ? "all" : "season";
  let ids: string[] = b.all ? (await withoutStaff(env, g.id, await all<{ discord_id: string }>(env, "SELECT discord_id FROM players WHERE guild_id = ?", g.id))).map((r) => r.discord_id)
    : (Array.isArray(b.students) ? b.students.map(String) : []);
  ids = [...new Set(ids)];
  if (!ids.length) throw new HttpError(400, "choose at least one student");
  const reason = String(b.reason ?? "").trim().slice(0, 200) || (action === "set" ? (amount ? `points set to ${amount}` : "points reset") : "");
  const t0 = now();
  const stmts: D1Stmt[] = [];
  const add = (did: string, season: string, amt: number) => {
    if (!amt) return;
    stmts.push(env.DB.prepare("INSERT INTO ledger (guild_id, discord_id, hr_username, season, amount, reason, ref, note, created_at) VALUES (?, ?, NULL, ?, ?, 'adjust', NULL, ?, ?)")
      .bind(g.id, did, season, amt, reason || null, t0));
  };
  const changes: { id: string; delta: number }[] = [];
  if (action !== "set") {
    for (const id of ids) { add(id, g.season, action === "add" ? amount : -amount); changes.push({ id, delta: action === "add" ? amount : -amount }); }
  } else {
    // current totals per student and season
    const rows = await all<{ discord_id: string; season: string; pts: number }>(env,
      `SELECT discord_id, season, SUM(amount) AS pts FROM ledger WHERE guild_id = ? AND discord_id IS NOT NULL ${scope === "season" ? "AND season = ?" : ""} GROUP BY discord_id, season`,
      g.id, ...(scope === "season" ? [g.season] : []));
    for (const id of ids) {
      const mine = rows.filter((r) => r.discord_id === id);
      let delta = 0;
      if (scope === "all") for (const r of mine) if (r.season !== g.season && r.pts) { add(id, r.season, -r.pts); delta -= r.pts; }
      const cur = mine.find((r) => r.season === g.season)?.pts ?? 0;
      add(id, g.season, amount - cur);
      delta += amount - cur;
      changes.push({ id, delta });
    }
  }
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  if (b.notify) {
    const L = g.lang;
    const list = changes.filter((c) => c.delta).slice(0, 20);   // Workers allow ~50 calls per request
    ctx.waitUntil((async () => {
      for (const c of list) {
        await dm(env, c.id, { content: t(L, c.delta > 0 ? "points.added" : "points.removed", { n: Math.abs(c.delta), reason: reason ? ` · ${reason}` : "" }) }).catch(() => {});
      }
    })());
  }
  return { students: ids.length, entries: stmts.length, total: changes.reduce((s, c) => s + c.delta, 0) };
}

// ======================================================= automatic roles
async function rolesState(env: Env, g: GuildRow) {
  const cfg = autoRolesOf(g);
  const wanted = await wantedHolders(env, g);
  const ids = [...new Set([...Object.values(wanted).flat(), ...JSON.parse(g.champion_holders || "[]"), ...JSON.parse(g.streak_holders || "[]")])];
  const names = new Map((ids.length ? await all<{ discord_id: string; name: string | null }>(env,
    `SELECT discord_id, name FROM players WHERE guild_id = ? AND discord_id IN (${ids.map(() => "?").join(", ")})`, g.id, ...ids) : []).map((r) => [r.discord_id, r.name]));
  const external: Record<string, string | null> = { champion: g.champion_role, streak: g.streak_role };
  return {
    on: cfg.on, error: cfg.error, synced: cfg.synced,
    roles: ROLE_DEFS.map((d) => {
      const holders = d.external ? JSON.parse((d.key === "champion" ? g.champion_holders : g.streak_holders) || "[]") as string[] : cfg.holders[d.key] ?? [];
      const people = (d.external ? holders : wanted[d.key] ?? []);
      return {
        key: d.key, name: d.name, color: "#" + d.color.toString(16).padStart(6, "0"), desc: d.desc, hoist: !!d.hoist, level: d.level ?? null,
        on: !cfg.off.includes(d.key), created: !!(cfg.ids[d.key] || (d.external && external[d.key])),
        count: people.length, people: people.slice(0, 5).map((id) => ({ id, name: names.get(id) ?? null })),
        pending: d.external ? 0 : (wanted[d.key] ?? []).filter((u) => !holders.includes(u)).length + holders.filter((u) => !(wanted[d.key] ?? []).includes(u)).length,
      };
    }),
  };
}

// ============================================================ integrity
async function integrityList(env: Env, g: GuildRow, includeReviewed: boolean) {
  const rows = await all<any>(env,
    `SELECT a.id, a.discord_id, p.name, a.challenge_id, c.title, c.kind, c.difficulty, a.origin, a.ref, a.status, a.points, a.lang, a.integrity, a.explain, a.reviewed, a.finished_at, a.started_at,
            (SELECT 1 FROM attempt_logs l WHERE l.attempt_id = a.id) AS has_log
       FROM attempts a JOIN challenges c ON c.id = a.challenge_id LEFT JOIN players p ON p.guild_id = a.guild_id AND p.discord_id = a.discord_id
      WHERE a.guild_id = ? AND a.integrity IS NOT NULL ${includeReviewed ? "" : "AND a.reviewed = 0 AND json_extract(a.integrity, '$.level') > 0"} ORDER BY a.id DESC LIMIT 300`, g.id);
  return rows.map((r) => {
    let rep: any = null, ex: any = null;
    try { rep = JSON.parse(r.integrity); } catch { rep = null; }
    try { ex = r.explain ? JSON.parse(r.explain) : null; } catch { ex = null; }
    return { ...r, integrity: undefined, explain: ex ? { score: ex.score, questions: ex.questions, answers: ex.answers, feedback: ex.feedback } : null, flags: rep?.flags ?? [], level: rep?.level ?? 0, stats: rep?.stats ?? null, similar: rep?.similar ?? [], editor: rep?.editor ?? false };
  }).filter((r) => includeReviewed || r.level > 0);
}

async function attemptLog(env: Env, g: GuildRow, id: number) {
  const a = await one<any>(env, "SELECT a.id, a.answer_given, a.lang, a.integrity FROM attempts a WHERE a.id = ? AND a.guild_id = ?", id, g.id);
  if (!a) throw new HttpError(404, "unknown attempt");
  const l = await one<{ events: string }>(env, "SELECT events FROM attempt_logs WHERE attempt_id = ?", id);
  let sessions: unknown[] = [];
  try { sessions = l ? JSON.parse(l.events) : []; } catch { sessions = []; }
  return { id: a.id, code: a.answer_given, lang: a.lang, sessions };
}

/** Teacher decision on a flagged attempt: "ok" (looks fine) or "void" (take the points back). */
async function reviewIntegrity(env: Env, g: GuildRow, id: number, b: any, ctx: Ctx) {
  const a = await one<any>(env, "SELECT a.*, c.title FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.id = ? AND a.guild_id = ?", id, g.id);
  if (!a) throw new HttpError(404, "unknown attempt");
  if (b.action === "void") {
    if (a.points > 0) { await addPoints(env, g, { discordId: a.discord_id, amount: -a.points, reason: "adjust", ref: a.id, note: `points removed by the teacher: ${String(b.reason || "integrity check").slice(0, 120)}` }); await challengeCoins(env, g, a.discord_id, -a.points); }
    await run(env, "UPDATE attempts SET points = 0, held = 0, reviewed = 2 WHERE id = ?", id);
    if (b.notify) ctx.waitUntil(dm(env, a.discord_id, { content: t(g.lang, "integrity.voided", { title: a.title, reason: String(b.reason || "").slice(0, 200) }) }).catch(() => {}));
  } else {
    await run(env, "UPDATE attempts SET reviewed = 1 WHERE id = ?", id);
  }
  return { ok: true };
}

// ======================================================== coaching helpers
async function sendPracticeSet(env: Env, g: GuildRow, b: any, ctx: Ctx) {
  const skill = String(b.skill ?? "");
  if (!SKILLS.some((x) => x.key === skill)) throw new HttpError(400, "unknown skill");
  const students: string[] = (Array.isArray(b.students) ? b.students : []).map(String).slice(0, 40);
  if (!students.length) throw new HttpError(400, "choose at least one student");
  const count = Math.min(5, Math.max(1, Math.round(Number(b.count) || 3)));
  const dueAt = b.due_at ? Number(b.due_at) : null;
  // each student works at their own level on this skill (a few queries for the whole class)
  const made = await practiceSet(env, g, { skill, students, count, dueAt, note: b.note ? String(b.note).slice(0, 300) : null });
  const L = g.lang;
  ctx.waitUntil((async () => {
    for (const m of made.slice(0, 20)) {          // 2 Discord calls each: stays under the free plan's limit
      if (!m.assignments.length) continue;
      await dm(env, m.discord_id, {
        content: t(L, "pset.dm", { skill: skillName(skill, L), n: m.challenges.length, due: dueAt ? `<t:${dueAt}:R>` : t(L, "pset.no_due") }),
        components: [{ type: 1, components: m.assignments.slice(0, 5).map((id, i) => ({ type: 2, style: 1, label: `${i + 1}`, emoji: { name: "📚" }, custom_id: `astart:${id}` })) }],
      }).catch(() => {});
    }
  })());
  return { students: made.length, assignments: made.reduce((n, m) => n + m.challenges.length, 0), empty: made.filter((m) => !m.challenges.length).map((m) => m.discord_id) };
}

async function examCsv(env: Env, g: GuildRow, id: number) {
  const s = await one<any>(env, "SELECT * FROM sessions WHERE id = ? AND guild_id = ?", id, g.id);
  if (!s) throw new HttpError(404, "unknown session");
  const ids: number[] = JSON.parse(s.challenges || "[]");
  const titles = new Map((await all<{ id: number; title: string }>(env, `SELECT id, title FROM challenges WHERE id IN (${ids.map(() => "?").join(", ") || "0"})`, ...ids)).map((c) => [c.id, c.title]));
  const grades = s.grades ? JSON.parse(s.grades) : await examGrades(env, s);
  const players = new Map((await all<{ discord_id: string; name: string | null }>(env, "SELECT discord_id, name FROM players WHERE guild_id = ?", g.id)).map((p) => [p.discord_id, p.name]));
  const flags = new Map((await all<{ discord_id: string; n: number }>(env,
    "SELECT discord_id, COUNT(*) AS n FROM attempts WHERE origin = 'exam' AND ref = ? AND integrity IS NOT NULL AND json_extract(integrity, '$.level') > 0 GROUP BY discord_id", id)).map((r) => [r.discord_id, r.n]));
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Student", "Discord ID", ...ids.map((i, k) => `Q${k + 1} ${titles.get(i) ?? ""} (%)`), "Grade /20", "Integrity flags"];
  const lines = Object.entries(grades as Record<string, any>).sort((a, b) => String(players.get(a[0]) ?? "").localeCompare(String(players.get(b[0]) ?? "")))
    .map(([u, v]) => [players.get(u) ?? "", u, ...ids.map((i) => Math.round((v.scores[i] ?? 0) * 100)), String(v.grade).replace(".", ","), flags.get(u) ?? 0].map(q).join(";"));
  const csv = "\ufeff" + [head.map(q).join(";"), ...lines].join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="exam-${id}.csv"` } });
}

// ------------------------------------------------------------- events
async function quizLive(env: Env, id: number) {
  const q = await one<QuizRow>(env, "SELECT * FROM quizzes WHERE id = ?", id);
  if (!q) return null;
  const ids: number[] = JSON.parse(q.questions);
  const cur = q.current >= 0 ? await one<{ id: number; title: string; answer: string | null }>(env, "SELECT id, title, answer FROM challenges WHERE id = ?", ids[q.current]) : null;
  const answers = q.current >= 0 ? await all<{ answer: string; n: number }>(env, "SELECT answer, COUNT(*) AS n FROM quiz_answers WHERE quiz_id = ? AND q_idx = ? GROUP BY answer", id, q.current) : [];
  return { ...q, total: ids.length, currentChallenge: cur, answers, standings: (await quizStandings(env, id)).slice(0, 20), endsAt: q.q_started ? q.q_started + q.seconds : null };
}

async function eventsState(env: Env, g: GuildRow) {
  const quizzes = await all<QuizRow>(env, "SELECT * FROM quizzes WHERE guild_id = ? ORDER BY id DESC LIMIT 20", g.id);
  const live = quizzes.find((q) => q.status !== "done");
  const bosses = await all(env, `SELECT b.*, c.title AS challenge_title, (SELECT COALESCE(SUM(damage), 0) FROM boss_hits h WHERE h.boss_id = b.id) AS damage,
      (SELECT COUNT(*) FROM boss_hits h WHERE h.boss_id = b.id AND h.damage > 0) AS fighters FROM bosses b JOIN challenges c ON c.id = b.challenge_id WHERE b.guild_id = ? ORDER BY b.id DESC LIMIT 20`, g.id);
  const bounties = await all(env, `SELECT b.*, c.title AS challenge_title, p.name AS winner_name FROM bounties b JOIN challenges c ON c.id = b.challenge_id
      LEFT JOIN players p ON p.guild_id = b.guild_id AND p.discord_id = b.winner_id WHERE b.guild_id = ? ORDER BY b.id DESC LIMIT 30`, g.id);
  const shop = await all(env, "SELECT item, COUNT(*) AS n, SUM(cost) AS coins FROM purchases WHERE guild_id = ? GROUP BY item", g.id);
  const help = await one<{ open: number; answered: number; helpful: number }>(env, `SELECT
      (SELECT COUNT(*) FROM help_requests WHERE guild_id = ?1 AND status = 'open') AS open,
      (SELECT COUNT(*) FROM help_answers h JOIN help_requests r ON r.id = h.request_id WHERE r.guild_id = ?1) AS answered,
      (SELECT COUNT(*) FROM help_answers h JOIN help_requests r ON r.id = h.request_id WHERE r.guild_id = ?1 AND h.rating = 1) AS helpful`, g.id);
  return {
    quizzes: quizzes.map((q) => ({ ...q, total: (JSON.parse(q.questions) as number[]).length })),
    live: live ? await quizLive(env, live.id) : null,
    bosses, bounties,
    shop: SHOP.map((it) => ({ ...it, ...(shop.find((x: any) => x.item === it.key) ?? { n: 0, coins: 0 }) })),
    help,
  };
}

// ------------------------------------------------------------ path page
async function pathView(env: Env, g: GuildRow) {
  const langs = classLangs(g);
  return {
    ...pathCfg(g), custom: pathCustom(g), langs, track: trackOf(g), tracks: TRACKS,
    defaults: { steps: defaultSteps(g), lessons: defaultLessons(g) },
    skills: SKILLS.map((s) => ({ ...s, fits: skillFitsTrack(s.key, g) })),
    coverage: await bankCoverage(env, g),
  };
}

// ------------------------------------------------- overview: what's live
async function overviewLive(env: Env, g: GuildRow) {
  const t0 = now(), week = t0 - 7 * 86400;
  const n = async (sql: string, ...a: unknown[]) => (await one<{ n: number }>(env, sql, ...a))?.n ?? 0;
  const hands = { waiting: await n("SELECT COUNT(*) AS n FROM hands WHERE guild_id = ? AND status = 'waiting'", g.id), helping: await n("SELECT COUNT(*) AS n FROM hands WHERE guild_id = ? AND status = 'helping'", g.id),
    oldest: (await one<{ t: number | null }>(env, "SELECT MIN(created_at) AS t FROM hands WHERE guild_id = ? AND status = 'waiting'", g.id))?.t ?? null };
  const questions = await n("SELECT COUNT(*) AS n FROM faq WHERE guild_id = ? AND status = 'pending'", g.id);
  const created = await n("SELECT COUNT(*) AS n FROM challenges WHERE guild_id = ? AND source = 'student' AND status = 'pending'", g.id);
  const quiz = await one<{ id: number; title: string; status: string }>(env, "SELECT id, title, status FROM quizzes WHERE guild_id = ? AND status IN ('draft', 'live') ORDER BY id DESC LIMIT 1", g.id);
  const bosses = await all<{ id: number; name: string; hp: number; deadline: number; d: number }>(env,
    "SELECT b.id, b.name, b.hp, b.deadline, COALESCE((SELECT SUM(damage) FROM boss_hits h WHERE h.boss_id = b.id), 0) AS d FROM bosses b WHERE b.guild_id = ? AND b.status = 'active'", g.id);
  const bounties = await n("SELECT COUNT(*) AS n FROM bounties WHERE guild_id = ? AND status = 'open'", g.id);
  // briefs in progress (published, deadline not passed long ago), what was handed in, what waits for its debrief
  const briefs = await one<{ open: number; handed: number }>(env,
    `SELECT COUNT(*) AS open, COALESCE(SUM((SELECT COUNT(*) FROM brief_handins h WHERE h.brief_id = b.id)), 0) AS handed
       FROM briefs b WHERE b.guild_id = ? AND b.status = 'assigned' AND (b.due_at IS NULL OR b.due_at > ?)`, g.id, t0 - 7 * 86400);
  const nextDue = await one<{ title: string; due_at: number }>(env, "SELECT title, due_at FROM briefs WHERE guild_id = ? AND status = 'assigned' AND due_at > ? ORDER BY due_at LIMIT 1", g.id, t0);
  const toDebrief = await n(`SELECT COUNT(*) AS n FROM brief_handins h JOIN briefs b ON b.id = h.brief_id WHERE h.guild_id = ? AND b.status = 'assigned' AND b.due_at < ?
    AND NOT EXISTS (SELECT 1 FROM brief_reviews r WHERE r.brief_id = h.brief_id AND r.who = h.who AND r.status = 'final')`, g.id, t0);
  const assess = await one<{ open: number; active: number; locked: number }>(env,
    `SELECT COUNT(DISTINCT a.id) AS open, COALESCE(SUM(t.status = 'active'), 0) AS active, COALESCE(SUM(t.status = 'locked' AND t.resume_ok = 0), 0) AS locked
       FROM assessments a LEFT JOIN assessment_takers t ON t.assessment_id = a.id WHERE a.guild_id = ? AND a.status = 'open'`, g.id);
  const interviews = await one<{ n: number; avg: number | null }>(env,
    "SELECT COUNT(*) AS n, AVG(json_extract(scores, '$.overall')) AS avg FROM interviews WHERE guild_id = ? AND created_at >= ?", g.id, week);
  const plans = await one<{ made: number; done: number; people: number }>(env,
    "SELECT COUNT(*) AS made, SUM(completed_at IS NOT NULL) AS done, COUNT(DISTINCT discord_id) AS people FROM daily_plans WHERE guild_id = ? AND created_at >= ?", g.id, week);
  const helped = await n("SELECT COUNT(*) AS n FROM help_answers a JOIN help_requests r ON r.id = a.request_id WHERE r.guild_id = ? AND a.rating = 1 AND a.created_at >= ?", g.id, week);
  const sessions = await n("SELECT COUNT(*) AS n FROM sessions WHERE guild_id = ? AND status = 'active'", g.id);
  const lg = leagueCfgOf(g);
  let league: { rank: number; total: number; score: number } | null = null;
  if (lg.on) {
    const table = await leagueTable(env, undefined, g);
    const i = table.findIndex((r) => r.guild_id === g.id);
    if (i >= 0) league = { rank: i + 1, total: table.length, score: table[i].score };
  }
  return {
    hands, questions, created, sessions,
    events: { quiz, bosses: bosses.map((b) => ({ ...b, left: Math.max(0, b.hp - b.d) })), bounties },
    briefs: { open: briefs?.open ?? 0, handed: briefs?.handed ?? 0, nextDue, toDebrief }, assess: { open: assess?.open ?? 0, active: assess?.active ?? 0, locked: assess?.locked ?? 0 },
    interviews: { n: interviews?.n ?? 0, avg: interviews?.avg == null ? null : Math.round(interviews.avg * 10) / 10 },
    plans: { made: plans?.made ?? 0, done: plans?.done ?? 0, people: plans?.people ?? 0 },
    helped, league: lg.on ? { name: lg.name, ...(league ?? { rank: null, total: 0, score: 0 }) } : null,
  };
}


/** Who gets the /help-me and /ask DMs, and which ones are on. */
async function notifyState(env: Env, g: GuildRow) {
  let teacher: { id: string; name: string } | null = null;
  if (g.teacher_id) {
    const m = await dapi<any>(env, "GET", `/guilds/${g.id}/members/${g.teacher_id}`).catch(() => null);
    teacher = { id: g.teacher_id, name: m?.nick ?? m?.user?.global_name ?? m?.user?.username ?? g.teacher_id };
  }
  return { teacher, cfg: notifyCfg(g), dashboard: !!env.DASHBOARD_URL };
}


/** Coins & shop page: every student's coins, the shop settings, rewards to hand out, recent purchases and coin changes. */
async function coinsView(env: Env, g: GuildRow) {
  const rows = await all<{ discord_id: string; name: string | null; coins: number; streak_freezes: number; hint_tokens: number; title: string | null; title_until: number | null; cosmetics: string | null }>(env,
    "SELECT discord_id, name, coins, streak_freezes, hint_tokens, title, title_until, cosmetics FROM players WHERE guild_id = ? ORDER BY coins DESC, name", g.id);
  // texts students wrote themselves (title, motto, emoji, victory message), so the teacher can remove one
  const students = rows.map(({ title, title_until, cosmetics, ...p }) => {
    const c = cosmeticsOf({ cosmetics }), tt = activeTitle({ title, title_until });
    const texts = [tt ? { key: "title", v: tt } : null, ...(["emoji", "motto", "victory"] as const).map((k) => (c[k] ? { key: k, v: c[k]! } : null))].filter(Boolean);
    return { ...p, texts };
  });
  const names = new Map(students.map((p) => [p.discord_id, p.name]));
  const items = shopItems(g, true);
  const label = (key: string) => { const it = items.find((x) => x.key === key); return it ? `${it.emoji} ${it.custom ? it.name : t(g.lang, `shop.name.${key}`)}` : key; };
  const purchases = await all<{ id: number; discord_id: string; item: string; cost: number; detail: string | null; status: string | null; created_at: number }>(env,
    "SELECT id, discord_id, item, cost, detail, status, created_at FROM purchases WHERE guild_id = ? ORDER BY id DESC LIMIT 60", g.id);
  const pending = await all<typeof purchases[number]>(env,
    "SELECT id, discord_id, item, cost, detail, status, created_at FROM purchases WHERE guild_id = ? AND status = 'pending' ORDER BY id LIMIT 100", g.id);
  const log = await all<{ discord_id: string; delta: number; balance: number; reason: string | null; created_at: number }>(env,
    "SELECT discord_id, delta, balance, reason, created_at FROM coin_log WHERE guild_id = ? ORDER BY id DESC LIMIT 40", g.id);
  const sold = await all<{ item: string; n: number }>(env, "SELECT item, COUNT(*) AS n FROM purchases WHERE guild_id = ? AND COALESCE(status, '') != 'refunded' GROUP BY item", g.id);
  const withName = <T extends { discord_id: string }>(r: T) => ({ ...r, name: names.get(r.discord_id) ?? null });
  return {
    students, total: students.reduce((a, p) => a + (p.coins ?? 0), 0),
    shop: { cfg: shopCfg(g), items, defaults: SHOP, sold: Object.fromEntries(sold.map((r) => [r.item, r.n])) },
    pending: pending.map((r) => ({ ...withName(r), label: label(r.item) })),
    purchases: purchases.map((r) => ({ ...withName(r), label: label(r.item) })),
    log: log.map(withName),
  };
}
