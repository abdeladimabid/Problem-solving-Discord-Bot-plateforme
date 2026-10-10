// 🏆 Class vs class league and the multi-class comparison in the dashboard.
// Every class (Discord server) where the bot runs can join the league. The weekly score is
// fair for classes of different sizes: points earned by students this week divided by the
// class size (at least 5). Points the teacher hands out by hand don't count.
import type { Env, GuildRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { t } from "./i18n.ts";
import { COLORS, MEDALS, send } from "./discord.ts";
import { arenaChannel } from "./arena.ts";
import { dayKey } from "./game.ts";

export interface LeagueCfg { on: boolean; name: string }
export function leagueOf(g: { league?: string | null; name?: string | null }): LeagueCfg {
  let o: any = {};
  try { o = JSON.parse(g.league || "{}") ?? {}; } catch { o = {}; }
  return { on: !!o.on, name: String(o.name || g.name || "Class").slice(0, 40) };
}
export async function setLeague(env: Env, g: GuildRow, b: { on?: boolean; name?: string }) {
  const cur = leagueOf(g);
  const next: LeagueCfg = { on: b.on === undefined ? cur.on : !!b.on, name: String(b.name ?? cur.name).trim().slice(0, 40) || cur.name };
  await run(env, "UPDATE guilds SET league = ? WHERE id = ?", JSON.stringify(next), g.id);
  return next;
}

/** Monday 00:00 UTC of the week containing ts. */
export function weekStart(ts: number): number {
  const d = new Date(ts * 1000);
  const day = (d.getUTCDay() + 6) % 7;   // Monday = 0
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) / 1000);
}
const NOT_EARNED = "('adjust', 'bonus', 'shop', 'regrade')";
const MIN_SIZE = 5;

export interface ClassScore {
  guild_id: string; name: string; students: number; active: number; points: number; solved: number; score: number; participation: number;
}

