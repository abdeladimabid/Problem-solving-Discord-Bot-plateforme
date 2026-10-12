// The class's squads, by sprint, separate from the briefs: a brief (or a squad battle) loads them.
import type { Env, GuildRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { cleanSquads } from "./review/debrief.ts";
import type { Squad } from "./review/debrief.ts";

export class SquadError extends Error {}
export interface SquadSet { id: number; name: string; squads: Squad[]; active: boolean; created_at: number; updated_at: number }
const parse = (r: any): SquadSet => ({ id: r.id, name: r.name, squads: cleanSquads(r.squads), active: !!r.active, created_at: r.created_at, updated_at: r.updated_at });

export async function squadSets(env: Env, g: GuildRow): Promise<SquadSet[]> {
  return (await all(env, "SELECT * FROM squad_sets WHERE guild_id = ? ORDER BY active DESC, id DESC LIMIT 40", g.id)).map(parse);
}
export async function currentSquads(env: Env, g: GuildRow): Promise<SquadSet | null> {
  const r = await one(env, "SELECT * FROM squad_sets WHERE guild_id = ? ORDER BY active DESC, id DESC LIMIT 1", g.id);
  return r ? parse(r) : null;
}
async function validIds(env: Env, g: GuildRow) {
  return new Set((await all<{ id: string }>(env, "SELECT discord_id AS id FROM players WHERE guild_id = ?", g.id)).map((r) => r.id));
}
/** A new set of squads (it becomes the current one): empty, or a copy of another set. */
export async function createSquadSet(env: Env, g: GuildRow, b: { name?: string; squads?: unknown; copyFrom?: number }) {
  let squads: Squad[] = [];
  if (b.copyFrom) {
    const src = await one(env, "SELECT * FROM squad_sets WHERE id = ? AND guild_id = ?", Number(b.copyFrom), g.id);
    if (src) squads = parse(src).squads;
  } else if (b.squads) squads = cleanSquads(b.squads, await validIds(env, g));
  const t = now();
  const n = (await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM squad_sets WHERE guild_id = ?", g.id))?.n ?? 0;
  await run(env, "UPDATE squad_sets SET active = 0 WHERE guild_id = ?", g.id);
  const r = await one<{ id: number }>(env, "INSERT INTO squad_sets (guild_id, name, squads, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?) RETURNING id",
    g.id, String(b.name || "").trim().slice(0, 60) || `Squads ${n + 1}`, JSON.stringify(squads), t, t);
  return r!.id;
}
export async function updateSquadSet(env: Env, g: GuildRow, id: number, b: { name?: string; squads?: unknown; active?: boolean }) {
  const cur = await one(env, "SELECT * FROM squad_sets WHERE id = ? AND guild_id = ?", id, g.id);
  if (!cur) throw new SquadError("These squads don't exist anymore.");
  const squads = b.squads !== undefined ? cleanSquads(b.squads, await validIds(env, g)) : parse(cur).squads;
  if (b.active) await run(env, "UPDATE squad_sets SET active = 0 WHERE guild_id = ?", g.id);
  await run(env, "UPDATE squad_sets SET name = ?, squads = ?, active = ?, updated_at = ? WHERE id = ?",
    String(b.name ?? cur.name).trim().slice(0, 60) || cur.name, JSON.stringify(squads), b.active ? 1 : cur.active, now(), id);
  if (b.squads !== undefined) await useBuddies(env, g, squads);
}
export async function deleteSquadSet(env: Env, g: GuildRow, id: number) {
  await run(env, "DELETE FROM squad_sets WHERE id = ? AND guild_id = ?", id, g.id);
  // the newest one becomes the current squads
  await run(env, "UPDATE squad_sets SET active = 1 WHERE id = (SELECT id FROM squad_sets WHERE guild_id = ? ORDER BY id DESC LIMIT 1) AND NOT EXISTS (SELECT 1 FROM squad_sets WHERE guild_id = ? AND active = 1)", g.id, g.id);
}

/** 🤝 "Squad buddy" bought in the shop and not used yet: the buyer wants the mate in their squad. */
export async function pendingBuddies(env: Env, g: GuildRow) {
  const rows = await all<{ id: number; discord_id: string; detail: string | null; created_at: number }>(env,
    "SELECT id, discord_id, detail, created_at FROM purchases WHERE guild_id = ? AND item = 'buddy' AND status = 'pending' ORDER BY id", g.id);
  return rows.map((r) => ({ id: r.id, buyer: r.discord_id, mate: String(r.detail || "").split("|").pop() || "", at: r.created_at })).filter((x) => x.mate);
}
/** Requests met by these squads (buyer and mate together) are used. */
export async function useBuddies(env: Env, g: GuildRow, squads: Squad[]) {
  for (const b of await pendingBuddies(env, g)) {
    if (squads.some((s) => s.members.includes(b.buyer) && s.members.includes(b.mate))) await run(env, "UPDATE purchases SET status = 'given' WHERE id = ?", b.id);
  }
}
