// End-to-end tests: real Worker code, fake Discord/HackerRank/AI/D1.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { access, ai, clock, discordCalls, discordRoles, hr, makeCtx, makeEnv, runner, signedRequest } from "./harness.ts";
import bot from "../src/bot/index.ts";
import admin from "../src/admin/index.ts";
import { runCron } from "../src/bot/cron.ts";
import { contestConfig } from "../src/shared/contests.ts";
import { DICTS } from "../src/shared/i18n.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
contestConfig.revealPause = 0;

let failures = 0, passes = 0;
function check(cond: unknown, msg: string) {
  if (cond) passes++;
  else { failures++; console.log("  ❌ " + msg); }
}
function section(name: string) { console.log("• " + name); }

const { env, privateKey } = await makeEnv();
const db = (env.DB as any).raw;
const q = (sql: string, ...a: any[]) => db.prepare(sql).all(...a) as any[];
const q1 = (sql: string, ...a: any[]) => db.prepare(sql).get(...a) as any;

const G = "g1", CH = "ch1", ARENA = "arena1";
const U = {
  prof: { id: "100", name: "Prof", teacher: true },
  alice: { id: "101", name: "Alice", teacher: false },
  bob: { id: "102", name: "Bob", teacher: false },
  carol: { id: "103", name: "Carol", teacher: false },
};
type User = typeof U.prof;
let tok = 0;

function raw(type: number, u: User, data: any) {
  return {
    type, id: String(++tok), token: `tok${tok}`, application_id: "app1", guild_id: G, channel_id: CH, guild: { name: "CS Class" },
    member: { user: { id: u.id, username: u.name.toLowerCase(), global_name: u.name }, nick: null, permissions: u.teacher ? "32" : "0" },
    data,
  };
}
function resolvedFor(opts: Record<string, any>) {
  const users: any = {}, members: any = {};
  for (const v of Object.values(opts)) {
    const u = Object.values(U).find((x) => x.id === v);
    if (u) { users[u.id] = { id: u.id, username: u.name.toLowerCase(), global_name: u.name }; members[u.id] = { nick: null }; }
  }
  return { users, members };
}
async function call(r: any) {
  const ctx = makeCtx();
  const res = await bot.fetch(await signedRequest(privateKey, r), env, ctx);
  const out = res.status === 200 ? await res.json() : { status: res.status };
  await ctx.flush();
  return out as any;
}
const slash = (u: User, name: string, opts: Record<string, any> = {}, sub?: string) => {
  const options = Object.entries(opts).map(([k, v]) => ({ name: k, value: v, type: 3 }));
  return call(raw(2, u, { name, type: 1, options: sub ? [{ type: 1, name: sub, options }] : options, resolved: resolvedFor(opts) }));
};
const click = (u: User, custom_id: string) => call(raw(3, u, { custom_id, component_type: 2 }));
const select = (u: User, custom_id: string, values: string[]) => call(raw(3, u, { custom_id, component_type: 3, values }));
const submit = (u: User, custom_id: string, value: string) =>
  call(raw(5, u, { custom_id, components: [{ type: 1, components: [{ type: 4, custom_id: "x", value }] }] }));
const lastPatch = () => [...discordCalls].reverse().find((c) => c.method === "PATCH")?.body;
const messagesTo = (ch: string) => discordCalls.filter((c) => c.method === "POST" && c.path === `/channels/${ch}/messages`).map((c) => c.body);
const ids = (payload: any): string[] => (payload?.components ?? []).flatMap((r: any) => r.components.map((c: any) => c.custom_id).filter(Boolean));
const text = (payload: any) => JSON.stringify(payload ?? {});
async function api(method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  const ctx = makeCtx();
  const res = await admin.fetch(new Request("https://dash.example.workers.dev" + path, {
    method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined,
  }), env, ctx);
  await ctx.flush();
  const ct = res.headers.get("content-type") ?? "";
  return { status: res.status, data: ct.includes("json") ? await res.json() : await res.text() } as any;
}
function pointsForTest() { return 24; }
function solveAnswer(cid: number) {
  const c = q1("SELECT * FROM challenges WHERE id = ?", cid);
  return c;
}

// =====================================================================
section("security: signatures & ping");
{
  const bad = await bot.fetch(await signedRequest(privateKey, { type: 1 }, true), env, makeCtx());
  check(bad.status === 401, "tampered signature must be rejected with 401");
  const ping = await call({ type: 1 });
  check(ping.type === 1, "PING answered with PONG");
}

section("teacher setup & permissions");
{
  const denied = await slash(U.alice, "teacher", { language: "fr" }, "setup");
  check(text(denied).includes("enseignant") || text(denied).includes("teacher"), "students can't use /teacher");
  const r = await slash(U.prof, "teacher", { language: "en", daily_hour: 0, code_language: "python" }, "setup");
  check(r.type === 4 && text(r).includes("Saved") && text(r).includes(`<#${ARENA}>`), "teacher setup saved, #arena found automatically");
  const g = q1("SELECT * FROM guilds WHERE id = ?", G);
  // the anti-cheat features are tested in their own section; the classic flows first
  db.prepare("UPDATE guilds SET integrity = ? WHERE id = ?").run(JSON.stringify({ editor: "off", explain: false, codeImage: false, similarity: false }), G);
  check(g.arena_channel === ARENA && g.announce_channel === ARENA && g.daily_channel === ARENA && g.lang === "en" && g.daily_hour === 0, "setup stored arena/lang/hour");
}

section("linking HackerRank accounts: ownership must be proven");
{
  const r = await slash(U.alice, "link", { username: "Alice_HR" });
  const code = q1("SELECT hr_code FROM players WHERE discord_id = ?", U.alice.id).hr_code;
  check(/^CB-[A-Z0-9]{4}$/.test(code) && text(r).includes(code) && r.data.flags === 64, "link answers privately with a verification code");
  check(ids(r.data).includes("hrv:0"), "Verify button");
  hr.profiles["alice_hr"] = "I love algorithms";
  await click(U.alice, "hrv:0");
  check(text(lastPatch()).includes("couldn't find"), "verification fails while the code isn't in the profile");
  check(q1("SELECT hr_verified FROM players WHERE discord_id = ?", U.alice.id).hr_verified === 0, "still unverified");
  hr.profiles["alice_hr"] = `I love algorithms ${code}`;
  await click(U.alice, "hrv:0");
  check(text(lastPatch()).includes("verified as **Alice_HR**"), "verified once the code is in the profile");
  check(q1("SELECT hr_verified FROM players WHERE discord_id = ?", U.alice.id).hr_verified === 1, "link verified");
  const taken = await slash(U.carol, "link", { username: "alice_hr" });
  check(text(taken).includes("already linked"), "a verified account can't be taken by someone else");
  // an unverified link CAN be taken over (nobody proved it)
  await slash(U.bob, "link", { username: "carol_hr" });
  await slash(U.carol, "link", { username: "carol_hr" });
  check(q1("SELECT hr_username FROM players WHERE discord_id = ?", U.bob.id).hr_username === null, "unverified link taken over by the one who links next");
  const cc = q1("SELECT hr_code FROM players WHERE discord_id = ?", U.carol.id).hr_code;
  hr.profiles["carol_hr"] = cc;
  await click(U.carol, "hrv:0");
  await slash(U.bob, "link", { username: "bob_hr" });
  const v = await slash(U.prof, "teacher", { member: U.bob.id }, "verify");
  check(text(v).includes("verified") && q1("SELECT hr_verified FROM players WHERE discord_id = ?", U.bob.id).hr_verified === 1, "teacher can verify a link with /teacher verify");
  const pf = await slash(U.alice, "profile");
  check(text(pf).includes("Alice_HR"), "profile shows the verified account");
}

section("practice: quick challenge from bank, correct answer, points by type");
let firstAttempt = 0;
{
  ai.mode = "good";
  const r = await slash(U.alice, "practice", { difficulty: "easy", type: "output" });
  check(r.type === 5 && r.data.flags === 64, "practice is deferred and private");
  const p = lastPatch();
  check(p?.embeds?.[0]?.title?.startsWith("🧩"), "challenge rendered");
  const ansm = ids(p).find((i) => i.startsWith("ansm:"));
  check(!!ansm, "output challenge has an Answer button");
  firstAttempt = Number(ansm!.split(":")[1]);
  const a = q1("SELECT * FROM attempts WHERE id = ?", firstAttempt);
  const c = solveAnswer(a.challenge_id);
  check(c.source === "seed" && c.kind === "output", "comes from the verified bank");
  const modal = await click(U.alice, ansm!);
  check(modal.type === 9, "Answer opens a modal");
  const other = await click(U.bob, ansm!);
  check(text(other).includes("isn't yours"), "other students can't answer your challenge");
  const res = await submit(U.alice, `mans:${firstAttempt}`, `  ${c.answer}  `);
  check(res.type === 6, "answers are deferred (no 3-second timeout)");
  check(text(lastPatch()).includes("✅"), "correct answer accepted (whitespace-insensitive)");
  const pts = q1("SELECT SUM(amount) AS s FROM ledger WHERE discord_id = ?", U.alice.id).s;
  check(pts === 11, `easy output = 3 × 3, +20% speed bonus = 11 pts (got ${pts})`);
  check(text(lastPatch()).includes("First Steps"), "first-solve badge unlocked");
  check(messagesTo(ARENA).some((m) => text(m).includes("First Steps")), "badge announced in #arena");
  await submit(U.alice, `mans:${firstAttempt}`, c.answer);
  check(text(lastPatch()).includes("already"), "can't score twice");
}

section("practice: wrong answers, second try, hint, choice question");
{
  await slash(U.bob, "practice", { difficulty: "medium", type: "output" });
  const p = lastPatch();
  const aid = Number(ids(p).find((i) => i.startsWith("ansm:"))!.split(":")[1]);
  await click(U.bob, `hint:${aid}`);
  check(text(lastPatch()).includes("Hint"), "hint revealed");
  await submit(U.bob, `mans:${aid}`, "definitely wrong");
  check(text(lastPatch()).includes("one more try"), "first wrong output answer gives a second try");
  await submit(U.bob, `mans:${aid}`, "still wrong");
  check(text(lastPatch()).includes("❌") && text(lastPatch()).includes("Correct answer"), "second wrong answer fails and shows the answer");
  check(q1("SELECT status FROM attempts WHERE id = ?", aid).status === "failed", "attempt marked failed");

  await slash(U.bob, "practice", { difficulty: "easy", type: "mcq" });
  const btns = ids(lastPatch()).filter((i) => i.startsWith("ans:"));
  check(btns.length === 4, "multiple choice shows A-D buttons");
  const aid2 = Number(btns[0].split(":")[1]);
  const c2 = solveAnswer(q1("SELECT challenge_id FROM attempts WHERE id = ?", aid2).challenge_id);
  const before = q1("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE discord_id = ?", U.bob.id).s;
  await click(U.bob, `ans:${aid2}:${c2.answer}`);
  check(text(lastPatch()).includes("✅"), "right letter accepted");
  const gained = q1("SELECT SUM(amount) AS s FROM ledger WHERE discord_id = ?", U.bob.id).s - before;
  check(gained === 4, `easy multiple choice = 3 × 1, +20% = 4 pts (got ${gained})`);

  await slash(U.carol, "practice", { difficulty: "hard", type: "bug" });
  const b3 = ids(lastPatch()).filter((i) => i.startsWith("ans:"));
  const aid3 = Number(b3[0].split(":")[1]);
  const c3 = solveAnswer(q1("SELECT challenge_id FROM attempts WHERE id = ?", aid3).challenge_id);
  clock.advance(120); // no speed bonus
  await click(U.carol, `ans:${aid3}:${c3.answer}`);
  check(q1("SELECT points FROM attempts WHERE id = ?", aid3).points === 60, "hard find-the-bug = 12 × 5 = 60 pts");
  check(messagesTo(ARENA).some((m) => text(m).includes("Respect") || text(m).includes("cracked the HARD")), "hard solve shouted out in #arena");
}

