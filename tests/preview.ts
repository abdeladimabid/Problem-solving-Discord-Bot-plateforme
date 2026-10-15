// Local preview of the teacher dashboard with a demo class (no Cloudflare needed).
//   npm run preview   → http://localhost:8787
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeEnv } from "./harness.ts";
import admin from "../src/admin/index.ts";
import bot from "../src/bot/index.ts";
import { analyzeLog, fingerprint } from "../src/shared/integrity.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8787);
const { env } = await makeEnv({ DEV_NO_AUTH: "true", PUBLIC_URL: "http://localhost:8787" });
const db = (env.DB as any).raw;
const now = Math.floor(Date.now() / 1000);
const DAY = 86400;

// ---------------------------------------------------------- demo class
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const G = "900000000000000001";
db.prepare("INSERT INTO guilds (id, name, lang, season, arena_channel, announce_channel, daily_channel, daily_hour, created_at) VALUES (?, 'CS 2nd year · Group B', 'en', 'Autumn 2026', 'arena1', 'arena1', 'arena1', 9, ?)").run(G, now - 60 * DAY);
const names = ["Yasmine", "Omar", "Lina", "Mehdi", "Sara", "Adam", "Imane", "Rayan", "Nora", "Ilyas", "Salma", "Zakaria", "Hiba", "Anas"];
const skill = names.map((_, i) => 0.35 + ((i * 37) % 60) / 100);
names.forEach((n, i) => {
  const active = i === 9 ? now - 14 * DAY : now - Math.floor(rnd() * 3 * DAY);
  db.prepare("INSERT INTO players (guild_id, discord_id, name, hr_username, hr_display, coins, rating, daily_streak, last_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(G, String(100 + i), n, i === 13 ? null : n.toLowerCase() + "_hr", i === 13 ? null : n.toLowerCase() + "_hr", 60 + Math.floor(rnd() * 120), 920 + Math.floor(skill[i] * 200), Math.floor(rnd() * 8), active, now - 50 * DAY);
});
db.prepare("UPDATE players SET hr_verified = 1 WHERE guild_id = ? AND hr_username IS NOT NULL AND discord_id != '105'").run(G);
db.prepare("UPDATE players SET hr_code = 'CB-7KQ2' WHERE guild_id = ? AND discord_id = '105'").run(G);
const quick = db.prepare("SELECT id, kind, difficulty FROM challenges WHERE status = 'active' AND (lang = 'en' OR kind = 'code')").all() as any[];
const ins = db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, status, tries, used_hint, verified, points, answer_given, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
const led = db.prepare("INSERT INTO ledger (guild_id, discord_id, hr_username, season, amount, reason, created_at) VALUES (?, ?, ?, 'Autumn 2026', ?, ?, ?)");
const pts: Record<string, number> = { easy: 5, medium: 10, hard: 20 };
names.forEach((_, i) => {
  const id = String(100 + i);
  const n = i === 9 ? 6 : 10 + Math.floor(rnd() * 30);
  for (let k = 0; k < n; k++) {
    const c = quick[Math.floor(rnd() * quick.length)];
    // students 3 and 7 are slipping: their activity is mostly old
    const ageDays = i === 3 || i === 7 ? 14 + rnd() * 30 : i === 9 ? 15 + rnd() * 20 : rnd() * 40;
    const t = now - Math.floor(ageDays * DAY);
    const solved = rnd() < skill[i] + (c.difficulty === "easy" ? 0.2 : c.difficulty === "hard" ? -0.25 : 0);
    const origin = ["practice", "practice", "practice", "daily", "assignment"][Math.floor(rnd() * 5)];
    const p = solved ? (c.kind === "code" ? pts[c.difficulty] * 3 : pts[c.difficulty]) : 0;
    ins.run(G, id, c.id, origin, solved ? "solved" : "failed", solved ? 1 : 2, rnd() < 0.15 ? 1 : 0, c.kind === "code" ? 1 : 0, p, solved ? null : "42", t - 120, t);
    if (p) led.run(G, id, null, p, origin, t);
  }
});
// a self-reported solve waiting for review, and a reported challenge
const code = quick.find((c) => c.kind === "code");
db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, status, verified, points, answer_given, started_at, finished_at) VALUES (?, '104', ?, 'practice', 'claimed', 0, 0, 'https://www.hackerrank.com/challenges/solve-me-first/submissions', ?, ?)").run(G, code.id, now - 7200, now - 3600);

