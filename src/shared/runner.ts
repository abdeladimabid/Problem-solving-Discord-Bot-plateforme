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
  javascript: `const lines = require("fs").readFileSync(0, "utf8").trim().split("\\n");
const n = Number(lines[0]);
const a = lines[1].split(" ").map(Number);

console.log(n);
`,
  php: `<?php
$lines = explode("\\n", trim(stream_get_contents(STDIN)));
$n = (int)$lines[0];
$a = array_map("intval", explode(" ", $lines[1]));

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
        _ns = {}
        exec(_t["g"], _ns)
        _data = _ns["gen"]()
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

interface HarnessRow { s: "ok" | "tle" | "re"; t: number; h: string; o: string; n: number; e: string }

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
    const g = sh(PY, ["-c", t.g + "\nimport sys\nsys.stdout.write(gen())"], { timeout: 20000 });
    if (g.status !== 0) done({ je: "test generator failed: " + (g.stderr || "").slice(-300) });
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

async function wandbox(env: Env, body: Record<string, unknown>, timeoutMs = 60000): Promise<any> {
  const base = (env.WANDBOX_URL || "https://wandbox.org").replace(/\/$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${base}/api/compile.json`, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "ClassBot judge (Discord coding practice bot for a CS class)" },
      body: JSON.stringify({ save: false, stdin: "", ...body }),
    });
  } catch (e) {
    throw new RunnerUnavailable(`code runner unreachable (${(e as Error).name === "AbortError" ? "timeout" : (e as Error).message})`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) throw new RunnerUnavailable(`code runner answered HTTP ${res.status}: ${text.slice(0, 120)}`);
  try { return JSON.parse(text); } catch { throw new RunnerUnavailable("code runner sent an unexpected answer"); }
}

/** Find the current name of a Wandbox compiler when ours was retired. */
async function wandboxCompiler(env: Env, prefix: string): Promise<string | null> {
  const base = (env.WANDBOX_URL || "https://wandbox.org").replace(/\/$/, "");
  try {
    const list: { name: string }[] = await (await fetch(`${base}/api/list.json`)).json();
    return list.map((c) => c.name).filter((n) => n.startsWith(prefix) && !n.includes("head")).sort().reverse()[0] ?? null;
  } catch { return null; }
}

/** Run a program on several tests in ONE Wandbox request (any language). */
export async function runHarness(env: Env, lang: CodeLang, src: string, tests: { input: string | null; gen: string | null }[], limit: number, full = 300, budget = 22)
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
      const r = await wandbox(env, body());
      if (!(/compiler.*not found|unknown compiler/i.test(JSON.stringify(r).slice(0, 300)) && !r.program_output)) return r;
    } catch (e) {
      if (!(e instanceof RunnerUnavailable) || !/HTTP [45]\d\d/.test(e.message)) throw e;
    }
    const n = await wandboxCompiler(env, "nodejs-");
    if (n && n !== wandboxNode) { wandboxNode = n; return wandbox(env, body()); }
    return wandbox(env, body());
  };
  let j: any;
  try { j = await call(); }
  catch (e) {
    if (!(e instanceof RunnerUnavailable) || !/timeout|HTTP 5\d\d|unexpected answer/.test(e.message)) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    j = await call();
  }
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

/** Run a short program once (used to compute the real output of "predict the output" challenges). */
export async function runOnce(env: Env, lang: CodeLang, code: string, stdin = ""): Promise<{ ok: boolean; out: string; err: string }> {
  if (lang === "javascript" || lang === "php") {
    const php = lang === "php" && !/^\s*<\?php/.test(code) ? "<?php\n" + code : code;
    // the current Node.js / PHP version of Wandbox (a retired one is looked up and the run tried again)
    const prefix = lang === "javascript" ? "nodejs-" : "php-";
    let comp = lang === "javascript" ? wandboxNode : wandboxPhp;
    let j: any;
    try {
      j = await wandbox(env, { compiler: comp, code: php, stdin }, 30000);
      if (/compiler.*not found|unknown compiler/i.test(JSON.stringify(j).slice(0, 300)) && !j.program_output) throw new RunnerUnavailable("HTTP 400 compiler not found");
    } catch (e) {
      if (!(e instanceof RunnerUnavailable) || !/HTTP [45]\d\d|timeout/.test(e.message)) throw e;
      const n = await wandboxCompiler(env, prefix);
      if (n) { comp = n; if (lang === "javascript") wandboxNode = n; else wandboxPhp = n; }
      j = await wandbox(env, { compiler: comp, code: php, stdin }, 30000);
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
  return { ok, ms: Date.now() - t, detail: parts.join(" · ") };
}

/** Run a program on a few visible tests and return each output (the editor's "Run" button). */
export async function runSamples(env: Env, lang: CodeLang, code: string, tests: { input: string }[], limit: number)
  : Promise<{ compile?: string; rows: { status: "ok" | "tle" | "re"; time: number; output: string; error: string }[] }> {
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
