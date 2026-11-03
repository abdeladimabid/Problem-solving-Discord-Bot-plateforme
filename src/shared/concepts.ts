// 📐 The « Fiche niveaux » (Fiche de validation des sprints): what each sprint asks, the official reference.
//   • each sprint has 12 capacities (the « concepts »: « 1. Lire et exploiter une maquette »…), each with its points
//   • and 5 level boxes (Critique → Excellent): what a learner can do at that level; each item is linked to the
//     capacities it relies on (found from the words, the teacher can change it)
// Rules (an administrative demand):
//   • every evaluation (assessment, mise en situation, debrief questions) tags each question with the capacities it
//     touches, and covers each capacity of its scope with at least 5 questions (a question may touch several)
//   • a capacity is understood when, over all the sprint's evaluations, at least 5 questions touched it and more than
//     half of them are right (correct = 1, partly = ½); the teacher may decide it in the debrief (a project, an oral)
//   • a level is reached when at least half of its items are understood, and every level below too (each level
//     includes the ones before); « Bon » is the level expected to validate the sprint
// The teacher turns off what shouldn't count (a capacity, for the class). Kept in app_settings (concepts:<guild>):
// the sprints read from the Google Doc (or pasted), else the built-in Sprint 1 and 2 of the Fiche A1.
import type { Env, GuildRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";

export const LEVELS = ["critique", "faible", "moyen", "bon", "excellent"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<Level, string> = { critique: "Critique", faible: "Faible", moyen: "Moyen", bon: "Bon", excellent: "Excellent" };
export const MIN_QUESTIONS = 5;
export interface Capacity { n: number; title: string; points: string[] }
export interface LevelItem { text: string; caps: number[] }
export interface FicheSprint { n: number; title: string; goal: string; levels: Record<Level, LevelItem[]>; caps: Capacity[] }
export interface ConceptStore {
  source: { kind: "builtin" | "doc" | "paste"; doc: string | null; at: number };
  sprints: FicheSprint[];
  /** capacities turned off by the teacher (not asked, not counted): ["S1.11", …] */
  off: string[];
  /** level items linked by hand: "S1.bon.3" → [2, 7] */
  links?: Record<string, number[]>;
}
export class ConceptError extends Error {}

/** « S2.3 » → { sprint: 2, n: 3 }. */
export const codeOf = (sprint: number, n: number) => `S${sprint}.${n}`;
export function parseCode(c: unknown): { sprint: number; n: number } | null {
  const m = /^S(\d{1,2})[.\-_ ]?(?:C|K)?(\d{1,2})$/i.exec(String(c ?? "").trim());
  return m ? { sprint: Number(m[1]), n: Number(m[2]) } : null;
}
const normCode = (c: unknown) => { const p = parseCode(c); return p ? codeOf(p.sprint, p.n) : null; };

// ------------------------------------------------------------------ reading the Fiche
const norm = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const clean = (s: string) => String(s || "").replace(/[ \t]+/g, " ").replace(/^[\s|+*•●○▪◦·–—-]+/, "").replace(/[\s|]+$/, "").replace(/\s+/g, " ").trim();
const STOP = new Set("les des une un la le de du et en au aux pour avec sur dans par selon son sa ses leur leurs qui que est sont etre faire avoir lorsque cela plus moins tres bien une ou ne pas sans entre afin dont ces cette ce cet l d a".split(" "));
const words = (s: string) => new Set(norm(s).replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(s|x)$/, "")));

/**
 * The text of the Fiche (the Google Doc as text, or pasted) → its sprints. Line by line: « FICHE DE VALIDATION DU
 * SPRINT n », the title « Sprint n … — … », the level boxes (CRITIQUE … EXCELLENT, then their items), « Détail des
 * capacités » (« 1. title », then its points), until « Synthèse ».
 */
export function parseFiche(text: string, raw = false): { sprints: FicheSprint[]; problems: string[] } {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map(clean).filter((l) => l && !/^[=+\-|_ ]+$/.test(l));
  const sprints: FicheSprint[] = [];
  let sp: FicheSprint | null = null, mode: "head" | "level" | "caps" | "end" = "head", level: Level | null = null, cap: Capacity | null = null;
  const newSprint = (n: number) => { sp = { n, title: "", goal: "", levels: { critique: [], faible: [], moyen: [], bon: [], excellent: [] }, caps: [] }; sprints.push(sp); mode = "head"; level = null; cap = null; };
  for (const raw of lines) {
    const l = raw, t = norm(l).trim();
    const fiche = /fiche de validation du sprint\s*(\d+)/.exec(t);
    if (fiche) { newSprint(Number(fiche[1])); continue; }
    const title = /^sprint\s*(\d+)\b[^—–-]*[—–-]\s*(.+)$/i.exec(l.normalize("NFC"));
    if (title && (!sp || (sp as FicheSprint).n !== Number(title[1]) || !(sp as FicheSprint).title)) {
      if (!sp || (sp as FicheSprint).n !== Number(title[1])) newSprint(Number(title[1]));
      (sp as unknown as FicheSprint).title = clean(title[2]); continue;
    }
    if (!sp) continue;
    const S = sp as FicheSprint;
    if (/^finalite du sprint/.test(t)) { S.goal = clean(l.replace(/^[^.:]*[.:]\s*/, "")); continue; }
    const lv = LEVELS.find((x) => t === x || t === x + " :" || t === `niveau ${x}`);
    if (lv && mode !== "caps") { mode = "level"; level = lv; continue; }
    if (/^detail des capacites/.test(t)) { mode = "caps"; level = null; continue; }
    if (/^synthese de validation|^chaine de realisation|^socle indispensable/.test(t)) { mode = "end"; cap = null; continue; }
    if (/^lecture de la grille|^regle\s*:|^ce que l.apprenant sait faire|^duree\s*:|^production attendue|^cette partie constitue|^fiche de validation pedagogique/.test(t)) {
      if (/^lecture de la grille/.test(t)) { mode = "head"; level = null; }
      continue;
    }
    if (mode === "level" && level) { S.levels[level].push({ text: l, caps: [] }); continue; }
    if (mode === "caps") {
      const m = /^(\d{1,2})\s*[.)]\s*(.+)$/.exec(l);
      if (m && Number(m[1]) === S.caps.length + 1) { cap = { n: Number(m[1]), title: clean(m[2]), points: [] }; S.caps.push(cap); continue; }
      if (cap) cap.points.push(l);
    }
  }
  const problems: string[] = [];
  if (!sprints.length) problems.push("No « FICHE DE VALIDATION DU SPRINT n » found in this text.");
  for (const s of sprints) {
    if (!s.caps.length) problems.push(`Sprint ${s.n}: no capacity found under « Détail des capacités attendues ».`);
    const empty = LEVELS.filter((x) => !s.levels[x].length);
    if (empty.length) problems.push(`Sprint ${s.n}: no item under ${empty.map((x) => LEVEL_LABEL[x]).join(", ")}.`);
    if (!raw) linkLevels(s);
  }
  return { sprints: sprints.filter((s) => s.caps.length), problems };
}

