// 🔭 A student's Overview: what the teacher needs to know, and to do, at a glance.
//   ⚠ what needs your attention now (a help request, a brief not handed in, inactivity, a debrief to finalize…)
//   🎯 where they stand: your level / the proposed one, the outlook (and why), their level journey and assessments
//   🧩 what they don't master yet: the most important lacunes grouped by concept (all of them one click away)
//   ✅ your next steps for them · their activity · competencies · your notes · their practice skills (folded)
/* global $, $$, api, esc, toast, busy, fmtAgo, fmtDate, openDialog, dlg, gapsDialog, masteryInk, sparkline, skillLabel, latestBriefHtml, wireWorkOn */

const INS_LV = { excellent: ["#2563eb", "Excellent", 5], bon: ["#16a34a", "Bon", 4], moyen: ["#d97706", "Moyen", 3], faible: ["#ef4444", "Faible", 2], critique: ["#b91c1c", "Critique", 1] };
const INS_WAY = { up: ["up", "↑", "Likely to improve"], down: ["down", "↓", "Likely to decline"], flat: ["flat", "→", "Likely to stay steady"] };
const INS_TREND = { up: "improving", down: "slipping", flat: "steady", unknown: "not enough levels yet" };
const svInk = (s) => (typeof masteryInk === "function" ? masteryInk(s) : "var(--blue)");
const svFirst = (d) => esc(String(d.player?.name || "them").split(" ")[0]);

function svLvPill(lv, big = false) {
  const L = INS_LV[lv];
  return L ? `<span class="sv-lv ${big ? "big" : ""}" style="--c:${L[0]}">${L[1]}</span>` : `<span class="sv-lv none ${big ? "big" : ""}">No level yet</span>`;
}
const svSkel = (h = 120) => `<div class="sv-skel" style="height:${h}px"></div>`;

// ------------------------------------------------------------------ the page (what doesn't need the insight is drawn at once)
function svOverviewHtml(d, sid, extra) {
  const L = d.learning || null, comps = L?.competencies || [], ok = comps.filter((c) => c.level > 0).length, notYet = comps.filter((c) => c.status === "not_yet").length;
  return `<div class="sv">
    <div id="sv-alerts"></div>
    <div class="sv-grid">
      <div class="sv-main">
        <section class="panel sv-stand" id="sv-stand">${svSkel(170)}</section>
        <section class="panel sv-lac" id="sv-lac">${svSkel(220)}</section>
        ${L && typeof latestBriefHtml === "function" ? latestBriefHtml(L, sid) : ""}
      </div>
      <aside class="sv-side">
        <section class="panel sv-next" id="sv-next">${svSkel(180)}</section>
        ${svActivity(d, sid)}
        ${L ? `<section class="panel sv-comps"><div class="panel-head"><h2>🎓 Competencies</h2><a class="btn small" href="#/student/${esc(sid)}?tab=comps">Details →</a></div>
          <div class="sv-cbar"><i style="width:${comps.length ? Math.round((100 * ok) / comps.length) : 0}%"></i></div>
          <p class="small" style="margin:6px 0 8px"><b>${ok}</b> of ${comps.length} validated${notYet ? ` · <span style="color:var(--down)">${notYet} not yet</span>` : ""}</p>
          <div class="stu-comp-mini">${comps.map((c) => `<span class="cmm ${c.status}" title="${esc(c.name)}">${esc(c.label)}</span>`).join("")}</div></section>` : ""}
        <section class="panel sv-notes" id="sv-notes">${svSkel(80)}</section>
      </aside>
    </div>
    ${extra.practice ? `<details class="sv-more"><summary><span>🎯 Practice skills</span><span class="muted small">from the challenges they solve: skills, mistakes, what to give them</span></summary><div class="stack" style="margin-top:12px">${extra.practice}</div></details>` : ""}
  </div>`;
}

