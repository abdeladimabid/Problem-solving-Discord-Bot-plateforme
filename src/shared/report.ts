// Weekly report for each active student: numbers, progress, the habit to fix, next week's goal.
// Sent by DM on Mondays (one AI note per student if the AI budget allows, else a plain summary).
import type { Env, GuildRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { t } from "./i18n.ts";
import { COLORS, dm } from "./discord.ts";
import { masteryFrom, mistakesFrom, skillName, studentAttempts } from "./skills.ts";
import { focusSkills } from "./plan.ts";
import { weeklyNote } from "./ai.ts";

export const weekKey = (ts: number) => {
  const d = new Date(ts * 1000);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  return monday.toISOString().slice(0, 10);
};

export interface WeekFacts {
  solved: number; tried: number; points: number; planDays: number; writeSolved: number;
  improved: { key: string; delta: number } | null; focus: string | null; mistake: string | null; streak: number;
}

export async function weekFacts(env: Env, g: GuildRow, userId: string): Promise<WeekFacts> {
  const since = now() - 7 * 86400;
  const attempts = await studentAttempts(env, g.id, userId);
  const week = attempts.filter((a) => (a.finished_at ?? 0) >= since && a.kind !== "evidence");
  const before = attempts.filter((a) => (a.finished_at ?? 0) < since);
  const nowM = masteryFrom(attempts), oldM = masteryFrom(before);
  let improved: WeekFacts["improved"] = null;
  for (const s of nowM) {
    const o = oldM.find((x) => x.key === s.key)!;
    const touched = attempts.some((a) => (a.finished_at ?? 0) >= since && (a.skills ?? "").split(",").includes(s.key));
    const delta = s.mastery - (o.evidence ? o.mastery : 50);
    if (touched && s.evidence >= 2 && delta > 0 && (!improved || delta > improved.delta)) improved = { key: s.key, delta };
  }
  const pts = await one<{ s: number }>(env, "SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE guild_id = ? AND discord_id = ? AND created_at >= ?", g.id, userId, since);
  const plans = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM daily_plans WHERE guild_id = ? AND discord_id = ? AND completed_at >= ?", g.id, userId, since);
  const p = await one<{ plan_streak: number }>(env, "SELECT plan_streak FROM players WHERE guild_id = ? AND discord_id = ?", g.id, userId);
  const mistakes = mistakesFrom(week.length >= 4 ? week : attempts);
  return {
    solved: week.filter((a) => a.status === "solved").length, tried: week.length, points: pts?.s ?? 0, planDays: plans?.n ?? 0,
    writeSolved: week.filter((a) => a.status === "solved" && (a.kind === "write" || a.kind === "code")).length,
    improved, focus: focusSkills(nowM, 1)[0]?.key ?? null, mistake: mistakes[0]?.key ?? null, streak: p?.plan_streak ?? 0,
  };
}

export function reportEmbed(g: GuildRow, name: string, f: WeekFacts, note: string | null) {
  const L = g.lang;
  const lines = [
    t(L, "report.numbers", { solved: f.solved, tried: f.tried, pts: f.points, code: f.writeSolved, plans: f.planDays }),
    f.improved ? t(L, "report.improved", { skill: skillName(f.improved.key, L), d: f.improved.delta }) : "",
    f.mistake ? t(L, "report.habit", { habit: t(L, `report.habit.${f.mistake}`) }) : "",
    f.focus ? t(L, "report.goal", { skill: skillName(f.focus, L) }) : "",
  ].filter(Boolean);
  return {
    title: t(L, "report.title", { name }),
    description: [note ? `💬 ${note}` : "", lines.join("\n")].filter(Boolean).join("\n\n").slice(0, 4000),
    color: COLORS.blue,
    footer: { text: t(L, "report.footer") },
  };
}

/** Mondays, after the daily hour: write and DM a few reports per run (AI budget and Discord limits). */
export async function sendWeeklyReports(env: Env, perRun = 3) {
  const t0 = now(), d = new Date(t0 * 1000);
  if (d.getUTCDay() !== 1) return;
  const week = weekKey(t0);
  const rows = await all<{ guild_id: string; discord_id: string; name: string | null }>(env,
    `SELECT DISTINCT a.guild_id, a.discord_id, p.name FROM attempts a
       JOIN guilds g ON g.id = a.guild_id AND g.daily_hour <= ?
       LEFT JOIN players p ON p.guild_id = a.guild_id AND p.discord_id = a.discord_id
      WHERE a.finished_at >= ? AND NOT EXISTS (SELECT 1 FROM weekly_reports r WHERE r.guild_id = a.guild_id AND r.discord_id = a.discord_id AND r.week = ?)
      LIMIT ?`, d.getUTCHours(), t0 - 7 * 86400, week, perRun);
  for (const r of rows) {
    const g = await one<GuildRow>(env, "SELECT * FROM guilds WHERE id = ?", r.guild_id);
    if (!g) continue;
    const f = await weekFacts(env, g, r.discord_id);
    const facts = `This week: ${f.solved} solved out of ${f.tried} tried, ${f.writeSolved} write-code/HackerRank, ${f.points} points, daily plan finished ${f.planDays} days.`
      + (f.improved ? ` Biggest progress: ${skillName(f.improved.key, "en")} (+${f.improved.delta}%).` : "")
      + (f.mistake ? ` Most frequent mistake: ${t("en", `report.habit.${f.mistake}`)}.` : "")
      + (f.focus ? ` Weakest skill to train next: ${skillName(f.focus, "en")}.` : "");
    const note = await weeklyNote(env, { lang: g.lang, name: r.name ?? "", facts });
    const body = JSON.stringify({ facts: f, note });
    await run(env, "INSERT OR IGNORE INTO weekly_reports (guild_id, discord_id, week, body, created_at) VALUES (?, ?, ?, ?, ?)", g.id, r.discord_id, week, body, t0);
    await dm(env, r.discord_id, { embeds: [reportEmbed(g, r.name ?? "", f, note)] }).catch(() => {});
  }
}

/** The latest report, or a live one if none was written yet. */
export async function latestReport(env: Env, g: GuildRow, userId: string, name: string) {
  const r = await one<{ body: string; week: string }>(env, "SELECT body, week FROM weekly_reports WHERE guild_id = ? AND discord_id = ? ORDER BY week DESC LIMIT 1", g.id, userId);
  if (r && r.week === weekKey(now())) {
    const b = JSON.parse(r.body);
    return reportEmbed(g, name, b.facts, b.note);
  }
  return reportEmbed(g, name, await weekFacts(env, g, userId), null);
}
