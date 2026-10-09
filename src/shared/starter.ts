// "Function mode" for write-code problems: students only write solve(...).
// From a small signature we generate, for each language, a starter program
// that already reads the input and prints what solve() returns, plus the
// examples written as function calls: solve("aab") → "a2b1".
import type { CodeLang } from "./runner.ts";

export type ParamType = "int" | "str" | "int[]" | "str[]" | "int[][]";
export type RetType = "int" | "str" | "int[]" | "str[]";
export interface ReadItem { n: string; t: ParamType; len?: string; cols?: number; hide?: boolean }
export interface Signature { read: ReadItem[]; args: string[]; ret: RetType; doc?: { en?: string; fr?: string } }

const TYPES: ParamType[] = ["int", "str", "int[]", "str[]", "int[][]"];
const RETS: RetType[] = ["int", "str", "int[]", "str[]"];
const IDENT = /^[a-zA-Z][a-zA-Z0-9_]{0,19}$/;
const RESERVED = new Set(["data", "pos", "r", "i", "j", "main", "solve", "args", "in", "out", "result", "len", "string", "int", "long", "char", "new", "class", "function", "return", "list", "str", "map"]);

/** Parse and check a signature (from the database or the AI). Null when unusable. */
export function parseSignature(raw: unknown): Signature | null {
  let s: any = raw;
  if (typeof raw === "string") { try { s = JSON.parse(raw); } catch { return null; } }
  if (!s || !Array.isArray(s.read) || !Array.isArray(s.args) || !RETS.includes(s.ret)) return null;
  const seen = new Map<string, ReadItem>();
  const read: ReadItem[] = [];
  for (const r of s.read) {
    if (!r || !IDENT.test(r.n) || RESERVED.has(String(r.n).toLowerCase()) || seen.has(r.n) || !TYPES.includes(r.t)) return null;
    const item: ReadItem = { n: r.n, t: r.t, ...(r.hide ? { hide: true } : {}) };
    if (r.t.endsWith("]")) {
      const lenItem = seen.get(r.len);
      if (!lenItem || lenItem.t !== "int") return null;
      item.len = r.len;
    }
    if (r.t === "int[][]") {
      const c = Number(r.cols);
      if (!Number.isInteger(c) || c < 1 || c > 5) return null;
      item.cols = c;
    }
    seen.set(r.n, item);
    read.push(item);
  }
  if (!read.length || read.length > 8) return null;
  const args = s.args.map(String);
  if (!args.length || args.some((a: string) => !seen.has(a)) || new Set(args).size !== args.length) return null;
  return { read, args, ret: s.ret, doc: s.doc && typeof s.doc === "object" ? { en: s.doc.en ? String(s.doc.en) : undefined, fr: s.doc.fr ? String(s.doc.fr) : undefined } : undefined };
}

const item = (sig: Signature, name: string) => sig.read.find((r) => r.n === name)!;

// ------------------------------------------------------------------- examples
/** Turn a sample input into the solve(...) arguments, in a JS-like notation. */
export function sampleCall(sig: Signature, input: string, expected: string): { call: string; result: string } | null {
  const tok = input.split(/\s+/).filter(Boolean);
  let p = 0;
  const vals: Record<string, unknown> = {};
  const num = () => { const v = tok[p++]; if (v === undefined || !/^-?\d+$/.test(v)) throw new Error("bad"); return v; };
  const str = () => { const v = tok[p++]; if (v === undefined) throw new Error("bad"); return v; };
  try {
    for (const r of sig.read) {
      const n = r.len ? Number(vals[r.len]) : 0;
      if (r.t === "int") vals[r.n] = num();
      else if (r.t === "str") vals[r.n] = str();
      else if (r.t === "int[]") vals[r.n] = Array.from({ length: n }, num);
      else if (r.t === "str[]") vals[r.n] = Array.from({ length: n }, str);
      else vals[r.n] = Array.from({ length: n }, () => Array.from({ length: r.cols! }, num));
    }
  } catch { return null; }
  const lit = (v: unknown, t: string): string => {
    if (t === "int") return String(v);
    if (t === "str") return JSON.stringify(v);
    if (t === "int[]") return `[${(v as string[]).join(", ")}]`;
    if (t === "str[]") return `[${(v as string[]).map((x) => JSON.stringify(x)).join(", ")}]`;
    return `[${(v as string[][]).map((row) => `[${row.join(", ")}]`).join(", ")}]`;
  };
  const call = `solve(${sig.args.map((a) => lit(vals[a], item(sig, a).t)).join(", ")})`;
  const out = expected.trim();
  const result = sig.ret === "int" ? out : sig.ret === "str" ? JSON.stringify(out)
    : sig.ret === "int[]" ? `[${out.split(/\s+/).join(", ")}]` : `[${out.split(/\s+/).map((x) => JSON.stringify(x)).join(", ")}]`;
  return { call, result };
}

