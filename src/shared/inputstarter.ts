// ✍️ The starter code of a "write code" challenge without a function signature: the lines that READ THE INPUT,
// written from the challenge's own samples, in the student's language.
//
// One generic starter ("n, then n numbers") broke every challenge whose input is different: a string, two numbers,
// n = 0 with an empty second line… (« lines[1] is undefined », « invalid literal for int(): 'ababa' »). So the samples
// are read: each value is a whole number, a decimal or a word; a line of n values after a number n is a list of n. The
// plan must read EVERY sample exactly (nothing left over, the right kinds), else the starter stays neutral: it only
// gives a way to read the values, with examples in comments, and assumes nothing.
// Reading is always value by value (spaces and line breaks never matter), and a value that isn't there gives 0 or "".
import type { CodeLang } from "./runner.ts";

type Kind = "int" | "num" | "word";
type Step = { t: "one"; name: string; kind: Kind } | { t: "list"; name: string; kind: Kind; len: string };
const isInt = (x: string) => /^[+-]?\d+$/.test(x);
const isNum = (x: string) => /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(x);
const kindOf = (x: string): Kind => (isInt(x) ? "int" : isNum(x) ? "num" : "word");
const wider = (a: Kind, b: Kind): Kind => (a === b ? a : a === "word" || b === "word" ? "word" : "num");
const linesOf = (s: string) => { const l = s.replace(/\r/g, "").split("\n").map((x) => x.trim()); while (l.length && !l[l.length - 1]) l.pop(); return l; };
const count = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** The reading plan from the samples' inputs, or null when it can't be sure. */
export function readPlan(inputs: string[]): Step[] | null {
  const ins = inputs.filter((x) => typeof x === "string");
  if (!ins.length) return null;
  // the sample with the most values shows the whole shape
  const base = linesOf([...ins].sort((a, b) => count(b) - count(a))[0]);
  if (!base.length || base.length > 6) return null;
  const names: Record<Kind, string[]> = { int: ["n", "m", "k", "q", "x", "y"], num: ["x", "y", "z", "w"], word: ["s", "t", "u", "w"] };
  const used = new Set<string>(), val: Record<string, number> = {};
  const fresh = (list: string[]) => { const n = list.find((x) => !used.has(x)) ?? `v${used.size}`; used.add(n); return n; };
  const steps: Step[] = [];
  for (let li = 0; li < base.length; li++) {
    const line = base[li];
    const toks = line ? line.split(/\s+/) : [];
    if (!toks.length) continue;
    // n lines of one value each, after a number n: a list of n (one per line)
    const col = Object.keys(val).filter((v) => val[v] >= 2 && li + val[v] <= base.length && base.slice(li, li + val[v]).every((x) => x && !/\s/.test(x)));
    if (toks.length === 1 && col.length) {
      const len = col[col.length - 1], rows = base.slice(li, li + val[len]);
      steps.push({ t: "list", name: fresh(["a", "b", "c", "d"]), kind: rows.map(kindOf).reduce(wider), len });
      li += val[len] - 1;
      continue;
    }
    const lens = Object.keys(val).filter((v) => val[v] === toks.length);
    if (toks.length > 1 && lens.length) {
      // n values after a number n: a list of n
      steps.push({ t: "list", name: fresh(["a", "b", "c", "d"]), kind: toks.map(kindOf).reduce(wider), len: lens[lens.length - 1] });
    } else if (toks.length <= 4) {
      for (const tk of toks) { const k = kindOf(tk); const name = fresh(names[k]); steps.push({ t: "one", name, kind: k }); if (k === "int") val[name] = Number(tk); }
    } else return null;
  }
  if (!steps.length) return null;
  // two lists of the same length in a row: rather a grid (its number of rows varies), not for a starter to guess
  for (let i = 1; i < steps.length; i++) { const a = steps[i - 1], b = steps[i]; if (a.t === "list" && b.t === "list" && a.len === b.len) return null; }
  // the plan must read every sample: the kinds (widened when a sample needs it), the lists' lengths, nothing left over
  for (const s of ins) {
    const toks = s.split(/\s+/).filter(Boolean);
    const v: Record<string, number> = {};
    let p = 0;
    for (const st of steps) {
      const n = st.t === "one" ? 1 : v[st.len] ?? 0;
      if (st.t === "list" && (!Number.isInteger(n) || n < 0 || n > 1e6)) return null;
      for (let i = 0; i < n && p < toks.length; i++, p++) {
        const k = kindOf(toks[p]);
        if (k !== st.kind) {
          // a list's length must stay a whole number
          if (st.t === "one" && st.kind === "int" && steps.some((x) => x.t === "list" && x.len === st.name)) return null;
          st.kind = wider(st.kind, k);
        }
        if (st.t === "one" && isInt(toks[p])) v[st.name] = Number(toks[p]);
      }
    }
    if (p < toks.length) return null;
  }
  return steps;
}