/** Their activity: in ClassBot, on GitHub, in practice; points over 12 weeks. */
function svActivity(d, sid) {
  const p = d.player || {}, gh = d.learning?.github, act = gh?.activity;
  const commits = act ? act.days.reduce((s, x) => s + (x[7] ?? x[0]) + x[2], 0) : null;
  const days = (t) => (t ? Math.floor((Date.now() / 1000 - t) / 86400) : null);
  const seen = days(p.last_active), push = act?.last ? days(act.last) : null;
  const warn = (n) => (n != null && n >= 4 ? " bad" : "");
  const acc = d.accuracy == null ? null : Math.round(d.accuracy <= 1 ? d.accuracy * 100 : d.accuracy);
  const row = (ico, label, val, sub = "", cls = "") => `<div class="sv-act${cls}"><span class="sv-ai">${ico}</span><span class="sv-al">${label}</span><b>${val}</b>${sub ? `<span class="sv-as">${sub}</span>` : ""}</div>`;
  return `<section class="panel sv-activity"><div class="panel-head"><h2>📈 Activity</h2>${typeof sparkline === "function" && d.weeks?.length ? `<span class="sv-spark" title="Points per week, last 12 weeks">${sparkline(d.weeks.map((w) => w.pts))}</span>` : ""}</div>
    ${row("🕐", "Last seen", p.last_active ? fmtAgo(p.last_active) : "never", "", warn(seen))}
    ${gh?.login ? row("🐙", "Last push", act?.last ? fmtAgo(act.last) : "never", commits != null ? `${commits} commits · 14 days` : "", warn(push)) : row("🐙", "GitHub", "not linked", "<code>/github</code>")}
    ${row("🧩", "Practice", `${d.solved?.total ?? 0} solved`, acc != null ? `${acc}% right` : "")}
    ${row("🏆", "Season", `${d.seasonPoints ?? 0} pts`, d.seasonRank ? `#${d.seasonRank} of ${d.seasonSize}` : "")}
    ${p.daily_streak ? row("🔥", "Daily streak", `${p.daily_streak} day${p.daily_streak > 1 ? "s" : ""}`) : ""}
  </section>`;
}

// ------------------------------------------------------------------ ⚠ attention: what they may be missing
function svAlertsHtml(I, d, sid, intOpen) {
  const A = [];
  if (I.openHand) A.push({ t: "bad", ico: "✋", h: `${svFirst(d)} asked for your help`, s: `« ${esc(I.openHand.question)} » · ${esc(fmtAgo(I.openHand.created_at))}`, href: "#/hands", b: "Answer" });
  const L = d.learning;
  const cur = L?.briefs?.find((x) => !x.review || x.review.status !== "final");
  if (cur && cur.due && !cur.handin) {
    const left = cur.due - Date.now() / 1000;
    if (left < 0) A.push({ t: "bad", ico: "📄", h: `${esc(cur.title)} isn't handed in`, s: `due ${esc(fmtDate(cur.due))}`, go: "learning", b: "See" });
    else if (left < 3 * 86400) A.push({ t: "warn", ico: "📄", h: `${esc(cur.title)}: not handed in yet`, s: `due in ${left > 86400 ? `${Math.round(left / 86400)} day(s)` : `${Math.max(1, Math.round(left / 3600))} hour(s)`}`, go: "learning", b: "See" });
  }
  if (I.idleDays != null && I.idleDays >= 4) A.push({ t: I.idleDays >= 7 ? "bad" : "warn", ico: "💤", h: `No activity for ${I.idleDays} days`, s: "nothing in ClassBot or Discord", act: "msg", b: "Message" });
  if (I.plan?.toReview) A.push({ t: "warn", ico: "📦", h: "Their mini brief is handed in", s: "waiting for your validation", href: `#/wplan/${I.plan.id}`, b: "Review" });
  if (I.plan?.overdue) A.push({ t: "bad", ico: "🧭", h: "Their plan d'action is overdue", s: `${I.plan.pct}% done`, href: `#/wplan/${I.plan.id}`, b: "Open" });
  if (I.toFinalize.length) A.push({ t: "info", ico: "⏳", h: `${I.toFinalize.length} debrief${I.toFinalize.length > 1 ? "s" : ""} to finalize`, s: I.toFinalize.map((f) => `B${f.n}`).join(", "), href: `#/debrief/${I.toFinalize[0].bid}~${encodeURIComponent(I.toFinalize[0].who)}`, b: "Open" });
  if (intOpen) A.push({ t: "warn", ico: "🛡️", h: `${intOpen} answer${intOpen > 1 ? "s" : ""} to check`, s: "integrity flags on their code", go: "challenges", b: "Check" });
  if (!A.length) return "";
  return `<div class="sv-alerts" role="list">${A.slice(0, 4).map((a) => `<div role="listitem" class="sv-alert ${a.t}"><span class="sv-ai">${a.ico}</span><div><b>${a.h}</b><span>${a.s}</span></div>
    ${a.href ? `<a class="btn small" href="${esc(a.href)}">${a.b}</a>` : `<button class="btn small" data-insact="${esc(a.act || "")}" data-go="${esc(a.go || "")}">${a.b}</button>`}</div>`).join("")}</div>`;
}

