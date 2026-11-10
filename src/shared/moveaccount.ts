// 🔁 A student changes Discord account (hacked, lost, deleted): everything ClassBot knows about the old account moves to
// the new one — points, coins, attempts, briefs, assessments, mises en situation, squads, GitHub, VS Code, notes…
//
// Discord gives every account a number (a "snowflake", 17–20 digits) and ClassBot keeps a student's data under it, in
// columns (players.discord_id, duels.winner_id…) and inside texts (squads, "u:<id>", lists of members…). So the move
// replaces the old number by the new one in every text of the class: new tables are covered without changing this file.
// A snowflake is long and unique enough that it never appears by chance inside another value.
//
// It runs in 4 round trips to the database (batches), whatever the number of tables: fine on the free plan too.
import { one } from "./db.ts";
import type { Env } from "./types.ts";

export class MoveError extends Error {}

// tables without a guild_id: their rows belong to the class through a parent row
const VIA: Record<string, [string, string]> = {
  boss_hits: ["boss_id", "bosses"],
  bets: ["contest_id", "contests"],
  quiz_answers: ["quiz_id", "quizzes"],
  help_answers: ["request_id", "help_requests"],
  game_moves: ["game_id", "games"],
  game_players: ["game_id", "games"],
  attempt_logs: ["attempt_id", "attempts"],
};
// never touched: the app's own settings, caches, keys and the shared library
const SKIP = /^(sqlite_|_cf_|d1_)|^(app_settings|ai_usage|tr_cache|mcp_keys|mcp_log|gh_tokens|gh_apps|gh_manifest_states|library_items|library_teams|library_cache|library_outbox|league_remote|challenge_tests)$/;

const SNOWFLAKE = /^\d{15,21}$/;
const q = (x: string) => `"${x.replace(/"/g, '""')}"`;

export interface MoveReport { rows: number; tables: Record<string, number>; merged: boolean }

/** Moves the class data of the Discord account `from` to the account `to` (both Discord user ids). */
export async function moveAccount(env: Env, gid: string, from: string, to: string): Promise<MoveReport> {
  from = String(from || "").trim(); to = String(to || "").trim();
  if (!SNOWFLAKE.test(from) || !SNOWFLAKE.test(to)) throw new MoveError("Both accounts must be Discord user ids (17 to 20 digits).");
  if (from === to) throw new MoveError("The old and the new account are the same.");
  const old = await one<any>(env, "SELECT * FROM players WHERE guild_id = ? AND discord_id = ?", gid, from);
  if (!old) throw new MoveError("The old account has no data in this class.");
  const neu = await one<any>(env, "SELECT * FROM players WHERE guild_id = ? AND discord_id = ?", gid, to);

  // the new account's own little start (it played a bit before the move): added to the old one, then its row goes
  const pre: any[] = [];
  if (neu) {
    pre.push(env.DB.prepare(`UPDATE players SET coins = coins + ?, hint_tokens = COALESCE(hint_tokens, 0) + ?, streak_freezes = COALESCE(streak_freezes, 0) + ?,
      last_active = MAX(COALESCE(last_active, 0), ?), name = COALESCE(?, name) WHERE guild_id = ? AND discord_id = ?`)
      .bind(neu.coins || 0, neu.hint_tokens || 0, neu.streak_freezes || 0, neu.last_active || 0, neu.name || null, gid, from));
    pre.push(env.DB.prepare("DELETE FROM players WHERE guild_id = ? AND discord_id = ?").bind(gid, to));
  }

  // 1 · the tables and their columns
  const tables = ((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results as any[])
    .map((r) => String(r.name)).filter((n) => !SKIP.test(n));
  const infos = await env.DB.batch(tables.map((t) => env.DB.prepare(`PRAGMA table_info(${q(t)})`)));
  const plan: { t: string; where: string; args: unknown[]; cols: string[]; keys: string[] }[] = [];
  tables.forEach((t, i) => {
    const cols = (infos[i].results as any[]) || [];
    const names = cols.map((c) => String(c.name));
    let where: string, args: unknown[];
    if (t === "guilds") { where = "id = ?"; args = [gid]; }
    else if (names.includes("guild_id")) { where = "guild_id = ?"; args = [gid]; }
    else if (VIA[t] && names.includes(VIA[t][0])) { where = `${q(VIA[t][0])} IN (SELECT id FROM ${q(VIA[t][1])} WHERE guild_id = ?)`; args = [gid]; }
    else return;
    // only text columns can hold an account (guild_id itself never does)
    const textCols = cols.filter((c) => c.name !== "guild_id" && (!c.type || /CHAR|TEXT|CLOB/i.test(c.type))).map((c) => String(c.name));
    if (!textCols.length) return;
    plan.push({ t, where, args, cols: textCols, keys: cols.filter((c) => c.pk && textCols.includes(c.name)).map((c) => String(c.name)) });
  });

  // 2 · replace the old id by the new one, column by column (OR IGNORE: a row the new account already has, e.g. a
  //     badge it won twice, stays as it is — 3 · then the old account's copy of it goes)
  const ups: { t: string; s: any }[] = [];
  for (const p of plan) for (const c of p.cols) {
    ups.push({ t: p.t, s: env.DB.prepare(`UPDATE OR IGNORE ${q(p.t)} SET ${q(c)} = REPLACE(${q(c)}, ?, ?) WHERE ${p.where} AND typeof(${q(c)}) = 'text' AND instr(${q(c)}, ?) > 0`).bind(from, to, ...p.args, from) });
  }
  const res = await env.DB.batch([...pre, ...ups.map((u) => u.s)]);
  const out: MoveReport = { rows: 0, tables: {}, merged: !!neu };
  ups.forEach((u, i) => {
    const n = Number(res[pre.length + i]?.meta?.changes || 0);
    if (n) { out.tables[u.t] = (out.tables[u.t] || 0) + n; out.rows += n; }
  });
  const left = plan.filter((p) => p.keys.length);
  if (left.length) await env.DB.batch(left.map((p) => env.DB.prepare(`DELETE FROM ${q(p.t)} WHERE ${p.where} AND (${p.keys.map((k) => `${q(k)} = ?`).join(" OR ")})`).bind(...p.args, ...p.keys.map(() => from))));
  return out;
}
