/* ClassBot dashboard: 🎮 Class games. A hub (#/games) and a page per game (#/games/royale | sql | relay; the squad
   battle keeps its own page). Battle Royale quiz, SQL Detective and Code Relay play on the class TV and the students'
   own phones / laptops (each one opens their own link from Discord: the 🎮 Join button or /play). Loaded after battle.js. */
"use strict";

Object.assign(REASON, { game: "Class game" });
const GM_PHASE = { lobby: ["pending", "Waiting for players"], question: ["active", "Live"], reveal: ["active", "Live"], playing: ["active", "Live"], testing: ["active", "Running the tests"], over: ["solved", "Finished"] };
const GM_MODES = { solo: ["👤", "Solo", "Everyone for themselves"], squads: ["🛡️", "Squads", "The class's squads"], random: ["🎲", "Random squads", "Made at the start from who joined"] };
const GM_LEVEL = { easy: "Easy", medium: "Medium", hard: "Hard" };
const GM_INFO = {
  royale: { name: "Battle Royale", art: "👑", tag: "Quiz · everyone at once", device: "Phones",
    pitch: "Everyone answers the same question on their phone. A wrong answer knocks you out; <b>the last one standing wins.</b> In squads, right answers earn points to bring a teammate back.",
    learn: "Quick recall of any topic, under pressure",
    steps: [["🧩", "Pick the questions", "The AI writes them on your topics, or take an assessment's multiple-choice questions."], ["📺", "Open the TV screen", "Full screen, sound on. The students click 🎮 Join in Discord (or type /play): their own link, under their name."], ["💀", "Survive!", "A countdown per question; the TV shows the votes and who is out. Space bar = next question."]] },
  sql: { name: "SQL Detective", art: "🕵️", tag: "SQL · investigation", device: "Laptops",
    pitch: "A mystery hidden in a database. Squads run <b>real SQL</b> in the browser; each right result unlocks the next clue. <b>Name the culprit first to win.</b>",
    learn: "SELECT, WHERE, JOIN, GROUP BY, HAVING",
    steps: [["🗂️", "Pick a case", "A built-in case, a new one by the AI, or your own: ClassBot runs every solution query to check it."], ["📺", "Open the TV screen", "The story on the TV; the squads join from their laptops."], ["🔎", "Investigate", "Each right query unlocks a clue. Hints cost time; a wrong accusation costs more."]] },
  relay: { name: "Code Relay", art: "🏃", tag: "Code · team relay", device: "Laptops",
    pitch: "Each squad member writes the same function in turn (5 min ÷ squad size each), <b>without talking</b>: the mics listen. The tests run at the end; <b>the most tests passed wins.</b>",
    learn: "Reading someone else's code, writing clear code",
    steps: [["🧠", "Pick a challenge", "In JavaScript, Python or PHP: a built-in one, one by the AI (checked by running it), or your own."], ["🎤", "Mics on, mouths shut", "Each writer gets the code as the last one left it. A voice near a laptop is a strike."], ["🧪", "The tests decide", "At the end every squad's code runs on the hidden tests; the TV shows the ranking."]] },
};
let gmTimer = null;
window.addEventListener("hashchange", () => { clearInterval(gmTimer); gmTimer = null; });

function gameItem(d, x) {
  const [cls, lbl] = GM_PHASE[x.phase] || ["pending", x.phase];
  return `<a class="bt-item gm-item gm-k-${x.kind}" href="#/game/${x.id}"><div class="gm-item-top"><span class="gm-item-art">${GM_INFO[x.kind]?.art || "🎮"}</span><div><b>${esc(x.title)}</b><div class="small muted">${esc(GM_INFO[x.kind]?.name || x.kind)} · ${GM_MODES[x.mode]?.[1] || x.mode}</div></div></div>
    <div class="bt-foot">${status(cls, lbl)}<span class="small">👥 ${x.players}</span><span class="small muted">${fmtAgo(x.created_at)}</span></div></a>`;
}
function battleItem(b) {
  const [cls, lbl] = BT_PHASE[b.phase] || ["pending", b.phase];
  const win = b.phase === "over" && b.winner != null ? b.teams[b.winner] : null;
  return `<a class="bt-item gm-item gm-k-battle" href="#/battle/${b.id}"><div class="gm-item-top"><span class="gm-item-art">⚔️</span><div><b>${esc(b.teams[0].name)} vs ${esc(b.teams[1].name)}</b><div class="small muted">Squad battle · ${b.n} questions</div></div></div>
    <div class="bt-foot">${status(cls, lbl)}${win ? `<span class="small">🏆 <b>${esc(win.name)}</b></span>` : ""}<span class="small muted">${fmtAgo(b.created_at)}</span></div></a>`;
}

