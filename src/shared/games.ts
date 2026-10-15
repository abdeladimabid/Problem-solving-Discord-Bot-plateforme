// 🎮 Class games on the TV + the students' own phones / laptops:
//   royale  Battle Royale quiz: everyone answers the same question, a wrong answer knocks you out, the last one standing
//           wins. Squads: a teammate spends the squad's points to bring someone back.
//   sql     SQL Detective: a mystery in a database; each squad runs real SQL (sql.js in the browser) to find the clues,
//           then names the culprit. The first squad to solve the case wins.
//   relay   Code Relay: each squad member writes the same function in turn (5 min ÷ the squad's size each), without
//           talking (the microphones listen); the tests run on the TV at the end; the most tests passed wins.
// Everything is in D1 and read by polling (no socket): the game row (state, compare-and-set on its seq), one row per
// player, one per squad (its progress) and the answers. Clocks are timestamps, so every screen agrees.
import type { Env, GuildRow } from "./types.ts";
import { addPoints, all, now, one, run } from "./db.ts";
import { COLORS, btn, row, send } from "./discord.ts";
import { signText } from "./integrity.ts";
import { arenaChannel } from "./arena.ts";
import { SQL_CASES, caseForPlayers, checkResult, culpritOk } from "./sqlcases.ts";
import type { SqlCase } from "./sqlcases.ts";
import { generateQuestions, shuffle } from "./battle.ts";
import { RELAY_LANGS, RELAY_TASKS, cleanStoredCase, cleanTask, literal, runRelay, starterFor } from "./gamecontent.ts";
import type { RelayLang, RelayTask } from "./gamecontent.ts";
export { RELAY_TASKS, cleanTask };
import type { BQuestion } from "./battle.ts";

export class GameError extends Error {}
export type GKind = "royale" | "sql" | "relay";
export type GMode = "solo" | "squads" | "random";
export const GAME_KINDS: Record<GKind, { emoji: string; en: string; fr: string; modes: GMode[] }> = {
  royale: { emoji: "👑", en: "Battle Royale quiz", fr: "Battle Royale", modes: ["solo", "squads", "random"] },
  sql: { emoji: "🕵️", en: "SQL Detective", fr: "Détective SQL", modes: ["solo", "squads", "random"] },
  relay: { emoji: "🏃", en: "Code Relay", fr: "Relais de code", modes: ["squads", "random"] },
};
export interface GSquad { name: string; emoji: string; color: string; members: string[] }
export interface GSettings {
  lang: "fr" | "en"; reward: number; announce: boolean; size: number;
  seconds: number; reviveCost: number; maxRevives: number; autoNext: boolean; // royale (autoNext: the next question comes by itself)
  caseId: string; hintPenalty: number; wrongPenalty: number;                  // sql (seconds)
  total: number; rounds: number; noise: boolean; sensitivity: "low" | "medium" | "high"; strikes: number; codeLang: RelayLang;   // relay
}
export interface RQ { prompt: string; code?: string; options: string[]; answer: number; topic?: string }
export interface GState {
  phase: "lobby" | "question" | "reveal" | "playing" | "testing" | "over";
  seq: number; startAt: number | null; rewarded?: boolean;
  // royale
  step?: number; order?: number[]; qAt?: number; qEnd?: number;
  last?: { out: string[]; everyone: boolean; right: number; dist: number[]; final: boolean; wiped?: number[] } | null;
  winners?: string[]; winSquad?: number | null;
  nextAt?: number | null; paused?: boolean;   // royale: when the next question comes by itself (after the answer is shown)
  banned?: string[];   // removed by the teacher: their Discord link doesn't let them back in
  posted?: number;     // when the join button was last posted in Discord
  // sql / relay
  endAt?: number | null; feed?: { at: number; squad: number; text: string }[];
  totalMs?: number; results?: Record<string, { passed: number; total: number; error?: string; details?: { ok: boolean; got: string }[] }>;
  ranking?: number[];
}
export interface GameRow { id: number; guild_id: string; kind: GKind; title: string; mode: GMode; squads: string; settings: string; content: string; state: string; tv_token: string; join_code: string; status: string; created_at: number; updated_at: number; finished_at: number | null }
export interface Player { game_id: number; pid: string; name: string; squad: number; key: string; alive: number; out_step: number | null; score: number; revived: number; mic: number | null; seen: number | null; joined_at: number }

const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const code = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
export const PALETTE: [string, string][] = [["#3b82f6", "🦈"], ["#ef4444", "🔥"], ["#22c55e", "🐍"], ["#a855f7", "🦄"], ["#f59e0b", "🦁"], ["#06b6d4", "🐬"], ["#ec4899", "🦩"], ["#14b8a6", "🐢"], ["#84cc16", "🦖"], ["#f97316", "🦊"], ["#6366f1", "🐺"], ["#eab308", "🐝"]];

// ------------------------------------------------------------------ settings, content
export function cleanSettings(v: any, lang: string): GSettings {
  const n = (x: unknown, d: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(Number(x)) && x !== null && x !== "" ? Number(x) : d));
  return {
    lang: (v?.lang || lang) === "en" ? "en" : "fr", reward: n(v?.reward, 20, 0, 200), announce: v?.announce !== false, size: n(v?.size, 4, 2, 8),
    seconds: n(v?.seconds, 20, 8, 90), reviveCost: n(v?.reviveCost, 3, 1, 20), maxRevives: n(v?.maxRevives, 1, 0, 5), autoNext: v?.autoNext !== false,
    caseId: SQL_CASES.some((c) => c.id === v?.caseId) ? v.caseId : SQL_CASES[0].id, hintPenalty: n(v?.hintPenalty, 60, 0, 600), wrongPenalty: n(v?.wrongPenalty, 120, 0, 900),
    total: n(v?.total, 300, 60, 1800), rounds: n(v?.rounds, 1, 1, 4), noise: v?.noise !== false, sensitivity: ["low", "medium", "high"].includes(v?.sensitivity) ? v.sensitivity : "medium", strikes: n(v?.strikes, 3, 1, 10),
    codeLang: (v?.codeLang && v.codeLang in RELAY_LANGS ? v.codeLang : "javascript") as RelayLang,
  };
}
export function cleanSquads(v: any): GSquad[] {
  const seen = new Set<string>();
  return (Array.isArray(v) ? v : []).slice(0, 20).map((t: any, i: number) => ({
    name: s(t?.name, 30) || `Squad ${i + 1}`, emoji: s(t?.emoji, 8) || PALETTE[i % PALETTE.length][1], color: /^#[0-9a-f]{6}$/i.test(t?.color) ? t.color : PALETTE[i % PALETTE.length][0],
    members: (Array.isArray(t?.members) ? t.members : []).map((x: unknown) => s(x, 25)).filter((x: string) => x && !seen.has(x) && (seen.add(x), true)).slice(0, 40),
  })).filter((t) => t.members.length);
}
/** A royale question: 2 to 4 choices, one right. */
export function cleanRQ(q: any): RQ | null {
  const options = (Array.isArray(q?.options) ? q.options : []).map((o: unknown) => s(o, 120)).filter(Boolean).slice(0, 4);
  const answer = Number(q?.answer);
  const prompt = s(q?.prompt, 300);
  if (!prompt || options.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
  let code = s(q?.code, 700);
  if (code.split("\n").length > 12) code = code.split("\n").slice(0, 12).join("\n");
  return { prompt, ...(code ? { code } : {}), options, answer, ...(q?.topic ? { topic: s(q.topic, 30) } : {}) };
}
/** Squad-battle questions (AI or the bank) → royale questions: the multiple choices and the true/false ones. */
export function fromBattle(list: BQuestion[], lang: "fr" | "en"): RQ[] {
  const out: RQ[] = [];
  for (const q of list) {
    if (q.kind === "mcq" && q.options && q.options.length >= 2) {
      const L = String(q.answer).trim().match(/^([A-Da-d])\s*[·.:)\-]/);
      let idx = L ? "abcd".indexOf(L[1].toLowerCase()) : -1;
      if (idx < 0) idx = q.options.findIndex((o) => o.trim().toLowerCase() === String(q.answer).replace(/^[A-D]\s*[·.:)\-]\s*/i, "").trim().toLowerCase());
      const r = cleanRQ({ prompt: q.prompt, code: q.code, options: q.options, answer: idx, topic: q.topic });
      if (r) out.push(r);
    } else if (q.kind === "truefalse") {
      const yes = /^\s*(vrai|true|oui|yes)/i.test(q.answer), no = /^\s*(faux|false|non|no)\b/i.test(q.answer);
      if (yes === no) continue;
      const r = cleanRQ({ prompt: q.prompt.replace(/^(vrai ou faux|true or false)\s*[:?]\s*/i, ""), code: q.code, options: lang === "en" ? ["True", "False"] : ["Vrai", "Faux"], answer: yes ? 0 : 1, topic: q.topic });
      if (r) out.push(r);
    }
  }
  return out;
}
/** An assessment's multiple-choice questions (one right choice) → royale questions. */
export function fromAssessment(qs: any[]): RQ[] {
  return (Array.isArray(qs) ? qs : []).filter((q) => q?.type === "mcq" && Array.isArray(q.answer) && q.answer.length === 1)
    .map((q) => cleanRQ({ prompt: q.prompt, code: q.code, options: q.choices, answer: q.answer[0] })).filter(Boolean) as RQ[];
}
export async function royaleQuestions(env: Env, o: { topics: string[]; count: number; level: string; lang: "fr" | "en" }): Promise<{ questions: RQ[]; ai: boolean }> {
  const g = await generateQuestions(env, { topics: o.topics, kinds: ["mcq", "truefalse"], count: Math.max(10, Math.min(60, o.count + 6)), level: o.level, lang: o.lang });
  return { questions: fromBattle(g.questions, o.lang).slice(0, o.count), ai: g.ai };
}

