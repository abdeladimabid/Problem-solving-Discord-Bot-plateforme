// Background AI generation. Practice requests that need a brand-new challenge
// (a topic, or the bank is exhausted) are queued; the cron job generates the
// challenge (it can take a minute) and edits the student's message when ready.
import { forClass } from "./aictx.ts";
import type { Difficulty, Env, GuildRow } from "./types.ts";
import { getGuild, now, one, run } from "./db.ts";
import { t } from "./i18n.ts";
import { editOriginal } from "./discord.ts";
import { generateQuick, generateWrite } from "./ai.ts";
import { QUICK_LANGS } from "./runner.ts";
import { bankExamples, pickGuildLang, renderFor, saveGeneratedQuick, saveGeneratedWrite, startAttempt } from "./challenges.ts";

export const QUEUE_TTL = 14 * 60;   // interaction tokens expire after 15 minutes

interface Job { id: number; guild_id: string; discord_id: string | null; kind: string; difficulty: Difficulty; topic: string | null; code_lang: string | null; token: string | null; created_at: number }

export async function enqueue(env: Env, g: GuildRow, o: { discordId: string | null; kind: string; difficulty: Difficulty; topic?: string | null; token?: string | null; codeLang?: string | null }) {
  if (o.discordId) {
    const busy = await one(env, "SELECT id FROM ai_queue WHERE guild_id = ? AND discord_id = ? AND status IN ('pending', 'working') AND created_at > ?", g.id, o.discordId, now() - QUEUE_TTL);
    if (busy) return null;
  }
  const r = await run(env, "INSERT INTO ai_queue (guild_id, discord_id, kind, difficulty, topic, code_lang, token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    g.id, o.discordId, o.kind, o.difficulty, o.topic ?? null, o.codeLang ?? null, o.token ?? null, now());
  return Number(r.meta.last_row_id);
}

/** Generate a challenge now (used by the queue and by the daily challenge). */
export async function generateFor(env: Env, g: GuildRow, kind: string, difficulty: Difficulty, topic: string | null, lang?: string | null) {
  env = forClass(env, g.id);   // the AI uses this class's keys
  if (kind === "write") {
    const w = await generateWrite(env, { difficulty, topic, lang: g.lang });
    return w ? saveGeneratedWrite(env, g, w, difficulty) : null;
  }
  const k = kind === "quick" ? null : kind;
  const codeLang = lang && QUICK_LANGS.includes(lang) ? lang : pickGuildLang(g);
  const q = await generateQuick(env, { difficulty, kind: k, topic, lang: g.lang, codeLang, examples: await bankExamples(env, g, k, difficulty, codeLang) });
  return q ? saveGeneratedQuick(env, g, q, difficulty, "ai", codeLang) : null;
}

/** Called by the cron: handle at most `limit` jobs. */
export async function processQueue(env: Env, limit = 1): Promise<number> {
  let done = 0;
  await run(env, "UPDATE ai_queue SET status = 'failed', error = 'expired' WHERE status IN ('pending', 'working') AND created_at < ?", now() - QUEUE_TTL);
  for (let i = 0; i < limit; i++) {
    const job = await one<Job>(env, "SELECT * FROM ai_queue WHERE status = 'pending' ORDER BY id LIMIT 1");
    if (!job) return done;
    const claimed = await run(env, "UPDATE ai_queue SET status = 'working', updated_at = ? WHERE id = ? AND status = 'pending'", now(), job.id);
    if (!claimed.meta.changes) continue;
    done++;
    const g = await getGuild(env, job.guild_id);
    try {
      const c = await generateFor(forClass(env, g.id), g, job.kind, job.difficulty, job.topic, job.code_lang);
      if (!c) throw new Error("generation failed");
      await run(env, "UPDATE ai_queue SET status = 'done', challenge_id = ?, updated_at = ? WHERE id = ?", c.id, now(), job.id);
      if (job.token && job.discord_id) {
        const a = await startAttempt(env, g, job.discord_id, c, "practice");
        await editOriginal(env, job.token, await renderFor(env, g, c, a, { notice: t(g.lang, "ch.fresh") })).catch(() => {});
      }
    } catch (e) {
      await run(env, "UPDATE ai_queue SET status = 'failed', error = ?, updated_at = ? WHERE id = ?", String((e as Error).message).slice(0, 300), now(), job.id);
      if (job.token) await editOriginal(env, job.token, { content: t(g.lang, "ch.ai_failed"), embeds: [], components: [] }).catch(() => {});
    }
  }
  return done;
}
