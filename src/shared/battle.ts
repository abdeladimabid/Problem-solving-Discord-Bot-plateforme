// ⚔️ Squad battle: two teams, one chess clock each (2 minutes by default). A question shows on the
// class TV; the team answering out loud. The teacher judges from their phone: correct → the clock stops
// and it's the other team's turn; pass → −8 s and a new question, still their turn. A clock at 0 loses.
// The TV and the judge's phone both read the state from D1 (polling); every clock is computed from
// timestamps, so the screens stay in sync whatever the network.
import type { Env, GuildRow } from "./types.ts";
import { addPoints, aiBudgetOk, aiBudgetUse, all, now, one, run } from "./db.ts";
import { chat, extractJson } from "./ai.ts";
import { COLORS, send } from "./discord.ts";
import { arenaChannel } from "./arena.ts";

export class BattleError extends Error {}

// ------------------------------------------------------------------ types
export type QKind = "output" | "missing" | "acronym" | "quick" | "truefalse" | "bug" | "mcq" | "complete";
export const QKINDS: Record<QKind, { en: string; fr: string; emoji: string }> = {
  output: { en: "What does it show?", fr: "Qu'affiche ce code ?", emoji: "🖥️" },
  missing: { en: "Missing piece", fr: "Ce qui manque", emoji: "🧩" },
  acronym: { en: "Acronym", fr: "Acronyme", emoji: "🔤" },
  quick: { en: "Quick question", fr: "Question flash", emoji: "⚡" },
  truefalse: { en: "True or false?", fr: "Vrai ou faux ?", emoji: "⚖️" },
  bug: { en: "Find the bug", fr: "Trouve le bug", emoji: "🐞" },
  mcq: { en: "A, B, C or D?", fr: "A, B, C ou D ?", emoji: "🔠" },
  complete: { en: "Complete it", fr: "Complète", emoji: "✍️" },
};
export interface BQuestion { id: string; kind: QKind; topic: string; prompt: string; code?: string; options?: string[]; answer: string; explain?: string }
export interface BTeam { name: string; emoji: string; color: string; members: string[] }
export interface BSettings { seconds: number; penalty: number; topics: string[]; kinds: QKind[]; level: "easy" | "medium"; reward: number; announce: boolean; lang: "fr" | "en" }
export interface BEvent { k: "start" | "correct" | "pass" | "wrong" | "skip" | "pause" | "resume" | "over" | "reset"; team: 0 | 1; at: number; ms?: number; answer?: string; seq: number }
export interface BState {
  phase: "lobby" | "countdown" | "playing" | "paused" | "over";
  starter: 0 | 1; turn: 0 | 1;
  left: [number, number];          // ms left on each clock (the running one: at turnAt)
  turnAt: number | null;           // ms epoch when the running clock last started
  goAt: number | null;             // end of the 3-2-1 countdown
  order: number[]; qi: number; shown: number;
  streak: [number, number]; best: [number, number];
  stats: { ok: [number, number]; pass: [number, number]; wrong: [number, number]; fastest: [number | null, number | null] };
  winner: 0 | 1 | null; ev: BEvent | null; seq: number; rewarded?: boolean; round: number;
  log: { team: 0 | 1; q: number; r: "ok" | "pass" | "skip"; ms: number }[];
}
export interface BattleRow { id: number; guild_id: string; title: string; teams: string; settings: string; questions: string; state: string; tv_token: string; judge_token: string; judge_key: string | null; judge_pin: string; judge_seen: number | null; status: string; created_at: number; updated_at: number; finished_at: number | null }

const COUNTDOWN_MS = 3600;
export function shuffle<T>(a: T[], rnd = Math.random): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

