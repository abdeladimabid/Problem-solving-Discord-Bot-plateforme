// 📐 Old evaluations brought up to the Fiche niveaux by the AI: each question of an assessment, each situation and QCM of
// a mise en situation, each oral question of a brief's debriefs gets the items of the Fiche it REALLY checks (nothing
// else changes: no question added or rewritten). Their past answers then count at once in what each learner knows, so
// the past sprints and debriefs give a level too. One evaluation (preview, then apply), or all the old ones of the class.
import type { Env, GuildRow } from "./types.ts";
import { aiBudgetOk, aiBudgetUse, all, one, run } from "./db.ts";
import { chatJson } from "./ai.ts";
import { forClass } from "./aictx.ts";
import { LEVEL_LABEL, askedConcepts, briefSprint, cleanConcepts, getConcepts, type ConceptStore } from "./concepts.ts";

export class FicheLinkError extends Error {}
const ITEM = /"S\d{1,2}\.[CFMBE]\d{1,2}"/;
type Kind = "assessment" | "mise" | "oral";
interface Unit { n: number; label: string; text: string; before: string[] }

const parse = <T>(t: string | null | undefined, d: T): T => { try { return t ? (JSON.parse(t) ?? d) : d; } catch { return d; } };
const short = (t: unknown, n: number) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** The sprint of the Fiche an old evaluation belongs to: its items, its brief, its week, else the day it was made. */
async function sprintOf(env: Env, g: GuildRow, s: ConceptStore, o: { codes?: string[]; brief?: number | null; week?: number | null; sprint?: number | null; at?: number | null }): Promise<number | null> {
  const has = (n: number | null | undefined) => (n && s.sprints.some((x) => x.n === Number(n)) ? Number(n) : null);
  for (const c of o.codes ?? []) { const m = String(c).match(/^S(\d{1,2})\./); if (m && has(Number(m[1]))) return Number(m[1]); }
  if (has(o.sprint)) return Number(o.sprint);
  if (o.brief) { const n = await briefSprint(env, g, o.brief, s); if (n) return n; }
  const { programOf, weekAt } = await import("./program.ts");
  const p = await programOf(env, g);
  if (o.week) { const w = p.weeks.find((x) => x.n === Number(o.week)); if (has(w?.sprint)) return Number(w!.sprint); }
  if (o.at) { const w = weekAt(p, new Date(o.at * 1000).toISOString().slice(0, 10)); if (has(w?.sprint)) return Number(w!.sprint); }
  return null;
}

