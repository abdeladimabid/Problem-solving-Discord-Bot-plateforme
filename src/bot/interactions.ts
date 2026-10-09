// Discord interactions: slash commands, buttons, select menus, forms and autocomplete.
// Anything that touches the database more than a couple of times is DEFERRED
// (Discord gets an answer within 3 seconds, the real work continues after).
import type { AttemptRow, ChallengeRow, Ctx, Difficulty, DuelRow, Env, GuildRow, Lang } from "../shared/types.ts";
import { all, confirmHackerRank, findPlayer, getGuild, getPlayer, linkHackerRank, now, one, playerStats, run, standings } from "../shared/db.ts";
import { t } from "../shared/i18n.ts";
import { RULES, SCORE_KINDS, basePoints, dayKey, levelInfo, progressBar, scoringOf, titleKey } from "../shared/game.ts";
import { COLORS, EPHEMERAL, MEDALS, NO_PINGS, btn, editOriginal, linkBtn, mention, modal, pingUsers, row, send, ts } from "../shared/discord.ts";
import {
  answer, feedbackFor, finish, getAttempt, getChallenge, pickChallenge, renderFor, startAttempt, submitCode, verifyCoding,
  codeLangFor, guildLangs, starterFor, startExplain, answerExplain, explainState, EXPLAIN_SECONDS,
} from "../shared/challenges.ts";
import type { Mode } from "../shared/challenges.ts";
import { activeContests, hrNames, isFrozen, standingsEmbed, stopContest, trackContest, trackingEmbed } from "../shared/contests.ts";
import { HackerRankError, fetchLeaderboard, profileText, recentSolves } from "../shared/hackerrank.ts";
import { LANGS, isCodeLang } from "../shared/runner.ts";
import { editorToken, editorUrl, integrityOf } from "../shared/integrity.ts";
import { enqueue } from "../shared/queue.ts";
import { arenaChannel } from "../shared/arena.ts";

// ------------------------------------------------------------ responses
const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
const reply = (data: Record<string, unknown>, ephemeral = false) =>
  json({ type: 4, data: { allowed_mentions: NO_PINGS, ...data, ...(ephemeral ? { flags: EPHEMERAL } : {}) } });
const say = (content: string, ephemeral = true) => reply({ content }, ephemeral);
const update = (data: Record<string, unknown>) => json({ type: 7, data: { allowed_mentions: NO_PINGS, ...data } });
const deferReply = (ephemeral: boolean) => json({ type: 5, data: ephemeral ? { flags: EPHEMERAL } : {} });
const deferUpdate = () => json({ type: 6 });

interface Ix {
  raw: any;
  env: Env;
  ctx: Ctx;
  guild: GuildRow;
  L: Lang;
  userId: string;
  userName: string;
  teacher: boolean;
}

function options(raw: any): { sub: string | null; o: Record<string, any> } {
  let opts: any[] = raw.data?.options ?? [];
  let sub: string | null = null;
  if (opts[0]?.type === 1) {
    sub = opts[0].name;
    opts = opts[0].options ?? [];
  }
  return { sub, o: Object.fromEntries(opts.map((x: any) => [x.name, x.value])) };
}

function memberName(raw: any, id: string): string {
  const m = raw.data?.resolved?.members?.[id], u = raw.data?.resolved?.users?.[id];
  return m?.nick ?? u?.global_name ?? u?.username ?? "?";
}

/** Run slow work after answering Discord (deferred), reporting errors to the user. */
function later(ix: Ix, work: () => Promise<Record<string, unknown> | null>) {
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

// ============================================================ entrypoint
export async function handleInteraction(raw: any, env: Env, ctx: Ctx): Promise<Response> {
  if (raw.type === 1) return json({ type: 1 }); // PING
  if (!raw.guild_id) return say(t("en", "err.guild_only"));
  const guild = await getGuild(env, raw.guild_id);
  const user = raw.member?.user ?? raw.user;
  const perms = BigInt(raw.member?.permissions ?? "0");
  const ix: Ix = {
    raw, env, ctx, guild, L: guild.lang,
    userId: user.id,
    userName: raw.member?.nick ?? user.global_name ?? user.username,
    teacher: (perms & 0x20n) !== 0n || (perms & 0x8n) !== 0n,
  };
  try {
    if (raw.type === 4) return await autocomplete(ix);
    await getPlayer(env, guild.id, ix.userId, ix.userName);
    if (raw.type === 2) return await command(ix);
    if (raw.type === 3) return await component(ix);
    if (raw.type === 5) return await modalSubmit(ix);
  } catch (e) {
    console.error("interaction failed", e);
    return say(errorText(ix.L, e));
  }
  return say(t(ix.L, "err.generic"));
}

// ============================================================== commands
async function command(ix: Ix): Promise<Response> {
  const { sub, o } = options(ix.raw);
  switch (ix.raw.data.name) {
    case "link": return cmdLink(ix, String(o.username));
    case "practice": return cmdPractice(ix, o.difficulty, o.type ?? "quick", o.topic ?? null, o.language ?? null);
    case "duel": return cmdDuel(ix, o.opponent, o.mode ?? "quick", o.difficulty ?? "easy", o.stake ?? 0);
    case "daily": return cmdDaily(ix);
    case "assignments": return cmdAssignments(ix);
    case "profile": return cmdProfile(ix, o.member ?? ix.userId);
    case "leaderboard": return cmdLeaderboard(ix, o.board ?? "season");
    case "rival": return cmdRival(ix, sub!, o.member ?? null);
    case "bet": return sub === "place" ? cmdBet(ix, String(o.player), Number(o.amount)) : cmdCoins(ix);
    case "contest": return sub === "list" ? cmdContestList(ix) : cmdStandings(ix, o.contest ?? null);
    case "help": return reply(helpPage(ix, o.topic ?? "start"), true);
    case "teacher":
      if (!ix.teacher) return say(t(ix.L, "err.teacher_only"));
      return cmdTeacher(ix, sub!, o);
  }
  return say(t(ix.L, "err.unknown"));
}

// ------------------------------------------------------------------ link
function linkMessage(L: string, hr: string, code: string) {
  return {
    content: t(L, "link.verify", { hr, code }),
    components: [row(
      linkBtn(t(L, "link.open_profile"), `https://www.hackerrank.com/profile/${encodeURIComponent(hr)}`, "🔗"),
      btn(t(L, "link.verify_btn"), "hrv:0", 3, "✅"),
    )],
  };
}

async function cmdLink(ix: Ix, username: string) {
  const hr = username.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?hackerrank\.com\/(profile\/)?/i, "").replace(/\/.*$/, "");
  if (!/^[A-Za-z0-9_.-]{1,40}$/.test(hr)) return say("❌ " + hr);
  const r = await linkHackerRank(ix.env, ix.guild.id, ix.userId, hr);
  if (r.status === "taken") return say(t(ix.L, "link.taken", { hr }));
  if (!r.code) return say(t(ix.L, "link.already_verified", { hr }));
  return reply(linkMessage(ix.L, hr, r.code), true);
}

