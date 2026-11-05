"use strict";
// Propositions: the veilles and live codings the students proposed (/activity propose), from every class. A teacher
// plans one on a free day of their class in the next weeks (written with AI from the proposal, or as it is; then shared
// in the activities channel: open to every student), or turns it down with a word. The student is told by DM.
/* global $, $$, api, esc, toast, view, routes, openDialog, fmtAgo, refreshPills */

const PROP_KIND = { veille: "🔎 Veille", live: "💻 Live coding" };
const propDay = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

async function viewProposals() {
  view.innerHTML = `
    <div class="page-head"><div><h1>Propositions</h1>
      <p class="sub">The veilles and live codings students proposed with <code>/activity propose</code>, from every class. Plan one on a free day of your class: it becomes an activity open to every student (<code>/activity choose</code>).</p></div>
      <div class="toolbar" style="margin:0"><a class="btn" href="#/activities">Activités</a></div></div>
    <div id="pp-out"><div class="skeleton" style="height:240px"></div></div>`;
  let d;
  try { d = await api("/activities/proposals"); } catch (e) { $("#pp-out").innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  const waiting = d.items.filter((p) => p.status === "pending"), done = d.items.filter((p) => p.status !== "pending");
  const card = (p) => {
    const here = p.plans.find((x) => x.here);
    const canPlan = p.status !== "denied" && !here;
    return `<article class="panel pp-card ${p.status}">
      <div class="pp-head"><span class="tag">${PROP_KIND[p.kind] || esc(p.kind)}</span><b class="pp-title">${esc(p.title)}</b>
        <span class="small muted">${esc(p.name)} · ${p.mine ? "<b>your class</b>" : esc(p.className)} · ${fmtAgo(p.created_at)}</span></div>
      ${p.details ? `<p class="pp-details">${esc(p.details)}</p>` : ""}
      ${p.plans.length ? `<p class="small pp-plans">📅 Planned: ${p.plans.map((x) => `${x.here ? "<b>this class</b>" : esc(x.className)} · ${esc(propDay(x.day))}`).join(" · ")}</p>` : ""}
      ${p.status === "denied" ? `<p class="small muted">Not kept${p.note ? `: ${esc(p.note)}` : ""}</p>` : ""}
      ${canPlan || p.status === "pending" ? `<div class="toolbar" style="margin:10px 0 0">
        ${canPlan ? `<button class="btn small primary" data-plan="${p.id}">📅 Plan in my class</button>` : ""}
        ${p.status === "pending" ? `<button class="btn small" data-deny="${p.id}">Turn down</button>` : ""}</div>` : ""}
    </article>`;
  };
  $("#pp-out").innerHTML = `
    <section><h2>Waiting <span class="muted">${waiting.length}</span></h2>
      ${waiting.length ? `<div class="pp-list">${waiting.map(card).join("")}</div>` : `<p class="muted small">No proposal waiting. Students propose with <code>/activity propose</code> in Discord.</p>`}</section>
    ${done.length ? `<section style="margin-top:22px"><h2>Decided <span class="muted">${done.length}</span></h2><div class="pp-list">${done.map(card).join("")}</div></section>` : ""}`;

  // plan: a free day of this class for this kind, the activity written with AI (or as it is), then shared
  $$("[data-plan]").forEach((b) => b.onclick = () => {
    const p = d.items.find((x) => x.id === Number(b.dataset.plan));
    const days = d.free[p.kind] || [];
    if (!days.length) return toast(`No free ${p.kind === "live" ? "live-coding" : "veille"} day in the next 4 weeks of this class (Activités: the days and the live-coding days).`, true);
    openDialog(`Plan · ${p.title}`, `
      <label for="pp-day">${p.kind === "live" ? "Live-coding day" : "Veille day"} <span class="muted small">(free in the next 4 weeks)</span></label>
      <select id="pp-day">${days.map((x) => `<option value="${x}">${esc(propDay(x))}</option>`).join("")}</select>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="pp-ai" checked> ✨ Write the activity with AI from the proposal <span class="muted small">(the template's sections, within the programme; off: as the student wrote it)</span></label>
      <p class="small muted" style="margin:10px 0 0">${d.channel ? "Then shared in the activities channel: every student can ask for it with /activity choose." : "⚠️ No activities channel chosen yet: the activity is created but not shared (Activités → Share, or Presentations → channel)."} ${esc(p.name)} gets a DM.</p>`,
      [{ label: "Plan it", primary: true, action: async (dlg) => {
        const r = await api(`/activities/proposals/${p.id}/plan`, { method: "POST", body: { day: $("#pp-day", dlg).value, ai: $("#pp-ai", dlg).checked } });
        dlg.close();
        toast(`📅 Planned on ${propDay(r.day)}${r.ai ? " · written with AI" : ""}${r.shared ? " · shared in Discord" : ""}`);
        if (typeof refreshPills === "function") refreshPills();
        viewProposals();
      } }]);
  });
  // turn down, with a word for the student
  $$("[data-deny]").forEach((b) => b.onclick = () => {
    const p = d.items.find((x) => x.id === Number(b.dataset.deny));
    openDialog(`Turn down · ${p.title}`, `<label for="pp-note">A word for ${esc(p.name)} <span class="muted small">(optional, sent by DM)</span></label>
      <textarea id="pp-note" rows="3" maxlength="500" placeholder="e.g. Already planned this month; propose it again for the next sprint."></textarea>`,
      [{ label: "Turn down", danger: true, action: async (dlg) => {
        await api(`/activities/proposals/${p.id}/deny`, { method: "POST", body: { note: $("#pp-note", dlg).value } });
        dlg.close();
        toast("Turned down: the student is told");
        if (typeof refreshPills === "function") refreshPills();
        viewProposals();
      } }]);
  });
}

Object.assign(routes, { proposals: viewProposals });
