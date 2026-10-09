// Automatic Discord roles: the bot creates them once and keeps them on the
// right students (season leader, top 3, best coder, duel master, level titles…).
// Champion and On Fire are handed out by contests.ts (syncRoles); here we only
// create them when the teacher hasn't picked roles of their own.
import type { Env, GuildRow } from "./types.ts";
import { all, now, run, standings } from "./db.ts";
import { levelInfo, titleKey } from "./game.ts";
import { t } from "./i18n.ts";
import { addRole, dapi, mention, pingUsers, removeRole, send } from "./discord.ts";
import { strictArena } from "./arena.ts";

export interface RoleDef { key: string; name: string; color: number; hoist?: boolean; level?: number; external?: "champion_role" | "streak_role"; desc: string }

// Created in this order: Discord puts each new role at the bottom, so the first ones end up highest
// (a member's name takes the color of their highest role).
export const ROLE_DEFS: RoleDef[] = [
  { key: "leader", name: "👑 Class Leader", color: 0xf1c40f, hoist: true, desc: "#1 of the season leaderboard" },
  { key: "top3", name: "🥈 Top 3", color: 0x9aa9bf, hoist: true, desc: "#2 and #3 of the season leaderboard" },
  { key: "champion", name: "🏆 Contest Champion", color: 0xe67e22, external: "champion_role", desc: "won the latest HackerRank contest" },
  { key: "coder", name: "💻 Code Machine", color: 0x2ecc71, desc: "most write-code and HackerRank problems solved in the last 30 days (at least 5)" },
  { key: "duelist", name: "⚔️ Duel Master", color: 0x9b59b6, desc: "best duel rating, with at least 3 duel wins" },
  { key: "streak", name: "🔥 On Fire", color: 0xe74c3c, external: "streak_role", desc: "5 daily challenges in a row, or 3 contests in a row" },
  { key: "legend", name: "🌟 Legend", color: 0xff7eb6, level: 16, desc: "level 16 and up" },
  { key: "wizard", name: "🔮 Wizard", color: 0xa78bfa, level: 12, desc: "levels 12 to 15" },
  { key: "hacker", name: "⚡ Hacker", color: 0x3b82f6, level: 8, desc: "levels 8 to 11" },
  { key: "coderlvl", name: "💡 Coder", color: 0x14b8a6, level: 5, desc: "levels 5 to 7" },
  { key: "apprentice", name: "🌱 Apprentice", color: 0x94a3b8, level: 3, desc: "levels 3 and 4" },
];
const LEVEL_KEY: Record<string, string> = { "title.legend": "legend", "title.wizard": "wizard", "title.hacker": "hacker", "title.coder": "coderlvl", "title.apprentice": "apprentice" };

export interface AutoRoles {
  on: boolean;
  off: string[];                         // roles the teacher turned off
  ids: Record<string, string>;           // role key → Discord role id
  holders: Record<string, string[]>;     // who has each role (what we gave)
  leader: string | null;                 // last announced leader
  error: string | null;
  synced: number;
}
export function autoRolesOf(g: { auto_roles?: string | null }): AutoRoles {
  let o: any = {};
  try { o = g.auto_roles ? JSON.parse(g.auto_roles) : {}; } catch { o = {}; }
  return { on: o.on !== false, off: Array.isArray(o.off) ? o.off : [], ids: o.ids ?? {}, holders: o.holders ?? {}, leader: o.leader ?? null, error: o.error ?? null, synced: o.synced ?? 0 };
}
const save = (env: Env, g: GuildRow, cfg: AutoRoles) => run(env, "UPDATE guilds SET auto_roles = ? WHERE id = ?", JSON.stringify(cfg), g.id);

/** Who should have each role right now. */
export async function wantedHolders(env: Env, g: GuildRow): Promise<Record<string, string[]>> {
  const w: Record<string, string[]> = {};
  const top = (await standings(env, g.id, g.season, 10)).filter((r) => r.discord_id);
  w.leader = top.slice(0, 1).map((r) => r.discord_id!);
  w.top3 = top.slice(1, 3).map((r) => r.discord_id!);
  const coder = await all<{ discord_id: string; n: number }>(env,
    `SELECT a.discord_id, COUNT(DISTINCT a.challenge_id) AS n FROM attempts a JOIN challenges c ON c.id = a.challenge_id
      WHERE a.guild_id = ? AND c.kind IN ('write', 'code') AND (a.status = 'solved' OR (a.status = 'claimed' AND a.verified = 1)) AND a.finished_at >= ?
      GROUP BY a.discord_id HAVING n >= 5 ORDER BY n DESC, MAX(a.finished_at) ASC LIMIT 1`, g.id, now() - 30 * 86400);
  w.coder = coder.map((r) => r.discord_id);
  const duel = await all<{ discord_id: string }>(env,
    `SELECT p.discord_id FROM players p WHERE p.guild_id = ?
        AND (SELECT COUNT(*) FROM duels d WHERE d.guild_id = p.guild_id AND d.winner_id = p.discord_id) >= 3
      ORDER BY p.rating DESC LIMIT 1`, g.id);
  w.duelist = duel.map((r) => r.discord_id);
  for (const d of ROLE_DEFS) if (d.level) w[d.key] = [];
  const totals = await all<{ discord_id: string; pts: number }>(env,
    "SELECT discord_id, SUM(amount) AS pts FROM ledger WHERE guild_id = ? AND discord_id IS NOT NULL GROUP BY discord_id", g.id);
  for (const r of totals) {
    const key = LEVEL_KEY[titleKey(levelInfo(r.pts).level)];
    if (key) w[key].push(r.discord_id);
  }
  return w;
}

