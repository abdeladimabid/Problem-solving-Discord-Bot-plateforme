/* ClassBot teacher dashboard (no build step, no dependencies). */
"use strict";

const S = { me: null, guilds: [], g: null, guild: null, discord: null, students: null, challenges: null };
const view = document.getElementById("view");
const dlg = document.getElementById("dlg");

// ============================================================= helpers
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

async function api(path, opts = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `/api${path}${S.g ? `${sep}g=${encodeURIComponent(S.g)}` : ""}`;
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: opts.body ? { "content-type": "application/json" } : {},
    body: opts.body ? JSON.stringify({ g: S.g, ...opts.body }) : undefined,
  });
  if (res.status === 401) { location.href = "/login"; throw new Error("Please sign in again."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg, error = false) {
  $(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast" + (error ? " error" : "");
  el.setAttribute("role", "status");
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), error ? 6000 : 3000);
}

async function busy(btn, fn) {
  btn.disabled = true;
  try { return await fn(); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; }
}

const fmtDate = (u) => (u ? new Date(u * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—");
const fmtDateTime = (u) => (u ? new Date(u * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
function fmtAgo(u) {
  if (!u) return "never";
  const s = Date.now() / 1000 - u;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
const pct = (v) => (v == null ? "—" : `${v}%`);
const DIFF = { easy: "Easy", medium: "Medium", hard: "Hard" };
const KIND = { mcq: "Multiple choice", complexity: "Complexity", output: "Predict the output", bug: "Find the bug", regex: "Regular expression", sql: "SQL query", write: "Write code", code: "HackerRank problem" };
const FORM_KINDS = ["mcq", "complexity", "output", "bug", "write", "code"];   // SQL and regex come from the verified bank
// What a class learns: one language or stack at a time (see src/shared/tracks.ts)
const TRACK_LIST = [
  ["javascript", "🟨 JavaScript"], ["php", "🐘 PHP"], ["python", "🐍 Python"], ["java", "☕ Java"], ["c", "🔧 C"], ["cpp", "➕ C++"],
  ["sql", "🗄️ SQL (databases)"], ["mern", "⚛️ MERN (MongoDB, Express, React, Node)"], ["ai", "🤖 Python for AI & LLMs"],
];
const trackKeyOf = (g) => (TRACK_LIST.some(([k]) => k === g?.track) ? g.track : String(g?.code_lang || "python").split(",")[0]);
const trackOptions = (sel) => TRACK_LIST.map(([k, label]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${esc(label)}</option>`).join("");
/** Switch the class's track (from Overview, Settings or Path), then reload the page. */
async function changeTrack(key, after) {
  const r = await api("/track", { method: "PUT", body: { track: key } });
  S.guild = r.guild;
  S.skillDefs = null; S.challenges = null;
  toast(`The class now learns ${TRACK_LIST.find(([k]) => k === key)?.[1] || key}: challenges, daily challenge, path and lessons follow it`);
  if (after) after();
}
const LANG = { python: "Python", javascript: "JavaScript", php: "PHP", cpp: "C++", c: "C", java: "Java" };
const VERDICT = { accepted: "Accepted", wrong: "Wrong answer", tle: "Too slow", runtime: "Crashed", compile: "Doesn't compile", unavailable: "Judge down" };
const parseJson = (t) => { try { return JSON.parse(t || "null"); } catch { return null; } };
const codeView = (a) => {
  if (!a.answer_given) return '<span class="muted">—</span>';
  if (a.kind !== "write") return /^https?:\/\//i.test(a.answer_given) ? `<a href="${esc(a.answer_given)}" target="_blank" rel="noopener noreferrer">their link</a>` : `<code>${esc(a.answer_given).slice(0, 120)}</code>`;
  const r = parseJson(a.result);
  const head = `${r ? `${esc(VERDICT[r.verdict] || r.verdict)} · ${r.passed}/${r.total} tests${r.judge === "ai" ? " · judged by AI" : ""}` : "code"} · ${esc(LANG[a.lang] || a.lang || "Python")}`;
  return `<details><summary class="small">${head}</summary><pre class="code-view">${esc(a.answer_given)}</pre>${a.feedback ? `<p class="small">🧠 ${esc(a.feedback)}</p>` : ""}</details>`;
};
const ORIGIN = { practice: "Practice", daily: "Daily", assignment: "Assignment", duel: "Duel", session: "Class session", plan: "Daily plan", path: "Path", exam: "Exam", bounty: "Bounty", boss: "Boss battle" };
const STATUS = { review: "Waiting for review", solved: "Solved", claimed: "Self-reported", failed: "Failed", expired: "Not finished", pending: "In progress", done: "Done", late: "Done late", missed: "Missed", open: "Open", active: "Live", finished: "Finished", cancelled: "Cancelled", flagged: "Reported", archived: "Archived" };
const TREND = { up: "↑ improving", down: "↓ slipping", flat: "→ steady", inactive: "⏸ inactive", new: "✦ new" };
const REASON = { plan: "Daily plan", plan_bonus: "Plan bonus", path: "Path", session: "Class session", exam: "Exam", bounty: "Bounty", boss: "Boss battle", quiz: "Live quiz", review: "Peer review", author: "Challenge author", shop: "Shop", practice: "Practice", daily: "Daily challenge", assignment: "Assignment", duel: "Duel", contest: "Contest", award: "Contest award", bonus: "Teacher bonus", adjust: "Teacher adjustment", regrade: "Regrade", team: "Team" };
const diffTag = (d) => `<span class="tag ${esc(d)}">${esc(DIFF[d] || d)}</span>`;
const status = (s, label) => `<span class="status ${esc(s)}">${esc(label || STATUS[s] || s)}</span>`;
const trend = (t) => `<span class="trend ${esc(t)}">${esc(TREND[t] || t)}</span>`;
const channelName = (id) => S.discord?.channels.find((c) => c.id === id)?.name;

// ========================================================== dialogs
function openDialog(title, body, buttons = []) {
  dlg.classList.remove("wide");
  dlg.innerHTML = `<div class="dlg-head"><h2 style="margin:0">${esc(title)}</h2><button class="btn small" data-close>Close</button></div>
    <div class="dlg-body">${body}</div>
    ${buttons.length ? `<div class="dlg-foot">${buttons.map((b, i) => `<button class="btn ${b.primary ? "primary" : ""} ${b.danger ? "danger" : ""}" data-b="${i}">${esc(b.label)}</button>`).join("")}</div>` : ""}`;
  $("[data-close]", dlg).onclick = () => dlg.close();
  buttons.forEach((b, i) => { $(`[data-b="${i}"]`, dlg).onclick = (e) => busy(e.currentTarget, () => b.action(dlg)); });
  dlg.showModal();
  return dlg;
}
function confirmDialog(title, text, label, action, danger = false) {
  openDialog(title, `<p>${esc(text)}</p>`, [{ label, primary: !danger, danger, action: async () => { await action(); dlg.close(); } }]);
}

// ============================================================ icons
const ICONS = {
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><path d="M16 4.5a4 4 0 0 1 0 7"/><path d="M22 21c0-3-1.8-5.6-4.5-6.6"/>',
  activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  swords: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="M9.5 6.5 21 18v3h-3l-3.5-3.5"/>',
  trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/>',
  code: '<path d="m8 9-4 3 4 3"/><path d="m16 9 4 3-4 3"/><path d="m13 5-2 14"/>',
  clipboard: '<path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z"/><path d="M8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2"/><path d="m9 14 2 2 4-4"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
  flag: '<path d="M4 21V4"/><path d="M4 4h12l-2 4 2 4H4"/>',
  fire: '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-6 6-6 9-1-1-2-3-2-3-1 2-1 4-1 6 0 4 3 7 7 7Z"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
};
const icon = (name) => `<svg class="i" viewBox="0 0 24 24">${ICONS[name] || ""}</svg>`;
const AVATAR_COLORS = ["#2563eb", "#0ea5e9", "#6366f1", "#14b8a6", "#3b82f6", "#8b5cf6", "#0891b2", "#4f46e5"];
const avatar = (name, id = "") => {
  const s = String(name || id || "?");
  let h = 0;
  for (const ch of String(id || s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const ini = s.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return `<span class="avatar" style="background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}">${esc(ini)}</span>`;
};
const delta = (now, before, suffix = "") => {
  if (before == null) return "";
  const d = now - before;
  const cls = d > 0 ? "up" : d < 0 ? "down" : "flat";
  return `<span class="delta ${cls}" title="vs the previous period">${d > 0 ? "▲" : d < 0 ? "▼" : "•"} ${Math.abs(d)}${suffix}</span>`;
};
const KIND_COLORS = { mcq: "var(--s2)", complexity: "var(--s4)", output: "var(--s3)", bug: "var(--s6)", regex: "var(--s2)", sql: "var(--s5)", write: "var(--s1)", code: "var(--s5)" };

// =========================================================== charts
function sparkline(values, color = "var(--s1)") {
  if (!values.length) return "";
  const W = 80, H = 28, max = Math.max(1, ...values);
  const pts = values.map((v, i) => [((W - 2) * i) / Math.max(1, values.length - 1) + 1, H - 2 - ((H - 4) * v) / max]);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p) => p.join(",")).join(" ")}"/></svg>`;
}

function donut(parts, { size = 150, label = "", sub = "" } = {}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const R = 60, r = 40, C = 75;
  let a0 = -Math.PI / 2, paths = "";
  const arc = (a1, a2) => {
    const large = a2 - a1 > Math.PI ? 1 : 0;
    const p = (rad, a) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
    return `M${p(R, a1)} A${R},${R} 0 ${large} 1 ${p(R, a2)} L${p(r, a2)} A${r},${r} 0 ${large} 0 ${p(r, a1)} Z`;
  };
  if (!total) paths = `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="var(--line)" stroke-width="${R - r}"/>`;
  for (const p of parts) {
    if (!p.value) continue;
    const a1 = a0 + (2 * Math.PI * p.value) / total - (parts.filter((x) => x.value).length > 1 ? 0.02 : 0.0001);
    paths += parts.filter((x) => x.value).length === 1
      ? `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="${p.color}" stroke-width="${R - r}"><title>${esc(p.name)}: ${p.value}</title></circle>`
      : `<path class="slice" d="${arc(a0, a1)}" fill="${p.color}"><title>${esc(p.name)}: ${p.value} (${Math.round((100 * p.value) / total)}%)</title></path>`;
    a0 += (2 * Math.PI * p.value) / total;
  }
  return `<div class="donut-wrap"><div class="chart"><svg viewBox="0 0 150 150" width="${size}" role="img" aria-label="Donut chart">${paths}
      <text x="75" y="74" text-anchor="middle" style="font: 700 22px var(--font); fill: var(--ink)">${esc(label || total)}</text>
      <text x="75" y="92" text-anchor="middle" class="axis">${esc(sub)}</text></svg></div>
    <div class="legend">${parts.map((p) => `<span><span><i style="background:${p.color}"></i>${esc(p.name)}</span><b>${p.value}</b></span>`).join("")}</div></div>`;
}

function hbars(rows, { max = null } = {}) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.parts.reduce((s, p) => s + p.value, 0)));
  if (!rows.length) return `<p class="empty">No data yet.</p>`;
  return `<div class="hbars">${rows.map((r) => {
    const tot = r.parts.reduce((s, p) => s + p.value, 0);
    return `<div class="row"><span>${r.label}</span><span class="track">${r.parts.map((p) => (p.value ? `<i style="width:${(100 * p.value) / m}%;background:${p.color}" title="${esc(p.name)}: ${p.value}"></i>` : "")).join("")}</span><b class="num" style="text-align:right">${r.right ?? tot}</b></div>`;
  }).join("")}</div>`;
}

function areaChart(labels, series, { height = 200, every = null } = {}) {
  const W = 640, H = height, pad = { l: 34, r: 8, t: 12, b: 26 };
  const max = Math.max(4, ...series.flatMap((s) => s.values));
  const step = Math.ceil(max / 4), top = step * 4;
  const n = Math.max(1, labels.length - 1);
  const x = (i) => pad.l + ((W - pad.l - pad.r) * i) / n;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const id = "g" + Math.random().toString(36).slice(2, 7);
  let svg = `<defs>${series.map((s, k) => `<linearGradient id="${id}${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity="0.28"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`).join("")}</defs>`;
  for (let k = 0; k <= 4; k++) svg += `<line class="gridline" x1="${pad.l}" x2="${W - pad.r}" y1="${y(k * step)}" y2="${y(k * step)}"/><text class="axis" x="${pad.l - 6}" y="${y(k * step) + 4}" text-anchor="end">${k * step}</text>`;
  const ev = every ?? Math.max(1, Math.ceil(labels.length / 7));
  labels.forEach((lab, i) => { if (i % ev === 0) svg += `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(lab)}</text>`; });
  const smooth = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  series.forEach((s, k) => {
    const pts = s.values.map((v, i) => [x(i), y(v)]);
    const line = smooth(pts);
    svg += `<path d="${line} L${x(pts.length - 1)},${y(0)} L${x(0)},${y(0)} Z" fill="url(#${id}${k})"/>`;
    svg += `<path d="${line}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.values.forEach((v, i) => { svg += `<circle cx="${x(i)}" cy="${y(v)}" r="7" fill="transparent"><title>${esc(labels[i])} · ${esc(s.name)}: ${v}</title></circle>`; });
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Area chart">${svg}</svg>
    <div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div></div>`;
}

function heatStrip(values, label = (i, v) => `${v}`) {
  const max = Math.max(1, ...values);
  return `<div class="heat">${values.map((v, i) => `<i title="${esc(label(i, v))}" style="background:${v ? `color-mix(in srgb, var(--blue) ${Math.round(18 + (82 * v) / max)}%, var(--surface))` : "var(--blue-50)"}"></i>`).join("")}</div>`;
}

function barChart(labels, series, { height = 180, every = 5 } = {}) {
  const W = 640, H = height, pad = { l: 34, r: 6, t: 10, b: 24 };
  const totals = labels.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const max = Math.max(4, ...totals);
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const bw = (W - pad.l - pad.r) / labels.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  let svg = "";
  for (let k = 0; k <= 4; k++) svg += `<line class="gridline" x1="${pad.l}" x2="${W - pad.r}" y1="${y(k * step)}" y2="${y(k * step)}"/><text class="axis" x="${pad.l - 6}" y="${y(k * step) + 4}" text-anchor="end">${k * step}</text>`;
  labels.forEach((lab, i) => {
    let acc = 0;
    const x = pad.l + i * bw + 2;
    series.forEach((s) => {
      const v = s.values[i];
      if (!v) return;
      const y0 = y(acc), y1 = y(acc + v);
      const gap = acc ? 2 : 0;
      svg += `<rect class="bar" x="${x}" y="${y1}" width="${Math.max(1, bw - 4)}" height="${Math.max(1, y0 - y1 - gap)}" rx="4" fill="${s.color}"><title>${esc(lab)} · ${esc(s.name)}: ${v}</title></rect>`;
      acc += v;
    });
    if (i % every === 0) svg += `<text class="axis" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(lab)}</text>`;
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">${svg}</svg>
    <div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div></div>`;
}

function lineChart(labels, series, { height = 180, yMax = null, ySuffix = "", legend = series.length > 1 } = {}) {
  const W = 640, H = height, pad = { l: 40, r: 10, t: 12, b: 24 };
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  const max = yMax ?? Math.max(4, ...all);
  const step = yMax ? yMax / 4 : Math.ceil(max / 4);
  const top = step * 4;
  const n = Math.max(1, labels.length - 1);
  const x = (i) => pad.l + ((W - pad.l - pad.r) * i) / n;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  let svg = "";
  for (let k = 0; k <= 4; k++) svg += `<line class="gridline" x1="${pad.l}" x2="${W - pad.r}" y1="${y(k * step)}" y2="${y(k * step)}"/><text class="axis" x="${pad.l - 6}" y="${y(k * step) + 4}" text-anchor="end">${Math.round(k * step)}${ySuffix}</text>`;
  const every = Math.max(1, Math.ceil(labels.length / 6));
  labels.forEach((lab, i) => { if (i % every === 0 || i === labels.length - 1) svg += `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(lab)}</text>`; });
  series.forEach((s) => {
    const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
    if (pts.length > 1) svg += `<polyline fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" points="${pts.map((p) => p.join(",")).join(" ")}"/>`;
    s.values.forEach((v, i) => {
      if (v == null) return;
      svg += `<circle cx="${x(i)}" cy="${y(v)}" r="${labels.length > 30 ? 2 : 4}" fill="${s.color}" stroke="var(--surface)" stroke-width="2"><title>${esc(s.name)} · ${esc(labels[i])}: ${v}${ySuffix}</title></circle>`;
    });
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart">${svg}</svg>
    ${legend ? `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>` : ""}</div>`;
}

/** Tooltip of a skill bar: where the % comes from. */
function skillTip(x) {
  const parts = [];
  if (x.levels) parts.push(`success · easy ${x.levels[0]}% · medium ${x.levels[1]}% · hard ${x.levels[2]}%`);
  if (x.code != null) parts.push(`code ${x.code}% (counts 80%)`);
  if (x.quick != null) parts.push(`other types ${x.quick}%${x.code != null ? " (20%)" : ""}`);
  if (x.code == null && x.proven === false) parts.push("not shown in code yet");
  if (x.codeMistakes) parts.push(`${x.codeMistakes} mistake(s) found in their code`);
  parts.push(`${x.solved} solved, ${x.failed} not`, `next level: ${x.target}`);
  return parts.join(" · ");
}

// ======================================================= sortable table
// The rows are in the returned HTML right away, so a view can wire its buttons
// ($$("[data-del]")…) just after rendering. Sorting moves the existing rows instead of
// redrawing them, so those buttons keep working after a sort too.
function table(columns, rows, { onRow, sort, empty = "Nothing here yet." } = {}) {
  const id = "t" + Math.random().toString(36).slice(2, 8);
  let key = sort?.key ?? null, asc = sort?.asc ?? false;
  const order = () => (key ? [...rows.keys()].sort((x, y) => {
    const va = rows[x][key], vb = rows[y][key];
    const r = va == null ? 1 : vb == null ? -1 : typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
    return asc ? r : -r;
  }) : [...rows.keys()]);
  const thClass = (c) => `${c.num ? "num" : ""} ${c.sort && c.sort === key ? `sorted ${asc ? "asc" : ""}` : ""}`;
  setTimeout(() => {
    const root = document.getElementById(id);
    if (!root) return;
    const tbody = $("tbody", root);
    $$("th[data-sort]", root).forEach((th) => th.onclick = () => {
      const k = th.dataset.sort; asc = key === k ? !asc : false; key = k;
      $$("th", root).forEach((h, n) => (h.className = thClass(columns[n])));
      const trs = Object.fromEntries($$("tr", tbody).map((tr) => [tr.dataset.i, tr]));
      order().forEach((i) => tbody.appendChild(trs[i]));
    });
    if (onRow) $$("tbody tr", root).forEach((tr) => {
      const go = (e) => { if (e.target.closest("button, a, input, select, textarea, summary")) return; onRow(rows[Number(tr.dataset.i)]); };
      tr.onclick = go;
      tr.onkeydown = (e) => { if (e.key === "Enter" && e.target === tr) go(e); };
    });
  });
  return `<div class="table-wrap" id="${id}"><table><thead><tr>${columns.map((c) => `<th ${c.sort ? `data-sort="${c.sort}"` : ""} class="${thClass(c)}">${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${order().map((i) => `<tr data-i="${i}" ${onRow ? 'class="clickable" tabindex="0"' : ""}>${columns.map((c) => `<td class="${c.num ? "num" : ""}">${c.html(rows[i])}</td>`).join("")}</tr>`).join("")}</tbody></table>
    ${rows.length ? "" : `<p class="empty">${esc(empty)}</p>`}</div>`;
}

async function loadWeekSummary() {
  const box = $("#ov-week");
  if (!box) return;
  const [s] = await Promise.all([api("/summary").catch(() => null), loadSkillDefs()]);
  if (!s || !$("#ov-week")) return;
  const names = (xs) => xs.map((x) => `<a href="#/student/${esc(x.discord_id)}">${esc(x.name || x.discord_id)}</a>`).join(", ");
  const act = { checkin: "A short word to the students who went quiet", stuck: "Look at where the stuck students fail (Challenges → a challenge → Why students fail)", integrity: `<a href="#/integrity">Review the flagged submissions</a>` };
  box.innerHTML = `<div class="panel-head"><h2>This week</h2><span class="muted small">also sent to you by DM on Mondays</span></div>
    <div class="grid cols-2-even">
      <div class="small stack" style="gap:6px">
        <div>👥 <b>${s.active}/${s.students}</b> students active · ✅ <b>${s.solved}</b> solved <span class="muted">(previous week ${s.solvedPrev})</span></div>
        ${s.movers.length ? `<div>🚀 Top: ${s.movers.map((m) => `<a href="#/student/${esc(m.discord_id)}">${esc(m.name || m.discord_id)}</a> +${m.pts}`).join(", ")}</div>` : ""}
        ${s.stuck.length ? `<div>🧱 Stuck: ${names(s.stuck)}</div>` : ""}
        ${s.quiet.length ? `<div>😶 Went quiet: ${names(s.quiet)}</div>` : ""}
        ${s.weakest ? `<div>📉 Weakest class skill: <b>${esc(skillLabel(s.weakest.skill))}</b> (${s.weakest.mastery}%)</div>` : ""}
      </div>
      <div><b class="small">Suggested</b><ul class="small" style="margin:6px 0 0;padding-left:18px">${s.actions.map((a) => `<li>${a.startsWith("practice:") ? `<a href="#/skills">Send a practice set on ${esc(skillLabel(a.split(":")[1]))}</a> to the students who need it` : act[a] || a}</li>`).join("") || "<li>Nothing urgent. 👌</li>"}</ul></div>
    </div>`;
}

// ============================================================ skills
async function loadSkillDefs() {
  if (!S.skillDefs) { const d = await api("/path"); S.skillDefs = d.skills; S.pathDefaults = d.defaults; }
  return S.skillDefs;
}
const skillLabel = (k) => { const d = (S.skillDefs || []).find((x) => x.key === k); return d ? `${d.emoji} ${d.en}` : k; };
const skillTags = (csv) => (csv || "").split(",").filter(Boolean).map((k) => `<span class="tag skill">${esc(skillLabel(k))}</span>`).join(" ");
// same thresholds as the bot: 65%+ strong (reliable at medium or hard), 35–64% getting there, under 35% needs work
const masteryColor = (m) => (m == null ? "var(--surface-2)" : m >= 65 ? "var(--up-bg)" : m >= 35 ? "var(--warn-bg)" : "var(--down-bg)");
const masteryInk = (m) => (m == null ? "var(--ink-faint)" : m >= 65 ? "var(--up)" : m >= 35 ? "var(--warn)" : "var(--down)");

// ============================================================ router
const routes = {
  overview: viewOverview, students: viewStudents, student: viewStudent, challenges: viewChallenges,
  assignments: viewAssignments, contests: viewContests, contest: viewContest, teams: viewTeams, settings: viewSettings,
  daily: viewDaily, points: viewPoints, integrity: viewIntegrity, sessions: viewSessions, session: viewSession, skills: viewSkills, events: viewEvents,   // path: see extras.js
};
async function route() {
  const [name, arg] = (location.hash.replace(/^#\//, "") || "overview").split("/");
  const fn = routes[name] || viewOverview;
  const parent = { student: "students", contest: "contests", session: "sessions", project: "projects" }[name] || name;
  $$("#nav a").forEach((a) => a.setAttribute("aria-current", a.getAttribute("href") === `#/${parent}` ? "page" : "false"));
  if (dlg.open) dlg.close();
  if (!S.g) return viewNoGuild();
  view.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    await fn(arg ? decodeURIComponent(arg) : undefined);
  } catch (e) {
    view.innerHTML = `<div class="notice"><b>Couldn't load this page.</b> ${esc(e.message)}</div>`;
  }
  view.focus({ preventScroll: true });
}
window.addEventListener("hashchange", route);

function viewNoGuild() {
  view.innerHTML = `<div class="page-head"><div><h1>Welcome to ClassBot</h1><p class="sub">No Discord server is connected yet.</p></div></div>
    <div class="panel stack"><p>In your Discord server, go to the channel where the bot should post and run <code>/teacher setup</code>. Then reload this page.</p>
    <p class="muted">Every server where someone uses the bot appears in the menu on the left.</p></div>`;
}

// ========================================================== overview
async function viewOverview() {
  const d = await api("/overview");
  S.guild = d.guild;
  const pill = $("#pill-reports");
  pill.hidden = !d.reports;
  pill.textContent = d.reports;
  setIntegrityPill(d.flagged);
  setTimeout(() => loadWeekSummary(), 0);
  setTimeout(() => (typeof loadLive === "function" ? loadLive() : null), 0);
  setTimeout(() => { const sel = $("#ov-track"); if (sel) sel.onchange = () => busy(sel, () => changeTrack(sel.value, () => viewOverview())); }, 0);
  const days = d.activity.map((a) => fmtDate(Date.parse(a.day) / 1000));
  const last7 = (arr) => arr.slice(-7);
  const langs = `<label class="hero-track"><span>This class learns</span><select id="ov-track" aria-label="What the class learns">${trackOptions(trackKeyOf(d.guild))}</select><small>Challenges, daily, path and lessons follow it</small></label>`;
  const kinds = Object.keys(KIND);
  const byKind = Object.fromEntries((d.byKind || []).map((k) => [k.kind, k]));
  const top = (d.top || []).slice(0, 8);
  const topMax = Math.max(1, ...top.map((s) => s.season_pts));
  view.innerHTML = `
    <div class="stack">
      <section class="hero">
        <div class="hero-main"><h1>${esc(d.guild.name || "Your class")}</h1>
          <p class="sub">${esc(d.guild.season)} · bot speaks ${d.guild.lang === "fr" ? "French" : "English"}</p>
          <div class="actions">
            <a class="btn primary" href="#/assignments">${icon("clipboard")}Assign a challenge</a>
            <a class="btn" href="#/challenges/new">${icon("plus")}New challenge</a>
            <a class="btn" href="/api/export.csv?g=${encodeURIComponent(S.g)}" download>${icon("download")}Export grades</a>
          </div></div>
        ${langs}
      </section>
      <div class="figures">
        <div class="figure"><div class="ico">${icon("users")}</div><b>${d.students}</b><span>students · ${d.linked} verified on HackerRank</span></div>
        <div class="figure"><div class="ico">${icon("activity")}</div>${delta(d.active7, d.active_prev7)}<b>${d.active7}</b><span>active this week</span>${sparkline(last7(d.activity.map((a) => a.active ?? 0)))}</div>
        <div class="figure"><div class="ico">${icon("check")}</div>${delta(d.solved7, d.solved_prev7)}<b>${d.solved7}</b><span>solved this week</span>${sparkline(last7(d.activity.map((a) => a.solved)))}</div>
        <div class="figure"><div class="ico">${icon("target")}</div><b>${pct(d.accuracy30)}</b><span>accuracy, last 30 days</span></div>
        <div class="figure"><div class="ico">${icon("swords")}</div>${delta(d.duels7, d.duels_prev7)}<b>${d.duels7}</b><span>duels this week</span></div>
        <div class="figure"><div class="ico">${icon("trophy")}</div><b>${d.live_contests}</b><span>live contest${d.live_contests === 1 ? "" : "s"} · ${d.contests} finished</span></div>
      </div>
      ${d.missingMigrations?.length ? `<div class="notice danger"><b>Your database needs an update.</b> Some bot features will fail until you run <code>npm run update</code> in the classbot folder (missing: ${esc(d.missingMigrations.slice(0, 3).join(", "))}${d.missingMigrations.length > 3 ? "…" : ""}).</div>` : ""}
      <section class="panel" id="ov-live"><p class="muted small">Loading what's happening in class…</p></section>
      <section class="panel" id="ov-week"><p class="muted small">Loading this week's summary…</p></section>
      ${!d.guild.arena_channel ? `<div class="notice warn">📣 <b>No #arena channel yet.</b> Duels need one, and other public bot messages land in the channel where you ran setup. Create a channel named <code>arena</code>, or pick one in <a href="#/settings">Settings</a>.</div>` : ""}
      ${d.flagged || d.live_sessions ? `<div class="notice">${d.live_sessions ? `🟢 <a href="#/sessions">${d.live_sessions} class session${d.live_sessions > 1 ? "s" : ""} running now</a>. ` : ""}${d.flagged ? `🛡️ <a href="#/integrity">${d.flagged} submission${d.flagged > 1 ? "s" : ""} with warning signs</a> to review (pasting, leaving the page, code copied from a classmate…).` : ""}</div>` : ""}
      ${d.reports || d.claims ? `<div class="notice warn">${d.reports ? `🚩 <a href="#/challenges">${d.reports} challenge${d.reports > 1 ? "s" : ""} reported by students</a> need${d.reports > 1 ? "" : "s"} a look. ` : ""}${d.claims ? `🙋 ${d.claims} self-reported HackerRank solve${d.claims > 1 ? "s" : ""} wait for your approval (below).` : ""}</div>` : ""}
      <div class="grid cols-2">
        <section class="panel"><div class="panel-head"><h2>Activity <span class="muted">last 30 days</span></h2></div>
          ${areaChart(days, [
            { name: "Solved", color: "var(--s1)", values: d.activity.map((a) => a.solved) },
            { name: "Not solved", color: "#f59e0b", values: d.activity.map((a) => a.failed) },
          ])}
          <h3>Students active per day</h3>${heatStrip(d.activity.map((a) => a.active ?? 0), (i, v) => `${days[i]}: ${v} active`)}</section>
        <section class="panel"><div class="panel-head"><h2>Needs your attention</h2><a class="small" href="#/students">All students →</a></div>
          ${d.attention.length ? `<ul class="attention">${d.attention.map((s) => `<li><a class="who-cell" href="#/student/${s.discord_id}">${avatar(s.name, s.discord_id)}<b>${esc(s.name || s.discord_id)}</b></a><span class="muted small" style="text-align:right">${esc(s.attention.join(" · "))}</span></li>`).join("")}</ul>`
            : `<p class="empty">Everyone is on track. 🎉</p>`}</section>
      </div>
      <div class="grid cols-3">
        <section class="panel"><h2>Solved by type <span class="muted">30 days</span></h2>
          ${donut(kinds.map((k) => ({ name: KIND[k], value: byKind[k]?.solved ?? 0, color: KIND_COLORS[k] })), { sub: "solved" })}</section>
        <section class="panel"><h2>Success by level <span class="muted">30 days</span></h2>
          ${hbars(["easy", "medium", "hard"].map((dif) => { const r = (d.byDiff || []).find((x) => x.difficulty === dif) || { solved: 0, failed: 0 }; const n = r.solved + r.failed; return { label: diffTag(dif), right: n ? `${Math.round((100 * r.solved) / n)}%` : "—", parts: [{ name: "Solved", value: r.solved, color: "var(--s1)" }, { name: "Not solved", value: r.failed, color: "var(--s2)" }] }; }))}
          <h3>Success by type</h3>
          ${hbars(kinds.filter((k) => byKind[k]).map((k) => { const r = byKind[k]; const n = r.solved + r.failed; return { label: esc(KIND[k]), right: n ? `${Math.round((100 * r.solved) / n)}%` : "—", parts: [{ name: "Solved", value: r.solved, color: KIND_COLORS[k] }, { name: "Not solved", value: r.failed, color: "var(--line-strong)" }] }; }))}</section>
        <section class="panel"><h2>Code submitted <span class="muted">by language</span></h2>
          ${donut((d.langs || []).map((l, i) => ({ name: LANG[l.lang] || l.lang, value: l.n, color: ["var(--s1)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s2)"][i % 6] })), { sub: "submissions" })}
          <p class="muted small" style="margin-top:12px">Write-code problems: every submission is run on hidden tests.</p></section>
      </div>
      <div class="grid cols-2-even">
        <section class="panel"><div class="panel-head"><h2>Season leaderboard</h2><a class="small" href="#/students">Full list →</a></div>
          ${top.length ? `<ol class="rank">${top.map((s, i) => `<li><span class="pos">${["🥇", "🥈", "🥉"][i] ?? i + 1}</span>${avatar(s.name, s.discord_id)}<span><a href="#/student/${s.discord_id}"><b>${esc(s.name || s.discord_id)}</b></a> <span class="muted small">lvl ${s.level}${s.daily_streak > 1 ? ` · ${s.daily_streak}🔥` : ""}</span><div class="bar"><i style="width:${(100 * s.season_pts) / topMax}%"></i></div></span><b class="num">${s.season_pts}</b></li>`).join("")}</ol>` : `<p class="empty">No points this season yet.</p>`}</section>
        <section class="panel"><div class="panel-head"><h2>Latest answers</h2><span class="muted small">${d.movers.length ? `Top this week: ${esc(d.movers[0].name || "?")} +${d.movers[0].pts}` : ""}</span></div>
          ${d.feed.length ? `<ul class="feed">${d.feed.map((f) => `<li><time>${fmtAgo(f.at)}</time><span><a href="#/student/${f.discord_id}">${esc(f.name || "?")}</a> ${status(f.status)} <b>${esc(f.title)}</b> ${diffTag(f.difficulty)}${f.points ? ` <span class="muted">+${f.points}</span>` : ""}</span></li>`).join("")}</ul>` : `<p class="empty">No answers yet. Students start with /practice.</p>`}</section>
      </div>
      <section class="panel"><h2>Quick actions</h2>
        <div class="quick">
          <a href="#/assignments"><span class="ico">${icon("clipboard")}</span><span><b>Give an assignment</b><small>to everyone, a team or a few students</small></span></a>
          <a href="#/challenges/new"><span class="ico">${icon("code")}</span><span><b>Write a code problem</b><small>tests computed from your solution</small></span></a>
          <a href="#/challenges/ai"><span class="ico">${icon("spark")}</span><span><b>Generate with AI</b><small>checked by running it</small></span></a>
          <a href="#/contests"><span class="ico">${icon("trophy")}</span><span><b>Follow a contest</b><small>live commentary in #arena</small></span></a>
          <a href="#/students"><span class="ico">${icon("users")}</span><span><b>Check on students</b><small>trends, code, gaps</small></span></a>
          <a href="#/settings"><span class="ico">${icon("gear")}</span><span><b>Scoring & checks</b><small>points per type, diagnostics</small></span></a>
        </div></section>
      ${d.claimList?.length ? `<section class="panel"><h2>Self-reported HackerRank solves</h2><p class="muted small">HackerRank couldn't be reached when these students pressed Check. They get no points until you approve. Open their HackerRank profile to check.</p>
        <div class="table-wrap"><table>${d.claimList.map((c) => `<tr><td><a href="#/student/${c.discord_id}">${esc(c.name || "?")}</a>${c.hr_display ? `<div class="small"><a href="https://www.hackerrank.com/profile/${encodeURIComponent(c.hr_display)}" target="_blank" rel="noopener">${esc(c.hr_display)}</a>${c.hr_verified ? "" : " (not verified)"}</div>` : ""}</td><td>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a>` : esc(c.title)}</td>
          <td class="small">${/^https?:\/\//i.test(c.answer_given || "") ? `<a href="${esc(c.answer_given)}" target="_blank" rel="noopener noreferrer">their link</a>` : c.answer_given ? `<code>${esc(c.answer_given).slice(0, 60)}</code>` : '<span class="muted">no link</span>'}</td><td class="muted small">${fmtAgo(c.finished_at)}</td>
          <td><button class="btn small" data-review="${c.id}" data-ok="1">Approve</button> <button class="btn small danger" data-review="${c.id}" data-ok="0">Reject</button></td></tr>`).join("")}</table></div></section>` : ""}
    </div>`;
  $$("[data-review]").forEach((b) => b.onclick = () => busy(b, async () => {
    await api(`/attempts/${b.dataset.review}/review`, { method: "POST", body: { approve: b.dataset.ok === "1" } });
    toast(b.dataset.ok === "1" ? "Solve approved" : "Solve rejected and points removed");
    viewOverview();
  }));
}

// ========================================================== students
async function loadStudents(force = false) {
  if (!S.students || force) S.students = await api("/students");
  return S.students;
}

async function viewStudents() {
  const rows = await loadStudents(true);
  const teams = [...new Set(rows.map((r) => r.team).filter(Boolean))];
  view.innerHTML = `
    <div class="page-head"><div><h1>Students</h1><p class="sub">${rows.length} student${rows.length === 1 ? "" : "s"} · points for ${esc(S.guild?.season || "this season")}</p></div>
      <a class="btn" href="/api/export.csv?g=${encodeURIComponent(S.g)}" download>Export CSV</a></div>
    <div class="toolbar">
      <input type="search" id="q" placeholder="Search by name or HackerRank username" aria-label="Search students" style="flex:1;min-width:220px">
      <select id="filter" aria-label="Filter students">
        <option value="">All students</option><option value="attention">Needs attention</option><option value="up">Improving</option>
        <option value="down">Slipping</option><option value="inactive">Inactive</option>
        ${teams.map((t) => `<option value="team:${esc(t)}">Team ${esc(t)}</option>`).join("")}
      </select>
    </div>
    <section class="panel" id="list"></section>`;
  const draw = () => {
    const q = $("#q").value.toLowerCase(), f = $("#filter").value;
    const shown = rows.filter((r) => (!q || `${r.name} ${r.hr_display}`.toLowerCase().includes(q))
      && (!f || (f === "attention" ? r.attention.length : f.startsWith("team:") ? r.team === f.slice(5) : r.trend === f)));
    $("#list").innerHTML = table([
      { label: "Student", sort: "name", html: (r) => `${r.attention.length ? `<span class="mark" title="${esc(r.attention.join(", "))}">${esc(r.name || r.discord_id)}</span>` : esc(r.name || r.discord_id)}<div class="muted small">${r.hr_display ? `${esc(r.hr_display)}${r.hr_verified ? " ✓" : " (unverified)"}` : "not linked"}</div>` },
      { label: "Team", sort: "team", html: (r) => esc(r.team || "—") },
      { label: "Level", sort: "level", num: true, html: (r) => `${r.level}` },
      { label: "Season pts", sort: "season_pts", num: true, html: (r) => `${r.season_pts}` },
      { label: "Solved", sort: "solved", num: true, html: (r) => `${r.solved}` },
      { label: "Accuracy", sort: "accuracy", num: true, html: (r) => pct(r.accuracy) },
      { label: "Trend", sort: "trend", html: (r) => trend(r.trend) },
      { label: "Streak", sort: "daily_streak", num: true, html: (r) => (r.daily_streak ? `${r.daily_streak} 🔥` : "—") },
      { label: "Open tasks", sort: "open_asg", num: true, html: (r) => `${r.open_asg}${r.missed_asg ? ` <span class="status missed">(${r.missed_asg} missed)</span>` : ""}` },
      { label: "Last active", sort: "last_active", html: (r) => `<span class="small">${fmtAgo(r.last_active)}</span>` },
    ], shown, { onRow: (r) => (location.hash = `#/student/${r.discord_id}`), sort: { key: "season_pts" }, empty: "No students match. Students appear here after they use the bot once." });
  };
  $("#q").oninput = draw;
  $("#filter").onchange = draw;
  draw();
}

const MISTAKE = {
  tle: ["⏱️ Too slow", "correct code that times out on big inputs: complexity"], hidden: ["🕳️ Edge cases", "passes the samples, fails hidden tests"],
  crash: ["💥 Crashes", "index out of range, bad input reading"], compile: ["🧱 Doesn't compile", "syntax errors"],
  tracing: ["🔮 Reading code", "misses \"predict the output\""], bugs: ["🐞 Spotting bugs", "misses \"find the bug\""],
  bigo: ["⏱️ Big-O", "misses complexity questions"], concepts: ["❓ Concepts", "misses multiple-choice questions"], hints: ["💡 Hints", "uses hints very often"],
};
function coachPanel(c) {
  if (!c) return "";
  const skills = c.skills.filter((x) => x.evidence >= 2).sort((a, b) => a.mastery - b.mastery);
  const few = c.skills.length - skills.length;
  return `<section class="panel"><h2>Coach</h2>
    <div class="grid cols-2-even">
      <div>
        <h3>Skills <span class="muted small">(weakest first)</span></h3>
        <p class="muted small skill-legend">Harder challenges reach higher: easy alone tops out at 50% · 80% from code, 20% from the other types · <span class="sk-pill">no code</span> not shown in code yet (max 20%) · <span class="sk-pill bad">🐞 2</span> mistakes found in their code · hover a bar for details</p>
        ${skills.length ? `<div class="skill-bars">${skills.map((x) => `<div class="skill-bar ${x.proven === false ? "unproven" : ""}" title="${esc(skillTip(x))}">
          <span class="sk-name">${esc(skillLabel(x.key))}</span>
          <span class="track"><i style="width:${Math.max(2, x.mastery)}%;background:${masteryInk(x.mastery)}"></i></span>
          <b class="num" style="color:${masteryInk(x.mastery)}">${x.mastery}%</b>
          <span class="sk-tags">${x.proven === false ? `<span class="sk-pill">no code</span>` : ""}${x.codeMistakes ? `<span class="sk-pill bad">🐞 ${x.codeMistakes}</span>` : ""}</span>
        </div>`).join("")}</div>` : `<p class="empty">Not enough results yet.</p>`}
        ${few ? `<p class="muted small">+ ${few} skill(s) with too few tries to judge yet.</p>` : ""}
      </div>
      <div>
        <h3>Recurring mistakes</h3>
        ${c.mistakes.length ? `<ul class="flags">${c.mistakes.map((m) => `<li><b>${esc(MISTAKE[m.key]?.[0] || m.key)}</b> · ${m.count}/${m.total} · <span class="muted small">${esc(MISTAKE[m.key]?.[1] || "")}</span></li>`).join("")}</ul>` : `<p class="muted small">No pattern of mistakes.</p>`}
        <h3>Next for this student</h3>
        <p class="small">Focus: ${c.focus.map((k) => `<span class="tag skill">${esc(skillLabel(k))}</span>`).join(" ") || "—"}</p>
        <p class="small">🧭 Path: <b>${c.path.done}/${c.path.total}</b> steps${c.path.current ? ` · now ${esc(skillLabel(c.path.current.skill))} (${esc(DIFF[c.path.current.level])}, ${c.path.current.solved}/${c.path.current.need})` : " · finished"}</p>
        <p class="small">📋 Daily plan streak: <b>${c.plan.streak}</b> (best ${c.plan.best})${c.plan.remind ? " · gets the plan every morning" : ""}</p>
      </div>
    </div></section>`;
}

/** "What to work on": each skill with the evidence behind it, so the teacher sees WHY, and what to revisit. */
function workOnPanel(c, sid) {
  const list = c?.workOn || [];
  const head = `<div class="panel-head"><h2>🎯 What to work on, and why</h2><span class="muted small">from their own answers and code, last 4 months</span></div>`;
  if (!list.length) return `<section class="panel" id="workon">${head}<p class="${c?.workOnError ? "notice" : "muted"}">${c?.workOnError
    ? `Couldn't build this section: ${esc(c.workOnError)}` : "Nothing to point out yet: every skill they tried is going well, or they haven't answered enough challenges."}</p></section>`;
  const ev = (rows, icon, label) => rows.length ? `<div class="wo-ev"><b class="small">${icon} ${label}</b><ul>${rows.map((r) =>
    `<li><a href="#" data-wocid="${r.challenge_id}">${esc(r.title)}</a> ${diffTag(r.difficulty)} <span class="muted small">${esc(fmtAgo(r.when))}</span><div class="small">${esc(r.detail)}</div></li>`).join("")}</ul></div>` : "";
  // folded by default (it's long): the summary line already says which skills, and how weak
  return `<section class="panel" id="workon"><details class="wo-fold">
    <summary><span class="wo-sum-title">🎯 What to work on, and why</span>
      <span class="wo-chips">${list.map((w) => `<span class="tag skill">${esc(skillLabel(w.skill))} <b style="color:${masteryInk(w.mastery)}">${w.mastery}%</b></span>`).join(" ")}</span>
      <span class="muted small wo-hint">show details</span></summary>
    <p class="muted small" style="margin:10px 0 12px">From their own answers and code, last 4 months.</p>
    <div class="wo-list">${list.map((w) => `<article class="wo">
      <header>
        <b>${esc(skillLabel(w.skill))}</b>
        <b class="num" style="color:${masteryInk(w.mastery)}">${w.mastery}%</b>
        <span class="muted small">${w.code != null ? `code ${w.code}%` : "not shown in code yet"}${w.quick != null ? ` · other types ${w.quick}%` : ""} · start at ${esc(DIFF[w.level] || w.level)}</span>
      </header>
      <p class="wo-why"><b>Why:</b> ${esc(w.why)}</p>
      ${ev(w.failedCode, "💻", "Code challenges not solved")}
      ${ev(w.codeMistakes, "🐞", `Mistakes in their code about ${skillLabel(w.skill).replace(/^\S+\s/, "")}`)}
      ${ev(w.missedQuick, "❓", "Questions missed")}
      ${w.revisit?.length ? `<div class="wo-revisit"><b class="small">📖 What to revisit</b><ul>${w.revisit.map((x) => `<li class="small">${esc(x)}</li>`).join("")}</ul>
        ${w.lesson ? `<p class="small muted" style="margin:4px 0 0">Lesson in <code>/path</code>: <b>${esc(w.lesson)}</b></p>` : ""}</div>` : ""}
      <p class="toolbar" style="margin:10px 0 0">
        <button class="btn small primary" data-wonote="${esc(w.skill)}">✍️ Write a note to the student</button>
        <button class="btn small" data-wopset="${esc(w.skill)}" data-level="${esc(w.level)}">📚 Give 3 challenges on it</button>
        <button class="btn small" data-wogen="${esc(w.skill)}" data-level="${esc(w.level)}">✨ Generate new ones</button></p>
    </article>`).join("")}</div></details></section>`;
}
function wireWorkOn(sid, name) {
  $$("[data-wocid]").forEach((a) => a.onclick = (e) => { e.preventDefault(); editChallenge(Number(a.dataset.wocid)); });
  $$("[data-wogen]").forEach((b) => b.onclick = () => genForSkillDialog(b.dataset.wogen, b.dataset.level));
  $$("[data-wopset]").forEach((b) => b.onclick = () => busy(b, async () => {
    const r = await api("/skills/practice-set", { method: "POST", body: { skill: b.dataset.wopset, students: [sid], count: 3, due_at: Math.floor(Date.now() / 1000) + 7 * 86400 } });
    toast(r.assignments ? `${r.assignments} challenge(s) assigned at their level, due in a week (sent by DM)` : "No new challenge left on this skill: use ✨ Generate new ones", !r.assignments);
  }));
  $$("[data-wonote]").forEach((b) => b.onclick = () => {
    const skill = b.dataset.wonote;
    openDialog(`Note to ${name || "the student"} · ${skillLabel(skill)}`, `
      <p class="muted small">The AI drafts it from the evidence above (the challenges, their mistakes, what to revisit). Edit it, then send it by Discord DM.</p>
      <textarea id="wn-t" maxlength="1900" style="min-height:200px;width:100%" placeholder="Writing the note…"></textarea>
      <p class="small" id="wn-st"></p>`,
      [{ label: "Send by DM", primary: true, action: async () => {
        const text = $("#wn-t", dlg).value.trim();
        if (!text) throw new Error("Write the note first");
        await api(`/students/${sid}/message`, { method: "POST", body: { text } });
        dlg.close(); toast("Note sent by DM");
      } }]);
    const ta = $("#wn-t", dlg), st = $("#wn-st", dlg);
    ta.disabled = true; st.textContent = "⏳ The AI is writing the note (up to 30 s)…";
    api(`/students/${sid}/workon-note`, { method: "POST", body: { skill } })
      .then((r) => { ta.value = r.text; st.textContent = ""; })
      .catch((e) => { st.innerHTML = `<span class="late-wait">${esc(e.message)}</span>`; })
      .finally(() => { ta.disabled = false; ta.focus(); });
  });
}

async function viewStudent(id) {
  const [d, list] = await Promise.all([api(`/students/${id}`), loadStudents(), loadSkillDefs()]);
  const row = list.find((r) => r.discord_id === id) || { attention: [], trend: "flat" };
  const p = d.player;
  const solvedRows = d.attempts.filter((a) => a.status === "solved" || a.status === "claimed");
  const notRows = d.attempts.filter((a) => a.status === "failed" || a.status === "expired");
  const intRows = d.attempts.filter((a) => a.integrity).map((a) => {
    const rep = parseJson(a.integrity) || {};
    const ex = parseJson(a.explain);
    return { ...a, discord_id: id, name: p.name, flags: rep.flags || [], level: rep.level || 0, stats: rep.stats || null, similar: rep.similar || [], editor: !!rep.editor, has_log: rep.editor, explain: ex ? { score: ex.score, questions: ex.questions, answers: ex.answers, feedback: ex.feedback } : null };
  });
  const contestLabels = d.contestList.map((c) => fmtDate(c.finished_at));
  const beat = d.contestList.map((c) => (c.participants > 1 ? Math.round(100 * (1 - (c.rank - 1) / (c.participants - 1))) : 100));
  const kinds = ["mcq", "complexity", "output", "bug", "write", "code"];
  const cell = (dif, k) => {
    const m = d.matrix.find((x) => x.difficulty === dif && x.kind === k);
    if (!m || !(m.solved + m.failed)) return `<td class="num muted">—</td>`;
    const r = Math.round((100 * m.solved) / (m.solved + m.failed));
    return `<td class="num" title="${m.solved} solved, ${m.failed} not solved"><b style="color:${r >= 70 ? "var(--up)" : r < 40 ? "var(--down)" : "inherit"}">${r}%</b> <span class="muted small">${m.solved}/${m.solved + m.failed}</span></td>`;
  };
  view.innerHTML = `
    <div class="page-head"><div>
      <h1>${row.attention.length ? `<span class="mark">${esc(p.name || id)}</span>` : esc(p.name || id)}</h1>
      <p class="sub">Level ${d.level.level} · ${esc(d.level.title)} · ${p.hr_display ? `HackerRank <a href="https://www.hackerrank.com/profile/${encodeURIComponent(p.hr_display)}" target="_blank" rel="noopener">${esc(p.hr_display)}</a> ${p.hr_verified ? '<span class="status solved">verified</span>' : `<span class="status expired">not verified</span>${p.hr_code ? ` <span class="muted small">(code ${esc(p.hr_code)})</span>` : ""}`}` : "HackerRank not linked"}${d.team ? ` · Team ${esc(d.team.name)}` : ""} · ${trend(row.trend)}</p></div>
      <div class="toolbar" style="margin:0">${p.hr_display && !p.hr_verified ? `<button class="btn" id="hr-ok" title="Only if you checked it's really their account">Mark HackerRank verified</button>` : ""}${p.hr_display ? `<button class="btn" id="hr-unlink">Unlink HackerRank</button>` : ""}<button class="btn" id="give">Give points</button><button class="btn primary" id="assign">Assign a challenge</button></div></div>
    <div class="stack">
      ${row.attention.length ? `<div class="notice"><b>Worth a check-in:</b> ${esc(row.attention.join(", "))}.</div>` : ""}
      <div class="figures">
        <div class="figure"><b>${d.seasonPoints}</b><span>season points${d.seasonRank ? ` · #${d.seasonRank} of ${d.seasonSize}` : ""}</span></div>
        <div class="figure"><b>${d.solved.total}</b><span>solved · ${d.solved.easy} easy, ${d.solved.medium} medium, ${d.solved.hard} hard</span></div>
        <div class="figure"><b>${pct(d.accuracy)}</b><span>accuracy (${d.failed} not solved)</span></div>
        <div class="figure"><b>${d.duels.w}–${d.duels.l}</b><span>duels won–lost · rating ${p.rating}</span></div>
        <div class="figure"><b>${p.daily_streak}</b><span>day daily streak</span></div>
        <div class="figure"><b>${d.contests.played}</b><span>contests · ${d.contests.wins} won · ${d.contests.podiums} podiums</span></div>
      </div>
      ${workOnPanel(d.coach, id)}
      ${coachPanel(d.coach)}
      <div class="grid cols-2-even">
        <section class="panel"><h2>Points per week</h2>${lineChart(d.weeks.map((w) => fmtDate(w.start)), [{ name: "Points", color: "var(--s1)", values: d.weeks.map((w) => w.pts) }])}</section>
        <section class="panel"><h2>Contest results</h2>${d.contestList.length > 0
          ? lineChart(contestLabels, [{ name: "Beat % of the class", color: "var(--s3)", values: beat }], { yMax: 100, ySuffix: "%" }) + `<p class="muted small">Higher is better: 100% means first place.</p>`
          : `<p class="empty">No contests yet.</p>`}</section>
      </div>
      <section class="panel"><h2>Strengths and gaps</h2><p class="muted small">Success rate by challenge type and difficulty.</p>
        <div class="table-wrap"><table><thead><tr><th></th>${kinds.map((k) => `<th class="num">${esc(KIND[k])}</th>`).join("")}</tr></thead>
        <tbody>${["easy", "medium", "hard"].map((dif) => `<tr><td>${diffTag(dif)}</td>${kinds.map((k) => cell(dif, k)).join("")}</tr>`).join("")}</tbody></table></div></section>
      <section class="panel">
        <div class="tabs" role="tablist">
          <button role="tab" data-tab="solved" aria-selected="true">Solved (${solvedRows.length})</button>
          <button role="tab" data-tab="not">Not solved (${notRows.length})</button>
          <button role="tab" data-tab="asg">Assignments (${d.assignments.length})</button>
          <button role="tab" data-tab="duels">Duels (${d.duelList.length})</button>
          <button role="tab" data-tab="points">Points log</button>
          <button role="tab" data-tab="integ">Integrity${intRows.filter((a) => a.level && !a.reviewed).length ? ` <span class="pill">${intRows.filter((a) => a.level && !a.reviewed).length}</span>` : ` (${intRows.length})`}</button>
        </div>
        <div id="tab"></div>
      </section>
    </div>`;

  const titleCell = (a) => `${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>` : esc(a.title)}<div class="muted small">${esc(KIND[a.kind] || a.kind)}</div>`;
  const tabs = {
    solved: () => table([
      { label: "Challenge", sort: "title", html: titleCell },
      { label: "Difficulty", sort: "difficulty", html: (a) => diffTag(a.difficulty) },
      { label: "Where", sort: "origin", html: (a) => esc(ORIGIN[a.origin] || a.origin) },
      { label: "How", html: (a) => [a.status === "claimed" ? (a.verified ? "self-reported, approved" : `self-reported <button class="btn small" data-review="${a.id}" data-ok="1">Approve</button> <button class="btn small danger" data-review="${a.id}" data-ok="0">Reject</button>`) : a.kind === "code" ? "verified on HackerRank" : a.kind === "write" ? (a.verified ? "passed all tests" : "judged by AI (runner was down)") : "", a.used_hint ? "used a hint" : "", a.tries > 1 ? (a.kind === "write" ? `${a.tries} submissions` : "second try") : ""].filter(Boolean).join(", ") || "first try" },
      { label: "Code", html: (a) => (a.kind === "write" ? codeView(a) : "") },
      { label: "Points", sort: "points", num: true, html: (a) => `${a.points}` },
      { label: "When", sort: "finished_at", html: (a) => `<span class="small">${fmtDateTime(a.finished_at)}</span>` },
    ], solvedRows, { sort: { key: "finished_at" }, empty: "Nothing solved yet." }),
    not: () => table([
      { label: "Challenge", sort: "title", html: titleCell },
      { label: "Difficulty", sort: "difficulty", html: (a) => diffTag(a.difficulty) },
      { label: "Where", sort: "origin", html: (a) => esc(ORIGIN[a.origin] || a.origin) },
      { label: "Result", sort: "status", html: (a) => status(a.status) },
      { label: "Their answer", html: codeView },
      { label: "When", sort: "finished_at", html: (a) => `<span class="small">${fmtDateTime(a.finished_at)}</span>` },
    ], notRows, { sort: { key: "finished_at" }, empty: "Nothing failed. 👏" }),
    asg: () => table([
      { label: "Challenge", sort: "title", html: (a) => `${esc(a.title)}${a.note ? `<div class="muted small">📝 ${esc(a.note)}</div>` : ""}` },
      { label: "Difficulty", html: (a) => diffTag(a.difficulty) },
      { label: "Status", sort: "status", html: (a) => status(a.status) },
      { label: "Due", sort: "due_at", html: (a) => `<span class="small">${fmtDateTime(a.due_at)}</span>` },
      { label: "Finished", sort: "completed_at", html: (a) => `<span class="small">${fmtDateTime(a.completed_at)}</span>` },
    ], d.assignments, { empty: "No assignments yet." }),
    duels: () => table([
      { label: "Opponent", sort: "opponent", html: (x) => `<a href="#/student/${x.opponent_id}">${esc(x.opponent || x.opponent_id)}</a>` },
      { label: "Result", html: (x) => (x.winner_id === id ? '<span class="status solved">Won</span>' : x.winner_id ? '<span class="status failed">Lost</span>' : '<span class="status expired">Draw</span>') },
      { label: "Mode", html: (x) => `${{ coding: "HackerRank", write: "Write code", quick: "Quick" }[x.mode] || x.mode} ${diffTag(x.difficulty)}` },
      { label: "Stake", num: true, html: (x) => (x.stake ? `${x.stake} 🪙` : "—") },
      { label: "When", sort: "finished_at", html: (x) => `<span class="small">${fmtDateTime(x.finished_at)}</span>` },
    ], d.duelList, { empty: "No duels yet." }),
    points: () => `<div class="grid cols-2-even"><div>${table([
        { label: "Source", html: (r) => esc(REASON[r.reason] || r.reason) },
        { label: "Points", num: true, html: (r) => `${r.pts}` },
        { label: "Times", num: true, html: (r) => `${r.n}` },
      ], d.byReason, { empty: "No points this season." })}</div><div>${table([
        { label: "When", html: (r) => `<span class="small">${fmtDateTime(r.created_at)}</span>` },
        { label: "Why", html: (r) => `${esc(REASON[r.reason] || r.reason)}${r.note ? ` <span class="muted small">${esc(r.note)}</span>` : ""}` },
        { label: "Points", num: true, html: (r) => `${r.amount > 0 ? "+" : ""}${r.amount}` },
      ], d.ledger)}</div></div>`,
    integ: () => intRows.length ? `<p class="muted small">Every answer sent from the code editor, newest first. Flags are reasons to look, not proof.</p><div class="flag-list">${intRows.map((a) => integrityCard(a, { showStudent: false })).join("")}</div>`
      : `<p class="empty">No code sent through the editor yet.</p>`,
  };
  const showTab = (k) => {
    $$("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === k)));
    $("#tab").innerHTML = tabs[k]();
    if (k === "integ") wireIntegrity($("#tab"), intRows, () => { S.students = null; viewStudent(id); });
    setTimeout(() => $$("#tab [data-review]").forEach((b) => b.onclick = () => busy(b, async () => {
      await api(`/attempts/${b.dataset.review}/review`, { method: "POST", body: { approve: b.dataset.ok === "1" } });
      toast("Saved");
      viewStudent(id);
    })), 0);
  };
  $$("[data-tab]").forEach((b) => b.onclick = () => showTab(b.dataset.tab));
  showTab("solved");
  $("#assign").onclick = () => assignDialog([id]);
  wireWorkOn(id, p.name);
  const hrAction = (action, msg) => async () => { await api(`/students/${id}/hackerrank`, { method: "POST", body: { action } }); toast(msg); S.students = null; viewStudent(id); };
  if ($("#hr-ok")) $("#hr-ok").onclick = () => confirmDialog("Mark this HackerRank account as theirs?", "Do this only if you checked it really belongs to this student. Their HackerRank solves and contest results will count for them.", "Mark verified", hrAction("verify", "HackerRank link verified"));
  if ($("#hr-unlink")) $("#hr-unlink").onclick = () => confirmDialog("Unlink this HackerRank account?", "The student can link again with /link.", "Unlink", hrAction("unlink", "HackerRank account unlinked"), true);
  $("#give").onclick = () => openDialog(`Give points to ${p.name || id}`, `
      <label for="pa">Points <span class="muted">(negative to remove)</span></label><input type="number" id="pa" value="10" step="1">
      <label for="pr">Reason</label><input type="text" id="pr" placeholder="e.g. Helped a classmate debug" style="width:100%">
      <label class="check"><input type="checkbox" id="pn" checked> Tell the student in a Discord DM</label>`,
    [{ label: "Give points", primary: true, action: async () => {
      await api(`/students/${id}/points`, { method: "POST", body: { amount: Number($("#pa").value), reason: $("#pr").value, notify: $("#pn").checked } });
      dlg.close();
      toast("Points given");
      S.students = null;
      viewStudent(id);
    } }]);
}

// ======================================================== challenges
async function loadChallenges(force = false) {
  if (!S.challenges || force) S.challenges = await api("/challenges");
  return S.challenges;
}

async function viewChallenges(arg) {
  const [rows, reports, calib, proposed] = await Promise.all([loadChallenges(true), api("/reports"), api("/difficulty").catch(() => []), api("/student-challenges").catch(() => []), loadSkillDefs()]);
  // the class's track language (null for SQL: then only language-free challenges match "this track")
  const tk = trackKeyOf(S.guild);
  const trackCode = { sql: null, mern: "javascript", ai: "python" }[tk] !== undefined ? { sql: null, mern: "javascript", ai: "python" }[tk] : tk;
  const PAGE = 60;
  let limit = PAGE;
  $("#pill-reports").hidden = !reports.length;
  $("#pill-reports").textContent = reports.length;
  view.innerHTML = `
    <div class="page-head"><div><h1>Challenges</h1><p class="sub">${rows.length} in the bank: built-in, yours, AI-generated and HackerRank problems</p></div>
      <button class="btn primary" id="new">New challenge</button></div>
    <div class="stack">
      ${proposed.length ? `<section class="panel"><h2>Written by students <span class="pill-inline">${proposed.length}</span></h2>
        <p class="muted small">Approve to put it in rotation: the author gets ${10} points now and 3 every time a classmate solves it (up to 20 solvers).</p>
        ${proposed.map((c) => `<article class="proposal">
          <header><b>${esc(c.title)}</b> ${diffTag(c.difficulty)} <span class="tag">${esc(KIND[c.kind] || c.kind)}</span> <span class="muted small">by ${esc(c.author || c.created_by)} · ${fmtAgo(c.created_at)}</span></header>
          <div class="small proposal-body">${esc(c.question || "")}</div>
          ${c.kind === "mcq" ? `<ol type="A" class="small">${JSON.parse(c.choices || "[]").map((x, i) => `<li ${"ABCD"[i] === c.answer ? 'style="font-weight:700;color:var(--up)"' : ""}>${esc(x)}</li>`).join("")}</ol>${c.explanation ? `<p class="small muted">${esc(c.explanation)}</p>` : ""}` : `<p class="small muted">${esc(c.topic || "")} · tests computed from the student's own solution</p>`}
          <footer class="toolbar" style="margin:0"><button class="btn small" data-propedit="${c.id}">Open / edit</button><button class="btn small danger" data-propno="${c.id}">Reject</button><button class="btn small primary" data-propok="${c.id}">Approve</button></footer>
        </article>`).join("")}</section>` : ""}
      ${reports.length ? `<section class="panel"><h2>Reported by students</h2><p class="muted small">A challenge reported by two students is paused until you decide.</p>
        <div class="table-wrap"><table>${reports.map((r) => `<tr><td><b>${esc(r.title)}</b> ${diffTag(r.difficulty)}<div class="muted small">${esc(r.reasons)}</div></td><td class="num">${r.n} report${r.n > 1 ? "s" : ""}</td>
          <td style="white-space:nowrap"><button class="btn small" data-open="${r.challenge_id}">Open and fix</button> <button class="btn small" data-keep="${r.challenge_id}">It's fine</button> <button class="btn small danger" data-archive="${r.challenge_id}">Remove</button></td></tr>`).join("")}</table></div></section>` : ""}
      <div class="toolbar" style="margin:0">
        <input type="search" id="q" placeholder="Search titles and topics" aria-label="Search challenges" style="flex:1;min-width:200px">
        <select id="fk" aria-label="Type"><option value="">All types</option>${Object.entries(KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        <select id="fd" aria-label="Difficulty"><option value="">All difficulties</option>${Object.entries(DIFF).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        <select id="fs" aria-label="Source"><option value="">All sources</option><option value="seed">Built-in</option><option value="teacher">Mine</option><option value="ai">AI</option><option value="hackerrank">HackerRank</option></select>
        <select id="fsk" aria-label="Skill"><option value="">All skills</option>${S.skillDefs.map((d) => `<option value="${d.key}">${esc(d.emoji + " " + d.en)}</option>`).join("")}</select>
        <select id="fl" aria-label="Language"><option value="track">${esc(trackCode ? `${LANG[trackCode] || trackCode} + any language` : "This track")}</option><option value="">All languages</option>${Object.entries(LANG).map(([k, v]) => `<option value="${k}">${esc(v)} only</option>`).join("")}</select>
      </div>
      ${calib.length ? `<details class="panel" id="calib"><summary><b>Difficulty check</b> <span class="pill-inline">${calib.length}</span> <span class="muted small">challenges whose real success rate doesn't match their level</span></summary>
        <div class="table-wrap"><table><thead><tr><th>Challenge</th><th>Now</th><th class="num">Tries</th><th class="num">Solved</th><th>Suggestion</th><th></th></tr></thead><tbody>
        ${calib.map((c) => `<tr><td><a href="#" data-edit="${c.id}">${esc(c.title)}</a><div class="muted small">${esc(KIND[c.kind] || c.kind)} · ${esc(c.reason)}</div></td><td>${diffTag(c.difficulty)}</td><td class="num">${c.attempts}</td><td class="num">${c.rate}%</td>
          <td>${c.suggest ? `→ ${diffTag(c.suggest)}` : '<span class="muted small">check it</span>'}</td><td>${c.suggest ? `<button class="btn small" data-calib="${c.id}" data-to="${c.suggest}">Apply</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>${calib.filter((c) => c.suggest).length > 1 ? `<p><button class="btn small" id="calib-all">Apply all suggestions</button></p>` : ""}</details>` : ""}
      <section class="panel" id="list"></section>
    </div>`;
  const draw = () => {
    const q = $("#q").value.toLowerCase(), k = $("#fk").value, dif = $("#fd").value, src = $("#fs").value, sk = $("#fsk").value, fl = $("#fl").value;
    const langOk = (r) => !fl || (fl === "track" ? !r.code_lang || r.code_lang === trackCode : r.code_lang === fl);
    const all = rows.filter((r) => (!q || `${r.title} ${r.topic || ""}`.toLowerCase().includes(q)) && (!k || r.kind === k) && (!dif || r.difficulty === dif) && (!src || r.source === src) && (!sk || (r.skills || "").split(",").includes(sk)) && langOk(r));
    const shown = all.slice(0, limit);
    shown.forEach((r) => (r.rate = r.solved + r.failed ? Math.round((100 * r.solved) / (r.solved + r.failed)) : null));
    $("#list").innerHTML = table([
      { label: "Title", sort: "title", html: (r) => `${esc(r.title)}<div class="small">${skillTags(r.skills)}</div>` },
      { label: "Type", sort: "kind", html: (r) => `${esc(KIND[r.kind] || r.kind)}${r.code_lang ? `<div class="muted small">${esc(LANG[r.code_lang] || r.code_lang)}</div>` : ""}` },
      { label: "Difficulty", sort: "difficulty", html: (r) => diffTag(r.difficulty) },
      { label: "Source", sort: "source", html: (r) => esc({ seed: "Built-in", teacher: "Mine", ai: "AI", hackerrank: "HackerRank" }[r.source] || r.source) },
      { label: "Attempts", sort: "attempts", num: true, html: (r) => `${r.attempts}` },
      { label: "Success", sort: "rate", num: true, html: (r) => pct(r.rate) },
      { label: "Status", sort: "status", html: (r) => (r.status === "active" ? '<span class="muted small">in rotation</span>' : status(r.status === "pending" ? "review" : r.status)) },
    ], shown, { onRow: (r) => editChallenge(r.id), empty: "No challenge matches these filters." })
      + `<p class="muted small" style="margin:12px 0 0">Showing ${shown.length} of ${all.length}${all.length < rows.length ? ` (${rows.length} in the bank)` : ""}. ${all.length > shown.length ? `<button class="btn small" id="more">Show ${Math.min(PAGE, all.length - shown.length)} more</button> <button class="btn small" id="allrows">Show all</button>` : ""}</p>`;
    if ($("#more")) $("#more").onclick = () => { limit += PAGE; draw(); };
    if ($("#allrows")) $("#allrows").onclick = () => { limit = Infinity; draw(); };
  };
  ["#q", "#fk", "#fd", "#fs", "#fsk", "#fl"].forEach((s) => ($(s).oninput = () => { limit = PAGE; draw(); }));
  draw();
  $$("[data-edit]").forEach((a) => a.onclick = (e) => { e.preventDefault(); editChallenge(Number(a.dataset.edit)); });
  $$("[data-propedit]").forEach((b) => b.onclick = () => editChallenge(Number(b.dataset.propedit)));
  $$("[data-propok]").forEach((b) => b.onclick = () => busy(b, async () => { await api(`/student-challenges/${b.dataset.propok}`, { method: "POST", body: { approve: true } }); toast("Approved: the author was told"); S.challenges = null; viewChallenges(); }));
  $$("[data-propno]").forEach((b) => b.onclick = () => openDialog("Reject this challenge?", `<label for="rj">Reason <span class="muted">(sent to the student)</span></label><input type="text" id="rj" style="width:100%" maxlength="200" placeholder="e.g. the statement doesn't say what to print">`,
    [{ label: "Reject", danger: true, action: async () => { await api(`/student-challenges/${b.dataset.propno}`, { method: "POST", body: { approve: false, reason: $("#rj", dlg).value } }); dlg.close(); toast("Rejected: the author was told"); viewChallenges(); } }]));
  $$("[data-calib]").forEach((b) => b.onclick = () => busy(b, async () => { await api(`/challenges/${b.dataset.calib}/difficulty`, { method: "POST", body: { difficulty: b.dataset.to } }); toast("Level updated"); S.challenges = null; viewChallenges(); }));
  if ($("#calib-all")) $("#calib-all").onclick = (e) => busy(e.currentTarget, async () => {
    for (const c of calib.filter((x) => x.suggest)) await api(`/challenges/${c.id}/difficulty`, { method: "POST", body: { difficulty: c.suggest } });
    toast("Levels updated"); S.challenges = null; viewChallenges();
  });
  $("#new").onclick = () => newChallenge();
  if (arg === "new" || arg === "ai") { newChallenge(arg === "ai" ? "ai" : "write"); history.replaceState(null, "", "#/challenges"); }
  $$("[data-open]").forEach((b) => b.onclick = () => editChallenge(Number(b.dataset.open), true));
  $$("[data-keep]").forEach((b) => b.onclick = () => busy(b, async () => { await api("/reports/resolve", { method: "POST", body: { challenge_id: Number(b.dataset.keep), action: "keep" } }); toast("Back in rotation"); viewChallenges(); }));
  $$("[data-archive]").forEach((b) => b.onclick = () => busy(b, async () => { await api("/reports/resolve", { method: "POST", body: { challenge_id: Number(b.dataset.archive), action: "archive" } }); toast("Challenge removed"); viewChallenges(); }));
}

const TEST_SEP = "\n---\n";
function testsText(c) {
  return (c.tests || []).map((t) => (t.generated ? "(generated big test: kept as is)" : (t.input || "").replace(/\n$/, ""))).join(TEST_SEP);
}
function challengeForm(c = {}) {
  const ch = c.choices || ["", "", "", ""];
  const samples = (c.tests || []).filter((t) => t.sample).length || 1;
  return `<div class="field-row">
      <div><label for="f-kind">Type</label><select id="f-kind" ${c.id ? "disabled" : ""}>${Object.entries(KIND).filter(([k]) => FORM_KINDS.includes(k) || k === c.kind).map(([k, v]) => `<option value="${k}" ${c.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div><label for="f-diff">Difficulty</label><select id="f-diff">${Object.entries(DIFF).map(([k, v]) => `<option value="${k}" ${c.difficulty === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div><label for="f-topic">Topic <span class="muted">(optional)</span></label><input type="text" id="f-topic" value="${esc(c.topic)}"></div>
    </div>
    <label for="f-title">Title</label><input type="text" id="f-title" value="${esc(c.title)}" style="width:100%" maxlength="80">
    <label>Skills it trains <span class="muted">(used by the coach; up to 4, left empty = guessed automatically)</span></label>
    <div class="chips" id="f-skills">${(S.skillDefs || []).map((d) => `<label><input type="checkbox" value="${d.key}" ${(c.skills || "").split(",").includes(d.key) ? "checked" : ""}> ${esc(d.emoji + " " + d.en)}</label>`).join("")}</div>
    <div data-show="code"><label for="f-url">HackerRank problem link</label><input type="url" id="f-url" value="${esc(c.url)}" style="width:100%" placeholder="https://www.hackerrank.com/challenges/…/problem"></div>
    <div data-show="question">
      <label for="f-question"><span data-show="quiz">Question</span><span data-show="write">Problem statement <span class="muted">(Markdown: story, **Input**, **Output**, **Constraints**; samples are added automatically)</span></span></label>
      <textarea id="f-question" style="min-height:90px">${esc(c.question)}</textarea>
    </div>
    <div data-show="quiz"><label for="f-code">Code <span class="muted">(shown as a code block)</span></label><textarea id="f-code" class="code">${esc(c.code)}</textarea></div>
    <div data-show="output"><label for="f-answer-out">Exact expected output</label><textarea id="f-answer-out" class="code" style="min-height:60px">${esc(c.kind === "output" ? c.answer : "")}</textarea>
      <label for="f-alts">Other accepted answers <span class="muted">(one per line)</span></label><textarea id="f-alts" class="code" style="min-height:50px">${esc((c.alternatives || []).join("\n"))}</textarea></div>
    <div data-show="choice">
      ${["A", "B", "C", "D"].map((L, i) => `<label for="f-c${i}">Choice ${L}</label><input type="text" id="f-c${i}" value="${esc(ch[i])}" style="width:100%">`).join("")}
      <label for="f-answer">Right answer</label><select id="f-answer">${["A", "B", "C", "D"].map((L) => `<option ${c.answer === L ? "selected" : ""}>${L}</option>`).join("")}</select>
    </div>
    <div data-show="write">
      <label for="f-sol">Reference solution in Python <span class="muted">(reads stdin, prints the answer; it computes the expected outputs, students never see it)</span></label>
      <textarea id="f-sol" class="code" style="min-height:140px">${esc(c.solution)}</textarea>
      <label for="f-tests">Test inputs <span class="muted">(separate tests with a line containing only <code>---</code>; add big inputs so slow solutions fail)</span></label>
      <textarea id="f-tests" class="code" style="min-height:120px" data-orig="${esc(testsText(c))}">${esc(testsText(c))}</textarea>
      <div class="field-row">
        <div><label for="f-samples">Shown as samples</label><input type="number" id="f-samples" min="1" max="3" value="${samples}"> <span class="muted small">first tests</span></div>
        <div><label for="f-limit">Time limit per test (s, Python)</label><input type="number" id="f-limit" min="1" max="10" step="0.5" value="${c.time_limit || 2}"></div>
      </div>
      ${c.tests?.length ? `<details><summary class="small">Current tests and expected outputs (${c.tests.length})</summary><div class="table-wrap"><table>${c.tests.map((t) => `<tr><td class="small">${t.idx + 1}${t.sample ? " · sample" : ""}</td><td><pre class="code-view">${esc(t.generated ? "(generated big input)" : t.input)}</pre></td><td><pre class="code-view">${esc(t.expected)}</pre></td></tr>`).join("")}</table></div></details>` : ""}
    </div>
    <div data-show="hint"><label for="f-hint">Hint <span class="muted">(using it halves the points)</span></label><input type="text" id="f-hint" value="${esc(c.hint)}" style="width:100%">
      <label for="f-expl">Explanation <span class="muted">(shown after answering)</span></label><textarea id="f-expl" style="min-height:60px">${esc(c.explanation)}</textarea></div>`;
}
function wireForm(root) {
  const sync = () => {
    const k = $("#f-kind", root).value;
    const show = { code: k === "code", question: k !== "code", quiz: !["code", "write"].includes(k), output: k === "output", choice: ["mcq", "bug", "complexity"].includes(k), write: k === "write", hint: k !== "code" };
    $$("[data-show]", root).forEach((el) => (el.hidden = !show[el.dataset.show]));
  };
  $("#f-kind", root).onchange = sync;
  sync();
}
function readForm(root) {
  const k = $("#f-kind", root).value;
  const v = (id) => $(id, root).value;
  const out = { kind: k, difficulty: v("#f-diff"), title: v("#f-title"), topic: v("#f-topic"), url: v("#f-url"), question: v("#f-question"), code: v("#f-code"), hint: v("#f-hint"), explanation: v("#f-expl"),
    skills: $$("#f-skills input:checked", root).map((i) => i.value).slice(0, 4) };
  if (k === "output") { out.answer = v("#f-answer-out").replace(/\s+$/, ""); out.alternatives = v("#f-alts").split("\n").map((s) => s.trim()).filter(Boolean); }
  if (["mcq", "bug", "complexity"].includes(k)) {
    out.choices = [0, 1, 2, 3].map((i) => v(`#f-c${i}`).trim()).filter(Boolean);
    out.answer = v("#f-answer");
  }
  if (k === "write") {
    delete out.code;
    out.solution = v("#f-sol");
    out.time_limit = Number(v("#f-limit")) || 2;
    const ta = $("#f-tests", root);
    const nSamples = Math.max(1, Number(v("#f-samples")) || 1);
    if (ta.value !== ta.dataset.orig || $("#f-samples", root).defaultValue !== $("#f-samples", root).value) {
      if (/\(generated big test/.test(ta.value)) throw new Error("Generated big tests can't be edited here: remove those lines, or leave the tests unchanged.");
      out.tests = ta.value.replace(/\r/g, "").split(/\n---\n/).map((x) => x.trim()).filter(Boolean).map((input, i) => ({ input: input + "\n", sample: i < nSamples }));
    }
  }
  return out;
}

async function newChallenge(startTab = "write") {
  await loadSkillDefs().catch(() => {});
  openDialog("New challenge", `
    <div class="tabs" role="tablist"><button data-t="write" aria-selected="true">Write it</button><button data-t="ai">Generate with AI</button><button data-t="hr">Import from HackerRank</button></div>
    <div data-pane="write">${challengeForm({ kind: "write", difficulty: "medium" })}</div>
    <div data-pane="ai" hidden>
      <p class="muted small"><b>Write code:</b> the AI writes the problem, a fast reference solution, a brute-force one and big tests; both solutions are run on a real computer and must agree, and the slow one must fail the big tests. Saved directly when it passes.<br><b>Quick types:</b> the output is computed by really running the code; multiple-choice answers are re-solved independently. You review the draft before saving.</p>
      <div class="field-row">
        <div><label for="g-diff">Difficulty</label><select id="g-diff">${Object.entries(DIFF).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
        <div><label for="g-kind">Type</label><select id="g-kind">${["write", "output", "bug", "complexity", "mcq"].map((k) => `<option value="${k}">${KIND[k]}</option>`).join("")}</select></div>
        <div><label for="g-lang">Code language <span class="muted">(quick types)</span></label><select id="g-lang">${(S.guild?.code_lang || "python").split(",").concat(["javascript", "php", "python", "java", "c", "cpp"]).filter((v, i, arr) => arr.indexOf(v) === i).map((l) => `<option value="${l}">${esc(LANG[l] || l)}</option>`).join("")}</select></div>
      </div>
      <div class="field-row">
        <div><label for="g-skill">Skill <span class="muted">(tags the challenge)</span></label><select id="g-skill"><option value="">Any skill</option>${(S.skillDefs || []).filter((d) => !["sql", "regex", "git"].includes(d.key)).map((d) => `<option value="${d.key}">${esc(d.emoji + " " + d.en)}</option>`).join("")}</select></div>
      </div>
      <label for="g-topic">Topic <span class="muted">(optional, e.g. "loops over dictionaries", "recursion")</span></label><input type="text" id="g-topic" style="width:100%">
      <p><button class="btn" id="gen">Generate a draft</button></p>
    </div>
    <div data-pane="hr" hidden>
      <label for="h-url">HackerRank problem link</label><input type="url" id="h-url" style="width:100%" placeholder="https://www.hackerrank.com/challenges/…/problem">
      <label for="h-diff">Difficulty</label><select id="h-diff"><option value="">Use HackerRank's</option>${Object.entries(DIFF).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <p class="muted small">Students solve it on HackerRank; the bot checks their public profile for the solve.</p>
    </div>`,
  [{ label: "Save challenge", primary: true, action: async (root) => {
    const pane = $("[data-pane]:not([hidden])", root).dataset.pane;
    if (pane === "hr") await api("/challenges/import", { method: "POST", body: { url: $("#h-url", root).value, difficulty: $("#h-diff", root).value || undefined } });
    else await api("/challenges", { method: "POST", body: { ...readForm(root), source: root.dataset.ai ? "ai" : undefined } });
    dlg.close();
    toast("Challenge saved");
    viewChallenges();
  } }]);
  const root = dlg;
  wireForm(root);
  delete root.dataset.ai;
  const tab = (t) => { $$("[data-t]", root).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.t === t))); $$("[data-pane]", root).forEach((p) => (p.hidden = p.dataset.pane !== t)); };
  if (startTab !== "write") tab(startTab);
  $$("[data-t]", root).forEach((b) => b.onclick = () => tab(b.dataset.t));
  const genBtn = $("#gen", root);
  genBtn.onclick = () => busy(genBtn, async () => {
    const kind = $("#g-kind", root).value;
    genBtn.textContent = kind === "write" ? "Generating and testing… (up to 2 min)" : "Generating… (up to 1 min)";
    try {
      const g = await api("/challenges/generate", { method: "POST", body: { difficulty: $("#g-diff", root).value, kind, topic: $("#g-topic", root).value, code_lang: $("#g-lang", root).value, skill: $("#g-skill", root).value || undefined } });
      if (g.saved) {
        dlg.close();
        toast(`"${g.challenge.title}" passed its checks and was added to the bank`);
        await viewChallenges();
        editChallenge(g.challenge.id);
        return;
      }
      $("[data-pane=write]", root).innerHTML = challengeForm({ ...g, difficulty: $("#g-diff", root).value });
      wireForm(root);
      root.dataset.ai = "1";
      tab("write");
      toast("Draft ready: review it, then save");
    } finally { genBtn.textContent = "Generate a draft"; }
  });
}

async function editChallenge(id, fromReport = false) {
  const [c] = await Promise.all([api(`/challenges/${id}`), loadSkillDefs()]);
  const builtIn = !c.guild_id;
  openDialog(c.title, `
    ${builtIn ? `<p class="notice small">This is a ${c.source === "seed" ? "built-in" : "shared"} challenge. Your edits apply to every server using this bot.</p>` : ""}
    ${challengeForm(c)}
    ${c.kind === "write" ? "" : `<label class="check"><input type="checkbox" id="f-regrade" ${fromReport ? "checked" : ""}> If you change the answer, give credit to students who were right</label>`}
    ${c.reports.length ? `<h3 style="margin-top:18px">Reports</h3><ul class="feed">${c.reports.map((r) => `<li><time>${fmtAgo(r.created_at)}</time><span><b>${esc(r.name || "?")}</b>: ${esc(r.reason || "")} ${r.status !== "open" ? '<span class="muted small">(resolved)</span>' : ""}</span></li>`).join("")}</ul>` : ""}
    <h3 style="margin-top:18px">Results (${c.results.length})</h3>
    ${c.results.length ? `<div class="table-wrap"><table>${c.results.map((r) => `<tr><td>${esc(r.name || r.discord_id)}</td><td>${status(r.status)}</td><td>${codeView({ ...r, kind: c.kind })}</td><td class="muted small">${esc(ORIGIN[r.origin] || r.origin)}</td></tr>`).join("")}</table></div>` : `<p class="empty">Nobody has tried it yet.</p>`}`,
  [
    { label: "Remove from bank", danger: true, action: async () => { await api(`/challenges/${id}`, { method: "DELETE" }); dlg.close(); toast("Challenge removed"); viewChallenges(); } },
    { label: "Assign", action: async () => { dlg.close(); assignDialog([], id); } },
    ...(c.results.some((r) => r.status !== "solved") ? [{ label: "Why students fail", action: async () => mistakesDialog(c) }] : []),
    { label: "Save", primary: true, action: async (root) => {
      const body = { ...readForm(root), regrade: !!$("#f-regrade", root)?.checked };
      if (fromReport) {
        const r = await api("/reports/resolve", { method: "POST", body: { challenge_id: id, action: "fix", fields: body } });
        toast(r.regraded ? `Saved · ${r.regraded} student(s) regraded` : "Saved and back in rotation");
      } else {
        const r = await api(`/challenges/${id}`, { method: "PUT", body: { ...body, status: c.status === "flagged" ? "active" : undefined } });
        toast(r.regraded ? `Saved · ${r.regraded} student(s) regraded` : "Saved");
      }
      dlg.close();
      if (location.hash.startsWith("#/challenges")) viewChallenges();
    } },
  ]);
  wireForm(dlg);
}

/** Wrong answers on one challenge, grouped by cause (failing test, verdict or chosen answer). */
async function mistakesDialog(c) {
  const d = await api(`/challenges/${c.id}/mistakes`);
  const max = Math.max(1, ...d.groups.map((x) => x.count));
  openDialog(`Why students fail · ${c.title}`, `
    <p class="muted small">${d.total} finished attempt(s) · ${d.solved} solved. Grouped by what went wrong, most common first.</p>
    ${d.groups.length ? d.groups.map((x) => `<section class="mistake-group">
      <div class="mg-head"><b>${esc(x.label)}</b><span class="mg-bar"><i style="width:${(100 * x.count) / max}%"></i></span><b class="num">${x.count}</b></div>
      <p class="small muted">${x.students.map((s) => esc(s.name || s.id)).join(", ")}${x.count > x.students.length ? ` +${x.count - x.students.length}` : ""}</p>
      ${x.example ? `<details><summary class="small">Example</summary>
        ${x.example.input ? `<p class="small"><b>Test input</b></p><pre class="code-view">${esc(x.example.input)}</pre>` : ""}
        ${x.example.expected != null ? `<p class="small"><b>Expected</b> <code>${esc(x.example.expected)}</code> · <b>got</b> <code>${esc(x.example.got ?? "")}</code></p>` : ""}
        ${x.example.error ? `<pre class="code-view">${esc(x.example.error)}</pre>` : ""}
        ${x.example.code ? `<p class="small"><b>One student's code</b> (${esc(LANG[x.example.lang] || x.example.lang || "")})</p><pre class="code-view">${esc(x.example.code)}</pre>` : ""}
      </details>` : ""}
    </section>`).join("") : `<p class="empty">Nobody failed it.</p>`}
    <p class="muted small">Tip: when one group dominates, it's usually an edge case worth 5 minutes in class.</p>`);
}

// ======================================================= assignments
function assignForm(preStudents = [], preChallenge = null, students = [], challenges = [], teams = []) {
  const opts = challenges.filter((c) => c.status === "active").map((c) => `<option value="${c.id}" ${c.id === preChallenge ? "selected" : ""}>${esc(c.title)} · ${esc(DIFF[c.difficulty])} · ${esc(KIND[c.kind])}</option>`).join("");
  return `
    <label for="a-filter">Challenge</label>
    <input type="search" id="a-filter" placeholder="Type to filter the list" style="width:100%;margin-bottom:6px">
    <select id="a-ch" size="6" style="width:100%">${opts}</select>
    <label>Who</label>
    <div class="toolbar" style="margin-bottom:6px">
      <button type="button" class="btn small" id="a-all">Everyone</button>
      ${teams.map((t) => `<button type="button" class="btn small" data-team="${t.id}">Team ${esc(t.name)}</button>`).join("")}
      <button type="button" class="btn small" id="a-none">Clear</button>
    </div>
    <div class="picklist">${students.map((s) => `<label class="check"><input type="checkbox" value="${esc(s.discord_id)}" ${preStudents.includes(s.discord_id) ? "checked" : ""}> ${esc(s.name || s.discord_id)} <span class="muted small">${s.attention.length ? "· needs attention" : ""}</span></label>`).join("") || '<p class="empty">No students yet.</p>'}</div>
    <div class="field-row">
      <div><label for="a-due">Due <span class="muted">(optional, your local time)</span></label><input type="datetime-local" id="a-due" style="width:100%"></div>
      <div><label for="a-notify">Tell students</label><select id="a-notify"><option value="both">DM + #arena</option><option value="channel">#arena only</option><option value="dm">DM only</option></select></div>
    </div>
    <label for="a-note">Note for the students <span class="muted">(optional)</span></label><input type="text" id="a-note" style="width:100%" maxlength="300" placeholder="e.g. Revise dictionaries first">`;
}
function wireAssign(root, challenges, teams) {
  const sel = $("#a-ch", root);
  const all = [...sel.options].map((o) => [o.value, o.textContent]);
  $("#a-filter", root).oninput = (e) => {
    const q = e.target.value.toLowerCase();
    const cur = sel.value;
    sel.innerHTML = all.filter(([, t]) => t.toLowerCase().includes(q)).map(([v, t]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(t)}</option>`).join("");
  };
  $("#a-all", root).onclick = () => $$(".picklist input", root).forEach((i) => (i.checked = true));
  $("#a-none", root).onclick = () => $$(".picklist input", root).forEach((i) => (i.checked = false));
  $$("[data-team]", root).forEach((b) => b.onclick = () => {
    const t = teams.find((x) => String(x.id) === b.dataset.team);
    const ids = new Set(t.members.map((m) => m.id));
    $$(".picklist input", root).forEach((i) => { if (ids.has(i.value)) i.checked = true; });
  });
}
async function submitAssign(root) {
  const students = $$(".picklist input:checked", root).map((i) => i.value);
  const due = $("#a-due", root).value;
  const r = await api("/assignments", { method: "POST", body: {
    challenge_id: Number($("#a-ch", root).value), students, note: $("#a-note", root).value,
    due_at: due ? Math.floor(new Date(due).getTime() / 1000) : null, notify: $("#a-notify", root).value,
  } });
  toast(`Assigned to ${r.created} student${r.created > 1 ? "s" : ""}${r.dms ? ` · ${r.dms} DM${r.dms > 1 ? "s" : ""} sent` : ""}${r.posted ? " · posted in the channel" : ""}`);
  return r;
}
async function assignDialog(preStudents = [], preChallenge = null) {
  const [students, challenges, teams] = await Promise.all([loadStudents(), loadChallenges(), api("/teams")]);
  openDialog("Assign a challenge", assignForm(preStudents, preChallenge, students, challenges, teams), [{ label: "Assign", primary: true, action: async (root) => { await submitAssign(root); dlg.close(); } }]);
  wireAssign(dlg, challenges, teams);
}

async function viewAssignments() {
  const [rows, students, challenges, teams] = await Promise.all([api("/assignments"), loadStudents(true), loadChallenges(), api("/teams")]);
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.challenge_id}|${r.created_at}`;
    if (!groups.has(k)) groups.set(k, { ...r, items: [] });
    groups.get(k).items.push(r);
  }
  const COLORS = { done: "var(--up)", late: "var(--warn)", failed: "var(--down)", missed: "var(--down)", open: "var(--line)" };
  view.innerHTML = `
    <div class="page-head"><div><h1>Assignments</h1><p class="sub">Give specific challenges to specific students and follow who finished them.</p></div></div>
    <div class="grid cols-2">
      <section class="panel" id="list"><h2>Given so far</h2>
        ${groups.size ? [...groups.values()].map((g, gi) => {
          const n = g.items.length, c = (s) => g.items.filter((i) => i.status === s).length;
          return `<details style="border-bottom:1px solid var(--line);padding:10px 0"><summary style="cursor:pointer;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
              <b style="flex:1;min-width:180px">${esc(g.title)}</b> ${diffTag(g.difficulty)}
              <span class="bar-progress" title="${c("done")} done, ${c("late")} late, ${c("failed") + c("missed")} not solved, ${c("open")} open">${["done", "late", "failed", "missed", "open"].map((s) => c(s) ? `<span style="width:${(100 * c(s)) / n}%;background:${COLORS[s]}"></span>` : "").join("")}</span>
              <span class="small muted">${c("done") + c("late")}/${n} done · ${g.due_at ? `due ${fmtDateTime(g.due_at)}` : "no due date"}</span></summary>
            ${g.note ? `<p class="small">📝 ${esc(g.note)}</p>` : ""}
            <table>${g.items.map((i) => `<tr><td><a href="#/student/${i.discord_id}">${esc(i.name || i.discord_id)}</a></td><td>${status(i.status)}</td><td class="small muted">${i.completed_at ? fmtDateTime(i.completed_at) : ""}</td><td class="num">${i.points ? `+${i.points}` : ""}</td>
              <td>${i.status === "open" ? `<button class="btn small" data-cancel="${i.id}">Cancel</button>` : ""}</td></tr>`).join("")}</table></details>`;
        }).join("") : `<p class="empty">Nothing assigned yet. Use the form to give your first challenge.</p>`}
      </section>
      <section class="panel"><h2>New assignment</h2>${assignForm([], null, students, challenges, teams)}<p><button class="btn primary" id="go">Assign</button></p></section>
    </div>`;
  wireAssign(view, challenges, teams);
  $("#go").onclick = (e) => busy(e.currentTarget, async () => { await submitAssign(view); viewAssignments(); });
  $$("[data-cancel]").forEach((b) => b.onclick = () => busy(b, async () => { await api(`/assignments/${b.dataset.cancel}`, { method: "DELETE" }); toast("Assignment cancelled"); viewAssignments(); }));
}

// ========================================================== contests
async function loadDiscord() {
  if (!S.discord) S.discord = await api("/discord");
  return S.discord;
}
const channelOptions = (sel) => (S.discord?.channels || []).map((c) => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}># ${esc(c.name)}</option>`).join("");

async function viewContests() {
  const [rows] = await Promise.all([api("/contests"), loadDiscord()]);
  view.innerHTML = `
    <div class="page-head"><div><h1>Contests</h1><p class="sub">HackerRank contests followed by the bot, with live commentary in Discord.</p></div></div>
    <div class="grid cols-2">
      <section class="panel" id="list"></section>
      <section class="panel"><h2>Follow a contest</h2>
        <label for="c-link">HackerRank contest link</label><input type="url" id="c-link" style="width:100%" placeholder="https://www.hackerrank.com/contests/…">
        <label for="c-ch">Post updates in</label><select id="c-ch" style="width:100%">${channelOptions(S.guild?.arena_channel || S.guild?.announce_channel)}</select>
        <div class="field-row">
          <div><label for="c-int">Check every (min)</label><input type="number" id="c-int" value="5" min="2" max="120"></div>
          <div><label for="c-fr">Freeze last (min)</label><input type="number" id="c-fr" value="15" min="0" max="180"></div>
        </div>
        <p class="muted small">The leaderboard must be public on HackerRank. Students can bet coins on the winner until the contest starts.</p>
        <p><button class="btn primary" id="track">Start following</button></p>
      </section>
    </div>`;
  $("#list").innerHTML = `<h2>All contests</h2>` + table([
    { label: "Contest", sort: "name", html: (c) => `<b>${esc(c.name)}</b><div class="muted small">${esc(c.season)}</div>` },
    { label: "Status", sort: "status", html: (c) => status(c.status) },
    { label: "Ends", sort: "end_at", html: (c) => `<span class="small">${fmtDateTime(c.end_at)}</span>` },
    { label: "Players", sort: "participants", num: true, html: (c) => `${c.participants || "—"}` },
  ], rows, { onRow: (c) => (location.hash = `#/contest/${c.id}`), empty: "No contests yet." });
  $("#track").onclick = (e) => busy(e.currentTarget, async () => {
    const c = await api("/contests", { method: "POST", body: { link: $("#c-link").value, channel_id: $("#c-ch").value, interval: Number($("#c-int").value), freeze: Number($("#c-fr").value) } });
    toast(`Following ${c.name}`);
    location.hash = `#/contest/${c.id}`;
  });
}

async function viewContest(id) {
  const c = await api(`/contests/${id}`);
  const finished = c.status === "finished";
  const top = c.results.slice(0, 5).map((r) => r.hr_display);
  const snaps = c.snaps;
  const colors = ["var(--s1)", "var(--s2)", "var(--s3)", "#eda100", "#e87ba4"];
  const series = top.map((u, i) => ({ name: u, color: colors[i], values: snaps.map((s) => s[1][u] ?? null) }));
  const AWARD = { first_blood: "🩸 First Blood", climber: "📈 Biggest Climber", improved: "🌱 Most Improved", speed: "⚡ Speed Demon", clutch: "🦉 Last-Minute Hero" };
  view.innerHTML = `
    <div class="page-head"><div><h1>${esc(c.name)}</h1><p class="sub">${status(c.status)} · ${esc(c.season)} · ${fmtDateTime(c.start_at)} → ${fmtDateTime(c.end_at)} · posts in #${esc(channelName(c.channel_id) || c.channel_id)}</p></div>
      <div class="toolbar" style="margin:0">
        <a class="btn" href="https://www.hackerrank.com/contests/${encodeURIComponent(c.slug)}/leaderboard" target="_blank" rel="noopener">HackerRank leaderboard</a>
        ${finished && S.me?.publicUrl ? `<a class="btn" href="${esc(S.me.publicUrl)}/replay/${c.id}" target="_blank" rel="noopener">Race replay</a>` : ""}
        ${c.status === "active" ? `<button class="btn primary" id="stop">End now and reveal</button><button class="btn danger" id="cancel">Cancel</button>` : ""}
      </div></div>
    <div class="stack">
      ${series.length && snaps.length > 1 ? `<section class="panel"><h2>Score race, top 5</h2>${lineChart(snaps.map((s) => new Date(s[0] * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })), series, { legend: true })}</section>` : ""}
      <div class="grid cols-2">
        <section class="panel"><h2>${finished ? "Final results" : "Results appear when the contest ends"}</h2>
          ${table([
            { label: "#", sort: "rank", num: true, html: (r) => `${r.rank}` },
            { label: "HackerRank", sort: "hr_display", html: (r) => esc(r.hr_display) },
            { label: "Student", sort: "name", html: (r) => (r.discord_id ? `<a href="#/student/${r.discord_id}">${esc(r.name || r.discord_id)}</a>` : '<span class="muted small">not linked</span>') },
            { label: "Score", sort: "score", num: true, html: (r) => `${r.score}` },
          ], c.results, { sort: { key: "rank", asc: true }, empty: "No results yet." })}</section>
        <div class="stack">
          <section class="panel"><h2>Awards</h2>${c.awards.length ? `<ul class="feed">${c.awards.map((a) => `<li><span>${esc(AWARD[a.award] || a.award)}: <b>${esc(a.hr_username)}</b></span></li>`).join("")}</ul>` : `<p class="empty">Given at the end.</p>`}</section>
          ${c.teams.length ? `<section class="panel"><h2>Teams</h2><table>${c.teams.map((t) => `<tr><td>${t.rank}.</td><td>${esc(t.name)}</td><td class="num">${Number(t.avg_score).toFixed(1)} avg</td><td class="num">+${t.points}</td></tr>`).join("")}</table></section>` : ""}
          ${c.bets.length ? `<section class="panel"><h2>Predictions</h2><table>${c.bets.map((b) => `<tr><td>${esc(b.name || b.discord_id)}</td><td>${esc(b.pick_display)}</td><td class="num">${b.amount} 🪙</td><td>${b.outcome ? esc(b.outcome) : '<span class="muted">pending</span>'}</td></tr>`).join("")}</table></section>` : ""}
        </div>
      </div>
    </div>`;
  if (c.status === "active") {
    $("#stop").onclick = () => confirmDialog("End the contest now?", "The bot reveals the podium and counts the results for the season within a minute.", "End and reveal", async () => { await api(`/contests/${id}/stop`, { method: "POST", body: { announce: true } }); toast("Ending: watch Discord"); viewContest(id); });
    $("#cancel").onclick = () => confirmDialog("Cancel this contest?", "The bot stops following it. No results are recorded and bets are refunded.", "Cancel contest", async () => { await api(`/contests/${id}/stop`, { method: "POST", body: { announce: false } }); toast("Contest cancelled"); viewContest(id); }, true);
  }
}

// ============================================================= teams
async function viewTeams() {
  const [teams, students] = await Promise.all([api("/teams"), loadStudents()]);
  view.innerHTML = `
    <div class="page-head"><div><h1>Teams</h1><p class="sub">A team's contest score is the average of its members, so everyone counts.</p></div>
      <div class="toolbar" style="margin:0"><input type="text" id="tn" placeholder="New team name" aria-label="New team name"><button class="btn primary" id="add">Create team</button></div></div>
    ${teams.length ? `<div class="grid cols-2-even">${teams.map((t) => `<section class="panel"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h2>${esc(t.name)}</h2><span class="muted" title="Team points from HackerRank contests this season">${t.points} contest pts</span></div>
      <p>${t.members.length ? t.members.map((m) => `<a href="#/student/${m.id}">${esc(m.name || m.id)}</a>`).join(", ") : '<span class="muted">No members yet.</span>'}</p>
      <div class="toolbar" style="margin:0"><button class="btn small" data-edit="${t.id}">Choose members</button><button class="btn small danger" data-del="${t.id}">Delete</button></div></section>`).join("")}</div>`
      : `<div class="panel"><p class="empty">No teams yet. Create one above, then choose its members.</p></div>`}`;
  $("#add").onclick = (e) => busy(e.currentTarget, async () => { await api("/teams", { method: "POST", body: { name: $("#tn").value } }); toast("Team created"); S.students = null; viewTeams(); });
  $$("[data-del]").forEach((b) => b.onclick = () => confirmDialog("Delete this team?", "Members stay in the class; only the team is removed.", "Delete team", async () => { await api(`/teams/${b.dataset.del}`, { method: "DELETE" }); S.students = null; viewTeams(); }, true));
  $$("[data-edit]").forEach((b) => b.onclick = () => {
    const t = teams.find((x) => String(x.id) === b.dataset.edit);
    const mine = new Set(t.members.map((m) => m.id));
    openDialog(`Members of ${t.name}`, `<p class="muted small">A student can be in one team. Picking someone moves them here.</p>
      <div class="picklist">${students.map((s) => `<label class="check"><input type="checkbox" value="${esc(s.discord_id)}" ${mine.has(s.discord_id) ? "checked" : ""}> ${esc(s.name || s.discord_id)} ${s.team && s.team !== t.name ? `<span class="muted small">(now in ${esc(s.team)})</span>` : ""}</label>`).join("")}</div>`,
    [{ label: "Save members", primary: true, action: async (root) => {
      await api(`/teams/${t.id}/members`, { method: "PUT", body: { members: $$(".picklist input:checked", root).map((i) => i.value) } });
      dlg.close();
      S.students = null;
      toast("Members saved");
      viewTeams();
    } }]);
  });
}

// ========================================================== settings
async function viewSettings() {
  const [g] = await Promise.all([api("/settings"), loadDiscord()]);
  S.guild = g;
  const roles = (sel) => `<option value="">Off</option>` + S.discord.roles.map((r) => `<option value="${r.id}" ${r.id === sel ? "selected" : ""}>@${esc(r.name)}</option>`).join("");
  const offset = -new Date().getTimezoneOffset() / 60;
  const sc = g.scoring;
  const kinds = g.score_kinds || Object.keys(KIND);
  const ic = g.integrity || { editor: "required", explain: true, similarity: true, codeImage: true, quickLimit: 0, practiceWeight: 1 };
  view.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><p class="sub">For ${esc(g.name || "this server")}</p></div></div>
    <div class="stack">
    <div class="grid cols-2-even">
      <section class="panel"><h2>Bot</h2>
        <div class="field-row">
          <div><label for="s-lang">Language</label><select id="s-lang"><option value="en" ${g.lang === "en" ? "selected" : ""}>English</option><option value="fr" ${g.lang === "fr" ? "selected" : ""}>Français</option></select></div>
          <div><label for="s-track">What the class learns <span class="muted">(one at a time: challenges, daily challenge, path and lessons follow it)</span></label><select id="s-track" style="width:100%">${trackOptions(trackKeyOf(g))}</select></div>
        </div>
        <label for="s-arena">#arena channel <span class="muted">(everything public: daily challenge, duels, contests, level-ups, assignments, weekly recap)</span></label>
        <select id="s-arena" style="width:100%"><option value="">Find a channel named "arena" automatically</option>${channelOptions(g.arena_channel)}</select>
        <label for="s-daily">Daily challenge channel <span class="muted">(optional)</span></label><select id="s-daily" style="width:100%"><option value="">Same as #arena</option>${channelOptions(g.daily_channel !== g.arena_channel ? g.daily_channel : "")}</select>
        <label for="s-hour">Daily challenge time <span class="muted">(UTC hour)</span></label>
        <input type="number" id="s-hour" min="0" max="23" value="${g.daily_hour}"> <span class="muted small" id="s-local"></span>
        <p class="muted small" style="margin-top:12px">HackerRank solves count only for students who proved their account (code in their HackerRank bio) or that you verified. Self-reports wait for your approval.</p>
        <p style="margin-top:16px"><button class="btn primary" id="save">Save settings</button></p>
      </section>
      <div class="stack">
        <section class="panel"><h2>Contest roles</h2>
          <p class="muted small">Leave on <b>Off</b> and the automatic roles below create 🏆 Contest Champion and 🔥 On Fire for you, or pick roles you already have.</p>
          <label for="s-champ">Champion role <span class="muted">(latest contest winner)</span></label><select id="s-champ" style="width:100%">${roles(g.champion_role)}</select>
          <label for="s-streak">Streak role <span class="muted">(3 contests or 5 dailies in a row)</span></label><select id="s-streak" style="width:100%">${roles(g.streak_role)}</select>
          <p class="muted small">In Discord's Server Settings → Roles, drag the bot's role above these roles, or it can't give them out.</p>
        </section>
        <section class="panel"><h2>Season</h2>
          <p>Current season: <b>${esc(g.season)}</b></p>
          <label for="s-season">New season name</label><input type="text" id="s-season" style="width:100%" placeholder="e.g. Spring 2027">
          <label class="check"><input type="checkbox" id="s-announce" checked> Announce it in #arena</label>
          <p class="muted small">Season points restart from zero. All history stays in the dashboard.</p>
          <p><button class="btn" id="season">Start new season</button></p>
        </section>
      </div>
    </div>
    <section class="panel" id="autoroles"><div class="panel-head"><h2>Automatic roles</h2><span class="toolbar" style="margin:0"><label class="check" style="margin:0"><input type="checkbox" id="ar-on"> On</label><button class="btn" id="ar-sync">Create &amp; update now</button></span></div>
      <p class="muted small">The bot creates these roles in your server and moves them to the right students by itself (every few minutes). <b>Class Leader</b> and <b>Top 3</b> are shown in their own group at the top of the member list. Badges (first solve, 10 solves, duel wins…) are given automatically too and shown in <code>/profile</code>.</p>
      <div id="ar-body"><p class="muted">Loading…</p></div>
    </section>
    <section class="panel" id="anticheat"><h2>Anti-cheat</h2>
      <p class="muted small">Makes AI and copy-paste slower and <b>visible</b> to you. No tool can make it impossible: a student can still retype code from a phone. That's why the explanation step and class sessions matter most.</p>
      <div class="grid cols-2-even">
        <div>
          <label for="ac-editor">Write-code answers</label>
          <select id="ac-editor" style="width:100%">
            <option value="required" ${ic.editor === "required" ? "selected" : ""}>Only in the code editor page (recommended)</option>
            <option value="optional" ${ic.editor === "optional" ? "selected" : ""}>Editor or Discord form (form answers are flagged)</option>
            <option value="off" ${ic.editor === "off" ? "selected" : ""}>Discord form only (no typing record)</option>
          </select>
          <p class="muted small">The editor blocks pasting, records when the student leaves the page and keeps a replay of the typing.</p>
          <label class="check"><input type="checkbox" id="ac-explain" ${ic.explain ? "checked" : ""}> <span><b>Explain your code</b>: after an accepted answer, half the points wait until the student answers 2 questions about their own code (3 minutes)</span></label>
          <label class="check"><input type="checkbox" id="ac-sim" ${ic.similarity ? "checked" : ""}> <span><b>Similarity check</b>: flag two students whose code is almost the same (names and spacing ignored)</span></label>
          <label class="check"><input type="checkbox" id="ac-img" ${ic.codeImage ? "checked" : ""}> <span><b>Code as an image</b> in quick challenges (output, bug, complexity), so it can't be copied into a chatbot</span></label>
        </div>
        <div>
          <label for="ac-quick">Time to answer a quick challenge</label>
          <select id="ac-quick" style="width:100%">${[[0, "No limit"], [30, "30 seconds"], [45, "45 seconds"], [60, "1 minute"], [90, "1 min 30"], [120, "2 minutes"], [180, "3 minutes"], [300, "5 minutes"]].map(([v, l]) => `<option value="${v}" ${ic.quickLimit === v ? "selected" : ""}>${l}</option>`).join("")}${[0, 30, 45, 60, 90, 120, 180, 300].includes(ic.quickLimit) ? "" : `<option value="${ic.quickLimit}" selected>${ic.quickLimit} seconds</option>`}</select>
          <p class="muted small">A late answer still gets checked but earns no points.</p>
          <label for="ac-pw">Points for quick challenges in /practice</label>
          <select id="ac-pw" style="width:100%">${[[1, "Full points"], [0.75, "75%"], [0.5, "Half (supervised work counts more)"], [0.25, "25%"], [0, "No points (practice only)"]].map(([v, l]) => `<option value="${v}" ${ic.practiceWeight === v ? "selected" : ""}>${l}</option>`).join("")}${[1, 0.75, 0.5, 0.25, 0].includes(ic.practiceWeight) ? "" : `<option value="${ic.practiceWeight}" selected>×${ic.practiceWeight}</option>`}</select>
          <p class="muted small">Write code and HackerRank always give full points. Class sessions, assignments, the daily challenge and duels are not affected.</p>
        </div>
      </div>
      <p><button class="btn primary" id="save-ac">Save anti-cheat</button> <a class="btn" href="#/integrity">Review flagged answers</a></p>
    </section>
    <section class="panel"><h2>Scoring</h2>
      <p class="muted small">Points = <b>level base × type multiplier</b> (then daily ×1.5, assignment on time ×1.5, duel win ×2, hint ×0.5…). ${g.scoring_custom ? "<b>Custom scoring is on.</b>" : "Default scoring."}</p>
      <div class="grid cols-2-even">
        <div>
          <h3>Base points per level</h3>
          <div class="field-row">${["easy", "medium", "hard"].map((d) => `<div><label for="sb-${d}">${DIFF[d]}</label><input type="number" min="0" max="1000" id="sb-${d}" value="${sc.base[d]}"></div>`).join("")}</div>
          <h3>Multiplier per type</h3>
          <div class="field-row" style="flex-wrap:wrap">${kinds.map((k) => `<div><label for="sm-${k}">${esc(KIND[k] || k)}</label><input type="number" min="0" max="100" step="0.5" id="sm-${k}" value="${sc.mult[k]}"></div>`).join("")}</div>
          <h3>Anti-farming for quick challenges</h3>
          <p class="muted small">Multiple choice, complexity, output and bug take seconds, so in <b>/practice and duels</b> their points shrink after a few a day. <b>Write code and HackerRank are never limited</b>, and nothing you hand out (daily challenge, assignments, class sessions) is either. Solving the same challenge again never gives points.</p>
          <div class="field-row" style="flex-wrap:wrap">
            <div><label for="sq-full">Full points for the first</label><input type="number" min="0" max="1000" id="sq-full" value="${sc.quick.full}"></div>
            <div><label for="sq-red">then this many more</label><input type="number" min="0" max="1000" id="sq-red" value="${sc.quick.reduced}"></div>
            <div><label for="sq-pct">at (% of the points)</label><input type="number" min="0" max="100" id="sq-pct" value="${sc.quick.pct}"></div>
          </div>
          <label class="check"><input type="checkbox" id="sq-lock" ${sc.quick.lock !== false ? "checked" : ""}><span>🔒 After that, students <b>can't pick quick challenges</b> until the next day (in <code>/practice</code> and quick duels)</span></label>
          <p class="muted small" id="sq-sum"></p>
          <div class="field-row">
            <div><label for="s-cap">Max quick-challenge points a day</label><input type="number" min="0" id="s-cap" value="${sc.cap}"></div>
            <div><label for="s-award">Contest special award</label><input type="number" min="0" id="s-award" value="${sc.award}"></div>
          </div>
          <h3>HackerRank contest points</h3>
          <div class="field-row" style="flex-wrap:wrap">${[["first", "1st"], ["second", "2nd"], ["third", "3rd"], ["top10", "Top 10"], ["play", "Played"]].map(([k, l]) => `<div><label for="sc-${k}">${l}</label><input type="number" min="0" id="sc-${k}" value="${sc.contest[k]}"></div>`).join("")}</div>
        </div>
        <div><h3>Preview</h3><div id="s-preview"></div></div>
      </div>
      <p><button class="btn primary" id="save-sc">Save scoring</button> ${g.scoring_custom ? `<button class="btn" id="reset-sc">Back to defaults</button>` : ""}</p>
    </section>
    <section class="panel"><h2>🔔 Discord notifications</h2><div id="s-notify"><p class="muted">Loading…</p></div></section>
    <section class="panel"><h2>Diagnostics</h2><p class="muted small">Checks, from Cloudflare, that the code runner, the AI and HackerRank answer. Run it after deploying or when something seems off.</p>
      <p><button class="btn" id="diag">Run checks</button></p><div id="diag-out"></div></section>
    </div>`;
  const local = () => { const h = (Number($("#s-hour").value) + offset + 24) % 24; $("#s-local").textContent = `= ${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"} your time`; };
  $("#s-hour").oninput = local;
  local();
  if (typeof loadNotify === "function") loadNotify();
  const readScoring = () => ({
    base: Object.fromEntries(["easy", "medium", "hard"].map((d) => [d, Number($(`#sb-${d}`).value)])),
    mult: Object.fromEntries(kinds.map((k) => [k, Number($(`#sm-${k}`).value)])),
    cap: Number($("#s-cap").value), award: Number($("#s-award").value),
    quick: { full: Number($("#sq-full").value), reduced: Number($("#sq-red").value), pct: Number($("#sq-pct").value), lock: $("#sq-lock").checked },
    contest: Object.fromEntries(["first", "second", "third", "top10", "play"].map((k) => [k, Number($(`#sc-${k}`).value)])),
  });
  const preview = () => {
    const x = readScoring();
    $("#s-preview").innerHTML = `<div class="table-wrap"><table><thead><tr><th></th>${["easy", "medium", "hard"].map((d) => `<th class="num">${DIFF[d]}</th>`).join("")}</tr></thead><tbody>
      ${kinds.map((k) => `<tr><td>${esc(KIND[k] || k)}</td>${["easy", "medium", "hard"].map((d) => `<td class="num">${Math.round(x.base[d] * x.mult[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  };
  $$("[id^=sb-],[id^=sm-]").forEach((i) => (i.oninput = preview));
  preview();
  const qsum = () => {
    const f = Number($("#sq-full").value), r = Number($("#sq-red").value), p = Number($("#sq-pct").value);
    $("#sq-sum").textContent = `Each day a student gets full points for ${f} quick challenge${f === 1 ? "" : "s"}, ${r ? `${p}% for the next ${r}, ` : ""}${$("#sq-lock").checked ? "then no more quick challenges until the next day (midnight UTC). Write code, SQL and HackerRank stay unlimited." : "then 0 (they can keep playing for practice)."}`;
  };
  $$("[id^=sq-]").forEach((i) => (i.oninput = qsum));
  qsum();
  $("#save").onclick = (e) => busy(e.currentTarget, async () => {
    const arena = $("#s-arena").value;
    S.guild = await api("/settings", { method: "PUT", body: {
      lang: $("#s-lang").value, arena_channel: arena, announce_channel: arena,
      daily_channel: $("#s-daily").value || arena, daily_hour: Number($("#s-hour").value), champion_role: $("#s-champ").value, streak_role: $("#s-streak").value,
    } });
    if ($("#s-track").value !== trackKeyOf(S.guild)) await changeTrack($("#s-track").value);
    toast("Settings saved");
  });
  $("#save-sc").onclick = (e) => busy(e.currentTarget, async () => { await api("/settings", { method: "PUT", body: { scoring: readScoring() } }); toast("Scoring saved: /help shows the new table"); viewSettings(); });
  if ($("#reset-sc")) $("#reset-sc").onclick = (e) => busy(e.currentTarget, async () => { await api("/settings", { method: "PUT", body: { scoring: null } }); toast("Default scoring restored"); viewSettings(); });
  $("#s-champ").onchange = $("#s-streak").onchange = () => $("#save").click();
  loadAutoRoles();
  $("#save-ac").onclick = (e) => busy(e.currentTarget, async () => {
    S.guild = await api("/settings", { method: "PUT", body: { integrity: {
      editor: $("#ac-editor").value, explain: $("#ac-explain").checked, similarity: $("#ac-sim").checked, codeImage: $("#ac-img").checked,
      quickLimit: Number($("#ac-quick").value), practiceWeight: Number($("#ac-pw").value),
    } } });
    toast("Anti-cheat settings saved");
  });
  if (location.hash.includes("anticheat")) setTimeout(() => $("#anticheat")?.scrollIntoView({ behavior: "smooth" }), 50);
  $("#diag").onclick = (e) => busy(e.currentTarget, async () => {
    $("#diag-out").innerHTML = `<p class="muted">Running… (up to a minute)</p>`;
    const d = await api("/diagnostics");
    const line = (name, r, extra = "") => `<tr><td><b>${name}</b></td><td>${r.ok ? '<span class="status solved">OK</span>' : '<span class="status failed">Problem</span>'}</td><td class="small">${esc(r.detail || "")}${extra}</td><td class="num small">${r.ms ? `${r.ms} ms` : ""}</td></tr>`;
    const bank = {};
    for (const b of d.bank) (bank[b.kind] ??= {})[b.difficulty] = b.n;
    $("#diag-out").innerHTML = `<div class="table-wrap"><table>
      ${line("Code runner", d.runner)}${line("AI", d.ai)}${line("HackerRank", d.hackerrank)}
      <tr><td><b>#arena</b></td><td>${d.arena ? '<span class="status solved">OK</span>' : '<span class="status failed">Missing</span>'}</td><td class="small">${d.arena ? `#${esc(channelName(d.arena) || d.arena)}` : "Create a channel named arena or pick one above"}</td><td></td></tr>
      <tr><td><b>Database</b></td><td>${d.migrations?.ok === false ? '<span class="status failed">Update needed</span>' : '<span class="status solved">OK</span>'}</td><td class="small">${d.migrations?.ok === false ? `Run <code>npm run update</code> in the classbot folder (missing ${esc(d.migrations.missing.length)} migration(s))` : "all migrations applied"}</td><td></td></tr>
      <tr><td><b>AI budget today</b></td><td></td><td class="small">${d.budget.used} / ${d.budget.limit} units used${d.queue.length ? ` · queue: ${d.queue.map((q) => `${q.n} ${esc(q.status)}`).join(", ")}` : ""}</td><td></td></tr>
      </table></div>
      <h3>Challenge bank</h3><div class="table-wrap"><table><thead><tr><th></th>${["easy", "medium", "hard"].map((x) => `<th class="num">${DIFF[x]}</th>`).join("")}</tr></thead>
      <tbody>${Object.keys(KIND).map((k) => `<tr><td>${KIND[k]}</td>${["easy", "medium", "hard"].map((x) => `<td class="num">${bank[k]?.[x] ?? 0}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  });
  $("#season").onclick = () => {
    const name = $("#s-season").value.trim();
    if (!name) return toast("Give the new season a name first", true);
    confirmDialog(`Start "${name}"?`, "Season points restart from zero for everyone. History is kept.", "Start season", async () => {
      await api("/season", { method: "POST", body: { name, announce: $("#s-announce").checked } });
      toast(`${name} has started`);
      viewSettings();
    });
  };
}


// ---------------------------------------------------- automatic roles
async function loadAutoRoles(state = null) {
  const box = $("#ar-body");
  if (!box) return;
  const d = state || await api("/roles").catch((e) => ({ error: e.message, roles: [] }));
  $("#ar-on").checked = !!d.on;
  const err = d.error === "permission"
    ? `<div class="notice warn"><b>The bot isn't allowed to manage roles.</b> In Discord: Server Settings → Roles → give the bot's role the <b>Manage Roles</b> permission, and drag it <b>above</b> the roles it hands out. Then press “Create &amp; update now”.</div>`
    : d.error ? `<div class="notice warn">Last update failed: ${esc(d.error)}</div>` : "";
  box.innerHTML = `${err}<div class="role-list">${d.roles.map((r) => `
    <label class="role-row ${r.on ? "" : "off"}">
      <input type="checkbox" data-role="${r.key}" ${r.on ? "checked" : ""} ${d.on ? "" : "disabled"}>
      <span class="role-dot" style="background:${r.color}"></span>
      <span class="role-main"><b style="color:${r.color}">${esc(r.name)}</b>${r.hoist ? ' <span class="tag">shown on top</span>' : ""}<small>${esc(r.desc)}</small></span>
      <span class="role-people small">${!d.on || !r.on ? '<span class="muted">off</span>' : r.count ? r.people.map((p) => `${avatar(p.name, p.id)} ${esc(p.name || p.id)}`).join(" ") + (r.count > r.people.length ? ` <span class="muted">+${r.count - r.people.length}</span>` : "") : '<span class="muted">nobody yet</span>'}
        ${r.on && d.on && !r.created ? '<span class="tag">will be created</span>' : ""}${r.pending ? ` <span class="muted">· ${r.pending} change${r.pending > 1 ? "s" : ""} pending</span>` : ""}</span>
    </label>`).join("")}</div>
    <p class="muted small">${d.synced ? `Last update ${fmtAgo(d.synced)}.` : "Not created yet: press “Create &amp; update now”."} Turning a role off takes it back from students; the role itself stays in your server (delete it in Discord if you want).</p>`;
  const save = (body) => api("/roles", { method: "PUT", body }).then((x) => { loadAutoRoles(x); toast("Saved"); }).catch((e) => toast(e.message, true));
  $("#ar-on").onchange = () => save({ on: $("#ar-on").checked });
  $$("[data-role]", box).forEach((c) => c.onchange = () => save({ off: $$("[data-role]", box).filter((x) => !x.checked).map((x) => x.dataset.role) }));
  $("#ar-sync").onclick = (e) => busy(e.currentTarget, async () => { const x = await api("/roles/sync", { method: "POST" }); loadAutoRoles(x); toast(x.error ? "Couldn't update the roles" : "Roles updated", !!x.error); });
}

// ============================================================ daily
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAILY_KIND = { write: "Write code", quick: "Quick (any type)", mcq: "Multiple choice", complexity: "Complexity", output: "Predict the output", bug: "Find the bug", code: "HackerRank problem", sql: "SQL query", regex: "Regular expression" };
const langTag = (l) => (l ? `<span class="tag lang">${esc(LANG[l] || l)}</span>` : "");
const dayLabel = (day) => {
  const d = new Date(day + "T12:00:00Z");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};
const utcHourLocal = (h) => { const d = new Date(); d.setUTCHours(h, 0, 0, 0); return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); };

/** A searchable challenge list in a dialog; resolves with the chosen challenge (or null). */
async function pickChallengeDialog(title, { langs = null, kinds = null } = {}) {
  const rows = (await loadChallenges()).filter((c) => c.status === "active" && (!kinds || kinds.includes(c.kind)));
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    openDialog(title, `
      <div class="toolbar" style="margin:0 0 10px">
        <input type="search" id="pk-q" placeholder="Search titles and topics" style="flex:1;min-width:180px">
        <select id="pk-k"><option value="">All types</option>${Object.entries(KIND).filter(([k]) => !kinds || kinds.includes(k)).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        <select id="pk-d"><option value="">All levels</option>${Object.entries(DIFF).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        <select id="pk-l"><option value="">All languages</option>${Object.entries(LANG).map(([k, v]) => `<option value="${k}" ${langs && langs.length === 1 && langs[0] === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      </div>
      <div id="pk-list" class="pick-list"></div>`, []);
    const draw = () => {
      const q = $("#pk-q", dlg).value.toLowerCase(), k = $("#pk-k", dlg).value, d = $("#pk-d", dlg).value, l = $("#pk-l", dlg).value;
      const shown = rows.filter((r) => (!q || `${r.title} ${r.topic || ""}`.toLowerCase().includes(q)) && (!k || r.kind === k) && (!d || r.difficulty === d)
        && (!l || r.code_lang === l || r.kind === "write" || r.kind === "code" || !r.code_lang)).slice(0, 150);
      $("#pk-list", dlg).innerHTML = shown.length ? shown.map((r) => `<button type="button" class="pick" data-id="${r.id}">
          <span><b>${esc(r.title)}</b><small>${esc(KIND[r.kind] || r.kind)}${r.topic ? ` · ${esc(r.topic)}` : ""}${r.attempts ? ` · ${r.attempts} tries, ${r.attempts ? Math.round((100 * r.solved) / Math.max(1, r.solved + r.failed)) : 0}% solved` : " · never used"}</small></span>
          <span class="pick-tags">${langTag(r.kind === "write" || r.kind === "code" ? null : r.code_lang)}${diffTag(r.difficulty)}</span></button>`).join("")
        : `<p class="empty">No challenge matches.</p>`;
      $$("[data-id]", dlg).forEach((b) => b.onclick = () => { finish(rows.find((r) => String(r.id) === b.dataset.id)); dlg.close(); });
    };
    ["#pk-q", "#pk-k", "#pk-d", "#pk-l"].forEach((s) => ($(s, dlg).oninput = draw));
    draw();
    dlg.addEventListener("close", () => finish(null), { once: true });
  });
}

async function viewDaily() {
  const [d] = await Promise.all([api("/daily"), loadDiscord()]);
  const cfg = d.config;
  const today = d.today;
  const chName = d.channel ? `#${esc(channelName(d.channel) || d.channel)}` : "no channel";
  view.innerHTML = `
    <div class="page-head"><div><h1>Daily challenge</h1><p class="sub">${cfg.enabled ? `Posted every day at <b>${String(d.hour).padStart(2, "0")}:00 UTC</b> (${utcHourLocal(d.hour)} your time) in <b>${chName}</b>` : "<b>Paused</b>: nothing is posted until you turn it back on"}</p></div>
      <div class="toolbar" style="margin:0"><button class="btn primary" id="post-now">${icon("spark")}Post a challenge now</button></div></div>
    <div class="stack">
      <section class="panel today-card">
        <div class="panel-head"><h2>Today</h2><span class="muted small">${esc(dayLabel(new Date().toISOString().slice(0, 10)))}</span></div>
        ${today ? `<div class="today">
            <div><div class="today-title">${esc(today.title)}</div>
              <div class="today-meta">${esc(KIND[today.kind] || today.kind)} ${diffTag(today.difficulty)} ${langTag(today.kind === "write" || today.kind === "code" ? null : today.code_lang)}</div></div>
            <div class="today-stats"><div><b>${today.tried}</b><span>opened</span></div><div><b>${today.solvers}</b><span>solved</span></div></div>
            <div class="toolbar" style="margin:0"><button class="btn" id="replace">Replace today's challenge</button></div>
          </div>`
        : `<p class="empty">${d.posted ? "Skipped today (nothing left that matches the plan)." : `Not posted yet. ${d.upcoming[0].pin ? `It will be <b>${esc(d.upcoming[0].pin.title)}</b> (chosen by you).` : `It will be a random <b>${esc(DIFF[d.upcoming[0].difficulty])} · ${esc(DAILY_KIND[d.upcoming[0].kind])}</b>.`}`}</p>`}
      </section>
      <div class="grid cols-2">
        <section class="panel"><div class="panel-head"><h2>Next 14 days</h2><span class="muted small">Pick a challenge for a day, or leave it random</span></div>
          <ul class="days">${d.upcoming.map((u, i) => `<li class="${u.pin ? "pinned" : ""}">
              <span class="day"><b>${esc(dayLabel(u.day))}</b>${i === 0 ? '<small>today</small>' : ""}</span>
              <span class="what">${u.pin ? `📌 <b>${esc(u.pin.title)}</b> ${diffTag(u.pin.difficulty)} ${langTag(u.pin.kind === "write" || u.pin.kind === "code" ? null : u.pin.code_lang)}<small>${esc(KIND[u.pin.kind] || u.pin.kind)} · chosen by you</small>`
                : `<span class="muted">🎲 Random</span> ${diffTag(u.difficulty)} <small>${esc(DAILY_KIND[u.kind])}${["write", "code", "sql", "regex"].includes(u.kind) ? "" : ` · ${esc(cfg.langsEffective.map((l) => LANG[l] || l).join(" / "))}`}</small>`}</span>
              <span class="acts">${u.pin ? `<button class="btn small" data-unpin="${u.day}">Make random</button>` : ""}<button class="btn small" data-pin="${u.day}">${u.pin ? "Change" : "Choose…"}</button></span>
            </li>`).join("")}</ul>
        </section>
        <section class="panel"><h2>Settings</h2>
          <label class="check switch"><input type="checkbox" id="dy-on" ${cfg.enabled ? "checked" : ""}> Post a daily challenge every day</label>
          <label for="dy-ch">Channel</label>
          <select id="dy-ch" style="width:100%"><option value="">#arena (automatic)</option>${channelOptions(d.channelSet && d.channelSet !== S.guild?.arena_channel ? d.channelSet : "")}</select>
          <label for="dy-h">Time <span class="muted">(UTC hour)</span></label>
          <div class="field-row" style="align-items:center"><input type="number" id="dy-h" min="0" max="23" value="${d.hour}" style="max-width:110px"><span class="muted small" id="dy-local"></span></div>
          <label>Language of quick challenges</label>
          <p class="small" style="margin:4px 0">${cfg.langs.length ? `Only <b>${esc(cfg.langs.map((l) => LANG[l] || l).join(", "))}</b> (your choice below)` : `Follows the class track: <b>${esc(d.classLangs.map((l) => LANG[l] || l).join(", ") || "no code language")}</b>`}. Write-code problems are answered in any language.</p>
          <details ${cfg.langs.length ? "open" : ""}><summary class="small muted">Use other languages for the daily challenge</summary>
            <div class="checks" id="dy-langs">${["javascript", "php", "python", "java", "c", "cpp"].map((l) => `<label class="check"><input type="checkbox" value="${l}" ${cfg.langs.includes(l) ? "checked" : ""}> ${esc(LANG[l])}</label>`).join("")}</div>
            <p class="muted small">None ticked = the class track.</p></details>
          <h3>Weekly plan</h3>
          <table class="plan"><tbody>${[1, 2, 3, 4, 5, 6, 0].map((i) => `<tr><td>${WEEKDAYS[i]}</td>
              <td><select data-pd="${i}">${Object.entries(DIFF).map(([k, v]) => `<option value="${k}" ${cfg.plan[i][0] === k ? "selected" : ""}>${v}</option>`).join("")}</select></td>
              <td><select data-pk="${i}">${Object.entries(DAILY_KIND).map(([k, v]) => `<option value="${k}" ${cfg.plan[i][1] === k ? "selected" : ""}>${v}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table>
          <p><button class="btn primary" id="dy-save">Save daily settings</button></p>
        </section>
      </div>
      <section class="panel"><div class="panel-head"><h2>Past daily challenges</h2><span class="muted small">last 30</span></div>
        ${table([
          { label: "Day", sort: "day", html: (h) => `<span class="small">${esc(dayLabel(h.day))}</span>` },
          { label: "Challenge", sort: "title", html: (h) => `<b>${esc(h.title)}</b><div class="muted small">${esc(KIND[h.kind] || h.kind)}</div>` },
          { label: "Level", sort: "difficulty", html: (h) => diffTag(h.difficulty) },
          { label: "Language", html: (h) => langTag(h.kind === "write" || h.kind === "code" ? null : h.code_lang) || '<span class="muted small">any</span>' },
          { label: "Opened", sort: "tried", num: true, html: (h) => `${h.tried}` },
          { label: "Solved", sort: "solvers", num: true, html: (h) => `${h.solvers}` },
          { label: "Success", num: true, html: (h) => (h.tried ? `${Math.round((100 * h.solvers) / h.tried)}%` : "—") },
        ], d.history, { sort: { key: "day" }, empty: "No daily challenge yet." })}
      </section>
    </div>`;
  const local = () => ($("#dy-local").textContent = `= ${utcHourLocal(Number($("#dy-h").value) || 0)} your time`);
  $("#dy-h").oninput = local;
  local();
  $("#dy-save").onclick = (e) => busy(e.currentTarget, async () => {
    await api("/daily/settings", { method: "PUT", body: {
      enabled: $("#dy-on").checked, channel_id: $("#dy-ch").value, hour: Number($("#dy-h").value),
      langs: $$("#dy-langs input:checked").map((i) => i.value),
      plan: [0, 1, 2, 3, 4, 5, 6].map((i) => [$(`[data-pd="${i}"]`).value, $(`[data-pk="${i}"]`).value]),
    } });
    toast("Daily challenge settings saved");
    viewDaily();
  });
  $$("[data-pin]").forEach((b) => b.onclick = async () => {
    const c = await pickChallengeDialog(`Daily challenge for ${dayLabel(b.dataset.pin)}`, { langs: cfg.langsEffective });
    if (!c) return;
    await api("/daily/pins", { method: "POST", body: { day: b.dataset.pin, challenge_id: c.id } });
    toast(`"${c.title}" planned for ${dayLabel(b.dataset.pin)}`);
    viewDaily();
  });
  $$("[data-unpin]").forEach((b) => b.onclick = () => busy(b, async () => { await api(`/daily/pins/${b.dataset.unpin}`, { method: "DELETE" }); toast("Back to random"); viewDaily(); }));
  const postNow = (replace) => openDialog(replace ? "Replace today's challenge" : "Post a challenge now", `
      <p class="muted small">${replace ? "The new challenge replaces today's: the Solve button on today's post opens the new one, and the first-solver bonus starts again." : "It becomes today's daily challenge (it replaces today's if one was already posted)."}</p>
      <div class="tabs" role="tablist"><button data-t="pick" aria-selected="true">Choose a challenge</button><button data-t="rand">Random</button></div>
      <div data-pane="pick"><p><button class="btn" id="pn-choose">Browse the bank…</button> <span id="pn-chosen" class="muted">nothing chosen yet</span></p></div>
      <div data-pane="rand" hidden><div class="field-row">
        <div><label for="pn-d">Level</label><select id="pn-d">${Object.entries(DIFF).map(([k, v]) => `<option value="${k}" ${k === "medium" ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div><label for="pn-k">Type</label><select id="pn-k">${Object.entries(DAILY_KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
        <div><label for="pn-l">Language</label><select id="pn-l">${cfg.langsEffective.concat(["javascript", "php", "python"]).filter((v, i, a) => a.indexOf(v) === i).map((l) => `<option value="${l}">${esc(LANG[l] || l)}</option>`).join("")}</select></div>
      </div></div>
      <label for="pn-ch">Post in</label><select id="pn-ch" style="width:100%"><option value="">${chName} (daily channel)</option>${channelOptions("")}</select>`,
    [{ label: "Post it", primary: true, action: async (root) => {
      const tab = $("[data-pane]:not([hidden])", root).dataset.pane;
      if (tab === "pick" && !root.dataset.cid) throw new Error("Choose a challenge first (or use Random).");
      const r = await api("/daily/post", { method: "POST", body: tab === "pick" ? { challenge_id: Number(root.dataset.cid), channel_id: $("#pn-ch", root).value }
        : { difficulty: $("#pn-d", root).value, kind: $("#pn-k", root).value, langs: [$("#pn-l", root).value], channel_id: $("#pn-ch", root).value } });
      dlg.close();
      toast(`Posted: ${r.postedNow}`);
      viewDaily();
    } }]);
  const wirePost = () => {
    const root = dlg;
    delete root.dataset.cid;
    $$("[data-t]", root).forEach((b) => b.onclick = () => { $$("[data-t]", root).forEach((x) => x.setAttribute("aria-selected", String(x === b))); $$("[data-pane]", root).forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.t)); });
    $("#pn-choose", root).onclick = async () => {
      const saved = root.innerHTML;
      const keep = { d: $("#pn-ch", root).value };
      const c = await pickChallengeDialog("Choose today's challenge", { langs: cfg.langsEffective });
      // the picker used the same dialog: bring the post form back
      postNow(!!today); wirePost();
      if (c) { dlg.dataset.cid = c.id; $("#pn-chosen", dlg).innerHTML = `<b>${esc(c.title)}</b> ${diffTag(c.difficulty)}`; }
      $("#pn-ch", dlg).value = keep.d;
      void saved;
    };
  };
  $("#post-now").onclick = () => { postNow(!!today); wirePost(); };
  if ($("#replace")) $("#replace").onclick = () => { postNow(true); wirePost(); };
}

// =========================================================== points
async function viewPoints() {
  const rows = await loadStudents(true);
  const season = S.guild?.season || "this season";
  const totalSeason = rows.reduce((s, r) => s + r.season_pts, 0);
  const sel = new Set();
  view.innerHTML = `
    <div class="page-head"><div><h1>Points</h1><p class="sub">Give, remove or reset points for everyone or chosen students · ${esc(season)}</p></div></div>
    <div class="stack">
      <div class="figures">
        <div class="figure"><div class="ico">${icon("users")}</div><b>${rows.length}</b><span>students</span></div>
        <div class="figure"><div class="ico">${icon("trophy")}</div><b>${totalSeason}</b><span>points this season, all students</span></div>
        <div class="figure"><div class="ico">${icon("activity")}</div><b>${rows.length ? Math.round(totalSeason / rows.length) : 0}</b><span>average per student</span></div>
      </div>
      <div class="grid cols-2">
        <section class="panel"><div class="panel-head"><h2>Students</h2>
            <span class="toolbar" style="margin:0"><input type="search" id="pt-q" placeholder="Search" style="min-width:160px"><button class="btn small" id="pt-all">Select all</button><button class="btn small" id="pt-none">Clear</button></span></div>
          <div id="pt-list"></div></section>
        <section class="panel sticky-panel"><h2>Change points</h2>
          <label>Who</label>
          <div class="seg" id="pt-who"><button type="button" data-v="all" aria-pressed="true">Everyone (${rows.length})</button><button type="button" data-v="sel" aria-pressed="false">Selected (<span id="pt-n">0</span>)</button></div>
          <label>What</label>
          <div class="seg" id="pt-act"><button type="button" data-v="add" aria-pressed="true">＋ Give</button><button type="button" data-v="remove" aria-pressed="false">− Remove</button><button type="button" data-v="set" aria-pressed="false">= Set to</button></div>
          <div class="field-row">
            <div><label for="pt-amt">Points</label><input type="number" id="pt-amt" min="0" value="10"></div>
            <div><label for="pt-scope">Which points</label><select id="pt-scope"><option value="season">This season (leaderboard)</option><option value="all">All-time too (levels)</option></select></div>
          </div>
          <label for="pt-why">Reason <span class="muted">(shown in their points log)</span></label><input type="text" id="pt-why" style="width:100%" maxlength="200" placeholder="e.g. Great participation in the workshop">
          <label class="check"><input type="checkbox" id="pt-dm"> Tell the students in a Discord DM (up to 20)</label>
          <p id="pt-preview" class="notice small"></p>
          <p><button class="btn primary" id="pt-go">Apply</button></p>
          <hr>
          <h3>Reset</h3>
          <p class="muted small">Resets add correcting entries to the points log, so you keep the history.</p>
          <div class="toolbar" style="margin:0"><button class="btn danger" id="pt-reset-season">Reset everyone's season points to 0</button><button class="btn danger" id="pt-reset-all">Reset everything (levels too)</button></div>
        </section>
      </div>
    </div>`;
  const state = { who: "all", act: "add" };
  const seg = (id, key) => $$(`#${id} button`).forEach((b) => b.onclick = () => { state[key] = b.dataset.v; $$(`#${id} button`).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); preview(); });
  seg("pt-who", "who"); seg("pt-act", "act");
  const targets = () => (state.who === "all" ? rows : rows.filter((r) => sel.has(r.discord_id)));
  const preview = () => {
    $("#pt-n").textContent = sel.size;
    const n = targets().length, amt = Math.max(0, Math.round(Number($("#pt-amt").value) || 0));
    const what = state.act === "add" ? `give <b>+${amt}</b> to` : state.act === "remove" ? `remove <b>${amt}</b> from` : `set to <b>${amt}</b> the ${$("#pt-scope").value === "all" ? "all-time and season" : "season"} points of`;
    $("#pt-preview").innerHTML = n ? `This will ${what} <b>${n}</b> student${n > 1 ? "s" : ""}${state.who === "sel" && n <= 6 ? ` (${esc(targets().map((r) => r.name || r.discord_id).join(", "))})` : ""}.` : "Select students in the list first.";
  };
  const draw = () => {
    const q = $("#pt-q").value.toLowerCase();
    const shown = rows.filter((r) => !q || `${r.name} ${r.hr_display || ""}`.toLowerCase().includes(q));
    $("#pt-list").innerHTML = table([
      { label: "", html: (r) => `<input type="checkbox" data-sel="${esc(r.discord_id)}" ${sel.has(r.discord_id) ? "checked" : ""} aria-label="Select ${esc(r.name || "")}">` },
      { label: "Student", sort: "name", html: (r) => `<span class="who-cell">${avatar(r.name, r.discord_id)}<a href="#/student/${r.discord_id}">${esc(r.name || r.discord_id)}</a></span>` },
      { label: "Season", sort: "season_pts", num: true, html: (r) => `<b>${r.season_pts}</b>` },
      { label: "All-time", sort: "total_pts", num: true, html: (r) => `${r.total_pts}` },
      { label: "Level", sort: "level", num: true, html: (r) => `${r.level}` },
    ], shown, { sort: { key: "season_pts" }, empty: "No students yet." });
    setTimeout(() => $$("[data-sel]").forEach((c) => c.onchange = () => {
      c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel);
      if (sel.size && state.who === "all") $("#pt-who [data-v=sel]").click(); else preview();
    }), 0);
  };
  $("#pt-q").oninput = draw;
  $("#pt-all").onclick = () => { rows.forEach((r) => sel.add(r.discord_id)); draw(); preview(); };
  $("#pt-none").onclick = () => { sel.clear(); draw(); preview(); };
  $("#pt-amt").oninput = preview; $("#pt-scope").onchange = preview;
  draw(); preview();
  const apply = async (body, msg) => {
    const r = await api("/points/bulk", { method: "POST", body });
    toast(`${msg}: ${r.students} student${r.students > 1 ? "s" : ""}`);
    S.students = null;
    viewPoints();
  };
  $("#pt-go").onclick = () => {
    const list = targets();
    if (!list.length) return toast("Select at least one student", true);
    const amt = Math.max(0, Math.round(Number($("#pt-amt").value) || 0));
    if (state.act !== "set" && !amt) return toast("Enter a number of points", true);
    confirmDialog("Apply this change?", $("#pt-preview").textContent, "Apply", () => apply({
      all: state.who === "all", students: list.map((r) => r.discord_id), action: state.act, amount: amt,
      scope: $("#pt-scope").value, reason: $("#pt-why").value, notify: $("#pt-dm").checked,
    }, "Points updated"), state.act !== "add");
  };
  $("#pt-reset-season").onclick = () => confirmDialog("Reset everyone's season points to 0?", `The ${season} leaderboard starts again from zero. Levels (all-time points) are kept. Tip: to start a new season instead, use Settings → Season.`, "Reset season points",
    () => apply({ all: true, action: "set", amount: 0, scope: "season", reason: "Season points reset by the teacher" }, "Season points reset"), true);
  $("#pt-reset-all").onclick = () => confirmDialog("Reset ALL points to 0?", "Every student goes back to 0 points and level 1, in every season. The points log keeps the history.", "Reset everything",
    () => apply({ all: true, action: "set", amount: 0, scope: "all", reason: "All points reset by the teacher" }, "All points reset"), true);
}

// ============================================================== boot
(async function boot() {
  try {
    S.me = await fetch("/api/me").then((r) => r.json());
    $("#who").innerHTML = S.me.mode === "password" ? `<a href="/logout" style="color:inherit">Sign out</a>` : S.me.email ? `Signed in as ${esc(S.me.email)}` : "";
    S.guilds = await api("/guilds");
    const sel = $("#guild");
    let saved = null;
    try { saved = localStorage.getItem("classbot.g"); } catch { /* storage blocked */ }
    // links from Discord DMs: /?g=<class>&open=hands/12 opens that class and that page
    const qs = new URLSearchParams(location.search);
    if (qs.get("g") && S.guilds.some((g) => g.id === qs.get("g"))) { saved = qs.get("g"); try { localStorage.setItem("classbot.g", saved); } catch { /* ignore */ } }
    if (qs.has("g") || qs.has("open")) {
      const open = (qs.get("open") || "").replace(/[^\w/-]/g, "");
      history.replaceState(null, "", "/" + (open ? `#/${open}` : location.hash));
    }
    S.g = S.guilds.find((g) => g.id === saved)?.id ?? S.guilds[0]?.id ?? null;
    sel.innerHTML = S.guilds.map((g) => `<option value="${g.id}" ${g.id === S.g ? "selected" : ""}>${esc(g.name || g.id)}</option>`).join("") || "<option>No server yet</option>";
    sel.onchange = () => {
      S.g = sel.value;
      Object.assign(S, { guild: S.guilds.find((g) => g.id === S.g), discord: null, students: null, challenges: null });
      try { localStorage.setItem("classbot.g", S.g); } catch { /* ignore */ }
      route();
    };
    S.guild = S.guilds.find((g) => g.id === S.g) ?? null;
  } catch (e) {
    view.innerHTML = `<div class="notice"><b>Couldn't reach the dashboard API.</b> ${esc(e.message)}</div>`;
    return;
  }
  route();
})();

// ============================================================ integrity
const LEVEL = { 0: ["ok", "Looks normal"], 1: ["warn", "Worth a look"], 2: ["bad", "Suspicious"] };
const levelBadge = (l) => `<span class="lvl ${LEVEL[l]?.[0] || "ok"}">${esc(LEVEL[l]?.[1] || "—")}</span>`;
const fmtSec = (s) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}` : `${s} s`);
const REVIEWED = { 1: "Marked fine", 2: "Points removed" };

function integrityCard(a, { showStudent = true } = {}) {
  const st = a.stats || {};
  const ex = a.explain;
  return `<article class="flag-card lvl-${a.level}" data-attempt="${a.id}">
    <header>
      ${showStudent ? `<a class="who-link" href="#/student/${esc(a.discord_id)}">${avatar(a.name, a.discord_id)}<b>${esc(a.name || a.discord_id)}</b></a>` : ""}
      <span class="flag-title">${esc(a.title)} ${diffTag(a.difficulty)} <span class="muted small">${esc(ORIGIN[a.origin] || a.origin)} · ${esc(LANG[a.lang] || a.lang || "")} · ${fmtDateTime(a.finished_at || a.started_at)}</span></span>
      ${levelBadge(a.level)}
    </header>
    ${a.flags.length ? `<ul class="flags">${a.flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : `<p class="muted small">No warning signs.</p>`}
    ${a.editor ? `<p class="stats-line small">⌨️ typed ${st.typedChars ?? 0} chars · deleted ${st.deletedChars ?? 0} · ${fmtSec(st.activeSec ?? 0)} of active typing · left the page ${st.awayCount ?? 0}× (${fmtSec(st.awaySec ?? 0)}) · ${st.pastes ?? 0} paste attempt${st.pastes === 1 ? "" : "s"} · final code ${st.finalChars ?? 0} chars</p>` : ""}
    ${a.similar?.length ? `<p class="small">👯 Very similar to: ${a.similar.map((s) => `<a href="#/student/${esc(s.discordId)}">${esc(s.name || s.discordId)}</a> <b>${Math.round(s.score * 100)}%</b>`).join(", ")}</p>` : ""}
    ${ex ? `<details class="explain"><summary class="small">🧠 Explanation: ${ex.score == null ? "not answered" : `<b>${Math.round(ex.score * 100)}%</b>`}</summary>
      ${(ex.questions || []).map((q, i) => `<p class="small"><b>Q${i + 1}.</b> ${esc(q)}<br><span class="answer">${esc(ex.answers?.[i] || "(no answer)")}</span></p>`).join("")}
      ${ex.feedback ? `<p class="small muted">${esc(ex.feedback)}</p>` : ""}</details>` : ""}
    <footer>
      <span class="small muted">${a.points} pts${a.reviewed ? ` · ${REVIEWED[a.reviewed]}` : ""}</span>
      <span class="toolbar" style="margin:0">
        <button class="btn small" data-replay="${a.id}">${a.has_log ? "▶ Replay typing" : "View code"}</button>
        ${a.reviewed ? "" : `<button class="btn small" data-fine="${a.id}">Looks fine</button><button class="btn small danger" data-void="${a.id}">Remove points</button>`}
      </span>
    </footer>
  </article>`;
}

function wireIntegrity(root, rows, reload) {
  $$("[data-replay]", root).forEach((b) => b.onclick = () => replayDialog(Number(b.dataset.replay), rows.find((r) => r.id === Number(b.dataset.replay))));
  $$("[data-fine]", root).forEach((b) => b.onclick = () => busy(b, async () => {
    await api(`/attempts/${b.dataset.fine}/integrity`, { method: "POST", body: { action: "ok" } });
    toast("Marked as fine");
    reload();
  }));
  $$("[data-void]", root).forEach((b) => b.onclick = () => {
    const a = rows.find((r) => r.id === Number(b.dataset.void));
    openDialog("Remove the points?", `<p>${esc(a?.name || "This student")} loses the <b>${a?.points ?? 0} points</b> from “${esc(a?.title || "")}”. A correcting entry is added to the points log (history is kept).</p>
      <label for="v-reason">Reason <span class="muted">(shown to the student if you notify them)</span></label>
      <input type="text" id="v-reason" style="width:100%" value="The code doesn't look like your own work" maxlength="200">
      <label class="check"><input type="checkbox" id="v-dm" checked> Send them a private message on Discord</label>`,
    [{ label: "Remove points", danger: true, action: async () => {
      await api(`/attempts/${a.id}/integrity`, { method: "POST", body: { action: "void", reason: $("#v-reason", dlg).value, notify: $("#v-dm", dlg).checked } });
      dlg.close();
      toast("Points removed");
      S.students = null;
      reload();
    } }]);
  });
}

async function viewIntegrity() {
  const showAll = sessionStorage.getItem("classbot.intAll") === "1";
  const [rows, g] = await Promise.all([api(`/integrity${showAll ? "?all=1" : ""}`), api("/settings")]);
  S.guild = g;
  const cfg = g.integrity || {};
  const open = rows.filter((r) => !r.reviewed && r.level > 0);
  const sus = open.filter((r) => r.level === 2).length;
  const sim = open.filter((r) => r.similar?.length).length;
  const pasters = open.filter((r) => r.stats?.pastes).length;
  setIntegrityPill(open.length);
  const [q, lvl] = [sessionStorage.getItem("classbot.intQ") || "", sessionStorage.getItem("classbot.intL") || ""];
  view.innerHTML = `
    <div class="page-head"><div><h1>Integrity</h1><p class="sub">Code that may not be the student's own work. Nothing is automatic: you decide.</p></div>
      <div class="toolbar" style="margin:0"><a class="btn" href="#/settings/anticheat">${icon("gear")} Anti-cheat settings</a></div></div>
    <div class="stack">
      <div class="figures">
        <div class="figure"><b>${open.length}</b><span>to review</span></div>
        <div class="figure"><b>${sus}</b><span>suspicious (several signs)</span></div>
        <div class="figure"><b>${sim}</b><span>very similar to a classmate</span></div>
        <div class="figure"><b>${pasters}</b><span>tried to paste</span></div>
      </div>
      <div class="notice small">Code editor <b>${esc({ required: "required", optional: "optional", off: "off" }[cfg.editor] || "required")}</b> · explain your code <b>${cfg.explain ? "on" : "off"}</b> · similarity check <b>${cfg.similarity ? "on" : "off"}</b> · quick challenges as images <b>${cfg.codeImage ? "on" : "off"}</b>${cfg.quickLimit ? ` · ${cfg.quickLimit} s limit` : ""}${cfg.practiceWeight !== 1 ? ` · practice ×${cfg.practiceWeight}` : ""}.
        A flag is a reason to look, not proof: ask the student to explain their code in class before removing points.</div>
      <div class="toolbar">
        <input type="search" id="i-q" placeholder="Search a student or challenge" value="${esc(q)}" style="flex:1;min-width:200px">
        <select id="i-l"><option value="">All levels</option><option value="2" ${lvl === "2" ? "selected" : ""}>Suspicious</option><option value="1" ${lvl === "1" ? "selected" : ""}>Worth a look</option></select>
        <label class="check" style="margin:0"><input type="checkbox" id="i-all" ${showAll ? "checked" : ""}> Show reviewed and clean submissions</label>
      </div>
      <div id="i-list" class="flag-list"></div>
    </div>`;
  const draw = () => {
    const qq = $("#i-q").value.toLowerCase(), ll = $("#i-l").value;
    sessionStorage.setItem("classbot.intQ", $("#i-q").value);
    sessionStorage.setItem("classbot.intL", ll);
    const shown = rows.filter((r) => (!qq || `${r.name || ""} ${r.title}`.toLowerCase().includes(qq)) && (!ll || String(r.level) === ll));
    $("#i-list").innerHTML = shown.length ? shown.map((r) => integrityCard(r)).join("") : `<div class="panel"><p class="empty">${rows.length ? "Nothing matches." : "Nothing to review. 🎉 Submissions with warning signs show up here."}</p></div>`;
    wireIntegrity($("#i-list"), rows, viewIntegrity);
  };
  $("#i-q").oninput = $("#i-l").onchange = draw;
  $("#i-all").onchange = () => { sessionStorage.setItem("classbot.intAll", $("#i-all").checked ? "1" : "0"); viewIntegrity(); };
  draw();
}

function setIntegrityPill(n) {
  const p = $("#pill-integrity");
  if (!p) return;
  p.hidden = !n;
  p.textContent = n;
}

// ------------------------------------------------------------- replay
/** Rebuild the code step by step from the editor's change log and play it back. */
async function replayDialog(id, meta = null) {
  const d = await api(`/attempts/${id}/log`);
  const sessions = (d.sessions || []).filter((s) => Array.isArray(s.changes) && s.changes.length);
  if (!sessions.length) {
    openDialog("Submitted code", `<p class="muted small">No typing record for this submission${meta?.editor === false ? " (it was sent without the code editor)" : ""}.</p><pre class="code-view">${esc(d.code || "")}</pre>`);
    return;
  }
  let si = sessions.length - 1;
  openDialog(`Typing replay${meta ? ` · ${meta.name || ""} · ${meta.title || ""}` : ""}`, `
    ${sessions.length > 1 ? `<div class="tabs" role="tablist" id="rp-tabs">${sessions.map((s, i) => `<button role="tab" data-s="${i}" aria-selected="${i === si}">Visit ${i + 1} · ${fmtDateTime(s.at)}</button>`).join("")}</div>` : ""}
    <div class="replay">
      <div class="replay-bar">
        <button class="btn small" id="rp-play">▶ Play</button>
        <select id="rp-speed" aria-label="Speed"><option value="1">1×</option><option value="4" selected>4×</option><option value="16">16×</option><option value="64">64×</option></select>
        <input type="range" id="rp-pos" min="0" value="0" style="flex:1" aria-label="Position">
        <span class="small mono" id="rp-time"></span>
      </div>
      <div class="timeline" id="rp-line" title="Blue: typing · red: block inserted at once · grey: away from the page"></div>
      <p class="small muted" id="rp-info"></p>
      <pre class="code-view replay-code" id="rp-code"></pre>
    </div>`);
  dlg.classList.add("wide");
  let steps = [], timer = null, pos = 0;
  const build = () => {
    const s = sessions[si];
    let doc = "";
    steps = s.changes.map((c) => {
      const [t, from, removed, text, origin] = c;
      if (origin === "setValue" || origin === "template") doc = String(text ?? "");
      else doc = doc.slice(0, from) + String(text ?? "") + doc.slice(from + (removed || 0));
      return { t, doc, from, len: origin === "setValue" ? 0 : String(text ?? "").length, origin, big: String(text ?? "").length >= 40 && origin !== "setValue" && origin !== "undo" && origin !== "redo" };
    });
    const end = Math.max(1, s.openMs || 0, steps.at(-1)?.t || 0);
    const marks = steps.filter((x) => x.origin !== "setValue").map((x) => `<i class="${x.big ? "big" : ""}" style="left:${(100 * x.t) / end}%"></i>`);
    let blurAt = null;
    const away = [];
    for (const [t, k] of s.focus || []) {
      if (k === "blur" && blurAt == null) blurAt = t;
      if (k === "focus" && blurAt != null) { away.push([blurAt, t]); blurAt = null; }
    }
    if (blurAt != null) away.push([blurAt, end]);
    $("#rp-line", dlg).innerHTML = away.map(([a, b]) => `<b style="left:${(100 * a) / end}%;width:${Math.max(0.4, (100 * (b - a)) / end)}%"></b>`).join("") + marks.join("");
    const big = steps.filter((x) => x.big).length;
    $("#rp-info", dlg).textContent = `${steps.length} edits over ${fmtSec(Math.round(end / 1000))} · ${away.length} time${away.length === 1 ? "" : "s"} away · ${s.pastes || 0} paste attempt${s.pastes === 1 ? "" : "s"}${big ? ` · ${big} big block${big > 1 ? "s" : ""} (red)` : ""} · ${esc(LANG[s.lang] || s.lang || "")}`;
    $("#rp-pos", dlg).max = String(steps.length - 1);
    show(steps.length - 1);
  };
  const show = (i) => {
    pos = Math.max(0, Math.min(steps.length - 1, i));
    const st = steps[pos];
    $("#rp-pos", dlg).value = String(pos);
    $("#rp-time", dlg).textContent = `${fmtSec(Math.round(st.t / 1000))} · ${pos + 1}/${steps.length}`;
    const a = st.from, b = st.from + st.len;
    $("#rp-code", dlg).innerHTML = st.len ? `${esc(st.doc.slice(0, a))}<mark class="${st.big ? "big" : ""}">${esc(st.doc.slice(a, b))}</mark>${esc(st.doc.slice(b))}` : esc(st.doc);
    const m = $("#rp-code mark", dlg);
    if (m && timer) m.scrollIntoView({ block: "nearest" });
  };
  const stop = () => { clearTimeout(timer); timer = null; $("#rp-play", dlg).textContent = "▶ Play"; };
  const tick = () => {
    if (pos >= steps.length - 1) return stop();
    const speed = Number($("#rp-speed", dlg).value);
    const gap = Math.min(1500, Math.max(8, (steps[pos + 1].t - steps[pos].t) / speed));
    timer = setTimeout(() => { show(pos + 1); tick(); }, gap);
  };
  $("#rp-play", dlg).onclick = () => {
    if (timer) return stop();
    if (pos >= steps.length - 1) show(0);
    $("#rp-play", dlg).textContent = "⏸ Pause";
    tick();
  };
  $("#rp-pos", dlg).oninput = (e) => { stop(); show(Number(e.target.value)); };
  $$("#rp-tabs [data-s]", dlg).forEach((b) => b.onclick = () => {
    stop();
    si = Number(b.dataset.s);
    $$("#rp-tabs [data-s]", dlg).forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    build();
  });
  dlg.addEventListener("close", stop, { once: true });
  build();
}

// ============================================================ sessions
// ============================================================ events
const QUIZ_KINDS = ["mcq", "bug", "complexity"];
let eventsTimer = null;
async function viewEvents() {
  clearTimeout(eventsTimer);
  const [d] = await Promise.all([api("/events"), loadDiscord()]);
  const q = d.live;
  const left = q && q.endsAt ? Math.max(0, Math.round(q.endsAt - Date.now() / 1000)) : 0;
  const answered = q ? q.answers.reduce((a, x) => a + x.n, 0) : 0;
  const pct = (b) => Math.min(100, Math.round((100 * b.damage) / Math.max(1, b.hp)));
  view.innerHTML = `
    <div class="page-head"><div><h1>Events</h1><p class="sub">Live quiz in class, boss battles the whole class fights together, bounties for the fastest solver.</p></div>
      <div class="toolbar" style="margin:0"><button class="btn primary" id="ev-quiz">${icon("plus")} Live quiz</button><button class="btn" id="ev-boss">${icon("swords")} Boss battle</button><button class="btn" id="ev-bty">${icon("target")} Bounty</button></div></div>
    <div class="stack">
      ${q ? `<section class="panel live-quiz">
        <div class="panel-head"><h2>🎤 ${esc(q.title)}</h2><span class="status active">${q.current < 0 ? "Ready" : `Question ${q.current + 1}/${q.total}`}</span></div>
        ${q.current < 0 ? `<p class="small">The quiz is ready. Put #arena on the projector, then press <b>Start</b>: each question stays open ${q.seconds} s.</p>`
          : `<p class="small"><b>${esc(q.currentChallenge?.title || "")}</b> · ${q.revealed ? `answer <b>${esc(q.currentChallenge?.answer || "?")}</b> revealed` : left ? `<b id="qz-left">${left}</b> s left` : "time's up"} · ${answered} answer(s)
             ${q.answers.length ? " · " + q.answers.map((a) => `${esc(a.answer)}: ${a.n}`).join(" · ") : ""}</p>`}
        <p class="toolbar">
          ${q.current >= 0 && !q.revealed ? `<button class="btn" id="qz-reveal">Reveal the answer</button>` : ""}
          ${q.current + 1 < q.total ? `<button class="btn primary" id="qz-next">${q.current < 0 ? "Start" : "Next question"}</button>` : ""}
          <button class="btn ${q.current + 1 >= q.total ? "primary" : ""}" id="qz-end">End the quiz</button>
        </p>
        ${q.standings.length ? `<h3 class="small">Leaderboard</h3><ol class="small quiz-board">${q.standings.slice(0, 10).map((s) => `<li><b>${esc(s.name || s.discord_id)}</b> · ${s.score} pts · ${s.right} ✅</li>`).join("")}</ol>` : ""}
      </section>` : ""}
      <section class="panel"><h2>⚔️ Boss battles</h2>
      ${d.bosses.length ? `<div class="stack">${d.bosses.map((b) => `<div class="boss-row">
          <div><b>${esc(b.name)}</b> ${status(b.status === "won" ? "done" : b.status === "lost" ? "expired" : "active", { won: "Defeated", lost: "Escaped", active: "Live" }[b.status])} <span class="muted small">· challenge “${esc(b.challenge_title)}” · ${b.fighters} fighter(s) · ${b.status === "active" ? `ends ${fmtDateTime(b.deadline)}` : fmtDateTime(b.finished_at || b.deadline)}</span></div>
          <div class="hpbar" title="${b.damage}/${b.hp} damage"><span style="width:${pct(b)}%"></span></div>
          <div class="small muted">${Math.max(0, b.hp - b.damage)}/${b.hp} HP left · reward ${b.reward} pts + ${b.coins} 🪙 each ${b.status === "active" ? `<button class="btn small" data-boss-stop="${b.id}">Stop</button>` : ""}</div>
        </div>`).join("")}</div>` : `<p class="empty">No boss yet. A boss is a hard write-code challenge with a big health bar: every student's best submission hits it (up to ${40} damage each, by share of tests passed). Beat it before the deadline and everyone who hit it gets the reward.</p>`}
      </section>
      <section class="panel"><h2>💰 Bounties</h2>
      ${table([
        { label: "Challenge", html: (b) => `<b>${esc(b.challenge_title)}</b>` },
        { label: "Status", html: (b) => status(b.status === "claimed" ? "done" : b.status === "expired" ? "expired" : "active", { claimed: "Claimed", expired: "Closed", open: "Open" }[b.status]) },
        { label: "Reward", html: (b) => `${b.points} pts + ${b.coins} 🪙` },
        { label: "Winner", html: (b) => (b.winner_id ? `<a href="#/student/${esc(b.winner_id)}">${esc(b.winner_name || b.winner_id)}</a>` : "—") },
        { label: "Ends", html: (b) => `<span class="small">${b.deadline ? fmtDateTime(b.deadline) : "no limit"}</span>` },
        { label: "", html: (b) => (b.status === "open" ? `<button class="btn small" data-bty-stop="${b.id}">Close</button>` : "") },
      ], d.bounties, { empty: "No bounty yet. The first student to solve the challenge takes the points and coins." })}
      </section>
      <div class="grid cols-2-even">
        <section class="panel"><h2>🪙 Coin shop</h2><p class="small muted">Students earn coins (daily +5, daily plan +10, quiz podium, bosses, bounties, helping classmates) and spend them with <code>/shop</code>.</p>
          <ul class="small">${d.shop.map((it) => `<li>${it.emoji} <b>${esc({ freeze: "Streak freeze", hint: "Free hint", title: "Custom title (7 days)", color: "Colored role (7 days)" }[it.key])}</b> · ${it.price} 🪙 · bought ${it.n}×</li>`).join("")}</ul></section>
        <section class="panel"><h2>🙋 Peer help</h2><p class="small muted">A stuck student presses <b>Ask a classmate</b>; classmates explain in words (no full solutions), and a 👍 gives the helper ${8} pts + ${5} 🪙 (3 per day max).</p>
          <p class="small">${d.help?.open ?? 0} open request(s) · ${d.help?.answered ?? 0} explanation(s) · ${d.help?.helpful ?? 0} marked helpful</p></section>
      </div>
      ${d.quizzes.filter((x) => x.status === "done").length ? `<section class="panel"><h2>Past quizzes</h2>${table([
        { label: "Quiz", html: (x) => `<b>${esc(x.title)}</b>` },
        { label: "Questions", num: true, html: (x) => `${x.total}` },
        { label: "Date", html: (x) => `<span class="small">${fmtDateTime(x.created_at)}</span>` },
      ], d.quizzes.filter((x) => x.status === "done"), {})}</section>` : ""}
    </div>`;
  const act = async (url, msg) => { try { await api(url, { method: "POST", body: {} }); if (msg) toast(msg); } catch (e) { toast(e.message, true); } viewEvents(); };
  if (q) {
    $("#qz-next") && ($("#qz-next").onclick = (e) => { e.target.disabled = true; act(`/quizzes/${q.id}/next`); });
    $("#qz-reveal") && ($("#qz-reveal").onclick = (e) => { e.target.disabled = true; act(`/quizzes/${q.id}/reveal`); });
    $("#qz-end").onclick = (e) => { e.target.disabled = true; act(`/quizzes/${q.id}/end`, "Quiz over: points and coins given"); };
    const tick = () => { const el = $("#qz-left"); if (!el || location.hash !== "#/events") return; const n = Number(el.textContent) - 1; if (n <= 0) return viewEvents(); el.textContent = n; eventsTimer = setTimeout(tick, 1000); };
    eventsTimer = setTimeout(() => ($("#qz-left") ? tick() : location.hash === "#/events" && !dlg.open && viewEvents()), $("#qz-left") ? 1000 : 4000);
  }
  $$("[data-boss-stop]").forEach((b) => b.onclick = () => confirm("Stop this boss now? It escapes and nobody gets the reward.") && act(`/bosses/${b.dataset.bossStop}/cancel`));
  $$("[data-bty-stop]").forEach((b) => b.onclick = () => act(`/bounties/${b.dataset.btyStop}/cancel`));
  $("#ev-quiz").onclick = () => quizDialog();
  $("#ev-boss").onclick = () => eventDialog("boss");
  $("#ev-bty").onclick = () => eventDialog("bounty");
}

async function quizDialog() {
  await Promise.all([loadDiscord(), loadChallenges()]);
  const st = { t: "Live quiz", s: "20", ch: "", pts: true, picked: [] };
  const save = () => Object.assign(st, { t: $("#qd-t", dlg).value, s: $("#qd-s", dlg).value, ch: $("#qd-ch", dlg).value, pts: $("#qd-pts", dlg).checked });
  const open = () => {
    openDialog("New live quiz", `
      <label for="qd-t">Title</label><input type="text" id="qd-t" style="width:100%" maxlength="80" value="${esc(st.t)}">
      <div class="field-row">
        <div><label for="qd-s">Seconds per question</label><input type="number" id="qd-s" min="10" max="120" value="${esc(st.s)}"></div>
        <div><label for="qd-ch">Post in</label><select id="qd-ch"><option value="">#arena (automatic)</option>${channelOptions(st.ch)}</select></div>
      </div>
      <label class="check"><input type="checkbox" id="qd-pts" ${st.pts ? "checked" : ""}> Give leaderboard points at the end (quiz score ÷ 100) — the podium always gets coins</label>
      <label>Questions <span class="muted">(multiple choice, find the bug, Big-O; up to 30)</span></label>
      <div id="qd-list" class="chips"></div>
      <p class="toolbar" style="margin:6px 0 0"><button type="button" class="btn small" id="qd-add">${icon("plus")} Add a question</button><button type="button" class="btn small" id="qd-rand">Add 5 random</button></p>
      <div class="toolbar" style="margin:6px 0 0"><input type="text" id="qd-topic" placeholder="Topic for the AI (optional), e.g. arrays" style="flex:1"><button type="button" class="btn small" id="qd-ai">✨ Generate a question</button></div>
      <p class="muted small">Answers are locked on the first click; being right gives 500, answering fast up to +500.</p>`,
    [{ label: "Create the quiz", primary: true, action: async () => {
      save();
      if (!st.picked.length) throw new Error("Add at least one question");
      await api("/quizzes", { method: "POST", body: { title: st.t, seconds: Number(st.s), channel_id: st.ch || null, give_points: st.pts, challenge_ids: st.picked.map((c) => c.id) } });
      dlg.close();
      toast("Quiz ready: press Start when the class is watching");
      viewEvents();
    } }]);
    const draw = () => {
      $("#qd-list", dlg).innerHTML = st.picked.length ? st.picked.map((c, i) => `<span class="chip">${i + 1}. ${esc(c.title)}<button type="button" data-rm="${i}" aria-label="Remove">×</button></span>`).join("") : `<span class="muted small">None yet.</span>`;
      $$("[data-rm]", dlg).forEach((b) => b.onclick = () => { st.picked.splice(Number(b.dataset.rm), 1); draw(); });
    };
    $("#qd-add", dlg).onclick = async () => { save(); const c = await pickChallengeDialog("Add a question", { kinds: QUIZ_KINDS }); if (c && !st.picked.some((p) => p.id === c.id) && st.picked.length < 30) st.picked.push(c); open(); };
    $("#qd-ai", dlg).onclick = (e) => busy(e.currentTarget, async () => {
      const btnEl = e.currentTarget;
      btnEl.textContent = "Generating… (up to 1 min)";
      try {
        const r = await api("/ai/challenge", { method: "POST", body: { kind: "mcq", difficulty: "medium", topic: $("#qd-topic", dlg).value } });
        if (st.picked.length < 30) st.picked.push(r.challenge);
        S.challenges = null;
        draw();
        toast(`Added: ${r.challenge.title}`);
      } finally { btnEl.textContent = "✨ Generate a question"; }
    });
    $("#qd-rand", dlg).onclick = () => {
      const pool = (S.challenges || []).filter((c) => c.status === "active" && QUIZ_KINDS.includes(c.kind) && !st.picked.some((p) => p.id === c.id));
      for (let i = 0; i < 5 && pool.length && st.picked.length < 30; i++) st.picked.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
      draw();
    };
    draw();
  };
  open();
}

async function eventDialog(kind) {
  await Promise.all([loadDiscord(), loadChallenges()]);
  const boss = kind === "boss";
  const st = boss ? { name: "The Bug King", hp: "200", hours: "48", reward: "30", coins: "20", ch: "", c: null } : { points: "40", coins: "30", hours: "24", ch: "", c: null };
  const ids = boss ? ["name", "hp", "hours", "reward", "coins", "ch"] : ["points", "coins", "hours", "ch"];
  const save = () => ids.forEach((k) => (st[k] = $(`#ev-${k}`, dlg).value));
  const open = () => {
    openDialog(boss ? "New boss battle" : "New bounty", `
      ${boss ? `<label for="ev-name">Boss name</label><input type="text" id="ev-name" style="width:100%" maxlength="60" value="${esc(st.name)}">` : ""}
      <label>Challenge</label>
      <p class="toolbar" style="margin:0">${st.c ? `<span class="chip">${esc(st.c.title)} ${diffTag(st.c.difficulty)}</span>` : `<span class="muted small">None yet.</span>`}<button type="button" class="btn small" id="ev-pick">${st.c ? "Change" : "Choose"}</button></p>
      <div class="field-row">
        ${boss ? `<div><label for="ev-hp">Health (HP)</label><input type="number" id="ev-hp" min="40" max="5000" value="${esc(st.hp)}"></div>` : ""}
        <div><label for="ev-hours">${boss ? "Hours to beat it" : "Hours open (empty = no limit)"}</label><input type="number" id="ev-hours" min="1" max="720" value="${esc(st.hours)}"></div>
      </div>
      <div class="field-row">
        <div><label for="ev-${boss ? "reward" : "points"}">Points ${boss ? "for each fighter" : "for the winner"}</label><input type="number" id="ev-${boss ? "reward" : "points"}" min="0" max="300" value="${esc(boss ? st.reward : st.points)}"></div>
        <div><label for="ev-coins">Coins ${boss ? "for each fighter" : "for the winner"}</label><input type="number" id="ev-coins" min="0" max="500" value="${esc(st.coins)}"></div>
      </div>
      <label for="ev-ch">Post in</label><select id="ev-ch" style="width:100%"><option value="">#arena (automatic)</option>${channelOptions(st.ch)}</select>
      <p class="muted small">${boss ? `One student deals at most 40 damage, so ${Math.ceil(Number(st.hp) / 40) || 5}+ students must solve it (or get close) to win. Pick a hard write-code challenge.` : "The first correct solution wins. Pick any challenge solved in Discord."}</p>`,
    [{ label: boss ? "Release the boss" : "Post the bounty", primary: true, action: async () => {
      save();
      if (!st.c) throw new Error("Choose a challenge");
      await api(boss ? "/bosses" : "/bounties", { method: "POST", body: { ...st, challenge_id: st.c.id, channel_id: st.ch || null, c: undefined } });
      dlg.close();
      toast(boss ? "The boss is in #arena" : "Bounty posted");
      viewEvents();
    } }]);
    $("#ev-pick", dlg).onclick = async () => { save(); const c = await pickChallengeDialog("Choose a challenge", { kinds: boss ? ["write"] : ["write", "mcq", "output", "bug", "complexity", "sql", "regex"] }); if (c) st.c = c; open(); };
  };
  open();
}

async function viewSessions() {
  const rows = await api("/sessions");
  const live = rows.filter((s) => s.status === "active");
  view.innerHTML = `
    <div class="page-head"><div><h1>Class sessions</h1><p class="sub">A timed set of challenges done in class, in the code editor, with a live results grid.</p></div>
      <div class="toolbar" style="margin:0"><button class="btn primary" id="new">${icon("plus")} New session</button></div></div>
    <div class="stack">
      ${live.length ? `<div class="grid cols-2-even">${live.map((s) => `<a class="panel live-session" href="#/session/${s.id}">
        <span class="status active">Live</span><h2 style="margin:6px 0 2px">${esc(s.title)}</h2>
        <p class="muted small">Ends ${fmtDateTime(s.ends_at)} · ${JSON.parse(s.challenges || "[]").length} challenge(s) · ${s.students} student(s) started · ${s.solved} solved</p></a>`).join("")}</div>` : ""}
      <section class="panel"><h2>All sessions</h2>
      ${table([
        { label: "Session", sort: "title", html: (s) => `<b>${esc(s.title)}</b>` },
        { label: "Status", sort: "status", html: (s) => status(s.status) },
        { label: "Challenges", num: true, html: (s) => `${JSON.parse(s.challenges || "[]").length}` },
        { label: "Students", sort: "students", num: true, html: (s) => `${s.students}` },
        { label: "Solved", sort: "solved", num: true, html: (s) => `${s.solved}` },
        { label: "Started", sort: "starts_at", html: (s) => `<span class="small">${fmtDateTime(s.starts_at)}</span>` },
        { label: "Length", num: true, html: (s) => `${Math.round((s.ends_at - s.starts_at) / 60)} min` },
      ], rows, { onRow: (s) => (location.hash = `#/session/${s.id}`), sort: { key: "starts_at" }, empty: "No session yet. Start one at the beginning of a class: students get a button in #arena." })}
      </section>
      <section class="panel"><h2>How it works</h2><ol class="small steps-list">
        <li>Pick the challenges and how long the session lasts. The bot posts it in #arena (or the channel you choose) and pings the team if you pick one.</li>
        <li>Students press <b>Open the session</b>, pick a challenge and solve it in the code editor (pasting off, leaving the page recorded) — even if the editor is optional in your settings.</li>
        <li>You follow the grid live here. When time is up, answers stop being accepted and unfinished ones close.</li>
        <li>Session points count fully; you can make <b>/practice</b> points count less in Settings → Anti-cheat.</li>
      </ol></section>
    </div>`;
  $("#new").onclick = () => newSessionDialog();
}

async function newSessionDialog() {
  const [teams] = await Promise.all([api("/teams"), loadDiscord(), loadChallenges()]);
  const st = { t: `Class session ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" })}`, m: "60", team: "", ch: "", picked: [], mode: "class" };
  const save = () => Object.assign(st, { t: $("#ss-t", dlg).value, m: $("#ss-m", dlg).value, team: $("#ss-team", dlg).value, ch: $("#ss-ch", dlg).value, mode: $("#ss-mode", dlg).value });
  const open = () => {
    openDialog("New class session", `
      <label for="ss-mode">Kind</label>
      <select id="ss-mode" style="width:100%"><option value="class" ${st.mode === "class" ? "selected" : ""}>Class session: students see their results right away</option><option value="exam" ${st.mode === "exam" ? "selected" : ""}>Exam: no feedback until the end, best submission counts, graded /20</option></select>
      <label for="ss-t">Title</label><input type="text" id="ss-t" style="width:100%" maxlength="80" placeholder="e.g. Loops practice, group B" value="${esc(st.t)}">
      <div class="field-row">
        <div><label for="ss-m">Length (minutes)</label><input type="number" id="ss-m" min="5" max="600" value="${esc(st.m)}"></div>
        <div><label for="ss-team">Who</label><select id="ss-team"><option value="">Everyone</option>${teams.map((t) => `<option value="${t.id}" ${String(t.id) === st.team ? "selected" : ""}>Team ${esc(t.name)}</option>`).join("")}</select></div>
      </div>
      <label for="ss-ch">Post in</label><select id="ss-ch" style="width:100%"><option value="">#arena (automatic)</option>${channelOptions(st.ch)}</select>
      <label>Challenges <span class="muted">(up to 10)</span></label>
      <div id="ss-list" class="chips"></div>
      <p class="toolbar" style="margin:6px 0 0"><button type="button" class="btn small" id="ss-add">${icon("plus")} Add a challenge</button><button type="button" class="btn small" id="ss-rand">Add 3 random write-code</button></p>
      <p class="muted small">Write-code challenges fit best: they're judged by hidden tests and the typing is recorded in the editor.</p>`,
    [{ label: "Start the session", primary: true, action: async () => {
      save();
      if (!st.picked.length) throw new Error("Add at least one challenge");
      const s = await api("/sessions", { method: "POST", body: { title: st.t, minutes: Number(st.m), team_id: st.team || null, channel_id: st.ch || null, challenge_ids: st.picked.map((c) => c.id), mode: st.mode } });
      dlg.close();
      toast("Session started: students got the button in Discord");
      location.hash = `#/session/${s.id}`;
    } }]);
    const draw = () => {
      $("#ss-list", dlg).innerHTML = st.picked.length ? st.picked.map((c, i) => `<span class="chip">${esc(c.title)} ${diffTag(c.difficulty)}<button type="button" data-rm="${i}" aria-label="Remove">×</button></span>`).join("") : `<span class="muted small">None yet.</span>`;
      $$("[data-rm]", dlg).forEach((b) => b.onclick = () => { st.picked.splice(Number(b.dataset.rm), 1); draw(); });
    };
    $("#ss-add", dlg).onclick = async () => {
      save();
      const c = await pickChallengeDialog("Add a challenge");   // reuses the dialog element
      if (c && !st.picked.some((p) => p.id === c.id) && st.picked.length < 10) st.picked.push(c);
      open();
    };
    $("#ss-rand", dlg).onclick = () => {
      const pool = (S.challenges || []).filter((c) => c.status === "active" && c.kind === "write" && !st.picked.some((p) => p.id === c.id));
      for (let i = 0; i < 3 && pool.length && st.picked.length < 10; i++) st.picked.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
      draw();
    };
    draw();
  };
  open();
}

let sessionTimer = null;
async function viewSession(id) {
  clearTimeout(sessionTimer);
  const d = await api(`/sessions/${id}`);
  const s = d.session;
  const live = s.status === "active";
  const left = Math.max(0, s.ends_at - Date.now() / 1000);
  const n = d.students.length;
  const solvedAll = d.students.filter((st) => st.solved === d.challenges.length).length;
  const flagged = d.students.reduce((a, st) => a + st.flags, 0);
  const perCh = d.challenges.map((c) => d.students.filter((st) => st.cells[c.id]?.status === "solved").length);
  const cell = (st, c) => {
    const x = st.cells[c.id];
    if (!x) return `<td class="cell none" title="Not started">·</td>`;
    const ico = { solved: "✅", failed: "❌", expired: "⌛", pending: "✏️" }[x.status] || "•";
    const flag = x.level && x.reviewed !== 1 ? `<span class="cell-flag lvl-${x.level}" title="${x.level === 2 ? "Suspicious" : "Worth a look"}">⚑</span>` : "";
    const tip = `${STATUS[x.status] || x.status}${x.tries ? ` · ${x.tries} submission(s)` : ""}${x.minutes != null ? ` · ${x.minutes} min` : ""}${x.lang ? ` · ${LANG[x.lang] || x.lang}` : ""}`;
    const label = d.exam ? (x.status === "pending" && !x.tries ? "✏️" : `${Math.round((x.score ?? 0) * 100)}%`) : `${ico}${x.status === "solved" ? ` <small>${x.points}</small>` : ""}`;
    return `<td class="cell ${esc(d.exam ? (x.score >= 1 ? "solved" : x.score > 0 ? "pending" : x.status === "pending" ? "pending" : "failed") : x.status)}" title="${esc(tip)}"><button type="button" data-att="${x.attempt}">${label}${flag}</button></td>`;
  };
  view.innerHTML = `
    <div class="page-head"><div><p class="sub"><a href="#/sessions">← Sessions</a></p><h1>${d.exam ? "📝 " : ""}${esc(s.title)} ${status(s.status)}${d.exam ? ' <span class="tag">exam</span>' : ""}</h1>
      <p class="sub">${fmtDateTime(s.starts_at)} → ${fmtDateTime(s.ends_at)}${live ? ` · <b id="ss-left">${Math.ceil(left / 60)} min left</b>` : ""}${s.team_id ? " · one team" : ""}</p></div>
      <div class="toolbar" style="margin:0">${d.exam ? `<a class="btn" href="/api/sessions/${s.id}/grades.csv?g=${encodeURIComponent(S.g)}" download>${icon("download")} Grades (CSV)</a>` : ""}${live ? `<button class="btn danger" id="end">End now</button>` : ""}<button class="btn" id="refresh">Refresh</button></div></div>
    <div class="stack">
      <div class="figures">
        <div class="figure"><b>${n}</b><span>student${n === 1 ? "" : "s"} started</span></div>
        <div class="figure"><b>${solvedAll}</b><span>solved everything</span></div>
        <div class="figure"><b>${d.students.reduce((a, st) => a + st.solved, 0)}</b><span>challenges solved</span></div>
        <div class="figure"><b>${flagged}</b><span>flagged answers</span></div>
      </div>
      <section class="panel"><h2>Results</h2>
        ${n ? `<div class="table-wrap"><table class="grid-table"><thead><tr><th>Student</th>${d.challenges.map((c, i) => `<th class="ctr" title="${esc(c.title)}">${esc(c.title.length > 18 ? c.title.slice(0, 17) + "…" : c.title)}<div class="small muted">${perCh[i]}/${n} ✅</div></th>`).join("")}<th class="num">Solved</th><th class="num">${d.exam ? "Grade /20" : "Points"}</th></tr></thead>
          <tbody>${d.students.map((st) => `<tr><td><a href="#/student/${esc(st.discord_id)}">${avatar(st.name, st.discord_id)} ${esc(st.name || st.discord_id)}</a></td>${d.challenges.map((c) => cell(st, c)).join("")}<td class="num"><b>${st.solved}</b>/${d.challenges.length}</td><td class="num">${d.exam ? `<b>${st.grade ?? "—"}</b>` : st.points}</td></tr>`).join("")}</tbody></table></div>
          <p class="muted small">✅ solved · ❌ out of tries · ✏️ working on it · ⌛ not finished in time · ⚑ warning signs (click a cell to replay the typing)</p>`
        : `<p class="empty">${live ? "Nobody has opened a challenge yet. Students press “Open the session” under the bot's message." : "Nobody took part."}</p>`}
      </section>
      ${d.challenges.length ? `<section class="panel"><h2>Challenges</h2>${hbars(d.challenges.map((c, i) => ({ label: esc(c.title), right: `${perCh[i]}/${n}`, parts: [{ name: "Solved", value: perCh[i], color: "var(--up)" }] })), { max: Math.max(1, n) })}</section>` : ""}
    </div>`;
  $$("[data-att]").forEach((b) => b.onclick = () => {
    const st = d.students.find((x) => Object.values(x.cells).some((c) => String(c.attempt) === b.dataset.att));
    const ch = d.challenges.find((c) => st && String(st.cells[c.id]?.attempt) === b.dataset.att);
    replayDialog(Number(b.dataset.att), { name: st?.name, title: ch?.title });
  });
  $("#refresh").onclick = () => viewSession(id);
  if ($("#end")) $("#end").onclick = () => confirmDialog("End the session now?", "Answers stop being accepted and unfinished challenges close.", "End now", async () => {
    await api(`/sessions/${id}/end`, { method: "POST" });
    toast("Session ended");
    viewSession(id);
  }, true);
  if (live) sessionTimer = setTimeout(() => { if (location.hash === `#/session/${id}` && !dlg.open) viewSession(id); else if (location.hash === `#/session/${id}`) sessionTimer = setTimeout(() => viewSession(id), 20000); }, 20000);
}

// ============================================================ skills
async function viewSkills() {
  const [d] = await Promise.all([api("/skills/class"), loadSkillDefs()]);
  const sortBy = sessionStorage.getItem("classbot.skSort") || "";
  const rows = [...d.students];
  if (sortBy) rows.sort((a, b) => (a.skills[sortBy]?.mastery ?? 101) - (b.skills[sortBy]?.mastery ?? 101));
  let showAll = false;
  try { showAll = sessionStorage.getItem("classbot.skAll") === "1"; } catch { /* storage blocked */ }
  const cols = showAll || !d.track?.length ? d.skills : d.track;
  const weak = Object.entries(d.average).filter(([k, v]) => v != null && cols.includes(k)).sort((a, b) => a[1] - b[1]).slice(0, 3);
  view.innerHTML = `
    <div class="page-head"><div><h1>Skills</h1><p class="sub">How well each student masters each skill (last 4 months): 80% from the code they write, 20% from the other types. Click a skill to sort, or to send a practice set.</p></div>
      ${d.track?.length && d.track.length < d.skills.length ? `<label class="check" style="margin:0"><input type="checkbox" id="sk-all" ${showAll ? "checked" : ""}><span>Show skills outside this class's track (${d.skills.length - d.track.length})</span></label>` : ""}</div>
    <div class="stack">
      ${weak.length ? `<div class="figures">${weak.map(([k, v]) => `<button class="figure clickable" data-pset="${k}" title="Send a practice set"><b style="color:${masteryInk(v)}">${v}%</b><span>${esc(skillLabel(k))} · class average</span></button>`).join("")}
        <div class="figure"><b>${d.students.length}</b><span>students with results</span></div></div>` : ""}
      <section class="panel">
        ${d.students.length ? `<div class="table-wrap heat"><table><thead><tr><th>Student</th>${cols.map((k) => `<th class="ctr heat-col ${sortBy === k ? "sorted" : ""}" data-sort="${k}" title="${esc(skillLabel(k))}: sort / practice set"><span>${esc(skillLabel(k))}</span></th>`).join("")}</tr>
          <tr class="avg"><td class="muted small">Class average</td>${cols.map((k) => `<td class="ctr"><b style="color:${masteryInk(d.average[k])}">${d.average[k] ?? "—"}${d.average[k] != null ? "%" : ""}</b></td>`).join("")}</tr></thead>
          <tbody>${rows.map((st) => `<tr><td><a href="#/student/${esc(st.discord_id)}">${avatar(st.name, st.discord_id)} ${esc(st.name || st.discord_id)}</a></td>${cols.map((k) => {
            const v = st.skills[k];
            const tip = v ? `${v.mastery}%${v.code != null ? ` · code ${v.code}%` : v.proven === false ? " · not shown in code yet" : ""}${v.codeMistakes ? ` · ${v.codeMistakes} mistake(s) in their code` : ""}` : "not tried";
            return `<td class="heat-cell ${v && v.proven === false ? "unproven" : ""}" style="background:${v && v.evidence >= 2 ? masteryColor(v.mastery) : "transparent"}" title="${esc(skillLabel(k))}: ${esc(tip)}">${v && v.evidence >= 2 ? `<b style="color:${masteryInk(v.mastery)}">${v.mastery}</b>` : `<span class="muted">${v ? "·" : ""}</span>`}</td>`;
          }).join("")}</tr>`).join("")}</tbody></table></div>
          <p class="muted small">🟩 65%+ solid (reliable at medium or hard) · 🟨 35–64% getting there · 🟥 under 35% needs work · empty = not enough tries yet · <i>italic</i> = not shown in code yet (max 20%). Easy challenges alone go up to 50%: harder ones are needed to reach the top.</p>`
        : `<p class="empty">No results yet. The map fills in as students solve challenges.</p>`}
      </section>
    </div>`;
  $$("[data-sort]").forEach((th) => th.onclick = () => {
    const k = th.dataset.sort;
    openDialog(skillLabel(k), `<p>Class average: <b>${d.average[k] ?? "—"}%</b></p>`, [
      { label: "Sort by this skill", action: async () => { sessionStorage.setItem("classbot.skSort", k); dlg.close(); viewSkills(); } },
      { label: "✨ Generate challenges", action: async () => genForSkillDialog(k, (d.average[k] ?? 50) < 35 ? "easy" : "medium") },
      { label: "Send a practice set", primary: true, action: async () => practiceSetDialog(k, d) },
    ]);
  });
  $$("[data-pset]").forEach((b) => b.onclick = () => practiceSetDialog(b.dataset.pset, d));
  const all = $("#sk-all");
  if (all) all.onchange = () => { try { sessionStorage.setItem("classbot.skAll", all.checked ? "1" : "0"); } catch { /* ignore */ } viewSkills(); };
}

function practiceSetDialog(skill, d) {
  const list = [...d.students].sort((a, b) => (a.skills[skill]?.mastery ?? 0) - (b.skills[skill]?.mastery ?? 0));
  openDialog(`Practice set · ${skillLabel(skill)}`, `
    <p class="muted small">Each student gets their own challenges on this skill, at <b>their</b> level (one step above what they reliably solve), as assignments with a DM.</p>
    <div class="field-row">
      <div><label for="ps-n">Challenges each</label><input type="number" id="ps-n" min="1" max="5" value="3"></div>
      <div><label for="ps-due">Due</label><select id="ps-due"><option value="">No due date</option><option value="2">In 2 days</option><option value="7" selected>In a week</option><option value="14">In 2 weeks</option></select></div>
      <div><label for="ps-th">Select students under</label><select id="ps-th"><option value="35">35%</option><option value="50" selected>50%</option><option value="65">65%</option><option value="101">everyone</option></select></div>
    </div>
    <label for="ps-note">Note <span class="muted">(optional)</span></label><input type="text" id="ps-note" style="width:100%" maxlength="300" placeholder="e.g. We'll correct these on Thursday">
    <div class="pick-students" id="ps-list"></div>`,
  [{ label: "Send", primary: true, action: async () => {
    const students = $$("#ps-list input:checked", dlg).map((i) => i.value);
    if (!students.length) throw new Error("Pick at least one student");
    const days = Number($("#ps-due", dlg).value);
    const r = await api("/skills/practice-set", { method: "POST", body: { skill, students, count: Number($("#ps-n", dlg).value), due_at: days ? Math.floor(Date.now() / 1000) + days * 86400 : null, note: $("#ps-note", dlg).value } });
    dlg.close();
    toast(`${r.assignments} challenge(s) sent to ${r.students} student(s)${r.empty.length ? ` · ${r.empty.length} had nothing new left` : ""}`);
  } }]);
  const draw = () => {
    const th = Number($("#ps-th", dlg).value);
    $("#ps-list", dlg).innerHTML = list.map((st) => {
      const v = st.skills[skill];
      const m = v && v.evidence >= 2 ? v.mastery : null;
      return `<label class="check"><input type="checkbox" value="${esc(st.discord_id)}" ${m == null || m < th ? "checked" : ""}> ${esc(st.name || st.discord_id)} <span class="muted small" style="color:${masteryInk(m)}">${m == null ? "not tried" : m + "%"}</span></label>`;
    }).join("");
  };
  $("#ps-th", dlg).onchange = draw;
  draw();
}
