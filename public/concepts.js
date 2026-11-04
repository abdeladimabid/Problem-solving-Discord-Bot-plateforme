// 📐 Settings → Fiche niveaux (src/shared/concepts.ts). The concepts are the ITEMS of each sprint's level boxes
// (S2.C3 = Critique, 3rd item): each one is the minimum of its level, checked on its own. Read from the Google Doc (or
// pasted text); each item (or a whole capacity) counted or not; each item linked to the capacities it relies on.
/* global $, $$, api, esc, toast, busy, fmtAgo, openDialog, dlg */

const CN_LV = [["critique", "Critique"], ["faible", "Faible"], ["moyen", "Moyen"], ["bon", "Bon"], ["excellent", "Excellent"]];
const cnLvName = (k) => CN_LV.find((x) => x[0] === k)?.[1] || k;

async function conceptsSettings(root, d = null) {
  try { d = d || (await api("/settings/concepts")); } catch (e) { root.innerHTML = `<div class="notice danger">${esc(e.message)}</div>`; return; }
  const src = d.source || {};
  const from = src.kind === "doc" ? `the Google Doc, read ${esc(fmtAgo(src.at))}` : src.kind === "paste" ? `pasted text, ${esc(fmtAgo(src.at))}` : "the Fiche A1 built into ClassBot (Sprint 1 and 2)";
  root.innerHTML = `
    <div class="panel set-card">
      <h3 style="margin-top:0">The rules</h3>
      <ul class="small cn-rules">
        <li>The <b>concepts</b> are the <b>items of each level</b>. Each item is the <b>minimum</b> a learner must show for that level, and is checked <b>on its own</b> (code <code>S2.M3</code> = Sprint 2, Moyen, 3rd item).</li>
        <li>The class evaluations (assessments, mises en situation) check <b>Moyen and Bon</b>, with <b>at least ${d.min} questions per item</b> (one question can check up to 3 items that go together). <b>Critique is never asked</b>: it's the floor.</li>
        <li>An item is <b>known</b> when at least ${d.min} proofs checked it and <b>more than half</b> are right. The proofs add up over the sprint: assessments, mises en situation, the debrief's oral questions and live task, and the project's code (proposed by the AI, confirmed by you). You can also decide an item yourself, or a whole capacity.</li>
        <li>A <b>level</b> needs <b>all</b> its items known. Moyen reached means Faible and Critique are there too. <b>Under Moyen</b>, the debrief checks the <b>Faible</b> items: all known → Faible, otherwise Critique. Bon reached: the debrief checks <b>Excellent</b>.</li>
        <li>Untick an item, or a whole capacity, to leave it out: it is no longer asked or counted.</li>
      </ul>
    </div>
    <div class="panel set-card">
      <h3 style="margin-top:0">Where it comes from</h3>
      <p class="small">Now: <b>${from}</b>.${src.doc ? ` <a href="https://docs.google.com/document/d/${esc(src.doc)}/edit" target="_blank" rel="noopener noreferrer">Open the Doc ↗</a>` : ""}</p>
      <div class="field-row"><input type="url" id="cn-url" placeholder="https://docs.google.com/document/d/…" value="${src.doc ? `https://docs.google.com/document/d/${esc(src.doc)}/edit` : ""}" style="flex:1">
        <button class="btn primary" id="cn-read">${src.kind === "doc" ? "Read it again" : "Read the Google Doc"}</button></div>
      <p class="small muted">${d.email ? `Keep the Doc private: in the Doc, <b>Share</b> → add <code>${esc(d.email)}</code> as <b>Viewer</b> (the same as the Suivi sheet), and turn on the « Google Docs API » once in its Google Cloud project. All the tabs (Sprint 1, 2, 3…) are read.` : "Share the Doc as « Anyone with the link: Viewer » (or add the Google service account in the Suivi Formateur tab, then share the Doc with it: the Doc stays private and all its tabs are read)."} The sprints it has replace the same sprints here; a sprint not in it stays. Read it again whenever you add a sprint.</p>
      <details><summary class="small">Or paste the text of the Fiche</summary>
        <textarea id="cn-text" rows="8" style="width:100%;margin-top:6px" placeholder="FICHE DE VALIDATION DU SPRINT 3 …"></textarea>
        <p style="margin:6px 0 0"><button class="btn" id="cn-paste">Read this text</button></p></details>
      <div id="cn-msg"></div>
    </div>
    <div class="panel set-card">
      <h3 style="margin-top:0">Old evaluations</h3>
      <p class="small">The assessments, mises en situation and debrief oral questions made before the Fiche (or tagged with the old capacity codes) don't count yet. The AI reads each question and links it to the items it really checks: their past answers then count at once, so the past sprints and debriefs give a level too. Nothing else changes in them.</p>
      <p class="toolbar" style="margin:0"><button class="btn primary" id="cn-old">📐 Link the old evaluations with the AI</button> <span class="small muted" id="cn-oldst"></span></p>
      <div id="cn-oldlog" class="small"></div>
    </div>
    ${d.sprints.map((sp) => cnSprintHtml(sp)).join("")}`;
  const after = (r, msg) => {
    toast(msg);
    conceptsSettings(root, r);
    if (r.problems?.length) setTimeout(() => { const m = $("#cn-msg", root); if (m) m.innerHTML = `<div class="notice">${r.problems.map(esc).join("<br>")}</div>`; }, 50);
  };
  $("#cn-read", root).onclick = (e) => busy(e.currentTarget, async () => {
    const r = await api("/settings/concepts/import", { method: "POST", body: { url: $("#cn-url", root).value.trim() } });
    after(r, `Read: ${r.read.map((x) => `Sprint ${x.n} (${x.items} level items, ${x.caps} capacities)`).join(", ")}`);
  });
  $("#cn-paste", root).onclick = (e) => busy(e.currentTarget, async () => {
    const t = $("#cn-text", root).value.trim();
    if (!t) throw new Error("Paste the text of the Fiche first.");
    const r = await api("/settings/concepts/import", { method: "POST", body: { text: t } });
    after(r, `Read: ${r.read.map((x) => `Sprint ${x.n}`).join(", ")}`);
  });
  $("#cn-old", root).onclick = (e) => busy(e.currentTarget, async () => {
    const { items } = await api("/concepts/old");
    const st = $("#cn-oldst", root), log = $("#cn-oldlog", root);
    if (!items.length) { st.textContent = "Everything is already linked."; return; }
    if (!confirm(`${items.length} evaluation(s) not linked yet. The AI links each one (about ${Math.ceil(items.length / 4)} min). Go?`)) return;
    const KIND = { assessment: "📝 Assessment", mise: "🧪 Mise en situation", oral: "🗣️ Debrief orals of" };
    let done = 0;
    for (const it of items) {
      st.textContent = `${done}/${items.length}…`;
      try {
        const r = await api("/concepts/link", { method: "POST", body: { kind: it.kind, id: it.id, apply: true } });
        const n = r.units.filter((u) => u.after.length).length;
        log.insertAdjacentHTML("beforeend", `<div>✓ ${KIND[it.kind]} « ${esc(it.title)} » · Sprint ${r.sprint} · ${n}/${r.units.length} linked</div>`);
      } catch (err) { log.insertAdjacentHTML("beforeend", `<div style="color:var(--down)">✗ ${KIND[it.kind]} « ${esc(it.title)} »: ${esc(err.message)}</div>`); }
      done++;
    }
    st.textContent = `Done: ${done}/${items.length}. Each learner's Fiche counts them now.`;
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
    openDialog("Which capacities does this item belong to?", `<p><b class="cn-code">${esc(it.code)}</b> ${esc(it.text)}</p>
      <div class="cn-pick">${sp.caps.map((c) => `<label class="check"><input type="checkbox" value="${c.n}" ${it.caps.includes(c.n) ? "checked" : ""}> <span><b>${c.n}.</b> ${esc(c.title)}</span></label>`).join("")}</div>
      <p class="small muted">Its capacities say what it is about (shown to the AI), and a decision on a whole capacity applies to it.</p>`,
    [{ label: "Save", primary: true, action: async () => {
      const caps = $$(".cn-pick input:checked", dlg).map((x) => Number(x.value));
      if (!caps.length) throw new Error("Tick at least one capacity.");
      const r = await api("/settings/concepts", { method: "PUT", body: { link: { key: b.dataset.cnlink, caps } } });
      dlg.close(); toast("Saved"); conceptsSettings(root, r);
    } }]);
  });
}

