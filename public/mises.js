"use strict";
// « Mises en situation »: live practical tests written with Claude outside the app (src/shared/mises.ts).
//   #/mises-en-situation   the sessions, and « New »: week → competencies → learners → the prompt for Claude → its JSON
//   #/mise/<id>            Content · Live (refreshed every 5 s) · Statistics · Results, and one learner in detail
// Loaded after app.js and learning.js (it uses their helpers: table, meter, compChip, jsonBox, replayShow…).
/* global $, $$, api, esc, toast, busy, view, dlg, openDialog, confirmDialog, table, status, avatar, fmtDateTime, fmtDate, fmtAgo, masteryInk, masteryColor, meter, copyText, compChip, jsonBox, wireJsonBox, problemsHtml, saveBlob, replayShow, hbars, segHtml, wireSeg, loadRef, routes, S */
const MSIT = { list: null, setup: null, d: null, tab: "live", filter: "all", timer: null, draft: null };
window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#/mise/")) { clearInterval(MSIT.timer); MSIT.timer = null; } });
const MES_STATUS = { draft: ["draft", "Draft"], scheduled: ["pending", "Scheduled"], live: ["active", "Live"], closed: ["closed", "Closed"] };
const mesStatus = (s) => status(...(MES_STATUS[s] || ["draft", s]));
const MES_LIVE = { "not-started": ["none", "Not started"], working: ["ok", "Working"], done: ["good", "Done"], absent: ["warn", "Absent"] };
const mesLive = (s) => `<span class="lvl ${(MES_LIVE[s] || ["none"])[0]}">${esc((MES_LIVE[s] || ["", s])[1])}</span>`;
const mesDur = (s) => (!s ? "—" : s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` : s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}` : `${s} s`);
const RUNTIME = { web: "HTML/CSS/JS (browser)", node: "Node.js (runner)", php: "PHP (runner)", sql: "SQL (sql.js)" };
const CHECK_TYPE = { source: "in the code", "dom-exists": "element exists", "dom-text": "text shown", css: "CSS value", console: "console", js: "JS value", output: "output", "sql-rows": "rows returned" };
/** S1…S5 for the situations, Q1…Q5 for the QCM. */
function mesItemLabel(c, id) {
  if (!id) return "—";
  const i = c.situations.findIndex((s) => s.id === id);
  return i >= 0 ? `S${i + 1}` : `Q${c.qcm.findIndex((q) => q.id === id) + 1}`;
}
const mesItems = (c) => [...c.situations.map((s) => s.id), ...c.qcm.map((q) => q.id)];
/** An item's weight in the score: its points, and their share of all the points (in %). */
function mesWeight(c, id) {
  const all = [...c.situations, ...c.qcm], it = all.find((x) => x.id === id);
  const total = all.reduce((s, x) => s + (x.points || 0), 0) || 1, pts = it?.points || 0;
  return { pts, total, pct: Math.round((1000 * pts) / total) / 10 };
}

// ======================================================================= the list
async function viewMises() {
  const r = await api("/mises");
  MSIT.list = r.items;
  const live = r.items.filter((m) => m.status === "live");
  view.innerHTML = `
    <div class="page-head"><div><h1>Mises en situation</h1><p class="sub">Live practical tests for the class: 5 situations with real code (increasing difficulty) and 5 QCM, written with Claude for the week's programme. Learners code in their browser; you follow each one live.</p></div>
      <div class="toolbar" style="margin:0"><button class="btn primary" id="mes-new">＋ New mise en situation</button></div></div>
    <div class="figures cs-figs">
      <div class="figure"><span class="ico">🧪</span><div><b>${live.length}</b><span>live now</span></div></div>
      <div class="figure"><span class="ico">👩‍💻</span><div><b>${live.reduce((s, m) => s + (m.started - m.done), 0)}</b><span>learners working</span></div></div>
      <div class="figure"><span class="ico">✅</span><div><b>${r.items.reduce((s, m) => s + m.done, 0)}</b><span>papers handed in</span></div></div>
    </div>
    <div id="mes-wiz"></div>
    <section class="panel">${table([
      { label: "Mise en situation", sort: "title", html: (m) => `<b>${esc(m.title)}</b>${m.comps.length ? `<div style="margin-top:4px">${m.comps.map((c) => compChip(c)).join(" ")}</div>` : ""}` },
      { label: "Week", num: true, sort: "week", html: (m) => (m.week ? `${m.week}` : "—") },
      { label: "Status", sort: "status", html: (m) => `${mesStatus(m.status)}${m.status === "scheduled" ? `<div class="small muted">${fmtDateTime(m.starts_at)}</div>` : m.status === "live" && m.ends_at ? `<div class="small muted">until ${fmtDateTime(m.ends_at)}</div>` : ""}` },
      { label: "Learners", num: true, html: (m) => `${m.done}/${m.takers}${m.started > m.done ? ` <span class="pill-inline">${m.started - m.done} working</span>` : ""}` },
      { label: "Average", num: true, sort: "avg", html: (m) => (m.avg == null ? "—" : `<b style="color:${masteryInk(m.avg)}">${m.avg}%</b>`) },
      { label: "Created", sort: "created_at", html: (m) => `<span class="small">${fmtDate(m.created_at)}</span>` },
    ], r.items, { onRow: (m) => (location.hash = `#/mise/${m.id}`), empty: "No mise en situation yet: click “New mise en situation”." })}</section>`;
  $("#mes-new").onclick = (e) => busy(e.currentTarget, () => mesWizard());
}