/** One class's numbers between two dates. */
export async function classNumbers(env: Env, g: GuildRow, from: number, to: number): Promise<Omit<ClassScore, "score" | "name">> {
  const students = (await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM players WHERE guild_id = ? AND last_active IS NOT NULL AND last_active > ?", g.id, from - 30 * 86400))?.n ?? 0;
  const pts = await one<{ p: number; a: number }>(env,
    `SELECT COALESCE(SUM(amount), 0) AS p, COUNT(DISTINCT discord_id) AS a FROM ledger
      WHERE guild_id = ? AND created_at >= ? AND created_at < ? AND discord_id IS NOT NULL AND amount > 0 AND reason NOT IN ${NOT_EARNED}`, g.id, from, to);
  const solved = (await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM attempts WHERE guild_id = ? AND status = 'solved' AND finished_at >= ? AND finished_at < ?", g.id, from, to))?.n ?? 0;
  const size = Math.max(students, pts?.a ?? 0);
  return { guild_id: g.id, students: size, active: pts?.a ?? 0, points: pts?.p ?? 0, solved, participation: size ? Math.round((100 * (pts?.a ?? 0)) / size) : 0 };
}

/**
 * Numbers of EVERY class for `weeks` consecutive weeks starting at `from`, in 3 queries whatever the
 * number of classes (instead of 3 per class and per week). Result: guild id → one entry per week.
 */
export async function weeklyNumbers(env: Env, from: number, weeks: number): Promise<Map<string, Omit<ClassScore, "score" | "name">[]>> {
  const to = from + weeks * 7 * 86400;
  const pts = await all<{ guild_id: string; w: number; p: number; a: number }>(env,
    `SELECT guild_id, CAST((created_at - ?) / 604800 AS INTEGER) AS w, COALESCE(SUM(amount), 0) AS p, COUNT(DISTINCT discord_id) AS a FROM ledger
      WHERE created_at >= ? AND created_at < ? AND discord_id IS NOT NULL AND amount > 0 AND reason NOT IN ${NOT_EARNED}
      GROUP BY guild_id, w`, from, from, to);
  const solved = await all<{ guild_id: string; w: number; n: number }>(env,
    `SELECT guild_id, CAST((finished_at - ?) / 604800 AS INTEGER) AS w, COUNT(*) AS n FROM attempts
      WHERE status = 'solved' AND finished_at >= ? AND finished_at < ? GROUP BY guild_id, w`, from, from, to);
  // students active in the 30 days before each week
  const cols = Array.from({ length: weeks }, (_, w) => `SUM(last_active > ${Math.floor(from + w * 7 * 86400 - 30 * 86400)}) AS s${w}`).join(", ");
  const sizes = await all<Record<string, any>>(env, `SELECT guild_id, ${cols} FROM players WHERE last_active IS NOT NULL GROUP BY guild_id`);
  const out = new Map<string, Omit<ClassScore, "score" | "name">[]>();
  const ids = new Set([...pts.map((r) => r.guild_id), ...solved.map((r) => r.guild_id), ...sizes.map((r) => r.guild_id)]);
  for (const id of ids) {
    const list = [];
    for (let w = 0; w < weeks; w++) {
      const p = pts.find((r) => r.guild_id === id && r.w === w);
      const students = Number(sizes.find((r) => r.guild_id === id)?.[`s${w}`] ?? 0);
      const size = Math.max(students, p?.a ?? 0);
      list.push({ guild_id: id, students: size, active: p?.a ?? 0, points: p?.p ?? 0, solved: solved.find((r) => r.guild_id === id && r.w === w)?.n ?? 0,
        participation: size ? Math.round((100 * (p?.a ?? 0)) / size) : 0 });
    }
    out.set(id, list);
  }
  return out;
}
const empty = (id: string) => ({ guild_id: id, students: 0, active: 0, points: 0, solved: 0, participation: 0 });

/** League table for a week (default: this week so far). */
export async function leagueTable(env: Env, week = weekStart(now())): Promise<ClassScore[]> {
  const gs = (await all<GuildRow>(env, "SELECT * FROM guilds WHERE league IS NOT NULL")).filter((g) => leagueOf(g).on);
  if (!gs.length) return [];
  const nums = await weeklyNumbers(env, week, 1);
  return gs.map((g) => {
    const n = nums.get(g.id)?.[0] ?? empty(g.id);
    return { ...n, name: leagueOf(g).name, score: Math.round(n.points / Math.max(MIN_SIZE, n.students)) };
  }).sort((a, b) => b.score - a.score || b.participation - a.participation);
}

export function leagueLines(rows: ClassScore[], me: string, L: string): string[] {
  return rows.map((r, i) => `${MEDALS[i + 1] ?? `\`${i + 1}.\``} **${r.name}**${r.guild_id === me ? " ← " + t(L, "league.you") : ""} · **${r.score}** ${t(L, "league.pts_per")} · ${r.active}/${r.students} ${t(L, "league.active")}`);
}

/** Mondays: tell each league class how last week ended. */
export async function announceLeague(env: Env) {
  const d = new Date(now() * 1000);
  if (d.getUTCDay() !== 1) return;
  const thisWeek = weekStart(now());
  const key = dayKey(thisWeek);
  const gs = (await all<GuildRow>(env, "SELECT * FROM guilds WHERE league IS NOT NULL AND daily_hour <= ? AND (last_league IS NULL OR last_league != ?)", d.getUTCHours(), key)).filter((g) => leagueOf(g).on);
  if (!gs.length) return;
  const table = await leagueTable(env, thisWeek - 7 * 86400);
  if (table.length < 2) {
    for (const g of gs) await run(env, "UPDATE guilds SET last_league = ? WHERE id = ?", key, g.id);
    return;
  }
  for (const g of gs.slice(0, 5)) {
    await run(env, "UPDATE guilds SET last_league = ? WHERE id = ?", key, g.id);
    const ch = await arenaChannel(env, g);
    if (!ch) continue;
    const L = g.lang, mine = table.findIndex((r) => r.guild_id === g.id);
    await send(env, ch, { embeds: [{
      title: t(L, "league.week_title"),
      description: [mine === 0 ? t(L, "league.we_won") : mine > 0 ? t(L, "league.we_placed", { n: mine + 1, total: table.length }) : "", "", ...leagueLines(table.slice(0, 10), g.id, L)].join("\n"),
      color: mine === 0 ? COLORS.gold : COLORS.blue,
      footer: { text: t(L, "league.footer") },
    }] }).catch((e) => console.error("league post", e));
  }
}

/** Dashboard: every class side by side (this week, last week, 4-week trend). A fixed handful of queries. */
export async function compareClasses(env: Env) {
  const gs = await all<GuildRow>(env, "SELECT * FROM guilds ORDER BY name");
  const wk = weekStart(now());
  const nums = await weeklyNumbers(env, wk - 3 * 7 * 86400, 4);    // weeks: 3 ago, 2 ago, last, this
  const acc = await all<{ guild_id: string; s: number; f: number }>(env,
    "SELECT guild_id, SUM(status = 'solved') AS s, SUM(status = 'failed') AS f FROM attempts WHERE finished_at >= ? GROUP BY guild_id", wk - 28 * 86400);
  const classes = gs.map((g) => {
    const w = nums.get(g.id) ?? [0, 1, 2, 3].map(() => empty(g.id));
    const cur = w[3], prev = w[2];
    const a = acc.find((r) => r.guild_id === g.id);
    const tot = (a?.s ?? 0) + (a?.f ?? 0);
    return {
      id: g.id, name: g.name, league: leagueOf(g), season: g.season, lang: g.lang, code_lang: g.code_lang,
      week: { ...cur, score: Math.round(cur.points / Math.max(MIN_SIZE, cur.students)) },
      prev: { ...prev, score: Math.round(prev.points / Math.max(MIN_SIZE, prev.students)) },
      trend: w.map((x) => x.solved), accuracy: tot ? Math.round((100 * (a?.s ?? 0)) / tot) : null,
    };
  });
  return { classes, weekStart: wk };
}
