/* ClassBot dashboard: the Watcher part (from GitHub Watcher), its own pages next to the others:
   Overview (class register, who needs attention, briefs in progress), Students (activity, filters, a brief filter,
   each student's panel) and Sprints (the sprint review). It reads what the other pages already use (/github,
   /github/activity, /briefs) plus /sprints, and changes nothing else. Loaded after learning.js (it uses its helpers). */
"use strict";

(() => {
  const st = document.createElement("style");
  st.textContent = `
.w-figs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.w-fig { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-m); padding: 14px 16px; box-shadow: var(--shadow-s); }
.w-fig b { display: block; font-size: 28px; line-height: 1.15; } .w-fig span { color: var(--ink-soft); font-size: 13px; } .w-fig.alert b { color: var(--down); }
@media (max-width: 820px) { .w-figs { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.w-cols { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
@media (max-width: 1020px) { .w-cols { grid-template-columns: minmax(0, 1fr); } }
.w-reg td, .w-reg th { padding: 4px 6px; white-space: nowrap; } .w-reg .w-name { max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
.w-cell { display: inline-block; width: 16px; height: 16px; border-radius: 4px; background: var(--line); vertical-align: middle; }
.w-cell.l1 { background: color-mix(in srgb, var(--blue) 25%, var(--surface)); } .w-cell.l2 { background: color-mix(in srgb, var(--blue) 50%, var(--surface)); }
.w-cell.l3 { background: color-mix(in srgb, var(--blue) 75%, var(--surface)); } .w-cell.l4 { background: var(--blue); }
.w-cell.hollow { background: transparent; border: 2px solid var(--ink-faint); } .w-cell.we { opacity: .45; }
.w-bar { display: inline-block; height: 6px; border-radius: 3px; background: var(--blue); vertical-align: middle; }
.w-att li { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); list-style: none; }
.w-att { padding: 0; margin: 0; } .w-att li:last-child { border-bottom: 0; }
.w-strip { display: inline-flex; gap: 2px; vertical-align: middle; } .w-strip .w-cell { width: 10px; height: 10px; border-radius: 2px; }
.w-row { cursor: pointer; } .w-row:hover td { background: var(--surface-2, var(--bg)); }
.w-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.w-chip { border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-soft); border-radius: 999px; padding: 4px 12px; font: inherit; font-size: 13px; cursor: pointer; }
.w-chip[aria-pressed="true"] { background: var(--blue); border-color: var(--blue); color: #fff; }
.w-chip small { opacity: .75; margin-left: 4px; }
.w-up { color: var(--up); font-weight: 600; } .w-down { color: var(--down); font-weight: 600; }
.w-drawer { position: fixed; inset: 0; z-index: 60; } .w-drawer[hidden] { display: none; }
.w-scrim { position: absolute; inset: 0; background: rgba(5, 10, 20, .45); }
.w-panel { position: absolute; top: 0; right: 0; bottom: 0; width: min(720px, 100%); background: var(--surface); border-left: 1px solid var(--line); overflow-y: auto; padding: 20px 22px 40px; box-shadow: var(--shadow-m); }
.w-mini { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); margin: 14px 0; }
.w-mini div { padding: 10px 12px; border-left: 1px solid var(--line); } .w-mini div:first-child { border-left: 0; }
.w-mini b { display: block; font-size: 22px; } .w-mini span { font-size: 12px; color: var(--ink-soft); }
.w-brief-cell { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.sp-table td, .sp-table th { white-space: nowrap; }
.sp-table td:first-child, .sp-table th:first-child { position: sticky; left: 0; background: var(--surface); z-index: 1; }
.sp-decs { display: flex; align-items: center; gap: 4px; } .sp-decs input { width: 140px; }
.sp-dec { width: 30px; height: 30px; border-radius: 999px; border: 1.5px solid var(--line-strong); background: transparent; color: var(--ink-soft); cursor: pointer; font: inherit; padding: 0; }
.sp-dec.ok.prop { border: 1.5px dashed var(--up); color: var(--up); } .sp-dec.ko.prop { border: 1.5px dashed var(--down); color: var(--down); }
.sp-dec.ok.on { background: var(--up); border-color: var(--up); color: #fff; } .sp-dec.ko.on { background: var(--down); border-color: var(--down); color: #fff; }
.sp-dec.note { opacity: .5; } .sp-dec.note.has { opacity: 1; border-color: var(--blue); }
.sp-sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.sp-box { display: flex; flex-direction: column; gap: 2px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-s); } .sp-box b { font-size: 22px; }`;
  document.head.append(st);
})();

