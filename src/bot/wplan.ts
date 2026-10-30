// A student's plan d'action, the page they open from their DM: /wp/<token>
//   GET  /wp/<t>          the page
//   GET  /wp/<t>/data     the plan: the actions, what they answered, the corrections (never the expected answers)
//   POST /wp/<t>/answer   their answer to one action (checked at once: the AI for code and written answers)
//   POST /wp/<t>/check    a mini brief's objective ticked or unticked (the teacher sees it, it counts in the progress)
//   POST /wp/<t>/ask      a question for the teacher (✋ the Help queue; the answer comes back here and by DM)
import type { Env } from "../shared/types.ts";
import { forClass } from "../shared/aictx.ts";
import { WorkPlanError, readPlanToken, studentAnswer, studentAsk, studentCheck, studentView } from "../shared/workplan.ts";
import { getGuild } from "../shared/db.ts";

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const HTML = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" };

export async function handleWorkPlan(request: Request, env: Env, token: string, action: string | undefined): Promise<Response> {
  const t = await readPlanToken(env, token);
  if (!t) return action ? json({ error: "Ce lien n'est plus valable." }, 404) : new Response(PAGE(""), { status: 404, headers: HTML });
  if (!action && request.method === "GET") return new Response(PAGE(token), { headers: HTML });
  env = forClass(env, t.gid);
  if (action === "data" && request.method === "GET") {
    const v = await studentView(env, t.gid, t.id);
    return v ? json(v) : json({ error: "Ce plan n'est plus disponible." }, 404);
  }
  if ((action === "answer" || action === "check" || action === "ask") && request.method === "POST") {
    let b: any = {};
    try { b = await request.json(); } catch { b = {}; }
    try {
      if (action === "check") return json(await studentCheck(env, t.gid, t.id, b));
      if (action === "ask") return json(await studentAsk(env, await getGuild(env, t.gid), t.id, b));
      return json(await studentAnswer(env, t.gid, t.id, b));
    }
    catch (e) { if (e instanceof WorkPlanError) return json({ error: e.message }, 400); throw e; }
  }
  return json({ error: "method" }, 405);
}

