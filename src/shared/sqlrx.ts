// Judging SQL and regex answers.
//   SQL: the student's ONE query runs with SQLite (Python's sqlite3 on the code runner) on the shown
//        dataset and on hidden datasets with the same schema; rows are compared with the reference's.
//   Regex: tested in the Worker as a full match against strings that must / must not match (some hidden).
import type { Env } from "./types.ts";
import type { TestCase } from "./runner.ts";
import { RunnerUnavailable, runOnce } from "./runner.ts";

// ------------------------------------------------------------------- SQL
const SQL_RUNNER = String.raw`
import sys, json, sqlite3
job = json.loads(sys.stdin.read())
out = []
def norm(v):
    if isinstance(v, float):
        v = round(v, 2)
        return int(v) if v == int(v) else v
    if isinstance(v, bytes):
        return v.decode("utf-8", "replace")
    return v
for case in job["cases"]:
    con = sqlite3.connect(":memory:")
    try:
        con.executescript(case)
        cur = con.execute(job["query"])
        rows = cur.fetchmany(2001)
        out.append({"rows": [[norm(v) for v in r] for r in rows]})
    except Exception as e:
        out.append({"error": str(e)[:300]})
    finally:
        con.close()
print(job["mark"] + json.dumps(out, ensure_ascii=False, separators=(",", ":")))
`;

export interface SqlVerdict { ok: boolean; error?: string; failedSample: boolean; got?: unknown[][]; want?: unknown[][]; passed: number; total: number }

const sortRows = (rows: unknown[][]) => [...rows].map((r) => JSON.stringify(r)).sort();

/** Run one student query on every dataset of a SQL challenge. */
export async function judgeSql(env: Env, query: string, tests: TestCase[], ordered: boolean): Promise<SqlVerdict> {
  const q = query.trim().replace(/;\s*$/, "");
  if (!q) return { ok: false, error: "empty query", failedSample: true, passed: 0, total: tests.length };
  if (q.includes(";")) return { ok: false, error: "only ONE query is allowed (remove the extra ';')", failedSample: true, passed: 0, total: tests.length };
  const cases = [...tests].sort((a, b) => b.sample - a.sample || a.idx - b.idx);
  const mark = "__CBSQL" + crypto.randomUUID().replace(/-/g, "").slice(0, 10) + "__";
  const r = await runOnce(env, "python", SQL_RUNNER, JSON.stringify({ query: q, cases: cases.map((c) => c.input ?? ""), mark }));
  const line = r.out.split("\n").reverse().find((l) => l.startsWith(mark));
  if (!line) throw new RunnerUnavailable(`sql judge: ${r.err || r.out.slice(-200)}`);
  const res: { rows?: unknown[][]; error?: string }[] = JSON.parse(line.slice(mark.length));
  let passed = 0;
  for (const [i, c] of cases.entries()) {
    const got = res[i];
    const want = JSON.parse(c.expected) as unknown[][];
    if (got?.error) return { ok: false, error: got.error, failedSample: !!c.sample, passed, total: cases.length };
    const rows = got?.rows ?? [];
    const same = ordered ? JSON.stringify(rows) === JSON.stringify(want) : JSON.stringify(sortRows(rows)) === JSON.stringify(sortRows(want));
    if (!same) return { ok: false, failedSample: !!c.sample, got: c.sample ? rows.slice(0, 8) : undefined, want: c.sample ? want.slice(0, 8) : undefined, passed, total: cases.length };
    passed++;
  }
  return { ok: true, failedSample: false, passed, total: cases.length };
}

/** Run one query on several datasets (used to check AI-written SQL challenges). */
export async function runSqlCases(env: Env, query: string, cases: string[]): Promise<{ rows?: unknown[][]; error?: string }[]> {
  const mark = "__CBSQL" + crypto.randomUUID().replace(/-/g, "").slice(0, 10) + "__";
  const r = await runOnce(env, "python", SQL_RUNNER, JSON.stringify({ query: query.trim().replace(/;\s*$/, ""), cases, mark }));
  const line = r.out.split("\n").reverse().find((l) => l.startsWith(mark));
  if (!line) throw new RunnerUnavailable(`sql runner: ${r.err || r.out.slice(-200)}`);
  return JSON.parse(line.slice(mark.length));
}

/** Rows as a small text table for Discord. */
export function rowsText(rows: unknown[][], max = 8): string {
  if (!rows.length) return "(no rows)";
  const cells = rows.slice(0, max).map((r) => r.map((v) => (v === null ? "NULL" : String(v))));
  const w = cells[0].map((_, i) => Math.max(...cells.map((r) => (r[i] ?? "").length)));
  return cells.map((r) => r.map((v, i) => v.padEnd(w[i])).join(" | ")).join("\n") + (rows.length > max ? `\n… ${rows.length - max} more` : "");
}

// ----------------------------------------------------------------- regex
export interface RegexData { flags: string; match: string[]; reject: string[] }
export interface RegexVerdict { ok: boolean; error?: string; visible: { s: string; should: boolean }[]; hidden: number }

export function regexData(c: { code: string | null; alternatives: string | null }): { shown: RegexData; hidden: { match: string[]; reject: string[] } } {
  let shown: RegexData = { flags: "", match: [], reject: [] }, hidden = { match: [] as string[], reject: [] as string[] };
  try { shown = { ...shown, ...JSON.parse(c.code || "{}") }; } catch { /* keep defaults */ }
  try { hidden = { ...hidden, ...JSON.parse(c.alternatives || "{}") }; } catch { /* keep defaults */ }
  return { shown, hidden };
}

// a quantified group that is itself quantified, e.g. (a+)+ or (\w*)*: can take forever on some strings
const DANGEROUS = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*[+*{]/;

/** Test a student's regex as a FULL match (^(?:…)$) with JavaScript semantics. */
export function judgeRegex(pattern: string, data: ReturnType<typeof regexData>): RegexVerdict {
  let p = pattern.trim();
  const lit = p.match(/^\/(.*)\/([a-z]*)$/s);          // accept /pattern/flags too
  let flags = data.shown.flags;
  if (lit) { p = lit[1]; flags = [...new Set((flags + lit[2]).replace(/[^gimsuy]/g, "").replace("g", ""))].join(""); }
  if (!p) return { ok: false, error: "empty pattern", visible: [], hidden: 0 };
  if (p.length > 300) return { ok: false, error: "pattern too long (300 characters max)", visible: [], hidden: 0 };
  if (DANGEROUS.test(p)) return { ok: false, error: "nested repetition like (a+)+ can freeze on some strings: simplify it", visible: [], hidden: 0 };
  let re: RegExp;
  try { re = new RegExp(`^(?:${p})$`, flags); } catch (e) { return { ok: false, error: String((e as Error).message).slice(0, 200), visible: [], hidden: 0 }; }
  const visible: RegexVerdict["visible"] = [];
  for (const s of data.shown.match) if (!re.test(s)) visible.push({ s, should: true });
  for (const s of data.shown.reject) if (re.test(s)) visible.push({ s, should: false });
  let hidden = 0;
  for (const s of data.hidden.match) if (!re.test(s)) hidden++;
  for (const s of data.hidden.reject) if (re.test(s)) hidden++;
  return { ok: !visible.length && !hidden, visible, hidden };
}
