// Class events: live quiz (driven from the dashboard), boss battles and bounties.
import type { ChallengeRow, Env, GuildRow } from "./types.ts";
import type { Judgement } from "./runner.ts";
import { addPoints, all, now, one, run } from "./db.ts";
import { t } from "./i18n.ts";
import { COLORS, MEDALS, btn, codeBlock, editMessage, mention, pingUsers, row, send, truncate, ts } from "./discord.ts";
import { strictArena, arenaChannel } from "./arena.ts";

const LETTERS = ["A", "B", "C", "D"];
const hpBar = (left: number, max: number, n = 20) => {
  const f = Math.max(0, Math.min(n, Math.round((left / Math.max(1, max)) * n)));
  return "🟥".repeat(Math.ceil(f / 2)) + "⬛".repeat(Math.ceil((n - f) / 2));
};

// ================================================================= quiz
export interface QuizRow {
  id: number; guild_id: string; title: string; channel_id: string | null; questions: string; seconds: number; current: number;
  q_started: number | null; q_message: string | null; revealed: number; give_points: number; status: string; created_at: number;
}
export const QUIZ_KINDS = ["mcq", "bug", "complexity"];

export async function createQuiz(env: Env, g: GuildRow, o: { title: string; questions: number[]; seconds: number; channelId?: string | null; givePoints?: boolean }) {
  const r = await run(env, "INSERT INTO quizzes (guild_id, title, channel_id, questions, seconds, give_points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    g.id, o.title, o.channelId || (await strictArena(env, g)) || (await arenaChannel(env, g)), JSON.stringify(o.questions), o.seconds, o.givePoints === false ? 0 : 1, now());
  return (await one<QuizRow>(env, "SELECT * FROM quizzes WHERE id = ?", Number(r.meta.last_row_id)))!;
}

/** Points for one answer: 500 for being right, up to +500 for speed. */
export const quizScore = (correct: boolean, ms: number, seconds: number) => (correct ? 500 + Math.max(0, Math.round(500 * (1 - ms / (seconds * 1000)))) : 0);

export async function quizNext(env: Env, g: GuildRow, q: QuizRow) {
  const ids: number[] = JSON.parse(q.questions);
  if (q.current >= 0 && !q.revealed) await quizReveal(env, g, q);
  const idx = q.current + 1;
  if (idx >= ids.length) return quizEnd(env, g, q);
  const c = await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ?", ids[idx]);
  if (!c) throw new Error("question not found");
  const L = g.lang;
  const choices: string[] = JSON.parse(c.choices || "[]");
  const t0 = now();
  if (idx === 0) await send(env, q.channel_id!, { content: t(L, "quiz.starting", { title: q.title, n: ids.length, s: q.seconds }) });
  const msg = await send(env, q.channel_id!, {
    embeds: [{
      title: t(L, "quiz.q_title", { n: idx + 1, total: ids.length, title: c.title }),
      description: truncate([c.question ?? "", c.code ? codeBlock(c.code, c.code_lang ?? "") : "", choices.map((x, i) => `**${LETTERS[i]})** ${x}`).join("\n"), "", t(L, "quiz.ends", { end: ts(t0 + q.seconds) })].filter(Boolean).join("\n"), 4000),
      color: COLORS.purple,
    }],
    components: [row(...choices.map((_, i) => btn(LETTERS[i], `qz:${q.id}:${idx}:${LETTERS[i]}`, 1)))],
  }) as any;
  await run(env, "UPDATE quizzes SET current = ?, q_started = ?, q_message = ?, revealed = 0, status = 'live' WHERE id = ?", idx, t0, msg?.id ?? null, q.id);
  return { question: idx + 1, total: ids.length };
}

export async function quizAnswer(env: Env, g: GuildRow, userId: string, quizId: number, idx: number, letter: string) {
  const q = await one<QuizRow>(env, "SELECT * FROM quizzes WHERE id = ? AND guild_id = ?", quizId, g.id);
  if (!q || q.status !== "live" || q.current !== idx || q.revealed) return { key: "quiz.closed" };
  const ms = Date.now() - (q.q_started ?? now()) * 1000;
  if (ms > (q.seconds + 2) * 1000) return { key: "quiz.too_late" };
  const c = await one<ChallengeRow>(env, "SELECT answer FROM challenges WHERE id = ?", (JSON.parse(q.questions) as number[])[idx]);
  const correct = (c?.answer ?? "").toUpperCase() === letter;
  const r = await run(env, "INSERT OR IGNORE INTO quiz_answers (quiz_id, q_idx, discord_id, answer, correct, ms, score) VALUES (?, ?, ?, ?, ?, ?, ?)",
    quizId, idx, userId, letter, correct ? 1 : 0, Math.max(0, ms), quizScore(correct, Math.max(0, ms), q.seconds));
  return { key: r.meta.changes ? "quiz.locked" : "quiz.already", letter };
}

export async function quizStandings(env: Env, quizId: number) {
  return all<{ discord_id: string; name: string | null; score: number; right: number }>(env,
    `SELECT a.discord_id, p.name, SUM(a.score) AS score, SUM(a.correct) AS right FROM quiz_answers a
       JOIN quizzes q ON q.id = a.quiz_id LEFT JOIN players p ON p.guild_id = q.guild_id AND p.discord_id = a.discord_id
      WHERE a.quiz_id = ? GROUP BY a.discord_id ORDER BY score DESC`, quizId);
}

export async function quizReveal(env: Env, g: GuildRow, q: QuizRow) {
  if (q.current < 0 || q.revealed) return;
  const L = g.lang;
  const c = await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ?", (JSON.parse(q.questions) as number[])[q.current]);
  const counts = await all<{ answer: string; n: number }>(env, "SELECT answer, COUNT(*) AS n FROM quiz_answers WHERE quiz_id = ? AND q_idx = ? GROUP BY answer", q.id, q.current);
  const choices: string[] = JSON.parse(c?.choices || "[]");
  const dist = choices.map((_, i) => `${LETTERS[i] === c?.answer ? "✅" : "▫️"} **${LETTERS[i]}** · ${counts.find((x) => x.answer === LETTERS[i])?.n ?? 0}`).join("   ");
  await run(env, "UPDATE quizzes SET revealed = 1 WHERE id = ?", q.id);
  q.revealed = 1;
  if (q.q_message && q.channel_id) {
    await editMessage(env, q.channel_id, q.q_message, {
      components: [row(...choices.map((_, i) => btn(LETTERS[i], `qz:${q.id}:${q.current}:${LETTERS[i]}`, LETTERS[i] === c?.answer ? 3 : 2, undefined, true)))],
    }).catch(() => {});
  }
  const top = (await quizStandings(env, q.id)).slice(0, 5);
  await send(env, q.channel_id!, {
    content: [t(L, "quiz.reveal", { answer: c?.answer ?? "?", dist }), c?.explanation ? `💬 ${c.explanation}` : "", top.length ? t(L, "quiz.top") + "\n" + top.map((s, i) => `${MEDALS[i + 1] ?? `${i + 1}.`} ${s.name ?? mention(s.discord_id)} · ${s.score}`).join("\n") : ""].filter(Boolean).join("\n"),
  }).catch(() => {});
}

export async function quizEnd(env: Env, g: GuildRow, q: QuizRow) {
  if (q.status === "done") return { done: true };
  if (q.current >= 0 && !q.revealed) await quizReveal(env, g, q);
  await run(env, "UPDATE quizzes SET status = 'done' WHERE id = ?", q.id);
  const st = await quizStandings(env, q.id);
  if (q.give_points) for (const s of st) {
    const pts = Math.round(s.score / 100);
    if (pts > 0) await addPoints(env, g, { discordId: s.discord_id, amount: pts, reason: "quiz", ref: q.id });
  }
  for (const [i, s] of st.slice(0, 3).entries()) await run(env, "UPDATE players SET coins = coins + ? WHERE guild_id = ? AND discord_id = ?", [15, 10, 5][i], g.id, s.discord_id);
  await send(env, q.channel_id!, {
    content: t(g.lang, "quiz.final", { title: q.title, podium: st.slice(0, 3).map((s, i) => `${MEDALS[i + 1]} ${mention(s.discord_id)} · ${s.score} (${s.right} ✅)`).join("\n") || "—", n: st.length }),
    allowed_mentions: pingUsers(st.slice(0, 3).map((s) => s.discord_id)),
  }).catch(() => {});
  return { done: true };
}

// ================================================================= boss
export interface BossRow {
  id: number; guild_id: string; challenge_id: number; name: string; hp: number; deadline: number; reward: number; coins: number;
  channel_id: string | null; message_id: string | null; status: string; created_at: number; finished_at: number | null;
}
export const MAX_HIT = 40;   // one student can deal at most this much damage (all tests passed)

async function bossDamage(env: Env, id: number) {
  return (await one<{ d: number; n: number }>(env, "SELECT COALESCE(SUM(damage), 0) AS d, COUNT(*) AS n FROM boss_hits WHERE boss_id = ? AND damage > 0", id)) ?? { d: 0, n: 0 };
}

function bossEmbed(g: GuildRow, b: BossRow, c: ChallengeRow, dmg: number, fighters: number) {
  const L = g.lang, left = Math.max(0, b.hp - dmg);
  return {
    title: t(L, b.status === "won" ? "boss.title_won" : b.status === "lost" ? "boss.title_lost" : "boss.title", { name: b.name }),
    description: [
      t(L, "boss.hp", { bar: hpBar(left, b.hp), left, max: b.hp }),
      "", t(L, "boss.how", { title: c.title, level: t(L, `diff.${c.difficulty}`), max: MAX_HIT }),
      b.status === "active" ? t(L, "boss.deadline", { end: ts(b.deadline) }) : "",
      t(L, "boss.fighters", { n: fighters, reward: b.reward, coins: b.coins }),
    ].filter(Boolean).join("\n"),
    color: b.status === "won" ? COLORS.green : b.status === "lost" ? COLORS.gray : COLORS.red,
  };
}

export async function createBoss(env: Env, g: GuildRow, o: { challengeId: number; name: string; hp: number; hours: number; reward: number; coins: number; channelId?: string | null }) {
  const c = await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ?", o.challengeId);
  if (!c || c.kind !== "write") throw new Error("the boss needs a write-code challenge");
  const channel = o.channelId || (await strictArena(env, g)) || (await arenaChannel(env, g));
  const r = await run(env, "INSERT INTO bosses (guild_id, challenge_id, name, hp, deadline, reward, coins, channel_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    g.id, c.id, o.name, o.hp, now() + o.hours * 3600, o.reward, o.coins, channel, now());
  const b = (await one<BossRow>(env, "SELECT * FROM bosses WHERE id = ?", Number(r.meta.last_row_id)))!;
  if (channel) {
    const msg = await send(env, channel, { content: t(g.lang, "boss.appears", { name: b.name }), embeds: [bossEmbed(g, b, c, 0, 0)], components: [row(btn(t(g.lang, "boss.fight"), `boss:${b.id}`, 4, "⚔️"))] }) as any;
    await run(env, "UPDATE bosses SET message_id = ? WHERE id = ?", msg?.id ?? null, b.id);
  }
  return b;
}

/** A submission on the boss: damage = MAX_HIT × share of tests passed (each student's best counts). */
export async function bossHit(env: Env, g: GuildRow, bossId: number, userId: string, j: Judgement): Promise<string | null> {
  const b = await one<BossRow>(env, "SELECT * FROM bosses WHERE id = ? AND guild_id = ?", bossId, g.id);
  if (!b || b.status !== "active" || now() > b.deadline) return null;
  const dmg = Math.round(MAX_HIT * (j.total ? j.passed / j.total : 0));
  const prev = (await one<{ damage: number }>(env, "SELECT damage FROM boss_hits WHERE boss_id = ? AND discord_id = ?", bossId, userId))?.damage ?? 0;
  if (dmg > prev) await run(env, "INSERT INTO boss_hits (boss_id, discord_id, damage, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (boss_id, discord_id) DO UPDATE SET damage = excluded.damage, updated_at = excluded.updated_at", bossId, userId, dmg, now());
  const tot = await bossDamage(env, bossId);
  const c = (await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ?", b.challenge_id))!;
  if (tot.d >= b.hp) {
    const won = await run(env, "UPDATE bosses SET status = 'won', finished_at = ? WHERE id = ? AND status = 'active'", now(), b.id);
    if (won.meta.changes) {
      b.status = "won";
      const fighters = await all<{ discord_id: string; damage: number }>(env, "SELECT discord_id, damage FROM boss_hits WHERE boss_id = ? AND damage > 0 ORDER BY damage DESC", b.id);
      for (const f of fighters) {
        await addPoints(env, g, { discordId: f.discord_id, amount: b.reward, reason: "boss", ref: b.id });
        await run(env, "UPDATE players SET coins = coins + ? WHERE guild_id = ? AND discord_id = ?", b.coins, g.id, f.discord_id);
      }
      if (b.channel_id) await send(env, b.channel_id, {
        content: t(g.lang, "boss.defeated", { name: b.name, n: fighters.length, reward: b.reward, coins: b.coins, top: fighters[0] ? mention(fighters[0].discord_id) : "?" }),
        allowed_mentions: pingUsers(fighters.slice(0, 50).map((f) => f.discord_id)),
      }).catch(() => {});
    }
  }
  if (b.channel_id && b.message_id && dmg > prev) {
    await editMessage(env, b.channel_id, b.message_id, {
      embeds: [bossEmbed(g, b, c, tot.d, tot.n)],
      components: b.status === "active" ? [row(btn(t(g.lang, "boss.fight"), `boss:${b.id}`, 4, "⚔️"))] : [],
    }).catch(() => {});
  }
  return dmg > prev ? t(g.lang, "boss.you_hit", { dmg, left: Math.max(0, b.hp - tot.d), max: b.hp }) : t(g.lang, "boss.no_more", { dmg: prev });
}

// ================================================================ bounty
export interface BountyRow {
  id: number; guild_id: string; challenge_id: number; points: number; coins: number; deadline: number | null;
  channel_id: string | null; message_id: string | null; status: string; winner_id: string | null; created_at: number; claimed_at: number | null;
}

export async function createBounty(env: Env, g: GuildRow, o: { challengeId: number; points: number; coins: number; hours: number | null; channelId?: string | null }) {
  const c = await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ?", o.challengeId);
  if (!c || c.kind === "code") throw new Error("pick a challenge solved in Discord (not a HackerRank problem)");
  const channel = o.channelId || (await strictArena(env, g)) || (await arenaChannel(env, g));
  const deadline = o.hours ? now() + o.hours * 3600 : null;
  const r = await run(env, "INSERT INTO bounties (guild_id, challenge_id, points, coins, deadline, channel_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    g.id, c.id, o.points, o.coins, deadline, channel, now());
  const id = Number(r.meta.last_row_id);
  if (channel) {
    const msg = await send(env, channel, {
      embeds: [{ title: t(g.lang, "bounty.title", { title: c.title }), description: t(g.lang, "bounty.desc", { pts: o.points, coins: o.coins, kind: t(g.lang, `kind.${c.kind}`), level: t(g.lang, `diff.${c.difficulty}`), end: deadline ? ts(deadline) : "—" }), color: COLORS.gold }],
      components: [row(btn(t(g.lang, "bounty.take"), `bty:${id}`, 3, "💰"))],
    }) as any;
    await run(env, "UPDATE bounties SET message_id = ? WHERE id = ?", msg?.id ?? null, id);
  }
  return (await one<BountyRow>(env, "SELECT * FROM bounties WHERE id = ?", id))!;
}

/** First correct solution claims the bounty. */
export async function claimBounty(env: Env, g: GuildRow, bountyId: number, userId: string): Promise<string | null> {
  const b = await one<BountyRow>(env, "SELECT * FROM bounties WHERE id = ? AND guild_id = ?", bountyId, g.id);
  if (!b) return null;
  if (b.deadline && now() > b.deadline) return null;
  const r = await run(env, "UPDATE bounties SET status = 'claimed', winner_id = ?, claimed_at = ? WHERE id = ? AND status = 'open'", userId, now(), b.id);
  if (!r.meta.changes) return t(g.lang, "bounty.too_late");
  if (b.points) await addPoints(env, g, { discordId: userId, amount: b.points, reason: "bounty", ref: b.id });
  if (b.coins) await run(env, "UPDATE players SET coins = coins + ? WHERE guild_id = ? AND discord_id = ?", b.coins, g.id, userId);
  const c = await one<ChallengeRow>(env, "SELECT title FROM challenges WHERE id = ?", b.challenge_id);
  if (b.channel_id) {
    await send(env, b.channel_id, { content: t(g.lang, "bounty.claimed", { user: mention(userId), title: c?.title ?? "?", pts: b.points, coins: b.coins }), allowed_mentions: pingUsers([userId]) }).catch(() => {});
    if (b.message_id) await editMessage(env, b.channel_id, b.message_id, { components: [row(btn(t(g.lang, "bounty.taken"), `bty:${b.id}`, 2, "🏁", true))] }).catch(() => {});
  }
  return t(g.lang, "bounty.you_won", { pts: b.points, coins: b.coins });
}

/** Cron: bosses that escaped, bounties that expired. */
export async function sweepEvents(env: Env) {
  const t0 = now();
  for (const b of await all<BossRow>(env, "SELECT * FROM bosses WHERE status = 'active' AND deadline <= ? LIMIT 3", t0)) {
    const r = await run(env, "UPDATE bosses SET status = 'lost', finished_at = ? WHERE id = ? AND status = 'active'", t0, b.id);
    if (!r.meta.changes) continue;
    const g = await one<GuildRow>(env, "SELECT * FROM guilds WHERE id = ?", b.guild_id);
    const c = await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ?", b.challenge_id);
    const tot = await bossDamage(env, b.id);
    if (g && c && b.channel_id) {
      await send(env, b.channel_id, { content: t(g.lang, "boss.escaped", { name: b.name, left: Math.max(0, b.hp - tot.d), max: b.hp }) }).catch(() => {});
      if (b.message_id) await editMessage(env, b.channel_id, b.message_id, { embeds: [bossEmbed(g, { ...b, status: "lost" }, c, tot.d, tot.n)], components: [] }).catch(() => {});
    }
  }
  for (const b of await all<BountyRow>(env, "SELECT * FROM bounties WHERE status = 'open' AND deadline IS NOT NULL AND deadline <= ? LIMIT 5", t0)) {
    await run(env, "UPDATE bounties SET status = 'expired' WHERE id = ? AND status = 'open'", b.id);
    const g = await one<GuildRow>(env, "SELECT * FROM guilds WHERE id = ?", b.guild_id);
    if (g && b.channel_id && b.message_id) await editMessage(env, b.channel_id, b.message_id, { components: [row(btn(t(g.lang, "bounty.expired"), `bty:${b.id}`, 2, "⌛", true))] }).catch(() => {});
  }
}
