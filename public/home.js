// 🏠 Overview (home): what the teacher needs to know about the class now (the rest of the page is drawn by viewOverview).
//   ⏳ what waits for you · 👀 the students to watch (likely to decline, weak without a plan, quiet) · 🗓️ the sprint now
//   · 🎓 the class's levels · 🌱 who is improving
/* global $, $$, api, esc, fmtAgo, fmtDate, avatar, busy, toast, insMessage, insBuildPlan */

const HM_LV = { excellent: ["#2563eb", "Excellent"], bon: ["#16a34a", "Bon"], moyen: ["#d97706", "Moyen"], faible: ["#ef4444", "Faible"], critique: ["#b91c1c", "Critique"], none: ["#cbd5e1", "No level yet"] };
const HM_TODO = {
  hands: ["✋", "waiting for your help", "#/hands", (t) => (t.since ? `the first for ${fmtAgo(t.since).replace(/ ago$/, "")}` : "")],
  debrief: ["🔍", "hand-ins to debrief", "#/progress", () => "the deadline passed"],
  finalize: ["⏳", "debriefs to finalize", "#/progress", () => "drafts: their level counts once final"],
  minibrief: ["📦", "mini briefs to validate", "#/assignments", () => "handed in on a plan d'action"],
  planlate: ["🧭", "plans d'action overdue", "#/assignments", () => "past their due date"],
  grade: ["📝", "papers to grade", "#/assessments", () => "assessments handed in"],
  faq: ["❓", "questions to answer", "#/questions", () => "asked with /ask"],
  integrity: ["🛡️", "answers to check", "#/integrity", () => "integrity flags"],
};
const hmPill = (lv) => { const L = HM_LV[lv] || HM_LV.none; return `<span class="hm-lv" style="--c:${L[0]}">${L[1]}</span>`; };

