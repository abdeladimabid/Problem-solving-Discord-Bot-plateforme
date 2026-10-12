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

export interface LeagueRemote { url: string; label?: string }
export interface LeagueCfg { on: boolean; name: string; token: string; remotes: LeagueRemote[] }
export function leagueOf(g: { league?: string | null; name?: string | null }): LeagueCfg {
  let o: any = {};
  try { o = JSON.parse(g.league || "{}") ?? {}; } catch { o = {}; }
  return { on: !!o.on, name: String(o.name || g.name || "Class").slice(0, 40), token: String(o.token || ""),
    remotes: (Array.isArray(o.remotes) ? o.remotes : []).filter((r: any) => r && typeof r.url === "string").slice(0, 30).map((r: any) => ({ url: String(r.url), label: r.label ? String(r.label).slice(0, 40) : undefined })) };
}
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
async function saveLeague(env: Env, g: GuildRow, cfg: LeagueCfg) {
  await run(env, "UPDATE guilds SET league = ? WHERE id = ?", JSON.stringify(cfg), g.id);
  g.league = JSON.stringify(cfg);
  return cfg;
}
export async function setLeague(env: Env, g: GuildRow, b: { on?: boolean; name?: string; newLink?: boolean }) {
  const cur = leagueOf(g);
  const next: LeagueCfg = { ...cur, on: b.on === undefined ? cur.on : !!b.on, name: String(b.name ?? cur.name).trim().slice(0, 40) || cur.name };
  if (!next.token || b.newLink) next.token = randomToken();
  return saveLeague(env, g, next);
}