/** Each item of the level boxes → the capacities it relies on (the most shared words with the capacity and its points). */
export function linkLevels(s: FicheSprint, hand: Record<string, number[]> = {}) {
  const capWords = s.caps.map((c) => ({ n: c.n, title: words(c.title), all: words([c.title, ...c.points].join(" ")) }));
  for (const lv of LEVELS) s.levels[lv].forEach((it, i) => {
    // linked by the teacher (Settings), else by the Fiche A1's own links (checked by hand), else from the words
    const h = hand[`S${s.n}.${lv}.${i + 1}`] ?? builtinLinks()[textKey(s.n, it.text)];
    if (h?.length) { it.caps = h.filter((n) => s.caps.some((c) => c.n === n)); return; }
    const w = words(it.text);
    const sc = capWords.map((c) => { let x = 0; for (const k of w) { if (c.title.has(k)) x += 2; else if (c.all.has(k)) x += 1; } return { n: c.n, x }; }).sort((a, b) => b.x - a.x);
    const top = sc[0]?.x ?? 0;
    it.caps = top ? sc.filter((c) => c.x >= Math.max(2, top * 0.75)).slice(0, 3).map((c) => c.n) : [];
    if (!it.caps.length && top) it.caps = [sc[0].n];
  });
}

const textKey = (n: number, text: string) => `S${n}|${norm(text).replace(/[^a-z0-9]+/g, " ").trim()}`;
// the links of the Fiche A1 (Sprint 1 and 2), checked by hand: each level item → its capacities, in the Fiche's order
const A1_LINKS: Record<number, Record<Level, number[][]>> = {
  1: { critique: [[2], [2], [4], [4], [10], [10]], faible: [[2], [3], [4], [5], [1], [10], [11], [9]],
    moyen: [[1], [2], [3], [4], [5], [6], [6], [8], [7], [10], [11]], bon: [[1], [2], [3, 7], [7], [5], [6], [6, 9], [8], [12], [9], [10], [11]],
    excellent: [[1], [6], [6], [2, 7], [8, 12], [8], [5, 8], [7], [10], [11]] },
  2: { critique: [[1], [2], [3], [5], [10], [11]], faible: [[1], [2], [3], [5], [6], [8], [8], [11], [12]],
    moyen: [[2], [1], [2, 10], [3], [4], [6], [7], [8], [9], [11], [12]], bon: [[2], [1, 2], [3], [4], [3], [6], [7], [8], [9], [9, 10], [11], [12]],
    excellent: [[3, 10], [1, 2], [4], [6], [9, 10], [9], [8], [2, 3, 6], [11], [12]] },
};
let A1_CACHE: Record<string, number[]> | null = null;
function builtinLinks(): Record<string, number[]> {
  if (A1_CACHE) return A1_CACHE;
  A1_CACHE = {};
  const r = parseFiche(BUILTIN_FICHE, true);
  for (const sp of r.sprints) for (const lv of LEVELS) sp.levels[lv].forEach((it, i) => { const l = A1_LINKS[sp.n]?.[lv]?.[i]; if (l) A1_CACHE![textKey(sp.n, it.text)] = l; });
  return A1_CACHE;
}

// ------------------------------------------------------------------ the class's concepts
const KEY = (gid: string) => `concepts:${gid}`;
export async function getConcepts(env: Env, gid: string): Promise<ConceptStore> {
  const r = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", KEY(gid)).catch(() => null);
  try {
    const v = r ? JSON.parse(r.v) : null;
    if (v && Array.isArray(v.sprints)) return { source: v.source ?? { kind: "builtin", doc: null, at: 0 }, sprints: v.sprints, off: Array.isArray(v.off) ? v.off : [], links: v.links ?? {} };
  } catch { /* the built-in one */ }
  const b = parseFiche(BUILTIN_FICHE);
  return { source: { kind: "builtin", doc: null, at: 0 }, sprints: b.sprints, off: [], links: {} };
}
async function putConcepts(env: Env, gid: string, s: ConceptStore) {
  await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", KEY(gid), JSON.stringify(s), now());
}
export const sprintOf = (s: ConceptStore, n: number | null | undefined) => (n ? s.sprints.find((x) => x.n === n) ?? null : null);
export const isOff = (s: ConceptStore, code: string) => s.off.includes(code);
/** The capacities of a sprint that count (not turned off). */
export function activeCaps(s: ConceptStore, n: number | null | undefined): (Capacity & { code: string })[] {
  const sp = sprintOf(s, n);
  return sp ? sp.caps.map((c) => ({ ...c, code: codeOf(sp.n, c.n) })).filter((c) => !isOff(s, c.code)) : [];
}
export function capOf(s: ConceptStore, code: string): (Capacity & { code: string; sprint: number }) | null {
  const p = parseCode(code);
  const c = p ? sprintOf(s, p.sprint)?.caps.find((x) => x.n === p.n) : null;
  return c && p ? { ...c, code: codeOf(p.sprint, p.n), sprint: p.sprint } : null;
}
export const capLabel = (s: ConceptStore, code: string) => { const c = capOf(s, code); return c ? `${c.code} ${c.title}` : code; };

