/* ClassBot dashboard: help queue, questions (FAQ), interviews, GitHub projects, classes & league, certificates.
   Loaded after app.js and uses its helpers (api, esc, table, openDialog, toast, …). */
"use strict";

Object.assign(ORIGIN, { interview: "Mock interview" });
Object.assign(REASON, { interview: "Mock interview", project: "GitHub project" });

// ------------------------------------------------------------ nav badges
async function refreshPills() {
  if (!S.g) return;
  try {
    const p = await api("/pills");
    const set = (id, n) => { const el = $(id); if (el) { el.hidden = !n; el.textContent = n; } };
    set("#pill-hands", p.hands);
    set("#pill-faq", p.faq);
    set("#pill-shop", p.shop);
    document.title = (p.hands ? `(${p.hands}) ` : "") + "ClassBot · Teacher dashboard";
  } catch { /* offline or signed out: ignore */ }
}
setInterval(refreshPills, 30000);
setTimeout(refreshPills, 1500);
window.addEventListener("hashchange", () => setTimeout(refreshPills, 300));

const waitText = (s) => (s < 60 ? `${Math.max(0, Math.round(s))} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`);

// ============================================================ help queue
let handsTimer = null;
async function viewHands(focusId, refresh = false) {
  clearTimeout(handsTimer);
  const d = await api("/hands");
  const now = Date.now() / 1000;
  view.innerHTML = `
    <div class="page-head"><div><h1>Help queue</h1><p class="sub">Students raise their hand with <code>/help-me</code>. Oldest first. This page refreshes by itself: keep it open during class.</p></div></div>
    <div class="figures">
      <div class="figure"><div class="ico">✋</div><b>${d.stats.waiting}</b><span>waiting</span></div>
      <div class="figure"><div class="ico">${icon("check")}</div><b>${d.stats.helped}</b><span>helped in the last 24 h</span></div>
      <div class="figure"><div class="ico">⏱️</div><b>${d.stats.avgWait == null ? "—" : waitText(d.stats.avgWait)}</b><span>average wait</span></div>
    </div>
    <div class="stack" style="margin-top:18px">
      ${d.open.length ? d.open.map((h, i) => `
        <section class="panel hand-card ${h.status === "helping" ? "helping" : ""}" id="hand-${h.id}">
          <div class="panel-head">
            <h2>${h.status === "helping" ? "🏃" : `#${d.open.filter((x) => x.status === "waiting").indexOf(h) + 1}`} <a href="#/student/${esc(h.discord_id)}">${esc(h.name || h.discord_id)}</a></h2>
            <span class="small ${now - h.created_at > 600 ? "late-wait" : "muted"}">${h.status === "helping" ? "being helped · " : ""}waiting ${waitText(now - h.created_at)}</span>
          </div>
          <p class="hand-q">${esc(h.question)}</p>
          ${h.title ? `<p class="small muted">Working on: <a href="#/challenges/${h.challenge_id}">${esc(h.title)}</a> (${esc(KIND[h.kind] || h.kind || "")})</p>` : ""}
          ${h.code ? `<pre class="code-view">${esc(h.code)}</pre>` : ""}
          <p class="toolbar" style="margin:10px 0 0">
            ${h.status === "waiting" ? `<button class="btn primary small" data-take="${h.id}">🏃 I'm coming</button>` : `<button class="btn small" data-requeue="${h.id}">Back to the queue</button>`}
            <button class="btn small" data-reply="${h.id}">✍️ Answer by DM</button>
            <button class="btn small" data-done="${h.id}">${icon("check")} Done</button>
          </p>
        </section>`).join("") : `<section class="panel"><p class="empty">Nobody is waiting. 🎉 Students use <code>/help-me</code> to raise their hand.</p></section>`}
      ${d.done.length ? `<section class="panel"><h2>Last 24 hours</h2>${table([
        { label: "Student", html: (h) => `<a href="#/student/${esc(h.discord_id)}">${esc(h.name || h.discord_id)}</a>` },
        { label: "Question", html: (h) => `<span class="small">${esc(h.question.slice(0, 120))}</span>` },
        { label: "Result", html: (h) => (h.status === "cancelled" ? status("expired", "Cancelled") : h.reply ? status("done", "Answered by DM") : status("done", "Helped")) },
        { label: "Waited", html: (h) => `<span class="small">${h.taken_at ? waitText(h.taken_at - h.created_at) : "—"}</span>` },
        { label: "", html: (h) => (h.reply ? `<details class="small"><summary>Your answer</summary>${esc(h.reply)}</details>` : "") },
      ], d.done)}</section>` : ""}
    </div>`;
  const act = (id, body, msg) => api(`/hands/${id}`, { method: "PUT", body }).then(() => { if (msg) toast(msg); refreshPills(); viewHands(); }).catch((e) => toast(e.message, true));
  $$("[data-take]").forEach((b) => b.onclick = () => { b.disabled = true; act(b.dataset.take, { action: "take" }, "The student was told you're coming"); });
  $$("[data-requeue]").forEach((b) => b.onclick = () => act(b.dataset.requeue, { action: "requeue" }));
  $$("[data-done]").forEach((b) => b.onclick = () => act(b.dataset.done, { action: "done" }));
  $$("[data-reply]").forEach((b) => b.onclick = () => {
    const h = d.open.find((x) => String(x.id) === b.dataset.reply);
    openDialog(`Answer ${h.name || "the student"}`, `<p class="small muted">${esc(h.question)}</p><label for="hr-t">Your answer (sent by DM, closes the request)</label><textarea id="hr-t" maxlength="1800" style="min-height:140px"></textarea>`,
      [{ label: "Send", primary: true, action: async () => { const v = $("#hr-t", dlg).value.trim(); if (!v) throw new Error("Write an answer"); await api(`/hands/${h.id}`, { method: "PUT", body: { action: "reply", reply: v } }); dlg.close(); toast("Answer sent"); refreshPills(); viewHands(); } }]);
    setTimeout(() => $("#hr-t", dlg)?.focus(), 50);
  });
  if (focusId) {
    const card = $(`#hand-${CSS.escape(String(focusId))}`);
    if (card) { card.classList.add("flash"); if (!refresh) card.scrollIntoView({ behavior: "smooth", block: "center" }); }
    else if (!refresh && d.done.some((h) => String(h.id) === String(focusId))) toast("This request is already closed (see the last 24 hours below)");
  }
  handsTimer = setTimeout(() => { if (location.hash.startsWith("#/hands") && !dlg.open) viewHands(location.hash.split("/")[2], true).catch(() => {}); }, 5000);
}

