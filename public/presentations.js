"use strict";
// Presentations: the veilles and live codings the students present. Share them in Discord, approve the requests
// (/activity choose, a veille in binôme), assign by hand or at random (fewest presentations first, no hard subject
// for a Faible or Critique student), then grade each presenter: the points only come then.
/* global $, $$, api, esc, toast, busy, view, openDialog, confirmDialog, dlg, loadDiscord, loadStudents, channelOptions, avatar, fmtAgo, table, refreshPills, routes */
let presTab = (() => { try { return localStorage.getItem("presTab") || "acts"; } catch { return "acts"; } })();
let presFilter = "all";
const PR_LV = { easy: "Easy", medium: "Medium", hard: "Hard" };
const PR_GRADES = [[100, "Excellent"], [75, "Good"], [50, "Average"], [25, "Weak"], [0, "Not presented"]];
const prKind = (k) => (k === "live" ? "Live coding" : "Veille");
const prDay = (d, o = { weekday: "short", day: "numeric", month: "short" }) => esc(new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { ...o, timeZone: "UTC" }));
const prMonday = (d) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
const prWho = (members) => members.map((m) => `<span class="pr-who">${avatar(m.name, m.id)}<span>${esc(m.name)}</span></span>`).join("");

async function viewPresentations() {
  const [d] = await Promise.all([api("/activities/presentations"), loadDiscord()]);
  const P = d;
  const free = P.items.filter((i) => !i.claim && !i.past);
  const behind = P.stats.rows.filter((r) => r.behind);
  const graded = P.history.filter((h) => h.status === "done").length;
  view.innerHTML = `
    <div class="page-head"><div><h1>Presentations</h1><p class="sub">The <b>veilles</b> (in binôme) and <b>live codings</b> (alone or in pairs) your students present. Share them in Discord, approve who presents what, then grade each presentation: the points only come then.</p></div>
      <div class="toolbar" style="margin:0"><a class="btn" href="#/activities">📅 Activités</a></div></div>
    <div class="figures cs-figs">
      <div class="figure"><div class="ico">📚</div><div><b>${free.length}</b><span>free activities</span></div></div>
      <div class="figure${P.pending.length ? " cs-attn" : ""}"><div class="ico">✋</div><div><b>${P.pending.length}</b><span>requests to approve</span></div></div>
      <div class="figure${P.toGrade.some((c) => c.past) ? " cs-attn" : ""}"><div class="ico">🏅</div><div><b>${P.toGrade.length}</b><span>to grade</span></div></div>
      <div class="figure"><div class="ico">🎤</div><div><b>${graded}</b><span>presented</span></div></div>
      <div class="figure"><div class="ico">⚖️</div><div><b>${P.stats.avg}</b><span>per student on average</span></div></div>
    </div>
    <div class="tabs cs-tabs" role="tablist">
      <button role="tab" data-pt="acts">📚 Activities</button>
      <button role="tab" data-pt="req">✋ Requests${P.pending.length ? ` <span class="pill">${P.pending.length}</span>` : ""}</button>
      <button role="tab" data-pt="grade">🏅 To grade${P.toGrade.length ? ` <span class="pill">${P.toGrade.length}</span>` : ""}</button>
      <button role="tab" data-pt="hist">🧾 History</button>
      <button role="tab" data-pt="stu">👥 Students${behind.length ? ` <span class="pill warn">${behind.length}</span>` : ""}</button>
    </div>
    <div id="pt-acts" class="cs-pane">${prActsPane(P, free)}</div>
    <div id="pt-req" class="cs-pane">${prReqPane(P)}</div>
    <div id="pt-grade" class="cs-pane">${prGradePane(P)}</div>
    <div id="pt-hist" class="cs-pane">${prHistPane(P)}</div>
    <div id="pt-stu" class="cs-pane">${prStuPane(P, free)}</div>`;
  const showTab = (k) => {
    presTab = k; try { localStorage.setItem("presTab", k); } catch { /* this visit only */ }
    $$("[data-pt]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.pt === k)));
    $$(".cs-pane").forEach((p) => (p.hidden = p.id !== `pt-${k}`));
  };
  $$("[data-pt]").forEach((b) => b.onclick = () => showTab(b.dataset.pt));
  showTab(["acts", "req", "grade", "hist", "stu"].includes(presTab) ? presTab : "acts");
  prWire(P, free);
}

// ------------------------------------------------------------- 📚 Activities
function prActsPane(P, free) {
  const shown = P.items.filter((i) => presFilter === "all" ? !i.past || i.claim?.status === "approved"
    : presFilter === "free" ? !i.claim && !i.past : presFilter === "taken" ? i.claim && i.claim.status === "approved" : presFilter === "done" ? i.claim?.status === "done" : true);
  const weeks = [];
  for (const it of shown) { const m = prMonday(it.day); let w = weeks.find((x) => x.m === m); if (!w) weeks.push((w = { m, items: [] })); w.items.push(it); }
  const counts = { all: P.items.filter((i) => !i.past || i.claim?.status === "approved").length, free: free.length, taken: P.items.filter((i) => i.claim?.status === "approved").length, done: P.items.filter((i) => i.claim?.status === "done").length };
  return `
    <section class="panel pr-share">
      <div class="pr-share-l"><h2>📣 Share in Discord</h2>
        <p class="muted small">Students see the free ones with <code>/activity list</code>, ask with <code>/activity choose</code> (a veille with their binôme) and read the subject with <code>/activity mine</code> once you approve.</p></div>
      <div class="pr-share-r">
        <label>Channel<select id="pr-ch"><option value="">Choose a channel…</option>${channelOptions(P.cfg.channel)}</select></label>
        <label>Veille<span class="unit-in"><input type="number" id="pr-pv" min="0" max="300" value="${P.cfg.veille}"><i>pts</i></span></label>
        <label>Live coding<span class="unit-in"><input type="number" id="pr-pl" min="0" max="300" value="${P.cfg.live}"><i>pts</i></span></label>
        <div class="pr-share-btns"><button class="btn primary" id="pr-share" ${free.length ? "" : "disabled"}>📣 Share ${free.length} free</button><button class="btn" id="pr-rand" ${free.length ? "" : "disabled"}>🎲 Assign at random</button></div>
      </div>
    </section>
    <div class="seg pr-filter" role="group" aria-label="Show">
      ${[["all", "Upcoming"], ["free", "Free"], ["taken", "Taken"], ["done", "Presented"]].map(([k, l]) => `<button type="button" data-pf="${k}" aria-pressed="${presFilter === k}">${l} <span class="muted">${counts[k]}</span></button>`).join("")}
    </div>
    ${weeks.length ? weeks.map((w) => `<section class="pr-week"><h3>Week of ${prDay(w.m, { day: "numeric", month: "long" })}</h3>
      <div class="pr-grid">${w.items.map(prCard).join("")}</div></section>`).join("")
      : `<section class="panel"><p class="empty">${P.items.length ? "Nothing here with this filter." : `No veille or live coding yet. Write them on the <a href="#/activities">Activités</a> page first.`}</p></section>`}`;
}
function prCard(it) {
  const c = it.claim;
  const st = c?.status === "done" ? ["done", "Presented"] : c ? ["taken", c.by === "random" ? "Assigned at random" : c.by === "teacher" ? "Assigned" : "Approved"]
    : it.past ? ["past", "Not presented"] : it.requests ? ["ask", `${it.requests} request${it.requests > 1 ? "s" : ""}`] : it.shared ? ["free", "Free"] : ["off", "Not shared"];
  const sizes = it.kind === "live" ? [1, 2] : [2, 3];
  return `<article class="pr-card k-${it.kind} st-${st[0]}" data-act="${it.id}">
    <div class="pr-top"><span class="pr-emoji">${it.kind === "live" ? "💻" : "🔎"}</span>
      <div class="pr-name"><span class="pr-kind">${prKind(it.kind)} · ${prDay(it.day)}</span><b>${esc(it.title || "—")}</b></div>
      <span class="pr-st">${esc(st[1])}</span></div>
    ${c ? `<div class="pr-people">${c.members.map((m) => `<span class="pr-who">${avatar(m.name, m.id)}<span>${esc(m.name)}${c.status === "done" && c.grades ? ` <b class="pr-grade">${c.grades[m.id] ?? 0}%</b>` : ""}</span></span>`).join("")}</div>` : ""}
    <div class="pr-foot">
      ${c ? "" : `<label title="Hard subjects never go to a Faible or Critique student at random">Level<select data-lv>${Object.entries(PR_LV).map(([k, v]) => `<option value="${k}" ${it.level === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label>People<select data-sz>${sizes.map((n) => `<option value="${n}" ${it.size === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>`}
      <span class="pr-btns">${c?.status === "done" ? `<button class="btn small" data-a="grade">Change the grades</button>`
        : c ? `<button class="btn small primary" data-a="grade">🎤 Grade</button><button class="btn small" data-a="who">Presenters</button><button class="btn small" data-a="free">Free it</button>`
        : `<button class="btn small primary" data-a="assign">Assign</button>`}</span>
    </div>
  </article>`;
}

// ------------------------------------------------------------- ✋ Requests
function prReqPane(P) {
  if (!P.pending.length) return `<section class="panel"><p class="empty">No request waiting. Students ask with <code>/activity choose</code>; you get a DM.</p></section>`;
  return `<section class="panel"><p class="muted small" style="margin-top:0">Each student's count helps you keep it fair: class average <b>${P.stats.avg}</b> presentation(s). Approving one request turns down the others for the same subject.</p>
    <div class="pr-reqs">${P.pending.map((c) => {
      const many = c.members.some((m) => m.veille + m.live > P.stats.avg + 1);
      return `<div class="pr-req">
        <div class="pr-req-what"><span class="pr-emoji sm">${c.kind === "live" ? "💻" : "🔎"}</span><div><span class="pr-kind">${prKind(c.kind)} · ${prDay(c.day)}</span><b>${esc(c.title || "")}</b></div></div>
        <div class="pr-req-who">${c.members.map((m) => `<span class="pr-who">${avatar(m.name, m.id)}<span>${esc(m.name)}<small>${m.veille} veille · ${m.live} live</small></span></span>`).join("")}
          ${many ? `<span class="pr-warn" title="Above the class average">⚠️ already presents a lot</span>` : ""}</div>
        <span class="muted small">${esc(fmtAgo(c.created_at))}</span>
        <span class="pr-btns"><button class="btn small primary" data-ok="${c.id}">✓ Approve</button><button class="btn small" data-no="${c.id}">Deny</button></span>
      </div>`;
    }).join("")}</div></section>`;
}

// ------------------------------------------------------------- 🏅 To grade
function prGradePane(P) {
  if (!P.toGrade.length) return `<section class="panel"><p class="empty">Nothing to grade right now. 🎉</p></section>`;
  const past = P.toGrade.filter((c) => c.past), next = P.toGrade.filter((c) => !c.past);
  const rows = (list) => list.map((c) => `<div class="pr-req">
      <div class="pr-req-what"><span class="pr-emoji sm">${c.kind === "live" ? "💻" : "🔎"}</span><div><span class="pr-kind">${prKind(c.kind)} · ${prDay(c.day)}</span><b>${esc(c.title || "")}</b></div></div>
      <div class="pr-req-who">${prWho(c.members)}</div><span></span>
      <span class="pr-btns"><button class="btn small primary" data-grade="${c.activity_id}">🎤 Grade</button></span></div>`).join("");
  return `${past.length ? `<section class="panel"><h2>Presented, waiting for your grade</h2><div class="pr-reqs">${rows(past)}</div></section>` : ""}
    ${next.length ? `<section class="panel"><h2>Coming up</h2><p class="muted small" style="margin-top:0">You can grade them right after the presentation.</p><div class="pr-reqs">${rows(next)}</div></section>` : ""}`;
}

// ------------------------------------------------------------- 🧾 History
function prHistPane(P) {
  return `<section class="panel"><h2>🧾 History</h2>${P.history.length ? table([
    { label: "When", html: (r) => `<span class="small">${prDay(r.day)}</span>` },
    { label: "Activity", html: (r) => `<span class="pr-kind">${prKind(r.kind)}</span><div>${esc(r.title || "")}</div>` },
    { label: "Presenters", html: (r) => r.members.map((m) => `${esc(m.name)}${r.status === "done" && r.grades ? ` <b>${r.grades[m.id] ?? 0}%</b>` : ""}`).join(" · ") },
    { label: "Points", num: true, html: (r) => (r.status === "done" ? r.members.map((m) => Math.round((r.points || 0) * (r.grades?.[m.id] ?? 0) / 100)).join(" · ") : "") },
    { label: "Status", html: (r) => `<span class="pr-hst h-${r.status}">${r.status === "done" ? "🎤 Presented" : r.status === "denied" ? "Denied" : "Freed"}</span>${r.note ? `<div class="muted small">${esc(r.note)}</div>` : ""}` },
  ], P.history) : `<p class="empty">No presentation yet.</p>`}</section>`;
}

// ------------------------------------------------------------- 👥 Students
function prStuPane(P, free) {
  const maxT = Math.max(1, ...P.stats.rows.map((r) => r.total));
  const rows = [...P.stats.rows].sort((a, b) => (b.behind - a.behind) || (a.total - b.total) || a.name.localeCompare(b.name));
  return `<div class="cs-grid">
    <section class="panel cs-list-panel"><div class="panel-head"><h2>Who presented what</h2>
      <span class="toolbar" style="margin:0"><input type="search" id="pr-q" placeholder="Search a student" style="max-width:170px"></span></div>
      <p class="muted small" style="margin-top:0">Class average: <b>${P.stats.avg}</b> (${P.stats.avgVeille} veille · ${P.stats.avgLive} live coding). The ones behind come first.</p>
      <div class="cs-scroll" id="pr-list">${table([
        { label: "", html: (r) => `<input type="checkbox" data-psel="${esc(r.discord_id)}" aria-label="Select">` },
        { label: "Student", html: (r) => `<a class="nowrap" href="#/student/${esc(r.discord_id)}" data-n="${esc(r.name.toLowerCase())}">${avatar(r.name, r.discord_id)} ${esc(r.name)}</a>${r.behind ? ` <span class="pr-warn">behind</span>` : ""}` },
        { label: "Level", html: (r) => (r.level ? `<span class="niv pgc-${esc(r.level)}"><i></i>${esc(r.level[0].toUpperCase() + r.level.slice(1))}</span>` : `<span class="muted">—</span>`) },
        { label: "Presentations", html: (r) => `<span class="coin-cell"><span class="coin-bar pr-bar"><i style="width:${Math.round((r.total / maxT) * 100)}%"></i></span><b>${r.total}</b></span>` },
        { label: "🔎", num: true, html: (r) => (r.veille ? `${r.vDone}${r.veille - r.vDone ? `<span class="muted">+${r.veille - r.vDone}</span>` : ""}` : `<span class="muted">·</span>`) },
        { label: "💻", num: true, html: (r) => (r.live ? `${r.lDone}${r.live - r.lDone ? `<span class="muted">+${r.live - r.lDone}</span>` : ""}` : `<span class="muted">·</span>`) },
        { label: "Points", num: true, html: (r) => (r.points ? `${r.points}` : `<span class="muted">·</span>`) },
        { label: "Last", html: (r) => `<span class="small nowrap">${r.last ? prDay(r.last, { day: "numeric", month: "short" }) : "—"}</span>` },
      ], rows, { empty: "No students yet." })}</div>
      <p class="muted small" style="margin:8px 0 0">🔎 veilles · 💻 live codings: presented <span class="muted">+ planned</span></p></section>
    <section class="panel cs-change"><h2>Give a presentation</h2>
      <label>Who</label><p class="small" id="pr-picked" style="margin:0 0 6px">Tick students in the list.</p>
      <label for="pr-act">Activity</label>
      <select id="pr-act" style="width:100%">${free.length ? free.map((i) => `<option value="${i.id}">${prKind(i.kind)} · ${prDay(i.day)} · ${esc(i.title || "")}</option>`).join("") : `<option value="">No free activity</option>`}</select>
      <p class="notice small">A veille: 2 students (3 at most). A live coding: 1 or 2. They get a DM.</p>
      <p style="margin-bottom:0"><button class="btn primary" id="pr-give" style="width:100%" ${free.length ? "" : "disabled"}>Assign</button></p>
      ${P.stats.rows.some((r) => r.behind) ? `<p style="margin:10px 0 0"><button class="btn" id="pr-behind" style="width:100%">⚠️ Select the ones behind</button></p>` : ""}
    </section></div>`;
}

// ------------------------------------------------------------- actions
function prWire(P, free) {
  const reload = async (msg) => { if (msg) toast(msg); refreshPills(); await viewPresentations(); };
  const cfg = (b) => api("/activities/signups", { method: "PUT", body: b }).then((r) => { P.cfg = r.cfg; toast("Saved"); }).catch((e) => toast(e.message, true));
  $("#pr-ch").onchange = (e) => cfg({ channel: e.target.value || null });
  $("#pr-pv").onchange = (e) => cfg({ veille: Number(e.target.value) });
  $("#pr-pl").onchange = (e) => cfg({ live: Number(e.target.value) });
  $("#pr-share").onclick = (e) => busy(e.currentTarget, async () => {
    if (!$("#pr-ch").value) throw new Error("Pick the Discord channel where the activities are shared.");
    const r = await api("/activities/share", { method: "POST", body: { ids: free.map((i) => i.id), channel: $("#pr-ch").value } });
    await reload(`${r.shared} activit${r.shared === 1 ? "y" : "ies"} shared in Discord`);
  });
  $("#pr-rand").onclick = () => prRandom(free.map((i) => i.id), reload);
  $$("[data-pf]").forEach((b) => b.onclick = () => { presFilter = b.dataset.pf; $("#pt-acts").innerHTML = prActsPane(P, free); prWire(P, free); });
  $$(".pr-card").forEach((card) => {
    const it = P.items.find((x) => x.id === Number(card.dataset.act));
    const slot = (b) => api(`/activities/${it.id}/slot`, { method: "PUT", body: b }).then(() => toast("Saved")).catch((e) => toast(e.message, true));
    const lv = $("[data-lv]", card), sz = $("[data-sz]", card);
    if (lv) lv.onchange = () => slot({ level: lv.value });
    if (sz) sz.onchange = () => slot({ size: Number(sz.value) });
    $$("[data-a]", card).forEach((b) => b.onclick = () => {
      const a = b.dataset.a;
      if (a === "assign" || a === "who") prPick(it, a === "who" ? it.claim : null, P, reload);
      if (a === "grade") prGrade(it, it.claim, P, reload);
      if (a === "free") confirmDialog("Free this activity?", `${it.claim.members.map((m) => m.name).join(" & ")} won't present it anymore (they get a DM). Other students can ask for it again.`, "Free it",
        async () => { await api(`/activities/claims/${it.claim.id}/cancel`, { method: "POST" }); await reload("Freed"); }, true);
    });
  });
  $$("[data-ok]").forEach((b) => b.onclick = () => busy(b, async () => { await api(`/activities/claims/${b.dataset.ok}/decide`, { method: "POST", body: { approve: true } }); await reload("Approved: the students got a DM"); }));
  $$("[data-no]").forEach((b) => b.onclick = () => openDialog("Deny this request?", `<label for="pr-note">A word for the students <span class="muted">(optional, sent by DM)</span></label>
      <input type="text" id="pr-note" style="width:100%" maxlength="300" placeholder="e.g. you already have one this week: pick a subject next week">`,
    [{ label: "Deny", danger: true, action: async () => { await api(`/activities/claims/${b.dataset.no}/decide`, { method: "POST", body: { approve: false, note: $("#pr-note", dlg).value } }); dlg.close(); await reload("Denied: the students got a DM"); } }]));
  $$("[data-grade]").forEach((b) => b.onclick = () => { const it = P.items.find((x) => x.id === Number(b.dataset.grade)); prGrade(it, it.claim, P, reload); });
  // students tab
  const picked = new Set();
  const draw = () => {
    const names = P.stats.rows.filter((r) => picked.has(r.discord_id)).map((r) => esc(r.name));
    $("#pr-picked").innerHTML = names.length ? `<b>${names.join(", ")}</b>` : "Tick students in the list.";
    $("#pr-give").textContent = names.length ? `Assign to ${names.length} student${names.length > 1 ? "s" : ""}` : "Assign";
  };
  $$("[data-psel]").forEach((c) => c.onchange = () => { c.checked ? picked.add(c.dataset.psel) : picked.delete(c.dataset.psel); draw(); });
  $("#pr-q").oninput = (e) => { const q = e.target.value.toLowerCase(); $$("#pr-list tbody tr").forEach((tr) => (tr.hidden = !($("[data-n]", tr)?.dataset.n || "").includes(q))); };
  const bh = $("#pr-behind");
  if (bh) bh.onclick = () => { P.stats.rows.filter((r) => r.behind).slice(0, 3).forEach((r) => { picked.add(r.discord_id); const c = $(`[data-psel="${r.discord_id}"]`); if (c) c.checked = true; }); draw(); };
  $("#pr-give").onclick = (e) => busy(e.currentTarget, async () => {
    if (!picked.size) throw new Error("Pick at least one student");
    if (!$("#pr-act").value) throw new Error("No free activity");
    await api(`/activities/${$("#pr-act").value}/assign`, { method: "POST", body: { members: [...picked] } });
    await reload("Assigned: the students got a DM");
  });
}

/** Choose the presenters: assign a free activity, or change who presents (a third person in a binôme). */
async function prPick(it, c, P, reload) {
  const list = await loadStudents();
  const count = new Map(P.stats.rows.map((r) => [r.discord_id, r]));
  const max = it.kind === "live" ? 2 : 3;
  const chosen = new Set(c ? c.members.map((m) => m.id) : []);
  const rows = list.map((s) => ({ id: s.discord_id, name: s.name || s.discord_id, k: count.get(s.discord_id) }))
    .sort((a, b) => ((a.k?.[it.kind] ?? 0) - (b.k?.[it.kind] ?? 0)) || a.name.localeCompare(b.name));
  openDialog(c ? "Presenters" : `Assign · ${prKind(it.kind)}`, `
    <p class="small" style="margin-top:0"><b>${esc(it.title || "")}</b> · ${prDay(it.day)}</p>
    <p class="small muted">${it.kind === "live" ? "A live coding is led by 1 or 2 students." : "A veille is presented by 2 students, or 3 at most."} Fewest ${it.kind === "live" ? "live codings" : "veilles"} first.</p>
    <input type="search" id="pk-q" placeholder="Type to filter the list" style="width:100%;margin-bottom:8px">
    <div class="sg-pick">${rows.map((r) => `<label class="check" data-n="${esc(r.name.toLowerCase())}"><input type="checkbox" value="${r.id}" ${chosen.has(r.id) ? "checked" : ""}>
      <span>${avatar(r.name, r.id)} ${esc(r.name)}${r.k?.behind ? ` <span class="pr-warn">behind</span>` : ""}</span><span class="muted small">${r.k ? `${r.k.veille} veille · ${r.k.live} live` : "0"}${r.k?.level ? ` · ${esc(r.k.level)}` : ""}</span></label>`).join("")}</div>`,
    [{ label: c ? "Save" : "Assign", primary: true, action: async () => {
      const members = $$(".sg-pick input:checked", dlg).map((x) => x.value);
      if (!members.length) throw new Error("Pick at least one student");
      if (members.length > max) throw new Error(`${max} at most`);
      if (c) await api(`/activities/claims/${c.id}/members`, { method: "PUT", body: { members } });
      else await api(`/activities/${it.id}/assign`, { method: "POST", body: { members } });
      dlg.close();
      await reload(c ? "Presenters saved" : "Assigned: the students got a DM");
    } }]);
  $("#pk-q", dlg).oninput = (e) => { const q = e.target.value.toLowerCase(); $$(".sg-pick label", dlg).forEach((l) => (l.hidden = !l.dataset.n.includes(q))); };
}

/** After the presentation: a grade per presenter (a share of the points). */
function prGrade(it, c, P, reload) {
  const full = c.points ?? P.cfg[it.kind];
  openDialog(`Grade · ${it.title || ""}`, `
    <p class="small muted" style="margin-top:0">${prKind(it.kind)} · up to <b>${full} pts</b> each. The points are given now; changing a grade later only adds or removes the difference.</p>
    ${c.members.map((m) => `<div class="sg-grade"><b>${avatar(m.name, m.id)} ${esc(m.name)}</b><div class="seg">${PR_GRADES.map(([v, l]) => `<label><input type="radio" name="g-${m.id}" value="${v}" ${(c.grades?.[m.id] ?? 100) === v ? "checked" : ""}><span>${l} · ${Math.round(full * v / 100)}</span></label>`).join("")}</div></div>`).join("")}
    <label for="pg-note">A word for them <span class="muted">(optional, sent by DM)</span></label><input type="text" id="pg-note" style="width:100%" maxlength="300" value="${esc(c.note && c.note !== "taken" ? c.note : "")}">`,
    [{ label: "Give the points", primary: true, action: async () => {
      const grades = Object.fromEntries(c.members.map((m) => [m.id, Number($(`input[name="g-${m.id}"]:checked`, dlg)?.value ?? 0)]));
      await api(`/activities/claims/${c.id}/grade`, { method: "POST", body: { grades, note: $("#pg-note", dlg).value } });
      dlg.close();
      await reload("Points given: the students got a DM");
    } }]);
}

/** Random presenters for the free activities: a proposal first. */
async function prRandom(ids, reload) {
  let r;
  try { r = await api("/activities/random", { method: "POST", body: { ids } }); } catch (e) { toast(e.message, true); return; }
  openDialog("Assign at random", `
    <p class="small muted" style="margin-top:0">Fewest presentations first; nobody twice on the same day; a <b>Hard</b> subject never goes to a Faible or Critique student. Check it, then assign (the students get a DM).</p>
    <div class="pr-reqs">${r.plan.map((p) => `<div class="pr-req pr-plan">
      <div class="pr-req-what"><span class="pr-emoji sm">${p.kind === "live" ? "💻" : "🔎"}</span><div><span class="pr-kind">${prKind(p.kind)} · ${prDay(p.day)} · ${PR_LV[p.level] || p.level}</span><b>${esc(p.title || "")}</b></div></div>
      <div class="pr-req-who">${p.members.length ? prWho(p.members.map((id, i) => ({ id, name: p.names[i] }))) : `<span class="muted small">${esc(p.skipped || "")}</span>`}</div></div>`).join("")}</div>`,
    [{ label: "🎲 Shuffle again", action: async () => { dlg.close(); prRandom(ids, reload); } },
     { label: "Assign them", primary: true, action: async () => {
      for (const p of r.plan) if (p.members.length) await api(`/activities/${p.activity_id}/assign`, { method: "POST", body: { members: p.members } }).catch((e) => toast(e.message, true));
      dlg.close();
      await reload("Assigned: the students got a DM");
    } }]);
  dlg.classList.add("wide");
}

Object.assign(routes, { presentations: viewPresentations });