// ======================================================================= « New »: 5 steps
async function mesWizard() {
  const [st] = await Promise.all([MSIT.setup ? Promise.resolve(MSIT.setup) : api("/mises/setup"), loadRef().catch(() => null)]);
  MSIT.setup = st;
  const w0 = st.weeks.find((w) => w.n === st.current) || st.weeks[0];
  const W = MSIT.draft = { week: w0?.n ?? null, sprint: w0?.sprint ?? null, comps: [], all: true, picked: new Set(), checked: "", prompt: "" };
  const box = $("#mes-wiz");
  box.innerHTML = `<section class="panel mes-wiz">
    <div class="panel-head"><h2>New mise en situation</h2><button class="btn small" id="mw-x">Cancel</button></div>
    <ol class="mes-steps">
      <li><b>Programme week</b><div class="field-row">
        <div><label for="mw-sp">Sprint</label><select id="mw-sp"><option value="">All sprints</option>${st.sprints.map((s) => `<option value="${s.n}">Sprint ${s.n} · ${esc(s.title)}</option>`).join("")}</select></div>
        <div><label for="mw-wk">Week</label><select id="mw-wk"></select></div></div>
        <p class="small muted" id="mw-wkinfo"></p></li>
      <li><b>Competencies to test</b> <span class="muted small">(of the week and its sprint)</span><div class="mes-chips" id="mw-comps"></div></li>
      <li><b>Learners</b><div class="seg-row">${segHtml("mw-who", [["all", "The whole class"], ["some", "A selection"]], "all")} <span class="small muted" id="mw-n"></span></div>
        <div id="mw-pick" hidden>
          <div class="toolbar" style="margin:8px 0"><input type="search" id="mw-q" placeholder="Search a learner…" aria-label="Search a learner" style="flex:1;min-width:160px">
            <button class="btn small" id="mw-alls" type="button">Select all</button><button class="btn small" id="mw-none" type="button">None</button></div>
          ${st.teams.length || st.squads.length ? `<div class="mes-groups small"><span class="muted">Add a group:</span> ${[...st.teams.map((t) => ({ k: "t" + t.id, name: "👥 " + t.name, m: t.members })), ...st.squads.map((q) => ({ k: "s" + q.id, name: "🧩 " + q.name, m: q.members }))].map((g) => `<button class="btn small" type="button" data-grp="${esc(g.k)}">${esc(g.name)}</button>`).join(" ")}</div>` : ""}
          <div class="mes-people" id="mw-people">${st.students.map((s) => `<label class="check" data-name="${esc((s.name || s.discord_id).toLowerCase())}"><input type="checkbox" value="${esc(s.discord_id)}"> ${avatar(s.name, s.discord_id)} ${esc(s.name || s.discord_id)}</label>`).join("")}</div>
        </div>
        <div class="mes-test">${(st.staff || []).length
          ? `<span class="small"><b>🧪 Test it yourself</b> <span class="muted">(you get it by DM like a learner; not counted in the class, nothing goes to your record)</span></span>
             <div class="mes-chips">${st.staff.map((s) => `<label class="check"><input type="checkbox" data-tester value="${esc(s.discord_id)}"> ${avatar(s.name, s.discord_id)} ${esc(s.name || s.discord_id)} <span class="tag">staff</span></label>`).join("")}</div>`
          : `<span class="small muted">🧪 To test it yourself as a learner, use any ClassBot command in the class's Discord first (for example <code>/profile</code>): you'll appear here.</span>`}</div></li>
      <li><b>The prompt for Claude</b>
        <div class="field-row"><div><label for="mw-met">Job / theme <span class="muted">(optional)</span></label><input type="text" id="mw-met" placeholder="e.g. a cooperative of argan oil, a riad in Fès, a pharmacy"></div></div>
        <div class="toolbar" style="margin:8px 0 0"><button class="btn primary" id="mw-gen" type="button">✨ Generate the prompt for Claude</button><button class="btn" id="mw-cp" type="button" hidden>📋 Copy</button></div>
        <textarea id="mw-prompt" class="cj-json" readonly hidden aria-label="The prompt for Claude"></textarea></li>
      <li><b>Claude's JSON</b> <span class="muted small">(format <code>classbot-mise-en-situation@1</code>)</span>
        ${jsonBox("mw-json", '{ "format": "classbot-mise-en-situation@1", "title": "…", "situations": [ … ], "qcm": [ … ] }')}
        <div id="mw-prev"></div>
        <div class="toolbar" style="margin:10px 0 0"><button class="btn primary" id="mw-check" type="button">Check</button></div></li>
    </ol></section>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
  const weekSel = $("#mw-wk"), spSel = $("#mw-sp");
  const weeksOf = () => st.weeks.filter((w) => !spSel.value || String(w.sprint) === spSel.value);
  const drawWeeks = () => {
    const list = weeksOf();
    if (!list.some((w) => w.n === W.week)) W.week = list[0]?.n ?? null;
    weekSel.innerHTML = list.map((w) => `<option value="${w.n}" ${w.n === W.week ? "selected" : ""}>Week ${w.n}${w.sprint ? ` · sprint ${w.sprint}` : ""} · ${esc(w.title || "")}${w.n === st.current ? " (this week)" : ""}</option>`).join("") || `<option value="">No week</option>`;
    drawComps();
  };
  const drawComps = () => {
    const w = st.weeks.find((x) => x.n === W.week);
    const sp = st.sprints.find((s) => s.n === w?.sprint);
    $("#mw-wkinfo").textContent = w ? `${w.start} → ${w.end}` : "";
    const fromWeek = [...(w?.competencies || []), ...(w?.soft || [])];
    const list = [...new Set([...fromWeek, ...(sp?.tech || []), ...(sp?.soft || [])])];
    if (!W.comps.length || !W.comps.every((c) => list.includes(c))) W.comps = (w?.competencies || []).slice(0, 2);
    const name = (c) => { const p = parseC(c); return p ? (st.referential.find((r) => r.code === cLabel(p.code))?.name || "") : ""; };
    $("#mw-comps").innerHTML = list.length ? list.map((c) => `<button type="button" class="mes-chip ${/^CT/.test(c) ? "soft" : ""}" data-comp="${esc(c)}" aria-pressed="${W.comps.includes(c)}" title="${esc(name(c))}"><b>${esc(cText(c))}</b> ${esc(name(c))}${fromWeek.includes(c) ? "" : ` <span class="muted">(sprint)</span>`}</button>`).join("")
      : `<p class="small muted">This week has no competency in the programme: pick another week.</p>`;
    $$("[data-comp]").forEach((b) => b.onclick = () => { const c = b.dataset.comp; W.comps = W.comps.includes(c) ? W.comps.filter((x) => x !== c) : [...W.comps, c]; b.setAttribute("aria-pressed", String(W.comps.includes(c))); resetPrompt(); });
    resetPrompt();
  };
  const resetPrompt = () => { W.prompt = ""; $("#mw-prompt").hidden = true; $("#mw-cp").hidden = true; W.checked = ""; $("#mw-check").textContent = "Check"; };
  spSel.value = W.sprint ? String(W.sprint) : "";
  spSel.onchange = drawWeeks;
  weekSel.onchange = () => { W.week = Number(weekSel.value) || null; W.comps = []; drawComps(); };
  drawWeeks();
  // learners: the whole class, or a selection (search, all / none, a team or a squad)
  const people = $("#mw-people");
  const count = () => { W.picked = new Set($$("input:checked", people).map((x) => x.value)); $("#mw-n").textContent = W.all ? `${st.students.length} learners` : `${W.picked.size} selected`; };
  wireSeg(box, "mw-who", (v) => { W.all = v === "all"; $("#mw-pick").hidden = W.all; count(); });
  $("#mw-q").oninput = () => { const q = $("#mw-q").value.trim().toLowerCase(); $$("label", people).forEach((l) => { l.hidden = !!q && !l.dataset.name.includes(q); }); };
  $("#mw-alls").onclick = () => { $$("label:not([hidden]) input", people).forEach((x) => { x.checked = true; }); count(); };
  $("#mw-none").onclick = () => { $$("input", people).forEach((x) => { x.checked = false; }); count(); };
  $$("[data-grp]").forEach((b) => b.onclick = () => {
    const k = b.dataset.grp, g = k[0] === "t" ? st.teams.find((t) => "t" + t.id === k) : st.squads.find((q) => "s" + q.id === k);
    for (const id of g?.members || []) { const x = $(`input[value="${CSS.escape(id)}"]`, people); if (x) x.checked = true; }
    count();
  });
  people.onchange = count;
  count();
  $("#mw-x").onclick = () => { box.innerHTML = ""; };
  $$("[data-tester]", box).forEach((x) => x.onchange = () => { W.checked = ""; $("#mw-check").textContent = "Check"; });
  $("#mw-met").oninput = resetPrompt;
  $("#mw-gen").onclick = (e) => busy(e.currentTarget, async () => {
    if (!W.week) throw new Error("Pick a week of the programme.");
    if (!W.comps.length) throw new Error("Choose at least one competency.");
    const r = await api("/mises/prompt", { method: "POST", body: { week: W.week, comps: W.comps, metier: $("#mw-met").value } });
    W.prompt = r.prompt;
    const ta = $("#mw-prompt"); ta.value = r.prompt; ta.hidden = false; $("#mw-cp").hidden = false;
    copyText(r.prompt, "Prompt copied: paste it in Claude, then paste its JSON below");
  });
  $("#mw-cp").onclick = () => copyText(W.prompt, "Prompt copied");
  wireJsonBox(box, "mw-json", () => { W.checked = ""; $("#mw-check").textContent = "Check"; });
  $("#mw-check").onclick = (e) => busy(e.currentTarget, async () => {
    const json = $("#mw-json").value;
    if (!json.trim()) throw new Error("Paste Claude's JSON, or choose the .json file.");
    if (!W.week || !W.comps.length) throw new Error("Pick the week and the competencies first (steps 1 and 2).");
    const testers = $$("[data-tester]:checked", box).map((x) => x.value);
    if (!W.all && !W.picked.size && !testers.length) throw new Error("Pick at least one learner, or the whole class.");
    // only the teacher(s) testing it: the target is them (an empty target would mean the whole class)
    const body = { json, week: W.week, comps: W.comps, target: W.all ? [] : W.picked.size ? [...W.picked] : testers, testers };
    if (W.checked && W.checked === json) {
      const r = await api("/mises/import", { method: "POST", body: { ...body, save: true } });
      if (r.problems?.length) { $("#mw-prev").innerHTML = problemsHtml(r.problems); W.checked = ""; $("#mw-check").textContent = "Check"; return; }
      toast("Saved as a draft ✅"); MSIT.setup = null; location.hash = `#/mise/${r.id}`; return;
    }
    const r = await api("/mises/import", { method: "POST", body });
    if (r.problems.length) { $("#mw-prev").innerHTML = problemsHtml(r.problems); W.checked = ""; $("#mw-check").textContent = "Check"; return; }
    W.checked = json;
    $("#mw-prev").innerHTML = mesPreviewHtml(r.preview);
    $("#mw-check").textContent = "Save as a draft";
  });
}
function mesPreviewHtml(p) {
  return `<div class="imp-card"><b>${esc(p.title)}</b>${p.metier ? ` <span class="muted small">· ${esc(p.metier)}</span>` : ""}
    <p class="small" style="margin:6px 0">${p.situations.length} situations · ${p.qcm.length} QCM · ${p.points} points ${p.competencies.map((c) => compChip(c)).join(" ")}</p>
    <ol class="small" style="margin:6px 0">${p.situations.map((s) => `<li><b>${esc(s.title)}</b> <span class="muted">· difficulty ${s.difficulty} · ${esc(RUNTIME[s.runtime] || s.runtime)} · ${esc(s.files.join(", "))} · ${s.questions} sub-question(s) · ${s.checks} check(s)</span></li>`).join("")}</ol>
    <ol class="small muted" style="margin:6px 0">${p.qcm.map((q) => `<li>QCM · ${esc(q.question)} <span>(${q.choices} choices)</span></li>`).join("")}</ol></div>`;
}