// ------------------------------------------------------------------ 🎯 where they stand
function svJourneyHtml(j) {
  if (!j.length) return `<p class="muted small sv-empty">No debrief or sprint level yet.</p>`;
  return `<div class="sv-bars">${j.slice(-10).map((x) => { const L = INS_LV[x.lv] || ["#94a3b8", x.lv, 0];
    return `<span class="sv-bar" title="${esc(x.k)} · ${esc(x.t)} : ${esc(L[1])}"><span class="sv-bt"><i style="height:${L[2] * 20}%;background:${L[0]}"></i></span><b>${esc(x.k)}</b></span>`; }).join("")}</div>`;
}
function svScoresHtml(a) {
  if (!a.length) return `<p class="muted small sv-empty">No graded assessment yet.</p>`;
  return `<div class="sv-bars">${a.slice(-8).map((x) => `<span class="sv-bar" title="${esc(x.title)} : ${x.score}%"><span class="sv-bt"><i style="height:${Math.max(4, x.score)}%;background:${svInk(x.score)}"></i></span><b style="color:${svInk(x.score)}">${x.score}</b></span>`).join("")}</div>`;
}
function svStandHtml(I) {
  const lvl = I.teacherLevel?.level || I.proposed?.level || I.current;
  const src = I.teacherLevel ? `Your level · ${esc(fmtDate(I.teacherLevel.at))}` : I.proposed ? "Proposed by ClassBot" : I.current ? "Their last debrief" : "";
  const f = I.forecast, w = INS_WAY[f?.way || "flat"];
  return `<div class="sv-standg">
      <div class="sv-level">
        <span class="sv-k">Level</span>${svLvPill(lvl, true)}<span class="sv-src">${src}</span>
        <div class="sv-lvrow"><label for="ins-lv">Yours</label><select id="ins-lv"><option value="">${I.proposed ? `Proposed (${INS_LV[I.proposed.level][1]})` : "Not set"}</option>${["excellent", "bon", "moyen", "faible", "critique"].map((l) => `<option value="${l}" ${I.teacherLevel?.level === l ? "selected" : ""}>${INS_LV[l][1]}</option>`).join("")}</select></div>
        <p class="sv-why small muted">${I.proposed ? `From their ${I.proposed.debriefs} debrief${I.proposed.debriefs === 1 ? "" : "s"}${I.proposed.debAvg ? ` (mostly ${INS_LV[I.proposed.debAvg][1]})` : ""}${I.proposed.objAll ? ` and ${I.proposed.objOk}/${I.proposed.objAll} sprint objectives mastered` : ""}.` : ""}${I.current ? ` Last debrief: ${INS_LV[I.current][1]}.` : ""}</p>
      </div>
      <div class="sv-outlook ${w[0]}">
        <span class="sv-k">Outlook <span class="sv-conf" title="${esc(f.confidence)} confidence: how much data it rests on">${f.confidence === "high" ? "●●●" : f.confidence === "medium" ? "●●○" : "●○○"}</span></span>
        <b class="sv-way">${w[1]} ${w[2]}</b>
        <ul class="sv-rs">${f.reasons.slice(0, 3).map((r) => `<li class="${r.good ? "good" : "bad"}">${esc(r.t)}</li>`).join("") || `<li>Not enough data yet.</li>`}</ul>
        ${f.blockers.length ? `<p class="small sv-blk"><b>Basics the next sprints build on:</b> ${f.blockers.slice(0, 3).map((b) => `${esc(b.text)} <span class="muted">(${esc(b.needs.join(", "))})</span>`).join(" · ")}</p>` : ""}
      </div>
    </div>
    <div class="sv-charts">
      <div><span class="sv-k">Level journey <span class="muted">· ${esc(INS_TREND[I.trend] || "")}</span></span>${svJourneyHtml(I.journey)}</div>
      <div><span class="sv-k">Assessments <span class="muted">· average ${I.avgScore ?? "—"}%</span></span>${svScoresHtml(I.assess)}</div>
    </div>`;
}

