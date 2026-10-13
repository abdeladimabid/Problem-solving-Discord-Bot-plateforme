/* ClassBot dashboard: the Watcher part (from GitHub Watcher). The GitHub page (activity, who needs attention, briefs in
   progress, the students' table with filters and a brief filter, each student's panel) and Sprints (the sprint review).
   It reads what the other pages already use (/github, /github/activity, /briefs) plus /sprints. Loaded after learning.js
   (it uses its helpers). */
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
.w-cell.l0 { background: var(--line); }
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
.sp-box { display: flex; flex-direction: column; gap: 2px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-s); } .sp-box b { font-size: 22px; }
.panel.wf { padding: 0; } .wf > summary, .wf-sec > summary { list-style: none; cursor: pointer; }
.wf > summary::-webkit-details-marker, .wf-sec > summary::-webkit-details-marker { display: none; }
.wf > summary { padding: 16px 20px; } .wf-body { padding: 0 20px 16px; } [data-wfc] + [data-wfc] { margin-top: 12px; }
.wf-head { display: flex; justify-content: space-between; gap: 10px; align-items: center; flex-wrap: wrap; } .wf-head h3, .wf-top > h3 { margin: 0; font-size: 16px; }
.wf > summary h3::before, .wf-sec > summary b::before { content: "▸"; display: inline-block; width: 16px; color: var(--ink-faint); transition: transform .15s; }
.wf[open] > summary h3::before, .wf-sec[open] > summary b::before { transform: rotate(90deg); }
.wf-badges { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.wf-bar { display: flex; height: 8px; border-radius: 4px; background: var(--line); overflow: hidden; } .wf-bar i.on { background: var(--up); } .wf-bar i.late { background: var(--warn); }
.wf-legend { display: flex; flex-wrap: wrap; gap: 14px; margin: 6px 0 8px; }
.wf-key { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.wf-key.on { background: var(--up); } .wf-key.late { background: var(--warn); } .wf-key.none { background: var(--line-strong); }
.wf-sec { border-top: 1px solid var(--line); } .wf-sec > summary { display: flex; justify-content: space-between; gap: 10px; padding: 10px 0; }
.wf-sec-body { padding: 0 0 12px; } .wf-sec-body textarea { width: 100%; } .wf-sec-body textarea.mono { font-family: var(--mono); font-size: 12.5px; }
.wf-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; } .wf-groups h4 { margin: 0 0 6px; }
.wf-names { display: flex; flex-wrap: wrap; gap: 6px; } .wf-names .w-chip { text-decoration: none; }
.wf-act { border-top: 1px solid var(--line); padding-top: 12px; margin: 0; } .wf-h { margin: 22px 0 10px; font-size: 15px; color: var(--ink-soft); }`;
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

// ================================================================= GitHub: one page for the class's GitHub activity
// Everything the GitHub page had (figures, reports, students not linked yet, how students use it, unlink) and Watcher's:
// who needs attention and why, briefs in progress (announce, status), the students' table with filters and a brief filter,
// and each student's panel.
// what is still to set up (nothing when all is done)
function wSetupHtml(ready, G, P) {
  const todo = [
    !ready && `<a href="#/settings/github">GitHub App</a>`,
    P && !wSprintsOf(P).length && `<a href="#/settings/programme">Programme &amp; sprints</a>`,
    G.students && !G.linked && `Students link GitHub: <code>/github</code>`,
  ].filter(Boolean);
  return todo.length ? `<div class="notice warn"><b>To set up:</b> ${todo.join(" · ")}</div>` : "";
}
const W_FILTERS = [["all", "All", () => true], ["active", "Active this week", (s) => s.week.active > 0], ["idle", "Idle", (s, D) => s.idle >= D.inactive], ["attention", "Need attention", (s) => s.reasons.length > 0]];
async function viewGithubAll() {
  const [D, , P] = await Promise.all([watchData(), loadStudents(), wProgram().catch(() => null)]);
  const G = D.G, su = G.setup, c = G.cfg;
  const ready = su.app && su.oauth && su.webhook && su.key;
  const linkedIds = new Set(D.students.map((s) => s.discord_id));
  const notLinked = (S.students || []).filter((s) => !linkedIds.has(s.discord_id));
  const pctLinked = G.students ? Math.round((100 * G.linked) / G.students) : 0;
  const today = D.N - 1;
  const worked = D.students.filter((s) => s.day[today]?.any).length;
  const activeWeek = D.students.filter((s) => s.week.active > 0).length;
  const total14 = D.students.reduce((n, s) => n + s.all.real, 0);
  const idle = D.students.filter((s) => s.idle >= D.inactive);
  const attention = D.students.filter((s) => s.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length || b.idle - a.idle);
  const nowS = Date.now() / 1000;
  const live = D.briefs.filter((b) => b.due_at && b.due_at > nowS - 3 * 86400).slice(0, 4);
  if (W_STATE.brief && !D.briefs.some((b) => String(b.id) === String(W_STATE.brief))) W_STATE.brief = "";
  const [details, BD] = await Promise.all([Promise.all(live.map((b) => api(`/briefs/${b.id}`).catch(() => null))), W_STATE.brief ? api(`/briefs/${W_STATE.brief}`).catch(() => null) : null]);
  // a brief chosen: the numbers cover its days (inside the 14 days), and its hand-ins / pushes / squads
  let win = null;
  if (BD) {
    const b = BD.brief, start = new Date((b.start_at || b.created_at) * 1000).toISOString().slice(0, 10), end = new Date((b.due_at || nowS) * 1000).toISOString().slice(0, 10);
    let from = D.A.days.findIndex((d) => d >= start); if (from < 0) from = D.N;
    let to = D.A.days.findIndex((d) => d > end); if (to < 0) to = D.N;
    win = { from, to: Math.max(from, to) };
  }
  const notStarted = win && win.to <= win.from;
  const briefOf = (s) => {
    const x = BD.students.find((y) => y.discord_id === s.discord_id) || {};
    const sq = BD.kind === "squad" ? BD.squadRows.find((q) => q.members.map(String).includes(s.discord_id)) || null : null;
    return { sq, handin: sq ? sq.handin : x.handin, push: x.push || "none", review: sq ? sq.review : x.review };
  };
  const passed = BD && BD.brief.due_at && BD.brief.due_at <= nowS;
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
  view.innerHTML = `
    <div class="page-head"><div><h1>GitHub</h1></div>
      <div class="toolbar" style="margin:0"><button class="btn" id="gh-d">Send today's report</button><button class="btn" id="gh-w">Weekly report</button><a class="btn" href="#/settings/github">${icon("gear")} Settings</a></div></div>
    <div class="stack">
    ${wSetupHtml(ready, G, P)}
    <div class="figures cs-figs">
      <div class="figure"><span class="ico">🔗</span><div><b>${G.linked}/${G.students}</b><span>students linked</span>${meter(pctLinked)}</div></div>
      <div class="figure"><span class="ico">✍️</span><div><b>${worked}</b><span>worked today</span></div></div>
      <div class="figure"><span class="ico">🟢</span><div><b>${activeWeek}</b><span>pushed in the last 7 days</span></div></div>
      <div class="figure"><span class="ico">📦</span><div><b>${total14}</b><span>commits in 14 days</span></div></div>
      <div class="figure ${idle.length ? "cs-attn" : ""}"><span class="ico">💤</span><div><b>${idle.length}</b><span>idle ${D.inactive}+ working days</span></div></div>
    </div>
    ${G.linked <= 1 && G.students > 3 && su.app ? `<div class="notice">Students already in GitHub Watcher? <a href="#/settings/github">Import them</a></div>` : ""}
    <div class="grid cols-2-even">
      <section class="panel"><h2>Need your attention ${attention.length ? `<span class="muted">${attention.length}</span>` : ""}</h2>
        ${attention.length ? `<ul class="w-att">${attention.slice(0, 8).map((s) => `<li class="w-row" data-ws="${esc(s.discord_id)}" title="${esc(s.reasons.map((r) => r[0]).join("\n"))}"><span>${esc(s.display)}</span><span class="small muted">${esc(s.reasons.map((r) => r[1]).join(" · "))}</span></li>`).join("")}</ul>
          ${attention.length > 8 ? `<p><button class="btn small" id="w-allattn">Show all ${attention.length}</button></p>` : ""}` : `<p class="muted small">Nobody right now.</p>`}
      </section>
      <section class="panel"><div class="panel-head"><h2>Briefs in progress</h2><a class="small" href="#/briefs">Manage</a></div>
        ${live.length ? live.map((b, i) => {
          const B = details[i], st = B ? B.students : [];
          const on = st.filter((s) => s.push === "on").length, late = st.filter((s) => s.push === "late").length, n = st.length || 1;
          const done = b.due_at <= nowS;
          return `<div style="margin:10px 0"><div class="panel-head" style="margin:0"><a href="#/brief/${b.id}"><b>${esc(b.title)}</b></a><span class="small muted">${dueIn(b.due_at)}</span></div>
            ${meter(Math.round((100 * (on + late)) / n), "pushed")}
            <div class="panel-head" style="margin:4px 0 0"><span class="small muted">${done ? `${on} on time, ${late} late, ${st.length - on - late} nothing` : `${on + late} of ${st.length} pushed`}</span>
              <span class="toolbar" style="margin:0">${wAnnBtn(b)}<button class="btn small" data-wstat="${b.id}">Post status</button></span></div></div>`;
        }).join("") : `<p class="muted small">No brief in progress.</p>`}
      </section>
    </div>
    <section class="panel"><div class="panel-head"><h2>Students · ${!BD ? "last 7 days" : notStarted ? `${esc(BD.brief.data.title)} has not started yet` : `${esc(BD.brief.data.title)} since ${fmtDate(BD.brief.start_at || BD.brief.created_at)}`}</h2>
        <span class="heat-legend small muted">less <i class="w-cell l0"></i><i class="w-cell l1"></i><i class="w-cell l2"></i><i class="w-cell l3"></i><i class="w-cell l4"></i> more · <i class="w-cell hollow"></i> only tiny or huge commits</span></div>
      <div class="toolbar" style="margin:0 0 8px"><input type="search" id="w-q" placeholder="Search by name" value="${esc(W_STATE.q)}" style="max-width:220px">
        <div class="w-chips" id="w-chips"></div>
        <select id="w-sort">${[["active", "Most active"], ["least", "Least active"], ["recent", "Last active"], ["lines", "Most lines"], ["name", "Name"]].map(([v, l]) => `<option value="${v}" ${W_STATE.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="toolbar" style="margin:0 0 10px"><b class="small">Brief</b><select id="w-brief"><option value="">All briefs</option>${D.briefs.map((b) => `<option value="${b.id}" ${String(b.id) === String(W_STATE.brief) ? "selected" : ""}>${esc(b.title)}</option>`).join("")}</select>
        ${BD ? `<select id="w-bstat">${BSTAT.map(([v, l, f]) => `<option value="${v}" ${v === W_STATE.bstat ? "selected" : ""}>${esc(l)} (${D.students.filter((s) => f(briefOf(s))).length})</option>`).join("")}</select>
          ${wAnnBtn(BD.brief)}<button class="btn small" data-wstat="${BD.brief.id}">Post status</button>` : ""}</div>
      <div class="table-wrap"><table class="grid-table"><thead><tr><th>Student</th>${BD ? "<th>Brief</th>" : ""}<th>${BD ? "Days of the brief" : "Last 14 days"}</th><th class="num">Score</th>${BD ? "" : `<th class="num">Trend</th>`}<th class="num">Commits</th><th class="num">Lines</th><th class="num">PRs</th><th>Last push</th><th>Warnings</th></tr></thead>
        <tbody id="w-rows"></tbody></table></div>
      ${D.students.length ? "" : `<div class="empty-state"><div style="font-size:40px">🐙</div><p class="muted">Nobody linked yet (<code>/github</code>).</p></div>`}
    </section>
    ${notLinked.length ? `<section class="panel"><div class="panel-head"><h2>Not linked yet <span class="muted">${notLinked.length}</span></h2><span class="small muted"><code>/github</code></span></div>
      <div class="people">${notLinked.map((s) => `<a href="#/student/${s.discord_id}" class="person">${avatar(s.name, s.discord_id)} ${esc(s.name || s.discord_id)}</a>`).join("")}</div></section>` : ""}
    <p class="small muted">Students: <code>/github</code> to link · push · <code>/brief submit</code> to hand in.</p>
    </div>`;
  const draw = () => {
    $("#w-chips").innerHTML = W_FILTERS.map(([v, l, f]) => `<button type="button" class="w-chip" data-wf="${v}" aria-pressed="${W_STATE.filter === v}">${l}<small>${D.students.filter((s) => f(s, D)).length}</small></button>`).join("");
    $$("[data-wf]").forEach((b) => b.onclick = () => { W_STATE.filter = b.dataset.wf; draw(); });
    const rows = rowsOf();
    $("#w-rows").innerHTML = rows.length ? rows.map((s) => {
      const b = BD ? briefOf(s) : null;
      const pushTxt = b ? (b.push === "on" ? (passed ? "On time" : "Pushed") : b.push === "late" ? "Late" : passed ? "Nothing pushed" : "Not yet") : "";
      const warn = [s.week.tiny ? `<span class="lvl bad">${s.week.tiny} tiny</span>` : "", s.week.huge ? `<span class="lvl bad">${s.week.huge} huge</span>` : "", s.week.vague ? `<span class="lvl bad">${s.week.vague} unclear</span>` : ""].filter(Boolean).join(" ");
      const from = win ? win.from : 0, to = win ? win.to : D.N;
      const strip = s.day.slice(from, to).map((x, i) => wCell(x, D.A.days[from + i])).join("");
      return `<tr class="w-row" data-ws="${esc(s.discord_id)}"><td>${s.reasons.length ? "🔴 " : ""}${avatar(s.display, s.discord_id)} <b>${esc(s.display)}</b> <span class="small muted">@${esc(s.login || "")}</span></td>
        ${b ? `<td><div class="w-brief-cell">${b.sq ? `<b>${esc(b.sq.name)}${b.sq.sm === s.discord_id ? " · SM" : ""}</b>` : ""}<span>${b.handin ? "✔ " + esc(String(b.handin.repo).split("/").pop()) : `<span class="muted">Not handed in</span>`}</span><span class="lvl ${b.push === "on" ? "ok" : b.push === "late" ? "warn" : "bad"}">${pushTxt}</span></div></td>` : ""}
        <td>${notStarted ? `<span class="muted small">Not started</span>` : `<span class="w-strip">${strip}</span> <span class="small muted">${win ? s.week.active : s.all.active}/${to - from}</span>`}</td>
        <td class="num"><b>${notStarted ? "–" : s.week.score}</b></td>${BD ? "" : `<td class="num">${wTrend(s.trend)}</td>`}
        <td class="num">${notStarted ? "–" : s.week.real}</td><td class="num">${notStarted ? "–" : s.week.lines}</td><td class="num">${notStarted ? "–" : s.week.prs}</td>
        <td class="small">${s.idle >= D.inactive ? `<span class="lvl bad">${s.idle} days idle</span>` : `<span class="muted">${wLast(s)}</span>`}</td><td>${warn}</td></tr>`;
    }).join("") : `<tr><td colspan="10" class="empty">No students match.</td></tr>`;
    $$("[data-ws]", $("#w-rows")).forEach((tr) => tr.onclick = () => openWatchStudent(D, tr.dataset.ws));
  };
  if (D.students.length) draw(); else $("#w-rows").closest(".table-wrap").remove();
  $("#w-q").oninput = (e) => { W_STATE.q = e.target.value; draw(); };
  $("#w-sort").onchange = (e) => { W_STATE.sort = e.target.value; draw(); };
  $("#w-brief").onchange = (e) => { W_STATE.brief = e.target.value; W_STATE.bstat = "all"; viewGithubAll(); };
  if ($("#w-bstat")) $("#w-bstat").onchange = (e) => { W_STATE.bstat = e.target.value; draw(); };
  if ($("#w-allattn")) $("#w-allattn").onclick = () => { W_STATE.filter = "attention"; draw(); $("#w-rows").scrollIntoView({ block: "start" }); };
  $$(".w-att [data-ws]").forEach((el) => el.onclick = () => openWatchStudent(D, el.dataset.ws));
  wireBriefButtons(view);
  $("#gh-d").onclick = (e) => busy(e.currentTarget, async () => { await api("/github/report", { method: "POST", body: { kind: "daily" } }); toast("Report sent"); });
  $("#gh-w").onclick = (e) => busy(e.currentTarget, async () => { await api("/github/report", { method: "POST", body: { kind: "weekly" } }); toast("Report sent"); });
}

// the brief's announcement (in French) and status, posted in Discord
// the announce button: "again" once announced, none after the due date
const wAnnBtn = (b) => (b.due_at && b.due_at <= Date.now() / 1000 ? ""
  : `<button class="btn small" data-wann="${b.id}" ${b.announced_at ? `data-again="${esc(fmtAgo(b.announced_at))}"` : ""}>📣 ${b.announced_at ? "Announce again" : "Announce"}</button>`);
function wireBriefButtons(root, after = viewGithubAll) {
  $$("[data-wann]", root).forEach((b) => b.onclick = () => confirmDialog(b.dataset.again ? "Announce this brief again?" : "Announce this brief in Discord?", b.dataset.again ? `It was announced ${b.dataset.again}.` : "In French: dates, steps, squads and how to hand in.", "Announce",
    async () => { await api(`/briefs/${b.dataset.wann}/watcher/announce`, { method: "POST", body: {} }); toast("Announced in Discord"); after(); }));
  $$("[data-wstat]", root).forEach((b) => b.onclick = () => busy(b, async () => {
    const r = await api(`/briefs/${b.dataset.wstat}/watcher/status`, { method: "POST", body: {} });
    toast(`Status posted: ${r.on + r.late} pushed, ${r.none} not yet`);
  }));
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
      <span class="toolbar" style="margin:0"><button class="btn small" id="w-unlink">Unlink</button><button class="btn small" id="w-close" aria-label="Close">✕</button></span></div>
    ${s.reasons.length ? `<div class="notice warn"><b>Needs your attention</b><ul class="small" style="margin:6px 0 0">${s.reasons.map((r) => `<li>${esc(r[0])}</li>`).join("")}</ul></div>` : ""}
    <div class="w-mini"><div><b>${s.all.score}</b><span>Score</span></div><div><b>${s.all.real}</b><span>Commits</span></div><div><b>${s.all.lines}</b><span>Lines</span></div><div><b>${s.all.active}/${D.N}</b><span>Active days</span></div></div>
    ${barChart(labels, [{ name: "Score", values: s.day.map((x) => x.score), color: "var(--blue)" }, { name: "Not scored (tiny / huge)", values: s.day.map((x) => x.tiny + x.huge), color: "var(--line-strong)" }], { height: 170, every: 2 })}
    ${briefRows ? `<h3>Briefs</h3><div class="table-wrap"><table class="grid-table"><tbody>${briefRows}</tbody></table></div>` : ""}
    <details style="margin-top:12px"><summary><b>Repos</b> <span class="muted small">${s.repos.length}</span></summary>
      <ul class="small">${s.repos.map(([r, n]) => `<li><a href="https://github.com/${esc(r)}" target="_blank" rel="noopener">${esc(r)}</a> <span class="muted">· ${n} action(s)</span></li>`).join("") || `<li class="muted">No repo activity yet.</li>`}</ul></details>
    <details><summary><b>Day by day</b></summary><div class="table-wrap"><table class="grid-table"><thead><tr><th>Day</th><th class="num">Score</th><th class="num">Commits</th><th class="num">Lines</th><th class="num">PRs</th><th class="num">Other</th><th class="num">Tiny</th><th class="num">Huge</th><th class="num">Unclear</th></tr></thead>
      <tbody>${s.day.map((x, i) => `<tr><td>${esc(D.A.days[i])}</td><td class="num"><b>${x.score}</b></td><td class="num">${x.real}</td><td class="num">${x.lines}</td><td class="num">${x.prs}</td><td class="num">${x.other}</td><td class="num">${x.tiny || ""}</td><td class="num">${x.huge || ""}</td><td class="num">${x.vague || ""}</td></tr>`).reverse().join("")}</tbody></table></div></details>`;
  $("#w-close", panel).onclick = () => { box.hidden = true; };
  $("#w-unlink", panel).onclick = () => confirmDialog("Unlink this GitHub account?", "The student can link again with /github. Past activity stays.", "Unlink",
    async () => { await api("/github/unlink", { method: "POST", body: { discord_id: id } }); box.hidden = true; viewGithubAll(); }, true);
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


// ================================================================= a brief in one form (like GitHub Watcher's "New brief")
let W_PROG = null;
const wProgram = async () => (W_PROG ??= (await api("/programs")).current);
/** The sprints of the planning, with their dates (from their weeks). */
function wSprintsOf(P) {
  return (P.sprints || []).map((s) => {
    const ws = (P.weeks || []).filter((w) => w.sprint === s.n && w.start && w.end);
    return { n: s.n, title: "Sprint " + s.n, full: s.title || "", start: ws.map((w) => w.start).sort()[0] || "", end: ws.map((w) => w.end).sort().pop() || "" };
  }).filter((s) => s.start);
}
const wShort = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
/** The sprint of a brief in a form: by its week or due date (the sprint is named), none (e.g. a cross defense), or one chosen.
    `cur`: null = automatic, 0 = none, n = sprint n. Fills [data-wsprint] in root; the value is read from .w-sp in root. */
async function wSprintField(root, cur, dueSel, week = null) {
  const box = $("[data-wsprint]", root);
  if (!box) return;
  const P = await wProgram().catch(() => null);
  const sps = P ? wSprintsOf(P) : [];
  if (!sps.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<label>Sprint</label><select class="w-sp" aria-label="Sprint"><option value=""></option>
    <option value="none" ${cur === 0 ? "selected" : ""}>No sprint</option>
    ${sps.map((s) => `<option value="${s.n}" ${cur === s.n ? "selected" : ""} title="${esc(s.full)}">${esc(s.title)} · ${wShort(s.start)} → ${wShort(s.end)}</option>`).join("")}</select>`;
  const auto = () => {
    const wk = week ? P.weeks.find((w) => w.n === week) : null;
    const d = $(dueSel, root)?.value || "";
    const sp = wk ? sps.find((s) => s.n === wk.sprint) : d && sps.find((s) => d >= s.start && d <= s.end);
    $(".w-sp option[value='']", root).textContent = (wk ? "By its week" : "By its due date") + (wk || d ? ` (${sp ? sp.title : "no sprint"})` : "");
  };
  $(dueSel, root)?.addEventListener("input", auto);
  auto();
}

async function quickBrief() {
  await loadRef();
  let src = null; // the brief page read: { text, title, comps }
  const squads = [];
  const today = new Date().toISOString().slice(0, 10);
  openDialog("New brief", `
    <label for="qb-name">Name</label><input type="text" id="qb-name" maxlength="160" placeholder="e.g. Fitness website" style="width:100%">
    <div class="field-row"><div><label for="qb-s">From</label><input type="date" id="qb-s" value="${today}"></div>
      <div><label for="qb-d">Due</label><input type="date" id="qb-d"></div><div><label for="qb-t">At (UTC)</label><input type="time" id="qb-t" value="23:59"></div></div>
    <div data-wsprint></div>
    <label>Type of brief</label>${segHtml("qbk", [["solo", "Individual"], ["squad", "Squad"]], "solo")}
    <div id="qb-sq" hidden><div class="toolbar" style="margin:8px 0"><select id="qb-from"><option value="">Loading the class's squads…</option></select><button class="btn small" type="button" id="qb-load">Load</button></div>
      <div id="qb-board"></div></div>
    <label>Brief page <span class="muted">(optional)</span></label>
    <label class="drop" id="qb-drop"><input type="file" id="qb-file" accept=".html,.htm,text/html" hidden><span>📄 <b>Choose or drop the .html</b></span></label>
    <div id="qb-pre" class="small"></div>
    <div class="field-row"><div><label for="qb-c">Competencies</label><input type="text" id="qb-c" placeholder="C1N1, C3N1, CT1N1…"></div>
      <div><label for="qb-r">Repo name contains</label><input type="text" id="qb-r" maxlength="100" placeholder="optional"></div></div>
    <label class="check"><input type="checkbox" id="qb-a" checked> Announce it in Discord</label>
    <p class="small muted" id="qb-st" style="margin:8px 0 0"></p>`,
    [{ label: "Add brief", primary: true, action: async () => {
      const name = $("#qb-name").value.trim(), start = $("#qb-s").value, due = $("#qb-d").value, kind = segVal(dlg, "qbk");
      if (!name && !src) throw new Error("Give the brief a name.");
      if (!due) throw new Error("Choose the due date.");
      if (start && start > due) throw new Error("The start date must be before the due date.");
      const sq = squads.filter((s) => s.members.length);
      if (kind === "squad" && !sq.length) throw new Error("Load the squads first.");
      const comps = $("#qb-c").value.replace(/\s+(?=N\d)/gi, "").split(/[\s,;]+/).map(parseC).filter(Boolean).map((p) => p.code + (p.level ? "N" + p.level : ""));
      const say = (t) => { $("#qb-st").textContent = t; };
      say("⏳ Adding the brief…");
      let B = src ? await api("/briefs/import", { method: "POST", body: { ...src, start, due, mode: kind === "squad" ? "squad" : "individuel" } })
        : await api("/briefs", { method: "POST", body: { title: name } });
      const id = B.brief.id, d0 = B.brief.data;
      await api(`/briefs/${id}`, { method: "PUT", body: { data: { ...d0, title: name || d0.title, competencies: comps.length ? [...new Set(comps)] : d0.competencies || [] },
        kind, squads: kind === "squad" ? sq : [], repo_hint: $("#qb-r").value.trim() } });
      if (src) say("⏳ Making the evaluation grid (up to 1 min)…");
      B = await api(`/briefs/${id}/assign`, { method: "POST", body: { start, due, time: $("#qb-t").value, sprint: $(".w-sp", dlg) ? $(".w-sp", dlg).value : "", announce: false } });
      // the steps: from the page ("Partie N, fin du jour N"), else proposed by the AI
      if (src && !B.steps.length) { say("⏳ Proposing the steps…"); B = await api(`/briefs/${id}/steps`, { method: "POST", body: {} }).catch(() => B); }
      const msg = ["Added " + B.brief.data.title + "."];
      const pushed = B.students.filter((s) => s.push).length;
      msg.push(start > today ? `Pushes count from ${dayLabelOf(start)}.` : `${pushed} pushed since ${dayLabelOf(start || today)}.`);
      if (src) msg.push(B.grid ? `Grid: ${B.grid.items.length} lines${B.steps.length ? `, ${B.steps.length} steps` : ""}.` : "No grid: make it in the card.");
      if ($("#qb-a").checked) { say("⏳ Announcing in Discord…"); msg.push(await api(`/briefs/${id}/watcher/announce`, { method: "POST", body: {} }).then(() => "Announced.", (e) => `Not announced: ${e.message}`)); }
      dlg.close(); toast(msg.join(" "));
      // its card in Briefs → Follow-up, open
      wfOpen(id, null, true);
      if (location.hash === "#/briefs/follow") routes.briefs("follow"); else location.hash = "#/briefs/follow";
    } }]);
  dlg.classList.add("wide");
  wSprintField(dlg, null, "#qb-d");
  // squads: loaded from the class's squads (Teams & squads), adjusted here for this brief only
  let classSq = null;
  wireSeg(dlg, "qbk", (v) => {
    $("#qb-sq", dlg).hidden = v !== "squad";
    if (v !== "squad" || classSq) return;
    api("/squads").then((d) => {
      classSq = d;
      const sel = $("#qb-from", dlg);
      sel.innerHTML = d.sets.length ? d.sets.map((x) => `<option value="${x.id}" ${x.active ? "selected" : ""}>${esc(x.name)}${x.active ? " · current" : ""} (${x.squads.length} squads)</option>`).join("") : `<option value="">No class squads yet (Teams & squads)</option>`;
      const board = squadBoard($("#qb-board", dlg), d.students, squads, () => {});
      $("#qb-load", dlg).onclick = () => {
        const set = d.sets.find((x) => String(x.id) === sel.value);
        if (!set) { dlg.close(); location.hash = "#/teams"; return; }
        squads.splice(0, squads.length, ...set.squads.map((x) => ({ ...x, members: [...x.members] })));
        board.redraw();
      };
      if (d.sets.length) $("#qb-load", dlg).click();
    }).catch((e) => toast(e.message));
  });
  // the brief page (optional): its text and competencies; the name comes from it when empty
  const readFile = async (f) => {
    if (!f) return;
    const pre = $("#qb-pre", dlg);
    if (!/\.html?$/i.test(f.name) && f.type !== "text/html") { pre.innerHTML = `<span style="color:var(--down)">Choose the page saved as .html.</span>`; return; }
    $("#qb-drop span", dlg).innerHTML = `📄 <b>${esc(f.name)}</b> · choose another`;
    pre.innerHTML = `<span class="muted">⏳ Reading…</span>`;
    try {
      const s = simplonParse(await f.text(), REF.referential);
      const r = await api("/briefs/import", { method: "POST", body: { ...s, preview: true } });
      src = s;
      if (!$("#qb-name").value.trim()) $("#qb-name").value = r.data.title || "";
      if ((r.data.competencies || []).length) $("#qb-c").value = r.data.competencies.map((c) => cText(c).replace(/\s+/g, "")).join(", ");
      // "Travail collectif (Squad)": a squad brief
      if (/squad|collectif|groupe/i.test(r.data.modalities?.mode || "") || /travail collectif|\(squad\)|en squads?\b/i.test(s.text)) $('[data-seg="qbk"] [data-v="squad"]', dlg)?.click();
      const us = (r.data.groups || []).reduce((n, g) => n + (g.stories || []).length, 0);
      pre.innerHTML = `✓ ${esc(r.data.title || f.name)} · ${us ? `${us} user stories` : `${s.text.length.toLocaleString("en")} characters`}${(r.data.competencies || []).length ? "" : ` · <span class="muted">no competency level found: write them below</span>`}`;
    } catch (e) { src = null; pre.innerHTML = `<span style="color:var(--down)">${esc(e.message)}</span>`; }
  };
  $("#qb-file", dlg).onchange = () => readFile($("#qb-file", dlg).files[0]);
  const drop = $("#qb-drop", dlg);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); readFile(e.dataTransfer.files[0]); };
}