// ------------------------------------------------------------------ the game (pure: state + action + time → state)
export function newState(nQuestions: number, starter: 0 | 1 = 0, seconds = 120, round = 1): BState {
  return {
    phase: "lobby", starter, turn: starter, left: [seconds * 1000, seconds * 1000], turnAt: null, goAt: null,
    order: shuffle(Array.from({ length: nQuestions }, (_, i) => i)), qi: 0, shown: 0,
    streak: [0, 0], best: [0, 0], stats: { ok: [0, 0], pass: [0, 0], wrong: [0, 0], fastest: [null, null] },
    winner: null, ev: null, seq: 1, round, log: [],
  };
}
/** Time left on a team's clock right now. */
export function timeLeft(s: BState, team: 0 | 1, at: number): number {
  if (s.phase === "playing" && s.turn === team && s.turnAt != null) return Math.max(0, s.left[team] - (at - s.turnAt));
  return Math.max(0, s.left[team]);
}
const other = (t: 0 | 1): 0 | 1 => (t === 0 ? 1 : 0);
function event(s: BState, k: BEvent["k"], team: 0 | 1, at: number, extra: Partial<BEvent> = {}) {
  s.seq++;
  s.ev = { k, team, at, seq: s.seq, ...extra };
}
function nextQuestion(s: BState) {
  s.qi = (s.qi + 1) % Math.max(1, s.order.length);
  s.shown++;
}
/** Things that happen by themselves: the countdown ends, a clock reaches 0. Returns true if the state changed. */
export function settle(s: BState, at: number): boolean {
  let changed = false;
  if (s.phase === "countdown" && s.goAt != null && at >= s.goAt) {
    s.phase = "playing"; s.turnAt = s.goAt; s.goAt = null; s.shown = Math.max(1, s.shown); s.seq++; changed = true;
  }
  if (s.phase === "playing" && s.turnAt != null && s.left[s.turn] - (at - s.turnAt) <= 0) {
    const loser = s.turn;
    const end = s.turnAt + s.left[loser];
    s.left[loser] = 0; s.turnAt = null; s.phase = "over"; s.winner = other(loser);
    event(s, "over", other(loser), Math.min(at, end));
    changed = true;
  }
  return changed;
}
export type BAction = { a: "starter"; team: 0 | 1 } | { a: "start" } | { a: "correct" } | { a: "pass" } | { a: "wrong" } | { a: "skip" } | { a: "pause" } | { a: "resume" } | { a: "stop" } | { a: "rematch" };
/** The judge's buttons. Throws a BattleError when the action doesn't fit the moment (a double tap, a late tap…). */
export function act(s: BState, x: BAction, at: number, o: { penaltyMs: number; seconds: number; answerOf: (qIndex: number) => string }): BState {
  settle(s, at);
  const cur = () => s.order[s.qi];
  const elapsed = () => (s.turnAt == null ? 0 : at - s.turnAt);
  switch (x.a) {
    case "starter":
      if (s.phase !== "lobby") throw new BattleError("The game has started.");
      s.starter = x.team; s.turn = x.team; s.seq++;
      return s;
    case "start":
      if (s.phase !== "lobby") throw new BattleError("The game has started.");
      s.phase = "countdown"; s.turn = s.starter; s.goAt = at + COUNTDOWN_MS;
      event(s, "start", s.starter, at);
      return s;
    case "correct": {
      if (s.phase !== "playing") throw new BattleError(s.phase === "over" ? "The game is over." : "The clock isn't running.");
      const t = s.turn, ms = elapsed();
      s.left[t] = Math.max(0, s.left[t] - ms);
      s.stats.ok[t]++; s.streak[t]++; s.best[t] = Math.max(s.best[t], s.streak[t]);
      if (s.stats.fastest[t] == null || ms < (s.stats.fastest[t] as number)) s.stats.fastest[t] = ms;
      s.log.push({ team: t, q: cur(), r: "ok", ms });
      event(s, "correct", t, at, { ms, answer: o.answerOf(cur()) });
      s.turn = other(t); s.turnAt = at;
      nextQuestion(s);
      return s;
    }
    case "pass": {
      if (s.phase !== "playing") throw new BattleError(s.phase === "over" ? "The game is over." : "The clock isn't running.");
      const t = s.turn, ms = elapsed();
      s.left[t] = Math.max(0, s.left[t] - ms - o.penaltyMs);
      s.stats.pass[t]++; s.streak[t] = 0;
      s.log.push({ team: t, q: cur(), r: "pass", ms });
      event(s, "pass", t, at, { ms, answer: o.answerOf(cur()) });
      if (s.left[t] <= 0) { s.phase = "over"; s.turnAt = null; s.winner = other(t); return s; }
      s.turnAt = at;
      nextQuestion(s);
      return s;
    }
    case "wrong":
      if (s.phase !== "playing") throw new BattleError("The clock isn't running.");
      s.stats.wrong[s.turn]++; s.streak[s.turn] = 0;
      event(s, "wrong", s.turn, at);
      return s;
    case "skip":   // a broken or unclear question: another one, no penalty, the clock keeps running
      if (s.phase !== "playing" && s.phase !== "paused") throw new BattleError("The game isn't running.");
      s.log.push({ team: s.turn, q: cur(), r: "skip", ms: elapsed() });
      event(s, "skip", s.turn, at, { answer: o.answerOf(cur()) });
      nextQuestion(s);
      return s;
    case "pause":
      if (s.phase !== "playing") throw new BattleError("The clock isn't running.");
      s.left[s.turn] = Math.max(1, s.left[s.turn] - elapsed()); s.turnAt = null; s.phase = "paused";
      event(s, "pause", s.turn, at);
      return s;
    case "resume":
      if (s.phase !== "paused") throw new BattleError("The game isn't paused.");
      s.phase = "playing"; s.turnAt = at;
      event(s, "resume", s.turn, at);
      return s;
    case "stop": {   // end now: the team with more time left wins
      if (s.phase === "over" || s.phase === "lobby") throw new BattleError("Nothing to stop.");
      if (s.phase === "playing") { s.left[s.turn] = Math.max(0, s.left[s.turn] - elapsed()); }
      s.turnAt = null; s.goAt = null; s.phase = "over";
      s.winner = s.left[0] === s.left[1] ? (s.stats.ok[0] >= s.stats.ok[1] ? 0 : 1) : s.left[0] > s.left[1] ? 0 : 1;
      event(s, "over", s.winner, at);
      return s;
    }
    case "rematch": {
      const n = newState(s.order.length, other(s.starter), o.seconds, s.round + 1);
      n.seq = s.seq + 1;
      n.ev = { k: "reset", team: n.starter, at, seq: n.seq };
      return n;
    }
  }
}

