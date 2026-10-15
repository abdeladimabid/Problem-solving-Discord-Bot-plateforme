// 🎮 What the class games are made of, beyond the built-ins: Code Relay challenges in JavaScript, Python or PHP
// (built-in, written by the teacher, or by the AI), and SQL Detective cases (built-in, written, or by the AI).
// Everything the AI writes is CHECKED by running it: a challenge's reference solution must pass its own tests
// (the tests it fails are dropped), and a case's solution queries are run on its database with SQLite to get the
// expected results (the steps that fail or return nothing are dropped).
import type { Env } from "./types.ts";
import { aiBudgetOk, aiBudgetUse } from "./db.ts";
import { chat, extractJson } from "./ai.ts";
import { runOnce } from "./runner.ts";
import type { SqlCase, SqlStep } from "./sqlcases.ts";

export type RelayLang = "javascript" | "python" | "php";
export const RELAY_LANGS: Record<RelayLang, string> = { javascript: "JavaScript", python: "Python", php: "PHP" };
export interface RTest { args: unknown[]; expect: unknown }
export interface RelayTask { title: string; text: string; fn: string; params: string[]; tests: RTest[]; level?: "easy" | "medium" | "hard"; solution?: string; by?: "builtin" | "teacher" | "ai" }

const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const T = (title: string, level: RelayTask["level"], fn: string, params: string[], text: string, tests: [unknown[], unknown][], solution: string): RelayTask =>
  ({ title, level, fn, params, text, tests: tests.map(([args, expect]) => ({ args, expect })), solution, by: "builtin" });

