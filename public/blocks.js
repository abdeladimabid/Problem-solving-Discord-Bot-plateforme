// 🚫 Practice blocks: stop one student from practicing a type of challenge (some levels, for some days, with a reason).
//   blockPanel(id, name)  the panel on a student's page (Challenges tab)
//   #/blocks              every blocked student of the class, and blocking someone from there
// /practice, 🎯 Picked for me and "Train a skill" never give them a blocked challenge; what you hand out
// (daily challenge, assignments, sessions, plans) still reaches them. In Discord: /teacher block · /teacher unblock.
/* global $, $$, api, esc, view, toast, busy, avatar, routes, loadStudents, fmtDate */

const BLK_TYPES = [
  ["bug", "🐞", "Find the bug"], ["output", "🖥️", "Predict the output"], ["mcq", "☑️", "Multiple choice"], ["complexity", "📈", "Complexity"],
  ["write", "💻", "Write code"], ["sql", "🗄️", "SQL query"], ["regex", "🔤", "Regular expression"], ["git", "🌿", "Git question"], ["coding", "🏆", "HackerRank problem"],
];
const BLK_LEVELS = [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]];
const BLK_DAYS = [[1, "1 day"], [3, "3 days"], [7, "1 week"], [14, "2 weeks"], [30, "1 month"], [0, "Until I lift it"]];
const blkType = (k) => BLK_TYPES.find((x) => x[0] === k) || [k, "🧩", k];

function blkUntil(b) {
  if (!b.until) return "until you lift it";
  const days = Math.ceil((b.until * 1000 - Date.now()) / 86400000);
  return `until ${fmtDate(b.until)}${days > 0 ? ` · ${days} day${days > 1 ? "s" : ""} left` : ""}`;
}
function blkItem(b, uid) {
  const [, icon, name] = blkType(b.type);
  return `<li class="blk-item"><span class="blk-ic">${icon}</span><div class="blk-body">
      <div><b>${esc(name)}</b> ${b.levels.length ? b.levels.map((l) => `<span class="blk-lv ${l}">${esc(l)}</span>`).join("") : `<span class="blk-lv all">every level</span>`}</div>
      <div class="small muted">${esc(blkUntil(b))}${b.reason ? ` · “${esc(b.reason)}”` : ""}</div></div>
    <button class="btn small" data-blk-lift="${esc(b.type)}" data-blk-uid="${esc(uid)}" title="They can practice it again">Lift</button></li>`;
}