// ------------------------------------------------------------------ storage
export const parseGame = (r: GameRow) => ({ ...r, squads: JSON.parse(r.squads) as GSquad[], settings: JSON.parse(r.settings) as GSettings, content: JSON.parse(r.content) as any, state: JSON.parse(r.state) as GState });
export type Game = ReturnType<typeof parseGame>;
const newState = (): GState => ({ phase: "lobby", seq: 1, startAt: null });

export async function createGame(env: Env, g: GuildRow, b: any): Promise<number> {
  const kind = (["royale", "sql", "relay"].includes(b?.kind) ? b.kind : "") as GKind;
  if (!kind) throw new GameError("Pick a game.");
  const mode = (GAME_KINDS[kind].modes.includes(b?.mode) ? b.mode : GAME_KINDS[kind].modes[0]) as GMode;
  const settings = cleanSettings(b?.settings ?? {}, g.lang);
  const squads = mode === "squads" ? cleanSquads(b?.squads) : [];
  if (mode === "squads" && squads.length < (kind === "relay" ? 1 : 2)) throw new GameError("Pick the squads (at least two).");
  let content: any = {};
  if (kind === "royale") {
    const qs = (Array.isArray(b?.questions) ? b.questions : []).map(cleanRQ).filter(Boolean) as RQ[];
    if (qs.length < 3) throw new GameError("At least 3 questions with choices are needed.");
    content = { questions: qs.slice(0, 80) };
  } else if (kind === "sql") {
    if (b?.case) {
      const c = cleanStoredCase(b.case);
      if (!c) throw new GameError("This case isn't complete: check it again.");
      content = { case: c };
    } else content = { caseId: settings.caseId };
  } else {
    const task = b?.task ? cleanTask(b.task, ["ai", "teacher"].includes(b.task?.by) ? b.task.by : "teacher") : RELAY_TASKS[Math.max(0, Math.min(RELAY_TASKS.length - 1, Number(b?.taskIndex) || 0))];
    if (!task) throw new GameError("The challenge needs a function name and at least 2 tests.");
    content = { task };
  }
  const title = s(b?.title, 80) || (kind === "sql" ? (content.case ?? caseOf(content.caseId)).title : kind === "relay" ? `${GAME_KINDS.relay[settings.lang]} · ${content.task.title}` : GAME_KINDS.royale[settings.lang]);
  const t = now();
  const r = await one<{ id: number }>(env, `INSERT INTO games (guild_id, kind, title, mode, squads, settings, content, state, tv_token, join_code, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?) RETURNING id`, g.id, kind, title, mode, JSON.stringify(squads), JSON.stringify(settings), JSON.stringify(content), JSON.stringify(newState()), hex(12), code(), t, t);
  return r!.id;
}
export async function getGame(env: Env, id: number, guildId?: string): Promise<Game | null> {
  const r = await one<GameRow>(env, `SELECT * FROM games WHERE id = ?${guildId ? " AND guild_id = ?" : ""}`, ...(guildId ? [id, guildId] : [id]));
  return r ? parseGame(r) : null;
}
export const caseOf = (id: string): SqlCase => SQL_CASES.find((c) => c.id === id) ?? SQL_CASES[0];
/** The game's case: written / generated (kept with the game) or built-in. */
export const gameCase = (gm: { content: any }): SqlCase => (gm.content?.case as SqlCase) ?? caseOf(gm.content?.caseId);
/** The relay's language and the code the first writer starts from. */
export const relayLang = (gm: { settings: GSettings }): RelayLang => gm.settings.codeLang || "javascript";
export function relayStarter(gm: { settings: GSettings; content: any }): string {
  const t = gm.content.task;
  return t.starter && relayLang(gm) === "javascript" && !t.params ? t.starter : starterFor({ fn: t.fn, params: t.params || [] }, relayLang(gm));
}
/** Saves the state only if nobody saved another one since it was read (compare-and-set on seq). */
async function saveState(env: Env, gm: Game, st: GState, readSeq: number): Promise<boolean> {
  st.seq = readSeq + 1;
  const status = st.phase === "over" ? "done" : st.phase === "lobby" ? "ready" : "live";
  const r = await run(env, "UPDATE games SET state = ?, status = ?, updated_at = ?, finished_at = ? WHERE id = ? AND json_extract(state, '$.seq') = ?",
    JSON.stringify(st), status, now(), st.phase === "over" ? now() : null, gm.id, readSeq);
  const ok = Number(r?.meta?.changes ?? 1) > 0;
  if (ok) { gm.state = st; gm.status = status; }
  return ok;
}
export async function playersOf(env: Env, id: number): Promise<Player[]> {
  return all<Player>(env, "SELECT * FROM game_players WHERE game_id = ? ORDER BY joined_at, name", id);
}
export async function teamsOf(env: Env, id: number): Promise<{ squad: number; data: any; seq: number }[]> {
  return (await all<{ squad: number; data: string; seq: number }>(env, "SELECT squad, data, seq FROM game_teams WHERE game_id = ? ORDER BY squad", id)).map((t) => ({ squad: t.squad, data: JSON.parse(t.data), seq: t.seq }));
}
/** Changes one squad's progress safely (another member may write at the same moment): read, change, compare-and-set. */
async function updateTeam(env: Env, gameId: number, squad: number, fn: (d: any) => any | null): Promise<any | null> {
  for (let i = 0; i < 4; i++) {
    const t = await one<{ data: string; seq: number }>(env, "SELECT data, seq FROM game_teams WHERE game_id = ? AND squad = ?", gameId, squad);
    if (!t) return null;
    const d = fn(JSON.parse(t.data));
    if (d === null) return null;
    const r = await run(env, "UPDATE game_teams SET data = ?, seq = seq + 1 WHERE game_id = ? AND squad = ? AND seq = ?", JSON.stringify(d), gameId, squad, t.seq);
    if (Number(r?.meta?.changes ?? 1) > 0) return d;
  }
  throw new GameError("Too many changes at once: try again.");
}
const teamStart = (kind: GKind, members: string[], set: GSettings): any =>
  kind === "royale" ? { pts: 0 } : kind === "sql" ? { step: 0, times: [], hints: [], wrong: 0, done: null, penalty: 0, lock: 0 } : { order: shuffle(members), code: null, savedAt: null, savedBy: null, turnSaved: -1, strikes: 0, out: false, noise: {}, sens: set.sensitivity };

