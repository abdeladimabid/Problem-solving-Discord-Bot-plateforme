// A class follows ONE track at a time: a programming language, SQL, the MERN stack,
// or Python for AI & LLMs. The track decides the language of quick challenges and code
// examples, the roadmap of /path, the daily challenge plan and the daily plans (/today).
// The teacher changes it in the dashboard (Overview or Settings) or with /teacher setup.
import type { Env, GuildRow } from "./types.ts";
import { run } from "./db.ts";

export type TrackKey = "javascript" | "php" | "python" | "java" | "c" | "cpp" | "sql" | "mern" | "ai";
export type Family = "code" | "sql" | "mern" | "ai";
export interface Track { key: TrackKey; en: string; fr: string; emoji: string; family: Family; code: string | null }

export const TRACKS: Track[] = [
  { key: "javascript", en: "JavaScript", fr: "JavaScript", emoji: "🟨", family: "code", code: "javascript" },
  { key: "php", en: "PHP", fr: "PHP", emoji: "🐘", family: "code", code: "php" },
  { key: "python", en: "Python", fr: "Python", emoji: "🐍", family: "code", code: "python" },
  { key: "java", en: "Java", fr: "Java", emoji: "☕", family: "code", code: "java" },
  { key: "c", en: "C", fr: "C", emoji: "🔧", family: "code", code: "c" },
  { key: "cpp", en: "C++", fr: "C++", emoji: "➕", family: "code", code: "cpp" },
  { key: "sql", en: "SQL (databases)", fr: "SQL (bases de données)", emoji: "🗄️", family: "sql", code: null },
  { key: "mern", en: "MERN (MongoDB, Express, React, Node)", fr: "MERN (MongoDB, Express, React, Node)", emoji: "⚛️", family: "mern", code: "javascript" },
  { key: "ai", en: "Python for AI & LLMs", fr: "Python pour l'IA et les LLM", emoji: "🤖", family: "ai", code: "python" },
];
export const TRACK_KEYS = TRACKS.map((t) => t.key) as string[];
export const isTrack = (v: unknown): v is TrackKey => typeof v === "string" && TRACK_KEYS.includes(v);

/** The class's track: the saved one, else the first language of the old setting (code_lang). */
export function trackOf(g: { track?: string | null; code_lang?: string | null }): Track {
  const k = isTrack(g.track) ? g.track : String(g.code_lang || "python").split(",")[0].trim();
  return TRACKS.find((t) => t.key === k) ?? TRACKS.find((t) => t.key === "python")!;
}
export const trackLabel = (g: Parameters<typeof trackOf>[0], lang = "en") => { const t = trackOf(g); return `${t.emoji} ${lang === "fr" ? t.fr : t.en}`; };

/**
 * Switch the class to a track. The programming language follows it (one language at a time);
 * the daily challenge plan goes back to the track's default so it fits the new track.
 */
export async function setTrack(env: Env, g: GuildRow, key: string): Promise<Track> {
  if (!isTrack(key)) throw new Error("unknown track");
  const t = TRACKS.find((x) => x.key === key)!;
  // SQL classes keep a programming language for the other challenge types
  const code = t.code ?? (String(g.code_lang || "python").split(",")[0].trim() || "python");
  let daily: any = {};
  try { daily = g.daily_cfg ? JSON.parse(g.daily_cfg) : {}; } catch { daily = {}; }
  delete daily.plan;
  delete daily.langs;
  await run(env, "UPDATE guilds SET track = ?, code_lang = ?, daily_cfg = ? WHERE id = ?", t.key, code, JSON.stringify(daily), g.id);
  return t;
}

// ------------------------------------------------------------- roadmaps
export interface Step { skill: string; level: "easy" | "medium" | "hard"; need: number }
const S = (skill: string, level: Step["level"], need = 3): Step => ({ skill, level, need });

export const ROADMAPS: Record<Family, Step[]> = {
  // programming languages: from the basics to algorithms
  code: [
    S("basics", "easy", 2), S("loops", "easy"), S("strings", "easy"), S("arrays", "easy"), S("functions", "easy", 2), S("dicts", "easy"), S("math", "easy", 2),
    S("loops", "medium", 2), S("strings", "medium"), S("arrays", "medium"), S("dicts", "medium"), S("sorting", "medium"), S("complexity", "medium"),
    S("oop", "medium", 2), S("recursion", "medium"), S("stack", "medium"), S("twopointers", "medium"), S("prefix", "medium", 2),
    S("binsearch", "medium", 2), S("greedy", "medium", 2), S("dp", "medium", 2), S("graphs", "medium", 2),
    S("dicts", "hard", 2), S("stack", "hard", 2), S("dp", "hard", 2), S("graphs", "hard", 2),
  ],
  // SQL: read data, filter, sort, summarize, combine tables, then change and design them
  sql: [
    S("sql_select", "easy", 2), S("sql_filter", "easy"), S("sql_sort", "easy", 2), S("sql_agg", "easy", 2),
    S("sql_group", "medium"), S("sql_join", "medium"), S("sql_sub", "medium", 2), S("sql_change", "medium", 2), S("sql_design", "medium", 2),
    S("sql_join", "hard", 2), S("sql_group", "hard", 2), S("sql_sub", "hard", 2),
  ],
  // MERN: JavaScript first, then the four pieces of the stack
  mern: [
    S("basics", "easy", 2), S("loops", "easy", 2), S("arrays", "easy"), S("functions", "easy", 2), S("dicts", "easy", 2),
    S("oop", "medium", 2), S("async", "medium", 2), S("web", "medium", 2),
    S("node", "easy", 2), S("express", "medium"), S("mongodb", "medium"), S("react", "medium"),
    S("react", "hard", 2), S("express", "hard", 2),
  ],
  // AI & LLMs: Python first, then data, machine learning, language models
  ai: [
    S("basics", "easy", 2), S("loops", "easy", 2), S("arrays", "easy"), S("functions", "easy", 2), S("dicts", "easy", 2), S("oop", "medium", 2),
    S("ai_data", "easy"), S("ai_data", "medium", 2), S("ai_ml", "medium"), S("ai_llm", "medium"), S("ai_rag", "hard", 2), S("complexity", "medium", 2),
  ],
};

/** The default roadmap of a class (async only where the language has it). */
export function roadmapFor(g: Parameters<typeof trackOf>[0]): Step[] {
  const t = trackOf(g);
  return ROADMAPS[t.family].filter((s) => s.skill !== "async" || t.key === "javascript" || t.key === "python" || t.family === "mern" || t.family === "ai");
}

/** Skills that make sense for a track (used to mark the others in the dashboard). */
export function skillFitsTrack(skill: string, g: Parameters<typeof trackOf>[0]): boolean {
  const t = trackOf(g);
  if (skill.startsWith("sql_")) return t.family === "sql";
  if (["node", "express", "mongodb", "react"].includes(skill)) return t.family === "mern" || t.key === "javascript";
  if (skill.startsWith("ai_")) return t.family === "ai" || t.key === "python";
  if (skill === "async") return ["javascript", "python"].includes(t.key) || t.family === "mern" || t.family === "ai";
  if (t.family === "sql") return ["sql", "complexity"].includes(skill);
  return true;
}

/** Default daily challenge plan (Sunday … Saturday) for a track. */
export function dailyPlanFor(g: Parameters<typeof trackOf>[0]): [string, string][] | null {
  if (trackOf(g).family === "sql") return [["hard", "sql"], ["easy", "sql"], ["medium", "sql"], ["easy", "sql"], ["medium", "sql"], ["hard", "sql"], ["medium", "sql"]];
  return null;
}
