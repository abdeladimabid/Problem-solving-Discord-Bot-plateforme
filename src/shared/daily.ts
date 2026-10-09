// The daily challenge: what gets picked (teacher's plan, language, pinned
// challenges), where it is posted, and posting it (by the cron or "post now").
import type { ChallengeRow, Difficulty, Env, GuildRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { RULES, dayKey } from "./game.ts";
import { t } from "./i18n.ts";
import { COLORS, btn, row, send } from "./discord.ts";
import { QUICK_KINDS, guildLangs, maxReward } from "./challenges.ts";
import { QUICK_LANGS } from "./runner.ts";
import { arenaChannel } from "./arena.ts";
import { generateFor } from "./queue.ts";

export type DailyKind = "write" | "quick" | "mcq" | "complexity" | "output" | "bug" | "code";
export const DAILY_KINDS: DailyKind[] = ["write", "quick", "mcq", "complexity", "output", "bug", "code"];
const DIFFS: Difficulty[] = ["easy", "medium", "hard"];

export interface DailyConfig {
  enabled: boolean;
  langs: string[];                       // code languages for quick challenges ([] = the class languages)
  plan: [Difficulty, DailyKind][];       // index 0 = Sunday … 6 = Saturday
}

// level and type by weekday: write-code problems three days a week
export const DEFAULT_PLAN: [Difficulty, DailyKind][] = [
  ["hard", "write"], ["easy", "output"], ["medium", "write"], ["medium", "bug"],
  ["easy", "write"], ["hard", "quick"], ["medium", "code"],
];

export function dailyConfig(g: { daily_cfg?: string | null }): DailyConfig {
  let o: any = {};
  try { o = g.daily_cfg ? JSON.parse(g.daily_cfg) : {}; } catch { o = {}; }
  const plan = DEFAULT_PLAN.map((d, i) => {
    const p = Array.isArray(o.plan) ? o.plan[i] : null;
    return [DIFFS.includes(p?.[0]) ? p[0] : d[0], DAILY_KINDS.includes(p?.[1]) ? p[1] : d[1]] as [Difficulty, DailyKind];
  });
  const langs = Array.isArray(o.langs) ? o.langs.filter((l: unknown) => typeof l === "string" && QUICK_LANGS.includes(l)) : [];
  return { enabled: o.enabled !== false, langs, plan };
}

export const dailyLangs = (g: GuildRow) => {
  const c = dailyConfig(g);
  return c.langs.length ? c.langs : guildLangs(g);
};

export async function dailyChannel(env: Env, g: GuildRow) {
  return g.daily_channel || (await arenaChannel(env, g));
}

/** A random challenge for the plan of the day (bank first; the AI only when allowed). */
export async function pickDaily(env: Env, g: GuildRow, difficulty: Difficulty, kind: DailyKind, allowAi: boolean, langsIn?: string[]): Promise<ChallengeRow | null> {
  const base = `FROM challenges c WHERE c.status = 'active' AND c.difficulty = ? AND (c.guild_id IS NULL OR c.guild_id = ?)
                AND c.id NOT IN (SELECT challenge_id FROM daily WHERE guild_id = ?)`;
  if (kind === "code") return one<ChallengeRow>(env, `SELECT c.* ${base} AND c.kind = 'code' ORDER BY RANDOM() LIMIT 1`, difficulty, g.id, g.id);
  if (kind === "write") {
    const w = await one<ChallengeRow>(env, `SELECT c.* ${base} AND c.kind = 'write' AND c.lang = ? ORDER BY RANDOM() LIMIT 1`, difficulty, g.id, g.id, g.lang);
    if (w || !allowAi) return w;
    return generateFor(env, g, "write", difficulty, null);
  }
  const kinds = kind === "quick" ? QUICK_KINDS : [kind];
  const langs = langsIn?.length ? langsIn : dailyLangs(g);
  const q = await one<ChallengeRow>(env, `SELECT c.* ${base} AND c.kind IN (${kinds.map(() => "?").join(", ")}) AND c.lang = ?
      AND (c.code_lang IS NULL OR c.code_lang IN (${langs.map(() => "?").join(", ")})) ORDER BY RANDOM() LIMIT 1`, difficulty, g.id, g.id, ...kinds, g.lang, ...langs);
  if (q || !allowAi) return q;
  return generateFor(env, g, kind, difficulty, null, langs[Math.floor(Math.random() * langs.length)]);
}

/** The challenge planned for a day: a pinned one, else a random one following the plan. */
export async function chooseDaily(env: Env, g: GuildRow, day: string, allowAi: boolean): Promise<ChallengeRow | null> {
  const pin = await one<ChallengeRow>(env,
    "SELECT c.* FROM daily_pins p JOIN challenges c ON c.id = p.challenge_id WHERE p.guild_id = ? AND p.day = ? AND c.status != 'archived'", g.id, day);
  if (pin) return pin;
  const cfg = dailyConfig(g);
  const [difficulty, kind] = cfg.plan[new Date(day + "T12:00:00Z").getUTCDay()];
  let c = await pickDaily(env, g, difficulty, kind, false);
  if (!c && kind === "code") c = await pickDaily(env, g, difficulty, "write", false);
  if (!c) c = await pickDaily(env, g, difficulty, "quick", false);
  if (!c) c = await pickDaily(env, g, difficulty, "quick", false, guildLangs(g));
  if (!c && allowAi) c = await pickDaily(env, g, difficulty, kind === "code" ? "write" : kind, true);
  return c;
}

/** Post a challenge as today's daily (replaces today's if there was one). */
export async function postDaily(env: Env, g: GuildRow, c: ChallengeRow, channelIn?: string | null): Promise<{ channel: string | null; day: string }> {
  const day = dayKey(now());
  const channel = channelIn || (await dailyChannel(env, g));
  await run(env, "UPDATE guilds SET last_daily = ? WHERE id = ?", day, g.id); // never post twice
  await run(env, "INSERT OR REPLACE INTO daily (guild_id, day, challenge_id, solvers) VALUES (?, ?, ?, 0)", g.id, day, c.id);
  if (!channel) return { channel: null, day };
  const L = g.lang;
  const [b1, b2, b3] = RULES.dailyFirstBonus;
  const lang = c.code_lang && c.kind !== "write" && c.kind !== "code" ? ` · ${c.code_lang === "javascript" ? "JavaScript" : c.code_lang === "php" ? "PHP" : c.code_lang}` : "";
  await send(env, channel, {
    embeds: [{
      title: t(L, "daily.title", { date: day }),
      description: t(L, "daily.desc", { title: c.title, difficulty: t(L, `diff.${c.difficulty}`), kind: t(L, `kind.${c.kind}`) + lang, b1, b2, b3 }),
      color: COLORS.gold,
      footer: { text: `${t(L, "ch.reward")}: ${t(L, "ch.reward_val", { p: maxReward(g, c, "daily") })}` },
    }],
    components: [row(btn(t(L, "ch.solve_btn"), `dsolve:${day.replace(/-/g, "")}`, 1, "🧩"))],
  });
  return { channel, day };
}

/** For the dashboard: settings, today, upcoming days with their pins, history. */
export async function dailyOverview(env: Env, g: GuildRow) {
  const cfg = dailyConfig(g);
  const today = dayKey(now());
  const pins = await all<any>(env,
    `SELECT p.day, c.id, c.title, c.kind, c.difficulty, c.code_lang FROM daily_pins p JOIN challenges c ON c.id = p.challenge_id
      WHERE p.guild_id = ? AND p.day >= ? ORDER BY p.day`, g.id, today);
  const upcoming = Array.from({ length: 14 }, (_, i) => {
    const day = dayKey(now() + i * 86400);
    const [difficulty, kind] = cfg.plan[new Date(day + "T12:00:00Z").getUTCDay()];
    return { day, difficulty, kind, pin: pins.find((p) => p.day === day) ?? null };
  });
  const history = await all<any>(env,
    `SELECT d.day, d.solvers, c.id, c.title, c.kind, c.difficulty, c.code_lang,
            (SELECT COUNT(DISTINCT a.discord_id) FROM attempts a WHERE a.guild_id = d.guild_id AND a.origin = 'daily' AND a.ref = CAST(REPLACE(d.day, '-', '') AS INTEGER)) AS tried
       FROM daily d JOIN challenges c ON c.id = d.challenge_id WHERE d.guild_id = ? ORDER BY d.day DESC LIMIT 30`, g.id);
  const channel = await dailyChannel(env, g).catch(() => null);
  return {
    config: { ...cfg, langsEffective: dailyLangs(g) },
    hour: g.daily_hour, channel, channelSet: g.daily_channel, classLangs: guildLangs(g),
    today: history.find((h) => h.day === today) ?? null, posted: g.last_daily === today,
    upcoming, history,
  };
}
