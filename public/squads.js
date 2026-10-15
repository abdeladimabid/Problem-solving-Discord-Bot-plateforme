/* ClassBot dashboard: squads. A drag-and-drop board (students ⇄ squads, scrum master), the class's squads by
   sprint on the Teams page, and the same board in a brief. Loaded after learning.js. */
"use strict";

const SQ_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#a855f7", "#f59e0b", "#06b6d4", "#ec4899", "#14b8a6", "#6366f1", "#84cc16"];
const sqHex = () => [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, "0")).join("");
const SQ_LV = [["critique", "Critique"], ["faible", "Faible"], ["moyen", "Moyen"], ["bon", "Bon"], ["excellent", "Excellent"]];
const sqLvName = (lv) => SQ_LV.find((x) => x[0] === lv)?.[1] || "No level yet";
const sqPairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Balanced squads: every squad gets the same share of each level (Critique, Faible, Moyen, Bon, Excellent; no
 * level yet counts on its own), and students who already worked together in earlier squads are kept apart as much
 * as possible, so over the sprints everyone works with everyone. Many tries, the best one is kept.
 */
function balancedSquads(ids, n, levelOf, pairs) {
  const tiers = [...SQ_LV.map((x) => x[0]), ""];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const met = (a, b) => pairs.get(sqPairKey(a, b)) || 0;
  const cost = (groups) => groups.reduce((t, g) => { let c = 0; for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) c += met(g[i], g[j]) ** 2; return t + c; }, 0);
  let best = null, bestCost = Infinity;
  for (let run = 0; run < 40; run++) {
    const groups = Array.from({ length: n }, () => []);
    // the weakest levels first, each one spread over the squads (the squad with the fewest of that level, the
    // fewest people, then the fewest classmates already met)
    for (const tier of tiers) {
      for (const id of shuffle(ids.filter((x) => (levelOf(x) || "") === tier))) {
        const order = groups.map((g, i) => ({ i, k: g.filter((m) => (levelOf(m) || "") === tier).length, n: g.length, m: g.reduce((t, x) => t + met(id, x), 0), r: Math.random() }))
          .sort((a, b) => a.k - b.k || a.n - b.n || a.m - b.m || a.r - b.r);
        groups[order[0].i].push(id);
      }
    }
    // then swap two students of the same level between squads when it means fewer pairs that already met
    let c = cost(groups);
    for (let step = 0; step < 1500 && c > 0; step++) {
      const a = Math.floor(Math.random() * n), b = Math.floor(Math.random() * n);
      if (a === b || !groups[a].length || !groups[b].length) continue;
      const i = Math.floor(Math.random() * groups[a].length), x = groups[a][i];
      const same = groups[b].map((y, j) => [y, j]).filter(([y]) => (levelOf(y) || "") === (levelOf(x) || ""));
      if (!same.length) continue;
      const [y, j] = same[Math.floor(Math.random() * same.length)];
      groups[a][i] = y; groups[b][j] = x;
      const c2 = cost(groups);
      if (c2 <= c) c = c2; else { groups[a][i] = x; groups[b][j] = y; }
    }
    if (c < bestCost) { best = groups.map((g) => [...g]); bestCost = c; }
    if (!c) break;
  }
  return { groups: best, repeats: best.reduce((t, g) => { let k = 0; for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if (met(g[i], g[j])) k++; return t + k; }, 0) };
}

/**
 * The board. students: [{id, name}], squads: [{id, name, members, sm}] (changed in place).
 * Drag a student onto a squad (or back to "Not in a squad"); on a phone: tap a student, then tap a squad.
 * ★ makes them the scrum master. onChange() after every change.
 */
