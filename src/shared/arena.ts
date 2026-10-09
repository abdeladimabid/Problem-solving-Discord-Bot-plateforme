// #arena: the one channel where the bot posts everything public (daily
// challenge, duels, level-ups, contests, assignments, weekly recap).
import type { Env, GuildRow } from "./types.ts";
import { run } from "./db.ts";
import { dapi } from "./discord.ts";

const checked = new Map<string, number>();

/**
 * The channel for public posts: the configured arena, else a text channel
 * named "arena" (found automatically and remembered), else the announcements channel.
 */
export async function arenaChannel(env: Env, g: GuildRow): Promise<string | null> {
  if (g.arena_channel) return g.arena_channel;
  const last = checked.get(g.id) ?? 0;
  if (Date.now() - last > 10 * 60 * 1000) {
    checked.set(g.id, Date.now());
    try {
      const channels = await dapi<any[]>(env, "GET", `/guilds/${g.id}/channels`);
      const arena = channels.find((c) => (c.type === 0 || c.type === 5) && String(c.name).toLowerCase().replace(/[^a-z0-9]/g, "").endsWith("arena"));
      if (arena) {
        await run(env, "UPDATE guilds SET arena_channel = ? WHERE id = ?", arena.id, g.id);
        g.arena_channel = arena.id;
        return arena.id;
      }
    } catch { /* no permission to list channels: fall back */ }
  }
  return g.announce_channel || g.daily_channel || null;
}
