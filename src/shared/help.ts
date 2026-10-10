// Paid peer help: a stuck student asks the class; a classmate explains the mistake in words;
// if the student marks it helpful, the helper earns points and coins.
import type { AttemptRow, ChallengeRow, Env, GuildRow } from "./types.ts";
import { addPoints, all, now, one, run } from "./db.ts";
import { t } from "./i18n.ts";
import { COLORS, btn, codeBlock, dm, editMessage, mention, row, send, truncate } from "./discord.ts";
import { strictArena } from "./arena.ts";

export const HELP_POINTS = 8, HELP_COINS = 5, HELP_DAILY_REWARDS = 3, ASK_PER_DAY = 3;
export class HelpError extends Error {}
const BLOCKED_ORIGINS = ["exam", "session", "duel", "bounty", "boss"];

export async function askHelp(env: Env, g: GuildRow, uid: string, a: AttemptRow, c: ChallengeRow) {
  if (a.discord_id !== uid) throw new HelpError("err.not_yours");
  if (BLOCKED_ORIGINS.includes(a.origin)) throw new HelpError("help.not_here");
  if (!["write", "sql"].includes(c.kind) || !a.answer_given || !a.tries) throw new HelpError("help.need_try");
  if (a.status === "solved") throw new HelpError("help.already_solved");
  const day = now() - 86400;
  const n = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM help_requests WHERE guild_id = ? AND discord_id = ? AND created_at >= ?", g.id, uid, day);
  if ((n?.n ?? 0) >= ASK_PER_DAY) throw new HelpError("help.too_many");
  const dup = await one(env, "SELECT 1 FROM help_requests WHERE attempt_id = ? AND status = 'open'", a.id);
  if (dup) throw new HelpError("help.already_asked");
  const channel = await strictArena(env, g);
  if (!channel) throw new HelpError("duel.no_arena");
  let verdict = "";
  try { const r = JSON.parse(a.result || "null"); if (r) verdict = t(g.lang, `help.verdict.${r.verdict}`, { passed: r.passed, total: r.total }); } catch { verdict = ""; }
  const ins = await run(env, "INSERT INTO help_requests (guild_id, attempt_id, discord_id, channel_id, created_at) VALUES (?, ?, ?, ?, ?)", g.id, a.id, uid, channel, now());
  const id = Number(ins.meta.last_row_id);
  const msg = await send(env, channel, {
    embeds: [{
      title: t(g.lang, "help.title", { title: c.title }),
      description: truncate([t(g.lang, "help.desc", { user: mention(uid), verdict }), codeBlock(truncate(a.answer_given, 1500), a.lang === "cpp" ? "cpp" : a.lang ?? (c.kind === "sql" ? "sql" : "")), t(g.lang, "help.rules", { pts: HELP_POINTS, coins: HELP_COINS })].join("\n"), 4000),
      color: COLORS.ice,
    }],
    components: [row(btn(t(g.lang, "help.explain_btn"), `hlp:${id}`, 1, "💡"))],
  }) as any;
  await run(env, "UPDATE help_requests SET message_id = ? WHERE id = ?", msg?.id ?? null, id);
  return { id, channel };
}

/** Explanations must be words, not a pasted solution. */
export function looksLikeSolution(text: string) {
  const codeLines = text.split("\n").filter((l) => /[;{}:]\s*$|^\s*(def|function|for|foreach|while|if|elif|else|return|SELECT|print|echo|console\.log|import|const|let|var)\b|^\s*\$?\w+(\[[^\]]*\])?\s*[-+*/.]?=\s*\S/i.test(l)).length;
  return codeLines >= 4 || /```[\s\S]{200,}```/.test(text);
}

export async function answerHelp(env: Env, g: GuildRow, helperId: string, requestId: number, body: string) {
  const r = await one<{ id: number; discord_id: string; attempt_id: number; status: string }>(env, "SELECT * FROM help_requests WHERE id = ? AND guild_id = ?", requestId, g.id);
  if (!r || r.status !== "open") throw new HelpError("help.closed");
  if (r.discord_id === helperId) throw new HelpError("help.self");
  if (body.trim().length < 20) throw new HelpError("help.too_short");
  if (looksLikeSolution(body)) throw new HelpError("help.no_solutions");
  const ins = await run(env, "INSERT OR IGNORE INTO help_answers (request_id, helper_id, body, created_at) VALUES (?, ?, ?, ?)", requestId, helperId, body.trim().slice(0, 1500), now());
  if (!ins.meta.changes) throw new HelpError("help.already_answered");
  const aid = Number(ins.meta.last_row_id);
  const c = await one<{ title: string }>(env, "SELECT c.title FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.id = ?", r.attempt_id);
  await dm(env, r.discord_id, {
    content: t(g.lang, "help.dm", { helper: mention(helperId), title: c?.title ?? "?", body: body.trim().slice(0, 1500) }),
    components: [row(btn(t(g.lang, "help.rate_yes"), `hrate:${aid}:1`, 3, "👍"), btn(t(g.lang, "help.rate_no"), `hrate:${aid}:0`, 2, "👎"))],
  }).catch(() => {});
}

export async function rateHelp(env: Env, g: GuildRow, raterId: string, answerId: number, helpful: boolean) {
  const a = await one<{ id: number; helper_id: string; rating: number | null; request_id: number; discord_id: string; guild_id: string }>(env,
    "SELECT h.id, h.helper_id, h.rating, h.request_id, r.discord_id, r.guild_id FROM help_answers h JOIN help_requests r ON r.id = h.request_id WHERE h.id = ?", answerId);
  if (!a || a.guild_id !== g.id || a.discord_id !== raterId) throw new HelpError("err.not_yours");
  const upd = await run(env, "UPDATE help_answers SET rating = ? WHERE id = ? AND rating IS NULL", helpful ? 1 : 0, answerId);
  if (!upd.meta.changes) throw new HelpError("help.already_rated");
  if (!helpful) return { rewarded: false };
  const today = await one<{ n: number }>(env,
    "SELECT COUNT(*) AS n FROM ledger WHERE guild_id = ? AND discord_id = ? AND reason = 'review' AND created_at >= ?", g.id, a.helper_id, now() - 86400);
  const rewarded = (today?.n ?? 0) < HELP_DAILY_REWARDS;
  if (rewarded) {
    await addPoints(env, g, { discordId: a.helper_id, amount: HELP_POINTS, reason: "review", ref: a.request_id });
    await run(env, "UPDATE players SET coins = coins + ? WHERE guild_id = ? AND discord_id = ?", HELP_COINS, g.id, a.helper_id);
  }
  await run(env, "UPDATE help_requests SET status = 'closed' WHERE id = ?", a.request_id);
  const req = await one<{ channel_id: string | null; message_id: string | null }>(env, "SELECT channel_id, message_id FROM help_requests WHERE id = ?", a.request_id);
  if (req?.channel_id && req.message_id) await editMessage(env, req.channel_id, req.message_id, { components: [row(btn(t(g.lang, "help.solved_btn"), `hlp:${a.request_id}`, 2, "✅", true))] }).catch(() => {});
  await dm(env, a.helper_id, { content: t(g.lang, rewarded ? "help.thanks" : "help.thanks_capped", { user: mention(raterId), pts: HELP_POINTS, coins: HELP_COINS }) }).catch(() => {});
  return { rewarded };
}

export async function openRequests(env: Env, g: GuildRow) {
  return all(env, "SELECT * FROM help_requests WHERE guild_id = ? AND status = 'open' ORDER BY id DESC LIMIT 50", g.id);
}
