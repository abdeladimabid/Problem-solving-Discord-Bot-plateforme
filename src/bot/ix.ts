// Shared helpers for interaction handlers (responses, deferred work, options).
import type { Ctx, Env, GuildRow, Lang } from "../shared/types.ts";
import { t } from "../shared/i18n.ts";
import { all, one } from "../shared/db.ts";
import { EPHEMERAL, NO_PINGS, editOriginal } from "../shared/discord.ts";

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

/** Run slow work after answering Discord (deferred), reporting errors to the user. */
export function later(ix: Ix, work: () => Promise<Record<string, unknown> | null>) {
  ix.ctx.waitUntil(
    work()
      .then((payload) => (payload ? editOriginal(ix.env, ix.raw.token, payload) : null))
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
  const reason = msg.replace(/D1_ERROR:\s*/g, "").replace(/\s+/g, " ").trim().slice(0, 150);
  return t(L, "err.generic") + (reason ? `\n-# ${reason}` : "");
}

/** Which server a button pressed in a DM belongs to. */
export async function guildFromButton(env: Env, customId: string, userId: string): Promise<string | null> {
  const [kind, x] = customId.split(":");
  const id = Number(x);
  const noId = ["plan", "path", "today", "report", "skills", "sk", "help", "shop", "share", "cert", "ivnew", "hand", "faqok", "faqask"].includes(kind);
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
