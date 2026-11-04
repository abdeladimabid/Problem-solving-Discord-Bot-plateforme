// 🏠 Overview (home): what the teacher needs to know about the class now (the rest of the page is drawn by viewOverview).
//   📊 the key figures · ⏳ what waits for you · ⚡ quick access · 📈 activity (4 weeks) · 🎓 levels, debrief after debrief
//   · 👀 the students to watch · 🗓️ the sprint · 📥 the briefs handed in and debriefed · 🌱 who is improving
/* global $, $$, api, esc, fmtAgo, fmtDate, avatar, busy, insMessage, insBuildPlan, icon */

const HM_LV = { excellent: ["#2563eb", "Excellent"], bon: ["#16a34a", "Bon"], moyen: ["#d97706", "Moyen"], faible: ["#ef4444", "Faible"], critique: ["#b91c1c", "Critique"], none: ["#cbd5e1", "No level yet"] };
const HM_ORDER = ["excellent", "bon", "moyen", "faible", "critique"];
const HM_TODO = {
  hands: ["✋", "waiting for your help", "#/hands"], debrief: ["🔍", "hand-ins to debrief", "#/progress"], finalize: ["⏳", "debriefs to finalize", "#/progress"],
  minibrief: ["📦", "mini briefs to validate", "#/assignments"], planlate: ["🧭", "plans d'action overdue", "#/assignments"], grade: ["📝", "papers to grade", "#/assessments"],
  faq: ["❓", "questions to answer", "#/questions"], integrity: ["🛡️", "answers to check", "#/integrity"],
};
const HM_GO = [["#/progress", "🔍", "Debriefs"], ["#/briefs", "📚", "Briefs"], ["#/sprints", "🗓️", "Sprints"], ["#/assignments", "🧭", "Plan d'action"],
  ["#/assessments", "📝", "Assessments"], ["#/github", "🐙", "GitHub"], ["#/activities", "🎤", "Activités"], ["#/students", "👥", "Students"]];
const hmPill = (lv) => { const L = HM_LV[lv] || HM_LV.none; return `<span class="hm-lv" style="--c:${L[0]}">${L[1]}</span>`; };
const hmD = (s) => fmtDate(Date.parse(s + "T12:00:00Z") / 1000);
const hmDelta = (a, b) => (b == null || a === b ? "" : `<span class="hm-dl ${a > b ? "up" : "down"}">${a > b ? "▲" : "▼"} ${Math.abs(a - b)}</span>`);