async function verifyLink(ix: Ix) {
  const L = ix.L;
  const p = await findPlayer(ix.env, ix.guild.id, ix.userId);
  if (!p?.hr_username) return say(t(L, "err.not_linked_self"));
  if (p.hr_verified) return say(t(L, "link.already_verified", { hr: p.hr_display ?? p.hr_username }));
  later(ix, async () => {
    let text: string;
    try {
      text = await profileText(p.hr_username!);
    } catch (e) {
      if (e instanceof HackerRankError) return { content: t(L, "link.unreachable"), components: [] };
      throw e;
    }
    if (p.hr_code && text.toUpperCase().includes(p.hr_code.toUpperCase())) {
      await confirmHackerRank(ix.env, ix.guild.id, ix.userId);
      return { content: t(L, "link.verified", { user: mention(ix.userId), hr: p.hr_display ?? p.hr_username! }), components: [] };
    }
    return { ...linkMessage(L, p.hr_display ?? p.hr_username!, p.hr_code ?? "?"), content: t(L, "link.not_found", { code: p.hr_code ?? "?" }) + "\n\n" + t(L, "link.verify", { hr: p.hr_display ?? p.hr_username!, code: p.hr_code ?? "?" }) };
  });
  return deferReply(true);
}

// -------------------------------------------------------------- practice
async function cmdPractice(ix: Ix, difficulty: Difficulty, type: string, topic: string | null, language: string | null) {
  const L = ix.L;
  const mode: Mode = type === "coding" ? "coding" : type === "write" ? "write" : "quick";
  if (isCodeLang(language)) await run(ix.env, "UPDATE players SET code_lang = ? WHERE guild_id = ? AND discord_id = ?", language, ix.guild.id, ix.userId);
  const p = await findPlayer(ix.env, ix.guild.id, ix.userId);
  // quick challenges: the language asked for, else the student's language if the class learns it, else every class language
  const classLangs = guildLangs(ix.guild);
  const quickLangs = isCodeLang(language) ? [language] : p?.code_lang && classLangs.includes(p.code_lang) ? [p.code_lang] : classLangs;
  if (mode === "coding" && !p?.hr_username) return say(t(L, "err.not_linked_self"));
  if (mode === "coding" && !p?.hr_verified) return reply(linkMessage(L, p!.hr_display ?? p!.hr_username!, p!.hr_code ?? "?"), true);
  const kind = mode === "quick" && type !== "quick" ? type : null;

  later(ix, async () => {
    let c: ChallengeRow | null = null;
    if (mode === "coding") {
      let exclude = new Set<string>();
      try { exclude = new Set((await recentSolves(p!.hr_username!)).keys()); } catch { /* HackerRank unreachable: don't exclude */ }
      c = await pickChallenge(ix.env, ix.guild, { players: [ix.userId], difficulty, mode, exclude });
      if (!c) return { content: t(L, "ch.none_left", { difficulty: t(L, `diff.${difficulty}`) }) };
    } else if (!topic) {
      c = await pickChallenge(ix.env, ix.guild, { players: [ix.userId], difficulty, mode, kind, langs: quickLangs });
    }
    if (!c) {
      // a topic, or the bank is exhausted: the AI writes a new one in the background
      const job = await enqueue(ix.env, ix.guild, { discordId: ix.userId, kind: mode === "write" ? "write" : kind ?? "quick", difficulty, topic, token: ix.raw.token, codeLang: quickLangs[Math.floor(Math.random() * quickLangs.length)] });
      if (!job) return { content: t(L, "ch.queue_busy") };
      return { content: t(L, mode === "write" ? "ch.generating_write" : "ch.generating", { topic: topic ?? t(L, `diff.${difficulty}`) }) };
    }
    const a = await startAttempt(ix.env, ix.guild, ix.userId, c, "practice");
    return renderFor(ix.env, ix.guild, c, a);
  });
  return deferReply(true);
}

