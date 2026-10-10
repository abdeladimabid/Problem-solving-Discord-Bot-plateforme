// HackerRank contest tracking: live commentary, freeze & reveal, awards,
// season points, team results, predictions and champion roles.
import type { D1Stmt, ContestRow, Entry, Env, GuildRow } from "./types.ts";
import { addPoints, all, checkBadges, getGuild, now, one, run } from "./db.ts";
import type { Award, Snap } from "./game.ts";
import { RULES, addSnapshot, computeAwards, contestPoints, fmtDuration, isPhotoFinish, rivalPasses, scoringOf, settleBet, teamResults } from "./game.ts";
import { t } from "./i18n.ts";
import { COLORS, MEDALS, addRole, mention, pingUsers, removeRole, send, sleep, ts } from "./discord.ts";
import { HackerRankError, fetchContest, fetchLeaderboard, parseContestSlug } from "./hackerrank.ts";

export const contestConfig = { revealPause: 4000 };
const LATE_BETS_WINDOW = 30 * 60;

interface CState {
  ranks?: Record<string, number>;
  scores?: Record<string, number>;
  names?: Record<string, string>;
  worst?: Record<string, number>;
  first_blood?: string | null;
  polled?: boolean;
  started_announced?: boolean;
  reminders?: number[];
  frozen_announced?: boolean;
  frozen_board?: Entry[];
  photo_done?: boolean;
  bets_announced?: boolean;
}

const contestUrl = (slug: string) => `https://www.hackerrank.com/contests/${slug}`;
export const isFrozen = (c: ContestRow, t0: number) => !!(c.end_at && c.freeze_min && t0 >= c.end_at - c.freeze_min * 60);

// -------------------------------------------------------------- helpers
export async function hrNames(env: Env, guildId: string): Promise<Map<string, string>> {
  const rows = await all<{ hr_username: string; discord_id: string }>(env, "SELECT hr_username, discord_id FROM players WHERE guild_id = ? AND hr_username IS NOT NULL AND hr_verified = 1", guildId);
  return new Map(rows.map((r) => [r.hr_username, r.discord_id]));
}

function namer(links: Map<string, string>) {
  return (u: string) => {
    const id = links.get(u.toLowerCase());
    return id ? `**${u}** (${mention(id)})` : `**${u}**`;
  };
}

async function teamsWithMembers(env: Env, guildId: string) {
  const rows = await all<{ id: number; name: string; hr: string | null }>(
    env,
    `SELECT t.id, t.name, CASE WHEN p.hr_verified = 1 THEN p.hr_username END AS hr FROM teams t
       LEFT JOIN team_members m ON m.team_id = t.id
       LEFT JOIN players p ON p.guild_id = m.guild_id AND p.discord_id = m.discord_id
      WHERE t.guild_id = ?`,
    guildId,
  );
  const map = new Map<number, { id: number; name: string; members: string[] }>();
  for (const r of rows) {
    if (!map.has(r.id)) map.set(r.id, { id: r.id, name: r.name, members: [] });
    if (r.hr) map.get(r.id)!.members.push(r.hr);
  }
  return [...map.values()];
}

export function standingsEmbed(guild: GuildRow, c: ContestRow, entries: Entry[], title: string, links: Map<string, string>, teams: ReturnType<typeof teamResults> = [], color = COLORS.green) {
  const L = guild.lang;
  const name = namer(links);
  const lines = entries.slice(0, 10).map((e) => {
    const time = fmtDuration(e.time_taken);
    return `${MEDALS[e.rank] ?? `\`#${e.rank}\``} ${name(e.username)} · ${e.score} pts${time ? ` · ${time}` : ""}`;
  });
  const embed: Record<string, any> = {
    title,
    url: `${contestUrl(c.slug)}/leaderboard`,
    description: lines.join("\n") || t(L, "contest.empty"),
    color,
    fields: [] as unknown[],
    footer: { text: t(L, "contest.participants", { n: entries.length }) },
  };
  if (teams.length) {
    embed.fields.push({
      name: t(L, "contest.teams_field"),
      value: teams.slice(0, 5).map((r) => t(L, "contest.team_line", { medal: MEDALS[r.rank] ?? "•", team: r.name, avg: r.avg.toFixed(1), present: r.present, size: r.size })).join("\n"),
    });
  }
  if (c.end_at) embed.timestamp = new Date(c.end_at * 1000).toISOString();
  return embed;
}

export function trackingEmbed(guild: GuildRow, c: ContestRow) {
  const L = guild.lang;
  const fields: unknown[] = [];
  if (c.start_at) fields.push({ name: t(L, "contest.starts"), value: `${ts(c.start_at, "F")}\n${ts(c.start_at)}`, inline: true });
  fields.push({ name: t(L, "contest.ends"), value: c.end_at ? `${ts(c.end_at, "F")}\n${ts(c.end_at)}` : t(L, "contest.no_end"), inline: true });
  if (c.end_at && c.freeze_min) fields.push({ name: t(L, "contest.freeze"), value: t(L, "contest.freeze_val", { n: c.freeze_min }), inline: true });
  if (c.bets_close && c.bets_close > now()) fields.push({ name: t(L, "contest.bets"), value: t(L, "contest.bets_val", { when: ts(c.bets_close) }) });
  return {
    title: t(L, "contest.tracking_title", { name: c.name }),
    url: contestUrl(c.slug),
    color: COLORS.green,
    description: t(L, "contest.tracking_desc", { interval: c.interval_min, channel: `<#${c.channel_id}>`, season: c.season }),
    fields,
  };
}

