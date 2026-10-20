// ⚔️ Squad battle pages (public, on the bot Worker):
//   GET  /battle/tv/<id>.<token>              the TV screen (teams, clocks, the question, animations, sounds)
//   GET  /battle/tv/<id>.<token>/state        its state (no answer of the question on screen)
//   GET  /battle/tv/<id>.<token>/qr.svg       the QR code of the judge link
//   GET  /battle/judge/<id>.<token>           the teacher's phone: answer + buttons
//   POST /battle/judge/<id>.<token>/claim     this phone becomes the judge (the first one, or with the PIN)
//   GET  /battle/judge/<id>.<token>/state     state with the answer
//   POST /battle/judge/<id>.<token>/act       correct / pass / wrong / skip / pause / resume / stop / start / starter / rematch
//                                             with the version and the question id the phone showed (a stale tap: 409)
// The server owns the game; both pages only draw what it returns, and never an older version than the one they show.
import type { Env } from "../shared/types.ts";
import { BattleDuplicate, BattleError, BattleStale, getBattle, judgeAction, judgeSeen, judgeUrl, liveBattle, stateTag, timeLeft, tvView } from "../shared/battle.ts";
import type { BAction, Battle } from "../shared/battle.ts";
import { qrSvg } from "../shared/qr.ts";
import { one, run } from "../shared/db.ts";

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const html = (body: string) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" } });
const ACTIONS = ["starter", "start", "correct", "pass", "wrong", "skip", "pause", "resume", "stop", "rematch"];


export async function handleBattle(request: Request, env: Env, who: "tv" | "judge", id: number, token: string, action: string | undefined): Promise<Response> {
  const b0 = await getBattle(env, id);
  const okToken = b0 && (who === "tv" ? b0.tv_token : b0.judge_token) === token;
  if (!b0 || !okToken) return action ? json({ error: "This battle doesn't exist anymore." }, 404) : html(GONE);
  const b = await liveBattle(env, b0);
  const url = new URL(request.url);
  if (who === "tv") {
    if (!action) return html(TV(b));
    if (action === "state") {
      const since = Number(url.searchParams.get("seq") || 0);
      // what the TV shows (version, question id, whose turn, phase): anything else and it gets the whole state
      const seen = String(url.searchParams.get("v") || "");
      let cur = b;
      // long poll: wait (up to ~5 s) for a new version, so the TV shows a judge's tap at once; it only reads the version
      // while waiting (never writes; every writer raises it), then reads the whole battle once
      if (since && url.searchParams.get("wait") === "1" && ["playing", "paused", "lobby"].includes(cur.state.phase) && (!seen || seen === stateTag(cur.state))) {
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 250));
          const x = await one<{ seq: number | null }>(env, "SELECT json_extract(state, '$.seq') AS seq FROM battles WHERE id = ?", id);
          if (!x) return json({ error: "This battle doesn't exist anymore." }, 404);
          if (Number(x.seq) !== cur.state.seq) break;
          if (cur.state.phase === "lobby" && i >= 8) break;   // the lobby also shows when the judge connects
          if (cur.state.phase === "playing" && timeLeft(cur.state, cur.state.turn, Date.now()) <= 0) break;   // a clock at 0: the end, now
        }
        const x = await getBattle(env, id);
        if (!x) return json({ error: "This battle doesn't exist anymore." }, 404);
        cur = await liveBattle(env, x);
      }
      const v = tvView(cur);
      // nothing new: a tiny answer (the clocks are computed on the screen, from the server's time)
      if (since && since === v.version && seen === v.v && v.phase !== "countdown") return json({ version: v.version, seq: v.seq, v: v.v, same: true, judge: v.judge, left: v.left, now: v.now, running: v.running, phase: v.phase });
      return json(v);
    }
    if (action === "qr.svg") return new Response(qrSvg(judgeUrl(env, b), { dark: "#0b1020" }), { headers: { "content-type": "image/svg+xml", "cache-control": "no-store" } });
    return json({ error: "unknown" }, 404);
  }
  // ---- judge
  if (!action) return html(JUDGE(b));
  const key = String(request.headers.get("x-judge-key") || "").slice(0, 64);
  if (action === "claim" && request.method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { body = {}; }
    const k = String(body.key || key || "").slice(0, 64);
    if (k.length < 16) return json({ error: "bad key" }, 400);
    if (!b.judge_key || b.judge_key === k || String(body.pin || "") === b.judge_pin) {
      await run(env, "UPDATE battles SET judge_key = ?, judge_seen = ? WHERE id = ?", k, Math.floor(Date.now() / 1000), b.id);
      return json({ ok: true });
    }
    return json({ error: body.pin ? "Wrong PIN." : "Another phone is already the judge.", need: "pin" }, 403);
  }
  if (!b.judge_key || key !== b.judge_key) return json({ error: "Another phone is the judge. Enter the PIN shown in the dashboard to judge from this one.", need: "pin" }, 403);
  await judgeSeen(env, b);
  if (action === "state" && request.method === "GET") return json(tvView(b, Date.now(), true));
  if (action === "act" && request.method === "POST") {
    let body: any = {};
    try { body = await request.json(); } catch { body = {}; }
    if (!ACTIONS.includes(body.a)) return json({ error: "unknown action" }, 400);
    // every tap names the version it was made on ("seq": a page opened before this change); none: it's stale
    const version = Number(body.version ?? body.seq);
    if (!Number.isFinite(version)) return json({ error: "The screen changed: check the question before judging.", stale: true, ...tvView(b, Date.now(), true) }, 409);
    const x: BAction = { a: body.a, team: body.team === 1 ? 1 : 0, version, qid: typeof body.qid === "string" ? body.qid : null, aid: typeof body.aid === "string" ? body.aid.slice(0, 40) : null };
    try {
      await judgeAction(env, b as Battle, x);
    } catch (e) {
      // the same tap again (a retry): done already, the phone just gets the state
      if (e instanceof BattleDuplicate) return json({ dup: true, ...tvView(b, Date.now(), true) });
      if (e instanceof BattleStale) return json({ error: e.message, stale: true, ...tvView(b, Date.now(), true) }, 409);
      if (e instanceof BattleError) return json({ error: e.message, ...tvView(b, Date.now(), true) }, 409);
      throw e;
    }
    return json(tvView(b, Date.now(), true));
  }
  return json({ error: "unknown" }, 404);
}