// ------------------------------------------------------------------ questions
type BankQ = Omit<BQuestion, "id" | "prompt" | "explain"> & { p: [string, string]; x?: [string, string] };
/** Quick questions that work without AI (and fill up when the AI gives too few). */
export const BANK: BankQ[] = [
  // HTML
  { topic: "HTML", kind: "acronym", p: ["Que signifie HTML ?", "What does HTML stand for?"], answer: "HyperText Markup Language" },
  { topic: "HTML", kind: "quick", p: ["Quelle balise crée un lien ?", "Which tag makes a link?"], answer: "<a>" },
  { topic: "HTML", kind: "quick", p: ["Quel attribut donne le texte alternatif d'une image ?", "Which attribute gives an image's alternative text?"], answer: "alt" },
  { topic: "HTML", kind: "missing", p: ["Quelle balise manque pour une liste à puces ?", "Which tag is missing for a bulleted list?"], code: "<___>\n  <li>Pain</li>\n  <li>Lait</li>\n</___>", answer: "ul" },
  { topic: "HTML", kind: "truefalse", p: ["Vrai ou faux : <section> est une balise sémantique.", "True or false: <section> is a semantic tag."], answer: "Vrai / True" },
  { topic: "HTML", kind: "mcq", p: ["Quelle balise pour le titre le plus important ?", "Which tag for the most important heading?"], options: ["<head>", "<h1>", "<h6>", "<title>"], answer: "B · <h1>" },
  { topic: "HTML", kind: "quick", p: ["Quel type d'input masque ce qu'on tape ?", "Which input type hides what you type?"], answer: "password" },
  { topic: "HTML", kind: "bug", p: ["Où est le bug ?", "Where is the bug?"], code: '<img src="logo.png">\n<a href="index.html">Accueil<a>', answer: "</a> : la balise de fin manque le /" },
  // CSS
  { topic: "CSS", kind: "acronym", p: ["Que signifie CSS ?", "What does CSS stand for?"], answer: "Cascading Style Sheets" },
  { topic: "CSS", kind: "quick", p: ["Quelle propriété change la couleur du texte ?", "Which property changes the text colour?"], answer: "color" },
  { topic: "CSS", kind: "missing", p: ["Que manque-t-il pour centrer horizontalement les enfants ?", "What's missing to centre the children horizontally?"], code: ".box {\n  display: flex;\n  ___: center;\n}", answer: "justify-content" },
  { topic: "CSS", kind: "mcq", p: ["Quel sélecteur cible id=\"menu\" ?", 'Which selector targets id="menu"?'], options: [".menu", "#menu", "menu", "*menu"], answer: "B · #menu" },
  { topic: "CSS", kind: "truefalse", p: ["Vrai ou faux : margin est à l'intérieur de la bordure.", "True or false: margin is inside the border."], answer: "Faux / False (c'est padding)" },
  { topic: "CSS", kind: "quick", p: ["Quelle valeur de position reste visible au scroll, collée en haut ?", "Which position value sticks to the top while scrolling?"], answer: "sticky (ou fixed)" },
  { topic: "CSS", kind: "complete", p: ["Complète la media query pour les écrans de 768px et moins.", "Complete the media query for screens 768px and under."], code: "@media (___: 768px) { … }", answer: "max-width" },
  { topic: "CSS", kind: "quick", p: ["Quelle unité est relative à la taille de police de la racine ?", "Which unit is relative to the root font size?"], answer: "rem" },
  // JavaScript
  { topic: "JavaScript", kind: "output", p: ["Qu'affiche ce code ?", "What does this code print?"], code: 'console.log(2 + "2");', answer: '"22"' },
  { topic: "JavaScript", kind: "output", p: ["Qu'affiche ce code ?", "What does this code print?"], code: "console.log(typeof null);", answer: '"object"' },
  { topic: "JavaScript", kind: "output", p: ["Qu'affiche ce code ?", "What does this code print?"], code: "const a = [1, 2, 3];\nconsole.log(a.length);", answer: "3" },
  { topic: "JavaScript", kind: "missing", p: ["Quel mot-clé manque pour une variable qui ne change pas ?", "Which keyword is missing for a variable that never changes?"], code: '___ PI = 3.14;', answer: "const" },
  { topic: "JavaScript", kind: "truefalse", p: ["Vrai ou faux : 0 === \"0\"", 'True or false: 0 === "0"'], answer: "Faux / False" },
  { topic: "JavaScript", kind: "quick", p: ["Quelle méthode ajoute un élément à la fin d'un tableau ?", "Which method adds an item at the end of an array?"], answer: "push()" },
  { topic: "JavaScript", kind: "acronym", p: ["Que signifie DOM ?", "What does DOM stand for?"], answer: "Document Object Model" },
  { topic: "JavaScript", kind: "bug", p: ["Pourquoi ça ne marche pas ?", "Why doesn't it work?"], code: "if (age = 18) {\n  console.log('majeur');\n}", answer: "= au lieu de === (affectation)" },
  { topic: "JavaScript", kind: "output", p: ["Qu'affiche ce code ?", "What does this code print?"], code: "console.log([1, 2, 3].map(x => x * 2));", answer: "[2, 4, 6]" },
  { topic: "JavaScript", kind: "mcq", p: ["Quelle méthode sélectionne UN élément avec un sélecteur CSS ?", "Which method selects ONE element with a CSS selector?"], options: ["getElementsByClassName", "querySelector", "querySelectorAll", "getElement"], answer: "B · querySelector" },
  { topic: "JavaScript", kind: "acronym", p: ["Que signifie JSON ?", "What does JSON stand for?"], answer: "JavaScript Object Notation" },
  // PHP
  { topic: "PHP", kind: "acronym", p: ["Que signifie PHP aujourd'hui ?", "What does PHP stand for today?"], answer: "PHP: Hypertext Preprocessor" },
  { topic: "PHP", kind: "output", p: ["Qu'affiche ce code ?", "What does this code print?"], code: '<?php\n$x = 5;\necho "x = $x";', answer: "x = 5" },
  { topic: "PHP", kind: "quick", p: ["Quel symbole commence toute variable PHP ?", "Which symbol starts every PHP variable?"], answer: "$" },
  { topic: "PHP", kind: "missing", p: ["Quel opérateur concatène deux chaînes en PHP ?", "Which operator joins two strings in PHP?"], code: '$nom = "Ali";\necho "Salut " ___ $nom;', answer: "." },
  { topic: "PHP", kind: "quick", p: ["Quelle fonction compte les éléments d'un tableau ?", "Which function counts an array's items?"], answer: "count()" },
  { topic: "PHP", kind: "truefalse", p: ["Vrai ou faux : password_hash() sert à stocker un mot de passe.", "True or false: password_hash() is for storing a password."], answer: "Vrai / True" },
  { topic: "PHP", kind: "acronym", p: ["Que signifie PDO ?", "What does PDO stand for?"], answer: "PHP Data Objects" },
  // SQL
  { topic: "SQL", kind: "acronym", p: ["Que signifie SQL ?", "What does SQL stand for?"], answer: "Structured Query Language" },
  { topic: "SQL", kind: "missing", p: ["Quel mot-clé manque ?", "Which keyword is missing?"], code: "SELECT nom ___ etudiants;", answer: "FROM" },
  { topic: "SQL", kind: "quick", p: ["Quelle commande supprime des lignes ?", "Which command removes rows?"], answer: "DELETE" },
  { topic: "SQL", kind: "mcq", p: ["Quelle clause trie les résultats ?", "Which clause sorts the results?"], options: ["GROUP BY", "SORT", "ORDER BY", "WHERE"], answer: "C · ORDER BY" },
  { topic: "SQL", kind: "quick", p: ["Quelle fonction compte les lignes ?", "Which function counts rows?"], answer: "COUNT()" },
  { topic: "SQL", kind: "truefalse", p: ["Vrai ou faux : une clé primaire peut être NULL.", "True or false: a primary key can be NULL."], answer: "Faux / False" },
  { topic: "SQL", kind: "complete", p: ["Complète pour garder seulement les plus de 18 ans.", "Complete to keep only people over 18."], code: "SELECT * FROM users ___ age > 18;", answer: "WHERE" },
  // Git
  { topic: "Git", kind: "quick", p: ["Quelle commande enregistre les changements dans l'historique ?", "Which command records the changes in the history?"], answer: "git commit" },
  { topic: "Git", kind: "quick", p: ["Quelle commande envoie les commits sur GitHub ?", "Which command sends the commits to GitHub?"], answer: "git push" },
  { topic: "Git", kind: "missing", p: ["Que manque-t-il pour créer une branche et y aller ?", "What's missing to create a branch and switch to it?"], code: "git checkout ___ feature-login", answer: "-b" },
  { topic: "Git", kind: "truefalse", p: ["Vrai ou faux : git pull = git fetch + git merge.", "True or false: git pull = git fetch + git merge."], answer: "Vrai / True" },
  { topic: "Git", kind: "acronym", p: ["Que signifie PR sur GitHub ?", "What does PR stand for on GitHub?"], answer: "Pull Request" },
  // Python
  { topic: "Python", kind: "output", p: ["Qu'affiche ce code ?", "What does this code print?"], code: "print(len('hello'))", answer: "5" },
  { topic: "Python", kind: "output", p: ["Qu'affiche ce code ?", "What does this code print?"], code: "print(7 // 2)", answer: "3" },
  { topic: "Python", kind: "quick", p: ["Quel mot-clé définit une fonction ?", "Which keyword defines a function?"], answer: "def" },
  { topic: "Python", kind: "output", p: ["Qu'affiche ce code ?", "What does this code print?"], code: "print([1, 2, 3][-1])", answer: "3" },
  // Web general
  { topic: "Web", kind: "acronym", p: ["Que signifie HTTP ?", "What does HTTP stand for?"], answer: "HyperText Transfer Protocol" },
  { topic: "Web", kind: "quick", p: ["Quel code HTTP veut dire « page introuvable » ?", "Which HTTP code means 'page not found'?"], answer: "404" },
  { topic: "Web", kind: "acronym", p: ["Que signifie API ?", "What does API stand for?"], answer: "Application Programming Interface" },
  { topic: "Web", kind: "acronym", p: ["Que signifie URL ?", "What does URL stand for?"], answer: "Uniform Resource Locator" },
  { topic: "Web", kind: "quick", p: ["Quelle méthode HTTP envoie un formulaire de création ?", "Which HTTP method sends a create form?"], answer: "POST" },
];
export const BANK_TOPICS = [...new Set(BANK.map((q) => q.topic))];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9#+]/g, "");
const topicMatch = (topic: string, wanted: string[]) => !wanted.length || wanted.some((w) => { const a = norm(w), b = norm(topic); return a === b || (a.length > 2 && (a.includes(b) || b.includes(a))) || (b === "javascript" && a === "js"); });
export function bankQuestions(topics: string[], kinds: QKind[], lang: "fr" | "en"): BQuestion[] {
  return BANK.filter((q) => topicMatch(q.topic, topics) && (!kinds.length || kinds.includes(q.kind)))
    .map((q, i) => ({ id: "b" + i + norm(q.p[1]).slice(0, 10), kind: q.kind, topic: q.topic, prompt: q.p[lang === "en" ? 1 : 0], code: q.code, options: q.options, answer: q.answer }));
}