// ======================================================================= one mise en situation
async function viewMise(id) {
  const d = await api(`/mises/${id}`);
  if (MSIT.d?.mise.id !== d.mise.id) MSIT.tab = d.mise.status === "draft" ? "content" : d.takers.length ? "live" : "content";
  MSIT.d = d;
  mesRender();
}
function mesRender() {
  const { mise: m, takers } = MSIT.d, c = m.content;
  const done = takers.filter((t) => t.status === "submitted").length;
  view.innerHTML = `
    <div class="page-head"><div><p class="crumb"><a href="#/mises-en-situation">Mises en situation</a></p><h1>${esc(m.title)}</h1>
      <p class="sub">${mesStatus(m.status)} · week ${m.week ?? "—"} · ${c.situations.length} situations + ${c.qcm.length} QCM${m.starts_at ? ` · ${m.status === "scheduled" ? "starts" : "started"} ${fmtDateTime(m.starts_at)}` : ""}${m.ends_at ? ` · ${m.status === "closed" ? "ended" : "ends"} ${fmtDateTime(m.ends_at)}` : m.status === "live" ? " · open until you close it" : ""}</p>
      <p class="iv-sum" style="margin:6px 0 0">${m.comps.map((x) => compChip(x)).join(" ")} ${m.settings.noPaste ? `<span class="tag">✋ copy-paste blocked</span>` : `<span class="tag">📋 copy-paste allowed (recorded)</span>`} ${((n) => !m.target.length ? `<span class="tag">whole class</span>` : n ? `<span class="tag">${n} learner(s) chosen</span>` : "")(m.target.filter((x) => !(m.settings.testers || []).includes(x)).length)}${(m.settings.testers || []).length ? ` <span class="tag">🧪 ${m.settings.testers.length} teacher(s) testing</span>` : ""}</p></div>
      <div class="toolbar" style="margin:0">
        ${m.status === "draft" ? `<button class="btn primary" id="me-launch">🚀 Launch for the class</button>` : ""}
        ${m.status === "live" || m.status === "scheduled" ? `<button class="btn" id="me-add">＋ Add learners</button><button class="btn" id="me-ext">⏱ More time</button><button class="btn danger" id="me-close">Close for everyone</button>` : ""}
        ${m.status === "closed" ? `<button class="btn" id="me-ext">⏱ Reopen with more time</button>` : ""}
        <button class="btn danger" id="me-del">Delete</button></div></div>
    <div class="tabs" role="tablist">
      <button role="tab" data-mt="content">Content</button>
      <button role="tab" data-mt="live">Live (${takers.length})</button>
      <button role="tab" data-mt="stats">Statistics</button>
      <button role="tab" data-mt="results">Results (${done})</button>
    </div>
    <div id="me-tab"></div>`;
  const tabs = { content: mesContentTab, live: mesLiveTab, stats: mesStatsTab, results: mesResultsTab };
  const show = (k) => {
    MSIT.tab = k;
    $$("[data-mt]").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.mt === k)));
    tabs[k]($("#me-tab"));
  };
  $$("[data-mt]").forEach((x) => x.onclick = () => show(x.dataset.mt));
  show(MSIT.tab);
  if ($("#me-launch")) $("#me-launch").onclick = () => mesLaunchDialog();
  if ($("#me-add")) $("#me-add").onclick = (e) => busy(e.currentTarget, () => mesAddDialog());
  if ($("#me-ext")) $("#me-ext").onclick = () => mesExtendDialog();
  if ($("#me-close")) $("#me-close").onclick = () => confirmDialog("Close it for everyone?", "Every paper still open is handed in as it is now (the work saved so far). Their links stop working.", "Close", async () => { MSIT.d = await api(`/mises/${m.id}/close`, { method: "POST", body: {} }); mesRender(); });
  $("#me-del").onclick = () => confirmDialog("Delete this mise en situation?", "Its papers and the results it put in the learners' records are deleted. This can't be undone.", "Delete", async () => { await api(`/mises/${m.id}`, { method: "DELETE", confirmed: true }); location.hash = "#/mises-en-situation"; }, true);
  // live: refreshed every 5 s (not while a window is open)
  clearInterval(MSIT.timer); MSIT.timer = null;
  if (m.status === "live" || m.status === "scheduled") MSIT.timer = setInterval(async () => {
    if (!location.hash.startsWith(`#/mise/${m.id}`) || dlg.open || (MSIT.tab !== "live" && MSIT.tab !== "stats")) return;
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $("#me-tab").contains(document.activeElement)) return;
    try { MSIT.d = await api(`/mises/${m.id}`); const y = window.scrollY; mesRender(); window.scrollTo(0, y); } catch { /* keep the last view */ }
  }, 5000);
}

