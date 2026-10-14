/* ClassBot dashboard: the learning part. Programme (planning + competencies), briefs (generator, editor, hand-ins),
   debriefs (code analysis, competencies, mise en situation, comment), web assessments, GitHub activity, and the
   competency record of every student. Loaded after app.js and extras.js (it uses their helpers). */
"use strict";

Object.assign(STATUS, { draft: "Draft", assigned: "Assigned", invited: "Invited", locked: "Stopped", submitted: "Submitted", graded: "Graded", closed: "Closed", final: "Finalized" });
Object.assign(REASON, { brief: "Brief debrief", assessment: "Assessment" });

let learnTimer = null;
window.addEventListener("hashchange", () => { clearInterval(learnTimer); learnTimer = null; });

// ------------------------------------------------------------------ small helpers
const LV_NAMES = ["imiter", "adapter", "transposer"];
/** "C3N2" → { code: "C3", level: 2 } ; "T5" → { code: "T5", level: null } */
const parseC = (s) => { const m = String(s || "").trim().toUpperCase().match(/^(CT|C|T)(\d{1,2})(?:N(\d))?$/); return m ? { code: (m[1] === "C" ? "C" : "T") + m[2], level: m[3] ? Number(m[3]) : null } : null; };
const cLabel = (code) => (String(code).startsWith("T") ? "C" + code : code);
const cText = (s) => { const p = parseC(s); return p ? cLabel(p.code) + (p.level ? ` N${p.level}` : "") : String(s); };
const dots = (n, max = 3) => `<span class="lv-dots" aria-label="level ${n || 0} of ${max}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;
const isoDay = (u) => (u ? new Date(u * 1000).toISOString().slice(0, 10) : "");
const dayLabelOf = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—");
const lines = (v) => String(v || "").split("\n").map((s) => s.trim()).filter(Boolean);
const copyText = (text, what = "Copied") => navigator.clipboard.writeText(text).then(() => toast(what), () => toast("Copy failed: select the text and copy it by hand", true));
const sw = (attrs, on, disabled = false) => `<label class="switch" ${disabled ? 'title="Follows the automatic check"' : ""}><input type="checkbox" ${attrs} ${on ? "checked" : ""} ${disabled ? "disabled" : ""}><span></span></label>`;
const segHtml = (name, options, cur) => `<div class="seg" data-seg="${name}" role="group">${options.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v === cur)}">${esc(l)}</button>`).join("")}</div>`;
function wireSeg(root, name, onChange) {
  const seg = $(`[data-seg="${name}"]`, root);
  if (!seg) return;
  $$("button", seg).forEach((b) => b.onclick = () => { $$("button", seg).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); onChange?.(b.dataset.v); });
}
const segVal = (root, name) => $(`[data-seg="${name}"] [aria-pressed="true"]`, root)?.dataset.v ?? "";
const dueIn = (u) => {
  if (!u) return `<span class="muted">—</span>`;
  const s = u - Date.now() / 1000;
  if (s < 0) return `<span class="small">${fmtDate(u)}</span> <span class="tag">passed</span>`;
  const d = Math.floor(s / 86400);
  return `<span class="small">${fmtDate(u)}</span> <span class="tag ${d < 2 ? "medium" : "lang"}">${d ? `in ${d} day${d > 1 ? "s" : ""}` : `in ${Math.max(1, Math.round(s / 3600))} h`}</span>`;
};
const meter = (pct, label = "") => `<div class="meter" title="${esc(label)}"><i style="width:${Math.max(0, Math.min(100, pct ?? 0))}%;background:${masteryInk(pct)}"></i></div>`;

/* A search box that adds tags: type to filter, Enter or click to add, × or Backspace to remove.
   tagSelect(name, options [{ value, label }], selected, { placeholder, allowNew }) → HTML; wireTags(root) once the HTML is in the page. */
const TAGSETS = new Map();
function tagSelect(name, options, selected = [], o = {}) {
  TAGSETS.set(name, { options, max: o.max ?? 99, allowNew: !!o.allowNew });
  const label = (v) => options.find((x) => x.value === v)?.label ?? v;
  return `<div class="tagsel" data-tags="${esc(name)}">${selected.map((v) => `<span class="tag-chip" data-v="${esc(v)}">${esc(label(v))}<button type="button" aria-label="Remove ${esc(label(v))}">×</button></span>`).join("")}
    <input type="text" class="tag-in" placeholder="${esc(o.placeholder || "Search…")}" autocomplete="off"><div class="tag-menu" hidden></div></div>`;
}
const tagValues = (root, name) => $$(`[data-tags="${name}"] .tag-chip`, root).map((c) => c.dataset.v);
function wireTags(root, onChange = () => {}) {
  $$(".tagsel", root).forEach((box) => {
    if (box.dataset.wired) return;
    box.dataset.wired = "1";
    const cfg = TAGSETS.get(box.dataset.tags) || { options: [] };
    const input = $(".tag-in", box), menu = $(".tag-menu", box);
    let hi = 0;
    const chosen = () => $$(".tag-chip", box).map((c) => c.dataset.v);
    const add = (value, label) => {
      if (!value || chosen().includes(value) || chosen().length >= cfg.max) return;
      input.insertAdjacentHTML("beforebegin", `<span class="tag-chip" data-v="${esc(value)}">${esc(label ?? value)}<button type="button" aria-label="Remove">×</button></span>`);
      input.value = ""; draw(); onChange();
    };
    const matches = () => {
      const q = input.value.trim().toLowerCase();
      const list = cfg.options.filter((x) => !chosen().includes(x.value) && (!q || x.label.toLowerCase().includes(q) || x.value.toLowerCase().includes(q))).slice(0, 40);
      if (cfg.allowNew && q && !cfg.options.some((x) => x.label.toLowerCase() === q)) list.push({ value: input.value.trim(), label: `Add “${input.value.trim()}”`, add: true });
      return list;
    };
    const draw = () => {
      const list = matches();
      hi = Math.min(hi, Math.max(0, list.length - 1));
      menu.hidden = document.activeElement !== input || !list.length;
      menu.innerHTML = list.map((x, i) => `<button type="button" class="tag-opt ${i === hi ? "hi" : ""}" data-i="${i}">${esc(x.label)}</button>`).join("");
      $$(".tag-opt", menu).forEach((b) => b.onmousedown = (e) => { e.preventDefault(); const x = list[Number(b.dataset.i)]; add(x.value, x.add ? x.value : x.label); });
    };
    box.onclick = (e) => {
      const rm = e.target.closest(".tag-chip button");
      if (rm) { rm.closest(".tag-chip").remove(); onChange(); draw(); return; }
      input.focus();
    };
    input.onfocus = draw;
    input.onblur = () => setTimeout(() => (menu.hidden = true), 120);
    input.oninput = () => { hi = 0; draw(); };
    input.onkeydown = (e) => {
      const list = matches();
      if (e.key === "ArrowDown") { e.preventDefault(); hi = Math.min(hi + 1, list.length - 1); draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); hi = Math.max(hi - 1, 0); draw(); }
      else if (e.key === "Enter" || e.key === ",") { e.preventDefault(); const x = list[hi]; if (x) add(x.value, x.add ? x.value : x.label); }
      else if (e.key === "Backspace" && !input.value) { const last = $$(".tag-chip", box).pop(); if (last) { last.remove(); onChange(); draw(); } }
      else if (e.key === "Escape") menu.hidden = true;
    };
  });
}
const TECH_OPTIONS = ["HTML", "CSS", "JavaScript", "TypeScript", "DOM", "Fetch / API", "PHP", "SQL", "MySQL", "PostgreSQL", "Python", "Java", "C", "C++", "Tailwind CSS", "Bootstrap", "Sass",
  "Laravel", "Symfony", "React", "Vue.js", "Node.js", "Express", "MongoDB", "Git", "OOP", "MVC", "Docker"].map((x) => ({ value: x, label: x }));
const skillOptions = () => (S.skillDefs || []).map((sk) => ({ value: sk.key, label: `${sk.emoji} ${sk.en}` }));

let REF = null;   // the competencies of the class's programme
async function loadRef(force = false) {
  if (!REF || force) REF = await api("/competencies");
  return REF;
}
const compName = (code) => REF?.referential.find((c) => c.code === code)?.name ?? "";
const compChip = (s, cls = "") => { const p = parseC(s); return `<span class="tag comp ${cls}" title="${esc(p ? compName(p.code) : "")}">${esc(cText(s))}</span>`; };