// ----------------------------------------------------------------- duels
async function cmdDuel(ix: Ix, opponent: string, mode: Mode, difficulty: Difficulty, stake: number) {
  const L = ix.L;
  if (opponent === ix.userId) return say(t(L, "duel.self"));
  if (ix.raw.data.resolved?.users?.[opponent]?.bot) return say(t(L, "duel.bot"));
  const oppName = memberName(ix.raw, opponent);
  const me = await getPlayer(ix.env, ix.guild.id, ix.userId);
  const them = await getPlayer(ix.env, ix.guild.id, opponent, oppName);
  if (mode === "coding" && (!me.hr_verified || !them.hr_verified)) return say(t(L, "duel.need_link"));
  if (stake > me.coins) return say(t(L, "duel.coins", { name: ix.userName, n: me.coins }));
  if (stake > them.coins) return say(t(L, "duel.coins", { name: oppName, n: them.coins }));
  for (const [id, nm] of [[ix.userId, ix.userName], [opponent, oppName]]) {
    const busy = await one(ix.env, "SELECT id FROM duels WHERE guild_id = ? AND status IN ('pending', 'starting', 'active') AND (challenger_id = ? OR opponent_id = ?)", ix.guild.id, id, id);
    if (busy) return say(t(L, "duel.busy", { name: nm }));
  }
  const arena = await arenaChannel(ix.env, ix.guild);
  const channel = arena ?? ix.raw.channel_id;
  const r = await run(ix.env, "INSERT INTO duels (guild_id, channel_id, challenger_id, opponent_id, mode, difficulty, stake, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ix.guild.id, channel, ix.userId, opponent, mode, difficulty, stake, now());
  const id = Number(r.meta.last_row_id);
  const invite = {
    content: t(L, "duel.invite", {
      a: mention(ix.userId), b: mention(opponent), mode: t(L, `duel.mode.${mode}`), difficulty: t(L, `diff.${difficulty}`),
      stake: stake ? t(L, "duel.stake", { n: stake }) : "",
    }),
    components: [row(btn(t(L, "duel.accept"), `dacc:${id}`, 3, "⚔️"), btn(t(L, "duel.decline"), `ddec:${id}`, 4))],
    allowed_mentions: pingUsers([opponent]),
  };
  if (arena && arena !== ix.raw.channel_id) {
    try {
      await send(ix.env, arena, invite);
      return say(t(L, "duel.posted", { channel: `<#${arena}>` }));
    } catch {
      await run(ix.env, "UPDATE duels SET channel_id = ? WHERE id = ?", ix.raw.channel_id, id);
    }
  }
  return reply(invite);
}

async function duelAccept(ix: Ix, id: number) {
  const L = ix.L;
  const d = await one<DuelRow>(ix.env, "SELECT * FROM duels WHERE id = ? AND guild_id = ?", id, ix.guild.id);
  if (!d || d.status !== "pending") return say(t(L, "duel.over"));
  if (d.opponent_id !== ix.userId) return say(t(L, "duel.only_opponent", { b: mention(d.opponent_id) }));
  if (now() - d.created_at > RULES.duelInviteSeconds) {
    await run(ix.env, "UPDATE duels SET status = 'expired' WHERE id = ?", id);
    return update({ content: t(L, "duel.expired", { a: mention(d.challenger_id), b: mention(d.opponent_id) }), components: [] });
  }
  const claimed = await run(ix.env, "UPDATE duels SET status = 'starting' WHERE id = ? AND status = 'pending'", id);
  if (!claimed.meta.changes) return say(t(L, "duel.over"));
  later(ix, async () => {
    const mode = (d.mode as string) as Mode;
    const players = [d.challenger_id, d.opponent_id];
    const c = (await pickChallenge(ix.env, ix.guild, { players, difficulty: d.difficulty, mode }))
      ?? (await pickChallenge(ix.env, ix.guild, { players, difficulty: d.difficulty, mode, allowSeen: true }));
    if (!c) {
      await run(ix.env, "UPDATE duels SET status = 'expired' WHERE id = ?", id);
      return { content: t(L, "duel.no_challenge"), components: [] };
    }
    if (d.stake) {
      const a = await run(ix.env, "UPDATE players SET coins = coins - ? WHERE guild_id = ? AND discord_id = ? AND coins >= ?", d.stake, ix.guild.id, d.challenger_id, d.stake);
      const b = await run(ix.env, "UPDATE players SET coins = coins - ? WHERE guild_id = ? AND discord_id = ? AND coins >= ?", d.stake, ix.guild.id, d.opponent_id, d.stake);
      if (!a.meta.changes || !b.meta.changes) {
        if (a.meta.changes) await run(ix.env, "UPDATE players SET coins = coins + ? WHERE guild_id = ? AND discord_id = ?", d.stake, ix.guild.id, d.challenger_id);
        if (b.meta.changes) await run(ix.env, "UPDATE players SET coins = coins + ? WHERE guild_id = ? AND discord_id = ?", d.stake, ix.guild.id, d.opponent_id);
        await run(ix.env, "UPDATE duels SET status = 'expired' WHERE id = ?", id);
        return { content: t(L, "duel.coins", { name: "?", n: d.stake }), components: [] };
      }
    }
    await run(ix.env, "UPDATE duels SET status = 'active', challenge_id = ?, started_at = ? WHERE id = ?", c.id, now(), id);
    return {
      content: t(L, "duel.started", {
        a: mention(d.challenger_id), b: mention(d.opponent_id), difficulty: t(L, `diff.${d.difficulty}`), mode: t(L, `duel.mode.${d.mode}`),
        stake: d.stake ? t(L, "duel.stake", { n: d.stake * 2 }) : "", minutes: Math.round((RULES.duelSeconds[d.mode] ?? 600) / 60),
      }),
      components: [row(btn(t(L, "duel.open"), `dopen:${id}`, 1, "🎯"))],
      allowed_mentions: pingUsers([d.challenger_id, d.opponent_id]),
    };
  });
  return deferUpdate();
}

async function duelDecline(ix: Ix, id: number) {
  const L = ix.L;
  const d = await one<DuelRow>(ix.env, "SELECT * FROM duels WHERE id = ? AND guild_id = ?", id, ix.guild.id);
  if (!d || d.status !== "pending") return say(t(L, "duel.over"));
  if (d.opponent_id !== ix.userId && d.challenger_id !== ix.userId) return say(t(L, "duel.only_opponent", { b: mention(d.opponent_id) }));
  await run(ix.env, "UPDATE duels SET status = 'declined' WHERE id = ?", id);
  return update({ content: t(L, "duel.declined", { b: mention(ix.userId) }), components: [] });
}

async function duelOpen(ix: Ix, id: number) {
  const L = ix.L;
  const d = await one<DuelRow>(ix.env, "SELECT * FROM duels WHERE id = ? AND guild_id = ?", id, ix.guild.id);
  if (!d) return say(t(L, "err.unknown"));
  if (d.challenger_id !== ix.userId && d.opponent_id !== ix.userId) return say(t(L, "duel.not_participant"));
  if (d.status !== "active" || !d.challenge_id) return say(t(L, "duel.over"));
  later(ix, async () => {
    const c = await getChallenge(ix.env, d.challenge_id!);
    if (!c) return { content: t(L, "err.unknown") };
    const a = await startAttempt(ix.env, ix.guild, ix.userId, c, "duel", id);
    if (a.status !== "pending") return { content: t(L, "res.already") };
    // the clock starts when the duel starts, not when you open it
    if (d.started_at && a.started_at > d.started_at) await run(ix.env, "UPDATE attempts SET started_at = ? WHERE id = ?", d.started_at, a.id);
    return renderFor(ix.env, ix.guild, c, { ...a, started_at: d.started_at ?? a.started_at });
  });
  return deferReply(true);
}

// ---------------------------------------------------------------- daily
async function cmdDaily(ix: Ix) {
  const day = dayKey(now());
  const d = await one<{ challenge_id: number }>(ix.env, "SELECT challenge_id FROM daily WHERE guild_id = ? AND day = ?", ix.guild.id, day);
  if (!d) return say(t(ix.L, "daily.none"));
  return openDaily(ix, d.challenge_id, day);
}

async function openDaily(ix: Ix, challengeId: number, day: string) {
  if (day !== dayKey(now())) return say(t(ix.L, "daily.expired"));
  later(ix, async () => {
    const c = await getChallenge(ix.env, challengeId);
    if (!c) return { content: t(ix.L, "err.unknown") };
    const a = await startAttempt(ix.env, ix.guild, ix.userId, c, "daily", Number(day.replace(/-/g, "")));
    if (a.status !== "pending") return { content: t(ix.L, "res.already") };
    return renderFor(ix.env, ix.guild, c, a);
  });
  return deferReply(true);
}

// ----------------------------------------------------------- assignments
async function cmdAssignments(ix: Ix) {
  const L = ix.L;
  const rows = await all<{ id: number; title: string; difficulty: string; due_at: number | null; note: string | null }>(ix.env,
    `SELECT s.id, c.title, c.difficulty, s.due_at, s.note FROM assignments s JOIN challenges c ON c.id = s.challenge_id
      WHERE s.guild_id = ? AND s.discord_id = ? AND s.status = 'open' ORDER BY COALESCE(s.due_at, 9e15), s.id LIMIT 20`, ix.guild.id, ix.userId);
  if (!rows.length) return say(t(L, "asg.none"));
  const lines = rows.map((r, i) => `**${i + 1}.** ${r.title} · ${t(L, `diff.${r.difficulty}`)}${r.due_at ? t(L, "asg.due", { when: ts(r.due_at) }) : ""}${r.note ? `\n   📝 ${r.note}` : ""}`);
  const buttons = rows.map((r, i) => btn(`${i + 1}. ${r.title}`.slice(0, 80), `astart:${r.id}`, 1));
  const rows5: unknown[] = [];
  for (let i = 0; i < buttons.length && rows5.length < 5; i += 5) rows5.push(row(...buttons.slice(i, i + 5)));
  return reply({ embeds: [{ title: t(L, "asg.title"), description: lines.join("\n"), color: COLORS.blue }], components: rows5 }, true);
}

async function assignmentOpen(ix: Ix, s: any) {
  const L = ix.L;
  if (!s || s.discord_id !== ix.userId) return say(t(L, "asg.not_for_you"));
  if (s.status !== "open") return say(t(L, "asg.closed"));
  later(ix, async () => {
    const c = await getChallenge(ix.env, s.challenge_id);
    if (!c) return { content: t(L, "err.unknown") };
    const a = await startAttempt(ix.env, ix.guild, ix.userId, c, "assignment", s.id);
    if (a.status !== "pending") return { content: t(L, "res.already") };
    await run(ix.env, "UPDATE assignments SET attempt_id = ? WHERE id = ?", a.id, s.id);
    return renderFor(ix.env, ix.guild, c, a, { notice: s.note ? `📝 ${s.note}` : undefined });
  });
  return deferReply(true);
}

// --------------------------------------------------------------- profile
async function cmdProfile(ix: Ix, memberId: string) {
  const L = ix.L;
  const name = memberId === ix.userId ? ix.userName : memberName(ix.raw, memberId);
  if (memberId !== ix.userId) await getPlayer(ix.env, ix.guild.id, memberId, name);
  const s = await playerStats(ix.env, ix.guild, memberId);
  const lv = levelInfo(s.total);
  const rivals = await all<{ rival_id: string }>(ix.env, "SELECT rival_id FROM rivals WHERE guild_id = ? AND owner_id = ?", ix.guild.id, memberId);
  const fields = [
    { name: `📅 ${ix.guild.season}`, value: t(L, "prof.season_val", { pts: s.seasonPoints, rank: s.seasonRank ? t(L, "prof.rank", { rank: s.seasonRank, n: s.seasonSize }) : t(L, "prof.unranked") }), inline: true },
    { name: t(L, "prof.total"), value: t(L, "prof.total_val", { pts: s.total }), inline: true },
    { name: t(L, "prof.coins"), value: String(s.player?.coins ?? RULES.startCoins), inline: true },
    { name: t(L, "prof.solved"), value: t(L, "prof.solved_val", { e: s.solved.easy, m: s.solved.medium, h: s.solved.hard }), inline: true },
    { name: t(L, "prof.accuracy"), value: s.accuracy == null ? "—" : `${s.accuracy}%`, inline: true },
    { name: t(L, "prof.streak"), value: t(L, "prof.streak_val", { n: s.player?.daily_streak ?? 0 }), inline: true },
    { name: t(L, "prof.duels"), value: t(L, "prof.duels_val", { ...s.duels, r: s.player?.rating ?? 1000 }), inline: true },
    { name: t(L, "prof.contests"), value: t(L, "prof.contests_val", { p: s.contests.played, w: s.contests.wins, pod: s.contests.podiums }), inline: true },
    { name: t(L, "prof.badges"), value: s.badges.length ? s.badges.map((b) => t(L, `badge.${b}`)).join(" · ") : t(L, "prof.no_badges"), inline: false },
  ];
  if (rivals.length) fields.push({ name: t(L, "prof.rivals"), value: rivals.map((r) => mention(r.rival_id)).join(" "), inline: false });
  const hr = s.player?.hr_display ? t(L, s.player.hr_verified ? "prof.hr" : "prof.hr_unverified", { hr: s.player.hr_display }) : t(L, "prof.no_hr");
  return reply({
    embeds: [{
      title: `🪪 ${name}`,
      description: `**${t(L, "prof.level", { level: lv.level, title: t(L, titleKey(lv.level)) })}**\n${progressBar(lv.progress, 14)} ${s.total}/${lv.next}\n${hr}`,
      color: COLORS.blue,
      fields,
    }],
  });
}

async function cmdLeaderboard(ix: Ix, board: string) {
  const L = ix.L, g = ix.guild;
  let title = "", lines: string[] = [];
  const medal = (i: number) => MEDALS[i + 1] ?? `\`${i + 1}.\``;
  const who = (r: { discord_id: string | null; name: string }) => (r.discord_id ? mention(r.discord_id) : `**${r.name}**`);
  if (board === "season" || board === "level") {
    const rows = await standings(ix.env, g.id, board === "season" ? g.season : null, 15);
    title = board === "season" ? t(L, "lb.season", { season: g.season }) : t(L, "lb.level");
    lines = rows.map((r, i) => `${medal(i)} ${who(r)} · **${r.points}** pts${board === "level" ? ` · ${t(L, "res.level")} ${levelInfo(r.points).level}` : ""}`);
  } else if (board === "duels") {
    const rows = await all<{ discord_id: string; rating: number; w: number }>(ix.env,
      `SELECT p.discord_id, p.rating, (SELECT COUNT(*) FROM duels d WHERE d.guild_id = p.guild_id AND d.winner_id = p.discord_id) AS w
         FROM players p WHERE p.guild_id = ? AND EXISTS (SELECT 1 FROM duels d WHERE d.guild_id = p.guild_id AND d.status = 'finished' AND (d.challenger_id = p.discord_id OR d.opponent_id = p.discord_id))
        ORDER BY p.rating DESC LIMIT 15`, g.id);
    title = t(L, "lb.duels");
    lines = rows.map((r, i) => `${medal(i)} ${mention(r.discord_id)} · **${r.rating}** · ${r.w}W`);
  } else if (board === "coins") {
    const rows = await all<{ discord_id: string; coins: number }>(ix.env, "SELECT discord_id, coins FROM players WHERE guild_id = ? ORDER BY coins DESC LIMIT 15", g.id);
    title = t(L, "lb.coins");
    lines = rows.map((r, i) => `${medal(i)} ${mention(r.discord_id)} · ${r.coins} 🪙`);
  } else {
    const rows = await all<{ name: string; pts: number }>(ix.env,
      `SELECT t.name, COALESCE(SUM(tp.points), 0) AS pts FROM teams t LEFT JOIN team_points tp ON tp.team_id = t.id AND tp.season = ?
        WHERE t.guild_id = ? GROUP BY t.id ORDER BY pts DESC`, g.season, g.id);
    title = t(L, "lb.teams", { season: g.season });
    lines = rows.map((r, i) => `${medal(i)} **${r.name}** · ${r.pts} pts`);
  }
  return reply({ embeds: [{ title, description: lines.join("\n") || t(L, "lb.empty"), color: COLORS.gold, footer: { text: t(L, "lb.footer") } }] });
}

async function cmdRival(ix: Ix, sub: string, member: string | null) {
  const L = ix.L, g = ix.guild;
  if (sub === "list") {
    const owner = member ?? ix.userId;
    const rivals = await all<{ rival_id: string }>(ix.env, "SELECT rival_id FROM rivals WHERE guild_id = ? AND owner_id = ?", g.id, owner);
    if (!rivals.length) return say(t(L, "rival.none"));
    const lines: string[] = [];
    for (const r of rivals) {
      const c = await one<{ w: number; l: number }>(ix.env,
        `SELECT SUM(a.rank < b.rank) AS w, SUM(a.rank > b.rank) AS l FROM contest_results a
           JOIN contest_results b ON b.contest_id = a.contest_id AND b.discord_id = ?
          WHERE a.discord_id = ? AND a.guild_id = ?`, r.rival_id, owner, g.id);
      const d = await one<{ w: number; l: number }>(ix.env,
        `SELECT SUM(winner_id = ?) AS w, SUM(winner_id = ?) AS l FROM duels WHERE guild_id = ? AND status = 'finished'
           AND ((challenger_id = ? AND opponent_id = ?) OR (challenger_id = ? AND opponent_id = ?))`,
        owner, r.rival_id, g.id, owner, r.rival_id, r.rival_id, owner);
      const w = (c?.w ?? 0) + (d?.w ?? 0), l = (c?.l ?? 0) + (d?.l ?? 0);
      lines.push(t(L, "rival.line", { mood: w > l ? "😎" : l > w ? "😤" : "🤝", b: mention(r.rival_id), cw: c?.w ?? 0, cl: c?.l ?? 0, dw: d?.w ?? 0, dl: d?.l ?? 0 }));
    }
    const name = owner === ix.userId ? ix.userName : memberName(ix.raw, owner);
    return reply({ embeds: [{ title: t(L, "rival.list_title", { name }), description: lines.join("\n"), color: COLORS.blue }] });
  }
  if (!member || member === ix.userId || ix.raw.data.resolved?.users?.[member]?.bot) return say(t(L, "rival.self"));
  if (sub === "add") {
    const n = await one<{ n: number }>(ix.env, "SELECT COUNT(*) AS n FROM rivals WHERE guild_id = ? AND owner_id = ?", g.id, ix.userId);
    if ((n?.n ?? 0) >= 5) return say(t(L, "rival.max"));
    await getPlayer(ix.env, g.id, member, memberName(ix.raw, member));
    const r = await run(ix.env, "INSERT OR IGNORE INTO rivals (guild_id, owner_id, rival_id) VALUES (?, ?, ?)", g.id, ix.userId, member);
    if (!r.meta.changes) return say(t(L, "rival.exists"));
    return reply({ content: t(L, "rival.added", { a: mention(ix.userId), b: mention(member) }), allowed_mentions: pingUsers([member]) });
  }
  const r = await run(ix.env, "DELETE FROM rivals WHERE guild_id = ? AND owner_id = ? AND rival_id = ?", g.id, ix.userId, member);
  return say(t(L, r.meta.changes ? "rival.removed" : "rival.not", { b: mention(member) }));
}

async function openBetContest(ix: Ix) {
  const open = (await activeContests(ix.env, ix.guild.id)).filter((c) => c.bets_close && now() < c.bets_close);
  return open.length === 1 ? open[0] : null;
}

async function cmdBet(ix: Ix, player: string, amount: number) {
  const L = ix.L;
  const c = await openBetContest(ix);
  if (!c) return say(t(L, "bet.none_open"));
  const p = await findPlayer(ix.env, ix.guild.id, ix.userId);
  const prev = await one<{ amount: number }>(ix.env, "SELECT amount FROM bets WHERE contest_id = ? AND discord_id = ?", c.id, ix.userId);
  let coins = (p?.coins ?? RULES.startCoins) + (prev?.amount ?? 0);
  const pity = coins < RULES.minCoins;
  coins = Math.max(coins, RULES.minCoins);
  if (amount > coins) return say(t(L, "bet.not_enough", { n: coins }));
  const pick = player.trim().replace(/^@/, "");
  await ix.env.DB.batch([
    ix.env.DB.prepare("INSERT OR REPLACE INTO bets (contest_id, discord_id, pick, pick_display, amount) VALUES (?, ?, ?, ?, ?)").bind(c.id, ix.userId, pick.toLowerCase(), pick, amount),
    ix.env.DB.prepare("UPDATE players SET coins = ? WHERE guild_id = ? AND discord_id = ?").bind(coins - amount, ix.guild.id, ix.userId),
  ]);
  return reply({ content: t(L, "bet.placed", { user: mention(ix.userId), amount, pick, changed: prev ? t(L, "bet.changed") : "", pity: pity ? t(L, "bet.pity") : "", mult: RULES.betWinMultiplier }) });
}

async function cmdCoins(ix: Ix) {
  const L = ix.L;
  const rows = await all<{ discord_id: string; coins: number }>(ix.env, "SELECT discord_id, coins FROM players WHERE guild_id = ? ORDER BY coins DESC LIMIT 10", ix.guild.id);
  const me = await findPlayer(ix.env, ix.guild.id, ix.userId);
  return reply({ embeds: [{
    title: t(L, "lb.coins"), color: COLORS.purple,
    description: rows.map((r, i) => `${MEDALS[i + 1] ?? `\`${i + 1}.\``} ${mention(r.discord_id)} · ${r.coins} 🪙`).join("\n") || t(L, "lb.empty"),
    footer: { text: t(L, "bet.coins_footer", { n: me?.coins ?? RULES.startCoins }) },
  }] });
}

async function cmdContestList(ix: Ix) {
  const L = ix.L;
  const rows = await activeContests(ix.env, ix.guild.id);
  if (!rows.length) return say(t(L, "contest.none"));
  return reply({ content: rows.map((c) => t(L, "contest.list_line", {
    name: c.name, slug: c.slug, channel: `<#${c.channel_id}>`, interval: c.interval_min,
    ends: c.end_at ? t(L, "contest.list_ends", { when: ts(c.end_at) }) : "",
  })).join("\n") });
}