// ---------------------------------------------------------------- content (the reference solutions are here: teacher only)
function mesContentTab(root) {
  const m = MSIT.d.mise, c = m.content;
  root.innerHTML = `${m.status === "draft" ? `<div class="toolbar" style="margin:0 0 12px"><button class="btn" id="mc-title">✎ Rename</button><button class="btn" id="mc-json">{ } Edit the JSON</button><button class="btn" id="mc-dl">⬇ Download the JSON</button></div>`
      : `<div class="toolbar" style="margin:0 0 12px"><button class="btn" id="mc-dl">⬇ Download the JSON</button><span class="muted small">The learners have it: its content can't change anymore.</span></div>`}
    ${c.situations.map((s, i) => `<section class="panel mes-sit">
      <div class="panel-head"><h2>S${i + 1} · ${esc(s.title)}</h2><span class="small muted">difficulty ${s.difficulty}/5 · ${s.points} pts (${mesWeight(c, s.id).pct}% of the score) · ${esc(RUNTIME[s.runtime] || s.runtime)}</span></div>
      <p style="margin-top:0">${esc(s.context)}</p>
      <p class="small">${s.competencies.map((x) => compChip(x)).join(" ")} ${s.notions.map((n) => `<span class="tag lang">${esc(n)}</span>`).join(" ")}</p>
      <ol class="small">${s.questions.map((q) => `<li>${esc(q.replace(/^\s*\d+\s*[.)-]\s*/, ""))}</li>`).join("")}</ol>
      <p class="small"><b>Expected:</b> ${esc(s.expected)}</p>
      <details><summary class="small"><b>Starter code</b> (${s.files.map((f) => esc(f.name)).join(", ")})</summary>${s.files.map((f) => `<p class="small muted" style="margin:8px 0 2px">${esc(f.name)}</p><pre class="code-view">${esc(f.starter || "(empty)")}</pre>`).join("")}${s.schema ? `<p class="small muted" style="margin:8px 0 2px">Database</p><pre class="code-view">${esc(s.schema)}</pre>` : ""}</details>
      <details><summary class="small"><b>Reference solution</b> <span class="muted">(never sent to the learners)</span></summary>${s.solution.map((f) => `<p class="small muted" style="margin:8px 0 2px">${esc(f.name)}</p><pre class="code-view">${esc(f.content)}</pre>`).join("")}</details>
      <details><summary class="small"><b>Automatic checks</b> (${s.checks.length}) · <b>likely mistakes</b>: ${s.errorHints.map(esc).join(", ")}</summary>
        <ul class="small">${s.checks.map((k) => `<li>${esc(k.label)} <span class="muted">· ${esc(CHECK_TYPE[k.type] || k.type)}: ${esc(mesCheckDesc(k))}</span></li>`).join("") || "<li class='muted'>No automatic check: you grade it.</li>"}</ul></details>
    </section>`).join("")}
    <section class="panel"><h2>QCM</h2>${c.qcm.map((q, i) => `<div class="mes-qcm"><p style="margin:0 0 6px"><b>Q${i + 1}.</b> ${esc(q.question)} <span class="small muted">${q.points} pt (${mesWeight(c, q.id).pct}%)</span> ${q.competencies.map((x) => compChip(x)).join(" ")} <span class="tag lang">${esc(q.notion)}</span></p>
      ${q.code ? `<pre class="code-view">${esc(q.code)}</pre>` : ""}<ul class="mcq-res small">${q.choices.map((ch, k) => `<li class="${k === q.correct ? "right" : ""}">${"ABCD"[k]}. ${esc(ch)}${k === q.correct ? " <span class='tag easy'>right answer</span>" : ""}</li>`).join("")}</ul></div>`).join("")}</section>`;
  const json = () => JSON.stringify({ ...c, situations: c.situations.map(({ id, ...s }) => ({ ...s, checks: s.checks.map(({ id: _, ...k }) => k) })), qcm: c.qcm.map(({ id, ...q }) => q) }, null, 2);
  $("#mc-dl").onclick = () => saveBlob(new Blob([json()], { type: "application/json" }), `mise-en-situation-${m.id}.json`);
  if ($("#mc-title")) $("#mc-title").onclick = () => openDialog("Rename", `<label for="mc-t">Title</label><input type="text" id="mc-t" style="width:100%" maxlength="120" value="${esc(m.title)}">`,
    [{ label: "Save", primary: true, action: async () => { MSIT.d = await api(`/mises/${m.id}`, { method: "PUT", body: { title: $("#mc-t").value } }); dlg.close(); mesRender(); } }]);
  if ($("#mc-json")) $("#mc-json").onclick = () => {
    openDialog("Edit the JSON", `<p class="small muted" style="margin-top:0">Change it here (or in Claude), then save: it's checked again like an import.</p>${jsonBox("mc-j", "")}<div id="mc-prob"></div>`,
      [{ label: "Check and save", primary: true, action: async () => {
        const r = await api(`/mises/${m.id}`, { method: "PUT", body: { json: $("#mc-j").value } });
        if (r.problems?.length) { $("#mc-prob").innerHTML = problemsHtml(r.problems); return; }
        MSIT.d = r; dlg.close(); toast("Saved ✅"); mesRender();
      } }]);
    dlg.classList.add("wide");
    $("#mc-j").value = json();
    wireJsonBox(dlg, "mc-j", () => { $("#mc-prob").innerHTML = ""; });
  };
}
function mesCheckDesc(k) {
  switch (k.type) {
    case "source": return `${k.absent ? "NOT " : ""}/${k.pattern}/${k.file ? ` in ${k.file}` : ""}`;
    case "dom-exists": return `${k.selector} × ${k.min || 1}+`;
    case "dom-text": return `${k.selector} contains “${k.contains}”${k.actions ? ` after ${k.actions.length} action(s)` : ""}`;
    case "css": return `${k.selector} { ${k.property}: ${k.value} }`;
    case "console": case "output": return `contains “${k.contains}”`;
    case "js": return `${k.expr} === ${JSON.stringify(k.equals)}`;
    case "sql-rows": return `${(k.rows || []).length} row(s)${k.ordered ? ", in order" : ""}`;
  }
  return "";
}