// ------------------------------------------------------------------ figures
function hmStats(h) {
  const s = h.stats;
  const tile = (ic, v, label, sub, href, tone = "") => `<a class="hm-k ${tone}" href="${href}"><span class="hm-ki">${ic}</span><span class="hm-kv">${v}</span><span class="hm-kl">${label}</span><span class="hm-ks">${sub}</span></a>`;
  // a change against last week: ▲ / ▼ and by how much (in points for a %)
  const vs = (a, b, unit = "", pct = false) => {
    if (a == null || b == null) return `<span class="muted">no data last week</span>`;
    if (a === b) return `= same as last week`;
    const d = pct ? a - b : b ? Math.round((100 * (a - b)) / b) : null;
    return `<span class="hm-dl ${a > b ? "up" : "down"}">${a > b ? "▲" : "▼"} ${d == null ? Math.abs(a - b) : Math.abs(d) + (pct ? " pts" : "%")}</span> vs last week (${b}${unit})`;
  };
  const lv = s.lastBrief && s.prevBrief && s.lastBrief.avg != null && s.prevBrief.avg != null ? s.lastBrief.avg - s.prevBrief.avg : null;
  return `<section class="hm-kpis" aria-label="Key figures">
    ${tile("🟢", `${s.active}<small>/${s.students}</small>`, "active this week", vs(s.active, s.activePrev), "#/students", s.activePrev && s.active < s.activePrev * 0.75 ? "warn" : "")}
    ${tile("🧩", s.solved, "problems solved this week", vs(s.solved, s.solvedPrev), "#/challenges", s.solvedPrev >= 10 && s.solved <= s.solvedPrev * 0.7 ? "warn" : "")}
    ${tile("🎯", s.accuracy == null ? "—" : s.accuracy + "%", "accuracy this week", s.accuracy == null ? "too few answers this week" : vs(s.accuracy, s.accuracyPrev, "%", true), "#/challenges", s.accuracy != null && s.accuracyPrev != null && s.accuracyPrev - s.accuracy >= 10 ? "warn" : "")}
    ${tile("🔍", s.left, "left to debrief", s.left ? `<b>${s.toDebrief}</b> not started · <b>${s.drafts}</b> to finalize` : "all debriefed ✓", "#/progress", s.left ? "todo" : "")}
    ${tile("🎓", s.avgLevel ? HM_LV[s.avgLevel][1] : "—", "class level", lv == null ? `<b>${s.low}</b> Faible or Critique` : `<span class="hm-dl ${lv > 0 ? "up" : lv < 0 ? "down" : ""}">${lv > 0 ? "▲ better" : lv < 0 ? "▼ lower" : "= same"}</span> on B${s.lastBrief.b} than B${s.prevBrief.b} · <b>${s.low}</b> weak`, "#/progress", lv != null && lv <= -0.25 ? "warn" : "")}
    ${tile("🧭", s.plansPct == null ? "—" : s.plansPct + "%", "plans d'action done", h.plans.live ? `on <b>${h.plans.live}</b> running${s.plansLate ? ` · <b>${s.plansLate}</b> late` : ""}` : "none running", "#/assignments", s.plansLate ? "warn" : "")}
  </section>`;
}
/** ⚠️ The clear signs to watch out for, else a calm line. */
function hmAlerts(h) {
  return h.alerts.length
    ? `<section class="hm-alerts" aria-label="Watch out"><b>⚠️ Watch out</b>${h.alerts.map((a) => `<a href="${a.href}">${esc(a.t)}</a>`).join("")}</section>`
    : `<section class="hm-alerts calm"><b>✅ Nothing alarming</b><span>activity, accuracy and levels hold steady against last week.</span></section>`;
}
/** One bar: what waits for you (to the left), then the pages you open most. */
function hmBar(h) {
  const items = h.todo.map((t) => { const T = HM_TODO[t.k]; return `<a class="hm-c ${t.k === "hands" || t.k === "planlate" ? "hot" : ""}" href="${T[2]}"><span>${T[0]}</span><b>${t.n}</b> ${T[1]}${t.k === "hands" && t.since ? `<small>· ${esc(fmtAgo(t.since))}</small>` : ""}</a>`; }).join("");
  return `<section class="panel hm-bar">
    <div class="hm-wait"><h2>⏳ Waiting for you</h2>${items ? `<div class="hm-chips">${items}</div>` : `<span class="hm-none">✅ Nothing: no help request, no debrief to do, nothing to grade.</span>`}</div>
    <div class="hm-go" aria-label="Quick access">${HM_GO.map(([href, ic, t]) => `<a href="${href}"><span>${ic}</span>${t}</a>`).join("")}</div></section>`;
}

