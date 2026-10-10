// Runs every minute (Cron Trigger): contests, duel timeouts, assignment
// reminders, the daily challenge and the Monday recap.
import type { ChallengeRow, Difficulty, DuelRow, Env, GuildRow } from "../shared/types.ts";
import { all, getGuild, now, one, run } from "../shared/db.ts";
import { RULES, dayKey } from "../shared/game.ts";
import { t } from "../shared/i18n.ts";
import { COLORS, btn, dm, mention, row, send, ts } from "../shared/discord.ts";
import { QUICK_KINDS, endDuelDraw, guildLangs, maxReward } from "../shared/challenges.ts";
import { pollDueContests, syncRoles } from "../shared/contests.ts";
import { processQueue } from "../shared/queue.ts";
import { chooseDaily, dailyConfig, postDaily } from "../shared/daily.ts";
import { endDueSessions } from "../shared/sessions.ts";
import { syncDueRoles } from "../shared/roles.ts";
import { backfillSkills } from "../shared/skills.ts";
import { sendWeeklyReports } from "../shared/report.ts";
import { sendTeacherSummaries } from "../shared/insight.ts";
import { sweepEvents } from "../shared/events.ts";
import { expireShop } from "../shared/shop.ts";
import { sendMorningPlans } from "./coach.ts";
import { checkProjects } from "../shared/projects.ts";
import { announceLeague } from "../shared/league.ts";
import { arenaChannel } from "../shared/arena.ts";
import { COMMANDS, commandsVersion } from "../shared/commands.ts";
import { dapi } from "../shared/discord.ts";

async function safe(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.error(`cron ${name} failed`, e);
  }
}

export async function runCron(env: Env) {
  // AI generation first: students are waiting for it (one job per minute keeps
  // us inside the free plan's limits)
  let generated = false;
  await safe("queue", async () => { generated = (await processQueue(env, 1)) > 0; });
  await safe("commands", () => syncCommands(env));
  await safe("skills", () => backfillSkills(env, 80));
  await safe("contests", () => pollDueContests(env));
  await safe("sessions", () => endDueSessions(env));
  await safe("duels", () => sweepDuels(env));
  await safe("assignments", () => sweepAssignments(env));
  await safe("practice", () => run(env, "UPDATE attempts SET status = 'expired', finished_at = ? WHERE status = 'pending' AND origin = 'practice' AND started_at < ?", now(), now() - 86400));
  await safe("daily", () => postDailies(env, !generated));
  await safe("digest", () => weeklyDigests(env));
  if (!generated) await safe("roles", () => syncDueRoles(env));
  await safe("plans", () => sendMorningPlans(env));
  if (!generated) await safe("reports", () => sendWeeklyReports(env));
  await safe("teacher summary", () => sendTeacherSummaries(env));
  await safe("events", () => sweepEvents(env));
  await safe("shop", () => expireShop(env));
  if (!generated) await safe("projects", () => checkProjects(env, 3));
  await safe("league", () => announceLeague(env));
}

// ------------------------------------------------------- slash commands
// After an update, the new commands reach Discord by themselves (no `npm run register`).
async function syncCommands(env: Env) {
  if (!env.DISCORD_APP_ID || !env.DISCORD_TOKEN) return;
  const v = commandsVersion();
  const todo = await all<{ id: string }>(env, "SELECT id FROM guilds WHERE commands_version IS NULL OR (commands_version != ? AND commands_version != ?) LIMIT 3", v, "failed:" + v);
  for (const g of todo) {
    try {
      await dapi(env, "PUT", `/applications/${env.DISCORD_APP_ID}/guilds/${g.id}/commands`, COMMANDS);
      await run(env, "UPDATE guilds SET commands_version = ? WHERE id = ?", v, g.id);
    } catch (e) {
      console.error("command sync failed", g.id, e);
      await run(env, "UPDATE guilds SET commands_version = ? WHERE id = ?", "failed:" + v, g.id); // don't retry every minute
    }
  }
}

// ---------------------------------------------------------------- duels
async function sweepDuels(env: Env) {
  const t0 = now();
  const stale = await all<DuelRow>(env, "SELECT * FROM duels WHERE status IN ('pending', 'starting') AND created_at < ? LIMIT 10", t0 - RULES.duelInviteSeconds);
  for (const d of stale) {
    await run(env, "UPDATE duels SET status = 'expired' WHERE id = ?", d.id);
    const g = await getGuild(env, d.guild_id);
    if (d.status === "pending" && d.channel_id) await send(env, d.channel_id, { content: t(g.lang, "duel.expired", { a: mention(d.challenger_id), b: mention(d.opponent_id) }) }).catch(() => {});
  }
  const active = await all<DuelRow>(env, "SELECT * FROM duels WHERE status = 'active' LIMIT 20");
  for (const d of active) {
    if (d.started_at && t0 - d.started_at > (RULES.duelSeconds[d.mode] ?? 600)) {
      await endDuelDraw(env, await getGuild(env, d.guild_id), d, "duel.timeout");
    }
  }
}

