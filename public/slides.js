// 🎞️ An assessment as a slideshow: one question per slide, big and readable on the class screen, to go through them
// one by one and explain each one. ← → (or space) to move, R reveals the answer, S the class's results on it (who got
// it right, which choice they picked), F full screen, + / − text size, Esc to close. Nothing is saved, nothing is sent.
/* global $, esc, compChip */

const SL = { A: null, i: 0, reveal: false, stats: false, size: 1, el: null };

/** A prompt with its `code` and ``` blocks ```, the rest as text. */
function slText(t) {
  const parts = String(t || "").split(/```(?:\w+)?\n?([\s\S]*?)```/);
  return parts.map((p, i) => (i % 2 ? `<pre class="sl-code">${esc(p.replace(/\n$/, ""))}</pre>` : esc(p).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\n/g, "<br>"))).join("");
}
/** The class on one question: right / partly / wrong / not tried, and for a QCM how many picked each choice. */
function slStats(q) {
  const done = (SL.A.takers || []).filter((t) => ["submitted", "graded"].includes(t.status));
  const out = { n: done.length, correct: 0, partial: 0, wrong: 0, empty: 0, pending: 0, picks: (q.choices || []).map(() => 0) };
  for (const t of done) {
    const v = t.grades?.[q.id]?.verdict;
    if (v === "correct" || v === "partial" || v === "wrong" || v === "empty") out[v]++;
    else if (!t.answers?.[q.id] || (Array.isArray(t.answers[q.id]) && !t.answers[q.id].length)) out.empty++;
    else out.pending++;   // answered, not graded yet
    if (q.type === "mcq") for (const k of [].concat(t.answers?.[q.id] ?? [])) if (out.picks[k] != null) out.picks[k]++;
  }
  return out;
}

