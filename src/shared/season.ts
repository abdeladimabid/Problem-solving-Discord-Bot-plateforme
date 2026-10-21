// Seasons: a new season starts now or at a time the teacher picks (the cron starts it, so nobody has to stay up until
// midnight). When a season ends, #arena gets the final leaderboard (the podium, then the rest of the top 10), the
// champion gets a badge for that season, and everyone gets their certificate.
import type { Env, GuildRow } from "./types.ts";
import { all, getGuild, now, one, run, standings } from "./db.ts";
import type { StandingRow } from "./db.ts";
import { mention, send } from "./discord.ts";
import { arenaChannel } from "./arena.ts";
import { sendCertificates } from "./share.ts";

export class SeasonError extends Error {}
export interface SeasonPlan { name: string; at: number; announce: boolean; certificates: boolean }

/** The badge of a season's champion: "champion:<season>". */
export const championBadge = (season: string) => `champion:${season}`;
const who = (r: StandingRow) => (r.discord_id ? mention(r.discord_id) : `**${r.name}**`);
const pts = (n: number, fr: boolean) => `${n.toLocaleString(fr ? "fr-FR" : "en-US")} pts`;
/** The end-of-season message: the podium, then the rest of the top 10, then the new season. */
export function seasonEndText(lang: string, old: string, next: string, top: StandingRow[]): string[] {
  const fr = lang === "fr";
  if (!top.length) return [fr ? `🎊 **${old}** est terminée. **${next}** commence : tout le monde repart de zéro !` : `🎊 **${old}** is over. **${next}** begins: everyone starts from zero!`];
  const [a, b, c] = top;
  const n = Math.min(3, top.length);
  const head = fr
    ? `🏆 **${old} — Classement final**\n\n${old} est officiellement terminée, et voici ${n === 3 ? "notre top 3" : n === 2 ? "nos deux premiers" : "notre champion"} ! \nBravo à ${n > 1 ? `nos ${n} leaders du classement` : "notre leader du classement"} pour être arrivé${n > 1 ? "s" : ""} tout en haut. 👏`
    : `🏆 **${old} — Final Leaderboard**\n\n${old} is officially over, and we have our ${n === 3 ? "top 3" : n === 2 ? "top 2" : "champion"}! \nBig congratulations to our ${n > 1 ? `${n === 3 ? "three" : "two"} leaderboard leaders` : "leaderboard leader"} for making it to the top. 👏`;
  const parts = [head];
  parts.push(fr
    ? `🥇 **1re place — Notre champion de ${old} !**\nUn grand bravo à notre numéro un ! ${who(a)} Félicitations pour avoir terminé **${old} en tête du classement** (${pts(a.points, fr)}) et décroché le titre de champion. Bien mérité !`
    : `🥇 **1st place — Our ${old} Champion!**\nA special shoutout to our number one! ${who(a)} Congratulations on finishing **${old} at the top of the leaderboard** (${pts(a.points, fr)}) and earning the title of champion. Well deserved!`);
  if (b) parts.push(fr
    ? `🥈 **2e place**\nBravo pour cette deuxième place ! ${who(b)} (${pts(b.points, fr)}) Tu étais parmi les meilleurs de cette saison, et ${next} sera peut-être ta chance de prendre la première place.`
    : `🥈 **2nd place**\nCongratulations on securing second place! ${who(b)} (${pts(b.points, fr)}) You were among the best this season, and hopefully, ${next} will be your chance to take that number one spot.`);
  if (c) parts.push(fr
    ? `🥉 **3e place**\nBravo pour ta place dans le top 3 ! ${who(c)} (${pts(c.points, fr)}) Continue à pousser, continue à progresser, et ne laisse pas les autres trop se reposer.`
    : `🥉 **3rd place**\nCongratulations on making the top 3! ${who(c)} (${pts(c.points, fr)}) Keep pushing, keep improving, and don't let the others get too comfortable.`);
  const rest = top.slice(3, 10);
  if (rest.length) parts.push((fr ? "📊 **La suite du top 10**\n" : "📊 **The rest of the top 10**\n") + rest.map((r, i) => `${i + 4}. ${who(r)} · ${pts(r.points, fr)}`).join("\n"));
  parts.push(fr
    ? `${n > 1 ? `Bravo à vous ${n === 3 ? "trois" : "deux"} !` : "Bravo !"} Et pour tous les autres, pas d'inquiétude : ce n'est que le début. ${next} apportera de nouveaux défis, et peut-être même quelques cadeaux et surprises pour les mieux classés.\n**Profitez de votre moment, champions. Le classement repart de zéro pour ${next}, et tout le monde a une nouvelle chance d'atteindre le sommet !**`
    : `${n > 1 ? `To all ${n === 3 ? "three" : "two"} of you, well done!` : "Well done!"} And for everyone else, don't worry, this is just the beginning. ${next} will bring new challenges, and maybe even some gifts and surprises for the top-ranked students.\n**Enjoy your moment, champions. The leaderboard resets for ${next}, and everyone gets another shot at the top!**`);
  // Discord: 2000 characters per message
  const out: string[] = [];
  let cur = "";
  for (const p of parts) { if (cur && (cur + "\n\n" + p).length > 1900) { out.push(cur); cur = p; } else cur = cur ? cur + "\n\n" + p : p; }
  if (cur) out.push(cur);
  return out;
}