// ======================================================== questions/FAQ
async function viewQuestions(focusId) {
  const d = await api("/faq");
  const pending = d.items.filter((f) => f.status === "pending");
  const approved = d.items.filter((f) => f.status === "approved");
  const rejected = d.items.filter((f) => f.status === "rejected");
  view.innerHTML = `
    <div class="page-head"><div><h1>Questions</h1><p class="sub">Students ask with <code>/ask</code>. The bot looks in your FAQ first; new questions get an AI draft that you check. Approving DMs everyone who asked and adds it to <code>/faq</code>.</p></div>
      <div class="toolbar" style="margin:0"><button class="btn primary" id="faq-new">${icon("plus")} Add an FAQ entry</button></div></div>
    <div class="stack">
      <section class="panel"><div class="panel-head"><h2>Waiting for you (${pending.length})</h2></div>
        ${pending.length ? `<div class="stack">${pending.map((f) => `
          <div class="faq-card" data-id="${f.id}">
            <p><b>${esc(f.question)}</b> <span class="muted small">· asked by ${f.askers.length} student${f.askers.length === 1 ? "" : "s"} · ${fmtAgo(f.created_at)}</span></p>
            <label class="small" for="fa-${f.id}">Answer ${f.draft ? `<span class="tag lang">AI draft: check it</span>` : ""}</label>
            <textarea id="fa-${f.id}" maxlength="3500" style="min-height:120px" placeholder="Write the answer (Markdown works)…">${esc(f.draft || "")}</textarea>
            <p class="toolbar" style="margin:8px 0 0">
              <button class="btn primary small" data-approve="${f.id}">${icon("check")} Approve & send</button>
              <button class="btn small" data-announce="${f.id}">Approve & post in #arena</button>
              ${f.draft ? `<button class="btn small" data-draft="${f.id}">New AI draft</button>` : `<button class="btn small" data-draft="${f.id}">${icon("spark")} AI draft</button>`}
              <button class="btn small danger" data-reject="${f.id}" title="The text above is sent as a note">Reject</button>
            </p>
          </div>`).join("")}</div>` : `<p class="empty">No question waiting. 🎉</p>`}
      </section>
      <section class="panel"><h2>Class FAQ (${approved.length})</h2>
        ${table([
          { label: "Question", html: (f) => `<b>${esc(f.question)}</b><div class="small muted">${esc((f.answer || "").slice(0, 140))}${(f.answer || "").length > 140 ? "…" : ""}</div>` },
          { label: "Helped", sort: "hits", num: true, html: (f) => `${f.hits}` },
          { label: "Asked by", num: true, html: (f) => `${f.askers.length || "you"}` },
          { label: "Answered", sort: "answered_at", html: (f) => `<span class="small">${fmtDate(f.answered_at)}</span>` },
          { label: "", html: (f) => `<button class="btn small" data-edit="${f.id}">Edit</button> <button class="btn small danger" data-del="${f.id}">Delete</button>` },
        ], approved, { empty: "Approved answers appear here. Add your own entries too (exam dates, rules, setup instructions…)." })}
      </section>
      ${rejected.length ? `<section class="panel"><details><summary><b>Rejected (${rejected.length})</b></summary>${table([
        { label: "Question", html: (f) => esc(f.question) },
        { label: "Your note", html: (f) => `<span class="small">${esc(f.answer || "—")}</span>` },
        { label: "", html: (f) => `<button class="btn small danger" data-del="${f.id}">Delete</button>` },
      ], rejected)}</details></section>` : ""}
    </div>`;
  const reload = (msg) => { if (msg) toast(msg); refreshPills(); viewQuestions(); };
  const send = (id, body, msg) => api(`/faq/${id}`, { method: "PUT", body }).then(() => reload(msg)).catch((e) => toast(e.message, true));
  const text = (id) => $(`#fa-${id}`).value.trim();
  $$("[data-approve]").forEach((b) => b.onclick = () => { b.disabled = true; send(b.dataset.approve, { answer: text(b.dataset.approve), status: "approved" }, "Answer sent and added to the FAQ"); });
  $$("[data-announce]").forEach((b) => b.onclick = () => { b.disabled = true; send(b.dataset.announce, { answer: text(b.dataset.announce), status: "approved", announce: true }, "Answer sent and posted in #arena"); });
  $$("[data-reject]").forEach((b) => b.onclick = () => confirmDialog("Reject this question?", text(b.dataset.reject) ? "The students get the text in the box as a note." : "Nobody is notified (write a note in the box to tell them why).", "Reject",
    () => send(b.dataset.reject, { answer: text(b.dataset.reject), status: "rejected" }, "Rejected"), true));
  $$("[data-draft]").forEach((b) => b.onclick = () => busy(b, async () => { await api(`/faq/${b.dataset.draft}/draft`, { method: "POST", body: {} }); reload("Draft ready: check it"); }));
  $$("[data-del]").forEach((b) => b.onclick = () => confirmDialog("Delete this entry?", "It disappears from /faq.", "Delete", async () => { await api(`/faq/${b.dataset.del}`, { method: "DELETE" }); reload("Deleted"); }, true));
  const edit = (f) => openDialog(f ? "Edit FAQ entry" : "New FAQ entry", `
      <label for="fe-q">Question</label><input type="text" id="fe-q" style="width:100%" maxlength="600" value="${esc(f?.question || "")}">
      <label for="fe-a">Answer</label><textarea id="fe-a" maxlength="3500" style="min-height:160px">${esc(f?.answer || "")}</textarea>`,
    [{ label: "Save", primary: true, action: async () => {
      const body = { question: $("#fe-q", dlg).value, answer: $("#fe-a", dlg).value, status: "approved" };
      if (f) await api(`/faq/${f.id}`, { method: "PUT", body }); else await api("/faq", { method: "POST", body });
      dlg.close(); reload("Saved");
    } }]);
  $$("[data-edit]").forEach((b) => b.onclick = () => edit(d.items.find((x) => String(x.id) === b.dataset.edit)));
  $("#faq-new").onclick = () => edit(null);
  if (focusId) {
    const card = $(`.faq-card[data-id="${CSS.escape(String(focusId))}"]`);
    if (card) { card.classList.add("flash"); card.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => $(`#fa-${CSS.escape(String(focusId))}`)?.focus({ preventScroll: true }), 500); }
    else toast("This question was already answered (see the class FAQ)");
  }
}

// ============================================================ interviews
async function viewInterviews() {
  const d = await api("/interviews");
  const done = d.items.filter((x) => x.scores);
  const avg = (k) => (done.length ? (done.reduce((s, x) => s + x.scores[k], 0) / done.length).toFixed(1) : "—");
  view.innerHTML = `
    <div class="page-head"><div><h1>Mock interviews</h1><p class="sub">Students practice with <code>/interview</code>: they explain their approach, edge cases and complexity to an interviewer, write the code, and get a scorecard (+5 pts once a day).</p></div></div>
    <div class="figures">
      <div class="figure"><div class="ico">🎤</div><b>${d.items.length}</b><span>interviews</span></div>
      <div class="figure"><div class="ico">🧩</div><b>${avg("problem")}</b><span>avg problem solving /5</span></div>
      <div class="figure"><div class="ico">💬</div><b>${avg("communication")}</b><span>avg communication /5</span></div>
      <div class="figure"><div class="ico">📈</div><b>${avg("complexity")}</b><span>avg complexity /5</span></div>
    </div>
    <section class="panel" style="margin-top:18px">${table([
      { label: "Student", sort: "name", html: (x) => `<a href="#/student/${esc(x.discord_id)}">${esc(x.name || x.discord_id)}</a>` },
      { label: "Problem", html: (x) => `${esc(x.title)} ${diffTag(x.difficulty)}` },
      { label: "Code", html: (x) => (x.code_status === "solved" ? status("solved", "Passed") : status("expired", "Not solved")) },
      { label: "Score", num: true, html: (x) => (x.scores ? `<b>${x.scores.overall}</b>/5` : "—") },
      { label: "Verdict", html: (x) => (x.scores ? esc(x.scores.verdict) : status("active", "In progress")) },
      { label: "Date", sort: "created_at", html: (x) => `<span class="small">${fmtDateTime(x.created_at)}</span>` },
    ], d.items, { empty: "No interview yet.", onRow: (x) => interviewDialog(x) })}</section>`;
}

function interviewDialog(x) {
  const s = x.scores;
  const bar = (k, label) => `<div class="iv-score"><span>${label}</span><span class="stars" aria-label="${s[k]} out of 5">${"★".repeat(s[k])}${"☆".repeat(5 - s[k])}</span></div>`;
  openDialog(`${x.name || x.discord_id} · interview on “${x.title}”`, `
    ${s ? `<div class="iv-card"><p><b>${esc(s.verdict)}</b> · ${s.overall}/5 ${s.ai ? '<span class="tag lang">AI interviewer</span>' : '<span class="tag">scored from tests</span>'}</p>
      ${bar("problem", "Problem solving")}${bar("communication", "Communication")}${bar("code", "Working code")}${bar("complexity", "Complexity")}
      <p class="small">💪 ${esc(s.strengths)}<br>🎯 ${esc(s.improve)}</p></div>` : ""}
    <h3 class="small">Transcript</h3>
    <div class="transcript">${x.transcript.map((t) => `<p class="${t.who === "ai" ? "ai" : "me"}"><b>${t.who === "ai" ? "🎤 Interviewer" : "🧑‍🎓 " + esc(x.name || "Student")}</b><br>${esc(t.text)}</p>`).join("")}</div>`);
  dlg.classList.add("wide");
}

// ============================================================== projects
const PROJECT_LANGS = ["python", "javascript", "php", "java", "c", "cpp"];
const EXT = { python: "py", javascript: "js", php: "php", java: "java", c: "c", cpp: "cpp" };

