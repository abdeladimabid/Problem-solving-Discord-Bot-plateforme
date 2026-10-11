// Coin shop: coins finally buy something.
//   🧊 streak freeze  one missed day doesn't break the daily or plan streak
//   🎟️ hint token     the next hint costs no points
//   🏷️ title          a custom title next to your name for 7 days (profile, leaderboard)
//   🎨 color          your own colored role for 7 days
import type { Env, GuildRow, PlayerRow } from "./types.ts";
import { all, findPlayer, now, one, run } from "./db.ts";
import { addRole, dapi } from "./discord.ts";

export interface ShopItem {
  key: string; price: number; emoji: string; max?: number; days?: number;
  custom?: boolean; name?: string; desc?: string; stock?: number | null; perStudent?: number | null; on?: boolean;
}
type BuiltIn = "freeze" | "hint" | "title" | "color";
export const SHOP: (ShopItem & { key: BuiltIn })[] = [
  { key: "freeze", price: 60, emoji: "🧊", max: 2 },
  { key: "hint", price: 30, emoji: "🎟️", max: 5 },
  { key: "title", price: 100, emoji: "🏷️", days: 7 },
  { key: "color", price: 200, emoji: "🎨", days: 7 },
];
export interface CustomReward { id: string; name: string; emoji: string; price: number; desc?: string; stock?: number | null; per_student?: number | null; on?: boolean }
export interface ShopCfg { items: Record<string, { on?: boolean; price?: number; max?: number; days?: number }>; custom: CustomReward[] }

export function shopCfg(g: Pick<GuildRow, "shop">): ShopCfg {
  let o: any = {};
  try { o = JSON.parse(g.shop || "{}") ?? {}; } catch { o = {}; }
  return { items: o.items && typeof o.items === "object" ? o.items : {}, custom: Array.isArray(o.custom) ? o.custom : [] };
}
const int = (v: unknown, def: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };

/** What the class's shop sells right now: the built-in items (with the teacher's prices/limits) and the teacher's own rewards. */
export function shopItems(g: Pick<GuildRow, "shop">, all = false): ShopItem[] {
  const cfg = shopCfg(g);
  const built = SHOP.map((it) => {
    const o = cfg.items[it.key] ?? {};
    return { ...it, on: o.on !== false, price: int(o.price, it.price, 0, 100000), ...(it.max != null ? { max: int(o.max, it.max, 1, 50) } : {}), ...(it.days != null ? { days: int(o.days, it.days, 1, 90) } : {}) };
  });
  const custom = cfg.custom.map((c) => ({ key: `c_${c.id}`, custom: true, name: c.name, emoji: c.emoji || "🎁", desc: c.desc ?? "", price: int(c.price, 50, 0, 100000),
    stock: c.stock == null || (c.stock as any) === "" ? null : int(c.stock, 0, 0, 10000), perStudent: c.per_student == null || (c.per_student as any) === "" ? null : int(c.per_student, 1, 1, 100), on: c.on !== false }));
  return [...built, ...custom].filter((x) => all || x.on);
}

/** Save the teacher's shop settings (cleaned). */
export async function saveShop(env: Env, g: GuildRow, b: any): Promise<ShopCfg> {
  const items: ShopCfg["items"] = {};
  for (const it of SHOP) {
    const o = b?.items?.[it.key] ?? {};
    items[it.key] = { on: o.on !== false, price: int(o.price, it.price, 0, 100000), ...(it.max != null ? { max: int(o.max, it.max, 1, 50) } : {}), ...(it.days != null ? { days: int(o.days, it.days, 1, 90) } : {}) };
  }
  const custom: CustomReward[] = (Array.isArray(b?.custom) ? b.custom : []).slice(0, 15).map((c: any) => ({
    id: String(c.id || Math.random().toString(36).slice(2, 8)).replace(/[^a-z0-9]/gi, "").slice(0, 12) || Math.random().toString(36).slice(2, 8),
    name: clean(String(c.name ?? "")).slice(0, 60), emoji: String(c.emoji ?? "🎁").slice(0, 8) || "🎁", price: int(c.price, 50, 0, 100000),
    desc: clean(String(c.desc ?? "")).slice(0, 160), stock: c.stock === "" || c.stock == null ? null : int(c.stock, 0, 0, 10000),
    per_student: c.per_student === "" || c.per_student == null ? null : int(c.per_student, 1, 1, 100), on: c.on !== false,
  })).filter((c: CustomReward) => c.name.length >= 2);
  const cfg = { items, custom };
  await run(env, "UPDATE guilds SET shop = ? WHERE id = ?", JSON.stringify(cfg), g.id);
  return cfg;
}

export class ShopError extends Error {}

