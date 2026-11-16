// Runs student code on hidden tests, on two free public code-execution services:
//
//  - Wandbox (wandbox.org): ONE request starts a small Node.js harness that
//    compiles the program once, builds the big inputs, then runs every test as
//    a real process with its own time limit. JavaScript, PHP, C, C++, Java
//    (and Python as a backup).
//  - Compiler Explorer (godbolt.org): Python runs inside a Python harness
//    (fresh globals per test); also the backup for C / C++ / Java.
//
// Big inputs are never stored: a tiny Python `gen()` rebuilds them on the spot.
import type { Env } from "./types.ts";

export type CodeLang = "python" | "javascript" | "php" | "cpp" | "c" | "java";

interface LangInfo { label: string; compilers: string[]; lang: string; flags: string; extra: number; fence: string; file: string; wandbox: string }
export const LANGS: Record<CodeLang, LangInfo> = {
  python: { label: "Python 3", compilers: ["python313", "python312", "python311"], lang: "python", flags: "", extra: 0, fence: "py", file: "sol.py", wandbox: "cpython-3.13.8" },
  javascript: { label: "JavaScript (Node.js)", compilers: [], lang: "javascript", flags: "", extra: 0, fence: "js", file: "sol.js", wandbox: "nodejs-20.17.0" },
  php: { label: "PHP 8", compilers: [], lang: "php", flags: "", extra: 0, fence: "php", file: "sol.php", wandbox: "php-8.3.12" },
  cpp: { label: "C++ (GCC)", compilers: ["g153", "g152", "g151", "g142"], lang: "c++", flags: "-O2 -std=c++20", extra: 0.5, fence: "cpp", file: "sol.cpp", wandbox: "gcc-13.2.0" },
  c: { label: "C (GCC)", compilers: ["cg153", "cg152", "cg151", "cg142"], lang: "c", flags: "-O2 -lm", extra: 0.5, fence: "c", file: "sol.c", wandbox: "gcc-13.2.0-c" },
  java: { label: "Java", compilers: ["java2502", "java2501", "java2500", "java2100"], lang: "java", flags: "", extra: 1.5, fence: "java", file: "Main.java", wandbox: "openjdk-jdk-22+36" },
};
/** Languages quick challenges ("predict the output", "find the bug"…) can be written in. */
/** What the submit form starts with: how to read the input in each language. */
export const STARTER: Record<CodeLang, string> = {
  // read word by word (not line by line): works whatever the spaces and line breaks, and when a line is missing
  // (n = 0, an empty list). Adapt it to the challenge's Input section.
  javascript: `// every value of the input, one by one (spaces and line breaks don't matter)
const data = require("fs").readFileSync(0, "utf8").split(/\\s+/).filter(Boolean);
let pos = 0;
const next = () => data[pos++];

const n = Number(next() ?? 0);
const a = [];
for (let i = 0; i < n; i++) a.push(Number(next()));

console.log(n);
`,
  php: `<?php
// every value of the input, one by one (spaces and line breaks don't matter)
$data = preg_split('/\\s+/', trim(stream_get_contents(STDIN)), -1, PREG_SPLIT_NO_EMPTY);
$pos = 0;

$n = (int)($data[$pos++] ?? 0);
$a = [];
for ($i = 0; $i < $n; $i++) $a[] = (int)$data[$pos++];

echo $n, "\\n";
`,
  python: `import sys
data = sys.stdin.read().split()
n = int(data[0])
a = list(map(int, data[1:1 + n]))

print(n)
`,
  java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(in.readLine().trim());
        System.out.println(n);
    }
}
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    cout << n << "\\n";
}
`,
  c: `#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    printf("%d\\n", n);
    return 0;
}
`,
};

export const QUICK_LANGS = ["python", "javascript", "php", "java", "c", "cpp"];
export const isCodeLang = (v: unknown): v is CodeLang => typeof v === "string" && v in LANGS;

export interface TestCase { idx: number; input: string | null; gen: string | null; expected: string; sample: number }

export interface Judgement {
  verdict: "accepted" | "wrong" | "tle" | "runtime" | "compile" | "unavailable";
  passed: number;
  total: number;
  maxTime: number;           // seconds, slowest passed test
  judge: "tests" | "ai";
  failed?: { idx: number; sample: boolean; input?: string; expected?: string; got?: string; error?: string; big?: boolean };
  error?: string;            // compile error / runner problem
  note?: string;
}

export class RunnerUnavailable extends Error {}

export const normOut = (s: string) => s.split(/\s+/).filter(Boolean).join(" ");

const enc = new TextEncoder();
function b64(s: string): string {
  const bytes = enc.encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ------------------------------------------------------------------ godbolt
interface Exec { code: number; stdout: string; stderr: string; buildFailed: boolean; buildErr: string; timedOut: boolean; ms: number; truncated: boolean }

const workingCompiler: Partial<Record<CodeLang, string>> = {};

async function godbolt(env: Env, lang: CodeLang, source: string, stdin: string, timeoutMs = 45000): Promise<Exec> {
  const info = LANGS[lang];
  const base = (env.RUNNER_URL || "https://godbolt.org").replace(/\/$/, "");
  const ids = workingCompiler[lang] ? [workingCompiler[lang]!, ...info.compilers.filter((c) => c !== workingCompiler[lang])] : info.compilers;
  let lastErr = "";
  for (const id of ids) {
    let res: Response;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      res = await fetch(`${base}/api/compiler/${id}/compile`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "ClassBot judge (Discord coding practice bot for a CS class)" },
        body: JSON.stringify({
          source,
          options: {
            userArguments: info.flags,
            executeParameters: { args: [], stdin },
            compilerOptions: { executorRequest: true },
            filters: { execute: true },
            tools: [], libraries: [],
          },
          lang: info.lang,
          allowStoreCodeDebug: false,
        }),
      });
    } catch (e) {
      throw new RunnerUnavailable(`code runner unreachable (${(e as Error).name === "AbortError" ? "timeout" : (e as Error).message})`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 404) { lastErr = `compiler ${id} not found`; continue; }
    if (!res.ok) throw new RunnerUnavailable(`code runner answered HTTP ${res.status}`);
    let j: any;
    try { j = await res.json(); } catch { throw new RunnerUnavailable("code runner sent an unexpected answer"); }
    workingCompiler[lang] = id;
    const text = (a: any) => (Array.isArray(a) ? a.map((x: any) => x?.text ?? "").join("\n") : "");
    const build = j.buildResult;
    const buildFailed = !!(build && typeof build.code === "number" && build.code !== 0);
    return {
      code: Number(j.code ?? 0), stdout: text(j.stdout), stderr: text(j.stderr),
      buildFailed, buildErr: buildFailed ? (text(build.stderr) || text(build.stdout) || text(j.stderr)) : "",
      timedOut: !!j.timedOut, ms: Number(j.execTime ?? 0), truncated: !!j.truncated,
    };
  }
  throw new RunnerUnavailable(lastErr || "no compiler available");
}

// ------------------------------------------------------------ python harness
const HARNESS = String.raw`import sys, io, os, time, json, base64, hashlib, signal, traceback, tempfile
_T = json.loads(base64.b64decode("__TESTS__").decode())
_SRC = base64.b64decode("__SRC__").decode()
_LIMIT = __LIMIT__
_MARK = "__MARK__"
_FULL = __FULL__
class _TLE(BaseException):
    pass
