/* ClassBot dashboard: ⚔️ Squad battle. Two teams, a 2-minute clock each, questions on the class TV,
   the teacher judges from their phone (QR code). Loaded after learning.js (uses its tag picker). */
"use strict";

Object.assign(REASON, { battle: "Squad battle" });
const BT_EMOJI = ["🦈", "🔥", "🐍", "🦄", "🦁", "🐬", "🚀", "⚡", "🐉", "🦅", "🤖", "👾", "🌪️", "🧠", "🐺", "🍀"];
const BT_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#a855f7", "#f59e0b", "#06b6d4", "#ec4899", "#14b8a6"];
const BT_PHASE = { lobby: ["pending", "Ready"], countdown: ["active", "Starting"], playing: ["active", "Live"], paused: ["pending", "Paused"], over: ["solved", "Finished"] };
let btTimer = null;
window.addEventListener("hashchange", () => { clearInterval(btTimer); btTimer = null; });

async function viewBattles() {
  const d = await api("/battles");
  const done = d.items.filter((b) => b.phase === "over").length;
  const live = d.items.filter((b) => ["countdown", "playing", "paused"].includes(b.phase)).length;
  view.innerHTML = `
    <div class="crumbs" style="margin-bottom:8px"><a href="#/games">Class games</a></div>
    <section class="bt-hero">
      <div class="bt-hero-text">
        <span class="bt-kicker">🎲 Class game · on the TV</span>
        <h1>Squad battle</h1>
        <p>Two teams, one clock each. A question appears on the class TV, the team answers out loud, you judge from your phone. A right answer stops their clock and passes the turn; a pass costs a few seconds. <b>The first clock at 0 loses.</b></p>
        <div class="bt-hero-actions"><button class="bt-cta" id="bt-new">⚔️ New battle</button>${d.items.length ? `<span class="bt-hero-stat"><b>${d.items.length}</b> battle${d.items.length > 1 ? "s" : ""} · <b>${done}</b> played${live ? ` · <b class="bt-live-dot">${live} live</b>` : ""}</span>` : ""}</div>
      </div>
      <div class="bt-hero-art" aria-hidden="true">
        <div class="bt-clockcard a"><span>🦈</span><b>1:42</b><i style="width:85%"></i></div>
        <div class="bt-vsbadge">VS</div>
        <div class="bt-clockcard b"><span>🔥</span><b>0:57</b><i style="width:47%"></i></div>
      </div>
    </section>
    <div class="bt-steps">
      <div class="bt-stepcard"><span class="bt-step-n">1</span><div class="bt-step-ic">🧩</div><h3>Set it up</h3><p>Pick the two teams and the topics. The AI writes quick questions; built-in ones fill in.</p></div>
      <div class="bt-stepcard"><span class="bt-step-n">2</span><div class="bt-step-ic">📺</div><h3>Show it on the TV</h3><p>Open the <b>TV screen</b> on the class TV, full screen, sound on.</p></div>
      <div class="bt-stepcard"><span class="bt-step-n">3</span><div class="bt-step-ic">📱</div><h3>Judge from your phone</h3><p><b>Scan the QR code</b> on the TV: you see each answer and judge with big buttons.</p></div>
    </div>
    ${d.items.length ? `<div class="panel-head" style="margin:6px 0 10px"><h2 style="margin:0">Your battles</h2></div><div class="bt-list">${d.items.map((b) => {
      const [cls, lbl] = BT_PHASE[b.phase] || ["pending", b.phase];
      const win = b.phase === "over" && b.winner != null ? b.teams[b.winner] : null;
      return `<a class="bt-item" href="#/battle/${b.id}" style="--ca:${esc(b.teams[0].color)};--cb:${esc(b.teams[1].color)}">
        <div class="bt-item-band"></div>
        <div class="bt-item-vs"><div class="bt-side"><span class="bt-e">${esc(b.teams[0].emoji)}</span><b style="color:var(--ca)">${esc(b.teams[0].name)}</b></div><i>VS</i><div class="bt-side r"><span class="bt-e">${esc(b.teams[1].emoji)}</span><b style="color:var(--cb)">${esc(b.teams[1].name)}</b></div></div>
        <div class="bt-item-tags">${(b.topics.length ? b.topics : ["all topics"]).slice(0, 4).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}<span class="small muted">${b.n} questions</span></div>
        <div class="bt-foot">${status(cls, lbl)}${win ? `<span class="small">🏆 <b>${esc(win.name)}</b></span>` : ""}${b.round > 1 ? `<span class="small muted">round ${b.round}</span>` : ""}<span class="small muted">${fmtAgo(b.created_at)}</span></div></a>`;
    }).join("")}</div>`
    : `<section class="bt-empty"><div class="bt-dice">🎲</div><h2>No battle yet</h2><p class="muted">Create one: it takes a minute, and the class loves it.</p><button class="bt-cta" id="bt-new2">⚔️ Create the first battle</button></section>`}`;
  $("#bt-new").onclick = () => battleDialog(d);
  if ($("#bt-new2")) $("#bt-new2").onclick = () => battleDialog(d);
}

