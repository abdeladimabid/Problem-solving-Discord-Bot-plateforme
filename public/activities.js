/* ClassBot dashboard: Activités. The daily veilles (09:15, 30 min) and live codings (11:00, 45 min) of a period, from
   the class's programme: a month calendar to pick the period, what the programme says about it, then the week's plan
   and each item written one by one (the cards fill in). Saved per class and day: reopening a period shows them.
   Loaded after learning.js (it uses its helpers: loadRef, compChip, copyText, saveBlob). */
"use strict";

const ACT = { g: null, month: null, from: null, to: null, hover: null, cal: null, sel: null, live: {}, jobs: {}, running: false, stop: false };
const ACT_WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ACT_KIND = { holiday: "Holiday", off: "Day off", break: "Vacation", crossdefense: "Cross defense (SC)", certification: "Certification", other: "No brief", outside: "Outside the programme", weekend: "Weekend" };
// dates are days (YYYY-MM-DD), computed in UTC so they never shift with the time zone
const actAdd = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const actDow = (iso) => (new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7;   // 0 = Monday
const actMonday = (iso) => actAdd(iso, -actDow(iso));
const actDate = (iso, o = { weekday: "short", day: "numeric", month: "short" }) => new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, { ...o, timeZone: "UTC" });
const actToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const actDays = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
/** The colour of a sprint (the chart series, in turn). */
const spColor = (n) => (n ? `var(--s${((n - 1) % 6) + 1})` : "transparent");
const actSleep = (ms) => new Promise((r) => setTimeout(r, ms));
window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#/activities")) ACT.stop = true; });

function actRemember() { try { localStorage.setItem("cb-act", JSON.stringify({ g: S.g, from: ACT.from, to: ACT.to })); } catch { /* this visit only */ } }
function actRestore() {
  try { const r = JSON.parse(localStorage.getItem("cb-act") || "null"); if (r && r.g === S.g && r.from && r.to) { ACT.from = r.from; ACT.to = r.to; ACT.month = r.from.slice(0, 7); } } catch { /* nothing saved */ }
}

// ================================================================ the page
async function viewActivities() {
  ACT.stop = false;
  if (ACT.g !== S.g) Object.assign(ACT, { g: S.g, month: null, from: null, to: null, hover: null, cal: null, sel: null, live: {}, jobs: {} });
  if (!ACT.from) actRestore();
  ACT.month = ACT.month || actToday().slice(0, 7);
  view.innerHTML = `
    <div class="page-head"><div><h1>Activités</h1>
      <p class="sub">The daily <b>veilles</b> (09:15 · 30 min) and <b>live codings</b> (11:00 · 45 min) of a period, written from the programme of those days (week, sprint, objective, concepts, competencies), in the format of the YouCode template. The same for every class of the programme, whatever brief it runs.</p></div>
      <div class="toolbar" style="margin:0"><span id="ac-lib"></span><a class="btn" href="#/presentations">🎤 Presentations</a><button class="btn" id="ac-this">This week</button><button class="btn" id="ac-next">Next week</button></div></div>
    <div class="act-top">
      <section class="panel act-cal" id="ac-cal" aria-label="Calendar"><div class="skeleton" style="height:320px"></div></section>
      <div class="act-sum" id="ac-sum"></div>
    </div>
    <div id="ac-out"></div>`;
  const pickWeek = (mon) => { ACT.from = mon; ACT.to = actAdd(mon, 4); ACT.month = mon.slice(0, 7); actRemember(); actLoadMonth().then(actLoadSel); };
  $("#ac-this").onclick = () => pickWeek(actMonday(actToday()));
  $("#ac-next").onclick = () => pickWeek(actAdd(actMonday(actToday()), 7));
  await Promise.all([loadRef().catch(() => null), actLoadMonth()]);
  if (ACT.from && ACT.to) await actLoadSel(); else actSummary();
}

