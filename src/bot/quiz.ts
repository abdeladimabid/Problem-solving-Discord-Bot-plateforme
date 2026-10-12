// The assessment page a student opens from their DM link: /quiz/<token>
//   GET  /quiz/<t>          the page
//   GET  /quiz/<t>/info     title, number of questions, time, status (before starting)
//   POST /quiz/<t>/start    start or continue (full screen); a new browser session needs the teacher's OK
//   POST /quiz/<t>/answer   autosave one answer
//   POST /quiz/<t>/event    the student left full screen / the tab: the session stops
//   GET  /quiz/<t>/state    is the session stopped? did the teacher let them back in?
//   POST /quiz/<t>/submit   hand in
import type { Ctx, Env } from "../shared/types.ts";
import { TR_LANGS, translateTexts } from "../shared/webtranslate.ts";
import type { TrLang } from "../shared/webtranslate.ts";
import { AssessError, leaveEvent, lockState, readTakerToken, saveAnswer, sessionInfo, startSession, submit } from "../shared/assess.ts";

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function handleQuiz(request: Request, env: Env, ctx: Ctx, token: string, action: string | undefined): Promise<Response> {
  const takerId = await readTakerToken(env, token);
  if (!takerId) return action ? json({ error: "expired" }, 404) : new Response(PAGE("expired"), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  if (!action && request.method === "GET") return new Response(PAGE(token), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" } });
  if (request.method === "GET" && action === "info") return json(await sessionInfo(env, takerId));
  if (request.method === "GET" && action === "state") return json(await lockState(env, takerId));
  if (request.method !== "POST") return json({ error: "method" }, 405);
  let b: any = {};
  try { b = await request.json(); } catch { b = {}; }
  try {
    if (action === "translate") {
      const to = String(b.to ?? "") as TrLang;
      if (!TR_LANGS.includes(to) || !Array.isArray(b.texts)) return json({ error: "bad" }, 400);
      return json({ texts: await translateTexts(env, b.texts.map(String), to) });
    }
    if (action === "start") return json(await startSession(env, takerId, String(b.sid ?? "")));
    if (action === "answer") { await saveAnswer(env, takerId, String(b.sid ?? ""), String(b.qid ?? ""), b.answer, Number(b.pos) || 0); return json({ ok: true }); }
    if (action === "event") { await leaveEvent(env, takerId, String(b.sid ?? ""), String(b.what ?? "")); return json({ ok: true }); }
    if (action === "submit") { await submit(env, takerId, String(b.sid ?? ""), ctx); return json({ ok: true }); }
  } catch (e) {
    if (e instanceof AssessError) return json({ error: e.message }, 409);
    throw e;
  }
  return json({ error: "unknown" }, 404);
}

const PAGE = (token: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Assessment · ClassBot</title>
<style>
:root{--bg:#f4f7fc;--card:#fff;--ink:#0f1d3a;--soft:#4a5878;--faint:#8391ad;--line:#e3e9f4;--blue:#2563eb;--blue50:#eff5ff;--good:#059669;--bad:#dc2626;--warn:#b45309;--code:#0f172a}
@media (prefers-color-scheme:dark){:root{--bg:#0b1222;--card:#111a2e;--ink:#e7edf8;--soft:#aab6cf;--faint:#7c89a6;--line:#1f2b45;--blue50:#16223d;--code:#0a1020}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100%}
.wrap{max-width:860px;margin:0 auto;padding:22px 18px 40px}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px;box-shadow:0 6px 24px #0f1d3a10}
h1{font-size:26px;margin:0 0 6px;letter-spacing:-.01em}h2{font-size:19px;margin:0 0 12px}
.muted{color:var(--soft)}.small{font-size:14px}.center{text-align:center}
.btn{display:inline-flex;gap:8px;align-items:center;justify-content:center;border:0;border-radius:12px;padding:12px 20px;font:inherit;font-weight:650;cursor:pointer;background:var(--blue);color:#fff}
.btn:disabled{opacity:.5;cursor:default}.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}.btn.big{padding:15px 28px;font-size:17px}
.rules{list-style:none;padding:0;margin:18px 0;display:grid;gap:10px}.rules li{display:flex;gap:12px;align-items:flex-start;background:var(--blue50);border-radius:12px;padding:12px 14px}
.top{position:sticky;top:0;z-index:5;background:var(--bg);padding:12px 0 10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.dots{display:flex;gap:6px;flex-wrap:wrap;flex:1}.dot{width:28px;height:28px;border-radius:8px;border:1px solid var(--line);background:var(--card);font-size:12px;font-weight:700;color:var(--faint);cursor:pointer;display:grid;place-items:center}
.dot.done{background:var(--blue50);color:var(--blue);border-color:transparent}.dot.cur{outline:2px solid var(--blue);color:var(--ink)}
.timer{font-variant-numeric:tabular-nums;font-weight:700;padding:6px 12px;border-radius:10px;background:var(--card);border:1px solid var(--line)}.timer.low{color:var(--bad);border-color:var(--bad)}
.qhead{display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin-bottom:10px}.tag{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--blue);background:var(--blue50);padding:3px 9px;border-radius:99px}
.prompt{white-space:pre-wrap;font-size:17px;margin:0 0 14px}
pre{background:var(--code);color:#e2e8f0;border-radius:12px;padding:14px;overflow:auto;font:14px/1.5 "JetBrains Mono",ui-monospace,Menlo,monospace;margin:0 0 14px}
textarea{width:100%;min-height:240px;border:1px solid var(--line);border-radius:12px;padding:14px;font:15px/1.5 "JetBrains Mono",ui-monospace,Menlo,monospace;background:var(--card);color:var(--ink);resize:vertical;tab-size:2}
textarea.prose{font:16px/1.6 Inter,system-ui,sans-serif;min-height:180px}
textarea:focus{outline:2px solid var(--blue);outline-offset:1px}
.choices{display:grid;gap:10px}.choice{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:12px;padding:13px 15px;cursor:pointer;background:var(--card)}
.choice:hover{border-color:var(--blue)}.choice.on{border-color:var(--blue);background:var(--blue50)}.choice input{margin-top:4px;accent-color:var(--blue);width:18px;height:18px}
.nav{display:flex;justify-content:space-between;gap:10px;margin-top:18px}.saved{font-size:13px;color:var(--faint);align-self:center}
.full{min-height:100vh;display:grid;place-items:center;padding:18px}.big-ico{font-size:48px;margin-bottom:8px}
.warn{color:var(--warn)}.bad{color:var(--bad)}.good{color:var(--good)}
.trbar{display:inline-flex;gap:4px;align-items:center;font-size:13px}.trbar button{border:1px solid var(--line);background:var(--card);color:var(--soft);border-radius:8px;padding:3px 9px;font:inherit;font-size:13px;font-weight:650;cursor:pointer}
.trbar button.on{background:var(--blue);border-color:var(--blue);color:#fff}
.trans{margin:-6px 0 14px;padding:10px 14px;border-radius:12px;background:var(--blue50);border-left:4px solid var(--blue);font-size:16px;white-space:pre-wrap}
.trans[dir=rtl]{border-left:0;border-right:4px solid var(--blue);text-align:right;font-family:"Segoe UI",Tahoma,"Noto Naskh Arabic",sans-serif}
.ctrans{display:block;font-size:14px;color:var(--soft);margin-top:3px}.ctrans[dir=rtl]{text-align:right}
</style></head><body><div id="app" class="full"><p class="muted">…</p></div>
<script>
(() => {
  const TOKEN = ${JSON.stringify(token)};
  const base = "/quiz/" + TOKEN;
  const app = document.getElementById("app");
  const FR = navigator.language && navigator.language.startsWith("fr");
  let L = FR ? "fr" : "en";
  const T = {
    fr: { expired: "Ce lien a expiré ou n'existe pas.", intro: "Évaluation", q: "questions", min: "minutes", nolimit: "sans limite de temps",
      r1: "L'évaluation se fait en plein écran.", r2: "Si tu quittes le plein écran, changes d'onglet ou de fenêtre, ta session s'arrête. Seul ton formateur peut te laisser reprendre.",
      r3: "Tes réponses sont enregistrées au fur et à mesure.", r4: "Le copier-coller est bloqué dans les réponses.", start: "Commencer en plein écran", cont: "Continuer en plein écran",
      prev: "← Précédente", next: "Suivante →", finish: "Terminer", sure: "Rendre ta copie ?", answered: "réponses données sur", send: "Rendre", back: "Revenir",
      saved: "Enregistré", saving: "Enregistrement…", code: "Code", explain: "Explication", mcq: "QCM", several: "Plusieurs réponses possibles", pts: "pt",
      typecode: "Écris ton code ici…", typetext: "Écris ta réponse ici…",
      locked: "Session arrêtée", lockwhy: { fullscreen: "Tu as quitté le plein écran.", hidden: "Tu as changé d'onglet ou réduit la fenêtre.", blur: "Tu as changé de fenêtre.", reload: "La page a été rechargée ou ouverte ailleurs.", left: "Tu as quitté l'évaluation." },
      askteacher: "Demande à ton formateur de te laisser reprendre. Cette page se met à jour toute seule.", resumeok: "Ton formateur t'a laissé reprendre.",
      done: "Copie rendue ✅", donesub: "Ton formateur te transmettra les résultats.", closed: "L'évaluation est fermée.", nofs: "Ouvre ce lien sur un ordinateur : l'évaluation se fait en plein écran.",
      timeup: "Temps écoulé : ta copie est rendue.", paste: "Le copier-coller est désactivé pendant l'évaluation.", hello: "Bonjour" },
    en: { expired: "This link has expired or doesn't exist.", intro: "Assessment", q: "questions", min: "minutes", nolimit: "no time limit",
      r1: "The assessment runs in full screen.", r2: "If you leave full screen, switch tab or window, your session stops. Only your teacher can let you continue.",
      r3: "Your answers are saved as you go.", r4: "Copy-paste is blocked in the answers.", start: "Start in full screen", cont: "Continue in full screen",
      prev: "← Previous", next: "Next →", finish: "Finish", sure: "Hand in your paper?", answered: "answered out of", send: "Hand in", back: "Go back",
      saved: "Saved", saving: "Saving…", code: "Code", explain: "Explain", mcq: "Multiple choice", several: "Several answers possible", pts: "pt",
      typecode: "Write your code here…", typetext: "Write your answer here…",
      locked: "Session stopped", lockwhy: { fullscreen: "You left full screen.", hidden: "You switched tab or minimized the window.", blur: "You switched window.", reload: "The page was reloaded or opened somewhere else.", left: "You left the assessment." },
      askteacher: "Ask your teacher to let you continue. This page updates by itself.", resumeok: "Your teacher let you continue.",
      done: "Paper handed in ✅", donesub: "Your teacher will send you the results.", closed: "This assessment is closed.", nofs: "Open this link on a computer: the assessment runs in full screen.",
      timeup: "Time is up: your paper is handed in.", paste: "Copy-paste is disabled during the assessment.", hello: "Hello" },
  };
  const tr = (k) => T[L][k];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let sid = ""; try { sid = sessionStorage.getItem("cbq:" + TOKEN) || ""; } catch {}
  if (!sid) { sid = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join(""); try { sessionStorage.setItem("cbq:" + TOKEN, sid); } catch {} }
  let S = null, paper = [], answers = {}, cur = 0, running = false, leaving = false, graceUntil = 0, timer = null, saveT = null, offset = 0;
  const post = (path, body) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sid, ...body }), keepalive: true }).then((r) => r.json().catch(() => ({})));
  const get = (path) => fetch(base + path, { cache: "no-store" }).then((r) => r.json());

  function screen(html) { app.className = "full"; app.innerHTML = '<div class="card center" style="max-width:560px">' + html + "</div>"; }
  function intro(info) {
    const resume = info.status === "active" || info.status === "locked";
    screen('<div class="big-ico">📝</div><h1>' + esc(info.title) + '</h1><p class="muted">' + (info.name ? tr("hello") + " " + esc(info.name) + " · " : "") + info.n + " " + tr("q") + " · " + (info.minutes ? info.minutes + " " + tr("min") : tr("nolimit")) + '</p>'
      + '<ul class="rules" style="text-align:left"><li>🖥️ <span>' + tr("r1") + "</span></li><li>🔒 <span>" + tr("r2") + "</span></li><li>💾 <span>" + tr("r3") + "</span></li><li>✋ <span>" + tr("r4") + "</span></li></ul>"
      + (document.fullscreenEnabled ? '<button class="btn big" id="go">' + (resume ? tr("cont") : tr("start")) + "</button>" : '<p class="warn">' + tr("nofs") + "</p>"));
    const go = document.getElementById("go");
    if (go) go.onclick = begin;
  }
  async function begin() {
    try { await document.documentElement.requestFullscreen({ navigationUI: "hide" }); } catch { return; }
    graceUntil = Date.now() + 1500;
    const v = await post("/start", {});
    if (v.status !== "active") { running = false; return show(v); }
    S = v; paper = v.paper || []; answers = v.answers || {}; cur = Math.min(v.pos || 0, paper.length - 1); offset = Date.now() / 1000 - v.now;
    running = true; draw(); tick();
  }
  function show(v) {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (v.status === "locked") return lockedScreen(v.reason);
    if (v.status === "submitted" || v.status === "graded") return screen('<div class="big-ico">🎉</div><h1>' + tr("done") + '</h1><p class="muted">' + tr("donesub") + "</p>");
    if (v.status === "closed") return screen('<div class="big-ico">🔒</div><h1>' + tr("closed") + "</h1>");
    if (v.error === "expired") return screen('<h1>' + tr("expired") + "</h1>");
    intro(v);
  }
  function lockedScreen(why) {
    running = false;
    screen('<div class="big-ico">⏸️</div><h1>' + tr("locked") + '</h1><p>' + esc((T[L].lockwhy[why] || T[L].lockwhy.left)) + '</p><p class="muted">' + tr("askteacher") + '</p><div id="resume"></div>');
    const poll = async () => {
      const s = await get("/state").catch(() => null);
      if (s && s.resume) {
        document.getElementById("resume").innerHTML = '<p class="good">' + tr("resumeok") + '</p><button class="btn big" id="go">' + tr("cont") + "</button>";
        document.getElementById("go").onclick = begin;
        return;
      }
      if (s && (s.status === "submitted" || s.status === "graded")) return show(s);
      setTimeout(poll, 4000);
    };
    setTimeout(poll, 3000);
  }
  async function leave(what) {
    if (!running || leaving || Date.now() < graceUntil) return;
    leaving = true; running = false;
    await post("/event", { what }).catch(() => {});
    leaving = false;
    lockedScreen(what);
  }
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) leave("fullscreen"); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") leave("hidden"); });
  window.addEventListener("blur", () => setTimeout(() => { if (!document.hasFocus()) leave("blur"); }, 400));
  document.addEventListener("contextmenu", (e) => { if (running) e.preventDefault(); });

  function remaining() { return S && S.deadline ? Math.round(S.deadline - (Date.now() / 1000 - offset)) : null; }
  function tick() {
    clearInterval(timer);
    timer = setInterval(() => {
      const el = document.getElementById("timer");
      const r = remaining();
      if (r === null || !el) return;
      el.textContent = Math.floor(Math.max(0, r) / 60) + ":" + String(Math.max(0, r) % 60).padStart(2, "0");
      el.classList.toggle("low", r < 120);
      if (r <= 0 && running) { running = false; clearInterval(timer); finish(true); }
    }, 500);
  }
  const answered = (q) => { const a = answers[q.id]; return Array.isArray(a) ? a.length > 0 : !!String(a ?? "").trim(); };
  function draw() {
    const q = paper[cur];
    app.className = "";
    const head = '<div class="wrap"><div class="top"><div class="dots">' + paper.map((p, i) => '<button class="dot' + (answered(p) ? " done" : "") + (i === cur ? " cur" : "") + '" data-i="' + i + '" title="' + (i + 1) + '">' + (i + 1) + "</button>").join("") + "</div>"
      + (S.deadline ? '<span class="timer" id="timer">…</span>' : "") + "</div>";
    const TRL = [["ar", "العربية"], ["fr", "FR"], ["en", "EN"]];
    let body = '<div class="card"><div class="qhead"><span class="tag">' + tr(q.type) + '</span><span class="trbar" title="Google Translate">🌐 ' + TRL.map(([k, l]) => '<button type="button" data-tr="' + k + '" class="' + (trTo === k ? "on" : "") + '">' + l + "</button>").join("") + '</span><span class="muted small">' + (cur + 1) + " / " + paper.length + " · " + q.points + " " + tr("pts") + "</span></div>"
      + '<p class="prompt" translate="no">' + esc(q.prompt) + '</p><div id="trq"></div>' + (q.code ? '<pre translate="no">' + esc(q.code) + "</pre>" : "");
    if (q.type === "mcq") {
      const mine = new Set(answers[q.id] || []);
      body += (q.multi ? '<p class="muted small">' + tr("several") + "</p>" : "") + '<div class="choices">' + q.choices.map((c) => '<label class="choice' + (mine.has(c.k) ? " on" : "") + '"><input type="' + (q.multi ? "checkbox" : "radio") + '" name="c" value="' + c.k + '"' + (mine.has(c.k) ? " checked" : "") + "><span>" + esc(c.text) + '<span class="ctrans" data-ct="' + c.k + '"></span></span></label>').join("") + "</div>";
    } else {
      const val = answers[q.id] != null ? answers[q.id] : (q.starter || "");
      body += '<textarea id="ans" class="' + (q.type === "explain" ? "prose" : "") + '" spellcheck="' + (q.type === "explain") + '" placeholder="' + (q.type === "code" ? tr("typecode") : tr("typetext")) + '">' + esc(val) + "</textarea>";
    }
    body += '<div class="nav"><button class="btn ghost" id="prev"' + (cur === 0 ? " disabled" : "") + ">" + tr("prev") + '</button><span class="saved" id="saved"></span>'
      + (cur < paper.length - 1 ? '<button class="btn" id="next">' + tr("next") + "</button>" : '<button class="btn" id="fin">' + tr("finish") + "</button>") + "</div></div></div>";
    app.innerHTML = head + body;
    app.querySelectorAll("[data-tr]").forEach((b) => (b.onclick = () => { trTo = trTo === b.dataset.tr ? "" : b.dataset.tr; app.querySelectorAll("[data-tr]").forEach((x) => x.classList.toggle("on", x.dataset.tr === trTo)); translateQ(q); }));
    if (trTo) translateQ(q);
    app.querySelectorAll(".dot").forEach((b) => (b.onclick = () => go(Number(b.dataset.i))));
    document.getElementById("prev").onclick = () => go(cur - 1);
    const nx = document.getElementById("next"); if (nx) nx.onclick = () => go(cur + 1);
    const fin = document.getElementById("fin"); if (fin) fin.onclick = () => confirmFinish();
    const ta = document.getElementById("ans");
    if (ta) {
      ta.focus();
      ta.addEventListener("input", () => { answers[q.id] = ta.value; queueSave(q); });
      ta.addEventListener("paste", (e) => { e.preventDefault(); flash(tr("paste")); post("/event", { what: "paste" }); });
      ta.addEventListener("drop", (e) => e.preventDefault());
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Tab" && q.type === "code") { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 2; answers[q.id] = ta.value; queueSave(q); }
      });
    }
    app.querySelectorAll(".choice input").forEach((inp) => inp.addEventListener("change", () => {
      const picked = [...app.querySelectorAll(".choice input")].filter((x) => x.checked).map((x) => Number(x.value));
      answers[q.id] = picked; app.querySelectorAll(".choice").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked));
      saveNow(q); refreshDots();
    }));
    tick();
  }
  // 🌐 the question (and the choices) in Arabic, French or English: Google Translate, from the server (no extension in full screen)
  let trTo = ""; const trCache = {};
  async function translateQ(q) {
    const box = document.getElementById("trq");
    const clear = () => { if (box) box.innerHTML = ""; app.querySelectorAll("[data-ct]").forEach((x) => (x.textContent = "")); };
    if (!trTo) return clear();
    const to = trTo, k = q.id + "|" + to;
    // choices that are code (<nav>, push(), 42) stay as they are: only sentences are translated
    const words = (t) => /[A-Za-zÀ-ÿ]{2,}[\s'’][A-Za-zÀ-ÿ]{2,}/.test(t) && !/^\s*[<{\[(]/.test(t);
    const texts = [q.prompt, ...(q.type === "mcq" ? q.choices.map((c) => (words(c.text) ? c.text : "")) : [])];
    if (box) box.innerHTML = '<div class="trans muted">…</div>';
    if (!trCache[k]) trCache[k] = await post("/translate", { to, texts }).then((r) => r.texts || null).catch(() => null);
    const got = trCache[k];
    if (trTo !== to || paper[cur] !== q) return;
    if (!got) { if (box) box.innerHTML = '<div class="trans warn">Google Translate ✗</div>'; delete trCache[k]; return; }
    const dir = to === "ar" ? ' dir="rtl" lang="ar"' : "";
    if (box) box.innerHTML = got[0] ? '<div class="trans"' + dir + ">" + esc(got[0]) + "</div>" : "";
    if (q.type === "mcq") q.choices.forEach((c, i) => { const el = app.querySelector('[data-ct="' + c.k + '"]'); if (el) { el.textContent = got[i + 1] && got[i + 1] !== c.text ? got[i + 1] : ""; if (dir) el.setAttribute("dir", "rtl"); else el.removeAttribute("dir"); } });
  }
  function refreshDots() { app.querySelectorAll(".dot").forEach((b) => b.classList.toggle("done", answered(paper[Number(b.dataset.i)]))); }
  function flash(msg) { const s = document.getElementById("saved"); if (s) { s.textContent = msg; s.className = "saved warn"; } }
  function queueSave(q) { const s = document.getElementById("saved"); if (s) { s.textContent = tr("saving"); s.className = "saved"; } clearTimeout(saveT); saveT = setTimeout(() => saveNow(q), 1200); refreshDots(); }
  async function saveNow(q) {
    clearTimeout(saveT);
    const r = await post("/answer", { qid: q.id, answer: answers[q.id], pos: cur }).catch(() => null);
    const s = document.getElementById("saved");
    if (r && r.ok) { if (s) { s.textContent = tr("saved") + " ✓"; s.className = "saved"; } }
    else if (r && r.error) { running = false; return r.error === "locked" ? lockedScreen("left") : r.error === "time" ? finish(true) : show({ status: r.error }); }
  }
  async function go(i) {
    const q = paper[cur];
    if (q && q.type !== "mcq" && answers[q.id] != null) await saveNow(q);
    cur = Math.max(0, Math.min(paper.length - 1, i));
    draw();
  }
  function confirmFinish() {
    const n = paper.filter(answered).length;
    const box = document.createElement("div");
    box.className = "card"; box.style.cssText = "position:fixed;inset:auto 0 0 0;margin:0 auto 24px;max-width:520px;z-index:20;text-align:center;box-shadow:0 18px 50px #0f1d3a40";
    box.innerHTML = "<h2>" + tr("sure") + '</h2><p class="muted">' + n + " " + tr("answered") + " " + paper.length + '</p><div class="nav" style="justify-content:center"><button class="btn ghost" id="no">' + tr("back") + '</button><button class="btn" id="yes">' + tr("send") + "</button></div>";
    document.body.appendChild(box);
    box.querySelector("#no").onclick = () => box.remove();
    box.querySelector("#yes").onclick = () => { box.remove(); finish(false); };
  }
  async function finish(timeUp) {
    running = false;
    const q = paper[cur];
    if (q && answers[q.id] != null && !timeUp) await post("/answer", { qid: q.id, answer: answers[q.id], pos: cur }).catch(() => {});
    await post("/submit", {}).catch(() => {});
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    screen('<div class="big-ico">🎉</div><h1>' + tr("done") + '</h1><p class="muted">' + (timeUp ? tr("timeup") : tr("donesub")) + "</p>");
  }
  if (TOKEN === "expired") return screen("<h1>" + tr("expired") + "</h1>");
  get("/info").then((info) => { if (!info) return screen("<h1>" + tr("expired") + "</h1>"); if (info.lang) L = info.lang; show(info); }).catch(() => screen("<h1>" + tr("expired") + "</h1>"));
})();
</script></body></html>`;