function squadBoard(root, students, squads, onChange = () => {}, opts = {}) {
  let picked = null, q = "";
  // the pairs that already worked together (earlier squads), and each student's level
  const pairs = new Map(), metIn = new Map();
  for (const h of opts.history || []) for (const g of h.squads) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const k = sqPairKey(g[i], g[j]); pairs.set(k, (pairs.get(k) || 0) + 1); if (!metIn.has(k)) metIn.set(k, []); metIn.get(k).push(h.name);
  }
  const levelOf = (id) => students.find((s) => s.id === id)?.lv || "";
  const hasLevels = students.some((s) => s.lv);
  const repeatsIn = (sq) => { const out = []; for (let i = 0; i < sq.members.length; i++) for (let j = i + 1; j < sq.members.length; j++) { const k = sqPairKey(sq.members[i], sq.members[j]); if (pairs.get(k)) out.push([sq.members[i], sq.members[j], metIn.get(k)]); } return out; };
  const buddies = (opts.buddies || []).filter((b) => students.some((s) => s.id === b.buyer) && students.some((s) => s.id === b.mate));
  const squadOf = (uid) => squads.findIndex((s) => s.members.includes(uid));
  const together = (b) => squadOf(b.buyer) >= 0 && squadOf(b.buyer) === squadOf(b.mate);
  /** Put each 🤝 pair in the same squad (the mate joins the buyer, or both go to the smallest squad). */
  const applyBuddies = () => {
    for (const b of buddies) {
      if (together(b)) continue;
      let i = squadOf(b.buyer);
      if (i < 0) i = squadOf(b.mate);
      if (i < 0) { if (!squads.length) return; i = squads.indexOf([...squads].sort((x, y) => x.members.length - y.members.length)[0]); }
      for (const uid of [b.buyer, b.mate]) { squads.forEach((s) => (s.members = s.members.filter((m) => m !== uid))); squads[i].members.push(uid); }
    }
  };
  const nameOf = (id) => students.find((s) => s.id === id)?.name || id;
  const fix = () => squads.forEach((s) => { if (!s.members.includes(s.sm)) s.sm = s.members[0] || null; });
  const changed = () => { fix(); draw(); onChange(); };
  const move = (uid, to) => {
    squads.forEach((s) => (s.members = s.members.filter((m) => m !== uid)));
    if (to !== "pool") squads[Number(to)].members.push(uid);
    picked = null;
    changed();
  };
  const card = (uid, si = null) => {
    const sm = si != null && squads[si].sm === uid;
    const bd = buddies.find((b) => b.buyer === uid || b.mate === uid);
    const other = bd ? (bd.buyer === uid ? bd.mate : bd.buyer) : null;
    return `<div class="sqb-card ${picked === uid ? "picked" : ""} ${sm ? "sm" : ""}" draggable="true" data-uid="${esc(uid)}" title="Drag to a squad (or tap, then tap a squad)">
      ${avatar(nameOf(uid), uid)}<span class="sqb-n">${esc(nameOf(uid))}</span>${hasLevels ? `<span class="sqb-lv lv-${levelOf(uid) || "none"}" title="${esc(sqLvName(levelOf(uid)))}"></span>` : ""}${bd ? `<span class="sqb-bd ${together(bd) ? "ok" : ""}" title="🤝 ${esc(bd.buyer === uid ? `Bought a squad buddy: wants ${nameOf(other)}` : `${nameOf(other)} bought a squad buddy with them`)}${together(bd) ? " (done)" : ""}">🤝</span>` : ""}
      ${si != null ? `<button type="button" class="sqb-star" data-sm="${si}" title="${sm ? "Scrum master" : "Make scrum master"}" aria-label="Scrum master">${sm ? "👑" : "☆"}</button>` : ""}</div>`;
  };
  function draw() {
    const used = new Set(squads.flatMap((s) => s.members));
    const pool = students.filter((s) => !used.has(s.id) && (!q || s.name.toLowerCase().includes(q)));
    const free = students.filter((s) => !used.has(s.id)).length;
    root.innerHTML = `
      <div class="sqb-tools">
        <button type="button" class="btn small" data-act="add">+ Add a squad</button>
        <span class="sqb-rand" title="Every squad gets the same mix of levels (Critique, Faible, Moyen, Bon), and students who already worked together are kept apart">⚖️ Balanced squads of <input type="number" min="2" max="10" value="${root.dataset.size || 4}" data-size> <button type="button" class="btn small" data-act="rand">Make them</button></span>
        ${free ? `<button type="button" class="btn small" data-act="fill" title="Put the students who are in no squad into the smallest squads">Place the ${free} left</button>` : ""}
        ${buddies.length ? `<button type="button" class="btn small" data-act="buddies" title="${esc(buddies.map((b) => `${nameOf(b.buyer)} + ${nameOf(b.mate)}`).join(" · "))}">🤝 Squad buddies ${buddies.filter(together).length}/${buddies.length}</button>` : ""}
        <span class="sqb-sum small muted">${squads.length} squad${squads.length === 1 ? "" : "s"} · ${used.size}/${students.length} placed</span>
        ${squads.length ? `<button type="button" class="btn small danger" data-act="clear">Empty all</button>` : ""}
      </div>
      ${hasLevels ? `<div class="sqb-legend small muted">${[...SQ_LV, ["", "No level yet"]].map(([k, l]) => `<span><i class="sqb-lv lv-${k || "none"}"></i>${l}</span>`).join("")}${pairs.size ? `<span>🔁 pairs who already worked together · ✨ all new</span>` : ""}</div>` : ""}
      <div class="sqb">
        <aside class="sqb-pool" data-drop="pool">
          <header><b>Not in a squad</b><span class="sqb-count">${free}</span></header>
          <input type="search" placeholder="Find a student…" value="${esc(q)}" data-q>
          <div class="sqb-cards">${pool.map((s) => card(s.id)).join("") || `<p class="sqb-empty">${free ? "No match." : "Everyone is in a squad 🎉"}</p>`}</div>
        </aside>
        <div class="sqb-grid">
          ${squads.map((s, i) => `<section class="sqb-squad" data-drop="${i}" style="--c:${SQ_COLORS[i % SQ_COLORS.length]}">
            <header><input type="text" value="${esc(s.name)}" data-name="${i}" aria-label="Squad name" maxlength="40"><span class="sqb-count">${s.members.length}</span><button type="button" class="sqb-x" data-del="${i}" title="Remove this squad (its students go back to the list)" aria-label="Remove">✕</button></header>
            ${s.members.length && (hasLevels || pairs.size) ? `<div class="sqb-mix">${hasLevels ? [...SQ_LV.map((x) => x[0]), ""].map((lv) => { const n = s.members.filter((m) => levelOf(m) === lv).length; return n ? `<span class="sqb-lvc lv-${lv || "none"}" title="${esc(sqLvName(lv))}">${n}</span>` : ""; }).join("") : ""}
              ${(() => { const r = repeatsIn(s); return r.length ? `<span class="sqb-rep" title="${esc(r.map(([a, b, w]) => `${nameOf(a)} & ${nameOf(b)}: already together in ${w.join(", ")}`).join("\n"))}">🔁 ${r.length}</span>` : pairs.size ? `<span class="sqb-rep ok" title="Nobody in this squad worked together before">✨ new</span>` : ""; })()}</div>` : ""}
            <div class="sqb-cards">${s.members.map((m) => card(m, i)).join("") || `<p class="sqb-empty">Drop students here</p>`}</div>
          </section>`).join("")}
          <button type="button" class="sqb-new" data-act="add">+ New squad</button>
        </div>
      </div>`;
    wire();
  }
  function wire() {
    $$("[data-act]", root).forEach((b) => b.onclick = () => {
      const a = b.dataset.act;
      if (a === "buddies") { if (!squads.length) { toast("Add squads first", true); return; } applyBuddies(); changed(); toast("🤝 Squad buddies placed together"); return; }
      if (a === "add") { squads.push({ id: sqHex(), name: `Squad ${squads.length + 1}`, members: [], sm: null }); changed(); }
      if (a === "clear") { squads.forEach((s) => (s.members = [])); changed(); }
      if (a === "rand") {
        const size = Math.max(2, Number($("[data-size]", root).value) || 4);
        root.dataset.size = size;
        const ids = students.map((s) => s.id);
        const n = Math.max(1, Math.round(ids.length / size));
        const r = balancedSquads(ids, n, levelOf, pairs);
        squads.splice(0, squads.length, ...Array.from({ length: n }, (_, i) => ({ id: squads[i]?.id || sqHex(), name: squads[i]?.name || `Squad ${i + 1}`, members: r.groups[i], sm: null })));
        applyBuddies();   // 🤝 bought in the shop: keep them together
        changed();
        toast(`${n} balanced squads${hasLevels ? ": the same mix of levels in each" : ""}${pairs.size ? (r.repeats ? ` · ${r.repeats} pair(s) already worked together (the fewest possible)` : " · nobody works again with someone from before") : ""}`);
      }
      if (a === "fill" && squads.length) {
        const used = new Set(squads.flatMap((s) => s.members));
        students.filter((s) => !used.has(s.id)).forEach((s) => [...squads].sort((x, y) => x.members.length - y.members.length)[0].members.push(s.id));
        changed();
      }
      if (a === "fill" && !squads.length) toast("Add a squad first", true);
    });
    const qi = $("[data-q]", root);
    qi.oninput = () => { q = qi.value.trim().toLowerCase(); const pos = qi.selectionStart; draw(); const n = $("[data-q]", root); n.focus(); n.setSelectionRange(pos, pos); };
    $$("[data-name]", root).forEach((inp) => inp.oninput = () => { squads[Number(inp.dataset.name)].name = inp.value; onChange(); });
    $$("[data-del]", root).forEach((b) => b.onclick = () => { squads.splice(Number(b.dataset.del), 1); changed(); });
    $$("[data-sm]", root).forEach((b) => b.onclick = (e) => { e.stopPropagation(); squads[Number(b.dataset.sm)].sm = b.closest("[data-uid]").dataset.uid; changed(); });
    // drag and drop
    $$(".sqb-card", root).forEach((c) => {
      c.ondragstart = (e) => { e.dataTransfer.setData("text/plain", c.dataset.uid); e.dataTransfer.effectAllowed = "move"; c.classList.add("dragging"); root.classList.add("is-dragging"); };
      c.ondragend = () => { c.classList.remove("dragging"); root.classList.remove("is-dragging"); $$(".over", root).forEach((x) => x.classList.remove("over")); };
      c.onclick = (e) => { if (e.target.closest("[data-sm]")) return; e.stopPropagation(); picked = picked === c.dataset.uid ? null : c.dataset.uid; draw(); };
    });
    $$("[data-drop]", root).forEach((z) => {
      z.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; z.classList.add("over"); };
      z.ondragleave = (e) => { if (!z.contains(e.relatedTarget)) z.classList.remove("over"); };
      z.ondrop = (e) => { e.preventDefault(); z.classList.remove("over"); const uid = e.dataTransfer.getData("text/plain"); if (uid) move(uid, z.dataset.drop); };
      // tap-to-move (phones, tablets)
      z.onclick = (e) => { if (!picked || e.target.closest("input,button,.sqb-card")) return; move(picked, z.dataset.drop); };
    });
    root.classList.toggle("has-pick", !!picked);
  }
  fix();
  draw();
  return { redraw: draw };
}