const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
export function cleanQuestion(q: any, i: number): BQuestion | null {
  const kind = (Object.keys(QKINDS).includes(q?.kind) ? q.kind : "quick") as QKind;
  const prompt = s(q?.prompt ?? q?.question, 240);
  const answer = s(q?.answer, 160);
  if (!prompt || !answer) return null;
  let code = s(q?.code, 600).replace(/^```\w*\n?|```$/g, "").trimEnd();
  if (code.split("\n").length > 10) code = code.split("\n").slice(0, 10).join("\n");
  const options = Array.isArray(q?.options) ? q.options.map((o: unknown) => s(o, 80)).filter(Boolean).slice(0, 4) : undefined;
  return { id: s(q?.id, 20) || "q" + i + Math.random().toString(36).slice(2, 6), kind, topic: s(q?.topic, 30) || "Web", prompt, code: code || undefined, options: options && options.length >= 2 ? options : undefined, answer, explain: s(q?.explain, 200) || undefined };
}

const SYS = `You write questions for a fast classroom game shown on a TV: two teams of programming students answer OUT LOUD, each question in a few seconds.
Rules: very short questions (one line), short answers (a word, a value, a few words), no long code (at most 6 lines), no question that needs to run code in your head for long.
Vary the kinds: output (what does this code print), missing (what's the missing keyword/line, with ___ in the code), acronym (what does X stand for), quick (a one-line knowledge question), truefalse, bug (where is the error), mcq (4 options, answer as "B · option"), complete (fill the ___).
Never put the answer in the code or the prompt. Only the topics asked, nothing else (no other language or framework).
Every question must be DIFFERENT: never the same concept, the same answer or the same code twice (not even reworded).`;
/** AI questions on the teacher's topics; the built-in bank fills in if the AI gives too few. */
/** The same question, even reworded: same code, or the same answer to the same kind of question. */
export function questionKeys(q: Pick<BQuestion, "prompt" | "code" | "answer" | "kind" | "options">): string[] {
  // the answer as written (symbols count: "[]" ≠ "{}"), without the letter of a multiple choice ("C · []" → "[]")
  const ans = String(q.answer || "").toLowerCase().replace(/^[a-d]\s*[·.:)\-]\s*/i, "").replace(/\s+/g, "");
  const keys = ["p:" + norm(q.prompt + (q.code ?? ""))];
  if (q.code && norm(q.code).length > 6) keys.push("c:" + norm(q.code));
  if (!q.code && q.kind !== "truefalse" && ans.length >= 1) keys.push("a:" + ans);
  if (q.options?.length) keys.push("o:" + q.options.map((o) => o.toLowerCase().replace(/\s+/g, "")).sort().join("|"));
  return keys;
}
export function dedupeQuestions(list: BQuestion[], already: BQuestion[] = []): BQuestion[] {
  const seen = new Set(already.flatMap(questionKeys));
  return list.filter((q) => { const k = questionKeys(q); if (k.some((x) => seen.has(x))) return false; k.forEach((x) => seen.add(x)); return true; });
}
export async function generateQuestions(env: Env, o: { topics: string[]; kinds: QKind[]; count: number; level: string; lang: "fr" | "en"; avoid?: BQuestion[] }): Promise<{ questions: BQuestion[]; ai: boolean }> {
  const count = Math.max(6, Math.min(60, o.count || 30));
  const kinds = o.kinds.length ? o.kinds : (Object.keys(QKINDS) as QKind[]);
  let out: BQuestion[] = [];
  let ai = false;
  if (await aiBudgetOk(env, 2)) {
    await aiBudgetUse(env, 2);
    const user = [`Topics: ${o.topics.join(", ") || "HTML, CSS, JavaScript"}.`, `Kinds to use: ${kinds.join(", ")}.`, `Level: ${o.level === "medium" ? "medium (first-year students who practised)" : "easy (beginners)"}.`,
      `Language of the questions and answers: ${o.lang === "en" ? "English" : "French"} (code stays code).`, `Write ${count} questions, each on one of the topics (spread them).`, (o.avoid ?? []).length ? `Already used (write other ones): ${(o.avoid ?? []).slice(0, 60).map((q) => q.prompt + (q.code ? " [" + q.code.replace(/\s+/g, " ").slice(0, 40) + "]" : "")).join(" | ")}` : "",
      `Reply ONLY with JSON: {"questions": [{"kind": "output", "topic": "JavaScript", "prompt": "…", "code": "… or empty", "options": ["…"] (only for mcq), "answer": "…", "explain": "one short sentence for the teacher"}]}`].join("\n");
    try {
      const j = extractJson(await chat(env, [{ role: "system", content: SYS }, { role: "user", content: user }], { maxTokens: 7000, temperature: 0.8, timeoutMs: 90000, json: true }));
      out = (Array.isArray(j?.questions) ? j.questions : []).map(cleanQuestion).filter(Boolean) as BQuestion[];
      out = out.filter((q) => kinds.includes(q.kind));
      ai = out.length > 0;
    } catch (e) { console.error("battle questions", e); }
  }
  // no duplicates, and a few from the bank when there aren't enough
  const avoid = o.avoid ?? [];
  out = dedupeQuestions(out, avoid);
  if (out.length < count) out = out.concat(dedupeQuestions(shuffle(bankQuestions(o.topics, kinds, o.lang)), [...avoid, ...out]));
  return { questions: out.slice(0, count), ai };
}

