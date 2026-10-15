"use strict";
// Light / dark theme and the FR / EN switch at the bottom of the side menu (both remembered in this browser).
// French comes from the static dictionary in i18n-fr.js: nothing on the page is sent anywhere to be translated.
(function prefs() {
  const root = document.documentElement;
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* this visit only */ } },
  };
  const who = document.querySelector(".board .who");

  // ---- theme ----
  const MOON = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`;
  const SUN = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
  const themeBtn = document.getElementById("theme");
  const isDark = () => root.dataset.theme === "dark";
  const paintTheme = () => {
    if (!themeBtn) return;
    themeBtn.innerHTML = isDark() ? SUN : MOON;
    const label = isDark() ? "Light mode" : "Dark mode";
    themeBtn.title = label; themeBtn.setAttribute("aria-label", label);
    themeBtn.setAttribute("aria-pressed", String(isDark()));
  };
  if (themeBtn) {
    themeBtn.type = "button";
    themeBtn.addEventListener("click", () => {
      if (isDark()) delete root.dataset.theme; else root.dataset.theme = "dark";
      store.set("classbot.theme", isDark() ? "dark" : "light");
      paintTheme();
    });
    paintTheme();
  }

  // ---- language ----
  const FR = store.get("classbot.lang") === "fr" && window.CB_FR;
  if (who) {
    const lang = document.createElement("button");
    lang.type = "button"; lang.id = "lang"; lang.className = "icon-btn lang-btn"; lang.dataset.notr = "";
    lang.textContent = FR ? "EN" : "FR";
    lang.title = FR ? "Switch to English" : "Passer en français";
    lang.setAttribute("aria-label", lang.title);
    lang.addEventListener("click", () => {
      store.set("classbot.lang", FR ? "en" : "fr");
      location.reload();
    });
    const min = document.getElementById("nav-min");
    if (min && min.parentNode === who) who.insertBefore(lang, min); else who.append(lang);
  }
  if (!FR) return;

  // ---- the translator ----
  const D = window.CB_FR;
  root.lang = "fr";
  const LETTER = /[A-Za-zÀ-ÿ]/;
  const has = (k) => Object.prototype.hasOwnProperty.call(D, k);
  // keys with {n} (a number) or {s} (any text, e.g. a name) are templates
  const NUM = /\d+(?:[.,]\d+)?/g;
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const TPL = Object.keys(D).filter((k) => k.includes("{s}")).map((k) => ({
    re: new RegExp("^" + esc(k).replace(/\\\{n\\\}/g, "(\\d+(?:[.,]\\d+)?)").replace(/\\\{s\\\}/g, "([^·\\n]+?)") + "$"),
    v: D[k],
  }));
  const fill = (v, vals) => { let i = 0; return v.replace(/\{[ns]\}/g, () => (i < vals.length ? vals[i++] : "")); };
  const MISS = store.get("cb-i18n-debug") ? (window.cbMiss = new Set()) : null;
  const one = (c) => {
    if (!c) return null;
    if (has(c)) return D[c];
    const nums = c.match(NUM);
    if (nums) { const k = c.replace(NUM, "{n}"); if (has(k)) return fill(D[k], nums); }
    for (const t of TPL) { const m = c.match(t.re); if (m) return fill(t.v, m.slice(1)); }
    return null;
  };
  const core = (c) => {
    let t = one(c);
    if (t != null) return t;
    // a leading icon or sign ("✨ Generate", "✗ 3 user stories"), a trailing colon or arrow
    for (const lead of [/^[^A-Za-zÀ-ÿ0-9]+/, /^[^A-Za-zÀ-ÿ]+/]) {
      const p = (c.match(lead) || [""])[0];
      const rest = c.slice(p.length);
      if (!rest) continue;
      if (p) { t = one(rest); if (t != null) return p + t; }
      const m = rest.match(/^([\s\S]*?)([\s:·,;→↗▾]+)$/);
      if (m && m[1]) { t = one(m[1]); if (t != null) return p + t + m[2]; }
    }
    return null;
  };
  const look = (c) => {
    let t = core(c);
    if (t != null) return t;
    // compound texts: "🧩 Functions & scope: 43% · not shown in code yet"
    const parts = c.split(/(\s+·\s+|\n+\s*)/);
    if (parts.length > 1) {
      let changed = false;
      const out = parts.map((p, i) => {
        if (i % 2) return p;
        let r = core(p.trim()) ;
        if (r == null) {
          const h = p.match(/^(.*?):\s+(.+)$/s);
          if (h) { const a = core(h[1]), b = core(h[2]); if (a != null || b != null) r = (a ?? h[1]) + " : " + (b ?? h[2]); }
        }
        if (r == null) return p;
        changed = true;
        return p.match(/^\s*/)[0] + r + p.match(/\s*$/)[0];
      });
      if (changed) return out.join("");
    }
    const h = c.match(/^(.*?):\s+(.+)$/s);
    if (h) { const a = core(h[1]), b = core(h[2]); if (a != null || b != null) return (a ?? h[1]) + " : " + (b ?? h[2]); }
    return null;
  };
  const tr = (s) => {
    if (!s || !LETTER.test(s)) return null;
    const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const c = m[2];
    if (c.length > 1500) return null;
    const t = look(c);
    if (t == null && MISS) MISS.add(c);
    return t == null || t === c ? null : m[1] + t + m[3];
  };
  // dates and times in French ("lun. 12 oct.") wherever the pages format them
  for (const f of ["toLocaleDateString", "toLocaleTimeString", "toLocaleString"]) {
    const orig = Date.prototype[f];
    Date.prototype[f] = function (loc, opt) { return orig.call(this, !loc || /^en/i.test(String(loc)) ? "fr-FR" : loc, opt); };
  }
  const SKIP = "code, pre, textarea, script, style, kbd, samp, [contenteditable], [data-notr], #who, .cm-editor, .CodeMirror";
  const skipped = (el) => !!(el && el.closest && el.closest(SKIP));
  const ATTRS = ["title", "placeholder", "aria-label", "data-tip"];
  const doAttrs = (el) => {
    if (skipped(el) && !(el.matches && el.matches("textarea, input"))) return;
    if (el.closest && el.closest("[data-notr]")) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v) { const t = tr(v); if (t != null) el.setAttribute(a, t); }
    }
    if (el.tagName === "INPUT" && /^(button|submit|reset)$/i.test(el.type) && el.value) {
      const t = tr(el.value); if (t != null) el.value = t;
    }
  };
  const doText = (n) => {
    const p = n.parentElement;
    if (!p || skipped(p)) return;
    const t = tr(n.nodeValue);
    if (t != null) n.nodeValue = t;
  };
  const walk = (node) => {
    if (node.nodeType === 3) { doText(node); return; }
    if (node.nodeType !== 1) return;
    if (node.matches("[data-notr], #who")) return;
    doAttrs(node);
    const w = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  };
  document.title = tr(document.title) || document.title;
  walk(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "childList") m.addedNodes.forEach(walk);
      else if (m.type === "characterData") doText(m.target);
      else if (m.type === "attributes") doAttrs(m.target);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });

  // the browser's own dialogs
  for (const f of ["confirm", "alert", "prompt"]) {
    const orig = window[f];
    if (typeof orig !== "function") continue;
    window[f] = function (msg, ...rest) { return orig.call(window, typeof msg === "string" ? (tr(msg) ?? msg) : msg, ...rest); };
  }
  window.cbT = (s) => tr(s) ?? s;
})();
