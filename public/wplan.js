// ================================================= plan d'action for one student: diagnosis, then actions built for them
// « Give work » asks first: a challenge (one or more students), or a plan d'action (one student). The plan is built
// like an assessment: the AI reads the student's debriefs, assessments and practice and explains their lacunes, it
// proposes actions (a challenge of the library, a code to write, a question, a QCM, a mini brief made for them), and
// writes or improves any of them; the teacher decides. Sent, the student answers on their own page and the AI corrects
// at once; the teacher follows each action, and validates the mini brief.
const WK = {
  challenge: { ico: "🎯", label: "Challenge", sub: "A challenge of your library, solved in Discord" },
  code: { ico: "💻", label: "Code this", sub: "A piece of code to write, corrected by the AI" },
  answer: { ico: "✍️", label: "Answer this", sub: "A question answered in a few sentences" },
  mcq: { ico: "☑️", label: "QCM", sub: "A multiple-choice question, corrected at once" },
  brief: { ico: "📦", label: "Mini brief", sub: "A small project made for them, handed in as a link" },
};
const WP_PRIO = { 1: ["p1", "Blocking"], 2: ["p2", "Important"], 3: ["p3", "To consolidate"] };
const WP_STATE = { todo: ["", "To do"], done: ["up", "✓ Done"], partial: ["warn", "Almost"], failed: ["down", "To redo"], submitted: ["blue", "Handed in"], redo: ["warn", "Asked to redo"] };
const WP_LANGS = ["html", "css", "javascript", "php", "sql", "python", "java", "bash"];
const WPS = { plan: null, status: null, url: null, open: new Set(), timer: null, saving: null, lib: null, busy: new Set() };

// ------------------------------------------------------------------ « Give work »: a challenge or a plan d'action
async function giveWorkDialog(preStudents = [], rows = []) {
  const students = rows.length ? rows : (await loadStudents()).map((s) => ({ discord_id: s.discord_id, name: s.name || s.discord_id }));
  const one = preStudents.length === 1 ? students.find((s) => s.discord_id === preStudents[0]) || { discord_id: preStudents[0], name: preStudents[0] } : null;
  const plans = await api(`/wplans${one ? `?student=${one.discord_id}` : ""}`).catch(() => []);
  const draft = one ? plans.find((p) => p.status === "draft") : null;
  const pickList = one ? "" : `<label for="gw-s" class="small">For</label><select id="gw-s" style="width:100%">${students.map((s) => `<option value="${esc(s.discord_id)}" ${preStudents[0] === s.discord_id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>`;
  openDialog("Give work", `<div class="gw">
      <button class="gw-opt" id="gw-ch"><span class="gw-ico">🎯</span><b>A challenge</b><span class="muted small">One challenge of your library, for ${one ? esc(one.name) : "one or more students"}. Solved in Discord, tracked here.</span><span class="btn">Choose a challenge →</span></button>
      <div class="gw-opt gw-plan" role="group"><span class="gw-ico">🧭</span><b>A plan d'action</b><span class="muted small">A series of actions built for ${one ? esc(one.name) : "one student"}: the AI first explains their lacunes and proposes challenges, code to write, questions, a QCM or a mini brief. You choose, edit, then send.</span>
        ${pickList}<button class="btn primary" id="gw-pl">${draft ? "Continue the draft" : "Build the plan"} →</button></div>
    </div>`);
  dlg.classList.add("wide");
  $("#gw-ch", dlg).onclick = () => { dlg.close(); assignDialog(preStudents); };
  $("#gw-pl", dlg).onclick = (e) => busy(e.currentTarget, async () => {
    const sid = one ? one.discord_id : $("#gw-s", dlg).value;
    let id = draft?.id;
    if (!id) {
      const mine = one ? null : (await api(`/wplans?student=${sid}`)).find((p) => p.status === "draft");
      id = mine?.id || (await api("/wplans", { method: "POST", body: { student: sid } })).id;
    }
    dlg.close();
    location.hash = `#/wplan/${id}`;
  });
}

// ------------------------------------------------------------------ the builder
async function viewWorkPlan(id) {
  const r = await api(`/wplans/${id}`);
  Object.assign(WPS, { plan: r.plan, status: r.status, url: r.url });
  if (WPS.lastId !== id) { WPS.open = new Set(); WPS.lastId = id; }
  drawWorkPlan();
}
const wpDraft = () => WPS.plan?.status === "draft";
const wpFirst = () => esc(String(WPS.plan?.name || "").split(/\s+/)[0] || "the student");

