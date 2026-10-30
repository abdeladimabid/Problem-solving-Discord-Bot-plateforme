"use strict";
// Chat with your class: talk freely about the students; ClassBot reads the class's data and answers. The conversation
// is kept in this browser (per class); a table in an answer can be downloaded as an Excel file.
/* global $, api, esc, toast, view, routes, S, XL, saveBlob */

// until the class's own suggestions arrive (or if they can't): questions that fit any class
const CHAT_EXAMPLES = ["Comment va la classe cette semaine ?", "Qui est à surveiller en ce moment, et pourquoi ?", "Mets les apprenants à surveiller dans un Excel"];
// the questions this teacher asks most in this class: the ones asked again come first among the suggestions
const askedKey = () => `classbot.chat.asked.${S.g}`;
const askedLoad = () => { try { const v = JSON.parse(localStorage.getItem(askedKey()) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
function askedNote(q) {
  const k = q.trim().replace(/\s+/g, " ");
  if (k.length < 8 || k.length > 160) return;
  const v = askedLoad();
  v[k] = (v[k] || 0) + 1;
  const top = Object.entries(v).sort((a, b) => b[1] - a[1]).slice(0, 60);
  try { localStorage.setItem(askedKey(), JSON.stringify(Object.fromEntries(top))); } catch { /* private window */ }
}
const askedTop = (n) => Object.entries(askedLoad()).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
const chatKey = () => `classbot.chat.${S.g}`;
const chatLoad = () => { try { const v = JSON.parse(localStorage.getItem(chatKey()) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const chatSave = (list) => { try { localStorage.setItem(chatKey(), JSON.stringify(list.slice(-40))); } catch { /* private window: this visit only */ } };

/** The answer's text: escaped, then **bold**, *italic*, lists and line breaks (nothing else from the AI reaches the page). */
function chatText(t) {
  const lines = esc(String(t || "")).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, "$1<i>$2</i>").split("\n");
  let html = "", list = false;
  for (const l of lines) {
    const li = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) { if (!list) { html += "<ul>"; list = true; } html += `<li>${li[1]}</li>`; continue; }
    if (list) { html += "</ul>"; list = false; }
    html += l.trim() ? `<p>${l}</p>` : "";
  }
  return html + (list ? "</ul>" : "");
}
function chatTable(t, i) {
  return `<div class="chat-table"><div class="chat-table-h"><b>${esc(t.title || "")}</b><button class="chat-xl" data-xl="${i}">${CHAT_DL} Télécharger Excel</button></div>
    <div class="table-wrap"><table><thead><tr>${t.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${chatCell(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
}
/** The chat's answer, read as it comes: each step (what ClassBot reads, then writing) given to onStep. */
async function chatAsk(body, onStep, path = "/chat") {
  const res = await fetch(`/api${path}?g=${encodeURIComponent(S.g)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ g: S.g, stream: true, ...body }) });
  if (res.status === 401) { location.href = "/login"; throw new Error("Please sign in again."); }
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    buf += dec.decode(value || new Uint8Array(), { stream: !done });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!l) continue;
      const m = JSON.parse(l);
      if (m.done) return m.done;
      if (m.error) throw new Error(m.error);
      onStep(m);
    }
    if (done) throw new Error("The chat stopped before answering. Try again.");
  }
}

