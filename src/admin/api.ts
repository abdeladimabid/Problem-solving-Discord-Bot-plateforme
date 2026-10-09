// JSON API behind the teacher dashboard.
import type { ChallengeRow, ContestRow, Ctx, D1Stmt, Difficulty, Env, GuildRow } from "../shared/types.ts";
import { addPoints, aiBudgetLeft, all, confirmHackerRank, getGuild, now, one, playerStats, run } from "../shared/db.ts";
import { DEFAULT_SCORING, SCORE_KINDS, dayKey, levelInfo, pointsFor, scoringOf, titleKey } from "../shared/game.ts";
import { t } from "../shared/i18n.ts";
import { btn, dapi, dm, mention, pingUsers, row, send, ts } from "../shared/discord.ts";
import { aiHealth, aiProviderLabel, generateQuick, generateWrite } from "../shared/ai.ts";
import { bankExamples, guildLangs, loadTests, pickGuildLang, regrade, saveGeneratedWrite } from "../shared/challenges.ts";
import { stopContest, trackContest, trackingEmbed } from "../shared/contests.ts";
import { fetchChallenge, hackerrankHealth, parseChallengeSlug } from "../shared/hackerrank.ts";
import { RunnerUnavailable, runPythonTests, runnerHealth } from "../shared/runner.ts";
import { arenaChannel } from "../shared/arena.ts";
import { MIGRATIONS } from "../shared/schema.ts";
import { integrityOf } from "../shared/integrity.ts";
import { createSession, endSession, sessionResults } from "../shared/sessions.ts";
import type { SessionRow } from "../shared/sessions.ts";
import { DAILY_KINDS, dailyConfig, dailyOverview, pickDaily, postDaily } from "../shared/daily.ts";
import type { DailyKind } from "../shared/daily.ts";

class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}
const ok = (data: unknown) => Response.json(data);
const DIFFS = ["easy", "medium", "hard"];
const KINDS = ["code", "write", "mcq", "output", "bug", "complexity"];

export async function handleApi(request: Request, env: Env, ctx: Ctx, user: { email: string; mode?: string }): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "");
  const method = request.method;
  const body: any = method === "GET" || method === "DELETE" ? {} : await request.json().catch(() => ({}));
  const gid = url.searchParams.get("g") ?? body.g;
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
      const s = await createSession(env, g, { title, challenges: ids, minutes, teamId: body.team_id ? Number(body.team_id) : null, channelId: body.channel_id || null });
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
    if (path === "/students") return ok(await students(env, await guild()));
    let m = path.match(/^\/students\/(\d+)$/);
    if (m && method === "GET") return ok(await studentDetail(env, await guild(), m[1]));
    m = path.match(/^\/students\/(\d+)\/points$/);
    if (m && method === "POST") {
      const g = await guild();
      const amount = Math.round(Number(body.amount));
      if (!amount || Math.abs(amount) > 10000) throw new HttpError(400, "amount must be a non-zero number");
      await addPoints(env, g, { discordId: m[1], amount, reason: "bonus", note: String(body.reason ?? "").slice(0, 200) });
      if (body.notify && amount > 0) ctx.waitUntil(dm(env, m[1], { content: `🎁 +${amount} pts${body.reason ? ` · ${String(body.reason).slice(0, 200)}` : ""}` }));
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
      try {
        if (body.kind === "write") {
          // checked on the runner, then saved (the tests are part of the problem)
          const w = await generateWrite(env, { difficulty, topic: body.topic || null, lang });
          if (!w) throw new HttpError(503, "The AI couldn't produce a problem that passed its own checks (busy or daily limit reached). Try again.");
          const c = await saveGeneratedWrite(env, { ...g, lang }, w, difficulty, user.email, "ai");
          return ok({ saved: true, challenge: c });
        }
        const kind = ["mcq", "complexity", "output", "bug"].includes(body.kind) ? body.kind : null;
        const codeLang = guildLangs({ code_lang: body.code_lang || "" }).includes(body.code_lang) ? body.code_lang : pickGuildLang(g);
        const gen = await generateQuick(env, { difficulty, kind, topic: body.topic || null, lang, codeLang, examples: await bankExamples(env, { ...g, lang }, kind, difficulty, codeLang) });
        if (!gen) throw new HttpError(503, "The AI couldn't produce a checked challenge right now (busy or daily limit reached). Try again.");
        return ok({ ...gen, code_lang: codeLang });
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
    if (path === "/settings" && method === "GET") return ok(await settings(env, await guild()));
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
    if (path === "/season" && method === "POST") {
      const g = await guild();
      const name = String(body.name ?? "").trim().slice(0, 60);
      if (!name) throw new HttpError(400, "name required");
      await run(env, "UPDATE guilds SET season = ? WHERE id = ?", name, g.id);
      if (body.announce) ctx.waitUntil(arenaChannel(env, g).then((ch) => ch && send(env, ch, { content: t(g.lang, "season.new", { season: name }) })).catch(() => {}));
      return ok(await getGuild(env, g.id));
    }
    throw new HttpError(404, "not found");
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
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
    roles: roles.filter((r) => r.name !== "@everyone" && !r.managed).sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, name: r.name, color: r.color })),
  };
}