// ------------------------------------------------------------------ joining
/** A student's own pass to a game (from Discord: /play or the 🎮 button): who they are, signed, valid 12 hours. */
export async function gamePass(env: Env, gameId: number, pid: string, hours = 12): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + hours * 3600;
  return `${pid}.${exp}.${await signText(env, `game:${gameId}.${pid}.${exp}`)}`;
}
export async function readGamePass(env: Env, gameId: number, pass: string): Promise<string | null> {
  const m = String(pass || "").match(/^(\d{1,25})\.(\d{9,11})\.([A-Za-z0-9_-]{32})$/);
  if (!m || Number(m[2]) < Date.now() / 1000) return null;
  const want = await signText(env, `game:${gameId}.${m[1]}.${m[2]}`);
  let diff = want.length ^ m[3].length;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ (m[3].charCodeAt(i) || 0);
  return diff ? null : m[1];
}
/** The student's private link: the play page, with the pass after # (never sent to a server log). */
export async function playLink(env: Env, gm: { id: number; join_code: string }, pid: string) {
  return `${joinUrl(env, gm)}#p=${await gamePass(env, gm.id, pid)}`;
}
/** The 🎮 button in Discord (#arena): each student who clicks it gets their own link. */
export async function postJoin(env: Env, gm: Game) {
  const g = await one<GuildRow>(env, "SELECT * FROM guilds WHERE id = ?", gm.guild_id);
  const ch = g ? await arenaChannel(env, g) : null;
  if (!ch) throw new GameError("No #arena channel to post in: students can type /play in Discord.");
  const fr = gm.settings.lang !== "en";
  await send(env, ch, {
    embeds: [{ title: `${GAME_KINDS[gm.kind].emoji} ${gm.title}`, color: COLORS.purple,
      description: fr ? "La partie va commencer ! Clique sur **🎮 Rejoindre** : tu reçois ton lien personnel (lié à ton compte Discord), ouvre-le sur ton téléphone ou ton PC.\n-# Ou tape `/play`."
        : "The game is about to start! Click **🎮 Join**: you get your own link (linked to your Discord account), open it on your phone or laptop.\n-# Or type `/play`." }],
    components: [row(btn(fr ? "Rejoindre" : "Join", `gjoin:${gm.id}`, 1, "🎮"))],
  });
  await run(env, "UPDATE games SET state = json_set(state, '$.posted', ?) WHERE id = ?", Date.now(), gm.id);
  gm.state.posted = Date.now();
}
export async function playerByKey(env: Env, gameId: number, key: string): Promise<Player | null> {
  if (!key || key.length < 16) return null;
  return one<Player>(env, "SELECT * FROM game_players WHERE game_id = ? AND key = ?", gameId, key.slice(0, 64));
}
/** A student opens their own link from Discord (the pass says who they are): this device plays for them.
 *  The same student on another device: the new device takes over (the old one stops). */
