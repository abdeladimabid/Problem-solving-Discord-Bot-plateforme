// The learner's page of a « mise en situation »: /mes/<token> (their personal link, by DM)
//   GET  /mes/<t>          the page            GET  /mes/<t>/info    title, when it starts and ends (no questions)
//   POST /mes/<t>/start    the paper and what is already saved (a reload or another device continues)
//   POST /mes/<t>/save     autosave: an answer, the time per item, the typing record (also the "still here" signal)
//   POST /mes/<t>/event    leaving the page and coming back, pastes, runs in the browser (allowed: only written down)
//   POST /mes/<t>/run      the checks of a situation (PHP and Node.js run here; HTML/CSS/JS and SQL ran in the page)
//   POST /mes/<t>/check    "Vérifier mon code": the category of the problem only (3 per situation)
//   POST /mes/<t>/submit   hand in
//   POST /mes/<t>/translate  the situation / the QCM in Arabic, French or English (Google Translate, the AI as a backup)
// The code runs in a sandboxed frame (scripts only, its own empty origin, a CSP without any network): no cookie, no
// access to this page, the dashboard or the network. The solutions and the expected values never come to the page.
import type { Ctx, Env } from "../shared/types.ts";
import { forClass } from "../shared/aictx.ts";
import { TR_LANGS, translateTexts } from "../shared/webtranslate.ts";
import type { TrLang } from "../shared/webtranslate.ts";
import { MiseError, aiCheck, learnerEvent, learnerInfo, readTakerToken, runItem, saveItem, startTaker, submitTaker } from "../shared/misesdb.ts";

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function handleMise(request: Request, env: Env, ctx: Ctx, token: string, action: string | undefined): Promise<Response> {
  if (!action && request.method === "GET") return new Response(PAGE, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "x-robots-tag": "noindex", "x-content-type-options": "nosniff" } });
  const takerId = token === "expired" ? null : await readTakerToken(env, token);
  if (!takerId) return json({ error: "expired" }, 404);
  const tk = await env.DB.prepare("SELECT guild_id FROM mise_takers WHERE id = ?").bind(takerId).first<{ guild_id: string }>().catch(() => null);
  if (!tk) return json({ error: "expired" }, 404);
  env = forClass(env, tk.guild_id);   // the AI check uses this class's keys
  try {
    if (request.method === "GET" && action === "info") return json(await learnerInfo(env, takerId));
    if (request.method !== "POST") return json({ error: "method" }, 405);
    let b: any = {};
    try { b = await request.json(); } catch { b = {}; }
    if (action === "start") return json(await startTaker(env, takerId));
    if (action === "translate") {
      const to = String(b.to ?? "") as TrLang;
      if (!TR_LANGS.includes(to) || !Array.isArray(b.texts)) return json({ error: "bad" }, 400);
      return json({ texts: await translateTexts(env, b.texts.map(String), to) });
    }
    if (action === "save") return json(await saveItem(env, takerId, b));
    if (action === "event") return json(await learnerEvent(env, takerId, b));
    if (action === "run") return json(await runItem(env, takerId, b));
    if (action === "check") return json(await aiCheck(env, takerId, b));
    if (action === "submit") { await submitTaker(env, takerId, ctx); return json({ ok: true }); }
  } catch (e) {
    if (e instanceof MiseError) return json({ error: e.message }, e.status === 404 ? 404 : 409);
    throw e;
  }
  return json({ error: "unknown" }, 404);
}