// ======================================================================= BRIEFS
async function viewBriefs(tab = "list") {
  const [r, pg] = await Promise.all([api("/briefs"), api("/programs")]);
  const P = pg.current;
  const items = r.items;
  view.innerHTML = `
    <div class="page-head"><div><h1>Briefs</h1>
      <p class="sub">Projects of the class, following <b>${esc(P.name)}</b>${pg.now ? ` · this is week ${pg.now}` : ""}. Every debrief updates the competencies and skills of the student.</p></div>
      <div class="toolbar" style="margin:0"><button class="btn" id="br-import">📄 Import a brief page</button><button class="btn" id="br-blank">Blank brief</button><button class="btn" id="br-quick">+ Quick brief</button><button class="btn primary" id="br-new">✨ New brief</button></div></div>
    ${r.ai ? "" : `<div class="notice warn" style="margin-bottom:16px"><b>No AI is set up.</b> You can still write and import briefs; generating and analyzing need the Groq key or Workers AI.</div>`}
    <div class="tabs" role="tablist">
      <button role="tab" data-t="list">Briefs (${items.length})</button>
      <button role="tab" data-t="follow">Follow-up</button>
      <button role="tab" data-t="plan">Planning</button>
      <button role="tab" data-t="prog">Programme &amp; competencies</button>
    </div>
    <div id="br-tab"></div>`;
  const tabs = {
    list: () => table([
      { label: "Brief", sort: "title", html: (b) => `<b>${esc(b.title)}</b>${b.source && b.source !== "manual" ? ` <span class="tag">${esc(b.source.startsWith("watcher") ? "from Watcher" : b.source === "ai" ? "✨ AI" : b.source)}</span>` : ""}` },
      { label: "Week", sort: "week", num: true, html: (b) => (b.week ? `S${b.week}` : "—") },
      { label: "Status", sort: "status", html: (b) => status(b.status === "assigned" ? "active" : b.status, STATUS[b.status]) },
      { label: "Competencies", html: (b) => (b.competencies || "").split(",").filter(Boolean).map((c) => compChip(c)).join(" ") || `<span class="muted">—</span>` },
      { label: "Due", sort: "due_at", html: (b) => dueIn(b.due_at) },
    ], items, { onRow: (b) => (location.hash = `#/brief/${b.id}`), empty: "No brief yet: generate one from an idea, or import one from Simplonline." }),
    follow: () => `<div id="w-follow"><p class="muted">Loading…</p></div>`,
    plan: () => planningHtml(P, pg),
    prog: () => `<section class="panel"><div class="panel-head"><h2>${esc(P.name)}</h2><a class="btn" href="#/settings/programme">${icon("gear")} Change it in Settings</a></div>
      <p class="muted small">To change the planning or the competencies (another year, another stack), download the Excel template in Settings → Programme, fill it and upload it.</p>
      <div class="ref-list">${P.referential.map((c) => `<div><span class="tag comp ${c.kind}">${esc(cLabel(c.code))}</span> <span class="small">${esc(c.name)}</span></div>`).join("")}</div></section>`,
  };
  const show = (k) => {
    $$("[data-t]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.t === k)));
    $("#br-tab").innerHTML = tabs[k]();
    if (k === "plan") $$("[data-genweek]").forEach((b) => b.onclick = () => briefGenerator(P, Number(b.dataset.genweek), pg.now, pg));
    if (k === "follow") wFollow($("#w-follow")).catch((e) => toast(e.message, true));
  };
  $$("[data-t]").forEach((b) => b.onclick = () => show(b.dataset.t));
  show(tab);
  $("#br-new").onclick = () => briefGenerator(P, null, pg.now, pg);
  $("#br-import").onclick = () => briefGenerator(P, null, pg.now, { ...pg, mode: "import" });
  $("#br-quick").onclick = () => quickBrief();
  $("#br-blank").onclick = (e) => busy(e.currentTarget, async () => { const b = await api("/briefs", { method: "POST", body: { title: "Nouveau brief" } }); location.hash = `#/brief/${b.brief.id}`; });
}

function planningHtml(P, pg) {
  if (!P.weeks.length) return `<p class="empty">This programme has no planning. Add weeks to it in “Programme &amp; competencies”.</p>`;
  // consecutive weeks of the same sprint form one block, in the order of the year
  const groups = [];
  for (const w of [...P.weeks].sort((a, b) => a.start.localeCompare(b.start) || a.n - b.n)) {
    const last = groups[groups.length - 1];
    if (last && last[0] === (w.sprint ?? 0)) last[1].push(w); else groups.push([w.sprint ?? 0, [w]]);
  }
  const KINDW = { brief: "Brief", break: "Break", crossdefense: "Cross defense", certification: "Certification", other: "Other" };
  return groups.map(([n, weeks]) => {
    const sp = P.sprints.find((s) => s.n === n);
    return `<section class="panel sprint">
      <div class="panel-head"><h2>${sp ? `Sprint ${sp.n} · ${esc(sp.title)}` : "Breaks, defenses and certification"}</h2>
        ${sp ? `<span class="small">${[...sp.tech, ...sp.soft].map((c) => compChip(c)).join(" ")}</span>` : ""}</div>
      ${sp?.objectives ? `<details class="small muted"><summary>Objectives of the sprint</summary><p style="white-space:pre-wrap">${esc(sp.objectives)}</p></details>` : ""}
      <div class="weeks">${weeks.map((w) => {
        const linked = pg.briefs.filter((b) => b.week === w.n);
        return `<div class="week ${w.n === pg.now ? "now" : ""} ${w.kind}">
          <div class="wk-n"><b>S${w.n}</b><span class="small muted">${dayLabelOf(w.start)} → ${dayLabelOf(w.end)}</span></div>
          <div class="wk-body">
            <div><span class="tag">${esc(KINDW[w.kind] || w.kind)}</span>${w.days ? ` <span class="small muted">${w.days} days · ${esc(w.mode)}</span>` : ""} ${w.n === pg.now ? `<span class="tag lang">this week</span>` : ""}</div>
            ${w.title ? `<b>${esc(w.title)}</b>` : ""}
            ${w.objective ? `<p class="small muted wk-obj">${esc(w.objective)}</p>` : ""}
            <div class="small">${[...w.competencies, ...w.soft].map((c) => compChip(c)).join(" ")}</div>
            ${linked.length ? `<div class="small">📄 ${linked.map((b) => `<a href="#/brief/${b.id}">${esc(b.title)}</a> ${status(b.status === "assigned" ? "active" : b.status, STATUS[b.status])}`).join(" · ")}</div>` : ""}
          </div>
          ${w.kind === "brief" ? `<button class="btn small" data-genweek="${w.n}">✨ Brief</button>` : ""}
        </div>`;
      }).join("")}</div></section>`;
  }).join("");
}

/** The week picker used by the generator and the import. */
function weekOptions(P, sel) {
  return `<option value="">No week (free brief)</option>` + P.weeks.filter((w) => w.kind === "brief").map((w) =>
    `<option value="${w.n}" ${w.n === sel ? "selected" : ""}>S${w.n} · ${esc((w.title || w.objective || "").slice(0, 70))} (${dayLabelOf(w.start)})</option>`).join("");
}
function weekInfo(P, n) {
  const w = P.weeks.find((x) => x.n === Number(n));
  if (!w) return `<p class="muted small">A free brief: the AI follows your idea and the competencies you'll pick.</p>`;
  return `<div class="wk-info small"><b>S${w.n} · ${esc(w.title)}</b> · ${w.days || 5} days, ${esc(w.mode)} · ${dayLabelOf(w.start)} → ${dayLabelOf(w.end)}
    ${w.objective ? `<div class="muted">${esc(w.objective)}</div>` : ""}
    ${w.concepts ? `<details><summary>Concepts of the week</summary><div style="white-space:pre-wrap">${esc(w.concepts)}</div></details>` : ""}
    <div>${[...w.competencies, ...w.soft].map((c) => compChip(c)).join(" ")}</div></div>`;
}

function briefGenerator(P, week, nowWeek, pg = {}) {
  const pick = week ?? nowWeek ?? null;
  openDialog(pg.mode === "import" ? "📄 Import a brief" : "✨ New brief", `
    <label for="gb-week">Week of the planning</label><select id="gb-week">${weekOptions(P, pick)}</select>
    <div id="gb-winfo"></div>
    <label>Technologies</label>
    <div class="chips" id="gb-tech"></div>
    <div class="toolbar" style="margin:6px 0 0"><input type="text" id="gb-tech-add" placeholder="Add a technology" style="flex:1;max-width:320px"><button class="btn small" type="button" id="gb-tech-addb">Add</button></div>
    <label>Start from</label>
    ${segHtml("gbm", [["idea", "My idea"], ["brain", "Brainstorm ideas"], ["client", "A real client"], ["similar", "🧬 Similar to a brief"], ["import", "📄 Import a page"]], pg.mode || "idea")}
    <div data-p="idea"><label for="gb-idea">Your idea <span class="muted">(optional)</span></label>
      <textarea id="gb-idea" placeholder="e.g. A booking site for a hammam in Safi, with a services page and a contact form"></textarea></div>
    <div data-p="brain" hidden><label for="gb-theme">Theme or sector <span class="muted">(optional)</span></label>
      <div class="toolbar" style="margin:0"><input type="text" id="gb-theme" placeholder="e.g. tourism in Morocco, sport, a cause" style="flex:1"><button class="btn" id="gb-brain" type="button">Find 5 ideas</button></div>
      <div id="gb-ideas" class="ideas"></div></div>
    <div data-p="client" hidden><label for="gb-client">Client meeting notes</label>
      <textarea id="gb-client" style="min-height:150px" placeholder="Who they are, what they need, pages, constraints, deadline…"></textarea></div>
    <div data-p="similar" hidden>
      <label>Reference brief</label>
      ${segHtml("smsrc", [["file", "A page (.html)"], ["ours", "One of our briefs"], ["text", "Paste its text"]], "file")}
      <div data-sp="file" style="margin-top:8px"><label class="drop" id="sm-drop"><input type="file" id="sm-file" accept=".html,.htm,text/html" hidden><span>📄 <b>Choose the brief page (.html)</b> or drop it here</span></label></div>
      <div data-sp="ours" hidden style="margin-top:8px"><select id="sm-brief"><option value="">Loading the briefs…</option></select></div>
      <div data-sp="text" hidden style="margin-top:8px"><textarea id="sm-text" style="min-height:140px" placeholder="Paste the reference brief here"></textarea><button class="btn small" type="button" id="sm-read" style="margin-top:6px">Use this text</button></div>
      <div id="sm-pre"></div>
      <label style="margin-top:12px">How similar</label>
      ${segHtml("smhow", [["close", "Same project, another client"], ["twist", "Same skills, another subject"], ["loose", "Just the level and format"]], "close")}
      <p class="muted small" id="sm-howtxt" style="margin:6px 0 0" hidden></p>
      <label for="sm-idea">New subject or client <span class="muted">(optional)</span></label>
      <input type="text" id="sm-idea" style="width:100%" placeholder="e.g. A climbing gym in Marrakech instead of the fitness club"></div>
    <div data-p="import" hidden>
      <p class="muted small" style="margin:8px 0">On Simplonline, click <b>“Afficher la totalité des compétences”</b> before saving the page.</p>
      <label class="drop" id="gb-drop"><input type="file" id="gb-file" accept=".html,.htm,text/html" hidden><span>📄 <b>Choose the brief page (.html)</b> or drop it here</span></label>
      <details class="small" style="margin-top:8px"><summary>…or paste its text</summary><textarea id="gb-itext" style="min-height:140px;margin-top:6px" placeholder="Paste the brief here"></textarea>
        <button class="btn small" type="button" id="gb-iread" style="margin-top:6px">Read the text</button></details>
      <div id="gb-ipre"></div></div>
    <div class="field-row">
      <div><label for="gb-days">Days</label><input type="number" id="gb-days" min="1" max="30"></div>
      <div><label for="gb-mode">Work</label><select id="gb-mode"><option value="individuel">Alone</option><option value="binôme">In pairs</option><option value="squad">In squads</option></select></div>
      <div><label for="gb-start">Start</label><input type="date" id="gb-start"></div>
      <div><label for="gb-due">Due</label><input type="date" id="gb-due"></div>
    </div>
    <label for="gb-wish">Anything else <span class="muted">(optional)</span></label>
    <input type="text" id="gb-wish" style="width:100%" placeholder="e.g. Tailwind mandatory, add a mise en situation, no JavaScript">
    <p class="small" id="gb-st"></p>`,
    [{ label: "Generate the brief", primary: true, action: async () => {
      const mode = segVal(dlg, "gbm");
      if (mode === "import") {
        if (!imp) throw new Error("Choose the brief page (or paste its text) first.");
        const r = await api("/briefs/import", { method: "POST", body: { ...imp.src, week: $("#gb-week").value || null, tech: techPicked(), days: $("#gb-days").value, mode: $("#gb-mode").value, start: $("#gb-start").value, due: $("#gb-due").value } });
        dlg.close(); toast(`Brief imported${imp.src.comps.length ? ` with ${imp.src.comps.length} competencies` : ""}: read it and adjust`); location.hash = `#/brief/${r.brief.id}`;
        return;
      }
      $("#gb-st").textContent = mode === "similar" ? "⏳ Writing a new brief like the reference (up to a minute)…" : "⏳ Writing the brief (up to a minute)…";
      try {
        if (mode === "similar" && !sim) throw new Error("Choose the reference brief first.");
        const r = await api("/briefs/generate", { method: "POST", body: {
          similar: mode === "similar" ? { ...sim, how: segVal(dlg, "smhow") } : undefined,
          week: $("#gb-week").value || null, idea: mode === "similar" ? $("#sm-idea").value : mode === "client" ? "" : $("#gb-idea").value, client: mode === "client" ? $("#gb-client").value : "",
          wishes: $("#gb-wish").value, tech: techPicked(), days: $("#gb-days").value, mode: $("#gb-mode").value, start: $("#gb-start").value, due: $("#gb-due").value } });
        dlg.close(); toast("Brief written: read it and adjust"); location.hash = `#/brief/${r.brief.id}`;
      } catch (e) { $("#gb-st").textContent = ""; throw e; }
    } }]);
  dlg.classList.add("wide");
  const fill = () => {
    const w = P.weeks.find((x) => x.n === Number($("#gb-week").value));
    $("#gb-winfo").innerHTML = weekInfo(P, $("#gb-week").value);
    $("#gb-days").value = w?.days || 5;
    $("#gb-mode").value = /squad|groupe/i.test(w?.mode || "") ? "squad" : /bin/i.test(w?.mode || "") ? "binôme" : "individuel";
    $("#gb-start").value = w?.start || ""; $("#gb-due").value = w?.end || "";
    drawTech(pg.weekTech?.[w?.n] ?? []);
  };
  const techs = [...(pg.techs || []).map((t) => t.name)];
  const tools = new Set((pg.techs || []).filter((t) => t.tool).map((t) => t.name));
  const drawTech = (on) => {
    const extra = on.filter((x) => !techs.includes(x));
    $("#gb-tech").innerHTML = [...techs, ...extra].map((t) => `<button type="button" class="chip ${tools.has(t) ? "tool" : ""}" data-tech="${esc(t)}" aria-pressed="${String(on.includes(t))}">${esc(t)}</button>`).join("");
    $$("[data-tech]", dlg).forEach((b) => b.onclick = () => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")));
  };
  const techPicked = () => $$("[data-tech][aria-pressed=true]", dlg).map((b) => b.dataset.tech);
  $("#gb-tech-addb").onclick = () => { const v = $("#gb-tech-add").value.trim(); if (!v) return; if (!techs.includes(v)) techs.push(v); drawTech([...techPicked(), v]); $("#gb-tech-add").value = ""; };
  $("#gb-week").onchange = fill; fill();
  const primary = $(".dlg-foot .btn.primary", dlg);
  const showMode = (v) => { $$("[data-p]", dlg).forEach((p) => (p.hidden = p.dataset.p !== v)); primary.textContent = v === "import" ? "Import the brief" : v === "similar" ? "Generate a similar brief" : "Generate the brief"; [$("#gb-wish"), $('label[for="gb-wish"]', dlg)].forEach((e) => e && (e.hidden = v === "import")); };
  wireSeg(dlg, "gbm", showMode);
  showMode(segVal(dlg, "gbm"));
  // ---- import an existing brief page
  let imp = null;
  const readSrc = async (src) => {
    const box = $("#gb-ipre");
    box.innerHTML = `<p class="muted small">⏳ Reading the brief…</p>`;
    try {
      const r = await api("/briefs/import", { method: "POST", body: { ...src, preview: true } });
      imp = { src, data: r.data };
      const d = r.data;
      const stories = (d.groups || []).reduce((n, g) => n + (g.stories || []).length, 0);
      if (r.detected?.length) drawTech([...new Set([...r.detected])]);
      box.innerHTML = `<div class="imp-card">
        <div class="imp-head"><b>${esc(d.title || "Untitled brief")}</b>${d.modalities?.days ? ` <span class="tag">${d.modalities.days} days</span>` : ""}</div>
        ${d.summary ? `<p class="small" style="margin:4px 0 8px">${esc(d.summary.slice(0, 320))}${d.summary.length > 320 ? "…" : ""}</p>` : ""}
        <div class="imp-figs small">
          <span><b>${d.context ? Math.round(d.context.length / 100) / 10 + "k" : "—"}</b> context</span><span><b>${stories}</b> user stories</span><span><b>${(d.bonus || []).length}</b> bonus</span>
          <span><b>${(d.deliverables || []).length}</b> deliverables</span><span><b>${(d.criteria || []).length}</b> criteria</span><span><b>${(d.evaluation?.parts || []).length}</b> evaluation steps</span></div>
        <div class="small" style="margin-top:8px">Competencies: ${(d.competencies || []).map((c) => compChip(c)).join(" ") || `<span class="muted">none found</span>`}</div>
        ${r.hidden ? `<p class="small" style="color:var(--warn);margin:6px 0 0">⚠️ The page says ${r.hidden + d.competencies.length} competencies but only ${d.competencies.length} are in the file: on Simplonline click “Afficher la totalité des compétences”, save again, or add them after import.</p>` : ""}
        </div>`;
    } catch (e) { imp = null; box.innerHTML = `<p class="small" style="color:var(--down)">${esc(e.message)}</p>`; }
  };
  const readFile = async (f) => {
    if (!f) return;
    if (!/\.html?$/i.test(f.name) && f.type !== "text/html") { $("#gb-ipre").innerHTML = `<p class="small" style="color:var(--down)">Choose the page saved as .html.</p>`; return; }
    await loadRef();
    $("#gb-drop span").innerHTML = `📄 <b>${esc(f.name)}</b> · choose another`;
    await readSrc(simplonParse(await f.text(), REF.referential));
  };
  $("#gb-file").onchange = () => readFile($("#gb-file").files[0]);
  const drop = $("#gb-drop");
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); readFile(e.dataTransfer.files[0]); };
  $("#gb-iread").onclick = () => { const t = $("#gb-itext").value.trim(); if (t) readSrc({ text: t, title: "", comps: [] }); };
  // ---- similar to a brief
  let sim = null;
  const HOW = { close: "Same kind of application, same number of pages and equivalent features, same difficulty and evaluation; a new client, sector and content.",
    twist: "Same difficulty, size and concepts to practise (same competencies), but a different kind of project in another field.",
    loose: "Only the level, the size and the shape of the brief; the subject and the features are new." };
  wireSeg(dlg, "smhow", (v) => ($("#sm-howtxt").textContent = HOW[v]));
  $("#sm-howtxt").textContent = HOW.close;
  wireSeg(dlg, "smsrc", (v) => { $$("[data-sp]", dlg).forEach((p) => (p.hidden = p.dataset.sp !== v)); if (v === "ours") loadOurs(); });
  const simShow = (title, comps, tags, extra = "") => {
    $("#sm-pre").innerHTML = `<div class="imp-card"><div class="imp-head">🧬 <b>${esc(title || "Reference brief")}</b></div>
      <div class="small" style="margin-top:6px">Competencies: ${comps.map((c) => compChip(c)).join(" ") || `<span class="muted">none found</span>`}${$("#gb-week").value ? ` <span class="muted">(the week's are used)</span>` : ""}</div>
      ${extra}</div>`;
    if (tags.length) drawTech(tags);
  };
  const simFromText = async (src) => {
    $("#sm-pre").innerHTML = `<p class="muted small">⏳ Reading the brief…</p>`;
    try {
      const r = await api("/briefs/import", { method: "POST", body: { ...src, preview: true } });
      sim = { text: src.text, title: r.data.title || src.title, comps: r.data.competencies };
      simShow(sim.title, sim.comps, r.detected || []);
    } catch (e) { sim = null; $("#sm-pre").innerHTML = `<p class="small" style="color:var(--down)">${esc(e.message)}</p>`; }
  };
  const simFile = async (f) => {
    if (!f) return;
    await loadRef();
    $("#sm-drop span").innerHTML = `📄 <b>${esc(f.name)}</b> · choose another`;
    await simFromText(simplonParse(await f.text(), REF.referential));
  };
  $("#sm-file").onchange = () => simFile($("#sm-file").files[0]);
  const sdrop = $("#sm-drop");
  sdrop.ondragover = (e) => { e.preventDefault(); sdrop.classList.add("over"); };
  sdrop.ondragleave = () => sdrop.classList.remove("over");
  sdrop.ondrop = (e) => { e.preventDefault(); sdrop.classList.remove("over"); simFile(e.dataTransfer.files[0]); };
  $("#sm-read").onclick = () => { const t = $("#sm-text").value.trim(); if (t) simFromText({ text: t, title: "", comps: [] }); };
  let ours = null;
  const loadOurs = async () => {
    if (ours) return;
    ours = (await api("/briefs")).items;
    $("#sm-brief").innerHTML = `<option value="">Pick a brief…</option>` + ours.map((b) => `<option value="${b.id}">${esc(b.title)}${b.week ? ` · S${b.week}` : ""} (${STATUS[b.status] || b.status})</option>`).join("");
  };
  $("#sm-brief").onchange = async () => {
    const id = $("#sm-brief").value;
    if (!id) { sim = null; $("#sm-pre").innerHTML = ""; return; }
    const B = await api(`/briefs/${id}`);
    sim = { brief: Number(id) };
    simShow(B.brief.data.title, B.brief.data.competencies || [], B.brief.data.tags || []);
  };
  $("#gb-brain").onclick = (e) => busy(e.currentTarget, async () => {
    $("#gb-ideas").innerHTML = `<p class="muted small">⏳ Thinking of ideas for this week…</p>`;
    const r = await api("/briefs/brainstorm", { method: "POST", body: { week: $("#gb-week").value || null, theme: $("#gb-theme").value, tech: techPicked() } }).catch((err) => { $("#gb-ideas").innerHTML = ""; throw err; });
    $("#gb-ideas").innerHTML = r.ideas.map((x, i) => `<button type="button" class="idea" data-i="${i}"><b>${esc(x.title)}</b> <span class="tag">${esc(x.difficulty)}</span>
      <span class="small muted">${esc(x.client)}</span><span class="small">${esc(x.pitch)}</span><span class="small muted">💡 ${esc(x.why)}</span></button>`).join("") || `<p class="muted small">No idea came back: try again.</p>`;
    $$(".idea", dlg).forEach((b) => b.onclick = () => {
      const x = r.ideas[Number(b.dataset.i)];
      $$(".idea", dlg).forEach((y) => y.classList.toggle("on", y === b));
      $("#gb-idea").value = `${x.title} — ${x.client} : ${x.pitch}`;
    });
  });
}

/** Simplonline brief page saved as .html → its text and the competencies with their level. */
function simplonParse(html, ref) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, svg, noscript, button, img").forEach((e) => e.remove());
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const comps = [];
  doc.querySelectorAll("ol").forEach((ol) => {
    const tags = [...ol.querySelectorAll('[title^="niveau"]')];
    if (!tags.length) return;
    const label = (ol.previousElementSibling?.textContent || "").trim();
    const m = label.match(/^(CT|C)\s*(\d{1,2})\s*[.:-]?\s*(.*)$/i);
    const name = norm(m ? m[3] : label);
    // Simplonline writes the transversal ones as "C1." too: the name tells which one it is
    const hit = ref.find((c) => norm(c.name) === name) || ref.find((c) => name.length > 12 && (norm(c.name).startsWith(name.slice(0, 40)) || name.startsWith(norm(c.name).slice(0, 40))));
    const code = hit ? hit.code : m ? (m[1].toUpperCase() === "CT" ? "T" : "C") + m[2] : null;
    const lvl = tags.filter((t) => /success/.test(t.className)).length;
    if (code && !comps.some((c) => c.startsWith(code + "N") || c === code)) comps.push(code + (lvl ? "N" + lvl : ""));
  });
  doc.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, br, tr, section, article, ul, ol, header, footer, pre, blockquote").forEach((e) => e.insertAdjacentText("afterend", "\n"));
  const title = [...doc.querySelectorAll("h1")].map((h) => h.textContent.trim()).filter((t) => t && !/^brief$/i.test(t)).pop() || "";
  const raw = (doc.body?.textContent || "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  // a sentence the page wrapped onto two lines (the next one starts in lower case) is put back together
  const out = [];
  for (const l of raw) {
    const prev = out[out.length - 1];
    if (prev && /^[a-zà-ÿ]/.test(l) && !/[.:;!?)»”]$/.test(prev) && !/^(\|__|[-•*])/.test(l) && prev.length > 40) out[out.length - 1] = prev + " " + l;
    else out.push(l);
  }
  const text = out.join("\n");
  return { text, title, comps };
}

// ---------------------------------------------------------------- one brief
const SEC_LABEL = { title: "Title", summary: "Short description", tags: "Technologies (the brief uses only these)", context: "Context", groups: "User stories", bonus: "Bonus", modalities: "Pedagogical modalities",
  evaluation: "Evaluation", deliverables: "Deliverables", criteria: "Performance criteria", situation: "Professional situation", competencies: "Targeted competencies", resources: "Resources" };
const COPY_FIELD = { groups: "context", bonus: "context" };
let BR = null;   // the brief being edited

async function viewBrief(id) {
  const [B] = await Promise.all([api(`/briefs/${id}`), loadRef()]);
  BR = { B, dirty: false, tab: BR?.B?.brief.id === B.brief.id ? BR.tab : "brief" };
  renderBrief();
}

function renderBrief() {
  const { B } = BR, b = B.brief, d = b.data;
  const handed = B.kind === "squad" ? B.squadRows.filter((s) => s.handin).length : B.students.filter((s) => s.handin).length;
  const total = B.kind === "squad" ? B.squadRows.length : B.students.length;
  const finals = (B.kind === "squad" ? B.squadRows : B.students).filter((s) => s.review?.status === "final").length;
  view.innerHTML = `
    <div class="page-head"><div>
      <p class="crumb"><a href="#/briefs">Briefs</a></p>
      <h1>${esc(d.title || "Untitled brief")}</h1>
      <p class="sub">${status(b.status === "assigned" ? "active" : b.status, STATUS[b.status])} · ${B.week ? `week S${B.week.n}` : "free brief"} · ${B.kind === "squad" ? `${B.squads.length} squad(s)` : "individual"}
        ${b.due_at ? ` · due ${fmtDateTime(b.due_at)}` : ""} · ${d.competencies.map((c) => compChip(c)).join(" ")}</p></div>
      <div class="toolbar" style="margin:0">
        <button class="btn" id="bb-copy">Copy for Simplonline</button>
        ${b.status === "assigned" ? `<button class="btn ${debriefQueue().length ? "primary" : ""}" id="bb-anall" title="Analyze every hand-in not analyzed yet">🔍 Analyze all${debriefQueue().length ? ` (${debriefQueue().length})` : ""}</button><button class="btn" id="bb-assign">${B.kind === "squad" ? "Dates, squads &amp; announce" : "Dates &amp; announce"}</button><button class="btn" id="bb-archive">Archive</button>` : `<button class="btn primary" id="bb-assign">Assign to the class</button>`}
        <button class="btn danger" id="bb-del">Delete</button></div></div>
    ${b.status === "assigned" ? `<div class="figures cs-figs">
      <div class="figure"><span class="ico">📥</span><div><b>${handed}/${total}</b><span>handed in</span></div></div>
      <div class="figure"><span class="ico">🐙</span><div><b>${B.students.filter((s) => s.push).length}/${B.students.length}</b><span>pushed code since the start</span></div></div>
      <div class="figure"><span class="ico">✅</span><div><b>${finals}/${total}</b><span>debriefs finalized${(B.kind === "squad" ? B.squadRows : B.students).filter((s) => s.review && s.review.status !== "final").length ? ` · ${(B.kind === "squad" ? B.squadRows : B.students).filter((s) => s.review && s.review.status !== "final").length} analyzed` : ""}</span></div></div>
      <div class="figure"><span class="ico">⏳</span><div><b>${b.due_at ? (b.due_at > Date.now() / 1000 ? Math.ceil((b.due_at - Date.now() / 1000) / 86400) + " d" : "passed") : "—"}</b><span>until the deadline</span></div></div>
    </div>` : ""}
    <div class="tabs" role="tablist">
      <button role="tab" data-bt="brief">Brief</button>
      <button role="tab" data-bt="students">${B.kind === "squad" ? "Squads" : "Students"} &amp; debriefs</button>
      <button role="tab" data-bt="grid">Evaluation grid</button>
      <button role="tab" data-bt="po">PO notes</button>
    </div>
    <div id="bb-tab"></div>`;
  const tabs = { brief: briefEditorTab, students: briefStudentsTab, grid: briefGridTab, team: briefTeamTab, po: briefPoTab };
  const show = (k) => {
    if (BR.dirty && k !== BR.tab && !confirm("Leave without saving your changes?")) return;
    if (k !== BR.tab) BR.dirty = false;
    BR.tab = k;
    $$("[data-bt]").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.bt === k)));
    tabs[k]($("#bb-tab"));
  };
  $$("[data-bt]").forEach((x) => x.onclick = () => show(x.dataset.bt));
  show(BR.tab);
  $("#bb-copy").onclick = () => copyText(B.text, "The whole brief is copied");
  $("#bb-assign").onclick = () => assignBriefDialog();
  if ($("#bb-anall")) $("#bb-anall").onclick = () => { if (BR.tab !== "students") show("students"); if (BR.tab === "students") analyzeAllDialog($("#bb-tab")); };
  if ($("#bb-archive")) $("#bb-archive").onclick = () => confirmDialog("Archive this brief?", "It leaves /brief for the students. Debriefs and results stay.", "Archive", async () => { BR.B = await api(`/briefs/${b.id}`, { method: "PUT", body: { status: "archived" } }); renderBrief(); });
  $("#bb-del").onclick = () => confirmDialog("Delete this brief?", "Hand-ins and debriefs not finalized are deleted too. Competencies already recorded stay on the students' records.", "Delete", async () => { await api(`/briefs/${b.id}`, { method: "DELETE" }); location.hash = "#/briefs"; }, true);
}

async function saveBrief(extra = {}) {
  const root = $("#bb-tab");
  const body = { data: BR.tab === "brief" ? readBriefEditor(root, BR.B.brief.data) : BR.B.brief.data, internal: BR.tab === "po" ? readPo(root, BR.B.brief.internal) : BR.B.brief.internal, ...extra };
  BR.B = await api(`/briefs/${BR.B.brief.id}`, { method: "PUT", body });
  BR.dirty = false;
  toast("Brief saved");
  renderBrief();
}
const saveBarHtml = (id = "bb-save") => `<div class="save-bar" id="${id}-bar"><span class="small muted" id="${id}-st">All changes saved</span><button class="btn primary small" id="${id}">Save</button></div>`;
function wireDirty(root, id = "bb-save") {
  const mark = () => { BR.dirty = true; $(`#${id}-bar`).classList.add("dirty"); $(`#${id}-st`).textContent = "Unsaved changes"; };
  root.addEventListener("input", mark);
  root.addEventListener("change", mark);
  $(`#${id}`).onclick = (e) => busy(e.currentTarget, () => saveBrief());
  return mark;
}

// how the students work on a brief: alone, in pairs, in squads (the brief's "Work" field)
const WORK_MODES = [["individuel", "Individuel (each student alone)"], ["binôme", "Binôme (pairs)"], ["groupe", "Groupe (squads)"]];
const workMode = (m) => (/bin|pair/i.test(String(m || "")) ? "binôme" : /group|squad|[ée]quipe|team/i.test(String(m || "")) ? "groupe" : "individuel");

function briefEditorTab(root) {
  const { B } = BR, d = B.brief.data;
  const card = (sec, body) => `<section class="bf" data-sec="${sec}"><header><b>${esc(SEC_LABEL[sec])}</b><span class="bf-act">
      <button class="btn small" data-rw="${sec}" title="Rewrite this part with the AI">✨ Rewrite</button><button class="btn small" data-cp="${sec}" title="Copy this field for Simplonline">Copy</button></span></header>${body}</section>`;
  const ta = (f, v, k = "", h = 90) => `<textarea data-f="${f}" ${k ? `data-k="${k}"` : ""} style="min-height:${h}px">${esc(v)}</textarea>`;
  const comps = B.referential.map((c) => {
    const have = d.competencies.map(parseC).find((x) => x?.code === c.code);
    return `<div class="bc ${have ? "on" : ""}" data-comp="${c.code}"><label class="check"><input type="checkbox" ${have ? "checked" : ""}> <b>${esc(c.label)}</b> <span class="small">${esc(c.name)}</span></label>
      <select aria-label="Level">${B.levels.map((l, i) => `<option value="${i + 1}" ${(have?.level ?? 1) === i + 1 ? "selected" : ""}>N${i + 1} · ${esc(l)}</option>`).join("")}</select></div>`;
  }).join("");
  root.innerHTML = `<div class="brief-grid">
    <div class="bf-list">
      ${card("title", `<input type="text" data-f="title" value="${esc(d.title)}" style="width:100%">`)}
      ${card("summary", ta("summary", d.summary, "", 60))}
      ${card("tags", `<input type="text" data-f="tags" data-k="csv" value="${esc(d.tags.join(", "))}" style="width:100%" placeholder="HTML, CSS, Tailwind, Figma">`)}
      ${card("context", ta("context", d.context, "", 420))}
      ${card("groups", `<div id="bf-groups">${d.groups.map((g, i) => groupHtml(g, i)).join("")}</div><button class="btn small" id="bf-addg" type="button">+ Add a group of stories</button>
        <p class="muted small">One story per line: « En tant que …, je vais …, afin de … ».</p>`)}
      ${card("bonus", ta("bonus", d.bonus.join("\n"), "lines", 70))}
      ${card("modalities", `<div class="field-row">
          <div><label>Days</label><input type="number" min="1" max="30" data-f="modalities.days" data-k="num" value="${d.modalities.days}"></div>
          <div><label>Work</label><select data-f="modalities.mode">${WORK_MODES.map(([v, l]) => `<option value="${v}" ${workMode(d.modalities.mode) === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div><label>Start</label><input type="date" data-f="modalities.start" value="${esc(d.modalities.start)}"></div>
          <div><label>Due</label><input type="date" data-f="modalities.due" value="${esc(d.modalities.due)}"></div></div>
        <label>Your own wording <span class="muted">(optional: else it's written from the fields above)</span></label>${ta("modalities.text", d.modalities.text, "", 60)}`)}
      ${card("evaluation", `<div class="field-row"><div><label>Presentation (minutes)</label><input type="number" min="0" max="240" data-f="evaluation.minutes" data-k="num" value="${d.evaluation.minutes}"></div></div>
        <label>Parts <span class="muted">(one per line: “10 | Démonstration”)</span></label>${ta("evaluation.parts", d.evaluation.parts.map((p) => `${p.minutes} | ${p.label}`).join("\n"), "parts", 80)}`)}
      ${card("deliverables", ta("deliverables", d.deliverables.join("\n"), "lines", 70))}
      ${card("criteria", ta("criteria", d.criteria.join("\n"), "lines", 110))}
      ${card("situation", `<input type="text" data-f="situation.title" value="${esc(d.situation.title)}" style="width:100%" placeholder="Title of the professional situation">${ta("situation.need", d.situation.need, "", 70)}`)}
      ${card("competencies", `<div class="bc-list">${comps}</div>`)}
      ${card("resources", ta("resources", d.resources.join("\n"), "lines", 70))}
      ${saveBarHtml()}
    </div>
    <aside class="bf-side">
      <section class="panel"><h2>Checks</h2>
        <ul class="bchecks">${B.checks.map((c) => `<li class="${c.ok ? "ok" : "ko"}">${c.ok ? "✓" : "✗"} ${esc(c.text)}</li>`).join("")}</ul>
        <p class="muted small">Updated when you save.</p></section>
      ${B.week ? `<section class="panel"><h2>Week S${B.week.n}</h2>${weekInfo({ weeks: [B.week] }, B.week.n)}</section>` : ""}
      <section class="panel"><h2>On Simplonline</h2><p class="muted small">Create the brief there, then fill each field with its <b>Copy</b> button (or copy all of it at the top). The competencies and their levels are in “Targeted competencies”.</p></section>
    </aside></div>`;
  const mark = wireDirty(root);
  $("#bf-addg").onclick = () => { $("#bf-groups").insertAdjacentHTML("beforeend", groupHtml({ emoji: "👤", title: "", stories: [] }, $$("[data-g]", root).length)); wireGroups(root, mark); mark(); };
  wireGroups(root, mark);
  $$("[data-comp] input", root).forEach((c) => c.onchange = () => c.closest(".bc").classList.toggle("on", c.checked));
  $$("[data-cp]", root).forEach((x) => x.onclick = () => busy(x, async () => {
    if (BR.dirty) await saveBrief();
    const f = BR.B.fields[COPY_FIELD[x.dataset.cp] || x.dataset.cp] ?? "";
    copyText(f, `${SEC_LABEL[x.dataset.cp]} copied`);
  }));
  $$("[data-rw]", root).forEach((x) => x.onclick = () => rewriteDialog(x.dataset.rw));
}
const groupHtml = (g, i) => `<div class="bg" data-g="${i}"><div class="bg-head"><input type="text" data-ge value="${esc(g.emoji)}" aria-label="Emoji" style="width:56px">
  <input type="text" data-gt value="${esc(g.title)}" placeholder="Role (e.g. Visiteur, Administrateur)" style="flex:1"><button class="btn small danger" data-gdel type="button">Remove</button></div>
  <textarea data-gs style="min-height:90px">${esc(g.stories.join("\n"))}</textarea></div>`;
function wireGroups(root, mark) {
  $$("[data-gdel]", root).forEach((x) => x.onclick = () => { x.closest("[data-g]").remove(); mark(); });
}
function setPath(o, path, v) { const k = path.split("."); let x = o; for (const p of k.slice(0, -1)) x = x[p] = x[p] ?? {}; x[k[k.length - 1]] = v; }
function readBriefEditor(root, base) {
  const d = JSON.parse(JSON.stringify(base));
  $$("[data-f]", root).forEach((el) => {
    let v = el.value;
    const k = el.dataset.k;
    if (k === "lines") v = lines(v);
    else if (k === "csv") v = v.split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "num") v = Number(v) || 0;
    else if (k === "parts") v = lines(v).map((l) => { const m = l.match(/^\s*(\d+)\s*(?:min(?:utes)?)?\s*[|:–-]\s*(.+)$/i); return m ? { minutes: Number(m[1]), label: m[2].trim() } : null; }).filter(Boolean);
    setPath(d, el.dataset.f, v);
  });
  d.groups = $$("[data-g]", root).map((g) => ({ emoji: $("[data-ge]", g).value.trim(), title: $("[data-gt]", g).value.trim(), stories: lines($("[data-gs]", g).value) })).filter((g) => g.title || g.stories.length);
  d.competencies = $$("[data-comp]", root).filter((c) => $("input", c).checked).map((c) => `${c.dataset.comp}N${$("select", c).value}`);
  return d;
}
function rewriteDialog(sec) {
  openDialog(`✨ Rewrite · ${SEC_LABEL[sec]}`, `
    <label for="rw-i">What should change? <span class="muted">(optional)</span></label>
    <input type="text" id="rw-i" style="width:100%" placeholder="e.g. simpler words, add a story about the admin, more measurable criteria">
    <p class="muted small">Only this part changes. Your unsaved edits are kept.</p><p class="small" id="rw-st"></p>`,
    [{ label: "Rewrite", primary: true, action: async () => {
      $("#rw-st").textContent = "⏳ Rewriting…";
      const data = readBriefEditor($("#bb-tab"), BR.B.brief.data);
      const r = await api(`/briefs/${BR.B.brief.id}/rewrite`, { method: "POST", body: { section: sec, instruction: $("#rw-i").value, data } }).catch((e) => { $("#rw-st").textContent = ""; throw e; });
      BR.B.brief.data = r.data;
      dlg.close();
      briefEditorTab($("#bb-tab"));
      BR.dirty = true; $("#bb-save-bar").classList.add("dirty"); $("#bb-save-st").textContent = "Rewritten: save to keep it";
      $(`[data-sec="${sec}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    } }]);
  setTimeout(() => $("#rw-i")?.focus(), 30);
}

function assignBriefDialog() {
  const B = BR.B, b = B.brief, d = b.data;
  // the Work chosen in the editor counts even before it's saved
  const live = $('#bb-tab select[data-f="modalities.mode"]')?.value || "";
  const mode = workMode(live || d.modalities.mode), grouped = mode !== "individuel";
  const students = B.students.map((s) => ({ id: s.discord_id, name: s.name || s.discord_id }));
  const squads = JSON.parse(JSON.stringify(B.kind === "squad" ? B.squads : []));
  openDialog(b.status === "assigned" ? "Dates, squads and announcement" : "Assign to the class", `
    <p class="small muted" style="margin:4px 0 6px">Work: <b>${esc(WORK_MODES.find(([v]) => v === mode)[1])}</b> <span class="muted">(change it in the brief's modalities)</span></p>
    <div class="field-row"><div><label for="ab-s">Start</label><input type="date" id="ab-s" value="${esc(d.modalities.start)}"></div><div><label for="ab-d">Due</label><input type="date" id="ab-d" value="${esc(d.modalities.due)}"></div><div><label for="ab-t">At (UTC)</label><input type="time" id="ab-t" value="${esc(d.modalities.time || "23:59")}"></div></div>
    <div data-wsprint></div>
    <label for="ab-h">Expected repo name <span class="muted">(optional: finds their repo when they didn't hand it in, e.g. <code>portfolio</code>)</span></label>
    <input type="text" id="ab-h" value="${esc(B.repo_hint || "")}" style="max-width:340px">
    ${grouped ? `<div class="ab-sq">
      <div class="ab-sq-head"><div><b>${mode === "binôme" ? "Pairs" : "Squads"}</b> <span class="small muted" id="ab-sq-n"></span>
        <div class="small muted">The scrum master hands in the ${mode === "binôme" ? "pair's" : "squad's"} repo with <code>/brief submit</code>. Drag students between ${mode === "binôme" ? "pairs" : "squads"}.</div></div>
        <div class="toolbar" style="margin:0"><select id="ab-from"><option value="">Class squads…</option></select>
          ${mode === "binôme" ? `<button class="btn small" id="ab-rand" type="button">🎲 Random pairs</button>` : ""}</div></div>
      <div id="ab-board" class="${mode === "binôme" ? "ab-pairs" : ""}"></div></div>` : ""}
    <label class="check"><input type="checkbox" id="ab-a" ${b.status === "assigned" ? "" : "checked"}> Announce it in Discord (in #general)</label>`,
    [{ label: b.status === "assigned" ? "Save" : "Assign", primary: true, action: async () => {
      const keep = squads.filter((x) => x.members.length);
      if (grouped && !keep.length) throw new Error(mode === "binôme" ? "Make the pairs first (Random pairs, or load the class squads)." : "Make the squads first (Random squads, or load the class squads).");
      await api(`/briefs/${b.id}`, { method: "PUT", body: { kind: grouped ? "squad" : "solo", squads: grouped ? keep : [], repo_hint: $("#ab-h").value.trim(), ...(live && live !== d.modalities.mode ? { data: { ...d, modalities: { ...d.modalities, mode: live } } } : {}) } });
      BR.B = await api(`/briefs/${b.id}/assign`, { method: "POST", body: { start: $("#ab-s").value, due: $("#ab-d").value, time: $("#ab-t").value, ...($(".w-sp", dlg) ? { sprint: $(".w-sp", dlg).value } : {}), announce: $("#ab-a").checked } });
      dlg.close(); toast(b.status === "assigned" ? "Saved" : "Assigned to the class"); renderBrief();
    } }]);
  dlg.classList.add("wide");
  wSprintField(dlg, b.sprint ?? null, "#ab-d", b.week);
  if (!grouped) return;
  const count = () => { const n = squads.filter((x) => x.members.length).length, inSq = new Set(squads.flatMap((x) => x.members)); $("#ab-sq-n", dlg).textContent = `${n} ${mode === "binôme" ? "pair(s)" : "squad(s)"} · ${students.length - students.filter((x) => inSq.has(x.id)).length} student(s) left`; };
  const board = squadBoard($("#ab-board", dlg), students, squads, count);
  count();
  const hex = () => Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
  // random groups: everyone in one, sizes as even as possible (an odd student joins a pair as a trio)
  const randomize = () => {
    const size = mode === "binôme" ? 2 : 4;
    const pool = students.map((x) => x.id).sort(() => Math.random() - 0.5);
    const n = Math.max(1, Math.floor(pool.length / size));
    const groups = Array.from({ length: n }, () => []);
    pool.forEach((id, i) => groups[i % n].push(id));
    squads.splice(0, squads.length, ...groups.map((m, i) => ({ id: hex(), name: `${mode === "binôme" ? "Binôme" : "Squad"} ${i + 1}`, members: m, sm: m[0] })));
    board.redraw(); count();
  };
  if ($("#ab-rand", dlg)) $("#ab-rand", dlg).onclick = randomize;
  api("/squads").then((r) => {
    const sel = $("#ab-from", dlg);
    if (!sel) return;
    sel.innerHTML = `<option value="">${r.sets.length ? "Load the class squads…" : "No class squads yet"}</option>` + r.sets.map((x) => `<option value="${x.id}">${esc(x.name)}${x.active ? " · current" : ""} (${x.squads.length})</option>`).join("");
    sel.onchange = () => {
      const set = r.sets.find((x) => String(x.id) === sel.value);
      if (!set) return;
      const ok = new Set(students.map((x) => x.id));
      squads.splice(0, squads.length, ...set.squads.map((x) => ({ ...x, members: x.members.filter((m) => ok.has(m)) })).filter((x) => x.members.length));
      board.redraw(); count();
    };
    // nothing yet: the class's current squads (for groups) or random pairs
    if (!squads.length) {
      const cur = r.sets.find((x) => x.active) || r.sets[0];
      if (cur && mode !== "binôme") { sel.value = String(cur.id); sel.onchange(); } else randomize();
    }
  }).catch(() => { if (!squads.length) randomize(); });
}

function reviewCell(rv) {
  if (!rv) return `<span class="muted small">not started</span>`;
  return `${status(rv.status === "final" ? "solved" : "pending", rv.status === "final" ? "Finalized" : "Draft")}${rv.pct != null ? ` <b class="num" style="color:${masteryInk(rv.pct)}">${rv.pct}%</b>` : ""}
    <div>${rv.ok.map((c) => compChip(c, "ok")).join(" ")} ${rv.ko.map((c) => compChip(c, "ko")).join(" ")}</div>`;
}
const handinCell = (h) => (h ? `<a href="https://github.com/${esc(h.repo)}" target="_blank" rel="noopener">${esc(h.repo)}</a>${h.plan ? ` · <a href="${esc(h.plan)}" target="_blank" rel="noopener">board</a>` : ""}
  <div class="muted small">${fmtDateTime(h.at)}${h.by === "teacher" ? " · set by you" : ""}</div>` : `<span class="muted small">not handed in</span>`);

// ---- the debriefs of the whole class: the brief's assessment, and "Analyze all"
/** Who can be analyzed: the students (or squads) not finalized, with what they handed in. */
function debriefQueue(withAnalyzed = false, withoutHandin = false) {
  const { B } = BR;
  const rows = B.kind === "squad"
    ? B.squadRows.filter((s) => s.members.length).map((s) => ({ who: `s:${s.id}`, name: s.name, handin: s.handin, review: s.review }))
    : B.students.map((s) => ({ who: `u:${s.discord_id}`, name: s.name || s.discord_id, handin: s.handin, review: s.review }));
  return rows.filter((r) => r.review?.status !== "final" && (withAnalyzed || !r.review) && (withoutHandin || r.handin));
}
function debriefToolsHtml() {
  const { B } = BR, list = B.assessments || [];
  const waiting = debriefQueue().length, all = debriefQueue(true, true).length;
  const asHtml = list.length
    ? list.map((a) => `<a class="dbt-as" href="#/assessment/${a.id}"><b>${esc(a.title)}</b><span>${a.takers ? `${a.done}/${a.takers} handed in · ${a.graded} graded` : "nobody invited yet: open it to invite the class"}</span></a>`).join("")
    : `<div class="dbt-none"><span>No assessment linked. Link one and it counts in <b>every</b> student's debrief.</span>
        <div class="dbt-link"><select id="dbt-sel" aria-label="Assessment to link"><option value="">Loading…</option></select><button class="btn small" id="dbt-link">Link to this brief</button><button class="btn small" id="dbt-ai">✨ Generate one</button></div></div>`;
  return `<section class="panel dbt"><div class="dbt-col"><span class="dbt-h">Assessment of the brief</span>${asHtml}
      ${list.length ? `<p class="small muted" style="margin:6px 0 0">Linked once for the whole class: each debrief reads each student's own result. Students must be invited to it (Assessment → Invite).</p>` : ""}</div>
    <div class="dbt-col dbt-run"><span class="dbt-h">Debriefs</span>
      <p class="small" style="margin:0 0 8px">${waiting ? `<b>${waiting}</b> ${B.kind === "squad" ? "squad(s)" : "student(s)"} handed in and not analyzed yet.` : debriefQueue(true).length ? "Every hand-in is analyzed." : all ? "Nothing handed in yet: Analyze all can use the repos they pushed to during the brief." : "Every debrief is finalized."}</p>
      <button class="btn ${waiting ? "primary" : ""}" id="dbt-all" ${all ? "" : "disabled"}>🔍 Analyze all…</button></div></section>`;
}
function wireDebriefTools(root) {
  const { B } = BR, id = B.brief.id;
  if ($("#dbt-sel", root)) {
    api("/assessments").then((r) => {
      const sel = $("#dbt-sel", root); if (!sel) return;
      const list = (r.items || []).filter((a) => String(a.brief_id || "") !== String(id));
      sel.innerHTML = list.length ? `<option value="">Choose an assessment…</option>` + list.map((a) => `<option value="${a.id}">${esc(a.title)}${a.brief_id ? " (linked to another brief)" : ""}</option>`).join("") : `<option value="">No assessment yet</option>`;
    }).catch(() => {});
    $("#dbt-link", root).onclick = (e) => busy(e.currentTarget, async () => {
      const v = $("#dbt-sel", root).value;
      if (!v) throw new Error("Choose the assessment to link");
      await api(`/assessments/${v}/link`, { method: "POST", body: { brief_id: id } });
      BR.B = await api(`/briefs/${id}`);
      toast(debriefQueue(true).length < debriefQueue(true, true).length ? "Linked. Debriefs already analyzed: analyze them again to use it" : "Linked to the whole brief");
      renderBrief();
    });
    $("#dbt-ai", root).onclick = () => generateQuestionsDialog(null, { brief: id, title: B.brief.data.title });
  }
  $("#dbt-all", root).onclick = () => analyzeAllDialog(root);
}
/** Analyze the debriefs one after the other (2 at a time), with the progress; it can be stopped. */
function analyzeAllDialog(root) {
  const { B } = BR, id = B.brief.id;
  const unit = B.kind === "squad" ? "squads" : "students";
  const count = (a, h) => debriefQueue(a, h).length;
  openDialog("Analyze all the debriefs", `
    <p style="margin-top:4px">The bot analyzes each ${B.kind === "squad" ? "squad's" : "student's"} repo, one after the other (about 30 s to a minute each). Keep this page open: you can stop at any time, what's done stays done. Finalized debriefs are never touched.</p>
    <label class="check"><input type="checkbox" id="aa-again"> Also analyze again the ${unit} already analyzed (not finalized): their switches and comment start over</label>
    <label class="check"><input type="checkbox" id="aa-noh"> Also the ${unit} who didn't hand in (the repo they pushed to during the brief)</label>
    <p class="small" id="aa-n"></p>
    <div id="aa-prog" class="aa-prog" hidden><div class="aa-bar"><span></span></div><p class="small" id="aa-st"></p><ul id="aa-list" class="aa-list"></ul></div>`,
    [{ label: "Start", primary: true, action: async (d) => {
      const q = debriefQueue($("#aa-again", d).checked, $("#aa-noh", d).checked);
      if (!q.length) throw new Error("Nothing to analyze with these options");
      const btn = $(".dlg-foot .btn.primary", d);
      btn.hidden = true;
      $$(".check input", d).forEach((x) => { x.disabled = true; });
      $("#aa-prog", d).hidden = false;
      $("#aa-list", d).innerHTML = q.map((r, i) => `<li data-i="${i}"><span class="aa-dot"></span>${esc(r.name)}<small>${r.handin ? esc(r.handin.repo) : "no hand-in"}</small></li>`).join("");
      let done = 0, failed = 0, stop = false, next = 0;
      const foot = $(".dlg-foot", d);
      foot.insertAdjacentHTML("afterbegin", `<button class="btn" id="aa-stop">Stop</button>`);
      $("#aa-stop", d).onclick = () => { stop = true; $("#aa-stop", d).disabled = true; $("#aa-st", d).textContent = "Stopping after the ones running…"; };
      const draw = () => { $(".aa-bar span", d).style.width = `${Math.round(((done + failed) / q.length) * 100)}%`; if (!stop) $("#aa-st", d).textContent = `${done + failed}/${q.length} · ${done} analyzed${failed ? ` · ${failed} failed` : ""}`; };
      const worker = async () => {
        while (!stop && next < q.length) {
          const i = next++, r = q[i], li = $(`[data-i="${i}"]`, d);
          li.className = "run"; li.scrollIntoView({ block: "nearest" });
          try {
            await api(`/briefs/${id}/review/analyze`, { method: "POST", body: { who: r.who } });
            li.className = "ok"; done++;
          } catch (e) { li.className = "ko"; li.title = e.message; li.querySelector("small").textContent = e.message.slice(0, 120); failed++; }
          draw();
        }
      };
      draw();
      await Promise.all([worker(), worker()]);
      $("#aa-st", d).textContent = `${stop ? "Stopped" : "Done"}: ${done} analyzed${failed ? `, ${failed} failed (hover to see why, or open their debrief)` : ""}.`;
      $("#aa-stop", d)?.remove();
      btn.hidden = false; btn.textContent = "Close"; btn.onclick = () => d.close();
      BR.B = await api(`/briefs/${id}`);
      if (location.hash === `#/brief/${id}`) renderBrief();
      toast(`${done} debrief(s) analyzed${failed ? ` · ${failed} failed` : ""}`, !!failed && !done);
    } }]);
  const d = dlg;
  const upd = () => { const n = count($("#aa-again", d).checked, $("#aa-noh", d).checked); $("#aa-n", d).innerHTML = n ? `<b>${n}</b> ${unit} to analyze.` : `Nothing to analyze with these options.`; };
  $$(".check input", d).forEach((x) => { x.onchange = upd; });
  upd();
}

