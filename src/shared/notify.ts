// Teacher notifications by Discord DM: a student raised a hand (/help-me) or asked a question (/ask).
// They go to the class's teacher (guilds.teacher_id): whoever ran /teacher setup or /teacher notify,
// or, when nobody is set yet, the first teacher who uses the bot.
import type { Env, GuildRow } from "./types.ts";
import { one, run } from "./db.ts";
import { t } from "./i18n.ts";
import { COLORS, DiscordError, codeBlock, dapi, send, truncate } from "./discord.ts";

export type NotifyKind = "hands" | "ask";
export interface NotifyCfg { hands: boolean; ask: boolean }

export function notifyCfg(g: Pick<GuildRow, "notify">): NotifyCfg {
  let v: Partial<NotifyCfg> = {};
  try { v = JSON.parse(g.notify || "{}") ?? {}; } catch { v = {}; }
  return { hands: v.hands !== false, ask: v.ask !== false };
}

export async function saveNotifyCfg(env: Env, g: GuildRow, b: Partial<NotifyCfg>) {
  const cfg = { ...notifyCfg(g), ...Object.fromEntries(Object.entries(b).filter(([k, v]) => (k === "hands" || k === "ask") && typeof v === "boolean")) };
  await run(env, "UPDATE guilds SET notify = ? WHERE id = ?", JSON.stringify(cfg), g.id);
  return cfg;
}

/** Remember who gets the DMs. `force` replaces the current teacher (/teacher notify). */
export async function setTeacher(env: Env, g: GuildRow, userId: string, force = false) {
  if (force) await run(env, "UPDATE guilds SET teacher_id = ? WHERE id = ?", userId, g.id);
  else await run(env, "UPDATE guilds SET teacher_id = ? WHERE id = ? AND teacher_id IS NULL", userId, g.id);
  if (force || !g.teacher_id) g.teacher_id = userId;
}

/** Link that opens a page of the dashboard on the right class (works through the sign-in page). */
export function dashLink(env: Env, g: GuildRow, open: string): string | null {
  if (!env.DASHBOARD_URL) return null;
  return `${env.DASHBOARD_URL.replace(/\/+$/, "")}/?g=${encodeURIComponent(g.id)}&open=${encodeURIComponent(open)}`;
}

export type DmResult = { ok: true } | { ok: false; reason: "no_teacher" | "off" | "closed" | "error"; detail?: string };

/** Send a DM and say why it failed (DMs closed, unknown user…). */
export async function dmChecked(env: Env, userId: string, payload: Record<string, unknown>): Promise<DmResult> {
  try {
    const ch = await dapi<{ id: string }>(env, "POST", "/users/@me/channels", { recipient_id: userId });
    await send(env, ch.id, payload);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 50007: "Cannot send messages to this user" (DMs from server members turned off, or no shared server)
    if (e instanceof DiscordError && (e.status === 403 || /50007/.test(msg))) return { ok: false, reason: "closed", detail: msg };
    return { ok: false, reason: "error", detail: msg };
  }
}

async function toTeacher(env: Env, g: GuildRow, kind: NotifyKind | null, payload: Record<string, unknown>): Promise<DmResult> {
  if (!g.teacher_id) return { ok: false, reason: "no_teacher" };
  if (kind && !notifyCfg(g)[kind]) return { ok: false, reason: "off" };
  const r = await dmChecked(env, g.teacher_id, payload);
  if (!r.ok) console.warn("teacher DM failed", g.id, (r as any).reason, (r as any).detail ?? "");
  return r;
}

const linkRow = (label: string, url: string | null, emoji: string) =>
  url ? [{ type: 1, components: [{ type: 2, style: 5, label, url, emoji: { name: emoji } }] }] : [];
const quote = (s: string, n: number) => `> ${truncate(s, n).split("\n").join("\n> ")}`;

/** ✋ A student raised a hand. */
export async function notifyHand(env: Env, g: GuildRow, id: number): Promise<DmResult> {
  const h = await one<{ name: string | null; question: string; code: string | null; title: string | null; created_at: number }>(env,
    `SELECT h.name, h.question, h.code, h.created_at, c.title FROM hands h LEFT JOIN attempts a ON a.id = h.attempt_id
       LEFT JOIN challenges c ON c.id = a.challenge_id WHERE h.id = ? AND h.guild_id = ?`, id, g.id);
  if (!h) return { ok: false, reason: "error", detail: "unknown hand" };
  const L = g.lang;
  const waiting = (await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM hands WHERE guild_id = ? AND status = 'waiting'", g.id))?.n ?? 1;
  const lines = [
    quote(h.question, 900),
    h.code ? codeBlock(truncate(h.code, 700)) : "",
    h.title ? t(L, "hand.notify_working", { title: h.title }) : "",
    t(L, "hand.notify_queue", { n: waiting }),
  ].filter(Boolean);
  return toTeacher(env, g, "hands", {
    embeds: [{ title: t(L, "hand.notify_title", { name: h.name || "?", server: g.name ?? "" }), description: truncate(lines.join("\n"), 4000), color: COLORS.gold, timestamp: new Date(h.created_at * 1000).toISOString() }],
    components: linkRow(t(L, "hand.notify_open"), dashLink(env, g, `hands/${id}`), "✍️"),
  });
}

/** ❓ A student asked a new question with /ask (not one already in the FAQ). */
export async function notifyQuestion(env: Env, g: GuildRow, id: number, studentName: string): Promise<DmResult> {
  const f = await one<{ question: string; created_at: number }>(env, "SELECT question, created_at FROM faq WHERE id = ? AND guild_id = ?", id, g.id);
  if (!f) return { ok: false, reason: "error", detail: "unknown question" };
  const L = g.lang;
  const pending = (await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM faq WHERE guild_id = ? AND status = 'pending'", g.id))?.n ?? 1;
  return toTeacher(env, g, "ask", {
    embeds: [{ title: t(L, "ask.notify_title", { name: studentName || "?", server: g.name ?? "" }), description: truncate([quote(f.question, 1500), t(L, "ask.notify_pending", { n: pending })].join("\n"), 4000), color: COLORS.blue, timestamp: new Date(f.created_at * 1000).toISOString() }],
    components: linkRow(t(L, "hand.notify_open"), dashLink(env, g, `questions/${id}`), "✍️"),
  });
}

/** Test DM from the dashboard or /teacher notify. */
export function notifyTest(env: Env, g: GuildRow): Promise<DmResult> {
  const L = g.lang;
  return toTeacher(env, g, null, {
    embeds: [{ title: t(L, "notify.test_title"), description: t(L, "notify.test_body", { server: g.name ?? "" }), color: COLORS.green }],
    components: linkRow(t(L, "notify.open_dashboard"), dashLink(env, g, "hands"), "🧭"),
  });
}