async function viewGames() {
  const d = await api("/games");
  const all = [...d.items.map((x) => ({ at: x.created_at, html: gameItem(d, x) })), ...(d.battles || []).map((b) => ({ at: b.created_at, html: battleItem(b) }))].sort((a, b) => b.at - a.at);
  const cards = [
    ...Object.keys(d.kinds).map((k) => ({ href: `#/games/${k}`, art: GM_INFO[k].art, tag: GM_INFO[k].tag, name: GM_INFO[k].name, pitch: GM_INFO[k].pitch, learn: GM_INFO[k].learn, modes: d.kinds[k].modes.map((m) => `${GM_MODES[m][0]} ${GM_MODES[m][1]}`), device: GM_INFO[k].device, n: d.items.filter((x) => x.kind === k).length, k })),
    { href: "#/battles", art: "⚔️", tag: "Quiz · two teams out loud", name: "Squad battle", pitch: "Two teams, one clock each. A question on the TV, the team answers out loud, you judge from your phone. <b>The first clock at 0 loses.</b>", learn: "Any topic, out loud, as a team", modes: ["🛡️ Two teams"], device: "Your phone", n: (d.battles || []).length, k: "battle" },
  ];
  view.innerHTML = `
    <section class="bt-hero gm-hero">
      <div class="bt-hero-text">
        <span class="bt-kicker">🎮 Play and learn · on the TV and their devices</span>
        <h1>Class games</h1>
        <p>Pick a game, show it on the class TV, and the students join from <b>Discord</b> (🎮 Join or <code>/play</code>) with their own link, so nobody can play as someone else. Solo, with the class's squads, or random squads. <b>The winners get points.</b></p>
      </div>
      <div class="bt-hero-art" aria-hidden="true"><div class="gm-art">👑</div><div class="gm-art b">🕵️</div><div class="gm-art c">🏃</div><div class="gm-art d">⚔️</div></div>
    </section>
    <div class="gm-cards">${cards.map((c) => `<a class="gm-card gm-k-${c.k}" href="${c.href}">
      <span class="gm-card-art">${c.art}</span><span class="bt-kicker">${esc(c.tag)}</span><b>${esc(c.name)}</b>
      <span class="small">${c.pitch}</span><span class="small muted">📚 ${esc(c.learn)} · 💻 ${esc(c.device)}</span>
      <span class="gm-modes">${c.modes.map((m) => `<span class="tag">${esc(m)}</span>`).join("")}</span>
      <span class="gm-card-go">${c.n ? `${c.n} game${c.n > 1 ? "s" : ""} · ` : ""}Open →</span></a>`).join("")}</div>
    ${all.length ? `<div class="panel-head" style="margin:18px 0 10px"><h2 style="margin:0">Your games</h2></div><div class="bt-list">${all.map((x) => x.html).join("")}</div>` : ""}`;
}