function drawWorkPlan() {
  const p = WPS.plan, draft = wpDraft();
  const st = WPS.status;
  const count = Object.keys(WK).map((k) => [k, p.steps.filter((s) => s.kind === k).length]).filter(([, n]) => n);
  view.innerHTML = `
    <div class="page-head"><div><p class="crumb"><a href="#/assignments">Plan d'action</a> › ${esc(p.name)}</p>
        <h1>🧭 ${esc(p.title)}</h1>
        <p class="sub">${draft ? `A draft for ${esc(p.name)}: understand their lacunes, choose the actions, then send. Nothing is sent before you press Send.`
          : `Sent to <b>${esc(p.name)}</b> ${fmtAgo(p.sent_at)}${p.due_at ? ` · due ${fmtDateTime(p.due_at)}` : ""}. Follow each action below.`}</p></div>
      <div class="actions"><button class="btn" id="wp-gaps">🔎 Weak points</button>${WPS.url ? `<a class="btn" href="${esc(WPS.url)}" target="_blank" rel="noopener">Their page ↗</a>` : ""}<button class="btn danger" id="wp-del">${draft ? "Delete the draft" : "Delete the plan"}</button></div></div>
    <div class="wp-grid">
      <div class="stack">
        ${draft ? `<section class="panel wp-diag" id="wp-diag">${diagHtml()}</section>`
          : p.diag ? `<section class="panel wp-diag"><details class="wp-fold"><summary><b>✨ The diagnosis</b> <span class="muted small">${p.diag.lacunes.length} lacune(s) · ${esc(p.diag.lacunes.map((l) => l.notion).join(", "))}</span></summary>${diagHtml()}</details></section>` : ""}
        <section class="panel"><div class="panel-head"><h2>Actions <span class="muted">· ${p.steps.length}</span></h2><span class="small muted" id="wp-saved">${draft ? "Saved as you edit" : ""}</span></div>
          ${p.steps.length ? `<ol class="wp-steps">${p.steps.map((s, i) => stepCardHtml(s, i)).join("")}</ol>`
            : `<div class="wp-empty"><p><b>No action yet.</b></p><p class="muted">${p.diag ? "Add the proposed actions above, or one of your own below." : `Diagnose ${wpFirst()} first: the AI proposes actions for their lacunes. Or add your own below.`}</p></div>`}
          ${draft ? `<div class="wp-add"><span class="wp-add-l">Add an action</span>${Object.entries(WK).map(([k, v]) => `<button class="wp-kbtn k-${k}" data-add="${k}" title="${esc(v.sub)}"><span>${v.ico}</span>${esc(v.label)}</button>`).join("")}</div>` : ""}
        </section>
      </div>
      <aside class="stack wp-side">${draft ? sendPanelHtml(count) : progressPanelHtml(st)}</aside>
    </div>`;
  wireWorkPlan();
}

