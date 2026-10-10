// ✋ Raise-hand queue (/help-me): students ask the teacher for help during class.
// The dashboard shows a live queue; "I'm coming" and written replies reach the student by DM.
import type { Env, GuildRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { t } from "./i18n.ts";
import { COLORS, codeBlock, dm, truncate } from "./discord.ts";

export interface HandRow {
  id: number; guild_id: string; discord_id: string; name: string | null; question: string; code: string | null; attempt_id: number | null;
  status: "waiting" | "helping" | "done" | "cancelled"; reply: string | null; created_at: number; taken_at: number | null; done_at: number | null;
}
export class HandError extends Error {}
const OPEN = "('waiting', 'helping')";

/** Raise a hand. Returns the student's place in the queue (1 = next). */
export async function raiseHand(env: Env, g: GuildRow, uid: string, name: string, question: string, code: string | null) {
  question = question.trim().slice(0, 1000);
  if (question.length < 3) throw new HandError("hand.too_short");
  const open = await one<HandRow>(env, `SELECT * FROM hands WHERE guild_id = ? AND discord_id = ? AND status IN ${OPEN}`, g.id, uid);
  if (open) throw new HandError("hand.already");
  // the challenge they were last working on helps the teacher see the context
  const last = await one<{ id: number }>(env, "SELECT id FROM attempts WHERE guild_id = ? AND discord_id = ? AND started_at > ? ORDER BY id DESC LIMIT 1", g.id, uid, now() - 3 * 3600);
  const r = await run(env, "INSERT INTO hands (guild_id, discord_id, name, question, code, attempt_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    g.id, uid, name, question, code?.trim() ? code.trim().slice(0, 6000) : null, last?.id ?? null, now());
  return { id: Number(r.meta.last_row_id), position: await position(env, g.id, Number(r.meta.last_row_id)) };
}

/** Place in the queue, counting only students still waiting (1 = next). */
export async function position(env: Env, guildId: string, handId: number): Promise<number> {
  const r = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM hands WHERE guild_id = ? AND status = 'waiting' AND id <= ?", guildId, handId);
  return r?.n ?? 0;
}

export async function myHand(env: Env, g: GuildRow, uid: string) {
  const h = await one<HandRow>(env, `SELECT * FROM hands WHERE guild_id = ? AND discord_id = ? AND status IN ${OPEN} ORDER BY id DESC LIMIT 1`, g.id, uid);
  return h ? { ...h, position: h.status === "waiting" ? await position(env, g.id, h.id) : 0 } : null;
}

export async function cancelHand(env: Env, g: GuildRow, uid: string, id: number) {
  const r = await run(env, `UPDATE hands SET status = 'cancelled', done_at = ? WHERE id = ? AND guild_id = ? AND discord_id = ? AND status IN ${OPEN}`, now(), id, g.id, uid);
  return !!r.meta.changes;
}

/** Live queue for the dashboard: open hands first (oldest first), then today's finished ones. */
export async function handQueue(env: Env, g: GuildRow) {
  const open = await all<HandRow & { title: string | null; kind: string | null; challenge_id: number | null }>(env,
    `SELECT h.*, c.title, c.kind, c.id AS challenge_id FROM hands h LEFT JOIN attempts a ON a.id = h.attempt_id LEFT JOIN challenges c ON c.id = a.challenge_id
      WHERE h.guild_id = ? AND h.status IN ${OPEN} ORDER BY h.status = 'helping' DESC, h.id`, g.id);
  const done = await all<HandRow>(env,
    "SELECT * FROM hands WHERE guild_id = ? AND status IN ('done', 'cancelled') AND done_at > ? ORDER BY done_at DESC LIMIT 30", g.id, now() - 86400);
  const waits = done.filter((h) => h.status === "done" && h.taken_at).map((h) => h.taken_at! - h.created_at);
  return {
    open, done,
    stats: { waiting: open.filter((h) => h.status === "waiting").length, helped: waits.length, avgWait: waits.length ? Math.round(waits.reduce((s, x) => s + x, 0) / waits.length) : null },
  };
}

/** Teacher actions from the dashboard: take ("I'm coming"), reply in writing, done, or put back. */
export async function updateHand(env: Env, g: GuildRow, id: number, action: "take" | "reply" | "done" | "requeue", reply = "") {
  const h = await one<HandRow>(env, "SELECT * FROM hands WHERE id = ? AND guild_id = ?", id, g.id);
  if (!h) throw new HandError("unknown");
  const L = g.lang;
  if (action === "take") {
    await run(env, "UPDATE hands SET status = 'helping', taken_at = COALESCE(taken_at, ?) WHERE id = ?", now(), id);
    await dm(env, h.discord_id, { content: t(L, "hand.coming") }).catch(() => false);
  } else if (action === "reply") {
    const text = reply.trim().slice(0, 1800);
    if (!text) throw new HandError("empty reply");
    await run(env, "UPDATE hands SET status = 'done', reply = ?, taken_at = COALESCE(taken_at, ?), done_at = ? WHERE id = ?", text, now(), now(), id);
    await dm(env, h.discord_id, {
      embeds: [{ title: t(L, "hand.reply_title"), description: truncate(`> ${h.question.split("\n").join("\n> ")}\n\n${text}`, 4000), color: COLORS.blue }],
    }).catch(() => false);
  } else if (action === "done") {
    await run(env, "UPDATE hands SET status = 'done', taken_at = COALESCE(taken_at, ?), done_at = ? WHERE id = ?", now(), now(), id);
  } else {
    await run(env, "UPDATE hands SET status = 'waiting', done_at = NULL WHERE id = ?", id);
  }
  return one<HandRow>(env, "SELECT * FROM hands WHERE id = ?", id);
}

/** What the student sees after raising a hand. */
export function handText(L: string, h: { question: string; code: string | null }, place: number) {
  return [t(L, place <= 1 ? "hand.next" : "hand.queued", { n: place }), `> ${truncate(h.question, 300).split("\n").join("\n> ")}`, h.code ? codeBlock(truncate(h.code, 600)) : ""].filter(Boolean).join("\n");
}