/** What an evaluation is made of, as numbered units for the AI, and how to write the items back. */
async function unitsOf(env: Env, g: GuildRow, s: ConceptStore, kind: Kind, id: number) {
  if (kind === "assessment") {
    const a = await one<{ id: number; title: string; brief_id: number | null; settings: string | null; questions: string; created_at: number }>(env, "SELECT id, title, brief_id, settings, questions, created_at FROM assessments WHERE id = ? AND guild_id = ?", id, g.id);
    if (!a) throw new FicheLinkError("This assessment doesn't exist anymore.");
    const qs = parse<any[]>(a.questions, []);
    const st = parse<any>(a.settings, {});
    const units: Unit[] = qs.map((q, i) => ({ n: i + 1, label: `Q${i + 1}`, before: Array.isArray(q?.concepts) ? q.concepts : [],
      text: `[${q?.type}] ${short(q?.prompt, 500)}${q?.code ? ` | code : ${short(q.code, 300)}` : ""}${q?.type === "mcq" && Array.isArray(q.choices) ? ` | choix : ${q.choices.map((c: unknown) => short(c, 60)).join(" / ")}` : ""}${q?.expected ? ` | attendu : ${short(q.expected, 200)}` : ""}` }));
    const sprint = await sprintOf(env, g, s, { codes: [...(st.concepts || []), ...qs.flatMap((q) => q?.concepts || [])], brief: a.brief_id, at: a.created_at });
    const save = async (links: Record<number, string[]>) => {
      qs.forEach((q, i) => { if (q && links[i + 1]) q.concepts = links[i + 1]; });
      st.concepts = [...new Set(qs.flatMap((q) => (Array.isArray(q?.concepts) ? q.concepts : [])))];
      await run(env, "UPDATE assessments SET questions = ?, settings = ? WHERE id = ?", JSON.stringify(qs), JSON.stringify(st), a.id);
    };
    return { title: a.title, sprint, units, save };
  }
  if (kind === "mise") {
    const m = await one<{ id: number; title: string; week: number | null; sprint: number | null; settings: string | null; content: string; created_at: number }>(env, "SELECT id, title, week, sprint, settings, content, created_at FROM mises WHERE id = ? AND guild_id = ?", id, g.id);
    if (!m) throw new FicheLinkError("This mise en situation doesn't exist anymore.");
    const c = parse<any>(m.content, {});
    const st = parse<any>(m.settings, {});
    const list = [...(c.situations || []).map((x: any, i: number) => ({ x, label: `Situation ${i + 1}` })), ...(c.qcm || []).map((x: any, i: number) => ({ x, label: `QCM ${i + 1}` }))];
    const units: Unit[] = list.map(({ x, label }, i) => ({ n: i + 1, label, before: Array.isArray(x?.concepts) ? x.concepts : [],
      text: `[${label}] ${x?.title ? short(x.title, 120) + " : " : ""}${short(x?.context ?? x?.question, 500)}${x?.code ? ` | code : ${short(x.code, 300)}` : ""}${Array.isArray(x?.questions) && x.questions.length ? ` | à faire : ${x.questions.map((y: unknown) => short(y, 120)).join(" / ")}` : ""}${Array.isArray(x?.choices) ? ` | choix : ${x.choices.map((y: unknown) => short(y, 60)).join(" / ")}` : ""}${x?.notion ? ` | notion : ${short(x.notion, 60)}` : ""}${Array.isArray(x?.notions) && x.notions.length ? ` | notions : ${x.notions.join(", ")}` : ""}` }));
    const sprint = await sprintOf(env, g, s, { codes: [...(st.concepts || []), ...list.flatMap(({ x }) => x?.concepts || [])], week: m.week, sprint: m.sprint, at: m.created_at });
    const save = async (links: Record<number, string[]>) => {
      list.forEach(({ x }, i) => { if (x && links[i + 1]) x.concepts = links[i + 1]; });
      st.concepts = [...new Set(list.flatMap(({ x }) => (Array.isArray(x?.concepts) ? x.concepts : [])))];
      await run(env, "UPDATE mises SET content = ?, settings = ? WHERE id = ?", JSON.stringify(c), JSON.stringify(st), m.id);
    };
    return { title: m.title, sprint, units, save };
  }
  // the oral questions of a brief's debriefs (each learner's), linked together
  const b = await one<{ id: number; title: string; week: number | null; created_at: number }>(env, "SELECT id, title, week, created_at FROM briefs WHERE id = ? AND guild_id = ?", id, g.id);
  if (!b) throw new FicheLinkError("This brief doesn't exist anymore.");
  const revs = await all<{ who: string; record: string }>(env, "SELECT who, record FROM brief_reviews WHERE brief_id = ? AND who LIKE 'u:%'", b.id);
  const recs = revs.map((r) => ({ who: r.who, rec: parse<any>(r.record, null) })).filter((r) => r.rec && Array.isArray(r.rec.oral) && r.rec.oral.length);
  const units: Unit[] = [];
  const where: { r: number; i: number }[] = [];
  recs.forEach((r, ri) => r.rec.oral.forEach((q: any, i: number) => { units.push({ n: units.length + 1, label: `Oral ${units.length + 1}`, before: Array.isArray(q?.concepts) ? q.concepts : [], text: `${short(q?.q, 240)} | attendu : ${short(q?.a, 200)}` }); where.push({ r: ri, i }); }));
  const sprint = await briefSprint(env, g, b.id, s);
  const save = async (links: Record<number, string[]>) => {
    where.forEach((w, k) => { if (links[k + 1]) recs[w.r].rec.oral[w.i].concepts = links[k + 1]; });
    for (const r of recs) await run(env, "UPDATE brief_reviews SET record = ? WHERE brief_id = ? AND who = ?", JSON.stringify(r.rec), b.id, r.who);
  };
  return { title: b.title, sprint, units, save };
}