/** What the teacher sees and changes (Settings → Fiche niveaux). */
export async function conceptsView(env: Env, g: GuildRow) {
  const s = await getConcepts(env, g.id);
  return { source: s.source, off: s.off, min: MIN_QUESTIONS, sprints: s.sprints.map((sp) => ({ ...sp, caps: sp.caps.map((c) => ({ ...c, code: codeOf(sp.n, c.n), off: isOff(s, codeOf(sp.n, c.n)) })) })) };
}
/** Turn capacities on or off (« S1.11 »: false = not asked, not counted), or link a level item to capacities by hand. */
export async function saveConceptChoices(env: Env, g: GuildRow, b: { off?: Record<string, boolean>; link?: { key: string; caps: number[] } }) {
  const s = await getConcepts(env, g.id);
  for (const [code, on] of Object.entries(b.off ?? {})) {
    const c = normCode(code);
    if (!c || !capOf(s, c)) continue;
    s.off = on ? s.off.filter((x) => x !== c) : [...new Set([...s.off, c])];
  }
  if (b.link && /^S\d+\.(critique|faible|moyen|bon|excellent)\.\d+$/.test(b.link.key)) {
    s.links = { ...(s.links ?? {}), [b.link.key]: (b.link.caps ?? []).map(Number).filter((n) => n > 0) };
    const sp = sprintOf(s, Number(b.link.key.slice(1).split(".")[0]));
    if (sp) linkLevels(sp, s.links);
  }
  await putConcepts(env, g.id, s);
  return conceptsView(env, g);
}
/** New text of the Fiche (pasted, or read from the Google Doc): the sprints it has replace the same sprints; the others stay. */
export async function importFiche(env: Env, g: GuildRow, text: string, src: { kind: "doc" | "paste"; doc: string | null }) {
  const r = parseFiche(text);
  if (!r.sprints.length) throw new ConceptError(r.problems[0] ?? "Nothing could be read in this Fiche.");
  const s = await getConcepts(env, g.id);
  const byN = new Map(s.sprints.map((x) => [x.n, x]));
  for (const sp of r.sprints) { linkLevels(sp, s.links ?? {}); byN.set(sp.n, sp); }
  s.sprints = [...byN.values()].sort((a, b) => a.n - b.n);
  s.source = { kind: src.kind, doc: src.doc, at: now() };
  await putConcepts(env, g.id, s);
  return { ...(await conceptsView(env, g)), read: r.sprints.map((x) => ({ n: x.n, caps: x.caps.length, items: LEVELS.reduce((a, l) => a + x.levels[l].length, 0) })), problems: r.problems };
}
/** The id of a Google Doc from its link. */
export function docIdOf(url: string): string {
  const m = String(url || "").match(/\/document\/d\/([\w-]{20,})/) || String(url || "").trim().match(/^([\w-]{30,})$/);
  if (!m) throw new ConceptError("Paste the link of the Google Doc (https://docs.google.com/document/d/…).");
  return m[1];
}
/** A Google Doc as text: shared « anyone with the link » (no key), else through the class's Google service account. */
export async function readGoogleDoc(env: Env, id: string, token?: () => Promise<string>): Promise<string> {
  const pub = await fetch(`https://docs.google.com/document/d/${id}/export?format=txt`, { redirect: "follow" }).catch(() => null);
  if (pub && pub.ok && !/text\/html/.test(pub.headers.get("content-type") || "")) { const t = await pub.text(); if (/fiche de validation|sprint/i.test(t)) return t; }
  if (!token) throw new ConceptError("ClassBot can't open this Google Doc: share it as « Anyone with the link: Viewer », or with the Google service account (Settings → Google Sheet) as Viewer.");
  const tok = await token();
  const r = await fetch(`https://docs.googleapis.com/v1/documents/${id}?includeTabsContent=true`, { headers: { authorization: `Bearer ${tok}` } });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new ConceptError(r.status === 403 || r.status === 404 ? "ClassBot can't open this Google Doc: share it as « Anyone with the link: Viewer », or with the Google service account's email as Viewer (and turn on the « Google Docs API » in its Google Cloud project)." : `Google Docs: ${j?.error?.message || r.status}`);
  return docJsonText(j);
}
/** The text of a Google Docs API document (every tab, paragraphs and tables, one line per paragraph). */
export function docJsonText(doc: any): string {
  const out: string[] = [];
  const walk = (content: any[]) => {
    for (const el of content || []) {
      if (el.paragraph) out.push((el.paragraph.elements || []).map((e: any) => e.textRun?.content ?? "").join("").replace(/\n$/, ""));
      else if (el.table) for (const row of el.table.tableRows || []) for (const cell of row.tableCells || []) walk(cell.content);
      else if (el.tableOfContents) walk(el.tableOfContents.content);
    }
  };
  const tabs = (t: any[]) => { for (const x of t || []) { walk(x.documentTab?.body?.content); tabs(x.childTabs); } };
  if (Array.isArray(doc?.tabs) && doc.tabs.length) tabs(doc.tabs); else walk(doc?.body?.content);
  return out.join("\n");
}

// ------------------------------------------------------------------ in the evaluations
/**
 * The sprint and the capacities to cover for an evaluation: its brief (its sprint, its text), else a programme week,
 * else the topic and today's sprint. What the teacher then sees ticked (and changes).
 */
export async function suggestScope(env: Env, g: GuildRow, b: { brief_id?: unknown; week?: unknown; sprint?: unknown; text?: unknown; limit?: unknown }) {
  const { programOf, weekAt } = await import("./program.ts");
  const s = await getConcepts(env, g.id);
  const p = await programOf(env, g);
  let sprint = Number(b.sprint) || null, text = String(b.text ?? "");
  if (b.brief_id) {
    const r = await one<{ sprint: number | null; week: number | null; title: string; data: string | null }>(env, "SELECT sprint, week, title, data FROM briefs WHERE id = ? AND guild_id = ?", Number(b.brief_id), g.id).catch(() => null);
    if (r) {
      sprint = sprint || r.sprint || p.weeks.find((w) => w.n === r.week)?.sprint || null;
      let d: any = {};
      try { d = JSON.parse(r.data || "{}"); } catch { d = {}; }
      text = `${text}\n${r.title}\n${[d.summary, d.context, ...(Array.isArray(d.groups) ? d.groups.flatMap((x: any) => [x?.title, ...(Array.isArray(x?.stories) ? x.stories : [])]) : []), ...(Array.isArray(d.deliverables) ? d.deliverables : []), ...(Array.isArray(d.criteria) ? d.criteria : [])].filter(Boolean).join("\n")}`;
    }
  }
  if (b.week) { const w = p.weeks.find((x) => x.n === Number(b.week)); sprint = sprint || w?.sprint || null; if (w) text += `\n${w.title}\n${w.objective}\n${w.concepts}\n${w.deliverables}`; }
  if (!sprint) sprint = weekAt(p, new Date().toISOString().slice(0, 10))?.sprint ?? null;
  // the Fiche has no such sprint (Sprint 3 not written yet…): the last one it has before it
  const has = s.sprints.map((x) => x.n);
  const fiche = sprint && has.includes(sprint) ? sprint : null;
  return {
    sprint: fiche, programmeSprint: sprint, sprints: s.sprints.map((x) => ({ n: x.n, title: x.title })), min: MIN_QUESTIONS,
    caps: fiche ? activeCaps(s, fiche).map((c) => ({ code: c.code, title: c.title, points: c.points })) : [],
    scope: fiche ? scopeFromText(s, fiche, text, Math.max(1, Math.min(12, Number(b.limit) || 12))) : [],
  };
}
/** The capacities an evaluation should cover, from its text (a brief, a week, a topic): the ones its words point to. */
export function scopeFromText(s: ConceptStore, sprintN: number | null | undefined, text: string, limit = 12): string[] {
  const caps = activeCaps(s, sprintN);
  if (!caps.length) return [];
  const w = words(text);
  if (!w.size) return caps.map((c) => c.code);
  const hit = caps.map((c) => { const cw = words([c.title, ...c.points].join(" ")); let x = 0; for (const k of w) if (cw.has(k)) x++; return { code: c.code, x }; });
  const top = Math.max(...hit.map((h) => h.x));
  const picked = hit.filter((h) => h.x >= Math.max(2, top * 0.4)).sort((a, b) => b.x - a.x).slice(0, limit).map((h) => h.code);
  return picked.length ? picked.sort((a, b) => Number(a.split(".")[1]) - Number(b.split(".")[1])) : caps.slice(0, limit).map((c) => c.code);
}
/** The block of the AI prompts (and the prompts for Claude): the capacities to cover and the rules. */
export function conceptsPrompt(s: ConceptStore, scope: string[], o: { per?: string; lang?: "fr" | "en" } = {}): string {
  const caps = scope.map((c) => capOf(s, c)).filter((c): c is NonNullable<ReturnType<typeof capOf>> => !!c && !isOff(s, c.code));
  if (!caps.length) return "";
  const per = o.per ?? "question";
  return [
    `CONCEPTS OBLIGATOIRES (Fiche de validation du sprint, exigence administrative) : chaque ${per} porte "concepts", la liste des codes des capacités qu'elle travaille VRAIMENT (un ${per} peut en toucher une ou plusieurs).`,
    `Chacune de ces capacités doit être touchée par AU MOINS ${MIN_QUESTIONS} ${per}s différentes ; une capacité est considérée comme comprise quand plus de la moitié des ${per}s qui la touchent sont réussies (au moins 3 sur 5).`,
    "Les capacités, avec ce qu'elles recouvrent :",
    ...caps.map((c) => `- ${c.code} « ${c.title} » : ${c.points.join(" ; ")}`),
    "Les capacités pratiques (Git, GitHub, Jira, maquette, DevTools, organisation du projet) sont aussi évaluées par des questions concrètes (commande à choisir, étape à ordonner, problème à diagnostiquer, capture ou extrait à lire).",
    `N'utilise QUE ces codes (exactement : ${caps.map((c) => c.code).join(", ")}).`,
  ].join("\n");
}
/** How many questions touch each capacity of the scope, and the ones under the minimum. */
export function coverage(items: { concepts?: string[] }[], scope: string[]) {
  const count: Record<string, number> = Object.fromEntries(scope.map((c) => [c, 0]));
  for (const it of items) for (const c of new Set((it.concepts ?? []).map(normCode).filter(Boolean) as string[])) if (c in count) count[c]++;
  return { count, missing: Object.entries(count).filter(([, n]) => n < MIN_QUESTIONS).map(([c, n]) => ({ code: c, n, need: MIN_QUESTIONS - n })) };
}
/** The concept codes of an item, cleaned: known codes only, the ones turned off left out. */
export function cleanConcepts(s: ConceptStore, v: unknown): string[] {
  return [...new Set((Array.isArray(v) ? v : String(v ?? "").split(/[,;\s]+/)).map(normCode).filter((c): c is string => !!c && !!capOf(s, c) && !isOff(s, c)))].slice(0, 6);
}
/**
 * The plan of an assessment: n questions, each with 1 or 2 capacities, so that every capacity of the scope gets at
 * least 5. When n is too small for that, n grows (the minimum always wins); returns the plan's capacities per question.
 */