// ------------------------------------------------------------------ storage
const token = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
const pin = () => String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000));
const PALETTE = [["#3b82f6", "🦈"], ["#ef4444", "🔥"], ["#22c55e", "🐍"], ["#a855f7", "🦄"], ["#f59e0b", "🦁"], ["#06b6d4", "🐬"]];
export function cleanTeams(v: any): [BTeam, BTeam] {
  const arr = Array.isArray(v) ? v : [];
  return [0, 1].map((i) => {
    const t = arr[i] ?? {};
    return { name: s(t.name, 30) || (i ? "Team B" : "Team A"), emoji: s(t.emoji, 8) || PALETTE[i][1], color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : PALETTE[i][0], members: (Array.isArray(t.members) ? t.members : []).map((x: unknown) => s(x, 25)).filter(Boolean).slice(0, 40) };
  }) as [BTeam, BTeam];
}
export function cleanSettings(v: any, lang: string): BSettings {
  const kinds = (Array.isArray(v?.kinds) ? v.kinds : []).filter((k: string) => k in QKINDS);
  return {
    seconds: Math.max(30, Math.min(600, Number(v?.seconds) || 120)), penalty: Math.max(0, Math.min(60, Number(v?.penalty ?? 8))),
    topics: (Array.isArray(v?.topics) ? v.topics : []).map((t: unknown) => s(t, 40)).filter(Boolean).slice(0, 12), kinds: kinds.length ? kinds : (Object.keys(QKINDS) as QKind[]),
    level: v?.level === "medium" ? "medium" : "easy", reward: Math.max(0, Math.min(200, Number(v?.reward) || 0)), announce: v?.announce !== false, lang: (v?.lang || lang) === "en" ? "en" : "fr",
  };
}
export const parseRow = (r: BattleRow) => ({
  ...r, teams: JSON.parse(r.teams) as [BTeam, BTeam], settings: JSON.parse(r.settings) as BSettings, questions: JSON.parse(r.questions) as BQuestion[], state: JSON.parse(r.state) as BState,
});
export type Battle = ReturnType<typeof parseRow>;