def _alarm(signum, frame):
    raise _TLE()
signal.signal(signal.SIGALRM, _alarm)
sys.setrecursionlimit(100000)
_res = []
_out0 = sys.stdout
try:
    _code = compile(_SRC, "solution.py", "exec")
except BaseException as e:
    print(_MARK + json.dumps({"ce": "".join(traceback.format_exception_only(type(e), e))[-900:]}))
    raise SystemExit(0)
for _t in _T:
    if "g" in _t:
        # a big test the AI's generator can't build is left out (the other tests still run)
        try:
            _ns = {}
            exec(_t["g"], _ns)
            _data = _ns["gen"]()
            if not isinstance(_data, str):
                _data = chr(10).join(map(str, _data)) if isinstance(_data, (list, tuple)) else str(_data)
        except BaseException as e:
            _res.append({"s": "ge", "t": 0, "h": "", "o": "", "n": 0, "e": "".join(traceback.format_exception_only(type(e), e)).strip()[-300:]})
            continue
    else:
        _data = _t["i"]
    try:
        _f = tempfile.TemporaryFile()
        _f.write(_data.encode())
        _f.seek(0)
        os.dup2(_f.fileno(), 0)
    except Exception:
        pass
    sys.stdin = io.TextIOWrapper(io.BytesIO(_data.encode()), encoding="utf-8")
    _buf = io.StringIO()
    sys.stdout = _buf
    _st, _err = "ok", ""
    _t0 = time.perf_counter()
    signal.setitimer(signal.ITIMER_REAL, _LIMIT)
    try:
        exec(_code, {"__name__": "__main__", "__builtins__": __builtins__})
    except _TLE:
        _st = "tle"
    except SystemExit as e:
        if e.code not in (None, 0):
            _st, _err = "re", "exit code " + str(e.code)
    except BaseException as e:
        _st = "re"
        _err = "".join(traceback.format_exception_only(type(e), e)).strip()
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
    _dt = time.perf_counter() - _t0
    sys.stdout = _out0
    _o = " ".join(_buf.getvalue().split())
    _r = {"s": _st, "t": round(_dt, 3), "h": hashlib.sha256(_o.encode()).hexdigest(), "o": _o[:_FULL], "n": len(_o), "e": _err[-600:]}
    _res.append(_r)
    if _st == "tle":
        break