/** solve's header in a language, for the "Your task" text. */
export function signatureLine(sig: Signature, lang: CodeLang): string {
  const T = (t: string) => typeMap[lang]?.[t] ?? t;
  const ps = sig.args.map((a) => [a, item(sig, a).t] as const);
  switch (lang) {
    case "javascript": return `function solve(${ps.map(([n]) => n).join(", ")})`;
    case "php": return `function solve(${ps.map(([n]) => "$" + n).join(", ")})`;
    case "python": return `def solve(${ps.map(([n]) => n).join(", ")}):`;
    case "java": return `static ${T(sig.ret)} solve(${ps.map(([n, t]) => `${T(t)} ${n}`).join(", ")})`;
    case "cpp": return `${T(sig.ret)} solve(${ps.map(([n, t]) => `${T(t)} ${n}`).join(", ")})`;
    case "c": return cHeader(sig);
  }
}
const typeMap: Partial<Record<CodeLang, Record<string, string>>> = {
  java: { int: "long", str: "String", "int[]": "long[]", "str[]": "String[]", "int[][]": "long[][]" },
  cpp: { int: "long long", str: "string", "int[]": "vector<long long>", "str[]": "vector<string>", "int[][]": "vector<vector<long long>>" },
};

// ------------------------------------------------------------------- starters
const COMMENT: Record<"en" | "fr", { top: string; io: string }> = {
  en: { top: "Write your solution in solve(): it receives the input and RETURNS the answer.", io: "---- reads the input and prints what solve returns: don't change ----" },
  fr: { top: "Écris ta solution dans solve() : elle reçoit l'entrée et RETOURNE la réponse.", io: "---- lit l'entrée et affiche ce que solve retourne : ne pas modifier ----" },
};

export function makeStarter(sig: Signature, lang: CodeLang, L = "en"): string {
  const c = COMMENT[L === "fr" ? "fr" : "en"];
  switch (lang) {
    case "javascript": return jsStarter(sig, c);
    case "php": return phpStarter(sig, c);
    case "python": return pyStarter(sig, c);
    case "java": return javaStarter(sig, c);
    case "cpp": return cppStarter(sig, c);
    case "c": return cStarter(sig, c);
  }
}

const defaultRet = (ret: RetType, lang: CodeLang) => {
  const m: Record<string, Record<RetType, string>> = {
    javascript: { int: "0", str: '""', "int[]": "[]", "str[]": "[]" },
    php: { int: "0", str: '""', "int[]": "[]", "str[]": "[]" },
    python: { int: "0", str: '""', "int[]": "[]", "str[]": "[]" },
    java: { int: "0", str: '""', "int[]": "new long[0]", "str[]": "new String[0]" },
    cpp: { int: "0", str: '""', "int[]": "{}", "str[]": "{}" },
  };
  return m[lang][ret];
};