export async function joinGame(env: Env, gm: Game, key: string, pid: string): Promise<Player> {
  if (!key || key.length < 16) throw new GameError("This browser can't join (no key).");
  if ((gm.state.banned ?? []).includes(pid)) throw new GameError("Your teacher removed you from this game.");
  const mine = await playerByKey(env, gm.id, key);
  if (mine && mine.pid === pid) return mine;
  if (mine) await run(env, "UPDATE game_players SET key = ? WHERE game_id = ? AND pid = ?", "x" + key.slice(1, 64) + "-" + Date.now(), gm.id, mine.pid);   // this device was someone else's
  const p = await one<{ name: string | null }>(env, "SELECT name FROM players WHERE guild_id = ? AND discord_id = ?", gm.guild_id, pid);
  if (!p) throw new GameError("You're not in this class: type /link in Discord first.");
  const had = await one<Player>(env, "SELECT * FROM game_players WHERE game_id = ? AND pid = ?", gm.id, pid);
  if (had) {
    await run(env, "UPDATE game_players SET key = ?, seen = ? WHERE game_id = ? AND pid = ?", key.slice(0, 64), now(), gm.id, pid);
    return (await playerByKey(env, gm.id, key))!;
  }
  const late = gm.state.phase !== "lobby";
  if (late && gm.kind === "relay") throw new GameError("The relay has started: wait for the next game.");
  let squad = -1;
  if (gm.mode === "squads") {
    squad = gm.squads.findIndex((q) => q.members.includes(pid));
    if (squad < 0) {
      // not in a squad: the smallest one
      const counts = gm.squads.map((q) => q.members.length);
      squad = counts.indexOf(Math.min(...counts));
      gm.squads[squad].members.push(pid);
      await run(env, "UPDATE games SET squads = ? WHERE id = ?", JSON.stringify(gm.squads), gm.id);
    }
  } else if (gm.mode === "solo") {
    const n = await one<{ n: number }>(env, "SELECT COALESCE(MAX(squad), -1) + 1 AS n FROM game_players WHERE game_id = ?", gm.id);
    squad = n?.n ?? 0;
  } else if (late) {
    // random squads already made: the smallest one
    const counts = gm.squads.map((q) => q.members.length);
    squad = counts.length ? counts.indexOf(Math.min(...counts)) : -1;
    if (squad >= 0) { gm.squads[squad].members.push(pid); await run(env, "UPDATE games SET squads = ? WHERE id = ?", JSON.stringify(gm.squads), gm.id); }
  }
  // royale: whoever comes in after the first question watches (they're out)
  const alive = gm.kind === "royale" && late ? 0 : 1;
  await run(env, "INSERT INTO game_players (game_id, pid, name, squad, key, alive, out_step, joined_at, seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    gm.id, pid, (p.name || pid).slice(0, 40), squad, key.slice(0, 64), alive, alive ? null : 0, Date.now(), now());
  if (gm.mode === "solo" || (late && squad >= 0)) {
    await run(env, "INSERT OR IGNORE INTO game_teams (game_id, squad, data, seq) VALUES (?, ?, ?, 0)", gm.id, squad, JSON.stringify(teamStart(gm.kind, [pid], gm.settings)));
  }
  await bump(env, gm);
  return (await playerByKey(env, gm.id, key))!;
}
// ------------------------------------------------------------------ the teacher's dashboard: reuse a game
/** Everyone leaves: the game is back at the start, ready for another group (they join again with /play). */
export async function clearPlayers(env: Env, gm: Game) {
  for (const t of ["game_moves", "game_teams", "game_players"]) await run(env, `DELETE FROM ${t} WHERE game_id = ?`, gm.id);
  const n = newState(); n.seq = gm.state.seq + 1;   // not posted yet: the TV posts the 🎮 Join button again when it opens
  await run(env, "UPDATE games SET state = ?, status = 'ready', updated_at = ?, finished_at = NULL WHERE id = ?", JSON.stringify(n), now(), gm.id);
  gm.state = n;
}
/** One player leaves (not banned: their link lets them come back). */
export async function removePlayer(env: Env, gm: Game, pid: string) {
  await run(env, "DELETE FROM game_players WHERE game_id = ? AND pid = ?", gm.id, s(pid, 25));
  await run(env, "DELETE FROM game_moves WHERE game_id = ? AND pid = ?", gm.id, s(pid, 25));
  await bump(env, gm);
}
/** Other squads (before the game starts, or after it ends): the players already in are put in their new squad. */
export async function setSquads(env: Env, gm: Game, v: unknown) {
  if (gm.mode !== "squads") throw new GameError("This game isn't played with the class's squads.");
  if (!["lobby", "over"].includes(gm.state.phase)) throw new GameError("Change the squads before the game starts (or once it's over).");
  const squads = cleanSquads(v);
  if (squads.length < 2) throw new GameError("Pick the squads (at least two).");
  const players = await playersOf(env, gm.id);
  for (const p of players) {
    let i = squads.findIndex((q) => q.members.includes(p.pid));
    if (i < 0) { const c = squads.map((q) => q.members.length); i = c.indexOf(Math.min(...c)); squads[i].members.push(p.pid); }
    await run(env, "UPDATE game_players SET squad = ? WHERE game_id = ? AND pid = ?", i, gm.id, p.pid);
  }
  await run(env, "UPDATE games SET squads = ? WHERE id = ?", JSON.stringify(squads), gm.id);
  await run(env, "DELETE FROM game_teams WHERE game_id = ?", gm.id);
  gm.squads = squads;
  await bump(env, gm);
}
/** 🙏 A player who is out asks their squad to bring them back (their teammates see it on their phone). */
export async function pleaRoyale(env: Env, gm: Game, p: Player) {
  if (gm.kind !== "royale" || gm.mode === "solo") throw new GameError("Only in squads.");
  if (p.alive) throw new GameError("You're still in the game!");
  if (gm.state.phase === "over" || gm.state.last?.final) throw new GameError("The game is over.");
  const d = await updateTeam(env, gm.id, p.squad, (x) => ({ ...x, pleas: { ...(x.pleas || {}), [p.pid]: Date.now() } }));
  if (!d) throw new GameError("Your squad isn't in the game.");
  await bump(env, gm);
}

/** Something the TV shows changed (a player joined…): a new seq so the screens reload. */
async function bump(env: Env, gm: Game) {
  await run(env, "UPDATE games SET state = json_set(state, '$.seq', json_extract(state, '$.seq') + 1), updated_at = ? WHERE id = ?", now(), gm.id);
  gm.state.seq++;
}
/** The squads a squad game plays with (solo: one per player). */
export function squadList(gm: Game, players: Player[]): GSquad[] {
  if (gm.mode !== "solo") return gm.squads;
  const out: GSquad[] = [];
  for (const p of players) out[p.squad] = { name: p.name, emoji: PALETTE[p.squad % PALETTE.length][1], color: PALETTE[p.squad % PALETTE.length][0], members: [p.pid] };
  return out;
}

// ------------------------------------------------------------------ the teacher's buttons (on the TV)
export type GAction = { a: "start" } | { a: "reveal" } | { a: "next" } | { a: "hold" } | { a: "stop" } | { a: "kick"; pid: string } | { a: "unban"; pid: string } | { a: "announce" } | { a: "pardon"; squad: number } | { a: "results"; results: any } | { a: "runtests" } | { a: "reset" };
export const COUNTDOWN_MS = 5000, NEXT_MS = 3000;
export async function hostAction(env: Env, gm: Game, x: GAction, at = Date.now()): Promise<Game> {
  const st: GState = structuredClone(gm.state), readSeq = gm.state.seq;
  const players = await playersOf(env, gm.id);
  switch (x.a) {
    case "kick": {
      // the teacher removes a student: out of the game, and their link no longer lets them back in
      const pid = s(x.pid, 25);
      await run(env, "DELETE FROM game_players WHERE game_id = ? AND pid = ?", gm.id, pid);
      await run(env, "DELETE FROM game_moves WHERE game_id = ? AND pid = ?", gm.id, pid);
      for (let i = 0; i < 4; i++) {
        const cur = (await getGame(env, gm.id))!;
        const n = structuredClone(cur.state);
        n.banned = [...new Set([...(n.banned ?? []), pid])];
        if (await saveState(env, cur, n, cur.state.seq)) { Object.assign(gm, cur); return gm; }
      }
      throw new GameError("Too many changes at once: try again.");
    }
    case "unban": {
      const pid = s(x.pid, 25);
      for (let i = 0; i < 4; i++) {
        const cur = (await getGame(env, gm.id))!;
        const n = structuredClone(cur.state);
        n.banned = (n.banned ?? []).filter((b) => b !== pid);
        if (await saveState(env, cur, n, cur.state.seq)) { Object.assign(gm, cur); return gm; }
      }
      throw new GameError("Too many changes at once: try again.");
    }
    case "announce": {
      await postJoin(env, gm);
      await bump(env, gm);
      return gm;
    }
    case "pardon": {
      if (gm.kind !== "relay") throw new GameError("Only in Code Relay.");
      await updateTeam(env, gm.id, Number(x.squad), (d) => { d.strikes = Math.max(0, (d.strikes || 0) - 1); if (d.strikes < gm.settings.strikes) d.out = false; return d; });
      await bump(env, gm);
      return gm;
    }
    case "start": {
      if (st.phase !== "lobby") throw new GameError("The game has started.");
      if (!players.length) throw new GameError("Nobody has joined yet: the students click 🎮 Join in Discord (or type /play).");
      if (gm.mode === "random") {
        const n = Math.max(1, Math.round(players.length / gm.settings.size));
        const mixed = shuffle(players);
        const squads: GSquad[] = Array.from({ length: n }, (_, i) => ({ name: `Squad ${i + 1}`, emoji: PALETTE[i % PALETTE.length][1], color: PALETTE[i % PALETTE.length][0], members: [] }));
        mixed.forEach((p, i) => { squads[i % n].members.push(p.pid); p.squad = i % n; });
        gm.squads = squads;
        await run(env, "UPDATE games SET squads = ? WHERE id = ?", JSON.stringify(squads), gm.id);
        for (const p of mixed) await run(env, "UPDATE game_players SET squad = ? WHERE game_id = ? AND pid = ?", p.squad, gm.id, p.pid);
      }
      if (gm.mode !== "solo") {
        await run(env, "DELETE FROM game_teams WHERE game_id = ?", gm.id);
        for (let i = 0; i < gm.squads.length; i++) {
          const here = players.filter((p) => p.squad === i).map((p) => p.pid);
          if (!here.length) continue;
          await run(env, "INSERT INTO game_teams (game_id, squad, data, seq) VALUES (?, ?, ?, 0)", gm.id, i, JSON.stringify(teamStart(gm.kind, here, gm.settings)));
        }
        if (gm.kind === "relay" && (await teamsOf(env, gm.id)).length < 1) throw new GameError("No squad has a player.");
      }
      st.startAt = at;
      if (gm.kind === "royale") {
        st.order = shuffle(gm.content.questions.map((_: unknown, i: number) => i));
        // a countdown on every screen before the first question (5 s), then 3 s before each next one
        st.step = 1; st.phase = "question"; st.qAt = at + COUNTDOWN_MS; st.qEnd = at + COUNTDOWN_MS + gm.settings.seconds * 1000; st.last = null;
      } else if (gm.kind === "sql") {
        st.phase = "playing"; st.feed = []; st.endAt = null;
      } else {
        st.phase = "playing"; st.totalMs = gm.settings.total * 1000; st.endAt = at + gm.settings.total * 1000 * gm.settings.rounds;
      }
      break;
    }
    case "reveal": {
      if (gm.kind !== "royale" || st.phase !== "question") throw new GameError("No question to reveal.");
      const answered = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM game_moves m JOIN game_players p ON p.game_id = m.game_id AND p.pid = m.pid WHERE m.game_id = ? AND m.step = ? AND p.alive = 1", gm.id, st.step);
      const alive = players.filter((p) => p.alive).length;
      if (at < (st.qEnd ?? 0) && (answered?.n ?? 0) < alive) throw new GameError("Time isn't up yet.");
      return revealRoyale(env, gm, players, at);
    }
    case "next": {
      if (gm.kind !== "royale" || st.phase !== "reveal") throw new GameError("Nothing to go on to.");
      if (st.last?.final) { st.phase = "over"; break; }
      st.step = (st.step ?? 0) + 1; st.phase = "question"; st.qAt = at + NEXT_MS; st.qEnd = at + NEXT_MS + gm.settings.seconds * 1000; st.last = null; st.nextAt = null; st.paused = false;
      break;
    }
    case "hold": {
      // the teacher wants to talk about the answer: the next question waits (and comes 4 s after Resume)
      if (gm.kind !== "royale" || st.phase !== "reveal") throw new GameError("Nothing to pause.");
      st.paused = !st.paused;
      if (!st.paused) st.nextAt = at + 4000;
      break;
    }
    case "runtests": {
      // Python, PHP: every squad's code runs on the code runner (at the same time)
      if (gm.kind !== "relay" || st.phase !== "testing") throw new GameError("The tests aren't running.");
      const teams = await teamsOf(env, gm.id);
      const task: RelayTask = gm.content.task;
      const out = await Promise.all(teams.map(async (t) => [t.squad, t.data.out ? { passed: 0, total: task.tests.length, error: "out", details: [] } : await runRelay(env, relayLang(gm), t.data.code ?? relayStarter(gm), task.fn, task.tests)] as const));
      if (out.some(([, r]) => /ne répond pas/.test(r.error || ""))) throw new GameError("The code runner doesn't answer: click “Run the tests again” in a moment.");
      (x as any).results = Object.fromEntries(out);
    }
    // falls through
    case "results": {
      if (gm.kind !== "relay" || st.phase !== "testing") throw new GameError("The tests aren't running.");
      const res: GState["results"] = {};
      for (const [k, v] of Object.entries((x as any).results ?? {})) {
        const r = v as any;
        res[String(Number(k))] = { passed: Math.max(0, Number(r?.passed) || 0), total: Math.max(0, Number(r?.total) || 0), ...(r?.error ? { error: s(r.error, 200) } : {}),
          details: (Array.isArray(r?.details) ? r.details : []).slice(0, 20).map((d: any) => ({ ok: !!d?.ok, got: s(d?.got, 120) })) };
      }
      st.results = res;
      const teams = await teamsOf(env, gm.id);
      st.ranking = teams.map((t) => t.squad).sort((a, b) => {
        const ta = teams.find((t) => t.squad === a)!.data, tb = teams.find((t) => t.squad === b)!.data;
        return Number(!!ta.out) - Number(!!tb.out) || (res[b]?.passed ?? 0) - (res[a]?.passed ?? 0) || (ta.strikes || 0) - (tb.strikes || 0);
      });
      const top = st.ranking[0];
      st.winSquad = top != null && !teams.find((t) => t.squad === top)!.data.out && (res[top]?.passed ?? 0) > 0 ? top : null;
      st.phase = "over";
      break;
    }
    case "stop": {
      if (st.phase === "over" || st.phase === "lobby") throw new GameError("Nothing to stop.");
      if (gm.kind === "relay" && st.phase === "playing") { st.phase = "testing"; st.endAt = at; break; }
      if (gm.kind === "royale") {
        const alive = players.filter((p) => p.alive);
        st.winners = alive.length ? alive.map((p) => p.pid) : [];
        st.winSquad = gm.mode === "solo" ? null : bestSquad(alive);
      }
      if (gm.kind === "sql") sqlRanking(st, await teamsOf(env, gm.id));
      st.phase = "over";
      break;
    }
    case "reset": {
      // the same game again: everyone stays, the progress starts over
      await run(env, "DELETE FROM game_moves WHERE game_id = ?", gm.id);
      await run(env, "UPDATE game_players SET alive = 1, out_step = NULL, score = 0, revived = 0 WHERE game_id = ?", gm.id);
      if (gm.mode === "solo") {
        for (const p of players) await run(env, "UPDATE game_teams SET data = ?, seq = seq + 1 WHERE game_id = ? AND squad = ?", JSON.stringify(teamStart(gm.kind, [p.pid], gm.settings)), gm.id, p.squad);
      } else await run(env, "DELETE FROM game_teams WHERE game_id = ?", gm.id);
      const n = newState(); n.seq = readSeq; n.banned = st.banned; n.posted = st.posted;
      if (!(await saveState(env, gm, n, readSeq))) throw new GameError("Already done (the screen changed).");
      return gm;
    }
  }
  if (!(await saveState(env, gm, st, readSeq))) throw new GameError("Already done (the screen changed).");
  if (st.phase === "over") await finish(env, gm);
  return gm;
}
function bestSquad(alive: Player[]): number | null {
  const c = new Map<number, number>();
  for (const p of alive) if (p.squad >= 0) c.set(p.squad, (c.get(p.squad) || 0) + 1);
  const best = [...c.entries()].sort((a, b) => b[1] - a[1]);
  return best.length && (best.length === 1 || best[0][1] > best[1][1]) ? best[0][0] : null;
}

// ------------------------------------------------------------------ 👑 royale
async function revealRoyale(env: Env, gm: Game, players: Player[], at: number): Promise<Game> {
  const st: GState = structuredClone(gm.state), readSeq = gm.state.seq;
  const q: RQ = gm.content.questions[st.order![(st.step! - 1) % st.order!.length]];
  const moves = await all<{ pid: string; value: string; ok: number }>(env, "SELECT pid, value, ok FROM game_moves WHERE game_id = ? AND step = ?", gm.id, st.step);
  const alive = players.filter((p) => p.alive);
  const okSet = new Set(moves.filter((m) => m.ok).map((m) => m.pid));
  const right = alive.filter((p) => okSet.has(p.pid));
  const everyone = right.length === 0 && alive.length > 0;    // nobody right: nobody is out
  const out = everyone ? [] : alive.filter((p) => !okSet.has(p.pid));
  const stay = everyone ? alive : right;
  const dist = q.options.map((_, i) => moves.filter((m) => Number(m.value) === i && alive.some((p) => p.pid === m.pid)).length);
  const lastQ = (st.step ?? 0) >= gm.content.questions.length;
  const oneSquadLeft = gm.mode !== "solo" && new Set(stay.map((p) => p.squad)).size <= 1;
  const final = stay.length <= 1 || lastQ || oneSquadLeft;
  // the squads whose last members just fell: wiped out (nobody is left to bring them back)
  const wiped = gm.mode === "solo" ? [] : [...new Set(alive.map((p) => p.squad))].filter((sq) => sq >= 0 && !stay.some((p) => p.squad === sq));
  st.phase = "reveal";
  st.last = { out: out.map((p) => p.pid), everyone, right: right.length, dist, final, wiped };
  // the next question by itself: time to read the answer, to watch the fallen (and the squads wiped out), and, in
  // squads, to bring a teammate back — not more
  const revivable = gm.mode !== "solo" && !final && players.some((p) => !p.alive || out.includes(p)) && stay.length > 0;
  st.nextAt = gm.settings.autoNext !== false ? at + Math.min(20000, 6000 + (out.length ? 2500 : 0) + wiped.length * 3500 + (revivable ? 5000 : 0)) : null;
  st.paused = false;
  if (final) { st.winners = stay.map((p) => p.pid); st.winSquad = gm.mode === "solo" ? null : bestSquad(stay); }
  // the state first (only one request reveals), then the players
  if (!(await saveState(env, gm, st, readSeq))) { const fresh = await getGame(env, gm.id); if (fresh) Object.assign(gm, fresh); return gm; }
  for (const p of out) await run(env, "UPDATE game_players SET alive = 0, out_step = ? WHERE game_id = ? AND pid = ?", st.step, gm.id, p.pid);
  for (const p of right) await run(env, "UPDATE game_players SET score = score + 1 WHERE game_id = ? AND pid = ?", gm.id, p.pid);
  if (gm.mode !== "solo") {
    const per = new Map<number, number>();
    for (const p of right) per.set(p.squad, (per.get(p.squad) || 0) + 1);
    for (const [sq, n] of per) await updateTeam(env, gm.id, sq, (d) => ({ ...d, pts: (d.pts || 0) + n }));
  }
  return gm;
}
export async function answerRoyale(env: Env, gm: Game, p: Player, step: number, choice: number, at = Date.now()) {
  const st = gm.state;
  if (st.phase !== "question" || step !== st.step) throw new GameError("Too late: the answer is on the TV.");
  if (!p.alive) throw new GameError("You're out: watch the TV (a teammate can bring you back).");
  if (at < (st.qAt ?? 0)) throw new GameError("Wait for the question.");
  if (at > (st.qEnd ?? 0) + 1500) throw new GameError("Time's up!");
  const q: RQ = gm.content.questions[st.order![(step - 1) % st.order!.length]];
  if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) throw new GameError("Pick an answer.");
  const r = await run(env, "INSERT OR IGNORE INTO game_moves (game_id, pid, step, value, ok, at) VALUES (?, ?, ?, ?, ?, ?)", gm.id, p.pid, step, String(choice), choice === q.answer ? 1 : 0, at);
  if (Number(r?.meta?.changes ?? 1) === 0) throw new GameError("Your answer is already locked.");
}
/** Squads: an alive player spends the squad's points to bring a teammate back (between two questions). */
export async function reviveRoyale(env: Env, gm: Game, p: Player, target: string) {
  if (gm.mode === "solo") throw new GameError("Only in squads.");
  if (gm.state.phase !== "reveal" || gm.state.last?.final) throw new GameError("You can bring someone back between two questions.");
  if (!p.alive) throw new GameError("You're out too.");
  const t = await one<Player>(env, "SELECT * FROM game_players WHERE game_id = ? AND pid = ?", gm.id, target);
  if (!t || t.squad !== p.squad || t.alive) throw new GameError("Pick a teammate who is out.");
  if (t.revived >= gm.settings.maxRevives) throw new GameError("This teammate was already brought back.");
  const cost = gm.settings.reviveCost;
  const d = await updateTeam(env, gm.id, p.squad, (x) => ((x.pts || 0) >= cost ? { ...x, pts: x.pts - cost } : null));
  if (!d) throw new GameError(`Your squad needs ${cost} points.`);
  await run(env, "UPDATE game_players SET alive = 1, out_step = NULL, revived = revived + 1 WHERE game_id = ? AND pid = ?", gm.id, target);
  await updateTeam(env, gm.id, p.squad, (x) => { const pl = { ...(x.pleas || {}) }; delete pl[target]; return { ...x, pleas: pl }; }).catch(() => null);
  // someone was just brought back: the others get a few seconds more before the next question
  await run(env, "UPDATE games SET state = json_set(state, '$.nextAt', ?) WHERE id = ? AND json_extract(state, '$.nextAt') IS NOT NULL AND json_extract(state, '$.nextAt') < ?", Date.now() + 3000, gm.id, Date.now() + 3000);
  await bump(env, gm);
}