// ------------------------------------------------------------- tracking
export async function trackContest(env: Env, guild: GuildRow, link: string, channelId: string, interval: number, freeze: number) {
  const slug = parseContestSlug(link);
  if (!slug) return { error: t(guild.lang, "contest.bad_link") };
  let info;
  try {
    info = await fetchContest(slug);
    await fetchLeaderboard(slug, 1);
  } catch (e) {
    return { error: t(guild.lang, "contest.read_error", { err: (e as Error).message }) };
  }
  const t0 = now();
  let betsClose = info.start && info.start > t0 ? info.start : t0 + LATE_BETS_WINDOW;
  if (info.end && betsClose >= info.end) betsClose = t0;
  const state: CState = { started_announced: !!(info.start && t0 - info.start > 15 * 60) };
  await run(env, "UPDATE contests SET status = 'cancelled' WHERE guild_id = ? AND slug = ? AND status = 'active'", guild.id, info.slug);
  const r = await run(
    env,
    `INSERT INTO contests (guild_id, slug, name, channel_id, start_at, end_at, interval_min, freeze_min, season, bets_close, state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    guild.id, info.slug, info.name, channelId, info.start, info.end, interval, info.end ? freeze : 0, guild.season, betsClose, JSON.stringify(state), t0,
  );
  const c = (await one<ContestRow>(env, "SELECT * FROM contests WHERE id = ?", Number(r.meta.last_row_id)))!;
  return { contest: c };
}

export async function activeContests(env: Env, guildId: string) {
  return all<ContestRow>(env, "SELECT * FROM contests WHERE guild_id = ? AND status = 'active' ORDER BY id", guildId);
}

/** Called every minute by the cron: polls contests that are due. */
export async function pollDueContests(env: Env, limit = 2) {
  const t0 = now();
  const due = await all<ContestRow>(
    env,
    "SELECT * FROM contests WHERE status = 'active' AND (next_poll <= ? OR (end_at IS NOT NULL AND end_at <= ?)) ORDER BY next_poll LIMIT ?",
    t0, t0, limit,
  );
  for (const c of due) {
    await run(env, "UPDATE contests SET next_poll = ? WHERE id = ?", t0 + c.interval_min * 60, c.id);
    try {
      await pollContest(env, c);
      if (c.errors) await run(env, "UPDATE contests SET errors = 0 WHERE id = ?", c.id);
    } catch (e) {
      const errors = c.errors + 1;
      await run(env, "UPDATE contests SET errors = ?, next_poll = ? WHERE id = ?", errors, t0 + 60, c.id);
      if (errors === 3 && e instanceof HackerRankError) {
        const g = await getGuild(env, c.guild_id);
        await send(env, c.channel_id, { content: t(g.lang, "contest.trouble", { name: c.name, err: e.message }) }).catch(() => {});
      }
      console.error("poll failed", c.id, e);
    }
  }
}

async function saveState(env: Env, c: ContestRow, st: CState, snaps?: Snap[]) {
  if (snaps) await run(env, "UPDATE contests SET state = ?, snaps = ? WHERE id = ?", JSON.stringify(st), JSON.stringify(snaps), c.id);
  else await run(env, "UPDATE contests SET state = ? WHERE id = ?", JSON.stringify(st), c.id);
}

export async function pollContest(env: Env, c: ContestRow) {
  const g = await getGuild(env, c.guild_id);
  const L = g.lang;
  const t0 = now();
  const st: CState = JSON.parse(c.state || "{}");
  if (c.start_at && t0 < c.start_at) return;

  if (!st.started_announced) {
    st.started_announced = true;
    await saveState(env, c, st);
    await send(env, c.channel_id, { content: t(L, "contest.started", { name: c.name, url: contestUrl(c.slug) }) });
  }

  if (!st.bets_announced && c.bets_close && t0 >= c.bets_close) {
    st.bets_announced = true;
    await saveState(env, c, st);
    const bets = await all<{ pick_display: string; amount: number }>(env, "SELECT pick_display, amount FROM bets WHERE contest_id = ?", c.id);
    if (bets.length) {
      const tally = new Map<string, number>();
      for (const b of bets) tally.set(b.pick_display, (tally.get(b.pick_display) ?? 0) + 1);
      const fav = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([u, n]) => `**${u}** (${n})`).join(", ");
      await send(env, c.channel_id, { embeds: [{ title: t(L, "bet.closed_title"), color: COLORS.purple, description: t(L, "bet.closed_desc", { n: bets.length, total: bets.reduce((s, b) => s + b.amount, 0), fav }) }] });
    }
  }

  if (c.end_at && t0 >= c.end_at) return finishContest(env, c);

  if (c.end_at) {
    const remaining = c.end_at - t0;
    const duration = c.start_at ? c.end_at - c.start_at : Infinity;
    const sent = (st.reminders ??= []);
    const due = [60, 10].filter((m) => remaining <= m * 60 && !sent.includes(m) && m * 60 <= duration * 0.66);
    if (due.length) {
      sent.push(...due);
      await send(env, c.channel_id, { content: t(L, "contest.reminder", { n: Math.ceil(remaining / 60), name: c.name }) });
    }
  }

  const entries = await fetchLeaderboard(c.slug);
  const links = await hrNames(env, g.id);
  const name = namer(links);
  const oldRanks = st.ranks ?? {}, oldScores = st.scores ?? {};
  const newRanks: Record<string, number> = {}, newScores: Record<string, number> = {};
  const names = (st.names ??= {});
  for (const e of entries) {
    const k = e.username.toLowerCase();
    newRanks[k] = e.rank;
    newScores[k] = e.score;
    names[k] = e.username;
  }
  const snaps: Snap[] = JSON.parse(c.snaps || "[]");
  addSnapshot(snaps, t0, Object.fromEntries(entries.map((e) => [e.username, e.score])));
  const worst = (st.worst ??= {});
  for (const e of entries) worst[e.username.toLowerCase()] = Math.max(worst[e.username.toLowerCase()] ?? 0, e.rank);

  const firstPoll = !st.polled;
  let firstBloodNow = false;
  if (!firstPoll && !st.first_blood && entries.length && entries[0].score > 0 && !Object.values(oldScores).some((s) => s > 0)) {
    st.first_blood = entries[0].username;
    firstBloodNow = true;
  }
  st.polled = true;
  const teams = await teamsWithMembers(env, g.id);
  const tres = teams.length ? teamResults(teams, entries) : [];

  if (isFrozen(c, t0)) {
    if (!st.frozen_announced) {
      st.frozen_announced = true;
      st.frozen_board = entries;
      const embed = standingsEmbed(g, c, entries, t(L, "contest.frozen_title", { name: c.name }), links, tres, COLORS.ice);
      embed.description = t(L, "contest.frozen_desc", { n: c.freeze_min }) + "\n\n" + embed.description;
      await send(env, c.channel_id, { embeds: [embed] });
    }
  } else if (firstPoll || !Object.keys(oldRanks).length) {
    if (entries.length) {
      const embed = standingsEmbed(g, c, entries, t(L, "contest.live", { name: c.name }), links, tres);
      if (firstBloodNow) embed.description = t(L, "com.first_blood", { u: name(entries[0].username) }) + "\n\n" + embed.description;
      await send(env, c.channel_id, { embeds: [embed] });
    }
  } else {
    const events = commentary(L, oldRanks, oldScores, names, entries, name);
    if (events.length) {
      const embed = standingsEmbed(g, c, entries, t(L, "contest.update", { name: c.name }), links, tres);
      embed.description = events.join("\n") + "\n\n" + embed.description;
      await send(env, c.channel_id, { embeds: [embed] });
    }
    const pairs = await all<{ owner_id: string; owner_hr: string; rival_hr: string }>(
      env,
      `SELECT r.owner_id, po.hr_username AS owner_hr, pr.hr_username AS rival_hr FROM rivals r
         JOIN players po ON po.guild_id = r.guild_id AND po.discord_id = r.owner_id
         JOIN players pr ON pr.guild_id = r.guild_id AND pr.discord_id = r.rival_id
        WHERE r.guild_id = ? AND po.hr_username IS NOT NULL AND pr.hr_username IS NOT NULL AND po.hr_verified = 1 AND pr.hr_verified = 1`,
      g.id,
    );
    const passes = rivalPasses(oldRanks, newRanks, pairs);
    if (passes.length) {
      await send(env, c.channel_id, {
        content: passes.map((p) => t(L, "rival.passed", { owner: mention(p.owner_id), rival: names[p.rival_hr] ?? p.rival_hr, rr: p.rivalRank, or: p.ownerRank })).join("\n"),
        allowed_mentions: pingUsers(passes.map((p) => p.owner_id)),
      });
    }
    if (c.end_at && !st.photo_done && c.end_at - t0 <= 30 * 60 && isPhotoFinish(entries)) {
      st.photo_done = true;
      await send(env, c.channel_id, { content: t(L, "com.photo", { a: name(entries[0].username), b: name(entries[1].username), m: Math.ceil((c.end_at - t0) / 60) }) });
    }
  }
  st.ranks = newRanks;
  st.scores = newScores;
  await saveState(env, c, st, snaps);
}

function commentary(L: string, oldRanks: Record<string, number>, oldScores: Record<string, number>, oldNames: Record<string, string>, entries: Entry[], name: (u: string) => string): string[] {
  const events: string[] = [];
  if (!Object.values(oldScores).some((s) => s > 0) && entries[0]?.score > 0) events.push(t(L, "com.first_blood", { u: name(entries[0].username) }));
  const best = Math.min(...Object.values(oldRanks));
  const leaders = new Set(Object.entries(oldRanks).filter(([, r]) => r === best).map(([u]) => u));
  const leader = entries[0].username.toLowerCase();
  const leadChanged = !leaders.has(leader) && entries[0].score > 0;
  if (leadChanged) events.push(t(L, "com.lead", { new: name(entries[0].username), old: [...leaders].sort().map((u) => name(oldNames[u] ?? u)).join(", ") }));
  for (const e of entries.slice(0, 10)) {
    const k = e.username.toLowerCase();
    if (leadChanged && k === leader) continue;
    const prev = oldRanks[k];
    if (prev === undefined) events.push(t(L, "com.enter", { u: name(e.username), r: e.rank }));
    else if (prev - e.rank >= 5) events.push(t(L, "com.jump", { u: name(e.username), n: prev - e.rank, a: prev, b: e.rank }));
    else if (e.rank < prev) events.push(t(L, "com.climb", { u: name(e.username), a: prev, b: e.rank }));
  }
  return events.slice(0, 8);
}

// --------------------------------------------------------------- finish
export async function finishContest(env: Env, c: ContestRow) {
  // claim it first so two cron runs can't finish it twice
  const claimed = await run(env, "UPDATE contests SET status = 'finishing' WHERE id = ? AND status = 'active'", c.id);
  if (!claimed.meta.changes) return;
  let final: Entry[];
  try {
    final = await fetchLeaderboard(c.slug);
  } catch (e) {
    await run(env, "UPDATE contests SET status = 'active' WHERE id = ?", c.id);
    throw e;
  }
  const g = await getGuild(env, c.guild_id);
  const L = g.lang;
  const t0 = now();
  const st: CState = JSON.parse(c.state || "{}");
  const snaps: Snap[] = JSON.parse(c.snaps || "[]");
  const endTime = c.end_at && t0 >= c.end_at ? c.end_at : t0;
  addSnapshot(snaps, endTime, Object.fromEntries(final.map((e) => [e.username, e.score])));
  const links = await hrNames(env, g.id);
  const name = namer(links);
  const season = c.season || g.season;
  const seasonGuild = { ...g, season };

  // history of earlier contests for "most improved"
  const prev = await all<{ contest_id: number; hr_display: string; rank: number; participants: number }>(
    env, "SELECT contest_id, hr_display, rank, participants FROM contest_results WHERE guild_id = ? ORDER BY contest_id", g.id,
  );
  const history: { u: string; rank: number; n: number }[][] = [];
  let lastId = -1;
  for (const r of prev) {
    if (r.contest_id !== lastId) { history.push([]); lastId = r.contest_id; }
    history[history.length - 1].push({ u: r.hr_display, rank: r.rank, n: r.participants });
  }
  const awards = computeAwards(final, snaps, st.worst ?? {}, endTime, history, st.first_blood ?? null);

  // results, points, awards, team points, bets and the contest's status: ONE atomic batch, so a contest
  // with many players never ends half-saved (and stays within the free plan's query limit)
  const stmts: D1Stmt[] = [];
  const q = (sql: string, ...args: unknown[]) => stmts.push(env.DB.prepare(sql).bind(...args));
  const sc = scoringOf(g);
  const ledger = (did: string | null, hr: string, amount: number, reason: string, note: string) => {
    if (amount) q("INSERT INTO ledger (guild_id, discord_id, hr_username, season, amount, reason, ref, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      g.id, did, hr, season, Math.round(amount), reason, String(c.id), note, t0);
  };
  for (const e of final) {
    const k = e.username.toLowerCase();
    const did = links.get(k) ?? null;
    q(`INSERT OR REPLACE INTO contest_results (contest_id, guild_id, hr_username, hr_display, discord_id, rank, score, time_taken, participants)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, c.id, g.id, k, e.username, did, e.rank, e.score, e.time_taken, final.length);
    ledger(did, k, contestPoints(sc, e.rank), "contest", `#${e.rank}`);
  }
  for (const a of awards) {
    const k = a.u.toLowerCase();
    q("INSERT INTO awards (guild_id, contest_id, hr_username, discord_id, award, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      g.id, c.id, k, links.get(k) ?? null, a.id, JSON.stringify(a.detail), t0);
    ledger(links.get(k) ?? null, k, sc.award, "award", a.id);
  }
  const teams = await teamsWithMembers(env, g.id);
  const tres = teams.length ? teamResults(teams, final) : [];
  for (const r of tres) {
    q("INSERT OR REPLACE INTO team_points (guild_id, team_id, season, contest_id, rank, avg_score, points) VALUES (?, ?, ?, ?, ?, ?, ?)",
      g.id, r.id, season, c.id, r.rank, r.avg, RULES.teamPoints[r.rank] ?? 0);
  }
  const bets = await all<{ discord_id: string; pick: string; pick_display: string; amount: number }>(env, "SELECT * FROM bets WHERE contest_id = ?", c.id);
  const betRows: { uid: string; pick: string; amount: number; outcome: string; payout: number }[] = [];
  for (const b of bets) {
    const r = settleBet(b.pick, b.amount, final);
    q("UPDATE bets SET outcome = ?, payout = ? WHERE contest_id = ? AND discord_id = ?", r.outcome, r.payout, c.id, b.discord_id);
    if (r.payout) q("UPDATE players SET coins = coins + ? WHERE guild_id = ? AND discord_id = ?", r.payout, g.id, b.discord_id);
    betRows.push({ uid: b.discord_id, pick: b.pick_display, amount: b.amount, outcome: r.outcome, payout: r.payout });
  }
  q("UPDATE contests SET status = 'finished', finished_at = ?, snaps = ?, state = ? WHERE id = ?", t0, JSON.stringify(snaps), JSON.stringify(st), c.id);
  await env.DB.batch(stmts);
  for (const e of final.filter((e) => e.rank <= 3)) {
    const did = links.get(e.username.toLowerCase());
    if (did) await checkBadges(env, g, did);
  }

  // ---- the show
  const ch = c.channel_id;
  const pause = () => sleep(contestConfig.revealPause);
  let intro = t(L, "reveal.intro", { name: c.name });
  if (st.frozen_announced) intro += t(L, "reveal.frozen", { n: c.freeze_min });
  if (!final.length) {
    await send(env, ch, { content: intro + "\n" + t(L, "reveal.nobody") });
    return;
  }
  await send(env, ch, { content: intro + "\n" + t(L, "reveal.drum") });
  await pause();
  const podiumRanks = [...new Set(final.filter((e) => e.rank <= 3).map((e) => e.rank))].sort((a, b) => b - a);
  for (const r of podiumRanks) {
    if (r === 1) break;
    const group = final.filter((e) => e.rank === r);
    await send(env, ch, { content: t(L, "reveal.place", { medal: MEDALS[r], place: t(L, `reveal.place.${r}`), who: group.map((e) => name(e.username)).join(" & "), score: group[0].score }) });
    await pause();
  }
  await send(env, ch, { content: t(L, "reveal.winner_drum") });
  await pause();
  const winners = final.filter((e) => e.rank === 1);
  const pings = final.filter((e) => e.rank <= 3).map((e) => links.get(e.username.toLowerCase())).filter((x): x is string => !!x);
  const fields: unknown[] = final.filter((e) => e.rank <= 3).slice(0, 6).map((e) => ({
    name: `${MEDALS[e.rank]} ${t(L, `reveal.place.${e.rank}`)}`,
    value: `${name(e.username)}\n${e.score} pts${e.time_taken ? `\n${fmtDuration(e.time_taken)}` : ""}`,
    inline: true,
  }));
  const rest = final.filter((e) => e.rank > 3).slice(0, 7);
  if (rest.length) fields.push({ name: t(L, "reveal.mentions"), value: rest.map((e) => `\`#${e.rank}\` ${name(e.username)} · ${e.score}`).join("\n") });
  await send(env, ch, {
    content: pings.length ? t(L, "reveal.congrats", { pings: pings.map(mention).join(" ") }) : t(L, "reveal.congrats_plain"),
    embeds: [{
      title: t(L, "reveal.final_title", { name: c.name }),
      url: `${contestUrl(c.slug)}/leaderboard`,
      description: t(L, "reveal.winner", { who: winners.map((e) => name(e.username)).join(" & "), score: winners[0].score }),
      color: COLORS.gold,
      fields,
      footer: { text: t(L, "reveal.footer", { n: final.length }) },
    }],
    allowed_mentions: pingUsers(pings),
  });

  if (awards.length) await send(env, ch, { embeds: [await awardsEmbed(env, g, season, awards, name)] });
  if (tres.length) {
    await send(env, ch, { embeds: [{
      title: t(L, "teams.result_title"), color: COLORS.green,
      description: tres.map((r) => t(L, "teams.result_line", {
        medal: MEDALS[r.rank] ?? `\`#${r.rank}\``, team: r.name, avg: r.avg.toFixed(1), present: r.present, size: r.size,
        pts: RULES.teamPoints[r.rank] ? t(L, "teams.result_pts", { p: RULES.teamPoints[r.rank] }) : "",
      })).join("\n"),
    }] });
  }
  if (betRows.length) {
    const coins = new Map((await all<{ discord_id: string; coins: number }>(env, "SELECT discord_id, coins FROM players WHERE guild_id = ?", g.id)).map((r) => [r.discord_id, r.coins]));
    const order: Record<string, number> = { won: 0, refunded: 1, lost: 2 };
    betRows.sort((a, b) => order[a.outcome] - order[b.outcome] || b.payout - a.payout);
    await send(env, ch, { embeds: [{
      title: t(L, "bet.results_title"), color: COLORS.purple,
      description: betRows.slice(0, 20).map((r) => t(L, `bet.${r.outcome}`, { user: mention(r.uid), amount: r.amount, pick: r.pick, payout: r.payout, coins: coins.get(r.uid) ?? 0 })).join("\n"),
    }] });
  }
  await syncRoles(env, g, ch, winners.map((e) => links.get(e.username.toLowerCase())).filter((x): x is string => !!x));
  if (env.PUBLIC_URL && snaps.length >= 3) {
    await send(env, ch, { content: t(L, "reveal.replay", { url: `${env.PUBLIC_URL.replace(/\/$/, "")}/replay/${c.id}` }) });
  }
}