function teamBox(i, d, t) {
  return `<div class="bt-team" data-ti="${i}" style="--c:${t.color}">
    <div class="bt-team-head"><button type="button" class="bt-emo" data-emo="${i}" title="Change the emoji">${esc(t.emoji)}</button>
      <input type="text" class="bt-name" data-name="${i}" maxlength="30" value="${esc(t.name)}" aria-label="Team name"></div>
    <label>Players <span class="muted" data-mem="${i}"></span></label>
    <div data-pbox="${i}">${playerPicker(i, d, t.members)}</div>
    <div class="bt-colors">${BT_COLORS.map((c) => `<button type="button" data-col="${i}" data-c="${c}" style="background:${c}" aria-pressed="${c === t.color}" aria-label="Colour ${c}"></button>`).join("")}</div></div>`;
}
const playerPicker = (i, d, members) => tagSelect(`bt-p${i}`, (d.students || []).map((s) => ({ value: s.id, label: s.name })), members, { placeholder: "Type a student's name…", max: 40 });
/** Where the players can come from: the squads of each brief (latest first), the Teams, a random split. */
function squadSourceHtml(d) {
  const groups = (d.squads || []).map((b, bi) => `<optgroup label="${esc((b.week ? `S${b.week} · ` : "") + b.from)}">${b.squads.map((x, k) => `<option value="squad:${bi}:${k}">${esc(x.name)} (${x.members.length})</option>`).join("")}</optgroup>`).join("");
  const teams = (d.teams || []).filter((x) => x.members.length).map((x) => `<option value="team:${x.id}">${esc(x.name)} (${x.members.length})</option>`).join("");
  return `<div class="bt-src">
    <div><label for="bt-srcsel">Fill a team from a squad</label>
      <div class="toolbar" style="margin:0"><select id="bt-srcsel" style="flex:1"><option value="">${groups || teams ? "Pick a squad…" : "No squad yet (make squads in a brief)"}</option>${groups}${teams ? `<optgroup label="Teams">${teams}</optgroup>` : ""}</select>
        <button type="button" class="btn" data-fill="0">→ ${esc("A")}</button><button type="button" class="btn" data-fill="1">→ ${esc("B")}</button></div></div>
    <div><label>Or</label><button type="button" class="btn" id="bt-rand">🎲 Random teams from the class</button></div>
  </div>`;
}