/** The form: type, levels, how long, why, DM. `pick` adds a student picker (the class page). */
function blkForm(pick) {
  return `<div class="blk-form">
    ${pick ? `<label for="blk-who">Student</label><select id="blk-who"><option value="">Choose a student…</option>${pick.map((s) => `<option value="${esc(s.discord_id)}">${esc(s.name || s.discord_id)}</option>`).join("")}</select>` : ""}
    <label>Type of challenge</label>
    <div class="blk-types" role="radiogroup">${BLK_TYPES.map(([k, ic, n], i) => `<label class="blk-type"><input type="radio" name="blk-type" value="${k}" ${i === 0 ? "checked" : ""}><span>${ic} ${esc(n)}</span></label>`).join("")}</div>
    <div class="blk-row">
      <div><label>Levels <span class="muted small">(none ticked = every level)</span></label>
        <div class="blk-levels">${BLK_LEVELS.map(([k, n]) => `<label class="blk-lvl ${k}"><input type="checkbox" value="${k}"><span>${n}</span></label>`).join("")}</div></div>
      <div><label for="blk-days">For</label><select id="blk-days">${BLK_DAYS.map(([d, n]) => `<option value="${d}" ${d === 7 ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    </div>
    <label for="blk-why">Why <span class="muted small">(the student reads it)</span></label>
    <input type="text" id="blk-why" maxlength="300" placeholder="e.g. Too many hard bugs in a row: work on your brief first, then come back to it">
    <div class="blk-foot"><label class="check"><input type="checkbox" id="blk-dm" checked> Tell them by Discord DM</label><button class="btn danger" id="blk-go">🚫 Block</button></div>
  </div>`;
}
function blkRead() {
  return {
    type: ($("input[name=blk-type]:checked") || {}).value,
    levels: $$(".blk-levels input:checked").map((x) => x.value),
    days: Number($("#blk-days").value), reason: $("#blk-why").value.trim(), notify: $("#blk-dm").checked,
  };
}
async function blkLift(uid, type, done) {
  await api(`/students/${encodeURIComponent(uid)}/blocks?type=${encodeURIComponent(type)}`, { method: "DELETE", confirmed: true });
  toast(`${blkType(type)[2]} is open again`);
  done();
}
function blkSaved(r) { toast(r.dm === false ? "Blocked · Discord refused the DM (they block DMs)" : r.dm ? "Blocked · they got a DM" : "Blocked"); }

// ------------------------------------------------------------------ a student's page
/** Fills `el` with the student's blocks and the form. */
async function blockPanel(el, id, name) {
  const { blocks } = await api(`/students/${encodeURIComponent(id)}/blocks`);
  el.innerHTML = `<section class="panel blk-panel"><div class="panel-head"><h2>🚫 Practice blocks ${blocks.length ? `<span class="pill">${blocks.length}</span>` : ""}</h2>
      <button class="btn small ${blocks.length ? "" : "primary"}" id="blk-open" aria-expanded="false">${blocks.length ? "Block another type" : "Block a type"}</button></div>
    <p class="small muted" style="margin-top:-6px">${esc(name || "This student")} won't get these in <code>/practice</code>, 🎯 Picked for me or Train a skill. What you hand out (daily challenge, assignments, sessions, plans) still reaches them.</p>
    ${blocks.length ? `<ul class="blk-list">${blocks.map((b) => blkItem(b, id)).join("")}</ul>` : `<p class="empty small">Nothing blocked: every type is open.</p>`}
    <div id="blk-form-wrap" hidden>${blkForm(null)}</div></section>`;
  const again = () => blockPanel(el, id, name);
  // the chip at the top of the page follows
  const chip = $(".blk-chip");
  if (chip && !blocks.length) chip.remove();
  else if (chip) chip.textContent = `🚫 ${blocks.length} practice block${blocks.length > 1 ? "s" : ""}`;
  $("#blk-open", el).onclick = (e) => { const w = $("#blk-form-wrap", el); w.hidden = !w.hidden; e.currentTarget.setAttribute("aria-expanded", String(!w.hidden)); if (!w.hidden) $("#blk-why", el).focus(); };
  $$("[data-blk-lift]", el).forEach((b) => b.onclick = () => busy(b, () => blkLift(id, b.dataset.blkLift, again)));
  $("#blk-go", el).onclick = (e) => busy(e.currentTarget, async () => {
    const r = await api(`/students/${encodeURIComponent(id)}/blocks`, { method: "PUT", body: blkRead() });
    blkSaved(r); again();
  });
}

// ------------------------------------------------------------------ #/blocks
async function viewBlocks() {
  const [d, list] = await Promise.all([api("/practice-blocks"), loadStudents()]);
  const n = d.students.reduce((a, s) => a + s.blocks.length, 0);
  view.innerHTML = `<div class="page-head"><div><h1>🚫 Practice blocks</h1><p class="sub">Stop one student from practicing a type of challenge: e.g. someone farming hard “Find the bug” for points, or who should work on write-code before more multiple choice. They read your reason when they ask for it; every other type stays open. In Discord: <code>/teacher block</code> · <code>/teacher unblock</code>.</p></div></div>
    <div class="blk-two">
      <section class="panel"><div class="panel-head"><h2>Blocked now <span class="muted">${d.students.length} student${d.students.length === 1 ? "" : "s"} · ${n} block${n === 1 ? "" : "s"}</span></h2></div>
        ${d.students.length ? d.students.map((s) => `<div class="blk-stu"><a class="blk-who" href="#/student/${esc(s.uid)}?tab=challenges">${avatar(s.name, s.uid)} <b>${esc(s.name)}</b></a>
          <ul class="blk-list">${s.blocks.map((b) => blkItem(b, s.uid)).join("")}</ul></div>`).join("")
          : `<p class="empty">Nobody is blocked: every student can practice every type.</p>`}</section>
      <section class="panel"><div class="panel-head"><h2>Block a student</h2></div>${blkForm(list)}</section>
    </div>`;
  $$("[data-blk-lift]").forEach((b) => b.onclick = () => busy(b, () => blkLift(b.dataset.blkUid, b.dataset.blkLift, viewBlocks)));
  $("#blk-go").onclick = (e) => busy(e.currentTarget, async () => {
    const who = $("#blk-who").value;
    if (!who) { toast("Choose a student first", true); $("#blk-who").focus(); return; }
    const r = await api(`/students/${encodeURIComponent(who)}/blocks`, { method: "PUT", body: blkRead() });
    blkSaved(r); viewBlocks();
  });
}

Object.assign(routes, { blocks: viewBlocks });