section("practice: AI generation runs in the background, checked before use");
{
  const before = q1("SELECT COUNT(*) AS n FROM challenges WHERE source = 'ai'").n;
  await slash(U.carol, "practice", { difficulty: "hard", type: "output", topic: "lists" });
  check(text(lastPatch()).includes("Cooking up"), "topic request answered immediately (queued)");
  const again = await slash(U.carol, "practice", { difficulty: "hard", type: "output", topic: "lists" });
  void again;
  check(text(lastPatch()).includes("already preparing"), "one AI job at a time per student");
  await runCron(env);
  const p = lastPatch();
  check(text(p).includes("sum(x)") && text(p).includes("brand-new"), "cron generates it and edits the student's message");
  check(q1("SELECT COUNT(*) AS n FROM challenges WHERE source = 'ai'").n === before + 1, "AI challenge saved to the bank");
  const gen = q1("SELECT * FROM challenges WHERE source = 'ai' ORDER BY id DESC LIMIT 1");
  check(gen.answer !== "999" && /^\d+$/.test(gen.answer), `answer comes from really running the code, not from the AI (${gen.answer})`);
  check(ai.prompts.some((x) => x.includes("HARD means only the strongest")), "difficulty rubric sent to the AI");

  ai.mode = "lying";
  await slash(U.carol, "practice", { difficulty: "medium", type: "mcq", topic: "sets" });
  await runCron(env);
  check(text(lastPatch()).includes("couldn't create"), "multiple choice rejected when an independent re-solve disagrees");
  ai.mode = "broken";
  await slash(U.carol, "practice", { difficulty: "medium", type: "mcq", topic: "sets" });
  await runCron(env);
  check(text(lastPatch()).includes("couldn't create"), "falls back gracefully when the AI is broken");
  ai.mode = "good";
  check(q1("SELECT COUNT(*) AS n FROM challenges WHERE source = 'ai'").n === before + 1, "nothing unchecked was saved");
}

section("write code: real judge, verdicts, AI coach, points");
{
  await slash(U.alice, "practice", { difficulty: "medium", type: "write" });
  let p = lastPatch();
  const sub = ids(p).find((i) => i.startsWith("sub:"))!;
  check(!!sub && ids(p).some((i) => i.startsWith("lang:")), "write-code challenge shows Submit + language menu");
  check(text(p).includes("Your task") && text(p).includes("solve(") && text(p).includes("→") && text(p).includes("Time limit"), "function to write, examples as calls, time limit shown");
  const aid = Number(sub.split(":")[1]);
  const c = solveAnswer(q1("SELECT challenge_id FROM attempts WHERE id = ?", aid).challenge_id);
  check(c.kind === "write" && c.difficulty === "medium" && !!c.solution, "bank problem with a reference solution");
  check(q1("SELECT COUNT(*) AS n FROM challenge_tests WHERE test_set = ?", c.test_set).n >= 6, "problem has hidden tests");
  const m = await click(U.alice, sub);
  check(m.type === 9 && text(m).includes("Python"), "Submit opens a code form");

  const r1 = await submit(U.alice, `msub:${aid}`, "print(0)");
  check(r1.type === 6, "submission deferred");
  p = lastPatch();
  check(text(p).includes("Wrong answer"), "wrong code → Wrong answer");
  check(text(p).includes("AI coach") && text(p).includes("every number is negative"), "AI coach explains the mistake");
  check(text(p).includes("**4** submission"), "tries left shown");

  await submit(U.alice, `msub:${aid}`, "import time\ntime.sleep(5)\n" + c.solution);
  check(text(lastPatch()).includes("Time limit exceeded"), "slow code → Time limit exceeded");
  await submit(U.alice, `msub:${aid}`, "def f(:\n  pass");
  check(text(lastPatch()).includes("syntax error"), "syntax error reported");

  await submit(U.alice, `msub:${aid}`, c.solution);
  p = lastPatch();
  check(text(p).includes("Accepted"), "reference solution accepted on every test");
  const at = q1("SELECT * FROM attempts WHERE id = ?", aid);
  check(at.status === "solved" && at.verified === 1 && at.tries === 4, "attempt solved and verified by tests");
  check(at.points === 26, `medium write = 6 × 8 = 48 pts, 4th submission −45% → 26 (got ${at.points})`);
  check(JSON.parse(at.result).verdict === "accepted" && at.lang === "python", "judge result stored for the teacher");
  check(ids(p).includes(`fb:${aid}`), "Review my code button after success");
  await click(U.alice, `fb:${aid}`);
  check(text(lastPatch()).includes("🧠"), "AI code review");

  // other languages: compiled with a real compiler
  await slash(U.bob, "practice", { difficulty: "easy", type: "write" });
  const sub2 = ids(lastPatch()).find((i) => i.startsWith("sub:"))!;
  const aid2 = Number(sub2.split(":")[1]);
  await select(U.bob, `lang:${aid2}`, ["cpp"]);
  check(q1("SELECT lang FROM attempts WHERE id = ?", aid2).lang === "cpp" && q1("SELECT code_lang FROM players WHERE discord_id = ?", U.bob.id).code_lang === "cpp", "language choice remembered");
  check(text(await click(U.bob, sub2)).includes("C++"), "form asks for C++ code");
  await submit(U.bob, `msub:${aid2}`, "int main( { return 0; }");
  check(text(lastPatch()).includes("doesn't compile"), "C++ compile error reported");

  // the runner is down: the AI judges from the samples (and says so)
  runner.down = true;
  ai.judgeVerdict = "accepted";
  await submit(U.bob, `msub:${aid2}`, "#include <iostream>\nint main(){std::cout<<1;}");
  check(text(lastPatch()).includes("AI judged"), "AI fallback judge when the runner is unreachable");
  check(q1("SELECT verified FROM attempts WHERE id = ?", aid2).verified === 0, "AI-judged solves are marked unverified");
  runner.down = false;
}

section("write code: AI-generated problem, proven by running reference vs brute force");
{
  await slash(U.carol, "practice", { difficulty: "hard", type: "write", topic: "max subarray" });
  check(text(lastPatch()).includes("testing it on a real computer"), "write generation queued");
  await runCron(env);
  const p = lastPatch();
  check(text(p).includes("Best streak") && ids(p).some((i) => i.startsWith("sub:")), "generated problem delivered");
  const c = q1("SELECT * FROM challenges WHERE title = 'Best streak' ORDER BY id DESC LIMIT 1");
  const tests = q("SELECT * FROM challenge_tests WHERE test_set = ? ORDER BY idx", c.test_set);
  check(tests.length === 7 && tests.filter((x) => x.sample).length === 2 && tests.some((x) => x.gen && !x.input), "samples, small tests and a generated big test stored");
  check(tests[0].expected === "7" && tests[1].expected === "-2", "expected outputs computed by running the reference");
  const aid = Number(ids(p).find((i) => i.startsWith("sub:"))!.split(":")[1]);
  await submit(U.carol, `msub:${aid}`, "n=int(input());a=list(map(int,input().split()))\nprint(max(sum(a[i:j+1]) for i in range(n) for j in range(i,n)))");
  check(text(lastPatch()).includes("Time limit exceeded") && text(lastPatch()).includes("big test"), "brute force passes small tests but times out on the big one");
  ai.mode = "badwrite";
  await slash(U.alice, "practice", { difficulty: "hard", type: "write", topic: "anything" });
  await runCron(env);
  check(text(lastPatch()).includes("couldn't create"), "problem rejected when brute force and reference disagree");
  ai.mode = "good";
}

section("practice: reports flag a challenge after two students");
{
  await slash(U.alice, "practice", { difficulty: "easy", type: "bug" });
  const aidA = Number(ids(lastPatch()).find((i) => i.startsWith("rep:"))!.split(":")[1]);
  const cid = q1("SELECT challenge_id FROM attempts WHERE id = ?", aidA).challenge_id;
  const m = await click(U.alice, `rep:${aidA}`);
  check(m.type === 9, "report opens a form");
  await submit(U.alice, `mrep:${aidA}`, "answer seems wrong");
  db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, started_at) VALUES (?, ?, ?, 'practice', ?)").run(G, U.bob.id, cid, clock.now());
  const aidB = q1("SELECT id FROM attempts WHERE challenge_id = ? AND discord_id = ? ORDER BY id DESC", cid, U.bob.id).id;
  await submit(U.bob, `mrep:${aidB}`, "same");
  check(q1("SELECT status FROM challenges WHERE id = ?", cid).status === "flagged", "challenge flagged after 2 reports");
}

section("HackerRank problems: only verified solves count");
{
  const dan = { id: "104", name: "Dan", teacher: false };
  await slash(dan, "link", { username: "dan_hr" });
  const r = await slash(dan, "practice", { difficulty: "easy", type: "coding" });
  check(text(r).includes("Prove that"), "unverified students must verify before HackerRank problems");

  await slash(U.alice, "practice", { difficulty: "easy", type: "coding" });
  const p = lastPatch();
  const chk = ids(p).find((i) => i.startsWith("chk:"));
  check(!!chk && text(p).includes("hackerrank.com/challenges/") && !ids(p).some((i) => i.startsWith("claim:")), "Check button, no self-report button");
  const aid = Number(chk!.split(":")[1]);
  const c = solveAnswer(q1("SELECT challenge_id FROM attempts WHERE id = ?", aid).challenge_id);
  await click(U.alice, chk!);
  check(text(lastPatch()).includes("don't see"), "not solved yet → asks to submit first");
  hr.solves["alice_hr"] = [{ slug: c.hr_slug, at: clock.now() }];
  await click(U.alice, chk!);
  check(text(lastPatch()).includes("confirms"), "solve verified via HackerRank");
  check(q1("SELECT verified, status FROM attempts WHERE id = ?", aid).verified === 1, "attempt marked verified");

  // an old solve (before the challenge was handed out) doesn't count
  await slash(U.carol, "practice", { difficulty: "medium", type: "coding" });
  const aidC = Number(ids(lastPatch()).find((i) => i.startsWith("chk:"))!.split(":")[1]);
  const cC = solveAnswer(q1("SELECT challenge_id FROM attempts WHERE id = ?", aidC).challenge_id);
  hr.solves["carol_hr"] = [{ slug: cC.hr_slug, at: clock.now() - 86400 }];
  await click(U.carol, `chk:${aidC}`);
  check(text(lastPatch()).includes("before"), "a solve older than the challenge is refused");
  check(q1("SELECT status, points FROM attempts WHERE id = ?", aidC).points === 0, "no points for an old solve");

  // HackerRank down → self-report, which needs the teacher's approval
  await slash(U.bob, "practice", { difficulty: "easy", type: "coding" });
  const aid2 = Number(ids(lastPatch()).find((i) => i.startsWith("chk:"))!.split(":")[1]);
  hr.down = true;
  await click(U.bob, `chk:${aid2}`);
  check(ids(lastPatch()).some((i) => i.startsWith("claim:")), "HackerRank down → offers self-report");
  hr.down = false;
  const before = q1("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE discord_id = ?", U.bob.id).s;
  await submit(U.bob, `mclaim:${aid2}`, "https://www.hackerrank.com/submissions/123");
  check(text(lastPatch()).includes("teacher will confirm"), "self-report recorded, waiting for the teacher");
  const at = q1("SELECT status, verified, points FROM attempts WHERE id = ?", aid2);
  check(at.status === "claimed" && at.verified === 0 && at.points === 0, "claimed attempt gives no points yet");
  check(q1("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE discord_id = ?", U.bob.id).s === before, "ledger unchanged by a self-report");
}

