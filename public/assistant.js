"use strict";
// 💬 The assistant: the chat with the class in a bubble at the bottom right, on every page. It answers about the
// students (from the class's data) and about ClassBot itself (where a page is, how to set something up), with links.
/* global $, S, routes, viewChat, chatCheckDialog, chatIcon, CHAT_SHIELD, CHAT_PLUS */

const AS_KEY = "classbot.assistant.open";
let asState = { g: null, open: false };

function asMount() {
  if ($("#as-fab")) return;
  const fab = document.createElement("button");
  fab.id = "as-fab"; fab.type = "button"; fab.className = "as-fab";
  fab.setAttribute("aria-label", "Assistant ClassBot"); fab.title = "Assistant ClassBot : ta classe, et comment marche l'app";
  fab.innerHTML = `<span class="as-ico-open">${chatIcon('<path d="M8 10h8M8 14h5"/><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12z"/>', 26)}</span><span class="as-ico-close">${chatIcon('<path d="M6 6l12 12M18 6L6 18"/>', 24)}</span>`;
  const panel = document.createElement("section");
  panel.id = "as-panel"; panel.className = "as-panel"; panel.hidden = true;
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Assistant ClassBot");
  panel.innerHTML = `<header class="as-head"><div class="as-id"><span class="as-av" aria-hidden="true">C</span><span><b>Assistant ClassBot</b><small id="as-cls"></small></span></div>
    <div class="as-btns"><button type="button" class="as-b" id="chat-check" title="Tester la fiabilité du chat">${CHAT_SHIELD}</button>
    <button type="button" class="as-b" id="chat-new" title="Nouvelle conversation">${CHAT_PLUS}</button>
    <button type="button" class="as-b" id="as-close" title="Fermer (Échap)" aria-label="Fermer">${chatIcon('<path d="M6 6l12 12M18 6L6 18"/>', 16)}</button></div></header>
    <div class="as-body" id="as-body"></div>`;
  document.body.append(panel, fab);
  fab.onclick = () => (asState.open ? asClose() : asOpen());
  $("#as-close").onclick = () => asClose();
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && asState.open && !document.querySelector("dialog[open]")) asClose(); });
  // a link of an answer to a page: the page opens; on a phone the bubble closes to show it
  panel.addEventListener("click", (e) => { if (e.target.closest("a.chat-in") && innerWidth < 700) asClose(); });
  // the sidebar's "Chat with your class" opens the bubble, without leaving the page
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href="#/chat"]');
    if (!a || panel.contains(a)) return;
    e.preventDefault(); asOpen();
  }, true);
  // another class: its own conversation
  $("#guild")?.addEventListener("change", () => setTimeout(() => { if (asState.open) asLoad(); else asState.g = null; }, 0));
  let was = false;
  try { was = localStorage.getItem(AS_KEY) === "1"; } catch { /* storage blocked */ }
  if (was && innerWidth >= 700) asOpen();
}
function asLoad() {
  asState.g = S.g;
  $("#as-cls").textContent = S.guilds?.find((x) => x.id === S.g)?.name || "";
  viewChat($("#as-body"), true);
}
function asOpen() {
  asMount();
  asState.open = true;
  $("#as-panel").hidden = false;
  $("#as-fab").classList.add("on");
  try { localStorage.setItem(AS_KEY, "1"); } catch { /* ignore */ }
  if (asState.g !== S.g) asLoad(); else $("#chat-q")?.focus();
}
function asClose() {
  asState.open = false;
  $("#as-panel").hidden = true;
  $("#as-fab").classList.remove("on");
  try { localStorage.setItem(AS_KEY, "0"); } catch { /* ignore */ }
}
// #/chat (an old link, a bookmark): the bubble opens over the home page
Object.assign(routes, { chat: () => { asOpen(); location.replace("#/overview"); } });
// shown once a class is open (not on the "no class yet" page)
(function asWait(n = 0) { if (S.g) asMount(); else if (n < 100) setTimeout(() => asWait(n + 1), 200); })();