// ------------------------------------------------------------------ 🕵️ sql
function sqlRanking(st: GState, teams: { squad: number; data: any }[]) {
  st.ranking = teams.map((t) => t.squad).sort((a, b) => {
    const A = teams.find((t) => t.squad === a)!.data, B = teams.find((t) => t.squad === b)!.data;
    const fa = A.done ? A.done + A.penalty * 1000 : Infinity, fb = B.done ? B.done + B.penalty * 1000 : Infinity;
    return fa - fb || B.step - A.step || (A.times[A.step - 1] ?? Infinity) - (B.times[B.step - 1] ?? Infinity);
  });
  const top = st.ranking[0];
  st.winSquad = top != null && teams.find((t) => t.squad === top)!.data.done ? top : null;
}
async function feed(env: Env, gm: Game, squad: number, text: string) {
  for (let i = 0; i < 4; i++) {
    const cur = await getGame(env, gm.id);
    if (!cur) return;
    const st = cur.state;
    st.feed = [...(st.feed ?? []), { at: Date.now(), squad, text }].slice(-12);
    if (await saveState(env, cur, st, cur.state.seq)) { gm.state = cur.state; return; }
  }
}
export async function checkSql(env: Env, gm: Game, p: Player, step: number, rows: unknown[][]) {
  if (gm.state.phase !== "playing") throw new GameError(gm.state.phase === "lobby" ? "The investigation hasn't started." : "The investigation is over.");
  const c = gameCase(gm);
  const team = await one<{ data: string }>(env, "SELECT data FROM game_teams WHERE game_id = ? AND squad = ?", gm.id, p.squad);
  if (!team) throw new GameError("You're not in a squad.");
  const d = JSON.parse(team.data);
  if (step !== d.step || step >= c.steps.length) return { ok: false, stale: true, step: d.step };
  const res = checkResult(c.steps[step], Array.isArray(rows) ? rows.slice(0, 200) : []);
  if (!res.ok) return { ...res, step: d.step };
  const nd = await updateTeam(env, gm.id, p.squad, (x) => (x.step === step ? { ...x, step: step + 1, times: [...x.times, Date.now()], by: [...(x.by || []), p.name] } : null));
  if (nd) await feed(env, gm, p.squad, `${c.steps[step].title}`);
  return { ok: true, step: step + 1, found: c.steps[step].found };
}
export async function hintSql(env: Env, gm: Game, p: Player) {
  if (gm.state.phase !== "playing") throw new GameError("The investigation isn't running.");
  const c = gameCase(gm);
  const d = await updateTeam(env, gm.id, p.squad, (x) => (x.step < c.steps.length && !x.hints.includes(x.step) ? { ...x, hints: [...x.hints, x.step], penalty: (x.penalty || 0) + gm.settings.hintPenalty } : x));
  return { hint: d && d.step < c.steps.length ? c.steps[d.step].hint : "" };
}
export async function accuseSql(env: Env, gm: Game, p: Player, name: string) {
  if (gm.state.phase !== "playing") throw new GameError("The investigation isn't running.");
  const c = gameCase(gm);
  const team = await one<{ data: string }>(env, "SELECT data FROM game_teams WHERE game_id = ? AND squad = ?", gm.id, p.squad);
  const d0 = team ? JSON.parse(team.data) : null;
  if (!d0 || d0.step < c.steps.length) throw new GameError("Find every clue first.");
  if (d0.done) return { ok: true, already: true };
  if (d0.lock && Date.now() < d0.lock) throw new GameError(`Wrong accusation: wait ${Math.ceil((d0.lock - Date.now()) / 1000)} s.`);
  const right = culpritOk(c, name);
  await updateTeam(env, gm.id, p.squad, (x) => (right ? { ...x, done: Date.now(), by: [...(x.by || []), p.name] } : { ...x, wrong: (x.wrong || 0) + 1, penalty: (x.penalty || 0) + gm.settings.wrongPenalty, lock: Date.now() + 20000 }));
  await feed(env, gm, p.squad, right ? "🎯 culprit" : "❌ wrong");
  if (right) {
    // everyone done (or the first one, if the teacher wants it quick): the end
    const teams = await teamsOf(env, gm.id);
    if (teams.every((t) => t.data.done)) {
      const cur = (await getGame(env, gm.id))!;
      const st = structuredClone(cur.state);
      sqlRanking(st, teams);
      st.phase = "over";
      if (await saveState(env, cur, st, cur.state.seq)) { Object.assign(gm, cur); await finish(env, gm); }
    }
  }
  return { ok: right, ending: right ? c.ending : "" };
}