async function viewProjects() {
  const d = await api("/projects");
  view.innerHTML = `
    <div class="page-head"><div><h1>GitHub projects</h1><p class="sub">Students link a <b>public</b> GitHub repository with <code>/project submit</code>. The bot runs the file you name against your tests, re-checks after every push (within 15 minutes, or instantly with a webhook) and gives points for each test passed.</p></div>
      <div class="toolbar" style="margin:0"><button class="btn primary" id="pj-new">${icon("plus")} New project</button></div></div>
    <section class="panel">${table([
      { label: "Project", html: (p) => `<b>${esc(p.title)}</b><div class="small muted"><code>${esc(p.entry)}</code> · ${esc(LANG[p.lang] || p.lang)} · ${p.tests} tests</div>` },
      { label: "Status", html: (p) => status(p.status === "open" ? "active" : "expired", p.status === "open" ? "Open" : "Closed") },
      { label: "Repos linked", num: true, sort: "linked", html: (p) => `${p.linked}` },
      { label: "All tests pass", num: true, sort: "complete", html: (p) => `${p.complete}` },
      { label: "Points", num: true, html: (p) => `${p.points}` },
      { label: "Due", html: (p) => `<span class="small">${p.due_at ? fmtDateTime(p.due_at) : "no date"}</span>` },
    ], d.items, { empty: "No project yet. A project is a program students write in their own GitHub repository: you give the file name, the language and input/output tests.", onRow: (p) => (location.hash = `#/project/${p.id}`) })}</section>
    <section class="panel" style="margin-top:18px"><h2>Instant grading on push (optional)</h2>
      <p class="small">Students can add a webhook in their repository (Settings → Webhooks → Add webhook): Payload URL <code>${esc(d.hook)}</code>, content type <code>application/json</code>, “Just the push event”. Without it, the bot checks every repository by itself every 15 minutes (only files that changed are run).</p></section>`;
  $("#pj-new").onclick = () => projectDialog(null);
}

function projectDialog(p) {
  const local = (u) => { if (!u) return ""; const dt = new Date(u * 1000); dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset()); return dt.toISOString().slice(0, 16); };
  openDialog(p ? "Edit project" : "New project", `
    ${p ? "" : projectAiRow()}
    <label for="pj-t">Title</label><input type="text" id="pj-t" style="width:100%" maxlength="100" value="${esc(p?.title || "")}" placeholder="e.g. Grade calculator">
    <label for="pj-d">Instructions for students</label><textarea id="pj-d" maxlength="3000" placeholder="What the program must do, the input format, the output format…">${esc(p?.description || "")}</textarea>
    <div class="field-row">
      <div><label for="pj-l">Language</label><select id="pj-l">${PROJECT_LANGS.map((l) => `<option value="${l}" ${l === (p?.lang || (S.guild?.code_lang || "python").split(",")[0]) ? "selected" : ""}>${esc(LANG[l])}</option>`).join("")}</select></div>
      <div><label for="pj-e">File to run (path in the repo)</label><input type="text" id="pj-e" value="${esc(p?.entry || "")}" placeholder="main.py"></div>
    </div>
    <label for="pj-tests">Tests <span class="muted small">(input, a line <code>&gt;&gt;&gt;</code>, the expected output; separate tests with a line <code>---</code>; the first 2 are shown to students as examples)</span></label>
    <textarea id="pj-tests" class="code" style="min-height:200px" placeholder="1 2\n>>>\n3\n---\n10 -4\n>>>\n6">${esc(p?.testsText || "")}</textarea>
    <div class="field-row">
      <div><label for="pj-p">Points (all tests)</label><input type="number" id="pj-p" min="0" max="1000" value="${esc(p?.points ?? 50)}"></div>
      <div><label for="pj-tl">Time limit per test (s)</label><input type="number" id="pj-tl" min="0.5" max="10" step="0.5" value="${esc(p?.time_limit ?? 2)}"></div>
      <div><label for="pj-due">Due (optional)</label><input type="datetime-local" id="pj-due" value="${local(p?.due_at)}"></div>
    </div>
    ${p ? `<label class="check"><input type="checkbox" id="pj-closed" ${p.status === "closed" ? "checked" : ""}> Closed (students can't submit, no more checks)</label><p class="small muted">Saving re-grades every linked repository with the new tests.</p>`
        : `<label class="check"><input type="checkbox" id="pj-ann" checked> Announce it in #arena</label>`}
    <p class="small muted">The program reads the input on stdin and prints the answer, like write-code challenges. Spaces and line breaks in the output don't matter. After the due date, students still get feedback but points stop changing.</p>`,
  [{ label: p ? "Save" : "Create", primary: true, action: async () => {
    const due = $("#pj-due", dlg).value;
    const body = {
      title: $("#pj-t", dlg).value, description: $("#pj-d", dlg).value, lang: $("#pj-l", dlg).value, entry: $("#pj-e", dlg).value,
      testsText: $("#pj-tests", dlg).value, points: Number($("#pj-p", dlg).value), time_limit: Number($("#pj-tl", dlg).value),
      due_at: due ? Math.floor(new Date(due).getTime() / 1000) : null,
      ...(p ? { status: $("#pj-closed", dlg).checked ? "closed" : "open" } : { announce: $("#pj-ann", dlg).checked }),
    };
    const r = p ? await api(`/projects/${p.id}`, { method: "PUT", body }) : await api("/projects", { method: "POST", body });
    dlg.close();
    toast(p ? "Saved: repositories will be re-graded" : "Project created");
    if (p) viewProject(p.id); else location.hash = `#/project/${r.project.id}`;
  } }]);
  dlg.classList.add("wide");
  wireProjectAi();
  $("#pj-l", dlg).onchange = () => { const e = $("#pj-e", dlg); if (!e.value || /^main\.\w+$/.test(e.value)) e.value = `${$("#pj-l", dlg).value === "java" ? "Main" : "main"}.${EXT[$("#pj-l", dlg).value]}`; };
  if (!p) $("#pj-l", dlg).onchange();
}

async function viewProject(id) {
  const d = await api(`/projects/${id}`);
  const p = d.project;
  const full = d.repos.filter((r) => r.total && r.best === r.total).length;
  const VER = { accepted: "All pass", wrong: "Wrong output", tle: "Too slow", runtime: "Crashes", compile: "Doesn't compile" };
  view.innerHTML = `
    <div class="page-head"><div><p class="small"><a href="#/projects">← Projects</a></p><h1>${esc(p.title)}</h1>
      <p class="sub"><code>${esc(p.entry)}</code> · ${esc(LANG[p.lang] || p.lang)} · ${p.tests.length} tests · ${p.points} pts · ${p.due_at ? `due ${fmtDateTime(p.due_at)}` : "no due date"} · ${p.status === "open" ? status("active", "Open") : status("expired", "Closed")}</p></div>
      <div class="toolbar" style="margin:0"><button class="btn" id="pj-recheck">Re-check everyone</button><button class="btn" id="pj-edit">Edit</button><button class="btn danger" id="pj-del">Delete</button></div></div>
    <div class="figures">
      <div class="figure"><div class="ico">🔗</div><b>${d.repos.length}</b><span>repositories linked</span></div>
      <div class="figure"><div class="ico">${icon("check")}</div><b>${full}</b><span>pass every test</span></div>
      <div class="figure"><div class="ico">⚠️</div><b>${d.repos.filter((r) => r.error).length}</b><span>can't be read (private or missing file)</span></div>
    </div>
    <section class="panel" style="margin-top:18px">${table([
      { label: "Student", sort: "name", html: (r) => `<a href="#/student/${esc(r.discord_id)}">${esc(r.name || r.discord_id)}</a>` },
      { label: "Repository", html: (r) => `<a href="https://github.com/${esc(r.repo)}" target="_blank" rel="noopener noreferrer">${esc(r.repo)}</a>${r.branch !== "HEAD" ? ` <span class="tag">${esc(r.branch)}</span>` : ""}` },
      { label: "Best", sort: "best", num: true, html: (r) => `<b>${r.best}</b>/${r.total || p.tests.length}` },
      { label: "Last run", html: (r) => (r.error ? `<span class="status failed">${esc(r.error === "proj.err_missing" ? "File not found / private" : r.error === "proj.err_big" ? "File too big" : "GitHub error")}</span>` : r.result ? `<span class="status ${r.result.verdict === "accepted" ? "solved" : "failed"}">${esc(VER[r.result.verdict] || r.result.verdict)}</span> <span class="small muted">${r.passed}/${r.total}</span>` : "—") },
      { label: "Points", sort: "points", num: true, html: (r) => `${r.points}` },
      { label: "Checked", sort: "checked_at", html: (r) => `<span class="small">${fmtAgo(r.checked_at)} · ${r.runs} run${r.runs === 1 ? "" : "s"}</span>` },
      { label: "", html: (r) => `<button class="btn small" data-grade="${esc(r.discord_id)}">Grade now</button>` },
    ], d.repos, { empty: "No repository linked yet. Students use /project submit repo:<link>." })}</section>
    <section class="panel" style="margin-top:18px"><details><summary><b>Instructions & tests</b></summary>
      ${p.description ? `<p style="white-space:pre-wrap">${esc(p.description)}</p>` : ""}<pre class="code-view">${esc(p.testsText)}</pre></details></section>`;
  $$("[data-grade]").forEach((b) => b.onclick = () => busy(b, async () => { await api(`/projects/${id}/check`, { method: "POST", body: { discord_id: b.dataset.grade } }); toast("Graded"); viewProject(id); }));
  $("#pj-recheck").onclick = (e) => busy(e.currentTarget, async () => { await api(`/projects/${id}/check`, { method: "POST", body: {} }); toast("Every repository will be checked in the next minutes"); });
  $("#pj-edit").onclick = () => projectDialog(p);
  $("#pj-del").onclick = () => confirmDialog("Delete this project?", "Linked repositories are forgotten. Points already given stay.", "Delete", async () => { await api(`/projects/${id}`, { method: "DELETE" }); location.hash = "#/projects"; }, true);
}