{
  const w = db.prepare("SELECT id FROM challenges WHERE kind = 'write' AND lang = 'en' AND difficulty = 'medium' AND status = 'active' LIMIT 1").get() as any;
  const wi = db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, status, tries, verified, points, answer_given, lang, result, feedback, started_at, finished_at) VALUES (?, ?, ?, 'practice', ?, ?, ?, ?, ?, 'python', ?, ?, ?, ?)");
  wi.run(G, "100", w.id, "solved", 2, 1, 41, "import sys\ndata = sys.stdin.read().split()\nprint(sum(map(int, data[1:])))", JSON.stringify({ verdict: "accepted", passed: 9, total: 9, maxTime: 0.31, judge: "tests" }), null, now - 5000, now - 4000);
  wi.run(G, "101", w.id, "failed", 5, 1, 0, "n = int(input())\na = list(map(int, input().split()))\nbest = 0\nfor i in range(n):\n    for j in range(i, n):\n        best = max(best, sum(a[i:j+1]))\nprint(best)", JSON.stringify({ verdict: "tle", passed: 6, total: 9, maxTime: 0.2, judge: "tests", failed: { idx: 7, sample: false, big: true } }), "Your double loop recomputes sums: O(n³) on 2·10^5 numbers is far too slow. Think about prefix sums.", now - 3000, now - 2000);
}
// ---------------------------------------------------- anti-cheat demo
{
  const ws = db.prepare("SELECT id, title FROM challenges WHERE kind = 'write' AND lang = 'en' AND status = 'active' ORDER BY difficulty, id LIMIT 3").all() as any[];
  const honest = "function solve(s) {\n  let out = \"\";\n  let i = 0;\n  while (i < s.length) {\n    let j = i;\n    while (j < s.length && s[j] === s[i]) j++;\n    out += s[i] + (j - i);\n    i = j;\n  }\n  return out;\n}\n";
  const ai = "function solve(s) {\n  return s.replace(/(.)\\1*/g, (m, c) => c + m.length);\n}\n// reads the input\nconst lines = require('fs').readFileSync(0, 'utf8').split('\\n');\nconsole.log(solve(lines[0].trim()));\n";
  const typed = (code: string, t0: number, cps: number, typos = true) => {
    const ch: any[] = [[0, 0, 0, "", "setValue"]];
    let t = t0, pos = 0;
    for (const c of code) {
      t += 1000 / cps + (c === "\n" ? 900 : 0);
      if (typos && c === "e" && pos % 3 === 0) { ch.push([t, pos, 0, "w", "+input"]); t += 300; ch.push([t, pos, 1, "", "+delete"]); t += 200; }
      ch.push([Math.round(t), pos, 0, c, "+input"]); pos++;
    }
    return { changes: ch, t };
  };
  const h = typed(honest, 4000, 3.2);
  const honestLog = { changes: h.changes, focus: [[60000, "blur"], [71000, "focus"]] as any, pastes: 0, openMs: h.t + 5000, lang: "javascript" };
  const sneaky = { changes: [[0, 0, 0, "", "setValue"], ...typed("function solve(s) {\n", 3000, 4, false).changes.slice(1), [52000, 20, 0, ai.slice(20), "+input"]] as any, focus: [[8000, "blur"], [49000, "focus"], [90000, "blur"], [140000, "focus"]] as any, pastes: 3, openMs: 150000, lang: "javascript" };
  const sess = db.prepare("INSERT INTO sessions (guild_id, title, challenges, team_id, channel_id, starts_at, ends_at, status, created_at) VALUES (?, 'Strings workshop', ?, NULL, NULL, ?, ?, 'active', ?)")
    .run(G, JSON.stringify(ws.map((w) => w.id)), now - 35 * 60, now + 25 * 60, now - 35 * 60);
  const sid = Number(sess.lastInsertRowid);
  db.prepare("INSERT INTO sessions (guild_id, title, challenges, team_id, channel_id, starts_at, ends_at, status, created_at) VALUES (?, 'Loops quiz', ?, NULL, NULL, ?, ?, 'finished', ?)")
    .run(G, JSON.stringify(ws.slice(0, 2).map((w) => w.id)), now - 3 * DAY, now - 3 * DAY + 3600, now - 3 * DAY);
  const ia = db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, ref, status, tries, verified, points, held, answer_given, lang, result, integrity, fp, explain, started_at, finished_at) VALUES (?, ?, ?, 'session', ?, ?, ?, 1, ?, ?, ?, 'javascript', ?, ?, ?, ?, ?, ?)");
  const logIns = db.prepare("INSERT INTO attempt_logs (attempt_id, events, created_at) VALUES (?, ?, ?)");
  const okRes = JSON.stringify({ verdict: "accepted", passed: 10, total: 10, judge: "tests" });
  const add = (who: string, ci: number, status: string, code: string, log: any, pts: number, explain: any, extra: (r: any) => void = () => {}) => {
    const rep: any = analyzeLog(log, code, 0);
    extra(rep);
    rep.level = rep.flags.length >= 3 ? 2 : rep.flags.length ? Math.max(1, rep.level) : 0;
    const r = ia.run(G, who, ws[ci].id, sid, status, status === "solved" ? 1 : 3, pts, 0, code, status === "solved" ? okRes : null, JSON.stringify(rep), fingerprint(code), explain ? JSON.stringify(explain) : null, now - 30 * 60, status === "pending" ? null : now - 10 * 60);
    logIns.run(Number(r.lastInsertRowid), JSON.stringify([{ at: now - 30 * 60, ...log }]), now);
    return Number(r.lastInsertRowid);
  };
  const exGood = { questions: ["What does the variable j hold when the inner while loop stops?", "Why does the outer loop set i = j instead of i++?"], answers: ["the first index where the letter is different", "so we skip the letters already counted, otherwise we'd count them again"], score: 1, feedback: "Clear and correct.", awarded: 9 };
  const exBad = { questions: ["What does the pattern (.)\\1* match in your code?", "Why is m.length the count of the letter?"], answers: ["it matches the string", "idk"], score: 0.25, feedback: "The answers don't show how the regex groups repeated letters.", awarded: 2 };
  add("100", 0, "solved", honest, honestLog, 18, exGood);
  add("102", 0, "solved", honest, typed(honest, 2000, 2.5).changes ? { ...honestLog, changes: typed(honest, 2000, 2.5).changes } : honestLog, 18, null);
  const omar = add("101", 0, "solved", ai, sneaky, 18, exBad);
  const mehdiCode = ai.replace("s.replace", "str.replace").replace(/solve\(s\)/, "solve(str)");
  const mehdi = add("103", 0, "solved", mehdiCode, { ...sneaky, pastes: 1, focus: [] }, 18, null);
  const fixSim = (id: number, other: string, otherId: number, nm: string) => {
    const row = db.prepare("SELECT integrity FROM attempts WHERE id = ?").get(id) as any;
    const rep = JSON.parse(row.integrity);
    rep.similar = [{ attemptId: otherId, discordId: other, name: nm, score: 0.94 }];
    rep.flags.push(`Code very similar to ${nm}'s (94%)`);
    rep.level = 2;
    db.prepare("UPDATE attempts SET integrity = ? WHERE id = ?").run(JSON.stringify(rep), id);
  };
  fixSim(omar, "103", mehdi, "Mehdi");
  fixSim(mehdi, "101", omar, "Omar");
  add("100", 1, "pending", "function solve(n) {\n  ", typed("function solve(n) {\n  ", 1000, 3).changes ? { ...honestLog, changes: typed("function solve(n) {\n  ", 1000, 3).changes } : honestLog, 0, null);
  add("104", 0, "failed", honest.replace("(j - i)", "j"), { ...honestLog, changes: typed(honest.replace("(j - i)", "j"), 1000, 2.8).changes }, 0, null);
  add("104", 1, "solved", honest, { ...honestLog, changes: typed(honest, 1000, 2.8).changes }, 12, exGood);
}
const bug = quick.find((c) => c.kind === "bug");
db.prepare("INSERT INTO reports (guild_id, challenge_id, discord_id, reason, created_at) VALUES (?, ?, '101', 'I think C is also correct?', ?)").run(G, bug.id, now - 5000);
db.prepare("INSERT INTO reports (guild_id, challenge_id, discord_id, reason, created_at) VALUES (?, ?, '106', 'answer looks wrong', ?)").run(G, bug.id, now - 3000);
db.prepare("UPDATE challenges SET status = 'flagged' WHERE id = ?").run(bug.id);
// duels
for (let k = 0; k < 18; k++) {
  const a = Math.floor(rnd() * names.length), b = (a + 1 + Math.floor(rnd() * (names.length - 1))) % names.length;
  const t = now - Math.floor(rnd() * 25 * DAY);
  const w = rnd() < 0.15 ? null : skill[a] + rnd() * 0.3 > skill[b] + rnd() * 0.3 ? a : b;
  db.prepare("INSERT INTO duels (guild_id, channel_id, challenger_id, opponent_id, mode, difficulty, stake, status, winner_id, created_at, started_at, finished_at) VALUES (?, 'c1', ?, ?, ?, ?, ?, 'finished', ?, ?, ?, ?)")
    .run(G, String(100 + a), String(100 + b), rnd() < 0.3 ? "coding" : "quick", ["easy", "medium", "hard"][Math.floor(rnd() * 3)], rnd() < 0.5 ? 10 : 0, w === null ? null : String(100 + w), t, t, t + 300);
  if (w !== null) led.run(G, String(100 + w), null, 20, "duel", t + 300);
}
// teams
for (const [tn, members] of [["Owls", [0, 2, 4, 6, 8, 10, 12]], ["Foxes", [1, 3, 5, 7, 9, 11, 13]]] as const) {
  const r = db.prepare("INSERT INTO teams (guild_id, name) VALUES (?, ?)").run(G, tn);
  for (const m of members) db.prepare("INSERT INTO team_members (team_id, guild_id, discord_id) VALUES (?, ?, ?)").run(Number(r.lastInsertRowid), G, String(100 + m));
}
// three finished contests with replay snapshots
for (let k = 0; k < 3; k++) {
  const end = now - (21 - k * 7) * DAY, start = end - 7200;
  const scores: Record<string, number> = {};
  const snaps: [number, Record<string, number>][] = [];
  for (let s = 0; s <= 24; s++) {
    names.forEach((n, i) => { if (i !== 13 && rnd() < skill[i] * 0.35) scores[n.toLowerCase() + "_hr"] = (scores[n.toLowerCase() + "_hr"] ?? 0) + [10, 20, 30][Math.floor(rnd() * 3)]; });
    snaps.push([start + s * 300, { ...scores }]);
  }
  const r = db.prepare("INSERT INTO contests (guild_id, slug, name, channel_id, start_at, end_at, status, season, snaps, created_at, finished_at) VALUES (?, ?, ?, 'c1', ?, ?, 'finished', 'Autumn 2026', ?, ?, ?)")
    .run(G, `algo-week-${k + 1}`, `Algo Week ${k + 1}`, start, end, JSON.stringify(snaps), start - DAY, end);
  const cid = Number(r.lastInsertRowid);
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([u, sc], i) => {
    const rank = 1 + sorted.filter((x) => x[1] > sc).length;
    const did = String(100 + names.findIndex((n) => n.toLowerCase() + "_hr" === u));
    db.prepare("INSERT INTO contest_results (contest_id, guild_id, hr_username, hr_display, discord_id, rank, score, time_taken, participants) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(cid, G, u, u, did, rank, sc, 1800 + i * 200, sorted.length);
    led.run(G, did, u, rank === 1 ? 50 : rank === 2 ? 35 : rank === 3 ? 25 : rank <= 10 ? 15 : 5, "contest", end);
  });
  db.prepare("INSERT INTO awards (guild_id, contest_id, hr_username, discord_id, award, detail, created_at) VALUES (?, ?, ?, ?, 'climber', '{}', ?)").run(G, cid, sorted[2][0], null, end);
}
// assignments
const asgC = quick.filter((c) => c.kind === "mcq" || c.kind === "output").slice(0, 2);
asgC.forEach((c, j) => {
  const created = now - (5 - j * 3) * DAY;
  names.forEach((_, i) => {
    const st = j === 0 ? (rnd() < skill[i] ? "done" : rnd() < 0.5 ? "missed" : "late") : rnd() < 0.4 ? "done" : "open";
    db.prepare("INSERT INTO assignments (guild_id, challenge_id, discord_id, note, due_at, status, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(G, c.id, String(100 + i), j === 0 ? "Revise dictionaries before you start" : null, created + 3 * DAY, st, created, st === "open" || st === "missed" ? null : created + DAY);
  });
});

// events: a live quiz, a boss, bounties, shop and help activity
{
  const mc = db.prepare("SELECT id, answer FROM challenges WHERE kind = 'mcq' AND lang = 'en' LIMIT 5").all() as any[];
  const wr = db.prepare("SELECT id FROM challenges WHERE kind = 'write' AND lang = 'en' AND difficulty = 'hard' LIMIT 2").all() as any[];
  const qz = db.prepare("INSERT INTO quizzes (guild_id, title, channel_id, questions, seconds, current, q_started, revealed, give_points, status, created_at) VALUES (?, 'Friday quiz: complexity', 'arena1', ?, 20, 2, ?, 0, 1, 'live', ?)")
    .run(G, JSON.stringify(mc.map((c) => c.id)), Math.floor(Date.now() / 1000) - 6, now - 600);
  const qid = Number(qz.lastInsertRowid);
  for (let i = 0; i < 9; i++) for (let k = 0; k < 3; k++) {
    const right = rnd() < 0.4 + skill[i] * 0.5, ms = Math.floor(2000 + rnd() * 15000);
    const ans = right ? mc[k].answer : "ABCD".replace(mc[k].answer, "")[Math.floor(rnd() * 3)];
    db.prepare("INSERT INTO quiz_answers (quiz_id, q_idx, discord_id, answer, correct, ms, score) VALUES (?, ?, ?, ?, ?, ?, ?)").run(qid, k, String(100 + i), ans, right ? 1 : 0, ms, right ? 500 + Math.round(500 * (1 - ms / 20000)) : 0);
  }
  const b1 = Number(db.prepare("INSERT INTO bosses (guild_id, challenge_id, name, hp, deadline, reward, coins, channel_id, status, created_at) VALUES (?, ?, 'The Null Pointer', 240, ?, 30, 20, 'arena1', 'active', ?)").run(G, wr[0].id, now + 30 * 3600, now - 18 * 3600).lastInsertRowid);
  [40, 40, 26, 40, 12, 33].forEach((d, i) => db.prepare("INSERT INTO boss_hits (boss_id, discord_id, damage, updated_at) VALUES (?, ?, ?, ?)").run(b1, String(100 + i), d, now - i * 3000));
  const b2 = Number(db.prepare("INSERT INTO bosses (guild_id, challenge_id, name, hp, deadline, reward, coins, channel_id, status, created_at, finished_at) VALUES (?, ?, 'Segfault Dragon', 120, ?, 25, 15, 'arena1', 'won', ?, ?)").run(G, wr[1].id, now - 5 * DAY, now - 7 * DAY, now - 6 * DAY).lastInsertRowid);
  [40, 40, 40, 22].forEach((d, i) => db.prepare("INSERT INTO boss_hits (boss_id, discord_id, damage, updated_at) VALUES (?, ?, ?, ?)").run(b2, String(103 + i), d, now - 6 * DAY));
  db.prepare("INSERT INTO bounties (guild_id, challenge_id, points, coins, deadline, channel_id, status, winner_id, created_at, claimed_at) VALUES (?, ?, 40, 30, NULL, 'arena1', 'claimed', '102', ?, ?)").run(G, mc[3].id, now - 2 * DAY, now - 2 * DAY + 400);
  db.prepare("INSERT INTO bounties (guild_id, challenge_id, points, coins, deadline, channel_id, status, created_at) VALUES (?, ?, 60, 40, ?, 'arena1', 'open', ?)").run(G, wr[0].id, now + 20 * 3600, now - 4 * 3600);
  for (const [item, cost, n] of [["freeze", 60, 4], ["hint", 30, 9], ["title", 100, 2], ["color", 200, 1]] as const) for (let k = 0; k < n; k++) db.prepare("INSERT INTO purchases (guild_id, discord_id, item, cost, created_at) VALUES (?, ?, ?, ?, ?)").run(G, String(100 + k), item, cost, now - k * DAY);
}

// discord lookups used by the settings page
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "discord.com") {
    if (url.pathname.endsWith("/channels")) return Response.json([{ id: "c1", name: "general", type: 0, position: 0 }, { id: "c2", name: "contests", type: 0, position: 1 }, { id: "c3", name: "daily-challenge", type: 0, position: 2 }]);
    if (url.pathname.endsWith("/roles")) return Response.json([{ id: "r1", name: "👑 Champion", position: 3 }, { id: "r2", name: "🔥 On Fire", position: 2 }]);
    return Response.json({ id: "x" });
  }
  return realFetch(input, init);
}) as typeof fetch;