// ------------------------------------------------------------------ 🏃 relay
/** Whose turn it is in a squad right now. */
export function relayTurn(gm: Game, order: string[], at: number) {
  const st = gm.state;
  const n = Math.max(1, order.length), total = st.totalMs ?? gm.settings.total * 1000, turnMs = total / n;
  const t = st.startAt == null ? 0 : Math.max(0, Math.floor((at - st.startAt) / turnMs));
  const last = n * gm.settings.rounds - 1;
  const turn = Math.min(t, last);
  return { turn, writer: order[turn % n] ?? null, turnMs, start: (st.startAt ?? at) + turn * turnMs, end: (st.startAt ?? at) + (turn + 1) * turnMs, round: Math.floor(turn / n) + 1, n };
}
export async function saveRelayCode(env: Env, gm: Game, p: Player, turn: number, code: string, at = Date.now()) {
  if (gm.state.phase !== "playing") throw new GameError("The relay isn't running.");
  const t = await one<{ data: string }>(env, "SELECT data FROM game_teams WHERE game_id = ? AND squad = ?", gm.id, p.squad);
  if (!t) throw new GameError("You're not in a squad.");
  const d = JSON.parse(t.data);
  if (d.out) throw new GameError("Your squad is out (too much noise).");
  const cur = relayTurn(gm, d.order, at);
  const prev = turn === cur.turn - 1 && d.order[turn % d.order.length] === p.pid && at - cur.start < 3000 && d.turnSaved < cur.turn;   // the last save, a moment late
  if (!(turn === cur.turn && cur.writer === p.pid) && !prev) throw new GameError("It's not your turn.");
  await updateTeam(env, gm.id, p.squad, (x) => (x.turnSaved > turn ? null : { ...x, code: String(code ?? "").slice(0, 20000), savedAt: at, savedBy: p.pid, turnSaved: turn }));
}
export async function noiseRelay(env: Env, gm: Game, p: Player, at = Date.now()) {
  if (gm.kind !== "relay" || gm.state.phase !== "playing" || !gm.settings.noise) return { strikes: 0, out: false, ignored: true };
  const d = await updateTeam(env, gm.id, p.squad, (x) => {
    if (x.out) return null;
    const lastAt = (x.noise || {})[p.pid] || 0;
    if (at - lastAt < 5000) return null;    // one strike per voice burst
    const strikes = (x.strikes || 0) + 1;
    return { ...x, strikes, out: strikes >= gm.settings.strikes, noise: { ...(x.noise || {}), [p.pid]: at }, lastNoise: { pid: p.pid, name: p.name, at } };
  });
  if (d) await bump(env, gm);
  return d ? { strikes: d.strikes, out: d.out } : { strikes: 0, out: false, ignored: true };
}

