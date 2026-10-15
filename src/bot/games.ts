// 🎮 Class games pages (public, on the bot Worker):
//   GET  /game/<id>.<tv>            the class TV (with the teacher's buttons)     GET  /play/<id>.<code>           a student's phone / laptop
//   GET  /game/<id>.<tv>/state      what the TV shows                              GET  /play/<id>.<code>/roster    the names to pick from
//   POST /game/<id>.<tv>/act        start / reveal / next / stop / kick / pardon   POST /play/<id>.<code>/join      this device plays for that name
//                                   results (relay tests) / reset                  GET  /play/<id>.<code>/state     what this student sees
//   GET  /game/<id>.<tv>/qr.svg     the QR code of the join link                   POST /play/<id>.<code>/answer|revive|check|hint|accuse|code|noise|mic
//   GET  /game/<id>.<tv>/codes      relay: every squad's code + the tests (run on the TV)
//                                                                                  GET  /play/<id>.<code>/case      sql: the story, the database, the clues
import type { Env } from "../shared/types.ts";
import { GameError, accuseSql, answerRoyale, caseForPlayers, gameCase, relayStarter, tryRelay, checkSql, getGame, hintSql, hostAction, joinGame, joinUrl, liveGame, noiseRelay, playerByKey, playerView, reviveRoyale, rosterOf, saveRelayCode, teamsOf, tvView } from "../shared/games.ts";
import type { GAction, Game, Player } from "../shared/games.ts";
import { qrSvg } from "../shared/qr.ts";
import { now, run } from "../shared/db.ts";

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const html = (body: string) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" } });
const esc = (s: string) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]!));
const GONE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Class game</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0b1020;color:#e7edf8;font:18px system-ui,sans-serif;text-align:center"><div><div style="font-size:64px">🎮</div><p>This game doesn't exist anymore.<br>Ask your teacher for the new link.</p></div></body>`;
const HOST_ACTIONS = ["start", "reveal", "next", "stop", "kick", "pardon", "results", "runtests", "reset"];

async function body(request: Request): Promise<any> { try { return await request.json(); } catch { return {}; } }

