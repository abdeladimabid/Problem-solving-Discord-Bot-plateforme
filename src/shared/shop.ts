// Coin shop: coins buy things.
//   Items     🧊 streak freeze · 🎟️ hint token
//   Boosts    💎 double code hour · 🎯 challenge contract · 🛡️ duel shield
//   Profile   🏷️ title · 🎨 color role · 🖼️ theme · 💬 motto · 😎 emoji · 🏅 badge showcase · 💻 favourite language · 📌 pinned solve · 🔲 avatar frame
//   The game  ⚔️ victory message · 🎉 level-up style · 🌟 leaderboard flair
// Nothing here touches assigned work: boosts only apply to work the student picks (practice, /today, /path).
import type { Env, GuildRow, PlayerRow } from "./types.ts";
import { all, findPlayer, now, one, run } from "./db.ts";
import { addRole, dapi } from "./discord.ts";
import { LANGS } from "./runner.ts";
import { t } from "./i18n.ts";

export type ShopGroup = "item" | "boost" | "profile" | "game";
export interface ShopItem {
  key: string; price: number; emoji: string; group?: ShopGroup; max?: number; days?: number; hours?: number; reward?: number;
  custom?: boolean; name?: string; desc?: string; stock?: number | null; perStudent?: number | null; on?: boolean;
}
export const SHOP: ShopItem[] = [
  { key: "freeze", price: 60, emoji: "🧊", group: "item", max: 2 },
  { key: "hint", price: 30, emoji: "🎟️", group: "item", max: 5 },
  { key: "buddy", price: 800, emoji: "🤝", group: "item", max: 1 },   // max = how many the whole class can buy per season
  { key: "double", price: 120, emoji: "💎", group: "boost", hours: 1 },
  { key: "contract", price: 50, emoji: "🎯", group: "boost", hours: 24, reward: 150 },
  { key: "shield", price: 80, emoji: "🛡️", group: "boost", hours: 24 },
  { key: "title", price: 100, emoji: "🏷️", group: "profile", days: 7 },
  { key: "color", price: 200, emoji: "🎨", group: "profile", days: 7 },
  { key: "theme", price: 150, emoji: "🖼️", group: "profile", days: 30 },
  { key: "motto", price: 80, emoji: "💬", group: "profile", days: 30 },
  { key: "emoji", price: 100, emoji: "😎", group: "profile", days: 30 },
  { key: "showcase", price: 60, emoji: "🏅", group: "profile", days: 30 },
  { key: "lang", price: 50, emoji: "💻", group: "profile", days: 30 },
  { key: "pin", price: 120, emoji: "📌", group: "profile", days: 30 },
  { key: "frame", price: 200, emoji: "🔲", group: "profile", days: 30 },
  { key: "victory", price: 120, emoji: "⚔️", group: "game", days: 30 },
  { key: "levelup", price: 150, emoji: "🎉", group: "game", days: 30 },
  { key: "flair", price: 100, emoji: "🌟", group: "game", days: 30 },
];
export const COSMETICS = ["theme", "motto", "emoji", "showcase", "lang", "pin", "frame", "victory", "levelup", "flair"] as const;
export type Cosmetic = typeof COSMETICS[number];

