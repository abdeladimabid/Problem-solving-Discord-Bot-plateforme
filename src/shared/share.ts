// 🔗 Public profile pages (a student chooses to share, can stop any time) and
// 🎓 end-of-season certificates (signed links, printable / save as PDF).
import type { Env, GuildRow } from "./types.ts";
import { all, now, one, playerStats, run, standings } from "./db.ts";
import { t } from "./i18n.ts";
import { dm, linkBtn, row } from "./discord.ts";
import { levelInfo, titleKey } from "./game.ts";
import { masteryFrom, skillName, SKILLS, studentAttempts } from "./skills.ts";
import { signText } from "./integrity.ts";
import { LANGS } from "./runner.ts";
import { FRAMES, THEMES, cosmeticLabel, cosmeticsOf } from "./shop.ts";

const base = (env: Env) => (env.PUBLIC_URL || "").replace(/\/$/, "");
const b64u = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

// ---------------------------------------------------------------- sharing
export async function shareProfile(env: Env, g: GuildRow, uid: string): Promise<string> {
  const p = await one<{ share_key: string | null }>(env, "SELECT share_key FROM players WHERE guild_id = ? AND discord_id = ?", g.id, uid);
  let key = p?.share_key;
  if (!key) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    key = [...bytes].map((b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
    await run(env, "UPDATE players SET share_key = ? WHERE guild_id = ? AND discord_id = ?", key, g.id, uid);
  }
  return profileUrl(env, key);
}
export const profileUrl = (env: Env, key: string) => `${base(env)}/u/${key}`;
export async function stopSharing(env: Env, g: GuildRow, uid: string) {
  await run(env, "UPDATE players SET share_key = NULL WHERE guild_id = ? AND discord_id = ?", g.id, uid);
}

// ----------------------------------------------------------- certificates
export async function certUrl(env: Env, guildId: string, uid: string, season: string): Promise<string> {
  const body = `${guildId}.${uid}.${b64u(season)}`;
  return `${base(env)}/cert/${body}.${await signText(env, "cert:" + body)}`;
}
export async function readCert(env: Env, token: string): Promise<{ guildId: string; uid: string; season: string } | null> {
  const m = token.match(/^([A-Za-z0-9]{1,30})\.([A-Za-z0-9]{1,30})\.([A-Za-z0-9_-]{1,120})\.([A-Za-z0-9_-]{32})$/);
  if (!m) return null;
  const want = await signText(env, `cert:${m[1]}.${m[2]}.${m[3]}`);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= want.charCodeAt(i) ^ m[4].charCodeAt(i);
  if (diff) return null;
  try { return { guildId: m[1], uid: m[2], season: unb64u(m[3]) }; } catch { return null; }
}

/** When a season ends: DM every student who scored their certificate. */
export async function sendCertificates(env: Env, g: GuildRow, season: string, limit = 60) {
  const rows = await standings(env, g.id, season, limit);
  let n = 0;
  for (const [i, r] of rows.entries()) {
    if (!r.discord_id || r.points <= 0) continue;
    const url = await certUrl(env, g.id, r.discord_id, season);
    const ok = await dm(env, r.discord_id, {
      content: t(g.lang, "cert.dm", { season, rank: i + 1, n: rows.length, pts: r.points }),
      components: [row(linkBtn(t(g.lang, "cert.open"), url, "🎓"))],
    }).catch(() => false);
    if (ok) n++;
  }
  return n;
}

// ------------------------------------------------------------------- data
const SOLVE_REASONS = ["practice", "daily", "assignment", "duel", "session", "plan", "path", "exam", "bounty", "boss", "interview", "project"];

export async function profileData(env: Env, g: GuildRow, uid: string) {
  const s = await playerStats(env, g, uid);
  if (!s.player) return null;
  const attempts = await studentAttempts(env, g.id, uid);
  const skills = masteryFrom(attempts).filter((x) => x.evidence >= 1).sort((a, b) => b.mastery - a.mastery).slice(0, 8)
    .map((x) => ({ name: skillName(x.key, g.lang), emoji: SKILLS.find((d) => d.key === x.key)?.emoji ?? "", mastery: x.mastery, status: x.status }));
  const langs = await all<{ lang: string; n: number }>(env,
    "SELECT lang, COUNT(*) AS n FROM attempts WHERE guild_id = ? AND discord_id = ? AND status = 'solved' AND lang IS NOT NULL GROUP BY lang ORDER BY n DESC", g.id, uid);
  const kinds = await all<{ kind: string; n: number }>(env,
    "SELECT c.kind, COUNT(*) AS n FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.guild_id = ? AND a.discord_id = ? AND a.status = 'solved' GROUP BY c.kind ORDER BY n DESC", g.id, uid);
  const recent = await all<{ title: string; difficulty: string; kind: string; finished_at: number }>(env,
    "SELECT c.title, c.difficulty, c.kind, a.finished_at FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.guild_id = ? AND a.discord_id = ? AND a.status = 'solved' ORDER BY a.finished_at DESC LIMIT 8", g.id, uid);
  const p: any = s.player;
  const lv = levelInfo(s.total);
  // what they bought in /shop
  const cos = cosmeticsOf(p);
  const show = (cos.showcase ?? "").split(",").filter((b) => s.badges.includes(b));
  const pin = cos.pin ? await one<{ title: string; difficulty: string; kind: string }>(env, "SELECT title, difficulty, kind FROM challenges WHERE id = ?", Number(cos.pin)) : null;
  return {
    L: g.lang, className: g.name ?? "", season: g.season,
    name: p.name ?? "?", title: p.title && p.title_until > now() ? p.title : null,
    level: lv.level, levelTitle: t(g.lang, titleKey(lv.level)), progress: lv.progress, total: s.total, next: lv.next,
    seasonPoints: s.seasonPoints, seasonRank: s.seasonRank, seasonSize: s.seasonSize,
    solved: s.solved, accuracy: s.accuracy, streak: p.daily_streak ?? 0, planBest: p.plan_best ?? 0,
    duels: s.duels, rating: p.rating ?? 1000, contests: s.contests,
    badges: [...show, ...s.badges.filter((b) => !show.includes(b))].map((b) => t(g.lang, `badge.${b}`)), showcased: show.length,
    look: {
      theme: cos.theme && THEMES[cos.theme] ? THEMES[cos.theme] : null, frame: cos.frame && FRAMES[cos.frame] ? FRAMES[cos.frame] : null,
      emoji: cos.emoji ?? null, motto: cos.motto ?? null, lang: cos.lang ? cosmeticLabel(g.lang, "lang", cos.lang) : null,
      pin: pin ? { title: pin.title, difficulty: pin.difficulty, kind: t(g.lang, `kind.${pin.kind}`) } : null,
    },
    skills, langs: langs.map((x) => ({ name: LANGS[x.lang as keyof typeof LANGS]?.label ?? x.lang, n: x.n })),
    kinds: kinds.map((x) => ({ name: t(g.lang, `kind.${x.kind}`), n: x.n })),
    recent: recent.map((r) => ({ ...r, kind: t(g.lang, `kind.${r.kind}`) })),
    hr: p.hr_verified ? p.hr_display : null,
  };
}

export async function certData(env: Env, guildId: string, uid: string, season: string) {
  const g = await one<GuildRow>(env, "SELECT * FROM guilds WHERE id = ?", guildId);
  if (!g) return null;
  const p = await one<{ name: string | null }>(env, "SELECT name FROM players WHERE guild_id = ? AND discord_id = ?", guildId, uid);
  if (!p) return null;
  const table = await standings(env, guildId, season, 1000);
  const idx = table.findIndex((r) => r.discord_id === uid);
  const counts = await one<{ solved: number; pts: number }>(env,
    `SELECT SUM(reason IN (${SOLVE_REASONS.map(() => "?").join(", ")}) AND amount > 0) AS solved, COALESCE(SUM(amount), 0) AS pts FROM ledger WHERE guild_id = ? AND discord_id = ? AND season = ?`,
    ...SOLVE_REASONS, guildId, uid, season);
  const badges = await all<{ badge: string }>(env, "SELECT badge FROM badges WHERE guild_id = ? AND discord_id = ? ORDER BY created_at", guildId, uid);
  const skills = masteryFrom(await studentAttempts(env, guildId, uid)).filter((x) => x.status === "strong").sort((a, b) => b.mastery - a.mastery).slice(0, 5)
    .map((x) => skillName(x.key, g.lang));
  return {
    L: g.lang, className: g.name ?? "", season, current: season === g.season, name: p.name ?? "?",
    rank: idx >= 0 ? idx + 1 : null, size: table.length, points: idx >= 0 ? table[idx].points : counts?.pts ?? 0,
    solved: counts?.solved ?? 0, badges: badges.map((b) => t(g.lang, `badge.${b.badge}`)), skills,
    issued: now(),
  };
}