// ------------------------------------------------------------------ 🧩 lacunes: the most important, grouped by concept
const SV_KIND_ICO = { plan: "🧭", oral: "🗣️", req: "📋", assess: "📝", mes: "🧪", comp: "🎓" };
function svThemeRow(t, i, full = false) {
  const n = t.items.length;
  const ev = (list) => `<ul class="sv-ev">${list.map((x) => `<li><span>${SV_KIND_ICO[x.kind] || "•"}</span><span>${esc(x.text)} <span class="muted">· ${esc(x.where.join(", "))}</span></span></li>`).join("")}</ul>`;
  return `<li class="sv-th ${t.blocks.length ? "blocks" : ""}">
    <span class="sv-thn">${i + 1}</span>
    <div class="sv-thb">
      <div class="sv-tht"><b>${esc(t.label)}</b>${t.blocks.length ? `<span class="sv-tag bad" title="A basic the next sprint builds on">${esc(t.blocks.join(", "))} builds on it</span>` : (t.next || []).length ? `<span class="sv-tag" title="It comes back in a coming sprint, without blocking it">back in ${esc(t.next.join(", "))}</span>` : ""}${t.plan ? `<span class="sv-tag plan" title="${esc(t.plan.notion)}">🧭 in their plan</span>` : ""}</div>
      ${t.plan?.why ? `<p class="small sv-thw">${esc(t.plan.why)}</p>` : ""}
      <p class="small muted sv-thm">${n ? `${n} sign${n > 1 ? "s" : ""}` : ""}${t.where.length ? `${n ? " · " : ""}seen in ${esc(t.where.slice(0, 4).join(", "))}${t.where.length > 4 ? "…" : ""}` : ""}</p>
      ${n ? (full ? ev(t.items) : `<details class="sv-evd"><summary>What we saw</summary>${ev(t.items.slice(0, 5))}${n > 5 ? `<p class="small muted" style="margin:4px 0 0">+ ${n - 5} more in « See all »</p>` : ""}</details>`) : ""}
    </div></li>`;
}
function svLacHtml(I, d) {
  const cname = new Map((d.learning?.competencies || []).map((c) => [String(c.label || c.code), c.name]));
  const comps = I.comps || [], th = I.themes || [];
  const top = th.slice(0, 4);
  const total = th.length + comps.length;
  return `<div class="panel-head"><h2>🧩 What they don't master yet</h2>${total ? `<span class="muted small">${total} in all</span>` : ""}</div>
    ${top.length ? `<p class="small muted sv-sub">The most important first: the basics the next sprints build on, what their plan targets, what keeps coming back.</p><ol class="sv-ths">${top.map((t, i) => svThemeRow(t, i)).join("")}</ol>`
      : `<p class="muted">Nothing found yet: no debrief analyzed and no assessment graded, or everything is fine.</p>`}
    ${comps.length ? `<div class="sv-cnv"><span class="sv-k">Competencies not validated</span><span>${comps.slice(0, 5).map((c) => `<span class="sv-tag comp" title="${esc(cname.get(c.code) || "")}${c.why ? " · " + esc(c.why) : ""}">${esc(c.code)}${c.times > 1 ? ` ×${c.times}` : ""}</span>`).join("")}${comps.length > 5 ? `<span class="muted small"> +${comps.length - 5}</span>` : ""}</span></div>` : ""}
    <div class="sv-foot">${total > top.length ? `<button class="btn small primary" id="ins-all">See all ${total} →</button>` : ""}<button class="btn small" id="ins-gaps">🔎 Debrief by debrief</button>
      ${I.plan ? `<a class="btn small" href="#/wplan/${I.plan.id}">🧭 Their plan d'action</a>` : `<button class="btn small" data-insact="plan">🧭 Build a plan d'action</button>`}</div>`;
}
function svAllLacunes(I, d, sid) {
  const cname = new Map((d.learning?.competencies || []).map((c) => [String(c.label || c.code), c.name]));
  openDialog(`What ${d.player?.name || "they"} don't master yet`, `
    <p class="muted small" style="margin-top:0">Grouped by concept, the most important first: the basics the next sprints build on (${esc((I.next || []).map((n) => "S" + n.sprint).join(", ") || "—")}), what their plan d'action targets, what keeps coming back. With what we saw each time.</p>
    <ol class="sv-ths full">${(I.themes || []).map((t, i) => svThemeRow(t, i, true)).join("")}</ol>
    ${(I.comps || []).length ? `<h3 style="margin:16px 0 6px">🎓 Competencies not validated</h3><ul class="sv-ev">${I.comps.map((c) => `<li><span>🎓</span><span><b>${esc(c.code)}</b> ${esc(cname.get(c.code) || "")} <span class="muted">· ${esc(c.where.join(", "))}</span>${c.why ? `<span class="small muted" style="display:block">${esc(c.why)}</span>` : ""}</span></li>`).join("")}</ul>` : ""}
    ${(I.objectives?.missed || []).length ? `<h3 style="margin:16px 0 6px">🎯 Sprint objectives not mastered yet</h3><p class="small" style="display:flex;flex-wrap:wrap;gap:4px">${I.objectives.missed.map((o) => `<span class="sv-tag">S${o.sprint} · ${esc(o.item)}</span>`).join("")}</p>` : ""}`,
    [{ label: "🔎 Debrief by debrief", action: () => { dlg.close(); gapsDialog({ discord_id: sid, name: d.player?.name }); } },
      I.plan ? { label: "🧭 Their plan d'action", primary: true, action: () => { dlg.close(); location.hash = `#/wplan/${I.plan.id}`; } } : { label: "🧭 Build a plan d'action", primary: true, action: () => { dlg.close(); insBuildPlan(sid); } }]);
  dlg.classList.add("wide");
}

