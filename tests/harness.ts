// Test harness: runs the real Worker code locally with
//   - D1 replaced by Node's built-in SQLite (same SQL dialect)
//   - Discord, HackerRank and Cloudflare Access replaced by fakes
//   - Workers AI replaced by a scripted fake
//   - the godbolt code runner replaced by a fake that REALLY runs the code
//     locally (python3, g++, gcc, java), so the judge harness is tested for real
// Run with: npm test   (Node 22.6+)
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { D1, D1Stmt, Env } from "../src/shared/types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ------------------------------------------------------------------ clock
const realNow = Date.now.bind(Date);
let offsetMs = 0;
Date.now = () => realNow() + offsetMs;
export const clock = {
  advance(seconds: number) { offsetMs += seconds * 1000; },
  now() { return Math.floor(Date.now() / 1000); },
};

// ------------------------------------------------------------------- D1
/** Number of D1 round trips (a batch counts as one), like Cloudflare counts them. */
export const d1 = { queries: 0 };
class Stmt implements D1Stmt {
  db: DatabaseSync; sql: string; args: unknown[];
  constructor(db: DatabaseSync, sql: string, args: unknown[] = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...values: unknown[]) { return new Stmt(this.db, this.sql, values); }
  private params() { return this.args.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v)) as any[]; }
  async first<T>() { d1.queries++; return (this.db.prepare(this.sql).get(...this.params()) as T) ?? null; }
  async all<T>() { d1.queries++; return { results: this.db.prepare(this.sql).all(...this.params()) as T[], meta: {} }; }
  async run(inBatch = false) {
    if (!inBatch) d1.queries++;
    const r = this.db.prepare(this.sql).run(...this.params());
    return { results: [], meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
  }
}
export function makeD1(): D1 & { raw: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(join(ROOT, "migrations")).sort()) db.exec(readFileSync(join(ROOT, "migrations", f), "utf8"));
  return {
    raw: db,
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: D1Stmt[]) {
      db.exec("BEGIN");
      try {
        const out = [];
        d1.queries++;
        for (const s of stmts) out.push(await (s as any).run(true));
        db.exec("COMMIT");
        return out;
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

// ------------------------------------------------------------ fake world
export const discordCalls: { method: string; path: string; body: any }[] = [];
export const hr = {
  contests: {} as Record<string, { name: string; start: number | null; end: number | null }>,
  boards: {} as Record<string, { username: string; rank: number; score: number; time_taken: number }[]>,
  solves: {} as Record<string, { slug: string; at: number }[]>,
  profiles: {} as Record<string, string>,      // username (lowercase) -> bio
  down: false,
};
export const runner = { down: false, wandboxDown: false, calls: 0 };
/** Fake GitHub: "owner/repo/branch/path" -> file content (missing = 404). */
export const gtrans = { calls: 0, down: false };
export const leagueFake = { status: 200, body: null as any, calls: 0 };
export const github = { files: {} as Record<string, string>, calls: 0, repos: {} as Record<string, any[]>, commits: {} as Record<string, any[]>, trees: {} as Record<string, string[]>, sel: {} as Record<string, string>, branches: {} as Record<string, string[]>, sizes: {} as Record<string, { additions: number; deletions: number; parents?: number }>, foreign: new Set<string>() };

// ------------------------------------------------------- fake Wandbox
function wandboxLocal(body: any) {
  const dir = mkdtempSync(join(tmpdir(), "cbwandbox-"));
  try {
    for (const f of body.codes ?? []) writeFileSync(join(dir, f.file), f.code);
    const node = String(body.compiler).startsWith("nodejs");
    const main = node ? "prog.js" : "prog.php";
    writeFileSync(join(dir, main), body.code);
    const r = spawnSync(node ? process.execPath : "php", [main], { input: body.stdin ?? "", cwd: dir, timeout: 60000, maxBuffer: 64 * 1024 * 1024, encoding: "utf8" });
    return { status: String(r.status ?? ""), signal: r.signal ?? "", compiler_error: "", program_output: (r.stdout ?? "").slice(0, 128 * 1024), program_error: r.stderr ?? "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------- fake godbolt
function execLocal(id: string, source: string, stdin: string) {
  const dir = mkdtempSync(join(tmpdir(), "cbjudge-"));
  const t0 = performance.now();
  const run = (cmd: string, args: string[], input = "") => spawnSync(cmd, args, { input, cwd: dir, timeout: 20000, maxBuffer: 64 * 1024 * 1024, encoding: "utf8" });
  const lines = (x: string) => (x ?? "").split("\n").map((text) => ({ text }));
  try {
    let r;
    let build: any = undefined;
    if (id.startsWith("python")) {
      writeFileSync(join(dir, "main.py"), source);
      r = run("python3", ["main.py"], stdin);
    } else if (id.startsWith("java")) {
      writeFileSync(join(dir, "Main.java"), source);
      r = run("java", ["Main.java"], stdin);
    } else {
      const c = id.startsWith("cg");
      writeFileSync(join(dir, c ? "main.c" : "main.cpp"), source);
      const b = run(c ? "gcc" : "g++", c ? ["-O2", "main.c", "-o", "main", "-lm"] : ["-O2", "-std=c++20", "main.cpp", "-o", "main"]);
      build = { code: b.status ?? 1, stdout: lines(b.stdout), stderr: lines(b.stderr) };
      if (b.status !== 0) return { code: -1, stdout: [], stderr: [], buildResult: build, execTime: 0, timedOut: false };
      r = run("./main", [], stdin);
    }
    let out = r.stdout ?? "";
    const truncated = out.length > 32 * 1024;
    if (truncated) out = out.slice(0, 32 * 1024);
    return {
      code: r.status ?? -1, stdout: lines(out), stderr: lines(r.stderr ?? ""), buildResult: build ?? { code: 0, stdout: [], stderr: [] },
      execTime: Math.round(performance.now() - t0), timedOut: r.signal === "SIGTERM", truncated,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
export const access = { jwks: null as any };
/** Discord answers to fake: extra guild channels, and calls that fail (n times) with a Discord error code. */
/** Other AI providers (Gemini, Claude): keys containing "good" work; a host in `down` answers 429. */
export const aiFake = { calls: [] as string[], down: [] as string[] };
export const discordFake = { channels: [] as any[], fail: [] as { method: string; path: string; status: number; code: number; n: number }[], chan: {} as Record<string, any> };
export const discordRoles = { forbidden: false, list: [{ id: "g1", name: "@everyone", position: 0 }, { id: "r1", name: "Champion", color: 0, position: 2 }, { id: "r2", name: "On Fire", color: 0, position: 1 }] as any[] };
let msgId = 1000;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.body ? JSON.parse(init.body) : undefined;
  if (url.hostname === "discord.com") {
    const path = url.pathname.replace("/api/v10", "");
    discordCalls.push({ method, path, body });
    const f = discordFake.fail.find((x) => x.n > 0 && x.method === method && x.path === path);
    if (f) { f.n--; return new Response(JSON.stringify({ message: "fake error", code: f.code }), { status: f.status }); }
    if (method === "GET" && discordFake.chan[path]) return Response.json(discordFake.chan[path]);
    if (/^\/channels\/[^/]+\/threads$/.test(path) && method === "POST") return Response.json({ id: `th-${msgId++}` });
    if (path === "/users/@me/channels") return Response.json({ id: `dm-${body.recipient_id}` });
    if (/^\/channels\/[^/]+\/messages$/.test(path)) return Response.json({ id: String(msgId++) });
    if (/^\/guilds\/[^/]+\/channels$/.test(path)) return Response.json([{ id: "c1", name: "general", type: 0, position: 0 }, { id: "c2", name: "contests", type: 0, position: 1 }, { id: "arena1", name: "⚔️-arena", type: 0, position: 2 }, { id: "v1", name: "voice", type: 2, position: 3 }, ...discordFake.channels]);
    if (/^\/guilds\/[^/]+\/roles$/.test(path)) {
      if (discordRoles.forbidden) return new Response(JSON.stringify({ message: "Missing Permissions" }), { status: 403 });
      if (method === "POST") { const r = { id: `role-${discordRoles.list.length}`, position: 1, ...body }; discordRoles.list.push(r); return Response.json(r); }
      return Response.json(discordRoles.list);
    }
    if (/^\/guilds\/[^/]+$/.test(path)) return Response.json({ id: "g", name: "CS Class" });
    if (method === "PUT" || method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({});
  }
  if (url.hostname === "wandbox.org") {
    runner.calls++;
    if (runner.down || runner.wandboxDown) return new Response("busy", { status: 503 });
    if (url.pathname === "/api/list.json") return Response.json([{ name: "nodejs-20.17.0" }, { name: "php-8.3.12" }]);
    return Response.json(wandboxLocal(body));
  }
  if (url.hostname === "godbolt.org") {
    runner.calls++;
    if (runner.down) return new Response("busy", { status: 503 });
    const m = url.pathname.match(/^\/api\/compiler\/([^/]+)\/compile$/);
    if (!m) return new Response("nope", { status: 404 });
    return Response.json(execLocal(m[1], body.source, body.options?.executeParameters?.stdin ?? ""));
  }
  if (url.hostname === "www.hackerrank.com") {
    if (hr.down) return new Response("oops", { status: 503 });
    let m = url.pathname.match(/^\/rest\/contests\/master\/hackers\/([^/]+)\/profile$/);
    if (m) {
      const bio = hr.profiles[m[1].toLowerCase()];
      return bio === undefined ? new Response("nope", { status: 404 }) : Response.json({ model: { username: m[1], name: m[1], short_bio: bio } });
    }
    m = url.pathname.match(/^\/rest\/contests\/([^/]+)\/leaderboard$/);
    if (m) {
      const all = hr.boards[m[1]] ?? [];
      const off = Number(url.searchParams.get("offset") ?? 0), lim = Number(url.searchParams.get("limit") ?? 100);
      return Response.json({ models: all.slice(off, off + lim).map((e) => ({ hacker: e.username, rank: e.rank, score: e.score, time_taken: e.time_taken })), total: all.length });
    }
    m = url.pathname.match(/^\/rest\/contests\/master\/challenges\/([^/]+)$/);
    if (m) return Response.json({ model: { slug: m[1], name: "Imported " + m[1], difficulty_name: "Medium" } });
    m = url.pathname.match(/^\/rest\/contests\/([^/]+)$/);
    if (m) {
      const c = hr.contests[m[1]];
      return c ? Response.json({ model: { slug: m[1], name: c.name, epoch_starttime: c.start, epoch_endtime: c.end } }) : new Response("nope", { status: 404 });
    }
    m = url.pathname.match(/^\/rest\/hackers\/([^/]+)\/recent_challenges$/);
    if (m) return Response.json({ models: (hr.solves[m[1].toLowerCase()] ?? []).map((s) => ({ ch_slug: s.slug, name: s.slug, created_at: new Date(s.at * 1000).toISOString() })) });
    return new Response("unknown", { status: 404 });
  }
  if (url.hostname === "raw.githubusercontent.com") {
    github.calls++;
    const key = decodeURIComponent(url.pathname.slice(1));
    const f = github.files[key];
    return f === undefined ? new Response("404: Not Found", { status: 404 }) : new Response(f, { status: 200 });
  }
  if (url.hostname === "generativelanguage.googleapis.com" || url.hostname === "api.anthropic.com") {
    const h = new Headers(init.headers || {});
    const key = (h.get("authorization") || "").replace(/^Bearer /, "") || h.get("x-api-key") || "";
    aiFake.calls.push(`${url.hostname}:${body?.model}`);
    if (!/good/.test(key)) return new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 401 });
    if (aiFake.down.includes(url.hostname)) return new Response(JSON.stringify({ error: { message: "Resource exhausted" } }), { status: 429 });
    if (url.hostname === "api.anthropic.com") return Response.json({ content: [{ type: "text", text: "claude-answer" }] });
    return Response.json({ choices: [{ message: { content: "gemini-answer" } }] });
  }
  if (url.hostname === "openrouter.ai") {
    // the models list (public), and chat: only the models free today answer for free
    if (url.pathname === "/api/v1/models") return Response.json({ data: [
      { id: "paid/big-model", pricing: { prompt: "0.000001", completion: "0.000002" }, context_length: 100000 },
      { id: "some/small-model:free", pricing: { prompt: "0", completion: "0" }, context_length: 8000 },
      { id: "meta-llama/llama-3.3-70b-instruct:free", pricing: { prompt: "0", completion: "0" }, context_length: 65000 },
    ] });
    const auth = new Headers(init.headers || {}).get("authorization") || "";
    aiFake.calls.push(`openrouter:${body?.model}`);
    if (!auth.includes("sk-or-good")) return new Response(JSON.stringify({ error: { message: "No auth credentials found" } }), { status: 401 });
    if (!["meta-llama/llama-3.3-70b-instruct:free", "some/small-model:free"].includes(body?.model)) return new Response(JSON.stringify({ error: { message: "This model is unavailable for free. The paid version is available now" } }), { status: 404 });
    return Response.json({ choices: [{ message: { content: "ok" } }] });
  }
  if (url.hostname === "api.groq.com") {
    const auth = new Headers(init.headers || {}).get("authorization") || "";
    if (!auth.includes("gsk_good")) return new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), { status: 401 });
    return Response.json({ choices: [{ message: { content: "ok" } }] });
  }
  if (url.hostname === "translate.googleapis.com") {
    gtrans.calls++;
    if (gtrans.down) return new Response("busy", { status: 429 });
    const q = url.searchParams.get("q") ?? "", tl = url.searchParams.get("tl");
    return Response.json([[[`[${tl}] ${q}`, q, null, null, 1]], null, "fr"]);
  }
  if (url.hostname === "other.classbot.test") {
    leagueFake.calls++;
    return Response.json(leagueFake.status === 200 ? leagueFake.body : { error: "This class isn't in the league (or the link was renewed)." }, { status: leagueFake.status });
  }
  if (url.hostname === "api.github.com") {
    // an installation: which repos the student lets the App see (github.sel[id], else all)
    const im = url.pathname.match(/^\/app\/installations\/(\d+)$/);
    if (im) { github.calls++; if (github.foreign.has(im[1])) return Response.json({ message: "Not Found" }, { status: 404 }); return Response.json({ id: Number(im[1]), repository_selection: github.sel[im[1]] || "all" }); }
    // a repo's commits (newest first) and its files at a commit or HEAD
    if (/^\/app-manifests\/[\w-]+\/conversions$/.test(url.pathname) && (init.method || "GET").toUpperCase() === "POST") {
      github.calls++;
      return url.pathname.includes("/bad-") ? Response.json({ message: "Not Found" }, { status: 404 })
        : Response.json({ id: 424242, slug: "classbot-cs-class", client_id: "Iv23made", client_secret: "made_secret", webhook_secret: "made_whsec", pem: "-----BEGIN RSA PRIVATE KEY-----\nmade\n-----END RSA PRIVATE KEY-----" }, { status: 201 });
    }
    let gm = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/branches$/);
    if (gm && github.branches[gm[1]]) return Response.json(github.branches[gm[1]].map((name) => ({ name })));
    gm = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/commits$/);
    const onBranch = gm && url.searchParams.get("sha") ? github.commits[gm[1] + "@" + url.searchParams.get("sha")] : null;
    if (onBranch) return Response.json(onBranch.filter((c: any) => !url.searchParams.get("since") || c.commit.author.date >= url.searchParams.get("since")!));
    if (gm && github.commits[gm[1]]) return Response.json(github.commits[gm[1]]);
    gm = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/git\/trees\/([^/]+)$/);
    if (gm && github.trees[gm[1] + "@" + gm[2]]) return Response.json({ tree: github.trees[gm[1] + "@" + gm[2]].map((path) => ({ type: "blob", path })) });
  }
  if (url.hostname === "api.github.com" && url.pathname === "/installation/repositories") {
    const tok = String(new Headers(init.headers || {}).get("authorization") || "").replace(/^(token|Bearer)\s+/i, "");
    const all = github.repos[tok] ?? [];
    const page = Number(url.searchParams.get("page") || 1), per = Number(url.searchParams.get("per_page") || 30);
    return Response.json({ total_count: all.length, repositories: all.slice((page - 1) * per, page * per) });
  }
  if (url.hostname === "api.github.com" && /^\/repos\/[^/]+\/[^/]+\/commits$/.test(url.pathname)) {
    const repo = url.pathname.split("/").slice(2, 4).join("/");
    const author = url.searchParams.get("author");
    return Response.json((github.commits[repo] ?? []).filter((c) => !author || c.author?.login === author));
  }
  if (url.hostname === "api.github.com" && url.pathname === "/graphql") {
    const shas = [...String(body.query).matchAll(/c(\d+): object\(oid: "([0-9a-f]{40})"\)/g)];
    const repository: any = {};
    for (const [, i, sha] of shas) { const z = github.sizes[sha]; if (z) repository[`c${i}`] = { additions: z.additions, deletions: z.deletions, parents: { totalCount: z.parents ?? 1 } }; }
    return Response.json({ data: { repository } });
  }
  if (url.hostname.endsWith("cloudflareaccess.com")) return Response.json(access.jwks ?? { keys: [] });
  throw new Error("unexpected fetch to " + url.href);
}) as typeof fetch;