section("duels: invite in #arena, accept, first correct answer wins, Elo, coins");
let duelId = 0;
{
  const r = await slash(U.alice, "duel", { opponent: U.bob.id, mode: "quick", difficulty: "easy", stake: 10 });
  check(r.data?.flags === 64 && text(r).includes(`<#${ARENA}>`), "duel invitation posted in #arena (private confirmation)");
  const inv = messagesTo(ARENA).reverse().find((m) => text(m).includes("dacc:"));
  const acc = ids(inv).find((i) => i.startsWith("dacc:"))!;
  duelId = Number(acc.split(":")[1]);
  const wrong = await click(U.carol, acc);
  check(text(wrong).includes("Only"), "only the opponent can accept");
  const ok = await click(U.bob, acc);
  check(ok.type === 6, "accept is deferred");
  check(text(lastPatch()).includes("Duel on"), "duel started message");
  const d = q1("SELECT * FROM duels WHERE id = ?", duelId);
  check(d.status === "active" && d.challenge_id && d.channel_id === ARENA, "duel active with a challenge");
  check(q1("SELECT coins FROM players WHERE discord_id = ?", U.alice.id).coins === 90, "stake escrowed");
  const openA = await click(U.alice, `dopen:${duelId}`);
  const pa0 = lastPatch();
  await click(U.bob, `dopen:${duelId}`);
  const pb0 = lastPatch();
  check(openA.type === 5, "opening is deferred");
  const spectator = await click(U.carol, `dopen:${duelId}`);
  check(text(spectator).includes("popcorn"), "spectators can't open the duel");
  const c = solveAnswer(d.challenge_id);
  const firstA = ids(pa0).find((i) => /^(ans|ansm):/.test(i))!, firstB = ids(pb0).find((i) => /^(ans|ansm):/.test(i))!;
  const aidA = Number(firstA.split(":")[1]), aidB = Number(firstB.split(":")[1]);
  const choice = firstA.startsWith("ans:");
  if (choice) await click(U.alice, `ans:${aidA}:${c.answer}`); else await submit(U.alice, `mans:${aidA}`, c.answer);
  check(text(lastPatch()).includes("✅"), "alice answers correctly");
  const d2 = q1("SELECT * FROM duels WHERE id = ?", duelId);
  check(d2.status === "finished" && d2.winner_id === U.alice.id, "alice wins the duel");
  const pa = q1("SELECT coins, rating FROM players WHERE discord_id = ?", U.alice.id), pb = q1("SELECT coins, rating FROM players WHERE discord_id = ?", U.bob.id);
  check(pa.coins === 110 && pb.coins === 90, `coins settled (alice ${pa.coins}, bob ${pb.coins})`);
  check(pa.rating > 1000 && pb.rating < 1000, "Elo updated");
  check(messagesTo(ARENA).some((m) => /wins the duel|Victory for/.test(text(m))), "victory announced in #arena");
  if (choice) await click(U.bob, `ans:${aidB}:${c.answer}`); else await submit(U.bob, `mans:${aidB}`, c.answer);
  check(text(lastPatch()).includes("already"), "loser's challenge closed after the duel");
}

section("duels: write-code duel judged by tests");
{
  await slash(U.carol, "duel", { opponent: U.alice.id, mode: "write", difficulty: "easy" });
  const inv = messagesTo(ARENA).reverse().find((m) => text(m).includes("dacc:"));
  await click(U.alice, ids(inv).find((i) => i.startsWith("dacc:"))!);
  check(text(lastPatch()).includes("45 min"), "write duels last 45 minutes");
  const d = q1("SELECT * FROM duels ORDER BY id DESC LIMIT 1");
  check(q1("SELECT kind FROM challenges WHERE id = ?", d.challenge_id).kind === "write", "duel uses a write-code problem");
  await click(U.carol, `dopen:${d.id}`);
  const aid = Number(ids(lastPatch()).find((i) => i.startsWith("sub:"))!.split(":")[1]);
  await submit(U.carol, `msub:${aid}`, "print(1)");
  check(text(lastPatch()).includes("Wrong answer") && q1("SELECT status FROM duels WHERE id = ?", d.id).status === "active", "wrong code doesn't end the duel");
  await submit(U.carol, `msub:${aid}`, solveAnswer(d.challenge_id).solution);
  check(q1("SELECT winner_id FROM duels WHERE id = ?", d.id).winner_id === U.carol.id, "first accepted solution wins");
}

section("duels: decline, busy, timeout draw");
{
  await slash(U.carol, "duel", { opponent: U.alice.id });
  let inv = messagesTo(ARENA).reverse().find((m) => text(m).includes("ddec:"));
  const out = await click(U.alice, ids(inv).find((i) => i.startsWith("ddec:"))!);
  check(text(out).includes("declined"), "duel declined");
  await slash(U.carol, "duel", { opponent: U.bob.id, difficulty: "medium", stake: 5 });
  inv = messagesTo(ARENA).reverse().find((m) => text(m).includes("dacc:"));
  await click(U.bob, ids(inv).find((i) => i.startsWith("dacc:"))!);
  const busy = await slash(U.alice, "duel", { opponent: U.bob.id });
  check(text(busy).includes("already has a duel"), "can't start a second duel while busy");
  const coinsBefore = q1("SELECT coins FROM players WHERE discord_id = ?", U.carol.id).coins;
  clock.advance(11 * 60);
  await runCron(env);
  const d = q1("SELECT * FROM duels ORDER BY id DESC LIMIT 1");
  check(d.status === "finished" && d.winner_id === null, "duel times out as a draw");
  check(q1("SELECT coins FROM players WHERE discord_id = ?", U.carol.id).coins === coinsBefore + 5, "stakes refunded on draw");
}

section("daily challenge: posted in #arena by cron, solved, bonus & streak");
{
  await runCron(env);
  const day = new Date(Date.now()).toISOString().slice(0, 10);
  const dl = q1("SELECT * FROM daily WHERE guild_id = ? AND day = ?", G, day);
  check(!!dl, "daily challenge created");
  const post = messagesTo(ARENA).find((m) => text(m).includes("dsolve:"));
  check(!!post, "daily posted in #arena with a Solve button");
  const btnId = ids(post).find((i) => i.startsWith("dsolve:"))!;
  await runCron(env);
  check(messagesTo(ARENA).filter((m) => text(m).includes("dsolve:")).length === 1, "daily posted only once per day");
  const open = await click(U.carol, btnId);
  check(open.data?.flags === 64, "daily opens privately");
  const c = solveAnswer(dl.challenge_id);
  const pl = lastPatch();
  const first = ids(pl).find((i) => /^(ans|ansm|sub|chk):/.test(i))!;
  const aid = Number(first.split(":")[1]);
  if (c.kind === "code") {
    hr.solves["carol_hr"] = [{ slug: c.hr_slug, at: clock.now() }];
    await click(U.carol, `chk:${aid}`);
  } else if (c.kind === "write") await submit(U.carol, `msub:${aid}`, c.solution);
  else if (first.startsWith("ans:")) await click(U.carol, `ans:${aid}:${c.answer}`);
  else await submit(U.carol, `mans:${aid}`, c.answer);
  const res = lastPatch();
  check(text(res).includes("Daily streak"), `daily streak shown (${c.kind})`);
  check(q1("SELECT daily_streak FROM players WHERE discord_id = ?", U.carol.id).daily_streak === 1, "streak stored");
  check(q1("SELECT COUNT(*) AS n FROM ledger WHERE discord_id = ? AND reason = 'daily'", U.carol.id).n >= 2, "daily points + first-solver bonus");
  check(messagesTo(ARENA).some((m) => text(m).includes("daily")), "first solver celebrated in #arena");
  await click(U.carol, btnId);
  check(text(lastPatch()).includes("already"), "can't redo the daily");
}

section("help: every feature documented, pages in a menu");
{
  const h = await slash(U.carol, "help");
  check(h.data.flags === 64 && ids(h.data).includes("help"), "help is private with a topic menu");
  const opts = h.data.components[0].components[0].options.map((o: any) => o.value);
  check(!opts.includes("teacher"), "teacher page hidden from students");
  const all: string[] = [];
  for (const pg of opts) {
    const u = await call(raw(3, U.carol, { custom_id: "help", component_type: 3, values: [pg] }));
    check(u.type === 7 && u.data.embeds[0].title, `help page: ${pg}`);
    all.push(text(u));
  }
  const t2 = await slash(U.prof, "help", { topic: "teacher" });
  all.push(text(t2));
  const joined = all.join("\n");
  for (const cmd of ["/practice", "/daily", "/assignments", "/duel", "/profile", "/leaderboard", "/rival", "/bet", "/contest", "/link", "/teacher setup", "/teacher track", "/teacher verify", "/teacher season", "/teacher stop", "/teacher dashboard"]) {
    check(joined.includes(cmd), `help mentions ${cmd}`);
  }
  const pts = await slash(U.carol, "help", { topic: "points" });
  check(text(pts).includes("Multiple choice") && text(pts).includes("  96") && !text(pts).includes("{table}"), "points page shows the scoring table");
}

section("dashboard: password login (free alternative to Access)");
{
  env.ADMIN_PASSWORD = "correct horse battery";
  const req = (path: string, init: RequestInit = {}) => admin.fetch(new Request("https://dash.example.workers.dev" + path, { redirect: "manual", ...init }), env, makeCtx());
  check((await req("/api/me")).status === 401, "API refuses requests without a session");
  const home = await req("/");
  check(home.status === 303 && home.headers.get("location") === "/login", "dashboard redirects to the login page");
  check((await (await req("/login")).text()).includes('type="password"'), "login page served");
  const form = (pw: string) => ({ method: "POST", body: new URLSearchParams({ password: pw }), headers: { "content-type": "application/x-www-form-urlencoded" } });
  const bad = await req("/login", form("wrong guess"));
  check(bad.status === 401 && !bad.headers.get("set-cookie"), "wrong password rejected, no cookie");
  const good = await req("/login", form("correct horse battery"));
  const cookie = (good.headers.get("set-cookie") ?? "").split(";")[0];
  check(good.status === 303 && cookie.startsWith("cb_session=") && /HttpOnly/.test(good.headers.get("set-cookie") ?? ""), "right password sets an HTTP-only session cookie");
  const me = await req("/api/me", { headers: { cookie } });
  check(me.status === 200 && (await me.json() as any).mode === "password", "session cookie opens the API");
  const forged = cookie.replace(/.$/, (c) => (c === "a" ? "b" : "a"));
  check((await req("/api/me", { headers: { cookie: forged } })).status === 401, "tampered cookie refused");
  const expired = `cb_session=${clock.now() - 10}.${cookie.split(".")[1]}`;
  check((await req("/api/me", { headers: { cookie: expired } })).status === 401, "expired/altered expiry refused");
  const out = await req("/logout", { headers: { cookie } });
  check(out.status === 303 && /Max-Age=0/.test(out.headers.get("set-cookie") ?? ""), "sign out clears the cookie");
  env.ADMIN_PASSWORD = "a different password";
  check((await req("/api/me", { headers: { cookie } })).status === 401, "changing the password signs everyone out");
  delete env.ADMIN_PASSWORD;
}

section("dashboard API: access control");
{
  const locked = await api("GET", "/api/me");
  check(locked.status === 503, "dashboard locked until Access is configured");
  // configure Access with a real RSA key and a signed JWT
  const kp = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk: any = await crypto.subtle.exportKey("jwk", kp.publicKey);
  jwk.kid = "k1";
  access.jwks = { keys: [jwk] };
  env.TEAM_DOMAIN = "https://myteam.cloudflareaccess.com";
  env.POLICY_AUD = "aud123";
  const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "RS256", kid: "k1" }), body = b64({ aud: ["aud123"], email: "prof@school.edu", exp: clock.now() + 3600, iss: "https://myteam.cloudflareaccess.com" });
  const sig = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, new TextEncoder().encode(`${head}.${body}`))).toString("base64url");
  const jwt = `${head}.${body}.${sig}`;
  check((await api("GET", "/api/me")).status === 403, "no token → 403");
  check((await api("GET", "/api/me", undefined, { "cf-access-jwt-assertion": jwt.slice(0, -4) + "AAAA" })).status === 403, "bad signature → 403");
  const me = await api("GET", "/api/me", undefined, { "cf-access-jwt-assertion": jwt });
  check(me.status === 200 && me.data.email === "prof@school.edu", "valid Access token → teacher email");
  env.DEV_NO_AUTH = "true"; // simpler for the rest of the tests
}