function cnSprintHtml(sp) {
  const items = CN_LV.flatMap(([k]) => sp.levels[k] || []);
  const on = items.filter((it) => !it.off).length;
  return `<div class="panel set-card cn-sprint">
    <h3 style="margin:0">Sprint ${sp.n}${sp.title ? ` · ${esc(sp.title)}` : ""}</h3>
    ${sp.goal ? `<p class="small muted" style="margin:4px 0 10px">${esc(sp.goal)}</p>` : ""}
    <h4 class="cn-h">Items of the levels <span class="muted small">${on}/${items.length} counted · each one the minimum of its level</span></h4>
    ${CN_LV.map(([k, l]) => `<div class="cn-lv"><h5>${l} <span class="muted small">${(sp.levels[k] || []).length} items</span>${k === "bon" ? ` <span class="tag">expected to validate</span>` : ""}${k === "critique" ? ` <span class="small muted">· never asked: the floor (a learner not Faible is Critique)</span>` : k === "faible" ? ` <span class="small muted">· checked in the debrief of a learner under Moyen</span>` : k === "excellent" ? ` <span class="small muted">· checked in the debrief of a learner who has Bon</span>` : ` <span class="small muted">· checked in the class evaluations</span>`}</h5>
      <div class="cn-items">${(sp.levels[k] || []).map((it, i) => `<div class="cn-item ${it.off ? "off" : ""}"><label class="check"><input type="checkbox" data-cnoff="${esc(it.code)}" ${it.off ? "" : "checked"}> <span><b class="cn-code">${esc(it.code)}</b> ${esc(it.text)}</span></label>
        <button class="cn-chip" data-cnlink="S${sp.n}.${k}.${i + 1}" title="Its capacities (click to change)">${it.caps.length ? it.caps.map((n) => `S${sp.n}.${n}`).join(" + ") : "no capacity"}</button></div>`).join("")}</div></div>`).join("")}
    <details class="cn-levels"><summary><b>Capacities</b> <span class="muted small">· ${sp.caps.filter((c) => !c.off).length}/${sp.caps.length} counted · untick one to leave out all its items</span></summary>
      <div class="cn-caps">${sp.caps.map((c) => `<div class="cn-cap ${c.off ? "off" : ""}">
        <label class="check"><input type="checkbox" data-cnoff="${esc(c.code)}" ${c.off ? "" : "checked"}> <span><b class="cn-code">${esc(c.code)}</b> ${esc(c.title)}</span></label>
        <details><summary class="small muted">${c.points.length} points</summary><ul class="small">${c.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></details></div>`).join("")}</div>
    </details></div>`;
}

// ---------------------------------------------------------------- in the evaluations (assessments, mises en situation)
/**
 * 📐 The items an evaluation covers: its sprint's, ticked from its brief / week / topic (GET /concepts/suggest), grouped
 * by level; the teacher changes them. Shows how many questions that asks (5 per item, a question can check 2).
 */
async function conceptsPicker(box, q = {}, picked = null, o = {}) {
  // a sprint picked by hand (the week's isn't in the Fiche yet) is kept when the brief or the topic changes
  if (!q.sprint && box.dataset.sprint) q = { ...q, sprint: box.dataset.sprint };
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)]));
  let r;
  try { r = await api(`/concepts/suggest?${qs}`); } catch (e) { box.innerHTML = `<p class="small muted">${esc(e.message)}</p>`; return; }
  const on = new Set(picked && picked.length ? picked : r.scope);
  if (!r.sprint) {
    box.innerHTML = `<div class="cn-pickbox"><b>📐 Fiche niveaux</b> <span class="small muted">· ${r.programmeSprint ? `Sprint ${r.programmeSprint} isn't in the Fiche yet` : "no sprint found"}: add it in Settings → Fiche niveaux (its items can't be checked before).</span>
      ${r.sprints.length ? `<label class="small">Or use the sprint <select data-cnsp><option value="">—</option>${r.sprints.map((s) => `<option value="${s.n}">Sprint ${s.n} · ${esc(s.title)}</option>`).join("")}</select></label>` : ""}</div>`;
    const sel = $("[data-cnsp]", box);
    if (sel) sel.onchange = () => { box.dataset.sprint = sel.value; conceptsPicker(box, { ...q, sprint: sel.value }, null, o); };
    return;
  }
  const cap = Object.fromEntries((r.caps || []).map((c) => [c.n, c.title]));
  const CL = r.classLevels || ["moyen", "bon"];
  box.innerHTML = `<div class="cn-pickbox"><details class="cn-auto" ${box.dataset.open === "1" ? "open" : ""}><summary><b>📐 Fiche niveaux · Sprint ${r.sprint}</b> <span data-cnsum></span> <span class="cn-chip">change</span></summary><p class="small muted" style="margin:6px 0">${o.mise ? `the items it checks: each one by ${r.min} of the 10 situations and QCM at least` : `the items this one checks, ${r.min} questions each at least (a question can check up to 3 that go together)`}. The class is checked on <b>Moyen and Bon</b>; Critique is never asked. Chosen automatically from its subject: change them if you want.</p>
    ${CN_LV.map(([k, l]) => { const its = r.items.filter((c) => c.level === k); return its.length ? `<details class="cn-pl" ${CL.includes(k) || its.some((c) => on.has(c.code)) ? "open" : ""}><summary><b>${l}</b> <span class="small muted" data-cnlvn="${k}"></span>${CL.includes(k) ? "" : ` <span class="small muted">· ${k === "faible" ? "checked in the debrief of a learner under Moyen" : "checked in the debrief of a learner who has Bon"}</span>`} <button type="button" class="cn-chip" data-cnall="${k}">all</button> <button type="button" class="cn-chip" data-cnnone="${k}">none</button></summary>
      <div class="cn-picklist">${its.map((c) => `<label class="check" title="${esc(c.caps.map((n) => cap[n] || "").filter(Boolean).join(" · "))}"><input type="checkbox" data-cncap data-lv="${k}" value="${esc(c.code)}" ${on.has(c.code) ? "checked" : ""}> <span><b class="cn-code">${esc(c.code)}</b> ${esc(c.text)}</span></label>`).join("")}</div></details>` : ""; }).join("")}
    <p class="small" data-cnneed></p></details></div>`;
  const need = () => {
    const n = $$("[data-cncap]:checked", box).length;
    for (const [k] of CN_LV) { const s = $(`[data-cnlvn="${k}"]`, box); if (s) s.textContent = `${$$(`[data-cncap][data-lv="${k}"]:checked`, box).length}/${$$(`[data-cncap][data-lv="${k}"]`, box).length}`; }
    $("[data-cnneed]", box).innerHTML = !n ? `<span style="color:var(--down)">Tick at least one item: every evaluation must cover the Fiche.</span>`
      : o.mise ? (n > 6 ? `<span style="color:var(--down)">${n} items: too many for 10 situations and QCM (each would have to check ${Math.ceil((n * r.min) / 10)}). Keep 6 at most, and cover the others in another mise en situation or an assessment.</span>` : `→ <b>${n}</b> item${n > 1 ? "s" : ""}, each checked by ${r.min} of the 10.`)
      : `→ <b>${n}</b> item${n > 1 ? "s" : ""}: at least <b>${Math.ceil((n * r.min) / (n > 6 ? 3 : 2))}</b> questions (${r.min} per item, up to ${n > 6 ? 3 : 2} per question).`;
    // the line shown when it's closed: what it checks, by level, and the questions it asks
    const by = CN_LV.map(([k, l]) => [l, $$(`[data-cncap][data-lv="${k}"]:checked`, box).map((c) => c.value.split(".")[1])]).filter(([, v]) => v.length);
    $("[data-cnsum]", box).innerHTML = n ? `<span class="small">· checks <b>${n}</b> item${n > 1 ? "s" : ""}: ${by.map(([l, v]) => `${l} ${v.join(", ")}`).join(" · ")}${o.mise ? "" : ` → at least <b>${Math.ceil((n * r.min) / (n > 6 ? 3 : 2))}</b> questions`}</span>` : `<span class="small" style="color:var(--down)">· no item: open to choose</span>`;
    box.dispatchEvent(new CustomEvent("cnchange", { detail: { n, min: Math.ceil((n * r.min) / (n > 6 ? 3 : 2)) } }));
  };
  $$("[data-cncap]", box).forEach((c) => c.onchange = need);
  $(".cn-auto", box).ontoggle = (e) => { box.dataset.open = e.currentTarget.open ? "1" : ""; };
  $$("[data-cnall],[data-cnnone]", box).forEach((b) => b.onclick = (e) => { e.preventDefault(); const k = b.dataset.cnall || b.dataset.cnnone; $$(`[data-cncap][data-lv="${k}"]`, box).forEach((c) => { c.checked = !!b.dataset.cnall; }); need(); });
  need();
}
const pickedConcepts = (box) => $$("[data-cncap]:checked", box).map((c) => c.value);
/** Each item of the scope: how many questions check it (5 at least), from the questions' "concepts". */
function conceptCoverageHtml(scope, items, labels = {}) {
  if (!scope || !scope.length) return `<div class="notice small">📐 No item of the Fiche niveaux chosen for this one: pick them (they decide the questions to write and the levels).</div>`;
  const cnt = Object.fromEntries(scope.map((c) => [c, 0]));
  for (const it of items) for (const c of new Set(it.concepts || [])) if (c in cnt) cnt[c]++;
  const low = scope.filter((c) => cnt[c] < 5);
  return `<div class="cn-cov ${low.length ? "bad" : "ok"}"><b>📐 Fiche niveaux</b> ${low.length ? `<span class="lvl bad">${low.length} item${low.length > 1 ? "s" : ""} under 5 questions</span>` : `<span class="lvl good">every item has its 5 questions</span>`}
    <div class="cn-covl">${scope.map((c) => `<span class="cn-covc ${cnt[c] >= 5 ? "ok" : "ko"}" title="${esc(labels[c] || c)}"><b>${esc(c)}</b> ${cnt[c]}/5</span>`).join("")}</div></div>`;
}

// ---------------------------------------------------------------- what a learner knows (Fiche niveaux)
const CN_STATE = { ok: ["✓ known", "good"], ko: ["✗ not known", "bad"], few: ["… fewer than 5 questions", "warn"] };
const CN_FROM = { assessment: "📝", mise: "🧪", oral: "🗣️", code: "💻", task: "🎯" };
const cnDecBtns = (code, teacher, what) => `<span class="cn-dec">${[[true, "✓"], [false, "✗"]].map(([v, l]) => `<button type="button" class="btn small ${teacher === v ? "primary" : ""}" data-cndec="${esc(code)}" data-v="${v}" title="${v ? `Known (you decide${what}: a project, an oral…)` : `Not known (you decide${what})`}">${l}</button>`).join("")}${teacher != null || what ? `<button type="button" class="btn small" data-cndec="${esc(code)}" data-v="auto" title="Let the questions decide again">↺</button>` : ""}</span>`;
/** Each item of the sprint, by level: questions asked, right, known or not, your decision; the level the Fiche gives. */
function masteryHtml(r, uid) {
  if (!r.sprint) return `<p class="small muted">The Fiche niveaux has no items for this sprint yet: add it in Settings → Fiche niveaux.</p>`;
  const lv = r.level;
  const nx = lv.next;
  return `<div class="cn-mast">
    <p style="margin:0 0 4px">Level by the Fiche: ${lv.toCheck ? `<b class="lvl bad">Under Moyen</b> <span class="small">Faible or Critique: <b>check the Faible items in the debrief</b> (all known → Faible, otherwise Critique)</span>` : lv.reached ? `<b class="cn-lvl cn-${esc(lv.reached)}">${esc(cnLvName(lv.reached))}</b>${lv.below ? ` <span class="small muted">(under Moyen)</span>` : ""}` : `<span class="muted">not enough proofs yet</span>`}
      <span class="small muted">· a level needs <b>all</b> its items known; Moyen reached means Faible and Critique too</span></p>
    ${nx ? `<p class="small" style="margin:0 0 8px">${lv.probe === "faible" ? "To check in the debrief," : lv.probe === "excellent" ? "To check in the debrief," : "For"} <b>${esc(cnLvName(nx.level))}</b>: ${nx.missing} item${nx.missing > 1 ? "s" : ""} missing${nx.ko ? ` · ${nx.ko} not known` : ""}${nx.few ? ` · ${nx.few} not checked enough yet` : ""}.${lv.probe ? " The debrief's oral questions and live task go to them first." : ""}</p>` : lv.reached ? `<p class="small" style="margin:0 0 8px">Every item of the sprint known.</p>` : ""}
    <div class="cn-lvls">${lv.per.filter((p) => p.items).map((p) => `<span class="cn-lvp ${p.full ? "ok" : ""}" title="${p.ko} not known · ${p.few} not checked enough"><b>${esc(cnLvName(p.level))}</b> ${p.known}/${p.items}${p.full ? " ✓" : ""}</span>`).join("")}</div>
    <table class="grid-table cn-mtab"><thead><tr><th>Item</th><th class="num">Asked</th><th class="num">Right</th><th>State</th><th>Your decision</th></tr></thead><tbody>
    ${CN_LV.map(([k, l]) => { const its = r.items.filter((c) => c.level === k); return its.length ? `<tr class="cn-lvrow"><th colspan="5">${l}</th></tr>${its.map((c) => `<tr><td><b class="cn-code">${esc(c.code)}</b> ${esc(c.text)}${c.evidence.length ? `<details class="small"><summary class="muted">${c.evidence.length} question(s)</summary>${c.evidence.map((e) => `<div>${CN_FROM[e.from] || ""} ${esc(e.label)} — <b>${e.got === 1 ? "✓" : e.got === 0 ? "✗" : "½"}</b></div>`).join("")}</details>` : ""}</td>
      <td class="num">${c.asked}</td><td class="num">${c.got}</td>
      <td><span class="lvl ${CN_STATE[c.state][1]}">${CN_STATE[c.state][0]}</span>${c.pct != null ? ` <span class="small muted">${c.pct}%</span>` : ""}${c.teacher != null ? ` <span class="small muted">→ you: ${c.teacher ? "known" : "not known"}</span>` : ""}</td>
      <td>${cnDecBtns(c.code, c.teacher, "")}</td></tr>`).join("")}` : ""; }).join("")}
    </tbody></table>
    ${r.caps?.length ? `<details class="small" style="margin-top:8px"><summary><b>Decide a whole capacity</b> <span class="muted">· e.g. Git or Jira judged on the repo: applies to all its items, every level</span></summary>
      <table class="grid-table cn-mtab"><tbody>${r.caps.map((c) => `<tr><td><b class="cn-code">${esc(c.code)}</b> ${esc(c.title)}</td><td class="num">${c.known}/${c.items} known</td><td>${cnDecBtns(c.code, null, " for all its items")}</td></tr>`).join("")}</tbody></table></details>` : ""}
    <p class="small muted">📝 assessments · 🧪 mises en situation · 🗣️ debrief oral questions and 🎯 live task (counted once the debrief is finalized) · 💻 the project's code (each proof you confirmed). Correct = 1, partly = ½.</p></div>`;
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