// ------------------------------------------------------------------- AI
export const ai = {
  calls: 0,
  mode: "good" as "good" | "lying" | "broken" | "badwrite",
  judgeVerdict: "accepted",
  prompts: [] as string[],
  users: [] as string[],
  chTech: false,
  levelAnswer: "",   // the level the AI gives in "Generate the level" (empty = "Bon")   // the mise en situation names techniques the brief doesn't ask (Flexbox, @media), until asked again
};

// a real (small) problem: maximum subarray sum. The reference is O(n), the brute O(n^2).
const WRITE_PROBLEM = {
  title: "Best streak",
  statement: "A trader writes down the daily profit of n days (it can be negative). Print the largest total of **consecutive** days (at least one day).\n\n**Input**\nn, then n integers.\n\n**Output**\nOne integer.\n\n**Constraints**\n1 ≤ n ≤ 2·10^5, |a_i| ≤ 10^9",
  hint: "Keep the best sum ending today.",
  topic: "kadane",
  reference: "import sys\nd=sys.stdin.read().split()\nn=int(d[0]);a=list(map(int,d[1:1+n]))\nbest=cur=a[0]\nfor x in a[1:]:\n    cur=max(x,cur+x)\n    best=max(best,cur)\nprint(best)",
  brute: "n=int(input());a=list(map(int,input().split()))\nprint(max(sum(a[i:j+1]) for i in range(n) for j in range(i,n)))",
  samples: ["5\n1 -2 3 4 -1\n", "3\n-5 -2 -7\n"],
  small: ["1\n7\n", "4\n-1 -1 -1 -1\n", "6\n2 -1 2 -1 2 -1\n", "2\n5 -10\n"],
  big_gens: ["n = 200000\nreturn str(n) + '\\n' + ' '.join(str(r(-10**9, 10**9)) for _ in range(n)) + '\\n'"],
};