async function findContest(ix: Ix, slug: string | null) {
  const rows = await activeContests(ix.env, ix.guild.id);
  if (!rows.length) return { error: t(ix.L, "contest.none") };
  if (slug) {
    const c = rows.find((r) => r.slug === slug.toLowerCase() || String(r.id) === slug);
    return c ? { c } : { error: t(ix.L, "contest.none") };
  }
  return rows.length === 1 ? { c: rows[0] } : { error: t(ix.L, "contest.several") };
}

async function cmdStandings(ix: Ix, slug: string | null) {
  const L = ix.L;
  const f = await findContest(ix, slug);
  if (!f.c) return say(f.error!);
  const c = f.c;
  const links = await hrNames(ix.env, ix.guild.id);
  const st = JSON.parse(c.state || "{}");
  if (isFrozen(c, now()) && st.frozen_board) {
    const e = standingsEmbed(ix.guild, c, st.frozen_board, t(L, "contest.frozen_standings", { name: c.name }), links, [], COLORS.ice);
    e.description = t(L, "contest.frozen_note") + "\n\n" + e.description;
    return reply({ embeds: [e] });
  }
  later(ix, async () => {
    const entries = await fetchLeaderboard(c.slug);
    return { embeds: [standingsEmbed(ix.guild, c, entries, t(L, "contest.standings", { name: c.name }), links)] };
  });
  return deferReply(false);
}

