// The GitHub tab of a student page: what they pushed (each commit, flagged tiny / vague / huge), their repos and the
// briefs they belong to, when they work, and an AI summary of the features they built.
/* global api, esc, fmtAgo, fmtDate, fmtDateTime, toast, busy, $, $$, segHtml, wireSeg, segVal */

const GHS = { days: 30, data: null, filter: "all", repo: "", q: "", shown: 6 };
const ghDay = (t) => { const d = new Date(t * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ghDayLabel = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const ghRepoShort = (r) => String(r || "").split("/")[1] || r || "";
const ghNum = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0));
const isFlag = (r) => !!r.flags;
const kindOf = (r) => (r.kind === "pr" ? "pr" : r.size === "merge" ? "merge" : isFlag(r) ? "huge" : r.size === "docs" ? "docs" : r.size === "tiny" ? "tiny" : "real");

/** A small summary of GitHub on the student's Overview (from the 14-day activity the page already has). */
function githubSnapshot(d, sid) {
  const gh = d.learning?.github;
  if (!gh) return "";
  if (!gh.login) return `<section class="panel stu-gh-snap"><div class="panel-head"><h2>🐙 GitHub</h2></div><p class="muted small">Not linked yet: they type <code>/github</code> in Discord.</p></section>`;
  const act = gh.activity;
  const sum = act ? act.days.reduce((s, x) => s + (x[7] ?? x[0]) + x[2], 0) : 0;
  const tiny = act ? act.days.reduce((s, x) => s + x[4], 0) : 0, vague = act ? act.days.reduce((s, x) => s + x[6], 0) : 0, huge = act ? act.days.reduce((s, x) => s + x[5], 0) : 0;
  return `<section class="panel stu-gh-snap"><div class="panel-head"><h2>🐙 GitHub <a class="small" href="https://github.com/${esc(gh.login)}" target="_blank" rel="noopener">@${esc(gh.login)}</a></h2>
      <a class="btn small" href="#/student/${esc(sid)}?tab=github">All activity →</a></div>
    ${act ? `<div class="gh-snap-row"><span class="gh-heat big">${act.days.map((x, i) => { const n = (x[7] ?? x[0]) + x[2]; return `<i class="h${n ? Math.min(4, Math.ceil(n / 2)) : 0} ${x[5] || x[6] ? "flag" : ""}" title="${esc(gh.days[i])}: ${x[7] ?? x[0]} commit(s), ${x[2]} PR(s)${x[4] ? `, ${x[4]} tiny` : ""}${x[6] ? `, ${x[6]} vague` : ""}${x[5] ? `, ${x[5]} huge` : ""}"></i>`; }).join("")}</span>
      <div class="gh-snap-figs"><span><b>${sum}</b> commits & PRs · 14 days</span><span>last push <b>${act.last ? fmtAgo(act.last) : "never"}</b>${act.idle >= 3 ? ` <span class="lvl bad">${act.idle} days idle</span>` : ""}</span>
        ${tiny || vague || huge ? `<span>${tiny ? `<span class="ghb tiny">${tiny} tiny</span>` : ""}${vague ? `<span class="ghb bad">${vague} vague</span>` : ""}${huge ? `<span class="ghb huge">${huge} huge</span>` : ""}</span>` : ""}</div></div>
      ${act.repos.length ? `<p class="small muted" style="margin:8px 0 0">${act.repos.slice(0, 4).map(([r]) => `<a href="https://github.com/${esc(r)}" target="_blank" rel="noopener">${esc(r)}</a>`).join(" · ")}</p>` : ""}` : `<p class="muted small">No activity yet.</p>`}
  </section>`;
}

