// Buttons and commands for events (quiz, boss, bounty), the coin shop and peer help.
import type { ChallengeRow } from "../shared/types.ts";
import { t } from "../shared/i18n.ts";
import { COLORS, btn, modal, row } from "../shared/discord.ts";
import { all, one } from "../shared/db.ts";
import { getAttempt, getChallenge, renderFor, startAttempt } from "../shared/challenges.ts";
import { quizAnswer } from "../shared/events.ts";
import type { BossRow, BountyRow } from "../shared/events.ts";
import { CONTRACTS, FAV_LANGS, FLAIRS, FRAMES, LEVELUP_STYLES, SHOP, ShopError, THEMES, buy, cosmeticLabel, inventory, isEmoji, shopItems } from "../shared/shop.ts";
import type { ShopItem } from "../shared/shop.ts";
import { notifyPurchase } from "../shared/notify.ts";
import { HelpError, answerHelp, askHelp, rateHelp } from "../shared/help.ts";
import { type Ix, deferReply, deferUpdate, json, later, say } from "./ix.ts";

// ------------------------------------------------------------------ quiz
export async function quizButton(ix: Ix, quizId: number, idx: number, letter: string) {
  const r = await quizAnswer(ix.env, ix.guild, ix.userId, quizId, idx, letter);
  return say(t(ix.L, r.key, { letter: r.letter ?? "" }));
}

// ------------------------------------------------------------- boss/bounty
export async function bossButton(ix: Ix, id: number) {
  const L = ix.L;
  const b = await one<BossRow>(ix.env, "SELECT * FROM bosses WHERE id = ? AND guild_id = ?", id, ix.guild.id);
  if (!b || b.status !== "active") return say(t(L, "boss.over"));
  later(ix, async () => {
    const c = await getChallenge(ix.env, b.challenge_id);
    if (!c) return { content: t(L, "err.unknown") };
    const a = await startAttempt(ix.env, ix.guild, ix.userId, c, "boss", b.id);
    if (a.status !== "pending") return { content: t(L, "boss.done_for_you") };
    return renderFor(ix.env, ix.guild, c, a, { notice: t(L, "boss.notice", { name: b.name }) });
  });
  return deferReply(true);
}

export async function bountyButton(ix: Ix, id: number) {
  const L = ix.L;
  const b = await one<BountyRow>(ix.env, "SELECT * FROM bounties WHERE id = ? AND guild_id = ?", id, ix.guild.id);
  if (!b) return say(t(L, "err.unknown"));
  if (b.status !== "open") return say(t(L, b.status === "claimed" ? "bounty.too_late" : "bounty.expired"));
  later(ix, async () => {
    const c = await getChallenge(ix.env, b.challenge_id);
    if (!c) return { content: t(L, "err.unknown") };
    const a = await startAttempt(ix.env, ix.guild, ix.userId, c, "bounty", b.id);
    if (a.status !== "pending") return { content: t(L, "res.already") };
    return renderFor(ix.env, ix.guild, c, a, { notice: t(L, "bounty.notice", { pts: b.points, coins: b.coins }) });
  });
  return deferReply(true);
}

// ------------------------------------------------------------------ shop
const GROUPS = ["item", "boost", "profile", "game"] as const;
const PICKERS = ["theme", "frame", "levelup", "flair", "lang", "contract", "showcase", "pin"];
const TEXTS: Record<string, { max: number; long?: boolean; value?: string }> = { title: { max: 24 }, color: { max: 7, value: "#2563eb" }, motto: { max: 60 }, victory: { max: 100 }, emoji: { max: 16 } };
const itemVars = (it: ShopItem) => ({ price: it.price, emoji: it.emoji, days: it.days ?? 0, hours: it.hours ?? 0, max: it.max ?? 0, reward: it.reward ?? 0 });