// ----------------------------------------------------------------- help
const HELP_PAGES = ["start", "challenges", "write", "points", "duels", "daily", "contests", "social", "teacher"];

function helpPage(ix: Ix, topic: string) {
  const L = ix.L;
  const page = HELP_PAGES.includes(topic) && (topic !== "teacher" || ix.teacher) ? topic : "start";
  let body = t(L, `help.${page}`);
  if (page === "points") {
    const sc = scoringOf(ix.guild);
    const head = `\`${t(L, "help.points_type").padEnd(18)} ${"🟢".padStart(4)} ${"🟡".padStart(4)} ${"🔴".padStart(4)}\``;
    const lines = SCORE_KINDS.map((k) => `\`${t(L, `kind.${k}`).slice(0, 18).padEnd(18)} ${String(basePoints(sc, k, "easy")).padStart(4)} ${String(basePoints(sc, k, "medium")).padStart(4)} ${String(basePoints(sc, k, "hard")).padStart(4)}\``);
    body = body.replace("{table}", [head, ...lines].join("\n")).replace("{cap}", String(sc.cap))
      .replace("{c1}", String(sc.contest.first)).replace("{c2}", String(sc.contest.second)).replace("{c3}", String(sc.contest.third))
      .replace("{c10}", String(sc.contest.top10)).replace("{cplay}", String(sc.contest.play)).replace("{award}", String(sc.award));
  }
  const options = HELP_PAGES.filter((p) => p !== "teacher" || ix.teacher)
    .map((p) => ({ label: t(L, `help.label.${p}`), value: p, default: p === page }));
  return {
    embeds: [{ title: t(L, `help.title.${page}`), description: body, color: COLORS.blue, footer: { text: t(L, "help.footer") } }],
    components: [row({ type: 3, custom_id: "help", placeholder: t(L, "help.pick"), options })],
  };
}