function briefStudentsTab(root) {
  const { B } = BR, id = B.brief.id;
  const pushCell = (p) => (p === "on" ? `<span class="status solved">pushed</span>` : p === "late" ? `<span class="status late">after the deadline</span>` : `<span class="muted small">—</span>`);
  const actions = (who, h) => `<button class="btn small" data-hi="${esc(who)}" data-repo="${esc(h?.repo || "")}" data-plan="${esc(h?.plan || "")}" title="Set or fix the repo">✏️ Repo</button>
    <a class="btn small primary" href="#/debrief/${id}~${encodeURIComponent(who)}">Debrief →</a>`;
  let html;
  if (B.kind === "squad") {
    const nameOf = (uid) => B.students.find((s) => s.discord_id === uid)?.name || uid;
    const alone = B.students.filter((s) => !s.squad);
    html = (alone.length ? `<div class="notice warn" style="margin-bottom:12px">${alone.length} student(s) in no squad: ${alone.map((s) => esc(s.name || s.discord_id)).join(", ")}. Add them with “Dates, squads & announce”.</div>` : "") + table([
      { label: "Squad", sort: "name", html: (s) => `<b>${esc(s.name)}</b><div class="small">${s.members.map((m) => `${avatar(nameOf(m), m)} ${esc(nameOf(m))}${m === s.sm ? " <span class='tag'>SM</span>" : ""}`).join("<br>")}</div>` },
      { label: "Pushed", html: (s) => s.members.map((m) => pushCell(B.students.find((x) => x.discord_id === m)?.push)).join("<br>") },
      { label: "Handed in", html: (s) => handinCell(s.handin) },
      { label: "Debrief", html: (s) => reviewCell(s.review) },
      { label: "", html: (s) => actions(`s:${s.id}`, s.handin) },
    ], B.squadRows, { empty: "No squads yet: make them with “Dates, squads & announce”." });
  } else {
    html = table([
      { label: "Student", sort: "name", html: (s) => `<a href="#/student/${s.discord_id}">${avatar(s.name, s.discord_id)} ${esc(s.name || s.discord_id)}</a>` },
      { label: "GitHub", sort: "github_login", html: (s) => (s.github_login ? `<a href="https://github.com/${esc(s.github_login)}" target="_blank" rel="noopener">${esc(s.github_login)}</a>` : `<span class="muted small">not linked (/github)</span>`) },
      { label: "Pushed", html: (s) => pushCell(s.push) },
      { label: "Handed in", html: (s) => handinCell(s.handin) },
      { label: "Debrief", html: (s) => reviewCell(s.review) },
      { label: "", html: (s) => actions(`u:${s.discord_id}`, s.handin) },
    ], B.students, { empty: "No students yet." });
  }
  root.innerHTML = `${debriefToolsHtml()}<section class="panel"><p class="muted small" style="margin-top:0">After the deadline, open each debrief: the bot reads the repo, checks the requirements and the competencies, proposes a mise en situation and writes the comment. Finalizing records the competencies on the student's profile.</p>${html}</section>`;
  wireDebriefTools(root);
  $$("[data-hi]", root).forEach((x) => x.onclick = () => openDialog("Repo handed in", `
      <label for="hi-r">GitHub repo <span class="muted">(owner/repo or its link; empty = remove)</span></label><input type="text" id="hi-r" style="width:100%" value="${esc(x.dataset.repo)}">
      <label for="hi-p">Planning board <span class="muted">(Trello, Jira or GitHub Project, optional)</span></label><input type="url" id="hi-p" style="width:100%" value="${esc(x.dataset.plan)}">`,
    [{ label: "Save", primary: true, action: async () => {
      BR.B = await api(`/briefs/${id}/handin`, { method: "POST", body: { who: x.dataset.hi, repo: $("#hi-r").value, plan: $("#hi-p").value } });
      dlg.close(); toast("Saved"); renderBrief();
    } }]));
}

async function briefGridTab(root) {
  const { B } = BR, g = B.grid;
  const TYPE = { fonctionnalite: "Feature", fonctionnalité: "Feature", technique: "Technical", livrable: "Deliverable", qualite: "Quality", qualité: "Quality", oral: "Oral", bonus: "Bonus", story: "Story", critere: "Criterion" };
  root.innerHTML = `<div class="grid cols-2-even">
    <section class="panel"><div class="panel-head"><h2>Evaluation grid</h2><button class="btn small" id="gr-ai">✨ ${g ? "Write it again" : "Write it"} with AI</button></div>
      <p class="muted small" style="margin-top:0">What the debrief checks, point by point. Points linked to automatic checks (<code>vérif : …</code>) are decided by the code itself, not by the AI.</p>
      ${g?.items?.length ? `<ol class="grid-items">${g.items.map((it) => `<li><span class="tag">${esc(TYPE[it.type] || it.type)}</span> ${esc(it.texte)}${(it.verif || []).length ? ` <span class="small muted">· vérif ${it.verif.map((v) => `<code>${esc(v)}</code>`).join(" ")}</span>` : ""}</li>`).join("")}</ol>`
        : `<p class="empty">No grid yet. It's written when you publish the brief, or with the button above.</p>`}
    </section>
    <section class="panel"><h2>Edit</h2>
      <p class="muted small" style="margin-top:0">One point per line: <code>[fonctionnalité] Créer la page Contact (vérif : form, map)</code>.</p>
      <textarea id="gr-t" class="code" style="min-height:360px" spellcheck="false">${esc(B.gridText)}</textarea>
      <p class="toolbar" style="margin:10px 0 0"><button class="btn primary" id="gr-save">Save the grid</button></p>
      <details class="small"><summary>Automatic checks you can link</summary><div id="gr-ids" class="muted">Loading…</div></details>
    </section></div>
    <section class="panel" style="margin-top:16px"><div class="panel-head"><h2>Steps</h2><button class="btn small" id="st-ai">✨ Find them</button></div>
      ${B.steps?.length ? `<ol class="grid-items">${B.steps.map((s) => `<li><b>${esc(s.name)}</b> · ${fmtDateTime(s.due)}${s.expected ? ` · ${esc(s.expected)}` : ""}</li>`).join("")}</ol>`
        : `<p class="empty">No steps.</p>`}
      <textarea id="st-t" class="code" style="min-height:110px" spellcheck="false" placeholder="Partie 1 | 2026-10-05 23:59 | expected">${esc(B.stepsText || "")}</textarea>
      <p class="toolbar" style="margin:10px 0 0"><button class="btn primary" id="st-save">Save the steps</button></p>
    </section>`;
  $("#st-ai").onclick = (e) => busy(e.currentTarget, async () => { BR.B = await api(`/briefs/${B.brief.id}/steps`, { method: "POST", body: {} }); toast(BR.B.steps.length ? `${BR.B.steps.length} step(s) found` : "No steps in this brief"); renderBrief(); });
  $("#st-save").onclick = (e) => busy(e.currentTarget, async () => { BR.B = await api(`/briefs/${B.brief.id}/steps`, { method: "PUT", body: { text: $("#st-t").value } }); toast("Steps saved"); renderBrief(); });
  $("#gr-ai").onclick = (e) => busy(e.currentTarget, async () => { toast("⏳ Writing the grid…"); BR.B = await api(`/briefs/${B.brief.id}/grid`, { method: "POST", body: {} }); toast("Grid written"); renderBrief(); });
  $("#gr-save").onclick = (e) => busy(e.currentTarget, async () => { BR.B = await api(`/briefs/${B.brief.id}/grid`, { method: "PUT", body: { text: $("#gr-t").value } }); toast("Grid saved"); renderBrief(); });
  api("/github").then((x) => { $("#gr-ids").innerHTML = x.checks.map((c) => `<div><code>${esc(c.id)}</code> ${esc(c.label)}</div>`).join(""); }).catch(() => { $("#gr-ids").textContent = ""; });
}

function briefTeamTab(root) {
  const { B } = BR;
  const squads = JSON.parse(JSON.stringify(B.squads));
  const students = B.students.map((s) => ({ id: s.discord_id, name: s.name || s.discord_id }));
  let dirty = false;
  root.innerHTML = `<section class="panel">
    <label style="margin-top:0">How the students work on it</label>
    ${segHtml("kind", [["solo", "Each student alone"], ["squad", "In squads"]], B.kind)}
    <label for="sq-hint">Expected repo name <span class="muted">(optional: helps find their repo when they didn't hand it in, e.g. <code>portfolio</code>)</span></label>
    <input type="text" id="sq-hint" value="${esc(B.repo_hint)}" style="max-width:340px">
    <div id="sq-box" ${B.kind === "squad" ? "" : "hidden"}>
      <div class="sq-load"><div><h3 style="margin:0">Squads of this brief</h3>
        <p class="muted small" style="margin:4px 0 0">The scrum master hands in the squad's repo with <code>/brief submit</code>. Load the class's squads (Teams & squads), then adjust them here for this brief only.</p></div>
        <div class="toolbar" style="margin:0"><select id="sq-from"><option value="">Loading the class's squads…</option></select><button class="btn" id="sq-load" type="button">Load</button></div></div>
      <div id="sq-board"></div>
    </div>
    <p class="toolbar" style="margin:16px 0 0"><button class="btn primary" id="sq-save">Save</button><span class="small muted" id="sq-dirty"></span></p></section>`;
  const mark = () => { dirty = true; $("#sq-dirty").textContent = "Not saved yet"; };
  let board = squadBoard($("#sq-board"), students, squads, mark);
  wireSeg(root, "kind", (v) => { $("#sq-box").hidden = v !== "squad"; mark(); });
  api("/squads").then((d) => {
    const sel = $("#sq-from");
    if (!sel) return;
    sel.innerHTML = d.sets.length ? d.sets.map((x) => `<option value="${x.id}">${esc(x.name)}${x.active ? " · current" : ""} (${x.squads.length} squads)</option>`).join("") : `<option value="">No class squads yet (Teams & squads)</option>`;
    $("#sq-load").onclick = () => {
      const set = d.sets.find((x) => String(x.id) === sel.value);
      if (!set) { location.hash = "#/teams"; return; }
      const ok = new Set(students.map((s) => s.id));
      squads.splice(0, squads.length, ...set.squads.map((x) => ({ ...x, members: x.members.filter((m) => ok.has(m)) })).filter((x) => x.members.length));
      board.redraw(); mark(); toast(`Loaded “${set.name}”: save to keep`);
    };
    // a squad brief without squads: start from the current ones
    const cur = d.sets.find((x) => x.active) || d.sets[0];
    if (!squads.length && cur && B.kind === "squad") $("#sq-load").click();
  }).catch(() => {});
  $("#sq-save").onclick = (e) => busy(e.currentTarget, async () => {
    BR.B = await api(`/briefs/${B.brief.id}`, { method: "PUT", body: { kind: segVal(root, "kind"), squads: squads.filter((s) => s.members.length), repo_hint: $("#sq-hint").value } });
    dirty = false; toast("Saved"); renderBrief();
  });
  $("#sq-hint").oninput = mark;
}

function briefPoTab(root) {
  const i = BR.B.brief.internal;
  const ta = (f, v, h = 80) => `<textarea data-i="${f}" style="min-height:${h}px">${esc(v)}</textarea>`;
  root.innerHTML = `<section class="panel">
    <p class="muted small" style="margin-top:0">Only for you (the product owner): never shown to the students.</p>
    <div class="grid cols-2-even">
      <div><label>What they learn</label>${ta("learning", i.learning.join("\n"))}
        <label>Concepts → where the brief makes them practice <span class="muted">(concept : where)</span></label>${ta("coverage", i.coverage.map((c) => `${c.concept} : ${c.where}`).join("\n"), 110)}
        <label>The client</label>${ta("client", i.client, 70)}</div>
      <div><label>Questions to expect from students</label>${ta("questions", i.questions.join("\n"))}
        <label>Risks</label>${ta("risks", i.risks.join("\n"), 70)}
        <label>Assumptions</label>${ta("assumptions", i.assumptions.join("\n"), 70)}
        <label>Notes</label>${ta("notes", i.notes, 70)}</div>
    </div>${saveBarHtml()}</section>`;
  wireDirty(root);
}
function readPo(root, base) {
  const v = (k) => $(`[data-i="${k}"]`, root)?.value ?? "";
  return { ...base, learning: lines(v("learning")), questions: lines(v("questions")), risks: lines(v("risks")), assumptions: lines(v("assumptions")), client: v("client"), notes: v("notes"),
    coverage: lines(v("coverage")).map((l) => { const [concept, ...rest] = l.split(/\s*[:→]\s*/); return { concept: concept.trim(), where: rest.join(" : ").trim() }; }).filter((c) => c.concept) };
}

// ===================================================================== DEBRIEF
const STATUT = { fait: ["ok", "Done"], partiel: ["warn", "Partly"], absent: ["bad", "Missing"], non_verifiable: ["", "Can't tell"] };
// Step 1 of a debrief: the assessment linked to the brief, the surest proof of what the learner masters
const SC_LVL = (p) => (p >= 90 ? "excellent" : p >= 75 ? "bon" : p >= 55 ? "moyen" : p >= 35 ? "faible" : "critique");
const SC_LVL_NAME = { excellent: "Excellent", bon: "Bon", moyen: "Moyen", faible: "Faible", critique: "Critique" };
/** What the graded assessments say of each competency (C3, T5…): true, false, or absent (not tested). */
function assessVerdicts(assess) {
  const out = {};
  for (const a of assess || []) for (const [k, v] of Object.entries(a.comps || {})) {
    if (!v || typeof v.ok !== "boolean") continue;
    const b = (parseC(k) || {}).code || k;
    out[b] = b in out ? out[b] && v.ok : v.ok;
  }
  return out;
}
// the "no assessment" panel: generate one with AI, link an existing one, or go on without it for this brief
function wireAssessLink(root) {
  const box = $(".asl, .asl-min", root);
  if (!box || box.dataset.wired) return;
  box.dataset.wired = "1";
  const bid = DB.bid;
  const sel = $("[data-asl-sel]", box);
  if (sel) api("/assessments").then((r) => {
    const list = (r.items || []).filter((a) => String(a.brief_id || "") !== String(bid));
    sel.innerHTML = list.length ? `<option value="">Choose…</option>` + list.map((a) => `<option value="${a.id}">${esc(a.title)}${a.brief_id ? " (linked to another brief)" : ""}</option>`).join("") : `<option value="">No assessment yet</option>`;
  }).catch(() => { sel.innerHTML = `<option value="">—</option>`; });
  const set = (v) => { try { v ? localStorage.setItem(`cb-noassess:${bid}`, "1") : localStorage.removeItem(`cb-noassess:${bid}`); } catch { /* private window */ } };
  $$("[data-asl]", box).forEach((b) => b.onclick = () => busy(b, async () => {
    const act = b.dataset.asl;
    if (act === "hide" || act === "show") { set(act === "hide"); renderDebrief(); return; }
    if (act === "ai") { generateQuestionsDialog(null, { brief: bid, title: DB.B.brief.title }); return; }
    if (!sel.value) throw new Error("Choose the assessment to link");
    await api(`/assessments/${sel.value}/link`, { method: "POST", body: { brief_id: Number(bid) } });
    toast(DB.R.review?.result ? "Assessment linked: analyze again so the debrief uses it" : "Assessment linked to this brief");
    DB.R = await api(`/briefs/${bid}/review?who=${encodeURIComponent(DB.who)}`);
    renderDebrief();
  }));
}
function assessPanelHtml(assess) {
  const list = assess || [];
  if (!list.length) {
    const bid = (typeof DB !== "undefined" && DB && DB.bid) || "";
    let hidden = false; try { hidden = localStorage.getItem(`cb-noassess:${bid}`) === "1"; } catch { /* private window */ }
    if (hidden) return `<section class="panel db-step1 asl-min"><span class="asl-mi" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z"/><path d="M8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2"/></svg></span>
      <span><b>1 · Assessment</b> <span class="muted">none linked: this debrief uses the project only</span></span><button class="btn small" data-asl="show">Add one</button></section>`;
    return `<section class="panel db-step1 asl">
      <div class="asl-head"><span class="asl-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z"/><path d="M8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2"/><path d="M12 11v4M12 18h.01"/></svg></span>
        <div><h2>1 · Add an assessment to this brief</h2>
          <p>Without one, the debrief only sees the project, and a project can be copied or made with AI. A short assessment is the surest proof that the learner masters the competencies: its results set where each competency starts and go into the comment.</p></div>
        <button class="btn small asl-x" data-asl="hide" title="Continue without an assessment for this brief">Not for this brief</button></div>
      <div class="asl-opts">
        <button type="button" class="asl-opt main" data-asl="ai"><b>✨ Generate it with AI</b><span>Questions written from this brief's notions and competencies. You check them before inviting the class.</span></button>
        <div class="asl-opt"><b>Link an existing one</b><span>An assessment you already made or imported.</span>
          <div class="asl-link"><select data-asl-sel aria-label="Assessment to link"><option value="">Loading…</option></select><button class="btn small" data-asl="link">Link</button></div></div>
        <a class="asl-opt" href="#/assessments"><b>Write one yourself</b><span>In Assessments, then choose this brief as its “Linked brief”.</span></a>
      </div></section>`;
  }
  return `<section class="panel db-step1"><h2>1 · Assessment <span class="muted">it comes first: it decides where each competency starts</span></h2>
    <div class="db-rows">${list.map((x) => {
      const ok = Object.entries(x.comps || {}).filter(([, v]) => v.ok), ko = Object.entries(x.comps || {}).filter(([, v]) => !v.ok);
      const lv = x.score != null ? SC_LVL(x.score) : "";
      const who = String(DB?.who || "").startsWith("u:") ? DB.who.slice(2) : "";
      return `<div class="db-row"><span class="db-i">📝</span><div><a href="#/assessment/${x.id}${who ? `~${who}` : ""}" title="${who ? "Open their paper: answers, grades and comments" : "Open the assessment"}"><b>${esc(x.title)}</b></a>
        ${x.score != null ? ` <b style="color:${masteryInk(x.score)}">${x.score}%</b> <span class="lvl"><i class="pg-dot pgc-${lv}"></i>${SC_LVL_NAME[lv]}</span>${x.of > 1 ? ` <span class="small muted">${x.done}/${x.of} graded</span>` : ""}`
          : ` <span class="lvl warn">${x.of ? "Not graded yet" : "Not taken"}</span>`}
        ${ok.length || ko.length ? `<div style="margin-top:6px">${ok.map(([k]) => `<span class="lvl good">✓ ${esc(k)}</span>`).join(" ")} ${ko.map(([k, v]) => `<span class="lvl bad" title="${esc(v.note || "")}">✗ ${esc(k)}</span>`).join(" ")}</div>` : ""}
        ${x.score == null ? `<div class="small muted">${x.of ? "Grade it in the assessment's Results tab: until then the debrief uses the project only." : "This learner wasn't invited to it: the debrief uses the project only."}</div>` : ""}</div></div>`;
    }).join("")}</div></section>`;
}
// a competency where the assessment and the project disagree: a suggestion, the teacher decides
function compAdvice(avis, a) {
  if (typeof a !== "boolean") return "";
  const proj = avis === "validable";
  if (a === proj) return "";
  return a ? `<div class="db-adv ok">💡 Suggestion: <b>valid</b>. The assessment shows they master it, but the project doesn't show it yet: check it in the mise en situation or an oral question.</div>`
    : `<div class="db-adv ko">⚠️ Suggestion: <b>not valid</b>. The project shows it but the assessment doesn't: the code may be copied or made with AI. Check it in the mise en situation or an oral question.</div>`;
}

const noVerifText = (t) => String(t ?? "").replace(/\s*\(\s*v[ée]rif\s*:[^)]*\)/gi, "").trim();
const AVIS = { validable: ["ok", "Can be validated"], a_verifier: ["warn", "To check"], non_visible: ["bad", "Not visible"] };
const MES = [["valide", "Validated"], ["partiel", "Partly"], ["non_valide", "Not validated"]];
const EXTYPE = { fonctionnalite: "Feature", fonctionnalité: "Feature", technique: "Technical", livrable: "Deliverable", qualite: "Quality", qualité: "Quality", oral: "Oral", bonus: "Bonus", story: "Story", critere: "Criterion" };
let DB = null;