// ------------------------------------------------------- the league between separate ClassBots
/** The link another ClassBot adds to have this class in its league (null until the class joins). */
export function leagueLink(env: Env, g: GuildRow): string | null {
  const c = leagueOf(g);
  const base = String(env.PUBLIC_URL || "").replace(/\/$/, "");
  return c.on && c.token && base ? `${base}/league/feed/${g.id}.${c.token}` : null;
}
/** GET /league/feed/<guild>.<token> on the bot: this class's numbers for this week and last week (no names of students). */
export async function leagueFeed(env: Env, guildId: string, token: string): Promise<Response> {
  const g = await one<GuildRow>(env, "SELECT * FROM guilds WHERE id = ?", guildId);
  const c = g ? leagueOf(g) : null;
  if (!g || !c || !c.on || !c.token || c.token !== token) return Response.json({ error: "This class isn't in the league (or the link was renewed)." }, { status: 404 });
  const wk = weekStart(now());
  const nums = (await weeklyNumbers(env, wk - 7 * 86400, 2)).get(g.id) ?? [empty(g.id), empty(g.id)];
  const pack = (n: Omit<ClassScore, "score" | "name">, week: number) => ({ week, students: n.students, active: n.active, points: n.points, solved: n.solved, participation: n.participation, score: Math.round(n.points / Math.max(MIN_SIZE, n.students)) });
  return Response.json({ kind: "classbot-league", v: 1, id: g.id, name: c.name, at: now(), last: pack(nums[0], wk - 7 * 86400), this: pack(nums[1], wk) },
    { headers: { "cache-control": "max-age=300", "access-control-allow-origin": "*" } });
}
const FEED = /^https:\/\/[a-z0-9.-]+(?::\d+)?\/league\/feed\/[\w-]{1,30}\.[a-f0-9]{24}$/i;
export function cleanLink(u: string): string | null {
  const s = String(u || "").trim().replace(/[?#].*$/, "").replace(/\/$/, "");
  return FEED.test(s) ? s : null;
}
/** Read one league link (5 s max) and keep what it says. */
async function readRemote(env: Env, g: GuildRow, url: string) {
  let data: any = null, error: string | null = null;
  try {
    const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "classbot-league" }, signal: AbortSignal.timeout(5000) });
    const text = (await r.text()).slice(0, 4000);
    const j = (() => { try { return JSON.parse(text); } catch { return null; } })();
    if (!r.ok) error = j?.error || `HTTP ${r.status}`;
    else if (j?.kind !== "classbot-league" || !j.this) error = "This link isn't a ClassBot league link.";
    else data = { id: String(j.id || ""), name: String(j.name || "Class").slice(0, 40), last: j.last, this: j.this, at: Number(j.at) || now() };
  } catch (e: any) { error = e?.name === "TimeoutError" ? "No answer (5 s)" : "Could not reach it"; }
  if (data) await run(env, "INSERT INTO league_remote (guild_id, url, data, fetched_at, error) VALUES (?, ?, ?, ?, NULL) ON CONFLICT (guild_id, url) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at, error = NULL", g.id, url, JSON.stringify(data), now());
  else await run(env, "INSERT INTO league_remote (guild_id, url, fetched_at, error) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, url) DO UPDATE SET fetched_at = excluded.fetched_at, error = excluded.error", g.id, url, now(), error);
  return { data, error };
}
export async function addRemote(env: Env, g: GuildRow, link: string, label?: string) {
  const url = cleanLink(link);
  if (!url) throw new LeagueError("Paste the league link of the other class: it looks like https://…/league/feed/1234567890.abcdef…");
  const cfg = leagueOf(g);
  if (url.includes(`/league/feed/${g.id}.`)) throw new LeagueError("That's your own class's link: send it to the other teachers, and paste theirs here.");
  if (cfg.remotes.some((r) => r.url === url)) throw new LeagueError("This class is already in your league.");
  if (cfg.remotes.length >= 30) throw new LeagueError("30 classes at most.");
  const r = await readRemote(env, g, url);
  if (!r.data) throw new LeagueError(`Could not read that link: ${r.error}. Check that the other teacher's class plays in the league and that the link is the latest one.`);
  cfg.remotes.push({ url, label: label ? String(label).slice(0, 40) : undefined });
  await saveLeague(env, g, cfg);
  return r.data;
}
export async function removeRemote(env: Env, g: GuildRow, url: string) {
  const cfg = leagueOf(g);
  cfg.remotes = cfg.remotes.filter((r) => r.url !== url);
  await run(env, "DELETE FROM league_remote WHERE guild_id = ? AND url = ?", g.id, url);
  return saveLeague(env, g, cfg);
}
export class LeagueError extends Error {}
/** Read the other ClassBots' links again when older than `maxAge` seconds (cron: every 30 min; dashboard: on open). */
export async function refreshRemotes(env: Env, g: GuildRow | null = null, maxAge = 1500) {
  const gs = g ? [g] : (await all<GuildRow>(env, "SELECT * FROM guilds WHERE league LIKE '%remotes%'"));
  for (const x of gs) {
    const cfg = leagueOf(x);
    if (!cfg.remotes.length) continue;
    const known = new Map((await all<{ url: string; fetched_at: number | null }>(env, "SELECT url, fetched_at FROM league_remote WHERE guild_id = ?", x.id)).map((r) => [r.url, r.fetched_at ?? 0]));
    await Promise.all(cfg.remotes.filter((r) => now() - (known.get(r.url) ?? 0) >= maxAge).map((r) => readRemote(env, x, r.url)));
  }
}
/** The other ClassBots' classes in this class's league, with when they were last read. */
export async function remoteRows(env: Env, g: GuildRow) {
  const cfg = leagueOf(g);
  const rows = await all<{ url: string; data: string | null; fetched_at: number | null; error: string | null }>(env, "SELECT url, data, fetched_at, error FROM league_remote WHERE guild_id = ?", g.id);
  return cfg.remotes.map((r) => {
    const x = rows.find((y) => y.url === r.url);
    let d: any = null;
    try { d = x?.data ? JSON.parse(x.data) : null; } catch { d = null; }
    return { url: r.url, label: r.label ?? null, name: r.label || d?.name || "Class", data: d, fetched_at: x?.fetched_at ?? null, error: x?.error ?? null };
  });
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

/** League table for a week (default: this week so far): the classes of this ClassBot that joined, plus (for `g`) the classes of other ClassBots it added. */
export async function leagueTable(env: Env, week = weekStart(now()), g: GuildRow | null = null): Promise<(ClassScore & { remote?: boolean })[]> {
  const gs = (await all<GuildRow>(env, "SELECT * FROM guilds WHERE league IS NOT NULL")).filter((x) => leagueOf(x).on);
  const nums = gs.length ? await weeklyNumbers(env, week, 1) : new Map();
  const rows: (ClassScore & { remote?: boolean })[] = gs.map((x) => {
    const n = nums.get(x.id)?.[0] ?? empty(x.id);
    return { ...n, name: leagueOf(x).name, score: Math.round(n.points / Math.max(MIN_SIZE, n.students)) };
  });
  if (g && leagueOf(g).remotes.length) {
    for (const r of await remoteRows(env, g)) {
      const d = r.data;
      const w = d?.this?.week === week ? d.this : d?.last?.week === week ? d.last : null;
      if (!d || !w || rows.some((x) => x.guild_id === d.id)) continue;
      rows.push({ guild_id: "r:" + d.id, name: r.label || d.name, students: Number(w.students) || 0, active: Number(w.active) || 0, points: Number(w.points) || 0,
        solved: Number(w.solved) || 0, participation: Number(w.participation) || 0, score: Number(w.score) || 0, remote: true });
    }
  }
  return rows.sort((a, b) => b.score - a.score || b.participation - a.participation);
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
  for (const g of gs.slice(0, 5)) {
    await run(env, "UPDATE guilds SET last_league = ? WHERE id = ?", key, g.id);
    const table = await leagueTable(env, thisWeek - 7 * 86400, g);
    if (table.length < 2) continue;
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