// ------------------------------------------------------------------ ✅ your next steps
function svNextSteps(I, d, sid) {
  const A = [];
  for (const n of I.notDebriefed.slice(0, 1)) A.push({ ico: "🔍", t: `Debrief B${n.n}`, s: `${n.title} · due date passed`, href: `#/debrief/${n.bid}~${encodeURIComponent("u:" + sid)}`, b: "Debrief" });
  for (const f of I.toFinalize.slice(0, 1)) A.push({ ico: "📝", t: `Finalize the debrief of B${f.n}`, s: f.title, href: `#/debrief/${f.bid}~${encodeURIComponent(f.who)}`, b: "Open" });
  if (I.plan?.status === "sent") A.push({ ico: "🧭", t: "Follow their plan d'action", s: `${I.plan.pct}% done${I.plan.objTotal ? ` · ${I.plan.objDone}/${I.plan.objTotal} objectives ticked` : ""}${I.plan.due_at ? ` · due ${fmtDate(I.plan.due_at)}` : ""}`, href: `#/wplan/${I.plan.id}`, b: "Open" });
  else if (I.plan?.status === "draft") A.push({ ico: "🧭", t: "Send their plan d'action", s: `a draft with ${I.plan.steps} action(s)`, href: `#/wplan/${I.plan.id}`, b: "Continue" });
  else if ((I.themes || []).length >= 2 || ["faible", "critique"].includes(I.teacherLevel?.level || I.proposed?.level || I.current)) {
    const t = (I.themes || [])[0];
    A.push({ ico: "🧭", t: "Build a plan d'action", s: t ? `starting with « ${t.label} »: the AI proposes actions, you choose` : "the AI diagnoses their lacunes and proposes actions", act: "plan", b: "Build" });
  }
  const wo = d.coach?.workOn?.[0];
  if (wo) A.push({ ico: "🎯", t: `Practice: ${typeof skillLabel === "function" ? skillLabel(wo.skill) : wo.skill}`, s: `${wo.mastery}% · 3 challenges at their level, due in a week`, act: "pset", skill: wo.skill, b: "Give 3" });
  if (I.avgScore != null && I.avgScore < 50 && I.assess.length) A.push({ ico: "📝", t: "Go over their assessments", s: `${I.avgScore}% on average: the questions they missed`, go: "assess", b: "See" });
  A.push({ ico: "💬", t: `Talk with ${svFirst(d)}`, s: "a message by Discord DM, from you", act: "msg", b: "Message" });
  return A.slice(0, 5);
}
function svNextHtml(I, d, sid) {
  return `<div class="panel-head"><h2>✅ Your next steps</h2></div>
    <ol class="sv-steps">${svNextSteps(I, d, sid).map((a, i) => `<li><span class="sv-ai">${a.ico}</span><div><b>${esc(a.t)}</b><span class="small muted">${esc(a.s)}</span></div>
      ${a.href ? `<a class="btn small ${i === 0 ? "primary" : ""}" href="${esc(a.href)}">${esc(a.b)}</a>` : `<button class="btn small ${i === 0 ? "primary" : ""}" data-insact="${esc(a.act || "")}" data-skill="${esc(a.skill || "")}" data-go="${esc(a.go || "")}">${esc(a.b)}</button>`}</li>`).join("")}</ol>`;
}
function svNotesHtml(I) {
  return `<div class="panel-head"><h2>🗒️ Your notes</h2><span class="toolbar" style="margin:0"><button class="btn small" id="ins-ai" title="The AI writes it from their levels, lacunes and work">✨ AI</button><button class="btn small" id="ins-edit">${I.note ? "Edit" : "Write"}</button></span></div>
    ${I.note ? `<p class="sv-ntext">${esc(I.note.text)}</p><p class="small muted" style="margin:6px 0 0">${I.note.by === "ai" ? "✨ AI" : "You"}${I.note.at ? ` · ${esc(fmtDate(I.note.at))}` : ""}</p>`
      : `<p class="muted small" style="margin:0">What you see, what you agreed with them, the next step. Only teachers see it.</p>`}`;
}

