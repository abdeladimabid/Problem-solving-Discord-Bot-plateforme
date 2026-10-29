"use strict";
// Chat with your class: talk freely about the students; ClassBot reads the class's data and answers. The conversation
// is kept in this browser (per class); a table in an answer can be downloaded as an Excel file.
/* global $, api, esc, toast, view, routes, S, XL, saveBlob */

const CHAT_EXAMPLES = ["Comment va la classe cette semaine ?", "Combien de faibles, et qui ?", "Que fait Amine en ce moment ?",
  "Toutes les statistiques d'Amine cette année", "Écris un bilan de l'année d'Amine pour l'administration", "Mets tous les faibles dans un Excel"];
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
  return `<div class="chat-table"><div class="chat-table-h"><b>${esc(t.title || "")}</b><button class="btn small chat-xl" data-xl="${i}">Télécharger Excel</button></div>
    <div class="table-wrap"><table><thead><tr>${t.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
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

const CHAT_UP = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>`;
const CHAT_DOWN = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>`;
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
  const src = (m.sources || []).length ? `<span class="chat-src" title="Les données lues par ClassBot pour cette réponse">Lu : ${m.sources.map(esc).join(" · ")}</span>`
    : `<span class="chat-src">Aucune donnée lue</span>`;
  const btn = (v, icon, label) => `<button type="button" class="chat-vote ${v > 0 ? "up" : "down"}${m.vote === v ? " on" : ""}" data-vote="${v}" data-i="${i}" aria-label="${label}" title="${label}"${m.vote ? " disabled" : ""}>${icon}</button>`;
  return `<div class="chat-foot">${src}<span class="chat-votes">${btn(1, CHAT_UP, "Bonne réponse")}${btn(-1, CHAT_DOWN, "Réponse fausse")}</span></div>`;
}

async function viewChat() {
  let list = chatLoad(), busy = false, status = "";
  view.innerHTML = `
    <div class="page-head"><div><h1>Chat avec ta classe</h1><p class="sub">Pose tes questions sur tes apprenants, comme à un collègue : ClassBot lit les données de la classe et répond. Les noms ne sont jamais envoyés à l'IA.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="chat-check" title="Des questions dont ClassBot connaît la bonne réponse, posées au chat : pour voir s'il est fiable avec ta clé IA">Tester la fiabilité</button>
      <button class="btn" id="chat-new">Nouvelle conversation</button></div></div>
    <section class="panel chat"><div class="chat-thread" id="chat-thread"></div>
      <form class="chat-form" id="chat-form"><textarea id="chat-q" rows="2" placeholder="Ta question… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)" aria-label="Ta question"></textarea>
        <button class="chat-send" id="chat-send" type="submit" aria-label="Envoyer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></form></section>`;
  const thread = $("#chat-thread"), q = $("#chat-q");
  const avatar = `<div class="chat-avatar" aria-hidden="true">C</div>`;
  const draw = () => {
    $("#chat-send").disabled = busy;
    thread.innerHTML = list.length ? list.map((m, i) => m.role === "user"
      ? `<div class="chat-msg me"><div class="chat-bubble">${esc(m.text)}</div></div>`
      : `<div class="chat-msg bot">${avatar}<div class="chat-bubble">${m.error ? `<p class="chat-err">${esc(m.text)}</p>` : chatText(m.text)}${m.table ? chatTable(m.table, i) : ""}${m.error || !Array.isArray(m.sources) ? "" : chatFoot(m, i)}</div></div>`).join("")
      + (busy ? `<div class="chat-msg bot">${avatar}<div class="chat-bubble chat-wait"><span class="chat-dots"><i></i><i></i><i></i></span><span id="chat-status">${esc(status || "Je réfléchis…")}</span></div></div>` : "")
      : `<div class="chat-empty"><div class="chat-hero" aria-hidden="true">✦</div><h2>Que veux-tu savoir sur ta classe ?</h2><p>Par exemple :</p><div class="chat-ex">${CHAT_EXAMPLES.map((x) => `<button type="button" data-ex="${esc(x)}">${esc(x)}</button>`).join("")}</div></div>`;
    thread.querySelectorAll("[data-ex]").forEach((b) => b.onclick = () => { q.value = b.dataset.ex; q.focus(); });
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
    q.value = ""; busy = true; draw();
    try {
      const r = await chatAsk({ question: text, history }, (st) => {
        status = st.step === "read" ? `Je lis ${st.sources.join(", ") || "les données"}…` : "J'écris la réponse…";
        const el = $("#chat-status"); if (el) el.textContent = status;
      });
      list.push({ role: "assistant", text: r.answer, table: r.table || null, sources: r.sources || [] });
    } catch (e) { list.push({ role: "assistant", text: e.message, error: true }); }
    busy = false; status = ""; chatSave(list); draw();
  };
  $("#chat-form").onsubmit = (e) => { e.preventDefault(); send(); };
  q.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  $("#chat-check").onclick = () => chatCheckDialog();
  $("#chat-new").onclick = () => { list = []; chatSave(list); draw(); q.focus(); };
  draw();
  q.focus();
}

Object.assign(routes, { chat: viewChat });
