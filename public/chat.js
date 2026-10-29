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
/** Under an answer: what ClassBot read for it, and 👍 / 👎. */
function chatFoot(m, i) {
  const src = (m.sources || []).length ? `<span class="chat-src" title="Les données lues par ClassBot pour cette réponse">Lu : ${m.sources.map(esc).join(" · ")}</span>`
    : `<span class="chat-src">Aucune donnée lue</span>`;
  const btn = (v, icon, label) => `<button type="button" class="chat-vote${m.vote === v ? " on" : ""}" data-vote="${v}" data-i="${i}" aria-label="${label}" title="${label}"${m.vote ? " disabled" : ""}>${icon}</button>`;
  return `<div class="chat-foot">${src}<span class="chat-votes">${btn(1, "👍", "Bonne réponse")}${btn(-1, "👎", "Réponse fausse")}</span></div>`;
}

async function viewChat() {
  let list = chatLoad(), busy = false;
  view.innerHTML = `
    <div class="page-head"><div><h1>Chat avec ta classe</h1><p class="sub">Pose tes questions sur tes apprenants, comme à un collègue : ClassBot lit les données de la classe et répond. Les noms ne sont jamais envoyés à l'IA.</p></div>
      <button class="btn" id="chat-new">Nouvelle conversation</button></div>
    <section class="panel chat"><div class="chat-thread" id="chat-thread"></div>
      <form class="chat-form" id="chat-form"><textarea id="chat-q" rows="2" placeholder="Ta question… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)" aria-label="Ta question"></textarea>
        <button class="chat-send" id="chat-send" type="submit" aria-label="Envoyer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></form></section>`;
  const thread = $("#chat-thread"), q = $("#chat-q");
  const avatar = `<div class="chat-avatar" aria-hidden="true">C</div>`;
  const draw = () => {
    $("#chat-send").disabled = busy;
    thread.innerHTML = list.length ? list.map((m, i) => m.role === "user"
      ? `<div class="chat-msg me"><div class="chat-bubble">${esc(m.text)}</div></div>`
      : `<div class="chat-msg bot">${avatar}<div class="chat-bubble">${m.error ? `<p class="chat-err">${esc(m.text)}</p>` : chatText(m.text)}${m.table ? chatTable(m.table, i) : ""}${m.error ? "" : chatFoot(m, i)}</div></div>`).join("")
      + (busy ? `<div class="chat-msg bot">${avatar}<div class="chat-bubble chat-wait"><span class="chat-dots"><i></i><i></i><i></i></span>ClassBot lit les données de la classe…</div></div>` : "")
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
      const r = await api("/chat", { method: "POST", body: { question: text, history } });
      list.push({ role: "assistant", text: r.answer, table: r.table || null, sources: r.sources || [] });
    } catch (e) { list.push({ role: "assistant", text: e.message, error: true }); }
    busy = false; chatSave(list); draw();
  };
  $("#chat-form").onsubmit = (e) => { e.preventDefault(); send(); };
  q.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  $("#chat-new").onclick = () => { list = []; chatSave(list); draw(); q.focus(); };
  draw();
  q.focus();
}

Object.assign(routes, { chat: viewChat });