// ============================================================== students
async function students(env: Env, g: GuildRow) {
  const t0 = now(), d14 = t0 - 14 * 86400, d28 = t0 - 28 * 86400;
  const rows = await all<any>(env,
    `SELECT p.discord_id, p.name, p.hr_display, p.hr_verified, p.coins, p.rating, p.daily_streak, p.last_active, p.created_at,
       COALESCE((SELECT SUM(amount) FROM ledger l WHERE l.guild_id = p.guild_id AND l.discord_id = p.discord_id AND l.season = ?), 0) AS season_pts,
       COALESCE((SELECT SUM(amount) FROM ledger l WHERE l.guild_id = p.guild_id AND l.discord_id = p.discord_id), 0) AS total_pts,
       COALESCE((SELECT SUM(amount) FROM ledger l WHERE l.guild_id = p.guild_id AND l.discord_id = p.discord_id AND l.created_at >= ?), 0) AS pts14,
       COALESCE((SELECT SUM(amount) FROM ledger l WHERE l.guild_id = p.guild_id AND l.discord_id = p.discord_id AND l.created_at >= ? AND l.created_at < ?), 0) AS pts_prev14,
       (SELECT COUNT(*) FROM attempts a WHERE a.guild_id = p.guild_id AND a.discord_id = p.discord_id AND (a.status = 'solved' OR (a.status = 'claimed' AND a.verified = 1))) AS solved,
       (SELECT COUNT(*) FROM attempts a WHERE a.guild_id = p.guild_id AND a.discord_id = p.discord_id AND a.status = 'failed') AS failed,
       (SELECT COUNT(*) FROM assignments s WHERE s.guild_id = p.guild_id AND s.discord_id = p.discord_id AND s.status = 'open') AS open_asg,
       (SELECT COUNT(*) FROM assignments s WHERE s.guild_id = p.guild_id AND s.discord_id = p.discord_id AND s.status = 'missed') AS missed_asg,
       (SELECT t.name FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.guild_id = p.guild_id AND m.discord_id = p.discord_id) AS team
     FROM players p WHERE p.guild_id = ? ORDER BY season_pts DESC`,
    g.season, d14, d28, d14, g.id);
  return rows.map((r) => {
    const tries = r.solved + r.failed;
    const accuracy = tries ? Math.round((100 * r.solved) / tries) : null;
    const lv = levelInfo(r.total_pts);
    let trend: string;
    if (!r.last_active || r.last_active < t0 - 10 * 86400) trend = "inactive";
    else if (r.created_at > d14) trend = "new";
    else if (r.pts14 > r.pts_prev14 * 1.15 + 5) trend = "up";
    else if (r.pts14 < r.pts_prev14 * 0.85 - 5) trend = "down";
    else trend = "flat";
    const reasons: string[] = [];
    if (trend === "inactive") reasons.push("inactive 10+ days");
    if (trend === "down") reasons.push("points dropping");
    if (accuracy !== null && tries >= 5 && accuracy < 40) reasons.push(`low accuracy (${accuracy}%)`);
    if (r.missed_asg) reasons.push(`${r.missed_asg} missed assignment(s)`);
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
  return {
    ...s, level: { ...s.level, title: t("en", titleKey(s.level.level)) },
    weeks, byReason, attempts, matrix, contestList: contests, assignments: asg, duelList: duels, ledger, team,
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
    } else await run(env, "UPDATE attempts SET verified = 1 WHERE id = ?", a.id);
  } else {
    if (a.points) await addPoints(env, g, { discordId: a.discord_id, amount: -a.points, reason: "bonus", ref: a.id, note: "self-report rejected" });
    await run(env, "UPDATE attempts SET status = 'failed', points = 0 WHERE id = ?", a.id);
  }
  const L = g.lang;
  await dm(env, a.discord_id, { content: t(L, approve ? "claim.approved" : "claim.rejected", { title: a.title }) }).catch(() => {});
  return { ok: true };
}

// ============================================================ challenges
async function challenges(env: Env, g: GuildRow) {
  return all(env,
    `SELECT c.id, c.guild_id, c.source, c.kind, c.difficulty, c.lang, c.code_lang, c.title, c.topic, c.url, c.status, c.created_at, c.created_by, c.time_limit,
       (SELECT COUNT(*) FROM attempts a WHERE a.challenge_id = c.id AND a.guild_id = ?) AS attempts,
       (SELECT COUNT(*) FROM attempts a WHERE a.challenge_id = c.id AND a.guild_id = ? AND (a.status = 'solved' OR (a.status = 'claimed' AND a.verified = 1))) AS solved,
       (SELECT COUNT(*) FROM attempts a WHERE a.challenge_id = c.id AND a.guild_id = ? AND a.status = 'failed') AS failed,
       (SELECT COUNT(*) FROM reports r WHERE r.challenge_id = c.id AND r.status = 'open') AS reports
     FROM challenges c WHERE (c.guild_id IS NULL OR c.guild_id = ?) AND c.status != 'archived'
       AND (c.kind = 'code' OR c.lang = ? OR c.guild_id = ?)
     ORDER BY c.id DESC LIMIT 1000`, g.id, g.id, g.id, g.id, g.lang, g.id);
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

async function createChallenge(env: Env, g: GuildRow, b: any, by: string) {
  const c = cleanChallenge(b);
  if (c.kind === "write") return createWrite(env, g, b, c, by);
  const r = await run(env,
    `INSERT INTO challenges (guild_id, source, kind, difficulty, lang, code_lang, title, question, code, choices, answer, alternatives, hint, explanation, topic, hr_slug, url, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    g.id, b.source === "ai" ? "ai" : c.kind === "code" ? "hackerrank" : "teacher", c.kind, c.difficulty,
    c.kind === "code" ? "any" : (b.lang ?? g.lang), c.kind === "code" ? null : (guildLangs({ code_lang: b.code_lang || "" }).includes(b.code_lang) ? b.code_lang : guildLangs(g)[0]),
    c.title, c.question, c.code, c.choices, c.answer, c.alternatives, c.hint, c.explanation, c.topic, c.hr_slug, c.url, by, now());
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
  if (b.all) targets = (await all<{ discord_id: string }>(env, "SELECT discord_id FROM players WHERE guild_id = ?", g.id)).map((r) => r.discord_id);
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
      WHERE l.guild_id = ? AND l.created_at >= ? AND l.discord_id IS NOT NULL GROUP BY l.discord_id ORDER BY pts DESC LIMIT 5`, g.id, d7);
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
async function exportCsv(env: Env, g: GuildRow) {
  const rows = await students(env, g);
  const cols = ["name", "discord_id", "hr_display", "team", "season_pts", "total_pts", "level", "solved", "failed", "accuracy", "open_asg", "missed_asg", "rating", "daily_streak", "coins", "trend", "last_active"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => esc(c === "last_active" && r[c] ? new Date(r[c] * 1000).toISOString().slice(0, 10) : r[c])).join(","));
  return new Response("﻿" + lines.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="students-${g.season.replace(/[^\w-]+/g, "_")}.csv"` },
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
  return { runner, ai: { ...ai, provider: aiProviderLabel(env) }, hackerrank, arena, budget, queue, bank, migrations };
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
  let ids: string[] = b.all ? (await all<{ discord_id: string }>(env, "SELECT discord_id FROM players WHERE guild_id = ?", g.id)).map((r) => r.discord_id)
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

// ============================================================ integrity
async function integrityList(env: Env, g: GuildRow, includeReviewed: boolean) {
  const rows = await all<any>(env,
    `SELECT a.id, a.discord_id, p.name, a.challenge_id, c.title, c.kind, c.difficulty, a.origin, a.ref, a.status, a.points, a.lang, a.integrity, a.explain, a.reviewed, a.finished_at, a.started_at,
            (SELECT 1 FROM attempt_logs l WHERE l.attempt_id = a.id) AS has_log
       FROM attempts a JOIN challenges c ON c.id = a.challenge_id LEFT JOIN players p ON p.guild_id = a.guild_id AND p.discord_id = a.discord_id
      WHERE a.guild_id = ? AND a.integrity IS NOT NULL ${includeReviewed ? "" : "AND a.reviewed = 0"} ORDER BY a.id DESC LIMIT 300`, g.id);
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
    if (a.points > 0) await addPoints(env, g, { discordId: a.discord_id, amount: -a.points, reason: "adjust", ref: a.id, note: `points removed by the teacher: ${String(b.reason || "integrity check").slice(0, 120)}` });
    await run(env, "UPDATE attempts SET points = 0, held = 0, reviewed = 2 WHERE id = ?", id);
    if (b.notify) ctx.waitUntil(dm(env, a.discord_id, { content: t(g.lang, "integrity.voided", { title: a.title, reason: String(b.reason || "").slice(0, 200) }) }).catch(() => {}));
  } else {
    await run(env, "UPDATE attempts SET reviewed = 1 WHERE id = ?", id);
  }
  return { ok: true };
}
