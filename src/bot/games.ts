// 🎮 Class games pages (public, on the bot Worker):
//   GET  /game/<id>.<tv>            the class TV (with the teacher's buttons)     GET  /play/<id>.<code>           a student's phone / laptop
//   GET  /game/<id>.<tv>/state      what the TV shows                              (the student's own link comes from Discord: /play or 🎮)
//   POST /game/<id>.<tv>/act        start / reveal / next / stop / kick / unban    POST /play/<id>.<code>/join      {pass}: this device plays for that student
//                                   announce / pardon
//                                   results (relay tests) / reset                  GET  /play/<id>.<code>/state     what this student sees
//   GET  /game/<id>.<tv>/qr.svg     the QR code of the join link                   POST /play/<id>.<code>/answer|revive|check|hint|accuse|code|noise|mic
//   GET  /game/<id>.<tv>/codes      relay: every squad's code + the tests (run on the TV)
//                                                                                  GET  /play/<id>.<code>/case      sql: the story, the database, the clues
import type { Env } from "../shared/types.ts";
import { COUNTDOWN_MS, GameError, isHost, NEXT_MS, bumpGame, cheatRelay, accuseSql, answerRoyale, pleaRoyale, caseForPlayers, gameCase, relayStarter, tryRelay, checkSql, getGame, hintSql, hostAction, joinGame, joinUrl, liveGame, noiseRelay, playerByKey, playerView, postJoin, readGamePass, reviveRoyale, saveRelayCode, teamsOf, tvView } from "../shared/games.ts";
import type { GAction, Game, Player } from "../shared/games.ts";
import { qrSvg } from "../shared/qr.ts";
import { now, run } from "../shared/db.ts";

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const html = (body: string) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" } });
const esc = (s: string) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]!));
const GONE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Class game</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0b1020;color:#e7edf8;font:18px system-ui,sans-serif;text-align:center"><div><div style="font-size:64px">🎮</div><p>This game doesn't exist anymore.<br>Ask your teacher for the new link.</p></div></body>`;
const HOST_ACTIONS = ["letin", "start", "reveal", "next", "hold", "stop", "kick", "unban", "announce", "pardon", "strike", "results", "runtests", "reset"];

async function body(request: Request): Promise<any> { try { return await request.json(); } catch { return {}; } }

