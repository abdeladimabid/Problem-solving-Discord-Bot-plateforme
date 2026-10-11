// Buttons and commands for events (quiz, boss, bounty), the coin shop and peer help.
import type { ChallengeRow } from "../shared/types.ts";
import { t } from "../shared/i18n.ts";
import { COLORS, btn, modal, row } from "../shared/discord.ts";
import { one } from "../shared/db.ts";
import { getAttempt, getChallenge, renderFor, startAttempt } from "../shared/challenges.ts";
import { quizAnswer } from "../shared/events.ts";
import type { BossRow, BountyRow } from "../shared/events.ts";
import { ShopError, buy, inventory, shopItems } from "../shared/shop.ts";
import { notifyPurchase } from "../shared/notify.ts";
import { HelpError, answerHelp, askHelp, rateHelp } from "../shared/help.ts";
import { type Ix, deferReply, json, later, say } from "./ix.ts";

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
async function shopView(ix: Ix, note = "") {
  const L = ix.L;
  const inv = await inventory(ix.env, ix.guild, ix.userId);
  const items = shopItems(ix.guild);
  const lines = items.map((it) => it.custom
    ? `${it.emoji} **${it.name}** · **${it.price}** 🪙${it.desc ? `\n${it.desc}` : ""}`
    : t(L, `shop.item.${it.key}`, { price: it.price, emoji: it.emoji, days: it.days ?? 0, max: it.max ?? 0 }));
  const owned = [
    t(L, "shop.owned", { coins: inv.coins, freezes: inv.freezes, hints: inv.hints }),
    inv.title ? t(L, "shop.owned_title", { title: inv.title, until: `<t:${inv.titleUntil}:R>` }) : "",
    inv.color ? t(L, "shop.owned_color", { until: `<t:${inv.colorUntil}:R>` }) : "",
  ].filter(Boolean).join("\n");
  const buttons = items.map((it) => btn((it.custom ? t(L, "shop.buy.custom", { name: it.name ?? "", price: it.price }) : t(L, `shop.buy.${it.key}`, { price: it.price })).slice(0, 78),
    `shop:${it.key}`, it.custom ? 2 : 1, it.emoji, inv.coins < it.price));
  const rows = [];
  for (let i = 0; i < buttons.length && rows.length < 5; i += 5) rows.push(row(...buttons.slice(i, i + 5)));
  return {
    content: note,
    embeds: [{ title: t(L, "shop.title"), description: ((lines.length ? lines.join("\n\n") : t(L, "shop.empty")) + "\n\n" + owned).slice(0, 4000), color: COLORS.gold, footer: { text: t(L, "shop.footer") } }],
    components: rows,
  };
}

export async function cmdShop(ix: Ix) {
  later(ix, () => shopView(ix));
  return deferReply(true);
}

export async function shopButton(ix: Ix, key: string) {
  const L = ix.L;
  if (key === "title") return json(modal("mshop:title", t(L, "shop.modal_title"), [{ id: "v", label: t(L, "shop.modal_title_label"), max: 24 }]));
  if (key === "color") return json(modal("mshop:color", t(L, "shop.modal_color"), [{ id: "v", label: t(L, "shop.modal_color_label"), max: 7, value: "#2563eb" }]));
  return doBuy(ix, key, "");
}

export function doBuy(ix: Ix, key: string, detail: string) {
  const L = ix.L;
  later(ix, async () => {
    try {
      const r = await buy(ix.env, ix.guild, ix.userId, key, detail);
      if (r.item?.custom) {
        ix.ctx.waitUntil(notifyPurchase(ix.env, ix.guild, ix.userName, r.item.name ?? "", r.item.price).catch((e) => console.error("shop notify", e)));
        return shopView(ix, t(L, "shop.bought.custom", { name: r.item.name ?? "" }));
      }
      return shopView(ix, t(L, `shop.bought.${r.key}`, { detail: r.detail ?? "" }));
    } catch (e) {
      if (!(e instanceof ShopError)) throw e;
      return shopView(ix, "⚠️ " + t(L, e.message));
    }
  });
  return deferReply(true);
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