// ----------------------------------------------------------------- the class's activity, in Watcher's numbers
// days: [real commits, lines, PRs, other actions, tiny, huge (flagged), vague]; score = commits + PRs + other actions
const W_STATE = { regSort: "active", filter: "all", q: "", sort: "active", brief: "", bstat: "all" };
async function watchData() {
  const [G, A, B] = await Promise.all([api("/github"), api("/github/activity"), api("/briefs")]);
  const N = A.days.length, W0 = Math.max(0, N - 7);
  const inactive = G.cfg?.inactiveDays || 3;
  const tot = (day, from, to) => {
    const t = { real: 0, lines: 0, prs: 0, other: 0, tiny: 0, huge: 0, vague: 0, score: 0, active: 0 };
    for (let i = from; i < to; i++) { const x = day[i]; for (const k of ["real", "lines", "prs", "other", "tiny", "huge", "vague", "score"]) t[k] += x[k]; if (x.any) t.active++; }
    return t;
  };
  const students = A.students.map((s) => {
    const day = s.days.map((a) => { const x = { real: a[0], lines: a[1], prs: a[2], other: a[3], tiny: a[4], huge: a[5], vague: a[6] }; x.score = x.real + x.prs + x.other; x.any = x.score + x.tiny + x.huge > 0; return x; });
    const st = { ...s, display: s.name || s.login, day, week: tot(day, W0, N), prev: tot(day, 0, W0), all: tot(day, 0, N) };
    st.trend = st.week.score - st.prev.score;
    st.reasons = [];
    if (s.idle >= inactive) st.reasons.push([`No activity for ${s.idle} working days`, `Idle ${s.idle} d`]);
    if (st.week.huge) st.reasons.push([`${st.week.huge} huge commit(s) this week`, `${st.week.huge} huge`]);
    if (st.week.tiny >= 3) st.reasons.push([`${st.week.tiny} tiny commits this week`, `${st.week.tiny} tiny`]);
    if (st.week.vague >= 3) st.reasons.push([`${st.week.vague} unclear commit messages this week`, `${st.week.vague} unclear`]);
    if (st.prev.score >= 4 && st.week.score <= st.prev.score / 2) st.reasons.push([`Score dropped from ${st.prev.score} to ${st.week.score}`, `Score ${st.prev.score} → ${st.week.score}`]);
    return st;
  });
  const briefs = (B.items || []).filter((b) => b.status === "assigned").sort((a, b) => (b.due_at || 0) - (a.due_at || 0));
  return { G, A, N, W0, inactive, students, briefs };
}
const wLevel = (x) => (x.score === 0 ? 0 : x.score === 1 ? 1 : x.score <= 3 ? 2 : x.score <= 6 ? 3 : 4);
const wCell = (x, day) => `<i class="w-cell l${wLevel(x)} ${x.score === 0 && x.any ? "hollow" : ""} ${[0, 6].includes(new Date(day + "T12:00:00Z").getUTCDay()) ? "we" : ""}" title="${esc(day)}: ${x.real} commit(s), ${x.lines} line(s), ${x.prs} PR(s)${x.tiny ? `, ${x.tiny} tiny` : ""}${x.huge ? `, ${x.huge} huge` : ""}"></i>`;
const wTrend = (t) => (t > 0 ? `<span class="w-up">+${t}</span>` : t < 0 ? `<span class="w-down">−${-t}</span>` : `<span class="muted">=</span>`);
const wLast = (s) => (s.last ? fmtAgo(s.last) : "No activity yet");
const W_SORTS = {
  active: (a, b) => b.week.score - a.week.score || b.week.lines - a.week.lines || a.display.localeCompare(b.display),
  least: (a, b) => a.week.score - b.week.score || b.idle - a.idle || a.display.localeCompare(b.display),
  recent: (a, b) => (b.last || 0) - (a.last || 0) || a.display.localeCompare(b.display),
  lines: (a, b) => b.week.lines - a.week.lines || a.display.localeCompare(b.display),
  name: (a, b) => a.display.localeCompare(b.display),
};