export async function createBattle(env: Env, g: GuildRow, b: any): Promise<number> {
  const settings = cleanSettings(b.settings ?? b, g.lang);
  const teams = cleanTeams(b.teams);
  const qs = dedupeQuestions((Array.isArray(b.questions) ? b.questions : []).map(cleanQuestion).filter(Boolean) as BQuestion[]);
  if (qs.length < 4) throw new BattleError("At least 4 questions are needed.");
  const st = newState(qs.length, 0, settings.seconds);
  const t = now();
  const r = await one<{ id: number }>(env, `INSERT INTO battles (guild_id, title, teams, settings, questions, state, tv_token, judge_token, judge_pin, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?) RETURNING id`, g.id, s(b.title, 80) || `${teams[0].name} vs ${teams[1].name}`, JSON.stringify(teams), JSON.stringify(settings), JSON.stringify(qs), JSON.stringify(st), token(), token(), pin(), t, t);
  return r!.id;
}
export async function getBattle(env: Env, id: number, guildId?: string): Promise<Battle | null> {
  const r = await one<BattleRow>(env, `SELECT * FROM battles WHERE id = ?${guildId ? " AND guild_id = ?" : ""}`, ...(guildId ? [id, guildId] : [id]));
  return r ? parseRow(r) : null;
}
/** Teams, questions and settings can change until the game starts (and between games). */
export async function updateBattle(env: Env, g: GuildRow, id: number, b: any) {
  const x = await getBattle(env, id, g.id);
  if (!x) throw new BattleError("This battle doesn't exist anymore.");
  const live = ["countdown", "playing", "paused"].includes(x.state.phase);
  const teams = b.teams ? cleanTeams(b.teams) : x.teams;
  const settings = b.settings ? cleanSettings({ ...x.settings, ...b.settings }, g.lang) : x.settings;
  let questions = x.questions, state = x.state;
  if (b.questions) {
    if (live) throw new BattleError("The game is running: change the questions after it.");
    questions = dedupeQuestions((b.questions as any[]).map(cleanQuestion).filter(Boolean) as BQuestion[]);
    if (questions.length < 4) throw new BattleError("At least 4 questions are needed.");
  }
  if (!live && (b.questions || b.settings)) { state = newState(questions.length, state.starter, settings.seconds, state.round); state.seq = x.state.seq + 1; }
  await run(env, "UPDATE battles SET title = ?, teams = ?, settings = ?, questions = ?, state = ?, updated_at = ? WHERE id = ?",
    s(b.title ?? x.title, 80) || x.title, JSON.stringify(teams), JSON.stringify(settings), JSON.stringify(questions), JSON.stringify(state), now(), id);
  return getBattle(env, id, g.id);
}
async function saveState(env: Env, b: Battle, st: BState) {
  await run(env, "UPDATE battles SET state = ?, status = ?, updated_at = ?, finished_at = ? WHERE id = ?",
    JSON.stringify(st), st.phase === "over" ? "done" : st.phase === "lobby" ? "ready" : "live", now(), st.phase === "over" ? now() : null, b.id);
  b.state = st;
}
/** Reads the state, lets the clocks run (countdown end, a clock at 0), saves and rewards when something changed. */
export async function liveBattle(env: Env, b: Battle, at = Date.now()): Promise<Battle> {
  if (settle(b.state, at)) {
    await saveState(env, b, b.state);
    if (b.state.phase === "over") await finish(env, b);
  }
  return b;
}
export async function judgeAction(env: Env, b: Battle, x: BAction, at = Date.now()) {
  const before = b.state.phase;
  // before a game: never twice the same question (battles made before the duplicate check)
  if (x.a === "start" && b.state.phase === "lobby") {
    const qs = dedupeQuestions(b.questions);
    if (qs.length < b.questions.length && qs.length >= 4) {
      b.questions = qs;
      b.state.order = shuffle(qs.map((_, i) => i)); b.state.qi = 0;
      await run(env, "UPDATE battles SET questions = ? WHERE id = ?", JSON.stringify(qs), b.id);
    }
  }
  const st = act(b.state, x, at, { penaltyMs: b.settings.penalty * 1000, seconds: b.settings.seconds, answerOf: (i) => b.questions[i]?.answer ?? "" });
  await saveState(env, b, st);
  if (st.phase === "over" && before !== "over") await finish(env, b);
  return b;
}
/** The end: points for the winners (if set) and the result in #arena, once per game. */
async function finish(env: Env, b: Battle) {
  const st = b.state;
  if (st.rewarded || st.winner == null) return;
  st.rewarded = true;
  await run(env, "UPDATE battles SET state = ? WHERE id = ?", JSON.stringify(st), b.id);
  const g = await one<GuildRow>(env, "SELECT * FROM guilds WHERE id = ?", b.guild_id);
  if (!g) return;
  const w = b.teams[st.winner], l = b.teams[other(st.winner)];
  if (b.settings.reward > 0) for (const m of w.members) await addPoints(env, g, { discordId: m, amount: b.settings.reward, reason: "battle", ref: b.id, note: `${w.name} vs ${l.name}` });
  if (b.settings.announce) {
    const ch = await arenaChannel(env, g);
    const fr = b.settings.lang !== "en";
    const sec = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
    if (ch) await send(env, ch, { embeds: [{
      title: `⚔️ ${w.emoji} ${w.name} ${fr ? "gagne la bataille !" : "wins the battle!"}`,
      description: [`**${w.name}** vs ${l.name} · ${fr ? "temps restant" : "time left"} **${sec(st.left[st.winner])}**`,
        `✅ ${st.stats.ok[st.winner]} · ⏭️ ${st.stats.pass[st.winner]}  —  ✅ ${st.stats.ok[other(st.winner)]} · ⏭️ ${st.stats.pass[other(st.winner)]}`,
        b.settings.reward > 0 && w.members.length ? (fr ? `+${b.settings.reward} points pour ${w.members.map((m) => `<@${m}>`).join(" ")}` : `+${b.settings.reward} points for ${w.members.map((m) => `<@${m}>`).join(" ")}`) : ""].filter(Boolean).join("\n"),
      color: COLORS.gold,
    }], allowed_mentions: { parse: [] } }).catch((e) => console.error("battle post", e));
  }
}
export async function listBattles(env: Env, g: GuildRow) {
  const rows = await all<BattleRow>(env, "SELECT * FROM battles WHERE guild_id = ? ORDER BY id DESC LIMIT 50", g.id);
  return rows.map((r) => { const b = parseRow(r); return { id: b.id, title: b.title, teams: b.teams, status: b.status, n: b.questions.length, phase: b.state.phase, winner: b.state.winner, round: b.state.round, topics: b.settings.topics, updated_at: b.updated_at, created_at: b.created_at }; });
}

