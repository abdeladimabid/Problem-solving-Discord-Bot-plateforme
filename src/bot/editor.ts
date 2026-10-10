// The code editor page: students write write-code answers here instead of in a
// Discord form. Pasting and dropping text is blocked, the statement can't be
// copied, leaving the page is recorded, and every change is logged for the
// teacher's replay. Links are signed per attempt (see integrity.ts).
import type { AttemptRow, ChallengeRow, Ctx, Env, GuildRow } from "../shared/types.ts";
import { getGuild, now, one, run } from "../shared/db.ts";
import { t } from "../shared/i18n.ts";
import { RULES } from "../shared/game.ts";
import {
  EXPLAIN_SECONDS, answerExplain, hintPlain, codeLangFor, explainState, getAttempt, getChallenge, loadTests, starterFor, startExplain, submitCode,
} from "../shared/challenges.ts";
import { findPlayer } from "../shared/db.ts";
import { LANGS, RunnerUnavailable, isCodeLang, runSamples } from "../shared/runner.ts";
import type { CodeLang } from "../shared/runner.ts";
import { parseSignature, sampleCall, signatureLine } from "../shared/starter.ts";
import type { EditorLog } from "../shared/integrity.ts";
import { readEditorToken } from "../shared/integrity.ts";

const MAX_RUNS = 30;
const json = (d: unknown, status = 200) => Response.json(d, { status, headers: { "cache-control": "no-store" } });

