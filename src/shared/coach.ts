// The coach: picks challenges that fit a student (by skill and level).
import type { ChallengeRow, Difficulty, Env, GuildRow } from "./types.ts";
import { all, findPlayer, one } from "./db.ts";
import { backfillSkills } from "./skills.ts";
import { guildLangs } from "./challenges.ts";

const LEVELS: Difficulty[] = ["easy", "medium", "hard"];

/**
 * A challenge that trains `skill`, at `difficulty` if possible (then the levels around it),
 * that the student hasn't seen. `prefer` puts write-code (judged by tests) or quick ones first.
 */
export async function pickForSkill(env: Env, g: GuildRow, userId: string, skill: string, difficulty: Difficulty,
  o: { prefer?: "write" | "quick"; exclude?: number[]; allowSeen?: boolean; kind?: string } = {}): Promise<ChallengeRow | null> {
  // challenges without skills yet (just generated): tag them first (uses the partial index, no scan)
  if (await one(env, "SELECT 1 FROM challenges WHERE skills IS NULL LIMIT 1")) await backfillSkills(env, 200);
  const p = await findPlayer(env, g.id, userId);
  const langs = guildLangs(g);
  const hrOk = !!p?.hr_verified;
  const order = [difficulty, ...LEVELS.filter((d) => d !== difficulty).sort((a, b) => Math.abs(LEVELS.indexOf(a) - LEVELS.indexOf(difficulty)) - Math.abs(LEVELS.indexOf(b) - LEVELS.indexOf(difficulty)))];
  const exclude = o.exclude?.length ? `AND c.id NOT IN (${o.exclude.map(() => "?").join(", ")})` : "";
  for (const d of order) {
    const rows = await all<ChallengeRow>(env,
      `SELECT c.* FROM challenges c
        WHERE c.status = 'active' AND (c.guild_id IS NULL OR c.guild_id = ?) AND c.difficulty = ?
          AND (',' || COALESCE(c.skills, '') || ',') LIKE ?
          AND (c.lang = ? OR c.lang = 'any') ${hrOk ? "" : "AND c.kind != 'code'"}
          AND (c.code_lang IS NULL OR c.kind IN ('write', 'code', 'sql', 'regex') OR c.code_lang IN (${langs.map(() => "?").join(", ")}))
          ${o.allowSeen ? "" : "AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.challenge_id = c.id AND a.guild_id = ? AND a.discord_id = ?)"}
          ${exclude} ${o.kind ? "AND c.kind = ?" : ""}
        ORDER BY ${o.prefer === "write" ? "(c.kind IN ('write', 'sql')) DESC," : o.prefer === "quick" ? "(c.kind IN ('mcq', 'output', 'bug', 'complexity', 'regex')) DESC," : ""} RANDOM() LIMIT 1`,
      g.id, d, `%,${skill},%`, g.lang, ...langs, ...(o.allowSeen ? [] : [g.id, userId]), ...(o.exclude ?? []), ...(o.kind ? [o.kind] : []));
    if (rows[0]) return rows[0];
  }
  return null;
}