// ------------------------------------------------------------------ the built-in challenges (each with a Python reference solution, checked by the tests)
export const RELAY_TASKS: RelayTask[] = [
  T("Compresser une chaîne", "medium", "compresser", ["texte"], "Écris compresser(texte) qui remplace chaque suite de lettres identiques par la lettre suivie du nombre de répétitions : \"aaabcc\" devient \"a3b1c2\".",
    [[["aaabccdddd"], "a3b1c2d4"], [[""], ""], [["abc"], "a1b1c1"], [["zzzzzzzzzzzz"], "z12"], [["aabbaa"], "a2b2a2"], [["x"], "x1"]],
    "def compresser(texte):\n    out = ''\n    i = 0\n    while i < len(texte):\n        j = i\n        while j < len(texte) and texte[j] == texte[i]:\n            j += 1\n        out += texte[i] + str(j - i)\n        i = j\n    return out\n"),
  T("Parenthèses équilibrées", "medium", "equilibre", ["texte"], "Écris equilibre(texte) qui renvoie true si toutes les parenthèses ( ), crochets [ ] et accolades { } sont bien fermées dans le bon ordre (les autres caractères sont ignorés).",
    [[["({[]})"], true], [["([)]"], false], [[""], true], [["((("], false], [["a(b)c[d]"], true], [[")("], false], [["{[()()]}"], true]],
    "def equilibre(texte):\n    pile = []\n    paires = {')': '(', ']': '[', '}': '{'}\n    for c in texte:\n        if c in '([{':\n            pile.append(c)\n        elif c in paires:\n            if not pile or pile.pop() != paires[c]:\n                return False\n    return not pile\n"),
  T("Le chiffre de César", "medium", "cesar", ["texte", "decalage"], "Écris cesar(texte, decalage) qui décale chaque lettre de l’alphabet (majuscules et minuscules) de « decalage » positions, en revenant au début après z. Les autres caractères ne changent pas. Le décalage peut être négatif.",
    [[["Bonjour", 3], "Erqmrxu"], [["xyz", 3], "abc"], [["ABC", -1], "ZAB"], [["Salut, toi !", 13], "Fnyhg, gbv !"], [["abc", 26], "abc"], [["", 5], ""]],
    "def cesar(texte, decalage):\n    out = ''\n    for c in texte:\n        if 'a' <= c <= 'z':\n            out += chr((ord(c) - 97 + decalage) % 26 + 97)\n        elif 'A' <= c <= 'Z':\n            out += chr((ord(c) - 65 + decalage) % 26 + 65)\n        else:\n            out += c\n    return out\n"),
  T("Les chiffres romains", "hard", "romain", ["n"], "Écris romain(n) qui écrit un nombre entre 1 et 3999 en chiffres romains (I, V, X, L, C, D, M ; 4 = IV, 9 = IX, 40 = XL, 90 = XC, 400 = CD, 900 = CM).",
    [[[1994], "MCMXCIV"], [[4], "IV"], [[9], "IX"], [[58], "LVIII"], [[3999], "MMMCMXCIX"], [[1], "I"], [[444], "CDXLIV"]],
    "def romain(n):\n    v = [(1000,'M'),(900,'CM'),(500,'D'),(400,'CD'),(100,'C'),(90,'XC'),(50,'L'),(40,'XL'),(10,'X'),(9,'IX'),(5,'V'),(4,'IV'),(1,'I')]\n    out = ''\n    for k, s in v:\n        while n >= k:\n            out += s\n            n -= k\n    return out\n"),
  T("Fusionner des intervalles", "hard", "fusionner", ["intervalles"], "Écris fusionner(intervalles) : chaque intervalle est un tableau [début, fin]. Renvoie les intervalles fusionnés quand ils se chevauchent ou se touchent, triés par début.",
    [[[[[1, 3], [2, 6], [8, 10], [15, 18]]], [[1, 6], [8, 10], [15, 18]]], [[[[1, 4], [4, 5]]], [[1, 5]]], [[[]], []], [[[[5, 7], [1, 2]]], [[1, 2], [5, 7]]], [[[[1, 10], [2, 3], [4, 5]]], [[1, 10]]]],
    "def fusionner(intervalles):\n    out = []\n    for a, b in sorted(intervalles, key=lambda x: x[0]):\n        if out and a <= out[-1][1]:\n            out[-1][1] = max(out[-1][1], b)\n        else:\n            out.append([a, b])\n    return out\n"),
  T("Le mot le plus fréquent", "medium", "motFrequent", ["phrase"], "Écris motFrequent(phrase) qui renvoie le mot le plus fréquent, en minuscules (sans tenir compte des majuscules ni de la ponctuation). En cas d’égalité, le premier apparu. \"\" si la phrase n’a aucun mot.",
    [[["le chat et le chien"], "le"], [["Un deux, un DEUX, trois"], "un"], [[""], ""], [["bonjour"], "bonjour"], [["a b b a c c c"], "c"]],
    "import re\ndef motFrequent(phrase):\n    mots = re.findall(r'[a-zà-ÿ]+', phrase.lower())\n    best, n = '', 0\n    vus = {}\n    for m in mots:\n        vus[m] = vus.get(m, 0) + 1\n    for m in mots:\n        if vus[m] > n:\n            best, n = m, vus[m]\n    return best\n"),
  T("Mot de passe fort", "medium", "estFort", ["mdp"], "Écris estFort(mdp) qui renvoie true si le mot de passe a au moins 8 caractères, une minuscule, une majuscule, un chiffre et un caractère spécial (ni lettre ni chiffre).",
    [[["Abcdef1!"], true], [["abcdef1!"], false], [["ABCDEFG1!"], false], [["Abcdefgh!"], false], [["Ab1!"], false], [["Abcdefg1"], false], [["Mot de Passe 2026 ?"], true]],
    "def estFort(mdp):\n    return len(mdp) >= 8 and any(c.islower() for c in mdp) and any(c.isupper() for c in mdp) and any(c.isdigit() for c in mdp) and any(not c.isalnum() for c in mdp)\n"),
  T("La spirale", "hard", "spirale", ["matrice"], "Écris spirale(matrice) qui renvoie les nombres d’une matrice (tableau de lignes) lus en spirale : la première ligne de gauche à droite, puis la dernière colonne vers le bas, la dernière ligne vers la gauche, et ainsi de suite vers le centre.",
    [[[[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], [1, 2, 3, 6, 9, 8, 7, 4, 5]], [[[[1, 2], [3, 4]]], [1, 2, 4, 3]], [[[]], []], [[[[1, 2, 3, 4]]], [1, 2, 3, 4]], [[[[1], [2], [3]]], [1, 2, 3]], [[[[1, 2, 3], [4, 5, 6]]], [1, 2, 3, 6, 5, 4]]],
    "def spirale(matrice):\n    m = [list(r) for r in matrice]\n    out = []\n    while m:\n        out += m.pop(0)\n        if m and m[0]:\n            for r in m:\n                out.append(r.pop())\n        if m:\n            out += m.pop()[::-1]\n        if m and m[0]:\n            for r in m[::-1]:\n                out.append(r.pop(0))\n        m = [r for r in m if r]\n    return out\n"),
  T("Le rendu de monnaie", "medium", "monnaie", ["montant", "pieces"], "Écris monnaie(montant, pieces) qui rend la monnaie avec le moins de pièces possible en prenant toujours la plus grosse pièce possible. Renvoie la liste des pièces, de la plus grande à la plus petite, ou [] si on ne peut pas rendre exactement.",
    [[[87, [50, 20, 10, 5, 2, 1]], [50, 20, 10, 5, 2]], [[0, [1, 2]], []], [[6, [1, 2, 5]], [5, 1]], [[3, [2]], []], [[40, [20, 10]], [20, 20]]],
    "def monnaie(montant, pieces):\n    out = []\n    for p in sorted(pieces, reverse=True):\n        while montant >= p:\n            out.append(p)\n            montant -= p\n    return out if montant == 0 else []\n"),
  T("Deux nombres qui font la somme", "medium", "deuxSomme", ["nombres", "cible"], "Écris deuxSomme(nombres, cible) qui renvoie les positions [i, j] (i < j) des deux nombres dont la somme vaut cible : la paire dont j est le plus petit (puis i). [] s’il n’y en a pas.",
    [[[[2, 7, 11, 15], 9], [0, 1]], [[[3, 2, 4], 6], [1, 2]], [[[1, 2, 3], 10], []], [[[3, 3], 6], [0, 1]], [[[-1, 5, 4, 0], 4], [0, 1]]],
    "def deuxSomme(nombres, cible):\n    for j in range(len(nombres)):\n        for i in range(j):\n            if nombres[i] + nombres[j] == cible:\n                return [i, j]\n    return []\n"),
  T("Le bulletin", "hard", "bulletin", ["notes"], "Écris bulletin(notes) : notes est un objet { matière: [notes] }. Renvoie un objet { matière: moyenne } avec chaque moyenne arrondie à 2 chiffres après la virgule.",
    [[[{ maths: [10, 20], info: [15] }], { maths: 15, info: 15 }], [[{}], {}], [[{ svt: [12, 13, 15] }], { svt: 13.33 }], [[{ a: [0, 0, 1], b: [20] }], { a: 0.33, b: 20 }]],
    "def bulletin(notes):\n    return {k: round(sum(v) / len(v), 2) for k, v in notes.items()}\n"),
  T("La somme", "easy", "somme", ["tableau"], "Écris somme(tableau) qui renvoie la somme des nombres du tableau (0 pour un tableau vide).",
    [[[[1, 2, 3]], 6], [[[]], 0], [[[-4, 4]], 0], [[[10]], 10], [[[2.5, 2.5, 5]], 10], [[[100, -1, 1, 7]], 107]], "def somme(tableau):\n    return sum(tableau)\n"),
  T("Les voyelles", "easy", "compterVoyelles", ["texte"], "Écris compterVoyelles(texte) qui renvoie le nombre de voyelles (a, e, i, o, u, y), en majuscules comme en minuscules.",
    [[["bonjour"], 3], [["AEIOUY"], 6], [[""], 0], [["rythme"], 2], [["JavaScript"], 3], [["xkcd"], 0]], "def compterVoyelles(texte):\n    return sum(1 for c in texte.lower() if c in 'aeiouy')\n"),
  T("FizzBuzz", "easy", "fizzBuzz", ["n"], "Écris fizzBuzz(n) qui renvoie un tableau de 1 à n où les multiples de 3 sont remplacés par \"Fizz\", ceux de 5 par \"Buzz\" et ceux de 3 et 5 par \"FizzBuzz\".",
    [[[5], [1, 2, "Fizz", 4, "Buzz"]], [[0], []], [[3], [1, 2, "Fizz"]], [[15], [1, 2, "Fizz", 4, "Buzz", "Fizz", 7, 8, "Fizz", "Buzz", 11, "Fizz", 13, 14, "FizzBuzz"]], [[1], [1]]],
    "def fizzBuzz(n):\n    return ['FizzBuzz' if i % 15 == 0 else 'Fizz' if i % 3 == 0 else 'Buzz' if i % 5 == 0 else i for i in range(1, n + 1)]\n"),
  T("Le panier", "easy", "totalPanier", ["articles"], "Écris totalPanier(articles) : chaque article est un objet { prix, quantite }. Renvoie le total à payer (prix × quantité de chaque article).",
    [[[[{ prix: 10, quantite: 2 }, { prix: 5, quantite: 1 }]], 25], [[[]], 0], [[[{ prix: 3.5, quantite: 4 }]], 14], [[[{ prix: 100, quantite: 0 }, { prix: 1, quantite: 1 }]], 1]],
    "def totalPanier(articles):\n    return sum(a['prix'] * a['quantite'] for a in articles)\n"),
];

// ------------------------------------------------------------------ languages
const PY_KW = new Set(["def", "class", "return", "if", "for", "in", "while", "lambda", "pass", "None", "True", "False", "list", "str", "dict", "type", "id", "max", "min", "sum"]);
export const safeParam = (p: string, i: number) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p) && !PY_KW.has(p) ? p : `p${i + 1}`);
/** The code the first writer starts from, in the game's language. */
export function starterFor(task: Pick<RelayTask, "fn" | "params">, lang: RelayLang): string {
  const ps = (task.params || []).map(safeParam);
  if (lang === "python") return `def ${task.fn}(${ps.join(", ")}):\n    pass\n`;
  if (lang === "php") return `<?php\nfunction ${task.fn}(${ps.map((p) => "$" + p).join(", ")}) {\n    \n}\n`;
  return `function ${task.fn}(${ps.join(", ")}) {\n  \n}\n`;
}
/** A JSON value written in the language (for the examples shown to the students). */
export function literal(v: unknown, lang: RelayLang): string {
  if (lang === "python") {
    if (v === null) return "None";
    if (v === true) return "True";
    if (v === false) return "False";
    if (Array.isArray(v)) return "[" + v.map((x) => literal(x, lang)).join(", ") + "]";
    if (typeof v === "object") return "{" + Object.entries(v as object).map(([k, x]) => JSON.stringify(k) + ": " + literal(x, lang)).join(", ") + "}";
  }
  if (lang === "php") {
    if (v === null) return "null";
    if (Array.isArray(v)) return "[" + v.map((x) => literal(x, lang)).join(", ") + "]";
    if (typeof v === "object") return "[" + Object.entries(v as object).map(([k, x]) => JSON.stringify(k) + " => " + literal(x, lang)).join(", ") + "]";
  }
  return JSON.stringify(v);
}
/** The student's code + a driver that calls the function on each test and prints the results (one run for all the tests). */
export function relayProgram(lang: RelayLang, code: string, fn: string, tests: RTest[]): string {
  const data = JSON.stringify(tests);
  if (lang === "python") return `${code}

import json as __j
def __eq(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) < 1e-6
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(__eq(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return set(map(str, a)) == set(map(str, b)) and all(__eq(a[k], b.get(k, b.get(str(k)))) for k in a)
    return a == b
def __show(v):
    try:
        return __j.dumps(v, ensure_ascii=False)
    except Exception:
        return repr(v)
__R = []
for __t in __j.loads(${JSON.stringify(data)}):
    try:
        __g = ${fn}(*__t["args"])
        __R.append({"ok": __eq(__g, __t["expect"]), "got": __show(__g)})
    except Exception as __e:
        __R.append({"ok": False, "got": "Erreur : " + str(__e)})
print("@@R@@" + __j.dumps(__R, ensure_ascii=False))
`;
  if (lang === "php") {
    const body = code.replace(/^\s*<\?php/, "").replace(/\?>\s*$/, "");
    const lit = "'" + data.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
    return `<?php
${body}
function __eq($a, $b) {
  if (is_bool($a) || is_bool($b)) return $a === $b;
  if ((is_int($a) || is_float($a)) && (is_int($b) || is_float($b))) return abs($a - $b) < 1e-6;
  if (is_array($a) && is_array($b)) { if (count($a) !== count($b)) return false; foreach ($a as $k => $v) { if (!array_key_exists($k, $b) || !__eq($v, $b[$k])) return false; } return true; }
  return $a === $b;
}
$__R = [];
foreach (json_decode(${lit}, true) as $__t) {
  try { $__g = ${fn}(...$__t["args"]); $__R[] = ["ok" => __eq($__g, $__t["expect"]), "got" => json_encode($__g, JSON_UNESCAPED_UNICODE)]; }
  catch (Throwable $__e) { $__R[] = ["ok" => false, "got" => "Erreur : " . $__e->getMessage()]; }
}
echo "@@R@@" . json_encode($__R, JSON_UNESCAPED_UNICODE);
`;
  }
  return `${code}
;(function(){var T=${data};function eq(a,b){if(typeof a==="number"&&typeof b==="number")return Math.abs(a-b)<1e-6;if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every(function(x,i){return eq(x,b[i])});if(a&&b&&typeof a==="object"&&typeof b==="object"&&!Array.isArray(a)&&!Array.isArray(b)){var ka=Object.keys(a),kb=Object.keys(b);return ka.length===kb.length&&ka.every(function(k){return k in b&&eq(a[k],b[k])})}return a===b}
function show(v){try{return v===undefined?"undefined":JSON.stringify(v)}catch(e){return String(v)}}
console.log("@@R@@"+JSON.stringify(T.map(function(t){try{var g=${fn}.apply(null,t.args);return{ok:eq(g,t.expect),got:show(g)}}catch(e){return{ok:false,got:"Erreur : "+e.message}}})))})();
`;
}
export interface RelayResult { passed: number; total: number; error?: string; details: { ok: boolean; got: string }[] }
/** Runs a squad's code on the tests (on the code runner: Python, PHP, or JavaScript as a backup). */
export async function runRelay(env: Env, lang: RelayLang, code: string, fn: string, tests: RTest[]): Promise<RelayResult> {
  if (!String(code || "").trim()) return { passed: 0, total: tests.length, error: "Pas de code.", details: [] };
  let r;
  try { r = await runOnce(env, lang, relayProgram(lang, code, fn, tests)); }
  catch (e) { return { passed: 0, total: tests.length, error: "Le serveur de code ne répond pas : réessaie.", details: [] }; }
  const at = r.out.lastIndexOf("@@R@@");
  if (at < 0) return { passed: 0, total: tests.length, error: (r.err || "Le code ne s’exécute pas.").slice(-300), details: [] };
  let details: { ok: boolean; got: string }[] = [];
  try { details = (JSON.parse(r.out.slice(at + 5)) as any[]).map((d) => ({ ok: !!d.ok, got: s(d.got, 160) })); } catch { return { passed: 0, total: tests.length, error: "Résultat illisible.", details: [] }; }
  return { passed: details.filter((d) => d.ok).length, total: tests.length, details };
}