// ---------------------------------------------------------------- live
const MES_FILTERS = [["all", "Everyone"], ["left", "Left the page"], ["pasted", "Pasted"], ["stuck", "Stuck (10 min+ on one item)"], ["absent", "Absent"], ["done", "Finished"], ["todo", "Not started"]];
function mesLiveTab(root) {
  const { mise: m, takers } = MSIT.d, c = m.content, n = mesItems(c).length, nowS = m.now;
  const stuck = (t) => t.live === "working" && t.itemSince && nowS - t.itemSince > 600;
  const keep = { all: () => true, left: (t) => t.leaves > 0, pasted: (t) => t.pastes > 0 || t.blockedPastes > 0, stuck, absent: (t) => t.live === "absent", done: (t) => t.status === "submitted", todo: (t) => t.status === "invited" }[MSIT.filter] || (() => true);
  const rows = takers.filter(keep).map((t) => ({ ...t, nameS: t.name || t.discord_id, progressN: t.answered, statusS: ["working", "absent", "not-started", "done"].indexOf(t.live) }));
  const cnt = (f) => takers.filter({ left: (t) => t.leaves > 0, pasted: (t) => t.pastes > 0 || t.blockedPastes > 0, stuck, absent: (t) => t.live === "absent", done: (t) => t.status === "submitted", todo: (t) => t.status === "invited" }[f] || (() => true)).length;
  root.innerHTML = `
    <div class="figures cs-figs">
      <div class="figure"><span class="ico">👩‍💻</span><div><b>${takers.filter((t) => t.live === "working").length}</b><span>working now</span></div></div>
      <div class="figure ${takers.some((t) => t.live === "absent") ? "cs-attn" : ""}"><span class="ico">🚪</span><div><b>${takers.filter((t) => t.live === "absent").length}</b><span>away or silent</span></div></div>
      <div class="figure"><span class="ico">📋</span><div><b>${takers.reduce((s, t) => s + t.pastes, 0)}</b><span>pastes (${takers.reduce((s, t) => s + t.pasteChars, 0)} characters)</span></div></div>
      <div class="figure"><span class="ico">✅</span><div><b>${takers.filter((t) => t.status === "submitted").length}/${takers.length}</b><span>handed in</span></div></div>
    </div>
    <section class="panel">
      <div class="panel-head"><div class="mes-filters" role="group" aria-label="Filter">${MES_FILTERS.map(([k, l]) => `<button type="button" class="btn small" data-mf="${k}" aria-pressed="${MSIT.filter === k}">${esc(l)}${k !== "all" ? ` <span class="muted">${cnt(k)}</span>` : ""}</button>`).join("")}</div>
        <span class="toolbar" style="margin:0"><span class="muted small">${m.status === "live" ? "Refreshes every 5 s" : ""}</span><button class="btn small" id="ml-links">Copy the links</button><a class="btn small" href="/api/mises/${m.id}/live.csv?g=${encodeURIComponent(S.g)}" download>⬇ CSV</a></span></div>
      ${table([
        { label: "Learner", sort: "nameS", html: (t) => `<button class="res-who" data-ml="${t.id}">${avatar(t.name, t.discord_id)}<span><b>${esc(t.name || t.discord_id)}</b>${t.test ? ` <span class="tag">test</span>` : ""}<small>open →</small></span></button>` },
        { label: "Status", sort: "statusS", html: (t) => `${mesLive(t.live)}${t.away ? ` <span class="small muted">away now</span>` : ""}` },
        { label: "Item", html: (t) => (t.status === "active" ? `<b>${mesItemLabel(c, t.item)}</b>${t.itemSince ? `<div class="small ${stuck(t) ? "" : "muted"}" ${stuck(t) ? 'style="color:var(--warn)"' : ""}>for ${mesDur(nowS - t.itemSince)}</div>` : ""}` : "—") },
        { label: "Progress", sort: "progressN", html: (t) => `${meter(n ? (100 * t.answered) / n : 0)}<span class="small muted">${t.answered}/${n}</span>` },
        { label: "Time", num: true, sort: "timeSec", html: (t) => `<span title="On the items: ${mesDur(t.workSec)}">${mesDur(t.timeSec)}</span>` },
        { label: "Runs", num: true, sort: "runs", html: (t) => `${t.runs}` },
        { label: "AI checks", num: true, sort: "checks", html: (t) => `${t.checks}` },
        { label: "Left page", num: true, sort: "leaves", html: (t) => (t.leaves ? `<b>${t.leaves}×</b><div class="small muted">${mesDur(t.awaySec)}</div>` : "0") },
        { label: "Pastes", num: true, sort: "pastes", html: (t) => (t.pastes || t.blockedPastes ? `<b>${t.pastes}</b>${t.pasteChars ? `<div class="small muted">${t.pasteChars} chars</div>` : ""}${t.blockedPastes ? `<div class="small" style="color:var(--warn)">${t.blockedPastes} blocked</div>` : ""}` : "0") },
        { label: "Last activity", sort: "lastAt", html: (t) => `<span class="small">${t.lastAt ? fmtAgo(t.lastAt) : "—"}</span>` },
        { label: "", html: (t) => `${t.status !== "submitted" && m.status !== "closed" ? `<button class="btn small" data-mr="${t.id}" title="Send their link again by DM">Resend</button>` : ""}${t.status === "invited" ? ` <button class="btn small danger" data-mx="${t.id}" title="Take back the invitation">Remove</button>` : ""}` },
      ], rows, { empty: MSIT.filter === "all" ? "Nobody yet: launch it for the class." : "Nobody in this filter." })}
    </section>`;
  $$("[data-mf]", root).forEach((b) => b.onclick = () => { MSIT.filter = b.dataset.mf; mesLiveTab(root); });
  $$("[data-ml]", root).forEach((b) => b.onclick = () => busy(b, () => mesLearner(Number(b.dataset.ml))));
  $$("[data-mr]", root).forEach((b) => b.onclick = () => busy(b, async () => { const r = await api(`/mises/${m.id}/resend`, { method: "POST", body: { taker: Number(b.dataset.mr) } }); toast(r.sent ? "Link sent by DM" : "The DM didn't go through: copy their link instead", !r.sent); }));
  $$("[data-mx]", root).forEach((b) => b.onclick = () => busy(b, async () => { MSIT.d = await api(`/mises/${m.id}/remove`, { method: "POST", body: { taker: Number(b.dataset.mx) } }); mesRender(); }));
  $("#ml-links").onclick = (e) => busy(e.currentTarget, async () => { const l = (await api(`/mises/${m.id}/links`)).links; copyText(takers.map((t) => `${t.name || t.discord_id}: ${l[t.discord_id]}`).join("\n"), "Links copied"); });
}