// =================================================================== the page (French)
// No template expression and no backtick in the page's script: it's a raw string.
const CM = "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16";
const PAGE = String.raw`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Mise en situation · ClassBot</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="` + CM + String.raw`/codemirror.min.css">
<link rel="stylesheet" href="` + CM + String.raw`/theme/material-darker.min.css">
<style>
:root { --bg:#f4f7fc; --card:#fff; --ink:#0f1d3a; --soft:#46546f; --faint:#6b7894; --line:#dfe6f2; --blue:#2563eb; --blue-ink:#1d4ed8; --blue50:#eef4ff; --blue100:#dbe7ff;
  --good:#047857; --goodbg:#e6f7f0; --bad:#b91c1c; --badbg:#fdeeee; --warn:#92400e; --warnbg:#fff4e0; --code:#f8fafe; --shadow:0 4px 18px #0f1d3a10; color-scheme: light; }
:root[data-theme="dark"] { --bg:#0b1222; --card:#111a2e; --ink:#e7edf8; --soft:#b3bfd6; --faint:#8a97b3; --line:#22304d; --blue:#5b8cff; --blue-ink:#93b4ff; --blue50:#16223d; --blue100:#1e2f55;
  --good:#34d399; --goodbg:#0d2b22; --bad:#f87171; --badbg:#3a1518; --warn:#fbbf24; --warnbg:#33260b; --code:#0f1626; --shadow:none; color-scheme: dark; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.trbar { margin-left: auto; display: inline-flex; gap: 4px; } .trbar button { border: 1px solid var(--line); background: var(--card); color: var(--soft); border-radius: 8px; padding: 2px 9px; font: 600 12px Inter, system-ui, sans-serif; cursor: pointer; }
.trbar button.on { background: var(--blue); border-color: var(--blue); color: #fff; }
.trans { margin: 8px 0 0; padding: 9px 12px; border-radius: 10px; background: var(--blue50); color: var(--ink); font-size: 14px; line-height: 1.6; }
ol.trans { padding-left: 32px; } .trans.warn { background: var(--warnbg); color: var(--warn); }
.trc { display: block; font-size: 14px; color: var(--soft); margin-top: 3px; } .trc:empty { display: none; }
.sdet > summary { list-style: none; cursor: pointer; display: flex; align-items: baseline; gap: 10px; } .sdet > summary::-webkit-details-marker { display: none; }
.sdet > summary h2 { margin: 0; } .sdet > summary::before { content: "▾"; color: var(--faint); } .sdet:not([open]) > summary::before { content: "▸"; }
.sdet[open] > summary { margin-bottom: 10px; } .sdet-h { margin-left: auto; }
html, body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
button { font: inherit; }
:focus-visible { outline: 3px solid var(--blue); outline-offset: 2px; }
.top { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 12px; padding: 10px 18px; background: var(--card); border-bottom: 1px solid var(--line); }
.logo { width: 32px; height: 32px; border-radius: 9px; background: linear-gradient(135deg, #2563eb, #6366f1); color: #fff; display: grid; place-items: center; font-weight: 800; flex: none; }
.ttl { min-width: 0; flex: 1; } .ttl b { display: block; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .ttl small { color: var(--faint); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.timer { font: 600 15px "JetBrains Mono", monospace; padding: 5px 11px; border-radius: 9px; border: 1px solid var(--line); background: var(--bg); }
.timer.low { color: var(--bad); border-color: var(--bad); }
.saved { font-size: 13px; color: var(--faint); white-space: nowrap; }
.btn { display: inline-flex; gap: 7px; align-items: center; justify-content: center; border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 10px; padding: 8px 15px; font-weight: 600; cursor: pointer; min-height: 40px; }
.btn:hover:not(:disabled) { border-color: var(--blue); }
.btn.primary { background: var(--blue); border-color: var(--blue); color: #fff; }
.btn.primary:hover:not(:disabled) { filter: brightness(1.08); }
.btn.good { background: var(--good); border-color: var(--good); color: #fff; }
.btn:disabled { opacity: .55; cursor: default; }
.btn.icon { padding: 8px 10px; }
kbd { font: 11px "JetBrains Mono", monospace; padding: 1px 5px; border-radius: 5px; border: 1px solid currentColor; opacity: .75; }
.prog { position: sticky; top: 57px; z-index: 19; background: var(--bg); padding: 10px 18px 8px; border-bottom: 1px solid var(--line); }
.prog-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pi { min-width: 46px; height: 36px; padding: 0 9px; border-radius: 9px; border: 1px solid var(--line); background: var(--card); color: var(--soft); font-weight: 700; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.pi i { width: 8px; height: 8px; border-radius: 50%; background: var(--line); flex: none; }
.pi.prog-on i { background: var(--warn); } .pi.prog-done i { background: var(--good); }
.pi.prog-done { color: var(--good); } .pi.cur { outline: 2px solid var(--blue); color: var(--ink); border-color: var(--blue); }
.pi-sep { width: 1px; height: 24px; background: var(--line); margin: 0 4px; }
.bar { height: 5px; border-radius: 9px; background: var(--line); margin-top: 8px; overflow: hidden; } .bar span { display: block; height: 100%; background: var(--good); transition: width .3s; }
.prog-legend { display: flex; gap: 14px; font-size: 12px; color: var(--faint); margin-left: auto; } .prog-legend span { display: inline-flex; align-items: center; gap: 5px; } .prog-legend i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
main { max-width: 1500px; margin: 0 auto; padding: 18px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; box-shadow: var(--shadow); margin-bottom: 14px; }
.card h2 { font-size: 12.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--faint); margin: 0 0 10px; }
h1 { font-size: 22px; margin: 4px 0 8px; letter-spacing: -.01em; }
.sit { display: grid; grid-template-columns: minmax(340px, 5fr) minmax(0, 7fr); gap: 16px; align-items: start; }
.meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--soft); }
.kicker { font-weight: 700; color: var(--blue-ink); }
.diff { display: inline-flex; align-items: center; gap: 3px; } .diff i { width: 9px; height: 9px; border-radius: 50%; background: var(--line); } .diff i.on { background: var(--blue); }
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; } .chip { font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 99px; background: var(--blue50); color: var(--blue-ink); }
.ctx { margin: 0; color: var(--ink); }
.qs { margin: 0; padding-left: 22px; } .qs li { margin: 0 0 8px; padding-left: 4px; } .qs li::marker { font-weight: 700; color: var(--blue-ink); }
.ftabs { display: flex; gap: 4px; flex-wrap: wrap; } .ftab { border: 1px solid var(--line); background: var(--bg); color: var(--soft); border-radius: 8px 8px 0 0; padding: 5px 12px; font: 600 13px "JetBrains Mono", monospace; cursor: pointer; border-bottom: 0; }
.ftab[aria-selected="true"] { background: var(--code); color: var(--ink); border-color: var(--blue100); box-shadow: inset 0 2px 0 var(--blue); }
.cmbox { border: 1px solid var(--line); border-radius: 0 10px 10px 10px; overflow: hidden; }
.CodeMirror { font: 14px/1.55 "JetBrains Mono", ui-monospace, monospace; height: auto; }
.starter .CodeMirror { background: var(--code); } .starter .CodeMirror-cursors { display: none; }
.editor .CodeMirror { height: 380px; }
.cm-s-default .CodeMirror-gutters { background: var(--code); border-right: 1px solid var(--line); }
.empty-file { padding: 12px 14px; color: var(--faint); font-size: 13px; background: var(--code); }
.etop { display: flex; align-items: flex-end; gap: 8px; } .spacer { flex: 1; }
.actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 12px; }
.left-n { font-size: 12px; font-weight: 700; padding: 1px 7px; border-radius: 99px; background: var(--blue50); color: var(--blue-ink); }
.otabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin: -4px 0 12px; flex-wrap: wrap; }
.otab { border: 0; background: none; padding: 8px 12px; color: var(--soft); font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; }
.otab[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--blue); }
.otab .n { font-size: 11px; padding: 0 6px; border-radius: 99px; background: var(--badbg); color: var(--bad); margin-left: 4px; }
.frame { width: 100%; height: 340px; border: 1px solid var(--line); border-radius: 10px; background: #fff; resize: vertical; display: block; }
.console { font: 13px/1.5 "JetBrains Mono", monospace; background: var(--code); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; min-height: 120px; max-height: 340px; overflow: auto; white-space: pre-wrap; word-break: break-word; margin: 0; }
.console .l-error { color: var(--bad); } .console .l-warn { color: var(--warn); } .console .l-info { color: var(--blue-ink); } .console .l-sys { color: var(--faint); font-style: italic; }
.checks { list-style: none; padding: 0; margin: 0; display: grid; gap: 7px; }
.checks li { display: flex; gap: 10px; align-items: flex-start; padding: 9px 12px; border-radius: 10px; background: var(--bg); border: 1px solid var(--line); }
.checks li b { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; flex: none; background: var(--line); color: var(--soft); }
.checks li.ok { background: var(--goodbg); border-color: transparent; } .checks li.ok b { background: var(--good); color: #fff; }
.checks li.ko { background: var(--badbg); border-color: transparent; } .checks li.ko b { background: var(--bad); color: #fff; }
.fb { display: grid; gap: 8px; } .fb .cat { padding: 10px 13px; border-radius: 10px; background: var(--warnbg); color: var(--warn); font-weight: 600; } .fb .cat.none { background: var(--goodbg); color: var(--good); }
.muted { color: var(--faint); } .small { font-size: 13px; }
.notice { padding: 10px 13px; border-radius: 10px; background: var(--warnbg); color: var(--warn); font-size: 14px; }
.sqltable { border-collapse: collapse; font: 13px "JetBrains Mono", monospace; margin-top: 6px; } .sqltable th, .sqltable td { border: 1px solid var(--line); padding: 4px 9px; text-align: left; } .sqltable th { background: var(--blue50); }
.qcm { max-width: 820px; margin: 0 auto; }
.qtext { font-size: 18px; margin: 4px 0 14px; white-space: pre-wrap; }
.choices { display: grid; gap: 10px; }
.choice { display: flex; gap: 12px; align-items: flex-start; border: 1.5px solid var(--line); border-radius: 12px; padding: 13px 15px; cursor: pointer; background: var(--card); font-size: 16px; }
.choice:hover { border-color: var(--blue); } .choice.on { border-color: var(--blue); background: var(--blue50); }
.choice input { margin-top: 4px; width: 18px; height: 18px; accent-color: var(--blue); flex: none; }
.choice .letter { font-weight: 800; color: var(--blue-ink); }
.navbtns { display: flex; justify-content: space-between; gap: 10px; margin: 6px 0 30px; }
.full { min-height: 80vh; display: grid; place-items: center; padding: 20px; } .full .card { max-width: 580px; text-align: center; padding: 30px; } .big { font-size: 46px; }
.rules { text-align: left; list-style: none; padding: 0; margin: 18px 0; display: grid; gap: 9px; } .rules li { display: flex; gap: 11px; background: var(--blue50); border-radius: 11px; padding: 11px 13px; }
.toast { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); background: #0f1d3a; color: #fff; padding: 10px 18px; border-radius: 10px; font-weight: 600; opacity: 0; transition: opacity .2s; pointer-events: none; z-index: 50; max-width: 90vw; }
.toast.on { opacity: 1; }
dialog { border: 1px solid var(--line); border-radius: 16px; background: var(--card); color: var(--ink); padding: 22px; max-width: 520px; width: calc(100% - 32px); box-shadow: 0 20px 60px #0f1d3a50; }
dialog::backdrop { background: #0b122299; }
dialog h2 { margin: 0 0 8px; font-size: 19px; } dialog ul { margin: 8px 0 14px; padding-left: 20px; } .dlg-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 1050px) { .sit { grid-template-columns: 1fr; } .editor .CodeMirror { height: 320px; } .prog { top: 57px; } .prog-legend { display: none; } }
@media (max-width: 560px) { .top { gap: 8px; padding: 8px 12px; } .saved { display: none; } main { padding: 12px; } .pi { min-width: 40px; padding: 0 7px; } #finish span { display: none; } }
</style>
</head>
<body>
<header class="top">
  <span class="logo" aria-hidden="true">C</span>
  <div class="ttl"><b id="title">Mise en situation</b><small id="sub"></small></div>
  <span class="timer" id="timer" hidden aria-live="off"></span>
  <span class="saved" id="saved" aria-live="polite"></span>
  <button class="btn icon" id="theme" type="button" aria-label="Changer de thème (clair / sombre)" title="Clair / sombre">🌓</button>
  <button class="btn good" id="finish" type="button" hidden>✓ <span>Terminer et envoyer</span></button>
</header>
<nav class="prog" id="prog" aria-label="Progression" hidden></nav>
<main id="main"><div class="full"><p class="muted">Chargement…</p></div></main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<dialog id="dlg"></dialog>
<script src="` + CM + String.raw`/codemirror.min.js"></script>
<script src="` + CM + String.raw`/mode/xml/xml.min.js"></script>
<script src="` + CM + String.raw`/mode/javascript/javascript.min.js"></script>
<script src="` + CM + String.raw`/mode/css/css.min.js"></script>
<script src="` + CM + String.raw`/mode/htmlmixed/htmlmixed.min.js"></script>
<script src="` + CM + String.raw`/mode/clike/clike.min.js"></script>
<script src="` + CM + String.raw`/mode/php/php.min.js"></script>
<script src="` + CM + String.raw`/mode/sql/sql.min.js"></script>
<script src="` + CM + String.raw`/addon/edit/matchbrackets.min.js"></script>
<script src="` + CM + String.raw`/addon/edit/closebrackets.min.js"></script>
<script>
(function () {
"use strict";
var BASE = "/mes/" + location.pathname.split("/")[2];
var KEY = "cb-mes:" + location.pathname.split("/")[2].split(".")[0];
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
var MODES = { html: "htmlmixed", css: "css", javascript: "javascript", php: "application/x-httpd-php", sql: "text/x-sql" };
var VISIT = Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, "x").padEnd(8, "x");
var T0 = Date.now();
var ms = function () { return Date.now() - T0; };

// ---------------------------------------------------------------- theme
function dark() { var t = store.get("cb-mes-theme"); return t ? t === "dark" : !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches); }
function applyTheme() {
  document.documentElement.dataset.theme = dark() ? "dark" : "light";
  CMS.forEach(function (c) { c.setOption("theme", dark() ? "material-darker" : "default"); });
}
var CMS = [];
$("#theme").onclick = function () { store.set("cb-mes-theme", dark() ? "light" : "dark"); applyTheme(); };
applyTheme();

// ---------------------------------------------------------------- server
function call(path, body) {
  return fetch(BASE + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: JSON.stringify(body).length < 60000 } : { cache: "no-store" })
    .then(function (r) { return r.json().catch(function () { return { error: "network" }; }); });
}
function toast(m) { var e = $("#toast"); e.textContent = m; e.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(function () { e.classList.remove("on"); }, 3200); }
function savedMsg(m) { $("#saved").textContent = m; }

// ---------------------------------------------------------------- state
var P = null, A = {}, SPENT = {}, CHECKS = {}, AI = {}, CUR = null, ORDER = [], ENDS = null, OFFSET = 0, NOPASTE = false, DONE = false;
// full screen rule (like an assessment): leaving it stops the session until the teacher lets them back
var LOCK = false, LOCKED = false, GRACE = 0, STARTED = false;
var FS_OK = !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
var LOGS = {}, DIRTY = {}, RAN = {}, LASTERR = {}, CONSOLE = {}, OUTTAB = {}, FILE = {}, SFILE = {}, DOCS = {}, VISITED = {};
// the starter code shown or folded (remembered on this device)
var STARTOPEN = store.get("cb-mes-start") !== "closed";
var ed = null, startEd = null, saveTimer = null, logTimer = null;
try { VISITED = JSON.parse(store.get(KEY + ":visited") || "{}") || {}; } catch (e) { VISITED = {}; }
var sit = function (id) { return P.situations.filter(function (s) { return s.id === id; })[0] || null; };
var qcm = function (id) { return P.qcm.filter(function (q) { return q.id === id; })[0] || null; };
var squash = function (s) { return String(s || "").replace(/\s+/g, ""); };
function changed(id) {
  var s = sit(id);
  if (s) return s.files.some(function (f) { var a = A[id] && A[id].files && A[id].files[f.name]; return a != null && squash(a) !== squash(f.starter); });
  return !!(A[id] && A[id].choice != null);
}
function stateOf(id) {
  if (id.charAt(0) === "q") return A[id] && A[id].choice != null ? "done" : VISITED[id] ? "on" : "";
  if (changed(id) && (CHECKS[id] || RAN[id] || !sit(id).checks.length)) return "done";
  return changed(id) || VISITED[id] ? "on" : "";
}
function label(id) { var i = P.situations.findIndex(function (s) { return s.id === id; }); return i >= 0 ? "Mise en situation " + (i + 1) : "QCM " + (P.qcm.findIndex(function (q) { return q.id === id; }) + 1); }
function shortLabel(id) { var i = P.situations.findIndex(function (s) { return s.id === id; }); return i >= 0 ? "S" + (i + 1) : "Q" + (P.qcm.findIndex(function (q) { return q.id === id; }) + 1); }

// ---------------------------------------------------------------- screens
function screen(html) { $("#prog").hidden = true; $("#finish").hidden = true; $("#main").innerHTML = '<div class="full"><div class="card">' + html + "</div></div>"; }
function fmtDate(u) { return new Date(u * 1000).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); }
function intro(info) {
  $("#title").textContent = info.title; $("#sub").textContent = info.metier || "";
  LOCK = !!info.lockScreen;
  if (info.status === "live" && info.taker === "locked") return lockedScreen(info.lockWhy);
  // full screen rule: the page opened again while working (a reload, another tab): the server stops the session
  if (info.status === "live" && info.taker === "active" && LOCK) return start();
  if (info.status === "submitted") return screen('<div class="big">🎉</div><h1>Copie envoyée</h1><p class="muted">Ton formateur te transmettra les résultats. Tu peux fermer cette page.</p>');
  if (info.status === "closed" || info.status === "draft") return screen('<div class="big">🔒</div><h1>Cette mise en situation est fermée</h1><p class="muted">Demande à ton formateur si tu penses que c’est une erreur.</p>');
  var rules = ["💻 <span>" + info.n.situations + " mises en situation avec du code (de la plus facile à la plus difficile), puis " + info.n.qcm + " QCM.</span>",
    "▶️ <span>Le bouton <b>Exécuter</b> lance ton code et les vérifications automatiques. <b>Vérifier mon code</b> te dit seulement le type de problème (3 fois par exercice).</span>",
    info.lockScreen ? "💾 <span>Tout est enregistré au fur et à mesure : tu peux revenir sur une question jusqu’à l’envoi.</span>" : "💾 <span>Tout est enregistré au fur et à mesure : tu peux recharger la page ou revenir sur une question jusqu’à l’envoi.</span>",
    info.lockScreen ? "🖥️ <span>Elle se passe <b>en plein écran</b>.</span>" : "🔎 <span>Tu peux chercher dans la documentation dans un autre onglet. Ton formateur voit quand tu quittes la page" + (info.noPaste ? "." : " et ce que tu colles.") + "</span>",
    info.lockScreen ? "🔒 <span>Si tu quittes le plein écran, changes d’onglet ou de fenêtre, <b>ta session s’arrête</b> : seul ton formateur peut te laisser revenir. Ton travail reste enregistré.</span>" : "",
    info.noPaste ? "✋ <span>Le copier-coller est désactivé dans l’éditeur pour cette mise en situation.</span>" : ""].filter(Boolean);
  var when = info.status === "scheduled" ? '<p class="notice">Elle commence ' + esc(fmtDate(info.startsAt)) + ' · <b id="cd"></b></p>' : info.endsAt ? '<p class="muted">À rendre avant ' + esc(fmtDate(info.endsAt)) + ".</p>" : "";
  screen('<div class="big">🧪</div><h1>' + esc(info.title) + '</h1><p class="muted">' + (info.name ? "Bonjour " + esc(info.name) + " · " : "") + esc(info.metier || "") + "</p>" + when
    + '<ul class="rules">' + rules.map(function (r) { return "<li>" + r + "</li>"; }).join("") + "</ul>"
    + (info.lockScreen && !FS_OK ? '<p class="notice">Ce navigateur ne permet pas le plein écran : ouvre ce lien sur un ordinateur, avec Chrome, Edge ou Firefox.</p>'
      : '<button class="btn primary" id="go" type="button"' + (info.status === "scheduled" ? " disabled" : "") + ">" + (info.lockScreen ? "🖥️ " : "") + (info.taker === "active" || info.taker === "resume" ? "Continuer" : "Commencer") + (info.lockScreen ? " en plein écran" : "") + " →</button>"));
  var go = $("#go");
  if (!go) return;
  go.onclick = begin;
  if (info.status === "scheduled") {
    var off = Date.now() / 1000 - info.now;
    var tick = function () {
      var s = Math.max(0, Math.round(info.startsAt - (Date.now() / 1000 - off)));
      var cd = $("#cd"); if (cd) cd.textContent = "dans " + Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") + " s";
      if (s <= 0) { call("/info").then(function (i) { if (i && i.status === "live") intro(i); else setTimeout(tick, 5000); }); return; }
      setTimeout(tick, 1000);
    };
    tick();
  } else go.focus();
}
function begin() {
  var go = $("#go"); if (go) go.disabled = true;
  var full = LOCK ? document.documentElement.requestFullscreen({ navigationUI: "hide" }) : Promise.resolve();
  full.then(function () { GRACE = Date.now() + 1500; return start(); }, function () { if (go) go.disabled = false; toast("Le plein écran est nécessaire pour commencer."); });
}
function start() {
  return call("/start", {}).then(function (r) {
    if (!r || r.error) {
      if (r && r.error === "locked") return call("/info").then(function (i) { lockedScreen(i && i.lockWhy); });
      if (r && (r.error === "submitted" || r.error === "closed" || r.error === "scheduled")) return call("/info").then(intro);
      return screen("<h1>Ce lien a expiré</h1>");
    }
    LOCKED = false; LOCK = !!r.lockScreen;
    P = r.paper; A = r.answers || {}; SPENT = r.spent || {}; ENDS = r.endsAt; OFFSET = Date.now() / 1000 - r.now; NOPASTE = !!r.noPaste;
    Object.keys(r.checks || {}).forEach(function (k) { CHECKS[k] = r.checks[k]; });
    Object.keys(r.ai || {}).forEach(function (k) { AI[k] = r.ai[k]; });
    ORDER = P.situations.map(function (s) { return s.id; }).concat(P.qcm.map(function (q) { return q.id; }));
    // what was typed here and not saved yet (no network for a moment): put back, then saved
    var local = {}; try { local = JSON.parse(store.get(KEY + ":unsaved") || "{}") || {}; } catch (e) { local = {}; }
    Object.keys(local).forEach(function (k) { if (ORDER.indexOf(k) >= 0) { A[k] = local[k]; DIRTY[k] = true; } });
    ORDER.forEach(function (id) { var s = sit(id); if (s) { A[id] = A[id] || { files: {} }; A[id].files = A[id].files || {}; s.files.forEach(function (f) { if (A[id].files[f.name] == null) A[id].files[f.name] = f.starter; }); FILE[id] = s.files[0] && s.files[0].name; } });
    $("#finish").hidden = false; $("#prog").hidden = false;
    go(ORDER.indexOf(r.cur) >= 0 ? r.cur : ORDER[0]);
    if (!STARTED) { STARTED = true; timer(); setInterval(heartbeat, 20000); setInterval(tickSpent, 1000); }
    Object.keys(DIRTY).forEach(function (k) { saveNow(k); });
  });
}

// ---------------------------------------------------------------- progress bar
function drawProg() {
  var n = ORDER.filter(function (id) { return stateOf(id) === "done"; }).length;
  var item = function (id) {
    var st = stateOf(id), word = st === "done" ? "répondu" : st === "on" ? "en cours" : "pas commencé";
    return '<button type="button" class="pi ' + (st ? "prog-" + st : "") + (id === CUR ? " cur" : "") + '" data-go="' + id + '" aria-label="' + esc(label(id)) + ", " + word + '"' + (id === CUR ? ' aria-current="step"' : "") + "><i></i>" + shortLabel(id) + "</button>";
  };
  $("#prog").innerHTML = '<div class="prog-row">' + P.situations.map(function (s) { return item(s.id); }).join("") + '<span class="pi-sep" aria-hidden="true"></span>' + P.qcm.map(function (q) { return item(q.id); }).join("")
    + '<span class="prog-legend" aria-hidden="true"><span><i style="background:var(--line)"></i>Pas commencé</span><span><i style="background:var(--warn)"></i>En cours</span><span><i style="background:var(--good)"></i>Répondu</span></span></div>'
    + '<div class="bar" role="progressbar" aria-label="Questions répondues" aria-valuemin="0" aria-valuemax="' + ORDER.length + '" aria-valuenow="' + n + '"><span style="width:' + Math.round((100 * n) / ORDER.length) + '%"></span></div>';
  $$("[data-go]", $("#prog")).forEach(function (b) { b.onclick = function () { go(b.dataset.go); }; });
}

// ---------------------------------------------------------------- moving between items
function go(id) {
  if (CUR && CUR !== id) { flushLog(CUR); if (DIRTY[CUR]) saveNow(CUR); }
  CUR = id; VISITED[id] = 1; store.set(KEY + ":visited", JSON.stringify(VISITED));
  call("/save", { cur: id, spent: SPENT });
  if (sit(id)) drawSituation(sit(id)); else drawQcm(qcm(id));
  drawProg();
  window.scrollTo({ top: 0 });
  var h = $("h1", $("#main")); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
}
function navBtns() {
  var i = ORDER.indexOf(CUR);
  return '<div class="navbtns"><button class="btn" type="button" id="prev"' + (i === 0 ? " disabled" : "") + '>← Précédent <kbd>Alt+←</kbd></button>'
    + (i < ORDER.length - 1 ? '<button class="btn primary" type="button" id="next">Suivant → <kbd>Alt+→</kbd></button>' : '<button class="btn good" type="button" id="fin2">✓ Terminer et envoyer</button>') + "</div>";
}
function wireNav() {
  var i = ORDER.indexOf(CUR);
  if ($("#prev")) $("#prev").onclick = function () { if (i > 0) go(ORDER[i - 1]); };
  if ($("#next")) $("#next").onclick = function () { go(ORDER[i + 1]); };
  if ($("#fin2")) $("#fin2").onclick = confirmFinish;
}
document.addEventListener("keydown", function (e) {
  if (!P || DONE) return;
  if (e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { var i = ORDER.indexOf(CUR) + (e.key === "ArrowRight" ? 1 : -1); if (i >= 0 && i < ORDER.length) { e.preventDefault(); go(ORDER[i]); } }
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && sit(CUR)) { e.preventDefault(); runCode(); }
});

// ---------------------------------------------------------------- a QCM
function release() { if (ed) { ed.swapDoc(CodeMirror.Doc("")); ed = null; } }
function drawQcm(q) {
  release();
  var i = P.qcm.indexOf(q), mine = A[q.id] && A[q.id].choice;
  $("#main").innerHTML = '<div class="qcm"><div class="card"><div class="meta"><span class="kicker">QCM ' + (i + 1) + " / " + P.qcm.length + "</span><span>· " + q.points + " pt" + (q.points > 1 ? "s" : "") + "</span>" + trBar() + "</div>"
    + '<h1 class="qtext" translate="no">' + esc(q.question) + '</h1><div id="trs"></div>' + (q.code ? '<div class="starter cmbox" id="qcode"></div><div style="height:14px"></div>' : "")
    + '<fieldset style="border:0;padding:0;margin:0"><legend class="sr">Choisis une réponse</legend><div class="choices">' + q.choices.map(function (c, k) {
      return '<label class="choice' + (mine === k ? " on" : "") + '"><input type="radio" name="c" value="' + k + '"' + (mine === k ? " checked" : "") + '><span><span class="letter">' + "ABCD".charAt(k) + '.</span> <span translate="no">' + esc(c) + '</span><span class="trc" data-ct="' + k + '"></span></span></label>';
    }).join("") + "</div></fieldset></div>" + navBtns() + "</div>";
  if (q.code) { var cm = CodeMirror($("#qcode"), { value: q.code, readOnly: true, lineNumbers: true, mode: guessMode(q.code), theme: dark() ? "material-darker" : "default" }); CMS.push(cm); }
  $$(".choice input").forEach(function (inp) {
    inp.addEventListener("change", function () {
      A[q.id] = { choice: Number(inp.value) };
      $$(".choice").forEach(function (l) { l.classList.toggle("on", $("input", l).checked); });
      DIRTY[q.id] = true; saveNow(q.id); drawProg();
    });
  });
  wireNav(); wireTr(q);
}
// ---------------------------------------------------------------- translation (Arabic, French, English), like the assessment
// The original stays; the translation shows under it. Code and file names are never translated.
var TRTO = store.get("cb-mes-tr") || "", TRCACHE = {};
if (TRTO === "fr") TRTO = "";
var TRL = [["ar", "العربية"], ["fr", "FR"], ["en", "EN"]];
// FR is the original text (nothing more shown); العربية and EN show the translation under it
var trOn = function (k) { return k === "fr" ? !TRTO : TRTO === k; };
function trBar() { return '<span class="trbar" title="Traduire (Google Translate)">' + TRL.map(function (x) { return '<button type="button" data-tr="' + x[0] + '" class="' + (trOn(x[0]) ? "on" : "") + '">' + x[1] + "</button>"; }).join("") + "</span>"; }
function isCode(t) { t = String(t || "").trim(); return /^[<{\[(.#$@0-9-]/.test(t) || /[;{}=<>]|\(\)|=>/.test(t) || /^[a-z]+(-[a-z]+)+$/.test(t) || /^[a-z]+[A-Z]\w*$/.test(t) || /^\w+\.\w+/.test(t) || !/[A-Za-zÀ-ÿ]{2,}/.test(t) || /^[a-z]+$/.test(t); }
function wireTr(item) {
  $$("[data-tr]").forEach(function (b) { b.onclick = function () { TRTO = b.dataset.tr === "fr" || TRTO === b.dataset.tr ? "" : b.dataset.tr; store.set("cb-mes-tr", TRTO); $$("[data-tr]").forEach(function (x) { x.classList.toggle("on", trOn(x.dataset.tr)); }); translateItem(item); }; });
  if (TRTO) translateItem(item);
}
function translateItem(item) {
  var s = sit(item.id), boxS = $("#trs"), boxQ = $("#trq");
  var clear = function () { if (boxS) boxS.innerHTML = ""; if (boxQ) boxQ.innerHTML = ""; $$("[data-ct]").forEach(function (x) { x.textContent = ""; }); };
  if (!TRTO) return clear();
  var to = TRTO, k = item.id + "|" + to;
  var clean = function (q) { return q.replace(/^\s*\d+\s*[.)-]\s*/, ""); };
  var texts = s ? [s.title, s.context].concat(s.questions.map(clean)) : [item.question].concat(item.choices.map(function (c) { return isCode(c) ? "" : c; }));
  if (boxS) boxS.innerHTML = '<div class="trans muted">…</div>';
  var p = TRCACHE[k] ? Promise.resolve(TRCACHE[k]) : call("/translate", { to: to, texts: texts }).then(function (r) { return r && r.texts || null; }, function () { return null; });
  p.then(function (got) {
    if (TRTO !== to || CUR !== item.id) return;
    if (!got) { if (boxS) boxS.innerHTML = '<div class="trans warn">Traduction indisponible, réessaie.</div>'; return; }
    TRCACHE[k] = got;
    var dir = to === "ar" ? ' dir="rtl" lang="ar"' : ' lang="' + to + '"';
    if (s) {
      if (boxS) boxS.innerHTML = '<div class="trans"' + dir + "><b>" + esc(got[0] || "") + "</b><br>" + esc(got[1] || "") + "</div>";
      if (boxQ) boxQ.innerHTML = '<ol class="trans"' + dir + ">" + got.slice(2).map(function (t) { return "<li>" + esc(t || "") + "</li>"; }).join("") + "</ol>";
    } else {
      if (boxS) boxS.innerHTML = got[0] ? '<div class="trans"' + dir + ">" + esc(got[0]) + "</div>" : "";
      item.choices.forEach(function (c, i) { var el = $('[data-ct="' + i + '"]'); if (el) { var t = got[i + 1]; el.textContent = t && t !== c ? t : ""; if (to === "ar") el.setAttribute("dir", "rtl"); else el.removeAttribute("dir"); } });
    }
  });
}
function guessMode(code) { return /<\?php/.test(code) ? "application/x-httpd-php" : /^\s*</.test(code) ? "htmlmixed" : /\bSELECT\b|\bFROM\b/i.test(code) ? "text/x-sql" : /[{;]\s*$/m.test(code) && /:\s*[^;]+;/.test(code) && !/function|=>|const |let /.test(code) ? "css" : "javascript"; }

// ---------------------------------------------------------------- a situation
function drawSituation(s) {
  release();
  CMS = CMS.filter(function (c) { return document.body.contains(c.getWrapperElement()); });
  var i = P.situations.indexOf(s);
  var dots = ""; for (var k = 1; k <= 5; k++) dots += '<i class="' + (k <= s.difficulty ? "on" : "") + '"></i>';
  var qs = s.questions.map(function (q) { return "<li>" + esc(q.replace(/^\s*\d+\s*[.)-]\s*/, "")) + "</li>"; }).join("");
  SFILE[s.id] = SFILE[s.id] || FILE[s.id];
  // two sets of tabs: the starter code and the editor each show their own file
  var tabs = function (pfx) { var cur = pfx === "sf" ? SFILE[s.id] : FILE[s.id]; return '<div class="ftabs" role="tablist" aria-label="Fichiers">' + s.files.map(function (f) { return '<button type="button" role="tab" class="ftab" data-' + pfx + '="' + esc(f.name) + '" aria-selected="' + (f.name === cur) + '">' + esc(f.name) + "</button>"; }).join("") + "</div>"; };
  var left = AI[s.id] ? AI[s.id].left : 3;
  var hasPreview = s.runtime === "web" || s.runtime === "php";
  OUTTAB[s.id] = OUTTAB[s.id] || (hasPreview ? "preview" : "console");
  $("#main").innerHTML = '<div class="sit"><div class="col">'
    + '<div class="card"><div class="meta"><span class="kicker">Mise en situation ' + (i + 1) + " / " + P.situations.length + '</span><span class="diff" aria-label="Difficulté ' + s.difficulty + ' sur 5">' + dots + "</span><span>· " + s.points + " pts</span>" + trBar() + "</div>"
    + '<h1 translate="no">' + esc(s.title) + '</h1><p class="ctx" translate="no">' + esc(s.context) + '</p><div id="trs"></div><div class="chips">' + s.notions.map(function (n) { return '<span class="chip">' + esc(n) + "</span>"; }).join("") + "</div></div>"
    + '<details class="card sdet" id="sdet"' + (STARTOPEN ? " open" : "") + '><summary><h2>Code de départ</h2><span class="muted small sdet-h">' + (STARTOPEN ? "masquer" : "afficher") + "</span></summary>" + tabs("sf") + '<div class="starter cmbox" id="starter"></div>' + (s.schema ? '<details style="margin-top:10px"><summary class="small">La base de données</summary><div class="starter cmbox" id="schema" style="margin-top:6px"></div></details>' : "") + "</details>"
    + '<div class="card"><h2>Ce que tu dois faire</h2><ol class="qs" translate="no">' + qs + '</ol><div id="trq"></div></div>'
    + (s.checks.length ? '<div class="card"><h2>Vérifications automatiques</h2><ul class="checks" id="cklist"></ul><p class="muted small" style="margin:8px 0 0">Elles se lancent à chaque exécution.</p></div>' : "")
    + '</div><div class="col">'
    + '<div class="card editor"><div class="etop">' + tabs("ef") + '<span class="spacer"></span><button class="btn icon" type="button" id="reset" title="Repartir du code de départ (ce fichier)" aria-label="Repartir du code de départ pour ce fichier">↺</button></div>'
    + '<div class="cmbox" id="editor"></div>'
    + '<div class="actions"><button class="btn primary" type="button" id="run">▶ Exécuter <kbd>Ctrl+Entrée</kbd></button>'
    + '<button class="btn" type="button" id="aicheck"' + (left <= 0 ? " disabled" : "") + '>Vérifier mon code <span class="left-n" id="aileft">' + left + "</span></button>"
    + '<span class="muted small" id="runinfo"></span></div></div>'
    + '<div class="card"><div class="otabs" role="tablist">' + (hasPreview ? '<button class="otab" role="tab" data-ot="preview">Aperçu</button>' : "")
    + '<button class="otab" role="tab" data-ot="console">' + (s.runtime === "web" ? "Console" : s.runtime === "sql" ? "Résultat" : "Sortie") + '<span class="n" id="errn" hidden></span></button>'
    + '<button class="otab" role="tab" data-ot="checks">Vérifications</button><button class="otab" role="tab" data-ot="feedback">Retour</button></div>'
    + (hasPreview ? '<div data-op="preview"><div id="framebox"><p class="muted small">Clique sur <b>Exécuter</b> pour voir le résultat.</p></div>' + (s.runtime === "web" && s.checks.some(function (k) { return k.probe && k.probe.actions; }) ? '<p class="muted small" style="margin:6px 0 0">Les vérifications automatiques peuvent remplir des champs et cliquer dans l’aperçu.</p>' : "") + "</div>" : "")
    + '<div data-op="console"><pre class="console" id="console" aria-live="polite"></pre></div>'
    + '<div data-op="checks"><ul class="checks" id="cklist2"></ul></div>'
    + '<div data-op="feedback"><div class="fb" id="feedback"></div></div></div>'
    + "</div></div>" + navBtns();
  // the starter code, as code (read only), file by file
  startEd = CodeMirror($("#starter"), { value: "", readOnly: true, lineNumbers: true, theme: dark() ? "material-darker" : "default", tabSize: 2 });
  CMS.push(startEd);
  if (s.schema) CMS.push(CodeMirror($("#schema"), { value: s.schema, readOnly: true, lineNumbers: true, mode: "text/x-sql", theme: dark() ? "material-darker" : "default" }));
  ed = CodeMirror($("#editor"), { value: "", lineNumbers: true, indentUnit: 2, tabSize: 2, indentWithTabs: false, matchBrackets: true, autoCloseBrackets: true, dragDrop: !NOPASTE, theme: dark() ? "material-darker" : "default",
    extraKeys: { Tab: function (c) { if (c.somethingSelected()) c.indentSelection("add"); else c.replaceSelection("  "); }, "Shift-Tab": function (c) { c.indentSelection("subtract"); } } });
  CMS.push(ed);
  DOCS[s.id] = DOCS[s.id] || {};
  showStarter(s, SFILE[s.id]);
  showFile(s, FILE[s.id]);
  $("#sdet").addEventListener("toggle", function () { STARTOPEN = $("#sdet").open; store.set("cb-mes-start", STARTOPEN ? "open" : "closed"); $(".sdet-h").textContent = STARTOPEN ? "masquer" : "afficher"; if (STARTOPEN) setTimeout(function () { startEd.refresh(); }, 0); });
  ed.on("beforeChange", function (c, ch) {
    if (ch.origin === "paste" || ch.origin === "drop") {
      var txt = ch.text.join("\n");
      if (NOPASTE) { ch.cancel(); toast("Le copier-coller est désactivé pour cette mise en situation."); logOf(s.id, FILE[s.id]).pastes++; call("/event", { kind: "paste-blocked", item: s.id, n: txt.length, text: txt.slice(0, 400) }); }
      else if (txt.length >= 2) call("/event", { kind: "paste", item: s.id, n: txt.length, text: txt.slice(0, 400) });
    }
  });
  ed.on("change", function (c, ch) {
    if (ch.origin === "setValue") return;
    logOf(s.id, FILE[s.id]).changes.push([ms(), c.indexFromPos(ch.from), ch.removed.join("\n").length, ch.text.join("\n"), ch.origin || ""]);
    A[s.id].files[FILE[s.id]] = c.getValue();
    DIRTY[s.id] = true; RAN[s.id] = false;
    queueSave(s.id);
  });
  $$("[data-sf]").forEach(function (b) { b.onclick = function () { showStarter(s, b.dataset.sf); }; });
  $$("[data-ef]").forEach(function (b) { b.onclick = function () { showFile(s, b.dataset.ef); }; });
  $("#reset").onclick = function () {
    var f = s.files.filter(function (x) { return x.name === FILE[s.id]; })[0];
    if (f && confirm("Remettre le code de départ dans " + f.name + " ? Ton code actuel de ce fichier sera remplacé.")) { ed.setValue(f.starter); A[s.id].files[f.name] = f.starter; logOf(s.id, f.name).changes.push([ms(), 0, 0, f.starter, "setValue"]); DIRTY[s.id] = true; queueSave(s.id); }
  };
  $("#run").onclick = runCode;
  $("#aicheck").onclick = aiCheck;
  $$("[data-ot]").forEach(function (b) { b.onclick = function () { OUTTAB[s.id] = b.dataset.ot; showOut(); }; });
  showOut(); drawChecks(); drawFeedback(); drawConsole();
  wireNav(); wireTr(s);
  setTimeout(function () { ed.refresh(); startEd.refresh(); }, 0);
}
/** The starter code panel: its own file (independent of the editor's). */
function showStarter(s, name) {
  var f = s.files.filter(function (x) { return x.name === name; })[0];
  if (!f) return;
  SFILE[s.id] = name;
  $$("[data-sf]").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.sf === name)); });
  startEd.setOption("mode", MODES[f.lang]); startEd.setValue(f.starter || "");
  $("#starter").classList.toggle("is-empty", !f.starter);
  var box = $("#starter");
  var note = $(".empty-file", box.parentNode); if (note) note.remove();
  if (!f.starter) { box.style.display = "none"; box.insertAdjacentHTML("afterend", '<div class="empty-file cmbox">(' + esc(f.name) + " est vide au départ)</div>"); } else box.style.display = "";
  setTimeout(function () { startEd.refresh(); }, 0);
}
/** The editor: the learner's file. */
function showFile(s, name) {
  FILE[s.id] = name;
  var f = s.files.filter(function (x) { return x.name === name; })[0];
  if (!f) return;
  $$("[data-ef]").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.ef === name)); });
  var doc = DOCS[s.id][name];
  if (!doc) { doc = DOCS[s.id][name] = CodeMirror.Doc(A[s.id].files[name] != null ? A[s.id].files[name] : f.starter, MODES[f.lang]); var lg = logOf(s.id, name); if (!lg.changes.length) lg.changes.push([ms(), 0, 0, doc.getValue(), "setValue"]); }
  ed.swapDoc(doc);
  ed.setOption("mode", MODES[f.lang]);
  setTimeout(function () { ed.refresh(); }, 0);
}
function showOut() {
  var t = OUTTAB[CUR];
  $$("[data-ot]").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.ot === t)); });
  $$("[data-op]").forEach(function (p) { p.hidden = p.dataset.op !== t; });
}
function drawChecks() {
  var s = sit(CUR); if (!s) return;
  var res = CHECKS[s.id] || [];
  var html = s.checks.length ? s.checks.map(function (k) {
    var r = res.filter(function (x) { return x.id === k.id; })[0];
    return '<li class="' + (r ? (r.ok ? "ok" : "ko") : "") + '"><b aria-hidden="true">' + (r ? (r.ok ? "✓" : "✗") : "·") + "</b><span>" + esc(k.label) + '<span class="sr">' + (r ? (r.ok ? " : réussie" : " : pas encore") : " : pas encore lancée") + "</span></span></li>";
  }).join("") : '<li><span class="muted">Pas de vérification automatique pour cet exercice : ton formateur le corrigera.</span></li>';
  if ($("#cklist")) $("#cklist").innerHTML = html;
  if ($("#cklist2")) $("#cklist2").innerHTML = html;
}
function drawFeedback(err) {
  var box = $("#feedback"); if (!box) return;
  var st = AI[CUR];
  if (err) { box.innerHTML = '<p class="notice">' + esc(err) + "</p>"; return; }
  if (!st || !st.last || !st.last.length) { box.innerHTML = '<p class="muted small">Clique sur <b>Vérifier mon code</b> : tu sauras quel <b>type</b> de problème a ton code (pas où, ni comment le corriger). ' + (st ? st.left : 3) + " vérification(s) restante(s) pour cet exercice.</p>"; return; }
  box.innerHTML = '<p class="small muted" style="margin:0">Type de problème détecté :</p>' + st.last.map(function (c) { return '<div class="cat' + (c.id === "none" ? " none" : "") + '">' + (c.id === "none" ? "✓ " : "⚠️ ") + esc(c.label) + "</div>"; }).join("")
    + '<p class="small muted" style="margin:0">' + st.left + " vérification(s) restante(s) pour cet exercice.</p>";
}
function drawConsole() {
  var c = CONSOLE[CUR] || [];
  var box = $("#console"); if (!box) return;
  box.innerHTML = c.length ? c.map(function (l) { return '<div class="l-' + l.level + '">' + (l.html ? l.html : esc(l.text)) + "</div>"; }).join("") : '<span class="l-sys">Rien pour l’instant.</span>';
  var n = c.filter(function (l) { return l.level === "error"; }).length;
  var en = $("#errn"); if (en) { en.hidden = !n; en.textContent = n; }
}

// ---------------------------------------------------------------- running the code
var RUN = 0;
function runCode(silent) {
  var s = sit(CUR); if (!s || DONE) return Promise.resolve();
  return runFor(s, silent === true);
}
function runFor(s, silent) {
  var files = A[s.id].files;
  var visible = s.id === CUR && !silent;
  if (visible) { $("#run").disabled = true; $("#runinfo").textContent = "Exécution…"; }
  var done = function (r) {
    if (visible) { $("#run").disabled = false; $("#runinfo").textContent = ""; }
    if (!r || r.error) { if (visible) toast(r && r.error ? (r.error === "closed" ? "La mise en situation est fermée." : r.error) : "Pas de connexion : réessaie."); return; }
    CHECKS[s.id] = r.checks || []; RAN[s.id] = true; DIRTY[s.id] = false; clearUnsaved(s.id);
    if (s.id === CUR) { drawChecks(); drawProg(); if (visible) { var ok = CHECKS[s.id].filter(function (x) { return x.ok; }).length; $("#runinfo").textContent = s.checks.length ? ok + "/" + s.checks.length + " vérification(s) réussie(s)" : "Exécuté"; } }
  };
  var post = function (measured, extra) { return call("/run", { item: s.id, files: files, measured: measured }).then(function (r) { if (extra) extra(r); done(r); return r; }); };
  if (s.runtime === "web") return runWeb(s, files, visible).then(post);
  if (s.runtime === "sql") return runSql(s, files, visible).then(post);
  // PHP / Node.js: on the server
  if (visible) { CONSOLE[s.id] = [{ level: "sys", text: "Exécution sur le serveur…" }]; drawConsole(); }
  return post({}, function (r) {
    if (!r || r.error) return;
    var out = [];
    if (r.output) out.push({ level: "log", text: r.output });
    if (r.stderr) out.push({ level: "error", text: r.stderr });
    if (!r.output && !r.stderr) out.push({ level: "sys", text: "(Le programme n’a rien affiché.)" });
    LASTERR[s.id] = r.stderr || "";
    CONSOLE[s.id] = out;
    if (s.id === CUR) {
      drawConsole();
      if (s.runtime === "php" && /<[a-z]/i.test(r.output || "")) { var box = $("#framebox"); box.innerHTML = ""; var fr = document.createElement("iframe"); fr.className = "frame"; fr.setAttribute("sandbox", ""); fr.setAttribute("title", "Aperçu de la sortie"); fr.srcdoc = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">' + r.output; box.appendChild(fr); OUTTAB[s.id] = "preview"; }
      else OUTTAB[s.id] = "console";
      showOut();
    }
  });
}

// HTML / CSS / JS: a frame with scripts only (no same origin: no cookie, no access to this page), a CSP with no network
var HARNESS = function () {
  var RUNID = "__RUNID__", send = function (m) { m.__mes = RUNID; try { parent.postMessage(m, "*"); } catch (e) {} };
  var fmt = function (v) { try { if (typeof v === "string") return v; if (v instanceof Element) return v.outerHTML.slice(0, 300); if (typeof v === "function") return "ƒ " + (v.name || "anonymous") + "()"; if (v === undefined) return "undefined"; var s = JSON.stringify(v); return s === undefined ? String(v) : s; } catch (e) { return String(v); } };
  var LOG = [];
  ["log", "info", "warn", "error", "debug", "table"].forEach(function (k) { var o = console[k]; console[k] = function () { var a = Array.prototype.slice.call(arguments).map(fmt).join(" "); LOG.push(a); send({ type: "log", level: k === "debug" || k === "table" ? "log" : k, text: a }); try { o.apply(console, arguments); } catch (e) {} }; });
  window.addEventListener("error", function (e) { send({ type: "log", level: "error", text: (e.message || "Erreur") + (e.lineno ? " (ligne " + e.lineno + ")" : "") }); });
  window.addEventListener("unhandledrejection", function (e) { send({ type: "log", level: "error", text: "Uncaught (in promise) " + fmt(e.reason && e.reason.message || e.reason) }); });
  document.addEventListener("click", function (e) { var a = e.target && e.target.closest && e.target.closest("a[href]"); if (a && !/^#/.test(a.getAttribute("href") || "")) { e.preventDefault(); send({ type: "log", level: "info", text: "Lien « " + a.getAttribute("href") + " » : la navigation est désactivée dans l’aperçu." }); } }, true);
  document.addEventListener("submit", function (e) { e.preventDefault(); send({ type: "log", level: "info", text: "Formulaire envoyé (l’envoi est désactivé dans l’aperçu)." }); }, true);
  // a few turns of the event loop (not setTimeout: an off-screen frame's timers are slowed down by the browser)
  var tick = function () { return new Promise(function (r) { var c = new MessageChannel(); c.port1.onmessage = function () { r(); }; c.port2.postMessage(0); }); };
  var wait = function () { return tick().then(tick).then(tick).then(tick); };
  var act = function (list) {
    var p = Promise.resolve();
    (list || []).forEach(function (a) { p = p.then(function () { var el = document.querySelector(a.selector); if (!el) return; if (a.do === "click") el.click(); else { el.value = a.value; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } return wait(); }); });
    return p;
  };
  var measure = function (k) {
    try {
      if (k.kind === "count") return document.querySelectorAll(k.selector).length;
      if (k.kind === "text") { var el = document.querySelector(k.selector); return el ? (el.value !== undefined && el.tagName !== "LI" && el.tagName !== "BUTTON" && el.tagName !== "OPTION" && el.value !== "" ? el.value : el.textContent) : null; }
      if (k.kind === "css") { var e2 = document.querySelector(k.selector); return e2 ? getComputedStyle(e2).getPropertyValue(k.property) : null; }
      if (k.kind === "eval") { var v = (0, eval)(k.expr); if (v && typeof v.then === "function") return null; try { return JSON.stringify(v); } catch (e) { return String(v); } }
    } catch (e) { return null; }
    return null;
  };
  window.addEventListener("message", function (e) {
    var d = e.data; if (!d || d.__mes !== RUNID || d.type !== "probe") return;
    var out = {}, list = d.probes || [];
    var first = list.filter(function (k) { return !k.probe.actions; }), then = list.filter(function (k) { return k.probe.actions; });
    first.forEach(function (k) { if (k.probe.kind !== "console") out[k.id] = measure(k.probe); });
    var p = Promise.resolve();
    then.forEach(function (k) { p = p.then(function () { var n = LOG.length; return act(k.probe.actions).then(function () { out[k.id] = k.probe.kind === "console" ? LOG.slice(n).join("\n") : measure(k.probe); }); }); });
    p.then(function () { send({ type: "probes", values: out }); });
  });
  window.addEventListener("load", function () { wait().then(function () { send({ type: "ready" }); }); });
};
function buildDoc(s, files, runId) {
  var html = s.files.filter(function (f) { return f.lang === "html"; })[0];
  var doc = html ? String(files[html.name] || "") : "";
  var css = s.files.filter(function (f) { return f.lang === "css"; }), js = s.files.filter(function (f) { return f.lang === "javascript"; });
  var safeJs = function (t) { return String(t || "").replace(/<\/script/gi, "<\\/script"); };
  css.forEach(function (f) {
    var re = new RegExp("<link[^>]*href=[\"']\\.?/?" + f.name.replace(/[.]/g, "\\.") + "[\"'][^>]*>", "i");
    if (re.test(doc)) doc = doc.replace(re, function () { return "<style>\n" + files[f.name] + "\n</style>"; });
    else doc = /<\/head>/i.test(doc) ? doc.replace(/<\/head>/i, function () { return "<style>\n" + files[f.name] + "\n</style></head>"; }) : "<style>\n" + files[f.name] + "\n</style>\n" + doc;
  });
  js.forEach(function (f) {
    var re = new RegExp("<script[^>]*src=[\"']\\.?/?" + f.name.replace(/[.]/g, "\\.") + "[\"'][^>]*>\\s*<\/script>", "i");
    if (re.test(doc)) doc = doc.replace(re, function () { return "<script>\n" + safeJs(files[f.name]) + "\n<\/script>"; });
    else doc = /<\/body>/i.test(doc) ? doc.replace(/<\/body>(?![\s\S]*<\/body>)/i, function () { return "<script>\n" + safeJs(files[f.name]) + "\n<\/script></body>"; }) : doc + "\n<script>\n" + safeJs(files[f.name]) + "\n<\/script>";
  });
  var csp = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'none'";
  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + csp + '"><script>(' + HARNESS.toString().replace("__RUNID__", runId) + ")();</" + "script>" + doc;
}
function runWeb(s, files, visible) {
  return new Promise(function (resolve) {
    var runId = "r" + (++RUN) + Math.random().toString(36).slice(2, 7);
    var logs = [], probes = s.checks.filter(function (k) { return k.probe; }), finished = false;
    var fr = document.createElement("iframe");
    fr.className = "frame"; fr.setAttribute("sandbox", "allow-scripts allow-modals"); fr.setAttribute("title", "Aperçu de ton code"); fr.setAttribute("referrerpolicy", "no-referrer");
    var host = visible && s.id === CUR ? $("#framebox") : null;
    if (host) { host.innerHTML = ""; host.appendChild(fr); } else { fr.style.cssText = "position:absolute;left:-9999px;width:800px;height:600px"; document.body.appendChild(fr); }
    var end = function (values) {
      if (finished) return; finished = true;
      window.removeEventListener("message", onMsg);
      if (!host) fr.remove();
      if (visible) { CONSOLE[s.id] = logs.length ? logs : [{ level: "sys", text: "(Rien dans la console.)" }]; drawConsole(); }
      LASTERR[s.id] = logs.filter(function (l) { return l.level === "error"; }).map(function (l) { return l.text; }).join("\n");
      resolve({ probes: values || {}, console: logs.filter(function (l) { return l.level !== "sys"; }).map(function (l) { return l.text; }).join("\n") });
    };
    var onMsg = function (e) {
      if (e.source !== fr.contentWindow || !e.data || e.data.__mes !== runId) return;
      if (e.data.type === "log") { logs.push({ level: e.data.level, text: String(e.data.text).slice(0, 2000) }); if (visible && s.id === CUR) { CONSOLE[s.id] = logs.slice(); drawConsole(); } }
      if (e.data.type === "ready") { if (probes.length) fr.contentWindow.postMessage({ __mes: runId, type: "probe", probes: probes.map(function (k) { return { id: k.id, probe: k.probe }; }) }, "*"); else end({}); }
      if (e.data.type === "probes") end(e.data.values);
    };
    window.addEventListener("message", onMsg);
    fr.srcdoc = buildDoc(s, files, runId);
    // code that never ends (an infinite loop) or never loads: the checks run with what is there
    setTimeout(function () { if (!finished) { logs.push({ level: "error", text: "Le code n’a pas fini de s’exécuter en 6 secondes (une boucle infinie ?)." }); end({}); } }, 6000);
    if (visible) { OUTTAB[s.id] = logs.length && !host ? "console" : "preview"; showOut(); }
  });
}

// SQL: sql.js (SQLite) in the page, on a fresh copy of the database each time
var SQLJS = null;
function loadSql() {
  if (SQLJS) return SQLJS;
  SQLJS = new Promise(function (res, rej) {
    var sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js";
    sc.onload = function () { initSqlJs({ locateFile: function (f) { return "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/" + f; } }).then(res, rej); };
    sc.onerror = rej; document.head.appendChild(sc);
  });
  SQLJS.catch(function () { SQLJS = null; });
  return SQLJS;
}
function runSql(s, files, visible) {
  var q = String(files[s.files[0].name] || "");
  return loadSql().then(function (SQL) {
    var db = new SQL.Database(); var out = [], rows = null;
    try { db.run(s.schema || ""); } catch (e) { out.push({ level: "error", text: "La base n’a pas pu être créée : " + e.message }); }
    try {
      var res = db.exec(q);
      var last = res[res.length - 1];
      if (last) { rows = last.values; out.push({ level: "log", html: '<table class="sqltable"><thead><tr>' + last.columns.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" + last.values.slice(0, 100).map(function (r) { return "<tr>" + r.map(function (v) { return "<td>" + esc(v === null ? "NULL" : v) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>" + '<span class="l-sys">' + last.values.length + " ligne(s)</span>" }); }
      else { rows = []; out.push({ level: "sys", text: "La requête n’a renvoyé aucune ligne." }); }
    } catch (e) { out.push({ level: "error", text: e.message }); }
    db.close();
    LASTERR[s.id] = out.filter(function (l) { return l.level === "error"; }).map(function (l) { return l.text; }).join("\n");
    if (visible) { CONSOLE[s.id] = out; drawConsole(); OUTTAB[s.id] = "console"; showOut(); }
    return { rows: rows };
  }, function () { if (visible) { CONSOLE[s.id] = [{ level: "error", text: "Le moteur SQL n’a pas pu se charger : recharge la page." }]; drawConsole(); } return { rows: null }; });
}

// ---------------------------------------------------------------- the AI check: the category, nothing else
function aiCheck() {
  var s = sit(CUR); if (!s) return;
  var b = $("#aicheck"); b.disabled = true; OUTTAB[s.id] = "feedback"; showOut();
  $("#feedback").innerHTML = '<p class="muted small">Vérification…</p>';
  call("/check", { item: s.id, files: A[s.id].files, errors: LASTERR[s.id] || "" }).then(function (r) {
    if (!r || r.error) { AI[s.id] = AI[s.id] || { left: 3, last: [] }; if (r && r.left != null) AI[s.id].left = r.left; drawFeedback(r && r.error && r.error !== "network" ? r.error : "Vérification indisponible, réessaie plus tard."); }
    else { AI[s.id] = { left: r.left, last: r.categories }; drawFeedback(); }
    if ($("#aileft")) $("#aileft").textContent = AI[s.id].left;
    b.disabled = AI[s.id].left <= 0;
  });
}

// ---------------------------------------------------------------- saving
function logOf(item, file) {
  var l = LOGS[item] = LOGS[item] || { files: {}, focus: [] };
  return l.files[file] = l.files[file] || { changes: [], pastes: 0 };
}
function unsaved(id) { var u = {}; try { u = JSON.parse(store.get(KEY + ":unsaved") || "{}") || {}; } catch (e) { u = {}; } u[id] = A[id]; store.set(KEY + ":unsaved", JSON.stringify(u)); }
function clearUnsaved(id) { var u = {}; try { u = JSON.parse(store.get(KEY + ":unsaved") || "{}") || {}; } catch (e) { u = {}; } delete u[id]; store.set(KEY + ":unsaved", JSON.stringify(u)); }
function queueSave(id) { savedMsg("Modifications…"); unsaved(id); clearTimeout(saveTimer); saveTimer = setTimeout(function () { saveNow(id); }, 1200); drawProgSoon(); }
var progT = null; function drawProgSoon() { clearTimeout(progT); progT = setTimeout(drawProg, 300); }
function saveNow(id, withLog) {
  clearTimeout(saveTimer);
  if (DONE) return Promise.resolve();
  var body = { item: id, answer: A[id], cur: CUR, spent: SPENT };
  // the typing record goes with it now and then (moving to another item, every 25 s, handing in), not on every keystroke
  if (withLog && sit(id) && LOGS[id]) { body.visit = VISIT; body.log = { files: LOGS[id].files, focus: FOCUS, openMs: ms() }; }
  savedMsg("Enregistrement…");
  return call("/save", body).then(function (r) {
    if (r && r.ok) { DIRTY[id] = false; clearUnsaved(id); savedMsg("Enregistré ✓"); }
    else if (r && (r.error === "closed" || r.error === "submitted")) { closedNow(r.error); }
    else if (r && r.error === "locked") { lockedNow("fullscreen", true); }
    else savedMsg("Hors ligne : enregistré sur cet appareil");
  });
}
function flushLog(id) { if (LOGS[id]) saveNow(id, true); }
setInterval(function () { if (CUR && sit(CUR) && LOGS[CUR] && !DONE) saveNow(CUR, true); }, 25000);
function heartbeat() { if (!DONE && !LOCKED && document.visibilityState === "visible") call("/save", { cur: CUR, spent: SPENT }).then(function (r) { if (r && (r.error === "closed" || r.error === "submitted")) closedNow(r.error); else if (r && r.error === "locked") lockedNow("fullscreen", true); }); }
function tickSpent() { if (!DONE && !LOCKED && CUR && document.visibilityState === "visible" && document.hasFocus()) SPENT[CUR] = (SPENT[CUR] || 0) + 1000; }
function closedNow(why) { if (DONE) return; DONE = true; screen(why === "submitted" ? '<div class="big">🎉</div><h1>Copie envoyée</h1><p class="muted">Ton formateur te transmettra les résultats.</p>' : '<div class="big">⏰</div><h1>La mise en situation est terminée</h1><p class="muted">Ton travail enregistré a été envoyé à ton formateur.</p>'); }

// ---------------------------------------------------------------- leaving the page (allowed: only written down)
var FOCUS = [], awayAt = null;
function leave(why) { if (!P || DONE || LOCKED) return; if (LOCK) return lockedNow(why || "blur"); if (awayAt) return; awayAt = Date.now(); FOCUS.push([ms(), "blur"]); call("/event", { kind: "leave", item: CUR }); }
function back() { if (!awayAt) return; var d = Date.now() - awayAt; awayAt = null; FOCUS.push([ms(), "focus"]); if (!DONE) call("/event", { kind: "back", item: CUR, n: d }); }
document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") leave("hidden"); else back(); });
document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && LOCK) leave("fullscreen"); });
// clicking in the preview takes the focus without leaving the page: not counted
window.addEventListener("blur", function () { setTimeout(function () { var a = document.activeElement; if (!document.hasFocus() && !(a && a.tagName === "IFRAME")) leave("blur"); }, 250); });

// ---------------------------------------------------------------- the session stopped (full screen rule)
var LOCKWHY = { fullscreen: "Tu as quitté le plein écran.", hidden: "Tu as changé d’onglet ou réduit la fenêtre.", blur: "Tu as changé de fenêtre.", reload: "La page a été rechargée ou ouverte ailleurs." };
function lockedNow(why, already) {
  if (!P || DONE || LOCKED || (!already && Date.now() < GRACE)) return;
  LOCKED = true;
  if (CUR && DIRTY[CUR]) { var id = CUR; call("/save", { item: id, answer: A[id], cur: CUR, spent: SPENT }).catch(function () {}); }
  (already ? Promise.resolve() : call("/event", { kind: "lock", why: why, item: CUR })).then(function () { lockedScreen(why); }, function () { lockedScreen(why); });
}
function lockedScreen(why) {
  LOCKED = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
  screen('<div class="big">⏸️</div><h1>Session arrêtée</h1><p><b>' + esc(LOCKWHY[why] || LOCKWHY.fullscreen) + '</b></p><p class="muted">Demande à ton formateur de te laisser revenir. Ton travail est enregistré. Cette page se met à jour toute seule.</p><div id="resume"></div>');
  var poll = function () {
    call("/info").then(function (i) {
      if (!i || i.error) return setTimeout(poll, 5000);
      if (i.status === "submitted" || i.status === "closed" || i.taker === "submitted") { LOCKED = false; DONE = true; return intro(i); }
      if (i.taker === "resume") {
        var box = $("#resume");
        if (box) box.innerHTML = '<p class="notice" style="background:var(--goodbg);color:var(--good)">Ton formateur t’a laissé revenir.</p><button class="btn primary" id="go" type="button">🖥️ Continuer en plein écran →</button>';
        var go = $("#go"); if (go) { go.onclick = begin; go.focus(); }
        return;
      }
      setTimeout(poll, 4000);
    }, function () { setTimeout(poll, 5000); });
  };
  setTimeout(poll, 2500);
}
window.addEventListener("focus", back);
window.addEventListener("pagehide", function () { if (CUR && !DONE) { if (DIRTY[CUR]) saveNow(CUR, true); } });

// ---------------------------------------------------------------- the timer
function timer() {
  if (!ENDS) return;
  var el = $("#timer"); el.hidden = false;
  var tick = function () {
    var r = Math.round(ENDS - (Date.now() / 1000 - OFFSET));
    el.textContent = "⏱ " + Math.floor(Math.max(0, r) / 60) + ":" + String(Math.max(0, r) % 60).padStart(2, "0");
    el.classList.toggle("low", r < 300);
    el.setAttribute("aria-label", "Temps restant : " + Math.floor(Math.max(0, r) / 60) + " minutes");
    if (r <= 0 && !DONE) { finish(true); return; }
    setTimeout(tick, 1000);
  };
  tick();
}

// ---------------------------------------------------------------- handing in
function confirmFinish() {
  var missing = ORDER.filter(function (id) { return !changed(id); });
  var d = $("#dlg");
  d.innerHTML = "<h2>Terminer et envoyer ?</h2>" + (missing.length ? '<p>Ces éléments n’ont pas de réponse :</p><ul>' + missing.map(function (id) { return "<li>" + esc(label(id)) + (sit(id) ? " · " + esc(sit(id).title) : "") + "</li>"; }).join("") + "</ul>" : "<p>Tu as répondu à tout. 👍</p>")
    + '<p class="muted small">Après l’envoi, tu ne pourras plus modifier tes réponses.</p><div class="dlg-foot"><button class="btn" type="button" id="no">Revenir</button><button class="btn good" type="button" id="yes">Envoyer ma copie</button></div>';
  d.showModal();
  $("#no", d).onclick = function () { d.close(); };
  $("#yes", d).onclick = function () { d.close(); finish(false); };
  $("#no", d).focus();
}
function finish(timeUp) {
  if (DONE) return;
  LOCK = false;   // handing in: leaving full screen now doesn't stop anything
  screen('<div class="big">⏳</div><h1>' + (timeUp ? "Temps écoulé" : "Envoi de ta copie…") + '</h1><p class="muted">Enregistrement de tes réponses et des vérifications.</p>');
  // every answer saved, and the checks of the situations changed since their last run
  var todo = ORDER.filter(function (id) { return DIRTY[id] || LOGS[id]; });
  var p = Promise.all(todo.map(function (id) { return saveNow(id, true); }));
  P.situations.filter(function (s) { return changed(s.id) && !RAN[s.id] && s.checks.length; }).forEach(function (s) { p = p.then(function () { return runFor(s, true); }).catch(function () {}); });
  p.then(function () { return call("/submit", {}); }).then(function () {
    DONE = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    try { localStorage.removeItem(KEY + ":unsaved"); localStorage.removeItem(KEY + ":visited"); } catch (e) {}
    screen('<div class="big">🎉</div><h1>Copie envoyée</h1><p class="muted">' + (timeUp ? "Le temps est écoulé : ton travail a été envoyé tel quel. " : "") + "Ton formateur te transmettra les résultats. Tu peux fermer cette page.</p>");
  });
}
$("#finish").onclick = confirmFinish;

call("/info").then(function (i) { if (!i || i.error) return screen('<div class="big">🔗</div><h1>Ce lien a expiré ou n’existe pas</h1><p class="muted">Demande un nouveau lien à ton formateur.</p>'); intro(i); });
})();
</script>
</body>
</html>`;