// ------------------------------------------------------------------ wiring
async function insBuildPlan(sid) {
  const ps = await api(`/wplans?student=${sid}`);
  const id = ps.find((x) => x.status === "draft")?.id || (await api("/wplans", { method: "POST", body: { student: sid } })).id;
  location.hash = `#/wplan/${id}`;
}
function insMessage(sid, name) {
  openDialog(`Message to ${name}`, `<label for="ins-m">Sent to them by Discord DM, from you</label><textarea id="ins-m" rows="6" style="width:100%" maxlength="1900" placeholder="Salut ! Je vois que… On fait le point demain ?"></textarea>`,
    [{ label: "Send by DM", primary: true, action: async () => { const text = $("#ins-m", dlg).value.trim(); if (!text) throw new Error("Write the message first"); await api(`/students/${sid}/message`, { method: "POST", body: { text } }); dlg.close(); toast("Sent by DM"); } }]);
  setTimeout(() => $("#ins-m")?.focus(), 0);
}
function wireInsActions(root, sid, name) {
  $$("[data-insact]", root).forEach((b) => b.onclick = () => {
    const a = b.dataset.insact;
    if (b.dataset.go) { const t = document.querySelector(`[data-stab="${b.dataset.go}"]`); if (t) t.click(); return; }
    if (a === "plan") return busy(b, () => insBuildPlan(sid));
    if (a === "msg") return insMessage(sid, name);
    if (a === "pset") return busy(b, async () => {
      const r = await api("/skills/practice-set", { method: "POST", body: { skill: b.dataset.skill, students: [sid], count: 3, due_at: Math.floor(Date.now() / 1000) + 7 * 86400 } });
      toast(r.assignments ? `${r.assignments} challenge(s) assigned, due in a week (sent by DM)` : "No new challenge left on this skill: generate new ones in Practice skills", !r.assignments);
    });
  });
}

