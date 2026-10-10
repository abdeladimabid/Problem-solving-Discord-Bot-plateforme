// Game rules. Everything you might want to tune lives in RULES.
import type { Difficulty, Entry } from "./types.ts";

export const RULES = {
  dailyMultiplier: 1.5,
  dailyFirstBonus: [15, 10, 5],         // first, second, third solver of the daily
  assignmentOnTimeMultiplier: 1.5,
  codeAnswerTries: 3,                   // SQL and regex answers
  hintFactor: 0.5,                      // using a hint halves the reward
  secondTryFactor: 0.5,                 // typed answer right on the second try = half points
  writeTryStep: 0.15,                   // write-code: -15% per extra submission…
  writeMinFactor: 0.4,                  // …but never below 40%
  writeMaxTries: 5,                     // submissions per write-code challenge (practice)
  speedBonusSeconds: 60,                // quick challenge answered within 60s…
  speedBonusFactor: 0.2,                // …earns +20%
  duelWinFactor: 2,                     // duel winner gets 2x the base points
  duelLoserPoints: 3,                   // a little something for showing up
  teamPoints: { 1: 60, 2: 40, 3: 20 } as Record<number, number>,
  startCoins: 100,
  dailyCoins: 5,                        // coins for solving the daily challenge
  planCoins: 10,                        // coins for finishing the daily plan
  minCoins: 10,
  betWinMultiplier: 3,
  streakRoleContests: 3,                // contests in a row for the streak role
  streakRoleDaily: 5,                   // ...or daily challenges in a row
  outputTries: 2,                       // typed answers get 2 tries; multiple choice gets 1
  duelInviteSeconds: 10 * 60,
  duelSeconds: { quick: 10 * 60, write: 45 * 60, coding: 60 * 60 } as Record<string, number>,
  assignmentReminderSeconds: 24 * 3600,
  aiDailyLimit: 80,                     // AI budget units per day (~10,000 free neurons)
  eloK: 32,
  snapshotCap: 240,
};

// ------------------------------------------------------------ scoring ----
// Points = base(difficulty) x multiplier(type). Teachers can change every
// number from the dashboard (Settings → Scoring); this is the default.
export interface Scoring {
  base: Record<Difficulty, number>;
  mult: Record<string, number>;
  cap: number;                          // max points per student per day from QUICK challenges (practice + duels)
  quick: { full: number; reduced: number; pct: number; lock: boolean };  // per day: `full` quick solves at 100%, the next `reduced` at pct%, then 0; lock = can't pick more until tomorrow
  contest: { first: number; second: number; third: number; top10: number; play: number };
  award: number;                        // contest special awards
}
export const DEFAULT_SCORING: Scoring = {
  base: { easy: 3, medium: 6, hard: 12 },
  mult: { mcq: 1, complexity: 2, output: 3, bug: 5, regex: 3, sql: 6, write: 8, code: 10 },
  cap: 150,
  quick: { full: 3, reduced: 2, pct: 50, lock: true },
  contest: { first: 120, second: 90, third: 70, top10: 40, play: 15 },
  award: 25,
};
export const SCORE_KINDS = ["mcq", "complexity", "output", "bug", "regex", "sql", "write", "code"];

export function scoringOf(g: { scoring?: string | null } | null | undefined): Scoring {
  let o: any = {};
  try { o = g?.scoring ? JSON.parse(g.scoring) : {}; } catch { o = {}; }
  const num = (v: unknown, d: number, max = 100000) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.min(max, n) : d;
  };
  const d = DEFAULT_SCORING;
  return {
    base: { easy: num(o.base?.easy, d.base.easy), medium: num(o.base?.medium, d.base.medium), hard: num(o.base?.hard, d.base.hard) },
    mult: Object.fromEntries(SCORE_KINDS.map((k) => [k, num(o.mult?.[k], d.mult[k], 1000)])),
    cap: num(o.cap, d.cap),
    quick: { full: Math.round(num(o.quick?.full, d.quick.full, 1000)), reduced: Math.round(num(o.quick?.reduced, d.quick.reduced, 1000)), pct: Math.round(num(o.quick?.pct, d.quick.pct, 100)), lock: o.quick?.lock === undefined ? d.quick.lock : o.quick.lock !== false },
    contest: {
      first: num(o.contest?.first, d.contest.first), second: num(o.contest?.second, d.contest.second),
      third: num(o.contest?.third, d.contest.third), top10: num(o.contest?.top10, d.contest.top10), play: num(o.contest?.play, d.contest.play),
    },
    award: num(o.award, d.award),
  };
}