section("dashboard API: overview, students, detail, CSV");
{
  const gl = await api("GET", "/api/guilds");
  check(gl.data.length === 1 && gl.data[0].name, "guild listed with its name");
  const ov = await api("GET", `/api/overview?g=${G}`);
  check(ov.status === 200 && ov.data.students >= 3 && ov.data.activity.length === 30, "overview data");
  const st = await api("GET", `/api/students?g=${G}`);
  check(st.data.length >= 3 && st.data.every((s: any) => "trend" in s && "accuracy" in s), "student list with trend & accuracy");
  const det = await api("GET", `/api/students/${U.bob.id}?g=${G}`);
  check(det.status === 200 && det.data.attempts.some((a: any) => a.status === "failed") && det.data.attempts.some((a: any) => a.status === "solved"), "student detail shows solved and failed challenges");
  check(det.data.weeks.length === 12 && det.data.duelList.length >= 1, "weekly points & duel history");
  const bonus = await api("POST", `/api/students/${U.bob.id}/points`, { g: G, amount: 15, reason: "Great teamwork", notify: true });
  check(bonus.status === 200 && q1("SELECT COUNT(*) AS n FROM ledger WHERE reason = 'bonus'").n === 1, "bonus points given");
  const csv = await api("GET", `/api/export.csv?g=${G}`);
  check(typeof csv.data === "string" && csv.data.includes("season_pts") && csv.data.split("\n").length >= 4, "CSV export");
  const claimId = q1("SELECT id FROM attempts WHERE status = 'claimed'").id;
  const rv = await api("POST", `/api/attempts/${claimId}/review`, { g: G, approve: true });
  check(rv.status === 200 && q1("SELECT verified FROM attempts WHERE id = ?", claimId).verified === 1, "teacher approves a self-reported solve");
}

section("dashboard API: challenge bank, AI draft, edit + regrade, reports");
{
  const list = await api("GET", `/api/challenges?g=${G}`);
  check(list.data.length > 50, "bank listed");
  const gen = await api("POST", "/api/challenges/generate", { g: G, difficulty: "easy", kind: "output" });
  check(gen.status === 200 && gen.data.code, "AI draft generated");
  const created = await api("POST", "/api/challenges", { g: G, ...gen.data, difficulty: "easy", source: "ai" });
  check(created.status === 200 && created.data.id, "draft saved");
  const bad = await api("POST", "/api/challenges", { g: G, kind: "mcq", difficulty: "easy", title: "x", choices: ["a"], answer: "A" });
  check(bad.status === 400, "invalid challenge rejected");
  const imp = await api("POST", "/api/challenges/import", { g: G, url: "https://www.hackerrank.com/challenges/two-sum-fun/problem" });
  check(imp.status === 200 && imp.data.title === "Imported two-sum-fun" && imp.data.difficulty === "medium", "HackerRank import fetches title & difficulty");
  // teacher writes an output challenge with a wrong answer; a student gets "failed"; teacher fixes → regrade
  const mine = await api("POST", "/api/challenges", { g: G, kind: "output", difficulty: "hard", title: "Teacher special", code: "print(6 * 7)", answer: "41" });
  const cid = mine.data.id;
  db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, status, tries, answer_given, started_at, finished_at) VALUES (?, ?, ?, 'practice', 'failed', 2, '42', ?, ?)").run(G, U.carol.id, cid, clock.now(), clock.now());
  const upd = await api("PUT", `/api/challenges/${cid}`, { g: G, answer: "42", regrade: true });
  check(upd.status === 200 && upd.data.regraded === 1, "fixing an answer regrades students who were right");
  check(q1("SELECT status FROM attempts WHERE challenge_id = ? AND discord_id = ?", cid, U.carol.id).status === "solved", "regraded attempt now solved");
  const reps = await api("GET", `/api/reports?g=${G}`);
  check(reps.data.length === 1, "open report listed");
  const res = await api("POST", "/api/reports/resolve", { g: G, challenge_id: reps.data[0].challenge_id, action: "keep" });
  check(res.status === 200 && q1("SELECT status FROM challenges WHERE id = ?", reps.data[0].challenge_id).status === "active", "report resolved, challenge back in rotation");
}