export async function tryRelay(env: Env, gm: Game, p: Player, code: string) {
  if (gm.state.phase !== "playing") throw new GameError("The relay isn't running.");
  const d = await updateTeam(env, gm.id, p.squad, (x) => (Date.now() - (x.tryAt || 0) < 8000 ? null : { ...x, tryAt: Date.now() }));
  if (!d) throw new GameError("Wait a few seconds before trying again.");
  const task: RelayTask = gm.content.task;
  return runRelay(env, relayLang(gm), String(code || "").slice(0, 20000), task.fn, task.tests.slice(0, 2));
}

// ------------------------------------------------------------------ the clocks
/** Things that happen by themselves: a royale question whose time is long gone (the TV is closed), the end of the relay. */
export async function liveGame(env: Env, gm: Game, at = Date.now()): Promise<Game> {
  const st = gm.state;
  if (gm.kind === "relay" && st.phase === "playing" && st.endAt && at >= st.endAt) {
    const n = structuredClone(st); n.phase = "testing";
    if (!(await saveState(env, gm, n, st.seq))) { const f = await getGame(env, gm.id); if (f) Object.assign(gm, f); }
  }
  if (gm.kind === "royale" && st.phase === "question" && st.qEnd && at >= st.qEnd + 4000) {
    await revealRoyale(env, gm, await playersOf(env, gm.id), at);
  }
  // the answer was shown long enough: the next question (or the results) by itself — one request does it, the others see it
  if (gm.kind === "royale" && gm.state.phase === "reveal" && gm.state.nextAt && !gm.state.paused && at >= gm.state.nextAt) {
    try { await hostAction(env, gm, { a: "next" }, at); }
    catch (e) { if (!(e instanceof GameError)) throw e; const f = await getGame(env, gm.id); if (f) Object.assign(gm, f); }
  }
  return gm;
}

// ------------------------------------------------------------------ the end
async function finish(env: Env, gm: Game) {
  const st = gm.state;
  if (st.rewarded) return;
  const r = await run(env, "UPDATE games SET state = json_set(state, '$.rewarded', 1) WHERE id = ? AND COALESCE(json_extract(state, '$.rewarded'), 0) = 0", gm.id);
  if (Number(r?.meta?.changes ?? 1) === 0) return;
  st.rewarded = true;
  const g = await one<GuildRow>(env, "SELECT * FROM guilds WHERE id = ?", gm.guild_id);
  if (!g) return;
  const players = await playersOf(env, gm.id);
  let winners: string[] = [];
  if (gm.kind === "royale") winners = st.winSquad != null ? players.filter((p) => p.squad === st.winSquad).map((p) => p.pid) : st.winners ?? [];
  else if (st.winSquad != null) winners = players.filter((p) => p.squad === st.winSquad).map((p) => p.pid);
  const fr = gm.settings.lang !== "en";
  if (gm.settings.reward > 0) for (const pid of winners) await addPoints(env, g, { discordId: pid, amount: gm.settings.reward, reason: "game", ref: gm.id, note: gm.title });
  if (gm.settings.announce && winners.length) {
    const ch = await arenaChannel(env, g);
    const sq = st.winSquad != null ? squadList(gm, players)[st.winSquad] : null;
    if (ch) await send(env, ch, { embeds: [{
      title: `${GAME_KINDS[gm.kind].emoji} ${gm.title}`,
      description: [sq ? `🏆 **${sq.emoji} ${sq.name}** ${fr ? "gagne !" : "wins!"}` : `🏆 ${winners.map((w) => `<@${w}>`).join(" ")} ${fr ? (winners.length > 1 ? "gagnent !" : "gagne !") : (winners.length > 1 ? "win!" : "wins!")}`,
        gm.settings.reward > 0 ? (fr ? `+${gm.settings.reward} points pour ${winners.map((w) => `<@${w}>`).join(" ")}` : `+${gm.settings.reward} points for ${winners.map((w) => `<@${w}>`).join(" ")}`) : ""].filter(Boolean).join("\n"),
      color: COLORS.gold,
    }], allowed_mentions: { parse: [] } }).catch((e) => console.error("game post", e));
  }
}

// ------------------------------------------------------------------ what each screen sees
export function tvUrl(env: Env, gm: { id: number; tv_token: string }) { return `${String(env.PUBLIC_URL || "").replace(/\/$/, "")}/game/${gm.id}.${gm.tv_token}`; }
export function joinUrl(env: Env, gm: { id: number; join_code: string }) { return `${String(env.PUBLIC_URL || "").replace(/\/$/, "")}/play/${gm.id}.${gm.join_code}`; }