// ---------------------------------------------------------------- statistics: the class's lacunes, item by item
function mesStatsTab(root) {
  const { mise: m, stats } = MSIT.d, c = m.content;
  const pctCell = (v) => (v == null ? `<span class="muted">—</span>` : `<b style="color:${masteryInk(v)}">${v}%</b>${meter(v)}`);
  root.innerHTML = `
    ${stats.testOnly ? `<div class="mes-note small">🧪 No learner has taken it yet: these are the <b>test papers</b> (yours), so you can see how it works. Once a learner starts, the statistics are the class's only.</div>` : ""}
    <section class="panel"><div class="panel-head"><h2>Item by item</h2><span class="muted small">checks passed, QCM right answers, time, the kinds of mistakes the AI saw</span></div>
    ${table([
      { label: "Item", html: (it) => `<b>${mesItemLabel(c, it.id)}</b> ${esc(it.title)}<div class="small">${it.competencies.map((x) => compChip(x)).join(" ")} ${it.notions.map((x) => `<span class="tag lang">${esc(x)}</span>`).join(" ")}</div>` },
      { label: "Answered", num: true, html: (it) => `${it.answered}` },
      { label: "Success", html: (it) => pctCell(it.kind === "qcm" ? it.qcmSuccess : it.checkSuccess) },
      { label: "Average time", num: true, html: (it) => mesDur(it.avgSec) },
      { label: "Most frequent mistakes", html: (it) => it.kind === "qcm"
        ? (it.wrongPick ? `<span class="small">Most chosen wrong answer: <b>${esc(it.wrongPick.choice)}</b> (${it.wrongPick.n})</span>` : `<span class="muted small">—</span>`)
        : it.categories.length ? it.categories.slice(0, 3).map((k) => `<span class="tag medium">${esc(k.label)} · ${k.n}</span>`).join(" ") : `<span class="muted small">—</span>` },
    ], stats.items, { empty: "No answer yet." })}</section>
    <div class="grid cols-2-even">
      <section class="panel"><h2>By competency</h2>${stats.competencies.length ? hbars(stats.competencies.map((x) => ({ label: esc(cText(x.key)), right: `${x.success}%`, parts: [{ name: "success", value: x.success, color: masteryInk(x.success) }] })), { max: 100 }) : `<p class="muted small">Shows once learners ran their code or answered the QCM.</p>`}</section>
      <section class="panel"><h2>By notion <span class="muted">(weakest first)</span></h2>${stats.notions.length ? hbars(stats.notions.slice(0, 12).map((x) => ({ label: esc(x.key), right: `${x.success}%`, parts: [{ name: "success", value: x.success, color: masteryInk(x.success) }] })), { max: 100 }) : `<p class="muted small">—</p>`}</section>
    </div>`;
}

// ---------------------------------------------------------------- results
function mesResultsTab(root) {
  const { mise: m, takers } = MSIT.d, c = m.content, ids = mesItems(c);
  const done = takers.filter((t) => t.status === "submitted").sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const learners = done.filter((t) => !t.test);   // the class average leaves out a teacher who tested it
  const avg = learners.length ? Math.round(learners.reduce((s, t) => s + (t.score || 0), 0) / learners.length) : null;
  const toGrade = done.reduce((s, t) => s + t.toGrade, 0);
  // what the item adds to the score: its result × its weight (S1 at 100% with a weight of 15% → +15)
  const gain = (it, id) => Math.round((10 * (it?.score ?? 0) * mesWeight(c, id).pct) / 100) / 10;
  const cell = (t, id) => {
    const it = t.items[id], w = mesWeight(c, id).pct;
    if (!it || !it.attempted) return `<td class="cell"><button class="sc na" data-mg="${t.id}" data-it="${id}" title="Not attempted: 0 of ${w}%">—</button></td>`;
    if (it.score == null) return `<td class="cell"><button data-mg="${t.id}" data-it="${id}" title="No automatic check: grade it (worth ${w}%)">✎</button></td>`;
    return `<td class="cell"><button class="sc" style="background:${masteryColor(it.score)};color:${masteryInk(it.score)}" data-mg="${t.id}" data-it="${id}" title="${it.score}% of ${w}% = +${gain(it, id)} to the score">${it.score}${it.teacher ? "<i>✎</i>" : ""}</button><small class="mes-gain">+${gain(it, id)}</small></td>`;
  };
  root.innerHTML = `
    <div class="figures cs-figs">
      <div class="figure"><span class="ico">📥</span><div><b>${done.length}/${takers.length}</b><span>handed in</span></div></div>
      <div class="figure"><span class="ico">📊</span><div><b style="color:${masteryInk(avg)}">${avg == null ? "—" : avg + "%"}</b><span>class average</span></div></div>
      <div class="figure ${toGrade ? "cs-attn" : ""}"><span class="ico">✎</span><div><b>${toGrade}</b><span>item(s) to grade by you</span></div></div>
      <div class="figure"><span class="ico">📨</span><div><b>${done.filter((t) => t.sent_at).length}</b><span>results sent</span></div></div>
    </div>
    <section class="panel">
      <div class="panel-head"><h2>Results</h2><span class="toolbar" style="margin:0"><a class="btn small" href="/api/mises/${m.id}/results.csv?g=${encodeURIComponent(S.g)}" download>⬇ CSV</a><button class="btn small primary" id="mr-send" ${done.length ? "" : "disabled"}>Send the results by DM</button></span></div>
      <p class="muted small" style="margin-top:0">The automatic score: the share of checks passed (situations) and the right answer (QCM), weighted by the points. Click a score to change it (✎ = yours), a learner to see everything they did and write their comment. Results go to their competencies once nothing is left to grade.</p>
      <p class="muted small">Weight of each item in the score (its points ÷ ${mesWeight(c, ids[0]).total} points). Under each result: what it adds to the score.<br>${ids.map((id) => `<b>${mesItemLabel(c, id)}</b> ${mesWeight(c, id).pct}%`).join(" · ")}</p>
      ${done.length ? `<div class="table-wrap"><table class="res-table"><thead><tr><th>Learner</th><th>Score</th>${ids.map((id) => `<th class="ctr"><span class="qh">${mesItemLabel(c, id)}</span><span class="mes-w">${mesWeight(c, id).pct}%</span></th>`).join("")}</tr></thead>
        <tbody>${done.map((t) => `<tr><td><button class="res-who" data-ml="${t.id}">${avatar(t.name, t.discord_id)}<span><b>${esc(t.name || t.discord_id)}</b>${t.test ? ` <span class="tag">test</span>` : ""}<small>${t.toGrade ? `${t.toGrade} to grade` : t.sent_at ? "sent ✓" : "open →"}</small></span></button></td>
          <td><div class="res-score"><b style="color:${masteryInk(t.score)}">${t.score}%</b>${meter(t.score)}</div></td>${ids.map((id) => cell(t, id)).join("")}</tr>`).join("")}</tbody></table></div>`
        : `<div class="empty-state"><div style="font-size:40px">📭</div><p class="muted">No paper handed in yet.</p></div>`}
    </section>`;
  $$("[data-ml]", root).forEach((b) => b.onclick = () => busy(b, () => mesLearner(Number(b.dataset.ml))));
  $$("[data-mg]", root).forEach((b) => b.onclick = () => busy(b, async () => { const d = await api(`/mises/${m.id}/taker/${b.dataset.mg}`); mesGradeDialog(d, b.dataset.it, () => viewMise(m.id)); }));
  if ($("#mr-send")) $("#mr-send").onclick = () => confirmDialog("Send the results?", `Each learner whose paper is fully graded gets their score, each item and your comment (or a short professional one written from their score) by DM.${toGrade ? ` ${toGrade} item(s) still to grade: those learners are skipped.` : ""}`, "Send", async () => {
    const r = await api(`/mises/${m.id}/results`, { method: "POST", body: {} });
    toast(`Sent to ${r.sent} learner(s)${r.skipped ? ` · ${r.skipped} skipped (to grade)` : ""}`);
    viewMise(m.id);
  });
}
function mesGradeDialog(d, item, after) {
  const c = MSIT.d.mise.content, it = d.items[item] || {}, g = d.grades[item] || {};
  openDialog(`${mesItemLabel(c, item)} · ${d.name || d.discord_id}`, `
    <p class="small muted" style="margin-top:0">Automatic: <b>${it.auto == null ? "no check (to grade)" : it.auto + "%"}</b>${it.attempted ? "" : " · not attempted"}</p>
    <div class="field-row"><div><label for="mg-s">Score (0–100)</label><input type="number" id="mg-s" min="0" max="100" value="${g.teacher ? g.score : it.auto ?? ""}"></div></div>
    <label for="mg-c">Comment <span class="muted">(for you)</span></label><textarea id="mg-c" rows="3" style="width:100%">${esc(g.comment || "")}</textarea>`,
  [...(g.teacher ? [{ label: "Back to automatic", action: async () => { await api(`/mises/${MSIT.d.mise.id}/grade`, { method: "PUT", body: { taker: d.id, item, score: null } }); dlg.close(); after(); } }] : []),
    { label: "Save", primary: true, action: async () => { const v = $("#mg-s").value; if (v === "") throw new Error("Give a score from 0 to 100."); await api(`/mises/${MSIT.d.mise.id}/grade`, { method: "PUT", body: { taker: d.id, item, score: Number(v), comment: $("#mg-c").value } }); dlg.close(); toast("Grade saved"); after(); } }]);
}

// ---------------------------------------------------------------- one learner: everything they did
const MES_EV = { start: "▶ Started", item: "→ Moved to", leave: "🚪 Left the page", back: "↩ Came back", paste: "📋 Pasted", "paste-blocked": "✋ Paste blocked", run: "▶ Ran", check: "🔎 AI check", submit: "✅ Handed in" };
async function mesLearner(takerId) {
  const m = MSIT.d.mise, c = m.content;
  const d = await api(`/mises/${m.id}/taker/${takerId}`);
  const st = d.stats;
  const ev = d.events.map((e) => {
    const [t, k, item, n, extra] = e;
    const what = k === "back" ? `${MES_EV[k]} <span class="muted">after ${mesDur(Math.round((n || 0) / 1000))}</span>`
      : k === "paste" || k === "paste-blocked" ? `${MES_EV[k]} <b>${n}</b> chars${item ? ` in ${mesItemLabel(c, item)}` : ""}${extra ? `<pre class="code-view mes-paste">${esc(extra)}${n > String(extra).length ? "…" : ""}</pre>` : ""}`
      : k === "run" ? `${MES_EV[k]} ${mesItemLabel(c, item)}${extra ? ` <span class="muted">· ${esc(extra)} checks${n ? " · on the server" : ""}</span>` : ""}`
      : k === "check" ? `${MES_EV[k]} ${mesItemLabel(c, item)} <span class="muted">· ${esc(String(extra || "").split(",").map((x) => MES_CAT[x] || x).join(", "))}</span>`
      : k === "item" ? `${MES_EV[k]} ${mesItemLabel(c, item)}` : esc(MES_EV[k] || k);
    return `<li class="ev-${esc(k)}"><span class="muted">${new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> ${what}</li>`;
  }).reverse();
  const sitHtml = (s, i) => {
    const ans = d.answers[s.id]?.files || {}, ck = d.checks[s.id], ai = d.ai[s.id] || [], it = d.items[s.id];
    const visits = Object.keys(d.logs).filter((k) => k.startsWith(s.id + "_"));
    return `<details class="mes-ans" ${i === 0 ? "open" : ""}><summary><b>S${i + 1} · ${esc(s.title)}</b> <span class="small">${it.attempted ? (it.score == null ? `<span class="lvl warn">to grade</span>` : `<b style="color:${masteryInk(it.score)}">${it.score}%</b>`) : `<span class="lvl none">not attempted</span>`}${it.teacher ? " ✎" : ""} · ${mesDur(Math.round((d.spent[s.id] || 0) / 1000))}</span></summary>
      ${s.files.map((f) => `<p class="small muted" style="margin:8px 0 2px">${esc(f.name)}${ans[f.name] != null && ans[f.name] === f.starter ? " (unchanged)" : ""}</p><pre class="code-view">${esc(ans[f.name] ?? f.starter ?? "")}</pre>`).join("")}
      <p class="small" style="margin:8px 0 4px"><b>Checks</b> ${ck ? `<span class="muted">(last run ${fmtDateTime(ck.at)})</span>` : `<span class="muted">· never run</span>`}</p>
      ${ck ? `<ul class="small mes-ck">${ck.results.map((r) => `<li class="${r.ok ? "ok" : "ko"}">${r.ok ? "✓" : "✗"} ${esc(r.label)}</li>`).join("")}</ul>` : ""}
      <p class="small" style="margin:8px 0 4px"><b>AI categories</b> ${ai.length ? "" : `<span class="muted">· none asked</span>`}</p>
      ${ai.length ? `<ul class="small">${ai.map((x) => `<li><span class="muted">${fmtDateTime(x.at)}${x.submit ? " · at hand-in" : ""}</span> ${x.categories.map((k) => `<span class="tag ${k.id === "none" ? "easy" : "medium"}">${esc(k.label)}</span>`).join(" ")}</li>`).join("")}</ul>` : ""}
      <div class="toolbar" style="margin:8px 0 0">${visits.length ? `<button class="btn small" data-rp="${s.id}">⏯ Typing replay (${visits.length} visit${visits.length > 1 ? "s" : ""})</button>` : `<span class="small muted">No typing record.</span>`}<button class="btn small" data-gr="${s.id}">✎ Grade</button></div></details>`;
  };
  const qcmHtml = (q, i) => {
    const a = d.answers[q.id], it = d.items[q.id], pick = a && a.choice != null ? a.choice : null;
    return `<li><b>Q${i + 1}</b> ${esc(q.question.slice(0, 120))} — ${pick == null ? `<span class="lvl none">no answer</span>` : `${"ABCD"[pick]}. ${esc(q.choices[pick])} ${pick === q.correct ? "<span class='tag easy'>right</span>" : `<span class='tag hard'>wrong</span> <span class="muted small">(right: ${"ABCD"[q.correct]})</span>`}`}${it.teacher ? ` ✎ ${it.score}%` : ""} <button class="btn small" data-gr="${q.id}">✎</button></li>`;
  };
  openDialog(`${d.name || d.discord_id} · ${m.title}`, `
    <div class="figures cs-figs mes-figs">
      <div class="figure"><span class="ico">📊</span><div><b style="color:${masteryInk(d.score)}">${d.status === "submitted" ? d.score + "%" : "—"}</b><span>${d.status === "submitted" ? "score" : d.status === "active" ? "working" : "not started"}</span></div></div>
      <div class="figure"><span class="ico">🚪</span><div><b>${st.leaves}</b><span>left the page · ${mesDur(st.awaySec)}</span></div></div>
      <div class="figure"><span class="ico">📋</span><div><b>${st.pastes}</b><span>pastes · ${st.pasteChars} chars${st.blockedPastes ? ` · ${st.blockedPastes} blocked` : ""}</span></div></div>
      <div class="figure"><span class="ico">▶</span><div><b>${st.runs}</b><span>runs · ${st.checks} AI checks</span></div></div>
    </div>
    <div class="grid cols-2-even mes-learner">
      <div><h3 class="mes-h">Answers</h3>${c.situations.map(sitHtml).join("")}<h3 class="mes-h">QCM</h3><ul class="small mes-qlist">${c.qcm.map(qcmHtml).join("")}</ul></div>
      <div><h3 class="mes-h">Timeline</h3><ul class="small ev-list mes-tl">${ev.join("") || "<li class='muted'>Nothing yet.</li>"}</ul>
        ${d.status === "submitted" ? `<h3 class="mes-h">Comment sent with the results</h3><textarea id="mlc" rows="4" style="width:100%">${esc(d.comment || d.defaultComment)}</textarea>
          <div class="toolbar" style="margin:6px 0 0"><button class="btn small" id="mlc-save">Save the comment</button><button class="btn small primary" id="mlc-send">Send their results by DM</button>${d.sent_at ? `<span class="small muted">sent ${fmtDateTime(d.sent_at)}</span>` : ""}</div>` : ""}</div>
    </div>`);
  dlg.classList.add("wide");
  $$("[data-rp]", dlg).forEach((b) => b.onclick = () => {
    const s = c.situations.find((x) => x.id === b.dataset.rp);
    const keys = Object.keys(d.logs).filter((k) => k.startsWith(s.id + "_")).sort((x, y) => (d.logs[x].at || 0) - (d.logs[y].at || 0));
    const sessions = [];
    keys.forEach((k, vi) => { const v = d.logs[k]; for (const [name, f] of Object.entries(v.files || {})) if (f.changes?.length) sessions.push({ label: `Visit ${vi + 1} · ${name}`, at: v.at, changes: f.changes, focus: v.focus, pastes: f.pastes, openMs: v.openMs, lang: (s.files.find((x) => x.name === name) || {}).lang }); });
    replayShow({ code: "", sessions }, { name: d.name || d.discord_id, title: `S${c.situations.indexOf(s) + 1} · ${s.title}` });
  });
  $$("[data-gr]", dlg).forEach((b) => b.onclick = () => mesGradeDialog(d, b.dataset.gr, () => { viewMise(m.id).then(() => mesLearner(takerId)); }));
  if ($("#mlc-save")) $("#mlc-save").onclick = (e) => busy(e.currentTarget, async () => { await api(`/mises/${m.id}/comment`, { method: "PUT", body: { taker: d.id, comment: $("#mlc").value } }); toast("Comment saved"); });
  if ($("#mlc-send")) $("#mlc-send").onclick = (e) => busy(e.currentTarget, async () => {
    await api(`/mises/${m.id}/comment`, { method: "PUT", body: { taker: d.id, comment: $("#mlc").value } });
    const r = await api(`/mises/${m.id}/results`, { method: "POST", body: { takers: [d.discord_id] } });
    toast(r.sent ? "Results sent by DM ✅" : r.skipped ? "Some items are still to grade" : "The DM didn't go through", !r.sent);
  });
}
const MES_CAT = { selection: "element selection", naming: "naming", syntax: "syntax", event: "event", logic: "logic", html: "HTML structure", css: "CSS property", output: "result not shown", sql: "SQL query", none: "no problem" };

// ---------------------------------------------------------------- launching, adding learners, more time
function mesLaunchDialog() {
  const m = MSIT.d.mise;
  const local = (u) => { const d = new Date(u * 1000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  openDialog("🚀 Launch for the class", `
    <p class="small muted" style="margin-top:0">${m.target.length ? `${m.target.length} learner(s) chosen` : "The whole class"} get their personal link by DM. Leaving the page is allowed (it's only recorded): nobody is ever locked out.</p>
    <div class="field-row">
      <div><label for="ml-when">Start</label><select id="ml-when"><option value="now">Now</option><option value="at">At a time…</option></select></div>
      <div><label for="ml-at">Time</label><input type="datetime-local" id="ml-at" value="${local(Math.ceil(Date.now() / 1000 / 900) * 900 + 900)}" disabled></div>
      <div><label for="ml-min">Duration (minutes)</label><input type="number" id="ml-min" min="0" max="600" value="${m.settings.minutes || 90}"><small class="muted">0 = open until you close it</small></div>
    </div>
    <label class="check"><input type="checkbox" id="ml-np" ${m.settings.noPaste ? "checked" : ""}> <span><b>Block copy-paste</b> in the editor <span class="muted small">(off: pastes are allowed and recorded, with what was pasted)</span></span></label>
    <label class="check"><input type="checkbox" id="ml-ch" ${m.settings.channel ? "checked" : ""}> <span>Post a short message in the class channel</span></label>
    <label class="check"><input type="checkbox" id="ml-dm" checked> <span>Send each learner their link by DM</span></label>`,
  [{ label: "Launch", primary: true, action: async () => {
    const at = $("#ml-when").value === "at" ? Math.round(new Date($("#ml-at").value).getTime() / 1000) : 0;
    if ($("#ml-when").value === "at" && !(at > 0)) throw new Error("Pick the start time.");
    const r = await api(`/mises/${m.id}/launch`, { method: "POST", body: { startsAt: at || null, minutes: Number($("#ml-min").value) || 0, noPaste: $("#ml-np").checked, channel: $("#ml-ch").checked, send: $("#ml-dm").checked } });
    dlg.close(); MSIT.d = r; MSIT.tab = "live";
    toast(`${r.invited} learner(s) · ${r.sent} DM sent${r.sent < r.invited ? " · copy the links of the others in Live" : ""}`);
    mesRender();
  } }]);
  $("#ml-when").onchange = () => { $("#ml-at").disabled = $("#ml-when").value !== "at"; };
}
async function mesAddDialog() {
  const m = MSIT.d.mise;
  const st = MSIT.setup || (MSIT.setup = await api("/mises/setup"));
  const have = new Set(MSIT.d.takers.map((t) => t.discord_id));
  const rest = [...st.students, ...(st.staff || []).map((s) => ({ ...s, staff: true }))].filter((s) => !have.has(s.discord_id));
  openDialog("＋ Add learners", rest.length ? `<p class="small muted" style="margin-top:0">They get their link by DM now.</p><div class="mes-people">${rest.map((s) => `<label class="check"><input type="checkbox" value="${esc(s.discord_id)}"> ${avatar(s.name, s.discord_id)} ${esc(s.name || s.discord_id)}${s.staff ? ` <span class="tag">staff · test</span>` : ""}</label>`).join("")}</div>` : `<p class="muted">Every learner of the class already has it. To send a link again, use “Resend” in the Live tab.</p>`,
    rest.length ? [{ label: "Add and send", primary: true, action: async () => {
      const ids = $$(".mes-people input:checked", dlg).map((x) => x.value);
      if (!ids.length) throw new Error("Pick at least one learner.");
      const r = await api(`/mises/${m.id}/add`, { method: "POST", body: { students: ids } });
      dlg.close(); MSIT.d = r; toast(`${ids.length} added · ${r.sent} DM sent`); mesRender();
    } }] : []);
}
function mesExtendDialog() {
  const m = MSIT.d.mise;
  openDialog("⏱ More time", `<p class="small muted" style="margin-top:0">${m.ends_at ? `Now it ends ${fmtDateTime(m.ends_at)}.` : "It has no end: this gives it one."} Everyone gets the same extra time${m.status === "closed" ? " and the session opens again (papers already handed in stay handed in)" : ""}.</p>
    <label for="me-m">Extra minutes</label><input type="number" id="me-m" min="1" max="600" value="15" style="width:120px">`,
  [{ label: "Add the time", primary: true, action: async () => { MSIT.d = await api(`/mises/${m.id}/extend`, { method: "POST", body: { minutes: Number($("#me-m").value) } }); dlg.close(); toast("Time added"); mesRender(); } }]);
}

Object.assign(routes, { "mises-en-situation": viewMises, mise: (id) => viewMise(Number(id)) });