function fakeAI() {
  return {
    async run(_model: string, input: any) {
      ai.calls++;
      const sys: string = input.messages[0].content;
      const user: string = input.messages[1]?.content ?? "";
      ai.prompts.push(sys);
      ai.users.push(user);
      if (ai.mode === "broken") return { response: "sorry, I can't do JSON" };
      if (!input.messages[1]) return { response: '{"ok": true}' };            // health check
      if (sys.includes("see what a student really built")) {
        const sha = (user.match(/^([0-9a-f]{7}) \|/m) || [])[1] || "abc1234";
        return { response: JSON.stringify({ overview: "Built the contact page step by step.", repos: [{ repo: "carol/site", features: [{ title: "Contact form with validation", commits: [sha], status: "done" }] }],
          brief: [{ brief: "Hammam", requirement: "Formulaire de contact", status: "done", evidence: sha }], habits: { good: ["Small steps"], improve: ["Write what changed instead of “update”"] } }) };
      }
      if (sys.includes("interpreter")) {
        const n = (user.match(/print\((\d+) \+ (\d+)\)/) ?? []).slice(1).map(Number);
        const out = n.length ? String(n[0] + n[1]) : "?";
        return { response: JSON.stringify({ trace: "...", output: ai.mode === "lying" ? out + "0" : out }) };
      }
      if (sys.includes("multiple-choice")) {
        const right = user.split("\n").find((l) => l.includes("Sets are hashed"))?.[0] ?? "A";
        const wrong = right === "A" ? "B" : "A";
        return { response: JSON.stringify({ answer: ai.mode === "lying" ? wrong : right, why: "..." }) };
      }
      if (sys.includes("design programming problems")) {
        const p = ai.mode === "badwrite" ? { ...WRITE_PROBLEM, brute: "print(0)" } : WRITE_PROBLEM;
        return { output: [{ type: "reasoning", content: [] }, { type: "message", content: [{ type: "output_text", text: "```json\n" + JSON.stringify(p) + "\n```" }] }] };
      }
      if (sys.includes("really wrote and understands")) {
        return { response: JSON.stringify({ questions: ["What is the role of the variable `r` in your code?", "What does your solve return for an empty string, and why?"] }) };
      }
      if (sys.includes("grade a student's short answers")) {
        const empty = user.includes("(empty)");
        return { response: JSON.stringify({ points: empty ? [0, 0] : [2, 1], feedback: empty ? "No answers." : "Good, but be more precise on the second one." }) };
      }
      if (sys.includes("strict programming judge")) {
        return { response: JSON.stringify({ verdict: ai.judgeVerdict, feedback: "Looks right on the samples." }) };
      }
      if (sys.includes("help students who are stuck")) {
        return { response: JSON.stringify({ approach: "Count consecutive equal letters with one pass; O(n).", pseudo: "result = empty\nfor each run of equal letters\n  add letter and run length\nreturn result" }) };
      }
      if (sys.includes("write model solutions")) {
        const js = user.includes("Python") && sys.includes("JavaScript");
        return { response: JSON.stringify({ code: js ? "function solve(s) {\n  // model\n  return s;\n}" : "def solve(s):\n    return s", note: "One pass, O(n)." }) };
      }
      if (sys.includes("weekly note to one student")) {
        return { response: "You solved more this week and your loops are cleaner. Watch the edge cases. Next week: three dictionary problems." };
      }
      if (sys.includes("You write SQL exercises")) {
        return { response: JSON.stringify({ title: "Students and their courses", question: "Return each student's name with the title of their course. Columns: name, title. Sort by name.", schema: "CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT);\nCREATE TABLE courses (id INTEGER PRIMARY KEY, title TEXT);\nCREATE TABLE enrollments (student_id INTEGER, course_id INTEGER);", sample: "INSERT INTO students VALUES (1,'Lina'),(2,'Omar');\nINSERT INTO courses VALUES (1,'SQL'),(2,'Web');\nINSERT INTO enrollments VALUES (1,1),(2,2);", hidden: ["INSERT INTO students VALUES (1,'Zed');\nINSERT INTO courses VALUES (1,'AI');\nINSERT INTO enrollments VALUES (1,1);", "INSERT INTO students VALUES (1,'Ana'),(2,'Bob');\nINSERT INTO courses VALUES (1,'Git');\nINSERT INTO enrollments VALUES (2,1);"], query: "SELECT s.name, c.title FROM students s JOIN enrollments e ON e.student_id = s.id JOIN courses c ON c.id = e.course_id ORDER BY s.name", ordered: true, hint: "Two JOINs." }) };
      }
      if (sys.includes("Translate this programming exercise")) {
        const src = JSON.parse(user);
        return { response: JSON.stringify({ title: "FR " + src.title, question: "FR " + (src.question ?? ""), choices: src.choices ? src.choices.map((c: string) => "FR " + c) : null, hint: null }) };
      }
      if (sys.includes("lessons for complete BEGINNERS")) {
        return { response: JSON.stringify({ en: "**Loops**\nA loop repeats instructions.\n```py\nfor i in range(3):\n    print(i)\n```\n💡 Check the last turn.", fr: "**Boucles**\nUne boucle répète des instructions." }) };
      }
      if (sys.includes("design small programming projects")) {
        return { response: JSON.stringify({ title: "Add two numbers", description: "Read two integers and print their sum.\n**Input** two integers. **Output** their sum.", reference: "a, b = map(int, input().split())\nprint(a + b)", inputs: ["1 2\n", "10 -4\n", "0 0\n", "oops\n"] }) };
      }
      if (sys.includes("teaching assistant")) {
        return { response: "A `for` loop repeats a block a known number of times; a `while` loop repeats while a condition is true. Use `for` when you know how many steps." };
      }
      if (sys.includes("technical interviewer")) {
        return { response: "Interesting. What happens with your approach when the list contains only negative numbers?" };
      }
      if (sys.includes("interview scorecard")) {
        return { response: JSON.stringify({ problem: 4, communication: 5, code: 5, complexity: 4, verdict: "Hire", strengths: "Clear thinking out loud.", improve: "State the complexity earlier." }) };
      }
      if (sys.includes("short private message to your student")) {
        return { response: "Ezra, in Arrays you crashed on an index in your last challenge: remember the last index is length - 1. Revisit the Arrays lesson in /path, then try /practice Picked for me." };
      }
      if (sys.includes("kind but demanding")) {
        return { response: "Your loop never considers the case where every number is negative: start from the first element instead of 0." + (sys.includes('"SKILLS:"') ? "\nSKILLS: loops, notaskill" : "") };
      }
      // ---- learning: briefs, evaluation grid, mise en situation, assessments
      if (sys.includes("fast classroom game")) {
        const qs = [
          { kind: "output", topic: "JavaScript", prompt: "Qu'affiche ce code ?", code: "console.log(1 + 1);", answer: "2", explain: "Addition" },
          { kind: "acronym", topic: "HTML", prompt: "Que signifie HTML ?", answer: "HyperText Markup Language" },
          { kind: "mcq", topic: "CSS", prompt: "Quelle propriété pour la couleur du texte ?", options: ["color", "font", "text", "background"], answer: "A · color" },
          { kind: "missing", topic: "JavaScript", prompt: "Quel mot-clé manque ?", code: "___ x = 3;", answer: "let" },
          { kind: "truefalse", topic: "CSS", prompt: "Vrai ou faux : padding est à l'extérieur de la bordure.", answer: "Faux" },
          { kind: "quick", topic: "HTML", prompt: "Quelle balise pour un paragraphe ?", answer: "<p>" },
          { kind: "quick", topic: "HTML", prompt: "Quelle balise pour un paragraphe ?", answer: "<p>" },
          { kind: "quick", topic: "", prompt: "", answer: "" },
        ];
        return { response: JSON.stringify({ questions: qs }) };
      }
      if (sys.includes("Tu proposes des idées de projets")) {
        return { response: JSON.stringify({ ideas: [1, 2, 3, 4, 5].map((i) => ({ title: `Idée ${i}`, client: `Client ${i} (Safi)`, pitch: "Un site vitrine pour présenter les services et prendre contact.", why: "Fait pratiquer le HTML sémantique.", difficulty: "moyen" })) }) };
      }
      if (user.includes("Garde la cohérence")) return { response: JSON.stringify({ summary: "Résumé réécrit par l’IA." }) };
      if (sys.includes("Tu rédiges des briefs")) {
        return { response: JSON.stringify({ title: "Riad Essaouira : site vitrine", summary: "Le site d’un riad.", tags: ["HTML", "CSS"], context: "Un riad veut un site.",
          groups: [{ emoji: "👤", title: "En tant que visiteur", stories: ["En tant que visiteur, je vais voir les chambres, afin de choisir.", "En tant que visiteur, je vais remplir le formulaire de contact, afin de réserver."] },
            ...(user.includes("ATTENTION") ? [] : [{ emoji: "🗄️", title: "En tant que concepteur de base de données", stories: ["En tant que concepteur de base de données, je vais rédiger le schéma de la base de données, afin de préparer le back-end."] }])],
          bonus: ["Animation CSS"], evaluation: { minutes: 20, parts: [{ minutes: 5, label: "Démonstration" }] }, deliverables: ["Dépôt GitHub"], criteria: ["Responsive", "W3C", "Sémantique"],
          situation: { title: "Intégrateur", need: "Un site en ligne" }, competencies: ["C3N1", "T1N1"], resources: [], internal: { learning: ["HTML"], questions: ["Combien de pages ?"] } }) };
      }
      if (sys.includes("Pour chaque exigence numérotée")) return { response: JSON.stringify({ contexte: "Un site vitrine.", technologies: ["HTML", "CSS"], verif: { "1": "pages", "2": "form" } }) };
      if (sys.includes("classer chaque apprenant à la fin d’un sprint")) return { response: JSON.stringify({ niveaux: [{ id: "A1", niveau: "excellent", raison: "Tout est validé." }, { id: "A2", niveau: "super", raison: "x" }] }) };
      if (sys.includes("commentaire de fin de sprint")) return { response: JSON.stringify({ commentaire: "Les objectifs technologiques de ce sprint se sont concentrés sur HTML et CSS.\n\nGlobalement, la majorité des apprenants ont atteint les objectifs fixés." }) };
      if (sys.includes("PARTIES À VALIDER")) return { response: JSON.stringify({ etapes: user.includes("trois temps") ? [{ nom: "Maquette", jour: 1, attendu: "La maquette" }, { nom: "Pages", jour: 3, attendu: "Les pages" }] : [] }) };
      if (sys.includes("Une ÉTAPE du brief")) return { response: JSON.stringify(user.includes("maquette.png") ? { statut: "a_temps", raison: "La maquette est dans le dépôt à la date." } : { statut: "en_retard", raison: "Visible seulement après la date." }) };
      if (sys.includes("Donne le niveau de l’apprenant")) return { response: JSON.stringify({ niveau: ai.levelAnswer || "Bon", pourquoi: "Le brief est presque complet, une notion à revoir." }) };
      if (sys.includes("questions orales de la soutenance")) return { response: JSON.stringify({ questions: [
        { q: "À quoi sert la balise <!DOCTYPE html> ?", a: "Elle indique au navigateur que la page est en HTML5.", notion: "doctype HTML5" },
        { q: "Comment écrire une variable avec Sass ?", a: "Avec un $ devant le nom.", notion: "variables Sass" },
        { q: "Quelle différence entre une classe et un id ?", a: "Une classe se réutilise, un id est unique.", notion: "classe et id" },
        { q: "Sans réponse ?", a: "", notion: "rien" },
        { q: "À quoi sert l’attribut alt ?", a: "Décrire l’image pour l’accessibilité.", notion: "attribut alt" },
        { q: "Comment relier les pages entre elles ?", a: "Avec des liens dans le menu.", notion: "liens du menu" },
        { q: "Pourquoi un seul h1 par page ?", a: "Pour le titre principal et le SEO.", notion: "titre h1" },
        { q: "Que fait git push ?", a: "Envoie les commits sur GitHub.", notion: "git push" },
      ] }) };
      if (sys.includes("Propose UNE mise en situation") && ai.chTech && !user.includes("ATTENTION")) return { response: JSON.stringify({ titre: "Modifier le formulaire", consigne: "Modifie la couleur du fond du formulaire en utilisant Flexbox, ajoute une règle @media pour la taille du texte.", observer: ["Flexbox appliqué", "règle @media ajoutée"] }) };
      if (sys.includes("Propose UNE mise en situation")) return { response: JSON.stringify({ titre: "Ajouter une carte", consigne: "Ajoute une carte de soin avec le même style que les autres.", observer: ["Reprend les classes", "Rendu mobile correct"] }) };
      if (sys.includes("action plan for weak students")) return { response: "Bob est en difficulté mais progresse : il fait le travail donné. Prochaine étape : revoir les formulaires avec lui." };
      if (sys.includes("Réécris ce commentaire pour tout un squad")) return { response: JSON.stringify({ texte: user.replace(/\btu\b/g, "vous") }) };
      if (sys.includes("Tu corriges l’évaluation") || sys.includes("You grade a web development")) {
        const ids = [...user.matchAll(/### Question (\w+)/g)].map((m) => m[1]);
        return { response: JSON.stringify({ notes: ids.map((id) => ({ id, verdict: user.includes("display: flex") ? "correct" : "partial", score: user.includes("display: flex") ? 100 : 50, juste: "Il utilise display: flex.", faux: user.includes("display: flex") ? "" : "Il manque la media query.", erreurs: [{ ligne: 1, extrait: "display: flex", probleme: "Il manque le point-virgule.", gravite: "mineure" }], commentaire: "Bien vu." })), bilan: "Bon travail, revois le padding." }) };
      }
      if (sys.includes("questions d’évaluation") || sys.includes("You write assessment questions")) {
        return { response: JSON.stringify({ questions: [
          { type: "mcq", prompt: "Quelle propriété aligne sur l’axe principal ?", choices: ["align-items", "justify-content", "gap", "order"], answer: [1], points: 1, skills: ["css"], comp: "C3N1" },
          { type: "code", prompt: "Écris une media query pour les écrans < 768px.", lang: "css", expected: "@media (max-width: 767px) {}", points: 2, skills: ["css"], comp: "C3N1" },
          { type: "explain", prompt: "Explique margin et padding.", expected: "dehors / dedans", points: 2, skills: ["css"] },
          ...(user.includes("sur HTML, CSS") ? [{ type: "mcq", prompt: "Quelle classe Tailwind centre le texte ?", choices: ["text-center", "center", "mx-auto", "align"], answer: [0], points: 1 },
            { type: "code", prompt: "Écris une carte en HTML avec un titre et un paragraphe.", lang: "html", starter: "<article class=\"card\"><h2>Titre</h2><p>Texte de la carte</p></article>", expected: "<article class=\"card\"><h2>Titre</h2><p>Texte de la carte</p></article>", points: 2 }] : [])] }) };
      }
      const kindMatch = sys.match(/kind "(\w+)"/);
      const kind = kindMatch?.[1] ?? "output";
      const a = 2 + (ai.calls % 7), b = 3;
      if (kind === "output") {
        // the model's guess is wrong on purpose: the runner's real output must win
        return { response: "Here you go:\n" + JSON.stringify({ kind, title: `Sum ${a}+${b}`, question: "What does this print?", code: `x = [${a}, ${b}]\nprint(sum(x) * 2)`, choices: null, answer: "999", hint: "Add them.", explanation: "Simple addition.", topic: "arithmetic" }) };
      }
      return { response: JSON.stringify({ kind, title: "Fast lookup AI", question: "Which is O(1) lookup?", code: kind === "mcq" ? null : "s = set(range(10))\nprint(5 in s)", choices: ["Lists are scanned", "Sets are hashed", "Tuples are scanned", "Strings are scanned"], answer: "B", hint: "Hashing.", explanation: "Sets use hashing.", topic: "data structures" }) };
    },
  };
}

// ------------------------------------------------------------------ env
export async function makeEnv(extra: Partial<Env> = {}) {
  const keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pub = Buffer.from(await crypto.subtle.exportKey("raw", keys.publicKey)).toString("hex");
  const env: Env = {
    DB: makeD1(),
    AI: fakeAI(),
    DISCORD_APP_ID: "app1",
    DISCORD_PUBLIC_KEY: pub,
    DISCORD_TOKEN: "token",
    PUBLIC_URL: "https://bot.example.workers.dev",
    DASHBOARD_URL: "https://dash.example.workers.dev",
    ...extra,
  };
  return { env, privateKey: keys.privateKey };
}

export function makeCtx() {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil(p: Promise<unknown>) { pending.push(p); },
    async flush() { while (pending.length) await pending.shift(); },
  };
}

export async function signedRequest(privateKey: CryptoKey, body: unknown, tamper = false) {
  const text = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = Buffer.from(await crypto.subtle.sign("Ed25519", privateKey, new TextEncoder().encode(ts + text))).toString("hex");
  return new Request("https://bot.example.workers.dev/interactions", {
    method: "POST",
    headers: { "x-signature-ed25519": tamper ? sig.replace(/^./, sig[0] === "a" ? "b" : "a") : sig, "x-signature-timestamp": ts, "content-type": "application/json" },
    body: text,
  });
}

export { realFetch };
