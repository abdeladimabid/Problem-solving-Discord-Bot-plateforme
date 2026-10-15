// Database helpers shared by the bot and the dashboard.
import { classOf, hasOwnAi } from "./aictx.ts";
import type { Env, GuildRow, PlayerRow } from "./types.ts";
import { RULES, levelInfo } from "./game.ts";

export const now = () => Math.floor(Date.now() / 1000);

export async function all<T = Record<string, any>>(env: Env, sql: string, ...args: unknown[]): Promise<T[]> {
  const r = await env.DB.prepare(sql).bind(...args.map(clean)).all<T>();
  return r.results ?? [];
}
export async function one<T = Record<string, any>>(env: Env, sql: string, ...args: unknown[]): Promise<T | null> {
  return env.DB.prepare(sql).bind(...args.map(clean)).first<T>();
}
export async function run(env: Env, sql: string, ...args: unknown[]) {
  return env.DB.prepare(sql).bind(...args.map(clean)).run();
}
function clean(v: unknown) {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

// ---------------------------------------------------------------- guilds
export async function getGuild(env: Env, id: string): Promise<GuildRow> {
  let g = await one<GuildRow>(env, "SELECT * FROM guilds WHERE id = ?", id);
  if (!g) {
    await run(env, "INSERT OR IGNORE INTO guilds (id, created_at) VALUES (?, ?)", id, now());
    g = (await one<GuildRow>(env, "SELECT * FROM guilds WHERE id = ?", id))!;
  }
  return g;
}

// --------------------------------------------------------------- players
export async function getPlayer(env: Env, guildId: string, discordId: string, name?: string): Promise<PlayerRow> {
  await run(
    env,
    `INSERT INTO players (guild_id, discord_id, name, coins, created_at, last_active) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (guild_id, discord_id) DO UPDATE SET name = CASE WHEN players.name_lock = 1 THEN players.name ELSE COALESCE(excluded.name, players.name) END, last_active = excluded.last_active`,
    guildId, discordId, name ?? null, RULES.startCoins, now(), now(),
  );
  return (await one<PlayerRow>(env, "SELECT * FROM players WHERE guild_id = ? AND discord_id = ?", guildId, discordId))!;
}

export async function findPlayer(env: Env, guildId: string, discordId: string) {
  return one<PlayerRow>(env, "SELECT * FROM players WHERE guild_id = ? AND discord_id = ?", guildId, discordId);
}

export async function playerByHr(env: Env, guildId: string, hr: string) {
  return one<PlayerRow>(env, "SELECT * FROM players WHERE guild_id = ? AND hr_username = ?", guildId, hr.toLowerCase());
}

/**
 * Link a HackerRank username. The link starts UNVERIFIED: the student must put
 * the returned code in their HackerRank profile to prove the account is theirs.
 * A verified link held by someone else can't be taken; an unverified one can.
 */
export async function linkHackerRank(env: Env, guildId: string, discordId: string, hr: string): Promise<{ status: "ok" | "taken"; code: string }> {
  const k = hr.toLowerCase();
  const other = await playerByHr(env, guildId, k);
  if (other && other.discord_id !== discordId && other.hr_verified) return { status: "taken", code: "" };
  if (other && other.discord_id !== discordId) {
    await run(env, "UPDATE players SET hr_username = NULL, hr_display = NULL, hr_verified = 0, hr_code = NULL WHERE guild_id = ? AND discord_id = ?", guildId, other.discord_id);
  }
  const me = await findPlayer(env, guildId, discordId);
  if (me?.hr_username === k && me.hr_verified) return { status: "ok", code: "" };
  const code = "CB-" + Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
  await run(env, "UPDATE players SET hr_username = ?, hr_display = ?, hr_verified = 0, hr_code = ? WHERE guild_id = ? AND discord_id = ?", k, hr, code, guildId, discordId);
  return { status: "ok", code };
}

/** Mark a link as verified and attach earlier contest results under that username. */
export async function confirmHackerRank(env: Env, guildId: string, discordId: string) {
  const p = await findPlayer(env, guildId, discordId);
  if (!p?.hr_username) return false;
  const k = p.hr_username;
  await env.DB.batch([
    env.DB.prepare("UPDATE players SET hr_verified = 1, hr_code = NULL WHERE guild_id = ? AND discord_id = ?").bind(guildId, discordId),
    env.DB.prepare("UPDATE ledger SET discord_id = ? WHERE guild_id = ? AND hr_username = ? AND discord_id IS NULL").bind(discordId, guildId, k),
    env.DB.prepare("UPDATE contest_results SET discord_id = ? WHERE guild_id = ? AND hr_username = ? AND discord_id IS NULL").bind(discordId, guildId, k),
    env.DB.prepare("UPDATE awards SET discord_id = ? WHERE guild_id = ? AND hr_username = ? AND discord_id IS NULL").bind(discordId, guildId, k),
  ]);
  return true;
}

// ---------------------------------------------------------------- points
export async function addPoints(
  env: Env,
  guild: GuildRow,
  p: { discordId?: string | null; hr?: string | null; amount: number; reason: string; ref?: string | number | null; note?: string | null },
) {
  if (!p.amount) return;
  await run(
    env,
    "INSERT INTO ledger (guild_id, discord_id, hr_username, season, amount, reason, ref, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    guild.id, p.discordId ?? null, p.hr?.toLowerCase() ?? null, guild.season, Math.round(p.amount), p.reason,
    p.ref == null ? null : String(p.ref), p.note ?? null, now(),
  );
}

/** Challenges give as many coins as points (a solve, a regrade, the held half after the explanation); taking the
 *  points back takes the coins back too, never below 0. */
export async function challengeCoins(env: Env, guild: GuildRow, discordId: string | null | undefined, amount: number) {
  if (!discordId || !amount) return;
  await run(env, "UPDATE players SET coins = MAX(0, coins + ?) WHERE guild_id = ? AND discord_id = ?", Math.round(amount), guild.id, discordId);
}

export async function totalPoints(env: Env, guildId: string, discordId: string): Promise<number> {
  const r = await one<{ s: number }>(env, "SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE guild_id = ? AND discord_id = ?", guildId, discordId);
  return r?.s ?? 0;
}

/** Points earned today from quick challenges (multiple choice, complexity, output, bug) in practice and duels. */
export async function practicePointsToday(env: Env, guildId: string, discordId: string): Promise<number> {
  const start = Math.floor(Date.now() / 86400000) * 86400;
  const r = await one<{ s: number }>(
    env,
    `SELECT COALESCE(SUM(a.points), 0) AS s FROM attempts a JOIN challenges c ON c.id = a.challenge_id
      WHERE a.guild_id = ? AND a.discord_id = ? AND a.origin IN ('practice', 'duel') AND a.finished_at >= ?
        AND c.kind IN ('mcq', 'complexity', 'output', 'bug', 'regex')`,
    guildId, discordId, start,
  );
  return r?.s ?? 0;
}

/** Quick challenges solved today with points (practice + duels): drives the diminishing returns. */
export async function quickSolvesToday(env: Env, guildId: string, discordId: string, exceptAttempt = 0): Promise<number> {
  const start = Math.floor(Date.now() / 86400000) * 86400;
  const r = await one<{ n: number }>(
    env,
    `SELECT COUNT(*) AS n FROM attempts a JOIN challenges c ON c.id = a.challenge_id
      WHERE a.guild_id = ? AND a.discord_id = ? AND a.origin IN ('practice', 'duel') AND a.status = 'solved' AND a.finished_at >= ? AND a.id != ?
        AND c.kind IN ('mcq', 'complexity', 'output', 'bug', 'regex')`,
    guildId, discordId, start, exceptAttempt,
  );
  return r?.n ?? 0;
}

export interface StandingRow { key: string; discord_id: string | null; hr: string | null; name: string; points: number }

/** Season (or all-time when season is null) standings, linked players and unlinked HackerRank names alike. */
export async function standings(env: Env, guildId: string, season: string | null, limit = 50): Promise<StandingRow[]> {
  const rows = await all<{ key: string; discord_id: string | null; hr: string | null; points: number; pname: string | null; hrd: string | null }>(
    env,
    `SELECT COALESCE(l.discord_id, 'hr:' || l.hr_username) AS key, l.discord_id, MAX(l.hr_username) AS hr,
            SUM(l.amount) AS points, MAX(p.name) AS pname, MAX(p.hr_display) AS hrd
       FROM ledger l LEFT JOIN players p ON p.guild_id = l.guild_id AND p.discord_id = l.discord_id
      WHERE l.guild_id = ? ${season ? "AND l.season = ?" : ""}
      GROUP BY key HAVING points > 0 ORDER BY points DESC LIMIT ${Number(limit)}`,
    ...(season ? [guildId, season] : [guildId]),
  );
  return rows.map((r) => ({ key: r.key, discord_id: r.discord_id, hr: r.hr, points: r.points, name: r.pname ?? r.hrd ?? r.hr ?? "?" }));
}

// ---------------------------------------------------------------- stats
export async function playerStats(env: Env, guild: GuildRow, discordId: string) {
  const p = await findPlayer(env, guild.id, discordId);
  const solved = await all<{ difficulty: string; n: number }>(
    env,
    `SELECT c.difficulty, COUNT(*) AS n FROM attempts a JOIN challenges c ON c.id = a.challenge_id
      WHERE a.guild_id = ? AND a.discord_id = ? AND (a.status = 'solved' OR (a.status = 'claimed' AND a.verified = 1)) GROUP BY c.difficulty`,
    guild.id, discordId,
  );
  const by = Object.fromEntries(solved.map((r) => [r.difficulty, r.n])) as Record<string, number>;
  const counts = await one<{ solved: number; failed: number }>(
    env,
    `SELECT SUM(status = 'solved' OR (status = 'claimed' AND verified = 1)) AS solved, SUM(status = 'failed') AS failed
       FROM attempts WHERE guild_id = ? AND discord_id = ?`,
    guild.id, discordId,
  );
  const duels = await one<{ w: number; l: number; d: number }>(
    env,
    `SELECT SUM(winner_id = ?) AS w,
            SUM(winner_id IS NOT NULL AND winner_id != ?) AS l,
            SUM(winner_id IS NULL) AS d
       FROM duels WHERE guild_id = ? AND status = 'finished' AND (challenger_id = ? OR opponent_id = ?)`,
    discordId, discordId, guild.id, discordId, discordId,
  );
  const contests = await one<{ p: number; w: number; pod: number }>(
    env,
    "SELECT COUNT(*) AS p, SUM(rank = 1) AS w, SUM(rank <= 3) AS pod FROM contest_results WHERE guild_id = ? AND discord_id = ?",
    guild.id, discordId,
  );
  const season = await standings(env, guild.id, guild.season, 1000);
  const idx = season.findIndex((r) => r.discord_id === discordId);
  const total = await totalPoints(env, guild.id, discordId);
  const badges = await all<{ badge: string }>(env, "SELECT badge FROM badges WHERE guild_id = ? AND discord_id = ? ORDER BY created_at", guild.id, discordId);
  const s = counts?.solved ?? 0, f = counts?.failed ?? 0;
  return {
    player: p,
    total,
    level: levelInfo(total),
    seasonPoints: idx >= 0 ? season[idx].points : 0,
    seasonRank: idx >= 0 ? idx + 1 : null,
    seasonSize: season.length,
    solved: { easy: by.easy ?? 0, medium: by.medium ?? 0, hard: by.hard ?? 0, total: s },
    failed: f,
    accuracy: s + f ? Math.round((100 * s) / (s + f)) : null,
    duels: { w: duels?.w ?? 0, l: duels?.l ?? 0, d: duels?.d ?? 0 },
    contests: { played: contests?.p ?? 0, wins: contests?.w ?? 0, podiums: contests?.pod ?? 0 },
    badges: badges.map((b) => b.badge),
  };
}

// --------------------------------------------------------------- badges
const BADGE_RULES: [string, (s: Awaited<ReturnType<typeof playerStats>>) => boolean][] = [
  ["first_solve", (s) => s.solved.total >= 1],
  ["solves_10", (s) => s.solved.total >= 10],
  ["solves_50", (s) => s.solved.total >= 50],
  ["hard_5", (s) => s.solved.hard >= 5],
  ["duel_win", (s) => s.duels.w >= 1],
  ["duel_5", (s) => s.duels.w >= 5],
  ["daily_7", (s) => (s.player?.daily_streak ?? 0) >= 7],
  ["contest_win", (s) => s.contests.wins >= 1],
  ["podium_3", (s) => s.contests.podiums >= 3],
  ["level_5", (s) => s.level.level >= 5],
  ["level_10", (s) => s.level.level >= 10],
];

/** Award any newly earned badges; returns the new badge ids. */
export async function checkBadges(env: Env, guild: GuildRow, discordId: string): Promise<string[]> {
  const s = await playerStats(env, guild, discordId);
  const have = new Set(s.badges);
  const fresh: string[] = [];
  for (const [id, test] of BADGE_RULES) if (!have.has(id) && test(s)) fresh.push(id);
  const onTime = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM assignments WHERE guild_id = ? AND discord_id = ? AND status = 'done'", guild.id, discordId);
  if (!have.has("assign_10") && (onTime?.n ?? 0) >= 10) fresh.push("assign_10");
  for (const b of fresh) await run(env, "INSERT OR IGNORE INTO badges (guild_id, discord_id, badge, created_at) VALUES (?, ?, ?, ?)", guild.id, discordId, b, now());
  return fresh;
}

// ------------------------------------------------------------ AI budget
// Protects Cloudflare's free AI (about 10,000 "neurons" a day for the whole account). Each class has its own
// daily budget, and the whole ClassBot a bigger one. A class with AI keys of its own (Settings → AI) has no
// ClassBot limit: its providers have their own.
const aiDay = () => new Date().toISOString().slice(0, 10);
const aiLimit = (env: Env) => Number(env.AI_DAILY_LIMIT || RULES.aiDailyLimit);
export async function aiBudgetOk(env: Env, cost = 1): Promise<boolean> {
  if (await hasOwnAi(env)) return true;
  const day = aiDay(), gid = classOf(env), limit = aiLimit(env);
  const all = await one<{ count: number }>(env, "SELECT count FROM ai_usage WHERE day = ?", day);
  if ((all?.count ?? 0) + cost > limit * 3) return false;
  if (!gid) return (all?.count ?? 0) + cost <= limit;
  const mine = await one<{ count: number }>(env, "SELECT count FROM ai_usage WHERE day = ?", `${day}|${gid}`);
  return (mine?.count ?? 0) + cost <= limit;
}
export async function aiBudgetUse(env: Env, n = 1) {
  const day = aiDay(), gid = classOf(env);
  const add = (k: string) => run(env, "INSERT INTO ai_usage (day, count) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET count = count + ?", k, n, n);
  if (gid) await add(`${day}|${gid}`);
  if (!(await hasOwnAi(env))) await add(day);   // the ClassBot-wide counter only counts the free AI
}
export async function aiBudgetLeft(env: Env): Promise<{ used: number; limit: number; own?: boolean }> {
  const gid = classOf(env);
  const r = await one<{ count: number }>(env, "SELECT count FROM ai_usage WHERE day = ?", gid ? `${aiDay()}|${gid}` : aiDay());
  return { used: r?.count ?? 0, limit: aiLimit(env), own: await hasOwnAi(env) };
}