// ================================================================ classes
async function viewClasses() {
  const [cmp, lg, certs] = await Promise.all([api("/compare"), api("/league"), api("/certificates")]);
  const max = Math.max(1, ...cmp.classes.map((c) => c.week.score));
  view.innerHTML = `
    <div class="page-head"><div><h1>Classes</h1><p class="sub">Every Discord server where the bot runs is a class. Compare your groups, join the class league, and hand out certificates.</p></div></div>
    <div class="stack">
      <section class="panel"><div class="panel-head"><h2>All your classes · this week</h2><span class="small muted">week of ${fmtDate(cmp.weekStart)}</span></div>
        ${table([
          { label: "Class", sort: "name", html: (c) => `<b>${esc(c.name || c.id)}</b>${c.id === S.g ? ' <span class="tag lang">open now</span>' : ""}${c.league.on ? ` <span class="tag">🏆 ${esc(c.league.name)}</span>` : ""}<div class="small muted">${esc(c.season)} · ${esc((c.code_lang || "").split(",").map((l) => LANG[l] || l).join(", "))}</div>` },
          { label: "Students", num: true, html: (c) => `${c.week.students}` },
          { label: "Active", num: true, html: (c) => `${c.week.active} <span class="small muted">(${c.week.participation}%)</span>` },
          { label: "Solved", num: true, html: (c) => `${c.week.solved} ${delta(c.week.solved, c.prev.solved)}` },
          { label: "Pts / student", num: true, html: (c) => `<b>${c.week.score}</b> ${delta(c.week.score, c.prev.score)}<div class="minibar"><span style="width:${Math.round((100 * c.week.score) / max)}%"></span></div>` },
          { label: "Accuracy (4 wk)", num: true, html: (c) => pct(c.accuracy) },
          { label: "Solved, 4 weeks", html: (c) => sparkline(c.trend) },
          { label: "", html: (c) => (c.id === S.g ? "" : `<button class="btn small" data-open="${esc(c.id)}">Open</button>`) },
        ], cmp.classes, { empty: "No class yet." })}
      </section>
      <div class="grid cols-2-even">
        <section class="panel"><h2>🏆 Class league</h2>
          <p class="small muted">Classes that join compete every week: points earned by students ÷ class size (at least 5), so small and big groups are on equal terms. Points you give by hand don't count. Each Monday the result is posted in #arena; students see it any time with <code>/league</code>.</p>
          <label class="check"><input type="checkbox" id="lg-on" ${lg.cfg.on ? "checked" : ""}> This class plays in the league</label>
          <label for="lg-name">Name shown in the league</label>
          <div class="toolbar"><input type="text" id="lg-name" maxlength="40" value="${esc(lg.cfg.name)}" style="flex:1"><button class="btn primary" id="lg-save">Save</button></div>
          ${lg.table.length ? `<ol class="league">${lg.table.map((r) => `<li class="${r.guild_id === S.g ? "me" : ""}"><b>${esc(r.name)}</b> <span>${r.score} pts/student · ${r.active}/${r.students} active</span></li>`).join("")}</ol>` : `<p class="empty">No class in the league yet.</p>`}
        </section>
        <section class="panel"><h2>🎓 Certificates</h2>
          <p class="small muted">A printable certificate (rank, points, solved challenges, badges, strong skills) for each student. When you start a new season, every student who scored gets theirs by DM.</p>
          <div class="toolbar"><select id="ct-season">${[...new Set([...certs.seasons, certs.current])].map((s) => `<option ${s === certs.season ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
            <button class="btn" id="ct-send">Send by DM now</button></div>
          <div class="cert-list">${certs.items.length ? certs.items.map((c) => `<a href="${esc(c.url)}" target="_blank" rel="noopener">#${c.rank} ${esc(c.name)} <span class="muted small">· ${c.points} pts</span></a>`).join("") : `<p class="empty">Nobody scored in this season yet.</p>`}</div>
        </section>
      </div>
    </div>`;
  $$("[data-open]").forEach((b) => b.onclick = () => { const sel = $("#guild"); sel.value = b.dataset.open; sel.onchange(); location.hash = "#/overview"; });
  $("#lg-save").onclick = (e) => busy(e.currentTarget, async () => { await api("/league", { method: "PUT", body: { on: $("#lg-on").checked, name: $("#lg-name").value } }); toast("League settings saved"); viewClasses(); });
  $("#ct-season").onchange = async () => { const d = await api(`/certificates?season=${encodeURIComponent($("#ct-season").value)}`); $(".cert-list").innerHTML = d.items.map((c) => `<a href="${esc(c.url)}" target="_blank" rel="noopener">#${c.rank} ${esc(c.name)} <span class="muted small">· ${c.points} pts</span></a>`).join("") || `<p class="empty">Nobody scored in this season.</p>`; };
  $("#ct-send").onclick = () => confirmDialog("Send the certificates now?", `Every student who scored in “${$("#ct-season").value}” gets their certificate link by DM.`, "Send", async () => { const r = await api("/certificates/send", { method: "POST", body: { season: $("#ct-season").value } }); toast(`${r.sent} certificate(s) sent`); });
}

Object.assign(routes, { hands: viewHands, questions: viewQuestions, interviews: viewInterviews, projects: viewProjects, project: viewProject, classes: viewClasses });

// ================================================== ✨ generate for a skill
const GEN_KINDS = { write: "Write code (judged by tests)", quick: "Quick (any type)", mcq: "Multiple choice", output: "Predict the output", bug: "Find the bug", complexity: "Complexity" };
const NO_AI_SKILLS = ["regex", "git"];
// code with React, Express, MongoDB or AI libraries can't run on the judge: multiple choice and find the bug only
const NO_RUN_SKILLS = ["node", "express", "mongodb", "react", "ai_data", "ai_ml", "ai_llm", "ai_rag", "web"];

/** Dialog: create 1 to 5 new challenges for a skill with the AI (each one checked before it's saved). */
function genForSkillDialog(skill, level = "medium", after = null) {
  const label = skillLabel(skill);
  if (NO_AI_SKILLS.includes(skill)) {
    openDialog(`Generate · ${label}`, `<p>Regex and Git challenges come from the verified bank: the AI can't check its own answers for them yet, so it doesn't write them.</p>`);
    return;
  }
  const isSql = skill === "sql" || skill.startsWith("sql_");
  const kinds = isSql ? { sql: "SQL query (run to check)" } : NO_RUN_SKILLS.includes(skill) ? { mcq: GEN_KINDS.mcq, bug: GEN_KINDS.bug } : GEN_KINDS;
  const lang = (S.guild?.code_lang || "python").split(",")[0];
  openDialog(`✨ New challenges · ${label}`, `
    <p class="muted small">The AI writes each challenge, then it is <b>checked before it's saved</b>: write-code problems must pass a reference solution vs. brute-force test on a real computer; for quick types the output is computed by running the code and multiple choice is re-solved independently. Each one takes up to a minute (write code: up to 2).</p>
    <div class="field-row">
      <div><label for="gs-level">Level</label><select id="gs-level">${Object.entries(DIFF).map(([k, v]) => `<option value="${k}" ${k === level ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div><label for="gs-kind">Type</label><select id="gs-kind">${Object.entries(kinds).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></div>
      <div><label for="gs-n">How many</label><select id="gs-n">${[1, 2, 3, 5].map((n) => `<option ${n === 2 ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    </div>
    ${isSql ? `<p class="small muted">SQL: the AI writes the schema, sample data, two hidden datasets and the reference query; the query is run on every dataset and the challenge is kept only if it works.</p>` : `<p class="small muted">Code in <b>${esc(LANG[lang] || lang)}</b>, the class's language.</p>`}
    <label for="gs-topic">Focus <span class="muted">(optional, e.g. ${isSql ? '"LEFT JOIN", "orders per customer"' : '"nested loops", "string reversal"'})</span></label><input type="text" id="gs-topic" style="width:100%" maxlength="120">
    <div id="gs-log" class="small" style="margin-top:10px"></div>`,
  [{ label: "Generate", primary: true, action: async () => {
    const n = Number($("#gs-n", dlg).value);
    const log = $("#gs-log", dlg);
    let made = 0, coverage = null;
    for (let i = 0; i < n; i++) {
      log.insertAdjacentHTML("beforeend", `<div id="gs-row-${i}">⏳ ${i + 1}/${n}: the AI is writing and checking…</div>`);
      try {
        const r = await api("/ai/challenge", { method: "POST", body: { skill, difficulty: $("#gs-level", dlg).value, kind: $("#gs-kind", dlg).value, code_lang: lang, topic: $("#gs-topic", dlg).value } });
        made++; coverage = r.coverage;
        $(`#gs-row-${i}`, dlg).innerHTML = `✅ ${i + 1}/${n}: <a href="#/challenges" data-cid="${r.challenge.id}">${esc(r.challenge.title)}</a> ${diffTag(r.challenge.difficulty)} <span class="muted">${esc(KIND[r.challenge.kind] || r.challenge.kind)}</span>`;
      } catch (e) {
        $(`#gs-row-${i}`, dlg).innerHTML = `⚠️ ${i + 1}/${n}: ${esc(e.message)}`;
        if (/budget|unreachable/i.test(e.message)) break;
      }
    }
    S.challenges = null;
    $$("[data-cid]", dlg).forEach((a) => a.onclick = (ev) => { ev.preventDefault(); dlg.close(); location.hash = "#/challenges"; setTimeout(() => editChallenge(Number(a.dataset.cid)), 400); });
    if (made) toast(`${made} new challenge${made > 1 ? "s" : ""} added to the bank`);
    if (after && coverage) after(coverage);
  } }]);
}