async function viewDebrief(arg) {
  const [bid, rawWho] = String(arg || "").split("~");
  const who = decodeURIComponent(rawWho || "");
  const [B, R] = await Promise.all([api(`/briefs/${bid}`), api(`/briefs/${bid}/review?who=${encodeURIComponent(who)}`), loadRef()]);
  DB = { B, R, who, bid, commentEdited: false, timer: null };
  renderDebrief();
}

function debriefTarget() {
  const { B, who } = DB;
  if (who.startsWith("s:")) { const s = B.squadRows.find((x) => `s:${x.id}` === who); return { name: s?.name || "Squad", handin: s?.handin, review: s?.review, squad: s }; }
  const s = B.students.find((x) => `u:${x.discord_id}` === who);
  return { name: s?.name || who.slice(2), handin: s?.handin, review: s?.review, student: s };
}
function debriefOrder() {
  const { B } = DB;
  return B.kind === "squad" ? B.squadRows.map((s) => `s:${s.id}`) : B.students.filter((s) => s.handin || s.review || s.push).map((s) => `u:${s.discord_id}`);
}

function renderDebrief() {
  const { B, R, who, bid } = DB;
  const T = debriefTarget();
  const rec = R.review, st = R.states, final = R.status === "final";
  const order = debriefOrder(), at = order.indexOf(who);
  const nav = (i) => (order[i] ? `#/debrief/${bid}~${encodeURIComponent(order[i])}` : null);
  view.innerHTML = `
    <div class="page-head"><div>
      <p class="crumb"><a href="#/progress">Progress</a> › <a href="#/brief/${bid}">${esc(B.brief.data.title)}</a></p>
      <h1>Debrief · ${esc(T.name)}</h1>
      <p class="sub">${T.handin ? `Handed in <a href="https://github.com/${esc(T.handin.repo)}" target="_blank" rel="noopener">${esc(T.handin.repo)}</a> ${fmtAgo(T.handin.at)}` : "Not handed in: the analysis uses the repo they pushed to during the brief"}
        ${rec ? ` · analyzed ${fmtAgo(Math.floor(rec.at / 1000))}${rec.model ? ` <span class="muted small">(${esc(rec.model)})</span>` : ""}` : ""} ${R.status ? status(final ? "solved" : "pending", final ? "Finalized" : "Draft") : ""}</p></div>
      <div class="toolbar" style="margin:0">
        ${nav(at - 1) ? `<a class="btn" href="${nav(at - 1)}">← Previous</a>` : ""}${nav(at + 1) ? `<a class="btn" href="${nav(at + 1)}">Next →</a>` : ""}
        ${final ? "" : `<button class="btn ${rec ? "" : "primary"}" id="db-an">${rec ? "↻ Analyze again" : "🔍 Analyze the work"}</button>`}</div></div>
    <div id="db-body"></div>`;
  if ($("#db-an")) $("#db-an").onclick = () => analyzeWork();
  if ($("#db-other")) $("#db-other").onclick = () => analyzeDialog();
  const body = $("#db-body");
  if (!rec) {
    body.innerHTML = `<div style="margin-bottom:16px">${assessPanelHtml(R.assess)}</div>${(R.steps || []).length ? `<section class="panel" id="db-steps" style="margin-bottom:16px"></section>` : ""}<section class="panel"><div class="empty-state"><div style="font-size:42px">🔍</div><h2 style="justify-content:center">Not analyzed yet</h2>
      ${T.handin ? `<div class="db-repo"><span class="db-repo-ic" aria-hidden="true">🐙</span><div><span class="small muted">${T.squad ? "The squad handed in" : "Handed in"} ${fmtAgo(T.handin.at)}</span>
          <a href="https://github.com/${esc(T.handin.repo)}" target="_blank" rel="noopener"><b>${esc(T.handin.repo)}</b> ↗</a>${T.handin.plan ? ` · <a class="small" href="${esc(T.handin.plan)}" target="_blank" rel="noopener">planning board</a>` : ""}</div></div>
        <p class="muted">The bot reads this repo (files, commits${T.squad ? ", each member's part" : ""}), runs the automatic checks, asks the AI to judge each point of the grid and each competency, then writes the comment. You decide everything after.</p>
        <button class="btn primary" id="db-an2">🔍 Analyze ${esc(T.handin.repo.split("/")[1] || T.handin.repo)}</button>
        <p style="margin:10px 0 0"><button class="ap-link" id="db-other2">Analyze another repo instead</button></p>`
      : `<div class="notice warn" style="text-align:left;max-width:560px;margin:0 auto 12px">${T.squad ? "The squad" : "This student"} didn't hand in a repo. Pick the one to debrief: the bot lists their GitHub repos, the ones pushed during the brief first.</div>
        <p class="muted">The bot reads the repo (files, commits${T.squad ? ", each member's part" : ""}), runs the automatic checks, asks the AI to judge each point of the grid and each competency, then writes the comment. You decide everything after.</p>
        <button class="btn primary" id="db-an2">🔍 Find the repo and analyze</button>`}</div></section>`;
    $("#db-an2").onclick = () => analyzeWork();
    if ($("#db-other2")) $("#db-other2").onclick = () => analyzeDialog();
    wireAssessLink(body);
    renderSteps(false);
    return;
  }
  const r = rec.result || {};
  const ex = r.exigences || [];
  const checks = (rec.checks || []);
  const ckLabel = Object.fromEntries(checks.map((c) => [c.id, c.label]));
  const exByType = {};
  ex.forEach((e, i) => (exByType[e.type] ??= []).push(i));
  const lvlOf = Object.fromEntries((B.brief.data.competencies || []).map((c) => { const p = parseC(c); return [p?.code, p?.level]; }));
  // a check that a requirement shows is that requirement's switch: listed once
  const shown = new Set(ex.filter((e) => e.check && e.check in st.ck).map((e) => e.check));
  const otherChecks = checks.filter((c) => !shown.has(c.id));
  const ckDetail = Object.fromEntries(checks.map((c) => [c.id, c.detail || ""]));
  const aV = assessVerdicts(rec.assess);
  body.innerHTML = `<div class="db-grid">
    <div class="stack">
      ${assessPanelHtml(rec.assess)}
      <section class="panel"><div class="panel-head"><h2>2 · Project (GitHub)</h2><span id="db-pct"></span></div>
        <div id="db-meter"></div>
        ${r.resume ? `<p>${esc(r.resume)}</p>` : ""}
        <div class="grid cols-2-even">
          ${r.forts?.length ? `<div><h3>👍 Strengths</h3><ul class="small">${r.forts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
          ${r.ameliorer?.length ? `<div><h3>🛠️ To improve</h3><ul class="small">${r.ameliorer.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
        </div>
        <p class="muted small">Repo${(rec.repos || []).length > 1 ? "s" : ""}: ${(rec.repos || []).map((x) => `<a href="https://github.com/${esc(x)}" target="_blank" rel="noopener">${esc(x)}</a>`).join(", ") || "—"} · ${rec.count ?? 0} commit(s) during the brief</p>
      </section>
      ${otherChecks.length ? `<section class="panel"><h2>${otherChecks.length < checks.length ? "Other automatic checks" : "Automatic checks"} <span class="muted">read in the code: sure${otherChecks.length < checks.length ? " · the others are in the requirements" : ""}</span></h2>
        <div class="db-rows">${otherChecks.map((c) => `<div class="db-row ${c.info ? "info" : ""}">
          ${c.info || typeof st.ck[c.id] !== "boolean" ? `<span class="db-i">ℹ️</span>` : sw(`data-ck="${esc(c.id)}"`, st.ck[c.id], final)}
          <div><b>${esc(c.label || c.id)}</b><div class="small muted">${esc(c.detail || "")}</div></div></div>`).join("")}</div></section>` : ""}
      <section class="panel"><h2>Requirements of the brief <span class="muted">switch = validated</span></h2>
        ${Object.entries(exByType).map(([type, idx]) => `<h3>${esc(EXTYPE[type] || type)} <span class="muted small">${idx.length}</span></h3>
          <div class="db-rows">${idx.map((i) => { const e = ex[i], bound = e.check && e.check in st.ck; const s = STATUT[e.statut] || ["", e.statut];
            return `<div class="db-row">${sw(`data-ex="${i}" ${bound ? `data-exck="${esc(e.check)}"` : ""}`, st.ex[i], final)}
              <div><span>${esc(noVerifText(e.texte))}</span> <span class="lvl ${s[0]}">${esc(s[1])}</span>
              <div class="small muted">${bound ? `🔎 automatic check: ${esc(ckDetail[e.check] || ckLabel[e.check] || e.check)}` : esc(e.preuve || "")}</div></div></div>`; }).join("")}</div>`).join("") || `<p class="empty">No requirement found.</p>`}
      </section>
      ${(r.commits || []).length ? `<section class="panel"><details><summary><b>Commits</b> <span class="muted small">${r.commits.length} · what the AI thought of each</span></summary>
        <div class="db-rows" style="margin-top:10px">${r.commits.map((c) => `<div class="db-row"><span class="db-i">${c.ok === true ? "✅" : c.ok === false ? "⚠️" : "·"}</span>
          <div><code>${esc(c.sha)}</code> ${esc(c.msg)}<div class="small muted">${esc(c.note || "")}</div></div></div>`).join("")}</div></details></section>` : ""}
      ${rec.squad ? squadMembersHtml(rec, st, final) : ""}
    </div>
    <aside class="stack db-side">
      ${(R.steps || []).length ? `<section class="panel" id="db-steps"></section>` : ""}
      <section class="panel" id="db-mes">${mesHtml(rec.challenge, st.mes, final)}</section>
      <section class="panel" id="db-oral"></section>
      <section class="panel"><h2>Competencies <span class="muted">assessment, project, mise en situation and oral questions · your switch decides</span></h2>
        <div class="db-rows">${(r.competences || []).map((c) => { const a = AVIS[c.avis] || ["", c.avis];
          const base = (parseC(c.code) || {}).code;
          const ax = (rec.assess || []).map((x) => [x, x.comps?.[base]]).filter(([, v]) => v);
          return `<div class="db-row">${sw(`data-co="${esc(c.code)}"`, st.co[c.code], final)}
            <div>${compChip(c.code + (lvlOf[c.code] ? "N" + lvlOf[c.code] : ""))} <span class="small">${esc(compName(c.code))}</span>
            <div style="margin-top:4px">${ax.map(([x, v]) => `<span class="lvl ${v.ok ? "good" : "bad"}" title="${esc(x.title)}${v.note ? ` · ${esc(v.note)}` : ""}">📝 assessment: ${v.ok ? "validated" : "not validated"}</span>`).join(" ")}
              <span class="lvl ${a[0]}">📁 project: ${esc(a[1])}</span>${(rec.assess || []).some((x) => x.score != null) && !ax.length ? ` <span class="small muted">not in the assessment</span>` : ""}</div>
            ${compAdvice(c.avis, aV[base])}
            <div class="small muted">${esc(c.raison || "")}</div></div></div>`; }).join("") || `<p class="muted small">This brief has no competencies.</p>`}</div>
      </section>
      <section class="panel"><div class="panel-head"><h2>Comment</h2><span class="toolbar" style="margin:0"><button class="btn small" id="db-cp">Copy</button>${final ? "" : `<button class="btn small" id="db-rb" title="Write it again from the switches">↻ Rebuild</button>`}</span></div>
        <textarea id="db-c" style="min-height:300px" ${final ? "readonly" : ""}>${esc(r.feedback || "")}</textarea>
        <p class="muted small" id="db-cst">${final ? "" : "Written from your switches. Edit it freely: your text is kept."}</p></section>
      <section class="panel" id="db-level"></section>
      <section class="panel">${final ? `<h2>✅ Finalized</h2>
          <p class="small">On ${fmtDateTime(R.final_at)}${R.sent_at ? ` · comment sent by DM ${fmtAgo(R.sent_at)}` : ""}. The competencies and skills are on the student's record${rec.awarded ? ` (${Object.values(rec.awarded).reduce((s, x) => s + (x.pts || 0), 0)} pts, ${Object.values(rec.awarded).reduce((s, x) => s + (x.coins || 0), 0)} 🪙)` : ""}.</p>
          <button class="btn" id="db-reopen">Reopen</button>`
        : `<h2>Finalize</h2><p class="small muted">Records the competencies validated (and the others as “not yet”), the skills shown or missed in the code, and the mise en situation, on ${rec.squad ? "each member's" : "the student's"} record; gives the points and coins of the brief.</p>
          <label class="check"><input type="checkbox" id="db-dm"> Send the comment by Discord DM</label>
          <p class="toolbar" style="margin:12px 0 0"><button class="btn" id="db-save" title="Keep everything as it is now and come back later">💾 Save draft</button><button class="btn primary" id="db-fin">Finalize the debrief</button></p>`}</section>
    </aside></div>`;
  wireAssessLink(body);
  updateMeter();
  wireDebrief();
  renderSteps(final);
  if (typeof wDebriefExtras === "function") wDebriefExtras();
}

// Steps of the brief: the bot proposes from the repo at the step's date (files, commits), the teacher decides
const STEP_LBL = { a_temps: "On time", en_retard: "Late", non_fait: "Not validated", a_verifier: "To check", a_venir: "Not due yet" };
function renderSteps(final) {
  const box = $("#db-steps");
  if (!box) return;
  const { R, bid, who } = DB;
  const recs = R.stepRecs || {};
  box.innerHTML = `<h2>Steps</h2>
    <div class="db-rows">${R.steps.map((s) => { const r = recs[s.n] || {}, p = r.prop;
      return `<div class="db-step" data-step="${s.n}">
        <div><b>${esc(s.name)}</b> <span class="muted small">· due ${fmtDateTime(s.due)}</span>${s.expected ? `<div class="small muted">${esc(s.expected)}</div>` : ""}</div>
        <p class="small" style="margin:6px 0">${p ? `<b>Proposed: ${esc(STEP_LBL[p.statut] || p.statut)}</b>${p.raison ? ` · ${esc(p.raison)}` : ""}${p.before != null ? ` <span class="muted">· ${p.before} commits before, ${p.after} after</span>` : ""}` : ""}</p>
        ${final ? `<b>${esc(STEP_LBL[r.final] || "—")}</b>${r.note ? ` · ${esc(r.note)}` : ""}`
          : `<div class="toolbar" style="margin:0">${segHtml(`st${s.n}`, [["a_temps", "On time"], ["en_retard", "Late"], ["non_fait", "Not validated"]], r.final || "")}
            <button class="btn small" data-stcheck="${s.n}">${p ? "↻ Propose" : "Propose"}</button></div>
          <input type="text" data-stnote="${s.n}" value="${esc(r.note || "")}" placeholder="Note" style="width:100%;margin-top:8px">`}
      </div>`; }).join("")}</div>`;
  if (final) return;
  const save = async (n) => {
    const cur = $(`[data-seg="st${n}"] [aria-pressed="true"]`, box)?.dataset.v ?? "";
    const R2 = await api(`/briefs/${bid}/review/step`, { method: "POST", body: { who, n, final: cur, note: $(`[data-stnote="${n}"]`, box).value } });
    DB.R = { ...DB.R, stepRecs: R2.stepRecs };
    if (DB.R.review && $("#db-c")) saveStatesSoon();
  };
  for (const s of R.steps) {
    wireSeg(box, `st${s.n}`, (v) => {
      // a second click on the chosen result clears it
      const b = $(`[data-seg="st${s.n}"] [data-v="${v}"]`, box);
      if ((recs[s.n] || {}).final === v) b.setAttribute("aria-pressed", "false");
      save(s.n).catch((e) => toast(e.message, true));
    });
    $(`[data-stnote="${s.n}"]`, box).onchange = () => save(s.n).catch((e) => toast(e.message, true));
  }
  $$("[data-stcheck]", box).forEach((b) => b.onclick = () => busy(b, async () => {
    const n = Number(b.dataset.stcheck);
    toast("⏳ Reading the repo at the step's date…");
    const R2 = await api(`/briefs/${bid}/review/stepcheck`, { method: "POST", body: { who, n } });
    DB.R = { ...DB.R, stepRecs: R2.stepRecs };
    // nothing decided yet: the proposal becomes the choice (the teacher can change it)
    const st = R2.prop?.statut;
    if (!(DB.R.stepRecs[n] || {}).final && ["a_temps", "en_retard", "non_fait"].includes(st)) {
      const R3 = await api(`/briefs/${bid}/review/step`, { method: "POST", body: { who, n, final: st, note: (DB.R.stepRecs[n] || {}).note || "" } });
      DB.R = { ...DB.R, stepRecs: R3.stepRecs };
      if (DB.R.review && $("#db-c")) saveStatesSoon();
    }
    renderSteps(false);
  }));
}

function mesHtml(ch, mes, final, member = "") {
  const mk = member ? ` data-mm="${esc(member)}"` : "";
  if (!ch) return `<h2>Mise en situation</h2><p class="small muted">One small task, done in front of you on their own project, on a point of the brief drawn at random (${member ? "for this member" : "about 10 to 20 minutes"}).</p>
    ${final ? "" : `<button class="btn" data-draw${mk}>🎲 Draw a mise en situation</button>`}`;
  return `<div class="panel-head"><h2>Mise en situation</h2>${final ? "" : `<button class="btn small" data-draw${mk}>🎲 Draw another</button>`}</div>
    <p style="margin:0"><b>${esc(ch.titre)}</b> <span class="tag">${esc(ch.duree || "")}</span> <span class="tag">N${ch.niveau || 1}</span></p>
    <p>${esc(ch.consigne)}</p>
    ${(ch.observer || []).length ? `<p class="small" style="margin:0"><b>Check:</b></p><ul class="small">${ch.observer.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : ""}
    <p class="small muted">Point drawn: ${esc(ch.point || "")} (${ch.done ? "done in the project" : "not done in the project"})</p>
    ${member ? "" : `<label>Result</label>${final ? `<b>${esc(MES.find(([v]) => v === mes.r)?.[1] || "—")}</b>${mes.note ? ` · ${esc(mes.note)}` : ""}`
      : `${segHtml("mes", [["", "Not done yet"], ...MES], mes.r || "")}<input type="text" id="db-mn" value="${esc(mes.note || "")}" placeholder="What you saw (optional)" style="width:100%;margin-top:8px">`}`}`;
}

function squadMembersHtml(rec, st, final) {
  const comps = Object.keys(st.co);
  return `<section class="panel"><div class="panel-head"><h2>Squad members</h2>${final ? "" : `<button class="btn small primary" id="db-msave">Save members</button>`}</div>
    <p class="muted small" style="margin-top:0">The squad's work is judged above. Here, what each member did, and their own result: it's what goes on their record.</p>
    <div class="members">${(rec.contrib || []).map((m) => {
      const ms = rec.members?.[m.gid] || {};
      const co = ms.co || st.co;
      return `<article class="member" data-gid="${esc(m.gid)}">
        <header>${avatar(m.name || m.login, m.gid)} <b>${esc(m.name || m.login)}</b> ${m.sm ? `<span class="tag">SM</span>` : ""} <span class="muted small">${esc(m.login || "")}</span></header>
        <p class="small mstats"><span>${m.commits ?? 0} commits</span><span>${m.days ?? 0} days</span><span>${m.prs ?? 0} PRs (${m.merged ?? 0} merged)</span><span>${m.reviews ?? 0} reviews</span>${m.cards != null ? `<span>${m.cardsDone ?? 0}/${m.cards} cards done</span>` : ""}
          ${m.collaborator === false ? `<span class="lvl bad">not a collaborator</span>` : ""}${!m.commits ? `<span class="lvl bad">no commit</span>` : ""}</p>
        <div class="field-row"><div><label>Quiz / oral (%)</label><input type="number" min="0" max="100" data-q value="${ms.quiz ?? ""}" ${final ? "disabled" : ""}></div>
          <div><label>Mise en situation</label><select data-mr ${final ? "disabled" : ""}><option value="">—</option>${MES.map(([v, l]) => `<option value="${v}" ${ms.mes?.r === v ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
        <div class="db-rows" style="margin-top:8px">${comps.map((c) => `<div class="db-row">${sw(`data-mco="${esc(c)}"`, co[c], final)}<div>${compChip(c)} <span class="small">${esc(compName(c))}</span></div></div>`).join("")}</div>
        <label>Note</label><input type="text" data-mn value="${esc(ms.note || "")}" style="width:100%" ${final ? "disabled" : ""}>
        <div class="mch">${mesHtml(ms.ch, ms.mes || {}, final, m.gid)}</div>
        ${ms.comment ? `<details class="small"><summary>Their comment</summary><pre class="code-view" style="white-space:pre-wrap">${esc(ms.comment)}</pre></details>` : ""}
      </article>`;
    }).join("")}</div></section>`;
}

function currentStates() {
  const ck = {}, ex = [], co = {};
  $$("[data-ck]").forEach((c) => (ck[c.dataset.ck] = c.checked));
  $$("[data-ex]").forEach((c) => (ex[Number(c.dataset.ex)] = c.checked));
  $$("[data-exck]").forEach((c) => (ck[c.dataset.exck] = (ck[c.dataset.exck] ?? true) && c.checked));
  $$("[data-co]").forEach((c) => (co[c.dataset.co] = c.checked));
  const oral = $$("[data-or]").length ? $$("[data-or]").map((c) => c.checked) : undefined;
  return { ck, ex, co, mes: { r: segVal(document, "mes"), note: $("#db-mn")?.value ?? "" }, oral };
}
function updateMeter() {
  const ex = DB.R.review?.result?.exigences || [];
  const vals = $$("[data-ex]").map((c) => [ex[Number(c.dataset.ex)], c.checked]).filter(([e]) => e && e.type !== "bonus");
  const pct = vals.length ? Math.round((vals.filter(([, v]) => v).length / vals.length) * 100) : null;
  if ($("#db-meter")) $("#db-meter").innerHTML = meter(pct, "Requirements validated");
  if ($("#db-pct")) $("#db-pct").innerHTML = pct == null ? "" : `<b style="color:${masteryInk(pct)}">${pct}%</b> <span class="muted small">of the requirements · ${$$("[data-co]:checked").length}/${$$("[data-co]").length} competencies</span>`;
}
function saveStatesSoon() {
  updateMeter();
  clearTimeout(DB.timer);
  $("#db-cst").textContent = "Saving…";
  DB.timer = setTimeout(async () => {
    try {
      const keep = DB.commentEdited;
      const R = await api(`/briefs/${DB.bid}/review/states`, { method: "POST", body: { who: DB.who, states: { ...currentStates(), keepComment: keep, comment: keep ? $("#db-c").value : undefined } } });
      DB.R = { ...DB.R, ...R };
      if (!keep) $("#db-c").value = R.review?.result?.feedback ?? $("#db-c").value;
      $("#db-cst").textContent = keep ? "Saved · your edited comment is kept (↻ Rebuild to write it from the switches)" : "Saved · comment updated";
    } catch (e) { $("#db-cst").textContent = ""; toast(e.message, true); }
  }, 700);
}

function wireDebrief() {
  const { bid, who } = DB;
  $$("[data-ck], [data-ex], [data-co]").forEach((c) => c.onchange = saveStatesSoon);
  $$("[data-ck]").forEach((c) => c.addEventListener("change", () => {
    $$(`[data-exck="${CSS.escape(c.dataset.ck)}"]`).forEach((x) => { x.checked = c.checked; });
    updateMeter();
  }));
  wireSeg(document, "mes", saveStatesSoon);
  if ($("#db-mn")) $("#db-mn").onchange = saveStatesSoon;
  $("#db-cp").onclick = () => copyText($("#db-c").value, "Comment copied");
  const c = $("#db-c");
  c.oninput = () => { DB.commentEdited = true; $("#db-cst").textContent = "Edited · saved when you leave the box"; };
  c.onchange = () => api(`/briefs/${bid}/review/comment`, { method: "POST", body: { who, text: c.value } }).then(() => ($("#db-cst").textContent = "Your comment is saved")).catch((e) => toast(e.message, true));
  if ($("#db-rb")) $("#db-rb").onclick = (e) => busy(e.currentTarget, async () => {
    DB.commentEdited = false;
    const R = await api(`/briefs/${bid}/review/states`, { method: "POST", body: { who, states: currentStates() } });
    DB.R = { ...DB.R, ...R }; c.value = R.review?.result?.feedback ?? ""; $("#db-cst").textContent = "Written again from the switches";
  });
  $$("[data-draw]").forEach((b) => b.onclick = () => busy(b, async () => {
    toast("⏳ The AI picks a point and writes the task…");
    const R = await api(`/briefs/${bid}/review/challenge`, { method: "POST", body: { who, states: currentStates(), member: b.dataset.mm || "" } });
    DB.R = { ...DB.R, ...R }; renderDebrief();
  }));
  const saveMembers = async () => {
    const members = Object.fromEntries($$(".member").map((m) => [m.dataset.gid, {
      quiz: $("[data-q]", m).value, mes: { r: $("[data-mr]", m).value, note: "" }, note: $("[data-mn]", m).value,
      co: Object.fromEntries($$("[data-mco]", m).map((x) => [x.dataset.mco, x.checked])) }]));
    const R = await api(`/briefs/${bid}/review/members`, { method: "POST", body: { who, members } });
    DB.R = { ...DB.R, ...R };
  };
  if ($("#db-msave")) $("#db-msave").onclick = (e) => busy(e.currentTarget, async () => { await saveMembers(); toast("Members saved"); renderDebrief(); });
  // everything as it is now (switches, mise en situation, oral questions, your comment), right away: a draft to finish later
  if ($("#db-save")) $("#db-save").onclick = (e) => busy(e.currentTarget, async () => {
    clearTimeout(DB.timer);
    const keep = DB.commentEdited;
    const R = await api(`/briefs/${bid}/review/states`, { method: "POST", body: { who, states: { ...currentStates(), keepComment: keep, comment: keep ? c.value : undefined } } });
    DB.R = { ...DB.R, ...R };
    if (!keep) c.value = R.review?.result?.feedback ?? c.value;
    $("#db-cst").textContent = "Draft saved";
    toast("Draft saved · finalize it when you're ready");
  });
  if ($("#db-fin")) $("#db-fin").onclick = (e) => busy(e.currentTarget, async () => {
    if ($(".member")) await saveMembers();
    const R = await api(`/briefs/${bid}/review/finalize`, { method: "POST", body: { who, states: currentStates(), comment: DB.commentEdited ? c.value : "", notify: $("#db-dm").checked } });
    const aw = Object.values(R.awarded || {});
    toast(`Finalized: recorded for ${R.students} student(s)${aw.length ? ` · +${aw.reduce((s, x) => s + (x.pts || 0), 0)} pts` : ""}${R.sent ? " · comment sent" : ""}`);
    DB.R = { ...DB.R, ...R };
    DB.B = await api(`/briefs/${bid}`);
    renderDebrief();
  });
  if ($("#db-reopen")) $("#db-reopen").onclick = () => confirmDialog("Reopen this debrief?", "Its competencies, skills, points and coins are taken back from the record until you finalize it again.", "Reopen", async () => {
    const R = await api(`/briefs/${bid}/review/reopen`, { method: "POST", body: { who } });
    DB.R = { ...DB.R, ...R }; DB.B = await api(`/briefs/${bid}`); renderDebrief();
  });
}

/** Read the repo, run the checks, ask the AI (the handed-in repo when there's no other one given). */
async function analyzeRun(repo, saveHandin = false) {
  if ($("#db-wait")) return;
  $$("#db-an, #db-an2").forEach((b) => { b.disabled = true; });
  view.querySelector("#db-body").insertAdjacentHTML("afterbegin", `<div class="notice" id="db-wait">⏳ Reading ${esc(repo || debriefTarget().handin?.repo || "the repo")}, running the checks and asking the AI… (up to a minute)</div>`);
  try {
    const R = await api(`/briefs/${DB.bid}/review/analyze`, { method: "POST", body: { who: DB.who, repo: repo || undefined, saveHandin } });
    DB.R = R; DB.commentEdited = false;
    DB.B = await api(`/briefs/${DB.bid}`);
    toast(R.msg || "Analyzed");
    renderDebrief();
  } catch (e) { $("#db-wait")?.remove(); $$("#db-an, #db-an2").forEach((b) => { b.disabled = false; }); toast(e.message, true); }
}
/** "Analyze the work": the repo handed in, straight away; nothing handed in: pick the repo first. */
function analyzeWork() {
  if (debriefTarget().handin) analyzeRun();
  else analyzeDialog();
}
function analyzeDialog() {
  const T = debriefTarget();
  const run = analyzeRun;
  openDialog(`Analyze the work · ${T.name}`, `
    <p class="muted small" style="margin-top:12px">${T.handin ? `Handed in: <b>${esc(T.handin.repo)}</b>. Pick another repo to analyze instead of it.` : `Nothing was handed in. Pick the repo to debrief${DB.B.repo_hint ? ` (the brief's repos are named like <code>${esc(DB.B.repo_hint)}</code>)` : ""}.`}</p>
    <input type="search" id="an-q" placeholder="Filter the repos…" style="width:100%;margin-bottom:8px">
    <div class="repo-pick" id="an-list"><p class="muted small">⏳ Loading ${T.squad ? "the squad's" : "their"} GitHub repos…</p></div>
    <details class="small" style="margin-top:10px"><summary>Another repo (link or owner/repo)</summary><input type="text" id="an-r" style="width:100%;margin-top:6px" placeholder="https://github.com/owner/repo"></details>
    <label class="check" style="margin-top:10px"><input type="checkbox" id="an-save" ${T.handin ? "" : "checked"}> Record it as ${T.squad ? "the squad's" : "their"} hand-in</label>`,
    [{ label: "🔍 Analyze", primary: true, action: async () => {
      const typed = $("#an-r", dlg).value.trim();
      const picked = $("input[name=an-repo]:checked", dlg)?.value || "";
      const repo = typed || picked;
      const save = $("#an-save", dlg).checked;
      if (!repo && !T.handin) throw new Error("Pick a repo");
      dlg.close();
      await run(repo, save && !!repo && repo !== T.handin?.repo);
    } }]);
  const box = dlg;
  api(`/briefs/${DB.bid}/review/repos?who=${encodeURIComponent(DB.who)}`).then((r) => {
    const list = $("#an-list", box);
    if (!list) return;
    const draw = () => {
      const q = ($("#an-q", box).value || "").trim().toLowerCase();
      const items = r.repos.filter((x) => !q || x.repo.toLowerCase().includes(q) || x.description.toLowerCase().includes(q));
      const cur = $("input[name=an-repo]:checked", box)?.value || (r.repos[0]?.repo ?? "");
      list.innerHTML = items.map((x) => `<label class="repo-opt ${x.hidden ? "dim" : ""}">
        <input type="radio" name="an-repo" value="${esc(x.repo)}" ${x.repo === cur ? "checked" : ""}>
        <div><div class="repo-name"><b>${esc(x.repo)}</b> <a href="https://github.com/${esc(x.repo)}" target="_blank" rel="noopener" title="Open on GitHub" onclick="event.stopPropagation()">↗</a></div>
          <div class="repo-tags">${x.handin ? `<span class="tag ok">handed in</span>` : ""}${x.activity ? `<span class="tag ok">${x.activity} commit(s) during the brief</span>` : x.during ? `<span class="tag lang">pushed during the brief</span>` : ""}${x.language ? `<span class="tag">${esc(x.language)}</span>` : ""}${x.private ? `<span class="tag">private</span>` : ""}${x.hidden ? `<span class="tag">ignored repo</span>` : ""}${x.by.length > 1 ? `<span class="tag">${x.by.map(esc).join(", ")}</span>` : ""}</div>
          ${x.description ? `<div class="small muted">${esc(x.description)}</div>` : ""}</div>
        <span class="small muted repo-when">${x.pushed ? `pushed ${fmtAgo(x.pushed)}` : ""}</span></label>`).join("")
        || `<p class="muted small">${r.repos.length ? "No repo matches." : "No repo found: the GitHub App can't see any repo for them. They may need to give it access to all their repos (/github in Discord)."}</p>`;
    };
    draw();
    $("#an-q", box).oninput = draw;
    if (r.missing?.length) list.insertAdjacentHTML("beforebegin", `<p class="small" style="color:var(--warn)">Not connected to GitHub: ${r.missing.map(esc).join(", ")} (/github in Discord).</p>`);
  }).catch((e) => { const list = $("#an-list", box); if (list) list.innerHTML = `<p class="small" style="color:var(--down)">${esc(e.message)}</p><p class="muted small">Type the repo below instead.</p>`; });
}

// ================================================================= ASSESSMENTS
const QTYPE = { code: "Write code", explain: "Explain", mcq: "Multiple choice" };
const LOCK = { fullscreen: "left full screen", hidden: "switched tab or app", blur: "left the window", reload: "reloaded the page", paste: "pasted" };
const CODE_LANGS = ["javascript", "php", "python", "java", "c", "cpp", "sql", "html", "css", "typescript", "text"];

/** Another teacher shared an assessment: paste the link, see what's in it, get a draft copy in this class. */
function importAssessmentDialog() {
  let previewed = "";
  openDialog("🔗 Import an assessment from a link", `
    <p class="small muted" style="margin-top:0">A teacher clicked <b>Share</b> on one of their assessments and sent you the link. You get a <b>draft copy</b> in this class: change anything, then invite your students. Their students' papers are never shared.</p>
    <label for="im-url">Link</label><input type="url" id="im-url" placeholder="https://…/share/assessment/12.Ab3…" style="width:100%">
    <div id="im-prev"></div>`,
  [{ label: "Preview", primary: true, action: async () => {
    const url = $("#im-url", dlg).value.trim();
    if (previewed && previewed === url) {
      const r = await api("/assessments/import", { method: "POST", body: { url, import: true } });
      dlg.close(); toast("Imported as a draft ✅"); location.hash = `#/assessment/${r.id}`; return;
    }
    const r = await api("/assessments/import", { method: "POST", body: { url } });
    const p = r.preview;
    previewed = url;
    $("#im-prev", dlg).innerHTML = `<div class="imp-card"><b>${esc(p.title)}</b>${p.from ? ` <span class="small muted">· from ${esc(p.from)}</span>` : ""}
      <p class="small" style="margin:6px 0">${p.n} questions (${[p.code && `${p.code} code`, p.explain && `${p.explain} explain`, p.mcq && `${p.mcq} multiple choice`].filter(Boolean).join(", ")}) · ${p.points} points${p.minutes ? ` · ${p.minutes} min` : ""}</p>
      ${p.comps.length ? `<div>${p.comps.map((c) => compChip(c)).join("")}</div>` : ""}
      <ol class="small muted">${p.prompts.map((x) => `<li>${esc(x)}</li>`).join("")}${p.n > p.prompts.length ? "<li>…</li>" : ""}</ol></div>`;
    $(".dlg-foot .btn.primary", dlg).textContent = "Import as a draft";
    return;
  } }]);
  $("#im-url", dlg).oninput = () => { previewed = ""; const b = $(".dlg-foot .btn.primary", dlg); if (b) b.textContent = "Preview"; };
}

/** Share: a link for other teachers (questions only). */
async function shareAssessmentDialog(id) {
  const r = await api(`/assessments/${id}/share`);
  openDialog("🔗 Share with other teachers", `
    <p class="small" style="margin-top:0">Send this link to other teachers. In their ClassBot (yours or their own) they open <b>Assessments → Import from a link</b> and get a copy of the questions, with their competencies and skills. Your students' papers and results are never shared.</p>
    <div class="url-list"><div><b>Link</b><code id="sh-url">${esc(r.url)}</code><button class="btn small" id="sh-copy">Copy</button></div></div>
    <p class="small muted">Opened in a browser, it shows the title and the questions' first lines. Shared it with the wrong person? Make a new link: the old one stops working.</p>`,
  [{ label: "New link (the old one stops working)", action: async () => { const n = await api(`/assessments/${id}/share`, { method: "DELETE", confirmed: true }); $("#sh-url", dlg).textContent = n.url; toast("New link: the old one doesn't work anymore"); } },
   { label: "Done", primary: true, action: async () => dlg.close() }]);
  $("#sh-copy", dlg).onclick = () => copyText($("#sh-url", dlg).textContent, "Link copied");
}

async function viewAssessments() {
  const r = await api("/assessments");
  const locked = r.items.reduce((s, a) => s + (a.status === "open" ? a.locked : 0), 0);
  view.innerHTML = `
    <div class="page-head"><div><h1>Assessments</h1><p class="sub">Web tests in full screen: each student gets their own link, questions in their own order. Leaving full screen stops them until you let them back in. Results go to their competencies and skills.</p></div>
      <div class="toolbar" style="margin:0"><button class="btn" id="as-imp">🔗 Import from a link</button><button class="btn" id="as-blank">Blank assessment</button><button class="btn primary" id="as-gen">✨ Generate with AI</button></div></div>
    <div class="figures cs-figs">
      <div class="figure"><span class="ico">📝</span><div><b>${r.items.filter((a) => a.status === "open").length}</b><span>open now</span></div></div>
      <div class="figure ${locked ? "cs-attn" : ""}"><span class="ico">⛔</span><div><b>${locked}</b><span>student(s) stopped, waiting for you</span></div></div>
      <div class="figure"><span class="ico">✅</span><div><b>${r.items.reduce((s, a) => s + a.done, 0)}</b><span>papers handed in</span></div></div>
    </div>
    <section class="panel">${table([
      { label: "Assessment", sort: "title", html: (a) => `<b>${esc(a.title)}</b>${a.brief_id ? ` <span class="tag">brief</span>` : ""}` },
      { label: "Status", sort: "status", html: (a) => status(a.status === "open" ? "active" : a.status, STATUS[a.status] || a.status) },
      { label: "Questions", num: true, sort: "n", html: (a) => `${a.n}` },
      { label: "Done", num: true, html: (a) => `${a.done}/${a.takers}${a.locked ? ` <span class="pill-inline">${a.locked} stopped</span>` : ""}` },
      { label: "Average", num: true, sort: "avg", html: (a) => (a.avg == null ? "—" : `<b style="color:${masteryInk(a.avg)}">${a.avg}%</b>`) },
      { label: "Created", sort: "created_at", html: (a) => `<span class="small">${fmtDate(a.created_at)}</span>` },
    ], r.items, { onRow: (a) => (location.hash = `#/assessment/${a.id}`), empty: "No assessment yet." })}</section>`;
  $("#as-gen").onclick = () => generateQuestionsDialog(null);
  $("#as-imp").onclick = () => importAssessmentDialog();
  $("#as-blank").onclick = (e) => busy(e.currentTarget, async () => {
    const a = await api("/assessments", { method: "POST", body: { title: "New assessment", questions: [], settings: { minutes: 45 } } });
    location.hash = `#/assessment/${a.assessment.id}`;
  });
}

/** AI questions: a new assessment (onDone null) or more questions for the one being edited. */
const lastTechs = () => { try { const v = JSON.parse(localStorage.getItem("classbot.techs") || "null"); return Array.isArray(v) && v.length ? v : ["HTML", "CSS"]; } catch { return ["HTML", "CSS"]; } };
async function generateQuestionsDialog(onDone, preset = null) {
  const [br, students] = await Promise.all([api("/briefs"), loadStudents(), loadRef()]);
  openDialog(onDone ? "✨ Add questions with AI" : "✨ New assessment with AI", `
    <label for="gq-t">Topic</label><input type="text" id="gq-t" style="width:100%" value="${esc(preset?.title || "")}" placeholder="e.g. Flexbox and responsive design, PHP sessions, SQL joins">
    <label>Technologies to assess <span class="muted">(one or more: the questions use these and nothing else)</span></label>
    ${tagSelect("gq-tech", TECH_OPTIONS, lastTechs(), { allowNew: true, placeholder: "Type: HTML, CSS, PHP, SQL, Laravel…" })}
    <div class="field-row">
      <div><label for="gq-b">From a brief <span class="muted">(optional)</span></label><select id="gq-b"><option value="">—</option>${br.items.map((b) => `<option value="${b.id}" ${String(b.id) === String(preset?.brief || "") ? "selected" : ""}>${esc(b.title)}</option>`).join("")}</select></div>
      <div><label for="gq-s">For one student <span class="muted">(their weak points)</span></label><select id="gq-s"><option value="">—</option>${students.map((s) => `<option value="${s.discord_id}">${esc(s.name || s.discord_id)}</option>`).join("")}</select></div>
    </div>
    <div class="field-row">
      <div><label for="gq-n">Questions</label><input type="number" id="gq-n" min="1" max="30" value="10"></div>
      <div><label for="gq-l">Level</label><select id="gq-l">${LV_NAMES.map((l, i) => `<option value="${i + 1}">N${i + 1} · ${l}</option>`).join("")}</select></div>

      <div><label for="gq-lang">Language</label><select id="gq-lang"><option value="fr">Français</option><option value="en">English</option></select></div>
    </div>
    <label>Mix <span class="muted">(%)</span></label>
    <div class="field-row"><div><label class="small">Write code</label><input type="number" id="gq-mc" value="50" min="0" max="100"></div>
      <div><label class="small">Explain</label><input type="number" id="gq-me" value="20" min="0" max="100"></div>
      <div><label class="small">Multiple choice</label><input type="number" id="gq-mm" value="30" min="0" max="100"></div></div>
    <p class="small" id="gq-st"></p>`,
    [{ label: "Generate", primary: true, action: async () => {
      $("#gq-st").textContent = "⏳ Writing the questions (up to a minute)…";
      const body = { topic: $("#gq-t").value, brief_id: $("#gq-b").value || null, for_student: $("#gq-s").value || null, count: $("#gq-n").value, level: $("#gq-l").value,
        techs: tagValues(dlg, "gq-tech"), codeLang: (tagValues(dlg, "gq-tech")[0] || "javascript").toLowerCase(), lang: $("#gq-lang").value, mix: { code: $("#gq-mc").value, explain: $("#gq-me").value, mcq: $("#gq-mm").value } };
      if (!body.techs.length) throw new Error("Pick at least one technology to assess.");
      try { localStorage.setItem("classbot.techs", JSON.stringify(body.techs)); } catch { /* private window */ }
      const r = await api("/assessments/generate", { method: "POST", body }).catch((e) => { $("#gq-st").textContent = ""; throw e; });
      if (onDone) { dlg.close(); onDone(r.questions); return; }
      const title = body.topic || br.items.find((b) => String(b.id) === body.brief_id)?.title || "Assessment";
      const a = await api("/assessments", { method: "POST", body: { title, brief_id: body.brief_id, questions: r.questions, settings: { minutes: 45, lang: body.lang, codeLang: body.codeLang, target: body.for_student ? [body.for_student] : [] } } });
      dlg.close(); toast(`${r.questions.length} questions written: check them`); location.hash = `#/assessment/${a.assessment.id}`;
    } }]);
  dlg.classList.add("wide");
  wireTags(dlg);
}

let AS = null;
async function viewAssessment(arg, keepTab = null) {
  // #/assessment/12~<student id>: straight to that student's paper (from a debrief)
  const [id, who] = String(arg).split("~");
  const [A, BR] = await Promise.all([api(`/assessments/${id}`), api("/briefs").catch(() => ({ items: [] })), loadSkillDefs(), loadRef()]);
  const paper = who ? A.takers.find((t) => String(t.discord_id) === who) : null;
  const handed = paper && ["submitted", "graded"].includes(paper.status);
  AS = { briefs: BR.items || [], A, tab: keepTab || (handed ? "results" : who && A.takers.length ? "live" : AS?.A?.assessment.id === A.assessment.id ? AS.tab : A.takers.length ? "live" : "questions"), dirty: false, links: AS?.links };
  renderAssessment();
  if (handed) paperDialog(paper);
  else if (who) toast(paper ? `${paper.name || "This student"} hasn't handed it in yet` : "This student wasn't invited to this assessment", true);
}
function renderAssessment() {
  const { A } = AS, a = A.assessment;
  const locked = A.takers.filter((t) => t.status === "locked" && !t.resume_ok).length;
  view.innerHTML = `
    <div class="page-head"><div><p class="crumb"><a href="#/assessments">Assessments</a></p><h1>${esc(a.title)}</h1>
      <p class="sub">${status(a.status === "open" ? "active" : a.status, STATUS[a.status] || a.status)} · ${a.questions.length} question(s) · ${a.settings.minutes ? `${a.settings.minutes} min` : "no time limit"}${a.closes_at ? ` · closes ${fmtDateTime(a.closes_at)}` : ""}</p></div>
      <div class="toolbar" style="margin:0">
        <button class="btn primary" id="aa-inv">${A.takers.length ? "Invite more" : "Invite students"}</button>
        ${a.status === "open" ? `<button class="btn" id="aa-close">Close</button>` : a.status === "closed" ? `<button class="btn" id="aa-open">Reopen</button>` : ""}
        <button class="btn" id="aa-share">🔗 Share</button>
        <button class="btn danger" id="aa-del">Delete</button></div></div>
    <div class="tabs" role="tablist">
      <button role="tab" data-at="questions">Questions (${a.questions.length})</button>
      <button role="tab" data-at="live">Live${locked ? ` <span class="pill">${locked}</span>` : ` (${A.takers.length})`}</button>
      <button role="tab" data-at="results">Results (${A.takers.filter((t) => ["submitted", "graded"].includes(t.status)).length})</button>
    </div>
    <div id="aa-tab"></div>`;
  const tabs = { questions: assessQuestionsTab, live: assessLiveTab, results: assessResultsTab };
  const show = (k) => {
    if (AS.dirty && k !== AS.tab && !confirm("Leave without saving your changes?")) return;
    if (k !== AS.tab) AS.dirty = false;
    AS.tab = k; clearInterval(learnTimer); learnTimer = null;
    $$("[data-at]").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.at === k)));
    tabs[k]($("#aa-tab"));
  };
  $$("[data-at]").forEach((x) => x.onclick = () => show(x.dataset.at));
  show(AS.tab);
  $("#aa-inv").onclick = () => inviteDialog();
  $("#aa-share").onclick = () => shareAssessmentDialog(a.id);
  if ($("#aa-close")) $("#aa-close").onclick = () => confirmDialog("Close this assessment?", "Students still working are handed in automatically within a minute.", "Close", async () => { AS.A = await api(`/assessments/${a.id}/close`, { method: "POST", body: {} }); renderAssessment(); });
  if ($("#aa-open")) $("#aa-open").onclick = (e) => busy(e.currentTarget, async () => { AS.A = await api(`/assessments/${a.id}/reopen`, { method: "POST", body: {} }); toast("Open again for 24 h"); renderAssessment(); });
  $("#aa-del").onclick = () => confirmDialog("Delete this assessment?", "The papers are deleted too. Results already sent to the record stay.", "Delete", async () => { await api(`/assessments/${a.id}`, { method: "DELETE" }); location.hash = "#/assessments"; }, true);
}

function assessQuestionsTab(root) {
  const { A } = AS, a = A.assessment, s = a.settings;
  const locked = a.status !== "draft";
  root.innerHTML = `<section class="panel"><h2>Settings</h2>
      <div class="field-row">
        <div style="grid-column:span 2"><label>Title</label><input type="text" id="aq-title" value="${esc(a.title)}"></div>
        <div><label>Time (minutes, 0 = none)</label><input type="number" id="aq-min" min="0" max="300" value="${s.minutes}"></div>
        <div><label>Page language</label><select id="aq-lang"><option value="fr" ${s.lang === "fr" ? "selected" : ""}>Français</option><option value="en" ${s.lang === "en" ? "selected" : ""}>English</option></select></div>
        <div><label>Passed at (%)</label><input type="number" id="aq-pass" min="1" max="100" value="${s.passAt}"></div>
        <div><label>Points for 100%</label><input type="number" id="aq-pts" min="0" max="200" value="${s.points}"></div>
      </div>
      <label for="aq-brief">Linked brief <span class="muted">(its results count in that brief's debrief: competencies and comment)</span></label>
      <select id="aq-brief" style="max-width:560px"><option value="">— none —</option>${(AS.briefs || []).map((b) => `<option value="${b.id}" ${b.id === a.brief_id ? "selected" : ""}>${esc(b.title)}${b.status === "assigned" ? "" : ` (${esc(b.status)})`}</option>`).join("")}</select>
      <label class="check"><input type="checkbox" id="aq-show" ${s.showResults ? "checked" : ""}> Students get their score and the corrections by DM when you send the results</label>
    </section>
    ${locked ? `<div class="notice" style="margin-top:16px">Students already have it: you can fix the wording and the expected answers, not add or remove questions.</div>` : ""}
    <div id="aq-list" class="qe-list"></div>
    ${locked ? "" : `<p class="toolbar" style="margin-top:14px"><button class="btn" data-addq="code">+ Write code</button><button class="btn" data-addq="explain">+ Explain</button><button class="btn" data-addq="mcq">+ Multiple choice</button><button class="btn" id="aq-ai">✨ Add with AI</button></p>`}
    ${saveBarHtml("aq-save")}`;
  let Q = JSON.parse(JSON.stringify(a.questions));
  const draw = () => {
    $("#aq-list").innerHTML = Q.map((q, i) => questionCard(q, i, Q.length, locked)).join("") || `<p class="empty">No question yet.</p>`;
    $$(".qe", root).forEach((card) => {
      const i = Number(card.dataset.i);
      $("[data-qt]", card).onchange = (e) => { Q = readQuestions(); Q[i].type = e.target.value; if (Q[i].type === "mcq" && !Q[i].choices?.length) { Q[i].choices = ["", ""]; Q[i].answer = [0]; } draw(); mark(); };
      $$("[data-mv]", card).forEach((b) => b.onclick = () => { Q = readQuestions(); const j = i + Number(b.dataset.mv); [Q[i], Q[j]] = [Q[j], Q[i]]; draw(); mark(); });
      if ($("[data-qdel]", card)) $("[data-qdel]", card).onclick = () => { Q = readQuestions(); Q.splice(i, 1); draw(); mark(); };
      if ($("[data-addc]", card)) $("[data-addc]", card).onclick = () => { Q = readQuestions(); Q[i].choices = [...(Q[i].choices || []), ""]; draw(); mark(); };
      $$("[data-cdel]", card).forEach((b) => b.onclick = () => { Q = readQuestions(); const k = Number(b.dataset.cdel); Q[i].choices.splice(k, 1); Q[i].answer = (Q[i].answer || []).filter((x) => x !== k).map((x) => (x > k ? x - 1 : x)); draw(); mark(); });
      wireTags(card, mark);
      $("[data-addcomp]", card).onclick = (e) => { e.currentTarget.insertAdjacentHTML("beforebegin", compRow({ code: "", level: 1 }, REF?.referential || [])); wireComps(card); mark(); };
      wireComps(card);
    });
  };
  const mark = () => { AS.dirty = true; $("#aq-save-bar").classList.add("dirty"); $("#aq-save-st").textContent = "Unsaved changes"; };
  root.addEventListener("input", mark);
  draw();
  $$("[data-addq]", root).forEach((b) => b.onclick = () => { Q = readQuestions(); Q.push(b.dataset.addq === "mcq" ? { type: "mcq", prompt: "", choices: ["", "", "", ""], answer: [0], points: 1, skills: [] } : { type: b.dataset.addq, prompt: "", points: 2, skills: [], lang: s.codeLang }); draw(); mark(); $$(".qe", root).pop()?.scrollIntoView({ block: "center" }); });
  if ($("#aq-ai")) $("#aq-ai").onclick = () => generateQuestionsDialog((qs) => { Q = [...readQuestions(), ...qs]; draw(); mark(); toast(`${qs.length} questions added: save to keep them`); });
  $("#aq-save").onclick = (e) => busy(e.currentTarget, async () => {
    const qs = readQuestions();
    const bad = qs.findIndex((q) => q.prompt.trim().length < 5 || (q.type === "mcq" && (q.choices.filter(Boolean).length < 2 || !q.answer.length)));
    if (bad >= 0) throw new Error(`Question ${bad + 1}: write the question${qs[bad].type === "mcq" ? ", at least 2 choices and tick the right one(s)" : ""}.`);
    AS.A = await api(`/assessments/${a.id}`, { method: "PUT", body: { title: $("#aq-title").value, brief_id: $("#aq-brief").value || null, questions: qs,
      settings: { minutes: $("#aq-min").value, lang: $("#aq-lang").value, codeLang: s.codeLang, passAt: $("#aq-pass").value, points: $("#aq-pts").value, showResults: $("#aq-show").checked } } });
    AS.dirty = false; toast("Saved"); renderAssessment();
  });
}

function wireComps(card) { $$("[data-delcomp]", card).forEach((b) => b.onclick = () => { b.closest(".qe-comp").remove(); AS.dirty = true; }); }
function questionCard(q, i, n, locked) {
  const ref = REF?.referential || [];
  const skills = S.skillDefs || [];
  return `<article class="qe panel" data-i="${i}" data-id="${esc(q.id || "")}">
    <header><b>Q${i + 1}</b>
      <select data-qt ${locked ? "disabled" : ""}>${Object.entries(QTYPE).map(([k, l]) => `<option value="${k}" ${q.type === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <label class="small qe-pts">Points <input type="number" data-qp min="1" max="20" value="${q.points || 1}"></label>
      <span class="qe-act">${i > 0 ? `<button class="btn small" data-mv="-1" title="Move up">↑</button>` : ""}${i < n - 1 ? `<button class="btn small" data-mv="1" title="Move down">↓</button>` : ""}${locked ? "" : `<button class="btn small danger" data-qdel>Remove</button>`}</span></header>
    <textarea data-qprompt placeholder="The question or the task" style="min-height:70px">${esc(q.prompt)}</textarea>
    <details ${q.code ? "open" : ""}><summary class="small">Code shown with the question</summary><textarea data-qcode class="code" style="min-height:90px" spellcheck="false">${esc(q.code || "")}</textarea></details>
    ${q.type === "code" ? `<div class="field-row"><div><label class="small">Language</label><select data-qlang>${CODE_LANGS.map((l) => `<option ${l === (q.lang || "javascript") ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
      <label class="small">Starter code <span class="muted">(optional)</span></label><textarea data-qstart class="code" style="min-height:70px" spellcheck="false">${esc(q.starter || "")}</textarea>` : ""}
    ${q.type === "mcq" ? `<label class="small">Choices <span class="muted">(tick the right ones)</span></label><div class="qe-choices">${(q.choices || []).map((c, k) => `<div class="qe-choice">
        <input type="checkbox" data-cok ${(q.answer || []).includes(k) ? "checked" : ""} aria-label="Right answer"><input type="text" data-ctext value="${esc(c)}" style="flex:1">${locked ? "" : `<button class="btn small" data-cdel="${k}" title="Remove">×</button>`}</div>`).join("")}</div>
      ${locked ? "" : `<button class="btn small" data-addc type="button">+ Choice</button>`}`
      : `<label class="small">Expected answer / key points <span class="muted">(never shown; the AI grades with it)</span></label><textarea data-qexp ${q.type === "code" ? 'class="code"' : ""} style="min-height:80px">${esc(q.expected || "")}</textarea>`}
    <div class="qe-meta">
      <div class="small qe-skills"><span class="muted">Skills</span> ${tagSelect(`sk-${i}`, skillOptions(), q.skills || [], { max: 3, placeholder: "Search a skill…" })}</div>
      <div class="small qe-comps"><span class="muted">Competencies</span> ${(q.comps?.length ? q.comps : q.comp ? [{ code: q.comp, level: q.level || 1 }] : []).map((c) => compRow(c, ref)).join("")}
        <button type="button" class="btn small" data-addcomp>+ Competency</button></div>
    </div></article>`;
}
const skillChip = (k) => { const sk = (S.skillDefs || []).find((x) => x.key === k); return `<button type="button" class="chip" data-sk="${esc(k)}" aria-pressed="true" title="Click to remove">${esc(sk ? `${sk.emoji} ${sk.en}` : k)} ×</button>`; };
/** A question's competency row. A code that isn't in this class's programme stays selectable (and saved). */
const compRow = (c, ref) => { if (typeof c === "string") { const p = parseC(c); c = p ? { code: p.code, level: p.level || 1 } : { code: "", level: 1 }; }
  const known = !c.code || ref.some((r) => r.code === c.code);
  return `<span class="qe-comp"><select data-qcomp><option value="">—</option>${known ? "" : `<option value="${esc(c.code)}" selected>${esc(cLabel(c.code))} · (not in this programme)</option>`}${ref.map((r) => `<option value="${r.code}" ${c.code === r.code ? "selected" : ""}>${esc(r.label)} · ${esc(r.name.slice(0, 50))}</option>`).join("")}</select>
  <select data-qlvl>${LV_NAMES.map((l, k) => `<option value="${k + 1}" ${(c.level || 1) === k + 1 ? "selected" : ""}>N${k + 1}</option>`).join("")}</select><button type="button" class="btn small" data-delcomp title="Remove">×</button></span>`; };
function readQuestions() {
  return $$(".qe").map((card) => {
    const type = $("[data-qt]", card).value;
    const q = { type, prompt: $("[data-qprompt]", card).value, points: Number($("[data-qp]", card).value) || 1, code: $("[data-qcode]", card).value,
      skills: tagValues(card, `sk-${card.dataset.i}`).slice(0, 3) };
    if (card.dataset.id) q.id = card.dataset.id;
    q.comps = $$(".qe-comp", card).map((r) => [$("[data-qcomp]", r).value, $("[data-qlvl]", r).value]).filter(([c]) => c).map(([c, l]) => `${c}N${l}`);
    if (type === "code") { q.lang = $("[data-qlang]", card)?.value || "javascript"; q.starter = $("[data-qstart]", card)?.value || ""; }
    if (type !== "mcq") q.expected = $("[data-qexp]", card)?.value ?? "";
    if (type === "mcq") {
      const rows = $$(".qe-choice", card).map((r) => [$("[data-ctext]", r).value.trim(), $("[data-cok]", r).checked]);
      q.choices = rows.map((r) => r[0]);
      q.answer = rows.map((r, k) => (r[1] ? k : -1)).filter((k) => k >= 0);
    }
    return q;
  });
}

async function inviteDialog() {
  const { A } = AS, a = A.assessment;
  const invited = new Set(A.takers.map((t) => t.discord_id));
  openDialog("Invite students", `
    <p class="muted small" style="margin-top:12px">Each student gets their own link by Discord DM. The page opens in full screen; if they leave it, they're stopped until you let them back in.</p>
    ${segHtml("who", [["some", "Chosen students"], ["all", "The whole class"]], "some")}
    <div id="iv-list" class="iv-list">${A.students.map((s) => `<label class="check small"><input type="checkbox" value="${s.discord_id}" ${invited.has(s.discord_id) ? "checked disabled" : (a.settings.target || []).includes(s.discord_id) ? "checked" : ""}> ${esc(s.name || s.discord_id)}${invited.has(s.discord_id) ? ` <span class="muted">(invited)</span>` : ""}</label>`).join("")}</div>
    <p class="muted small" id="iv-all" hidden>Every student of the class gets a link (${A.students.length - invited.size} new).</p>
    ${a.closes_at ? "" : `<label for="iv-d">Open for (days)</label><input type="number" id="iv-d" value="7" min="1" max="60" style="width:100px">`}
    <label class="check"><input type="checkbox" id="iv-dm" checked> Send the links by DM now</label>`,
    [{ label: "Invite", primary: true, action: async () => {
      const mode = segVal(dlg, "who");
      const students = mode === "all" ? "all" : $$("#iv-list input:checked:not(:disabled)").map((c) => c.value);
      if (mode === "some" && !students.length) throw new Error("Tick at least one student.");
      AS.A = await api(`/assessments/${a.id}/invite`, { method: "POST", body: { students, days: $("#iv-d")?.value, send: $("#iv-dm").checked } });
      dlg.close(); toast("Invited"); AS.tab = "live"; renderAssessment();
    } }]);
  wireSeg(dlg, "who", (v) => { $("#iv-list").hidden = v !== "some"; $("#iv-all").hidden = v === "some"; });
}

function assessLiveTab(root) {
  const { A } = AS, a = A.assessment, n = a.questions.length;
  const nowS = Date.now() / 1000;
  const left = (t) => (t.deadline && t.status === "active" ? `${Math.max(0, Math.round((t.deadline - nowS) / 60))} min left` : "");
  const lastEv = (t) => { const e = t.events[t.events.length - 1]; return e ? `${esc(LOCK[e[1]] || e[1])} · ${fmtAgo(e[0])}` : ""; };
  root.innerHTML = `<section class="panel">
    <div class="panel-head"><h2>Students <span class="muted">${A.takers.length} invited</span></h2><span class="toolbar" style="margin:0"><span class="muted small">Refreshes every 5 s</span>
      ${A.takers.some((t) => t.status === "invited") ? `<button class="btn small" id="lv-rmall">Remove those who haven't started</button>` : ""}<button class="btn small" id="lv-links">Copy all the links</button></span></div>
    ${table([
      { label: "Student", sort: "name", html: (t) => `<a href="#/student/${t.discord_id}">${avatar(t.name, t.discord_id)} ${esc(t.name || t.discord_id)}</a>` },
      { label: "Status", sort: "status", html: (t) => `${status(t.status === "locked" ? "failed" : t.status === "active" ? "active" : t.status === "graded" || t.status === "submitted" ? "solved" : "pending", STATUS[t.status] || t.status)}
          ${t.status === "locked" ? `<div class="small">${esc(LOCK[t.lock_reason] || t.lock_reason || "")}${t.resume_ok ? " · <b>allowed back in</b>" : ""}</div>` : ""}` },
      { label: "Progress", html: (t) => `${meter(n ? (100 * t.answered) / n : 0)}<span class="small muted">${t.answered}/${n} answered ${left(t)}</span>` },
      { label: "Stops", num: true, html: (t) => `${t.events.filter((e) => LOCK[e[1]] && e[1] !== "paste").length}${t.events.some((e) => e[1] === "paste") ? ` <span class="lvl warn" title="Tried to paste">paste</span>` : ""}` },
      { label: "Last event", html: (t) => `<span class="small">${lastEv(t)}</span>` },
      { label: "", html: (t) => `${t.status === "locked" && !t.resume_ok ? `<button class="btn small primary" data-unlock="${t.id}">Let back in</button>` : ""}
          <button class="btn small" data-ev="${t.id}">Events</button> <button class="btn small" data-link="${esc(t.discord_id)}">Link</button>
          ${["invited", "active", "locked"].includes(t.status) ? `<button class="btn small danger" data-rm="${t.id}" title="Take back the invitation: their link stops working">Remove</button>` : ""}` },
    ], A.takers, { empty: "Nobody invited yet: use “Invite students”." })}</section>`;
  const links = async () => (AS.links ??= (await api(`/assessments/${a.id}/links`)).links);
  $("#lv-links").onclick = (e) => busy(e.currentTarget, async () => { const l = await links(); copyText(A.takers.map((t) => `${t.name || t.discord_id}: ${l[t.discord_id]}`).join("\n"), "Links copied"); });
  const remove = (takers, msg) => confirmDialog(msg, "Their link stops working. You can invite them again later.", "Remove", async () => { AS.A = await api(`/assessments/${a.id}/remove`, { method: "POST", body: { takers } }); AS.links = null; renderAssessment(); refreshPills(); }, true);
  $$("[data-rm]", root).forEach((b) => b.onclick = () => remove([Number(b.dataset.rm)], "Remove this student from the assessment?"));
  if ($("#lv-rmall")) $("#lv-rmall").onclick = () => { const ids = A.takers.filter((t) => t.status === "invited").map((t) => t.id); remove(ids, `Remove the ${ids.length} student(s) who haven't started?`); };
  $$("[data-link]", root).forEach((b) => b.onclick = () => busy(b, async () => copyText((await links())[b.dataset.link], "Link copied")));
  $$("[data-unlock]", root).forEach((b) => b.onclick = () => openDialog("Let this student back in?", `<p class="small">They continue where they stopped, in full screen. The timer kept running while they were out: you can give them some time back.</p>
      <label for="ul-m">Extra minutes</label><input type="number" id="ul-m" value="0" min="0" max="120" style="width:100px">`,
    [{ label: "Let back in", primary: true, action: async () => { AS.A = await api(`/assessments/${a.id}/unlock`, { method: "POST", body: { taker: Number(b.dataset.unlock), minutes: $("#ul-m").value } }); dlg.close(); toast("Done: a Continue button appears on their page"); renderAssessment(); refreshPills(); } }]));
  $$("[data-ev]", root).forEach((b) => b.onclick = () => {
    const t = A.takers.find((x) => String(x.id) === b.dataset.ev);
    openDialog(`Events · ${t.name || t.discord_id}`, `<ul class="small ev-list">${t.events.map((e) => `<li><span class="muted">${fmtDateTime(e[0])}</span> ${esc(LOCK[e[1]] ? `⛔ ${LOCK[e[1]]}` : e[1])}</li>`).join("") || "<li class='muted'>Nothing yet.</li>"}</ul>`);
  });
  if (a.status === "open" && !learnTimer) learnTimer = setInterval(async () => {
    if (!location.hash.startsWith(`#/assessment/${a.id}`) || AS.tab !== "live" || dlg.open) return;
    try { AS.A = await api(`/assessments/${a.id}`); renderAssessment(); } catch { /* keep the last view */ }
  }, 5000);
}

function assessResultsTab(root) {
  const { A } = AS, a = A.assessment, qs = a.questions;
  const done = A.takers.filter((t) => ["submitted", "graded"].includes(t.status)).sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
  const graded = done.filter((t) => t.score != null);
  const avg = graded.length ? Math.round(graded.reduce((s, t) => s + t.score, 0) / graded.length) : null;
  const passed = graded.filter((t) => t.score >= a.settings.passAt).length;
  const avgQ = qs.map((q) => { const v = done.map((t) => t.grades[q.id]?.score).filter((x) => x != null); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null; });
  const hardest = qs.map((q, i) => ({ q, i, v: avgQ[i] })).filter((x) => x.v != null && x.v < 60).sort((x, y) => x.v - y.v).slice(0, 3);
  const QI = { code: "💻", explain: "💬", mcq: "☑️" };
  const cell = (t, q) => {
    const g = t.grades[q.id];
    const ans = t.answers[q.id];
    const empty = ans == null || (Array.isArray(ans) ? !ans.length : !String(ans).trim());
    if (!g) return `<td class="cell"><button data-g="${t.id}" data-q="${q.id}" title="Not graded yet">${empty ? "—" : "…"}</button></td>`;
    // not attempted is not a wrong answer: grey, no score
    if (g.verdict === "empty") return `<td class="cell"><button class="sc na" data-g="${t.id}" data-q="${q.id}" title="Not attempted${g.teacher ? " (set by you)" : ""}">—${g.teacher ? "<i>✎</i>" : ""}</button></td>`;
    return `<td class="cell"><button class="sc" style="background:${masteryColor(g.score)};color:${masteryInk(g.score)}" data-g="${t.id}" data-q="${q.id}" title="${esc(g.wrong || g.comment || "")}">${g.score}${g.teacher ? "<i>✎</i>" : ""}</button></td>`;
  };
  root.innerHTML = `
    <div class="figures cs-figs">
      <div class="figure"><span class="ico">📥</span><div><b>${done.length}/${A.takers.length}</b><span>papers handed in</span></div></div>
      <div class="figure"><span class="ico">📊</span><div><b style="color:${masteryInk(avg)}">${avg == null ? "—" : avg + "%"}</b><span>class average</span></div></div>
      <div class="figure"><span class="ico">✅</span><div><b>${passed}/${graded.length}</b><span>passed (≥ ${a.settings.passAt}%)</span></div></div>
      <div class="figure ${done.length - graded.length ? "cs-attn" : ""}"><span class="ico">⏳</span><div><b>${done.length - graded.length}</b><span>to grade</span></div></div>
    </div>
    <section class="panel">
    <div class="panel-head"><h2>Results</h2><span class="toolbar" style="margin:0">
      <button class="btn small" id="rs-grade" title="The AI grades the papers not graded yet (or all again); grades you changed and finalized debriefs stay">↻ Grade with AI</button><button class="btn small primary" id="rs-send">Send results by DM</button></span></div>
    <p class="muted small" style="margin-top:0">Click a <b>student</b> to read their whole paper (each answer, what was right, what was wrong, the mistakes in their code), or a <b>score</b> for one question. ✎ = changed by you.</p>
    ${done.length ? `<div class="table-wrap"><table class="res-table"><thead><tr><th>Student</th><th>Score</th>${qs.map((q, i) => `<th class="ctr" title="${esc(q.prompt.slice(0, 200))}"><span class="qh">${QI[q.type]} Q${i + 1}</span><small>${q.points} pt</small></th>`).join("")}</tr></thead>
      <tbody>${done.map((t) => `<tr><td><button class="res-who" data-paper="${t.id}">${avatar(t.name, t.discord_id)}<span><b>${esc(t.name || t.discord_id)}</b><small>${t.status === "submitted" ? "to grade" : "open the paper →"}</small></span></button></td>
        <td>${t.score == null ? `<span class="muted">—</span>` : `<div class="res-score"><b style="color:${masteryInk(t.score)}">${t.score}%</b>${meter(t.score)}</div>`}</td>${qs.map((q) => cell(t, q)).join("")}</tr>`).join("")}
      <tr class="avg"><td class="small"><b>Average per question</b></td><td></td>${avgQ.map((v) => `<td class="ctr"><b class="small" style="color:${masteryInk(v)}">${v ?? "—"}</b></td>`).join("")}</tr></tbody></table></div>
      <p class="muted small" style="margin:10px 0 0"><span class="lvl none" style="padding:0 8px">—</span> not attempted (no answer, or the starter code left as it was): it counts 0 but isn't a wrong answer, and the student is told so.</p>`
      : `<div class="empty-state"><div style="font-size:40px">📭</div><p class="muted">No paper handed in yet.</p></div>`}
    </section>
    ${hardest.length || done.some((t) => t.summary) ? `<div class="grid cols-2-even">
      ${hardest.length ? `<section class="panel"><h2>Hardest questions <span class="muted">to go over in class</span></h2>
        ${hardest.map((x) => `<div class="hard-q"><b style="color:${masteryInk(x.v)}">${x.v}%</b><div><b>Q${x.i + 1}</b> ${esc(x.q.prompt.slice(0, 160))}${(x.q.comps || []).map((c) => " " + compChip(c.code + "N" + c.level)).join("")}</div></div>`).join("")}</section>` : ""}
      ${done.some((t) => t.summary) ? `<section class="panel"><h2>AI summary per student</h2>${done.filter((t) => t.summary).map((t) => `<p class="small"><b>${esc(t.name || t.discord_id)}</b>: ${esc(t.summary)}</p>`).join("")}</section>` : ""}
    </div>` : ""}`;
  $("#rs-grade").onclick = () => gradeAllDialog(a);
  $("#rs-send").onclick = () => confirmDialog("Send the results?", `Each graded student gets their score${a.settings.showResults ? " and the corrections" : ""} by DM, and the results go to their competencies and skills${a.settings.points ? ` (+ up to ${a.settings.points} pts)` : ""}.`, "Send", async () => {
    const r = await api(`/assessments/${a.id}/results`, { method: "POST", body: {} }); toast(`Sent to ${r.sent} student(s)`);
  });
  $$("[data-paper]", root).forEach((b) => b.onclick = () => paperDialog(A.takers.find((t) => String(t.id) === b.dataset.paper)));
  $$("[data-g]", root).forEach((b) => b.onclick = () => gradeDialog(A.takers.find((t) => String(t.id) === b.dataset.g), qs.find((q) => q.id === b.dataset.q)));
}

const VERDICT_TXT = { correct: ["ok", "Correct"], partial: ["warn", "Partly right"], wrong: ["bad", "Wrong"], empty: ["none", "Not attempted"] };
function answerHtml(q, ans, marks = []) {
  // code: numbered lines, the AI's mistakes highlighted on their line (yellow: small slip, red: serious)
  if (q.type === "code" && ans && String(ans).trim()) {
    const byLine = new Map();
    for (const m of marks || []) (byLine.get(m.line) ?? byLine.set(m.line, []).get(m.line)).push(m);
    const rows = String(ans).split("\n").map((l, i) => {
      const ms = byLine.get(i + 1) || [];
      const cls = ms.some((m) => m.major) ? "major" : ms.length ? "minor" : "";
      return `<div class="cl ${cls}"><span class="ln">${i + 1}</span><code>${esc(l) || " "}</code></div>${ms.map((m) => `<div class="cl-note ${m.major ? "major" : ""}">${m.major ? "⛔" : "⚠️"} ${m.text ? `<code>${esc(m.text)}</code> · ` : ""}${esc(m.issue)}</div>`).join("")}`;
    }).join("");
    const loose = (marks || []).filter((m) => !m.line || m.line > String(ans).split("\n").length);
    return `<div class="code-lines">${rows}</div>${loose.map((m) => `<div class="cl-note ${m.major ? "major" : ""}">${m.major ? "⛔" : "⚠️"} ${m.text ? `<code>${esc(m.text)}</code> · ` : ""}${esc(m.issue)}</div>`).join("")}`;
  }
  return q.type === "mcq"
    ? `<ul class="mcq-res">${q.choices.map((c, k) => `<li class="${q.answer.includes(k) ? "right" : ""} ${(ans || []).includes(k) ? "picked" : ""}">${(ans || []).includes(k) ? "☑" : "☐"} ${esc(c)}${q.answer.includes(k) ? " <span class='tag easy'>right answer</span>" : ""}</li>`).join("")}</ul>`
    : ans && String(ans).trim() ? `<pre class="code-view" style="white-space:pre-wrap">${esc(ans)}</pre>` : `<p class="muted">No answer.</p>`;
}
/** Why the AI (or you) gave this grade: what was right, what was wrong or missing, the comment for the student. */
function gradeWhy(g) {
  if (!g || !g.verdict) return `<p class="muted small">Not graded yet.</p>`;
  const v = VERDICT_TXT[g.verdict] || ["", g.verdict];
  return `<div class="why"><p style="margin:0"><span class="lvl ${v[0]}">${esc(v[1])}</span> ${g.verdict === "empty" ? "" : `<b style="color:${masteryInk(g.score)}">${g.score}%</b> `}<span class="muted small">${g.teacher ? "changed by you" : g.verdict === "empty" ? "no answer: counts 0, not as a mistake" : "graded by the AI"}</span></p>
    ${(g.parts || []).length ? `<ul class="why-parts">${g.parts.map((x) => `<li class="${x.got}"><span>${x.got === "yes" ? "✓" : x.got === "partly" ? "½" : "✗"}</span>${esc(x.goal)}<b>${x.got === "yes" ? x.weight : x.got === "partly" ? Math.round(x.weight / 2) : 0}/${x.weight}</b></li>`).join("")}</ul>` : ""}
    ${g.pending ? `<p class="why-ko"><b>Not graded yet:</b> the AI couldn't grade it. Click “Grade with AI” again, or change the grade yourself.</p>` : ""}
    ${g.right ? `<p class="why-ok"><b>✓ Right:</b> ${esc(g.right)}</p>` : ""}${g.wrong ? `<p class="why-ko"><b>✗ Wrong or missing:</b> ${esc(g.wrong)}</p>` : ""}
    ${g.comment ? `<p class="why-msg"><b>💬 To the student:</b> ${esc(g.comment)}</p>` : ""}</div>`;
}
/** A student's whole paper: each question, their answer and why it got its grade. */
/** "Grade with AI": in small lots, with the progress. When the AI's limit is reached it stops, and the next time it
 *  continues with the papers still to grade (nothing is given a 0 in the meantime). */
function gradeAllDialog(a) {
  const pending = (t) => t.status === "submitted" || (t.status === "graded" && Object.values(t.grades || {}).some((x) => x && !x.teacher && (x.pending || /indisponible|unavailable|Pas encore corrigé|Not graded yet/i.test(String(x.comment || "")))));
  const handed = AS.A.takers.filter((t) => ["submitted", "graded"].includes(t.status));
  const todo = handed.filter(pending).length;
  openDialog("Grade with AI", `
    <label class="check"><input type="radio" name="ga-m" value="todo" ${todo ? "checked" : ""}> <span><b>The papers still to grade</b> (${todo}) <span class="muted small">· not graded yet, or a question the AI couldn't grade</span></span></label>
    <label class="check"><input type="radio" name="ga-m" value="all" ${todo ? "" : "checked"}> <span><b>Every paper again</b> (${handed.length}) <span class="muted small">· the grades you changed stay</span></span></label>
    <p class="small muted">Students whose debrief is finalized are never graded again. The AI grades 3 papers at a time; if its limit is reached it stops, and the next time it continues where it stopped.</p>
    <div id="ga-prog" hidden><div class="aa-bar"><span></span></div><p class="small" id="ga-st"></p></div>`,
    [{ label: "Start", primary: true, action: async (d) => {
      const all = $("input[name=ga-m]:checked", d).value === "all";
      const btn = $(".dlg-foot .btn.primary", d);
      btn.hidden = true; $$("input[name=ga-m]", d).forEach((x) => { x.disabled = true; });
      $("#ga-prog", d).hidden = false;
      let stop = false, done = 0, after = 0, left = all ? handed.length : todo, total = left || 1, err = "", skipped = 0;
      $(".dlg-foot", d).insertAdjacentHTML("afterbegin", `<button class="btn" id="ga-stop">Stop</button>`);
      $("#ga-stop", d).onclick = () => { stop = true; $("#ga-stop", d).disabled = true; };
      const draw = (msg) => { $(".aa-bar span", d).style.width = `${Math.min(100, Math.round((done / total) * 100))}%`; $("#ga-st", d).textContent = msg; };
      draw(`⏳ Grading… 0/${total}`);
      while (!stop) {
        let r;
        try { r = await api(`/assessments/${a.id}/grade`, { method: "POST", body: { all, after, lot: 3 } }); }
        catch (e) { err = e.message; break; }
        AS.A = r; done += r.batch.graded; after = r.batch.last; skipped = r.batch.skipped;
        total = Math.max(total, done + r.batch.left);
        draw(`⏳ Grading… ${done}/${total}`);
        if (r.batch.error) { err = r.batch.error; break; }
        if (!r.batch.left || !r.batch.graded) break;
      }
      $("#ga-stop", d)?.remove();
      const rest = AS.A.takers.filter(pending).length;
      draw(err ? `Stopped: ${done} graded. The AI stopped answering (${err}). ${rest} paper(s) still to grade: click Grade with AI again later (or tomorrow): it continues with them, nothing was given a 0.`
        : `${stop ? "Stopped" : "Done"}: ${done} paper(s) graded${rest ? `, ${rest} still to grade` : ""}${skipped ? ` · ${skipped} finalized debrief(s) left as they are` : ""}.`);
      $("#ga-st", d).className = err ? "small notice warn" : "small";
      btn.hidden = false; btn.textContent = "Close"; btn.onclick = () => d.close();
      renderAssessment();
    } }]);
}
function paperDialog(t) {
  const qs = AS.A.assessment.questions;
  const stops = t.events.filter((e) => LOCK[e[1]] && e[1] !== "paste").length, pastes = t.events.filter((e) => e[1] === "paste").length;
  openDialog(`${t.name || t.discord_id} · ${t.score == null ? "not graded" : t.score + "%"}`, `
    <p class="small muted" style="margin-top:12px">${t.started_at ? `Started ${fmtDateTime(t.started_at)}` : ""}${t.submitted_at ? ` · handed in ${fmtDateTime(t.submitted_at)}` : ""} · ${stops} stop(s)${pastes ? ` · ${pastes} paste attempt(s)` : ""} · questions seen in this order: ${t.order.map((id) => "Q" + (qs.findIndex((q) => q.id === id) + 1)).join(", ")}</p>
    ${t.summary ? `<div class="notice" style="margin:8px 0 14px"><b>AI summary:</b> ${esc(t.summary)}</div>` : ""}
    ${qs.map((q, i) => `<section class="paper-q">
      <header><b>Q${i + 1}</b> <span class="tag">${esc(QTYPE[q.type])}</span> <span class="muted small">${q.points} pt</span> ${(q.comps || []).map((c) => compChip(c.code + "N" + c.level)).join(" ")}
        <button class="btn small" data-regrade="${esc(q.id)}" style="margin-left:auto">Change the grade</button></header>
      <p style="white-space:pre-wrap;margin:6px 0">${esc(q.prompt)}</p>${q.code ? `<pre class="code-view">${esc(q.code)}</pre>` : ""}
      <h3>Their answer</h3>${answerHtml(q, t.answers[q.id], t.grades[q.id]?.marks)}
      ${q.expected ? `<details class="small"><summary>Expected answer</summary><pre class="code-view" style="white-space:pre-wrap">${esc(q.expected)}</pre></details>` : ""}
      <h3>Grade</h3>${gradeWhy(t.grades[q.id])}</section>`).join("")}`);
  dlg.classList.add("wide");
  $$("[data-regrade]", dlg).forEach((b) => b.onclick = () => gradeDialog(t, qs.find((q) => q.id === b.dataset.regrade), true));
}
function gradeDialog(t, q, fromPaper = false) {
  const g = t.grades[q.id] || {};
  const answer = answerHtml(q, t.answers[q.id], g.marks);
  openDialog(`${t.name || t.discord_id} · Q${AS.A.assessment.questions.indexOf(q) + 1}`, `
    <p style="white-space:pre-wrap">${esc(q.prompt)}</p>${q.code ? `<pre class="code-view">${esc(q.code)}</pre>` : ""}
    <h3>Their answer</h3>${answer}
    ${q.expected ? `<details class="small"><summary>Expected</summary><pre class="code-view" style="white-space:pre-wrap">${esc(q.expected)}</pre></details>` : ""}
    <h3>Why this grade</h3>${gradeWhy(g)}
    <h3>Change it</h3>
    ${segHtml("vd", [["correct", "Correct"], ["partial", "Partly"], ["wrong", "Wrong"], ["empty", "Not attempted"]], g.verdict || "partial")}
    <div class="field-row"><div><label for="gd-s">Score (%)</label><input type="number" id="gd-s" min="0" max="100" value="${g.score ?? ""}"></div></div>
    <label for="gd-c">Comment for the student</label><textarea id="gd-c">${esc(g.comment || "")}</textarea>`,
    [{ label: "Save the grade", primary: true, action: async () => {
      AS.A = await api(`/assessments/${AS.A.assessment.id}/grade`, { method: "PUT", body: { taker: t.id, qid: q.id, verdict: segVal(dlg, "vd"), score: $("#gd-s").value === "" ? undefined : $("#gd-s").value, comment: $("#gd-c").value } });
      dlg.close(); toast("Grade saved"); renderAssessment();
      if (fromPaper) paperDialog(AS.A.takers.find((x) => x.id === t.id));
    } }]);
  dlg.classList.add("wide");
  wireSeg(dlg, "vd", (v) => { const s = { correct: 100, partial: 50, wrong: 0, empty: 0 }[v]; $("#gd-s").value = s; });
}

// ====================================================================== GITHUB
async function viewGithub() {
  const [G, act] = await Promise.all([api("/github"), api("/github/activity"), loadStudents()]);
  const c = G.cfg, su = G.setup;
  const ready = su.app && su.oauth && su.webhook && su.key;
  const linked = new Set(act.students.map((s) => s.discord_id));
  const notLinked = (S.students || []).filter((s) => !linked.has(s.discord_id));
  const rows = act.students.map((s) => ({ ...s, sum: s.days.reduce((t, d) => t + (d[7] ?? d[0]), 0), week: s.days.slice(-7).reduce((t, d) => t + (d[7] ?? d[0]) + d[2], 0) }));
  const total = rows.reduce((t, s) => t + s.sum, 0);
  const activeWeek = rows.filter((s) => s.week > 0).length;
  const idle = rows.filter((s) => s.idle >= (c.inactiveDays || 3));
  const max = Math.max(1, ...rows.flatMap((s) => s.days.map((d) => (d[7] ?? d[0]) + d[2] + d[3])));
  const heat = (d, day) => { const n = (d[7] ?? d[0]) + d[2] + d[3]; const k = n ? Math.min(4, Math.ceil((4 * n) / max)) : 0;
    return `<i class="h${k} ${d[5] || d[6] ? "flag" : ""}" title="${esc(day)}: ${d[7] ?? d[0]} commit(s) (${d[0]} real), ${d[1]} line(s), ${d[2]} PR(s)${d[3] ? `, ${d[3]} other` : ""}${d[4] ? `, ${d[4]} tiny` : ""}${d[5] ? `, ${d[5]} huge` : ""}${d[6] ? `, ${d[6]} vague message(s)` : ""}"></i>`; };
  const pctLinked = G.students ? Math.round((100 * G.linked) / G.students) : 0;
  view.innerHTML = `
    <div class="page-head"><div><h1>GitHub</h1><p class="sub">What each student pushes, every day. It feeds the reports, the brief reminders and the debriefs.</p></div>
      <div class="toolbar" style="margin:0"><button class="btn" id="gh-d">Send today's report</button><button class="btn" id="gh-w">Weekly report</button><a class="btn" href="#/settings/github">${icon("gear")} Settings</a></div></div>
    <div class="stack">
    ${ready ? "" : `<div class="notice warn"><b>GitHub isn't set up for this class yet.</b> Students can't link their account until the class has a GitHub App. <a href="#/settings/github">Set it up in Settings → GitHub &amp; Watcher</a>.</div>`}
    <div class="figures cs-figs">
      <div class="figure"><span class="ico">🔗</span><div><b>${G.linked}/${G.students}</b><span>students linked</span>${meter(pctLinked)}</div></div>
      <div class="figure"><span class="ico">🟢</span><div><b>${activeWeek}</b><span>pushed in the last 7 days</span></div></div>
      <div class="figure"><span class="ico">📦</span><div><b>${total}</b><span>commits in 14 days</span></div></div>
      <div class="figure ${idle.length ? "cs-attn" : ""}"><span class="ico">💤</span><div><b>${idle.length}</b><span>idle ${c.inactiveDays || 3}+ working days</span></div></div>
    </div>
    ${G.linked <= 1 && G.students > 3 && su.app ? `<div class="notice">Your students linked GitHub in <b>GitHub Watcher</b>? Bring them here at once: <a href="#/settings/github">Settings → GitHub &amp; Watcher → Import</a>. Otherwise they each type <code>/github</code> in Discord.</div>` : ""}
    <section class="panel"><div class="panel-head"><h2>Activity · last 14 days</h2>
        <span class="heat-legend small muted">less <i class="h0"></i><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i> more · <i class="h2 flag"></i> huge or vague commits</span></div>
      ${rows.length ? table([
        { label: "Student", sort: "name", html: (s) => `<a class="gh-who" href="#/student/${s.discord_id}">${avatar(s.name, s.discord_id)}<span><b>${esc(s.name || s.login)}</b><small>@${esc(s.login)}</small></span></a>` },
        { label: "Last 14 days", html: (s) => `<a href="#/student/${s.discord_id}?tab=github" class="gh-heat" title="All their activity">${s.days.map((d, i) => heat(d, act.days[i])).join("")}</a>` },
        { label: "Commits", num: true, sort: "sum", html: (s) => `<b>${s.sum}</b>` },
        { label: "Last push", sort: "last", html: (s) => `${s.idle >= (c.inactiveDays || 3) ? `<span class="lvl bad">${s.idle} days idle</span>` : `<span class="small">${s.last ? fmtAgo(s.last) : "never"}</span>`}` },
        { label: "Repos", html: (s) => `<span class="gh-repos">${s.repos.slice(0, 3).map(([r]) => `<a class="tag" href="https://github.com/${esc(r)}" target="_blank" rel="noopener">${esc(r.split("/")[1] || r)}</a>`).join("") || `<span class="muted">—</span>`}</span>` },
        { label: "", html: (s) => `<a class="btn small" href="https://github.com/${esc(s.login)}" target="_blank" rel="noopener">GitHub</a> <button class="btn small" data-unlink="${s.discord_id}">Unlink</button>` },
      ], rows, { sort: { key: "sum" } }) : `<div class="empty-state"><div style="font-size:40px">🐙</div><p class="muted">Nobody linked yet: students type <code>/github</code> in Discord.</p></div>`}
    </section>
    ${notLinked.length ? `<section class="panel"><div class="panel-head"><h2>Not linked yet <span class="muted">${notLinked.length}</span></h2><span class="small muted">they type <code>/github</code> in Discord</span></div>
      <div class="people">${notLinked.map((s) => `<a href="#/student/${s.discord_id}" class="person">${avatar(s.name, s.discord_id)} ${esc(s.name || s.discord_id)}</a>`).join("")}</div></section>` : ""}
    <section class="panel"><h2>How students use it</h2>
      <div class="how-steps">
        <div><span class="xl-n">1</span><b><code>/github</code></b><p class="small muted">Link their GitHub account, once. They install the class's GitHub App on their repositories.</p></div>
        <div><span class="xl-n">2</span><b>They push</b><p class="small muted">Every push, pull request and review is counted, and posted in their forum post if you chose a forum.</p></div>
        <div><span class="xl-n">3</span><b><code>/brief submit</code></b><p class="small muted">Hand in the repo (and the planning board) of a brief. You debrief it from the brief's page.</p></div>
      </div></section>
    </div>`;
  $("#gh-d").onclick = (e) => busy(e.currentTarget, async () => { await api("/github/report", { method: "POST", body: { kind: "daily" } }); toast("Report sent"); });
  $("#gh-w").onclick = (e) => busy(e.currentTarget, async () => { await api("/github/report", { method: "POST", body: { kind: "weekly" } }); toast("Report sent"); });
  $$("[data-unlink]").forEach((b) => b.onclick = () => confirmDialog("Unlink this GitHub account?", "The student can link again with /github. Past activity stays.", "Unlink", async () => { await api("/github/unlink", { method: "POST", body: { discord_id: b.dataset.unlink } }); viewGithub(); }, true));
}

/** Settings → GitHub & Watcher: the class's GitHub App (or the school's), reports, rewards, import from GitHub Watcher. */
async function githubSettings(root) {
  const [G] = await Promise.all([api("/github"), loadDiscord()]);
  // back from GitHub after "Create the GitHub App for me"
  const back = new URLSearchParams(location.search);
  if (back.get("gh")) {
    if (back.get("gh") === "created") toast(`GitHub App created${back.get("slug") ? `: ${back.get("slug")}` : ""}. Install it on your repos to test it.`);
    else toast(back.get("why") || "GitHub didn't create the App.", true);
    history.replaceState(null, "", location.pathname + location.hash);
  }
  const c = G.cfg, su = G.setup;
  const ready = su.app && su.oauth && su.webhook && su.key;
  const chName = (id) => [...(S.discord?.channels || []), ...(S.discord?.forums || [])].find((x) => x.id === id)?.name || "";
  const chOpt = (sel, list) => `<option value="">—</option>` + (list || []).map((x) => `<option value="${x.id}" ${x.id === sel ? "selected" : ""}># ${esc(x.name)}</option>`).join("");
  const item = (ok, label) => `<li class="${ok ? "ok" : "ko"}">${ok ? "✓" : "✗"} ${label}</li>`;
  const urls = su.own ? su.urls : su.ownUrls;
  const sec = (has) => (has ? "saved · leave empty to keep it" : "");
  root.innerHTML = `
    <div class="panel set-card"><div class="panel-head"><h3 style="margin:0">GitHub App</h3>${ready ? `<span class="status solved">Ready</span>` : `<span class="status failed">Not ready</span>`}</div>
      <p class="small">${su.own ? "This class uses <b>its own GitHub App</b> (saved here)." : su.shared ? "This class uses <b>the school's GitHub App</b> (set when ClassBot was installed): nothing to do. Use your own only if you want this class separate." : "No GitHub App yet. Create one (free) and fill in its details below."}</p>
      <ul class="bchecks">${item(su.app, "App slug")}${item(su.key, "Private key (to read the repos)")}${item(su.oauth, "Client ID and secret (students sign in)")}${item(su.webhook, "Webhook secret (pushes arrive)")}${item(!!su.ai, `AI for the debriefs${su.ai ? ` (${su.ai === "keys" ? "your AI keys" : "Cloudflare AI"})` : ""}`)}</ul>
      <div id="gh-own" ${su.own || !su.shared ? "" : "hidden"}>
        ${ready ? "" : `<p><button class="btn primary" id="ga-auto">✨ Create the GitHub App for me</button> <span class="muted small">2 clicks on GitHub</span></p>`}
        <details class="howto"><summary><b>Or create it by hand</b></summary>
          <ol class="small">
            <li>On GitHub: your picture → <b>Settings → Developer settings → GitHub Apps → New GitHub App</b> (or edit your Watcher's App).</li>
            <li>Paste the three URLs below. Tick <b>Redirect on update</b> under Setup URL. Leave <i>Request user authorization during installation</i> unticked.</li>
            <li>Webhook: Active, with a secret you make up (write it in <b>Webhook secret</b> below).</li>
            <li>Permissions, read-only: <b>Contents, Metadata, Pull requests, Issues</b>. Events: <b>Push, Pull request, Pull request review, Issues, Create</b>. Where can it be installed: <b>Any account</b>.</li>
            <li>Create it, then copy here: the <b>App ID</b> and <b>Client ID</b> (top of the page), a new <b>client secret</b>, and a new <b>private key</b> (a .pem file: open it with Notepad and paste everything).</li>
          </ol></details>
        <div class="url-list">${Object.entries({ "Callback URL": urls.callback, "Setup URL": urls.setup, "Webhook URL": urls.webhook }).map(([k, v]) => `<div><b>${k}</b><code>${esc(v)}</code><button class="btn small" data-copy="${esc(v)}">Copy</button></div>`).join("")}</div>
        <div class="field-row">
          <div><label for="ga-id">App ID</label><input type="text" id="ga-id" value="${esc(su.own ? su.appId : "")}" placeholder="e.g. 1234567"></div>
          <div><label for="ga-slug">App slug <span class="muted">(or its github.com/apps/… link)</span></label><input type="text" id="ga-slug" value="${esc(su.own ? su.slug || "" : "")}" placeholder="e.g. classbot-dwwm"></div>
          <div><label for="ga-cid">Client ID</label><input type="text" id="ga-cid" value="${esc(su.own ? su.clientId : "")}" placeholder="Iv23…"></div>
        </div>
        <div class="field-row">
          <div><label for="ga-cs">Client secret</label><input type="password" id="ga-cs" autocomplete="off" placeholder="${sec(su.own && su.oauth)}"></div>
          <div><label for="ga-ws">Webhook secret</label><input type="password" id="ga-ws" autocomplete="off" placeholder="${sec(su.own && su.webhook)}"></div>
        </div>
        <label for="ga-pk">Private key <span class="muted">(the whole .pem file)</span></label>
        <textarea id="ga-pk" class="code" spellcheck="false" style="min-height:90px" placeholder="${su.own && su.key ? "saved · leave empty to keep it" : "-----BEGIN RSA PRIVATE KEY-----\n…\n-----END RSA PRIVATE KEY-----"}"></textarea>
        <p class="muted small">Secrets are stored on the server and never shown again. Each class can have its own App: other teachers fill in theirs in their class's settings.</p>
        <div class="set-foot">${su.own && su.shared ? `<button class="btn danger" id="ga-del">Use the school's App instead</button>` : ""}${su.own ? `<button class="btn" id="ga-test">Test the App</button>` : ""}<button class="btn primary" id="ga-save">Save the App</button></div>
      </div>
      ${su.own || !su.shared ? "" : `<p><button class="btn" id="ga-mine">Use my own GitHub App for this class</button></p>`}
    </div>

    <div class="panel set-card"><h3>Where GitHub messages go</h3>
      ${!c.channel ? `<p class="gh-warn">⚠️ No report channel chosen: reports, reminders and connections go to <b>${chName(G.fallback) ? "#" + esc(chName(G.fallback)) : "the announcements channel"}</b> (often #arena). Choose your GitHub channel below.</p>` : ""}
      ${c.forumError ? `<p class="gh-warn bad">🛑 The last forum post failed (${fmtAgo(c.forumError.at)}): ${esc(c.forumError.msg)}</p>` : ""}
      <div class="gh-dest">
        <div><span class="gh-dest-ic">📊</span><div><label for="gh-ch">Reports & brief reminders</label><select id="gh-ch">${chOpt(c.channel, S.discord?.channels)}</select><p class="small muted">Daily / weekly tables, idle students, deadlines.</p></div></div>
        <div><span class="gh-dest-ic">🔗</span><div><label for="gh-lk">“X connected GitHub”</label><select id="gh-lk"><option value="">Same as the reports</option><option value="off" ${c.links === "off" ? "selected" : ""}>Don't announce</option>${(S.discord?.channels || []).map((x) => `<option value="${x.id}" ${x.id === c.links ? "selected" : ""}># ${esc(x.name)}</option>`).join("")}</select><p class="small muted">Posted once per new link.</p></div></div>
        <div><span class="gh-dest-ic">📢</span><div><label for="gh-br">New briefs announced in</label><select id="gh-br"><option value="">${c.briefs ? "—" : "#general (found automatically)"}</option>${(S.discord?.channels || []).map((x) => `<option value="${x.id}" ${x.id === c.briefs ? "selected" : ""}># ${esc(x.name)}</option>`).join("")}</select><p class="small muted">The announcement when you assign a brief.</p></div></div>
        <div><span class="gh-dest-ic">🧵</span><div><label for="gh-fo">Activity forum <span class="muted">(one post per student)</span></label><select id="gh-fo">${chOpt(c.forum, S.discord?.forums)}</select><p class="small muted">Every push and pull request, in the student's post.</p></div></div>
      </div>
      <div class="toolbar" style="margin:4px 0 12px"><button class="btn small" id="gh-test">🧪 Save and send a test</button><span id="gh-test-out" class="small"></span></div>
      <h3>Reports and reminders</h3>
      <label class="check"><input type="checkbox" id="gh-da" ${c.daily ? "checked" : ""}> Daily report at <input type="number" id="gh-h" min="0" max="23" value="${c.hour}" style="width:64px">:<input type="number" id="gh-m" min="0" max="59" value="${c.minute}" style="width:64px"> <span class="muted small">(UTC)</span></label>
      <label class="check"><input type="checkbox" id="gh-we" ${c.weekly ? "checked" : ""}> Weekly report on <select id="gh-wd">${WEEKDAYS.map((w, i) => `<option value="${i}" ${i === c.weeklyDay ? "selected" : ""}>${w}</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" id="gh-re" ${c.reminders ? "checked" : ""}> Brief reminders (3 days, 1 day, deadline)</label>
      <label>No report on</label><div class="checks">${WEEKDAYS.map((w, i) => `<label class="check small"><input type="checkbox" data-skip="${i}" ${c.skip.includes(i) ? "checked" : ""}> ${w.slice(0, 3)}</label>`).join("")}</div>
      <div class="field-row"><div><label>Idle after (working days)</label><input type="number" id="gh-in" min="1" max="14" value="${c.inactiveDays}"></div>
        <div><label>Tiny commit (lines ≤)</label><input type="number" id="gh-ti" min="0" value="${c.tiny}"></div><div><label>Huge commit (lines ≥)</label><input type="number" id="gh-hu" min="10" value="${c.huge}"></div></div>
      <label for="gh-hid">Repos to ignore <span class="muted">(owner/repo, one per line)</span></label><textarea id="gh-hid" style="min-height:60px">${esc((c.hidden || []).join("\n"))}</textarea>
      <h3>What a finalized debrief gives</h3>
      <div class="field-row"><div><label>Points per competency</label><input type="number" id="gh-rc" min="0" value="${G.rewards.comp}"></div>
        <div><label>Coins per competency</label><input type="number" id="gh-rk" min="0" value="${G.rewards.coins}"></div>
        <div><label>Bonus (mise en situation)</label><input type="number" id="gh-rb" min="0" value="${G.rewards.bonus}"></div></div>
      <div class="set-foot"><button class="btn primary" id="gh-save">Save</button></div>
    </div>

    <div class="panel set-card"><h3>Import from GitHub Watcher</h3>
      <p class="small">Brings the Watcher's GitHub links, briefs (deadlines, grids, squads), hand-ins and debriefs into this class, once. Safe to run again.</p>
      ${su.watcherDone?.at ? `<div class="notice ok small"><b>✓ Imported ${fmtAgo(su.watcherDone.at)}</b>${su.watcherDone.by === "setup" ? " by <code>npm run setup</code>" : ""}: ${su.watcherDone.students} students, ${su.watcherDone.briefs} briefs, ${su.watcherDone.reviews} debriefs${su.watcherDone.activity ? `, ${su.watcherDone.activity} GitHub events` : ""}.
        ${su.watcherDone.keepInst ? "" : "<br>Students run <code>/github</code> once to install this class's App (their history is already here)."}</div>` : ""}
      ${su.watcher ? `<p><button class="btn" id="gw-bind">${su.watcherDone?.at ? "Import again" : "Import (Watcher storage is connected)"}</button></p>` : ""}
      <details ${su.watcher || su.watcherDone?.at ? "" : "open"}><summary class="small"><b>Import with a Cloudflare token</b> (no deploy needed)</summary>
        <ol class="small">
          <li>Cloudflare dashboard → <b>Storage &amp; Databases → Workers KV</b>: copy the <b>ID</b> of the Watcher's namespace.</li>
          <li>Your <b>Account ID</b> is on the right of any Workers page (or in the dashboard's URL).</li>
          <li><b>My Profile → API Tokens → Create Token → Custom token</b>, permission <b>Account · Workers KV Storage · Read</b>. It is used once, never saved: delete it afterwards.</li>
        </ol>
        <div class="field-row"><div><label for="gw-acc">Account ID</label><input type="text" id="gw-acc" autocomplete="off"></div><div><label for="gw-ns">Namespace ID</label><input type="text" id="gw-ns" autocomplete="off"></div></div>
        <label for="gw-tok">API token</label><input type="password" id="gw-tok" autocomplete="off" style="width:100%">
        <p class="small" id="gw-st"></p>
        <div class="set-foot"><button class="btn primary" id="gw-run">Import from the Watcher</button></div>
      </details>
    </div>`;
  $$("[data-copy]", root).forEach((b) => b.onclick = () => copyText(b.dataset.copy, "Copied"));
  if ($("#ga-mine")) $("#ga-mine").onclick = (e) => { $("#gh-own").hidden = false; e.currentTarget.remove(); };
  // GitHub's app manifest: a form posted to GitHub, which creates the App and comes back with its credentials
  if ($("#ga-auto")) $("#ga-auto").onclick = (e) => busy(e.currentTarget, async () => {
    const m = await api("/github/manifest", { method: "POST", body: {} });
    const f = document.createElement("form");
    f.method = "post"; f.action = m.action;
    const i = document.createElement("input");
    i.type = "hidden"; i.name = "manifest"; i.value = JSON.stringify(m.manifest);
    f.append(i); document.body.append(f); f.submit();
  });
  const reload = () => githubSettings(root);
  $("#ga-save").onclick = (e) => busy(e.currentTarget, async () => {
    await api("/github/app", { method: "PUT", body: { appId: $("#ga-id").value, slug: $("#ga-slug").value, clientId: $("#ga-cid").value, clientSecret: $("#ga-cs").value, webhookSecret: $("#ga-ws").value, privateKey: $("#ga-pk").value } });
    toast("GitHub App saved"); reload();
  });
  if ($("#ga-test")) $("#ga-test").onclick = (e) => busy(e.currentTarget, async () => {
    const r = await api("/github/app/test", { method: "POST", body: {} });
    toast(r.warn || `Connected to “${r.name}” (owner ${r.owner}${r.installs != null ? `, ${r.installs} installation(s)` : ""})`, !!r.warn);
  });
  if ($("#ga-del")) $("#ga-del").onclick = () => confirmDialog("Use the school's GitHub App?", "This class's own App details are deleted. Students linked with it will need to run /github again.", "Use the school's App", async () => { await api("/github/app", { method: "DELETE" }); reload(); }, true);
  const saveGh = () => api("/github", { method: "PUT", body: {
      channel: $("#gh-ch").value, links: $("#gh-lk").value, forum: $("#gh-fo").value, briefs: $("#gh-br").value, daily: $("#gh-da").checked, weekly: $("#gh-we").checked, reminders: $("#gh-re").checked,
      hour: $("#gh-h").value, minute: $("#gh-m").value, weeklyDay: $("#gh-wd").value, inactiveDays: $("#gh-in").value, tiny: $("#gh-ti").value, huge: $("#gh-hu").value,
      skip: $$("[data-skip]:checked", root).map((x) => Number(x.dataset.skip)), hidden: $("#gh-hid").value,
      rewards: { comp: $("#gh-rc").value, coins: $("#gh-rk").value, bonus: $("#gh-rb").value } } });
  $("#gh-save").onclick = (e) => busy(e.currentTarget, async () => { await saveGh(); toast("Saved"); });
  $("#gh-test").onclick = (e) => busy(e.currentTarget, async () => {
    await saveGh();
    const r = await api("/github/test", { method: "POST", body: {} });
    const LBL = { reports: "📊 Reports", connections: "🔗 Connections", forum: "🧵 Forum" };
    $("#gh-test-out").innerHTML = r.results.map((x) => `<span class="gh-test ${x.ok ? "ok" : "ko"}">${x.ok ? "✓" : "✗"} ${LBL[x.target]}${x.channel ? ` (#${esc(chName(x.channel) || x.channel)})` : ""}: ${esc(x.msg)}</span>`).join("");
  });
  const done = (r) => {
    const parts = [`${r.students} students`, `${r.briefs} briefs`, `${r.handins} hand-ins`, `${r.reviews} debriefs${r.levels ? ` (${r.levels} with a level)` : ""}`,
      r.comments ? `${r.comments} comments` : "", `${r.threads ?? 0} forum posts`, r.activity ? `${r.activity} GitHub events` : "", r.pushes ? `${r.pushes} first pushes` : "", r.sprints ? `${r.sprints} sprint decisions` : ""].filter(Boolean);
    openDialog("✅ Imported from GitHub Watcher", `<p>${parts.join(" · ")}.</p>
      ${r.skipped ? `<p class="small muted">${r.skipped} old debrief(s) skipped: their brief no longer exists in the Watcher.</p>` : ""}
      ${r.keepInst ? "" : `<div class="notice warn"><b>Students: run <code>/github</code> once.</b> This class uses its own GitHub App, so each student installs it (their history and debriefs are already here). Then turn off the Watcher's App webhook so pushes aren't posted twice.</div>`}
      <p class="small muted">The debriefs are drafts: open them from Progress, check, and Finalize.</p>`, [{ label: "Open Progress", primary: true, action: () => { location.hash = "#/progress"; } }]);
  };
  if ($("#gw-bind")) $("#gw-bind").onclick = (e) => busy(e.currentTarget, async () => done(await api("/github/import", { method: "POST", body: {} })));
  $("#gw-run").onclick = (e) => busy(e.currentTarget, async () => {
    const cred = { account: $("#gw-acc").value.trim(), namespace: $("#gw-ns").value.trim(), token: $("#gw-tok").value.trim() };
    const st = $("#gw-st");
    st.textContent = "⏳ Listing the Watcher's data…";
    try {
      const { keys, meta } = await api("/github/watcher/keys", { method: "POST", body: cred });
      // the GitHub activity: only metadata, read with the listing
      const data = Object.fromEntries(Object.entries(meta || {}).map(([k, m]) => [k, { __meta: m }]));
      for (let i = 0; i < keys.length; i += 40) {
        st.textContent = `⏳ Reading ${Math.min(i + 40, keys.length)} / ${keys.length}…`;
        Object.assign(data, (await api("/github/watcher/values", { method: "POST", body: { ...cred, keys: keys.slice(i, i + 40) } })).values);
      }
      st.textContent = "⏳ Importing…";
      done(await api("/github/import", { method: "POST", body: { data } }));
      st.textContent = "✓ Done. You can delete the token in Cloudflare now.";
      $("#gw-tok").value = "";
    } catch (err) { st.textContent = ""; throw err; }
  });
}

// ======================================================= Settings → Programme
const KIND_FR = { brief: "Brief", break: "Vacances", crossdefense: "Soutenance croisée", certification: "Certification", other: "Autre" };
const KIND_EN = { brief: "Brief", break: "Break", crossdefense: "Cross defense", certification: "Certification", other: "Other" };
const codesTxt = (list) => (list || []).map((c) => { const p = parseC(c); return p ? cLabel(p.code) + (p.level ? "N" + p.level : "") : c; }).join(", ");
/** The Excel template: the current programme already in it, so the teacher edits rather than starts from nothing. */
function programmeWorkbook(P, empty = false) {
  const ex = (rows) => (empty ? rows.slice(0, 1) : rows);
  return XL.writeXlsx([
    { name: "Lisez-moi", widths: [120], rows: [["Comment remplir ce fichier"],
      ["1. Programme : le nom du programme, la stack (ex. DWWM, MERN, Java, IA) et les niveaux (imiter, adapter, transposer)."],
      ["2. Référentiel : une ligne par compétence. Code C1, C2… (techniques) ou CT1, CT2… (transversales), son intitulé, et le type (technique / transversale)."],
      ["3. Sprints : un sprint par ligne, avec ses objectifs, ses technologies et ses compétences (ex. C1, C2 et CT1N1, CT2N1)."],
      ["4. Planning : une semaine par ligne. Début et fin au format 2026-10-05 ou 05/10/2026. Type : Brief, Vacances, Soutenance croisée, Certification ou Autre."],
      ["   Compétences avec leur niveau : C1N1, C2N2… (N1 imiter, N2 adapter, N3 transposer). Mode : individuel, binôme, trinôme ou collectif."],
      ["   Les technologies de la semaine viennent de l'intitulé, de l'objectif et des concepts : le générateur de briefs s'y limite."],
      ["Ne changez pas le nom des feuilles ni la première ligne de chaque feuille. Vous pouvez aussi importer directement le fichier de planning YouCode (feuilles « Planning Annuel » et « 02_Sprints »)."]] },
    { name: "Programme", widths: [18, 60], rows: [["Champ", "Valeur"], ["Nom", empty ? "" : P.name], ["Stack", empty ? "" : P.stack], ["Langue", P.lang], ["Niveaux", P.levels.join(", ")]] },
    { name: "Référentiel", widths: [10, 90, 16], rows: ex([["Code", "Compétence", "Type"], ...P.referential.map((c) => [cLabel(c.code), c.name, c.kind === "soft" ? "transversale" : "technique"])]) },
    { name: "Sprints", widths: [8, 10, 40, 60, 40, 50, 50, 24, 40], rows: ex([["Sprint", "Semaines", "Titre", "Objectifs", "Situation professionnelle", "Technologies / concepts", "Briefs", "Compétences techniques", "Compétences transversales"],
      ...P.sprints.map((s) => [String(s.n), String(s.weeks || ""), s.title, s.objectives, s.situation, s.technologies, s.briefs, codesTxt(s.tech), codesTxt(s.soft)])]) },
    { name: "Planning", widths: [9, 12, 12, 18, 8, 7, 7, 12, 50, 60, 70, 26, 40, 50], rows: ex([["Semaine", "Début", "Fin", "Type", "Sprint", "Brief", "Jours", "Mode", "Intitulé", "Objectif", "Concepts & exigences techniques", "Compétences", "Compétences transversales", "Livrables"],
      ...P.weeks.map((w) => [String(w.n), w.start, w.end, KIND_FR[w.kind] || w.kind, w.sprint ? String(w.sprint) : "", w.brief ? String(w.brief) : "", w.days ? String(w.days) : "", w.kind === "brief" ? w.mode : "", w.title, w.objective, w.concepts, codesTxt(w.competencies), codesTxt(w.soft), w.deliverables])]) },
  ]);
}
function saveBlob(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

async function programmeSettings(root) {
  const pg = await api("/programs");
  const P = pg.current;
  const first = P.weeks[0]?.start, last = P.weeks[P.weeks.length - 1]?.end;
  root.innerHTML = `
    <div class="panel set-card"><div class="panel-head"><h3 style="margin:0">${esc(P.name)}</h3><span class="tag">${P.custom ? "this class's own" : "built-in"}</span></div>
      <div class="prog-figs"><div><b>${P.weeks.length}</b><span>weeks</span></div><div><b>${P.sprints.length}</b><span>sprints</span></div><div><b>${P.referential.filter((c) => c.kind === "tech").length}</b><span>technical comp.</span></div><div><b>${P.referential.filter((c) => c.kind === "soft").length}</b><span>transversal comp.</span></div><div><b>${first ? dayLabelOf(first) : "—"}</b><span>to ${last ? dayLabelOf(last) : "—"}</span></div></div>
      ${pg.list.length > 1 ? `<label>Programme of this class</label><div class="toolbar" style="margin:0"><select id="pg-pick" style="min-width:320px">${pg.list.map((p) => `<option value="${esc(p.id)}" ${p.id === P.id ? "selected" : ""}>${esc(p.name)}${p.builtin ? " (built-in)" : ""}</option>`).join("")}</select><button class="btn" id="pg-use">Use it</button>
        ${P.custom ? `<button class="btn danger" id="pg-del">Delete this one</button>` : ""}</div>` : ""}
      <p class="muted small">See the weeks in <a href="#/briefs/plan">Briefs → Planning</a>.</p>
    </div>
    <div class="panel set-card"><h3>Update it from Excel</h3>
      <div class="xl-steps">
        <div><span class="xl-n">1</span><b>Download the template</b><p class="small muted">With this programme already in it: change what changes for your class (dates, weeks, competencies).</p>
          <div class="toolbar" style="margin:0"><button class="btn small primary" id="xl-dl">${icon("download")} With this programme</button><button class="btn small" id="xl-dl0">Empty</button></div></div>
        <div><span class="xl-n">2</span><b>Fill it in Excel</b><p class="small muted">Sheets <i>Programme</i>, <i>Référentiel</i>, <i>Sprints</i>, <i>Planning</i> (one week per line). The first sheet explains each column. The YouCode planning file works as it is too.</p></div>
        <div><span class="xl-n">3</span><b>Upload it</b><p class="small muted">You check what was read before it's used.</p>
          <label class="btn primary file-btn">${icon("plus")} Choose the .xlsx file<input type="file" id="xl-up" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label></div>
      </div>
      <div id="xl-prev"></div>
    </div>
    <div class="panel set-card"><h3>Competency framework <span class="muted">${P.referential.length} · levels ${P.levels.map(esc).join(", ")}</span></h3>
      <div class="ref-list">${P.referential.map((c) => `<div><span class="tag comp ${c.kind}">${esc(cLabel(c.code))}</span> <span class="small">${esc(c.name)}</span></div>`).join("")}</div>
    </div>`;
  const slug = (P.name || "programme").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "");
  $("#xl-dl").onclick = () => saveBlob(programmeWorkbook(P), `Programme_${slug}.xlsx`);
  $("#xl-dl0").onclick = () => saveBlob(programmeWorkbook(P, true), "Programme_modele_vide.xlsx");
  if ($("#pg-use")) $("#pg-use").onclick = (e) => busy(e.currentTarget, async () => { await api("/program", { method: "PUT", body: { id: $("#pg-pick").value } }); REF = null; toast("Programme changed"); programmeSettings(root); });
  if ($("#pg-del")) $("#pg-del").onclick = () => confirmDialog("Delete this programme?", "The class goes back to the built-in programme. Briefs and results stay.", "Delete", async () => { await api(`/programs/${P.id}`, { method: "DELETE" }); REF = null; programmeSettings(root); }, true);
  $("#xl-up").onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const box = $("#xl-prev");
    box.innerHTML = `<p class="muted">⏳ Reading ${esc(f.name)}…</p>`;
    try {
      const raw = await XL.readXlsx(f);
      // only what's useful: no empty rows or trailing empty cells
      const sheets = Object.fromEntries(Object.entries(raw).map(([n, rows]) => [n, rows.map((r) => { const x = [...r]; while (x.length && !String(x[x.length - 1] ?? "").trim()) x.pop(); return x; }).filter((r, i, all) => r.length || all.slice(i).some((y) => y.length))]));
      const r = await api("/programs/parse", { method: "POST", body: { sheets, fileName: f.name } });
      const p = r.program;
      box.innerHTML = `<div class="xl-preview">
        <h3>What was read in ${esc(f.name)}</h3>
        ${r.warnings.length ? `<div class="notice warn">${r.warnings.map(esc).join("<br>")}</div>` : `<p class="small" style="color:var(--up)">✓ Everything was read.</p>`}
        <div class="field-row"><div><label for="xl-name">Name</label><input type="text" id="xl-name" value="${esc(p.name)}"></div><div><label for="xl-stack">Stack</label><input type="text" id="xl-stack" value="${esc(p.stack)}"></div></div>
        <div class="prog-figs"><div><b>${p.weeks.length}</b><span>weeks</span></div><div><b>${p.sprints.length}</b><span>sprints</span></div><div><b>${p.referential.length}</b><span>competencies</span></div><div><b>${p.weeks[0] ? dayLabelOf(p.weeks[0].start) : "—"}</b><span>to ${p.weeks.length ? dayLabelOf(p.weeks[p.weeks.length - 1].end) : "—"}</span></div></div>
        <div class="table-wrap xl-table"><table><thead><tr><th>Week</th><th>Dates</th><th>Type</th><th>Sprint</th><th>Title</th><th>Competencies</th></tr></thead>
          <tbody>${p.weeks.map((w) => `<tr><td>S${w.n}</td><td class="small">${dayLabelOf(w.start)} → ${dayLabelOf(w.end)}</td><td><span class="tag">${esc(KIND_EN[w.kind])}</span>${w.days ? ` <span class="small muted">${w.days} d · ${esc(w.mode)}</span>` : ""}</td><td>${w.sprint ?? ""}</td><td class="small">${esc(w.title)}</td><td class="small">${[...w.competencies, ...w.soft].map((c) => compChip(c)).join(" ")}</td></tr>`).join("")}</tbody></table></div>
        <div class="set-foot"><button class="btn" id="xl-cancel">Cancel</button><button class="btn primary" id="xl-save">Save and use it for this class</button></div></div>`;
      $("#xl-cancel").onclick = () => (box.innerHTML = "");
      $("#xl-save").onclick = (ev) => busy(ev.currentTarget, async () => {
        await api("/programs", { method: "POST", body: { id: P.custom ? P.id : null, data: { ...p, name: $("#xl-name").value || p.name, stack: $("#xl-stack").value || p.stack } } });
        REF = null; toast("Programme saved: briefs and competencies follow it now"); programmeSettings(root);
      });
    } catch (err) { box.innerHTML = `<div class="notice danger">${esc(err.message)}</div>`; }
  };
}

// ================================================================ COMPETENCIES
async function viewCompetencies(kind = "all") {
  const r = await loadRef(true);
  const ref = r.referential.filter((c) => kind === "all" || c.kind === kind);
  const cell = new Map(r.cells.map((x) => [`${x.discord_id}|${x.code}`, x]));
  const pctOf = (code) => { const n = r.students.filter((s) => (cell.get(`${s.discord_id}|${code}`)?.best ?? 0) > 0).length; return r.students.length ? Math.round((100 * n) / r.students.length) : 0; };
  const rows = r.students.map((s) => ({ ...s, ok: r.referential.filter((c) => (cell.get(`${s.discord_id}|${c.code}`)?.best ?? 0) > 0).length }));
  view.innerHTML = `
    <div class="page-head"><div><h1>Competencies</h1><p class="sub">The highest level each student validated, from their debriefs and assessments. ● = a level (${r.levels.map(esc).join(", ")}). Click a cell to validate or invalidate it yourself (✍️), click a name for the student.</p></div>
      ${segHtml("ck", [["all", "All"], ["tech", "Technical"], ["soft", "Transversal"]], kind)}</div>
    <section class="panel"><div class="table-wrap"><table class="grid-table comp-table">
      <thead><tr><th>Student</th><th class="num">Validated</th>${ref.map((c) => `<th class="ctr" title="${esc(c.name)}">${esc(c.label)}<div class="small muted">${pctOf(c.code)}%</div></th>`).join("")}</tr></thead>
      <tbody>${rows.map((s) => `<tr class="clickable" data-sid="${s.discord_id}"><td>${avatar(s.name, s.discord_id)} ${esc(s.name || s.discord_id)}</td><td class="num">${s.ok}/${r.referential.length}</td>
        ${ref.map((c) => { const x = cell.get(`${s.discord_id}|${c.code}`);
          return `<td class="ctr cc ${x ? "" : "none"}" data-cc="${esc(c.code)}" title="${esc(x ? `${c.label}: ${x.tries} result(s), ${x.fails} not validated${x.manual ? " · your decision" : ""}` : `${c.label}: no result yet`)} · click to validate / invalidate">${!x ? "·" : x.best ? dots(x.best, r.levels.length) : `<span class="lvl bad">not yet</span>`}${x?.manual ? `<span class="cm-man">✍️</span>` : ""}</td>`; }).join("")}</tr>`).join("")}</tbody>
    </table>${rows.length ? "" : `<p class="empty">No students yet.</p>`}</div></section>`;
  wireSeg(view, "ck", (v) => viewCompetencies(v));
  $$("[data-sid]").forEach((tr) => tr.onclick = (e) => {
    const td = e.target.closest("[data-cc]");
    if (!td) { location.hash = `#/student/${tr.dataset.sid}`; return; }
    const s = r.students.find((x) => x.discord_id === tr.dataset.sid), c = r.referential.find((x) => x.code === td.dataset.cc);
    const x = cell.get(`${tr.dataset.sid}|${c.code}`);
    compDecisionDialog({ sid: tr.dataset.sid, student: s?.name || tr.dataset.sid, code: c.code, label: c.label, name: c.name, level: x?.best || 0, manual: x?.manual || null, levels: r.levels }, () => viewCompetencies(kind));
  });
}

// =========================================================== on the student page
const SRC_LABEL = (h) => h.source === "brief" ? `<a href="#/brief/${h.ref}">Brief</a>` : h.source === "assessment" ? `<a href="#/assessment/${h.ref}">Assessment</a>` : h.source === "manual" ? "✍️ <b>Teacher's decision</b>" : esc(h.source);

/** The teacher decides a competency for one student: validated at a level, not validated, or back to the automatic results. */
function compDecisionDialog(o, onSaved) {
  // o: { sid, student, code, label, name, level, manual, history, levels }
  const cur = o.manual ? (o.manual.ok ? String(o.manual.level || 1) : "0") : String(o.level || 0);
  const levels = o.levels?.length ? o.levels : LV_NAMES;
  openDialog(`${o.label} · ${o.name}`, `
    ${o.student ? `<p class="small muted" style="margin-top:0">${esc(o.student)}</p>` : ""}
    <p>${dots(o.level, levels.length)} ${o.level ? `Validated up to <b>N${o.level} · ${esc(levels[o.level - 1] || "")}</b>` : "Not validated"}${o.manual ? ` <span class="tag">your decision</span>` : ` <span class="muted small">from the debriefs and assessments</span>`}</p>
    <div class="cd-box">
      <label>Your decision</label>
      ${segHtml("cd", [["0", "✗ Not validated"], ...levels.map((l, i) => [String(i + 1), `✓ N${i + 1} · ${l}`])], cur)}
      <label for="cd-note" style="margin-top:10px">Why <span class="muted">(optional, kept in the history)</span></label>
      <input type="text" id="cd-note" maxlength="200" style="width:100%" value="${esc(o.manual?.note || "")}" placeholder="e.g. Seen in class: can't explain their flexbox layout">
      <p class="muted small" style="margin:8px 0 0">Your decision replaces every earlier result for this competency. Later briefs and assessments still count on top of it.</p>
    </div>
    ${o.history ? `<h3 style="margin-top:14px">History</h3>${o.history.length ? `<ul class="ev-list small">${o.history.map((h) => `<li>${h.ok ? "✅" : "❌"} ${h.level ? `N${h.level} · ` : ""}${SRC_LABEL(h)}${h.note ? ` · ${esc(h.note)}` : ""} <span class="muted">${fmtDate(h.at)}</span></li>`).join("")}</ul>` : `<p class="muted small">No debrief or assessment has judged it yet.</p>`}`
      : o.sid ? `<p class="small"><a href="#/student/${esc(o.sid)}">Full history on the student page →</a></p>` : ""}`,
  [
    ...(o.manual ? [{ label: "↺ Back to automatic", action: async () => { const r = await api(`/students/${o.sid}/competency`, { method: "POST", body: { code: o.code, reset: true } }); dlg.close(); toast("Back to the automatic results"); onSaved?.(r.competency); } }] : []),
    { label: "Save decision", primary: true, action: async () => {
      const v = Number(segVal(dlg, "cd") || 0);
      const r = await api(`/students/${o.sid}/competency`, { method: "POST", body: { code: o.code, ok: v > 0, level: v || null, note: $("#cd-note", dlg).value } });
      dlg.close();
      toast(v ? `${o.label} validated at N${v}` : `${o.label} marked not validated`);
      onSaved?.(r.competency);
    } },
  ]);
  wireSeg(dlg, "cd");
}

const BSTATE = (b) => {
  const rv = b.review;
  if (rv?.status === "final") return ["solved", "Finalized"];
  if (rv) return ["pending", "Debrief draft"];
  if (b.handin) return ["pending", "Handed in · to debrief"];
  if (b.due && b.due < Date.now() / 1000) return ["failed", "Not handed in"];
  return ["pending", "In progress"];
};
function studentBriefCard(b, i, compNameOf) {
  const rv = b.review;
  const [stc, stl] = BSTATE(b);
  const link = `#/debrief/${b.id}~${encodeURIComponent(b.who)}`;
  const repos = rv?.repos?.length ? rv.repos : b.handin ? [b.handin.repo] : [];
  const reqs = rv?.reqs || [];
  const main = reqs.filter((r) => r.type !== "bonus");
  const done = reqs.filter((r) => r.done), todo = reqs.filter((r) => !r.done);
  const byType = (list) => list.map((r) => `<li class="${r.done ? "ok" : "ko"}"><span>${r.done ? "✓" : "✗"}</span><div>${esc(r.t)}${r.type ? ` <span class="sbx-type">${esc(EXTYPE[r.type] || r.type)}</span>` : ""}</div></li>`).join("");
  const mesTxt = rv?.mes ? (MES.find(([v]) => v === rv.mes.r)?.[1] || "not done yet") : "";
  return `<details class="sbx" ${i === 0 ? "open" : ""}>
    <summary>
      <div class="sbx-title"><b>${esc(b.title)}</b>${b.squad ? ` <span class="tag">${esc(b.squad.name)}${b.squad.sm ? " · SM" : ""}</span>` : ""}
        <div class="small muted">${b.due ? `due ${fmtDate(b.due)}` : ""}${repos.length ? ` · ${repos.map((r) => esc(r)).join(", ")}` : ""}${b.pushed === "late" ? ` · <span style="color:var(--down)">pushed late</span>` : b.pushed === "on" ? " · pushed on time" : ""}</div></div>
      <div class="sbx-right">${rv?.pct != null ? `<div class="sbx-pct"><b style="color:${masteryInk(rv.pct)}">${rv.pct}%</b><span class="small muted">${main.filter((r) => r.done).length}/${main.length} required</span></div>` : ""}
        ${(rv?.ok || []).length || (rv?.ko || []).length ? `<div class="sbx-comps">${(rv.ok || []).map((c) => compChip(c, "ok")).join("")}${(rv.ko || []).map((c) => compChip(c, "ko")).join("")}</div>` : ""}
        ${levelChip(rv?.level, rv?.levelProposed)}${status(stc, stl)}</div>
    </summary>
    <div class="sbx-body">
      ${rv ? `
      ${rv.resume ? `<p style="margin-top:0">${esc(rv.resume)}</p>` : ""}
      <div class="sbx-grid">
        <div><h4>Features & requirements <span class="muted small">${done.length}/${reqs.length} done</span></h4>
          ${reqs.length ? `${todo.length ? `<p class="sbx-sub">Missing or not working</p><ul class="sbx-list">${byType(todo)}</ul>` : ""}
            ${done.length ? `<p class="sbx-sub">Done</p><ul class="sbx-list">${byType(done)}</ul>` : ""}` : `<p class="muted small">No requirement found in the brief.</p>`}</div>
        <div><h4>Competencies</h4>
          ${(rv.comps || []).length ? `<ul class="sbx-list">${rv.comps.map((c) => `<li class="${c.ok ? "ok" : "ko"}"><span>${c.ok ? "✓" : "✗"}</span><div>${compChip(c.code, c.ok ? "ok" : "ko")} ${esc(compNameOf(c.code))}${c.why ? `<div class="small muted">${esc(c.why)}</div>` : ""}</div></li>`).join("")}</ul>` : `<p class="muted small">This brief has no competencies.</p>`}
          ${(rv.checks || []).length ? `<h4>Automatic checks <span class="muted small">${rv.checks.filter((c) => c.ok).length}/${rv.checks.length}</span></h4><ul class="sbx-list">${rv.checks.map((c) => `<li class="${c.ok ? "ok" : "ko"}"><span>${c.ok ? "✓" : "✗"}</span><div>${esc(c.label)}${!c.ok && c.detail ? `<div class="small muted">${esc(c.detail)}</div>` : ""}</div></li>`).join("")}</ul>` : ""}
          ${rv.mes ? `<h4>Mise en situation</h4><p class="small" style="margin:0">${esc(rv.mes.title)} · <b>${esc(mesTxt)}</b>${rv.mes.note ? ` · ${esc(rv.mes.note)}` : ""}</p>` : ""}</div>
      </div>
      ${(rv.forts || []).length || (rv.ameliorer || []).length ? `<div class="sbx-grid">${(rv.forts || []).length ? `<div><h4>👍 Strengths</h4><ul class="small">${rv.forts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "<div></div>"}${(rv.ameliorer || []).length ? `<div><h4>🛠️ To improve</h4><ul class="small">${rv.ameliorer.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}</div>` : ""}
      ${rv.comment ? `<details class="sbx-comment"><summary class="small"><b>Comment sent to the student</b></summary><div class="small">${esc(rv.comment)}</div></details>` : ""}`
      : `<p class="muted small" style="margin-top:0">${b.handin ? "Handed in, not analyzed yet. The debrief reads the repo and judges each feature and competency." : "Nothing to show yet: no debrief."}</p>`}
      <div class="toolbar" style="margin:10px 0 0">${repos.map((r) => `<a class="btn small" href="https://github.com/${esc(r)}" target="_blank" rel="noopener">🐙 ${esc(r)}</a>`).join("")}
        <a class="btn small" href="#/brief/${b.id}">The brief</a>
        ${rv || b.handin || (b.due && b.due < Date.now() / 1000) ? `<a class="btn small primary" href="${link}">${rv ? "Open the debrief →" : "Debrief it →"}</a>` : ""}</div>
    </div></details>`;
}

const LEVEL_UI = { excellent: ["Excellent", "lv-ex"], bon: ["Bon", "lv-good"], moyen: ["Moyen", "lv-mid"], faible: ["Faible", "lv-low"], critique: ["Critique", "lv-crit"] };
const levelChip = (l, proposed = false) => (l && LEVEL_UI[l] ? `<span class="lvchip ${LEVEL_UI[l][1]}" title="${proposed ? "proposed, not decided yet" : "level"}">${LEVEL_UI[l][0]}${proposed ? " ?" : ""}</span>` : "");

/** The student page, part by part: "briefs" (debriefs and sprint reviews), "comps" (competency map), "assess" (assessments). */
function learningPanel(d, sid, part = "comps") {
  const L = d.learning;
  if (!L) return "";
  const comps = L.competencies;
  const nameOf = (code) => { const p = parseC(code); return comps.find((c) => c.code === p?.code)?.name || ""; };
  if (part === "briefs") {
    const finals = L.briefs.filter((b) => b.review?.pct != null);
    const avgPct = finals.length ? Math.round(finals.reduce((s, b) => s + b.review.pct, 0) / finals.length) : null;
    const debriefed = L.briefs.filter((b) => b.review);
    return `<div class="stack">
      <div class="stu-mini-figs">
        <div><b>${L.briefs.length}</b><span>brief(s)</span></div>
        <div><b>${debriefed.filter((b) => b.review.status === "final").length}</b><span>debriefs finalized</span></div>
        <div><b>${debriefed.filter((b) => b.review.status !== "final").length}</b><span>debriefs in draft</span></div>
        <div><b ${avgPct != null ? `style="color:${masteryInk(avgPct)}"` : ""}>${avgPct != null ? avgPct + "%" : "—"}</b><span>requirements met on average</span></div>
      </div>
      ${(L.sprints || []).length ? `<section class="panel"><div class="panel-head"><h2>🏁 Sprint reviews</h2><a class="btn small" href="#/sprints">Sprints →</a></div>
        <div class="spr-list">${L.sprints.map((x) => `<div class="spr"><b>Sprint ${x.sprint}</b><span class="small muted">${esc(x.title || "")}</span>
          <div>${levelChip(x.level || x.plevel, !x.level && !!x.plevel)} ${x.decision ? `<span class="lvl ${x.decision === "valide" ? "ok" : "bad"}">${x.decision === "valide" ? "✓ validated" : "✗ not validated"}</span>` : `<span class="muted small">no decision yet</span>`}</div>
          ${x.note ? `<div class="small">${esc(x.note)}</div>` : ""}</div>`).join("")}</div></section>` : ""}
      <section class="panel" id="learn-briefs">
        <div class="panel-head"><h2>📄 Briefs and their debriefs</h2><span class="small muted">open one to see what they built, the competencies and the comment</span></div>
        ${L.briefs.length ? `<div class="sbx-stack">${L.briefs.slice(0, 12).map((b, i, arr) => studentBriefCard(b, arr.findIndex((x) => x.review) === i ? 0 : 1, nameOf)).join("")}</div>` : `<p class="muted small">No brief assigned yet.</p>`}
      </section></div>`;
  }
  if (part === "assess") {
    const done = L.assessments.filter((a) => a.score != null);
    const avg = done.length ? Math.round(done.reduce((s, a) => s + a.score, 0) / done.length) : null;
    const VD = { correct: ["ok", "✓"], partial: ["warn", "½"], wrong: ["bad", "✗"], empty: ["none", "—"] };
    return `<div class="stack">
      <div class="stu-mini-figs">
        <div><b>${L.assessments.length}</b><span>assessment(s)</span></div>
        <div><b>${done.length}</b><span>graded</span></div>
        <div><b ${avg != null ? `style="color:${masteryInk(avg)}"` : ""}>${avg != null ? avg + "%" : "—"}</b><span>average score</span></div>
      </div>
      ${L.assessments.length ? L.assessments.map((a) => `<section class="panel asx">
        <div class="asx-head">
          <div class="asx-ring" style="--p:${a.score ?? 0};--c:${a.score != null ? masteryInk(a.score) : "var(--line-strong)"}"><b>${a.score != null ? a.score + "%" : "—"}</b></div>
          <div class="asx-title"><a href="#/assessment/${a.id}~${sid}"><b>${esc(a.title)}</b></a>
            <div class="small muted">${status(a.status === "locked" ? "failed" : ["graded", "submitted"].includes(a.status) ? "solved" : "pending", STATUS[a.status] || a.status)}
              ${a.submitted_at ? ` · handed in ${fmtDate(a.submitted_at)}` : ""}${a.score != null ? ` · ${a.score >= a.passAt ? "passed" : `below ${a.passAt}%`}` : ""}${a.brief ? ` · brief <a href="#/brief/${a.brief.id}">${esc(a.brief.title)}</a>` : ""}</div></div>
          <a class="btn small" href="#/assessment/${a.id}~${sid}" title="Their paper: answers, grades and comments">Open their paper →</a>
        </div>
        ${a.comps.length ? `<div class="asx-comps">${a.comps.map((c) => `<span class="tag comp ${c.ok ? "ok" : "ko"}" title="${esc(c.note || "")}">${c.ok ? "✓" : "✗"} ${esc(cText(c.code + (c.level ? "N" + c.level : "")))} <span class="muted">${esc(nameOf(c.code).slice(0, 40))}</span></span>`).join("")}</div>` : ""}
        ${a.questions.some((q) => q.verdict) ? `<div class="asx-qs">${a.questions.map((q) => { const v = VD[q.verdict] || ["", "·"];
          return `<div class="asx-q ${v[0]}" title="Q${q.n} · ${esc(q.prompt)}${q.verdict === "empty" ? " · not attempted" : q.score != null ? ` · ${q.score}/100` : ""}"><b>Q${q.n}</b><span>${v[1]}</span></div>`; }).join("")}</div>` : ""}
        ${a.summary ? `<p class="small asx-sum">${esc(a.summary)}</p>` : ""}
      </section>`).join("") : `<div class="empty-state"><div style="font-size:40px">📝</div><p class="muted">No assessment yet for this student.</p><a class="btn" href="#/assessments">Assessments →</a></div>`}
    </div>`;
  }
  const ok = comps.filter((c) => c.level > 0).length;
  const STC = { validated: "Validated", progress: "In progress", not_yet: "Not yet", none: "No result yet" };
  return `<div id="learn-wrap" class="stack">
    <section class="panel" id="learn">
    <div class="panel-head"><h2>🎓 Competencies <span class="muted">${esc(L.program)}</span></h2><span class="small"><b>${ok}/${comps.length}</b> validated</span></div>
    <div class="comp-map">${comps.map((c) => `<button type="button" class="cm ${c.status}" data-cm="${c.code}" title="${esc(c.name)} · ${STC[c.status]}${c.manual ? " · your decision" : ""} · click to change">
      <b>${esc(c.label)}${c.manual ? ` <span class="cm-man" title="Your decision">✍️</span>` : ""}</b>${dots(c.level, L.levels.length)}<small>${esc(c.name)}</small></button>`).join("")}</div>
    <p class="muted small cm-legend"><span class="cm-key validated"></span> validated <span class="cm-key progress"></span> validated before, missed last time <span class="cm-key not_yet"></span> not validated yet <span class="cm-key none"></span> no result yet · ✍️ your decision · <b>click one to see its history (briefs, assessments) or validate / invalidate it</b></p>
    </section></div>`;
}
function wireLearning(d, sid) {
  const L = d.learning;
  if (!L) return;
  sid = sid || d.player?.discord_id || (location.hash.split("/")[2] || "").split("?")[0];
  $$("[data-cm]").forEach((b) => b.onclick = () => {
    const c = L.competencies.find((x) => x.code === b.dataset.cm);
    compDecisionDialog({ sid, code: c.code, label: c.label, name: c.name, level: c.level, manual: c.manual, history: c.history, levels: L.levels }, (nc) => {
      if (nc) Object.assign(c, nc);
      $("#learn-wrap").outerHTML = learningPanel(d, sid, "comps");
      wireLearning(d, sid);
    });
  });
}

Object.assign(routes, {
  briefs: viewBriefs, brief: viewBrief, debrief: viewDebrief, assessments: viewAssessments, assessment: viewAssessment, github: viewGithub, competencies: viewCompetencies,
  projects: () => { location.hash = "#/briefs"; }, project: () => { location.hash = "#/briefs"; },
});