section("dashboard API: write-code problems, scoring, HackerRank links, diagnostics");
{
  const bad = await api("POST", "/api/challenges", { g: G, kind: "write", difficulty: "medium", title: "Double", question: "Read n, print 2n.", solution: "print(int(input())*2)", tests: [{ input: "3\n" }] });
  check(bad.status === 400 && /at least 2 tests/.test(bad.data.error), "write problem needs tests");
  const crash = await api("POST", "/api/challenges", { g: G, kind: "write", difficulty: "medium", title: "Double", question: "Read n, print 2n.", solution: "print(int(input())*2", tests: [{ input: "3\n" }, { input: "5\n" }] });
  check(crash.status === 400 && /doesn't compile/.test(crash.data.error), "broken reference solution rejected");
  const w = await api("POST", "/api/challenges", { g: G, kind: "write", difficulty: "medium", title: "Double", question: "Read n, print 2n.", hint: "Multiply.", solution: "print(int(input())*2)", tests: [{ input: "3\n", sample: true }, { input: "5\n" }, { input: "-7\n" }], time_limit: 1 });
  check(w.status === 200 && w.data.kind === "write" && w.data.time_limit === 1, "teacher creates a write-code problem");
  const det = await api("GET", `/api/challenges/${w.data.id}?g=${G}`);
  check(det.data.tests.map((x: any) => x.expected).join(",") === "6,10,-14" && det.data.tests[0].sample === 1, "expected outputs computed from the teacher's solution");
  const upd = await api("PUT", `/api/challenges/${w.data.id}`, { g: G, tests: [{ input: "1\n", sample: true }, { input: "2\n" }], solution: "print(int(input())*3)" });
  check(upd.status === 200 && upd.data.tests.map((x: any) => x.expected).join(",") === "3,6", "tests and solution can be edited (outputs recomputed)");
  // a student solves it
  await api("POST", "/api/assignments", { g: G, challenge_id: w.data.id, students: [U.bob.id], notify: "dm" });
  const asg = q1("SELECT id FROM assignments WHERE challenge_id = ? AND discord_id = ?", w.data.id, U.bob.id).id;
  await click(U.bob, `astart:${asg}`);
  const aid = Number(ids(lastPatch()).find((i) => i.startsWith("sub:"))!.split(":")[1]);
  await select(U.bob, `lang:${aid}`, ["python"]);
  await submit(U.bob, `msub:${aid}`, "print(int(input())*3)");
  check(text(lastPatch()).includes("Accepted"), "student solves the teacher's problem");
  const sd = await api("GET", `/api/students/${U.bob.id}?g=${G}`);
  const row = sd.data.attempts.find((a: any) => a.id === aid);
  check(row?.answer_given?.includes("*3") && JSON.parse(row.result).verdict === "accepted", "teacher sees the submitted code and verdict");

  const gw = await api("POST", "/api/challenges/generate", { g: G, difficulty: "hard", kind: "write", topic: "streaks" });
  check(gw.status === 200 && gw.data.saved && gw.data.challenge.kind === "write", "AI write-code problem generated, verified and saved from the dashboard");

  const s0 = await api("GET", `/api/settings?g=${G}`);
  check(s0.data.scoring.mult.mcq === 1 && s0.data.scoring.mult.bug === 5 && s0.data.arena_channel === ARENA, "settings expose scoring and arena");
  const s1 = await api("PUT", "/api/settings", { g: G, scoring: { ...s0.data.scoring, mult: { ...s0.data.scoring.mult, output: 4 }, base: { easy: 2, medium: 6, hard: 15 } } });
  check(s1.data.scoring.mult.output === 4 && s1.data.scoring.base.hard === 15 && s1.data.scoring_custom, "teacher changes points per type");
  const hp = await slash(U.carol, "help", { topic: "points" });
  check(text(hp).includes(" 150") && text(hp).includes("  60"), "new scoring shown in /help (hard HackerRank 15 × 10 = 150, hard output 15 × 4 = 60)");
  await api("PUT", "/api/settings", { g: G, scoring: null });
  check(!(await api("GET", `/api/settings?g=${G}`)).data.scoring_custom, "scoring reset to defaults");

  await slash({ id: "105", name: "Eve", teacher: false }, "link", { username: "eve_hr" });
  const v = await api("POST", `/api/students/105/hackerrank`, { g: G });
  check(v.status === 200 && q1("SELECT hr_verified FROM players WHERE discord_id = '105'").hr_verified === 1, "teacher verifies a link from the dashboard");
  await api("POST", `/api/students/105/hackerrank`, { g: G, action: "unlink" });
  check(q1("SELECT hr_username FROM players WHERE discord_id = '105'").hr_username === null, "teacher removes a link");

  const dg = await api("GET", `/api/diagnostics?g=${G}`);
  check(dg.status === 200 && dg.data.runner.ok && dg.data.ai.ok && dg.data.arena === ARENA && dg.data.bank.length > 5, "diagnostics: runner, AI, arena, bank");
}

section("dashboard API: assignments with DMs, start, on-time, reminder, missed");
{
  const cid = q1("SELECT id FROM challenges WHERE kind = 'mcq' AND lang = 'en' AND guild_id IS NULL LIMIT 1").id;
  const due = clock.now() + 2 * 86400;
  const r = await api("POST", "/api/assignments", { g: G, challenge_id: cid, students: [U.alice.id, U.carol.id], due_at: due, note: "Revise hashing first" });
  check(r.status === 200 && r.data.created === 2 && r.data.dms === 2 && r.data.posted, "assignment created, DMs + channel message");
  const asgA = q1("SELECT id FROM assignments WHERE discord_id = ? AND challenge_id = ?", U.alice.id, cid).id;
  const notMine = await click(U.bob, `astart:${asgA}`);
  check(text(notMine).includes("isn't for you"), "others can't open your assignment");
  const lst = await slash(U.alice, "assignments");
  check(ids(lst.data).includes(`astart:${asgA}`), "/assignments lists it");
  await click(U.alice, `abatch:${cid}`);
  const open = lastPatch();
  check(text(open).includes("Revise hashing"), "teacher note shown");
  const aid = Number(ids(open).find((i) => i.startsWith("ans:"))!.split(":")[1]);
  const c = solveAnswer(cid);
  await click(U.alice, `ans:${aid}:${c.answer}`);
  check(q1("SELECT status FROM assignments WHERE id = ?", asgA).status === "done", "assignment done on time");
  const dmsBefore = discordCalls.filter((x) => x.path.startsWith("/channels/dm-")).length;
  clock.advance(86400 + 3600);
  await runCron(env);
  check(discordCalls.filter((x) => x.path.startsWith("/channels/dm-")).length === dmsBefore + 1, "reminder DM 24h before due");
  clock.advance(86400);
  await runCron(env);
  const asgC = q1("SELECT status FROM assignments WHERE discord_id = ? AND challenge_id = ?", U.carol.id, cid);
  check(asgC.status === "missed", "missed assignment after due date");
  const det = await api("GET", `/api/students/${U.carol.id}?g=${G}`);
  check(det.data.assignments.some((a: any) => a.status === "missed"), "dashboard shows the missed assignment");
}

section("teams, rivals, profile, leaderboards, help");
{
  const t1 = await api("POST", "/api/teams", { g: G, name: "Owls" });
  await api("POST", "/api/teams", { g: G, name: "Foxes" });
  const owls = t1.data.find((t: any) => t.name === "Owls");
  const foxes = (await api("GET", `/api/teams?g=${G}`)).data.find((t: any) => t.name === "Foxes");
  await api("PUT", `/api/teams/${owls.id}/members`, { g: G, members: [U.alice.id, U.carol.id] });
  const tm = await api("PUT", `/api/teams/${foxes.id}/members`, { g: G, members: [U.bob.id] });
  check(tm.data.find((t: any) => t.name === "Owls").members.length === 2, "teams with members");
  const rv = await slash(U.bob, "rival", { member: U.alice.id }, "add");
  check(text(rv).includes("rival"), "rival added");
  const rl = await slash(U.bob, "rival", {}, "list");
  check(text(rl).includes("duels **0–1**"), "head-to-head includes the duel bob lost");
  const pf = await slash(U.alice, "profile");
  check(text(pf).includes("Level") && text(pf).includes("Duelist"), "profile with level and badges");
  for (const b of ["season", "level", "duels", "coins", "teams"]) {
    const lb = await slash(U.carol, "leaderboard", { board: b });
    check(lb.type === 4 && lb.data.embeds?.[0]?.title, `leaderboard: ${b}`);
  }
  check((await slash(U.carol, "help")).data.flags === 64, "help is private");
}

section("contest: tracking, bets, commentary, rivals, freeze, reveal, awards, teams, roles, replay");
{
  await api("PUT", "/api/settings", { g: G, champion_role: "r1", streak_role: "r2" });
  const t0 = clock.now();
  hr.contests["algo-1"] = { name: "Algo Week 1", start: t0 + 120, end: t0 + 3600 };
  hr.boards["algo-1"] = [];
  const tr = await slash(U.prof, "teacher", { link: "https://www.hackerrank.com/contests/algo-1/challenges", freeze_minutes: 15 }, "track");
  check(text(lastPatch()).includes("Now tracking"), "contest tracked");
  void tr;
  const ac = await call(raw(4, U.alice, { name: "bet", options: [{ type: 1, name: "place", options: [{ name: "player", value: "bo", focused: true }] }] }));
  check(ac.type === 8 && ac.data.choices.some((c: any) => c.value === "bob_hr"), "bet autocomplete suggests players");
  await slash(U.alice, "bet", { player: "bob_hr", amount: 20 }, "place");
  await slash(U.carol, "bet", { player: "Alice_HR", amount: 10 }, "place");
  const coinsAlice = q1("SELECT coins FROM players WHERE discord_id = ?", U.alice.id).coins;

  const board = (rows: [string, number][]) => {
    const sorted = [...rows].sort((a, b) => b[1] - a[1]);
    hr.boards["algo-1"] = sorted.map(([u, s], i) => ({ username: u, score: s, rank: 1 + sorted.filter((x) => x[1] > s).length, time_taken: 600 + i * 60 }));
  };
  const tick = async (sec: number) => { clock.advance(sec); await runCron(env); };
  await tick(130); // started
  check(messagesTo(ARENA).some((m) => text(m).includes("has started")), "start announced");
  check(messagesTo(ARENA).some((m) => text(m).includes("Predictions are closed")), "bets closed at start");
  board([["Alice_HR", 0], ["bob_hr", 0]]);
  await tick(300);
  board([["Alice_HR", 20], ["bob_hr", 0], ["stranger", 5]]);
  await tick(300);
  check(messagesTo(ARENA).some((m) => /first blood/i.test(text(m))), "first blood commentary");
  board([["Alice_HR", 20], ["bob_hr", 50], ["stranger", 5], ["carol_hr", 10]]);
  await tick(300); // t+1030
  check(messagesTo(ARENA).some((m) => text(m).match(/1st place from|New leader|Change at the top|storms to the top/)), "lead change commentary");
  board([["Alice_HR", 90], ["bob_hr", 85], ["stranger", 5], ["carol_hr", 10]]);
  await tick(300); // t+1330: alice passes bob, and alice is bob's rival
  check(messagesTo(ARENA).some((m) => text(m).includes("your rival") && text(m).includes(`<@${U.bob.id}>`)), "bob is pinged when his rival passes him");
  board([["Alice_HR", 90], ["bob_hr", 100], ["stranger", 5], ["carol_hr", 10]]);
  await tick(1400); // t+2730: inside the 15-minute freeze
  check(messagesTo(ARENA).some((m) => text(m).includes("frozen")), "board frozen");
  const st = await slash(U.carol, "contest", {}, "standings");
  check(text(st).includes("frozen"), "standings show the frozen board");
  const updatesBefore = messagesTo(ARENA).filter((m) => text(m).includes("leaderboard update")).length;
  board([["Alice_HR", 90], ["bob_hr", 120], ["stranger", 5], ["carol_hr", 60]]);
  await tick(300); // t+3030: still frozen, no updates
  check(messagesTo(ARENA).filter((m) => text(m).includes("leaderboard update")).length === updatesBefore, "no updates leak during the freeze");
  await tick(600); // t+3630: after the end
  const c = q1("SELECT * FROM contests WHERE slug = 'algo-1'");
  check(c.status === "finished", "contest finished");
  const msgs = messagesTo(ARENA).map(text).join("\n");
  check(msgs.includes("Time's up") && msgs.includes("And the winner is"), "suspense reveal posted");
  check(msgs.includes("final results") && msgs.includes("bob_hr"), "final podium posted");
  check(msgs.includes("Special awards"), "awards posted");
  check(msgs.includes("Team results"), "team results posted");
  check(msgs.includes("Prediction results"), "bet results posted");
  check(msgs.includes("/replay/" + c.id), "replay link posted");
  check(q1("SELECT coins FROM players WHERE discord_id = ?", U.alice.id).coins === coinsAlice + 60, "winning bet paid ×3");
  check(q1("SELECT COUNT(*) AS n FROM contest_results WHERE contest_id = ?", c.id).n === 4, "results stored");
  check(q1("SELECT discord_id FROM contest_results WHERE contest_id = ? AND hr_username = 'bob_hr'", c.id).discord_id === U.bob.id, "results linked to Discord users");
  check(q1("SELECT COUNT(*) AS n FROM ledger WHERE reason = 'contest' AND discord_id IS NULL AND hr_username = 'stranger'").n === 1, "unlinked participant's points kept by username");
  check(discordCalls.some((x) => x.method === "PUT" && x.path === `/guilds/${G}/members/${U.bob.id}/roles/r1`), "champion role given to the winner");
  check(q1("SELECT COUNT(*) AS n FROM team_points WHERE contest_id = ?", c.id).n === 2, "team points stored");
  const rep = await bot.fetch(new Request(`https://bot.example.workers.dev/replay/${c.id}/data`), env, makeCtx());
  const repData: any = await rep.json();
  check(rep.status === 200 && repData.snaps.length >= 3 && repData.final[0].hr_display === "bob_hr", "replay data served");
  const page = await bot.fetch(new Request(`https://bot.example.workers.dev/replay/${c.id}`), env, makeCtx());
  check(page.status === 200 && (await page.text()).includes("race replay"), "replay page served");
  const det = await api("GET", `/api/contests/${c.id}?g=${G}`);
  check(det.data.results.length === 4 && det.data.awards.length >= 1, "dashboard contest detail");
  // linking later attaches earlier contest points
  const dan = { id: "104", name: "Dan", teacher: false };
  await slash(dan, "link", { username: "stranger" });
  check(q1("SELECT COUNT(*) AS n FROM ledger WHERE discord_id = '104' AND reason = 'contest'").n === 0, "an unverified link claims nothing");
  hr.profiles["stranger"] = "bio " + q1("SELECT hr_code FROM players WHERE discord_id = '104'").hr_code;
  await click(dan, "hrv:0");
  check(q1("SELECT COUNT(*) AS n FROM ledger WHERE discord_id = '104' AND reason = 'contest'").n === 1, "verifying later claims earlier contest points");
}

section("season, weekly digest, contest via dashboard, stop");
{
  const s = await slash(U.prof, "teacher", { name: "Spring 2027" }, "season");
  check(text(s).includes("Spring 2027") && text(s).includes("champion"), "new season announced with last champion");
  const lb = await slash(U.alice, "leaderboard", { board: "season" });
  check(text(lb).includes("Nothing here yet"), "new season starts from zero");
  // jump to next Monday 10:00 UTC for the digest
  const d = new Date(Date.now());
  const add = ((8 - d.getUTCDay()) % 7 || 7) * 86400;
  clock.advance(add);
  await runCron(env);
  check(messagesTo(ARENA).some((m) => text(m).includes("Weekly recap")), "weekly recap posted on Monday");
  hr.contests["algo-2"] = { name: "Algo Week 2", start: clock.now() - 60, end: clock.now() + 3600 };
  hr.boards["algo-2"] = [{ username: "Alice_HR", rank: 1, score: 10, time_taken: 100 }];
  const created = await api("POST", "/api/contests", { g: G, link: "algo-2", channel_id: "c2", interval: 5, freeze: 0 });
  check(created.status === 200 && created.data.slug === "algo-2", "contest tracked from the dashboard");
  check(messagesTo("c2").some((m) => text(m).includes("Now tracking")), "tracking card posted to the chosen channel");
  await api("POST", `/api/contests/${created.data.id}/stop`, { g: G, announce: true });
  clock.advance(60);
  await runCron(env);
  check(q1("SELECT status FROM contests WHERE id = ?", created.data.id).status === "finished", "stopped contest finishes with results");
  const settings = await api("GET", `/api/settings?g=${G}`);
  check(settings.data.season === "Spring 2027", "settings reflect the season");
  const dinfo = await api("GET", `/api/discord?g=${G}`);
  check(dinfo.data.channels.length === 3 && dinfo.data.roles.length >= 2 && !dinfo.data.roles.some((r: any) => r.name === "@everyone"), "channel & role pickers (text channels only, no @everyone)");
}

section("JavaScript & PHP: class languages, quick bank, judge with big tests, starter code");
{
  const r = await slash(U.prof, "teacher", { code_language: "javascript,php" }, "setup");
  check(text(r).includes("JavaScript") && text(r).includes("PHP"), "class set to JavaScript + PHP");
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    await slash(U.carol, "practice", { difficulty: "medium", type: "output" });
    const aid = Number(ids(lastPatch()).find((x) => x.startsWith("ansm:"))!.split(":")[1]);
    seen.add(q1("SELECT c.code_lang FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.id = ?", aid).code_lang);
  }
  check([...seen].every((l) => l === "javascript" || l === "php") && seen.size === 2, `quick challenges come from the JS and PHP banks (${[...seen]})`);
  await slash(U.carol, "practice", { difficulty: "hard", type: "bug", language: "php" });
  const aidP = Number(ids(lastPatch()).find((x) => x.startsWith("ans:"))!.split(":")[1]);
  check(q1("SELECT c.code_lang FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.id = ?", aidP).code_lang === "php", "language:php gives a PHP challenge");
  check(q1("SELECT code_lang FROM players WHERE discord_id = ?", U.carol.id).code_lang === "php", "the language choice is remembered");
  check(q("SELECT COUNT(*) AS n, code_lang FROM challenges WHERE source = 'seed' AND kind != 'write' AND code_lang IN ('javascript', 'php') GROUP BY code_lang").every((x: any) => x.n >= 50), "JS and PHP quick banks loaded (EN + FR)");

  // a write-code problem with a generated 200,000-number test, solved in JavaScript and PHP
  const c = q1("SELECT * FROM challenges WHERE title = 'Best streak' ORDER BY id DESC LIMIT 1");
  const start = (u: User) => {
    db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, started_at) VALUES (?, ?, ?, 'practice', ?)").run(G, u.id, c.id, clock.now());
    return q1("SELECT id FROM attempts WHERE discord_id = ? ORDER BY id DESC LIMIT 1", u.id).id;
  };
  const aJ = start(U.alice);
  await select(U.alice, `lang:${aJ}`, ["javascript"]);
  const form = await click(U.alice, `sub:${aJ}`);
  check(text(form).includes("readFileSync(0") && text(form).includes("JavaScript"), "the form starts with a JavaScript template that reads stdin");
  await submit(U.alice, `msub:${aJ}`, "const d=require('fs').readFileSync(0,'utf8').trim().split(/\\s+/).map(Number);let s=0,best=-Infinity;for(let i=1;i<=d[0];i++){s=Math.max(d[i],s+d[i]);best=Math.max(best,s)}\nconsole.log(best)");
  check(text(lastPatch()).includes("Accepted") && q1("SELECT result FROM attempts WHERE id = ?", aJ).result.includes('"passed":7'), "JavaScript solution accepted on all 7 tests (incl. the big generated one)");
  const aS = start(U.bob);
  await select(U.bob, `lang:${aS}`, ["javascript"]);
  await submit(U.bob, `msub:${aS}`, "const d=require('fs').readFileSync(0,'utf8').trim().split(/\\s+/).map(Number);let best=-Infinity;for(let i=1;i<=d[0];i++){let s=0;for(let j=i;j<=d[0];j++){s+=d[j];if(s>best)best=s}}console.log(best)");
  check(text(lastPatch()).includes("Time limit exceeded"), "O(n²) JavaScript times out on the big test");
  const aP = start(U.carol);
  await select(U.carol, `lang:${aP}`, ["php"]);
  check(text(await click(U.carol, `sub:${aP}`)).includes("stream_get_contents"), "PHP template");
  await submit(U.carol, `msub:${aP}`, "<?php\n$a=array_map('intval',preg_split('/\\s+/',trim(stream_get_contents(STDIN))));$n=$a[0];$b=$c=$a[1];for($i=2;$i<=$n;$i++){$c=max($a[$i],$c+$a[$i]);$b=max($b,$c);}echo $b;");
  check(text(lastPatch()).includes("Accepted"), "PHP solution accepted");
  const aE = start(U.prof);
  await select(U.prof, `lang:${aE}`, ["php"]);
  await submit(U.prof, `msub:${aE}`, "<?php echo 1");
  check(text(lastPatch()).includes("syntax error"), "PHP syntax error reported");
  check(runner.calls > 0, "runs went through the Wandbox runner");

  // commands reach Discord by themselves after an update
  db.prepare("UPDATE guilds SET commands_version = NULL").run();
  await runCron(env);
  const put = discordCalls.filter((x) => x.method === "PUT" && x.path === `/applications/app1/guilds/${G}/commands`).pop();
  check(put && put.body.some((c: any) => c.name === "practice" && c.options.some((o: any) => o.name === "language")), "cron re-registers the slash commands");
  const n = discordCalls.length;
  await runCron(env);
  check(!discordCalls.slice(n).some((x) => x.path.endsWith("/commands")), "…only once");

  // a database that wasn't migrated gives a clear message instead of "Something went wrong"
  db.exec("ALTER TABLE ai_queue RENAME TO ai_queue_x");
  await slash(U.alice, "practice", { difficulty: "easy", type: "mcq", topic: "closures" });
  check(text(lastPatch()).includes("db:migrate"), "missing table → tells the teacher to run db:migrate");
  db.exec("ALTER TABLE ai_queue_x RENAME TO ai_queue");
  await slash(U.prof, "teacher", { code_language: "python" }, "setup");
}