export async function handleGame(request: Request, env: Env, who: "tv" | "play", id: number, token: string, action: string | undefined): Promise<Response> {
  const g0 = await getGame(env, id);
  const ok = g0 && (who === "tv" ? g0.tv_token : g0.join_code) === token;
  if (!g0 || !ok) return action ? json({ error: "This game doesn't exist anymore." }, 404) : html(GONE);
  const gm = await liveGame(env, g0);
  const url = new URL(request.url);
  try {
    if (who === "tv") {
      // the page itself (it asks for the key it got from the dashboard), and the join QR code: for anyone
      if (!action) return html(TV(gm));
      if (action === "qr.svg") return new Response(qrSvg(joinUrl(env, gm), { dark: "#0b1020" }), { headers: { "content-type": "image/svg+xml", "cache-control": "no-store" } });
      // everything else (what the screen shows, the squads' code, the controls): only the teacher, with their key
      if (!(await isHost(env, gm, request.headers.get("x-host-key")))) return json({ error: "Only the teacher can open this screen: open it from the dashboard (📺 Open the TV screen).", host: true }, 403);
      // the first time the teacher's TV shows the lobby: the 🎮 Join button goes to #arena by itself
      if (action === "state" && gm.state.phase === "lobby" && !gm.state.posted) await postJoin(env, gm).catch((e) => console.error("game join post", e?.message ?? e));
      if (action === "state") {
        const since = Number(url.searchParams.get("seq") || 0);
        // nothing new: a tiny answer (the clocks run on the screen); during a royale question the answer count moves
        if (since && since === gm.state.seq && !(gm.kind === "royale" && gm.state.phase === "question") && !(gm.kind === "relay" && gm.state.phase === "playing")) return json({ seq: gm.state.seq, same: true, now: Date.now() });
        return json(await tvView(env, gm));
      }
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
    if (action === "case" && gm.kind === "sql") return new Response(JSON.stringify(caseForPlayers(gameCase(gm))), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, max-age=600" } });
    const b = request.method === "POST" ? await body(request) : {};
    const key = String(b.key || url.searchParams.get("key") || request.headers.get("x-player-key") || "").slice(0, 64);
    if (action === "join" && request.method === "POST") {
      const pid = await readGamePass(env, gm.id, String(b.pass || ""));
      if (!pid) return json({ error: "This link isn't valid anymore: type /play in Discord to get a new one.", join: true }, 403);
      const p = await joinGame(env, gm, key, pid);
      return json(await playerView(env, (await getGame(env, gm.id))!, p));
    }
    const p = await playerByKey(env, gm.id, key);
    if (!p) return json({ error: "Open your own link from Discord (/play).", join: true }, 403);
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
      case "plea": await pleaRoyale(env, gm, p); return json(await fresh());
      case "check": return json(await checkSql(env, gm, p, Number(b.step), Array.isArray(b.rows) ? b.rows : []));
      case "hint": return json(await hintSql(env, gm, p));
      case "accuse": return json(await accuseSql(env, gm, p, String(b.name || "").slice(0, 80)));
      case "code": await saveRelayCode(env, gm, p, Number(b.turn), String(b.code ?? "")); return json({ ok: true, at: Date.now() });
      case "cheat": return json(await cheatRelay(env, gm, p, String(b.what || "")));
      case "noise": return json(await noiseRelay(env, gm, p, Date.now(), b.why === "muted" ? "muted" : "voice", b.rel == null ? null : Number(b.rel)));
      case "try": return json(await tryRelay(env, gm, p, String(b.code ?? "")));
      case "mic": {
        const v = b.state === "muted" ? 2 : b.on ? 1 : 0;
        if (p.mic !== v) { await run(env, "UPDATE game_players SET mic = ? WHERE game_id = ? AND pid = ?", v, gm.id, p.pid); if (gm.kind === "relay") await bumpGame(env, gm); }
        return json({ ok: true });
      }
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
#app:has(.rgrid){grid-template-rows:auto 1fr;gap:2vh;align-content:start}
.rtask{padding:2.4vh 2vw;align-self:end}.rtt{font-size:1.8vw;font-weight:900;display:flex;gap:1vw;align-items:center}.rtt .chip{font-size:1vw}
.rtask p{font-size:1.5vw;line-height:1.5;color:#dbe4fb;margin:1vh 0}.rrules{font-size:1.1vw;color:var(--soft);font-weight:700}
.rcard{padding:2.2vh 1.6vw}
.rcard{border-radius:22px;padding:1.6vh 1.2vw;background:var(--card);border:3px solid var(--c);position:relative}
.rcard.out{opacity:.45;filter:grayscale(1)}
.rcard h3{margin:0 0 1vh;font-size:1.6vw}.writer{font-size:2vw;font-weight:900}
.tbar{height:1.2vh;border-radius:9px;background:rgba(255,255,255,.1);overflow:hidden;margin:1vh 0}.tbar i{display:block;height:100%;background:linear-gradient(90deg,var(--c),#fff);transition:width .25s linear}
.order{display:flex;flex-wrap:wrap;gap:.4vw}.order span{font-size:.95vw;padding:.3vh .6vw;border-radius:999px;background:rgba(255,255,255,.08)}.order span.on{background:var(--c);color:#fff}
.strikes{position:absolute;top:1.2vh;right:1vw;font-size:1.2vw;font-weight:900;border:0;border-radius:999px;padding:.5vh .9vw;background:rgba(255,255,255,.08);color:var(--soft)}
.strikes.hot{background:rgba(239,68,68,.3);color:#fff}
.rcard.noise{animation:shake .5s 2;box-shadow:0 0 0 4px #ef4444,0 0 50px rgba(239,68,68,.6)}
.rcard{overflow:hidden;background:linear-gradient(180deg,color-mix(in srgb,var(--c) 16%,transparent),rgba(255,255,255,.03))}
.rhead{display:flex;justify-content:space-between;align-items:center;gap:1vw}
.spips{display:flex;gap:.4vw;border:0;background:none;padding:0}.spips i{width:1.7vw;height:1.7vw;border-radius:.5vw;border:2px solid rgba(239,68,68,.5);display:grid;place-items:center;font-style:normal;font-size:.9vw;font-weight:900;color:#fff}
.spips i.on{background:linear-gradient(135deg,#ef4444,#b91c1c);border-color:#fca5a5;box-shadow:0 0 1vw rgba(239,68,68,.7)}
.sbtn{display:flex;align-items:center;gap:.5vw}.sadd{width:1.7vw;height:1.7vw;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:#fca5a5;font-size:1.1vw;font-weight:800;line-height:1;cursor:pointer;opacity:.45;transition:opacity .2s,background .2s}.rcard:hover .sadd,.sadd:hover{opacity:1}.sadd:hover{background:rgba(239,68,68,.35);color:#fff}
.wrow{display:flex;gap:1vw;align-items:center;margin:.6vh 0}
.wav{width:4vw;height:4vw;border-radius:50%;display:grid;place-items:center;font-weight:900;font-size:1.4vw;background:var(--c);box-shadow:0 0 0 .4vw color-mix(in srgb,var(--c) 30%,transparent),0 0 2vw var(--c);animation:bob 2s ease-in-out infinite}
.typing{display:inline-flex;gap:.25vw;vertical-align:middle;margin-left:.4vw}.typing i{width:.5vw;height:.5vw;border-radius:50%;background:var(--soft);animation:pulse 1s infinite}.typing i:nth-child(2){animation-delay:.2s}.typing i:nth-child(3){animation-delay:.4s}
.order{align-items:center;margin-top:1vh}.order em{color:var(--soft);font-style:normal}
.moff{color:#fca5a5;margin-right:.2vw}
.stamp{position:absolute;inset:0;z-index:3;display:grid;place-items:center;align-content:center;gap:.6vh;background:rgba(69,10,10,.82);animation:koin .3s}
.stamp b{font-size:2.4vw;font-weight:900;letter-spacing:.08em;padding:.6vh 1.4vw;border:.35vw solid #ef4444;border-radius:1vw;color:#fecaca;transform:rotate(-8deg);animation:stampp .5s cubic-bezier(.2,1.6,.4,1)}
.stamp span{font-size:1.2vw;font-weight:800}.stamp.ko{background:rgba(0,0,0,.88)}
@keyframes koin{0%{background:#fff}}
@keyframes stampp{0%{transform:scale(2.6) rotate(-8deg);opacity:0}100%{transform:scale(1) rotate(-8deg);opacity:1}}
.res{display:grid;gap:1.2vh}.aij{font-size:1.3vw;color:#c4b5fd;margin:0 0 2vh}.aiw{font-size:1.05vw;color:var(--soft);margin:-.6vh 0 .6vh 1.4vw}.resrow{display:grid;grid-template-columns:16vw 1fr 8vw;gap:1vw;align-items:center;font-size:1.4vw;font-weight:800}
.pbar{height:2.4vh;border-radius:9px;background:rgba(255,255,255,.1);overflow:hidden}.pbar i{display:block;height:100%;background:var(--good)}
.fullcode{max-height:34vh;font-size:1.1vw}
#app:has(.rgrid){grid-template-rows:auto 1fr auto}
#alerts{align-self:center;justify-self:center;max-width:80vw}
.alk{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:.8vh 1.4vw;background:rgba(17,24,39,.92);border:1px solid rgba(245,158,11,.55);border-radius:18px;padding:1.2vh 1vw;box-shadow:0 1.5vh 4vh rgba(0,0,0,.5);backdrop-filter:blur(8px);animation:pop .4s}
.alk-h{font-size:.95vw;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#fcd34d}
.alk-r{display:grid;grid-template-columns:auto 1fr auto;gap:.7vw;align-items:center;padding:.6vh .5vw .6vh .6vw;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid var(--line)}.alk-av{width:2.4vw;height:2.4vw;border-radius:50%;display:grid;place-items:center;font-weight:900;font-size:.85vw;background:var(--c)}
.alk-r b{display:block;font-size:1vw}.alk-r span{font-size:.85vw;color:var(--soft)}.alk-r .btn{font-size:.85vw;padding:.7vh .9vw;background:linear-gradient(90deg,#f59e0b,#ef4444)}
.alk-more{font-size:.85vw;color:var(--soft);text-align:right;margin-top:.4vh}
#alts{position:fixed;top:8vh;right:2vw;z-index:20;display:grid;gap:.8vh;justify-items:end}
.alt{display:flex;gap:.6vw;align-items:center;padding:1vh 1.2vw;border-radius:999px;background:rgba(17,24,39,.92);border:1px solid rgba(239,68,68,.6);border-left:.5vw solid var(--c);font-size:1.05vw;box-shadow:0 1vh 3vh rgba(0,0,0,.45);animation:altin .45s cubic-bezier(.2,1.4,.4,1);transition:opacity .5s,transform .5s}
.alt.ok{border-color:rgba(34,197,94,.6)}.alt i{font-style:normal;color:var(--soft);font-size:.9vw}.alt.bye{opacity:0;transform:translateX(3vw)}
@keyframes altin{from{opacity:0;transform:translateX(6vw)}}
.toast{position:fixed;top:8vh;left:50%;transform:translateX(-50%);background:#111827;border:1px solid var(--line);padding:1.2vh 1.6vw;border-radius:14px;font-weight:700;z-index:50;font-size:1.1vw}

/* ---- look: moving light, glass cards */
body::before,body::after{content:"";position:fixed;width:60vw;height:60vw;border-radius:50%;filter:blur(90px);opacity:.35;z-index:-1;pointer-events:none}
body::before{background:#7c3aed;top:-25vw;left:-15vw;animation:drift 18s ease-in-out infinite alternate}
body::after{background:#0891b2;bottom:-30vw;right:-15vw;animation:drift 22s ease-in-out infinite alternate-reverse}
@keyframes drift{to{transform:translate(12vw,8vh) scale(1.15)}}
.grid-bg{position:fixed;inset:0;z-index:-1;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:4vw 4vw;mask-image:radial-gradient(ellipse at center,#000 30%,transparent 75%)}
.top>div{display:flex;align-items:center;gap:.6vw}
.pill{padding:.6vh 1vw;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid var(--line);color:var(--ink);font-weight:800}
.pill.hot{background:rgba(239,68,68,.22);border-color:rgba(239,68,68,.5)}
.prog{position:fixed;top:0;left:0;height:.6vh;background:linear-gradient(90deg,#8b5cf6,#06b6d4);z-index:7;transition:width .6s;box-shadow:0 0 12px #8b5cf6}
.glass{background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.03));border:1px solid var(--line);border-radius:28px;backdrop-filter:blur(8px)}
/* ---- lobby: join from Discord */
.lobby2{display:grid;grid-template-columns:30vw 1fr;gap:3vw;align-items:center;height:100%}
.joincard{padding:3vh 2vw;text-align:center;position:relative;overflow:hidden}
.joincard::before{content:"";position:absolute;inset:-2px;border-radius:30px;padding:2px;background:linear-gradient(135deg,#5865f2,#8b5cf6,#06b6d4);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.dlogo{width:6vw;height:6vw;margin:0 auto 1.4vh;border-radius:26%;display:grid;place-items:center;background:#5865f2;font-size:3.4vw;box-shadow:0 0 40px rgba(88,101,242,.6);animation:bob 3s ease-in-out infinite}
.joincard h2{font-size:2vw;margin:0 0 1.6vh}
.jsteps{display:grid;gap:1.2vh;text-align:left;margin-top:1vh}
.jsteps div{display:flex;gap:1vw;align-items:center;font-size:1.25vw;color:#dbe4fb}
.jsteps i{flex:none;font-style:normal;display:grid;place-items:center;width:2.6vw;height:2.6vw;border-radius:50%;background:rgba(255,255,255,.1);font-weight:900}
kbd{font:800 1.3vw/1 "JetBrains Mono",Consolas,monospace;padding:.5vh .7vw;border-radius:8px;background:#0b1224;border:1px solid var(--line);color:#c4b5fd}
.jnote{margin-top:2vh;font-size:1vw;color:var(--soft)}
.crown{font-size:5vw;display:inline-block;animation:bob 2.4s ease-in-out infinite;filter:drop-shadow(0 0 24px rgba(245,158,11,.6))}
.ptitle{font-size:4.2vw;font-weight:900;margin:0;background:linear-gradient(90deg,#fff,#c4b5fd 50%,#67e8f9);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:-.02em}
.pl{display:inline-flex;align-items:center;gap:.5vw}
.pl .av{display:grid;place-items:center;width:1.9vw;height:1.9vw;border-radius:50%;background:rgba(0,0,0,.28);font-size:.9vw;font-weight:900}
.sqbox{border-radius:22px;padding:1.4vh 1.1vw;background:linear-gradient(180deg,color-mix(in srgb,var(--c) 22%,transparent),rgba(255,255,255,.03));border:2px solid color-mix(in srgb,var(--c) 70%,transparent);min-width:13vw;animation:pop .4s}
.sqbox b{font-size:1.4vw}.sqbox .mem{display:flex;flex-wrap:wrap;gap:.4vw}
.sqbox .mem button{border:0;color:#fff;font-weight:700;font-size:1vw;padding:.4vh .7vw;border-radius:999px;background:rgba(0,0,0,.25)}
.sqbox .mem button:hover,.pl:hover{outline:2px solid #fff}
.empty{font-size:1.3vw;color:var(--soft);margin-top:2vh;animation:pulse 2s infinite}
@keyframes pulse{50%{opacity:.45}}
/* ---- countdown */
.cd{display:grid;place-items:center;align-content:center;gap:2vh;text-align:center;height:100%}
.cd h1{font-size:3vw;margin:0;color:var(--soft);letter-spacing:.3em;text-transform:uppercase}
.cdn{font-size:17vw;font-weight:900;line-height:1;color:#fff;text-shadow:0 0 .4em rgba(139,92,246,.9),0 0 1.2em rgba(6,182,212,.5);margin:2vh 0}
.cdn.tick{animation:cdpop .9s ease-out}
@keyframes cdpop{0%{transform:scale(1.8);opacity:0}25%{transform:scale(.95);opacity:1}100%{transform:scale(1);opacity:1}}
.cd .sub{font-size:1.6vw;color:#dbe4fb}
.go{position:fixed;inset:0;display:grid;place-items:center;font-size:16vw;font-weight:900;color:#fff;z-index:20;pointer-events:none;animation:goflash .8s ease-out forwards;text-shadow:0 0 60px #22c55e}
@keyframes goflash{0%{transform:scale(.4);opacity:0}30%{transform:scale(1.15);opacity:1}100%{transform:scale(1.6);opacity:0}}
/* ---- question */
.q{display:flex;flex-direction:column;gap:1.5vh;min-height:0}.ring{width:7vw;height:7vw}.ring span{font-size:2.4vw}
.qhead .chip{font-size:1.1vw}
.ring{filter:drop-shadow(0 0 18px var(--rc,#8b5cf6))}.ring .fg{stroke:var(--rc,#8b5cf6);transition:stroke .4s}
.ring.hurry{animation:hurry .5s ease-in-out infinite alternate}
@keyframes hurry{to{transform:scale(1.08)}}
.promptbox{padding:2.4vh 2vw;animation:rise .5s both}
.opt{animation:rise .5s both;box-shadow:0 .8vh 0 rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.25)}
.opt:nth-child(2){animation-delay:.08s}.opt:nth-child(3){animation-delay:.16s}.opt:nth-child(4){animation-delay:.24s}
@keyframes rise{from{transform:translateY(3vh);opacity:0}}
.opt b{font-size:1.5vw}.q .opt{padding:3.2vh 1.6vw}
.opt.yes{animation:glow 1.2s ease-in-out infinite alternate}
@keyframes glow{from{box-shadow:0 0 0 .4vw #fff,0 0 30px rgba(255,255,255,.4)}to{box-shadow:0 0 0 .5vw #fff,0 0 60px rgba(255,255,255,.7)}}
.ansbar{display:flex;align-items:center;gap:1vw;font-size:1.2vw;color:var(--soft);font-weight:800}
.ansbar .pbar{flex:1;height:1.4vh}.ansbar .pbar i{background:linear-gradient(90deg,#8b5cf6,#06b6d4);transition:width .4s}
.arena{display:flex;flex-wrap:wrap;gap:.8vw;justify-content:center}
.sqcard{display:flex;align-items:center;gap:.7vw;padding:.9vh 1vw;border-radius:16px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 35%,transparent),rgba(255,255,255,.04));border:1px solid color-mix(in srgb,var(--c) 60%,transparent);font-weight:800;font-size:1.1vw;transition:all .5s}
.sqcard .e{font-size:1.6vw}.sqcard .hp{letter-spacing:.1vw;font-size:1vw}
.sqcard.dead{filter:grayscale(1);opacity:.35;transform:scale(.94)}
.sqcard .pts{padding:.2vh .6vw;border-radius:999px;background:rgba(0,0,0,.25);font-size:.95vw}
/* ---- one card per player knocked out */
.deaths{position:fixed;inset:0;z-index:28;display:grid;place-items:center;align-content:center;gap:2.4vh;background:radial-gradient(circle at center,rgba(127,29,29,.8),rgba(0,0,0,.94) 70%);animation:wipein .3s ease-out;pointer-events:auto}
.deaths h1{margin:0;font-size:4.4vw;letter-spacing:.08em;color:#fecaca;text-shadow:0 0 30px rgba(239,68,68,.8);animation:rise .4s both}
.dgrid{display:flex;flex-wrap:wrap;justify-content:center;gap:1.4vw;max-width:88vw}
.dcard{position:relative;display:grid;justify-items:center;gap:.8vh;width:12vw;padding:2vh 1vw 1.6vh;border-radius:22px;background:linear-gradient(180deg,color-mix(in srgb,var(--c) 45%,#1f2937),#111827);border:2px solid var(--c);box-shadow:0 0 30px color-mix(in srgb,var(--c) 50%,transparent);opacity:0;animation:slam .45s cubic-bezier(.2,1.6,.4,1) forwards,die 1s forwards;animation-delay:var(--d),calc(var(--d) + .7s)}
.dcard .dav{width:6vw;height:6vw;border-radius:50%;display:grid;place-items:center;font-size:2.4vw;font-weight:900;color:#fff;background:var(--c);position:relative}
.dcard .dav::after{content:"💀";position:absolute;inset:0;display:grid;place-items:center;font-size:4.4vw;opacity:0;animation:stamp .35s forwards;animation-delay:calc(var(--d) + .55s)}
.dcard b{font-size:1.35vw;max-width:11vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dcard small{font-size:1vw;color:#fca5a5;font-weight:700}
@keyframes slam{0%{opacity:0;transform:scale(1.8) rotate(-8deg)}60%{opacity:1;transform:scale(.92) rotate(2deg)}100%{opacity:1;transform:scale(1) rotate(0)}}
@keyframes die{0%{filter:none}30%{filter:brightness(2.2) saturate(0)}100%{filter:grayscale(1) brightness(.75);transform:translateY(.8vh) rotate(-3deg)}}
@keyframes stamp{0%{opacity:0;transform:scale(2.4)}70%{opacity:1;transform:scale(.9)}100%{opacity:1;transform:scale(1)}}
/* ---- wiped squad */
.wipe{position:fixed;inset:0;z-index:30;display:grid;place-items:center;align-content:center;gap:1.6vh;text-align:center;background:radial-gradient(circle at center,color-mix(in srgb,var(--c) 40%,#000) 0%,#000 70%);animation:wipein .35s ease-out,shake .5s .35s 2;overflow:hidden}
@keyframes wipein{from{opacity:0}}
.wipe .flash{position:absolute;inset:0;background:#fff;animation:flash .5s ease-out forwards;pointer-events:none}
@keyframes flash{from{opacity:.9}to{opacity:0}}
.wipe .we{font-size:16vw;line-height:1;animation:crack 2.6s ease-in forwards;filter:drop-shadow(0 0 50px var(--c))}
@keyframes crack{0%{transform:scale(.3) rotate(-20deg)}15%{transform:scale(1.15) rotate(4deg)}30%{transform:scale(1) rotate(0)}70%{transform:scale(1) rotate(0);filter:grayscale(0) drop-shadow(0 0 50px var(--c))}100%{transform:scale(.6) rotate(25deg) translateY(10vh);filter:grayscale(1) drop-shadow(0 0 0 transparent);opacity:.2}}
.wipe .wt{font-size:6vw;font-weight:900;letter-spacing:.06em;color:#fff;text-shadow:.3vw 0 #ef4444,-.3vw 0 #06b6d4;animation:glitch .25s steps(2) 6,rise .4s both}
@keyframes glitch{50%{text-shadow:-.4vw 0 #ef4444,.4vw 0 #06b6d4;transform:translateX(.3vw) skewX(-6deg)}}
.wipe .wn{font-size:3vw;font-weight:900;color:var(--c);animation:rise .5s .3s both}
.wipe .wm{display:flex;flex-wrap:wrap;gap:.6vw;justify-content:center;max-width:70vw;animation:rise .5s .5s both}
.wipe .wm span{padding:.6vh 1vw;border-radius:999px;background:rgba(255,255,255,.1);font-weight:800;font-size:1.3vw}
.shard{position:fixed;left:50%;top:45%;width:1.2vw;height:1.2vw;border-radius:3px;background:var(--c);z-index:31;pointer-events:none;animation:shard 1.4s cubic-bezier(.15,.7,.3,1) forwards}
@keyframes shard{to{transform:translate(var(--dx),var(--dy)) rotate(var(--r));opacity:0}}
/* ---- the end */
.podium{display:flex;align-items:flex-end;justify-content:center;gap:1.4vw;margin-top:1vh}
.pod{display:grid;justify-items:center;gap:.6vh;animation:rise .7s both}
.pod .nm{font-weight:900;font-size:1.3vw;max-width:14vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pod .blk{width:12vw;border-radius:18px 18px 0 0;display:grid;place-items:center;font-size:3vw;font-weight:900;background:linear-gradient(180deg,var(--pc),rgba(255,255,255,.04))}
.pod.p1{animation-delay:.6s}.pod.p1 .blk{height:20vh;--pc:#f59e0b}.pod.p2{animation-delay:.3s}.pod.p2 .blk{height:14vh;--pc:#94a3b8}.pod.p3 .blk{height:10vh;--pc:#b45309}
.wbig{font-size:4.6vw;font-weight:900;margin:0;padding:1vh 2.4vw;border-radius:24px;background:linear-gradient(90deg,color-mix(in srgb,var(--c,#f59e0b) 40%,transparent),transparent);text-shadow:0 0 30px var(--c,#f59e0b)}
.rank{display:flex;flex-wrap:wrap;gap:.6vw;justify-content:center;max-width:86vw}
.rank span{padding:.6vh 1vw;border-radius:999px;background:rgba(255,255,255,.08);font-weight:800;font-size:1.05vw}
canvas#conf{position:fixed;inset:0;pointer-events:none;z-index:15}
/* ---- players panel */
.modal{position:fixed;inset:0;z-index:40;display:grid;place-items:center;background:rgba(3,6,15,.72);backdrop-filter:blur(6px)}
.mbox{width:min(46vw,720px);max-height:80vh;overflow:auto;padding:2.6vh 2vw;border-radius:26px;background:#0e1530;border:1px solid var(--line);animation:pop .3s}
.mbox h2{display:flex;justify-content:space-between;align-items:center}
.prow{display:flex;align-items:center;gap:1vw;padding:1vh .4vw;border-bottom:1px solid var(--line);font-size:1.1vw;font-weight:700}
.prow .dotc{width:1vw;height:1vw;border-radius:50%;background:var(--c)}
.prow .grow{flex:1}
.prow .btn{font-size:.95vw;padding:.7vh 1vw}
.mbox .btn.danger{background:rgba(239,68,68,.35)}
</style></head><body>
<div class="grid-bg"></div><div class="prog" id="prog" style="width:0"></div>
<div class="top"><div>🎮 <b id="kind"></b></div><div id="ttl">${esc(gm.title)}</div><div id="info"></div></div>
<div id="app"></div><div id="ov"></div><div id="alts"></div>
<div class="bar" id="bar"></div>
<script>
"use strict";
const BASE = location.pathname.replace(/\\/$/, "");
// the teacher's key (from the dashboard's link, after #): kept in this browser, taken off the address bar
let HOST = "";
{ const k = "cb-host-" + BASE, m = location.hash.match(/h=([A-Za-z0-9_-]+)/);
  if (m) { HOST = m[1]; try { localStorage.setItem(k, HOST); } catch (x) {} try { history.replaceState(null, "", location.pathname + location.search); } catch (x) {} }
  else { try { HOST = localStorage.getItem(k) || ""; } catch (x) {} } }
const HH = { "x-host-key": HOST };
let S = null, off = 0, busy = false, lastSeq = 0, lastKey = "", kick = "", locked = false;
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
    const r = await fetch(BASE + "/act", { method: "POST", headers: Object.assign({ "content-type": "application/json" }, HH), body: JSON.stringify(Object.assign({ a: a }, extra || {})) });
    const d = await r.json();
    if (!r.ok) toast(d.error || "Error"); else take(d);
  } catch (x) { toast(T("Pas de connexion", "No connection")); } finally { busy = false; }
}
function take(d) { if (d.same) { off = d.now - Date.now(); return; } off = d.now - Date.now(); S = d; render(); }
async function poll() {
  try {
    const r = await fetch(BASE + "/state?seq=" + (S ? S.seq : 0), { headers: HH });
    if (r.status === 403) { lockedScreen(); return; }
    if (r.ok) take(await r.json());
  } catch (x) {}
  setTimeout(poll, S && (S.phase === "question" || (S.phase === "reveal" && S.nextAt && S.nextAt - nowMs() < 2000)) ? 800 : 1500);
}
// no key (the link was passed around, or read on the projector): nothing to see, nothing to control
function lockedScreen() {
  if (locked) return; locked = true;
  $("#bar").innerHTML = ""; $("#info").innerHTML = "";
  $("#app").innerHTML = '<div class="card" style="max-width:640px;margin:12vh auto;text-align:center;padding:4vh 3vw"><div style="font-size:5vw">🔒</div><h2>' + T("Écran réservé au formateur", "This screen is for the teacher") + '</h2><p class="muted" style="font-size:1.2vw">' + T("Ouvre-le depuis le tableau de bord (📺 Ouvrir l'écran TV). Pour jouer, utilise ton propre lien : 🎮 Rejoindre dans Discord, ou /play.", "Open it from the dashboard (📺 Open the TV screen). To play, use your own link: 🎮 Join in Discord, or /play.") + "</p></div>";
}
let manage = "", panel = false;
const initials = (n) => String(n || "?").trim().split(/\\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
function players(list, opts) {
  return list.map((p) => '<button class="pl' + (p.alive === false ? " dead" : "") + '" data-who="' + e(p.pid) + '" style="--c:' + (p.squad >= 0 && S.mode !== "solo" ? sq(p.squad).color : "rgba(255,255,255,.12)") + '" title="' + T("Cliquer pour retirer ce joueur", "Click to remove this player") + '"><span class="av">' + e(initials(p.name)) + "</span>" + (opts && opts.mic ? (p.mic === 1 ? "🎤 " : p.mic === 0 ? "🔇 " : "") : "") + e(p.name) + "</button>").join("");
}
function bannedLine() {
  return S.banned && S.banned.length ? '<p class="muted" style="font-size:1vw;margin-top:1.4vh">🚫 ' + T("Retirés : ", "Removed: ") + S.banned.map((b) => e(b.name)).join(", ") + ' <button class="btn" style="font-size:.9vw;padding:.4vh .9vw" data-panel="1">' + T("Gérer", "Manage") + "</button></p>" : "";
}
function lobby(extra) {
  const head = S.kind === "sql" ? '<h1 class="big">🕵️ ' + e(S.case.title) + '</h1><p class="story">' + e(S.case.story) + '</p><p class="muted">' + T("Notions : ", "Notions: ") + S.case.notions.map(e).join(" · ") + "</p>"
    : S.kind === "relay" ? '<h1 class="big">🏃 ' + T("Relais de code", "Code Relay") + " · " + e(S.task.title) + ' <span class="chip" style="font-size:1.2vw;vertical-align:middle">' + e(S.langName || "JavaScript") + '</span></h1><p class="story">' + e(S.task.text) + '</p><p class="muted">' + T("Chacun écrit à son tour : ", "Each one writes in turn: ") + mmss(S.totalMs) + T(" ÷ la taille du squad. ", " ÷ the squad size. ") + (S.noise ? T("Interdit de parler : les micros écoutent (", "No talking: the mics are listening (") + S.strikesMax + T(" avertissements = éliminés).", " strikes = out).") : T("Interdit de parler : le formateur donne les avertissements (", "No talking: the teacher gives the strikes (") + S.strikesMax + T(" = éliminés).", " = out).")) + "</p>"
    : '<div class="crown">👑</div><h1 class="ptitle">Battle Royale</h1><p class="story">' + T("Une mauvaise réponse et tu es éliminé. Le dernier debout gagne !", "One wrong answer and you're out. The last one standing wins!") + (S.mode !== "solo" ? T(" En squad, vos bonnes réponses donnent des points pour ramener un coéquipier. Un squad dont tous les membres tombent est éliminé.", " In squads, your right answers earn points to bring a teammate back. A squad whose members all fall is wiped out.") : "") + "</p>";
  const bySquad = S.mode === "squads" ? '<div class="sqrow">' + S.squads.map((q, i) => {
    if (!q) return "";
    const mem = S.players.filter((p) => p.squad === i);
    return '<div class="sqbox" style="--c:' + q.color + '"><b>' + e(q.emoji + " " + q.name) + ' <span class="muted" style="font-size:1vw">· ' + mem.length + '</span></b><div class="mem">' + (mem.length ? mem.map((p) => '<button data-who="' + e(p.pid) + '" title="' + T("Cliquer pour retirer", "Click to remove") + '">' + e(p.name) + "</button>").join("") : '<span class="muted" style="font-size:.95vw">' + T("personne encore", "nobody yet") + "</span>") + "</div></div>";
  }).join("") + "</div>" : "";
  const join = '<div class="joincard glass"><div class="dlogo">🎮</div><h2>' + T("Rejoins depuis Discord", "Join from Discord") + '</h2><div class="jsteps"><div><i>1</i>' + T("Ouvre Discord sur ton téléphone ou ton PC", "Open Discord on your phone or laptop") + "</div><div><i>2</i><span>" + T("Clique sur <b>🎮 Rejoindre</b> dans #arena, ou tape ", "Click <b>🎮 Join</b> in #arena, or type ") + "<kbd>/play</kbd></span></div><div><i>3</i>" + T("Ouvre ton lien personnel : tu joues sous ton nom", "Open your own link: you play under your name") + '</div></div><div class="jnote">🔒 ' + T("Chaque lien est lié à un compte Discord : personne ne peut jouer à ta place.", "Each link is tied to a Discord account: nobody can play as you.") + "</div></div>";
  const n = S.players.length;
  return '<div class="lobby2">' + join + "<div>" + head + '<h2 style="margin-top:2vh">' + n + T(" joueur", " player") + (n > 1 ? "s" : "") + (S.mode === "random" ? T(" · les squads sont formés au départ", " · the squads are made at the start") : "") + "</h2>" +
    (n || bySquad ? (bySquad || '<div class="plist">' + players(S.players, { mic: S.kind === "relay" }) + "</div>") : '<div class="empty">⏳ ' + T("En attente des joueurs…", "Waiting for players…") + "</div>") + bannedLine() + (extra || "") + "</div></div>";
}
// ---------------------------------------------------------------- 👥 the teacher manages the players
function panelHtml() {
  if (manage) {
    const p = S.players.find((x) => x.pid === manage);
    if (!p) { manage = ""; return panelHtml(); }
    return '<div class="modal" data-close="1"><div class="mbox"><h2>' + e(p.name) + '</h2><p class="muted" style="font-size:1.1vw">' + T("Retirer ce joueur de la partie ? Son lien Discord ne le laissera plus revenir (tu peux annuler dans 👥 Joueurs).", "Remove this player from the game? Their Discord link won't let them back in (you can undo it in 👥 Players).") + '</p><p style="display:flex;gap:1vw;justify-content:flex-end"><button class="btn" data-close="1">' + T("Annuler", "Cancel") + '</button><button class="btn danger" data-kick="' + e(p.pid) + '">🚫 ' + T("Retirer", "Remove") + "</button></p></div></div>";
  }
  if (!panel) return "";
  const rows = S.players.slice().sort((a, b) => a.squad - b.squad || a.name.localeCompare(b.name)).map((p) => '<div class="prow" style="--c:' + (p.squad >= 0 && S.mode !== "solo" ? sq(p.squad).color : "#64748b") + '"><span class="dotc"></span><span class="grow">' + e(p.name) + (p.alive === false && S.phase !== "lobby" ? " 💀" : "") + "</span>" + (S.mode !== "solo" && p.squad >= 0 ? '<span class="muted">' + e(sq(p.squad).emoji + " " + sq(p.squad).name) + "</span>" : "") + '<button class="btn danger" data-kick="' + e(p.pid) + '">🚫 ' + T("Retirer", "Remove") + "</button></div>").join("");
  const banned = (S.banned || []).map((b) => '<div class="prow" style="--c:#ef4444"><span class="dotc"></span><span class="grow">' + e(b.name) + ' <span class="muted">· ' + T("retiré", "removed") + '</span></span><button class="btn" data-unban="' + e(b.pid) + '">↩ ' + T("Laisser revenir", "Let back in") + "</button></div>").join("");
  return '<div class="modal" data-close="1"><div class="mbox"><h2>👥 ' + T("Joueurs", "Players") + " (" + S.players.length + ')<button class="btn" data-close="1">✕</button></h2>' + (rows || '<p class="muted">' + T("Personne pour l'instant.", "Nobody yet.") + "</p>") + (banned ? '<h2 style="margin-top:2vh">🚫 ' + T("Retirés", "Removed") + "</h2>" + banned + '<p class="muted" style="font-size:.95vw">' + T("Un joueur retiré qui revient recommence comme spectateur si la partie a commencé.", "A removed player who comes back watches if the game has started.") + "</p>" : "") + "</div></div>";
}
function drawPanel() { $("#ov").innerHTML = panelHtml(); }
function winScreen(title, sub, more) {
  return '<div class="win"><div class="trophy">🏆</div><h1>' + title + "</h1>" + (sub ? "<p>" + sub + "</p>" : "") + (more || "") + "</div>";
}
// ---------------------------------------------------------------- 👑 royale
let shownStep = 0, shownPhase = "", wipedShown = -1, pre = false;
const SH = ["▲", "◆", "●", "■"];
const squadsLeft = () => new Set(S.players.filter((p) => p.alive && p.squad >= 0).map((p) => p.squad)).size;
const ringColor = (left) => { const f = left / (S.seconds * 1000); return f > .5 ? "#22c55e" : f > .25 ? "#f59e0b" : "#ef4444"; };
function squadArena(reveal) {
  return '<div class="arena">' + S.squads.map((s, i) => {
    if (!s) return "";
    const mem = S.players.filter((p) => p.squad === i);
    if (!mem.length) return "";
    const al = mem.filter((p) => p.alive).length;
    return '<div class="sqcard' + (al ? "" : " dead") + '" style="--c:' + s.color + '"><span class="e">' + e(s.emoji) + "</span>" + e(s.name) + ' <span class="hp">' + "❤️".repeat(Math.min(al, 6)) + (al > 6 ? "+" + (al - 6) : "") + "🖤".repeat(Math.min(mem.length - al, 6)) + '</span><span class="pts">' + (al ? (S.pts[i] || 0) + " pts" : "💀") + "</span></div>";
  }).join("") + "</div>";
}
function countdown() {
  const n = Math.max(1, Math.ceil((S.qAt - nowMs()) / 1000));
  const al = S.players.filter((p) => p.alive).length;
  return '<div class="cd"><h1>' + (S.step === 1 ? T("Préparez-vous", "Get ready") : T("Question ", "Question ") + S.step + " / " + S.total) + '</h1><div class="cdn tick" id="cdn">' + n + '</div><div class="sub">' +
    (S.step === 1 ? al + T(" joueurs en lice · une erreur et c'est fini !", " players · one mistake and you're out!") : "❤️ " + al + T(" encore en vie", " still alive")) + "</div>" + (S.mode !== "solo" ? squadArena(false) : "") + "</div>";
}
function overScreen() {
  const w = S.players.filter((p) => S.winners.includes(p.pid));
  const s = S.winSquad != null ? sq(S.winSquad) : null;
  const ranked = S.players.slice().sort((a, b) => (b.out == null ? 999 : b.out) - (a.out == null ? 999 : a.out) || b.score - a.score);
  const pod = (p, k) => p ? '<div class="pod p' + (k + 1) + '"><div class="nm">' + ["🥇", "🥈", "🥉"][k] + " " + e(p.name) + '</div><div class="muted" style="font-size:1vw">' + p.score + ' ✓</div><div class="blk">' + (k + 1) + "</div></div>" : "";
  const title = s ? '<div class="wbig" style="--c:' + s.color + '">' + e(s.emoji + " " + s.name) + "</div>"
    : '<div class="wbig">' + (w.length === 1 ? "👑 " + e(w[0].name) : w.length ? w.map((p) => e(p.name)).join(", ") : T("Personne ne survit !", "Nobody survives!")) + "</div>";
  const sub = s ? T("Le dernier squad debout · ", "The last squad standing · ") + w.map((p) => e(p.name)).join(", ") : w.length ? T("Dernier survivant", "Last one standing") + (w.length > 1 ? "s" : "") : "";
  return '<div class="win"><div class="trophy">🏆</div>' + title + (sub ? "<p>" + sub + "</p>" : "") + '<div class="podium">' + pod(ranked[1], 1) + pod(ranked[0], 0) + pod(ranked[2], 2) + '</div><div class="rank">' + ranked.slice(3, 24).map((p, i) => "<span>" + (i + 4) + ". " + e(p.name) + " · " + p.score + "✓</span>").join("") + "</div></div>";
}
function royale() {
  const alive = S.players.filter((p) => p.alive);
  $("#info").innerHTML = S.phase === "lobby" ? "" : '<span class="pill' + (alive.length <= 3 ? " hot" : "") + '">❤️ ' + alive.length + T(" en vie", " alive") + "</span>" + (S.mode !== "solo" && S.phase !== "over" ? '<span class="pill">🛡️ ' + squadsLeft() + " squad" + (squadsLeft() > 1 ? "s" : "") + "</span>" : "") + '<span class="pill">' + T("Question ", "Question ") + S.step + "/" + S.total + "</span>";
  $("#prog").style.width = S.phase === "lobby" ? "0" : Math.round(100 * (S.step || 0) / (S.total || 1)) + "%";
  if (S.phase === "lobby") return lobby();
  if (S.phase === "over") return overScreen();
  const q = S.q; if (!q) return "";
  if (S.phase === "question" && nowMs() < S.qAt) return countdown();
  const reveal = S.phase === "reveal";
  const left = reveal ? 0 : S.qEnd - nowMs();
  const L = S.last;
  const total = L ? L.dist.reduce((a, b) => a + b, 0) || 1 : 1;
  let banner = "";
  if (reveal && L) {
    const outs = S.players.filter((p) => L.out.includes(p.pid));
    banner = L.everyone ? '<div class="banner">😅 ' + T("Tout le monde s'est trompé : personne n'est éliminé !", "Everybody was wrong: nobody is out!") + "</div>"
      : outs.length ? '<div class="banner">💀 ' + outs.length + T(" éliminé", " out") + (outs.length > 1 && FR ? "s" : "") + (L.wiped && L.wiped.length ? " · 💥 " + L.wiped.map((i) => e(sq(i).emoji + " " + sq(i).name)).join(", ") : "") + '</div><div class="outs">' + outs.map((p) => '<span class="pl">' + e(p.name) + "</span>").join("") + "</div>"
      : '<div class="banner">🎉 ' + T("Personne n'est éliminé !", "Nobody is out!") + "</div>";
  }
  return '<div class="q"><div class="qhead"><span>' + (q.topic ? '<span class="chip">' + e(q.topic) + "</span>" : "") + '</span><div class="ring' + (!reveal && left < 5000 ? " hurry" : "") + '" id="ring" style="--rc:' + (reveal ? "#8b5cf6" : ringColor(left)) + '"><svg viewBox="0 0 100 100"><circle class="bgc" cx="50" cy="50" r="44"/><circle class="fg" id="rfg" cx="50" cy="50" r="44" stroke-dasharray="276.46" stroke-dashoffset="' + (276.46 * (1 - Math.max(0, left) / (S.seconds * 1000))) + '"/></svg><span id="rt">' + (reveal ? "✓" : Math.max(0, Math.ceil(left / 1000))) + "</span></div><span></span></div>" +
    '<div class="promptbox glass"><div class="prompt">' + e(q.prompt) + "</div>" + (q.code ? '<pre class="code" style="margin-top:1.4vh">' + e(q.code) + "</pre>" : "") + "</div>" +
    '<div class="opts">' + q.options.map((o, i) => '<div class="opt' + (reveal ? (i === q.answer ? " yes" : " no") : "") + '" style="--o:' + OCOL[i] + '">' + (reveal ? '<i style="width:' + Math.round(100 * L.dist[i] / total) + '%"></i>' : "") + "<b>" + SH[i] + "</b><span>" + e(o) + "</span>" + (reveal ? "<em>" + (i === q.answer ? "✓ " : "") + L.dist[i] + "</em>" : "") + "</div>").join("") + "</div>" +
    (reveal ? banner : '<div class="ansbar"><span>✍️ ' + S.answered + "/" + alive.length + T(" ont répondu", " answered") + '</span><div class="pbar"><i style="width:' + Math.round(100 * S.answered / (alive.length || 1)) + '%"></i></div></div>') +
    (S.mode !== "solo" ? squadArena(reveal) : reveal ? "" : '<div class="alive">' + players(alive) + "</div>") + "</div>";
}
// every player knocked out by this question: one card each, slammed in then struck down (the TV's sound with each)
function showDeaths(outs, then) {
  if (!outs.length) { if (then) then(); return; }
  const shown = outs.slice(0, 24), step = Math.min(.35, 3 / shown.length);
  const d = document.createElement("div"); d.className = "deaths";
  d.innerHTML = "<h1>💀 " + outs.length + " " + (outs.length > 1 ? T("ÉLIMINÉS", "KNOCKED OUT") : T("ÉLIMINÉ", "KNOCKED OUT")) + "</h1><div class=\\"dgrid\\">" + shown.map((p, i) => '<div class="dcard" style="--c:' + (p.squad >= 0 && S.mode !== "solo" ? sq(p.squad).color : "#ef4444") + ";--d:" + (0.3 + i * step).toFixed(2) + 's"><div class="dav">' + e(initials(p.name)) + "</div><b>" + e(p.name) + "</b>" + (p.squad >= 0 && S.mode !== "solo" ? "<small>" + e(sq(p.squad).emoji + " " + sq(p.squad).name) + "</small>" : "<small>" + p.score + " ✓</small>") + "</div>").join("") + (outs.length > shown.length ? '<div class="dcard" style="--c:#475569;--d:' + (0.3 + shown.length * step).toFixed(2) + 's"><div class="dav">+' + (outs.length - shown.length) + "</div><b>" + T("et d'autres", "and more") + "</b></div>" : "") + "</div>";
  document.body.append(d);
  shown.forEach((_, i) => setTimeout(() => { beep(220 - Math.min(i, 8) * 12, .22, "square"); }, (0.3 + i * step) * 1000 + 550));
  const total = (0.3 + shown.length * step) * 1000 + 1500;
  let done = false;
  const end = () => { if (done) return; done = true; d.style.transition = "opacity .35s"; d.style.opacity = "0"; setTimeout(() => { d.remove(); if (then) then(); }, 350); };
  d.onclick = end; setTimeout(end, total);
}
// a squad whose last members just fell: the whole screen tells it
function showWipes(list) {
  const i = list.shift(); if (i == null) return;
  const s = sq(i), mem = S.players.filter((p) => p.squad === i);
  const d = document.createElement("div"); d.className = "wipe"; d.style.setProperty("--c", s.color);
  d.innerHTML = '<div class="flash"></div><div class="we">' + e(s.emoji) + '</div><div class="wt">' + T("SQUAD ÉLIMINÉ", "SQUAD WIPED OUT") + '</div><div class="wn">' + e(s.name) + '</div><div class="wm">' + mem.map((p) => "<span>💀 " + e(p.name) + "</span>").join("") + "</div>";
  document.body.append(d);
  for (let k = 0; k < 40; k++) {
    const sh = document.createElement("i"); sh.className = "shard";
    const a = Math.random() * Math.PI * 2, r = 25 + Math.random() * 45;
    sh.style.setProperty("--c", k % 3 ? s.color : "#fff"); sh.style.setProperty("--dx", Math.cos(a) * r + "vw"); sh.style.setProperty("--dy", Math.sin(a) * r + "vh"); sh.style.setProperty("--r", (Math.random() * 720 - 360) + "deg");
    sh.style.animationDelay = (.15 + Math.random() * .25) + "s"; document.body.append(sh); setTimeout(() => sh.remove(), 2200);
  }
  [330, 262, 196, 147, 98].forEach((f, k) => setTimeout(() => beep(f, .4, "sawtooth"), k * 130));
  const end = () => { if (!d.isConnected) return; d.style.transition = "opacity .4s"; d.style.opacity = "0"; setTimeout(() => { d.remove(); showWipes(list); }, 400); };
  d.onclick = end; setTimeout(end, 3400);
}
function confetti() {
  const c = document.createElement("canvas"); c.id = "conf"; c.width = innerWidth; c.height = innerHeight; document.body.append(c);
  const x = c.getContext("2d"), cols = ["#f59e0b", "#8b5cf6", "#06b6d4", "#22c55e", "#ef4444", "#ec4899", "#ffffff"];
  const P = Array.from({ length: 240 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .7, w: 6 + Math.random() * 9, h: 8 + Math.random() * 12, vx: -2 + Math.random() * 4, vy: 2 + Math.random() * 4, r: Math.random() * 6, vr: -.2 + Math.random() * .4, c: cols[Math.floor(Math.random() * cols.length)] }));
  const t0 = Date.now();
  (function f() { x.clearRect(0, 0, c.width, c.height); for (const p of P) { p.x += p.vx; p.y += p.vy; p.vy += .03; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore(); } if (Date.now() - t0 < 6500) requestAnimationFrame(f); else c.remove(); })();
}
function goFlash() {
  const d = document.createElement("div"); d.className = "go"; d.textContent = S.step === 1 ? T("GO !", "GO!") : "⚡"; document.body.append(d); setTimeout(() => d.remove(), 900);
  beep(880, .3, "square");
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
// anti-cheat on the TV: who is stopped (left full screen, the tab, the window) with "Let back in"; a copy or paste
// attempt shows a moment, then goes; never more than three at once, so the screen stays clear
let alertSeen = null;
const CHEAT = { fullscreen: ["🚪", T("a quitté le plein écran", "left full screen")], hidden: ["🚪", T("a changé d'onglet", "switched tab")], blur: ["🚪", T("a changé de fenêtre", "switched window")],
  copy: ["📋", T("a essayé de copier", "tried to copy")], cut: ["📋", T("a essayé de couper", "tried to cut")], paste: ["📋", T("a essayé de coller", "tried to paste")], drop: ["📋", T("a essayé de glisser du texte", "tried to drop text")],
  back: ["✅", T("est de retour", "is back")] };
function relayAlerts() {
  const box = $("#alerts");
  if (!box) return;   // the slot between the squads and the challenge (Code Relay, while playing)
  if (S.kind !== "relay" || S.phase !== "playing") { box.innerHTML = ""; return; }
  const nameOf = (pid) => (S.players.find((p) => p.pid === pid) || { name: "?" }).name;
  const locks = [];
  for (const t of S.teams || []) for (const [pid, why] of Object.entries(t.locks || {})) locks.push({ pid, why, squad: t.squad });
  const html = locks.length ? '<div class="alk"><div class="alk-h">🔒 ' + T("Session arrêtée", "Stopped") + " · " + locks.length + "</div>" + locks.slice(0, 3).map((l) => { const s = sq(l.squad), c = CHEAT[l.why] || CHEAT.fullscreen;
    return '<div class="alk-r" style="--c:' + s.color + '"><span class="alk-av">' + e(initials(nameOf(l.pid))) + '</span><div><b>' + e(nameOf(l.pid)) + "</b><span>" + c[0] + " " + e(c[1]) + '</span></div><button class="btn" data-letin="' + e(l.pid) + '">' + T("Laisser revenir", "Let back in") + "</button></div>"; }).join("") + (locks.length > 3 ? '<div class="alk-more">+' + (locks.length - 3) + "</div>" : "") + "</div>" : "";
  if (box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html; }
  // the moments: copy / paste attempts, and who is back
  const all = [];
  for (const t of S.teams || []) for (const a of t.alerts || []) all.push({ ...a, squad: t.squad });
  const fresh = alertSeen === null ? [] : all.filter((a) => !alertSeen.has(a.pid + a.what + a.at) && (CHEAT[a.what] && (a.what === "back" || /copy|cut|paste|drop/.test(a.what))));
  alertSeen = new Set(all.map((a) => a.pid + a.what + a.at));
  for (const a of fresh.slice(-3)) {
    const c = CHEAT[a.what], s = sq(a.squad), d = document.createElement("div");
    d.className = "alt" + (a.what === "back" ? " ok" : ""); d.style.setProperty("--c", s.color);
    d.innerHTML = "<span>" + c[0] + "</span><b>" + e(a.name || nameOf(a.pid)) + "</b> " + e(c[1]) + ' <i>' + e(s.emoji + " " + s.name) + "</i>";
    const st = $("#alts"); st.append(d); while (st.children.length > 3) st.firstChild.remove();
    setTimeout(() => { d.classList.add("bye"); setTimeout(() => d.remove(), 500); }, 6000);
  }
}
let tested = false, noiseSeen = {};
function relayView() {
  $("#info").innerHTML = S.phase === "playing" ? '<span class="clock" id="clk"></span>' : "";
  if (S.phase === "lobby") return lobby();
  if (S.phase === "testing") { if (!tested) runAll(); return winScreen("🧪 " + T("Les tests tournent…", "Running the tests…"), T("On vérifie le code de chaque squad.", "Checking every squad's code."), ""); }
  if (S.phase === "over") {
    const w = S.winSquad != null ? sq(S.winSquad) : null;
    const rk = S.ranking || [];
    const aj = S.aiJudge;
    return '<div><h1 class="big">' + (w ? "🏆 " + e(w.emoji + " " + w.name) : T("Fin du relais", "Relay over")) + "</h1>" + (aj ? '<p class="aij">🤖 ' + T("Aucun squad n'a réussi de test : l'IA a départagé, le code le plus proche de la solution gagne.", "No squad passed a test: the AI decided, the code closest to a solution wins.") + "</p>" : "") + '<div class="res">' + rk.map((i, k) => { const t = S.teams.find((x) => x.squad === i); const r = S.results && S.results[i] || { passed: 0, total: S.task.tests }; const s = sq(i);
      return '<div class="resrow"><span style="color:' + s.color + '">' + (k + 1) + ". " + e(s.emoji + " " + s.name) + '</span><div class="pbar"><i style="width:' + (r.total ? Math.round(100 * r.passed / r.total) : 0) + '%"></i></div><span>' + (t.out ? "🔇 " + T("éliminé", "out") : r.passed + "/" + r.total + " ✓") + "</span></div>" + (aj && aj.why[i] ? '<div class="aiw">🤖 ' + e(aj.why[i]) + "</div>" : ""); }).join("") + "</div>" +
      (w ? '<h2 style="margin-top:2vh">' + T("Le code gagnant", "The winning code") + '</h2><pre class="code fullcode">' + e((S.teams.find((x) => x.squad === S.winSquad) || {}).code || "") + "</pre>" : "") + "</div>";
  }
  return '<div class="rgrid">' + S.teams.map((t) => {
    const s = sq(t.squad); const w = S.players.find((p) => p.pid === t.writer);
    const pl = (pid) => S.players.find((p) => p.pid === pid) || { name: "?" };
    const pct = Math.max(0, Math.min(100, 100 * (nowMs() - t.turnStart) / (t.turnEnd - t.turnStart)));
    const pp = []; for (let i = 0; i < S.strikesMax; i++) pp.push('<i class="' + (i < t.strikes ? "on" : "") + '">' + (i < t.strikes ? "✖" : "") + "</i>");
    const ln = t.lastNoise, hit = noiseSeen[t.squad];
    const stamp = hit ? '<div class="stamp' + (t.out ? " ko" : "") + '"><b>' + (t.out ? "🔇 " + T("ÉLIMINÉS", "OUT") : "✖ " + T("AVERTISSEMENT", "STRIKE") + " " + t.strikes + "/" + S.strikesMax) + "</b>" + (ln ? "<span>" + (ln.why === "teacher" ? "👩‍🏫 " + T("du formateur", "from the teacher") : e(ln.name) + (ln.why === "muted" ? T(" : micro coupé", ": mic muted") : T(" a parlé", " talked"))) + "</span>" : "") + "</div>" : "";
    return '<div class="rcard' + (t.out ? " out" : "") + (hit ? " noise" : "") + '" style="--c:' + s.color + '">' + stamp + '<div class="rhead"><h3>' + e(s.emoji + " " + s.name) + "</h3>" + '<span class="sbtn"><button class="spips" data-pardon="' + t.squad + '" title="' + T("Cliquer pour annuler un avertissement", "Click to cancel a strike") + '">' + pp.join("") + "</button>" + (t.out ? "" : '<button class="sadd" data-strike="' + t.squad + '" title="' + T("Donner un avertissement (il parle, il triche…)", "Give a strike (talking, cheating…)") + '">＋</button>') + "</span>" + "</div>" +
      (t.out ? '<div class="writer">🔇 ' + (S.noise ? T("Éliminés (bruit)", "Out (noise)") : T("Éliminés", "Out")) + "</div>" : '<div class="wrow"><span class="wav">' + e(initials(w ? w.name : "?")) + '</span><div><div class="muted" style="font-size:.95vw">' + T("Au clavier", "At the keyboard") + '</div><div class="writer">' + e(w ? w.name : "…") + ' <span class="typing"><i></i><i></i><i></i></span></div></div></div><div class="tbar"><i data-bar="' + t.squad + '" style="width:' + pct + '%"></i></div><div class="muted" style="font-size:1vw">' + T("Tour ", "Turn ") + (t.turn + 1) + " · " + T("manche ", "round ") + t.round + "/" + S.rounds + " · " + t.lines + T(" lignes", " lines") + "</div>") +
      '<div class="order">' + t.order.map((pid, i) => { const p = pl(pid); return (i ? '<em>›</em>' : "") + "<span" + (pid === t.writer ? ' class="on"' : "") + ">" + ((t.locks || {})[pid] ? '<b class="moff" title="' + T("session arrêtée", "stopped") + '">🔒</b>' : "") + (S.noise && p.mic !== 1 ? '<b class="moff" title="' + (p.mic === 2 ? T("micro coupé", "mic muted") : T("micro pas activé", "mic not on")) + '">🔇</b>' : "") + e(p.name) + "</span>"; }).join("") + "</div></div>";
  }).join("") + '</div><div id="alerts"></div><div class="rtask glass"><div class="rtt">🎯 ' + e(S.task.title) + ' <span class="chip">' + e(S.langName || "JavaScript") + '</span></div><p>' + e(S.task.text) + '</p><div class="rrules">🤫 ' + T("Silence total", "Total silence") + " · ✖ " + S.strikesMax + T(" avertissements = éliminés", " strikes = out") + " · 🧪 " + S.task.tests + T(" tests à la fin", " tests at the end") + "</div></div>";
}
async function runAll() {
  tested = true;
  if (S.codeLang && S.codeLang !== "javascript") { await act("runtests"); if (S.phase === "testing") tested = false; return; }
  try {
    const d = await (await fetch(BASE + "/codes", { headers: HH })).json();
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
  if (S.phase === "lobby") b.push('<button class="btn" data-act="announce" title="' + T("Publie le bouton 🎮 Rejoindre dans #arena", "Posts the 🎮 Join button in #arena") + '">📣 ' + T("Bouton dans Discord", "Button in Discord") + "</button>");
  if (S.kind === "royale" && S.phase === "question" && !pre) b.push('<button class="btn" data-act="reveal">👁 ' + T("Révéler", "Reveal") + "</button>");
  if (S.kind === "royale" && S.phase === "reveal") {
    if (S.nextAt || S.paused) b.push('<span class="pill" id="nxt"></span><button class="btn" data-act="hold">' + (S.paused ? "▶ " + T("Reprendre", "Resume") : "⏸ " + T("Pause", "Pause")) + "</button>");
    b.push('<button class="btn primary" data-act="next">' + (S.last && S.last.final ? "🏆 " + T("Résultat", "Result") : "▶ " + T("Question suivante", "Next question")) + " <span class=muted>(␣)</span></button>");
  }
  if (!["lobby", "over"].includes(S.phase)) b.push('<button class="btn danger" data-act="stop">⏹ ' + T("Terminer", "End") + "</button>");
  if (S.kind === "relay" && S.phase === "testing") b.push('<button class="btn" id="rerun">🧪 ' + T("Relancer les tests", "Run the tests again") + "</button>");
  if (S.phase === "over") b.push('<button class="btn" data-act="reset">🔁 ' + T("Rejouer", "Play again") + "</button>");
  b.push('<button class="btn" data-panel="1">👥 ' + S.players.length + (S.banned && S.banned.length ? " · 🚫" + S.banned.length : "") + "</button>");
  b.push('<button class="btn" id="fs">⛶</button>');
  $("#bar").innerHTML = b.join("");
}
function render() {
  $("#kind").textContent = S.kind === "royale" ? "Battle Royale" : S.kind === "sql" ? T("Détective SQL", "SQL Detective") : T("Relais de code", "Code Relay");
  pre = S.kind === "royale" && S.phase === "question" && nowMs() < S.qAt;
  const key = S.seq + "." + S.phase + "." + (S.answered || 0) + "." + (pre ? "cd" : "") + "." + JSON.stringify(S.teams ? S.teams.map((t) => [t.writer, t.strikes, t.lines, t.step, t.locks]) : 0) + "." + JSON.stringify(S.players.map((p) => [p.pid, p.alive, p.mic])) + "." + (S.banned || []).length;
  // sounds and animations on what just happened
  if (S.kind === "royale" && (S.step !== shownStep || S.phase !== shownPhase)) {
    if (S.phase === "question" && !pre) beep(660, .15);
    if (S.phase === "reveal") {
      beep(S.last && S.last.out.length ? 196 : 880, .4, "triangle");
      if (S.last && wipedShown !== S.step) { wipedShown = S.step; const outs = S.players.filter((p) => S.last.out.includes(p.pid)), wiped = (S.last.wiped || []).slice(); setTimeout(() => showDeaths(outs, () => showWipes(wiped)), 600); }
    }
    if (S.phase === "over") { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, .25), i * 140)); confetti(); }
    shownStep = S.step; shownPhase = S.phase;
  }
  if (S.kind === "relay" && S.teams) for (const t of S.teams) { const at = t.lastNoise ? t.lastNoise.at : 0; if (noiseSeen["n" + t.squad] !== at) { const first = noiseSeen["n" + t.squad] === undefined; noiseSeen["n" + t.squad] = at; if (!first) { noiseSeen[t.squad] = 1; lastKey = ""; setTimeout(() => { noiseSeen[t.squad] = 0; lastKey = ""; render(); }, 2600); } } }
  if (key !== lastKey) { lastKey = key; $("#app").innerHTML = S.kind === "royale" ? royale() : S.kind === "sql" ? sqlView() : relayView(); controls(); if (panel || manage) drawPanel(); }
  relayAlerts();
}
document.addEventListener("click", (ev) => {
  const a = ev.target.closest("[data-act]"); if (a) { if (a.dataset.act === "reset" && !confirm(T("Rejouer avec les mêmes joueurs ?", "Play again with the same players?"))) return; act(a.dataset.act).then(() => { if (a.dataset.act === "announce") toast(T("Bouton 🎮 publié dans Discord", "🎮 button posted in Discord")); }); return; }
  const k = ev.target.closest("[data-kick]"); if (k) { manage = ""; act("kick", { pid: k.dataset.kick }).then(drawPanel); return; }
  const u = ev.target.closest("[data-unban]"); if (u) { act("unban", { pid: u.dataset.unban }).then(drawPanel); return; }
  const w = ev.target.closest("[data-who]"); if (w) { manage = w.dataset.who; drawPanel(); return; }
  if (ev.target.closest("[data-panel]")) { panel = true; manage = ""; drawPanel(); return; }
  if (ev.target.matches("[data-close]")) { panel = false; manage = ""; drawPanel(); return; }
  const p = ev.target.closest("[data-pardon]"); if (p) { act("pardon", { squad: Number(p.dataset.pardon) }); return; }
  const sk = ev.target.closest("[data-strike]"); if (sk) { act("strike", { squad: Number(sk.dataset.strike) }); return; }
  const li = ev.target.closest("[data-letin]"); if (li) { li.disabled = true; act("letin", { pid: li.dataset.letin }); return; }
  if (ev.target.closest("#rerun")) { tested = false; runAll(); return; }
  if (ev.target.closest("#fs")) { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
});
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && (panel || manage)) { panel = false; manage = ""; drawPanel(); return; } if (ev.key === " " && S && S.kind === "royale" && S.phase === "reveal" && !panel && !manage) { ev.preventDefault(); act("next"); } });
// the clocks between two polls
setInterval(() => {
  if (!S) return;
  if (S.kind === "royale" && S.phase === "question" && nowMs() < S.qAt) {
    // the countdown: a big number each second
    const n = Math.max(1, Math.ceil((S.qAt - nowMs()) / 1000)), el = $("#cdn");
    if (!el) { lastKey = ""; render(); }
    else if (el.textContent !== String(n)) { el.textContent = n; el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick"); beep(520, .12); }
    window.__cd = n === 1 ? 2 : 1;
  } else if (window.__cd) { window.__cd = 0; lastKey = ""; render(); if (S.kind === "royale" && S.phase === "question") goFlash(); }
  if (S.kind === "royale" && S.phase === "question" && nowMs() >= S.qAt) {
    const left = S.qEnd - nowMs();
    const rt = $("#rt"), fg = $("#rfg"), ring = $("#ring"); if (rt) rt.textContent = Math.max(0, Math.ceil(left / 1000)); if (fg) fg.setAttribute("stroke-dashoffset", 276.46 * (1 - Math.max(0, left) / (S.seconds * 1000)));
    if (ring) { ring.style.setProperty("--rc", ringColor(left)); ring.classList.toggle("hurry", left < 5000); }
    const alive = S.players.filter((p) => p.alive).length;
    if ((left <= -300 || (alive && S.answered >= alive && nowMs() > S.qAt)) && !busy && Date.now() - (window.__rv || 0) > 1500) { window.__rv = Date.now(); act("reveal"); }
    else if (left > 0 && left < 5200 && Math.ceil(left / 1000) !== window.__tick) { window.__tick = Math.ceil(left / 1000); beep(440, .06); }
  }
  const nxt = $("#nxt");
  if (nxt && S.kind === "royale" && S.phase === "reveal") nxt.textContent = S.paused ? "⏸ " + T("En pause", "Paused") : S.nextAt ? (S.last && S.last.final ? "🏆 " + T("Résultats dans ", "Results in ") : "⏭ " + T("Suivante dans ", "Next in ")) + Math.max(0, Math.ceil((S.nextAt - nowMs()) / 1000)) + " s" : "";
  const clk = $("#clk");
  if (clk && S.kind === "sql") clk.textContent = "⏱ " + mmss(nowMs() - S.startAt);
  if (clk && S.kind === "relay" && S.endAt) clk.textContent = "⏱ " + mmss(S.endAt - nowMs());
  if (S.kind === "relay" && S.phase === "playing") for (const t of S.teams) { const i = document.querySelector('[data-bar="' + t.squad + '"]'); if (i) i.style.width = Math.max(0, Math.min(100, 100 * (nowMs() - t.turnStart) / (t.turnEnd - t.turnStart))) + "%"; if (nowMs() > t.turnEnd + 400) { lastKey = ""; } }
}, 250);
poll();
</script></body></html>`;

// =================================================================== a student's screen
const RELAY_CSS = `/* ---- 🏃 relay */
#app{transition:none;will-change:transform}
#vig{position:fixed;inset:0;pointer-events:none;z-index:40;opacity:0;background:radial-gradient(ellipse at center,transparent 45%,rgba(239,68,68,.55) 80%,rgba(127,29,29,.9));box-shadow:inset 0 0 120px rgba(239,68,68,.8)}
#shh{position:fixed;left:50%;top:50%;z-index:41;pointer-events:none;font-size:46px;font-weight:900;letter-spacing:.06em;color:#fff;text-shadow:0 0 30px #ef4444,3px 0 #ef4444,-3px 0 #06b6d4;opacity:0;transition:opacity .15s;white-space:nowrap}
#shh.on{opacity:1}
.small{font-size:13px}
.hud{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:12px}
.hc{background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.03));border:1px solid var(--line);border-radius:16px;padding:9px 14px;display:flex;flex-direction:column;gap:4px;min-height:62px;justify-content:center}
.hl{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--soft);font-weight:800}
.hc b{font-size:22px;font-variant-numeric:tabular-nums}
.pips{display:inline-flex;gap:6px}.pips i{width:22px;height:22px;border-radius:7px;border:2px solid rgba(239,68,68,.45);display:grid;place-items:center;font-style:normal;font-size:12px;font-weight:900;color:#fff}
.pips i.on{background:linear-gradient(135deg,#ef4444,#b91c1c);border-color:#fca5a5;box-shadow:0 0 12px rgba(239,68,68,.7)}
.pips i.new{animation:pipin .7s cubic-bezier(.2,1.8,.4,1)}
@keyframes pipin{0%{transform:scale(3) rotate(-30deg);opacity:0}100%{transform:none;opacity:1}}
.micp{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:5px 12px;font-weight:800;font-size:13px;color:#fff;width:fit-content}
.micp.ok{background:rgba(34,197,94,.16);border:1px solid rgba(34,197,94,.45)}
.micp.bad{background:rgba(239,68,68,.25);border:1px solid rgba(239,68,68,.6);animation:pulse 1.2s infinite}
.vu{display:inline-block;width:70px;height:8px;border-radius:9px;background:rgba(255,255,255,.12);overflow:hidden;vertical-align:middle}
.vu.big{display:block;width:100%;height:14px;margin:8px 0 4px}
.vu i{display:block;height:100%;width:3%;border-radius:9px;background:linear-gradient(90deg,#22c55e,#84cc16);transition:width .08s}
.vu i.hot{background:linear-gradient(90deg,#f59e0b,#ef4444)}
.mwarn{position:sticky;top:52px;z-index:6;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:10px 14px;margin-bottom:10px;border-radius:14px;background:linear-gradient(90deg,rgba(239,68,68,.35),rgba(245,158,11,.3));border:1px solid rgba(239,68,68,.7);font-weight:800;animation:pulse 1.4s infinite}
.mwarn .btn{padding:6px 14px}
.rhero{text-align:center;padding:22px 18px;background:radial-gradient(120% 90% at 50% 0%,rgba(139,92,246,.28),rgba(255,255,255,.03))}
.rhero h2{font-size:26px;margin:8px 0 14px}
.lane{position:relative;height:64px;margin:0 auto;max-width:460px;border-bottom:3px dashed rgba(255,255,255,.18);overflow:hidden}
.runner{position:absolute;bottom:2px;font-size:46px;animation:runx 3.2s linear infinite}
@keyframes runx{0%{left:-60px}100%{left:100%}}
.rules{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:16px}
.rules div{display:flex;gap:8px;align-items:center;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid var(--line);font-weight:700;font-size:14px}
.rules i{font-style:normal}
.mtest{display:flex;gap:16px;align-items:center;text-align:left;padding:14px 16px;border-radius:18px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.45);max-width:560px;margin:0 auto}
.mtest.ok{background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.45)}
.mtest p{margin:4px 0 8px}
.calib{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.12);font-size:13px}.calib .ok{color:#86efac}.calib .btn{margin-left:6px;padding:5px 12px;font-size:13px}
.calib.on{animation:calp 1.2s ease-in-out infinite}.calib .say{font-size:17px;font-weight:700;margin:6px 0 0;color:#fff}@keyframes calp{50%{opacity:.6}}
.mic-ic{width:64px;height:64px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:30px;background:rgba(255,255,255,.08)}
.mic-ic.pulse{animation:pulseb 1.4s infinite}
.tcard .th{display:flex;justify-content:space-between;gap:10px;align-items:center}
.tcard p{margin:8px 0;line-height:1.55}
.lang{font-size:12px;font-weight:800;padding:4px 10px;border-radius:999px;background:rgba(245,158,11,.18);border:1px solid rgba(245,158,11,.5);color:#fde68a}
.ex{display:flex;flex-wrap:wrap;gap:6px}.ex code{font:600 13px "JetBrains Mono",Consolas,monospace;padding:5px 10px;border-radius:10px;background:#0b1224;border:1px solid var(--line)}.ex code i{color:#a78bfa;font-style:normal}
.tcard.compact{padding:12px 16px}.tcard.compact p{font-size:14px;margin:6px 0}
.wait{text-align:center;padding:22px 18px}
.shh-ic{font-size:64px;animation:bob 2.6s ease-in-out infinite}
.wwho h2{font-size:30px;margin:2px 0 10px}
.wnext{font-size:16px;margin:12px 0 6px;color:var(--soft)}.wnext b{font-size:30px;color:#fff;font-variant-numeric:tabular-nums;display:block;margin-top:2px}
.tbar{height:10px;border-radius:9px;background:rgba(255,255,255,.1);overflow:hidden;margin:6px 0 12px}.tbar i{display:block;height:100%;width:0;border-radius:9px;background:linear-gradient(90deg,#22c55e,#06b6d4);transition:width .25s linear}
.tbar i.mid{background:linear-gradient(90deg,#f59e0b,#f97316)}.tbar i.end{background:linear-gradient(90deg,#ef4444,#f43f5e);animation:pulse .6s infinite}
.track{position:relative;display:flex;justify-content:space-around;gap:6px;margin:22px 0 4px;padding:0 6px}
.track .tl{position:absolute;left:10%;right:10%;top:27px;height:4px;border-radius:4px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.22) 0 12px,transparent 12px 22px)}
.node{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:70px}
.node .av{position:relative;width:56px;height:56px;border-radius:50%;display:grid;place-items:center;font-weight:900;background:#151c33;border:3px solid rgba(255,255,255,.18)}
.node.me .av{border-color:#a78bfa}
.node.w .av{background:linear-gradient(135deg,#8b5cf6,#06b6d4);border-color:#fff;box-shadow:0 0 0 6px rgba(139,92,246,.25),0 0 26px rgba(6,182,212,.6);animation:pop .5s}
.node .run{position:absolute;top:-18px;right:-12px;font-size:24px;animation:bob 1s ease-in-out infinite}
.node .mst{position:absolute;bottom:-6px;right:-8px;font-size:14px;background:#7f1d1d;border-radius:50%;width:24px;height:24px;display:grid;place-items:center;border:2px solid #ef4444}
.node .nm{font-size:13px;font-weight:700;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.node .ix{font-size:11px;color:var(--soft)}
.wtop{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:4px}
.wtop h2{font-size:26px;margin:0;background:linear-gradient(90deg,#c4b5fd,#67e8f9);-webkit-background-clip:text;background-clip:text;color:transparent}
.wtop p{margin:4px 0 0}
.tbox{display:flex;flex-direction:column;align-items:flex-end}.tbox b{font-size:40px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1}
.tbox b.end{color:#f87171;animation:pulse .6s infinite}
.ide{border-radius:18px;overflow:hidden;border:1px solid rgba(139,92,246,.35);background:#0a0f1f;box-shadow:0 18px 50px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.03);margin-bottom:12px;transition:box-shadow .2s,border-color .2s}
.ide.loud{border-color:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.5),0 0 40px rgba(239,68,68,.45)}
.tabs{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:0 12px 0 0;background:#0f1630;border-bottom:1px solid var(--line);font-size:13px}
.tab{display:inline-flex;gap:8px;align-items:center;padding:10px 16px;background:#0a0f1f;border-right:1px solid var(--line);font:700 13px "JetBrains Mono",Consolas,monospace;border-top:2px solid #8b5cf6}
.ld{width:9px;height:9px;border-radius:50%;background:#f59e0b;box-shadow:0 0 8px #f59e0b}
.ed{position:relative;display:flex;min-height:360px}
.gut{margin:0;padding:12px 10px 12px 14px;min-width:46px;text-align:right;color:#4b5a82;font:600 15px/1.5 "JetBrains Mono","Fira Code",Consolas,monospace;background:#0a0f1f;border-right:1px solid rgba(255,255,255,.06);overflow:hidden;user-select:none;max-height:520px}
.ed textarea.js{flex:1;border:0;border-radius:0;background:transparent;min-height:360px;max-height:520px;resize:none;white-space:pre;overflow:auto;outline:none;padding:12px 14px;color:#e2e8f0;caret-color:#a78bfa}
.ed textarea.js:read-only{opacity:.5}
.gate{position:absolute;inset:0;display:none;flex-direction:column;gap:6px;align-items:center;justify-content:center;text-align:center;background:rgba(7,11,24,.88);backdrop-filter:blur(3px);z-index:2;padding:20px}
.gate.on{display:flex}.gate div{font-size:54px;animation:pulseb 1.4s infinite;border-radius:50%}.gate b{font-size:20px}
.shout{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;padding:14px 20px;border-radius:14px;background:rgba(127,29,29,.92);border:2px solid #ef4444;font-weight:900;font-size:18px;z-index:3;white-space:nowrap}
.ide.loud .shout{display:block}
.ifoot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;border-top:1px solid var(--line);background:#0f1630}
.ide #tout{padding:0 12px 12px}
.ide pre.fin{border:0;border-radius:0;max-height:420px}
.bigc{text-align:center;padding:26px 18px}
.bigc h2{font-size:28px}
.bigc.won{border-color:rgba(245,158,11,.6);background:radial-gradient(120% 90% at 50% 0%,rgba(245,158,11,.25),rgba(255,255,255,.03))}
.trophy,.flask{font-size:84px;display:inline-block;animation:bob 2.4s ease-in-out infinite}
.flask{animation:wob 1.2s ease-in-out infinite}@keyframes wob{25%{transform:rotate(-12deg)}75%{transform:rotate(12deg)}}
.score{display:flex;gap:18px;align-items:center;justify-content:center;margin-top:10px;font-weight:700;color:var(--soft)}
.pring{--p:0;width:96px;height:96px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#22c55e calc(var(--p)*1%),rgba(255,255,255,.1) 0)}
.pring span{width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:#0b1224;color:#fff;font-size:22px;font-weight:900}
.rank{font-size:34px;color:#fde68a}
.outc{border-color:rgba(239,68,68,.5);background:radial-gradient(120% 90% at 50% 0%,rgba(239,68,68,.22),rgba(255,255,255,.03));filter:saturate(.7)}
.outc .pips{margin:8px 0}
/* the big moments */
.fx{position:fixed;inset:0;z-index:60;display:grid;place-items:center;align-content:center;gap:8px;text-align:center;padding:20px;transition:opacity .45s}
.fx.bye{opacity:0}
.fx p{margin:4px 0 0;font-size:17px;color:#fee2e2;font-weight:700}
.strk{background:radial-gradient(circle,rgba(239,68,68,.55),rgba(69,10,10,.96) 70%);animation:flashr .5s,shake .45s 2}
@keyframes flashr{0%{background:#fff}}
.strk .sx{font-size:150px;line-height:1;font-weight:900;color:#fff;text-shadow:0 0 40px #ef4444;animation:stampp .55s cubic-bezier(.2,1.6,.4,1)}
.strk .sl{font-size:34px;font-weight:900;letter-spacing:.14em;color:#fecaca;animation:rise .4s .15s both}
.strk .sc{font-size:62px;font-weight:900;line-height:1;animation:pop .5s .25s both}
.strk .pips{margin:6px auto}.strk .pips i{width:34px;height:34px;font-size:18px}
.strk .last{color:#fde68a;animation:pulse .7s infinite}
.kout{background:#000;animation:koin .3s}
@keyframes koin{0%{background:#fff}}
.kout .ko{font-size:120px;animation:stampp .6s cubic-bezier(.2,1.6,.4,1),dsk 1.6s .6s ease-in-out infinite}
.kout .kt{position:relative;font-size:56px;font-weight:900;letter-spacing:.12em;color:#fff;animation:glitch .35s steps(2) infinite}
.kout .kt::before,.kout .kt::after{content:attr(data-t);position:absolute;inset:0}
.kout .kt::before{color:#ef4444;transform:translate(4px,0);mix-blend-mode:screen;clip-path:inset(0 0 55% 0)}
.kout .kt::after{color:#06b6d4;transform:translate(-4px,0);mix-blend-mode:screen;clip-path:inset(45% 0 0 0)}
@keyframes glitch{50%{transform:translate(2px,-1px) skewX(-6deg)}}
.crack{position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 48.6%,rgba(255,255,255,.55) 49.6%,transparent 50.4%),linear-gradient(35deg,transparent 47.8%,rgba(255,255,255,.4) 48.4%,transparent 49%),linear-gradient(160deg,transparent 52%,rgba(255,255,255,.35) 52.5%,transparent 53%);animation:koin .2s}
.baton{background:radial-gradient(circle,rgba(139,92,246,.75),rgba(7,11,24,.96) 70%)}
.baton .br{font-size:110px;animation:dash .9s cubic-bezier(.2,.9,.3,1)}
@keyframes dash{0%{transform:translateX(-70vw) scale(.6)}100%{transform:none}}
.baton .bt{font-size:58px;font-weight:900;letter-spacing:.06em;background:linear-gradient(90deg,#c4b5fd,#67e8f9);-webkit-background-clip:text;background-clip:text;color:transparent;animation:pop .5s .2s both}
.lockc{border-color:rgba(245,158,11,.6);background:radial-gradient(120% 90% at 50% 0%,rgba(245,158,11,.22),rgba(255,255,255,.03))}
.fsc{background:radial-gradient(120% 90% at 50% 0%,rgba(139,92,246,.25),rgba(255,255,255,.03))}.btn.big{font-size:18px;padding:15px 26px;margin-top:6px}
.ptoast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:70;padding:12px 18px;border-radius:14px;background:#7f1d1d;border:1px solid #ef4444;font-weight:800;box-shadow:0 10px 30px rgba(0,0,0,.5);animation:rise .3s}
@media(max-width:600px){.hc b{font-size:18px}.tbox b{font-size:30px}.strk .sx{font-size:110px}.kout .kt{font-size:38px}.baton .bt{font-size:40px}#shh{font-size:30px}}
`;
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
@keyframes pulse{50%{opacity:.45}}
@keyframes rise{from{transform:translateY(16px);opacity:0}}
@keyframes cdpop{0%{transform:scale(1.8);opacity:0}25%{transform:scale(.95);opacity:1}100%{transform:scale(1)}}
body::before{content:"";position:fixed;inset:-20%;z-index:-1;pointer-events:none;background:radial-gradient(40% 30% at 20% 10%,rgba(124,58,237,.35),transparent),radial-gradient(40% 30% at 80% 90%,rgba(8,145,178,.3),transparent);animation:drift 16s ease-in-out infinite alternate}
@keyframes drift{to{transform:translate(4%,3%) scale(1.08)}}
header{position:sticky;top:0;z-index:5;padding:8px 0;backdrop-filter:blur(8px)}
.sqbadge{display:inline-flex;gap:6px;align-items:center;padding:5px 12px;border-radius:999px;background:color-mix(in srgb,var(--c) 28%,transparent);border:1px solid var(--c);font-weight:800;color:#fff;font-size:14px}
.hero{font-size:68px;display:inline-block;animation:bob 2.4s ease-in-out infinite;filter:drop-shadow(0 0 20px rgba(245,158,11,.5))}
.joinc .dl{width:76px;height:76px;margin:6px auto 12px;border-radius:24px;display:grid;place-items:center;background:#5865f2;font-size:40px;box-shadow:0 0 34px rgba(88,101,242,.55);animation:bob 3s ease-in-out infinite}
.steps{text-align:left;line-height:1.8;margin:12px auto;max-width:380px;padding-left:22px}
.pcd{font-size:140px;font-weight:900;line-height:1;margin:10px 0;color:#fff;text-shadow:0 0 .35em rgba(139,92,246,.9)}
.pcd.tick{animation:cdpop .9s ease-out}
.tline{height:8px;border-radius:9px;background:rgba(255,255,255,.1);overflow:hidden;margin:10px 0 2px}.tline i{display:block;height:100%;border-radius:9px;transition:width .25s linear,background .4s}
.qcard{animation:rise .35s both}
.opt{box-shadow:0 5px 0 rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.25);transition:transform .08s,box-shadow .08s,opacity .3s;animation:rise .35s both}
.opt:nth-child(2){animation-delay:.05s}.opt:nth-child(3){animation-delay:.1s}.opt:nth-child(4){animation-delay:.15s}
.opt:active:not(:disabled){transform:translateY(4px);box-shadow:0 1px 0 rgba(0,0,0,.28)}
.opt b{font-size:18px}
.opt.pick{animation:pop .4s}
.lock{display:flex;gap:10px;align-items:center;justify-content:center;color:var(--soft);font-weight:700;margin:14px 0}.lock i{width:10px;height:10px;border-radius:50%;background:var(--acc);animation:pulse 1s infinite}
.resc .big{font-size:72px}.resc.out .big{animation:shake .5s 2}.resc.ok .big{animation:pop .6s}
.resc.out{border-color:rgba(239,68,68,.5);background:linear-gradient(180deg,rgba(239,68,68,.18),rgba(255,255,255,.03))}
.resc.ok{border-color:rgba(34,197,94,.5);background:linear-gradient(180deg,rgba(34,197,94,.16),rgba(255,255,255,.03))}
.stat{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:8px}.stat span{padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.08);font-weight:700;font-size:13px}
.pwipe{position:fixed;inset:0;z-index:30;display:grid;place-items:center;align-content:center;gap:10px;text-align:center;padding:20px;background:radial-gradient(circle,color-mix(in srgb,var(--c) 45%,#000),#000 75%);animation:shake .5s 2}
.pwipe .we{font-size:110px;animation:pop .5s}.pwipe h1{margin:0;font-size:34px;letter-spacing:.05em;text-shadow:3px 0 #ef4444,-3px 0 #06b6d4}.pwipe p{color:#dbe4fb;margin:0}
canvas#conf{position:fixed;inset:0;pointer-events:none;z-index:15}
.death{border-color:rgba(239,68,68,.45);background:radial-gradient(120% 80% at 50% 0%,rgba(239,68,68,.22),rgba(255,255,255,.03))}
.dskull{font-size:78px;line-height:1;display:inline-block;animation:dsk 2.6s ease-in-out infinite;filter:drop-shadow(0 0 18px rgba(239,68,68,.6))}
@keyframes dsk{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg) translateY(-4px)}}
.death h2{font-size:26px;margin:6px 0 2px;color:#fecaca}
.dhelp{margin:14px 0 4px;font-size:15px;color:#e2e8f0}
.dpts{margin:10px auto 4px;max-width:320px;text-align:left}
.dpts .lbl{display:flex;justify-content:space-between;font-size:13px;color:var(--soft);margin-bottom:5px}
.dpts .bar{height:10px;border-radius:9px;background:rgba(255,255,255,.1);overflow:hidden}.dpts .bar i{display:block;height:100%;background:linear-gradient(90deg,#f59e0b,#22c55e);transition:width .5s}
.amates{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:10px 0}
.amates span{padding:6px 12px;border-radius:999px;background:rgba(34,197,94,.16);border:1px solid rgba(34,197,94,.45);font-weight:700;font-size:14px}
.amates span.gone{background:rgba(255,255,255,.05);border-color:var(--line);color:var(--soft);text-decoration:line-through}
.pleab{width:100%;margin-top:10px;font-size:17px;padding:16px;background:linear-gradient(90deg,#f59e0b,#ef4444);animation:pulseb 1.6s ease-in-out infinite}
.pleab:disabled{animation:none;background:rgba(255,255,255,.1);opacity:1}
@keyframes pulseb{50%{box-shadow:0 0 0 8px rgba(245,158,11,.18)}}
.plea{border-color:#f59e0b;background:linear-gradient(180deg,rgba(245,158,11,.2),rgba(255,255,255,.03));animation:pop .4s}
.plea h3{margin:0 0 6px;font-size:17px}
.nxq{text-align:center;font-weight:700;color:var(--soft);margin:0 0 10px;font-variant-numeric:tabular-nums}
.pdead{position:fixed;inset:0;z-index:29;display:grid;place-items:center;align-content:center;gap:8px;text-align:center;background:radial-gradient(circle,rgba(127,29,29,.9),#000 75%);animation:shake .45s 2}
.pdead .s{font-size:120px;animation:stampp .5s cubic-bezier(.2,1.6,.4,1)}.pdead h1{margin:0;font-size:38px;letter-spacing:.08em;color:#fecaca}
@keyframes stampp{0%{transform:scale(2.6);opacity:0}100%{transform:scale(1);opacity:1}}
${gm.kind === "relay" ? RELAY_CSS : ""}
</style></head><body>
<header><b>${esc(gm.title)}</b><span class="me" id="me"></span></header>
${gm.kind === "relay" ? `<div id="vig"></div><div id="shh">🤫 ${gm.settings.lang === "en" ? "SHH!" : "CHUT !"}</div>` : ""}
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
// the student's own pass from Discord (/play or 🎮): after # so it never reaches a server log; removed from the address bar
let PASS = ""; { const m = location.hash.match(/p=([A-Za-z0-9._-]+)/); if (m) { PASS = m[1]; try { history.replaceState(null, "", location.pathname + location.search); } catch (x) {} } }
window.addEventListener("hashchange", () => location.reload());
let S = null, off = 0, lastKey = "";
const nowMs = () => Date.now() + off;
${RUNNER}
async function call(path, body) {
  const r = await fetch(BASE + "/" + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ key: KEY }, body)) } : { headers: { "x-player-key": KEY } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const er = new Error(d.error || "Error"); er.join = d.join; throw er; }
  return d;
}
function take(d) { if (!d) return; off = d.now - Date.now(); if (d.same) return; S = d; $("#me").innerHTML = (S.squad && S.mode !== "solo" ? '<span class="sqbadge" style="--c:' + S.squad.color + '">' + e(S.squad.emoji + " " + S.squad.name) + "</span> " : "") + e(S.me.name); render(); }
async function poll() {
  let wait = KIND === "sql" ? 2500 : 1500;
  try { take(await call("state?seq=" + (S ? S.seq : 0))); }
  catch (x) {
    if (x.join) {
      if (!PASS) { linkScreen(S ? T("Ton lien a été ouvert sur un autre appareil, ou ton formateur t'a retiré.", "Your link was opened on another device, or your teacher removed you.") : ""); return; }
      const p = PASS; PASS = "";
      try { take(await call("join", { pass: p })); if (KIND === "relay") micStart(); }
      catch (y) { linkScreen(y.message); return; }
    }
  }
  if (S && S.phase === "over") wait = 5000;
  if (S && S.phase === "reveal" && S.nextAt && S.nextAt - nowMs() < 2500) wait = 900;
  setTimeout(poll, wait);
}
// ---------------------------------------------------------------- not linked yet: the way in is Discord
function linkScreen(msg) {
  $("#me").textContent = "";
  $("#app").innerHTML = '<div class="card center joinc"><div class="dl">🎮</div><h2>' + T("Rejoins depuis Discord", "Join from Discord") + '</h2><p class="muted">' + T("Pour jouer sous ton nom, ouvre ton lien personnel :", "To play under your name, open your own link:") + '</p><ol class="steps"><li>' + T("Ouvre Discord", "Open Discord") + "</li><li>" + T("Clique sur <b>🎮 Rejoindre</b> dans #arena, ou tape <b>/play</b>", "Click <b>🎮 Join</b> in #arena, or type <b>/play</b>") + "</li><li>" + T("Touche le bouton : la partie s'ouvre ici, à ton nom", "Tap the button: the game opens here, under your name") + "</li></ol>" + (msg ? '<p class="err">' + e(msg) + "</p>" : "") + "</div>";
}
// ---------------------------------------------------------------- 👑 royale
const SH = ["▲", "◆", "●", "■"];
let wipedSeen = -1, overSeen = false;
async function pick(i) { try { take(await call("answer", { step: S.step, choice: i })); if (navigator.vibrate) navigator.vibrate(40); } catch (x) { alert(x.message); } }
async function revive(pid) { try { take(await call("revive", { target: pid })); } catch (x) { alert(x.message); } }
function squadCard() {
  if (!S.squad || S.mode === "solo" || !S.me.alive) return "";
  const dead = S.squad.mates.filter((m) => !m.alive && m.pid !== S.me.pid);
  const canNow = S.phase === "reveal" && !(S.last && S.last.final);
  const btn = (m) => '<button class="btn primary" style="margin:4px" data-revive="' + e(m.pid) + '"' + (!canNow || S.pts < S.reviveCost || m.revived >= S.maxRevives ? " disabled" : "") + ">💖 " + e(m.name) + "</button>";
  // 🙏 a teammate asked to be brought back: first, in big
  const asking = dead.filter((m) => (S.pleas || []).includes(m.pid));
  const plea = asking.length ? '<div class="card plea center"><h3>🙏 ' + asking.map((m) => e(m.name)).join(", ") + (asking.length > 1 ? T(" vous demandent de les ramener !", " ask you to bring them back!") : T(" te demande de le ramener !", " asks you to bring them back!")) + "</h3>" +
    (canNow ? (S.pts >= S.reviveCost ? asking.map(btn).join("") : '<p class="muted">' + T("Il faut ", "You need ") + S.reviveCost + T(" pts : répondez juste pour en gagner.", " pts: answer right to earn them.") + "</p>") : '<p class="muted">' + T("Tu pourras le faire juste après cette question.", "You can do it right after this question.") + "</p>") + "</div>" : "";
  const others = dead.filter((m) => !asking.includes(m));
  return plea + '<div class="card" style="border-color:' + S.squad.color + '"><b>' + e(S.squad.emoji + " " + S.squad.name) + "</b> · " + S.pts + ' pts<div class="mates" style="margin-top:8px">' + S.squad.mates.map((m) => '<span class="chip">' + (m.alive ? "❤️ " : "💀 ") + e(m.name) + "</span>").join("") + "</div>" +
    (canNow && others.length ? '<p class="muted">' + T("Ramène un coéquipier (", "Bring a teammate back (") + S.reviveCost + T(" pts) :", " pts):") + "</p>" + others.map(btn).join("") : "") + "</div>";
}
/** Out of the game: in squads, who can still bring me back, the squad's points, and a button to ask them. */
function deathCard() {
  const q = S.q, ans = S.phase === "reveal" && q ? '<p class="muted">' + T("La réponse : ", "The answer: ") + "<b>" + SH[q.answer] + " " + e(q.options[q.answer]) + "</b></p>" : "";
  const head = '<div class="dskull">💀</div><h2>' + T("Éliminé", "You're out") + "</h2>" + (S.outStep ? '<p class="muted" style="margin:0">' + T("à la question ", "on question ") + S.outStep + "</p>" : "") + ans;
  if (!S.squad || S.mode === "solo") return '<div class="card center death">' + head + '<p class="dhelp">' + T("Regarde la TV et encourage les autres : qui sera le dernier debout ?", "Watch the TV and cheer the others on: who will be the last one standing?") + "</p>" + stats() + "</div>";
  const mates = S.squad.mates.filter((m) => m.pid !== S.me.pid), alive = mates.filter((m) => m.alive);
  if (!alive.length) return '<div class="card center death">' + head + '<p class="dhelp">' + T("Tout ton squad est tombé 😢 Regarde la fin sur la TV.", "Your whole squad fell 😢 Watch the end on the TV.") + "</p>" + stats() + "</div>";
  const asked = (S.pleas || []).includes(S.me.pid), used = S.revived >= S.maxRevives, enough = S.pts >= S.reviveCost;
  const pts = '<div class="dpts"><div class="lbl"><span>' + e(S.squad.emoji + " " + S.squad.name) + " : <b>" + S.pts + " pts</b></span><span>" + T("il en faut ", "needs ") + S.reviveCost + '</span></div><div class="bar"><i style="width:' + Math.min(100, Math.round((100 * S.pts) / Math.max(1, S.reviveCost))) + '%"></i></div>' +
    (enough ? '<div class="small" style="color:#86efac;margin-top:5px">✓ ' + T("Ils ont assez de points pour te ramener !", "They have enough points to bring you back!") + "</div>" : '<div class="small muted" style="margin-top:5px">' + T("Leurs bonnes réponses rapportent des points.", "Their right answers earn points.") + "</div>") + "</div>";
  const ask = '<button class="btn pleab" id="plea"' + (asked ? " disabled" : "") + ">" + (asked ? "✓ " + T("Demande envoyée : ton squad la voit", "Asked: your squad sees it") : "🙏 " + T("Demander à mon squad de me ramener", "Ask my squad to bring me back")) + "</button>";
  const help = used ? '<p class="dhelp">' + T("Tu as déjà été ramené une fois : cette fois c'est fini. Encourage ton squad !", "You were already brought back once: this time it's over. Cheer your squad on!") + "</p>"
    : '<p class="dhelp">' + T("Ton squad peut te ramener entre deux questions. Demande-le-leur !", "Your squad can bring you back between two questions. Ask them!") + "</p>" + pts + ask;
  return '<div class="card center death">' + head + help + '<p class="muted" style="margin:14px 0 0">' + T("Encore en vie dans ton squad :", "Still alive in your squad:") + '</p><div class="amates">' + mates.map((m) => '<span class="' + (m.alive ? "" : "gone") + '">' + (m.alive ? "❤️ " : "💀 ") + e(m.name) + "</span>").join("") + "</div>" + stats() + "</div>";
}
const stats = () => '<div class="stat"><span>❤️ ' + S.alive + T(" en vie", " alive") + "</span>" + (S.squadsLeft != null ? "<span>🛡️ " + S.squadsLeft + " squad" + (S.squadsLeft > 1 ? "s" : "") + "</span>" : "") + "<span>✓ " + S.me.score + "</span></div>";
function royale() {
  const h = squadCard();
  if (S.phase === "lobby") return '<div class="card center"><div class="hero">👑</div><h2>' + T("Tu es dans la partie, ", "You're in, ") + e(S.me.name) + " !</h2>" + (S.squad && S.mode !== "solo" ? '<p><span class="sqbadge" style="--c:' + S.squad.color + '">' + e(S.squad.emoji + " " + S.squad.name) + "</span></p>" : "") + '<p class="muted">' + T("Regarde la TV : la partie va commencer.", "Watch the TV: the game is about to start.") + '</p><div class="lock"><i></i>' + S.players + T(" joueur(s) connecté(s)", " player(s) in") + "</div></div>" + h;
  if (S.phase === "over") {
    const won = S.winners.includes(S.me.pid) || (S.winSquad != null && S.me.squad === S.winSquad);
    return '<div class="card center resc' + (won ? " ok" : "") + '"><div class="big">' + (won ? "🏆" : "🎮") + "</div><h2>" + (won ? T("Victoire !", "You win!") : T("Partie terminée", "Game over")) + '</h2><p class="muted">' + S.me.score + T(" bonne(s) réponse(s)", " right answer(s)") + "</p></div>";
  }
  if (!S.me.alive && (S.phase === "question" || S.phase === "reveal")) return deathCard();
  const q = S.q; if (!q) return h;
  if (S.phase === "question" && nowMs() < S.qAt) return '<div class="card center"><h2>' + (S.step === 1 ? T("Prépare-toi…", "Get ready…") : T("Question ", "Question ") + S.step) + '</h2><div class="pcd tick" id="pcd">' + Math.max(1, Math.ceil((S.qAt - nowMs()) / 1000)) + "</div>" + stats() + "</div>" + h;
  if (S.phase === "question") {
    const left = S.qEnd - nowMs(), tot = S.qEnd - S.qAt;
    return '<div class="card qcard"><div style="display:flex;justify-content:space-between;align-items:center"><b>' + T("Question ", "Question ") + S.step + '</b><span class="timer" id="tm">' + Math.max(0, Math.ceil(left / 1000)) + '</span></div><div class="tline"><i id="tb" style="width:' + Math.max(0, Math.min(100, 100 * left / tot)) + "%;background:" + barColor(left / tot) + '"></i></div><p style="font-size:19px;font-weight:700">' + e(q.prompt) + "</p>" + (q.code ? '<pre class="code">' + e(q.code) + "</pre>" : "") + "</div>" +
      '<div class="opts">' + q.options.map((o, i) => '<button class="opt' + (S.picked === i ? " pick" : S.picked != null ? " dim" : "") + '" style="--o:' + OCOL[i] + '" data-pick="' + i + '"' + (S.picked != null || left < -1500 ? " disabled" : "") + "><b>" + SH[i] + "</b><span>" + e(o) + "</span></button>").join("") + "</div>" +
      (S.picked != null ? '<div class="lock"><i></i>🔒 ' + T("Réponse verrouillée · on attend les autres", "Answer locked · waiting for the others") + "</div>" : "") + h;
  }
  // reveal
  const right = S.picked === q.answer, out = S.last && S.last.out;
  return '<div class="card center resc' + (out ? " out" : right || (S.last && S.last.everyone) ? " ok" : "") + '"><div class="big">' + (out ? "💀" : S.last && S.last.everyone ? "😅" : right ? "✅" : S.me.alive ? "🛡️" : "👀") + "</div><h2>" + (out ? T("Éliminé !", "You're out!") : S.last && S.last.everyone ? T("Tout le monde s'est trompé : tu restes !", "Everyone was wrong: you stay!") : right ? T("Bonne réponse !", "Right!") : S.me.alive ? T("Toujours en vie", "Still alive") : T("Tu regardes", "Watching")) + '</h2><p class="muted">' + T("La réponse : ", "The answer: ") + "<b>" + SH[q.answer] + " " + e(q.options[q.answer]) + "</b></p>" + stats() + "</div>" + h;
}
const barColor = (f) => (f > .5 ? "#22c55e" : f > .25 ? "#f59e0b" : "#ef4444");
function royaleEffects() {
  if (S.phase === "reveal" && S.last && wipedSeen !== S.step) {
    wipedSeen = S.step;
    if (S.last.wiped) {
      const d = document.createElement("div"); d.className = "pwipe"; d.style.setProperty("--c", S.squad ? S.squad.color : "#ef4444");
      d.innerHTML = '<div class="we">' + e(S.squad ? S.squad.emoji : "💀") + "</div><h1>" + T("SQUAD ÉLIMINÉ", "SQUAD WIPED OUT") + "</h1><p>" + T("Tout ton squad est tombé. Regarde la fin sur la TV !", "Your whole squad fell. Watch the end on the TV!") + "</p>";
      document.body.append(d); if (navigator.vibrate) navigator.vibrate([120, 60, 120, 60, 300]);
      d.onclick = () => d.remove(); setTimeout(() => d.remove(), 3500);
    } else if (S.last.out) {
      // I just fell: a short, loud moment, then the screen to ask my squad for help
      const d = document.createElement("div"); d.className = "pdead";
      d.innerHTML = '<div class="s">💀</div><h1>' + T("ÉLIMINÉ", "KNOCKED OUT") + "</h1>";
      document.body.append(d); if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
      d.onclick = () => d.remove(); setTimeout(() => d.remove(), 1800);
    }
  }
  if (S.phase === "over" && !overSeen) { overSeen = true; if (S.winners.includes(S.me.pid) || (S.winSquad != null && S.me.squad === S.winSquad)) confetti(); }
  if (S.phase !== "over") overSeen = false;
}
function confetti() {
  const c = document.createElement("canvas"); c.id = "conf"; c.width = innerWidth; c.height = innerHeight; document.body.append(c);
  const x = c.getContext("2d"), cols = ["#f59e0b", "#8b5cf6", "#06b6d4", "#22c55e", "#ef4444", "#ec4899"];
  const P = Array.from({ length: 120 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .6, w: 5 + Math.random() * 6, h: 7 + Math.random() * 8, vx: -1.5 + Math.random() * 3, vy: 2 + Math.random() * 3, r: Math.random() * 6, vr: -.2 + Math.random() * .4, c: cols[Math.floor(Math.random() * cols.length)] }));
  const t0 = Date.now();
  (function f() { x.clearRect(0, 0, c.width, c.height); for (const p of P) { p.x += p.vx; p.y += p.vy; p.vy += .03; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore(); } if (Date.now() - t0 < 5000) requestAnimationFrame(f); else c.remove(); })();
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
// the microphone: the voice band only, a noise floor learned from the room, a "voice bucket" that fills while someone talks
let mic = null, micDenied = false, level = -100, hist = [], bucket = 0, heat = 0, lastNoise = 0, quietUntil = 0, saving = false, myTurn = -1, edited = false, saveT = 0, testOut = "";
let silentSince = 0, mutedState = false, offSince = 0, seenStrikes = null, seenOut = null, fxBusy = false, histN = 0;
// only the voice of the student in front of the screen: a voice is heard when it's nearly as loud as their own (measured
// once in the lobby), so someone talking a few metres away (another squad) stays under the line; and it must last
const SENS = { low: { drop: 4, margin: 18, limit: 16 }, medium: { drop: 8, margin: 14, limit: 10 }, high: { drop: 13, margin: 9, limit: 6 } };
const VOICE0 = -30;
let voice = (() => { try { const v = Number(localStorage.getItem("cb-voice")); return v < -10 && v > -60 ? v : null; } catch (x) { return null; } })();
let calib = null, calibMsg = "", burstMax = -100;
const EXT = { javascript: "js", python: "py", php: "php" };
async function micStart() {
  if (mic || window.__micBusy || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return;
  window.__micBusy = 1;
  try {
    const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume().catch(() => {});
    const src = ac.createMediaStreamSource(st);
    const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 250;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
    const an = ac.createAnalyser(); an.fftSize = 2048;
    const raw = ac.createAnalyser(); raw.fftSize = 2048;
    src.connect(hp); hp.connect(lp); lp.connect(an); src.connect(raw);
    const track = st.getAudioTracks()[0];
    mic = { ac, an, raw, buf: new Float32Array(an.fftSize), rbuf: new Float32Array(raw.fftSize), track };
    micDenied = false;
    if (track) { track.onmute = () => setMuted(true); track.onunmute = () => { silentSince = 0; setMuted(false); }; track.onended = () => setMuted(true); }
    call("mic", { on: true }).catch(() => {});
    setInterval(listen, 50);
  } catch (x) { micDenied = true; call("mic", { on: false }).catch(() => {}); }
  window.__micBusy = 0;
  micRefresh();
}
// the mic changed: the editor is never redrawn under the writer's fingers, so only the banner and the pill are
function micRefresh() {
  if (!S) return;
  if (!(S && S.writing && $("#code"))) { lastKey = ""; draw(); return; }
  const w = $(".mwarn"), html = mwarnHtml();
  if (w) { if (html) w.outerHTML = html; else w.remove(); } else if (html) $("#app").insertAdjacentHTML("afterbegin", html);
  const mp = $(".hud .micp"); if (mp) mp.outerHTML = micPill();
  wire();
}
document.addEventListener("pointerdown", () => { if (mic && mic.ac.state === "suspended") mic.ac.resume().catch(() => {}); });
// the browser already allowed the microphone: it starts by itself
try { if (KIND === "relay" && navigator.permissions) navigator.permissions.query({ name: "microphone" }).then((p) => { if (p.state === "granted") micStart(); }).catch(() => {}); } catch (x) {}
function setMuted(v) {
  if (mutedState === v) return;
  mutedState = v; call("mic", v ? { state: "muted" } : { on: true }).catch(() => {});
  micRefresh();
}
const micOk = () => !!mic && !mutedState;
function listen() {
  const m = mic, cfg = SENS[(S && S.sensitivity) || "medium"] || SENS.medium;
  m.an.getFloatTimeDomainData(m.buf); m.raw.getFloatTimeDomainData(m.rbuf);
  let sum = 0, peak = 0;
  for (let i = 0; i < m.buf.length; i++) sum += m.buf[i] * m.buf[i];
  for (let i = 0; i < m.rbuf.length; i++) { const a = Math.abs(m.rbuf[i]); if (a > peak) peak = a; }
  level = 20 * Math.log10(Math.sqrt(sum / m.buf.length) + 1e-9);
  // a muted microphone (the mute key, the system settings, unplugged) sends pure digital silence
  const dead = peak < 1e-6 || (m.track && (m.track.muted || m.track.readyState === "ended" || !m.track.enabled));
  if (dead) { if (!silentSince) silentSince = Date.now(); if (Date.now() - silentSince > 2000) setMuted(true); }
  else { silentSince = 0; if (mutedState) setMuted(false); }
  // the room's noise: a low percentile of the last 8 s (a voice barely moves it)
  const sorted = hist.slice().sort((a, b) => a - b);
  const floor = sorted.length > 10 ? sorted[Math.floor(sorted.length * .3)] : -75;
  const thr = Math.max(Math.min(floor, -36) + cfg.margin, (voice == null ? VOICE0 : voice) - cfg.drop, -60);
  // calibrating: the levels of their voice (well above the room)
  if (calib) {
    if (!dead && level > floor + 8) calib.v.push(level);
    if (Date.now() > calib.end) {
      const v = calib.v.sort((a, b) => a - b); calib = null;
      if (v.length < 12) calibMsg = T("Je ne t'ai pas entendu : recommence en lisant la phrase à voix normale.", "I didn't hear you: try again, reading the sentence in your normal voice.");
      else { voice = Math.max(-38, Math.min(-20, v[Math.floor(v.length * .8)])); calibMsg = ""; try { localStorage.setItem("cb-voice", String(Math.round(voice))); } catch (x) {} }
      lastKey = ""; draw();
    }
  }
  const over = !dead && !calib && level > thr && Date.now() > quietUntil;
  if (!dead && (!over || ++histN % 12 === 0)) { hist.push(level); if (hist.length > 160) hist.shift(); }
  bucket = over ? Math.min(cfg.limit * 1.6, bucket + 1 + Math.min(1, (level - thr) / 12)) : Math.max(0, bucket - .7);
  if (over) burstMax = Math.max(burstMax, level); else if (bucket === 0) burstMax = -100;
  // the louder and the longer, the more the screen shakes
  const target = over ? Math.min(1, .3 + (level - thr) / 22 + .45 * bucket / cfg.limit) : Math.min(.45, .45 * bucket / cfg.limit);
  heat += (target - heat) * (target > heat ? .55 : .14);
  const v = $("#vu"); if (v) { v.style.width = Math.max(3, Math.min(100, (level + 75) * 1.6)) + "%"; v.className = over ? "hot" : ""; }
  const lt = $("#ltest"); if (lt) lt.textContent = over ? T("🔴 Je t'entends !", "🔴 I can hear you!") : T("🟢 Silence", "🟢 Quiet");
  const playing = S && S.phase === "playing" && S.noise && !S.out;
  // how loud next to their own voice: the server compares it with the other squads' microphones at the same moment
  if (playing && bucket >= cfg.limit && Date.now() - lastNoise > 4000) { lastNoise = Date.now(); bucket = 0; call("noise", { why: "voice", rel: Math.round(burstMax - (voice == null ? VOICE0 : voice)) }).then(poke).catch(() => {}); burstMax = -100; }
  const ta = $("#code");
  if (ta) { const lock = playing && heat > .38; if (ta.readOnly !== lock) { ta.readOnly = lock; ta.closest(".ide").classList.toggle("loud", lock); } }
}
// the screen shakes while the mic hears a voice (writing becomes impossible), a red glow grows at the edges
(function shakeLoop() {
  const live = S && KIND === "relay" && (S.phase === "playing" || S.phase === "lobby") && !S.out;
  const h = live ? heat * (S.phase === "lobby" ? .6 : 1) : 0, amp = h * 16;
  const t = amp > .4 ? "translate(" + ((Math.random() * 2 - 1) * amp).toFixed(1) + "px," + ((Math.random() * 2 - 1) * amp).toFixed(1) + "px) rotate(" + ((Math.random() * 2 - 1) * amp * .09).toFixed(2) + "deg)" : "";
  const a = $("#app"); if (a && a.style.transform !== t) a.style.transform = t;
  const vg = $("#vig"); if (vg) vg.style.opacity = Math.min(1, h * 1.3).toFixed(2);
  const sh = $("#shh"); if (sh) { const on = h > .32; sh.classList.toggle("on", on); if (on) sh.style.transform = "translate(-50%,-50%) scale(" + (1 + h * .5).toFixed(2) + ") rotate(" + ((Math.random() * 2 - 1) * h * 6).toFixed(1) + "deg)"; }
  requestAnimationFrame(shakeLoop);
})();
function pips(n, max, fresh) { let s = ""; for (let i = 0; i < max; i++) s += '<i class="' + (i < n ? "on" : "") + (fresh && i === n - 1 ? " new" : "") + '">' + (i < n ? "✖" : "") + "</i>"; return '<span class="pips">' + s + "</span>"; }
function fx(cls, html, ms, then) {
  const d = document.createElement("div"); d.className = "fx " + cls; d.innerHTML = html; document.body.append(d);
  fxBusy = true; setTimeout(() => { d.classList.add("bye"); setTimeout(() => { d.remove(); fxBusy = false; if (then) then(); }, 450); }, ms);
}
function relayEffects() {
  if (seenStrikes === null || S.phase === "lobby") { seenStrikes = S.strikes; seenOut = S.out; return; }
  if (S.strikes > seenStrikes) {
    quietUntil = Date.now() + 2500; bucket = 0;
    const ln = S.lastNoise || {}, who = ln.why === "teacher" ? T("Avertissement du formateur", "From the teacher") : ln.name ? (ln.why === "muted" ? T("Le micro de ", "") + e(ln.name) + T(" était coupé", "'s mic was muted") : e(ln.name) + T(" a parlé", " talked")) : "";
    const out = S.out && !seenOut;
    fx("strk", '<div class="sx">✖</div><div class="sl">' + T("AVERTISSEMENT", "STRIKE") + '</div><div class="sc">' + S.strikes + " / " + S.strikesMax + "</div>" + pips(S.strikes, S.strikesMax, true) + (who ? "<p>" + (ln.why === "teacher" ? "👩‍🏫 " : "🗣️ ") + who + "</p>" : "") + (!out && S.strikesMax - S.strikes === 1 ? '<p class="last">⚠️ ' + T("Encore un et votre squad est éliminé !", "One more and your squad is out!") + "</p>" : ""), 2300, out ? outFx : null);
    if (navigator.vibrate) navigator.vibrate([220, 90, 220]);
  } else if (S.out && !seenOut) outFx();
  seenStrikes = S.strikes; seenOut = S.out;
}
function outFx() {
  fx("kout", '<div class="crack"></div><div class="ko">🔇</div><div class="kt" data-t="' + T("ÉLIMINÉS", "KNOCKED OUT") + '">' + T("ÉLIMINÉS", "KNOCKED OUT") + "</div><p>" + (S.noise ? T("Trop de bruit : votre squad quitte le relais.", "Too much noise: your squad leaves the relay.") : T("Trop d'avertissements : votre squad quitte le relais.", "Too many strikes: your squad leaves the relay.")) + "</p>", 3600);
  if (navigator.vibrate) navigator.vibrate([400, 120, 400, 120, 700]);
}
function turnFx() {
  fx("baton", '<div class="br">🏃</div><div class="bt">' + T("À TOI !", "YOUR TURN!") + '</div><p>' + T("Le relais est à toi : continue le code, sans un mot.", "You have the baton: carry on the code, not a word.") + "</p>", 1300);
  if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
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
function gutter() { const ta = $("#code"), g = $("#gut"); if (!ta || !g) return; const n = ta.value.split("\\n").length; if (g.dataset.n !== String(n)) { g.dataset.n = n; let s = ""; for (let i = 1; i <= n; i++) s += i + "\\n"; g.textContent = s; } g.scrollTop = ta.scrollTop; }
const initials = (n) => String(n || "?").trim().split(/\\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
function micPill() {
  if (!S.noise) return "";
  if (micOk()) return '<span class="micp ok">🎤 <span class="vu"><i id="vu"></i></span></span>';
  return '<button class="micp bad" id="micb">' + (mutedState ? "🔇 " + T("Micro coupé", "Mic muted") : "🎤 " + T("Activer le micro", "Turn on the mic")) + "</button>";
}
function calibHtml() {
  if (calib) return '<div class="calib on"><b>🗣️ ' + T("Lis à voix normale :", "Read in your normal voice:") + '</b><p class="say">' + T("« Je suis prêt pour le relais, et je ne dirai plus un mot. »", "“I'm ready for the relay, and I won't say another word.”") + "</p></div>";
  return '<div class="calib">' + (voice != null ? '<span class="ok">✓ ' + T("Ta voix est réglée : seules les voix aussi fortes que la tienne, près de ton écran, comptent.", "Your voice is set: only voices as loud as yours, next to your screen, count.") + "</span> " : '<span>' + T("Règle ta voix : le micro ne comptera que les voix proches de ton écran, pas les autres squads.", "Set your voice: the mic will only count voices next to your screen, not the other squads.") + "</span> ") +
    '<button class="btn" id="calb">🗣️ ' + (voice != null ? T("Refaire", "Again") : T("Régler ma voix", "Set my voice")) + "</button>" + (calibMsg ? '<p class="err">' + e(calibMsg) + "</p>" : "") + "</div>";
}
function hud() {
  return '<div class="hud"><div class="hc"><span class="hl">⏱ ' + T("Relais", "Relay") + '</span><b id="tot">' + (S.endAt ? mmss(S.endAt - nowMs()) : "") + "</b></div>" +
    '<div class="hc"><span class="hl">' + T("Avertissements", "Strikes") + "</span>" + pips(S.strikes, S.strikesMax) + "</div>" +
    '<div class="hc"><span class="hl">' + T("Manche", "Round") + "</span><b>" + (S.round || 1) + "/" + (S.rounds || 1) + "</b></div>" +
    (S.noise ? '<div class="hc"><span class="hl">' + T("Micro", "Mic") + "</span>" + micPill() + "</div>" : "") + "</div>";
}
function track() {
  const ms = S.mates || [];
  return '<div class="track"><div class="tl"></div>' + ms.map((m, i) => '<div class="node' + (m.writer ? " w" : "") + (m.me ? " me" : "") + '"><div class="av">' + e(initials(m.name)) + (m.writer ? '<span class="run">🏃</span>' : "") + (S.noise && m.mic !== 1 ? '<span class="mst" title="' + T("micro coupé", "mic off") + '">🔇</span>' : "") + '</div><span class="nm">' + (m.me ? T("Toi", "You") : e(m.name)) + '</span><span class="ix">' + (i + 1) + "</span></div>").join("") + "</div>";
}
function taskCard(compact) {
  return '<div class="card tcard' + (compact ? " compact" : "") + '"><div class="th"><b>🎯 ' + e(S.task.title) + '</b><span class="lang">' + e(S.langName || "JavaScript") + '</span></div><p>' + e(S.task.text) + '</p><div class="ex">' + S.task.shown.map((x) => "<code>" + e(x.call) + " <i>→</i> " + e(x.expect) + "</code>").join("") + "</div></div>";
}
function mwarnHtml() {
  return S.noise && S.phase === "playing" && !S.out && !micOk() ? '<div class="mwarn">' + (mutedState ? "🔇 " + T("Ton micro est coupé !", "Your mic is muted!") : micDenied ? "🚫 " + T("Le micro est refusé par le navigateur", "The browser blocked the mic") : "🎤 " + T("Ton micro n'est pas activé", "Your mic isn't on")) + ' <span id="mwc"></span>' + (mutedState || micDenied ? "" : ' <button class="btn" id="micb">🎤 ' + T("Activer", "Turn on") + "</button>") + "</div>" : "";
}
// anti-cheat (like the assessments): the relay is played in full screen; leaving it, the tab or the window stops the
// student until the teacher lets them back in; copy, cut and paste are blocked; the TV is told each time
const FS_OK = !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
let fsArmed = false, fsGrace = 0;
const needFs = () => !!S && KIND === "relay" && S.lockScreen && FS_OK && S.phase === "playing" && !S.out;
function goFs() { document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {}); }
function cheat(what) { if (!S || KIND !== "relay" || S.phase !== "playing" || S.out) return; call("cheat", { what }).then(poke).catch(() => {}); }
function ptoast(t) { const d = document.createElement("div"); d.className = "ptoast"; d.textContent = t; document.body.append(d); setTimeout(() => d.remove(), 2600); }
document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) { fsArmed = true; fsGrace = Date.now() + 1500; }
  else if (fsArmed) { fsArmed = false; if (needFs() && !S.locked) cheat("fullscreen"); }
  if (!S || KIND !== "relay") return;
  const go = () => { lastKey = ""; draw(); };
  if ($("#code") && !document.fullscreenElement && needFs()) save().finally(go); else if (!$("#code")) go();
});
document.addEventListener("visibilitychange", () => { if (document.hidden && fsArmed && needFs() && !S.locked) cheat("hidden"); });
window.addEventListener("blur", () => { if (fsArmed && needFs() && !S.locked && Date.now() > fsGrace) cheat("blur"); });
for (const ev of ["copy", "cut", "paste", "drop"]) document.addEventListener(ev, (e) => {
  if (!S || KIND !== "relay" || !S.noPaste || S.phase !== "playing") return;
  e.preventDefault(); cheat(ev);
  ptoast("🚫 " + T("Copier-coller interdit pendant le relais : ton formateur est prévenu.", "No copy-paste during the relay: your teacher is told."));
}, true);
document.addEventListener("contextmenu", (e) => { if (S && KIND === "relay" && S.noPaste && S.phase === "playing") e.preventDefault(); }, true);
const LOCKWHY = { fullscreen: T("Tu as quitté le plein écran.", "You left full screen."), hidden: T("Tu as changé d'onglet ou réduit la fenêtre.", "You switched tab or minimized the window."), blur: T("Tu as changé de fenêtre.", "You switched window.") };
function lockView() {
  return '<div class="card bigc lockc"><div class="trophy">⏸️</div><h2>' + T("Session arrêtée", "Session stopped") + '</h2><p><b>' + e(LOCKWHY[S.locked] || LOCKWHY.fullscreen) + '</b></p><p class="muted">' + T("Demande à ton formateur de te laisser revenir : il voit ton nom sur la TV. Cette page se met à jour toute seule.", "Ask your teacher to let you back in: they see your name on the TV. This page updates by itself.") + "</p></div>";
}
function fsGate() {
  return '<div class="card bigc fsc"><div class="trophy">🖥️</div><h2>' + T("Le relais se joue en plein écran", "The relay is played in full screen") + '</h2><p class="muted">' + T("Quitter le plein écran, changer d'onglet ou de fenêtre arrête ta session jusqu'à ce que ton formateur te laisse revenir.", "Leaving full screen, switching tab or window stops your session until your teacher lets you back in.") + (S.noPaste ? " " + T("Copier-coller interdit.", "No copy-paste.") : "") + '</p><button class="btn primary big" id="fsgo">🖥️ ' + T("Passer en plein écran", "Go full screen") + "</button></div>";
}
function relayView() {
  const mwarn = mwarnHtml();
  if (S.phase === "lobby") {
    const m = !S.noise ? "" : micOk() ? '<div class="mtest ok"><div class="mic-ic">🎤</div><div style="flex:1"><b>' + T("Micro prêt", "Mic ready") + ' ✓</b><div class="vu big"><i id="vu"></i></div><span class="muted" id="ltest"></span><p class="muted small">' + T("Essaie : parle un peu et regarde l'écran trembler. Pendant le relais, chaque voix entendue = un avertissement pour ton squad.", "Try it: say something and watch the screen shake. During the relay, every voice heard = a strike for your squad.") + "</p>" + calibHtml() + "</div></div>"
      : '<div class="mtest"><div class="mic-ic pulse">🎤</div><div style="flex:1"><b>' + (mutedState ? T("Ton micro est coupé", "Your mic is muted") : micDenied ? T("Micro refusé", "Mic blocked") : T("Active ton micro", "Turn on your mic")) + '</b><p class="muted small">' + (micDenied ? T("Autorise le micro (🔒 à gauche de l'adresse) puis recharge la page. Sans micro, tu ne peux pas écrire.", "Allow the mic (🔒 left of the address) then reload. Without a mic, you can't write.") : mutedState ? T("Réactive-le (touche micro du clavier ou réglages) : un micro coupé pendant le relais = un avertissement.", "Unmute it (the mic key or the settings): a muted mic during the relay = a strike.") : T("Obligatoire : sans micro, tu ne pourras pas écrire ton tour.", "Required: without the mic, you won't be able to write your turn.")) + "</p>" + (mutedState || micDenied ? "" : '<button class="btn primary" id="micb">🎤 ' + T("Activer mon micro", "Turn on my mic") + "</button>") + "</div></div>";
    return '<div class="card rhero"><div class="lane"><span class="runner">🏃</span></div><h2>' + T("Tu es dans le relais !", "You're in the relay!") + '</h2><div class="rules"><div><i>🤫</i>' + T("Interdit de parler", "No talking") + "</div><div><i>✍️</i>" + T("Chacun écrit à son tour", "Each one writes in turn") + "</div><div><i>✖</i>" + (S.strikesMax || 3) + T(" avertissements = éliminés", " strikes = out") + "</div>" + (S.lockScreen && FS_OK ? "<div><i>🖥️</i>" + T("En plein écran", "In full screen") + "</div>" : "") + (S.noPaste ? "<div><i>🚫</i>" + T("Pas de copier-coller", "No copy-paste") + "</div>" : "") + "</div>" + m + (S.lockScreen && FS_OK && !document.fullscreenElement ? '<p style="margin:14px 0 0"><button class="btn" id="fsgo">🖥️ ' + T("Passer en plein écran maintenant", "Go full screen now") + "</button></p>" : "") + "</div>" + taskCard();
  }
  if (S.phase === "testing") return '<div class="card bigc"><div class="flask">🧪</div><h2>' + T("Les tests tournent sur la TV…", "The tests are running on the TV…") + '</h2><p class="muted">' + T("Regarde l'écran : on saura bientôt qui gagne.", "Watch the screen: the winner is coming.") + "</p></div>";
  if (S.phase === "over") {
    const win = S.winSquad === S.me.squad, r = S.result, pct = r && r.total ? Math.round(100 * r.passed / r.total) : 0;
    if (win && !window.__conf) { window.__conf = 1; setTimeout(confetti, 300); }
    return '<div class="card bigc ' + (win ? "won" : "") + '"><div class="trophy">' + (win ? "🏆" : S.out ? "🔇" : "🏁") + "</div><h2>" + (win ? T("Votre squad gagne !", "Your squad wins!") : T("Fin du relais", "Relay over")) + "</h2>" +
      (r ? '<div class="score"><div class="pring" style="--p:' + pct + '"><span>' + r.passed + "/" + r.total + "</span></div><div>" + T("tests réussis", "tests passed") + (S.rank ? '<br><b class="rank">#' + S.rank + "</b>" : "") + "</div></div>" : "") + (S.aiWhy ? '<p class="muted" style="margin-top:12px">🤖 ' + T("Aucun squad n'a réussi de test, l'IA a départagé : ", "No squad passed a test, the AI decided: ") + e(S.aiWhy) + "</p>" : "") + "</div>" +
      '<div class="ide"><div class="tabs"><span class="tab"><i class="ld"></i>' + e(S.task.fn) + "." + (EXT[S.codeLang] || "js") + '</span><span class="muted">' + T("votre code final", "your final code") + '</span></div><pre class="code fin">' + e(S.code || "") + "</pre></div>";
  }
  if (S.phase === "playing" && !S.out && S.locked) return lockView();
  if (needFs() && !document.fullscreenElement) return fsGate();
  if (S.out) return '<div class="card bigc outc"><div class="trophy">🔇</div><h2>' + T("Votre squad est éliminé", "Your squad is out") + "</h2>" + pips(S.strikes, S.strikesMax) + '<p class="muted">' + (S.noise ? T("Trop de bruit pendant le relais. Restez silencieux : les autres squads continuent.", "Too much noise during the relay. Stay quiet: the other squads carry on.") : T("Trop d'avertissements. Restez silencieux : les autres squads continuent.", "Too many strikes. Stay quiet: the other squads carry on.")) + "</p></div>";
  if (S.writing) {
    return mwarn + hud() + '<div class="wtop"><div><h2>✍️ ' + T("C'est à toi !", "Your turn!") + '</h2><p class="muted">' + T("Lis le code de ton équipe et continue-le. Pas un mot !", "Read your team's code and carry on. Not a word!") + '</p></div><div class="tbox"><span class="hl">' + T("ton tour", "your turn") + '</span><b id="tm"></b></div></div><div class="tbar"><i id="wbar"></i></div>' + taskCard(true) +
      '<div class="ide"><div class="tabs"><span class="tab"><i class="ld"></i>' + e(S.task.fn) + "." + (EXT[S.codeLang] || "js") + '</span><span class="muted" id="saved"></span></div><div class="ed"><pre class="gut" id="gut">1</pre><textarea class="js" id="code" spellcheck="false" wrap="off" autocomplete="off"></textarea><div class="gate" id="gate"><div>🎤</div><b>' + T("Active ton micro pour écrire", "Turn your mic on to write") + '</b><span class="muted">' + T("Le relais se joue en silence, micro ouvert.", "The relay is played in silence, mic on.") + '</span></div><div class="shout">🤫 ' + T("CHUT ! Tu ne peux pas écrire en parlant", "SHH! You can't write while talking") + '</div></div><div class="ifoot"><button class="btn" id="try">▶ ' + T("Tester les exemples", "Try the examples") + '</button><span class="muted small">Tab = ' + T("indentation", "indent") + '</span></div><div id="tout">' + testOut + "</div></div>";
  }
  return mwarn + hud() + '<div class="card wait"><div class="shh-ic">🤫</div><div class="wwho"><span class="muted">' + T("Au clavier", "At the keyboard") + "</span><h2>" + e(S.writerName || "…") + "</h2></div>" + '<div class="tbar"><i id="wbar"></i></div><div class="wnext">' + (S.nextAt ? T("Ton tour dans", "Your turn in") + ' <b id="nx"></b>' : "✅ " + T("Tes tours sont finis : reste silencieux jusqu'au bout !", "Your turns are done: stay silent to the end!")) + "</div>" + track() + "</div>" + taskCard();
}
// ---------------------------------------------------------------- frame
function draw() {
  const k = KIND === "sql" ? sqlView : KIND === "relay" ? relayView : royale;
  const keep = $("#sql") ? $("#sql").value : null;
  $("#app").innerHTML = k();
  if (KIND === "royale" && S.phase === "reveal" && S.nextAt) $("#app").insertAdjacentHTML("afterbegin", '<div class="nxq" id="nxq"></div>');
  if (keep != null && $("#sql")) $("#sql").value = keep;
  // the editor drawn again (back in full screen): the code as the squad left it
  if (KIND === "relay" && S.writing) { const ta = $("#code"); if (ta && !ta.value) { ta.value = S.code || S.starter || ""; gutter(); } }
  wire();
}
function render() {
  if (KIND === "relay" && S.writing && S.turn !== myTurn) {
    // my turn: the code as my squad left it (two turns in a row: I keep what I was typing)
    const mine = myTurn !== -1 && $("#code") ? $("#code").value : null;
    const fresh = myTurn === -1;
    myTurn = S.turn; testOut = ""; lastKey = ""; seenStrikes = S.strikes; seenOut = S.out; draw(); const ta = $("#code"); if (ta) { ta.value = mine != null ? mine : S.code || S.starter || ""; gutter(); ta.focus(); } if (fresh) turnFx(); return;
  }
  if (KIND === "relay" && !S.writing && myTurn !== -1 && $("#code")) { save().finally(() => { myTurn = -1; lastKey = ""; draw(); }); return; }
  if (KIND === "royale") royaleEffects();
  if (KIND === "relay") { relayEffects(); const hp = document.querySelector(".hud .pips"); if (hp) hp.outerHTML = pips(S.strikes, S.strikesMax); }
  const key = S.seq + "." + S.phase + "." + S.step + "." + (S.picked != null) + "." + (KIND === "royale" && S.phase === "question" && nowMs() < S.qAt ? "cd" : "") + "." + (S.writing ? "w" : S.writer) + "." + S.strikes + "." + (S.out ? 1 : 0) + "." + (S.done ? 1 : 0) + "." + (S.lock ? 1 : 0) + "." + S.pts + "." + (S.me.alive ? 1 : 0) + "." + JSON.stringify(S.pleas || []) + "." + (S.squad ? S.squad.mates.map((m) => (m.alive ? 1 : 0)).join("") : "") + "." + (S.mates ? S.mates.map((m) => m.mic).join("") : "") + "." + (S.locked || "") + "." + (document.fullscreenElement ? 1 : 0);
  if (key === lastKey) return;
  lastKey = key;
  if (KIND === "relay" && S.writing && $("#code")) return;   // never redraw the editor under the writer's fingers
  draw();
}
function wire() {
  document.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => pick(Number(b.dataset.pick)));
  document.querySelectorAll("[data-revive]").forEach((b) => b.onclick = () => revive(b.dataset.revive));
  if ($("#plea")) $("#plea").onclick = async () => { try { take(await call("plea", {})); if (navigator.vibrate) navigator.vibrate(30); } catch (x) { alert(x.message); } };
  if ($("#run")) $("#run").onclick = runSql;
  if ($("#sql")) $("#sql").onkeydown = (ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") { ev.preventDefault(); runSql(); } };
  document.querySelectorAll("[data-ins]").forEach((c) => c.onclick = () => { const t = $("#sql"); if (t) { const p = t.selectionStart; t.value = t.value.slice(0, p) + c.dataset.ins + t.value.slice(t.selectionEnd); t.focus(); } });
  if ($("#hint")) $("#hint").onclick = hint;
  if ($("#fsgo")) $("#fsgo").onclick = goFs;
  if ($("#accb")) $("#accb").onclick = accuse;
  document.querySelectorAll("#micb").forEach((b) => b.onclick = () => micStart());
  const cb = $("#calb"); if (cb) cb.onclick = () => { calib = { end: Date.now() + 4000, v: [] }; calibMsg = ""; lastKey = ""; draw(); };
  if ($("#try")) $("#try").onclick = tryIt;
  const ta = $("#code");
  if (ta) {
    ta.oninput = () => { edited = true; gutter(); };
    ta.onscroll = gutter;
    ta.onkeydown = (ev) => { if (ev.key === "Tab") { ev.preventDefault(); const sp = S.codeLang === "python" || S.codeLang === "php" ? "    " : "  "; const p = ta.selectionStart; ta.value = ta.value.slice(0, p) + sp + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = p + sp.length; edited = true; gutter(); } };
  }
}
setInterval(() => {
  if (!S) return;
  const nq = $("#nxq");
  if (nq && S.nextAt) nq.textContent = (S.last && S.last.final ? "🏆 " + T("Résultats dans ", "Results in ") : "⏭ " + T("Question suivante dans ", "Next question in ")) + Math.max(0, Math.ceil((S.nextAt - nowMs()) / 1000)) + " s";
  if (KIND === "royale" && S.phase === "question") {
    if (nowMs() < S.qAt) {
      const n = Math.max(1, Math.ceil((S.qAt - nowMs()) / 1000)), el = $("#pcd");
      if (el && el.textContent !== String(n)) { el.textContent = n; el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick"); if (navigator.vibrate) navigator.vibrate(25); }
      window.__cd = 1;
    } else {
      if (window.__cd || $("#pcd")) { window.__cd = 0; lastKey = ""; draw(); }
      const left = S.qEnd - nowMs(), tot = S.qEnd - S.qAt;
      const t = $("#tm"); if (t) t.textContent = Math.max(0, Math.ceil(left / 1000));
      const b = $("#tb"); if (b) { b.style.width = Math.max(0, Math.min(100, 100 * left / tot)) + "%"; b.style.background = barColor(left / tot); }
    }
  }
  if (KIND === "relay" && S.phase === "playing") {
    const left = S.turnEnd - nowMs(), frac = S.turnEnd && S.turnStart ? Math.max(0, Math.min(1, (nowMs() - S.turnStart) / (S.turnEnd - S.turnStart))) : 0;
    const t = $("#tm"); if (t && S.turnEnd) { t.textContent = mmss(left); t.classList.toggle("end", left < 10000); }
    const wb = $("#wbar"); if (wb) { wb.style.width = (100 * frac).toFixed(1) + "%"; wb.className = left < 10000 ? "end" : frac > .6 ? "mid" : ""; }
    const tot = $("#tot"); if (tot && S.endAt) tot.textContent = mmss(S.endAt - nowMs());
    const nx = $("#nx"); if (nx && S.nextAt) nx.textContent = mmss(S.nextAt - nowMs());
    // a microphone that is off or muted: the editor is locked, and after 20 s the squad gets a strike
    if (S.noise && !S.out) {
      if (!micOk()) {
        if (!offSince) offSince = Date.now();
        const lft = 20000 - (Date.now() - offSince);
        document.querySelectorAll("#mwc").forEach((c) => c.textContent = lft > 0 ? T("· avertissement dans ", "· strike in ") + Math.ceil(lft / 1000) + " s" : "");
        if (lft <= 0 && Date.now() - lastNoise > 15000) { lastNoise = Date.now(); offSince = Date.now(); call("noise", { why: "muted" }).then(poke).catch(() => {}); }
      } else offSince = 0;
      const g = $("#gate"), ta = $("#code"); if (g) { const on = !micOk(); g.classList.toggle("on", on); if (ta && ta.disabled !== on) ta.disabled = on; }
    }
    // the writer: save every 3 s, and right before the turn ends (the next one gets the code)
    if (S.writing && $("#code")) { if ((edited && Date.now() - saveT > 3000) || (S.turnEnd - nowMs() < 900 && !window.__last)) { saveT = Date.now(); if (S.turnEnd - nowMs() < 900) window.__last = 1; save(); } }
    if (!S.writing) window.__last = 0;
  }
}, 250);
poll();
</script></body></html>`;