export function planConcepts(scope: string[], n: number, perQuestion = 2): string[][] {
  if (!scope.length) return Array.from({ length: n }, () => []);
  const need = Math.ceil((scope.length * MIN_QUESTIONS) / perQuestion);
  const total = Math.max(n, need);
  const out: string[][] = Array.from({ length: total }, () => []);
  // round robin: capacity k goes to slots k, k+K, k+2K… until each has its 5, then the second place of each question
  let slot = 0;
  for (let r = 0; r < MIN_QUESTIONS; r++) for (const c of scope) { while (out[slot % total].length >= perQuestion || out[slot % total].includes(c)) slot++; out[slot % total].push(c); slot++; }
  // questions left without a capacity: the least covered ones
  const cnt = (c: string) => out.filter((q) => q.includes(c)).length;
  for (const q of out) if (!q.length) q.push([...scope].sort((a, b) => cnt(a) - cnt(b))[0]);
  return out;
}

// ------------------------------------------------------------------ mastery: what each learner understood
export interface Evidence { code: string; got: number; from: "assessment" | "mise" | "oral"; ref: string; at: number; label: string }
export interface CapState { code: string; title: string; asked: number; got: number; pct: number | null; state: "ok" | "ko" | "few"; teacher: boolean | null; final: "ok" | "ko" | "few"; evidence: Evidence[] }
/**
 * Every question that touched a capacity of a sprint, for one learner: the assessments (correct = 1, partly = ½), the
 * mises en situation (the item's score), the debrief's oral questions (✓ = 1); the teacher's decision wins.
 */
