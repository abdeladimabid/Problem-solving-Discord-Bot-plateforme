// The class's squads, by sprint, separate from the briefs: a brief (or a squad battle) loads them.
import type { Env, GuildRow } from "./types.ts";
import { staffIds } from "./staff.ts";
import { all, now, one, run } from "./db.ts";
import { COLORS, dm } from "./discord.ts";
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
  const staff = await staffIds(env, g.id);
  return new Set((await all<{ id: string }>(env, "SELECT discord_id AS id FROM players WHERE guild_id = ?", g.id)).map((r) => r.id).filter((id) => !staff.has(id)));
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

// ------------------------------------------------------------------ 📨 telling the students
const sentKey = (id: number) => `squads_sent:${id}`;
/** When a set was last sent to the students by DM (null: never). */
export async function sentAt(env: Env, ids: number[]): Promise<Record<number, number>> {
  if (!ids.length) return {};
  const rows = await all<{ k: string; updated_at: number }>(env, `SELECT k, updated_at FROM app_settings WHERE k IN (${ids.map(() => "?").join(",")})`, ...ids.map(sentKey));
  return Object.fromEntries(rows.map((r) => [Number(r.k.split(":")[1]), r.updated_at]));
}
/** The DM a student gets: their squad, who is with them (and the scrum master), the teacher's note. */
export function squadDm(lang: string, setName: string, sq: Squad, me: string, names: Map<string, string>, note: string) {
  const fr = lang !== "en";
  const mates = sq.members.filter((m) => m !== me);
  const who = (id: string) => `<@${id}> (${names.get(id) || "?"})${id === sq.sm ? (fr ? " · 🎯 scrum master" : " · 🎯 scrum master") : ""}`;
  return {
    embeds: [{
      title: `🧩 ${setName} · ${sq.name}`,
      color: COLORS.purple,
      description: [
        fr ? `Voici ton squad pour **${setName}** : **${sq.name}**.` : `Here is your squad for **${setName}**: **${sq.name}**.`,
        "",
        mates.length ? (fr ? "**Tes coéquipiers :**" : "**Your teammates:**") : (fr ? "Tu es seul dans ce squad pour l'instant." : "You're alone in this squad for now."),
        ...mates.map((m) => `• ${who(m)}`),
        sq.sm === me ? (fr ? "\n🎯 **Tu es le scrum master** de ce squad." : "\n🎯 **You're the scrum master** of this squad.") : "",
        note ? `\n💬 ${note}` : "",
      ].filter((x) => x !== "").join("\n"),
    }],
    allowed_mentions: { parse: [] },
  };
}
/** Sends each student of a set their squad by DM. Returns who got it and who couldn't (DMs closed). */
/** `only`: one squad (its index), so a request stays small (each DM is 2 calls to Discord); the page sends them one after the other. */
export async function notifySquads(env: Env, g: GuildRow, id: number, note: unknown, only: number | null = null) {
  const cur = await one(env, "SELECT * FROM squad_sets WHERE id = ? AND guild_id = ?", id, g.id);
  if (!cur) throw new SquadError("These squads don't exist anymore.");
  const set = parse(cur);
  const squads = (only != null ? [set.squads[only]].filter(Boolean) : set.squads).filter((s) => s.members.length);
  if (!squads.length && only == null) throw new SquadError("These squads have nobody in them yet.");
  const n = String(note ?? "").trim().slice(0, 500);
  const names = new Map((await all<{ id: string; name: string | null }>(env, "SELECT discord_id AS id, name FROM players WHERE guild_id = ?", g.id)).map((r) => [r.id, r.name || r.id]));
  const sent: string[] = [], failed: string[] = [];
  for (const sq of squads) for (const m of sq.members) {
    if (m === g.teacher_id) continue;
    (await dm(env, m, squadDm(g.lang, set.name, sq, m, names, n)) ? sent : failed).push(m);
  }
  await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", sentKey(id), JSON.stringify({ sent: sent.length, failed }), now());
  return { sent: sent.length, failed: failed.map((m) => names.get(m) || m) };
}