print(_MARK + json.dumps(_res))
`;

interface HarnessRow { s: "ok" | "tle" | "re" | "ge"; t: number; h: string; o: string; n: number; e: string }   // ge: the test's generator failed

/** Run Python code on several tests in one request. `full` = chars of output to return per test. */
export async function runPythonTests(env: Env, src: string, tests: { input: string | null; gen: string | null }[], limit: number, full = 300)
  : Promise<{ compile?: string; rows: HarnessRow[] }> {
  try {
    return await runPythonGodbolt(env, src, tests, limit, full);
  } catch (e) {
    if (!(e instanceof RunnerUnavailable) || e.message.startsWith("the program")) throw e;
    return runHarness(env, "python", src, tests, limit, full);   // godbolt down: same tests on Wandbox
  }
}

async function runPythonGodbolt(env: Env, src: string, tests: { input: string | null; gen: string | null }[], limit: number, full: number)
  : Promise<{ compile?: string; rows: HarnessRow[] }> {
  const mark = "__CB" + crypto.randomUUID().replace(/-/g, "").slice(0, 12) + "__";
  const payload = tests.map((t) => (t.input != null ? { i: t.input } : { g: t.gen }));
  const source = HARNESS.replace("__TESTS__", b64(JSON.stringify(payload))).replace("__SRC__", b64(src))
    .replace("__LIMIT__", String(limit)).replace("__MARK__", mark).replace("__FULL__", String(full));
  const ex = await godbolt(env, "python", source, "");
  const line = ex.stdout.split("\n").reverse().find((l) => l.startsWith(mark));
  if (!line) {
    if (ex.timedOut) return { rows: [{ s: "tle", t: limit, h: "", o: "", n: 0, e: "" }] };
    throw new RunnerUnavailable(ex.truncated ? "the program printed too much" : `judge error: ${(ex.stderr || ex.stdout).slice(-300)}`);
  }
  const data = JSON.parse(line.slice(mark.length));
  if (data && !Array.isArray(data) && data.ce) return { compile: String(data.ce), rows: [] };
  return { rows: data as HarnessRow[] };
}

// ------------------------------------------------------------------ wandbox
// The Node.js harness that runs on Wandbox. Files next to it: cfg.json, tests.json, the student's program.
const WANDBOX_HARNESS = String.raw`const cp = require("child_process"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const C = JSON.parse(fs.readFileSync("cfg.json", "utf8"));
const T = JSON.parse(fs.readFileSync("tests.json", "utf8"));
const W = C.root || "/opt/wandbox";
const dirs = fs.existsSync(W) ? fs.readdirSync(W) : [];
const find = (...prefixes) => { for (const p of prefixes) { const d = dirs.filter((x) => x.startsWith(p)).sort().reverse()[0]; if (d) return path.join(W, d, "bin"); } return null; };
const done = (o) => { process.stdout.write(C.mark + JSON.stringify(o) + "\n"); process.exit(0); };
const sh = (cmd, args, opt = {}) => cp.spawnSync(cmd, args, { maxBuffer: 256 * 1024 * 1024, encoding: "utf8", ...opt });
const PYBIN = find("cpython-3.13", "cpython-3.12", "cpython-3.11");
const PY = PYBIN ? path.join(PYBIN, "python3") : "python3";
const fail = (r) => ((r.stderr || "") + (r.stdout || "")).split(process.cwd() + "/").join("").slice(-900) || "compile error";
let run;
const L = C.lang;
if (L === "javascript") {
  const node = process.execPath;
  const c = sh(node, ["--check", C.file]);
  if (c.status !== 0) done({ ce: fail(c) });
  run = [node, ["--stack-size=65500", C.file]];
} else if (L === "php") {
  const php = path.join(find("php-8.3", "php-8.2", "php-8") || "", "php");
  const c = sh(php, ["-l", C.file]);
  if (c.status !== 0) done({ ce: fail(c) });
  run = [php, ["-d", "display_errors=stderr", "-d", "memory_limit=512M", C.file]];
} else if (L === "python") {
  const c = sh(PY, ["-m", "py_compile", C.file]);
  if (c.status !== 0) done({ ce: fail(c) });
  run = [PY, [C.file]];
} else if (L === "cpp" || L === "c") {
  const g = find("gcc-13", "gcc-12");
  const c = sh(path.join(g || "", L === "cpp" ? "g++" : "gcc"), L === "cpp"
    ? ["-O2", "-std=c++20", "-static-libstdc++", "-static-libgcc", C.file, "-o", "sol"]
    : ["-O2", "-static-libgcc", C.file, "-o", "sol", "-lm"], { timeout: 25000 });
  if (c.status !== 0) done({ ce: fail(c) });
  run = ["./sol", []];
} else if (L === "java") {
  const j = find("openjdk-jdk-22", "openjdk-jdk-21", "openjdk");
  const c = sh(path.join(j || "", "javac"), ["-encoding", "UTF-8", C.file], { timeout: 25000 });
  if (c.status !== 0) done({ ce: fail(c) });
  const main = fs.readdirSync(".").filter((f) => f.endsWith(".class")).find((f) => {
    const b = fs.readFileSync(f).toString("latin1");
    return b.includes("main") && b.includes("([Ljava/lang/String;)V");
  });
  if (!main) done({ ce: "No class with a main(String[] args) method." });
  run = [path.join(j || "", "java"), ["-Xss64m", "-Xmx512m", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", main.replace(/\.class$/, "")]];
}
const rows = [];
const start = Date.now();
for (const t of T) {
  let data = t.i;
  if (data == null) {
    const g = sh(PY, ["-c", t.g + "\nimport sys\n_v = gen()\nif not isinstance(_v, str):\n    _v = chr(10).join(map(str, _v)) if isinstance(_v, (list, tuple)) else str(_v)\nsys.stdout.write(_v)"], { timeout: 20000 });
    // a big test the AI's generator can't build is left out (the other tests still run)
    if (g.status !== 0) { rows.push({ s: "ge", t: 0, h: "", o: "", n: 0, e: "test generator failed: " + (g.stderr || "").slice(-300) }); continue; }
    data = g.stdout;
  }
  const s0 = process.hrtime.bigint();
  const r = sh(run[0], run[1], { input: data, timeout: Math.ceil(C.limit * 1000) + 100, killSignal: "SIGKILL" });
  const dt = Number(process.hrtime.bigint() - s0) / 1e9;
  let s = "ok", e = "";
  if ((r.error && r.error.code === "ETIMEDOUT") || dt > C.limit) s = "tle";
  else if (r.status !== 0) { s = "re"; e = ((r.stderr || "").slice(-600) || ("exit code " + r.status + (r.signal ? " (" + r.signal + ")" : ""))); }
  const o = (r.stdout || "").split(/\s+/).filter(Boolean).join(" ");
  rows.push({ s, t: Math.round(dt * 1000) / 1000, h: crypto.createHash("sha256").update(o).digest("hex"), o: o.slice(0, C.full), n: o.length, e });
  if (s === "tle" || Date.now() - start > C.budget * 1000) break;
}
done(rows);
`;

let wandboxNode = "nodejs-20.17.0";
let wandboxPhp = LANGS.php.wandbox ?? "php-8.3.12";

// Wandbox is free and shared: when a whole class runs code at once it answers "429 Too many requests" (or 503).
// So the runs of one worker go out a few at a time, and a busy answer is tried again after a growing wait.
export const wandboxPace = { waits: [1200, 2500, 4500, 7000], max: 3, coolMs: 60_000 };
let wandboxBusy = 0, wandboxCoolUntil = 0;
/** (tests) Wandbox marked saturated for `ms`, or not anymore. */
export function _wandboxCool(ms = 0) { wandboxCoolUntil = ms ? Date.now() + ms : 0; }
/** Wandbox said "too many requests" a moment ago, or this worker already has its runs out: the second runner goes first. */
const wandboxSaturated = () => Date.now() < wandboxCoolUntil || wandboxBusy >= wandboxPace.max;
const wandboxQueue: (() => void)[] = [];
async function wandboxSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (wandboxBusy >= wandboxPace.max) await new Promise<void>((ok) => wandboxQueue.push(ok));
  wandboxBusy++;
  try { return await fn(); } finally { wandboxBusy--; wandboxQueue.shift()?.(); }
}
async function wandbox(env: Env, body: Record<string, unknown>, timeoutMs = 60000, waits = wandboxPace.waits): Promise<any> {
  const base = (env.WANDBOX_URL || "https://wandbox.org").replace(/\/$/, "");
  for (let attempt = 0; ; attempt++) {
    const r = await wandboxSlot(async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(`${base}/api/compile.json`, {
          method: "POST", signal: ctrl.signal,
          headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "ClassBot judge (Discord coding practice bot for a CS class)" },
          body: JSON.stringify({ save: false, stdin: "", ...body }),
        });
        return { res, text: await res.text() };
      } catch (e) {
        return { error: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message };
      } finally {
        clearTimeout(timer);
      }
    });
    // busy (too many runs at once), or the connection dropped: wait a little, then again
    if (r.res?.status === 429) wandboxCoolUntil = Date.now() + wandboxPace.coolMs;
    const busy = r.error ? r.error !== "timeout" : [429, 502, 503, 504].includes(r.res!.status);
    if (busy && attempt < waits.length) {
      const after = Number(r.res?.headers.get("retry-after"));
      const wait = after > 0 && after <= 8 ? after * 1000 : waits[attempt];
      await new Promise((ok) => setTimeout(ok, wait + Math.floor(Math.random() * wait * 0.4)));
      continue;
    }
    if (r.error) throw new RunnerUnavailable(`code runner unreachable (${r.error})`);
    if (!r.res!.ok) throw new RunnerUnavailable(`code runner answered HTTP ${r.res!.status}: ${r.text!.slice(0, 120)}`);
    try { return JSON.parse(r.text!); } catch { throw new RunnerUnavailable("code runner sent an unexpected answer"); }
  }
}

// ------------------------------------------------------------------ paiza.io: the second free runner
// Wandbox is shared by the whole world: a class of 25 running code at once gets "429 Too many requests". paiza.io
// (another free online runner) takes the runs then — JavaScript, PHP and Python — and Wandbox the next ones again.
// Only the code and its tests go there, never a student's name.
const PAIZA_LANG: Partial<Record<CodeLang, string>> = { javascript: "javascript", php: "php", python: "python3" };
export async function paizaRun(env: Env, lang: CodeLang, code: string, stdin = "", timeoutMs = 30000): Promise<{ ok: boolean; out: string; err: string; timedOut: boolean }> {
  const language = PAIZA_LANG[lang];
  if (!language) throw new RunnerUnavailable(`no backup runner for ${lang}`);
  const base = (env.PAIZA_URL || "https://api.paiza.io").replace(/\/$/, ""), key = env.PAIZA_KEY || "guest";
  const end = Date.now() + timeoutMs;
  const call = async (path: string, params: Record<string, string>, post = false): Promise<any> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.max(1000, end - Date.now()));
    try {
      const q = new URLSearchParams({ ...params, api_key: key });
      const res = await fetch(post ? `${base}${path}` : `${base}${path}?${q}`, post
        ? { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: q.toString() }
        : { signal: ctrl.signal, headers: { Accept: "application/json" } });
      const text = await res.text();
      if (!res.ok) throw new RunnerUnavailable(`backup runner answered HTTP ${res.status}: ${text.slice(0, 120)}`);
      const j = JSON.parse(text);
      if (j?.error) throw new RunnerUnavailable(`backup runner: ${String(j.error).slice(0, 120)}`);
      return j;
    } catch (e) {
      if (e instanceof RunnerUnavailable) throw e;
      throw new RunnerUnavailable(`backup runner unreachable (${(e as Error).name === "AbortError" ? "timeout" : (e as Error).message})`);
    } finally {
      clearTimeout(timer);
    }
  };
  const c = await call("/runners/create", { source_code: code, language, input: stdin, longpoll: "true", longpoll_timeout: "15" }, true);
  if (!c?.id) throw new RunnerUnavailable("backup runner: no run id");
  let status = c.status;
  while (status !== "completed") {
    if (Date.now() > end - 1000) throw new RunnerUnavailable("backup runner unreachable (timeout)");
    await new Promise((ok) => setTimeout(ok, 700));
    status = (await call("/runners/get_status", { id: String(c.id) })).status;
  }
  const d = await call("/runners/get_details", { id: String(c.id) });
  if (d.build_result && d.build_result !== "success") return { ok: false, out: "", err: String(d.build_stderr || d.build_stdout || "compile error").slice(-900), timedOut: d.build_result === "timeout" };
  const out = String(d.stdout ?? "");
  const timedOut = d.result === "timeout";
  return { ok: d.result === "success" && Number(d.exit_code ?? 0) === 0 && out.length < 100000, out: out.replace(/\s+$/, ""), err: String(d.stderr || (timedOut ? "timeout" : "")).slice(-400), timedOut };
}

/** Find the current name of a Wandbox compiler when ours was retired. */
async function wandboxCompiler(env: Env, prefix: string): Promise<string | null> {
  const base = (env.WANDBOX_URL || "https://wandbox.org").replace(/\/$/, "");
  try {
    const list: { name: string }[] = await (await fetch(`${base}/api/list.json`)).json();
    return list.map((c) => c.name).filter((n) => n.startsWith(prefix) && !n.includes("head")).sort().reverse()[0] ?? null;
  } catch { return null; }
}

/** Run a program on several tests in ONE request (any language): Wandbox, or paiza.io for JavaScript when Wandbox is saturated. */
export async function runHarness(env: Env, lang: CodeLang, src: string, tests: { input: string | null; gen: string | null }[], limit: number, full = 300, budget = 22)
  : Promise<{ compile?: string; rows: HarnessRow[] }> {
  if (lang !== "javascript") return runHarnessWandbox(env, lang, src, tests, limit, full, budget);
  const viaPaiza = () => runHarnessPaiza(env, src, tests, limit, full, budget);
  if (wandboxSaturated()) {
    try { return await viaPaiza(); } catch (e) { if (!(e instanceof RunnerUnavailable)) throw e; }
    return runHarnessWandbox(env, lang, src, tests, limit, full, budget);
  }
  try { return await runHarnessWandbox(env, lang, src, tests, limit, full, budget, [800]); }
  catch (e) { if (!(e instanceof RunnerUnavailable) || !wandboxSaturated()) throw e; }
  try { return await viaPaiza(); } catch (e) { if (!(e instanceof RunnerUnavailable)) throw e; }
  return runHarnessWandbox(env, lang, src, tests, limit, full, budget);
}

// the same harness in ONE file for paiza.io (it takes one program): it writes its files, then runs as on Wandbox.
// paiza.io is not where the tests were made for: a slow or missing result there (time out, a big test's generator) is
// never held against the student — Wandbox judges it instead.
async function runHarnessPaiza(env: Env, src: string, tests: { input: string | null; gen: string | null }[], limit: number, full: number, budget: number)
  : Promise<{ compile?: string; rows: HarnessRow[] }> {
  const mark = "__CB" + crypto.randomUUID().replace(/-/g, "").slice(0, 12) + "__";
  const files: Record<string, string> = {
    "cfg.json": JSON.stringify({ lang: "javascript", file: LANGS.javascript.file, limit, full, mark, budget, root: "/nonexistent" }),
    "tests.json": JSON.stringify(tests.map((t) => (t.input != null ? { i: t.input } : { g: t.gen }))),
    [LANGS.javascript.file]: src,
  };
  const prog = `{ const fs = require("fs"), os = require("os"), path = require("path");
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "cb"));
  const F = ${JSON.stringify(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, b64(v)])))};
  for (const k in F) fs.writeFileSync(path.join(d, k), Buffer.from(F[k], "base64").toString("utf8"));
  process.chdir(d);
  // can this runner start the student's program as a separate process? If not, it can't judge: Wandbox will
  const t = require("child_process").spawnSync(process.execPath, ["-e", "console.log(6 * 7)"], { encoding: "utf8", timeout: 10000 });
  if (String(t.stdout || "").trim() !== "42") { process.stdout.write(${JSON.stringify(mark)} + JSON.stringify({ je: "no child process" }) + "\\n"); process.exit(0); } }