// ================================================================ calendar
async function actLoadMonth() {
  const start = actMonday(ACT.month + "-01");
  try { ACT.cal = await api(`/activities?from=${start}&to=${actAdd(start, 41)}`); }
  catch (e) { ACT.cal = null; toast(e.message, true); }
  actDrawCal();
}
function actDrawCal() {
  const box = $("#ac-cal");
  if (!box) return;
  const start = actMonday(ACT.month + "-01");
  const byDay = new Map((ACT.cal?.days || []).map((d) => [d.day, d]));
  const saved = new Set((ACT.cal?.items || []).filter((i) => i.kind !== "week").map((i) => i.day));
  const today = actToday();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const iso = actAdd(start, i), d = byDay.get(iso) || { kind: actDow(iso) > 4 ? "weekend" : "outside", label: "" };
    const tip = d.kind === "work" ? d.label : `${ACT_KIND[d.kind] || ""}${d.label && d.kind !== "weekend" ? ` · ${d.label}` : ""}`;
    return `<button type="button" class="act-d k-${d.kind}${iso.slice(0, 7) !== ACT.month ? " dim" : ""}${iso === today ? " is-today" : ""}" data-d="${iso}" data-k="${d.kind}"
      style="--sp:${spColor(d.sprint)}" title="${esc(tip)}" ${d.kind === "weekend" ? "disabled" : ""} aria-label="${esc(actDate(iso, { weekday: "long", day: "numeric", month: "long" }))}${tip ? ", " + esc(tip) : ""}">
      <span class="act-dn">${Number(iso.slice(8))}</span>${saved.has(iso) ? `<span class="act-saved" aria-hidden="true"></span>` : ""}</button>`;
  }).join("");
  const title = new Date(ACT.month + "-15T12:00:00Z").toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  box.innerHTML = `
    <div class="act-cal-h"><button class="icon-btn" data-m="-1" aria-label="Previous month"><svg class="i" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg></button>
      <b>${esc(title)}</b>
      <button class="icon-btn" data-m="1" aria-label="Next month"><svg class="i" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button></div>
    <div class="act-grid" role="grid">${ACT_WD.map((w) => `<span class="act-wd">${w}</span>`).join("")}${cells}</div>
    <div class="act-legend small"><span><i class="lg sp"></i>Sprint</span><span><i class="lg hol"></i>Holiday · day off</span><span><i class="lg brk"></i>Vacation</span><span><i class="lg sc"></i>SC · certification</span><span><i class="lg sav"></i>Saved</span></div>
    <p class="small muted act-tip">Click the first day, then the last one. Right-click (or hold) a weekday to mark it off or worked.</p>`;
  $$("[data-m]", box).forEach((b) => b.onclick = () => {
    const [y, m] = ACT.month.split("-").map(Number), d = new Date(Date.UTC(y, m - 1 + Number(b.dataset.m), 1));
    ACT.month = d.toISOString().slice(0, 7);
    actLoadMonth();
  });
  const grid = $(".act-grid", box);
  let held = null, longPress = false;
  grid.onclick = (e) => {
    const b = e.target.closest(".act-d");
    if (!b || b.disabled) return;
    if (longPress) { longPress = false; return; }
    actPick(b.dataset.d);
  };
  grid.onmouseover = (e) => { const b = e.target.closest(".act-d"); if (ACT.from && !ACT.to && b) { ACT.hover = b.dataset.d; actPaint(); } };
  grid.onmouseleave = () => { if (ACT.hover) { ACT.hover = null; actPaint(); } };
  grid.oncontextmenu = (e) => { const b = e.target.closest(".act-d"); if (!b || b.disabled) return; e.preventDefault(); actMark(b.dataset.d); };
  // tablets: hold a day to mark it
  grid.onpointerdown = (e) => {
    const b = e.target.closest(".act-d");
    if (!b || b.disabled || e.pointerType === "mouse") return;
    clearTimeout(held);
    held = setTimeout(() => { longPress = true; actMark(b.dataset.d); }, 600);
  };
  grid.onpointerup = grid.onpointercancel = () => clearTimeout(held);
  actPaint();
}
/** The selection on the calendar (first and last day filled, the days between tinted). */
function actPaint() {
  const lo = ACT.from, hi0 = ACT.to || ACT.hover;
  const [a, b] = lo && hi0 && hi0 < lo ? [hi0, lo] : [lo, hi0 || lo];
  $$("#ac-cal .act-d").forEach((el) => {
    const d = el.dataset.d;
    el.classList.toggle("in", !!a && d > a && d < b);
    el.classList.toggle("edge", !!a && (d === a || d === b));
    el.classList.toggle("first", !!a && d === a);
    el.classList.toggle("last", !!a && d === b);
    el.classList.toggle("preview", !ACT.to && !!ACT.hover);
    el.setAttribute("aria-pressed", String(!!a && d >= a && d <= b));
  });
}
function actPick(day) {
  if (!ACT.from || ACT.to) { ACT.from = day; ACT.to = null; ACT.sel = null; actPaint(); actSummary(); $("#ac-out").innerHTML = ""; return; }
  let [a, b] = day < ACT.from ? [day, ACT.from] : [ACT.from, day];
  if (actDays(a, b) > 62) { toast("Pick 62 days at most (about two months).", true); return; }
  ACT.from = a; ACT.to = b; ACT.hover = null;
  actRemember();
  actPaint();
  actLoadSel();
}
/** Right-click / hold: a working day becomes a day off, a holiday a worked day; once more, back to the calendar. */
async function actMark(day) {
  const d = (ACT.cal?.days || []).find((x) => x.day === day);
  if (!d || !["work", "off", "holiday"].includes(d.kind)) { toast(`${ACT_KIND[d?.kind] || "This day"}: it follows the programme.`, true); return; }
  const ov = ACT.cal?.overrides?.[day];
  const mark = ov ? null : d.kind === "work" ? "off" : d.kind === "holiday" ? "on" : null;
  try {
    await api("/activities/days", { method: "PUT", body: { day, mark } });
    toast(mark === "off" ? `${actDate(day)}: no activity that day` : mark === "on" ? `${actDate(day)}: worked, with activities` : `${actDate(day)}: back to the calendar`);
    await actLoadMonth();
    if (ACT.from && ACT.to) await actLoadSel();
  } catch (e) { toast(e.message, true); }
}