function jsStarter(sig: Signature, c: { top: string; io: string }): string {
  const lines: string[] = [];
  for (const r of sig.read) {
    const len = r.len ? r.len : "";
    if (r.t === "int") lines.push(`const ${r.n} = Number(data[pos++]);`);
    else if (r.t === "str") lines.push(`const ${r.n} = data[pos++];`);
    else if (r.t === "int[]") lines.push(`const ${r.n} = data.slice(pos, pos + ${len}).map(Number); pos += ${len};`);
    else if (r.t === "str[]") lines.push(`const ${r.n} = data.slice(pos, pos + ${len}); pos += ${len};`);
    else lines.push(`const ${r.n} = [];`, `for (let i = 0; i < ${len}; i++) { ${r.n}.push(data.slice(pos, pos + ${r.cols}).map(Number)); pos += ${r.cols}; }`);
  }
  const print = sig.ret === "int[]" ? `console.log(result.join(" "));` : sig.ret === "str[]" ? `console.log(result.join("\\n"));` : `console.log(String(result));`;
  return `// ${c.top}
function solve(${sig.args.join(", ")}) {

  return ${defaultRet(sig.ret, "javascript")};
}

// ${c.io}
const data = require("fs").readFileSync(0, "utf8").split(/\\s+/).filter(Boolean);
let pos = 0;
${lines.join("\n")}
const result = solve(${sig.args.join(", ")});
${print}
`;
}

function phpStarter(sig: Signature, c: { top: string; io: string }): string {
  const lines: string[] = [];
  for (const r of sig.read) {
    const len = r.len ? "$" + r.len : "";
    if (r.t === "int") lines.push(`$${r.n} = intval($data[$pos++]);`);
    else if (r.t === "str") lines.push(`$${r.n} = $data[$pos++];`);
    else if (r.t === "int[]") lines.push(`$${r.n} = array_map("intval", array_slice($data, $pos, ${len})); $pos += ${len};`);
    else if (r.t === "str[]") lines.push(`$${r.n} = array_slice($data, $pos, ${len}); $pos += ${len};`);
    else lines.push(`$${r.n} = [];`, `for ($i = 0; $i < ${len}; $i++) { $${r.n}[] = array_map("intval", array_slice($data, $pos, ${r.cols})); $pos += ${r.cols}; }`);
  }
  const print = sig.ret === "int[]" ? `echo implode(" ", $result), "\\n";` : sig.ret === "str[]" ? `echo implode("\\n", $result), "\\n";` : `echo $result, "\\n";`;
  return `<?php
// ${c.top}
function solve(${sig.args.map((a) => "$" + a).join(", ")}) {

    return ${defaultRet(sig.ret, "php")};
}

// ${c.io}
$data = preg_split('/\\s+/', trim(stream_get_contents(STDIN)));
$pos = 0;
${lines.join("\n")}
$result = solve(${sig.args.map((a) => "$" + a).join(", ")});
${print}
`;
}

function pyStarter(sig: Signature, c: { top: string; io: string }): string {
  return `# ${c.top}
def solve(${sig.args.join(", ")}):

    return ${defaultRet(sig.ret, "python")}


${pyIO(sig, c.io)}`;
}

/** The Python input/output part (also used to turn an AI's solve() into a full program). */
export function pyIO(sig: Signature, io = COMMENT.en.io): string {
  const lines: string[] = [];
  for (const r of sig.read) {
    const len = r.len ?? "";
    if (r.t === "int") lines.push(`${r.n} = int(data[pos]); pos += 1`);
    else if (r.t === "str") lines.push(`${r.n} = data[pos]; pos += 1`);
    else if (r.t === "int[]") lines.push(`${r.n} = [int(x) for x in data[pos:pos + ${len}]]; pos += ${len}`);
    else if (r.t === "str[]") lines.push(`${r.n} = data[pos:pos + ${len}]; pos += ${len}`);
    else lines.push(`${r.n} = [[int(x) for x in data[pos + i * ${r.cols}:pos + (i + 1) * ${r.cols}]] for i in range(${len})]; pos += ${len} * ${r.cols}`);
  }
  const print = sig.ret === "int[]" ? `print(" ".join(map(str, result)))` : sig.ret === "str[]" ? `print("\\n".join(map(str, result)))` : `print(result)`;
  return `# ${io}
import sys
sys.setrecursionlimit(1000000)
data = sys.stdin.read().split()
pos = 0
${lines.join("\n")}
result = solve(${sig.args.join(", ")})
${print}
`;
}

