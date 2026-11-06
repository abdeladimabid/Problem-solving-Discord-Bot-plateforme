"use strict";
// « Mises en situation »: live practical tests written with Claude outside the app (src/shared/mises.ts).
//   #/mises-en-situation   the sessions, and « New »: week → competencies → learners → the prompt for Claude → its JSON
//   #/mise/<id>            Content · Live (refreshed every 5 s) · Statistics · Results, and one learner in detail
// Loaded after app.js and learning.js (it uses their helpers: table, meter, compChip, jsonBox, replayShow…).
/* global $, $$, api, esc, toast, busy, view, dlg, openDialog, confirmDialog, table, status, avatar, fmtDateTime, fmtDate, fmtAgo, masteryInk, masteryColor, meter, copyText, compChip, jsonBox, wireJsonBox, problemsHtml, saveBlob, replayShow, hbars, segHtml, wireSeg, loadRef, routes, S */
const MSIT = { list: null, setup: null, d: null, tab: "live", filter: "all", timer: null, draft: null };
window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#/mise/")) { clearInterval(MSIT.timer); MSIT.timer = null; } });
const MES_STATUS = { draft: ["draft", "Saved · not launched"], scheduled: ["pending", "Scheduled"], live: ["active", "Live"], closed: ["closed", "Closed"] };
const mesStatus = (s) => status(...(MES_STATUS[s] || ["draft", s]));
const MES_LIVE = { "not-started": ["none", "Not started"], working: ["ok", "Working"], done: ["good", "Done"], absent: ["warn", "Absent"], locked: ["bad", "🔒 Stopped"] };
const MES_LOCK = { fullscreen: "left full screen", hidden: "switched tab", blur: "left the window", reload: "reloaded the page", device: "opened on another device" };
/** Network alerts: opened outside the class's network, or from several networks. */
const netHtml = (n) => (!n ? `<span class="muted">—</span>` : n.outside ? `<span class="lvl warn" title="Its last connection isn't the class's network (where most of the class is)">⚠ outside the class</span>${n.nets > 1 ? `<div class="small muted">${n.nets} networks</div>` : ""}`
  : n.nets > 1 ? `<span class="lvl warn" title="Opened from several networks">${n.nets} networks</span>` : `<span class="small muted">class network</span>`);
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
    <div class="page-head"><div><h1>Mises en situation</h1><p class="sub">Live practical tests for the class: as many situations with real code as you want (increasing difficulty) and QCM (or none), for the week's programme or a brief. Upload a JSON, or let the AI write it. Learners code in their browser, in full screen; you follow each one live.</p></div>
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
  if (MSIT.openNew) { const o = typeof MSIT.openNew === "object" ? MSIT.openNew : {}; MSIT.openNew = false; mesWizard(o).catch((e) => toast(e.message, true)); }
}