// the choices offered for "pick one" items
export const THEMES: Record<string, { emoji: string; color: string; to: string }> = {
  ocean: { emoji: "🌊", color: "#0ea5e9", to: "#2563eb" }, forest: { emoji: "🌲", color: "#16a34a", to: "#0f766e" },
  sunset: { emoji: "🌅", color: "#f97316", to: "#db2777" }, royal: { emoji: "👑", color: "#7c3aed", to: "#4338ca" },
  rose: { emoji: "🌹", color: "#e11d48", to: "#9f1239" }, gold: { emoji: "✨", color: "#eab308", to: "#c2410c" },
  midnight: { emoji: "🌙", color: "#334155", to: "#0f172a" }, mint: { emoji: "🍃", color: "#14b8a6", to: "#0891b2" },
};
export const FRAMES: Record<string, { emoji: string; css: string }> = {
  fire: { emoji: "🔥", css: "#f97316" }, ice: { emoji: "❄️", css: "#7dd3fc" }, gold: { emoji: "👑", css: "#facc15" },
  neon: { emoji: "⚡", css: "#a3e635" }, nature: { emoji: "🌿", css: "#22c55e" }, galaxy: { emoji: "🌌", css: "#a78bfa" },
};
export const LEVELUP_STYLES: Record<string, string> = { fireworks: "🎆", rocket: "🚀", dragon: "🐉", royal: "👑", wizard: "🧙" };
export const FLAIRS = ["✨", "⭐", "🔥", "💎", "👑", "⚡", "🌈", "🍀", "🎯", "🦄", "🚀", "🐉"];
export const CONTRACTS: Record<string, { level: "easy" | "medium" | "hard"; target: number }> = {
  easy: { level: "easy", target: 5 }, medium: { level: "medium", target: 3 }, hard: { level: "hard", target: 2 },
};
export const FAV_LANGS = [...Object.keys(LANGS), "sql"];
const RANK: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
/** Kinds that count as "writing code" for boosts and contracts. */
export const CODE_BOOST_KINDS = ["write", "sql", "code"];
/** Where a double code hour applies: work the student picks, never assigned or class-wide work. */
export const DOUBLE_ORIGINS = ["practice", "plan", "path"];

export interface CustomReward { id: string; name: string; emoji: string; price: number; desc?: string; stock?: number | null; per_student?: number | null; on?: boolean }
export interface ShopCfg { items: Record<string, { on?: boolean; price?: number; max?: number; days?: number; hours?: number; reward?: number }>; custom: CustomReward[] }

export function shopCfg(g: Pick<GuildRow, "shop">): ShopCfg {
  let o: any = {};
  try { o = JSON.parse(g.shop || "{}") ?? {}; } catch { o = {}; }
  return { items: o.items && typeof o.items === "object" ? o.items : {}, custom: Array.isArray(o.custom) ? o.custom : [] };
}
const int = (v: unknown, def: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && v !== "" && v != null ? Math.min(max, Math.max(min, n)) : def; };

/** A built-in item with the teacher's settings applied. */
function withCfg(it: ShopItem, o: ShopCfg["items"][string] = {}): ShopItem {
  return {
    ...it, on: o.on !== false, price: int(o.price, it.price, 0, 100000),
    ...(it.max != null ? { max: int(o.max, it.max, 1, 50) } : {}),
    ...(it.days != null ? { days: int(o.days, it.days, 1, 90) } : {}),
    ...(it.hours != null ? { hours: int(o.hours, it.hours, 1, 72) } : {}),
    ...(it.reward != null ? { reward: int(o.reward, it.reward, 0, 100000) } : {}),
  };
}

/** What the class's shop sells right now: the built-in items (with the teacher's prices/limits) and the teacher's own rewards. */
export function shopItems(g: Pick<GuildRow, "shop">, all = false): ShopItem[] {
  const cfg = shopCfg(g);
  const built = SHOP.map((it) => withCfg(it, cfg.items[it.key]));
  const custom = cfg.custom.map((c) => ({ key: `c_${c.id}`, custom: true, name: c.name, emoji: c.emoji || "🎁", desc: c.desc ?? "", price: int(c.price, 50, 0, 100000),
    stock: c.stock == null || (c.stock as any) === "" ? null : int(c.stock, 0, 0, 10000), perStudent: c.per_student == null || (c.per_student as any) === "" ? null : int(c.per_student, 1, 1, 100), on: c.on !== false }));
  return [...built, ...custom].filter((x) => all || x.on);
}