// --------------------------------------------------------------- teacher
async function cmdTeacher(ix: Ix, sub: string, o: Record<string, any>) {
  const L = ix.L, g = ix.guild;
  if (sub === "track") {
    const channel = o.channel ?? (await arenaChannel(ix.env, g)) ?? ix.raw.channel_id;
    later(ix, async () => {
      const r = await trackContest(ix.env, g, String(o.link), channel, o.every_minutes ?? 5, o.freeze_minutes ?? 15);
      if (!r.contest) return { content: r.error };
      if (channel !== ix.raw.channel_id) await send(ix.env, channel, { embeds: [trackingEmbed(g, r.contest)] }).catch(() => {});
      return { embeds: [trackingEmbed(g, r.contest)] };
    });
    return deferReply(false);
  }
  if (sub === "stop") {
    const f = await findContest(ix, o.contest ?? null);
    if (!f.c) return say(f.error!);
    const announce = o.announce !== false;
    await stopContest(ix.env, f.c, announce);
    return say(t(L, announce ? "contest.stopping" : "contest.cancelled", { name: f.c.name }), false);
  }
  if (sub === "season") {
    const old = g.season;
    const top = (await standings(ix.env, g.id, old, 1))[0];
    const name = String(o.name).trim().slice(0, 60);
    await run(ix.env, "UPDATE guilds SET season = ? WHERE id = ?", name, g.id);
    let msg = t(L, "season.new", { season: name });
    if (top) msg = t(L, "season.champion", { old, who: top.discord_id ? mention(top.discord_id) : top.name, pts: top.points }) + "\n" + msg;
    const arena = await arenaChannel(ix.env, g);
    if (arena && arena !== ix.raw.channel_id) await send(ix.env, arena, { content: msg }).catch(() => {});
    return say(msg, false);
  }
  if (sub === "dashboard") {
    return say(ix.env.DASHBOARD_URL ? t(L, "teacher.dashboard", { url: ix.env.DASHBOARD_URL }) : t(L, "teacher.no_dashboard"));
  }
  if (sub === "verify") {
    const member = String(o.member);
    const p = await findPlayer(ix.env, g.id, member);
    if (!p?.hr_username) return say(t(L, "err.not_linked_other", { name: memberName(ix.raw, member) }));
    await confirmHackerRank(ix.env, g.id, member);
    return say(t(L, "link.verified", { user: mention(member), hr: p.hr_display ?? p.hr_username }));
  }
  if (sub === "setup") {
    const lang = o.language ?? g.lang, hour = o.daily_hour ?? g.daily_hour, code = o.code_language ?? g.code_lang;
    const arena = o.arena ?? g.arena_channel ?? (await arenaChannel(ix.env, { ...g, announce_channel: null, daily_channel: null })) ?? ix.raw.channel_id;
    await run(ix.env, "UPDATE guilds SET lang = ?, daily_hour = ?, code_lang = ?, arena_channel = ?, announce_channel = ?, daily_channel = ?, name = COALESCE(name, ?) WHERE id = ?",
      lang, hour, code, arena, arena, arena, ix.raw.guild?.name ?? null, g.id);
    return say(t(lang, "teacher.setup_ok", { lang: lang === "fr" ? "Français" : "English", channel: `<#${arena}>`, hour, code: guildLangs({ code_lang: code }).map((x) => LANGS[x as keyof typeof LANGS]?.label ?? x).join(" + ") }));
  }
  return say(t(L, "err.unknown"));
}

// =========================================================== components
async function ownAttempt(ix: Ix, id: number): Promise<{ a: AttemptRow; c: ChallengeRow } | Response> {
  const a = await getAttempt(ix.env, id);
  if (!a) return say(t(ix.L, "err.unknown"));
  if (a.discord_id !== ix.userId) return say(t(ix.L, "err.not_yours"));
  const c = await getChallenge(ix.env, a.challenge_id);
  if (!c) return say(t(ix.L, "err.unknown"));
  return { a, c };
}