${WANDBOX_HARNESS}`;
  const r = await paizaRun(env, "javascript", prog, "", 40000);
  const line = r.out.split("\n").reverse().find((l) => l.startsWith(mark));
  if (!line) throw new RunnerUnavailable(`backup judge error: ${(r.err || r.out).slice(-300)}`);
  const data = JSON.parse(line.slice(mark.length));
  if (data && !Array.isArray(data) && data.je) throw new RunnerUnavailable(`backup runner: ${data.je}`);
  if (data && !Array.isArray(data) && data.ce) return { compile: String(data.ce), rows: [] };
  if (!Array.isArray(data) || data.length < tests.length || data.some((x: HarnessRow) => x.s === "ge" || x.s === "tle")) throw new RunnerUnavailable("backup runner: not every test ran");
  return { rows: data as HarnessRow[] };
}

async function runHarnessWandbox(env: Env, lang: CodeLang, src: string, tests: { input: string | null; gen: string | null }[], limit: number, full = 300, budget = 22, waits = wandboxPace.waits)
  : Promise<{ compile?: string; rows: HarnessRow[] }> {
  const info = LANGS[lang];
  const mark = "__CB" + crypto.randomUUID().replace(/-/g, "").slice(0, 12) + "__";
  const code = lang === "java" ? src.replace(/\bpublic\s+((?:final\s+)?class)\b/g, "$1") : src;
  const body = () => ({
    compiler: wandboxNode, code: WANDBOX_HARNESS,
    codes: [
      { file: "cfg.json", code: JSON.stringify({ lang, file: info.file, limit, full, mark, budget }) },
      { file: "tests.json", code: JSON.stringify(tests.map((t) => (t.input != null ? { i: t.input } : { g: t.gen }))) },
      { file: info.file, code },
    ],
  });
  // Wandbox retires its Node.js versions: on an error, the current name is looked up and the run tried again;
  // a timeout or a server error (it's busy) is tried once more after a short pause
  const call = async () => {
    try {
      const r = await wandbox(env, body(), 60000, waits);
      if (!(/compiler.*not found|unknown compiler/i.test(JSON.stringify(r).slice(0, 300)) && !r.program_output)) return r;
    } catch (e) {
      if (!(e instanceof RunnerUnavailable) || !/HTTP (?!429|50[234])[45]\d\d/.test(e.message)) throw e;
    }
    const n = await wandboxCompiler(env, "nodejs-");
    if (n && n !== wandboxNode) { wandboxNode = n; return wandbox(env, body(), 60000, waits); }
    return wandbox(env, body(), 60000, waits);
  };
  const j: any = await call();
  const out = String(j.program_output ?? "");
  const line = out.split("\n").reverse().find((l) => l.startsWith(mark));
  if (!line) throw new RunnerUnavailable(`judge error: ${String(j.program_error || j.compiler_error || j.signal || out).slice(-300)}`);
  const data = JSON.parse(line.slice(mark.length));
  if (data && !Array.isArray(data) && data.ce) return { compile: String(data.ce), rows: [] };
  if (data && !Array.isArray(data) && data.je) throw new RunnerUnavailable(String(data.je));
  return { rows: data as HarnessRow[] };
}

// ------------------------------------------------------------------- judge
export async function judge(env: Env, code: string, lang: CodeLang, tests: TestCase[], limit: number): Promise<Judgement> {
  const ordered = [...tests].sort((a, b) => b.sample - a.sample || a.idx - b.idx);
  const lim = limit + LANGS[lang].extra;
  if (lang === "python") return evaluate(ordered, await runPythonTests(env, code, ordered, limit));
  try {
    return evaluate(ordered, await runHarness(env, lang, code, ordered, lim));
  } catch (e) {
    if (!(e instanceof RunnerUnavailable) || !LANGS[lang].compilers.length) throw e;
    return judgeCompiled(env, code, lang, ordered.filter((t) => t.input != null), lim);   // Wandbox down: godbolt, stored tests only
  }
}

function evaluate(tests: TestCase[], res: { compile?: string; rows: HarnessRow[] }): Promise<Judgement> {
  return judgeRows(tests, res);
}

async function judgeRows(tests: TestCase[], { compile, rows }: { compile?: string; rows: HarnessRow[] }): Promise<Judgement> {
  const base: Judgement = { verdict: "accepted", passed: 0, total: tests.length, maxTime: 0, judge: "tests" };
  if (compile) return { ...base, verdict: "compile", error: compile };
  const fail = (verdict: Judgement["verdict"], i: number, extra: Partial<NonNullable<Judgement["failed"]>> = {}) => {
    if (base.failed) return;
    const t = tests[i], r = rows[i];
    base.verdict = verdict;
    base.failed = {
      idx: i + 1, sample: !!t.sample, big: !t.input || t.input.length > 2000,
      ...(t.sample ? { input: t.input ?? "", expected: t.expected, got: r?.o ?? "" } : {}), ...extra,
    };
  };
  for (let i = 0; i < tests.length; i++) {
    const r = rows[i];
    if (!r) { fail("tle", i); break; }            // not reached: an earlier test ran out of time
    if (r.s === "tle") { fail("tle", i); break; }
    if (r.s === "re") { fail("runtime", i, { error: r.e }); continue; }
    if (r.h !== (await sha256(tests[i].expected))) { fail("wrong", i); continue; }
    base.passed++;
    base.maxTime = Math.max(base.maxTime, r.t);
  }
  return base;
}

async function judgeCompiled(env: Env, code: string, lang: CodeLang, tests: TestCase[], limit: number): Promise<Judgement> {
  const src = lang === "java" ? code.replace(/\bpublic\s+((?:final\s+)?class)\b/g, "$1") : code;
  const base: Judgement = { verdict: "accepted", passed: 0, total: tests.length, maxTime: 0, judge: "tests", note: "big tests skipped (backup runner)" };
  for (let i = 0; i < tests.length; i += 3) {
    const batch = tests.slice(i, i + 3);
    const results = await Promise.all(batch.map((t) => godbolt(env, lang, src, t.input ?? "")));
    for (let k = 0; k < batch.length; k++) {
      const t = batch[k], ex = results[k], n = i + k + 1;
      const info = (extra: object) => ({ idx: n, sample: !!t.sample, big: (t.input ?? "").length > 2000, ...(t.sample ? { input: t.input ?? "", expected: t.expected, got: normOut(ex.stdout).slice(0, 300) } : {}), ...extra });
      if (ex.buildFailed) return { ...base, verdict: "compile", error: ex.buildErr.slice(-900) };
      if (ex.timedOut || ex.ms / 1000 > limit) return { ...base, verdict: "tle", failed: info({}) };
      if (ex.code !== 0) return { ...base, verdict: "runtime", failed: info({ error: (ex.stderr || `exit code ${ex.code}`).slice(-600) }) };
      if (normOut(ex.stdout) !== t.expected) return { ...base, verdict: "wrong", failed: info({}) };
      base.passed++;
      base.maxTime = Math.max(base.maxTime, ex.ms / 1000);
    }
  }
  return base;
}

/** Run a short program once (the Bug Hunt and relay tests, "predict the output"…): Wandbox or godbolt, and paiza.io
 *  when they're saturated or down. */
export async function runOnce(env: Env, lang: CodeLang, code: string, stdin = ""): Promise<{ ok: boolean; out: string; err: string }> {
  const viaPaiza = async () => { const r = await paizaRun(env, lang, lang === "php" && !/^\s*<\?php/.test(code) ? "<?php\n" + code : code, stdin); return { ok: r.ok, out: r.out, err: r.err }; };
  if (lang === "javascript" || lang === "php") {
    if (wandboxSaturated()) {
      try { return await viaPaiza(); } catch (e) { if (!(e instanceof RunnerUnavailable)) throw e; }
      return runOnceMain(env, lang, code, stdin);
    }
    try { return await runOnceMain(env, lang, code, stdin, [800]); }
    catch (e) { if (!(e instanceof RunnerUnavailable)) throw e; }
    try { return await viaPaiza(); } catch (e) { if (!(e instanceof RunnerUnavailable)) throw e; }
    return runOnceMain(env, lang, code, stdin);
  }
  try { return await runOnceMain(env, lang, code, stdin); }
  catch (e) { if (!(e instanceof RunnerUnavailable) || !PAIZA_LANG[lang]) throw e; }
  return viaPaiza();   // godbolt down: Python on paiza.io
}

async function runOnceMain(env: Env, lang: CodeLang, code: string, stdin = "", waits = wandboxPace.waits): Promise<{ ok: boolean; out: string; err: string }> {
  if (lang === "javascript" || lang === "php") {
    const php = lang === "php" && !/^\s*<\?php/.test(code) ? "<?php\n" + code : code;
    // the current Node.js / PHP version of Wandbox (a retired one is looked up and the run tried again)
    const prefix = lang === "javascript" ? "nodejs-" : "php-";
    let comp = lang === "javascript" ? wandboxNode : wandboxPhp;
    let j: any;
    try {
      j = await wandbox(env, { compiler: comp, code: php, stdin }, 30000, waits);
      if (/compiler.*not found|unknown compiler/i.test(JSON.stringify(j).slice(0, 300)) && !j.program_output) throw new RunnerUnavailable("HTTP 400 compiler not found");
    } catch (e) {
      // a retired version answers 400/404/500 "not found"; busy (429…) was already tried again: no new version to look for
      if (!(e instanceof RunnerUnavailable) || !/HTTP (?!429|50[234])[45]\d\d|timeout/.test(e.message)) throw e;
      const n = await wandboxCompiler(env, prefix);
      if (n) { comp = n; if (lang === "javascript") wandboxNode = n; else wandboxPhp = n; }
      j = await wandbox(env, { compiler: comp, code: php, stdin }, 30000, waits);
    }
    const out = String(j.program_output ?? "");
    const ok = String(j.status) === "0" && !j.signal && !j.compiler_error && out.length < 100000;
    return { ok, out: out.replace(/\s+$/, ""), err: String(j.program_error || j.compiler_error || j.signal || "").slice(-400) };
  }
  const ex = await godbolt(env, lang, lang === "java" ? code.replace(/\bpublic\s+((?:final\s+)?class)\b/g, "$1") : code, stdin, 30000);
  return { ok: !ex.buildFailed && !ex.timedOut && ex.code === 0 && !ex.truncated, out: ex.stdout.replace(/\s+$/, ""), err: (ex.buildErr || ex.stderr).slice(-400) };
}

/** Quick connectivity check for the dashboard's diagnostics. */
export async function runnerHealth(env: Env): Promise<{ ok: boolean; ms: number; detail: string }> {
  const t = Date.now();
  const parts: string[] = [];
  let ok = true;
  for (const [lang, code, want] of [["python", "print(sum(range(101)))", "5050"], ["javascript", "console.log([1,2,3].map(x => x * 2).join('-'))", "2-4-6"], ["php", "<?php echo array_sum(range(1, 100));", "5050"]] as const) {
    try {
      const r = await runOnce(env, lang, code);
      const good = r.ok && r.out.trim() === want;
      ok &&= good;
      parts.push(`${LANGS[lang].label}: ${good ? "OK" : r.err || r.out || "no output"}`);
    } catch (e) {
      ok = false;
      parts.push(`${LANGS[lang].label}: ${(e as Error).message}`);
    }
  }
  // Wandbox: it checks the challenges the AI writes (and runs the tests of several languages at once)
  try {
    const h = await runHarness(env, "javascript", "const l = require('fs').readFileSync(0, 'utf8').trim(); console.log(l.split(' ').map(Number).reduce((a, b) => a + b, 0));", [{ input: "2 3", gen: null }], 2, 50, 10);
    const good = !h.compile && h.rows[0]?.s === "ok" && h.rows[0].o.trim() === "5";
    ok &&= good;
    parts.push(`Wandbox (${wandboxNode}): ${good ? "OK" : h.compile || h.rows[0]?.e || "no output"}`);
  } catch (e) {
    ok = false;
    parts.push(`Wandbox: ${(e as Error).message}`);
  }
  // paiza.io: the backup when Wandbox is saturated (a whole class at once)
  try {
    const r = await paizaRun(env, "javascript", "console.log([1,2,3].map(x => x * 2).join('-'))", "", 20000);
    parts.push(`Backup runner paiza.io: ${r.ok && r.out.trim() === "2-4-6" ? "OK" : r.err || r.out || "no output"}`);
  } catch (e) {
    parts.push(`Backup runner paiza.io: ${(e as Error).message}`);
  }
  return { ok, ms: Date.now() - t, detail: parts.join(" · ") };
}

/** Run a program on a few visible tests and return each output (the editor's "Run" button). */
export async function runSamples(env: Env, lang: CodeLang, code: string, tests: { input: string }[], limit: number)
  : Promise<{ compile?: string; rows: { status: "ok" | "tle" | "re" | "ge"; time: number; output: string; error: string }[] }> {
  const ts = tests.map((t) => ({ input: t.input, gen: null }));
  let res: { compile?: string; rows: HarnessRow[] };
  try {
    res = await runHarness(env, lang, code, ts, limit + LANGS[lang].extra, 2000, 15);
  } catch (e) {
    if (!(e instanceof RunnerUnavailable) || lang !== "python") throw e;
    res = await runPythonTests(env, code, ts, limit, 2000);
  }
  return { compile: res.compile, rows: res.rows.map((r) => ({ status: r.s, time: r.t, output: r.o, error: r.e })) };
}
