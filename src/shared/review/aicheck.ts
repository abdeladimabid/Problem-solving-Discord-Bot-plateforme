// "Was it made with AI?": no tool can tell it for sure (students edit what an AI gives them, clean beginner code
// looks like AI code). So this is never a verdict: signals that can be measured, each with its evidence, a level
// (low / some / high), and the parts of the code to ask about in the oral. The teacher decides.
//   • the pushes: a lot of code at once, code arriving faster than anyone types, a whole project in one or two commits
//   • the code: what AI tools leave behind (chatbot sentences, explained comments, JSDoc everywhere), techniques the
//     class hasn't seen yet, a file whose style differs from the others
//   • the debrief: a project far above what the student showed in the assessment, in class and without help
//   • optionally, one AI reading of the code (one signal among the others, never alone)

export interface AiSignal { id: string; label: string; detail: string; pts: number; refs?: string[] }
export interface AiPart { where: string; why: string; url?: string }
export interface AiCheck { at: number; score: number; level: "low" | "some" | "high"; signals: AiSignal[]; parts: AiPart[]; commits: number; lines: number; ai: { pct: number; note: string } | null }
export interface PushRow { t: number; adds: number; dels?: number; files?: number; title?: string; id?: string; repo?: string; branch?: string; main?: string }

const short = (sha?: string) => (sha ? String(sha).slice(0, 7) : "");
const msg = (t?: string) => String(t || "").split("\n")[0].slice(0, 60);
/** Where a commit is: its sha, message, and the branch (and repo, when it's not the brief's), with a link to it on GitHub. */
const commitPart = (r: PushRow, why: string): AiPart => ({
  where: `commit ${short(r.id) || when(r.t)}${r.title ? ` “${msg(r.title)}”` : ""}${r.branch ? ` · ${r.branch}` : ""}${r.repo && r.main && r.repo.toLowerCase() !== r.main.toLowerCase() ? ` · ${r.repo}` : ""}`,
  why, ...(r.repo && r.id && /^[0-9a-f]{40}$/.test(r.id) ? { url: `https://github.com/${r.repo}/commit/${r.id}` } : {}) });
const when = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ");

/** The pushes: big commits, code faster than typing, a project in very few commits. */
export function pushSignals(rows: PushRow[]): { signals: AiSignal[]; parts: AiPart[] } {
  const list = rows.filter((r) => Number.isFinite(r.adds)).slice().sort((a, b) => a.t - b.t);
  const signals: AiSignal[] = [], parts: AiPart[] = [];
  const total = list.reduce((s, r) => s + Math.max(0, r.adds), 0);
  if (!list.length || total < 80) return { signals, parts };
  // 1. big commits: hundreds of lines in one go
  const big = list.filter((r) => r.adds >= 300);
  if (big.length) {
    signals.push({ id: "big", label: "Very big commits", pts: Math.min(30, 15 + 5 * (big.length - 1)),
      detail: big.slice(0, 3).map((r) => `+${r.adds} lines in one commit${r.title ? ` (“${msg(r.title)}”)` : ""}`).join(" · "), refs: big.map((r) => short(r.id)).filter(Boolean) });
    for (const r of big.slice(0, 2)) parts.push(commitPart(r, `+${r.adds} lines at once`));
  }
  // 2. one commit holds most of the project
  const top = list.reduce((m, r) => (r.adds > m.adds ? r : m), list[0]);
  if (top.adds >= 200 && top.adds / total >= 0.6 && list.length >= 2) signals.push({ id: "share", label: "Most of the code in one commit", pts: 15, detail: `${Math.round((100 * top.adds) / total)} % of all the lines arrived in one commit${top.title ? ` (“${msg(top.title)}”)` : ""}`, refs: [short(top.id)].filter(Boolean) });
  // 3. faster than typing: lines added per minute since the previous push
  const fast: { r: PushRow; pace: number; mins: number }[] = [];
  for (let i = 1; i < list.length; i++) {
    const r = list[i], mins = Math.max(1, (r.t - list[i - 1].t) / 60);
    if (r.adds >= 120 && r.adds / mins >= 30) fast.push({ r, pace: Math.round(r.adds / mins), mins: Math.round(mins) });
  }
  if (fast.length) {
    signals.push({ id: "fast", label: "Code faster than typing", pts: Math.min(25, 15 + 5 * (fast.length - 1)),
      detail: fast.slice(0, 3).map((f) => `+${f.r.adds} lines ${f.mins} min after the previous push (${f.pace} lines/min)`).join(" · "), refs: fast.map((f) => short(f.r.id)).filter(Boolean) });
    for (const f of fast.slice(0, 2)) if (!parts.some((p) => p.where.includes(short(f.r.id) || "§"))) parts.push(commitPart(f.r, `+${f.r.adds} lines in ${f.mins} min`));
  }
  // 4. a whole project in very few commits
  if (list.length <= 2 && total >= 300) signals.push({ id: "few", label: "A whole project in very few commits", pts: 10, detail: `${total} lines in ${list.length} commit${list.length > 1 ? "s" : ""}` });
  return { signals, parts };
}