// ================================================================= Briefs → Follow-up: one card per published brief with everything in it
// (like GitHub Watcher's Briefs): who pushed, hand-ins or squads & debriefs, the brief and its grid and steps, type & squads,
// dates & sprint, announce / status / delete. Running briefs open, ended ones folded; the teacher's choice is kept in this browser.
const wfOpen = (id, def, set) => {
  let m = {};
  try { m = JSON.parse(localStorage.getItem("cb-wf-open") || "{}") || {}; } catch { m = {}; }
  if (set === undefined) return typeof m[id] === "boolean" ? m[id] : def;
  m[id] = set;
  try { localStorage.setItem("cb-wf-open", JSON.stringify(m)); } catch { /* not remembered */ }
  return set;
};
const wfIso = (u) => (u ? new Date(u * 1000).toISOString() : "");

async function wFollow(root) {
  const [r, P] = await Promise.all([api("/briefs"), wProgram().catch(() => null)]);
  const ctx = { P, sps: P ? wSprintsOf(P) : [] };
  const nowS = Date.now() / 1000;
  const pub = r.items.filter((b) => b.status === "assigned" && b.due_at);
  const soon = pub.filter((b) => b.due_at > nowS).sort((a, b) => a.due_at - b.due_at);
  const ended = pub.filter((b) => b.due_at <= nowS).sort((a, b) => b.due_at - a.due_at);
  if (!pub.length) {
    root.innerHTML = `<div class="empty-state"><p class="muted">No published brief yet.</p><button class="btn primary" id="wf-new">+ Quick brief</button></div>`;
    $("#wf-new", root).onclick = () => quickBrief();
    return;
  }
  const slot = (b) => `<div data-wfc="${b.id}"><details class="panel wf"><summary class="wf-top"><h3>${esc(b.title)}</h3></summary></details></div>`;
  root.innerHTML = soon.map(slot).join("") + (ended.length ? `<h2 class="wf-h">Ended</h2>` + ended.map(slot).join("") : "");
  for (const b of [...soon, ...ended]) wfCard($(`[data-wfc="${b.id}"]`, root), b, ctx);
}