export async function handleGame(request: Request, env: Env, who: "tv" | "play", id: number, token: string, action: string | undefined): Promise<Response> {
  const g0 = await getGame(env, id);
  const ok = g0 && (who === "tv" ? g0.tv_token : g0.join_code) === token;
  if (!g0 || !ok) return action ? json({ error: "This game doesn't exist anymore." }, 404) : html(GONE);
  const gm = await liveGame(env, g0);
  const url = new URL(request.url);
  try {
    if (who === "tv") {
      if (!action) return html(TV(gm));
      if (action === "state") {
        const since = Number(url.searchParams.get("seq") || 0);
        // nothing new: a tiny answer (the clocks run on the screen); during a royale question the answer count moves
        if (since && since === gm.state.seq && !(gm.kind === "royale" && gm.state.phase === "question") && !(gm.kind === "relay" && gm.state.phase === "playing")) return json({ seq: gm.state.seq, same: true, now: Date.now() });
        return json(await tvView(env, gm));
      }
      if (action === "qr.svg") return new Response(qrSvg(joinUrl(env, gm), { dark: "#0b1020" }), { headers: { "content-type": "image/svg+xml", "cache-control": "no-store" } });
      if (action === "codes" && gm.kind === "relay") {
        const teams = await teamsOf(env, gm.id);
        return json({ fn: gm.content.task.fn, tests: gm.content.task.tests, codes: Object.fromEntries(teams.map((t) => [t.squad, t.data.out ? null : t.data.code ?? relayStarter(gm)])) });
      }
      if (action === "act" && request.method === "POST") {
        const b = await body(request);
        if (!HOST_ACTIONS.includes(b.a)) return json({ error: "unknown action" }, 400);
        await hostAction(env, gm, b as GAction);
        return json(await tvView(env, (await getGame(env, gm.id))!));
      }
      return json({ error: "unknown" }, 404);
    }
    // ---- a student
    if (!action) return html(PLAY(gm));
    if (action === "roster") return json({ title: gm.title, kind: gm.kind, phase: gm.state.phase, names: await rosterOf(env, gm) });
    if (action === "case" && gm.kind === "sql") return new Response(JSON.stringify(caseForPlayers(gameCase(gm))), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, max-age=600" } });
    const b = request.method === "POST" ? await body(request) : {};
    const key = String(b.key || url.searchParams.get("key") || request.headers.get("x-player-key") || "").slice(0, 64);
    if (action === "join" && request.method === "POST") {
      const p = await joinGame(env, gm, key, String(b.pid || "").slice(0, 25));
      return json(await playerView(env, (await getGame(env, gm.id))!, p));
    }
    const p = await playerByKey(env, gm.id, key);
    if (!p) return json({ error: "Pick your name first.", join: true }, 403);
    if (!p.seen || now() - p.seen >= 20) await run(env, "UPDATE game_players SET seen = ? WHERE game_id = ? AND pid = ?", now(), gm.id, p.pid);
    if (action === "state") {
      const since = Number(url.searchParams.get("seq") || 0);
      if (since && since === gm.state.seq && gm.kind !== "relay") return json({ seq: gm.state.seq, same: true, now: Date.now() });
      return json(await playerView(env, gm, p));
    }
    if (request.method !== "POST") return json({ error: "unknown" }, 404);
    const fresh = async (x: Player = p) => playerView(env, (await getGame(env, gm.id))!, (await playerByKey(env, gm.id, key)) ?? x);
    switch (action) {
      case "answer": await answerRoyale(env, gm, p, Number(b.step), Number(b.choice)); return json(await fresh());
      case "revive": await reviveRoyale(env, gm, p, String(b.target || "")); return json(await fresh());
      case "check": return json(await checkSql(env, gm, p, Number(b.step), Array.isArray(b.rows) ? b.rows : []));
      case "hint": return json(await hintSql(env, gm, p));
      case "accuse": return json(await accuseSql(env, gm, p, String(b.name || "").slice(0, 80)));
      case "code": await saveRelayCode(env, gm, p, Number(b.turn), String(b.code ?? "")); return json({ ok: true, at: Date.now() });
      case "noise": return json(await noiseRelay(env, gm, p));
      case "try": return json(await tryRelay(env, gm, p, String(b.code ?? "")));
      case "mic": await run(env, "UPDATE game_players SET mic = ? WHERE game_id = ? AND pid = ?", b.on ? 1 : 0, gm.id, p.pid); return json({ ok: true });
    }
    return json({ error: "unknown" }, 404);
  } catch (e) {
    if (e instanceof GameError) return json({ error: e.message }, 409);
    throw e;
  }
}

// =================================================================== shared look
const CSS = `
:root{--bg:#070b18;--card:rgba(255,255,255,.06);--line:rgba(255,255,255,.12);--ink:#eef3ff;--soft:#9fb0d4;--good:#22c55e;--bad:#ef4444;--warn:#f59e0b;--acc:#8b5cf6;--A:#ef4444;--B:#3b82f6;--C:#f59e0b;--D:#22c55e}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--ink);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
body{background:radial-gradient(1100px 650px at 10% 0%,rgba(139,92,246,.22),transparent 60%),radial-gradient(1100px 650px at 100% 100%,rgba(6,182,212,.16),transparent 60%),var(--bg)}
button{font:inherit;cursor:pointer}
.btn{border:0;border-radius:999px;padding:12px 20px;font-weight:800;background:rgba(255,255,255,.12);color:#fff}
.btn:hover{background:rgba(255,255,255,.2)}.btn.primary{background:linear-gradient(90deg,#8b5cf6,#06b6d4)}.btn.danger{background:rgba(239,68,68,.25)}
.btn:disabled{opacity:.4;cursor:default}
.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.08);font-weight:700}
pre.code{margin:0;background:#0b1224;border:1px solid var(--line);border-radius:16px;padding:14px 18px;font:600 15px/1.5 "JetBrains Mono","Fira Code",Consolas,monospace;white-space:pre-wrap;text-align:left;overflow:auto}
.muted{color:var(--soft)}
@keyframes pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
@keyframes fall{0%{transform:none;opacity:1}100%{transform:translateY(40px) rotate(12deg);opacity:0}}
@keyframes bob{50%{transform:translateY(-10px)}}
@keyframes shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
`;
// the tests of Code Relay run in a Web Worker (never in the page): a loop that never ends is stopped after 4 s
const WORKER = `onmessage=function(e){var d=e.data,f;function show(v){try{return v===undefined?"undefined":JSON.stringify(v)}catch(x){return String(v)}}
function same(a,b){if(typeof a==="number"&&typeof b==="number")return Math.abs(a-b)<1e-6;try{return JSON.stringify(a)===JSON.stringify(b)}catch(x){return false}}
try{f=new Function(d.code+"\\n;return typeof "+d.fn+"===\\"function\\"?"+d.fn+":null;")()}catch(x){postMessage({error:"Erreur : "+x.message,out:[]});return}
if(!f){postMessage({error:"La fonction "+d.fn+" n'existe pas.",out:[]});return}
postMessage({out:d.tests.map(function(t){try{var got=f.apply(null,JSON.parse(JSON.stringify(t.args)));return{ok:same(got,t.expect),got:show(got)}}catch(x){return{ok:false,got:"Erreur : "+x.message}}})})}`;
const RUNNER = `function runTests(code,fn,tests){return new Promise(function(res){var w;try{w=new Worker(URL.createObjectURL(new Blob([${JSON.stringify(WORKER)}],{type:"text/javascript"})))}catch(x){res({error:"Tests unavailable here",out:[]});return}
var t=setTimeout(function(){w.terminate();res({error:"Trop long (une boucle infinie ?)",out:[]})},4000);
w.onmessage=function(e){clearTimeout(t);w.terminate();res(e.data)};w.onerror=function(e){clearTimeout(t);w.terminate();res({error:"Erreur : "+(e.message||"?"),out:[]})};w.postMessage({code:code||"",fn:fn,tests:tests})})}`;

// =================================================================== the TV
const TV = (gm: Game) => `<!doctype html><html lang="${gm.settings.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(gm.title)}</title><style>${CSS}
html,body{height:100%;overflow:hidden}
.top{position:fixed;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:1.4vh 2vw;font-weight:800;font-size:1.2vw;color:var(--soft);z-index:5}
.top b{color:var(--ink)}
#app{position:fixed;inset:7vh 2vw 9vh;display:grid}
.bar{position:fixed;left:0;right:0;bottom:0;display:flex;gap:.8vw;align-items:center;justify-content:center;padding:1.4vh;z-index:6}
.bar .btn{font-size:1vw;padding:1.2vh 1.6vw}
.lobby{display:grid;grid-template-columns:auto 1fr;gap:4vw;align-items:center}
.qr{background:#fff;border-radius:24px;padding:1.2vw;width:24vw;height:24vw}.qr img{width:100%;height:100%}
.join{font-size:1.4vw;color:var(--soft);margin-top:1.4vh;text-align:center}.join b{color:var(--ink);font-size:1.7vw}
h1.big{font-size:3.6vw;margin:0 0 1vh}h2{font-size:1.8vw;margin:0 0 1vh}
.story{font-size:1.4vw;line-height:1.5;color:#dbe4fb;max-width:58vw}
.plist{display:flex;flex-wrap:wrap;gap:.7vw;margin-top:2vh;max-height:46vh;overflow:auto}
.pl{padding:.8vh 1.1vw;border-radius:999px;font-weight:800;font-size:1.15vw;background:var(--c,rgba(255,255,255,.1));animation:pop .4s;border:0;color:#fff}
.pl.dead{opacity:.35;text-decoration:line-through}
.pl:hover{outline:2px solid #fff}
.sqrow{display:flex;flex-wrap:wrap;gap:1vw;margin-top:1.4vh}
.sqbox{border-radius:18px;padding:1.2vh 1vw;background:var(--card);border:2px solid var(--c);min-width:12vw}
.sqbox b{display:block;font-size:1.3vw;margin-bottom:.6vh}
/* royale */
.q{display:grid;grid-template-rows:auto auto 1fr;gap:2vh;align-content:start}
.qhead{display:flex;justify-content:space-between;align-items:center;font-size:1.5vw;font-weight:800}
.ring{width:9vw;height:9vw;position:relative}.ring svg{width:100%;height:100%;transform:rotate(-90deg)}.ring circle{fill:none;stroke-width:10}
.ring .bgc{stroke:rgba(255,255,255,.1)}.ring .fg{stroke:var(--acc);stroke-linecap:round}.ring span{position:absolute;inset:0;display:grid;place-items:center;font-size:3vw;font-weight:900}
.prompt{font-size:2.6vw;font-weight:800;text-align:center;line-height:1.25;text-wrap:balance}
.q pre.code{font-size:1.6vw;max-width:70vw;margin:0 auto}
.opts{display:grid;grid-template-columns:1fr 1fr;gap:1.6vh 1.4vw}
.opt{position:relative;display:flex;gap:1vw;align-items:center;padding:2.4vh 1.6vw;border-radius:22px;font-size:1.9vw;font-weight:800;background:var(--o);overflow:hidden;transition:opacity .4s,transform .4s}
.opt i{position:absolute;left:0;top:0;bottom:0;background:rgba(255,255,255,.18);transition:width .8s}
.opt b{position:relative;display:grid;place-items:center;min-width:3.4vw;height:3.4vw;border-radius:12px;background:rgba(0,0,0,.25)}
.opt span{position:relative}.opt em{position:relative;margin-left:auto;font-style:normal;font-size:1.6vw}
.opt.no{opacity:.25;transform:scale(.97)}.opt.yes{box-shadow:0 0 0 6px #fff;transform:scale(1.02)}
.banner{text-align:center;font-size:2.2vw;font-weight:900;animation:pop .5s}
.outs{display:flex;flex-wrap:wrap;justify-content:center;gap:.7vw;margin-top:1vh}
.outs .pl{animation:fall 2.4s 1.2s forwards;background:rgba(239,68,68,.5)}
.alive{display:flex;flex-wrap:wrap;gap:.4vw;justify-content:center;max-height:12vh;overflow:hidden}
.alive .pl{font-size:.9vw;padding:.4vh .7vw}
.win{text-align:center;display:grid;place-items:center;align-content:center;gap:1.6vh}
.win .trophy{font-size:9vw;animation:bob 2s ease-in-out infinite}.win h1{font-size:4.4vw;margin:0}.win p{font-size:1.6vw;color:var(--soft);max-width:70vw;margin:0 auto}
/* sql */
.race{display:grid;grid-template-columns:1fr 26vw;gap:2vw;min-height:0}
.rrow{display:grid;grid-template-columns:16vw 1fr 9vw;gap:1vw;align-items:center;padding:1.4vh 1vw;border-radius:18px;background:var(--card);margin-bottom:1.2vh;border-left:8px solid var(--c)}
.rrow .nm{font-size:1.5vw;font-weight:900}.dots{display:flex;gap:.6vw;align-items:center}
.dot{width:3vw;height:3vw;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.08);font-size:1.4vw;font-weight:900}
.dot.ok{background:var(--good);animation:pop .5s}.dot.now{outline:3px dashed var(--warn)}.dot.final{border-radius:12px}
.feed{background:var(--card);border-radius:18px;padding:1.4vh 1vw;overflow:hidden}.feed div{padding:.8vh 0;border-bottom:1px solid var(--line);font-size:1.15vw;animation:pop .4s}
.clock{font-size:2vw;font-weight:900;font-variant-numeric:tabular-nums}
/* relay */
.rgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(26vw,1fr));gap:1.4vw;align-content:start}
.rcard{border-radius:22px;padding:1.6vh 1.2vw;background:var(--card);border:3px solid var(--c);position:relative}
.rcard.out{opacity:.45;filter:grayscale(1)}
.rcard h3{margin:0 0 1vh;font-size:1.6vw}.writer{font-size:2vw;font-weight:900}
.tbar{height:1.2vh;border-radius:9px;background:rgba(255,255,255,.1);overflow:hidden;margin:1vh 0}.tbar i{display:block;height:100%;background:var(--c)}
.order{display:flex;flex-wrap:wrap;gap:.4vw}.order span{font-size:.95vw;padding:.3vh .6vw;border-radius:999px;background:rgba(255,255,255,.08)}.order span.on{background:var(--c);color:#fff}
.strikes{position:absolute;top:1.2vh;right:1vw;font-size:1.2vw;font-weight:900;border:0;border-radius:999px;padding:.5vh .9vw;background:rgba(255,255,255,.08);color:var(--soft)}
.strikes.hot{background:rgba(239,68,68,.3);color:#fff}
.rcard.noise{animation:shake .5s}
.res{display:grid;gap:1.2vh}.resrow{display:grid;grid-template-columns:16vw 1fr 8vw;gap:1vw;align-items:center;font-size:1.4vw;font-weight:800}
.pbar{height:2.4vh;border-radius:9px;background:rgba(255,255,255,.1);overflow:hidden}.pbar i{display:block;height:100%;background:var(--good)}
.fullcode{max-height:34vh;font-size:1.1vw}
.toast{position:fixed;top:8vh;left:50%;transform:translateX(-50%);background:#111827;border:1px solid var(--line);padding:1.2vh 1.6vw;border-radius:14px;font-weight:700;z-index:9;font-size:1.1vw}
</style></head><body>
<div class="top"><div>🎮 <b id="kind"></b></div><div id="ttl">${esc(gm.title)}</div><div id="info"></div></div>
<div id="app"></div>
<div class="bar" id="bar"></div>
<script>
"use strict";
const BASE = location.pathname.replace(/\\/$/, "");
let S = null, off = 0, busy = false, lastSeq = 0, lastKey = "", kick = "";
const $ = (s) => document.querySelector(s);
const e = (s) => String(s == null ? "" : s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));
const nowMs = () => Date.now() + off;
const mmss = (ms) => { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const FR = document.documentElement.lang !== "en";
const T = (fr, en) => (FR ? fr : en);
const LET = ["A", "B", "C", "D"], OCOL = ["var(--A)", "var(--B)", "var(--C)", "var(--D)"];
const sq = (i) => (S && S.squads[i]) || { name: "?", emoji: "❔", color: "#64748b" };
${RUNNER}
let ctx = null;
function beep(f, d, type) { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || "sine"; o.frequency.value = f; g.gain.setValueAtTime(.12, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + d); o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + d); } catch (x) {} }
function toast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.append(d); setTimeout(() => d.remove(), 3500); }
async function act(a, extra) {
  if (busy) return; busy = true;
  try {
    const r = await fetch(BASE + "/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ a: a }, extra || {})) });
    const d = await r.json();
    if (!r.ok) toast(d.error || "Error"); else take(d);
  } catch (x) { toast(T("Pas de connexion", "No connection")); } finally { busy = false; }
}
function take(d) { if (d.same) { off = d.now - Date.now(); return; } off = d.now - Date.now(); S = d; render(); }
async function poll() {
  try { const r = await fetch(BASE + "/state?seq=" + (S ? S.seq : 0)); if (r.ok) take(await r.json()); } catch (x) {}
  setTimeout(poll, S && S.phase === "question" ? 900 : 1500);
}
function players(list, opts) {
  return list.map((p) => '<button class="pl' + (p.alive === false ? " dead" : "") + '" data-kick="' + e(p.pid) + '" style="--c:' + (p.squad >= 0 && S.mode !== "solo" ? sq(p.squad).color : "rgba(255,255,255,.12)") + '" title="' + T("Cliquer deux fois pour libérer ce nom", "Click twice to free this name") + '">' + (opts && opts.mic ? (p.mic === 1 ? "🎤 " : p.mic === 0 ? "🔇 " : "") : "") + e(p.name) + (kick === p.pid ? " ✕?" : "") + "</button>").join("");
}
function lobby(extra) {
  const head = S.kind === "sql" ? '<h1 class="big">🕵️ ' + e(S.case.title) + '</h1><p class="story">' + e(S.case.story) + '</p><p class="muted">' + T("Notions : ", "Notions: ") + S.case.notions.map(e).join(" · ") + "</p>"
    : S.kind === "relay" ? '<h1 class="big">🏃 ' + T("Relais de code", "Code Relay") + " · " + e(S.task.title) + ' <span class="chip" style="font-size:1.2vw;vertical-align:middle">' + e(S.langName || "JavaScript") + '</span></h1><p class="story">' + e(S.task.text) + '</p><p class="muted">' + T("Chacun écrit à son tour : ", "Each one writes in turn: ") + mmss(S.totalMs) + T(" ÷ la taille du squad. ", " ÷ the squad size. ") + (S.noise ? T("Interdit de parler : les micros écoutent (", "No talking: the mics are listening (") + S.strikesMax + T(" avertissements = éliminés).", " strikes = out).") : "") + "</p>"
    : '<h1 class="big">👑 Battle Royale</h1><p class="story">' + T("Une mauvaise réponse et tu es éliminé. Le dernier debout gagne !", "One wrong answer and you're out. The last one standing wins!") + (S.mode !== "solo" ? T(" En squad, vos bonnes réponses donnent des points pour ramener un coéquipier.", " In squads, your right answers earn points to bring a teammate back.") : "") + "</p>";
  const bySquad = S.mode === "squads" ? '<div class="sqrow">' + S.squads.map((q, i) => q ? '<div class="sqbox" style="--c:' + q.color + '"><b>' + e(q.emoji + " " + q.name) + "</b>" + S.players.filter((p) => p.squad === i).map((p) => e(p.name)).join(", ") + "</div>" : "").join("") + "</div>" : "";
  return '<div class="lobby"><div><div class="qr"><img src="' + BASE + '/qr.svg" alt="QR"></div><div class="join">' + T("Scanne ou ouvre", "Scan or open") + '<br><b>' + e(S.join.replace(/^https?:\\/\\//, "")) + "</b></div></div><div>" + head +
    '<h2 style="margin-top:2vh">' + S.players.length + T(" joueur", " player") + (S.players.length > 1 ? "s" : "") + (S.mode === "random" ? T(" · squads au hasard au départ", " · random squads at the start") : "") + "</h2>" + (bySquad || '<div class="plist">' + players(S.players, { mic: S.kind === "relay" }) + "</div>") + (extra || "") + "</div></div>";
}
function winScreen(title, sub, more) {
  return '<div class="win"><div class="trophy">🏆</div><h1>' + title + "</h1>" + (sub ? "<p>" + sub + "</p>" : "") + (more || "") + "</div>";
}
// ---------------------------------------------------------------- 👑 royale
let shownStep = 0, shownPhase = "";
function royale() {
  const alive = S.players.filter((p) => p.alive);
  $("#info").textContent = S.phase === "lobby" ? "" : alive.length + T(" en vie", " alive") + " · " + T("question ", "question ") + S.step + "/" + S.total;
  if (S.phase === "lobby") return lobby();
  if (S.phase === "over") {
    const w = S.players.filter((p) => S.winners.includes(p.pid));
    const s = S.winSquad != null ? sq(S.winSquad) : null;
    return winScreen(s ? e(s.emoji + " " + s.name) : w.length === 1 ? "👑 " + e(w[0].name) : w.length ? w.map((p) => e(p.name)).join(", ") : T("Personne ne survit !", "Nobody survives!"),
      s ? T("Le dernier squad debout · ", "The last squad standing · ") + w.map((p) => e(p.name)).join(", ") : w.length ? T("Dernier survivant", "Last one standing") + (w.length > 1 ? "s" : "") : "",
      '<div class="plist" style="justify-content:center">' + S.players.slice().sort((a, b) => (b.out == null ? 999 : b.out) - (a.out == null ? 999 : a.out) || b.score - a.score).slice(0, 12).map((p, i) => '<span class="pl">' + (i + 1) + ". " + e(p.name) + " · " + p.score + "✓</span>").join("") + "</div>");
  }
  const q = S.q; if (!q) return "";
  const reveal = S.phase === "reveal";
  const left = reveal ? 0 : S.qAt > nowMs() ? S.seconds * 1000 : S.qEnd - nowMs();
  const L = S.last;
  const total = L ? L.dist.reduce((a, b) => a + b, 0) || 1 : 1;
  let banner = "";
  if (reveal && L) {
    const outs = S.players.filter((p) => L.out.includes(p.pid));
    banner = L.everyone ? '<div class="banner">😅 ' + T("Tout le monde s'est trompé : personne n'est éliminé !", "Everybody was wrong: nobody is out!") + "</div>"
      : outs.length ? '<div class="banner">💀 ' + outs.length + T(" éliminé", " out") + (outs.length > 1 && FR ? "s" : "") + '</div><div class="outs">' + outs.map((p) => '<span class="pl">' + e(p.name) + "</span>").join("") + "</div>"
      : '<div class="banner">🎉 ' + T("Personne n'est éliminé !", "Nobody is out!") + "</div>";
    if (S.mode !== "solo") banner += '<div class="sqrow" style="justify-content:center">' + S.squads.map((s, i) => s && S.players.some((p) => p.squad === i) ? '<span class="chip" style="background:' + s.color + '">' + e(s.emoji + " " + s.name) + " · " + S.players.filter((p) => p.squad === i && p.alive && !L.out.includes(p.pid)).length + "❤️ · " + (S.pts[i] || 0) + " pts</span>" : "").join("") + "</div>";
  }
  return '<div class="q"><div class="qhead"><span>' + (q.topic ? '<span class="chip">' + e(q.topic) + "</span> " : "") + T("Question ", "Question ") + S.step + '</span><div class="ring" id="ring"><svg viewBox="0 0 100 100"><circle class="bgc" cx="50" cy="50" r="44"/><circle class="fg" id="rfg" cx="50" cy="50" r="44" stroke-dasharray="276.46" stroke-dashoffset="' + (276.46 * (1 - left / (S.seconds * 1000))) + '"/></svg><span id="rt">' + (reveal ? "✓" : Math.ceil(left / 1000)) + "</span></div><span>" + (reveal ? "" : S.answered + "/" + alive.length + T(" ont répondu", " answered")) + "</span></div>" +
    '<div class="prompt">' + e(q.prompt) + "</div>" + (q.code ? '<pre class="code">' + e(q.code) + "</pre>" : "") +
    '<div class="opts">' + q.options.map((o, i) => '<div class="opt' + (reveal ? (i === q.answer ? " yes" : " no") : "") + '" style="--o:' + OCOL[i] + '">' + (reveal ? '<i style="width:' + Math.round(100 * L.dist[i] / total) + '%"></i>' : "") + "<b>" + LET[i] + "</b><span>" + e(o) + "</span>" + (reveal ? "<em>" + L.dist[i] + "</em>" : "") + "</div>").join("") + "</div>" +
    banner + (reveal ? "" : '<div class="alive">' + players(alive) + "</div>") + "</div>";
}
// ---------------------------------------------------------------- 🕵️ sql
function sqlView() {
  const steps = S.case.steps.length;
  $("#info").innerHTML = S.phase === "playing" && S.startAt ? '<span class="clock" id="clk"></span>' : "";
  if (S.phase === "lobby") return lobby();
  const order = (S.ranking || S.teams.map((t) => t.squad)).slice();
  if (S.phase === "playing") order.sort((a, b) => { const A = S.teams.find((t) => t.squad === a), B = S.teams.find((t) => t.squad === b); return (B.done ? 99 : B.step) - (A.done ? 99 : A.step) || (A.times[A.step - 1] || 1e15) - (B.times[B.step - 1] || 1e15); });
  const rows = order.map((i, k) => {
    const t = S.teams.find((x) => x.squad === i); const s = sq(i);
    const dots = Array.from({ length: steps }, (_, j) => '<div class="dot' + (j < t.step ? " ok" : j === t.step && !t.done ? " now" : "") + '" title="' + e(S.case.steps[j]) + '">' + (j < t.step ? "✓" : j + 1) + "</div>").join("") + '<div class="dot final' + (t.done ? " ok" : t.step >= steps ? " now" : "") + '">' + (t.done ? "🎯" : "?") + "</div>";
    return '<div class="rrow" style="--c:' + s.color + '"><div class="nm">' + (S.phase === "over" ? (k + 1) + ". " : "") + e(s.emoji + " " + s.name) + '</div><div class="dots">' + dots + '</div><div class="muted" style="font-size:1.1vw;text-align:right">' +
      (t.done ? "✅ " + mmss(t.done - S.startAt) + (t.penalty ? "<br>+" + mmss(t.penalty * 1000) : "") : t.step < steps ? e(S.case.steps[t.step]) : T("accusation…", "accusing…")) + (t.hints ? "<br>💡" + t.hints : "") + (t.wrong ? " ❌" + t.wrong : "") + "</div></div>";
  }).join("");
  if (S.phase === "over") {
    const w = S.winSquad != null ? sq(S.winSquad) : null;
    return '<div class="race"><div>' + (w ? '<h1 class="big">🏆 ' + e(w.emoji + " " + w.name) + "</h1>" : '<h1 class="big">' + T("Enquête terminée", "Case closed") + "</h1>") + '<p class="story">' + e(S.ending || "") + "</p>" + rows + "</div><div></div></div>";
  }
  return '<div class="race"><div><h2>🕵️ ' + e(S.case.title) + "</h2>" + rows + '</div><div class="feed"><h2>📰 ' + T("Le fil", "Live") + "</h2>" + (S.feed || []).slice().reverse().map((f) => { const s = sq(f.squad); return '<div><b style="color:' + s.color + '">' + e(s.emoji + " " + s.name) + "</b> " + (f.text.startsWith("🎯") ? T("a démasqué le coupable ! 🎯", "found the culprit! 🎯") : f.text.startsWith("❌") ? T("s'est trompé de coupable ❌", "accused the wrong person ❌") : T("a trouvé : ", "found: ") + e(f.text)) + "</div>"; }).join("") + "</div></div>";
}
// ---------------------------------------------------------------- 🏃 relay
let tested = false, noiseSeen = {};
function relayView() {
  $("#info").innerHTML = S.phase === "playing" ? '<span class="clock" id="clk"></span>' : "";
  if (S.phase === "lobby") return lobby();
  if (S.phase === "testing") { if (!tested) runAll(); return winScreen("🧪 " + T("Les tests tournent…", "Running the tests…"), T("On vérifie le code de chaque squad.", "Checking every squad's code."), ""); }
  if (S.phase === "over") {
    const w = S.winSquad != null ? sq(S.winSquad) : null;
    const rk = S.ranking || [];
    return '<div><h1 class="big">' + (w ? "🏆 " + e(w.emoji + " " + w.name) : T("Fin du relais", "Relay over")) + '</h1><div class="res">' + rk.map((i, k) => { const t = S.teams.find((x) => x.squad === i); const r = S.results && S.results[i] || { passed: 0, total: S.task.tests }; const s = sq(i);
      return '<div class="resrow"><span style="color:' + s.color + '">' + (k + 1) + ". " + e(s.emoji + " " + s.name) + '</span><div class="pbar"><i style="width:' + (r.total ? Math.round(100 * r.passed / r.total) : 0) + '%"></i></div><span>' + (t.out ? "🔇 " + T("éliminé", "out") : r.passed + "/" + r.total + " ✓") + "</span></div>"; }).join("") + "</div>" +
      (w ? '<h2 style="margin-top:2vh">' + T("Le code gagnant", "The winning code") + '</h2><pre class="code fullcode">' + e((S.teams.find((x) => x.squad === S.winSquad) || {}).code || "") + "</pre>" : "") + "</div>";
  }
  return '<div class="rgrid">' + S.teams.map((t) => {
    const s = sq(t.squad); const w = S.players.find((p) => p.pid === t.writer);
    const nameOf = (pid) => (S.players.find((p) => p.pid === pid) || { name: "?" }).name;
    const pct = Math.max(0, Math.min(100, 100 * (nowMs() - t.turnStart) / (t.turnEnd - t.turnStart)));
    return '<div class="rcard' + (t.out ? " out" : "") + (noiseSeen[t.squad] ? " noise" : "") + '" style="--c:' + s.color + '">' + (S.noise ? '<button class="strikes' + (t.strikes ? " hot" : "") + '" data-pardon="' + t.squad + '" title="' + T("Cliquer pour annuler un avertissement", "Click to cancel a strike") + '">🗣️ ' + t.strikes + "/" + S.strikesMax + "</button>" : "") + "<h3>" + e(s.emoji + " " + s.name) + "</h3>" +
      (t.out ? '<div class="writer">🔇 ' + T("Éliminés (bruit)", "Out (noise)") + "</div>" : '<div class="muted">' + T("Écrit maintenant", "Writing now") + '</div><div class="writer">✍️ ' + e(w ? w.name : "…") + '</div><div class="tbar"><i data-bar="' + t.squad + '" style="width:' + pct + '%"></i></div><div class="muted" style="font-size:1vw">' + T("Tour ", "Turn ") + (t.turn + 1) + " · " + T("manche ", "round ") + t.round + "/" + S.rounds + " · " + t.lines + T(" lignes", " lines") + "</div>") +
      '<div class="order" style="margin-top:1vh">' + t.order.map((pid) => "<span" + (pid === t.writer ? ' class="on"' : "") + ">" + (((S.players.find((p) => p.pid === pid) || {}).mic === 0) ? "🔇" : "") + e(nameOf(pid)) + "</span>").join("") + "</div></div>";
  }).join("") + "</div>";
}
async function runAll() {
  tested = true;
  if (S.codeLang && S.codeLang !== "javascript") { await act("runtests"); if (S.phase === "testing") tested = false; return; }
  try {
    const d = await (await fetch(BASE + "/codes")).json();
    const results = {};
    for (const [k, code] of Object.entries(d.codes)) {
      if (code == null) { results[k] = { passed: 0, total: d.tests.length, error: "out" }; continue; }
      const r = await runTests(code, d.fn, d.tests);
      results[k] = { passed: (r.out || []).filter((x) => x.ok).length, total: d.tests.length, error: r.error || "", details: r.out || [] };
    }
    await act("results", { results: results });
  } catch (x) { tested = false; toast(T("Les tests n'ont pas pu tourner : réessaie", "The tests couldn't run: try again")); }
}
// ---------------------------------------------------------------- frame
function controls() {
  const b = [];
  if (S.phase === "lobby") b.push('<button class="btn primary" data-act="start">▶ ' + T("Lancer", "Start") + "</button>");
  if (S.kind === "royale" && S.phase === "question") b.push('<button class="btn" data-act="reveal">👁 ' + T("Révéler", "Reveal") + "</button>");
  if (S.kind === "royale" && S.phase === "reveal") b.push('<button class="btn primary" data-act="next">' + (S.last && S.last.final ? "🏆 " + T("Résultat", "Result") : "▶ " + T("Question suivante", "Next question")) + " <span class=muted>(␣)</span></button>");
  if (!["lobby", "over"].includes(S.phase)) b.push('<button class="btn danger" data-act="stop">⏹ ' + T("Terminer", "End") + "</button>");
  if (S.kind === "relay" && S.phase === "testing") b.push('<button class="btn" id="rerun">🧪 ' + T("Relancer les tests", "Run the tests again") + "</button>");
  if (S.phase === "over") b.push('<button class="btn" data-act="reset">🔁 ' + T("Rejouer", "Play again") + "</button>");
  b.push('<button class="btn" id="fs">⛶</button>');
  $("#bar").innerHTML = b.join("");
}
function render() {
  $("#kind").textContent = S.kind === "royale" ? "Battle Royale" : S.kind === "sql" ? T("Détective SQL", "SQL Detective") : T("Relais de code", "Code Relay");
  const key = S.seq + "." + S.phase + "." + (S.answered || 0) + "." + JSON.stringify(S.teams ? S.teams.map((t) => [t.writer, t.strikes, t.lines, t.step]) : 0) + "." + kick;
  // sounds and shakes on what just happened
  if (S.kind === "royale" && (S.step !== shownStep || S.phase !== shownPhase)) { if (S.phase === "question") beep(660, .15); if (S.phase === "reveal") { beep(S.last && S.last.out.length ? 196 : 880, .4, "triangle"); } if (S.phase === "over") [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, .25), i * 140)); shownStep = S.step; shownPhase = S.phase; }
  if (S.kind === "relay" && S.teams) for (const t of S.teams) { if (t.lastNoise && noiseSeen["n" + t.squad] !== t.lastNoise.at) { const first = noiseSeen["n" + t.squad] === undefined; noiseSeen["n" + t.squad] = t.lastNoise.at; if (!first) { noiseSeen[t.squad] = 1; beep(150, .5, "sawtooth"); toast("🗣️ " + sq(t.squad).name + " : " + t.lastNoise.name + T(" a parlé !", " talked!")); setTimeout(() => { noiseSeen[t.squad] = 0; }, 800); } } }
  if (key !== lastKey) { lastKey = key; $("#app").innerHTML = S.kind === "royale" ? royale() : S.kind === "sql" ? sqlView() : relayView(); controls(); }
}
document.addEventListener("click", (ev) => {
  const a = ev.target.closest("[data-act]"); if (a) { if (a.dataset.act === "reset" && !confirm(T("Rejouer avec les mêmes joueurs ?", "Play again with the same players?"))) return; act(a.dataset.act); return; }
  const k = ev.target.closest("[data-kick]"); if (k) { if (kick === k.dataset.kick) { kick = ""; act("kick", { pid: k.dataset.kick }); } else { kick = k.dataset.kick; lastKey = ""; render(); setTimeout(() => { kick = ""; lastKey = ""; render(); }, 3000); } return; }
  const p = ev.target.closest("[data-pardon]"); if (p) { act("pardon", { squad: Number(p.dataset.pardon) }); return; }
  if (ev.target.closest("#rerun")) { tested = false; runAll(); return; }
  if (ev.target.closest("#fs")) { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
});
document.addEventListener("keydown", (ev) => { if (ev.key === " " && S && S.kind === "royale" && S.phase === "reveal") { ev.preventDefault(); act("next"); } });
// the clocks between two polls
setInterval(() => {
  if (!S) return;
  if (S.kind === "royale" && S.phase === "question") {
    const left = S.qAt > nowMs() ? S.seconds * 1000 : S.qEnd - nowMs();
    const rt = $("#rt"), fg = $("#rfg"); if (rt) rt.textContent = Math.max(0, Math.ceil(left / 1000)); if (fg) fg.setAttribute("stroke-dashoffset", 276.46 * (1 - Math.max(0, left) / (S.seconds * 1000)));
    const alive = S.players.filter((p) => p.alive).length;
    if ((left <= -300 || (alive && S.answered >= alive && nowMs() > S.qAt)) && !busy && Date.now() - (window.__rv || 0) > 1500) { window.__rv = Date.now(); act("reveal"); }
    else if (left > 0 && left < 5200 && Math.ceil(left / 1000) !== window.__tick) { window.__tick = Math.ceil(left / 1000); beep(440, .06); }
  }
  const clk = $("#clk");
  if (clk && S.kind === "sql") clk.textContent = "⏱ " + mmss(nowMs() - S.startAt);
  if (clk && S.kind === "relay" && S.endAt) clk.textContent = "⏱ " + mmss(S.endAt - nowMs());
  if (S.kind === "relay" && S.phase === "playing") for (const t of S.teams) { const i = document.querySelector('[data-bar="' + t.squad + '"]'); if (i) i.style.width = Math.max(0, Math.min(100, 100 * (nowMs() - t.turnStart) / (t.turnEnd - t.turnStart))) + "%"; if (nowMs() > t.turnEnd + 400) { lastKey = ""; } }
}, 250);
poll();
</script></body></html>`;

// =================================================================== a student's screen
const PLAY = (gm: Game) => `<!doctype html><html lang="${gm.settings.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta name="robots" content="noindex">
<title>${esc(gm.title)}</title><style>${CSS}
html{background:radial-gradient(1100px 650px at 10% 0%,rgba(139,92,246,.22),transparent 60%),radial-gradient(1100px 650px at 100% 100%,rgba(6,182,212,.16),transparent 60%),var(--bg);background-attachment:fixed}
body{background:none;min-height:100vh;padding:14px;max-width:${gm.kind === "sql" ? "1300px" : gm.kind === "relay" ? "1100px" : "640px"};margin:0 auto}
header{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}
header b{font-size:18px}.me{font-size:14px;color:var(--soft)}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:16px;margin-bottom:12px}
.center{text-align:center}.big{font-size:44px;margin:6px 0}
h2{margin:0 0 8px;font-size:20px}
input,textarea{font:inherit;width:100%;border-radius:12px;border:1px solid var(--line);background:#0b1224;color:var(--ink);padding:12px}
.names{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:10px;max-height:60vh;overflow:auto}
.names button{border:1px solid var(--line);background:rgba(255,255,255,.06);color:var(--ink);border-radius:14px;padding:12px;text-align:left;font-weight:700}
.names button:disabled{opacity:.35}.names button.sq{border-color:var(--acc)}
.opts{display:grid;gap:10px}
.opt{display:flex;gap:12px;align-items:center;border:0;border-radius:18px;padding:18px;font-size:18px;font-weight:800;color:#fff;background:var(--o);text-align:left;min-height:64px}
.opt b{display:grid;place-items:center;min-width:34px;height:34px;border-radius:10px;background:rgba(0,0,0,.25)}
.opt.pick{box-shadow:0 0 0 4px #fff}.opt.dim{opacity:.35}
.mates{display:flex;flex-wrap:wrap;gap:8px}
.timer{font-size:28px;font-weight:900;font-variant-numeric:tabular-nums}
/* sql */
.sqlgrid{display:grid;grid-template-columns:340px 1fr;gap:12px}
@media(max-width:860px){.sqlgrid{grid-template-columns:1fr}}
.tables details{margin:6px 0}.tables summary{font-weight:800;cursor:pointer}.tables code{display:inline-block;margin:3px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.08);cursor:pointer;font-size:13px}
textarea.sql,textarea.js{font:600 15px/1.5 "JetBrains Mono","Fira Code",Consolas,monospace;min-height:150px;resize:vertical;tab-size:2}
textarea.js{min-height:340px}
.result{overflow:auto;max-height:340px;margin-top:10px}
table{border-collapse:collapse;font-size:14px;width:100%}th,td{border-bottom:1px solid var(--line);padding:6px 10px;text-align:left;white-space:nowrap}th{color:var(--soft)}
.msg{padding:10px 14px;border-radius:12px;margin-top:10px;font-weight:700}.msg.ok{background:rgba(34,197,94,.18)}.msg.no{background:rgba(239,68,68,.15)}.msg.info{background:rgba(139,92,246,.18)}
.found li{margin:4px 0}
.meter{height:10px;border-radius:9px;background:rgba(255,255,255,.1);overflow:hidden}.meter i{display:block;height:100%;background:var(--good);transition:width .1s}
.err{color:#fca5a5}
</style></head><body>
<header><b>${esc(gm.title)}</b><span class="me" id="me"></span></header>
<div id="app"><div class="card center muted">…</div></div>
${gm.kind === "sql" ? `<script src="https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js"></script>` : ""}
<script>
"use strict";
const BASE = location.pathname.replace(/\\/$/, "");
const KIND = ${JSON.stringify(gm.kind)};
const FR = document.documentElement.lang !== "en";
const T = (fr, en) => (FR ? fr : en);
const $ = (s) => document.querySelector(s);
const e = (s) => String(s == null ? "" : s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));
const mmss = (ms) => { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const LET = ["A", "B", "C", "D"], OCOL = ["var(--A)", "var(--B)", "var(--C)", "var(--D)"];
let KEY = ""; try { KEY = localStorage.getItem("cb-game-" + BASE) || ""; } catch (x) {}
if (!KEY) { KEY = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""); try { localStorage.setItem("cb-game-" + BASE, KEY); } catch (x) {} }
let S = null, off = 0, lastKey = "";
const nowMs = () => Date.now() + off;
${RUNNER}
async function call(path, body) {
  const r = await fetch(BASE + "/" + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ key: KEY }, body)) } : { headers: { "x-player-key": KEY } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const er = new Error(d.error || "Error"); er.join = d.join; throw er; }
  return d;
}
function take(d) { if (!d) return; off = d.now - Date.now(); if (d.same) return; S = d; $("#me").textContent = S.me.name + (S.squad ? " · " + S.squad.emoji + " " + S.squad.name : ""); render(); }
async function poll() {
  let wait = KIND === "sql" ? 2500 : 1500;
  try { take(await call("state?seq=" + (S ? S.seq : 0))); }
  catch (x) { if (x.join) { await joinScreen(); return; } }
  if (S && S.phase === "over") wait = 5000;
  setTimeout(poll, wait);
}
// ---------------------------------------------------------------- pick your name
async function joinScreen() {
  const d = await (await fetch(BASE + "/roster")).json();
  $("#app").innerHTML = '<div class="card"><h2>' + T("Qui es-tu ?", "Who are you?") + '</h2><input id="q" placeholder="' + T("Tape ton nom…", "Type your name…") + '" autocomplete="off"><div class="names" id="nm"></div><p class="err" id="er"></p></div>';
  const draw = () => { const f = $("#q").value.toLowerCase(); $("#nm").innerHTML = d.names.filter((n) => !f || n.name.toLowerCase().includes(f)).map((n) => '<button data-pid="' + e(n.pid) + '"' + (n.taken ? " disabled" : "") + (n.squad ? ' class="sq"' : "") + ">" + e(n.name) + (n.taken ? " ✓" : "") + "</button>").join(""); };
  $("#q").oninput = draw; draw();
  $("#nm").onclick = async (ev) => { const b = ev.target.closest("[data-pid]"); if (!b) return; try { take(await call("join", { pid: b.dataset.pid })); setTimeout(poll, 1200); if (KIND === "relay") micStart(); } catch (x) { $("#er").textContent = x.message; } };
}
// ---------------------------------------------------------------- 👑 royale
async function pick(i) { try { take(await call("answer", { step: S.step, choice: i })); if (navigator.vibrate) navigator.vibrate(40); } catch (x) { alert(x.message); } }
async function revive(pid) { try { take(await call("revive", { target: pid })); } catch (x) { alert(x.message); } }
function royale() {
  if (S.phase === "lobby") return '<div class="card center"><div class="big">👑</div><h2>' + T("Tu es inscrit !", "You're in!") + '</h2><p class="muted">' + T("Regarde la TV : la partie va commencer.", "Watch the TV: the game is about to start.") + "</p></div>";
  if (S.phase === "over") { const won = S.winners.includes(S.me.pid) || (S.winSquad != null && S.me.squad === S.winSquad); return '<div class="card center"><div class="big">' + (won ? "🏆" : "🎮") + "</div><h2>" + (won ? T("Victoire !", "You win!") : T("Partie terminée", "Game over")) + '</h2><p class="muted">' + S.me.score + T(" bonne(s) réponse(s)", " right answer(s)") + "</p></div>"; }
  let h = "";
  if (S.squad && S.mode !== "solo") {
    const dead = S.squad.mates.filter((m) => !m.alive && m.pid !== S.me.pid);
    h += '<div class="card"><b>' + e(S.squad.emoji + " " + S.squad.name) + "</b> · " + S.pts + " pts" + '<div class="mates" style="margin-top:8px">' + S.squad.mates.map((m) => '<span class="chip">' + (m.alive ? "❤️ " : "💀 ") + e(m.name) + "</span>").join("") + "</div>" +
      (S.phase === "reveal" && S.me.alive && !(S.last && S.last.final) && dead.length ? '<p class="muted">' + T("Ramène un coéquipier (", "Bring a teammate back (") + S.reviveCost + T(" pts) :", " pts):") + "</p>" + dead.map((m) => '<button class="btn primary" style="margin:4px" data-revive="' + e(m.pid) + '"' + (S.pts < S.reviveCost || m.revived >= S.maxRevives ? " disabled" : "") + ">💖 " + e(m.name) + "</button>").join("") : "") + "</div>";
  }
  if (!S.me.alive && S.phase === "question") return '<div class="card center"><div class="big">💀</div><h2>' + T("Éliminé", "You're out") + '</h2><p class="muted">' + T("Regarde la TV" + (S.mode !== "solo" ? " : un coéquipier peut te ramener." : "."), "Watch the TV" + (S.mode !== "solo" ? ": a teammate can bring you back." : ".")) + "</p></div>" + h;
  const q = S.q; if (!q) return h;
  if (S.phase === "question" && nowMs() < S.qAt) return '<div class="card center"><div class="big">⏳</div><h2>' + T("Prépare-toi…", "Get ready…") + "</h2></div>" + h;
  if (S.phase === "question") {
    const left = S.qEnd - nowMs();
    return '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><b>' + T("Question ", "Question ") + S.step + '</b><span class="timer" id="tm">' + Math.max(0, Math.ceil(left / 1000)) + '</span></div><p style="font-size:19px;font-weight:700">' + e(q.prompt) + "</p>" + (q.code ? '<pre class="code">' + e(q.code) + "</pre>" : "") + "</div>" +
      '<div class="opts">' + q.options.map((o, i) => '<button class="opt' + (S.picked === i ? " pick" : S.picked != null ? " dim" : "") + '" style="--o:' + OCOL[i] + '" data-pick="' + i + '"' + (S.picked != null || left < -1500 ? " disabled" : "") + "><b>" + LET[i] + "</b><span>" + e(o) + "</span></button>").join("") + "</div>" +
      (S.picked != null ? '<p class="center muted">🔒 ' + T("Réponse verrouillée", "Answer locked") + "</p>" : "") + h;
  }
  // reveal
  const right = S.picked === q.answer, out = S.last && S.last.out;
  return '<div class="card center"><div class="big">' + (out ? "💀" : S.last && S.last.everyone ? "😅" : right ? "✅" : S.me.alive ? "🛡️" : "👀") + "</div><h2>" + (out ? T("Éliminé !", "You're out!") : S.last && S.last.everyone ? T("Tout le monde s'est trompé : tu restes !", "Everyone was wrong: you stay!") : right ? T("Bonne réponse !", "Right!") : S.me.alive ? T("Toujours en vie", "Still alive") : T("Tu regardes", "Watching")) + '</h2><p class="muted">' + T("La réponse : ", "The answer: ") + "<b>" + LET[q.answer] + " · " + e(q.options[q.answer]) + "</b></p></div>" + h;
}
// ---------------------------------------------------------------- 🕵️ sql
let DB = null, CASE = null, sqlMsg = "", lastRows = null, accMsg = "";
async function loadCase() {
  if (CASE) return;
  CASE = await (await fetch(BASE + "/case")).json();
  try {
    const SQL = await initSqlJs({ locateFile: (f) => "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/" + f });
    DB = new SQL.Database(); DB.run(CASE.schema);
  } catch (x) { sqlMsg = '<div class="msg no">' + T("Le moteur SQL n'a pas pu se charger : recharge la page.", "The SQL engine couldn't load: reload the page.") + "</div>"; }
}
function tablesHtml() {
  if (!DB) return "";
  const t = DB.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")[0];
  return (t ? t.values : []).map((r) => { const cols = DB.exec("PRAGMA table_info(" + r[0] + ")")[0].values.map((c) => c[1]); return "<details><summary>🗂 " + e(r[0]) + "</summary>" + cols.map((c) => '<code data-ins="' + e(c) + '">' + e(c) + "</code>").join("") + "</details>"; }).join("");
}
function runSql() {
  const q = $("#sql").value.trim(); if (!q || !DB) return;
  try { localStorage.setItem("cb-sql-" + BASE, q); } catch (x) {}
  if (/^\\s*(drop|delete|update|insert|alter|create)\\b/i.test(q)) { sqlMsg = '<div class="msg no">' + T("Ici on enquête : seulement des SELECT 🙂", "Only SELECT here 🙂") + "</div>"; draw(); return; }
  let res;
  try { res = DB.exec(q); } catch (x) { sqlMsg = '<div class="msg no">⚠️ ' + e(x.message) + "</div>"; lastRows = null; draw(); return; }
  const r = res[res.length - 1] || { columns: [], values: [] };
  lastRows = r;
  sqlMsg = "";
  draw();
  if (S.phase !== "playing" || S.step >= S.steps) return;
  call("check", { step: S.step, rows: r.values.slice(0, 200) }).then((c) => {
    if (c.ok) { sqlMsg = '<div class="msg ok">🎉 ' + T("Indice trouvé ! ", "Clue found! ") + e(c.found || "") + "</div>"; if (navigator.vibrate) navigator.vibrate([60, 40, 60]); S.step = c.step; poke(); }
    else if (c.stale) { poke(); }
    else sqlMsg = '<div class="msg info">🔎 ' + T("Pas encore. ", "Not yet. ") + (c.rows !== c.need ? T("Ta requête renvoie " + c.rows + " ligne(s), la bonne réponse en a " + c.need + ".", "Your query returns " + c.rows + " row(s); the answer has " + c.need + ".") : c.cols ? T("Le bon nombre de lignes : il faut " + c.cols + " colonnes précises.", "Right number of rows: " + c.cols + " specific columns are needed.") : T("Le bon nombre de lignes, mais pas les bonnes valeurs.", "Right number of rows, not the right values.")) + "</div>";
    draw();
  }).catch((x) => { sqlMsg = '<div class="msg no">' + e(x.message) + "</div>"; draw(); });
}
function poke() { lastKey = ""; call("state?seq=0").then(take).catch(() => {}); }
async function hint() { try { const h = await call("hint", {}); S.hints = h.hint; lastKey = ""; draw(); } catch (x) { alert(x.message); } }
async function accuse() { const n = $("#acc").value.trim(); if (!n) return; try { const r = await call("accuse", { name: n }); accMsg = r.ok ? '<div class="msg ok">🎯 ' + e(r.ending || "") + "</div>" : '<div class="msg no">❌ ' + T("Ce n'est pas la bonne personne : pénalité !", "Wrong person: penalty!") + "</div>"; poke(); } catch (x) { accMsg = '<div class="msg no">' + e(x.message) + "</div>"; draw(); } }
function sqlView() {
  if (!CASE) { loadCase().then(() => { lastKey = ""; draw(); }); return '<div class="card center muted">' + T("Chargement de l'enquête…", "Loading the case…") + "</div>"; }
  if (S.phase === "lobby") return '<div class="card"><div class="big">🕵️</div><h2>' + e(CASE.title) + '</h2><p>' + e(CASE.story) + '</p><p class="muted">' + T("Regarde la TV : l'enquête va commencer. En attendant, explore les tables ➜", "Watch the TV: the case starts soon. Meanwhile, explore the tables ➜") + '</p><div class="tables">' + tablesHtml() + "</div></div>";
  const done = S.done || S.phase === "over";
  const clue = S.step < S.steps ? CASE.steps[S.step] : null;
  const left = '<div><div class="card"><h2>🕵️ ' + e(CASE.title) + '</h2><p class="muted" style="font-size:14px">' + e(CASE.story) + '</p></div><div class="card"><b>' + T("Indices trouvés", "Clues found") + " (" + S.step + "/" + S.steps + ')</b><ol class="found">' + S.found.map((f) => "<li>" + e(f) + "</li>").join("") + '</ol></div><div class="card tables"><b>' + T("Les tables", "Tables") + "</b>" + tablesHtml() + "</div></div>";
  let main = "";
  if (done) main = '<div class="card center"><div class="big">🎯</div><h2>' + T("Affaire résolue !", "Case solved!") + "</h2><p>" + e(S.ending || "") + "</p>" + (S.rank ? '<p class="muted">' + T("Classement : ", "Rank: ") + S.rank + "</p>" : "") + "</div>";
  else if (clue) main = '<div class="card"><b>' + T("Étape ", "Step ") + (S.step + 1) + " · " + e(clue.title) + '</b><p style="font-size:17px">' + e(clue.clue) + "</p>" + (S.hints ? '<div class="msg info">💡 ' + e(S.hints) + "</div>" : '<button class="btn" id="hint">💡 ' + T("Indice", "Hint") + "</button>") + "</div>";
  else main = '<div class="card"><b>🎯 ' + T("Accusation", "Accusation") + "</b><p>" + e(CASE.question) + '</p><div style="display:flex;gap:8px"><input id="acc" placeholder="' + T("Prénom Nom", "First Last") + '"><button class="btn primary" id="accb">' + T("Accuser", "Accuse") + "</button></div>" + accMsg + (S.lock ? '<p class="muted">⏳ ' + T("Attends un peu avant de réessayer.", "Wait a little before trying again.") + "</p>" : "") + "</div>";
  const editor = done ? "" : '<div class="card"><textarea class="sql" id="sql" spellcheck="false" placeholder="SELECT * FROM …">' + e((() => { try { return localStorage.getItem("cb-sql-" + BASE) || ""; } catch (x) { return ""; } })()) + '</textarea><div style="display:flex;gap:8px;margin-top:8px"><button class="btn primary" id="run">▶ ' + T("Exécuter", "Run") + ' <span class="muted">' + T("Ctrl+Entrée", "Ctrl+Enter") + '</span></button></div><div id="msg">' + sqlMsg + '</div><div class="result" id="res">' + resultHtml() + "</div></div>";
  return '<div class="sqlgrid">' + left + "<div>" + main + editor + "</div></div>";
}
function resultHtml() {
  if (!lastRows) return "";
  if (!lastRows.columns.length) return '<p class="muted">' + T("Aucune ligne.", "No rows.") + "</p>";
  return '<p class="muted" style="margin:4px 0">' + lastRows.values.length + T(" ligne(s)", " row(s)") + "</p><table><tr>" + lastRows.columns.map((c) => "<th>" + e(c) + "</th>").join("") + "</tr>" + lastRows.values.slice(0, 100).map((r) => "<tr>" + r.map((v) => "<td>" + e(v) + "</td>").join("") + "</tr>").join("") + "</table>";
}
// ---------------------------------------------------------------- 🏃 relay
let mic = null, level = 0, base = null, hist = [], loud = 0, lastNoise = 0, saving = false, myTurn = -1, edited = false, saveT = 0, testOut = "";
async function micStart() {
  if (mic || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return;
  try {
    const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume().catch(() => {}); const src = ac.createMediaStreamSource(st); const an = ac.createAnalyser(); an.fftSize = 1024; src.connect(an);
    const buf = new Float32Array(an.fftSize); mic = { ac, an, buf };
    call("mic", { on: true }).catch(() => {});
    setInterval(() => {
      an.getFloatTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      level = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-9);   // dBFS: -100 silence … 0 very loud
      hist.push(level); if (hist.length > 100) hist.shift();
      const sorted = hist.slice().sort((a, b) => a - b); base = sorted[Math.floor(sorted.length * .2)];
      const margin = { low: 26, medium: 20, high: 14 }[(S && S.sensitivity) || "medium"];
      const over = level > Math.max(base + margin, -50);
      loud = over ? loud + 1 : 0;
      const m = $("#lvl"); if (m) { m.style.width = Math.max(0, Math.min(100, (level + 80) * 1.4)) + "%"; m.style.background = over ? "var(--bad)" : "var(--good)"; }
      if (loud >= 5 && S && S.phase === "playing" && S.noise && Date.now() - lastNoise > 5000) { lastNoise = Date.now(); loud = 0; call("noise", {}).then(() => poke()).catch(() => {}); }
    }, 100);
  } catch (x) { call("mic", { on: false }).catch(() => {}); alert(T("Le micro est refusé : ton professeur le verra sur la TV.", "The microphone is blocked: your teacher will see it on the TV.")); }
}
async function save() {
  const ta = $("#code"); if (!ta || saving || myTurn < 0) return;
  saving = true; try { await call("code", { turn: myTurn, code: ta.value }); edited = false; const st = $("#saved"); if (st) st.textContent = "✓ " + T("enregistré", "saved"); } catch (x) { const st = $("#saved"); if (st) st.textContent = x.message; } finally { saving = false; }
}
async function tryIt() {
  const ta = $("#code"); if (!ta) return;
  const o = $("#tout"); if (o) o.innerHTML = '<div class="msg info">⏳ ' + T("Ça tourne…", "Running…") + "</div>";
  let r;
  if (S.codeLang && S.codeLang !== "javascript") { try { r = await call("try", { code: ta.value }); } catch (x) { r = { error: x.message, out: [] }; } r.out = r.details || []; }
  else r = await runTests(ta.value, S.task.fn, S.task.examples);
  testOut = r.error ? '<div class="msg no">' + e(r.error) + "</div>" : r.out.map((x, i) => '<div class="msg ' + (x.ok ? "ok" : "no") + '">' + (x.ok ? "✅ " : "❌ ") + e(S.task.shown[i].call) + " → " + e(x.got) + (x.ok ? "" : T(" (attendu ", " (expected ") + e(S.task.shown[i].expect) + ")") + "</div>").join("");
  if (o) o.innerHTML = testOut;
}
function relayView() {
  const meter = mic ? '<div style="display:flex;gap:10px;align-items:center;margin-top:8px"><span>🎤</span><div class="meter" style="flex:1"><i id="lvl"></i></div></div>' : S.noise ? '<p><button class="btn primary" id="micb">🎤 ' + T("Activer mon micro", "Turn on my mic") + "</button></p>" : "";
  const task = '<div class="card"><b>🏃 ' + e(S.task.title) + '</b> <span class="chip" style="font-size:12px">' + e(S.langName || "JavaScript") + '</span><p>' + e(S.task.text) + '</p><p class="muted" style="font-size:14px">' + T("Exemples : ", "Examples: ") + S.task.shown.map((x) => "<code>" + e(x.call + " → " + x.expect) + "</code>").join(" · ") + "</p></div>";
  if (S.phase === "lobby") return '<div class="card center"><div class="big">🏃</div><h2>' + T("Tu es inscrit !", "You're in!") + '</h2><p class="muted">' + T("Les squads et l'ordre de passage sont tirés au départ. Interdit de parler pendant le relais : ton micro écoute.", "The squads and the order are drawn at the start. No talking during the relay: your mic is listening.") + "</p>" + meter + "</div>" + task;
  if (S.phase === "testing") return '<div class="card center"><div class="big">🧪</div><h2>' + T("Les tests tournent sur la TV…", "The tests are running on the TV…") + "</h2></div>";
  if (S.phase === "over") return '<div class="card center"><div class="big">' + (S.winSquad === S.me.squad ? "🏆" : "🏁") + "</div><h2>" + (S.winSquad === S.me.squad ? T("Votre squad gagne !", "Your squad wins!") : T("Fin du relais", "Relay over")) + "</h2>" + (S.result ? "<p>" + S.result.passed + "/" + S.result.total + T(" tests réussis", " tests passed") + (S.rank ? " · " + T("rang ", "rank ") + S.rank : "") + "</p>" : "") + '</div><div class="card"><b>' + T("Votre code final", "Your final code") + '</b><pre class="code" style="margin-top:8px">' + e(S.code || "") + "</pre></div>";
  if (S.out) return '<div class="card center"><div class="big">🔇</div><h2>' + T("Votre squad est éliminé", "Your squad is out") + '</h2><p class="muted">' + T("Trop de bruit pendant le relais.", "Too much noise during the relay.") + "</p></div>";
  const strikes = S.noise ? '<p class="center' + (S.strikes ? "" : " muted") + '">🗣️ ' + S.strikes + "/" + S.strikesMax + T(" avertissement" + (S.strikes > 1 ? "s" : "") + " pour votre squad", " strike" + (S.strikes > 1 ? "s" : "") + " for your squad") + "</p>" : "";
  const order = '<div class="mates">' + S.order.map((n) => '<span class="chip"' + (n === S.writerName ? ' style="background:var(--acc)"' : "") + ">" + e(n) + "</span>").join("") + "</div>";
  if (S.writing) {
    return '<div class="card" style="border-color:var(--good)"><div style="display:flex;justify-content:space-between;align-items:center"><h2>✍️ ' + T("C'est à toi !", "Your turn!") + '</h2><span class="timer" id="tm"></span></div><p class="muted" style="margin:0">' + T("Lis le code de ton équipe, continue-le. Pas un mot !", "Read your team's code, carry on. Not a word!") + "</p></div>" + task +
      '<div class="card"><textarea class="js" id="code" spellcheck="false"></textarea><div style="display:flex;gap:8px;align-items:center;margin-top:8px"><button class="btn" id="try">▶ ' + T("Tester les exemples", "Try the examples") + '</button><span class="muted" id="saved"></span></div><div id="tout">' + testOut + "</div>" + meter + "</div>" + strikes;
  }
  return '<div class="card center"><div class="big">🤫</div><h2>' + e(S.writerName || "…") + T(" écrit…", " is writing…") + '</h2><p class="muted">' + (S.nextAt ? T("Ton tour dans ", "Your turn in ") + '<b id="nx"></b>' : T("Tu as fini tes tours.", "Your turns are done.")) + "</p>" + order + meter + "</div>" + strikes + task;
}
// ---------------------------------------------------------------- frame
function draw() {
  const k = KIND === "sql" ? sqlView : KIND === "relay" ? relayView : royale;
  const keep = $("#sql") ? $("#sql").value : null;
  $("#app").innerHTML = k();
  if (keep != null && $("#sql")) $("#sql").value = keep;
  wire();
}
function render() {
  if (KIND === "relay" && S.writing && S.turn !== myTurn) {
    // my turn: the code as my squad left it (two turns in a row: I keep what I was typing)
    const mine = myTurn !== -1 && $("#code") ? $("#code").value : null;
    myTurn = S.turn; testOut = ""; lastKey = ""; draw(); const ta = $("#code"); if (ta) { ta.value = mine != null ? mine : S.code || S.starter || ""; ta.focus(); } return;
  }
  if (KIND === "relay" && !S.writing && myTurn !== -1 && $("#code")) { save().finally(() => { myTurn = -1; lastKey = ""; draw(); }); return; }
  const key = S.seq + "." + S.phase + "." + S.step + "." + (S.picked != null) + "." + (S.writing ? "w" : S.writer) + "." + S.strikes + "." + (S.out ? 1 : 0) + "." + (S.done ? 1 : 0) + "." + (S.lock ? 1 : 0) + "." + S.pts + "." + (S.me.alive ? 1 : 0);
  if (key === lastKey) return;
  lastKey = key;
  if (KIND === "relay" && S.writing && $("#code")) return;   // never redraw the editor under the writer's fingers
  draw();
}
function wire() {
  document.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => pick(Number(b.dataset.pick)));
  document.querySelectorAll("[data-revive]").forEach((b) => b.onclick = () => revive(b.dataset.revive));
  if ($("#run")) $("#run").onclick = runSql;
  if ($("#sql")) $("#sql").onkeydown = (ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") { ev.preventDefault(); runSql(); } };
  document.querySelectorAll("[data-ins]").forEach((c) => c.onclick = () => { const t = $("#sql"); if (t) { const p = t.selectionStart; t.value = t.value.slice(0, p) + c.dataset.ins + t.value.slice(t.selectionEnd); t.focus(); } });
  if ($("#hint")) $("#hint").onclick = hint;
  if ($("#accb")) $("#accb").onclick = accuse;
  if ($("#micb")) $("#micb").onclick = () => micStart().then(() => { lastKey = ""; draw(); });
  if ($("#try")) $("#try").onclick = tryIt;
  const ta = $("#code");
  if (ta) {
    ta.oninput = () => { edited = true; };
    ta.onkeydown = (ev) => { if (ev.key === "Tab") { ev.preventDefault(); const sp = S.codeLang === "python" || S.codeLang === "php" ? "    " : "  "; const p = ta.selectionStart; ta.value = ta.value.slice(0, p) + sp + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = p + sp.length; edited = true; } };
  }
}
setInterval(() => {
  if (!S) return;
  if (KIND === "royale" && S.phase === "question") { const t = $("#tm"); if (t) t.textContent = Math.max(0, Math.ceil((S.qEnd - nowMs()) / 1000)); if (nowMs() >= S.qAt && nowMs() - S.qAt < 400) { lastKey = ""; draw(); } }
  if (KIND === "relay" && S.phase === "playing") {
    const t = $("#tm"); if (t && S.turnEnd) t.textContent = mmss(S.turnEnd - nowMs());
    const nx = $("#nx"); if (nx && S.nextAt) nx.textContent = mmss(S.nextAt - nowMs());
    // the writer: save every 3 s, and right before the turn ends (the next one gets the code)
    if (S.writing && $("#code")) { if ((edited && Date.now() - saveT > 3000) || (S.turnEnd - nowMs() < 900 && !window.__last)) { saveT = Date.now(); if (S.turnEnd - nowMs() < 900) window.__last = 1; save(); } }
    if (!S.writing) window.__last = 0;
  }
}, 250);
poll();
</script></body></html>`;