async function component(ix: Ix): Promise<Response> {
  const L = ix.L;
  const [kind, x, y] = String(ix.raw.data.custom_id).split(":");
  const id = Number(x);
  switch (kind) {
    case "help": return update(helpPage(ix, String(ix.raw.data.values?.[0] ?? "start")));
    case "hrv": return verifyLink(ix);
    case "ans": {
      const r = await ownAttempt(ix, id);
      if (r instanceof Response) return r;
      later(ix, async () => (await answer(ix.env, ix.guild, r.a, r.c, y)).payload);
      return deferUpdate();
    }
    case "ansm": {
      const r = await ownAttempt(ix, id);
      if (r instanceof Response) return r;
      if (r.a.status !== "pending") return say(t(L, "res.already"));
      return json(modal(`mans:${id}`, t(L, "ch.modal_title"), [{ id: "a", label: t(L, "ch.modal_label"), long: true, max: 300 }]));
    }
    case "sub": {
      const r = await ownAttempt(ix, id);
      if (r instanceof Response) return r;
      if (r.a.status !== "pending") return say(t(L, "res.already"));
      const ig = integrityOf(ix.guild);
      if (ig.editor === "required" || r.a.origin === "session") {
        // anti-cheat on: answers only through the code editor page
        const url = editorUrl(ix.env, await editorToken(ix.env, r.a.id, ix.userId));
        return reply({ content: t(L, "ch.editor_note"), components: [row(linkBtn(t(L, "ch.editor_btn"), url, "💻"))] }, true);
      }
      const p = await findPlayer(ix.env, ix.guild.id, ix.userId);
      const lang = codeLangFor(ix.guild, p, r.a);
      return json(modal(`msub:${id}`, t(L, "ch.submit_title"), [{
        id: "code", label: t(L, "ch.code_label", { lang: LANGS[lang as keyof typeof LANGS].label }), long: true, max: 4000,
        // their last code in this language, else a starter that shows how to read the input
        value: (r.a.answer_given && (!r.a.lang || r.a.lang === lang) ? r.a.answer_given : starterFor(r.c, lang, L)).slice(0, 4000),
      }]));
    }
    case "exp": {
      const r = await ownAttempt(ix, id);
      if (r instanceof Response) return r;
      later(ix, async () => {
        const st = await startExplain(ix.env, ix.guild, r.a, r.c);
        if (st === "none") return { content: t(L, "explain.none"), components: [] };
        if (st === "done") return { content: t(L, "explain.already"), components: [] };
        return {
          content: [t(L, "explain.questions", { s: EXPLAIN_SECONDS / 60, deadline: ts(st.deadline) }), ...st.questions.map((q, i) => `**${i + 1}.** ${q}`)].join("\n"),
          components: [row(btn(t(L, "explain.answer_btn"), `expa:${id}`, 1, "✍️"))],
        };
      });
      return deferReply(true);
    }
    case "expa": {
      const r = await ownAttempt(ix, id);
      if (r instanceof Response) return r;
      const st = explainState(r.a);
      if (!st || st.score !== undefined) return say(t(L, "explain.already"));
      return json(modal(`mexp:${id}`, t(L, "explain.title"), st.questions.map((q, i) => ({ id: `a${i}`, label: `${i + 1}. ${q}`.slice(0, 45), long: true, max: 800 }))));
    }
    case "sopen": {
      const s = await one<{ id: number; title: string; challenges: string; ends_at: number; status: string; team_id: number | null }>(ix.env, "SELECT * FROM sessions WHERE id = ? AND guild_id = ?", id, ix.guild.id);
      if (!s || s.status !== "active" || now() > s.ends_at) return say(t(L, "session.over"));
      if (s.team_id) {
        const mine = await one(ix.env, "SELECT 1 FROM team_members WHERE team_id = ? AND discord_id = ?", s.team_id, ix.userId);
        if (!mine) return say(t(L, "session.not_for_you"));
      }
      const ids: number[] = JSON.parse(s.challenges || "[]");
      const rows = await all<ChallengeRow>(ix.env, `SELECT * FROM challenges WHERE id IN (${ids.map(() => "?").join(", ") || "0"})`, ...ids);
      const done = new Set((await all<{ challenge_id: number }>(ix.env, "SELECT challenge_id FROM attempts WHERE origin = 'session' AND ref = ? AND discord_id = ? AND status != 'pending'", s.id, ix.userId)).map((x) => x.challenge_id));
      const list = ids.map((cid, i) => rows.find((c) => c.id === cid)).filter(Boolean) as ChallengeRow[];
      const buttons = list.map((c, i) => btn(`${i + 1}. ${c.title}`.slice(0, 80), `sgo:${s.id}:${c.id}`, done.has(c.id) ? 2 : 1, done.has(c.id) ? "✅" : "🧩", done.has(c.id)));
      const rows5: unknown[] = [];
      for (let i = 0; i < buttons.length && rows5.length < 5; i += 5) rows5.push(row(...buttons.slice(i, i + 5)));
      return reply({ content: t(L, "session.pick", { title: s.title, end: ts(s.ends_at) }), components: rows5 }, true);
    }
    case "sgo": {
      const sid = id, cid = Number(y);
      const s = await one<{ id: number; challenges: string; ends_at: number; status: string; team_id: number | null }>(ix.env, "SELECT * FROM sessions WHERE id = ? AND guild_id = ?", sid, ix.guild.id);
      if (!s || s.status !== "active" || now() > s.ends_at) return say(t(L, "session.over"));
      if (!(JSON.parse(s.challenges || "[]") as number[]).includes(cid)) return say(t(L, "err.unknown"));
      if (s.team_id && !(await one(ix.env, "SELECT 1 FROM team_members WHERE team_id = ? AND discord_id = ?", s.team_id, ix.userId))) return say(t(L, "session.not_for_you"));
      later(ix, async () => {
        const c = await getChallenge(ix.env, cid);
        if (!c) return { content: t(L, "err.unknown") };
        const a = await startAttempt(ix.env, ix.guild, ix.userId, c, "session", sid);
        if (a.status !== "pending") return { content: t(L, "res.already") };
        return renderFor(ix.env, ix.guild, c, a, { notice: t(L, "session.notice", { end: ts(s.ends_at) }) });
      });
      return deferReply(true);
    }
    case "lang": {
      const r = await ownAttempt(ix, id);
      if (r instanceof Response) return r;
      const lang = String(ix.raw.data.values?.[0] ?? "python");
      if (!isCodeLang(lang)) return say(t(L, "err.unknown"));
      await ix.env.DB.batch([
        ix.env.DB.prepare("UPDATE players SET code_lang = ? WHERE guild_id = ? AND discord_id = ?").bind(lang, ix.guild.id, ix.userId),
        ix.env.DB.prepare("UPDATE attempts SET lang = ? WHERE id = ?").bind(lang, id),
      ]);
      later(ix, async () => renderFor(ix.env, ix.guild, r.c, { ...r.a, lang }, { codeLang: lang }));
      return deferUpdate();
    }
    case "fb": {
      const r = await ownAttempt(ix, id);
      if (r instanceof Response) return r;
      later(ix, async () => {
        const text = r.a.feedback || (await feedbackFor(ix.env, ix.guild, r.a, r.c));
        return { content: text ? `🧠 ${text}` : t(L, "judge.ai_unavailable") };
      });
      return deferReply(true);
    }
    case "hint": {
      const r = await ownAttempt(ix, id);
      if (r instanceof Response) return r;
      if (r.a.status !== "pending") return say(t(L, "res.already"));
      if (!r.c.hint) return say(t(L, "ch.no_hint"));
      await run(ix.env, "UPDATE attempts SET used_hint = 1 WHERE id = ?", id);
      later(ix, async () => renderFor(ix.env, ix.guild, r.c, { ...r.a, used_hint: 1 }));
      return deferUpdate();
    }
    case "rep": {
      const r = await ownAttempt(ix, id);
      if (r instanceof Response) return r;
      return json(modal(`mrep:${id}`, t(L, "res.report_title"), [{ id: "r", label: t(L, "res.report_label"), long: true, max: 500 }]));
    }
    case "chk": {
      const r = await ownAttempt(ix, id);
      if (r instanceof Response) return r;
      if (r.a.status !== "pending") return say(t(L, "res.already"));
      const p = await findPlayer(ix.env, ix.guild.id, ix.userId);
      later(ix, async () => {
        const out = await verifyCoding(ix.env, ix.guild, r.a, r.c, p);
        if (out === "not_yet") return renderFor(ix.env, ix.guild, r.c, r.a, { notice: t(L, "res.verify_not_yet", { title: r.c.title }) });
        if (out === "unavailable") return renderFor(ix.env, ix.guild, r.c, r.a, { showClaim: true, notice: t(L, "res.verify_unavailable") });
        if (out === "unverified") return renderFor(ix.env, ix.guild, r.c, r.a);
        if (out === "too_old") return { content: t(L, "res.verify_too_old", { title: r.c.title }), embeds: [], components: [] };
        return out.payload;
      });
      return deferUpdate();
    }
    case "claim": {
      const r = await ownAttempt(ix, id);
      if (r instanceof Response) return r;
      if (r.a.status !== "pending") return say(t(L, "res.already"));
      return json(modal(`mclaim:${id}`, t(L, "res.claim_title"), [{ id: "l", label: t(L, "res.claim_label"), required: true, max: 300 }]));
    }
    case "dacc": return duelAccept(ix, id);
    case "ddec": return duelDecline(ix, id);
    case "dopen": return duelOpen(ix, id);
    case "dsolve": {
      const day = `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}`;
      const d = await one<{ challenge_id: number }>(ix.env, "SELECT challenge_id FROM daily WHERE guild_id = ? AND day = ?", ix.guild.id, day);
      if (!d) return say(t(L, "daily.expired"));
      return openDaily(ix, d.challenge_id, day);
    }
    case "astart": return assignmentOpen(ix, await one(ix.env, "SELECT * FROM assignments WHERE id = ? AND guild_id = ?", id, ix.guild.id));
    case "abatch": return assignmentOpen(ix, await one(ix.env,
      "SELECT * FROM assignments WHERE guild_id = ? AND challenge_id = ? AND discord_id = ? ORDER BY (status = 'open') DESC, id DESC LIMIT 1", ix.guild.id, id, ix.userId));
  }
  return say(t(L, "err.unknown"));
}

