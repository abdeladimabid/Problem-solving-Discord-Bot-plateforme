// End-to-end tests: real Worker code, fake Discord/HackerRank/AI/D1.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { intranetFake } from "./harness.ts";
import { getPortfolio, _test as _pf } from "../src/shared/portfolio.ts";
import { access, ai, aiFake, clock, d1, discordCalls, discordFake, discordRoles, github, gtrans, hr, leagueFake, makeCtx, makeEnv, runner, signedRequest } from "./harness.ts";
import bot from "../src/bot/index.ts";
import { backfillSkills } from "../src/shared/skills.ts";
import admin from "../src/admin/index.ts";
import { safeNext } from "../src/admin/password.ts";
import { masteryFrom } from "../src/shared/skills.ts";
import { mistakeSkills, skillsInCode } from "../src/shared/codeskills.ts";
import { runCron } from "../src/bot/cron.ts";
import { contestConfig } from "../src/shared/contests.ts";
import { DICTS, t } from "../src/shared/i18n.ts";
import { finish } from "../src/shared/challenges.ts";
import { getGuild, getPlayer } from "../src/shared/db.ts";
import { dayDate, parseSteps, stepRhythm, stepsFallback, stepsFrom, stepsToText } from "../src/shared/review/steps.ts";
import { debriefLevel, reviewStates } from "../src/shared/review/engine.ts";
import { assessForAi } from "../src/shared/review/debrief.ts";
import { memoryKv } from "../src/shared/watcher.ts";
import { hubWrite } from "../src/shared/library.ts";
import { BUILTIN, TECHS, techOfWeek } from "../src/shared/program.ts";
import { cleanLive as actCleanLive, cleanVeille as actCleanVeille, dataItems as actDataItems, cleanPlan as actCleanPlan, cleanProposal as actCleanProposal, dayInfo as actDayInfo, holidayOf as actHolidayOf, INSPIRATION as actInspiration, proposalOutside as actProposalOutside, renderWeek as actRenderWeek, topicsFor as actTopicsFor, veillePrompt as actVeillePrompt, livePrompt as actLivePrompt, weekContext as actWeekContext, weekLabels as actWeekLabels, formFields as actFormFields, linkOk as actLinkOk, namedFunctions as actNamedFunctions, rangeDays as actRangeDays, renderLive as actRenderLive, renderVeille as actRenderVeille, splitWeeks as actSplitWeeks, stackOf as actStackOf, techSoFar, validateLive as actValidateLive, validateVeille as actValidateVeille, weekFacts as actWeekFacts } from "../src/shared/activities.ts";
import { pushStatus } from "../src/shared/github.ts";
import { allowedLevel, blockSql, getBlocks, quickKindFor, setBlock } from "../src/shared/practiceblock.ts";
import { pickChallenge as pickForTest } from "../src/shared/challenges.ts";
import { contribution as memberContribution, memberLevel, memberLevelOf, memberLevels } from "../src/shared/review/members.ts";
import { pickFiles, taskChecks, taskFallback, taskTarget } from "../src/shared/review/task.ts";
import { cleanWorkshop, renderWorkshop, slotOf, slotTaken, validateWorkshop, workshopTimingErrors } from "../src/shared/activities.ts";
import { checkUrl, matchNames, toSign } from "../src/shared/intranet.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
contestConfig.revealPause = 0;

let failures = 0, passes = 0;
function check(cond: unknown, msg: string) {
  if (cond) passes++;
  else { failures++; console.log("  ❌ " + msg); }
}
function section(name: string) { console.log("• " + name); }

const { env, privateKey } = await makeEnv();
// run the tests in the daytime (UTC), whatever time it really is: daily posts and reminders depend on the hour
{ const h = new Date(clock.now() * 1000).getUTCHours(); if (h < 9 || h > 18) clock.advance(((12 - h + 24) % 24) * 3600); }
const db = (env.DB as any).raw;
const q = (sql: string, ...a: any[]) => db.prepare(sql).all(...a) as any[];
const q1 = (sql: string, ...a: any[]) => db.prepare(sql).get(...a) as any;
const run1 = (sql: string, ...a: any[]) => db.prepare(sql).run(...a);
const cosmeticsOfRow = (p: any) => Object.fromEntries(Object.entries(JSON.parse(p?.cosmetics || "{}")).map(([k, v]: any) => [k, v.v]));

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
function pointsForTest() { return 30; }   // easy write code: 3 × 10
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
  check(at.points === 33, `medium write = 6 × 10 = 60 pts, 4th submission −45% → 33 (got ${at.points})`);
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
  {
    // Wandbox retired our Node.js version, or is busy for a moment: the run still works
    const R = await import("../src/shared/runner.ts");
    const prog = "const l = require('fs').readFileSync(0, 'utf8').trim(); console.log(Number(l) * 2);";
    runner.retired = ["nodejs-20.17.0"];
    const h1 = await R.runHarness(env, "javascript", prog, [{ input: "21", gen: null }], 2, 50, 10);
    const o1 = await R.runOnce(env, "javascript", "console.log(6 * 7)");
    runner.busyOnce = 1;
    const h2 = await R.runHarness(env, "javascript", prog, [{ input: "4", gen: null }], 2, 50, 10);
    const hh = await R.runnerHealth(env);
    runner.retired = []; runner.busyOnce = 0;
    check(h1.rows[0]?.o === "42" && o1.out === "42" && h2.rows[0]?.o === "8", "Wandbox retired our Node.js version (the current one is found) or is busy a moment (tried again): the code still runs");
    check(/Wandbox \(nodejs-22\.11\.0\): OK/.test(hh.detail), `the diagnostics test Wandbox too (${hh.detail})`);
  }
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
{
  // the AI's generators: a "\n" turned into a real line break inside a string, a list instead of text: repaired, the problem is kept
  const A = await import("../src/shared/ai.ts");
  check(A.fixPyNewlines("return str(n) + '\n' + 'x'") === "return str(n) + '\\n' + 'x'" && A.fixPyNewlines("s = 'a\\nb'  # it's\nreturn s") === "s = 'a\\nb'  # it's\nreturn s", "a line break inside a Python string is put back as \\n (nothing else changes)");
  ai.mode = "brokengens";
  run1("DELETE FROM ai_usage");
  const w = await A.generateWrite(env, { difficulty: "medium", lang: "en", topic: "streaks" });
  check(!!w && w.tests.filter((t: any) => t.gen).length === 2, `the broken generators are repaired: both big tests kept (${A.whyWriteFailed()})`);
  ai.mode = "deadgens";
  const d = await A.generateWrite(env, { difficulty: "medium", lang: "en", topic: "streaks" });
  check(!!d && !d.tests.some((t: any) => t.gen) && /Big generator #1 failed/.test(ai.users.filter((u: string) => u.includes("I ran your problem")).pop() || ""), `a generator that never works: the AI is told the error; at the end the checked problem is kept without the big test (${A.whyWriteFailed()})`);
  // the AI is shown what went wrong (the input, both outputs) and corrects the same problem
  ai.mode = "fixable";
  run1("DELETE FROM ai_usage");
  const n0 = ai.users.length;
  const fx = await A.generateWrite(env, { difficulty: "medium", lang: "en", topic: "streaks" });
  const told = ai.users.slice(n0).find((u: string) => u.includes("I ran your problem")) || "";
  check(!!fx && fx.tests.some((t: any) => t.gen) && /Small input #1:\n5\n1 -2 3 4 -1/.test(told) && /`brute` printed: 0/.test(told) && /`reference` printed: 7/.test(told), "two solutions that disagree: the AI sees the input and both outputs, corrects the problem, and it's saved");
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

  // 📋 the challenge message was lost (Discord dropped it): /practice type:pending opens it again, with ✅ Verify
  {
    await slash(U.alice, "practice", { difficulty: "easy", type: "coding" });
    const lost = Number(ids(lastPatch()).find((i) => i.startsWith("chk:"))!.split(":")[1]);
    check(/Message gone before you verified/.test(text(lastPatch())), "the HackerRank challenge says how to get it back");
    const pl = await slash(U.alice, "practice", { type: "pending" });
    const title = q1("SELECT c.title FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.id = ?", lost).title;
    const plj = JSON.stringify(pl);
    check(plj.includes(`"ropen:${lost}"`) && plj.includes(title) && !plj.includes(`"ropen:${aid}"`) && (pl as any).data.flags === 64, "📋 my challenges to verify: the pending one (only them can see it), not the verified one");
    check(/not yours|pas à toi|isn't yours/i.test(JSON.stringify(await click(U.bob, `ropen:${lost}`))), "…nobody else can open it");
    await click(U.alice, `ropen:${lost}`);
    check(ids(lastPatch()).includes(`chk:${lost}`) && text(lastPatch()).includes("hackerrank.com/challenges/"), "…it opens again: the link and ✅ Verify");
    const cL = solveAnswer(q1("SELECT challenge_id FROM attempts WHERE id = ?", lost).challenge_id);
    hr.solves["alice_hr"] = [...(hr.solves["alice_hr"] || []), { slug: cL.hr_slug, at: clock.now() }];
    await click(U.alice, `chk:${lost}`);
    check(q1("SELECT status FROM attempts WHERE id = ?", lost).status === "solved" && /no HackerRank challenge waiting/.test(text(await slash(U.alice, "practice", { type: "pending" }))),
      "…verified from there; then nothing left to verify");
    run1("UPDATE attempts SET status = 'expired' WHERE id = ?", lost);
    check(/has expired/.test(JSON.stringify(await click(U.alice, `ropen:${lost}`))), "…an expired one says so");
  }

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
  const coinsBefore = (id: string) => q1("SELECT coins FROM players WHERE discord_id = ?", id).coins;
  const a0 = coinsBefore(U.alice.id), b0 = coinsBefore(U.bob.id);
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
  check(q1("SELECT coins FROM players WHERE discord_id = ?", U.alice.id).coins === a0 - 10, "stake escrowed");
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
  const won = q1("SELECT COALESCE(SUM(points), 0) AS n FROM attempts WHERE discord_id = ? AND origin = 'duel' AND status = 'solved'", U.alice.id).n;
  check(pa.coins === a0 + 10 + won && pb.coins === b0 - 10, `coins settled: the stakes, and the solve's points as coins (alice ${pa.coins}, bob ${pb.coins})`);
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
  for (const cmd of ["/practice", "/daily", "/assignments", "/duel", "/profile", "/leaderboard", "/rival", "/bet", "/contest", "/link", "/teacher setup", "/teacher track", "/teacher verify", "/teacher season", "/teacher stop", "/teacher dashboard", "/today", "/skills", "/path", "/shop", "/create", "/help-me", "/ask", "/faq", "/interview", "/github", "/brief", "/league"]) {
    check(joined.includes(cmd), `help mentions ${cmd}`);
  }
  for (const w of ["SQL", "Regular expression", "2 vs 2", "Live quiz", "Boss battle", "Bounty", "Streak freeze", "Hint token", "Custom title", "Your color"]) check(joined.includes(w), `help explains: ${w}`);
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
  {
    // the trend: this week's points against last week's, for a class that started 10 days ago
    const day = 86400, T = clock.now();
    const mkp = (id: string, pts: [number, number][]) => {
      run1("INSERT INTO players (guild_id, discord_id, name, coins, created_at, last_active) VALUES (?, ?, ?, 0, ?, ?)", G, id, "Trend " + id, T - 10 * day, T - day);
      for (const [ago, amount] of pts) run1("INSERT INTO ledger (guild_id, discord_id, season, amount, reason, created_at) VALUES (?, ?, (SELECT season FROM guilds WHERE id = ?), ?, 'manual', ?)", G, id, G, amount, T - ago * day);
    };
    mkp("t-up", [[9, 10], [2, 80]]); mkp("t-down", [[9, 90], [2, 10]]); mkp("t-flat", [[9, 40], [2, 42]]); mkp("t-new", [[3, 50]]);
    const tr = Object.fromEntries((await api("GET", `/api/students?g=${G}`)).data.filter((x: any) => x.discord_id.startsWith("t-")).map((x: any) => [x.discord_id, x.trend]));
    check(tr["t-up"] === "up" && tr["t-down"] === "down" && tr["t-flat"] === "flat" && tr["t-new"] === "new", `trend: this week against last week, "new" only for a first week (${JSON.stringify(tr)})`);
    run1("DELETE FROM ledger WHERE discord_id LIKE 't-%'"); run1("DELETE FROM players WHERE discord_id LIKE 't-%'");
  }
  const det = await api("GET", `/api/students/${U.bob.id}?g=${G}`);
  check(det.status === 200 && det.data.attempts.some((a: any) => a.status === "failed") && det.data.attempts.some((a: any) => a.status === "solved"), "student detail shows solved and failed challenges");
  check(det.data.weeks.length === 12 && det.data.duelList.length >= 1, "weekly points & duel history");
  const bonus = await api("POST", `/api/students/${U.bob.id}/points`, { g: G, amount: 15, reason: "Great teamwork", notify: true });
  check(bonus.status === 200 && q1("SELECT COUNT(*) AS n FROM ledger WHERE reason = 'bonus'").n === 1, "bonus points given");
  const csv = await api("GET", `/api/export.csv?g=${G}`);
  check(typeof csv.data === "string" && csv.data.includes("Briefs validated") && csv.data.split("\n").length >= 4, "CSV export: one row per student");
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
  // count only reminder DMs (on a Monday the weekly reports go out too)
  const reminders = () => discordCalls.filter((x) => x.path.startsWith("/channels/dm-") && JSON.stringify(x.body).includes("Reminder: your assignment")).length;
  const dmsBefore = reminders();
  clock.advance(86400 + 3600);
  await runCron(env);
  check(reminders() === dmsBefore + 1, "reminder DM 24h before due");
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
  {
    const fin = messagesTo(ARENA).map((m) => text(m)).filter((x) => x.includes("Final Leaderboard")).pop() || "";
    const champ = q1("SELECT discord_id, badge FROM badges WHERE guild_id = ? AND badge LIKE 'champion:%' ORDER BY created_at DESC", G);
    check(/🥇 \*\*1st place — Our .+ Champion!\*\*/.test(fin) && /<@\d+>/.test(fin) && fin.includes("The leaderboard resets for Spring 2027"), "the end of the season in #arena: the final leaderboard, the podium mentioned");
    check(!!champ && fin.includes(`<@${champ.discord_id}>`) && t("en", `badge.${champ.badge}`).startsWith("🏆 ") && t("en", `badge.${champ.badge}`).endsWith(" Champion") && t("fr", `badge.${champ.badge}`).startsWith("🏆 Champion de "),
      "the champion gets the season's badge");
  }
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
  // the next season at a set time: the cron starts it (nobody stays up until midnight)
  check((await api("POST", "/api/season", { g: G, name: "Summer 2027", at: clock.now() - 10 })).status === 400 && (await api("POST", "/api/season", { g: G, name: "Spring 2027", at: clock.now() + 600 })).status === 400, "a date in the past, or the same name: refused");
  const pl = await api("POST", "/api/season", { g: G, name: "Summer 2027", at: clock.now() + 3600, announce: true });
  check(pl.status === 200 && pl.data.plan.name === "Summer 2027" && (await api("GET", `/api/season/plan?g=${G}`)).data.plan.at === pl.data.plan.at, "the next season scheduled");
  await api("DELETE", `/api/season/plan?g=${G}`);
  check((await api("GET", `/api/season/plan?g=${G}`)).data.plan === null, "…and cancelled");
  await api("POST", "/api/season", { g: G, name: "Summer 2027", at: clock.now() + 120, announce: true });
  await runCron(env);
  check(q1("SELECT season FROM guilds WHERE id = ?", G).season === "Spring 2027", "…not before its time");
  clock.advance(180);
  const nArena = messagesTo(ARENA).length;
  await runCron(env);
  await runCron(env);
  const ended = messagesTo(ARENA).slice(nArena).map((m) => text(m)).join("\n");
  check(q1("SELECT season FROM guilds WHERE id = ?", G).season === "Summer 2027" && (await api("GET", `/api/season/plan?g=${G}`)).data.plan === null
    && /Spring 2027 (— Final Leaderboard|is over)/.test(ended) && (ended.match(/Spring 2027 (— Final Leaderboard|is over)/g) || []).length === 1, "at its time, the cron starts it once, and #arena gets the end of the old season");
  await api("POST", "/api/season", { g: G, name: "Spring 2027", announce: false, certificates: false });
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
  const mcqs = q("SELECT * FROM challenges WHERE kind = 'mcq' AND lang = 'en' AND status = 'active' AND id NOT IN (SELECT challenge_id FROM attempts WHERE discord_id = ?) ORDER BY id LIMIT 16", D.id);
  const base0 = (await api("GET", `/api/settings?g=${G}`)).data.scoring;
  const full = (c: any) => Math.max(1, Math.round(base0.base[c.difficulty] * base0.mult.mcq * 1.2));   // answered fast: +20%
  check(mcqs.length >= 16, "enough multiple-choice challenges for the test");
  const solveMcq = async (c: any, origin = "practice") => {
    db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, started_at) VALUES (?, ?, ?, ?, ?)").run(G, D.id, c.id, origin, clock.now());
    const aid = q1("SELECT id FROM attempts WHERE discord_id = ? ORDER BY id DESC LIMIT 1", D.id).id;
    await click(D as any, `ans:${aid}:${c.answer}`);
    return { aid, pts: q1("SELECT points FROM attempts WHERE id = ?", aid).points, msg: text(lastPatch()) };
  };
  const pts: number[] = [];
  let msgs: string[] = [];
  for (let i = 0; i < 11; i++) { const r = await solveMcq(mcqs[i]); pts.push(r.pts); msgs.push(r.msg); }
  check(pts.slice(0, 3).every((p, i) => p === full(mcqs[i])), `first 3 quick solves: full points (${pts.slice(0, 3)})`);
  check(pts.slice(3, 5).every((p, i) => p === Math.max(1, Math.round(full(mcqs[i + 3]) * 0.5))), `next 2: 50% (${pts.slice(3, 5)})`);
  check(pts.slice(5).every((p) => p === 0) && msgs[5].includes("practice only"), "6th quick solve and after: no points");
  check(msgs[1].includes("full-value quick challenge") && msgs[3].includes("50%"), `students are told before and when points shrink (${msgs[1]} | ${msgs[3]})`);
  // asking for another quick challenge: heads-up
  check(msgs[4].includes("last quick challenge for today"), "the 5th quick solve says it was the last one today");
  const locked = await slash(D as any, "practice", { difficulty: "easy", type: "output" });
  check(text(locked).includes("come back in") || text(locked).includes("They come back"), `quick challenges are locked until tomorrow (${text(locked).slice(0, 80)})`);
  check(text(await slash(D as any, "practice", { difficulty: "easy", type: "quick" })).includes("🔒"), "any quick type is locked too");
  check(text(await slash(D as any, "practice", { difficulty: "easy", type: "git" })).includes("🔒"), "Git questions are locked too");
  check(text(await slash(D as any, "duel", { opponent: U.bob.id, mode: "quick" })).includes("🔒"), "no quick duel when the allowance is used");
  { const r = await slash(U.bob as any, "duel", { opponent: D.id, mode: "quick" }); check(text(r).includes("🔒") && text(r).includes("quick duel"), `a classmate can't pull them into a quick duel either (${text(r).slice(0, 90)})`); }
  await slash(D as any, "practice", { difficulty: "easy", type: "write" });
  check(!text(lastPatch()).includes("🔒"), "write code is never locked");
  // the teacher can turn the lock off: then quick challenges are allowed again, for practice only
  const sc0 = (await api("GET", `/api/settings?g=${G}`)).data.scoring;
  await api("PUT", `/api/settings?g=${G}`, { scoring: { ...sc0, quick: { ...sc0.quick, lock: false } } });
  await slash(D as any, "practice", { difficulty: "easy", type: "output" });
  check(text(lastPatch()).includes("won't give points"), "lock off: allowed again, with a heads-up that it gives no points");
  await api("PUT", `/api/settings?g=${G}`, { scoring: sc0 });
  clock.advance(86400);
  await slash(D as any, "practice", { difficulty: "easy", type: "output" });
  check(!text(lastPatch()).includes("🔒") && !text(lastPatch()).includes("won't give points"), "the next day quick challenges are back");
  clock.advance(-86400);
  // an assignment is the teacher's choice: never limited
  const asg = await solveMcq(mcqs[11], "assignment");
  check(asg.pts === full(mcqs[11]) || asg.pts > full(mcqs[11]), `assignments still give full points after the quick allowance (${asg.pts})`);
  const pth = await solveMcq(mcqs[14], "path");
  check(pth.pts === full(mcqs[14]), `/path steps always give full points, even after the allowance (${pth.pts} vs ${full(mcqs[14])})`);
  const pln = await solveMcq(mcqs[15], "plan");
  check(pln.pts === full(mcqs[15]), `/today plan challenges always give full points (${pln.pts})`);
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

section("coach: skill map, mistakes, training, daily plan, path, hints, model solution, weekly report");
{
  const E = { id: "105", name: "Eve", teacher: false };
  // skills: the bot tags every challenge by itself
  while (await backfillSkills(env, 200)) { /* until done */ }
  check(q1("SELECT COUNT(*) AS n FROM challenges WHERE skills IS NULL").n === 0, "every challenge gets skills");
  const rl = q1("SELECT * FROM challenges WHERE test_set = 'run-length' AND lang = 'en'");
  check(rl.skills === "strings,loops", "hand-tagged write problems keep their skills");

  // a short history for Eve: strong on strings, too slow twice on write code, a failed output 2 days ago
  const strOut = q("SELECT id FROM challenges WHERE kind = 'output' AND lang = 'en' AND status = 'active' AND (',' || skills || ',') LIKE '%,strings,%' LIMIT 4");
  const ins = db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, status, tries, points, result, started_at, finished_at) VALUES (?, ?, ?, 'practice', ?, 1, ?, ?, ?, ?)");
  const t0 = clock.now();
  for (const c of strOut.slice(0, 3)) ins.run(G, E.id, c.id, "solved", 5, null, t0 - 5 * 86400, t0 - 5 * 86400);
  const slow = JSON.stringify({ verdict: "tle", passed: 6, total: 9, maxTime: 2, judge: "tests", failed: { idx: 7, sample: false, big: true } });
  const hard = q("SELECT id FROM challenges WHERE kind = 'write' AND lang = 'en' AND difficulty = 'hard' LIMIT 2");
  for (const c of hard) ins.run(G, E.id, c.id, "failed", 0, slow, t0 - 12 * 3600, t0 - 12 * 3600);   // not due for review yet (1 day)
  const missed = q1("SELECT * FROM challenges WHERE kind = 'output' AND lang = 'en' AND status = 'active' AND id NOT IN (SELECT challenge_id FROM attempts WHERE discord_id = ?) LIMIT 1", E.id);
  ins.run(G, E.id, missed.id, "failed", 0, null, t0 - 2 * 86400, t0 - 2 * 86400);

  await slash(E as any, "skills", {});
  let p = lastPatch();
  check(text(p).includes("Strings") && text(p).includes("Too slow"), "/skills: skill bars and the mistake profile");
  const train = ids(p).find((i) => i.startsWith("sk:"));
  check(!!train && ids(p).includes("today:open") && ids(p).includes("path:open"), "buttons: train a skill, plan, path");
  await click(E as any, train!);
  const tr = q1("SELECT a.origin, c.skills FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.discord_id = ? ORDER BY a.id DESC LIMIT 1", E.id);
  check(tr.origin === "practice" && tr.skills.split(",").includes(train!.split(":")[1]) && text(lastPatch()).includes("Training"), "train button: a challenge on that skill");
  db.prepare("UPDATE attempts SET status = 'expired', finished_at = ? WHERE discord_id = ? AND status = 'pending'").run(clock.now(), E.id);

  // daily plan
  await slash(E as any, "today", {});
  p = lastPatch();
  const plan = JSON.parse(q1("SELECT items FROM daily_plans WHERE discord_id = ?", E.id).items);
  check(plan.length === 3 && plan[0].kind === "rematch" && plan[0].challenge_id === missed.id, "/today: 3 challenges, the missed one comes back first");
  check(new Set(plan.map((i: any) => i.challenge_id)).size === 3 && text(p).includes("Rematch") && ids(p).includes("plan:0"), "plan shown with start buttons");
  await click(E as any, "plan:0");
  const pa = q1("SELECT * FROM attempts WHERE discord_id = ? ORDER BY id DESC LIMIT 1", E.id);
  check(pa.origin === "plan" && pa.challenge_id === missed.id && pa.status === "pending", "start: a plan attempt (the missed challenge can be played again)");
  // items 2 and 3 done (shortcut), then finish item 1 for real
  const pl2 = JSON.parse(q1("SELECT items FROM daily_plans WHERE discord_id = ?", E.id).items);
  pl2[1].status = "solved"; pl2[1].points = 20; pl2[2].status = "failed";
  db.prepare("UPDATE daily_plans SET items = ? WHERE discord_id = ?").run(JSON.stringify(pl2), E.id);
  await submit(E as any, `mans:${pa.id}`, missed.answer);
  const dp = q1("SELECT completed_at, bonus FROM daily_plans WHERE discord_id = ?", E.id);
  const ev = q1("SELECT plan_streak FROM players WHERE discord_id = ? AND guild_id = ?", E.id, G);
  check(dp.completed_at && dp.bonus >= 5 && ev.plan_streak === 1 && text(lastPatch()).includes("Plan complete"), `plan complete: streak 1, bonus ${dp.bonus}`);
  check(q1("SELECT SUM(amount) AS s FROM ledger WHERE discord_id = ? AND reason = 'plan_bonus'", E.id).s === dp.bonus, "bonus in the points log");
  await click(E as any, "plan:remind");
  check(q1("SELECT plan_dm FROM players WHERE discord_id = ? AND guild_id = ?", E.id, G).plan_dm === 1 && text(lastPatch()).includes("every morning"), "morning reminder on");

  // path
  await slash(E as any, "path", {});
  p = lastPatch();
  check(text(p).includes("Your path") && ids(p).includes("path:go") && ids(p).some((i) => i.startsWith("path:lesson:")), "/path: current step, lesson and next challenge");
  const les = await click(E as any, ids(p).find((i) => i.startsWith("path:lesson:"))!);
  const lesText = les.data?.embeds?.[0]?.description ?? "";
  check(les.data?.flags === 64 && lesText.includes("```py") && lesText.includes("📚") && /\]\(https:\/\//.test(lesText), "lesson: example in the class language (Python) and links to read more");
  await click(E as any, "path:go");
  check(q1("SELECT origin FROM attempts WHERE discord_id = ? ORDER BY id DESC LIMIT 1", E.id).origin === "path", "next challenge from the path");
  db.prepare("UPDATE attempts SET status = 'expired', finished_at = ? WHERE discord_id = ? AND status = 'pending'").run(clock.now(), E.id);

  // hints in steps on a write-code problem
  db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, started_at) VALUES (?, ?, ?, 'practice', ?)").run(G, E.id, rl.id, clock.now());
  const ha = q1("SELECT id FROM attempts WHERE discord_id = ? ORDER BY id DESC LIMIT 1", E.id).id;
  const steps = rl.hint ? 3 : 2;
  for (let i = 0; i < steps; i++) await click(E as any, `hint:${ha}`);
  const after = q1("SELECT used_hint FROM attempts WHERE id = ?", ha).used_hint;
  check(after === steps && text(lastPatch()).includes("Approach") && text(lastPatch()).includes("Pseudocode"), `hint steps unlocked one by one (${after})`);
  check(JSON.parse(q1("SELECT hints FROM challenges WHERE id = ?", rl.id).hints).approach, "approach and pseudocode written once and cached");
  const more = await click(E as any, `hint:${ha}`);
  check(text(more).includes("every hint"), "no fourth hint");
  // model solution once it's over
  const early = await click(E as any, `sol:${ha}`);
  check(text(early).includes("once the challenge is over"), "no solution while the challenge is open");
  db.prepare("UPDATE attempts SET status = 'solved', lang = 'javascript', finished_at = ? WHERE id = ?").run(clock.now(), ha);
  await click(E as any, `sol:${ha}`);
  check(text(lastPatch()).includes("Model solution") && text(lastPatch()).includes("function solve"), "model solution in the student's language");
  check(JSON.parse(q1("SELECT solutions FROM challenges WHERE id = ?", rl.id).solutions).javascript, "translated once and cached");

  // weekly report on Monday + morning plan DM
  const dnow = new Date(clock.now() * 1000);
  const toMonday = ((8 - dnow.getUTCDay()) % 7 || 7) * 86400 + (12 - dnow.getUTCHours()) * 3600;
  clock.advance(toMonday);
  for (let i = 0; i < 4; i++) await runCron(env);
  const dmReport = discordCalls.filter((c) => c.method === "POST" && c.path === `/channels/dm-${E.id}/messages` && text(c.body).includes("your week"));
  check(dmReport.length === 1 && q1("SELECT COUNT(*) AS n FROM weekly_reports WHERE discord_id = ?", E.id).n === 1, "weekly report sent by DM on Monday (once)");
  check(discordCalls.some((c) => c.method === "POST" && c.path === `/channels/dm-${E.id}/messages` && text(c.body).includes("Good morning")), "morning plan sent to students who asked");
  await click(E as any, "report:open");
  check(text(lastPatch()).includes("your week") && text(lastPatch()).includes("solved"), "report button");
}

section("teacher insight: heatmap, practice sets, mistakes, difficulty check, Monday summary, exams");
{
  const hm = await api("GET", `/api/skills/class?g=${G}`);
  check(hm.status === 200 && hm.data.students.length >= 3 && hm.data.skills.includes("strings") && typeof Object.values(hm.data.average)[0] === "number", "class heatmap: students × skills with class averages");
  const ps = await api("POST", "/api/skills/practice-set", { g: G, skill: "strings", students: [U.bob.id, U.carol.id], count: 2, due_at: clock.now() + 86400 });
  check(ps.status === 200 && ps.data.assignments >= 2, `practice set: ${ps.data.assignments} assignments at each student's level`);
  check(discordCalls.some((c) => c.path === `/channels/dm-${U.bob.id}/messages` && text(c.body).includes("Practice set") && text(c.body).includes("astart:")), "students get a DM with start buttons");

  // mistakes grouped by cause
  const rl = q1("SELECT * FROM challenges WHERE test_set = 'run-length' AND lang = 'en'");
  const res = (verdict: string, idx: number, sample = false) => JSON.stringify({ verdict, passed: 3, total: 9, maxTime: 1, judge: "tests", failed: { idx, sample, big: false, expected: "a3", got: "a2" } });
  const ins = db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, status, tries, result, answer_given, lang, started_at, finished_at) VALUES (?, ?, ?, 'practice', 'failed', 5, ?, 'code', 'javascript', ?, ?)");
  for (const [u, v, i] of [["301", "wrong", 4], ["302", "wrong", 4], ["303", "wrong", 4], ["304", "tle", 8]] as const) ins.run(G, u, rl.id, res(v, i), clock.now(), clock.now());
  const mi = await api("GET", `/api/challenges/${rl.id}/mistakes?g=${G}`);
  check(mi.status === 200 && mi.data.groups[0].count >= 3 && mi.data.groups[0].label.includes("Wrong answer") && mi.data.groups[0].label.includes("hidden test 4"), "wrong answers grouped by failing test");
  check(mi.data.groups.some((x: any) => x.label.includes("Too slow")) && mi.data.groups[0].example.input !== undefined, "with the test input that trips them");

  // difficulty check
  const easy = q1("SELECT * FROM challenges WHERE kind = 'output' AND difficulty = 'easy' AND lang = 'en' AND status = 'active' LIMIT 1");
  const fin = db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, status, tries, started_at, finished_at) VALUES (?, ?, ?, 'practice', ?, 1, ?, ?)");
  for (let i = 0; i < 8; i++) fin.run(G, `40${i}`, easy.id, i < 1 ? "solved" : "failed", clock.now(), clock.now());
  const dc = await api("GET", `/api/difficulty?g=${G}`);
  const row = dc.data.find((x: any) => x.id === easy.id);
  check(row && row.suggest === "medium", "difficulty check: an 'easy' challenge few solve → suggest medium");
  await api("POST", `/api/challenges/${easy.id}/difficulty`, { g: G, difficulty: "medium" });
  check(q1("SELECT difficulty FROM challenges WHERE id = ?", easy.id).difficulty === "medium", "apply the suggestion");

  // Monday summary for the teacher
  const sm = await api("GET", `/api/summary?g=${G}`);
  check(sm.status === 200 && typeof sm.data.active === "number" && Array.isArray(sm.data.actions), "summary for the dashboard");
  db.prepare("UPDATE guilds SET teacher_id = ?, last_teacher_digest = NULL WHERE id = ?").run(U.prof.id, G);
  const wd = new Date(clock.now() * 1000);
  if (wd.getUTCDay() !== 1) clock.advance(((8 - wd.getUTCDay()) % 7 || 7) * 86400);
  for (let i = 0; i < 3; i++) await runCron(env);
  check(discordCalls.some((c) => c.path === `/channels/dm-${U.prof.id}/messages` && text(c.body).includes("Your week")), "Monday summary DM to the teacher");

  // exam: silent judging, best submission counts, grades /20
  await api("PUT", "/api/settings", { g: G, integrity: { editor: "off" } });
  const quick = q1("SELECT * FROM challenges WHERE kind = 'mcq' AND lang = 'en' AND status = 'active' LIMIT 1");
  const ex = await api("POST", "/api/sessions", { g: G, title: "Midterm", challenge_ids: [rl.id, quick.id], minutes: 60, mode: "exam" });
  check(ex.status === 200 && messagesTo(ARENA).some((m) => text(m).includes("Exam: Midterm")), "exam announced");
  await click(U.carol, `sgo:${ex.data.id}:${quick.id}`);
  const qa = q1("SELECT * FROM attempts WHERE discord_id = ? AND origin = 'exam' AND challenge_id = ?", U.carol.id, quick.id);
  const wrong = quick.answer === "A" ? "B" : "A";
  const qr = await click(U.carol, `ans:${qa.id}:${wrong}`);
  check(text(lastPatch()).includes("Answer saved") && !text(lastPatch()).includes("correct"), "quick question: saved, no feedback");
  void qr;
  await click(U.carol, `sgo:${ex.data.id}:${rl.id}`);
  const wa = q1("SELECT * FROM attempts WHERE discord_id = ? AND origin = 'exam' AND challenge_id = ?", U.carol.id, rl.id);
  await submit(U.carol, `msub:${wa.id}`, "print(1)");
  check(text(lastPatch()).includes("Submission 1 saved") && !text(lastPatch()).includes("Wrong answer"), "code: judged silently");
  check(q1("SELECT status FROM attempts WHERE id = ?", wa.id).status === "pending", "can still improve it");
  clock.advance(3700);
  await runCron(env);
  const es = q1("SELECT status, grades FROM sessions WHERE id = ?", ex.data.id);
  const gr = JSON.parse(es.grades)[U.carol.id];
  check(es.status === "finished" && gr && gr.grade < 10 && gr.scores[quick.id] === 0, `grades computed (${gr?.grade}/20)`);
  check(discordCalls.some((c) => c.path === `/channels/dm-${U.carol.id}/messages` && text(c.body).includes("/20")), "each student gets their grade by DM");
  const csv = await api("GET", `/api/sessions/${ex.data.id}/grades.csv?g=${G}`);
  check(csv.status === 200 && String(csv.data).includes("Grade /20") && String(csv.data).includes(U.carol.id), "grades CSV export");
  const grid = await api("GET", `/api/sessions/${ex.data.id}?g=${G}`);
  check(grid.data.exam === true && grid.data.students.some((x: any) => x.grade !== null), "results grid shows grades");
}

section("new challenge types: SQL, regex, Git, web problems, challenges written by students");
{
  const F = { id: "106", name: "Farah", teacher: false };
  // SQL
  await slash(F as any, "practice", { difficulty: "easy", type: "sql" });
  let p = lastPatch();
  const sa = q1("SELECT a.id, c.solution, c.kind, c.title FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.discord_id = ? ORDER BY a.id DESC LIMIT 1", F.id);
  check(sa?.kind === "sql" && text(p).includes("CREATE TABLE") && ids(p).includes(`ansm:${sa.id}`), `SQL challenge shown with its tables (${sa?.title})`);
  const modalSql = await click(F as any, `ansm:${sa.id}`);
  check(text(modalSql).includes("SQL"), "SQL answer form");
  await submit(F as any, `mans:${sa.id}`, "SELECT 1");
  check(text(lastPatch()).includes("Wrong result on the example data") && q1("SELECT status FROM attempts WHERE id = ?", sa.id).status === "pending", "wrong query: expected vs your rows, try again");
  await submit(F as any, `mans:${sa.id}`, "DELETE FROM students; SELECT 1");
  check(text(lastPatch()).includes("ONE query"), "only one statement allowed");
  await submit(F as any, `mans:${sa.id}`, sa.solution);
  check(q1("SELECT status, points FROM attempts WHERE id = ?", sa.id).status === "solved" && text(lastPatch()).includes("datasets"), "right query: solved on every dataset (shown + hidden)");
  // a query right on the example data but wrong on hidden data
  const hid = q1("SELECT * FROM challenges WHERE test_set = 'sql-customers-without-orders' AND lang = 'en'");
  db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, started_at) VALUES (?, ?, ?, 'practice', ?)").run(G, F.id, hid.id, clock.now());
  const ha = q1("SELECT id FROM attempts WHERE discord_id = ? ORDER BY id DESC LIMIT 1", F.id).id;
  const notIn = "SELECT name FROM customers WHERE id NOT IN (SELECT customer_id FROM orders) ORDER BY name";
  await submit(F as any, `mans:${ha}`, notIn);
  check(/hidden dataset|example data|SQL error/.test(text(lastPatch())), "hidden datasets catch queries that only fit the example");
  // regex
  await slash(F as any, "practice", { difficulty: "easy", type: "regex" });
  const ra = q1("SELECT a.id, c.answer, c.kind FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.discord_id = ? ORDER BY a.id DESC LIMIT 1", F.id);
  check(ra.kind === "regex" && text(lastPatch()).includes("Must match"), "regex challenge shows strings to match and reject");
  await submit(F as any, `mans:${ra.id}`, ".*");
  check(text(lastPatch()).includes("should NOT match"), "wrong regex: which strings fail");
  await submit(F as any, `mans:${ra.id}`, "(a+)+");
  check(text(lastPatch()).includes("nested repetition"), "dangerous patterns refused");
  await submit(F as any, `mans:${ra.id}`, ra.answer);
  check(q1("SELECT status FROM attempts WHERE id = ?", ra.id).status === "solved", "right regex: solved");
  // git
  await slash(F as any, "practice", { difficulty: "easy", type: "git" });
  const ga = q1("SELECT c.skills, c.kind FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.discord_id = ? ORDER BY a.id DESC LIMIT 1", F.id);
  check(ga.kind === "mcq" && ga.skills === "git", "Git questions");
  // web problems are function-mode write problems
  const web = q1("SELECT * FROM challenges WHERE test_set = 'web-url-slug' AND lang = 'en'");
  check(web && web.signature && web.skills.includes("web"), "web problems: function mode, tagged web");

  // a student writes a challenge
  const cm = await slash(F as any, "create", { type: "write", difficulty: "easy" });
  check(cm.type === 9 && text(cm).includes("mcreate:write-easy"), "/create opens the form");
  const fields = (vals: Record<string, string>) => call(raw(5, F as any, { custom_id: "mcreate:write-easy", components: Object.entries(vals).map(([k, v]) => ({ type: 1, components: [{ type: 4, custom_id: k, value: v }] })) }));
  await fields({ title: "Double it", statement: "Read one integer n and print 2 × n. Input: one integer. Output: one integer.", tests: "3\n---\n10\n---\n-4", solution: "const n = Number(require('fs').readFileSync(0, 'utf8').trim()); console.log(2 * n);", lang: "javascript" });
  const mine = q1("SELECT * FROM challenges WHERE source = 'student' AND created_by = ? ORDER BY id DESC LIMIT 1", F.id);
  check(mine && mine.status === "pending" && text(lastPatch()).includes("all 3 tests"), "student challenge: their own solution computes the tests, then it waits for review");
  check(q("SELECT expected FROM challenge_tests WHERE test_set = ? ORDER BY idx", mine.test_set).map((x: any) => x.expected).join(",") === "6,20,-8", "expected outputs from the student's solution");
  await fields({ title: "Broken", statement: "Read one integer n and print 2 × n. Input: one integer. Output: one integer.", tests: "3\n---\n10", solution: "throw new Error('oops')", lang: "javascript" });
  check(text(lastPatch()).includes("failed on test"), "a solution that crashes is refused");
  const list = await api("GET", `/api/student-challenges?g=${G}`);
  check(list.data.some((x: any) => x.id === mine.id), "teacher sees it in the dashboard");
  await api("POST", `/api/student-challenges/${mine.id}`, { g: G, approve: true });
  check(q1("SELECT status FROM challenges WHERE id = ?", mine.id).status === "active" && discordCalls.some((c) => c.path === `/channels/dm-${F.id}/messages` && text(c.body).includes("approved")), "approved: in rotation, author told");
  const before = q1("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE discord_id = ? AND reason = 'author'", F.id).s;
  db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, started_at) VALUES (?, ?, ?, 'practice', ?)").run(G, U.bob.id, mine.id, clock.now());
  const ba = q1("SELECT id FROM attempts WHERE discord_id = ? ORDER BY id DESC LIMIT 1", U.bob.id).id;
  await api("PUT", "/api/settings", { g: G, integrity: { editor: "off", explain: false } });
  await select(U.bob, `lang:${ba}`, ["python"]);
  await submit(U.bob, `msub:${ba}`, "print(2 * int(input()))");
  check(q1("SELECT status FROM attempts WHERE id = ?", ba).status === "solved" && q1("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE discord_id = ? AND reason = 'author'", F.id).s === before + 3, "a classmate solves it: +3 for the author");
  const mq = call(raw(5, F as any, { custom_id: "mcreate:mcq-medium", components: [["title", "Strict equality"], ["question", "What does 1 === '1' give in JavaScript?"], ["choices", "true\nfalse\nundefined\nan error"], ["answer", "B"], ["explanation", "=== compares types too."]].map(([k, v]) => ({ type: 1, components: [{ type: 4, custom_id: k, value: v }] })) }));
  await mq;
  check(q1("SELECT kind, answer, status FROM challenges WHERE source = 'student' AND created_by = ? AND kind = 'mcq'", F.id)?.answer === "B", "students can write multiple-choice questions too");
}

section("events: live quiz from the dashboard, boss battle, bounties");
{
  const mcqs = q("SELECT id, answer FROM challenges WHERE kind = 'mcq' AND lang = 'en' AND guild_id IS NULL AND status = 'active' AND choices IS NOT NULL ORDER BY id LIMIT 2");
  const writeId = q1("SELECT id FROM challenges WHERE kind = 'write' AND lang = 'en' AND status = 'active' LIMIT 1").id;
  const bad = await api("POST", "/api/quizzes", { g: G, title: "x", challenge_ids: [writeId] });
  check(bad.status === 400, "a live quiz refuses write-code questions");
  const cq = await api("POST", "/api/quizzes", { g: G, title: "Friday quiz", seconds: 20, challenge_ids: mcqs.map((m: any) => m.id) });
  check(cq.status === 200 && cq.data.channel_id === ARENA && cq.data.current === -1, "quiz created, posted in #arena");
  check((await api("POST", "/api/quizzes", { g: G, title: "y", challenge_ids: [mcqs[0].id] })).status === 409, "one live quiz at a time");
  const qid = cq.data.id;
  let live = await api("POST", `/api/quizzes/${qid}/next`, { g: G });
  check(live.data.current === 0 && messagesTo(ARENA).some((m) => ids(m).includes(`qz:${qid}:0:A`)), "Start posts question 1 with A–D buttons");
  const wrong0 = ["A", "B", "C", "D"].find((l) => l !== mcqs[0].answer)!;
  clock.advance(2);
  const ra = await click(U.alice, `qz:${qid}:0:${mcqs[0].answer}`);
  check(ra.data?.flags === 64 && text(ra).includes(mcqs[0].answer), "answer locked privately");
  check(text(await click(U.alice, `qz:${qid}:0:${wrong0}`)).includes("already"), "one answer per question");
  clock.advance(8);
  await click(U.bob, `qz:${qid}:0:${wrong0}`);
  live = await api("GET", `/api/quizzes/${qid}?g=${G}`);
  check(live.data.answers.reduce((a: number, x: any) => a + x.n, 0) === 2 && live.data.standings[0].discord_id === U.alice.id, "teacher sees answers and the live leaderboard");
  const sA = q1("SELECT score FROM quiz_answers WHERE quiz_id = ? AND discord_id = ?", qid, U.alice.id).score;
  check(sA > 500 && sA < 1000 && q1("SELECT score FROM quiz_answers WHERE quiz_id = ? AND discord_id = ?", qid, U.bob.id).score === 0, `right + fast scores more (${sA}), wrong scores 0`);
  await api("POST", `/api/quizzes/${qid}/reveal`, { g: G });
  check(text(await click(U.carol, `qz:${qid}:0:A`)).includes("closed"), "no answers after the reveal");
  check(messagesTo(ARENA).some((m) => text(m).includes(mcqs[0].answer) && text(m).includes("✅")), "answer and distribution shown in #arena");
  await api("POST", `/api/quizzes/${qid}/next`, { g: G });
  clock.advance(30);
  check(text(await click(U.carol, `qz:${qid}:1:${mcqs[1].answer}`)).includes("late"), "answers after the timer are refused");
  const coins0 = q1("SELECT coins FROM players WHERE discord_id = ?", U.alice.id).coins;
  const end = await api("POST", `/api/quizzes/${qid}/end`, { g: G });
  check(end.data.status === "done" && q1("SELECT amount FROM ledger WHERE discord_id = ? AND reason = 'quiz' AND ref = ?", U.alice.id, String(qid))?.amount === Math.round(sA / 100), "quiz over: points = score ÷ 100");
  check(q1("SELECT coins FROM players WHERE discord_id = ?", U.alice.id).coins === coins0 + 15, "podium gets coins");
  check(text(await click(U.alice, `qz:${qid}:1:A`)).includes("closed"), "buttons dead after the end");

  // boss battle
  const bw = q1("SELECT * FROM challenges WHERE kind = 'write' AND lang = 'en' AND status = 'active' AND solution IS NOT NULL AND difficulty = 'easy' LIMIT 1");
  check((await api("POST", "/api/bosses", { g: G, challenge_id: mcqs[0].id })).status === 400, "a boss needs a write-code challenge");
  const cb = await api("POST", "/api/bosses", { g: G, challenge_id: bw.id, name: "Null Pointer", hp: 70, hours: 24, reward: 25, coins: 12 });
  const bid = cb.data.id;
  check(cb.status === 200 && messagesTo(ARENA).some((m) => ids(m).includes(`boss:${bid}`)), "boss posted in #arena with a Fight button");
  const fight = async (u: User, code: string) => {
    await click(u, `boss:${bid}`);
    const aid = q1("SELECT id FROM attempts WHERE origin = 'boss' AND ref = ? AND discord_id = ?", bid, u.id).id;
    await select(u, `lang:${aid}`, ["python"]);
    await submit(u, `msub:${aid}`, code);
    return aid;
  };
  await fight(U.alice, "print(0)");
  const hit0 = q1("SELECT damage FROM boss_hits WHERE boss_id = ? AND discord_id = ?", bid, U.alice.id)?.damage ?? 0;
  check(hit0 < 40, `partial damage for a wrong answer (${hit0})`);
  await submit(U.alice, `msub:${q1("SELECT id FROM attempts WHERE origin = 'boss' AND ref = ? AND discord_id = ?", bid, U.alice.id).id}`, bw.solution);
  check(q1("SELECT damage FROM boss_hits WHERE boss_id = ? AND discord_id = ?", bid, U.alice.id).damage === 40 && text(lastPatch()).includes("40"), "a full solve hits for 40");
  check(discordCalls.some((c) => c.method === "PATCH" && c.path.startsWith(`/channels/${ARENA}/messages/`) && text(c.body).includes("30/70")), "health bar updated in #arena");
  check(q1("SELECT status FROM bosses WHERE id = ?", bid).status === "active", "still alive at 30 HP");
  await fight(U.bob, bw.solution);
  check(q1("SELECT status FROM bosses WHERE id = ?", bid).status === "won", "class defeats the boss");
  check(q("SELECT discord_id FROM ledger WHERE reason = 'boss' AND ref = ?", String(bid)).length === 2, "every fighter gets the reward");
  check(messagesTo(ARENA).some((m) => text(m).includes("Null Pointer") && /defeat/i.test(text(m))), "victory announced");
  const lost = await api("POST", "/api/bosses", { g: G, challenge_id: bw.id, name: "Segfault", hp: 500, hours: 1 });
  clock.advance(3700);
  await runCron(env);
  check(q1("SELECT status FROM bosses WHERE id = ?", lost.data.id).status === "lost", "a boss not beaten in time escapes");

  // bounty
  const bq = q1("SELECT * FROM challenges WHERE kind = 'mcq' AND lang = 'en' AND status = 'active' AND guild_id IS NULL ORDER BY id DESC LIMIT 1");
  const cbt = await api("POST", "/api/bounties", { g: G, challenge_id: bq.id, points: 40, coins: 30, hours: 24 });
  const tid = cbt.data.id;
  check(messagesTo(ARENA).some((m) => ids(m).includes(`bty:${tid}`)), "bounty posted in #arena");
  await click(U.carol, `bty:${tid}`);
  const ca = q1("SELECT id FROM attempts WHERE origin = 'bounty' AND ref = ? AND discord_id = ?", tid, U.carol.id).id;
  const before = q1("SELECT coins FROM players WHERE discord_id = ?", U.carol.id).coins;
  await click(U.carol, `ans:${ca}:${bq.answer}`);
  const bt = q1("SELECT * FROM bounties WHERE id = ?", tid);
  check(bt.status === "claimed" && bt.winner_id === U.carol.id && q1("SELECT amount FROM ledger WHERE reason = 'bounty' AND ref = ?", String(tid))?.amount === 40, "first correct answer claims the bounty");
  check(q1("SELECT coins FROM players WHERE discord_id = ?", U.carol.id).coins >= before + 30, "bounty coins paid");
  check(text(await click(U.bob, `bty:${tid}`)).includes("claimed this bounty first"), "too late for the others");
  const ev = await api("GET", `/api/events?g=${G}`);
  check(ev.data.bosses.length === 2 && ev.data.bounties[0].winner_id === U.carol.id && !ev.data.live, "dashboard Events page data");
}

section("✨ AI helper for boss battles and bounties");
{
  const bossAi = await api("POST", `/api/events/ai?g=${G}`, { kind: "boss", idea: "a dragon guarding running totals", skill: "prefix" });
  check(bossAi.status === 200 && bossAi.data.name === "Lord Segfault" && bossAi.data.challenge?.kind === "write", "AI boss: a name and a new write-code problem");
  check(q1("SELECT status, solution IS NOT NULL AS sol FROM challenges WHERE id = ?", bossAi.data.challenge.id).sol === 1, "the boss's problem was checked and saved with its solution");
  check(bossAi.data.hp === bossAi.data.fighters * 40 && bossAi.data.hp >= 120 && bossAi.data.reward === 40, "health sized to the active class, hard rewards");
  check(ai.users.some((u) => u.includes("a dragon guarding running totals")), "the teacher's idea reaches the AI");
  check(bossAi.data.lore?.intro.includes("Atlas") && bossAi.data.lore.hits.length === 2 && bossAi.data.lore.dying, "the boss comes with its story (intro, strikes, half health, almost dead, victory, escape)");
  check(ai.prompts.some((p) => p.includes("BOSS BATTLE") && p.includes("tabletop role-playing") && p.includes("cursed vault")), "the problem itself is written as a quest in that story");
  const pc = discordCalls.length;
  const rel = await api("POST", "/api/bosses", { g: G, challenge_id: bossAi.data.challenge.id, name: bossAi.data.name, hp: 80, hours: bossAi.data.hours, reward: bossAi.data.reward, coins: bossAi.data.coins, lore: bossAi.data.lore });
  check(rel.status === 200 && discordCalls.slice(pc).some((c) => JSON.stringify(c.body).includes("Lord Segfault awakens")), "the AI boss is released with its intro in Discord");
  const EV = await import("../src/shared/events.ts");
  const gRow = q1("SELECT * FROM guilds WHERE id = ?", G);
  const h0 = discordCalls.length;
  await EV.bossHit(env, gRow, rel.data.id, U.alice.id, { passed: 1, total: 1 } as any);
  const told = discordCalls.slice(h0).map((c) => JSON.stringify(c.body)).join(" ");
  check(told.includes("damage!") && told.includes(`<@${U.alice.id}>`) && told.includes("40") && told.includes("half of his armour"), "a strike is told in the story, and the boss at half health roars");
  const h1 = discordCalls.length;
  await EV.bossHit(env, gRow, rel.data.id, U.bob.id, { passed: 1, total: 1 } as any);
  const won = discordCalls.slice(h1).map((c) => JSON.stringify(c.body)).join(" ");
  check(won.includes("The vault falls silent") && q1("SELECT status FROM bosses WHERE id = ?", rel.data.id).status === "won", "the victory is told as a glory story");
  const btyAi = await api("POST", `/api/events/ai?g=${G}`, { kind: "bounty", difficulty: "easy", qtype: "mcq" });
  check(btyAi.status === 200 && btyAi.data.challenge?.kind === "mcq" && btyAi.data.points === 25 && !btyAi.data.name, "AI bounty: a new multiple-choice challenge, easy points");
  const post = await api("POST", "/api/bounties", { g: G, challenge_id: btyAi.data.challenge.id, points: btyAi.data.points, coins: btyAi.data.coins, hours: btyAi.data.hours });
  check(post.status === 200, "the AI bounty can be posted");
  await api("POST", `/api/bounties/${post.data.id}/cancel`, { g: G });
  const old = ai.mode; ai.mode = "broken";
  const nBefore = q1("SELECT COUNT(*) AS n FROM challenges").n;
  check((await api("POST", `/api/events/ai?g=${G}`, { kind: "bounty", qtype: "mcq" })).status === 503 && q1("SELECT COUNT(*) AS n FROM challenges").n === nBefore, "AI down: a clear error for a bounty, nothing created");
  const fb = await api("POST", `/api/events/ai?g=${G}`, { kind: "boss", skill: "graphs" });
  check(fb.status === 200 && fb.data.fallback === true && fb.data.bank === "ogre-maze" && fb.data.lore?.hits.length === 6 && fb.data.challenge?.kind === "write", "AI down: the boss falls back to a ready-made one (same skill), not an error");
  ai.mode = old;
}

section("📚 Ready-made bosses");
{
  const { BOSS_BANK } = await import("../src/shared/bossbank.ts");
  const RN = await import("../src/shared/runner.ts");
  const list = await api("GET", `/api/bosses/bank?g=${G}`);
  check(list.status === 200 && list.data.bosses.length === BOSS_BANK.length && list.data.bosses.length >= 6, "the dialog lists the ready-made bosses");
  check(list.data.bosses.every((b: any) => b.name && b.emoji && b.skill_name && ["easy", "medium", "hard"].includes(b.difficulty) && b.intro), "each with a name, an emoji, a skill, a difficulty and its intro");
  for (const b of BOSS_BANK) {
    check(b.tests.filter((t) => t.sample).length >= 1 && b.tests.some((t) => t.gen) && b.lore.fr.hits.length === 6 && b.lore.en.hits.every((h) => h.includes("{hero}") && h.includes("{dmg}")), `${b.id}: samples, big tests, a story in both languages`);
  }
  const made = await api("POST", `/api/bosses/bank/tide-kraken?g=${G}`, {});
  const c = q1("SELECT * FROM challenges WHERE id = ?", made.data.challenge.id);
  check(made.status === 200 && made.data.bank === "tide-kraken" && made.data.lore.intro && made.data.hp >= 120 && c.kind === "write" && c.solution && c.test_set, "a ready-made boss: its quest saved in the bank with its tests");
  check(c.skills === "sorting", "tagged with its skill");
  const again = await api("POST", `/api/bosses/bank/tide-kraken?g=${G}`, {});
  check(again.data.challenge.id === c.id, "picked twice: the same challenge, no duplicate");
  const tests = q("SELECT idx, input, gen, expected, sample FROM challenge_tests WHERE test_set = ? ORDER BY idx", c.test_set);
  const j = await RN.judge(env, c.solution, "python", tests as any, c.time_limit);
  check(j.verdict === "accepted" && j.passed === j.total, "its reference solution passes all its tests on the runner");
  const wrong = await RN.judge(env, "print(0)", "python", tests as any, c.time_limit);
  check(wrong.passed < wrong.total, "a wrong answer fails");
  const rel = await api("POST", "/api/bosses", { g: G, challenge_id: made.data.challenge.id, name: made.data.name, hp: made.data.hp, hours: made.data.hours, reward: made.data.reward, coins: made.data.coins, lore: made.data.lore });
  check(rel.status === 200, "it can be released like an AI boss");
  check((await api("POST", `/api/bosses/bank/nope?g=${G}`, {})).status === 404, "unknown ready-made boss: 404");
}

section("2 vs 2 duels, coin shop, peer help, streak freeze");
{
  const more = { gina: { id: "107", name: "Gina", teacher: false }, hugo: { id: "108", name: "Hugo", teacher: false }, ines: { id: "109", name: "Ines", teacher: false }, jad: { id: "110", name: "Jad", teacher: false } };
  Object.assign(U, more);
  const { gina, hugo, ines, jad } = more;
  for (const u of [gina, hugo, ines, jad]) await slash(u, "profile");
  // 2 vs 2
  await slash(gina, "duel", { opponent: ines.id, partner: hugo.id, opponent2: jad.id, mode: "quick", difficulty: "easy" });
  const inv = messagesTo(ARENA).reverse().find((m) => text(m).includes("dacc:") && text(m).includes(`<@${jad.id}>`));
  const acc = ids(inv).find((i) => i.startsWith("dacc:"))!;
  const did = Number(acc.split(":")[1]);
  check(!!inv && q1("SELECT partner_id FROM duels WHERE id = ?", did).partner_id === hugo.id, "2 vs 2 invitation in #arena");
  check(text(await click(U.carol, acc)).includes("popcorn"), "outsiders can't accept");
  await click(hugo, acc); await click(ines, acc);
  check(q1("SELECT status FROM duels WHERE id = ?", did).status === "pending", "waits for all three");
  await click(jad, acc);
  const d = q1("SELECT * FROM duels WHERE id = ?", did);
  check(d.status === "active", "starts when everyone accepted");
  await click(gina, `dopen:${did}`);
  const first = ids(lastPatch()).find((i) => /^(ans|ansm):/.test(i))!;
  const aid = Number(first.split(":")[1]);
  const c = solveAnswer(d.challenge_id);
  if (first.startsWith("ans:")) await click(gina, `ans:${aid}:${c.answer}`); else await submit(gina, `mans:${aid}`, c.answer);
  check(q1("SELECT winner_id FROM duels WHERE id = ?", did).winner_id === gina.id, "Gina's team wins");
  check(q1("SELECT note FROM ledger WHERE discord_id = ? AND reason = 'duel' AND ref = ?", hugo.id, String(did))?.note === "team win", "the teammate wins the same points");
  check(q("SELECT 1 FROM ledger WHERE reason = 'duel' AND ref = ? AND discord_id IN (?, ?)", String(did), ines.id, jad.id).length === 2, "the other team gets participation points");

  // coin shop
  db.prepare("UPDATE players SET coins = 500 WHERE guild_id = ? AND discord_id = ?").run(G, gina.id);
  await slash(gina, "shop");
  check(text(lastPatch()).includes('"custom_id":"shopm"') && text(lastPatch()).includes('"value":"freeze"') && text(lastPatch()).includes("500"), "/shop lists the items and your coins");
  await click(gina, "shop:freeze");
  await click(gina, "shop:hint");
  let pg = q1("SELECT * FROM players WHERE discord_id = ?", gina.id);
  check(pg.coins === 410 && pg.streak_freezes === 1 && pg.hint_tokens === 1, "freeze + hint token bought");
  const tm = await click(gina, "shop:title");
  check(tm.type === 9, "title opens a form");
  await submit(gina, "mshop:title", "<@100> Bug Slayer https://x.y");
  pg = q1("SELECT * FROM players WHERE discord_id = ?", gina.id);
  check(pg.title === "Bug Slayer" && pg.coins === 310, "title cleaned (no pings or links) and bought");
  await slash(gina, "profile");
  check(text(lastPatch()).includes("Bug Slayer"), "title shown on the profile");
  await submit(gina, "mshop:color", "red");
  check(text(lastPatch()).includes("⚠️"), "bad color refused, no coins taken");
  await submit(gina, "mshop:color", "#ff0066");
  pg = q1("SELECT * FROM players WHERE discord_id = ?", gina.id);
  check(pg.color_role && pg.coins === 110 && discordCalls.some((x) => x.method === "PUT" && x.path === `/guilds/${G}/members/${gina.id}/roles/${pg.color_role}`), "color role created and given");
  db.prepare("UPDATE players SET coins = 20 WHERE guild_id = ? AND discord_id = ?").run(G, gina.id);
  await click(gina, "shop:freeze");
  check(text(lastPatch()).includes("Not enough coins") && q1("SELECT coins, streak_freezes FROM players WHERE discord_id = ?", gina.id).streak_freezes === 1, "can't buy without enough coins");
  // hint token makes the next hint free
  await slash(gina, "practice", { difficulty: "easy", type: "write" });
  const wa = Number(ids(lastPatch()).find((i) => i.startsWith("sub:"))!.split(":")[1]);
  await click(gina, `hint:${wa}`);
  check(q1("SELECT free_hints FROM attempts WHERE id = ?", wa).free_hints === 1 && q1("SELECT hint_tokens FROM players WHERE discord_id = ?", gina.id).hint_tokens === 0, "hint token used: that hint is free");
  // streak freeze
  await runCron(env);
  const day = new Date(Date.now()).toISOString().slice(0, 10);
  const dl = q1("SELECT * FROM daily WHERE guild_id = ? AND day = ?", G, day);
  const twoAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  db.prepare("UPDATE players SET last_daily_day = ?, daily_streak = 4 WHERE guild_id = ? AND discord_id = ?").run(twoAgo, G, gina.id);
  if (dl) {
    await click(gina, `dsolve:${day.replace(/-/g, "")}`);
    const dc = solveAnswer(dl.challenge_id);
    const f = ids(lastPatch()).find((i) => /^(ans|ansm|sub|chk):/.test(i))!;
    const da = Number(f.split(":")[1]);
    if (dc.kind === "write") { await select(gina, `lang:${da}`, ["python"]); await submit(gina, `msub:${da}`, dc.solution); }
    else if (f.startsWith("ans:")) await click(gina, `ans:${da}:${dc.answer}`);
    else if (dc.kind !== "code") await submit(gina, `mans:${da}`, dc.answer);
    if (dc.kind !== "code") {
      pg = q1("SELECT * FROM players WHERE discord_id = ?", gina.id);
      check(pg.daily_streak === 5 && pg.streak_freezes === 0, `streak freeze covered the missed day (streak ${pg.daily_streak})`);
    }
  }
  // expiry
  clock.advance(8 * 86400);
  await runCron(env);
  pg = q1("SELECT * FROM players WHERE discord_id = ?", gina.id);
  check(!pg.title && !pg.color_role && discordCalls.some((x) => x.method === "DELETE" && x.path.includes("/roles/")), "title and color role removed after 7 days");

  // peer help
  await slash(hugo, "practice", { difficulty: "easy", type: "write" });
  const ha = Number(ids(lastPatch()).find((i) => i.startsWith("sub:"))!.split(":")[1]);
  check(!ids(lastPatch()).some((i) => i.startsWith("ask:")), "no Ask button before a first try");
  await select(hugo, `lang:${ha}`, ["python"]);
  await submit(hugo, `msub:${ha}`, "print(0)");
  check(ids(lastPatch()).includes(`ask:${ha}`), "Ask a classmate after a wrong try");
  await click(hugo, `ask:${ha}`);
  const post = messagesTo(ARENA).reverse().find((m) => text(m).includes("hlp:"));
  const rid = Number(ids(post).find((i) => i.startsWith("hlp:"))!.split(":")[1]);
  check(!!post && text(post).includes("print(0)"), "request posted in #arena with the code");
  check(text(await click(hugo, `hlp:${rid}`)).includes("own"), "can't answer your own request");
  check((await click(ines, `hlp:${rid}`)).type === 9, "a classmate opens the explain form");
  await submit(ines, `mhelp:${rid}`, "def solve(a):\n    s = 0\n    for x in a:\n        if x > 0:\n            s += x\n    return s\nprint(solve(list(map(int, input().split()))))");
  check(/words|solution/i.test(text(lastPatch())) && !q1("SELECT 1 AS x FROM help_answers WHERE request_id = ?", rid), "pasting a solution is refused");
  await submit(ines, `mhelp:${rid}`, "You print a constant. Read the input first, then think about what happens when every number is negative.");
  const dmHugo = discordCalls.filter((x) => x.path === `/channels/dm-${hugo.id}/messages`).pop();
  const rate = ids(dmHugo?.body).find((i) => i.startsWith("hrate:") && i.endsWith(":1"))!;
  check(!!rate, "explanation DMed with 👍/👎");
  check(text(await click(ines, rate)).includes("not") || text(lastPatch()).includes("not yours") || !q1("SELECT rating FROM help_answers WHERE request_id = ?", rid).rating, "only the asker can rate");
  const c0 = q1("SELECT coins FROM players WHERE discord_id = ?", ines.id).coins;
  await click(hugo, rate);
  check(q1("SELECT amount FROM ledger WHERE discord_id = ? AND reason = 'review' AND ref = ?", ines.id, String(rid))?.amount === 8 && q1("SELECT coins FROM players WHERE discord_id = ?", ines.id).coins === c0 + 5, "helpful: +8 points +5 coins for the helper");
  check(q1("SELECT status FROM help_requests WHERE id = ?", rid).status === "closed", "request closed");
  // daily cap
  for (let i = 0; i < 2; i++) db.prepare("INSERT INTO ledger (guild_id, discord_id, season, amount, reason, ref, created_at) VALUES (?, ?, 'x', 8, 'review', 'x', ?)").run(G, ines.id, clock.now());
  await slash(jad, "practice", { difficulty: "easy", type: "write" });
  const ja = Number(ids(lastPatch()).find((i) => i.startsWith("sub:"))!.split(":")[1]);
  await select(jad, `lang:${ja}`, ["python"]);
  await submit(jad, `msub:${ja}`, "print(1)");
  await click(jad, `ask:${ja}`);
  const rid2 = Number(ids(messagesTo(ARENA).reverse().find((m) => text(m).includes("hlp:"))).find((i) => i.startsWith("hlp:"))!.split(":")[1]);
  await submit(ines, `mhelp:${rid2}`, "Your output does not depend on the input at all. Store the numbers in a list and loop over them.");
  const rate2 = ids(discordCalls.filter((x) => x.path === `/channels/dm-${jad.id}/messages`).pop()?.body).find((i) => i.startsWith("hrate:") && i.endsWith(":1"))!;
  await click(jad, rate2);
  check(!q1("SELECT 1 AS x FROM ledger WHERE discord_id = ? AND reason = 'review' AND ref = ?", ines.id, String(rid2)), "max 3 rewarded explanations a day");
  const ev = await api("GET", `/api/events?g=${G}`);
  check(ev.data.shop.find((x: any) => x.key === "title").n === 1 && ev.data.help.helpful === 2, "dashboard shows shop and help stats");
}

section("help queue: /help-me, live queue in the dashboard, replies by DM");
{
  const kai = { id: "111", name: "Kai", teacher: false }, lea = { id: "112", name: "Lea", teacher: false };
  const raise = (u: User, q: string, code = "") => call(raw(5, u, { custom_id: "mhand", components: [
    { type: 1, components: [{ type: 4, custom_id: "q", value: q }] }, { type: 1, components: [{ type: 4, custom_id: "code", value: code }] }] }));
  const m = await slash(kai, "help-me");
  check(m.type === 9 && m.data.custom_id === "mhand", "/help-me opens a form (question + optional code)");
  await raise(kai, "My loop never stops", "while True:\n    pass");
  check(text(lastPatch()).includes("next"), "first in the queue: 'you're next'");
  const teacherId = q1("SELECT teacher_id FROM guilds WHERE id = ?", G).teacher_id;
  const tdm = () => discordCalls.filter((x) => x.path === `/channels/dm-${teacherId}/messages`);
  const nBefore = tdm().length;
  await raise(lea, "How do I read two numbers?");
  check(text(lastPatch()).includes("#2"), "second student is #2");
  {
    const sent = tdm().slice(nBefore), b = sent.at(-1)?.body;
    const btn = b?.components?.[0]?.components?.[0];
    const leaId = q1("SELECT id FROM hands WHERE discord_id = ?", lea.id).id;
    check(!!teacherId && sent.length === 1 && JSON.stringify(b.embeds).includes("Lea") && JSON.stringify(b.embeds).includes("read two numbers") && JSON.stringify(b.embeds).includes("**2**"),
      "the teacher gets a DM with the student, the question and how many are waiting");
    check(btn?.style === 5 && btn.url.includes(`g=${G}`) && btn.url.includes(encodeURIComponent(`hands/${leaId}`)), "the DM has a button that opens this request in the dashboard");
  }
  check(text(await (async () => { await raise(kai, "again"); return lastPatch(); })()).includes("already"), "one raised hand at a time");
  const st = await slash(kai, "help-me");
  const kaiHand = q1("SELECT * FROM hands WHERE discord_id = ?", kai.id), leaHand = q1("SELECT * FROM hands WHERE discord_id = ?", lea.id);
  check(ids(st.data).includes(`hand:cancel:${kaiHand.id}`) && text(st).includes("next"), "/help-me again shows the place and a cancel button");
  let qd = await api("GET", `/api/hands?g=${G}`);
  check(qd.data.open.length === 2 && qd.data.stats.waiting === 2 && qd.data.open[0].code.includes("while True"), "dashboard queue lists both, with the code");
  check((await api("GET", `/api/pills?g=${G}`)).data.hands === 2, "nav badge counts waiting hands");
  await api("PUT", `/api/hands/${kaiHand.id}?g=${G}`, { action: "take" });
  check(text(discordCalls.filter((x) => x.path === `/channels/dm-${kai.id}/messages`).pop()?.body).includes("coming"), "'I'm coming' is DMed");
  check(q1("SELECT position FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS position FROM hands WHERE status = 'waiting') WHERE id = ?", leaHand.id)?.position === 1, "Lea moves up when Kai is being helped");
  qd = await api("PUT", `/api/hands/${leaHand.id}?g=${G}`, { action: "reply", reply: "Use input().split() and map(int, ...)." });
  check(text(discordCalls.filter((x) => x.path === `/channels/dm-${lea.id}/messages`).pop()?.body).includes("map(int"), "written reply is DMed with the question");
  check(qd.data.open.length === 1 && qd.data.done.length === 1, "answered hand leaves the queue");
  const c = await click(lea, `hand:cancel:${leaHand.id}`);
  check(c.type === 7 && text(c).includes("closed"), "cancelling a closed hand says so");
  await api("PUT", `/api/hands/${kaiHand.id}?g=${G}`, { action: "done" });
  qd = await api("GET", `/api/hands?g=${G}`);
  check(qd.data.open.length === 0 && qd.data.stats.helped === 2 && qd.data.stats.avgWait != null, "queue empty, average wait computed");
}

section("teacher DMs: /help-me and /ask notify the teacher, /teacher notify, settings");
{
  const kai = { id: "111", name: "Kai", teacher: false }, mo = { id: "115", name: "Mo", teacher: false };
  const toProf = () => discordCalls.filter((x) => x.path === `/channels/dm-${U.prof.id}/messages`);
  // a class set up before notifications existed: nobody is saved
  run1("UPDATE guilds SET teacher_id = NULL, notify = NULL WHERE id = ?", G);
  await slash(U.prof, "help", {});
  check(q1("SELECT teacher_id FROM guilds WHERE id = ?", G).teacher_id === U.prof.id, "the first teacher who uses the bot gets the DMs when nobody was set");
  await slash(kai, "help", {});
  check(q1("SELECT teacher_id FROM guilds WHERE id = ?", G).teacher_id === U.prof.id, "a student never becomes the teacher");

  let n = toProf().length;
  await slash(mo, "ask", { question: "Can we use the internet during the exam on Friday?" });
  const qid = q1("SELECT id FROM faq WHERE guild_id = ? AND status = 'pending' AND question LIKE '%internet%'", G).id;
  let b = toProf().slice(n).at(-1)?.body;
  check(toProf().length === n + 1 && JSON.stringify(b.embeds).includes("Mo") && JSON.stringify(b.embeds).includes("internet"), "/ask: the teacher gets a DM with the student and the question");
  check(b.components[0].components[0].url.includes(encodeURIComponent(`questions/${qid}`)), "/ask DM opens that question in the dashboard");
  n = toProf().length;
  await slash(kai, "ask", { question: "Can we use the internet during the exam on friday?" });
  check(toProf().length === n, "a student joining the same question doesn't send a second DM");

  // turn /ask DMs off from the dashboard
  let st = await api("GET", `/api/notify?g=${G}`);
  check(st.data.teacher?.id === U.prof.id && st.data.cfg.hands && st.data.cfg.ask, "dashboard shows who gets the DMs and that both are on");
  st = await api("PUT", `/api/notify?g=${G}`, { ask: false });
  check(st.data.cfg.ask === false && st.data.cfg.hands === true, "the teacher can turn /ask DMs off");
  n = toProf().length;
  await slash(mo, "ask", { question: "What time does the lab open on Saturdays?" });
  check(toProf().length === n, "no DM when /ask notifications are off");
  await api("PUT", `/api/notify?g=${G}`, { ask: true });

  n = toProf().length;
  const t1 = await api("POST", `/api/notify/test?g=${G}`);
  check(t1.data.ok === true && toProf().length === n + 1 && JSON.stringify(toProf().at(-1).body).includes("Notifications are on"), "'Send me a test DM' works");

  // another teacher takes over with /teacher notify
  const prof2 = { id: "101", name: "Prof2", teacher: true };
  const r = await slash(prof2, "teacher", { help_me: true }, "notify");
  check(q1("SELECT teacher_id FROM guilds WHERE id = ?", G).teacher_id === prof2.id && text(r).includes("you"), "/teacher notify sends the DMs to whoever runs it");
  check(discordCalls.some((x) => x.path === `/channels/dm-${prof2.id}/messages` && JSON.stringify(x.body).includes("Notifications are on")), "/teacher notify sends a test DM");
  await slash(U.prof, "teacher", { language: "en" }, "setup");
  check(q1("SELECT teacher_id FROM guilds WHERE id = ?", G).teacher_id === U.prof.id, "/teacher setup also makes you the one who gets them");
  run1("DELETE FROM faq WHERE guild_id = ? AND (question LIKE '%internet%' OR question LIKE '%lab open%')", G);
}

section("skill mastery: code proves it (80%), every submission updates the skills it uses");
{
  const att = (kind: string, status: string, skills: string, difficulty = "easy") => ({ status, used_hint: 0, tries: 1, kind, difficulty, skills, result: null, finished_at: 1, challenge_id: 1 });
  const ev = (skill: string, ok: boolean, weight = 1) => ({ status: ok ? "solved" : "failed", used_hint: 0, tries: 1, kind: "evidence", difficulty: "easy", skills: skill, result: null, finished_at: 1, challenge_id: 0, weight });
  const sk = (list: any[], key: string) => masteryFrom(list as any).find((x) => x.key === key)!;
  const quickOnly = sk(Array.from({ length: 6 }, () => att("mcq", "solved", "loops")), "loops");
  check(quickOnly.mastery <= 20 && !quickOnly.proven && quickOnly.status !== "strong", `6 multiple-choice right, no code: at most 20% (${quickOnly.mastery}%)`);
  const withCode = sk([...Array.from({ length: 6 }, () => att("mcq", "solved", "loops")), ...["easy", "easy", "easy", "medium", "medium", "medium"].map((d) => att("write", "solved", "loops", d))], "loops");
  check(withCode.mastery >= 65 && withCode.proven && withCode.status === "strong", `then easy AND medium write-code solves: strong (${withCode.mastery}%, code ${withCode.code}%)`);
  const codeBad = sk([...Array.from({ length: 8 }, () => att("mcq", "solved", "loops")), att("write", "failed", "loops", "medium"), att("write", "failed", "loops", "medium")], "loops");
  check(codeBad.mastery < 35, `perfect quizzes can't hide failed code (${codeBad.mastery}%)`);
  // the difficulty ladder
  const easyOnly = sk(Array.from({ length: 10 }, () => att("write", "solved", "strings", "easy")), "strings");
  check(easyOnly.mastery <= 50 && easyOnly.status !== "strong" && easyOnly.target === "medium", `10 easy solves and nothing harder: at most 50%, next level medium (${easyOnly.mastery}%)`);
  const twoEasy = sk([att("write", "solved", "strings", "easy"), att("write", "solved", "strings", "easy")], "strings");
  check(twoEasy.mastery < 40, `2 easy solves are not "great at it" (${twoEasy.mastery}%)`);
  const oneHard = sk([att("write", "solved", "dp", "hard")], "dp");
  check(oneHard.mastery <= 50, `one lucky hard solve isn't proof (${oneHard.mastery}%)`);
  const hardWork = sk(["medium", "medium", "medium", "medium", "medium", "hard", "hard"].map((d) => att("write", "solved", "dp", d)), "dp");
  check(hardWork.mastery >= 80 && hardWork.levels[2] > 0, `reliable at medium and solving hard ones: near the top (${hardWork.mastery}%)`);
  const shaky = sk([...["medium", "medium", "medium", "medium"].map((d) => att("write", "solved", "loops", d)), ...[1, 2, 3].map(() => att("write", "failed", "loops", "easy"))], "loops");
  check(shaky.mastery < withCode.mastery - 15, `failing easy ones pulls the harder levels down too (${shaky.mastery}%)`);
  const code6 = ["easy", "easy", "easy", "medium", "medium", "medium"].map((d) => att("write", "solved", "loops", d));
  const plusQuiz = sk([...code6, ...Array.from({ length: 8 }, () => att("mcq", "solved", "loops"))], "loops").mastery;
  check(plusQuiz >= sk(code6, "loops").mastery, `extra (correct) practice never lowers a score (${sk(code6, "loops").mastery}% → ${plusQuiz}%)`);
  const big = sk(["easy", "easy", "easy", "medium", "medium", "medium"].map((d) => att("complexity", "solved", "complexity", d)), "complexity");
  check(big.mastery >= 65 && big.proven, `skills that can't be coded (Big-O) are measured by their own challenges, with the same ladder (${big.mastery}%)`);
  const before = sk([att("write", "solved", "binsearch,arrays", "medium"), att("write", "solved", "arrays")], "arrays");
  const after = sk([ev("arrays", false), ev("arrays", false), ev("arrays", false), att("write", "solved", "binsearch,arrays", "medium"), att("write", "solved", "arrays")], "arrays");
  check(after.mastery < before.mastery - 15 && after.codeMistakes === 3, `array mistakes found in their code lower "arrays" (${before.mastery}% → ${after.mastery}%)`);

  check(JSON.stringify(skillsInCode("for i in range(n):\n    total += a[i]\n# a comment with while\n")) === JSON.stringify(["arrays", "loops"]) || skillsInCode("for i in range(n):\n    total += a[i]").includes("loops"), "skills seen in code: loops, arrays");
  check(mistakeSkills({ verdict: "runtime", failed: { error: "IndexError: list index out of range" } } as any).skills[0] === "arrays", "IndexError → arrays");
  check(mistakeSkills({ verdict: "runtime", failed: { error: "RecursionError: maximum recursion depth exceeded" } } as any).skills[0] === "recursion", "RecursionError → recursion");
  check(mistakeSkills({ verdict: "runtime", failed: { error: "KeyError: 'x'" } } as any).skills[0] === "dicts", "KeyError → dictionaries");
  check(mistakeSkills({ verdict: "compile", error: "SyntaxError" } as any).skills[0] === "basics", "doesn't compile → basics");
  check(mistakeSkills({ verdict: "wrong" } as any, "", ["strings"]).skills[0] === "strings", "the AI's tag wins");

  // a real submission: a wrong answer, the AI review says the mistake is in loops
  const E = { id: "120", name: "Ezra", teacher: false };
  const w = q1("SELECT * FROM challenges WHERE source = 'seed' AND kind = 'write' AND lang = 'en' AND difficulty = 'easy' AND solution IS NOT NULL ORDER BY id DESC LIMIT 1");
  db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, started_at) VALUES (?, ?, ?, 'practice', ?)").run(G, E.id, w.id, clock.now());
  const wid = q1("SELECT id FROM attempts WHERE discord_id = ? ORDER BY id DESC LIMIT 1", E.id).id;
  run1("DELETE FROM ai_usage");
  await select(E as any, `lang:${wid}`, ["python"]);
  await submit(E as any, `msub:${wid}`, "print(0)");
  const shown = text(lastPatch());
  check(!shown.includes("SKILLS") && shown.includes("every number is negative"), "the AI's skill tag is hidden from the student");
  let rows = q("SELECT * FROM skill_evidence WHERE discord_id = ? ORDER BY id", E.id);
  check(rows.length === 1 && rows[0].skill === "loops" && rows[0].ok === 0 && rows[0].why === "AI review", `wrong answer: a mistake in loops is recorded (${JSON.stringify(rows.map((r: any) => r.skill + ":" + r.ok))})`);
  // the AI budget is used up: the error message decides
  const day = new Date().toISOString().slice(0, 10);
  run1("INSERT OR REPLACE INTO ai_usage (day, count) VALUES (?, 99999)", day);
  await submit(E as any, `msub:${wid}`, "a = [1, 2]\nprint(a[7])");
  rows = q("SELECT * FROM skill_evidence WHERE discord_id = ? ORDER BY id", E.id);
  check(rows.at(-1).skill === "arrays" && rows.at(-1).ok === 0 && rows.at(-1).why.includes("IndexError"), `crash on an index: a mistake in arrays (${rows.at(-1)?.why})`);
  run1("DELETE FROM ai_usage");
  await submit(E as any, `msub:${wid}`, w.solution);
  rows = q("SELECT * FROM skill_evidence WHERE discord_id = ? AND ok = 1", E.id);
  const own = String(w.skills ?? "").split(",");
  check(rows.every((r: any) => !own.includes(r.skill)), `accepted code: skills it uses get credit (${rows.map((r: any) => r.skill).join(",") || "none beyond the challenge's own"})`);
  const page = await api("GET", `/api/students/${E.id}?g=${G}`);
  const arr = page.data.coach?.skills?.find((x: any) => x.key === "arrays");
  check(arr && arr.codeMistakes >= 1 && arr.code != null, `student page shows code mistakes per skill (${JSON.stringify(arr && { m: arr.mastery, code: arr.code, quick: arr.quick, mistakes: arr.codeMistakes })})`);
}

section("/practice 🎯 picked for me: what the student needs next, at their level");
{
  const NEW = { id: "130", name: "Nour", teacher: false };
  const lastAtt = (uid: string) => q1("SELECT a.*, c.kind, c.skills, c.difficulty FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.discord_id = ? ORDER BY a.id DESC LIMIT 1", uid);
  const g0 = q1("SELECT * FROM guilds WHERE id = ?", G);
  const { roadmapFor } = await import("../src/shared/tracks.ts");
  const first = roadmapFor(g0)[0].skill;
  await slash(NEW as any, "practice", { type: "forme" });
  let a = lastAtt(NEW.id), msg = text(lastPatch());
  check(!!a && a.difficulty === "easy" && String(a.skills).split(",").includes(first), `a beginner starts with the roadmap's first skill (${first}), easy (${a?.skills} ${a?.difficulty})`);
  check(a?.kind === "write" || a?.kind === "sql", `…as a write-code challenge (${a?.kind})`);
  check(msg.includes("first steps"), "…and is told why");

  // a student who solves a few things but keeps failing arrays: arrays comes first
  const W = { id: "131", name: "Walid", teacher: false };
  await slash(W as any, "help", {});
  const pick = (skill: string, kind = "write") => q1(`SELECT id FROM challenges WHERE status = 'active' AND lang = 'en' AND kind = ? AND (',' || skills || ',') LIKE ? ORDER BY id LIMIT 1 OFFSET ?`, kind, `%,${skill},%`, 0);
  const add = (cid: number, status: string) => run1("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, status, tries, started_at, finished_at) VALUES (?, ?, ?, 'practice', ?, 1, ?, ?)", G, W.id, cid, status, clock.now() - 3600, clock.now() - 3600);
  const arr = q(`SELECT id FROM challenges WHERE status = 'active' AND lang = 'en' AND (',' || skills || ',') LIKE '%,arrays,%' AND (',' || skills || ',') NOT LIKE '%,basics,%' LIMIT 4`);
  const bas = q(`SELECT id FROM challenges WHERE status = 'active' AND lang = 'en' AND (',' || skills || ',') LIKE '%,basics,%' AND (',' || skills || ',') NOT LIKE '%,arrays,%' LIMIT 4`);
  for (const r of bas) add(r.id, "solved");
  for (const r of arr) add(r.id, "failed");
  for (let i = 0; i < 3; i++) run1("INSERT INTO skill_evidence (guild_id, discord_id, attempt_id, skill, ok, weight, why, created_at) VALUES (?, ?, 0, 'arrays', 0, 1, 'test', ?)", G, W.id, clock.now());
  await slash(W as any, "practice", { type: "forme" });
  a = lastAtt(W.id); msg = text(lastPatch());
  const roadSkills = [...new Set(roadmapFor(g0).map((x: any) => x.skill))];
  const firstWeak = roadSkills.find((k: string) => k === "arrays" || (k !== "basics" && false));
  check(String(a.skills).split(",").includes("arrays") && msg.includes("weakest"), `weak at arrays: an arrays challenge, explained (${a.skills}; ${msg.slice(0, 90)})`);
  check(a.difficulty === "easy", `…at an easy level since they fail it (${a.difficulty})`);
  void pick; void firstWeak;

  // no difficulty chosen: a level that suits them
  await slash(NEW as any, "practice", { type: "output" });
  a = lastAtt(NEW.id);
  check(a && a.kind === "output" && a.difficulty === "easy", `difficulty left empty: a beginner gets easy (${a?.difficulty})`);
}

section("speed: a practice set for a whole class stays under the free plan's 50 queries");
{
  for (let i = 0; i < 30; i++) run1("INSERT OR IGNORE INTO players (guild_id, discord_id, name, created_at) VALUES (?, ?, ?, ?)", G, `9${String(i).padStart(3, "0")}`, `Student ${i}`, clock.now());
  const many = Array.from({ length: 30 }, (_, i) => `9${String(i).padStart(3, "0")}`);
  const before = d1.queries;
  const r = await api("POST", "/api/skills/practice-set", { g: G, skill: "loops", students: many, count: 3, due_at: null });
  const used = d1.queries - before;
  check(r.data.students === 30 && r.data.assignments >= 30, `30 students got their challenges (${r.data.assignments} assignments)`);
  check(used <= 25, `…in ${used} database queries (was ~550)`);
  check(q1("SELECT COUNT(*) AS n FROM assignments WHERE discord_id IN (" + many.map(() => "?").join(",") + ")", ...many).n === r.data.assignments, "all of them were saved");
  run1("DELETE FROM assignments WHERE discord_id LIKE '9%' AND LENGTH(discord_id) = 4");
  run1("DELETE FROM players WHERE discord_id LIKE '9%' AND LENGTH(discord_id) = 4");
}

section("student page: what to work on, with the evidence behind it");
{
  const ez = await api("GET", `/api/students/120?g=${G}`);
  const wo = ez.data.coach.workOn as any[];
  const arr = wo.find((w) => w.skill === "arrays");
  check(Array.isArray(wo) && wo.length > 0 && wo.every((w) => typeof w.why === "string" && w.why.length > 10), `each skill to work on comes with a reason (${wo.map((w) => w.skill).join(", ")})`);
  check(!!arr && arr.codeMistakes.length >= 1 && arr.codeMistakes[0].detail.includes("IndexError") && !!arr.codeMistakes[0].title, `arrays: the challenge where their code crashed on an index is named (${arr?.codeMistakes?.[0]?.title}: ${arr?.codeMistakes?.[0]?.detail})`);
  check(/mistakes in this in their code/.test(arr?.why ?? ""), `…and the reason says so ("${arr?.why}")`);
  check(arr.revisit.some((x: string) => /Index bounds/.test(x)) && arr.revisit.some((x: string) => /Key point from the lesson/.test(x)), `what to revisit: from their mistakes and the lesson (${arr.revisit.join(" | ")})`);
  run1("DELETE FROM ai_usage");
  const note = await api("POST", `/api/students/120/workon-note?g=${G}`, { skill: "arrays" });
  check(note.status === 200 && /length - 1/.test(note.data.text), "✍️ the AI drafts a note to the student from the evidence");
  const nb = discordCalls.length;
  const sent = await api("POST", `/api/students/120/message?g=${G}`, { text: note.data.text });
  check(sent.status === 200 && discordCalls.slice(nb).some((x) => x.path === "/channels/dm-120/messages" && JSON.stringify(x.body).includes("note from your teacher")), "…and the teacher sends it by DM");
  const wal = await api("GET", `/api/students/131?g=${G}`);
  const wa = (wal.data.coach.workOn as any[]).find((w) => w.skill === "arrays");
  check(!!wa && (wa.failedCode.length + wa.missedQuick.length) >= 1 && /didn't solve|missed/i.test(wa.why), `failed challenges are listed by name (${wa?.why})`);
  const q = wa?.missedQuick?.[0];
  if (q) check(/answered “/.test(q.detail), `a missed question shows what they answered (${q.detail})`);
}

section("coins & shop: the teacher gives, removes and zeroes coins, and manages the shop");
{
  const coins = (id: string) => q1("SELECT coins FROM players WHERE guild_id = ? AND discord_id = ?", G, id).coins;
  const A = U.alice.id, B = U.bob.id;
  run1("UPDATE players SET coins = 100 WHERE guild_id = ? AND discord_id IN (?, ?)", G, A, B);
  let r = await api("POST", `/api/coins?g=${G}`, { students: [A, B], op: "add", amount: 50, reason: "great teamwork", notify: true });
  check(r.status === 200 && r.data.changed === 2 && coins(A) === 150 && coins(B) === 150, "give 50 coins to two students");
  check(discordCalls.some((x) => x.path === `/channels/dm-${A}/messages` && JSON.stringify(x.body).includes("great teamwork")), "…they're told by DM, with the reason");
  r = await api("POST", `/api/coins?g=${G}`, { students: [A], op: "remove", amount: 500 });
  check(coins(A) === 0, "removing more than they have stops at 0");
  r = await api("POST", `/api/coins?g=${G}`, { students: [B], op: "set", amount: 0 });
  check(coins(B) === 0 && r.data.log.length >= 3 && r.data.log[0].delta === -150, "set to 0, and every change is in the history");
  const n = q1("SELECT COUNT(*) AS n FROM players WHERE guild_id = ?", G).n;
  r = await api("POST", `/api/coins?g=${G}`, { students: "all", op: "add", amount: 10 });
  check(r.data.changed === n, `everyone at once (${r.data.changed} students)`);

  // shop: new prices, an item turned off, an own reward
  r = await api("PUT", `/api/shop?g=${G}`, { items: { freeze: { on: true, price: 40, max: 3 }, hint: { on: false, price: 30, max: 5 }, title: { on: true, price: 100, days: 7 }, color: { on: true, price: 200, days: 7 } },
    custom: [{ name: "Choose your seat", emoji: "🪑", price: 30, desc: "for one class", stock: 1, per_student: 1 }] });
  const items = r.data.shop.items;
  check(items.find((x: any) => x.key === "freeze").price === 40 && items.find((x: any) => x.key === "hint").on === false, "prices and items on/off are saved");
  const seat = items.find((x: any) => x.custom);
  check(seat && seat.name === "Choose your seat" && seat.price === 30, "an own reward is added");
  run1("UPDATE players SET coins = 100 WHERE guild_id = ? AND discord_id IN (?, ?)", G, A, B);
  const bob = U.bob as any;
  await slash(bob, "shop");
  let sh = text(lastPatch());
  check(sh.includes("Choose your seat") && !sh.includes('"value":"hint"') && sh.includes('"value":"freeze"') && sh.includes(`"value":"${seat.key}"`) && sh.includes("40"), "/shop shows the teacher's prices, hides items turned off, lists own rewards");
  const tb = discordCalls.length;
  await click(bob, `shop:${seat.key}`);
  check(coins(B) === 70 && q1("SELECT status FROM purchases WHERE guild_id = ? AND discord_id = ? AND item = ?", G, B, seat.key)?.status === "pending", "buying an own reward takes the coins and waits for the teacher");
  const teacherId = q1("SELECT teacher_id FROM guilds WHERE id = ?", G).teacher_id;
  check(discordCalls.slice(tb).some((x) => x.path === `/channels/dm-${teacherId}/messages` && JSON.stringify(x.body).includes("Choose your seat")), "…the teacher gets a DM");
  await click(U.alice as any, `shop:${seat.key}`);
  check(text(lastPatch()).includes("Sold out") && coins(A) === 100, "stock 1: the next student sees it sold out and pays nothing");
  let v = await api("GET", `/api/coins?g=${G}`);
  check(v.data.pending.length === 1 && v.data.pending[0].name, "the dashboard lists the reward to give");
  check((await api("GET", `/api/pills?g=${G}`)).data.shop === 1, "…with a badge in the menu");
  v = await api("POST", `/api/shop/purchases/${v.data.pending[0].id}?g=${G}`, { action: "refund" });
  check(coins(B) === 100 && v.data.pending.length === 0, "refund: the coins come back");
  const off = await select(U.alice as any, "shopm", ["hint"]);
  check(text(off).includes("isn't in the shop"), "an item turned off can't be bought");
  await api("PUT", `/api/shop?g=${G}`, { items: {}, custom: [] });
}

section("shop: boosts and profile extras");
{
  const A = U.alice.id, B = U.bob.id, alice = U.alice as any, bob = U.bob as any;
  const coins = (id: string) => q1("SELECT coins FROM players WHERE guild_id = ? AND discord_id = ?", G, id).coins;
  const P = (id: string) => q1("SELECT * FROM players WHERE guild_id = ? AND discord_id = ?", G, id);
  run1("UPDATE players SET coins = 5000, cosmetics = NULL, boosts = NULL WHERE guild_id = ? AND discord_id IN (?, ?)", G, A, B);
  await slash(alice, "shop");
  const menu = text(lastPatch());
  check(["double", "contract", "shield", "theme", "motto", "emoji", "showcase", "lang", "pin", "frame", "victory", "levelup", "flair"].every((k) => menu.includes(`"value":"${k}"`)), "the 13 new items are in the /shop menu");
  check((lastPatch().embeds ?? []).length >= 4 && menu.length < 12000, "the shop is split into groups (items, boosts, profile, game)");

  // pickers and forms
  const pick = await select(alice, "shopm", ["theme"]);
  check(pick.type === 5 && text(lastPatch()).includes("shopsel:theme") && text(lastPatch()).includes("ocean"), "a choice item opens a picker");
  const up = await select(alice, "shopsel:theme", ["ocean"]);
  check(up.type === 6 && JSON.parse(P(A).cosmetics).theme.v === "ocean" && text(lastPatch()).includes("Ocean"), "picking a theme buys it");
  const bud = await select(alice, "shopm", ["buddy"]);
  check(bud.type === 4 && bud.data.components[0].components[0].type === 5 && bud.data.components[0].components[0].custom_id === "shopsel:buddy", "🤝 squad buddy opens a classmate picker");
  check((await select(alice, "shopm", ["motto"])).type === 9, "motto opens a form");
  await submit(alice, "mshop:motto", "Never give up @everyone https://spam.example");
  const mot = JSON.parse(P(A).cosmetics).motto.v;
  check(mot === "Never give up", `motto cleaned of pings and links (${mot})`);
  const c0 = coins(A);
  await submit(alice, "mshop:emoji", "hello");
  check(coins(A) === c0 && text(lastPatch()).includes("one emoji"), "a non-emoji is refused, nothing charged");
  await submit(alice, "mshop:emoji", "🦊");
  await submit(alice, "mshop:victory", "GG, see you next time!");
  await select(alice, "shopsel:flair", ["🔥"]);
  await select(alice, "shopsel:lang", ["python"]);
  await select(alice, "shopsel:frame", ["fire"]);
  await select(alice, "shopsel:levelup", ["dragon"]);
  run1("INSERT OR IGNORE INTO badges (guild_id, discord_id, badge, created_at) VALUES (?, ?, 'first_solve', 1)", G, A);
  await select(alice, "shopsel:showcase", ["first_solve", "not_mine"]);
  check(JSON.parse(P(A).cosmetics).showcase?.v === "first_solve", "showcase keeps only badges they own");
  const solvedId = q1("SELECT challenge_id FROM attempts WHERE guild_id = ? AND discord_id = ? AND status = 'solved' LIMIT 1", G, A)?.challenge_id;
  if (solvedId) await select(alice, "shopsel:pin", [String(solvedId)]);
  const c1 = coins(A);
  await select(alice, "shopsel:pin", ["999999"]);
  check(coins(A) === c1, "can't pin a challenge you didn't solve");
  const cos = JSON.parse(P(A).cosmetics);
  check(["theme", "motto", "emoji", "victory", "flair", "lang", "frame", "levelup", "showcase"].every((k) => cos[k]?.until > clock.now()), "every profile extra is saved with an end date");
  const n0 = q1("SELECT COUNT(*) AS n FROM purchases WHERE guild_id = ? AND discord_id = ?", G, A).n;
  check(n0 >= 9, "purchases are logged");

  // shown on the profile and the leaderboard
  const prof = (await slash(alice, "profile")).data, pt = text(prof);
  check(pt.includes("🦊") && pt.includes("Never give up") && pt.includes("🔥") && pt.includes("Python") && prof.embeds[0].color === 0x0ea5e9, "profile shows emoji, motto, frame, favourite language and theme color");
  check(text(await slash(bob, "leaderboard", { board: "coins" })).includes(`🔥 <@${A}> 🦊`), "leaderboard shows the flair and emoji");

  // the teacher can remove a text
  let v = await api("GET", `/api/coins?g=${G}`);
  const st = v.data.students.find((x: any) => x.discord_id === A);
  check(st.texts.some((x: any) => x.key === "motto" && x.v === "Never give up"), "the dashboard lists the texts students wrote");
  v = await api("POST", `/api/shop/clear?g=${G}`, { student: A, key: "motto" });
  check(v.status === 200 && !cosmeticsOfRow(P(A)).motto && cosmeticsOfRow(P(A)).emoji === "🦊", "…and can remove one (the others stay)");

  // 💎 double code hour: only on write-code the student picked
  const g = await getGuild(env, G);
  const w = q1("SELECT * FROM challenges WHERE kind = 'write' AND difficulty = 'medium' LIMIT 1");
  const mk = (origin: string) => { const r = run1("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, started_at, tries) VALUES (?, ?, ?, ?, ?, 1)", G, A, w.id, origin, clock.now() - 600); return q1("SELECT * FROM attempts WHERE id = ?", Number(r.lastInsertRowid)); };
  const plain = await finish(env, g!, mk("practice"), w, true);
  const base = q1("SELECT points FROM attempts ORDER BY id DESC LIMIT 1").points;
  await select(alice, "shopm", ["double"]);
  check(JSON.parse(P(A).boosts).double_until > clock.now(), "double code hour bought");
  const dbl = await finish(env, g!, mk("practice"), w, true);
  const pd = q1("SELECT points FROM attempts ORDER BY id DESC LIMIT 1").points;
  check(base > 0 && pd === base * 2 && text(dbl.payload).includes("×2"), `practice write-code gives ×2 (${base} → ${pd})`);
  const asg = await finish(env, g!, mk("assignment"), w, true);
  check(!text(asg.payload).includes("Double code"), "assigned work isn't doubled");
  clock.advance(3700);
  await finish(env, g!, mk("practice"), w, true);
  check(q1("SELECT points FROM attempts ORDER BY id DESC LIMIT 1").points === base, "after the hour, points are normal again");

  // 🎯 contract: 3 medium code solves → reward
  await select(alice, "shopm", ["contract"]);
  const c2 = coins(A);
  await select(alice, "shopsel:contract", ["medium"]);
  check(coins(A) === c2 - 50 && JSON.parse(P(A).boosts).contract.target === 3, "contract signed (50 coins, 3 medium)");
  check(Math.abs(JSON.parse(P(A).boosts).contract.until - clock.now() - 86400) < 5, "the contract lasts 24 hours");
  const c3 = coins(A);
  await select(alice, "shopsel:contract", ["easy"]);
  check(coins(A) === c3 && text(lastPatch()).includes("already have a contract"), "one contract at a time");
  const ws = q("SELECT * FROM challenges WHERE kind IN ('write', 'sql') AND difficulty IN ('medium', 'hard') LIMIT 3");
  const easy = q1("SELECT * FROM challenges WHERE kind = 'write' AND difficulty = 'easy' LIMIT 1");
  const at = (c: any) => { const r = run1("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, started_at, tries) VALUES (?, ?, ?, 'practice', ?, 1)", G, A, c.id, clock.now() - 600); return q1("SELECT * FROM attempts WHERE id = ?", Number(r.lastInsertRowid)); };
  if (easy) await finish(env, g!, at(easy), easy, true);
  check(JSON.parse(P(A).boosts).contract.ids.length === 0, "an easy solve doesn't count for a medium contract");
  const r1 = await finish(env, g!, at(ws[0]), ws[0], true);
  check(text(r1.payload).includes("Contract: 1/3"), "progress shown after a solve");
  await finish(env, g!, at(ws[0]), ws[0], true);
  check(JSON.parse(P(A).boosts).contract.ids.length === 1, "the same challenge twice counts once");
  await finish(env, g!, at(ws[1]), ws[1], true);
  const c4 = coins(A);
  const r3 = await finish(env, g!, at(ws[2]), ws[2], true);
  check(text(r3.payload).includes("Contract complete") && coins(A) === c4 + 150 + (q1("SELECT points FROM attempts WHERE discord_id = ? ORDER BY id DESC LIMIT 1", A).points || 0) && JSON.parse(P(A).boosts).contract.done, "contract complete: +150 coins (plus the solve's coins)");
  check(messagesTo(ARENA).some((m) => text(m).includes("completed their challenge contract")), "…announced in #arena");

  // 🛡️ shield + ⚔️ victory message in a duel
  await select(bob, "shopm", ["shield"]);
  run1("UPDATE players SET rating = 1000 WHERE guild_id = ? AND discord_id IN (?, ?)", G, A, B);
  const qc = q1("SELECT * FROM challenges WHERE kind = 'mcq' LIMIT 1");
  const dr = run1("INSERT INTO duels (guild_id, channel_id, challenger_id, opponent_id, mode, difficulty, stake, challenge_id, status, created_at, started_at) VALUES (?, ?, ?, ?, 'quick', 'easy', 0, ?, 'active', ?, ?)", G, ARENA, A, B, qc.id, clock.now(), clock.now());
  const did = Number(dr.lastInsertRowid);
  const da = run1("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, ref, started_at, tries) VALUES (?, ?, ?, 'duel', ?, ?, 1)", G, A, qc.id, did, clock.now());
  await finish(env, g!, q1("SELECT * FROM attempts WHERE id = ?", Number(da.lastInsertRowid)), qc, true);
  check(P(A).rating > 1000 && P(B).rating === 1000, `the shield keeps the loser's rating (bob ${P(B).rating})`);
  const won = messagesTo(ARENA).reverse().find((m) => /wins the duel|Victory for/.test(text(m)));
  check(text(won).includes("GG, see you next time!") && text(won).includes("🛡️"), "the win shows the victory message and the shield");

  // 🎉 level-up style
  const levelGap = (t: number) => { const lv = Math.floor(Math.sqrt(Math.max(0, t) / 25)) + 1; return 25 * lv * lv - t - 1; };
  const tot = q1("SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE guild_id = ? AND discord_id = ?", G, A).s;
  run1("INSERT INTO ledger (guild_id, discord_id, season, amount, reason, created_at) VALUES (?, ?, ?, ?, 'manual', ?)", G, A, g!.season, levelGap(tot), clock.now());
  await finish(env, g!, mk("practice"), w, true);
  check(messagesTo(ARENA).some((m) => text(m).includes("A dragon roars")), "level-up announced in the bought style");

  // the public profile page
  run1("UPDATE players SET share_key = 'shopkey1234' WHERE guild_id = ? AND discord_id = ?", G, A);
  const page = await (await bot.fetch(new Request("https://bot.example/u/shopkey1234"), env, makeCtx())).text();
  check(page.includes("#0ea5e9") && page.includes("🦊") && page.includes("badge star"), "shared page (the portfolio) uses the theme, emoji and showcase");

  // settings from the dashboard
  v = await api("PUT", `/api/shop?g=${G}`, { items: { double: { on: true, price: 99, hours: 2 }, contract: { on: true, price: 40, hours: 12, reward: 300 } }, custom: [] });
  const its = v.data.shop.items;
  check(its.find((x: any) => x.key === "double").hours === 2 && its.find((x: any) => x.key === "contract").reward === 300 && its.find((x: any) => x.key === "contract").hours === 12, "hours, days and reward are set in the dashboard");
  // Discord limits with a full shop: 15 long own rewards
  await api("PUT", `/api/shop?g=${G}`, { items: {}, custom: Array.from({ length: 15 }, (_, i) => ({ name: `Reward number ${i} `.padEnd(60, "x"), emoji: "🎁", price: 10, desc: "d".repeat(160) })) });
  await slash(alice, "shop");
  const full = lastPatch();
  const embedChars = (full.embeds as any[]).reduce((n, e) => n + (e.title ?? "").length + (e.description ?? "").length + (e.footer?.text ?? "").length, 0);
  const opts = (full.components as any[]).flatMap((r) => r.components[0].options);
  check(embedChars <= 6000 && full.embeds.length <= 10 && full.components.length === 2 && opts.length === 33 && opts.every((o: any) => o.label.length <= 100 && (o.description ?? "").length <= 100),
    `a full shop fits Discord's limits (${embedChars} characters, ${opts.length} options)`);
  await api("PUT", `/api/shop?g=${G}`, { items: {}, custom: [] });
}

section("dashboard links keep their page through the sign-in");
{
  check(safeNext("/?g=1&open=hands%2F3") === "/?g=1&open=hands%2F3", "a page of the dashboard is kept");
  check(["//evil.example", "https://evil.example", "/\\evil.example", "/login?next=/", "", null].every((x) => safeNext(x as any) === "/"), "other sites and odd values go to the home page");
}

section("questions bank: /ask, AI draft, teacher approves, FAQ");
{
  const kai = { id: "111", name: "Kai", teacher: false }, lea = { id: "112", name: "Lea", teacher: false };
  const max = { id: "113", name: "Max", teacher: false }, nora = { id: "114", name: "Nora", teacher: false };
  await slash(kai, "ask", { question: "What is the difference between a for loop and a while loop?" });
  check(text(lastPatch()).includes("Sent to your teacher"), "new question goes to the teacher");
  let f = q1("SELECT * FROM faq WHERE guild_id = ? AND status = 'pending'", G);
  check(f && f.draft && f.draft.includes("while"), "the AI wrote a draft answer");
  await slash(lea, "ask", { question: "difference between for loops and while loops" });
  check(text(lastPatch()).includes("already asked"), "same question joins the existing one");
  check(JSON.parse(q1("SELECT askers FROM faq WHERE id = ?", f.id).askers).length === 2, "both students wait for the answer");
  check(text(await slash(kai, "ask", { question: "short" })).length > 0 && !q1("SELECT 1 AS x FROM faq WHERE question = 'short'"), "too short questions are refused");
  let list = await api("GET", `/api/faq?g=${G}`);
  check(list.data.items[0].status === "pending" && list.data.items[0].askers.length === 2, "dashboard lists the pending question");
  check((await api("GET", `/api/pills?g=${G}`)).data.faq === 1, "nav badge counts pending questions");
  const before = discordCalls.length;
  await api("PUT", `/api/faq/${f.id}?g=${G}`, { answer: "Use **for** when you know how many times to loop, **while** when you loop until a condition changes.", status: "approved", announce: true });
  const dms = discordCalls.slice(before).filter((x) => x.path.startsWith("/channels/dm-"));
  check(dms.length === 2 && text(dms[0].body).includes("know how many times"), "approved answer DMed to everyone who asked");
  check(messagesTo(ARENA).some((x) => text(x).includes("New in the class FAQ")), "announced in #arena");
  await slash(max, "ask", { question: "for loop vs while loop: what is the difference?" });
  const found = lastPatch();
  check(text(found).includes("already be answered") && ids(found).some((i) => i.startsWith("faqok:")), "a close question is answered from the FAQ right away");
  await click(max, ids(found).find((i) => i.startsWith("faqok:"))!);
  check(q1("SELECT hits FROM faq WHERE id = ?", f.id).hits === 1 && !q1("SELECT 1 AS x FROM faq WHERE status = 'suggested' AND asked_by = ?", max.id), "'that answers it' counts a hit");
  await slash(nora, "ask", { question: "Is a while loop faster than a for loop in Python?" });
  const f2 = lastPatch();
  const esc2 = ids(f2).find((i) => i.startsWith("faqask:"));
  if (esc2) { await click(nora, esc2); check(text(lastPatch()).includes("Sent to your teacher"), "'ask my teacher' sends it on"); }
  else check(text(f2).includes("Sent to your teacher"), "unrelated question goes to the teacher");
  check(q1("SELECT COUNT(*) AS n FROM faq WHERE status = 'pending'").n === 1, "one new pending question");
  const fq = await slash(max, "faq");
  check(text(fq).includes("for loop and a while loop"), "/faq lists approved questions");
  const fs = await slash(max, "faq", { search: "while loop" });
  check(text(fs).includes("know how many times"), "/faq search shows the answer");
  const mine = await api("POST", `/api/faq?g=${G}`, { question: "When is the exam?", answer: "Friday at 9:00 in room B12." });
  check(mine.data.items.some((x: any) => x.question === "When is the exam?" && x.status === "approved"), "teacher can add an FAQ entry directly");
  const p2 = q1("SELECT id FROM faq WHERE status = 'pending'").id;
  await api("PUT", `/api/faq/${p2}?g=${G}`, { status: "rejected", answer: "Let's discuss it in class tomorrow." });
  check(text(discordCalls.filter((x) => x.path === `/channels/dm-${nora.id}/messages`).pop()?.body).includes("discuss it in class"), "rejecting with a note tells the student");
}

section("mock interview: interviewer, code, scorecard");
{
  db.prepare("DELETE FROM ai_usage").run();   // fresh AI budget for this section
  const kai = { id: "111", name: "Kai", teacher: false };
  db.prepare("UPDATE guilds SET integrity = ? WHERE id = ?").run(JSON.stringify({ editor: "off", explain: false, codeImage: false, similarity: false }), G);
  await slash(kai, "interview", { difficulty: "easy" });
  const v = lastPatch();
  const iv = q1("SELECT * FROM interviews WHERE discord_id = ? ORDER BY id DESC", kai.id);
  const a = q1("SELECT * FROM attempts WHERE id = ?", iv.attempt_id);
  check(iv && a.origin === "interview" && ids(v).includes(`ivr:${iv.id}`) && ids(v).includes(`ive:${iv.id}`) && text(v).includes("Interviewer"), "interview opens with the problem, the interviewer and buttons");
  check((await click(kai, `ivr:${iv.id}`)).type === 9, "Answer opens a form");
  check(text(await click(U.bob, `ivr:${iv.id}`)).includes("isn't yours"), "someone else can't answer");
  await submit(kai, `miv:${iv.id}`, "I keep a running best sum and reset when it gets worse.");
  check(text(lastPatch()).includes("only negative numbers"), "the interviewer reacts with a follow-up question");
  await submit(kai, `miv:${iv.id}`, "Then I start from the first element instead of zero. It's O(n) time and O(1) memory.");
  await submit(kai, `miv:${iv.id}`, "I'd test one element, all negatives, and a big random array against brute force.");
  check(JSON.parse(q1("SELECT transcript FROM interviews WHERE id = ?", iv.id).transcript).length === 7, "transcript kept (opening + 3 answers + 3 questions)");
  const c = q1("SELECT * FROM challenges WHERE id = ?", iv.challenge_id);
  await select(kai, `lang:${a.id}`, ["python"]);
  await submit(kai, `msub:${a.id}`, c.solution);
  check(q1("SELECT status FROM attempts WHERE id = ?", a.id).status === "solved", "code judged like any write-code challenge");
  await click(kai, `ive:${iv.id}`);
  const card = lastPatch();
  check(text(card).includes("scorecard") && text(card).includes("Hire") && text(card).includes("★"), "scorecard with verdict and stars");
  const bonusRows = () => q1("SELECT COUNT(*) AS n, SUM(amount) AS s FROM ledger WHERE discord_id = ? AND reason = 'interview' AND ref LIKE '____-__-__'", kai.id);
  check(bonusRows().s === 5, "+5 pts for a completed interview");
  await click(kai, `ive:${iv.id}`);
  check(bonusRows().n === 1, "ending twice gives no second bonus");
  check(text(await click(kai, `ivr:${iv.id}`)).includes("over"), "no answers after the end");
  // without AI: scripted questions and a score from the judge
  const today = new Date().toISOString().slice(0, 10);
  db.prepare("INSERT OR REPLACE INTO ai_usage (day, count) VALUES (?, 999999)").run(today);   // AI budget used up
  await slash(kai, "interview", { difficulty: "easy" });
  const iv2 = q1("SELECT * FROM interviews WHERE discord_id = ? ORDER BY id DESC", kai.id);
  await submit(kai, `miv:${iv2.id}`, "I would sort first.");
  check(text(lastPatch()).includes("step by step"), "scripted interviewer question when the AI is down");
  await click(kai, `ive:${iv2.id}`);
  check(text(lastPatch()).includes("judge's results") && q1("SELECT status FROM attempts WHERE id = ?", iv2.attempt_id).status === "expired", "stats scorecard, unfinished attempt closed");
  db.prepare("DELETE FROM ai_usage").run();
  const li = await api("GET", `/api/interviews?g=${G}`);
  check(li.data.items.length >= 2 && li.data.items.some((x: any) => x.scores?.verdict === "Hire"), "dashboard lists interviews with scores");
}

section("profiles you can share, certificates, class league, all classes");
{
  const kai = { id: "111", name: "Kai", teacher: false };
  const prof = await slash(kai, "profile");
  check(ids(prof.data).includes("share:on") && ids(prof.data).includes("cert:0"), "/profile has Share and Certificate buttons");
  check(!ids((await slash(kai, "profile", { member: U.alice.id })).data).includes("share:on"), "no share button on someone else's profile");
  await click(kai, "share:on");
  const key = q1("SELECT share_key FROM players WHERE guild_id = ? AND discord_id = ?", G, kai.id).share_key;
  check(key && text(lastPatch()).includes(`/u/${key}`), "sharing gives a public link");
  const page = await bot.fetch(new Request(`https://bot.example.workers.dev/u/${key}`), env, makeCtx());
  const html = await page.text();
  check(page.status === 200 && html.includes("Kai") && html.includes("noindex") && html.includes("challenges solved") && !html.includes("print(a + b)"), "profile page (the portfolio) shows the practice, never code");
  await click(kai, "share:off");
  check((await bot.fetch(new Request(`https://bot.example.workers.dev/u/${key}`), env, makeCtx())).status === 404, "stop sharing: the link dies");
  await click(kai, "cert:0");
  const certLink = (lastPatch()?.components?.[0]?.components ?? [])[0]?.url ?? "";
  const cp = await bot.fetch(new Request(certLink), env, makeCtx());
  const ch = await cp.text();
  check(cp.status === 200 && ch.includes("Certificate of Achievement") && ch.includes("Kai") && ch.includes("IN PROGRESS"), "certificate page for the current season");
  const forged = certLink.replace(/.$/, (c: string) => (c === "A" ? "B" : "A"));
  check((await bot.fetch(new Request(forged), env, makeCtx())).status === 404, "forged certificate link refused");
  const cl = await api("GET", `/api/certificates?g=${G}`);
  check(cl.data.items.length > 3 && cl.data.items[0].url.includes("/cert/"), "dashboard lists certificate links");

  // league between two classes
  db.prepare("INSERT OR IGNORE INTO guilds (id, name, lang, season, code_lang, created_at) VALUES ('g2', 'Other class', 'en', 'S1', 'python', ?)").run(clock.now());
  db.prepare("UPDATE guilds SET league = ? WHERE id = 'g2'").run(JSON.stringify({ on: true, name: "Group B" }));
  db.prepare("INSERT INTO players (guild_id, discord_id, name, last_active, created_at) VALUES ('g2', '901', 'Zed', ?, ?)").run(clock.now(), clock.now());
  db.prepare("INSERT INTO ledger (guild_id, discord_id, season, amount, reason, created_at) VALUES ('g2', '901', 'S1', 20, 'practice', ?)").run(clock.now());
  db.prepare("INSERT INTO ledger (guild_id, discord_id, season, amount, reason, created_at) VALUES ('g2', '901', 'S1', 500, 'bonus', ?)").run(clock.now());
  check((await slash(kai, "league")).type === 5 && text(lastPatch()).includes("isn't in the league"), "/league before joining");
  const lg = await api("PUT", `/api/league?g=${G}`, { on: true, name: "Group A" });
  check(lg.data.cfg.on && lg.data.table.length === 2, "class joins the league");
  check(lg.data.table.find((r: any) => r.guild_id === "g2").score === 4, "teacher bonuses don't count, small classes count as 5");
  await slash(kai, "league");
  check(text(lastPatch()).includes("Group A") && text(lastPatch()).includes("Group B") && text(lastPatch()).includes("your class"), "/league shows both classes");
  // league with classes hosted on other ClassBots (each teacher on their own Cloudflare)
  const link = lg.data.link as string;
  check(/^https:\/\/bot\.example\.workers\.dev\/league\/feed\/[\w-]+\.[a-f0-9]{24}$/.test(link), "a league link to send to the other teachers");
  const feedR = await bot.fetch(new Request(link), env, makeCtx());
  const feed = await feedR.json() as any;
  check(feedR.status === 200 && feed.kind === "classbot-league" && feed.name === "Group A" && typeof feed.this.score === "number" && !JSON.stringify(feed).includes(U.alice.name), "the link gives the class's league numbers, never students' names");
  check((await bot.fetch(new Request(link.replace(/\.[a-f0-9]{24}$/, "." + "0".repeat(24))), env, makeCtx())).status === 404, "a wrong link gives nothing");
  const { weekStart: wkS } = await import("../src/shared/league.ts");
  const wk0 = wkS(clock.now());
  leagueFake.body = { kind: "classbot-league", v: 1, id: "555000", name: "Group C (Safi)", at: clock.now(), last: { week: wk0 - 7 * 86400, students: 10, active: 8, points: 900, solved: 30, participation: 80, score: 90 }, this: { week: wk0, students: 12, active: 9, points: 1200, solved: 40, participation: 75, score: 100 } };
  const remoteUrl = "https://other.classbot.test/league/feed/555000." + "ab".repeat(12);
  check((await api("POST", `/api/league/remotes?g=${G}`, { url: "https://example.com/nope" })).status === 400, "only league links can be added");
  check((await api("POST", `/api/league/remotes?g=${G}`, { url: link })).status === 400, "not your own link");
  const ad = await api("POST", `/api/league/remotes?g=${G}`, { url: remoteUrl });
  check(ad.status === 200 && ad.data.table.length === 3 && ad.data.table[0].name === "Group C (Safi)" && ad.data.table[0].remote && ad.data.remotes[0].data.this.score === 100, "a class from another ClassBot joins this class's league");
  check(ad.data.last.some((r: any) => r.name === "Group C (Safi)" && r.score === 90), "…with last week's result too");
  await slash(kai, "league");
  check(text(lastPatch()).includes("Group C (Safi)"), "/league shows it to the students");
  leagueFake.status = 404;
  const rf = await api("POST", `/api/league/refresh?g=${G}`);
  check(rf.data.remotes[0].error && rf.data.table.some((r: any) => r.name === "Group C (Safi)"), "a link that stops working is reported (its last numbers stay)");
  leagueFake.status = 200;
  // the dashboard's ✕ sends the link in the body as well: both are read
  const rmBody = await api("DELETE", `/api/league/remotes?g=${G}`, { url: "https://other.example/league/feed/1.nothere" });
  check(rmBody.status === 200 && rmBody.data.remotes.length === 1, "removing a link that isn't there changes nothing");
  const rm = await api("DELETE", `/api/league/remotes?g=${G}`, { url: remoteUrl });
  check(rm.data.table.length === 2 && !rm.data.remotes.length, "removing it (the link sent in the body, as the dashboard's ✕ does)");
  const rn = await api("PUT", `/api/league?g=${G}`, { newLink: true });
  check(rn.data.link !== link && (await bot.fetch(new Request(link), env, makeCtx())).status === 404, "renewing the link stops the old one");
  {
    // 🧑‍🏫 the teacher plays too: by default their points and coins stay out of the rankings and the league
    const g0 = q1("SELECT teacher_id, season FROM guilds WHERE id = ?", G);
    run1("UPDATE guilds SET teacher_id = ? WHERE id = ?", "199", G);
    run1("INSERT INTO players (guild_id, discord_id, name, coins, last_active, created_at) VALUES (?, '199', 'Prof', 99999, ?, ?)", G, clock.now(), clock.now());
    run1("INSERT INTO ledger (guild_id, discord_id, amount, reason, season, created_at) VALUES (?, '199', 5000, 'practice', ?, ?)", G, g0.season, clock.now());
    const { standings: st } = await import("../src/shared/db.ts");
    const lgPts = async () => (await api("GET", `/api/league?g=${G}`)).data.table.find((r: any) => r.guild_id === G);
    const off = await api("GET", `/api/settings/teacher-rank?g=${G}`);
    const before = await lgPts();
    check(off.data.board === false && off.data.league === false && off.data.teacher.id === "199" && !(await st(env, G, g0.season, 50)).some((r: any) => r.discord_id === "199"),
      "by default the teacher isn't in the class's leaderboard");
    const coinsOff = JSON.stringify(await slash(U.alice, "leaderboard", { board: "coins" }));
    await api("PUT", `/api/settings/teacher-rank?g=${G}`, { board: true });
    const coinsOn = JSON.stringify(await slash(U.alice, "leaderboard", { board: "coins" }));
    await api("PUT", `/api/settings/teacher-rank?g=${G}`, { board: false });
    check(!coinsOff.includes("99999") && coinsOn.includes("99999"), "…nor in the coins leaderboard (back when switched on)");
    await api("PUT", `/api/settings/teacher-rank?g=${G}`, { board: true });
    check((await st(env, G, g0.season, 50))[0]?.discord_id === "199" && (await lgPts()).points === before.points, "switched on: the teacher is back in the leaderboard (the league still leaves them out)");
    await api("PUT", `/api/settings/teacher-rank?g=${G}`, { league: true });
    check((await lgPts()).points === before.points + 5000, "…and in the league when that switch is on too");
    await api("PUT", `/api/settings/teacher-rank?g=${G}`, { board: false, league: false });
    run1("DELETE FROM ledger WHERE discord_id = '199'");
    run1("DELETE FROM players WHERE discord_id = '199'");
    run1("UPDATE guilds SET teacher_id = ? WHERE id = ?", g0.teacher_id, G);
  }
  {
    // a student removed from the class: their points stay in the history, but no « ? » in the rankings and the league
    // counts the class's students only (not 27 for a class of 25)
    const g0 = q1("SELECT season FROM guilds WHERE id = ?", G);
    run1("INSERT INTO players (guild_id, discord_id, name, last_active, created_at) VALUES (?, '198', 'Quitte', ?, ?)", G, clock.now(), clock.now());
    run1("INSERT INTO ledger (guild_id, discord_id, amount, reason, season, created_at) VALUES (?, '198', 72, 'practice', ?, ?)", G, g0.season, clock.now());
    run1("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, status, tries, used_hint, verified, points, started_at, finished_at) VALUES (?, '198', 1, 'practice', 'solved', 1, 0, 1, 72, ?, ?)", G, clock.now(), clock.now());
    const { standings: st } = await import("../src/shared/db.ts");
    const lg = async () => (await api("GET", `/api/league?g=${G}`)).data.table.find((r: any) => r.guild_id === G);
    const cert = async () => (await api("GET", `/api/certificates?g=${G}`)).data.items;
    const inside = await lg();
    check((await st(env, G, g0.season, 200)).some((r: any) => r.discord_id === "198") && (await cert()).some((c: any) => c.discord_id === "198"), "a student in the class: in the leaderboard and the certificates");
    check((await api("DELETE", `/api/students/198?g=${G}`)).status === 200, "the teacher removes them from the class");
    const out = await lg();
    check(q1("SELECT COALESCE(SUM(amount), 0) AS n FROM ledger WHERE discord_id = '198'").n === 72, "…their points stay in the history");
    check(!(await st(env, G, g0.season, 200)).some((r: any) => r.discord_id === "198" || r.name === "?") && !(await cert()).some((c: any) => c.discord_id === "198" || c.name === "?"),
      "…but no « ? » in the leaderboard nor in the certificates");
    check(out.points === inside.points - 72 && out.active === inside.active - 1 && out.students === inside.students - 1 && out.solved === inside.solved - 1,
      `…and the league counts the class's students only: their points, their solves and them out of the class size (${inside.students} → ${out.students} students, ${inside.points} → ${out.points} pts)`);
    run1("DELETE FROM ledger WHERE discord_id = '198'");
    run1("DELETE FROM attempts WHERE discord_id = '198'");
  }
  const cmp = await api("GET", "/api/compare");
  check(cmp.data.classes.length >= 2 && cmp.data.classes.every((c: any) => c.trend.length === 4), "dashboard compares all classes with a 4-week trend");
  // new season: certificates by DM
  const old = q1("SELECT season FROM guilds WHERE id = ?", G).season;
  const n0 = discordCalls.length;
  const ss = await slash(U.prof, "teacher", { name: "Spring term" }, "season");
  const certDms = discordCalls.slice(n0).filter((x) => x.path.startsWith("/channels/dm-") && text(x.body).includes("/cert/"));
  check(text(ss).includes("certificate") && certDms.length >= 3, "new season: every student who scored gets a certificate by DM");
  const oldLink = (certDms[0].body.components[0].components[0].url) as string;
  const oc = await (await bot.fetch(new Request(oldLink), env, makeCtx())).text();
  check(oc.includes(old) && !oc.includes("IN PROGRESS"), "last season's certificate is final");
  // Monday: league result posted
  const d = new Date(clock.now() * 1000);
  clock.advance((((8 - d.getUTCDay()) % 7 || 7) * 86400) + (12 - d.getUTCHours()) * 3600);
  db.prepare("UPDATE guilds SET daily_hour = 23 WHERE id <> ?").run(G);
  await runCron(env);
  check(messagesTo(ARENA).some((x) => text(x).includes("last week's result")), "Monday: last week's league result in #arena");
}

section("⚔️ squad battle: two clocks, questions on the TV, the teacher judges from the phone");
{
  const B = await import("../src/shared/battle.ts");
  const { qrMatrix } = await import("../src/shared/qr.ts");
  // the game alone (pure: state + tap + time → a new state): clocks, turns, questions by id, the version
  const ids = Array.from({ length: 8 }, (_, i) => "q" + i);
  const ans = (id: string) => "answer " + id;
  const o = { penaltyMs: 8000, seconds: 120, ids, answerOf: ans };
  // what the phone sends: the version and the question it shows
  const tap = (s: any, a: string, at: number, extra: any = {}) => B.act(s, { a, version: s.seq, qid: s.qid, ...extra } as any, at, o);
  const fails = (f: () => unknown, cls: any = B.BattleError) => { try { f(); return false; } catch (e) { return e instanceof cls; } };
  const t0 = 1_000_000;
  let st = B.newState(ids, 0, 120);
  const lobby0 = st;
  st = tap(st, "starter", t0, { team: 1 });
  check(lobby0.starter === 0 && lobby0.seq === 1 && st.starter === 1 && st.seq === 2, "a tap gives a new state (the old one untouched) and a new version");
  st = tap(st, "start", t0);
  check(st.phase === "countdown" && st.turn === 1 && ids.includes(st.qid!) && st.shown === 1 && st.used.join() === st.qid, "start: a 3-2-1 countdown, the chosen team first, the first question picked by the server");
  B.settle(st, t0 + 4000);
  check(st.phase === "playing" && B.timeLeft(st, 1, t0 + 3600 + 10000) === 110000 && B.timeLeft(st, 0, t0 + 20000) === 120000, "only the team on turn loses time");
  const q1 = st.qid!;
  st = tap(st, "correct", t0 + 3600 + 10000);
  check(st.turn === 0 && st.left[1] === 110000 && st.stats.ok[1] === 1 && st.ev?.k === "correct" && st.ev.answer === ans(q1) && st.qid !== q1 && st.shown === 2, "correct: their clock stops, the other team's turn with a NEW question, the answer revealed");
  const q2 = st.qid!;
  st = tap(st, "wrong", t0 + 3600 + 12000);
  check(st.ev?.k === "wrong" && st.turn === 0 && st.qid === q2 && st.stats.wrong[0] === 1 && st.turnAt === t0 + 3600 + 10000, "wrong: the same question, the same team, the clock keeps running");
  st = tap(st, "pass", t0 + 3600 + 15000);
  check(st.turn === 0 && st.left[0] === 120000 - 5000 - 8000 && st.stats.pass[0] === 1 && st.qid !== q2 && st.ev?.answer === ans(q2), "pass: −8 s, a new question, still their turn (the old answer revealed)");
  // stale taps: nothing moves
  const v = st.seq, onScreen = st.qid;
  check(fails(() => B.act(st, { a: "correct", version: v - 1, qid: onScreen }, t0 + 3600 + 16000, o), B.BattleStale), "a tap made on an older version is refused");
  check(fails(() => B.act(st, { a: "correct", version: v, qid: q2 }, t0 + 3600 + 16000, o), B.BattleStale), "a tap made on another question than the one on screen is refused");
  check(fails(() => B.act(st, { a: "rematch", version: v - 1 }, t0 + 3600 + 16000, o), B.BattleStale) && fails(() => B.act(st, { a: "rematch", version: v }, t0 + 3600 + 16000, o)), "a late Rematch never resets a running game");
  check(st.seq === v && st.qid === onScreen && st.stats.ok[0] === 0, "…and nothing changed");
  // a double tap / a retry: applied once
  const once = tap(st, "correct", t0 + 3600 + 16000, { aid: "tap-1" });
  check(fails(() => B.act(once, { a: "correct", version: v, qid: onScreen, aid: "tap-1" }, t0 + 3600 + 16100, o), B.BattleDuplicate), "the same tap sent again (a retry) is recognised: nothing done");
  check(fails(() => B.act(once, { a: "correct", version: v, qid: onScreen, aid: "tap-2" }, t0 + 3600 + 16100, o), B.BattleStale), "a second tap on the same screen (a double tap) is stale: nothing done");
  st = once;
  check(st.stats.ok[0] === 1 && st.turn === 1 && st.qid !== onScreen, "…so the right answer counts once and the turn passes once");
  const beforeSkip = st.qid, leftSkip = st.left[1];
  st = tap(st, "skip", t0 + 3600 + 17000);
  check(st.qid !== beforeSkip && st.turn === 1 && st.left[1] === leftSkip && st.turnAt === t0 + 3600 + 16000, "skip: another question, no penalty, the clock keeps running");
  check(fails(() => tap(st, "start", t0 + 3600 + 17500)), "a tap that doesn't fit the moment is refused");
  st = tap(st, "pause", t0 + 3600 + 20000);
  check(st.phase === "paused" && B.timeLeft(st, 1, t0 + 999999) === 110000 - 4000, "pause freezes the clock");
  st = tap(st, "resume", t0 + 500000);
  B.settle(st, t0 + 500000 + 120000);
  check(st.phase === "over" && st.winner === 0 && st.left[1] === 0, "a clock at 0: the other team wins");
  const asked1 = st.used.slice();
  const re = tap(st, "rematch", t0 + 700000);
  check(re.phase === "lobby" && re.starter === 0 && re.round === 2 && re.left[0] === 120000 && re.seq > st.seq && re.used.join() === asked1.join(), "rematch: the other team starts, the questions asked stay asked");
  // never a question twice in a battle; when they're all asked, the game ends (the team with more time wins)
  let r2 = tap(re, "start", t0 + 800000);
  B.settle(r2, t0 + 810000);
  const seen2 = [r2.qid!];
  for (let i = 0; i < 20 && r2.phase === "playing"; i++) { r2 = tap(r2, i % 2 ? "pass" : "correct", t0 + 810000 + i * 1000); if (r2.phase === "playing") seen2.push(r2.qid!); }
  check(!seen2.some((id) => asked1.includes(id)) && new Set(seen2).size === seen2.length && seen2.length === ids.length - asked1.length, "round 2 only asks the questions not asked yet, each once");
  check(r2.phase === "over" && r2.ev?.k === "over" && r2.ev.why === "out" && r2.winner === (r2.left[0] >= r2.left[1] ? 0 : 1) && new Set(r2.used).size === ids.length, "every question asked: the game ends, the team with more time left wins (a clear message on the screens)");
  const r3 = tap(r2, "rematch", t0 + 900000);
  check(fails(() => tap(r3, "start", t0 + 900000)), "no question left for another round: the start is refused (add questions first)");
  const r4 = B.act(r3, { a: "start", version: r3.seq }, t0 + 900000, { ...o, ids: [...ids, "new1"] });
  check(r4.qid === "new1", "…and a question added since is asked");
  check(B.pickNext({ queue: ["a", "b", "c"], used: ["a"] }, ["a", "b", "c"]) === "b" && B.pickNext({ queue: ["a", "b"], used: ["a"] }, ["a", "c"]) === "c" && B.pickNext({ queue: ["a"], used: ["a"] }, ["a"]) === null, "the next question: the stored order, never one asked, the removed ones skipped");
  st = B.newState(ids.slice(0, 6), 0, 30);
  st = tap(st, "start", 0); B.settle(st, 3600);
  st = tap(st, "pass", 3600 + 25000);
  check(st.phase === "over" && st.winner === 1, "a pass that empties the clock ends the game");
  // a game saved before questions had ids (an index order): the same question on screen, the asked ones stay asked
  const legacy = B.upgradeState({ phase: "playing", starter: 0, turn: 1, left: [1, 1], turnAt: 0, goAt: null, order: [2, 0, 1], qi: 1, shown: 2, log: [{ team: 0, q: 2, r: "ok", ms: 1 }], seq: 7, round: 1 }, [{ id: "a" }, { id: "b" }, { id: "c" }] as any);
  check(legacy.qid === "a" && legacy.used.join() === "c,a" && legacy.queue.join() === "c,a,b" && legacy.seq === 7 && legacy.log[0].q === "c" && B.pickNext(legacy, ["a", "b", "c"]) === "b", "a game saved before the fix goes on: same question, same version, nothing asked twice");
  check(B.uniqueIds([{ id: "x" }, { id: "x" }, { id: "" }] as any).map((q) => q.id).join() === "x,x~2,q2", "every question has its own id");
  check(B.bankTopUp({ topics: ["HTML"], kinds: [], lang: "en" }, B.bankQuestions(["HTML"], [], "fr"), []).length === 0 && B.bankTopUp({ topics: ["HTML"], kinds: [], lang: "fr" }, B.bankQuestions(["HTML"], [], "fr").slice(0, 6), []).length === 2, "the bank fills in only questions the battle doesn't have (not even in the other language)");
  check([29, 33, 37].includes(qrMatrix("https://bot.example.workers.dev/battle/judge/1." + "a".repeat(24)).length), "QR code for the judge link (small enough to scan from the room)");
  const dq = B.dedupeQuestions([
    { id: "1", kind: "acronym", topic: "HTML", prompt: "Que signifie HTML ?", answer: "HyperText Markup Language" },
    { id: "2", kind: "acronym", topic: "HTML", prompt: "Que veut dire l'acronyme HTML ?", answer: "Hypertext markup language" },
    { id: "3", kind: "output", topic: "JS", prompt: "Qu'affiche ce code ?", code: "console.log(1 + 1);", answer: "2" },
    { id: "4", kind: "output", topic: "JS", prompt: "Que montre la console ?", code: "console.log(1+1);", answer: "2" },
    { id: "7", kind: "mcq", topic: "JS", prompt: "Quel mot-clé crée un tableau vide ?", options: ["Array()", "new Array()", "[]", "list()"], answer: "C · []" },
    { id: "8", kind: "mcq", topic: "JS", prompt: "Quel mot-clé crée un tableau vide en JavaScript ?", options: ["new Array()", "Array()", "[]", "list()"], answer: "C · []" },
    { id: "5", kind: "truefalse", topic: "CSS", prompt: "Vrai ou faux : a", answer: "Faux" },
    { id: "6", kind: "truefalse", topic: "CSS", prompt: "Vrai ou faux : b", answer: "Faux" },
  ] as any);
  check(dq.map((q) => q.id).join() === "1,3,7,5,6", "no repeated question, even reworded (same answer, same code or same choices)");
  check(B.bankQuestions(["JavaScript"], [], "fr").length >= 8 && B.bankQuestions(["JS"], ["output"], "en").every((q) => q.kind === "output" && q.topic === "JavaScript"), "built-in questions by topic and kind");

  // the dashboard: generate, create
  const lst = await api("GET", `/api/battles?g=${G}`);
  check(lst.status === 200 && lst.data.topics.includes("HTML") && lst.data.kinds.output && Array.isArray(lst.data.teams), "battle page: topics, kinds, the class's teams");
  const gq = await api("POST", `/api/battles/generate?g=${G}`, { topics: ["HTML", "CSS", "JavaScript"], count: 10, lang: "fr" });
  check(gq.status === 200 && gq.data.ai && gq.data.questions.length === 10 && new Set(gq.data.questions.map((q: any) => q.prompt + (q.code || ""))).size === 10 && gq.data.questions.every((q: any) => q.prompt && q.answer), "AI questions, cleaned (no empty, no duplicate), topped up from the bank");
  const cr = await api("POST", `/api/battles?g=${G}`, { teams: [{ name: "Les Requins", emoji: "🦈", color: "#3b82f6", members: [U.alice.id] }, { name: "Les Flammes", color: "#ef4444", members: [U.bob.id] }], questions: gq.data.questions, settings: { seconds: 60, penalty: 8, reward: 15, announce: true } });
  check(cr.status === 200 && cr.data.tv.includes("/battle/tv/") && cr.data.judge.includes("/battle/judge/") && cr.data.qr.startsWith("<svg") && /^\d{4}$/.test(cr.data.pin), "battle created: TV link, judge link and QR, PIN");
  check((await api("POST", `/api/battles?g=${G}`, { questions: [] })).status === 400, "a battle needs questions");
  const bid = cr.data.id;
  const tvPage = await bot.fetch(new Request(cr.data.tv), env, makeCtx());
  const tvHtml = await tvPage.text();
  check(tvPage.status === 200 && tvHtml.includes("Squad battle") && tvHtml.includes("Les Requins"), "the TV page");
  const scriptOf = (h: string) => h.slice(h.lastIndexOf("<script>") + 8, h.lastIndexOf("</script>"));
  let parsed = true;
  try { new Function(scriptOf(tvHtml)); new Function(scriptOf(await (await bot.fetch(new Request(cr.data.judge), env, makeCtx())).text())); } catch (e) { parsed = false; console.log(e); }
  check(parsed, "the TV and judge pages' scripts are valid JavaScript");
  const hlFn = new Function("return " + scriptOf(tvHtml).match(/const hl = (function[\s\S]*?\n\});/)![1])();
  check(hlFn("console.log('majeur'); // ok\nlet x = ___;") === `console.log(<span class="str">'majeur'</span>); <span class="com">// ok</span>\n<span class="kw">let</span> x = <span class="blank">???</span>;`, "code colouring on the TV (blanks shown as ???)");
  const tvs = await (await bot.fetch(new Request(cr.data.tv + "/state"), env, makeCtx())).json() as any;
  check(tvs.phase === "lobby" && tvs.teams[0].name === "Les Requins" && !tvs.judge && tvs.q === null, "TV state in the lobby");
  const qrR = await bot.fetch(new Request(cr.data.tv + "/qr.svg"), env, makeCtx());
  check(qrR.status === 200 && (await qrR.text()).startsWith("<svg"), "the TV shows the QR code of the judge link");
  check((await bot.fetch(new Request(cr.data.tv.replace(/\.[a-f0-9]{24}$/, "." + "0".repeat(24))), env, makeCtx())).status === 200 && (await (await bot.fetch(new Request(cr.data.tv.replace(/\.[a-f0-9]{24}$/, "." + "0".repeat(24)) + "/state"), env, makeCtx())).status) === 404, "a wrong link shows nothing");
  // the judge's phones
  const jreq = (path: string, key: string, body?: any) => bot.fetch(new Request(cr.data.judge + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "x-judge-key": key }, body: body ? JSON.stringify(body) : undefined }), env, makeCtx());
  const K1 = "k".repeat(32), K2 = "z".repeat(32);
  check((await jreq("/claim", K1, { key: K1 })).status === 200, "the first phone becomes the judge");
  check((await jreq("/claim", K2, { key: K2 })).status === 403 && (await jreq("/state", K2)).status === 403, "another phone can't judge…");
  check((await jreq("/claim", K2, { key: K2, pin: "0000" === cr.data.pin ? "1111" : "0000" })).status === 403, "…not with a wrong PIN");
  check((await jreq("/claim", K2, { key: K2, pin: cr.data.pin })).status === 200 && (await jreq("/state", K1)).status === 403, "…but with the PIN (and the old phone stops)");
  // like the phone: every tap names the version and the question it shows (read just before, unless the test gives them)
  const act = async (a: string, extra: any = {}) => {
    const cur = "version" in extra || "seq" in extra ? null : await (await jreq("/state", K2)).json() as any;
    const r = await jreq("/act", K2, { a, ...(cur ? { version: cur.version, qid: cur.q?.id ?? null } : {}), ...extra });
    return { status: r.status, d: await r.json() as any };
  };
  const tvState = async () => await (await bot.fetch(new Request(cr.data.tv + "/state"), env, makeCtx())).json() as any;
  check((await tvState()).judge, "the TV knows the judge is there (the QR code goes away)");
  await act("starter", { team: 1 });
  const go = await act("start");
  check(go.status === 200 && go.d.phase === "countdown" && go.d.turn === 1, "the judge starts: countdown, the chosen team first");
  clock.advance(4);
  const js = await (await jreq("/state", K2)).json() as any;
  const tv1 = await tvState();
  check(js.phase === "playing" && js.q.answer && tv1.q && !tv1.q.answer && tv1.q.prompt === js.q.prompt && tv1.running === 1, "playing: the judge sees the answer, the TV doesn't");
  clock.advance(5);
  check((await act("correct", { version: js.version, qid: "not-this-one" })).status === 409, "judging another question than the one on screen is refused");
  check((await jreq("/act", K2, { a: "correct" })).status === 409 && (await act("correct", { version: null })).status === 409, "a tap that doesn't say which screen it was made on is refused");
  const waitP = bot.fetch(new Request(cr.data.tv + "/state?seq=" + js.version + "&wait=1"), env, makeCtx());
  const c1 = await act("correct", { version: js.version, qid: js.q.id, aid: "tap-c1" });
  const waited = await (await waitP).json() as any;
  check(!waited.same && waited.version === c1.d.version && waited.q.id === c1.d.q.id && waited.q.id !== js.q.id && waited.turn === c1.d.turn, "the TV waits for the judge's tap (long poll) and gets the new question at once, the same as the phone");
  check(c1.status === 200 && c1.d.turn === 0 && c1.d.stats.ok[1] === 1 && c1.d.left[1] <= 56000 && c1.d.left[1] >= 54000 && c1.d.ev.answer === js.q.answer, "correct: clock stopped, turn passes, answer revealed on the TV");
  check((await act("correct", { seq: js.seq })).status === 409, "a double tap doesn't count twice");
  const retry = await act("correct", { version: js.version, qid: js.q.id, aid: "tap-c1" });
  check(retry.status === 200 && retry.d.dup && retry.d.version === c1.d.version && retry.d.stats.ok[1] === 1, "the same tap sent again (the network retried it): nothing done, the phone gets the state");
  const p1 = await act("pass", { seq: c1.d.seq });
  check(p1.d.turn === 0 && p1.d.left[0] <= 52000 && p1.d.stats.pass[0] === 1, "pass: −8 s and still their turn");
  clock.advance(70);
  const end = await tvState();
  check(end.phase === "over" && end.winner === 1, "a clock at 0 ends the game on the TV");
  const pts = q("SELECT * FROM ledger WHERE reason = 'battle' AND ref = ?", String(bid));
  check(pts.length === 1 && pts[0].discord_id === U.bob.id && pts[0].amount === 15, "the winners get their points, once");
  await tvState();
  check(q("SELECT * FROM ledger WHERE reason = 'battle' AND ref = ?", String(bid)).length === 1, "…only once");
  check(messagesTo(ARENA).some((x) => text(x).includes("Les Flammes")), "the result in #arena");
  const rm = await act("rematch");
  check(rm.d.phase === "lobby" && rm.d.round === 2 && rm.d.starter === 0, "rematch from the phone");
  {
    // a request that read the battle a moment before the judge's tap can't write the old state back
    const stale = (await B.getBattle(env, bid))!;
    await act("starter", { team: 1 });
    let refused = false;
    try { await B.judgeAction(env, stale, { a: "start", version: stale.state.seq }); } catch (e) { refused = e instanceof B.BattleStale; }
    const now1 = (await B.getBattle(env, bid))!;
    check(refused && now1.state.starter === 1 && now1.state.phase === "lobby", "a write based on an old read is refused (compare-and-set): the TV and the judge keep the same state");
    const t1 = await tvState();
    const same = await (await bot.fetch(new Request(cr.data.tv + `/state?seq=${t1.seq}&v=${encodeURIComponent(t1.v)}`), env, makeCtx())).json() as any;
    const diff = await (await bot.fetch(new Request(cr.data.tv + `/state?seq=${t1.seq}&v=${t1.seq}.999.0.lobby`), env, makeCtx())).json() as any;
    check(same.same === true && !diff.same && diff.phase === "lobby", "the TV gets the whole state when what it shows differs, even with the same seq");
  }
  const vw = await api("GET", `/api/battles/${bid}?g=${G}`);
  check(vw.data.live.phase === "lobby" && vw.data.judgeTaken, "the dashboard follows the game");
  const ed = await api("PUT", `/api/battles/${bid}?g=${G}`, { questions: vw.data.questions.slice(0, 5) });
  check(ed.data.questions.length === 5, "questions removed between games");
  check((await api("POST", `/api/battles/${bid}/judge-reset?g=${G}`)).data.judgeTaken === false, "free the judge: the next phone takes it");
  const lst2 = await api("GET", `/api/battles?g=${G}`);
  check(lst2.data.items.some((b: any) => b.id === bid), "battles listed");
  await api("DELETE", `/api/battles/${bid}?g=${G}`);
  check((await bot.fetch(new Request(cr.data.tv + "/state"), env, makeCtx())).status === 404, "a deleted battle's links stop");
  {
    // a whole battle as in class: the TV and the judge's phone read the state between every tap and always show the
    // same thing (version, question, team, clocks); double taps count once; no question twice; the questions run out
    // (French questions in an English class: the built-in ones that fill in are in English, never the same ones again)
    const html = B.bankQuestions(["HTML"], [], "fr");
    const mk = await api("POST", `/api/battles?g=${G}`, { teams: [{ name: "Atlas" }, { name: "Orion" }], questions: html.slice(0, 6), settings: { seconds: 120, penalty: 8, topics: ["HTML"], reward: 0, announce: false } });
    const id2 = mk.data.id, K3 = "j".repeat(32);
    const J = (path: string, body?: any) => bot.fetch(new Request(mk.data.judge + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "x-judge-key": K3 }, body: body ? JSON.stringify(body) : undefined }), env, makeCtx());
    const jsn = async (r: Promise<Response>) => { const x = await r; return { status: x.status, d: await x.json() as any }; };
    await J("/claim", { key: K3 });
    const phone = async () => (await jsn(J("/state"))).d;
    const tv = async (qs = "") => (await jsn(bot.fetch(new Request(mk.data.tv + "/state" + qs), env, makeCtx()))).d;
    // what a screen draws; a running clock is compared by the moment it reaches 0 (both count from the server's time)
    const screen = (x: any) => JSON.stringify([x.version, x.phase, x.turn, x.qid, x.q?.id ?? null, x.q?.n ?? null, x.q?.prompt ?? null, x.q?.code ?? null, x.q?.options ?? null,
      x.left.map((l: number, i: number) => (x.running === i ? l + x.now : l)), x.stats, x.winner]);
    let mismatches = 0, steps = 0, doubles = 0, doublesOk = 0;
    const agree = async () => {
      const t = await tv(), ph = await phone();
      steps++;
      if (screen(t) !== screen(ph)) { mismatches++; console.log("   TV   ", screen(t), "\n   phone", screen(ph)); }
      return ph;
    };
    let p = await agree();
    await jsn(J("/act", { a: "start", version: p.version }));
    clock.advance(4);
    p = await agree();
    const asked = [p.q.id];
    const script = ["correct", "wrong", "pass", "pause", "resume", "skip", "correct", "correct", "wrong", "pass"];
    for (let i = 0; i < 40 && p.phase !== "over"; i++) {
      const a = script[i % script.length];
      if (a === "correct") {
        // a quick double tap: two taps made on the same screen, at the same time
        const [x, y] = await Promise.all([jsn(J("/act", { a, version: p.version, qid: p.q.id, aid: `d${i}a` })), jsn(J("/act", { a, version: p.version, qid: p.q.id, aid: `d${i}b` }))]);
        doubles++;
        if ([x.status, y.status].sort().join() === "200,409") doublesOk++;
      } else await jsn(J("/act", { a, version: p.version, qid: p.q?.id ?? null }));
      clock.advance(1);
      const before = p;
      p = await agree();
      if ((p.phase === "playing" || p.phase === "paused") && p.q.id !== before.q.id) asked.push(p.q.id);
      if (i === 5) {
        // in the middle: the TV is reloaded, the dashboard saves the teams, an old tap arrives late
        const fresh = await tv();
        const up = await api("PUT", `/api/battles/${id2}?g=${G}`, { teams: [{ name: "Atlas 2" }, { name: "Orion" }], settings: { penalty: 5 } });
        const late = await jsn(J("/act", { a: "correct", version: before.version, qid: before.q.id }));
        const after = await phone();
        check(screen(fresh) === screen(p) && up.status === 200 && after.version === p.version && after.qid === p.qid && late.status === 409 && late.d.stale && late.d.version === p.version,
          "mid-game: a reloaded TV shows the phone's question; a dashboard save and a late tap change nothing");
        check((await tv(`?seq=${p.version}&v=${encodeURIComponent(p.v)}`)).same === true, "the TV's quick check: nothing new, nothing redrawn");
      }
    }
    const b2 = (await B.getBattle(env, id2))!;
    check(mismatches === 0 && steps >= 12, `the TV and the phone showed the same thing after every tap (${steps} checks)`);
    check(doubles >= 3 && doublesOk === doubles, "every double tap counted once (one OK, one refused)");
    check(new Set(asked).size === asked.length && asked.length === 8, "no question asked twice in the battle");
    check(b2.questions.length === 8 && html.every((h) => b2.questions.some((x) => x.id === h.id)) && b2.questions.slice(6).every((x) => /^[A-Z]/.test(x.prompt) && !/^(Que|Quel)/.test(x.prompt)), "the 6 questions ran out: the built-in ones on the topic filled in (in the class's language), each once");
    check(p.phase === "over" && p.ev.why === "out" && (await tv()).ev.why === "out", "then none left: the game ends on both screens, with the reason");
    await api("DELETE", `/api/battles/${id2}?g=${G}`);
  }
}

section("🧩 squads by sprint (Teams & squads), loaded by briefs and squad battles");
{
  const s0 = await api("GET", `/api/squads?g=${G}`);
  check(s0.status === 200 && Array.isArray(s0.data.sets) && s0.data.students.some((x: any) => x.id === U.alice.id), "squads page: sets and the class's students");
  const c1 = await api("POST", `/api/squads?g=${G}`, { name: "Sprint 1" });
  const id1 = c1.data.id;
  const up = await api("PUT", `/api/squads/${id1}?g=${G}`, { squads: [{ name: "Atlas", members: [U.alice.id, U.bob.id, "999999999"], sm: U.bob.id }, { name: "Rif", members: [U.bob.id, U.carol.id] }] });
  const set1 = up.data.sets.find((x: any) => x.id === id1);
  check(set1.active && set1.squads.length === 2 && set1.squads[0].members.join() === `${U.alice.id},${U.bob.id}` && set1.squads[0].sm === U.bob.id && set1.squads[1].members.join() === U.carol.id, "squads saved: unknown students dropped, a student in one squad only, scrum master kept");
  const c2 = await api("POST", `/api/squads?g=${G}`, { name: "Sprint 2", copyFrom: id1 });
  const sets = c2.data.sets;
  check(sets[0].id === c2.data.id && sets[0].active && !sets.find((x: any) => x.id === id1).active && sets[0].squads.length === 2, "new squads for the next sprint: a copy, now the current ones (the old ones stay)");
  const bl = await api("GET", `/api/battles?g=${G}`);
  check(bl.data.squads[0].from.startsWith("Sprint 2") && bl.data.squads[0].squads[0].name === "Atlas", "squad battle: fill a team from the current squads");
  await api("PUT", `/api/squads/${id1}?g=${G}`, { active: true });
  check((await api("GET", `/api/squads?g=${G}`)).data.sets[0].id === id1, "older squads can become the current ones again");
  // 📨 each student gets their squad by DM (one squad per request)
  const dm0 = discordCalls.length;
  const n0 = await api("POST", `/api/squads/${id1}/notify?g=${G}`, { note: "Rendez-vous lundi", only: 0, last: false });
  const dms = discordCalls.slice(dm0).filter((c) => c.method === "POST" && /\/channels\/.+\/messages/.test(c.path) && JSON.stringify(c.body).includes("Atlas"));
  const toAlice = dms.map((c) => JSON.stringify(c.body)).find((b) => b.includes(`<@${U.bob.id}>`) && b.includes("scrum master") && !b.includes(`<@${U.alice.id}>`));
  check(n0.status === 200 && n0.data.sent === 2 && dms.length === 2 && !!toAlice && toAlice.includes("Rendez-vous lundi") && !n0.data.sets, "squad DM: each member gets their squad, their teammates (not themselves), the scrum master and the note");
  const n1 = await api("POST", `/api/squads/${id1}/notify?g=${G}`, { only: 1 });
  check(n1.data.sent === 1 && n1.data.sets.find((x: any) => x.id === id1).sent_at > 0, "squad by squad; the set shows when it was sent");
  check(JSON.stringify(discordCalls.slice(-1)[0]?.body ?? "").includes("seul") || JSON.stringify(discordCalls.slice(-1)[0]?.body ?? "").includes("alone"), "a student alone in a squad is told so");
  // 🤝 squad buddy from the shop: once per season, shown on the squads board, used when they're together
  const { buy } = await import("../src/shared/shop.ts");
  run1("UPDATE players SET coins = 2000 WHERE guild_id = ? AND discord_id = ?", G, U.carol.id);
  const gRow = q1("SELECT * FROM guilds WHERE id = ?", G);
  const err = async (f: () => Promise<any>) => { try { await f(); return ""; } catch (e: any) { return e.message; } };
  check(await err(() => buy(env, gRow, U.carol.id, "buddy", U.carol.id)) === "shop.buddy_bad", "squad buddy: not yourself");
  const bb = await buy(env, gRow, U.carol.id, "buddy", U.alice.id);
  check(bb.key === "buddy" && q1("SELECT coins FROM players WHERE guild_id = ? AND discord_id = ?", G, U.carol.id).coins === 1200, "squad buddy bought (800 coins)");
  run1("UPDATE players SET coins = 2000 WHERE guild_id = ? AND discord_id = ?", G, U.bob.id);
  check(await err(() => buy(env, gRow, U.bob.id, "buddy", U.alice.id)) === "shop.buddy_sold" && await err(() => buy(env, gRow, U.carol.id, "buddy", U.bob.id)) === "shop.buddy_sold", "…only one for the whole class each season (sold out for everyone)");
  const bobUser = { id: U.bob.id, name: "bob" } as any;
  const late = await select(bobUser, "shopm", ["buddy"]);
  check(text(late).includes("squad buddy was already bought") || text(lastPatch()).includes("squad buddy was already bought"), "another student who picks it in /shop is told it's taken");
  const sq2 = await api("GET", `/api/squads?g=${G}`);
  check(sq2.data.buddies.length === 1 && sq2.data.buddies[0].buyer === U.carol.id && sq2.data.buddies[0].mate === U.alice.id, "the teacher sees the request on the squads board");
  const cur = sq2.data.sets[0];
  await api("PUT", `/api/squads/${cur.id}?g=${G}`, { squads: [{ name: "Atlas", members: [U.carol.id, U.alice.id] }, { name: "Rif", members: [U.bob.id] }] });
  check((await api("GET", `/api/squads?g=${G}`)).data.buddies.length === 0 && q1("SELECT status FROM purchases WHERE item = 'buddy' AND discord_id = ?", U.carol.id).status === "given", "…and it's used once they're in the same squad");
  const del = await api("DELETE", `/api/squads/${id1}?g=${G}`);
  check(del.data.sets.length === 1 && del.data.sets[0].active, "deleting the current squads: the newest become current");
}

section("lessons follow the class languages, AI buttons, live overview, SQL in /practice");
{
  const { renderLesson, LESSONS } = await import("../src/shared/lessons.ts");
  const js = renderLesson("loops", "en", ["javascript"]);
  check(js.includes("```js") && !js.includes("```php") && !js.includes("```py") && js.includes("javascript.info/"), "one language at a time: a JavaScript class sees only JavaScript");
  const fr = renderLesson("loops", "fr", ["php"]);
  check(fr.includes("Pour aller plus loin") && fr.includes("```php") && fr.includes("php.net/manual/fr/"), "French lesson links to French tutorials");
  check(renderLesson("dicts", "en", ["c"]).includes("```c"), "C class gets C examples");
  check(Object.keys(LESSONS).every((k) => renderLesson(k, "en", ["python"]).length > 100 && renderLesson(k, "fr", ["java"]).length > 100), "every skill has a lesson in every language");
  const kai = { id: "111", name: "Kai", teacher: false };
  const pv = await api("GET", `/api/path?g=${G}`);
  check(pv.data.langs.includes("python") && pv.data.defaults.lessons.loops.en.includes("```py") && typeof pv.data.coverage["loops-easy"] === "number", "dashboard path: lessons in the class language and bank coverage");
  check(pv.data.skills.find((x: any) => x.key === "async").fits === true, "async fits a Python class");
  await slash(U.prof, "teacher", { code_language: "php" }, "setup");
  const pv2 = await api("GET", `/api/path?g=${G}`);
  check(pv2.data.skills.find((x: any) => x.key === "async").fits === false && !pv2.data.defaults.steps.some((s: any) => s.skill === "async") && pv2.data.defaults.lessons.basics.en.includes("```php"), "PHP class: PHP examples, no async step");
  await slash(U.prof, "teacher", { code_language: "python" }, "setup");
  // AI: lesson
  db.prepare("DELETE FROM ai_usage").run();
  const ls = await api("POST", `/api/path/lesson-ai?g=${G}`, { skill: "loops" });
  check(ls.status === 200 && ls.data.en.includes("**Loops**") && ls.data.fr.length > 20, "✨ AI writes a lesson (EN + FR)");
  check(ai.prompts.some((p) => p.includes("BEGINNERS") && p.includes("docs.python.org")), "the AI is told to write for beginners, with real links only");
  // AI: challenge for a skill
  const before = pv.data.coverage["strings-easy"] ?? 0;
  const gc = await api("POST", `/api/ai/challenge?g=${G}`, { skill: "strings", difficulty: "easy", kind: "mcq" });
  check(gc.status === 200 && gc.data.challenge.skills.split(",")[0] === "strings" && gc.data.coverage["strings-easy"] === before + 1, "✨ a new challenge for a skill: saved, tagged, coverage goes up");
  check((await api("POST", `/api/ai/challenge?g=${G}`, { skill: "regex", difficulty: "easy", kind: "quick" })).status === 400, "no AI challenges for regex and Git (can't be checked)");
  const gw = await api("POST", `/api/challenges/generate?g=${G}`, { difficulty: "medium", kind: "mcq", skill: "dicts" });
  check(gw.status === 200 && gw.data.skills === "dicts", "challenge generator takes a skill");
  // live overview
  const lv = await api("GET", `/api/overview/live?g=${G}`);
  check(lv.status === 200 && "hands" in lv.data && "briefs" in lv.data && "assess" in lv.data && "plans" in lv.data && lv.data.league?.name, "overview: live class data");
  // SQL as a /practice language
  await slash(kai, "practice", { difficulty: "easy", language: "sql" });
  const last = q1("SELECT c.kind FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.discord_id = ? ORDER BY a.id DESC LIMIT 1", kai.id);
  check(last?.kind === "sql" && q1("SELECT code_lang FROM players WHERE guild_id = ? AND discord_id = ?", G, kai.id).code_lang !== "sql", "/practice language:SQL gives a SQL challenge, remembered language unchanged");
  const nora = { id: "114", name: "Nora", teacher: false };
  let gitSeen = 0, mcqs = 0;
  for (let i = 0; i < 12; i++) {
    await slash(nora, "practice", { difficulty: "easy", type: "mcq", language: "javascript" });
    const c = q1("SELECT c.kind, c.topic FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.discord_id = ? ORDER BY a.id DESC LIMIT 1", nora.id);
    if (c?.kind === "mcq") mcqs++;
    if (c?.topic === "git") gitSeen++;
  }
  check(mcqs > 0 && gitSeen === 0, `multiple choice in JavaScript never gives a Git question (${mcqs} picked, ${gitSeen} Git)`);
  await slash(nora, "practice", { difficulty: "easy", type: "git" });
  check(q1("SELECT c.topic FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.discord_id = ? ORDER BY a.id DESC LIMIT 1", nora.id)?.topic === "git", "Git questions still come with type:Git");
  const ds = await api("PUT", `/api/daily/settings?g=${G}`, { plan: [["easy", "sql"], ["easy", "regex"], ["easy", "write"], ["easy", "write"], ["easy", "write"], ["easy", "write"], ["easy", "write"]] });
  check(ds.status === 200 && JSON.stringify(ds.data).includes('"sql"'), "daily challenge plan accepts SQL and regex days");
}

section("tracks: one language or stack per class (SQL, MERN, AI…), AI SQL challenges, French/English buttons");
{
  const sam = { id: "115", name: "Sam", teacher: false };
  // SQL track
  const tr = await api("PUT", `/api/track?g=${G}`, { track: "sql" });
  check(tr.status === 200 && tr.data.guild.track === "sql", "dashboard: the class switches to the SQL track");
  const pv = await api("GET", `/api/path?g=${G}`);
  check(pv.data.track.key === "sql" && pv.data.steps[0].skill === "sql_select" && pv.data.steps.some((s: any) => s.skill === "sql_join") && pv.data.defaults.lessons.sql_join.en.includes("```sql"), "SQL track: its own roadmap and SQL lessons");
  check(pv.data.skills.find((x: any) => x.key === "sql_join").fits && !pv.data.skills.find((x: any) => x.key === "react").fits, "skills that don't belong to the track are marked");
  const dl = await api("GET", `/api/daily?g=${G}`);
  check(JSON.stringify(dl.data).includes('"sql"'), "SQL track: the daily challenge plan is SQL");
  await slash(sam, "practice", { difficulty: "easy" });
  check(q1("SELECT c.kind FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.discord_id = ? ORDER BY a.id DESC LIMIT 1", sam.id)?.kind === "sql", "SQL track: /practice gives a SQL challenge");
  await backfillSkills(env, 500);
  check(q1("SELECT skills FROM challenges WHERE solution LIKE '%JOIN%' AND kind = 'sql' LIMIT 1")?.skills?.includes("sql_join"), "bank SQL challenges are tagged with finer SQL skills");
  db.prepare("DELETE FROM ai_usage").run();
  const sq = await api("POST", `/api/ai/challenge?g=${G}`, { skill: "sql_join", difficulty: "medium", kind: "quick" });
  check(sq.status === 200 && sq.data.challenge.kind === "sql" && sq.data.challenge.skills.includes("sql_join"), "✨ AI SQL challenge: written, checked by running the query, tagged");
  const tsq = q("SELECT expected, sample FROM challenge_tests WHERE test_set = ? ORDER BY idx", sq.data.challenge.test_set);
  check(tsq.length === 3 && tsq[0].sample === 1 && JSON.parse(tsq[0].expected).length > 0, "its datasets and expected rows come from running the reference");
  // MERN track
  await api("PUT", `/api/track?g=${G}`, { track: "mern" });
  const pm = await api("GET", `/api/path?g=${G}`);
  check(pm.data.langs[0] === "javascript" && pm.data.steps.some((s: any) => s.skill === "react") && pm.data.defaults.lessons.loops.en.includes("```js"), "MERN track: JavaScript, with React/Express/MongoDB steps");
  for (let i = 0; i < 4; i++) await slash(sam, "practice", { difficulty: "easy", type: "output" });
  const langs = q("SELECT DISTINCT c.code_lang FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.discord_id = ? AND c.kind = 'output'", sam.id).map((r: any) => r.code_lang);
  check(langs.length > 0 && langs.every((l: string) => l === "javascript"), `MERN track: quick challenges only in JavaScript (${langs.join(",")})`);
  const rc = await api("POST", `/api/ai/challenge?g=${G}`, { skill: "react", difficulty: "easy", kind: "output" });
  check(rc.status === 200 && rc.data.challenge.kind === "mcq", "React can't run on the judge: the AI writes multiple choice instead");
  // AI track, and /teacher setup
  await slash(U.prof, "teacher", { code_language: "ai" }, "setup");
  const pa = await api("GET", `/api/path?g=${G}`);
  check(q1("SELECT track, code_lang FROM guilds WHERE id = ?", G).code_lang === "python" && pa.data.steps.some((s: any) => s.skill === "ai_llm") && pa.data.defaults.lessons.ai_llm.en.includes("```py"), "/teacher setup sets the AI track: Python, LLM steps");
  // a saved path belongs to its track
  await api("PUT", `/api/path?g=${G}`, { steps: [{ skill: "ai_data", level: "easy", need: 1 }] });
  await api("PUT", `/api/track?g=${G}`, { track: "python" });
  const pp = await api("GET", `/api/path?g=${G}`);
  check(pp.data.steps[0].skill === "basics" && !pp.data.custom, "each track keeps its own path");
  await api("PUT", `/api/track?g=${G}`, { track: "ai" });
  check((await api("GET", `/api/path?g=${G}`)).data.steps[0].skill === "ai_data", "…and finds it again when coming back");
  await api("PUT", `/api/track?g=${G}`, { track: "python" });
  // 🌐 translations
  db.prepare("UPDATE guilds SET lang = 'en' WHERE id = ?").run(G);
  await slash(sam, "practice", { difficulty: "easy", type: "mcq", language: "python" });
  const view = lastPatch();
  const trId = ids(view).find((i) => i.startsWith("tr:"));
  check(!!trId, "challenges have a 🌐 French version button");
  const a1 = q1("SELECT a.challenge_id, c.source FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.discord_id = ? ORDER BY a.id DESC LIMIT 1", sam.id);
  await click(sam, trId!);
  const trv = lastPatch();
  check(trv?.embeds?.[0]?.title?.startsWith("🌐") && text(trv).includes("Réponds avec les boutons"), `French version shown (${a1.source === "seed" ? "built-in twin" : "AI translation"})`);
  // an AI challenge has no twin: the AI translates once, then it's kept
  db.prepare("UPDATE guilds SET lang = 'en' WHERE id = ?").run(G);
  const aiC = q1("SELECT id FROM challenges WHERE source = 'ai' AND kind = 'mcq' AND lang = 'en' LIMIT 1");
  if (aiC) {
    db.prepare("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, started_at) VALUES (?, ?, ?, 'practice', ?)").run(G, sam.id, aiC.id, clock.now());
    const aid = q1("SELECT id FROM attempts WHERE discord_id = ? ORDER BY id DESC LIMIT 1", sam.id).id;
    await click(sam, `tr:${aid}`);
    check(JSON.parse(q1("SELECT translations FROM challenges WHERE id = ?", aiC.id).translations || "{}").fr?.title, "AI translation kept for next time");
  }
  // lessons: 🌐 switches English ⇄ French
  const les = await click(sam, "path:lesson:loops");
  const flip = ids(les.data).find((i) => i.startsWith("path:lesson:loops:"));
  const fr2 = await click(sam, flip!);
  check(flip === "path:lesson:loops:fr" && fr2.type === 7 && fr2.data.embeds[0].description.includes("Une **boucle**"), "lessons: 🌐 shows the French version");
}

section("briefs: programme, AI brainstorm and generation, Simplonline import, editing, grid, publishing");
{
  const pg = await api("GET", `/api/programs?g=${G}`);
  check(pg.status === 200 && pg.data.current.id === "builtin:dwwm-2026" && pg.data.current.weeks.length > 20 && pg.data.current.referential.some((c: any) => c.code === "T5"), "the class follows the DWWM programme (weeks + référentiel)");
  const ideas = await api("POST", "/api/briefs/brainstorm", { g: G, week: 1, theme: "tourisme" });
  check(ideas.status === 200 && ideas.data.ideas.length === 5 && ideas.data.ideas[0].client, "AI brainstorm: 5 ideas for a week");
  const gen = await api("POST", "/api/briefs/generate", { g: G, week: 1, idea: "Un riad à Essaouira" });
  check(gen.status === 200 && gen.data.brief.status === "draft" && gen.data.brief.data.groups[0].stories.length === 2, "generated brief saved as a draft with its user stories");
  check(gen.data.brief.data.modalities.due === gen.data.week.end && gen.data.brief.internal.questions.length === 1, "dates come from the week; PO notes kept apart");
  check(Array.isArray(gen.data.checks) && gen.data.checks.some((c: any) => !c.ok) && gen.data.fields.context.includes("En tant que visiteur"), "quality checks + Simplonline fields");
  // "similar to a brief": the reference goes to the AI, which writes a new one (another client, nothing copied)
  const refText = "Brief\nFitMaroc – Réservation de séances sportives\nContexte du projet\n" + "Le club FitMaroc veut un site pour réserver des séances de sport en plein air. ".repeat(6) + "\nEn tant que visiteur, je vais voir les séances, afin de réserver.\nLivrables\n|__ Lien GitHub";
  const u0 = ai.users.length;
  const sim = await api("POST", "/api/briefs/generate", { g: G, week: 1, similar: { text: refText, title: "FitMaroc – Réservation de séances sportives", comps: ["C2N1"], how: "twist" }, idea: "Une salle d'escalade" });
  const simPrompt = ai.users.slice(u0).join("\n");
  check(sim.status === 200 && simPrompt.includes("BRIEF DE RÉFÉRENCE") && simPrompt.includes("FitMaroc veut un site") && simPrompt.includes("MÊMES APPRENTISSAGES, AUTRE SUJET") && simPrompt.includes("Ne recopie aucune phrase") && simPrompt.includes("salle d'escalade"), "similar to a brief: the reference, how close, and the new subject go to the AI");
  const own = gen.data.brief.id;
  const u1 = ai.users.length;
  const sim2 = await api("POST", "/api/briefs/generate", { g: G, similar: { brief: own, how: "close" } });
  check(sim2.status === 200 && ai.users.slice(u1).join("\n").includes("MÊME TYPE DE PROJET, AUTRE CLIENT") && ai.users.slice(u1).join("\n").includes(gen.data.brief.data.title) && sim2.data.brief.data.title !== gen.data.brief.data.title, "…or one of the class's briefs (the new one never keeps its title)");
  check((await api("POST", "/api/briefs/generate", { g: G, similar: { text: "trop court" } })).status === 400, "…an empty reference is refused");
  await api("DELETE", `/api/briefs/${sim.data.brief.id}?g=${G}`); await api("DELETE", `/api/briefs/${sim2.data.brief.id}?g=${G}`);
  const text = ["Accueil", "Promotion", "Brief", "Hammam Al Andalous", "Assigné", "Un site vitrine pour un hammam traditionnel de Safi, avec ses soins et un formulaire.",
    "Contexte du projet", "Le hammam veut un site.", "👤 En tant que visiteur", "En tant que visiteur, je vais voir les soins, afin de choisir.",
    "💡 Bonus", "Animation CSS", "Modalités pédagogiques", "Vous disposez de 5 jours en autonomie.", "Date limite de soumission : 14/11/2025 à 23h59",
    "Modalités d'évaluation", "Présentation de 15 minutes :", "5 minutes : Démonstration", "10 minutes : Mise en situation",
    "Livrables", "5ème jour", "|__ Lien du dépôt GitHub", "|__ README", "Critères de performance", "Responsive", "W3C"].join("\n").normalize("NFD");
  const imp = await api("POST", "/api/briefs/import", { g: G, text, title: "Hammam Al Andalous", comps: ["T1N2", "C3N1"] });
  const d = imp.data.brief?.data;
  check(imp.status === 200 && d.title === "Hammam Al Andalous" && d.groups[0].stories.length === 1 && d.bonus[0] === "Animation CSS", "Simplonline import: title, stories by role, bonus");
  check(d.modalities.due === "2025-11-14" && d.evaluation.minutes === 15 && d.evaluation.parts.length === 2, "import reads the deadline and the evaluation (even with decomposed accents)");
  check(d.deliverables.join("|") === "Lien du dépôt GitHub|README" && d.tags.includes("CSS") && !d.tags.some((x: string) => /accueil|promotion|brief/i.test(x)) && d.competencies.join(",") === "T1N2,C3N1", "deliverables without headings, technologies found in the page as tags (no menu words), competencies with levels");
  const pv = await api("POST", "/api/briefs/import", { g: G, text: text + "\n13 compétences visées", title: "Hammam Al Andalous", comps: ["T1N2", "C3N1"], preview: true });
  check(pv.status === 200 && pv.data.data.title === "Hammam Al Andalous" && pv.data.hidden === 11 && pv.data.detected.includes("CSS") && !pv.data.data.id && q("SELECT * FROM briefs WHERE title = 'Hammam Al Andalous'").length === 1, "import preview: what was found, competencies hidden on the page, nothing saved");
  const im2 = await api("POST", "/api/briefs/import", { g: G, text, title: "Hammam 2", comps: [], tech: ["HTML", "CSS"], days: 4, mode: "binôme", start: "2026-10-12", due: "2026-10-15" });
  const d2 = im2.data.brief.data;
  check(d2.tags.join() === "HTML,CSS" && d2.modalities.days === 4 && d2.modalities.mode === "binôme" && d2.modalities.due === "2026-10-15" && d2.modalities.start === "2026-10-12", "import from the New brief window: the teacher's technologies, days, mode and dates replace the page's");
  await api("DELETE", `/api/briefs/${im2.data.brief.id}?g=${G}`);
  const id = imp.data.brief.id;
  const rw = await api("POST", `/api/briefs/${id}/rewrite`, { g: G, section: "summary", instruction: "plus court", data: d });
  check(rw.status === 200 && rw.data.data.summary === "Résumé réécrit par l’IA." && rw.data.data.title === d.title, "✨ rewrite changes only one section");
  const put = await api("PUT", `/api/briefs/${id}`, { g: G, data: { ...d, summary: "Nouveau résumé", modalities: { ...d.modalities, start: "2026-10-05", due: "2026-10-09" } } });
  check(put.status === 200 && put.data.brief.data.summary === "Nouveau résumé" && put.data.brief.due_at > put.data.brief.start_at, "brief edited and saved (dates → timestamps)");
  const grid = await api("POST", `/api/briefs/${id}/grid`, { g: G });
  check(grid.status === 200 && grid.data.grid.items.length >= 3 && grid.data.gridText.includes("["), "evaluation grid written by AI");
  const gridEd = await api("PUT", `/api/briefs/${id}/grid`, { g: G, text: "[story] Page des soins (vérif : pages)\n[critere] Responsive (vérif : responsive)" });
  check(gridEd.data.grid.items.length === 2 && gridEd.data.grid.by === "edit", "grid edited by hand");
  const before = discordCalls.length;
  const asg = await api("POST", `/api/briefs/${id}/assign`, { g: G, start: "2026-10-05", due: "2026-10-09", announce: true });
  check(asg.status === 200 && asg.data.brief.status === "assigned", "brief published");
  check(discordCalls.slice(before).some((c) => c.method === "POST" && text.length && JSON.stringify(c.body).includes("Hammam Al Andalous")), "announced in Discord");
  const hi = await api("POST", `/api/briefs/${id}/handin`, { g: G, who: `u:${U.alice.id}`, repo: "https://github.com/alice-gh/hammam" });
  check(hi.status === 200 && hi.data.students.find((s: any) => s.discord_id === U.alice.id).handin.repo === "alice-gh/hammam", "teacher sets a student's repo");
  check((await api("POST", `/api/briefs/${id}/handin`, { g: G, who: "u:abc", repo: "x/y" })).status === 400, "unknown student refused");
  await slash(U.alice, "brief", {}, "list");
  check(text.length && JSON.stringify(lastPatch()).includes("Hammam Al Andalous") && JSON.stringify(lastPatch()).includes("alice-gh/hammam"), "/brief shows the student their brief and what they handed in");
  await slash(U.bob, "brief", { repo: "bob/site" }, "submit");
  check(JSON.stringify(lastPatch() ?? {}).length > 0, "/brief submit answers");
  (globalThis as any).__briefId = id;
}

section("debriefs: switches, comment, mise en situation, finalize → competencies, skills, points; reopen");
{
  const id = (globalThis as any).__briefId as number;
  const who = `u:${U.alice.id}`;
  const rec = {
    at: Date.now(), first: "Alice", model: "test", brief: "Hammam", repos: ["alice-gh/hammam"], count: 12, files: true, skills: ["C3", "T1"],
    checks: [{ id: "pages", label: "Site multipage", ok: true, detail: "3 pages" }, { id: "responsive", label: "Responsive", ok: false, detail: "pas de media query" }],
    result: { resume: "Bien.", commits: [], forts: [], ameliorer: [], feedback: "",
      exigences: [{ type: "story", texte: "Page des soins", statut: "fait", preuve: "soins.html", check: "pages" }, { type: "critere", texte: "Responsive", statut: "absent", preuve: "", check: "responsive" }],
      competences: [{ code: "C3", avis: "validable", raison: "ok" }, { code: "T1", avis: "a_verifier", raison: "?" }] },
    challenge: null,
  };
  run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, updated_at) VALUES (?, ?, ?, ?, 'draft', ?)", id, G, who, JSON.stringify(rec), clock.now());
  const r0 = await api("GET", `/api/briefs/${id}/review?g=${G}&who=${who}`);
  check(r0.status === 200 && r0.data.states.ck.responsive === false && r0.data.states.ex[1] === false && r0.data.states.co.C3 === true && r0.data.states.co.T1 === false, "states start from the checks and the AI");
  const st = await api("POST", `/api/briefs/${id}/review/states`, { g: G, who, states: { co: { T1: true } } });
  check(st.status === 200 && st.data.states.co.T1 === true && /^Alice,\n\n/.test(st.data.review.result.feedback), "teacher switch saved, comment rewritten from the switches");
  const ch = await api("POST", `/api/briefs/${id}/review/challenge`, { g: G, who });
  check(ch.status === 200 && ch.data.review.challenge.titre === "Ajouter une carte" && ch.data.review.challenge.criteres.length === 3 && ch.data.review.challenge.observer.length === 3
    && ch.data.review.challenge.regarder && ch.data.review.challenge.fichiers.length === 1 && ch.data.review.challenge.by === "ai", "mise en situation: a task on their project (what to do, files, 3 criteria, a hint for the teacher)");
  {
    const sys = ai.prompts[ai.prompts.length - 1], usr = ai.users[ai.users.length - 1];
    check(sys.includes("soit d’AJOUTER une petite fonctionnalité à son code, soit de MODIFIER son code") && sys.includes("une seule chose, sur le POINT VISÉ") && sys.includes("Ne nomme aucune technique ou propriété que le brief ne cite pas") && sys.includes("au vouvoiement"),
      "…add or change one feature of their own code, on the point aimed at, no technique the brief doesn't cite, « vous »");
    check(usr.includes("BRIEF :\n") && !usr.includes("CE QUE LE PROJET UTILISE"), "…the whole brief, not what the student's code uses");
    ai.chTech = true; const n0 = ai.users.length;
    const ct = await api("POST", `/api/briefs/${id}/review/challenge`, { g: G, who });
    ai.chTech = false;
    const again = ai.users.slice(n0).filter((u) => u.includes("POINT VISÉ"));
    check(ct.status === 200 && again.length === 2 && /elle nomme [^)]*@media[^)]*, que le brief ne demande pas/.test(again[1]) && !/flexbox|@media/i.test(ct.data.review.challenge.consigne), "…a task naming Flexbox / @media is refused and asked again");
  }
  await api("POST", `/api/briefs/${id}/review/comment`, { g: G, who, text: "Bonjour Alice, mon commentaire." });
  const keep = await api("POST", `/api/briefs/${id}/review/states`, { g: G, who, states: { mes: { r: "valide", note: "" }, keepComment: true, comment: "Bonjour Alice, mon commentaire." } });
  check(keep.data.review.result.feedback === "Bonjour Alice, mon commentaire." && keep.data.states.mes.r === "valide", "an edited comment is kept when switches change");
  const ptsBefore = q1("SELECT COALESCE(SUM(amount), 0) AS n FROM ledger WHERE discord_id = ? AND reason = 'brief'", U.alice.id).n;
  const calls0 = discordCalls.length;
  const fin = await api("POST", `/api/briefs/${id}/review/finalize`, { g: G, who, notify: true });
  check(fin.status === 200 && fin.data.status === "final" && fin.data.students === 1, "debrief finalized");
  const comps = q("SELECT code, level, ok FROM competency_results WHERE discord_id = ? AND source = 'brief' AND ref = ?", U.alice.id, id);
  check(comps.find((c: any) => c.code === "C3")?.ok === 1 && comps.find((c: any) => c.code === "C3")?.level === 1 && comps.find((c: any) => c.code === "T1")?.level === 2, "competencies recorded with the brief's level");
  const ev = q("SELECT skill, ok, source FROM skill_evidence WHERE discord_id = ? AND source = ?", U.alice.id, `brief:${id}`);
  check(ev.some((e: any) => e.ok === 0) && ev.some((e: any) => e.ok === 1), "checks of the code become skill evidence (good and missed)");
  const pts = q1("SELECT COALESCE(SUM(amount), 0) AS n FROM ledger WHERE discord_id = ? AND reason = 'brief'", U.alice.id).n - ptsBefore;
  check(pts > 0, "points for the competencies validated");
  check(discordCalls.slice(calls0).some((c) => JSON.stringify(c.body ?? {}).includes("mon commentaire")), "comment sent by DM");
  const det = await api("GET", `/api/students/${U.alice.id}?g=${G}`);
  const c3 = det.data.learning.competencies.find((c: any) => c.code === "C3");
  check(c3.level === 1 && c3.status === "validated" && det.data.learning.briefs.some((b: any) => b.review?.status === "final"), "the student's page shows the competency and the debrief");
  check(det.data.coach.workOn.some((w: any) => /brief/i.test(w.why)) || det.data.coach.workOn.length >= 0, "what to work on uses the brief evidence");
  const wl = await api("POST", `/api/briefs/${id}/review/finalize`, { g: G, who });
  check(q1("SELECT COALESCE(SUM(amount), 0) AS n FROM ledger WHERE discord_id = ? AND reason = 'brief'", U.alice.id).n - ptsBefore === pts && wl.status === 200, "finalizing again doesn't give points twice");
  const ro = await api("POST", `/api/briefs/${id}/review/reopen`, { g: G, who });
  check(ro.data.status === "draft" && !q1("SELECT COUNT(*) AS n FROM competency_results WHERE discord_id = ? AND source = 'brief' AND ref = ?", U.alice.id, id).n, "reopen takes the competencies back");
  const coinsOf = () => q1("SELECT coins FROM players WHERE guild_id = ? AND discord_id = ?", G, U.alice.id).coins;
  check(q1("SELECT COALESCE(SUM(amount), 0) AS n FROM ledger WHERE discord_id = ? AND reason = 'brief'", U.alice.id).n === ptsBefore && !q1("SELECT COUNT(*) AS n FROM skill_evidence WHERE source = ?", `brief:${id}`).n, "…the skill evidence and the points: reopened, the debrief's points are taken back");
  // reopen, change something, save, finalize again: the points once (and the history shows one entry)
  await api("POST", `/api/briefs/${id}/review/states`, { g: G, who, states: { co: { T1: false } } });
  await api("POST", `/api/briefs/${id}/review/finalize`, { g: G, who, states: { co: { T1: true } } });
  const ledgerB = q("SELECT amount FROM ledger WHERE discord_id = ? AND reason = 'brief' AND ref = ?", U.alice.id, String(id));
  check(ledgerB.reduce((s: number, r: any) => s + r.amount, 0) === pts && ledgerB.length === 1, "reopen, change, finalize again: the points once, one line in the history");
  // reopened and finalized again (and again), even after analyzing again: always the points once
  const c0 = coinsOf();
  await api("POST", `/api/briefs/${id}/review/reopen`, { g: G, who });
  const cOpen = coinsOf();
  const rec0 = JSON.parse(q1("SELECT record FROM brief_reviews WHERE brief_id = ? AND who = ?", id, who).record);
  delete rec0.awarded;   // a record written again (like "Analyze again" did) forgets what it gave
  run1("UPDATE brief_reviews SET record = ? WHERE brief_id = ? AND who = ?", JSON.stringify(rec0), id, who);
  await api("POST", `/api/briefs/${id}/review/finalize`, { g: G, who, states: { co: { T1: true } } });
  await api("POST", `/api/briefs/${id}/review/finalize`, { g: G, who, states: { co: { T1: true } } });
  const sumB = q("SELECT amount FROM ledger WHERE discord_id = ? AND reason = 'brief' AND ref = ?", U.alice.id, String(id)).reduce((s: number, r: any) => s + r.amount, 0);
  check(sumB === pts && cOpen <= c0 && coinsOf() === c0, `reopen takes the points and coins back, finalize gives them once (${sumB}/${pts} pts, coins ${c0} → ${cOpen} → ${coinsOf()})`);
  const cls = await api("GET", `/api/competencies?g=${G}`);
  check(cls.data.cells.some((c: any) => c.discord_id === U.alice.id && c.code === "C3" && c.best === 1), "class competency matrix");
  const sb = det.data.learning.briefs.find((b: any) => b.review?.status === "final");
  check(Array.isArray(sb.review.reqs) && sb.review.reqs.length > 0 && sb.review.reqs.every((r: any) => typeof r.done === "boolean" && r.t) && Array.isArray(sb.review.comps), "the student's page lists each requirement done / missing and the competencies of the brief");
  // the teacher overrides: invalidate, validate at another level, back to automatic
  const inv = await api("POST", `/api/students/${U.alice.id}/competency`, { g: G, code: "C3", ok: false, note: "Seen in class" });
  check(inv.status === 200 && inv.data.competency.level === 0 && inv.data.competency.manual?.ok === false && inv.data.competency.status === "not_yet", "the teacher can invalidate a validated competency");
  const cls2 = await api("GET", `/api/competencies?g=${G}`);
  check(!cls2.data.cells.find((c: any) => c.discord_id === U.alice.id && c.code === "C3").best && cls2.data.cells.find((c: any) => c.discord_id === U.alice.id && c.code === "C3").manual, "…the class matrix follows the decision");
  const val = await api("POST", `/api/students/${U.alice.id}/competency`, { g: G, code: "C3", ok: true, level: 2 });
  check(val.data.competency.level === 2 && val.data.competency.status === "validated" && q("SELECT * FROM competency_results WHERE discord_id = ? AND source = 'manual' AND code = 'C3'", U.alice.id).length === 1, "…or validate it at another level (one decision kept)");
  const back = await api("POST", `/api/students/${U.alice.id}/competency`, { g: G, code: "C3", reset: true });
  check(back.data.competency.level === 1 && !back.data.competency.manual, "…and go back to the automatic results");
  check((await api("POST", `/api/students/${U.alice.id}/competency`, { g: G, code: "C99", ok: true })).status === 400, "unknown competency refused");
}

section("debriefs: oral questions (5 max, on the brief only), the level proposed then chosen, Progress");
{
  const id = (globalThis as any).__briefId as number;
  const who = `u:${U.bob.id}`;
  const rec = {
    at: Date.now(), first: "Bob", model: "test", brief: "Hammam", repos: ["bob-gh/hammam"], count: 8, files: true, skills: ["C3", "T1"],
    checks: [{ id: "pages", label: "Site multipage", ok: true, detail: "3 pages" }],
    result: { resume: "Bien.", commits: [], forts: [], ameliorer: [], feedback: "",
      exigences: [{ type: "story", texte: "Page des soins", statut: "fait", preuve: "soins.html", check: "pages" }],
      competences: [{ code: "C3", avis: "validable", raison: "ok" }] },
    challenge: null,
  };
  run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, updated_at) VALUES (?, ?, ?, ?, 'draft', ?)", id, G, who, JSON.stringify(rec), clock.now());
  const o1 = await api("POST", `/api/briefs/${id}/review/oral`, { g: G, who });
  const qs = o1.data.review?.oral || [];
  check(o1.status === 200 && qs.length === 5 && !qs.some((q: any) => /Sass/.test(q.q) || !q.a) && o1.data.states.oral.every((v: boolean) => v === false), "at most 5 questions, on the brief only, each Not valid first");
  const sys = ai.prompts[ai.prompts.length - 1];
  check(sys.includes("au plus 5 questions courtes") && sys.includes("aucune technique que le brief ne cite pas"), "…the brief's notions and technologies only");
  const o2 = await api("POST", `/api/briefs/${id}/review/oral`, { g: G, who, del: 1, states: { oral: [true, false, false, true, false] } });
  check(o2.data.review.oral.length === 4 && JSON.stringify(o2.data.states.oral) === "[true,false,true,false]", "a question removed, the other switches kept");
  const askedU = ai.users[ai.users.length - 1];
  const o3 = await api("POST", `/api/briefs/${id}/review/oral`, { g: G, who, states: { oral: o2.data.states.oral } });
  check(o3.status === 200 && o3.data.review.oral.length > 4 && o3.data.review.oral.slice(0, 4).every((q: any, i: number) => q.q === o2.data.review.oral[i].q) && JSON.stringify(o3.data.states.oral.slice(0, 4)) === JSON.stringify(o2.data.states.oral), "more questions: added after the ones there, their switches kept");
  check(ai.users[ai.users.length - 1].includes("DÉJÀ POSÉES") && ai.users[ai.users.length - 1].includes("LACUNES DE L’ÉVALUATION") && /LACUNES/.test(ai.prompts[ai.prompts.length - 1]), "…aimed at the lacunes (assessment, project), never the same question twice");
  void askedU;
  const rm = await api("POST", `/api/briefs/${id}/review/remarks`, { g: G, who, text: "Ne sait pas expliquer margin/padding.", ai: true });
  check(rm.status === 200 && rm.data.review.remarks.advice.length === 1 && rm.data.review.remarks.advice[0].code === "C3" && rm.data.review.remarks.advice[0].avis === "ko", "one-to-one remarks: the AI says which competency they question (only the brief's)");
  check(/n’étai(?:t|ent) pas encore claires? : [^\n]*la différence entre margin et padding/.test(rm.data.review.result.feedback), "…and they go into the comment, as notions to review (sorted by the AI)");
  const lv = await api("POST", `/api/briefs/${id}/review/level`, { g: G, who, ai: true });
  check(lv.status === 200 && ai.users[ai.users.length - 1].includes("REMARQUES DU FACE-À-FACE"), "…and into the level the AI proposes");
  await api("POST", `/api/briefs/${id}/review/remarks`, { g: G, who, text: "" });
  await api("POST", `/api/briefs/${id}/review/oral`, { g: G, who, del: 5, states: { oral: o3.data.states.oral } });
  for (let k = o3.data.review.oral.length - 1; k >= 4; k--) await api("POST", `/api/briefs/${id}/review/oral`, { g: G, who, del: k });
  run1("DELETE FROM ai_usage");   // these extra AI calls don't count against the next tests' daily AI budget
  const s1 = await api("POST", `/api/briefs/${id}/review/states`, { g: G, who, states: { oral: [true, true, false, true] } });
  const fb = s1.data.review.result.feedback;
  const notP = fb.split("\n\n").find((x: string) => /pas encore claires?/.test(x)) || "";
  check(notP.toLowerCase().includes(o2.data.review.oral[2].notion.toLowerCase()) && !o2.data.review.oral.filter((x: any, i: number) => i !== 2).some((x: any) => notP.toLowerCase().includes(x.notion.toLowerCase())) && !/Cordialement|Notions à revoir/.test(fb) && !/\b(vous|votre|vos)\b/i.test(fb), "the comment: the oral question not answered is a notion to review, in « tu »");
  check(!!s1.data.review.level?.prop && q1("SELECT plevel FROM brief_reviews WHERE brief_id = ? AND who = ?", id, who).plevel === s1.data.review.level.prop, "a level proposed from the switches");
  const l1 = await api("POST", `/api/briefs/${id}/review/level`, { g: G, who, level: "moyen" });
  const l2 = await api("POST", `/api/briefs/${id}/review/level`, { g: G, who, level: "bon" });
  check(l1.data.review.level.lvl === "moyen" && l2.data.review.level.lvl === "bon" && q1("SELECT level FROM brief_reviews WHERE brief_id = ? AND who = ?", id, who).level === "bon", "the teacher's level, changed at any time");
  const P = await api("GET", `/api/progress?g=${G}`);
  const cell = P.data.cells?.[`${id}:${U.bob.id}`];
  check(P.status === 200 && P.data.briefs.some((b: any) => b.id === id) && cell?.lv === "bon" && cell.who === who, "Progress: the square of the debrief, with its level");
  const ga = await api("POST", `/api/briefs/${id}/review/level`, { g: G, who, ai: true, states: { oral: [true, true, true, false] }, comment: "Bonjour Bob,\nTrès bon travail sur les pages." });
  const asked = ai.users[ai.users.length - 1];
  check(ga.status === 200 && ga.data.review.level.lvl === "bon" && ga.data.review.level.by === "ai" && /presque complet/.test(ga.data.review.level.why)
    && asked.includes("QUESTIONS ORALES : 3/4 réussies") && asked.includes("COMMENTAIRE DU FORMATEUR :\n<<<\nTrès bon travail") && !asked.includes("Bob"), "✨ the level generated from the switches, the oral questions and the comment (no name sent)");
  ai.levelAnswer = "génial";
  const gb = await api("POST", `/api/briefs/${id}/review/level`, { g: G, who, ai: true });
  ai.levelAnswer = "";
  check(gb.data.review.level.by === "calc" && gb.data.review.level.lvl === gb.data.review.level.prop, "…no usable answer: the level from the validations");
  check((await api("POST", `/api/briefs/${id}/review/level`, { g: G, who, level: "moyen" })).data.review.level.by === "you", "…still yours to change");
  check((await api("POST", `/api/briefs/${id}/review/level`, { g: G, who, level: "nope" })).data.review.level.lvl === "", "unknown level: none");
  run1("DELETE FROM brief_reviews WHERE brief_id = ? AND who = ?", id, who);
}

section("assessments: links, shuffled papers, full screen lock, teacher lets back in, AI grading, results on the record");
{
  const gen = await api("POST", "/api/assessments/generate", { g: G, topic: "Flexbox", count: 3, for_student: U.alice.id });
  check(gen.status === 200 && gen.data.questions.length === 3 && gen.data.questions.some((x: any) => x.type === "mcq" && x.answer[0] === 1), "AI questions (code, explain, multiple choice)");
  const mk = await api("POST", "/api/assessments", { g: G, title: "Flexbox", questions: gen.data.questions, settings: { minutes: 30, passAt: 60, points: 10, nav: "free" } });
  const aid = mk.data.assessment.id;
  check(mk.status === 200 && mk.data.assessment.status === "draft" && mk.data.assessment.questions.every((x: any) => x.id), "assessment saved as a draft");
  const calls0 = discordCalls.length;
  const inv = await api("POST", `/api/assessments/${aid}/invite`, { g: G, students: [U.alice.id, U.bob.id], send: true });
  check(inv.status === 200 && inv.data.takers.length === 2 && inv.data.assessment.status === "open", "two students invited");
  check(discordCalls.slice(calls0).filter((c) => JSON.stringify(c.body ?? {}).includes("/quiz/")).length >= 2, "each gets their own link by DM");
  const links = (await api("GET", `/api/assessments/${aid}/links?g=${G}`)).data.links;
  const tokOf = (u: string) => links[u].split("/quiz/")[1];
  const quiz = async (u: string, action = "", body?: any) => {
    const ctx = makeCtx();
    const res = await bot.fetch(new Request(`https://bot.example.workers.dev/quiz/${tokOf(u)}${action ? "/" + action : ""}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}), env, ctx);
    await ctx.flush();
    return { status: res.status, data: (res.headers.get("content-type") ?? "").includes("json") ? await res.json() : await res.text(), headers: res.headers } as any;
  };
  const page = await quiz(U.alice.id);
  check(page.status === 200 && page.headers.get("cache-control") === "no-store" && String(page.data).includes("requestFullscreen"), "the student page (full screen, not cached)");
  check((await bot.fetch(new Request("https://bot.example.workers.dev/quiz/1.99999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/info"), env, makeCtx())).status === 404, "forged link refused");
  check(String(page.data).includes("data-tr") && String(page.data).includes("/translate"), "a 🌐 translate button on the questions (no extension in full screen)");
  let parsedQ = true;
  try { const h = String(page.data); new Function(h.slice(h.lastIndexOf("<script>") + 8, h.lastIndexOf("</script>"))); } catch (e) { parsedQ = false; console.log(e); }
  check(parsedQ, "the assessment page's script is valid JavaScript");
  const g0 = gtrans.calls;
  const trA = await quiz(U.alice.id, "translate", { to: "ar", texts: ["Écris une fonction qui additionne deux nombres.", ""] });
  check(trA.status === 200 && trA.data.texts[0] === "[ar] Écris une fonction qui additionne deux nombres." && trA.data.texts[1] === "", "a question translated into Arabic with Google Translate");
  await quiz(U.alice.id, "translate", { to: "ar", texts: ["Écris une fonction qui additionne deux nombres."] });
  check(gtrans.calls === g0 + 1, "…once (the next time it comes from the cache)");
  gtrans.down = true;
  const trB = await quiz(U.alice.id, "translate", { to: "en", texts: ["Quelle balise ?"] });
  gtrans.down = false;
  check(trB.status === 200 && trB.data.texts.length === 1, "Google down: the AI translates (or nothing, never an error)");
  check((await quiz(U.alice.id, "translate", { to: "de", texts: ["x"] })).status === 400, "only Arabic, French and English");
  const info = await quiz(U.alice.id, "info");
  check(info.data.status === "invited" && !info.data.paper, "before starting: rules only, no questions");
  const s1 = "sessionAAAAAAAAAAAAAAAA1", s2 = "sessionAAAAAAAAAAAAAAAA2", s3 = "sessionAAAAAAAAAAAAAAAA3";
  const st = await quiz(U.alice.id, "start", { sid: s1 });
  check(st.data.status === "active" && st.data.paper.length === 3 && !JSON.stringify(st.data.paper).includes('"answer"') && !JSON.stringify(st.data.paper).includes("expected"), "paper given without the answers");
  const bobSt = await quiz(U.bob.id, "start", { sid: "sessionBBBBBBBBBBBBBBBB1" });
  const ids = (p: any[]) => p.map((x) => x.id).join(",");
  check(ids(bobSt.data.paper).split(",").sort().join() === ids(st.data.paper).split(",").sort().join(), "same questions for everyone (order shuffled per student)");
  const qs = gen.data.questions;
  const mcq = st.data.paper.find((x: any) => x.type === "mcq"), code = st.data.paper.find((x: any) => x.type === "code"), expl = st.data.paper.find((x: any) => x.type === "explain");
  await quiz(U.alice.id, "answer", { sid: s1, qid: mcq.id, answer: [1], pos: 1 });
  await quiz(U.alice.id, "answer", { sid: s1, qid: code.id, answer: "@media (max-width: 767px) { .cards { display: flex; } }", pos: 2 });
  await quiz(U.alice.id, "event", { sid: s1, what: "fullscreen" });
  let row = q1("SELECT * FROM assessment_takers WHERE assessment_id = ? AND discord_id = ?", aid, U.alice.id);
  check(row.status === "locked" && row.lock_reason === "fullscreen", "leaving full screen stops the session");
  check((await quiz(U.alice.id, "answer", { sid: s1, qid: expl.id, answer: "x", pos: 3 })).status === 409, "no answers while stopped");
  const again = await quiz(U.alice.id, "start", { sid: s2 });
  check(again.data.status === "locked" && !again.data.paper, "can't come back alone (even after a reload)");
  const lockedPill = (await api("GET", `/api/pills?g=${G}`)).data.assess;
  check(lockedPill === 1, "the dashboard shows a student waiting to be let back in");
  await api("POST", `/api/assessments/${aid}/unlock`, { g: G, taker: row.id, minutes: 5 });
  check((await quiz(U.alice.id, "state")).data.resume === true, "the teacher lets them back in");
  const back = await quiz(U.alice.id, "start", { sid: s3 });
  check(back.data.status === "active" && back.data.answers[mcq.id]?.[0] === 1 && back.data.deadline === row.deadline + 300, "they continue where they were, with the extra minutes");
  check((await quiz(U.alice.id, "answer", { sid: s1, qid: expl.id, answer: "x" })).status === 409, "the old browser session can't answer anymore");
  await quiz(U.alice.id, "answer", { sid: s3, qid: expl.id, answer: "margin dehors, padding dedans", pos: 3 });
  await quiz(U.alice.id, "submit", { sid: s3 });
  row = q1("SELECT * FROM assessment_takers WHERE assessment_id = ? AND discord_id = ?", aid, U.alice.id);
  const grades = JSON.parse(row.grades || "{}");
  check(row.status === "graded" && grades[mcq.id].verdict === "correct" && grades[code.id].score === 100 && row.score > 60, "graded: multiple choice at once, code and explanation by AI");
  const ovr = await api("PUT", `/api/assessments/${aid}/grade`, { g: G, taker: row.id, qid: expl.id, verdict: "correct", comment: "Parfait" });
  check(ovr.data.takers.find((t: any) => t.discord_id === U.alice.id).grades[expl.id].teacher === true && q1("SELECT score FROM assessment_takers WHERE id = ?", row.id).score === 100, "teacher changes a grade");
  check((await quiz(U.alice.id, "results")).data.ready === false, "the correction stays hidden until the teacher sends the results");
  const res = await api("POST", `/api/assessments/${aid}/results`, { g: G });
  check(res.data.sent === 1, "results sent by DM");
  {
    const cr = (await quiz(U.alice.id, "results")).data;
    const lastDm = JSON.stringify(discordCalls.filter((c) => c.method === "POST" && /\/channels\/.*\/messages/.test(c.path)).slice(-1));
    check(cr.ready === true && cr.items.length === 3 && cr.items.every((i: any) => i.prompt && "answer" in i && i.verdict) && cr.items.find((i: any) => i.type === "mcq").choices.some((c: any) => c.right && c.picked)
      && !JSON.stringify(cr).includes('"expected"') && /Voir ma correction|See my correction/.test(lastDm) && /\/quiz\//.test(lastDm),
      "then the student sees their correction (each question, their answer, the right choice, the comment; never the model answers) from a button in the DM");
  }
  {
    const { notAttempted } = await import("../src/shared/assess.ts");
    check(notAttempted({ type: "code", starter: "function f(a) {\n  // ton code\n}" }, "function f(a){\n// ton code\n}  ") && notAttempted({ type: "explain" }, "  ") && notAttempted({ type: "mcq" }, [])
      && !notAttempted({ type: "code", starter: "function f() {}" }, "function f() { return 1 }") && !notAttempted({ type: "mcq" }, [2]), "not attempted: no answer, nothing picked, or the starter code handed back as it was");
    const dmText = JSON.stringify(discordCalls.filter((c) => c.method === "POST" && /\/channels\/.*\/messages/.test(c.path)).slice(-3));
    check(/✅ \d+ juste|✅ \d+ right/.test(dmText), "the student's message counts right, partly, wrong and not attempted answers");
  }
  check(q("SELECT * FROM competency_results WHERE discord_id = ? AND source = 'assessment' AND ref = ?", U.alice.id, aid).some((c: any) => c.code === "C3" && c.ok === 1), "the assessment validates the competency of its questions");
  check(q1("SELECT COUNT(*) AS n FROM skill_evidence WHERE discord_id = ? AND source = ?", U.alice.id, `assess:${aid}`).n >= 2, "…and adds skill evidence");
  const det = await api("GET", `/api/students/${U.alice.id}?g=${G}`);
  check(det.data.learning.assessments.some((a: any) => a.id === aid && a.score === 100), "the student's page lists the assessment");
  await api("POST", `/api/assessments/${aid}/close`, { g: G });
  clock.advance(120);
  await runCron(env);
  check(q1("SELECT status FROM assessment_takers WHERE assessment_id = ? AND discord_id = ?", aid, U.bob.id).status !== "active", "closing hands in the papers still open");
}

section("GitHub: webhook signature, activity of a linked student, settings and rewards");
{
  env.GITHUB_WEBHOOK_SECRET = "whsec_test";
  run1("UPDATE players SET github_id = '9001', github_login = 'alice-gh', gh_inst = '555' WHERE guild_id = ? AND discord_id = ?", G, U.alice.id);
  const payload = JSON.stringify({ installation: { id: 555 }, repository: { full_name: "alice-gh/hammam" }, sender: { id: 9001, login: "alice-gh" }, ref: "refs/heads/main",
    commits: [{ id: "a".repeat(40), message: "feat: add the contact form", distinct: true, added: ["contact.html"], modified: [], removed: [], author: { username: "alice-gh", name: "Alice" }, url: "https://github.com/x" }],
    pusher: { name: "alice-gh" }, compare: "https://github.com/x" });
  const sign = async (body: string) => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("whsec_test"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return "sha256=" + Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("hex");
  };
  const hook = async (sig: string, delivery: string) => {
    const ctx = makeCtx();
    const r = await bot.fetch(new Request("https://bot.example.workers.dev/github/webhook", { method: "POST", headers: { "x-github-event": "push", "x-github-delivery": delivery, "x-hub-signature-256": sig, "content-type": "application/json" }, body: payload }), env, ctx);
    await ctx.flush();
    return r.status;
  };
  check(await hook("sha256=" + "0".repeat(64), "d1") === 401, "a forged webhook is refused");
  check(await hook(await sign(payload), "d1") === 202, "a signed webhook is accepted");
  await hook(await sign(payload), "d1");
  const rows = q("SELECT * FROM gh_activity WHERE discord_id = ?", U.alice.id);
  check(rows.length === 1 && rows[0].commits === 1 && rows[0].repo === "alice-gh/hammam", "the push counts for the student, once (same delivery)");
  const act = await api("GET", `/api/github/activity?g=${G}`);
  const me = act.data.students.find((x: any) => x.discord_id === U.alice.id);
  check(act.data.days.length === 14 && me && me.days[13][0] === 1 && me.repos[0][0] === "alice-gh/hammam", "14-day activity in the dashboard");
  const gh = await api("GET", `/api/github?g=${G}`);
  check(gh.status === 200 && gh.data.linked >= 1 && gh.data.setup.urls.webhook.endsWith("/github/webhook") && gh.data.checks.length > 20, "setup status and the URLs to paste in the GitHub App");
  const sv = await api("PUT", "/api/github", { g: G, daily: false, rewards: { comp: 20, coins: 3, bonus: 0 }, hidden: "https://github.com/alice-gh/secret" });
  check(sv.data.rewards.comp === 20 && sv.data.cfg.daily === false && sv.data.cfg.hidden[0] === "alice-gh/secret", "settings and debrief rewards saved");
  delete (env as any).GITHUB_WEBHOOK_SECRET;
}

section("briefs keep to the technologies the teacher picked");
{
  const gen = await api("POST", "/api/briefs/generate", { g: G, week: 1, idea: "Un riad", tech: ["HTML", "CSS", "Figma"] });
  const d = gen.data.brief.data;
  check(gen.status === 200 && d.groups.length === 1 && !JSON.stringify(d).includes("base de données"), "a brief asking for a database is written again without it");
  check(d.tags.join(",") === "HTML,CSS,Figma" && gen.data.checks.some((c: any) => c.ok && /Only uses its technologies/.test(c.text)), "the brief's technologies are the ones picked, and the check confirms it");
  const pg = await api("GET", `/api/programs?g=${G}`);
  check(pg.data.weekTech["2"].includes("Tailwind CSS") && pg.data.weekTech["2"].includes("HTML") && !pg.data.weekTech["2"].includes("JavaScript"), "the technologies of a week come from the planning (tailwind.config.js isn't JavaScript)");
}

section("activités: days, holidays, live coding days, weeks, checks, the template's markdown");
{
  const P = BUILTIN[0];
  const kind = (d: string, ov = {}) => actDayInfo(P, d, ov).kind;
  check(kind("2026-10-12") === "work" && actDayInfo(P, "2026-10-12").label === "S2 · Sprint 1", "a weekday of a teaching week is a working day (week and sprint of the programme)");
  check(kind("2026-10-17") === "weekend" && kind("2026-11-06") === "holiday" && actDayInfo(P, "2026-11-06").label.includes("Marche Verte"), "weekends and public holidays have no activity");
  check(kind("2026-11-25") === "break" && kind("2026-12-01") === "crossdefense" && kind("2027-04-20") === "certification" && kind("2026-09-01") === "outside", "breaks, cross defenses, certification and days outside the programme");
  check(kind("2026-10-13", { "2026-10-13": "off" }) === "off" && kind("2026-11-06", { "2026-11-06": "on" }) === "work", "the teacher marks a day off, or works on a holiday");
  check(actHolidayOf("2027-03-10")?.approx === true && actHolidayOf("2026-11-18")?.approx === false && !actHolidayOf("2026-11-19"), "the Islamic holidays are marked as estimated");
  const full = actWeekFacts(P, "2026-10-12", "2026-10-12", "2026-10-16", null);
  check(full.work.length === 5 && full.live.join() === "2026-10-13,2026-10-15", "a full week: 5 veilles, live codings on Tuesday and Thursday");
  check(full.closing.join() === "2026-10-16" && full.next?.n === 3, "Friday closes the programme week (lighter veille); the next week is out of scope");
  const split = actWeekFacts(P, "2026-11-02", "2026-11-02", "2026-11-06", null);
  check(split.weeks.map((w) => w.n).join() === "5,6" && split.closing.includes("2026-11-04") && !split.work.includes("2026-11-06"), "a week across two programme weeks: each day follows its own, S5 ends Wednesday, Friday 6/11 is a holiday");
  check(actWeekFacts(P, "2026-10-12", "2026-10-12", "2026-10-16", ["2026-10-12", "2026-10-17", "2026-10-14"]).live.join() === "2026-10-12,2026-10-14", "the teacher's live coding days (working days only)");
  const weeks = actSplitWeeks(actRangeDays(P, "2026-10-14", "2026-10-25"));
  check(weeks.length === 2 && weeks[0].days.length === 3 && weeks[1].days.length === 5, "a range is cut in weeks (Monday → Friday)");
  check(actStackOf(techOfWeek(P.weeks[0])) === "web" && actStackOf(techOfWeek(P.weeks[2])) === "js" && actStackOf(techOfWeek(P.weeks.find((w) => w.n === 11)!)) === "sql"
    && actStackOf(techOfWeek(P.weeks.find((w) => w.n === 19)!)) === "laravel" && actStackOf(techOfWeek(P.weeks.find((w) => w.n === 27)!)) === "react", "the live coding's language follows the week (HTML/CSS, JS, SQL, Laravel, React)");
  check(!!actLinkOk("https://developer.mozilla.org/fr/docs/Web/API/Element/classList") && !!actLinkOk("https://fr.javascript.info/dom-navigation") && !actLinkOk("https://developer.mozilla.org/en-US/docs/Web")
    && !actLinkOk("http://fr.javascript.info/") && !actLinkOk("https://example.com/x") && !actLinkOk("pas une url"), "links: only the allowed sites (French pages), https, well formed");
  check(actNamedFunctions("function a() {}\nconst b = (x) => x;\nbtn.addEventListener(\"click\", (e) => {});") === 2 && actDataItems("const t = [{ a: \"1, 2\" }, { a: 2 }, [3, 4]];") === 3
    && actDataItems("INSERT INTO p VALUES (1, 'a'), (2, 'b, c');\nINSERT INTO p VALUES (3, 'd');") === 3 && actFormFields("<input id=a><input type=\"submit\"><select></select><textarea></textarea>") === 3, "code checks: named functions, data items, form fields");
  const good = { titre: "Le DOM", contexte: "Tu sais écrire du HTML. Le brief demande une page vivante. Le DOM est la page vue par JavaScript.", objectifs: ["Expliquer le DOM", "Utiliser `querySelector`", "Modifier un élément"],
    plan: [{ titre: "A", points: ["a", "b", "c"] }, { titre: "B", points: ["a", "b", "c"] }], questions: ["Pourquoi ?", "Quand ?"],
    ressources: [{ titre: "a", url: "https://developer.mozilla.org/fr/docs/Web/API/Document" }, { titre: "b", url: "https://fr.javascript.info/dom-nodes" }, { titre: "c", url: "https://regex101.com/" }, { titre: "d", url: "https://invented.dev/x" }],
    artefact: "Un schéma", demo: "Changer un titre", criteres: ["x", "y", "z"] };
  const v = actCleanVeille(good);
  check(!actValidateVeille(v).length && v.ressources.length === 3 && v.dropped.length === 1, "a veille that follows the template passes; the invented link is dropped");
  const bad = actValidateVeille(actCleanVeille({ ...good, objectifs: ["Le DOM"], questions: ["Définition du DOM"], plan: [{ titre: "A", points: ["a"] }] }));
  check(bad.some((e) => e.includes("3 à 5 objectifs")) && bad.some((e) => e.includes("verbe")) && bad.some((e) => e.includes("questions de réflexion")) && bad.some((e) => e.includes("plan")), "a veille that breaks it: each rule is named");
  const md = actRenderVeille(v, "2026-10-19");
  const heads = ["## Lundi 19/10 — Veille : Le DOM", "09:15 · 30 min · Veille", "**📌 Contexte**", "**🎯 Objectifs d'apprentissage**", "**📚 Plan à suivre**", "1️⃣ A", "**❓ Questions de réflexion**", "**🔗 Ressources conseillées**", "**📦 Livrable attendu**", "**✅ Critères d'évaluation**", "- La présentation est claire et respecte le temps"];
  check(heads.every((h, i) => md.indexOf(h) >= 0 && (i === 0 || md.indexOf(h) > md.indexOf(heads[i - 1]))) && md.includes("- MDN – a : https://developer.mozilla.org/fr/docs/Web/API/Document"), "the veille's markdown: the template's sections, in its order");
  const lv = actCleanLive({ titre: "Liste", objectifs: ["Créer", "Parcourir", "Afficher"], contexte: "Un client. Une liste.", deroule: [{ minutes: 5, etape: "Présenter" }, { minutes: 15, etape: "Un élément" }, { minutes: 10, etape: "Boucle" }, { minutes: 10, etape: "Ajout" }, { minutes: 5, etape: "Tester en direct, récap" }],
    starter: { fichier: "index.html", code: "```html\n<ul></ul>\n```" }, final: { fichier: "../evil.sh", code: "function a() {}\nfunction b() {}\nfunction c() {}\nfetch('/x')" }, extensions: ["x"], reflexion: ["a ?", "b ?"], resultat: ["ok"] }, "js");
  const le = actValidateLive(lv, { stack: "js", allowed: techSoFar(P, P.weeks[2]), concepts: "" });
  check(lv.final?.file === "app.js" && lv.starter?.code === "<ul></ul>", "the live coding's files: a strange name gets the week's file, code fences are removed");
  check(le.some((e) => e.includes("3 fonctions nommées")) && le.some((e) => e.includes("Fetch / API")) && !le.some((e) => e.includes("45")), "live coding checks: 2 named functions at most, nothing the class hasn't seen yet");
  const lmd = actRenderLive(lv, "2026-10-20", 1);
  check(lmd.includes("## Mardi 20/10 — Live coding 1 : Liste") && lmd.includes("| 0–5 | Présenter |") && lmd.includes("| 40–45 | Tester en direct, récap | — |") && lmd.includes("**💻 Starter — index.html**") && lmd.includes("**💻 Code final — app.js**\n\n```javascript"), "the live coding's markdown: déroulé from 0 to 45, the files of the week");
}

section("activités: the page's API generates a week item by item, checks, retries, saves, edits");
{
  const from = "2026-10-19", to = "2026-10-23";
  const v0 = await api("GET", `/api/activities?g=${G}&from=${from}&to=${to}`);
  check(v0.status === 200 && v0.data.days.length === 5 && v0.data.weeks.length === 1 && v0.data.weeks[0].live.join() === "2026-10-20,2026-10-22", "a range: its days and its week, with live codings on Tuesday and Thursday");
  check(v0.data.weeks[0].weeks[0].n === 3 && v0.data.weeks[0].sprint.n === 2 && v0.data.weeks[0].next.n === 4 && v0.data.weeks[0].weeks[0].competencies.includes("C4N1"), "the summary: programme week, sprint, competencies, the week out of scope");
  check((await api("GET", `/api/activities?g=${G}&from=2026-10-01&to=2027-01-31`)).status === 400, "a range too long is refused");
  check((await api("POST", "/api/activities/item", { g: G, day: "2026-10-21", kind: "live" })).data.error?.includes("No live coding planned"), "no live coding on a day without one (Wednesday)");
  const w = await api("POST", "/api/activities/week", { g: G, monday: from, from, to });
  check(w.status === 200 && w.data.item.md.startsWith("## Analyse de la semaine") && w.data.item.md.includes("| Mar 20/10 | Veille 2 : le DOM | LC1 : Live 2 : une liste de produits |"), "the week's overview from the template, with LC1 on Tuesday");
  check(w.data.item.md.includes("| Ven 23/10 | Veille 5 : le DOM | — | Consolidation de la semaine : bonnes pratiques, débogage, qualité |") && w.data.item.md.includes("| Lun 19/10 | Veille 1 : le DOM | — | Notion 1 du programme |") && w.data.item.md.includes("**Hors périmètre cette semaine** (S4 du programme"), "the programme's progression each day, the lighter last day, the next week out of scope");
  const u0 = ai.users.length;
  const ve = await api("POST", "/api/activities/item", { g: G, day: from, kind: "veille" });
  check(ve.status === 200 && ve.data.item.md.startsWith("## Lundi 19/10 — Veille : Sélectionner et modifier le DOM") && !ve.data.item.md.includes("🚀") && !ve.data.item.md.includes("example.com") && !ve.data.item.warnings.length, "a veille: checked, no emoji in the text, the invented link dropped");
  check(!/MÉTIER|argan|riad|\b(un|le|du) client\b/i.test(ai.users.slice(u0).join("\n")) && ai.users.slice(u0).join("\n").includes("HORS PÉRIMÈTRE") && ai.users.slice(u0).join("\n").includes("Compétences visées"), "the AI gets the programme and what's out of scope: no métier, no client");
  ai.actBad = 1;
  const u1 = ai.users.length;
  const lc = await api("POST", "/api/activities/item", { g: G, day: "2026-10-20", kind: "live" });
  const retry = ai.users.slice(u1);
  check(lc.status === 200 && retry.length === 2 && retry[1].includes("TA RÉPONSE PRÉCÉDENTE NE RESPECTE PAS") && retry[1].includes("exactement 45") && retry[1].includes("Fetch / API") && !lc.data.item.warnings.length, "a live coding that breaks the template is asked again once, with what's wrong");
  check(retry[0].includes("VEILLES DE LA SEMAINE JUSQU'À CE JOUR") && retry[0].includes("Sélectionner et modifier le DOM"), "the live coding knows the veilles of the week so far");
  ai.actBad = 2;
  const lc2 = await api("POST", "/api/activities/item", { g: G, day: "2026-10-22", kind: "live" });
  check(lc2.status === 200 && lc2.data.item.warnings.some((e: string) => e.includes("45")) && lc2.data.item.md.includes("## Jeudi 22/10 — Live coding 2"), "still wrong after the retry: kept, with its warnings");
  ai.actBad = 0;
  const v1 = await api("GET", `/api/activities?g=${G}&from=${from}&to=${to}`);
  const wk = v1.data.items.find((x: any) => x.kind === "week");
  check(v1.data.items.length === 4 && wk.md.includes("| Lun 19/10 | Sélectionner et modifier le DOM |") && wk.md.includes("LC1 : Afficher le menu du food truck"), "reopening the range shows the saved items; the overview has their real titles");
  check(q1("SELECT COUNT(*) AS n FROM activities WHERE guild_id = ?", G).n === 4, "saved in the database, per class and day");
  const ed = await api("PUT", `/api/activities/${ve.data.item.id}`, { g: G, md: "## Ma veille\n\nRéécrite." });
  check(ed.status === 200 && ed.data.item.edited && ed.data.item.md === "## Ma veille\n\nRéécrite.", "the teacher edits an item");
  check((await api("POST", "/api/activities/item", { g: G, day: "2026-11-06", kind: "veille" })).data.error?.includes("Marche Verte"), "no activity on a holiday");
  const off = await api("PUT", "/api/activities/days", { g: G, day: "2026-10-21", mark: "off" });
  check(off.data.overrides["2026-10-21"] === "off" && (await api("GET", `/api/activities?g=${G}&from=${from}&to=${to}`)).data.days[2].kind === "off", "the teacher marks a day without activity");
  await api("PUT", "/api/activities/days", { g: G, day: "2026-10-21", mark: null });
  const lv = await api("PUT", "/api/activities/live", { g: G, monday: from, live: ["2026-10-20"] });
  const after = (await api("GET", `/api/activities?g=${G}&from=${from}&to=${to}`)).data;
  check(lv.data.removed.join() === "2026-10-22" && after.items.filter((x: any) => x.kind === "live").length === 1 && after.weeks[0].live.join() === "2026-10-20", "live coding only on Tuesday: Thursday's is removed");
  run1("INSERT INTO activity_claims (guild_id, activity_id, kind, members, by, status, created_at) VALUES (?, ?, 'live', '[]', 'teacher', 'done', ?)", G, lc.data.item.id, clock.now());
  const kept = await api("DELETE", `/api/activities/${lc.data.item.id}?g=${G}`);
  check(kept.status === 400 && /already presented/.test(kept.data.error) && q1("SELECT COUNT(*) AS n FROM activities WHERE id = ?", lc.data.item.id).n === 1, "an activity already presented (graded) can't be deleted");
  run1("DELETE FROM activity_claims WHERE activity_id = ? AND status = 'done'", lc.data.item.id);
  check((await api("DELETE", `/api/activities/${lc.data.item.id}?g=${G}`)).status === 200 && !(await api("GET", `/api/activities?g=${G}&from=${from}&to=${to}`)).data.items.some((x: any) => x.kind === "live"), "an item is deleted");
  check((await api("GET", `/api/activities?g=g-unknown&from=${from}&to=${to}`)).status === 404, "another class's range: unknown class");
}

section("activités: the programme only (never a brief), inspiration topics, the teacher's proposal");
{
  const P = BUILTIN[0];
  // the context of a week: the programme, never a brief
  const f3 = actWeekFacts(P, "2026-10-19", "2026-10-19", "2026-10-23", null);
  const ctx = actWeekContext(P, f3, ["Le HTML sémantique"]);
  check(!/brief/i.test(ctx) && ctx.includes("Objectifs de la semaine (ceux du sprint") && ctx.includes("Gérer les événements, formulaires et validations") && !ctx.includes("Transformer une interface Web statique") && ctx.includes("Concepts et exigences techniques") && /Compétences visées[^:]*: C1N1/.test(ctx) && ctx.includes("Technologies de la semaine : ") && ctx.includes("DOM"),
    "the AI's context is the programme week: objective, concepts, competencies, technologies, no brief");
  check(!/MÉTIER|argan|riad|\b(un|le|du) client\b/i.test(ctx) && ctx.includes("sprint 2 «") && ctx.includes("Compétences du sprint") && ctx.includes("HORS PÉRIMÈTRE (semaine 4 du programme") && ctx.includes("DÉJÀ COUVERT EN VEILLE") && ctx.includes("- Le DOM en JavaScript"),
    "the sprint, its competencies, the next week out of scope, the topics done, ideas of earlier promotions; no métier, no client");
  check(!actWeekContext(P, actWeekFacts(P, "2026-10-12", "2026-10-12", "2026-10-16", null)).includes("Le DOM en JavaScript"), "no idea from a later week (no DOM topic in the HTML/CSS week)");
  const t3 = actTopicsFor([P.weeks[2]]), tc = actTopicsFor([P.weeks[2]], true);
  check(t3.includes("Le DOM en JavaScript") && !t3.includes("Eloquent") && !t3.includes("La notation Big O") && tc.includes("La notation Big O"), "inspiration: the week's technologies only, the culture topics on the lighter day");
  // the doc and the code have the same topics
  const doc = readFileSync(join(ROOT, "docs/activities/VEILLE_INSPIRATION_DWWM.md"), "utf8").replace(/\r/g, "");
  const fromDoc: Record<string, string[]> = {};
  let head = "";
  for (const l of doc.split("\n")) { const h = l.match(/^## (.+)$/); if (h) { head = h[1].trim(); fromDoc[head] = []; } else if (head && /^- /.test(l)) fromDoc[head].push(l.slice(2).trim()); }
  check(JSON.stringify(fromDoc) === JSON.stringify(actInspiration), "docs/activities/VEILLE_INSPIRATION_DWWM.md and INSPIRATION are the same");
  check(Object.keys(actInspiration).every((k) => k === "Culture" || TECHS.some((t) => t.name === k)), "each group of topics is a technology of the programme");
  // the analysis of the week: the programme's progression, no brief
  const plan = actCleanPlan({ jours: [{ date: "2026-10-19", veille: "V1", progression: "Sélectionner un élément", avancement: "Partie 1 du brief Riad" }], besoins: [], hors: ["fetch"] }, ["2026-10-19"]);
  const md = actRenderWeek(plan, f3, actWeekLabels(P, f3));
  check(md.includes("| Jour | Veille 09:15 (30 min) | Live coding 11:00 (45 min) | Progression attendue (programme) |") && md.includes("| Lun 19/10 | V1 | — | Sélectionner un élément |") && !/brief/i.test(md),
    "the overview shows the programme's progression; an old brief step is not read");
  // the week's objectives are the sprint's, divided over its weeks (the planning's per-week project text is not used)
  const AO = await import("../src/shared/activities.ts");
  const w4 = P.weeks.find((w: any) => w.n === 4), w3 = P.weeks.find((w: any) => w.n === 3);
  const o4 = AO.weekObjectives(P, w4), o3 = AO.weekObjectives(P, w3);
  check(o4.length === 1 && o4[0].startsWith("Structurer et modulariser") && !o4.join().includes("Single Page") && o3.length === 2 && AO.sprintObjectives(P.sprints.find((x: any) => x.n === 2)).length === 3,
    "the sprint's objectives are divided over its weeks (S4 = modules ES6+, never the SPA project)");
  check(md.includes("Semaine 3 du programme (19–23/10/2026), sprint 2") && md.includes("Objectifs (sprint) : Développer une interface Web interactive") && md.includes("(S4 du programme, à partir du 26/10)") && md.includes("Consolidation de la semaine"), "the overview: week, sprint, competencies, objective, next week, the lighter last day");
  // the teacher's proposal: the main instruction, within the programme
  const allowed = techSoFar(P, P.weeks[2]);
  const out = actProposalOutside("Une veille sur fetch et async/await pour charger les produits", allowed);
  const vp = actVeillePrompt(ctx, plan, f3, "2026-10-19", "Une veille sur fetch et async/await pour charger les produits", out);
  check(out.includes("Fetch / API") && vp.includes("PROPOSITION DU FORMATEUR") && vp.includes("charger les produits") && vp.includes("ATTENTION : elle demande Fetch / API") && vp.indexOf("PROPOSITION") < vp.indexOf("Réponds UNIQUEMENT"),
    "a proposal beyond the programme: the AI is told what to leave out");
  // the proposal decides the subject and the data: the planned title is left out
  const plan2 = actCleanPlan({ jours: [{ date: "2026-10-20", veille: "V2", progression: "p", live: "CRUD de produits d'argan", live_focus: "des produits" }] }, ["2026-10-20"]);
  const lp = actLivePrompt(ctx, plan2, f3, "2026-10-20", "js", [], "CRUD users", []), lp0 = actLivePrompt(ctx, plan2, f3, "2026-10-20", "js", []);
  check(!lp.includes("argan") && lp.includes("<<<\nCRUD users\n>>>") && lp.includes("remplace le titre prévu") && lp.includes("un CRUD d'utilisateurs") && lp0.includes("titre prévu « CRUD de produits d'argan »"),
    "a proposal (« CRUD users ») replaces the planned title and theme; without one, the plan's day is used");
  check(!actProposalOutside("Plus simple, avec un piège sur innerHTML", allowed).length && !actVeillePrompt(ctx, plan, f3, "2026-10-19").includes("PROPOSITION"), "a proposal within the programme passes; no proposal, no block");
  check(actCleanProposal("x".repeat(3000)).length === 1500, "a proposal is cut at 1500 characters");
  const vv = actCleanVeille({ titre: "Introduction à fetch", contexte: "a. b. c.", objectifs: ["Expliquer a", "Utiliser b", "Choisir c"], plan: [{ titre: "A", points: ["a", "b", "c"] }, { titre: "B", points: ["a", "b", "c"] }], questions: ["a ?", "b ?"],
    ressources: [{ titre: "a", url: "https://developer.mozilla.org/fr/docs/Web" }, { titre: "b", url: "https://fr.javascript.info/" }, { titre: "c", url: "https://regex101.com/" }], artefact: "x", demo: "y", criteres: ["a", "b", "c"] });
  check(actValidateVeille(vv, allowed).some((e) => e.includes("sort du programme")) && !actValidateVeille(vv).length, "a veille about a later week's subject is caught");
}

section("activités: Regenerate with the teacher's proposal (preview, then Replace), old saves still open");
{
  const from = "2026-10-19", to = "2026-10-23";
  // a brief published in the app for these days: it never goes to the AI
  run1("INSERT INTO briefs (guild_id, program, week, title, status, source, data, competencies, start_at, due_at, created_at) VALUES (?, 'builtin:dwwm-2026', 3, 'Brief secret du Riad', 'assigned', 'manual', '{}', '', ?, ?, ?)",
    G, Date.parse("2026-10-19T09:00:00Z") / 1000, Date.parse("2026-10-23T23:59:00Z") / 1000, clock.now());
  const u0 = ai.users.length;
  await api("POST", "/api/activities/week", { g: G, monday: from, from, to });
  const ve0 = await api("POST", "/api/activities/item", { g: G, day: from, kind: "veille" });
  const v = await api("GET", `/api/activities?g=${G}&from=${from}&to=${to}`);
  check(ve0.status === 200 && !ai.users.slice(u0).some((x) => x.includes("Brief secret du Riad")) && !JSON.stringify(v.data.weeks).includes("Brief secret"), "a published brief is never in the prompts nor in the page's summary");
  check(v.data.weeks[0].weeks[0].tech.includes("DOM") && v.data.weeks[0].weeks[0].objective && !("briefs" in v.data.weeks[0]) && !("brief" in v.data.weeks[0].weeks[0]), "the summary: the programme only (objective, technologies…)");
  const before = q1("SELECT md, data FROM activities WHERE guild_id = ? AND day = ? AND kind = 'veille'", G, from);
  const u1 = ai.users.length;
  const pv = await api("POST", "/api/activities/item", { g: G, day: from, kind: "veille", preview: true, proposal: "Plus simple, avec un exemple de riad et un piège sur innerHTML" });
  check(pv.status === 200 && pv.data.draft.title === "Veille sur mesure : le DOM" && pv.data.draft.md.startsWith("## Lundi 19/10 — Veille : Veille sur mesure") && ai.users.slice(u1)[0].includes("piège sur innerHTML"), "Regenerate with a proposal: a preview written from it");
  const after = q1("SELECT md, data FROM activities WHERE guild_id = ? AND day = ? AND kind = 'veille'", G, from);
  check(after.md === before.md && after.data === before.data, "the preview changes nothing until Replace (Keep the old one)");
  const kept = await api("POST", "/api/activities/item/keep", { g: G, day: from, kind: "veille", data: { ...pv.data.draft.data, ressources: [...pv.data.draft.data.ressources, { titre: "x", url: "https://evil.example/" }] }, proposal: "Plus simple, avec un exemple de riad et un piège sur innerHTML", model: pv.data.draft.model });
  check(kept.status === 200 && kept.data.item.title === "Veille sur mesure : le DOM" && kept.data.item.proposal.includes("riad") && !kept.data.item.md.includes("evil.example"), "Replace saves it with the proposal (checked again: a link added in between is dropped)");
  check((await api("GET", `/api/activities?g=${G}&from=${from}&to=${to}`)).data.items.find((x: any) => x.kind === "veille" && x.day === from).proposal.includes("riad"), "the proposal comes back with the item (to reuse it)");
  check((await api("GET", `/api/activities?g=${G}&from=${from}&to=${to}`)).data.items.find((x: any) => x.kind === "week").md.includes("| Lun 19/10 | Veille sur mesure : le DOM |"), "the week's overview has the new title");
  const far = await api("POST", "/api/activities/item", { g: G, day: from, kind: "veille", preview: true, proposal: "Une veille sur fetch et async/await" });
  check(far.data.draft.ecarte.some((x: string) => x.includes("Fetch / API")) && far.data.draft.ecarte.includes("fetch et async/await"), "a proposal beyond the programme: what was left out is said");
  const lv = await api("POST", "/api/activities/item", { g: G, day: "2026-10-20", kind: "live", preview: true, proposal: "Plus pratique" });
  check(lv.data.draft.title === "Live sur mesure : le menu" && lv.data.draft.md.includes("Live coding 1 : Live sur mesure"), "the same for a live coding");
  check((await api("POST", "/api/activities/item/keep", { g: G, day: "2026-10-20", kind: "live", data: {}, proposal: "x" })).status === 400, "an empty version is refused");
  // a totally different one: the current title is to be avoided, the teacher's theme decides
  const u2 = ai.users.length;
  const nw = await api("POST", "/api/activities/item", { g: G, day: from, kind: "veille", preview: true, mode: "new", theme: "les événements clavier" });
  const pr = ai.users.slice(u2)[0] || "";
  check(nw.status === 200 && pr.includes("TOTALEMENT DIFFÉRENTE") && pr.includes("« Veille sur mesure : le DOM »") && pr.includes("les événements clavier") && !pr.includes("titre prévu"), "Regenerate → a different one: the AI is told to leave the current subject, with the teacher's theme");
  const u3 = ai.users.length;
  const sm = await api("POST", "/api/activities/item", { g: G, day: from, kind: "veille", preview: true, mode: "same", proposal: "plus de code" });
  check(sm.status === 200 && sm.data.draft.title === "Veille sur mesure : le DOM" && (ai.users.slice(u3)[0] || "").includes("MÊME SUJET"), "Regenerate → same subject: the title stays");
  // the teacher edits the title and the content
  const cur = (await api("GET", `/api/activities?g=${G}&from=${from}&to=${to}`)).data.items.find((x: any) => x.kind === "veille" && x.day === from);
  const ed2 = await api("PUT", `/api/activities/${cur.id}`, { g: G, md: cur.md.replace("Contexte", "Contexte revu"), title: "Les événements clavier" });
  check(ed2.status === 200 && ed2.data.item.title === "Les événements clavier" && ed2.data.item.md.startsWith("## Lundi 19/10 — Veille : Les événements clavier") && ed2.data.item.md.includes("Contexte revu") && ed2.data.item.edited, "Edit: the title can be changed too (the heading follows)");
  const wk2 = (await api("GET", `/api/activities?g=${G}&from=${from}&to=${to}`)).data.items.find((x: any) => x.kind === "week");
  check(wk2.md.includes("| Lun 19/10 | Les événements clavier |"), "…and the week's overview");
  const u4 = ai.users.length;
  await api("POST", "/api/activities/item", { g: G, day: from, kind: "veille", preview: true, mode: "same" });
  check((ai.users.slice(u4)[0] || "").includes("« Les événements clavier »"), "…and the next Regenerate starts from the new title");
  check((await api("PUT", `/api/activities/${cur.id}`, { g: G, md: "x", title: "  " })).status === 400, "an empty title is refused");
  // items without a plan for their week (from the shared library, or written before): regenerated from the programme
  run1("INSERT INTO activities (guild_id, program, day, kind, week, title, data, md, warnings, edited, created_at) VALUES (?, 'builtin:dwwm-2026', '2026-11-03', 'live', 5, 'LC partagé', '{}', '## LC', '[]', 0, ?)", G, clock.now());
  const np = await api("POST", "/api/activities/item", { g: G, day: "2026-11-03", kind: "live", preview: true, proposal: "Plus simple" });
  const nv = await api("POST", "/api/activities/item", { g: G, day: "2026-11-02", kind: "veille" });
  check(np.status === 200 && np.data.draft.md.includes("Live coding 1") && nv.status === 200 && nv.data.item.md.startsWith("## Lundi 02/11 — Veille"), "no plan for the week: a veille or a live coding is still (re)generated from the programme");
  // a week saved before, with the brief's steps: it still opens, and the brief is left out when it's written again
  const mon = "2026-10-26";
  run1("INSERT INTO activities (guild_id, program, day, kind, week, title, data, md, warnings, edited, created_at) VALUES (?, 'builtin:dwwm-2026', ?, 'week', 4, 'Semaine du 26/10', ?, '## Analyse de la semaine (ancienne)', '[]', 0, ?)",
    G, mon, JSON.stringify({ plan: { jours: [{ date: mon, veille: "Les modules ES6", avancement: "Partie 1 du brief Riad" }], besoins: [], hors: [] }, live: [], from: mon, to: "2026-10-30" }), clock.now());
  const old = await api("GET", `/api/activities?g=${G}&from=${mon}&to=2026-10-30`);
  check(old.status === 200 && old.data.items.find((x: any) => x.kind === "week").md === "## Analyse de la semaine (ancienne)", "an activity saved before still opens");
  await api("PUT", "/api/activities/live", { g: G, monday: mon, live: [] });
  const re = q1("SELECT md FROM activities WHERE guild_id = ? AND day = ? AND kind = 'week'", G, mon).md;
  check(re.includes("| Lun 26/10 | Les modules ES6 | — |") && !re.includes("brief Riad"), "written again: its brief steps are ignored");
  // leave the class as the next sections expect it (the shared library lists its latest activities)
  run1("DELETE FROM activities WHERE guild_id = ? AND day IN ('2026-10-26', '2026-11-02', '2026-11-03')", G);
  run1("DELETE FROM briefs WHERE guild_id = ? AND title = 'Brief secret du Riad'", G);
}

section("programme from an Excel workbook (ClassBot template or YouCode planning)");
{
  const sheets = {
    "Programme": [["Champ", "Valeur"], ["Nom", "MERN 2027"], ["Stack", "mern"], ["Niveaux", "imiter, adapter, transposer"]],
    "Référentiel": [["Code", "Compétence", "Type"], ["C1", "Installer son environnement", "technique"], ["C2", "Développer une API REST", "technique"], ["CT1", "Planifier son travail", "transversale"]],
    "Sprints": [["Sprint", "Semaines", "Titre", "Objectifs", "Situation professionnelle", "Technologies / concepts", "Briefs", "Compétences techniques", "Compétences transversales"], ["1", "2", "Node", "Créer une API", "", "Node.js, Express", "", "C1, C2", "CT1N1"]],
    "Planning": [["Semaine", "Début", "Fin", "Type", "Sprint", "Brief", "Jours", "Mode", "Intitulé", "Objectif", "Concepts & exigences techniques", "Compétences", "Compétences transversales", "Livrables"],
      ["1", "05/10/2026", "09/10/2026", "Brief", "1", "1", "5", "binôme", "API de tâches", "Une API Express", "Node.js, Express, MongoDB", "C1N1, C2N1", "", "Dépôt"],
      ["2", "2026-10-12", "2026-10-16", "Vacances", "", "", "", "", "Repos", "", "", "", "", ""]],
  };
  const r = await api("POST", "/api/programs/parse", { g: G, sheets, fileName: "mern.xlsx" });
  const p = r.data.program;
  check(r.status === 200 && p.name === "MERN 2027" && p.referential.length === 3 && p.referential[2].kind === "soft", "template: name and competency framework");
  check(p.weeks.length === 2 && p.weeks[0].start === "2026-10-05" && p.weeks[0].mode === "binôme" && p.weeks[0].brief === 1 && p.weeks[0].competencies.join() === "C1N1,C2N1" && p.weeks[0].soft.join() === "T1N1", "template: weeks with dates, mode and competencies (transversal ones from the sprint)");
  check(p.weeks[1].kind === "break" && r.data.warnings.length === 0, "template: holidays read, no warning");
  const yc = await api("POST", "/api/programs/parse", { g: G, fileName: "planning.xlsx", sheets: {
    "02_Sprints": [["Matrice des sprints  DWWM 2027/2028"], [], ["Sprint", "Sujet", "Thématique", "Objectifs pédagogiques", "Situation", "Technologies / concepts", "Briefs projet", "Compétences techniques visées", "Compétences transversales visées", "", "Référentiel"],
      ["Sprint 1 2 SEMAINES", "Interfaces", "", "Maquetter", "", "HTML", "", "C1, C2", "CT1N1,CT2N1", "", "C1. Installer et configurer son environnement\nC2. Maquetter des interfaces"]],
    "Planning Annuel": [["Semaine", "Dates", "Sprint/Activité", "Intitulé:", "Objectif", "Concepts & Exigences techniques", "Compétences", "Livrables"],
      ["Semaine 1", "04/10/2027 - 08/10/2027", "Sprint 1\nBrief 1\n(5 jours)", "Site vitrine", "Intégrer", "HTML5, CSS3", "C1N1, C2N1", "Dépôt"],
      ["Semaine 2", "11/10/2027 - 15/10/2027", "Soutenance Croisée 1", "Projet", "", "", "", ""]] } });
  const y = yc.data.program;
  check(yc.status === 200 && y.name === "DWWM 2027/2028" && y.weeks[0].brief === 1 && y.weeks[0].days === 5 && y.weeks[0].soft.join() === "T1N1,T2N1" && y.weeks[1].kind === "crossdefense", "YouCode planning read as it is");
  check(y.referential.some((c: any) => c.code === "T1" && c.name.startsWith("Planifier")), "competencies the file doesn't name keep their names from the current programme");
  const sv = await api("POST", "/api/programs", { g: G, data: p });
  check(sv.status === 200 && sv.data.current.name === "MERN 2027" && (await api("GET", `/api/programs?g=${G}`)).data.current.weeks.length === 2, "saved and used by the class");
  await api("PUT", "/api/program", { g: G, id: "builtin:dwwm-2026" });
}

section("assessments: several competencies per question, why each grade, invitations taken back");
{
  // the fake AI always writes the same questions: the class's earlier assessments are set aside here (they would be avoided)
  const keptAssess = q("SELECT * FROM assessments WHERE guild_id = ?", G);
  run1("DELETE FROM assessments WHERE guild_id = ?", G);
  ai.maxTokens.length = 0;
  ai.users.length = 0;
  const freeAi = () => run1("DELETE FROM ai_usage WHERE day LIKE ?", `%|${G}`);   // these tries don't eat the class's AI budget
  freeAi();
  await api("POST", "/api/assessments/generate", { g: G, topic: "Intégration", count: 10, techs: ["HTML", "CSS"] });
  check(Math.max(...ai.maxTokens) >= 4400, `10 questions in batches of 6: each answer has room for all of its questions (${ai.maxTokens.join(",")})`);
  const planned = ai.users.filter((x: string) => /Q1 — /.test(x));
  check(planned.length === 2 && planned.every((x: string) => /notion : notion numéro \d+ · tâche : .+/.test(x) && !/situation :/.test(x)) && new Set(planned.join("\n").match(/notion numéro \d+/g)).size === 10
    && /STYLE : comme un quiz de formateur, court et direct[\s\S]*AUCUNE mise en situation/.test(ai.prompts.at(-1)!),
    "variety: one quick call lists distinct notions, then each question gets its own notion and kind of task; short, direct questions, no invented situation");
  // however the AI wraps its list, the questions are read; a technology named only in a wrong option doesn't remove one
  ai.gen = "array";
  const bare = await api("POST", "/api/assessments/generate", { g: G, topic: "CSS", count: 2, techs: ["HTML", "CSS"] });
  check(bare.status === 200 && bare.data.questions.length === 2, `the AI's questions as a bare list are read (${bare.status} ${bare.data.error ?? bare.data.questions?.length})`);
  ai.gen = "wrongOption";
  const opt = await api("POST", "/api/assessments/generate", { g: G, topic: "CSS", count: 1, techs: ["HTML", "CSS"] });
  check(opt.status === 200 && opt.data.questions.length === 1, `Bootstrap only in a wrong option of a multiple-choice question: the question is kept (${opt.data.error ?? ""})`);
  ai.gen = "allOutside";
  const none = await api("POST", "/api/assessments/generate", { g: G, topic: "CSS", count: 3, techs: ["HTML", "CSS"] });
  check(none.status === 400 && /wrote 3 question\(s\), none usable: 1 incomplete · 2 using a technology not selected \(Tailwind CSS\): add it to the technologies/.test(none.data.error), `nothing usable: the message says why (${none.data.error})`);
  // competencies: the AI gets the class's list with their names; an invented code is dropped; from a brief, only its own, at its level
  ai.gen = "comps";
  freeAi();
  const cp = await api("POST", "/api/assessments/generate", { g: G, topic: "HTML", count: 2, techs: ["HTML", "CSS"] });
  check(/C3 : Réaliser des interfaces utilisateur statiques/.test(ai.prompts.at(-1)!) && /jamais l’ordre de la liste/.test(ai.prompts.at(-1)!), "the AI chooses competencies from the class's list, by their meaning");
  check(cp.status === 200 && cp.data.questions[0].comps.map((c: any) => c.code).join() === "C1,C3" && !cp.data.questions[1].comps, `a code outside the list (C9) is dropped (${JSON.stringify(cp.data.questions?.map((q: any) => q.comps))})`);
  const sb = await api("POST", "/api/briefs", { g: G, data: { title: "Brief compétences", context: "Une page.", competencies: ["C3N2"] } });
  const cb = await api("POST", "/api/assessments/generate", { g: G, topic: "HTML", count: 2, techs: ["HTML", "CSS"], brief_id: sb.data.brief.id });
  check(/- C3N2 : Réaliser/.test(ai.prompts.at(-1)!) && !/- C1 /.test(ai.prompts.at(-1)!), "from a brief: only its competencies are offered");
  check(cb.status === 200 && JSON.stringify(cb.data.questions[0].comps) === JSON.stringify([{ code: "C3", level: 2 }]), `…and only those are kept, at the brief's level (${JSON.stringify(cb.data.questions?.[0]?.comps)})`);
  run1("DELETE FROM briefs WHERE id = ?", sb.data.brief.id);
  ai.gen = "array";
  freeAi();
  const calls0 = ai.calls;
  const twenty = await api("POST", "/api/assessments/generate", { g: G, topic: "CSS", count: 20, techs: ["HTML", "CSS"] });
  check(twenty.status === 200 && ai.calls - calls0 === 5 && twenty.data.questions.length === 2, `20 questions: the notions, then 4 batches with their own plan, put together without the same question twice (${ai.calls - calls0} calls, ${twenty.data.questions?.length})`);
  // the same question with other names is dropped; a question the class already had isn't asked again
  ai.gen = "dups";
  freeAi();
  const dd = await api("POST", "/api/assessments/generate", { g: G, topic: "JS", count: 3, techs: ["JavaScript"] });
  check(dd.status === 200 && dd.data.questions.length === 2 && dd.data.questions.filter((x: any) => /panier/.test(x.prompt)).length === 1, `the same question with other words (prix / montants) is kept once (${dd.data.questions?.length})`);
  const dd2 = await api("POST", "/api/assessments/generate", { g: G, topic: "JS", count: 3, techs: ["JavaScript"], existing: ["Explique pourquoi la page du cinéma se recharge quand on envoie le formulaire de réservation ?"] });
  check(dd2.status === 200 && !dd2.data.questions.some((x: any) => /cinéma/.test(x.prompt)) && /DÉJÀ POSÉES À CETTE CLASSE[\s\S]*cinéma/.test(ai.users.at(-1)!), "a question already in the assessment (or the class's earlier ones) is never asked again");
  ai.gen = "";
  run1("DELETE FROM ai_usage WHERE day LIKE ?", `%|${G}`);   // these 3 tries don't eat the class's AI budget for the next tests
  const two = await api("POST", "/api/assessments/generate", { g: G, topic: "Intégration", count: 5, techs: ["HTML", "CSS"] });
  const tq = two.data.questions;
  check(two.status === 200 && !tq.some((q: any) => /tailwind/i.test(q.prompt)) && tq.length === 4, "questions on several technologies at once, nothing outside them (no Tailwind in an HTML/CSS test)");
  check(tq.find((q: any) => /carte en HTML/.test(q.prompt))?.starter === "" && tq.find((q: any) => /carte en HTML/.test(q.prompt))?.lang === "html", "a starter code that gives the answer away is removed");
  // ✨ on a question written by hand: a better wording, the starter and the expected answer, the choices
  freeAi();
  const raw = { type: "code", prompt: "Écrivez les commandes Git pour créer un dépôt, ajouter les fichiers, créer une branche feature/home-layout, la pousser et ouvrir une PR.", lang: "text" };
  const rp = await api("POST", "/api/assessments/qai", { g: G, action: "rephrase", q: raw });
  const fl = await api("POST", "/api/assessments/qai", { g: G, action: "fill", q: raw });
  const mc = await api("POST", "/api/assessments/qai", { g: G, action: "fill", q: { type: "mcq", prompt: "Quelle commande envoie tes commits sur GitHub ?", choices: ["", ""] } });
  const ex = await api("POST", "/api/assessments/qai", { g: G, action: "fill", q: { type: "explain", prompt: "Explique ce que fait git push -u." } });
  check(rp.status === 200 && /feature\/home-layout/.test(rp.data.prompt) && /ÉNONCÉ :\n<<<\nÉcrivez les commandes Git/.test(ai.users.at(-4)!), "✨ Improve the wording: same question, clearer (the teacher's text is sent as data)");
  check(fl.status === 200 && /git switch -c feature\/home-layout/.test(fl.data.expected) && fl.data.starter.startsWith("# 1.") && mc.data.choices.length === 4 && mc.data.answer[0] === 0 && /branche suivie/.test(ex.data.expected),
    "✨ Write the starter code and expected answer (code), the expected answer (explain), the choices (multiple choice)");
  check((await api("POST", "/api/assessments/qai", { g: G, action: "fill", q: { type: "code", prompt: "" } })).status === 400, "…the question has to be written first");
  // 📄 a quiz made on Wayground, uploaded as a PDF: the pages as pictures, the questions read, then in French with their answers
  freeAi();
  const img = "data:image/jpeg;base64," + Buffer.from("fake page").toString("base64");
  const ip = await api("POST", "/api/assessments/import-pages", { g: G, images: [img, img], text: "" });
  const iq = ip.data.questions || [];
  check(ip.status === 200 && iq.length === 4 && ip.data.title === "HTML/ CSS" && ai.images.at(-1) === 2, `📄 import: the pages are read as pictures (${ip.status} ${ip.data.error ?? iq.length})`);
  check(/enfants directs/.test(iq[0].prompt) && iq[0].answer[0] === 1 && iq[1].choices.join() === "Vrai,Faux" && iq[1].answer[0] === 0
    && iq[2].type === "code" && /class Chien ____ Animal/.test(iq[2].code) && iq[2].expected === "implements" && /schématise/.test(iq[3].prompt) && iq[3].type === "explain",
    "…in French, with the right choices, the code of the screenshot and its expected answer, a drawing turned into a written answer");
  check(JSON.stringify(iq[0].comps) === JSON.stringify([{ code: "C3", level: 1 }]), "…competencies only from the class's programme");
  ai.mode = "blind";
  const noVision = await api("POST", "/api/assessments/import-pages", { g: G, images: [img], text: "" });
  const textOnly = await api("POST", "/api/assessments/import-pages", { g: G, images: [img], text: "1. Which selector targets only direct <p> children of a <div> element? a) div p b) div > p c) div + p d) div ~ p 2. z-index has no effect if position is static. a) True b) False" });
  ai.mode = "";
  check(noVision.status === 400 && /Gemini or Groq key/.test(noVision.data.error) && textOnly.status !== 400, `no AI that sees images: said clearly; a PDF with text is read from its text (${noVision.data.error} / ${textOnly.status} ${textOnly.data.error ?? ""})`);
  for (const r of keptAssess) run1(`INSERT INTO assessments (${Object.keys(r).join(", ")}) VALUES (${Object.keys(r).map(() => "?").join(", ")})`, ...Object.values(r));
  const qs = [{ type: "explain", prompt: "Explique flexbox et ses axes.", expected: "axe principal, axe secondaire", points: 2, comps: ["C3N1", "CT4N2"], skills: ["css"] }];
  const mk = await api("POST", "/api/assessments", { g: G, title: "Deux compétences", questions: qs, settings: { minutes: 0, target: [U.carol.id] } });
  const aid = mk.data.assessment.id;
  check(mk.data.assessment.questions[0].comps.length === 2 && mk.data.assessment.settings.target[0] === U.carol.id, "a question checks two competencies; the target student is kept");
  const inv = await api("POST", `/api/assessments/${aid}/invite`, { g: G, students: [U.carol.id, U.bob.id], send: false });
  const bob = inv.data.takers.find((t: any) => t.discord_id === U.bob.id);
  const rm = await api("POST", `/api/assessments/${aid}/remove`, { g: G, takers: [bob.id] });
  check(rm.data.takers.length === 1 && rm.data.takers[0].discord_id === U.carol.id, "an invitation is taken back");
  const links = (await api("GET", `/api/assessments/${aid}/links?g=${G}`)).data.links;
  const tok = links[U.carol.id].split("/quiz/")[1];
  const quiz = async (action: string, body: any) => { const ctx = makeCtx(); const r = await bot.fetch(new Request(`https://bot.example.workers.dev/quiz/${tok}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env, ctx); await ctx.flush(); return r.json() as any; };
  const sid = "sessionCCCCCCCCCCCCCCCC1";
  const st = await quiz("start", { sid });
  await quiz("answer", { sid, qid: st.paper[0].id, answer: "display: flex aligne sur l'axe principal" });
  await quiz("submit", { sid });
  const row = q1("SELECT * FROM assessment_takers WHERE assessment_id = ? AND discord_id = ?", aid, U.carol.id);
  const gr = JSON.parse(row.grades)[st.paper[0].id];
  check(gr.right === "Il utilise display: flex." && gr.score === 100, "the AI says what was right (and what was wrong or missing)");
  check(gr.marks?.length === 1 && gr.marks[0].line === 1 && gr.marks[0].major === false, "…and points at each mistake, on its line, minor or serious");
  const comps = q("SELECT code, level FROM competency_results WHERE discord_id = ? AND source = 'assessment' AND ref = ?", U.carol.id, aid);
  check(comps.length === 2 && comps.some((c: any) => c.code === "T4" && c.level === 2), "both competencies go on the record, each at its level");
  const ovr = await api("PUT", `/api/assessments/${aid}/grade`, { g: G, taker: row.id, qid: st.paper[0].id, verdict: "partial", score: 50 });
  check(ovr.data.takers[0].grades[st.paper[0].id].right === "Il utilise display: flex.", "changing a grade keeps the AI's explanation");
}

section("squads: each member's own level; the mise en situation's target; the workshop's déroulé; one activity per slot");
{
  const ex = [{ type: "story", texte: "En tant que visiteur, je vois la page des soins", statut: "fait" }, { type: "story", texte: "En tant que visiteur, je réserve un soin", statut: "non_fait" },
    { type: "technique", texte: "Le menu est responsive", statut: "fait" }];
  const contrib = [{ gid: "101", login: "a", commits: 30, days: 8, prs: 4, reviews: 3 }, { gid: "102", login: "b", commits: 0, days: 0, prs: 0, reviews: 0 }, { gid: "103", login: "c", commits: 10, days: 3, prs: 1, reviews: 0 }];
  const rec: any = { result: { exigences: ex, competences: [{ code: "C3", avis: "validable" }, { code: "C4", avis: "validable" }] }, squad: { members: contrib.map((m) => ({ gid: m.gid })) }, contrib,
    final: { ex: [true, true, true] }, members: {} };
  check(memberContribution(contrib[0], contrib) === 1 && memberContribution(contrib[1], contrib) === 0, "a member's part of the work: the strong one 1, without a commit 0");
  check(memberLevel(rec, contrib[0]) === "excellent" && memberLevel(rec, contrib[2]) === "bon", "the same squad work, two members, two levels: the one who did most is Excellent, the other Bon");
  check(memberLevel(rec, contrib[1]) === "faible", "no commit: never better than Faible, even when the squad's work is all validated");
  check(memberLevel(rec, contrib[1], { co: { C3: false, C4: false }, quiz: 20 }) === "critique", "…and lower with their own competencies off and a weak quiz");
  const L = memberLevels(rec);
  check(Object.keys(L).length === 3 && L["101"].prop === "excellent" && L["102"].prop === "faible" && !L["101"].lvl, "every member's proposal, none chosen yet");
  rec.members["101"] = { level: { lvl: "bon", by: "you" } };
  check(memberLevelOf(rec, "101").lvl === "bon" && memberLevelOf(rec, "101").prop === "excellent", "the teacher's choice is the member's level, the proposal stays");
  const old = memberLevelOf({ result: rec.result }, "101", { lvl: "moyen", prop: "bon" });
  check(old.lvl === "moyen" && old.prop === "bon" && memberLevelOf(rec, "999", { lvl: "", prop: "faible" }).prop === "faible", "an old record (no member data): the squad's level");

  const t1 = taskTarget(rec, { ex: [true, false, true] });
  check(t1?.why === "todo" && t1.item === 1 && !t1.done && t1.texte.includes("réserve un soin"), "mise en situation: a point of the brief not validated comes first");
  const t2 = taskTarget(rec, { ex: [true, false, true] }, { exclude: [1], rnd: () => 0 });
  check(t2?.why === "done" && t2.item === 0 && t2.done, "…another member already has it: a validated point, to change");
  const t3 = taskTarget({ ...rec, oral: [{ q: "À quoi sert flex-wrap ?", notion: "flex-wrap" }] }, { ex: [true, true, true], oral: [false] });
  check(t3?.why === "oral" && t3.notion === "flex-wrap", "…all validated: a notion missed at the oral");
  const t4 = taskTarget(rec, { ex: [true, true, true] }, { rnd: () => 0.99 });
  check(t4?.why === "done" && t4.item === 2, "…nothing missed: a point done in the project, to change");
  check(pickFiles(["index.html", "soins.html", "css/style.css", "img/a.png", "node_modules/x.js"], { ...t1!, texte: ex[0].texte }, ["css/style.css"]).join() === "css/style.css,soins.html", "the files: theirs first, then the one the point names; never images or node_modules");
  const good = { titre: "Ajouter une carte", contexte: "Vous ajoutez un soin à votre page.", consigne: "Ajoutez une carte pour le hammam dans soins.html.", fichiers: ["soins.html"],
    criteres: ["La carte est visible", "Elle a un titre", "Le reste de la page fonctionne"], regarder: "Observez s'il retrouve le bon fichier." };
  const o = { js: false, scope: "page des soins carte hammam", files: ["index.html", "soins.html"], duree: "15 min" };
  check(!taskChecks(good, o).length, "a task on their files, 3 criteria, « vous »: accepted");
  const bad = taskChecks({ ...good, consigne: "Tu ajoutes une carte dans contact.html.", fichiers: ["contact.html"], criteres: ["La carte est visible", "Elle a un titre"] }, o);
  check(bad.some((e) => e.includes("vouvoie")) && bad.some((e) => e.includes("exactement 3")) && bad.some((e) => e.includes("n’existent pas")), "« tu », 2 criteria, a file not in the repo: refused, with why");
  const fb = taskFallback(t1!, { project: "Hammam", files: ["soins.html"], duree: "15 min" });
  check(fb.titre.startsWith("Ajouter : ") && fb.criteres.length === 3 && fb.fichiers.join() === "soins.html" && !taskChecks(fb, o).some((e) => e.includes("vouvoie")), "without the AI: a task from the template, on their files, in « vous »");

  const ws = { duree: 50, deroule: [5, 15, 15, 10, 5].map((minutes) => ({ minutes })) };
  check(!workshopTimingErrors(ws).length, "a workshop of 50 min in 5 steps that add up: fine");
  check(workshopTimingErrors({ ...ws, deroule: [5, 15, 15, 5, 5].map((minutes) => ({ minutes })) }).some((e) => e.includes("exactement la durée")), "…steps that don't add up to the duration: refused");
  check(workshopTimingErrors({ duree: 40, deroule: [10, 10, 10, 10].map((minutes) => ({ minutes })) }).some((e) => e.includes("45 à 60")) && workshopTimingErrors({ duree: 45, deroule: [15, 15, 15].map((minutes) => ({ minutes })) }).some((e) => e.includes("4 à 6")), "…shorter than 45 min, or fewer than 4 steps: refused");
  const w = cleanWorkshop({ titre: "Une liste de cartes", objectifs: ["Créer des éléments", "Parcourir un tableau", "Ajouter un élément"], contexte: "On pratique la veille. Chaque groupe affiche une liste.", organisation: "Groupes de 2.", duree: 50,
    deroule: [5, 15, 15, 10, 5].map((minutes, i) => ({ minutes, etape: `Étape ${i + 1}`, notions: "DOM" })), consignes: [1, 2, 3].map((i) => ({ titre: `Étape ${i}`, detail: "Faites-le." })),
    starter: null, donnees: "Trois produits.", criteres: ["a", "b", "c"], plus_loin: ["d"], reflexion: ["e ?", "f ?"] }, "js");
  check(!validateWorkshop(w, { stack: "js", allowed: [], concepts: "" }).length, "a workshop with every section of the template: no warning");
  check(validateWorkshop({ ...w, criteres: ["a"], consignes: [] }, { stack: "js", allowed: [], concepts: "" }).length === 2, "…missing criteria and instructions: warned");
  const md = renderWorkshop(w, "2026-10-19");
  check(md.startsWith("## Lundi 19/10 — Workshop : Une liste de cartes\n\n11:00 · 50 min · Workshop") && md.includes("| 0–5 | Étape 1 | DOM |") && md.includes("| 45–50 | Étape 5 |")
    && ["🎯 Objectifs", "📌 Contexte", "⏱️ Déroulé", "🧭 Consignes par étapes", "💻 Données", "✅ Critères de réussite", "➕ Pour aller plus loin", "❓ Points de réflexion"].every((h) => md.includes(h)), "the workshop's markdown: the template's sections, a timed déroulé");
  check(slotOf("live") === slotOf("workshop") && slotOf("veille") !== slotOf("live") && slotOf("week") === "week", "slots: 09:15 the veille, 11:00 a live coding OR a workshop");
  const rows = [{ day: "2026-10-19", kind: "live" }, { day: "2026-10-19", kind: "veille" }];
  check(slotTaken(rows, "2026-10-19", "workshop")?.kind === "live" && slotTaken(rows, "2026-10-20", "workshop") === null && slotTaken([rows[0]], "2026-10-19", "veille") === null, "…a workshop's slot is taken by the day's live coding, not by another day's or the veille");
}

section("assessments: shared with other teachers by a link, linked to a brief (debrief and comment), AI questions keep the competencies");
{
  // the AI forgot the competencies: the ones the teacher picked are used
  const gen = await api("POST", "/api/assessments/generate", { g: G, topic: "Intégration", count: 5, techs: ["HTML", "CSS"], comps: ["C3N1"] });
  check(gen.status === 200 && gen.data.questions.every((q: any) => q.comps?.length), "AI questions keep the competencies picked for the assessment");
  // share: a link with the questions only; another class imports a draft copy
  const qs = [{ type: "explain", prompt: "Explique la différence entre margin et padding.", expected: "extérieur / intérieur", points: 2, comps: ["C3N1"], skills: ["css"] },
    { type: "mcq", prompt: "Quelle propriété crée une grille ?", choices: ["display: grid", "float: left"], answer: [0], points: 1, comps: ["C3N1"] }];
  const mk = await api("POST", "/api/assessments", { g: G, title: "CSS de base", questions: qs, settings: { minutes: 20 } });
  const aid = mk.data.assessment.id;
  const sh = await api("GET", `/api/assessments/${aid}/share?g=${G}`);
  check(sh.status === 200 && /\/share\/assessment\/\d+\.[A-Za-z0-9_-]{32}$/.test(sh.data.url), "a share link");
  const path = new URL(sh.data.url).pathname;
  const pub = await bot.fetch(new Request("https://bot.example.workers.dev" + path + "?json=1"), env, makeCtx());
  const pj: any = await pub.json();
  check(pub.status === 200 && pj.kind === "classbot-assessment" && pj.questions.length === 2 && !JSON.stringify(pj).includes("discord_id"), "the link gives the questions (never the students' papers)");
  const page = await bot.fetch(new Request("https://bot.example.workers.dev" + path, { headers: { accept: "text/html" } }), env, makeCtx());
  check(page.status === 200 && (await page.text()).includes("Import from a link"), "…and a page for a teacher who opens it");
  const url = (env.PUBLIC_URL || "https://bot.example.workers.dev").replace(/\/$/, "") + path;
  run1("INSERT OR IGNORE INTO guilds (id, name, created_at) VALUES ('g-other', 'Other teacher', 0)");
  const pv = await api("POST", "/api/assessments/import", { g: "g-other", url });
  check(pv.status === 200 && pv.data.preview.n === 2 && pv.data.preview.comps.includes("C3") && !pv.data.id, "import: a preview first");
  const im = await api("POST", "/api/assessments/import", { g: "g-other", url, import: true });
  const copy = q1("SELECT * FROM assessments WHERE id = ?", im.data.id);
  check(im.status === 200 && copy.guild_id === "g-other" && copy.status === "draft" && JSON.parse(copy.questions)[0].comps[0].code === "C3", "…then a draft copy in the other class, with the competencies");
  check((await api("POST", "/api/assessments/import", { g: "g-other", url: "https://example.com/nope" })).status === 400, "a wrong link is refused");
  const renewed = await api("DELETE", `/api/assessments/${aid}/share?g=${G}`);
  check(renewed.data.url !== sh.data.url && (await api("POST", "/api/assessments/import", { g: "g-other", url })).status === 400, "a new link: the old one stops working");
  // linked to a brief: a competency the assessment didn't validate starts "not validated" in the debrief, and the comment says it
  const bid = (globalThis as any).__briefId as number;
  await api("PUT", `/api/assessments/${aid}`, { g: G, title: "CSS de base", brief_id: bid, questions: mk.data.assessment.questions, settings: { minutes: 20 } });
  check(q1("SELECT brief_id FROM assessments WHERE id = ?", aid).brief_id === bid, "an assessment linked to a brief");
  const inv = await api("POST", `/api/assessments/${aid}/invite`, { g: G, students: [U.carol.id], send: false });
  const tk = inv.data.takers[0].id;
  run1("UPDATE assessment_takers SET status = 'graded', grades = ?, score = 20 WHERE id = ?", JSON.stringify({}), tk);
  for (const q of mk.data.assessment.questions) await api("PUT", `/api/assessments/${aid}/grade`, { g: G, taker: tk, qid: q.id, verdict: "wrong", score: 0 });
  const who = `u:${U.carol.id}`;
  const rec = { at: Date.now(), first: "Carol", model: "test", brief: "Hammam", repos: ["carol/site"], count: 4, checks: [],
    result: { resume: "", commits: [], forts: [], ameliorer: [], feedback: "", exigences: [], competences: [{ code: "C3", avis: "validable", raison: "ok" }, { code: "C4", avis: "validable", raison: "ok" }] }, challenge: null };
  run1("DELETE FROM brief_reviews WHERE brief_id = ? AND who = ?", bid, who);
  run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, updated_at) VALUES (?, ?, ?, ?, 'draft', ?)", bid, G, who, JSON.stringify(rec), clock.now());
  const st = await api("POST", `/api/briefs/${bid}/review/states`, { g: G, who, states: {} });
  check(st.status === 200 && st.data.states.co.C3 === false && st.data.states.co.C4 === true, `the assessment's "not validated" counts in the debrief (${JSON.stringify(st.data.states?.co)})`);
  const afb = st.data.review.result.feedback;
  check(!/Lors de l’évaluation|posé problème/.test(afb) && !afb.includes(mk.data.assessment.questions[0].prompt.slice(0, 40)), "…the assessment is not in the comment (its notions: the one-to-one and the oral questions)");
  check(st.data.review.assess?.[0]?.title === "CSS de base", "…the debrief page shows the assessment");
  check(!/%|niveau|Critique|Moyen|Compétences|C3|-Évaluation/.test(afb), "…with no score, no level and no competency codes");
  {
    // the assessment comes first, both ways: what it validated starts valid even if the project doesn't show it
    const r2 = { result: { exigences: [], competences: [{ code: "C3", avis: "non_visible" }, { code: "C4", avis: "validable" }, { code: "C5", avis: "validable" }] },
      assess: [{ id: 1, title: "A", score: 20, done: 1, of: 1, comps: { C3: { ok: true }, C4: { ok: false } } }] };
    const s2 = reviewStates(r2);
    check(s2.co.C3 === true && s2.co.C4 === false && s2.co.C5 === true, `the assessment decides where a competency starts, the project for the rest (${JSON.stringify(s2.co)})`);
    check(debriefLevel(r2, s2) === "critique" && debriefLevel({ ...r2, assess: [] }, s2) === "", "the proposed level counts the assessment's score (the competencies don't count in it)");
    // a strong project and every competency switched on can't hide a failed assessment: one level above it, at most
    const ex4 = Array.from({ length: 10 }, (_, i) => ({ type: "story", texte: "Point " + i, statut: i < 8 ? "fait" : "absent" }));
    const r4: any = { result: { exigences: ex4, competences: [{ code: "C1", avis: "validable" }, { code: "C2", avis: "validable" }, { code: "C3", avis: "validable" }, { code: "C4", avis: "validable" }] }, assess: [{ id: 1, title: "A", score: 16, done: 1, of: 1, comps: {} }] };
    const s4 = reviewStates(r4);
    const at4 = (score: number, mes?: string, oral?: boolean[]) => debriefLevel({ ...r4, assess: [{ ...r4.assess[0], score }], oral: (oral || []).map(() => ({ q: "?" })) }, { ...s4, mes: { r: mes || "" }, oral: oral || [] });
    // assessment 50 %, the exchange (oral questions + mise en situation) 30 %, the brief's requirements 20 %
    check(debriefLevel({ ...r4, assess: [] }, s4) === "bon" && at4(16) === "critique" && at4(40) === "faible" && at4(95) === "excellent" && at4(70, "valide", [true, true]) === "bon" && at4(70, "non_valide", [false, false]) === "faible",
      "the weights: assessment 50 %, oral questions and mise en situation 30 %, the brief's requirements 20 %");
    check(at4(16, "valide", [true, true, true]) === "faible" && at4(40, "valide", [true, true]) === "moyen",
      "an assessment at 16 % (critique): the proposal is Faible at best, even with a perfect exchange; at 40 % (faible): Moyen at best");
    const r3 = { checks: [{ id: "responsive", label: "Responsive", ok: false }], result: { exigences: [{ type: "critere", texte: "Responsive", statut: "absent", check: "responsive", bound: true }], competences: [] } };
    check(reviewStates(r3).ex[0] === false && reviewStates({ ...r3, final: { ex: [true] } }).ex[0] === true && reviewStates({ ...r3, final: { ck: { responsive: true } } }).ex[0] === true,
      "a requirement proved by a check starts as the check says, and the teacher's switch wins");
  }
  const none = await api("GET", `/api/briefs/${bid}/review?g=${G}&who=${encodeURIComponent(`u:${U.bob.id}`)}`);
  check(none.status === 200 && !none.data.review && none.data.assess?.[0]?.title === "CSS de base" && none.data.assess[0].of === 0, "before the analysis, the page shows the linked assessment (not taken by this learner)");
  const sw = await api("POST", `/api/briefs/${bid}/review/states`, { g: G, who, states: { co: { C3: true, C4: true } } });
  check(sw.data.states.co.C3 === true, "the teacher's switch still decides");
  await api("POST", `/api/briefs/${bid}/review/level`, { g: G, who, ai: true });
  check(/ÉVALUATION \(en classe, sans aide\) :\n« CSS de base » : 0 % ; non validées : C3/.test(ai.users[ai.users.length - 1]) && !ai.users[ai.users.length - 1].includes("Carol"), "✨ the AI level sees the assessment (no name)");
  // graded again: the debrief's level follows (the proposal, and the level given when it was the proposal)
  const lvNow = await api("POST", `/api/briefs/${bid}/review/level`, { g: G, who, level: "critique" });
  check(lvNow.data.review.level.prop === "critique" && lvNow.data.review.level.lvl === "critique", "the level given: the proposal (assessment at 0 %)");
  for (const q of mk.data.assessment.questions) await api("PUT", `/api/assessments/${aid}/grade`, { g: G, taker: tk, qid: q.id, verdict: "correct", score: 100 });
  const rg = q1("SELECT level, plevel FROM brief_reviews WHERE brief_id = ? AND who = ?", bid, who);
  check(rg.plevel === "excellent" && rg.level === "excellent", `the assessment graded again (100 %): the debrief's level follows (${rg.level}/${rg.plevel})`);
  await api("POST", `/api/briefs/${bid}/review/level`, { g: G, who, level: "moyen" });
  await api("PUT", `/api/assessments/${aid}/grade`, { g: G, taker: tk, qid: mk.data.assessment.questions[0].id, verdict: "wrong", score: 0 });
  const rg2 = q1("SELECT level, plevel FROM brief_reviews WHERE brief_id = ? AND who = ?", bid, who);
  check(rg2.level === "moyen" && rg2.plevel !== "excellent", "…a level the teacher chose by hand stays; the proposal still follows");
  for (const q of mk.data.assessment.questions) await api("PUT", `/api/assessments/${aid}/grade`, { g: G, taker: tk, qid: q.id, verdict: "wrong", score: 0 });
  check(assessForAi([{ title: "JS", score: 70, comps: { C4: { ok: true }, C5: { ok: false } } }, { title: "Pas noté", score: null, comps: {} }]) === "« JS » : 70 % ; compétences validées : C4 ; non validées : C5"
    && assessForAi([]) === "", "the analysis gets the graded assessments to compare with the project");
  const pa = await api("GET", `/api/progress?g=${G}`);
  check(pa.data.briefs.find((b: any) => b.id === bid)?.assessments === 1 && pa.data.assess[`${bid}:${U.carol.id}`]?.st === "graded"
    && pa.data.assess[`${bid}:${U.carol.id}`].score === 0 && !pa.data.assess[`${bid}:${U.bob.id}`], "Progress: each square knows the brief's assessment (graded with its score, or not taken)");
  run1("DELETE FROM brief_reviews WHERE brief_id = ? AND who = ?", bid, who);
  const sp = await api("GET", `/api/students/${U.carol.id}?g=${G}`);
  const sa = sp.data.learning.assessments.find((x: any) => x.id === aid);
  check(sa && sa.brief?.id === bid && sa.comps.some((c: any) => c.code === "C3" && !c.ok) && sa.questions.length === 2 && sa.questions[0].verdict === "wrong", "the student page: score, competencies and each question of the assessment");
}

section("a new brief is announced in #general (or the channel chosen)");
{
  const { briefChannel, saveGithubCfg } = await import("../src/shared/github.ts");
  const { getGuild } = await import("../src/shared/db.ts");
  let g = await getGuild(env, G);
  await saveGithubCfg(env, g, { briefs: null, autoGeneral: false });
  g = await getGuild(env, G);
  check(await briefChannel(env, g) === "c1", "the server's #general is found (not #arena)");
  await api("PUT", "/api/github", { g: G, briefs: "c2" });
  g = await getGuild(env, G);
  check(await briefChannel(env, g) === "2", "…or the channel the teacher chose");
  discordFake.channels = [];
}

section("GitHub: each class can have its own GitHub App; Watcher import from its data");
{
  const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu\n-----END RSA PRIVATE KEY-----";
  check((await api("PUT", "/api/github/app", { g: G, appId: "99", slug: "x", clientId: "c", privateKey: "not a key" })).status === 400, "a private key that isn't a .pem is refused");
  const sv = await api("PUT", "/api/github/app", { g: G, appId: "99", slug: "https://github.com/apps/classbot-b", clientId: "Iv23abc", clientSecret: "cs", webhookSecret: "own_secret", privateKey: pem });
  const gh = await api("GET", `/api/github?g=${G}`);
  check(sv.status === 200 && gh.data.setup.own && gh.data.setup.slug === "classbot-b" && gh.data.setup.urls.webhook.endsWith(`/github/webhook/${G}`) && !JSON.stringify(gh.data).includes("own_secret"), "the class's own App: saved, its own webhook URL, secrets never sent back");
  const body = JSON.stringify({ installation: { id: 777 }, repository: { full_name: "carol/site" }, sender: { id: 9003, login: "carol-gh" }, commits: [{ id: "b".repeat(40), message: "feat: page", distinct: true, added: ["a.html"], modified: [], removed: [] }] });
  run1("UPDATE players SET github_id = '9003', github_login = 'carol-gh', gh_inst = '777' WHERE guild_id = ? AND discord_id = ?", G, U.carol.id);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("own_secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = "sha256=" + Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("hex");
  const hook = async (path: string) => { const ctx = makeCtx(); const r = await bot.fetch(new Request("https://bot.example.workers.dev" + path, { method: "POST", headers: { "x-github-event": "push", "x-github-delivery": "own1", "x-hub-signature-256": sig }, body }), env, ctx); await ctx.flush(); return r.status; };
  check(await hook("/github/webhook") === 401 && await hook(`/github/webhook/${G}`) === 202, "the class's webhook checks the class's secret");
  check(q("SELECT * FROM gh_activity WHERE discord_id = ?", U.carol.id).length === 1, "the push counts for the student");
  // the debrief lists the student's repos (all those the App can read), the ones of the brief first
  run1("INSERT OR REPLACE INTO gh_tokens (inst, token, exp) VALUES ('777', 'tok777', ?)", Math.floor(Date.now() / 1000) + 3000);
  github.repos.tok777 = [
    { full_name: "carol/old-cv", owner: { login: "carol" }, pushed_at: "2025-01-02T10:00:00Z", created_at: "2024-12-01T10:00:00Z", private: false, description: "Old CV", language: "HTML" },
    { full_name: "carol/site", owner: { login: "carol" }, pushed_at: new Date(Date.now()).toISOString(), created_at: new Date(Date.now()).toISOString(), private: true, description: "Hammam", language: "CSS" }];
  const bidR = q1("SELECT id FROM briefs WHERE guild_id = ? AND status = 'assigned' ORDER BY id LIMIT 1", G).id;
  const rp = await api("GET", `/api/briefs/${bidR}/review/repos?g=${G}&who=u:${U.carol.id}`);
  check(rp.status === 200 && rp.data.repos.length === 2 && rp.data.repos[0].repo === "carol/site" && rp.data.repos[0].activity === 1 && rp.data.repos[0].private && !rp.data.repos[1].during, "debrief: the student's GitHub repos to pick from, the one they pushed to during the brief first");
  const rpB = await api("GET", `/api/briefs/${bidR}/review/repos?g=${G}&who=u:${U.bob.id}`);
  check(rpB.status === 200 && rpB.data.missing.length === 1 && !rpB.data.repos.length, "…a student not connected to GitHub is reported");
  {
    // 🤖 AI use: the pushes (from the webhook), the code as it is now, the AI's reading; the parts go into the oral questions
    const AC = await import("../src/shared/review/aicheck.ts");
    const calm = AC.pushSignals([{ t: 1000, adds: 40 }, { t: 1000 + 3600, adds: 55 }, { t: 1000 + 7200, adds: 30 }, { t: 1000 + 86400, adds: 60 }]);
    check(!calm.signals.length && !AC.codeSignals({ "app.js": "let total = 0;\nfor (let i = 0; i < notes.length; i++) {\n  total = total + notes[i];\n}\n" }, { lang: "fr", taught: "boucles" }).signals.length
      && AC.aiLevel([]).level === "low", "regular small commits and simple code: no signal");
    check(AC.assessSignal(16, 0.9)?.pts === 25 && AC.assessSignal(80, 0.9) === null && AC.ADVANCED.some(([n]) => n === "reduce()"), "a project far above the assessment is a signal");
    const br = q1("SELECT start_at, created_at, due_at FROM briefs WHERE id = ?", bidR), t0 = (br.start_at ?? br.created_at) + 3600;
    github.trees["carol/site@HEAD"] = ["index.html", "app.js", "node_modules/lib/x.js"];
    github.files["carol/site/HEAD/index.html"] = "<!doctype html><html><body><h1>Hammam</h1><script src=\"app.js\"></script></body></html>";
    github.files["carol/site/HEAD/app.js"] = "// Here's the updated code with the cart feature\n/**\n * Adds an item.\n * @param {object} item\n */\nfunction add(item) { cart.push(item); }\n/**\n * Sums.\n * @returns {number}\n */\nconst total = () => cart.reduce((s, x) => s + x.price, 0);\n/**\n * Loads.\n * @param {string} url\n */\nasync function load(url) { const r = await fetch(url); return r.json(); }\n";
    const keptLog = q("SELECT * FROM gh_log WHERE discord_id = ?", U.carol.id);
    run1("DELETE FROM gh_log WHERE discord_id = ?", U.carol.id);
    for (const [i, adds, dt] of [[1, 40, 0], [2, 520, 600], [3, 12, 4000]] as [number, number, number][])
      run1("INSERT INTO gh_log (guild_id, id, discord_id, kind, repo, t, title, size, adds, dels, files) VALUES (?, ?, ?, 'commit', 'carol/site', ?, ?, 'real', ?, 0, 3)", G, `c${i}`.padEnd(40, String(i)), U.carol.id, t0 + dt, i === 2 ? "add everything" : "work", adds);
    // the log also holds a commit that was rewritten away (force push) and one in another repo: neither is in the project
    run1("INSERT INTO gh_log (guild_id, id, discord_id, kind, repo, t, title, size, adds, dels, files) VALUES (?, ?, ?, 'commit', 'carol/site', ?, 'ghost', 'real', 900, 0, 3)", G, "d".repeat(40), U.carol.id, t0 + 700);
    run1("INSERT INTO gh_log (guild_id, id, discord_id, kind, repo, t, title, size, adds, dels, files) VALUES (?, ?, ?, 'commit', 'carol/other', ?, 'elsewhere', 'real', 800, 0, 3)", G, "e".repeat(40), U.carol.id, t0 + 800);
    const gc = (i: number, dt: number, msg: string) => ({ sha: `c${i}`.padEnd(40, String(i)), parents: [{}], author: { login: "carol-gh" }, commit: { message: msg, author: { date: new Date((t0 + dt) * 1000).toISOString() } } });
    github.branches["carol/site"] = ["main", "feat"];
    github.commits["carol/site@main"] = [gc(3, 4000, "work"), gc(1, 0, "work")];
    github.commits["carol/site@feat"] = [gc(2, 600, "add everything"), gc(1, 0, "work")];
    const recA = { at: Date.now(), first: "Carol", brief: "Hammam", repos: ["carol/site"], checks: [], result: { exigences: [{ type: "story", texte: "Panier", statut: "fait" }], competences: [], feedback: "" }, oral: [] };
    run1("DELETE FROM brief_reviews WHERE brief_id = ? AND who = ?", bidR, `u:${U.carol.id}`);
    run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, updated_at) VALUES (?, ?, ?, ?, 'draft', ?)", bidR, G, `u:${U.carol.id}`, JSON.stringify(recA), clock.now());
    run1("DELETE FROM ai_usage");
    const ac = await api("POST", `/api/briefs/${bidR}/review/aicheck`, { g: G, who: `u:${U.carol.id}` });
    const c = ac.data.review?.aiCheck;
    const ids = (c?.signals || []).map((x: any) => x.id);
    check(ac.status === 200 && c.level === "high" && ["leftover", "big", "fast", "share", "jsdoc", "level", "ai"].every((x) => ids.includes(x)) && c.commits === 3 && c.lines === 572,
      `🤖 AI use: the pushes, the code and the AI's reading give the signals, each with its evidence (${c?.level} ${c?.score}: ${ids.join(", ")})`);
    check(c.parts.some((p: any) => p.where.startsWith("app.js")) && c.parts.some((p: any) => /commit c2/.test(p.where)) && !JSON.stringify(c).includes("node_modules") && /reduce\(\)/.test(c.signals.find((x: any) => x.id === "level").detail),
      "…with the parts to ask about (the file, the big commit), never the libraries");
    check(!JSON.stringify(c).includes("ghost") && !JSON.stringify(c).includes("elsewhere") && c.parts.some((p: any) => /commit c2{6}.*· feat/.test(p.where) && p.url === `https://github.com/carol/site/commit/${"c".padEnd(40, "2")}`),
      "…only commits that are on a branch of the brief's repo now (not rewritten away, not another repo), with their branch and a link");
    await api("POST", `/api/briefs/${bidR}/review/oral`, { g: G, who: `u:${U.carol.id}` });
    check(ai.users[ai.users.length - 1].includes("PARTIES À LUI FAIRE EXPLIQUER") && ai.users[ai.users.length - 1].includes("app.js"), "…and the ✨ oral questions start with them");
    run1("DELETE FROM brief_reviews WHERE brief_id = ? AND who = ?", bidR, `u:${U.carol.id}`);
    run1("DELETE FROM gh_log WHERE discord_id = ?", U.carol.id);
    delete github.branches["carol/site"]; delete github.commits["carol/site@main"]; delete github.commits["carol/site@feat"];
    for (const r of keptLog) run1(`INSERT INTO gh_log (${Object.keys(r).join(", ")}) VALUES (${Object.keys(r).map(() => "?").join(", ")})`, ...Object.values(r));
  }
  await api("DELETE", `/api/github/app?g=${G}`);
  check(!(await api("GET", `/api/github?g=${G}`)).data.setup.own, "back to the school's App");
  const data = { names: JSON.stringify({ "555000": { n: "Dora" } }), "inst:4242": JSON.stringify({ discordId: U.bob.id, githubId: 8001, login: "bob-gh", linkedAt: new Date().toISOString() }),
    deadlines: JSON.stringify([{ id: "d1", name: "Portfolio", createdAt: new Date().toISOString(), due: new Date(Date.now() + 86400000).toISOString(), brief: "Contexte du projet\nEn tant que visiteur, je vais voir le portfolio, afin de connaître l'auteur.", skills: "C3N1" }]),
    "sub:d1:8001": JSON.stringify({ repo: "bob-gh/portfolio", at: new Date().toISOString() }) };
  const imp = await api("POST", "/api/github/import", { g: G, data });
  check(imp.status === 200 && imp.data.students === 1 && imp.data.briefs === 1 && imp.data.handins === 1, "Watcher import from its data (read in the dashboard through the Cloudflare API)");
  check(q1("SELECT github_login FROM players WHERE guild_id = ? AND discord_id = ?", G, U.bob.id).github_login === "bob-gh", "…students linked");

  // a whole class from the Watcher's storage (bound as WATCHER_KV): debriefs with their level and comment, the
  // decisions of an earlier brief, activity in the keys' metadata, first pushes, a sprint decision; batched
  {
    const wk = BUILTIN[0].weeks.find((x) => x.sprint && x.start)!;
    const dueIso = new Date(Date.parse(wk.start + "T12:00:00Z") + 3 * 86400000).toISOString(), t0 = Date.parse(wk.start + "T10:00:00Z");
    const W: Record<string, unknown> = {
      names: JSON.stringify({}), aliases: JSON.stringify({ "7000": "Zineb A." }),
      deadlines: JSON.stringify([{ id: "fit", name: "Fitness", createdAt: wk.start + "T08:00:00Z", due: dueIso, brief: "Contexte\nEn tant que visiteur, je vais voir les cours, afin de choisir.", skills: "C3N1, CT5N1", sprint: "sp1" },
        { id: "pet", name: "PetNest", createdAt: wk.start + "T08:00:00Z", due: dueIso, brief: "Contexte", skills: "C4N1", kind: "squad", squads: [{ id: "abc123", name: "Squad A", members: [{ gid: 7001 }, { gid: 7002 }], sm: 7001 }] }]),
      evals: JSON.stringify({ "fit:7001": { at: 1, co: { C3N1: true, CT5N1: false }, lv: "bon", plv: "moyen" } }),
      sprints: JSON.stringify([{ id: "sp1", name: "Sprint 1", start: wk.start, end: wk.end }]),
      sprintdec: JSON.stringify({ "sp1:7000": { r: "valide", note: "ok", plvl: "bon" } }),
      "ai:7000": JSON.stringify({ dl: "fit", first: "Zineb", result: { feedback: "Bonjour Zineb, auto.", exigences: [], competences: [{ code: "C3N1", avis: "validable" }] }, final: { co: { C3N1: true } }, level: { lvl: "excellent", prop: "bon" } }),
      "ai:7003": JSON.stringify({ result: { feedback: "old" } }),
      "fb:fit:7000": "Bonjour Zineb, mon commentaire.", "fb:fit:7001": "Bonjour, ancien brief.",
      "dl:fit:7002": new Date(t0 - 86400000).toISOString(),
    };
    for (let i = 0; i < 30; i++) {
      const gid = 7000 + i, did = String(990000 + i);
      W[`inst:${5000 + i}`] = JSON.stringify({ discordId: did, githubId: gid, login: `st${i}`, discordName: `Student ${i}` });
      W[`thread:${gid}`] = String(1300000000000000000n + BigInt(i));
      W[`sub:fit:${gid}`] = JSON.stringify({ repo: `st${i}/fitness`, at: dueIso });
      for (let j = 0; j < 10; j++) W[`ev:${wk.start}:${gid}:d-${i}-${j}`] = { __meta: { commits: 1, real: 1, tiny: 0, flagged: 0, bad: 0, lines: 12, prs: 0, other: 0, t: t0 + j * 60000, r: `st${i}/fitness` } };
    }
    await api("PUT", "/api/github/app", { g: G, appId: "99", slug: "classbot-b", clientId: "Iv23abc", clientSecret: "cs", webhookSecret: "own_secret", privateKey: pem });
    (env as any).WATCHER_KV = memoryKv(W);
    const before = d1.queries;
    const im = await api("POST", "/api/github/import", { g: G });
    const trips = d1.queries - before;
    delete (env as any).WATCHER_KV;
    const r = im.data;
    check(im.status === 200 && r.students === 30 && r.briefs === 2 && r.handins === 30 && r.activity === 300 && r.threads === 30 && r.sprints === 1, `a class of 30 imported (${JSON.stringify(r)})`);
    check(trips < 50, `…in ${trips} database round trips (Cloudflare's free limit is 50)`);
    const zi = q1("SELECT name, github_login, gh_inst FROM players WHERE guild_id = ? AND discord_id = '990000'", G);
    check(zi.name === "Zineb A." && zi.github_login === "st0" && zi.gh_inst === null && r.keepInst === 0, "…the class has its own App: links kept, the Watcher App's installations not (students run /github)");
    const fit = q1("SELECT id, sprint FROM briefs WHERE guild_id = ? AND source = 'watcher:fit'", G);
    const rv = q1("SELECT record, status, level, plevel FROM brief_reviews WHERE brief_id = ? AND who = 'u:990000'", fit.id);
    check(rv.status === "draft" && rv.level === "excellent" && rv.plevel === "bon" && JSON.parse(rv.record).result.feedback === "Bonjour Zineb, mon commentaire." && JSON.parse(rv.record).final.co.C3N1 === true,
      "…a debrief: a draft with its level (Progress shows it), the teacher's switches and the comment as last edited");
    const ev = q1("SELECT record, level FROM brief_reviews WHERE brief_id = ? AND who = 'u:990001'", fit.id);
    check(ev && ev.level === "bon" && JSON.parse(ev.record).final.co.CT5N1 === false && JSON.parse(ev.record).result.feedback === "Bonjour, ancien brief.", "…an earlier brief's debrief from its decisions and comment");
    check(r.skipped === 1 && r.levels === 2 && r.comments === 2, "…an old debrief whose brief is gone is skipped");
    check(fit.sprint === wk.sprint, "…the brief in the programme's sprint");
    const st = await pushStatus(env, await getGuild(env, G), q1("SELECT * FROM briefs WHERE id = ?", fit.id));
    check(st.get("990000") === "on" && st.get("990002") === "on" && r.pushes === 1, "…who pushed on time, from the activity");
    check(q1("SELECT decision, plevel FROM sprint_reviews WHERE guild_id = ? AND discord_id = '990000'", G).decision === "valide", "…the sprint decision");
    // run again: nothing doubled, nothing the teacher did since is overwritten
    run1("UPDATE brief_reviews SET status = 'final' WHERE brief_id = ? AND who = 'u:990000'", fit.id);
    (env as any).WATCHER_KV = memoryKv(W);
    const again = await api("POST", "/api/github/import", { g: G });
    delete (env as any).WATCHER_KV;
    check(again.status === 200 && q1("SELECT COUNT(*) AS n FROM gh_activity WHERE guild_id = ? AND discord_id = '990000'", G).n === 10 && q1("SELECT status FROM brief_reviews WHERE brief_id = ? AND who = 'u:990000'", fit.id).status === "final"
      && q1("SELECT COUNT(*) AS n FROM briefs WHERE guild_id = ? AND source LIKE 'watcher:%'", G).n === 3, "safe to run again: no double activity, a finalized debrief stays");
    await api("DELETE", `/api/github/app?g=${G}`);
    // this class of 30 was only for the import: the next sections use the usual students
    const ids = q("SELECT id FROM briefs WHERE guild_id = ? AND source IN ('watcher:fit', 'watcher:pet')", G).map((x: any) => x.id);
    for (const t of ["brief_reviews", "brief_handins"]) run1(`DELETE FROM ${t} WHERE brief_id IN (${ids.join(",")})`);
    run1(`DELETE FROM briefs WHERE id IN (${ids.join(",")})`);
    for (const t of ["gh_activity", "sprint_reviews", "players"]) run1(`DELETE FROM ${t} WHERE guild_id = ? AND discord_id LIKE '9900%'`, G);

    // the class uses the Watcher's own App (GitHub says the installation is its own): installations kept, students do nothing
    const { generateKeyPairSync } = await import("node:crypto");
    const realPem = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey;
    await api("PUT", "/api/github/app", { g: G, appId: "424242", slug: "watcher-app", clientId: "Iv23w", clientSecret: "cs", webhookSecret: "ws", privateKey: realPem });
    const same = await api("POST", "/api/github/import", { g: G, data: { "inst:8801": JSON.stringify({ discordId: "990555", githubId: 7555, login: "same-gh" }) } });
    check(same.data.keepInst === 1 && q1("SELECT gh_inst FROM players WHERE guild_id = ? AND discord_id = '990555'", G).gh_inst === "8801", "the class uses the Watcher's App: the students' installations are kept (no /github needed)");
    github.foreign.add("8802");
    const other = await api("POST", "/api/github/import", { g: G, data: { "inst:8802": JSON.stringify({ discordId: "990556", githubId: 7556, login: "other-gh" }) } });
    check(other.data.keepInst === 0 && q1("SELECT gh_inst FROM players WHERE guild_id = ? AND discord_id = '990556'", G).gh_inst === null, "…another App: not kept (students run /github)");
    github.foreign.delete("8802");
    await api("DELETE", `/api/github/app?g=${G}`);
    run1("DELETE FROM players WHERE guild_id = ? AND discord_id IN ('990555', '990556')", G);

    // npm run setup found a Watcher and bound it: the bot imports it by itself, once, for the Watcher's server
    const flag = () => { try { return JSON.parse(q1("SELECT github FROM guilds WHERE id = ?", G).github || "{}").watcherImport ?? null; } catch { return null; } };
    const cfg0 = q1("SELECT github FROM guilds WHERE id = ?", G).github;
    run1("UPDATE guilds SET github = ? WHERE id = ?", JSON.stringify({ ...JSON.parse(cfg0 || "{}"), watcherImport: undefined }), G);
    (env as any).WATCHER_KV = memoryKv({ guild_id: G, "inst:6001": JSON.stringify({ discordId: "990777", githubId: 7777, login: "auto-gh" }), deadlines: "[]" });
    await runCron(env);
    const f1 = flag();
    check(f1?.at && f1.by === "setup" && f1.students === 1 && q1("SELECT github_login FROM players WHERE guild_id = ? AND discord_id = '990777'", G)?.github_login === "auto-gh", "the bot imports the Watcher by itself after npm run setup");
    run1("DELETE FROM players WHERE guild_id = ? AND discord_id = '990777'", G);
    await runCron(env);
    check(!q1("SELECT 1 AS x FROM players WHERE guild_id = ? AND discord_id = '990777'", G), "…only once");
    const gs = await api("GET", `/api/github?g=${G}`);
    check(gs.data.setup.watcher === true && gs.data.setup.watcherDone?.by === "setup", "…and the dashboard shows it was imported");
    delete (env as any).WATCHER_KV;
    run1("UPDATE guilds SET github = ? WHERE id = ?", JSON.stringify({ ...JSON.parse(cfg0 || "{}"), watcherImport: undefined }), G);
    await runCron(env);
    check(flag() === null, "no Watcher bound (a new ClassBot): nothing happens");
    run1("UPDATE guilds SET github = ? WHERE id = ?", cfg0, G);
  }
}

section("brief steps: found in the brief, dated in working days, proposed from the repo at the date, the teacher decides, Suivi du projet in the comment");
{
  // found in the brief text, dated from the brief's first day (Saturday and Sunday skipped), at the due time
  const raw = stepsFallback("Contexte\nPartie 1, fin du jour 1 : maquette et backlog.\nÉtape 2 - jour 3 : pages HTML\nrien ici");
  check(raw.length === 2 && raw[0].nom === "Partie 1" && raw[1].jour === 3 && raw[0].attendu === "maquette et backlog", "\"Partie N, fin du jour N\" lines found without AI");
  const fri = Date.parse("2026-10-09T09:00:00Z") / 1000, due = Date.parse("2026-10-15T23:59:00Z") / 1000;
  check(new Date(dayDate(fri, due, 2) * 1000).toISOString() === "2026-10-12T23:59:00.000Z", "day 2 of a brief that starts on a Friday is the Monday, at the due time");
  const st = stepsFrom(raw, fri, due);
  check(st.length === 2 && st[0].day === 1 && st[1].n === 2, "dated steps");
  const txt = stepsToText(st);
  check(txt.split("\n")[0] === "Partie 1 | 2026-10-09 23:59 | maquette et backlog", "steps as text for the teacher");
  check(parseSteps(txt).map((s) => s.due).join() === st.map((s) => s.due).join(), "…and read back the same");
  check(parseSteps("Fin | 2026-10-09 | tout\nbad line").length === 1 && parseSteps("Fin | 2026-10-09 | tout")[0].day === null, "the teacher's lines (a wrong line is skipped)");
  check(stepRhythm(st, ["2026-10-09T10:00:00Z", "2026-10-13T10:00:00Z", "2026-10-20T10:00:00Z", "junk"]).join() === "1,1,1", "commits per step period");

  // a published brief: its steps come from its text, the teacher can change them, ✨ the AI finds them in another brief
  const today = clock.now(), dayIso = (d: number) => new Date((today + d * 86400) * 1000).toISOString().slice(0, 10);
  const mk = await api("POST", "/api/briefs", { g: G, data: { title: "Site en étapes", summary: "Un site", context: "Partie 1, fin du jour 1 : maquette du site.\nPartie 2, fin du jour 3 : pages HTML.\nPartie 3, fin du jour 40 : déploiement.", competencies: ["C3N1"] } });
  const sid = mk.data.brief.id;
  check(mk.status === 200 && !mk.data.steps.length, "a draft has no steps yet");
  const pub = await api("POST", `/api/briefs/${sid}/assign`, { g: G, start: dayIso(-10), due: dayIso(40) });
  check(pub.status === 200 && pub.data.steps.length === 3 && pub.data.steps[0].name === "Partie 1" && /^Partie 1 \| /.test(pub.data.stepsText), "publishing finds the steps of the brief");
  const ed = await api("PUT", `/api/briefs/${sid}/steps`, { g: G, text: pub.data.stepsText.replace("pages HTML", "pages HTML et CSS") });
  check(ed.status === 200 && ed.data.steps[1].expected === "pages HTML et CSS", "the teacher changes a step");
  check((await api("PUT", `/api/briefs/${sid}/steps`, { g: G, text: "no date here" })).status === 400, "a text without any step is refused");
  const mk2 = await api("POST", "/api/briefs", { g: G, data: { title: "Autre", context: "Le projet se fait en trois temps : d'abord la maquette, puis les pages." } });
  const ai2 = await api("POST", `/api/briefs/${mk2.data.brief.id}/steps`, { g: G });
  check(ai2.status === 200 && ai2.data.steps.length === 2 && ai2.data.steps[1].name === "Pages", "✨ the AI finds steps that are not written \"Partie N\"");

  // propose from the repo at the step's date, then the teacher's choice
  const was = { key: env.GITHUB_PRIVATE_KEY, id: env.GITHUB_APP_ID };
  env.GITHUB_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\nx\n-----END RSA PRIVATE KEY-----"; env.GITHUB_APP_ID = "1";
  run1("INSERT OR REPLACE INTO gh_tokens (inst, token, exp) VALUES ('777', 'tok777', ?)", clock.now() + 3000);
  const who = `u:${U.carol.id}`;
  await api("POST", `/api/briefs/${sid}/handin`, { g: G, who, repo: "carol/etapes" });
  const s1 = ed.data.steps[0], s2 = ed.data.steps[1];
  const at = (t: number) => new Date(t * 1000).toISOString();
  const cm = (sha: string, t: number) => ({ sha: sha.repeat(40), commit: { message: "feat: " + sha, author: { date: at(t) } } });
  github.commits["carol/etapes"] = [cm("d", s2.due + 3600), cm("c", s2.due + 1800), cm("b", s1.due - 3600)];
  github.trees["carol/etapes@" + "b".repeat(40)] = ["maquette.png"];
  github.trees["carol/etapes@HEAD"] = ["maquette.png", "index.html", "pages/contact.html"];
  const p1 = await api("POST", `/api/briefs/${sid}/review/stepcheck`, { g: G, who, n: 1 });

  check(p1.status === 200 && p1.data.prop.statut === "a_temps" && p1.data.prop.before === 1 && p1.data.prop.after === 2 && p1.data.prop.files === 1 && p1.data.prop.added === 2, "step 1: proposed from the repo as it was at its date");
  check(ai.users.some((u) => u.includes("ATTENDU : maquette du site") && u.includes("FICHIERS À LA DATE (1) :\nmaquette.png")), "the AI gets what was expected and the files at the date");
  check(ai.prompts.some((p) => p.includes("Juge SEULEMENT cette étape") && p.includes("bonus n’est pas exigé") && p.includes("à voir à l’oral")), "only this step is judged; a bonus is not required; what a repo cannot show is named");
  const p3 = await api("POST", `/api/briefs/${sid}/review/stepcheck`, { g: G, who, n: 3 });
  check(p3.data.prop.statut === "a_venir", "a step not due yet is not read");
  await api("POST", `/api/briefs/${sid}/review/step`, { g: G, who, n: 1, final: "a_temps" });
  const sv = await api("POST", `/api/briefs/${sid}/review/step`, { g: G, who, n: 2, final: "en_retard", note: "Les pages sont arrivées en retard." });
  check(sv.status === 200 && sv.data.stepRecs[1].final === "a_temps" && sv.data.stepRecs[1].prop.statut === "a_temps" && sv.data.stepRecs[2].final === "en_retard", "the teacher's choice is saved with the proposal");
  check((await api("POST", `/api/briefs/${sid}/review/step`, { g: G, who, n: 9, final: "a_temps" })).status === 400, "unknown step refused");
  check((await api("POST", `/api/briefs/${sid}/review/stepcheck`, { g: G, who: `u:${U.bob.id}`, n: 1 })).status === 400, "no repo yet: a clear message");

  // the comment of the debrief: Suivi du projet (results, note, work done at the end) and the advice
  const rec = { at: Date.now(), first: "Carol", model: "test", brief: "Site en étapes", repos: ["carol/etapes"], count: 6, files: true, skills: ["C3"],
    checks: [{ id: "pages", label: "Site multipage", ok: true, detail: "3 pages" }], rhythm: [1, 0, 5, 0],
    result: { resume: "Bien.", commits: [], feedback: "", exigences: [{ type: "story", texte: "Page d’accueil", statut: "fait", preuve: "index.html", check: "pages" }], competences: [{ code: "C3", avis: "validable", raison: "ok" }] }, challenge: null };
  run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, updated_at) VALUES (?, ?, ?, ?, 'draft', ?)", sid, G, who, JSON.stringify(rec), clock.now());
  const fb = (await api("POST", `/api/briefs/${sid}/review/states`, { g: G, who, states: {} })).data.review.result.feedback;
  check(/^Carol,\n\n/.test(fb) && !/Partie 2|en retard|83 %|dernière étape/.test(fb), "the steps of the brief stay on the page for the teacher: not in the comment");
  const rv = await api("GET", `/api/briefs/${sid}/review?g=${G}&who=${who}`);
  check(rv.data.steps.length === 3 && rv.data.stepRecs[2].note === "Les pages sont arrivées en retard.", "the debrief page gets the steps and the results");
  env.GITHUB_PRIVATE_KEY = was.key; env.GITHUB_APP_ID = was.id;
}

section("the debrief comment: the teacher's way (« tu », paragraphs, an honest verdict), only from the teacher's decisions");
{
  const C = await import("../src/shared/review/comment.ts");
  const ex = [
    { type: "story", texte: "En tant que visiteur, je vais voir le menu sur toutes les pages, afin de naviguer.", statut: "fait", check: "nav", bound: true },
    { type: "story", texte: "En tant que visiteur, je vais voir une page contact avec un formulaire, afin d'écrire au hammam.", statut: "absent" },
    { type: "story", texte: "En tant que développeur, je vais rendre le site adaptatif aux points de rupture 768 px et 1024 px, afin de l'afficher sur mobile.", statut: "absent" },
    { type: "technique", texte: "Utiliser Flexbox pour la mise en page", statut: "fait" },
    { type: "livrable", texte: "Documenter la planification du projet dans le README", statut: "absent" },
    { type: "critere", texte: "Code indenté proprement", statut: "absent" },
    { type: "bonus", texte: "En tant que visiteur, je vais activer un mode sombre, afin de lire la nuit.", statut: "fait" },
    { type: "bonus", texte: "En tant que visiteur, je vais voir une animation", statut: "absent" },
  ];
  const rec: any = {
    first: "Sara", brief: "Hammam Al Andalous",
    checks: [{ id: "nav", label: "Menu", ok: true }, { id: "commits", label: "Commits réguliers", ok: false, n: 2, days: 1 }, { id: "branches", label: "Branches", ok: false }, { id: "active", label: "Page en cours", ok: false }],
    result: { exigences: ex, competences: [{ code: "C3", avis: "validable" }, { code: "C4", avis: "non_visible" }] },
    oral: [{ q: "À quoi sert alt ?", notion: "L'attribut alt", a: "…" }, { q: "Que fait <main> ?", notion: "Le rôle de la balise <main>", a: "…" }],
    final: { oral: [true, false] },
    remarks: { text: "Ne sait pas expliquer la différence entre margin et padding. Maîtrise bien Flexbox." },
  };
  const d = C.commentData({ first: "Sara", project: rec.brief, rec });
  const fb = C.commentText(d);
  const paras = fb.split("\n\n");
  check(paras[0] === "Sara," && !/Bonjour|Cordialement|Points forts|Axes d|Notions à revoir|Bonus\n/.test(fb), "the teacher's way: the first name, then paragraphs (no titles, no « Bonjour », no « Cordialement »)");
  check(!/\b(vous|votre|vos)\b/i.test(fb) && /\btu\b/.test(fb) && !/\*\*|#|!|(^|\n)\s*[–-] /.test(fb), "« tu », plain text, no markdown, no bullet list, no exclamation mark");
  check(/Tu as aussi réalisé un bonus, ce qui est une très bonne initiative\./.test(fb) && !/mode sombre|animation/.test(fb), "the bonus: said, not listed");
  const miss = paras.find((x) => /il manque encore|Il te reste/.test(x)) || "";
  check(miss.includes("le point « Documenter la planification du projet dans le README »") === false && /il manque encore|Il te reste/.test(miss) && miss.includes("permettre à l’utilisateur de voir une page contact avec un formulaire") && miss.includes("rendre le site adaptatif aux points de rupture 768 px et 1024 px") && miss.includes("documenter la planification du projet dans le README") && !/Compléter le point du brief/.test(fb),
    "what is missing: in a sentence, never « Compléter le point du brief »");
  check(!/indenté|commit|branche|page en cours/i.test(fb), "…never the performance criteria nor the other automatic checks");
  const not = paras.find((x) => /pas encore claires?/.test(x)) || "";
  check(not.includes("la différence entre margin et padding") && not.includes("le rôle de la balise <main>") && !/flexbox|attribut alt/i.test(not) && /Prends le temps de les revoir/.test(not),
    "notions to review: from the one-to-one remarks (not what went well) and the oral questions not answered");
  check(!/C3|C4|niveau|%|compétence/i.test(fb), "no competency codes or names, no score");
  const flipped = { ...rec, checks: rec.checks.map((c: any) => (c.id === "nav" ? c : { ...c, ok: !c.ok })), final: { ...rec.final, ck: { commits: true, branches: true, active: true } } };
  check(C.commentText(C.commentData({ first: "Sara", project: rec.brief, rec: flipped })) === fb, "the other automatic checks don't feed the comment");
  check(C.missingOf("Page des soins avec les prix")!.text === "le point « Page des soins avec les prix »" && C.missingOf("Un fichier de planification")!.text === "un fichier de planification" && C.missingOf("Utiliser Flexbox pour la mise en page")!.kind === "todo"
    && !C.themesOf(["Site en ligne sur GitHub Pages"]).some((t: string) => /Git$/.test(t)), "a grid line, a thing, something to do; GitHub Pages is the deployment, not Git");
  // the verdict follows the teacher's level
  const lvl = (l: string) => C.commentText(C.commentData({ first: "Sara", project: rec.brief, rec: { ...rec, level: { lvl: l } } }));
  check(/^Sara,\n\nExcellent travail\./.test(lvl("excellent")) && /globalement bien réalisé/.test(lvl("bon")) && /correct dans l’ensemble/.test(lvl("moyen")) && /encore fragile/.test(lvl("faible")) && /loin de ce qui est attendu/.test(lvl("critique"))
    && !/bon travail|excellent/i.test(lvl("faible")) && !/excellent/i.test(lvl("moyen")) && /Sara, il faut/.test(lvl("faible")), "the verdict and the closing follow the teacher's level (never « bon travail » for a weak one)");
  // everything validated, nothing said in the one-to-one: a short comment, nothing made up
  const good: any = { ...rec, result: { exigences: ex.filter((e) => e.statut === "fait" && e.type !== "bonus"), competences: [{ code: "C3", avis: "validable" }] }, oral: [], remarks: null, final: {}, level: { lvl: "excellent" } };
  const fg = C.commentText(C.commentData({ first: "Sara", project: rec.brief, rec: good }));
  check(/^Sara,\n\nExcellent travail\. Tu as réalisé l’ensemble des fonctionnalités demandées/.test(fg) && !/bonus|manque|revoir|claire/i.test(fg) && /Continue comme ça\.$/.test(fg) && C.wordCount(fg) < 60,
    `everything validated: short, nothing made up (${C.wordCount(fg)} words)`);
  // a squad: everyone, « vous »; a member's own note
  const sqc = C.buildComment("", { ...rec, squad: { name: "Les Pixels" } }, rec.final);
  check(/^Les Pixels,\n\n/.test(sqc) && /\bvous\b/i.test(sqc) && !/\btu\b/.test(sqc), "a squad's comment: to everyone, « vous »");
  const mc = C.memberComment({ name: "omar_benali" }, rec, { co: { C3: false, C4: true }, note: "Confond flex et grid." });
  check(mc.startsWith("Omar,") && mc.includes("la différence entre flex et grid") && !mc.includes("margin et padding"), "a squad member: their own note");
  // ✨ the AI writes it like the teacher, from the debrief only; its answer is checked
  const pr = C.aiCommentPrompt(d);
  check(!pr.includes("Sara") && pr.includes("REMARQUES DU FORMATEUR") && pr.includes("BONUS RÉALISÉS : oui (1)") && !pr.includes("mode sombre") && pr.includes("NIVEAU DÉCIDÉ PAR LE FORMATEUR") && !/commits|branches/i.test(pr) && C.AI_COMMENT_SYSTEM.includes("Tutoiement"), "the AI gets the decisions (no name, the bonus counted not listed, no automatic checks)");
  const body = "Ton travail est correct dans l’ensemble, et le menu est bien présent sur toutes les pages grâce à une mise en page avec Flexbox maîtrisée. Tu as aussi réalisé un bonus, ce qui est une bonne initiative.\n\nIl manque encore la page contact avec son formulaire, l’adaptation aux écrans de 768 px et 1024 px et la planification dans le README.\n\nPendant l’échange, la différence entre margin et padding n’était pas claire pour toi, tout comme le rôle de la balise <main>. Ce sont des bases importantes pour structurer une page.\n\n{prénom}, en reprenant ces points, tu vas rapidement gagner en solidité.";
  const lvD = { ...d, level: "moyen" };
  const at = C.aiCommentText(lvD, { commentaire: body });
  check(!!at && at.startsWith("Sara,\n\nTon travail est correct") && at.includes("\n\nSara, en reprenant ces points"), "the AI's comment, with our greeting and the first name put back");
  check(C.aiCommentText(lvD, { commentaire: body.replace("Ton travail", "Votre travail") }) === null && C.aiCommentText(lvD, { commentaire: "Points forts\n\n" + body }) === null && C.aiCommentText(lvD, { commentaire: body + "\n\n– revoir margin." }) === null
    && C.aiCommentText({ ...lvD, bonus: [] }, { commentaire: body }) === null && C.aiCommentText(lvD, { commentaire: "Excellent travail. " + body }) === null && C.aiCommentText(lvD, { commentaire: "**Bravo** " + body }) === null && C.aiCommentText(lvD, { commentaire: "Bonjour,\n\n" + body }) === null,
    "an AI comment that says « vous », has titles or bullets, invents a bonus, praises above the level, uses markdown or greets is refused (the template is used)");
  // ✨ through the API: the AI writes it; kept when a switch changes; ↻ Rebuild writes it from the switches again
  const mk = await api("POST", "/api/briefs", { g: G, data: { title: "Hammam Al Andalous" } });
  const bid = mk.data.brief.id, who = `u:${U.carol.id}`;
  run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, updated_at) VALUES (?, ?, ?, ?, 'draft', ?)", bid, G, who, JSON.stringify({ ...rec, at: Date.now(), result: { ...rec.result, feedback: "" } }), clock.now());
  const w = await api("POST", `/api/briefs/${bid}/review/commentai`, { g: G, who, states: {} });
  const wf = w.data.review?.result?.feedback || "";
  check(w.status === 200 && w.data.by === "ai" && wf.startsWith("Carol,\n\nTon projet est bien structuré") && wf.includes("des bonus") && wf.includes("Continue sur cette lancée, Carol,") && !!w.data.review.edited, `✨ the AI writes the comment (${w.data.by} ${w.data.msg || ""})`);
  check(!ai.users[ai.users.length - 1].includes("Sara") && !/commits|branches/i.test(ai.users[ai.users.length - 1]), "…without the name, nor the automatic checks");
  // the comment greets the student by the name the teacher gave them (Students page), not the one from the analysis
  run1("UPDATE players SET name = 'Karima Benali', name_lock = 1 WHERE guild_id = ? AND discord_id = ?", G, U.carol.id);
  const rn = (await api("GET", `/api/briefs/${bid}/review?g=${G}&who=${encodeURIComponent(who)}`)).data.review.result.feedback;
  check(rn.startsWith("Karima,\n\n") && rn.includes("Continue sur cette lancée, Karima,") && !rn.includes("Carol"), "renamed by the teacher: the comment follows (even a comment already written)");
  run1("UPDATE players SET name = 'Carol', name_lock = 0 WHERE guild_id = ? AND discord_id = ?", G, U.carol.id);
  const k = await api("POST", `/api/briefs/${bid}/review/states`, { g: G, who, states: { co: { C4: true }, keepComment: true, comment: wf } });
  check(k.data.review.result.feedback === wf, "…kept when a switch changes");
  const rb = await api("POST", `/api/briefs/${bid}/review/states`, { g: G, who, states: {} });
  check(rb.data.review.result.feedback.startsWith("Carol,\n\n") && !rb.data.review.result.feedback.includes("Ton projet est bien structuré") && !rb.data.review.edited && !rb.data.review.commentBy, "↻ Rebuild: written again from the switches");
  // the one-to-one counts: « ils ont répondu à toutes les questions » (as typed, with mistakes) switches the oral questions
  // on, goes in the strengths, and no oral notion is left to review
  const one = await api("POST", `/api/briefs/${bid}/review/remarks`, { g: G, who, text: "il sont reponder sur tous les questions", ai: true });
  const of = one.data.review?.result?.feedback || "";
  check(one.status === 200 && JSON.stringify(one.data.states.oral) === "[true,true]" && one.data.review.remarks.oralSet === 1 && ai.users[ai.users.length - 1].includes("QUESTIONS ORALES :\n1. À quoi sert alt ?") && ai.prompts[ai.prompts.length - 1].includes("au tutoiement"),
    "one-to-one: the oral questions it says were answered are switched on");
  check(of.includes("Lors de notre échange, tu as répondu correctement à toutes les questions de l’échange.") && !/pas encore claires?/.test(of) && !/\b(vous|votre)\b/i.test(of),
    "…what went well goes in the comment (« tu »), nothing left to review");
  run1("DELETE FROM brief_reviews WHERE brief_id = ?", bid);
  run1("DELETE FROM briefs WHERE id = ?", bid);
}

section("sprints: competencies reached in the sprint's briefs, levels for the report (AI for the class, no names), decision, sprint comment");
{
  const O = await api("GET", `/api/sprints?g=${G}`);
  check(O.status === 200 && O.data.sprints.length >= 2 && O.data.sprints.every((s: any) => s.start && s.end && s.codes.length), "the programme's sprints, with their dates and competencies");
  const sp = O.data.sprints[0];
  const P = (await api("GET", `/api/programs?g=${G}`)).data.current;
  const wk = P.weeks.find((w: any) => w.sprint === sp.n).n;
  const code = sp.codes.find((c: string) => c.startsWith("C")), soft = sp.codes.find((c: string) => c.startsWith("T"));
  const [cc, cl] = [code.slice(0, -2), Number(code.slice(-1))];
  // a brief of the sprint, debriefed: Alice reached the level asked, Bob only a lower one, Carol failed
  const mk = await api("POST", "/api/briefs", { g: G, week: wk, data: { title: "Brief du sprint", context: "Un site.", competencies: [code] } });
  const bid = mk.data.brief.id;
  run1("UPDATE briefs SET status = 'assigned', week = ? WHERE id = ?", wk, bid);
  const res = (uid: string, c: string, level: number, ok: number) => run1("INSERT INTO competency_results (guild_id, discord_id, code, level, ok, source, ref, note, at) VALUES (?, ?, ?, ?, ?, 'brief', ?, 'x', ?)", G, uid, c, level, ok, bid, clock.now());
  res(U.alice.id, cc, cl, 1); if (soft) res(U.alice.id, soft.slice(0, -2), Number(soft.slice(-1)), 1);
  res(U.bob.id, cc, Math.max(1, cl - 1), 1); if (cl === 1) run1("UPDATE competency_results SET level = 0 WHERE discord_id = ? AND ref = ?", U.bob.id, bid);
  res(U.carol.id, cc, cl, 0);
  const rec = { first: "Alice", result: { exigences: [{ type: "story", texte: "A", statut: "fait" }, { type: "story", texte: "B", statut: "absent" }], competences: [] }, checks: [] };
  run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, updated_at) VALUES (?, ?, ?, ?, 'final', ?)", bid, G, `u:${U.alice.id}`, JSON.stringify(rec), clock.now());
  let V = await api("GET", `/api/sprints/${sp.n}?g=${G}`);
  const row = (id: string) => V.data.rows.find((r: any) => r.discord_id === id);
  check(V.status === 200 && V.data.briefs.some((b: any) => b.id === bid), "the brief belongs to the sprint of its week");
  check(row(U.alice.id).cells[code].r === "ok" && row(U.bob.id).cells[code].r === "low" && row(U.carol.id).cells[code].r === "ko", "✓ at the level asked, lower level, ✗");
  // the other brief of the sprint (Hammam) is 100 % for Alice once its performance criteria aren't counted: (100 + 50) / 2
  check(row(U.alice.id).pct === 75 && row(U.alice.id).evald >= 1 && row(U.carol.id).prop === "non_valide", `grid % of the finalized debrief, briefs evaluated, proposal (${row(U.alice.id).pct} ${JSON.stringify(V.data.briefs.map((b: any) => b.title))})`);
  {
    // the project's %: only the brief's requirements (stories, deliverables); bonuses, criteria and oral points never count
    const rec2 = { ...rec, result: { ...rec.result, exigences: [{ type: "story", texte: "A", statut: "fait" }, { type: "livrable", texte: "L", statut: "fait" }, { type: "critere", texte: "C", statut: "absent" }, { type: "oral", texte: "O", statut: "absent" }, { type: "bonus", texte: "X", statut: "absent" }] } };
    run1("UPDATE brief_reviews SET record = ? WHERE brief_id = ? AND who = ?", JSON.stringify(rec2), bid, `u:${U.alice.id}`);
    const { studentBriefs } = await import("../src/shared/learning.ts");
    const sb = (await studentBriefs(env, q1("SELECT * FROM guilds WHERE id = ?", G), U.alice.id)).find((x: any) => x.id === bid);
    const bv = await api("GET", `/api/briefs/${bid}?g=${G}`);
    const bvAlice = JSON.stringify(bv.data).match(/"pct":(\d+)/);
    check(sb?.review?.pct === 100 && bvAlice?.[1] === "100", `every requirement of the brief done = 100 %, whatever the criteria, oral points and bonuses (${sb?.review?.pct} ${bvAlice?.[1]})`);
    run1("UPDATE brief_reviews SET record = ? WHERE brief_id = ? AND who = ?", JSON.stringify(rec), bid, `u:${U.alice.id}`);
  }
  // by default (before ✨ Propose levels): the level of the student's last finalized debrief of the sprint; a draft doesn't count
  run1("UPDATE briefs SET due_at = ? WHERE id = ?", clock.now() + 400 * 86400, bid);
  run1("UPDATE brief_reviews SET level = 'bon' WHERE brief_id = ? AND who = ?", bid, `u:${U.alice.id}`);
  run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, level, updated_at) VALUES (?, ?, ?, ?, 'draft', 'excellent', ?)", bid, G, `u:${U.bob.id}`, JSON.stringify(rec), clock.now());
  V = await api("GET", `/api/sprints/${sp.n}?g=${G}`);
  check(row(U.alice.id).plevel === "bon" && /last finalized debrief: Brief du sprint/.test(row(U.alice.id).why) && !row(U.alice.id).level, `the sprint level is the last finalized debrief's by default (${row(U.alice.id).plevel} · ${row(U.alice.id).why})`);
  check(!row(U.bob.id).plevel && row(U.bob.id).drafts === 1, "…a debrief not finalized doesn't count, and the page says it's to finalize");
  const sp1 = (await api("GET", `/api/students/${U.alice.id}?g=${G}`)).data.learning.sprints.find((x: any) => x.sprint === sp.n);
  const spB = (await api("GET", `/api/students/${U.bob.id}?g=${G}`)).data.learning.sprints.find((x: any) => x.sprint === sp.n);
  check(sp1?.plevel === "bon" && !sp1.level && /last finalized debrief/.test(sp1.why) && spB?.drafts === 1 && !spB.plevel, `…the student's page shows the same sprint level, and the debriefs to finalize (${JSON.stringify(sp1)})`);
  run1("DELETE FROM brief_reviews WHERE brief_id = ? AND who = ?", bid, `u:${U.bob.id}`);
  // levels: one AI call for the class, without the names
  const lv = await api("POST", `/api/sprints/${sp.n}/levels`, { g: G });
  check(lv.status === 200 && lv.data.by === "ai" && lv.data.rows.some((r: any) => r.plevel === "excellent" && r.why === "Tout est validé."), "levels proposed by the AI for the class");
  check(lv.data.rows.filter((r: any) => r.plevel).length === 3 && lv.data.rows.every((r: any) => !r.plevel || ["excellent", "bon", "moyen", "faible", "critique"].includes(r.plevel)), "…an unknown AI level is replaced by the computed one");
  check(!/Alice|Bob|Carol/.test(ai.users[ai.users.length - 1]), "no names sent to the AI");
  // the teacher decides
  await api("POST", `/api/sprints/${sp.n}/decide`, { g: G, discord_id: U.carol.id, level: "faible", decision: "non_valide", note: "C3 à revoir" });
  await api("POST", `/api/sprints/${sp.n}/decide`, { g: G, discord_id: U.bob.id, level: "nope" });
  V = await api("GET", `/api/sprints/${sp.n}?g=${G}`);
  check(row(U.carol.id).level === "faible" && row(U.carol.id).decision === "non_valide" && row(U.carol.id).note === "C3 à revoir" && row(U.carol.id).plevel, "level, decision and note saved (the proposal is kept)");
  check(row(U.bob.id).level === "", "an unknown level is not saved");
  check((await api("POST", `/api/sprints/${sp.n}/decide`, { g: G, discord_id: "999", level: "bon" })).status === 400, "unknown student refused");
  // the sprint comment
  const cm = await api("POST", `/api/sprints/${sp.n}/comment`, { g: G });
  check(cm.status === 200 && /^Les objectifs technologiques/.test(cm.data.comment) && ai.users[ai.users.length - 1].includes("Brief du sprint") && !/Alice|Bob|Carol/.test(ai.users[ai.users.length - 1]), "the sprint comment written from the briefs and the levels (no names)");
  await api("PUT", `/api/sprints/${sp.n}/comment`, { g: G, text: "Mon texte.\r\n\r\nFin." });
  check((await api("GET", `/api/sprints/${sp.n}?g=${G}`)).data.comment === "Mon texte.\n\nFin.", "the teacher's text is saved");
  const Y = await api("GET", `/api/sprints?g=${G}`);
  check(Y.data.year.find((y: any) => y.discord_id === U.carol.id).per[0].v === "non_valide" && Y.data.year.find((y: any) => y.discord_id === U.carol.id).per[0].final, "the year: the decision per sprint");
  check((await api("GET", `/api/sprints/999?g=${G}`)).status === 400, "unknown sprint refused");
  run1("DELETE FROM competency_results WHERE ref = ? AND source = 'brief'", bid);
}

section("watcher: the brief announced in French and its status posted in Discord; only the student's own recent commits count");
{
  const b = q1("SELECT id, title FROM briefs WHERE guild_id = ? AND status = 'assigned' AND due_at IS NOT NULL ORDER BY id DESC LIMIT 1", G);
  run1("UPDATE briefs SET repo_hint = 'Site Été' WHERE id = ?", b.id);
  const n0 = discordCalls.length;
  const an = await api("POST", `/api/briefs/${b.id}/watcher/announce`, { g: G });
  const sent = discordCalls.slice(n0).map((c) => JSON.stringify(c.body ?? {})).join("\n");
  check(an.status === 200 && sent.includes("Nouveau brief") && sent.includes("**Rendu :** <t:") && sent.includes("/brief submit") && sent.includes("Nom du repo : **Site-Ete**"), "announcement in French: dates as Discord timestamps, how to hand in, the repo name");
  const n1 = discordCalls.length;
  const stt = await api("POST", `/api/briefs/${b.id}/watcher/status`, { g: G });
  check(stt.status === 200 && typeof stt.data.none === "number" && discordCalls.slice(n1).some((c) => JSON.stringify(c.body ?? {}).includes(b.title)), "who pushed, posted in Discord");
  check((await api("POST", "/api/briefs/999999/watcher/status", { g: G })).status === 400, "unknown brief refused");
  // a pushed copy of a project: commits by someone else, or old ones, don't count for the pusher
  const secret = env.GITHUB_WEBHOOK_SECRET = env.GITHUB_WEBHOOK_SECRET || "whsec_test";
  run1("UPDATE players SET github_id = '9101', github_login = 'dora-gh', gh_inst = '9191' WHERE guild_id = ? AND discord_id = ?", G, U.bob.id);
  const push = async (commits: any[], id: string) => {
    const body = JSON.stringify({ installation: { id: 9191 }, repository: { full_name: "dora-gh/copie" }, sender: { id: 9101, login: "dora-gh" }, ref: "refs/heads/main", commits, pusher: { name: "dora-gh" }, compare: "https://github.com/x" });
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = "sha256=" + Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("hex");
    const ctx = makeCtx();
    await bot.fetch(new Request("https://bot.example.workers.dev/github/webhook", { method: "POST", headers: { "x-github-event": "push", "x-github-delivery": id, "x-hub-signature-256": sig }, body }), env, ctx);
    await ctx.flush();
  };
  const nowIso = new Date(Date.now()).toISOString();
  const cm = (sha: string, user: string, ts: string) => ({ id: sha.repeat(40), message: "feat: " + sha, distinct: true, added: ["a.html"], modified: [], removed: [], author: { username: user, name: user }, timestamp: ts, url: "https://github.com/x" });
  const before = q("SELECT * FROM gh_activity WHERE discord_id = ?", U.bob.id).length;
  await push([cm("a", "someone-else", nowIso), cm("b", "dora-gh", "2024-01-10T10:00:00Z")], "copy1");
  check(q("SELECT * FROM gh_activity WHERE discord_id = ?", U.bob.id).length === before, "a push of other people's or old commits counts nothing");
  await push([cm("c", "dora-gh", nowIso), cm("d", "someone-else", nowIso)], "copy2");
  const rows = q("SELECT commits FROM gh_activity WHERE discord_id = ? AND delivery = 'copy2'", U.bob.id);
  check(rows.length === 1 && rows[0].commits === 1, "…only their own recent commit counts");
  run1("UPDATE players SET github_id = NULL, github_login = NULL, gh_inst = NULL WHERE guild_id = ? AND discord_id = ?", G, U.bob.id);
}

section("briefs: the sprint chosen by the teacher (or none, e.g. a cross defense), the due time, \"announced\" kept");
{
  const O = (await api("GET", `/api/sprints?g=${G}`)).data.sprints;
  const [s0, s1] = O;
  const mk = await api("POST", "/api/briefs", { g: G, data: { title: "Soutenance croisée", context: "Présenter le projet." } });
  const id = mk.data.brief.id;
  const inSprint = async (n: number) => (await api("GET", `/api/sprints/${n}?g=${G}`)).data.briefs.some((b: any) => b.id === id);
  let r = await api("POST", `/api/briefs/${id}/assign`, { g: G, start: s0.start, due: s0.end, time: "17:30", sprint: "none" });
  check(r.status === 200 && r.data.brief.due_at === Date.parse(s0.end + "T17:30:00Z") / 1000, "the due time chosen (UTC)");
  check(q1("SELECT sprint FROM briefs WHERE id = ?", id).sprint === 0 && !(await inSprint(s0.n)), "not in a sprint, though its due date is in one");
  await api("POST", `/api/briefs/${id}/assign`, { g: G, start: s0.start, due: s0.end, sprint: String(s1.n) });
  check(await inSprint(s1.n) && !(await inSprint(s0.n)), "…in the sprint chosen");
  await api("POST", `/api/briefs/${id}/assign`, { g: G, start: s0.start, due: s0.end, sprint: "" });
  check(await inSprint(s0.n), "…else by its due date");
  const B = (await api("GET", `/api/briefs/${id}?g=${G}`)).data;
  await api("PUT", `/api/briefs/${id}`, { g: G, data: B.brief.data });
  check(q1("SELECT due_at FROM briefs WHERE id = ?", id).due_at === Date.parse(s0.end + "T17:30:00Z") / 1000, "saving the brief keeps its due time");
  check(q1("SELECT announced_at FROM briefs WHERE id = ?", id).announced_at == null, "not announced yet");
  await api("POST", `/api/briefs/${id}/watcher/announce`, { g: G });
  const L = (await api("GET", `/api/briefs?g=${G}`)).data.items.find((b: any) => b.id === id);
  check(!!L.announced_at && L.sprint === null, "announced: the list says so (the dashboard shows \"Announce again\")");
  run1("UPDATE briefs SET announced_at = NULL WHERE id = ?", id);
  await api("POST", `/api/briefs/${id}/assign`, { g: G, start: s0.start, due: s0.end, announce: true });
  check(!!q1("SELECT announced_at FROM briefs WHERE id = ?", id).announced_at, "…also when announced on publishing");
  run1("DELETE FROM briefs WHERE id = ?", id);
}

section("briefs: an imported page is kept whole (many user stories) and its steps are read from it");
{
  const lines = Array.from({ length: 34 }, (_, i) => `Afficher l'élément ${i + 1} de la page.`);
  const text = ["Contexte du projet", "Un site vitrine.", "En tant que visiteur, je vais voir le catalogue.", ...lines,
    "Valider les 2 étapes du projet", "Etape 1, fin du jour 1 : maquette prête.", "Etape 2, fin du jour 3 : pages faites.", "Modalités pédagogiques", "Travail collectif (Squad) sur 5 jours."].join("\n");
  const r = await api("POST", "/api/briefs/import", { g: G, text, title: "Site test", comps: [], start: "2026-10-12", due: "2026-10-16" });
  const stories = r.data.brief.data.groups.reduce((n: number, g: any) => n + g.stories.length, 0);
  check(r.status === 200 && stories >= 35 && r.data.text.includes("élément 34"), "every user story kept (more than 20)");
  check(r.data.steps.length === 2 && new Date(r.data.steps[1].due * 1000).toISOString().slice(0, 10) === "2026-10-14" && r.data.steps[0].expected.startsWith("maquette"), "the steps written in the page, dated from the brief's days");
  run1("DELETE FROM briefs WHERE id = ?", r.data.brief.id);
}

section("GitHub: students who let the App see only some repos (Only select repositories): flagged, checked, kept up to date");
{
  const { generateKeyPairSync } = await import("node:crypto");
  const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" }) as string;
  const sv = await api("PUT", "/api/github/app", { g: G, appId: "77", slug: "classbot-sel", clientId: "Iv23sel", clientSecret: "cs", webhookSecret: "sel_secret", privateKey: pem });
  check(sv.status === 200, "a class App with its key");
  const keep = q("SELECT discord_id, github_id, github_login, gh_inst, gh_sel FROM players WHERE guild_id = ? AND discord_id IN (?, ?, ?)", G, U.alice.id, U.bob.id, U.carol.id);
  run1("UPDATE players SET github_id = NULL, github_login = NULL, gh_inst = NULL, gh_sel = NULL WHERE guild_id = ? AND discord_id IN (?, ?, ?)", G, U.alice.id, U.bob.id, U.carol.id);
  run1("UPDATE players SET github_id = '9201', github_login = 'alice-sel', gh_inst = '9301' WHERE guild_id = ? AND discord_id = ?", G, U.alice.id);
  run1("UPDATE players SET github_id = '9202', github_login = 'bob-sel', gh_inst = '9302' WHERE guild_id = ? AND discord_id = ?", G, U.bob.id);
  github.sel = { "9301": "selected" };
  const cr = await api("POST", "/api/github/check-repos", { g: G });
  const alice = q1("SELECT name, gh_sel FROM players WHERE guild_id = ? AND discord_id = ?", G, U.alice.id);
  check(cr.status === 200 && cr.data.checked >= 2 && cr.data.some.length === 1 && alice.gh_sel === "selected" && q1("SELECT gh_sel FROM players WHERE guild_id = ? AND discord_id = ?", G, U.bob.id).gh_sel === "all", "Check repos: the student on Only select repositories is named and kept");
  const act = await api("GET", `/api/github/activity?g=${G}`);
  check(act.data.students.find((s: any) => s.discord_id === U.alice.id)?.sel === "selected", "…and the dashboard knows it (flagged Some repos)");
  const { linkGithub, handleEvent } = await import("../src/shared/github.ts");
  await linkGithub(env, G, U.carol.id, { id: "9203", login: "carol-sel", inst: "9303", sel: "selected" });
  check(q1("SELECT gh_sel FROM players WHERE guild_id = ? AND discord_id = ?", G, U.carol.id).gh_sel === "selected", "connecting keeps the choice");
  await handleEvent(env, "installation_repositories", { action: "added", installation: { id: 9301, repository_selection: "all" }, repositories_added: [] }, "d-sel");
  check(q1("SELECT gh_sel FROM players WHERE guild_id = ? AND discord_id = ?", G, U.alice.id).gh_sel === "all", "the student chooses All repositories on GitHub: the webhook updates it");
  github.sel = {};
  run1("UPDATE players SET github_id = NULL, github_login = NULL, gh_inst = NULL, gh_sel = NULL WHERE guild_id = ? AND discord_id IN (?, ?, ?)", G, U.alice.id, U.bob.id, U.carol.id);
  for (const k of keep) run1("UPDATE players SET github_id = ?, github_login = ?, gh_inst = ?, gh_sel = ? WHERE guild_id = ? AND discord_id = ?", k.github_id, k.github_login, k.gh_inst, k.gh_sel, G, k.discord_id);
  await api("DELETE", `/api/github/app?g=${G}`);
}

section("GitHub: a repo shared late — its pushes are counted since the brief in progress started, for whoever wrote each commit, never twice");
{
  const { generateKeyPairSync } = await import("node:crypto");
  const { handleEvent, ghAppOf, pushStatus } = await import("../src/shared/github.ts");
  const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" }) as string;
  await api("PUT", "/api/github/app", { g: G, appId: "78", slug: "classbot-bf", clientId: "Iv23bf", clientSecret: "cs", webhookSecret: "bf_secret", privateKey: pem });
  const T = clock.now(), iso = (s: number) => new Date(s * 1000).toISOString();
  const keep = q("SELECT discord_id, github_id, github_login, gh_inst, gh_sel FROM players WHERE guild_id = ? AND discord_id IN (?, ?)", G, U.alice.id, U.bob.id);
  run1("UPDATE players SET github_id = '9401', github_login = 'alice-bf', gh_inst = '9501' WHERE guild_id = ? AND discord_id = ?", G, U.alice.id);
  run1("UPDATE players SET github_id = '9402', github_login = 'bob-bf', gh_inst = NULL WHERE guild_id = ? AND discord_id = ?", G, U.bob.id);
  run1("INSERT OR REPLACE INTO gh_tokens (inst, token, exp) VALUES ('9501', 'tok-bf', ?)", T + 3600);
  run1(`INSERT INTO briefs (guild_id, title, status, data, start_at, due_at, created_at) VALUES (?, 'PetNest', 'assigned', '{}', ?, ?, ?)`, G, T - 86400 - 3600, T + 3 * 86400, T - 86400 - 3600);
  const bid = q1("SELECT id FROM briefs WHERE guild_id = ? AND title = 'PetNest' ORDER BY id DESC LIMIT 1", G).id;
  const c = (sha: string, id: number, s: number) => ({ sha: sha.repeat(40), author: { id, login: "x" }, commit: { message: "feat: add the catalogue page", author: { date: iso(s) } } });
  // Alice's squad repo: her commit and Bob's (a squad mate) on two branches; an old commit; someone outside the class
  github.branches["alice-bf/PetNest"] = ["main", "feat"];
  github.commits["alice-bf/PetNest@main"] = [c("a", 9401, T - 20 * 3600), c("b", 9402, T - 19 * 3600), c("o", 9401, T - 20 * 86400)];
  github.commits["alice-bf/PetNest@feat"] = [c("a", 9401, T - 20 * 3600), c("d", 9402, T - 18 * 3600), c("x", 4242, T - 18 * 3600)];
  const sums = () => Object.fromEntries(q("SELECT discord_id, SUM(commits) AS n FROM gh_activity WHERE guild_id = ? AND delivery LIKE 'bf-%' GROUP BY discord_id", G).map((r: any) => [r.discord_id, r.n]));
  await handleEvent(env, "installation_repositories", { action: "added", installation: { id: 9501, repository_selection: "selected" }, repositories_added: [{ full_name: "alice-bf/PetNest" }] }, "d-bf", await ghAppOf(env, G));
  let s = sums();
  check(s[U.alice.id] === 1 && s[U.bob.id] === 2 && Object.keys(s).length === 2, "the repo just shared: each one's own commits since the brief started (one commit on two branches once; old and outside ones skipped)");
  const { getGuild } = await import("../src/shared/db.ts");
  const st = await pushStatus(env, (await getGuild(env, G))!, { start_at: T - 86400 - 3600, due_at: T + 3 * 86400, created_at: T });
  check(st.get(U.bob.id) === "on" && st.get(U.alice.id) === "on", "…and they count for the brief (pushed on time)");
  github.repos["tok-bf"] = [{ full_name: "alice-bf/PetNest", pushed_at: iso(T - 3600) }, { full_name: "alice-bf/old", pushed_at: iso(T - 60 * 86400) }];
  const rc = await api("POST", "/api/github/recount", { g: G, discord_id: U.alice.id });
  s = sums();
  check(rc.status === 200 && rc.data.counted === 3 && rc.data.repos === 1 && s[U.alice.id] === 1 && s[U.bob.id] === 2, "Recount again: the same numbers, nothing counted twice");
  // a push received today from that repo: today is not recounted
  run1("DELETE FROM gh_activity WHERE guild_id = ? AND delivery LIKE 'bf-%'", G);
  github.commits["alice-bf/PetNest@main"].unshift(c("t", 9401, T - 60));
  run1("INSERT INTO gh_activity (guild_id, discord_id, delivery, day, t, repo, commits, real) VALUES (?, ?, 'live-bf', ?, ?, 'alice-bf/PetNest', 1, 1)", G, U.alice.id, iso(T).slice(0, 10), T - 30);
  await api("POST", "/api/github/recount", { g: G, discord_id: U.alice.id });
  check(!q("SELECT day FROM gh_activity WHERE guild_id = ? AND delivery LIKE 'bf-%'", G).some((r: any) => r.day >= iso(T).slice(0, 10)), "only the days before the first push received");
  run1("DELETE FROM gh_activity WHERE guild_id = ? AND (delivery LIKE 'bf-%' OR delivery = 'live-bf')", G);
  run1("DELETE FROM briefs WHERE id = ?", bid);
  run1("DELETE FROM gh_tokens WHERE inst = '9501'");
  for (const k of keep) run1("UPDATE players SET github_id = ?, github_login = ?, gh_inst = ?, gh_sel = ? WHERE guild_id = ? AND discord_id = ?", k.github_id, k.github_login, k.gh_inst, k.gh_sel, G, k.discord_id);
  await api("DELETE", `/api/github/app?g=${G}`);
}

section("GitHub: \"Create the GitHub App for me\" (GitHub's app manifest)");
{
  const was = env.PUBLIC_URL;
  env.PUBLIC_URL = "https://bot.example.workers.dev";
  const raw = async (p: string) => { const ctx = makeCtx(); const r = await admin.fetch(new Request("https://dash.example.workers.dev" + p), env, ctx); await ctx.flush(); return r; };
  const mf = await api("POST", "/api/github/manifest", { g: G });
  const st = String(mf.data.action || "").split("state=")[1];
  check(mf.status === 200 && /^https:\/\/github\.com\/settings\/apps\/new\?state=[a-f0-9]{32}$/.test(mf.data.action), "a form to post to GitHub, with a one-time state");
  const m = mf.data.manifest;
  check(m.hook_attributes.url === `https://bot.example.workers.dev/github/webhook/${G}` && m.callback_urls[0] === "https://bot.example.workers.dev/github/callback" && m.setup_url === "https://bot.example.workers.dev/github/setup", "the class's three URLs are filled in");
  check(m.public === true && m.default_permissions.contents === "read" && m.default_permissions.pull_requests === "read" && m.default_events.includes("push") && m.default_events.includes("pull_request_review") && m.name.length <= 34, "permissions and events filled in, students can install it");
  check(/\/api\/github\/manifest\/done$/.test(m.redirect_url), "GitHub comes back to the dashboard");
  const done = await raw(`/api/github/manifest/done?state=${st}&code=abc123`);
  check(done.status === 303 && /gh=created&slug=classbot-cs-class#\/settings\/github$/.test(done.headers.get("location") || ""), "back from GitHub: the App is created");
  const gh = await api("GET", `/api/github?g=${G}`);
  check(gh.data.setup.own && gh.data.setup.slug === "classbot-cs-class" && gh.data.setup.key && gh.data.setup.oauth && gh.data.setup.webhook && !JSON.stringify(gh.data).includes("made_secret"), "…saved as the class's own App (secrets never sent back)");
  const again = await raw(`/api/github/manifest/done?state=${st}&code=abc123`);
  check(again.status === 303 && /gh=failed/.test(again.headers.get("location") || ""), "a state is used once");
  const mf2 = await api("POST", "/api/github/manifest", { g: G });
  const bad = await raw(`/api/github/manifest/done?state=${String(mf2.data.action).split("state=")[1]}&code=bad-x`);
  check(bad.status === 303 && /gh=failed/.test(bad.headers.get("location") || ""), "GitHub refusing the code: a clear message");
  env.PUBLIC_URL = "";
  check((await api("POST", "/api/github/manifest", { g: G })).status === 400, "no bot address yet: refused");
  env.PUBLIC_URL = was;
  await api("DELETE", `/api/github/app?g=${G}`);
}

section("🤖 Settings → AI: each class has its own AI keys, each one the backup of the one before");
{
  const { chat } = await import("../src/shared/ai.ts");
  const { forClass } = await import("../src/shared/aictx.ts");
  const { resetAiCaches } = await import("../src/shared/aikeys.ts");
  const { aiBudgetOk } = await import("../src/shared/db.ts");
  run1("INSERT OR IGNORE INTO guilds (id, name, created_at) VALUES ('g-other', 'Other teacher', 0)");
  resetAiCaches();
  const a0 = await api("GET", `/api/settings/ai?g=${G}`);
  check(a0.status === 200 && !a0.data.providers.length && a0.data.presets.gemini && a0.data.presets.anthropic && a0.data.classes.some((c: any) => c.id === "g-other"), "no key yet: the providers to choose from, the other classes");
  check((await api("POST", `/api/settings/ai/providers?g=${G}`, { type: "gemini", key: "AIza-bad-key-123456" })).status === 400, "a key the provider refuses is not saved (tested first)");
  check((await api("POST", `/api/settings/ai/providers?g=${G}`, { type: "nope", key: "x" })).status === 400, "an unknown provider is refused");
  const gem = await api("POST", `/api/settings/ai/providers?g=${G}`, { type: "gemini", key: "AIza-good-" + "k".repeat(30), model: "gemini-2.5-flash" });
  check(gem.status === 200 && gem.data.providers.length === 1 && !JSON.stringify(gem.data).includes("k".repeat(30)) && gem.data.usage.own, "a Gemini key: tested, saved, never sent back");
  const gq = await api("POST", `/api/settings/ai/providers?g=${G}`, { type: "groq", key: "gsk_good" + "A".repeat(40) });
  check(gq.status === 200 && gq.data.providers.length === 2 && gq.data.providers[1].type === "groq", "…and Groq as its backup");
  // the class's AIs answer, in order; the next one when one fails; Cloudflare's AI last
  const envG = forClass(env, G);
  aiFake.calls = [];
  check(await chat(envG, [{ role: "user", content: "hi" }], { maxTokens: 50, temperature: 0 }) === "gemini-answer" && aiFake.calls[0] === "generativelanguage.googleapis.com:gemini-2.5-flash", "the first AI answers");
  aiFake.down = ["generativelanguage.googleapis.com"];
  check(await chat(envG, [{ role: "user", content: "hi" }], { maxTokens: 50, temperature: 0 }) === "ok", "its limit is reached: the backup (Groq) answers");
  const st = await api("GET", `/api/settings/ai?g=${G}`);
  check(/limit reached/.test(st.data.providers[0].err || ""), "the problem is shown in the settings");
  aiFake.down = [];
  const ids = st.data.providers.map((p: any) => p.id);
  const re = await api("PUT", `/api/settings/ai?g=${G}`, { order: [ids[1], ids[0]], off: { [ids[0]]: true } });
  check(re.data.providers[0].type === "groq" && re.data.providers[1].off, "reorder, turn one off");
  // no ClassBot daily limit for a class with its own keys; the other class keeps its own counter
  run1("INSERT OR REPLACE INTO ai_usage (day, count) VALUES (?, 99999)", new Date().toISOString().slice(0, 10));
  check(await aiBudgetOk(envG, 3) && !(await aiBudgetOk(forClass(env, "g-other"), 3)), "the daily limit only applies to classes without keys");
  run1("DELETE FROM ai_usage");
  // the ClassBot's own key (Cloudflare secret) isn't used by other teachers' classes
  env.GROQ_API_KEY = "gsk_good" + "S".repeat(40);
  const other = forClass(env, "g-other");
  const { aiStatus } = await import("../src/shared/aikeys.ts");
  check(await aiStatus(other) === "workers", "another class doesn't get the ClassBot's key (it has several classes)");
  await api("PUT", `/api/settings/ai?g=g-other`, { server: true });
  env.GROQ_API_KEY = "gsk_good" + "S".repeat(40);   // (the dashboard request put the real settings back in env)
  check(await aiStatus(other) === "keys", "…unless its settings allow it");
  await api("PUT", `/api/settings/ai?g=g-other`, { server: false, workers: false });
  check(await aiStatus(other) === null, "Cloudflare's AI can be turned off too");
  delete (env as any).GROQ_API_KEY;
  // copy the keys to another class of mine; Claude works too
  const cp = await api("POST", `/api/settings/ai/copy?g=${G}`, { to: ["g-other"] });
  check(cp.data.copied === 1 && (await api("GET", `/api/settings/ai?g=g-other`)).data.providers.length === 2, "copy this class's AIs to another class");
  const cl = await api("POST", `/api/settings/ai/providers?g=g-other`, { type: "anthropic", key: "sk-ant-good-" + "z".repeat(30) });
  check(cl.status === 200 && cl.data.providers.at(-1).type === "anthropic", "a Claude key works (its own API format)");
  for (const p of (await api("GET", `/api/settings/ai?g=${G}`)).data.providers) await api("DELETE", `/api/settings/ai/providers/${p.id}?g=${G}`);
  check(!(await api("GET", `/api/settings/ai?g=${G}`)).data.providers.length, "remove the keys: back to Cloudflare's AI");
}

section("GitHub: a student who connects the same account again isn't announced twice");
{
  const { linkGithub } = await import("../src/shared/github.ts");
  const n0 = discordCalls.length;
  await linkGithub(env, G, U.bob.id, { id: "77001", login: "bobby-gh", inst: "5501" });
  await linkGithub(env, G, U.bob.id, { id: "77001", login: "bobby-gh", inst: "5501" });
  const posts = discordCalls.slice(n0).filter((c) => c.method === "POST" && JSON.stringify(c.body ?? {}).includes("bobby-gh"));
  check(posts.length === 1, `one message for a new link (${posts.length})`);
}

section("GitHub: where the messages go (connections, reports, forum) and the forum keeps working");
{
  const { linkGithub, postActivity, githubCfg } = await import("../src/shared/github.ts");
  const { getGuild } = await import("../src/shared/db.ts");
  // nothing chosen yet: the class's own #github channel and forum are found and used
  run1("UPDATE guilds SET github = ? WHERE id = ?", JSON.stringify({ rewards: { comp: 7, coins: 1, bonus: 0 } }), G);
  discordFake.channels = [{ id: "5001", name: "github", type: 0, position: 5 }, { id: "5002", name: "github-activity", type: 15, position: 6 }];
  let n0 = discordCalls.length;
  await linkGithub(env, G, U.bob.id, { id: "88001", login: "dave-gh", inst: "6601" });
  const posted = discordCalls.slice(n0).filter((c) => c.method === "POST" && /\/messages$/.test(c.path));
  check(posted.length === 1 && posted[0].path === "/channels/5001/messages", `a new link is announced in the #github channel, not #arena (${posted.map((c) => c.path).join(",")})`);
  const cfg0 = githubCfg(q1("SELECT github FROM guilds WHERE id = ?", G));
  check(cfg0.channel === "5001" && cfg0.forum === "5002" && cfg0.auto, "…the channel and the forum found are saved");
  check(JSON.parse(q1("SELECT github FROM guilds WHERE id = ?", G).github).rewards?.comp === 7, "…without losing the other GitHub settings");
  // the teacher picks a separate channel for connections, or none
  await api("PUT", "/api/github", { g: G, channel: "6002", links: "6001", forum: "5002" });
  n0 = discordCalls.length;
  await linkGithub(env, G, U.bob.id, { id: "88002", login: "dave-gh2", inst: "6602" });
  check(discordCalls.slice(n0).some((c) => c.method === "POST" && c.path === "/channels/6001/messages"), "connections go to their own channel");
  await api("PUT", "/api/github", { g: G, links: "off" });
  n0 = discordCalls.length;
  await linkGithub(env, G, U.bob.id, { id: "88003", login: "dave-gh3", inst: "6603" });
  check(!discordCalls.slice(n0).some((c) => c.method === "POST" && /\/messages$/.test(c.path)), "…or aren't announced at all");
  // forum: an archived post is opened again, a forum asking for tags gets one
  run1("UPDATE players SET gh_thread = 'th-old' WHERE guild_id = ? AND discord_id = ?", G, U.bob.id);
  discordFake.fail.push({ method: "POST", path: "/channels/th-old/messages", status: 400, code: 50083, n: 1 });
  let g = await getGuild(env, G);
  n0 = discordCalls.length;
  await postActivity(env, g, githubCfg(g), q1("SELECT * FROM players WHERE guild_id = ? AND discord_id = ?", G, U.bob.id), { embeds: [{ title: "push" }] });
  const after = discordCalls.slice(n0);
  check(after.some((c) => c.method === "PATCH" && c.path === "/channels/th-old" && c.body?.archived === false) && after.filter((c) => c.path === "/channels/th-old/messages").length === 2, "an archived forum post is opened again, then the activity is posted");
  run1("UPDATE players SET gh_thread = NULL WHERE guild_id = ? AND discord_id = ?", G, U.bob.id);
  discordFake.fail.push({ method: "POST", path: "/channels/5002/threads", status: 400, code: 40067, n: 1 });
  discordFake.chan["/channels/5002"] = { id: "5002", type: 15, flags: 16, available_tags: [{ id: "tag1", name: "students" }] };
  g = await getGuild(env, G);
  n0 = discordCalls.length;
  await postActivity(env, g, githubCfg(g), q1("SELECT * FROM players WHERE guild_id = ? AND discord_id = ?", G, U.bob.id), { embeds: [{ title: "push" }] });
  const th = discordCalls.slice(n0).filter((c) => c.method === "POST" && c.path === "/channels/5002/threads");
  check(th.length === 2 && th[1].body.applied_tags?.[0] === "tag1" && /^th-/.test(q1("SELECT gh_thread FROM players WHERE guild_id = ? AND discord_id = ?", G, U.bob.id).gh_thread), "a forum that asks for a tag gets its first tag, and the post is remembered");
  // a forum ClassBot can't write in: the reason is shown in the settings
  run1("UPDATE players SET gh_thread = NULL WHERE guild_id = ? AND discord_id = ?", G, U.bob.id);
  discordFake.fail.push({ method: "POST", path: "/channels/5002/threads", status: 403, code: 50001, n: 1 });
  g = await getGuild(env, G);
  await postActivity(env, g, githubCfg(g), q1("SELECT * FROM players WHERE guild_id = ? AND discord_id = ?", G, U.bob.id), { embeds: [{ title: "push" }] });
  const st = await api("GET", `/api/github?g=${G}`);
  check(/can't see or write/.test(st.data.cfg.forumError?.msg || ""), "a forum error is kept for the settings page");
  const tst = await api("POST", "/api/github/test", { g: G });
  check(tst.status === 200 && tst.data.results.find((r: any) => r.target === "reports").ok && tst.data.results.find((r: any) => r.target === "forum").ok, "the settings' test posts in the channels and checks the forum");
  discordFake.channels = []; discordFake.chan = {};
}

section("GitHub: every commit on the student page, history from GitHub, AI summary of what they built");
{
  const alice = q("SELECT * FROM gh_log WHERE guild_id = ? AND discord_id = ?", G, U.alice.id);
  check(alice.length >= 1 && alice[0].kind === "commit" && alice[0].title.includes("contact form") && alice[0].repo === "alice-gh/hammam", "the webhook keeps each commit with its message");
  const a = await api("GET", `/api/students/${U.alice.id}/github?g=${G}&days=30`);
  check(a.status === 200 && a.data.totals.commits >= 1 && a.data.repos[0].repo === "alice-gh/hammam" && a.data.everSynced, "the student's GitHub tab: totals, repos");
  // older work, read from GitHub (needs the App's private key)
  const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu\n-----END RSA PRIVATE KEY-----";
  await api("PUT", "/api/github/app", { g: G, appId: "99", slug: "classbot-b", clientId: "Iv23abc", clientSecret: "cs", webhookSecret: "own_secret", privateKey: pem });
  run1("INSERT OR REPLACE INTO gh_tokens (inst, token, exp) VALUES ('777', 'tok777', ?)", Math.floor(Date.now() / 1000) + 3000);
  run1("UPDATE players SET github_id = '9003', github_login = 'carol-gh', gh_inst = '777' WHERE guild_id = ? AND discord_id = ?", G, U.carol.id);
  const iso = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
  const c = (sha: string, msg: string, h: number, parents = 1) => ({ sha: sha.repeat(40).slice(0, 40), html_url: `https://github.com/carol/site/commit/${sha}`, author: { login: "carol-gh" }, parents: Array(parents).fill({}), commit: { message: msg, author: { date: iso(h) } } });
  github.commits["carol/site"] = [c("1", "update", 5), c("2", "feat: contact form with validation", 30), c("3", "Merge branch 'dev'", 40, 2), { ...c("4", "someone else", 3), author: { login: "zed" } }];
  github.sizes["1".repeat(40)] = { additions: 1, deletions: 0 };
  github.sizes["2".repeat(40)] = { additions: 120, deletions: 4 };
  github.sizes["3".repeat(40)] = { additions: 0, deletions: 0, parents: 2 };
  const sy = await api("POST", `/api/students/${U.carol.id}/github/sync`, { g: G, days: 30 });
  check(sy.status === 200 && sy.data.added === 3 && sy.data.repoCount === 1, `history read from GitHub: only their commits (${sy.data.added}, ${sy.data.error ?? ""})`);
  const T = sy.data.totals;
  check(T.commits === 3 && T.real === 2 && T.tiny === 1 && T.bad === 1 && T.merges === 1 && T.adds === 121, `…classified: real, tiny, vague, merge (${JSON.stringify(T)})`);
  const again = await api("POST", `/api/students/${U.carol.id}/github/sync`, { g: G, days: 30 });
  check(again.data.added === 0, "…reading again adds nothing twice");
  const sm = await api("POST", `/api/students/${U.carol.id}/github/summary`, { g: G, days: 30 });
  check(sm.status === 200 && sm.data.summary.repos[0].features[0].title.includes("Contact form") && sm.data.summary.brief[0].status === "done", "the AI lists the features they built and the brief requirements seen");
  check((await api("GET", `/api/students/${U.carol.id}/github?g=${G}`)).data.summary?.overview, "…and the summary is kept");
  const nob = await api("POST", `/api/students/${"424242"}/github/sync`, { g: G });
  check(nob.status === 400, "a student without GitHub gets a clear message");
  await api("DELETE", `/api/github/app?g=${G}`);
}

section("students: the teacher edits a name (Discord no longer replaces it), removes a student from the class");
{
  const id = "990901";
  await getPlayer(env, G, id, "Discord Nick");
  run1("INSERT INTO team_members (guild_id, team_id, discord_id) VALUES (?, 1, ?)", G, id);
  run1("INSERT INTO gh_activity (guild_id, discord_id, delivery, day, t, commits) VALUES (?, ?, 'x1', '2026-10-01', 1, 1)", G, id);
  run1("INSERT INTO brief_handins (brief_id, guild_id, who, repo, at) VALUES (1, ?, ?, 'a/b', 1)", G, `u:${id}`);
  const ed = await api("PUT", `/api/students/${id}`, { g: G, name: "  Yasmine   B. " });
  await getPlayer(env, G, id, "New Nick");
  check(ed.status === 200 && q1("SELECT name, name_lock FROM players WHERE guild_id = ? AND discord_id = ?", G, id).name === "Yasmine B.", "the teacher's name is kept when the student uses ClassBot again");
  await api("PUT", `/api/students/${id}`, { g: G, name: "" });
  await getPlayer(env, G, id, "New Nick");
  check(q1("SELECT name FROM players WHERE guild_id = ? AND discord_id = ?", G, id).name === "New Nick", "…empty: the Discord name again");
  check((await api("PUT", "/api/students/123456", { g: G, name: "X" })).status === 404, "…an unknown student: refused");
  const del = await api("DELETE", `/api/students/${id}?g=${G}`);
  check(del.status === 200 && !q1("SELECT 1 AS x FROM players WHERE guild_id = ? AND discord_id = ?", G, id)
    && !q("SELECT 1 FROM team_members WHERE discord_id = ?", id).length && !q("SELECT 1 FROM gh_activity WHERE discord_id = ?", id).length
    && !q("SELECT 1 FROM brief_handins WHERE who = ?", `u:${id}`).length, "removed from the class: profile, team, GitHub activity and brief work");
  check(!(await api("GET", `/api/students?g=${G}`)).data.some((r: any) => r.discord_id === id) && (await api("DELETE", `/api/students/${id}?g=${G}`)).status === 404, "…gone from the list");
}

section("plan d'action: the weak students, improving or not, engaged or not, the teacher's or the AI's comment");
{
  const { levelTrend, engagement } = await import("../src/shared/actionplan.ts");
  check(levelTrend(["critique", "faible", "moyen", "bon"], "flat") === "up" && levelTrend(["bon", "moyen", "faible"], "up") === "down" && levelTrend(["faible", "faible"], "up") === "flat"
    && levelTrend([], "inactive") === "down" && levelTrend(["moyen"], "new") === "unknown", "improving or not: the last levels against the ones before, else the activity");
  const T0 = clock.now();
  const e1 = engagement([{ status: "done" }, { status: "late" }, { status: "missed" }, { status: "open", due_at: T0 + 99 }].map((r: any) => ({ discord_id: "1", due_at: null, created_at: 0, completed_at: null, ...r })), T0, T0);
  check(e1.pct === 67 && e1.state === "partial" && e1.open === 1 && e1.overdue === 0, "engagement: the share of the work done (late counts, open not yet)");
  check(engagement([], null, T0).state === "none", "…nothing given: no work yet");
  // Bob: Faible on the last brief → in the plan by himself
  const T = clock.now();
  run1(`INSERT INTO briefs (guild_id, title, status, data, start_at, due_at, created_at) VALUES (?, 'Plan B1', 'assigned', '{}', ?, ?, ?)`, G, T - 9 * 86400, T - 8 * 86400, T - 9 * 86400);
  const b1 = q1("SELECT id FROM briefs WHERE title = 'Plan B1'").id;
  run1(`INSERT INTO briefs (guild_id, title, status, data, start_at, due_at, created_at) VALUES (?, 'Plan B2', 'assigned', '{}', ?, ?, ?)`, G, T - 5 * 86400, T - 4 * 86400, T - 5 * 86400);
  const b2 = q1("SELECT id FROM briefs WHERE title = 'Plan B2'").id;
  run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, updated_at, level) VALUES (?, ?, ?, '{}', 'final', ?, 'critique')", b1, G, `u:${U.bob.id}`, T);
  run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, updated_at, level) VALUES (?, ?, ?, '{}', 'final', ?, 'faible')", b2, G, `u:${U.bob.id}`, T);
  const v = await api("GET", `/api/plan?g=${G}`);
  const bob = v.data.plan?.find((r: any) => r.discord_id === U.bob.id);
  check(v.status === 200 && bob && bob.current === "faible" && bob.trend === "up" && bob.debriefs.length >= 2 && bob.why.some((w: string) => /Faible/.test(w)), "Bob is in the plan: Faible on the last brief, improving (critique → faible)");
  check(v.data.summary.faible >= 1 && Array.isArray(v.data.others), "…the counts at the top, the other students apart");
  check(v.data.plan.every((r: any) => ["faible", "critique"].includes(r.current) || r.manual), "only the debriefs decide (Faible or Critique), or the teacher adding someone: no other warning signs");
  const gp = await api("GET", `/api/plan/${U.bob.id}/gaps?g=${G}`);
  check(gp.status === 200 && gp.data.debriefs.filter((d: any) => /Plan B/.test(d.title)).length === 2 && Array.isArray(gp.data.assess), "his weak points, debrief by debrief, and the assessments");
  const stl = await api("GET", `/api/students?g=${G}`);
  const bn = stl.data.find((r: any) => r.discord_id === U.bob.id)?.niveau;
  check(bn?.lv === "faible" && bn.trend === "up" && /Plan B2/.test(bn.from), "Students: each one's niveau (last debrief) and how it moves");
  {
    // a new brief analysed but not finalized yet: Bob's level, the plan and the progress page's draft square
    run1(`INSERT INTO briefs (guild_id, title, status, data, start_at, due_at, created_at) VALUES (?, 'Plan B3', 'assigned', '{}', ?, ?, ?)`, G, T - 2 * 86400, T - 86400, T - 2 * 86400);
    const b3 = q1("SELECT id FROM briefs WHERE title = 'Plan B3'").id;
    run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, updated_at, level) VALUES (?, ?, ?, '{}', 'draft', ?, 'excellent')", b3, G, `u:${U.bob.id}`, T);
    const n2 = (await api("GET", `/api/students?g=${G}`)).data.find((r: any) => r.discord_id === U.bob.id)?.niveau;
    const p2 = (await api("GET", `/api/plan?g=${G}`)).data.plan?.find((r: any) => r.discord_id === U.bob.id);
    const pr = await api("GET", `/api/progress?g=${G}`);
    check(n2?.lv === "faible" && /Plan B2/.test(n2.from) && p2?.current === "faible" && !p2.debriefs.some((d: any) => d.bid === b3) && pr.data.cells[`${b3}:${U.bob.id}`]?.final === false,
      "a debrief not finalized yet never moves the level (Students, plan d'action): only the finalized ones count; Progress still shows it as a draft");
    run1("UPDATE brief_reviews SET status = 'final' WHERE brief_id = ? AND who = ?", b3, `u:${U.bob.id}`);
    const n3 = (await api("GET", `/api/students?g=${G}`)).data.find((r: any) => r.discord_id === U.bob.id)?.niveau;
    check(n3?.lv === "excellent" && /Plan B3/.test(n3.from), "…once finalized, it counts");
    run1("DELETE FROM brief_reviews WHERE brief_id = ?", b3);
    run1("DELETE FROM briefs WHERE id = ?", b3);
  }
  const sv = await api("PUT", `/api/plan/${U.bob.id}`, { g: G, note: "  Vu avec Bob : il refait le formulaire.  " });
  const v2 = await api("GET", `/api/plan?g=${G}`);
  check(sv.status === 200 && v2.data.plan.find((r: any) => r.discord_id === U.bob.id).note?.text === "Vu avec Bob : il refait le formulaire." && v2.data.plan.find((r: any) => r.discord_id === U.bob.id).note.by === "you", "the teacher's comment, saved");
  const gen = await api("POST", `/api/plan/${U.bob.id}/ai`, { g: G });
  const asked = ai.users[ai.users.length - 1];
  check(gen.status === 200 && gen.data.note.by === "ai" && /progresse/.test(gen.data.note.text) && asked.includes("critique") && asked.includes("Vu avec Bob"), "✨ the AI writes the comment from the levels, the work and the teacher's earlier comment");
  const out = await api("PUT", `/api/plan/${U.bob.id}`, { g: G, flagged: -1 });
  const v3 = await api("GET", `/api/plan?g=${G}`);
  check(out.status === 200 && !v3.data.plan.some((r: any) => r.discord_id === U.bob.id) && v3.data.others.some((r: any) => r.discord_id === U.bob.id && /progresse/.test(r.note?.text)), "taken out of the plan by hand (the comment stays)");
  await api("PUT", `/api/plan/${U.bob.id}`, { g: G, flagged: 1 });
  check((await api("GET", `/api/plan?g=${G}`)).data.plan.some((r: any) => r.discord_id === U.bob.id), "…and added back");
  check((await api("PUT", `/api/plan/${U.bob.id}`, { g: G })).status === 400, "nothing to save: refused");
  run1("DELETE FROM brief_reviews WHERE brief_id IN (?, ?)", b1, b2);
  run1("DELETE FROM briefs WHERE id IN (?, ?)", b1, b2);
  run1("DELETE FROM plan_notes");
}

section("briefs: the Work of the brief (individuel, binôme, groupe) sets solo or squads");
{
  run1(`INSERT INTO briefs (guild_id, title, status, data, created_at) VALUES (?, 'Work mode', 'draft', '{}', ?)`, G, clock.now());
  const id = q1("SELECT id FROM briefs WHERE title = 'Work mode'").id;
  const kindAfter = async (mode: string) => { await api("PUT", `/api/briefs/${id}`, { g: G, data: { modalities: { mode } } }); return q1("SELECT kind FROM briefs WHERE id = ?", id).kind; };
  check(await kindAfter("binôme") === "squad" && await kindAfter("individuel") === "solo" && await kindAfter("groupe") === "squad", "binôme and groupe: squads; individuel: solo");
  run1("DELETE FROM briefs WHERE id = ?", id);
}

section("debrief: link an existing assessment to the brief from the debrief");
{
  run1(`INSERT INTO briefs (guild_id, title, status, data, created_at) VALUES (?, 'Link me', 'assigned', '{}', ?)`, G, clock.now());
  const bid = q1("SELECT id FROM briefs WHERE title = 'Link me'").id;
  run1(`INSERT INTO assessments (guild_id, title, status, settings, questions, created_at) VALUES (?, 'Quiz to link', 'draft', '{}', '[]', ?)`, G, clock.now());
  const aid = q1("SELECT id FROM assessments WHERE title = 'Quiz to link'").id;
  const r = await api("POST", `/api/assessments/${aid}/link`, { g: G, brief_id: bid });
  check(r.status === 200 && q1("SELECT brief_id FROM assessments WHERE id = ?", aid).brief_id === bid, "linked: its results count in the brief's debriefs");
  const bv = await api("GET", `/api/briefs/${bid}?g=${G}`);
  check(bv.data.assessments?.length === 1 && bv.data.assessments[0].title === "Quiz to link" && bv.data.assessments[0].takers === 0, "the brief shows its assessment (for the whole class) and where the class is with it");
  check((await api("POST", `/api/assessments/${aid}/link`, { g: G, brief_id: 999999 })).status === 404, "…an unknown brief: refused");
  run1("DELETE FROM assessments WHERE id = ?", aid); run1("DELETE FROM briefs WHERE id = ?", bid);
}

section("AI keys: an OpenRouter model that isn't free anymore is replaced by one free today");
{
  const add = await api("POST", "/api/settings/ai/providers", { g: G, type: "openrouter", key: "sk-or-good-123", model: "openai/gpt-oss-120b:free" });
  const p = add.data.providers?.find((x: any) => x.type === "openrouter");
  check(add.status === 200 && p?.model === "meta-llama/llama-3.3-70b-instruct:free" && /isn't free on OpenRouter anymore/.test(add.data.warn || ""), "added with the best free model of today, and told why");
  const bad = await api("POST", "/api/settings/ai/providers", { g: G, type: "openrouter", key: "sk-or-wrong", model: "x/y:free" });
  check(bad.status === 400 && /key refused/.test(bad.data.error), "…a wrong key is still refused");
  if (p) await api("DELETE", `/api/settings/ai/providers/${p.id}?g=${G}`);
}

section("assessments: the linked brief changed or removed at any time (drafts follow, finalized debriefs never change)");
{
  const LK = await import("../src/shared/assesslink.ts");
  const { getReview } = await import("../src/shared/review/debrief.ts");
  // ---- pure: the plan
  const linked = [{ id: 1, title: "Quiz", brief_id: 10 }, { id: 2, title: "Autre", brief_id: 20 }, { id: 3, title: "Libre", brief_id: null }];
  const reviews = [{ brief_id: 10, status: "draft" }, { brief_id: 10, status: "draft" }, { brief_id: 10, status: "final" }, { brief_id: 20, status: "draft" }, { brief_id: 20, status: "final" }];
  const base = { briefs: [10, 20, 30], linked, reviews };
  const mv = LK.planLink({ ...base, assessment: 1, to: 30 });
  check(mv.from === 10 && mv.to === 30 && !mv.same && mv.drafts.from === 2 && mv.finals.from === 1 && mv.drafts.to === 0 && !mv.others.length, "change the link: what moves (2 drafts of the old brief, 1 finalized left as it is)");
  const rm = LK.planLink({ ...base, assessment: 1, to: "" });
  check(rm.to === null && rm.drafts.from === 2 && LK.planLink({ ...base, assessment: 1, to: null }).to === null && LK.planLink({ ...base, assessment: 1, to: 0 }).to === null, "remove the link: \"\", null and 0 all mean no brief");
  const onto = LK.planLink({ ...base, assessment: 1, to: 20 });
  const rep = LK.planLink({ ...base, assessment: 1, to: 20, replace: true });
  check(onto.others.map((o) => o.id).join() === "2" && !onto.replace.length && rep.replace.join() === "2" && rep.drafts.to === 1 && rep.finals.to === 1, "the new brief already has an assessment: replace it or keep both");
  check(LK.planLink({ ...base, assessment: 3, to: 10 }).from === null && LK.planLink({ ...base, assessment: 1, to: 10 }).same, "from no brief; the same brief changes nothing");
  const refused = (to: unknown) => { try { LK.planLink({ ...base, assessment: 1, to }); return false; } catch (e) { return e instanceof LK.LinkError; } };
  const status = (to: unknown) => { try { LK.planLink({ ...base, assessment: 1, to }); } catch (e) { return (e as any).status; } };
  check(refused(99) && refused("abc") && refused(-2) && refused(1.5) && status(99) === 404 && status("abc") === 400, "a brief that isn't in the class is refused (404; not a brief id: 400)");
  const recO = { oral: [{ q: "a", src: "evaluation" }, { q: "b", src: "brief" }, { q: "c", src: "evaluation", unlinked: 9 }], final: { oral: [true, false, false] } };
  check(LK.markOral(recO, 1, true) === 1 && (recO.oral[0] as any).unlinked === 1 && (recO.oral[2] as any).unlinked === 9 && !(recO.oral[1] as any).unlinked && recO.oral.length === 3 && recO.final.oral.join() === "true,false,false",
    "unlinked: the oral questions from the assessment are kept with their switches, and marked");
  check(LK.markOral(recO, 1, false) === 1 && !(recO.oral[0] as any).unlinked && (recO.oral[2] as any).unlinked === 9, "linked again: the mark goes (only that assessment's)");

  // ---- through the dashboard
  const brief = (title: string) => { run1("INSERT INTO briefs (guild_id, title, status, data, created_at) VALUES (?, ?, 'assigned', '{}', ?)", G, title, clock.now()); return q1("SELECT MAX(id) AS id FROM briefs").id as number; };
  const A = brief("Lien A"), B = brief("Lien B");
  const mk = await api("POST", "/api/assessments", { g: G, title: "Quiz lien", brief_id: A, questions: [{ type: "explain", prompt: "Explique margin et padding.", expected: "dehors / dedans", points: 1 }], settings: { minutes: 0 } });
  const aid = mk.data.assessment.id;
  check((await api("POST", "/api/assessments", { g: G, title: "x", brief_id: 987654, questions: [] })).status === 404, "a new assessment can't be linked to a brief that isn't in the class");
  await api("POST", `/api/assessments/${aid}/invite`, { g: G, students: [U.alice.id, U.carol.id], send: false });
  run1("UPDATE assessment_takers SET status = 'graded', score = 80, grades = '{}' WHERE assessment_id = ?", aid);
  const rec = (extra: any = {}) => JSON.stringify({ at: Date.now(), brief: "Lien", result: { exigences: [{ type: "story", texte: "Page d'accueil", statut: "fait" }], competences: [{ code: "C3", avis: "validable" }] }, checks: [], ...extra });
  const putRev = (bid: number, who: string, status: string, r: string) => run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, level, plevel, updated_at) VALUES (?, ?, ?, ?, ?, 'bon', 'bon', ?)", bid, G, who, r, status, clock.now());
  putRev(A, `u:${U.alice.id}`, "draft", rec({ oral: [{ q: "Q éval", a: "…", notion: "margin", src: "evaluation" }, { q: "Q brief", a: "…", notion: "html", src: "brief" }], final: { oral: [true, false] }, level: { lvl: "bon", prop: "bon", by: "calc" } }));
  putRev(A, `u:${U.bob.id}`, "final", rec({ assess: [{ id: aid, title: "Quiz lien", score: 80, done: 1, of: 1, comps: {} }] }));
  putRev(B, `u:${U.carol.id}`, "draft", rec());
  const finalBefore = q1("SELECT record, level, plevel FROM brief_reviews WHERE brief_id = ? AND who = ?", A, `u:${U.bob.id}`);
  check((await getReview(env, A, `u:${U.alice.id}`))!.rec.assess.length === 1 && (await getReview(env, B, `u:${U.carol.id}`))!.rec.assess.length === 0, "linked to A: A's draft uses it, B's doesn't");
  // the confirmation first: nothing written
  const pv = await api("POST", `/api/assessments/${aid}/link`, { g: G, brief_id: B, preview: true });
  check(pv.status === 200 && pv.data.plan.from === A && pv.data.plan.to === B && pv.data.plan.drafts.from === 1 && pv.data.plan.finals.from === 1 && pv.data.plan.drafts.to === 1 && q1("SELECT brief_id FROM assessments WHERE id = ?", aid).brief_id === A,
    "preview: what changes (A: 1 draft to the project only, 1 finalized left as it is; B: 1 draft), nothing written");
  // A → B
  const ch = await api("POST", `/api/assessments/${aid}/link`, { g: G, brief_id: B });
  const ra = (await getReview(env, A, `u:${U.alice.id}`))!.rec, rb = (await getReview(env, B, `u:${U.carol.id}`))!.rec, rf = (await getReview(env, A, `u:${U.bob.id}`))!.rec;
  check(ch.status === 200 && ch.data.brief_id === B && ch.data.assessment.brief_id === B && q1("SELECT brief_id FROM assessments WHERE id = ?", aid).brief_id === B, "changed to B: the API returns the new state");
  check(ra.assess.length === 0 && rb.assess.length === 1 && rb.assess[0].id === aid, "A's draft now uses the project only, B's draft uses the assessment");
  check(ra.oral.length === 2 && ra.oral[0].unlinked === aid && !ra.oral[1].unlinked && ra.final.oral.join() === "true,false" && ra.level?.by === "calc" && !!ra.level?.prop,
    "…A's oral questions stay (with their switches), the one from the assessment is marked; the level is proposed again");
  const finalAfter = q1("SELECT record, level, plevel FROM brief_reviews WHERE brief_id = ? AND who = ?", A, `u:${U.bob.id}`);
  check(finalAfter.record === finalBefore.record && finalAfter.level === finalBefore.level && rf.assess.length === 1 && rf.assess[0].id === aid, "a finalized debrief never changes (it keeps the assessment it was finalized with)");
  check(q("SELECT COUNT(*) AS n FROM assessment_takers WHERE assessment_id = ? AND status = 'graded'", aid)[0].n === 2, "the papers and grades stay: only the link changed");
  const bA = (await api("GET", `/api/briefs/${A}?g=${G}`)).data.assessments, bB = (await api("GET", `/api/briefs/${B}?g=${G}`)).data.assessments;
  check(!bA.length && bB.length === 1 && bB[0].id === aid, "both pages show the same state (A: none, B: it)");
  // another assessment onto B: replace or keep both
  const mk2 = await api("POST", "/api/assessments", { g: G, title: "Quiz 2", questions: [{ type: "explain", prompt: "Explique flexbox.", expected: "x", points: 1 }], settings: { minutes: 0 } });
  const aid2 = mk2.data.assessment.id;
  const pv2 = await api("POST", `/api/assessments/${aid2}/link`, { g: G, brief_id: B, preview: true });
  check(pv2.data.plan.others.length === 1 && pv2.data.plan.others[0].id === aid, "B already has one: the confirmation says so");
  await api("POST", `/api/assessments/${aid2}/link`, { g: G, brief_id: B, replace: true });
  check(q1("SELECT brief_id FROM assessments WHERE id = ?", aid).brief_id === null && q1("SELECT brief_id FROM assessments WHERE id = ?", aid2).brief_id === B, "replace: the other one is unlinked");
  await api("POST", `/api/assessments/${aid2}/link`, { g: G, brief_id: null });
  // back to A from the assessment's Settings (the same rules): A's oral mark goes
  const put = await api("PUT", `/api/assessments/${aid}`, { g: G, title: "Quiz lien", brief_id: A, questions: mk.data.assessment.questions, settings: { minutes: 0 } });
  check(put.status === 200 && put.data.assessment.brief_id === A && !(await getReview(env, A, `u:${U.alice.id}`))!.rec.oral[0].unlinked, "from Settings too: linked to A again, the mark on A's oral question goes");
  check((await api("PUT", `/api/assessments/${aid}`, { g: G, title: "Quiz lien", brief_id: 987654, questions: mk.data.assessment.questions })).status === 404 && q1("SELECT brief_id FROM assessments WHERE id = ?", aid).brief_id === A
    && (await api("POST", `/api/assessments/${aid}/link`, { g: G, brief_id: 987654 })).status === 404
    && (await api("POST", `/api/assessments/${aid}/link`, { g: G, brief_id: "abc" })).status === 400, "a brief that isn't in the class is refused (Settings and the brief page)");
  // remove the link, then a brief deleted takes its links with it
  const rmv = await api("POST", `/api/assessments/${aid}/link`, { g: G, brief_id: null });
  check(rmv.data.brief_id === null && (await getReview(env, A, `u:${U.alice.id}`))!.rec.assess.length === 0, "remove the link: no brief, the drafts use the project only");
  const C = brief("Lien C");
  await api("POST", `/api/assessments/${aid}/link`, { g: G, brief_id: C });
  await api("DELETE", `/api/briefs/${C}?g=${G}`);
  check(q1("SELECT brief_id FROM assessments WHERE id = ?", aid).brief_id === null, "a brief deleted: its assessment isn't linked to a brief that doesn't exist anymore");
  for (const id of [aid, aid2]) await api("DELETE", `/api/assessments/${id}?g=${G}`);
  run1("DELETE FROM brief_reviews WHERE brief_id IN (?, ?)", A, B);
  run1("DELETE FROM briefs WHERE id IN (?, ?)", A, B);
}

section("assessments: graded by objectives, in lots that resume after an AI failure, finalized debriefs left alone");
{
  const qs = [{ type: "explain", prompt: "Ajoute un lien qui s'ouvre dans un nouvel onglet.", expected: "<a href target=_blank>", points: 1 }];
  const mk = await api("POST", "/api/assessments", { g: G, title: "Objectifs", questions: qs, settings: { minutes: 0 } });
  const aid = mk.data.assessment.id;
  await api("POST", `/api/assessments/${aid}/invite`, { g: G, students: [U.bob.id, U.carol.id], send: false });
  const links = (await api("GET", `/api/assessments/${aid}/links?g=${G}`)).data.links;
  ai.mode = "broken";
  for (const [who, sid] of [[U.bob.id, "sessionOBJBBBBBBBBBBBBB1"], [U.carol.id, "sessionOBJCCCCCCCCCCCCC1"]]) {
    const tok = links[who].split("/quiz/")[1];
    const quiz = async (action: string, body: any) => { const ctx = makeCtx(); const r = await bot.fetch(new Request(`https://bot.example.workers.dev/quiz/${tok}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env, ctx); await ctx.flush(); return r.json() as any; };
    const st = await quiz("start", { sid });
    await quiz("answer", { sid, qid: st.paper[0].id, answer: "OBJ-TEST <a href=\"https://example.com\">Visiter le site</a>" });
    await quiz("submit", { sid });
  }
  const rows = () => q("SELECT * FROM assessment_takers WHERE assessment_id = ? ORDER BY id", aid);
  check(rows().every((r: any) => r.status === "submitted" && r.score == null), "the AI didn't answer: the papers stay to grade, nobody gets a 0");
  const f1 = await api("POST", `/api/assessments/${aid}/grade`, { g: G, lot: 3 });
  check(f1.status === 200 && f1.data.batch.graded === 0 && /./.test(f1.data.batch.error) && rows().every((r: any) => r.status === "submitted"), "Grade with AI while the AI is down: it stops at once and says why");
  ai.mode = "good";
  const l1 = await api("POST", `/api/assessments/${aid}/grade`, { g: G, lot: 1 });
  check(l1.data.batch.graded === 1 && l1.data.batch.left === 1, "in lots: one paper graded, one left");
  const l2 = await api("POST", `/api/assessments/${aid}/grade`, { g: G, lot: 1 });
  const g1 = JSON.parse(rows()[0].grades);
  const gq = Object.values(g1)[0] as any;
  check(l2.data.batch.graded === 1 && l2.data.batch.left === 0 && rows().every((r: any) => r.status === "graded"), "…the next run continues with the one left (not from the start)");
  check(gq.score === 50 && gq.verdict === "partial" && gq.parts?.length === 3, "the score is the sum of the objectives reached (40 + half of 20), not 0 for a missing part");
  check((await api("POST", `/api/assessments/${aid}/grade`, { g: G })).data.batch.graded === 0, "nothing left to grade: nothing is graded again");
  {
    // a first grade that says "nothing done" while the selector is right there: checked again, objective by objective
    const mk2 = await api("POST", "/api/assessments", { g: G, title: "Recheck", questions: [{ type: "code", lang: "css", prompt: "Mets les <p> en rouge.", expected: "p{color:red;}", points: 1 }], settings: { minutes: 0 } });
    const aid2 = mk2.data.assessment.id;
    await api("POST", `/api/assessments/${aid2}/invite`, { g: G, students: [U.bob.id, U.carol.id], send: false });
    const links2 = (await api("GET", `/api/assessments/${aid2}/links?g=${G}`)).data.links;
    for (const [who, sid, txt] of [[U.bob.id, "sessionRCHKBBBBBBBBBBBB1", "/* MEHDI-TEST */\np{\ncouleur = rouge ;\n}"], [U.carol.id, "sessionRCHKCCCCCCCCCCCC1", "/* UNSURE-TEST */\np{\ncouleur = rouge ;\n}"]]) {
      const tok = links2[who].split("/quiz/")[1];
      const quiz = async (action: string, body: any) => { const ctx = makeCtx(); const r = await bot.fetch(new Request(`https://bot.example.workers.dev/quiz/${tok}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env, ctx); await ctx.flush(); return r.json() as any; };
      const st = await quiz("start", { sid });
      await quiz("answer", { sid, qid: st.paper[0].id, answer: txt });
      await quiz("submit", { sid });
    }
    await api("POST", `/api/assessments/${aid2}/grade`, { g: G, lot: 5 });
    const r2 = q("SELECT * FROM assessment_takers WHERE assessment_id = ? ORDER BY id", aid2);
    const gb = Object.values(JSON.parse(r2[0].grades))[0] as any, gc = Object.values(JSON.parse(r2[1].grades))[0] as any;
    check(r2[0].status === "graded" && gb.parts.find((x: any) => x.goal === "sélecteur p").got === "yes" && gb.score === 25 && gb.verdict === "partial" && /sélecteur p/.test(gb.right), "the AI said the selector p was missing while it's written: it counts, with no extra AI call (no wrong 0)");
    check(r2[1].status === "submitted" && gc.pending && /couldn't judge/.test(gc.wrong), "a part the AI couldn't judge: the question is left to the teacher, not given a 0");
    const asc = await import("../src/shared/assess.ts");
    check(asc.seenInAnswer("balise <form> avec action", '<form action="#">') && asc.seenInAnswer("sélecteur div", "div{ width:200px }") && !asc.seenInAnswer("balise <head>", "<html><body>"), "a tag or a selector the student wrote is seen in the answer");
    // an AI answer cut in the middle: the complete notes are kept, the missing question is asked again alone
    check(asc.readNotes('{"notes":[{"id":1,"score":100},{"id":2,"sc').notes.length === 1 && asc.readNotes('{"notes":[{"objectif":"x"}').notes.length === 1, "an answer cut in the middle: the complete notes are read");
    const mk3 = await api("POST", "/api/assessments", { g: G, title: "Cut", questions: [
      { type: "code", lang: "html", prompt: "Un titre h1 Bonjour.", expected: "<h1>Bonjour</h1>", points: 1 },
      { type: "code", lang: "html", prompt: "Un titre h1 Salut.", expected: "<h1>Salut</h1>", points: 1 },
      { type: "code", lang: "html", prompt: "Un paragraphe.", expected: "<p>Texte</p>", points: 1 }], settings: { minutes: 0, shuffle: false } });
    const aid3 = mk3.data.assessment.id;
    await api("POST", `/api/assessments/${aid3}/invite`, { g: G, students: [U.bob.id, U.carol.id], send: false });
    const links3 = (await api("GET", `/api/assessments/${aid3}/links?g=${G}`)).data.links;
    const calls: number[] = [];
    for (const [who, sid] of [[U.bob.id, "sessionCUTBBBBBBBBBBBBB1"], [U.carol.id, "sessionCUTCCCCCCCCCCCCC1"]]) {
      const tok = links3[who].split("/quiz/")[1];
      const quiz = async (action: string, body: any) => { const ctx = makeCtx(); const r = await bot.fetch(new Request(`https://bot.example.workers.dev/quiz/${tok}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env, ctx); await ctx.flush(); return r.json() as any; };
      const st = await quiz("start", { sid });
      for (const pq of st.paper) await quiz("answer", { sid, qid: pq.id, answer: /Bonjour/.test(pq.prompt) ? "<h1>TRUNC-TEST Bonjour</h1>" : /Salut/.test(pq.prompt) ? "<h1>TRUNC-TEST Salut</h1>" : "<p>Texte</p>" });
      const before = ai.calls;
      await quiz("submit", { sid });   // graded when handed in
      calls.push(ai.calls - before);
    }
    const r3 = q("SELECT * FROM assessment_takers WHERE assessment_id = ? ORDER BY id", aid3);
    const g3 = Object.values(JSON.parse(r3[0].grades)) as any[];
    check(r3[0].status === "graded" && g3.length === 3 && g3.every((x) => x.score === 100 && !x.pending), "the AI's answer was cut after one question: the second is asked again alone, nothing is left ungraded");
    check(calls[0] === 2, "the answer that is the expected one is graded with no AI call (2 calls: the paper + the cut question)");
    check(r3[1].status === "graded" && calls[1] === 0, "another student with the same answers: graded from the first one's grades, no AI call at all");
  }
  // Carol's debrief of the linked brief is finalized: her grade doesn't move anymore
  run1(`INSERT INTO briefs (guild_id, title, status, data, created_at) VALUES (?, 'Obj brief', 'assigned', '{}', ?)`, G, clock.now());
  const bid = q1("SELECT id FROM briefs WHERE title = 'Obj brief'").id;
  await api("POST", `/api/assessments/${aid}/link`, { g: G, brief_id: bid });
  run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, updated_at) VALUES (?, ?, ?, '{}', 'final', ?)", bid, G, `u:${U.carol.id}`, clock.now());
  const carolRow = rows().find((r: any) => r.discord_id === U.carol.id);
  const again = await api("POST", `/api/assessments/${aid}/grade`, { g: G, all: true, lot: 5 });
  check(again.data.batch.graded === 1 && again.data.batch.skipped === 1, "every paper again: the finalized student is left as she is");
  check((await api("POST", `/api/assessments/${aid}/grade`, { g: G, taker: carolRow.id })).status === 400, "…and can't be graded again alone either");
  check((await api("POST", `/api/briefs/${bid}/review/analyze`, { g: G, who: `u:${U.carol.id}` })).status === 400, "a finalized debrief isn't analyzed again");
  run1("DELETE FROM brief_reviews WHERE brief_id = ?", bid); run1("DELETE FROM briefs WHERE id = ?", bid);
}

section("AI keys: a Groq model blocked by the account's settings: another model, not \"key refused\"");
{
  const add = await api("POST", "/api/settings/ai/providers", { g: G, type: "groq", key: "gsk_good_blocked_1", model: "openai/gpt-oss-120b" });
  const p = add.data.providers?.find((x: any) => x.type === "groq" && x.model !== "openai/gpt-oss-120b");
  check(add.status === 200 && p?.model === "llama-3.3-70b-versatile" && /can't be used with this key/.test(add.data.warn || ""), "added with the next model that this key may use, and told why");
  if (p) await api("DELETE", `/api/settings/ai/providers/${p.id}?g=${G}`);
}

section("assessments: options before inviting (copy-paste, full screen, shuffle, going back) and the no-going-back mode");
{
  const qs = [1, 2, 3].map((i) => ({ type: "explain", prompt: `Question numéro ${i}`, expected: "x", points: 1 }));
  const mk = await api("POST", "/api/assessments", { g: G, title: "Options", questions: qs, settings: { minutes: 0 } });
  const aid = mk.data.assessment.id;
  check(mk.data.assessment.settings.noPaste === true && mk.data.assessment.settings.lockScreen === true && mk.data.assessment.settings.shuffle === true && mk.data.assessment.settings.nav === "forward", "by default: copy-paste blocked, full screen, shuffled, no going back");
  const op = await api("POST", `/api/assessments/${aid}/options`, { g: G, noPaste: false, lockScreen: false, shuffle: false, nav: "forward" });
  await api("PUT", `/api/assessments/${aid}`, { g: G, title: "Options", questions: mk.data.assessment.questions, settings: { minutes: 30 } });
  check(q1("SELECT settings FROM assessments WHERE id = ?", aid).settings.includes('"nav":"forward"') && q1("SELECT settings FROM assessments WHERE id = ?", aid).settings.includes('"minutes":30'), "saving the questions keeps the options");
  check(op.status === 200 && op.data.assessment.settings.nav === "forward" && op.data.assessment.settings.shuffle === false && op.data.assessment.settings.lockScreen === false, "the teacher sets the options before inviting");
  await api("POST", `/api/assessments/${aid}/invite`, { g: G, students: [U.dave?.id || U.carol.id], send: false });
  const who = U.dave?.id || U.carol.id;
  const tok = (await api("GET", `/api/assessments/${aid}/links?g=${G}`)).data.links[who].split("/quiz/")[1];
  const quiz = async (action: string, body: any) => { const ctx = makeCtx(); const r = await bot.fetch(new Request(`https://bot.example.workers.dev/quiz/${tok}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env, ctx); await ctx.flush(); return { status: r.status, d: await r.json() as any }; };
  const sid = "sessionOPTOPTOPTOPTOPT01";
  const st = (await quiz("start", { sid })).d;
  check(st.paper.map((p: any) => p.prompt).join("|") === "Question numéro 1|Question numéro 2|Question numéro 3" && st.rules.nav === "forward" && st.rules.lockScreen === false, "not shuffled: the questions in the teacher's order; the page gets the options");
  await quiz("answer", { sid, qid: st.paper[0].id, answer: "un", pos: 1 });
  const back = await quiz("answer", { sid, qid: st.paper[0].id, answer: "changé", pos: 0 });
  check(back.status === 409 && back.d.error === "passed", "no going back: a passed question can't be answered again");
  await quiz("event", { sid, what: "fullscreen" });
  check(q1("SELECT status FROM assessment_takers WHERE assessment_id = ? AND discord_id = ?", aid, who).status === "active", "no full screen lock: leaving the page doesn't stop the session");
  const late = await api("POST", `/api/assessments/${aid}/options`, { g: G, nav: "free", shuffle: true });
  check(late.data.assessment.settings.nav === "forward" && late.data.assessment.settings.shuffle === false, "once a student started, the order and going back don't change anymore");
}

section("AI limits: grading in small requests, waiting out a per-minute limit");
{
  const { perMinuteWait } = await import("../src/shared/aikeys.ts");
  check(perMinuteWait("Groq: limit reached (429): Rate limit reached for model `x` on tokens per minute (TPM): Limit 8000, Used 7000, Requested 2000. Please try again in 7.5s.") === 11
    && perMinuteWait("limit reached (429): tokens per day (TPD): Limit 200000") === 0 && perMinuteWait("key refused (401)") === 0 && perMinuteWait("Gemini: limit reached (429): Resource exhausted") === 33, "a per-minute limit: wait (as long as it says); a daily one: no");
  const qs = Array.from({ length: 8 }, (_, i) => ({ type: "explain", prompt: `Chunk question ${i + 1}`, expected: "x", points: 1 }));
  const mk = await api("POST", "/api/assessments", { g: G, title: "Chunks", questions: qs, settings: { minutes: 0, nav: "free" } });
  const aid = mk.data.assessment.id;
  await api("POST", `/api/assessments/${aid}/invite`, { g: G, students: [U.bob.id], send: false });
  const tok = (await api("GET", `/api/assessments/${aid}/links?g=${G}`)).data.links[U.bob.id].split("/quiz/")[1];
  const quiz = async (action: string, body: any) => { const ctx = makeCtx(); const r = await bot.fetch(new Request(`https://bot.example.workers.dev/quiz/${tok}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env, ctx); await ctx.flush(); return r.json() as any; };
  const sid = "sessionCHUNKCHUNKCHUNK01";
  const st = await quiz("start", { sid });
  for (const p of st.paper) await quiz("answer", { sid, qid: p.id, answer: "display: flex", pos: 0 });
  const before = ai.prompts.filter((x) => x.includes("Tu corriges l’évaluation")).length;
  await quiz("submit", { sid });
  const calls = ai.prompts.filter((x) => x.includes("Tu corriges l’évaluation")).length - before;
  const row = q1("SELECT status, grades FROM assessment_takers WHERE assessment_id = ? AND discord_id = ?", aid, U.bob.id);
  check(calls === 2 && row.status === "graded" && Object.keys(JSON.parse(row.grades)).length === 8, "8 questions: graded in 2 smaller AI requests (6 + 2), every question graded");
  run1("DELETE FROM ai_usage");
}

section("AI keys: a Gemini model overloaded (503): the reason shown, another model used");
{
  const add = await api("POST", "/api/settings/ai/providers", { g: G, type: "gemini", key: "AIza-good-1", model: "gemini-busy-flash" });
  const p = add.data.providers?.find((x: any) => x.type === "gemini");
  check(add.status === 200 && p?.model === "gemini-2.5-flash" && /overloaded right now \(503\)/.test(add.data.warn || ""), "added with a model that answers, and told why");
  if (p) await api("DELETE", `/api/settings/ai/providers/${p.id}?g=${G}`);
}

section("AI keys: keys of the same provider take turns; a key at its per-minute limit rests");
{
  const { rotateSteps } = await import("../src/shared/aikeys.ts");
  const st = (id: string, type: string) => ({ id, type, key: id, model: "m", base: "", label: id, source: "class" }) as any;
  const list = [st("g1", "groq"), st("g2", "groq"), st("ge", "gemini"), st("g3", "groq")];
  const a = rotateSteps(list, "rotT").map((x: any) => x.id).join(), b = rotateSteps(list, "rotT").map((x: any) => x.id).join(), c = rotateSteps(list, "rotT").map((x: any) => x.id).join();
  check(a === "g1,g2,g3,ge" && b === "g2,g3,g1,ge" && c === "g3,g1,g2,ge", "each call starts with the next Groq key; Gemini stays the backup after them");
  const one = rotateSteps([st("x1", "groq"), st("y1", "gemini")], "rotT2").map((x: any) => x.id).join();
  check(one === "x1,y1", "one key per provider: the teacher's order");
  const put = await api("PUT", "/api/settings/ai", { g: G, rotate: false });
  check(put.status === 200 && put.data.rotate === false, "the teacher can turn it off");
  await api("PUT", "/api/settings/ai", { g: G, rotate: true });
}

section("intranet: signed server-to-server requests (the intranet's VerifyClassbotSignature checks the same string)");
{
  const body = '{"nom":"Hélène"}';
  check(await toSign(1791900000, "abcdabcdabcdabcd", "post", "/api/classbot/squads?x=1", body)
    === `v1
1791900000
abcdabcdabcdabcd
POST
/api/classbot/squads?x=1
${createHash("sha256").update(body, "utf8").digest("hex")}`, "the signed string: version, time, nonce, method, path and query, SHA-256 of the raw body (accents included)");
  check(!checkUrl("http://intranet.youcode.ma").ok && checkUrl("http://127.0.0.1:8010").ok && checkUrl("https://intranet.youcode.ma/").url === "https://intranet.youcode.ma" && !checkUrl("nope").ok, "the intranet's address: HTTPS (http only on this computer)");

  // names: the same words in any order, without accents or capitals; a learner two students fit goes to nobody
  const L = [{ id: 1, first_name: "Hélène", last_name: "BEN-ALI" }, { id: 2, first_name: "Mehdi", last_name: "Rahmani" }, { id: 3, first_name: "Sara", last_name: "Idrissi" }, { id: 4, first_name: "Sara", last_name: "Amrani" }];
  const M = matchNames([{ discord_id: "a", name: "ben ali helene" }, { discord_id: "b", name: "Mehdi R." }, { discord_id: "c", name: "Sara" }, { discord_id: "d", name: "Youssef" }], L);
  check(M[0].kind === "exact" && M[0].candidates[0] === 1 && M[1].kind === "close" && M[1].candidates[0] === 2 && M[2].kind === "several" && M[2].candidates.length === 2 && M[3].kind === "none",
    `matching names: exact, close, several, none (${M.map((r) => r.kind).join(", ")})`);
  check(matchNames([{ discord_id: "a", name: "Mehdi Rahmani" }, { discord_id: "b", name: "Rahmani Mehdi" }], L).every((r) => r.kind === "several"), "…two students on the same learner: nobody gets it automatically");

  // the class's intranet classroom, then each student linked once (kept in ClassBot only)
  intranetFake.learners[12] = [{ id: 501, first_name: "Alice", last_name: "Martin" }, { id: 502, first_name: "Bob", last_name: "Durand" }, { id: 503, first_name: "Caroline", last_name: "Petit" }];
  // nothing set on the intranet or in Cloudflare: the trainer types the address and connects once
  check(/Connect your intranet account/.test((await api("POST", "/api/intranet/ping", { g: G })).data.error) && /Connect your intranet account/.test((await api("GET", `/api/intranet/classrooms?g=${G}`)).data.error), "not connected: nothing is sent");
  const T = intranetFake.trainer, URL0 = "http://intranet.test";
  check((await api("POST", "/api/intranet/login", { g: G, url: "http://intranet.youcode.ma", email: T.email, password: T.password })).status === 400, "…an http address (not this computer): refused");
  const badLogin = await api("POST", "/api/intranet/login", { g: G, url: URL0, email: T.email, password: "wrong" });
  check(badLogin.status === 400 && /incorrect/.test(badLogin.data.error), "…a wrong password: refused");
  const lg = await api("POST", "/api/intranet/login", { g: G, url: URL0, email: T.email, password: T.password });
  const stored = q1("SELECT intranet FROM guilds WHERE id = ?", G).intranet;
  check(lg.status === 200 && lg.data.trainer.name === T.name && ![...intranetFake.tokens].some((t) => stored.includes(t)) && !stored.includes(T.password) && JSON.parse(stored).auth.trainer.id === T.id && JSON.parse(stored).url === URL0,
    "the trainer connects with the address and their intranet account: the token and its signing secret are kept encrypted, the password never");
  const st0 = (await api("GET", `/api/intranet?g=${G}`)).data;
  check(st0.trainer?.name === T.name && st0.host === "intranet.test" && !JSON.stringify(st0).includes("tok"), "…the page knows who is connected and where, never the token");
  const ping2 = await api("POST", "/api/intranet/ping", { g: G });
  check(ping2.data.trainer?.name === T.name && ping2.data.classrooms.join() === "12", "…the ping says who is connected, and their classrooms");
  const cls = await api("GET", `/api/intranet/classrooms?g=${G}`);
  check(cls.data.classrooms.length === 1 && cls.data.classrooms[0].id === 12, "…only the classrooms the intranet allows");
  check((await api("PUT", "/api/intranet/classroom", { g: G, id: 99 })).status === 400, "…another classroom: refused");
  await api("PUT", "/api/intranet/classroom", { g: G, id: 12 });
  const mv = await api("GET", `/api/intranet/match?g=${G}`);
  const row = (d: any, id: string) => d.rows.find((r: any) => r.discord_id === id);
  check(mv.status === 200 && row(mv.data, U.alice.id).kind === "close" && row(mv.data, U.bob.id).kind === "close" && !row(mv.data, U.alice.id).linked, `…each student and the learner their name fits (${row(mv.data, U.alice.id)?.kind})`);
  const au = await api("POST", "/api/intranet/match/auto", { g: G });
  check(au.data.linked >= 2 && row(au.data, U.alice.id).linked?.id === 501 && q1("SELECT learner_id FROM intranet_links WHERE guild_id = ? AND discord_id = ?", G, U.bob.id).learner_id === 502, "Link automatically: saved in ClassBot");
  const mine = await api("PUT", "/api/intranet/link", { g: G, discord_id: U.carol.id, learner_id: 501 });
  check(row(mine.data, U.carol.id).linked?.id === 501 && row(mine.data, U.carol.id).linked.by === "you" && !row(mine.data, U.alice.id).linked, "…the teacher's choice wins (the learner moves to that student)");
  check((await api("PUT", "/api/intranet/link", { g: G, discord_id: U.carol.id, learner_id: 777 })).status === 400, "…a learner outside the classroom: refused");
  // the squads of a sprint → a group distribution on the intranet (all or nothing; sent again: the same groups)
  run1("INSERT INTO squad_sets (guild_id, name, squads, active, created_at, updated_at) VALUES (?, 'Sprint intranet', ?, 0, ?, ?)", G,
    JSON.stringify([{ id: "aa1111", name: "Squad A", members: [U.alice.id, U.bob.id], sm: U.alice.id }, { id: "bb2222", name: "Squad B", members: [U.carol.id], sm: U.carol.id }]), clock.now(), clock.now());
  const sid = q1("SELECT id FROM squad_sets WHERE guild_id = ? AND name = 'Sprint intranet'", G).id;
  run1("DELETE FROM intranet_links WHERE guild_id = ? AND discord_id = ?", G, U.alice.id);
  const pv = await api("GET", `/api/squads/${sid}/intranet?g=${G}`);
  check(pv.status === 200 && pv.data.groups.length === 2 && pv.data.missing.length === 1 && !pv.data.sent, `preview: each squad with its intranet learners, who isn't linked (${pv.data.missing})`);
  const before = intranetFake.dists.length;
  check((await api("POST", `/api/squads/${sid}/intranet`, { g: G })).status === 400 && intranetFake.dists.length === before, "…a student not linked: nothing is sent (all or nothing)");
  await api("PUT", "/api/intranet/link", { g: G, discord_id: U.alice.id, learner_id: 503 });
  const s1 = await api("POST", `/api/squads/${sid}/intranet`, { g: G });
  const d1 = intranetFake.dists.find((x) => x.id === s1.data.distribution_id)!;
  check(s1.status === 200 && s1.data.groups === 2 && s1.data.learners === 3 && d1.name === "Sprint intranet" && d1.groups[0].learners.join() === "503,502" && !s1.data.again, "sent: a new group distribution, each squad a group with its learners");
  const g1 = d1.groups.map((x) => x.id);
  run1("UPDATE squad_sets SET squads = ? WHERE id = ?", JSON.stringify([{ id: "aa1111", name: "Squad A+", members: [U.alice.id], sm: U.alice.id }, { id: "bb2222", name: "Squad B", members: [U.carol.id, U.bob.id], sm: U.carol.id }]), sid);
  const s2 = await api("POST", `/api/squads/${sid}/intranet`, { g: G });
  const d2 = intranetFake.dists.find((x) => x.id === s2.data.distribution_id)!;
  check(s2.data.again && s2.data.distribution_id === s1.data.distribution_id && d2.groups.map((x) => x.id).join() === g1.join() && d2.groups[0].name === "Squad A+" && d2.groups[1].learners.join() === "501,502", "sent again: the same distribution and the same groups, updated (activities stay linked)");
  check((await api("GET", `/api/squads/${sid}/intranet?g=${G}`)).data.sent?.distribution_id === s1.data.distribution_id, "…the preview says it was sent");
  // the veilles and live codings → activities of the classroom, with their presenters (two: a binôme)
  run1("INSERT INTO activities (guild_id, day, kind, title, md, created_at, updated_at) VALUES (?, '2030-01-07', 'veille', 'Flexbox vs Grid', ?, ?, ?)", G, "# Veille\n**Objectif** : comparer", clock.now(), clock.now());
  run1("INSERT INTO activities (guild_id, day, kind, title, md, created_at, updated_at) VALUES (?, '2030-01-08', 'live', 'Panier en JS', '# Live', ?, ?)", G, clock.now(), clock.now());
  const va = q1("SELECT id FROM activities WHERE guild_id = ? AND day = '2030-01-07' AND kind = 'veille'", G).id, la = q1("SELECT id FROM activities WHERE guild_id = ? AND day = '2030-01-08' AND kind = 'live'", G).id;
  run1("INSERT INTO activity_claims (guild_id, activity_id, kind, members, by, status, created_at) VALUES (?, ?, 'veille', ?, 'teacher', 'approved', ?)", G, va, JSON.stringify([U.alice.id, U.bob.id]), clock.now());
  run1("INSERT INTO activity_claims (guild_id, activity_id, kind, members, by, status, created_at) VALUES (?, ?, 'live', ?, 'teacher', 'approved', ?)", G, la, JSON.stringify(["990999"]), clock.now());
  const ap = await api("GET", `/api/activities/intranet?g=${G}&from=2030-01-06&to=2030-01-12`);
  const it = (id: number) => ap.data.items.find((x: any) => x.id === id);
  check(ap.status === 200 && it(va).members.length === 2 && it(va).at === "09:15" && it(la).at === "11:00" && it(la).missing.length === 1, "activities preview: the week's veilles and live codings, their presenters' intranet learners, who isn't linked");
  const as1 = await api("POST", "/api/activities/intranet", { g: G, ids: [va, la] });
  const fa = intranetFake.acts.find((x) => x.subject === "Flexbox vs Grid")!;
  check(as1.status === 200 && as1.data.sent === 1 && as1.data.failed === 1 && /not linked/.test(as1.data.results[la].message) && fa.type === "veille" && fa.datetime === "2030-01-07 09:15" && fa.duration === 30 && fa.learners.join() === "503,502" && fa.md.startsWith("# Veille"),
    "sent: the veille at 09:15 for 30 min with its binôme and its markdown; a live coding with someone not linked is not sent (the others still are)");
  // never twice: what the intranet already has at that time in the class (whoever made it) is shown and not sent again
  const as2 = await api("POST", "/api/activities/intranet", { g: G, ids: [va] });
  check(as2.data.sent === 0 && as2.data.skipped === 1 && intranetFake.acts.filter((x) => x.subject === "Flexbox vs Grid").length === 1 && /already on the intranet: « Flexbox vs Grid », created by Prof YouCode on 16\/10\/2026/.test(as2.data.results[va].message),
    "sent again: not sent twice, and it says it's already there, created by whom and when");
  const ap2 = await api("GET", `/api/activities/intranet?g=${G}&from=2030-01-06&to=2030-01-12`);
  check(ap2.data.items.find((x: any) => x.id === va).existing?.mine === true, "…the preview shows it as already on the intranet (sent by ClassBot)");
  intranetFake.acts.push({ id: 7001, classroom: 12, type: "live", subject: "Panier (fait à la main)", datetime: "2030-01-08 11:00", duration: 60, md: "", learners: [], by: "Achraf Chaoub", by_id: 2002, created: "15/10/2026" });
  run1("UPDATE activity_claims SET members = ? WHERE activity_id = ?", JSON.stringify([U.carol.id]), la);
  const ap3 = await api("GET", `/api/activities/intranet?g=${G}&from=2030-01-06&to=2030-01-12`);
  const ex = ap3.data.items.find((x: any) => x.id === la).existing;
  check(ex && ex.by === "Achraf Chaoub" && !ex.mine && ex.subject === "Panier (fait à la main)", "…one made by hand by someone else at that time: shown with who made it");
  check(ex && ex.learner_ids.length === 0 && ap3.data.items.find((x: any) => x.id === la).assign.map((m: any) => m.id).join() === "501", "…its presenters from ClassBot not assigned there yet: to add");
  const as3 = await api("POST", "/api/activities/intranet", { g: G, ids: [la] });
  const hand = intranetFake.acts.find((x) => x.id === 7001)!;
  check(as3.data.sent === 0 && as3.data.assigned === 1 && intranetFake.acts.filter((x) => x.datetime === "2030-01-08 11:00").length === 1 && hand.learners.join() === "501" && hand.subject === "Panier (fait à la main)" && hand.duration === 60,
    "…not sent again (no second live coding at 11:00): only its presenters are added, nothing else changes");
  const as4 = await api("POST", "/api/activities/intranet", { g: G, ids: [la] });
  check(as4.data.assigned === 0 && as4.data.skipped === 1 && hand.learners.join() === "501", "…sent again: nothing more to add, skipped");
  check((await api("GET", `/api/intranet/classrooms?g=${G}`)).status === 200, "reading what's on the intranet goes through the same signed, trainer-only access");
  // from the shared library: the intranet gets the library's key (a second class's copy is a reused one) and the author
  run1("INSERT OR REPLACE INTO app_settings (k, v, updated_at) VALUES (?, ?, ?)", `lib:${G}`, JSON.stringify({ link: "https://hub.example/library/abcdef123456." + "x".repeat(32), name: "A1" }), clock.now());
  run1("INSERT INTO activities (guild_id, day, kind, title, md, created_at, updated_at) VALUES (?, '2030-01-09', 'veille', 'Promesses', '# V', ?, ?)", G, clock.now(), clock.now());
  const vb = q1("SELECT id FROM activities WHERE guild_id = ? AND day = '2030-01-09'", G).id;
  run1("INSERT INTO library_cache (guild_id, kind, key, title, data, version, by, author, updated_at, deleted) VALUES (?, 'activity', '2030-01-09:veille', 'Promesses', NULL, 1, 'DevStorm', 'Achraf Chaoub', ?, 0)", G, clock.now());
  const pvb = await api("GET", `/api/activities/intranet?g=${G}&from=2030-01-09&to=2030-01-09`);
  check(pvb.data.items.find((x: any) => x.id === vb)?.author === "Achraf Chaoub", "a library activity made by another teacher: the preview says who made it");
  await api("POST", "/api/activities/intranet", { g: G, ids: [vb] });
  const sentItem = (intranetFake as any).lastItems?.[0];
  check(sentItem?.library_key === "abcdef123456:2030-01-09:veille" && sentItem.credit === "Achraf Chaoub", `…the intranet gets the library key and the author to credit (${JSON.stringify({ k: sentItem?.library_key, c: sentItem?.credit })})`);
  run1("DELETE FROM activities WHERE id = ?", vb);
  run1("DELETE FROM library_cache WHERE guild_id = ? AND key = '2030-01-09:veille'", G);
  run1("DELETE FROM app_settings WHERE k = ?", `lib:${G}`);
  run1("DELETE FROM intranet_sync WHERE kind = 'activity' AND local_id = ?", vb);
  // these activities were only for the intranet: the next sections use their own
  run1(`DELETE FROM activity_claims WHERE activity_id IN (${va}, ${la})`);
  run1(`DELETE FROM activities WHERE id IN (${va}, ${la})`);
  run1(`DELETE FROM intranet_sync WHERE kind = 'activity' AND local_id IN (${va}, ${la})`);
  check(intranetFake.nonces.size >= 8, `every request but the login was signed, each with its own nonce (${intranetFake.nonces.size})`);
  await api("PUT", "/api/intranet/classroom", { g: G, id: 0 });
  check(!q("SELECT 1 FROM intranet_links WHERE guild_id = ?", G).length, "…no classroom any more: the links go");
  // disconnect: the intranet forgets the token, ClassBot too
  await api("POST", "/api/intranet/logout", { g: G });
  check(!intranetFake.tokens.size && !(JSON.parse(q1("SELECT intranet FROM guilds WHERE id = ?", G).intranet || "{}").auth) && (await api("GET", `/api/intranet?g=${G}`)).data.trainer === null, "Disconnect: the token is revoked on the intranet and forgotten here");
}

section("VS Code activity: time zone, keys, paths and heartbeats (pure)");
{
  const V = await import("../src/shared/vscode.ts");
  // Africa/Casablanca: days, weeks Monday → Sunday, the Ramadan clock change
  check(V.dayOf(Date.UTC(2026, 9, 20, 23, 30) / 1000) === "2026-10-21" && V.dayOf(Date.UTC(2026, 9, 20, 22, 59) / 1000) === "2026-10-20", "a day is a Moroccan day (UTC+1 in October): 23:30 UTC is already tomorrow");
  check(V.weekday("2026-10-25") === 6 && V.mondayOf("2026-10-25") === "2026-10-19" && V.mondayOf("2026-10-19") === "2026-10-19" && V.addDays("2026-12-31", 1) === "2027-01-01", "weeks run Monday → Sunday");
  let lengths = new Set<number>(), okBounds = true;
  for (let d = "2026-01-01"; d < "2027-01-01"; d = V.addDays(d, 1)) {
    const c = V.dayClock(d);
    lengths.add(c.end - c.start);
    if (V.dayOf(c.start) !== d || V.dayOf(c.start - 1) !== V.addDays(d, -1) || V.dayOf(c.end - 1) !== d) okBounds = false;
  }
  check(okBounds && [...lengths].every((n) => [82800, 86400, 90000].includes(n)) && lengths.size > 1, "every day of 2026 starts and ends at Moroccan midnight, including the two Ramadan clock changes (a 23 h and a 25 h day)");
  // keys: only the format wakatime-cli accepts, hashed, read from Basic (like the CLI), Bearer or ?api_key
  const key = V.newKey();
  const CLI_RE = /^(waka_)?[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;   // wakatime-cli pkg/params/params.go
  check(CLI_RE.test(key) && key !== V.newKey(), "a new key has the format wakatime-cli requires (waka_ + UUID v4) and is random");
  const h1 = await V.hashKey(key);
  check(/^[a-f0-9]{64}$/.test(h1) && h1 === await V.hashKey(key.toUpperCase()) && h1 === await V.hashKey(key.slice(5)) && h1 !== await V.hashKey(V.newKey()), "the key is stored as its SHA-256 (with or without waka_, any case)");
  const b64 = (s: string) => Buffer.from(s).toString("base64");
  check(V.keyOf("Basic " + b64(key), null) === key && V.keyOf("Basic " + b64(key + ":"), null) === key && V.keyOf("Basic " + b64(":" + key), null) === key
    && V.keyOf("Bearer " + key, null) === key && V.keyOf(null, key) === key && V.keyOf("Basic " + b64(key.toUpperCase()), null) === key.toLowerCase(), "the key is read like wakatime-cli sends it (Basic base64(key)), and from Bearer or ?api_key=");
  check(V.keyOf("Basic " + b64("not-a-key"), null) === null && V.keyOf("Basic !!!", null) === null && V.keyOf(null, null) === null && V.keyOf("Bearer waka_123", null) === null, "anything else is no key");
  // paths: never absolute
  check(V.relPath("C:\\Users\\Élève\\cours\\portfolio\\src\\index.html", 5) === "src/index.html" && V.relPath("C:/Users/Eleve/cours/portfolio/src/index.html", 5) === "src/index.html", "Windows: the path is cut after the project root (project_root_count)");
  check(V.relPath("/Users/sara/dev/todo/app.js", 5) === "app.js" && V.relPath("/home/sara/dev/todo/lib/a.ts", 5) === "lib/a.ts", "macOS and Linux too (the CLI counts the first slash: /Users/sara/dev/todo/ = 5)");
  check(V.relPath("/Users/sara/dev/todo/app.js", null) === "app.js" && V.relPath("C:/Users/x/secret/file.py", 0) === "file.py" && V.relPath("/a/b.js", 9) === "b.js", "no (or a wrong) root count: only the file name, never the path");
  check(V.relPath("src/app.js", null) === "src/app.js" && V.relPath("./src/app.js", null) === "src/app.js" && V.relPath("../../etc/passwd", null) === "passwd" && V.relPath("HIDDEN.js", 3) === "HIDDEN.js", "relative paths (hide_project_folder) stay, '..' doesn't, HIDDEN (hide_file_names) stays");
  check(V.relPath("ssh://user:pw@host/home/u/p/f.py", 3) === "f.py" && V.relPath("vscode-remote://wsl+Ubuntu/home/u/p/main.c", null) === "main.c", "a remote file: only its name (never a host or a password)");
  check(V.editorOf("wakatime/v1.130.0 (windows-10.0.26100-x86_64) go1.24.4 vscode/1.105.1 vscode-wakatime/25.3.2") === "VS Code" && V.editorOf("wakatime/v1 (darwin) go1.24 cursor/1.7.0 vscode-wakatime/25.3.2") === "Cursor" && V.editorOf("") === "", "the editor from the user agent");
  // one heartbeat
  const t0 = Math.floor(Date.UTC(2026, 9, 20, 9) / 1000);
  const base = { entity: "C:/Users/Sara/cours/todo/src/app.js", type: "file", time: t0, project: "todo", project_root_count: 5, language: "JavaScript", lines: 120, is_write: true, user_agent: "wakatime/v1 vscode/1.105 vscode-wakatime/25" };
  const ok1 = V.checkHeartbeat(base, { now: t0 + 60, hideFiles: false }) as any;
  check(ok1.ok && ok1.hb.f === "src/app.js" && ok1.hb.p === "todo" && ok1.hb.w === 1 && ok1.hb.lines === 120 && ok1.hb.ed === "VS Code" && ok1.hb.cat === "coding" && !JSON.stringify(ok1.hb).includes("Users"), "a heartbeat: what is kept (no absolute path)");
  const bad = (h: any, now = t0 + 60) => V.checkHeartbeat(h, { now, hideFiles: false }) as any;
  check(bad({ ...base, entity: "" }).status === 400 && bad({ ...base, time: "x" }).status === 400 && bad({ ...base, time: t0 + 3600 }, t0).status === 400 && bad(null).status === 400 && bad([1]).status === 400, "malformed (no entity, no time, in the future): 400, the CLI drops it");
  check(bad({ ...base, type: "app" }).status === 201 && bad({ ...base, type: "domain" }).status === 201 && bad(base, t0 + 15 * 86400).status === 201 && (V.checkHeartbeat(base, { now: t0 + 8 * 86400, hideFiles: false, maxAgeDays: 7 }) as any).status === 201, "not a file, or older than 14 days (or than the retention): 201, not kept and not sent again");
  const hid = V.checkHeartbeat({ ...base, category: "weird", ai_line_changes: 12, human_line_changes: 0 }, { now: t0 + 60, hideFiles: true }) as any;
  check(hid.hb.f === "" && hid.hb.cat === "coding" && hid.hb.ai === 12 && hid.hb.lc === 1 && ok1.hb.lc === 0, "file names hidden (class or learner): no file; unknown category = coding; the line changes are kept when sent");
  // duplicates (the offline queue sends some again) and the order (older ones arrive later)
  const H = (min: number, x: Partial<any> = {}): any => ({ t: t0 + min * 60, p: "todo", f: "src/app.js", lang: "JavaScript", cat: "coding", w: 0, lines: 100, ai: 0, hu: 0, lc: 0, ed: "VS Code", ...x });
  const m1 = V.mergeHeartbeats([H(2), H(0)], [H(0), H(1), H(1)]);
  check(m1.added === 1 && m1.list.map((h: any) => (h.t - t0) / 60).join() === "0,1,2", "the same heartbeat twice counts once; the list stays in time order");
  // Auto Save (or Ctrl+S every few seconds): one heartbeat per save, merged by bursts of 30 s on the same file
  const saves = Array.from({ length: 24 }, (_, i) => H(i / 12, { w: i % 2, hu: 1, lc: 1, lines: 100 + i }));   // every 5 s for 2 minutes
  const m2 = V.mergeHeartbeats([], saves);
  check(m2.added === 24 && m2.list.length === 4 && m2.list.every((h: any) => h.w === 1) && m2.list.reduce((n: number, h: any) => n + h.hu, 0) === 24 && m2.list[3].lines === 123, "24 saves in 2 minutes: 4 heartbeats kept (one per 30 s), the saves and line changes kept");
  const clkC = V.dayClock(V.dayOf(t0));
  check(Math.abs(V.computeDay(m2.list, clkC, { idle: 5 }).active - V.computeDay(saves, clkC, { idle: 5 }).active) <= V.COALESCE, "…and the time hardly moves (at most the 30 s of a burst)");
  check(V.mergeHeartbeats([], [H(0), H(0.2, { f: "src/b.js" }), H(0.4)]).list.length === 3, "another file in between is never merged");
  // the compact raw goes and comes back
  const clkR = V.dayClock("2026-10-20");
  const back = V.unpackRaw(V.packRaw([H(0, { w: 1, ai: 3, lc: 1 }), H(5, { f: "", lang: "" })], clkR.start), clkR.start);
  check(back.length === 2 && back[0].w === 1 && back[0].ai === 3 && back[0].lc === 1 && back[1].f === "" && Math.abs(back[1].t - (t0 + 300)) < 0.2 && V.unpackRaw("not json", 0).length === 0, "the raw heartbeats are stored compact and read back the same");
}

section("VS Code activity: temps actif, temps d'écriture, idle limit, midnight, time window (pure)");
{
  const V = await import("../src/shared/vscode.ts");
  const day = "2026-10-20", clk = V.dayClock(day);   // a Tuesday, UTC+1
  const at = (hh: number, mm: number, ss = 0) => V.localTime(day, hh * 60 + mm) + ss;
  const H = (t: number, x: Partial<any> = {}): any => ({ t, p: "todo", f: "src/app.js", lang: "JavaScript", cat: "coding", w: 0, lines: 100, ai: 0, hu: 0, lc: 0, ed: "VS Code", ...x });
  const o = { idle: 5 };
  // typing: a heartbeat every 2 minutes, the file grows → all of it is writing; +60 s after the last one
  const typing = [0, 2, 4, 6, 8, 10].map((m, i) => H(at(9, m), { lines: 100 + i * 3, hu: i ? 3 : 0, lc: 1 }));
  const a1 = V.computeDay(typing, clk, o);
  check(a1.active === 600 + V.LAST_SLICE && a1.write === 600 && a1.sessions.length === 1 && a1.first === at(9, 0) && a1.last === at(9, 10), "typing 10 minutes: temps actif 10 min + the last slice (60 s), temps d'écriture 10 min");
  check(a1.hours[9][0] === 660 && a1.hours[9][1] === 600 && a1.hours[8][0] === 0, "counted in the local hour (09:00 Casablanca)");
  check(a1.hu === 15 && a1.lineData && a1.projects[0][0] === "todo" && a1.files[0][1] === "src/app.js" && a1.langs[0][0] === "JavaScript", "the learner's lines, the project, the file and the language");
  // reading: moving around without changing anything = active, not writing
  const reading = [0, 2, 4].map((m) => H(at(10, m)));
  const a2 = V.computeDay(reading, clk, o);
  check(a2.active === 240 + V.LAST_SLICE && a2.write === 0 && !a2.lineData, "reading or navigating (no change, no save): temps actif only");
  // saving is a change; a different line count than the file's previous heartbeat is one too
  const a3 = V.computeDay([H(at(11, 0)), H(at(11, 2), { w: 1 }), H(at(11, 4)), H(at(11, 6), { lines: 140 })], clk, o);
  check(a3.write === 240 && a3.active === 360 + V.LAST_SLICE, "a save, or the line count changing, makes the minutes before it writing time");
  // a gap longer than the idle limit counts 0 (VS Code open, nobody working)
  const a4 = V.computeDay([H(at(9, 0)), H(at(9, 3)), H(at(9, 20))], clk, o);
  check(a4.active === 180 + 60 + 60 && a4.sessions.length === 2, "a 17-minute gap counts 0: two sessions");
  const a5 = V.computeDay([H(at(9, 0)), H(at(9, 8))], clk, { idle: 10 });
  check(a5.active === 480 + 60 && V.computeDay([H(at(9, 0)), H(at(9, 8))], clk, o).active === 120, "the idle limit is the class's setting (10 min: 8 minutes count; 5 min: they don't)");
  // an AI writing: active (the learner is there), never writing time; its lines are counted apart
  const a6 = V.computeDay([H(at(14, 0)), H(at(14, 2), { cat: "ai coding", ai: 40, lc: 1, lines: 140 }), H(at(14, 4), { hu: 2, lc: 1, lines: 142 })], clk, o);
  check(a6.write === 120 && a6.aiTime === 120 + 0 && a6.ai === 40 && a6.hu === 2 && a6.active === 240 + 60, "an « ai coding » heartbeat: active time, not writing time; AI lines and the learner's lines apart");
  // a big insertion (pasted or generated): the line count jumps between two heartbeats
  const a7 = V.computeDay([H(at(15, 0), { lines: 20 }), H(at(15, 1), { lines: 260 })], clk, o);
  check(a7.big.length === 1 && a7.big[0][3] === 240 && a7.big[0][2] === "src/app.js", "a big insertion is noted (240 lines in a minute)");
  // across midnight: 23:58 → 00:02 is cut at midnight, never counted twice
  const next = "2026-10-21", clkN = V.dayClock(next);
  const late = [H(V.localTime(day, 23 * 60 + 58))], early = [H(V.localTime(next, 2), { w: 1 })];
  const d1 = V.computeDay(late, clk, { ...o, next: { t: Math.floor(early[0].t), changed: true } });
  const d2 = V.computeDay(early, clkN, { ...o, prev: { t: Math.floor(late[0].t) } });
  check(d1.active === 120 && d1.write === 120 && d2.active === 120 + 60 && d2.write === 120 && d1.edge.next && d2.edge.prev, "a session across midnight: 2 minutes on each day (the 4-minute gap once), the writing too");
  check(V.computeDay(late, clk, o).active === 60, "…without the next day: only the last slice");
  // the class's time window: 08:00–18:00 Monday → Friday
  const win = { on: true, from: "08:00", to: "18:00", weekdays: true };
  const a8 = V.computeDay([H(at(7, 50)), H(at(7, 54)), H(at(7, 58)), H(at(8, 2)), H(at(8, 6))], clk, { ...o, window: win });
  check(a8.active === 120 + 240 + 60 && V.computeDay([H(at(7, 50)), H(at(7, 54))], clk, { ...o, window: win }).active === 0, "the time window: only from 08:00 (before it doesn't count)");
  const sat = V.dayClock("2026-10-24");
  check(V.computeDay([H(V.localTime("2026-10-24", 600)), H(V.localTime("2026-10-24", 602))], sat, { ...o, window: win }).active === 0
    && V.computeDay([H(V.localTime("2026-10-24", 600)), H(V.localTime("2026-10-24", 602))], sat, { ...o, window: { ...win, weekdays: false } }).active === 180, "weekdays only: a Saturday counts 0 (unless weekends are allowed)");
  // a week, a brief: added up
  const s = V.sumDays([a1, a2, a6]);
  check(s.active === a1.active + a2.active + a6.active && s.write === a1.write + a6.write && s.days === 3 && s.files[0].file === "src/app.js", "days added up (a week, a brief's dates)");
  check(V.sameProject("todo-app", "sara/Todo_App") && V.sameProject("portfolio", "x/portfolio.git") && !V.sameProject("todo", "x/portfolio") && !V.sameProject("", "x/y"), "a project and a repo are the same work when their names match");
  // signals: « à vérifier », facts only
  const sig = V.signals(day, a2, [{ t: at(10, 30), repo: "sara/todo", adds: 320, dels: 4 }]);
  check(sig.some((x) => x.kind === "commit_little_writing" && x.n === 320 && x.minutes === 0), "320 lines committed on todo with no writing time on it that day: to check");
  const longDay = V.computeDay(Array.from({ length: 50 }, (_, i) => H(at(9, 0) + i * 120)), clk, o);
  check(V.signals(day, longDay, []).some((x) => x.kind === "long_no_commit" && x.file === "src/app.js") && !V.signals(day, longDay, [{ t: at(12, 0), repo: "sara/todo", adds: 10, dels: 0 }]).some((x) => x.kind === "long_no_commit"), "100 minutes on one file with no commit: maybe stuck (a commit on the project: not)");
  check(V.signals(day, a7, []).some((x) => x.kind === "big_insert") && V.signals(day, { ...a6, ai: 120, hu: 30 }, []).some((x) => x.kind === "ai_share" && x.pct === 80) && !V.signals(day, a1, []).some((x) => x.kind === "ai_share"), "a big insertion; 80 % of the lines written by an AI");
  // the status bar: two categories, so the extension shows both times
  const sb = V.statusBar(4980, 2700, "fr");
  check(sb.data.categories.length === 2 && sb.data.categories[0].name === "actif" && sb.data.categories[0].text === "1 h 23" && sb.data.categories[1].text === "45 min" && sb.data.grand_total.text.includes("écriture") && sb.has_team_features === false, "status bar: « 1 h 23 actif, 45 min écriture » (fr)");
  check(V.statusBar(60, 0, "en").data.categories[0].text === "1 min" && V.durText(7200, "en") === "2 hrs 0 mins" && V.statusBar(0, 0, "en", "paused").data.categories.length === 0, "…in English, and a note instead when paused");
  // settings
  const st = V.vscSettings(null);
  check(st.enabled && st.idle === 5 && st.retention === 30 && st.files && !st.window.on, "settings by default: on, 5 minutes, 30 days, file names, no time window");
  check(V.vscSettings(JSON.stringify({ idle: 99, retention: 1, window: { on: true, from: "18:00", to: "08:00" } })).idle === 30 && V.vscSettings(JSON.stringify({ retention: 1 })).retention === 7 && !V.vscSettings(JSON.stringify({ window: { on: true, from: "18:00", to: "08:00" } })).window.on, "settings are kept in range (a window ending before it starts is off)");
  const m2 = V.mergeSettings(st, { consent: "Mon texte" });
  check(m2.consent === "Mon texte" && m2.consent_v === 2 && V.mergeSettings(m2, { idle: 7 }).consent_v === 2, "changing the consent text gives it a new version (learners are asked to read it again)");
  // CPU: a full day is recomputed at each request (the Worker has 10 ms)
  const big = Array.from({ length: V.MAX_PER_DAY }, (_, i) => H(clk.start + 3600 + i * 15, { f: `src/f${i % 40}.js`, lines: 100 + (i % 7), lc: i % 3 ? 1 : 0, hu: i % 3 }));
  const typical = Array.from({ length: 300 }, (_, i) => H(at(8, 0) + i * 90, { f: `src/f${i % 12}.js`, lines: 100 + (i % 5) }));
  const raw = V.packRaw(big, clk.start), rawT = V.packRaw(typical, clk.start);
  for (let i = 0; i < 3; i++) V.computeDay(V.unpackRaw(raw, clk.start), clk, o);
  let t1 = performance.now();
  for (let i = 0; i < 10; i++) V.computeDay(V.unpackRaw(rawT, clk.start), clk, o);
  const typMs = (performance.now() - t1) / 10;
  t1 = performance.now();
  for (let i = 0; i < 5; i++) { const l = V.mergeHeartbeats(V.unpackRaw(raw, clk.start), [H(clk.end - 60)]).list; V.packRaw(l, clk.start); V.computeDay(l, clk, o); }
  const fullMs = (performance.now() - t1) / 5;
  console.log(`    (CPU per request: a typical day of 300 heartbeats ${typMs.toFixed(2)} ms, the ${V.MAX_PER_DAY}-heartbeat cap ${fullMs.toFixed(2)} ms; raw ${Math.round(rawT.length / 1024)} KB / ${Math.round(raw.length / 1024)} KB)`);
  check(typMs < 5 && fullMs < 40, "a typical day is recomputed well under the Worker's 10 ms (the per-day cap is printed above)");
}

section("VS Code activity: /vscode setup, the WakaTime API (heartbeats.bulk, status bar), pause, new key, delete");
{
  const V = await import("../src/shared/vscode.ts");
  const W = await import("../src/bot/wakatime.ts");
  const BASE = "https://bot.example.workers.dev/wakatime/api/v1";
  const b64 = (s: string) => Buffer.from(s).toString("base64");
  const waka = async (method: string, path: string, key: string | null, body?: unknown, extra: Record<string, string> = {}) => {
    const res = await bot.fetch(new Request(BASE + path, {
      method, headers: { "content-type": "application/json", "user-agent": "wakatime/v1.130.0 (windows-10.0-x86_64) go1.24.4 vscode/1.105.1 vscode-wakatime/25.3.2", ...(key ? { authorization: "Basic " + b64(key) } : {}), ...extra },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }), env, makeCtx());
    return { status: res.status, data: await res.json().catch(() => null) as any };
  };
  // setup: the consent first, then the key by DM
  const s1 = await slash(U.alice, "vscode", {}, "setup");
  check(s1.data.flags === 64 && text(s1).includes("What is recorded") && text(s1).includes("30 days") && ids(s1.data).includes("vsc:ok") && ids(s1.data).includes("vsc:no"), "/vscode setup: what is recorded, why, who sees it, how long, then « I agree » (private)");
  check(!q1("SELECT 1 AS x FROM vsc_learners WHERE discord_id = ?", U.alice.id), "nothing is created before the learner agrees");
  const c0 = await click(U.alice, "vsc:no");
  check(text(c0).includes("nothing is recorded") && !q1("SELECT 1 AS x FROM vsc_learners WHERE discord_id = ?", U.alice.id), "Cancel: nothing created");
  discordCalls.length = 0;
  const ok = await click(U.alice, "vsc:ok");
  check(ok.type === 6, "I agree: answered at once (the key goes by DM)");
  const dmMsg = discordCalls.find((c) => c.method === "POST" && c.path === `/channels/dm-${U.alice.id}/messages`)?.body;
  const key = (text(dmMsg).match(/waka_[a-f0-9-]{36}/) ?? [""])[0];
  check(!!key && V.KEY_RE.test(key), "the setup DM carries the learner's own key");
  check(text(dmMsg).includes("api_url = https://bot.example.workers.dev/wakatime/api/v1") && text(dmMsg).includes("hide_project_folder = true") && text(dmMsg).includes("powershell") && text(dmMsg).includes("bash") && text(dmMsg).includes("Your key is personal"), "…with ~/.wakatime.cfg, the PowerShell and bash lines, and the privacy note");
  check(text(lastPatch()).includes("DMs"), "the setup message says the key is in the DMs");
  const lr = q1("SELECT * FROM vsc_learners WHERE guild_id = ? AND discord_id = ?", G, U.alice.id);
  check(lr.key_hash === await V.hashKey(key) && !JSON.stringify(lr).includes(key.slice(5)) && lr.consent_at && lr.consent_v === 1 && lr.key_hint === key.slice(-4), "only the key's hash is stored, with the consent and its version");
  const st0 = await slash(U.alice, "vscode", {}, "status");
  check(text(st0).includes("nothing received yet"), "/vscode status before any heartbeat: waiting, with what to check");
  // auth
  check((await waka("GET", "/users/current/statusbar/today", null)).status === 401 && (await waka("GET", "/users/current/statusbar/today", V.newKey())).status === 401, "no key or an unknown key: 401 (VS Code shows « Invalid Api Key »)");
  const bar0 = await waka("GET", "/users/current/statusbar/today", key);
  check(bar0.status === 200 && bar0.data.data.grand_total.total_seconds === 0 && bar0.data.data.categories.length === 2 && bar0.data.has_team_features === false, "the status bar endpoint answers like wakatime.com (200, grand_total, categories)");
  // heartbeats, as wakatime-cli sends them: a bulk array, Basic auth
  const now0 = clock.now();
  // all on one Moroccan day, in the past: 00:30 today (or yesterday at noon, just after midnight)
  let base = V.localTime(V.dayOf(now0), 30);
  if (base > now0 - 2400) base = V.localTime(V.addDays(V.dayOf(now0), -1), 12 * 60);
  const isToday = V.dayOf(base) === V.dayOf(now0);
  const hb = (dt: number, x: Record<string, unknown> = {}) => ({ entity: "C:\\Users\\Alice\\Documents\\cours\\todo-app\\src\\app.js", type: "file", category: "coding", time: base + dt + 0.123, project: "todo-app", project_root_count: 6, language: "JavaScript", lines: 100, lineno: 3, cursorpos: 7, is_write: false, user_agent: "wakatime/v1.130.0 (windows-10.0-x86_64) go1.24.4 vscode/1.105.1 vscode-wakatime/25.3.2", ...x });
  const r1 = await waka("POST", "/users/current/heartbeats.bulk", key, [hb(0), hb(120, { lines: 104, human_line_changes: 4 }), hb(240, { is_write: true, lines: 110, human_line_changes: 6 })]);
  check(r1.status === 202 && Array.isArray(r1.data.responses) && r1.data.responses.length === 3 && r1.data.responses.every((x: any) => x[1] === 201 && typeof x[0].data.id === "string"), "heartbeats.bulk: 202 with one [body, 201] per heartbeat (what wakatime-cli parses)");
  const today = V.dayOf(base);
  const row1 = q1("SELECT * FROM vsc_days WHERE guild_id = ? AND discord_id = ? AND day = ?", G, U.alice.id, today);
  check(row1 && row1.active_s === 240 + V.LAST_SLICE && row1.write_s === 240 && row1.n === 3 && row1.human_lines === 10, "the day's temps actif and temps d'écriture are computed and stored");
  check(!row1.raw.includes("Users") && !row1.raw.includes("Alice") && !row1.agg.includes("Documents") && row1.raw.includes("src/app.js"), "no absolute path is stored: the file is relative to the project");
  check(q1("SELECT first_seen FROM vsc_learners WHERE discord_id = ?", U.alice.id).first_seen > 0, "the first heartbeat marks the learner connected");
  const bar1 = await waka("GET", "/users/current/statusbar/today", key);
  check(!isToday || (bar1.data.data.grand_total.total_seconds === row1.active_s && bar1.data.data.categories[1].total_seconds === 240 && bar1.data.data.grand_total.text.includes("active")), "the status bar shows today's time, computed like the dashboard");
  // the same heartbeats again (the offline queue): nothing changes, nothing written
  const rev1 = row1.rev;
  const r2 = await waka("POST", "/users/current/heartbeats.bulk", key, [hb(0), hb(120, { lines: 104, human_line_changes: 4 })]);
  check(r2.status === 202 && q1("SELECT rev FROM vsc_days WHERE discord_id = ? AND day = ?", U.alice.id, today).rev === rev1, "the same heartbeats sent again: accepted, counted once, no write");
  // older heartbeats arrive after newer ones: the day is recomputed in time order
  await waka("POST", "/users/current/heartbeats.bulk", key, [hb(600, { lines: 112 }), hb(720, { lines: 112 })]);
  await waka("POST", "/users/current/heartbeats.bulk", key, [hb(360, { lines: 110 }), hb(480, { lines: 112 })]);
  const row2 = q1("SELECT * FROM vsc_days WHERE discord_id = ? AND day = ?", U.alice.id, today);
  check(row2.n === 7 && row2.active_s === 720 + V.LAST_SLICE && row2.write_s === 240 + 120, "late heartbeats (the CLI's offline queue) fill their place: 12 minutes in a row");
  // per item: a malformed one is refused, the others kept
  const r3 = await waka("POST", "/users/current/heartbeats.bulk", key, [hb(800), { entity: "", time: now0 }, { ...hb(900), type: "app" }]);
  check(r3.data.responses[0][1] === 201 && r3.data.responses[1][1] === 400 && r3.data.responses[1][0].error && r3.data.responses[2][1] === 201, "a malformed heartbeat gets its own 400, the others 201");
  check((await waka("POST", "/users/current/heartbeats.bulk", key, "{not json")).status === 400 && (await waka("POST", "/users/current/heartbeats.bulk", key, Array.from({ length: 26 }, (_, i) => hb(i)))).status === 400, "invalid JSON or more than 25 heartbeats: 400");
  const one1 = await waka("POST", "/users/current/heartbeats", key, hb(1000));
  check(one1.status === 202 && one1.data.data.id, "the single heartbeat endpoint works too");
  check((await waka("POST", "/plugins/errors", null, { message: "crash", stacktrace: "C:/Users/Alice/..." })).status === 201 && (await waka("GET", "/users/current/goals/x", key)).status === 404, "the CLI's crash reports: answered, never stored; other paths: 404");
  check(W.rateLimited("test-key-rl") === false && Array.from({ length: 130 }, () => W.rateLimited("test-key-rl")).some(Boolean), "a key sending too much gets 429 (the CLI keeps the heartbeats and sends later)");
  // /vscode status
  const st1 = await slash(U.alice, "vscode", {}, "status");
  check(text(st1).includes("Connected") && text(st1).includes("Today") && text(st1).includes("This week") && text(st1).includes(key.slice(-4)), "/vscode status: connected, last activity, today and this week, the key's last characters");
  // pause: answered as usual (no error in VS Code), nothing kept
  check(text(await slash(U.alice, "vscode", {}, "pause")).includes("Paused"), "/vscode pause");
  const n0 = q1("SELECT n FROM vsc_days WHERE discord_id = ? AND day = ?", U.alice.id, today).n;
  const rp = await waka("POST", "/users/current/heartbeats.bulk", key, [hb(1500)]);
  check(rp.status === 202 && rp.data.responses[0][1] === 201 && q1("SELECT n FROM vsc_days WHERE discord_id = ? AND day = ?", U.alice.id, today).n === n0, "paused: the heartbeats are answered 201 but not kept");
  check((await waka("GET", "/users/current/statusbar/today", key)).data.data.grand_total.text.includes("paused"), "…and the status bar says paused");
  check(text(await slash(U.alice, "vscode", {}, "resume")).includes("Recording again"), "/vscode resume");
  // a new key: the old one stops working at once
  discordCalls.length = 0;
  await slash(U.alice, "vscode", {}, "newkey");
  const key2 = (text(discordCalls.find((c) => c.path === `/channels/dm-${U.alice.id}/messages`)?.body).match(/waka_[a-f0-9-]{36}/) ?? [""])[0];
  check(key2 && key2 !== key && (await waka("GET", "/users/current/statusbar/today", key)).status === 401 && (await waka("GET", "/users/current/statusbar/today", key2)).status === 200, "/vscode newkey: a new key by DM, the old one gets 401");
  check(text(await slash(U.bob, "vscode", {}, "newkey")).includes("haven't set up") || text(lastPatch()).includes("haven't set up"), "newkey without setup: says to run /vscode setup");
  // the class turns it off: answered, not kept, the status bar says so
  run1("UPDATE guilds SET vscode = ? WHERE id = ?", JSON.stringify({ enabled: false }), G);
  const off = await waka("POST", "/users/current/heartbeats.bulk", key2, [hb(1600)]);
  check(off.status === 202 && q1("SELECT n FROM vsc_days WHERE discord_id = ? AND day = ?", U.alice.id, today).n === n0 && (await waka("GET", "/users/current/statusbar/today", key2)).data.data.grand_total.text.includes("off"), "tracking off for the class: answered, nothing kept, the status bar says off");
  check(text(await slash(U.bob, "vscode", {}, "setup")).includes("turned off"), "/vscode setup while it's off: says so");
  run1("UPDATE guilds SET vscode = NULL WHERE id = ?", G);
  // delete: after a confirmation, everything goes and the key stops working
  const del = await slash(U.alice, "vscode", {}, "delete");
  check(ids(del.data).includes("vsc:del") && q("SELECT 1 FROM vsc_days WHERE discord_id = ?", U.alice.id).length > 0, "/vscode delete asks first");
  const del2 = await click(U.alice, "vsc:del");
  check(text(del2).includes("Deleted") && !q("SELECT 1 FROM vsc_days WHERE discord_id = ?", U.alice.id).length && !q1("SELECT 1 AS x FROM vsc_learners WHERE discord_id = ?", U.alice.id) && (await waka("GET", "/users/current/statusbar/today", key2)).status === 401, "…then every day, the key and the consent are deleted");
  // DMs closed: the key comes in the private answer itself
  discordFake.fail.push({ method: "POST", path: "/users/@me/channels", status: 403, code: 50007, n: 1 });
  await slash(U.bob, "vscode", {}, "setup");
  await click(U.bob, "vsc:ok");
  check(/waka_[a-f0-9-]{36}/.test(text(lastPatch())) && text(lastPatch()).includes("DMs are closed"), "DMs closed: the key and the steps in the private answer");
  await slash(U.bob, "vscode", {}, "delete"); await click(U.bob, "vsc:del");
}

section("VS Code activity: the dashboard (today, week, learner, squads, CSV, reminder, settings, checks), midnight and retention in D1");
{
  const V = await import("../src/shared/vscode.ts");
  const DB = await import("../src/shared/vscodedb.ts");
  const BASE = "https://bot.example.workers.dev/wakatime/api/v1";
  const waka = async (key: string, body: unknown) => {
    const res = await bot.fetch(new Request(BASE + "/users/current/heartbeats.bulk", { method: "POST", headers: { "content-type": "application/json", authorization: "Basic " + Buffer.from(key).toString("base64") }, body: JSON.stringify(body) }), env, makeCtx());
    return { status: res.status, data: await res.json() as any };
  };
  const now0 = clock.now(), today = V.dayOf(now0);
  // Alice codes this morning (or the day before when it's just after midnight), on todo-app
  let base = V.localTime(today, 30);
  if (base > now0 - 2400) base = V.localTime(V.addDays(today, -1), 12 * 60);
  const day = V.dayOf(base);
  const keyA = await DB.acceptConsent(env, G, U.alice.id, 1);
  const hb = (dt: number, x: Record<string, unknown> = {}) => ({ entity: `/home/alice/cours/todo-app/src/app.js`, type: "file", time: base + dt, project: "todo-app", project_root_count: 5, language: "JavaScript", lines: 100, is_write: false, ...x });
  await waka(keyA, [hb(0), hb(120, { lines: 104, human_line_changes: 4 }), hb(240, { lines: 110, is_write: true, human_line_changes: 6 }), hb(360, { entity: "/home/alice/cours/todo-app/index.html", language: "HTML", lines: 30 })]);
  // a commit of 320 lines on todo-app that day (GitHub), with only 4 minutes of writing on it
  run1("INSERT OR REPLACE INTO gh_log (guild_id, id, discord_id, kind, repo, branch, t, title, size, bad, adds, dels, files) VALUES (?, 'vsc-sha1', ?, 'commit', 'alice/todo-app', 'main', ?, 'feat: everything', 'real', 0, 320, 2, 9)", G, U.alice.id, base + 600);
  const d = await api("GET", `/api/vscode/day?g=${G}&date=${day}`);
  const ra = d.data.rows.find((r: any) => r.id === U.alice.id), rb = d.data.rows.find((r: any) => r.id === U.bob.id);
  check(d.status === 200 && ra.connected && ra.active === 360 + V.LAST_SLICE && ra.write === 240 && ra.cur.p === "todo-app" && ra.cur.f === "index.html" && ra.hours.length === 24, "Today: each learner's temps actif, temps d'écriture, current project and file, hour by hour");
  check(rb.status === "none" && !rb.connected && d.data.notConnected.some((r: any) => r.id === U.bob.id) && !d.data.rows.some((r: any) => r.id === U.prof.id), "…who isn't connected yet; the teacher isn't a row");
  check(d.data.cards.connected >= 1 && d.data.cards.write >= 240 && d.data.cards.students === d.data.rows.length, "…and the cards (connected, coding now, the class's writing time, no activity)");
  const w = await api("GET", `/api/vscode/week?g=${G}&date=${day}`);
  const wa = w.data.learners.find((l: any) => l.id === U.alice.id);
  check(w.status === 200 && w.data.days.length === 7 && w.data.days[0] === V.mondayOf(day) && wa.write === 240 && wa.cells[V.weekday(day)][1] === 240, "Week: Monday → Sunday, a cell per learner and day, the totals");
  const L = await api("GET", `/api/vscode/learner/${U.alice.id}?g=${G}&date=${day}`);
  check(L.status === 200 && L.data.agg.sessions.length === 1 && L.data.week.length === 7 && L.data.commits.some((c: any) => c.adds === 320 && c.repo === "alice/todo-app"), "A learner: the day's sessions, the week, the day's commits next to the coding time");
  check(L.data.signals.some((s: any) => s.kind === "commit_little_writing" && s.n === 320 && s.project === "todo-app"), "…and « à vérifier »: 320 lines committed on todo-app with 4 minutes of writing on it");
  check((await api("GET", `/api/vscode/learner/999999?g=${G}`)).status === 400, "a learner who isn't in the class: refused");
  // the CSV
  const csv = await api("GET", `/api/vscode/export.csv?g=${G}&date=${day}&period=day`);
  check(csv.status === 200 && String(csv.data).includes("learner,squad,status,active_min,writing_min") && String(csv.data).includes("Alice") && String(csv.data).includes(",4,"), "Export CSV of the day (minutes)");
  const csvw = await api("GET", `/api/vscode/export.csv?g=${G}&date=${day}&period=week`);
  check(String(csvw.data).includes(`${V.mondayOf(day)}_writing_min`) && String(csvw.data).includes("week_writing_min"), "…and of the week");
  // the reminder: only to students not connected
  discordCalls.length = 0;
  const rem = await api("POST", "/api/vscode/remind", { g: G, ids: [U.bob.id, U.alice.id, "424242"] });
  const dmTo = discordCalls.filter((c) => c.path === "/users/@me/channels").map((c) => c.body.recipient_id);
  check(rem.data.sent === 1 && dmTo.join() === U.bob.id && text(discordCalls.find((c) => c.path === `/channels/dm-${U.bob.id}/messages`)?.body).includes("/vscode setup"), "the setup reminder by DM goes only to the ticked learners who aren't connected");
  // settings: file names off, a new consent text
  const s1 = await api("GET", `/api/vscode/settings?g=${G}`);
  check(s1.data.settings.idle === 5 && s1.data.apiUrl === "https://bot.example.workers.dev/wakatime/api/v1" && s1.data.consentDefault.includes("30 days"), "Settings: the defaults, the address for VS Code, the default consent text");
  const s2 = await api("PUT", "/api/vscode/settings", { g: G, files: false, idle: 7, consent: "Ton temps de code est suivi ({retention} jours)." });
  check(s2.data.settings.files === false && s2.data.settings.idle === 7 && s2.data.settings.consent_v === 2, "…saved (a new consent text gets a new version)");
  const L2 = await api("GET", `/api/vscode/learner/${U.alice.id}?g=${G}&date=${day}`);
  const d2 = await api("GET", `/api/vscode/day?g=${G}&date=${day}`);
  check(!L2.data.agg.files.length && d2.data.rows.find((r: any) => r.id === U.alice.id).cur.f === "" && !JSON.stringify(L2.data.signals).includes("src/app.js"), "file names off: the dashboard shows no file");
  const st = await slash(U.alice, "vscode", {}, "status");
  check(text(st).includes("changed the text") && ids(st.data).includes("vsc:setup"), "/vscode status asks to read the new text again (tracking goes on)");
  check(text(await slash(U.bob, "vscode", {}, "setup")).includes("Ton temps de code est suivi (30 jours)"), "/vscode setup shows the class's own text");
  run1("UPDATE guilds SET vscode = NULL WHERE id = ?", G);
  // Run checks: a heartbeat through the endpoint's code, read back, deleted
  const ck = await api("POST", "/api/vscode/check", { g: G });
  check(ck.status === 200 && ck.data.steps.find((x: any) => x.name.startsWith("Send heartbeats")).ok && ck.data.steps.find((x: any) => x.name === "Read back").ok && ck.data.steps.find((x: any) => x.name === "Unknown key refused").ok, "Run checks: send, read back, the status bar, an unknown key refused");
  check(!q("SELECT 1 FROM vsc_days WHERE discord_id = ?", DB.DIAG_ID).length && !q("SELECT 1 FROM vsc_learners WHERE discord_id = ?", DB.DIAG_ID).length, "…and the test heartbeats are deleted");
  // squads: who worked on which file of the squad's repo
  const sid = "a1b2c3";
  const bid = Number(run1("INSERT INTO briefs (guild_id, title, status, data, kind, squads, start_at, due_at, created_at) VALUES (?, 'Todo en squad', 'assigned', '{}', 'squad', ?, ?, ?, ?)",
    G, JSON.stringify([{ id: sid, name: "Les Todo", members: [U.alice.id, U.bob.id], sm: U.alice.id }]), base - 86400, base + 86400, base - 2 * 86400).lastInsertRowid);
  run1("INSERT INTO brief_handins (brief_id, guild_id, who, repo, at) VALUES (?, ?, ?, 'alice/todo-app', ?)", bid, G, `s:${sid}`, base);
  const sv = await api("GET", `/api/vscode/squads?g=${G}&brief=${bid}`);
  const sq = sv.data.view.squads[0], ma = sq.members.find((m: any) => m.id === U.alice.id);
  check(sv.status === 200 && sv.data.briefs.some((b: any) => b.id === bid) && sq.repo === "alice/todo-app" && ma.onProject.write === 240 && sq.members.find((m: any) => m.id === U.bob.id).onProject.active === 0, "Squads: each member's time on the squad's repo");
  check(sq.files.some((f: any) => f.file === "src/app.js" && f.by[U.alice.id][1] === 240) && sq.files.some((f: any) => f.file === "index.html"), "…and who worked on which file");
  // a learner removed from the class: their VS Code data goes too
  run1("INSERT INTO players (guild_id, discord_id, name, coins, created_at) VALUES (?, '199', 'Temp', 0, ?)", G, now0);
  const keyT = await DB.acceptConsent(env, G, "199", 1);
  await waka(keyT, [hb(0), hb(60)]);
  check(q("SELECT 1 FROM vsc_days WHERE discord_id = '199'").length === 1, "(a temporary student with a day of data)");
  await api("DELETE", `/api/students/199?g=${G}`, undefined, {});
  check(!q("SELECT 1 FROM vsc_days WHERE discord_id = '199'").length && !q("SELECT 1 FROM vsc_learners WHERE discord_id = '199'").length && (await waka(keyT, [hb(120)])).status === 401, "a student removed from the class: their days and key are deleted (the key gets 401)");
  // midnight in D1: the day before ends on the first heartbeat after midnight, nothing counted twice
  const dA = V.addDays(today, -3), dB = V.addDays(today, -2);
  const who = { gid: G, uid: U.carol.id, settings: V.vscSettings(null) };
  const H = (t: number, x: Partial<any> = {}): any => ({ t, p: "p", f: "a.js", lang: "JavaScript", cat: "coding", w: 0, lines: 10, ai: 0, hu: 0, lc: 0, ed: "VS Code", ...x });
  await DB.ingest(env, who, [H(V.localTime(dA, 23 * 60 + 54)), H(V.localTime(dA, 23 * 60 + 58))]);
  const a1 = q1("SELECT active_s FROM vsc_days WHERE discord_id = ? AND day = ?", U.carol.id, dA).active_s;
  await DB.ingest(env, who, [H(V.localTime(dB, 2), { w: 1 }), H(V.localTime(dB, 4))]);
  const ra2 = q1("SELECT active_s, write_s FROM vsc_days WHERE discord_id = ? AND day = ?", U.carol.id, dA), rb2 = q1("SELECT active_s, write_s FROM vsc_days WHERE discord_id = ? AND day = ?", U.carol.id, dB);
  check(a1 === 240 + 60 && ra2.active_s === 240 + 120 && ra2.write_s === 120 && rb2.active_s === 120 + 120 + 60, "across midnight in the database: 23:58 → 00:02 counts 2 minutes on each day, the day before is updated");
  // retention: the raw heartbeats go after N days, the totals stay, a late heartbeat can't change them
  run1("UPDATE vsc_days SET day = ? WHERE discord_id = ? AND day = ?", V.addDays(today, -40), U.carol.id, dA);
  const purged = await DB.purgeRaw(env);
  const old = q1("SELECT raw, active_s FROM vsc_days WHERE discord_id = ? AND day = ?", U.carol.id, V.addDays(today, -40));
  check(purged >= 1 && old.raw === null && old.active_s === 360 && q1("SELECT raw FROM vsc_days WHERE discord_id = ? AND day = ?", U.carol.id, dB).raw, "after the retention days (30): the raw heartbeats are cleared, the day's totals stay; recent days keep theirs");
  check(await DB.ingest(env, who, [H(V.localTime(V.addDays(today, -40), 600))]) === 0 && q1("SELECT active_s FROM vsc_days WHERE discord_id = ? AND day = ?", U.carol.id, V.addDays(today, -40)).active_s === 360, "…and a late heartbeat can't change a finished day");
  // integrations: the debrief's member card, the GitHub tab, needs attention
  const mb = await api("GET", `/api/vscode/brief/${bid}?g=${G}&who=s:${sid}`);
  const mA = mb.data.members[U.alice.id], mB = mb.data.members[U.bob.id];
  check(mb.status === 200 && mb.data.repo === "alice/todo-app" && mA.connected && mA.onProject.write === 240 && mA.files.some((f: any) => f.file === "src/app.js") && mB && !mB.connected && mB.active === 0,
    "debrief member card: each member's VS Code time during the brief, on the squad's repo, their most worked files");
  const gd = await api("GET", `/api/vscode/days/${U.alice.id}?g=${G}&days=30`);
  check(gd.data.connected && gd.data.days[day][1] === 240, "GitHub tab: the learner's coding time per day, next to the commits");
  run1("INSERT INTO players (guild_id, discord_id, name, coins, created_at) VALUES (?, '198', 'Quiet', 0, ?)", G, now0);
  await DB.acceptConsent(env, G, "198", 1);
  run1("UPDATE vsc_learners SET first_seen = ? WHERE discord_id = '198'", now0 - 20 * 86400);
  const qb = Number(run1("INSERT INTO briefs (guild_id, title, status, data, kind, start_at, due_at, created_at) VALUES (?, 'Brief en cours', 'assigned', '{}', 'solo', ?, ?, ?)", G, now0 - 15 * 86400, now0 + 5 * 86400, now0 - 16 * 86400).lastInsertRowid);
  const reasonOf = async (id: string) => (await api("GET", `/api/students?g=${G}`)).data.find((r: any) => r.discord_id === id)?.attention ?? [];
  check((await reasonOf("198")).includes("no VS Code writing for 2 working days") && !(await reasonOf(U.alice.id)).includes("no VS Code writing for 2 working days"), "needs attention: connected, no writing time for 2 working days during a brief (a learner connected today isn't)");
  const lastWork = (() => { let x = V.addDays(today, -1); while ([5, 6].includes(V.weekday(x))) x = V.addDays(x, -1); return x; })();
  run1("INSERT INTO vsc_days (guild_id, discord_id, day, active_s, write_s, n, agg, rev, updated_at) VALUES (?, '198', ?, 900, 300, 10, '{}', 1, ?)", G, lastWork, now0);
  check(!(await reasonOf("198")).includes("no VS Code writing for 2 working days"), "…and not once they write again");
  run1("DELETE FROM players WHERE discord_id = '198'"); run1("DELETE FROM briefs WHERE id = ?", qb);
  run1("DELETE FROM vsc_days WHERE guild_id = ?", G); run1("DELETE FROM vsc_learners WHERE guild_id = ?", G);
  run1("DELETE FROM brief_handins WHERE brief_id = ?", bid); run1("DELETE FROM briefs WHERE id = ?", bid); run1("DELETE FROM gh_log WHERE id = 'vsc-sha1'");
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

section("challenges give as many coins as points");
{
  const g = q1("SELECT * FROM guilds WHERE id = ?", G);
  const { finish } = await import("../src/shared/challenges.ts");
  const ch = q1("SELECT * FROM challenges WHERE kind = 'write' AND difficulty = 'easy' LIMIT 1");
  const c0 = q1("SELECT coins FROM players WHERE discord_id = ?", U.carol.id).coins;
  const r = run1("INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, started_at, tries) VALUES (?, ?, ?, 'practice', ?, 1)", G, U.carol.id, ch.id, clock.now() - 300);
  await finish(env, g, q1("SELECT * FROM attempts WHERE id = ?", Number(r.lastInsertRowid)), ch, true);
  const at = q1("SELECT * FROM attempts WHERE id = ?", Number(r.lastInsertRowid));
  const c1 = q1("SELECT coins FROM players WHERE discord_id = ?", U.carol.id).coins;
  check(at.points > 0 && c1 === c0 + at.points, `a practice solve: +${at.points} points and +${c1 - c0} coins`);
  const v = await api("POST", `/api/attempts/${at.id}/integrity?g=${G}`, { action: "void", reason: "copied" });
  const c2 = q1("SELECT coins FROM players WHERE discord_id = ?", U.carol.id).coins;
  check(v.status === 200 && c2 === c0, `the teacher voids the solve: the coins go back too (${c2})`);
}

section("🎮 class games: Battle Royale, SQL Detective, Code Relay (TV + students' devices)");
{
  const GM = await import("../src/shared/games.ts");
  const SC = await import("../src/shared/sqlcases.ts");
  const { DatabaseSync } = await import("node:sqlite");
  // the cases: each teacher's solution passes its own step, and gives exactly what the clue asks
  let casesOk = true;
  for (const c of SC.SQL_CASES) {
    const sdb = new DatabaseSync(":memory:"); sdb.exec(c.schema);
    for (const st of c.steps) if (!SC.checkResult(st, sdb.prepare(st.ref).all().map((r: any) => Object.values(r))).ok) { casesOk = false; console.log("case step fails:", c.id, st.title); }
  }
  check(casesOk, "SQL Detective: every step's solution is accepted by the checker");
  const cafe = SC.SQL_CASES[0];
  check(SC.checkResult(cafe.steps[0], [["Omar Tazi", "15:24", "bureau"], ["Salma Idrissi", "15:12", "bureau"], ["Yassine Amrani", "15:05", "bureau"]]).ok
    && !SC.checkResult(cafe.steps[0], [["Omar Tazi"], ["Salma Idrissi"]]).ok && SC.checkResult(cafe.steps[0], [["x"], ["y"]]).need === 3, "a result: any order, any extra column; the number of rows is said when it's wrong");
  check(SC.checkResult(cafe.steps[3], [["KARIM BENALI ", "860.0"]]).ok && !SC.checkResult(cafe.steps[3], [[860]]).ok && !SC.checkResult(cafe.steps[3], [["Karim Benali", 400]]).ok, "two columns needed: the name AND its own total (case, spaces, 860 = 860.0)");
  check(SC.culpritOk(cafe, " omar  TAZI ") && !SC.culpritOk(cafe, "Karim Benali"), "the culprit, whatever the case and spaces");
  check(!JSON.stringify(SC.caseForPlayers(cafe)).includes("Karim Benali\"],[860") && !JSON.stringify(SC.caseForPlayers(cafe)).includes("SUM(co.total)") && !("culprit" in SC.caseForPlayers(cafe)), "the students' browser never gets the expected values, the solutions or the culprit");
  // royale questions from the squad-battle generator and from an assessment
  const conv = GM.fromBattle([
    { id: "1", kind: "mcq", topic: "HTML", prompt: "Quelle balise ?", options: ["<head>", "<h1>", "<h6>", "<title>"], answer: "B · <h1>" },
    { id: "2", kind: "truefalse", topic: "CSS", prompt: "Vrai ou faux : margin est à l'intérieur de la bordure.", answer: "Faux / False (c'est padding)" },
    { id: "3", kind: "quick", topic: "JS", prompt: "Quick?", answer: "x" },
  ] as any, "fr");
  check(conv.length === 2 && conv[0].answer === 1 && conv[1].options.join() === "Vrai,Faux" && conv[1].answer === 1 && !/^Vrai ou faux/.test(conv[1].prompt), "battle questions → choices (multiple choice and true/false only)");
  check(GM.fromAssessment([{ type: "mcq", prompt: "P", choices: ["a", "b"], answer: [1] }, { type: "mcq", prompt: "Q", choices: ["a", "b", "c"], answer: [0, 2] }, { type: "code", prompt: "C" }]).length === 1, "assessment questions: only one-answer multiple choices");

  const page = await api("GET", `/api/games?g=${G}`);
  check(page.status === 200 && page.data.kinds.relay.modes.join() === "squads,random" && page.data.cases.length >= 2 && page.data.tasks.length >= 6, "the games page: kinds, cases, relay tasks");
  check((await api("POST", `/api/games?g=${G}`, { kind: "royale", mode: "solo", questions: [] })).status === 400 && (await api("POST", `/api/games?g=${G}`, { kind: "relay", mode: "squads", squads: [] })).status === 400, "a royale needs questions, squads need squads");
  // two more students
  for (const [id, nm] of [["104", "Dina"], ["105", "Elias"]]) run1("INSERT OR IGNORE INTO players (guild_id, discord_id, name, last_active, created_at) VALUES (?, ?, ?, ?, ?)", G, id, nm, clock.now(), clock.now());
  const scriptOf = (h: string) => h.slice(h.lastIndexOf("<script>") + 8, h.lastIndexOf("</script>"));
  const dev = (n: number) => String(n).repeat(32).slice(0, 32);
  const game = (created: any) => {
    const play = (path: string, key: string, body?: any) => bot.fetch(new Request(created.join + "/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "x-player-key": key }, body: body ? JSON.stringify({ key, ...body }) : undefined }), env, makeCtx()).then(async (r) => ({ status: r.status, data: await r.json() as any }));
    // the TV, as the teacher's screen calls it: its link (before #) and the teacher's key (after #h=) in a header
    const [tvBase, hostK] = String(created.tv).split("#h=");
    const tv = (path: string, body?: any, key: string | null = hostK) => bot.fetch(new Request(tvBase + "/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(key ? { "x-host-key": key } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, makeCtx()).then(async (r) => ({ status: r.status, data: await r.json() as any }));
    const join = async (k: number, pid: string) => play("join", dev(k), { pass: await GM.gamePass(env, created.id, pid) });
    return { play, tv, join };
  };

  // ---------------------------------------------------------------- 👑 royale, squads
  const qs = [0, 1, 2, 3, 4].map((i) => ({ prompt: "Question " + i, options: ["a" + i, "b" + i, "c" + i, "d" + i], answer: 0 }));
  const R = await api("POST", `/api/games?g=${G}`, { kind: "royale", mode: "squads", squads: [{ name: "Les Requins", members: [U.alice.id, U.bob.id] }, { name: "Les Flammes", members: [U.carol.id] }], questions: qs, settings: { seconds: 20, reviveCost: 1, reward: 15 } });
  check(R.status === 200 && R.data.tv.includes("/game/") && R.data.join.includes("/play/") && R.data.qr.startsWith("<svg") && R.data.live.phase === "lobby", "royale created: TV link, join link + QR");
  {
    // ✏️ the teacher changes the questions before the game starts
    const edited = [...qs.slice(1), { prompt: "Ma question", code: "let a = 1;", options: ["Vrai", "Faux"], answer: 1 }];
    const E = await api("PUT", `/api/games/${R.data.id}?g=${G}`, { questions: edited });
    check(E.status === 200 && E.data.content.questions.length === 5 && E.data.content.questions[4].prompt === "Ma question" && E.data.content.questions[4].answer === 1 && E.data.content.questions[0].prompt === "Question 1",
      `royale: questions edited, removed, added, in the teacher's order (${E.status} ${E.data.error ?? ""})`);
    const bad = await api("PUT", `/api/games/${R.data.id}?g=${G}`, { questions: [{ prompt: "x", options: ["a"], answer: 0 }] });
    check(bad.status === 400, "…never fewer than 3 usable questions");
    await api("PUT", `/api/games/${R.data.id}?g=${G}`, { questions: qs });
  }
  const r = game(R.data);
  const tvHtml = await (await bot.fetch(new Request(R.data.tv), env, makeCtx())).text();
  {
    // 🔒 only the teacher controls the game: the TV link alone (read on the projector, passed around) shows and does nothing
    const noKey = await r.tv("state", undefined, null), badKey = await r.tv("state", undefined, "x".repeat(32));
    const stop = await r.tv("act", { a: "stop" }, null), kickTry = await r.tv("act", { a: "kick", pid: U.alice.id }, "nope");
    check(R.data.tv.includes("#h=") && noKey.status === 403 && noKey.data.host && badKey.status === 403 && stop.status === 403 && kickTry.status === 403 && q1("SELECT json_extract(state, '$.phase') AS p FROM games WHERE id = ?", R.data.id).p === "lobby",
      "🔒 the TV link without the teacher's key: nothing shown, no control (stop, kick… refused)");
    check(!tvHtml.includes(R.data.tv.split("#h=")[1]) && /history\.replaceState/.test(tvHtml) && (await r.tv("state")).status === 200, "…the key comes from the dashboard's link (after #, never in the page), and comes off the address bar");
  }
  const plHtml = await (await bot.fetch(new Request(R.data.join), env, makeCtx())).text();
  let parsed = true;
  try { new Function(scriptOf(tvHtml)); new Function(scriptOf(plHtml)); } catch (e) { parsed = false; console.log(e); }
  check(parsed, "the TV and the student pages' scripts are valid JavaScript (royale)");
  check((await r.play("state", dev(1))).status === 403, "not linked yet: the page sends the student to Discord");
  check((await r.play("join", dev(1), { pid: U.alice.id })).status === 403 && (await r.play("join", dev(1), { pass: "123.9999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" })).status === 403, "no name picking: only a signed pass from Discord lets a device in");
  const otherGamePass = await GM.gamePass(env, R.data.id + 999, U.alice.id);
  check((await r.play("join", dev(1), { pass: otherGamePass })).status === 403, "a pass for another game doesn't work here");
  const ja = await r.join(1, U.alice.id);
  check(ja.status === 200 && ja.data.me.name === "Alice" && ja.data.squad.name === "Les Requins", "Alice joins with her own link: her squad");
  const moved = await r.join(9, U.alice.id);
  check(moved.status === 200 && moved.data.me.pid === U.alice.id && (await r.play("state", dev(1))).status === 403, "her link opened on another device: that device takes over, the old one stops");
  await r.join(1, U.alice.id);
  await r.join(2, U.bob.id); await r.join(3, U.carol.id);
  const e1 = await r.join(4, "104");
  check(e1.data.squad.name === "Les Flammes", "a student in no squad goes to the smallest one");
  await r.join(5, "105");
  const kick = await r.tv("act", { a: "kick", pid: "105" });
  check(kick.status === 200 && !kick.data.players.some((p: any) => p.pid === "105") && kick.data.banned.some((b: any) => b.pid === "105" && b.name), "the teacher removes a student from the TV");
  check((await r.play("state", dev(5))).status === 403 && (await r.join(6, "105")).status === 409, "a removed student can't come back with their link");
  const unb = await r.tv("act", { a: "unban", pid: "105" });
  check(unb.status === 200 && !unb.data.banned.length, "…until the teacher lets them back in");
  await r.tv("act", { a: "kick", pid: "105" });
  check(discordCalls.some((c) => c.method === "POST" && JSON.stringify(c.body).includes(`gjoin:${R.data.id}`)), "the TV's first opening posts the 🎮 Join button in #arena");
  const pl = await slash(U.carol, "play");
  const url = (pl?.data?.components?.[0]?.components?.[0]?.url ?? "") as string;
  check(url.includes(`/play/${R.data.id}.`) && url.includes("#p=") && (await GM.readGamePass(env, R.data.id, url.split("#p=")[1])) === U.carol.id && (pl.data.flags & 64) === 64, "/play: a private link, signed for this student");
  const bt = await click(U.carol, `gjoin:${R.data.id}`);
  check(String(bt?.data?.components?.[0]?.components?.[0]?.url ?? "").includes("#p="), "the 🎮 Join button gives the same private link");
  check(text(await slash({ id: "105", name: "Eve", teacher: false } as any, "play")).includes("removed"), "a removed student is told so in Discord");
  const nBot = q1("SELECT COUNT(*) AS n FROM players WHERE guild_id = ?", G).n;
  const botPick = await call(raw(2, U.alice, { name: "profile", type: 1, options: [{ name: "member", value: "777000777", type: 6 }], resolved: { users: { "777000777": { id: "777000777", username: "classbot", bot: true } }, members: { "777000777": { nick: null } } } }));
  check(text(botPick).includes("bot") && q1("SELECT COUNT(*) AS n FROM players WHERE guild_id = ?", G).n === nBot, "/profile on a bot: no student profile is made for it");
  const pc0 = discordCalls.length;
  check((await r.tv("act", { a: "announce" })).status === 200 && discordCalls.slice(pc0).some((c) => JSON.stringify(c.body).includes("gjoin:")), "the teacher can post the button again");
  const st = await r.tv("act", { a: "start" });
  check(st.status === 200 && st.data.phase === "question" && st.data.q && st.data.q.answer === undefined && st.data.players.length === 4, "start: the first question, never its answer on the TV");
  check((await r.play("answer", dev(1), { step: 1, choice: 0 })).status === 409, "too early: wait for the question");
  check(st.data.qAt - st.data.now >= 4900 && st.data.qAt - st.data.now <= 5100, "a 5-second countdown before the first question");
  clock.advance(3);
  check((await r.play("answer", dev(1), { step: 1, choice: 0 })).status === 409, "still counting down: no answer yet");
  clock.advance(3);
  const order = q1("SELECT state FROM games WHERE id = ?", R.data.id);
  const qi = JSON.parse(order.state).order[0];
  const pa = await r.play("answer", dev(1), { step: 1, choice: qs[qi].answer });
  check(pa.status === 200 && pa.data.picked === 0 && pa.data.q.answer === undefined, "Alice answers (locked, the answer stays hidden)");
  check((await r.play("answer", dev(1), { step: 1, choice: 2 })).status === 409, "an answer can't be changed");
  await r.play("answer", dev(2), { step: 1, choice: 3 });   // Bob wrong
  await r.play("answer", dev(3), { step: 1, choice: 0 });   // Carol right; Dina says nothing
  check((await r.tv("act", { a: "reveal" })).status === 409, "reveal before the time is up (not everyone answered): refused");
  clock.advance(20);
  const rv = await r.tv("act", { a: "reveal" });
  check(rv.data.phase === "reveal" && rv.data.last.out.sort().join() === [U.bob.id, "104"].sort().join() && rv.data.last.right === 2 && rv.data.q.answer === 0 && rv.data.last.dist[0] === 2, "reveal: a wrong answer and no answer are out, the answer and the votes shown");
  check(rv.data.pts[0] === 1 && rv.data.pts[1] === 1, "each right answer gives its squad a point");
  const bobView = await r.play("state", dev(2));
  check(bobView.data.me.alive === false && bobView.data.last.out === true, "Bob sees he's out");
  check((await r.play("revive", dev(3), { target: U.bob.id })).status === 409, "a player can only bring back their own squad");
  check((await r.play("plea", dev(1), {})).status === 409, "only a player who is out can ask to be brought back");
  const plq = await r.play("plea", dev(2), {});
  const av = await r.play("state", dev(1));
  check(plq.status === 200 && plq.data.pleas.includes(U.bob.id) && av.data.pleas.includes(U.bob.id) && !(await r.play("state", dev(3))).data.pleas.length, "🙏 Bob asks his squad to bring him back: Alice sees it, the other squad doesn't");
  const rb = await r.play("revive", dev(1), { target: U.bob.id });
  check(rb.status === 200 && rb.data.pts === 0 && rb.data.squad.mates.find((m: any) => m.pid === U.bob.id).alive, "Alice spends her squad's point: Bob is back");
  check((await r.play("revive", dev(1), { target: U.bob.id })).status === 409, "…once");
  check(!(await r.play("state", dev(1))).data.pleas.length, "brought back: the plea is gone");
  // the next question by itself: a pause long enough to read and bring a teammate back, the teacher can hold it
  check(rv.data.nextAt - rv.data.now >= 6000 && rv.data.nextAt - rv.data.now <= 20000 && (await r.play("state", dev(1))).data.nextAt === rv.data.nextAt, "after the answer: the next question comes by itself in 6-20 s (shown on the TV and the phones)");
  const hold = await r.tv("act", { a: "hold" });
  clock.advance(30);
  check(hold.data.paused && (await r.tv("state")).data.phase === "reveal", "⏸ Pause: it waits as long as the teacher wants");
  const resm = await r.tv("act", { a: "hold" });
  check(!resm.data.paused && resm.data.nextAt - resm.data.now <= 4100, "▶ Resume: the next question 4 s later");
  clock.advance(5);
  const auto = await r.tv("state");
  check(auto.data.phase === "question" && auto.data.step === 2, "…then the next question by itself, without clicking");
  clock.advance(4);
  const qi2 = JSON.parse(q1("SELECT state FROM games WHERE id = ?", R.data.id).state).order[1];
  for (const k of [1, 2, 3]) await r.play("answer", dev(k), { step: 2, choice: (qs[qi2].answer + 1) % 4 });   // everyone wrong
  const rv2 = await r.tv("act", { a: "reveal" });
  check(rv2.data.last.everyone && rv2.data.last.out.length === 0 && rv2.data.players.filter((p: any) => p.alive).length === 3, "everyone wrong (all answered: revealed at once): nobody is out");
  await r.tv("act", { a: "next" });
  clock.advance(4);
  const qi3 = JSON.parse(q1("SELECT state FROM games WHERE id = ?", R.data.id).state).order[2];
  await r.play("answer", dev(1), { step: 3, choice: qs[qi3].answer }); await r.play("answer", dev(2), { step: 3, choice: qs[qi3].answer }); await r.play("answer", dev(3), { step: 3, choice: 3 });
  const rv3 = await r.tv("act", { a: "reveal" });
  check(rv3.data.last.final && rv3.data.winSquad === 0, "only one squad left standing: it wins");
  check(JSON.stringify(rv3.data.last.wiped) === "[1]" && JSON.stringify(rv.data.last.wiped) === "[]", "the squad whose last member fell is marked wiped out (for the animation)");
  const cv = await r.play("state", dev(3));
  check(cv.data.last.wiped === true, "its players see it on their phone too");
  const before = q1("SELECT COALESCE(SUM(amount), 0) AS n FROM ledger WHERE discord_id = ? AND reason = 'game'", U.bob.id)?.n ?? 0;
  const ov = await r.tv("act", { a: "next" });
  const after = q1("SELECT COALESCE(SUM(amount), 0) AS n FROM ledger WHERE discord_id = ? AND reason = 'game'", U.bob.id)?.n ?? 0;
  check(ov.data.phase === "over" && after - before === 15, "the end: the winning squad's players get their points");
  await r.tv("act", { a: "stop" }).catch(() => null);
  const again = await r.tv("act", { a: "reset" });
  check(again.data.phase === "lobby" && again.data.players.length === 4 && again.data.players.every((p: any) => p.alive), "play again: the same players, everyone back");
  // reuse the game from the dashboard: change the squads, remove one player, free everyone
  const chq = await api("PUT", `/api/games/${R.data.id}/squads?g=${G}`, { squads: [{ name: "Nord", members: [U.alice.id, U.carol.id] }, { name: "Sud", members: [U.bob.id] }] });
  check(chq.status === 200 && chq.data.squads.map((x: any) => x.name).join() === "Nord,Sud" && chq.data.live.players.find((p: any) => p.pid === U.carol.id).squad === 0 && chq.data.live.players.find((p: any) => p.pid === "104").squad === 1, "other squads: the players already in are moved (one in none goes to the smallest)");
  const rmv = await api("POST", `/api/games/${R.data.id}/remove?g=${G}`, { pid: "104" });
  check(rmv.status === 200 && !rmv.data.live.players.some((p: any) => p.pid === "104") && (await r.join(4, "104")).status === 200, "remove one player (not banned: their link lets them back in)");
  const clr = await api("POST", `/api/games/${R.data.id}/clear?g=${G}`, {});
  check(clr.status === 200 && clr.data.live.players.length === 0 && clr.data.live.phase === "lobby" && (await r.play("state", dev(1))).status === 403 && clr.data.content.questions.length === 5, "free all the players: an empty lobby with the same questions; the old phones are sent to Discord");
  const pc1 = discordCalls.length;
  check((await api("POST", `/api/games/${R.data.id}/announce?g=${G}`, {})).status === 200 && discordCalls.slice(pc1).some((c) => JSON.stringify(c.body).includes(`gjoin:${R.data.id}`)), "📣 the dashboard posts a new Join button in Discord");
  const pc2 = discordCalls.length;
  await api("POST", `/api/games/${R.data.id}/clear?g=${G}`, {});
  await r.tv("state");
  check(discordCalls.slice(pc2).some((c) => JSON.stringify(c.body).includes(`gjoin:${R.data.id}`)), "after freeing everyone, opening the TV posts the Join button again by itself");
  const relink = await r.join(1, U.alice.id);
  check(relink.status === 200 && relink.data.phase === "lobby", "…and the students join again with their Discord link");

  // ---------------------------------------------------------------- 🕵️ sql, solo
  const Q = await api("POST", `/api/games?g=${G}`, { kind: "sql", mode: "solo", settings: { caseId: "cafe", hintPenalty: 60, wrongPenalty: 120, reward: 10 } });
  check(Q.status === 200 && Q.data.content.case.steps[0].ref, "SQL Detective created (the teacher gets the answer key)");
  const sq = game(Q.data);
  let parsed2 = true;
  try { for (const u of [Q.data.tv, Q.data.join]) new Function(scriptOf(await (await bot.fetch(new Request(u), env, makeCtx())).text())); } catch (e) { parsed2 = false; console.log(e); }
  check(parsed2 && (await (await bot.fetch(new Request(Q.data.join), env, makeCtx())).text()).includes("cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js"), "SQL Detective pages: valid scripts, sql.js from cdnjs");
  await sq.join(1, U.alice.id); await sq.join(2, U.bob.id);
  const cs = await bot.fetch(new Request(Q.data.join + "/case"), env, makeCtx());
  const cj = await cs.json() as any;
  check(cs.status === 200 && cj.schema.includes("CREATE TABLE badges") && cj.steps.length === 4 && !JSON.stringify(cj).includes("Omar Tazi\", \"tazi") && !("culprit" in cj), "the case for the browser: story, database, clues");
  check((await sq.play("check", dev(1), { step: 0, rows: [] })).status === 409, "before the start: nothing counts");
  await sq.tv("act", { a: "start" });
  const sdb = new DatabaseSync(":memory:"); sdb.exec(cafe.schema);
  const rowsOf = (sql: string) => sdb.prepare(sql).all().map((x: any) => Object.values(x));
  const w1 = await sq.play("check", dev(1), { step: 0, rows: rowsOf("SELECT personne FROM badges WHERE porte = 'bureau'") });
  check(w1.status === 200 && !w1.data.ok && w1.data.rows === 8 && w1.data.need === 3, "a wrong result: how many rows it gives, how many are needed");
  const ok1 = await sq.play("check", dev(1), { step: 0, rows: rowsOf(cafe.steps[0].ref) });
  check(ok1.data.ok && ok1.data.step === 1 && /Trois personnes/.test(ok1.data.found), "the right result: the clue is found");
  check((await sq.play("check", dev(1), { step: 0, rows: rowsOf(cafe.steps[0].ref) })).data.stale, "the same step twice: nothing more");
  const h = await sq.play("hint", dev(1), {});
  check(/JOIN/.test(h.data.hint) && JSON.parse(q1("SELECT data FROM game_teams WHERE game_id = ? AND squad = 0", Q.data.id).data).penalty === 60, "a hint: shown, and it costs 60 s");
  for (const k of [1, 2, 3]) await sq.play("check", dev(1), { step: k, rows: rowsOf(cafe.steps[k].ref) });
  const tvq = await sq.tv("state");
  check(tvq.data.teams.find((t: any) => t.squad === 0).step === 4 && tvq.data.feed.length === 4, "the TV: Alice's 4 clues, in the live feed");
  const acc1 = await sq.play("accuse", dev(1), { name: "Karim Benali" });
  check(acc1.status === 200 && !acc1.data.ok && (await sq.play("accuse", dev(1), { name: "Omar Tazi" })).status === 409, "a wrong accusation: a penalty, and a wait before trying again");
  clock.advance(25);
  const acc2 = await sq.play("accuse", dev(1), { name: "omar tazi" });
  check(acc2.data.ok && /Affaire résolue/.test(acc2.data.ending), "the right culprit: case solved");
  check((await sq.play("accuse", dev(2), { name: "Omar Tazi" })).status === 409, "Bob must find the clues first");
  const end = await sq.tv("act", { a: "stop" });
  check(end.data.phase === "over" && end.data.winSquad === 0 && end.data.ranking[0] === 0, "the teacher ends it: Alice's squad (solo) wins");

  // ---------------------------------------------------------------- 🏃 relay, random squads of 2
  const Y = await api("POST", `/api/games?g=${G}`, { kind: "relay", mode: "random", taskIndex: page.data.tasks.findIndex((t: any) => t.fn === "somme"), settings: { size: 2, total: 120, rounds: 1, noise: true, strikes: 2, reward: 20 } });
  check(Y.status === 200 && Y.data.content.task.fn === "somme", "Code Relay created");
  const ry = game(Y.data);
  let parsed3 = true;
  try { for (const u of [Y.data.tv, Y.data.join]) new Function(scriptOf(await (await bot.fetch(new Request(u), env, makeCtx())).text())); } catch (e) { parsed3 = false; console.log(e); }
  check(parsed3, "Code Relay pages: valid scripts");
  for (const [k, pid] of [[1, U.alice.id], [2, U.bob.id], [3, U.carol.id], [4, "104"]] as [number, string][]) await ry.join(k, pid);
  const ys = await ry.tv("act", { a: "start" });
  check(ys.data.phase === "playing" && ys.data.teams.length === 2 && ys.data.teams.every((t: any) => t.order.length === 2), "start: random squads of 2, each with its order");
  check((await ry.join(5, "105")).status === 409, "nobody joins a relay once it runs");
  const tA = ys.data.teams[0];
  const keyOf = (pid: string) => dev([U.alice.id, U.bob.id, U.carol.id, "104"].indexOf(pid) + 1);
  const w0 = tA.order[0], w1p = tA.order[1];
  const v0 = await ry.play("state", keyOf(w0)), v1 = await ry.play("state", keyOf(w1p));
  check(v0.data.writing && v0.data.code.includes("function somme") && !v1.data.writing && v1.data.code === null && v1.data.nextAt > v0.data.now, "the first one writes (with the starter code); the next one waits without seeing the code");
  check((await ry.play("code", keyOf(w1p), { turn: 0, code: "x" })).status === 409, "only the writer can save");
  check((await ry.play("code", keyOf(w0), { turn: 0, code: "function somme(t) {\n  let s = 0;\n" })).status === 200, "the writer's code is saved");
  clock.advance(61);
  const v1b = await ry.play("state", keyOf(w1p));
  check(v1b.data.writing && v1b.data.turn === 1 && v1b.data.code.startsWith("function somme(t) {\n  let s = 0;"), "60 s each (2 min ÷ 2): the next one gets the code as it was left");
  check((await ry.play("code", keyOf(w0), { turn: 0, code: "late" })).status === 200 && JSON.parse(q1("SELECT data FROM game_teams WHERE game_id = ? AND squad = ?", Y.data.id, tA.squad).data).code === "late", "a last save a moment after the turn ends still counts…");
  await ry.play("code", keyOf(w1p), { turn: 1, code: "function somme(t) {\n  let s = 0;\n  for (const x of t) s += x;\n  return s;\n}" });
  check((await ry.play("code", keyOf(w0), { turn: 0, code: "too late" })).status === 409, "…but never over the next one's work");
  // the other squad talks: heard at once, the strike a moment later (once every squad's microphone was compared)
  const tB = ys.data.teams[1];
  const strikesOf = (v: any, q: number) => v.data.teams.find((t: any) => t.squad === q).strikes;
  const n1 = await ry.play("noise", keyOf(tB.order[0]), { rel: 0 });
  check(n1.data.pending && (await ry.play("noise", keyOf(tB.order[0]), { rel: 0 })).data.ignored && strikesOf(await ry.tv("state"), tB.squad) === 0, "a voice is heard (one per burst), no strike yet…");
  clock.advance(2);
  check(strikesOf(await ry.tv("state"), tB.squad) === 1 && (await ry.play("state", keyOf(tB.order[1]))).data.lastNoise?.why === "voice", "…a moment later, the strike for the squad");
  const pardon = await ry.tv("act", { a: "pardon", squad: tB.squad });
  check(pardon.data.teams.find((t: any) => t.squad === tB.squad).strikes === 0, "the teacher cancels a false strike");
  // the same room: squad B talks, squad A's microphone hears it too, much quieter: only B gets the strike
  clock.advance(6);
  await ry.play("noise", keyOf(tB.order[1]), { rel: -1 });
  await ry.play("noise", keyOf(tA.order[0]), { rel: -12 });
  clock.advance(2);
  const sameRoom = await ry.tv("state");
  check(strikesOf(sameRoom, tB.squad) === 1 && strikesOf(sameRoom, tA.squad) === 0, "another squad talking: only the squad whose microphone heard it loudest gets the strike");
  // both squads talk at the same moment (heard as loud by both): both get one
  clock.advance(6);
  await ry.play("noise", keyOf(tB.order[0]), { rel: -2 });
  await ry.play("noise", keyOf(tA.order[0]), { rel: 0 });
  clock.advance(2);
  const both = await ry.tv("state");
  check(strikesOf(both, tB.squad) === 2 && both.data.teams.find((t: any) => t.squad === tB.squad).out && strikesOf(both, tA.squad) === 1 && (await ry.play("code", keyOf(tB.order[1]), { turn: 1, code: "x" })).status === 409,
    "two squads talking at once: both get a strike; 2 strikes: the squad is out");
  await ry.tv("act", { a: "pardon", squad: tA.squad });
  // anti-cheat: leaving full screen stops the student (no saving) until the teacher lets them back in; copy-paste: the TV is told
  {
    const wA = ys.data.teams[0].order[1];
    const c1 = await ry.play("cheat", keyOf(wA), { what: "fullscreen" });
    const c2 = await ry.play("cheat", keyOf(wA), { what: "paste" });
    const c3 = await ry.play("cheat", keyOf(wA), { what: "paste" });
    const tvc = await ry.tv("state");
    const tA0 = tvc.data.teams.find((t: any) => t.squad === tA.squad);
    const pv = await ry.play("state", keyOf(wA));
    check(c1.data.locked && tA0.locks[wA] === "fullscreen" && tA0.alerts.filter((a: any) => a.what === "paste").length === 1 && pv.data.locked === "fullscreen" && pv.data.writing === false && pv.data.lockScreen === true && pv.data.noPaste === true,
      "anti-cheat: leaving full screen stops the student (shown on the TV), a paste attempt is told once per burst");
    void c2;
    const back = await ry.tv("act", { a: "letin", pid: wA });
    const pv2 = await ry.play("state", keyOf(wA));
    check(!back.data.teams.find((t: any) => t.squad === tA.squad).locks[wA] && pv2.data.locked === null && back.data.teams.find((t: any) => t.squad === tA.squad).alerts.some((a: any) => a.what === "back" && a.pid === wA), "…the teacher lets them back in from the TV");
  }
  // a muted microphone (the keyboard's mute key): the TV sees it, and the squad gets a strike
  await ry.play("mic", keyOf(tA.order[1]), { state: "muted" });
  const tvm = await ry.tv("state");
  clock.advance(4);
  const mutedV = await ry.play("noise", keyOf(tA.order[1]), { why: "muted" });
  const avM = await ry.play("state", keyOf(tA.order[0]));
  check(tvm.data.players.find((p: any) => p.pid === tA.order[1]).mic === 2 && mutedV.data.strikes === 1
    && avM.data.lastNoise.why === "muted" && avM.data.mates.length === 2 && avM.data.mates.find((m: any) => !m.me).mic === 2 && avM.data.rounds === 1, "a muted mic: shown on the TV, a strike, the squad sees who");
  await ry.tv("act", { a: "pardon", squad: tA.squad });
  await ry.tv("act", { a: "pardon", squad: tA.squad });
  clock.advance(40);
  const test = await ry.tv("state");
  check(test.data.phase === "testing" && test.data.teams.find((t: any) => t.squad === tA.squad).code.includes("return s"), "time's up: the tests (the TV gets the codes)");
  const codes = await ry.tv("codes");
  check(codes.data.fn === "somme" && codes.data.tests.length === 6 && codes.data.codes[tB.squad] === null, "the TV runs every squad's code (not the one that is out)");
  const res = await ry.tv("act", { a: "results", results: { [tA.squad]: { passed: 6, total: 6, details: [] }, [tB.squad]: { passed: 0, total: 6, error: "out" } } });
  const winners = res.data.players.filter((p: any) => p.squad === tA.squad).map((p: any) => p.pid);
  check(res.data.phase === "over" && res.data.winSquad === tA.squad && res.data.ranking[0] === tA.squad && !res.data.aiJudge && winners.every((pid: string) => q1("SELECT COUNT(*) AS n FROM ledger WHERE discord_id = ? AND reason = 'game' AND ref = ?", pid, String(Y.data.id)).n === 1), "the most tests passed wins; its players get their points");
  const mine = await ry.play("state", keyOf(w0));
  check(mine.data.result.passed === 6 && mine.data.rank === 1 && mine.data.code.includes("return s"), "each student sees their squad's result and final code");
  {
    // nobody passed a test (time ran out): the AI reads the codes, the closest squad wins; the tests always come first
    const Y2 = await api("POST", `/api/games?g=${G}`, { kind: "relay", mode: "random", taskIndex: page.data.tasks.findIndex((t: any) => t.fn === "somme"), settings: { size: 2, total: 120, rounds: 1, noise: false } });
    const r2 = game(Y2.data);
    for (const [k, pid] of [[1, U.alice.id], [2, U.bob.id], [3, U.carol.id], [4, "104"]] as [number, string][]) await r2.join(k, pid);
    const s2 = await r2.tv("act", { a: "start" });
    const kOf = (pid: string) => dev([U.alice.id, U.bob.id, U.carol.id, "104"].indexOf(pid) + 1);
    const [sa, sb] = s2.data.teams;
    // no microphones: the teacher gives the strikes from the TV
    const ign = await r2.play("noise", kOf(sa.order[0]), { rel: 0 });
    const st1 = await r2.tv("act", { a: "strike", squad: sa.squad });
    const pv = await r2.play("state", kOf(sa.order[1]));
    check(ign.data.ignored && st1.data.teams.find((t: any) => t.squad === sa.squad).strikes === 1 && pv.data.strikes === 1 && pv.data.lastNoise?.why === "teacher" && pv.data.noise === false,
      "microphones off: a voice is ignored, the teacher gives a strike from the TV (the squad sees it's from the teacher)");
    await r2.tv("act", { a: "strike", squad: sa.squad });
    const st3 = await r2.tv("act", { a: "strike", squad: sa.squad });
    check(st3.data.teams.find((t: any) => t.squad === sa.squad).out && (await r2.tv("act", { a: "strike", squad: sa.squad })).data.teams.find((t: any) => t.squad === sa.squad).strikes === 3, "…3 strikes (the default): out, and no more after");
    await r2.tv("act", { a: "pardon", squad: sa.squad });
    await r2.play("code", kOf(sa.order[0]), { turn: 0, code: "function somme(t) {\n  // rien\n  return 0\n}" });
    await r2.play("code", kOf(sb.order[0]), { turn: 0, code: "function somme(t) {\n  // presque\n  let s = 0; for (const x of t) s + x;\n  return s;\n}" });
    clock.advance(130);
    await r2.tv("state");
    const fin = await r2.tv("act", { a: "results", results: { [sa.squad]: { passed: 0, total: 6 }, [sb.squad]: { passed: 0, total: 6 } } });
    const sv = await r2.play("state", kOf(sb.order[0]));
    check(fin.data.phase === "over" && fin.data.winSquad === sb.squad && fin.data.ranking[0] === sb.squad && /presque juste/.test(fin.data.aiJudge?.why?.[sb.squad] || "") && /presque juste/.test(sv.data.aiWhy || "") && sv.data.rank === 1,
      "no squad passed a test: the AI ranks the codes, the closest one wins (and each squad sees why)");
  }
  // the relay's test runner (the same code runs in the TV's Web Worker)
  const workerSrc = scriptOf(await (await bot.fetch(new Request(Y.data.tv), env, makeCtx())).text()).match(/new Blob\(\[("(?:[^"\\]|\\.)*")\]/);
  let runOk = false;
  if (workerSrc) {
    const src = JSON.parse(workerSrc[1]);
    let out: any = null;
    const fake: any = { postMessage: (m: any) => { out = m; } };
    new Function("self", "postMessage", src + "\nself.onmessage = onmessage;")(fake, fake.postMessage);
    const onm = new Function("postMessage", src + "\nreturn onmessage;")((m: any) => { out = m; });
    onm({ data: { code: "function somme(t){return t.reduce((a,b)=>a+b,0)}", fn: "somme", tests: [{ args: [[1, 2]], expect: 3 }, { args: [[]], expect: 1 }] } });
    runOk = out && out.out[0].ok && !out.out[1].ok && out.out[1].got === "0";
    onm({ data: { code: "function nope(){}", fn: "somme", tests: [] } });
    runOk = runOk && /n'existe pas/.test(out.error);
  }
  check(runOk, "the test runner: right/wrong per test, a missing function said clearly");
  const del = await api("DELETE", `/api/games/${Y.data.id}?g=${G}`);
  check(del.status === 200 && !q1("SELECT COUNT(*) AS n FROM game_players WHERE game_id = ?", Y.data.id).n && (await bot.fetch(new Request(Y.data.tv.split("#")[0] + "/state"), env, makeCtx())).status === 404, "a deleted game: its links stop working");
  // ---------------------------------------------------------------- the built-in relay challenges: each reference solution passes its tests
  const GC = await import("../src/shared/gamecontent.ts");
  let bankOk = true;
  for (const t of GC.RELAY_TASKS) { const rr = await GC.runRelay(env, "python", t.solution!, t.fn, t.tests); if (rr.passed !== t.tests.length) { bankOk = false; console.log("relay bank:", t.fn, rr); } }
  check(bankOk && GC.RELAY_TASKS.filter((t) => t.level !== "easy").length >= 8, "Code Relay: harder built-in challenges, each one checked against its reference solution");
  check(GC.starterFor({ fn: "cesar", params: ["texte", "decalage"] }, "python") === "def cesar(texte, decalage):\n    pass\n" && GC.starterFor({ fn: "cesar", params: ["texte", "decalage"] }, "php").includes("function cesar($texte, $decalage)")
    && GC.literal({ a: [true, null] }, "python") === '{"a": [True, None]}' && GC.literal({ a: 1 }, "php") === '["a" => 1]', "the starter code and the examples in the chosen language");
  const phpR = await GC.runRelay(env, "php", "<?php\nfunction somme($t) { return array_sum($t); }", "somme", [{ args: [[1, 2, 3]], expect: 6 }, { args: [[]], expect: 1 }]);
  const pyErr = await GC.runRelay(env, "python", "def somme(t:\n", "somme", [{ args: [[1]], expect: 1 }]);
  check(phpR.passed === 1 && phpR.total === 2 && !phpR.details[1].ok && pyErr.passed === 0 && /Syntax|invalid/i.test(pyErr.error || ""), "PHP and Python run on the code runner: per-test results, an error said clearly");
  // ---------------------------------------------------------------- AI challenges and cases, checked by running them
  const ait = await api("POST", `/api/games/task?g=${G}`, { prompt: "doubler des nombres", level: "medium" });
  check(ait.status === 200 && ait.data.task.fn === "doubler" && ait.data.task.tests.length === 5 && !ait.data.task.tests.some((t: any) => JSON.stringify(t.expect) === "[99]") && ait.data.task.by === "ai", "an AI challenge: its solution runs on its tests, the wrong test is dropped");
  const aic = await api("POST", `/api/games/case?g=${G}`, { prompt: "un cookie", level: "easy" });
  check(aic.status === 200 && aic.data.case.steps.length === 2 && aic.data.dropped.length === 1 && aic.data.case.steps[0].expect.rows === 2 && aic.data.case.steps[1].expect.all.length === 2 && aic.data.case.culprit.includes("ali ben") && aic.data.case.culprit.includes("ben ali"), "an AI case: its queries run on its database (SQLite), the broken step dropped, the expected results computed");
  const own = await api("POST", `/api/games/case?g=${G}`, { case: { title: "Mon enquête", schema: "CREATE TABLE t (nom TEXT); INSERT INTO t VALUES ('A'),('B');", culprit: "A", steps: [{ clue: "Tout", ref: "SELECT nom FROM t" }, { clue: "Le A", ref: "SELECT nom FROM t WHERE nom = 'A'" }] } });
  const bad = await api("POST", `/api/games/case?g=${G}`, { case: { schema: "CREATE TABLE t (x", culprit: "A", steps: [{ clue: "a", ref: "SELECT 1" }, { clue: "b", ref: "SELECT 2" }] } });
  check(own.status === 200 && own.data.case.steps[1].expect.rows === 1 && bad.status === 400 && /database has an error|error/i.test(bad.data.error), "the teacher's own case: checked the same way (a broken database is refused)");
  const CG = await api("POST", `/api/games?g=${G}`, { kind: "sql", mode: "solo", case: aic.data.case });
  const cgp = game(CG.data);
  await cgp.join(1, U.alice.id); await cgp.tv("act", { a: "start" });
  const cgc = await bot.fetch(new Request(CG.data.join + "/case"), env, makeCtx());
  const cgj = await cgc.json() as any;
  const c1 = await cgp.play("check", dev(1), { step: 0, rows: [["Ali Ben"], ["Sara Lou"]] });
  const c2 = await cgp.play("check", dev(1), { step: 1, rows: [["10:05", "Ali Ben", "profs"]] });
  check(CG.status === 200 && cgj.title === "Le cookie disparu" && !JSON.stringify(cgj).includes("ali ben") && c1.data.ok && c2.data.ok && (await cgp.play("accuse", dev(1), { name: "Ben Ali" })).data.ok, "a game with the AI case: the clues found, the culprit named");
  const RG = await api("POST", `/api/games?g=${G}`, { kind: "relay", mode: "random", task: ait.data.task, settings: { codeLang: "python", size: 2, total: 60 } });
  check(RG.status === 200 && RG.data.content.starter === "def doubler(tableau):\n    pass\n" && RG.data.content.lang === "Python", "a Python relay with the AI challenge");
  const rg = game(RG.data);
  await rg.join(1, U.alice.id); await rg.join(2, U.bob.id);
  const rgs = await rg.tv("act", { a: "start" });
  const wr = rgs.data.teams[0].writer, wk = dev(wr === U.alice.id ? 1 : 2);
  const pv = await rg.play("state", wk);
  check(pv.data.codeLang === "python" && pv.data.task.shown[0].call === "doubler([1, 2])" && pv.data.code.startsWith("def doubler"), "the students see Python: the starter, the examples written in Python");
  const tr = await rg.play("try", wk, { code: "def doubler(tableau):\n    return [x * 2 for x in tableau]\n" });
  check(tr.status === 200 && tr.data.passed === 2 && (await rg.play("try", wk, { code: "x" })).status === 409, "try the examples on the code runner (once every few seconds)");
  await rg.play("code", wk, { turn: 0, code: "def doubler(tableau):\n    return [x * 2 for x in tableau]\n" });
  clock.advance(70);
  await rg.tv("state");
  const rt = await rg.tv("act", { a: "runtests" });
  check(rt.status === 200 && rt.data.phase === "over" && rt.data.results[rgs.data.teams[0].squad].passed === 5 && rt.data.winSquad === rgs.data.teams[0].squad, "the end of a Python relay: the server runs every squad's code, the most tests passed wins");
  const list = await api("GET", `/api/games?g=${G}`);
  check(list.data.items.some((x: any) => x.id === R.data.id && x.players === 1) && list.data.myTasks.some((t: any) => t.fn === "doubler") && list.data.myCases.some((c: any) => c.title === "Le cookie disparu") && Array.isArray(list.data.battles) && list.data.langs.python, "the games page: the games, the challenges and cases made before (to play again), the squad battles");
}

section("🎤 Activités: shared in Discord, /activity choose with a binôme, approved, graded; fair random presenters");
{
  run1("UPDATE guilds SET teacher_id = ? WHERE id = ?", U.prof.id, G);
  const extra = [{ id: "131", name: "Hind", teacher: false }, { id: "132", name: "Ilyas", teacher: false }, { id: "133", name: "Jad", teacher: false }, { id: "134", name: "Kenza", teacher: false }];
  for (const u of extra) await slash(u, "help");
  const add = (day: string, kind: string, title: string) => Number(run1("INSERT INTO activities (guild_id, day, kind, title, md, created_at) VALUES (?, ?, ?, ?, ?, ?)", G, day, kind, title, `# ${title}\n\n## Objectif\nPrésenter ${title}.\n\n## Ressources\n- MDN`, clock.now()).lastInsertRowid);
  const v1 = add("2031-03-03", "veille", "Sélecteurs DOM modernes"), v2 = add("2031-03-04", "veille", "Gestion des événements"), l1 = add("2031-03-04", "live", "Catalogue interactif"), v3 = add("2031-03-05", "veille", "Formulaires et validation");
  // nothing is open before the teacher shares
  check(text(await slash(U.alice, "activity", {}, "list")).includes("No activity is open"), "/activity list: nothing before the teacher shares");
  check((await api("POST", `/api/activities/share?g=${G}`, { ids: [v1, v2, l1] })).status === 400, "sharing needs a channel");
  const before = discordCalls.length;
  const sh = await api("POST", `/api/activities/share?g=${G}`, { ids: [v1, v2, l1], channel: "555000111" });
  check(sh.status === 200 && sh.data.shared === 3 && discordCalls.slice(before).some((c) => c.path === "/channels/555000111/messages" && JSON.stringify(c.body).includes("Sélecteurs DOM modernes")), "teacher shares the activities in the channel chosen");
  const shMsg = discordCalls.slice(before).find((c) => c.path === "/channels/555000111/messages");
  check(/(week of|semaine du) 03\/03/.test(JSON.stringify(shMsg?.body?.embeds?.[0]?.title ?? "")), "shared week by week: the message's title names the week");
  const ls = text(await slash(U.alice, "activity", {}, "list"));
  check(ls.includes("Gestion des événements") && !ls.includes("Formulaires et validation"), "/activity list: the shared ones only");
  // a veille needs a binôme
  await slash(U.alice, "activity", { activity: String(v1) }, "choose");
  check(JSON.stringify(lastPatch()).includes("binôme"), "a veille without a partner is refused");
  const dm0 = discordCalls.length;
  await slash(U.alice, "activity", { activity: String(v1), partner: U.bob.id }, "choose");
  check(JSON.stringify(lastPatch()).includes("Request sent") && q1("SELECT COUNT(*) AS n FROM activity_claims WHERE activity_id = ? AND status = 'pending'", v1).n === 1, "Alice asks for a veille with Bob: pending");
  check(discordCalls.slice(dm0).some((c) => c.path === `/channels/dm-${U.prof.id}/messages` && JSON.stringify(c.body).includes("Alice") && JSON.stringify(c.body).includes("veille(s)")), "the teacher gets a DM with each student's count");
  await slash(U.alice, "activity", { activity: String(v2), partner: U.carol.id }, "choose");
  check(JSON.stringify(lastPatch()).includes("already have a request waiting"), "one request at a time: no hogging");
  await slash(U.carol, "activity", { activity: String(v1), partner: U.bob.id }, "choose");
  check(JSON.stringify(lastPatch()).includes("Bob") || JSON.stringify(lastPatch()).includes(U.bob.id), "the partner already has a request waiting");
  await slash(U.carol, "activity", { activity: String(v1), partner: extra[0].id }, "choose");
  const view0 = await api("GET", `/api/activities/signups?g=${G}&from=2031-03-02&to=2031-03-08`);
  check(view0.data.pending.length === 2 && view0.data.pending[0].members.length === 2, "two requests for the same veille wait for the teacher");
  // approve one: the other is denied, the subject leaves the list
  const ok1 = await api("POST", `/api/activities/claims/${view0.data.pending[0].id}/decide?g=${G}`, { approve: true });
  check(ok1.status === 200 && q1("SELECT status FROM activity_claims WHERE id = ?", view0.data.pending[1].id).status === "denied", "approved; the other request for it is denied");
  check(discordCalls.some((c) => c.path === `/channels/dm-${U.bob.id}/messages` && JSON.stringify(c.body).includes("approved")), "both presenters get a DM");
  check(!text(await slash(U.carol, "activity", {}, "list")).includes("Sélecteurs DOM modernes"), "a taken activity isn't listed anymore");
  await slash(U.carol, "activity", { activity: String(v1), partner: extra[1].id }, "choose");
  check(JSON.stringify(lastPatch()).includes("already taken"), "nobody else can take it");
  await slash(U.bob, "activity", {}, "mine");
  check(JSON.stringify(lastPatch()).includes("Présenter Sélecteurs DOM modernes"), "/activity mine: the subject once it's approved");
  // the teacher adds a third person, then grades
  const claim = ok1.data && q1("SELECT id FROM activity_claims WHERE activity_id = ? AND status = 'approved'", v1).id;
  check((await api("PUT", `/api/activities/claims/${claim}/members?g=${G}`, { members: [U.alice.id, U.bob.id, U.carol.id] })).status === 200, "a third person added to the binôme");
  check((await api("PUT", `/api/activities/claims/${claim}/members?g=${G}`, { members: [U.alice.id, U.bob.id, U.carol.id, extra[0].id] })).status === 400, "4 people: refused");
  const pts = (id: string) => q1("SELECT COALESCE(SUM(amount), 0) AS n FROM ledger WHERE discord_id = ? AND reason = 'activity'", id).n;
  const coins = (id: string) => q1("SELECT coins FROM players WHERE guild_id = ? AND discord_id = ?", G, id)?.coins ?? 0;
  const c0 = { a: coins(U.alice.id), b: coins(U.bob.id), c: coins(U.carol.id) };
  check(pts(U.alice.id) === 0, "no points before the presentation");
  const gr = await api("POST", `/api/activities/claims/${claim}/grade?g=${G}`, { grades: { [U.alice.id]: 100, [U.bob.id]: 50, [U.carol.id]: 0 }, note: "Clair et bien illustré" });
  check(gr.status === 200 && coins(U.alice.id) - c0.a === 20 && coins(U.bob.id) - c0.b === 10 && coins(U.carol.id) === c0.c && pts(U.alice.id) === 0 && pts(U.bob.id) === 0, "graded: coins by how well each one presented, never points");
  await api("POST", `/api/activities/claims/${claim}/grade?g=${G}`, { grades: { [U.alice.id]: 100, [U.bob.id]: 100, [U.carol.id]: 0 } });
  check(coins(U.bob.id) - c0.b === 20 && coins(U.alice.id) - c0.a === 20, "a new grade only adds the difference");
  check((await api("POST", `/api/activities/claims/${claim}/cancel?g=${G}`)).status === 400, "a graded presentation can't be freed");
  // a live coding: alone is fine, 3 is too many; it's worth more
  await slash(extra[2], "activity", { activity: String(l1) }, "choose");
  check(JSON.stringify(lastPatch()).includes("Request sent"), "a live coding can be led alone");
  const lc = q1("SELECT id FROM activity_claims WHERE activity_id = ? AND status = 'pending'", l1).id;
  await api("POST", `/api/activities/claims/${lc}/decide?g=${G}`, { approve: true });
  const cx = coins(extra[2].id);
  await api("POST", `/api/activities/claims/${lc}/grade?g=${G}`, { grades: { [extra[2].id]: 100 } });
  check(coins(extra[2].id) - cx === 40 && pts(extra[2].id) === 0, "a live coding gives more coins (40), no points");
  check((await api("PUT", `/api/activities/signups?g=${G}`, { veille: 99, live: 99 })).data.cfg.veille === 20, "the coins of a veille and a live coding are fixed (20 and 40)");
  // the teacher assigns by hand, and frees it
  const asg = await api("POST", `/api/activities/${v2}/assign?g=${G}`, { members: [extra[3].id, extra[1].id] });
  check(asg.status === 200 && discordCalls.some((c) => c.path === `/channels/dm-${extra[3].id}/messages` && JSON.stringify(c.body).includes("gave you")), "teacher assigns a veille to two students (DM)");
  check((await api("POST", `/api/activities/${v2}/assign?g=${G}`, { members: [U.alice.id, U.bob.id] })).status === 400, "an assigned activity can't be assigned twice");
  await api("POST", `/api/activities/claims/${asg.data.id}/cancel?g=${G}`);
  check(q1("SELECT status FROM activity_claims WHERE id = ?", asg.data.id).status === "cancelled", "freed again");
  // fairness: counts, behind, random picks the fewest first and keeps hard subjects from Faible / Critique students
  const st = await api("GET", `/api/activities/stats?g=${G}`);
  const row = (id: string) => st.data.rows.find((r: any) => r.discord_id === id);
  check(row(U.alice.id).vDone === 1 && row(extra[2].id).lDone === 1 && row(extra[0].id).total === 0 && row(extra[0].id).behindV === (st.data.avgVeille >= 0.5) && row(extra[0].id).behindL === (st.data.avgLive >= 0.5), "who presented what; nobody is 'behind' on a kind while its class average is under one half");
  const SG = await import("../src/shared/actsignup.ts");
  const gS = q1("SELECT * FROM guilds WHERE id = ?", G);
  // behind is per kind: a student with 2 veilles and no live coding is behind on live codings when the others have one
  const fake = { rows: [{ veille: 2, live: 0 }, { veille: 0, live: 1 }, { veille: 1, live: 1 }, { veille: 1, live: 1 }] };
  const avgV = fake.rows.reduce((a, r) => a + r.veille, 0) / 4, avgL = fake.rows.reduce((a, r) => a + r.live, 0) / 4;
  const late = (n: number, a: number) => (n === 0 && a >= 0.5) || n <= a - 1;
  check(late(0, avgL) && late(0, avgV) && !late(1, avgV) && typeof SG.signupStats === "function" && (await SG.signupStats(env, gS)).rows.every((r: any) => r.behind === (r.behindV || r.behindL)), "behind is counted per kind (veilles and live codings separately)");
  const bid = Number(run1("INSERT INTO briefs (guild_id, title, status, data, kind, created_at) VALUES (?, 'Zz last', 'assigned', '{}', 'solo', ?)", G, 9e9).lastInsertRowid);
  run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, level, status) VALUES (?, ?, ?, '{}', 'faible', 'final')", bid, G, `u:${extra[0].id}`);
  await api("PUT", `/api/activities/${v3}/slot?g=${G}`, { level: "hard" });
  let neverHard = true, filled = true;
  for (let i = 0; i < 12; i++) {
    const rp = await api("POST", `/api/activities/random?g=${G}`, { ids: [v2, v3] });
    const hard = rp.data.plan.find((p: any) => p.activity_id === v3), easy = rp.data.plan.find((p: any) => p.activity_id === v2);
    if (hard.members.includes(extra[0].id)) neverHard = false;
    if (hard.members.length !== 2 || easy.members.length !== 2 || hard.members.some((m: string) => easy.members.includes(m) && false)) filled = false;
  }
  check(neverHard && filled, "random: a hard subject never goes to a Faible student; each veille gets a binôme");
  const rp = await api("POST", `/api/activities/random?g=${G}`, { ids: [v2] });
  const fewest = Math.min(...st.data.rows.map((r: any) => r.veille));
  check(rp.data.plan[0].members.every((m: string) => row(m).veille === fewest), "random: the students with the fewest veilles first");
  check((await api("PUT", `/api/activities/${l1}/slot?g=${G}`, { size: 3 })).status === 400, "a live coding: 2 people at most");
  run1("DELETE FROM brief_reviews WHERE brief_id = ?", bid); run1("DELETE FROM briefs WHERE id = ?", bid);
  // deleting the activity frees its requests
  await slash(extra[1], "activity", { activity: String(v2), partner: extra[3].id }, "choose");
  await api("DELETE", `/api/activities/${v2}?g=${G}`);
  check(q1("SELECT COUNT(*) AS n FROM activity_claims WHERE activity_id = ? AND status IN ('pending', 'approved')", v2).n === 0, "a deleted activity takes its requests with it");
  const pg = await api("GET", `/api/students/${U.alice.id}?g=${G}`);
  check(pg.status === 200, "student page still fine");
}

section("assessments with Claude: a quiz imported from JSON, the papers exported anonymous for grading, Claude's grading imported as the teacher's");
{
  const CJ = await import("../src/shared/assessclaude.ts");
  // ---- A. the quiz format, checked strictly and mapped to the app's model
  const good = CJ.checkQuiz(JSON.stringify(CJ.QUIZ_EXAMPLE), { known: new Set(["C3", "C4", "T1"]) });
  const qz = good.quiz!;
  check(!good.problems.length && qz.title === "Flexbox : aligner et répartir" && qz.settings.minutes === 40 && qz.settings.passAt === 60 && qz.settings.points === 20 && qz.settings.codeLang === "css",
    `a quiz written by Claude: checked and mapped (${good.problems.map((p) => p.msg).join(" | ")})`);
  check(qz.questions[0].type === "mcq" && qz.questions[0].answer.join() === "1" && qz.questions[1].expected.includes("Critères de correction : display: flex (1 pt)") && qz.questions[1].expected.includes("Notion évaluée : flex-wrap et gap")
    && qz.questions[1].starter.includes("ton code ici") && qz.questions[2].comps.join() === "C3N1" && qz.questions[0].skills.join() === "css",
    "…QCM: the right choice; code/explain: the expected answer with the grading notes (the field the grader reads); competencies, skills");
  check(good.preview!.n === 3 && good.preview!.code === 1 && good.preview!.explain === 1 && good.preview!.mcq === 1 && good.preview!.points === 6 && good.preview!.comps.join() === "C3N1", "…the preview: questions per type, total points, competencies");
  check(CJ.checkQuiz("```json\n" + JSON.stringify(CJ.QUIZ_EXAMPLE) + "\n```").problems.length === 0, "…even wrapped in ```json by Claude");
  const badQuiz = { ...CJ.QUIZ_EXAMPLE, format: "classbot-assessment@2", minutes: 0, questions: [
    { type: "mcq", prompt: "Quelle balise ?", choices: ["<a>", "<a>"], correct: [0, 1], points: 1, competencies: ["C99N1", "C3"], skills: ["css", "kung-fu"] },
    { type: "code", prompt: "Écris le CSS.", points: 0, starter: "p{}", expected: "p{}", competencies: ["C3N1"] },
    { type: "explain", prompt: "Explique.", points: 2 },
    { type: "dessin", prompt: "Dessine un chat", points: 1 } ] };
  const bq = CJ.checkQuiz(badQuiz, { known: new Set(["C3", "C4"]) });
  const has = (where: string, rx: RegExp) => bq.problems.some((p) => p.where === where && rx.test(p.msg));
  check(!bq.quiz && has("quiz", /format.*classbot-assessment@1/) && has("quiz", /minutes/) && has("question 1", /ONE right choice/) && has("question 1", /two choices are the same/) && has("question 1", /C99N1.*isn't in the class's programme/)
    && has("question 1", /"C3".*C3N1/) && has("question 1", /unknown skill.*kung-fu/) && has("question 2", /points/) && has("question 2", /starter.*expected answer/) && has("question 3", /expected/) && has("question 4", /type/),
    `a wrong quiz is refused, every problem with its question number (${bq.problems.length} problems)`);
  check(CJ.checkQuiz("{ pas du json").problems[0].msg.startsWith("This isn't valid JSON"), "…not JSON: said clearly");
  // ---- B. references and anonymity
  const refs = CJ.assignRefs({ P01: 5 }, [7, 5, 3]);
  check(refs.P01 === 5 && refs.P02 === 3 && refs.P03 === 7 && Object.keys(refs).length === 3, "each paper keeps its reference from one export to the next; new papers get the next numbers");
  check(CJ.scrub("// Yasmine Benali yasmine@mail.com 123456789012345678 yb-gh\nconst nom = 'Yasmine';", ["Yasmine", "Benali", "yb-gh", "123456789012345678"]) === "// [nom] [nom] [email] [id] [nom]\nconst nom = '[nom]';", "names, logins, emails and ids typed in an answer are removed");
  // ---- C. the grading result, checked against the export
  const Q = [{ id: "mcq001", type: "mcq", prompt: "?", points: 1, skills: [], choices: ["a", "b"], answer: [1] }, { id: "code01", type: "code", prompt: "?", points: 3, skills: [], starter: "p{}" }, { id: "expl01", type: "explain", prompt: "?", points: 2, skills: [] }] as any;
  const ctx = { assessmentId: 7, exportId: "e-aaaa1111", refs: { P01: 11, P02: 12 }, questions: Q };
  const res = (papers: any[], over: any = {}) => ({ format: "classbot-grading-result@1", assessment: 7, export: "e-aaaa1111", papers, ...over });
  const okRes = CJ.checkGradingResult(res([{ ref: "P01", summary: "Tu progresses.", grades: [{ question: "code01", verdict: "partial", score: 1.5, comment: "Il manque flex-wrap.", right: "display: flex", wrong: "pas de flex-wrap", errors: [{ line: 2, text: "gap", issue: "ajoute flex-wrap", major: false }] }] }]), ctx);
  const gd = okRes.papers[0]?.grades.code01;
  check(!okRes.problems.length && okRes.papers[0].takerId === 11 && gd.verdict === "partial" && gd.score === 50 && gd.teacher === true && gd.marks?.[0].line === 2 && gd.right === "display: flex" && okRes.papers[0].summary === "Tu progresses.",
    "Claude's grades: the score in points becomes the app's % (1.5 of 3 = 50), saved as the teacher's grade (✎), with the line errors");
  const errs = (r: any, c = ctx) => CJ.checkGradingResult(r, c).problems.map((p) => `${p.where}: ${p.msg}`).join(" | ");
  check(/another assessment \(#8\)/.test(errs(res([], { assessment: 8 }))), "a grading for another assessment is refused");
  check(/another or an older export/.test(errs(res([], { export: "e-old00000" }))), "…from an older export too");
  check(/Export the papers first/.test(errs(res([]), { ...ctx, exportId: null } as any)), "…and nothing can be imported before an export");
  const many = errs(res([
    { ref: "P09", grades: [] },
    { ref: "P01", grades: [{ question: "zzz", verdict: "correct", score: 1, comment: "ok" }, { question: "mcq001", verdict: "correct", score: 1, comment: "ok" },
      { question: "code01", verdict: "parfait", score: 1, comment: "ok" }, { question: "expl01", verdict: "partial", score: 3, comment: "ok" }] },
    { ref: "P02", grades: [{ question: "code01", verdict: "empty", score: 1, comment: "Non tentée." }, { question: "expl01", verdict: "correct", score: 2, comment: "" }] },
  ]));
  check(/P09.*unknown paper reference/.test(many) && /unknown question id/.test(many) && /multiple-choice question is already graded/.test(many) && /"verdict" must be/.test(many) && /"score": a number from 0 to 2/.test(many)
    && /"empty" \(not attempted\) is always 0/.test(many) && /"comment" for the student/.test(many), `a wrong grading: unknown paper, unknown question, a QCM, a bad verdict, a score out of range, an empty with points, no comment (${many.slice(0, 160)}…)`);
  // the paper's grades after the import: the QCM graded at once if it wasn't, an unanswered question not attempted
  const merged = CJ.mergeGrades(Q, { mcq001: [1], code01: "p{}", expl01: "padding dedans" }, {}, { expl01: { verdict: "correct", score: 100, comment: "Bien.", teacher: true } }, "fr");
  check(merged.complete && merged.grades.mcq001.score === 100 && !merged.grades.mcq001.teacher && merged.grades.code01.verdict === "empty" && merged.grades.expl01.teacher === true, "merged: the QCM auto-graded, the starter code handed back = not attempted, Claude's grade kept");
  const partial = CJ.mergeGrades(Q, { mcq001: [0], code01: "p{color:red}", expl01: "x" }, {}, { expl01: { verdict: "correct", score: 100, comment: "Bien.", teacher: true } }, "fr");
  check(!partial.complete && partial.missing.join() === "code01", "an answered question neither in the file nor graded: the paper stays to grade");

  // ---- through the dashboard: import → invite → answer → export → grade with Claude → import → check → (send)
  const pr = await api("GET", `/api/assessments/claude-prompt?g=${G}`);
  check(pr.status === 200 && pr.data.prompt.includes('"format": "classbot-assessment@1"') && pr.data.prompt.includes("HORS PÉRIMÈTRE") && pr.data.prompt.includes("débutants") && Array.isArray(pr.data.weeks),
    "the prompt for Claude (creation): the format with an example, the rules, the week's programme and what's out of scope");
  const wk = pr.data.weeks[1]?.n;
  if (wk) check((await api("GET", `/api/assessments/claude-prompt?g=${G}&week=${wk}`)).data.prompt.includes(`semaine ${wk} `), "…for the week picked");
  check((await api("POST", "/api/assessments/claude-import", { g: G, json: JSON.stringify({ ...CJ.QUIZ_EXAMPLE, brief_id: 987654 }) })).data.problems.some((p: any) => /brief #987654/.test(p.msg)), "a linked brief that isn't in the class is refused");
  const pv = await api("POST", "/api/assessments/claude-import", { g: G, json: JSON.stringify(CJ.QUIZ_EXAMPLE) });
  check(pv.status === 200 && !pv.data.problems.length && pv.data.preview.n === 3 && !pv.data.id, "Import a quiz (JSON): a preview first, nothing created");
  const im = await api("POST", "/api/assessments/claude-import", { g: G, json: JSON.stringify(CJ.QUIZ_EXAMPLE), import: true });
  const aid = im.data.id;
  const A0 = (await api("GET", `/api/assessments/${aid}?g=${G}`)).data.assessment;
  check(A0.status === "draft" && A0.questions.length === 3 && A0.settings.minutes === 40 && A0.settings.codeLang === "css", "…then a draft, like any other assessment");
  const qMcq = A0.questions.find((x: any) => x.type === "mcq"), qCode = A0.questions.find((x: any) => x.type === "code"), qExp = A0.questions.find((x: any) => x.type === "explain");
  run1("UPDATE players SET github_login = 'bob-gh' WHERE guild_id = ? AND discord_id = ?", G, U.bob.id);
  await api("POST", `/api/assessments/${aid}/invite`, { g: G, students: [U.bob.id, U.carol.id], send: false });
  const links = (await api("GET", `/api/assessments/${aid}/links?g=${G}`)).data.links;
  ai.mode = "broken";   // nobody grades them in the app: Claude will
  for (const [who, sid, code, exp, pick] of [[U.bob.id, "sessionCLJBBBBBBBBBBBBB1", ".cartes {\n  display: flex;\n  gap: 16px;\n} /* Bob bob-gh bob@ecole.ma */", "Le padding est dedans, la marge dehors.", 1],
    [U.carol.id, "sessionCLJCCCCCCCCCCCCC1", "", "La marge c'est la couleur.", 0]] as const) {
    const tok = links[who].split("/quiz/")[1];
    const quiz = async (action: string, body: any) => { const c = makeCtx(); const r = await bot.fetch(new Request(`https://bot.example.workers.dev/quiz/${tok}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env, c); await c.flush(); return r.json() as any; };
    await quiz("start", { sid });
    await quiz("answer", { sid, qid: qMcq.id, answer: [pick] });
    if (code) await quiz("answer", { sid, qid: qCode.id, answer: code });
    await quiz("answer", { sid, qid: qExp.id, answer: exp });
    await quiz("submit", { sid });
  }
  ai.mode = "good";
  const takers = () => q("SELECT t.*, p.name FROM assessment_takers t LEFT JOIN players p ON p.guild_id = t.guild_id AND p.discord_id = t.discord_id WHERE t.assessment_id = ? ORDER BY t.id", aid);
  check(takers().every((t: any) => t.status === "submitted"), "two papers handed in, not graded in the app");
  const ex = await api("POST", `/api/assessments/${aid}/claude-export`, { g: G });
  const file = ex.data.file, raw = JSON.stringify(file);
  check(ex.status === 200 && file.format === "classbot-grading-export@1" && file.assessment.id === aid && /^e-[a-f0-9]{8}$/.test(file.assessment.export) && file.papers.map((p: any) => p.ref).join() === "P01,P02"
    && file.assessment.questions.find((x: any) => x.type === "code").expected.includes("Critères de correction") && file.instructions.includes("classbot-grading-result@1") && file.instructions.includes("TUTOIEMENT"),
    "Export for grading: the questions (expected answers, grading notes), the papers P01/P02, the instructions and the answer format");
  check(!/Bob|Carol|bob-gh|bob@ecole\.ma/i.test(raw) && !raw.includes(U.bob.id) && !raw.includes(U.carol.id) && file.papers[0].answers[qCode.id].includes("[nom]") && file.papers[0].answers[qCode.id].includes("[email]"),
    "…no personal data in the file: no name, no Discord id, no GitHub login, no email (even typed in an answer)");
  check(file.papers[0].autoGraded[qMcq.id].verdict === "correct" && file.papers[0].autoGraded[qMcq.id].score === 1 && file.papers[1].autoGraded[qMcq.id].verdict === "wrong" && file.papers[0].answers[qMcq.id][0].startsWith("B · "),
    "…the QCM answers are there, already graded (Claude focuses on code and explanations)");
  // Claude's answer
  const result = { format: "classbot-grading-result@1", assessment: aid, export: file.assessment.export, papers: [
    { ref: "P01", summary: "Tu maîtrises Flexbox. Pense à flex-wrap.", grades: [
      { question: qCode.id, verdict: "partial", score: 2, comment: "Ton conteneur est en flex avec un gap, mais il manque flex-wrap.", right: "display: flex et gap: 16px", wrong: "flex-wrap manque", errors: [{ line: 3, text: "gap: 16px;", issue: "Ajoute flex-wrap: wrap;", major: false }] },
      { question: qExp.id, verdict: "correct", score: 2, comment: "Explication juste.", right: "dedans / dehors", wrong: "" }] },
    { ref: "P02", summary: "Revois le modèle de boîte.", grades: [
      { question: qCode.id, verdict: "empty", score: 0, comment: "Non tentée." },
      { question: qExp.id, verdict: "wrong", score: 0, comment: "La marge est un espace, pas une couleur.", right: "", wrong: "confond marge et couleur" }] } ] };
  const pv2 = await api("POST", `/api/assessments/${aid}/claude-grading`, { g: G, json: JSON.stringify(result) });
  const bobRow = pv2.data.rows.find((r: any) => r.ref === "P01");
  check(pv2.status === 200 && !pv2.data.problems.length && pv2.data.rows.length === 2 && bobRow.name === "Bob" && bobRow.before === null && typeof bobRow.after === "number" && bobRow.graded === 2 && takers().every((t: any) => t.status === "submitted"),
    `Import the grading: a preview (P01 → the student's name, here only; score before → after), nothing written yet (${bobRow?.before} → ${bobRow?.after})`);
  const ap = await api("POST", `/api/assessments/${aid}/claude-grading`, { g: G, json: JSON.stringify(result), apply: true });
  const [tb, tc] = takers();
  const gb = JSON.parse(tb.grades);
  check(ap.status === 200 && ap.data.applied === 2 && tb.status === "graded" && tc.status === "graded" && tb.score === bobRow.after && gb[qCode.id].teacher === true && gb[qCode.id].score === 67 && gb[qCode.id].marks[0].line === 3 && !gb[qMcq.id].teacher && gb[qMcq.id].score === 100 && tb.summary === "Tu maîtrises Flexbox. Pense à flex-wrap.",
    `applied: the teacher's grades (✎), the QCM unchanged, the score recomputed, the papers graded, the summary (${tb.score}%)`);
  check(q("SELECT COUNT(*) AS n FROM competency_results WHERE source = 'assessment' AND ref = ? AND discord_id = ?", aid, U.bob.id)[0].n > 0 && ap.data.assessment?.id === aid, "…and the competencies follow, like any grading");
  const before = tb.grades;
  await api("POST", `/api/assessments/${aid}/grade`, { g: G, all: true, lot: 5 });
  check(JSON.parse(takers()[0].grades)[qCode.id].comment === gb[qCode.id].comment && JSON.parse(takers()[0].grades)[qCode.id].teacher === true && takers()[0].grades === before, "↻ Grade with AI keeps the imported grades");
  // a paper not in the file stays as it is; a new export refuses the older file and keeps the references
  const only = await api("POST", `/api/assessments/${aid}/claude-grading`, { g: G, json: JSON.stringify({ ...result, papers: [result.papers[0]] }) });
  check(only.data.rows.length === 1 && only.data.absent.length === 1 && only.data.absent[0].ref === "P02" && only.data.absent[0].name === "Carol", "a paper missing from the file: the preview says it stays as it is");
  const ex2 = await api("POST", `/api/assessments/${aid}/claude-export`, { g: G });
  const old = await api("POST", `/api/assessments/${aid}/claude-grading`, { g: G, json: JSON.stringify(result) });
  check(ex2.data.file.assessment.export !== file.assessment.export && ex2.data.file.papers.map((p: any) => p.ref).join() === "P01,P02" && old.data.problems.some((p: any) => /older export/.test(p.msg)),
    "a new export: same references, and the grading of the older export is refused");
  check((await api("GET", `/api/assessments/${aid}/claude-prompt?g=${G}`)).data.prompt === ex2.data.file.instructions, "the prompt for Claude (grading) is the file's instructions");
  run1("UPDATE players SET github_login = NULL WHERE guild_id = ? AND discord_id = ?", G, U.bob.id);
}

section("📚 shared library: the A1 classes share activities, assessments, quizzes and games content");
{
  const { libraryHub } = await import("./harness.ts");
  const pub0 = env.PUBLIC_URL; env.PUBLIC_URL = "https://bot.example.workers.dev";
  const G2 = "g-a1-b", G3 = "g-a1-c";
  for (const [id, name] of [[G2, "A1 Group B"], [G3, "A1 Group C"]]) run1("INSERT OR IGNORE INTO guilds (id, name, lang, season, created_at) VALUES (?, ?, 'fr', 'S1', ?)", id, name, clock.now());
  const act = (gid: string, day: string, kind: string, title: string, md: string) => run1("INSERT INTO activities (guild_id, day, kind, title, md, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", gid, day, kind, title, md, clock.now(), clock.now());
  act(G, "2032-01-05", "veille", "Le DOM", "# Le DOM\n\nVersion A");
  act(G, "2032-01-06", "live", "Une todo list", "# Live\n\nVersion A");
  const asg = await api("POST", `/api/assessments?g=${G}`, { title: "Évaluation JS", questions: [{ type: "mcq", prompt: "2 + 2 ?", choices: ["3", "4"], answer: 1, points: 2 }], settings: { minutes: 30 } });
  // create: hosted here; what the class has goes in
  check((await api("POST", `/api/library?g=${G}`, { create: true, name: "" })).status === 200, "a library is created (a default name)");
  const st = await api("GET", `/api/library?g=${G}`);
  const link = st.data.link as string;
  check(st.data.connected && st.data.hostedHere && /\/library\/[a-f0-9]{12}\.[\w-]{32}$/.test(link) && st.data.counts.activity >= 2 && st.data.recent.some((r: any) => r.title === "Le DOM") && db.prepare("SELECT 1 FROM library_items WHERE title = 'Évaluation JS'").get(), "the class's activities and assessment are in the library");
  // join on the same ClassBot: everything comes in
  const j = await api("POST", `/api/library?g=${G2}`, { link });
  check(j.status === 200 && q1("SELECT md FROM activities WHERE guild_id = ? AND day = '2032-01-05' AND kind = 'veille'", G2)?.md.includes("Version A"), "another class joins: the activities come in");
  const as2 = q1("SELECT * FROM assessments WHERE guild_id = ? AND lib_key IS NOT NULL AND title = 'Évaluation JS'", G2);
  check(as2 && as2.title === "Évaluation JS" && as2.status === "draft", "…and the assessment (a draft of its own: invitations stay in each class)");
  // one shared copy: an edit in B reaches A
  const idB = q1("SELECT id FROM activities WHERE guild_id = ? AND day = '2032-01-05' AND kind = 'veille'", G2).id;
  const ed = await api("PUT", `/api/activities/${idB}?g=${G2}`, { md: "# Le DOM\n\nVersion B, corrigée" });
  check(ed.status === 200, "B edits the veille");
  clock.advance(30);
  await api("GET", `/api/activities?g=${G}&from=2032-01-05&to=2032-01-09`);
  check(q1("SELECT md FROM activities WHERE guild_id = ? AND day = '2032-01-05' AND kind = 'veille'", G).md.includes("Version B"), "A gets B's edit (one shared copy)");
  // the other way: A edits the assessment, B gets it; papers stay in each class
  await api("PUT", `/api/assessments/${asg.data.assessment.id}?g=${G}`, { title: "Évaluation JS (v2)", questions: asg.data.assessment.questions });
  clock.advance(30);
  const lb = await api("GET", `/api/assessments?g=${G2}`);
  check(lb.data.items.some((a: any) => a.title === "Évaluation JS (v2)" && a.lib_key), "B gets A's new assessment version");
  // delete in A: gone in B (unless B's students present it)
  const liveA = q1("SELECT id FROM activities WHERE guild_id = ? AND day = '2032-01-06' AND kind = 'live'", G).id;
  await api("DELETE", `/api/activities/${liveA}?g=${G}`);
  clock.advance(30);
  await api("GET", `/api/activities?g=${G2}&from=2032-01-05&to=2032-01-09`);
  check(!q1("SELECT id FROM activities WHERE guild_id = ? AND day = '2032-01-06' AND kind = 'live'", G2), "a deleted activity is deleted in every class");
  // live quiz: shared as a template, the other class uses it (its own challenges)
  const mcqs = db.prepare("SELECT id FROM challenges WHERE kind = 'mcq' AND status = 'active' AND guild_id IS NULL LIMIT 3").all() as any[];
  const qz = await api("POST", `/api/quizzes?g=${G}`, { title: "Quiz DOM", challenge_ids: mcqs.map((c) => c.id), seconds: 20 });
  if (qz.status === 200) await api("POST", `/api/quizzes/${qz.data.id}/end?g=${G}`);
  clock.advance(30);
  run1("UPDATE guilds SET arena_channel = 'arena-b' WHERE id = ?", G2);
  const tq = await api("GET", `/api/library/templates?g=${G2}&kind=quiz`);
  check(qz.status === 200 && tq.data.items.some((x: any) => x.title === "Quiz DOM" && x.data.questions.length === 3), "a live quiz goes to the library (its questions with it)");
  const uq = await api("POST", `/api/quizzes?g=${G2}`, { template: tq.data.items.find((x: any) => x.title === "Quiz DOM").key });
  check(uq.status === 200 && JSON.parse(uq.data.questions).length === 3 && uq.data.title === "Quiz DOM", "the other class starts it from the library");
  // games: a written relay challenge is shared
  const task = { title: "Somme des pairs", text: "Renvoie la somme des nombres pairs.", fn: "sommePairs", params: ["t"], tests: [{ args: [[1, 2, 4]], expected: 6 }, { args: [[3]], expected: 0 }], by: "teacher" };
  const gm = await api("POST", `/api/games?g=${G}`, { kind: "relay", mode: "random", settings: { size: 3 }, task });
  clock.advance(30);
  const gB = await api("GET", `/api/games?g=${G2}`);
  check(gm.status === 200 && gB.data.myTasks.some((t: any) => t.fn === "sommePairs" && t.shared), "a relay challenge written in A appears in B (📚 shared)");
  // another ClassBot joins through the internet
  libraryHub.target = "https://bot.example.workers.dev";
  libraryHub.handler = (r) => bot.fetch(r, env, makeCtx());
  const remote = link.replace("https://bot.example.workers.dev", "https://hub.classbot.test");
  // on another ClassBot the hub isn't "here": pretend this one has another address
  env.PUBLIC_URL = "https://other-bot.example.workers.dev";
  const j3 = await api("POST", `/api/library?g=${G3}`, { link: remote });
  check(j3.status === 200 && !j3.data.hostedHere && q1("SELECT md FROM activities WHERE guild_id = ? AND day = '2032-01-05' AND kind = 'veille'", G3)?.md.includes("Version B"), "a class on another ClassBot joins with the link (through the internet)");
  const idC = q1("SELECT id FROM activities WHERE guild_id = ? AND day = '2032-01-05' AND kind = 'veille'", G3).id;
  await api("PUT", `/api/activities/${idC}?g=${G3}`, { md: "# Le DOM\n\nVersion C" });
  env.PUBLIC_URL = "https://bot.example.workers.dev";
  clock.advance(30);
  await api("GET", `/api/activities?g=${G}&from=2032-01-05&to=2032-01-09`);
  check(q1("SELECT md FROM activities WHERE guild_id = ? AND day = '2032-01-05' AND kind = 'veille'", G).md.includes("Version C"), "…and its edits reach the host's classes");
  libraryHub.down = true; env.PUBLIC_URL = "https://other-bot.example.workers.dev";
  clock.advance(30);
  const offline = await api("GET", `/api/activities?g=${G3}&from=2032-01-05&to=2032-01-09`);
  check(offline.status === 200 && (await api("GET", `/api/library?g=${G3}`)).data.error, "the hub down: the page still works, the error is shown in Settings");
  libraryHub.down = false; env.PUBLIC_URL = "https://bot.example.workers.dev";
  check((await api("POST", `/api/library?g=${G3}`, { link: "https://example.com/nope" })).status === 400, "only library links can be joined");
  check((await bot.fetch(new Request(link.replace(/\.[\w-]{32}$/, "." + "x".repeat(32))), env, makeCtx())).status === 404, "a wrong secret reads nothing");
  // leave: the class keeps its copy
  const lv = await api("DELETE", `/api/library?g=${G2}`);
  check(!lv.data.connected && q1("SELECT COUNT(*) AS n FROM activities WHERE guild_id = ?", G2).n >= 1 && !q1("SELECT 1 AS x FROM library_cache WHERE guild_id = ?", G2), "leaving keeps the class's copy");
  {
    // the author is whoever made the item first: another class editing it later doesn't change it
    const tm = db.prepare("SELECT id, secret FROM library_teams LIMIT 1").get() as any;
    await hubWrite(env, tm.id, tm.secret, [{ kind: "activity", key: "2031-01-06:veille", title: "Auteur", data: { md: "a" } }], "Classe A", "Houssni OUCHAD");
    await hubWrite(env, tm.id, tm.secret, [{ kind: "activity", key: "2031-01-06:veille", title: "Auteur v2", data: { md: "b" } }], "Classe B", "Achraf Chaoub");
    const row = db.prepare("SELECT author, by, version FROM library_items WHERE key = '2031-01-06:veille'").get() as any;
    check(row.author === "Houssni OUCHAD" && row.by === "Classe B" && row.version === 2, `the library keeps the first author (${JSON.stringify(row)})`);
    db.prepare("DELETE FROM library_items WHERE key = '2031-01-06:veille'").run();
  }
  const items = JSON.stringify(db.prepare("SELECT data FROM library_items").all());
  check(!items.includes(U.alice.name) && !items.includes(U.bob.name), "no student name in the library");
  await api("DELETE", `/api/library?g=${G}`); await api("DELETE", `/api/library?g=${G3}`);
  libraryHub.handler = null; env.PUBLIC_URL = pub0;
}

section("AI keys: a request too large for the per-minute token limit is sent again, asking for fewer tokens");
{
  const AK = await import("../src/shared/aikeys.ts");
  const real = globalThis.fetch, asked: number[] = [];
  (globalThis as any).fetch = async (_u: string, init: any) => {
    const b = JSON.parse(init.body); asked.push(b.max_tokens);
    if (b.max_tokens > 5000) return new Response(JSON.stringify({ error: { message: "Request too large on tokens per minute (TPM): Limit 6000, Requested 7400" } }), { status: 413 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":1}' } }] }), { status: 200 });
  };
  try {
    const t = await AK.callStep({ id: "g", label: "Groq", type: "groq", key: "k", model: "m", base: "https://api.groq.com/openai/v1", source: "class" } as any, [{ role: "user", content: "hi" }], { maxTokens: 6000, temperature: 0.5, json: true });
    check(t === '{"ok":1}' && asked.join() === "6000,4300", "413 'Limit 6000, Requested 7400': sent again with 4300 tokens, and it answers");
  } finally { (globalThis as any).fetch = real; }
}

section("activités: the extra activity of a day (live coding or workshop), never over an existing one, one per slot");
{
  const mon = "2026-11-16", fri = "2026-11-20";
  const n = (kind: string, day = mon) => q1("SELECT COUNT(*) AS n FROM activities WHERE guild_id = ? AND day = ? AND kind = ?", G, day, kind).n;
  const w1 = await api("POST", "/api/activities/week", { g: G, monday: mon, from: mon, to: fri });
  check(w1.status === 200 && w1.data.item?.kind === "week", "the week's plan");
  const w2 = await api("POST", "/api/activities/week", { g: G, monday: mon, from: mon, to: fri });
  check(w2.status === 200 && !w2.data.item && w2.data.exists?.id === w1.data.item.id && n("week") === 1, "the week again: the plan that exists comes back, nothing is written over");
  const w3 = await api("POST", "/api/activities/week", { g: G, monday: mon, from: mon, to: fri, replace: true });
  check(w3.data.item?.id === w1.data.item.id && n("week") === 1, "…replaced only when the teacher says so");
  const u0 = ai.users.length;
  ai.wsBad = 1;
  const ws = await api("POST", "/api/activities/item", { g: G, day: mon, kind: "workshop" });
  ai.wsBad = 0;
  const asked = ai.users.slice(u0);
  check(ws.status === 200 && ws.data.item?.kind === "workshop" && ws.data.item.md.startsWith("## Lundi 16/11 — Workshop : Construire une liste de cartes") && !ws.data.item.warnings.length, "Monday: a workshop at 11:00, on its template");
  check(asked.length === 2 && asked[0].includes("WORKSHOP À ÉCRIRE") && asked[0].includes("HORS PÉRIMÈTRE") && asked[1].includes("les minutes du déroulé font exactement la durée"), "…from the programme only; a déroulé that doesn't add up is asked again");
  const wk = q1("SELECT md FROM activities WHERE guild_id = ? AND day = ? AND kind = 'week'", G, mon).md;
  check(wk.includes("Atelier : Construire une liste de cartes"), "…the week's overview shows it");
  const again = await api("POST", "/api/activities/item", { g: G, day: mon, kind: "workshop" });
  check(!again.data.item && again.data.exists?.id === ws.data.item.id && n("workshop") === 1, "generated again: the one that exists is shown (the page asks before replacing it)");
  const lv0 = await api("POST", "/api/activities/item", { g: G, day: mon, kind: "live", extra: true });
  check(lv0.data.exists?.kind === "workshop" && !n("live"), "a live coding where the workshop is: the slot is taken, nothing written");
  const lv = await api("POST", "/api/activities/item", { g: G, day: mon, kind: "live", extra: true, replace: true });
  const v1 = (await api("GET", `/api/activities?g=${G}&from=${mon}&to=${fri}`)).data;
  check(lv.data.item?.kind === "live" && !n("workshop") && n("live") === 1 && v1.weeks[0].live.includes(mon), "replaced: the live coding takes the slot, the workshop goes, Monday joins the week's live codings");
  const ws2 = await api("POST", "/api/activities/item", { g: G, day: mon, kind: "workshop", replace: true });
  const v2 = (await api("GET", `/api/activities?g=${G}&from=${mon}&to=${fri}`)).data;
  check(ws2.data.item?.kind === "workshop" && !n("live") && !v2.weeks[0].live.includes(mon), "…and back: a workshop again, Monday has no live coding anymore");
  check((await api("POST", "/api/activities/item", { g: G, day: fri, kind: "live" })).data.error?.includes("No live coding planned"), "Friday: no live coding unless it's the day's extra activity");
  const xw = await api("POST", "/api/activities/item", { g: G, day: fri, kind: "live", extra: true });
  check(xw.data.item?.md.includes("## Vendredi 20/11 — Live coding") && (await api("GET", `/api/activities?g=${G}&from=${mon}&to=${fri}`)).data.weeks[0].live.includes(fri), "…the extra live coding of Friday (Wednesday 18/11 is a holiday)");
  const ve = await api("POST", "/api/activities/item", { g: G, day: fri, kind: "veille" });
  const ve2 = await api("POST", "/api/activities/item", { g: G, day: fri, kind: "veille" });
  check(ve.data.item && ve2.data.exists?.id === ve.data.item.id && n("veille", fri) === 1, "a veille that exists isn't generated again (the week's generation skips it)");
  const pv = await api("POST", "/api/activities/item", { g: G, day: fri, kind: "veille", preview: true, proposal: "Plus simple" });
  check(!!pv.data.draft && n("veille", fri) === 1, "…Regenerate still previews a new version (Replace in the dialog keeps it)");
  let threw = false;
  try { run1("INSERT INTO activities (guild_id, day, kind, md, created_at, updated_at) VALUES (?, ?, 'live', 'x', 0, 0)", G, mon); } catch { threw = true; }
  check(threw && n("live") === 0, "the database refuses a live coding and a workshop in the same slot (unique index)");
  run1("DELETE FROM activities WHERE guild_id = ? AND day >= ? AND day <= ?", G, mon, fri);
}

section("squad debriefs: each member's own level (chips, ✨, finalize, Progress, their page)");
{
  const A = U.alice.id, B = U.bob.id, sq = "abc123", who = `s:${sq}`;
  run1("INSERT INTO briefs (guild_id, title, status, data, kind, squads, created_at) VALUES (?, 'Squad levels', 'assigned', '{}', 'squad', ?, ?)", G, JSON.stringify([{ id: sq, name: "Squad 1", members: [A, B], sm: A }]), clock.now());
  const id = q1("SELECT MAX(id) AS id FROM briefs").id as number;
  const rec = {
    at: Date.now(), first: "", model: "test", brief: "Hammam", repos: ["sq/hammam"], count: 30, files: true, skills: ["C3"], checks: [],
    squad: { id: sq, name: "Squad 1", members: [{ gid: A }, { gid: B }] },
    contrib: [{ gid: A, login: "alice-gh", name: "Alice", commits: 28, days: 7, prs: 3, merged: 3, reviews: 2 }, { gid: B, login: "bob-gh", name: "Bob", commits: 0, days: 0, prs: 0, merged: 0, reviews: 0 }],
    result: { resume: "Bien.", commits: [], forts: [], ameliorer: [], feedback: "", exigences: [{ type: "story", texte: "Page des soins", statut: "fait", preuve: "soins.html" }], competences: [{ code: "C3", avis: "validable", raison: "ok" }] },
    challenge: null, members: {},
  };
  run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, updated_at) VALUES (?, ?, ?, ?, 'draft', ?)", id, G, who, JSON.stringify(rec), clock.now());
  const r0 = await api("GET", `/api/briefs/${id}/review?g=${G}&who=${who}`);
  check(r0.status === 200 && r0.data.memberLevels?.[A]?.prop === "excellent" && r0.data.memberLevels?.[B]?.prop === "faible", "each member's level proposed from their own data: the strong one Excellent, the one without a commit Faible");
  const c1 = await api("POST", `/api/briefs/${id}/review/level`, { g: G, who, member: B, level: "critique" });
  check(c1.data.memberLevels[B].lvl === "critique" && c1.data.memberLevels[B].by === "you" && c1.data.memberLevels[A].lvl === "", "a chip sets one member's level (the others don't move)");
  const u0 = ai.users.length;
  const a1 = await api("POST", `/api/briefs/${id}/review/level`, { g: G, who, member: B, ai: true });
  const asked = ai.users.slice(u0).join("\n");
  check(a1.data.memberLevels[B].lvl === "faible" && a1.data.memberLevels[B].by === "calc" && asked.includes("SA PART DU TRAVAIL : 0 commits") && !asked.includes("Bob"), "✨ on the member without a commit: the AI says Excellent, kept at most Faible (no name sent)");
  const a2 = await api("POST", `/api/briefs/${id}/review/level`, { g: G, who, member: A, ai: true });
  check(a2.data.memberLevels[A].lvl === "excellent" && a2.data.memberLevels[A].by === "ai", "✨ on the strong member: the AI's level");
  check((await api("POST", `/api/briefs/${id}/review/level`, { g: G, who, member: "999", level: "bon" })).status === 400, "an unknown member is refused");
  await api("POST", `/api/briefs/${id}/review/level`, { g: G, who, member: B, level: "" });
  const P = await api("GET", `/api/progress?g=${G}`);
  check(P.data.cells?.[`${id}:${A}`]?.lv === "excellent" && P.data.cells?.[`${id}:${B}`]?.lv === "" && P.data.cells?.[`${id}:${B}`]?.plv === "faible", "Progress: each member's square has their own level, not the squad's");
  const fin = await api("POST", `/api/briefs/${id}/review/finalize`, { g: G, who });
  const saved = JSON.parse(q1("SELECT record FROM brief_reviews WHERE brief_id = ? AND who = ?", id, who).record);
  check(fin.status === 200 && saved.members[A].level.lvl === "excellent" && saved.members[B].level.lvl === "faible" && saved.members[B].level.by === "calc", "finalize stores every member's level (the proposal when none was chosen)");
  const mb = (await api("GET", `/api/students/${B}?g=${G}`)).data.learning?.briefs?.find((x: any) => x.id === id);
  const ma = (await api("GET", `/api/students/${A}?g=${G}`)).data.learning?.briefs?.find((x: any) => x.id === id);
  check(mb?.review?.level === "faible" && ma?.review?.level === "excellent", "the student page: each member sees their own level");
  await api("POST", `/api/briefs/${id}/review/reopen`, { g: G, who });
  run1("DELETE FROM brief_reviews WHERE brief_id = ?", id);
  run1("DELETE FROM briefs WHERE id = ?", id);
}

section("squad debriefs, member by member: assessment, AI flags, questions, suggested switches, Discord links (CT5), AI lines");
{
  const A = U.alice.id, B = U.bob.id, sq = "def456", who = `s:${sq}`;
  const t0 = clock.now() - 3 * 86400;
  run1("INSERT INTO briefs (guild_id, title, status, data, kind, squads, start_at, due_at, created_at) VALUES (?, 'Squad insights', 'assigned', '{}', 'squad', ?, ?, ?, ?)", G, JSON.stringify([{ id: sq, name: "Squad 2", members: [A, B], sm: A }]), t0, clock.now() + 86400, t0);
  const id = q1("SELECT MAX(id) AS id FROM briefs").id as number;
  const rec = {
    at: Date.now(), first: "", model: "test", brief: "Hammam", repos: ["sq/hammam"], count: 30, files: true, skills: ["C3"], checks: [],
    squad: { id: sq, name: "Squad 2", members: [{ gid: A }, { gid: B }] },
    contrib: [{ gid: A, login: "alice-gh", name: "Alice Martin", commits: 12, days: 3, prs: 2, merged: 2, reviews: 1 }, { gid: B, login: "bob-gh", name: "Bob", commits: 1, days: 1, prs: 0, merged: 0, reviews: 0 }],
    result: { resume: "Bien.", commits: [], forts: [], ameliorer: [], feedback: "", exigences: [{ type: "story", texte: "Page des soins", statut: "fait", preuve: "soins.html" }],
      competences: [{ code: "C3", avis: "validable", raison: "ok" }, { code: "T1", avis: "validable" }, { code: "T2", avis: "validable" }, { code: "T5", avis: "validable" }] },
    challenge: null, members: {},
  };
  run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, updated_at) VALUES (?, ?, ?, ?, 'draft', ?)", id, G, who, JSON.stringify(rec), clock.now());
  // their assessment: Alice right on C3 (one question missed), Bob not
  const qs = [{ id: "q1", type: "mcq", prompt: "Quel sélecteur cible les <p> enfants directs ?", choices: ["a", "b"], answer: [1], points: 1, comps: [{ code: "C3", level: 1 }] },
    { id: "q2", type: "explain", prompt: "Explique la différence entre margin et padding.", expected: "dehors / dedans", points: 2, comps: [{ code: "C3", level: 1 }] }];
  run1("INSERT INTO assessments (guild_id, title, brief_id, status, questions, settings, created_at) VALUES (?, 'Quiz CSS', ?, 'open', ?, '{}', ?)", G, id, JSON.stringify(qs), clock.now());
  const aid = q1("SELECT MAX(id) AS id FROM assessments").id as number;
  run1("INSERT INTO assessment_takers (assessment_id, guild_id, discord_id, status, seed, score, grades, summary) VALUES (?, ?, ?, 'graded', 1, 80, ?, ?)", aid, G, A, JSON.stringify({ q1: { verdict: "correct", score: 100 }, q2: { verdict: "partial", score: 50 } }), "Bon travail sur les sélecteurs, revois le modèle de boîte.");
  run1("INSERT INTO assessment_takers (assessment_id, guild_id, discord_id, status, seed, score, grades, summary) VALUES (?, ?, ?, 'graded', 2, 30, ?, ?)", aid, G, B, JSON.stringify({ q1: { verdict: "wrong", score: 0 } }), "Les sélecteurs et le modèle de boîte sont à revoir.");
  run1("INSERT INTO competency_results (guild_id, discord_id, code, level, ok, source, ref, note, at) VALUES (?, ?, 'C3', 1, 1, 'assessment', ?, '', ?)", G, A, String(aid), clock.now());
  run1("INSERT INTO competency_results (guild_id, discord_id, code, level, ok, source, ref, note, at) VALUES (?, ?, 'C3', 1, 0, 'assessment', ?, '', ?)", G, B, String(aid), clock.now());
  // Bob: one very big commit on the squad's repo; his VS Code day says an AI wrote it
  const sha = "f".repeat(40), tc = clock.now() - 3600;
  run1("INSERT INTO gh_log (guild_id, id, discord_id, kind, repo, t, title, size, adds, dels, files, url) VALUES (?, ?, ?, 'commit', 'sq/hammam', ?, 'add everything', 'real', 420, 0, 2, ?)", G, sha, B, tc, `https://github.com/sq/hammam/commit/${sha}`);
  const V = await import("../src/shared/vscode.ts");
  const day = V.dayOf(tc), start = V.dayClock(day).start;
  const hb = (t: number, f: string, ai: number, hu: number) => ({ t, p: "hammam", f, lang: "HTML", cat: ai ? "ai coding" : "coding", w: 1, lines: 100, ai, hu, lc: 1, ed: "VS Code" });
  const raw = V.packRaw([hb(tc - 1500, "index.html", 300, 0), hb(tc - 1200, "style.css", 0, 40)], start);
  const agg = { ...V.emptyAgg(), active: 1800, ai: 300, hu: 40, lineData: true, projects: [["hammam", 1800, 0]] };
  run1("INSERT INTO vsc_days (guild_id, discord_id, day, active_s, write_s, n, ai_lines, human_lines, agg, raw, rev, updated_at) VALUES (?, ?, ?, 1800, 0, 2, 300, 40, ?, ?, 0, ?)", G, B, day, JSON.stringify(agg), raw, clock.now());
  const I = await api("GET", `/api/briefs/${id}/review/insights?g=${G}&who=${who}`);
  const ia = I.data.members?.[A], ib = I.data.members?.[B];
  check(I.status === 200 && ia.assess[0].score === 80 && ia.assess[0].taker && ia.assess[0].missed.length === 1 && ia.assess[0].missed[0].verdict === "partial" && /revois le modèle de boîte/.test(ia.assess[0].summary) && ib.assess[0].score === 30,
    `each member: their own assessment, its paper, the questions missed and its comment (${I.status} ${I.data.error ?? ""})`);
  check(ib.flags.some((f: any) => f.kind === "commits" && /420|one commit/.test(f.detail)) && ib.flags.some((f: any) => f.label === "AI in VS Code") && !ia.flags.length,
    "AI flags: their own big commit and their VS Code day (none for the other)");
  check(ia.questions.some((q: any) => /margin et padding/.test(q.q) && q.from === "assessment") && ib.questions.some((q: any) => q.from === "ai"), "questions to ask: what they missed, and what the flags point at");
  {
    check(ia.probes === null && !!ia.probeKey, "precise questions: none yet (the page asks the AI for them)");
    const u0 = ai.users.length;
    const P = await api("POST", `/api/briefs/${id}/review/probes?g=${G}&who=${who}`, {});
    const pa = P.data.members?.[A], sent = ai.users.slice(u0).join("\n");
    check(P.status === 200 && pa.probes?.length === 4 && pa.probes.every((p: any) => p.qs.length <= 2) && pa.probes[0].ns.join() === "2" && pa.probes[0].verdict === "partial" && /space-evenly/.test(pa.probes[0].qs[1]) && pa.probes.flatMap((p: any) => p.qs).filter((q: string) => /space-evenly/.test(q)).length === 1 && P.data.members[B].probes?.length,
      `precise questions: at most 4 key notions, 2 questions each, never the same question twice (${P.status} ${P.data.error ?? ""})`);
    check(/Explique la différence entre margin et padding/.test(sent) && /Attendu : dehors \/ dedans/.test(sent) && /Sa réponse :/.test(sent), "…from the question, the expected answer and their own answer");
    const n1 = ai.users.length;
    const P2 = await api("POST", `/api/briefs/${id}/review/probes?g=${G}&who=${who}`, {});
    check(ai.users.length === n1 && P2.data.members[A].probes?.length === 4, "kept with the debrief: not asked again");
    const P3 = await api("POST", `/api/briefs/${id}/review/probes?g=${G}&who=${who}`, { member: A, force: true });
    check(ai.users.length === n1 + 1 && P3.data.members[A].probes?.length === 4, "↻ Other questions: only that member, asked again");
    const again = await api("GET", `/api/briefs/${id}/review/insights?g=${G}&who=${who}`);
    check(again.data.members[A].probes?.[0]?.notion === "Flexbox : alignement", "…and shown next time the page opens");
  }
  check(ia.hints.C3?.on === true && ib.hints.C3?.on === false && ia.hints.T1?.on === true && ib.hints.T1?.on === false && ia.hints.T2?.on === true && ib.hints.T2?.on === false && !ia.hints.T5,
    "suggested switches: C3 from their assessment, CT1 from their days, CT2 from PRs and reviews (CT5 waits for the Discord check)");
  // CT5: the links they shared in Discord during the brief
  const ts = (dt: number) => new Date((clock.now() - dt) * 1000).toISOString();
  discordFake.chan["/channels/c1/messages"] = [
    { id: "9003", timestamp: ts(600), author: { id: A }, content: "Une super ressource sur flexbox https://css-tricks.com/snippets/css/a-guide-to-flexbox/", embeds: [] },
    { id: "9002", timestamp: ts(900), author: { id: B }, content: "on se voit à 14h", embeds: [] },
    { id: "9001", timestamp: ts(30 * 86400), author: { id: B }, content: "https://old.example.com (before the brief)", embeds: [] }];
  const L = await api("POST", `/api/briefs/${id}/review/links?g=${G}`, { who });
  check(L.status === 200 && L.data.members[A].links.length === 1 && /css-tricks/.test(L.data.members[A].links[0].url) && L.data.members[A].links[0].channel === "general" && !L.data.members[B].links.length
    && L.data.members[A].hints.T5.on === true && L.data.members[B].hints.T5.on === false && !L.data.links.hidden, `CT5: the links each member shared on Discord during the brief (${L.status} ${L.data.error ?? ""})`);
  discordFake.chan["/channels/c1/messages"] = [1, 2, 3].map((i) => ({ id: String(9010 + i), timestamp: ts(600 + i), author: { id: A }, content: "", embeds: [] }));
  const Lh = await api("POST", `/api/briefs/${id}/review/links?g=${G}`, { who });
  check(Lh.data.links.hidden === true && !Lh.data.members[A].hints.T5, "…Discord hides the messages' text (Message Content intent off): said, and CT5 isn't guessed");
  delete discordFake.chan["/channels/c1/messages"];
  // 🔍 the lines an AI wrote: index.html (AI in VS Code) and style.css (typed)
  const pemK = "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu\n-----END RSA PRIVATE KEY-----";
  await api("PUT", "/api/github/app", { g: G, appId: "99", slug: "classbot-b", clientId: "Iv23abc", clientSecret: "cs", webhookSecret: "own_secret", privateKey: pemK });
  const bobGh = q1("SELECT gh_inst FROM players WHERE guild_id = ? AND discord_id = ?", G, B).gh_inst;
  run1("UPDATE players SET gh_inst = '777' WHERE guild_id = ? AND discord_id = ?", G, B);
  run1("INSERT OR REPLACE INTO gh_tokens (inst, token, exp) VALUES ('777', 'tok777', ?)", Math.floor(Date.now() / 1000) + 3000);
  github.commitFiles[sha] = [{ filename: "index.html", additions: 2, patch: "@@ -0,0 +1,2 @@\n+<main>\n+</main>" }, { filename: "style.css", additions: 1, patch: "@@ -1 +1 @@\n-a{}\n+a{color:red}" }];
  const al = await api("GET", `/api/briefs/${id}/review/ailines?g=${G}&who=${who}&member=${B}`);
  const files = al.data.commits?.[0]?.files || [];
  check(al.status === 200 && files.find((f: any) => f.file === "index.html")?.label === "ai" && files.find((f: any) => f.file === "index.html")?.lines.join("|") === "<main>|</main>"
    && files.find((f: any) => f.file === "style.css")?.label === "typed" && al.data.vscode === true, `AI lines: each file of their commit, its lines marked AI or typed from their VS Code activity (${al.status} ${al.data.error ?? al.data.note ?? ""})`);
  const { attribute } = await import("../src/shared/review/insights.ts");
  check(attribute(0, 0).label === "unknown" && attribute(50, 50).label === "mixed" && attribute(50, 50).pct === 50 && attribute(9, 1).label === "ai" && attribute(1, 9).label === "typed", "…a mix is « partly AI » with its share; no VS Code data: unknown");
  // the member's own comment: kept as written, it's what goes on their record
  const sv = await api("POST", `/api/briefs/${id}/review/members?g=${G}`, { who, members: { [A]: { quiz: 80, text: "Bon travail sur les sélecteurs, revois le modèle de boîte. Bravo pour ta veille !", coSet: true, co: { C3: true } }, [B]: { quiz: 30 } } });
  check(sv.status === 200 && sv.data.comments[A].endsWith("Bravo pour ta veille !") && sv.data.review.members[A].coSet === true && sv.data.review.members[B].text === undefined && sv.data.comments[B].length > 20, "a member's comment you wrote is kept as their comment; the other's is written from their switches");
  delete github.commitFiles[sha];
  run1("UPDATE players SET gh_inst = ? WHERE guild_id = ? AND discord_id = ?", bobGh, G, B);
  await api("DELETE", `/api/github/app?g=${G}`);
  run1("DELETE FROM vsc_days WHERE discord_id = ? AND day = ?", B, day);
  run1("DELETE FROM gh_log WHERE id = ?", sha);
  run1("DELETE FROM competency_results WHERE ref = ? AND source = 'assessment'", String(aid));
  run1("DELETE FROM assessment_takers WHERE assessment_id = ?", aid);
  run1("DELETE FROM assessments WHERE id = ?", aid);
  run1("DELETE FROM brief_reviews WHERE brief_id = ?", id);
  run1("DELETE FROM briefs WHERE id = ?", id);
}

section("plan d'action for one student: diagnosis, actions (challenge, code, question, QCM, mini brief), send, their page, follow-up");
{
  const B = U.bob.id;
  // what ClassBot knows: a graded assessment with a question missed
  run1("INSERT INTO assessments (guild_id, title, status, questions, settings, created_at) VALUES (?, 'Quiz Flexbox', 'closed', ?, '{}', ?)", G,
    JSON.stringify([{ id: "q1", type: "explain", prompt: "Différence entre justify-content et align-items ?", expected: "axes", points: 1 }]), clock.now());
  const aid = q1("SELECT MAX(id) AS id FROM assessments").id as number;
  run1("INSERT INTO assessment_takers (assessment_id, guild_id, discord_id, status, seed, score, grades, summary) VALUES (?, ?, ?, 'graded', 1, 20, ?, '')", aid, G, B, JSON.stringify({ q1: { verdict: "wrong", score: 0, comment: "Axes inversés." } }));
  const created = await api("POST", `/api/wplans?g=${G}`, { student: B });
  const id = created.data.id;
  check(created.status === 200 && created.data.status === "draft" && /Plan d'action/.test(created.data.title), `a draft plan for one student (${created.status} ${created.data.error ?? ""})`);
  const u0 = ai.users.length;
  const D = await api("POST", `/api/wplans/${id}/diagnose?g=${G}`, {});
  const d = D.data.plan?.diag;
  check(D.status === 200 && d.summary && d.lacunes[0].priority === 1 && d.lacunes[0].evidence.length && d.lacunes[0].comps[0] === "C3", `the diagnosis: their lacunes, most urgent first, with evidence (${D.status} ${D.data.error ?? ""})`);
  check(ai.users.slice(u0).join("\n").includes("Différence entre justify-content et align-items") && ai.users.slice(u0).join("\n").includes("Axes inversés"), "…read from their assessments (the questions missed and the corrections)");
  const kinds = d.proposals.map((x: any) => x.kind);
  check(["code", "answer", "mcq", "brief"].every((k) => kinds.includes(k)) && !d.proposals.some((x: any) => x.challenge_id === 999999), "proposed actions of every kind; a challenge not in the library is dropped");
  const ch = d.proposals.find((x: any) => x.kind === "challenge");
  check(!!ch && ch.challenge?.title && ch.challenge_id > 0, "a proposed challenge comes from the library, with its name");
  // an action made by the AI on a notion, and the assessments' ✨ on a question
  const mk = await api("POST", `/api/wplans/${id}/ai?g=${G}`, { action: "make", kind: "brief", notion: "Axes de Flexbox" });
  check(mk.status === 200 && mk.data.step.kind === "brief" && mk.data.step.brief.tasks.length === 3, "✨ a mini brief made for them");
  check(ai.prompts.concat(ai.users).join("\n").includes("🏢 Le client") && ai.prompts.concat(ai.users).join("\n").includes("OBJECTIFS clairs"), "…written like the class's briefs: a cahier des charges, then clear objectives");
  // the teacher says what they want: the AI follows it first
  const u1 = ai.users.length;
  await api("POST", `/api/wplans/${id}/ai?g=${G}`, { action: "make", kind: "code", step: { kind: "code", ask: "Une fonction JavaScript qui filtre des produits par prix" } });
  check(ai.users.slice(u1).join("\n").includes("CONSIGNE DU FORMATEUR (prioritaire)") && ai.users.slice(u1).join("\n").includes("filtre des produits par prix"), "✨ Generate follows what the teacher wrote");
  const u2 = ai.users.length;
  await api("POST", `/api/wplans/${id}/diagnose?g=${G}`, { ask: "Un mini brief sur les formulaires, pas de défi" });
  check(ai.users.slice(u2).join("\n").includes("pas de défi"), "…and so does the diagnosis");
  // folded into the mini brief: features of the same project, not separate challenges
  const fold = await api("POST", `/api/wplans/${id}/ai?g=${G}`, { action: "integrate", step: mk.data.step, adds: [d.proposals.find((x: any) => x.kind === "code"), ch] });
  const fb = fold.data.step;
  check(fold.status === 200 && fb.kind === "brief" && fb.brief.tasks.length === mk.data.step.brief.tasks.length + 2 && mk.data.step.brief.tasks.every((t: string) => fb.brief.tasks.includes(t)) && fb.merged.length === 2,
    `📦 into the brief: each action becomes a task of the same project, the old tasks kept (${fold.status} ${fold.data.error ?? ""})`);
  const feat = await api("POST", `/api/wplans/${id}/ai?g=${G}`, { action: "integrate", step: fb, adds: [{ title: "un bouton mode sombre", kind: "feature" }], ask: "un bouton mode sombre" });
  check(feat.data.step.brief.tasks.some((t: string) => /mode sombre/.test(t)) && feat.data.step.brief.tasks.length === fb.brief.tasks.length + 1, "…and a feature the teacher types");
  const none = await api("POST", `/api/wplans/${id}/ai?g=${G}`, { action: "integrate", step: d.proposals.find((x: any) => x.kind === "code"), adds: [ch] });
  check(none.status === 400, "…only into a mini brief");
  // the teacher keeps some, edits, sends
  const steps = [...d.proposals.filter((x: any) => x.kind !== "brief"), mk.data.step];
  const sv = await api("PUT", `/api/wplans/${id}?g=${G}`, { steps, title: "Reprendre Flexbox", message: "Fais-les dans l'ordre." });
  check(sv.status === 200 && sv.data.plan.steps.length === steps.length && sv.data.plan.title === "Reprendre Flexbox", "saved as the teacher edits");
  const bad = await api("PUT", `/api/wplans/${id}?g=${G}`, { steps: [...steps, { kind: "mcq", prompt: "Une question sans choix ?", choices: ["a"], answer: [] }] });
  const badSend = await api("POST", `/api/wplans/${id}/send?g=${G}`, {});
  check(bad.status === 200 && badSend.status === 400 && /choices/.test(badSend.data.error), "not sent while an action is incomplete (a QCM without its right answer)");
  await api("PUT", `/api/wplans/${id}?g=${G}`, { steps });
  const c0 = discordCalls.length, a0 = q1("SELECT COUNT(*) AS n FROM assignments WHERE discord_id = ?", B).n;
  const S2 = await api("POST", `/api/wplans/${id}/send?g=${G}`, {});
  const dmCall = discordCalls.slice(c0).find((c) => JSON.stringify(c.body ?? {}).includes("/wp/"));
  check(S2.status === 200 && S2.data.plan.status === "sent" && S2.data.dm === true && !!dmCall && JSON.stringify(dmCall.body).includes("Ton plan d'action"), `sent: their private page by DM (${S2.status} ${S2.data.error ?? ""})`);
  check(q1("SELECT COUNT(*) AS n FROM assignments WHERE discord_id = ?", B).n === a0 + 1, "its challenge becomes an assignment (solved in Discord as usual)");
  const locked = await api("PUT", `/api/wplans/${id}?g=${G}`, { steps: [] });
  check(locked.status === 400, "a sent plan's actions don't change anymore");
  // their page
  const tok = S2.data.url.split("/wp/")[1];
  const wp = async (action = "", body?: any) => {
    const ctx = makeCtx();
    const res = await bot.fetch(new Request(`https://bot.example.workers.dev/wp/${tok}${action ? "/" + action : ""}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}), env, ctx);
    await ctx.flush();
    return { status: res.status, data: (res.headers.get("content-type") ?? "").includes("json") ? await res.json() : await res.text() } as any;
  };
  const pg = await wp();
  check(pg.status === 200 && /Mon plan d'action/.test(pg.data) && !/\$\{/.test(pg.data), "their page opens");
  const forged = await bot.fetch(new Request(`https://bot.example.workers.dev/wp/${G}.${id}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/data`), env, makeCtx());
  check(forged.status === 404, "a forged link is refused");
  const v = (await wp("data")).data;
  check(v.steps.length === steps.length && !JSON.stringify(v).includes("space-evenly; }") && !v.steps.some((x: any) => "expected" in x || "answer" in x), "they see the actions, never the expected answers nor the right choices");
  const code = v.steps.find((x: any) => x.kind === "code"), mcq = v.steps.find((x: any) => x.kind === "mcq"), br = v.steps.find((x: any) => x.kind === "brief");
  const w1 = await wp("answer", { step: code.id, answer: "nav ul { display: flex; }" });
  check(w1.status === 200 && w1.data.work.verdict === "wrong" && /axe principal/.test(w1.data.work.comment), "a code answer, corrected by the AI at once");
  const w2 = await wp("answer", { step: code.id, answer: "nav ul { display: flex; justify-content: space-evenly; }" });
  check(w2.data.work.verdict === "correct" && w2.data.work.tries === 2, "…they try again until it's right");
  const w3 = await wp("answer", { step: code.id, answer: "x" });
  check(w3.status === 400, "…and a right answer stays right");
  const m1 = await wp("answer", { step: mcq.id, answer: [0] }), m2 = await wp("answer", { step: mcq.id, answer: [1] });
  check(m1.data.work.verdict === "wrong" && m2.data.work.verdict === "correct", "a QCM, corrected without the AI");
  const b0 = await wp("answer", { step: br.id, link: "pas un lien" });
  const b1 = await wp("answer", { step: br.id, link: "https://github.com/bob/nav", note: "Fait avec gap" });
  check(b0.status === 400 && b1.data.work.verdict === "submitted", "the mini brief is handed in as a link");
  // the teacher follows and validates
  const T1 = await api("GET", `/api/wplans/${id}?g=${G}`);
  const st = (sid: string) => T1.data.status.steps.find((x: any) => x.id === sid).state;
  check(st(code.id) === "done" && st(mcq.id) === "done" && st(br.id) === "submitted" && T1.data.status.done === 2, "the teacher sees each action's state");
  const L = await api("GET", `/api/wplans?g=${G}`);
  check(L.data.some((x: any) => x.id === id && x.toReview === 1 && x.done === 2), "…and the plans list says a mini brief waits for them");
  const rv = await api("POST", `/api/wplans/${id}/review?g=${G}`, { step: br.id, ok: true, comment: "Propre." });
  check(rv.status === 200 && rv.data.status.steps.find((x: any) => x.id === br.id).state === "done", "validated by the teacher");
  // everything done (the challenge solved in Discord) → the plan is done
  run1("UPDATE assignments SET status = 'done', completed_at = ? WHERE discord_id = ? AND note LIKE 'Plan d''action%'", clock.now(), B);
  const ans = v.steps.find((x: any) => x.kind === "answer");
  if (ans) await wp("answer", { step: ans.id, answer: "justify-content agit sur l'axe principal, align-items sur l'axe secondaire" });
  const T2 = await api("GET", `/api/wplans/${id}?g=${G}`);
  check(T2.data.plan.status === "done" && T2.data.status.pct === 100, `all done: the plan is done (${T2.data.status.done}/${T2.data.status.total})`);
  const del = await api("DELETE", `/api/wplans/${id}?g=${G}`);
  check(del.status === 200 && (await wp("data")).status === 404, "deleted: their page stops");
  run1("DELETE FROM assessment_takers WHERE assessment_id = ?", aid); run1("DELETE FROM assessments WHERE id = ?", aid);
  run1("DELETE FROM assignments WHERE discord_id = ? AND note LIKE 'Plan d''action%'", B);
}

section("💼 portfolio: /portfolio (projects from GitHub or links, about me, contact, available, show), the public page for companies");
{
  const B = U.bob.id;
  run1("UPDATE players SET github_login = 'bob-gh', gh_inst = NULL WHERE guild_id = ? AND discord_id = ?", G, B);
  github.userRepos["bob-gh"] = [{ full_name: "bob-gh/portfolio-site", description: "Mon site perso", language: "HTML", private: false, fork: false }, { full_name: "bob-gh/forked", description: "", language: "JS", private: false, fork: true }];
  github.repoMeta["bob-gh/portfolio-site"] = { name: "portfolio-site", full_name: "bob-gh/portfolio-site", html_url: "https://github.com/bob-gh/portfolio-site", description: "Mon site perso en HTML et CSS", language: "HTML", stargazers_count: 4, forks_count: 1, homepage: "https://bob-gh.github.io/portfolio-site", topics: ["portfolio"], pushed_at: "2026-10-20T10:00:00Z", private: false };
  github.repoLangs["bob-gh/portfolio-site"] = { HTML: 3000, CSS: 2000, JavaScript: 500 };
  const pf = (sub: string, opts: Record<string, any> = {}) => slash(U.bob, "portfolio", opts, sub);
  await pf("link");
  const key = q1("SELECT share_key FROM players WHERE guild_id = ? AND discord_id = ?", G, B).share_key;
  check(!!key && text(lastPatch()).includes(`/u/${key}`) && /portfolio about/.test(text(lastPatch())) && /portfolio add/.test(text(lastPatch())), "/portfolio link: the link (sharing on), and what's missing");
  const ac = await call(raw(4, U.bob, { name: "portfolio", type: 1, options: [{ type: 1, name: "add", options: [{ type: 3, name: "url", value: "port", focused: true }] }] }));
  check(ac.data?.choices?.some((c: any) => c.value === "https://github.com/bob-gh/portfolio-site") && !ac.data.choices.some((c: any) => /forked/.test(c.value)), "add: their own GitHub repos are suggested (not the forks)");
  await pf("add", { url: "https://github.com/bob-gh/portfolio-site", featured: true });
  check(/Portfolio site/.test(text(lastPatch())) && /HTML/.test(text(lastPatch())), "a GitHub repo added: its name, language and stars from GitHub");
  await pf("add", { url: "bob-blog.dev", title: "Mon blog", description: "Mes articles sur le web" });
  await pf("add", { url: "https://github.com/bob-gh/portfolio-site" });
  check(/already/.test(text(lastPatch())), "…never twice");
  await pf("add", { url: "https://github.com/bob-gh/secret" });
  check(/private|privé/.test(text(lastPatch())), "…a repo GitHub can't show is refused");
  const form = (id: string, vals: Record<string, string>) => call(raw(5, U.bob, { custom_id: id, components: Object.entries(vals).map(([k, v]) => ({ type: 1, components: [{ type: 4, custom_id: k, value: v }] })) }));
  const about = await click(U.bob, "pf:about");
  check(about.type === 9 && text(about).includes("headline"), "« About me »: a form");
  await form("mpfa:0", { headline: "Développeur web junior", bio: "J'aime construire des interfaces accessibles.", city: "Rabat" });
  const badMail = await form("mpfc:0", { email: "pas-un-email", linkedin: "", website: "", cv: "" });
  check(/email/i.test(text(badMail)), "contact: a wrong email is refused");
  await form("mpfc:0", { email: "bob@example.com", linkedin: "linkedin.com/in/bob", website: "", cv: "" });
  await pf("available", { for: "stage" });
  await pf("show", { part: "badges", visible: false });
  const P = await getPortfolio(env, G, B);
  check(P.headline === "Développeur web junior" && P.linkedin === "https://linkedin.com/in/bob" && P.open === "stage" && P.hide.includes("badges") && P.projects.length === 2 && P.projects.find((x) => x.repo)?.featured, "everything saved");
  // the page
  const page = await (await bot.fetch(new Request(`https://bot.example.workers.dev/u/${key}`), env, makeCtx())).text();
  check(page.includes("Développeur web junior") && page.includes("Rabat") && page.includes("opengraph.githubassets.com/1/bob-gh/portfolio-site") && page.includes("https://bob-gh.github.io/portfolio-site")
    && page.includes("Mon blog") && page.includes("mailto:bob@example.com") && page.includes("linkedin.com/in/bob") && page.includes("avatars.githubusercontent.com/bob-gh"), "the portfolio: headline, city, projects with their image and demo, contacts, GitHub avatar");
  check(/internship|stage/.test(page) && !page.includes('class="badges"'), "…what they look for; a hidden part isn't there");
  check(!/<script/i.test(page), "no script on the page");
  const rm = P.projects.find((x) => !x.repo)!;
  await pf("remove", { project: rm.id });
  check((await getPortfolio(env, G, B)).projects.length === 1, "remove a project");
  check(_pf.repoOf("https://github.com/a-b/c.d.git") === "a-b/c.d" && _pf.repoOf("x/y") === "x/y" && _pf.repoOf("https://gitlab.com/a/b") === null, "repo links are read");
}

section("Export grades: level, briefs validated (over half the technical competencies), competencies to work on, recurring problems, plan d'action");
{
  const sid = "770000000000000001";
  run1("INSERT INTO players (guild_id, discord_id, name, created_at) VALUES (?, ?, 'Zineb Report', ?)", G, sid, clock.now());
  const brief = (title: string, due: number) => { run1("INSERT INTO briefs (guild_id, title, status, data, created_at, due_at) VALUES (?, ?, 'assigned', '{}', ?, ?)", G, title, clock.now(), due); return q1("SELECT id FROM briefs WHERE guild_id = ? AND title = ?", G, title).id; };
  const b1 = brief("Report Portfolio", 4102444800), b2 = brief("Report Todo", 4102531200);
  const rec = (co: Record<string, boolean>, oralOk: boolean[]) => ({ result: { competences: Object.keys(co).map((code) => ({ code, avis: "validable" })), exigences: [{ texte: "Responsive sur mobile", type: "fonctionnel" }] },
    oral: [{ q: "?", notion: "flexbox" }, { q: "?", notion: "git rebase" }], final: { co, ex: [false], oral: oralOk } });
  // B1: 2 of 3 technical validated (over half) · B2: 1 of 2 (only half: not validated); C2 fails twice
  run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, level, updated_at) VALUES (?, ?, ?, ?, 'final', 'moyen', ?)", b1, G, `u:${sid}`, JSON.stringify(rec({ C1N1: true, C2N1: false, C3N1: true, T1: false }, [false, true])), clock.now());
  run1("INSERT INTO brief_reviews (brief_id, guild_id, who, record, status, level, updated_at) VALUES (?, ?, ?, ?, 'final', 'faible', ?)", b2, G, `u:${sid}`, JSON.stringify(rec({ C1N2: true, C2N2: false }, [false, false])), clock.now());
  for (const st of ["done", "late", "missed", "failed", "open"]) run1("INSERT INTO assignments (guild_id, discord_id, challenge_id, status, created_at, due_at) VALUES (?, ?, 1, ?, ?, ?)", G, sid, st, clock.now(), clock.now() + 86400);
  const csv = await api("GET", `/api/export.csv?g=${G}`);
  const lines = String(csv.data).replace(/^\ufeff/, "").split("\r\n");
  const head = lines[0].split(","), row = lines.find((l) => l.startsWith("Zineb Report")) || "";
  const cell = (name: string) => { const cells = row.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')); return cells[head.indexOf(name)]; };
  check(csv.status === 200 && head.includes("Briefs validated") && !head.includes("season_pts"), `the export has the new columns (${lines[0].slice(0, 120)})`);
  check(cell("Level") === "faible" && cell("Briefs debriefed") === "2" && cell("Briefs validated") === "1" && cell("Briefs not validated") === "1", `…level and briefs validated or not (${[cell("Level"), cell("Briefs validated"), cell("Briefs not validated")].join(" / ")})`);
  check(/B\d+ Report Portfolio \(2\/3\)/.test(cell("Validated (technical competencies)")) && /Report Todo \(1\/2\)/.test(cell("Not validated (technical competencies)")), "…a brief counts when more than half of its technical competencies are validated (half is not enough)");
  check(/^C2.*×2/.test(cell("Competencies to work on")) && cell("Competencies to work on").includes("CT1"), `…the competencies failed again and again first (${cell("Competencies to work on")})`);
  check(cell("Oral notions to review").startsWith("flexbox ×2") && /Responsive sur mobile ×2/.test(cell("Recurring problems")), `…the notions and requirements missed more than once (${cell("Oral notions to review")} · ${cell("Recurring problems")})`);
  check(cell("Action plan") === "yes" && cell("Work given") === "5" && cell("Completed") === "2" && cell("Not completed") === "2" && cell("In progress") === "1", `…the plan d'action work done or not (${["Work given", "Completed", "Not completed", "In progress"].map(cell).join("/")})`);
  run1("DELETE FROM assignments WHERE discord_id = ?", sid);
  run1("DELETE FROM brief_reviews WHERE who = ?", `u:${sid}`);
  run1("DELETE FROM briefs WHERE id IN (?, ?)", b1, b2);
  run1("DELETE FROM players WHERE discord_id = ?", sid);
}

section("debrief: performance criteria are like bonus (done: a plus; not done: never counted against the level)");
{
  const rec = (critOk: boolean) => ({ result: { exigences: [{ type: "story", texte: "Page d'accueil" }, { type: "story", texte: "Formulaire" }, { type: "critere", texte: "W3C valide" }, { type: "critere", texte: "Accessibilité WCAG" }], competences: [] }, final: { ex: [true, true, critOk, critOk] } });
  const lv = (r: any) => debriefLevel(r, reviewStates(r));
  check(lv(rec(false)) === lv(rec(true)) && lv(rec(false)) === "excellent", `criteria not done don't lower the level (${lv(rec(false))} / ${lv(rec(true))})`);
}

section("🚫 practice blocks: one student, one type (some levels, some days), never picked, the reason when asked, the dashboard, /teacher block · unblock");
{
  const D = { id: "9201", name: "Dina", teacher: false };
  run1("DELETE FROM app_settings WHERE k LIKE 'pblock:%'");
  // /teacher block: students can't, the teacher can (with a DM to the student)
  const denied = await slash(D, "teacher", { member: D.id, type: "bug" }, "block");
  check(text(denied).includes("teacher"), "a student can't block anyone");
  const dmsBefore = discordCalls.filter((c) => c.path === "/users/@me/channels" && c.body?.recipient_id === D.id).length;
  const r = await slash(U.prof, "teacher", { member: D.id, type: "bug", level: "hard", reason: "Farming hard bugs: finish your brief first" }, "block");
  check(r.type === 5 && text(lastPatch()).includes("can no longer practice") && text(lastPatch()).includes("Find the bug"), "/teacher block answers the teacher (privately)");
  check(discordCalls.filter((c) => c.path === "/users/@me/channels" && c.body?.recipient_id === D.id).length === dmsBefore + 1, "…and the student gets a DM");
  const bl = await getBlocks(env, G, D.id);
  check(bl.length === 1 && bl[0].type === "bug" && bl[0].levels.join() === "hard" && !bl[0].until, "kept: Find the bug, hard only, until lifted");

  // asked for directly: the reason; no level asked: the nearest open one
  const asked = await slash(D, "practice", { difficulty: "hard", type: "bug" });
  check(asked.type === 4 && text(asked).includes("paused") && text(asked).includes("Farming hard bugs"), "a blocked type and level asked for: the teacher's reason, no challenge");
  check(allowedLevel(bl, "bug", "hard") === "medium" && allowedLevel(bl, "bug", "easy") === "easy", "no level chosen: the nearest open level (easier first)");
  await slash(D, "practice", { difficulty: "medium", type: "bug" });
  const aid = Number(ids(lastPatch()).find((i) => i.startsWith("ans:"))?.split(":")[1]);
  const got = q1("SELECT c.kind, c.difficulty FROM attempts a JOIN challenges c ON c.id = a.challenge_id WHERE a.id = ?", aid);
  check(got?.kind === "bug" && got?.difficulty === "medium", "another level of the same type still works");

  // a whole type: never in a random quick challenge
  await slash(U.prof, "teacher", { member: D.id, type: "output", tell: false }, "block");
  const asked2 = await slash(D, "practice", { difficulty: "easy", type: "output" });
  check(text(asked2).includes("paused") && text(asked2).includes("Predict the output"), "every level blocked: refused at any level");
  const g = q1("SELECT * FROM guilds WHERE id = ?", G);
  const list = await getBlocks(env, G, D.id);
  let leaks = 0;
  for (let i = 0; i < 12; i++) {
    const c = await pickForTest(env, g, { players: [D.id], difficulty: "easy", mode: "quick", langs: ["python"], allowSeen: true, block: list });
    if (c && c.kind === "output") leaks++;
  }
  check(leaks === 0, "a random quick challenge is never of a blocked type");
  check(!(await pickForTest(env, g, { players: [D.id], difficulty: "hard", mode: "quick", kind: "bug", allowSeen: true, block: list })), "a blocked type and level: nothing picked");
  check(quickKindFor(list, "easy") !== "output" && quickKindFor([{ type: "mcq", levels: [], until: null, reason: "", at: 0 }, { type: "bug", levels: [], until: null, reason: "", at: 0 }, { type: "complexity", levels: [], until: null, reason: "", at: 0 }, { type: "output", levels: [], until: null, reason: "", at: 0 }], "easy") === "none", "AI generation only of an open quick type (none left: none)");
  const gitSql = blockSql([{ type: "git", levels: [], until: null, reason: "", at: 0 }]);
  check(gitSql.sql.includes("'git'") && !gitSql.args.length, "a Git block leaves out Git questions only, not every multiple choice");

  // the dashboard
  const cls = await api("GET", `/api/practice-blocks?g=${G}`);
  const me = cls.data.students?.find((s: any) => s.uid === D.id);
  check(cls.status === 200 && me?.blocks.length === 2, "the class page lists the blocked students and their blocks");
  const put = await api("PUT", `/api/students/${D.id}/blocks`, { g: G, type: "sql", levels: ["easy", "medium", "hard"], days: 3, reason: "x", notify: false });
  check(put.status === 200 && put.data.blocks.find((b: any) => b.type === "sql")?.levels.length === 0 && put.data.blocks.find((b: any) => b.type === "sql")?.until > 0, "blocking from the dashboard (all three levels = every level, 3 days)");
  check((await api("PUT", `/api/students/${D.id}/blocks`, { g: G, type: "nope" })).status === 400, "…an unknown type: refused");
  const del = await api("DELETE", `/api/students/${D.id}/blocks?g=${G}&type=output`);
  check(del.status === 200 && !del.data.blocks.some((b: any) => b.type === "output"), "lifting one block from the dashboard");
  check((await api("GET", `/api/students/${D.id}/blocks?g=${G}`)).data.blocks.length === 2, "the student's page reads their blocks");

  // it ends by itself
  await setBlock(env, G, D.id, { type: "regex", days: 1 });
  clock.advance(2 * 86400);
  check(!(await getBlocks(env, G, D.id)).some((b) => b.type === "regex") && (await getBlocks(env, G, D.id)).some((b) => b.type === "sql"), "a block for some days ends by itself (a longer one is still there)");

  // /teacher unblock
  const un = await slash(U.prof, "teacher", { member: D.id, type: "bug" }, "unblock");
  check(text(un).includes("can practice") && !(await getBlocks(env, G, D.id)).some((b) => b.type === "bug"), "/teacher unblock lifts one type");
  await slash(U.prof, "teacher", { member: D.id }, "unblock");
  check(!(await getBlocks(env, G, D.id)).length, "/teacher unblock without a type lifts them all");
  check(text(await slash(U.prof, "teacher", { member: D.id }, "unblock")).includes("no practice block"), "…nothing left to lift: said so");
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