export function judgeUrl(env: Env, b: { id: number; judge_token: string }) { return `${String(env.PUBLIC_URL || "").replace(/\/$/, "")}/battle/judge/${b.id}.${b.judge_token}`; }
export function tvUrl(env: Env, b: { id: number; tv_token: string }) { return `${String(env.PUBLIC_URL || "").replace(/\/$/, "")}/battle/tv/${b.id}.${b.tv_token}`; }

// ------------------------------------------------------------------ what each screen sees
/** The TV: never the answer of the question on screen (only the one just answered or passed). */
export function tvView(b: Battle, at = Date.now(), judge = false) {
  const st = b.state;
  const q = b.questions[st.order[st.qi]];
  const showQ = st.phase === "playing" || st.phase === "paused" || (judge && st.phase !== "over");
  return {
    id: b.id, title: b.title, seq: st.seq, now: at, phase: st.phase, round: st.round,
    teams: b.teams.map((t) => ({ name: t.name, emoji: t.emoji, color: t.color, size: t.members.length })),
    left: [timeLeft(st, 0, at), timeLeft(st, 1, at)], running: st.phase === "playing" ? st.turn : null, turn: st.turn, starter: st.starter, goAt: st.goAt,
    q: showQ && q ? { kind: q.kind, label: QKINDS[q.kind][b.settings.lang], emoji: QKINDS[q.kind].emoji, topic: q.topic, prompt: q.prompt, code: q.code ?? null, options: q.options ?? null, n: st.shown, ...(judge ? { answer: q.answer, explain: q.explain ?? null } : {}) } : null,
    ev: st.ev, streak: st.streak, stats: st.stats, best: st.best, winner: st.winner, settings: { seconds: b.settings.seconds, penalty: b.settings.penalty, lang: b.settings.lang, reward: b.settings.reward },
    judge: !!b.judge_seen && Date.now() / 1000 - b.judge_seen < 15, total: b.questions.length,
  };
}
export async function judgeSeen(env: Env, b: Battle) {
  if (!b.judge_seen || now() - b.judge_seen >= 5) { await run(env, "UPDATE battles SET judge_seen = ? WHERE id = ?", now(), b.id); b.judge_seen = now(); }
}