// ------------------------------------------------------------------ charts
/** Week by week (8 weeks): problems solved, accuracy, students active — one small chart each, same weeks. */
function hmWeeks(h) {
  const W = h.weeks, lbl = (w) => (w.w === 7 ? "this week" : w.w === 6 ? "last week" : hmD(w.from));
  const mini = (title, key, unit, max, fmt) => {
    const vals = W.map((w) => w[key]), have = vals.filter((v) => v != null);
    const top = max ?? Math.max(1, ...have), H = 74, bw = 100 / W.length;
    const last = vals[7], prev = vals[6];
    const trend = last == null || prev == null || last === prev ? "" : `<span class="hm-dl ${last > prev ? "up" : "down"}">${last > prev ? "▲" : "▼"}</span>`;
    return `<div class="hm-m"><div class="hm-mh"><span>${title}</span><b>${last == null ? "—" : fmt(last)}${trend}</b></div>
      <div class="hm-mc">${W.map((w, i) => { const v = vals[i]; const hh = v == null ? 0 : Math.max(v ? 3 : 0, (v / top) * H);
        return `<span class="hm-hit hm-mb" style="width:${bw}%" data-tip="${esc(lbl(w))} · ${title.toLowerCase()}: ${v == null ? "too few answers" : fmt(v)}">${v == null ? `<i class="na"></i>` : `<i class="${i === 7 ? "now" : ""}" style="height:${hh}px"></i>`}</span>`; }).join("")}</div><div class="hm-mx"><span>${esc(hmD(W[0].from))}</span><span>now</span></div></div>`;
  };
  const first = W.findIndex((w) => w.solved + w.failed + w.active);
  return `<section class="panel hm-weeks"><div class="panel-head"><h2>📈 Week by week <span class="muted">8 weeks</span></h2><a class="small" href="#/students">Students →</a></div>
    <p class="small muted hm-sub">Are they practising more, and getting it right more often? Each bar is a week; the darker one is this week.</p>
    ${first < 0 ? `<p class="hm-empty">No practice or push in the last 8 weeks yet.</p>` : `<div class="hm-ms">
      ${mini("Problems solved", "solved", "", null, (v) => v)}
      ${mini("Accuracy", "accuracy", "%", 100, (v) => v + "%")}
      ${mini("Students active", "active", "", h.stats.students || null, (v) => v)}</div>`}</section>`;
}
/** The class's levels now, then debrief after debrief from the latest back (each one: better or worse than the one before it). */
function hmLevels(h) {
  const bar = (counts, label, sub, href, delta = "", draft = 0) => {
    const tot = HM_ORDER.reduce((a, k) => a + (counts[k] || 0), 0);
    return `<a class="hm-lrow${draft ? " draft" : ""}" href="${href}"><span class="hm-ll" title="${esc(sub)}">${esc(label)}${draft ? `<small title="Not finalized yet: the level proposed so far">draft</small>` : ""}</span><span class="hm-lbar">${tot ? HM_ORDER.filter((k) => counts[k]).map((k) =>
      `<i class="hm-hit" style="flex:${counts[k]};background:${HM_LV[k][0]}" data-tip="${esc(sub)} · ${HM_LV[k][1]}: ${counts[k]} (${Math.round((100 * counts[k]) / tot)}%)"></i>`).join("") : `<i style="flex:1;background:var(--line)"></i>`}</span>
      <span class="hm-ln">${delta}</span></a>`;
  };
  const B = [...h.byBrief].reverse();   // the latest first: from now, back in time
  const delta = (b, i) => { const older = B[i + 1]; if (!older || b.avg == null || older.avg == null) return ""; const d = b.avg - older.avg;
    return Math.abs(d) < 0.05 ? `<span title="Same average as B${older.b}">=</span>` : `<span class="hm-dl ${d > 0 ? "up" : "down"}" title="${d > 0 ? "Better" : "Lower"} than B${older.b} on average">${d > 0 ? "▲" : "▼"}</span>`; };
  const tot = Math.max(1, h.total);
  return `<section class="panel hm-levels"><div class="panel-head"><h2>🎓 Levels</h2><a class="small" href="#/progress">Debriefs →</a></div>
    <div class="hm-lnow">${bar(h.levels, "Now", "Their level now (yours, else their last debrief)", "#/students")}</div>
    ${B.length ? `<p class="hm-cap">Debrief by debrief, latest first <span title="Better or lower than the debrief before it, on average">▲▼ vs the one before</span></p>${B.map((b, i) => bar(b.counts, "B" + b.b, b.title + (b.draft ? ` · ${b.draft} debrief${b.draft > 1 ? "s" : ""} not finalized yet` : ""), `#/brief/${b.bid}`, delta(b, i), b.draft)).join("")}` : `<p class="hm-empty small">The levels of each debrief show here once debriefs are finalized.</p>`}
    <div class="hm-legend">${HM_ORDER.map((k) => `<span><i style="background:${HM_LV[k][0]}"></i>${HM_LV[k][1]} <b>${h.levels[k] || 0}</b></span>`).join("")}${h.levels.none ? `<span><i style="background:${HM_LV.none[0]}"></i>No level <b>${h.levels.none}</b></span>` : ""}</div>
    <div class="hm-tr"><span class="up" title="Their levels went up lately"><b>${h.trends.up}</b>↑ going up</span><span title="Steady"><b>${h.trends.flat}</b>→ steady</span><span class="down" title="Their levels went down lately"><b>${h.trends.down}</b>↓ going down</span></div>
    <p class="small muted hm-foot">${Math.round((100 * (h.levels.faible + h.levels.critique)) / tot)}% Faible or Critique now</p></section>`;
}
// ------------------------------------------------------------------ people & sprint
function hmPerson(p, kind) {
  const why = kind === "quiet" ? [`no activity for ${p.idle} days`] : kind === "noplan" ? [`${HM_LV[p.level]?.[1] || ""} level, no plan d'action yet`, ...p.reasons.filter((r) => !/level/.test(r))].slice(0, 2) : p.reasons;
  const act = kind === "noplan" || (kind === "decline" && !p.plan) ? `<button class="btn small primary" data-hmplan="${esc(p.id)}">🧭 Plan</button>`
    : p.plan ? `<a class="btn small" href="#/wplan/${p.plan.id}" title="Their plan d'action">🧭 ${p.plan.status === "draft" ? "Draft" : p.plan.pct + "%"}</a>` : "";
  return `<li class="hm-p"><a class="hm-who" href="#/student/${esc(p.id)}">${avatar(p.name, p.id)}<span><b>${esc(p.name)}</b>${hmPill(p.level)}</span></a>
    <span class="hm-why">${why.map((w) => `<span>${esc(w)}</span>`).join("")}</span>
    <span class="hm-acts">${act}<button class="btn small" data-hmmsg="${esc(p.id)}" data-name="${esc(p.name)}" title="Message by Discord DM">💬</button></span></li>`;
}
function hmWatch(h) {
  const groups = [["decline", "📉 Likely to decline", h.decline, "Their levels, their work and their activity point down: talk with them before it shows."],
    ["noplan", "🧭 Weak level, no plan d'action", h.noPlan, "Faible or Critique, and nothing built for them yet."],
    ["quiet", "💤 Gone quiet", h.quiet, "No activity for 5 days or more."]].filter((g) => g[2].length);
  const n = groups.reduce((a, g) => a + g[2].length, 0);
  return `<section class="panel hm-watch"><div class="panel-head"><h2>👀 Students to watch ${n ? `<span class="pill">${n}</span>` : ""}</h2><a class="small" href="#/assignments">Plan d'action →</a></div>
    ${groups.length ? groups.map(([k, t, list, sub]) => `<div class="hm-g"><h3>${t} <span class="muted">${list.length}</span> <span class="small muted">· ${sub}</span></h3><ul class="hm-ps">${list.map((p) => hmPerson(p, k)).join("")}</ul></div>`).join("")
      : `<p class="hm-ok">🎉 No one to worry about: nobody is heading down, the weak ones have a plan, everyone is active.</p>`}
    <p class="small muted hm-foot">From their levels (yours, else their last debrief), the trend, the work given and their activity. Open a student for their lacunes and what blocks them.</p></section>`;
}
function hmSprint(h) {
  const s = h.sprint;
  if (!s) return `<section class="panel hm-sprint"><h2>🗓️ Sprint</h2><p class="hm-empty">No sprint in the programme. <a href="#/settings/programme">Settings → Programme</a></p></section>`;
  const when = s.state === "now" ? `<b>${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"} left</b>` : s.state === "soon" ? `<b>starts in ${s.startsIn} day${s.startsIn === 1 ? "" : "s"}</b>` : `<b>ended</b>`;
  return `<section class="panel hm-sprint" data-sprint="${s.n}"><div class="panel-head"><h2>🗓️ Sprint ${s.n} ${s.state === "ended" ? `<span class="pill">ended</span>` : s.state === "soon" ? `<span class="pill">soon</span>` : `<span class="pill">running</span>`}</h2><a class="small" href="#/sprints/${s.n}">Full diagnosis →</a></div>
    <p class="hm-st">${esc(s.title)}</p>
    <div class="hm-time"><i style="width:${s.state === "soon" ? 0 : s.elapsed}%"></i></div>
    <p class="small muted hm-dates">${esc(hmD(s.start))} → ${esc(hmD(s.end))} · ${when} · ${s.briefs.length} brief${s.briefs.length === 1 ? "" : "s"}${s.briefs.length ? `: ${s.briefs.map((b) => `<a href="#/brief/${b.id}">${esc(b.title)}</a>`).join(", ")}` : ""}</p>
    <div class="hm-sd" id="hm-sd"><div class="hm-skel" style="height:150px"></div></div>
    ${s.next ? `<div class="hm-next"><span>Next</span><b>Sprint ${s.next.n} · ${esc(s.next.title)}</b><small>${s.next.startsIn ? `in ${s.next.startsIn} day${s.next.startsIn === 1 ? "" : "s"}` : "today"} · ${esc(hmD(s.next.start))}</small></div>` : ""}</section>`;
}
/** The sprint's objectives reached or not, its levels, its shared lacunes (the sprint's diagnosis, read after the page). */
async function hmSprintDiag(n) {
  const box = $("#hm-sd");
  if (!box) return;
  let D;
  try { D = await api(`/sprints/${n}/diag`); } catch (e) { box.innerHTML = `<p class="hm-empty small">Couldn't read the sprint's objectives: ${esc(e.message)}</p>`; return; }
  if (!box.isConnected) return;
  if (!D.evaluated) { box.innerHTML = `<p class="hm-empty small">No debrief analyzed or assessment graded in this sprint yet: its objectives show here as soon as there is one.</p>`; return; }
  const items = (D.goals || []).flatMap((g) => g.items);
  const covered = items.filter((i) => i.covered), reached = covered.filter((i) => i.share === "few"), notYet = covered.filter((i) => i.share !== "few").sort((a, b) => b.n - a.n);
  const notEval = items.length - covered.length;
  const reach = covered.length ? Math.round(covered.reduce((a, i) => a + 100 * (1 - i.n / D.evaluated), 0) / covered.length) : null;
  const comps = (D.objectives || []).filter((o) => o.pct != null);
  const compPct = comps.length ? Math.round(comps.reduce((a, o) => a + o.pct, 0) / comps.length) : null;
  const tot = HM_ORDER.reduce((a, k) => a + (D.levels?.[k] || 0), 0);
  const lvBar = tot ? `<div class="hm-lrow hm-slv"><span class="hm-ll">Levels</span><span class="hm-lbar">${HM_ORDER.filter((k) => D.levels[k]).map((k) => `<i class="hm-hit" style="flex:${D.levels[k]};background:${HM_LV[k][0]}" data-tip="${HM_LV[k][1]}: ${D.levels[k]} (${Math.round((100 * D.levels[k]) / tot)}%)"></i>`).join("")}</span><span class="hm-ln">${tot}</span></div>
    <div class="hm-legend">${HM_ORDER.filter((k) => D.levels[k]).map((k) => `<span><i style="background:${HM_LV[k][0]}"></i>${HM_LV[k][1]} <b>${Math.round((100 * D.levels[k]) / tot)}%</b></span>`).join("")}</div>` : "";
  const chip = (i, ok) => `<span class="hm-oc ${ok ? "ok" : i.share}" title="${ok ? "Reached by the class" : `${i.n} of ${D.evaluated} students still have a lacune here`}">${ok ? "✓" : "✗"} ${esc(i.name)}${ok ? "" : ` <small>${i.n}/${D.evaluated}</small>`}</span>`;
  const lac = (D.lacunes || []).filter((l) => l.n >= 2).slice(0, 4);
  box.innerHTML = `<div class="hm-sfig">
      <span><b>${covered.length ? `${reached.length}/${covered.length}` : "—"}</b>objectives reached</span>
      <span><b>${reach == null ? "—" : reach + "%"}</b>of the class reaches them</span>
      <span><b>${compPct == null ? "—" : compPct + "%"}</b>competencies validated</span>
      <span><b>${D.evaluated}<small>/${D.students}</small></b>students evaluated</span></div>
    ${lvBar}
    ${notYet.length ? `<p class="hm-cap">Not reached yet</p><div class="hm-ocs">${notYet.slice(0, 8).map((i) => chip(i, false)).join("")}${notYet.length > 8 ? `<span class="hm-oc more">+${notYet.length - 8}</span>` : ""}</div>` : ""}
    ${reached.length ? `<p class="hm-cap">Reached</p><div class="hm-ocs">${reached.slice(0, 10).map((i) => chip(i, true)).join("")}${reached.length > 10 ? `<span class="hm-oc more">+${reached.length - 10}</span>` : ""}</div>` : ""}
    ${notEval ? `<p class="small muted" style="margin:8px 0 0">${notEval} objective${notEval > 1 ? "s" : ""} not evaluated yet (no question or lacune about ${notEval > 1 ? "them" : "it"}).</p>` : ""}
    ${!items.length && comps.length ? `<p class="hm-cap">Competencies</p><div class="hm-ocs">${comps.map((o) => `<span class="hm-oc ${o.pct >= 70 ? "ok" : o.pct >= 40 ? "group" : "majority"}" title="${esc(o.name)}">${esc(o.label)}N${o.level} <small>${o.pct}%</small></span>`).join("")}</div>` : ""}
    ${(() => { const d = (D.briefs || []).reduce((x, b) => x + b.debriefs, 0), f = (D.briefs || []).reduce((x, b) => x + b.final, 0); return d > f ? `<p class="small muted" style="margin:8px 0 0">From ${d} debrief${d > 1 ? "s" : ""}, ${d - f} not finalized yet: the figures can still change.</p>` : ""; })()}
    ${lac.length ? `<p class="hm-cap">Most shared lacunes</p><ul class="hm-lac">${lac.map((l) => `<li><span>${esc(l.notion)}</span><span class="hm-lacb"><i style="width:${Math.round((100 * l.n) / Math.max(1, l.of))}%"></i></span><b>${l.n}/${l.of}</b></li>`).join("")}</ul>` : ""}`;
}
function hmUp(h) {
  const up = h.improving.slice(0, 5), well = (h.strong || []).slice(0, Math.max(0, 5 - up.length));
  const row = (p, kind) => `<li><a class="hm-who" href="#/student/${esc(p.id)}">${avatar(p.name, p.id)}<span><b>${esc(p.name)}</b>${hmPill(p.level)}</span></a>
    <span class="hm-upw ${kind}" title="${esc(kind === "up" ? p.good[0] || "going up" : "a solid level, steady")}">${kind === "up" ? "↑ going up" : "★ steady"}</span></li>`;
  return `<section class="panel hm-up"><div class="panel-head"><h2>🌱 Doing well</h2><a class="small" href="#/students">Students →</a></div>
    ${up.length || well.length ? `<ul class="hm-ups">${up.map((p) => row(p, "up")).join("")}${well.map((p) => row(p, "well")).join("")}</ul>
      <p class="small muted hm-foot">${up.length ? `<b>${h.improving.length}</b> going up · ` : ""}a word of encouragement goes a long way.</p>` : `<p class="hm-empty small">No one stands out yet: it shows after a few debriefs.</p>`}</section>`;
}