function battleDialog(d, existing = null) {
  const teams = existing ? JSON.parse(JSON.stringify(existing.teams)) : [{ name: "Team A", emoji: "🦈", color: "#3b82f6", members: [] }, { name: "Team B", emoji: "🔥", color: "#ef4444", members: [] }];
  const st = existing?.settings || { seconds: 120, penalty: 8, topics: [], kinds: Object.keys(d.kinds), level: "easy", reward: 20, announce: true, lang: d.lang };
  const opts = d.topics.map((t) => ({ value: t, label: t }));
  openDialog(existing ? "Battle settings" : "⚔️ New squad battle", `
    <div class="bt-teams">${teamBox(0, d, teams[0])}<div class="bt-x">VS</div>${teamBox(1, d, teams[1])}</div>
    ${squadSourceHtml(d)}
    <p class="muted small" style="margin:4px 0 0">Players are optional: they get the points when their team wins. A student can't be in both teams.</p>
    ${existing ? "" : `<label>Topics <span class="muted">(languages, technologies…)</span></label>
    ${tagSelect("bt-topics", opts, st.topics.length ? st.topics : ["HTML", "CSS", "JavaScript"].filter((x) => d.topics.includes(x)), { allowNew: true, placeholder: "Add a topic (e.g. Flexbox, SQL joins)…" })}
    <label>Kinds of questions</label>
    <div class="chips" id="bt-kinds">${Object.entries(d.kinds).map(([k, v]) => `<button type="button" class="chip" data-kind="${k}" aria-pressed="${st.kinds.includes(k)}">${v.emoji} ${esc(v.en)}</button>`).join("")}</div>`}
    <div class="field-row">
      <div><label for="bt-sec">Clock per team</label><select id="bt-sec">${[60, 90, 120, 150, 180, 240, 300].map((s) => `<option value="${s}" ${s === st.seconds ? "selected" : ""}>${s >= 60 ? (s / 60) + " min" : s + " s"}</option>`).join("")}</select></div>
      <div><label for="bt-pen">Pass penalty</label><select id="bt-pen">${[0, 5, 8, 10, 15, 20].map((s) => `<option value="${s}" ${s === st.penalty ? "selected" : ""}>${s ? "−" + s + " s" : "none"}</option>`).join("")}</select></div>
      ${existing ? "" : `<div><label for="bt-n">Questions</label><select id="bt-n">${[20, 30, 40, 60].map((n) => `<option ${n === 40 ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div><label for="bt-lvl">Level</label><select id="bt-lvl"><option value="easy" ${st.level === "easy" ? "selected" : ""}>Easy</option><option value="medium" ${st.level === "medium" ? "selected" : ""}>Medium</option></select></div>`}
      <div><label for="bt-rw">Winners get</label><select id="bt-rw">${[0, 10, 20, 30, 50].map((s) => `<option value="${s}" ${s === st.reward ? "selected" : ""}>${s ? s + " pts each" : "no points"}</option>`).join("")}</select></div>
      <div><label for="bt-lang">Language</label><select id="bt-lang"><option value="fr" ${st.lang !== "en" ? "selected" : ""}>Français</option><option value="en" ${st.lang === "en" ? "selected" : ""}>English</option></select></div>
    </div>
    <label class="check"><input type="checkbox" id="bt-ann" ${st.announce ? "checked" : ""}> Post the result in #arena</label>
    <p class="small" id="bt-st"></p>`,
  [{ label: existing ? "Save" : "✨ Create the battle", primary: true, action: async () => {
    readTeams();
    const both = teams[0].members.filter((x) => teams[1].members.includes(x));
    if (both.length) throw new Error(`${both.map((x) => d.students.find((s) => s.id === x)?.name || x).join(", ")} can't be in both teams`);
    const settings = { seconds: Number($("#bt-sec").value), penalty: Number($("#bt-pen").value), reward: Number($("#bt-rw").value), announce: $("#bt-ann").checked, lang: $("#bt-lang").value };
    if (existing) {
      await api(`/battles/${existing.id}`, { method: "PUT", body: { teams, settings, title: `${teams[0].name} vs ${teams[1].name}` } });
      dlg.close(); toast("Saved"); viewBattle(existing.id); return;
    }
    const topics = tagValues(dlg, "bt-topics"), kinds = $$("[data-kind][aria-pressed=true]", dlg).map((b) => b.dataset.kind);
    if (!kinds.length) throw new Error("Pick at least one kind of question");
    $("#bt-st").textContent = "⏳ Writing the questions…";
    try {
      const g = await api("/battles/generate", { method: "POST", body: { topics, kinds, count: Number($("#bt-n").value), level: $("#bt-lvl").value, lang: settings.lang } });
      const b = await api("/battles", { method: "POST", body: { title: `${teams[0].name} vs ${teams[1].name}`, teams, questions: g.questions, settings: { ...settings, topics, kinds, level: $("#bt-lvl").value } } });
      dlg.close(); toast(g.ai ? `${g.questions.length} questions ready` : `${g.questions.length} built-in questions (the AI wasn't available)`); location.hash = `#/battle/${b.id}`;
    } catch (e) { $("#bt-st").textContent = ""; throw e; }
  } }]);
  dlg.classList.add("wide");
  wireTags(dlg, () => [0, 1].forEach((i) => memText(i)));
  $$("[data-kind]", dlg).forEach((b) => b.onclick = () => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")));
  const readTeams = () => [0, 1].forEach((i) => { teams[i].name = $(`[data-name="${i}"]`, dlg).value.trim() || teams[i].name; teams[i].members = tagValues(dlg, `bt-p${i}`); });
  const memText = (i) => { const n = tagValues(dlg, `bt-p${i}`).length; $(`[data-mem="${i}"]`, dlg).textContent = n ? `· ${n} player${n > 1 ? "s" : ""}` : "(optional)"; };
  const setPlayers = (i, ids, name) => {
    $(`[data-pbox="${i}"]`, dlg).innerHTML = playerPicker(i, d, ids);
    wireTags($(`[data-pbox="${i}"]`, dlg), () => memText(i));
    if (name) $(`[data-name="${i}"]`, dlg).value = name;
    memText(i);
  };
  $$("[data-fill]", dlg).forEach((btn) => btn.onclick = () => {
    const v = $("#bt-srcsel", dlg).value, i = Number(btn.dataset.fill);
    if (!v) { toast("Pick a squad first", true); return; }
    let ids = [], name = "";
    if (v.startsWith("team:")) { const t = d.teams.find((x) => String(x.id) === v.slice(5)); ids = t.members.map((m) => m.id); name = t.name; }
    else { const [, bi, k] = v.split(":"); const t = d.squads[Number(bi)].squads[Number(k)]; ids = t.members; name = t.name; }
    const other = tagValues(dlg, `bt-p${1 - i}`);
    setPlayers(i, ids.filter((x) => !other.includes(x)), name);
  });
  $("#bt-rand", dlg).onclick = () => {
    const all = (d.students || []).map((s) => s.id).sort(() => Math.random() - 0.5);
    if (all.length < 2) { toast("Not enough students in the class yet", true); return; }
    setPlayers(0, all.filter((_, k) => k % 2 === 0));
    setPlayers(1, all.filter((_, k) => k % 2 === 1));
  };
  [0, 1].forEach((i) => {
    memText(i);
    wireTags($(`[data-pbox="${i}"]`, dlg), () => memText(i));
    $(`[data-emo="${i}"]`, dlg).onclick = (e) => { const k = (BT_EMOJI.indexOf(teams[i].emoji) + 1) % BT_EMOJI.length; teams[i].emoji = BT_EMOJI[k]; e.currentTarget.textContent = BT_EMOJI[k]; };
    $$(`[data-col="${i}"]`, dlg).forEach((b) => b.onclick = () => {
      teams[i].color = b.dataset.c;
      $$(`[data-col="${i}"]`, dlg).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      $(`[data-ti="${i}"]`, dlg).style.setProperty("--c", b.dataset.c);
    });
  });
}