// ================================================================= Overview: the class at a glance
async function viewWatch() {
  const D = await watchData();
  const total = D.students.length, today = D.N - 1;
  const worked = D.students.filter((s) => s.day[today]?.any).length;
  const active7 = D.students.filter((s) => s.week.active > 0).length;
  const c7 = D.students.reduce((n, s) => n + s.week.real, 0), cPrev = D.students.reduce((n, s) => n + s.prev.real, 0);
  const pct = cPrev ? Math.round(((c7 - cPrev) / cPrev) * 100) : null;
  const attention = D.students.filter((s) => s.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length || b.idle - a.idle);
  const nowS = Date.now() / 1000;
  const live = D.briefs.filter((b) => b.due_at && b.due_at > nowS - 3 * 86400).slice(0, 4);
  const details = await Promise.all(live.map((b) => api(`/briefs/${b.id}`).catch(() => null)));
  const sorts = { active: W_SORTS.active, least: W_SORTS.least, name: W_SORTS.name };
  const list = D.students.slice().sort(sorts[W_STATE.regSort] || sorts.active);
  const maxScore = Math.max(1, ...D.students.map((s) => s.week.score));
  view.innerHTML = `
    <div class="page-head"><div><h1>Watcher</h1><p class="sub">GitHub activity of the class, last 14 days.</p></div></div>
    <div class="w-figs">
      <div class="w-fig"><b>${worked}</b><span>worked today · of ${total}</span></div>
      <div class="w-fig"><b>${active7}</b><span>active in the last 7 days</span></div>
      <div class="w-fig"><b>${c7}</b><span>commits in 7 days${pct == null ? "" : ` · ${pct >= 0 ? "+" : ""}${pct}% vs the week before`}</span></div>
      <div class="w-fig ${attention.length ? "alert" : ""}"><b>${attention.length}</b><span>need your attention</span></div>
    </div>
    <div class="w-cols">
      <section class="panel"><div class="panel-head"><h2>Class register</h2>${segHtml("wreg", [["active", "Most active"], ["least", "Least active"], ["name", "A–Z"]], W_STATE.regSort)}</div>
        ${total ? `<div class="table-wrap"><table class="w-reg"><thead><tr><th></th>${D.A.days.map((d) => `<th class="ctr small muted">${esc(new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "narrow" }))}<br>${Number(d.slice(8))}</th>`).join("")}<th>Score 7 d</th></tr></thead>
          <tbody>${list.map((s) => `<tr class="w-row" data-ws="${esc(s.discord_id)}"><td class="w-name">${s.reasons.length ? "🔴 " : ""}${esc(s.display)}</td>
            ${s.day.map((x, i) => `<td class="ctr">${wCell(x, D.A.days[i])}</td>`).join("")}
            <td><b>${s.week.score}</b> <span class="w-bar" style="width:${Math.round((60 * s.week.score) / maxScore)}px"></span></td></tr>`).join("")}</tbody></table></div>`
          : `<p class="empty">Nobody linked GitHub yet: students type <code>/github</code> in Discord.</p>`}
      </section>
      <div class="stack">
        <section class="panel"><h2>Need your attention ${attention.length ? `<span class="muted">${attention.length}</span>` : ""}</h2>
          ${attention.length ? `<ul class="w-att">${attention.slice(0, 8).map((s) => `<li class="w-row" data-ws="${esc(s.discord_id)}" title="${esc(s.reasons.map((r) => r[0]).join("\n"))}"><span>${esc(s.display)}</span><span class="small muted">${esc(s.reasons.map((r) => r[1]).join(" · "))}</span></li>`).join("")}</ul>
            ${attention.length > 8 ? `<p><a href="#/watch-students" data-attn>Show all ${attention.length}</a></p>` : ""}` : `<p class="muted small">Nobody right now.</p>`}
        </section>
        <section class="panel"><div class="panel-head"><h2>Briefs</h2><a class="small" href="#/briefs">Manage</a></div>
          ${live.length ? live.map((b, i) => {
            const B = details[i], st = B ? B.students : [];
            const on = st.filter((s) => s.push === "on").length, late = st.filter((s) => s.push === "late").length, n = st.length || 1;
            const passed = b.due_at <= nowS;
            return `<div style="margin:10px 0"><div class="panel-head" style="margin:0"><a href="#/brief/${b.id}"><b>${esc(b.title)}</b></a><span class="small muted">${dueIn(b.due_at)}</span></div>
              <p class="toolbar" style="margin:4px 0"><button class="btn small" data-wann="${b.id}">📣 Announce</button><button class="btn small" data-wstat="${b.id}">Post status</button></p>
              ${meter(Math.round((100 * (on + late)) / n), "pushed")}
              <span class="small muted">${passed ? `${on} on time, ${late} late, ${st.length - on - late} nothing` : `${on + late} of ${st.length} pushed`}</span></div>`;
          }).join("") : `<p class="muted small">No brief in progress.</p>`}
        </section>
      </div>
    </div>`;
  wireSeg(view, "wreg", (v) => { W_STATE.regSort = v; viewWatch(); });
  wireBriefButtons(view);
  $$("[data-ws]", view).forEach((el) => el.onclick = () => openWatchStudent(D, el.dataset.ws));
  const all = $("[data-attn]", view);
  if (all) all.onclick = () => { W_STATE.filter = "attention"; };
}

// the brief's announcement (in French) and status, posted in Discord
function wireBriefButtons(root) {
  $$("[data-wann]", root).forEach((b) => b.onclick = () => confirmDialog("Announce this brief in Discord?", "In French: dates, steps, squads and how to hand in.", "Announce",
    async () => { await api(`/briefs/${b.dataset.wann}/watcher/announce`, { method: "POST", body: {} }); toast("Announced in Discord"); }));
  $$("[data-wstat]", root).forEach((b) => b.onclick = () => busy(b, async () => {
    const r = await api(`/briefs/${b.dataset.wstat}/watcher/status`, { method: "POST", body: {} });
    toast(`Status posted: ${r.on + r.late} pushed, ${r.none} not yet`);
  }));
}

