// 🩺 Sprint diagnosis (the « Diagnostic » tab of #/sprints): what the class is missing in a sprint, and what to do.
//   • the objectives of the sprint (its competencies): reached / lower level / missed, on the LAST brief that covers them
//   • the lacunes shared by the students (assessment, debrief notes, oral), the most shared first
//   • the features of the last brief not done · the students to follow
//   • actions sized to how many share a problem: 💻 a live coding in the next days (most of the class), 📦 into the next
//     brief (a part of it), 🧭 a plan d'action each (a few) — and ✨ the AI's proposals for the whole sprint
/* global $, $$, api, esc, view, toast, busy, avatar, openDialog, dlg, copyText, compChip, dayLabelOf, fmtAgo */

const SD = { n: null, D: null, tab: "all" };
const SD_SHARE = { majority: ["Majority", "sd-maj", "Most of the class: show it to everyone"], group: ["Part of the class", "sd-grp", "A group: work on it together"], few: ["A few", "sd-few", "A few students: an individual plan"] };
const SD_SRC = { assessment: "📝 Assessment", debrief: "💬 Debrief", oral: "🎤 Oral" };
const SD_KIND = { live: ["💻", "Live coding"], veille: ["📖", "Veille"], brief: ["📦", "Into the next brief"], plan: ["🧭", "Plans d'action"] };
const sdPct = (n, of) => (of ? Math.round((100 * n) / of) : 0);
const sdPeople = (list, max = 8) => `<span class="sd-people">${list.slice(0, max).map((s) => `<a href="#/student/${esc(s.uid)}" title="${esc(s.name)}">${avatar(s.name, s.uid)}</a>`).join("")}${list.length > max ? `<span class="sd-more">+${list.length - max}</span>` : ""}</span>`;
const sdBar = (parts) => `<span class="sd-bar">${parts.filter((p) => p.n).map((p) => `<i class="${p.cls}" style="flex:${p.n}" title="${esc(p.title)}"></i>`).join("")}</span>`;
const sdNext = (d = new Date()) => { const x = new Date(d); do { x.setDate(x.getDate() + 1); } while ([0, 6].includes(x.getDay())); return x.toISOString().slice(0, 10); };

async function renderDiag(n, box) {
  SD.n = n;
  box.innerHTML = `<div class="skeleton" style="height:420px"></div>`;
  SD.D = await api(`/sprints/${n}/diag`);
  drawDiag(box);
}