const clean = (s: string) => s.replace(/<[@#&!][^>]*>|@everyone|@here|https?:\/\/\S+|discord\.gg\/\S+/gi, "").replace(/[\r\n`*_~|]/g, "").trim();

/** Take the coins atomically (never below the shop price). */
async function pay(env: Env, g: GuildRow, uid: string, price: number) {
  const r = await run(env, "UPDATE players SET coins = coins - ? WHERE guild_id = ? AND discord_id = ? AND coins >= ?", price, g.id, uid, price);
  if (!r.meta.changes) throw new ShopError("shop.no_coins");
}

export async function buy(env: Env, g: GuildRow, uid: string, key: string, detail = ""): Promise<{ key: string; detail?: string; item?: ShopItem; purchase?: number }> {
  const item = shopItems(g).find((x) => x.key === key);
  if (!item) throw new ShopError("shop.unavailable");
  const p = (await findPlayer(env, g.id, uid)) as PlayerRow | null;
  if (!p) throw new ShopError("err.unknown");
  if (item.custom) {
    // the teacher's own reward: limited stock / per student, handed out by the teacher
    if (item.stock != null) {
      const sold = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM purchases WHERE guild_id = ? AND item = ? AND COALESCE(status, '') != 'refunded'", g.id, item.key);
      if ((sold?.n ?? 0) >= item.stock) throw new ShopError("shop.sold_out");
    }
    if (item.perStudent != null) {
      const mine = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM purchases WHERE guild_id = ? AND discord_id = ? AND item = ? AND COALESCE(status, '') != 'refunded'", g.id, uid, item.key);
      if ((mine?.n ?? 0) >= item.perStudent) throw new ShopError("shop.max");
    }
    await pay(env, g, uid, item.price);
    const r = await run(env, "INSERT INTO purchases (guild_id, discord_id, item, cost, detail, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)", g.id, uid, item.key, item.price, item.name ?? null, now());
    return { key: item.key, detail: item.name, item, purchase: Number(r.meta.last_row_id) };
  }
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
  return { key: item.key, detail, item };
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

// ------------------------------------------------------------- teacher: coins
/** Give, remove or set coins for some students (or everyone). Logged; never below 0. Returns the new balances. */
export async function changeCoins(env: Env, g: GuildRow, o: { students: string[] | "all"; op: "add" | "remove" | "set"; amount: number; reason?: string }) {
  const amount = Math.max(0, Math.round(Number(o.amount) || 0));
  if (o.op !== "set" && !amount) throw new ShopError("amount must be more than 0");
  const ids = o.students === "all"
    ? (await all<{ discord_id: string }>(env, "SELECT discord_id FROM players WHERE guild_id = ?", g.id)).map((r) => r.discord_id)
    : [...new Set(o.students.map(String))];
  if (!ids.length) throw new ShopError("choose at least one student");
  const before = new Map((await all<{ discord_id: string; coins: number }>(env,
    `SELECT discord_id, coins FROM players WHERE guild_id = ? AND discord_id IN (${ids.map(() => "?").join(", ")})`, g.id, ...ids)).map((r) => [r.discord_id, r.coins]));
  const t0 = now(), reason = clean(String(o.reason ?? "")).slice(0, 200) || null;
  const stmts: any[] = [];
  const out: { discord_id: string; before: number; after: number }[] = [];
  for (const id of ids) {
    if (!before.has(id)) continue;
    const b = before.get(id)!;
    const after = o.op === "set" ? amount : o.op === "add" ? b + amount : Math.max(0, b - amount);
    if (after === b) continue;
    stmts.push(env.DB.prepare("UPDATE players SET coins = ? WHERE guild_id = ? AND discord_id = ?").bind(after, g.id, id));
    stmts.push(env.DB.prepare("INSERT INTO coin_log (guild_id, discord_id, delta, balance, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(g.id, id, after - b, after, reason, t0));
    out.push({ discord_id: id, before: b, after });
  }
  if (stmts.length) await env.DB.batch(stmts);
  return out;
}

/** The teacher hands out an own reward (or refunds it). */
export async function settlePurchase(env: Env, g: GuildRow, id: number, action: "given" | "refund") {
  const p = await one<{ id: number; discord_id: string; cost: number; status: string | null }>(env, "SELECT id, discord_id, cost, status FROM purchases WHERE id = ? AND guild_id = ?", id, g.id);
  if (!p || p.status !== "pending") throw new ShopError("this reward was already handled");
  if (action === "refund") {
    await env.DB.batch([
      env.DB.prepare("UPDATE purchases SET status = 'refunded' WHERE id = ?").bind(id),
      env.DB.prepare("UPDATE players SET coins = coins + ? WHERE guild_id = ? AND discord_id = ?").bind(p.cost, g.id, p.discord_id),
    ]);
  } else await run(env, "UPDATE purchases SET status = 'given' WHERE id = ?", id);
  return p;
}
