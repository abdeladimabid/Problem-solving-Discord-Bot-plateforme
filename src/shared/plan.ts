// Daily plan: three challenges picked for one student each day.
//   🔁 rematch  a challenge they failed, back after 1, 3 then 7 days (spaced repetition)
//   🎯 edge     their weakest skill, one level above what they reliably solve
//   💪 warm-up  an easy one in a skill they're good at
// Finishing the plan builds a plan streak and gives a bonus.
import { pathCfg } from "./path.ts";
import type { ChallengeRow, Env, GuildRow, PlayerRow } from "./types.ts";
import { addPoints, all, findPlayer, now, one, run } from "./db.ts";
import { RULES, dayKey } from "./game.ts";
import { t } from "./i18n.ts";
import { skillsOf, studentProfile } from "./skills.ts";
import type { SkillScore } from "./skills.ts";
import { pickForSkill } from "./coach.ts";

export interface PlanItem { kind: "rematch" | "edge" | "warmup"; challenge_id: number; skill: string; attempt_id: number | null; status: "todo" | "pending" | "solved" | "failed"; points?: number }
export interface Plan { day: string; items: PlanItem[]; completed_at: number | null; bonus: number }

export const REVIEW_DAYS = [1, 3, 7];
export const PLAN_BONUS = 0.2;            // +20% of what the plan earned
export const PLAN_MIN_BONUS = 5;
const CODE_SKILLS = ["loops", "strings", "arrays", "dicts", "math", "sorting", "recursion", "stack", "twopointers", "prefix", "binsearch", "greedy", "dp", "graphs", "sql", "web"];
const CORE = ["basics", "loops", "strings", "arrays", "functions", "dicts", "oop", "math", "sorting", "complexity", "recursion", "stack", "twopointers", "prefix", "binsearch", "greedy", "dp", "graphs"];

export const planRef = (day: string) => Number(day.replace(/-/g, ""));

/** Skills to work on next: the weakest tried ones, then the next untried core skill. */
export function focusSkills(skills: SkillScore[], n = 2, core: string[] = CORE): SkillScore[] {
  const weak = skills.filter((s) => s.evidence >= 2 && s.status !== "strong").sort((a, b) => a.mastery - b.mastery);
  const out = weak.slice(0, n);
  for (const k of core) {
    if (out.length >= n) break;
    const s = skills.find((x) => x.key === k);
    if (s && s.evidence < 2 && !out.includes(s)) out.push(s);
  }
  return out.slice(0, n);
}

/** A failed challenge whose review is due (1, 3, 7 days after the last try). */
export async function dueRematch(env: Env, g: GuildRow, userId: string): Promise<ChallengeRow | null> {
  const rows = await all<{ challenge_id: number; last: number; n: number }>(env,
    `SELECT a.challenge_id, MAX(COALESCE(a.finished_at, a.started_at)) AS last, COUNT(*) AS n
       FROM attempts a JOIN challenges c ON c.id = a.challenge_id
      WHERE a.guild_id = ? AND a.discord_id = ? AND c.status = 'active' AND c.kind != 'code' AND a.origin != 'exam'
      GROUP BY a.challenge_id
     HAVING SUM(a.status = 'solved') = 0 AND SUM(a.status IN ('failed', 'expired') AND a.tries > 0) > 0 AND SUM(a.status = 'pending') = 0
      ORDER BY last ASC LIMIT 30`, g.id, userId);
  const t0 = now();
  const due = rows.filter((r) => r.last + REVIEW_DAYS[Math.min(REVIEW_DAYS.length - 1, r.n - 1)] * 86400 <= t0);
  if (!due.length) return null;
  return one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ?", due[0].challenge_id);
}

export async function getPlan(env: Env, g: GuildRow, userId: string, day = dayKey(now())): Promise<Plan | null> {
  const r = await one<{ items: string; completed_at: number | null; bonus: number }>(env, "SELECT items, completed_at, bonus FROM daily_plans WHERE guild_id = ? AND discord_id = ? AND day = ?", g.id, userId, day);
  return r ? { day, items: JSON.parse(r.items), completed_at: r.completed_at, bonus: r.bonus } : null;
}