async function shopView(ix: Ix, note = "") {
  const L = ix.L;
  const inv = await inventory(ix.env, ix.guild, ix.userId);
  const items = shopItems(ix.guild);
  const t0 = Math.floor(Date.now() / 1000);
  const b = inv.boosts, k = b.contract;
  const owned = [
    t(L, "shop.owned", { coins: inv.coins, freezes: inv.freezes, hints: inv.hints }),
    (b.double_until ?? 0) > t0 ? t(L, "shop.have.double", { until: `<t:${b.double_until}:R>` }) : "",
    (b.shield_until ?? 0) > t0 ? t(L, "shop.have.shield", { until: `<t:${b.shield_until}:R>` }) : "",
    k && !k.done && k.until > t0 ? t(L, "shop.have.contract", { n: k.ids.length, target: k.target, level: t(L, `diff.${k.level}`), until: `<t:${k.until}:R>`, reward: k.reward }) : "",
    inv.title ? t(L, "shop.owned_title", { title: inv.title, until: `<t:${inv.titleUntil}:R>` }) : "",
    inv.color ? t(L, "shop.owned_color", { until: `<t:${inv.colorUntil}:R>` }) : "",
    inv.cosmetics.length ? t(L, "shop.have.cosmetics", { list: inv.cosmetics.map((c) => `${SHOP.find((x) => x.key === c.key)?.emoji ?? ""} ${c.key === "pin" ? t(L, "shop.name.pin") : cosmeticLabel(L, c.key, c.v)}`).join(" · ") }) : "",
  ].filter(Boolean).join("\n");
  const embeds: any[] = [{ title: t(L, "shop.title"), description: (owned + (items.length ? "" : "\n\n" + t(L, "shop.empty"))).slice(0, 700), color: COLORS.gold }];
  for (const grp of GROUPS) {
    const list = items.filter((it) => !it.custom && it.group === grp);
    if (list.length) embeds.push({ title: t(L, `shop.group.${grp}`), color: COLORS.gold,
      description: list.map((it) => `${it.emoji} **${t(L, `shop.name.${it.key}`)}** · **${it.price}** 🪙 — ${t(L, `shop.desc.${it.key}`, itemVars(it))}`).join("\n").slice(0, 1050) });
  }
  const own = items.filter((it) => it.custom);
  if (own.length) embeds.push({ title: t(L, "shop.group.custom"), color: COLORS.purple,
    description: own.map((it) => `${it.emoji} **${it.name}** · **${it.price}** 🪙${it.desc ? ` — ${it.desc.slice(0, 90)}` : ""}`).join("\n").slice(0, 1050) });
  embeds[embeds.length - 1].footer = { text: t(L, "shop.footer") };
  const opt = (it: ShopItem) => {
    const label = `${it.custom ? it.name : t(L, `shop.name.${it.key}`)} · ${it.price} 🪙`.slice(0, 100);
    const description = (it.custom ? it.desc || "" : t(L, `shop.desc.${it.key}`, itemVars(it))).slice(0, 100);
    return { label, value: it.key, ...(description ? { description } : {}), ...(isEmoji(it.emoji) ? { emoji: { name: it.emoji } } : {}) };
  };
  const built = items.filter((it) => !it.custom).slice(0, 25), mine = own.slice(0, 25);
  const components = [];
  if (built.length) components.push(row({ type: 3, custom_id: "shopm", placeholder: t(L, "shop.menu"), options: built.map(opt) }));
  if (mine.length) components.push(row({ type: 3, custom_id: "shopmc", placeholder: t(L, "shop.menu_custom"), options: mine.map(opt) }));
  return { content: note, embeds, components };
}

export async function cmdShop(ix: Ix) {
  later(ix, () => shopView(ix));
  return deferReply(true);
}

/** A student chose an item: ask for the text or the choice it needs, or buy it right away. */
export async function shopButton(ix: Ix, key: string) {
  const L = ix.L;
  const item = shopItems(ix.guild).find((x) => x.key === key);
  if (!item) return say(t(L, "shop.unavailable"));
  const tx = TEXTS[key];
  if (tx && !item.custom) {
    return json(modal(`mshop:${key}`, t(L, `shop.modal_${key}`, { days: item.days ?? 7 }).slice(0, 45), [{ id: "v", label: t(L, `shop.modal_${key}_label`).slice(0, 45), max: tx.max, ...(tx.value ? { value: tx.value } : {}) }]));
  }
  if (PICKERS.includes(key)) {
    later(ix, async () => {
      const opts = await pickerOptions(ix, key, item);
      if (typeof opts === "string") return { content: "⚠️ " + t(L, opts), embeds: [], components: [] };
      const multi = key === "showcase" ? Math.min(3, opts.length) : 1;
      return {
        content: t(L, `shop.pick.${key}`, { price: item.price }), embeds: [],
        components: [row({ type: 3, custom_id: `shopsel:${key}`, placeholder: t(L, "shop.pick.placeholder"), min_values: 1, max_values: multi, options: opts })],
      };
    });
    return deferReply(true);
  }
  return doBuy(ix, key, "", true);
}