section("dashboard: daily challenge settings, pinned challenges, post now");
{
  await slash(U.prof, "teacher", { code_language: "javascript,php" }, "setup");
  const d0 = await api("GET", `/api/daily?g=${G}`);
  check(d0.status === 200 && d0.data.upcoming.length === 14 && d0.data.config.plan.length === 7, "daily overview: plan and next 14 days");
  const plan = Array.from({ length: 7 }, () => ["hard", "output"]);
  const s1 = await api("PUT", "/api/daily/settings", { g: G, langs: ["javascript"], plan, channel_id: "c2", hour: 7 });
  check(s1.data.config.langs.join() === "javascript" && s1.data.hour === 7 && s1.data.channel === "c2", "language, plan, channel and hour saved");
  const today = s1.data.upcoming[0].day;
  // random pick follows the plan and the language
  db.prepare("UPDATE guilds SET last_daily = NULL").run();
  db.prepare("DELETE FROM daily WHERE guild_id = ? AND day = ?").run(G, today);
  await runCron(env);
  const dl = q1("SELECT c.* FROM daily d JOIN challenges c ON c.id = d.challenge_id WHERE d.guild_id = ? AND d.day = ?", G, today);
  check(dl && dl.code_lang === "javascript" && dl.kind === "output" && dl.difficulty === "hard", `daily follows the plan and the language (${dl?.code_lang} ${dl?.kind} ${dl?.difficulty})`);
  check(messagesTo("c2").some((m) => text(m).includes("dsolve:")), "posted in the chosen channel");
  // pin a specific challenge for tomorrow, then post one now
  const tomorrow = s1.data.upcoming[1].day;
  const pick = q1("SELECT id, title FROM challenges WHERE kind = 'write' AND lang = 'en' AND difficulty = 'easy' LIMIT 1");
  const p1 = await api("POST", "/api/daily/pins", { g: G, day: tomorrow, challenge_id: pick.id });
  check(p1.data.upcoming[1].pin?.id === pick.id, "challenge pinned to a date");
  check((await api("POST", "/api/daily/pins", { g: G, day: "2020-01-01", challenge_id: pick.id })).status === 400, "can't pin in the past");
  const now1 = await api("POST", "/api/daily/post", { g: G, challenge_id: pick.id, channel_id: "c1" });
  check(now1.status === 200 && now1.data.today.id === pick.id && messagesTo("c1").some((m) => text(m).includes(pick.title)), "post now replaces today's daily (in another channel)");
  const r2 = await api("POST", "/api/daily/post", { g: G, difficulty: "medium", kind: "bug", langs: ["php"] });
  check(r2.status === 200 && q1("SELECT c.code_lang FROM daily d JOIN challenges c ON c.id = d.challenge_id WHERE d.guild_id = ? AND d.day = ?", G, today).code_lang === "php", "post a random PHP bug now");
  // tomorrow's cron uses the pin
  clock.advance(86400);
  await runCron(env);
  check(q1("SELECT challenge_id FROM daily WHERE guild_id = ? AND day = ?", G, tomorrow)?.challenge_id === pick.id, "the pinned challenge is posted on its day");
  const off = await api("PUT", "/api/daily/settings", { g: G, enabled: false });
  check(off.data.config.enabled === false, "daily can be paused");
  clock.advance(86400);
  await runCron(env);
  check(!q1("SELECT 1 FROM daily WHERE guild_id = ? AND day = ?", G, new Date(Date.now()).toISOString().slice(0, 10)), "nothing posted while paused");
  await api("PUT", "/api/daily/settings", { g: G, enabled: true, langs: [], channel_id: "" });
  await slash(U.prof, "teacher", { code_language: "python" }, "setup");
}

section("dashboard: points for everyone or selected students, resets");
{
  const season = (id: string) => q1("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE discord_id = ? AND season = (SELECT season FROM guilds WHERE id = ?)", id, G).s;
  const total = (id: string) => q1("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE discord_id = ?", id).s;
  const players = q("SELECT discord_id FROM players WHERE guild_id = ?", G).map((r: any) => r.discord_id);
  const before = Object.fromEntries(players.map((p: string) => [p, season(p)]));
  const a1 = await api("POST", "/api/points/bulk", { g: G, all: true, action: "add", amount: 10, reason: "Workshop" });
  check(a1.status === 200 && players.every((p: string) => season(p) === before[p] + 10), "+10 for everyone");
  const dmsBefore = discordCalls.filter((x) => x.path.startsWith("/channels/dm-")).length;
  await api("POST", "/api/points/bulk", { g: G, students: [U.bob.id], action: "remove", amount: 4, notify: true });
  check(season(U.bob.id) === before[U.bob.id] + 6, "−4 for one student");
  check(discordCalls.filter((x) => x.path.startsWith("/channels/dm-")).length === dmsBefore + 1, "student told in a DM");
  await api("POST", "/api/points/bulk", { g: G, students: [U.alice.id, U.carol.id], action: "set", amount: 50, scope: "season" });
  check(season(U.alice.id) === 50 && season(U.carol.id) === 50, "set two students to 50 season points");
  check((await api("POST", "/api/points/bulk", { g: G, all: true, action: "add", amount: 0 })).status === 400, "adding 0 is refused");
  await api("POST", "/api/points/bulk", { g: G, all: true, action: "set", amount: 0, scope: "season" });
  check(players.every((p: string) => season(p) === 0) && total(U.alice.id) > 0, "season reset: leaderboard at 0, levels kept");
  await api("POST", "/api/points/bulk", { g: G, all: true, action: "set", amount: 0, scope: "all" });
  check(players.every((p: string) => total(p) === 0 && season(p) === 0), "full reset: every season at 0");
  const det = await api("GET", `/api/students/${U.alice.id}?g=${G}`);
  check(det.data.ledger.some((l: any) => l.reason === "adjust"), "adjustments visible in the points log");
}