export async function evidenceOf(env: Env, gid: string, uid: string, s: ConceptStore, sprintN: number, o: { live?: { briefId: number } } = {}): Promise<Evidence[]> {
  const pre = `S${sprintN}.`;
  const ev: Evidence[] = [];
  const hasPre = (list: unknown) => Array.isArray(list) && list.some((c) => String(c).startsWith(pre));
  // assessments
  const ass = await all<{ id: number; title: string; questions: string; grades: string | null; submitted_at: number | null; status: string }>(env,
    `SELECT a.id, a.title, a.questions, t.grades, t.submitted_at, t.status FROM assessment_takers t JOIN assessments a ON a.id = t.assessment_id
     WHERE a.guild_id = ? AND t.discord_id = ? AND t.status IN ('submitted', 'graded') AND a.questions LIKE ?`, gid, uid, `%"${pre}%`).catch(() => []);
  for (const a of ass) {
    let qs: any[] = [], gr: Record<string, any> = {};
    try { qs = JSON.parse(a.questions || "[]"); } catch { qs = []; }
    try { gr = JSON.parse(a.grades || "{}") || {}; } catch { gr = {}; }
    qs.forEach((q, i) => {
      if (!hasPre(q?.concepts)) return;
      const g = gr[q.id];
      if (!g || g.pending) return;   // not graded yet: not counted
      const got = g.verdict === "correct" ? 1 : g.verdict === "partial" ? 0.5 : 0;
      for (const c of cleanConcepts(s, q.concepts)) if (c.startsWith(pre)) ev.push({ code: c, got, from: "assessment", ref: `a${a.id}:${q.id}`, at: a.submitted_at ?? 0, label: `${a.title} · Q${i + 1}` });
    });
  }
  // mises en situation (the score of each item: QCM 0 or 100, situations 0…100)
  const mis = await all<{ id: number; title: string; content: string; grades: string | null; answers: string | null; checks: string | null; submitted_at: number | null }>(env,
    `SELECT m.id, m.title, m.content, t.grades, t.answers, t.checks, t.submitted_at FROM mise_takers t JOIN mises m ON m.id = t.mise_id
     WHERE m.guild_id = ? AND t.discord_id = ? AND t.status = 'submitted' AND m.content LIKE ?`, gid, uid, `%"${pre}%`).catch(() => []);
  if (mis.length) {
    const { scoreMise } = await import("./mises.ts");
    for (const m of mis) {
      let c: any = null;
      try { c = JSON.parse(m.content); } catch { c = null; }
      if (!c) continue;
      const parse = (x: string | null) => { try { return x ? JSON.parse(x) : {}; } catch { return {}; } };
      const sc = scoreMise(c, { answers: parse(m.answers), checks: parse(m.checks), grades: parse(m.grades) });
      const items = [...(c.situations || []).map((x: any, i: number) => ({ x, label: `Situation ${i + 1}` })), ...(c.qcm || []).map((x: any, i: number) => ({ x, label: `QCM ${i + 1}` }))];
      for (const { x, label } of items) {
        if (!hasPre(x?.concepts)) continue;
        const it = sc.items[x.id];
        if (!it || it.score == null) continue;   // still to grade: not counted
        for (const code of cleanConcepts(s, x.concepts)) if (code.startsWith(pre)) ev.push({ code, got: Math.max(0, Math.min(1, it.score / 100)), from: "mise", ref: `m${m.id}:${x.id}`, at: m.submitted_at ?? 0, label: `${m.title} · ${label}` });
      }
    }
  }
  // the oral questions of the learner's debriefs (each tagged with a capacity): counted once the debrief is finalized,
  // or the debrief being done right now (its switches as they are)
  const revs = await all<{ brief_id: number; record: string; status: string; updated_at: number | null }>(env,
    "SELECT brief_id, record, status, updated_at FROM brief_reviews WHERE guild_id = ? AND who = ? AND record LIKE ?", gid, `u:${uid}`, `%"${pre}%`).catch(() => []);
  if (revs.length) {
    const { reviewStates } = await import("./review/engine.ts");
    for (const r of revs) {
      if (r.status !== "final" && !(o.live && o.live.briefId === r.brief_id)) continue;
      let rec: any = null;
      try { rec = JSON.parse(r.record); } catch { rec = null; }
      const oral: any[] = Array.isArray(rec?.oral) ? rec.oral : [];
      if (!oral.length) continue;
      const st = reviewStates(rec);
      oral.forEach((q, i) => { for (const c of cleanConcepts(s, q?.concepts)) if (c.startsWith(pre)) ev.push({ code: c, got: st.oral[i] ? 1 : 0, from: "oral", ref: `b${r.brief_id}:o${i}`, at: r.updated_at ?? 0, label: `Oral : ${String(q.q || "").slice(0, 80)}` }); });
    }
  }
  return ev.filter((e) => !isOff(s, e.code));
}
/** Each capacity of the sprint: asked, right, understood (≥ 5 asked and more than half right), the teacher's decision. */
export async function masteryOf(env: Env, gid: string, uid: string, sprintN: number, s?: ConceptStore, o: { live?: { briefId: number } } = {}): Promise<{ caps: CapState[]; level: ReturnType<typeof levelFrom> }> {
  const S = s ?? (await getConcepts(env, gid));
  const ev = await evidenceOf(env, gid, uid, S, sprintN, o);
  const dec = await decisionsOf(env, gid, uid);
  const caps = activeCaps(S, sprintN).map((c) => {
    const e = ev.filter((x) => x.code === c.code);
    const asked = e.length, got = Math.round(e.reduce((a, x) => a + x.got, 0) * 10) / 10;
    const state: CapState["state"] = asked < MIN_QUESTIONS ? "few" : got / asked > 0.5 ? "ok" : "ko";
    const teacher = dec[c.code] ?? null;
    return { code: c.code, title: c.title, asked, got, pct: asked ? Math.round((100 * got) / asked) : null, state, teacher, final: teacher == null ? state : teacher ? "ok" : "ko", evidence: e } as CapState;
  });
  return { caps, level: levelFrom(S, sprintN, caps) };
}
/**
 * The level from the capacities understood: each item of a level box is understood when its capacities are; a level
 * is reached when at least half of its items are, and every level below too. Unknown (too few questions): not reached.
 */
export function levelFrom(s: ConceptStore, sprintN: number, caps: Pick<CapState, "code" | "final">[]) {
  const sp = sprintOf(s, sprintN);
  const ok = new Map(caps.map((c) => [c.code, c.final]));
  const per = LEVELS.map((lv) => {
    const items = (sp?.levels[lv] ?? []).map((it) => ({ text: it.text, caps: it.caps.map((n) => codeOf(sprintN, n)).filter((c) => ok.has(c)) })).filter((it) => it.caps.length);
    const understood = items.filter((it) => it.caps.every((c) => ok.get(c) === "ok")).length;
    const unknown = items.filter((it) => it.caps.some((c) => ok.get(c) === "few")).length;
    return { level: lv, items: items.length, understood, unknown, pct: items.length ? Math.round((100 * understood) / items.length) : null };
  });
  let reached: Level | null = null;
  for (const p of per) { if (p.items && p.understood * 2 >= p.items) reached = p.level; else if (p.items) break; }
  const known = caps.some((c) => c.final !== "few");
  return { reached: known ? reached ?? "critique" : null, per };
}

/** The sprint of the Fiche a brief belongs to (its sprint, else its week's), or null when the Fiche hasn't it. */
export async function briefSprint(env: Env, g: GuildRow, briefId: number, s?: ConceptStore): Promise<number | null> {
  const S = s ?? (await getConcepts(env, g.id));
  const r = await one<{ sprint: number | null; week: number | null }>(env, "SELECT sprint, week FROM briefs WHERE id = ? AND guild_id = ?", briefId, g.id).catch(() => null);
  if (!r) return null;
  let n = r.sprint ?? null;
  if (!n && r.week) { const { programOf } = await import("./program.ts"); n = (await programOf(env, g)).weeks.find((w) => w.n === r.week)?.sprint ?? null; }
  return n && sprintOf(S, n) ? n : null;
}
/** For the AI that proposes a level: what the Fiche says about this learner (capacities, the level it gives). */
export function masteryForAi(sprintN: number, m: { caps: CapState[]; level: ReturnType<typeof levelFrom> }): string {
  const ok = m.caps.filter((c) => c.final === "ok"), ko = m.caps.filter((c) => c.final === "ko"), few = m.caps.filter((c) => c.final === "few");
  return [`FICHE NIVEAUX DU SPRINT ${sprintN} (référence officielle) : ${ok.length}/${m.caps.length} capacités comprises (au moins ${MIN_QUESTIONS} questions, plus de la moitié réussies)`,
    ok.length ? `- comprises : ${ok.map((c) => `${c.code} ${c.title}`).join(" ; ")}` : "",
    ko.length ? `- pas comprises : ${ko.map((c) => `${c.code} ${c.title} (${c.got}/${c.asked})`).join(" ; ")}` : "",
    few.length ? `- pas assez évaluées (moins de ${MIN_QUESTIONS} questions) : ${few.map((c) => `${c.code} (${c.asked})`).join(" ; ")}` : "",
    m.level.reached ? `- NIVEAU SELON LA FICHE (au moins la moitié des éléments de chaque niveau, jusqu'à celui-ci) : ${LEVEL_LABEL[m.level.reached]}` : "- niveau selon la Fiche : pas encore assez de questions pour le dire",
  ].filter(Boolean).join("\n");
}

