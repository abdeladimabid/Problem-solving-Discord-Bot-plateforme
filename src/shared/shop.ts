// Coin shop: coins finally buy something.
//   🧊 streak freeze  one missed day doesn't break the daily or plan streak
//   🎟️ hint token     the next hint costs no points
//   🏷️ title          a custom title next to your name for 7 days (profile, leaderboard)
//   🎨 color          your own colored role for 7 days
import type { Env, GuildRow, PlayerRow } from "./types.ts";
import { all, findPlayer, now, run } from "./db.ts";
import { addRole, dapi } from "./discord.ts";

export interface ShopItem { key: "freeze" | "hint" | "title" | "color"; price: number; emoji: string; max?: number; days?: number }
export const SHOP: ShopItem[] = [
  { key: "freeze", price: 60, emoji: "🧊", max: 2 },
  { key: "hint", price: 30, emoji: "🎟️", max: 5 },
  { key: "title", price: 100, emoji: "🏷️", days: 7 },
  { key: "color", price: 200, emoji: "🎨", days: 7 },
];
export class ShopError extends Error {}

const clean = (s: string) => s.replace(/<[@#&!][^>]*>|@everyone|@here|https?:\/\/\S+|discord\.gg\/\S+/gi, "").replace(/[\r\n`*_~|]/g, "").trim();

/** Take the coins atomically (never below the shop price). */
async function pay(env: Env, g: GuildRow, uid: string, price: number) {
  const r = await run(env, "UPDATE players SET coins = coins - ? WHERE guild_id = ? AND discord_id = ? AND coins >= ?", price, g.id, uid, price);
  if (!r.meta.changes) throw new ShopError("shop.no_coins");
}

export async function buy(env: Env, g: GuildRow, uid: string, key: string, detail = ""): Promise<{ key: string; detail?: string }> {
  const item = SHOP.find((x) => x.key === key);
  if (!item) throw new ShopError("err.unknown");
  const p = (await findPlayer(env, g.id, uid)) as PlayerRow | null;
  if (!p) throw new ShopError("err.unknown");
  if (item.key === "freeze") {
    if ((p.streak_freezes ?? 0) >= item.max!) throw new ShopError("shop.max");
    await pay(env, g, uid, item.price);
    await run(env, "UPDATE players SET streak_freezes = streak_freezes + 1 WHERE guild_id = ? AND discord_id = ?", g.id, uid);
  } else if (item.key === "hint") {
    if ((p.hint_tokens ?? 0) >= item.max!) throw new ShopError("shop.max");
    await pay(env, g, uid, item.price);
    await run(env, "UPDATE players SET hint_tokens = hint_tokens + 1 WHERE guild_id = ? AND discord_id = ?", g.id, uid);
  } else if (item.key === "title") {
    const title = clean(detail).slice(0, 24);
    if (title.length < 2) throw new ShopError("shop.bad_title");
    await pay(env, g, uid, item.price);
    await run(env, "UPDATE players SET title = ?, title_until = ? WHERE guild_id = ? AND discord_id = ?", title, now() + item.days! * 86400, g.id, uid);
    detail = title;
  } else {
    const hex = detail.trim().replace(/^#/, "").toLowerCase();
    if (!/^[0-9a-f]{6}$/.test(hex)) throw new ShopError("shop.bad_color");
    await pay(env, g, uid, item.price);
    try {
      let roleId = p.color_role;
      if (roleId) {
        await dapi(env, "PATCH", `/guilds/${g.id}/roles/${roleId}`, { color: parseInt(hex, 16) });
      } else {
        const role = await dapi<any>(env, "POST", `/guilds/${g.id}/roles`, { name: `🎨 ${clean(p.name ?? "") || "color"}`.slice(0, 90), color: parseInt(hex, 16), hoist: false, mentionable: false, permissions: "0" });
        roleId = String(role.id);
        await addRole(env, g.id, uid, roleId);
      }
      const until = Math.max(p.color_until ?? 0, now()) + item.days! * 86400;
      await run(env, "UPDATE players SET color_role = ?, color_until = ? WHERE guild_id = ? AND discord_id = ?", roleId, until, g.id, uid);
    } catch {
      await run(env, "UPDATE players SET coins = coins + ? WHERE guild_id = ? AND discord_id = ?", item.price, g.id, uid);   // refund
      throw new ShopError("shop.no_roles");
    }
    detail = "#" + hex;
  }
  await run(env, "INSERT INTO purchases (guild_id, discord_id, item, cost, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)", g.id, uid, item.key, item.price, detail || null, now());
  return { key: item.key, detail };
}

/** Spend a hint token if the student has one (returns true when used). */
export async function useHintToken(env: Env, g: GuildRow, uid: string, attemptId: number): Promise<boolean> {
  const r = await run(env, "UPDATE players SET hint_tokens = hint_tokens - 1 WHERE guild_id = ? AND discord_id = ? AND hint_tokens > 0", g.id, uid);
  if (!r.meta.changes) return false;
  await run(env, "UPDATE attempts SET free_hints = free_hints + 1 WHERE id = ?", attemptId);
  return true;
}

/** Title shown next to a name while it's valid. */
export const activeTitle = (p: { title?: string | null; title_until?: number | null } | null | undefined) =>
  p?.title && (p.title_until ?? 0) > now() ? p.title : null;

/** Cron: remove expired color roles and titles. */
export async function expireShop(env: Env) {
  const t0 = now();
  for (const p of await all<{ guild_id: string; discord_id: string; color_role: string }>(env, "SELECT guild_id, discord_id, color_role FROM players WHERE color_role IS NOT NULL AND color_until < ? LIMIT 5", t0)) {
    await dapi(env, "DELETE", `/guilds/${p.guild_id}/roles/${p.color_role}`).catch(() => {});
    await run(env, "UPDATE players SET color_role = NULL, color_until = NULL WHERE guild_id = ? AND discord_id = ?", p.guild_id, p.discord_id);
  }
  await run(env, "UPDATE players SET title = NULL, title_until = NULL WHERE title IS NOT NULL AND title_until < ?", t0);
}

export async function inventory(env: Env, g: GuildRow, uid: string) {
  const p = (await findPlayer(env, g.id, uid)) as PlayerRow | null;
  return { coins: p?.coins ?? 0, freezes: p?.streak_freezes ?? 0, hints: p?.hint_tokens ?? 0, title: activeTitle(p), titleUntil: p?.title_until ?? null, color: !!p?.color_role, colorUntil: p?.color_until ?? null };
}