// ------------------------------------------------------------------ cleaning what the teacher or the AI wrote
export function cleanTask(t: any, by: RelayTask["by"] = "teacher"): RelayTask | null {
  const fn = s(t?.fn, 40);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(fn)) return null;
  const tests = (Array.isArray(t?.tests) ? t.tests : []).filter((x: any) => x && Array.isArray(x.args)).slice(0, 20).map((x: any) => ({ args: x.args, expect: x.expect === undefined ? null : x.expect }));
  if (tests.length < 2 || JSON.stringify(tests).length > 20000) return null;
  const n = Math.max(0, ...tests.map((x: RTest) => x.args.length));
  const params = Array.from({ length: n }, (_, i) => safeParam(s((t?.params ?? [])[i], 30), i));
  return { title: s(t?.title, 60) || fn, text: s(t?.text, 900), fn, params, tests, level: ["easy", "medium", "hard"].includes(t?.level) ? t.level : "medium", ...(t?.solution ? { solution: s(t.solution, 4000) } : {}), by };
}

const TASK_SYS = `You write ONE coding challenge for a "code relay" class game: a squad of 3 to 6 programming students writes the same function in turns of about one minute each, without talking, so it must need several minutes of real work and some thinking (loops, conditions, strings, arrays, objects, a small algorithm), but stay doable by students of that level.
The function takes plain JSON values (numbers, strings, booleans, arrays, objects) and returns one. No input/output, no randomness, no dates, no floating-point traps (round results to 2 decimals in the statement when needed).
Write 8 tests that check the normal cases AND the edge cases (empty input, one element, ties, negatives…). Then a correct reference solution in Python 3 (a function with the same name and parameters) that passes all the tests.
Reply ONLY with JSON: {"title": "…", "text": "the statement for the students: what the function receives and returns, with one example", "fn": "camelCaseName", "params": ["…"], "level": "easy|medium|hard", "tests": [{"args": [ … ], "expect": … }], "solution": "def …"}`;
/** A new relay challenge by the AI (from the teacher's idea, or its own), checked by running its solution on its tests. */
export async function generateTask(env: Env, o: { prompt?: string; level: string; lang: "fr" | "en"; avoid?: string[] }): Promise<{ task: RelayTask | null; error?: string }> {
  if (!(await aiBudgetOk(env, 2))) return { task: null, error: "The AI is used up for today: write the challenge yourself, or try tomorrow." };
  await aiBudgetUse(env, 2);
  const user = [`Level: ${o.level === "easy" ? "easy (beginners, first weeks)" : o.level === "hard" ? "hard (algorithms, several steps)" : "medium (students who practised loops, arrays, strings and objects)"}.`,
    o.prompt ? `The teacher wants: ${s(o.prompt, 500)}` : "Pick an original, useful challenge yourself.",
    (o.avoid ?? []).length ? `Not these (already used): ${(o.avoid ?? []).slice(0, 30).join(", ")}.` : "",
    `Write the title and the statement in ${o.lang === "en" ? "English" : "French"}. The function and parameter names stay in camelCase, without accents.`].filter(Boolean).join("\n");
  let raw: any = null;
  try { raw = extractJson(await chat(env, [{ role: "system", content: TASK_SYS }, { role: "user", content: user }], { maxTokens: 3000, temperature: 0.8, timeoutMs: 90000, json: true })); }
  catch (e) { return { task: null, error: "The AI didn't answer: try again in a minute." }; }
  const t = cleanTask(raw, "ai");
  if (!t || !t.solution) return { task: null, error: "The AI's challenge wasn't usable: try again." };
  // the AI's own solution must pass its tests: the tests it fails are dropped (a wrong expected value)
  const r = await runRelay(env, "python", t.solution, t.fn, t.tests);
  if (r.error) return { task: null, error: "The AI's solution doesn't run: try again." };
  const kept = t.tests.filter((_, i) => r.details[i]?.ok);
  if (kept.length < 5) return { task: null, error: "The AI's tests weren't reliable: try again." };
  return { task: { ...t, tests: kept } };
}