/** Quick types can be answered in seconds, so they're the ones worth limiting. Write code and HackerRank never are. */
export const LIMITED_KINDS = ["mcq", "complexity", "output", "bug", "regex"];
export const isLimitedKind = (kind: string) => LIMITED_KINDS.includes(kind);

/** Seconds until the quick allowance comes back (midnight UTC). */
export const secondsToNextDay = (nowSec = Math.floor(Date.now() / 1000)) => 86400 - (nowSec % 86400);

/** Share of the points a quick solve earns, given how many quick solves (practice + duels) already scored today. */
export function quickFactor(sc: Scoring, solvedToday: number): number {
  if (solvedToday < sc.quick.full) return 1;
  if (solvedToday < sc.quick.full + sc.quick.reduced) return sc.quick.pct / 100;
  return 0;
}

export const basePoints = (sc: Scoring, kind: string, difficulty: Difficulty) =>
  Math.round((sc.base[difficulty] ?? 0) * (sc.mult[kind] ?? 1));

// ------------------------------------------------------------- levels ----
export function levelInfo(total: number) {
  const t = Math.max(0, total);
  const level = Math.floor(Math.sqrt(t / 25)) + 1;
  const cur = 25 * (level - 1) ** 2;
  const next = 25 * level ** 2;
  return { level, cur, next, progress: (t - cur) / (next - cur) };
}

export function titleKey(level: number): string {
  if (level >= 16) return "title.legend";
  if (level >= 12) return "title.wizard";
  if (level >= 8) return "title.hacker";
  if (level >= 5) return "title.coder";
  if (level >= 3) return "title.apprentice";
  return "title.novice";
}

export function progressBar(p: number, width = 10): string {
  const n = Math.max(0, Math.min(width, Math.round(p * width)));
  return "▰".repeat(n) + "▱".repeat(width - n);
}

// --------------------------------------------------------------- elo ----
export function elo(ra: number, rb: number, scoreA: number): [number, number] {
  const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
  const da = Math.round(RULES.eloK * (scoreA - ea));
  return [ra + da, rb - da];
}

// ----------------------------------------------------------- answers ----
export function normalize(s: string): string {
  let v = s.replace(/\r/g, "").replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
  v = v.replace(/\s+/g, " ").toLowerCase();
  return v;
}

function unquote(v: string): string {
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) return v.slice(1, -1);
  return v;
}

export function isCorrectOutput(given: string, answer: string, alternatives: string[] = []): boolean {
  const g = normalize(given);
  for (const a of [answer, ...alternatives]) {
    const n = normalize(a);
    if (g === n || unquote(g) === n || g.replace(/ /g, "") === n.replace(/ /g, "")) return true;
  }
  return false;
}

/** Share of the points kept after each hint step on write-code problems. */
export const HINT_STEPS = [1, 0.85, 0.65, 0.4];

