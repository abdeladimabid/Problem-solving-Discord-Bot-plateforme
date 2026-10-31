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
  const tile = (ic, v, label, sub, href) => `<a class="hm-k" href="${href}"><span class="hm-ki">${ic}</span><span class="hm-kv">${v}</span><span class="hm-kl">${label}</span><span class="hm-ks">${sub}</span></a>`;
  return `<section class="hm-kpis" aria-label="Key figures">
    ${tile("👥", s.students, "students", `<b>${s.active7}</b> pushed code this week ${hmDelta(s.active7, s.activePrev7)}`, "#/students")}
    ${tile("💻", s.commits7, "commits this week", `${hmDelta(s.commits7, s.commitsPrev7) || "same as"} vs last week (${s.commitsPrev7})`, "#/github")}
    ${tile("📥", s.handinRate == null ? "—" : s.handinRate + "%", "hand-in rate", s.briefsPast ? `on ${s.briefsPast} brief${s.briefsPast > 1 ? "s" : ""} past their deadline` : "no deadline passed yet", "#/briefs")}
    ${tile("✅", s.debriefRate == null ? "—" : s.debriefRate + "%", "hand-ins debriefed", "finalized debriefs", "#/progress")}
    ${tile("🎓", s.avgLevel ? HM_LV[s.avgLevel][1] : "—", "average level", `<b>${s.low}</b> Faible or Critique`, "#/students")}
    ${tile("🧭", h.plans.live, "plans d'action running", s.plansPct == null ? (h.plans.drafts ? `${h.plans.drafts} draft${h.plans.drafts > 1 ? "s" : ""}` : "none yet") : `<b>${s.plansPct}%</b> done on average`, "#/assignments")}
  </section>`;
}
/** One bar: what waits for you (to the left), then the pages you open most. */
function hmBar(h) {
  const items = h.todo.map((t) => { const T = HM_TODO[t.k]; return `<a class="hm-c ${t.k === "hands" || t.k === "planlate" ? "hot" : ""}" href="${T[2]}"><span>${T[0]}</span><b>${t.n}</b> ${T[1]}${t.k === "hands" && t.since ? `<small>· ${esc(fmtAgo(t.since))}</small>` : ""}</a>`; }).join("");
  return `<section class="panel hm-bar">
    <div class="hm-wait"><h2>⏳ Waiting for you</h2>${items ? `<div class="hm-chips">${items}</div>` : `<span class="hm-none">✅ Nothing: no help request, no debrief to do, nothing to grade.</span>`}</div>
    <div class="hm-go" aria-label="Quick access">${HM_GO.map(([href, ic, t]) => `<a href="${href}"><span>${ic}</span>${t}</a>`).join("")}</div></section>`;
}