async function pickerOptions(ix: Ix, key: string, item: ShopItem): Promise<{ label: string; value: string; description?: string; emoji?: { name: string } }[] | string> {
  const L = ix.L;
  switch (key) {
    case "theme": return Object.entries(THEMES).map(([k, v]) => ({ label: t(L, `shop.theme.${k}`), value: k, emoji: { name: v.emoji } }));
    case "frame": return Object.entries(FRAMES).map(([k, v]) => ({ label: t(L, `shop.frame.${k}`), value: k, emoji: { name: v.emoji } }));
    case "levelup": return Object.entries(LEVELUP_STYLES).map(([k, e]) => ({ label: t(L, `shop.lvstyle.${k}`), value: k, emoji: { name: e },
      description: t(L, `arena.lv.${k}`, { user: ix.userName, level: "?", title: "…" }).replace(/[*_]/g, "").replace(/\n/g, " ").slice(0, 100) }));
    case "flair": return FLAIRS.map((f) => ({ label: `${f} ${ix.userName}`.slice(0, 100), value: f }));
    case "lang": return FAV_LANGS.map((k) => ({ label: cosmeticLabel(L, "lang", k), value: k }));
    case "contract": return Object.entries(CONTRACTS).map(([k, c]) => ({ label: t(L, "shop.contract_goal", { n: c.target, level: t(L, `diff.${c.level}`) }), value: k,
      description: t(L, "shop.contract_reward", { coins: item.reward ?? 0, hours: item.hours ?? 24 }) }));
    case "showcase": {
      const rows = await all<{ badge: string }>(ix.env, "SELECT badge FROM badges WHERE guild_id = ? AND discord_id = ? ORDER BY created_at DESC LIMIT 25", ix.guild.id, ix.userId);
      if (!rows.length) return "shop.no_badges";
      return rows.map((r) => ({ label: t(L, `badge.${r.badge}`).slice(0, 100), value: r.badge }));
    }
    case "pin": {
      const rows = await all<{ id: number; title: string; difficulty: string; kind: string }>(ix.env,
        `SELECT c.id, c.title, c.difficulty, c.kind FROM attempts a JOIN challenges c ON c.id = a.challenge_id
          WHERE a.guild_id = ? AND a.discord_id = ? AND a.status = 'solved' GROUP BY c.id
          ORDER BY CASE c.difficulty WHEN 'hard' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, MAX(a.finished_at) DESC LIMIT 25`, ix.guild.id, ix.userId);
      if (!rows.length) return "shop.no_solves";
      return rows.map((r) => ({ label: r.title.slice(0, 100), value: String(r.id), description: `${t(L, `diff.${r.difficulty}`)} · ${t(L, `kind.${r.kind}`)}`.slice(0, 100) }));
    }
  }
  return "shop.bad_choice";
}

/** Buy (from a modal, a picker or the menu). `inPlace` replaces the picker message with the shop. */
export function doBuy(ix: Ix, key: string, detail: string, inPlace = false) {
  const L = ix.L;
  later(ix, async () => {
    try {
      const r = await buy(ix.env, ix.guild, ix.userId, key, detail);
      if (r.item?.custom) {
        ix.ctx.waitUntil(notifyPurchase(ix.env, ix.guild, ix.userName, r.item.name ?? "", r.item.price).catch((e) => console.error("shop notify", e)));
        return shopView(ix, t(L, "shop.bought.custom", { name: r.item.name ?? "" }));
      }
      const shown = key === "contract" ? (() => { const c = CONTRACTS[detail.trim()]; return t(L, "shop.contract_goal", { n: c.target, level: t(L, `diff.${c.level}`) }); })()
        : cosmeticLabel(L, key, r.detail ?? "");
      return shopView(ix, t(L, `shop.bought.${r.key}`, { detail: shown, days: r.item?.days ?? 0, hours: r.item?.hours ?? 0, reward: r.item?.reward ?? 0, until: r.until ? `<t:${r.until}:R>` : "" }));
    } catch (e) {
      if (!(e instanceof ShopError)) throw e;
      return shopView(ix, "⚠️ " + t(L, e.message));
    }
  });
  return inPlace ? deferUpdate() : deferReply(true);
}

// ------------------------------------------------------------- peer help
export async function askButton(ix: Ix, attemptId: number) {
  const L = ix.L;
  later(ix, async () => {
    const a = await getAttempt(ix.env, attemptId);
    const c = a ? await getChallenge(ix.env, a.challenge_id) : null;
    if (!a || !c) return { content: t(L, "err.unknown") };
    try {
      const r = await askHelp(ix.env, ix.guild, ix.userId, a, c as ChallengeRow);
      return { content: t(L, "help.posted", { channel: `<#${r.channel}>` }) };
    } catch (e) {
      if (!(e instanceof HelpError)) throw e;
      return { content: t(L, e.message) };
    }
  });
  return deferReply(true);
}

export async function explainButton(ix: Ix, requestId: number) {
  const L = ix.L;
  const r = await one<{ discord_id: string; status: string }>(ix.env, "SELECT discord_id, status FROM help_requests WHERE id = ? AND guild_id = ?", requestId, ix.guild.id);
  if (!r || r.status !== "open") return say(t(L, "help.closed"));
  if (r.discord_id === ix.userId) return say(t(L, "help.self"));
  return json(modal(`mhelp:${requestId}`, t(L, "help.modal_title"), [{ id: "v", label: t(L, "help.modal_label"), long: true, max: 1500 }]));
}

export function explainSubmit(ix: Ix, requestId: number, body: string) {
  const L = ix.L;
  later(ix, async () => {
    try {
      await answerHelp(ix.env, ix.guild, ix.userId, requestId, body);
      return { content: t(L, "help.sent") };
    } catch (e) {
      if (!(e instanceof HelpError)) throw e;
      return { content: t(L, e.message) };
    }
  });
  return deferReply(true);
}

export function rateButton(ix: Ix, answerId: number, helpful: boolean) {
  const L = ix.L;
  later(ix, async () => {
    try {
      const r = await rateHelp(ix.env, ix.guild, ix.userId, answerId, helpful);
      return { content: t(L, helpful ? (r.rewarded ? "help.rated_yes" : "help.rated_yes_capped") : "help.rated_no"), components: [] };
    } catch (e) {
      if (!(e instanceof HelpError)) throw e;
      return { content: t(L, e.message), components: [] };
    }
  });
  return deferReply(true);
}