section("anti-cheat: function mode, code editor, typing record, explain your code, similarity, images, sessions");
{
  await api("PUT", "/api/settings", { g: G, integrity: { editor: "required", explain: true, similarity: true, codeImage: true, quickLimit: 30 } });
  const st = await api("GET", `/api/settings?g=${G}`);
  check(st.data.integrity.editor === "required" && st.data.integrity.quickLimit === 30, "anti-cheat settings saved");

  // quick challenges: code as an image, time limit
  await slash(U.alice, "practice", { difficulty: "easy", type: "output" });
  let p = lastPatch();
  const imgUrl = p.embeds[0].image?.url ?? "";
  check(/\/img\/\d+\.png\?v=/.test(imgUrl) && !text(p).includes("```"), "quick challenge code shown as an image, not as copyable text");
  check(text(p).includes("30 s"), "time limit shown");
  const img = await bot.fetch(new Request(imgUrl), env, makeCtx());
  const bytes = new Uint8Array(await img.arrayBuffer());
  check(img.status === 200 && img.headers.get("content-type") === "image/png" && bytes[1] === 0x50 && bytes.length > 500, "the image is a real PNG");
  const aq = Number(ids(p).find((i) => i.startsWith("ansm:"))!.split(":")[1]);
  clock.advance(45);
  await submit(U.alice, `mans:${aq}`, solveAnswer(q1("SELECT challenge_id FROM attempts WHERE id = ?", aq).challenge_id).answer);
  check(text(lastPatch()).includes("Too late") && q1("SELECT status FROM attempts WHERE id = ?", aq).status === "failed", "answer after the time limit doesn't count");

  // write-code: only through the editor page
  const rl = q1("SELECT * FROM challenges WHERE source = 'seed' AND test_set = 'run-length' AND lang = 'en'");
  db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, started_at) VALUES (?, ?, ?, 'practice', ?)").run(G, U.alice.id, rl.id, clock.now());
  const aid = q1("SELECT id FROM attempts WHERE discord_id = ? ORDER BY id DESC LIMIT 1", U.alice.id).id;
  const blocked = await click(U.alice, `sub:${aid}`);
  const link = blocked.data?.components?.[0]?.components?.[0]?.url ?? "";
  check(blocked.data?.flags === 64 && /\/code\/\d+\.\d+\.\d+\.[\w-]{32}$/.test(link), "Submit gives a private editor link instead of a Discord form");
  const path = new URL(link).pathname;
  const ed = (sub = "", body?: any) => bot.fetch(new Request("https://bot.example.workers.dev" + path + sub, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}), env, makeCtx());
  const page = await ed();
  check(page.status === 200 && (await page.text()).includes("CodeMirror"), "editor page served");
  const forged = await bot.fetch(new Request("https://bot.example.workers.dev" + path.replace(/.$/, (c) => (c === "a" ? "b" : "a")) + "/data"), env, makeCtx());
  check(forged.status === 403, "a forged link is refused");
  const data: any = await (await ed("/data")).json();
  check(data.fn && data.fn.examples[0].call === 'solve("aaabccdddd")' && data.fn.examples[0].result === '"a3b1c2d4"', "examples shown as function calls");
  const js = data.langs.find((l: any) => l.id === "javascript");
  check(js.header === "function solve(s)" && js.starter.includes("function solve(s)") && js.starter.includes("console.log"), "JavaScript starter: solve(s) + input/output already written");
  check(data.langs.find((l: any) => l.id === "php").starter.includes("function solve($s)"), "PHP starter");
  const realSolve = `function solve(s) {
  let r = "";
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j < s.length && s[j] === s[i]) j++;
    r += s[i] + (j - i);
    i = j;
  }
  return r;
}`;
  const code = js.starter.replace(/function solve\(s\) \{[\s\S]*?\n\}/, realSolve);
  const runRes: any = await (await ed("/run", { code, lang: "javascript" })).json();
  check(runRes.rows?.length === 2 && runRes.rows.every((r: any) => r.ok), "▶ Run samples: both samples pass");
  // typed character by character, with a few corrections, never leaving the page
  const typed = realSolve.split("");
  const changes: any[] = [[0, 0, 0, js.starter, "setValue"]];
  typed.forEach((ch, i) => { changes.push([2000 + i * 180, 100 + i, 0, ch, "+input"]); if (i % 40 === 0) changes.push([2050 + i * 180, 100 + i, 1, "", "+delete"]); });
  const sub1: any = await (await ed("/submit", { code, lang: "javascript", log: { changes, focus: [], pastes: 0, openMs: 2000 + typed.length * 180 } })).json();
  check(sub1.status === "solved" && sub1.result.verdict === "accepted", "accepted in the editor");
  const at = q1("SELECT * FROM attempts WHERE id = ?", aid);
  check(at.held > 0 && at.points + at.held === pointsForTest(), `half the points held for the explanation (${at.points} + ${at.held})`);
  check(JSON.parse(at.integrity).level === 0 && q1("SELECT COUNT(*) AS n FROM attempt_logs WHERE attempt_id = ?", aid).n === 1, "honest typing: no flag, replay stored");
  const ex: any = await (await ed("/explain", {})).json();
  check(ex.explain?.questions?.length === 2 && ex.explain.deadline > clock.now(), "2 questions about their own code");
  const ans: any = await (await ed("/answer", { answers: ["r builds the encoded string", "an empty string, because the loop never runs"] })).json();
  check(ans.explain.done && ans.explain.score === 0.75, "answers graded (75%)");
  const after = q1("SELECT points, held FROM attempts WHERE id = ?", aid);
  check(after.held === 0 && after.points === at.points + Math.round(at.held * 0.75), "75% of the held points given");

  // a suspicious submission: pastes, code appearing at once, leaving the page, same code as alice
  db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, started_at) VALUES (?, ?, ?, 'practice', ?)").run(G, U.bob.id, rl.id, clock.now());
  const bid = q1("SELECT id FROM attempts WHERE discord_id = ? ORDER BY id DESC LIMIT 1", U.bob.id).id;
  const bobLink = (await click(U.bob, `sub:${bid}`)).data.components[0].components[0].url;
  const bobPath = new URL(bobLink).pathname;
  const bobCode = code.replace(/\br\b/g, "out").replace(/\bj\b/g, "k");
  const sub2: any = await (await bot.fetch(new Request("https://bot.example.workers.dev" + bobPath + "/submit", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: bobCode, lang: "javascript", log: { changes: [[0, 0, 0, js.starter, "setValue"], [50000, 40, 60, realSolve, "+input"]], focus: [[5000, "blur"], [300000, "focus"], [301000, "blur"], [302000, "focus"], [303000, "blur"], [304000, "focus"]], pastes: 4, openMs: 310000 } }) }), env, makeCtx())).json();
  check(sub2.status === "solved", "bob's code is accepted (it works)…");
  const rep = JSON.parse(q1("SELECT integrity FROM attempts WHERE id = ?", bid).integrity);
  check(rep.level === 2 && rep.flags.some((f: string) => f.includes("paste")) && rep.flags.some((f: string) => f.includes("at once")) && rep.flags.some((f: string) => f.includes("Left the editor")), "…but flagged: pastes, code appearing at once, leaving the page");
  check(rep.flags.some((f: string) => f.includes("similar to Alice")), "similar to alice's code (renamed variables don't hide it)");
  check(JSON.parse(q1("SELECT integrity FROM attempts WHERE id = ?", aid).integrity).flags.some((f: string) => f.includes("similar to Bob")), "alice's attempt is flagged too");
  // bob can't explain
  await (await bot.fetch(new Request("https://bot.example.workers.dev" + bobPath + "/explain", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), env, makeCtx())).json();
  const bobAns: any = await (await bot.fetch(new Request("https://bot.example.workers.dev" + bobPath + "/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: ["", ""] }) }), env, makeCtx())).json();
  check(bobAns.explain.score === 0 && q1("SELECT held FROM attempts WHERE id = ?", bid).held === 0, "empty explanation: the held points are lost");
  check(JSON.parse(q1("SELECT integrity FROM attempts WHERE id = ?", bid).integrity).flags.some((f: string) => f.includes("Couldn't explain")), "flagged: couldn't explain their code");

  // dashboard: flagged list, replay, decision
  const list = await api("GET", `/api/integrity?g=${G}`);
  const bobRow = list.data.find((r: any) => r.id === bid);
  check(bobRow && bobRow.level === 2 && bobRow.has_log && bobRow.explain.score === 0, "teacher sees bob's flags, explanation and replay");
  const replay = await api("GET", `/api/attempts/${bid}/log?g=${G}`);
  check(replay.data.sessions.length === 1 && replay.data.sessions[0].changes.length === 2, "replay data");
  const ptsBefore = q1("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE discord_id = ?", U.bob.id).s;
  const bobPts = q1("SELECT points FROM attempts WHERE id = ?", bid).points;
  await api("POST", `/api/attempts/${bid}/integrity`, { g: G, action: "void", reason: "copied", notify: true });
  check(q1("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE discord_id = ?", U.bob.id).s === ptsBefore - bobPts && q1("SELECT points FROM attempts WHERE id = ?", bid).points === 0, "teacher removes the points");
  await api("POST", `/api/attempts/${aid}/integrity`, { g: G, action: "ok" });
  check(!(await api("GET", `/api/integrity?g=${G}`)).data.some((r: any) => r.id === aid || r.id === bid), "reviewed attempts leave the list");

  // with the editor optional, a Discord submission is marked
  await api("PUT", "/api/settings", { g: G, integrity: { editor: "optional", quickLimit: 0 } });
  await slash(U.carol, "practice", { difficulty: "easy", type: "write" });
  const cw = Number(ids(lastPatch()).find((i) => i.startsWith("sub:"))!.split(":")[1]);
  check(lastPatch().components.some((r: any) => r.components.some((x: any) => x.url?.includes("/code/"))), "optional editor: link and Discord form both offered");
  await submit(U.carol, `msub:${cw}`, "print(1)");
  check(JSON.parse(q1("SELECT integrity FROM attempts WHERE id = ?", cw).integrity).flags.some((f: string) => f.includes("not in the code editor")), "Discord submission noted (no typing record)");

  // class session
  await api("PUT", "/api/settings", { g: G, integrity: { editor: "required" } });
  const s1 = await api("POST", "/api/sessions", { g: G, title: "Quiz 1", challenge_ids: [rl.id], minutes: 30 });
  check(s1.status === 200 && messagesTo(ARENA).some((m) => text(m).includes("Quiz 1") && text(m).includes(`sopen:${s1.data.id}`)), "session announced in #arena with an Open button");
  const open = await click(U.carol, `sopen:${s1.data.id}`);
  check(ids(open.data).includes(`sgo:${s1.data.id}:${rl.id}`), "students see the session's challenges");
  await click(U.carol, `sgo:${s1.data.id}:${rl.id}`);
  const sp = lastPatch();
  const sLink = sp.components.flatMap((r: any) => r.components).find((x: any) => x.url)?.url;
  check(sLink && !ids(sp).some((i) => i.startsWith("sub:")), "session challenge: editor only");
  const sPath = new URL(sLink).pathname;
  const sData: any = await (await bot.fetch(new Request("https://bot.example.workers.dev" + sPath + "/data"), env, makeCtx())).json();
  await bot.fetch(new Request("https://bot.example.workers.dev" + sPath + "/submit", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: sData.langs.find((l: any) => l.id === "javascript").starter.replace(/function solve\(s\) \{[\s\S]*?\n\}/, realSolve), lang: "javascript", log: { changes: [[0, 0, 0, "x", "setValue"]], focus: [], pastes: 0, openMs: 1000 } }) }), env, makeCtx());
  const grid = await api("GET", `/api/sessions/${s1.data.id}?g=${G}`);
  check(grid.data.students.length === 1 && grid.data.students[0].cells[rl.id].status === "solved", "session results grid");
  clock.advance(31 * 60);
  await runCron(env);
  check(q1("SELECT status FROM sessions WHERE id = ?", s1.data.id).status === "finished" && messagesTo(ARENA).some((m) => text(m).includes("Quiz 1") && text(m).includes("over")), "session ends by itself, summary posted");
  check(text(await click(U.carol, `sopen:${s1.data.id}`)).includes("over"), "can't open a finished session");
  db.prepare("UPDATE guilds SET integrity = ? WHERE id = ?").run(JSON.stringify({ editor: "off", explain: false, codeImage: false, similarity: false }), G);
}

section("anti-farming: quick challenges shrink after a few a day, write code never does");
{
  const D = { id: "104", name: "Dave", teacher: false };
  clock.advance(86400);
  const mcqs = q("SELECT * FROM challenges WHERE kind = 'mcq' AND lang = 'en' AND status = 'active' AND id NOT IN (SELECT challenge_id FROM attempts WHERE discord_id = ?) ORDER BY id LIMIT 14", D.id);
  const base0 = (await api("GET", `/api/settings?g=${G}`)).data.scoring;
  const full = (c: any) => Math.max(1, Math.round(base0.base[c.difficulty] * base0.mult.mcq * 1.2));   // answered fast: +20%
  check(mcqs.length >= 13, "enough multiple-choice challenges for the test");
  const solveMcq = async (c: any, origin = "practice") => {
    db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, started_at) VALUES (?, ?, ?, ?, ?)").run(G, D.id, c.id, origin, clock.now());
    const aid = q1("SELECT id FROM attempts WHERE discord_id = ? ORDER BY id DESC LIMIT 1", D.id).id;
    await click(D as any, `ans:${aid}:${c.answer}`);
    return { aid, pts: q1("SELECT points FROM attempts WHERE id = ?", aid).points, msg: text(lastPatch()) };
  };
  const pts: number[] = [];
  let msgs: string[] = [];
  for (let i = 0; i < 11; i++) { const r = await solveMcq(mcqs[i]); pts.push(r.pts); msgs.push(r.msg); }
  check(pts.slice(0, 5).every((p, i) => p === full(mcqs[i])), `first 5 quick solves: full points (${pts.slice(0, 5)})`);
  check(pts.slice(5, 10).every((p, i) => p === Math.max(1, Math.round(full(mcqs[i + 5]) * 0.2))), `next 5: 20% (${pts.slice(5, 10)})`);
  check(pts[10] === 0 && msgs[10].includes("practice only"), "11th quick solve: no points");
  check(msgs[3].includes("full-value quick challenge") && msgs[6].includes("20%"), "students are told before and when points shrink");
  // asking for another quick challenge: heads-up
  await slash(D as any, "practice", { difficulty: "easy", type: "output" });
  check(text(lastPatch()).includes("won't give points"), "heads-up when the day's quick allowance is used");
  // an assignment is the teacher's choice: never limited
  const asg = await solveMcq(mcqs[11], "assignment");
  check(asg.pts > 0, "assignments still give points after the quick allowance");
  // solving the same challenge again: nothing
  const again = await solveMcq(mcqs[0]);
  check(again.pts === 0 && again.msg.includes("already solved"), "re-solving a challenge gives no points");
  // write code: unlimited, full points
  const w = q1("SELECT * FROM challenges WHERE source = 'seed' AND kind = 'write' AND lang = 'en' AND difficulty = 'easy' AND solution IS NOT NULL LIMIT 1");
  db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, started_at) VALUES (?, ?, ?, 'practice', ?)").run(G, D.id, w.id, clock.now());
  const wid = q1("SELECT id FROM attempts WHERE discord_id = ? ORDER BY id DESC LIMIT 1", D.id).id;
  await select(D as any, `lang:${wid}`, ["python"]);
  await submit(D as any, `msub:${wid}`, w.solution);
  const sc = (await api("GET", `/api/settings?g=${G}`)).data.scoring;
  check(q1("SELECT points FROM attempts WHERE id = ?", wid).points === Math.round(sc.base.easy * sc.mult.write) && !text(lastPatch()).includes("limit"), "write code after the quick limit: full points");
  // teacher can tune it
  await api("PUT", "/api/settings", { g: G, scoring: { ...sc, quick: { full: 20, reduced: 0, pct: 0 } } });
  const more = await solveMcq(mcqs[12]);
  check(more.pts > 1, "teacher raised the allowance: points again");
  check((await slash(D as any, "help", {})) && true, "help still renders");
  await api("PUT", "/api/settings", { g: G, scoring: null });
}