// ------------------------------------------------------------------ charts
/** Active students per day, 4 weeks: one bar a day (weekends lighter), this week's figures in the head. */
function hmActivity(h) {
  const A = h.activity, max = Math.max(1, ...A.map((a) => a.active)), W = 560, H = 200, pad = 22, bw = (W - pad) / A.length;
  const ticks = [0, Math.ceil(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const y = (v) => H - 18 - (v / max) * (H - 30);
  const bars = A.map((a, i) => {
    const wd = new Date(a.day + "T12:00:00Z").getUTCDay(), we = wd === 0 || wd === 6;
    const x = pad + i * bw + 2, top = y(a.active), hh = Math.max(a.active ? 3 : 0, H - 18 - top);
    return `<g class="hm-hit" data-tip="${esc(hmD(a.day))} · ${a.active} student${a.active === 1 ? "" : "s"} pushed · ${a.commits} commit${a.commits === 1 ? "" : "s"}">
      <rect x="${pad + i * bw}" y="0" width="${bw}" height="${H - 18}" fill="transparent"/>
      ${hh ? `<rect class="hm-bar-m${we ? " we" : ""}" x="${x}" y="${H - 18 - hh}" width="${Math.max(2, bw - 4)}" height="${hh}" rx="3"/>` : ""}</g>`;
  }).join("");
  const labels = A.map((a, i) => (i % 7 === 0 || i === A.length - 1 ? `<text x="${i === A.length - 1 ? W : pad + i * bw + bw / 2}" y="${H - 3}" text-anchor="${i === A.length - 1 ? "end" : "middle"}">${esc(hmD(a.day))}</text>` : "")).join("");
  const total = A.reduce((s, a) => s + a.commits, 0), days = A.filter((a) => a.active).length;
  return `<section class="panel hm-act"><div class="panel-head"><h2>📈 Activity on GitHub <span class="muted">4 weeks</span></h2><a class="small" href="#/github">GitHub →</a></div>
    <p class="small muted hm-sub">Students who pushed code each day · <b>${total}</b> commits that count · active ${days} day${days === 1 ? "" : "s"} out of 28</p>
    ${A.some((a) => a.active) ? `<svg class="hm-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Students who pushed code each day, last 4 weeks">
      ${ticks.map((v) => `<line class="hm-gl" x1="${pad}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="hm-yt" x="${pad - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
      ${bars}${labels}</svg>` : `<p class="hm-empty">No push in the last 4 weeks. Students connect their GitHub with <code>/github</code>.</p>`}</section>`;
}
/** The class's levels now, then debrief after debrief: one 100% bar each. */
function hmLevels(h) {
  const bar = (counts, label, sub, href) => {
    const tot = HM_ORDER.reduce((a, k) => a + (counts[k] || 0), 0);
    return `<a class="hm-lrow" href="${href}"><span class="hm-ll" title="${esc(sub)}">${esc(label)}</span><span class="hm-lbar">${tot ? HM_ORDER.filter((k) => counts[k]).map((k) =>
      `<i class="hm-hit" style="flex:${counts[k]};background:${HM_LV[k][0]}" data-tip="${esc(sub)} · ${HM_LV[k][1]}: ${counts[k]} (${Math.round((100 * counts[k]) / tot)}%)"></i>`).join("") : `<i style="flex:1;background:var(--line)"></i>`}</span>
      <span class="hm-ln">${tot}</span></a>`;
  };
  const tot = Math.max(1, h.total);
  return `<section class="panel hm-levels"><div class="panel-head"><h2>🎓 Levels</h2><a class="small" href="#/progress">Debriefs →</a></div>
    <div class="hm-lnow">${bar(h.levels, "Now", "Their level now (yours, else their last debrief)", "#/students")}</div>
    ${h.byBrief.length ? `<p class="hm-cap">Debrief after debrief</p>${h.byBrief.map((b) => bar(b.counts, "B" + b.b, b.title, `#/brief/${b.bid}`)).join("")}` : `<p class="hm-empty small">The levels of each debrief show here once debriefs are finalized.</p>`}
    <div class="hm-legend">${HM_ORDER.map((k) => `<span><i style="background:${HM_LV[k][0]}"></i>${HM_LV[k][1]} <b>${h.levels[k] || 0}</b></span>`).join("")}${h.levels.none ? `<span><i style="background:${HM_LV.none[0]}"></i>No level <b>${h.levels.none}</b></span>` : ""}</div>
    <div class="hm-tr"><span class="up" title="Their levels went up lately"><b>${h.trends.up}</b>↑ going up</span><span title="Steady"><b>${h.trends.flat}</b>→ steady</span><span class="down" title="Their levels went down lately"><b>${h.trends.down}</b>↓ going down</span></div>
    <p class="small muted hm-foot">${Math.round((100 * (h.levels.faible + h.levels.critique)) / tot)}% Faible or Critique now</p></section>`;
}
/** The briefs given lately: how many handed in, how many debriefed. */
function hmBriefs(h) {
  if (!h.recent.length) return `<section class="panel hm-br"><div class="panel-head"><h2>📥 Briefs: hand-ins & debriefs</h2><a class="small" href="#/briefs">Briefs →</a></div><p class="hm-empty">No brief given with a deadline yet.</p></section>`;
  return `<section class="panel hm-br"><div class="panel-head"><h2>📥 Briefs: hand-ins & debriefs</h2><a class="small" href="#/briefs">Briefs →</a></div>
    <div class="hm-bl">${h.recent.map((b) => { const hp = Math.min(100, Math.round((100 * b.handins) / Math.max(1, b.units))), dp = Math.min(100, Math.round((100 * b.debriefed) / Math.max(1, b.units)));
      return `<a class="hm-bi" href="#/brief/${b.id}"><span class="hm-bt"><b title="${esc(b.title)}">${esc(b.title)}</b><small>${b.past ? "ended" : "due"} ${esc(fmtDate(b.due_at))} · ${b.debriefed} debriefed</small></span>
        <span class="hm-bb hm-hit" data-tip="${esc(b.title)} · handed in ${b.handins}/${b.units} · debriefed ${b.debriefed}/${b.units}"><i class="h" style="width:${hp}%"></i><i class="d" style="width:${dp}%"></i></span>
        <span class="hm-bn">${b.handins}/${b.units}</span></a>`; }).join("")}</div>
    <div class="hm-legend"><span><i class="hk"></i>Handed in</span><span><i class="dk"></i>Debriefed</span></div></section>`;
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
  const hand = s.briefs.reduce((a, b) => a + Math.min(b.units, b.handins), 0), units = s.briefs.reduce((a, b) => a + b.units, 0), deb = s.briefs.reduce((a, b) => a + Math.min(b.units, b.debriefed), 0);
  return `<section class="panel hm-sprint"><div class="panel-head"><h2>🗓️ Sprint ${s.n} ${s.state === "ended" ? `<span class="pill">ended</span>` : s.state === "soon" ? `<span class="pill">soon</span>` : ""}</h2><a class="small" href="#/sprints/${s.n}">Sprint page →</a></div>
    <p class="hm-st">${esc(s.title)}</p>
    <div class="hm-time"><i style="width:${s.state === "soon" ? 0 : s.elapsed}%"></i></div>
    <p class="small muted hm-dates">${esc(hmD(s.start))} → ${esc(hmD(s.end))} · ${when}</p>
    ${s.briefs.length ? `<div class="hm-sfig"><span><b>${s.briefs.length}</b> brief${s.briefs.length > 1 ? "s" : ""}</span><span><b>${units ? Math.round((100 * hand) / units) : 0}%</b> handed in</span><span><b>${units ? Math.round((100 * deb) / units) : 0}%</b> debriefed</span></div>
      <ul class="hm-briefs">${s.briefs.map((b) => `<li><a href="#/brief/${b.id}"><b>${esc(b.title)}</b></a><span class="hm-bm"><span title="Handed in">📥 ${b.handins}/${b.units}</span><span title="Debriefs finalized">✅ ${b.debriefed}/${b.units}</span>${b.due_at ? `<span>${b.past ? "ended" : "due"} ${esc(fmtDate(b.due_at))}</span>` : ""}</span></li>`).join("")}</ul>`
      : `<p class="hm-empty small">No brief in this sprint yet. <a href="#/briefs">Briefs →</a></p>`}
    ${s.next ? `<div class="hm-next"><span>Next</span><b>Sprint ${s.next.n} · ${esc(s.next.title)}</b><small>${s.next.startsIn ? `in ${s.next.startsIn} day${s.next.startsIn === 1 ? "" : "s"}` : "today"} · ${esc(hmD(s.next.start))}</small></div>` : ""}</section>`;
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
  box.innerHTML = `${hmStats(h)}${hmBar(h)}
    <div class="hm-row">${hmActivity(h)}${hmLevels(h)}</div>
    ${hmWatch(h)}
    <div class="hm-row hm-r3">${hmSprint(h)}${hmBriefs(h)}${hmUp(h)}</div>
    <div class="hm-tip" id="hm-tip" role="tooltip" hidden></div>`;
  $$("[data-hmplan]", box).forEach((b) => b.onclick = () => busy(b, () => insBuildPlan(b.dataset.hmplan)));
  $$("[data-hmmsg]", box).forEach((b) => b.onclick = () => insMessage(b.dataset.hmmsg, b.dataset.name));
  // the charts' hover: what a bar or a segment is
  const tip = $("#hm-tip", box);
  box.addEventListener("mousemove", (e) => {
    const t = e.target.closest?.(".hm-hit");
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.dataset.tip; tip.hidden = false;
    const r = box.getBoundingClientRect();
    tip.style.left = `${Math.min(e.clientX - r.left + 12, r.width - tip.offsetWidth - 4)}px`; tip.style.top = `${e.clientY - r.top - tip.offsetHeight - 10}px`;
  });
  box.addEventListener("mouseleave", () => { tip.hidden = true; });
}