// ======================================================= path & lessons
async function viewPathPage() {
  const d = await api("/path");
  S.skillDefs = d.skills; S.pathDefaults = d.defaults;
  let steps = d.steps.map((x) => ({ ...x }));
  const lessons = { ...d.lessons };
  let cov = d.coverage || {};
  const langNames = d.track.family === "sql" ? "SQL" : d.langs.map((l) => LANG[l] || l).join(" + ");
  const skillOpt = (s, sel) => `<option value="${s.key}" ${s.key === sel ? "selected" : ""}>${esc(s.emoji + " " + s.en)}${s.fits ? "" : " (not in this track)"}</option>`;
  // lessons list: this track's roadmap first (in order), then the other skills of the track, then the rest
  const roadKeys = [...new Set(d.steps.map((x) => x.skill))];
  const byKey = Object.fromEntries(d.skills.map((s) => [s.key, s]));
  const lessonSkills = [
    ...roadKeys.map((k) => byKey[k]).filter(Boolean),
    ...d.skills.filter((s) => !roadKeys.includes(s.key) && s.fits),
    ...d.skills.filter((s) => !roadKeys.includes(s.key) && !s.fits),
  ];
  const lessonOpts = () => {
    const g = (label, arr) => arr.length ? `<optgroup label="${label}">${arr.map((s) => skillOpt(s)).join("")}</optgroup>` : "";
    return g("In this roadmap", lessonSkills.filter((s) => roadKeys.includes(s.key)))
      + g("Other skills of this track", lessonSkills.filter((s) => !roadKeys.includes(s.key) && s.fits))
      + g("Other tracks", lessonSkills.filter((s) => !roadKeys.includes(s.key) && !s.fits));
  };
  view.innerHTML = `
    <div class="page-head"><div><h1>Path &amp; lessons</h1><p class="sub">The step-by-step route students follow with <code>/path</code>. A step is done after enough solves of that skill at that level or harder. Each track has its own roadmap and lessons.</p>
      <label class="track-pick">This class learns <select id="p-track">${trackOptions(d.track.key)}</select></label></div>
      <div class="toolbar" style="margin:0">${d.custom ? `<button class="btn" id="p-reset">Back to the default path</button>` : ""}<button class="btn primary" id="p-save">Save</button></div></div>
    <div class="grid path-grid">
      <section class="panel"><h2>Steps</h2>
        <p class="muted small">The number in each row is how many challenges your bank has for that skill and level in this track. Under twice the solves needed, it's shown in orange: press ✨ to have the AI write more.</p>
        <div id="p-steps"></div><p><button class="btn small" id="p-add">${icon("plus")} Add a step</button></p></section>
      <section class="panel"><h2>Lessons</h2>
        <p class="muted small">Students open them with 📖 in <code>/path</code>. Empty = the built-in lesson below (written for this track, examples in ${esc(langNames)}). Markdown and \`\`\`code blocks\`\`\` work.</p>
        <label for="p-skill">Skill</label><select id="p-skill" style="width:100%">${lessonOpts()}</select>
        <div class="toolbar" style="margin:10px 0 0">
          <button class="btn small primary" id="p-ai">✨ Write with AI</button>
          <button class="btn small" id="p-copy">Edit the built-in lesson</button>
          <button class="btn small" id="p-clear">Use the built-in lesson</button>
          <span class="small muted" id="p-state"></span>
        </div>
        <label for="p-en">English</label><textarea id="p-en" class="code" style="min-height:190px"></textarea>
        <label for="p-fr">Français</label><textarea id="p-fr" class="code" style="min-height:190px"></textarea>
        <div class="panel-head" style="margin:16px 0 6px"><b class="small">What students see in Discord</b>
          <span class="toolbar" style="margin:0"><button class="btn small" data-pv="en" aria-pressed="true">English</button><button class="btn small" data-pv="fr" aria-pressed="false">Français</button></span></div>
        <div class="lesson-preview" id="p-preview"></div>
      </section>
    </div>`;
  const covOf = (st) => cov[`${st.skill}-${st.level}`] ?? 0;
  const drawSteps = () => {
    $("#p-steps").innerHTML = `<ol class="path-steps">${steps.map((st, i) => {
      const n = covOf(st), low = n < st.need * 2;
      return `<li>
      <select data-i="${i}" data-f="skill">${lessonSkills.map((s) => skillOpt(s, st.skill)).join("")}</select>
      <select data-i="${i}" data-f="level">${["easy", "medium", "hard"].map((l) => `<option value="${l}" ${l === st.level ? "selected" : ""}>${DIFF[l]}</option>`).join("")}</select>
      <input type="number" min="1" max="10" data-i="${i}" data-f="need" value="${st.need}" title="Solves needed">
      <span class="cov ${low ? "low" : ""}" title="${n} challenge(s) in your bank for this skill and level">${n}</span>
      <span class="toolbar" style="margin:0"><button class="icon-btn" data-gen="${i}" title="Generate challenges for this step with AI">✨</button><button class="icon-btn" data-up="${i}" title="Move up" ${i ? "" : "disabled"}>↑</button><button class="icon-btn" data-down="${i}" title="Move down" ${i < steps.length - 1 ? "" : "disabled"}>↓</button><button class="icon-btn" data-del="${i}" title="Remove">×</button></span>
    </li>`;
    }).join("")}</ol>`;
    $$("[data-f]").forEach((el) => el.onchange = () => { const st = steps[Number(el.dataset.i)]; st[el.dataset.f] = el.dataset.f === "need" ? Number(el.value) : el.value; drawSteps(); });
    $$("[data-up]").forEach((b) => b.onclick = () => { const i = Number(b.dataset.up); [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; drawSteps(); });
    $$("[data-down]").forEach((b) => b.onclick = () => { const i = Number(b.dataset.down); [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; drawSteps(); });
    $$("[data-del]").forEach((b) => b.onclick = () => { steps.splice(Number(b.dataset.del), 1); drawSteps(); });
    $$("[data-gen]").forEach((b) => b.onclick = () => { const st = steps[Number(b.dataset.gen)]; genForSkillDialog(st.skill, st.level, (c) => { cov = c; drawSteps(); }); });
  };
  let cur = $("#p-skill").value;
  let pvLang = "en";
  const preview = () => {
    const own = lessons[cur]?.[pvLang] || lessons[cur]?.[pvLang === "fr" ? "en" : "fr"];
    $("#p-preview").innerHTML = discordMarkdown(own || d.defaults.lessons[cur]?.[pvLang] || "");
  };
  $$("[data-pv]").forEach((b) => b.onclick = () => { pvLang = b.dataset.pv; $$("[data-pv]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); preview(); });
  const state = () => { $("#p-state").textContent = lessons[cur] ? "your own lesson" : "built-in lesson"; preview(); };
  const loadLesson = () => {
    cur = $("#p-skill").value;
    $("#p-en").value = lessons[cur]?.en ?? "";
    $("#p-fr").value = lessons[cur]?.fr ?? "";
    $("#p-en").placeholder = d.defaults.lessons[cur]?.en ?? "";
    $("#p-fr").placeholder = d.defaults.lessons[cur]?.fr ?? "";
    state();
  };
  const keepLesson = () => {
    const en = $("#p-en").value.trim(), fr = $("#p-fr").value.trim();
    if (en || fr) lessons[cur] = { en, fr }; else delete lessons[cur];
    state();
  };
  $("#p-skill").onchange = () => { keepLesson(); loadLesson(); };
  $("#p-en").oninput = $("#p-fr").oninput = keepLesson;
  $("#p-copy").onclick = () => { $("#p-en").value = d.defaults.lessons[cur]?.en ?? ""; $("#p-fr").value = d.defaults.lessons[cur]?.fr ?? ""; keepLesson(); };
  $("#p-clear").onclick = () => { $("#p-en").value = ""; $("#p-fr").value = ""; keepLesson(); };
  $("#p-ai").onclick = () => {
    openDialog(`✨ Lesson · ${skillLabel(cur)}`, `<p class="muted small">The AI writes a short lesson (idea, a tiny example in ${esc(langNames)}, one tip, links to read more) in English and French. It goes into the boxes: read it, change what you want, then <b>Save</b>.</p>
      <label for="ai-hint">Your wishes <span class="muted">(optional)</span></label><input type="text" id="ai-hint" style="width:100%" maxlength="400" placeholder="e.g. use a shopping-cart example, mention foreach">`,
    [{ label: "Write it", primary: true, action: async () => {
      const b = $("[data-b='0']", dlg);
      b.textContent = "Writing… (up to 1 min)";
      const r = await api("/path/lesson-ai", { method: "POST", body: { skill: cur, hint: $("#ai-hint", dlg).value } });
      $("#p-en").value = r.en; $("#p-fr").value = r.fr; keepLesson();
      dlg.close();
      toast("Lesson written: check it, then Save");
    } }]);
  };
  $("#p-track").onchange = (e) => busy(e.currentTarget, () => changeTrack(e.currentTarget.value, () => viewPathPage()));
  loadLesson();
  drawSteps();
  $("#p-add").onclick = () => { steps.push({ skill: "loops", level: "medium", need: 3 }); drawSteps(); };
  $("#p-save").onclick = (e) => busy(e.currentTarget, async () => { keepLesson(); await api("/path", { method: "PUT", body: { steps, lessons } }); toast("Path saved"); viewPathPage(); });
  if ($("#p-reset")) $("#p-reset").onclick = () => confirmDialog("Back to the default path?", "Your steps and lessons are replaced by the built-in ones. Students keep their progress.", "Reset", async () => { await api("/path", { method: "PUT", body: { reset: true } }); toast("Default path restored"); viewPathPage(); }, true);
}

// ====================================================== project with AI
function projectAiRow() {
  return `<div class="ai-row"><b class="small">✨ Let the AI draft it</b>
    <div class="toolbar" style="margin:6px 0 0"><input type="text" id="pj-idea" placeholder="Idea (optional), e.g. a library loan tracker" style="flex:1" maxlength="300">
    <select id="pj-adiff">${Object.entries(DIFF).map(([k, v]) => `<option value="${k}" ${k === "medium" ? "selected" : ""}>${v}</option>`).join("")}</select>
    <button type="button" class="btn small" id="pj-ai">Generate</button></div>
    <p class="muted small" style="margin:6px 0 0">The AI writes the instructions and test inputs; the expected outputs are computed by really running its reference solution.</p></div>`;
}
function wireProjectAi() {
  const b = $("#pj-ai", dlg);
  if (!b) return;
  b.onclick = () => busy(b, async () => {
    b.textContent = "Designing… (up to 1 min)";
    try {
      const r = await api("/projects/ai", { method: "POST", body: { idea: $("#pj-idea", dlg).value, difficulty: $("#pj-adiff", dlg).value, lang: $("#pj-l", dlg).value } });
      $("#pj-t", dlg).value = r.title;
      $("#pj-d", dlg).value = r.description;
      $("#pj-tests", dlg).value = r.testsText;
      toast(`Draft ready with ${r.tests} tests: check it, then Create`);
    } finally { b.textContent = "Generate"; }
  });
}

// ============================================================= overview
async function loadLive() {
  const el = $("#ov-live");
  if (!el) return;
  let d;
  try { d = await api("/overview/live"); } catch (e) { el.innerHTML = `<p class="muted small">${esc(e.message)}</p>`; return; }
  const now = Date.now() / 1000;
  const tile = (href, emoji, big, label, detail = "", hot = false) => `<a class="tile ${hot ? "hot" : ""}" href="${href}"><span class="tile-ico" aria-hidden="true">${emoji}</span><b>${big}</b><span class="tile-label">${label}</span>${detail ? `<span class="tile-detail">${detail}</span>` : ""}</a>`;
  const ev = d.events;
  const evBits = [ev.quiz ? `🎤 quiz “${esc(ev.quiz.title)}” ${ev.quiz.status === "live" ? "live" : "ready"}` : "", ...ev.bosses.map((b) => `👹 ${esc(b.name)}: ${b.left}/${b.hp} HP`), ev.bounties ? `💰 ${ev.bounties} bount${ev.bounties > 1 ? "ies" : "y"} open` : ""].filter(Boolean);
  const pr = d.projects;
  el.innerHTML = `<div class="panel-head"><h2>Live in your class</h2><span class="small muted">updates every time you open this page</span></div>
    <div class="live-grid">
      ${tile("#/hands", "✋", d.hands.waiting, "waiting for help", d.hands.waiting && d.hands.oldest ? `oldest: ${waitText(now - d.hands.oldest)}` : d.hands.helping ? `${d.hands.helping} being helped` : "students use /help-me", d.hands.waiting > 0)}
      ${tile("#/questions", "❓", d.questions, "questions to answer", d.questions ? "AI drafts are ready to check" : "students use /ask", d.questions > 0)}
      ${d.created ? tile("#/challenges", "🧩", d.created, "student challenges to review", "written with /create", true) : ""}
      ${d.sessions ? tile("#/sessions", "⏱️", d.sessions, "class session running", "watch the live grid", true) : ""}
      ${tile("#/events", "🎉", ev.bosses.length + ev.bounties + (ev.quiz ? 1 : 0), "events running", evBits.join("<br>") || "quiz, boss battle or bounty", evBits.length > 0)}
      ${tile("#/projects", "🐙", pr.open, `open project${pr.open === 1 ? "" : "s"}`, pr.open ? `${pr.complete}/${pr.linked} repos pass every test${pr.nextDue ? `<br>next due ${fmtDateTime(pr.nextDue.due_at)}` : ""}` : "GitHub repos graded on push")}
      ${tile("#/interviews", "🎤", d.interviews.n, "mock interviews this week", d.interviews.avg != null ? `average ${d.interviews.avg}/5` : "students use /interview")}
      ${tile("#/skills", "🗓️", `${d.plans.done}/${d.plans.made}`, "daily plans finished (7 days)", d.plans.people ? `${d.plans.people} student${d.plans.people > 1 ? "s" : ""} use /today` : "students use /today")}
      ${tile("#/events", "🙋", d.helped, "helpful peer explanations (7 days)", "classmates explaining mistakes")}
      ${tile("#/classes", "🏆", d.league ? (d.league.rank ? `#${d.league.rank}` : "—") : "—", d.league ? `in the league · ${esc(d.league.name)}` : "class league", d.league ? (d.league.rank ? `${d.league.score} pts/student · ${d.league.total} classes` : "no points yet this week") : "not joined yet: open to join")}
    </div>`;
}

Object.assign(routes, { path: viewPathPage });


/** A small Markdown renderer, close to what Discord shows (bold, italics, code, code blocks, links, lists). */
function discordMarkdown(md) {
  const blocks = [];
  let src = String(md || "").replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => { blocks.push(`<pre><code>${esc(code.replace(/\n$/, ""))}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
  src = esc(src)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  return src.split("\n").map((line) => {
    const m = line.match(/^\u0000(\d+)\u0000$/);
    if (m) return blocks[Number(m[1])];
    if (/^- /.test(line)) return `<p>• ${line.slice(2)}</p>`;
    return line.trim() ? `<p>${line}</p>` : "";
  }).join("").replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
}


// ===================================================== 🔔 notifications (Settings)
async function loadNotify(state) {
  const box = $("#s-notify");
  if (!box) return;
  let d = state;
  try { d = d || (await api("/notify")); } catch (e) { box.innerHTML = `<p class="notice">${esc(e.message)}</p>`; return; }
  const who = d.teacher
    ? `DMs go to <b>${esc(d.teacher.name)}</b> on Discord. To send them to someone else, that person runs <code>/teacher notify</code> in your server.`
    : `<span class="late-wait"><b>Nobody gets them yet.</b></span> In your Discord server, run <code>/teacher notify</code> yourself: the DMs will come to you (a test DM is sent right away).`;
  box.innerHTML = `
    <p class="muted small">When a student needs you, the bot sends you a private message on Discord with the question and a button that opens it here.</p>
    <p>${who}</p>
    <label class="check"><input type="checkbox" id="nt-hands" ${d.cfg.hands ? "checked" : ""}><span>✋ A student raises a hand (<code>/help-me</code>)</span></label>
    <label class="check"><input type="checkbox" id="nt-ask" ${d.cfg.ask ? "checked" : ""}><span>❓ A student asks a new question (<code>/ask</code>, when the FAQ doesn't already answer it)</span></label>
    <label class="check"><input type="checkbox" id="nt-shop" ${d.cfg.shop !== false ? "checked" : ""}><span>🎁 A student buys one of your own rewards in <code>/shop</code></span></label>
    ${d.dashboard ? "" : `<p class="small late-wait">DASHBOARD_URL isn't set for the bot, so the DMs won't have the "Answer in the dashboard" button.</p>`}
    <p class="toolbar" style="margin-top:12px"><button class="btn" id="nt-test" ${d.teacher ? "" : "disabled"}>Send me a test DM</button><span class="small" id="nt-out"></span></p>`;
  const save = () => api("/notify", { method: "PUT", body: { hands: $("#nt-hands").checked, ask: $("#nt-ask").checked, shop: $("#nt-shop").checked } }).then(() => toast("Notifications saved")).catch((e) => toast(e.message, true));
  $("#nt-hands").onchange = save; $("#nt-ask").onchange = save; $("#nt-shop").onchange = save;
  $("#nt-test").onclick = (e) => busy(e.currentTarget, async () => {
    const r = await api("/notify/test", { method: "POST" });
    const out = $("#nt-out");
    if (r.ok) out.innerHTML = `<span class="ok-text">✅ Sent. Check your Discord DMs.</span>`;
    else if (r.reason === "closed") out.innerHTML = `<span class="late-wait">❌ Discord refused the DM: in your server's menu → <b>Privacy settings</b>, turn on <b>Direct messages</b>, then try again.</span>`;
    else if (r.reason === "no_teacher") out.innerHTML = `<span class="late-wait">Run <code>/teacher notify</code> in Discord first.</span>`;
    else out.innerHTML = `<span class="late-wait">❌ ${esc(r.detail || "The DM couldn't be sent.")}</span>`;
  });
}


// ======================================================= 🪙 coins & shop
async function viewCoins() {
  const d = await api("/coins");
  const selected = new Set();
  const builtinName = { freeze: "Streak freeze", hint: "Hint token", double: "Double code hour", contract: "Challenge contract", shield: "Duel shield",
    title: "Custom title", color: "Name color", theme: "Profile theme", motto: "Motto", emoji: "Profile emoji", showcase: "Badge showcase", lang: "Favourite language",
    pin: "Proudest solve", frame: "Avatar frame", victory: "Victory message", levelup: "Level-up style", flair: "Leaderboard flair" };
  const builtinHelp = { freeze: "a missed day doesn't break their streak", hint: "their next hint costs no points",
    double: "×2 points on write-code they pick (practice, /today, /path); never on your assignments, daily or sessions",
    contract: "they pick a goal (5 easy, 3 medium or 2 hard code/SQL solves); reach it within the hours set → they win the reward",
    shield: "a lost duel doesn't cost Elo rating", title: "a title next to their name", color: "their name in a color they pick",
    theme: "a color theme on /profile and their shared page", motto: "a short sentence on their profile", emoji: "an emoji next to their name",
    showcase: "their 3 favourite badges shown first", lang: "a 💻 language badge on their profile", pin: "a solved challenge pinned on their profile",
    frame: "a frame around their profile", victory: "their own line when they win a duel", levelup: "a special #arena announcement when they level up",
    flair: "a symbol next to their name on every leaderboard" };
  const groupName = { item: "🎒 Items", boost: "⚡ Boosts", profile: "🪪 Profile", game: "🎮 In the game" };
  const cfg = d.shop.cfg;
  let custom = (cfg.custom || []).map((c) => ({ ...c }));
  view.innerHTML = `
    <div class="page-head"><div><h1>Coins &amp; shop</h1><p class="sub">Students earn coins (daily challenge, plan, path, duels, events, helping classmates) and spend them in <code>/shop</code>. ${d.students.length} students · ${d.total} 🪙 in total.</p></div></div>
    ${d.pending.length ? `<section class="panel"><h2>🎁 Rewards to give <span class="pill-inline">${d.pending.length}</span></h2>
      <p class="muted small">Students bought these with their coins. Give them, then mark them as given (or refund the coins).</p>
      ${table([
        { label: "Student", html: (r) => `<a href="#/student/${esc(r.discord_id)}">${esc(r.name || r.discord_id)}</a>` },
        { label: "Reward", html: (r) => esc(r.label) },
        { label: "Cost", num: true, html: (r) => `${r.cost} 🪙` },
        { label: "Bought", html: (r) => `<span class="small">${esc(fmtAgo(r.created_at))}</span>` },
        { label: "", html: (r) => `<span class="toolbar" style="margin:0"><button class="btn small primary" data-given="${r.id}">✅ Given</button><button class="btn small" data-refund="${r.id}">↩️ Refund</button></span>` },
      ], d.pending)}</section>` : ""}
    <div class="grid cols-2-even" style="align-items:start">
      <section class="panel"><div class="panel-head"><h2>Students' coins</h2>
        <span class="toolbar" style="margin:0"><input type="search" id="cs-q" placeholder="Search" style="max-width:150px"><button class="btn small" id="cs-all">Select all</button><button class="btn small" id="cs-none">Clear</button></span></div>
        <div id="cs-list"></div></section>
      <section class="panel"><h2>Change coins</h2>
        <label>Who</label>
        <div class="seg" id="cs-who"><button type="button" data-who="all" aria-pressed="true">Everyone (${d.students.length})</button><button type="button" data-who="sel" aria-pressed="false">Selected (<span id="cs-n">0</span>)</button></div>
        <label>What</label>
        <div class="seg" id="cs-op"><button type="button" data-op="add" aria-pressed="true">＋ Give</button><button type="button" data-op="remove" aria-pressed="false">− Remove</button><button type="button" data-op="set" aria-pressed="false">= Set to</button></div>
        <div class="field-row"><div><label for="cs-amt">Coins</label><input type="number" id="cs-amt" min="0" value="20"></div>
          <div style="align-self:end"><button class="btn small" id="cs-zero" title="Set to 0">Set to 0</button></div></div>
        <label for="cs-why">Reason <span class="muted">(shown in their DM)</span></label><input type="text" id="cs-why" maxlength="200" style="width:100%" placeholder="e.g. great teamwork today">
        <label class="check"><input type="checkbox" id="cs-dm"><span>Tell the students in a Discord DM (up to 20)</span></label>
        <p class="notice small" id="cs-sum"></p>
        <p><button class="btn primary" id="cs-go">Apply</button></p>
        ${d.log.length ? `<details><summary class="small"><b>History of changes</b> (${d.log.length})</summary>${table([
          { label: "Student", html: (r) => esc(r.name || r.discord_id) },
          { label: "Change", num: true, html: (r) => `<b style="color:${r.delta > 0 ? "var(--up)" : "var(--down)"}">${r.delta > 0 ? "+" : ""}${r.delta}</b>` },
          { label: "Now", num: true, html: (r) => `${r.balance}` },
          { label: "Reason", html: (r) => `<span class="small">${esc(r.reason || "—")}</span>` },
          { label: "When", html: (r) => `<span class="small">${esc(fmtAgo(r.created_at))}</span>` },
        ], d.log)}</details>` : ""}
      </section>
    </div>
    <section class="panel"><div class="panel-head"><h2>🛒 The shop</h2><button class="btn primary small" id="sh-save">Save the shop</button></div>
      <p class="muted small">What students see in <code>/shop</code>. Change prices and limits, turn items off, and add your own rewards: when a student buys one, you get a DM and it appears in <b>Rewards to give</b> above.</p>
      <h3>Built-in items</h3>
      <div class="table-wrap"><table><thead><tr><th>On</th><th>Item</th><th class="num">Price 🪙</th><th class="num">Settings</th><th class="num">Bought</th></tr></thead><tbody>
        ${["item", "boost", "profile", "game"].map((grp) => `<tr><th colspan="5" style="background:var(--soft,#f1f5f9)">${groupName[grp]}</th></tr>` + d.shop.items.filter((it) => !it.custom && it.group === grp).map((it) => `<tr>
          <td><input type="checkbox" data-b-on="${it.key}" ${it.on ? "checked" : ""} aria-label="Sell ${esc(builtinName[it.key] || it.key)}"></td>
          <td>${it.emoji} <b>${esc(builtinName[it.key] || it.key)}</b><div class="muted small">${esc(builtinHelp[it.key] || "")}</div></td>
          <td class="num"><input type="number" min="0" data-b-price="${it.key}" value="${it.price}" style="width:90px"></td>
          <td class="num">${[
            it.max != null ? `<input type="number" min="1" max="50" data-b-max="${it.key}" value="${it.max}" style="width:70px" title="How many a student can hold"> <span class="muted small">max held</span>` : "",
            it.days != null ? `<input type="number" min="1" max="90" data-b-days="${it.key}" value="${it.days}" style="width:70px" title="How long it lasts"> <span class="muted small">days</span>` : "",
            it.hours != null ? `<input type="number" min="1" max="72" data-b-hours="${it.key}" value="${it.hours}" style="width:70px" title="How long it lasts"> <span class="muted small">hours</span>` : "",
            it.reward != null ? `<input type="number" min="0" data-b-reward="${it.key}" value="${it.reward}" style="width:80px" title="Coins they win when they reach the goal"> <span class="muted small">🪙 reward</span>` : "",
          ].filter(Boolean).join("<br>")}</td>
          <td class="num">${d.shop.sold[it.key] ?? 0}</td></tr>`).join("")).join("")}
      </tbody></table></div>
      <h3 style="margin-top:18px">Your own rewards</h3>
      <p class="muted small">Ideas: 🎧 music while coding · 🪑 choose your seat · 📄 one homework skipped · ⏰ 10 more minutes on a test · 🍬 a snack. Leave "stock" empty for unlimited.</p>
      <div id="sh-custom"></div>
      <p><button class="btn small" id="sh-add">${icon("plus")} Add a reward</button></p>
    </section>
    ${d.purchases.length ? `<section class="panel"><details><summary><b>Recent purchases</b> (${d.purchases.length})</summary>${table([
      { label: "Student", html: (r) => esc(r.name || r.discord_id) },
      { label: "Item", html: (r) => `${esc(r.label)}${r.detail && !r.label.includes(r.detail) ? ` <span class="muted small">${esc(r.detail)}</span>` : ""}` },
      { label: "Cost", num: true, html: (r) => `${r.cost}` },
      { label: "Status", html: (r) => (r.status === "pending" ? status("review", "To give") : r.status === "given" ? status("done", "Given") : r.status === "refunded" ? status("expired", "Refunded") : '<span class="muted small">—</span>') },
      { label: "When", html: (r) => `<span class="small">${esc(fmtAgo(r.created_at))}</span>` },
    ], d.purchases)}</details></section>` : ""}`;

  // ---- students list
  const drawList = () => {
    const q = ($("#cs-q").value || "").toLowerCase();
    const rows = d.students.filter((p) => !q || String(p.name || "").toLowerCase().includes(q));
    $("#cs-list").innerHTML = table([
      { label: "", html: (p) => `<input type="checkbox" data-sel="${esc(p.discord_id)}" ${selected.has(p.discord_id) ? "checked" : ""} aria-label="Select">` },
      { label: "Student", sort: "name", html: (p) => `<a href="#/student/${esc(p.discord_id)}">${avatar(p.name, p.discord_id)} ${esc(p.name || p.discord_id)}</a>` },
      { label: "Coins", sort: "coins", num: true, html: (p) => `<b>${p.coins}</b>` },
      { label: "🧊", num: true, html: (p) => `${p.streak_freezes || 0}` },
      { label: "🎟️", num: true, html: (p) => `${p.hint_tokens || 0}` },
      { label: "Their texts", html: (p) => (p.texts || []).map((x) => `<span class="sk-pill" title="${esc(x.key)}">${esc(x.v)} <button class="icon-btn" style="padding:0 4px" data-clear="${esc(p.discord_id)}|${esc(x.key)}" title="Remove this ${esc(x.key)} (no refund)">×</button></span>`).join(" ") || '<span class="muted small">—</span>' },
    ], rows, { empty: "No students yet." });
    setTimeout(() => $$("[data-clear]").forEach((b) => b.onclick = () => {
      const [student, key] = b.dataset.clear.split("|");
      confirmDialog("Remove this text?", "It disappears from their profile right away. The coins aren't given back.", "Remove", async () => { await api("/shop/clear", { method: "POST", body: { student, key } }); toast("Removed"); viewCoins(); }, true);
    }), 0);
    setTimeout(() => $$("[data-sel]").forEach((c) => c.onchange = () => { c.checked ? selected.add(c.dataset.sel) : selected.delete(c.dataset.sel); if (selected.size) setWho("sel"); summary(); }), 0);
  };
  let who = "all", op = "add";
  const setWho = (w) => { who = w; $$("#cs-who [data-who]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.who === w))); summary(); };
  const setOp = (o) => { op = o; $$("#cs-op [data-op]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.op === o))); summary(); };
  const summary = () => {
    $("#cs-n").textContent = selected.size;
    const n = who === "all" ? d.students.length : selected.size, a = Math.max(0, Number($("#cs-amt").value) || 0);
    $("#cs-sum").textContent = !n ? "Select students in the list, or choose Everyone." : op === "set" ? `${n} student(s) will have exactly ${a} coins.` : `${op === "add" ? "+" : "−"}${a} coins for ${n} student(s)${op === "remove" ? " (never below 0)" : ""}.`;
  };
  $$("#cs-who [data-who]").forEach((b) => b.onclick = () => setWho(b.dataset.who));
  $$("#cs-op [data-op]").forEach((b) => b.onclick = () => setOp(b.dataset.op));
  $("#cs-amt").oninput = summary;
  $("#cs-q").oninput = drawList;
  $("#cs-all").onclick = () => { d.students.forEach((p) => selected.add(p.discord_id)); setWho("sel"); drawList(); };
  $("#cs-none").onclick = () => { selected.clear(); setWho("all"); drawList(); };
  $("#cs-zero").onclick = () => { setOp("set"); $("#cs-amt").value = 0; summary(); };
  $("#cs-go").onclick = (e) => {
    const n = who === "all" ? d.students.length : selected.size;
    if (!n) return toast("Select students first", true);
    const a = Math.max(0, Number($("#cs-amt").value) || 0);
    const what = op === "set" ? `set the coins of ${n} student(s) to ${a}` : `${op === "add" ? "give" : "remove"} ${a} coins ${op === "add" ? "to" : "from"} ${n} student(s)`;
    confirmDialog("Change coins?", `You're about to ${what}. It's written in the history.`, "Apply", async () => {
      const r = await api("/coins", { method: "POST", body: { students: who === "all" ? "all" : [...selected], op, amount: a, reason: $("#cs-why").value, notify: $("#cs-dm").checked } });
      toast(`${r.changed} student(s) updated`); refreshPills(); viewCoins();
    }, op !== "add");
  };
  drawList(); summary();

  // ---- shop editor
  const drawCustom = () => {
    $("#sh-custom").innerHTML = custom.length ? `<div class="table-wrap"><table><thead><tr><th>On</th><th>Emoji</th><th>Name</th><th>What it is</th><th class="num">Price 🪙</th><th class="num">Stock</th><th class="num">Per student</th><th class="num">Bought</th><th></th></tr></thead><tbody>
      ${custom.map((c, i) => `<tr>
        <td><input type="checkbox" data-c="${i}" data-f="on" ${c.on !== false ? "checked" : ""}></td>
        <td><input type="text" data-c="${i}" data-f="emoji" value="${esc(c.emoji || "🎁")}" maxlength="8" style="width:52px"></td>
        <td><input type="text" data-c="${i}" data-f="name" value="${esc(c.name || "")}" maxlength="60" placeholder="e.g. Choose your seat" style="min-width:150px"></td>
        <td><input type="text" data-c="${i}" data-f="desc" value="${esc(c.desc || "")}" maxlength="160" placeholder="optional" style="min-width:160px"></td>
        <td class="num"><input type="number" min="0" data-c="${i}" data-f="price" value="${c.price ?? 50}" style="width:80px"></td>
        <td class="num"><input type="number" min="0" data-c="${i}" data-f="stock" value="${c.stock ?? ""}" placeholder="∞" style="width:70px"></td>
        <td class="num"><input type="number" min="1" data-c="${i}" data-f="per_student" value="${c.per_student ?? ""}" placeholder="∞" style="width:70px"></td>
        <td class="num">${c.id ? d.shop.sold[`c_${c.id}`] ?? 0 : 0}</td>
        <td><button class="icon-btn" data-cdel="${i}" title="Remove">×</button></td></tr>`).join("")}</tbody></table></div>`
      : `<p class="empty">No reward of your own yet.</p>`;
    $$("[data-c]").forEach((el) => el.oninput = el.onchange = () => { const c = custom[Number(el.dataset.c)]; c[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value; });
    $$("[data-cdel]").forEach((b) => b.onclick = () => { custom.splice(Number(b.dataset.cdel), 1); drawCustom(); });
  };
  drawCustom();
  $("#sh-add").onclick = () => { if (custom.length >= 15) return toast("15 rewards at most", true); custom.push({ emoji: "🎁", name: "", desc: "", price: 100, stock: "", per_student: 1, on: true }); drawCustom(); $$("[data-f=name]").pop()?.focus(); };
  $("#sh-save").onclick = (e) => busy(e.currentTarget, async () => {
    const items = {};
    for (const it of d.shop.items.filter((x) => !x.custom)) {
      const num = (f) => $(`[data-b-${f}="${it.key}"]`) ? { [f]: Number($(`[data-b-${f}="${it.key}"]`).value) } : {};
      items[it.key] = { on: $(`[data-b-on="${it.key}"]`).checked, price: Number($(`[data-b-price="${it.key}"]`).value), ...num("max"), ...num("days"), ...num("hours"), ...num("reward") };
    }
    const bad = custom.find((c) => String(c.name || "").trim().length < 2);
    if (bad) throw new Error("Give each reward a name (or remove the empty one)");
    await api("/shop", { method: "PUT", body: { items, custom } });
    toast("Shop saved: students see it in /shop"); viewCoins();
  });
  $$("[data-given]").forEach((b) => b.onclick = () => busy(b, async () => { await api(`/shop/purchases/${b.dataset.given}`, { method: "POST", body: { action: "given" } }); toast("Marked as given"); refreshPills(); viewCoins(); }));
  $$("[data-refund]").forEach((b) => b.onclick = () => confirmDialog("Refund this reward?", "The student gets the coins back.", "Refund", async () => { await api(`/shop/purchases/${b.dataset.refund}`, { method: "POST", body: { action: "refund" } }); toast("Refunded"); refreshPills(); viewCoins(); }, true));
}
Object.assign(routes, { coins: viewCoins });