// ================================================================= Students: activity, filters, the brief filter
const W_FILTERS = [["all", "All", () => true], ["active", "Active this week", (s) => s.week.active > 0], ["idle", "Idle", (s, D) => s.idle >= D.inactive], ["attention", "Need attention", (s) => s.reasons.length > 0]];
async function viewWatchStudents() {
  const D = await watchData();
  if (W_STATE.brief && !D.briefs.some((b) => String(b.id) === String(W_STATE.brief))) W_STATE.brief = "";
  const BD = W_STATE.brief ? await api(`/briefs/${W_STATE.brief}`).catch(() => null) : null;
  // a brief chosen: the numbers cover its days (inside the 14 days), and its hand-ins / pushes / squads
  let win = null;
  if (BD) {
    const b = BD.brief, start = new Date((b.start_at || b.created_at) * 1000).toISOString().slice(0, 10), end = new Date((b.due_at || Date.now() / 1000) * 1000).toISOString().slice(0, 10);
    let from = D.A.days.findIndex((d) => d >= start); if (from < 0) from = D.N;
    let to = D.A.days.findIndex((d) => d > end); if (to < 0) to = D.N;
    win = { from, to: Math.max(from, to) };
  }
  const briefOf = (s) => {
    const x = BD.students.find((y) => y.discord_id === s.discord_id) || {};
    const sq = BD.kind === "squad" ? BD.squadRows.find((q) => q.members.map(String).includes(s.discord_id)) || null : null;
    return { sq, handin: sq ? sq.handin : x.handin, push: x.push || "none", review: sq ? sq.review : x.review, who: sq ? `s:${sq.id}` : `u:${s.discord_id}` };
  };
  const passed = BD && BD.brief.due_at && BD.brief.due_at <= Date.now() / 1000;
  const BSTAT = BD ? [["all", "Everyone", () => true], ["in", "Handed in", (b) => !!b.handin], ["out", "Not handed in", (b) => !b.handin],
    ["nopush", passed ? "Nothing pushed" : "Not pushed yet", (b) => b.push === "none"], ["late", "Late", (b) => b.push === "late"],
    ...(BD.kind === "squad" ? BD.squadRows.map((q) => ["sq:" + q.id, "Squad: " + q.name, (b) => b.sq && b.sq.id === q.id]) : [])] : [];
  if (BD && !BSTAT.some((x) => x[0] === W_STATE.bstat)) W_STATE.bstat = "all";
  const rowsOf = () => {
    const f = (W_FILTERS.find((x) => x[0] === W_STATE.filter) || W_FILTERS[0])[2];
    const q = W_STATE.q.trim().toLowerCase();
    const bf = BD ? (BSTAT.find((x) => x[0] === W_STATE.bstat) || BSTAT[0])[2] : null;
    return D.students.map((s) => {
      if (!win) return s;
      const t = { real: 0, lines: 0, prs: 0, other: 0, tiny: 0, huge: 0, vague: 0, score: 0, active: 0 };
      for (let i = win.from; i < win.to; i++) { const x = s.day[i]; for (const k of Object.keys(t)) if (k !== "active") t[k] += x[k]; if (x.any) t.active++; }
      return { ...s, week: t, trend: null };
    }).filter((s) => f(s, D) && (!q || `${s.display} ${s.login}`.toLowerCase().includes(q)) && (!bf || bf(briefOf(s)))).sort(W_SORTS[W_STATE.sort] || W_SORTS.active);
  };
  const notStarted = win && win.to <= win.from;
  view.innerHTML = `
    <div class="page-head"><div><h1>Students</h1><p class="sub">${D.students.length} linked. ${!BD ? "Numbers cover the last 7 days." : notStarted ? `${esc(BD.brief.data.title)} has not started yet.` : `Numbers cover ${esc(BD.brief.data.title)} since ${fmtDate(BD.brief.start_at || BD.brief.created_at)}.`}</p></div></div>
    <section class="panel">
      <div class="toolbar" style="margin:0 0 10px"><input type="search" id="w-q" placeholder="Search by name" value="${esc(W_STATE.q)}" style="max-width:240px">
        <div class="w-chips" id="w-chips"></div>
        <select id="w-sort">${[["active", "Most active"], ["least", "Least active"], ["recent", "Last active"], ["lines", "Most lines"], ["name", "Name"]].map(([v, l]) => `<option value="${v}" ${W_STATE.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="toolbar" style="margin:0"><b class="small">Brief</b><select id="w-brief"><option value="">All briefs</option>${D.briefs.map((b) => `<option value="${b.id}" ${String(b.id) === String(W_STATE.brief) ? "selected" : ""}>${esc(b.title)}</option>`).join("")}</select>
        ${BD ? `<button class="btn small" data-wann="${BD.brief.id}">📣 Announce</button><button class="btn small" data-wstat="${BD.brief.id}">Post status</button>` : ""}
        ${BD ? `<select id="w-bstat">${BSTAT.map(([v, l, f]) => `<option value="${v}" ${v === W_STATE.bstat ? "selected" : ""}>${esc(l)} (${D.students.filter((s) => f(briefOf(s))).length})</option>`).join("")}</select>` : ""}</div>
    </section>
    <section class="panel"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Student</th>${BD ? "<th>Brief</th>" : ""}<th class="num">Score</th>${BD ? "" : `<th class="num">Trend</th>`}<th class="num">Commits</th><th class="num">Lines</th><th class="num">PRs</th><th>Active days</th><th>Last active</th><th>Warnings</th></tr></thead>
      <tbody id="w-rows"></tbody></table></div></section>`;
  const draw = () => {
    $("#w-chips").innerHTML = W_FILTERS.map(([v, l, f]) => `<button type="button" class="w-chip" data-wf="${v}" aria-pressed="${W_STATE.filter === v}">${l}<small>${D.students.filter((s) => f(s, D)).length}</small></button>`).join("");
    $$("[data-wf]").forEach((b) => b.onclick = () => { W_STATE.filter = b.dataset.wf; draw(); });
    const rows = rowsOf();
    $("#w-rows").innerHTML = rows.length ? rows.map((s) => {
      const b = BD ? briefOf(s) : null;
      const pushTxt = b ? (b.push === "on" ? (passed ? "On time" : "Pushed") : b.push === "late" ? "Late" : passed ? "Nothing pushed" : "Not yet") : "";
      const warn = [s.week.tiny ? `<span class="lvl bad">${s.week.tiny} tiny</span>` : "", s.week.huge ? `<span class="lvl bad">${s.week.huge} huge</span>` : "", s.week.vague ? `<span class="lvl bad">${s.week.vague} unclear</span>` : ""].filter(Boolean).join(" ");
      const strip = (win ? s.day.slice(win.from, win.to) : s.day.slice(D.W0)).map((x, i) => wCell(x, D.A.days[(win ? win.from : D.W0) + i])).join("");
      return `<tr class="w-row" data-ws="${esc(s.discord_id)}"><td>${s.reasons.length ? "🔴 " : ""}${avatar(s.display, s.discord_id)} <b>${esc(s.display)}</b> <span class="small muted">@${esc(s.login || "")}</span></td>
        ${b ? `<td><div class="w-brief-cell">${b.sq ? `<b>${esc(b.sq.name)}${b.sq.sm === s.discord_id ? " · SM" : ""}</b>` : ""}<span>${b.handin ? "✔ " + esc(String(b.handin.repo).split("/").pop()) : `<span class="muted">Not handed in</span>`}</span><span class="lvl ${b.push === "on" ? "ok" : b.push === "late" ? "warn" : "bad"}">${pushTxt}</span></div></td>` : ""}
        <td class="num"><b>${notStarted ? "–" : s.week.score}</b></td>${BD ? "" : `<td class="num">${wTrend(s.trend)}</td>`}
        <td class="num">${notStarted ? "–" : s.week.real}</td><td class="num">${notStarted ? "–" : s.week.lines}</td><td class="num">${notStarted ? "–" : s.week.prs}</td>
        <td>${notStarted ? `<span class="muted small">Not started</span>` : `<span class="w-strip">${strip}</span> <span class="small muted">${s.week.active}/${win ? win.to - win.from : 7}</span>`}</td>
        <td class="small muted">${wLast(s)}</td><td>${warn}</td></tr>`;
    }).join("") : `<tr><td colspan="10" class="empty">No students match.</td></tr>`;
    $$("[data-ws]", $("#w-rows")).forEach((tr) => tr.onclick = () => openWatchStudent(D, tr.dataset.ws));
  };
  draw();
  $("#w-q").oninput = (e) => { W_STATE.q = e.target.value; draw(); };
  $("#w-sort").onchange = (e) => { W_STATE.sort = e.target.value; draw(); };
  $("#w-brief").onchange = (e) => { W_STATE.brief = e.target.value; W_STATE.bstat = "all"; viewWatchStudents(); };
  if ($("#w-bstat")) $("#w-bstat").onchange = (e) => { W_STATE.bstat = e.target.value; draw(); };
  wireBriefButtons(view);
}

// ================================================================= one student's panel
const W_BRIEFS = new Map();
async function openWatchStudent(D, id) {
  const s = D.students.find((x) => x.discord_id === id);
  if (!s) return;
  let box = $("#w-drawer");
  if (!box) {
    box = document.createElement("div");
    box.id = "w-drawer"; box.className = "w-drawer"; box.hidden = true;
    box.innerHTML = `<div class="w-scrim"></div><div class="w-panel" role="dialog" aria-modal="true" aria-label="Student"></div>`;
    document.body.append(box);
    const close = () => { box.hidden = true; };
    $(".w-scrim", box).onclick = close;
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    window.addEventListener("hashchange", close);
  }
  box.hidden = false;
  const panel = $(".w-panel", box);
  panel.innerHTML = `<p class="muted">Loading…</p>`;
  // the briefs of the last weeks (each read once per page visit)
  const nowS = Date.now() / 1000;
  const recent = D.briefs.filter((b) => !b.due_at || b.due_at > nowS - 45 * 86400).slice(0, 8);
  const det = await Promise.all(recent.map((b) => W_BRIEFS.get(b.id) || api(`/briefs/${b.id}`).then((x) => { W_BRIEFS.set(b.id, x); return x; }).catch(() => null)));
  const briefRows = recent.map((b, i) => {
    const B = det[i];
    if (!B) return "";
    const x = B.students.find((y) => y.discord_id === id) || {};
    const sq = B.kind === "squad" ? B.squadRows.find((q) => q.members.map(String).includes(id)) : null;
    const handin = sq ? sq.handin : x.handin, review = sq ? sq.review : x.review, who = sq ? `s:${sq.id}` : `u:${id}`;
    const passed = b.due_at && b.due_at <= nowS;
    const push = x.push === "on" ? (passed ? "On time" : "Pushed") : x.push === "late" ? "Late" : passed ? "Nothing pushed" : "Not yet";
    return `<tr><td><a href="#/brief/${b.id}">${esc(b.title)}</a>${sq ? ` <span class="small muted">· ${esc(sq.name)}</span>` : ""}</td>
      <td><span class="lvl ${x.push === "on" ? "ok" : x.push === "late" ? "warn" : "bad"}">${push}</span></td>
      <td class="small">${handin ? `<a href="https://github.com/${esc(handin.repo)}" target="_blank" rel="noopener">${esc(String(handin.repo).split("/").pop())}</a>` : `<span class="muted">—</span>`}</td>
      <td><a class="btn small" href="#/debrief/${b.id}~${encodeURIComponent(who)}">${review ? (review.status === "final" ? "✅ Debrief" : "Debrief") : "Debrief"}</a></td></tr>`;
  }).join("");
  const labels = D.A.days.map((d) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`);
  panel.innerHTML = `
    <div class="panel-head"><div><h2 style="margin:0">${avatar(s.display, s.discord_id)} ${esc(s.display)}</h2>
      <p class="small muted" style="margin:4px 0 0"><a href="https://github.com/${esc(s.login || "")}" target="_blank" rel="noopener">@${esc(s.login || "")}</a> · last activity ${wLast(s)} · <a href="#/student/${esc(id)}">full student page</a></p></div>
      <button class="btn small" id="w-close" aria-label="Close">✕</button></div>
    ${s.reasons.length ? `<div class="notice warn"><b>Needs your attention</b><ul class="small" style="margin:6px 0 0">${s.reasons.map((r) => `<li>${esc(r[0])}</li>`).join("")}</ul></div>` : ""}
    <div class="w-mini"><div><b>${s.all.score}</b><span>Score</span></div><div><b>${s.all.real}</b><span>Commits</span></div><div><b>${s.all.lines}</b><span>Lines</span></div><div><b>${s.all.active}/${D.N}</b><span>Active days</span></div></div>
    ${barChart(labels, [{ name: "Score", values: s.day.map((x) => x.score), color: "var(--blue)" }, { name: "Not scored (tiny / huge)", values: s.day.map((x) => x.tiny + x.huge), color: "var(--line-strong)" }], { height: 170, every: 2 })}
    ${briefRows ? `<h3>Briefs</h3><div class="table-wrap"><table class="grid-table"><tbody>${briefRows}</tbody></table></div>` : ""}
    <details style="margin-top:12px"><summary><b>Repos</b> <span class="muted small">${s.repos.length}</span></summary>
      <ul class="small">${s.repos.map(([r, n]) => `<li><a href="https://github.com/${esc(r)}" target="_blank" rel="noopener">${esc(r)}</a> <span class="muted">· ${n} action(s)</span></li>`).join("") || `<li class="muted">No repo activity yet.</li>`}</ul></details>
    <details><summary><b>Day by day</b></summary><div class="table-wrap"><table class="grid-table"><thead><tr><th>Day</th><th class="num">Score</th><th class="num">Commits</th><th class="num">Lines</th><th class="num">PRs</th><th class="num">Other</th><th class="num">Tiny</th><th class="num">Huge</th><th class="num">Unclear</th></tr></thead>
      <tbody>${s.day.map((x, i) => `<tr><td>${esc(D.A.days[i])}</td><td class="num"><b>${x.score}</b></td><td class="num">${x.real}</td><td class="num">${x.lines}</td><td class="num">${x.prs}</td><td class="num">${x.other}</td><td class="num">${x.tiny || ""}</td><td class="num">${x.huge || ""}</td><td class="num">${x.vague || ""}</td></tr>`).reverse().join("")}</tbody></table></div></details>`;
  $("#w-close", panel).onclick = () => { box.hidden = true; };
}