/** The sprints an evaluation can give proofs for: its own, and the ones before it (a review of Sprint 1 in Sprint 2). */
const sprintsUpTo = (s: ConceptStore, sprint: number) => s.sprints.map((x) => x.n).filter((n) => n <= sprint).sort((a, b) => a - b);
/** The AI reads the units and the items (Faible to Excellent; never Critique) of the sprint and the ones before, and says which items each one checks. */
async function askLinks(env: Env, s: ConceptStore, sprint: number, units: Unit[]): Promise<Record<number, string[]>> {
  const sps = sprintsUpTo(s, sprint);
  const items = sps.flatMap((n) => askedConcepts(s, n));
  const ok = (c: string) => sps.some((n) => c.startsWith(`S${n}.`));
  const out: Record<number, string[]> = {};
  for (let i = 0; i < units.length; i += 15) {
    const part = units.slice(i, i + 15);
    const data = await chatJson(env, [
      { role: "system", content: ["Tu es formateur en développement web. RELIER À LA FICHE NIVEAUX : pour chaque question numérotée d'une évaluation déjà passée, dis quels éléments de la Fiche niveaux elle vérifie.",
        "Règles :",
        "- Une question est UNE preuve parmi d'autres (il en faut 5 par élément) : elle n'a pas à prouver tout l'élément à elle seule. Relie-la à chaque élément dont elle vérifie une partie de la notion, de la connaissance ou du savoir-faire.",
        "- Les QCM et les « Vrai ou Faux » comptent comme les autres questions : un QCM sur la propagation d'un événement vérifie l'élément sur la propagation ; un QCM sur une commande Git vérifie l'élément sur Git ; un QCM sur une classe Tailwind vérifie l'élément sur Tailwind.",
        "- Les éléments viennent de plusieurs sprints (S1 = Sprint 1, S2 = Sprint 2…) : prends l'élément du sprint qui correspond à la notion de la question (Tailwind, CSS, HTML, accessibilité → souvent Sprint 1 ; DOM, événements, formulaires en JavaScript → souvent Sprint 2).",
        "- Le niveau : une question de connaissance ou de compréhension (QCM, Vrai/Faux, « que renvoie… ») va avec un élément Faible ou Moyen de sa notion ; une question où il faut choisir, justifier, corriger ou organiser va aussi avec l'élément Bon ou Excellent de la notion.",
        "- 1 à 3 éléments par question ; [] seulement si la question ne touche AUCUN élément listé.",
        "- N'utilise QUE les codes listés.",
        'Réponds UNIQUEMENT avec ce JSON : {"links":[{"n":1,"concepts":["S2.M3"]}]} avec une entrée par question.'].join("\n") },
      { role: "user", content: `ÉLÉMENTS DE LA FICHE NIVEAUX (${sps.map((n) => `sprint ${n}`).join(", ")}) :\n${items.map((c) => `${c.code} [${LEVEL_LABEL[c.level]}] ${c.text}`).join("\n")}\n\nQUESTIONS :\n${part.map((u) => `${u.n}. ${u.text}`).join("\n")}` },
    ], { maxTokens: 3000, temperature: 0.1, timeoutMs: 90000 }).catch((e) => { throw new FicheLinkError(`The AI couldn't answer right now (${String((e as Error)?.message || e).slice(0, 100)}). Try again in a minute.`); });
    for (const l of Array.isArray(data?.links) ? data.links : []) {
      const n = Number(l?.n);
      if (!part.some((u) => u.n === n)) continue;
      out[n] = cleanConcepts(s, l?.concepts).filter(ok).slice(0, 3);
    }
  }
  return out;
}

/**
 * One evaluation linked to the Fiche by the AI: the proposal (each unit with the items found, and how many units now
 * check each item), saved only with `apply` (the proposal sent back, so what was shown is what's saved).
 */