/**
 * Create missing roles and move them to the right students. `budget` caps the
 * Discord calls (Cloudflare's free plan allows 50 per run); what's left is done next time.
 */
export async function syncAutoRoles(env: Env, g: GuildRow, o: { budget?: number; announce?: boolean } = {}): Promise<AutoRoles> {
  const cfg = autoRolesOf(g);
  if (!cfg.on) return cfg;
  let budget = o.budget ?? 12;
  const enabled = ROLE_DEFS.filter((d) => !cfg.off.includes(d.key));
  cfg.error = null;
  try {
    // 1. make sure each role exists
    const existing = new Set((await dapi<any[]>(env, "GET", `/guilds/${g.id}/roles`)).map((r) => String(r.id)));
    budget--;
    for (const d of enabled) {
      if (d.external) {
        const picked = g[d.external];
        if (picked && existing.has(picked)) { cfg.ids[d.key] = picked; continue; }
      }
      if (cfg.ids[d.key] && existing.has(cfg.ids[d.key])) continue;
      if (budget <= 0) break;
      const role = await dapi<any>(env, "POST", `/guilds/${g.id}/roles`, { name: d.name, color: d.color, hoist: !!d.hoist, mentionable: false, permissions: "0" });
      budget--;
      cfg.ids[d.key] = String(role.id);
      cfg.holders[d.key] = [];
      if (d.external) {
        await run(env, `UPDATE guilds SET ${d.external} = ? WHERE id = ?`, role.id, g.id);
        (g as any)[d.external] = String(role.id);
        if (d.external === "champion_role") await run(env, "UPDATE guilds SET champion_holders = '[]' WHERE id = ?", g.id);
        if (d.external === "streak_role") await run(env, "UPDATE guilds SET streak_holders = '[]' WHERE id = ?", g.id);
      }
    }
    // 2. give / take back (champion and On Fire are handled by the contest code)
    const wanted = await wantedHolders(env, g);
    for (const d of enabled) {
      if (d.external || !cfg.ids[d.key]) continue;
      const roleId = cfg.ids[d.key];
      const want = new Set(wanted[d.key] ?? []);
      const have = new Set(cfg.holders[d.key] ?? []);
      for (const u of [...have]) {
        if (want.has(u)) continue;
        if (budget <= 0) break;
        await removeRole(env, g.id, u, roleId).catch((e) => { if (e?.status === 403) throw e; });
        budget--;
        have.delete(u);
      }
      for (const u of want) {
        if (have.has(u)) continue;
        if (budget <= 0) break;
        await addRole(env, g.id, u, roleId).catch((e) => { if (e?.status === 403) throw e; });
        budget--;
        have.add(u);
      }
      cfg.holders[d.key] = [...have];
    }
    // 3. a new leader gets a shout-out in #arena
    const lead = wanted.leader?.[0] ?? null;
    if (lead && lead !== cfg.leader) {
      if (o.announce !== false) {
        const ch = await strictArena(env, g);
        if (ch) await send(env, ch, {
          content: t(g.lang, cfg.leader ? "roles.new_leader" : "roles.first_leader", { user: mention(lead), prev: cfg.leader ? mention(cfg.leader) : "" }),
          allowed_mentions: pingUsers([lead]),
        }).catch(() => {});
      }
      cfg.leader = lead;
    }
  } catch (e: any) {
    cfg.error = e?.status === 403 ? "permission" : String(e?.message ?? e).slice(0, 200);
  }
  cfg.synced = now();
  await save(env, g, cfg);
  return cfg;
}

/** Cron: one server per minute, each at most every 5 minutes. */
export async function syncDueRoles(env: Env) {
  const due = await all<GuildRow>(env,
    `SELECT * FROM guilds WHERE (auto_roles IS NULL OR json_extract(auto_roles, '$.on') IS NOT 0)
       AND COALESCE(json_extract(auto_roles, '$.synced'), 0) < ? ORDER BY COALESCE(json_extract(auto_roles, '$.synced'), 0) LIMIT 1`, now() - 300);
  for (const g of due) await syncAutoRoles(env, g);
}

/** Turn everything off and take our roles back off people (the roles themselves stay, the teacher can delete them). */
export async function setAutoRoles(env: Env, g: GuildRow, o: { on?: boolean; off?: string[] }) {
  const cfg = autoRolesOf(g);
  if (o.off) cfg.off = o.off.filter((k) => ROLE_DEFS.some((d) => d.key === k));
  if (o.on !== undefined) cfg.on = !!o.on;
  // roles turned off: take them back
  for (const d of ROLE_DEFS) {
    if (d.external || !(cfg.off.includes(d.key) || !cfg.on)) continue;
    const roleId = cfg.ids[d.key];
    for (const u of (cfg.holders[d.key] ?? []).slice(0, 20)) await removeRole(env, g.id, u, roleId).catch(() => {});
    cfg.holders[d.key] = [];
  }
  await save(env, g, cfg);
  return cfg;
}
