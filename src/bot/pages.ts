// Public pages served by the bot Worker:
//   /u/:key      a student's portfolio (only if they chose to share it: /portfolio link)
//   /cert/:token an end-of-season certificate (signed link; print or save as PDF)
import type { Env, GuildRow } from "../shared/types.ts";
import { one } from "../shared/db.ts";
import { t } from "../shared/i18n.ts";
import { certData, profileUrl, readCert } from "../shared/share.ts";
import { portfolioData } from "../shared/portfolio.ts";
import { portfolioHtml } from "./portfoliopage.ts";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const html = (body: string, status = 200) => new Response(body, {
  status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", "referrer-policy": "no-referrer" },
});
const notFound = (msg: string) => html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ClassBot</title><body style="font:16px system-ui;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px;background:#f5f8ff;color:#0f172a"><p>${esc(msg)}</p></body>`, 404);

const CSS = `
:root{--bg:#f5f8ff;--card:#fff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--blue:#2563eb;--blue2:#6366f1;--soft:#eef4ff;--good:#15803d;--warn:#b45309;--bad:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--card:#111a2e;--ink:#e5ecff;--muted:#94a3b8;--line:#22304d;--soft:#16223d;--good:#4ade80;--warn:#fbbf24;--bad:#f87171}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:880px;margin:0 auto;padding:24px 16px 48px}
.hero{background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;border-radius:18px;padding:24px;display:flex;gap:18px;align-items:center;flex-wrap:wrap}
.av{width:72px;height:72px;border-radius:50%;background:#ffffff2e;display:grid;place-items:center;font-size:28px;font-weight:800;flex:none}
.hero h1{margin:0;font-size:26px;line-height:1.2}.hero p{margin:2px 0 0;opacity:.9}
.bar{height:8px;background:#ffffff3a;border-radius:9px;overflow:hidden;margin-top:10px;max-width:320px}.bar i{display:block;height:100%;background:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:16px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}
.stat b{display:block;font-size:22px}.stat span{color:var(--muted);font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin-top:16px}
.card h2{margin:0 0 10px;font-size:16px}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{background:var(--soft);border-radius:99px;padding:4px 12px;font-size:13px}
.chip.star{background:linear-gradient(135deg,#fde68a,#fbbf24);color:#422006;font-weight:700}
.motto{font-style:italic;opacity:.95;margin-top:6px!important}.pin{display:flex;gap:10px;align-items:center;font-size:15px}
.sk{display:grid;grid-template-columns:minmax(120px,200px) 1fr 44px;gap:10px;align-items:center;margin:6px 0;font-size:14px}
.sk .t{height:8px;border-radius:9px;background:var(--soft);overflow:hidden}.sk .t i{display:block;height:100%;background:var(--blue)}
.sk .strong i{background:var(--good)}.sk .weak i{background:var(--bad)}
ul.r{list-style:none;margin:0;padding:0}ul.r li{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid var(--line);font-size:14px}ul.r li:first-child{border-top:0}
.muted{color:var(--muted)}.d-easy{color:var(--good)}.d-medium{color:var(--warn)}.d-hard{color:var(--bad)}
footer{margin-top:24px;text-align:center;color:var(--muted);font-size:13px}
@media (max-width:520px){.sk{grid-template-columns:110px 1fr 40px}.hero h1{font-size:22px}}`;

const initials = (n: string) => n.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export async function profilePage(env: Env, key: string): Promise<Response> {
  if (!/^[a-z0-9]{8,32}$/.test(key)) return notFound("This profile isn't shared.");
  const p = await one<{ guild_id: string; discord_id: string }>(env, "SELECT guild_id, discord_id FROM players WHERE share_key = ?", key);
  if (!p) return notFound("This profile isn't shared (anymore).");
  const g = await one<GuildRow>(env, "SELECT * FROM guilds WHERE id = ?", p.guild_id);
  const d = g ? await portfolioData(env, g, p.discord_id) : null;
  if (!d || !g) return notFound("This profile isn't shared.");
  // the student's portfolio: what they show companies
  return html(portfolioHtml(d, g, profileUrl(env, key)));
}

export async function certPage(env: Env, token: string): Promise<Response> {
  const c = await readCert(env, token);
  if (!c) return notFound("This certificate link is not valid.");
  const d = await certData(env, c.guildId, c.uid, c.season);
  if (!d) return notFound("This certificate link is not valid.");
  const L = d.L, T = (k: string, v: Record<string, string | number> = {}) => esc(t(L, k, v));
  const date = new Date(d.issued * 1000).toLocaleDateString(L === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  return html(`<!doctype html><html lang="${L}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${T("cert.title")} · ${esc(d.name)} · ${esc(d.season)}</title>
<style>
@page{size:A4 landscape;margin:0}
*{box-sizing:border-box}body{margin:0;background:#e9eef8;font:16px/1.45 Georgia,"Times New Roman",serif;color:#0f172a}
.tools{display:flex;gap:10px;justify-content:center;padding:16px;font-family:system-ui,sans-serif}
.tools button{border:0;border-radius:10px;padding:10px 18px;background:#2563eb;color:#fff;font:600 15px system-ui;cursor:pointer}
.tools button:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}
.page{width:min(297mm,100%);aspect-ratio:297/210;margin:0 auto 24px;background:#fff;position:relative;padding:5%;box-shadow:0 10px 30px #0f172a22;overflow:hidden}
.frame{position:absolute;inset:3%;border:3px solid #1e3a8a;outline:1px solid #93c5fd;outline-offset:-10px;border-radius:6px;pointer-events:none}
.in{position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:1.2vmin}
.k{letter-spacing:.3em;text-transform:uppercase;color:#1e3a8a;font:700 clamp(10px,1.5vw,14px) system-ui,sans-serif}
h1{margin:0;font-size:clamp(22px,4.4vw,46px);color:#1e3a8a}
.name{font-size:clamp(24px,4.8vw,52px);font-style:italic;border-bottom:2px solid #cbd5e1;padding:0 4% .2em;margin:.2em 0}
.lead{max-width:80%;font-size:clamp(12px,1.7vw,18px)}
.row{display:flex;gap:6%;justify-content:center;flex-wrap:wrap;margin-top:1vmin;width:100%}
.row div{min-width:18%}.row b{display:block;font-size:clamp(18px,3vw,32px);color:#1e3a8a}.row span{font:clamp(10px,1.2vw,13px) system-ui,sans-serif;color:#475569}
.small{font:clamp(10px,1.2vw,13px) system-ui,sans-serif;color:#475569;max-width:85%}
.sign{display:flex;justify-content:space-between;width:80%;margin-top:3vmin;font:clamp(10px,1.2vw,13px) system-ui,sans-serif;color:#475569}
.sign div{border-top:1px solid #94a3b8;padding-top:.4em;min-width:30%}
.seal{position:absolute;right:7%;top:8%;width:12%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,#fbbf24,#d97706);display:grid;place-items:center;color:#fff;font:800 clamp(10px,1.6vw,16px) system-ui;box-shadow:0 0 0 4px #fde68a}
.draft{position:absolute;inset:0;display:grid;place-items:center;font:800 clamp(40px,10vw,120px) system-ui;color:#2563eb12;transform:rotate(-18deg);pointer-events:none}
@media print{body{background:#fff}.tools{display:none}.page{width:297mm;height:210mm;box-shadow:none;margin:0}}
</style></head><body>
<div class="tools"><button onclick="window.print()">🖨️ ${T("cert.print")}</button></div>
<main class="page"><div class="frame"></div>${d.current ? `<div class="draft" aria-hidden="true">${T("cert.in_progress")}</div>` : ""}
<div class="in">
<div class="k">${esc(d.className || "ClassBot")} · ${T("cert.season", { season: d.season })}</div>
<h1>${T("cert.title")}</h1>
<div class="lead">${T("cert.awarded")}</div>
<div class="name">${esc(d.name)}</div>
<div class="lead">${T("cert.for", { season: d.season })}</div>
<div class="row">
${d.rank ? `<div><b>#${esc(d.rank)}</b><span>${T("cert.rank", { n: d.size })}</span></div>` : ""}
<div><b>${esc(d.points)}</b><span>${T("cert.points")}</span></div>
<div><b>${esc(d.solved)}</b><span>${T("cert.solved")}</span></div>
${d.badges.length ? `<div><b>${esc(d.badges.length)}</b><span>${T("cert.badges")}</span></div>` : ""}
</div>
${d.skills.length ? `<div class="small">${T("cert.skills")}: ${d.skills.map(esc).join(" · ")}</div>` : ""}
${d.badges.length ? `<div class="small">${d.badges.slice(0, 8).map(esc).join(" · ")}</div>` : ""}
<div class="sign"><div>${esc(date)}</div><div>${T("cert.teacher")}</div></div>
</div>${d.rank && d.rank <= 3 ? `<div class="seal">TOP ${esc(d.rank)}</div>` : ""}</main>
</body></html>`);
}