const GONE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Squad battle</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0b1020;color:#e7edf8;font:18px system-ui,sans-serif;text-align:center"><div><div style="font-size:64px">⚔️</div><p>This battle doesn't exist anymore.<br>Open it again from the ClassBot dashboard.</p></div></body>`;

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Code coloring for the TV (sent to the browser as is, so it uses nothing from outside). */
function codeHighlight(code: string): string {
  const e = (x: string) => x.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" } as Record<string, string>)[c]);
  const rx = /(\/\/[^\n]*|<!--[\s\S]*?-->)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`]*`)|\b(const|let|var|function|return|if|else|for|while|echo|def|print|class|new|import|from|public|private|true|false|null|SELECT|FROM|WHERE|ORDER BY|GROUP BY|INSERT|INTO|UPDATE|DELETE|JOIN|VALUES)\b|(<\/?[a-zA-Z][\w-]*)|(_{3,})|(\b\d+(?:\.\d+)?\b)/g;
  let out = "", i = 0, m: RegExpExecArray | null;
  while ((m = rx.exec(code))) {
    out += e(code.slice(i, m.index));
    const cls = m[1] ? "com" : m[2] ? "str" : m[3] ? "kw" : m[4] ? "tag" : m[5] ? "blank" : "num";
    out += '<span class="' + cls + '">' + (m[5] ? "???" : e(m[0])) + "</span>";
    i = m.index + m[0].length;
  }
  return out + e(code.slice(i));
}