// what AI tools leave in code
const LEFTOVER = /here'?s (the|your|an?) (updated|complete|improved|full|corrected|modified)|as an ai\b|i hope this helps|let me know if|voici (le|la|un|une) (code|version|fonction)|bien s[ûu]r ?!|certainly!|```/i;
const EXPLAINED = /(\/\/|#|\/\*)\s*(helper|utility) function|(\/\/|#)\s*(function|method) to\b|(\/\/|#)\s*(initialize|initialise|handle|update|render|toggle|validate|fetch|get|set) the\b|(\/\/|#)\s*step \d+[:.]/gi;
const JSDOC = /\/\*\*[\s\S]{0,400}?@(param|returns?)\b/g;
const EMOJI = /(console\.log\([^)]*|(\/\/|#)[^\n]*)[\u{1F300}-\u{1FAFF}\u{2705}\u{274C}\u{26A0}\u{2728}]/gu;
// techniques a first-year class meets late: flagged when the programme hasn't named them yet
export const ADVANCED: [string, RegExp, RegExp][] = [
  ["reduce()", /\.reduce\(/, /reduce/i],
  ["async / await", /\basync\b[\s\S]{0,300}\bawait\b/, /async|await|asynchron/i],
  ["fetch / API calls", /\bfetch\(|axios\./, /fetch|api|axios|requ[êe]te/i],
  ["classes", /\bclass\s+[A-Z]\w*\s*(extends\b|\{)/, /class|poo|objet|oop/i],
  ["regular expressions", /\.(test|exec)\(|\.(match|replace|split)\(\s*\/(?!\/)/, /regex|expression r[ée]guli|regexp/i],
  ["optional chaining ?.", /\w\?\.\w/, /optional|cha[iî]nage optionnel|\?\./i],
  ["nullish ??", /\?\?(?!=)/, /nullish|\?\?/i],
  ["destructuring", /\b(const|let|var)\s*[{[][^=]{1,80}\]?\}?\s*=/, /d[ée]structur/i],
  ["Promise", /\bnew Promise\b|\bPromise\.(all|race|any|allSettled)\b/, /promise|promesse/i],
  ["Map / Set", /\bnew (Map|Set|WeakMap)\(/, /\bmap\b.*\bset\b|structures? de donn|\bset\b/i],
  ["IntersectionObserver", /IntersectionObserver/, /intersection/i],
  ["event delegation", /\.target\.closest\(/, /d[ée]l[ée]gation|closest/i],
];
const commentsOf = (code: string) => (code.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|(^|\n)\s*#[^\n]*/g) || []).map((c) => c.replace(/^[\s/#*]+|\*\/$/g, "").trim()).filter((c) => c.length > 8);
const EN = /\b(the|to|and|this|function|if|when|we|of|for|with|returns?|check|create|add|get)\b/i;
const FR = /\b(le|la|les|des|une?|pour|avec|qui|que|est|dans|fonction|si|quand|on|du|au)\b|[éèàçùê]/i;

/** The code: AI leftovers, explained comments, JSDoc everywhere, emoji, techniques not taught yet, a file in another style. */
export function codeSignals(files: Record<string, string>, o: { lang: string; taught: string }): { signals: AiSignal[]; parts: AiPart[] } {
  const signals: AiSignal[] = [], parts: AiPart[] = [];
  const code = Object.entries(files).filter(([f]) => /\.(js|jsx|ts|tsx|php|py|html?|css|scss|vue)$/i.test(f));
  if (!code.length) return { signals, parts };
  // 1. chatbot sentences left in the code: the strongest fingerprint
  const left = code.filter(([, t]) => LEFTOVER.test(t));
  if (left.length) {
    signals.push({ id: "leftover", label: "Chatbot text left in the code", pts: 35, detail: left.slice(0, 3).map(([f, t]) => `${f}: “${(t.match(LEFTOVER) || [""])[0]}”`).join(" · ") });
    for (const [f] of left.slice(0, 2)) parts.push({ where: f, why: "chatbot sentence in the file" });
  }
  // 2. comments that explain every step, JSDoc on every function, emoji in the logs
  const js = code.filter(([f]) => /\.(js|jsx|ts|tsx|php|py|vue)$/i.test(f));
  const explained = js.reduce((n, [, t]) => n + (t.match(EXPLAINED) || []).length, 0);
  const jsdoc = js.reduce((n, [, t]) => n + (t.match(JSDOC) || []).length, 0);
  const emoji = js.reduce((n, [, t]) => n + (t.match(EMOJI) || []).length, 0);
  if (explained >= 3) signals.push({ id: "explained", label: "Comments that narrate every step", pts: 8, detail: `${explained} comments like “// Helper function…”, “// Handle the…”, “// Step 1:”` });
  if (jsdoc >= 3) signals.push({ id: "jsdoc", label: "JSDoc on most functions", pts: 10, detail: `${jsdoc} documentation blocks with @param / @returns` });
  if (emoji >= 2) signals.push({ id: "emoji", label: "Emoji in logs and comments", pts: 5, detail: `${emoji} times` });
  // 3. comments in English in a French class (or the other way round), when most of them are
  const comments = js.flatMap(([, t]) => commentsOf(t));
  if (comments.length >= 6) {
    const en = comments.filter((c) => EN.test(c) && !FR.test(c)).length, fr = comments.filter((c) => FR.test(c)).length;
    if (o.lang === "fr" && en / comments.length >= 0.7) signals.push({ id: "english", label: "Comments in English", pts: 8, detail: `${en} of ${comments.length} comments are in English, in a French-speaking class` });
    if (o.lang === "en" && fr / comments.length >= 0.7) signals.push({ id: "english", label: "Comments in another language", pts: 6, detail: `${fr} of ${comments.length} comments are in French` });
  }
  // 4. techniques the programme hasn't named yet
  const all = js.map(([, t]) => t).join("\n");
  const outside = ADVANCED.filter(([, use, taught]) => use.test(all) && !taught.test(o.taught));
  if (outside.length) {
    signals.push({ id: "level", label: "Techniques the class hasn't seen yet", pts: Math.min(24, 6 * outside.length), detail: outside.map(([n]) => n).join(", ") });
    for (const [n, use] of outside.slice(0, 2)) { const f = js.find(([, t]) => use.test(t)); if (f) parts.push({ where: f[0], why: `uses ${n}` }); }
  }
  // 5. a file in another style than the others (indentation, quotes, semicolons)
  const styled = js.filter(([, t]) => t.split("\n").length >= 25).map(([f, t]) => {
    const lines = t.split("\n");
    const ind = lines.filter((l) => /^\t/.test(l)).length > lines.filter((l) => /^ {2}\S/.test(l)).length ? "tab" : lines.filter((l) => /^ {4}\S/.test(l)).length > lines.filter((l) => /^ {2}\S/.test(l)).length ? "4" : "2";
    const q = (t.match(/'/g) || []).length > (t.match(/"/g) || []).length ? "'" : '"';
    const code = lines.filter((l) => /[\w)\]'"`]\s*$/.test(l.trim()) && !/[{(,:]\s*$/.test(l)).length, semi = lines.filter((l) => /;\s*$/.test(l)).length;
    return { f, ind, q, semi: semi > code ? "yes" : "no" };
  });
  if (styled.length >= 3) {
    const most = (k: "ind" | "q" | "semi") => { const c: Record<string, number> = {}; for (const s of styled) c[s[k]] = (c[s[k]] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; };
    const m = { ind: most("ind"), q: most("q"), semi: most("semi") };
    const odd = styled.filter((s) => (s.ind !== m.ind ? 1 : 0) + (s.q !== m.q ? 1 : 0) + (s.semi !== m.semi ? 1 : 0) >= 2);
    if (odd.length && odd.length < styled.length / 2) {
      signals.push({ id: "style", label: "A file written in another style", pts: Math.min(16, 8 * odd.length), detail: odd.map((s) => s.f).join(", ") + " (indentation, quotes, semicolons differ from the rest)" });
      for (const s of odd.slice(0, 2)) parts.push({ where: s.f, why: "written in another style than the rest" });
    }
  }
  return { signals, parts };
}

/** The project far above what the student showed in the assessment (in class, without help). */
export function assessSignal(assessPct: number | null, briefPct: number | null): AiSignal | null {
  if (assessPct == null || briefPct == null) return null;
  if (assessPct < 55 && briefPct >= 0.7) return { id: "assess", label: "Far above the assessment", pts: assessPct < 35 ? 25 : 15, detail: `${Math.round(briefPct * 100)} % of the brief done, but ${assessPct} % in the assessment done in class without help` };
  return null;
}

/** All the signals into a level. The AI reading counts as one signal (at most 25 points). */
export function aiLevel(signals: AiSignal[]): { score: number; level: AiCheck["level"] } {
  const score = Math.min(100, signals.reduce((s, x) => s + x.pts, 0));
  return { score, level: score >= 55 ? "high" : score >= 25 ? "some" : "low" };
}