// ================================================================ the Teams page: squads by sprint
async function squadsSection(box) {
  let d = await api("/squads");
  let set = d.sets.find((x) => x.active) || d.sets[0] || null;
  let timer = null, dirty = false;
  const save = async () => {
    if (!set) return;
    clearTimeout(timer); timer = null;
    $("#sq-state").textContent = "Saving…";
    try {
      d = await api(`/squads/${set.id}`, { method: "PUT", body: { name: set.name, squads: set.squads.map((s) => ({ ...s, members: s.members })) } });
      dirty = false;
      $("#sq-state").textContent = "✓ Saved";
    } catch (e) { $("#sq-state").textContent = "⚠️ " + e.message; }
  };
  const soon = () => { dirty = true; $("#sq-state").textContent = "…"; clearTimeout(timer); timer = setTimeout(save, 900); };
  const render = () => {
    box.innerHTML = `<section class="panel sq-panel">
      <div class="sq-head">
        <div><h2 style="margin:0">🧩 Squads</h2><p class="small muted" style="margin:4px 0 0">${d.buddies?.length ? `<b>🤝 ${d.buddies.length} squad buddy request(s)</b> from the shop: balanced squads keep them together. ` : ""}The class's squads for a sprint. Briefs in squads and squad battles load them. When they change, start new ones: the old ones stay in the history.</p></div>
        <div class="toolbar" style="margin:0">
          ${d.sets.length ? `<select id="sq-set" aria-label="Squads">${d.sets.map((x) => `<option value="${x.id}" ${set && x.id === set.id ? "selected" : ""}>${esc(x.name)}${x.active ? " · current" : ""}</option>`).join("")}</select>` : ""}
          <button class="btn primary" id="sq-new">+ New squads</button>
        </div>
      </div>
      ${set ? `<div class="sq-meta">
          <input type="text" id="sq-name" value="${esc(set.name)}" maxlength="60" aria-label="Name (e.g. Sprint 3)">
          ${set.active ? `<span class="tag lang">Current squads</span>` : `<button class="btn small" id="sq-cur">Make them the current squads</button>`}
          <span class="small muted" id="sq-state">${dirty ? "…" : "Saved automatically"}</span>
          <button class="btn small danger" id="sq-del" style="margin-left:auto">Delete</button></div>
        <div id="sq-board"></div>`
        : `<div class="sq-empty"><div style="font-size:44px">🧩</div><p><b>No squads yet.</b> Make the squads of this sprint: drag the students into squads, or let ClassBot make balanced ones (the same mix of levels in each, new teammates every sprint).</p><button class="btn primary" id="sq-first">Make the squads</button></div>`}
    </section>`;
    // the other sets are the history: who already worked with whom
    if (set) squadBoard($("#sq-board", box), d.students, set.squads, soon, { buddies: d.buddies, history: d.sets.filter((x) => x.id !== set.id).map((x) => ({ name: x.name, squads: x.squads.map((s) => s.members) })) });
    if ($("#sq-set", box)) $("#sq-set", box).onchange = async (e) => { if (dirty) await save(); set = d.sets.find((x) => String(x.id) === e.target.value); render(); };
    if ($("#sq-name", box)) $("#sq-name", box).oninput = (e) => { set.name = e.target.value; soon(); };
    if ($("#sq-cur", box)) $("#sq-cur", box).onclick = (e) => busy(e.currentTarget, async () => { if (dirty) await save(); d = await api(`/squads/${set.id}`, { method: "PUT", body: { active: true } }); set = d.sets.find((x) => x.id === set.id); toast("These are now the current squads"); render(); });
    if ($("#sq-del", box)) $("#sq-del", box).onclick = () => confirmDialog(`Delete “${set.name}”?`, "The briefs that already loaded these squads keep their own copy.", "Delete", async () => { d = await api(`/squads/${set.id}`, { method: "DELETE" }); set = d.sets.find((x) => x.active) || d.sets[0] || null; render(); }, true);
    const create = () => openDialog("New squads", `
      <label for="ns-name">Name</label><input type="text" id="ns-name" style="width:100%" maxlength="60" placeholder="e.g. Sprint 3" value="Sprint ${d.sets.length + 1}">
      <label>Start from</label>${segHtml("ns-from", [...(set ? [["copy", `A copy of “${set.name}”`]] : []), ["empty", "Empty"]], set ? "copy" : "empty")}
      <p class="muted small">They become the current squads. You then drag the students around (or make balanced squads).</p>`,
    [{ label: "Create", primary: true, action: async () => {
      if (dirty) await save();
      const r = await api("/squads", { method: "POST", body: { name: $("#ns-name").value, copyFrom: segVal(dlg, "ns-from") === "copy" && set ? set.id : undefined } });
      d = r; set = d.sets.find((x) => x.id === r.id); dlg.close(); render();
    } }]);
    $("#sq-new", box).onclick = () => { create(); wireSeg(dlg, "ns-from"); };
    if ($("#sq-first", box)) $("#sq-first", box).onclick = () => { create(); wireSeg(dlg, "ns-from"); };
  };
  render();
  window.addEventListener("hashchange", () => { if (dirty) save(); }, { once: true });
}