/**
 * Start a new season now: the champion of the season that ends gets its badge, #arena gets the final leaderboard
 * (announce), the students their certificate (certificates). Any scheduled start is dropped.
 */
export async function startSeason(env: Env, g: GuildRow, name: string, o: { announce?: boolean; certificates?: boolean; wait?: (p: Promise<unknown>) => void } = {}) {
  const next = String(name ?? "").trim().slice(0, 60);
  if (!next) throw new SeasonError("Give the new season a name.");
  const old = g.season;
  const top = old && old !== next ? await standings(env, g.id, old, 10) : [];
  await run(env, "UPDATE guilds SET season = ? WHERE id = ?", next, g.id);
  await run(env, "DELETE FROM app_settings WHERE k = ?", planKey(g.id));
  if (top[0]?.discord_id) await run(env, "INSERT OR IGNORE INTO badges (guild_id, discord_id, badge, created_at) VALUES (?, ?, ?, ?)", g.id, top[0].discord_id, championBadge(old), now());
  const later: Promise<unknown>[] = [];
  if (o.announce !== false) later.push((async () => {
    const ch = await arenaChannel(env, g);
    if (!ch) return;
    for (const content of old && old !== next ? seasonEndText(g.lang, old, next, top) : [g.lang === "fr" ? `🎊 **${next}** commence ! Tout le monde repart de zéro.` : `🎊 **${next}** begins! Everyone starts from zero.`])
      await send(env, ch, { content, allowed_mentions: { parse: ["users"] } });
  })().catch((e) => console.error("season announce", e)));
  if (o.certificates !== false && old && old !== next) later.push(sendCertificates(env, g, old).catch((e) => console.error("certificates", e)));
  if (o.wait) for (const p of later) o.wait(p); else await Promise.all(later);
  return { old, season: next, champion: top[0] ?? null, top: top.slice(0, 3) };
}

// ------------------------------------------------------------------ the next season, at a set time
const planKey = (gid: string) => `season-next:${gid}`;
export async function seasonPlan(env: Env, gid: string): Promise<SeasonPlan | null> {
  const r = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", planKey(gid)).catch(() => null);
  if (!r) return null;
  try { const v = JSON.parse(r.v); return v && v.name && v.at ? v : null; } catch { return null; }
}
/** The next season starts by itself at `at` (unix seconds). */
export async function planSeason(env: Env, g: GuildRow, b: { name?: unknown; at?: unknown; announce?: unknown; certificates?: unknown }): Promise<SeasonPlan> {
  const name = String(b.name ?? "").trim().slice(0, 60);
  if (!name) throw new SeasonError("Give the new season a name.");
  if (name === g.season) throw new SeasonError("That's the current season's name.");
  const at = Math.floor(Number(b.at));
  if (!Number.isFinite(at) || at < now() + 30) throw new SeasonError("Pick a date and time in the future.");
  if (at > now() + 366 * 86400) throw new SeasonError("Pick a date within a year.");
  const plan: SeasonPlan = { name, at, announce: b.announce !== false, certificates: b.certificates !== false };
  await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", planKey(g.id), JSON.stringify(plan), now());
  return plan;
}
export async function cancelSeasonPlan(env: Env, gid: string) { await run(env, "DELETE FROM app_settings WHERE k = ?", planKey(gid)); }
/** Cron: the seasons whose time has come start. */
export async function seasonCron(env: Env, at = now()) {
  const rows = await all<{ k: string; v: string }>(env, "SELECT k, v FROM app_settings WHERE k LIKE 'season-next:%'").catch(() => []);
  let n = 0;
  for (const r of rows) {
    let p: SeasonPlan | null = null;
    try { p = JSON.parse(r.v); } catch { p = null; }
    if (!p || !p.at || p.at > at) continue;
    const gid = r.k.slice("season-next:".length);
    // claimed once: two cron runs never start it twice
    const claim = await run(env, "DELETE FROM app_settings WHERE k = ? AND v = ?", r.k, r.v);
    if (!claim.meta.changes) continue;
    const g = await getGuild(env, gid).catch(() => null);
    if (!g) continue;
    await startSeason(env, g, p.name, { announce: p.announce, certificates: p.certificates });
    n++;
  }
  return n;
}
