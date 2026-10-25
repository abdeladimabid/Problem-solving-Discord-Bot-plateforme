"use strict";
// « Suivi VS Code »: how long each learner really codes, from their VS Code (the WakaTime extension pointed at ClassBot
// with /vscode setup, after their consent). Today (refreshed live), the week (heatmap), the squads of a brief, one
// learner (sessions, files, commits, signals « à vérifier »), the CSV. Settings → VS Code tracking: vscodeSettings().
// Temps actif: they were in VS Code (typing, moving between files, reading). Temps d'écriture: the file changed.
/* global $, $$, api, esc, toast, busy, view, avatar, table, barChart, hbars, icon, routes, S */
const vsStore = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* this visit only */ } } };
const VS = { period: vsStore.get("vsPeriod") || "day", date: null, squad: "", q: "", data: null, timer: null, brief: null };
const VS_TZ = "Africa/Casablanca";
const vsToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: VS_TZ }).format(new Date());
const vsAdd = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const vsMonday = (d) => vsAdd(d, -((new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7));
const vsDur = (s) => { if (!s) return "—"; const m = Math.round(s / 60); return m < 1 ? "<1 min" : m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`; };
const vsMin = (s) => Math.round((s || 0) / 60);
const vsTime = (t) => (t ? new Date(t * 1000).toLocaleTimeString([], { timeZone: VS_TZ, hour: "2-digit", minute: "2-digit" }) : "—");
const vsDayLabel = (d, o = { weekday: "short", day: "numeric", month: "short" }) => new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { ...o, timeZone: "UTC" });
const VS_STATE = { coding: 0, idle: 1, waiting: 2, paused: 3, none: 4 };
const vsLines = (r) => (r.lineData ? `<span title="Lines changed by an AI / by the learner (net line changes sent by the extension)"><b>${r.ai}</b> AI / <b>${r.hu}</b></span>` : `<span class="muted" title="The extension sent no line changes for this day">n/a</span>`);
window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#/vscode")) { clearInterval(VS.timer); VS.timer = null; } });

/** The status dot and its words. */
function vsStatus(r, today) {
  if (r.status === "coding") return `<span class="vs-st coding"><i></i>Coding now</span>`;
  if (r.status === "paused") return `<span class="vs-st paused"><i></i>Paused</span>`;
  if (r.status === "none") return `<span class="vs-st none"><i></i>Not connected</span>`;
  if (r.status === "waiting") return `<span class="vs-st none" title="They accepted and got their key: nothing received yet (setup not finished?)"><i></i>Waiting for VS Code</span>`;
  if (!r.active) return `<span class="vs-st idle"><i></i>${r.lastDay ? `Last activity ${esc(vsDayLabel(r.lastDay))}` : "No activity"}</span>`;
  return `<span class="vs-st idle"><i></i>${today ? `Idle since ${esc(vsTime(r.last))}` : "Done for the day"}</span>`;
}

/** 08:00 → 18:00, one bar per hour: active (light) and writing (strong) minutes. */
function vsTimeline(hours) {
  if (!hours) return `<span class="muted small">—</span>`;
  const outside = hours.some(([a], h) => a > 0 && (h < 8 || h >= 18));
  return `<span class="vs-tl" aria-label="Hour by hour, 08:00 to 18:00">${hours.slice(8, 18).map(([a, w], i) =>
    `<i title="${String(i + 8).padStart(2, "0")}:00 · ${vsMin(a)} min active · ${vsMin(w)} min writing" style="--a:${Math.min(1, a / 3600)};--w:${Math.min(1, w / 3600)}"></i>`).join("")}${outside ? `<b class="vs-out" title="Activity before 08:00 or after 18:00">+</b>` : ""}</span>`;
}

async function viewVscode(arg) {
  if (!VS.date || arg === "today") VS.date = vsToday();
  if (["day", "week", "squads"].includes(arg)) VS.period = arg;
  clearInterval(VS.timer); VS.timer = null;
  view.innerHTML = `
    <div class="page-head"><div><h1>VS Code tracking</h1><p class="sub">How long each learner really codes in VS Code, from their WakaTime extension (set up with <code>/vscode setup</code>, after their consent). <b>Active time</b>: they were in VS Code (typing, moving between files, reading). <b>Writing time</b>: the file changed. Moroccan time.</p></div>
      <div class="toolbar" style="margin:0"><a class="btn" href="#/settings/vscode">${icon("gear")} Settings</a></div></div>
    <div class="toolbar vs-bar">
      <div class="seg" role="group" aria-label="Period">
        <button data-p="day" aria-pressed="${VS.period === "day"}">Today</button><button data-p="week" aria-pressed="${VS.period === "week"}">Week</button><button data-p="squads" aria-pressed="${VS.period === "squads"}">Squads</button>
      </div>
      <span class="vs-date" ${VS.period === "squads" ? "hidden" : ""}>
        <button class="icon-btn" id="vs-prev" aria-label="Previous" title="Previous"><svg class="i" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button>
        <input type="date" id="vs-date" value="${esc(VS.date)}" max="${esc(vsToday())}" aria-label="Day">
        <button class="icon-btn" id="vs-next" aria-label="Next" title="Next"><svg class="i" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>
        <button class="btn small" id="vs-now">Today</button>
      </span>
      <select id="vs-squad" aria-label="Squad" ${VS.period === "squads" ? "hidden" : ""}><option value="">All squads</option></select>
      <input type="search" id="vs-q" placeholder="Search a learner" value="${esc(VS.q)}" ${VS.period === "squads" ? "hidden" : ""}>
      <a class="btn" id="vs-csv" ${VS.period === "squads" ? "hidden" : ""}>${icon("download")} Export CSV</a>
    </div>
    <div id="vs-body"><p class="muted">Loading…</p></div>`;
  $$("[data-p]").forEach((b) => b.onclick = () => { VS.period = b.dataset.p; vsStore.set("vsPeriod", VS.period); viewVscode(); });
  const step = VS.period === "week" ? 7 : 1;
  $("#vs-prev").onclick = () => { VS.date = vsAdd(VS.date, -step); viewVscode(); };
  $("#vs-next").onclick = () => { const d = vsAdd(VS.date, step); VS.date = d > vsToday() ? vsToday() : d; viewVscode(); };
  $("#vs-now").onclick = () => { VS.date = vsToday(); viewVscode(); };
  $("#vs-date").onchange = (e) => { if (e.target.value) { VS.date = e.target.value; viewVscode(); } };
  $("#vs-q").oninput = (e) => { VS.q = e.target.value; vsRender(); };
  $("#vs-squad").onchange = (e) => { VS.squad = e.target.value; vsRender(); };
  $("#vs-csv").href = `/api/vscode/export.csv?period=${VS.period === "week" ? "week" : "day"}&date=${encodeURIComponent(VS.date)}&g=${encodeURIComponent(S.g)}`;
  if (VS.period === "squads") return vsSquads();
  VS.data = await api(`/vscode/${VS.period}?date=${encodeURIComponent(VS.date)}`);
  const sq = $("#vs-squad");
  sq.innerHTML = `<option value="">All squads</option>${(VS.data.squads || []).map((s) => `<option ${s.name === VS.squad ? "selected" : ""}>${esc(s.name)}</option>`).join("")}`;
  if (!(VS.data.squads || []).length) sq.hidden = true;
  vsRender();
  // today: the table follows by itself (no reload), every 45 s while the page is shown
  if (VS.period === "day" && VS.data.today) VS.timer = setInterval(async () => {
    if (!location.hash.startsWith("#/vscode") || VS.period !== "day" || document.hidden) return;
    try {
      const d = await api(`/vscode/day?date=${encodeURIComponent(VS.date)}&live=1`);
      const last = new Map((VS.data.rows || []).map((r) => [r.id, r.lastDay]));
      d.rows.forEach((r) => { r.lastDay = last.get(r.id) ?? r.lastDay; });
      VS.data = d; vsRender(true);
    } catch { /* keep the last view */ }
  }, 45000);
}

const vsMatch = (r) => (!VS.squad || r.squad === VS.squad) && (!VS.q || String(r.name).toLowerCase().includes(VS.q.toLowerCase()));

function vsRender(live = false) {
  const box = $("#vs-body");
  if (!box || !VS.data) return;
  if (VS.period === "week") return vsWeek(box);
  const d = VS.data, rows = d.rows.filter(vsMatch).map((r) => ({ ...r, rank: VS_STATE[r.status] ?? 5 }));
  const c = d.cards;
  const scroll = live ? window.scrollY : null;
  box.innerHTML = `
    ${d.settings.enabled ? "" : `<div class="notice warn" style="margin-bottom:14px">Tracking is <b>off</b> for this class: heartbeats are answered but not kept. <a href="#/settings/vscode">Turn it on</a></div>`}
    <div class="figures vs-figs">
      <div class="figure"><div class="ico">🔌</div><div><b>${c.connected}<small>/${c.students}</small></b><span>learners connected</span></div></div>
      <div class="figure${c.codingNow ? " vs-live" : ""}"><div class="ico">🟢</div><div><b>${d.today ? c.codingNow : "—"}</b><span>coding now</span></div></div>
      <div class="figure"><div class="ico">✍️</div><div><b>${esc(vsDur(c.write))}</b><span>writing time of the class</span></div></div>
      <div class="figure${c.idleToday ? " cs-attn" : ""}"><div class="ico">😴</div><div><b>${c.idleToday}</b><span>connected, no activity ${d.today ? "today" : "that day"}</span></div></div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><h2>${d.today ? "Today" : esc(vsDayLabel(d.day, { weekday: "long", day: "numeric", month: "long" }))}</h2>
        <span class="muted small">${d.today ? `refreshed every 45 s · ${esc(vsTime(Date.now() / 1000))}` : ""}</span></div>
      ${table([
        { label: "Learner", sort: "name", html: (r) => `<span class="vs-who">${avatar(r.name, r.id)}<span><b>${esc(r.name)}</b>${r.squad ? `<small class="muted">${esc(r.squad)}</small>` : ""}</span></span>` },
        { label: "Status", sort: "rank", html: (r) => vsStatus(r, d.today) },
        { label: "Active", sort: "active", num: true, html: (r) => esc(vsDur(r.active)) },
        { label: "Writing", sort: "write", num: true, html: (r) => `<b>${esc(vsDur(r.write))}</b>` },
        { label: "First", sort: "first", num: true, html: (r) => esc(vsTime(r.first)) },
        { label: "Last", sort: "last", num: true, html: (r) => esc(vsTime(r.last)) },
        { label: "Now on", html: (r) => (r.cur && r.active ? `<span class="vs-cur" title="${esc([r.cur.p, r.cur.f, r.editor].filter(Boolean).join(" · "))}"><b>${esc(r.cur.p || "(no project)")}</b>${r.cur.f ? `<small>${esc(r.cur.f)}</small>` : ""}</span>` : `<span class="muted">—</span>`) },
        { label: "08:00 → 18:00", html: (r) => vsTimeline(r.hours) },
        { label: "AI / own lines", html: vsLines },
      ], rows, { sort: { key: "rank", asc: true }, onRow: (r) => vsDrawer(r.id), empty: "No learner in this class yet." })}
      <p class="muted small vs-legend"><span class="vs-tl"><i style="--a:.8;--w:0"></i></span> active <span class="vs-tl"><i style="--a:.8;--w:.8"></i></span> writing · a gap longer than ${d.settings.idle} min counts 0${d.settings.window.on ? ` · counted ${esc(d.settings.window.from)}–${esc(d.settings.window.to)}${d.settings.window.weekdays ? ", Monday → Friday" : ""}` : ""}</p>
    </div>
    ${vsNotConnected(d)}`;
  vsWireNotConnected(box, d);
  if (scroll != null) window.scrollTo({ top: scroll });
}

function vsNotConnected(d) {
  const list = d.notConnected.filter(vsMatch);
  if (!list.length) return "";
  const why = { none: "hasn't run /vscode setup", waiting: "accepted, nothing received yet", paused: "paused" };
  return `<div class="panel" style="margin-top:14px"><div class="panel-head"><h2>Not connected yet <span class="pill">${list.length}</span></h2>
      <button class="btn small" id="vs-remind">Send the setup reminder (DM)</button></div>
    <p class="muted small" style="margin-top:0">They get a DM asking them to run <code>/vscode setup</code>: they read what is recorded and choose. Nothing is tracked without their « J'accepte ».</p>
    <div class="vs-nc">${list.map((r) => `<label class="vs-ncw"><input type="checkbox" value="${esc(r.id)}" ${r.status === "paused" ? "" : "checked"}>${avatar(r.name, r.id)}<span><b>${esc(r.name)}</b><small class="muted">${esc(why[r.status] || "")}</small></span></label>`).join("")}</div></div>`;
}
function vsWireNotConnected(box) {
  const b = $("#vs-remind", box);
  if (b) b.onclick = () => busy(b, async () => {
    const ids = $$(".vs-nc input:checked", box).map((i) => i.value);
    if (!ids.length) return toast("Tick at least one learner.", true);
    const r = await api("/vscode/remind", { method: "POST", body: { ids, date: VS.date } });
    toast(r.failed ? `Reminder sent to ${r.sent} · ${r.failed} with closed DMs` : `Reminder sent to ${r.sent}`);
  });
}

// --------------------------------------------------------------------- week
function vsWeek(box) {
  const w = VS.data, learners = w.learners.filter(vsMatch);
  const n = w.weekend ? 7 : 5, days = w.days.slice(0, n);
  const max = Math.max(1, ...learners.flatMap((l) => l.cells.slice(0, n).map((c) => c[1])));
  const heat = (s) => (s ? `color-mix(in srgb, var(--blue) ${Math.round(14 + (86 * s) / max)}%, var(--surface))` : "var(--surface-2)");
  const trendPct = (now, before) => (before ? Math.round(((now - before) / before) * 100) : null);
  const tr = (now, before) => { const p = trendPct(now, before); return p == null ? `<span class="muted small">new</span>` : `<span class="delta ${p > 0 ? "up" : p < 0 ? "down" : "flat"}" title="Writing time vs the week before">${p > 0 ? "▲" : p < 0 ? "▼" : "•"} ${Math.abs(p)}%</span>`; };
  const tot = w.totals, best = days.reduce((b, d, i) => (w.perDay[i][1] > (w.perDay[b]?.[1] ?? -1) ? i : b), 0);
  const zero = learners.filter((l) => !l.write).length;
  const labels = days.map((d) => vsDayLabel(d, { weekday: "short", day: "numeric" }));
  box.innerHTML = `
    <div class="figures vs-figs">
      <div class="figure"><div class="ico">✍️</div><div><b>${esc(vsDur(tot.write))}</b><span>writing time this week</span></div>${tot.prevWrite ? tr(tot.write, tot.prevWrite) : ""}</div>
      <div class="figure"><div class="ico">⌨️</div><div><b>${esc(vsDur(tot.active))}</b><span>active time this week</span></div></div>
      <div class="figure"><div class="ico">📅</div><div><b>${w.perDay[best]?.[1] ? esc(vsDayLabel(days[best], { weekday: "long" })) : "—"}</b><span>most writing</span></div></div>
      <div class="figure${zero ? " cs-attn" : ""}"><div class="ico">😶</div><div><b>${zero}</b><span>no writing time this week</span></div></div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><h2>Week of ${esc(vsDayLabel(w.monday, { day: "numeric", month: "long" }))}</h2><span class="muted small">colour = writing time · hover a cell for the details</span></div>
      <div class="table-wrap"><table class="vs-heat">
        <thead><tr><th>Learner</th>${days.map((d) => `<th class="num">${esc(vsDayLabel(d, { weekday: "short", day: "numeric" }))}</th>`).join("")}<th class="num">Writing</th><th class="num">Active</th><th class="num">vs last week</th></tr></thead>
        <tbody>${learners.map((l) => `<tr class="clickable" tabindex="0" data-id="${esc(l.id)}">
          <td><span class="vs-who">${avatar(l.name, l.id)}<span><b>${esc(l.name)}</b>${l.squad ? `<small class="muted">${esc(l.squad)}</small>` : ""}</span></span></td>
          ${l.cells.slice(0, n).map(([a, wr], i) => `<td class="vs-cell" style="background:${heat(wr)}" title="${esc(vsDayLabel(days[i]))} · ${vsMin(a)} min active · ${vsMin(wr)} min writing"><span>${wr ? vsMin(wr) : a ? "·" : ""}</span></td>`).join("")}
          <td class="num"><b>${esc(vsDur(l.write))}</b></td><td class="num">${esc(vsDur(l.active))}</td><td class="num">${l.write || l.prevWrite ? tr(l.write, l.prevWrite) : `<span class="muted">—</span>`}</td></tr>`).join("")}</tbody>
        <tfoot><tr><th>Class</th>${days.map((_, i) => `<th class="num">${vsMin(w.perDay[i][1])}</th>`).join("")}<th class="num">${esc(vsDur(tot.write))}</th><th class="num">${esc(vsDur(tot.active))}</th><th class="num">${tr(tot.write, tot.prevWrite)}</th></tr></tfoot>
      </table>${learners.length ? "" : `<p class="empty">No learner here.</p>`}</div>
      <p class="muted small">Numbers are minutes of writing time; « · » = active without writing.</p>
    </div>
    <div class="panel" style="margin-top:14px"><div class="panel-head"><h2>The class per day</h2><span class="muted small">minutes</span></div>
      ${barChart(labels, [{ name: "Writing", values: days.map((_, i) => vsMin(w.perDay[i][1])), color: "var(--s1)" }, { name: "Other active time", values: days.map((_, i) => vsMin(w.perDay[i][0] - w.perDay[i][1])), color: "var(--s2)" }], { every: 1, height: 200 })}</div>`;
  $$("tr[data-id]", box).forEach((tr2) => { tr2.onclick = () => vsDrawer(tr2.dataset.id); tr2.onkeydown = (e) => { if (e.key === "Enter") vsDrawer(tr2.dataset.id); }; });
}

// ------------------------------------------------------------------- squads
async function vsSquads() {
  const box = $("#vs-body");
  const d = await api(`/vscode/squads${VS.brief ? `?brief=${VS.brief}` : ""}`);
  if (!d.briefs.length) { box.innerHTML = `<div class="panel"><p class="empty">No squad brief yet. A brief whose work is « groupe » or « binôme » shows here: who worked how long, and on which files of the squad's repo.</p></div>`; return; }
  const v = d.view;
  box.innerHTML = `
    <div class="toolbar"><label for="vs-brief" class="small" style="margin:0">Brief</label>
      <select id="vs-brief">${d.briefs.map((b) => `<option value="${b.id}" ${v && b.id === v.brief.id ? "selected" : ""}>${esc(b.title)}</option>`).join("")}</select>
      ${v ? `<span class="muted small">${esc(vsDayLabel(v.from))} → ${esc(vsDayLabel(v.to))} · time on the squad's repo (project of the same name)</span>` : ""}</div>
    <div class="stack">${v ? v.squads.map((s) => {
      const tot = s.members.reduce((n, m) => n + m.onProject.write, 0);
      return `<div class="panel"><div class="panel-head"><h2>${esc(s.name)}</h2>${s.repo ? `<a class="small" href="https://github.com/${esc(s.repo)}" target="_blank" rel="noopener noreferrer">${esc(s.repo)}</a>` : `<span class="muted small">no repo handed in yet: only the total time</span>`}</div>
        ${table([
          { label: "Member", html: (m) => `<span class="vs-who">${avatar(m.name, m.id)}<b>${esc(m.name)}</b></span>` },
          { label: "On the repo · writing", num: true, sort: "pw", html: (m) => `<b>${esc(vsDur(m.onProject.write))}</b>${tot ? ` <span class="muted small">${Math.round((100 * m.onProject.write) / tot)}%</span>` : ""}` },
          { label: "On the repo · active", num: true, html: (m) => esc(vsDur(m.onProject.active)) },
          { label: "All VS Code · writing", num: true, html: (m) => esc(vsDur(m.write)) },
          { label: "AI / own lines", html: vsLines },
        ], s.members.map((m) => ({ ...m, pw: m.onProject.write })), { sort: { key: "pw" }, onRow: (m) => vsDrawer(m.id, VS.date) })}
        ${s.files.length ? `<details style="margin-top:10px"><summary class="small"><b>Who worked on which file</b> (${s.files.length})</summary>
          <div class="table-wrap"><table class="vs-heat"><thead><tr><th>File</th>${s.members.map((m) => `<th class="num">${esc(m.name)}</th>`).join("")}</tr></thead>
          <tbody>${s.files.map((f) => { const mx = Math.max(1, ...Object.values(f.by).map((x) => x[1])); return `<tr><td><code>${esc(f.file)}</code></td>${s.members.map((m) => { const x = f.by[m.id]; return `<td class="vs-cell num" style="background:${x?.[1] ? `color-mix(in srgb, var(--blue) ${Math.round(14 + (70 * x[1]) / mx)}%, var(--surface))` : "transparent"}" title="${x ? `${vsMin(x[0])} min active · ${vsMin(x[1])} min writing` : ""}">${x ? `${vsMin(x[1])}` : ""}</td>`; }).join("")}</tr>`; }).join("")}</tbody></table></div>
          <p class="muted small">Minutes of writing time per file; hover for the active time.</p></details>` : ""}</div>`;
    }).join("") : ""}</div>`;
  $("#vs-brief").onchange = (e) => { VS.brief = Number(e.target.value); vsSquads(); };
}

// --------------------------------------------------------------- one learner
const VS_SIG = {
  commit_little_writing: (s) => `${s.n} lines committed on <b>${esc(s.project)}</b>, with ${s.minutes} min of writing time on it that day`,
  long_no_commit: (s) => `${s.minutes} min on <code>${esc(s.file || "a file")}</code> (${esc(s.project || "no project")}) and no commit on it that day: stuck?`,
  big_insert: (s) => `${s.n} lines added at once in <code>${esc(s.file || "a file")}</code> at ${esc(vsTime(s.t))} (pasted or generated?)`,
  ai_share: (s) => `${s.pct}% of the lines changed that day came from an AI (${s.n} lines)`,
};
function vsDayChart(a, commits) {
  const ses = a.sessions || [];
  const first = ses.length ? Math.min(...ses.map((s) => s[0])) : null, last = ses.length ? Math.max(...ses.map((s) => s[1])) : null;
  const hourOf = (t) => Number(new Date(t * 1000).toLocaleTimeString("en-GB", { timeZone: VS_TZ, hour: "2-digit", hourCycle: "h23" }));
  const h0 = Math.min(8, first ? hourOf(first) : 8), h1 = Math.max(18, last ? hourOf(last) + 1 : 18);
  const W = 640, H = 100, pad = 8, span = h1 - h0;
  const maxW = Math.max(60, ...(a.hours || []).map((x) => x[1]));   // the writing bars: the day's busiest hour = full height
  const x = (t) => { const p = new Date(t * 1000).toLocaleTimeString("en-GB", { timeZone: VS_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":").map(Number); return pad + ((W - 2 * pad) * (p[0] + p[1] / 60 - h0)) / span; };
  let svg = "";
  for (let h = h0; h <= h1; h++) { const xx = pad + ((W - 2 * pad) * (h - h0)) / span; svg += `<line class="gridline" x1="${xx}" x2="${xx}" y1="16" y2="78"/>${(h - h0) % 2 === 0 ? `<text class="axis" x="${xx}" y="94" text-anchor="middle">${String(h).padStart(2, "0")}h</text>` : ""}`; }
  for (const [s, e, ac, wr] of ses) svg += `<rect x="${x(s)}" y="20" width="${Math.max(2, x(e) - x(s))}" height="16" rx="4" fill="var(--s2)"><title>${vsTime(s)} → ${vsTime(e)} · ${vsMin(ac)} min active · ${vsMin(wr)} min writing</title></rect>`;
  (a.hours || []).forEach(([ac, wr], h) => { if (!wr || h < h0 || h >= h1) return; const xx = pad + ((W - 2 * pad) * (h - h0)) / span, ww = (W - 2 * pad) / span; const hh = Math.max(2, (34 * wr) / maxW); svg += `<rect x="${xx + 1}" y="${76 - hh}" width="${ww - 2}" height="${hh}" rx="2" fill="var(--s1)"><title>${String(h).padStart(2, "0")}:00 · ${vsMin(wr)} min writing · ${vsMin(ac)} min active</title></rect>`; });
  for (const c of commits) svg += `<path d="M${x(c.t)} 8 l5 7 h-10z" fill="var(--up)"><title>${vsTime(c.t)} · commit${c.repo ? ` on ${esc(c.repo)}` : ""} · +${c.adds ?? 0} −${c.dels ?? 0} · ${esc(c.title || "")}</title></path>`;
  return `<div class="chart vs-day"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sessions of the day">${svg}</svg>
    <div class="legend"><span><i style="background:var(--s2)"></i>Sessions (active)</span><span><i style="background:var(--s1)"></i>Writing per hour</span><span><i style="background:var(--up)"></i>Commits</span></div></div>`;
}

let vsDlg = null;
async function vsDrawer(id, day = VS.date) {
  if (!vsDlg) {
    vsDlg = document.createElement("dialog");
    vsDlg.className = "vs-drawer";
    document.body.append(vsDlg);
    vsDlg.addEventListener("click", (e) => { if (e.target === vsDlg) vsDlg.close(); });
  }
  vsDlg.innerHTML = `<div class="vs-dh"><h2>…</h2><button class="btn small" data-close>Close</button></div><div class="vs-db"><p class="muted">Loading…</p></div>`;
  $("[data-close]", vsDlg).onclick = () => vsDlg.close();
  if (!vsDlg.open) vsDlg.showModal();
  let L;
  try { L = await api(`/vscode/learner/${encodeURIComponent(id)}?date=${encodeURIComponent(day || vsToday())}`); } catch (e) { $(".vs-db", vsDlg).innerHTML = `<div class="notice danger">${esc(e.message)}</div>`; return; }
  const a = L.agg, ses = a.sessions || [];
  const gaps = ses.slice(1).map((s, i) => s[0] - ses[i][1]);
  const totLang = a.langs.reduce((n, x) => n + x[1], 0) || 1;
  $(".vs-dh", vsDlg).innerHTML = `<span class="vs-who">${avatar(L.name, L.id)}<span><h2 style="margin:0">${esc(L.name)}</h2><small class="muted">${esc(vsDayLabel(L.day, { weekday: "long", day: "numeric", month: "long" }))}${L.learner?.paused ? " · paused" : ""}${L.learner && !L.learner.connected ? " · not connected yet" : ""}</small></span></span>
    <span class="toolbar" style="margin:0"><a class="btn small" href="#/student/${esc(L.id)}">Profile</a><button class="btn small" data-close>Close</button></span>`;
  $$("[data-close]", vsDlg).forEach((b) => b.onclick = () => vsDlg.close());
  $(".vs-db", vsDlg).innerHTML = `
    <div class="vs-kpis">
      <div><b>${esc(vsDur(a.active))}</b><span>active</span></div><div><b>${esc(vsDur(a.write))}</b><span>writing</span></div>
      <div><b>${a.first ? `${esc(vsTime(a.first))} → ${esc(vsTime(a.last))}` : "—"}</b><span>first → last</span></div><div><b>${ses.length}</b><span>sessions</span></div>
      <div>${a.lineData ? `<b>${a.ai} / ${a.hu}</b><span>AI / own lines</span>` : `<b class="muted">n/a</b><span>AI / own lines</span>`}</div>
    </div>
    ${a.active ? vsDayChart(a, L.commits) : `<p class="empty">No activity this day.</p>`}
    ${ses.length ? `<details class="vs-ses"><summary class="small"><b>Sessions</b> (a gap longer than ${L.settings.idle} min starts a new one)</summary><ul class="small">${ses.map((s, i) => `<li><b>${esc(vsTime(s[0]))} → ${esc(vsTime(s[1]))}</b> · ${vsMin(s[2])} min active · ${vsMin(s[3])} min writing</li>${gaps[i] != null ? `<li class="muted">— gap ${vsMin(gaps[i])} min —</li>` : ""}`).join("")}</ul></details>` : ""}
    <h3>To check</h3>
    ${L.signals.length ? `<ul class="vs-sig">${L.signals.map((s) => `<li><span class="tag">à vérifier</span> <span class="muted small">${esc(vsDayLabel(s.day))}</span> ${(VS_SIG[s.kind] || (() => esc(s.kind)))(s)}</li>`).join("")}</ul>
      <p class="muted small">Clues to talk about with the learner, never proof: they may code in another editor, pair with a classmate, or paste their own code.</p>` : `<p class="muted small">Nothing to check this week.</p>`}
    <div class="grid cols-2-even">
      <div><h3>Projects</h3>${hbars(a.projects.slice(0, 6).map(([p, ac, wr]) => ({ label: esc(p || "(no project)"), parts: [{ name: "Writing", value: vsMin(wr), color: "var(--s1)" }, { name: "Other active", value: vsMin(ac - wr), color: "var(--s2)" }] })))}</div>
      <div><h3>Languages</h3>${a.langs.length ? `<div class="chips">${a.langs.slice(0, 8).map(([l, ac]) => `<span class="tag">${esc(l)} ${Math.round((100 * ac) / totLang)}%</span>`).join("")}</div>` : `<p class="muted small">—</p>`}
        ${a.editors?.length ? `<p class="muted small">Editor: ${a.editors.map(([e]) => esc(e)).join(", ")}</p>` : ""}</div>
    </div>
    <h3>Files</h3>
    ${L.settings.files ? (a.files.length ? table([
      { label: "File", html: (f) => `<code>${esc(f[1])}</code>` }, { label: "Project", html: (f) => esc(f[0] || "—") }, { label: "Language", html: (f) => esc(f[2] || "—") },
      { label: "Active", num: true, html: (f) => esc(vsDur(f[3])) }, { label: "Writing", num: true, html: (f) => esc(vsDur(f[4])) },
    ], a.files.slice(0, 12)) : `<p class="muted small">No file this day (or the learner hides the file names).</p>`) : `<p class="muted small">File names aren't stored for this class (Settings → VS Code tracking).</p>`}
    <h3>The week</h3>
    ${barChart(L.week.map((w) => vsDayLabel(w.day, { weekday: "short" })), [{ name: "Writing", values: L.week.map((w) => vsMin(w.write)), color: "var(--s1)" }, { name: "Other active time", values: L.week.map((w) => vsMin(w.active - w.write)), color: "var(--s2)" }], { every: 1, height: 150 })}
    <h3>Commits that day</h3>
    ${L.commits.length ? `<ul class="vs-commits small">${L.commits.map((c) => `<li><b>${esc(vsTime(c.t))}</b> · ${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.repo || "commit")}</a>` : esc(c.repo || "commit")} · <span class="up">+${c.adds ?? 0}</span> <span class="down">−${c.dels ?? 0}</span> · ${esc(c.title || "")}</li>`).join("")}</ul>` : `<p class="muted small">No commit that day (or GitHub isn't connected).</p>`}`;
}