/** The page of one game: its own hero, how it works, the button to make one, its games, its library. */
async function viewGameKind(kind) {
  const d = await api("/games");
  const I = GM_INFO[kind];
  const mine = d.items.filter((x) => x.kind === kind);
  const live = mine.filter((x) => !["lobby", "over"].includes(x.phase)).length, done = mine.filter((x) => x.phase === "over").length;
  const art = kind === "royale" ? `<div class="gm-royale-art"><div class="gm-crown">👑</div><div class="gm-dots">${Array.from({ length: 15 }, (_, i) => `<i class="${[1, 4, 6, 9, 10, 13].includes(i) ? "out" : i === 7 ? "win" : ""}"></i>`).join("")}</div><div class="gm-alive">9 alive</div></div>`
    : kind === "sql" ? `<div class="gm-sql-art"><div class="gm-tbl"><div class="h"><span>personne</span><span>porte</span><span>heure</span></div><div><span>Yassine</span><span>bureau</span><span>15:05</span></div><div class="hit"><span>Omar</span><span>bureau</span><span>15:24</span></div><div><span>Salma</span><span>cuisine</span><span>15:12</span></div></div><div class="gm-lens">🔎</div></div>`
    : `<div class="gm-relay-art"><div class="gm-run"><span class="on">✍️ Yasmine</span><b>→</b><span>Omar</span><b>→</b><span>Lina</span></div><div class="gm-code">for (let i = 0; i &lt; n; i++) {<br>&nbsp;&nbsp;<i>|</i></div><div class="gm-timer">⏱ 0:42 · 🤫</div></div>`;
  view.innerHTML = `
    <div class="crumbs" style="margin-bottom:8px"><a href="#/games">Class games</a></div>
    <section class="bt-hero gm-hero gm-hero-${kind}">
      <div class="bt-hero-text">
        <span class="bt-kicker">${I.art} ${esc(I.tag)} · ${esc(I.device)}</span>
        <h1>${esc(I.name)}</h1>
        <p>${I.pitch}</p>
        <div class="bt-hero-actions"><button class="bt-cta gm-cta" id="gm-new">＋ New ${esc(I.name)}</button>${mine.length ? `<span class="bt-hero-stat"><b>${mine.length}</b> game${mine.length > 1 ? "s" : ""} · <b>${done}</b> played${live ? ` · <b class="bt-live-dot">${live} live</b>` : ""}</span>` : ""}</div>
      </div>
      <div class="bt-hero-art" aria-hidden="true">${art}</div>
    </section>
    <div class="bt-steps">${I.steps.map(([ic, h, p], i) => `<div class="bt-stepcard"><span class="bt-step-n">${i + 1}</span><div class="bt-step-ic">${ic}</div><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div>
    ${mine.length ? `<div class="panel-head" style="margin:6px 0 10px"><h2 style="margin:0">Your ${esc(I.name)} games</h2></div><div class="bt-list">${mine.map((x) => gameItem(d, x)).join("")}</div>`
      : `<section class="bt-empty"><div class="bt-dice">${I.art}</div><h2>No ${esc(I.name)} yet</h2><p class="muted">Create one: it takes a minute.</p><button class="bt-cta gm-cta gm-cta-${kind}" id="gm-new2">＋ Create the first one</button></section>`}
    ${kind === "sql" ? `<div class="panel-head" style="margin:22px 0 10px"><h2 style="margin:0">Cases</h2><span class="small muted">built-in, and the ones you wrote or generated</span></div>
      <div class="gm-lib">${[...d.cases.map((c) => ({ ...c, by: "builtin" })), ...(d.myCases || []).map((c, i) => ({ ...c, mine: i, steps: c.steps.length }))].map((c) => `<div class="gm-libcard"><div><b>${esc(c.title)}</b> <span class="tag">${c.shared ? `📚 ${esc(typeof c.shared === "string" ? c.shared : "shared")}` : c.mine != null ? "✍️ yours" : GM_LEVEL[c.level] || ""}</span></div><p class="small muted">${c.steps} clues · ${(c.notions || []).map(esc).join(", ")}</p><p class="small">${esc((c.story || "").slice(0, 180))}${(c.story || "").length > 180 ? "…" : ""}</p><button class="btn small" ${c.mine != null ? `data-playcase="${c.mine}"` : `data-playbuilt="${esc(c.id)}"`}>▶ Play this case</button></div>`).join("")}</div>` : ""}
    ${kind === "relay" ? `<div class="panel-head" style="margin:22px 0 10px"><h2 style="margin:0">Challenges</h2><span class="small muted">built-in, and the ones you wrote or generated</span></div>
      <div class="gm-lib">${[...d.tasks.map((t) => ({ ...t })), ...(d.myTasks || []).map((t, i) => ({ ...t, mine: i, tests: t.tests.length }))].map((t) => `<div class="gm-libcard"><div><b>${esc(t.title)}</b> <span class="tag">${t.shared ? `📚 ${esc(typeof t.shared === "string" ? t.shared : "shared")}` : t.mine != null ? (t.by === "ai" ? "✨ AI" : "✍️ yours") : GM_LEVEL[t.level] || ""}</span></div><p class="small muted"><code>${esc(t.fn)}()</code> · ${t.tests} tests</p><p class="small">${esc((t.text || "").slice(0, 170))}${(t.text || "").length > 170 ? "…" : ""}</p><button class="btn small" ${t.mine != null ? `data-playtask="${t.mine}"` : `data-playbuilt="${t.i}"`}>▶ Play this challenge</button></div>`).join("")}</div>` : ""}`;
  const open = (pre) => gameDialog(d, kind, pre);
  $("#gm-new").onclick = () => open();
  if ($("#gm-new2")) $("#gm-new2").onclick = () => open();
  $$("[data-playbuilt]").forEach((b) => b.onclick = () => open(kind === "sql" ? { caseId: b.dataset.playbuilt } : { taskIndex: Number(b.dataset.playbuilt) }));
  $$("[data-playcase]").forEach((b) => b.onclick = () => open({ myCase: Number(b.dataset.playcase) }));
  $$("[data-playtask]").forEach((b) => b.onclick = () => open({ myTask: Number(b.dataset.playtask) }));
}

function gameDialog(d, kind, pre = {}) {
  const I = GM_INFO[kind];
  const modes = d.kinds[kind].modes;
  const sets = d.squads || [];
  const topicOpts = (d.topics || []).map((t) => ({ value: t, label: t }));
  // the challenge / the case chosen so far (generated, written, or made before)
  let picked = null;
  const srcChips = (id, list) => `<div class="chips" id="${id}">${list.map(([v, l], i) => `<button type="button" class="chip" data-${id}="${v}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div>`;
  openDialog(`${I.art} New ${I.name}`, `
    <label>Who plays</label>
    <div class="chips" id="gm-mode">${modes.map((m, i) => `<button type="button" class="chip" data-mode="${m}" aria-pressed="${i === 0}" title="${esc(GM_MODES[m][2])}">${GM_MODES[m][0]} ${GM_MODES[m][1]}</button>`).join("")}</div>
    <div id="gm-sq" hidden><label for="gm-set">Squads</label><select id="gm-set">${sets.length ? sets.map((s, i) => `<option value="${i}">${esc((s.week ? `S${s.week} · ` : "") + s.from)} (${s.squads.length} squads)</option>`).join("") : `<option value="">No squads yet: make them in Teams &amp; squads or in a brief</option>`}</select>
      <p class="small muted" id="gm-sqtxt"></p></div>
    <div id="gm-size" hidden><label for="gm-sz">Players per squad</label><select id="gm-sz">${[2, 3, 4, 5, 6].map((n) => `<option ${n === 4 ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    ${kind === "royale" ? `
      <label>Questions</label>
      <div class="chips" id="gm-src"><button type="button" class="chip" data-src="ai" aria-pressed="true">✨ AI on topics</button>${d.assessments.length ? `<button type="button" class="chip" data-src="assess" aria-pressed="false">📝 From an assessment</button>` : ""}${(d.royaleSets || []).length ? `<button type="button" class="chip" data-src="lib" aria-pressed="false">📚 Shared library</button>` : ""}</div>
      <div id="gm-ai">${tagSelect("gm-topics", topicOpts, ["HTML", "CSS", "JavaScript"].filter((x) => d.topics.includes(x)), { allowNew: true, placeholder: "Add a topic (e.g. Flexbox, SQL joins)…" })}
        <div class="field-row"><div><label for="gm-n">How many</label><select id="gm-n">${[15, 20, 30, 40].map((n) => `<option ${n === 20 ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <div><label for="gm-lvl">Level</label><select id="gm-lvl"><option value="easy">Easy</option><option value="medium">Medium</option></select></div></div></div>
      <div id="gm-lib" hidden><label for="gm-lsel">Question set <span class="muted">(made in your classes and the other classes of the library)</span></label><select id="gm-lsel">${(d.royaleSets || []).map((x, i) => `<option value="${i}">${esc(x.title || "Questions")} · ${x.n} questions${x.by ? ` · ${esc(x.by)}` : ""}</option>`).join("")}</select></div>
      <div id="gm-as" hidden><label for="gm-asel">Assessment <span class="muted">(its multiple-choice questions with one right answer)</span></label><select id="gm-asel">${d.assessments.map((a) => `<option value="${a.id}">${esc(a.title)} · ${a.mcq} question${a.mcq > 1 ? "s" : ""}</option>`).join("")}</select></div>
      <div class="field-row"><div><label for="gm-sec">Time per question</label><select id="gm-sec">${[10, 15, 20, 30, 45].map((s) => `<option value="${s}" ${s === 20 ? "selected" : ""}>${s} s</option>`).join("")}</select></div>
        <div><label for="gm-rc">Bring a teammate back</label><select id="gm-rc">${[2, 3, 4, 5].map((s) => `<option value="${s}" ${s === 3 ? "selected" : ""}>${s} squad points</option>`).join("")}</select></div></div>` : ""}
    ${kind === "sql" ? `
      <label>The case</label>
      ${srcChips("csrc", [["built", "📚 Built-in"], ["ai", "✨ Generate with AI"], ["own", "✍️ Write my own"], ...((d.myCases || []).length ? [["mine", "🗂 Made before"]] : [])])}
      <div data-cpane="built"><div class="gm-pick">${d.cases.map((c, i) => `<label class="gm-opt"><input type="radio" name="gm-case" value="${esc(c.id)}" ${(pre.caseId ? c.id === pre.caseId : i === 0) ? "checked" : ""}><span><b>${esc(c.title)}</b> <span class="tag">${GM_LEVEL[c.level]}</span><br><span class="small muted">${c.steps} clues · ${c.notions.map(esc).join(", ")}</span><br><span class="small">${esc(c.story)}</span></span></label>`).join("")}</div></div>
      <div data-cpane="ai" hidden><label for="gm-cp">Your idea <span class="muted">(optional: a place, a theme, the SQL notions to practise)</span></label><textarea id="gm-cp" style="min-height:60px" placeholder="e.g. a stolen laptop at the hackathon, with JOIN and GROUP BY"></textarea>
        <div class="field-row"><div><label for="gm-cl">Level</label><select id="gm-cl"><option value="easy">Easy (WHERE, ORDER BY, one JOIN)</option><option value="medium">Medium (JOINs, GROUP BY, HAVING)</option></select></div><div style="align-self:end"><button type="button" class="btn primary" id="gm-cgen">✨ Generate a case</button></div></div></div>
      <div data-cpane="own" hidden>
        <p class="small muted">Write the database and the steps. ClassBot runs each solution query on your database to get the expected result (the students' query must give the same rows and the columns you name).</p>
        <div class="field-row"><div><label for="gm-ot">Title</label><input type="text" id="gm-ot" style="width:100%" placeholder="Le vol du badge"></div><div><label for="gm-ocu">The culprit (first and last name)</label><input type="text" id="gm-ocu" style="width:100%"></div></div>
        <label for="gm-ost">The story <span class="muted">(shown to the students)</span></label><textarea id="gm-ost" style="min-height:60px"></textarea>
        <label for="gm-osc">The database <span class="muted">(CREATE TABLE … ; INSERT INTO … ;)</span></label><textarea id="gm-osc" style="min-height:130px;font-family:var(--mono,monospace)" placeholder="CREATE TABLE badges (nom TEXT, salle TEXT, heure TEXT);&#10;INSERT INTO badges VALUES ('Ali Ben', 'labo', '10:05'), ('Sara Lou', 'cdi', '10:20');"></textarea>
        <label>The steps</label><div id="gm-osteps"></div><button type="button" class="btn small" id="gm-oadd">＋ Add a step</button>
        <label for="gm-oend">The ending <span class="muted">(shown when solved)</span></label><input type="text" id="gm-oend" style="width:100%">
        <div style="margin-top:10px"><button type="button" class="btn primary" id="gm-ocheck">✔ Check my case</button></div></div>
      <div data-cpane="mine" hidden><select id="gm-mc">${(d.myCases || []).map((c, i) => `<option value="${i}" ${pre.myCase === i ? "selected" : ""}>${esc(c.title)} · ${c.steps.length} clues</option>`).join("")}</select></div>
      <div id="gm-cprev"></div>
      <div class="field-row"><div><label for="gm-hp">A hint costs</label><select id="gm-hp">${[0, 30, 60, 120].map((s) => `<option value="${s}" ${s === 60 ? "selected" : ""}>${s ? "+" + s + " s" : "nothing"}</option>`).join("")}</select></div>
        <div><label for="gm-wp">A wrong accusation costs</label><select id="gm-wp">${[60, 120, 180, 300].map((s) => `<option value="${s}" ${s === 120 ? "selected" : ""}>+${s / 60} min</option>`).join("")}</select></div></div>` : ""}
    ${kind === "relay" ? `
      <div class="field-row"><div><label for="gm-cl2">Language</label><select id="gm-cl2">${Object.entries(d.langs || { javascript: "JavaScript" }).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></div><div></div></div>
      <label>The challenge</label>
      ${srcChips("tsrc", [["built", "📚 Built-in"], ["ai", "✨ Generate with AI"], ["own", "✍️ Write my own"], ...((d.myTasks || []).length ? [["mine", "🗂 Made before"]] : [])])}
      <div data-tpane="built"><select id="gm-task">${["hard", "medium", "easy"].map((lv) => `<optgroup label="${GM_LEVEL[lv]}">${d.tasks.filter((t) => t.level === lv).map((t) => `<option value="${t.i}" ${pre.taskIndex === t.i ? "selected" : ""}>${esc(t.title)} · ${esc(t.fn)}() · ${t.tests} tests</option>`).join("")}</optgroup>`).join("")}</select><p class="small muted" id="gm-tasktxt"></p></div>
      <div data-tpane="ai" hidden><label for="gm-tp">Your idea <span class="muted">(optional: leave it empty and the AI picks one for the level)</span></label><textarea id="gm-tp" style="min-height:60px" placeholder="e.g. something with objects and sorting, about a football league"></textarea>
        <div class="field-row"><div><label for="gm-tl">Level</label><select id="gm-tl"><option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option></select></div><div style="align-self:end"><button type="button" class="btn primary" id="gm-tgen">✨ Generate a challenge</button></div></div></div>
      <div data-tpane="own" hidden>
        <label for="gm-ott">What to write <span class="muted">(the statement for the students)</span></label><textarea id="gm-ott" style="min-height:70px" placeholder="Écris la fonction double(n) qui renvoie n × 2."></textarea>
        <div class="field-row"><div><label for="gm-of">Function name</label><input type="text" id="gm-of" placeholder="double" style="width:100%"></div><div><label for="gm-op">Parameters <span class="muted">(comma-separated)</span></label><input type="text" id="gm-op" placeholder="n" style="width:100%"></div></div>
        <label for="gm-ots">Tests <span class="muted">(one per line: the arguments as JSON, then =&gt; the expected result; the first two are shown to the students)</span></label>
        <textarea id="gm-ots" style="min-height:110px;font-family:var(--mono,monospace)" placeholder='[2] => 4&#10;[0] => 0&#10;[-3] => -6&#10;[1.5] => 3'></textarea></div>
      <div data-tpane="mine" hidden><select id="gm-mt">${(d.myTasks || []).map((t, i) => `<option value="${i}" ${pre.myTask === i ? "selected" : ""}>${esc(t.title)} · ${esc(t.fn)}() · ${t.tests.length} tests</option>`).join("")}</select></div>
      <div id="gm-tprev"></div>
      <div class="field-row"><div><label for="gm-tot">Time per round</label><select id="gm-tot">${[180, 240, 300, 420, 600, 900].map((s) => `<option value="${s}" ${s === 300 ? "selected" : ""}>${s / 60} min (÷ squad size each)</option>`).join("")}</select></div>
        <div><label for="gm-rounds">Rounds</label><select id="gm-rounds">${[1, 2, 3].map((n) => `<option>${n}</option>`).join("")}</select></div></div>
      <label class="check"><input type="checkbox" id="gm-noise" checked> 🎤 No talking: the microphones listen</label>
      <div class="field-row" id="gm-noiseopts"><div><label for="gm-sens">Sensitivity</label><select id="gm-sens"><option value="low">Low (only loud talking)</option><option value="medium" selected>Medium</option><option value="high">High (even whispers)</option></select></div>
        <div><label for="gm-str">Out after</label><select id="gm-str">${[1, 2, 3, 5].map((n) => `<option value="${n}" ${n === 3 ? "selected" : ""}>${n} strike${n > 1 ? "s" : ""}</option>`).join("")}</select></div></div>
      <p class="small muted" style="margin-top:0">Each student's device listens; a voice near it gives the squad a strike. On the TV, click a squad's strikes to cancel a false one.</p>` : ""}
    <div class="field-row"><div><label for="gm-rw">Winners get</label><select id="gm-rw">${[0, 10, 20, 30, 50].map((s) => `<option value="${s}" ${s === 20 ? "selected" : ""}>${s ? s + " pts each" : "no points"}</option>`).join("")}</select></div>
      <div><label for="gm-lang">Language of the game</label><select id="gm-lang"><option value="fr" ${d.lang !== "en" ? "selected" : ""}>Français</option><option value="en" ${d.lang === "en" ? "selected" : ""}>English</option></select></div></div>
    <label class="check"><input type="checkbox" id="gm-ann" checked> Post the winners in #arena</label>
    <p class="small" id="gm-st"></p>`,
  [{ label: `✨ Create the game`, primary: true, action: async () => {
    const mode = $("[data-mode][aria-pressed=true]", dlg).dataset.mode;
    const settings = { reward: Number($("#gm-rw").value), lang: $("#gm-lang").value, announce: $("#gm-ann").checked, size: Number($("#gm-sz").value) };
    const body = { kind, mode, settings };
    if (mode === "squads") {
      const set = sets[Number($("#gm-set").value)];
      if (!set) throw new Error("No squads yet: pick Solo or Random squads, or make squads first");
      body.squads = set.squads;
    }
    if (kind === "royale") {
      Object.assign(settings, { seconds: Number($("#gm-sec").value), reviveCost: Number($("#gm-rc").value) });
      const fromAs = $("[data-src=assess][aria-pressed=true]", dlg);
      const fromLib = $("[data-src=lib][aria-pressed=true]", dlg);
      if (fromLib) { body.questions = d.royaleSets[Number($("#gm-lsel").value)].questions; body.fromLibrary = true; }
      else {
      body.fromAssessment = !!fromAs;
      $("#gm-st").textContent = fromAs ? "⏳ Reading the assessment…" : "⏳ Writing the questions…";
      try {
        const q = await api("/games/questions", { method: "POST", body: fromAs ? { assessment: Number($("#gm-asel").value) } : { topics: tagValues(dlg, "gm-topics"), count: Number($("#gm-n").value), level: $("#gm-lvl").value, lang: settings.lang } });
        if (q.questions.length < 3) throw new Error("Not enough questions with choices: try other topics");
        body.questions = q.questions;
        if (!fromAs && !q.ai) toast("The AI wasn't available: built-in questions are used");
      } catch (e) { $("#gm-st").textContent = ""; throw e; }
      }
    }
    if (kind === "sql") {
      Object.assign(settings, { hintPenalty: Number($("#gm-hp").value), wrongPenalty: Number($("#gm-wp").value) });
      const src = pane("csrc");
      if (src === "built") settings.caseId = $("[name=gm-case]:checked", dlg).value;
      else if (src === "mine") body.case = d.myCases[Number($("#gm-mc").value)];
      else { if (!picked) throw new Error(src === "ai" ? "Generate a case first" : "Check your case first"); body.case = picked; }
    }
    if (kind === "relay") {
      Object.assign(settings, { codeLang: $("#gm-cl2").value, total: Number($("#gm-tot").value), rounds: Number($("#gm-rounds").value), noise: $("#gm-noise").checked, sensitivity: $("#gm-sens").value, strikes: Number($("#gm-str").value) });
      const src = pane("tsrc");
      if (src === "built") body.taskIndex = Number($("#gm-task").value);
      else if (src === "mine") body.task = d.myTasks[Number($("#gm-mt").value)];
      else if (src === "own") body.task = ownTask();
      else { if (!picked) throw new Error("Generate a challenge first"); body.task = picked; }
    }
    const g = await api("/games", { method: "POST", body });
    dlg.close(); toast("Game ready: open the TV screen"); location.hash = `#/game/${g.id}`;
  } }]);
  dlg.classList.add("wide");
  if (kind === "royale") wireTags(dlg);
  const setMode = (m) => {
    $$("[data-mode]", dlg).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
    $("#gm-sq", dlg).hidden = m !== "squads"; $("#gm-size", dlg).hidden = m !== "random";
  };
  $$("[data-mode]", dlg).forEach((b) => b.onclick = () => setMode(b.dataset.mode));
  setMode(modes[0]);
  const sqText = () => { const s = sets[Number($("#gm-set").value)]; $("#gm-sqtxt").textContent = s ? s.squads.map((x) => `${x.name} (${x.members.length})`).join(" · ") : ""; };
  if ($("#gm-set")) { $("#gm-set").onchange = sqText; sqText(); }
  $$("[data-src]", dlg).forEach((b) => b.onclick = () => {
    $$("[data-src]", dlg).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $("#gm-ai").hidden = b.dataset.src !== "ai"; $("#gm-as").hidden = b.dataset.src !== "assess"; if ($("#gm-lib")) $("#gm-lib").hidden = b.dataset.src !== "lib";
  });
  // the source chips (built-in / AI / my own / made before) show their pane
  function pane(id) { return $(`[data-${id}][aria-pressed=true]`, dlg)?.getAttribute(`data-${id}`); }
  const wireSrc = (id, attr, prev, start) => {
    const show = (v) => {
      $$(`[data-${id}]`, dlg).forEach((x) => x.setAttribute("aria-pressed", String(x.getAttribute(`data-${id}`) === v)));
      $$(`[data-${attr}]`, dlg).forEach((p) => { p.hidden = p.getAttribute(`data-${attr}`) !== v; });
      picked = null; $(prev).innerHTML = "";
      if (v === "mine") $(`#${id === "csrc" ? "gm-mc" : "gm-mt"}`).onchange();
    };
    $$(`[data-${id}]`, dlg).forEach((b) => b.onclick = () => show(b.getAttribute(`data-${id}`)));
    show(start);
  };
  if (kind === "sql") {
    const prevCase = (c, dropped) => `<div class="gm-prev"><b>🕵️ ${esc(c.title)}</b> <span class="tag">${c.steps.length} clues</span><p class="small">${esc(c.story)}</p>
      <ol class="small">${c.steps.map((s) => `<li><b>${esc(s.title)}</b> · ${esc(s.clue)} <span class="muted">(${s.expect.rows} row${s.expect.rows > 1 ? "s" : ""})</span></li>`).join("")}</ol>
      <p class="small">🎯 ${esc(c.question)} <span class="gm-spoil" title="Hover to see">${esc(c.culprit[0])}</span></p>${dropped?.length ? `<p class="small muted">Steps left out (their query didn't work): ${dropped.map(esc).join(" · ")}</p>` : ""}</div>`;
    $("#gm-mc").onchange = () => { const c = d.myCases[Number($("#gm-mc").value)]; $("#gm-cprev").innerHTML = c ? prevCase(c) : ""; };
    wireSrc("csrc", "cpane", "#gm-cprev", pre.myCase != null ? "mine" : "built");
    $("#gm-cgen").onclick = (e) => busy(e.currentTarget, async () => {
      $("#gm-cprev").innerHTML = `<p class="small muted">⏳ The AI writes the case, then ClassBot runs every query on its database… (up to a minute)</p>`;
      try { const r = await api("/games/case", { method: "POST", body: { prompt: $("#gm-cp").value, level: $("#gm-cl").value, lang: $("#gm-lang").value, avoid: [...d.cases, ...(d.myCases || [])].map((c) => c.title) } }); picked = r.case; $("#gm-cprev").innerHTML = prevCase(r.case, r.dropped) + `<p class="small muted">Not great? Click “Generate a case” again.</p>`; }
      catch (x) { $("#gm-cprev").innerHTML = `<div class="notice">${esc(x.message)}</div>`; }
    });
    const stepRow = (i) => `<div class="gm-ostep" data-ostep><b class="small">Step ${i + 1}</b>
      <div class="field-row"><div><input type="text" data-o="title" placeholder="Short title (Le bureau)" style="width:100%"></div><div><input type="text" data-o="keys" placeholder="Columns to check (nom, heure)" style="width:100%"></div></div>
      <input type="text" data-o="clue" placeholder="The clue for the students: what to find" style="width:100%;margin-top:6px">
      <textarea data-o="ref" placeholder="Your solution query: SELECT …" style="min-height:54px;margin-top:6px;font-family:var(--mono,monospace)"></textarea>
      <div class="field-row"><div><input type="text" data-o="hint" placeholder="A hint (optional)" style="width:100%"></div><div><input type="text" data-o="found" placeholder="What it reveals (optional)" style="width:100%"></div></div></div>`;
    const addStep = () => $("#gm-osteps").insertAdjacentHTML("beforeend", stepRow($$("[data-ostep]", dlg).length));
    addStep(); addStep(); addStep();
    $("#gm-oadd").onclick = addStep;
    $("#gm-ocheck").onclick = (e) => busy(e.currentTarget, async () => {
      const steps = $$("[data-ostep]", dlg).map((r) => Object.fromEntries($$("[data-o]", r).map((x) => [x.dataset.o, x.value.trim()]))).filter((x) => x.ref || x.clue).map((x) => ({ ...x, keys: x.keys.split(",").map((k) => k.trim()).filter(Boolean) }));
      const c = { title: $("#gm-ot").value, story: $("#gm-ost").value, schema: $("#gm-osc").value, culprit: $("#gm-ocu").value, ending: $("#gm-oend").value, question: "Qui est le coupable ? (prénom et nom)", steps };
      try { const r = await api("/games/case", { method: "POST", body: { case: c } }); picked = r.case; $("#gm-cprev").innerHTML = `<p class="small ok-text">✔ Your case works.</p>` + prevCase(r.case, r.dropped); }
      catch (x) { picked = null; $("#gm-cprev").innerHTML = `<div class="notice">${esc(x.message)}</div>`; }
    });
  }
  if (kind === "relay") {
    const prevTask = (t) => `<div class="gm-prev"><b>🏃 ${esc(t.title)}</b> <span class="tag">${GM_LEVEL[t.level] || ""}</span>${t.by === "ai" ? ` <span class="tag">✨ checked by running the AI's solution</span>` : ""}<p class="small">${esc(t.text)}</p>
      <div class="small">${t.tests.map((x, i) => `${i < 2 ? "👁" : "🔒"} <code>${esc(t.fn)}(${x.args.map((a) => esc(JSON.stringify(a))).join(", ")}) → ${esc(JSON.stringify(x.expect))}</code>`).join("<br>")}</div></div>`;
    const tx = () => { const t = d.tasks.find((x) => String(x.i) === $("#gm-task").value); $("#gm-tasktxt").textContent = t ? t.text : ""; };
    $("#gm-task").onchange = tx; tx();
    $("#gm-mt").onchange = () => { const t = d.myTasks[Number($("#gm-mt").value)]; $("#gm-tprev").innerHTML = t ? prevTask(t) : ""; };
    wireSrc("tsrc", "tpane", "#gm-tprev", pre.myTask != null ? "mine" : "built");
    $("#gm-tgen").onclick = (e) => busy(e.currentTarget, async () => {
      $("#gm-tprev").innerHTML = `<p class="small muted">⏳ The AI writes the challenge, then ClassBot runs its solution on its tests…</p>`;
      try { const r = await api("/games/task", { method: "POST", body: { prompt: $("#gm-tp").value, level: $("#gm-tl").value, lang: $("#gm-lang").value, avoid: [...d.tasks, ...(d.myTasks || [])].map((t) => t.title) } }); picked = r.task; $("#gm-tprev").innerHTML = prevTask(r.task) + `<p class="small muted">Not great? Click “Generate a challenge” again.</p>`; }
      catch (x) { $("#gm-tprev").innerHTML = `<div class="notice">${esc(x.message)}</div>`; }
    });
    $("#gm-noise").onchange = () => { $("#gm-noiseopts").hidden = !$("#gm-noise").checked; };
  }
}
/** The teacher's own relay function: the tests are lines "[args] => expected". */
function ownTask() {
  const fn = $("#gm-of").value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(fn)) throw new Error("Give the function a name (letters, no spaces)");
  const tests = [];
  for (const [i, line] of $("#gm-ots").value.split("\n").map((l) => l.trim()).filter(Boolean).entries()) {
    const m = line.match(/^(.*?)\s*=>\s*(.*)$/);
    if (!m) throw new Error(`Test ${i + 1}: write it as [arguments] => result`);
    let args, expect;
    try { args = JSON.parse(m[1]); expect = JSON.parse(m[2]); } catch { throw new Error(`Test ${i + 1}: the arguments and the result must be JSON (strings in "double quotes")`); }
    if (!Array.isArray(args)) args = [args];
    tests.push({ args, expect });
  }
  if (tests.length < 2) throw new Error("Write at least 2 tests");
  const params = $("#gm-op").value.split(",").map((x) => x.trim()).filter(Boolean);
  return { title: fn, text: $("#gm-ott").value.trim(), fn, params, tests, by: "teacher" };
}

async function viewGame(id) {
  const G = await api(`/games/${id}`);
  const info = GM_INFO[G.kind];
  const L = G.live;
  const sub = G.kind === "royale" ? `${G.content.questions.length} questions · ${G.settings.seconds} s each`
    : G.kind === "sql" ? `${G.content.case?.steps.length || 0} clues · ${(G.content.case?.notions || []).join(", ")}`
    : `${G.content.lang || "JavaScript"} · ${G.content.task.fn}() · ${G.content.task.tests.length} tests · ${G.settings.total / 60} min per round${G.settings.rounds > 1 ? ` × ${G.settings.rounds}` : ""}${G.settings.noise ? " · 🎤 no talking" : ""}`;
  view.innerHTML = `
    <div class="page-head"><div><div class="crumbs"><a href="#/games">Class games</a> › <a href="#/games/${G.kind}">${esc(GM_INFO[G.kind].name)}</a></div>
      <h1>${info.art} ${esc(G.title)}</h1>
      <p class="sub">${GM_MODES[G.mode][0]} ${GM_MODES[G.mode][1]} · ${esc(sub)}${G.settings.reward ? ` · winners +${G.settings.reward} pts` : ""}</p></div>
      <div class="toolbar" style="margin:0"><button class="btn danger" id="gm-del">Delete</button></div></div>
    <div class="bt-launch">
      <section class="panel bt-step"><div class="bt-num">1</div><div><h2>📺 Show it on the TV</h2><p class="small muted">Open it on the computer connected to the class TV, in <b>full screen</b>, sound on. Your buttons (start, next, end) are at the bottom of the TV screen.</p>
        <div class="toolbar" style="margin:0"><a class="btn primary" href="${esc(G.tv)}" target="_blank" rel="noopener">📺 Open the TV screen</a><button class="btn" id="gm-cptv">Copy the link</button></div></div></section>
      <section class="panel bt-step"><div class="bt-num">2</div><div class="bt-judge"><div><h2>📱 The students join from Discord</h2><p class="small muted">When the TV screen opens, the bot posts a <b>🎮 Join</b> button in #arena. Each student clicks it (or types <code>/play</code>) and gets their <b>own link</b>, tied to their Discord account, to open ${G.kind === "royale" ? "on their phone" : "on a laptop"}. Nobody can play under someone else's name.</p>
          <p class="small muted">To remove a student: click their name on the TV (or 👥 at the bottom). Their link stops working; you can let them back in.</p>
          ${G.kind === "relay" && G.settings.noise ? `<p class="small muted">🎤 Their browser asks for the microphone: they must allow it.</p>` : ""}</div>
        </div></section>
      <section class="panel bt-step"><div class="bt-num">3</div><div style="flex:1"><h2>🎮 Live</h2><div id="gm-live">${gameLive(G, L)}</div></div></section>
    </div>
    ${G.kind === "royale" ? `<section class="panel"><h2>Questions <span class="muted">${G.content.questions.length}</span></h2><div class="bt-qs">${G.content.questions.map((q) => `<div class="bt-q"><span class="bt-k">❓</span><div><b>${esc(q.prompt)}</b>${q.code ? `<pre class="code small">${esc(q.code)}</pre>` : ""}<div class="small">${q.options.map((o, k) => `${k === q.answer ? "✅ <b>" : ""}${"ABCD"[k]}. ${esc(o)}${k === q.answer ? "</b>" : ""}`).join(" · ")}</div></div></div>`).join("")}</div></section>` : ""}
    ${G.kind === "sql" && G.content.case ? `<section class="panel"><h2>🕵️ The case <span class="muted">(your answer key)</span></h2><p>${esc(G.content.case.story)}</p>
      <ol>${G.content.case.steps.map((s) => `<li><b>${esc(s.title)}</b> · ${esc(s.clue)}<pre class="code small">${esc(s.ref)}</pre></li>`).join("")}</ol>
      <p>🎯 ${esc(G.content.case.question)} <b>${esc(G.content.case.culprit[0].replace(/\b\w/g, (c) => c.toUpperCase()))}</b></p></section>` : ""}
    ${G.kind === "relay" ? `<section class="panel"><h2>🏃 ${esc(G.content.task.title)}</h2><p>${esc(G.content.task.text)}</p><pre class="code small">${esc(G.content.starter || "")}</pre>${G.content.task.solution ? `<details><summary class="small">A reference solution (Python)</summary><pre class="code small">${esc(G.content.task.solution)}</pre></details>` : ""}
      <div class="small">${G.content.task.tests.map((t, i) => `${i < 2 ? "👁 " : "🔒 "}<code>${esc(G.content.task.fn)}(${t.args.map((a) => esc(JSON.stringify(a))).join(", ")}) → ${esc(JSON.stringify(t.expect))}</code>`).join("<br>")}</div>
      <p class="small muted">👁 shown to the students · 🔒 hidden, run at the end</p></section>` : ""}`;
  $("#gm-cptv").onclick = () => copyText(G.tv, "TV link copied");
  $("#gm-del").onclick = () => confirmDialog("Delete this game?", "The TV and the join links stop working.", "Delete", async () => { await api(`/games/${id}`, { method: "DELETE" }); location.hash = `#/games/${G.kind}`; }, true);
  clearInterval(gmTimer);
  gmTimer = setInterval(async () => {
    if (!document.body.contains($("#gm-live"))) { clearInterval(gmTimer); return; }
    try { const x = await api(`/games/${id}`); $("#gm-live").innerHTML = gameLive(x, x.live); } catch { /* keep the last one */ }
  }, 4000);
}
function gameLive(G, L) {
  const [cls, lbl] = GM_PHASE[L.phase] || ["pending", L.phase];
  const sq = (i) => L.squads[i] || { name: "?", emoji: "", color: "#888" };
  let more = "";
  if (G.kind === "royale" && L.phase !== "lobby") more = `${L.players.filter((p) => p.alive).length} alive of ${L.players.length} · question ${L.step}/${L.total}`;
  if (G.kind === "sql" && L.teams?.length) more = L.teams.map((t) => `${esc(sq(t.squad).emoji + " " + sq(t.squad).name)} ${t.done ? "🎯" : `${t.step}/${L.case.steps.length}`}`).join(" · ");
  if (G.kind === "relay" && L.teams?.length) more = L.teams.map((t) => `${esc(sq(t.squad).emoji + " " + sq(t.squad).name)}${t.strikes ? ` 🗣️${t.strikes}` : ""}${t.out ? " (out)" : ""}${L.results?.[t.squad] ? ` · ${L.results[t.squad].passed}/${L.results[t.squad].total} ✓` : ""}`).join(" · ");
  const win = L.phase === "over" ? (L.winSquad != null ? `🏆 <b>${esc(sq(L.winSquad).emoji + " " + sq(L.winSquad).name)}</b>` : L.winners?.length ? `🏆 <b>${L.players.filter((p) => L.winners.includes(p.pid)).map((p) => esc(p.name)).join(", ")}</b>` : "") : "";
  return `<div class="small">${status(cls, lbl)} <span>👥 ${L.players.length} player${L.players.length === 1 ? "" : "s"}</span> ${win}</div>
    ${more ? `<p class="small" style="margin:8px 0 0">${more}</p>` : ""}
    <div class="gm-who">${L.players.map((p) => `<span class="tag" style="${p.squad >= 0 && G.mode !== "solo" && L.squads[p.squad] ? `border-color:${esc(L.squads[p.squad].color)}` : ""}">${p.alive === false ? "💀 " : ""}${G.kind === "relay" ? (p.mic === 1 ? "🎤 " : p.mic === 0 ? "🔇 " : "") : ""}${esc(p.name)}</span>`).join("")}</div>`;
}

Object.assign(routes, { games: (k) => (k && GM_INFO[k] ? viewGameKind(k) : viewGames()), game: (id) => viewGame(Number(id)) });
