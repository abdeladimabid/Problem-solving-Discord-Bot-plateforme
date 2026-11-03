// 📐 Settings → Fiche niveaux: the sprints' capacities (the concepts every evaluation must cover) and levels
// (src/shared/concepts.ts). Read from the Google Doc (or pasted text); each capacity counted or not; each item of the
// level boxes linked to its capacities.
/* global $, $$, api, esc, toast, busy, fmtAgo, openDialog, dlg */

const CN_LV = [["critique", "Critique"], ["faible", "Faible"], ["moyen", "Moyen"], ["bon", "Bon"], ["excellent", "Excellent"]];

async function conceptsSettings(root, d = null) {
  try { d = d || (await api("/settings/concepts")); } catch (e) { root.innerHTML = `<div class="notice danger">${esc(e.message)}</div>`; return; }
  const src = d.source || {};
  const from = src.kind === "doc" ? `the Google Doc, read ${esc(fmtAgo(src.at))}` : src.kind === "paste" ? `pasted text, ${esc(fmtAgo(src.at))}` : "the Fiche A1 built into ClassBot (Sprint 1 and 2)";
  root.innerHTML = `
    <div class="panel set-card">
      <h3 style="margin-top:0">The rules</h3>
      <ul class="small cn-rules">
        <li>The <b>concepts</b> are the capacities of each sprint (« Détail des capacités attendues »). Every question of an assessment, a mise en situation or a debrief says which capacities it touches.</li>
        <li>Each evaluation covers the capacities of its scope (its week or brief) with <b>at least ${d.min} questions each</b> (a question can touch several). The AI and the prompts for Claude are told so, and ClassBot checks it.</li>
        <li>A capacity is <b>understood</b> when, over all the sprint's evaluations, at least ${d.min} questions touched it and <b>more than half</b> are right (correct = 1, partly = ½). In a debrief you can decide it yourself (project, oral questions).</li>
        <li>A <b>level</b> is reached when at least half of its items are understood, and every level below too. <b>Bon</b> is the level expected to validate the sprint.</li>
        <li>Untick a capacity to leave it out: it is no longer asked or counted.</li>
      </ul>
    </div>
    <div class="panel set-card">
      <h3 style="margin-top:0">Where it comes from</h3>
      <p class="small">Now: <b>${from}</b>.${src.doc ? ` <a href="https://docs.google.com/document/d/${esc(src.doc)}/edit" target="_blank" rel="noopener noreferrer">Open the Doc ↗</a>` : ""}</p>
      <div class="field-row"><input type="url" id="cn-url" placeholder="https://docs.google.com/document/d/…" value="${src.doc ? `https://docs.google.com/document/d/${esc(src.doc)}/edit` : ""}" style="flex:1">
        <button class="btn primary" id="cn-read">${src.kind === "doc" ? "Read it again" : "Read the Google Doc"}</button></div>
      <p class="small muted">Share the Doc as « Anyone with the link: Viewer »${d.email ? `, or with <code>${esc(d.email)}</code> as Viewer (then turn on the « Google Docs API » in its Google Cloud project)` : ""}. The sprints it has replace the same sprints here; a sprint not in it stays. Read it again whenever you add a sprint.</p>
      <details><summary class="small">Or paste the text of the Fiche</summary>
        <textarea id="cn-text" rows="8" style="width:100%;margin-top:6px" placeholder="FICHE DE VALIDATION DU SPRINT 3 …"></textarea>
        <p style="margin:6px 0 0"><button class="btn" id="cn-paste">Read this text</button></p></details>
      <div id="cn-msg"></div>
    </div>
    ${d.sprints.map((sp) => cnSprintHtml(sp)).join("")}`;
  const after = (r, msg) => {
    toast(msg);
    conceptsSettings(root, r);
    if (r.problems?.length) setTimeout(() => { const m = $("#cn-msg", root); if (m) m.innerHTML = `<div class="notice">${r.problems.map(esc).join("<br>")}</div>`; }, 50);
  };
  $("#cn-read", root).onclick = (e) => busy(e.currentTarget, async () => {
    const r = await api("/settings/concepts/import", { method: "POST", body: { url: $("#cn-url", root).value.trim() } });
    after(r, `Read: ${r.read.map((x) => `Sprint ${x.n} (${x.caps} capacities, ${x.items} level items)`).join(", ")}`);
  });
  $("#cn-paste", root).onclick = (e) => busy(e.currentTarget, async () => {
    const t = $("#cn-text", root).value.trim();
    if (!t) throw new Error("Paste the text of the Fiche first.");
    const r = await api("/settings/concepts/import", { method: "POST", body: { text: t } });
    after(r, `Read: ${r.read.map((x) => `Sprint ${x.n}`).join(", ")}`);
  });
  $$("[data-cnoff]", root).forEach((c) => c.onchange = async () => {
    const r = await api("/settings/concepts", { method: "PUT", body: { off: { [c.dataset.cnoff]: c.checked } } });
    toast(c.checked ? `${c.dataset.cnoff} counts again` : `${c.dataset.cnoff} left out: not asked, not counted`);
    conceptsSettings(root, r);
  });
  $$("[data-cnlink]", root).forEach((b) => b.onclick = () => {
    const sp = d.sprints.find((x) => `S${x.n}` === b.dataset.cnlink.split(".")[0]);
    const [, lv, k] = b.dataset.cnlink.split(".");
    const it = sp.levels[lv][Number(k) - 1];
    openDialog("Which capacities does this item rely on?", `<p>${esc(it.text)}</p>
      <div class="cn-pick">${sp.caps.map((c) => `<label class="check"><input type="checkbox" value="${c.n}" ${it.caps.includes(c.n) ? "checked" : ""}> <span><b>${c.n}.</b> ${esc(c.title)}</span></label>`).join("")}</div>
      <p class="small muted">The item counts as understood when all its capacities are.</p>`,
    [{ label: "Save", primary: true, action: async () => {
      const caps = $$(".cn-pick input:checked", dlg).map((x) => Number(x.value));
      if (!caps.length) throw new Error("Tick at least one capacity.");
      const r = await api("/settings/concepts", { method: "PUT", body: { link: { key: b.dataset.cnlink, caps } } });
      dlg.close(); toast("Saved"); conceptsSettings(root, r);
    } }]);
  });
}

function cnSprintHtml(sp) {
  const on = sp.caps.filter((c) => !c.off).length;
  return `<div class="panel set-card cn-sprint">
    <h3 style="margin:0">Sprint ${sp.n}${sp.title ? ` · ${esc(sp.title)}` : ""}</h3>
    ${sp.goal ? `<p class="small muted" style="margin:4px 0 10px">${esc(sp.goal)}</p>` : ""}
    <h4 class="cn-h">Capacities <span class="muted small">${on}/${sp.caps.length} counted</span></h4>
    <div class="cn-caps">${sp.caps.map((c) => `<div class="cn-cap ${c.off ? "off" : ""}">
      <label class="check"><input type="checkbox" data-cnoff="${esc(c.code)}" ${c.off ? "" : "checked"}> <span><b class="cn-code">${esc(c.code)}</b> ${esc(c.title)}</span></label>
      <details><summary class="small muted">${c.points.length} points</summary><ul class="small">${c.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></details></div>`).join("")}</div>
    <details class="cn-levels"><summary><b>Levels</b> <span class="muted small">· each item and the capacities it relies on (click to change)</span></summary>
      ${CN_LV.map(([k, l]) => `<div class="cn-lv"><h5>${l}${k === "bon" ? ` <span class="tag">expected to validate</span>` : ""}</h5><ul class="small">${(sp.levels[k] || []).map((it, i) => `<li>${esc(it.text)} <button class="cn-chip" data-cnlink="S${sp.n}.${k}.${i + 1}" title="Change its capacities">${it.caps.length ? it.caps.map((n) => `S${sp.n}.${n}`).join(" + ") : "none"}</button></li>`).join("")}</ul></div>`).join("")}
    </details></div>`;
}

// ---------------------------------------------------------------- in the evaluations (assessments, mises en situation)
/**
 * 📐 The capacities an evaluation covers: its sprint's, ticked from its brief / week / topic (GET /concepts/suggest);
 * the teacher changes them. Shows how many questions that asks (5 per capacity, a question can touch 2).
 */
async function conceptsPicker(box, q = {}, picked = null, o = {}) {
  // a sprint picked by hand (the week's isn't in the Fiche yet) is kept when the brief or the topic changes
  if (!q.sprint && box.dataset.sprint) q = { ...q, sprint: box.dataset.sprint };
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)]));
  let r;
  try { r = await api(`/concepts/suggest?${qs}`); } catch (e) { box.innerHTML = `<p class="small muted">${esc(e.message)}</p>`; return; }
  const on = new Set(picked && picked.length ? picked : r.scope);
  if (!r.sprint) {
    box.innerHTML = `<div class="cn-pickbox"><b>📐 Fiche niveaux</b> <span class="small muted">· ${r.programmeSprint ? `Sprint ${r.programmeSprint} isn't in the Fiche yet` : "no sprint found"}: add it in Settings → Fiche niveaux (the capacities can't be checked before).</span>
      ${r.sprints.length ? `<label class="small">Or use the sprint <select data-cnsp><option value="">—</option>${r.sprints.map((s) => `<option value="${s.n}">Sprint ${s.n} · ${esc(s.title)}</option>`).join("")}</select></label>` : ""}</div>`;
    const sel = $("[data-cnsp]", box);
    if (sel) sel.onchange = () => { box.dataset.sprint = sel.value; conceptsPicker(box, { ...q, sprint: sel.value }, null, o); };
    return;
  }
  box.innerHTML = `<div class="cn-pickbox"><div><b>📐 Fiche niveaux · Sprint ${r.sprint}</b> <span class="small muted">· ${o.mise ? `the capacities it covers: each one worked on by ${r.min} of the 10 situations and QCM at least` : `the capacities this one covers, ${r.min} questions each at least (a question can touch two)`}</span></div>
    <div class="cn-picklist">${r.caps.map((c) => `<label class="check" title="${esc(c.points.join(" · "))}"><input type="checkbox" data-cncap value="${esc(c.code)}" ${on.has(c.code) ? "checked" : ""}> <span><b class="cn-code">${esc(c.code)}</b> ${esc(c.title)}</span></label>`).join("")}</div>
    <p class="small" data-cnneed></p></div>`;
  const need = () => {
    const n = $$("[data-cncap]:checked", box).length;
    $("[data-cnneed]", box).innerHTML = !n ? `<span style="color:var(--down)">Tick at least one capacity: every evaluation must cover the Fiche.</span>`
      : o.mise ? (n > 5 ? `<span style="color:var(--down)">${n} capacities: too many for 10 items (each would have to work on ${Math.ceil((n * r.min) / 10)}). Keep 5 at most, and cover the others in another mise en situation or an assessment.</span>` : `→ <b>${n}</b> capacit${n > 1 ? "ies" : "y"}, each in ${r.min} of the 10 items.`)
      : `→ <b>${n}</b> capacit${n > 1 ? "ies" : "y"}: at least <b>${Math.ceil((n * r.min) / 2)}</b> questions (${r.min} per capacity).`;
    box.dispatchEvent(new CustomEvent("cnchange", { detail: { n, min: Math.ceil((n * r.min) / 2) } }));
  };
  $$("[data-cncap]", box).forEach((c) => c.onchange = need);
  need();
}
const pickedConcepts = (box) => $$("[data-cncap]:checked", box).map((c) => c.value);
/** Each capacity of the scope: how many questions touch it (5 at least), from the questions' "concepts". */
function conceptCoverageHtml(scope, items, labels = {}) {
  if (!scope || !scope.length) return `<div class="notice small">📐 No capacity of the Fiche niveaux chosen for this one: pick them (they decide the questions to write and the levels).</div>`;
  const cnt = Object.fromEntries(scope.map((c) => [c, 0]));
  for (const it of items) for (const c of new Set(it.concepts || [])) if (c in cnt) cnt[c]++;
  const low = scope.filter((c) => cnt[c] < 5);
  return `<div class="cn-cov ${low.length ? "bad" : "ok"}"><b>📐 Fiche niveaux</b> ${low.length ? `<span class="lvl bad">${low.length} capacit${low.length > 1 ? "ies" : "y"} under 5 questions</span>` : `<span class="lvl good">every capacity has its 5 questions</span>`}
    <div class="cn-covl">${scope.map((c) => `<span class="cn-covc ${cnt[c] >= 5 ? "ok" : "ko"}" title="${esc(labels[c] || c)}"><b>${esc(c)}</b> ${cnt[c]}/5</span>`).join("")}</div></div>`;
}

// ---------------------------------------------------------------- what a learner understood (Fiche niveaux)
const CN_STATE = { ok: ["✓ understood", "good"], ko: ["✗ not understood", "bad"], few: ["… fewer than 5 questions", "warn"] };
const CN_FROM = { assessment: "📝", mise: "🧪", oral: "🗣️" };
/** Each capacity of the sprint: questions asked, right, understood or not, your decision; the level the Fiche gives. */
function masteryHtml(r, uid) {
  if (!r.sprint) return `<p class="small muted">The Fiche niveaux has no capacities for this sprint yet: add it in Settings → Fiche niveaux.</p>`;
  const lv = r.level;
  return `<div class="cn-mast">
    <p style="margin:0 0 8px">Level by the Fiche: ${lv.reached ? `<b class="cn-lvl cn-${esc(lv.reached)}">${esc(CN_LV.find((x) => x[0] === lv.reached)?.[1] || lv.reached)}</b>` : `<span class="muted">not enough questions yet</span>`}
      <span class="small muted">· a level is reached when at least half of its items are understood, and every level below</span></p>
    <div class="cn-lvls">${lv.per.map((p) => `<span class="cn-lvp ${p.items && p.understood * 2 >= p.items ? "ok" : ""}" title="${p.unknown ? `${p.unknown} item(s) not evaluated enough` : ""}"><b>${esc(CN_LV.find((x) => x[0] === p.level)?.[1] || p.level)}</b> ${p.understood}/${p.items}${p.pct != null ? ` · ${p.pct}%` : ""}</span>`).join("")}</div>
    <table class="grid-table cn-mtab"><thead><tr><th>Capacity</th><th class="num">Asked</th><th class="num">Right</th><th>State</th><th>Your decision</th></tr></thead><tbody>
    ${r.caps.map((c) => `<tr><td><b class="cn-code">${esc(c.code)}</b> ${esc(c.title)}${c.evidence.length ? `<details class="small"><summary class="muted">${c.evidence.length} question(s)</summary>${c.evidence.map((e) => `<div>${CN_FROM[e.from] || ""} ${esc(e.label)} — <b>${e.got === 1 ? "✓" : e.got === 0 ? "✗" : "½"}</b></div>`).join("")}</details>` : ""}</td>
      <td class="num">${c.asked}</td><td class="num">${c.got}</td>
      <td><span class="lvl ${CN_STATE[c.state][1]}">${CN_STATE[c.state][0]}</span>${c.pct != null ? ` <span class="small muted">${c.pct}%</span>` : ""}</td>
      <td><span class="cn-dec">${[[true, "✓"], [false, "✗"]].map(([v, l]) => `<button type="button" class="btn small ${c.teacher === v ? "primary" : ""}" data-cndec="${esc(c.code)}" data-v="${v}" title="${v ? "Understood (you decide: a project, an oral…)" : "Not understood (you decide)"}">${l}</button>`).join("")}${c.teacher != null ? `<button type="button" class="btn small" data-cndec="${esc(c.code)}" data-v="auto" title="Back to the questions">↺</button>` : ""}</span></td></tr>`).join("")}
    </tbody></table>
    <p class="small muted">📝 assessments · 🧪 mises en situation · 🗣️ debrief oral questions (counted once the debrief is finalized). Correct = 1, partly = ½.</p></div>`;
}
async function loadMastery(box, uid, q = {}) {
  const qs = new URLSearchParams(Object.entries({ uid, ...q }).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)]));
  let r;
  try { r = await api(`/concepts/mastery?${qs}`); } catch (e) { box.innerHTML = `<p class="small" style="color:var(--down)">${esc(e.message)}</p>`; return; }
  box.innerHTML = masteryHtml(r, uid);
  $$("[data-cndec]", box).forEach((b) => b.onclick = () => busy(b, async () => {
    await api("/concepts/decide", { method: "POST", body: { uid, code: b.dataset.cndec, ok: b.dataset.v === "auto" ? null : b.dataset.v === "true" } });
    toast("Saved"); loadMastery(box, uid, q);
  }));
}
function masteryDialog(uid, name, q = {}) {
  openDialog(`📐 ${name || uid} · Fiche niveaux`, `<div id="cn-md"><p class="muted small">Loading…</p></div>`, []);
  dlg.classList.add("wide");
  loadMastery($("#cn-md", dlg), uid, q);
}