function hmTodo(h) {
  if (!h.todo.length) return `<section class="hm-clear"><span>✅</span><div><b>Nothing waits for you</b><span>No help request, no debrief to do, nothing to grade.</span></div></section>`;
  return `<section class="hm-todo" aria-label="What waits for you">${h.todo.map((t) => { const T = HM_TODO[t.k]; return `<a class="hm-t ${t.k === "hands" || t.k === "planlate" ? "hot" : ""}" href="${T[2]}">
    <span class="hm-ti">${T[0]}</span><b>${t.n}</b><span class="hm-tl">${T[1]}</span><span class="hm-ts">${esc(T[3](t))}</span></a>`; }).join("")}</section>`;
}
function hmPerson(p, kind) {
  const why = kind === "quiet" ? [`no activity for ${p.idle} days`] : kind === "noplan" ? [`${HM_LV[p.level]?.[1] || ""} level, no plan d'action yet`, ...p.reasons.filter((r) => !/level/.test(r))].slice(0, 2) : p.reasons;
  const act = kind === "noplan" || (kind === "decline" && !p.plan) ? `<button class="btn small primary" data-hmplan="${esc(p.id)}">🧭 Plan</button>`
    : p.plan ? `<a class="btn small" href="#/wplan/${p.plan.id}">🧭 ${p.plan.status === "draft" ? "Draft" : p.plan.pct + "%"}</a>` : "";
  return `<li class="hm-p"><a class="hm-who" href="#/student/${esc(p.id)}">${avatar(p.name, p.id)}<span><b>${esc(p.name)}</b>${hmPill(p.level)}${p.mine ? `<span class="hm-mine" title="Your level">👤</span>` : ""}</span></a>
    <span class="hm-why">${why.map((w) => `<span>${esc(w)}</span>`).join("")}</span>
    <span class="hm-acts">${act}<button class="btn small" data-hmmsg="${esc(p.id)}" data-name="${esc(p.name)}" title="Message by Discord DM">💬</button></span></li>`;
}
function hmWatch(h) {
  const groups = [["decline", "📉 Likely to decline", h.decline, "Their levels, their work and their activity point down: talk with them before it shows."],
    ["noplan", "🧭 Weak level, no plan d'action", h.noPlan, "Faible or Critique, and nothing built for them yet."],
    ["quiet", "💤 Gone quiet", h.quiet, "No activity for 5 days or more."]].filter((g) => g[2].length);
  const n = groups.reduce((a, g) => a + g[2].length, 0);
  return `<section class="panel hm-watch"><div class="panel-head"><h2>👀 Students to watch ${n ? `<span class="pill">${n}</span>` : ""}</h2><a class="small" href="#/assignments">Plan d'action →</a></div>
    ${groups.length ? groups.map(([k, t, list, sub]) => `<div class="hm-g"><h3>${t} <span class="muted">${list.length}</span></h3><p class="small muted">${sub}</p><ul class="hm-ps">${list.map((p) => hmPerson(p, k)).join("")}</ul></div>`).join("")
      : `<p class="hm-ok">🎉 No one to worry about: nobody is heading down, the weak ones have a plan, everyone is active.</p>`}
    <p class="small muted hm-note">From their levels (yours, else their last debrief), the trend, the work given and their activity. Open a student for their lacunes and what blocks them.</p></section>`;
}
function hmSprint(h) {
  const s = h.sprint;
  if (!s) return `<section class="panel"><h2>🗓️ Sprint</h2><p class="muted small">No sprint in the programme. <a href="#/settings/programme">Settings → Programme</a></p></section>`;
  return `<section class="panel hm-sprint"><div class="panel-head"><h2>🗓️ Sprint ${s.n}</h2><a class="small" href="#/sprints/${s.n}">Sprint page →</a></div>
    <p class="hm-st">${esc(s.title)}</p>
    <div class="hm-time"><i style="width:${s.elapsed}%"></i></div>
    <p class="small muted" style="margin:4px 0 10px">${fmtDate(Date.parse(s.start + "T12:00:00Z") / 1000)} → ${fmtDate(Date.parse(s.end + "T12:00:00Z") / 1000)} · <b>${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"} left</b></p>
    ${s.briefs.length ? `<ul class="hm-briefs">${s.briefs.map((b) => `<li><a href="#/brief/${b.id}"><b>${esc(b.title)}</b></a>
      <span class="hm-bm"><span title="Handed in">📥 ${b.handins}/${b.units}</span><span title="Debriefs finalized">✅ ${b.debriefed}/${b.units}</span>${b.due_at ? `<span>${b.past ? "ended" : "due"} ${esc(fmtDate(b.due_at))}</span>` : ""}</span>
      <span class="hm-bb"><i class="h" style="width:${Math.round((100 * b.handins) / Math.max(1, b.units))}%"></i><i class="d" style="width:${Math.round((100 * b.debriefed) / Math.max(1, b.units))}%"></i></span></li>`).join("")}</ul>` : `<p class="muted small">No brief in this sprint yet. <a href="#/briefs">Briefs →</a></p>`}
    ${s.next ? `<p class="small muted" style="margin:10px 0 0">Next: Sprint ${s.next.n} · ${esc(s.next.title)} · from ${esc(fmtDate(Date.parse(s.next.start + "T12:00:00Z") / 1000))}</p>` : ""}</section>`;
}
function hmLevels(h) {
  const order = ["excellent", "bon", "moyen", "faible", "critique", "none"], tot = Math.max(1, h.total);
  return `<section class="panel hm-levels"><div class="panel-head"><h2>🎓 The class's levels</h2><a class="small" href="#/students">Students →</a></div>
    <div class="hm-bar">${order.filter((k) => h.levels[k]).map((k) => `<i style="flex:${h.levels[k]};background:${HM_LV[k][0]}" title="${HM_LV[k][1]}: ${h.levels[k]}"></i>`).join("")}</div>
    <div class="hm-legend">${order.filter((k) => h.levels[k]).map((k) => `<span><i style="background:${HM_LV[k][0]}"></i><b>${h.levels[k]}</b> ${HM_LV[k][1]}</span>`).join("")}</div>
    <p class="small muted" style="margin:8px 0 0">${Math.round((100 * (h.levels.faible + h.levels.critique)) / tot)}% Faible or Critique · ${h.plans.live} plan${h.plans.live === 1 ? "" : "s"} d'action running${h.plans.drafts ? ` · ${h.plans.drafts} draft${h.plans.drafts > 1 ? "s" : ""}` : ""}</p></section>`;
}
function hmUp(h) {
  if (!h.improving.length) return "";
  return `<section class="panel hm-up"><div class="panel-head"><h2>🌱 Improving</h2></div><ul class="hm-ups">${h.improving.map((p) => `<li><a class="hm-who" href="#/student/${esc(p.id)}">${avatar(p.name, p.id)}<b>${esc(p.name)}</b></a>${hmPill(p.level)}<span class="small muted">${esc(p.good[0] || "")}</span></li>`).join("")}</ul>
    <p class="small muted" style="margin:8px 0 0">A word of encouragement goes a long way.</p></section>`;
}
/** Fills the home's top part (#ov-home). */
async function loadHome(pre) {
  const box = $("#ov-home");
  if (!box) return;
  let h;
  try { h = pre ? await pre : await api("/home"); if (h && h.__error) throw h.__error; } catch (e) { box.innerHTML = `<div class="notice">Couldn't load the class overview: ${esc(e.message)}</div>`; return; }
  if (!box.isConnected) return;
  box.innerHTML = `${hmTodo(h)}<div class="hm-grid">${hmWatch(h)}<div class="hm-side">${hmSprint(h)}${hmLevels(h)}${hmUp(h)}</div></div>`;
  $$("[data-hmplan]", box).forEach((b) => b.onclick = () => busy(b, () => insBuildPlan(b.dataset.hmplan)));
  $$("[data-hmmsg]", box).forEach((b) => b.onclick = () => insMessage(b.dataset.hmmsg, b.dataset.name));
}