const fmtClock = (ms) => { const s = Math.ceil(Math.max(0, ms) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

async function viewBattle(id) {
  const [B, d] = await Promise.all([api(`/battles/${id}`), api("/battles")]);
  const K = d.kinds;
  const L = B.live;
  const [pc, pl] = BT_PHASE[L.phase] || ["pending", L.phase];
  view.innerHTML = `
    <div class="page-head"><div><div class="crumbs"><a href="#/games">Class games</a> › <a href="#/battles">Squad battle</a></div>
      <h1 class="bt-title"><span style="color:${esc(B.teams[0].color)}">${esc(B.teams[0].emoji)} ${esc(B.teams[0].name)}</span> <i>vs</i> <span style="color:${esc(B.teams[1].color)}">${esc(B.teams[1].emoji)} ${esc(B.teams[1].name)}</span></h1>
      <p class="sub">${esc(B.settings.topics.join(", ") || "all topics")} · ${fmtClock(B.settings.seconds * 1000)} per team · pass −${B.settings.penalty} s · ${B.questions.length} questions${B.settings.reward ? ` · winners +${B.settings.reward} pts` : ""}</p></div>
      <div class="toolbar" style="margin:0"><button class="btn" id="bt-edit">Settings</button><button class="btn danger" id="bt-del">Delete</button></div></div>
    <div class="bt-launch">
      <section class="panel bt-step"><div class="bt-num">1</div><div><h2>📺 Show it on the TV</h2><p class="small muted">Open this on the computer connected to the class TV, press <b>Full screen</b> and turn the <b>sound</b> on.</p>
        <div class="toolbar" style="margin:0"><a class="btn primary" href="${esc(B.tv)}" target="_blank" rel="noopener">📺 Open the TV screen</a><button class="btn" id="bt-cptv">Copy the link</button></div></div></section>
      <section class="panel bt-step"><div class="bt-num">2</div><div class="bt-judge"><div><h2>📱 Judge from your phone</h2><p class="small muted">Scan the code on the TV (or this one). The first phone that opens it becomes the judge; another phone needs the PIN.</p>
          <div class="bt-pin">PIN <b>${esc(B.pin)}</b></div>
          <div class="toolbar" style="margin:8px 0 0"><button class="btn small" id="bt-cpj">Copy the judge link</button>${B.judgeTaken ? `<button class="btn small" id="bt-free">Free the judge</button>` : ""}</div></div>
        <div class="bt-qr">${B.qr}</div></div></section>
      <section class="panel bt-step"><div class="bt-num">3</div><div style="flex:1"><h2>🎮 Live</h2>
        <div class="bt-live" id="bt-live">${liveHtml(B, L, pc, pl)}</div></div></section>
    </div>
    <section class="panel"><div class="panel-head"><h2>Questions <span class="muted">${B.questions.length}</span></h2>
      <div class="toolbar" style="margin:0"><button class="btn small" id="bt-addq">+ Add a question</button><button class="btn small" id="bt-more">✨ 10 more</button></div></div>
      <p class="small muted" style="margin-top:-6px">They come in a random order; the judge sees the answer. Remove the ones you don't like (not while a game is running).</p>
      <div class="bt-qs">${B.questions.map((q, i) => `<div class="bt-q"><span class="bt-k" title="${esc(K[q.kind]?.en || q.kind)}">${K[q.kind]?.emoji || "❓"}</span>
        <div><div><b>${esc(q.prompt)}</b> <span class="tag">${esc(q.topic)}</span></div>${q.code ? `<pre class="code small">${esc(q.code)}</pre>` : ""}${q.options ? `<div class="small muted">${q.options.map((o, k) => `${"ABCD"[k]}. ${esc(o)}`).join(" · ")}</div>` : ""}
        <div class="small">✅ <b>${esc(q.answer)}</b>${q.explain ? ` <span class="muted">· ${esc(q.explain)}</span>` : ""}</div></div>
        <button class="icon-x" data-rmq="${i}" title="Remove" aria-label="Remove">✕</button></div>`).join("")}</div>
    </section>`;
  $("#bt-cptv").onclick = () => copyText(B.tv, "TV link copied");
  $("#bt-cpj").onclick = () => copyText(B.judge, "Judge link copied");
  if ($("#bt-free")) $("#bt-free").onclick = () => busy($("#bt-free"), async () => { await api(`/battles/${id}/judge-reset`, { method: "POST" }); toast("The next phone that opens the link becomes the judge"); viewBattle(id); });
  $("#bt-edit").onclick = () => battleDialog(d, B);
  $("#bt-del").onclick = () => confirmDialog("Delete this battle?", "The TV and the judge links stop working.", "Delete", async () => { await api(`/battles/${id}`, { method: "DELETE" }); location.hash = "#/battles"; }, true);
  const saveQs = async (qs) => { await api(`/battles/${id}`, { method: "PUT", body: { questions: qs } }); viewBattle(id); };
  $$("[data-rmq]").forEach((b) => b.onclick = () => busy(b, () => saveQs(B.questions.filter((_, i) => i !== Number(b.dataset.rmq)))));
  $("#bt-more").onclick = (e) => busy(e.currentTarget, async () => {
    const g = await api("/battles/generate", { method: "POST", body: { ...B.settings, count: 10, battle: id } });
    await saveQs([...B.questions, ...g.questions]); toast(g.questions.length ? `${g.questions.length} new question(s) added` : "No new question found: try other topics", !g.questions.length);
  });
  $("#bt-addq").onclick = () => {
    openDialog("Add a question", `
      <label for="aq-k">Kind</label><select id="aq-k">${Object.entries(K).map(([k, v]) => `<option value="${k}">${v.emoji} ${esc(v.en)}</option>`).join("")}</select>
      <label for="aq-t">Topic</label><input type="text" id="aq-t" value="${esc(B.settings.topics[0] || "")}" style="width:100%">
      <label for="aq-p">Question</label><input type="text" id="aq-p" style="width:100%" maxlength="240" placeholder="e.g. What does this code print?">
      <label for="aq-c">Code <span class="muted">(optional, ___ for a blank)</span></label><textarea id="aq-c" style="min-height:90px;font-family:var(--mono,monospace)"></textarea>
      <label for="aq-a">Answer <span class="muted">(only the judge sees it)</span></label><input type="text" id="aq-a" style="width:100%" maxlength="160">`,
    [{ label: "Add", primary: true, action: async () => {
      const q = { kind: $("#aq-k").value, topic: $("#aq-t").value, prompt: $("#aq-p").value, code: $("#aq-c").value, answer: $("#aq-a").value };
      if (!q.prompt.trim() || !q.answer.trim()) throw new Error("Write the question and its answer");
      dlg.close(); await saveQs([...B.questions, q]);
    } }]);
  };
  // the live state while the page is open
  clearInterval(btTimer);
  btTimer = setInterval(async () => {
    if (!document.body.contains($("#bt-live"))) { clearInterval(btTimer); return; }
    try { const x = await api(`/battles/${id}`); const [c, l] = BT_PHASE[x.live.phase] || ["pending", x.live.phase]; $("#bt-live").innerHTML = liveHtml(x, x.live, c, l); } catch { /* keep the last one */ }
  }, 3000);
}

function liveHtml(B, L, pc, pl) {
  return `<div class="bt-scores">${[0, 1].map((t) => `<div class="bt-sc ${L.running === t ? "on" : ""}" style="--c:${esc(B.teams[t].color)}">
      <span>${esc(B.teams[t].emoji)} ${esc(B.teams[t].name)}</span><b>${fmtClock(L.left[t])}</b><small>✅ ${L.stats.ok[t]} · ⏭️ ${L.stats.pass[t]}${L.best[t] >= 3 ? ` · 🔥 ${L.best[t]}` : ""}</small></div>`).join("")}</div>
    <div class="small" style="margin-top:8px">${status(pc, pl)} ${L.judge ? `<span class="ok-text">📱 judge connected</span>` : `<span class="muted">📱 no judge yet</span>`}${L.round > 1 ? ` · round ${L.round}` : ""}${L.phase === "over" && L.winner != null ? ` · 🏆 <b>${esc(B.teams[L.winner].name)}</b>` : ""}</div>`;
}

Object.assign(routes, { battles: viewBattles, battle: (id) => viewBattle(Number(id)) });