// ================================================================ modals
async function modalSubmit(ix: Ix): Promise<Response> {
  const L = ix.L;
  const [kind, x] = String(ix.raw.data.custom_id).split(":");
  const id = Number(x);
  const value = String(ix.raw.data.components?.[0]?.components?.[0]?.value ?? "");
  if (kind === "mans") {
    const r = await ownAttempt(ix, id);
    if (r instanceof Response) return r;
    later(ix, async () => (await answer(ix.env, ix.guild, r.a, r.c, value)).payload);
    return deferUpdate();
  }
  if (kind === "msub") {
    const r = await ownAttempt(ix, id);
    if (r instanceof Response) return r;
    if (r.a.status !== "pending") return say(t(L, "res.already"));
    if (!value.trim()) return say(t(L, "judge.empty"));
    const p = await findPlayer(ix.env, ix.guild.id, ix.userId);
    const lang = codeLangFor(ix.guild, p, r.a);
    // show "judging…" right away, then the verdict
    ix.ctx.waitUntil((async () => {
      await editOriginal(ix.env, ix.raw.token, { content: t(L, "judge.running"), components: [] }).catch(() => {});
      try {
        const out = await submitCode(ix.env, ix.guild, r.a, r.c, value, lang, null, "discord");
        await editOriginal(ix.env, ix.raw.token, { content: "", ...out.payload });
      } catch (e) {
        console.error(e);
        await editOriginal(ix.env, ix.raw.token, { content: errorText(L, e) }).catch(() => {});
      }
    })());
    return deferUpdate();
  }
  if (kind === "mexp") {
    const r = await ownAttempt(ix, id);
    if (r instanceof Response) return r;
    const answers = (ix.raw.data.components ?? []).map((rw: any) => String(rw?.components?.[0]?.value ?? ""));
    later(ix, async () => {
      const res = await answerExplain(ix.env, ix.guild, r.a, r.c, answers);
      if (!res) return { content: t(L, "explain.already"), components: [] };
      if (res.late) return { content: t(L, "explain.late"), components: [] };
      return { content: t(L, "explain.result", { s: Math.round(res.score * 100), p: res.awarded }) + (res.feedback ? `\n🧠 ${res.feedback}` : ""), components: [] };
    });
    return deferUpdate();
  }
  if (kind === "mclaim") {
    const r = await ownAttempt(ix, id);
    if (r instanceof Response) return r;
    if (r.a.status !== "pending") return say(t(L, "res.already"));
    later(ix, async () => {
      await run(ix.env, "UPDATE attempts SET answer_given = ? WHERE id = ?", value.slice(0, 300), id);
      return (await finish(ix.env, ix.guild, { ...r.a, answer_given: value || null }, r.c, true, { verified: 0, claimed: true })).payload;
    });
    return deferUpdate();
  }
  if (kind === "mrep") {
    const r = await ownAttempt(ix, id);
    if (r instanceof Response) return r;
    await run(ix.env, "INSERT OR IGNORE INTO reports (guild_id, challenge_id, discord_id, reason, created_at) VALUES (?, ?, ?, ?, ?)",
      ix.guild.id, r.c.id, ix.userId, value.slice(0, 500), now());
    const n = await one<{ n: number }>(ix.env, "SELECT COUNT(*) AS n FROM reports WHERE challenge_id = ? AND status = 'open'", r.c.id);
    // two independent reports take a challenge out of rotation until the teacher reviews it
    if ((n?.n ?? 0) >= 2) await run(ix.env, "UPDATE challenges SET status = 'flagged' WHERE id = ? AND status = 'active'", r.c.id);
    return say(t(L, "res.report_ok"));
  }
  return say(t(L, "err.unknown"));
}

// ========================================================== autocomplete
async function autocomplete(ix: Ix): Promise<Response> {
  const opts: any[] = ix.raw.data.options?.[0]?.options ?? ix.raw.data.options ?? [];
  const focused = opts.find((o) => o.focused);
  const cur = String(focused?.value ?? "").toLowerCase();
  let names: string[] = [];
  if (ix.raw.data.name === "bet") {
    const set = new Set<string>();
    for (const r of await all<{ hr_display: string }>(ix.env, "SELECT hr_display FROM players WHERE guild_id = ? AND hr_display IS NOT NULL", ix.guild.id)) set.add(r.hr_display);
    for (const c of await activeContests(ix.env, ix.guild.id)) for (const n of Object.values(JSON.parse(c.state || "{}").names ?? {})) set.add(String(n));
    names = [...set];
  } else if (ix.raw.data.name === "contest" || ix.raw.data.name === "teacher") {
    names = (await activeContests(ix.env, ix.guild.id)).map((c) => c.slug);
  }
  const choices = names.filter((n) => n.toLowerCase().includes(cur)).sort((a, b) => a.localeCompare(b)).slice(0, 25).map((n) => ({ name: n, value: n }));
  return json({ type: 8, data: { choices } });
}