// =========================================================== sprints (the sprint review)
// Each student in a sprint of the programme: competencies reached, level (proposed, then yours), decision, note;
// the count per level for the administration's report, and one comment for the whole sprint.
const SP_LVL = [["excellent", "Excellent"], ["bon", "Bon"], ["moyen", "Moyen"], ["faible", "Faible"], ["critique", "Critique"]];
const SP_LVL_NAME = Object.fromEntries(SP_LVL);
let SPR = null;

async function viewSprints(arg) {
  const O = await api("/sprints");
  if (!O.sprints.length) {
    view.innerHTML = `<div class="page-head"><div><h1>Sprints</h1></div></div><section class="panel"><p class="empty">The programme has no sprints. Settings → Programme.</p></section>`;
    return;
  }
  const n = arg === "year" ? null : Number(arg) || O.current || O.sprints[0].n;
  view.innerHTML = `<div class="page-head"><div><h1>Sprints</h1><p class="sub">Levels and decisions for the sprint review.</p></div>
      <div class="toolbar" style="margin:0"><select id="sp-sel">${O.sprints.map((s) => `<option value="${s.n}" ${s.n === n ? "selected" : ""}>Sprint ${s.n} · ${esc(s.title)}</option>`).join("")}
        <option value="year" ${n === null ? "selected" : ""}>All sprints (the year)</option></select></div></div>
    <div id="sp-body"></div>`;
  $("#sp-sel").onchange = (e) => { location.hash = `#/sprints/${e.target.value}`; };
  if (n === null) return sprintYear(O);
  SPR = { D: await api(`/sprints/${n}`), n, filter: "all", sort: "name" };
  renderSprint();
}

