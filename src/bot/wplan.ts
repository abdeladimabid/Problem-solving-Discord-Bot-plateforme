// A student's plan d'action, the page they open from their DM: /wp/<token>
//   GET  /wp/<t>          the page
//   GET  /wp/<t>/data     the plan: the actions, what they answered, the corrections (never the expected answers)
//   POST /wp/<t>/answer   their answer to one action (checked at once: the AI for code and written answers)
//   POST /wp/<t>/check    a mini brief's objective ticked or unticked (the teacher sees it, it counts in the progress)
//   GET  /wp/<t>/guide    their guide (📚 Mes notions): each lacune explained with resources, ?lang=fr|ary|en
//   POST /wp/<t>/ask      a question for the teacher (✋ the Help queue; the answer comes back here and by DM)
import type { Env } from "../shared/types.ts";
import { forClass } from "../shared/aictx.ts";
import { WorkPlanError, readPlanToken, studentAnswer, studentAsk, studentCheck, studentView } from "../shared/workplan.ts";
import { getGuild } from "../shared/db.ts";
import { studentGuide } from "../shared/wpguide.ts";

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
  if (action === "guide" && request.method === "GET") {
    try { return json(await studentGuide(env, await getGuild(env, t.gid), t.id, new URL(request.url).searchParams.get("lang") || "fr")); }
    catch (e) { if (e instanceof WorkPlanError) return json({ error: e.message }, 400); throw e; }
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
  --k-challenge:#7c3aed;--k-code:#2563eb;--k-answer:#0891b2;--k-mcq:#db2777;--k-brief:#ea580c;--k-lesson:#0d9488}
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
.doc{font-size:16px;margin:10px 0 14px}.doc p{margin:6px 0}
.sec{border:1px solid var(--line);border-radius:14px;padding:12px 16px 8px;margin:12px 0;background:var(--bg)}
.sec-h{font-size:12.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--soft);margin:0 0 8px}
.sec.learn{background:var(--blue50);border-color:transparent}.sec.learn .sec-h{color:var(--blue)}
.sec.ex{background:var(--card);border:2px solid var(--kc)}.sec.ex .sec-h{color:var(--kc)}
pre.code{background:#0b1020;color:#e2e8f0;border:1px solid #1e293b;border-radius:12px;padding:12px 14px;margin:8px 0 10px;overflow:auto;font:13.5px/1.6 "JetBrains Mono",ui-monospace,Menlo,monospace;tab-size:2}
pre.code code{background:none;padding:0;color:inherit;font-size:inherit;border-radius:0}
ul.pts{margin:4px 0 8px;padding-left:22px}ul.pts li{margin:3px 0}ul.pts li.sub{margin-left:20px;list-style:circle}
ol.steps{list-style:none;padding:0;margin:6px 0 8px;display:grid;gap:8px}
ol.steps li{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:12px;background:var(--bg);border:1px solid var(--line)}
ol.steps .n{flex:none;width:24px;height:24px;border-radius:50%;background:var(--kc);color:#fff;font-weight:800;font-size:13px;display:grid;place-items:center;margin-top:1px}
textarea.code-in{background:#0b1020;color:#e2e8f0;border-color:#1e293b}
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
.k-challenge{--kc:var(--k-challenge)}.k-code{--kc:var(--k-code)}.k-answer{--kc:var(--k-answer)}.k-mcq{--kc:var(--k-mcq)}.k-brief{--kc:var(--k-brief)}.k-lesson{--kc:var(--k-lesson)}
.step.k-lesson{margin-top:26px;background:linear-gradient(180deg,var(--card),var(--bg));border-left-width:8px}.step.k-lesson h2{font-size:22px}
.lesson{font-size:15.5px}.lesson h3{font-size:16px;margin:16px 0 6px;color:var(--kc)}.lesson h3:first-child{margin-top:4px}.lesson p{margin:6px 0}
.lesson ul{margin:4px 0 8px;padding-left:22px}.lesson li{margin:3px 0}.lesson ul ul{margin:2px 0 4px}
.step.locked{opacity:.75;box-shadow:none}.step.locked .num{background:var(--faint)}.lock{color:var(--soft);font-size:14.5px;margin:8px 0 0}
details.peek summary{cursor:pointer;color:var(--kc);font-weight:700;font-size:14.5px;margin-top:8px}
.route{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px 20px;margin:0 0 16px;box-shadow:0 4px 18px #0f1d3a0c}
.route h2{font-size:18px;margin:0 0 4px}.route ol{list-style:none;padding:0;margin:10px 0 0;display:grid;gap:6px}
.route a{display:flex;gap:10px;align-items:center;padding:9px 12px;border-radius:12px;background:var(--bg);color:var(--ink);text-decoration:none;border:1px solid transparent}
.route a:hover{border-color:var(--k-lesson)}.route .ri{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:800;flex:none;background:var(--line);color:var(--soft)}
.route .done .ri{background:var(--good);color:#fff}.route .open .ri{background:var(--k-lesson);color:#fff}.route .locked{opacity:.65}
.route .rt{flex:1;font-weight:600}.route .rn{font-size:13px;color:var(--soft);white-space:nowrap}
.ctx{margin:10px 0 6px;padding:14px 16px;border-radius:14px;background:var(--bg);font-size:15.5px}.ctx h3{font-size:15px;margin:14px 0 6px}.ctx h3:first-child{margin-top:0}.ctx p{margin:4px 0}.ctx ul{margin:4px 0;padding-left:20px}.ctx li{margin:3px 0}
.confetti{font-size:15px;margin-top:10px;font-weight:700}
.tabs{display:flex;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:5px;margin:0 0 16px}
.tabs button{flex:1;border:0;background:none;color:var(--soft);font:inherit;font-weight:700;padding:11px 10px;border-radius:12px;cursor:pointer}
.tabs button[aria-selected=true]{background:var(--blue);color:#fff}.tabs button:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.guide .gh{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px}.guide h2{margin:0 0 4px;font-size:22px}.guide .gh p{margin:0;font-size:15px;max-width:520px}
.langs{display:flex;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--card)}.langs button{border:0;background:none;color:var(--soft);font:inherit;font-size:14px;font-weight:700;padding:8px 12px;cursor:pointer}
.langs button[aria-pressed=true]{background:var(--blue50);color:var(--blue)}.langs button+button{border-left:1px solid var(--line)}
.gload{display:flex;gap:12px;align-items:center;justify-content:center;padding:40px 10px;color:var(--soft);background:var(--card);border:1px solid var(--line);border-radius:18px}
.spin{width:20px;height:20px;border:3px solid var(--line);border-top-color:var(--blue);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.gintro{font-size:16.5px;margin:0 0 14px}
.notion-card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px;margin:0 0 14px;box-shadow:0 4px 18px #0f1d3a0c;border-top:5px solid var(--pc,var(--blue))}
.notion-card.p1{--pc:#dc2626}.notion-card.p2{--pc:#ea580c}.notion-card.p3{--pc:#2563eb}
.notion-card header{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.notion-card h3{margin:0;font-size:19px;flex:1;min-width:180px}
.gnum{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--pc);color:#fff;font-weight:800;font-size:14px;flex:none}
.gprio{font-size:12px;font-weight:800;padding:3px 10px;border-radius:99px;color:var(--pc);background:var(--bg)}
.gfor{margin:12px 0;padding:10px 14px;border-radius:12px;background:var(--warn50);font-size:15px}.gfor b,.gtest b{display:block;font-size:13px;margin-bottom:2px}
.gexp{font-size:16px;margin:10px 0}.glbl{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin:16px 0 6px}
.rtl .glbl{letter-spacing:0}.gpts,.gmis{margin:0;padding-inline-start:22px}.gpts li,.gmis li{margin:4px 0}.gmis li::marker{content:"⚠️ "}
.gcode{position:relative;background:var(--code);color:#e5edf9;border-radius:12px;padding:30px 14px 14px;overflow:auto;font-size:14px;line-height:1.5;margin:0;text-align:left}
.gcode code{background:none;padding:0;color:inherit}.glang{position:absolute;top:8px;left:12px;font:700 11px Inter,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#93a4c3}
.gnote{font-size:14px;margin:6px 0 0}.gtest{margin:14px 0 0;padding:12px 14px;border-radius:12px;background:var(--blue50);font-size:15px}
.gres{list-style:none;padding:0;margin:0;display:grid;gap:8px}.gres li{border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.gres a{display:flex;gap:10px;justify-content:space-between;align-items:baseline;color:var(--blue);text-decoration:none;flex-wrap:wrap}.gres a:hover b{text-decoration:underline}
.gvia{font-size:12px;color:var(--faint);white-space:nowrap}.gwhy{display:block;font-size:14px;color:var(--soft);margin-top:2px}
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
  api("/data").then(function (d) { P = d; if (TAB === "guide") loadGuide(GL); draw(); }).catch(function (e) { app.innerHTML = '<div class="full"><div><div class="big">😕</div><p>' + esc(e.message) + '</p></div></div>'; });
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
// A line of code (HTML, CSS, JS, PHP, SQL), not a sentence: what goes in a dark code block.
function isCode(raw) {
  var t = raw.trim(), prose = t.replace(/\\/\\/.*$/, "");
  if (!t || /^\\x60/.test(t)) return false;
  if (/^(<\\/?[a-zA-Z!?][^>]*>|\\/\\/|\\/\\*|\\*\\/|[}\\])]|@media|<\\?php)/.test(t)) return true;
  if (/^(const|let|var|function|return|if|else|for|while|switch|class|import|export|async|await|try|catch|SELECT|INSERT|UPDATE|DELETE|CREATE)\\b/.test(t)) return true;
  if (/[;{]\\s*(\\/\\/.*)?$/.test(t) && !/[àâçéèêëîïôûùü]/i.test(prose)) return true;
  return /^[\\w$.\\[\\]"'()]+\\s*\\([^)]*\\)\\s*;?\\s*(\\/\\/.*)?$/.test(t);
}
function codeBlock(lines) {
  var pad = Math.min.apply(null, lines.filter(function (l) { return l.trim(); }).map(function (l) { return l.match(/^\\s*/)[0].length; }).concat([99]));
  return '<pre class="code"><code>' + esc(lines.map(function (l) { return l.slice(pad === 99 ? 0 : pad); }).join("\\n")) + "</code></pre>";
}
// An exercise or a part of the course, structured: a line starting with an emoji (or "## ") opens a section (the lesson,
// the page, the exercise…), code lines go in a dark block (or between \x60\x60\x60), "1. " lines are the questions, "- " / "• " lists
function docHtml(text) {
  var L = String(text || "").replace(/\\r/g, "").split("\\n"), html = "", body = "", head = null, kind = "", tag = "";
  var endList = function () { if (tag) { body += "</" + tag + ">"; tag = ""; } };
  var list = function (t) { if (tag !== t) { endList(); body += "<" + t + ' class="' + (t === "ol" ? "steps" : "pts") + '">'; tag = t; } };
  var flush = function () { endList(); html += head !== null ? '<section class="sec ' + kind + '"><div class="sec-h">' + rich(head) + "</div>" + body + "</section>" : body; body = ""; head = null; kind = ""; };
  for (var i = 0; i < L.length; i++) {
    var raw = L[i], t = raw.trim(), m;
    if (/^\\x60\\x60\\x60/.test(t)) { endList(); var fenced = []; i++; while (i < L.length && !/^\\x60\\x60\\x60/.test(L[i].trim())) fenced.push(L[i++]); body += codeBlock(fenced); continue; }
    if (!t) { endList(); continue; }
    if (/^#{1,3}\\s/.test(t) || (/^\\p{Extended_Pictographic}/u.test(t) && t.length <= 90)) {
      flush(); head = t.replace(/^#+\\s*/, "").replace(/\\s*:$/, "");
      // (« la page utilisée dans les exercices » is the page, not the exercise)
      kind = /\\bpage\\b|\\.html|fichier/i.test(head) ? "file" : /exercice|à toi|consigne|question|ta mission/i.test(head) ? "ex" : /leçon|retenir|important|astuce/i.test(head) ? "learn" : "";
      continue;
    }
    if ((m = t.match(/^(\\d+)[.)]\\s+(.*)$/))) { list("ol"); body += '<li><span class="n">' + m[1] + "</span><span>" + rich(m[2]) + "</span></li>"; continue; }
    if ((m = raw.match(/^(\\s*)[-•*○●–]\\s+(.*)$/))) { list("ul"); body += "<li" + (m[1].length >= 2 ? ' class="sub"' : "") + ">" + rich(m[2]) + "</li>"; continue; }
    endList();
    if (isCode(raw)) {
      var code = [raw];
      while (i + 1 < L.length && L[i + 1].trim() && (isCode(L[i + 1]) || /^\\s+\\S/.test(L[i + 1]))) code.push(L[++i]);
      body += codeBlock(code); continue;
    }
    body += "<p>" + rich(t) + "</p>";
  }
  flush();
  return html;
}
var PARTN = 0;
function stepHtml(s, i) {
  var done = s.state === "done", h = "";
  if (s.kind === "lesson") PARTN++;
  // a locked part: its questions hidden until the part before is passed
  if (s.locked && s.kind !== "lesson") return '<article class="step locked k-' + s.kind + '" id="s-' + s.id + '"><div class="sh"><span class="num">🔒</span><span class="kind">' + esc(s.kindLabel) + '</span>'
    + (s.notion ? '<span class="notion">' + esc(s.notion) + '</span>' : "") + '</div><p class="lock">Se débloque quand tu as réussi les questions de la partie d\\'avant.</p></article>';
  h += '<article class="step k-' + s.kind + (done ? " done" : "") + (s.locked ? " locked" : "") + '" id="s-' + s.id + '"><div class="sh"><span class="num">' + (s.locked ? "🔒" : done ? "✓" : s.kind === "lesson" ? PARTN : i + 1) + '</span><span class="kind">' + esc(s.kindLabel) + (s.kind === "lesson" ? " " + PARTN : "") + '</span>'
    + (s.notion ? '<span class="notion">' + esc(s.notion) + '</span>' : "") + (s.locked ? "" : '<span class="state ' + s.state + '">' + (s.kind === "lesson" && done ? "✓ Étudiée" : STATE[s.state] || "") + '</span>') + '</div>';
  h += '<h2>' + esc(s.title) + '</h2>' + (s.why ? '<p class="why">' + rich(s.why) + '</p>' : "");
  if (s.kind === "lesson") {
    if (s.locked) return h + '<p class="lock">🔒 Cette partie s\\'ouvre quand tu as réussi toutes les questions de la partie d\\'avant.</p><details class="peek"><summary>Voir ce qu\\'elle contient</summary><div class="doc lesson">' + docHtml(s.prompt) + '</div></details></article>';
    h += '<div class="doc lesson">' + docHtml(s.prompt) + '</div>';
    if (!done) h += '<div class="row"><button class="btn" data-send="' + s.id + '">✓ J\\'ai étudié cette partie</button><span class="muted" style="font-size:14px">Puis réponds aux questions juste après.</span><span class="err" data-err></span></div>';
    return h + '</article>';
  }
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
    h += '<div class="doc">' + docHtml(s.prompt) + '</div>';
    if (!done) {
      if (s.kind === "mcq") {
        var mine = s.work && Array.isArray(s.work.answer) ? s.work.answer : [];
        h += (s.multi ? '<p class="muted" style="margin:-6px 0 10px;font-size:14px">Plusieurs bonnes réponses possibles.</p>' : "") + '<div class="choices">' + s.choices.map(function (c, k) {
          return '<label class="choice"><input type="' + (s.multi ? "checkbox" : "radio") + '" name="c-' + s.id + '" value="' + k + '"' + (mine.indexOf(k) >= 0 ? " checked" : "") + '><span>' + rich(c) + '</span></label>'; }).join("") + '</div>';
      } else {
        var val = s.work && typeof s.work.answer === "string" ? s.work.answer : (s.kind === "code" ? s.starter || "" : "");
        h += '<div class="lbl">' + (s.kind === "code" ? "💻 Ton code" : "✍️ Ta réponse") + '</div><textarea data-ans class="' + (s.kind === "code" ? "code-in" : "prose") + '" spellcheck="' + (s.kind === "code" ? "false" : "true") + '" placeholder="' + (s.kind === "code" ? "Écris ton code ici" : "Ta réponse, avec tes mots") + '">' + esc(val) + '</textarea>';
      }
      h += '<div class="row"><button class="btn" data-send="' + s.id + '">' + (s.work ? "Vérifier à nouveau" : "Vérifier ma réponse") + '</button>' + (s.work && s.work.tries ? '<span class="muted" style="font-size:14px">Essai ' + s.work.tries + '</span>' : "") + '<span class="err" data-err></span></div>';
    } else if (s.work && s.work.answer != null) {
      var shown = Array.isArray(s.work.answer) ? s.work.answer.map(function (k) { return s.choices[k]; }).join(" · ") : s.work.answer;
      h += '<details class="mine"><summary>Ta réponse</summary><pre>' + esc(shown) + '</pre></details>';
    }
  }
  if (s.work && s.work.verdict && s.kind !== "challenge") h += '<div class="fb ' + s.work.verdict + '"><b>' + (s.kind === "brief" ? "Envoyé à ton formateur" : VERDICT[s.work.verdict] || "") + '</b>' + rich(s.work.comment || (s.kind === "brief" ? "Il te dira s'il est validé." : "")) + '</div>';
  if (s.review) h += '<div class="teacher"><b>' + (s.review.ok ? "✓ Validé par ton formateur" : "↻ Ton formateur te demande de le reprendre") + '</b>' + (s.review.comment ? '<div style="white-space:pre-wrap">' + rich(s.review.comment) + '</div>' : "") + '</div>';
  return h + '</article>';
}
var TAB = location.hash === "#notions" ? "guide" : "actions", GL = "fr", G = {};
try { GL = localStorage.getItem("wp-guide-lang") || "fr"; } catch (e) {}
var GLANG = { fr: "Français", ary: "الدارجة", en: "English" };
var GT = {
  fr: { title: "Mes notions", sub: "Pour chaque notion à travailler : pourquoi elle compte pour toi, l'essentiel à comprendre, un exemple, les pièges, un petit test, et des ressources pour aller plus loin.", forYou: "Pourquoi pour toi", keys: "À retenir", ex: "Exemple", mis: "Erreurs à éviter", test: "Teste-toi", res: "Pour aller plus loin", making: "Ton guide se prépare… (moins d'une minute)", prio: { 1: "Prioritaire", 2: "Important", 3: "À consolider" }, tr: "Traduction en cours…" },
  ary: { title: "المفاهيم ديالي", sub: "على كل مفهوم خاصك تخدم عليه: علاش مهم ليك، شنو خاصك تفهم، مثال، الأخطاء اللي خاصك تتجنب، تمرين صغير، وموارد باش تزيد القدام.", forYou: "علاش مهم ليك", keys: "شنو خاصك تعقل", ex: "مثال", mis: "أخطاء خاصك تتجنبها", test: "جرب راسك", res: "باش تزيد القدام", making: "الدليل ديالك كيتوجد… (أقل من دقيقة)", prio: { 1: "أولوية", 2: "مهم", 3: "خاصو يتقوى" }, tr: "كنترجمو…" },
  en: { title: "My concepts", sub: "For each concept to work on: why it matters for you, the essentials, an example, the traps, a small self-test, and resources to go further.", forYou: "Why it matters for you", keys: "Key points", ex: "Example", mis: "Mistakes to avoid", test: "Test yourself", res: "Go further", making: "Your guide is being prepared… (less than a minute)", prio: { 1: "Priority", 2: "Important", 3: "To strengthen" }, tr: "Translating…" },
};
function tabsHtml() {
  return '<nav class="tabs" role="tablist"><button role="tab" data-tab="actions" aria-selected="' + (TAB === "actions") + '">🧭 Mes actions</button><button role="tab" data-tab="guide" aria-selected="' + (TAB === "guide") + '">📚 Mes notions</button></nav>';
}
function guideHtml() {
  var t = GT[GL] || GT.fr, g = G[GL], rtl = GL === "ary";
  var h = '<section class="guide' + (rtl ? ' rtl" dir="rtl" lang="ar"' : '"') + '><div class="gh"><div><h2>📚 ' + esc(t.title) + '</h2><p class="muted">' + esc(t.sub) + '</p></div>'
    + '<div class="langs" role="group" aria-label="Langue">' + ["fr", "ary", "en"].map(function (l) { return '<button data-lang="' + l + '" aria-pressed="' + (GL === l) + '"' + (l === "ary" ? ' lang="ar"' : "") + '>' + GLANG[l] + '</button>'; }).join("") + '</div></div>';
  if (!g || g.loading) return h + '<div class="gload"><span class="spin"></span>' + esc(g && g.making ? t.making : g && g.loading && GL !== "fr" ? t.tr : t.making) + '</div></section>';
  if (g.state === "failed") return h + '<div class="fb wrong">' + esc(g.error || "") + '</div></section>';
  var d = g.guide;
  h += (g.error ? '<div class="fb partial">' + esc(g.error) + '</div>' : "") + '<div>' + (d.intro ? '<p class="gintro">' + rich(d.intro) + '</p>' : "");
  d.items.forEach(function (x, i) {
    h += '<article class="notion-card p' + x.priority + '"><header><span class="gnum">' + (i + 1) + '</span><h3>' + rich(x.notion) + '</h3><span class="gprio">' + esc(t.prio[x.priority] || "") + '</span></header>'
      + (x.forYou ? '<div class="gfor"><b>' + esc(t.forYou) + '</b>' + rich(x.forYou) + '</div>' : "")
      + '<div class="gexp">' + rich(x.explain).replace(/\\n/g, "<br>") + '</div>'
      + (x.points.length ? '<div class="glbl">' + esc(t.keys) + '</div><ul class="gpts">' + x.points.map(function (p) { return "<li>" + rich(p) + "</li>"; }).join("") + '</ul>' : "")
      + (x.example ? '<div class="glbl">' + esc(t.ex) + '</div><pre class="gcode" dir="ltr"><span class="glang">' + esc(x.example.lang) + '</span><code>' + esc(x.example.code) + '</code></pre>' + (x.example.note ? '<p class="muted gnote">' + rich(x.example.note) + '</p>' : "") : "")
      + (x.mistakes.length ? '<div class="glbl">' + esc(t.mis) + '</div><ul class="gmis">' + x.mistakes.map(function (p) { return "<li>" + rich(p) + "</li>"; }).join("") + '</ul>' : "")
      + (x.selfTest ? '<div class="gtest"><b>✍️ ' + esc(t.test) + '</b>' + rich(x.selfTest) + '</div>' : "")
      + (x.resources.length ? '<div class="glbl">' + esc(t.res) + '</div><ul class="gres">' + x.resources.map(function (r) {
        return '<li><a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer"><b dir="auto">' + esc(r.title) + '</b><span class="gvia">' + esc(r.via) + ' ↗</span></a>' + (r.note ? '<span class="gwhy">' + rich(r.note) + '</span>' : "") + '</li>'; }).join("") + '</ul>' : "")
      + '</article>';
  });
  return h + '</div></section>';
}
function loadGuide(l) {
  if (G[l] && !G[l].loading && G[l].state === "ready") return;
  G[l] = { loading: true, making: !G.fr || G.fr.loading };
  api("/guide?lang=" + l).then(function (d) {
    if (d.state === "making") { G[l] = { loading: true, making: true }; setTimeout(function () { delete G[l]; if (TAB === "guide" && GL === l) loadGuide(l); }, 6000); }
    else { G[l] = d; if (d.state === "ready" && d.lang === "fr") G.fr = d; }
    if (TAB === "guide" && GL === l) draw();
  }).catch(function (e) { G[l] = { state: "failed", error: e.message }; if (TAB === "guide" && GL === l) draw(); });
  if (TAB === "guide") draw();
}
function draw() {
  var pct = P.pct != null ? P.pct : P.total ? Math.round(100 * P.done / P.total) : 0;
  app.innerHTML = '<header class="hero"><div class="eyebrow">🧭 Mon plan d\\'action</div><h1>' + esc(P.title) + '</h1>'
    + '<div>' + (P.parts.length ? P.parts.length + ' partie' + (P.parts.length > 1 ? "s" : "") + ' de cours, chacune avec ses questions' + (P.gated ? " : la suivante s\\'ouvre quand tu as tout réussi" : "")
      : P.total + ' action' + (P.total > 1 ? "s" : "") + ' choisie' + (P.total > 1 ? "s" : "") + ' pour toi') + (P.due_at ? ', à faire avant le ' + esc(when(P.due_at)) : "") + '.</div>'
    + (P.message ? '<div class="msg">' + rich(P.message) + '</div>' : "")
    + '<div class="prog"><div class="bar"><i style="width:' + pct + '%"></i></div><b data-pct>' + pct + ' %</b></div><div style="font-size:14px;opacity:.9;margin-top:6px">' + P.done + ' / ' + P.total + ' action' + (P.total > 1 ? "s" : "") + ' validée' + (P.done > 1 ? "s" : "") + (P.objTotal ? ' · <span data-objall>' + P.objDone + ' / ' + P.objTotal + '</span> objectifs cochés' : "") + '</div>'
    + (P.status === "done" ? '<div class="confetti">🎉 Bravo, tout est fait !</div>' : "") + '</header>'
    + tabsHtml() + (TAB === "guide" ? guideHtml() : routeHtml() + (PARTN = 0, P.steps.map(stepHtml).join("")) + helpHtml()) + '<p class="muted center" style="font-size:13px">Tu peux revenir sur cette page quand tu veux : ton travail est gardé.</p>';
  Array.prototype.forEach.call(app.querySelectorAll("[data-chk]"), function (c) { c.onchange = function () { tick(c); }; });
  var ab = document.getElementById("ask-go"); if (ab) ab.onclick = function () { ask(ab); };
  Array.prototype.forEach.call(app.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { TAB = b.getAttribute("data-tab"); try { history.replaceState(null, "", TAB === "guide" ? "#notions" : location.pathname); } catch (e) {} if (TAB === "guide") loadGuide(GL); draw(); }; });
  Array.prototype.forEach.call(app.querySelectorAll("[data-lang]"), function (b) { b.onclick = function () { GL = b.getAttribute("data-lang"); try { localStorage.setItem("wp-guide-lang", GL); } catch (e) {} loadGuide(GL); draw(); }; });
  Array.prototype.forEach.call(app.querySelectorAll("[data-send]"), function (b) { b.onclick = function () { send(b); }; });
  Array.prototype.forEach.call(app.querySelectorAll("textarea[data-ans]"), function (t) {
    t.addEventListener("keydown", function (e) { if (e.key === "Tab" && !t.classList.contains("prose")) { e.preventDefault(); var a = t.selectionStart; t.value = t.value.slice(0, a) + "  " + t.value.slice(t.selectionEnd); t.selectionStart = t.selectionEnd = a + 2; } });
  });
}
// 🗺️ the course's parts, where they are in it (a gated plan: the next one opens when the one before is passed)
function routeHtml() {
  if (!P.parts.length) return "";
  var ICO = { done: "✓", open: "▶", locked: "🔒" };
  return '<section class="route"><h2>🗺️ Mon parcours</h2><p class="muted" style="margin:0;font-size:14.5px">' + (P.gated ? "Étudie chaque partie puis réussis ses questions : la partie suivante s\\'ouvre alors." : "Étudie chaque partie puis réponds à ses questions.") + '</p><ol>'
    + P.parts.map(function (x, k) { return '<li class="' + x.state + '"><a href="#s-' + x.first + '"><span class="ri">' + (x.state === "open" ? k + 1 : ICO[x.state]) + '</span><span class="rt">' + esc(x.title) + '</span><span class="rn">' + (x.state === "locked" ? "fermée" : x.done + " / " + x.total) + '</span></a></li>'; }).join("")
    + '</ol></section>';
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
  if (s.kind === "lesson") body.read = true;
  else if (s.kind === "brief") { body.link = card.querySelector("[data-link]").value.trim(); body.note = card.querySelector("[data-note]").value; }
  else if (s.kind === "mcq") body.answer = Array.prototype.map.call(card.querySelectorAll("input:checked"), function (i) { return Number(i.value); });
  else body.answer = card.querySelector("[data-ans]").value;
  b.disabled = true; var old = b.textContent; b.textContent = s.kind === "code" || s.kind === "answer" ? "Correction en cours…" : "Envoi…";
  var opened = function (d) { return d.parts.filter(function (x) { return x.state !== "locked"; }).length; }, was = opened(P);
  api("/answer", body).then(function () { return api("/data"); }).then(function (d) {
    P = d; draw();
    // a part just passed: the next one opens, it's shown
    var nx = opened(d) > was ? d.parts[opened(d) - 1] : null, el = document.getElementById("s-" + (nx ? nx.first : id));
    if (el) el.scrollIntoView({ block: nx ? "start" : "nearest", behavior: "smooth" });
    if (nx && el) { var n = document.createElement("div"); n.className = "fb correct"; n.innerHTML = "<b>🎉 Partie suivante ouverte</b>Bravo, tu as réussi toutes les questions de la partie d\\'avant."; el.insertBefore(n, el.children[1]); }
  })
    .catch(function (e) { b.disabled = false; b.textContent = old; card.querySelector("[data-err]").textContent = e.message; });
}
load();
</script></body></html>`;