// ------------------------------------------------------------------ settings
/** Settings → VS Code tracking (called by the Settings page when its tab opens). */
async function vscodeSettings(root) {
  const d = await api("/vscode/settings");
  const s = d.settings;
  root.innerHTML = `
    <div class="panel set-card"><h3>For the class</h3>
      <label class="check"><input type="checkbox" id="vs-on" ${s.enabled ? "checked" : ""}> Tracking on <span class="muted">(each learner still chooses with <code>/vscode setup</code>; off: heartbeats are answered but not kept)</span></label>
      <div class="field-row">
        <div><label for="vs-idle">Idle limit (minutes)</label><input type="number" id="vs-idle" min="1" max="30" value="${s.idle}"><p class="muted small">A longer gap between two heartbeats counts 0 (VS Code open, nobody working). 60 s are added after the last heartbeat of a session.</p></div>
        <div><label for="vs-ret">Keep the details (days)</label><input type="number" id="vs-ret" min="7" max="90" value="${s.retention}"><p class="muted small">Then only the totals per day stay (they are kept).</p></div>
      </div>
      <label class="check"><input type="checkbox" id="vs-files" ${s.files ? "checked" : ""}> Store the file names <span class="muted">(off: the project and the language only)</span></label>
    </div>
    <div class="panel set-card"><h3>Time window <span class="muted small">(optional)</span></h3>
      <label class="check"><input type="checkbox" id="vs-win" ${s.window.on ? "checked" : ""}> Only count this time of day (Moroccan time)</label>
      <div class="toolbar" style="margin:6px 0"><input type="time" class="vs-time" id="vs-from" value="${esc(s.window.from)}" aria-label="From"> → <input type="time" class="vs-time" id="vs-to" value="${esc(s.window.to)}" aria-label="To">
        <label class="check" style="margin:0"><input type="checkbox" id="vs-wd" ${s.window.weekdays ? "checked" : ""}> Monday → Friday only</label></div>
    </div>
    <div class="panel set-card"><h3>What the learners read before saying yes</h3>
      <textarea id="vs-consent" rows="9" placeholder="${esc(d.consentDefault)}">${esc(s.consent)}</textarea>
      <p class="muted small">Empty = the default text (shown greyed). <code>{retention}</code> becomes the number of days. Changing it asks the learners to read it again (<code>/vscode status</code>), without stopping their tracking.</p>
    </div>
    <div class="panel set-card"><h3>Address for VS Code</h3>
      ${d.apiUrl ? `<div class="toolbar" style="margin:0"><code id="vs-url">${esc(d.apiUrl)}</code><button class="btn small" id="vs-copy">Copy</button></div><p class="muted small">Sent to each learner with their key, as <code>api_url</code>.</p>` : `<div class="notice warn">PUBLIC_URL isn't set (wrangler.bot.jsonc and wrangler.admin.jsonc): learners can't get their setup.</div>`}
      <p style="margin:10px 0 0"><button class="btn" id="vs-check">Run checks</button></p><div id="vs-check-out"></div>
    </div>
    <div class="set-foot"><button class="btn primary" id="vs-save">Save</button></div>`;
  const c = $("#vs-copy", root);
  if (c) c.onclick = () => navigator.clipboard.writeText(d.apiUrl).then(() => toast("Copied"));
  $("#vs-save", root).onclick = (e) => busy(e.currentTarget, async () => {
    await api("/vscode/settings", { method: "PUT", body: {
      enabled: $("#vs-on", root).checked, idle: Number($("#vs-idle", root).value), retention: Number($("#vs-ret", root).value), files: $("#vs-files", root).checked,
      window: { on: $("#vs-win", root).checked, from: $("#vs-from", root).value, to: $("#vs-to", root).value, weekdays: $("#vs-wd", root).checked },
      consent: $("#vs-consent", root).value,
    } });
    toast("Saved: the new activity follows these settings");
    vscodeSettings(root);
  });
  $("#vs-check", root).onclick = (e) => busy(e.currentTarget, async () => {
    const r = await api("/vscode/check", { method: "POST", body: {} });
    $("#vs-check-out", root).innerHTML = `<ul class="vs-checks">${r.steps.map((x) => `<li class="${x.ok === true ? "up" : x.ok === false ? "down" : "warn"}">${x.ok === true ? "✅" : x.ok === false ? "❌" : "⚠️"} <b>${esc(x.name)}</b> <span class="muted small">${esc(x.detail)}</span></li>`).join("")}</ul>
      <p class="muted small">The test heartbeats were deleted.</p>`;
  });
}

Object.assign(routes, { vscode: viewVscode });