export async function tvView(env: Env, gm: Game, at = Date.now()) {
  const st = gm.state;
  const players = await playersOf(env, gm.id);
  const teams = await teamsOf(env, gm.id);
  const squads = squadList(gm, players);
  const base = {
    id: gm.id, kind: gm.kind, mode: gm.mode, title: gm.title, seq: st.seq, now: at, phase: st.phase, startAt: st.startAt, lang: gm.settings.lang, reward: gm.settings.reward,
    join: joinUrl(env, gm), code: gm.join_code,
    squads: squads.map((q, i) => (q ? { i, name: q.name, emoji: q.emoji, color: q.color } : null)),
    players: players.map((p) => ({ pid: p.pid, name: p.name, squad: p.squad, alive: !!p.alive, out: p.out_step, score: p.score, mic: p.mic })),
    winSquad: st.winSquad ?? null, ranking: st.ranking ?? null, posted: st.posted ?? null,
    banned: st.banned?.length ? (await all<{ pid: string; name: string | null }>(env, `SELECT discord_id AS pid, name FROM players WHERE guild_id = ? AND discord_id IN (${st.banned.map(() => "?").join(",")})`, gm.guild_id, ...st.banned)).map((b) => ({ pid: b.pid, name: b.name || b.pid })) : [],
  };
  if (gm.kind === "royale") {
    const qs: RQ[] = gm.content.questions;
    const q = st.order && st.step ? qs[st.order[(st.step - 1) % st.order.length]] : null;
    const answered = st.phase === "question" ? (await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM game_moves WHERE game_id = ? AND step = ?", gm.id, st.step))?.n ?? 0 : 0;
    return { ...base, step: st.step ?? 0, total: qs.length, qAt: st.qAt, qEnd: st.qEnd, seconds: gm.settings.seconds, answered, nextAt: st.phase === "reveal" ? st.nextAt ?? null : null, paused: !!st.paused,
      q: q && (st.phase === "question" || st.phase === "reveal") ? { prompt: q.prompt, code: q.code ?? null, options: q.options, topic: q.topic ?? null, ...(st.phase === "reveal" ? { answer: q.answer } : {}) } : null,
      last: st.phase === "reveal" ? st.last : null, winners: st.winners ?? [], pts: Object.fromEntries(teams.map((t) => [t.squad, t.data.pts || 0])) };
  }
  if (gm.kind === "sql") {
    const c = gameCase(gm);
    return { ...base, case: { title: c.title, story: c.story, steps: c.steps.map((x) => x.title), notions: c.notions }, feed: st.feed ?? [], ending: st.phase === "over" ? c.ending : null,
      teams: teams.map((t) => ({ squad: t.squad, step: t.data.step, times: t.data.times, done: t.data.done, penalty: t.data.penalty || 0, hints: (t.data.hints || []).length, wrong: t.data.wrong || 0 })) };
  }
  const task: RelayTask = gm.content.task;
  return { ...base, task: { title: task.title, text: task.text, fn: task.fn, tests: task.tests.length }, codeLang: relayLang(gm), langName: RELAY_LANGS[relayLang(gm)], endAt: st.endAt, totalMs: st.totalMs ?? gm.settings.total * 1000, rounds: gm.settings.rounds, strikesMax: gm.settings.strikes, noise: gm.settings.noise,
    results: st.results ?? null,
    teams: teams.map((t) => {
      const cur = relayTurn(gm, t.data.order, at);
      return { squad: t.squad, order: t.data.order, writer: st.phase === "playing" ? cur.writer : null, turn: cur.turn, turnStart: cur.start, turnEnd: cur.end, round: cur.round, strikes: t.data.strikes || 0, out: !!t.data.out,
        lines: t.data.code ? String(t.data.code).split("\n").length : 0, lastNoise: t.data.lastNoise ?? null, ...(st.phase === "over" || st.phase === "testing" ? { code: t.data.code ?? "" } : {}) };
    }) };
}
/** One student's screen: never the right answer before the reveal, never another squad's code. */
export async function playerView(env: Env, gm: Game, p: Player, at = Date.now()) {
  const st = gm.state;
  const players = await playersOf(env, gm.id);
  const squads = squadList(gm, players);
  const mates = players.filter((x) => x.squad === p.squad && p.squad >= 0 && gm.mode !== "solo");
  const base = { id: gm.id, kind: gm.kind, mode: gm.mode, title: gm.title, seq: st.seq, now: at, phase: st.phase, lang: gm.settings.lang,
    me: { pid: p.pid, name: p.name, squad: p.squad, alive: !!p.alive, out: p.out_step, score: p.score },
    squad: p.squad >= 0 && squads[p.squad] ? { name: squads[p.squad].name, emoji: squads[p.squad].emoji, color: squads[p.squad].color, mates: mates.map((x) => ({ pid: x.pid, name: x.name, alive: !!x.alive, revived: x.revived })) } : null,
    winSquad: st.winSquad ?? null, players: players.length };
  if (gm.kind === "royale") {
    const qs: RQ[] = gm.content.questions;
    const q = st.order && st.step ? qs[st.order[(st.step - 1) % st.order.length]] : null;
    const mine = st.step ? await one<{ value: string }>(env, "SELECT value FROM game_moves WHERE game_id = ? AND pid = ? AND step = ?", gm.id, p.pid, st.step) : null;
    const team = p.squad >= 0 && gm.mode !== "solo" ? await one<{ data: string }>(env, "SELECT data FROM game_teams WHERE game_id = ? AND squad = ?", gm.id, p.squad) : null;
    return { ...base, step: st.step ?? 0, total: qs.length, qAt: st.qAt, qEnd: st.qEnd, picked: mine ? Number(mine.value) : null, nextAt: st.phase === "reveal" && !st.paused ? st.nextAt ?? null : null,
      q: q && (st.phase === "question" || st.phase === "reveal") ? { prompt: q.prompt, code: q.code ?? null, options: q.options, ...(st.phase === "reveal" ? { answer: q.answer } : {}) } : null,
      last: st.phase === "reveal" ? { out: (st.last?.out ?? []).includes(p.pid), everyone: !!st.last?.everyone, final: !!st.last?.final, wiped: (st.last?.wiped ?? []).includes(p.squad), wipedN: (st.last?.wiped ?? []).length } : null,
      alive: players.filter((x) => x.alive).length, squadsLeft: gm.mode === "solo" ? null : new Set(players.filter((x) => x.alive && x.squad >= 0).map((x) => x.squad)).size,
      pts: team ? JSON.parse(team.data).pts || 0 : 0, reviveCost: gm.settings.reviveCost, maxRevives: gm.settings.maxRevives, winners: st.phase === "over" ? st.winners ?? [] : [],
      // 🙏 who of my squad asked to be brought back (and still is out); the question they fell on
      pleas: team ? Object.keys(JSON.parse(team.data).pleas || {}).filter((pid) => mates.some((m) => m.pid === pid && !m.alive)) : [],
      outStep: p.out_step, revived: p.revived };
  }
  const team = p.squad >= 0 ? await one<{ data: string }>(env, "SELECT data FROM game_teams WHERE game_id = ? AND squad = ?", gm.id, p.squad) : null;
  const d = team ? JSON.parse(team.data) : null;
  if (gm.kind === "sql") {
    const c = gameCase(gm);
    const step = d?.step ?? 0;
    return { ...base, step, steps: c.steps.length, found: c.steps.slice(0, step).map((x) => x.found), hints: (d?.hints || []).filter((h: number) => h === step).length ? c.steps[step]?.hint ?? "" : "",
      done: !!d?.done, penalty: d?.penalty || 0, lock: d?.lock && d.lock > at ? d.lock : null, ending: d?.done || st.phase === "over" ? c.ending : null, rank: st.ranking ? st.ranking.indexOf(p.squad) + 1 : null };
  }
  // relay
  const task: RelayTask = gm.content.task;
  const cur = d ? relayTurn(gm, d.order, at) : null;
  const myIdx = d ? d.order.indexOf(p.pid) : -1;
  const n = d?.order.length || 1;
  let nextTurn: number | null = null;
  if (cur && myIdx >= 0) for (let t = cur.turn; t < n * gm.settings.rounds; t++) if (t % n === myIdx && (t > cur.turn || cur.writer === p.pid)) { nextTurn = t; break; }
  const writing = st.phase === "playing" && !!cur && cur.writer === p.pid && !d?.out;
  const L = relayLang(gm);
  return { ...base, task: { title: task.title, text: task.text, fn: task.fn, examples: task.tests.slice(0, 2), shown: task.tests.slice(0, 2).map((t) => ({ call: `${task.fn}(${t.args.map((a) => literal(a, L)).join(", ")})`, expect: literal(t.expect, L) })) },
    codeLang: L, langName: RELAY_LANGS[L], endAt: st.endAt,
    turn: cur?.turn ?? 0, writer: cur?.writer ?? null, writerName: players.find((x) => x.pid === cur?.writer)?.name ?? null, turnEnd: cur?.end ?? null, turnStart: cur?.start ?? null,
    nextAt: nextTurn != null && cur ? (st.startAt ?? at) + nextTurn * cur.turnMs : null, order: (d?.order || []).map((pid: string) => players.find((x) => x.pid === pid)?.name ?? "?"),
    writing, code: writing || st.phase === "testing" || st.phase === "over" ? d?.code ?? relayStarter(gm) : null, starter: relayStarter(gm),
    strikes: d?.strikes || 0, strikesMax: gm.settings.strikes, out: !!d?.out, noise: gm.settings.noise, sensitivity: gm.settings.sensitivity,
    result: st.results ? st.results[String(p.squad)] ?? null : null, rank: st.ranking ? st.ranking.indexOf(p.squad) + 1 : null };
}
export { caseForPlayers };
export async function listGames(env: Env, g: GuildRow) {
  const rows = await all<GameRow>(env, "SELECT * FROM games WHERE guild_id = ? ORDER BY id DESC LIMIT 60", g.id);
  const counts = new Map((await all<{ id: number; n: number }>(env, "SELECT game_id AS id, COUNT(*) AS n FROM game_players WHERE game_id IN (SELECT id FROM games WHERE guild_id = ?) GROUP BY game_id", g.id)).map((r) => [r.id, r.n]));
  return rows.map((r) => { const x = parseGame(r); return { id: x.id, kind: x.kind, mode: x.mode, title: x.title, status: x.status, phase: x.state.phase, players: counts.get(x.id) || 0, created_at: x.created_at }; });
}