async function awardsEmbed(env: Env, g: GuildRow, season: string, awards: Award[], name: (u: string) => string) {
  const L = g.lang;
  const fields: unknown[] = awards.map((a) => ({
    name: t(L, `award.${a.id}`),
    value: `${name(a.u)}\n${t(L, `award.${a.id}.detail`, a.detail)}`,
  }));
  const top = await all<{ name: string; points: number }>(
    env,
    `SELECT COALESCE(MAX(p.name), MAX(l.hr_username)) AS name, SUM(l.amount) AS points
       FROM ledger l LEFT JOIN players p ON p.guild_id = l.guild_id AND p.discord_id = l.discord_id
      WHERE l.guild_id = ? AND l.season = ? GROUP BY COALESCE(l.discord_id, l.hr_username) ORDER BY points DESC LIMIT 5`,
    g.id, season,
  );
  if (top.length) fields.push({ name: t(L, "awards.season_top", { season }), value: top.map((r, i) => `\`${i + 1}.\` **${r.name}** · ${r.points} pts`).join("\n") });
  return { title: t(L, "awards.title"), description: t(L, "awards.desc", { p: scoringOf(g).award }), color: COLORS.purple, fields };
}

// ---------------------------------------------------------------- roles
export async function syncRoles(env: Env, g: GuildRow, channelId: string | null, champions?: string[]) {
  const L = g.lang;
  const problems: string[] = [];
  const apply = async (roleId: string | null, holdersCol: "champion_holders" | "streak_holders", wanted: Set<string>, label: string) => {
    if (!roleId) return [];
    const holders = new Set<string>(JSON.parse(g[holdersCol] || "[]"));
    const added: string[] = [];
    try {
      for (const u of holders) if (!wanted.has(u)) await removeRole(env, g.id, u, roleId).catch((e) => { if (e?.status === 403) throw e; });
      for (const u of wanted) if (!holders.has(u)) { await addRole(env, g.id, u, roleId).catch((e) => { if (e?.status === 403) throw e; }); added.push(u); }
      await run(env, `UPDATE guilds SET ${holdersCol} = ? WHERE id = ?`, JSON.stringify([...wanted]), g.id);
    } catch {
      problems.push(label);
    }
    return added;
  };
  if (champions) {
    const added = await apply(g.champion_role, "champion_holders", new Set(champions), "👑");
    if (added.length && channelId) await send(env, channelId, { content: t(L, "roles.champion", { users: added.map(mention).join(" "), role: "👑" }) }).catch(() => {});
  }
  if (g.streak_role) {
    // contest streak: took part in each of the last N finished contests, or daily streak
    const recent = await all<{ id: number }>(env, "SELECT id FROM contests WHERE guild_id = ? AND status = 'finished' ORDER BY id DESC LIMIT ?", g.id, RULES.streakRoleContests);
    const wanted = new Set<string>();
    if (recent.length >= RULES.streakRoleContests) {
      const rows = await all<{ discord_id: string; n: number }>(
        env,
        `SELECT discord_id, COUNT(*) AS n FROM contest_results WHERE contest_id IN (${recent.map(() => "?").join(",")}) AND discord_id IS NOT NULL GROUP BY discord_id`,
        ...recent.map((r) => r.id),
      );
      for (const r of rows) if (r.n >= RULES.streakRoleContests) wanted.add(r.discord_id);
    }
    const daily = await all<{ discord_id: string }>(env, "SELECT discord_id FROM players WHERE guild_id = ? AND daily_streak >= ? AND last_daily_day >= ?",
      g.id, RULES.streakRoleDaily, new Date((now() - 86400) * 1000).toISOString().slice(0, 10));
    for (const r of daily) wanted.add(r.discord_id);
    await apply(g.streak_role, "streak_holders", wanted, "🔥");
  }
  if (problems.length && channelId) await send(env, channelId, { content: t(L, "roles.problem", { role: problems.join(" / ") }) }).catch(() => {});
}

// ------------------------------------------------------- stop / cancel
export async function stopContest(env: Env, c: ContestRow, announce: boolean) {
  if (announce) {
    await run(env, "UPDATE contests SET end_at = ?, freeze_min = 0, next_poll = 0 WHERE id = ?", now(), c.id);
    return;
  }
  await run(env, "UPDATE contests SET status = 'cancelled', finished_at = ? WHERE id = ?", now(), c.id);
  const bets = await all<{ discord_id: string; amount: number }>(env, "SELECT discord_id, amount FROM bets WHERE contest_id = ? AND outcome IS NULL", c.id);
  for (const b of bets) await run(env, "UPDATE players SET coins = coins + ? WHERE guild_id = ? AND discord_id = ?", b.amount, c.guild_id, b.discord_id);
  await run(env, "UPDATE bets SET outcome = 'refunded', payout = amount WHERE contest_id = ? AND outcome IS NULL", c.id);
}
