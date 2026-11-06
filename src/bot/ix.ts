// Shared helpers for interaction handlers (responses, deferred work, options).
import type { Ctx, Env, GuildRow, Lang } from "../shared/types.ts";
import { t } from "../shared/i18n.ts";
import { all, one } from "../shared/db.ts";
import { EPHEMERAL, NO_PINGS, editOriginal, followup } from "../shared/discord.ts";

// ------------------------------------------------------------ responses
export const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
export const reply = (data: Record<string, unknown>, ephemeral = false) =>
  json({ type: 4, data: { allowed_mentions: NO_PINGS, ...data, ...(ephemeral ? { flags: EPHEMERAL } : {}) } });
export const say = (content: string, ephemeral = true) => reply({ content }, ephemeral);
export const update = (data: Record<string, unknown>) => json({ type: 7, data: { allowed_mentions: NO_PINGS, ...data } });
export const deferReply = (ephemeral: boolean) => json({ type: 5, data: ephemeral ? { flags: EPHEMERAL } : {} });
export const deferUpdate = () => json({ type: 6 });

export interface Ix {
  raw: any;
  env: Env;
  ctx: Ctx;
  guild: GuildRow;
  L: Lang;
  userId: string;
  userName: string;
  teacher: boolean;
}

export function options(raw: any): { sub: string | null; o: Record<string, any> } {
  let opts: any[] = raw.data?.options ?? [];
  let sub: string | null = null;
  if (opts[0]?.type === 1) {
    sub = opts[0].name;
    opts = opts[0].options ?? [];
  }
  return { sub, o: Object.fromEntries(opts.map((x: any) => [x.name, x.value])) };
}

export function memberName(raw: any, id: string): string {
  const m = raw.data?.resolved?.members?.[id], u = raw.data?.resolved?.users?.[id];
  return m?.nick ?? u?.global_name ?? u?.username ?? "?";
}

// Discord refuses a message whose embeds have more than 6000 characters in all, or more than 10 embeds
const EMBED_TOTAL = 5800, EMBEDS_MAX = 10;
const embedLen = (e: any) => String(e?.title ?? "").length + String(e?.description ?? "").length + String(e?.footer?.text ?? "").length
  + (Array.isArray(e?.fields) ? e.fields.reduce((n: number, f: any) => n + String(f?.name ?? "").length + String(f?.value ?? "").length, 0) : 0);
/**
 * A payload too big for one message (long embeds: a subject, a list): the first message holds what fits, the rest follows
 * in more messages (private, like the answer). Each embed is kept within Discord's own limits.
 */
export function splitPayload(payload: Record<string, unknown>): Record<string, unknown>[] {
  const embeds = Array.isArray(payload.embeds) ? (payload.embeds as any[]) : null;
  if (!embeds || !embeds.length) return [payload];
  const fixed = embeds.map((e) => ({ ...e, ...(e.title ? { title: String(e.title).slice(0, 256) } : {}), ...(e.description ? { description: String(e.description).slice(0, 4096) } : {}) }));
  const groups: any[][] = [[]];
  let size = String(payload.content ?? "").length;
  for (const e of fixed) {
    const n = embedLen(e), cur = groups[groups.length - 1];
    if (cur.length && (size + n > EMBED_TOTAL || cur.length >= EMBEDS_MAX)) { groups.push([e]); size = n; }
    else { cur.push(e); size += n; }
  }
  // the buttons stay with the first message
  return groups.map((g, i) => (i ? { embeds: g } : { ...payload, embeds: g }));
}
/** Run slow work after answering Discord (deferred), reporting errors to the user. */
export function later(ix: Ix, work: () => Promise<Record<string, unknown> | null>) {
  ix.ctx.waitUntil(
    work()
      .then(async (payload) => {
        if (!payload) return null;
        const [first, ...rest] = splitPayload(payload);
        await editOriginal(ix.env, ix.raw.token, first);
        for (const p of rest) await followup(ix.env, ix.raw.token, { ...p, flags: EPHEMERAL });
        return null;
      })
      .catch(async (e) => {
        console.error(e);
        await editOriginal(ix.env, ix.raw.token, { content: errorText(ix.L, e), embeds: [], components: [] }).catch(() => {});
      }),
  );
}

/** What the student sees when something breaks: a clear hint when the database wasn't updated, else a short reason. */
export function errorText(L: string, e: unknown): string {
  const msg = String((e as Error)?.message ?? e ?? "");
  if (/no such (table|column)|has no column named/i.test(msg)) return t(L, "err.db_update");
  // never the interaction's webhook path (its token) in what the student sees
  const reason = msg.replace(/D1_ERROR:\s*/g, "").replace(/\/webhooks\/\S+/g, "").replace(/\b(PATCH|POST|GET|PUT|DELETE)\s*$/i, "").replace(/\s+/g, " ").trim().slice(0, 150);
  return t(L, "err.generic") + (reason ? `\n-# ${reason}` : "");
}

/** Which server a button pressed in a DM belongs to. */
export async function guildFromButton(env: Env, customId: string, userId: string): Promise<string | null> {
  const [kind, x, y] = customId.split(":");
  // a DM about one class (💤 idle: « need help? »): the class is in the id, if they're in it
  if (["idle", "mhand", "mask"].includes(kind)) {
    const gid = kind === "idle" ? y : x;
    if (gid && /^[\w-]{1,40}$/.test(gid) && (await one(env, "SELECT 1 AS x FROM players WHERE guild_id = ? AND discord_id = ?", gid, userId))) return gid;
  }
  const id = Number(x);
  const noId = ["plan", "path", "today", "report", "skills", "sk", "help", "shop", "shopm", "shopmc", "shopsel", "share", "cert", "ivnew", "hand", "faqok", "faqask", "vsc"].includes(kind);
  if (kind === "hrate") {
    const r = await one<{ guild_id: string }>(env, "SELECT r.guild_id FROM help_answers h JOIN help_requests r ON r.id = h.request_id WHERE h.id = ? AND r.discord_id = ?", id, userId);
    return r?.guild_id ?? null;
  }
  const byTable: Record<string, string> = { qz: "quizzes", boss: "bosses", bty: "bounties", hlp: "help_requests" };
  if (byTable[kind] && id > 0) return (await one<{ guild_id: string }>(env, `SELECT guild_id FROM ${byTable[kind]} WHERE id = ?`, id))?.guild_id ?? null;
  const table = noId ? null : ["astart", "abatch"].includes(kind) ? "assignments"
    : ["dacc", "ddec", "dopen"].includes(kind) ? "duels"
    : ["sopen", "sgo"].includes(kind) ? "sessions"
    : Number.isFinite(id) && id > 0 ? "attempts" : null;
  if (table && id > 0) {
    const owner = table === "attempts" || table === "assignments" ? " AND discord_id = ?" : "";
    const r = await one<{ guild_id: string }>(env, `SELECT guild_id FROM ${table} WHERE id = ?${owner}`, id, ...(owner ? [userId] : []));
    if (r) return r.guild_id;
  }
  // otherwise: the only server where this student plays
  const gs = await all<{ guild_id: string }>(env, "SELECT guild_id FROM players WHERE discord_id = ? LIMIT 2", userId);
  return gs.length === 1 ? gs[0].guild_id : null;
}