// ------------------------------------------------------------------ SQL Detective cases
const CASE_SYS = `You write ONE mystery for "SQL Detective", a class game where squads of students find the culprit by running SQL queries (SQLite) on a small database.
The database: 3 to 5 tables with simple French names, 6 to 25 rows each (CREATE TABLE + INSERT INTO statements, SQLite syntax, times as 'HH:MM' text). The data must contain decoys (innocent people, other times, other places) so that each clue needs a real query.
The investigation: 4 or 5 steps, each one a clue the students must find with ONE query (SELECT … WHERE, JOIN, GROUP BY / HAVING, COUNT, SUM, ORDER BY… as the level allows). Each step gives the solution query ("ref"), the result columns that must appear ("keys", 1 or 2 column names of that query's result), a hint, and the sentence revealed once found. The result of each step should have between 1 and 6 rows.
The steps narrow down the suspects until ONE person is in every list: the culprit, whose full name is in the data.
Reply ONLY with JSON: {"title": "…", "story": "3 sentences that set the scene", "schema": "CREATE TABLE …; INSERT INTO …;", "steps": [{"title": "short", "clue": "what to find (for the students)", "hint": "how (tables, clauses)", "ref": "SELECT …", "keys": ["nom"], "found": "what this clue reveals"}], "question": "Qui a … ? (prénom et nom)", "culprit": "Prénom Nom", "ending": "2 sentences that explain the solution"}`;
/** The steps' queries run on the case's database (SQLite in Python on the code runner): the expected results. */
export async function runCaseQueries(env: Env, schema: string, queries: string[]): Promise<{ error?: string; results: ({ cols: string[]; rows: unknown[][]; n: number } | { error: string })[] }> {
  const py = `import sqlite3, json
db = sqlite3.connect(":memory:")
try:
    db.executescript(${JSON.stringify(schema)})
except Exception as e:
    print("@@R@@" + json.dumps({"schema": str(e)}))
    raise SystemExit
out = []
for q in json.loads(${JSON.stringify(JSON.stringify(queries))}):
    try:
        cur = db.execute(q)
        rows = cur.fetchall()
        out.append({"cols": [d[0] for d in (cur.description or [])], "rows": [list(r) for r in rows[:60]], "n": len(rows)})
    except Exception as e:
        out.append({"error": str(e)})
print("@@R@@" + json.dumps({"results": out}, ensure_ascii=False))
`;
  let r;
  try { r = await runOnce(env, "python", py); } catch { return { error: "The code runner doesn't answer: try again.", results: [] }; }
  const at = r.out.lastIndexOf("@@R@@");
  if (at < 0) return { error: (r.err || "The database couldn't be built.").slice(-300), results: [] };
  const j = JSON.parse(r.out.slice(at + 5));
  if (j.schema) return { error: `The database has an error: ${String(j.schema).slice(0, 200)}`, results: [] };
  return { results: j.results };
}
/** A case written by the teacher or the AI → a playable case: each step's expected values come from running its solution. */
export async function buildCase(env: Env, raw: any, by: "teacher" | "ai"): Promise<{ case: SqlCase | null; error?: string; dropped: string[] }> {
  const schema = s(raw?.schema, 30000);
  const steps0 = (Array.isArray(raw?.steps) ? raw.steps : []).slice(0, 8).map((x: any) => ({ title: s(x?.title, 60), clue: s(x?.clue, 400), hint: s(x?.hint, 300), ref: s(x?.ref, 1500), keys: (Array.isArray(x?.keys) ? x.keys : [x?.keys]).map((k: unknown) => s(k, 40)).filter(Boolean), found: s(x?.found, 300) }))
    .filter((x: any) => x.clue && /^\s*(select|with)\b/i.test(x.ref));
  const culprit = s(raw?.culprit, 80);
  if (!schema || !/create\s+table/i.test(schema)) return { case: null, error: "The database (CREATE TABLE + INSERT) is missing.", dropped: [] };
  if (steps0.length < 2) return { case: null, error: "At least 2 steps with a SELECT query are needed.", dropped: [] };
  if (!culprit) return { case: null, error: "Who is the culprit?", dropped: [] };
  const run = await runCaseQueries(env, schema, steps0.map((x: any) => x.ref));
  if (run.error) return { case: null, error: run.error, dropped: [] };
  const steps: SqlStep[] = [], dropped: string[] = [];
  steps0.forEach((x: any, i: number) => {
    const r: any = run.results[i];
    if (!r || r.error) { dropped.push(`${x.title || "step " + (i + 1)}: ${r?.error || "error"}`); return; }
    if (r.n < 1 || r.n > 30) { dropped.push(`${x.title || "step " + (i + 1)}: ${r.n} rows`); return; }
    // the columns that must be in the student's result: the ones named, else the first one
    let idx = x.keys.map((k: string) => r.cols.findIndex((c: string) => c.toLowerCase() === k.toLowerCase())).filter((k: number) => k >= 0);
    if (!idx.length) idx = [0];
    steps.push({ title: x.title || `Indice ${steps.length + 1}`, clue: x.clue, hint: x.hint || "Relis les tables et leurs colonnes.", ref: x.ref, found: x.found || "Indice trouvé.",
      expect: { rows: r.n, all: idx.slice(0, 3).map((c: number) => r.rows.map((row: unknown[]) => row[c] as string | number)) } });
  });
  if (steps.length < 2) return { case: null, error: `Not enough working steps (${dropped.join(" · ")}).`, dropped };
  const norm = (t: string) => t.toLowerCase().normalize("NFC").replace(/[’']/g, "'").replace(/[^a-zà-ÿ' -]/g, "").replace(/\s+/g, " ").trim();
  const parts = norm(culprit).split(" ");
  const c: SqlCase = {
    id: "custom-" + Math.random().toString(36).slice(2, 8), title: s(raw?.title, 80) || "L’enquête", level: raw?.level === "easy" ? "easy" : "medium",
    notions: [...new Set(steps.flatMap((x) => (x.ref.toUpperCase().match(/\b(JOIN|GROUP BY|HAVING|COUNT|SUM|AVG|ORDER BY|DISTINCT|LIKE|BETWEEN|IN|WHERE)\b/g) ?? [])))].slice(0, 6),
    story: s(raw?.story, 1200), schema, steps, question: s(raw?.question, 200) || "Qui est le coupable ? (prénom et nom)",
    culprit: [...new Set([norm(culprit), parts.length > 1 ? [...parts.slice(1), parts[0]].join(" ") : ""].filter(Boolean))], ending: s(raw?.ending, 800) || `Le coupable était ${culprit}.`,
  };
  (c as any).by = by;
  return { case: c, dropped };
}
export async function generateCase(env: Env, o: { prompt?: string; level: string; lang: "fr" | "en"; avoid?: string[] }): Promise<{ case: SqlCase | null; error?: string; dropped: string[] }> {
  if (!(await aiBudgetOk(env, 3))) return { case: null, error: "The AI is used up for today: write the case yourself, or try tomorrow.", dropped: [] };
  await aiBudgetUse(env, 3);
  const user = [`Level: ${o.level === "easy" ? "easy (SELECT, WHERE, AND/OR, ORDER BY, one simple JOIN)" : "medium (JOIN of 2 or 3 tables, GROUP BY, HAVING, COUNT, SUM, DISTINCT)"}.`,
    o.prompt ? `The teacher's idea: ${s(o.prompt, 500)}` : "Invent an original setting (a school, a café, a club, a shop, a hackathon…).",
    (o.avoid ?? []).length ? `Not these (already used): ${(o.avoid ?? []).slice(0, 20).join(", ")}.` : "",
    `Write everything for the students in ${o.lang === "en" ? "English" : "French"}.`].filter(Boolean).join("\n");
  let raw: any = null;
  try { raw = extractJson(await chat(env, [{ role: "system", content: CASE_SYS }, { role: "user", content: user }], { maxTokens: 6000, temperature: 0.8, timeoutMs: 120000, json: true })); }
  catch { return { case: null, error: "The AI didn't answer: try again in a minute.", dropped: [] }; }
  if (!raw) return { case: null, error: "The AI's case wasn't usable: try again.", dropped: [] };
  return buildCase(env, raw, "ai");
}
/** A case kept with a game (written or generated): its shape checked, nothing more (it was built by buildCase). */
export function cleanStoredCase(c: any): SqlCase | null {
  if (!c || typeof c.schema !== "string" || !Array.isArray(c.steps) || c.steps.length < 2 || !Array.isArray(c.culprit)) return null;
  const steps = c.steps.filter((x: any) => x && x.clue && x.expect && Number.isInteger(x.expect.rows) && (Array.isArray(x.expect.all) || Array.isArray(x.expect.any)));
  if (steps.length < 2) return null;
  return { id: s(c.id, 40) || "custom", title: s(c.title, 80), level: c.level === "easy" ? "easy" : "medium", notions: (c.notions || []).map((x: unknown) => s(x, 20)).slice(0, 8), story: s(c.story, 1200), schema: s(c.schema, 30000),
    steps: steps.slice(0, 8).map((x: any) => ({ title: s(x.title, 60), clue: s(x.clue, 400), hint: s(x.hint, 300), ref: s(x.ref, 1500), found: s(x.found, 300), expect: x.expect })),
    question: s(c.question, 200), culprit: c.culprit.map((x: unknown) => s(x, 80).toLowerCase()).filter(Boolean), ending: s(c.ending, 800) };
}