// ================================================================ the period
async function actLoadSel() {
  if (!ACT.from || !ACT.to) return;
  try { ACT.sel = await api(`/activities?from=${ACT.from}&to=${ACT.to}`); }
  catch (e) { toast(e.message, true); return; }
  ACT.live = Object.fromEntries(ACT.sel.weeks.map((w) => [w.monday, [...w.live]]));
  const lb = $("#ac-lib");
  if (lb) lb.innerHTML = ACT.sel.library ? `<a class="lib-tag" href="#/settings/library" title="Shared with the other classes of the library: what you generate or edit here, they get too">📚 ${esc(ACT.sel.library)}</a>` : "";
  actSummary();
  actResults();
}
const actItem = (kind, day) => (ACT.sel?.items || []).find((i) => i.kind === kind && i.day === day) || null;
/** What's left to write: the week plans, the veilles, the live codings (all of them, or the missing ones). */
function actTasks(all) {
  const out = [];
  for (const w of ACT.sel?.weeks || []) {
    if (!w.work.length) continue;
    const wk = actItem("week", w.monday), live = ACT.live[w.monday] || [];
    const planned = new Set((wk?.plan || []).map((j) => j.date));
    const sameLive = wk && live.join() === (wk.live || []).join();
    if (all || !wk || w.work.some((d) => !planned.has(d)) || !sameLive) out.push({ kind: "week", day: w.monday, week: w, keep: !all });
    for (const d of w.work) if (all || !actItem("veille", d)) out.push({ kind: "veille", day: d });
    for (const d of live) if (all || !actItem("live", d)) out.push({ kind: "live", day: d });
  }
  return out;
}
function actSummary() {
  const box = $("#ac-sum");
  if (!box) return;
  if (!ACT.from) {
    box.innerHTML = `<div class="panel act-empty"><div class="act-empty-ic" aria-hidden="true">📅</div><b>Pick a period</b>
      <p class="small muted">Click the first day in the calendar, then the last one (a day, a week, or up to two months). Weekends are skipped; holidays, vacations and cross defenses get no activity.</p></div>`;
    return;
  }
  if (!ACT.to || !ACT.sel) {
    box.innerHTML = `<div class="panel act-empty"><div class="act-empty-ic" aria-hidden="true">📅</div><b>From ${esc(actDate(ACT.from))}…</b><p class="small muted">Now click the last day of the period.</p></div>`;
    return;
  }
  const W = ACT.sel.weeks, work = W.reduce((n, w) => n + w.work.length, 0), lives = W.reduce((n, w) => n + (ACT.live[w.monday] || []).length, 0);
  const off = ACT.sel.days.filter((d) => d.dow <= 5 && d.kind !== "work").length;
  const tasks = actTasks(false), todo = tasks.filter((t) => t.kind !== "week").length, plans = tasks.length - todo, saved = (ACT.sel.items || []).filter((i) => i.kind !== "week").length;
  box.innerHTML = `<div class="panel act-range">
    <div class="panel-head"><h2>${esc(actDate(ACT.from))} → ${esc(actDate(ACT.to))}</h2><button class="btn small" id="ac-clear">Clear</button></div>
    <p class="small muted act-count">${work} working day${work === 1 ? "" : "s"} · ${work} veille${work === 1 ? "" : "s"} · ${lives} live coding${lives === 1 ? "" : "s"}${off ? ` · ${off} weekday${off === 1 ? "" : "s"} without activity` : ""}${saved ? ` · <b>${saved} saved</b>` : ""}</p>
    ${ACT.sel.ai ? "" : `<div class="notice warn small" style="margin-bottom:12px"><b>No AI is set up.</b> Add a key in Settings → AI keys (free with Groq or Gemini) to generate.</div>`}
    <div class="act-wks">${W.map(actWeekCard).join("")}</div>
    ${work ? `<div class="toolbar act-go">
      ${tasks.length ? `<button class="btn primary" id="ac-gen">✨ ${!todo ? (plans > 1 ? "Plan the weeks" : "Plan the week") : saved ? `Generate the ${todo} missing` : `Generate ${todo} activit${todo === 1 ? "y" : "ies"}`}</button>` : ""}
      ${saved ? `<button class="btn" id="ac-regen">↻ Regenerate all</button><button class="btn" id="ac-dl">${icon("download")} Download .md</button>` : ""}
      <button class="btn danger" id="ac-stop" hidden>Stop</button><span class="small muted" id="ac-prog" role="status"></span></div>` : ""}
  </div>`;
  $("#ac-clear").onclick = () => { Object.assign(ACT, { from: null, to: null, sel: null, hover: null }); actRemember(); actPaint(); actSummary(); $("#ac-out").innerHTML = ""; };
  if ($("#ac-gen")) $("#ac-gen").onclick = () => actGenerate(false);
  if ($("#ac-regen")) $("#ac-regen").onclick = async () => {
    if (await askConfirm("Regenerate everything?", "Every veille and live coding of the period is written again, and your edits are replaced.", "Regenerate")) actGenerate(true);
  };
  if ($("#ac-dl")) $("#ac-dl").onclick = () => saveBlob(new Blob([ACT.sel.weeks.map((w) => actWeekText(w)).filter(Boolean).join("\n\n---\n\n")], { type: "text/markdown;charset=utf-8" }), `activites-${ACT.from}_${ACT.to}.md`);
  $$("[data-lc]", box).forEach((b) => b.onclick = () => actToggleLive(b.dataset.w, b.dataset.lc));
  if (ACT.running) actButtons(true);
}
/** A week of the period, from the programme only (the classes of a programme run different briefs, same concepts). */
function actWeekCard(w) {
  const sp = w.sprint, pw = w.weeks;
  const reason = !w.work.length ? (ACT.sel.days.find((d) => d.day >= w.from && d.day <= w.to && d.dow <= 5) || {}).label || "No working day" : "";
  const comps = [...new Set(pw.flatMap((x) => [...x.competencies, ...x.soft]))];
  const tech = [...new Set(pw.flatMap((x) => x.tech || []))];
  const live = ACT.live[w.monday] || [];
  const days = Array.from({ length: 5 }, (_, i) => actAdd(w.monday, i));
  return `<div class="act-wk" style="--sp:${spColor(sp?.n)}">
    <div class="act-wk-h"><b>Week of ${esc(actDate(w.monday, { day: "numeric", month: "short" }))}</b>
      ${pw.map((x) => `<span class="tag" title="Week ${x.n} of the programme">S${x.n}</span>`).join(" ")}
      ${sp ? `<span class="act-sprint" title="${esc(sp.title)}">Sprint ${sp.n} · ${esc(sp.title)}</span>` : ""}</div>
    ${reason ? `<p class="small muted" style="margin:6px 0 0">${esc(reason)}: no activity this week.</p>` : `
    <dl class="act-facts small">
      ${pw.some((x) => x.objective) ? `<dt>Objective</dt><dd data-notr>${pw.map((x) => `${pw.length > 1 ? `<b>S${x.n}</b> ` : ""}${esc(x.objective || "—")}`).join("<br>")}</dd>` : ""}
      ${comps.length ? `<dt>Competencies</dt><dd>${comps.map((c) => compChip(c, /^T|^CT/i.test(c) ? "soft" : "")).join(" ")}</dd>` : ""}
      ${tech.length ? `<dt>Technologies</dt><dd>${tech.map((t) => `<span class="tag">${esc(t)}</span>`).join(" ")}</dd>` : ""}
      <dt>Code</dt><dd>${esc([...new Set(pw.map((x) => x.stack))].join(", "))}</dd>
      ${w.off.length ? `<dt>No activity</dt><dd>${w.off.map((d) => `<span class="act-off k-${esc(d.kind)}">${esc(actDate(d.day))} · <span data-notr>${esc(d.label)}</span></span>`).join("<br>")}</dd>` : ""}
      <dt>Out of scope</dt><dd>${w.next ? `S${w.next.n} of the programme (from ${esc(actDate(w.next.start, { day: "numeric", month: "short" }))})` : "—"}</dd>
    </dl>
    ${pw.some((x) => x.concepts) ? `<details class="small act-concepts"><summary>Concepts &amp; exigences techniques</summary>${pw.map((x) => `<div>${pw.length > 1 ? `<b>S${x.n}</b>` : ""}<p data-notr>${esc(x.concepts)}</p></div>`).join("")}</details>` : ""}
    <div class="act-lc"><span class="small muted">Live coding 11:00</span>
      ${days.map((d) => { const on = live.includes(d), ok = w.work.includes(d); return `<button type="button" class="act-lcd" data-w="${w.monday}" data-lc="${d}" aria-pressed="${on}" ${ok ? "" : `disabled data-off="1"`} title="${esc(actDate(d))}">${ACT_WD[actDow(d)]}</button>`; }).join("")}</div>`}
    ${w.notes.length ? `<ul class="act-notes small" data-notr>${w.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
  </div>`;
}
async function actToggleLive(monday, day) {
  if (ACT.running) return;
  const cur = ACT.live[monday] || [];
  const next = cur.includes(day) ? cur.filter((x) => x !== day) : [...cur, day].sort();
  if (actItem("week", monday)) {
    // the week is already planned: the server keeps the list (and removes the live coding of a day turned off)
    if (cur.includes(day) && actItem("live", day) && !(await askConfirm("Remove this live coding?", `The live coding of ${actDate(day)} is deleted.`, "Remove"))) return;
    try { await api("/activities/live", { method: "PUT", body: { monday, live: next } }); } catch (e) { toast(e.message, true); return; }
    ACT.live[monday] = next;
    await actLoadSel();
    return;
  }
  ACT.live[monday] = next;
  actSummary();
  actResults();
}

// ================================================================ generating, one item at a time
const KIND_LABEL = { week: "Analyse de la semaine", veille: "Veille · 09:15 · 30 min", live: "Live coding · 11:00 · 45 min" };
const actKey = (kind, day) => `${kind}:${day}`;
function actButtons(on) {
  ["#ac-gen", "#ac-regen"].forEach((s) => { if ($(s)) $(s).disabled = on; });
  if ($("#ac-stop")) $("#ac-stop").hidden = !on;
  $$(".act-lcd, .act-card [data-a='regen'], .act-card [data-a='gen']").forEach((b) => (b.disabled = on || b.dataset.off === "1"));
}
/** One request; the AI's per-minute limit is waited out (the card counts down). */
async function actCall(path, body, key) {
  for (let i = 0; i < 4; i++) {
    if (ACT.stop) throw new Error("Stopped.");
    const r = await api(path, { method: "POST", body });
    if (!r.retryIn) return r;
    for (let s = r.retryIn; s > 0 && !ACT.stop; s--) { actJob(key, { state: "wait", text: `AI per-minute limit: trying again in ${s} s` }); await actSleep(1000); }
    actJob(key, { state: "work" });
  }
  throw new Error("The AI is still busy: try again in a minute.");
}
function actJob(key, job) {
  if (job) ACT.jobs[key] = job; else delete ACT.jobs[key];
  const el = document.querySelector(`.act-card[data-key="${key}"]`);
  if (el) el.outerHTML = actCard(...key.split(":"));
  actWire();
}
async function actGenerate(all) {
  if (ACT.running) return;
  const tasks = actTasks(all);
  if (!tasks.length) { toast("Everything is already written for this period."); return; }
  ACT.running = true; ACT.stop = false;
  tasks.forEach((t) => (ACT.jobs[actKey(t.kind, t.day)] = { state: "queue" }));
  actResults();
  actButtons(true);
  $("#ac-stop").onclick = () => { ACT.stop = true; $("#ac-prog").textContent = "Stopping after this item…"; };
  let done = 0, failed = 0;
  const skipWeek = new Set();
  for (const t of tasks) {
    const key = actKey(t.kind, t.day), monday = t.kind === "week" ? t.day : actMonday(t.day);
    if (ACT.stop) break;
    if (skipWeek.has(monday)) { actJob(key, { state: "error", text: "The week's plan failed: generate it first." }); failed++; continue; }
    if ($("#ac-prog")) $("#ac-prog").textContent = `${done + failed + 1} / ${tasks.length} · ${t.kind === "week" ? "the week's plan" : `${t.kind === "live" ? "live coding" : "veille"} of ${actDate(t.day)}`}`;
    actJob(key, { state: "work" });
    try {
      const r = t.kind === "week"
        ? await actCall("/activities/week", { monday: t.day, from: t.week.from, to: t.week.to, live: ACT.live[t.day] || [], keep: t.keep }, key)
        : await actCall("/activities/item", { day: t.day, kind: t.kind }, key);
      ACT.sel.items = [...ACT.sel.items.filter((i) => !(i.kind === r.item.kind && i.day === r.item.day)), r.item];
      actJob(key, null);
      done++;
    } catch (e) {
      if (e.message === CANCELLED) break;
      actJob(key, { state: "error", text: e.message });
      failed++;
      if (t.kind === "week") skipWeek.add(monday);
    }
  }
  // what wasn't started stays to do; the overviews now show the real titles
  for (const k of Object.keys(ACT.jobs)) if (ACT.jobs[k].state === "queue") delete ACT.jobs[k];
  ACT.running = false;
  const errors = Object.fromEntries(Object.entries(ACT.jobs).filter(([, j]) => j.state === "error"));
  await actLoadSel();
  ACT.jobs = errors;
  actResults();
  actLoadMonth();
  toast(ACT.stop ? `Stopped: ${done} written.` : failed ? `${done} written, ${failed} failed: retry them on their card.` : `${done} activit${done === 1 ? "y" : "ies"} written.`, !!failed && !ACT.stop);
  ACT.stop = false;
}
/** Write one item again (or for the first time). */
async function actOne(kind, day) {
  if (ACT.running) return;
  const it = actItem(kind, day);
  if (it?.edited && !(await askConfirm("Replace your edits?", "This item was changed by hand: regenerating writes it again from the programme.", "Regenerate"))) return;
  const w = ACT.sel.weeks.find((x) => x.monday === actMonday(day));
  const key = actKey(kind, day);
  ACT.running = true;
  actButtons(true);
  actJob(key, { state: "work" });
  try {
    const r = kind === "week"
      ? await actCall("/activities/week", { monday: day, from: w.from, to: w.to, live: ACT.live[day] || [], keep: true }, key)
      : await actCall("/activities/item", { day, kind }, key);
    delete ACT.jobs[key];
    ACT.running = false;
    await actLoadSel();
    toast(r.item.warnings.length ? `Written, with ${r.item.warnings.length} point${r.item.warnings.length > 1 ? "s" : ""} to check` : "Written");
  } catch (e) {
    ACT.running = false;
    actJob(key, { state: "error", text: e.message });
    actButtons(false);
  }
}

// ================================================================ Regenerate from the teacher's proposal
// quick requests added to the proposal (French: they go to the AI as they are)
const ACT_CHIPS = ["plus simple", "plus pratique", "un exemple concret", "ajouter un piège à montrer", "moins de théorie", "plus de code à taper"];
/** Step 1: the teacher's proposal (the last one is there again); step 2: the new version next to the current one. */
function actPropose(kind, day, text = null, st = null) {
  if (ACT.running) return;
  const it = actItem(kind, day), label = kind === "live" ? "live coding" : "veille";
  const S = st || { mode: it ? "new" : "same", theme: "" };
  openDialog(`Regenerate this ${label}`, `
    <p class="small muted" style="margin-top:0">${esc(actDate(day, { weekday: "long", day: "numeric", month: "long" }))} · ${esc(KIND_LABEL[kind])}</p>
    <div class="act-cur"><span class="small muted">Now</span><b data-notr>${esc(it?.title || "—")}</b></div>
    ${it ? `<div class="act-modes" role="radiogroup" aria-label="What to write">
      <button type="button" class="act-mode" data-mode="new" aria-pressed="${S.mode === "new"}"><b>🔀 A different ${label}</b><span>A new subject and a new title. Give your theme, or let the AI pick one.</span></button>
      <button type="button" class="act-mode" data-mode="same" aria-pressed="${S.mode === "same"}"><b>✍️ Same subject, rewritten</b><span>Keeps the title above and writes the content again.</span></button>
    </div>` : ""}
    <div id="ap-themebox" ${S.mode === "new" ? "" : "hidden"}><label for="ap-th">Your theme or title <span class="muted">(optional)</span></label>
    <input type="text" id="ap-th" maxlength="200" style="width:100%" value="${esc(S.theme)}" placeholder="e.g. les événements clavier, un mini quiz en JavaScript, la délégation d'événements…"></div>
    <label for="ap-t">Details <span class="muted">(optional)</span></label>
    <textarea id="ap-t" rows="5" maxlength="1500" placeholder="What it should contain: the notions, an example to use, a mistake to show, a level…">${esc(text ?? it?.proposal ?? "")}</textarea>
    <div class="act-chips" data-notr>${ACT_CHIPS.map((c) => `<button type="button" class="act-lcd act-chip" data-chip="${esc(c)}">+ ${esc(c)}</button>`).join("")}</div>
    <p class="small muted">The AI follows your proposal, within the template and the programme of the week (nothing from a later week). You see the new version before it replaces the current one.</p>
    <p class="small act-status" id="ap-st" role="status" hidden></p>`,
  [{ label: "Cancel", action: () => dlg.close() }, { label: "✨ Generate", primary: true, action: () => generate() }]);
  const ta = $("#ap-t", dlg), th = $("#ap-th", dlg);
  $$("[data-mode]", dlg).forEach((b) => b.onclick = () => {
    S.mode = b.dataset.mode;
    $$("[data-mode]", dlg).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $("#ap-themebox", dlg).hidden = S.mode !== "new";
    if (S.mode === "new") th.focus();
  });
  $$("[data-chip]", dlg).forEach((b) => b.onclick = () => {
    const v = ta.value.trim();
    ta.value = v ? `${v}${/[.,;:!?]$/.test(v) ? "" : ","} ${b.dataset.chip}` : b.dataset.chip.charAt(0).toUpperCase() + b.dataset.chip.slice(1);
    ta.focus();
  });
  (S.mode === "new" && th ? th : ta).focus();
  const generate = async () => {
    const proposal = ta.value.trim(), st = $("#ap-st", dlg);
    S.theme = th ? th.value.trim() : "";
    ta.disabled = true; st.hidden = false; st.classList.remove("wait"); st.textContent = "Writing…";
    try {
      // one call; the AI's per-minute limit is waited out here too
      for (let i = 0; i < 4; i++) {
        const r = await api("/activities/item", { method: "POST", body: { day, kind, proposal, preview: true, ...(it ? { mode: S.mode, theme: S.mode === "new" ? S.theme : "" } : {}) } });
        if (r.draft) return actCompare(kind, day, r.draft, proposal, S);
        st.classList.add("wait");
        for (let s = r.retryIn || 20; s > 0 && dlg.open; s--) { st.textContent = `AI per-minute limit: trying again in ${s} s`; await actSleep(1000); }
        if (!dlg.open) return;
        st.classList.remove("wait"); st.textContent = "Writing…";
      }
      throw new Error("The AI is still busy: try again in a minute.");
    } finally { if (ta.isConnected) { ta.disabled = false; st.hidden = true; } }
  };
}
function actCompare(kind, day, draft, proposal, st = null) {
  const it = actItem(kind, day), label = kind === "live" ? "live coding" : "veille";
  openDialog(`New ${label}: compare`, `
    ${draft.ecarte.length ? `<div class="notice warn small" style="margin-bottom:10px"><b>Left out of your proposal</b> (not in the programme yet at this point): <span data-notr>${draft.ecarte.map(esc).join(" · ")}</span></div>` : ""}
    ${draft.warnings.length ? `<details class="act-warn small" style="margin-bottom:10px"><summary>What doesn't follow the template yet</summary><ul data-notr>${draft.warnings.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="muted">Replace it and edit it by hand, or go back to your proposal.</p></details>` : ""}
    ${it?.edited ? `<p class="small late-wait" style="margin-top:0">The current version was edited by hand: Replace drops your edits.</p>` : ""}
    <div class="act-cmp">
      <div><span class="act-kind k-${kind}">New version</span><div class="act-md act-scroll" data-emoji data-notr>${actMd(draft.md)}</div></div>
      ${it ? `<div><span class="act-kind">Current version</span><div class="act-md act-scroll" data-emoji data-notr>${actMd(it.md)}</div></div>` : ""}
    </div>`,
  [{ label: "← My proposal", action: () => actPropose(kind, day, proposal, st) },
    { label: it ? "Keep the old one" : "Cancel", action: () => dlg.close() },
    { label: "Replace", primary: true, action: async () => {
      await api("/activities/item/keep", { method: "POST", body: { day, kind, data: draft.data, proposal, model: draft.model } });
      dlg.close();
      await actLoadSel();
      actLoadMonth();
      toast(draft.warnings.length ? `Replaced, with ${draft.warnings.length} point${draft.warnings.length > 1 ? "s" : ""} to check` : "Replaced");
    } }]);
  dlg.classList.add("wide");
}

// ================================================================ results: a Monday → Friday timeline per week
function actResults() {
  const box = $("#ac-out");
  if (!box) return;
  const weeks = (ACT.sel?.weeks || []).filter((w) => w.work.length);
  if (!ACT.sel || !weeks.length) { box.innerHTML = ""; return; }
  box.innerHTML = weeks.map((w) => {
    const days = Array.from({ length: 5 }, (_, i) => actAdd(w.monday, i)).filter((d) => d >= w.from && d <= w.to);
    const has = (ACT.sel.items || []).some((i) => i.day >= w.monday && i.day <= actAdd(w.monday, 4));
    return `<section class="panel act-week" style="--sp:${spColor(w.sprint?.n)}">
      <div class="panel-head"><h2>Week of ${esc(actDate(w.monday, { day: "numeric", month: "long" }))} ${w.weeks.map((x) => `<span class="tag">S${x.n}</span>`).join(" ")}</h2>
        ${has ? `<div class="toolbar" style="margin:0"><button class="btn small" data-wcopy="${w.monday}">📋 Copy all</button><button class="btn small" data-wdl="${w.monday}">${icon("download")} .md</button></div>` : ""}</div>
      ${actCard("week", w.monday)}
      <div class="act-days">${days.map((d) => {
        const info = ACT.sel.days.find((x) => x.day === d) || {};
        const work = info.kind === "work", live = (ACT.live[w.monday] || []).includes(d);
        return `<div class="act-day${work ? "" : " off"}">
          <div class="act-dl"><b>${ACT_WD[actDow(d)]}</b><span>${esc(actDate(d, { day: "numeric", month: "short" }))}</span>${w.closing.includes(d) ? `<span class="tag" title="Last day of the programme week: a lighter veille">end of week</span>` : ""}</div>
          <div class="act-cards">${work ? actCard("veille", d) + (live ? actCard("live", d) : "") : `<p class="small muted act-offtxt">${esc(info.label || ACT_KIND[info.kind] || "")}</p>`}</div></div>`;
      }).join("")}</div></section>`;
  }).join("");
  actWire();
}
/** Is the week's analysis unfolded? (one choice for all the weeks, kept in this browser) */
function actWeekOpen(set) {
  try { if (set !== undefined) localStorage.setItem("actWeekOpen", set ? "1" : "0"); return localStorage.getItem("actWeekOpen") === "1"; } catch { return !!set; }
}
function actCard(kind, day) {
  const key = actKey(kind, day), job = ACT.jobs[key], it = actItem(kind, day);
  const wk = actItem("week", kind === "week" ? day : actMonday(day));
  const planned = kind === "week" ? "" : (wk?.plan || []).find((j) => j.date === day)?.[kind === "live" ? "live" : "veille"] || "";
  const head = (title, extra = "") => `<header><span class="act-kind k-${kind}">${KIND_LABEL[kind]}</span><b class="act-t">${esc(title)}</b>${extra}</header>`;
  if (job && job.state !== "error") {
    const text = job.state === "queue" ? "Queued" : job.text || (kind === "week" ? "Planning the week…" : "Writing…");
    return `<article class="act-card loading" data-key="${key}">${head(planned || (it?.title ?? ""), `<span class="act-status${job.state === "wait" ? " wait" : ""}">${esc(text)}</span>`)}
      ${job.state === "queue" ? "" : `<div class="act-sk" aria-hidden="true"><i></i><i></i><i></i></div>`}</article>`;
  }
  if (!it) {
    const err = job?.state === "error" ? `<p class="act-err small">${esc(job.text)}</p>` : "";
    return `<article class="act-card missing" data-key="${key}">${head(planned || (kind === "week" ? "Not planned yet" : "Not written yet"),
      `<div class="act-btns"><button class="btn small" data-a="gen">✨ ${err ? "Retry" : "Generate"}</button></div>`)}${err}</article>`;
  }
  // the week's analysis folds (remembered in this browser); a veille or live coding opens with Preview
  const open = kind === "week" && actWeekOpen();
  const warn = it.warnings || [];
  return `<article class="act-card k-${kind}${warn.length ? " has-warn" : ""}" data-key="${key}" data-id="${it.id}">
    ${head(kind === "week" ? `Week of ${actDate(day, { day: "numeric", month: "short" })}` : it.title || "", `${kind === "week" ? `<button type="button" class="act-fold" data-a="toggle" aria-expanded="${open}" title="Show or hide the analysis">${open ? "▾" : "▸"} Analysis of the week</button>` : ""}
      <span class="act-tags">${it.edited ? `<span class="tag" title="Changed by hand">edited</span>` : ""}${warn.length ? `<span class="tag medium" title="${esc(warn.join(" · "))}">⚠️ ${warn.length} to check</span>` : ""}</span>
      <div class="act-btns">
        ${kind === "week" ? "" : `<button class="btn small" data-a="toggle" aria-expanded="${open}">${open ? "Hide" : "Preview"}</button>`}
        <button class="btn small" data-a="edit">✏️ Edit</button>
        <button class="btn small" data-a="regen" title="Write it again">✨ Regenerate</button>
        <button class="btn small" data-a="copy">📋 Copy</button>
      </div>`)}
    ${job?.state === "error" ? `<p class="act-err small">${esc(job.text)}</p>` : ""}
    ${warn.length ? `<details class="act-warn small"><summary>What doesn't follow the template yet</summary><ul>${warn.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="muted">Edit it by hand, or regenerate it.</p></details>` : ""}
    <div class="act-body"${open ? "" : " hidden"}><div class="act-md" data-emoji data-notr>${actMd(it.md)}</div></div>
  </article>`;
}
function actWire() {
  $$("#ac-out .act-card").forEach((card) => {
    if (card.dataset.wired) return;
    card.dataset.wired = "1";
    const [kind, day] = card.dataset.key.split(":");
    $$("[data-a]", card).forEach((b) => b.onclick = () => {
      const it = actItem(kind, day), a = b.dataset.a;
      if (a === "regen" && kind !== "week") return actPropose(kind, day);
      if (a === "gen" || a === "regen") return actOne(kind, day);
      if (a === "copy") return copyText(it.md, `${kind === "week" ? "Overview" : kind === "live" ? "Live coding" : "Veille"} copied`);
      if (a === "toggle") {
        const body = $(".act-body", card), show = body.hidden;
        body.hidden = !show; b.setAttribute("aria-expanded", String(show));
        if (kind === "week") { b.textContent = `${show ? "▾" : "▸"} Analysis of the week`; actWeekOpen(show); }
        else b.textContent = show ? "Hide" : "Preview";
        return;
      }
      if (a === "edit") actEdit(card, it);
    });
  });
  $$("[data-wcopy]").forEach((b) => b.onclick = () => copyText(actWeekText(ACT.sel.weeks.find((w) => w.monday === b.dataset.wcopy)), "The whole week is copied"));
  $$("[data-wdl]").forEach((b) => b.onclick = () => saveBlob(new Blob([actWeekText(ACT.sel.weeks.find((w) => w.monday === b.dataset.wdl))], { type: "text/markdown;charset=utf-8" }), `activites-${b.dataset.wdl}.md`));
  if (ACT.running) actButtons(true);
}
function actEdit(card, it) {
  const body = $(".act-body", card);
  body.hidden = false;
  const titled = it.kind !== "week";
  body.innerHTML = `${titled ? `<label class="small" for="ae-t-${it.id}" style="margin-top:0">Title</label><input type="text" class="act-edit-t" id="ae-t-${it.id}" maxlength="140" value="${esc(it.title || "")}" data-notr>` : ""}
    <label class="small" for="ae-b-${it.id}">${titled ? "Content" : "Overview"}</label>
    <textarea class="act-edit" id="ae-b-${it.id}" spellcheck="true" aria-label="Markdown" data-notr>${esc(it.md)}</textarea>
    <div class="toolbar" style="margin:8px 0 0"><button class="btn small primary" data-e="save">Save</button><button class="btn small" data-e="cancel">Cancel</button><span class="small muted">Markdown, as it will be copied.${titled ? " The title follows in the heading, the week's overview and the next Regenerate." : ""}</span></div>`;
  const ta = $("textarea", body), ti = $(".act-edit-t", body);
  ta.style.height = Math.min(700, Math.max(260, ta.scrollHeight + 8)) + "px";
  (ti || ta).focus();
  $("[data-e='cancel']", body).onclick = () => { card.outerHTML = actCard(it.kind, it.day); actWire(); };
  $("[data-e='save']", body).onclick = (e) => busy(e.currentTarget, async () => {
    if (ti && !ti.value.trim()) { ti.focus(); throw new Error("Give it a title"); }
    const r = await api(`/activities/${it.id}`, { method: "PUT", body: { md: ta.value, ...(ti ? { title: ti.value } : {}) } });
    ACT.sel.items = ACT.sel.items.map((x) => (x.id === it.id ? r.item : x));
    if (ti && ti.value.trim() !== it.title) { await actLoadSel(); actLoadMonth(); toast("Saved"); return; }
    card.outerHTML = actCard(it.kind, it.day).replace("<div class=\"act-body\" hidden>", "<div class=\"act-body\">");
    actWire();
    toast("Saved");
  });
}
/** A week as one markdown document: the overview, then each day (veille, then live coding). */
function actWeekText(w) {
  if (!w) return "";
  const days = Array.from({ length: 5 }, (_, i) => actAdd(w.monday, i));
  return [actItem("week", w.monday), ...days.flatMap((d) => [actItem("veille", d), actItem("live", d)])].filter(Boolean).map((i) => i.md).join("\n\n---\n\n");
}

// ================================================================ markdown → HTML (the template's subset)
function actInline(s) {
  return String(s).split(/(`[^`]+`)/).map((part) => {
    if (/^`[^`]+`$/.test(part)) return `<code>${esc(part.slice(1, -1))}</code>`;
    return esc(part)
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<i>$2</i>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`)
      .replace(/(^|[\s(])(https:\/\/[^\s<)]+)/g, (_, p, u) => `${p}<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  }).join("");
}
function actMd(md) {
  const L = String(md || "").replace(/\r/g, "").split("\n"), out = [];
  const cells = (row) => row.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
  for (let i = 0; i < L.length;) {
    const l = L[i];
    let m;
    if ((m = l.match(/^```(\S*)/))) {
      const code = [];
      for (i++; i < L.length && !/^```\s*$/.test(L[i]); i++) code.push(L[i]);
      i++;
      out.push(`<pre class="act-code"${m[1] ? ` data-lang="${esc(m[1])}"` : ""}><code>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { const n = Math.min(5, m[1].length + 1); out.push(`<h${n}>${actInline(m[2])}</h${n}>`); i++; continue; }
    if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{3,}/.test(L[i + 1] || "")) {
      const head = cells(l), rows = [];
      for (i += 2; i < L.length && /^\s*\|/.test(L[i]); i++) rows.push(cells(L[i]));
      out.push(`<div class="act-tw"><table><thead><tr>${head.map((c) => `<th>${actInline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${actInline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^\s*[-*] /.test(l)) {
      const items = [];
      for (; i < L.length && /^\s*[-*] /.test(L[i]); i++) items.push(`<li>${actInline(L[i].replace(/^\s*[-*] /, ""))}</li>`);
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^\s*---+\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const para = [];
    for (; i < L.length && L[i].trim() && !/^(```|#{1,4}\s|\s*[-*] |\s*\||\s*---+\s*$)/.test(L[i]); i++) para.push(actInline(L[i]));
    out.push(`<p>${para.join("<br>")}</p>`);
  }
  return out.join("");
}

Object.assign(routes, { activities: viewActivities });
