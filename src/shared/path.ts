// /path: a step-by-step route through the skills. Each step = one skill at one level;
// it's done after N solved challenges of that skill at that level or harder (past solves count).
// Each skill has a short lesson. Teachers can change the steps and lessons (guilds.path_cfg).
import type { Env, GuildRow } from "./types.ts";
import { all, findPlayer, run } from "./db.ts";
import { SKILL_KEYS, skillsOf } from "./skills.ts";
import { renderLesson } from "./lessons.ts";
import { roadmapFor, trackOf } from "./tracks.ts";

export interface PathStep { skill: string; level: "easy" | "medium" | "hard"; need: number }
export interface PathCfg { steps: PathStep[]; lessons: Record<string, { en?: string; fr?: string }> }
type G = { path_cfg?: string | null; code_lang?: string | null; track?: string | null };

const S = (skill: string, level: PathStep["level"], need = 3): PathStep => ({ skill, level, need });
/** The programming-language roadmap (each track has its own in tracks.ts). */
export const DEFAULT_STEPS: PathStep[] = roadmapFor({ track: "python" });

/** The built-in roadmap of the class's track. */
export const defaultSteps = (g: G) => roadmapFor(g);

/**
 * Saved paths, one per track: {"v": 2, "tracks": {"javascript": {"steps": [...], "lessons": {...}}}}.
 * An older save ({steps, lessons}) belongs to the class's current track.
 */
function allCfg(g: G): Record<string, { steps?: unknown; lessons?: Record<string, { en?: string; fr?: string }> }> {
  let o: any = {};
  try { o = g.path_cfg ? JSON.parse(g.path_cfg) : {}; } catch { o = {}; }
  if (o && o.v === 2 && o.tracks && typeof o.tracks === "object") return o.tracks;
  return o && (o.steps || o.lessons) ? { [trackOf(g).key]: { steps: o.steps, lessons: o.lessons } } : {};
}

export function pathCfg(g: G): PathCfg {
  const own = allCfg(g)[trackOf(g).key] ?? {};
  const steps = Array.isArray(own.steps) && own.steps.length
    ? (own.steps as any[]).filter((s) => SKILL_KEYS.includes(s?.skill) && ["easy", "medium", "hard"].includes(s?.level)).map((s) => S(s.skill, s.level, Math.min(10, Math.max(1, Math.round(Number(s.need) || 3)))))
    : defaultSteps(g);
  return { steps: steps.length ? steps : defaultSteps(g), lessons: own.lessons && typeof own.lessons === "object" ? own.lessons : {} };
}
/** Is the current track's path customized? */
export const pathCustom = (g: G) => !!allCfg(g)[trackOf(g).key];

/** Save (or reset) the current track's path; other tracks keep theirs. */
export async function savePath(env: Env, g: G & { id: string }, b: { steps?: PathStep[]; lessons?: PathCfg["lessons"]; reset?: boolean }) {
  const all = allCfg(g);
  const key = trackOf(g).key;
  if (b.reset) delete all[key];
  else all[key] = { steps: b.steps ?? pathCfg(g).steps, lessons: b.lessons ?? pathCfg(g).lessons };
  await run(env, "UPDATE guilds SET path_cfg = ? WHERE id = ?", Object.keys(all).length ? JSON.stringify({ v: 2, tracks: all }) : null, g.id);
}
export const stepId = (s: PathStep) => `${s.skill}-${s.level}`;

export function lessonFor(g: GuildRow, skill: string, lang: string): string {
  const own = pathCfg(g).lessons[skill];
  const text = (lang === "fr" ? own?.fr || own?.en : own?.en || own?.fr) || renderLesson(skill, lang, classLangs(g));
  return text ?? "";
}

const RANK: Record<string, number> = { easy: 1, medium: 2, hard: 3 };
export interface StepState extends PathStep { id: string; solved: number; done: boolean }

/** Every step with its progress, and the index of the current one (-1 = the whole path is done). */
export async function pathProgress(env: Env, g: GuildRow, userId: string): Promise<{ steps: StepState[]; current: number }> {
  const rows = await all<any>(env,
    `SELECT DISTINCT a.challenge_id, c.kind, c.difficulty, c.skills, c.test_set, c.hr_slug, c.topic, c.title, c.code
       FROM attempts a JOIN challenges c ON c.id = a.challenge_id
      WHERE a.guild_id = ? AND a.discord_id = ? AND (a.status = 'solved' OR (a.status = 'claimed' AND a.verified = 1))`, g.id, userId);
  const solved = rows.map((r) => ({ skills: skillsOf(r), rank: RANK[r.difficulty] ?? 1 }));
  const steps = pathCfg(g).steps.map((s) => {
    const n = solved.filter((x) => x.skills.includes(s.skill) && x.rank >= RANK[s.level]).length;
    return { ...s, id: stepId(s), solved: Math.min(n, s.need), done: n >= s.need };
  });
  return { steps, current: steps.findIndex((s) => !s.done) };
}

/** Steps finished since we last looked (to celebrate them once). */
export async function newlyDone(env: Env, g: GuildRow, userId: string, steps: StepState[]): Promise<StepState[]> {
  const p = await findPlayer(env, g.id, userId);
  let seen: string[] = [];
  try { seen = JSON.parse((p as any)?.path_done || "[]"); } catch { seen = []; }
  const fresh = steps.filter((s) => s.done && !seen.includes(s.id));
  if (fresh.length) await run(env, "UPDATE players SET path_done = ? WHERE guild_id = ? AND discord_id = ?", JSON.stringify([...seen, ...fresh.map((s) => s.id)]), g.id, userId);
  return fresh;
}
export const STEP_COINS = 15;

// Lessons live in lessons.ts: one explanation, the example in every programming language.
export { LESSONS } from "./lessons.ts";

/** The language of the class's code examples: its track's (one at a time). */
export const classLangs = (g: G) => { const t = trackOf(g); return [t.code ?? String(g.code_lang || "python").split(",")[0].trim()]; };

/** Built-in lessons as this class sees them (code in the class's language). */
export function defaultLessons(g: G) {
  return Object.fromEntries(SKILL_KEYS.map((k) => [k, { en: renderLesson(k, "en", classLangs(g)), fr: renderLesson(k, "fr", classLangs(g)) }]));
}