export async function handleEditor(request: Request, env: Env, _ctx: Ctx, token: string, action: string | undefined): Promise<Response> {
  if (!action) return new Response(EDITOR_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
  const who = await readEditorToken(env, token);
  if (!who) return json({ error: "This link has expired. Open the challenge again in Discord to get a new one." }, 403);
  const a = await getAttempt(env, who.attemptId);
  if (!a || a.discord_id !== who.userId) return json({ error: "Unknown challenge." }, 404);
  const c = await getChallenge(env, a.challenge_id);
  if (!c || c.kind !== "write") return json({ error: "Unknown challenge." }, 404);
  const g = await getGuild(env, a.guild_id);
  const body: any = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  try {
    if (action === "data" && request.method === "GET") return json(await editorData(env, g, a, c));
    if (action === "run" && request.method === "POST") return json(await runOnSamples(env, g, a, c, body));
    if (action === "submit" && request.method === "POST") return json(await submit(env, g, a, c, body));
    if (action === "explain" && request.method === "POST") return json(await explainStart(env, g, a, c));
    if (action === "answer" && request.method === "POST") return json(await explainAnswer(env, g, a, c, body));
  } catch (e) {
    console.error("editor", e);
    const msg = String((e as Error)?.message ?? e);
    if (/no such (table|column)/i.test(msg)) return json({ error: t(g.lang, "err.db_update").replace(/\*\*/g, "") }, 500);
    return json({ error: e instanceof RunnerUnavailable ? t(g.lang, "judge.unavailable").replace(/\*\*/g, "") : "Something went wrong: " + msg.slice(0, 200) }, 500);
  }
  return json({ error: "not found" }, 404);
}

async function editorData(env: Env, g: GuildRow, a: AttemptRow, c: ChallengeRow) {
  const L = g.lang;
  const p = await findPlayer(env, g.id, a.discord_id);
  const lang = codeLangFor(g, p, a);
  const sig = parseSignature(c.signature);
  const samples = (await loadTests(env, c)).filter((x) => x.sample).map((x) => ({ input: x.input ?? "", expected: x.expected }));
  const langs = (Object.keys(LANGS) as CodeLang[]).map((k) => ({
    id: k, label: LANGS[k].label, starter: starterFor(c, k, L), header: sig ? signatureLine(sig, k) : null,
  }));
  return {
    ui: L, title: c.title, statement: c.question ?? "", difficulty: c.difficulty, hint: hintPlain(c, a.used_hint || 0),
    fn: sig ? { doc: (L === "fr" ? sig.doc?.fr : sig.doc?.en) ?? sig.doc?.en ?? "", examples: samples.map((s) => sampleCall(sig, s.input, s.expected)).filter(Boolean) } : null,
    samples, langs, lang, timeLimit: c.time_limit ?? 2,
    status: a.status, triesLeft: a.origin === "duel" || a.origin === "exam" ? null : Math.max(0, RULES.writeMaxTries - a.tries),
    examNote: a.origin === "exam" ? t(L, a.tries ? "exam.submitted" : "exam.editor", { n: a.tries }).replace(/\*\*/g, "") : null,
    code: a.answer_given && a.status === "pending" ? a.answer_given : null, codeLang: a.lang,
    result: a.result && a.origin !== "exam" ? JSON.parse(a.result) : null, feedback: a.origin === "exam" ? null : a.feedback, points: a.points, held: a.held ?? 0,
    explain: explainForClient(a), origin: a.origin,
  };
}

function explainForClient(a: AttemptRow) {
  const st = explainState(a);
  if (!st) return null;
  return { questions: st.questions, deadline: st.deadline, now: now(), done: st.score !== undefined, score: st.score, awarded: st.awarded, feedback: st.feedback };
}

async function runOnSamples(env: Env, g: GuildRow, a: AttemptRow, c: ChallengeRow, b: any) {
  const lang = isCodeLang(b.lang) ? b.lang : "python";
  const code = String(b.code ?? "").slice(0, 20000);
  if (!code.trim()) return { error: t(g.lang, "judge.empty") };
  if ((a.runs ?? 0) >= MAX_RUNS) return { error: g.lang === "fr" ? `Tu as utilisé tes ${MAX_RUNS} exécutions pour ce défi.` : `You've used your ${MAX_RUNS} runs for this challenge.` };
  await run(env, "UPDATE attempts SET runs = runs + 1 WHERE id = ?", a.id);
  const samples = (await loadTests(env, c)).filter((x) => x.sample);
  const res = await runSamples(env, lang, code, samples.map((s) => ({ input: s.input ?? "" })), c.time_limit ?? 2);
  if (res.compile) return { compile: res.compile, runsLeft: MAX_RUNS - (a.runs ?? 0) - 1 };
  return {
    runsLeft: MAX_RUNS - (a.runs ?? 0) - 1,
    rows: samples.map((s, i) => {
      const r = res.rows[i];
      const out = r?.output ?? "";
      return { input: s.input, expected: s.expected, output: out, status: r ? r.status : "tle", time: r?.time ?? 0, error: r?.error ?? "", ok: !!r && r.status === "ok" && out.split(/\s+/).filter(Boolean).join(" ") === s.expected };
    }),
  };
}

async function submit(env: Env, g: GuildRow, a: AttemptRow, c: ChallengeRow, b: any) {
  if (a.status !== "pending") return { error: t(g.lang, "res.already"), ...(await editorData(env, g, a, c)) };
  const lang = isCodeLang(b.lang) ? b.lang : "python";
  const code = String(b.code ?? "").slice(0, 20000);
  if (!code.trim()) return { error: t(g.lang, "judge.empty") };
  if (a.origin === "session" || a.origin === "exam") {
    const s = await one<{ ends_at: number }>(env, "SELECT ends_at FROM sessions WHERE id = ?", a.ref);
    if (s && now() > s.ends_at + 30) return { error: g.lang === "fr" ? "La séance est terminée." : "The session is over." };
  }
  const log = sanitizeLog(b.log);
  await submitCode(env, g, a, c, code, lang, log, "editor");
  const fresh = (await getAttempt(env, a.id))!;
  return { submitted: true, ...(await editorData(env, g, fresh, c)) };
}

function sanitizeLog(raw: any): EditorLog | null {
  if (!raw || !Array.isArray(raw.changes)) return null;
  return {
    changes: raw.changes.slice(0, 30000).map((x: any) => [Number(x?.[0]) || 0, Number(x?.[1]) || 0, Number(x?.[2]) || 0, String(x?.[3] ?? "").slice(0, 20000), String(x?.[4] ?? "")]),
    focus: Array.isArray(raw.focus) ? raw.focus.slice(0, 5000).map((x: any) => [Number(x?.[0]) || 0, x?.[1] === "blur" ? "blur" : "focus"]) : [],
    pastes: Math.max(0, Math.min(1000, Number(raw.pastes) || 0)),
    openMs: Math.max(0, Number(raw.openMs) || 0),
  };
}

async function explainStart(env: Env, g: GuildRow, a: AttemptRow, c: ChallengeRow) {
  const st = await startExplain(env, g, a, c);
  const fresh = (await getAttempt(env, a.id))!;
  if (st === "none") return { none: true, ...(await editorData(env, g, fresh, c)) };
  return await editorData(env, g, fresh, c);
}

async function explainAnswer(env: Env, g: GuildRow, a: AttemptRow, c: ChallengeRow, b: any) {
  const answers = Array.isArray(b.answers) ? b.answers.map((x: unknown) => String(x ?? "").slice(0, 1000)) : [];
  await answerExplain(env, g, a, c, answers);
  return await editorData(env, g, (await getAttempt(env, a.id))!, c);
}

export const EXPLAIN_LIMIT = EXPLAIN_SECONDS;

// =================================================================== page
const EDITOR_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>ClassBot · Code editor</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
<style>
:root { --bg:#f4f7fc; --surface:#fff; --ink:#0f1d3a; --soft:#4a5878; --faint:#8391ad; --line:#e3e9f4; --blue:#2563eb; --blue50:#eff5ff; --blue100:#dbe7ff; --up:#059669; --upbg:#e7f8f1; --down:#dc2626; --downbg:#fdeeee; --warn:#b45309; --warnbg:#fff6e5; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { font: 15px/1.55 Inter, system-ui, sans-serif; color: var(--ink); background: var(--bg); }
header { display: flex; align-items: center; gap: 14px; padding: 10px 18px; background: var(--surface); border-bottom: 1px solid var(--line); }
header .logo { width: 30px; height: 30px; border-radius: 8px; background: linear-gradient(135deg, #2563eb, #6366f1); color: #fff; display: grid; place-items: center; font-weight: 800; }
header h1 { font-size: 17px; margin: 0; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chip { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: var(--blue50); color: var(--blue); white-space: nowrap; }
.chip.easy { background: var(--upbg); color: var(--up); } .chip.medium { background: var(--warnbg); color: var(--warn); } .chip.hard { background: var(--downbg); color: var(--down); }
#timer { font: 600 14px "JetBrains Mono", monospace; color: var(--soft); }
main { display: grid; grid-template-columns: minmax(320px, 42%) minmax(0, 1fr); gap: 0; height: calc(100% - 52px); }
.left { overflow: auto; padding: 22px 26px 40px; background: var(--surface); border-right: 1px solid var(--line); user-select: none; -webkit-user-select: none; }
.left h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: var(--faint); margin: 22px 0 8px; }
.statement p { margin: 0 0 10px; }
code, pre { font-family: "JetBrains Mono", monospace; font-size: 13px; }
:not(pre) > code { background: var(--blue50); padding: 1px 5px; border-radius: 5px; }
pre { background: #0f172a; color: #e2e8f0; padding: 12px 14px; border-radius: 10px; overflow: auto; margin: 6px 0 12px; }
.task { background: var(--blue50); border: 1px solid var(--blue100); border-radius: 12px; padding: 14px 16px; margin-top: 16px; }
.task b.h { display: block; margin-bottom: 6px; }
.right { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.toolbar { display: flex; gap: 10px; align-items: center; padding: 10px 14px; background: var(--surface); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.toolbar select { font: inherit; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: #fff; }
.spacer { flex: 1; }
button { font: inherit; font-weight: 600; border-radius: 9px; border: 1px solid var(--line); background: #fff; color: var(--ink); padding: 8px 16px; cursor: pointer; }
button.primary { background: var(--blue); color: #fff; border-color: var(--blue); }
button:disabled { opacity: .55; cursor: default; }
.editor-wrap { flex: 1; min-height: 0; position: relative; }
.CodeMirror { height: 100%; font: 14px/1.5 "JetBrains Mono", monospace; }
.CodeMirror-gutters { background: #f8fafe; border-right: 1px solid var(--line); }
.out { max-height: 42%; overflow: auto; border-top: 1px solid var(--line); background: var(--surface); padding: 14px 18px; }
.out:empty { display: none; }
.verdict { font-weight: 700; font-size: 16px; margin-bottom: 6px; }
.ok { color: var(--up); } .bad { color: var(--down); } .muted { color: var(--faint); font-size: 13px; }
.sample { border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; margin: 8px 0; }
.sample pre { margin: 4px 0; }
.card { border: 1px solid var(--blue100); background: var(--blue50); border-radius: 12px; padding: 14px 16px; margin-top: 12px; }
.card textarea { width: 100%; min-height: 70px; font: inherit; border: 1px solid var(--line); border-radius: 8px; padding: 8px; margin: 4px 0 10px; }
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: #0f1d3a; color: #fff; padding: 10px 18px; border-radius: 10px; font-weight: 600; opacity: 0; transition: opacity .2s; pointer-events: none; z-index: 10; }
.toast.on { opacity: 1; }
.notice { padding: 10px 14px; background: var(--warnbg); border-radius: 10px; margin: 10px 0; font-size: 14px; }
.gone { text-align: center; padding: 80px 20px; }
@media (max-width: 860px) { main { grid-template-columns: 1fr; height: auto; } .left { max-height: none; } .right { height: 80vh; } }
</style>
</head>
<body>
<header><span class="logo">C</span><h1 id="title">…</h1><span class="chip" id="diff"></span><span class="chip" id="tries"></span><span id="timer">00:00</span></header>
<main id="main">
  <section class="left" id="left"><p class="muted">Loading…</p></section>
  <section class="right">
    <div class="toolbar">
      <select id="lang" aria-label="Language"></select>
      <span class="muted" id="note"></span>
      <span class="spacer"></span>
      <button id="reset" title="Start again from the template">↺</button>
      <button id="run">▶ Run samples</button>
      <button id="submit" class="primary">Submit</button>
    </div>
    <div class="editor-wrap"><textarea id="code"></textarea></div>
    <div class="out" id="out"></div>
  </section>
</main>
<div class="toast" id="toast"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/clike/clike.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/xml/xml.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/htmlmixed/htmlmixed.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/php/php.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/edit/matchbrackets.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/edit/closebrackets.min.js"></script>
<script>
const T = {
  en: { run: "▶ Run samples", submit: "Submit", noPaste: "Pasting is disabled: type your code", noCopy: "Copying the statement is disabled", task: "Your task", fnTask: "Complete the function below. It receives the input and must RETURN the answer: reading the input and printing are already done at the bottom of the template.", progTask: "Write a complete program: read the input exactly as described in Input, and print only the answer (no messages like \"Enter a number\").", examples: "Examples", sample: "Sample", input: "Input", expected: "Expected", got: "Your output", allPass: "All samples pass. Submit to run the hidden tests.", samplesFail: "Some samples fail", running: "Running…", judging: "Running your code on the hidden tests…", left: "tries left", runsLeft: "runs left", accepted: "Accepted!", hint: "Hint", explainTitle: "🧠 Explain your code", explainIntro: (p) => "Answer 2 short questions about YOUR code to get the other " + p + " points. You have 3 minutes once you start.", explainStart: "Start (3 min)", explainSend: "Send my answers", explainDone: (s, p) => "Explanation score: " + s + "% · +" + p + " pts", reset: "Start again from the template? Your current code will be replaced.", done: "This challenge is finished.", tle: "Too slow", re: "Runtime error", compile: "Doesn't compile", points: "points", wrong: "Wrong answer", unavailable: "Judge unavailable", back: "You can close this page and go back to Discord.", away: "You left the page: that's recorded for your teacher.", note: "Pasting is off · leaving the page is recorded" },
  fr: { run: "▶ Tester les exemples", submit: "Soumettre", noPaste: "Coller est désactivé : tape ton code", noCopy: "Copier l'énoncé est désactivé", task: "Ta mission", fnTask: "Complète la fonction ci-dessous. Elle reçoit l'entrée et doit RETOURNER la réponse : la lecture de l'entrée et l'affichage sont déjà faits en bas du modèle.", progTask: "Écris un programme complet : lis l'entrée exactement comme décrit dans Entrée, et affiche uniquement la réponse (pas de message comme « Entrez un nombre »).", examples: "Exemples", sample: "Exemple", input: "Entrée", expected: "Attendu", got: "Ta sortie", allPass: "Tous les exemples passent. Soumets pour lancer les tests cachés.", samplesFail: "Certains exemples échouent", running: "Exécution…", judging: "Exécution de ton code sur les tests cachés…", left: "essais restants", runsLeft: "exécutions restantes", accepted: "Accepté !", hint: "Indice", explainTitle: "🧠 Explique ton code", explainIntro: (p) => "Réponds à 2 courtes questions sur TON code pour gagner les " + p + " autres points. Tu as 3 minutes une fois commencé.", explainStart: "Commencer (3 min)", explainSend: "Envoyer mes réponses", explainDone: (s, p) => "Explication : " + s + " % · +" + p + " pts", reset: "Recommencer depuis le modèle ? Ton code actuel sera remplacé.", done: "Ce défi est terminé.", tle: "Trop lent", re: "Erreur d'exécution", compile: "Ne compile pas", points: "points", wrong: "Mauvaise réponse", unavailable: "Correcteur indisponible", back: "Tu peux fermer cette page et revenir sur Discord.", away: "Tu as quitté la page : c'est enregistré pour ton enseignant.", note: "Coller est désactivé · quitter la page est enregistré" },
};
const token = location.pathname.split("/")[2];
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const md = (s) => esc(s).replace(/\x60\x60\x60[a-z]*\n?([\s\S]*?)\x60\x60\x60/g, (_, c) => "<pre>" + c + "</pre>").replace(/\x60([^\x60\n]+)\x60/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").split(/\n{2,}/).map((p) => p.startsWith("<pre>") ? p : "<p>" + p.replace(/\n/g, "<br>") + "</p>").join("");
let D = null, L = T.en, cm = null, busy = false;
const t0 = Date.now();
const log = { changes: [], focus: [], pastes: 0, openMs: 0 };
const ms = () => Date.now() - t0;
function toast(m) { const e = $("#toast"); e.textContent = m; e.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove("on"), 2600); }
async function call(action, body) {
  const r = await fetch("/code/" + token + "/" + action, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({ error: "Network error" }));
  if (j.error && !j.title) throw new Error(j.error);
  return j;
}
const MODES = { python: "python", javascript: "javascript", php: "application/x-httpd-php", java: "text/x-java", cpp: "text/x-c++src", c: "text/x-csrc" };
const draftKey = () => "classbot.code." + token.split(".")[0] + "." + $("#lang").value;
function saveDraft() { try { localStorage.setItem(draftKey(), cm.getValue()); } catch {} }
function loadDraft(lang) { try { return localStorage.getItem("classbot.code." + token.split(".")[0] + "." + lang); } catch { return null; } }

function renderLeft() {
  const fn = D.fn;
  const lang = D.langs.find((l) => l.id === $("#lang").value);
  let h = "<div class='statement'>" + md(D.statement) + "</div>";
  h += "<div class='task'><b class='h'>✍️ " + L.task + "</b>" + (fn ? L.fnTask + "<pre>" + esc(lang.header || "") + "</pre>" + md(fn.doc) : L.progTask) + "</div>";
  if (fn && fn.examples.length) h += "<h2>" + L.examples + "</h2><pre>" + fn.examples.map((e) => esc(e.call) + "  →  " + esc(e.result)).join("\n") + "</pre>";
  else D.samples.forEach((s, i) => { h += "<h2>" + L.sample + " " + (i + 1) + "</h2><div class='muted'>" + L.input + "</div><pre>" + esc(s.input) + "</pre><div class='muted'>" + L.expected + "</div><pre>" + esc(s.expected) + "</pre>"; });
  if (D.hint) h += "<div class='notice'>💡 <b>" + L.hint + ":</b> " + md(D.hint) + "</div>";
  $("#left").innerHTML = h;
}
function renderTop() {
  $("#title").textContent = D.title;
  $("#diff").textContent = D.difficulty; $("#diff").className = "chip " + D.difficulty;
  $("#tries").textContent = D.triesLeft == null ? "∞" : D.triesLeft + " " + L.left;
  $("#tries").hidden = D.status !== "pending";
}
function verdictName(r) { return r.verdict === "accepted" ? L.accepted : r.verdict === "tle" ? L.tle : r.verdict === "runtime" ? L.re : r.verdict === "compile" ? L.compile : r.verdict === "unavailable" ? L.unavailable : L.wrong; }
function renderResult(err) {
  const out = $("#out");
  let h = err ? "<div class='notice'>" + esc(err) + "</div>" : "";
  if (D.examNote) h += "<div class='notice'>📥 " + esc(D.examNote) + "</div>";
  const r = D.result;
  if (r) {
    const ok = r.verdict === "accepted";
    h += "<div class='verdict " + (ok ? "ok" : "bad") + "'>" + (ok ? "✅ " : "❌ ") + verdictName(r) + " · " + r.passed + "/" + r.total + "</div>";
    if (r.error) h += "<pre>" + esc(r.error) + "</pre>";
    if (r.failed && r.failed.error) h += "<pre>" + esc(r.failed.error) + "</pre>";
    if (r.failed && r.failed.sample && r.failed.expected != null) h += "<div class='muted'>" + L.expected + ": <code>" + esc(r.failed.expected) + "</code> · " + L.got + ": <code>" + esc(r.failed.got || "∅") + "</code></div>";
    if (D.feedback) h += "<p>🧠 " + esc(D.feedback) + "</p>";
    if (D.status === "solved") h += "<p><b>+" + D.points + " " + L.points + "</b></p>";
  }
  if (D.status !== "pending") {
    h += explainBlock();
    if (!D.held || (D.explain && D.explain.done)) h += "<p class='muted'>" + L.back + "</p>";
  }
  out.innerHTML = h;
  wireExplain();
}
function explainBlock() {
  const e = D.explain;
  if (e && e.done) return "<div class='card'><b>" + L.explainTitle + "</b><p>" + L.explainDone(Math.round((e.score || 0) * 100), e.awarded || 0) + "</p>" + (e.feedback ? "<p class='muted'>" + esc(e.feedback) + "</p>" : "") + "</div>";
  if (!D.held) return "";
  if (!e) return "<div class='card'><b>" + L.explainTitle + "</b><p>" + L.explainIntro(D.held) + "</p><button class='primary' id='ex-start'>" + L.explainStart + "</button></div>";
  return "<div class='card'><b>" + L.explainTitle + "</b> <span id='ex-left' class='muted'></span>" + e.questions.map((q, i) => "<p><b>" + (i + 1) + ".</b> " + md(q) + "</p><textarea data-a='" + i + "'></textarea>").join("") + "<button class='primary' id='ex-send'>" + L.explainSend + "</button></div>";
}
function wireExplain() {
  const st = $("#ex-start");
  if (st) st.onclick = async () => { st.disabled = true; try { D = await call("explain", {}); renderAll(); } catch (e) { toast(e.message); st.disabled = false; } };
  const send = $("#ex-send");
  if (send) {
    document.querySelectorAll("[data-a]").forEach((ta) => { ta.addEventListener("paste", (e) => { e.preventDefault(); log.pastes++; toast(L.noPaste); }); ta.addEventListener("drop", (e) => e.preventDefault()); });
    const end = Date.now() + (D.explain.deadline - D.explain.now) * 1000;
    const tick = () => { const s = Math.max(0, Math.round((end - Date.now()) / 1000)); const el = $("#ex-left"); if (el) el.textContent = "⏱ " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); if (s > 0 && el) setTimeout(tick, 500); };
    tick();
    send.onclick = async () => { send.disabled = true; try { D = await call("answer", { answers: [...document.querySelectorAll("[data-a]")].map((x) => x.value) }); renderAll(); } catch (e) { toast(e.message); send.disabled = false; } };
  }
}
function renderAll() { renderTop(); renderLeft(); renderResult(); lockIfDone(); }
function lockIfDone() {
  const done = D.status !== "pending";
  cm.setOption("readOnly", done ? "nocursor" : false);
  $("#run").disabled = $("#submit").disabled = $("#reset").disabled = done;
  $("#lang").disabled = done;
}

async function boot() {
  try { D = await call("data"); } catch (e) { document.body.innerHTML = "<div class='gone'><h2>😕</h2><p>" + esc(e.message) + "</p></div>"; return; }
  L = T[D.ui] || T.en;
  document.documentElement.lang = D.ui;
  $("#run").textContent = L.run; $("#submit").textContent = L.submit; $("#note").textContent = L.note;
  $("#lang").innerHTML = D.langs.map((l) => "<option value='" + l.id + "'>" + esc(l.label) + "</option>").join("");
  $("#lang").value = D.codeLang && D.code ? D.codeLang : D.lang;
  cm = CodeMirror.fromTextArea($("#code"), { lineNumbers: true, indentUnit: 4, tabSize: 4, indentWithTabs: false, matchBrackets: true, autoCloseBrackets: true, mode: MODES[$("#lang").value], dragDrop: false, extraKeys: { Tab: (c) => c.replaceSelection("    ") } });
  const startCode = D.code || loadDraft($("#lang").value) || D.langs.find((l) => l.id === $("#lang").value).starter;
  cm.setValue(startCode);
  cm.on("beforeChange", (c, ch) => {
    if (ch.origin === "paste" || ch.origin === "drop") { ch.cancel(); log.pastes++; toast(L.noPaste); }
  });
  cm.on("change", (c, ch) => {
    if (ch.origin === "setValue") { log.changes.push([ms(), 0, 0, c.getValue(), "setValue"]); return; }
    log.changes.push([ms(), c.indexFromPos(ch.from), ch.removed.join("\n").length, ch.text.join("\n"), ch.origin || ""]);
    saveDraft();
  });
  log.changes.push([0, 0, 0, startCode, "setValue"]);
  $("#lang").onchange = () => {
    const l = $("#lang").value;
    cm.setOption("mode", MODES[l]);
    cm.setValue(loadDraft(l) || D.langs.find((x) => x.id === l).starter);
    renderLeft();
  };
  $("#reset").onclick = () => { if (confirm(L.reset)) cm.setValue(D.langs.find((x) => x.id === $("#lang").value).starter); };
  $("#run").onclick = runSamples;
  $("#submit").onclick = submitCode;
  document.addEventListener("copy", (e) => { if (!e.target.closest || !e.target.closest(".CodeMirror")) { e.preventDefault(); toast(L.noCopy); } });
  document.addEventListener("contextmenu", (e) => { if (e.target.closest && e.target.closest(".left")) e.preventDefault(); });
  window.addEventListener("blur", () => log.focus.push([ms(), "blur"]));
  window.addEventListener("focus", () => log.focus.push([ms(), "focus"]));
  document.addEventListener("visibilitychange", () => log.focus.push([ms(), document.hidden ? "blur" : "focus"]));
  setInterval(() => { const s = Math.floor(ms() / 1000); $("#timer").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }, 1000);
  renderAll();
  cm.focus();
}
async function runSamples() {
  if (busy) return; busy = true; $("#run").disabled = true;
  $("#out").innerHTML = "<p class='muted'>" + L.running + "</p>";
  try {
    const r = await call("run", { code: cm.getValue(), lang: $("#lang").value });
    if (r.error) throw new Error(r.error);
    let h = "";
    if (r.compile) h = "<div class='verdict bad'>❌ " + L.compile + "</div><pre>" + esc(r.compile) + "</pre>";
    else {
      const all = r.rows.every((x) => x.ok);
      h = "<div class='verdict " + (all ? "ok" : "bad") + "'>" + (all ? "✅ " + L.allPass : "❌ " + L.samplesFail) + "</div>";
      r.rows.forEach((x, i) => { h += "<div class='sample'><b>" + (x.ok ? "✅" : "❌") + " " + L.sample + " " + (i + 1) + "</b> <span class='muted'>" + x.time.toFixed(2) + " s" + (x.status === "tle" ? " · " + L.tle : x.status === "re" ? " · " + L.re : "") + "</span>" + (x.ok ? "" : "<div class='muted'>" + L.expected + "</div><pre>" + esc(x.expected) + "</pre><div class='muted'>" + L.got + "</div><pre>" + esc(x.output || "∅") + "</pre>" + (x.error ? "<pre>" + esc(x.error) + "</pre>" : "")) + "</div>"; });
    }
    h += "<p class='muted'>" + r.runsLeft + " " + L.runsLeft + "</p>";
    $("#out").innerHTML = h;
  } catch (e) { $("#out").innerHTML = "<div class='notice'>" + esc(e.message) + "</div>"; }
  busy = false; $("#run").disabled = false;
}
async function submitCode() {
  if (busy) return; busy = true; $("#submit").disabled = $("#run").disabled = true;
  $("#out").innerHTML = "<p class='muted'>" + L.judging + "</p>";
  log.openMs = ms();
  try {
    const r = await call("submit", { code: cm.getValue(), lang: $("#lang").value, log });
    D = r;
    renderAll();
    if (r.error) renderResult(r.error);
  } catch (e) { $("#out").innerHTML = "<div class='notice'>" + esc(e.message) + "</div>"; }
  busy = false;
  if (D.status === "pending") $("#submit").disabled = $("#run").disabled = false;
}
boot();
</script>
</body>
</html>`;
