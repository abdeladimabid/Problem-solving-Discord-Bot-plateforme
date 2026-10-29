// 👩‍🏫 The class's staff: never shown or counted as a student. A teacher gets a player row as soon as they use a Discord
// command (like everyone), so the lists of the dashboard leave them out: the class's teacher (guilds.teacher_id) and
// whoever used a command with the server's « Manage Server » or « Administrator » permission (noted here, once).
// Kept in app_settings (staff:<guild>), no migration.
import type { Env } from "./types.ts";
import { now, one, run } from "./db.ts";

const seen = new Set<string>();   // per isolate: a teacher is written once, not at every command
const parse = (v: string | null | undefined): string[] => { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };

/** The staff of a class (teacher_id and the teachers noted). */
export async function staffIds(env: Env, gid: string): Promise<Set<string>> {
  const r = await one<{ v: string | null; t: string | null }>(env, "SELECT (SELECT v FROM app_settings WHERE k = ?) AS v, (SELECT teacher_id FROM guilds WHERE id = ?) AS t", `staff:${gid}`, gid).catch(() => null);
  const s = new Set(parse(r?.v));
  if (r?.t) s.add(r.t);
  return s;
}
/** A command used with teacher permissions: this person is staff (written the first time only). */
export async function noteStaff(env: Env, gid: string, uid: string) {
  const k = `${gid}:${uid}`;
  if (seen.has(k)) return;
  const cur = parse((await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", `staff:${gid}`).catch(() => null))?.v);
  if (!cur.includes(uid)) await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at",
    `staff:${gid}`, JSON.stringify([...cur, uid].slice(-20)), now());
  seen.add(k);
}
/** The rows without the staff. */
export async function withoutStaff<T extends { discord_id: string }>(env: Env, gid: string, rows: T[]): Promise<T[]> {
  const s = await staffIds(env, gid);
  return s.size ? rows.filter((r) => !s.has(String(r.discord_id))) : rows;
}