/** Fills the home's top part (#ov-home). */
async function loadHome(pre) {
  const box = $("#ov-home");
  if (!box) return;
  let h;
  try { h = pre ? await pre : await api("/home"); if (h && h.__error) throw h.__error; } catch (e) { box.innerHTML = `<div class="notice">Couldn't load the class overview: ${esc(e.message)}</div>`; return; }
  if (!box.isConnected) return;
  box.innerHTML = `${hmStats(h)}${hmAlerts(h)}${hmBar(h)}
    <div class="hm-row">${hmSprint(h)}<div class="hm-col">${hmLevels(h)}${hmUp(h)}</div></div>
    ${hmWatch(h)}
    ${hmWeeks(h)}
    <div class="hm-tip" id="hm-tip" role="tooltip" hidden></div>`;
  if (h.sprint) hmSprintDiag(h.sprint.n);
  $$("[data-hmplan]", box).forEach((b) => b.onclick = () => busy(b, () => insBuildPlan(b.dataset.hmplan)));
  $$("[data-hmmsg]", box).forEach((b) => b.onclick = () => insMessage(b.dataset.hmmsg, b.dataset.name));
  // the charts' hover: what a bar or a segment is
  const tip = $("#hm-tip", box);
  box.addEventListener("mousemove", (e) => {
    const t = e.target.closest?.(".hm-hit");
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.dataset.tip; tip.hidden = false;
    // the page may be zoomed (compact size): the mouse and the box are in screen pixels, the tooltip in the page's
    const r = box.getBoundingClientRect(), z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    tip.style.left = `${Math.min((e.clientX - r.left) / z + 12, r.width / z - tip.offsetWidth - 4)}px`; tip.style.top = `${(e.clientY - r.top) / z - tip.offsetHeight - 10}px`;
  });
  box.addEventListener("mouseleave", () => { tip.hidden = true; });
}