function drawDiag(box) {
  const D = SD.D, S = D.sprint;
  // the sprint's objectives (planning): the share of the class reaching each one evaluated
  const gItems = (D.goals || []).flatMap((g) => g.items).filter((i) => i.covered);
  const avg = gItems.length && D.evaluated ? Math.round(gItems.reduce((a, i) => a + 100 * (1 - i.n / D.evaluated), 0) / gItems.length) : null;
  const shared = D.lacunes.filter((l) => l.n >= 2);
  const st = { upcoming: ["Upcoming", "muted"], running: ["In progress", "sd-run"], done: ["Finished", "sd-done"] }[S.state];
  const days = (Date.parse(S.end) - Date.parse(S.start)) / 864e5 + 1, gone = Math.min(days, Math.max(0, (Date.now() - Date.parse(S.start)) / 864e5));
  const lacList = D.lacunes.filter((l) => SD.tab === "all" || l.share === SD.tab);
  box.innerHTML = `
    <section class="panel sd-hero">
      <div class="sd-hero-top"><div><span class="sd-state ${st[1]}">${st[0]}</span><h2>Sprint ${S.n} · ${esc(S.title)}</h2>
        <p class="small muted">${dayLabelOf(S.start)} → ${dayLabelOf(S.end)}${S.technologies ? ` · ${esc(S.technologies)}` : ""}</p></div>
        <div class="toolbar" style="margin:0"><button class="btn primary" id="sd-ai">✨ ${D.actions ? "Propose again" : "Propose actions"}</button></div></div>
      <span class="sd-time" title="${Math.round(gone)} of ${Math.round(days)} days"><i style="width:${sdPct(gone, days)}%"></i></span>
      ${S.objectives ? `<details class="small"><summary>Pedagogical objectives (planning)</summary><p class="muted" style="white-space:pre-wrap;margin:6px 0 0">${esc(S.objectives)}</p></details>` : ""}
      <div class="sd-briefs">${D.briefs.map((b, i) => `<a class="sd-brief" href="#/brief/${b.id}"><b>${esc(b.title)}</b><span class="small muted">${i === 0 ? "last brief · " : ""}due ${dayLabelOf(b.due)}</span>
        <span class="small">${b.debriefs} debrief${b.debriefs === 1 ? "" : "s"}${b.final < b.debriefs ? ` <span class="muted">(${b.final} finalized)</span>` : ""}${b.assessed ? ` · ${b.assessed} assessed` : ""}</span></a>`).join("") || `<span class="muted small">No brief in this sprint yet.</span>`}</div>
    </section>
    ${!D.evaluated ? `<section class="panel"><p class="empty">No debrief analyzed and no graded assessment in this sprint yet. Analyze the debriefs of its briefs (Progress) or grade their assessment: the diagnosis comes from them.</p></section>` : `
    <div class="sd-kpis">
      <div class="sd-kpi"><b>${avg ?? "—"}${avg != null ? "<small>%</small>" : ""}</b><span>of the sprint's objectives reached (class average)</span></div>
      <div class="sd-kpi ${shared.length ? "warn" : ""}"><b>${shared.length}</b><span>lacunes shared by 2+ students</span></div>
      <div class="sd-kpi ${D.follow.length ? "bad" : ""}"><b>${D.follow.length}</b><span>students to follow</span></div>
      <div class="sd-kpi"><b>${D.evaluated}<small>/${D.students}</small></b><span>students with results</span></div>
    </div>
    ${D.actions ? actionsHtml(D.actions) : ""}
    <section class="panel"><div class="panel-head"><h2>🎯 Objectives of the sprint</h2><span class="muted small">planning · Technologies / concepts</span></div>
      <p class="small muted" style="margin:-6px 0 10px">Who still has a lacune on each one in their last brief (assessment, debrief, oral). Not evaluated yet: no question and no lacune is about it.</p>
      ${(D.goals || []).length ? `<div class="sd-goals">${goalsHtml(D.goals)}</div>` : `<p class="empty small">The programme's sprint has no « Technologies / concepts » (Settings → Programme: import the planning file).</p>`}</section>
    <section class="panel"><div class="panel-head"><h2>✅ Competency validation</h2><span class="muted small">each one judged on the last brief that covers it</span></div>
      ${D.objectives.length ? `<div class="sd-objs">${D.objectives.map((o, i) => (o.kind === "tech" ? objHtml(o, i) : "")).join("")}</div>
        ${D.objectives.some((o) => o.kind === "soft") ? `<details class="sd-soft" ${D.objectives.some((o) => o.kind === "tech") ? "" : "open"}><summary><b>Transversal competencies</b> <span class="muted small">mostly seen at the oral: they don't put a student in « to follow »</span></summary>
          <div class="sd-objs">${D.objectives.map((o, i) => (o.kind === "soft" ? objHtml(o, i) : "")).join("")}</div></details>` : ""}` : `<p class="empty small">The programme gives no competency for this sprint.</p>`}</section>
    <section class="panel"><div class="panel-head"><h2>🧩 Lacunes</h2>
        <div class="seg" role="group">${[["all", "All"], ["majority", "Majority"], ["group", "Part"], ["few", "A few"]].map(([v, l]) => `<button type="button" data-sdtab="${v}" aria-pressed="${SD.tab === v}">${l} <span class="muted">${v === "all" ? D.lacunes.length : D.lacunes.filter((x) => x.share === v).length}</span></button>`).join("")}</div></div>
      <p class="small muted" style="margin:-6px 0 10px">The notions each student missed in their last brief: its assessment, your one-to-one note or the debrief's remarks, the oral questions.</p>
      ${lacList.length ? `<div class="sd-lacs">${lacList.map((l, i) => lacHtml(l, D.lacunes.indexOf(l))).join("")}</div>` : `<p class="empty small">${D.lacunes.length ? "None here." : "No lacune found: the assessments are right and the debriefs say nothing to review."}</p>`}</section>
    <div class="sd-two">
      <section class="panel sd-cmt"><div class="panel-head"><h2>📝 Sprint comment</h2><span class="toolbar" style="margin:0"><button class="btn small primary" id="sd-cgen">✨ ${D.comment ? "Write again" : "Write it"}</button><button class="btn small" id="sd-csave">Save</button><button class="btn small" id="sd-ccopy">Copy</button></span></div>
        <p class="small muted" style="margin:-6px 0 8px">For the administration's report: the objectives the class reached and the ones it hasn't yet, and the follow-up planned. The same as in the Bilan administratif.</p>
        <textarea id="sd-c" rows="12" placeholder="✨ Write it: from the objectives of the sprint, the levels and the lacunes of the class.">${esc(D.comment || "")}</textarea></section>
      <section class="panel"><div class="panel-head"><h2>👥 Students to follow</h2><span class="muted small">${D.follow.length} of ${D.evaluated}</span></div>
        <p class="small muted" style="margin:-6px 0 8px">Only the ones who stand out: a weak level, several competencies missed, or far more lacunes than the rest of the class.</p>
        ${D.follow.length ? `<ul class="sd-follow">${D.follow.map((x, i) => `<li>${avatar(x.name, x.uid)}<div><a href="#/student/${esc(x.uid)}"><b>${esc(x.name)}</b></a>${x.level ? ` <span class="lvl ${["faible", "critique"].includes(x.level) ? "bad" : x.level === "moyen" ? "warn" : "ok"}">${esc(x.level)}</span>` : ""}${x.draft ? ` <span class="tag" title="Their last debrief isn't finalized">draft</span>` : ""}
          <div class="sd-why">${(x.why || []).map((w) => `<span class="sd-tag sd-maj">${esc(w)}</span>`).join("")}</div>
          <div class="small muted">${[x.missed.length ? `${x.missed.length} competenc${x.missed.length > 1 ? "ies" : "y"} missed (${x.missed.join(", ")})` : "", x.lacunes.length ? `${x.lacunes.length} lacune${x.lacunes.length > 1 ? "s" : ""}: ${x.lacunes.slice(0, 3).join(", ")}${x.lacunes.length > 3 ? "…" : ""}` : "", x.features ? `${x.features} feature${x.features > 1 ? "s" : ""} not done` : ""].filter(Boolean).map(esc).join(" · ")}</div></div>
          <button class="btn small" data-sdplan="${i}">🧭 Plan d'action</button></li>`).join("")}</ul>` : `<p class="empty small">Nobody stands out: every student reached the objectives.</p>`}</section>
    </div>`}`;
  wireDiag(box);
}

/** The planning's objectives, by group (« HTML5 », « Mise en page »…): each item, who still has a lacune on it. */
function goalsHtml(goals) {
  // the index of each item in the planning's order (the actions find it by it); the groups not evaluated yet first
  let k = -1;
  const all = goals.map((g) => ({ g, items: g.items.map((it) => ({ it, i: ++k })) }));
  return [...all.filter((x) => !x.g.items.some((it) => it.covered)), ...all.filter((x) => x.g.items.some((it) => it.covered))].map(({ g, items }) => {
    const seen = items.filter((x) => x.it.covered), later = items.filter((x) => !x.it.covered);
    const one = g.items.length === 1 && g.items[0] === g.group;
    return `<div class="sd-goal"><div class="sd-goal-h"><b>${esc(g.group)}</b>${seen.length ? `<span class="small muted">${seen.filter((x) => x.it.share === "few").length}/${seen.length} reached by most</span>` : `<span class="small muted">not evaluated yet</span>`}</div>
      ${seen.map(({ it, i }) => `<div class="sd-gi"><span class="sd-gi-n">${one ? "" : esc(it.name)}</span>
        ${sdBar([{ n: Math.max(0, it.of - it.n), cls: "ok", title: `${it.of - it.n} without a lacune on it` }, { n: it.n, cls: it.share === "majority" ? "bad" : it.share === "group" ? "warn" : "few", title: `${it.n} with a lacune` }])}
        <span class="small sd-gi-c">${it.n ? `<span class="${it.share === "few" ? "" : "sd-miss"}">${it.n}/${it.of}</span> to review` : `<span class="lvl ok">✓ reached</span>`}</span>
        <span class="sd-gi-a">${it.n ? (it.n > 2 ? sdPeople(it.missing, 5) : "<span></span>") + actionButtons("g", i, it.share, it.n) : ""}</span></div>`).join("")}
      ${later.length ? `<div class="sd-gi-later small muted">Not evaluated yet: ${later.map(({ it }) => esc(it.name)).join(" · ")}</div>` : ""}</div>`;
  }).join("");
}
function objHtml(o, i) {
  const seen = o.reached + o.low.length + o.missed.length;
  const miss = [...o.missed, ...o.low];
  return `<div class="sd-obj ${miss.length ? "" : "ok"}">
    <div class="sd-obj-name">${compChip(`${o.label}N${o.level}`)}<div><b>${esc(o.name || o.label)}</b><div class="small muted">${o.from.length ? esc(o.from.join(" · ")) : "not evaluated yet"}${o.notEvaluated ? ` · ${o.notEvaluated} not evaluated` : ""}</div></div></div>
    <div class="sd-obj-bar">${seen ? sdBar([{ n: o.reached, cls: "ok", title: `${o.reached} reached` }, { n: o.low.length, cls: "warn", title: `${o.low.length} at a lower level` }, { n: o.missed.length, cls: "bad", title: `${o.missed.length} not reached` }]) : `<span class="sd-bar empty"></span>`}
      <span class="small sd-obj-nums"><b>${o.pct ?? "—"}${o.pct != null ? "%" : ""}</b> reached${o.low.length ? ` · <span class="sd-low">${o.low.length} lower level</span>` : ""}${o.missed.length ? ` · <span class="sd-miss">${o.missed.length} not reached</span>` : ""}</span></div>
    <div class="sd-obj-act">${miss.length ? `${sdPeople(miss, 6)}${actionButtons("o", i, o.share, miss.length)}` : `<span class="lvl ok">✓ all reached</span>`}</div></div>`;
}
function lacHtml(l, i) {
  const [lab, cls, hint] = SD_SHARE[l.share];
  return `<article class="sd-lac ${cls}">
    <div class="sd-lac-top"><span class="sd-count ${cls}" title="${esc(hint)}">${l.n}<small>/${l.of}</small></span><div><b>${esc(l.notion)}</b>
      <div class="small muted">${l.sources.map((s) => SD_SRC[s] || s).join(" · ")} · ${esc(l.briefs.join(", "))}</div></div><span class="sd-tag ${cls}">${lab}</span></div>
    ${sdBar([{ n: l.n, cls: l.share === "majority" ? "bad" : l.share === "group" ? "warn" : "few", title: `${l.n} students` }, { n: Math.max(0, l.of - l.n), cls: "rest", title: "" }])}
    <div class="sd-lac-foot">${sdPeople(l.students, 10)}${actionButtons("l", i, l.share, l.n)}</div></article>`;
}
/** The actions that fit how many share it. */
function actionButtons(kind, i, share, n) {
  const live = `<button class="btn small" data-sdgo="live" data-sdk="${kind}" data-sdi="${i}" title="A live coding in the next days, for the whole class">💻 Live coding</button>`;
  const brief = `<button class="btn small" data-sdgo="brief" data-sdk="${kind}" data-sdi="${i}" title="Add user stories to a brief that hasn't started">📦 Next brief</button>`;
  const plan = `<button class="btn small" data-sdgo="plan" data-sdk="${kind}" data-sdi="${i}" title="A plan d'action for each of them, on this">🧭 Plan${n > 1 ? `s ×${n}` : ""}</button>`;
  return `<span class="sd-acts">${share === "few" ? plan + brief : share === "group" ? brief + live + plan : live + brief}</span>`;
}
function actionsHtml(A) {
  return `<section class="panel sd-ai"><div class="panel-head"><h2>✨ Proposed actions</h2><span class="muted small">${fmtAgo(A.at)}</span></div>
    ${A.resume ? `<p class="sd-ai-sum">${esc(A.resume)}</p>` : ""}
    <div class="sd-acards">${A.actions.map((a, i) => { const [ic, lab] = SD_KIND[a.type] || SD_KIND.live; return `<article class="sd-acard sd-k-${a.type}">
      <div class="sd-acard-head"><span class="sd-kind">${ic} ${lab}</span>${a.ids.length ? `<span class="small muted">${a.ids.length} problem${a.ids.length > 1 ? "s" : ""}</span>` : ""}</div>
      <b>${esc(a.title)}</b>${a.why ? `<p class="small muted">${esc(a.why)}</p>` : ""}${a.content ? `<p class="small">${esc(a.content)}</p>` : ""}
      <div class="toolbar" style="margin:6px 0 0">${a.type === "plan" ? `<button class="btn small primary" data-sdai="${i}">🧭 Build the plans</button>` : a.type === "brief" ? `<button class="btn small primary" data-sdai="${i}">📦 Add to a brief</button>` : `<button class="btn small primary" data-sdai="${i}">${ic} Plan it</button>`}
        <button class="btn small" data-sdcopy="${i}">Copy</button></div></article>`; }).join("")}</div></section>`;
}

// ------------------------------------------------------------------ actions
/** What a row is about, and who. */
function sdItem(k, i) {
  const D = SD.D;
  if (k === "o") { const o = D.objectives[i]; return { text: `${o.name || o.label} (${o.label}N${o.level})`, students: [...o.missed, ...o.low], n: o.missed.length + o.low.length }; }
  if (k === "l") { const l = D.lacunes[i]; return { text: l.notion, students: l.students, n: l.n }; }
  if (k === "g") { const all = D.goals.flatMap((g) => g.items.map((it) => ({ ...it, group: g.group }))); const it = all[i]; return it && { text: it.group === it.name ? it.name : `${it.group} : ${it.name}`, students: it.missing, n: it.n }; }
  return null;
}
function sdStudentsOf(ids) {
  const D = SD.D, out = new Map();
  for (const id of ids) {
    const [k, rest] = [id.slice(0, 1), id.slice(2)];
    if (k === "l") { const l = D.lacunes.find((x) => x.key === rest.replace(/_/g, " ")); (l?.students || []).forEach((s) => out.set(s.uid, s)); }
    if (k === "o") { const o = D.objectives.find((x) => x.code === rest); [...(o?.missed || []), ...(o?.low || [])].forEach((s) => out.set(s.uid, s)); }
  }
  return [...out.values()];
}
/** 💻 / 📖 a live coding or a veille on a day of the next days, written by the Activités page's generator from this. */
function sdLiveDialog(kind, title, proposal) {
  openDialog(kind === "veille" ? "📖 Plan a veille" : "💻 Plan a live coding", `
    <p class="small muted" style="margin-top:0">Written like your other ${kind === "veille" ? "veilles" : "live codings"} (Activités), from this proposal. You can still change it there.</p>
    <label for="sd-day">Day</label><input type="date" id="sd-day" value="${sdNext()}" min="${new Date().toISOString().slice(0, 10)}">
    <label for="sd-prop">What to show</label><textarea id="sd-prop" rows="6" maxlength="1500">${esc(proposal)}</textarea>`,
    [{ label: kind === "veille" ? "📖 Write the veille" : "💻 Write the live coding", primary: true, action: async () => {
      const body = { day: $("#sd-day").value, kind, proposal: $("#sd-prop").value };
      toast("⏳ Writing it…");
      let r = await api("/activities/item", { method: "POST", body });
      if (r.exists) {
        const extra = confirm(`This day already has a ${kind === "veille" ? "veille" : "live coding"}: « ${r.exists.title} ».\n\nOK: add this one as an extra activity of the day.\nCancel: choose another day.`);
        if (!extra) return;
        r = await api("/activities/item", { method: "POST", body: { ...body, extra: true } });
        if (r.exists) throw new Error("That day already has its extra activity too: choose another day.");
      }
      dlg.close();
      toast(`${kind === "veille" ? "Veille" : "Live coding"} « ${r.item?.title || title} » planned on ${dayLabelOf(body.day)}`);
      sdOpenLink("#/activities", "Open Activités");
    } }]);
}
function sdOpenLink(href, label) {
  const t = document.querySelector(".toast:last-child");
  if (t) { const a = document.createElement("a"); a.href = href; a.textContent = ` ${label} →`; a.style.marginLeft = "6px"; t.appendChild(a); }
}
/** 📦 user stories added to a brief that hasn't started. */
function sdBriefDialog(items) {
  const D = SD.D;
  if (!D.next.length) {
    openDialog("📦 Into the next brief", `<p>No brief after this sprint yet. When you write it (Briefs → New, <b>Wishes</b>), ask for:</p><pre class="sd-pre">${esc(items.join("\n"))}</pre>`,
      [{ label: "Copy", primary: true, action: () => { copyText(items.join("\n"), "Copied"); dlg.close(); } }]);
    return;
  }
  openDialog("📦 Into the next brief", `
    <p class="small muted" style="margin-top:0">The AI adds 1 or 2 user stories that make the students work on it; the rest of the brief stays. A brief that has started never changes.</p>
    <label for="sd-b">Brief</label><select id="sd-b">${D.next.map((b) => `<option value="${b.id}">${esc(b.title)}${b.start ? ` · starts ${dayLabelOf(b.start)}` : ""}${b.status === "draft" ? " · draft" : ""}</option>`).join("")}</select>
    <label>To work on</label><ul class="small">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <label for="sd-w">Your wish <span class="muted small">(optional)</span></label><input type="text" id="sd-w" maxlength="300" placeholder="e.g. as a bonus, or in the contact page">`,
    [{ label: "📦 Add it", primary: true, action: async () => {
      toast("⏳ Rewriting the user stories…");
      const r = await api(`/sprints/${SD.n}/carry`, { method: "POST", body: { brief: Number($("#sd-b").value), items, wish: $("#sd-w").value } });
      dlg.close();
      openDialog(`📦 Added to « ${r.brief.title} »`, r.added.length ? `<ul>${r.added.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p>The user stories were rewritten with it.</p>`,
        [{ label: "Open the brief", primary: true, action: () => { dlg.close(); location.hash = `#/brief/${r.brief.id}`; } }]);
    } }]);
}
/** 🧭 a plan d'action for each student, its diagnosis focused on this (one by one: each is an AI call). */
async function sdPlans(students, focus) {
  if (!students.length) return toast("Nobody to plan for", true);
  if (students.length > 1 && !confirm(`Build a plan d'action for ${students.length} students (${students.map((s) => s.name).join(", ")})?\nOne AI diagnosis each, focused on: ${focus}`)) return;
  const made = [];
  for (const [k, s] of students.entries()) {
    toast(`⏳ Plan d'action ${k + 1}/${students.length}: ${s.name}…`);
    const plans = await api(`/wplans?student=${encodeURIComponent(s.uid)}`).catch(() => []);
    const id = plans.find((p) => p.status === "draft")?.id || (await api("/wplans", { method: "POST", body: { student: s.uid } })).id;
    try { await api(`/wplans/${id}/diagnose`, { method: "POST", body: { ask: `Concentre le plan sur : ${focus}` } }); } catch (e) { toast(`${s.name}: ${e.message}`, true); }
    made.push({ ...s, id });
  }
  if (made.length === 1) { location.hash = `#/wplan/${made[0].id}`; return; }
  openDialog("🧭 Plans d'action ready", `<p class="small muted" style="margin-top:0">Drafts: check them, then send each one.</p><ul class="sd-planlist">${made.map((m) => `<li>${avatar(m.name, m.uid)} <a href="#/wplan/${m.id}">${esc(m.name)}</a></li>`).join("")}</ul>`,
    [{ label: "Close", action: () => dlg.close() }]);
  $$(".sd-planlist a", dlg).forEach((a) => a.onclick = () => dlg.close());
}

function wireDiag(box) {
  const D = SD.D;
  $$("[data-sdtab]", box).forEach((b) => b.onclick = () => { SD.tab = b.dataset.sdtab; drawDiag(box); });
  if ($("#sd-ai", box)) $("#sd-ai", box).onclick = (e) => busy(e.currentTarget, async () => {
    toast("⏳ The AI reads the sprint…");
    const r = await api(`/sprints/${SD.n}/actions`, { method: "POST", body: {} });
    D.actions = r.actions; drawDiag(box);
    box.querySelector(".sd-ai")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $$("[data-sdgo]", box).forEach((b) => b.onclick = () => {
    const it = sdItem(b.dataset.sdk, Number(b.dataset.sdi));
    if (!it) return;
    const what = `${it.text} (${it.n} apprenant${it.n > 1 ? "s" : ""} sur ${D.evaluated} ne la maîtrisent pas, sprint ${D.sprint.n})`;
    if (b.dataset.sdgo === "live") sdLiveDialog("live", it.text, `Live coding de remédiation : ${what}. Reprends la notion pas à pas sur un petit exemple concret, avec les erreurs fréquentes.`);
    else if (b.dataset.sdgo === "brief") sdBriefDialog([it.text]);
    else busy(b, () => sdPlans(it.students, it.text));
  });
  $$("[data-sdplan]", box).forEach((b) => b.onclick = () => busy(b, async () => {
    const x = D.follow[Number(b.dataset.sdplan)];
    await sdPlans([{ uid: x.uid, name: x.name }], [...x.missed.map((c) => `objectif ${c} non atteint`), ...x.lacunes].slice(0, 6).join(" ; ") || "ses lacunes du sprint");
  }));
  $$("[data-sdai]", box).forEach((b) => b.onclick = () => busy(b, async () => {
    const a = D.actions.actions[Number(b.dataset.sdai)];
    const text = [a.title, a.content].filter(Boolean).join(" : ");
    if (a.type === "live" || a.type === "veille") sdLiveDialog(a.type, a.title, text);
    else if (a.type === "brief") sdBriefDialog([text]);
    else await sdPlans(sdStudentsOf(a.ids), text);
  }));
  if ($("#sd-cgen", box)) {
    $("#sd-cgen", box).onclick = (e) => busy(e.currentTarget, async () => {
      if ($("#sd-c").value.trim() && !confirm("Replace the comment?")) return;
      toast("⏳ Writing the comment…");
      const R = await api(`/sprints/${SD.n}/comment`, { method: "POST", body: {} });
      $("#sd-c").value = D.comment = R.comment; toast("Comment written and saved");
    });
    $("#sd-csave", box).onclick = (e) => busy(e.currentTarget, async () => { const R = await api(`/sprints/${SD.n}/comment`, { method: "PUT", body: { text: $("#sd-c").value } }); D.comment = R.comment; toast("Comment saved"); });
    $("#sd-ccopy", box).onclick = () => copyText($("#sd-c").value, "Comment copied");
  }
  $$("[data-sdcopy]", box).forEach((b) => b.onclick = () => { const a = D.actions.actions[Number(b.dataset.sdcopy)]; copyText([a.title, a.why, a.content].filter(Boolean).join("\n"), "Copied"); });
}