function diagHtml() {
  const p = WPS.plan, d = p.diag, name = wpFirst();
  if (WPS.busy.has("diag")) return `<div class="wp-diag-load"><div class="wp-spin"></div><div><b>The AI reads ${name}'s debriefs, assessments and practice…</b><p class="muted small">About 20 seconds. It explains their lacunes, then proposes actions.</p></div></div>`;
  if (!d) return `<div class="wp-diag-empty"><div class="wp-diag-ico">🔎</div><div><h2>Understand ${name}'s lacunes first</h2>
      <p class="muted">The AI reads their debriefs (requirements missed, competencies not validated, oral questions), their assessments (the questions missed and why) and their practice, then explains what they don't master and proposes actions for it.</p>
      <p class="toolbar" style="margin:12px 0 0"><button class="btn primary" id="wp-diagnose">✨ Diagnose ${name}</button></p></div></div>`;
  const added = new Set(p.steps.map((s) => s.kind + "|" + (s.prompt || s.title)));
  return `<div class="panel-head"><h2>✨ Diagnosis</h2><span class="toolbar" style="margin:0"><span class="muted small">${fmtAgo(d.at)}</span>${wpDraft() ? `<button class="btn small" id="wp-diagnose">↻ Again</button>` : ""}</span></div>
    ${d.summary ? `<p class="wp-sum">${esc(d.summary)}</p>` : ""}
    ${d.lacunes.length ? `<h3 class="wp-h">Lacunes <span class="muted small">most urgent first</span></h3><div class="wp-lacs">${d.lacunes.map((l, i) => { const pr = WP_PRIO[l.priority] || WP_PRIO[2];
      return `<article class="wp-lac ${pr[0]}"><header><span class="wp-prio ${pr[0]}">${pr[1]}</span>${l.comps.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</header>
        <b class="wp-lac-t">${esc(l.notion)}</b><p class="small">${esc(l.why)}</p>
        ${l.evidence.length ? `<ul class="wp-ev">${l.evidence.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
        ${wpDraft() ? `<footer><span class="muted small">✨ An action for it:</span>${["code", "answer", "mcq", "challenge", "brief"].map((k) => `<button class="wp-mini k-${k}" data-mk="${k}" data-lac="${i}" title="${esc(WK[k].sub)}">${WK[k].ico}</button>`).join("")}</footer>` : ""}</article>`; }).join("")}</div>` : ""}
    ${d.proposals.length ? `<h3 class="wp-h">Proposed actions <span class="muted small">${wpDraft() ? `<button class="ap-link" id="wp-addall">+ Add them all</button>` : ""}</span></h3>
      <div class="wp-props">${d.proposals.map((s, i) => { const isIn = added.has(s.kind + "|" + (s.prompt || s.title));
        return `<div class="wp-prop k-${s.kind}"><span class="wp-kico">${WK[s.kind].ico}</span><div class="wp-prop-b"><b>${esc(s.title)}</b>
          <div class="small muted"><span class="wp-kind">${esc(WK[s.kind].label)}</span>${s.notion ? ` · ${esc(s.notion)}` : ""}</div>${s.why ? `<div class="small">${esc(s.why)}</div>` : ""}</div>
          ${wpDraft() ? (isIn ? `<span class="wp-in">✓ Added</span>` : `<button class="btn small" data-prop="${i}">+ Add</button>`) : ""}</div>`; }).join("")}</div>` : ""}`;
}

function stepCardHtml(s, i) {
  const draft = wpDraft(), open = WPS.open.has(s.id), k = WK[s.kind];
  const st = WPS.status?.steps.find((x) => x.id === s.id);
  const stc = st ? WP_STATE[st.state] || WP_STATE.todo : null;
  const busyS = WPS.busy.has(s.id);
  return `<li class="wp-step k-${s.kind} ${open ? "open" : ""}" data-sid="${esc(s.id)}">
    <header class="wp-sh"><span class="wp-num">${i + 1}</span><span class="wp-kico">${k.ico}</span>
      <button class="wp-st" data-toggle="${esc(s.id)}" aria-expanded="${open}"><span class="wp-kind">${esc(k.label)}</span><b>${esc(s.title || (s.kind === "challenge" ? s.challenge?.title : "") || "Untitled")}</b>${s.notion ? `<span class="wp-notion">${esc(s.notion)}</span>` : ""}</button>
      ${stc ? `<span class="wp-state ${stc[0]}">${stc[1]}</span>` : ""}
      ${draft ? `<span class="wp-tools"><button class="wp-ib" data-up="${i}" title="Move up" ${i ? "" : "disabled"}>↑</button><button class="wp-ib" data-down="${i}" title="Move down" ${i < WPS.plan.steps.length - 1 ? "" : "disabled"}>↓</button><button class="wp-ib danger" data-rm="${i}" title="Remove">✕</button></span>` : ""}
      <button class="wp-ib" data-toggle="${esc(s.id)}" aria-label="Open">${open ? "▴" : "▾"}</button></header>
    ${open ? `<div class="wp-sb">${busyS ? `<div class="wp-busy"><div class="wp-spin"></div> The AI writes…</div>` : draft ? editorHtml(s) : trackHtml(s, st)}</div>` : !draft ? `<div class="wp-sb wp-peek">${peekHtml(s, st)}</div>` : ""}
  </li>`;
}
const wpField = (s, key, label, o = {}) => {
  const v = esc(s[key] ?? "");
  const tag = o.area ? `<textarea data-f="${key}" rows="${o.rows || 3}" class="${o.mono ? "mono" : ""}" placeholder="${esc(o.ph || "")}" spellcheck="${o.mono ? "false" : "true"}">${v}</textarea>`
    : `<input type="text" data-f="${key}" value="${v}" placeholder="${esc(o.ph || "")}">`;
  return `<label class="wp-f ${o.wide ? "wide" : ""}"><span>${label}</span>${tag}</label>`;
};
function editorHtml(s) {
  const ai = (action, label, title) => `<button class="btn small wp-ai" data-ai="${action}" data-sid="${esc(s.id)}" title="${esc(title)}">✨ ${label}</button>`;
  const head = `<div class="wp-fields">${wpField(s, "title", "Title", { ph: "Short title the student sees" })}${wpField(s, "notion", "Notion", { ph: "e.g. Flexbox: justify-content" })}${wpField(s, "why", "Why (the student sees it)", { ph: "What it helps with", wide: true })}</div>`;
  if (s.kind === "challenge") {
    return `${head}<div class="wp-pick"><label class="wp-f wide"><span>Challenge</span><input type="search" data-chq placeholder="Type to filter the library"></label>
      <div class="wp-chl" data-chl>${chListHtml(s, "")}</div></div>
      <p class="toolbar">${ai("make", "Pick one for this notion", "The AI picks the challenge of your library that fits the notion")}</p>`;
  }
  if (s.kind === "brief") {
    const b = s.brief || { context: "", tasks: [], deliverable: "", hours: 3 };
    return `${head}<div class="wp-fields">
      <label class="wp-f wide"><span>Context</span><textarea data-bf="context" rows="3" placeholder="What they build, in 2 or 3 sentences">${esc(b.context)}</textarea></label>
      <label class="wp-f wide"><span>Tasks <span class="muted">(one per line)</span></span><textarea data-bf="tasks" rows="5" placeholder="Make the navbar a flex container&#10;Space the links with gap…">${esc((b.tasks || []).join("\n"))}</textarea></label>
      <label class="wp-f"><span>Deliverable</span><input type="text" data-bf="deliverable" value="${esc(b.deliverable)}" placeholder="The link of the GitHub repo"></label>
      <label class="wp-f"><span>Hours</span><input type="number" data-bf="hours" min="1" max="40" value="${Number(b.hours) || 3}"></label></div>
      <p class="toolbar">${ai("make", `Write it for ${wpFirst()}`, "The AI writes (or completes) a small brief that practises this notion")}</p>`;
  }
  const lang = s.kind === "code" ? `<label class="wp-f"><span>Language</span><select data-f="lang">${WP_LANGS.map((l) => `<option ${l === (s.lang || "javascript") ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : "";
  let body = `${head}<div class="wp-fields">${wpField(s, "prompt", s.kind === "code" ? "What to code" : "Question", { area: true, rows: 3, wide: true, ph: "Short and direct, like a quiz question" })}${lang}`;
  if (s.kind === "code") body += wpField(s, "starter", "Starter code <span class='muted'>(optional, never the answer)</span>", { area: true, mono: true, rows: 4, wide: true }) + wpField(s, "expected", "Expected answer / key points <span class='muted'>(the AI corrects with it; never shown)</span>", { area: true, mono: true, rows: 5, wide: true });
  if (s.kind === "answer") body += wpField(s, "expected", "Key points expected <span class='muted'>(one per line; never shown)</span>", { area: true, rows: 4, wide: true });
  if (s.kind === "mcq") body += `<div class="wp-f wide"><span>Choices <span class="muted">(tick the right ones)</span></span><div class="wp-ch">${(s.choices.length ? s.choices : ["", "", "", ""]).map((c, k) => `<div class="wp-chr"><input type="checkbox" data-ok="${k}" ${s.answer.includes(k) ? "checked" : ""} aria-label="Right answer"><input type="text" data-c="${k}" value="${esc(c)}" placeholder="Choice ${k + 1}"><button class="wp-ib" data-crm="${k}" title="Remove">✕</button></div>`).join("")}</div><button class="ap-link" data-cadd>+ A choice</button></div>`;
  body += `</div><p class="toolbar">${ai("rephrase", "Improve the wording", "Clear, short, direct; always in French")}${ai("fill", s.kind === "mcq" ? "Write the choices" : s.kind === "code" ? "Write the starter and the answer" : "Write the key points", "From the question")}${ai("make", "Rewrite it", "A new one on the same notion")}</p>`;
  return body;
}
function chListHtml(s, q) {
  const lib = (WPS.lib || []).filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.id === s.challenge_id) - (a.id === s.challenge_id));   // the chosen one first
  if (!WPS.lib) return `<p class="muted small">Loading the library…</p>`;
  if (s.challenge_id && s.challenge && !lib.some((c) => c.id === s.challenge_id)) lib.unshift({ id: s.challenge_id, ...s.challenge });
  return lib.slice(0, 60).map((c) => `<label class="wp-cho ${c.id === s.challenge_id ? "on" : ""}"><input type="radio" name="ch-${esc(s.id)}" value="${c.id}" ${c.id === s.challenge_id ? "checked" : ""}><b>${esc(c.title)}</b> ${diffTag(c.difficulty)} <span class="muted small">${esc(KIND[c.kind] || c.kind)}</span></label>`).join("") || `<p class="muted small">No challenge matches.</p>`;
}
function peekHtml(s, st) {
  if (!s.work && !s.review) return `<span class="muted small">${s.kind === "challenge" ? (st?.asg === "open" ? "Not solved yet (in Discord)" : "") : "Not answered yet"}</span>`;
  return trackHtml(s, st, true);
}
function trackHtml(s, st, short = false) {
  const w = s.work, V = { correct: ["up", "✓ Right"], partial: ["warn", "Almost"], wrong: ["down", "Wrong"], submitted: ["blue", "Handed in"] };
  let h = "";
  if (!short) {
    if (s.kind === "challenge") h += `<p><b>${esc(s.challenge?.title || "")}</b> ${s.challenge ? diffTag(s.challenge.difficulty) : ""} <span class="muted small">· assignment ${esc(st?.asg || "")}</span></p>`;
    else if (s.kind === "brief") h += `<p class="small">${esc(s.brief?.context || "")}</p><ul class="small">${(s.brief?.tasks || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
    else h += `<p class="wp-q">${esc(s.prompt)}</p>`;
  }
  if (w) {
    const v = V[w.verdict] || ["", ""];
    const ans = Array.isArray(w.answer) ? w.answer.map((k) => s.choices[k]).join(" · ") : w.answer;
    h += `<div class="wp-work"><div class="wp-work-h"><span class="wp-state ${v[0]}">${v[1]}</span><span class="muted small">${w.tries > 1 ? `${w.tries} tries · ` : ""}${fmtAgo(w.at)}</span></div>
      ${s.kind === "brief" ? `<p><a href="${esc(w.link)}" target="_blank" rel="noopener noreferrer">${esc(w.link)}</a></p>${w.note ? `<p class="small">« ${esc(w.note)} »</p>` : ""}` : ans != null ? `<pre class="wp-ans">${esc(ans)}</pre>` : ""}
      ${w.comment && s.kind !== "brief" ? `<p class="small"><b>The AI:</b> ${esc(w.comment)}</p>` : ""}</div>`;
  }
  if (s.review) h += `<div class="wp-rev ${s.review.ok ? "ok" : "ko"}"><b>${s.review.ok ? "✓ You validated it" : "↻ You asked to redo it"}</b>${s.review.comment ? ` · ${esc(s.review.comment)}` : ""}</div>`;
  if (!short && s.kind !== "challenge" && (w || s.kind === "brief")) h += `<div class="wp-revf"><input type="text" data-rvc="${esc(s.id)}" placeholder="A word for ${wpFirst()} (optional)"><button class="btn small primary" data-rv="${esc(s.id)}" data-ok="1">✓ Validate</button><button class="btn small" data-rv="${esc(s.id)}" data-ok="0">↻ Ask to redo</button></div>`;
  return h;
}
function sendPanelHtml(count) {
  const p = WPS.plan;
  const due = p.due_at ? new Date(p.due_at * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  return `<section class="panel wp-send"><h2>Send to ${wpFirst()}</h2>
    <label class="wp-f wide"><span>Title</span><input type="text" id="wp-title" value="${esc(p.title)}" maxlength="120"></label>
    <label class="wp-f wide"><span>Message <span class="muted">(at the top of their page)</span></span><textarea id="wp-msg" rows="4" placeholder="e.g. On reprend les bases de Flexbox ensemble : fais les actions dans l'ordre.">${esc(p.message)}</textarea></label>
    <label class="wp-f wide"><span>Due <span class="muted">(optional)</span></span><input type="datetime-local" id="wp-due" value="${due}"></label>
    <div class="wp-sumk">${count.length ? count.map(([k, n]) => `<span class="wp-chip k-${k}">${WK[k].ico} ${n} ${esc(WK[k].label)}</span>`).join("") : `<span class="muted small">No action yet</span>`}</div>
    <button class="btn primary wp-go" id="wp-send" ${p.steps.length ? "" : "disabled"}>🧭 Send the plan</button>
    <p class="muted small">${wpFirst()} gets a private page by DM. They answer there and the AI corrects at once (they can try again); the challenges are done in Discord (/assignments); the mini brief is handed in as a link that you validate.</p></section>`;
}
function progressPanelHtml(st) {
  const p = WPS.plan, pct = st?.pct ?? 0, r = 46, c = 2 * Math.PI * r;
  const toReview = p.steps.filter((s) => s.kind === "brief" && s.work && !s.review).length;
  return `<section class="panel wp-prog"><h2>${p.status === "done" ? "🎉 Done" : "Progress"}</h2>
    <div class="wp-ring"><svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="${r}" class="bg"/><circle cx="55" cy="55" r="${r}" class="fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"/></svg>
      <div><b>${st?.done ?? 0}/${st?.total ?? p.steps.length}</b><span>actions done</span></div></div>
    ${toReview ? `<p class="wp-alert">📦 ${toReview} mini brief${toReview > 1 ? "s" : ""} to validate below</p>` : ""}
    <dl class="wp-dl"><dt>Sent</dt><dd>${fmtDateTime(p.sent_at)}</dd>${p.due_at ? `<dt>Due</dt><dd>${fmtDateTime(p.due_at)}</dd>` : ""}${p.done_at ? `<dt>Finished</dt><dd>${fmtDateTime(p.done_at)}</dd>` : ""}</dl>
    ${WPS.url ? `<button class="btn small" id="wp-copy">Copy their link</button>` : ""}
    ${p.message ? `<blockquote class="ap-note"><p>${esc(p.message)}</p></blockquote>` : ""}</section>`;
}

// ------------------------------------------------------------------ wiring
function wpStep(id) { return WPS.plan.steps.find((s) => s.id === id); }
function wpSaveSoon() {
  if (!wpDraft()) return;
  const el = $("#wp-saved"); if (el) el.textContent = "Saving…";
  clearTimeout(WPS.timer);
  WPS.timer = setTimeout(wpSaveNow, 700);
}
async function wpSaveNow() {
  clearTimeout(WPS.timer);
  const p = WPS.plan;
  const body = { steps: p.steps, title: $("#wp-title")?.value ?? p.title, message: $("#wp-msg")?.value ?? p.message, due_at: wpDueValue() };
  try {
    WPS.saving = api(`/wplans/${p.id}`, { method: "PUT", body });
    const r = await WPS.saving;
    // keep what was typed meanwhile; take the challenges' names from the server
    for (const s of r.plan.steps) { const mine = wpStep(s.id); if (mine && s.kind === "challenge") mine.challenge = s.challenge; }
    const el = $("#wp-saved"); if (el) el.textContent = "✓ Saved";
  } catch (e) { const el = $("#wp-saved"); if (el) el.textContent = e.message; }
  finally { WPS.saving = null; }
}
function wpDueValue() { const v = $("#wp-due")?.value; return v ? Math.floor(new Date(v).getTime() / 1000) : null; }
function wpNewStep(kind, extra = {}) {
  return { id: Math.random().toString(36).slice(2, 8), kind, title: "", notion: "", why: "", prompt: "", lang: kind === "code" ? "javascript" : "", starter: "", expected: "", choices: kind === "mcq" ? ["", "", "", ""] : [], answer: [], challenge_id: null, brief: kind === "brief" ? { context: "", tasks: [], deliverable: "Le lien du dépôt GitHub", hours: 3 } : null, ...extra };
}
async function wpLib() { if (!WPS.lib) { WPS.lib = (await loadChallenges()).filter((c) => (c.status || "active") === "active"); } return WPS.lib; }

async function wpStepAi(s, action, notion) {
  WPS.busy.add(s.id); WPS.open.add(s.id); drawWorkPlan();
  try {
    if (WPS.saving) await WPS.saving;
    const r = await api(`/wplans/${WPS.plan.id}/ai`, { method: "POST", body: { action, step: s, kind: s.kind, notion: notion ?? s.notion } });
    const k = WPS.plan.steps.findIndex((x) => x.id === s.id);
    if (k >= 0) WPS.plan.steps[k] = { ...r.step, id: s.id };
    toast(action === "rephrase" ? "Wording improved" : "Written by the AI: check it and edit what you want");
  } catch (e) { toast(e.message, true); }
  WPS.busy.delete(s.id); drawWorkPlan(); wpSaveSoon();
}

function wireWorkPlan() {
  const p = WPS.plan, draft = wpDraft();
  $("#wp-gaps").onclick = (e) => busy(e.currentTarget, () => gapsDialog({ discord_id: p.sid, name: p.name }));
  $("#wp-del").onclick = () => confirmDialog(draft ? "Delete this draft?" : `Delete ${p.name}'s plan?`, draft ? "Its diagnosis and actions are lost." : "Their page stops working and its open challenges are cancelled. What they did stays in their history.", "Delete",
    async () => { await api(`/wplans/${p.id}`, { method: "DELETE", confirmed: true }); toast("Plan deleted"); location.hash = "#/assignments"; }, true);
  $$("[data-toggle]").forEach((b) => b.onclick = () => { const id = b.dataset.toggle; WPS.open.has(id) ? WPS.open.delete(id) : WPS.open.add(id); drawWorkPlan(); });
  if ($("#wp-copy")) $("#wp-copy").onclick = () => { navigator.clipboard?.writeText(WPS.url); toast("Link copied"); };
  // the diagnosis
  if ($("#wp-diagnose")) $("#wp-diagnose").onclick = async () => {
    WPS.busy.add("diag"); $("#wp-diag").innerHTML = diagHtml();
    try { if (WPS.saving) await WPS.saving; const r = await api(`/wplans/${p.id}/diagnose`, { method: "POST", body: {} }); WPS.plan.diag = r.plan.diag; }
    catch (e) { toast(e.message, true); }
    WPS.busy.delete("diag"); drawWorkPlan();
  };
  $$("[data-prop]").forEach((b) => b.onclick = () => { const s = { ...p.diag.proposals[Number(b.dataset.prop)], id: Math.random().toString(36).slice(2, 8) }; p.steps.push(s); drawWorkPlan(); wpSaveSoon(); });
  if ($("#wp-addall")) $("#wp-addall").onclick = () => {
    const have = new Set(p.steps.map((s) => s.kind + "|" + (s.prompt || s.title)));
    for (const s of p.diag.proposals) if (!have.has(s.kind + "|" + (s.prompt || s.title))) p.steps.push({ ...s, id: Math.random().toString(36).slice(2, 8) });
    drawWorkPlan(); wpSaveSoon(); toast("Every proposed action is in the plan: open one to edit it");
  };
  $$("[data-mk]").forEach((b) => b.onclick = () => {
    const l = p.diag.lacunes[Number(b.dataset.lac)];
    const s = wpNewStep(b.dataset.mk, { notion: l.notion, title: l.notion });
    p.steps.push(s);
    if (b.dataset.mk === "challenge") wpLib().catch(() => {});
    wpStepAi(s, "make", l.notion);
  });
  if (!draft) {
    $$("[data-rv]").forEach((b) => b.onclick = () => busy(b, async () => {
      const c = $(`[data-rvc="${CSS.escape(b.dataset.rv)}"]`)?.value || "";
      const r = await api(`/wplans/${p.id}/review`, { method: "POST", body: { step: b.dataset.rv, ok: b.dataset.ok === "1", comment: c } });
      Object.assign(WPS, { plan: r.plan, status: r.status, url: r.url }); drawWorkPlan(); toast(b.dataset.ok === "1" ? "Validated" : `${p.name} will see it's to redo`);
    }));
    return;
  }
  // the actions
  $$("[data-add]").forEach((b) => b.onclick = () => { const s = wpNewStep(b.dataset.add); p.steps.push(s); WPS.open.add(s.id); if (s.kind === "challenge") wpLib().then(drawWorkPlan).catch(() => {}); drawWorkPlan(); wpSaveSoon();
    setTimeout(() => $(`.wp-step[data-sid="${s.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50); });
  $$("[data-up]").forEach((b) => b.onclick = () => { const i = Number(b.dataset.up); [p.steps[i - 1], p.steps[i]] = [p.steps[i], p.steps[i - 1]]; drawWorkPlan(); wpSaveSoon(); });
  $$("[data-down]").forEach((b) => b.onclick = () => { const i = Number(b.dataset.down); [p.steps[i + 1], p.steps[i]] = [p.steps[i], p.steps[i + 1]]; drawWorkPlan(); wpSaveSoon(); });
  $$("[data-rm]").forEach((b) => b.onclick = () => { p.steps.splice(Number(b.dataset.rm), 1); drawWorkPlan(); wpSaveSoon(); });
  $$("[data-ai]").forEach((b) => b.onclick = () => { const s = wpStep(b.dataset.sid); if (s.kind === "challenge") wpLib().catch(() => {}); wpStepAi(s, b.dataset.ai); });
  for (const card of $$(".wp-step.open")) {
    const s = wpStep(card.dataset.sid);
    if (!s) continue;
    $$("[data-f]", card).forEach((el) => el.addEventListener("input", () => { s[el.dataset.f] = el.value; if (el.dataset.f === "title") $(".wp-st b", card).textContent = el.value || "Untitled"; wpSaveSoon(); }));
    $$("[data-bf]", card).forEach((el) => el.addEventListener("input", () => {
      s.brief = s.brief || { context: "", tasks: [], deliverable: "", hours: 3 };
      const k = el.dataset.bf; s.brief[k] = k === "tasks" ? el.value.split("\n").map((x) => x.trim()).filter(Boolean) : k === "hours" ? Number(el.value) || 3 : el.value; wpSaveSoon();
    }));
    $$("[data-c]", card).forEach((el) => el.addEventListener("input", () => { s.choices[Number(el.dataset.c)] = el.value; wpSaveSoon(); }));
    $$("[data-ok]", card).forEach((el) => el.addEventListener("change", () => { const k = Number(el.dataset.ok); s.answer = el.checked ? [...new Set([...s.answer, k])].sort() : s.answer.filter((x) => x !== k); wpSaveSoon(); }));
    $$("[data-crm]", card).forEach((el) => el.onclick = () => { const k = Number(el.dataset.crm); s.choices.splice(k, 1); s.answer = s.answer.filter((x) => x !== k).map((x) => (x > k ? x - 1 : x)); drawWorkPlan(); wpSaveSoon(); });
    if ($("[data-cadd]", card)) $("[data-cadd]", card).onclick = () => { if (s.choices.length < 6) s.choices.push(""); drawWorkPlan(); };
    const chq = $("[data-chq]", card);
    if (chq) {
      wpLib().then(() => { $("[data-chl]", card).innerHTML = chListHtml(s, chq.value); wireCh(); }).catch((e) => ($("[data-chl]", card).innerHTML = `<p class="act-err">${esc(e.message)}</p>`));
      const wireCh = () => $$("[data-chl] input", card).forEach((r) => r.onchange = () => {
        const c = WPS.lib.find((x) => x.id === Number(r.value));
        s.challenge_id = c.id; s.challenge = { title: c.title, difficulty: c.difficulty, kind: c.kind }; if (!s.title) s.title = c.title;
        $$(".wp-cho", card).forEach((l) => l.classList.toggle("on", l.contains(r))); $(".wp-st b", card).textContent = s.title; wpSaveSoon();
      });
      chq.oninput = () => { $("[data-chl]", card).innerHTML = chListHtml(s, chq.value); wireCh(); };
    }
  }
  ["#wp-title", "#wp-msg", "#wp-due"].forEach((sel) => { const el = $(sel); if (el) el.addEventListener("input", () => { p.title = $("#wp-title").value; p.message = $("#wp-msg").value; p.due_at = wpDueValue(); wpSaveSoon(); }); });
  $("#wp-send").onclick = (e) => busy(e.currentTarget, async () => {
    const go = await new Promise((res) => {
      openDialog(`Send the plan to ${p.name}?`, `<p>${p.steps.length} action${p.steps.length > 1 ? "s" : ""}. ${wpFirst()} gets their page by DM. The actions can't be changed afterwards (you can still validate and comment).</p>`,
        [{ label: "Cancel", action: async () => { dlg.close(); res(false); } }, { label: "🧭 Send", primary: true, action: async () => { dlg.close(); res(true); } }]);
      dlg.addEventListener("close", () => res(false), { once: true });
    });
    if (!go) return;
    clearTimeout(WPS.timer); if (WPS.saving) await WPS.saving;
    const r = await api(`/wplans/${p.id}/send`, { method: "POST", body: { edits: { steps: p.steps, title: $("#wp-title").value, message: $("#wp-msg").value, due_at: wpDueValue() } } });
    Object.assign(WPS, { plan: r.plan, status: r.status, url: r.url });
    toast(r.dm ? `Sent: ${p.name} got their page by DM` : `Sent, but the DM couldn't go (closed DMs?): copy their link`, !r.dm);
    drawWorkPlan();
  });
}

// ------------------------------------------------------------------ on the Plan d'action page: each student's plans
function wpCardLine(plans) {
  if (!plans.length) return "";
  return `<div class="ap-wp">${plans.slice(0, 2).map((p) => `<a href="#/wplan/${p.id}" class="ap-wpl ${p.status}"><span>🧭</span><b>${p.status === "draft" ? "Draft plan" : p.status === "done" ? "Plan done" : "Plan d'action"}</b>
    ${p.status === "draft" ? `<span class="muted small">${p.steps} action(s)</span>` : `<span class="ap-wpbar"><i style="width:${p.pct}%"></i></span><span class="small">${p.done}/${p.steps}</span>`}${p.toReview ? `<span class="wp-state blue">📦 to validate</span>` : ""}</a>`).join("")}</div>`;
}
function wpListHtml(plans) {
  if (!plans.length) return "";
  return `<section class="panel"><div class="panel-head"><h2>🧭 Plans d'action</h2><span class="muted small">${plans.length}</span></div>
    <div class="wp-list">${plans.map((p) => `<a class="wp-row" href="#/wplan/${p.id}">${avatar(p.name, p.sid)}<span class="wp-row-w"><b>${esc(p.name)}</b><span class="muted small">${esc(p.title)}</span></span>
      <span class="wp-row-k">${p.kinds.map((k) => WK[k]?.ico || "").join("")}</span>
      ${p.status === "draft" ? `<span class="wp-state">Draft</span>` : `<span class="ap-wpbar wide"><i style="width:${p.pct}%"></i></span><span class="small">${p.done}/${p.steps}</span>`}
      ${p.toReview ? `<span class="wp-state blue">📦 ${p.toReview} to validate</span>` : p.status === "done" ? `<span class="wp-state up">✓ Done</span>` : p.status === "sent" ? `<span class="muted small">${p.due_at ? `due ${fmtDate(p.due_at)}` : `sent ${fmtAgo(p.sent_at)}`}</span>` : `<span class="muted small">${fmtAgo(p.updated_at)}</span>`}</a>`).join("")}</div></section>`;
}

Object.assign(routes, { wplan: (id) => viewWorkPlan(id) });