function javaStarter(sig: Signature, c: { top: string; io: string }): string {
  const T = typeMap.java!;
  const lines: string[] = [];
  for (const r of sig.read) {
    const len = r.len ? `(int) ${r.len}` : "";
    if (r.t === "int") lines.push(`long ${r.n} = Long.parseLong(data[pos++]);`);
    else if (r.t === "str") lines.push(`String ${r.n} = data[pos++];`);
    else if (r.t === "int[]") lines.push(`long[] ${r.n} = new long[${len}];`, `for (int i = 0; i < ${r.n}.length; i++) ${r.n}[i] = Long.parseLong(data[pos++]);`);
    else if (r.t === "str[]") lines.push(`String[] ${r.n} = new String[${len}];`, `for (int i = 0; i < ${r.n}.length; i++) ${r.n}[i] = data[pos++];`);
    else lines.push(`long[][] ${r.n} = new long[${len}][${r.cols}];`, `for (int i = 0; i < ${r.n}.length; i++) for (int j = 0; j < ${r.cols}; j++) ${r.n}[i][j] = Long.parseLong(data[pos++]);`);
  }
  const print = sig.ret === "int[]"
    ? `StringBuilder sb = new StringBuilder();\n        for (int i = 0; i < result.length; i++) sb.append(i > 0 ? " " : "").append(result[i]);\n        System.out.println(sb);`
    : sig.ret === "str[]" ? `System.out.println(String.join("\\n", result));` : `System.out.println(result);`;
  return `import java.util.*;
import java.io.*;

public class Main {
    // ${c.top}
    static ${T[sig.ret]} solve(${sig.args.map((a) => `${T[item(sig, a).t]} ${a}`).join(", ")}) {

        return ${defaultRet(sig.ret, "java")};
    }

    // ${c.io}
    public static void main(String[] args) throws IOException {
        String[] data = new String(System.in.readAllBytes()).trim().split("\\\\s+");
        int pos = 0;
        ${lines.join("\n        ")}
        ${T[sig.ret]} result = solve(${sig.args.join(", ")});
        ${print}
    }
}
`;
}

function cppStarter(sig: Signature, c: { top: string; io: string }): string {
  const T = typeMap.cpp!;
  const lines: string[] = [];
  for (const r of sig.read) {
    if (r.t === "int") lines.push(`long long ${r.n}; cin >> ${r.n};`);
    else if (r.t === "str") lines.push(`string ${r.n}; cin >> ${r.n};`);
    else if (r.t === "int[]") lines.push(`vector<long long> ${r.n}(${r.len});`, `for (auto& x : ${r.n}) cin >> x;`);
    else if (r.t === "str[]") lines.push(`vector<string> ${r.n}(${r.len});`, `for (auto& x : ${r.n}) cin >> x;`);
    else lines.push(`vector<vector<long long>> ${r.n}(${r.len}, vector<long long>(${r.cols}));`, `for (auto& row : ${r.n}) for (auto& x : row) cin >> x;`);
  }
  const print = sig.ret === "int[]" ? `for (size_t i = 0; i < result.size(); i++) cout << (i ? " " : "") << result[i];\n    cout << "\\n";`
    : sig.ret === "str[]" ? `for (auto& line : result) cout << line << "\\n";` : `cout << result << "\\n";`;
  return `#include <bits/stdc++.h>
using namespace std;

// ${c.top}
${T[sig.ret]} solve(${sig.args.map((a) => `${T[item(sig, a).t]} ${a}`).join(", ")}) {

    return ${defaultRet(sig.ret, "cpp")};
}

// ${c.io}
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    ${lines.join("\n    ")}
    ${T[sig.ret]} result = solve(${sig.args.join(", ")});
    ${print}
}
`;
}