// The page: no framework; its script avoids backquotes and dollar-braces (it lives in a template string).
const PAGE = (token: string) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Mon plan d'action · ClassBot</title>
<style>
:root{--bg:#f4f7fc;--card:#fff;--ink:#0f1d3a;--soft:#4a5878;--faint:#8391ad;--line:#e3e9f4;--blue:#2563eb;--blue50:#eff5ff;--good:#059669;--good50:#e8f8f1;--bad:#dc2626;--bad50:#fdeeee;--warn:#b45309;--warn50:#fdf4e3;--code:#0f172a;
  --k-challenge:#7c3aed;--k-code:#2563eb;--k-answer:#0891b2;--k-mcq:#db2777;--k-brief:#ea580c}
@media (prefers-color-scheme:dark){:root{--bg:#0b1222;--card:#111a2e;--ink:#e7edf8;--soft:#aab6cf;--faint:#7c89a6;--line:#1f2b45;--blue50:#16223d;--good50:#0f2a22;--bad50:#2c1518;--warn50:#2b2111;--code:#0a1020}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:22px 16px 60px}
.hero{background:linear-gradient(135deg,#1d4ed8,#7c3aed);color:#fff;border-radius:22px;padding:26px 26px 22px;box-shadow:0 14px 40px #1d4ed833;margin-bottom:18px}
.hero h1{margin:4px 0 6px;font-size:26px;letter-spacing:-.01em}.hero .eyebrow{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.85}
.hero .msg{margin:14px 0 0;padding:12px 14px;border-radius:14px;background:#ffffff1f;white-space:pre-wrap}
.prog{display:flex;align-items:center;gap:14px;margin-top:16px}.bar{flex:1;height:10px;border-radius:99px;background:#ffffff33;overflow:hidden}.bar i{display:block;height:100%;background:#fff;border-radius:99px;transition:width .4s}
.prog b{font-size:15px;white-space:nowrap}
.step{position:relative;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px 20px 18px 20px;margin:0 0 14px;box-shadow:0 4px 18px #0f1d3a0c;border-left:6px solid var(--kc,var(--blue))}
.step.done{opacity:.92}.sh{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.num{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:14px;background:var(--kc);color:#fff;flex:none}
.step.done .num{background:var(--good)}
.kind{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--kc)}
.notion{font-size:13px;padding:2px 10px;border-radius:99px;background:var(--blue50);color:var(--soft)}
.state{margin-left:auto;font-size:13px;font-weight:700;padding:4px 11px;border-radius:99px;background:var(--bg);color:var(--soft)}
.state.done{background:var(--good50);color:var(--good)}.state.partial,.state.redo{background:var(--warn50);color:var(--warn)}.state.failed{background:var(--bad50);color:var(--bad)}.state.submitted{background:var(--blue50);color:var(--blue)}
.step h2{font-size:19px;margin:12px 0 4px}.why{color:var(--soft);font-size:14px;margin:0 0 12px}
.prompt{white-space:pre-wrap;font-size:16.5px;margin:10px 0 14px}
pre,code{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace}code{background:var(--blue50);border-radius:6px;padding:1px 6px;font-size:.92em}
textarea,input[type=url],input[type=text]{width:100%;border:1px solid var(--line);border-radius:12px;padding:12px 14px;font:15px/1.5 "JetBrains Mono",ui-monospace,Menlo,monospace;background:var(--card);color:var(--ink)}
textarea{min-height:170px;resize:vertical;tab-size:2}textarea.prose,input[type=text]{font:16px/1.55 Inter,system-ui,sans-serif}textarea.prose{min-height:120px}
textarea:focus,input:focus{outline:2px solid var(--blue);outline-offset:1px}
.choices{display:grid;gap:9px}.choice{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:12px;padding:12px 14px;cursor:pointer}
.choice:hover{border-color:var(--blue)}.choice input{margin-top:4px;accent-color:var(--blue);width:18px;height:18px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}
.btn{display:inline-flex;gap:8px;align-items:center;border:0;border-radius:12px;padding:11px 18px;font:inherit;font-weight:700;cursor:pointer;background:var(--blue);color:#fff}
.btn:disabled{opacity:.55;cursor:default}.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.fb{margin-top:12px;border-radius:14px;padding:12px 14px;white-space:pre-wrap;border:1px solid var(--line)}
.fb.correct{background:var(--good50);border-color:transparent}.fb.partial{background:var(--warn50);border-color:transparent}.fb.wrong{background:var(--bad50);border-color:transparent}.fb.submitted{background:var(--blue50);border-color:transparent}
.fb b{display:block;margin-bottom:2px}
.tasks{list-style:none;padding:0;margin:10px 0 12px;display:grid;gap:8px}.tasks li{display:flex;gap:10px;padding:10px 12px;border-radius:12px;background:var(--bg)}
.tasks li{padding:0;background:none}.tasks label{display:flex;gap:12px;align-items:flex-start;width:100%;padding:10px 12px;border-radius:12px;background:var(--bg);cursor:pointer;border:1px solid transparent;transition:background .15s,border-color .15s}
.tasks label:hover{border-color:var(--kc)}.tasks input{appearance:none;-webkit-appearance:none;width:20px;height:20px;flex:none;border:2px solid var(--kc);border-radius:6px;margin:2px 0 0;display:grid;place-items:center;cursor:pointer;background:var(--card)}
.tasks input:checked{background:var(--good);border-color:var(--good)}.tasks input:checked:after{content:"✓";color:#fff;font-size:13px;font-weight:800;line-height:1}
.tasks input:focus-visible{outline:2px solid var(--blue);outline-offset:2px}.tasks li.on label{background:var(--good50)}.tasks li.on span{color:var(--soft);text-decoration:line-through;text-decoration-color:var(--faint)}
.objc{font-size:13px;font-weight:700;color:var(--soft);margin-left:6px;text-transform:none;letter-spacing:0}
.help{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px;margin:22px 0 14px;box-shadow:0 4px 18px #0f1d3a0c}
.help h2{font-size:19px;margin:0 0 4px}.help select{width:100%;border:1px solid var(--line);border-radius:12px;padding:10px 12px;font:15px Inter,system-ui,sans-serif;background:var(--card);color:var(--ink);margin:6px 0 8px}
.asks{display:grid;gap:10px;margin-top:14px}.ask{border:1px solid var(--line);border-radius:14px;padding:12px 14px}.ask .q{white-space:pre-wrap}.ask .st{font-size:13px;font-weight:700;color:var(--soft);margin-bottom:4px}
.ask .rep{margin-top:8px;border-left:4px solid var(--blue);background:var(--blue50);border-radius:0 12px 12px 0;padding:8px 12px;white-space:pre-wrap}
.ask.waiting .st{color:var(--warn)}.ask.helping .st{color:var(--blue)}.ask.done .st{color:var(--good)}
.meta{display:flex;gap:16px;flex-wrap:wrap;color:var(--soft);font-size:14px}.lbl{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin:14px 0 6px}
.hint{background:var(--blue50);border-radius:12px;padding:12px 14px;font-size:15px}
.teacher{margin-top:12px;border-left:4px solid var(--kc);padding:8px 12px;background:var(--bg);border-radius:0 12px 12px 0;font-size:15px}
.err{color:var(--bad);font-size:14px}.muted{color:var(--soft)}.center{text-align:center}
.full{min-height:80vh;display:grid;place-items:center;text-align:center}.full .big{font-size:52px}
details.mine summary{cursor:pointer;color:var(--soft);font-size:14px;margin-top:10px}details.mine pre{white-space:pre-wrap;background:var(--bg);border-radius:12px;padding:12px;margin:8px 0 0;font-size:14px}
.k-challenge{--kc:var(--k-challenge)}.k-code{--kc:var(--k-code)}.k-answer{--kc:var(--k-answer)}.k-mcq{--kc:var(--k-mcq)}.k-brief{--kc:var(--k-brief)}
.ctx{margin:10px 0 6px;padding:14px 16px;border-radius:14px;background:var(--bg);font-size:15.5px}.ctx h3{font-size:15px;margin:14px 0 6px}.ctx h3:first-child{margin-top:0}.ctx p{margin:4px 0}.ctx ul{margin:4px 0;padding-left:20px}.ctx li{margin:3px 0}
.confetti{font-size:15px;margin-top:10px;font-weight:700}
</style></head><body><div class="wrap" id="app"><div class="full"><div><div class="big">🧭</div><p class="muted">Chargement…</p></div></div></div>
<script>
var TOKEN = ${JSON.stringify(token)};
var app = document.getElementById("app"), P = null;
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function rich(s) { return esc(s).replace(/\\x60([^\\x60\\n]+)\\x60/g, "<code>$1</code>"); }
var STATE = { todo: "À faire", done: "✓ Validé", partial: "Presque", failed: "À reprendre", submitted: "Envoyé", redo: "À refaire" };
var VERDICT = { correct: "✓ Bonne réponse", partial: "Presque", wrong: "Pas encore", submitted: "Envoyé" };
function when(t) { return new Date(t * 1000).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); }
function api(path, body) {
  return fetch("/wp/" + TOKEN + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {})
    .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Erreur"); return j; }); });
}
function load() {
  if (!TOKEN) { app.innerHTML = '<div class="full"><div><div class="big">🔒</div><h1>Lien expiré</h1><p class="muted">Demande à ton formateur de te renvoyer ton plan d\\'action.</p></div></div>'; return; }
  api("/data").then(function (d) { P = d; draw(); }).catch(function (e) { app.innerHTML = '<div class="full"><div><div class="big">😕</div><p>' + esc(e.message) + '</p></div></div>'; });
}
// the brief's context: its parts (a line starting with an emoji) as headings, "- " lines as lists
function ctxHtml(text) {
  var out = "", list = false;
  String(text).split("\\n").forEach(function (raw) {
    var l = raw.trim(), m = l.match(/^[-•*]\\s+(.*)$/);
    if (m) { if (!list) { out += "<ul>"; list = true; } out += "<li>" + rich(m[1]) + "</li>"; return; }
    if (list) { out += "</ul>"; list = false; }
    if (!l) return;
    out += /^\\p{Extended_Pictographic}/u.test(l) && l.length < 60 ? "<h3>" + esc(l) + "</h3>" : "<p>" + rich(l) + "</p>";
  });
  return out + (list ? "</ul>" : "");
}
function stepHtml(s, i) {
  var done = s.state === "done", h = "";
  h += '<article class="step k-' + s.kind + (done ? " done" : "") + '" id="s-' + s.id + '"><div class="sh"><span class="num">' + (done ? "✓" : i + 1) + '</span><span class="kind">' + esc(s.kindLabel) + '</span>'
    + (s.notion ? '<span class="notion">' + esc(s.notion) + '</span>' : "") + '<span class="state ' + s.state + '">' + (STATE[s.state] || "") + '</span></div>';
  h += '<h2>' + esc(s.title) + '</h2>' + (s.why ? '<p class="why">' + rich(s.why) + '</p>' : "");
  if (s.kind === "challenge") {
    var c = s.challenge || {};
    h += '<div class="hint">Ce défi' + (c.difficulty ? ' (' + esc({ easy: "facile", medium: "moyen", hard: "difficile" }[c.difficulty] || c.difficulty) + ')' : "") + ' se fait dans <b>Discord</b> : tape <code>/assignments</code> sur le serveur de la classe, ou appuie sur <b>Start</b> dans le message que ClassBot t\\'a envoyé. Il est validé ici tout seul quand tu le réussis.</div>';
  } else if (s.kind === "brief") {
    var b = s.brief || {};
    var ck = s.checks || [], nt = (b.tasks || []).length;
    h += (b.context ? '<div class="ctx">' + ctxHtml(b.context) + '</div>' : "") + '<div class="lbl">Tes objectifs <span class="objc" data-objc>' + ck.length + ' / ' + nt + ' faits</span></div>'
      + '<p class="muted" style="margin:-2px 0 8px;font-size:14px">Coche chaque objectif quand tu l\\'as terminé : ton formateur voit où tu en es.</p><ul class="tasks">'
      + (b.tasks || []).map(function (t, k) { var on = ck.indexOf(k) >= 0; return '<li' + (on ? ' class="on"' : "") + '><label><input type="checkbox" data-chk="' + s.id + '" data-i="' + k + '"' + (on ? " checked" : "") + '><span>' + rich(t) + '</span></label></li>'; }).join("") + '</ul>'
      + '<div class="meta">' + (b.deliverable ? '<span>📦 À rendre : ' + rich(b.deliverable) + '</span>' : "") + (b.hours ? '<span>⏱️ Environ ' + b.hours + ' h</span>' : "") + '</div>';
    if (!done) h += '<div class="lbl">Rendre ton travail</div><input type="url" data-link placeholder="https://github.com/…" value="' + esc(s.work && s.work.link || "") + '">'
      + '<textarea class="prose" data-note style="min-height:80px;margin-top:8px" placeholder="Un mot pour ton formateur (facultatif) : ce que tu as fait, ce qui t\\'a bloqué…">' + esc(s.work && s.work.note || "") + '</textarea>'
      + '<div class="row"><button class="btn" data-send="' + s.id + '">' + (s.work ? "Renvoyer" : "Rendre mon travail") + '</button><span class="err" data-err></span></div>';
    else if (s.work) h += '<p class="muted">Rendu : <a href="' + esc(s.work.link) + '" target="_blank" rel="noopener">' + esc(s.work.link) + '</a></p>';
  } else {
    h += '<p class="prompt">' + rich(s.prompt) + '</p>';
    if (!done) {
      if (s.kind === "mcq") {
        var mine = s.work && Array.isArray(s.work.answer) ? s.work.answer : [];
        h += (s.multi ? '<p class="muted" style="margin:-6px 0 10px;font-size:14px">Plusieurs bonnes réponses possibles.</p>' : "") + '<div class="choices">' + s.choices.map(function (c, k) {
          return '<label class="choice"><input type="' + (s.multi ? "checkbox" : "radio") + '" name="c-' + s.id + '" value="' + k + '"' + (mine.indexOf(k) >= 0 ? " checked" : "") + '><span>' + rich(c) + '</span></label>'; }).join("") + '</div>';
      } else {
        var val = s.work && typeof s.work.answer === "string" ? s.work.answer : (s.kind === "code" ? s.starter || "" : "");
        h += '<textarea data-ans class="' + (s.kind === "code" ? "" : "prose") + '" spellcheck="' + (s.kind === "code" ? "false" : "true") + '" placeholder="' + (s.kind === "code" ? "Écris ton code ici" : "Ta réponse, avec tes mots") + '">' + esc(val) + '</textarea>';
      }
      h += '<div class="row"><button class="btn" data-send="' + s.id + '">' + (s.work ? "Vérifier à nouveau" : "Vérifier ma réponse") + '</button>' + (s.work && s.work.tries ? '<span class="muted" style="font-size:14px">Essai ' + s.work.tries + '</span>' : "") + '<span class="err" data-err></span></div>';
    } else if (s.work && s.work.answer != null) {
      var shown = Array.isArray(s.work.answer) ? s.work.answer.map(function (k) { return s.choices[k]; }).join(" · ") : s.work.answer;
      h += '<details class="mine"><summary>Ta réponse</summary><pre>' + esc(shown) + '</pre></details>';
    }
  }
  if (s.work && s.work.verdict && s.kind !== "challenge") h += '<div class="fb ' + s.work.verdict + '"><b>' + (s.kind === "brief" ? "Envoyé à ton formateur" : VERDICT[s.work.verdict] || "") + '</b>' + rich(s.work.comment || (s.kind === "brief" ? "Il te dira s'il est validé." : "")) + '</div>';
  if (s.review) h += '<div class="teacher"><b>' + (s.review.ok ? "✓ Validé par ton formateur" : "↻ Ton formateur te demande de le reprendre") + '</b>' + (s.review.comment ? '<div>' + rich(s.review.comment) + '</div>' : "") + '</div>';
  return h + '</article>';
}
function draw() {
  var pct = P.pct != null ? P.pct : P.total ? Math.round(100 * P.done / P.total) : 0;
  app.innerHTML = '<header class="hero"><div class="eyebrow">🧭 Mon plan d\\'action</div><h1>' + esc(P.title) + '</h1>'
    + '<div>' + P.total + ' action' + (P.total > 1 ? "s" : "") + ' choisie' + (P.total > 1 ? "s" : "") + ' pour toi' + (P.due_at ? ', à faire avant le ' + esc(when(P.due_at)) : "") + '.</div>'
    + (P.message ? '<div class="msg">' + rich(P.message) + '</div>' : "")
    + '<div class="prog"><div class="bar"><i style="width:' + pct + '%"></i></div><b data-pct>' + pct + ' %</b></div><div style="font-size:14px;opacity:.9;margin-top:6px">' + P.done + ' / ' + P.total + ' action' + (P.total > 1 ? "s" : "") + ' validée' + (P.done > 1 ? "s" : "") + (P.objTotal ? ' · <span data-objall>' + P.objDone + ' / ' + P.objTotal + '</span> objectifs cochés' : "") + '</div>'
    + (P.status === "done" ? '<div class="confetti">🎉 Bravo, tout est fait !</div>' : "") + '</header>'
    + P.steps.map(stepHtml).join("") + helpHtml() + '<p class="muted center" style="font-size:13px">Tu peux revenir sur cette page quand tu veux : ton travail est gardé.</p>';
  Array.prototype.forEach.call(app.querySelectorAll("[data-chk]"), function (c) { c.onchange = function () { tick(c); }; });
  var ab = document.getElementById("ask-go"); if (ab) ab.onclick = function () { ask(ab); };
  Array.prototype.forEach.call(app.querySelectorAll("[data-send]"), function (b) { b.onclick = function () { send(b); }; });
  Array.prototype.forEach.call(app.querySelectorAll("textarea[data-ans]"), function (t) {
    t.addEventListener("keydown", function (e) { if (e.key === "Tab" && !t.classList.contains("prose")) { e.preventDefault(); var a = t.selectionStart; t.value = t.value.slice(0, a) + "  " + t.value.slice(t.selectionEnd); t.selectionStart = t.selectionEnd = a + 2; } });
  });
}
var ASK_ST = { waiting: "⏳ En attente", helping: "🙋 Ton formateur s'en occupe", done: "✓ Répondu", cancelled: "Annulée" };
function helpHtml() {
  var open = (P.asks || []).filter(function (a) { return a.status === "waiting" || a.status === "helping"; }).length;
  var h = '<section class="help" id="help"><h2>✋ Une question ? Besoin d\\'aide ?</h2><p class="muted" style="margin:0 0 10px;font-size:15px">Écris à ton formateur : ta question arrive dans sa file d\\'aide, il te répond ici et sur Discord.</p>';
  if (open) h += '<p class="hint">Ta demande est en cours : tu pourras en poser une autre quand ton formateur y aura répondu.</p>';
  else h += '<label class="lbl" for="ask-step" style="display:block">À propos de</label><select id="ask-step"><option value="">Mon plan en général</option>' + P.steps.map(function (s, i) { return '<option value="' + s.id + '">Action ' + (i + 1) + ' · ' + esc(s.title || s.notion) + '</option>'; }).join("") + '</select>'
    + '<textarea class="prose" id="ask-q" style="min-height:100px" maxlength="900" placeholder="Ce que tu ne comprends pas, ce que tu as déjà essayé, où tu bloques…"></textarea>'
    + '<details class="mine"><summary>Ajouter du code (facultatif)</summary><textarea id="ask-code" spellcheck="false" style="min-height:120px;margin-top:8px" placeholder="Colle ici le morceau de code qui pose problème"></textarea></details>'
    + '<div class="row"><button class="btn" id="ask-go">✋ Envoyer à mon formateur</button><span class="err" id="ask-err"></span></div>';
  if ((P.asks || []).length) h += '<div class="lbl">Mes questions</div><div class="asks">' + P.asks.map(function (a) {
    return '<div class="ask ' + a.status + '"><div class="st">' + (ASK_ST[a.status] || a.status) + (a.status === "waiting" && a.place ? ' · ' + (a.place === 1 ? "tu es le prochain" : a.place + "e dans la file") : "") + (a.stepTitle ? ' · ' + esc(a.stepTitle) : "") + '</div>'
      + '<div class="q">' + esc(a.question) + '</div>' + (a.reply ? '<div class="rep"><b>Ton formateur :</b> ' + rich(a.reply) + '</div>' : "") + '</div>'; }).join("") + '</div>';
  return h + '</section>';
}
function ask(b) {
  var q = document.getElementById("ask-q").value.trim(), err = document.getElementById("ask-err");
  if (q.length < 3) { err.textContent = "Écris ta question d'abord."; return; }
  b.disabled = true; b.textContent = "Envoi…";
  api("/ask", { question: q, step: document.getElementById("ask-step").value, code: document.getElementById("ask-code").value }).then(function () { return api("/data"); })
    .then(function (d) { P = d; draw(); document.getElementById("help").scrollIntoView({ block: "start", behavior: "smooth" }); })
    .catch(function (e) { b.disabled = false; b.textContent = "✋ Envoyer à mon formateur"; err.textContent = e.message; });
}
function tick(c) {
  var id = c.getAttribute("data-chk"), k = Number(c.getAttribute("data-i")), on = c.checked, li = c.closest("li");
  li.classList.toggle("on", on); c.disabled = true;
  api("/check", { step: id, i: k, on: on }).then(function (r) {
    var s = P.steps.filter(function (x) { return x.id === id; })[0]; s.checks = r.checks; c.disabled = false;
    var card = document.getElementById("s-" + id); card.querySelector("[data-objc]").textContent = r.checks.length + " / " + ((s.brief && s.brief.tasks) || []).length + " faits";
    return api("/data").then(function (d) { P.pct = d.pct; P.objDone = d.objDone; var b = app.querySelector(".bar i"); if (b) b.style.width = d.pct + "%"; var t = app.querySelector("[data-pct]"); if (t) t.textContent = d.pct + " %"; var o = app.querySelector("[data-objall]"); if (o) o.textContent = d.objDone + " / " + d.objTotal; });
  }).catch(function (e) { c.checked = !on; li.classList.toggle("on", !on); c.disabled = false; var cd = document.getElementById("s-" + id); if (cd) cd.querySelector("[data-objc]").textContent = e.message; });
}
function send(b) {
  var id = b.getAttribute("data-send"), card = document.getElementById("s-" + id), s = P.steps.filter(function (x) { return x.id === id; })[0], body = { step: id };
  if (s.kind === "brief") { body.link = card.querySelector("[data-link]").value.trim(); body.note = card.querySelector("[data-note]").value; }
  else if (s.kind === "mcq") body.answer = Array.prototype.map.call(card.querySelectorAll("input:checked"), function (i) { return Number(i.value); });
  else body.answer = card.querySelector("[data-ans]").value;
  b.disabled = true; var old = b.textContent; b.textContent = s.kind === "code" || s.kind === "answer" ? "Correction en cours…" : "Envoi…";
  api("/answer", body).then(function () { return api("/data"); }).then(function (d) { P = d; draw(); var el = document.getElementById("s-" + id); if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" }); })
    .catch(function (e) { b.disabled = false; b.textContent = old; card.querySelector("[data-err]").textContent = e.message; });
}
load();
</script></body></html>`;