// ---------------------------------------------------------- assignments
async function sweepAssignments(env: Env) {
  const t0 = now();
  const soon = await all<{ id: number; guild_id: string; discord_id: string; due_at: number; title: string }>(
    env,
    `SELECT s.id, s.guild_id, s.discord_id, s.due_at, c.title FROM assignments s JOIN challenges c ON c.id = s.challenge_id
      WHERE s.status = 'open' AND s.reminded = 0 AND s.due_at IS NOT NULL AND s.due_at > ? AND s.due_at - ? <= ? LIMIT 10`,
    t0, t0, RULES.assignmentReminderSeconds,
  );
  for (const s of soon) {
    await run(env, "UPDATE assignments SET reminded = 1 WHERE id = ?", s.id);
    const g = await getGuild(env, s.guild_id);
    await dm(env, s.discord_id, { content: t(g.lang, "asg.reminder", { title: s.title, when: ts(s.due_at) }), components: [row(btn(t(g.lang, "asg.start_btn"), `astart:${s.id}`, 1, "📚"))] });
  }
  const late = await all<{ id: number; attempt_id: number | null }>(env, "SELECT id, attempt_id FROM assignments WHERE status = 'open' AND due_at IS NOT NULL AND due_at < ? LIMIT 50", t0);
  for (const s of late) {
    await run(env, "UPDATE assignments SET status = 'missed' WHERE id = ?", s.id);
    if (s.attempt_id) await run(env, "UPDATE attempts SET status = 'expired', finished_at = ? WHERE id = ? AND status = 'pending'", t0, s.attempt_id);
  }
}

// ---------------------------------------------------------------- daily
async function postDailies(env: Env, allowAi: boolean) {
  const date = new Date(now() * 1000);
  const day = dayKey(now());
  const hour = date.getUTCHours();
  const guilds = await all<GuildRow>(env,
    "SELECT * FROM guilds WHERE daily_hour <= ? AND (last_daily IS NULL OR last_daily != ?) LIMIT 2", hour, day);
  for (const g of guilds) {
    if (!dailyConfig(g).enabled) { await run(env, "UPDATE guilds SET last_daily = ? WHERE id = ?", day, g.id); continue; }
    const c = await chooseDaily(env, g, day, allowAi);
    if (!c) {
      if (!allowAi) continue; // the AI was busy this minute: try again next minute
      await run(env, "UPDATE guilds SET last_daily = ? WHERE id = ?", day, g.id); // nothing left: skip today
      continue;
    }
    await postDaily(env, g, c).catch((e) => console.error("daily post failed", e));
    await syncRoles(env, g, null).catch(() => {});
  }
}

// --------------------------------------------------------------- digest
async function weeklyDigests(env: Env) {
  const date = new Date(now() * 1000);
  if (date.getUTCDay() !== 1) return; // Mondays
  const day = dayKey(now());
  const guilds = await all<GuildRow>(env,
    "SELECT * FROM guilds WHERE daily_hour <= ? AND (last_digest IS NULL OR last_digest != ?) LIMIT 3", date.getUTCHours(), day);
  const since = now() - 7 * 86400;
  for (const g of guilds) {
    await run(env, "UPDATE guilds SET last_digest = ? WHERE id = ?", day, g.id);
    const channel = await arenaChannel(env, g);
    if (!channel) continue;
    const L = g.lang;
    const top = await all<{ discord_id: string; s: number }>(env,
      "SELECT discord_id, SUM(amount) AS s FROM ledger WHERE guild_id = ? AND created_at >= ? AND discord_id IS NOT NULL GROUP BY discord_id ORDER BY s DESC LIMIT 5", g.id, since);
    const solvers = await all<{ discord_id: string; n: number }>(env,
      "SELECT discord_id, COUNT(*) AS n FROM attempts WHERE guild_id = ? AND finished_at >= ? AND status = 'solved' GROUP BY discord_id ORDER BY n DESC LIMIT 3", g.id, since);
    const duelist = await one<{ winner_id: string; n: number }>(env,
      "SELECT winner_id, COUNT(*) AS n FROM duels WHERE guild_id = ? AND finished_at >= ? AND winner_id IS NOT NULL GROUP BY winner_id ORDER BY n DESC LIMIT 1", g.id, since);
    const streak = await one<{ discord_id: string; daily_streak: number }>(env,
      "SELECT discord_id, daily_streak FROM players WHERE guild_id = ? AND daily_streak > 1 ORDER BY daily_streak DESC LIMIT 1", g.id);
    const fields: unknown[] = [];
    const medal = (i: number) => ["🥇", "🥈", "🥉"][i] ?? `\`${i + 1}.\``;
    if (top.length) fields.push({ name: t(L, "digest.top"), value: top.map((r, i) => `${medal(i)} ${mention(r.discord_id)} · +${r.s}`).join("\n") });
    if (solvers.length) fields.push({ name: t(L, "digest.solvers"), value: solvers.map((r, i) => `${medal(i)} ${mention(r.discord_id)} · ${r.n}`).join("\n"), inline: true });
    if (duelist) fields.push({ name: t(L, "digest.duelist"), value: `${mention(duelist.winner_id)} · ${duelist.n} ⚔️`, inline: true });
    if (streak) fields.push({ name: t(L, "digest.streak"), value: `${mention(streak.discord_id)} · ${streak.daily_streak} 🔥`, inline: true });
    await send(env, channel, { embeds: [{
      title: t(L, "digest.title"), color: COLORS.blue, fields,
      description: fields.length ? "" : t(L, "digest.none"), footer: { text: t(L, "digest.footer") },
    }] }).catch((e) => console.error("digest failed", e));
  }
}