export function pointsFor(sc: Scoring, opts: {
  kind: string;
  difficulty: Difficulty;
  origin: string;
  usedHint: boolean | number;   // hint level: write code has 3 steps (nudge, approach, pseudocode)
  tries: number;
  seconds: number;
  onTime?: boolean;
}): number {
  let p = basePoints(sc, opts.kind, opts.difficulty);
  if (opts.origin === "daily") p *= RULES.dailyMultiplier;
  if (opts.origin === "assignment" && opts.onTime !== false) p *= RULES.assignmentOnTimeMultiplier;
  if (opts.origin === "duel") p *= RULES.duelWinFactor;
  const hint = Number(opts.usedHint) || 0;
  if (hint) p *= opts.kind === "write" ? HINT_STEPS[Math.min(3, hint)] : RULES.hintFactor;
  if (opts.kind === "write") p *= Math.max(RULES.writeMinFactor, 1 - RULES.writeTryStep * (Math.max(1, opts.tries) - 1));
  else if (opts.kind === "sql" || opts.kind === "regex") p *= opts.tries > 1 ? (opts.tries > 2 ? 0.5 : 0.75) : 1;
  else if (opts.tries > 1) p *= RULES.secondTryFactor;
  const quick = opts.kind !== "code" && opts.kind !== "write" && opts.kind !== "sql";
  if (quick && opts.seconds <= RULES.speedBonusSeconds) p *= 1 + RULES.speedBonusFactor;
  return Math.max(1, Math.round(p));
}

// ---------------------------------------------------------- contests ----
export function contestPoints(sc: Scoring, rank: number): number {
  if (rank === 1) return sc.contest.first;
  if (rank === 2) return sc.contest.second;
  if (rank === 3) return sc.contest.third;
  return rank <= 10 ? sc.contest.top10 : sc.contest.play;
}

export function isPhotoFinish(entries: Entry[]): boolean {
  if (entries.length < 2) return false;
  const a = entries[0].score, b = entries[1].score;
  return a > 0 && b >= 0.95 * a;
}

export function ranksFromScores(scores: Record<string, number>): Record<string, number> {
  const vals = Object.values(scores);
  const out: Record<string, number> = {};
  for (const [u, s] of Object.entries(scores)) out[u] = 1 + vals.filter((v) => v > s).length;
  return out;
}

export type Snap = [number, Record<string, number>];

export function addSnapshot(snaps: Snap[], t: number, scores: Record<string, number>, cap = RULES.snapshotCap) {
  snaps.push([t, scores]);
  if (snaps.length > cap) {
    const last = snaps[snaps.length - 1];
    const kept = snaps.filter((_, i) => i % 2 === 0);
    if (kept[kept.length - 1] !== last) kept.push(last);
    snaps.splice(0, snaps.length, ...kept);
  }
}

export interface Award {
  id: string;
  emoji: string;
  u: string;
  detail: Record<string, string | number>;
}

/** Awards that recognise more than first place. Detail values are filled into i18n strings. */
export function computeAwards(
  final: Entry[],
  snaps: Snap[],
  worst: Record<string, number>,
  endTime: number,
  history: { u: string; rank: number; n: number }[][], // previous contests, oldest first
  firstBlood: string | null,
  window = 600,
): Award[] {
  const awards: Award[] = [];
  if (!final.length) return awards;
  const names = new Map(final.map((e) => [e.username.toLowerCase(), e.username]));

  if (firstBlood && names.has(firstBlood.toLowerCase())) {
    awards.push({ id: "first_blood", emoji: "🩸", u: names.get(firstBlood.toLowerCase())!, detail: {} });
  }

  // 📈 biggest climber during the contest
  let best: { e: Entry; gain: number; from: number } | null = null;
  for (const e of final) {
    const w = worst[e.username.toLowerCase()];
    if (w && w - e.rank >= 2 && (!best || w - e.rank > best.gain)) best = { e, gain: w - e.rank, from: w };
  }
  if (best) awards.push({ id: "climber", emoji: "📈", u: best.e.username, detail: { from: best.from, to: best.e.rank, gain: best.gain } });

  // 🌱 most improved vs previous contest (relative position)
  const pct = (r: number, n: number) => (n > 1 ? (r - 1) / (n - 1) : 0);
  let imp: { e: Entry; gain: number; prev: number; nPrev: number } | null = null;
  for (const e of final) {
    const k = e.username.toLowerCase();
    for (let i = history.length - 1; i >= 0; i--) {
      const prev = history[i].find((r) => r.u.toLowerCase() === k);
      if (prev) {
        const gain = pct(prev.rank, prev.n) - pct(e.rank, final.length);
        if (gain >= 0.15 && e.rank < prev.rank && (!imp || gain > imp.gain)) imp = { e, gain, prev: prev.rank, nPrev: prev.n };
        break;
      }
    }
  }
  if (imp) awards.push({ id: "improved", emoji: "🌱", u: imp.e.username, detail: { prev: imp.prev, nPrev: imp.nPrev, now: imp.e.rank, n: final.length } });

  // ⚡ best points per minute (not the winner, at least half the top score)
  const top = final[0].score;
  let speed: { e: Entry; pace: number } | null = null;
  for (const e of final.slice(1)) {
    if (e.time_taken && e.time_taken > 0 && top > 0 && e.score >= top / 2) {
      const pace = e.score / (e.time_taken / 60);
      if (!speed || pace > speed.pace) speed = { e, pace };
    }
  }
  if (speed) awards.push({ id: "speed", emoji: "⚡", u: speed.e.username, detail: { pace: speed.pace.toFixed(1) } });

  // 🦉 biggest rank gain in the final minutes
  const before = snaps.filter((s) => s[0] <= endTime - window);
  if (before.length) {
    const bScores: Record<string, number> = {};
    for (const [u, v] of Object.entries(before[before.length - 1][1])) bScores[u.toLowerCase()] = v;
    const bRanks = ranksFromScores(bScores);
    const n = Object.keys(bRanks).length;
    let clutch: { e: Entry; gain: number; from: number } | null = null;
    for (const e of final) {
      const k = e.username.toLowerCase();
      const br = bRanks[k] ?? n + 1;
      if (e.score > (bScores[k] ?? 0) && br - e.rank >= 1 && (!clutch || br - e.rank > clutch.gain)) {
        clutch = { e, gain: br - e.rank, from: br };
      }
    }
    if (clutch) awards.push({ id: "clutch", emoji: "🦉", u: clutch.e.username, detail: { from: clutch.from, to: clutch.e.rank, min: Math.round(window / 60) } });
  }
  return awards;
}