export async function linkFiche(env: Env, g: GuildRow, b: { kind?: unknown; id?: unknown; sprint?: unknown; apply?: unknown; links?: unknown }) {
  env = forClass(env, g.id);
  const kind = String(b.kind) as Kind;
  if (!["assessment", "mise", "oral"].includes(kind)) throw new FicheLinkError("Unknown kind of evaluation.");
  const s = await getConcepts(env, g.id);
  const u = await unitsOf(env, g, s, kind, Number(b.id));
  const sprint = Number(b.sprint) && s.sprints.some((x) => x.n === Number(b.sprint)) ? Number(b.sprint) : u.sprint;
  if (!sprint) throw new FicheLinkError("Which sprint of the Fiche is it for? Pick it (its week isn't in the Fiche).");
  if (!u.units.length) throw new FicheLinkError(kind === "oral" ? "No oral question in this brief's debriefs." : "No question in it.");
  let links: Record<number, string[]>;
  const sps = sprintsUpTo(s, sprint);
  if (b.apply && b.links && typeof b.links === "object") links = Object.fromEntries(Object.entries(b.links as Record<string, unknown>).map(([n, v]) => [Number(n), cleanConcepts(s, v).filter((c) => sps.some((k) => c.startsWith(`S${k}.`))).slice(0, 3)]));
  else {
    if (!(await aiBudgetOk(env, 1))) throw new FicheLinkError("ClassBot's free AI is used up for this class today: add your own AI key in Settings → AI, or try again tomorrow.");
    await aiBudgetUse(env, 1);
    links = await askLinks(env, s, sprint, u.units);
  }
  if (b.apply) await u.save(links);
  const count: Record<string, number> = {};
  for (const v of Object.values(links)) for (const c of v) count[c] = (count[c] || 0) + 1;
  return { kind, id: Number(b.id), title: u.title, sprint, applied: !!b.apply,
    units: u.units.map((x) => ({ n: x.n, label: x.label, text: x.text.slice(0, 200), before: x.before, after: links[x.n] ?? [] })),
    items: sps.flatMap((n) => askedConcepts(s, n)).map((c) => ({ code: c.code, level: c.level, text: c.text, n: count[c.code] || 0 })) };
}

/** The old evaluations of the class not linked to the Fiche's items yet (each kind, newest first). */
export async function oldEvaluations(env: Env, g: GuildRow) {
  const a = await all<{ id: number; title: string; questions: string }>(env, "SELECT id, title, questions FROM assessments WHERE guild_id = ? ORDER BY id DESC", g.id);
  const m = await all<{ id: number; title: string; content: string }>(env, "SELECT id, title, content FROM mises WHERE guild_id = ? ORDER BY id DESC", g.id);
  const b = await all<{ id: number; title: string }>(env,
    "SELECT b.id, b.title FROM briefs b WHERE b.guild_id = ? AND EXISTS (SELECT 1 FROM brief_reviews r WHERE r.brief_id = b.id AND r.who LIKE 'u:%' AND r.record LIKE '%\"oral\":[{%') ORDER BY b.id DESC", g.id);
  const orals = [];
  for (const x of b) {
    const rs = await all<{ record: string }>(env, "SELECT record FROM brief_reviews WHERE brief_id = ? AND who LIKE 'u:%'", x.id);
    const qs = rs.flatMap((r) => parse<any>(r.record, {})?.oral || []);
    if (qs.length && qs.some((q: any) => !(Array.isArray(q?.concepts) && q.concepts.some((c: string) => ITEM.test(JSON.stringify(c)))))) orals.push({ kind: "oral" as const, id: x.id, title: x.title });
  }
  return [
    ...a.filter((x) => !ITEM.test(x.questions || "")).map((x) => ({ kind: "assessment" as const, id: x.id, title: x.title })),
    ...m.filter((x) => !ITEM.test(x.content || "")).map((x) => ({ kind: "mise" as const, id: x.id, title: x.title })),
    ...orals,
  ];
}