// one card; the details of a brief ended over 30 days ago load when it is opened
async function wfCard(box, item, ctx, B = null) {
  const nowS = Date.now() / 1000, passed = item.due_at <= nowS;
  const open = wfOpen(item.id, !passed);
  if (!B && (open || item.due_at > nowS - 30 * 86400)) B = await api(`/briefs/${item.id}`).catch(() => null);
  const b = B ? B.brief : item, md = B ? b.data.modalities : {};
  const sp = (() => {
    if (b.sprint === 0) return null;
    if (b.sprint) return ctx.sps.find((s) => s.n === b.sprint);
    const wk = b.week && ctx.P ? ctx.P.weeks.find((w) => w.n === b.week) : null;
    if (wk) return ctx.sps.find((s) => s.n === wk.sprint);
    const d = wfIso(b.due_at).slice(0, 10);
    return ctx.sps.find((s) => d >= s.start && d <= s.end);
  })();
  const st = B ? B.students : [], sq = B && B.kind === "squad";
  const on = st.filter((s) => s.push === "on"), late = st.filter((s) => s.push === "late"), none = st.filter((s) => !s.push);
  const handed = !B ? "" : sq ? `${B.squadRows.filter((q) => q.handin).length}/${B.squadRows.length} repos` : `${st.filter((s) => s.handin).length}/${st.length} repos`;
  const sec = (key, title, meta, body, o = false) => `<details class="wf-sec" data-sec="${key}" ${o ? "open" : ""}><summary><b>${title}</b>${meta ? `<span class="small muted">${esc(meta)}</span>` : ""}</summary><div class="wf-sec-body">${body}</div></details>`;
  const pct = (n) => (st.length ? (100 * n) / st.length : 0);
  const names = (list) => (list.length ? `<div class="wf-names">${list.map((s) => `<a class="w-chip" href="#/student/${esc(s.discord_id)}">${esc(s.name || s.discord_id)}</a>`).join("")}</div>` : `<p class="muted small">Nobody</p>`);
  const group = (label, cls, list) => `<div><h4 class="small"><i class="wf-key ${cls}"></i>${label} (${list.length})</h4>${names(list)}</div>`;
  const repoBtn = (who, h) => `<button class="btn small" data-wf-hi="${esc(who)}" data-repo="${esc(h?.repo || "")}" data-plan="${esc(h?.plan || "")}" title="Set or fix the repo">✏️ Repo</button>
    <a class="btn small primary" href="#/debrief/${b.id}~${encodeURIComponent(who)}">Debrief →</a>`;
  const nameOf = (uid) => st.find((s) => s.discord_id === uid)?.name || uid;
  const handins = !B ? "" : sq ? (B.squadRows.length ? `<div class="table-wrap"><table class="grid-table"><thead><tr><th>Squad</th><th>Handed in</th><th>Debrief</th><th></th></tr></thead><tbody>${B.squadRows.map((q) => `<tr>
        <td><b>${esc(q.name)}</b><div class="small">${q.members.map((m) => `${esc(nameOf(m))}${m === q.sm ? " <span class='tag'>SM</span>" : ""}`).join(", ")}</div></td>
        <td>${handinCell(q.handin)}</td><td>${reviewCell(q.review)}</td><td class="nowrap">${repoBtn(`s:${q.id}`, q.handin)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted small">No squads yet.</p>`)
    : `<div class="table-wrap"><table class="grid-table"><thead><tr><th>Student</th><th>Handed in</th><th>Debrief</th><th></th></tr></thead><tbody>${st.map((s) => `<tr>
        <td><a href="#/student/${esc(s.discord_id)}">${esc(s.name || s.discord_id)}</a></td><td>${handinCell(s.handin)}</td><td>${reviewCell(s.review)}</td><td class="nowrap">${repoBtn(`u:${s.discord_id}`, s.handin)}</td></tr>`).join("")}</tbody></table></div>`;
  const gridN = B && B.grid ? B.grid.items.length : 0;
  const compIn = (c) => cText(c).replace(/\s+/g, "");
  const comps = B ? (b.data.competencies || []).map(compIn).join(", ") : "";
  const briefMeta = !B ? "" : `${gridN ? `${gridN} lines` : "no grid yet"}${B.steps.length ? ` · ${B.steps.length} steps` : ""}${comps ? ` · ${(b.data.competencies || []).map(cText).join(", ")}` : ""}`;
  const briefBody = !B ? "" : `
    <div class="toolbar" style="margin:0 0 8px"><label class="btn small">📄 ${b.data.context || (b.data.groups || []).length ? "Replace the brief (.html)" : "Import the brief page (.html)"}<input type="file" accept=".html,.htm,text/html" hidden data-wf-file></label>
      <button class="btn small" data-wf-grid>✨ ${gridN ? "Make the grid again" : "Make the evaluation grid"}</button><button class="btn small" data-wf-steps>✨ Propose the steps</button></div>
    <div class="field-row"><div><label>Competencies</label><input type="text" data-wf-comps value="${esc(comps)}" placeholder="C1N1, C3N1, CT1N1…"></div>
      <div><label>Repo name contains</label><input type="text" data-wf-repo maxlength="100" value="${esc(B.repo_hint)}" placeholder="optional, e.g. fitness"></div></div>
    <label>Evaluation grid${gridN ? ` · ${gridN} lines · ${B.grid.by === "ai" ? "made by AI" : B.grid.by === "edit" ? "changed by you" : "made without AI"}` : ""}</label>
    <textarea class="mono" data-wf-gridtext rows="12" spellcheck="false" placeholder="[fonctionnalité] Créer la page Contact (vérif : form, map)">${esc(B.gridText)}</textarea>
    <label>Steps${B.steps.length ? ` · ${B.steps.length}` : ""}</label>
    <textarea class="mono" data-wf-stepstext rows="${Math.max(3, B.steps.length + 1)}" spellcheck="false" placeholder="Partie 1 | 2026-10-14 17:00 | maquette">${esc(B.stepsText)}</textarea>
    <p class="toolbar" style="margin:10px 0 0"><button class="btn primary small" data-wf-bsave>Save</button></p>`;
  const typeBody = !B ? "" : `${segHtml("wfk" + b.id, [["solo", "Individual"], ["squad", "Squad"]], B.kind)}
    <div data-wf-sqbox ${sq ? "" : "hidden"}><div class="toolbar" style="margin:8px 0"><select data-wf-from><option value="">Loading the class's squads…</option></select><button class="btn small" data-wf-load>Load</button></div><div data-wf-board></div></div>
    <p class="toolbar" style="margin:10px 0 0"><button class="btn primary small" data-wf-sqsave>Save</button></p>`;
  const datesBody = !B ? "" : `<div class="field-row"><div><label>From</label><input type="date" data-wf-s value="${esc(md.start || wfIso(b.start_at).slice(0, 10))}"></div>
      <div><label>Due</label><input type="date" data-wf-d value="${esc(md.due || wfIso(b.due_at).slice(0, 10))}"></div><div><label>At (UTC)</label><input type="time" data-wf-t value="${esc(md.time || wfIso(b.due_at).slice(11, 16))}"></div></div>
    <div data-wsprint></div>
    <p class="toolbar" style="margin:10px 0 0"><button class="btn primary small" data-wf-dsave>Save</button></p>`;
  box.innerHTML = `<details class="panel wf" ${open ? "open" : ""}>
    <summary class="wf-top"><div class="wf-head"><h3>${esc(B ? b.data.title : item.title)}</h3>
        <span class="wf-badges">${sp ? `<span class="tag" title="${esc(sp.full)}">${esc(sp.title)}</span>` : b.sprint === 0 ? `<span class="tag">No sprint</span>` : ""}${B ? `<span class="tag">${sq ? "Squad" : "Individual"}</span>` : ""}${dueIn(b.due_at)}</span></div>
      <p class="small muted" style="margin:4px 0 0">${b.start_at ? fmtDate(b.start_at) + " → " : ""}${fmtDate(b.due_at)}, ${wfIso(b.due_at).slice(11, 16)} UTC${B ? ` · ${on.length + late.length}/${st.length} pushed · ${handed}` : ""}</p></summary>
    <div class="wf-body">${!B ? `<p class="muted small">⏳ Loading…</p>` : `
      <div class="wf-bar"><i class="on" style="width:${pct(on.length)}%"></i><i class="late" style="width:${pct(late.length)}%"></i></div>
      <p class="small muted wf-legend"><span><i class="wf-key on"></i>${on.length} ${passed ? "on time" : "pushed"}</span>${passed ? `<span><i class="wf-key late"></i>${late.length} late</span>` : ""}<span><i class="wf-key none"></i>${none.length} ${passed ? "nothing pushed" : "not yet"}</span></p>
      ${sec("push", "Who pushed", "", `<div class="wf-groups">${group(passed ? "On time" : "Pushed", "on", on)}${passed ? group("Late", "late", late) : ""}${group(passed ? "Nothing pushed" : "Not yet", "none", none)}</div>`)}
      ${sec("hand", sq ? "Squads &amp; debriefing" : "Hand-ins", handed, handins, sq)}
      ${sec("brief", "Brief &amp; evaluation grid", briefMeta, briefBody)}
      ${sec("type", "Type &amp; squads", sq ? `${B.squadRows.length} squads` : "individual", typeBody)}
      ${sec("dates", ctx.sps.length ? "Dates &amp; sprint" : "Dates", `${b.start_at ? fmtDate(b.start_at) + " → " : ""}${fmtDate(b.due_at)}${ctx.sps.length ? " · " + (sp ? sp.title : "no sprint") : ""}`, datesBody)}
      <p class="toolbar wf-act">${wAnnBtn(b)}<button class="btn small" data-wstat="${b.id}">Post status in Discord</button><a class="btn small" href="#/brief/${b.id}">Open the brief</a><button class="btn small danger" data-wf-del>Delete</button></p>`}
    </div></details>`;
  const card = $("details.wf", box);
  card.addEventListener("toggle", () => {
    if (card.open !== wfOpen(item.id, !passed)) wfOpen(item.id, null, card.open);
    if (card.open && !B) wfCard(box, item, ctx);
  });
  if (!B) return;
  const id = b.id;
  const again = async (msg) => { if (msg) toast(msg); const nb = await api(`/briefs/${id}`); item.due_at = nb.brief.due_at; wfCard(box, item, ctx, nb); };
  wireBriefButtons(box, () => again());
  // hand-ins: the teacher sets or fixes a repo
  $$("[data-wf-hi]", box).forEach((x) => x.onclick = () => openDialog("Repo handed in", `
      <label for="wf-r">GitHub repo <span class="muted">(owner/repo or its link; empty = remove)</span></label><input type="text" id="wf-r" style="width:100%" value="${esc(x.dataset.repo)}">
      <label for="wf-p">Planning board <span class="muted">(Trello, Jira or GitHub Project, optional)</span></label><input type="url" id="wf-p" style="width:100%" value="${esc(x.dataset.plan)}">`,
    [{ label: "Save", primary: true, action: async () => {
      const nb = await api(`/briefs/${id}/handin`, { method: "POST", body: { who: x.dataset.wfHi, repo: $("#wf-r").value, plan: $("#wf-p").value } });
      dlg.close(); toast("Saved"); wfCard(box, item, ctx, nb);
    } }]));
  // the brief, its grid and its steps
  const sb = $('[data-sec="brief"]', box);
  const putBrief = (data, extra = {}) => api(`/briefs/${id}`, { method: "PUT", body: { data, kind: B.kind, squads: B.squads, repo_hint: $("[data-wf-repo]", sb).value, ...extra } });
  $("[data-wf-bsave]", sb).onclick = (e) => busy(e.currentTarget, async () => {
    const cs = $("[data-wf-comps]", sb).value.replace(/\s+(?=N\d)/gi, "").split(/[\s,;]+/).map(parseC).filter(Boolean).map((p) => p.code + (p.level ? "N" + p.level : ""));
    await putBrief({ ...b.data, competencies: [...new Set(cs)] });
    const gt = $("[data-wf-gridtext]", sb).value, stt = $("[data-wf-stepstext]", sb).value;
    if (gt.trim() && gt !== B.gridText) await api(`/briefs/${id}/grid`, { method: "PUT", body: { text: gt } });
    if (stt !== B.stepsText) await api(`/briefs/${id}/steps`, { method: "PUT", body: { text: stt } });
    await again("Saved");
  });
  $("[data-wf-grid]", sb).onclick = (e) => {
    const btn = e.currentTarget;
    const go = () => busy(btn, async () => { btn.textContent = "Reading the brief… (up to 1 min)"; await api(`/briefs/${id}/grid`, { method: "POST", body: {} }); await again("New grid made"); });
    gridN ? confirmDialog("Replace the grid?", "Your changes to this grid are lost.", "Make it again", go) : go();
  };
  $("[data-wf-steps]", sb).onclick = (e) => {
    const btn = e.currentTarget;
    const go = () => busy(btn, async () => { const r = await api(`/briefs/${id}/steps`, { method: "POST", body: {} }); await again(r.steps.length ? "Steps proposed: check them" : "No steps found in the brief: write them below"); });
    B.steps.length ? confirmDialog("Replace the steps?", "The steps are written again from the brief.", "Replace", go) : go();
  };
  $("[data-wf-file]", sb).onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (!/\.html?$/i.test(f.name) && f.type !== "text/html") { toast("Choose the page saved as .html.", true); return; }
    const run = async () => {
      await loadRef();
      const s = simplonParse(await f.text(), REF.referential);
      const r = await api("/briefs/import", { method: "POST", body: { ...s, preview: true } });
      toast("Brief read: making the grid…");
      await putBrief({ ...r.data, title: b.data.title, modalities: { ...r.data.modalities, start: md.start, due: md.due, ...(md.time ? { time: md.time } : {}) } });
      await api(`/briefs/${id}/grid`, { method: "POST", body: {} }).catch((err) => toast(err.message, true));
      if (!B.steps.length) await api(`/briefs/${id}/steps`, { method: "POST", body: {} }).catch(() => {});
      await again("Brief imported, grid made");
    };
    (b.data.context || (b.data.groups || []).length) ? confirmDialog("Replace the brief?", "A new grid is made from the new page.", "Replace", run) : run().catch((err) => toast(err.message, true));
  };
  // type & squads: the class's squads load when the section opens
  const sk = $('[data-sec="type"]', box);
  const squads = JSON.parse(JSON.stringify(B.squads || []));
  let board = null;
  const mountBoard = () => {
    if (board) return;
    board = true;
    api("/squads").then((d) => {
      const sel = $("[data-wf-from]", sk);
      sel.innerHTML = d.sets.length ? d.sets.map((x) => `<option value="${x.id}" ${x.active ? "selected" : ""}>${esc(x.name)}${x.active ? " · current" : ""} (${x.squads.length} squads)</option>`).join("") : `<option value="">No class squads yet (Teams & squads)</option>`;
      board = squadBoard($("[data-wf-board]", sk), d.students, squads, () => {});
      $("[data-wf-load]", sk).onclick = () => {
        const set = d.sets.find((x) => String(x.id) === sel.value);
        if (!set) { location.hash = "#/teams"; return; }
        squads.splice(0, squads.length, ...set.squads.map((x) => ({ ...x, members: [...x.members] })));
        board.redraw();
      };
      if (!squads.length && d.sets.length && segVal(sk, "wfk" + id) === "squad") $("[data-wf-load]", sk).click();
    }).catch((err) => toast(err.message, true));
  };
  wireSeg(sk, "wfk" + id, (v) => { $("[data-wf-sqbox]", sk).hidden = v !== "squad"; if (v === "squad") mountBoard(); });
  sk.addEventListener("toggle", () => { if (sk.open && sq) mountBoard(); });
  $("[data-wf-sqsave]", sk).onclick = (e) => busy(e.currentTarget, async () => {
    const kind = segVal(sk, "wfk" + id), keep = squads.filter((s) => s.members.length);
    if (kind === "squad" && !keep.length) throw new Error("Make or load the squads first.");
    await api(`/briefs/${id}`, { method: "PUT", body: { kind, squads: kind === "squad" ? keep : [], repo_hint: B.repo_hint } });
    await again("Saved");
  });
  // dates & sprint
  const sd = $('[data-sec="dates"]', box);
  wSprintField(sd, b.sprint ?? null, "[data-wf-d]", b.week);
  $("[data-wf-dsave]", sd).onclick = (e) => busy(e.currentTarget, async () => {
    const start = $("[data-wf-s]", sd).value, due = $("[data-wf-d]", sd).value;
    if (!due) throw new Error("Choose the due date.");
    if (start && start > due) throw new Error("The start date must be before the due date.");
    await api(`/briefs/${id}/assign`, { method: "POST", body: { start, due, time: $("[data-wf-t]", sd).value, ...($(".w-sp", sd) ? { sprint: $(".w-sp", sd).value } : {}), announce: false } });
    await again("Saved");
  });
  $("[data-wf-del]", box).onclick = () => confirmDialog(`Delete “${b.data.title}”?`, "Its reminders stop. Hand-ins and draft debriefs go; finalized debriefs stay.", "Delete",
    async () => { await api(`/briefs/${id}`, { method: "DELETE" }); box.remove(); toast("Deleted"); }, true);
}

// ================================================================= Simple mode (like GitHub Watcher), a switch under the menu, kept in this browser:
// a short menu (GitHub, Briefs, Sprints, Competencies, Teams & squads, Settings), GitHub as the home page, Briefs opens on
// the cards with one "+ New brief" (the AI, import and blank briefs under "More"), shorter debrief texts. Off = nothing changes.
const wSimple = () => { try { return localStorage.getItem("cb-simple") === "1"; } catch { return false; } };
const W_KEEP = ["#/github", "#/briefs", "#/sprints", "#/progress", "#/competencies", "#/teams", "#/settings"];
function wApplySimple() {
  const on = wSimple();
  document.body.classList.toggle("cb-simple", on);
  $$("#nav a").forEach((a) => a.classList.toggle("cb-keep", W_KEEP.includes(a.getAttribute("href"))));
  if ($("#cb-simple-t")) $("#cb-simple-t").checked = on;
}
(() => {
  const st = document.createElement("style");
  st.textContent = `
.cb-simple #nav a:not(.cb-keep), .cb-simple #nav .nav-label { display: none; }
.cb-simple #nav a[href="#/github"] { order: -6; } .cb-simple #nav a[href="#/briefs"] { order: -5; } .cb-simple #nav a[href="#/sprints"] { order: -4; }
.cb-simple #nav a[href="#/progress"] { order: -4; } .cb-simple #nav a[href="#/competencies"] { order: -3; } .cb-simple #nav a[href="#/teams"] { order: -2; } .cb-simple #nav a[href="#/settings"] { order: -1; }
.cb-simple-sw { display: flex; gap: 8px; align-items: center; padding: 8px 10px; margin-top: 8px; color: var(--ink-soft); font-size: 13px; cursor: pointer; border-top: 1px solid var(--line); }
.cb-more { position: relative; display: inline-block; } .cb-more > summary { list-style: none; } .cb-more > summary::-webkit-details-marker { display: none; }
.cb-more-menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 20; display: flex; flex-direction: column; gap: 4px; min-width: 190px;
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-m); padding: 6px; box-shadow: var(--shadow-m); }
.cb-more-menu .btn { width: 100%; justify-content: flex-start; }
.cb-simple #db-body .empty-state p.muted, .cb-simple #db-cst, .cb-simple .db-side > section:last-child > p.small.muted { display: none; }`;
  document.head.append(st);
  const nav = $("#nav");
  if (!nav) return;
  const sw = document.createElement("label");
  sw.className = "cb-simple-sw";
  sw.innerHTML = `<input type="checkbox" id="cb-simple-t"> Simple mode`;
  nav.after(sw);
  $("#cb-simple-t").onchange = (e) => {
    try { localStorage.setItem("cb-simple", e.target.checked ? "1" : "0"); } catch { /* this visit only */ }
    wApplySimple();
    if (e.target.checked && ![...W_KEEP, "#/brief/", "#/debrief/"].some((h) => location.hash.startsWith(h))) location.hash = "#/github"; else route();
  };
  wApplySimple();
})();

// Briefs in simple mode: the cards first, one "+ New brief", the other ways under "More"
const wBriefsFull = routes.briefs;
async function wBriefs(tab) {
  if (!wSimple()) return wBriefsFull(tab);
  await wBriefsFull(tab || "follow");
  const q = $("#br-quick");
  if (!q) return;
  ["#br-import", "#br-blank", "#br-new"].forEach((s) => { if ($(s)) $(s).style.display = "none"; });
  q.textContent = "+ New brief";
  q.classList.add("primary");
  const more = document.createElement("details");
  more.className = "cb-more";
  more.innerHTML = `<summary class="btn">More ▾</summary><div class="cb-more-menu"><button class="btn" data-m="#br-new">✨ Write it with AI</button>
    <button class="btn" data-m="#br-import">📄 Import a page</button><button class="btn" data-m="#br-blank">Blank brief</button></div>`;
  q.before(more);
  $$("[data-m]", more).forEach((b) => b.onclick = () => { more.open = false; $(b.dataset.m).click(); });
  $$('[data-t="plan"], [data-t="prog"]').forEach((b) => { b.style.display = "none"; });
  const f = $('[data-t="follow"]');
  if (f) f.parentElement.prepend(f);
  const sub = $(".page-head .sub", view);
  if (sub) sub.hidden = true;
}

// ================================================================= Debrief: oral questions (5 max) and the level (like GitHub Watcher)
const W_LV = [["excellent", "Excellent"], ["bon", "Bon"], ["moyen", "Moyen"], ["faible", "Faible"], ["critique", "Critique"]];
const W_LV_NAME = Object.fromEntries(W_LV);
(() => {
  const st = document.createElement("style");
  st.textContent = `
.pgc-excellent { --c: #15803d; } .pgc-bon { --c: #22a55a; } .pgc-moyen { --c: #e0a030; } .pgc-faible { --c: #f87171; } .pgc-critique { --c: #dc2626; }
.w-lv.on { background: var(--c); border-color: var(--c); color: #fff; } .w-lv.prop { border: 2px dashed var(--c); }
.w-or-row { grid-template-columns: 44px minmax(0, 1fr) auto; }
.pg-table { border-collapse: collapse; } .pg-table th, .pg-table td { padding: 5px 8px; text-align: left; white-space: nowrap; }
.pg-table th.pg-b { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 12px; font-weight: 600; color: var(--ink-soft); max-height: 130px; overflow: hidden; }
.pg-sq { display: inline-block; width: 22px; height: 22px; border-radius: 6px; border: 1.5px solid var(--line-strong); vertical-align: middle; }
.pg-sq.has { background: var(--c); border-color: var(--c); } .pg-sq.ev { border-style: dashed; border-color: var(--ink-soft); }
.pg-year { display: inline-flex; gap: 10px; font-size: 13px; font-weight: 700; } .pg-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; background: var(--c); }`;
  document.head.append(st);
})();

// The level proposed from the switches on the screen: brief 40 %, competencies 30 %, oral questions and mise en situation 15 % each
function wPropLevel() {
  const ex = DB.R.review?.result?.exigences || [];
  const s = currentStates();
  const exOn = (i) => (typeof s.ex[i] === "boolean" ? s.ex[i] : !!(DB.R.states?.ex || [])[i]);
  const main = ex.map((e, i) => i).filter((i) => ex[i].type !== "bonus" && ex[i].type !== "oral");
  const parts = [];
  if (main.length) parts.push([0.4, main.filter(exOn).length / main.length]);
  const co = Object.values(s.co);
  if (co.length) parts.push([0.3, co.filter(Boolean).length / co.length]);
  const or = s.oral || DB.R.states?.oral || [];
  if (or.length) parts.push([0.15, or.filter(Boolean).length / or.length]);
  const m = { valide: 1, partiel: 0.5, non_valide: 0 }[s.mes.r];
  if (m !== undefined) parts.push([0.15, m]);
  if (!parts.length) return "";
  const sc = parts.reduce((x, p) => x + p[0] * p[1], 0) / parts.reduce((x, p) => x + p[0], 0);
  return sc >= 0.9 ? "excellent" : sc >= 0.75 ? "bon" : sc >= 0.55 ? "moyen" : sc >= 0.35 ? "faible" : "critique";
}

// Called at the end of the debrief page: fills its "Oral questions" and "Level" panels
function wDebriefExtras() {
  const rec = DB.R.review, final = DB.R.status === "final";
  const box = $("#db-oral"), lvBox = $("#db-level"), body = $("#db-body");
  if (!rec || !box || !lvBox) return;
  const qs = rec.oral || [], st = DB.R.states?.oral || [];
  const head = () => `Oral questions${qs.length ? ` <span class="muted">${$$("[data-or]:checked", box).length}/${qs.length}</span>` : ""}`;
  box.innerHTML = `<div class="panel-head" style="margin:0"><h2 id="db-orh"></h2>
      ${final ? "" : `<button class="btn small" id="db-ornew">${qs.length ? "Other questions" : "✨ Propose questions"}</button>`}</div>
    ${qs.length ? `<div class="db-rows">${qs.map((q, i) => `<div class="db-row w-or-row">${sw(`data-or="${i}"`, !!st[i], final)}
      <div><b>${i + 1}. ${esc(q.q)}</b><div class="small"><span class="muted">Expected:</span> ${esc(q.a)}</div>${q.notion ? `<div class="small muted">${esc(q.notion)}</div>` : ""}</div>
      ${final ? "<span></span>" : `<button class="btn small" data-ordel="${i}" title="Remove" aria-label="Remove question ${i + 1}">✕</button>`}</div>`).join("")}</div>` : ""}`;
  $("#db-orh", box).innerHTML = head();
  $$("[data-or]", box).forEach((c) => c.onchange = () => { $("#db-orh", box).innerHTML = head(); saveStatesSoon(); DB.lvDraw?.(); });
  if ($("#db-ornew", box)) $("#db-ornew", box).onclick = (e) => {
    const btn = e.currentTarget;
    const go = () => busy(btn, async () => {
      toast("⏳ The AI writes the questions…");
      const R = await api(`/briefs/${DB.bid}/review/oral`, { method: "POST", body: { who: DB.who } });
      DB.R = { ...DB.R, ...R };
      wDebriefExtras();
      saveStatesSoon();
    });
    if (qs.length) confirmDialog("Replace these questions?", "Another set of questions is written.", "Replace", go); else go();
  };
  $$("[data-ordel]", box).forEach((b) => b.onclick = () => busy(b, async () => {
    const R = await api(`/briefs/${DB.bid}/review/oral`, { method: "POST", body: { who: DB.who, del: Number(b.dataset.ordel), states: { oral: currentStates().oral } } });
    DB.R = { ...DB.R, ...R };
    wDebriefExtras();
    saveStatesSoon();
  }));
  // the level: proposed (dashed) from the switches, yours when you click; it can be changed at any time
  const draw = () => {
    const p = wPropLevel(), cur = (DB.R.review?.level || {}).lvl || "";
    lvBox.innerHTML = `<h2>Level</h2><p class="muted small" style="margin:0 0 8px">${p ? `Proposed: <b>${W_LV_NAME[p]}</b>` : "Switch the points first."}${cur ? ` · yours: <b>${W_LV_NAME[cur]}</b>` : ""}</p>
      <div class="toolbar" style="margin:0">${W_LV.map(([v, l]) => `<button class="btn small w-lv pgc-${v} ${cur === v ? "on" : !cur && p === v ? "prop" : ""}" data-lv="${v}">${l}</button>`).join("")}</div>`;
    $$("[data-lv]", lvBox).forEach((b) => b.onclick = () => busy(b, async () => {
      const next = cur === b.dataset.lv ? "" : b.dataset.lv;
      const R = await api(`/briefs/${DB.bid}/review/level`, { method: "POST", body: { who: DB.who, level: next } });
      DB.R = { ...DB.R, ...R };
      toast(next ? `Level saved: ${W_LV_NAME[next]}` : "Level removed");
      draw();
    }));
  };
  DB.lvDraw = draw;
  draw();
  if (body && !body.dataset.wlv) {
    body.dataset.wlv = "1";
    body.addEventListener("change", () => DB.lvDraw?.());
    body.addEventListener("click", (e) => { if (e.target.closest('[data-seg="mes"]')) setTimeout(() => DB.lvDraw?.(), 0); });
  }
}

// ================================================================= Progress: one column per brief, one square per debrief (its level)
const W_PG = { filter: "all", sort: "name" };
async function viewProgress() {
  const P = await api("/progress");
  const rank = { critique: 0, faible: 1, moyen: 2, bon: 3, excellent: 4 };
  const byName = (a, b) => a.s.name.localeCompare(b.s.name, undefined, { sensitivity: "base" });
  const rows = P.students.map((s) => {
    const lv = P.briefs.map((b) => P.cells[`${b.id}:${s.discord_id}`] || null);
    const count = Object.fromEntries(W_LV.map(([v]) => [v, lv.filter((c) => c && c.lv === v).length]));
    const set = lv.filter((c) => c && c.lv in rank);
    return { s, lv, count, low: count.faible + count.critique, avg: set.length ? set.reduce((t, c) => t + rank[c.lv], 0) / set.length : 9 };
  }).filter((x) => W_PG.filter === "all" || x.low > 0).sort(W_PG.sort === "low" ? (a, b) => a.avg - b.avg || byName(a, b) : byName);
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`).join("");
  const legend = W_LV.map(([v, l]) => `<span style="margin-right:12px"><i class="pg-dot pgc-${v}"></i>${l}</span>`).join("");
  view.innerHTML = `<div class="page-head"><div><h1>Progress</h1><p class="sub">One square per debrief: its level.</p></div></div>
    <div class="toolbar"><select id="pg-f">${opt([["all", "All students"], ["low", "Faible or Critique"]], W_PG.filter)}</select>
      <select id="pg-s">${opt([["name", "Name"], ["low", "Lowest level first"]], W_PG.sort)}</select></div>
    ${!P.briefs.length ? `<div class="empty-state"><p class="muted">No debrief yet.</p></div>` : `<section class="panel"><div class="table-wrap"><table class="pg-table">
      <thead><tr><th></th>${P.briefs.map((b) => `<th class="pg-b" title="${esc(b.title)}">${esc(b.title.slice(0, 24))}</th>`).join("")}<th>Over the year</th></tr></thead>
      <tbody>${rows.map((x) => `<tr><td><b>${esc(x.s.name)}</b></td>${x.lv.map((c, i) => {
        const b = P.briefs[i];
        return `<td>${c ? `<a class="pg-sq ${c.lv ? "has pgc-" + c.lv : "ev"}" href="#/debrief/${b.id}~${encodeURIComponent(c.who)}" title="${esc(b.title)}: ${c.lv ? W_LV_NAME[c.lv] : "debriefed, no level yet"}" aria-label="${esc(x.s.name)}, ${esc(b.title)}: ${c.lv ? W_LV_NAME[c.lv] : "no level"}"></a>`
          : `<span class="pg-sq" title="${esc(b.title)}: no debrief"></span>`}</td>`;
      }).join("")}<td><span class="pg-year">${W_LV.filter(([v]) => x.count[v]).map(([v, l]) => `<span title="${l}"><i class="pg-dot pgc-${v}"></i>${x.count[v]}</span>`).join("")}</span></td></tr>`).join("")}</tbody></table></div>
      <p class="muted small" style="margin:10px 0 0">${legend}</p></section>`}`;
  $("#pg-f").onchange = (e) => { W_PG.filter = e.target.value; viewProgress(); };
  $("#pg-s").onchange = (e) => { W_PG.sort = e.target.value; viewProgress(); };
}

// one GitHub page (the Watcher's view of it); old Watcher links lead there
Object.assign(routes, { github: viewGithubAll, watch: () => { location.hash = "#/github"; }, "watch-students": () => { location.hash = "#/github"; }, sprints: viewSprints, progress: viewProgress });
// simple mode: Briefs on the cards, GitHub as the home page
Object.assign(routes, { briefs: wBriefs, overview: () => (wSimple() ? (location.hash = "#/github") : viewOverview()) });