env.ASSETS = {
  async fetch(req: Request) {
    let p = new URL(req.url).pathname;
    if (p === "/") p = "/index.html";
    const file = join(ROOT, "public", p);
    if (!existsSync(file)) return new Response("not found", { status: 404 });
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
    return new Response(readFileSync(file), { headers: { "content-type": (types[extname(file)] ?? "application/octet-stream") + "; charset=utf-8" } });
  },
};


// ------------------------------------------- help queue, questions, interviews, projects, league
{
  const hand = db.prepare("INSERT INTO hands (guild_id, discord_id, name, question, code, status, created_at, taken_at, done_at, reply) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  hand.run(G, "102", "Lina", "My program prints the right answer for the example but fails the hidden tests. Why?", "n = int(input())\na = list(map(int, input().split()))\nprint(max(a) - min(a))", "helping", now - 420, now - 60, null, null);
  hand.run(G, "106", "Imane", "How do I read several lines until the end of the input in PHP?", null, "waiting", now - 300, null, null, null);
  hand.run(G, "108", "Nora", "I don't understand what 'consecutive' means in Best streak.", null, "waiting", now - 95, null, null, null);
  hand.run(G, "101", "Omar", "Is recursion allowed?", null, "done", now - 7200, now - 7000, now - 6900, "Yes! Just watch the recursion depth for big inputs.");
  const fq = db.prepare("INSERT INTO faq (guild_id, question, answer, draft, asked_by, askers, status, hits, created_at, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  fq.run(G, "What is the difference between a for loop and a while loop?", null, "A `for` loop repeats a known number of times (or over a list); a `while` loop repeats as long as a condition is true. Use `for` when you know how many steps, `while` when you wait for something to change.", "103", JSON.stringify(["103", "107"]), "pending", 0, now - 3600, null);
  fq.run(G, "Why does my JavaScript code print undefined?", null, null, "110", JSON.stringify(["110"]), "pending", 0, now - 600, null);
  fq.run(G, "When is the next exam?", "Friday 9:00, room B12. Bring your student card.", null, null, "[]", "approved", 12, now - 9 * DAY, now - 9 * DAY);
  fq.run(G, "How do I read input in PHP?", "Use `fgets(STDIN)` for one line, or `stream_get_contents(STDIN)` for everything, then `explode` it.", null, "106", JSON.stringify(["106"]), "approved", 7, now - 5 * DAY, now - 5 * DAY);
  const w = db.prepare("SELECT id FROM challenges WHERE kind = 'write' AND lang = 'en' AND difficulty = 'easy' AND status = 'active' LIMIT 1").get() as any;
  const ivs = [["100", 4.5, "Strong hire 🌟"], ["104", 3.3, "Almost there 🙂"], ["102", 2.3, "Not yet: keep practicing 💪"]] as const;
  for (const [i, [uid, overall, verdict]] of ivs.entries()) {
    const a = db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, status, tries, started_at, finished_at) VALUES (?, ?, ?, 'interview', ?, 1, ?, ?)").run(G, uid, w.id, i === 0 ? "solved" : "expired", now - (i + 1) * DAY, now - (i + 1) * DAY + 1500);
    const sc = { problem: Math.round(overall), communication: Math.min(5, Math.round(overall) + 1), code: i === 0 ? 5 : 2, complexity: Math.max(1, Math.round(overall) - 1), overall, verdict, strengths: "You explained your plan before coding.", improve: "State the complexity before you start.", ai: i === 0 };
    db.prepare("INSERT INTO interviews (guild_id, discord_id, challenge_id, attempt_id, transcript, stage, status, scores, created_at, finished_at) VALUES (?, ?, ?, ?, ?, 3, 'done', ?, ?, ?)")
      .run(G, uid, w.id, Number(a.lastInsertRowid), JSON.stringify([{ who: "ai", text: "Hi! Tell me how you would solve it." }, { who: "me", text: "I keep the best sum ending at each position." }, { who: "ai", text: "What if every number is negative?" }, { who: "me", text: "I start from the first element, so it still works. O(n) time, O(1) memory." }]), JSON.stringify(sc), now - (i + 1) * DAY, now - (i + 1) * DAY + 1600);
  }
  // ---- learning: GitHub links and activity, briefs (hand-ins, debriefs), competencies, an assessment
  const ghNames = ["yasmine-dev", "omar99", "lina-b", "mehdi-codes", "sara-codes", "adam-r", "imane-w", "rayan-x", "nora-k", "ilyas-m", "salma-z"];
  ghNames.forEach((login, i) => db.prepare("UPDATE players SET github_id = ?, github_login = ?, gh_inst = ?, gh_linked_at = ? WHERE guild_id = ? AND discord_id = ?").run(String(9000 + i), login, String(70000 + i), now - 20 * DAY, G, String(100 + i)));
  const act = db.prepare("INSERT INTO gh_activity (guild_id, discord_id, delivery, day, t, repo, commits, real, tiny, flagged, bad, lines, prs, other) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  let dl = 0;
  ghNames.forEach((login, i) => {
    for (let d = 0; d < 14; d++) {
      if (i === 9 || (i === 4 && d < 5) || rnd() < 0.3 + (i % 3) * 0.1) continue;
      const t = now - d * DAY - Math.floor(rnd() * 20000), c = 1 + Math.floor(rnd() * 5);
      act.run(G, String(100 + i), "d" + dl++, new Date(t * 1000).toISOString().slice(0, 10), t, `${login}/${d > 6 ? "hammam-andalous" : "tailwind-landing"}`, c, Math.max(0, c - (rnd() < 0.2 ? 1 : 0)), rnd() < 0.2 ? 1 : 0, i === 7 && d === 2 ? 1 : 0, rnd() < 0.15 ? 1 : 0, 20 + Math.floor(rnd() * 300), rnd() < 0.15 ? 1 : 0, 0);
    }
  });
  // each commit (the student page's GitHub tab)
  const MSGS = ["feat: header with logo and navigation", "update", "add hero section with background image", "fix", "style: responsive grid for the services cards", "wip", "feat: contact form with validation", "aaa",
    "docs: README with screenshots", "refactor: CSS variables for the colors", "add footer links", "fix: burger menu not closing on mobile", "Update index.html", "feat: tarifs page with table", "commit", "add images", "feat: smooth scroll and active link"];
  const glog = db.prepare("INSERT OR IGNORE INTO gh_log (guild_id, id, discord_id, kind, repo, branch, t, title, size, bad, flags, adds, dels, files, action, url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  ghNames.forEach((login, i) => {
    for (let d = 0; d < 34; d++) {
      if (i === 9 || rnd() < 0.35) continue;
      const n = 1 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const t = now - d * DAY - Math.floor(rnd() * 50000), msg = MSGS[Math.floor(rnd() * MSGS.length)];
        const bad = /^(update|fix|wip|aaa|commit|Update index\.html)$/.test(msg) ? 1 : 0;
        const huge = i === 7 && d === 2 && k === 0;
        const adds = huge ? 4820 : bad && rnd() < 0.6 ? 1 : 5 + Math.floor(rnd() * 160), dels = huge ? 3 : Math.floor(rnd() * 30 * (adds > 2 ? 1 : 0));
        const size = msg.startsWith("docs") ? "docs" : adds + dels <= 2 ? "tiny" : "real";
        const sha = Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(rnd() * 16)]).join("");
        const repo = `${login}/${d > 12 ? "hammam-andalous" : "tailwind-landing"}`;
        glog.run(G, sha, String(100 + i), "commit", repo, "main", t, huge ? "add project" : msg, size, bad, huge ? "huge" : null, adds, dels, 1 + Math.floor(rnd() * 4), null, `https://github.com/${repo}/commit/${sha}`);
      }
      if (rnd() < 0.12) glog.run(G, `pr:${login}/tailwind-landing#${d}:merged`, String(100 + i), "pr", `${login}/tailwind-landing`, "feature/contact", now - d * DAY, "Contact page", null, 0, null, 140, 12, 4, "merged", `https://github.com/${login}/tailwind-landing/pull/${d}`);
    }
  });
  // Settings → AI keys: two AIs for this class, the first one hit its limit an hour ago
  db.prepare("INSERT OR REPLACE INTO app_settings (k, v, updated_at) VALUES (?, ?, ?)").run(`ai:${G}`, JSON.stringify({ providers: [
    { id: "p1", type: "groq", key: "gsk_preview" + "x".repeat(40), model: "openai/gpt-oss-120b" }, { id: "p2", type: "gemini", key: "AIza-preview-" + "y".repeat(28), model: "gemini-2.5-flash" }] }), now);
  db.prepare("INSERT OR REPLACE INTO app_settings (k, v, updated_at) VALUES (?, ?, ?)").run(`aist:${G}`, JSON.stringify({ p1: { err: "limit reached (429): Rate limit reached for model openai/gpt-oss-120b, tokens per day", errAt: now - 3600 }, p2: { err: null, okAt: now - 600 } }), now);
  db.prepare("INSERT OR REPLACE INTO gh_summaries (guild_id, discord_id, data, at) VALUES (?, ?, ?, ?)").run(G, "100", JSON.stringify({
    overview: "Yasmine worked on two sites: the Hammam showcase, then a Tailwind landing page. Steady pushes most days, mostly real steps, but about a quarter of the messages say nothing.",
    repos: [{ repo: "yasmine-dev/hammam-andalous", features: [{ title: "Header with logo and navigation", commits: [], status: "done" }, { title: "Responsive services grid", commits: [], status: "done" }, { title: "Tarifs page with a price table", commits: [], status: "in progress" }] },
      { repo: "yasmine-dev/tailwind-landing", features: [{ title: "Contact form with validation", commits: [], status: "done" }, { title: "Burger menu on mobile", commits: [], status: "done" }, { title: "Smooth scroll with the active link", commits: [], status: "done" }] }],
    brief: [{ brief: "Hammam Al Andalous", requirement: "Une page Tarifs avec les prestations et leurs prix", status: "partial", evidence: "“feat: tarifs page with table”, then nothing" }, { brief: "Hammam Al Andalous", requirement: "Formulaire de réservation", status: "done", evidence: "contact form commits" }, { brief: "Hammam Al Andalous", requirement: "Mise en ligne sur GitHub Pages", status: "no sign", evidence: "no deploy commit" }],
    habits: { good: ["Pushes most working days", "Separates features into their own commits"], improve: ["Write what changed: “fix: burger menu not closing” instead of “fix”", "Avoid “wip” commits on main"] }, days: 30, model: "preview" }), now - 3600);
  const { saveBrief } = await import("../src/shared/briefs.ts");
  const { finalizeReview } = await import("../src/shared/learning.ts");
  const { buildComment } = await import("../src/shared/review/engine.ts");
  const gRow = db.prepare("SELECT * FROM guilds WHERE id = ?").get(G);
  const stories = (role: string, xs: string[]) => ({ title: role, emoji: role === "Visiteur" ? "👤" : "🛠️", stories: xs });
  const b1 = await saveBrief(env as any, gRow, null, { program: "builtin:dwwm-2026", week: 1, status: "assigned", source: "ai", data: {
    title: "Hammam Al Andalous : site vitrine multi-pages", summary: "Intégrer le site vitrine d’un hammam traditionnel de Safi à partir de sa maquette Figma.", tags: ["HTML", "CSS", "Figma", "Git"],
    context: "Le hammam Al Andalous, à Safi, veut un site simple pour présenter ses soins, ses horaires et permettre de le contacter.",
    groups: [stories("Visiteur", ["En tant que visiteur, je vais consulter la page d’accueil afin de découvrir le hammam.", "En tant que visiteur, je vais voir la liste des soins et leurs prix afin de choisir.", "En tant que visiteur, je vais remplir le formulaire de contact afin de réserver.", "En tant que visiteur, je vais trouver le plan d’accès afin de venir sur place."])],
    bonus: ["Ajouter une animation CSS sur les cartes de soins."], modalities: { days: 5, mode: "individuel", start: "2026-10-05", due: "2026-10-09", text: "" },
    evaluation: { minutes: 15, parts: [{ minutes: 5, label: "Démonstration" }, { minutes: 10, label: "Mise en situation" }] },
    deliverables: ["Lien du dépôt GitHub", "Lien GitHub Pages", "Lien de la maquette Figma"], criteria: ["Le site respecte la maquette", "Le HTML est sémantique et valide (W3C)", "Le site est responsive (mobile, tablette, desktop)"],
    situation: { title: "Intégrateur web junior", need: "Le client attend un site en ligne avant l’ouverture de la saison." }, competencies: ["C1N1", "C2N1", "C3N1", "T1N1", "T5N1"], resources: ["https://developer.mozilla.org/fr/docs/Web/HTML"] } });
  db.prepare("UPDATE briefs SET grid = ? WHERE id = ?").run(JSON.stringify({ items: [
    { type: "story", texte: "Page d’accueil qui présente le hammam", verif: ["pages"] }, { type: "story", texte: "Page des soins avec les prix" }, { type: "story", texte: "Formulaire de contact", verif: ["form"] },
    { type: "story", texte: "Plan d’accès", verif: ["map"] }, { type: "technique", texte: "HTML sémantique", verif: ["semantic"] }, { type: "critere", texte: "Responsive", verif: ["responsive"] },
    { type: "livrable", texte: "Site en ligne sur GitHub Pages", verif: ["pages_site"] }, { type: "bonus", texte: "Animation CSS", verif: ["anim"] }], tech: "HTML, CSS", by: "ai", at: Date.now() }), b1);
  const handIn = db.prepare("INSERT INTO brief_handins (brief_id, guild_id, who, repo, plan, at, by) VALUES (?, ?, ?, ?, ?, ?, ?)");
  [0, 1, 2, 3, 5, 6, 8].forEach((i) => handIn.run(b1, G, `u:${100 + i}`, `${ghNames[i]}/hammam-andalous`, i === 0 ? "https://trello.com/b/AbC123xy/hammam" : null, now - 2 * DAY - i * 3000, "student"));
  const rec = (first: string, good: boolean) => {
    const checks = [
      { id: "pages", label: "Site multipage", ok: true, detail: "4 page(s) : index.html, soins.html, contact.html, acces.html" },
      { id: "semantic", label: "Balises sémantiques", ok: good, detail: good ? "header, nav, main, footer" : "seulement des <div>" },
      { id: "form", label: "Formulaire", ok: true, detail: "contact.html : 4 champs, bouton envoyer" },
      { id: "map", label: "Plan d’accès (carte)", ok: good, detail: good ? "iframe Google Maps dans acces.html" : "aucune carte trouvée" },
      { id: "responsive", label: "Responsive", ok: good, detail: good ? "3 media queries, viewport" : "pas de media query" },
      { id: "pages_site", label: "Site en ligne (GitHub Pages…)", ok: true, detail: "https://" + first.toLowerCase() + ".github.io/hammam-andalous" },
      { id: "anim", label: "Animation ou transition CSS", ok: false, detail: "aucune animation" },
      { id: "docs", label: "README / documentation", info: true, detail: "README de 3 lignes" }];
    const ex = [
      { type: "story", texte: "Page d’accueil qui présente le hammam", statut: "fait", preuve: "index.html : hero, présentation, horaires", check: "pages" },
      { type: "story", texte: "Page des soins avec les prix", statut: good ? "fait" : "partiel", preuve: good ? "soins.html : 6 cartes avec prix" : "soins.html : prix manquants" },
      { type: "story", texte: "Formulaire de contact", statut: "fait", preuve: "contact.html", check: "form" },
      { type: "story", texte: "Plan d’accès", statut: good ? "fait" : "absent", preuve: good ? "acces.html : carte" : "page vide", check: "map" },
      { type: "technique", texte: "HTML sémantique", statut: good ? "fait" : "absent", preuve: "", check: "semantic" },
      { type: "critere", texte: "Responsive", statut: good ? "fait" : "absent", preuve: "", check: "responsive" },
      { type: "livrable", texte: "Site en ligne sur GitHub Pages", statut: "fait", preuve: "", check: "pages_site" },
      { type: "bonus", texte: "Animation CSS", statut: "absent", preuve: "", check: "anim" }];
    const r: any = { at: Date.now() - 3600000, first, model: "openai/gpt-oss-120b", brief: "Hammam Al Andalous", repos: [first.toLowerCase() + "/hammam-andalous"], count: good ? 23 : 9, files: true, checks, skills: ["C1", "C2", "C3", "T1", "T5"],
      result: { resume: good ? "Un site complet et fidèle à la maquette, bien structuré. Le bonus n’est pas fait." : "Les pages principales existent mais le site n’est pas responsive et le HTML n’est pas sémantique.",
        commits: [{ sha: "a1b2c3d", repo: "x", msg: "feat: page soins", ok: true, note: "message clair" }, { sha: "e4f5a6b", repo: "x", msg: "update", ok: false, note: "message trop vague" }],
        forts: good ? ["Structure claire des pages", "Commits réguliers"] : ["Formulaire complet"], ameliorer: good ? ["Ajouter des transitions"] : ["Media queries", "Balises sémantiques", "Messages de commit"],
        exigences: ex, competences: [{ code: "C1", avis: "validable", raison: "Dépôt Git propre, site déployé." }, { code: "C2", avis: good ? "validable" : "a_verifier", raison: "Maquette Figma liée dans le README." },
          { code: "C3", avis: good ? "validable" : "non_visible", raison: good ? "Intégration fidèle et responsive." : "Pas responsive, HTML non sémantique." }, { code: "T1", avis: "a_verifier", raison: "Trello présent." }, { code: "T5", avis: "a_verifier", raison: "À voir à l’oral." }], feedback: "" },
      challenge: good ? { titre: "Ajouter un soin dans la grille", consigne: "Ajoute une carte « Gommage au savon noir » dans soins.html, avec le même style que les autres, et vérifie qu’elle passe à la ligne sur mobile.", duree: "10 minutes", niveau: 1, observer: ["La carte reprend les classes existantes", "Le rendu mobile reste correct"], item: 1, point: "Page des soins avec les prix", done: true, at: Date.now(), result: "valide", note: "" } : null };
    r.result.feedback = buildComment(first, r, undefined);
    return r;
  };
  const putRev = db.prepare("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, updated_at) VALUES (?, ?, ?, ?, 'draft', ?)");
  putRev.run(b1, G, "u:100", JSON.stringify(rec("Yasmine", true)), now);
  putRev.run(b1, G, "u:101", JSON.stringify(rec("Omar", false)), now);
  putRev.run(b1, G, "u:102", JSON.stringify(rec("Lina", true)), now);
  for (const uid of ["100", "102"]) await finalizeReview(env as any, gRow, { id: b1, title: "Hammam Al Andalous", competencies: "C1N1,C2N1,C3N1,T1N1,T5N1" }, `u:${uid}`, { notify: false });
  // more results so the class view has something to show
  const cr = db.prepare("INSERT OR IGNORE INTO competency_results (guild_id, discord_id, code, level, ok, source, ref, note, at) VALUES (?, ?, ?, ?, ?, 'manual', 0, 'Diagnostic de rentrée', ?)");
  for (let i = 3; i < 12; i++) for (const c of ["C1", "C2", "C3", "T1", "T5"]) if (rnd() < 0.7) cr.run(G, String(100 + i), c, 1, rnd() < 0.7 ? 1 : 0, now - 10 * DAY);
  const b2 = await saveBrief(env as any, gRow, null, { program: "builtin:dwwm-2026", week: 2, status: "assigned", source: "ai", data: {
    title: "Atlas Trek : landing page responsive avec Tailwind", summary: "Une landing page moderne et accessible pour une agence de randonnée dans l’Atlas.", tags: ["HTML", "Tailwind CSS", "Figma"],
    context: "Atlas Trek organise des randonnées guidées. Elle veut une page qui donne envie de réserver.", groups: [stories("Visiteur", ["En tant que visiteur, je vais voir les circuits afin de choisir une randonnée.", "En tant que visiteur, je vais lire les avis afin d’avoir confiance."])],
    bonus: [], modalities: { days: 5, mode: "squad", start: "2026-10-12", due: "2026-10-16", text: "" }, evaluation: { minutes: 20, parts: [] }, deliverables: ["Lien du dépôt GitHub"], criteria: ["Accessible (contrastes, alt)"],
    situation: { title: "", need: "" }, competencies: ["C1N2", "C2N2", "C3N2", "T2N1"], resources: [] } });
  db.prepare("UPDATE briefs SET kind = 'squad', squads = ? WHERE id = ?").run(JSON.stringify([
    { id: "a1b2c3", name: "Toubkal", members: ["100", "101", "102", "103"], sm: "100" }, { id: "d4e5f6", name: "Ifrane", members: ["104", "105", "106", "107"], sm: "105" }, { id: "0a0b0c", name: "Ouzoud", members: ["108", "109", "110", "111"], sm: "108" }]), b2);
  await saveBrief(env as any, gRow, null, { program: "builtin:dwwm-2026", week: 3, source: "ai", data: { title: "Quiz Darija : application JavaScript interactive", summary: "Un quiz pour apprendre la darija, en JavaScript natif.", competencies: ["C3N1", "C4N1"], modalities: { days: 5, mode: "individuel", start: "2026-10-19", due: "2026-10-23" } } });
  // an assessment in progress
  const qs = [
    { id: "q1aa", type: "mcq", prompt: "Quelle propriété aligne les éléments d’un conteneur flex sur l’axe principal ?", choices: ["align-items", "justify-content", "flex-direction", "place-self"], answer: [1], points: 1, skills: ["css"], comp: "C3", level: 1 },
    { id: "q2bb", type: "mcq", prompt: "Quelles balises sont sémantiques ?", choices: ["<div>", "<nav>", "<span>", "<article>"], answer: [1, 3], points: 1, skills: ["html"], comp: "C3", level: 1 },
    { id: "q3cc", type: "code", prompt: "Écris le CSS qui affiche 3 cartes côte à côte sur desktop et l’une sous l’autre sous 768px.", lang: "css", expected: ".cards{display:flex;gap:1rem} @media (max-width:768px){.cards{flex-direction:column}}", points: 3, skills: ["css"], comp: "C3", level: 1 },
    { id: "q4dd", type: "explain", prompt: "Explique la différence entre une marge (margin) et un padding.", expected: "margin = espace extérieur à la bordure ; padding = espace intérieur entre la bordure et le contenu.", points: 2, skills: ["css"], comp: "C3", level: 1 }];
  const aid = Number(db.prepare("INSERT INTO assessments (guild_id, title, brief_id, status, settings, questions, created_at, opened_at, closes_at) VALUES (?, 'Flexbox et responsive', ?, 'open', ?, ?, ?, ?, ?)")
    .run(G, b1, JSON.stringify({ minutes: 40, lang: "fr", codeLang: "css", showResults: true, points: 20, passAt: 60 }), JSON.stringify(qs), now - DAY, now - 3 * 3600, now + 3 * DAY).lastInsertRowid);
  const tk = db.prepare("INSERT INTO assessment_takers (assessment_id, guild_id, discord_id, status, seed, answers, pos, started_at, deadline, submitted_at, locked_at, lock_reason, events, grades, score, summary, invited_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const ans = { q1aa: [1], q2bb: [1, 3], q3cc: ".cards { display: flex; gap: 16px; }\n@media (max-width: 768px) { .cards { flex-direction: column; } }", q4dd: "Le margin c’est dehors de la bordure, le padding dedans." };
  const grades = { q1aa: { verdict: "correct", score: 100, comment: "" }, q2bb: { verdict: "correct", score: 100, comment: "" }, q3cc: { verdict: "correct", score: 90, comment: "Bonne utilisation de la media query.", right: "La logique est juste : flex sur desktop, colonne sous 768px.", wrong: "Un point-virgule oublié.", marks: [{ line: 2, text: "flex-direction: column", issue: "Il manque le « ; » (sans conséquence ici).", major: false }] }, q4dd: { verdict: "partial", score: 60, comment: "Juste, mais précise ce qui est entre quoi." } };
  tk.run(aid, G, "100", "graded", 11, JSON.stringify(ans), 3, now - 7000, now - 4600, now - 5200, null, null, JSON.stringify([[now - 7000, "start"], [now - 5200, "submit"]]), JSON.stringify(grades), 91, "Très bien : flexbox maîtrisé.", now - DAY);
  tk.run(aid, G, "101", "submitted", 12, JSON.stringify({ ...ans, q2bb: [1], q4dd: "" }), 3, now - 6000, now - 3600, now - 4000, null, null, JSON.stringify([[now - 6000, "start"], [now - 4000, "submit"]]), null, null, null, now - DAY);
  tk.run(aid, G, "102", "locked", 13, JSON.stringify({ q1aa: [1] }), 1, now - 900, now + 1500, null, now - 300, "fullscreen", JSON.stringify([[now - 900, "start"], [now - 600, "paste"], [now - 300, "fullscreen"]]), null, null, null, now - DAY);
  tk.run(aid, G, "103", "active", 14, JSON.stringify({ q1aa: [0], q3cc: ".cards{display:grid}" }), 2, now - 600, now + 1800, null, null, null, JSON.stringify([[now - 600, "start"]]), null, null, null, now - DAY);
  for (const u of ["104", "105", "106"]) tk.run(aid, G, u, "invited", 15 + Number(u), null, 0, null, null, null, null, null, null, null, null, null, now - DAY);
  // a second class, both in the league
  const G2 = "900000000000000002";
  db.prepare("INSERT INTO guilds (id, name, lang, season, code_lang, daily_hour, league, created_at) VALUES (?, 'CS 2nd year · Group A', 'fr', 'Autumn 2026', 'javascript,php', 9, ?, ?)").run(G2, JSON.stringify({ on: true, name: "Group A" }), now - 60 * DAY);
  db.prepare("UPDATE guilds SET league = ? WHERE id = ?").run(JSON.stringify({ on: true, name: "Group B" }), G);
  db.prepare("UPDATE players SET share_key = 'demoprofile1' WHERE guild_id = ? AND discord_id = '100'").run(G);
  db.prepare("INSERT OR IGNORE INTO badges (guild_id, discord_id, badge, created_at) VALUES (?, '100', 'first_solve', ?), (?, '100', 'solves_10', ?), (?, '100', 'duel_win', ?)").run(G, now, G, now, G, now);
  for (let i = 0; i < 9; i++) {
    db.prepare("INSERT INTO players (guild_id, discord_id, name, last_active, created_at) VALUES (?, ?, ?, ?, ?)").run(G2, String(500 + i), "Student " + (i + 1), now - DAY, now - 50 * DAY);
    for (let k = 0; k < 6; k++) db.prepare("INSERT INTO ledger (guild_id, discord_id, season, amount, reason, created_at) VALUES (?, ?, 'Autumn 2026', ?, 'practice', ?)").run(G2, String(500 + i), 6 + (i % 4) * 3, now - Math.floor(rnd() * 20) * DAY);
  }
}

createServer(async (req, res) => {
  // public pages of the bot Worker (shared profile, certificates)
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  // public pages of the bot Worker (shared profile, certificates, the assessment page)
  if (/^\/(u|cert|quiz|battle|league|game|play)\//.test(req.url ?? "")) {
    const r = await bot.fetch(new Request("http://localhost" + req.url, { method: req.method, headers: req.headers as any, body }), env, { waitUntil() {} } as any);
    res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "text/html" });
    res.end(await r.text());
    return;
  }
  const request = new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers as any, body });
  const response = await admin.fetch(request, env, { waitUntil() {} });
  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => (headers[k] = v));
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, () => console.log(`Dashboard preview with a demo class: http://localhost:${PORT}`));