// ---------------------------------------------------------------- an old evaluation linked to the Fiche by the AI
/** 📐 The AI links each question of an assessment / mise / brief's debrief orals to the items it checks: shown, then saved. */
function ficheLinkDialog(kind, id, title, after, sprint = null) {
  openDialog(`📐 Link « ${title} » to the Fiche niveaux`, `<div id="fl-box"><p class="muted small">The AI reads each question… (up to a minute)</p></div>`, []);
  dlg.classList.add("wide");
  const box = $("#fl-box", dlg);
  api("/concepts/link", { method: "POST", body: { kind, id, sprint } }).then((r) => {
    const covered = r.items.filter((c) => c.n);
    box.innerHTML = `<p class="small">Sprint ${r.sprint} (and the sprints before it: a review counts for them too) · <b>${r.units.filter((u) => u.after.length).length}/${r.units.length}</b> question(s) linked. Only the items change, and the past answers count at once. <b>Change any line</b> (codes separated by commas, up to 3), or empty it.</p>
      <datalist id="fl-codes">${r.items.map((c) => `<option value="${esc(c.code)}">${esc(c.text)}</option>`).join("")}</datalist>
      <table class="grid-table"><thead><tr><th>Question</th><th>Before</th><th>Items</th></tr></thead><tbody>
      ${r.units.map((u) => `<tr><td class="small">${esc(u.text)}</td><td class="small muted">${esc(u.before.join(", ") || "—")}</td><td><input type="text" data-fl="${u.n}" list="fl-codes" value="${esc(u.after.join(", "))}" placeholder="none" style="width:150px;font-family:var(--mono, monospace)" title="${esc(u.after.map((c) => `${c}: ${r.items.find((x) => x.code === c)?.text || ""}`).join("\n"))}"></td></tr>`).join("")}</tbody></table>
      <p class="small" style="margin-top:8px"><b>Items checked:</b> ${covered.map((c) => `<span class="cn-covc ${c.n >= 5 ? "ok" : "ko"}" title="${esc(c.text)}"><b>${esc(c.code)}</b> ${c.n}</span>`).join(" ") || "none"}</p>
      <p class="toolbar"><button class="btn primary" id="fl-save">Save these links</button><button class="btn" id="fl-again">Ask again</button></p>`;
    $("#fl-save", dlg).onclick = (e) => busy(e.currentTarget, async () => {
      const links = Object.fromEntries($$("[data-fl]", dlg).map((x) => [x.dataset.fl, x.value.split(/[,;\s]+/).map((c) => c.trim().toUpperCase()).filter(Boolean)]));
      await api("/concepts/link", { method: "POST", body: { kind, id, sprint: r.sprint, apply: true, links } });
      dlg.close(); toast("Linked: their answers count in each learner's Fiche"); after && after();
    });
    $("#fl-again", dlg).onclick = () => ficheLinkDialog(kind, id, title, after, r.sprint);
  }).catch((e) => {
    box.innerHTML = `<p style="color:var(--down)">${esc(e.message)}</p>${/sprint/i.test(e.message) ? `<label class="small">Sprint <select id="fl-sp"><option value="">—</option>${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}">Sprint ${n}</option>`).join("")}</select></label>` : ""}`;
    const sel = $("#fl-sp", dlg);
    if (sel) sel.onchange = () => sel.value && ficheLinkDialog(kind, id, title, after, Number(sel.value));
  });
}