function spCell(c) {
  if (!c || c.r === "none") return `<td class="ctr muted">—</td>`;
  const cls = c.r === "ok" ? "ok" : c.r === "low" ? "warn" : "bad";
  return `<td class="ctr"><span class="lvl ${cls}">${c.r === "ok" ? "✓" : "✗"} N${c.level || 1}</span></td>`;
}

function renderSprint() {
  const { D } = SPR;
  const codes = D.sprint.codes, tech = codes.filter((c) => !/^T/.test(c)), soft = codes.filter((c) => /^T/.test(c));
  const lvlOf = (r) => r.level || r.plevel;
  const FILTERS = [["all", "Everyone"], ["ko", "Not validated"], ["weak", "Faible / Critique"], ["open", "No decision"]];
  const keep = { all: () => true, ko: (r) => (r.decision || r.prop) === "non_valide", weak: (r) => ["faible", "critique"].includes(lvlOf(r)), open: (r) => !r.decision };
  const rank = (r) => { const i = SP_LVL.findIndex(([v]) => v === lvlOf(r)); return i < 0 ? 9 : i; };
  const SORT = { name: (a, b) => a.name.localeCompare(b.name), level: (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name), most: (a, b) => b.ok - a.ok || a.name.localeCompare(b.name) };
  const rows = D.rows.filter(keep[SPR.filter]).sort(SORT[SPR.sort]);
  const ctCell = (r) => {
    const cs = soft.map((c) => r.cells[c]), ok = cs.filter((c) => c.r === "ok").length, seen = cs.filter((c) => c.r !== "none").length;
    const cls = ok === cs.length ? "ok" : cs.some((c) => c.r === "ko") ? "bad" : "warn";
    return `<td class="ctr" title="${esc(soft.map((c) => cText(c) + " " + (r.cells[c].r === "ok" ? "✓" : r.cells[c].r === "none" ? "—" : "✗")).join("\n"))}">${seen ? `<span class="lvl ${cls}">${ok}/${cs.length}</span>` : `<span class="muted">—</span>`}</td>`;
  };
  const dec = (r) => ["valide", "non_valide"].map((v) => {
    const on = r.decision === v, prop = !r.decision && r.prop === v;
    return `<button type="button" class="sp-dec ${v === "valide" ? "ok" : "ko"} ${on ? "on" : ""} ${prop ? "prop" : ""}" data-dec="${v}" title="${v === "valide" ? "Validated" : "Not validated"}${prop ? " (proposed)" : ""}">${v === "valide" ? "✓" : "✗"}</button>`;
  }).join("");
  const sum = SP_LVL.map(([v, l]) => { const list = D.rows.filter((r) => lvlOf(r) === v); return { v, l, list }; });
  view.querySelector("#sp-body").innerHTML = `
    <section class="panel"><div class="panel-head"><h2>Sprint ${D.sprint.n} · ${esc(D.sprint.title)}</h2><span class="muted small">${dayLabelOf(D.sprint.start)} → ${dayLabelOf(D.sprint.end)}</span></div>
      <p class="small" style="margin:0"><b>Briefs:</b> ${D.briefs.length ? D.briefs.map((b) => `<a href="#/brief/${b.id}">${esc(b.title)}</a>`).join(" · ") : `<span class="muted">none yet</span>`}</p>
      <p class="small"><b>Competencies:</b> ${codes.map((c) => compChip(c)).join(" ") || `<span class="muted">none</span>`}</p>
      <div class="toolbar" style="margin:0">${segHtml("spf", FILTERS, SPR.filter)}
        <select id="sp-sort"><option value="name">Name</option><option value="level" ${SPR.sort === "level" ? "selected" : ""}>Level</option><option value="most" ${SPR.sort === "most" ? "selected" : ""}>Most validated</option></select></div>
    </section>
    <section class="panel"><div class="table-wrap"><table class="grid-table sp-table">
      <thead><tr><th>Student</th>${tech.map((c) => `<th class="ctr" title="${esc(D.names[parseC(c).code] || "")}">${esc(cText(c))}</th>`).join("")}${soft.length ? `<th class="ctr" title="${esc(soft.map(cText).join(", "))}">CT</th>` : ""}
        <th class="num">Briefs</th><th class="num">Grid</th><th>Level</th><th>Decision</th></tr></thead>
      <tbody>${rows.map((r) => `<tr data-sid="${esc(r.discord_id)}">
        <td>${avatar(r.name, r.discord_id)} <a href="#/student/${esc(r.discord_id)}">${esc(r.name)}</a></td>
        ${tech.map((c) => spCell(r.cells[c])).join("")}${soft.length ? ctCell(r) : ""}
        <td class="num">${r.evald}/${D.briefs.length}</td><td class="num">${r.pct == null ? "—" : r.pct + "%"}</td>
        <td><select data-lvl title="${esc(r.plevel ? `Proposed: ${SP_LVL_NAME[r.plevel]}${r.why ? " · " + r.why : ""}` : "")}"><option value="">${r.plevel ? "Proposed: " + SP_LVL_NAME[r.plevel] : "—"}</option>${SP_LVL.map(([v, l]) => `<option value="${v}" ${r.level === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>
        <td class="sp-decs">${dec(r)}<button type="button" class="sp-dec note ${r.note ? "has" : ""}" data-note title="${esc(r.note || "Note")}">📝</button>
          <input type="text" data-notein value="${esc(r.note)}" placeholder="Note" ${r.note ? "" : "hidden"}></td></tr>`).join("") || `<tr><td colspan="${tech.length + 6}" class="empty">No students.</td></tr>`}</tbody>
    </table></div></section>
    <div class="grid cols-2-even">
      <section class="panel"><div class="panel-head"><h2>Levels</h2><span class="toolbar" style="margin:0"><button class="btn small primary" id="sp-prop">✨ Propose levels</button><button class="btn small" id="sp-copy">Copy</button></span></div>
        <div class="sp-sum">${sum.map((x) => `<div class="sp-box"><b>${x.list.length}</b><span class="small muted">${x.l}</span>${(x.v === "faible" || x.v === "critique") && x.list.length ? `<span class="small">${x.list.map((r) => esc(r.name)).join(", ")}</span>` : ""}</div>`).join("")}</div></section>
      <section class="panel"><div class="panel-head"><h2>Sprint comment</h2><span class="toolbar" style="margin:0"><button class="btn small primary" id="sp-gen">✨ ${D.comment ? "Write again" : "Write it"}</button><button class="btn small" id="sp-save">Save</button><button class="btn small" id="sp-ccopy">Copy</button></span></div>
        <textarea id="sp-c" style="min-height:220px">${esc(D.comment)}</textarea></section>
    </div>`;
  wireSprint();
}

function wireSprint() {
  const { D, n } = SPR;
  wireSeg(view, "spf", (v) => { SPR.filter = v; renderSprint(); });
  $("#sp-sort").onchange = (e) => { SPR.sort = e.target.value; renderSprint(); };
  const save = async (sid, fields) => {
    await api(`/sprints/${n}/decide`, { method: "POST", body: { discord_id: sid, ...fields } });
    Object.assign(D.rows.find((r) => r.discord_id === sid), fields);
  };
  $$("[data-sid]").forEach((tr) => {
    const sid = tr.dataset.sid, r = D.rows.find((x) => x.discord_id === sid);
    $("[data-lvl]", tr).onchange = (e) => save(sid, { level: e.target.value }).then(() => renderSprint()).catch((x) => toast(x.message, true));
    $$("[data-dec]", tr).forEach((b) => b.onclick = () => save(sid, { decision: r.decision === b.dataset.dec ? "" : b.dataset.dec }).then(() => renderSprint()).catch((x) => toast(x.message, true)));
    $("[data-note]", tr).onclick = () => { const i = $("[data-notein]", tr); i.hidden = !i.hidden; if (!i.hidden) i.focus(); };
    $("[data-notein]", tr).onchange = (e) => save(sid, { note: e.target.value.trim() }).then(() => toast("Note saved")).catch((x) => toast(x.message, true));
  });
  $("#sp-prop").onclick = (e) => busy(e.currentTarget, async () => {
    const R = await api(`/sprints/${n}/levels`, { method: "POST", body: {} });
    SPR.D = R; toast(R.by === "ai" ? "Levels proposed" : "Levels computed (no AI)"); renderSprint();
  });
  $("#sp-copy").onclick = () => {
    const lvl = (r) => r.level || r.plevel;
    const counted = D.rows.filter(lvl);
    copyText([`Sprint ${D.sprint.n} : ${counted.length} apprenant${counted.length === 1 ? "" : "s"}`,
      ...SP_LVL.map(([v, l]) => { const list = D.rows.filter((r) => lvl(r) === v); return `Niveau ${l} : ${list.length}${(v === "faible" || v === "critique") && list.length ? ` (${list.map((r) => r.name).join(", ")})` : ""}`; })].join("\n"), "Levels copied");
  };
  $("#sp-gen").onclick = (e) => busy(e.currentTarget, async () => {
    if ($("#sp-c").value.trim() && !confirm("Replace the comment?")) return;
    toast("⏳ Writing the comment…");
    const R = await api(`/sprints/${n}/comment`, { method: "POST", body: {} });
    $("#sp-c").value = D.comment = R.comment;
  });
  $("#sp-save").onclick = (e) => busy(e.currentTarget, async () => { const R = await api(`/sprints/${n}/comment`, { method: "PUT", body: { text: $("#sp-c").value } }); D.comment = R.comment; toast("Comment saved"); });
  $("#sp-ccopy").onclick = () => copyText($("#sp-c").value, "Comment copied");
}

function sprintYear(O) {
  view.querySelector("#sp-body").innerHTML = `<section class="panel"><div class="table-wrap"><table class="grid-table sp-table">
    <thead><tr><th>Student</th>${O.sprints.map((s) => `<th class="ctr"><a href="#/sprints/${s.n}">S${s.n}</a></th>`).join("")}<th class="num">Validated</th></tr></thead>
    <tbody>${O.year.map((y) => `<tr><td>${avatar(y.name, y.discord_id)} ${esc(y.name)}</td>
      ${y.per.map((p) => `<td class="ctr">${p.v ? `<span class="lvl ${p.v === "valide" ? "ok" : "bad"}" style="${p.final ? "" : "opacity:.55"}" title="${p.final ? "Your decision" : "Proposed"}${p.level ? " · " + esc(SP_LVL_NAME[p.level] || p.level) : ""}">${p.v === "valide" ? "✓" : "✗"}</span>` : `<span class="muted">—</span>`}</td>`).join("")}
      <td class="num">${y.per.filter((p) => p.v === "valide").length}/${O.sprints.length}</td></tr>`).join("")}</tbody>
  </table></div><p class="muted small">Bold = your decision, light = proposed.</p></section>`;
}


Object.assign(routes, { watch: viewWatch, "watch-students": viewWatchStudents, sprints: viewSprints });
