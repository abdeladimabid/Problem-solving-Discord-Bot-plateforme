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
class Stmt implements D1Stmt {
  db: DatabaseSync; sql: string; args: unknown[];
  constructor(db: DatabaseSync, sql: string, args: unknown[] = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...values: unknown[]) { return new Stmt(this.db, this.sql, values); }
  private params() { return this.args.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v)) as any[]; }
  async first<T>() { return (this.db.prepare(this.sql).get(...this.params()) as T) ?? null; }
  async all<T>() { return { results: this.db.prepare(this.sql).all(...this.params()) as T[], meta: {} }; }
  async run() {
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
        for (const s of stmts) out.push(await s.run());
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
    if (path === "/users/@me/channels") return Response.json({ id: `dm-${body.recipient_id}` });
    if (/^\/channels\/[^/]+\/messages$/.test(path)) return Response.json({ id: String(msgId++) });
    if (/^\/guilds\/[^/]+\/channels$/.test(path)) return Response.json([{ id: "c1", name: "general", type: 0, position: 0 }, { id: "c2", name: "contests", type: 0, position: 1 }, { id: "arena1", name: "⚔️-arena", type: 0, position: 2 }, { id: "v1", name: "voice", type: 2, position: 3 }]);
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
  if (url.hostname.endsWith("cloudflareaccess.com")) return Response.json(access.jwks ?? { keys: [] });
  throw new Error("unexpected fetch to " + url.href);
}) as typeof fetch;

// ------------------------------------------------------------------- AI
export const ai = {
  calls: 0,
  mode: "good" as "good" | "lying" | "broken" | "badwrite",
  judgeVerdict: "accepted",
  prompts: [] as string[],
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
      if (ai.mode === "broken") return { response: "sorry, I can't do JSON" };
      if (!input.messages[1]) return { response: '{"ok": true}' };            // health check
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
      if (sys.includes("kind but demanding")) {
        return { response: "Your loop never considers the case where every number is negative: start from the first element instead of 0." };
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