/** 💻 The project's code, item by item: the AI's proof, your confirmation (only confirmed proofs count). */
function ficheCodeHtml(f) {
  if (!f || !f.items?.length) return "";
  const ok = f.ok || {};
  const AI = { ok: ["✓ shown", "good"], ko: ["✗ not shown", "bad"], na: ["not visible", "warn"] };
  const todo = f.items.filter((it) => (it.ai === "ok" || it.ai === "ko") && !(it.code in ok)).length;
  return `<div class="cn-code-proofs"><div class="panel-head" style="margin:0 0 6px"><b>💻 The project's code</b> <span class="small muted">· what the AI saw in the repo for the brief's items; counted once you confirm</span>
    ${todo ? `<button type="button" class="btn small primary" data-fcall="1">Confirm the AI's ${todo}</button>` : ""}</div>
    <table class="grid-table cn-mtab"><tbody>${f.items.map((it) => `<tr><td><b class="cn-code">${esc(it.code)}</b> ${esc(it.text)}<div class="small muted">${esc(it.proof || "")}</div></td>
      <td><span class="lvl ${AI[it.ai]?.[1] || "warn"}">AI: ${AI[it.ai]?.[0] || it.ai}</span></td>
      <td><span class="cn-dec">${[[true, "✓"], [false, "✗"]].map(([v, l]) => `<button type="button" class="btn small ${ok[it.code] === v ? "primary" : ""}" data-fc="${esc(it.code)}" data-v="${v}" title="${v ? "Shown in the code: counts as a right answer" : "Not shown: counts as a wrong answer"}">${l}</button>`).join("")}${it.code in ok ? `<button type="button" class="btn small" data-fc="${esc(it.code)}" data-v="auto" title="Not counted">↺</button>` : ""}</span></td></tr>`).join("")}</tbody></table></div>`;
}
