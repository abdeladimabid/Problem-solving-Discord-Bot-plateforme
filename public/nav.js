// The side menu in sections: each section opens and closes (remembered in this browser), shows the waiting counts
// of its pages when closed, and opens by itself on the page you're on. Simple mode: one section open at a time.
/* global $, $$ */
const NAV_GROUPS = [
  { key: "class", icon: "🏫", label: "Class", items: ["#/students", "#/teams", "#/hands", "#/questions", "#/assignments"] },
  { key: "projects", icon: "📄", label: "Projects", items: ["#/briefs", "#/activities", "#/github"] },
  { key: "eval", icon: "🎓", label: "Evaluation", items: ["#/sprints", "#/progress", "#/assessments", "#/competencies", "#/integrity", "#/interviews"] },
  { key: "practice", icon: "🧩", label: "Practice", items: ["#/challenges", "#/daily", "#/path", "#/sessions"] },
  { key: "games", icon: "🎮", label: "Games & rewards", items: ["#/battles", "#/contests", "#/events", "#/points", "#/coins", "#/skills"] },
  { key: "setup", icon: "⚙️", label: "Setup", items: ["#/classes", "#/settings"] },
];
const navSimple = () => { try { return localStorage.getItem("cb-simple") === "1"; } catch { return false; } };
const navState = () => { try { return JSON.parse(localStorage.getItem("cb-nav") || "{}") || {}; } catch { return {}; } };
const navSave = (st) => { try { localStorage.setItem("cb-nav", JSON.stringify(st)); } catch { /* this visit only */ } };

(function buildNav() {
  const nav = $("#nav");
  if (!nav || nav.dataset.grouped) return;
  nav.dataset.grouped = "1";
  const links = new Map($$("a", nav).map((a) => [a.getAttribute("href"), a]));
  const used = new Set(["#/overview"]);
  const frag = document.createDocumentFragment();
  if (links.get("#/overview")) frag.append(links.get("#/overview"));
  for (const g of NAV_GROUPS) {
    const items = g.items.map((h) => links.get(h)).filter(Boolean);
    if (!items.length) continue;
    g.items.forEach((h) => used.add(h));
    const box = document.createElement("div");
    box.className = "nav-grp";
    box.dataset.g = g.key;
    box.innerHTML = `<button type="button" class="nav-gh" aria-expanded="true"><span class="nav-gi" aria-hidden="true">${g.icon}</span><span class="nav-gl">${g.label}</span><span class="nav-gp" hidden></span><svg class="nav-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button><div class="nav-gb"></div>`;
    items.forEach((a) => $(".nav-gb", box).append(a));
    frag.append(box);
  }
  // pages added later (or by another file) keep a place: in a last section
  const rest = [...links.entries()].filter(([h]) => !used.has(h)).map(([, a]) => a);
  if (rest.length) {
    const box = document.createElement("div");
    box.className = "nav-grp"; box.dataset.g = "more";
    box.innerHTML = `<button type="button" class="nav-gh" aria-expanded="true"><span class="nav-gi">➕</span><span class="nav-gl">More</span><span class="nav-gp" hidden></span><svg class="nav-chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button><div class="nav-gb"></div>`;
    rest.forEach((a) => $(".nav-gb", box).append(a));
    frag.append(box);
  }
  nav.innerHTML = "";
  nav.append(frag);

  const setOpen = (box, open) => { $(".nav-gh", box).setAttribute("aria-expanded", String(open)); box.classList.toggle("closed", !open); };
  // detail pages belong to their list's section (#/student/… → Students)
  const ALSO = { "#/students": "#/student/", "#/briefs": "#/brief", "#/progress": "#/debrief/", "#/assessments": "#/assessment/", "#/contests": "#/contest/", "#/sessions": "#/session/", "#/battles": "#/battle/" };
  const isHere = (href) => { const h = location.hash.split("?")[0]; return h === href || h.startsWith(href + "/") || (ALSO[href] && h.startsWith(ALSO[href])); };
  const current = () => $$(".nav-grp", nav).find((b) => $$("a", b).some((a) => isHere(a.getAttribute("href"))));
  const apply = () => {
    const st = navState(), cur = current(), simple = navSimple();
    for (const box of $$(".nav-grp", nav)) {
      const k = box.dataset.g;
      // simple mode: only the section of the page you're on (and the one you opened)
      const open = simple ? box === cur || st._simple === k : box === cur || (k in st ? !!st[k] : k === "class" || k === "projects");
      setOpen(box, open);
    }
    badges();
  };
  // a closed section shows how many things wait inside it
  const badges = () => {
    for (const box of $$(".nav-grp", nav)) {
      const n = $$(".nav-gb .pill", box).filter((p) => !p.hidden).reduce((s, p) => s + (Number(p.textContent) || 1), 0);
      const gp = $(".nav-gp", box);
      // write only what changed: the observer below would see our own change and loop
      const hide = !n || !box.classList.contains("closed"), txt = n > 99 ? "99+" : String(n);
      if (gp.hidden !== hide) gp.hidden = hide;
      if (gp.textContent !== txt) gp.textContent = txt;
    }
  };
  $$(".nav-gh", nav).forEach((h) => h.onclick = () => {
    const box = h.parentElement, open = box.classList.contains("closed");
    const st = navState();
    if (navSimple()) { st._simple = open ? box.dataset.g : ""; for (const b of $$(".nav-grp", nav)) if (b !== box && b !== current()) setOpen(b, false); }
    else st[box.dataset.g] = open;
    navSave(st);
    setOpen(box, open);
    badges();
  });
  // the waiting counts (the pills of the pages) change: update the closed sections' counts
  const obs = new MutationObserver((list) => { if (list.some((m) => !(m.target.closest && m.target.closest(".nav-gp")) && !(m.target.parentElement && m.target.parentElement.closest(".nav-gp")))) badges(); });
  obs.observe(nav, { subtree: true, attributes: true, attributeFilter: ["hidden"], childList: true, characterData: true });
  window.addEventListener("hashchange", () => setTimeout(apply, 0));
  window.addEventListener("storage", (e) => { if (e.key === "cb-simple") apply(); });
  document.addEventListener("change", (e) => { if (e.target && e.target.id === "cb-simple-t") setTimeout(apply, 0); });
  apply();
})();

// The side menu folds to a bar of icons (the button at its bottom), remembered in this browser; each icon says its page
(function navCollapse() {
  const app = $(".app"), who = $(".board .who");
  if (!app || !who || $("#nav-min")) return;
  const btn = document.createElement("button");
  btn.className = "icon-btn"; btn.id = "nav-min"; btn.type = "button";
  btn.innerHTML = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>`;
  who.append(btn);
  const titles = () => $$("#nav a").forEach((a) => { if (!a.title) a.title = a.textContent.replace(/\s+\d+\s*$/, "").trim(); });
  const set = (min) => {
    app.classList.toggle("nav-min", min);
    btn.title = min ? "Show the menu" : "Hide the menu";
    btn.setAttribute("aria-label", btn.title);
    btn.setAttribute("aria-expanded", String(!min));
    if (min) titles();
  };
  let min = false;
  try { min = localStorage.getItem("cb-navmin") === "1"; } catch { /* this visit only */ }
  set(min);
  btn.onclick = () => { min = !min; set(min); try { localStorage.setItem("cb-navmin", min ? "1" : "0"); } catch { /* this visit only */ } };
})();