section("public messages stay in #arena");
{
  const lb = await slash(U.alice, "leaderboard", {});
  check(lb.data?.flags === 64 && text(lb).includes(`<#${ARENA}>`), "a command used outside #arena answers privately and points to #arena");
  const r = raw(2, U.alice, { name: "leaderboard", type: 1, options: [], resolved: resolvedFor({}) });
  r.channel_id = ARENA;
  const lbA = await call(r);
  check(lbA.type === 4 && !(lbA.data?.flags & 64), "in #arena it stays public");
  const before = messagesTo(CH).length;
  const d = await slash(U.alice, "duel", { opponent: U.bob.id, mode: "quick", difficulty: "easy" });
  check(d.data?.flags === 64 && messagesTo(CH).length === before && messagesTo(ARENA).some((m) => text(m).includes("dacc:")), "a duel started elsewhere is posted in #arena only");
  const did = q1("SELECT id FROM duels ORDER BY id DESC LIMIT 1").id;
  db.prepare("UPDATE duels SET status = 'expired' WHERE id = ?").run(did);
  const saved = q1("SELECT arena_channel, announce_channel FROM guilds WHERE id = ?", G);
  db.prepare("UPDATE guilds SET arena_channel = NULL, announce_channel = ? WHERE id = ?").run(CH, G);
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (u: any, init: any) => (String(u).endsWith(`/guilds/${G}/channels`) ? new Response(JSON.stringify([{ id: CH, name: "general", type: 0 }]), { status: 200, headers: { "content-type": "application/json" } }) : realFetch(u, init))) as any;
  clock.advance(3600);
  const nd = await slash(U.alice, "duel", { opponent: U.bob.id, mode: "quick", difficulty: "easy" });
  globalThis.fetch = realFetch;
  check(nd.data?.flags === 64 && text(nd).includes("arena") && messagesTo(CH).length === before, "no #arena: duels are refused instead of filling #general");
  db.prepare("UPDATE guilds SET arena_channel = ?, announce_channel = ? WHERE id = ?").run(saved.arena_channel, saved.announce_channel, G);
}

section("buttons in DMs (assignments, reminders) work");
{
  const ch = q1("SELECT id FROM challenges WHERE kind = 'output' AND lang = 'en' AND status = 'active' AND id NOT IN (SELECT challenge_id FROM attempts WHERE discord_id = ?) LIMIT 1", U.carol.id);
  const r = await api("POST", "/api/assignments", { g: G, challenge_id: ch.id, students: [U.carol.id], due_at: clock.now() + 86400 });
  const asg = q1("SELECT id FROM assignments WHERE discord_id = ? AND challenge_id = ? ORDER BY id DESC", U.carol.id, ch.id)?.id;
  check(r.status === 200 && asg, "assignment created");
  const dmClick = (u: User, custom_id: string) => {
    const x: any = raw(3, u, { custom_id, component_type: 2 });
    delete x.guild_id; delete x.guild; x.channel_id = "dm-" + u.id;
    x.user = x.member.user; delete x.member;
    return call(x);
  };
  const res = await dmClick(U.carol, `astart:${asg}`);
  check(!text(res).includes("in a server"), "Start in a DM isn't refused");
  check(q1("SELECT attempt_id FROM assignments WHERE id = ?", asg).attempt_id && text(lastPatch()).includes("ansm:"), "the challenge opens right in the DM");
  const other = await dmClick(U.bob, `astart:${asg}`);
  check(text(other).includes("in a server") || text(other).includes("not for you") || text(other).includes("isn't for you"), "someone else's assignment button doesn't open it");
}

section("automatic roles: created once, moved to the right students");
{
  // start clean: no auto roles yet for this server
  db.prepare("UPDATE guilds SET auto_roles = NULL, champion_role = NULL, streak_role = NULL WHERE id = ?").run(G);
  discordRoles.list = discordRoles.list.filter((r) => !String(r.id).startsWith("role-"));
  const before = discordCalls.length;
  const st = await api("POST", `/api/roles/sync?g=${G}`, { g: G });
  const calls = discordCalls.slice(before);
  const created = calls.filter((c) => c.method === "POST" && /\/roles$/.test(c.path));
  check(st.status === 200 && created.length === 11, `the bot creates its roles (${created.length})`);
  check(created[0].body.name.includes("Class Leader") && created[0].body.hoist === true && created[1].body.name.includes("Top 3"), "leader and top 3 first, shown on top of the member list");
  const g1 = q1("SELECT champion_role, streak_role, auto_roles FROM guilds WHERE id = ?", G);
  check(g1.champion_role && g1.streak_role, "contest champion and On Fire roles are created and plugged in");
  const top = q("SELECT discord_id, SUM(amount) AS pts FROM ledger WHERE guild_id = ? AND season = (SELECT season FROM guilds WHERE id = ?) AND discord_id IS NOT NULL GROUP BY discord_id ORDER BY pts DESC", G, G);
  const ids = JSON.parse(g1.auto_roles).ids;
  const put = (u: string, r: string) => calls.some((c) => c.method === "PUT" && c.path === `/guilds/${G}/members/${u}/roles/${r}`);
  check(top.length && put(top[0].discord_id, ids.leader), "the season leader gets Class Leader");
  check(top.length < 2 || put(top[1].discord_id, ids.top3), "#2 gets Top 3");
  check(messagesTo(ARENA).some((m) => text(m).includes("Class Leader") && text(m).includes(top[0].discord_id)), "leader announced in #arena");
  check(st.data.roles.find((r: any) => r.key === "leader").people[0].id === top[0].discord_id, "dashboard shows who holds each role");

  // someone overtakes the leader: roles move, shout-out
  const chaser = top[top.length - 1].discord_id;
  db.prepare("INSERT INTO ledger (guild_id, discord_id, amount, reason, season, created_at) VALUES (?, ?, ?, 'bonus', (SELECT season FROM guilds WHERE id = ?), ?)").run(G, chaser, top[0].pts + 500, G, clock.now());
  const b2 = discordCalls.length;
  await api("POST", `/api/roles/sync?g=${G}`, { g: G });
  const c2 = discordCalls.slice(b2);
  check(c2.some((c) => c.method === "PUT" && c.path.endsWith(`/members/${chaser}/roles/${ids.leader}`)) && c2.some((c) => c.method === "DELETE" && c.path.endsWith(`/members/${top[0].discord_id}/roles/${ids.leader}`)), "new leader: role moves");
  check(messagesTo(ARENA).some((m) => text(m).includes("first place") && text(m).includes(chaser)), "new leader announced");
  check(!c2.some((c) => c.method === "POST" && /\/roles$/.test(c.path)), "roles aren't created twice");

  // levels: one title role each
  const lv = JSON.parse(q1("SELECT auto_roles FROM guilds WHERE id = ?", G).auto_roles).holders;
  const levelHolders = ["legend", "wizard", "hacker", "coderlvl", "apprentice"].flatMap((k) => lv[k] ?? []);
  check(new Set(levelHolders).size === levelHolders.length && levelHolders.includes(chaser), "level titles: one per student");

  // the teacher turns one off: taken back
  const off = await api("PUT", `/api/roles?g=${G}`, { g: G, off: ["top3"] });
  check(off.data.roles.find((r: any) => r.key === "top3").on === false && JSON.parse(q1("SELECT auto_roles FROM guilds WHERE id = ?", G).auto_roles).holders.top3.length === 0, "a role turned off is taken back");

  // no permission: clear message, nothing breaks
  db.prepare("UPDATE guilds SET auto_roles = NULL WHERE id = ?").run(G);
  discordRoles.forbidden = true;
  const bad = await api("POST", `/api/roles/sync?g=${G}`, { g: G });
  discordRoles.forbidden = false;
  check(bad.status === 200 && bad.data.error === "permission", "missing Manage Roles is reported to the teacher");

  // the cron keeps it up to date
  db.prepare("UPDATE guilds SET auto_roles = NULL WHERE id = ?").run(G);
  clock.advance(600);
  await runCron(env);
  check(JSON.parse(q1("SELECT auto_roles FROM guilds WHERE id = ?", G).auto_roles || "{}").synced > 0, "cron syncs the roles by itself");
}

section("i18n: every key exists in English and French");
{
  const en = Object.keys(DICTS.en), fr = Object.keys(DICTS.fr);
  const missingFr = en.filter((k) => !(k in DICTS.fr)), missingEn = fr.filter((k) => !(k in DICTS.en));
  check(!missingFr.length, "missing French keys: " + missingFr.join(", "));
  check(!missingEn.length, "French-only keys: " + missingEn.join(", "));
  const used = new Set<string>();
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".ts")) for (const m of readFileSync(p, "utf8").matchAll(/\bt\([^,()]+,\s*"([a-z_]+\.[a-z0-9_.]+)"/g)) used.add(m[1]);
    }
  };
  walk(join(ROOT, "src"));
  const unknown = [...used].filter((k) => !(k in DICTS.en));
  check(!unknown.length, "keys used in code but missing from i18n: " + unknown.join(", "));
}

section("slash command definitions are valid for Discord");
{
  let captured: any = null;
  const saved = globalThis.fetch;
  globalThis.fetch = (async (_u: any, init: any) => { captured = JSON.parse(init.body); return new Response("[]", { status: 200 }); }) as any;
  process.env.DISCORD_APP_ID = "x"; process.env.DISCORD_TOKEN = "y";
  const origLog = console.log; console.log = () => {};
  await import("../scripts/register-commands.mjs");
  console.log = origLog;
  globalThis.fetch = saved;
  const problems: string[] = [];
  const walk = (o: any, path: string) => {
    if (!/^[-_\p{Ll}\p{N}]{1,32}$/u.test(o.name)) problems.push(`${path}: bad name ${o.name}`);
    if (o.description !== undefined && (o.description.length < 1 || o.description.length > 100)) problems.push(`${path}: description length`);
    for (const v of Object.values(o.description_localizations ?? {})) if (String(v).length > 100) problems.push(`${path}: localized description too long`);
    for (const c of o.choices ?? []) if (c.name.length > 100) problems.push(`${path}: choice too long`);
    if ((o.options ?? []).length > 25) problems.push(`${path}: too many options`);
    const req = (o.options ?? []).map((x: any) => !!x.required);
    if (req.some((r: boolean, i: number) => !r && req.slice(i + 1).some(Boolean))) problems.push(`${path}: required options must come first`);
    for (const x of o.options ?? []) walk(x, `${path}/${x.name}`);
  };
  for (const c of captured ?? []) walk(c, c.name);
  check(captured?.length >= 12, "commands captured");
  check(!problems.length, "command problems: " + problems.join("; "));
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