function slDraw() {
  const { A, i } = SL, qs = A.assessment.questions, q = qs[i];
  const right = new Set(q.answer || []);
  const st = SL.stats ? slStats(q) : null;
  const L = ["A", "B", "C", "D", "E", "F"];
  const kind = { mcq: "Multiple choice", code: "Code", explain: "Explain" }[q.type] || q.type;
  SL.el.style.setProperty("--sl-k", SL.size);
  SL.el.innerHTML = `
    <header class="sl-top"><div><b>${esc(A.assessment.title)}</b><span>Question ${i + 1} / ${qs.length}</span></div>
      <div class="sl-tools"><span class="sl-kind">${esc(kind)} · ${q.points} pt${q.points > 1 ? "s" : ""}</span>${(q.comps || []).map((c) => compChip(`${c.code}N${c.level}`)).join("")}
        <button type="button" data-sl="minus" title="Smaller text (−)">A−</button><button type="button" data-sl="plus" title="Bigger text (+)">A+</button>
        <button type="button" data-sl="full" title="Full screen (F)">Full screen</button><button type="button" data-sl="close" title="Close (Esc)">✕</button></div></header>
    <main class="sl-main">
      <div class="sl-q">${slText(q.prompt)}</div>
      ${q.code ? `<pre class="sl-code">${esc(q.code)}</pre>` : ""}
      ${q.type === "mcq" ? `<ol class="sl-choices">${(q.choices || []).map((c, k) => {
        const n = st ? st.picks[k] : 0;
        return `<li class="${SL.reveal ? (right.has(k) ? "ok" : "no") : ""}"><span class="sl-l">${L[k] || k + 1}</span><span class="sl-c">${slText(c)}</span>
          ${st && st.n ? `<span class="sl-pick" title="${n} student${n > 1 ? "s" : ""} chose it"><i style="width:${Math.round((100 * n) / st.n)}%"></i><b>${n}</b></span>` : ""}${SL.reveal && right.has(k) ? `<span class="sl-tick">✓</span>` : ""}</li>`;
      }).join("")}</ol>` : ""}
      ${SL.reveal && q.type !== "mcq" ? `<section class="sl-answer"><h3>Expected answer</h3>${q.expected ? (q.type === "code" ? `<pre class="sl-code">${esc(q.expected)}</pre>` : `<div>${slText(q.expected)}</div>`) : `<p class="muted">No expected answer was written for this question.</p>`}</section>` : ""}
      ${st ? (st.n ? `<section class="sl-stats"><h3>The class · ${st.n} paper${st.n > 1 ? "s" : ""}</h3>
        <span class="sl-bar">${[["correct", "ok"], ["partial", "mid"], ["wrong", "bad"], ["empty", "none"], ["pending", "wait"]].filter(([k]) => st[k]).map(([k, c]) => `<i class="${c}" style="flex:${st[k]}" title="${st[k]} ${k}"></i>`).join("")}</span>
        <span class="sl-legend"><b class="ok">${st.correct} right</b> · <b class="mid">${st.partial} partly</b> · <b class="bad">${st.wrong} wrong</b> · <b class="none">${st.empty} not tried</b>${st.pending ? ` · <b class="wait">${st.pending} not graded yet</b>` : ""}</span></section>`
        : `<section class="sl-stats"><p class="muted">No paper handed in yet.</p></section>`) : ""}
    </main>
    <footer class="sl-foot">
      <button type="button" class="sl-nav" data-sl="prev" ${i ? "" : "disabled"} title="Previous (←)">← Previous</button>
      <div class="sl-mid">
        <button type="button" class="sl-btn ${SL.reveal ? "on" : ""}" data-sl="reveal" title="R">${SL.reveal ? "Hide the answer" : "Show the answer"}</button>
        <button type="button" class="sl-btn ${SL.stats ? "on" : ""}" data-sl="stats" title="S">${SL.stats ? "Hide the results" : "Class results"}</button>
        <span class="sl-dots">${qs.map((_, k) => `<button type="button" data-go="${k}" class="${k === i ? "on" : ""}" aria-label="Question ${k + 1}"></button>`).join("")}</span>
      </div>
      <button type="button" class="sl-nav" data-sl="next" ${i < qs.length - 1 ? "" : "disabled"} title="Next (→ or space)">Next →</button>
    </footer>`;
  SL.el.querySelectorAll("[data-sl]").forEach((b) => b.onclick = () => slAct(b.dataset.sl));
  SL.el.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => { SL.i = Number(b.dataset.go); SL.reveal = false; slDraw(); });
}
function slAct(a) {
  const n = SL.A.assessment.questions.length;
  if (a === "next" && SL.i < n - 1) { SL.i++; SL.reveal = false; }
  else if (a === "prev" && SL.i > 0) { SL.i--; SL.reveal = false; }
  else if (a === "reveal") SL.reveal = !SL.reveal;
  else if (a === "stats") SL.stats = !SL.stats;
  else if (a === "plus") SL.size = Math.min(1.8, +(SL.size + 0.1).toFixed(1));
  else if (a === "minus") SL.size = Math.max(0.7, +(SL.size - 0.1).toFixed(1));
  else if (a === "full") { if (document.fullscreenElement) document.exitFullscreen?.(); else SL.el.requestFullscreen?.().catch(() => {}); return; }
  else if (a === "close") return slClose();
  else return;
  slDraw();
}
function slKey(e) {
  if (!SL.el) return;
  const k = e.key;
  const map = { ArrowRight: "next", ArrowLeft: "prev", " ": "next", PageDown: "next", PageUp: "prev", r: "reveal", R: "reveal", s: "stats", S: "stats", f: "full", F: "full", "+": "plus", "=": "plus", "-": "minus", Escape: "close" };
  if (k === "Escape" && document.fullscreenElement) return;   // the browser leaves full screen first
  if (map[k]) { e.preventDefault(); slAct(map[k]); }
  else if (k === "Home") { SL.i = 0; SL.reveal = false; slDraw(); }
  else if (k === "End") { SL.i = SL.A.assessment.questions.length - 1; SL.reveal = false; slDraw(); }
}
function slClose() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  document.removeEventListener("keydown", slKey);
  SL.el?.remove(); SL.el = null;
  document.body.classList.remove("sl-open");
}
/** Opens the slideshow of an assessment (its questions; its papers for the class results). */
function assessSlides(A, start = 0) {
  if (!A?.assessment?.questions?.length) return;
  slClose();
  Object.assign(SL, { A, i: Math.min(start, A.assessment.questions.length - 1), reveal: false, stats: false });
  SL.el = document.createElement("div");
  SL.el.className = "sl";
  SL.el.setAttribute("role", "dialog"); SL.el.setAttribute("aria-label", `${A.assessment.title}: slideshow`);
  document.body.appendChild(SL.el);
  document.body.classList.add("sl-open");
  document.addEventListener("keydown", slKey);
  slDraw();
}
// leaving the page closes it
window.addEventListener("hashchange", () => { if (SL.el) slClose(); });