/** Save the teacher's shop settings (cleaned). */
export async function saveShop(env: Env, g: GuildRow, b: any): Promise<ShopCfg> {
  const items: ShopCfg["items"] = {};
  for (const it of SHOP) {
    const { on, price, max, days, hours, reward } = withCfg(it, b?.items?.[it.key] ?? {});
    items[it.key] = { on, price, ...(max != null ? { max } : {}), ...(days != null ? { days } : {}), ...(hours != null ? { hours } : {}), ...(reward != null ? { reward } : {}) };
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

export const clean = (s: string) => s.replace(/<[@#&!a:][^>]*>|@everyone|@here|https?:\/\/\S+|discord\.gg\/\S+/gi, "").replace(/[\r\n`*_~|<>]/g, " ").replace(/\s{2,}/g, " ").trim();

// ------------------------------------------------------- cosmetics & boosts
const parse = (s: string | null | undefined) => { try { const o = JSON.parse(s || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; } };
export type Cosmetics = Partial<Record<Cosmetic, string>>;
/** The cosmetics a player has right now (expired ones are left out). */
export function cosmeticsOf(p: { cosmetics?: string | null } | null | undefined, t0 = now()): Cosmetics {
  const o = parse(p?.cosmetics), out: Cosmetics = {};
  for (const k of COSMETICS) if (o[k]?.v != null && (o[k].until ?? 0) > t0) out[k] = String(o[k].v);
  return out;
}
export function cosmeticUntil(p: { cosmetics?: string | null } | null | undefined, key: Cosmetic): number | null {
  const u = parse(p?.cosmetics)[key]?.until;
  return u && u > now() ? u : null;
}
export interface Contract { level: "easy" | "medium" | "hard"; target: number; ids: number[]; until: number; reward: number; done?: number; failed?: number }
export interface Boosts { double_until?: number; shield_until?: number; contract?: Contract }
export const boostsOf = (p: { boosts?: string | null } | null | undefined): Boosts => parse(p?.boosts);
export const doubleActive = (b: Boosts, t0 = now()) => (b.double_until ?? 0) > t0;
export const shieldActive = (b: Boosts, t0 = now()) => (b.shield_until ?? 0) > t0;
export const contractActive = (b: Boosts, t0 = now()) => !!b.contract && !b.contract.done && b.contract.until > t0;

/** Write one key of a JSON column atomically (two purchases at once don't erase each other). */
function setJson(env: Env, g: GuildRow, uid: string, col: "cosmetics" | "boosts", key: string, value: unknown) {
  return run(env, `UPDATE players SET ${col} = json_set(CASE WHEN json_valid(${col}) THEN ${col} ELSE '{}' END, ?, json(?)) WHERE guild_id = ? AND discord_id = ?`,
    `$.${key}`, JSON.stringify(value), g.id, uid);
}

const EMOJI_RX = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2})(?:\p{Emoji_Modifier}|️|‍(?:\p{Extended_Pictographic})️?)*$/u;
/** Check and normalise what the student picked for a cosmetic. */
async function cosmeticValue(env: Env, g: GuildRow, uid: string, key: Cosmetic, raw: string): Promise<string> {
  const v = raw.trim();
  switch (key) {
    case "theme": if (THEMES[v]) return v; break;
    case "frame": if (FRAMES[v]) return v; break;
    case "levelup": if (LEVELUP_STYLES[v]) return v; break;
    case "flair": if (FLAIRS.includes(v)) return v; break;
    case "lang": if (FAV_LANGS.includes(v)) return v; break;
    case "emoji": {
      const e = v.replace(/\s+/g, "");
      if (EMOJI_RX.test(e) && e.length <= 16) return e;
      throw new ShopError("shop.bad_emoji");
    }
    case "motto": case "victory": {
      const max = key === "motto" ? 60 : 100;
      const s = clean(v).slice(0, max);
      if (s.length < 2) throw new ShopError("shop.bad_text");
      return s;
    }
    case "showcase": {
      const owned = new Set((await all<{ badge: string }>(env, "SELECT badge FROM badges WHERE guild_id = ? AND discord_id = ?", g.id, uid)).map((b) => b.badge));
      const pick = [...new Set(v.split(",").map((x) => x.trim()).filter((x) => owned.has(x)))].slice(0, 3);
      if (pick.length) return pick.join(",");
      throw new ShopError(owned.size ? "shop.bad_choice" : "shop.no_badges");
    }
    case "pin": {
      const id = Number(v);
      const ok = id > 0 && (await one(env, "SELECT 1 FROM attempts WHERE guild_id = ? AND discord_id = ? AND challenge_id = ? AND status = 'solved' LIMIT 1", g.id, uid, id));
      if (ok) return String(id);
      throw new ShopError("shop.no_solves");
    }
  }
  throw new ShopError("shop.bad_choice");
}

export const isEmoji = (s: string) => EMOJI_RX.test(s);
/** How a cosmetic's value reads for people. */
export function cosmeticLabel(L: string, key: string, v: string): string {
  switch (key) {
    case "theme": return `${THEMES[v]?.emoji ?? ""} ${t(L, `shop.theme.${v}`)}`.trim();
    case "frame": return `${FRAMES[v]?.emoji ?? ""} ${t(L, `shop.frame.${v}`)}`.trim();
    case "levelup": return `${LEVELUP_STYLES[v] ?? ""} ${t(L, `shop.lvstyle.${v}`)}`.trim();
    case "lang": return v === "sql" ? "SQL" : LANGS[v as keyof typeof LANGS]?.label ?? v;
    case "showcase": return v.split(",").filter(Boolean).map((b) => t(L, `badge.${b}`)).join(" · ");
    case "contract": return v;
    default: return v;
  }
}

/** Take the coins atomically (never below the shop price). */
async function pay(env: Env, g: GuildRow, uid: string, price: number) {
  const r = await run(env, "UPDATE players SET coins = coins - ? WHERE guild_id = ? AND discord_id = ? AND coins >= ?", price, g.id, uid, price);
  if (!r.meta.changes) throw new ShopError("shop.no_coins");
}

/** How many squad buddies the class bought this season (the shop has `max` per season, for the whole class). */
export async function buddySold(env: Env, g: GuildRow): Promise<number> {
  const r = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM purchases WHERE guild_id = ? AND item = 'buddy' AND substr(COALESCE(detail, ''), 1, ?) = ? AND COALESCE(status, '') != 'refunded'",
    g.id, g.season.length + 1, g.season + "|");
  return r?.n ?? 0;
}

export async function buy(env: Env, g: GuildRow, uid: string, key: string, detail = ""): Promise<{ key: string; detail?: string; item?: ShopItem; purchase?: number; until?: number }> {
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
  const t0 = now();
  let until: number | undefined;
  if (item.key === "freeze") {
    if ((p.streak_freezes ?? 0) >= item.max!) throw new ShopError("shop.max");
    await pay(env, g, uid, item.price);
    await run(env, "UPDATE players SET streak_freezes = streak_freezes + 1 WHERE guild_id = ? AND discord_id = ?", g.id, uid);
  } else if (item.key === "hint") {
    if ((p.hint_tokens ?? 0) >= item.max!) throw new ShopError("shop.max");
    await pay(env, g, uid, item.price);
    await run(env, "UPDATE players SET hint_tokens = hint_tokens + 1 WHERE guild_id = ? AND discord_id = ?", g.id, uid);
  } else if (item.key === "buddy") {
    // a classmate in the same squad next sprint (the teacher sees it on the squads board): once per season
    const mate = detail.trim();
    if (!/^\d{1,25}$/.test(mate) || mate === uid || !(await one(env, "SELECT 1 AS x FROM players WHERE guild_id = ? AND discord_id = ?", g.id, mate))) throw new ShopError("shop.buddy_bad");
    if ((await buddySold(env, g)) >= (item.max ?? 1)) throw new ShopError("shop.buddy_sold");
    await pay(env, g, uid, item.price);
    const r = await run(env, "INSERT INTO purchases (guild_id, discord_id, item, cost, detail, status, created_at) VALUES (?, ?, 'buddy', ?, ?, 'pending', ?)", g.id, uid, item.price, `${g.season}|${mate}`, t0);
    return { key: item.key, detail: mate, item, purchase: Number(r.meta.last_row_id) };
  } else if (item.key === "title") {
    const title = clean(detail).slice(0, 24);
    if (title.length < 2) throw new ShopError("shop.bad_title");
    await pay(env, g, uid, item.price);
    until = t0 + item.days! * 86400;
    await run(env, "UPDATE players SET title = ?, title_until = ? WHERE guild_id = ? AND discord_id = ?", title, until, g.id, uid);
    detail = title;
  } else if (item.key === "color") {
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
      until = Math.max(p.color_until ?? 0, t0) + item.days! * 86400;
      await run(env, "UPDATE players SET color_role = ?, color_until = ? WHERE guild_id = ? AND discord_id = ?", roleId, until, g.id, uid);
    } catch {
      await run(env, "UPDATE players SET coins = coins + ? WHERE guild_id = ? AND discord_id = ?", item.price, g.id, uid);   // refund
      throw new ShopError("shop.no_roles");
    }
    detail = "#" + hex;
  } else if (item.key === "double" || item.key === "shield") {
    const b = boostsOf(p), field = item.key === "double" ? "double_until" : "shield_until";
    await pay(env, g, uid, item.price);
    until = Math.max(b[field] ?? 0, t0) + item.hours! * 3600;   // buying again adds time
    await setJson(env, g, uid, "boosts", field, until);
    detail = "";
  } else if (item.key === "contract") {
    const goal = CONTRACTS[detail.trim()];
    if (!goal) throw new ShopError("shop.bad_choice");
    if (contractActive(boostsOf(p), t0)) throw new ShopError("shop.contract_active");
    await pay(env, g, uid, item.price);
    until = t0 + item.hours! * 3600;
    const c: Contract = { level: goal.level, target: goal.target, ids: [], until, reward: item.reward ?? 0 };
    await setJson(env, g, uid, "boosts", "contract", c);
    detail = `${goal.target}× ${goal.level}`;
  } else if ((COSMETICS as readonly string[]).includes(item.key)) {
    const k = item.key as Cosmetic;
    const v = await cosmeticValue(env, g, uid, k, detail);
    await pay(env, g, uid, item.price);
    // buying the same thing again (e.g. a new motto) keeps the time left and adds more
    until = Math.max(cosmeticUntil(p, k) ?? 0, t0) + item.days! * 86400;
    await setJson(env, g, uid, "cosmetics", k, { v, until });
    detail = v;
  } else throw new ShopError("shop.unavailable");
  await run(env, "INSERT INTO purchases (guild_id, discord_id, item, cost, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)", g.id, uid, item.key, item.price, detail || null, t0);
  return { key: item.key, detail, item, until };
}

/** A solved code/SQL challenge counts toward the student's contract. Returns what to tell them (and pays the reward when done). */
export async function contractStep(env: Env, g: GuildRow, uid: string, b: Boosts, c: { id: number; kind: string; difficulty: string }):
  Promise<{ n: number; target: number; done: boolean; reward: number } | null> {
  const k = b.contract;
  if (!k || !contractActive(b) || !CODE_BOOST_KINDS.includes(c.kind) || (RANK[c.difficulty] ?? 0) < (RANK[k.level] ?? 0) || k.ids.includes(c.id)) return null;
  const ids = [...k.ids, c.id], done = ids.length >= k.target;
  const next: Contract = { ...k, ids, ...(done ? { done: now() } : {}) };
  // only one finisher: the update checks the contract wasn't changed in between
  const r = await run(env, `UPDATE players SET boosts = json_set(boosts, '$.contract', json(?))${done ? ", coins = coins + ?" : ""}
      WHERE guild_id = ? AND discord_id = ? AND json_extract(boosts, '$.contract.until') = ? AND json_array_length(json_extract(boosts, '$.contract.ids')) = ?`,
    JSON.stringify(next), ...(done ? [k.reward] : []), g.id, uid, k.until, k.ids.length);
  if (!r.meta.changes) return null;
  return { n: ids.length, target: k.target, done, reward: k.reward };
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
  const cos = parse(p?.cosmetics), t0 = now();
  return {
    coins: p?.coins ?? 0, freezes: p?.streak_freezes ?? 0, hints: p?.hint_tokens ?? 0, title: activeTitle(p), titleUntil: p?.title_until ?? null,
    color: !!p?.color_role, colorUntil: p?.color_until ?? null, boosts: boostsOf(p),
    cosmetics: COSMETICS.filter((k) => (cos[k]?.until ?? 0) > t0).map((k) => ({ key: k, v: String(cos[k].v), until: cos[k].until as number })),
  };
}

/** The teacher removes something a student wrote (title, motto, emoji, victory message). */
export async function clearCosmetic(env: Env, g: GuildRow, uid: string, key: string) {
  if (key === "title") return run(env, "UPDATE players SET title = NULL, title_until = NULL WHERE guild_id = ? AND discord_id = ?", g.id, uid);
  if (!(COSMETICS as readonly string[]).includes(key)) throw new ShopError("unknown item");
  return run(env, "UPDATE players SET cosmetics = json_remove(cosmetics, ?) WHERE guild_id = ? AND discord_id = ? AND json_valid(cosmetics)", `$.${key}`, g.id, uid);
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