const chatIcon = (d, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const CHAT_UP = chatIcon('<path d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"/>');
const CHAT_DOWN = chatIcon('<path d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76 1.04m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5"/>');
const CHAT_COPY = chatIcon('<path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>');
const CHAT_EYE = chatIcon('<path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>');
const CHAT_SHIELD = chatIcon('<path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>');
const CHAT_PLUS = chatIcon('<path d="M12 4v16m8-8H4"/>');
const CHAT_DL = chatIcon('<path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>');
const chatTime = (at) => { if (!at) return ""; const d = new Date(at); return d.toDateString() === new Date().toDateString() ? `Aujourd'hui à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }); };
/** A level in a table cell, as a coloured badge. */
const chatCell = (c) => (/^(excellent|bon|moyen|faible|critique)$/i.test(String(c)) ? `<span class="chat-lv ${String(c).toLowerCase()}">${esc(c)}</span>` : esc(c));
/** "Is the chat reliable?": ClassBot asks questions it knows the answer to, and shows each result as it comes. */
function chatCheckDialog() {
  const d = openDialog("Tester la fiabilité du chat", `<p class="sub">ClassBot pose au chat environ 8 questions dont il calcule lui-même la bonne réponse (nombre d'apprenants, niveaux, points…), avec ta première clé IA. Ça prend 1 à 2 minutes et utilise une trentaine d'appels IA.</p><div id="chk-out"></div>`,
    [{ label: "Lancer le test", primary: true, action: async () => {
      const out = $("#chk-out", d), rows = [];
      const draw = (head) => { out.innerHTML = `<p class="chat-chk-head">${head}</p>${rows.map((it) => `<div class="chat-chk ${it.ok ? "ok" : "ko"}"><b>${it.ok ? "✓" : "✗"} ${esc(it.question)}</b>
        <span>Attendu : ${esc(it.expected)}</span>${it.ok ? "" : `<span>Réponse : ${esc(it.got)}</span>`}</div>`).join("")}`; };
      draw("<span class=\"chat-dots\"><i></i><i></i><i></i></span> Question 1…");
      try {
        const r = await chatAsk({}, (m) => { rows.push(m.item); draw(`<span class="chat-dots"><i></i><i></i><i></i></span> Question ${m.i + 2} sur ${m.total}…`); }, "/chat/check");
        draw(`<b>${r.score} / ${r.total} justes</b> ${r.score === r.total ? "· le chat est fiable avec cette clé." : "· regarde les réponses fausses ; essaie une autre IA en premier dans Réglages → Clés IA."}`);
      } catch (e) { draw(`<span class="chat-err">${esc(e.message)}</span>`); }
    } }]);
  return d;
}

/** Under an answer: what ClassBot read for it, and 👍 / 👎. */
function chatFoot(m, i) {
  const src = `<span class="chat-src" title="Les données lues par ClassBot pour cette réponse">${CHAT_EYE}<span>${(m.sources || []).length ? `Lu : ${m.sources.map(esc).join(" · ")}` : "Aucune donnée lue"}</span></span>`;
  const btn = (v, icon, label) => `<button type="button" class="chat-vote ${v > 0 ? "up" : "down"}${m.vote === v ? " on" : ""}" data-vote="${v}" data-i="${i}" aria-label="${label}" title="${label}"${m.vote ? " disabled" : ""}>${icon}</button>`;
  const warn = (m.unverified || []).length ? `<p class="chat-warn" title="Ces chiffres ne sont pas dans les données lues par ClassBot : vérifie-les avant de t'en servir">⚠ Chiffres non vérifiés : ${m.unverified.map(esc).join(", ")}</p>` : "";
  return `${warn}<div class="chat-foot">${src}<span class="chat-votes"><button type="button" class="chat-vote" data-copy="${i}" aria-label="Copier la réponse" title="Copier la réponse">${CHAT_COPY}</button>${btn(1, CHAT_UP, "Bonne réponse")}${btn(-1, CHAT_DOWN, "Réponse fausse")}</span></div>`;
}

async function viewChat() {
  let list = chatLoad(), busy = false, status = "";
  const cls = S.guilds.find((x) => x.id === S.g)?.name || "ta classe";
  view.innerHTML = `
    <div class="chat-head"><div><h1>Chat avec ta classe</h1><p class="sub">${esc(cls)} · ClassBot lit les données de la classe et répond</p></div>
      <div class="chat-actions"><button type="button" class="chat-pill" id="chat-check" title="Des questions dont ClassBot connaît la bonne réponse, posées au chat : pour voir s'il est fiable avec ta clé IA">${CHAT_SHIELD} Tester la fiabilité</button>
      <button type="button" class="chat-pill" id="chat-new">${CHAT_PLUS} Nouvelle conversation</button></div></div>
    <section class="chat"><div class="chat-thread" id="chat-thread"></div>
      <div class="chat-bottom">
        <div class="chat-sugg" id="chat-sugg"></div>
        <form class="chat-form" id="chat-form"><textarea id="chat-q" rows="1" placeholder="Pose une question sur tes apprenants, les briefs, les niveaux…" aria-label="Ta question"></textarea>
          <button class="chat-send" id="chat-send" type="submit" aria-label="Envoyer" title="Envoyer (Entrée)">${chatIcon('<path d="M12 19V5m0 0l-7 7m7-7l7 7"/>', 20)}</button></form>
      </div></section>`;
  const thread = $("#chat-thread"), q = $("#chat-q");
  const avatar = `<div class="chat-avatar" aria-hidden="true">C</div>`;
  const me = `<div class="chat-avatar me" aria-hidden="true">${esc(((S.me?.email || "Toi").match(/[a-z]/i) || ["T"])[0].toUpperCase())}</div>`;
  const draw = () => {
    $("#chat-send").disabled = busy;
    thread.innerHTML = list.length ? list.map((m, i) => m.role === "user"
      ? `<div class="chat-msg me"><div class="chat-bubble"><p class="chat-who">Toi</p>${esc(m.text)}</div>${me}</div>`
      : `<div class="chat-msg bot">${avatar}<div class="chat-bubble"><div class="chat-card-h"><span>ClassBot</span><time>${esc(chatTime(m.at))}</time></div>${m.error ? `<p class="chat-err">${esc(m.text)}</p>` : chatText(m.text)}${m.table ? chatTable(m.table, i) : ""}${m.error || !Array.isArray(m.sources) ? "" : chatFoot(m, i)}</div></div>`).join("")
      + (busy ? `<div class="chat-msg bot">${avatar}<div class="chat-bubble chat-wait"><span class="chat-dots"><i></i><i></i><i></i></span><span id="chat-status">${esc(status || "Je réfléchis…")}</span></div></div>` : "")
      : `<div class="chat-empty"><div class="chat-hero" aria-hidden="true">C</div><h2>Que veux-tu savoir sur ta classe ?</h2><p>Pose ta question comme à un collègue, ou choisis une suggestion en bas.</p></div>`;
    thread.querySelectorAll("[data-copy]").forEach((b) => b.onclick = () => {
      const m = list[Number(b.dataset.copy)];
      const text = m.text + (m.table ? "\n\n" + [m.table.columns, ...m.table.rows].map((r) => r.join("\t")).join("\n") : "");
      navigator.clipboard?.writeText(text).then(() => toast("Réponse copiée"), () => toast("Copie impossible : sélectionne le texte", true));
    });
    thread.querySelectorAll("[data-xl]").forEach((b) => b.onclick = () => {
      const t = list[Number(b.dataset.xl)].table;
      saveBlob(XL.writeXlsx([{ name: (t.title || "ClassBot").slice(0, 30), rows: [t.columns, ...t.rows], widths: t.columns.map(() => 22) }]), `${(t.title || "classbot").replace(/[^\w\- ]+/g, "").trim() || "classbot"}.xlsx`);
    });
    // 👍 / 👎: kept by ClassBot (with the question) to see where the chat goes wrong
    thread.querySelectorAll("[data-vote]").forEach((b) => b.onclick = async () => {
      const i = Number(b.dataset.i), m = list[i], vote = Number(b.dataset.vote);
      if (m.vote) return;
      const question = [...list.slice(0, i)].reverse().find((x) => x.role === "user")?.text || "";
      try {
        await api("/chat/feedback", { method: "POST", body: { vote, question, answer: m.text, sources: m.sources || [] } });
        m.vote = vote; chatSave(list); draw();
        toast(vote > 0 ? "Merci !" : "Merci, c'est noté : ça aidera à corriger le chat.");
      } catch (e) { toast(e.message, true); }
    });
    thread.scrollTop = thread.scrollHeight;
  };
  const send = async () => {
    const text = q.value.trim();
    if (!text || busy) return;
    const history = list.filter((m) => !m.error).slice(-8).map((m) => ({ role: m.role, text: m.text }));
    list.push({ role: "user", text });
    askedNote(text);
    q.value = ""; grow(); busy = true; draw();
    try {
      const r = await chatAsk({ question: text, history }, (st) => {
        status = st.step === "read" ? `Je lis ${st.sources.join(", ") || "les données"}…` : "J'écris la réponse…";
        const el = $("#chat-status"); if (el) el.textContent = status;
      });
      list.push({ role: "assistant", text: r.answer, table: r.table || null, sources: r.sources || [], unverified: r.unverified || [], at: Date.now() });
    } catch (e) { list.push({ role: "assistant", text: e.message, error: true, at: Date.now() }); }
    busy = false; status = ""; chatSave(list); draw();
  };
  // the suggestions stay under the thread; the box grows with the question
  const grow = () => { q.style.height = "auto"; q.style.height = `${Math.min(q.scrollHeight, 160)}px`; };
  q.oninput = grow;
  // the suggestions: this teacher's frequent questions first, then the class's own (a new draw at each visit)
  const sugg = (list2) => {
    const all = [...new Set([...askedTop(2), ...list2])].slice(0, 7);
    $("#chat-sugg").innerHTML = `<span>Suggestions :</span>${all.map((x) => `<button type="button" data-ex="${esc(x)}">${esc(x)}</button>`).join("")}`;
    $("#chat-sugg").querySelectorAll("[data-ex]").forEach((b) => b.onclick = () => { q.value = b.dataset.ex; grow(); q.focus(); });
  };
  sugg(CHAT_EXAMPLES);
  api("/chat/suggestions").then((r) => { if (Array.isArray(r.suggestions) && r.suggestions.length) sugg(r.suggestions); }).catch(() => {});
  $("#chat-form").onsubmit = (e) => { e.preventDefault(); send(); };
  q.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  $("#chat-check").onclick = () => chatCheckDialog();
  $("#chat-new").onclick = () => { list = []; chatSave(list); draw(); q.focus(); };
  draw();
  q.focus();
}

Object.assign(routes, { chat: viewChat });
