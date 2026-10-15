// 🎮 /play and the 🎮 Join button the TV posts in #arena: each student gets their OWN link to the class game,
// signed with their Discord id, so nobody can play as (or knock out) a classmate.
import { t } from "../shared/i18n.ts";
import { all, getPlayer, now } from "../shared/db.ts";
import { row } from "../shared/discord.ts";
import { GAME_KINDS, getGame, parseGame, playLink } from "../shared/games.ts";
import type { Game, GameRow } from "../shared/games.ts";
import { type Ix, reply, say } from "./ix.ts";

const linkBtn = (label: string, url: string) => ({ type: 2, style: 5, label: label.slice(0, 80), url });

export async function playLinks(ix: Ix, only: number | null) {
  const L = ix.L, env = ix.env;
  let games: Game[];
  if (only) {
    const one = await getGame(env, only, ix.guild.id);
    games = one && one.status !== "done" ? [one] : [];
  } else {
    const rows = await all<GameRow>(env, "SELECT * FROM games WHERE guild_id = ? AND status IN ('ready', 'live') AND updated_at >= ? ORDER BY updated_at DESC LIMIT 3", ix.guild.id, now() - 12 * 3600);
    games = rows.map(parseGame);
  }
  if (!games.length) return say(t(L, "game.none"));
  await getPlayer(env, ix.guild.id, ix.userId, ix.userName);
  const open = games.filter((g) => !(g.state.banned ?? []).includes(ix.userId));
  if (!open.length) return say(t(L, "game.removed", { title: games[0].title }));
  const btns = await Promise.all(open.map(async (g) => linkBtn(`${GAME_KINDS[g.kind].emoji} ${t(L, "game.join", { title: g.title })}`, await playLink(env, g, ix.userId))));
  return reply({ content: t(L, "game.link"), components: [row(...btns)] }, true);
}