/** Draws the Overview: the parts from the student's data at once, then the insight (levels, lacunes, outlook, steps). */
async function renderOverview(pane, d, sid, o = {}) {
  pane.innerHTML = svOverviewHtml(d, sid, o);
  const name = d.player?.name || "the student";
  if (typeof wireWorkOn === "function") wireWorkOn(sid, d.player?.name);
  let I;
  try { I = await api(`/students/${sid}/insight`); }
  catch (e) { $("#sv-stand", pane).innerHTML = `<div class="notice">Couldn't gather their overview: ${esc(e.message)}</div>`; ["#sv-lac", "#sv-next", "#sv-notes"].forEach((s) => { const el = $(s, pane); if (el) el.remove(); }); return; }
  if (!pane.isConnected || !$("#sv-stand", pane)) return;
  const again = () => renderOverview(pane, d, sid, o);
  $("#sv-alerts", pane).innerHTML = svAlertsHtml(I, d, sid, o.intOpen || 0);
  $("#sv-stand", pane).innerHTML = svStandHtml(I);
  $("#sv-lac", pane).innerHTML = svLacHtml(I, d);
  $("#sv-next", pane).innerHTML = svNextHtml(I, d, sid);
  $("#sv-notes", pane).innerHTML = svNotesHtml(I);
  wireInsActions(pane, sid, name);
  $("#ins-lv", pane).onchange = async (e) => {
    try { await api(`/students/${sid}/level`, { method: "PUT", body: { level: e.target.value } }); toast(e.target.value ? "Your level is saved" : "Back to the proposed level"); again(); }
    catch (err) { toast(err.message, true); }
  };
  if ($("#ins-all", pane)) $("#ins-all", pane).onclick = () => svAllLacunes(I, d, sid);
  $("#ins-gaps", pane).onclick = (e) => busy(e.currentTarget, () => gapsDialog({ discord_id: sid, name }));
  $("#ins-ai", pane).onclick = (e) => busy(e.currentTarget, async () => { await api(`/plan/${sid}/ai`, { method: "POST", body: {} }); toast("Written by the AI: edit it if needed"); again(); });
  $("#ins-edit", pane).onclick = () => {
    openDialog(`Notes on ${name}`, `<label for="ins-t">What you see, what was agreed with the student, the next step</label>
      <textarea id="ins-t" rows="7" style="width:100%" maxlength="2000">${esc(I.note?.text || "")}</textarea><p class="muted small">Only teachers see it (also on their Plan d'action card). Empty it to remove the note.</p>`,
      [{ label: "Save", primary: true, action: async () => { await api(`/plan/${sid}`, { method: "PUT", body: { note: $("#ins-t", dlg).value } }); dlg.close(); toast("Saved"); again(); } }]);
  };
}
