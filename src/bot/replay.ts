// Public "race replay" page: an animated bar-chart race of a finished contest.
// It only shows HackerRank usernames and scores, which are public anyway.
import type { ContestRow, Env } from "../shared/types.ts";
import { all, one } from "../shared/db.ts";

export async function replayData(env: Env, id: number) {
  const c = await one<ContestRow>(env, "SELECT * FROM contests WHERE id = ? AND status = 'finished'", id);
  if (!c) return null;
  const final = await all<{ hr_display: string; rank: number; score: number }>(env,
    "SELECT hr_display, rank, score FROM contest_results WHERE contest_id = ? ORDER BY rank LIMIT 50", id);
  return { name: c.name, slug: c.slug, start: c.start_at, snaps: JSON.parse(c.snaps || "[]"), final };
}

export function replayPage(id: number): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Race replay</title>
<style>
:root{--bg:#fcfcfb;--fg:#0b0b0b;--muted:#52514e;--grid:#e6e5e0;--bar:#b8b7b0;--p1:#2a78d6;--p2:#eb6834;--p3:#1baf7a}
@media (prefers-color-scheme:dark){:root{--bg:#1a1a19;--fg:#fff;--muted:#c3c2b7;--grid:#3a3a37;--bar:#5f5e5a;--p1:#3987e5;--p2:#d95926;--p3:#199e70}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 20px}
#race{position:relative;height:${8 * 44}px;border-left:1px solid var(--grid)}
.r{position:absolute;left:0;right:0;height:36px;display:flex;align-items:center;transition:transform .35s ease}
.b{height:100%;border-radius:0 4px 4px 0;background:var(--bar);transition:width .35s ease;min-width:2px}
.n{position:absolute;left:10px;font-weight:600;color:#fff;text-shadow:0 1px 2px #0008;white-space:nowrap}
.s{margin-left:8px;color:var(--muted);font-variant-numeric:tabular-nums}
.clock{font-size:32px;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums;margin-top:8px}
.controls{display:flex;gap:8px;align-items:center;margin-top:16px}
button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid var(--grid);background:transparent;color:var(--fg);cursor:pointer}
input[type=range]{flex:1}
.podium{margin-top:24px;display:flex;gap:12px;flex-wrap:wrap}.podium div{padding:10px 14px;border:1px solid var(--grid);border-radius:10px}
</style></head><body><main>
<h1 id="title">Race replay</h1><p class="sub" id="sub">Loading…</p>
<div id="race"></div><div class="clock" id="clock"></div>
<div class="controls"><button id="play">⏸ Pause</button><input type="range" id="seek" min="0" value="0"><button id="restart">↺</button></div>
<div class="podium" id="podium"></div>
</main><script>
const MEDAL=["🥇","🥈","🥉"];
fetch("/replay/${id}/data").then(r=>r.ok?r.json():Promise.reject()).then(d=>{
  document.getElementById("title").textContent=d.name+" · race replay";
  document.getElementById("sub").textContent=d.final.length+" participants";
  document.title=d.name+" · race replay";
  const podiumColor={};d.final.filter(e=>e.rank<=3).forEach(e=>podiumColor[e.hr_display.toLowerCase()]="var(--p"+e.rank+")");
  const frames=[];const keys=d.snaps;const tw=6;
  for(let i=0;i<keys.length-1;i++){const[t0,a]=keys[i],[t1,b]=keys[i+1];const us=new Set([...Object.keys(a),...Object.keys(b)]);
    for(let k=0;k<tw;k++){const f=k/tw,sc={};us.forEach(u=>sc[u]=(a[u]||0)+((b[u]||0)-(a[u]||0))*f);frames.push([t0+(t1-t0)*f,sc]);}}
  if(keys.length)frames.push(keys[keys.length-1]);
  const max=Math.max(1,...frames.flatMap(f=>Object.values(f[1])))*1.08;const t0=d.start||(keys[0]&&keys[0][0])||0;
  const race=document.getElementById("race"),clock=document.getElementById("clock"),seek=document.getElementById("seek"),play=document.getElementById("play");
  seek.max=frames.length-1;const rows={};let i=0,playing=true;
  function draw(){const[t,sc]=frames[i];const top=Object.entries(sc).filter(([,v])=>v>0).sort((x,y)=>y[1]-x[1]||x[0].localeCompare(y[0])).slice(0,8);
    const seen=new Set();top.forEach(([u,v],pos)=>{seen.add(u);let r=rows[u];if(!r){r=document.createElement("div");r.className="r";r.innerHTML='<div class="b"></div><span class="n"></span><span class="s"></span>';race.appendChild(r);rows[u]=r;}
      r.style.display="flex";r.style.transform="translateY("+(pos*44)+"px)";const b=r.children[0];b.style.width=(v/max*85)+"%";b.style.background=podiumColor[u.toLowerCase()]||"var(--bar)";
      r.children[1].textContent=u;r.children[2].textContent=Math.round(v);});
    Object.keys(rows).forEach(u=>{if(!seen.has(u))rows[u].style.display="none"});
    const el=Math.max(0,Math.round(t-t0));const h=Math.floor(el/3600),m=Math.floor(el%3600/60);clock.textContent=(h?h+"h ":"")+String(m).padStart(h?2:1,"0")+" min";seek.value=i;}
  function tick(){if(playing&&i<frames.length-1){i++;draw();}setTimeout(tick,90);}
  play.onclick=()=>{playing=!playing;play.textContent=playing?"⏸ Pause":"▶ Play";};
  document.getElementById("restart").onclick=()=>{i=0;playing=true;play.textContent="⏸ Pause";draw();};
  seek.oninput=()=>{i=+seek.value;draw();};
  document.getElementById("podium").innerHTML=d.final.filter(e=>e.rank<=3).map(e=>"<div>"+MEDAL[e.rank-1]+" <b></b> · "+e.score+" pts</div>").join("");
  document.querySelectorAll("#podium b").forEach((b,k)=>b.textContent=d.final.filter(e=>e.rank<=3)[k].hr_display);
  if(frames.length){draw();tick();}
}).catch(()=>{document.getElementById("sub").textContent="This replay isn't available.";});
</script></body></html>`;
}