/** Team score = average member score (absent members count as 0). */
export function teamResults(teams: { id: number; name: string; members: string[] }[], final: Entry[]) {
  const scores = new Map(final.map((e) => [e.username.toLowerCase(), e.score]));
  const rows = teams
    .filter((t) => t.members.length)
    .map((t) => {
      const total = t.members.reduce((s, m) => s + (scores.get(m) ?? 0), 0);
      return { id: t.id, name: t.name, avg: total / t.members.length, present: t.members.filter((m) => scores.has(m)).length, size: t.members.length, rank: 0 };
    })
    .sort((a, b) => b.avg - a.avg);
  for (const r of rows) r.rank = 1 + rows.filter((o) => o.avg > r.avg).length;
  return rows;
}

export function settleBet(pick: string, amount: number, final: Entry[]): { outcome: "won" | "refunded" | "lost"; payout: number } {
  const p = pick.toLowerCase();
  if (final.some((e) => e.rank === 1 && e.username.toLowerCase() === p)) return { outcome: "won", payout: amount * RULES.betWinMultiplier };
  if (final.some((e) => e.rank <= 3 && e.username.toLowerCase() === p)) return { outcome: "refunded", payout: amount };
  return { outcome: "lost", payout: 0 };
}

/** Rivals (owner -> rivals, by HackerRank username) who just overtook their owner. */
export function rivalPasses(
  oldRanks: Record<string, number>,
  newRanks: Record<string, number>,
  pairs: { owner_id: string; owner_hr: string; rival_hr: string }[],
) {
  const out: { owner_id: string; rival_hr: string; ownerRank: number; rivalRank: number }[] = [];
  for (const p of pairs) {
    const ob = oldRanks[p.owner_hr], rb = oldRanks[p.rival_hr];
    const on = newRanks[p.owner_hr], rn = newRanks[p.rival_hr];
    if (ob === undefined || on === undefined || rn === undefined) continue;
    if ((rb === undefined || rb > ob) && rn < on) out.push({ owner_id: p.owner_id, rival_hr: p.rival_hr, ownerRank: on, rivalRank: rn });
  }
  return out;
}

// ------------------------------------------------------------ misc ----
export function dayKey(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(r).padStart(2, "0")}s`;
  return `${r}s`;
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