// ======================================================================= « New »: like a brief
// Choose how: upload a JSON (the week, the sprint and the competencies are read from it), the AI writes it for a brief
// (one of ours or a Simplonline page), the AI writes it from the sprint's and the week's objectives, or a prompt for
// Claude. Then the preview and the checklist (warnings and reminders), and Save. Who takes it is chosen when launching.
const MES_SRC = [["json", "📄 Upload a JSON"], ["brief", "✨ AI · for a brief"], ["sprint", "✨ AI · from the sprint"], ["claude", "🤖 Prompt for Claude"]];
async function mesWizard(opts = {}) {
  const [st] = await Promise.all([MSIT.setup ? Promise.resolve(MSIT.setup) : api("/mises/setup"), loadRef().catch(() => null)]);
  MSIT.setup = st;
  const w0 = st.weeks.find((w) => w.n === st.current) || st.weeks[0];
  // manual: the teacher picked the week or the competencies (else they come from the file / the brief)
  const W = MSIT.draft = { src: "json", week: w0?.n ?? null, comps: [], manual: false, brief: null, briefSrc: null, prompt: "", res: null, json: "" };
  const box = $("#mes-wiz");
  box.innerHTML = `<section class="panel mes-wiz">
    <div class="panel-head"><h2>New mise en situation</h2><button class="btn small" id="mw-x">Cancel</button></div>
    <ol class="mes-steps">
      <li><b>How do you want to create it?</b>
        <div class="seg-row">${segHtml("mw-src", MES_SRC, "json")}</div>
        <div data-ms="json"><p class="small muted" style="margin:8px 0">The week, the sprint and the competencies are read from the file: check them below.</p></div>
        <div data-ms="brief" hidden>
          <p class="small muted" style="margin:8px 0">The AI writes the situations and QCM inside the brief's project (same client, same data), on the notions the learners need for it.</p>
          ${segHtml("mw-bsrc", [["ours", "One of our briefs"], ["file", "A brief page (.html)"]], "ours")}
          <div data-bs="ours" style="margin-top:8px"><select id="mw-brief" aria-label="The brief"><option value="">Loading the briefs…</option></select></div>
          <div data-bs="file" hidden style="margin-top:8px"><label class="drop" id="mw-bdrop"><input type="file" id="mw-bfile" accept=".html,.htm,text/html" hidden><span>📄 <b>Choose the brief page (.html)</b> or drop it here</span></label></div>
          <div id="mw-bpre"></div></div>
        <div data-ms="sprint" hidden><p class="small muted" style="margin:8px 0">The AI writes it from the objectives and the notions of the sprint and the week below, keeping to what the class has seen.</p></div>
        <div data-ms="claude" hidden><p class="small muted" style="margin:8px 0">Generate the prompt, paste it in Claude, then paste or upload its JSON below.</p></div></li>
      <li><b>Programme week</b> <span class="small muted" id="mw-wsrc"></span><div class="field-row">
        <div><label for="mw-sp">Sprint</label><select id="mw-sp"><option value="">All sprints</option>${st.sprints.map((s) => `<option value="${s.n}">Sprint ${s.n} · ${esc(s.title)}</option>`).join("")}</select></div>
        <div><label for="mw-wk">Week</label><select id="mw-wk"></select></div></div>
        <p class="small muted" id="mw-wkinfo"></p>
        <details class="mes-cd" id="mw-cd"><summary><b>Competencies to test</b> <span id="mw-csum"></span> <span class="muted small">· change</span></summary>
          <p class="small muted" style="margin:6px 0 0">Of the week and its sprint. Empty: the ones of the file, the brief or the week.</p><div class="mes-chips" id="mw-comps"></div></details>
        <div id="mw-cn"></div></li>
      <li data-step="make"><b id="mw-mk-t">Make it</b>
        <div class="field-row" id="mw-ai-f">
          <div><label for="mw-met">Job / theme <span class="muted">(optional)</span></label><input type="text" id="mw-met" placeholder="e.g. a cooperative of argan oil, a riad in Fès, a pharmacy"></div>
          <div><label for="mw-wish">Your wishes <span class="muted">(optional)</span></label><input type="text" id="mw-wish" maxlength="1500" placeholder="e.g. a SQL situation, no regex, S5 on objects"></div></div>
        <div class="field-row" id="mw-cnt-f">
          <div><label for="mw-ns">Coding situations</label><input type="number" id="mw-ns" min="1" max="15" value="5" style="width:110px"></div>
          <div><label for="mw-nq">QCM <span class="muted">(0 = none)</span></label><input type="number" id="mw-nq" min="0" max="30" value="5" style="width:110px"></div></div>
        <div class="field-row" id="mw-sc-f">
          <div><label for="mw-sc">Barème</label><select id="mw-sc"><option value="auto">Automatic: by difficulty, QCM a fixed share</option><option value="file">The points written in the file</option></select></div>
          <div id="mw-qs-f"><label for="mw-qs">The QCM's share of the score (%)</label><input type="number" id="mw-qs" min="0" max="50" value="20" style="width:110px"></div></div>
        <p class="small muted" style="margin:4px 0 0" id="mw-sc-i">Situations by difficulty: 1 → 2 points, 2 → 3, 3 → 4, 4 → 6, 5 → 8; the QCM share the rest. You can still change any item's points afterwards (Edit).</p>
        <p class="small muted" id="mw-cnt-i" style="margin:4px 0 0"></p>
        <div class="toolbar" style="margin:8px 0 0"><button class="btn primary" id="mw-gen" type="button">✨ Generate</button><button class="btn" id="mw-cp" type="button" hidden>📋 Copy</button><span class="small muted" id="mw-st"></span></div>
        <textarea id="mw-prompt" class="cj-json" readonly hidden aria-label="The prompt for Claude"></textarea>
        <div id="mw-jbox">${jsonBox("mw-json", '{ "format": "classbot-mise-en-situation@1", "title": "…", "week": 3, "competencies": ["C4N1"], "situations": [ … ], "qcm": [ … ] }')}</div></li>
      <li><b>Check and save</b>
        <div id="mw-prev"><p class="small muted">The preview and the checklist show here.</p></div>
        <div class="toolbar" style="margin:10px 0 0"><button class="btn" id="mw-check" type="button">Check again</button><button class="btn primary" id="mw-fix" type="button" hidden>✨ Fix only what's wrong with the AI</button><button class="btn primary" id="mw-save" type="button" disabled>Save</button>
          <span class="small muted">You choose who takes it when you launch it.</span></div></li>
    </ol></section>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
  const weekSel = $("#mw-wk"), spSel = $("#mw-sp");
  const weeksOf = () => st.weeks.filter((w) => !spSel.value || String(w.sprint) === spSel.value);
  const compName = (c) => { const p = parseC(c); return p ? (st.referential.find((r) => r.code === cLabel(p.code))?.name || "") : ""; };
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
    const list = [...new Set([...fromWeek, ...(sp?.tech || []), ...(sp?.soft || []), ...W.comps])];
    if (!W.comps.length && !["json", "claude"].includes(W.src) && W.src !== "brief") W.comps = (w?.competencies || []).slice(0, 2);
    $("#mw-comps").innerHTML = list.length ? list.map((c) => `<button type="button" class="mes-chip ${/^CT/.test(c) ? "soft" : ""}" data-comp="${esc(c)}" aria-pressed="${W.comps.includes(c)}" title="${esc(compName(c))}"><b>${esc(cText(c))}</b> ${esc(compName(c))}${fromWeek.includes(c) ? "" : ` <span class="muted">(${(sp?.tech || []).concat(sp?.soft || []).includes(c) ? "sprint" : "file"})</span>`}</button>`).join("")
      : `<p class="small muted">This week has no competency in the programme: pick another week.</p>`;
    $$("[data-comp]", box).forEach((b) => b.onclick = () => { const c = b.dataset.comp; W.comps = W.comps.includes(c) ? W.comps.filter((x) => x !== c) : [...W.comps, c]; W.manual = true; b.setAttribute("aria-pressed", String(W.comps.includes(c))); compSum(); stale(); });
    compSum();
  };
  const compSum = () => { $("#mw-csum").innerHTML = W.comps.length ? W.comps.map((c) => compChip(c)).join(" ") : `<span class="muted small">${W.src === "json" || W.src === "claude" ? "from the file" : W.src === "brief" ? "from the brief" : "none chosen"}</span>`; };
  let loadCnLater = null;
  const setWeek = (n, why) => {
    if (!n || !st.weeks.some((w) => w.n === n)) return;
    if (W.week !== n) { W.cn = null; setTimeout(() => loadCnLater && loadCnLater(), 0); }
    W.week = n; const w = st.weeks.find((x) => x.n === n);
    spSel.value = w?.sprint ? String(w.sprint) : ""; drawWeeks();
    $("#mw-wsrc").textContent = why ? `· ${why}` : "";
  };
  const stale = () => { if (W.res) { $("#mw-save").disabled = true; $("#mw-check").classList.add("primary"); } };
  spSel.value = w0?.sprint ? String(w0.sprint) : "";
  spSel.onchange = () => { W.manual = true; drawWeeks(); stale(); };
  weekSel.onchange = () => { W.week = Number(weekSel.value) || null; W.manual = true; $("#mw-wsrc").textContent = ""; drawComps(); stale(); W.cn = null; if (typeof loadCnLater === "function") loadCnLater(); };
  drawWeeks();
  // ---- how
  const showSrc = (v) => {
    // another way to make it: start again (the file or the AI's answer of the other way is dropped)
    if (W.src !== v) { W.json = ""; W.res = null; $("#mw-json").value = ""; $("#mw-prev").innerHTML = `<p class="small muted">The preview and the checklist show here.</p>`; $("#mw-save").disabled = true; $("#mw-wsrc").textContent = ""; $("#mw-st").textContent = ""; if (!W.manual) W.comps = []; }
    W.src = v; W.prompt = "";
    $$("[data-ms]", box).forEach((x) => (x.hidden = x.dataset.ms !== v));
    const ai = v === "brief" || v === "sprint";
    $("#mw-mk-t").textContent = ai ? "Generate with the AI" : v === "claude" ? "The prompt, then Claude's JSON" : "The JSON";
    $("#mw-ai-f").hidden = v === "json";
    $("#mw-cnt-f").hidden = $("#mw-cnt-i").hidden = v === "json";
    $("#mw-gen").hidden = v === "json";
    $("#mw-gen").textContent = v === "claude" ? "✨ Generate the prompt for Claude" : "✨ Generate the mise en situation";
    $("#mw-cp").hidden = true; $("#mw-prompt").hidden = true;
    $("#mw-jbox").hidden = ai && !W.json;
    if (v === "brief") loadBriefs();
    drawComps();
  };
  wireSeg(box, "mw-src", showSrc);
  W.src = "";
  wireSeg(box, "mw-bsrc", (v) => { $$("[data-bs]", box).forEach((x) => (x.hidden = x.dataset.bs !== v)); W.brief = null; W.briefSrc = null; $("#mw-bpre").innerHTML = ""; });
  // ---- the brief: one of ours, or a Simplonline page read here
  let ours = null;
  const loadBriefs = async () => {
    if (ours) return;
    ours = (await api("/briefs")).items;
    $("#mw-brief").innerHTML = `<option value="">Pick a brief…</option>` + ours.map((b) => `<option value="${b.id}">${esc(b.title)}${b.week ? ` · S${b.week}` : ""}</option>`).join("");
  };
  const briefComps = (list) => (list || []).map((c) => String(c).toUpperCase().replace(/^T(\d)/, "CT$1")).map((c) => (/N\d$/.test(c) ? c : c + "N1")).filter((c) => /^(C|CT)\d{1,2}N[1-3]$/.test(c));
  const briefShown = (title, comps, week, extra = "") => {
    $("#mw-bpre").innerHTML = `<div class="imp-card"><div class="imp-head">📄 <b>${esc(title || "Brief")}</b>${week ? ` <span class="tag">S${week}</span>` : ""}</div>
      <div class="small" style="margin-top:6px">Competencies: ${comps.map((c) => compChip(c)).join(" ") || `<span class="muted">none found</span>`}</div>${extra}</div>`;
    if (!W.manual) { if (week) setWeek(week, "the brief's week"); W.comps = comps.filter((c) => /^C\d/.test(c)).length ? comps.filter((c) => /^C\d/.test(c)) : comps; drawComps(); }
  };
  $("#mw-brief").onchange = async () => {
    const id = Number($("#mw-brief").value);
    if (!id) { W.brief = null; $("#mw-bpre").innerHTML = ""; return; }
    const B = await api(`/briefs/${id}`);
    W.brief = id; W.briefSrc = null; W.cn = null;
    briefShown(B.brief.data.title, briefComps(B.brief.data.competencies), B.brief.week);
    loadCn();
  };
  const readBrief = async (f) => {
    if (!f) return;
    if (!/\.html?$/i.test(f.name) && f.type !== "text/html") { $("#mw-bpre").innerHTML = `<p class="small" style="color:var(--down)">Choose the page saved as .html.</p>`; return; }
    await loadRef();
    $("#mw-bdrop span").innerHTML = `📄 <b>${esc(f.name)}</b> · choose another`;
    const r = simplonParse(await f.text(), REF.referential);
    W.brief = null; W.briefSrc = { briefText: r.text.slice(0, 20000), briefTitle: r.title, briefComps: briefComps(r.comps) };
    briefShown(r.title, W.briefSrc.briefComps, null, `<p class="small muted" style="margin:6px 0 0">${Math.round(r.text.length / 100) / 10}k characters read. Pick its week above.</p>`);
  };
  $("#mw-bfile").onchange = () => readBrief($("#mw-bfile").files[0]);
  const bdrop = $("#mw-bdrop");
  bdrop.ondragover = (e) => { e.preventDefault(); bdrop.classList.add("over"); };
  bdrop.ondragleave = () => bdrop.classList.remove("over");
  bdrop.ondrop = (e) => { e.preventDefault(); bdrop.classList.remove("over"); readBrief(e.dataTransfer.files[0]); };
  // ---- the request: what the teacher picked (else the server reads the file / the brief)
  // 📐 the capacities of the Fiche niveaux it covers (each in 5 items): ticked from the brief / week, the teacher changes them
  const cnBox = $("#mw-cn");
  const loadCn = () => conceptsPicker(cnBox, { week: W.week, brief_id: W.src === "brief" ? W.brief : "", limit: 6 }, W.cn, { mise: true });
  loadCnLater = loadCn;
  loadCn();
  cnBox.addEventListener("cnchange", () => { const was = (W.cn || []).join(); W.cn = pickedConcepts(cnBox); if (was && was !== W.cn.join()) stale(); });
  // how many situations and QCM (an uploaded file: as many as it has)
  const counts = () => ({ ...(W.src === "json" ? {} : { nSituations: Math.max(1, Math.min(15, Number($("#mw-ns").value) || 5)), nQcm: Math.max(0, Math.min(30, Math.round(Number($("#mw-nq").value) || 0))) }),
    scoring: $("#mw-sc").value, qcmShare: Math.max(0, Math.min(50, Math.round(Number($("#mw-qs").value) || 0))) });
  const cntInfo = () => { const c = counts(); $("#mw-qs-f").hidden = c.scoring === "file" || c.nQcm === 0; $("#mw-sc-i").hidden = c.scoring === "file"; if (!c.nSituations) return; const min = c.nSituations * 15 + c.nQcm * 2;
    $("#mw-cnt-i").textContent = `${c.nSituations} coding situation${c.nSituations > 1 ? "s" : ""} (difficulty going up)${c.nQcm ? ` + ${c.nQcm} QCM on their code` : ", no QCM"} · about ${min} minutes for the learners${c.nSituations > 8 && W.src !== "claude" ? " · the AI may take several rounds for that many" : ""}`; };
  ["#mw-ns", "#mw-nq", "#mw-sc", "#mw-qs"].forEach((x) => $(x).oninput = $(x).onchange = () => { cntInfo(); stale(); });
  setTimeout(cntInfo);
  const scope = () => ({ ...counts(), week: W.manual || !["json", "claude"].includes(W.src) ? W.week : null, comps: W.manual ? W.comps : [], brief: W.src === "brief" ? W.brief : null, ...(W.src === "brief" && W.briefSrc ? W.briefSrc : {}),
    ...($("[data-cncap]", cnBox) ? { concepts: pickedConcepts(cnBox) } : {}) });
  const show = (r, auto) => {
    W.res = r;
    if (r.detected) {
      if (r.detected.week && r.detected.week !== W.week) setWeek(r.detected.week, auto ? "read from the file" : "");
      else if (r.detected.week && auto) $("#mw-wsrc").textContent = "· read from the file";
      if (!W.manual && r.detected.comps?.length) { W.comps = r.detected.comps; drawComps(); }
    }
    // 📐 how many of the 10 items work on each capacity of the Fiche niveaux (5 at least)
    let cov = "";
    try { const d = JSON.parse($("#mw-json").value || W.json || "{}"); const sc = r.detected?.concepts?.length ? r.detected.concepts : W.cn || []; if (sc.length) cov = conceptCoverageHtml(sc, [...(d.situations || []), ...(d.qcm || [])]); } catch { /* not JSON yet */ }
    $("#mw-prev").innerHTML = (r.problems?.length ? problemsHtml(r.problems) : "") + cov + (r.preview ? `<div class="mes-res">${mesPreviewHtml(r.preview)}<div><h3 class="mes-h">Checklist</h3>${mesChecksHtml(r.checks)}</div></div>` : "");
    $("#mw-save").disabled = !!r.problems?.length || !r.preview;
    // problems left: the AI rewrites only the situations / QCM that have one (the rest is kept)
    $("#mw-fix").hidden = !r.problems?.length;
    $("#mw-check").classList.remove("primary");
  };
  const check = async (auto = false) => {
    const json = $("#mw-json").value;
    if (!json.trim()) throw new Error("Paste the JSON, or choose the .json file.");
    W.json = json;
    show(await api("/mises/import", { method: "POST", body: { json, ...scope() } }), auto);
  };
  let tmr = null;
  wireJsonBox(box, "mw-json", () => { W.res = null; $("#mw-save").disabled = true; clearTimeout(tmr); tmr = setTimeout(() => check(true).catch((e) => { $("#mw-prev").innerHTML = `<p class="small" style="color:var(--down)">${esc(e.message)}</p>`; }), 500); });
  $("#mw-check").onclick = (e) => busy(e.currentTarget, () => check());
  $("#mw-gen").onclick = (e) => busy(e.currentTarget, async () => {
    if (W.src === "brief" && !W.brief && !W.briefSrc) throw new Error("Choose the brief first.");
    if (!W.week) throw new Error("Pick a week of the programme.");
    const body = { ...scope(), week: W.week, comps: W.comps, metier: $("#mw-met").value, wishes: $("#mw-wish").value };
    if (W.src === "claude") {
      const r = await api("/mises/prompt", { method: "POST", body });
      W.prompt = r.prompt;
      const ta = $("#mw-prompt"); ta.value = r.prompt; ta.hidden = false; $("#mw-cp").hidden = false;
      copyText(r.prompt, "Prompt copied: paste it in Claude, then paste its JSON below");
      return;
    }
    { const c = counts(); $("#mw-st").textContent = `⏳ The AI writes ${c.nSituations} situation${c.nSituations > 1 ? "s" : ""} with their solution and checks${c.nQcm ? `, and ${c.nQcm} QCM` : ""}, then rewrites whatever doesn’t match the requirements (1 to ${Math.max(4, Math.ceil(c.nSituations * 0.8))} minutes)…`; }
    try {
      const r = await api("/mises/generate", { method: "POST", body });
      $("#mw-json").value = r.json; W.json = r.json; $("#mw-jbox").hidden = false;
      show(r);
      $("#mw-st").textContent = r.problems?.length ? `Written, ${r.problems.length} problem(s) left: click « Fix only what's wrong with the AI » (the rest is kept), or change the JSON.` : "✓ Written: read it, change what you want, then Save.";
      $("#mw-prev").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) { $("#mw-st").textContent = ""; throw err; }
  });
  $("#mw-cp").onclick = () => copyText(W.prompt, "Prompt copied");
  $("#mw-fix").onclick = (e) => busy(e.currentTarget, async () => {
    if (!W.week) throw new Error("Pick a week of the programme.");
    $("#mw-st").textContent = "⏳ The AI rewrites only what's wrong, then checks it again (1 to 4 minutes)…";
    try {
      const r = await api("/mises/fix", { method: "POST", body: { ...scope(), week: W.week, comps: W.comps, metier: $("#mw-met").value, wishes: $("#mw-wish").value, json: $("#mw-json").value } });
      $("#mw-json").value = r.json; W.json = r.json; $("#mw-jbox").hidden = false;
      show(r);
      $("#mw-st").textContent = r.problems?.length ? `${r.problems.length} problem(s) left: click « Fix » again, or change the JSON.` : "✓ Fixed: read it, then Save.";
    } catch (err) { $("#mw-st").textContent = ""; throw err; }
  });
  $("#mw-save").onclick = (e) => busy(e.currentTarget, async () => {
    const json = $("#mw-json").value;
    if (json !== W.json) { await check(); if (W.res?.problems?.length) return; }
    const r = await api("/mises/import", { method: "POST", body: { json, ...scope(), week: W.week, comps: W.comps, save: true } });
    if (r.problems?.length) { $("#mw-prev").innerHTML = problemsHtml(r.problems); $("#mw-save").disabled = true; return; }
    toast("Saved ✅ Launch it when you're ready"); MSIT.setup = null; location.hash = `#/mise/${r.id}`;
  });
  $("#mw-x").onclick = () => { box.innerHTML = ""; };
  showSrc("json");
  // from a brief's page (« Make one for this brief »): the AI writes it for that brief, linked to it when saved
  if (opts.brief) {
    $('[data-seg="mw-src"] [data-v="brief"]', box)?.click();
    await loadBriefs();
    $("#mw-brief").value = String(opts.brief);
    await $("#mw-brief").onchange();
  }
}
/** The checklist: what to fix (✗), what's fine (✓), reminders (ℹ). */
const mesChecksHtml = (list) => `<ul class="bchecks mes-checks">${(list || []).map((c) => `<li class="${c.tip ? "tip" : c.ok ? "ok" : "ko"}">${c.tip ? "ℹ" : c.ok ? "✓" : "⚠"} ${esc(c.text)}</li>`).join("") || `<li class="muted">—</li>`}</ul>`;
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
  // « Give work »: the launch window with the students already ticked
  if (MSIT.pendingLaunch && d.mise.status === "draft") { const pre = MSIT.pendingLaunch; MSIT.pendingLaunch = null; mesLaunchDialog(pre).catch((e) => toast(e.message, true)); }
  else MSIT.pendingLaunch = null;
}
function mesRender() {
  const { mise: m, takers } = MSIT.d, c = m.content;
  const done = takers.filter((t) => t.status === "submitted").length;
  view.innerHTML = `
    <div class="page-head"><div><p class="crumb"><a href="#/mises-en-situation">Mises en situation</a></p><h1>${esc(m.title)}</h1>
      <p class="sub">${mesStatus(m.status)} · week ${m.week ?? "—"} · ${c.situations.length} situations + ${c.qcm.length} QCM${m.starts_at ? ` · ${m.status === "scheduled" ? "starts" : "started"} ${fmtDateTime(m.starts_at)}` : ""}${m.ends_at ? ` · ${m.status === "closed" ? "ended" : "ends"} ${fmtDateTime(m.ends_at)}` : m.status === "live" ? " · open until you close it" : ""}</p>
      <p class="iv-sum" style="margin:6px 0 0">${m.comps.map((x) => compChip(x)).join(" ")} ${m.settings.brief ? `<a class="tag" href="#/brief/${m.settings.brief.id}">📄 ${esc(m.settings.brief.title)}</a> ` : ""}${m.settings.lockScreen ? `<span class="tag">🖥️ full screen, locked when they leave</span> ` : ""}${m.settings.noPaste ? `<span class="tag">✋ copy-paste blocked</span>` : `<span class="tag">📋 copy-paste allowed (recorded)</span>`} ${m.status === "draft" ? "" : ((n) => !m.target.length ? `<span class="tag">whole class</span>` : n ? `<span class="tag">${n} learner(s) chosen</span>` : "")(m.target.filter((x) => !(m.settings.testers || []).includes(x)).length)}${(m.settings.testers || []).length ? ` <span class="tag">🧪 ${m.settings.testers.length} teacher(s) testing</span>` : ""}</p></div>
      <div class="toolbar" style="margin:0">
        ${m.status === "draft" ? `<button class="btn primary" id="me-launch">Launch · choose who takes it</button>` : ""}
        ${m.status === "live" && takers.some((t) => t.status === "locked") ? `<button class="btn primary" id="me-unall">Let everyone stopped back in (${takers.filter((t) => t.status === "locked").length})</button>` : ""}
        ${m.status === "live" || m.status === "scheduled" ? `<button class="btn" id="me-add">＋ Add learners</button><button class="btn" id="me-ext">⏱ More time</button><button class="btn danger" id="me-close">Close for everyone</button>` : ""}
        ${m.status === "closed" ? `<button class="btn primary" id="me-late" title="Learners who were absent: they get it now with their own time, the session stays closed for the others">＋ Give it to absent learners</button><button class="btn" id="me-ext">⏱ Reopen with more time</button>` : ""}
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
  if ($("#me-launch")) $("#me-launch").onclick = (e) => busy(e.currentTarget, () => mesLaunchDialog());
  if ($("#me-unall")) $("#me-unall").onclick = (e) => busy(e.currentTarget, async () => { MSIT.d = await api(`/mises/${m.id}/unlock`, { method: "POST", body: {} }); toast("They can come back: their page asks for full screen again"); mesRender(); });
  if ($("#me-add")) $("#me-add").onclick = (e) => busy(e.currentTarget, () => mesAddDialog());
  if ($("#me-ext")) $("#me-ext").onclick = () => mesExtendDialog();
  if ($("#me-late")) $("#me-late").onclick = (e) => busy(e.currentTarget, () => mesLateDialog());
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
  root.innerHTML = `${m.status === "draft" ? `<div class="toolbar" style="margin:0 0 12px"><button class="btn primary" id="mc-edit">Edit</button><button class="btn" id="mc-json">{ } Edit the JSON</button><button class="btn" id="mc-dl">⬇ Download the JSON</button><button class="btn" id="mc-link" title="The AI links each situation and QCM to the Fiche's items it checks: nothing else changes, the past answers count at once">📐 Link to the Fiche (AI)</button></div>`
      : `<div class="toolbar" style="margin:0 0 12px"><button class="btn" id="mc-dl">⬇ Download the JSON</button><button class="btn" id="mc-link" title="The AI links each situation and QCM to the Fiche's items it checks: nothing else changes, the past answers count at once">📐 Link to the Fiche (AI)</button><span class="muted small">The learners have it: its content can't change anymore.</span></div>`}
    ${(m.checks || []).length ? `<section class="panel mes-cl"><details ${m.status === "draft" ? "open" : ""}><summary><b>Checklist</b> <span class="small muted">${m.checks.filter((x) => !x.ok && !x.tip).length ? `${m.checks.filter((x) => !x.ok && !x.tip).length} warning(s)` : "nothing to fix"}</span></summary>${mesChecksHtml(m.checks)}</details></section>` : ""}
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
  $("#mc-link").onclick = () => ficheLinkDialog("mise", m.id, m.title, () => route());
  $("#mc-dl").onclick = () => saveBlob(new Blob([json()], { type: "application/json" }), `mise-en-situation-${m.id}.json`);
  if ($("#mc-edit")) $("#mc-edit").onclick = (e) => busy(e.currentTarget, () => mesEditor(root));
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
// ---------------------------------------------------------------- the normal edit (a form; the checks stay as they are: JSON for those)
async function mesEditor(root) {
  const m = MSIT.d.mise, c = JSON.parse(JSON.stringify(m.content));
  const st = MSIT.setup || (MSIT.setup = await api("/mises/setup"));
  let comps = [...m.comps];
  const ta = (k, v, h = 70, ph = "") => `<textarea data-e="${k}" style="min-height:${h}px" placeholder="${esc(ph)}">${esc(v ?? "")}</textarea>`;
  const inp = (k, v, ph = "") => `<input type="text" data-e="${k}" value="${esc(v ?? "")}" placeholder="${esc(ph)}" style="width:100%">`;
  const sitHtml = (x, i) => `<section class="panel mes-ed"><div class="panel-head"><h2>S${i + 1}</h2><span class="small muted">${esc(RUNTIME[x.runtime] || x.runtime)} · ${x.checks.length} automatic check(s) (in the JSON)</span></div>
    <label>Title</label>${inp(`s.${i}.title`, x.title)}
    <label>Context <span class="muted">(the job, the character, the need)</span></label>${ta(`s.${i}.context`, x.context, 80)}
    <div class="field-row">
      <div><label>Difficulty</label><select data-e="s.${i}.difficulty">${[1, 2, 3, 4, 5].map((d) => `<option ${d === x.difficulty ? "selected" : ""}>${d}</option>`).join("")}</select></div>
      <div><label>Points</label><input type="number" min="0.05" max="10" step="0.05" data-e="s.${i}.points" value="${x.points}"></div>
      <div style="flex:2"><label>Notions <span class="muted">(comma separated)</span></label>${inp(`s.${i}.notions`, x.notions.join(", "))}</div>
      <div><label>Competencies</label>${inp(`s.${i}.competencies`, x.competencies.join(", "), "C4N1")}</div></div>
    <label>Sub-questions <span class="muted">(one per line)</span></label>${ta(`s.${i}.questions`, x.questions.join("\n"), 110)}
    <label>Expected behaviour</label>${ta(`s.${i}.expected`, x.expected, 50)}
    ${x.files.map((f, k) => `<label>Starter code · <code>${esc(f.name)}</code></label><textarea data-e="s.${i}.f.${k}" class="code-ta" spellcheck="false" style="min-height:90px">${esc(f.starter)}</textarea>`).join("")}
    <details><summary class="small"><b>Reference solution</b> <span class="muted">(never sent to the learners)</span></summary>${x.solution.map((f, k) => `<label><code>${esc(f.name)}</code></label><textarea data-e="s.${i}.sol.${k}" class="code-ta" spellcheck="false" style="min-height:140px">${esc(f.content)}</textarea>`).join("")}</details>
  </section>`;
  const qHtml = (q, i) => `<div class="mes-ed-q"><b>Q${i + 1}</b>
    <label>Question</label>${ta(`q.${i}.question`, q.question, 50)}
    <label>Code <span class="muted">(optional)</span></label><textarea data-e="q.${i}.code" class="code-ta" spellcheck="false" style="min-height:50px">${esc(q.code || "")}</textarea>
    <label>Choices <span class="muted">(tick the right one)</span></label>
    ${[0, 1, 2, 3].map((k) => `<div class="mes-ed-ch"><input type="radio" name="qc${i}" value="${k}" data-e="q.${i}.correct" ${q.correct === k ? "checked" : ""} aria-label="Right answer ${"ABCD"[k]}"><b>${"ABCD"[k]}</b>${inp(`q.${i}.c.${k}`, q.choices[k] || "", k >= 3 ? "(optional 4th choice)" : "")}</div>`).join("")}
    <div class="field-row"><div style="flex:2"><label>Notion</label>${inp(`q.${i}.notion`, q.notion)}</div><div><label>Points</label><input type="number" min="0.05" max="10" step="0.05" data-e="q.${i}.points" value="${q.points}"></div><div><label>Competencies</label>${inp(`q.${i}.competencies`, q.competencies.join(", "))}</div></div></div>`;
  const weeks = st.weeks;
  root.innerHTML = `<div class="toolbar" style="margin:0 0 12px"><button class="btn primary" id="me-save">Save</button><button class="btn" id="me-cancel">Cancel</button><span class="small muted">Saved, it's checked again like an import. The automatic checks: <b>Edit the JSON</b>.</span></div>
    <div id="me-prob"></div>
    <section class="panel mes-ed"><h2>General</h2>
      <label>Title</label>${inp("title", m.title)}
      <label>Job / theme</label>${inp("metier", c.metier)}
      <div class="field-row"><div><label for="me-wk">Programme week</label><select id="me-wk"><option value="">No week</option>${weeks.map((w) => `<option value="${w.n}" ${w.n === m.week ? "selected" : ""}>Week ${w.n}${w.sprint ? ` · sprint ${w.sprint}` : ""} · ${esc(w.title || "")}</option>`).join("")}</select></div></div>
      <details class="mes-cd"><summary><b>Competencies tested</b> <span id="me-csum"></span> <span class="muted small">· change</span></summary><div class="mes-chips" id="me-comps"></div></details></section>
    ${c.situations.map(sitHtml).join("")}
    <section class="panel mes-ed"><h2>QCM</h2>${c.qcm.map(qHtml).join("")}</section>
    <div class="toolbar"><button class="btn primary" id="me-save2">Save</button></div>`;
  const drawC = () => {
    const w = weeks.find((x) => x.n === Number($("#me-wk").value));
    const sp = st.sprints.find((x) => x.n === w?.sprint);
    const all = [...new Set([...(w?.competencies || []), ...(w?.soft || []), ...(sp?.tech || []), ...(sp?.soft || []), ...comps])];
    $("#me-comps").innerHTML = all.map((x) => `<button type="button" class="mes-chip ${/^CT/.test(x) ? "soft" : ""}" data-cc="${esc(x)}" aria-pressed="${comps.includes(x)}"><b>${esc(cText(x))}</b></button>`).join("") || `<span class="small muted">No competency for this week.</span>`;
    $("#me-csum").innerHTML = comps.map((x) => compChip(x)).join(" ");
    $$("[data-cc]", root).forEach((b) => b.onclick = () => { const x = b.dataset.cc; comps = comps.includes(x) ? comps.filter((y) => y !== x) : [...comps, x]; drawC(); });
  };
  $("#me-wk").onchange = drawC; drawC();
  const val = (k) => $(`[data-e="${k}"]`, root)?.value ?? "";
  const list = (v) => v.split(",").map((x) => x.trim()).filter(Boolean);
  const codes = (v) => list(v).map((y) => y.toUpperCase().replace(/\s+/g, ""));
  const save = async () => {
    const out = { format: c.format, title: val("title"), week: Number($("#me-wk").value) || null, metier: val("metier"), competencies: comps,
      situations: c.situations.map(({ id, ...x }, i) => ({ ...x, title: val(`s.${i}.title`), context: val(`s.${i}.context`), difficulty: Number(val(`s.${i}.difficulty`)), points: Number(val(`s.${i}.points`)),
        notions: list(val(`s.${i}.notions`)), competencies: codes(val(`s.${i}.competencies`)),
        questions: val(`s.${i}.questions`).split("\n").map((y) => y.trim()).filter(Boolean), expected: val(`s.${i}.expected`),
        files: x.files.map((f, k) => ({ ...f, starter: val(`s.${i}.f.${k}`) })), solution: x.solution.map((f, k) => ({ ...f, content: val(`s.${i}.sol.${k}`) })),
        checks: x.checks.map(({ id: _, ...k }) => k) })),
      qcm: c.qcm.map(({ id, code: _c, ...q }, i) => {
        const choices = [0, 1, 2, 3].map((k) => val(`q.${i}.c.${k}`).trim());
        const pick = Number($(`[data-e="q.${i}.correct"]:checked`, root)?.value ?? q.correct);
        const keep = choices.map((t, k) => ({ t, k })).filter((x) => x.t);
        const code = val(`q.${i}.code`);
        return { ...q, question: val(`q.${i}.question`), ...(code.trim() ? { code } : {}), choices: keep.map((x) => x.t), correct: Math.max(0, keep.findIndex((x) => x.k === pick)),
          notion: val(`q.${i}.notion`), points: Number(val(`q.${i}.points`)), competencies: codes(val(`q.${i}.competencies`)) };
      }) };
    if (!comps.length) throw new Error("Choose at least one competency.");
    const r = await api(`/mises/${m.id}`, { method: "PUT", body: { title: out.title, week: out.week, comps, json: JSON.stringify(out) } });
    if (r.problems?.length) { $("#me-prob").innerHTML = problemsHtml(r.problems); $("#me-prob").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    MSIT.d = r; toast("Saved ✅"); mesRender();
  };
  $("#me-save").onclick = (e) => busy(e.currentTarget, save);
  $("#me-save2").onclick = (e) => busy(e.currentTarget, save);
  $("#me-cancel").onclick = () => mesRender();
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
const MES_FILTERS = [["all", "Everyone"], ["locked", "🔒 Stopped"], ["left", "Left the page"], ["pasted", "Pasted"], ["stuck", "Stuck (10 min+ on one item)"], ["absent", "Absent"], ["done", "Finished"], ["todo", "Not started"]];
function mesLiveTab(root) {
  const { mise: m, takers } = MSIT.d, c = m.content, n = mesItems(c).length, nowS = m.now;
  const stuck = (t) => ["working", "locked", "absent"].includes(t.live) && t.itemSince && nowS - t.itemSince > 600;
  const keep = { all: () => true, locked: (t) => t.live === "locked", left: (t) => t.leaves > 0, pasted: (t) => t.pastes > 0 || t.blockedPastes > 0, stuck, absent: (t) => t.live === "absent", done: (t) => t.status === "submitted", todo: (t) => t.status === "invited" }[MSIT.filter] || (() => true);
  const rows = takers.filter(keep).map((t) => ({ ...t, nameS: t.name || t.discord_id, progressN: t.answered, statusS: ["locked", "working", "absent", "not-started", "done"].indexOf(t.live), onSec: t.itemSince && t.status !== "submitted" ? nowS - t.itemSince : -1 }));
  const cnt = (f) => takers.filter({ locked: (t) => t.live === "locked", left: (t) => t.leaves > 0, pasted: (t) => t.pastes > 0 || t.blockedPastes > 0, stuck, absent: (t) => t.live === "absent", done: (t) => t.status === "submitted", todo: (t) => t.status === "invited" }[f] || (() => true)).length;
  root.innerHTML = `
    <div class="figures cs-figs">
      <div class="figure"><span class="ico">👩‍💻</span><div><b>${takers.filter((t) => t.live === "working").length}</b><span>working now</span></div></div>
      <div class="figure ${takers.some((t) => t.live === "absent" || t.live === "locked") ? "cs-attn" : ""}"><span class="ico">${m.settings.lockScreen ? "🔒" : "🚪"}</span><div><b>${takers.filter((t) => t.live === (m.settings.lockScreen ? "locked" : "absent")).length}</b><span>${m.settings.lockScreen ? "stopped (left full screen)" : "away or silent"}</span></div></div>
      <div class="figure"><span class="ico">📋</span><div><b>${takers.reduce((s, t) => s + t.pastes, 0)}</b><span>pastes (${takers.reduce((s, t) => s + t.pasteChars, 0)} characters)</span></div></div>
      <div class="figure"><span class="ico">✅</span><div><b>${takers.filter((t) => t.status === "submitted").length}/${takers.length}</b><span>handed in</span></div></div>
    </div>
    <section class="panel">
      <div class="panel-head"><div class="mes-filters" role="group" aria-label="Filter">${MES_FILTERS.filter(([k]) => (m.settings.lockScreen ? k !== "left" : k !== "locked")).map(([k, l]) => `<button type="button" class="btn small" data-mf="${k}" aria-pressed="${MSIT.filter === k}">${esc(l)}${k !== "all" ? ` <span class="muted">${cnt(k)}</span>` : ""}</button>`).join("")}</div>
        <span class="toolbar" style="margin:0"><span class="muted small">${m.status === "live" ? "Refreshes every 5 s" : ""}</span><button class="btn small" id="ml-links">Copy the links</button><a class="btn small" href="/api/mises/${m.id}/live.csv?g=${encodeURIComponent(S.g)}" download>⬇ CSV</a></span></div>
      ${table([
        { label: "Learner", sort: "nameS", html: (t) => `<button class="res-who" data-ml="${t.id}">${avatar(t.name, t.discord_id)}<span><b>${esc(t.name || t.discord_id)}</b>${t.test ? ` <span class="tag">test</span>` : ""}${t.late ? ` <span class="tag" title="Given later: their own ${t.late.minutes} minutes from when they open it${t.late.endsAt ? `, until ${fmtDateTime(t.late.endsAt)}` : ""}">⏱ own time</span>` : ""}<small>open →</small></span></button>` },
        { label: "Status", sort: "statusS", html: (t) => `${mesLive(t.live)}${t.away && t.live !== "locked" ? ` <span class="small muted">away now</span>` : ""}${t.live === "locked" ? `<div class="small muted">${t.status === "resume" ? "let back in · coming back" : esc(MES_LOCK[t.lockWhy] || "left full screen")}${t.locks > 1 ? ` · ${t.locks}×` : ""}</div>` : ""}` },
        // where they are and for how long: 10 min or more on the same question = stuck (blocked)
        { label: "On question", sort: "onSec", html: (t) => (["active", "locked", "resume"].includes(t.status) && t.item ? `<b>${mesItemLabel(c, t.item)}</b>${t.itemSince ? `<div class="mes-on ${stuck(t) ? "stuck" : ""}" title="Time on this question">⏱ ${mesDur(nowS - t.itemSince)}${stuck(t) ? " · stuck?" : ""}</div>` : ""}` : "—") },
        { label: "Progress", sort: "progressN", html: (t) => `${meter(n ? (100 * t.answered) / n : 0)}<span class="small muted">${t.answered}/${n}</span>` },
        { label: "Time", num: true, sort: "timeSec", html: (t) => `<span title="On the items: ${mesDur(t.workSec)}">${mesDur(t.timeSec)}</span>` },
        { label: "Correct", num: true, sort: "correct", html: (t) => `<b style="color:${t.correct ? "var(--up)" : "inherit"}">${t.correct}</b><span class="small muted">/${n}</span>` },
        m.settings.lockScreen ? { label: "Sessions stopped", num: true, sort: "locks", html: (t) => (t.locks ? `<b>${t.locks}×</b>` : "0") }
          : { label: "Left page", num: true, sort: "leaves", html: (t) => (t.leaves ? `<b>${t.leaves}×</b><div class="small muted">${mesDur(t.awaySec)}</div>` : "0") },
        ...(m.settings.netAlerts ? [{ label: "Network", html: (t) => netHtml(t.net) }] : []),
        { label: "Pastes", num: true, sort: "pastes", html: (t) => (t.pastes || t.blockedPastes ? `<b>${t.pastes}</b>${t.pasteChars ? `<div class="small muted">${t.pasteChars} chars</div>` : ""}${t.blockedPastes ? `<div class="small" style="color:var(--warn)">${t.blockedPastes} blocked</div>` : ""}` : "0") },
        { label: "", html: (t) => `<span class="mes-acts">${t.status === "locked" ? `<button class="btn small primary" data-mu="${t.id}">Let back in</button>` : ""}${t.status !== "submitted" && m.status !== "closed" ? `<button class="btn small" data-mr="${t.id}" title="Send their link again by DM">Resend</button>` : ""}${t.status === "submitted" && m.status !== "closed" ? `<button class="btn small" data-mro="${t.id}" title="Handed in by mistake: their paper opens again, where they were">Reopen paper</button>` : ""}${t.status === "invited" ? ` <button class="btn small danger" data-mx="${t.id}" title="Take back the invitation">Remove</button>` : ` <button class="btn small danger" data-mdel="${t.id}" title="Delete their paper and results, then invite them again">Delete paper</button>`}</span>` },
      ], rows, { empty: MSIT.filter === "all" ? "Nobody yet: launch it for the class." : "Nobody in this filter." })}
    </section>`;
  $$("[data-mf]", root).forEach((b) => b.onclick = () => { MSIT.filter = b.dataset.mf; mesLiveTab(root); });
  $$("[data-ml]", root).forEach((b) => b.onclick = () => busy(b, () => mesLearner(Number(b.dataset.ml))));
  $$("[data-mr]", root).forEach((b) => b.onclick = () => busy(b, async () => { const r = await api(`/mises/${m.id}/resend`, { method: "POST", body: { taker: Number(b.dataset.mr) } }); toast(r.sent ? "Link sent by DM" : "The DM didn't go through: copy their link instead", !r.sent); }));
  $$("[data-mu]", root).forEach((b) => b.onclick = () => busy(b, async () => { MSIT.d = await api(`/mises/${m.id}/unlock`, { method: "POST", body: { taker: Number(b.dataset.mu) } }); toast("Let back in: their page asks for full screen again"); mesRender(); }));
  $$("[data-mx]", root).forEach((b) => b.onclick = () => busy(b, async () => { MSIT.d = await api(`/mises/${m.id}/remove`, { method: "POST", body: { taker: Number(b.dataset.mx) } }); mesRender(); }));
  $$("[data-mdel]", root).forEach((b) => b.onclick = () => { const t = takers.find((x) => x.id === Number(b.dataset.mdel)); if (t) mesResetDialog(t); });
  $$("[data-mro]", root).forEach((b) => b.onclick = () => { const t = takers.find((x) => x.id === Number(b.dataset.mro)); if (!t) return;
    confirmDialog(`Reopen ${t.name || t.discord_id}'s paper?`, "Handed in by mistake: they open their link again and go on where they were (their answers are kept). Their results come back when they hand it in again.", "Reopen their paper",
      async () => { MSIT.d = await api(`/mises/${m.id}/reopen`, { method: "POST", body: { taker: t.id } }); toast("Reopened: they open their link again"); mesRender(); }); });
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
      <div class="panel-head"><h2>Results</h2><span class="toolbar" style="margin:0"><a class="btn small" href="/api/mises/${m.id}/results.csv?g=${encodeURIComponent(S.g)}" download>⬇ CSV</a><a class="btn small" href="/api/mises/${m.id}/answers.json?g=${encodeURIComponent(S.g)}" download title="Their work, the paper and the instructions: give this file to Claude (claude.ai) to grade it">⬇ Answers for Claude (JSON)</a><button class="btn small" id="mr-claude" ${done.length ? "" : "disabled"}>📥 Import Claude's grades</button><button class="btn small primary" id="mr-send" ${done.length ? "" : "disabled"}>Send the results by DM</button></span></div>
      <p class="muted small" style="margin-top:0">The automatic score: the share of checks passed (situations) and the right answer (QCM), weighted by the points. Click a score to change it (✎ = yours), a learner to see everything they did and write their comment. Results go to their competencies once nothing is left to grade.</p>
      <p class="muted small">Weight of each item in the score (its points ÷ ${mesWeight(c, ids[0]).total} points). Under each result: what it adds to the score.<br>${ids.map((id) => `<b>${mesItemLabel(c, id)}</b> ${mesWeight(c, id).pct}%`).join(" · ")}</p>
      ${done.length ? `<div class="table-wrap"><table class="res-table"><thead><tr><th>Learner</th><th>Score</th>${ids.map((id) => `<th class="ctr"><span class="qh">${mesItemLabel(c, id)}</span><span class="mes-w">${mesWeight(c, id).pct}%</span></th>`).join("")}</tr></thead>
        <tbody>${done.map((t) => `<tr><td><button class="res-who" data-ml="${t.id}">${avatar(t.name, t.discord_id)}<span><b>${esc(t.name || t.discord_id)}</b>${t.test ? ` <span class="tag">test</span>` : ""}<small>${t.toGrade ? `${t.toGrade} to grade` : t.sent_at ? "sent ✓" : "open →"}</small></span></button></td>
          <td><div class="res-score"><b style="color:${masteryInk(t.score)}">${t.score}%</b>${meter(t.score)}</div></td>${ids.map((id) => cell(t, id)).join("")}</tr>`).join("")}</tbody></table></div>`
        : `<div class="empty-state"><div style="font-size:40px">📭</div><p class="muted">No paper handed in yet.</p></div>`}
    </section>`;
  $$("[data-ml]", root).forEach((b) => b.onclick = () => busy(b, () => mesLearner(Number(b.dataset.ml))));
  $$("[data-mg]", root).forEach((b) => b.onclick = () => busy(b, async () => { const d = await api(`/mises/${m.id}/taker/${b.dataset.mg}`); mesGradeDialog(d, b.dataset.it, () => viewMise(m.id)); }));
  if ($("#mr-claude")) $("#mr-claude").onclick = () => mesClaudeImport(m);
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
    <label for="mg-c">Comment <span class="muted">(sent to the learner with the results: what was wrong, what to study again)</span></label><textarea id="mg-c" rows="3" style="width:100%">${esc(g.comment || "")}</textarea>
    <p class="small muted" style="margin:4px 0 0">Leave the score empty to keep the automatic one (the comment is kept).</p>`,
  [...(g.teacher ? [{ label: "Back to automatic", action: async () => { await api(`/mises/${MSIT.d.mise.id}/grade`, { method: "PUT", body: { taker: d.id, item, score: null, comment: $("#mg-c").value.trim() } }); dlg.close(); after(); } }] : []),
    { label: "Save", primary: true, action: async () => { const v = $("#mg-s").value, cm = $("#mg-c").value.trim(); if (v === "" && !cm) throw new Error("Give a score from 0 to 100, or a comment."); await api(`/mises/${MSIT.d.mise.id}/grade`, { method: "PUT", body: { taker: d.id, item, score: v === "" ? null : Number(v), comment: cm } }); dlg.close(); toast("Saved"); after(); } }]);
}

// ---------------------------------------------------------------- one learner: everything they did
const MES_EV = { lock: "🔒 Session stopped", unlock: "🔓 Let back in", start: "▶ Started", item: "→ Moved to", leave: "🚪 Left the page", back: "↩ Came back", paste: "📋 Pasted", "paste-blocked": "✋ Paste blocked", run: "▶ Ran", check: "🔎 AI check", submit: "✅ Handed in", reopen: "⏱ Reopened: continues their paper" };
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
      ${d.grades[s.id]?.comment ? `<p class="small mes-note">💬 ${esc(d.grades[s.id].comment)}</p>` : ""}
      <div class="toolbar" style="margin:8px 0 0">${visits.length ? `<button class="btn small" data-rp="${s.id}">⏯ Typing replay (${visits.length} visit${visits.length > 1 ? "s" : ""})</button>` : `<span class="small muted">No typing record.</span>`}<button class="btn small" data-gr="${s.id}">✎ Grade</button></div></details>`;
  };
  const qcmHtml = (q, i) => {
    const a = d.answers[q.id], it = d.items[q.id], pick = a && a.choice != null ? a.choice : null;
    return `<li><b>Q${i + 1}</b> ${esc(q.question.slice(0, 120))} — ${pick == null ? `<span class="lvl none">no answer</span>` : `${"ABCD"[pick]}. ${esc(q.choices[pick])} ${pick === q.correct ? "<span class='tag easy'>right</span>" : `<span class='tag hard'>wrong</span> <span class="muted small">(right: ${"ABCD"[q.correct]})</span>`}`}${it.teacher ? ` ✎ ${it.score}%` : ""}${d.grades[q.id]?.comment ? `<div class="small mes-note">💬 ${esc(d.grades[q.id].comment)}</div>` : ""} <button class="btn small" data-gr="${q.id}">✎</button></li>`;
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
async function mesLaunchDialog(pre = []) {
  const m = MSIT.d.mise;
  const st = MSIT.setup || (MSIT.setup = await api("/mises/setup"));
  const local = (u) => { const d = new Date(u * 1000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const picked = new Set(pre.length ? pre : m.target.filter((x) => !(m.settings.testers || []).includes(x)));
  const groups = [...st.teams.map((t) => ({ k: "t" + t.id, name: "👥 " + t.name, m: t.members })), ...st.squads.map((q) => ({ k: "s" + q.id, name: "🧩 " + q.name, m: q.members }))];
  openDialog("🚀 Launch", `
    <label>Who takes it</label>
    <div class="seg-row">${segHtml("ml-who", [["all", "The whole class"], ["some", "A selection"], ["test", "Only me (a test)"]], picked.size ? "some" : "all")} <span class="small muted" id="ml-n"></span></div>
    <div id="ml-pick" ${picked.size ? "" : "hidden"}>
      <div class="toolbar" style="margin:8px 0"><input type="search" id="ml-q" placeholder="Search a learner…" aria-label="Search a learner" style="flex:1;min-width:160px">
        <button class="btn small" id="ml-alls" type="button">Select all</button><button class="btn small" id="ml-none" type="button">None</button></div>
      ${groups.length ? `<div class="mes-groups small"><span class="muted">Add a group:</span> ${groups.map((g) => `<button class="btn small" type="button" data-grp="${esc(g.k)}">${esc(g.name)}</button>`).join(" ")}</div>` : ""}
      <div class="mes-people" id="ml-people">${st.students.map((s) => `<label class="check" data-name="${esc((s.name || s.discord_id).toLowerCase())}"><input type="checkbox" value="${esc(s.discord_id)}" ${picked.has(s.discord_id) ? "checked" : ""}> ${avatar(s.name, s.discord_id)} ${esc(s.name || s.discord_id)}</label>`).join("")}</div>
    </div>
    <div class="mes-test" id="ml-test" hidden>${(st.staff || []).length === 1
      ? `<span class="small">🧪 Sent to you only, <b>${esc(st.staff[0].name || st.staff[0].discord_id)}</b>, by DM like a learner. <span class="muted">Not counted in the class, nothing goes to your record.</span></span>`
      : (st.staff || []).length
        ? `<label for="ml-me" class="small"><b>🧪 Which one are you?</b> <span class="muted">(it's sent to you only, by DM like a learner; not counted in the class)</span></label><select id="ml-me">${st.staff.map((x) => `<option value="${esc(x.discord_id)}" ${(m.settings.testers || [])[0] === x.discord_id ? "selected" : ""}>${esc(x.name || x.discord_id)}</option>`).join("")}</select>`
        : `<span class="small muted">🧪 To test it yourself, use any ClassBot command in the class's Discord first (for example <code>/profile</code>), then come back here.</span>`}</div>
    <div class="field-row">
      <div><label for="ml-when">Start</label><select id="ml-when"><option value="now">Now</option><option value="at">At a time…</option></select></div>
      <div><label for="ml-at">Time</label><input type="datetime-local" id="ml-at" value="${local(Math.ceil(Date.now() / 1000 / 900) * 900 + 900)}" disabled></div>
      <div><label for="ml-min">Duration (minutes)</label><input type="number" id="ml-min" min="0" max="600" value="${m.settings.minutes || 90}"><small class="muted">0 = open until you close it</small></div>
    </div>
    <p class="small" style="margin:12px 0 4px">🔐 <b>Sign in with Discord</b> is always required: the link only opens for the account it was sent to.</p>
    <label class="check"><input type="checkbox" id="ml-od" ${m.settings.oneDevice !== false ? "checked" : ""}> <span><b>One device per paper</b> <span class="muted small">(signing in on another computer or phone while working stops their session until you let them back in)</span></span></label>
    <label class="check"><input type="checkbox" id="ml-net" ${m.settings.netAlerts !== false ? "checked" : ""}> <span><b>Network alerts</b> <span class="muted small">(the Live tab flags a paper opened outside the class's network, or from several networks; nothing is blocked)</span></span></label>
    <label class="check"><input type="checkbox" id="ml-fs" ${m.settings.lockScreen !== false ? "checked" : ""}> <span><b>Full screen, like an assessment</b> <span class="muted small">(leaving full screen, the tab or the window stops their session until you let them back in from the Live tab)</span></span></label>
    <label class="check"><input type="checkbox" id="ml-np" ${m.settings.noPaste ? "checked" : ""}> <span><b>Block copy-paste</b> in the editor <span class="muted small">(off: pastes are allowed and recorded, with what was pasted)</span></span></label>
    <label class="check"><input type="checkbox" id="ml-ch" ${m.settings.channel ? "checked" : ""}> <span>Post a short message in the class channel</span></label>
    <label class="check"><input type="checkbox" id="ml-dm" checked> <span>Send each learner their link by DM</span></label>`,
  [{ label: "Launch", primary: true, action: async () => {
    const who = segVal(dlg, "ml-who");
    const students = who === "some" ? $$("#ml-people input:checked", dlg).map((x) => x.value) : [];
    // « only me »: the teacher (the only staff member, or the one picked); the whole class / a selection: learners only
    const me = $("#ml-me", dlg)?.value || (st.staff || [])[0]?.discord_id;
    const testers = who === "test" && me ? [me] : [];
    if (who === "some" && !students.length) throw new Error("Pick at least one learner, or the whole class.");
    if (who === "test" && !testers.length) throw new Error("Use a ClassBot command in the class's Discord first (for example /profile): then you can test it.");
    const at = $("#ml-when").value === "at" ? Math.round(new Date($("#ml-at").value).getTime() / 1000) : 0;
    if ($("#ml-when").value === "at" && !(at > 0)) throw new Error("Pick the start time.");
    const r = await api(`/mises/${m.id}/launch`, { method: "POST", body: { students, only: who === "test", testers, startsAt: at || null, minutes: Number($("#ml-min").value) || 0,
      lockScreen: $("#ml-fs").checked, oneDevice: $("#ml-od").checked, netAlerts: $("#ml-net").checked, noPaste: $("#ml-np").checked, channel: $("#ml-ch").checked, send: $("#ml-dm").checked } });
    dlg.close(); MSIT.d = r; MSIT.tab = "live";
    toast(`${r.invited} learner(s) · ${r.sent} DM sent${r.sent < r.invited ? " · copy the links of the others in Live" : ""}`);
    mesRender();
  } }]);
  dlg.classList.add("wide");
  const people = $("#ml-people", dlg);
  const count = () => { const w = segVal(dlg, "ml-who"); $("#ml-n", dlg).textContent = w === "all" ? `${st.students.length} learners` : w === "some" ? `${$$("input:checked", people).length} selected` : ""; };
  wireSeg(dlg, "ml-who", (v) => { $("#ml-pick", dlg).hidden = v !== "some"; $("#ml-test", dlg).hidden = v !== "test"; count(); });
  $("#ml-q", dlg).oninput = () => { const q = $("#ml-q", dlg).value.trim().toLowerCase(); $$("label", people).forEach((l) => { l.hidden = !!q && !l.dataset.name.includes(q); }); };
  $("#ml-alls", dlg).onclick = () => { $$("label:not([hidden]) input", people).forEach((x) => { x.checked = true; }); count(); };
  $("#ml-none", dlg).onclick = () => { $$("input", people).forEach((x) => { x.checked = false; }); count(); };
  $$("[data-grp]", dlg).forEach((b) => b.onclick = () => {
    const k = b.dataset.grp, g = groups.find((x) => x.k === k);
    for (const id of g?.m || []) { const x = $(`input[value="${CSS.escape(id)}"]`, people); if (x) x.checked = true; }
    count();
  });
  people.onchange = count;
  count();
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
/** Learners absent at the launch: they get it now, with their own time (from when they open it); closed for the others. */
async function mesLateDialog() {
  const m = MSIT.d.mise;
  const st = MSIT.setup || (MSIT.setup = await api("/mises/setup"));
  const have = new Set(MSIT.d.takers.map((t) => t.discord_id));
  const rest = st.students.filter((s) => !have.has(s.discord_id));
  // their time: the session's minutes, else how long it was open
  const was = m.ends_at && (m.starts_at || m.opened_at) ? Math.round((m.ends_at - (m.starts_at || m.opened_at)) / 60) : 0;
  const def = Math.max(5, Math.min(600, m.settings?.minutes || was || 60));
  openDialog("＋ Give it to absent learners", rest.length ? `<p class="small muted" style="margin-top:0">The learners who didn't take it. Each one gets <b>their own time</b>, counted from when they open their link (valid two weeks): give it when they're in class. The session stays closed for the others; their results count like everyone's.</p>
      <div class="mes-people">${rest.map((s) => `<label class="check"><input type="checkbox" value="${esc(s.discord_id)}"> ${avatar(s.name, s.discord_id)} ${esc(s.name || s.discord_id)}</label>`).join("")}</div>
      <p style="margin:12px 0 0"><label for="mlt-min">Their time (minutes)</label> <input type="number" id="mlt-min" min="5" max="600" value="${def}" style="width:110px"></p>
      <label class="check" style="margin-top:8px"><input type="checkbox" id="mlt-dm" checked> Send them their link by Discord DM now</label>`
    : `<p class="muted">Every learner of the class already has it. To give someone a new paper, reset theirs in the Live tab.</p>`,
    rest.length ? [{ label: "Give it to them", primary: true, action: async () => {
      const ids = $$(".mes-people input:checked", dlg).map((x) => x.value);
      if (!ids.length) throw new Error("Pick at least one learner.");
      const r = await api(`/mises/${m.id}/late`, { method: "POST", body: { students: ids, minutes: Number($("#mlt-min").value), send: $("#mlt-dm").checked } });
      dlg.close(); MSIT.d = r; toast(`${r.invited} learner${r.invited > 1 ? "s" : ""} · ${r.minutes} min each${r.sent ? ` · ${r.sent} DM sent` : " · copy their link in the Live tab"}`); mesRender();
    } }] : []);
}
function mesExtendDialog() {
  const m = MSIT.d.mise;
  // papers handed in: the teacher chooses who continues theirs (ticked: handed in by the closing or the time running out)
  const done = (MSIT.d.takers || []).filter((t) => t.status === "submitted");
  openDialog(m.status === "closed" ? "⏱ Reopen with more time" : "⏱ More time", `<p class="small muted" style="margin-top:0">${m.ends_at ? `${m.status === "closed" ? "It ended" : "Now it ends"} ${fmtDateTime(m.ends_at)}.` : "It has no end: this gives it one."} Everyone gets the same extra time${m.status === "closed" ? " and the session opens again" : ""}.</p>
    <label for="me-m">Extra minutes</label><input type="number" id="me-m" min="1" max="600" value="15" style="width:120px">
    ${done.length ? `<h4 style="margin:14px 0 4px">Let them continue their paper</h4>
      <p class="small muted" style="margin:0 0 6px">They go on where they were (their answers are kept); their results come back when they hand it in again. Ticked: handed in by the closing or when the time ran out.</p>
      <div class="mes-people">${done.map((t) => `<label class="check"><input type="checkbox" value="${t.id}" data-cont ${t.autoSub ? "checked" : ""}> <span>${esc(t.name || t.discord_id)} <span class="muted small">${t.autoSub ? "handed in by the closing" : "handed it in themselves"}</span></span></label>`).join("")}</div>` : ""}`,
  [{ label: m.status === "closed" ? "Reopen" : "Add the time", primary: true, action: async () => {
    const cont = $$("[data-cont]:checked", dlg).map((x) => Number(x.value));
    const r = await api(`/mises/${m.id}/extend`, { method: "POST", body: { minutes: Number($("#me-m").value), continue: cont } });
    MSIT.d = r; dlg.close();
    toast(m.status === "closed" ? `Reopened${r.continued ? ` · ${r.continued} can continue: they open their link again` : ""}` : "Time added"); mesRender(); } }]);
}
/** Claude's correction back: the JSON it answered becomes your grades (each still editable) and their comments. */
function mesClaudeImport(m) {
  openDialog("📥 Import Claude's grades", `<ol class="small" style="margin:0 0 10px;padding-left:18px">
      <li><b>⬇ Answers for Claude (JSON)</b>: the paper, what's expected, each learner's work and the instructions.</li>
      <li>In <a href="https://claude.ai" target="_blank" rel="noopener noreferrer">claude.ai</a>, attach the file and write « Corrige ». Claude answers with a JSON.</li>
      <li>Paste that JSON here (or choose the file).</li></ol>
    <textarea id="mc-json" rows="10" style="width:100%;font-family:var(--mono, monospace);font-size:12px" placeholder='{ "format": "classbot-mise-grades@1", "grades": [ … ], "comments": [ … ] }'></textarea>
    <p class="toolbar" style="margin:6px 0 0"><input type="file" id="mc-file" accept=".json,application/json,text/plain"></p>
    <p class="muted small" style="margin:6px 0 0">Each grade becomes yours (✎, you can still change it) and each comment goes with their results. Nothing is sent to the learners until you press « Send the results by DM ».</p>`,
  [{ label: "Import the grades", primary: true, action: async () => {
    const txt = $("#mc-json", dlg).value.trim();
    if (!txt) throw new Error("Paste Claude's JSON first.");
    const r = await api(`/mises/${m.id}/claude-grades`, { method: "POST", body: { json: txt } });
    MSIT.d = r; dlg.close();
    toast(`${r.grades} grade(s) and ${r.comments} comment(s) imported for ${r.learners} learner(s)${r.skipped.length ? ` · skipped: ${r.skipped.slice(0, 3).join(", ")}` : ""}`, !!r.skipped.length && !r.grades);
    mesRender(); } }]);
  $("#mc-file", dlg).onchange = async (e) => { const f = e.target.files[0]; if (f) $("#mc-json", dlg).value = await f.text(); };
}
/** Delete a learner's paper (their work and results), and invite them again with a new paper if asked. */
function mesResetDialog(t) {
  const m = MSIT.d.mise, closed = m.status === "closed";
  openDialog(`Delete ${t.name || t.discord_id}'s paper?`, `<p>Their answers, their record of this mise en situation and the results it put on their profile are deleted. This can't be undone.</p>
    <label class="check"><input type="checkbox" id="me-rinv" checked> <span><b>Invite them again</b> <span class="muted small">(a new, empty paper${closed ? "; it's closed: reopen it with more time so they can take it" : ", their new link by DM"})</span></span></label>`,
  [{ label: "Delete their paper", danger: true, action: async () => {
    const invite = $("#me-rinv").checked;
    const r = await api(`/mises/${m.id}/reset`, { method: "POST", body: { taker: t.id, invite }, confirmed: true });
    MSIT.d = r; dlg.close();
    toast(invite ? (r.sent ? "Deleted · invited again, new link sent by DM" : closed ? "Deleted · invited again: reopen it so they can take it" : "Deleted · invited again (the DM didn't go through: copy their link)") : "Their paper is deleted"); mesRender(); } }]);
}

// « Give work » (the students' page, a plan d'action): one of the mises en situation, for the students chosen.
// Saved and not launched → its launch window with them already ticked; already live → they're added (link by DM).
async function mesGiveDialog(pre = [], students = []) {
  const items = (await api("/mises")).items.filter((m) => m.status !== "closed");
  const names = new Map(students.map((s) => [s.discord_id, s.name]));
  openDialog("🧪 Give a mise en situation", `
    ${items.length ? `<p class="small muted" style="margin-top:0">For ${pre.length ? pre.map((id) => `<b>${esc(names.get(id) || id)}</b>`).join(", ") : "the students you'll pick"}.</p>
      <div class="mes-give">${items.map((m, i) => `<label class="check mes-give-it"><input type="radio" name="mg" value="${m.id}" ${i ? "" : "checked"}> <span><b>${esc(m.title)}</b> ${mesStatus(m.status)}${m.week ? ` <span class="small muted">· week ${m.week}</span>` : ""}<br>${m.comps.map((c) => compChip(c)).join(" ")} <span class="small muted">${m.takers ? `· ${m.done}/${m.takers} handed in` : ""}</span></span></label>`).join("")}</div>`
      : `<p class="muted">No mise en situation yet.</p>`}
    <p class="small"><a href="#/mises-en-situation" id="mg-new">＋ Create a new one</a> <span class="muted">(upload a JSON, or the AI writes it for a brief or the sprint)</span></p>`,
  items.length ? [{ label: "Give it", primary: true, action: async () => {
    const id = Number($('input[name="mg"]:checked', dlg)?.value);
    const m = items.find((x) => x.id === id);
    if (!m) throw new Error("Choose a mise en situation.");
    if (m.status === "draft" || !pre.length) { dlg.close(); MSIT.pendingLaunch = pre; location.hash = `#/mise/${id}`; return; }
    const r = await api(`/mises/${id}/add`, { method: "POST", body: { students: pre } });
    dlg.close(); toast(`${pre.length} added · ${r.sent} DM sent`); location.hash = `#/mise/${id}`;
  } }] : []);
  $("#mg-new", dlg).onclick = () => { dlg.close(); MSIT.openNew = true; };
}

Object.assign(routes, { "mises-en-situation": viewMises, mise: (id) => viewMise(Number(id)) });