/** Today's plan, made on first request. */
export async function getOrCreatePlan(env: Env, g: GuildRow, userId: string): Promise<Plan> {
  const day = dayKey(now());
  const existing = await getPlan(env, g, userId, day);
  if (existing) return existing;
  const prof = await studentProfile(env, g, userId);
  // only the skills of the class's track (its /path roadmap), in roadmap order
  const trackSkills = [...new Set(pathCfg(g).steps.map((s) => s.skill))];
  const skills = trackSkills.map((k) => prof.skills.find((x) => x.key === k)).filter(Boolean) as SkillScore[];
  const items: PlanItem[] = [];
  const used: number[] = [];
  const add = (kind: PlanItem["kind"], c: ChallengeRow | null, skill?: string) => {
    if (!c || used.includes(c.id)) return false;
    used.push(c.id);
    items.push({ kind, challenge_id: c.id, skill: skill ?? skillsOf(c)[0], attempt_id: null, status: "todo" });
    return true;
  };
  add("rematch", await dueRematch(env, g, userId));
  const focus = focusSkills(skills, 3, trackSkills);
  for (const s of focus) {
    if (items.filter((i) => i.kind === "edge").length >= (items.length ? 1 : 2)) break;
    add("edge", await pickForSkill(env, g, userId, s.key, s.target, { prefer: CODE_SKILLS.includes(s.key) || s.key.startsWith("sql_") ? "write" : "quick", exclude: used }), s.key);
  }
  const strong = skills.filter((s) => s.evidence >= 2 && !focus.includes(s)).sort((a, b) => b.mastery - a.mastery)[0];
  const warmSkill = strong?.key ?? trackSkills[0] ?? "basics";
  add("warmup", await pickForSkill(env, g, userId, warmSkill, "easy", { prefer: "quick", exclude: used }), warmSkill);
  // the bank ran dry somewhere: fill up with anything fitting
  for (const s of skills) {
    if (items.length >= 3) break;
    add("edge", await pickForSkill(env, g, userId, s.key, s.target, { exclude: used }), s.key);
  }
  await run(env, "INSERT OR IGNORE INTO daily_plans (guild_id, discord_id, day, items, created_at) VALUES (?, ?, ?, ?, ?)", g.id, userId, day, JSON.stringify(items), now());
  return (await getPlan(env, g, userId, day))!;
}

export async function savePlanItems(env: Env, g: GuildRow, userId: string, day: string, items: PlanItem[]) {
  await run(env, "UPDATE daily_plans SET items = ? WHERE guild_id = ? AND discord_id = ? AND day = ?", JSON.stringify(items), g.id, userId, day);
}

/**
 * Called when a plan challenge ends. Marks the item; when every item is finished,
 * the plan counts as done: streak + bonus (20% of what it earned, at least 5 if anything was solved).
 */
export async function onPlanItemDone(env: Env, g: GuildRow, userId: string, attemptId: number, ref: number | null, solved: boolean, points: number): Promise<string[]> {
  const L = g.lang;
  const rows = await all<{ day: string; items: string; completed_at: number | null }>(env, "SELECT day, items, completed_at FROM daily_plans WHERE guild_id = ? AND discord_id = ? ORDER BY day DESC LIMIT 3", g.id, userId);
  const r = rows.find((x) => planRef(x.day) === ref) ?? rows[0];
  if (!r) return [];
  const items: PlanItem[] = JSON.parse(r.items);
  const it = items.find((i) => i.attempt_id === attemptId);
  if (!it) return [];
  it.status = solved ? "solved" : "failed";
  it.points = points;
  await savePlanItems(env, g, userId, r.day, items);
  const left = items.filter((i) => i.status === "todo" || i.status === "pending").length;
  if (left) return [t(L, "today.progress", { done: items.length - left, total: items.length })];
  if (r.completed_at) return [];
  // plan complete
  const claim = await run(env, "UPDATE daily_plans SET completed_at = ? WHERE guild_id = ? AND discord_id = ? AND day = ? AND completed_at IS NULL", now(), g.id, userId, r.day);
  if (!claim.meta.changes) return [];
  const p = (await findPlayer(env, g.id, userId)) as PlayerRow | null;
  const yesterday = dayKey(Date.parse(r.day + "T12:00:00Z") / 1000 - 86400);
  const twoAgo = dayKey(Date.parse(r.day + "T12:00:00Z") / 1000 - 2 * 86400);
  const frozen = p?.last_plan_day === twoAgo && ((p as any)?.streak_freezes ?? 0) > 0 && (p?.plan_streak ?? 0) > 0;
  if (frozen) await run(env, "UPDATE players SET streak_freezes = streak_freezes - 1 WHERE guild_id = ? AND discord_id = ? AND streak_freezes > 0", g.id, userId);
  const streak = p?.last_plan_day === yesterday || frozen ? (p?.plan_streak ?? 0) + 1 : p?.last_plan_day === r.day ? p?.plan_streak ?? 1 : 1;
  await run(env, "UPDATE players SET plan_streak = ?, plan_best = MAX(plan_best, ?), last_plan_day = ?, coins = coins + ? WHERE guild_id = ? AND discord_id = ?", streak, streak, r.day, RULES.planCoins, g.id, userId);
  const earned = items.reduce((s, i) => s + (i.points ?? 0), 0);
  const solvedAny = items.some((i) => i.status === "solved");
  const bonus = solvedAny ? Math.max(PLAN_MIN_BONUS, Math.round(earned * PLAN_BONUS)) : 0;
  if (bonus) {
    await addPoints(env, g, { discordId: userId, amount: bonus, reason: "plan_bonus", ref: planRef(r.day) });
    await run(env, "UPDATE daily_plans SET bonus = ? WHERE guild_id = ? AND discord_id = ? AND day = ?", bonus, g.id, userId, r.day);
  }
  return [t(L, bonus ? "today.complete" : "today.complete_nobonus", { streak, bonus })];
}