// the teacher's decisions on capacities (app_settings, per learner)
const DKEY = (gid: string, uid: string) => `concept:dec:${gid}:${uid}`;
async function readJsonKey<T>(env: Env, k: string, d: T): Promise<T> { const r = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", k).catch(() => null); try { return r ? JSON.parse(r.v) ?? d : d; } catch { return d; } }
async function writeJsonKey(env: Env, k: string, v: unknown) { await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", k, JSON.stringify(v), now()); }
export async function decisionsOf(env: Env, gid: string, uid: string): Promise<Record<string, boolean>> { return readJsonKey(env, DKEY(gid, uid), {}); }
/** The teacher decides a capacity (from the project, an oral…): true / false, or null to follow the questions again. */
export async function decideCapacity(env: Env, g: GuildRow, uid: string, code: string, ok: boolean | null) {
  const c = normCode(code);
  if (!c) throw new ConceptError("Unknown capacity.");
  const d = await decisionsOf(env, g.id, uid);
  if (ok == null) delete d[c]; else d[c] = !!ok;
  await writeJsonKey(env, DKEY(g.id, uid), d);
}
// ------------------------------------------------------------------ the built-in Fiche (Sprint 1 and 2 of the A1)
export const BUILTIN_FICHE = `
FICHE DE VALIDATION DU SPRINT 1
Sprint 1 A1 — Conception des interfaces Web modernes et responsives
Finalité du sprint. À l’issue du sprint, l’apprenant doit être capable d’intégrer une interface Web moderne et responsive à partir d’une maquette, en mobilisant HTML5, CSS3, Flexbox, CSS Grid, Tailwind CSS, les principes d’accessibilité, ainsi qu’un workflow de versionnement et d’organisation de projet avec Git/GitHub et Jira.
Durée : 2 semaines.
Lecture de la grille de niveaux
Règle : chaque niveau inclut les acquis des niveaux précédents. Le carré indique uniquement les capacités acquises à ce niveau. Tout élément placé dans un niveau supérieur est considéré comme non encore maîtrisé. Le niveau Bon correspond au niveau attendu pour valider le sprint.
CRITIQUE
Ce que l’apprenant sait faire à ce niveau
- Créer une page HTML simple avec les balises de base.
- Ajouter du texte, des liens, des images et quelques éléments de contenu.
- Appliquer quelques styles CSS simples : couleur, taille, marge ou fond.
- Utiliser un sélecteur CSS simple.
- Créer un dépôt Git local ou cloner un projet avec accompagnement.
- Faire un premier commit avec accompagnement.
FAIBLE
Ce que l’apprenant sait faire à ce niveau
- Structurer une page avec des balises HTML5 courantes.
- Créer un formulaire simple avec différents types de champs.
- Utiliser les sélecteurs CSS, le box model et les unités principales.
- Créer une mise en page simple avec Flexbox.
- Lire les grandes zones d’une maquette ou d’un wireframe.
- Faire des commit et push réguliers sur GitHub.
- Créer et suivre quelques tâches dans Jira ou GitHub Projects.
- Utiliser les DevTools pour inspecter un élément et tester une règle CSS.
MOYEN
Ce que l’apprenant sait faire à ce niveau
- Lire une maquette Figma simple et identifier les zones, composants et espacements principaux.
- Structurer une page avec header, nav, main, section, article et footer de manière cohérente.
- Créer des formulaires structurés avec labels associés aux champs.
- Utiliser correctement cascade, sélecteurs, box model, unités et variables CSS.
- Utiliser Flexbox et CSS Grid sur des mises en page simples.
- Appliquer une logique mobile-first et créer des media queries.
- Adapter l’interface sur mobile, tablette et desktop.
- Utiliser Tailwind CSS avec des classes utilitaires courantes.
- Appliquer quelques règles d’accessibilité et de SEO de base.
- Créer et utiliser une branche Git puis fusionner des changements simples.
- Suivre l’avancement d’un travail dans Jira avec des statuts cohérents.
BON
Ce que l’apprenant sait faire à ce niveau
- Intégrer une interface fidèle à une maquette Figma en respectant structure, hiérarchie visuelle et espacements.
- Choisir une structure HTML5 sémantique adaptée au contenu.
- Créer des formulaires correctement structurés et accessibles.
- Appliquer les règles essentielles d’accessibilité et utiliser WAI-ARIA lorsque nécessaire.
- Choisir entre Flexbox et CSS Grid selon le besoin de mise en page.
- Construire une interface responsive cohérente en logique mobile-first.
- Définir des breakpoints pertinents et vérifier le rendu sur plusieurs formats d’écran.
- Utiliser Tailwind CSS de façon structurée et cohérente avec un Design System simple.
- Organiser proprement les fichiers et composants de l’interface.
- Utiliser DevTools pour corriger des problèmes de layout, responsive ou styles.
- Appliquer un GitFlow simple avec branches, commits lisibles, pull request et fusion contrôlée.
- Organiser et suivre les tâches dans Jira ou GitHub Projects de manière autonome.
EXCELLENT
Ce que l’apprenant sait faire à ce niveau
- Reproduire une maquette avec une très bonne fidélité visuelle et une intégration propre.
- Anticiper les comportements responsive avant l’intégration.
- Choisir intelligemment les breakpoints plutôt que multiplier les media queries.
- Créer une structure HTML claire, sémantique et accessible sans surcharger le balisage.
- Créer des composants visuels cohérents et réutilisables.
- Appliquer un Design System avec régularité sur l’ensemble de l’interface.
- Optimiser l’usage de Flexbox, Grid et Tailwind selon le besoin.
- Identifier et corriger de manière autonome les problèmes d’accessibilité les plus courants.
- Maintenir un workflow Git propre avec branches bien nommées, PR lisibles et historique compréhensible.
- Organiser les tickets Jira avec priorité, statut, description et suivi suffisamment précis pour faciliter le travail d’équipe.
Détail des capacités attendues
1. Lire et exploiter une maquette
- Lire une maquette Figma ou un wireframe.
- Identifier les zones principales de l’interface.
- Repérer les composants, espacements, couleurs et typographies.
- Comprendre la hiérarchie visuelle d’une page.
- Transformer une maquette en structure HTML exploitable.
2. Structurer une page avec HTML5
- Créer une structure HTML complète et valide.
- Utiliser les balises sémantiques adaptées au contenu.
- Structurer correctement header, nav, main, section, article et footer.
- Créer des liens, listes, images et contenus structurés.
- Organiser le code HTML pour qu’il reste lisible et maintenable.
3. Créer des formulaires accessibles
- Créer différents types de champs de formulaire.
- Associer correctement labels et champs.
- Utiliser les attributs HTML utiles à la saisie.
- Structurer un formulaire de façon compréhensible.
- Prendre en compte les premiers principes d’accessibilité.
4. Appliquer les fondamentaux CSS3
- Utiliser les sélecteurs CSS.
- Comprendre la cascade et la priorité des règles.
- Utiliser le box model.
- Manipuler les unités CSS adaptées.
- Créer et utiliser des variables CSS.
- Appliquer couleurs, typographies, espacements et bordures de manière cohérente.
5. Construire des mises en page avec Flexbox et Grid
- Créer une mise en page avec Flexbox.
- Aligner et répartir les éléments avec Flexbox.
- Créer une mise en page avec CSS Grid.
- Définir des colonnes et des lignes.
- Choisir entre Flexbox et Grid selon le besoin.
6. Produire une interface responsive
- Appliquer une approche mobile-first.
- Créer des media queries.
- Adapter la mise en page selon la largeur disponible.
- Tester le rendu sur mobile, tablette et desktop.
- Choisir des breakpoints cohérents.
- Éviter les débordements et ruptures de mise en page.
7. Appliquer les règles de base d’accessibilité Web
- Utiliser une structure HTML sémantique.
- Associer labels et champs de formulaire.
- Renseigner les attributs utiles aux images et éléments interactifs.
- Respecter une hiérarchie de titres cohérente.
- Utiliser WAI-ARIA lorsque la structure HTML seule ne suffit pas.
- Vérifier les problèmes d’accessibilité les plus courants.
8. Utiliser Tailwind CSS
- Installer ou configurer Tailwind CSS dans le projet.
- Utiliser les classes utilitaires.
- Créer des espacements, couleurs, typographies et mises en page avec Tailwind.
- Utiliser les classes responsive.
- Éviter l’accumulation inutile de classes.
- Respecter un Design System simple et cohérent.
9. Utiliser les DevTools
- Inspecter un élément HTML.
- Tester ou modifier une règle CSS temporairement.
- Analyser les dimensions et espacements d’un élément.
- Tester différents formats d’écran.
- Identifier un problème de layout ou de responsive.
- Corriger plus rapidement un défaut d’intégration.
10. Utiliser Git et GitHub selon un workflow simple
- Initialiser ou cloner un dépôt.
- Ajouter et valider des modifications.
- Créer des commits réguliers et compréhensibles.
- Pousser les modifications vers GitHub.
- Créer et utiliser des branches.
- Fusionner des changements de manière contrôlée.
- Créer une pull request.
- Appliquer des conventions simples de nommage et de workflow Git.
11. Organiser le travail avec Jira ou GitHub Projects
- Créer des tâches.
- Décrire clairement une tâche.
- Affecter un statut.
- Mettre à jour l’avancement.
- Suivre un tableau Kanban.
- Utiliser l’outil pour rendre visible l’organisation du travail.
12. Organiser proprement le projet
- Créer une arborescence claire.
- Séparer les fichiers HTML, CSS et autres ressources.
- Utiliser des noms de fichiers cohérents.
- Limiter les duplications.
- Conserver un code lisible et maintenable.
- Documenter les éléments importants du projet.
Synthèse de validation du sprint
Chaîne de réalisation attendue : Maquette → structure HTML5 → styles CSS → Flexbox / Grid → responsive mobile-first → accessibilité → Tailwind / Design System → vérification avec DevTools → versionnement Git/GitHub → suivi Jira → interface finalisée.
Socle indispensable pour valider : lecture de maquette, HTML sémantique, CSS, Flexbox/Grid, responsive design, accessibilité de base, Tailwind CSS, Git/GitHub et organisation du projet. Le niveau Bon correspond à un apprenant capable de transformer une maquette en interface Web moderne, responsive et exploitable de manière autonome.
Dimension Preuve attendue
Fidélité à la maquette L’interface respecte la structure, la hiérarchie visuelle et les principaux éléments de la maquette.
HTML & sémantique La structure HTML est cohérente, lisible et sémantique.
CSS & layout Les styles, Flexbox et Grid sont utilisés de manière adaptée.
Responsive L’interface fonctionne sur mobile, tablette et desktop.
Accessibilité Les règles essentielles d’accessibilité sont prises en compte.
Tailwind / Design System Les classes utilitaires sont utilisées de manière structurée et cohérente.
Git / GitHub Le projet est versionné avec des commits lisibles, branches et PR simples.
Organisation projet Les tâches sont suivies dans Jira ou GitHub Projects et l’arborescence reste propre.
Fiche de validation pédagogique — Sprint 1 A1 / Conception d’interfaces Web modernes et responsives
FICHE DE VALIDATION DU SPRINT 2
Sprint 2 A1 — Développement d’interfaces dynamiques avec JavaScript moderne
Finalité du sprint. À l’issue du sprint, l’apprenant doit être capable de développer les interactions et fonctionnalités dynamiques d’une interface Web en manipulant le DOM, en gérant les événements et les formulaires côté client, et en structurant son code avec les fonctionnalités modernes de JavaScript ES6+ et les modules ES.
Durée : 3 semaines.
Production attendue : Développer les interactions et fonctionnalités dynamiques d’une interface Web.
Lecture de la grille de niveaux
Règle : chaque niveau inclut les acquis des niveaux précédents. Le carré indique uniquement les capacités acquises à ce niveau. Tout élément placé dans un niveau supérieur est considéré comme non encore maîtrisé. Le niveau Bon correspond au niveau attendu pour valider le sprint.
CRITIQUE
Ce que l’apprenant sait faire à ce niveau
- Sélectionner un élément simple du DOM avec JavaScript.
- Modifier un texte, une valeur ou un style simple.
- Ajouter un écouteur d’événement sur un clic.
- Récupérer une valeur simple depuis un champ de formulaire.
- Écrire une fonction JavaScript simple.
- Faire un commit Git avec accompagnement.
FAIBLE
Ce que l’apprenant sait faire à ce niveau
- Sélectionner plusieurs éléments du DOM et parcourir une liste de nœuds.
- Créer ou supprimer dynamiquement un élément HTML simple.
- Réagir à plusieurs types d’événements utilisateur.
- Récupérer plusieurs valeurs d’un formulaire.
- Vérifier qu’un champ obligatoire est renseigné.
- Utiliser des fonctions fléchées simples.
- Utiliser destructuring ou spread/rest sur des cas simples.
- Créer et utiliser une branche Git puis pousser les modifications.
- Mettre à jour ses tâches dans Jira.
MOYEN
Ce que l’apprenant sait faire à ce niveau
- Modifier dynamiquement plusieurs parties de l’interface à partir des données ou des actions utilisateur.
- Utiliser la traversée du DOM pour retrouver parent, enfant ou élément voisin.
- Créer des composants ou blocs d’interface en JavaScript.
- Comprendre la propagation d’un événement et utiliser preventDefault lorsque nécessaire.
- Utiliser la délégation d’événements sur un conteneur simple.
- Valider un formulaire avec plusieurs règles côté client.
- Utiliser une expression régulière simple pour vérifier un format.
- Utiliser correctement destructuring, spread/rest et fonctions fléchées.
- Découper du code en plusieurs fichiers avec import/export.
- Créer une Pull Request simple et suivre un workflow Git/GitHub.
- Relier des tickets Jira à l’avancement du développement.
BON
Ce que l’apprenant sait faire à ce niveau
- Construire une interface réellement dynamique en créant, modifiant et supprimant des éléments du DOM selon les besoins.
- Utiliser sélection, traversée et manipulation du DOM de manière cohérente sans dupliquer inutilement les traitements.
- Gérer proprement les interactions utilisateur avec plusieurs types d’événements.
- Choisir entre écoute directe et délégation d’événements selon la structure de l’interface.
- Gérer correctement propagation, preventDefault et interactions imbriquées.
- Créer des formulaires interactifs avec validation côté client et messages d’erreur compréhensibles.
- Utiliser des expressions régulières adaptées aux règles de validation attendues.
- Structurer le code avec fonctions fléchées, destructuring et spread/rest lorsque cela améliore la lisibilité.
- Découper le code en modules ES cohérents avec des responsabilités distinctes.
- Éviter de concentrer toute la logique dans un seul fichier JavaScript.
- Utiliser branches Git, commits lisibles et Pull Requests simples dans le cadre du sprint.
- Utiliser Jira comme outil de suivi et relier l’organisation du travail au workflow Git/GitHub.
EXCELLENT
Ce que l’apprenant sait faire à ce niveau
- Concevoir des interactions complexes tout en gardant une structure DOM et un code lisibles.
- Choisir les stratégies de sélection et de manipulation DOM les plus adaptées au besoin.
- Utiliser la délégation d’événements pour limiter le nombre de listeners lorsque cela est pertinent.
- Construire des validations de formulaires robustes, maintenables et faciles à faire évoluer.
- Créer des fonctions et modules réutilisables plutôt que dupliquer la logique.
- Organiser les modules ES par responsabilités claires et maîtriser les dépendances entre fichiers.
- Utiliser les fonctionnalités ES6+ de façon pertinente sans complexifier inutilement le code.
- Identifier et corriger de manière autonome les problèmes liés aux événements, au DOM ou aux validations.
- Maintenir un workflow Git/GitHub propre avec branches bien nommées, PR lisibles et historique compréhensible.
- Utiliser l’automatisation GitHub/Jira de façon cohérente pour rendre l’avancement du sprint visible.
Détail des capacités attendues
Cette partie constitue le référentiel complet du sprint. Les niveaux précédents permettent de positionner l’apprenant sans répéter toutes les capacités dans chaque bloc.
1. Sélectionner et parcourir le DOM
- Sélectionner un élément avec querySelector ou une méthode équivalente.
- Sélectionner plusieurs éléments.
- Parcourir une collection d’éléments.
- Naviguer entre parent, enfants et éléments voisins.
- Choisir une stratégie de sélection cohérente avec la structure de la page.
2. Modifier dynamiquement le DOM
- Modifier le texte ou le contenu d’un élément.
- Modifier des attributs.
- Ajouter ou retirer des classes CSS.
- Créer dynamiquement de nouveaux éléments.
- Insérer des éléments dans la page.
- Supprimer des éléments.
- Mettre à jour l’interface à partir d’une action ou d’une donnée.
3. Gérer les événements
- Ajouter un listener avec addEventListener.
- Gérer les clics et interactions utilisateur.
- Gérer les événements de formulaire.
- Gérer les événements clavier ou saisie lorsque nécessaire.
- Utiliser l’objet event.
- Utiliser preventDefault lorsque nécessaire.
- Comprendre la propagation des événements.
4. Utiliser la délégation d’événements
- Comprendre le principe de délégation.
- Placer un listener sur un conteneur parent.
- Identifier l’élément à l’origine de l’événement.
- Utiliser la délégation pour des éléments créés dynamiquement.
- Éviter de multiplier inutilement les listeners.
5. Récupérer et exploiter les données d’un formulaire
- Récupérer les valeurs saisies.
- Lire les différents types de champs.
- Regrouper les données utiles avant traitement.
- Réagir à la soumission d’un formulaire.
- Mettre à jour l’interface selon les données saisies.
6. Valider les formulaires côté client
- Vérifier les champs obligatoires.
- Vérifier la longueur ou la plage d’une valeur.
- Vérifier la cohérence entre plusieurs champs.
- Afficher des messages d’erreur compréhensibles.
- Empêcher la soumission lorsque les données sont invalides.
- Réinitialiser ou mettre à jour les messages de validation.
7. Utiliser les expressions régulières
- Comprendre le principe d’une expression régulière.
- Utiliser une regex simple pour valider un format.
- Tester une valeur avec une expression régulière.
- Utiliser les regex uniquement lorsqu’elles sont adaptées au besoin.
- Maintenir des règles de validation compréhensibles.
8. Utiliser les fonctionnalités ES6+
- Créer des fonctions fléchées.
- Utiliser le destructuring sur objets ou tableaux.
- Utiliser l’opérateur spread.
- Utiliser les paramètres rest.
- Choisir ces fonctionnalités lorsqu’elles améliorent la lisibilité.
- Éviter une utilisation artificielle ou inutile des syntaxes modernes.
9. Modulariser le code avec les modules ES
- Créer plusieurs fichiers JavaScript.
- Exporter une fonction, une constante ou un objet.
- Importer les éléments nécessaires.
- Séparer le code par responsabilités.
- Limiter les dépendances inutiles entre modules.
- Conserver une organisation compréhensible du projet.
10. Structurer le code JavaScript
- Créer des fonctions courtes et ciblées.
- Utiliser des noms explicites.
- Éviter la duplication de logique.
- Séparer gestion du DOM, validation et logique fonctionnelle lorsque pertinent.
- Éviter de concentrer toute la logique dans un seul fichier.
- Conserver un code lisible et facile à maintenir.
11. Utiliser Git/GitHub dans le sprint
- Créer et utiliser des branches.
- Créer des commits réguliers et compréhensibles.
- Pousser les changements vers GitHub.
- Créer une Pull Request simple.
- Relire les changements avant fusion.
- Fusionner les modifications de manière contrôlée.
12. Utiliser Jira et l’automatisation GitHub
- Créer et mettre à jour les tâches du sprint.
- Utiliser des statuts cohérents.
- Relier les tâches aux branches ou Pull Requests lorsque le workflow le prévoit.
- Utiliser les automatisations disponibles pour faciliter le suivi.
- Rendre l’avancement du sprint visible dans Jira ou GitHub.
`;