// =================================================================== the TV
const TV = (b: Battle) => `<!doctype html><html lang="${b.settings.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>⚔️ ${esc(b.title)}</title>
<style>
:root{--a:${b.teams[0].color};--b:${b.teams[1].color};--bg:#070b18;--ink:#eef3ff;--soft:#9fb0d4;--good:#22c55e;--bad:#ef4444;--warn:#f59e0b}
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--ink);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
body{background:radial-gradient(1200px 700px at 15% 10%,color-mix(in srgb,var(--a) 22%,transparent),transparent 60%),radial-gradient(1200px 700px at 85% 90%,color-mix(in srgb,var(--b) 22%,transparent),transparent 60%),var(--bg)}
.grid-bg{position:fixed;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:56px 56px;mask-image:radial-gradient(ellipse at center,#000 30%,transparent 80%);pointer-events:none}
.top{position:fixed;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:1.6vh 2.4vw;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:1.1vw;color:var(--soft)}
.top .logo{color:var(--ink);font-size:1.4vw}.top .logo b{background:linear-gradient(90deg,var(--a),var(--b));-webkit-background-clip:text;background-clip:text;color:transparent}
.stage{position:fixed;inset:8vh 2vw 3vh;display:grid;grid-template-columns:22vw 1fr 22vw;gap:2vw;align-items:center}
.team{position:relative;border-radius:28px;padding:3vh 1.4vw;text-align:center;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02));border:2px solid rgba(255,255,255,.08);transition:transform .45s cubic-bezier(.2,.9,.3,1.3),opacity .4s,box-shadow .4s,border-color .4s;opacity:.5;transform:scale(.94)}
.team.on{opacity:1;transform:scale(1.04);border-color:var(--c);box-shadow:0 0 0 6px color-mix(in srgb,var(--c) 22%,transparent),0 30px 80px -20px color-mix(in srgb,var(--c) 70%,transparent)}
.team .emo{font-size:5.4vw;line-height:1.1;filter:drop-shadow(0 8px 20px rgba(0,0,0,.4))}
.team .name{font-size:2vw;font-weight:800;margin:.6vh 0 1.4vh;color:var(--c);text-shadow:0 2px 20px color-mix(in srgb,var(--c) 50%,transparent)}
.ring{position:relative;width:15vw;height:15vw;margin:0 auto}
.ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:9}.ring .bg{stroke:rgba(255,255,255,.08)}.ring .fg{stroke:var(--c);stroke-linecap:round;transition:stroke .3s}
.clock{position:absolute;inset:0;display:grid;place-items:center;font-size:3.6vw;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.clock small{font-size:.45em;opacity:.6}
.team.low .clock{color:var(--bad);animation:beat 1s infinite}.team.low .ring .fg{stroke:var(--bad)}
.team.crit .clock{animation:beat .5s infinite}
@keyframes beat{0%,100%{transform:scale(1)}15%{transform:scale(1.12)}30%{transform:scale(1)}}
.turn{display:inline-block;margin-top:1.6vh;padding:.6vh 1.2vw;border-radius:999px;background:var(--c);color:#fff;font-weight:800;font-size:1vw;letter-spacing:.12em;text-transform:uppercase;visibility:hidden}
.team.on .turn{visibility:visible;animation:glow 1.2s ease-in-out infinite}
@keyframes glow{50%{box-shadow:0 0 30px var(--c)}}
.tstats{display:flex;justify-content:center;gap:1.2vw;margin-top:1.4vh;font-size:1.15vw;color:var(--soft);font-weight:600}
.fire{position:absolute;top:-1.6vh;right:-1vw;padding:.5vh .9vw;border-radius:999px;background:linear-gradient(90deg,#f97316,#ef4444);font-weight:800;font-size:1vw;transform:scale(0);transition:transform .35s cubic-bezier(.2,.9,.3,1.5)}
.fire.show{transform:scale(1) rotate(6deg)}
.float{position:absolute;left:50%;top:40%;transform:translate(-50%,0);font-size:3vw;font-weight:900;pointer-events:none;animation:floatUp 1.6s ease-out forwards}
@keyframes floatUp{0%{opacity:0;transform:translate(-50%,20px) scale(.6)}15%{opacity:1;transform:translate(-50%,0) scale(1.2)}100%{opacity:0;transform:translate(-50%,-14vh) scale(1)}}
.center{display:grid;gap:2vh;align-content:center;min-height:0}
.card{position:relative;border-radius:32px;padding:4vh 3vw;background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.12);box-shadow:0 40px 120px -40px rgba(0,0,0,.8);backdrop-filter:blur(6px);min-height:44vh;display:grid;align-content:center;gap:2.4vh;transition:border-color .3s}
.card.in{animation:cardIn .55s cubic-bezier(.2,.9,.3,1.2)}
@keyframes cardIn{0%{opacity:0;transform:translateY(30px) rotateX(18deg) scale(.96)}100%{opacity:1;transform:none}}
.card.shake{animation:shake .5s;border-color:var(--bad)}
@keyframes shake{10%,90%{transform:translateX(-4px)}20%,80%{transform:translateX(8px)}30%,50%,70%{transform:translateX(-14px)}40%,60%{transform:translateX(14px)}}
.meta{display:flex;gap:.8vw;justify-content:center;flex-wrap:wrap}
.chip{padding:.7vh 1.1vw;border-radius:999px;background:rgba(255,255,255,.1);font-weight:700;font-size:1.05vw;letter-spacing:.04em}
.chip.kind{background:linear-gradient(90deg,color-mix(in srgb,var(--c) 70%,#000),color-mix(in srgb,var(--c) 40%,#000));color:#fff}
.prompt{font-size:2.6vw;font-weight:800;text-align:center;line-height:1.25;text-wrap:balance}
pre.code{margin:0 auto;max-width:100%;background:#0b1224;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:2.2vh 2vw;font:600 1.8vw/1.5 "JetBrains Mono","Fira Code",Consolas,monospace;color:#e2e8f0;text-align:left;overflow:hidden;white-space:pre-wrap}
pre.code .blank{background:color-mix(in srgb,var(--warn) 35%,transparent);color:#fff;border-radius:6px;padding:0 .3em;box-shadow:inset 0 -3px 0 var(--warn)}
pre.code .kw{color:#c084fc}pre.code .str{color:#86efac}pre.code .num{color:#fbbf24}pre.code .tag{color:#7dd3fc}pre.code .com{color:#64748b}
.opts{display:grid;grid-template-columns:1fr 1fr;gap:1.4vh 1.4vw}
.opt{display:flex;gap:1vw;align-items:center;padding:1.6vh 1.4vw;border-radius:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);font-size:1.7vw;font-weight:700}
.opt b{display:grid;place-items:center;min-width:2.8vw;height:2.8vw;border-radius:12px;background:var(--c);color:#fff}
.reveal{text-align:center;font-size:1.5vw;color:var(--soft);min-height:3vh;transition:opacity .3s}
.reveal b{color:var(--ink)}
.overlay{position:fixed;inset:0;display:grid;place-items:center;z-index:20;pointer-events:none}
.flash{position:fixed;inset:0;z-index:15;pointer-events:none;opacity:0}
.flash.go{animation:flash .9s ease-out}
@keyframes flash{0%{opacity:.75}100%{opacity:0}}
.stamp{font-size:7vw;font-weight:900;letter-spacing:.02em;text-shadow:0 10px 60px rgba(0,0,0,.6);animation:stamp 1.2s cubic-bezier(.2,.9,.3,1.4) forwards}
.stamp small{display:block;font-size:.3em;text-align:center;font-weight:700;color:#fff;opacity:.9}
@keyframes stamp{0%{opacity:0;transform:scale(2.4) rotate(-8deg)}25%{opacity:1;transform:scale(1) rotate(-4deg)}75%{opacity:1;transform:scale(1) rotate(-4deg)}100%{opacity:0;transform:scale(.9) rotate(-4deg)}}
.count{font-size:22vw;font-weight:900;animation:count .95s ease-out forwards;background:linear-gradient(180deg,#fff,#93c5fd);-webkit-background-clip:text;background-clip:text;color:transparent}
@keyframes count{0%{opacity:0;transform:scale(2.2)}20%{opacity:1;transform:scale(1)}80%{opacity:1}100%{opacity:0;transform:scale(.6)}}
.screen{position:fixed;inset:0;z-index:10;display:grid;place-items:center;background:rgba(7,11,24,.86);backdrop-filter:blur(8px);text-align:center}
.screen[hidden]{display:none}
.vs{display:flex;align-items:center;gap:4vw;justify-content:center}
.vs .t{display:grid;gap:1vh}.vs .t .e{font-size:8vw;animation:bob 2.4s ease-in-out infinite}.vs .t:last-child .e{animation-delay:1.2s}
.vs .t .n{font-size:2.8vw;font-weight:900}
.vs .x{font-size:6vw;font-weight:900;font-style:italic;background:linear-gradient(90deg,var(--a),var(--b));-webkit-background-clip:text;background-clip:text;color:transparent}
@keyframes bob{50%{transform:translateY(-14px) rotate(-4deg)}}
.lobby-row{display:flex;gap:4vw;align-items:center;justify-content:center;margin-top:5vh}
.qr{background:#fff;border-radius:22px;padding:1.2vw;width:15vw;height:15vw;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.qr img{width:100%;height:100%;display:block}
.hint{font-size:1.4vw;color:var(--soft);max-width:30vw;text-align:left;line-height:1.5}
.hint b{color:var(--ink)}
.ok{color:var(--good);font-weight:800}
.btn{pointer-events:auto;border:0;border-radius:999px;padding:1.4vh 2vw;font:700 1.1vw system-ui;background:rgba(255,255,255,.12);color:#fff;cursor:pointer}
.btn:hover{background:rgba(255,255,255,.2)}
.corner{position:fixed;right:2vw;bottom:2vh;display:flex;gap:.8vw;z-index:30}
.win .trophy{font-size:11vw;animation:bob 2s ease-in-out infinite}
.win h1{font-size:5vw;margin:1vh 0;font-weight:900}
.win .sub{font-size:1.6vw;color:var(--soft)}
.wstats{display:grid;grid-template-columns:auto 1fr 1fr;gap:1.2vh 3vw;margin:4vh auto 0;font-size:1.6vw;text-align:center;align-items:center}
.wstats .h{font-weight:900}.wstats .l{color:var(--soft);text-align:left;font-size:1.2vw;text-transform:uppercase;letter-spacing:.06em}
.paused{font-size:6vw;font-weight:900}
canvas#fx{position:fixed;inset:0;z-index:25;pointer-events:none}
.qn{font-variant-numeric:tabular-nums}
.sync{display:inline-block;width:.55vw;height:.55vw;min-width:7px;min-height:7px;border-radius:50%;background:var(--good);margin-left:.7vw;vertical-align:middle;opacity:.55;transition:background .3s}
.sync.off{background:var(--warn);opacity:1;animation:beat 1s infinite}
</style></head><body><div class="grid-bg"></div>
<div class="top"><div class="logo">⚔️ <b>Squad battle</b></div><div id="title">${esc(b.title)}</div><div><span id="round"></span> · <span class="qn" id="qn"></span><span class="sync" id="sync"></span></div></div>
<div class="stage">
  <section class="team" id="t0" style="--c:var(--a)"><div class="fire" id="f0"></div><div class="emo" id="e0"></div><div class="name" id="n0"></div>
    <div class="ring"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" id="r0" cx="50" cy="50" r="44" stroke-dasharray="276.46" stroke-dashoffset="0"/></svg><div class="clock" id="c0"></div></div>
    <div class="turn" id="u0"></div><div class="tstats" id="s0"></div></section>
  <section class="center"><div class="card" id="card"></div><div class="reveal" id="reveal"></div></section>
  <section class="team" id="t1" style="--c:var(--b)"><div class="fire" id="f1"></div><div class="emo" id="e1"></div><div class="name" id="n1"></div>
    <div class="ring"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" id="r1" cx="50" cy="50" r="44" stroke-dasharray="276.46" stroke-dashoffset="0"/></svg><div class="clock" id="c1"></div></div>
    <div class="turn" id="u1"></div><div class="tstats" id="s1"></div></section>
</div>
<div class="screen" id="lobby" hidden></div>
<div class="screen" id="pause" hidden><div class="paused">⏸</div></div>
<div class="screen win" id="win" hidden></div>
<div class="flash" id="flash"></div>
<div class="overlay" id="ov"></div>
<canvas id="fx"></canvas>
<div class="corner"><button class="btn" id="snd">🔇 Sound</button><button class="btn" id="fs">⛶ Full screen</button></div>
<script>
const FR = ${JSON.stringify(b.settings.lang !== "en")};
const T = FR ? { turn: "À vous !", scan: "Scanne pour être l'arbitre", scanHint: "Le formateur scanne ce code avec son téléphone : il voit la réponse et juge chaque réponse.", ready: "Arbitre connecté ✓", wait: "En attente du lancement…", correct: "CORRECT !", pass: "PASSE", wrong: "NON !", skip: "Autre question", answer: "Réponse", prev: "Réponse précédente", wins: "gagne !", left: "temps restant", ok: "Bonnes réponses", passes: "Passes", streak: "Meilleure série", fastest: "Réponse la plus rapide", round: "Manche", q: "Question", go: "GO !", sound: "Son", tap: "Clique pour activer le son 🔊", out: "Plus de questions : l'équipe avec le plus de temps gagne." }
  : { turn: "Your turn!", scan: "Scan to judge", scanHint: "The teacher scans this code with their phone: they see the answer and judge each answer.", ready: "Judge connected ✓", wait: "Waiting for the start…", correct: "CORRECT!", pass: "PASS", wrong: "NO!", skip: "New question", answer: "Answer", prev: "Previous answer", wins: "wins!", left: "time left", ok: "Correct answers", passes: "Passes", streak: "Best streak", fastest: "Fastest answer", round: "Round", q: "Question", go: "GO!", sound: "Sound", tap: "Click to turn the sound on 🔊", out: "No more questions: the team with more time left wins." };
const BASE = location.pathname.replace(/\\/$/, "");
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
let S = null, lastEv = 0, lastQ = "", lastPhase = "", lastTick = -1, lastFull = 0, lastOk = 0;
// the server's time here (the clocks count from it, like the judge's phone): from the quickest answer seen
let skew = 0, bestRtt = Infinity;
const srvNow = () => Date.now() + skew;
const sample = (t0, d) => { const t1 = Date.now(), rtt = t1 - t0; if (d && d.now && rtt <= bestRtt + 20) { bestRtt = Math.min(bestRtt, rtt); skew = d.now + rtt / 2 - t1; } };

// ---------------------------------------------------------------- sound (made in the browser, no files)
let AC = null, soundOn = false;
const tone = (f, d, type = "sine", v = .2, when = 0, slide = 0) => {
  if (!AC || !soundOn) return;
  const t = AC.currentTime + when, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + .05);
};
const SFX = {
  correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .25, "triangle", .25, i * .08)),
  wrong: () => { tone(160, .45, "sawtooth", .18); tone(120, .45, "square", .08, .05); },
  pass: () => tone(700, .4, "sine", .2, 0, 200),
  tick: () => tone(1200, .05, "square", .06),
  beep: (hi) => tone(hi ? 880 : 440, hi ? .5 : .18, "triangle", .3),
  turn: () => tone(600, .12, "sine", .15),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? .7 : .2, "triangle", .3, i * .15)),
};
function enableSound() {
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); AC.resume(); soundOn = !soundOn || !AC; } catch { soundOn = false; }
  $("#snd").textContent = (soundOn ? "🔊 " : "🔇 ") + T.sound;
  if (soundOn) SFX.turn();
}
$("#snd").onclick = (e) => { e.stopPropagation(); enableSound(); };
$("#fs").onclick = (e) => { e.stopPropagation(); if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };
document.addEventListener("click", () => { if (!AC) enableSound(); }, { once: true });

// ---------------------------------------------------------------- confetti
const cv = $("#fx"), cx = cv.getContext("2d"); let parts = [];
const fit = () => { cv.width = innerWidth; cv.height = innerHeight; }; fit(); addEventListener("resize", fit);
function confetti(colors, n = 140, from = null) {
  for (let i = 0; i < n; i++) parts.push({ x: from ? from.x : Math.random() * cv.width, y: from ? from.y : -20, vx: (Math.random() - .5) * (from ? 18 : 6), vy: from ? -Math.random() * 18 - 4 : Math.random() * 4 + 2,
    s: Math.random() * 10 + 6, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: colors[i % colors.length], life: 0 });
}
(function loop() {
  cx.clearRect(0, 0, cv.width, cv.height);
  parts = parts.filter((p) => p.y < cv.height + 40 && p.life < 600);
  for (const p of parts) { p.life++; p.vy += .25; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); cx.restore(); }
  requestAnimationFrame(loop);
})();

// ---------------------------------------------------------------- drawing
const fmt = (ms) => { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); if (ms < 10000) return (ms / 1000).toFixed(1) + "<small>s</small>"; return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const hl = ${codeHighlight.toString()};
function card(q) {
  const el = $("#card");
  if (!q) { el.innerHTML = ""; lastQ = ""; return; }
  // the question is the server's (by id): the card changes exactly when the judge's phone changes
  const key = q.id + "|" + q.n;
  if (key === lastQ) return;
  lastQ = key;
  el.style.setProperty("--c", S.turn === 0 ? "var(--a)" : "var(--b)");
  el.innerHTML = '<div class="meta"><span class="chip kind">' + q.emoji + " " + esc(q.label) + '</span><span class="chip">' + esc(q.topic) + "</span></div>" +
    '<div class="prompt">' + esc(q.prompt) + "</div>" + (q.code ? '<pre class="code">' + hl(q.code) + "</pre>" : "") +
    (q.options ? '<div class="opts">' + q.options.map((o, i) => '<div class="opt"><b>' + "ABCD"[i] + "</b>" + esc(o) + "</div>").join("") + "</div>" : "");
  el.classList.remove("in"); void el.offsetWidth; el.classList.add("in");
}
function stamp(text, color, sub = "") {
  const o = $("#ov");
  o.innerHTML = '<div class="stamp" style="color:' + color + '">' + text + (sub ? "<small>" + sub + "</small>" : "") + "</div>";
  const f = $("#flash"); f.style.background = "radial-gradient(circle at center," + color + ",transparent 70%)"; f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
}
function floatOn(team, text, color) {
  const t = $("#t" + team), d = document.createElement("div");
  d.className = "float"; d.style.color = color; d.textContent = text; t.appendChild(d); setTimeout(() => d.remove(), 1700);
}
function onEvent(ev) {
  const col = S.teams[ev.team].color;
  const rect = $("#t" + ev.team).getBoundingClientRect();
  if (ev.k === "correct") {
    stamp("✓ " + T.correct, "#22c55e", ev.ms != null ? (ev.ms / 1000).toFixed(1) + " s" : ""); SFX.correct();
    confetti([col, "#22c55e", "#fff"], 70, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    $("#reveal").innerHTML = "↩ " + T.prev + " : <b>" + esc(ev.answer || "") + "</b>";
  } else if (ev.k === "pass") {
    stamp("⏭ " + T.pass, "#f59e0b", "−" + S.settings.penalty + " s"); SFX.pass(); floatOn(ev.team, "−" + S.settings.penalty + "s", "#f59e0b");
    $("#reveal").innerHTML = "↩ " + T.prev + " : <b>" + esc(ev.answer || "") + "</b>";
  } else if (ev.k === "wrong") {
    stamp("✗ " + T.wrong, "#ef4444"); SFX.wrong();
    const c = $("#card"); c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake");
  } else if (ev.k === "skip") { $("#reveal").innerHTML = "↻ " + T.skip; SFX.turn(); }
  else if (ev.k === "start") countdown();
  else if (ev.k === "reset") { $("#reveal").innerHTML = ""; parts = []; }
}
function countdown() {
  $("#reveal").innerHTML = "";
  const left = Math.max(0, (S.goAt || 0) - S.now);
  const steps = ["3", "2", "1", T.go];
  steps.forEach((s, i) => setTimeout(() => { $("#ov").innerHTML = '<div class="count">' + s + "</div>"; SFX.beep(i === 3); }, Math.max(0, left - 3600) + i * 900));
}
function lobby() {
  const L = $("#lobby");
  if (S.phase !== "lobby") { L.hidden = true; return; }
  L.hidden = false;
  L.innerHTML = '<div><div class="vs"><div class="t"><div class="e">' + esc(S.teams[0].emoji) + '</div><div class="n" style="color:var(--a)">' + esc(S.teams[0].name) + '</div></div><div class="x">VS</div><div class="t"><div class="e">' + esc(S.teams[1].emoji) + '</div><div class="n" style="color:var(--b)">' + esc(S.teams[1].name) + "</div></div></div>" +
    '<div class="lobby-row">' + (S.judge ? '<div class="hint"><span class="ok">' + T.ready + "</span><br>" + T.wait + "<br><br>⏱️ " + Math.round(S.settings.seconds / 60 * 10) / 10 + " min · ⏭️ −" + S.settings.penalty + " s · " + (S.unasked ?? S.total) + " questions</div>"
      : '<div class="qr"><img src="' + BASE + '/qr.svg" alt="QR"></div><div class="hint"><b>📱 ' + T.scan + "</b><br>" + T.scanHint + "</div>") + "</div>" +
    (AC ? "" : '<p class="hint" style="text-align:center;max-width:none;margin-top:4vh">' + T.tap + "</p>") + "</div>";
}
function win() {
  const W = $("#win");
  if (S.phase !== "over" || S.winner == null) { W.hidden = true; return; }
  if (!W.hidden) return;
  W.hidden = false;
  const w = S.teams[S.winner], s = S.stats;
  const f = (ms) => (ms == null ? "—" : (ms / 1000).toFixed(1) + " s");
  W.innerHTML = '<div><div class="trophy">🏆</div><h1 style="color:' + w.color + '">' + esc(w.emoji + " " + w.name) + " " + T.wins + '</h1><div class="sub">' + T.left + " : <b>" + fmt(S.left[S.winner]).replace(/<[^>]+>/g, "") + "</b></div>" +
    (S.ev && S.ev.why === "out" ? '<div class="sub">' + T.out + "</div>" : "") +
    '<div class="wstats"><div></div><div class="h" style="color:var(--a)">' + esc(S.teams[0].name) + '</div><div class="h" style="color:var(--b)">' + esc(S.teams[1].name) + "</div>" +
    [[T.ok, s.ok[0], s.ok[1]], [T.passes, s.pass[0], s.pass[1]], [T.streak, "🔥 " + S.best[0], "🔥 " + S.best[1]], [T.fastest, f(s.fastest[0]), f(s.fastest[1])]].map((r) => '<div class="l">' + r[0] + "</div><div>" + r[1] + "</div><div>" + r[2] + "</div>").join("") + "</div></div>";
  SFX.win();
  confetti([w.color, "#fbbf24", "#fff"], 260);
  setTimeout(() => confetti([w.color, "#fbbf24"], 200), 1200);
  setTimeout(() => confetti([w.color, "#fff"], 200), 2600);
}
function draw() {
  if (!S) { requestAnimationFrame(draw); return; }
  const el = Math.max(0, srvNow() - S.now);
  $("#sync").classList.toggle("off", Date.now() - lastOk > 4000);
  for (const t of [0, 1]) {
    const run = S.running === t;
    const ms = Math.max(0, S.left[t] - (run ? el : 0));
    $("#c" + t).innerHTML = fmt(ms);
    const frac = Math.max(0, Math.min(1, ms / (S.settings.seconds * 1000)));
    $("#r" + t).setAttribute("stroke-dashoffset", String(276.46 * (1 - frac)));
    const box = $("#t" + t);
    box.classList.toggle("on", S.turn === t && ["playing", "paused", "countdown"].includes(S.phase));
    box.classList.toggle("low", run && ms < 10000); box.classList.toggle("crit", run && ms < 5000);
    if (run && ms < 10000 && ms > 0) { const sec = Math.ceil(ms / 1000); if (sec !== lastTick) { lastTick = sec; SFX.tick(); } }
  }
  requestAnimationFrame(draw);
}
function render() {
  for (const t of [0, 1]) {
    $("#e" + t).textContent = S.teams[t].emoji; $("#n" + t).textContent = S.teams[t].name; $("#u" + t).textContent = T.turn;
    $("#s" + t).innerHTML = "<span>✅ " + S.stats.ok[t] + "</span><span>⏭️ " + S.stats.pass[t] + "</span>";
    const f = $("#f" + t); f.textContent = "🔥 ×" + S.streak[t]; f.classList.toggle("show", S.streak[t] >= 3);
  }
  $("#round").textContent = T.round + " " + S.round;
  $("#qn").textContent = S.q ? T.q + " " + S.q.n : "";
  card(S.q);
  $("#pause").hidden = S.phase !== "paused";
  lobby(); win();
  if (S.phase !== "over") $("#win").hidden = true;
}
function show(d) {
  // never an older state than the one on screen (the server's version only goes up)
  if (S && d.version != null && S.version != null && d.version < S.version) return;
  const prev = S;
  S = d;
  // an animation or a sound that fails never keeps the screen on an old question
  try {
    if (d.ev && d.ev.seq !== lastEv) { if (prev) onEvent(d.ev); lastEv = d.ev.seq; }
    if (prev && prev.turn !== d.turn && d.phase === "playing") SFX.turn();
    if (d.phase === "countdown" && lastPhase !== "countdown" && prev && (!d.ev || d.ev.k !== "start")) countdown();
  } catch (e) { console.error(e); }
  lastPhase = d.phase;
  try { render(); } catch (e) { console.error(e); }
}
async function poll() {
  let wait = 300;
  try {
    const ctl = new AbortController(); const kill = setTimeout(() => ctl.abort(), 12000);
    const live = S && ["playing", "paused", "lobby"].includes(S.phase);
    // every 15 s the whole state again, whatever happens: the screen can never stay on an old question
    const full = !S || Date.now() - lastFull > 15000;
    const t0 = Date.now();
    const r = await fetch(BASE + "/state" + (S && !full ? "?seq=" + S.version + "&v=" + encodeURIComponent(S.v || "") + (live ? "&wait=1" : "") : ""), { cache: "no-store", signal: ctl.signal });
    clearTimeout(kill);
    if (r.status === 404) { document.body.innerHTML = '<div class="screen"><div class="paused">⚔️</div></div>'; return; }
    const d = await r.json();
    sample(t0, d); lastOk = Date.now();
    if (full && !d.same) lastFull = Date.now();
    if (d.same && S) { S.left = d.left; S.now = d.now; S.running = d.running; S.phase = d.phase; if (d.judge !== S.judge) { S.judge = d.judge; lobby(); } wait = 0; }
    else if (!d.same) { show(d); wait = 0; }
  } catch { wait = 800; }
  setTimeout(poll, S && S.phase === "over" ? 1500 : S && S.phase === "countdown" ? 250 : wait);
}
poll(); requestAnimationFrame(draw);
</script></body></html>`;