const W = (L: string) => (L === "fr" ? {
  read: "l'entrée, valeur par valeur (les espaces et retours à la ligne ne comptent pas ; une valeur absente donne 0 ou \"\")",
  how: "lis ce que décrit la section « Input », par exemple :", todo: "✍️ calcule la réponse, puis affiche-la", given: "ce que décrit la section « Input » (d'après les exemples) :",
  num: "un nombre", word: "un mot", nums: "n nombres",
} : {
  read: "the input, value by value (spaces and line breaks don't matter; a missing value gives 0 or \"\")",
  how: "read what the \"Input\" section describes, for example:", todo: "✍️ compute the answer, then print it", given: "what the \"Input\" section describes (from the samples):",
  num: "a number", word: "a word", nums: "n numbers",
});

function js(steps: Step[] | null, L: string) {
  const t = W(L), conv = (k: Kind) => (k === "word" ? `next() ?? ""` : `Number(next() ?? 0)`);
  const body = steps ? `// ${t.given}\n` + steps.map((s) => s.t === "one" ? `const ${s.name} = ${conv(s.kind)};` : `const ${s.name} = [];\nfor (let i = 0; i < ${s.len}; i++) ${s.name}.push(${conv(s.kind)});`).join("\n")
    : `// ${t.how}\n//   const n = Number(next() ?? 0);   // ${t.num}\n//   const s = next() ?? "";          // ${t.word}\n//   const a = []; for (let i = 0; i < n; i++) a.push(Number(next()));   // ${t.nums}`;
  return `// ${t.read}\nconst data = require("fs").readFileSync(0, "utf8").split(/\\s+/).filter(Boolean);\nlet pos = 0;\nconst next = () => data[pos++];\n\n${body}\n\n// ${t.todo}\nconsole.log();\n`;
}
function py(steps: Step[] | null, L: string) {
  const t = W(L), conv = (k: Kind) => (k === "word" ? `nxt() or ""` : k === "int" ? `int(nxt() or 0)` : `float(nxt() or 0)`);
  const body = steps ? `# ${t.given}\n` + steps.map((s) => s.t === "one" ? `${s.name} = ${conv(s.kind)}` : `${s.name} = [${conv(s.kind)} for _ in range(${s.len})]`).join("\n")
    : `# ${t.how}\n#   n = int(nxt() or 0)                  # ${t.num}\n#   s = nxt() or ""                      # ${t.word}\n#   a = [int(nxt()) for _ in range(n)]   # ${t.nums}`;
  return `import sys\n\n# ${t.read}\ndata = sys.stdin.read().split()\npos = 0\ndef nxt():\n    global pos\n    pos += 1\n    return data[pos - 1] if pos <= len(data) else None\n\n${body}\n\n# ${t.todo}\nprint()\n`;
}
function php(steps: Step[] | null, L: string) {
  const t = W(L), conv = (k: Kind) => (k === "word" ? `($data[$pos++] ?? "")` : k === "int" ? `(int)($data[$pos++] ?? 0)` : `(float)($data[$pos++] ?? 0)`);
  const body = steps ? `// ${t.given}\n` + steps.map((s) => s.t === "one" ? `$${s.name} = ${conv(s.kind)};` : `$${s.name} = [];\nfor ($i = 0; $i < $${s.len}; $i++) $${s.name}[] = ${conv(s.kind)};`).join("\n")
    : `// ${t.how}\n//   $n = (int)($data[$pos++] ?? 0);   // ${t.num}\n//   $s = $data[$pos++] ?? "";         // ${t.word}\n//   $a = []; for ($i = 0; $i < $n; $i++) $a[] = (int)$data[$pos++];   // ${t.nums}`;
  return `<?php\n// ${t.read}\n$data = preg_split('/\\s+/', trim(stream_get_contents(STDIN)), -1, PREG_SPLIT_NO_EMPTY);\n$pos = 0;\n\n${body}\n\n// ${t.todo}\necho "\\n";\n`;
}
function java(steps: Step[] | null, L: string) {
  const t = W(L);
  const ty = (k: Kind) => (k === "word" ? "String" : k === "int" ? "long" : "double"), rd = (k: Kind) => (k === "word" ? "next()" : k === "int" ? "nextLong()" : "nextDouble()");
  const body = steps ? `        // ${t.given}\n` + steps.map((s) => s.t === "one" ? `        ${ty(s.kind)} ${s.name} = ${rd(s.kind)};` : `        ${ty(s.kind)}[] ${s.name} = new ${ty(s.kind)}[(int) ${s.len}];\n        for (int i = 0; i < ${s.len}; i++) ${s.name}[i] = ${rd(s.kind)};`).join("\n")
    : `        // ${t.how}\n        //   long n = nextLong();      // ${t.num}\n        //   String s = next();        // ${t.word}\n        //   long[] a = new long[(int) n]; for (int i = 0; i < n; i++) a[i] = nextLong();`;
  return `import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    // ${t.read}\n    static String[] data;\n    static int pos = 0;\n    static String next() { return pos < data.length ? data[pos++] : ""; }\n    static long nextLong() { String x = next(); return x.isEmpty() ? 0 : Long.parseLong(x); }\n    static double nextDouble() { String x = next(); return x.isEmpty() ? 0 : Double.parseDouble(x); }\n\n    public static void main(String[] args) throws IOException {\n        String all = new String(System.in.readAllBytes()).trim();\n        data = all.isEmpty() ? new String[0] : all.split("\\\\s+");\n\n${body}\n\n        // ${t.todo}\n        System.out.println();\n    }\n}\n`;
}
function cpp(steps: Step[] | null, L: string) {
  const t = W(L);
  const ty = (k: Kind) => (k === "word" ? "string" : k === "int" ? "long long" : "double");
  const body = steps ? `    // ${t.given}\n` + steps.map((s) => s.t === "one" ? `    ${ty(s.kind)} ${s.name}${s.kind === "word" ? "" : " = 0"};\n    cin >> ${s.name};` : `    vector<${ty(s.kind)}> ${s.name}(${s.len});\n    for (auto& v : ${s.name}) cin >> v;`).join("\n")
    : `    // ${t.how}\n    //   long long n = 0; cin >> n;                        // ${t.num}\n    //   string s; cin >> s;                              // ${t.word}\n    //   vector<long long> a(n); for (auto& v : a) cin >> v;   // ${t.nums}`;
  return `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // ${t.read}\n\n${body}\n\n    // ${t.todo}\n    cout << "\\n";\n}\n`;
}
function c(steps: Step[] | null, L: string) {
  const t = W(L);
  const body = steps ? `    // ${t.given}\n` + steps.map((s) => {
    if (s.t === "one") return s.kind === "word" ? `    static char ${s.name}[200005] = "";\n    scanf("%200004s", ${s.name});` : s.kind === "int" ? `    long long ${s.name} = 0;\n    scanf("%lld", &${s.name});` : `    double ${s.name} = 0;\n    scanf("%lf", &${s.name});`;
    if (s.kind === "word") return `    /* ${s.len} ${L === "fr" ? "mots : lis-les un par un avec" : "words: read them one by one with"} scanf("%s", ...) */`;
    const ty = s.kind === "int" ? "long long" : "double", f = s.kind === "int" ? "%lld" : "%lf";
    return `    ${ty} *${s.name} = malloc(sizeof(${ty}) * (${s.len} > 0 ? ${s.len} : 1));\n    for (long long i = 0; i < ${s.len}; i++) scanf("${f}", &${s.name}[i]);`;
  }).join("\n")
    : `    // ${t.how}\n    //   long long n = 0; scanf("%lld", &n);                // ${t.num}\n    //   static char s[200005] = ""; scanf("%200004s", s);   // ${t.word}`;
  return `#include <stdio.h>\n#include <stdlib.h>\n\nint main(void) {\n    // ${t.read}\n\n${body}\n\n    // ${t.todo}\n    printf("\\n");\n    return 0;\n}\n`;
}
const MAKERS: Record<CodeLang, (s: Step[] | null, L: string) => string> = { javascript: js, python: py, php, java, cpp, c };

/** The starter of a challenge in a language: it reads the input as the samples show it (neutral when unsure). */
export function inputStarter(sampleInputs: string[], lang: CodeLang, L = "en"): string {
  return (MAKERS[lang] ?? js)(readPlan(sampleInputs), L);
}
