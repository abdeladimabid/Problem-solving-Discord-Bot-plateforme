// Local preview of the teacher dashboard with a demo class (no Cloudflare needed).
//   npm run preview   → http://localhost:8787
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeEnv } from "./harness.ts";
import admin from "../src/admin/index.ts";
import { analyzeLog, fingerprint } from "../src/shared/integrity.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8787);
const { env } = await makeEnv({ DEV_NO_AUTH: "true" });
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

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const request = new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers as any, body: chunks.length ? Buffer.concat(chunks) : undefined });
  const response = await admin.fetch(request, env, { waitUntil() {} });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, () => console.log(`Dashboard preview with a demo class: http://localhost:${PORT}`));