// =================================================================== the judge's phone
const JUDGE = (b: Battle) => `<!doctype html><html lang="${b.settings.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><meta name="theme-color" content="#0b1020"><title>⚖️ Judge · ${esc(b.title)}</title>
<style>
:root{--a:${b.teams[0].color};--b:${b.teams[1].color};--bg:#0b1020;--card:#141b31;--ink:#eef3ff;--soft:#9fb0d4;--line:#24304f;--good:#16a34a;--bad:#dc2626;--warn:#d97706}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100%}
body{padding:max(12px,env(safe-area-inset-top)) 14px calc(16px + env(safe-area-inset-bottom));display:grid;gap:12px;max-width:560px;margin:0 auto;user-select:none}
.clocks{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ck{border-radius:16px;padding:10px 12px;background:var(--card);border:2px solid transparent;opacity:.6;transition:.25s}
.ck.on{opacity:1;border-color:var(--c);box-shadow:0 0 24px -6px var(--c)}
.ck .n{font-weight:800;color:var(--c);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ck .t{font-size:30px;font-weight:800;font-variant-numeric:tabular-nums}
.ck.low .t{color:#f87171}
.ck .s{font-size:12px;color:var(--soft)}
.card{background:var(--card);border-radius:18px;padding:14px 16px;display:grid;gap:10px}
.k{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--soft)}
.p{font-size:18px;font-weight:700}
pre{margin:0;background:#0a1020;border:1px solid var(--line);border-radius:12px;padding:10px 12px;font:600 14px/1.45 Consolas,monospace;white-space:pre-wrap;overflow:auto}
.ans{border-radius:14px;padding:12px 14px;background:color-mix(in srgb,var(--good) 18%,transparent);border:1px solid color-mix(in srgb,var(--good) 55%,transparent)}
.ans b{display:block;font-size:22px;color:#4ade80;margin-top:2px;word-break:break-word}
.ans small{color:var(--soft)}
.opts{display:grid;gap:4px;font-size:14px;color:var(--soft)}
button{font:inherit;border:0;border-radius:18px;color:#fff;cursor:pointer;touch-action:manipulation;transition:transform .08s,filter .2s}
button:active{transform:scale(.97)}button:disabled{filter:grayscale(.8) brightness(.6)}
.big{width:100%;padding:22px;font-size:24px;font-weight:900;letter-spacing:.02em}
.ok{background:linear-gradient(180deg,#22c55e,#15803d);box-shadow:0 10px 30px -10px #22c55e}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.no{background:linear-gradient(180deg,#ef4444,#b91c1c);padding:18px;font-size:19px;font-weight:800}
.pass{background:linear-gradient(180deg,#f59e0b,#b45309);padding:18px;font-size:19px;font-weight:800}
.big.pass{padding:20px;font-size:22px}
.small{display:flex;gap:8px;flex-wrap:wrap}
.small button{flex:1;background:#24304f;padding:12px;font-size:14px;font-weight:700}
.team{padding:20px;font-size:20px;font-weight:800;background:var(--card);border:3px solid transparent}
.team[aria-pressed=true]{border-color:var(--c);background:color-mix(in srgb,var(--c) 25%,var(--card))}
.start{background:linear-gradient(90deg,var(--a),var(--b))}
h1{margin:0;font-size:20px}.muted{color:var(--soft);font-size:14px}
.msg{min-height:20px;font-size:14px;color:#fbbf24;text-align:center}
.center{text-align:center}
input{font:inherit;font-size:28px;letter-spacing:.3em;text-align:center;width:100%;padding:14px;border-radius:14px;border:1px solid var(--line);background:#0a1020;color:var(--ink)}
.win{font-size:56px;text-align:center}
.hidden{display:none!important}
/* space between the buttons: no wrong tap in the heat of the game */
#main{display:grid;gap:22px}
#main .row{gap:18px}
#main .small{gap:12px;margin-top:14px;padding-top:20px;border-top:1px dashed var(--line)}
#main .small button{padding:14px 10px}
.sync{display:inline-block;width:9px;height:9px;border-radius:50%;background:#22c55e;margin-left:8px;vertical-align:middle;opacity:.7}
.sync.off{background:#f59e0b;opacity:1}
</style></head><body>
<div><h1>⚖️ ${esc(b.title)}<span class="sync" id="sync"></span></h1><div class="muted" id="sub"></div></div>
<div class="clocks"><div class="ck" id="k0" style="--c:var(--a)"><div class="n" id="kn0"></div><div class="t" id="kt0"></div><div class="s" id="ks0"></div></div>
  <div class="ck" id="k1" style="--c:var(--b)"><div class="n" id="kn1"></div><div class="t" id="kt1"></div><div class="s" id="ks1"></div></div></div>
<div id="main"></div>
<div class="msg" id="msg"></div>
<script>
const FR = ${JSON.stringify(b.settings.lang !== "en")};
const T = FR ? { start: "▶ Lancer la partie", who: "Qui commence ?", correct: "✓ Bonne réponse", wrong: "✗ Faux", pass: "⏭ Passe", pause: "⏸ Pause", resume: "▶ Reprendre", skip: "↻ Autre question", stop: "■ Terminer", rematch: "🔁 Revanche", answer: "Réponse", turnOf: "Au tour de", wins: "gagne !", pin: "Un autre téléphone est l'arbitre. Entre le code PIN affiché dans le tableau de bord :", pinBtn: "Devenir l'arbitre", countdown: "3… 2… 1…", sure: "Terminer la partie maintenant ?", loading: "Connexion…", changed: "L'écran a changé : vérifie la question avant de juger.", tv: "Affiche la partie sur la TV, puis lance-la ici.", q: "Question", out: "Plus de questions : l'équipe avec le plus de temps gagne." }
  : { start: "▶ Start the game", who: "Who starts?", correct: "✓ Correct", wrong: "✗ Wrong", pass: "⏭ Pass", pause: "⏸ Pause", resume: "▶ Resume", skip: "↻ Other question", stop: "■ End", rematch: "🔁 Rematch", answer: "Answer", turnOf: "Turn of", wins: "wins!", pin: "Another phone is the judge. Enter the PIN shown in the dashboard:", pinBtn: "Become the judge", countdown: "3… 2… 1…", sure: "End the game now?", loading: "Connecting…", changed: "The screen changed: check the question before judging.", tv: "Show the game on the TV, then start it here.", q: "Question", out: "No more questions: the team with more time left wins." };
const BASE = location.pathname.replace(/\\/$/, "");
const ID = BASE.split("/").pop().split(".")[0];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
let KEY = null;
try { KEY = localStorage.getItem("battle-judge-" + ID); } catch {}
if (!KEY) { KEY = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join(""); try { localStorage.setItem("battle-judge-" + ID, KEY); } catch {} }
let S = null, busy = false, view = "", lastKey = "", lastOk = 0;
// the server's time here (the clocks count from it, like the TV): from the quickest answer seen
let skew = 0, bestRtt = Infinity;
const srvNow = () => Date.now() + skew;
const sample = (t0, d) => { const t1 = Date.now(), rtt = t1 - t0; if (d && d.now && rtt <= bestRtt + 20) { bestRtt = Math.min(bestRtt, rtt); skew = d.now + rtt / 2 - t1; } };
const H = { "content-type": "application/json", "x-judge-key": KEY };
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => x.toString(16).padStart(2, "0")).join("");
async function claim(pin) {
  const r = await fetch(BASE + "/claim", { method: "POST", headers: H, body: JSON.stringify({ key: KEY, pin }) });
  return r.ok ? null : (await r.json()).error;
}
function pinScreen(err) {
  view = "pin";
  $("#main").innerHTML = '<div class="card"><p>' + T.pin + '</p><input id="pin" inputmode="numeric" maxlength="4" autocomplete="off"><button class="big start" id="pinb">' + T.pinBtn + "</button></div>";
  $("#msg").textContent = err || "";
  $("#pinb").onclick = async () => { const e = await claim($("#pin").value.trim()); if (e) pinScreen(e); else { view = ""; poll(); } };
}
/**
 * The server's state, drawn as is. Never an older one than the one on screen: the server's version only goes up, and
 * answers can arrive out of order (a poll that read the game just before a tap). The buttons always belong to the
 * question on screen, and every tap names it (its version and its id).
 */
function apply(d) {
  if (!d || d.version == null) return;
  if (S && d.version < S.version) return;
  S = d;
  const key = d.version + "|" + d.phase + "|" + (d.q ? d.q.id : "");
  if (key !== lastKey) { lastKey = key; render(); }
}
const setButtons = (on) => document.querySelectorAll("button").forEach((x) => (x.disabled = !on));
async function act(a, extra = {}) {
  if (busy || !S) return;
  busy = true; setButtons(false);
  buzz(a === "correct" ? [30, 40, 30] : 40);
  // the same id if the network fails and it's sent again: the server applies it once
  const body = JSON.stringify({ a, version: S.version, qid: S.q ? S.q.id : null, aid: hex(8), ...extra });
  for (let i = 0; i < 2; i++) {
    try {
      const t0 = Date.now();
      const r = await fetch(BASE + "/act", { method: "POST", headers: H, body, cache: "no-store" });
      const d = await r.json();
      sample(t0, d); lastOk = Date.now();
      $("#msg").textContent = r.ok ? "" : (d.stale ? T.changed : d.error || "");
      busy = false;
      apply(d);
      break;
    } catch {
      $("#msg").textContent = "Network…";
      if (i === 0) await new Promise((r) => setTimeout(r, 700));
    }
  }
  busy = false;
  setButtons(true);
}
const fmt = (ms) => { ms = Math.max(0, ms); if (ms < 10000) return (ms / 1000).toFixed(1); const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
function clocks() {
  if (!S) return;
  const el = Math.max(0, srvNow() - S.now);
  $("#sync").classList.toggle("off", Date.now() - lastOk > 3500);
  for (const t of [0, 1]) {
    const ms = Math.max(0, S.left[t] - (S.running === t ? el : 0));
    $("#kt" + t).textContent = fmt(ms);
    $("#k" + t).classList.toggle("on", S.turn === t && S.phase !== "lobby" && S.phase !== "over");
    $("#k" + t).classList.toggle("low", S.running === t && ms < 10000);
  }
  requestAnimationFrame(clocks);
}
function render() {
  for (const t of [0, 1]) { $("#kn" + t).textContent = S.teams[t].emoji + " " + S.teams[t].name; $("#ks" + t).textContent = "✅ " + S.stats.ok[t] + " · ⏭️ " + S.stats.pass[t] + (S.streak[t] >= 3 ? " · 🔥" + S.streak[t] : ""); }
  $("#sub").textContent = (S.phase === "playing" || S.phase === "paused") ? T.turnOf + " " + S.teams[S.turn].name : "";
  const m = $("#main");
  if (S.phase === "lobby") {
    m.innerHTML = '<div class="card"><div class="k">' + T.who + '</div><div class="row">' + [0, 1].map((t) => '<button class="team" style="--c:' + S.teams[t].color + '" data-team="' + t + '" aria-pressed="' + (S.starter === t) + '">' + esc(S.teams[t].emoji + " " + S.teams[t].name) + "</button>").join("") + "</div>" +
      '<p class="muted" style="margin:0">' + T.tv + '</p><button class="big start" id="go">' + T.start + "</button></div>";
    m.querySelectorAll("[data-team]").forEach((x) => (x.onclick = () => act("starter", { team: Number(x.dataset.team) })));
    $("#go").onclick = () => act("start");
  } else if (S.phase === "countdown") {
    m.innerHTML = '<div class="card center"><div class="win">⏳</div><p class="p">' + T.countdown + "</p></div>";
  } else if (S.phase === "over") {
    const w = S.teams[S.winner ?? 0];
    m.innerHTML = '<div class="card center"><div class="win">🏆</div><p class="p" style="color:' + w.color + '">' + esc(w.emoji + " " + w.name) + " " + T.wins + "</p>" +
      (S.ev && S.ev.why === "out" ? '<p class="muted">' + T.out + "</p>" : "") + '<button class="big start" id="rm">' + T.rematch + "</button></div>";
    $("#rm").onclick = () => act("rematch");
  } else {
    const q = S.q || {};
    m.innerHTML = '<div class="card"><div class="k">' + (q.emoji || "") + " " + esc(q.label) + " · " + esc(q.topic) + " · " + T.q + " " + (q.n || "") + '</div><div class="p">' + esc(q.prompt) + "</div>" +
      (q.code ? "<pre>" + esc(q.code) + "</pre>" : "") + (q.options ? '<div class="opts">' + q.options.map((o, i) => "<div><b>" + "ABCD"[i] + "</b> · " + esc(o) + "</div>").join("") + "</div>" : "") +
      '<div class="ans"><small>' + T.answer + "</small><b>" + esc(q.answer) + "</b>" + (q.explain ? "<small>" + esc(q.explain) + "</small>" : "") + "</div></div>" +
      (S.phase === "paused" ? '<button class="big ok" id="res">' + T.resume + "</button>"
        : '<button class="big ok" id="ok">' + T.correct + '</button><button class="big pass" id="ps">' + T.pass + " −" + S.settings.penalty + "s</button>") +
      '<div class="small">' + (S.phase === "paused" ? "" : '<button id="pz">' + T.pause + "</button>") + '<button id="sk">' + T.skip + '</button><button id="st">' + T.stop + "</button></div>";
    const on = (id, f) => { const x = $(id); if (x) x.onclick = f; };
    on("#ok", () => act("correct")); on("#ps", () => act("pass")); on("#pz", () => act("pause")); on("#res", () => act("resume")); on("#sk", () => act("skip"));
    on("#st", () => { if (confirm(T.sure)) act("stop"); });
  }
}
async function poll() {
  if (view === "pin") return;
  // not while a tap is on its way: its answer brings the new state
  if (!busy) {
    try {
      const t0 = Date.now();
      const r = await fetch(BASE + "/state", { headers: H, cache: "no-store" });
      if (r.status === 403) { const e = await claim(); if (e) { pinScreen(); return; } }
      else if (r.ok) { const d = await r.json(); sample(t0, d); lastOk = Date.now(); if (!busy) apply(d); }
    } catch {}
  }
  setTimeout(poll, S && S.phase === "countdown" ? 400 : 1000);
}
$("#main").innerHTML = '<div class="card center">' + T.loading + "</div>";
claim().then((e) => { if (e) pinScreen(); else poll(); requestAnimationFrame(clocks); });
</script></body></html>`;
