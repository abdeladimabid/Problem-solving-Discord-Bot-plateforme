// "🎯 Picked for me" in /practice: the challenge THIS student needs next, at a level that fits them.
//   1. a beginner (almost no answers yet): the first step of the class's roadmap, easy, in code
//   2. a skill they had and are now weak at (e.g. arrays dropped because of mistakes in their code)
//   3. otherwise the next step of their path, at that step's level
//   4. otherwise their weakest skill, one level above what they reliably solve
// Code-proving skills get a write-code challenge (code counts for 80% of mastery).
import type { Difficulty, Env, GuildRow } from "./types.ts";
import { QUICK_ONLY_SKILLS, studentProfile } from "./skills.ts";
import type { SkillScore } from "./skills.ts";
import { pathProgress } from "./path.ts";
import { roadmapFor, trackOf } from "./tracks.ts";
import { focusSkills } from "./plan.ts";

export type Reason = "start" | "weak" | "path" | "focus" | "level";
export interface Tailored { skill: string; level: Difficulty; reason: Reason; mastery: number | null; kind: "write" | "quick" | "sql" }

const kindFor = (skill: string, g: GuildRow): Tailored["kind"] =>
  skill.startsWith("sql") || trackOf(g).family === "sql" ? "sql" : QUICK_ONLY_SKILLS.includes(skill) ? "quick" : "write";

export async function tailoredPick(env: Env, g: GuildRow, uid: string): Promise<Tailored> {
  const prof = await studentProfile(env, g, uid);
  const road = roadmapFor(g);
  const roadSkills = [...new Set(road.map((s) => s.skill))];
  const real = prof.attempts.filter((a) => a.kind !== "evidence" && a.status !== "claimed");
  const sk = (k: string) => prof.skills.find((s) => s.key === k);
  const path = await pathProgress(env, g, uid);
  const step = path.current >= 0 ? path.steps[path.current] : null;

  // 1. just starting: the very first thing the class learns, easy
  if (real.length < 3) {
    const first = step ?? road[0];
    return { skill: first.skill, level: "easy", reason: "start", mastery: sk(first.skill)?.evidence ? sk(first.skill)!.mastery : null, kind: kindFor(first.skill, g) };
  }
  // 2. a track skill they're weak at, the earliest in the roadmap first (basics before the rest)
  // skills they FAIL in code come before skills only practised with quizzes (capped at 20% until shown in code)
  const weak = roadSkills.map(sk).filter((s): s is SkillScore => !!s && s.evidence >= 2 && s.status === "weak")
    .sort((a, b) => Number(b.code != null) - Number(a.code != null));
  if (weak.length) {
    const s = weak[0];
    return { skill: s.key, level: s.target, reason: "weak", mastery: s.mastery, kind: kindFor(s.key, g) };
  }
  // 3. the next step of their path
  if (step) return { skill: step.skill, level: step.level as Difficulty, reason: "path", mastery: sk(step.skill)?.evidence ? sk(step.skill)!.mastery : null, kind: kindFor(step.skill, g) };
  // 4. their weakest skill in the track
  const f = focusSkills(prof.skills, 1, roadSkills)[0];
  if (f) return { skill: f.key, level: f.target, reason: "focus", mastery: f.evidence ? f.mastery : null, kind: kindFor(f.key, g) };
  const last = road[road.length - 1];
  return { skill: last.skill, level: "hard", reason: "focus", mastery: null, kind: kindFor(last.skill, g) };
}

/** A difficulty that suits the student when they didn't choose one: the level most of their skills are at. */
export async function levelFor(env: Env, g: GuildRow, uid: string): Promise<Difficulty> {
  const prof = await studentProfile(env, g, uid);
  const known = prof.skills.filter((s) => s.evidence >= 2);
  if (!known.length) return "easy";
  const n = { easy: 0, medium: 0, hard: 0 } as Record<Difficulty, number>;
  for (const s of known) n[s.target]++;
  return (["easy", "medium", "hard"] as Difficulty[]).sort((a, b) => n[b] - n[a])[0];
}