async function studentGithubTab(root, sid, d) {
  const gh = d.learning?.github;
  if (!gh?.login) {
    root.innerHTML = `<div class="empty-state"><div style="font-size:44px">🐙</div><h3>GitHub isn't linked</h3><p class="muted">The student types <code>/github</code> in Discord and installs the class's GitHub App on their account. Their pushes then appear here.</p></div>`;
    return;
  }
  root.innerHTML = `<p class="muted">Loading GitHub activity…</p>`;
  try {
    GHS.data = await api(`/students/${sid}/github?days=${GHS.days}`);
  } catch (e) { root.innerHTML = `<div class="notice">${esc(e.message)}</div>`; return; }
  // first visit: nothing stored yet (older than the details, or the webhook was elsewhere): read it from GitHub once
  if (!GHS.data.everSynced) {
    root.innerHTML = `<p class="muted">⏳ First visit: reading ${esc(gh.login)}'s commits from GitHub…</p>`;
    try { GHS.data = await api(`/students/${sid}/github/sync?days=${GHS.days}`, { method: "POST", body: { days: GHS.days } }); }
    catch (e) { GHS.syncError = e.message; }
  }
  GHS.vsc = await api(`/vscode/days/${sid}?days=${GHS.days}`).catch(() => null);
  renderGithubTab(root, sid);
}
/** The day's VS Code time (Suivi VS Code), next to its commits; nothing when the learner never connected VS Code. */
function ghVscDay(day) {
  const V = GHS.vsc;
  if (!V || !V.connected) return "";
  const x = V.days[day];
  const dur = (s) => { const m = Math.round((s || 0) / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`; };
  return x && x[0] ? `<span class="small ghl-vsc" title="VS Code (WakaTime) that day: active time · writing time">🧑‍💻 ${esc(dur(x[0]))} · ${esc(dur(x[1]))} writing</span>` : `<span class="small muted ghl-vsc">🧑‍💻 no VS Code activity</span>`;
}

function renderGithubTab(root, sid) {
  const D = GHS.data, T = D.totals;
  const commits = D.log.filter((r) => r.kind === "commit" && r.size !== "merge");
  // the period, day by day (local time), for the calendar
  const days = [];
  const start = new Date(); start.setHours(12, 0, 0, 0); start.setDate(start.getDate() - D.days + 1);
  for (let i = 0; i < D.days; i++) { const x = new Date(start); x.setDate(start.getDate() + i); days.push(ghDay(x.getTime() / 1000)); }
  const byDay = new Map(days.map((k) => [k, { c: 0, pr: 0, tiny: 0, bad: 0, huge: 0, adds: 0 }]));
  const hours = Array(24).fill(0), wdays = Array(7).fill(0);
  for (const r of D.log) {
    const x = byDay.get(ghDay(r.t));
    if (r.kind === "pr") { if (x) x.pr++; continue; }
    if (r.size === "merge") continue;
    const dt = new Date(r.t * 1000);
    hours[dt.getHours()]++; wdays[(dt.getDay() + 6) % 7]++;
    if (!x) continue;
    x.c++; x.adds += r.adds || 0;
    if (r.size === "tiny" && !isFlag(r)) x.tiny++;
    if (r.bad) x.bad++;
    if (isFlag(r)) x.huge++;
  }
  const maxDay = Math.max(1, ...[...byDay.values()].map((x) => x.c + x.pr));
  const lvl = (n) => (n ? Math.max(1, Math.ceil((4 * n) / maxDay)) : 0);
  // calendar: one column per week, Monday on top
  const first = new Date(days[0] + "T12:00:00"), pad = (first.getDay() + 6) % 7;
  const cells = [...Array(pad).fill(null), ...days];
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const cal = `<div class="ghc">${weeks.map((w) => `<div class="ghc-w">${w.map((k) => { if (!k) return `<i class="ghc-d empty"></i>`; const x = byDay.get(k);
    return `<i class="ghc-d h${lvl(x.c + x.pr)} ${x.huge || (x.bad && x.bad * 2 >= x.c) ? "flag" : ""}" data-day="${k}" title="${esc(ghDayLabel(k))}: ${x.c} commit(s)${x.pr ? `, ${x.pr} PR` : ""}${x.tiny ? `, ${x.tiny} tiny` : ""}${x.bad ? `, ${x.bad} vague` : ""}${x.huge ? `, ${x.huge} huge` : ""}"></i>`; }).join("")}</div>`).join("")}</div>`;
  const maxH = Math.max(1, ...hours), maxW = Math.max(1, ...wdays);
  const night = hours.slice(0, 6).reduce((s, n) => s + n, 0) + hours[23];
  const share = (n) => (commits.length ? Math.round((100 * n) / commits.length) : 0);
  const quality = commits.length ? `<div class="ghq">${[["real", T.real, "Real work"], ["tiny", T.tiny, "Tiny (1–2 lines)"], ["docs", T.docs, "Docs only"], ["huge", T.flagged, "Huge / node_modules"]].filter(([, n]) => n)
    .map(([k, n, l]) => `<i class="ghq-${k}" style="flex:${n}" title="${l}: ${n}"></i>`).join("")}</div>
    <div class="ghq-legend small">${[["real", T.real, "real work"], ["tiny", T.tiny, "tiny"], ["docs", T.docs, "docs only"], ["huge", T.flagged, "huge / node_modules"]].map(([k, n, l]) => `<span><i class="ghq-${k}"></i>${n} ${l}</span>`).join("")}<span><i class="ghq-bad"></i>${T.bad} vague message${T.bad === 1 ? "" : "s"} (${share(T.bad)}%)</span></div>` : "";
  const S1 = D.summary;
  root.innerHTML = `
    <div class="ghs-bar">
      ${segHtml("ghd", [["14", "14 days"], ["30", "30 days"], ["90", "90 days"]], String(D.days))}
      <span class="small muted">${D.log.length ? `${D.log.length} event(s) since ${fmtDate(D.since)}` : ""}</span>
      <span class="grow"></span>
      <button class="btn small" id="ghs-sync" title="Reads the commits of their repos from GitHub (default branch), for older work or missed pushes">↻ Load from GitHub</button>
      <a class="btn small" href="https://github.com/${esc(D.login)}" target="_blank" rel="noopener">🐙 @${esc(D.login)}</a>
    </div>
    ${GHS.syncError ? `<div class="notice small">Couldn't read GitHub: ${esc(GHS.syncError)}</div>` : ""}
    <div class="ghs-figs">
      <div><b>${T.commits}</b><span>commits</span></div>
      <div class="ok"><b>${T.real}</b><span>real work</span></div>
      <div class="${T.tiny ? "warn" : ""}"><b>${T.tiny}</b><span>tiny</span></div>
      <div class="${T.bad ? "bad" : ""}"><b>${T.bad}</b><span>vague messages</span></div>
      <div class="${T.flagged ? "bad" : ""}"><b>${T.flagged}</b><span>huge / node_modules</span></div>
      <div><b>${T.prs}</b><span>pull requests</span></div>
      <div><b><span class="add">+${ghNum(T.adds)}</span> <span class="del">−${ghNum(T.dels)}</span></b><span>lines</span></div>
      <div><b>${T.activeDays}</b><span>active days of ${D.days}</span></div>
    </div>
    ${!D.log.length ? `<div class="empty-state"><div style="font-size:40px">🌱</div><p class="muted">No commit or pull request in the last ${D.days} days${D.everSynced ? "" : " (GitHub couldn't be read)"}.</p></div>` : `
    <div class="ghs-grid">
      <section class="panel"><div class="panel-head"><h3>📅 When they push</h3><span class="small muted">darker = more · <i class="ghc-d h2 flag" style="display:inline-block;vertical-align:middle"></i> huge, or mostly vague · click a day</span></div>
        <div class="ghc-wrap"><div class="ghc-labels small muted"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span>Sun</span></div>${cal}</div>
        <div class="ghh">${hours.map((n, h) => `<div title="${h}:00 – ${h + 1}:00 · ${n} commit(s)"><i style="height:${Math.round((100 * n) / maxH)}%" class="${h < 6 || h === 23 ? "night" : ""}"></i>${h % 6 === 0 ? `<span>${h}h</span>` : ""}</div>`).join("")}</div>
        <p class="small muted" style="margin:6px 0 0">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w, i) => `${w} <b style="opacity:${0.35 + (0.65 * wdays[i]) / maxW}">${wdays[i]}</b>`).join(" · ")}${night ? ` · <span class="ghb bad">${night} at night (23h–6h)</span>` : ""}</p>
      </section>
      <section class="panel"><div class="panel-head"><h3>🧪 Commit quality</h3><span class="small muted">tiny ≤ ${D.thresholds.tiny} lines · huge ≥ ${ghNum(D.thresholds.huge)}</span></div>
        ${quality || `<p class="muted small">No commit.</p>`}
        ${GHS_tips(T, commits)}
      </section>
    </div>`}
    <section class="panel ghs-ai"><div class="panel-head"><h3>✨ What they built</h3>
        <span>${S1 ? `<span class="small muted">AI summary · ${fmtAgo(S1.at)} · ${S1.days} days</span> ` : ""}<button class="btn small ${S1 ? "" : "primary"}" id="ghs-ai" ${commits.length ? "" : "disabled"}>${S1 ? "↻ Summarize again" : "✨ Summarize with AI"}</button></span></div>
      ${S1 ? aiSummaryHtml(S1, D) : `<p class="muted small">The AI reads their commits (messages, sizes, flags) and the requirements of the briefs of the period, then lists the features they implemented, per repo, and which brief requirements show up in their work.</p>`}
    </section>
    ${D.repos.length ? `<section class="panel"><div class="panel-head"><h3>📦 Repositories</h3><span class="small muted">${D.repos.length} with activity</span></div>
      <div class="table-wrap"><table class="ghr"><thead><tr><th>Repo</th><th>Brief</th><th class="num">Commits</th><th>Quality</th><th class="num">Lines</th><th class="num">PRs</th><th>Last push</th></tr></thead><tbody>
      ${D.repos.map((r) => `<tr data-repo="${esc(r.repo)}" class="clickable" title="Show its commits">
        <td><a href="https://github.com/${esc(r.repo)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><b>${esc(ghRepoShort(r.repo))}</b></a><div class="small muted">${esc(r.repo.split("/")[0])}</div></td>
        <td>${r.brief ? `<a class="tag" href="#/brief/${r.brief.id}" onclick="event.stopPropagation()">${esc(r.brief.title)}</a><div class="small muted">${r.how === "handed in" ? "handed in" : "worked on during it"}</div>` : `<span class="muted small">—</span>`}</td>
        <td class="num"><b>${r.commits}</b></td>
        <td><div class="ghq mini">${[["real", r.real], ["tiny", r.tiny], ["docs", r.docs], ["huge", r.flagged]].filter(([, n]) => n).map(([k, n]) => `<i class="ghq-${k}" style="flex:${n}"></i>`).join("")}</div>
          <div class="small muted">${r.tiny ? `${r.tiny} tiny · ` : ""}${r.bad ? `<span style="color:var(--down)">${r.bad} vague</span> · ` : ""}${r.flagged ? `<span style="color:var(--down)">${r.flagged} huge</span> · ` : ""}${r.real} real</div></td>
        <td class="num small"><span class="add">+${ghNum(r.adds)}</span> <span class="del">−${ghNum(r.dels)}</span></td>
        <td class="num">${r.prs || "—"}</td>
        <td class="small">${fmtAgo(r.last)}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
    ${D.log.length ? `<section class="panel"><div class="panel-head"><h3>🧾 Every push</h3><span class="small muted" id="ghl-n"></span></div>
      <div class="ghl-tools">
        <div class="ghf-row" role="group">${[["all", "All"], ["real", "Real work"], ["tiny", "Tiny"], ["bad", "Vague"], ["huge", "Huge"], ["pr", "Pull requests"]].map(([k, l]) => `<button type="button" class="ghf" data-ghf="${k}" aria-pressed="${GHS.filter === k}">${l}</button>`).join("")}</div>
        <select id="ghl-repo" aria-label="Repo"><option value="">All repos</option>${D.repos.map((r) => `<option value="${esc(r.repo)}" ${GHS.repo === r.repo ? "selected" : ""}>${esc(ghRepoShort(r.repo))}</option>`).join("")}</select>
        <input type="search" id="ghl-q" placeholder="Search messages" value="${esc(GHS.q)}">
      </div>
      <div id="ghl"></div></section>` : ""}`;
  wireSeg(root, "ghd", (v) => { GHS.days = Number(v); studentGithubTab(root, sid, { learning: { github: { login: D.login } } }); });
  $("#ghs-sync", root).onclick = (e) => busy(e.currentTarget, async () => {
    GHS.syncError = null;
    const r = await api(`/students/${sid}/github/sync?days=${GHS.days}`, { method: "POST", body: { days: GHS.days } });
    GHS.data = r; toast(r.added ? `${r.added} new commit(s) read from ${r.repoCount} repo(s)` : "Up to date: nothing new on GitHub"); renderGithubTab(root, sid);
  });
  if ($("#ghs-ai", root)) $("#ghs-ai", root).onclick = (e) => busy(e.currentTarget, async () => {
    const r = await api(`/students/${sid}/github/summary?days=${GHS.days}`, { method: "POST", body: { days: GHS.days } });
    GHS.data.summary = r.summary; renderGithubTab(root, sid);
  });
  $$("[data-repo]", root).forEach((tr) => tr.onclick = () => { GHS.repo = tr.dataset.repo; $("#ghl-repo", root).value = GHS.repo; drawLog(root); $("#ghl", root).scrollIntoView({ behavior: "smooth", block: "start" }); });
  $$("[data-day]", root).forEach((c) => c.onclick = () => { GHS.q = ""; GHS.day = c.dataset.day; drawLog(root); $("#ghl", root)?.scrollIntoView({ behavior: "smooth", block: "start" }); });
  $$("[data-ghf]", root).forEach((b) => b.onclick = () => { GHS.filter = b.dataset.ghf; $$("[data-ghf]", root).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); drawLog(root); });
  if ($("#ghl-repo", root)) $("#ghl-repo", root).onchange = (e) => { GHS.repo = e.target.value; drawLog(root); };
  if ($("#ghl-q", root)) $("#ghl-q", root).oninput = (e) => { GHS.q = e.target.value; drawLog(root); };
  $$("[data-sha]", root).forEach((a) => a.onclick = (e) => { e.preventDefault(); GHS.q = a.dataset.sha; GHS.filter = "all"; GHS.repo = ""; GHS.day = null; renderGithubTab(root, sid); $("#ghl", root)?.scrollIntoView({ behavior: "smooth", block: "start" }); });
  if ($("#ghl", root)) drawLog(root);
}

function GHS_tips(T, commits) {
  if (!commits.length) return "";
  const out = [];
  const pct = (n) => Math.round((100 * n) / commits.length);
  if (T.bad && pct(T.bad) >= 25) out.push(`<li class="ko">${pct(T.bad)}% of the messages say nothing (“update”, “fix”…): ask them to write what changed.</li>`);
  if (T.tiny && pct(T.tiny) >= 40) out.push(`<li class="ko">Many tiny commits (${pct(T.tiny)}%): possibly committing to look active, or editing on github.com line by line.</li>`);
  if (T.flagged) out.push(`<li class="ko">${T.flagged} huge commit(s) (or node_modules): code pasted at once? Worth asking where it comes from.</li>`);
  if (T.real && pct(T.real) >= 60) out.push(`<li class="ok">Mostly real steps (${pct(T.real)}%): a healthy history.</li>`);
  if (T.prs) out.push(`<li class="ok">${T.prs} pull request event(s): they work with branches.</li>`);
  return out.length ? `<ul class="ghs-tips small">${out.join("")}</ul>` : "";
}

function aiSummaryHtml(S1, D) {
  const shaLink = (c) => { const r = D.log.find((x) => x.id.startsWith(c)); return `<a href="${esc(r?.url || "#")}" class="sha" data-sha="${esc(c)}" title="${esc(r?.title || "")}">${esc(c.slice(0, 7))}</a>`; };
  const ST = { done: ["ok", "✓ done"], partial: ["warn", "◐ partial"], "no sign": ["ko", "✗ no sign"], "in progress": ["warn", "◐ in progress"] };
  return `${S1.overview ? `<p class="ghs-over">${esc(S1.overview)}</p>` : ""}
    <div class="ghs-feat">${(S1.repos || []).map((p) => `<div class="ghs-feat-repo"><h4>📦 ${esc(ghRepoShort(p.repo))} <span class="small muted">${esc(p.repo)}</span></h4>
      <ul>${p.features.map((f) => `<li><span class="ghs-st ${ST[f.status]?.[0] || "ok"}">${ST[f.status]?.[1] || f.status}</span> <span>${esc(f.title)}</span> <span class="ghs-shas">${f.commits.map(shaLink).join(" ")}</span></li>`).join("")}</ul></div>`).join("")}</div>
    ${(S1.brief || []).length ? `<h4 style="margin:14px 0 6px">📄 Brief requirements seen in the commits</h4><div class="table-wrap"><table class="ghs-req"><tbody>${S1.brief.map((q) => `<tr><td><span class="ghs-st ${ST[q.status]?.[0]}">${ST[q.status]?.[1]}</span></td><td>${esc(q.requirement)}<div class="small muted">${esc(q.brief)}</div></td><td class="small muted">${esc(q.evidence)}</td></tr>`).join("")}</tbody></table></div>
      <p class="small muted">From the commit messages only: the debrief of the brief reads the code itself.</p>` : ""}
    ${(S1.habits?.good || []).length || (S1.habits?.improve || []).length ? `<div class="ghs-habits">${S1.habits.good.length ? `<div><h4>👍 Good habits</h4><ul class="small">${S1.habits.good.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}${S1.habits.improve.length ? `<div><h4>🛠️ To improve</h4><ul class="small">${S1.habits.improve.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}</div>` : ""}`;
}

function drawLog(root) {
  const D = GHS.data, q = GHS.q.trim().toLowerCase();
  const rows = D.log.filter((r) => {
    const k = kindOf(r);
    if (GHS.filter === "bad" ? !r.bad : GHS.filter !== "all" && k !== GHS.filter) return false;
    if (GHS.repo && r.repo !== GHS.repo) return false;
    if (GHS.day && ghDay(r.t) !== GHS.day) return false;
    return !q || `${r.title || ""} ${r.id}`.toLowerCase().includes(q);
  });
  const groups = new Map();
  for (const r of rows.slice(0, 400)) { const k = ghDay(r.t); (groups.get(k) ?? groups.set(k, []).get(k)).push(r); }
  const BADGE = { tiny: `<span class="ghb tiny">tiny</span>`, docs: `<span class="ghb docs">docs</span>`, merge: `<span class="ghb">merge</span>` };
  const filters = [GHS.day ? `<button class="ghf" id="ghl-day" aria-pressed="true">${esc(ghDayLabel(GHS.day))} ×</button>` : ""].join("");
  $("#ghl-n", root).innerHTML = `${rows.length} shown ${filters}`;
  if ($("#ghl-day", root)) $("#ghl-day", root).onclick = () => { GHS.day = null; drawLog(root); };
  const allGroups = [...groups.entries()], more = allGroups.length - GHS.shown;
  $("#ghl", root).innerHTML = rows.length ? allGroups.slice(0, GHS.shown).map(([day, list]) => `<div class="ghl-day"><div class="ghl-dh"><b>${esc(ghDayLabel(day))}</b><span class="small muted">${list.filter((r) => r.kind === "commit").length} commit(s)</span>${ghVscDay(day)}</div>
    ${list.map((r) => {
      const k = kindOf(r);
      const flags = (r.flags || "").split(",").filter(Boolean);
      return `<div class="ghl-row k-${k}">
        <span class="ghl-ic" title="${k}">${r.kind === "pr" ? "⇄" : k === "merge" ? "⑂" : "●"}</span>
        <div class="ghl-main"><div class="ghl-msg">${r.kind === "pr" ? `<span class="ghb pr">PR ${esc(r.action || "")}</span> ` : ""}${esc(r.title || "(no message)")}</div>
          <div class="ghl-meta small muted"><a href="${esc(r.url || `https://github.com/${r.repo}`)}" target="_blank" rel="noopener" class="sha">${r.kind === "pr" ? esc((r.id.match(/#\d+/) || [""])[0]) : esc(r.id.slice(0, 7))}</a>
            · ${esc(ghRepoShort(r.repo))}${r.branch ? ` <span class="muted">(${esc(r.branch)})</span>` : ""} · ${new Date(r.t * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</div></div>
        <div class="ghl-side">${BADGE[k] || ""}${r.bad ? `<span class="ghb bad" title="The message says nothing about the change">vague</span>` : ""}${flags.map((f) => `<span class="ghb huge">${f === "node_modules" ? "node_modules" : "huge"}</span>`).join("")}
          ${r.adds != null ? `<span class="ghl-lines"><span class="add">+${ghNum(r.adds)}</span> <span class="del">−${ghNum(r.dels || 0)}</span></span>` : `<span class="ghl-lines muted small">size ?</span>`}</div>
      </div>`; }).join("")}</div>`).join("") + (more > 0 ? `<div class="ghl-more"><button class="btn small" id="ghl-more">Show ${Math.min(7, more)} more day(s)</button> <button class="btn small" id="ghl-all">Show all ${allGroups.length} days</button></div>` : "")
      + (rows.length > 400 && more <= 0 ? `<p class="muted small">Showing the 400 newest: filter to see the rest.</p>` : "")
    : `<p class="empty">Nothing matches.</p>`;
  if ($("#ghl-more", root)) $("#ghl-more", root).onclick = () => { GHS.shown += 7; drawLog(root); };
  if ($("#ghl-all", root)) $("#ghl-all", root).onclick = () => { GHS.shown = 999; drawLog(root); };
}