// C: arrays come with their length; array results are written into out / out_len
function cParams(sig: Signature): string[] {
  const ps: string[] = [];
  for (const a of sig.args) {
    const r = item(sig, a);
    if (r.t === "int") ps.push(`long long ${a}`);
    else if (r.t === "str") ps.push(`char *${a}`);
    else if (r.t === "int[]") ps.push(`long long *${a}`, `int ${a}_len`);
    else if (r.t === "str[]") ps.push(`char **${a}`, `int ${a}_len`);
    else ps.push(`long long (*${a})[${r.cols}]`, `int ${a}_len`);
  }
  if (sig.ret === "int[]") ps.push("long long *out", "int *out_len");
  if (sig.ret === "str[]") ps.push("const char **out", "int *out_len");
  return ps;
}
function cHeader(sig: Signature): string {
  const ret = sig.ret === "int" ? "long long" : sig.ret === "str" ? "char *" : "void";
  return `${ret} solve(${cParams(sig).join(", ")})`;
}
function cStarter(sig: Signature, c: { top: string; io: string }): string {
  const lines: string[] = [];
  const callArgs: string[] = [];
  for (const r of sig.read) {
    const len = r.len ? `(int) ${r.len}` : "";
    if (r.t === "int") lines.push(`long long ${r.n}; scanf("%lld", &${r.n});`);
    else if (r.t === "str") lines.push(`char *${r.n} = malloc(1 << 21); scanf("%2000000s", ${r.n});`);
    else if (r.t === "int[]") lines.push(`int ${r.n}_len = ${len};`, `long long *${r.n} = malloc(sizeof(long long) * (${r.n}_len + 1));`, `for (int i = 0; i < ${r.n}_len; i++) scanf("%lld", &${r.n}[i]);`);
    else if (r.t === "str[]") lines.push(`int ${r.n}_len = ${len};`, `char **${r.n} = malloc(sizeof(char *) * (${r.n}_len + 1));`, `for (int i = 0; i < ${r.n}_len; i++) { ${r.n}[i] = malloc(1 << 17); scanf("%131000s", ${r.n}[i]); }`);
    else lines.push(`int ${r.n}_len = ${len};`, `long long (*${r.n})[${r.cols}] = malloc(sizeof(long long[${r.cols}]) * (${r.n}_len + 1));`, `for (int i = 0; i < ${r.n}_len; i++) for (int j = 0; j < ${r.cols}; j++) scanf("%lld", &${r.n}[i][j]);`);
  }
  for (const a of sig.args) {
    const r = item(sig, a);
    callArgs.push(a);
    if (r.t !== "int" && r.t !== "str") callArgs.push(`${a}_len`);
  }
  let call: string;
  if (sig.ret === "int") call = `printf("%lld\\n", solve(${callArgs.join(", ")}));`;
  else if (sig.ret === "str") call = `printf("%s\\n", solve(${callArgs.join(", ")}));`;
  else if (sig.ret === "int[]") call = `long long *out = malloc(sizeof(long long) * 1000000); int out_len = 0;\n    solve(${[...callArgs, "out", "&out_len"].join(", ")});\n    for (int i = 0; i < out_len; i++) printf(i ? " %lld" : "%lld", out[i]);\n    printf("\\n");`;
  else call = `const char **out = malloc(sizeof(char *) * 1000000); int out_len = 0;\n    solve(${[...callArgs, "out", "&out_len"].join(", ")});\n    for (int i = 0; i < out_len; i++) printf("%s\\n", out[i]);`;
  const body = sig.ret === "int" ? "    return 0;" : sig.ret === "str" ? '    return "";' : "    *out_len = 0;";
  return `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// ${c.top}
${cHeader(sig)} {

${body}
}

// ${c.io}
int main(void) {
    ${lines.join("\n    ")}
    ${call}
    return 0;
}
`;
}
