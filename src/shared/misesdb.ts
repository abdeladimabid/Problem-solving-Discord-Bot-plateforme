// Mises en situation, the database side (the pure part is mises.ts): drafts from Claude's JSON, launching for the
// class (personal links by DM), the learner's saves and events, runs and checks, the AI check (categories only),
// the live view, grades, results by DM, CSV, and the cron that closes a session when its time is up.
import type { Ctx, Env, GuildRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { dm, linkBtn, row, send } from "./discord.ts";
import { signText } from "./integrity.ts";
import { staffIds, withoutStaff } from "./staff.ts";
import { currentSquads } from "./squads.ts";
import { askReview } from "./review/debrief.ts";
import { forClass } from "./aictx.ts";
import { programOf, weekAt, compLabel, parseComp } from "./program.ts";
import type { Program, ProgramWeek } from "./program.ts";
import { nextProgrammeWeek, techSoFar } from "./activities.ts";
import { RunnerUnavailable, runOnce } from "./runner.ts";
import {
  AI_CHECKS_PER_ITEM, EVENT_KINDS, FILE_EXTS, aiCheckSystem, aiCheckUser, attempted, buildPrompt, categoryLabel, checkMise, classStats, defaultComment, detectMise,
  evaluateChecks, fileRules, filterCategories, itemIds, phpWithIncludes, workspaceOf, liveStats, liveStatus, miseChecks, normComp, paperOf, previewOf, scoreMise, toCsv,
} from "./mises.ts";
import { chat, extractJson } from "./ai.ts";
import { netFlags } from "./identity.ts";
import { cleanConcepts, conceptsPrompt, getConcepts, knownConcepts, suggestScope } from "./concepts.ts";
import { aiBudgetOk, aiBudgetUse } from "./db.ts";
import { getBrief, simplonText } from "./briefs.ts";
import type { MiseContent, MiseEvent, Situation, TakerData } from "./mises.ts";
import { N_QCM, N_SITUATIONS, QCM_RULES, QCM_SHARE, SIT_RULES, miseCounts, readJson } from "./mises.ts";
/** The barème asked: automatic (by difficulty, the QCM a share of the score; the default) or the file's own points. */
const scoringOf = (b: any) => (b?.scoring === "file" ? undefined : { qcmShare: Number.isFinite(Number(b?.qcmShare)) && b?.qcmShare !== "" && b?.qcmShare != null ? Math.max(0, Math.min(50, Math.round(Number(b.qcmShare)))) : QCM_SHARE });

export class MiseError extends Error { status: number; constructor(msg: string, status = 400) { super(msg); this.status = status; } }

export interface MiseRow { id: number; guild_id: string; title: string; week: number | null; sprint: number | null; comps: string | null; target: string | null; settings: string | null; content: string; status: string; starts_at: number | null; ends_at: number | null; created_at: number; opened_at: number | null; closed_at: number | null }
export interface MiseTakerRow { id: number; mise_id: number; guild_id: string; discord_id: string; status: string; answers: string | null; spent: string | null; checks: string | null; ai: string | null; logs: string | null; events: string | null;
  cur_item: string | null; item_since: number | null; last_seen: number | null; grades: string | null; score: number | null; comment: string | null; invited_at: number | null; started_at: number | null; submitted_at: number | null; sent_at: number | null;
  minutes?: number | null; ends_at?: number | null }
// testers: staff who take it to try it (never "the class") · lockScreen: in full screen, leaving it stops the session until
// the teacher lets them back (like an assessment) · brief: the brief it was written for
// oneDevice: the browser that signed in with Discord is the paper's device (another one stops it) · netAlerts: the
// teacher sees papers opened outside the class's network, or from several networks · files: the learner can add their own
// files (on by default), maxFiles of them at most (starter files included), fileKB each
export interface MiseSettings { minutes: number; noPaste: boolean; channel: boolean; testers: string[]; lockScreen: boolean; brief: { id: number; title: string } | null; oneDevice: boolean; netAlerts: boolean;
  files: boolean; maxFiles: number; fileKB: number;
  /** its scope in the Fiche niveaux: the capacities it covers (5 items each at least) */
  concepts: string[] }

const parse = <T>(s: string | null | undefined, d: T): T => { try { const v = s ? JSON.parse(s) : d; return v ?? d; } catch { return d; } };
const str = (v: unknown, n: number) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, n);
export const contentOf = (m: Pick<MiseRow, "content">) => parse<MiseContent>(m.content, { format: "", title: "", week: null, metier: "", competencies: [], situations: [], qcm: [] });
export const settingsOf = (m: Pick<MiseRow, "settings">): MiseSettings => {
  const s = parse<any>(m.settings, {});
  return { minutes: Math.max(0, Math.min(600, Math.round(Number(s.minutes) || 0))), noPaste: s.noPaste === true, channel: s.channel === true, testers: ids(s.testers).slice(0, 10),
    lockScreen: s.lockScreen === true, brief: briefRef(s.brief), oneDevice: s.oneDevice !== false, netAlerts: s.netAlerts !== false,
    files: s.files !== false, maxFiles: Math.max(1, Math.min(20, Math.round(Number(s.maxFiles) || 8))), fileKB: Math.max(5, Math.min(100, Math.round(Number(s.fileKB) || 20))),
    concepts: (Array.isArray(s.concepts) ? s.concepts : []).map(String).filter((c: string) => /^S\d{1,2}\.[CFMBE]\d{1,2}$/.test(c)).slice(0, 30) };
};
/**
 * The Fiche niveaux for a request: the codes the class knows, and the capacities to cover: the ones ticked (b.concepts),
 * else the file's own list, else (when asked) the ones of its brief or week.
 */
async function conceptOpts(env: Env, g: GuildRow, b: any, o: { week?: number | null; brief?: number | null; suggest: boolean; file?: unknown }) {
  const store = await getConcepts(env, g.id);
  const known = knownConcepts(store);
  let scope: string[] = Array.isArray(b?.concepts) ? cleanConcepts(store, b.concepts) : [];
  if (!scope.length && !Array.isArray(b?.concepts) && o.file && typeof o.file === "object" && Array.isArray((o.file as any).concepts)) scope = cleanConcepts(store, (o.file as any).concepts);
  // 10 items (5 situations, 5 QCM): 6 items of the Fiche at most, each in 5 of them
  if (!scope.length && !Array.isArray(b?.concepts) && o.suggest) scope = (await suggestScope(env, g, { brief_id: o.brief, week: o.week, limit: 6 })).scope;
  return { store, known, scope };
}
/** draft · scheduled (launched, starts later) · live · closed (closed by the teacher, or its time is up). */
export function statusOf(m: Pick<MiseRow, "status" | "starts_at" | "ends_at">, t = now()): "draft" | "scheduled" | "live" | "closed" {
  if (m.status === "draft") return "draft";
  if (m.status === "closed" || (m.ends_at && t > m.ends_at)) return "closed";
  if (m.starts_at && t < m.starts_at) return "scheduled";
  return "live";
}
const briefRef = (v: any) => (v && Number(v.id) > 0 ? { id: Math.round(Number(v.id)), title: str(v.title, 160) } : null);
const ids = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map(String).filter((x) => /^\d{1,25}$/.test(x)))].slice(0, 200);
async function getMise(env: Env, g: GuildRow, id: number) {
  const m = await one<MiseRow>(env, "SELECT * FROM mises WHERE id = ? AND guild_id = ?", id, g.id);
  if (!m) throw new MiseError("This mise en situation doesn't exist anymore.", 404);
  return m;
}
async function classIds(env: Env, g: GuildRow) {
  return (await withoutStaff(env, g.id, await all<{ discord_id: string }>(env, "SELECT discord_id FROM players WHERE guild_id = ?", g.id))).map((r) => r.discord_id);
}
/** The staff who have a player row (they used a command in Discord): they can take a mise en situation to test it. */
async function staffPlayers(env: Env, g: GuildRow) {
  const st = await staffIds(env, g.id);
  if (!st.size) return [];
  return all<{ discord_id: string; name: string | null }>(env, `SELECT discord_id, name FROM players WHERE guild_id = ? AND discord_id IN (${[...st].map(() => "?").join(",")}) ORDER BY name`, g.id, ...st);
}

// ------------------------------------------------------------------ setting it up
/** What the "new" flow needs: the sprints and weeks, the week of today, the competencies, the learners, teams and squads. */
export async function setupView(env: Env, g: GuildRow) {
  const p = await programOf(env, g);
  const today = new Date().toISOString().slice(0, 10);
  const weeks = p.weeks.filter((w) => w.kind === "brief");
  const cur = weekAt(p, today);
  const players = await withoutStaff(env, g.id, await all<{ discord_id: string; name: string | null }>(env, "SELECT discord_id, name FROM players WHERE guild_id = ? ORDER BY name", g.id));
  const teams = await all<{ team_id: number; name: string; discord_id: string }>(env, "SELECT m.team_id, t.name, m.discord_id FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.guild_id = ?", g.id).catch(() => []);
  const sq = await currentSquads(env, g).catch(() => null);
  return {
    program: p.name,
    sprints: p.sprints.map((s) => ({ n: s.n, title: s.title, tech: s.tech.map(compText), soft: s.soft.map(compText) })),
    weeks: weeks.map((w) => ({ n: w.n, title: w.title, sprint: w.sprint, start: w.start, end: w.end, competencies: w.competencies.map(compText), soft: w.soft.map(compText) })),
    current: cur?.kind === "brief" ? cur.n : weeks.find((w) => w.start >= today)?.n ?? weeks[0]?.n ?? null,
    referential: p.referential.map((c) => ({ code: compLabel(c.code), name: c.name, kind: c.kind })),
    students: players,
    // the teachers, to test it themselves as a learner (never counted in « the whole class »)
    staff: await staffPlayers(env, g),
    teams: [...new Map(teams.map((t) => [t.team_id, { id: t.team_id, name: t.name, members: teams.filter((x) => x.team_id === t.team_id).map((x) => x.discord_id) }] as const)).values()],
    squads: (sq?.squads ?? []).map((s) => ({ id: s.id, name: s.name, members: s.members })),
  };
}
/** "C3N1" / "T2N1" / "C3" → "C3N1" / "CT2N1" / "C3N1" (the planning writes them with or without a level). */
const compText = (s: string) => { const pc = parseComp(s); return pc ? `${compLabel(pc.code)}N${pc.level ?? 1}` : s; };

function weekOf(p: Program, n: number): ProgramWeek {
  const w = p.weeks.find((x) => x.n === n && x.kind === "brief") ?? p.weeks.find((x) => x.n === n);
  if (!w) throw new MiseError("Pick a week of the programme.");
  return w;
}
const normList = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map(normComp).filter(Boolean) as string[])].slice(0, 8);
const weekComps = (w: ProgramWeek | null) => (w ? [...w.competencies, ...w.soft].map(compText) : []);
/** The brief a mise en situation is written for: one of the class's briefs, or the text of a brief page (Simplonline). */
async function briefFor(env: Env, g: GuildRow, p: Program, b: any): Promise<{ id: number | null; title: string; text: string; week: number | null; comps: string[] } | null> {
  if (Number(b.brief) > 0) {
    const r = await getBrief(env, g, Number(b.brief));
    if (!r) throw new MiseError("That brief doesn't exist anymore.");
    return { id: r.id, title: r.data.title, text: simplonText(r.data, p), week: r.week ?? null, comps: normList(r.data.competencies.map(compText)) };
  }
  const t = str(b.briefText, 20000);
  if (t.length >= 200) return { id: null, title: str(b.briefTitle, 160) || "Brief", text: t, week: null, comps: normList(Array.isArray(b.briefComps) ? b.briefComps.map((x: unknown) => compText(String(x))) : []) };
  return null;
}
/** The week, the competencies and the brief of a request: what the teacher picked, else what the brief or the file says. */
async function scopeOf(env: Env, g: GuildRow, p: Program, b: any, file?: { week: number | null; comps: string[] }) {
  const br = await briefFor(env, g, p, b);
  const wn = Number(b.week) || file?.week || br?.week || null;
  const w = wn ? weekOf(p, wn) : null;
  let comps = normList(b.comps);
  if (!comps.length && file?.comps.length) comps = file.comps;
  if (!comps.length && br?.comps.length) comps = br.comps;
  if (!comps.length && w) comps = normList(w.competencies.map(compText));
  return { br, w, comps };
}
/** The prompt for Claude, for a week and the competencies chosen (and the brief it's linked to). */
export async function promptFor(env: Env, g: GuildRow, b: any) {
  const p = await programOf(env, g);
  const { br, w, comps } = await scopeOf(env, g, p, b);
  if (!w) throw new MiseError("Pick a week of the programme.");
  if (!comps.length) throw new MiseError("Choose at least one competency.");
  const cn = await conceptOpts(env, g, b, { week: w.n, brief: br?.id ?? null, suggest: true });
  return { prompt: buildPrompt({ program: p, week: w, next: nextProgrammeWeek(p, w), techs: techSoFar(p, w), comps, metier: str(b.metier, 120), brief: br ? { title: br.title, text: br.text } : null, wishes: str(b.wishes, 1500), count: miseCounts(b),
    concepts: cn.scope.length ? { block: conceptsPrompt(cn.store, cn.scope, { per: "élément" }), scope: cn.scope } : undefined }), techs: techSoFar(p, w), concepts: cn.scope };
}

/** What the AI needs to write or fix a mise en situation for a request (the week, the competencies, the brief). */
async function aiContext(env: Env, g: GuildRow, b: any) {
  const p = await programOf(env, g);
  const { br, w, comps } = await scopeOf(env, g, p, b);
  if (!w) throw new MiseError("Pick the week of the programme: the AI keeps to what the class has seen by then.");
  if (!comps.length) throw new MiseError("Choose at least one competency.");
  if (!(await aiBudgetOk(env, 4))) throw new MiseError("ClassBot's free AI is used up for this class today: add your own AI key in Settings → AI, or try again tomorrow.");
  await aiBudgetUse(env, 4);
  const techs = techSoFar(p, w);
  const cn = await conceptOpts(env, g, b, { week: w.n, brief: br?.id ?? null, suggest: true, file: b.json ? readJson(b.json).data : undefined });
  // how many situations and QCM: the teacher's choice (5 and 5 by default)
  const count = miseCounts(b) ?? { situations: N_SITUATIONS, qcm: N_QCM };
  const prompt = buildPrompt({ program: p, week: w, next: nextProgrammeWeek(p, w), techs, comps, metier: str(b.metier, 120), brief: br ? { title: br.title, text: br.text } : null, wishes: str(b.wishes, 1500), count,
    concepts: cn.scope.length ? { block: conceptsPrompt(cn.store, cn.scope, { per: "élément" }), scope: cn.scope } : undefined });
  const ask = (extra: string) => chat(env, [
    { role: "system", content: "Tu es formateur en développement web. Tu réponds UNIQUEMENT avec un objet JSON valide, complet, sans texte avant ni après." },
    { role: "user", content: prompt + extra },
  ], { maxTokens: Math.min(32000, Math.max(16000, 2800 * count.situations + 400 * count.qcm)), temperature: 0.5, timeoutMs: 170000, json: true });
  return { p, w, br, comps, techs, ask, count, opts: { known: new Set(p.referential.map((c) => c.code)), selected: comps, techs, week: w.n, concepts: { known: cn.known, scope: cn.scope }, count, scoring: scoringOf(b) } };
}
const readAi = (raw: string) => { try { return extractJson(raw); } catch { return null; } };

/**
 * The AI writes it here (no copy-paste through Claude): for the brief of the week, or the objectives of the sprint and
 * the week. Then it's made right (perfectMise). Nothing is saved: the teacher reads it, can change it, then saves.
 */
export async function generateMise(env: Env, g: GuildRow, b: any) {
  const x = await aiContext(env, g, b);
  const data = readAi(await x.ask("").catch((e) => { throw new MiseError(`The AI couldn't write it right now (${String((e as Error)?.message || e).slice(0, 120)}). Try again in a minute.`, 502); }));
  if (!data || typeof data !== "object") throw new MiseError("The AI's answer wasn't a complete JSON. Try again (or ask for it with fewer words in your wishes).", 502);
  return perfectMise(env, data, x);
}
/** « Fix with the AI »: a JSON that still has problems (from the AI or uploaded): only what's wrong is written again. */
export async function fixMise(env: Env, g: GuildRow, b: any) {
  const x = await aiContext(env, g, b);
  const { data } = readJson(b.json);
  if (!data || typeof data !== "object") throw new MiseError("This isn't a JSON the AI can fix: paste or upload it again.");
  return perfectMise(env, data, x);
}

/**
 * Until it matches the requirements. What needs no AI is fixed here; each situation or QCM with a problem is written
 * again by the AI, ALONE (the others are kept), as many times as needed (a fresh one after two failed repairs); the
 * whole file only when the problem is the file's. Once valid, it's reviewed: every QCM's choices are checked one by
 * one, twice, by an AI that doesn't know which is marked right (exactly one must be), and each situation against its
 * place in the progression. A round that makes it worse is dropped.
 */
async function perfectMise(env: Env, data: any, x: Awaited<ReturnType<typeof aiContext>>) {
  const { w, br, comps, techs, ask, opts, p } = x;
  const fix = (d: any) => { if (d && typeof d === "object") { if (d.week == null) d.week = w.n; tidyMise(d); } return d; };
  data = fix(data);
  let r = checkMise(data, opts);
  // 6 minutes at most (each round is an AI call or two): what's left is shown, with « Fix with the AI » to go on
  const until = Date.now() + 6 * 60_000;
  // the review only runs on a valid file; a file changed after the last review it may have is said to be unchecked
  const MAX_REVIEWS = 4;
  let reviews = 0, review: { where: string; msg: string }[] = [], reviewed = false;
  const doReview = async () => {
    reviewed = false;
    if (r.problems.length) { review = []; return; }
    if (reviews >= MAX_REVIEWS || Date.now() > until) { review = [{ where: "review", msg: "The QCM answers and the progression couldn't be checked again after the last changes: click « Fix only what's wrong with the AI » to check them." }]; return; }
    reviews++; review = await reviewMise(env, r.content!); reviewed = true;
  };
  await doReview();
  const tries = new Map<string, number>();
  for (let round = 0; round < 10 && (r.problems.length || (review.length && reviewed)) && Date.now() < until; round++) {
    // a review left that nothing can check again afterwards: stop here, the problems are shown
    if (!r.problems.length && reviews >= MAX_REVIEWS) break;
    const todo = r.problems.length ? r.problems : review;
    for (const t of new Set(todo.map((y) => y.where))) tries.set(t, (tries.get(t) ?? 0) + 1);
    const next = fix(await repairMise(data, todo, { ask, read: readAi, techs, next: nextProgrammeWeek(p, w), fresh: (where) => (tries.get(where) ?? 0) > 2 }));
    if (!next) continue;
    const r2 = checkMise(next, opts);
    if (r2.problems.length <= r.problems.length) { data = next; r = r2; await doReview(); }
  }
  return {
    json: JSON.stringify(data, null, 2), problems: [...r.problems, ...review], preview: r.problems.length ? null : r.preview,
    checks: r.content ? miseChecks(r.content, { weekComps: weekComps(w), selected: comps, brief: br?.title, count: x.count }) : [],
    detected: { week: w.n, sprint: w.sprint ?? null, comps, concepts: opts.concepts?.scope ?? [], count: x.count }, brief: br?.id ? { id: br.id, title: br.title } : null,
  };
}

/** Each QCM's choices judged one by one by an AI that isn't told which is marked right: the ones it finds right. */
async function judgeQcm(env: Env, c: MiseContent): Promise<Map<number, number[]> | null> {
  try {
    const raw = await chat(env, [
      { role: "system", content: `Tu es un expert en développement web très rigoureux. Pour chaque QCM, examine CHAQUE choix SÉPARÉMENT, comme si tu exécutais le code dans un navigateur récent : ce choix répond-il correctement et exactement à la question ? Attention aux écritures équivalentes (querySelector('.x') et querySelectorAll('.x')[0] et getElementsByClassName('x')[0] et .item(0) donnent le même élément), aux détails (casse, unités, valeurs, off-by-one). Réponds UNIQUEMENT avec ce JSON : {"q": [{"n": 1, "right": [0, 2], "why": "…"}]} — "right" = les index (0 = A) de TOUS les choix justes, y compris s'il y en a plusieurs ou aucun.` },
      { role: "user", content: JSON.stringify(c.qcm.map((q, i) => ({ n: i + 1, question: q.question, code: q.code ?? "", choices: q.choices.map((t, k) => `${"ABCD"[k]} (index ${k}) : ${t}`) }))) },
    ], { maxTokens: 2500, temperature: 0, timeoutMs: 90000, json: true });
    const j = readAi(raw);
    if (!Array.isArray(j?.q)) return null;
    const out = new Map<number, number[]>();
    for (const y of j.q) if (Number.isInteger(Number(y?.n)) && Array.isArray(y.right)) out.set(Number(y.n), y.right.map(Number).filter((k: number) => Number.isInteger(k) && k >= 0 && k < 4));
    return out;
  } catch { return null; }
}
/**
 * The review: the QCM's answers checked twice (independently, without the key), how easy each QCM is to guess, and each
 * situation against its place in the progression. Problems come back to be rewritten. An unavailable AI: nothing.
 */
async function reviewMise(env: Env, c: MiseContent): Promise<{ where: string; msg: string }[]> {
  const [j1, j2, quality] = await Promise.all([judgeQcm(env, c), judgeQcm(env, c), reviewQuality(env, c)]);
  const out: { where: string; msg: string }[] = [];
  c.qcm.forEach((q, i) => {
    const seen = [j1?.get(i + 1), j2?.get(i + 1)].filter((v): v is number[] => !!v);
    const bad = seen.find((v) => v.length !== 1 || v[0] !== q.correct);
    if (!bad) return;
    const L = (ks: number[]) => ks.map((k) => "ABCD"[k]).join(", ") || "aucun";
    out.push({ where: `QCM ${i + 1}`, msg: bad.length > 1 ? `PLUSIEURS choix sont justes (${L(bad)}) alors qu'un seul doit l'être. Réécris la question et les choix pour qu'UN SEUL soit juste sans discussion, et vérifie chaque mauvais choix.`
      : !bad.length ? `AUCUN choix n'est juste (la réponse marquée, ${"ABCD"[q.correct]}, est fausse). Corrige la question, les choix et "correct".`
      : `la bonne réponse est ${L(bad)}, pas ${"ABCD"[q.correct]} comme marqué. Corrige "correct" ou les choix pour qu'il n'y ait aucun doute.` });
  });
  for (const y of quality) if (!out.some((z) => z.where === y.where)) out.push(y);
  return out;
}
/** How easy each QCM is to guess, and each situation against its place in the progression. */
async function reviewQuality(env: Env, c: MiseContent): Promise<{ where: string; msg: string }[]> {
  try {
    const raw = await chat(env, [
      { role: "system", content: `Tu es un formateur exigeant qui relit une évaluation de développement web avant de la donner.
QCM : imagine un apprenant qui NE CONNAÎT PAS la notion avec précision. Peut-il trouver la bonne réponse en éliminant des choix (hors sujet, d'une autre forme, absurdes) ou parce qu'elle se distingue ? Chaque QCM porte-t-il bien sur le code d'une des situations (ses méthodes, ses concepts, ses noms) ? Montre-t-il la solution complète d'une situation (interdit) ? Règles :
${QCM_RULES.join("\n")}
SITUATIONS : chacune est-elle à sa place dans la progression (la première accessible, puis une marche à la fois ; les dernières, de difficulté 4 et 5, combinent DOM + tableaux + conditions + boucles) ? Règles :
${SIT_RULES.join("\n")}
Réponds UNIQUEMENT avec ce JSON : {"weak": [{"n": 2, "why": "…"}], "unrelated": [{"n": 3, "why": "…"}], "level": [{"n": 1, "fix": "easier" | "harder" | "combine", "why": "…"}]} ("weak" = QCM devinables à refaire ; "unrelated" = QCM qui ne portent pas sur le code d'une situation, ou qui en montrent la solution complète ; "level" = situations pas à leur place : trop difficile → easier, trop facile → harder, la 4 ou la 5 ne combine pas le DOM, les tableaux, les conditions et les boucles → combine ; listes vides si tout est bon).` },
      { role: "user", content: JSON.stringify({
        qcm: c.qcm.map((q, i) => ({ n: i + 1, question: q.question, code: q.code ?? "", choices: q.choices, correct: q.choices[q.correct] })),
        situations: c.situations.map((y, i) => ({ n: i + 1, difficulty: y.difficulty, context: y.context, questions: y.questions, notions: y.notions, checks: y.checks.map((k) => k.label), solution: y.solution.map((f) => f.content).join("\n").slice(0, 1500) })),
      }) },
    ], { maxTokens: Math.min(6000, 1500 + 150 * (c.qcm.length + c.situations.length)), temperature: 0.1, timeoutMs: 90000, json: true });
    const j = readAi(raw);
    const pick = (v: any, max: number) => (Array.isArray(v) ? v : []).filter((y: any) => Number.isInteger(Number(y?.n)) && Number(y.n) >= 1 && Number(y.n) <= max).slice(0, max);
    const FIX: Record<string, string> = {
      easier: "TROP DIFFICILE pour sa place : rends-la plus accessible (moins de notions, des étapes plus petites et guidées), garde le métier ; mets à jour la solution et les vérifications.",
      harder: "TROP FACILE pour sa place : ajoute une notion ou un cas limite, garde le guidage par étapes ; mets à jour la solution et les vérifications.",
      combine: "doit COMBINER ce qui a été vu dans le sprint : le DOM (sélectionner, créer, modifier des éléments, événements) + un TABLEAU à parcourir / filtrer / modifier + des CONDITIONS + une BOUCLE, guidé par étapes ; mets à jour la solution et les vérifications.",
    };
    const weakN = new Set(pick(j?.weak, c.qcm.length).map((y: any) => Number(y.n)));
    return [
      ...pick(j?.unrelated, c.qcm.length).filter((y: any) => !weakN.has(Number(y.n))).map((y: any) => ({ where: `QCM ${Number(y.n)}`, msg: `ne porte pas sur le code des situations : ${String(y.why ?? "").slice(0, 200)}. Réécris-le sur le code d'une situation (de préférence la situation ${Number(y.n)}) : ses méthodes, ses concepts, les mêmes noms ; un extrait ou une variante, jamais la solution complète ; 3 pièges qui ressemblent à la bonne réponse, UNE SEULE réponse juste.` })),
      ...pick(j?.weak, c.qcm.length).map((y: any) => ({ where: `QCM ${Number(y.n)}`, msg: `trop facile à deviner : ${String(y.why ?? "").slice(0, 200)}. Garde la notion ; réécris la question et les 4 choix : 3 pièges qui ressemblent à la bonne réponse (même forme, un détail exact change), UNE SEULE réponse juste.` })),
      ...pick(j?.level, c.situations.length).map((y: any) => ({ where: `situation ${Number(y.n)}`, msg: `${String(y.why ?? "").slice(0, 200)}. ${FIX[y.fix] ?? FIX.harder}` })),
    ];
  } catch { return []; }
}
/** What needs no AI: too many notions or too long ones, points out of range (the AI often writes 6 notions). */
function tidyMise(d: any) {
  if (!d || typeof d !== "object") return;
  for (const s of Array.isArray(d.situations) ? d.situations : []) {
    if (!s || typeof s !== "object") continue;
    if (Array.isArray(s.notions)) s.notions = s.notions.map((x: unknown) => String(x ?? "").trim().slice(0, 60)).filter(Boolean).slice(0, 5);
    if (s.points != null) s.points = Math.max(1, Math.min(10, Math.round(Number(s.points)) || 3));
    if (Array.isArray(s.competencies)) s.competencies = s.competencies.slice(0, 4);
  }
  for (const q of Array.isArray(d.qcm) ? d.qcm : []) {
    if (!q || typeof q !== "object") continue;
    if (q.notion != null) q.notion = String(q.notion).trim().slice(0, 60);
    if (q.points != null) q.points = Math.max(1, Math.min(5, Math.round(Number(q.points)) || 1));
    if (Array.isArray(q.competencies)) q.competencies = q.competencies.slice(0, 4);
  }
}
/**
 * One round of repairs. Problems of a situation or a QCM: the AI writes ONLY those items again (smaller, so it follows
 * the rules), with their problems and what's out of scope spelled out. Problems of the file (how many, the difficulty
 * going up…): the whole file again.
 */
async function repairMise(data: any, problems: { where: string; msg: string }[], o: { ask: (extra: string) => Promise<string>; read: (raw: string) => any; techs: string[]; next: ProgramWeek | null; fresh?: (where: string) => boolean }) {
  const scope = `RAPPEL DU PÉRIMÈTRE : seulement ${o.techs.join(", ") || "les notions vues"}${o.next ? `. INTERDIT (pas encore vu) : ${o.next.concepts || o.next.title} et tout ce qui vient après (fetch, API, async/await, promesses, frameworks… s'ils n'ont pas été vus)` : ""}.`;
  const items = new Map<string, string[]>();
  const whole: string[] = [];
  for (const x of problems) { if (/^(situation|QCM) \d+$/.test(x.where)) items.set(x.where, [...(items.get(x.where) ?? []), x.msg]); else whole.push(x.msg); }
  if (whole.length || !items.size) {
    const d = o.read(await o.ask(`\n\nTA PROPOSITION PRÉCÉDENTE NE RESPECTE PAS LES EXIGENCES. Renvoie le JSON COMPLET corrigé (tous les problèmes réglés, le reste gardé) :\n${problems.slice(0, 30).map((x) => `- ${x.where} : ${x.msg}`).join("\n")}\n${scope}\n\nTa proposition précédente :\n${JSON.stringify(data).slice(0, 40000)}`).catch(() => ""));
    return d && typeof d === "object" ? d : null;
  }
  const out = JSON.parse(JSON.stringify(data));
  const list = [...items.entries()].map(([where, msgs]) => {
    const [kind, n] = where.split(" ");
    const cur = kind === "QCM" ? out.qcm?.[Number(n) - 1] : out.situations?.[Number(n) - 1];
    // repaired twice already and still wrong: a NEW one (same place, same notion), not a third patch
    if (o.fresh?.(where)) return `- ${where} (clé "${kind === "QCM" ? "q" : "s"}${n}") : les corrections précédentes n'ont pas suffi. Écris un ${kind === "QCM" ? "QCM" : "exercice"} ENTIÈREMENT NOUVEAU à cette place (même notion, même difficulté), en évitant : ${msgs.join(" | ")}`;
    return `- ${where} (clé "${kind === "QCM" ? "q" : "s"}${n}") :\n  problèmes : ${msgs.join(" | ")}\n  actuel : ${JSON.stringify(cur ?? {}).slice(0, 9000)}`;
  });
  // a QCM is about the code of the situations: they come with it (their task and their solution, for the AI only)
  const sits = [...items.keys()].some((k) => k.startsWith("QCM")) && Array.isArray(out.situations)
    ? `\nLES SITUATIONS DE CETTE MISE EN SITUATION (les QCM portent sur leur code ; ne recopie jamais une solution complète dans un QCM) :\n${out.situations.map((y: any, i: number) => `- situation ${i + 1} « ${String(y?.title ?? "")} » : ${(Array.isArray(y?.questions) ? y.questions : []).join(" ")}\n  solution : ${(Array.isArray(y?.solution) ? y.solution : []).map((f: any) => String(f?.content ?? "")).join("\n").slice(0, 1200)}`).join("\n")}`
    : "";
  const d = o.read(await o.ask(`\n\nDANS TA PROPOSITION, CES ÉLÉMENTS NE RESPECTENT PAS LES EXIGENCES. Réécris UNIQUEMENT ces éléments, entièrement, en réglant chaque problème (garde le même thème, la même difficulté et la même notion quand c'est possible ; si une notion est hors périmètre, remplace-la par une notion du périmètre) :\n${list.join("\n")}${sits}\n${scope}\nRéponds UNIQUEMENT avec ce JSON : {"items": {"s5": { …la mise en situation complète… }, "q5": { …le QCM complet… }}}`).catch(() => ""));
  const got = d?.items && typeof d.items === "object" ? d.items : null;
  if (!got) return null;
  for (const [k, v] of Object.entries(got)) {
    const m = /^([sq])(\d+)$/.exec(k);
    if (!m || !v || typeof v !== "object") continue;
    const arr = m[1] === "q" ? out.qcm : out.situations, i = Number(m[2]) - 1;
    if (Array.isArray(arr) && i >= 0 && i < arr.length) arr[i] = v;
  }
  return out;
}

/** A JSON (uploaded, pasted, from Claude or from the AI here): checked (preview + the checklist), then saved when asked.
 *  The week, the sprint and the competencies come from the file when the teacher didn't pick them. */
export async function importMise(env: Env, g: GuildRow, b: any) {
  const p = await programOf(env, g);
  const det = detectMise(b.json);
  const { br, w, comps } = await scopeOf(env, g, p, b, det);
  // the Fiche niveaux: the capacities ticked, else the file's own list (a file from an older prompt has none)
  const cn = await conceptOpts(env, g, b, { week: w?.n ?? null, brief: br?.id ?? null, suggest: false, file: readJson(b.json).data });
  const count = miseCounts(b), scoring = scoringOf(b);
  const r = checkMise(b.json, { known: new Set(p.referential.map((c) => c.code)), selected: comps, techs: w ? techSoFar(p, w) : [], week: w?.n ?? null, concepts: { known: cn.known, scope: cn.scope }, count, scoring });
  const detected = { week: w?.n ?? null, sprint: w?.sprint ?? null, comps, title: det.title, concepts: cn.scope };
  const brief = br?.id ? { id: br.id, title: br.title } : null;
  const checks = r.content ? miseChecks(r.content, { weekComps: weekComps(w), selected: comps, brief: brief?.title, count }) : [];
  if (r.problems.length || !b.save) return { problems: r.problems, preview: r.problems.length ? null : r.preview, checks, detected, brief };
  const c = r.content!;
  const res = await run(env, "INSERT INTO mises (guild_id, title, week, sprint, comps, target, settings, content, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)",
    g.id, str(b.title, 120) || c.title, w?.n ?? null, w?.sprint ?? null, JSON.stringify(comps.length ? comps : c.competencies), JSON.stringify(ids(b.target)),
    JSON.stringify({ minutes: 0, noPaste: false, channel: false, testers: ids(b.testers).slice(0, 10), lockScreen: true, brief, concepts: c.concepts ?? cn.scope, scoring: scoring ? { auto: true, qcmShare: scoring.qcmShare } : { auto: false } }), JSON.stringify(c), now());
  return { id: Number(res.meta.last_row_id), problems: [], checks, detected, brief };
}

/** Change a draft (title, learners, the JSON checked again) or the options of a launched one. */
export async function saveMise(env: Env, g: GuildRow, id: number, b: any) {
  const m = await getMise(env, g, id);
  const sets: string[] = [], args: unknown[] = [];
  if (b.title != null) { const t = str(b.title, 120); if (t.length < 3) throw new MiseError("The title: 3 characters at least."); sets.push("title = ?"); args.push(t); }
  if (b.target != null) { sets.push("target = ?"); args.push(JSON.stringify(ids(b.target))); }
  if (b.settings != null) { const s = { ...settingsOf(m), ...pickSettings(b.settings) }; sets.push("settings = ?"); args.push(JSON.stringify(s)); }
  // the week and the competencies (the edit form): the content is checked again with them
  let week = m.week, comps = parse<string[]>(m.comps, []), scope = false;
  if (b.week !== undefined || b.comps != null) {
    scope = true;
    if (m.status !== "draft") throw new MiseError("The learners already have it: its week and competencies can't change anymore.");
    if (b.week !== undefined) week = Number(b.week) || null;
    if (b.comps != null) { comps = normList(b.comps); if (!comps.length) throw new MiseError("Choose at least one competency."); }
  }
  if (b.json != null || scope) {
    if (m.status !== "draft") throw new MiseError("The learners already have it: its content can't change anymore.");
    const p = await programOf(env, g);
    const w = week ? weekOf(p, week) : null;
    const cn = await conceptOpts(env, g, b, { suggest: false, file: b.json ? readJson(b.json).data : contentOf(m) });
    const r = checkMise(b.json ?? contentOf(m), { known: new Set(p.referential.map((c) => c.code)), selected: comps, techs: w ? techSoFar(p, w) : [], week: w?.n ?? null, concepts: { known: cn.known, scope: cn.scope.length ? cn.scope : settingsOf(m).concepts } });
    if (r.problems.length) return { problems: r.problems };
    sets.push("content = ?", "week = ?", "sprint = ?", "comps = ?"); args.push(JSON.stringify(r.content), w?.n ?? null, w?.sprint ?? null, JSON.stringify(comps));
  }
  if (sets.length) await run(env, `UPDATE mises SET ${sets.join(", ")} WHERE id = ?`, ...args, id);
  return { problems: [] };
}
const pickSettings = (s: any) => {
  const o: Partial<MiseSettings> = {};
  if (s && "minutes" in s) o.minutes = Math.max(0, Math.min(600, Math.round(Number(s.minutes) || 0)));
  if (s && "noPaste" in s) o.noPaste = !!s.noPaste;
  if (s && "channel" in s) o.channel = !!s.channel;
  if (s && "testers" in s) o.testers = ids(s.testers).slice(0, 10);
  if (s && "lockScreen" in s) o.lockScreen = !!s.lockScreen;
  if (s && "brief" in s) o.brief = briefRef(s.brief);
  if (s && "oneDevice" in s) o.oneDevice = !!s.oneDevice;
  if (s && "netAlerts" in s) o.netAlerts = !!s.netAlerts;
  if (s && "files" in s) o.files = !!s.files;
  if (s && "maxFiles" in s) o.maxFiles = Math.max(1, Math.min(20, Math.round(Number(s.maxFiles) || 8)));
  if (s && "fileKB" in s) o.fileKB = Math.max(5, Math.min(100, Math.round(Number(s.fileKB) || 20)));
  if (s && "concepts" in s) o.concepts = (Array.isArray(s.concepts) ? s.concepts : []).map(String).filter((c: string) => /^S\d{1,2}\.[CFMBE]\d{1,2}$/.test(c)).slice(0, 30);
  return o;
};

export async function listMises(env: Env, g: GuildRow) {
  // the average of the class: a teacher who tested it isn't in it
  const staff = [...(await staffIds(env, g.id))];
  const rows = await all<MiseRow & { takers: number; started: number; done: number; avg: number | null }>(env,
    `SELECT m.*, (SELECT COUNT(*) FROM mise_takers t WHERE t.mise_id = m.id) AS takers,
            (SELECT COUNT(*) FROM mise_takers t WHERE t.mise_id = m.id AND t.status != 'invited') AS started,
            (SELECT COUNT(*) FROM mise_takers t WHERE t.mise_id = m.id AND t.status = 'submitted') AS done,
            (SELECT ROUND(AVG(score)) FROM mise_takers t WHERE t.mise_id = m.id AND t.status = 'submitted'${staff.length ? ` AND t.discord_id NOT IN (${staff.map(() => "?").join(",")})` : ""}) AS avg
       FROM mises m WHERE m.guild_id = ? ORDER BY m.id DESC LIMIT 100`, ...staff, g.id);
  return { items: rows.map(({ content, ...m }) => ({ ...m, status: statusOf(m), comps: parse<string[]>(m.comps, []), target: parse<string[]>(m.target, []), settings: settingsOf(m), n: itemIds(contentOf({ content })).length })) };
}

// ------------------------------------------------------------------ launching
export async function takerToken(env: Env, takerId: number, exp: number) {
  const body = `${takerId}.${exp}`;
  return `${body}.${await signText(env, "mes:" + body)}`;
}
export async function readTakerToken(env: Env, token: string): Promise<number | null> {
  const m = String(token).match(/^(\d+)\.(\d+)\.([A-Za-z0-9_-]{32})$/);
  if (!m || Number(m[2]) < now()) return null;
  return (await signText(env, `mes:${m[1]}.${m[2]}`)) === m[3] ? Number(m[1]) : null;
}
const linkExp = (m: Pick<MiseRow, "ends_at">) => (m.ends_at ? m.ends_at + 2 * 86400 : now() + 60 * 86400);
/**
 * A learner given it later (absent when it was launched): their own time, counted from when they open it, and their own
 * end; the session stays closed for the others. Their paper follows that window instead of the session's.
 */
const isLate = (t: Pick<MiseTakerRow, "minutes">) => !!t.minutes;
function forTaker(m: MiseRow, t: Pick<MiseTakerRow, "minutes" | "ends_at">): MiseRow {
  if (!isLate(t)) return m;
  return { ...m, status: "live", starts_at: null, ends_at: t.ends_at ?? null };
}
const LATE_DAYS = 14;   // a late learner's link: valid two weeks (they open it when they're back)
export const miseUrl = (env: Env, token: string) => `${(env.PUBLIC_URL || "").replace(/\/$/, "")}/mes/${token}`;

async function sendLink(env: Env, m: MiseRow, tk: { id: number; discord_id: string; minutes?: number | null }) {
  const late = !!tk.minutes;
  const url = miseUrl(env, await takerToken(env, tk.id, late ? now() + LATE_DAYS * 86400 : linkExp(m)));
  const c = contentOf(m), st = settingsOf(m);
  const when = late ? `Ton temps (${tk.minutes} minutes) commence quand tu l’ouvres : ouvre-la quand ton formateur te le dit.`
    : m.starts_at && m.starts_at > now() ? `Elle commence <t:${m.starts_at}:F>.` : "Elle est ouverte maintenant.";
  return dm(env, tk.discord_id, {
    embeds: [{ title: `🧪 Mise en situation : ${m.title}`, color: 0x2563eb,
      description: [`${c.situations.length} mise${c.situations.length > 1 ? "s" : ""} en situation avec du code${c.qcm.length ? ` et ${c.qcm.length} QCM` : ""}, dans ton navigateur.`, when,
        late ? "" : m.ends_at ? `À rendre avant <t:${m.ends_at}:F>.` : st.minutes ? `Durée : ${st.minutes} minutes.` : "", "Ce lien est personnel : ne le partage pas."].filter(Boolean).join("\n") }],
    components: [row(linkBtn("Ouvrir ma mise en situation", url, "🧪"))],
  });
}

/** Open it for the learners chosen (or the whole class): each one gets their personal link by DM. */
export async function launch(env: Env, g: GuildRow, id: number, b: any) {
  const m = await getMise(env, g, id);
  if (statusOf(m) === "closed") throw new MiseError("This mise en situation is closed.");
  if (!contentOf(m).situations.length) throw new MiseError("Import Claude's JSON first.");
  const t0 = now();
  const startsAt = b.startsAt ? Math.max(t0, Math.round(Number(b.startsAt))) : t0;
  const s = { ...settingsOf(m), ...pickSettings(b) };
  const endsAt = s.minutes ? startsAt + s.minutes * 60 : null;
  // the learners chosen when launching ([] = the whole class; "only" = nobody but the teachers testing it)
  const chosen = Array.isArray(b.students) ? ids(b.students) : parse<string[]>(m.target, []);
  let who = b.only ? [] : chosen.length ? chosen : await classIds(env, g);
  // the teachers who test it get it too
  who = [...new Set([...who, ...s.testers])];
  if (!who.length) throw new MiseError("Nobody to send it to: choose at least one learner.");
  const target = b.only ? s.testers : chosen;
  await run(env, "UPDATE mises SET status = 'live', starts_at = ?, ends_at = ?, settings = ?, target = ?, opened_at = COALESCE(opened_at, ?) WHERE id = ?", startsAt, endsAt, JSON.stringify(s), JSON.stringify(target), t0, id);
  const r = await addTakers(env, g, id, who, b.send !== false);
  if (s.channel && g.announce_channel) {
    await send(env, g.announce_channel, { embeds: [{ title: `🧪 Mise en situation : ${m.title}`, color: 0x2563eb,
      description: `${startsAt > t0 ? `Elle commence <t:${startsAt}:F>.` : "C'est parti !"} Chacun a reçu son lien personnel en message privé.${endsAt ? ` Fin <t:${endsAt}:R>.` : ""}` }] }).catch(() => null);
  }
  return r;
}
/** Add learners (or send the link again): only the new ones and those who haven't handed in get a DM. */
export async function addTakers(env: Env, g: GuildRow, id: number, students: string[], sendDm = true) {
  const m = await getMise(env, g, id);
  const who = ids(students);
  if (!who.length) throw new MiseError("Choose at least one learner.");
  const valid = new Set([...(await classIds(env, g)), ...(await staffPlayers(env, g)).map((x) => x.discord_id)]);
  const keep = who.filter((x) => valid.has(x));
  if (!keep.length) throw new MiseError("These learners aren't in the class.");
  await env.DB.batch(keep.map((uid) => env.DB.prepare("INSERT OR IGNORE INTO mise_takers (mise_id, guild_id, discord_id, invited_at) VALUES (?, ?, ?, ?)").bind(id, g.id, uid, now())));
  const takers = await all<{ id: number; discord_id: string; status: string }>(env, `SELECT id, discord_id, status FROM mise_takers WHERE mise_id = ? AND discord_id IN (${keep.map(() => "?").join(",")})`, id, ...keep);
  let sent = 0;
  if (sendDm && m.status !== "draft") for (const tk of takers.slice(0, 60)) if (tk.status !== "submitted" && (await sendLink(env, m, tk))) sent++;
  return { invited: takers.length, sent };
}
/**
 * ♻️ Use it again: never a one-use. Nobody took it (launched by mistake, everyone removed): back to a draft, as it was.
 * Papers in it: a new session from the same content (a draft, the results of the first one stay where they are).
 */
export async function reuseMise(env: Env, g: GuildRow, id: number): Promise<{ id: number; fresh: boolean }> {
  const m = await getMise(env, g, id);
  if (m.status === "draft") return { id, fresh: false };
  const n = (await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM mise_takers WHERE mise_id = ?", id))?.n ?? 0;
  if (!n) {
    await run(env, "UPDATE mises SET status = 'draft', starts_at = NULL, ends_at = NULL, opened_at = NULL, closed_at = NULL WHERE id = ?", id);
    return { id, fresh: false };
  }
  const r = await run(env, "INSERT INTO mises (guild_id, title, week, sprint, comps, target, settings, content, status, created_at) SELECT guild_id, title, week, sprint, comps, '[]', settings, content, 'draft', ? FROM mises WHERE id = ?", now(), id);
  return { id: Number(r.meta.last_row_id), fresh: true };
}
/**
 * Learners who were absent: they get it now, with their own time (counted from when they open it), the session staying
 * closed for the others. Only learners who don't have it yet (a paper already there: reset it first).
 */
export async function addLate(env: Env, g: GuildRow, id: number, students: string[], minutes: unknown, sendDm = true) {
  const m = await getMise(env, g, id);
  if (m.status === "draft") throw new MiseError("Launch it first.");
  if (!contentOf(m).situations.length) throw new MiseError("Import Claude's JSON first.");
  const st = settingsOf(m);
  // their time: asked, else the session's (its minutes, or how long it was open), else an hour
  const was = m.ends_at && (m.starts_at ?? m.opened_at) ? Math.round((m.ends_at - (m.starts_at ?? m.opened_at)!) / 60) : 0;
  const min = Math.max(5, Math.min(600, Math.round(Number(minutes)) || st.minutes || was || 60));
  const who = ids(students);
  if (!who.length) throw new MiseError("Choose at least one learner.");
  const valid = new Set([...(await classIds(env, g)), ...(await staffPlayers(env, g)).map((x) => x.discord_id)]);
  const has = new Set((await all<{ discord_id: string }>(env, "SELECT discord_id FROM mise_takers WHERE mise_id = ?", id)).map((x) => x.discord_id));
  const keep = who.filter((x) => valid.has(x) && !has.has(x));
  if (!keep.length) throw new MiseError("These learners already have it (or aren't in the class).");
  await env.DB.batch(keep.map((uid) => env.DB.prepare("INSERT OR IGNORE INTO mise_takers (mise_id, guild_id, discord_id, invited_at, minutes) VALUES (?, ?, ?, ?, ?)").bind(id, g.id, uid, now(), min)));
  const takers = await all<{ id: number; discord_id: string; minutes: number }>(env, `SELECT id, discord_id, minutes FROM mise_takers WHERE mise_id = ? AND discord_id IN (${keep.map(() => "?").join(",")})`, id, ...keep);
  let sent = 0;
  if (sendDm) for (const tk of takers.slice(0, 60)) if (await sendLink(env, m, tk)) sent++;
  return { invited: takers.length, sent, minutes: min };
}
export async function resend(env: Env, g: GuildRow, id: number, takerId: number) {
  const m = await getMise(env, g, id);
  const tk = await one<{ id: number; discord_id: string; minutes: number | null; ends_at: number | null }>(env, "SELECT id, discord_id, minutes, ends_at FROM mise_takers WHERE id = ? AND mise_id = ?", takerId, id);
  if (!tk) throw new MiseError("Unknown learner.", 404);
  if (statusOf(forTaker(m, tk)) === "closed") throw new MiseError("This mise en situation is closed.");
  return { sent: (await sendLink(env, m, tk)) ? 1 : 0 };
}
/** The links, to copy when a DM didn't arrive. */
export async function links(env: Env, g: GuildRow, id: number) {
  const m = await getMise(env, g, id);
  const takers = await all<{ id: number; discord_id: string }>(env, "SELECT id, discord_id FROM mise_takers WHERE mise_id = ?", id);
  const late = new Set((await all<{ id: number }>(env, "SELECT id FROM mise_takers WHERE mise_id = ? AND minutes IS NOT NULL", id)).map((x) => x.id));
  return Object.fromEntries(await Promise.all(takers.map(async (t) => [t.discord_id, miseUrl(env, await takerToken(env, t.id, late.has(t.id) ? now() + LATE_DAYS * 86400 : linkExp(m)))] as [string, string])));
}
/** More time for everyone (a session without an end gets one only when asked). */
export async function extend(env: Env, g: GuildRow, id: number, minutes: number, cont: unknown = null) {
  const m = await getMise(env, g, id);
  const add = Math.max(1, Math.min(600, Math.round(minutes) || 0));
  if (m.status === "draft") throw new MiseError("Launch it first.");
  const base = Math.max(m.ends_at ?? now(), now());
  await run(env, "UPDATE mises SET ends_at = ?, status = 'live', closed_at = NULL WHERE id = ?", base + add * 60, id);
  // papers handed in (often by the closing, or the time running out) that the teacher lets continue: where they were
  return { continued: await continueTakers(env, g.id, id, cont) };
}
/** Papers handed in that go on where they were (handed in by mistake, or by the closing): their results wait. */
async function continueTakers(env: Env, gid: string, id: number, takers: unknown) {
  const want = (Array.isArray(takers) ? takers : []).map(Number).filter((x) => Number.isInteger(x) && x > 0);
  if (!want.length) return 0;
  let continued = 0;
  const list = await all<{ id: number; discord_id: string }>(env, `SELECT id, discord_id FROM mise_takers WHERE mise_id = ? AND status = 'submitted' AND id IN (${want.map(() => "?").join(",")})`, id, ...want);
  for (const t of list) {
    const r = await run(env, "UPDATE mise_takers SET status = 'resume', submitted_at = NULL WHERE id = ? AND status = 'submitted'", t.id);
    if (!r.meta.changes) continue;
    // their results come back when they hand it in again
    await clearResults(env, gid, id, t.discord_id);
    await pushEvent(env, t.id, [now(), "reopen", "", 0]);
    continued++;
  }
  return continued;
}
/** One learner handed in by mistake: their paper opens again (the mise must be open: else reopen it with more time). */
export async function reopenTaker(env: Env, g: GuildRow, id: number, takerId: number) {
  const m = await getMise(env, g, id);
  if (statusOf(m) === "closed") throw new MiseError("It's closed: use « Reopen with more time » and tick them.");
  const t = await one<{ status: string }>(env, "SELECT status FROM mise_takers WHERE id = ? AND mise_id = ?", takerId, id);
  if (!t) throw new MiseError("Unknown learner.", 404);
  if (t.status !== "submitted") throw new MiseError("Their paper isn't handed in.");
  return { continued: await continueTakers(env, g.id, id, [takerId]) };
}
async function clearResults(env: Env, gid: string, miseId: number, uid: string) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM competency_results WHERE guild_id = ? AND discord_id = ? AND source = 'mise' AND ref = ?").bind(gid, uid, miseId),
    env.DB.prepare("DELETE FROM skill_evidence WHERE guild_id = ? AND discord_id = ? AND source = ?").bind(gid, uid, `mise:${miseId}`),
  ]);
}
/** Delete a learner's paper (their work, events and results): they can be invited again, with a new paper. */
export async function resetTaker(env: Env, g: GuildRow, id: number, takerId: number, invite = false) {
  const m = await getMise(env, g, id);
  const t = await one<{ id: number; discord_id: string }>(env, "SELECT id, discord_id FROM mise_takers WHERE id = ? AND mise_id = ?", takerId, id);
  if (!t) throw new MiseError("Unknown learner.", 404);
  await clearResults(env, g.id, id, t.discord_id);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM mise_takers WHERE id = ?").bind(t.id),
    env.DB.prepare("DELETE FROM app_settings WHERE k = ?").bind(`ident:mes:${t.id}`),
  ]);
  if (!invite) return { removed: 1, invited: 0, sent: 0 };
  const live = statusOf(m) !== "closed";
  const r = await addTakers(env, g, id, [t.discord_id], live);
  return { removed: 1, invited: r.invited, sent: r.sent };
}
/** Close it for everyone: the papers still open are handed in as they are. */
export async function closeMise(env: Env, g: GuildRow, id: number) {
  await getMise(env, g, id);
  await run(env, "UPDATE mises SET status = 'closed', closed_at = ?, ends_at = COALESCE(MIN(ends_at, ?), ?) WHERE id = ?", now(), now(), now(), id);
  const open = await all<{ id: number }>(env, "SELECT id FROM mise_takers WHERE mise_id = ? AND status IN ('active', 'locked', 'resume') AND minutes IS NULL", id);
  for (const t of open) await submitTaker(env, t.id, null, true);
}
export async function removeTaker(env: Env, g: GuildRow, id: number, takerId: number) {
  await getMise(env, g, id);
  await run(env, "DELETE FROM mise_takers WHERE id = ? AND mise_id = ? AND status = 'invited'", takerId, id);
}
export async function deleteMise(env: Env, g: GuildRow, id: number) {
  await getMise(env, g, id);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM competency_results WHERE guild_id = ? AND source = 'mise' AND ref = ?").bind(g.id, id),
    env.DB.prepare("DELETE FROM skill_evidence WHERE guild_id = ? AND source = ?").bind(g.id, `mise:${id}`),
    env.DB.prepare("DELETE FROM mise_takers WHERE mise_id = ?").bind(id),
    env.DB.prepare("DELETE FROM mises WHERE id = ?").bind(id),
  ]);
}

// ------------------------------------------------------------------ the learner's side
async function loadTaker(env: Env, takerId: number) {
  const t = await one<MiseTakerRow>(env, "SELECT * FROM mise_takers WHERE id = ?", takerId);
  if (!t) return null;
  const m = await one<MiseRow>(env, "SELECT * FROM mises WHERE id = ?", t.mise_id);
  return m ? { t, m } : null;
}
/** Before starting: the title, when it starts and ends, the rules (no questions yet). */
export async function learnerInfo(env: Env, takerId: number) {
  const x = await loadTaker(env, takerId);
  if (!x) return null;
  const { t, m } = x, c = contentOf(m), st = settingsOf(m);
  const p = await one<{ name: string | null }>(env, "SELECT name FROM players WHERE guild_id = ? AND discord_id = ?", t.guild_id, t.discord_id);
  const mt = forTaker(m, t);
  return { title: m.title, metier: c.metier, status: t.status === "submitted" ? "submitted" : statusOf(mt), taker: t.status, name: p?.name ?? null,
    n: { situations: c.situations.length, qcm: c.qcm.length }, startsAt: mt.starts_at, endsAt: mt.ends_at, minutes: t.minutes ?? null, now: now(), noPaste: st.noPaste,
    lockScreen: st.lockScreen, lockWhy: t.status === "locked" || t.status === "resume" ? lockWhy(t) : null };
}
/** Why their session stopped (the last "lock" event): fullscreen, hidden, blur, reload. */
const lockWhy = (t: Pick<MiseTakerRow, "events">) => String(parse<MiseEvent[]>(t.events, []).filter((e) => e[1] === "lock").at(-1)?.[4] ?? "fullscreen");
/** The learner writes: only theirs, only while the session is live and their paper isn't handed in (nor stopped). */
async function writable(env: Env, takerId: number) {
  const x = await loadTaker(env, takerId);
  if (!x) throw new MiseError("unknown", 404);
  // a late learner: their own window
  x.m = forTaker(x.m, x.t);
  const s = statusOf(x.m);
  if (x.t.status === "submitted") throw new MiseError("submitted", 409);
  if (x.t.status === "locked" || x.t.status === "resume") throw new MiseError("locked", 409);
  // a few seconds of grace after the end (a save on its way)
  if (s === "closed" && !(x.m.status === "live" && x.m.ends_at && now() <= x.m.ends_at + 30)) throw new MiseError("closed", 409);
  if (s === "scheduled") throw new MiseError("scheduled", 409);
  if (s === "draft") throw new MiseError("closed", 409);
  return x;
}
/** Start (or come back: a reload, another device): the paper and everything already saved. */
export async function startTaker(env: Env, takerId: number) {
  // let back in by the teacher: the session goes on (once)
  const back = await run(env, "UPDATE mise_takers SET status = 'active', last_seen = ? WHERE id = ? AND status = 'resume'", now(), takerId);
  const { t, m } = await writable(env, takerId);
  const c = contentOf(m), t0 = now();
  let ends = m.ends_at;
  if (t.status === "invited") {
    await run(env, "UPDATE mise_takers SET status = 'active', started_at = ?, last_seen = ?, cur_item = ?, item_since = ? WHERE id = ? AND status = 'invited'", t0, t0, c.situations[0]?.id ?? "q1", t0, t.id);
    // a late learner: their time starts now
    if (isLate(t)) { ends = t0 + (t.minutes as number) * 60; await run(env, "UPDATE mise_takers SET ends_at = ? WHERE id = ?", ends, t.id); }
    await pushEvent(env, t.id, [t0, "start", "", 0]);
  } else if (settingsOf(m).lockScreen && !back.meta.changes) {
    // full screen rule: opening the page again (a reload, another tab or device) while working stops the session too
    await lockTaker(env, t.id, "reload");
    throw new MiseError("locked", 409);
  } else await run(env, "UPDATE mise_takers SET last_seen = ? WHERE id = ?", t0, t.id);
  const ai = parse<Record<string, { categories: string[] }[]>>(t.ai, {});
  const checks = parse<TakerData["checks"]>(t.checks, {});
  return {
    paper: paperOf(c), answers: parse(t.answers, {}), spent: parse(t.spent, {}), cur: t.cur_item ?? c.situations[0]?.id ?? "q1",
    // the last automatic checks and AI categories of each situation (labels only)
    checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, (v.results ?? []).map((r) => ({ id: r.id, ok: r.ok }))])),
    ai: Object.fromEntries(Object.entries(ai).map(([k, v]) => [k, { left: Math.max(0, AI_CHECKS_PER_ITEM - v.filter((x: any) => !x.submit).length), last: (v.filter((x: any) => !x.submit).at(-1)?.categories ?? []).map((id) => ({ id, label: categoryLabel(id) })) }])),
    endsAt: ends, now: t0, noPaste: settingsOf(m).noPaste, lockScreen: settingsOf(m).lockScreen, status: "active",
    files: { allow: settingsOf(m).files, max: settingsOf(m).maxFiles, kb: settingsOf(m).fileKB, exts: FILE_EXTS },
  };
}

/** Full screen rule: they left it (or the tab, the window): the session stops until the teacher lets them back. */
export async function lockTaker(env: Env, takerId: number, what: unknown) {
  const x = await loadTaker(env, takerId);
  // another device stops it whatever the full screen rule; leaving the page only with the full screen rule
  if (!x || x.t.status !== "active" || (what !== "device" && !settingsOf(x.m).lockScreen)) return { ok: false };
  const why = ["fullscreen", "hidden", "blur", "reload", "device"].includes(String(what)) ? String(what) : "fullscreen";
  const r = await run(env, "UPDATE mise_takers SET status = 'locked', last_seen = ? WHERE id = ? AND status = 'active'", now(), x.t.id);
  if (r.meta.changes) await pushEvent(env, x.t.id, [now(), "lock", x.t.cur_item ?? "", 0, why]);
  return { ok: true, status: "locked" };
}
/** The paper behind a link, for the Discord sign-in: who it was sent to, whether it started, the options. */
export async function miseTakerIdent(env: Env, takerId: number) {
  const x = await loadTaker(env, takerId);
  if (!x) return null;
  return { uid: x.t.discord_id, started: ["active", "locked", "resume"].includes(x.t.status), oneDevice: settingsOf(x.m).oneDevice };
}
/** The teacher lets them back in (one learner, or everyone stopped): their page asks again for full screen and goes on. */
export async function unlockTakers(env: Env, g: GuildRow, id: number, takerId: number | null) {
  await getMise(env, g, id);
  const list = await all<{ id: number }>(env, `SELECT id FROM mise_takers WHERE mise_id = ? AND status = 'locked'${takerId ? " AND id = ?" : ""}`, id, ...(takerId ? [takerId] : []));
  for (const t of list) {
    await run(env, "UPDATE mise_takers SET status = 'resume' WHERE id = ? AND status = 'locked'", t.id);
    await pushEvent(env, t.id, [now(), "unlock", "", 0]);
  }
  return { unlocked: list.length };
}

async function pushEvent(env: Env, takerId: number, e: MiseEvent) {
  await run(env, "UPDATE mise_takers SET events = json_insert(COALESCE(events, '[]'), '$[#]', json(?)) WHERE id = ? AND COALESCE(json_array_length(events), 0) < 1500", JSON.stringify(e), takerId);
}
const itemOf = (c: MiseContent, id: unknown) => { const s = String(id ?? ""); return itemIds(c).includes(s) ? s : null; };
/** The files of a situation as the learner sent them: the starter files, then their own files when the teacher allows them
 *  (names, extensions, number and sizes checked: mises.ts workspaceOf). */
function filesOf(m: Pick<MiseRow, "settings">, s: Situation, raw: unknown): Record<string, string> {
  return workspaceOf(s, raw, fileRules(s.runtime, settingsOf(m)));
}
/** Autosave: an answer (the files of a situation, the choice of a QCM), the time spent, the typing record. */
export async function saveItem(env: Env, takerId: number, b: any) {
  const { t, m } = await writable(env, takerId);
  const c = contentOf(m), t0 = now();
  const sets: string[] = ["last_seen = ?"], args: unknown[] = [t0];
  const item = itemOf(c, b.item);
  if (item && b.answer !== undefined) {
    const s = c.situations.find((x) => x.id === item);
    const q = c.qcm.find((x) => x.id === item);
    const ans = s ? { files: filesOf(m, s, b.answer?.files) } : { choice: Number.isInteger(Number(b.answer?.choice)) && Number(b.answer.choice) >= 0 && Number(b.answer.choice) < (q?.choices.length ?? 0) ? Number(b.answer.choice) : null };
    sets.push("answers = json_set(COALESCE(answers, '{}'), ?, json(?))"); args.push(`$.${item}`, JSON.stringify(ans));
  }
  // the typing record of this visit of the page (a reload is a new visit: the earlier ones stay)
  const visit = /^[a-z0-9]{6,12}$/.test(String(b.visit ?? "")) ? String(b.visit) : null;
  if (item && visit && b.log && typeof b.log === "object" && c.situations.some((x) => x.id === item)) {
    const log = cleanLog(b.log, t0);
    if (log) { sets.push("logs = CASE WHEN length(COALESCE(logs, '')) < 1500000 THEN json_set(COALESCE(logs, '{}'), ?, json(?)) ELSE logs END"); args.push(`$.${item}_${visit}`, JSON.stringify(log)); }
  }
  if (b.spent && typeof b.spent === "object") {
    for (const k of itemIds(c)) if (Number.isFinite(Number(b.spent[k])) && Number(b.spent[k]) > 0) { sets.push("spent = json_set(COALESCE(spent, '{}'), ?, ?)"); args.push(`$.${k}`, Math.min(86400000, Math.round(Number(b.spent[k])))); }
  }
  const cur = itemOf(c, b.cur);
  if (cur && cur !== t.cur_item) { sets.push("cur_item = ?", "item_since = ?"); args.push(cur, t0); await pushEvent(env, t.id, [t0, "item", cur, 0]); }
  await run(env, `UPDATE mise_takers SET ${sets.join(", ")} WHERE id = ?`, ...args, t.id);
  return { ok: true };
}
/** The typing record of one situation during one visit, file by file: like the practice editor's
 *  ([t, from, removed, text, origin], t in ms since the page opened), capped. */
function cleanLog(raw: any, at: number) {
  if (!raw.files || typeof raw.files !== "object") return null;
  const files: Record<string, { changes: [number, number, number, string, string][]; pastes: number }> = {};
  let size = 0;
  for (const [name, f] of Object.entries(raw.files).slice(0, 20) as [string, any][]) {
    if (!/^[\w.-]{1,40}$/.test(name) || !Array.isArray(f?.changes)) continue;
    const changes: [number, number, number, string, string][] = [];
    for (const x of f.changes.slice(-3000)) {
      const ch: [number, number, number, string, string] = [Math.max(0, Math.round(Number(x?.[0]) || 0)), Math.max(0, Math.round(Number(x?.[1]) || 0)), Math.max(0, Math.round(Number(x?.[2]) || 0)), String(x?.[3] ?? "").slice(0, 8000), String(x?.[4] ?? "").slice(0, 12)];
      size += ch[3].length + 30;
      if (size > 90000) break;
      changes.push(ch);
    }
    files[name] = { changes, pastes: Math.max(0, Math.min(1000, Math.round(Number(f?.pastes) || 0))) };
  }
  return { at, files, focus: (Array.isArray(raw.focus) ? raw.focus : []).slice(-400).map((f: any) => [Math.max(0, Math.round(Number(f?.[0]) || 0)), f?.[1] === "blur" ? "blur" : "focus"]),
    openMs: Math.max(0, Math.round(Number(raw.openMs) || 0)) };
}
/** Leaving and coming back, pastes (allowed and written down, or blocked), runs in the browser, moving to an item. */
export async function learnerEvent(env: Env, takerId: number, b: any) {
  if (b?.kind === "lock") return lockTaker(env, takerId, b.why);
  const x = await loadTaker(env, takerId);
  if (!x || x.t.status !== "active") return { ok: false };
  const c = contentOf(x.m);
  const kind = String(b.kind ?? "");
  if (!EVENT_KINDS.includes(kind) || ["start", "submit", "check", "item", "lock", "unlock"].includes(kind)) return { ok: false };
  const item = itemOf(c, b.item) ?? "";
  const n = Math.max(0, Math.min(10_000_000, Math.round(Number(b.n) || 0)));
  // what was pasted, for the teacher (the start of it)
  const extra = kind === "paste" || kind === "paste-blocked" ? str(b.text, 400) : kind === "file" ? str(b.text, 100) : undefined;
  await pushEvent(env, x.t.id, [now(), kind, item, n, ...(extra ? [extra] : [])] as MiseEvent);
  await run(env, "UPDATE mise_takers SET last_seen = ? WHERE id = ?", now(), x.t.id);
  return { ok: true };
}

const MAX_SERVER_RUNS = 40;
/**
 * Run: the files are saved, the checks are compared with the expected values (here, never on the page). HTML/CSS/JS
 * and SQL ran in the browser (the page sends what it measured); PHP and Node.js run here, on the runner.
 */
export async function runItem(env: Env, takerId: number, b: any) {
  const { t, m } = await writable(env, takerId);
  const c = contentOf(m);
  const s = c.situations.find((x) => x.id === String(b.item));
  if (!s) throw new MiseError("unknown item");
  const files = filesOf(m, s, b.files);
  const measure: any = { probes: b.measured?.probes && typeof b.measured.probes === "object" ? b.measured.probes : {}, console: str(b.measured?.console, 20000),
    rows: Array.isArray(b.measured?.rows) ? b.measured.rows.slice(0, 200) : null };
  let output: string | null = null, error: string | null = null;
  if (s.runtime === "php" || s.runtime === "node") {
    const used = parse<MiseEvent[]>(t.events, []).filter((e) => e[1] === "run" && e[3] === 1).length;
    if (used >= MAX_SERVER_RUNS) return { error: `Tu as utilisé tes ${MAX_SERVER_RUNS} exécutions sur le serveur.` };
    const lang = s.runtime === "php" ? "php" : "javascript";
    const main = s.files.find((f) => f.lang === lang) ?? s.files[0];
    const stdins = [...new Set(["", ...s.checks.filter((k) => k.type === "output" && k.stdin).map((k) => k.stdin!)])].slice(0, 3);
    try {
      const code = lang === "php" ? phpWithIncludes(files, main.name) : files[main.name];
      const outs = await Promise.all(stdins.map((x) => runOnce(env, lang, code, x)));
      output = outs[0].out; error = outs[0].ok ? null : outs[0].err || null;
      // each output check with the input it asks for
      const byStdin = new Map(stdins.map((x, i) => [x, outs[i].out]));
      const results = s.checks.map((k) => k.type === "output" ? { id: k.id, ok: evaluateChecks({ checks: [k], files: s.files }, files, { output: byStdin.get(k.stdin ?? "") ?? "" })[0].ok } : evaluateChecks({ checks: [k], files: s.files }, files, measure)[0]);
      await storeRun(env, t.id, s.id, files, results, 1);
      return { output, stderr: error, checks: labelled(s, results) };
    } catch (e) {
      if (e instanceof RunnerUnavailable) return { error: "Exécution indisponible, réessaie dans un instant." };
      throw e;
    }
  }
  const results = evaluateChecks(s, files, measure);
  await storeRun(env, t.id, s.id, files, results, 0);
  return { checks: labelled(s, results) };
}
const labelled = (s: Situation, results: { id: string; ok: boolean }[]) => results.map((r) => ({ id: r.id, label: s.checks.find((k) => k.id === r.id)?.label ?? "", ok: r.ok }));
async function storeRun(env: Env, takerId: number, item: string, files: Record<string, string>, results: { id: string; ok: boolean }[], server: number) {
  const t0 = now();
  await run(env, "UPDATE mise_takers SET answers = json_set(COALESCE(answers, '{}'), ?, json(?)), checks = json_set(COALESCE(checks, '{}'), ?, json(?)), last_seen = ? WHERE id = ?",
    `$.${item}`, JSON.stringify({ files }), `$.${item}`, JSON.stringify({ at: t0, results }), t0, takerId);
  await pushEvent(env, takerId, [t0, "run", item, server, results.filter((r) => r.ok).length + "/" + results.length]);
}

/**
 * "Vérifier mon code": a small AI call that returns ONLY the category of the problem (or none). 3 per situation;
 * a call the AI couldn't answer doesn't count. Whatever else the AI writes is dropped (filterCategories).
 */
export async function aiCheck(env: Env, takerId: number, b: any, o: { submit?: boolean } = {}) {
  const x = o.submit ? await loadTaker(env, takerId) : await writable(env, takerId);
  if (!x) throw new MiseError("unknown", 404);
  const { t, m } = x, c = contentOf(m);
  const s = c.situations.find((y) => y.id === String(b.item));
  if (!s) throw new MiseError("unknown item");
  env = forClass(env, t.guild_id);
  const ai = parse<Record<string, any[]>>(t.ai, {});
  const used = (ai[s.id] ?? []).filter((y) => !y.submit).length;
  if (!o.submit && used >= AI_CHECKS_PER_ITEM) return { error: "Tu as utilisé tes 3 vérifications pour cette mise en situation.", left: 0 };
  const files = filesOf(m, s, b.files ? b.files : parse<any>(t.answers, {})[s.id]?.files);
  const last = parse<TakerData["checks"]>(t.checks, {})[s.id]?.results ?? [];
  const failed = last.filter((r) => !r.ok).map((r) => s.checks.find((k) => k.id === r.id)?.label ?? "").filter(Boolean);
  let ask: Awaited<ReturnType<typeof askReview>>;
  try { ask = await askReview(env, aiCheckSystem(), aiCheckUser(s, files, { failed, errors: str(b.errors, 800) }), 1, { maxTokens: 120 }); }
  catch { ask = { ok: false }; }
  const got = ask.ok ? filterCategories(ask.data) : null;
  if (!got) return { error: "Vérification indisponible, réessaie plus tard.", left: AI_CHECKS_PER_ITEM - used };
  const entry = { at: now(), categories: got.categories, ...(o.submit ? { submit: true } : {}) };
  const r = await run(env, `UPDATE mise_takers SET ai = json_insert(json_insert(COALESCE(ai, '{}'), ?, json('[]')), ?, json(?)), last_seen = ? WHERE id = ?${o.submit ? "" : " AND (SELECT COUNT(*) FROM json_each(COALESCE(ai, '{}'), ?) WHERE json_extract(value, '$.submit') IS NULL) < ?"}`,
    `$.${s.id}`, `$.${s.id}[#]`, JSON.stringify(entry), now(), t.id, ...(o.submit ? [] : [`$.${s.id}`, AI_CHECKS_PER_ITEM]));
  if (!r.meta.changes) return { error: "Tu as utilisé tes 3 vérifications pour cette mise en situation.", left: 0 };
  if (!o.submit) await pushEvent(env, t.id, [now(), "check", s.id, 0, got.categories.join(",")]);
  return { categories: got.categories.map((id) => ({ id, label: categoryLabel(id) })), left: o.submit ? 0 : Math.max(0, AI_CHECKS_PER_ITEM - used - 1) };
}

/** Hand in (or the time is up / the teacher closed it): the score, then one AI check per situation done (for the teacher). */
export async function submitTaker(env: Env, takerId: number, ctx: Ctx | null, auto = false) {
  const x = auto ? await loadTaker(env, takerId) : await writable(env, takerId);
  if (!x) throw new MiseError("unknown", 404);
  const r = await run(env, `UPDATE mise_takers SET status = 'submitted', submitted_at = ? WHERE id = ? AND status ${auto ? "IN ('active', 'locked', 'resume')" : "= 'active'"}`, now(), x.t.id);
  if (!r.meta.changes) return;
  await pushEvent(env, x.t.id, [now(), "submit", "", auto ? 1 : 0]);
  await refreshScore(env, x.t.id);
  if (!auto && ctx) {
    // the categories of the problems, for the class statistics (never shown as hints: the paper is handed in)
    const c = contentOf(x.m);
    const answers = parse<any>(x.t.answers, {});
    const todo = c.situations.filter((s) => attempted(c, s.id, answers[s.id]));
    ctx.waitUntil((async () => { for (const s of todo) await aiCheck(env, x.t.id, { item: s.id }, { submit: true }).catch(() => null); })());
  }
}

/** The score from the checks, the QCM and the teacher's changes; once nothing is left to grade, it goes in the record. */
export async function refreshScore(env: Env, takerId: number) {
  const x = await loadTaker(env, takerId);
  if (!x) return;
  const c = contentOf(x.m);
  const sc = scoreMise(c, dataOf(x.t));
  await run(env, "UPDATE mise_takers SET score = ? WHERE id = ?", sc.total, x.t.id);
  // a teacher testing it: nothing goes to their record
  if (x.t.status === "submitted" && !sc.toGrade && !(await staffIds(env, x.t.guild_id)).has(x.t.discord_id)) await applyResults(env, x.m, x.t.discord_id, c, sc);
}
const dataOf = (t: MiseTakerRow): TakerData => ({ answers: parse(t.answers, {}), checks: parse(t.checks, {}), grades: parse(t.grades, {}) });

/** Competencies (and skills when the items name some) in the learner's record, like an assessment. Again on each change. */
async function applyResults(env: Env, m: MiseRow, uid: string, c: MiseContent, sc: ReturnType<typeof scoreMise>) {
  const t0 = now(), src = `mise:${m.id}`;
  const stmts: any[] = [
    env.DB.prepare("DELETE FROM skill_evidence WHERE guild_id = ? AND discord_id = ? AND source = ?").bind(m.guild_id, uid, src),
    env.DB.prepare("DELETE FROM competency_results WHERE guild_id = ? AND discord_id = ? AND source = 'mise' AND ref = ?").bind(m.guild_id, uid, m.id),
  ];
  const byComp = new Map<string, { s: number; n: number; level: number }>();
  const items = [...c.situations.map((s) => ({ id: s.id, comps: s.competencies, pts: s.points, skills: s.skills, title: s.title, w: 1 })), ...c.qcm.map((q) => ({ id: q.id, comps: q.competencies, pts: q.points, skills: q.skills, title: q.notion, w: 0.6 }))];
  for (const it of items) {
    const score = sc.items[it.id]?.score ?? 0;
    for (const k of it.comps) {
      const pc = parseComp(k);
      if (!pc) continue;
      const e = byComp.get(pc.code) ?? { s: 0, n: 0, level: pc.level ?? 1 };
      e.s += score * it.pts; e.n += it.pts; e.level = Math.max(e.level, pc.level ?? 1);
      byComp.set(pc.code, e);
    }
    for (const skill of it.skills) stmts.push(env.DB.prepare("INSERT INTO skill_evidence (guild_id, discord_id, attempt_id, skill, ok, weight, why, created_at, difficulty, source) VALUES (?, ?, 0, ?, ?, ?, ?, ?, 'easy', ?)")
      .bind(m.guild_id, uid, skill, score >= 60 ? 1 : 0, it.w, `${m.title}: ${it.title}`.slice(0, 240), t0, src));
  }
  for (const [code, e] of byComp) {
    const pct = Math.round(e.s / Math.max(1, e.n));
    stmts.push(env.DB.prepare("INSERT INTO competency_results (guild_id, discord_id, code, level, ok, source, ref, note, at) VALUES (?, ?, ?, ?, ?, 'mise', ?, ?, ?)")
      .bind(m.guild_id, uid, code, e.level, pct >= 60 ? 1 : 0, m.id, `Mise en situation : ${m.title} (${pct}%)`.slice(0, 120), t0));
  }
  await env.DB.batch(stmts);
}

// ------------------------------------------------------------------ the teacher's live view
const nameOf = async (env: Env, g: GuildRow) => new Map((await all<{ discord_id: string; name: string | null }>(env, "SELECT discord_id, name FROM players WHERE guild_id = ?", g.id)).map((r) => [r.discord_id, r.name]));
export async function miseView(env: Env, g: GuildRow, id: number) {
  const m = await getMise(env, g, id);
  const c = contentOf(m);
  const takers = await all<MiseTakerRow>(env, "SELECT * FROM mise_takers WHERE mise_id = ? ORDER BY id", id);
  const names = await nameOf(env, g);
  const t0 = now();
  const staff = await staffIds(env, g.id);
  // network alerts (an option): opened outside the class's network, or from several networks
  const net = settingsOf(m).netAlerts ? await netFlags(env, "mes", takers.map((t) => t.id)) : {};
  const rows = takers.map((t) => {
    const ev = parse<MiseEvent[]>(t.events, []);
    const st = liveStats(ev, t0);
    const d = dataOf(t);
    const sc = scoreMise(c, d);
    const spent = parse<Record<string, number>>(t.spent, {});
    return {
      id: t.id, discord_id: t.discord_id, name: names.get(t.discord_id) ?? null, test: staff.has(t.discord_id), status: t.status, live: liveStatus(t, st, t0),
      lockWhy: t.status === "locked" || t.status === "resume" ? lockWhy(t) : null, locks: ev.filter((e) => e[1] === "lock").length, net: net[t.id] ?? null,
      autoSub: t.status === "submitted" && ev.filter((e) => e[1] === "submit").at(-1)?.[3] === 1,
      // right so far: a QCM answered right, a situation whose last run passed every check
      correct: itemIds(c).filter((k) => sc.items[k]?.attempted && sc.items[k]?.score === 100).length,
      item: t.cur_item, itemSince: t.item_since, answered: itemIds(c).filter((k) => attempted(c, k, d.answers[k])).length,
      timeSec: t.started_at ? Math.max(0, (t.submitted_at ?? t0) - t.started_at) : 0, workSec: Math.round(Object.values(spent).reduce((a, b) => a + (Number(b) || 0), 0) / 1000),
      runs: st.runs, checks: st.checks, leaves: st.leaves, awaySec: st.awaySec, away: st.away, pastes: st.pastes, pasteChars: st.pasteChars, blockedPastes: st.blockedPastes,
      lastAt: Math.max(t.last_seen ?? 0, st.lastAt ?? 0) || null, started_at: t.started_at, submitted_at: t.submitted_at,
      late: t.minutes ? { minutes: t.minutes, endsAt: t.ends_at ?? null } : null,
      score: t.status === "submitted" ? sc.total : null, toGrade: t.status === "submitted" ? sc.toGrade : 0, items: sc.items, sent_at: t.sent_at, comment: t.comment,
    };
  });
  // the class statistics without the teachers who tested it; while no learner has started, the test papers (marked testOnly)
  const started = (t: MiseTakerRow) => t.status !== "invited";
  const learners = takers.filter((t) => !staff.has(t.discord_id) && started(t));
  const testOnly = !learners.length && takers.some((t) => staff.has(t.discord_id) && started(t));
  const stats = { ...classStats(c, (testOnly ? takers.filter((t) => staff.has(t.discord_id) && started(t)) : learners).map((t) => ({ answers: parse(t.answers, {}), checks: parse(t.checks, {}), ai: parse(t.ai, {}), spent: parse(t.spent, {}) }))), testOnly };
  const p = await programOf(env, g);
  const w = m.week ? p.weeks.find((x) => x.n === m.week) ?? null : null;
  const checks = c.situations.length ? miseChecks(c, { weekComps: weekComps(w), selected: parse<string[]>(m.comps, []), brief: settingsOf(m).brief?.title }) : [];
  return { mise: { ...m, content: c, status: statusOf(m), comps: parse<string[]>(m.comps, []), target: parse<string[]>(m.target, []), settings: settingsOf(m), preview: previewOf(c), now: t0, checks }, takers: rows, stats };
}

/** One learner: their answers per item, the checks, the AI categories, pastes, leaving and coming back, the typing record. */
export async function takerDetail(env: Env, g: GuildRow, id: number, takerId: number) {
  const m = await getMise(env, g, id);
  const t = await one<MiseTakerRow>(env, "SELECT * FROM mise_takers WHERE id = ? AND mise_id = ?", takerId, id);
  if (!t) throw new MiseError("Unknown learner.", 404);
  const c = contentOf(m), d = dataOf(t);
  const ai = parse<Record<string, { at: number; categories: string[]; submit?: boolean }[]>>(t.ai, {});
  const sc = scoreMise(c, d);
  const p = await one<{ name: string | null }>(env, "SELECT name FROM players WHERE guild_id = ? AND discord_id = ?", g.id, t.discord_id);
  return {
    id: t.id, discord_id: t.discord_id, name: p?.name ?? null, status: t.status, score: sc.total, items: sc.items, comment: t.comment ?? "", sent_at: t.sent_at,
    answers: d.answers, grades: d.grades, spent: parse(t.spent, {}), logs: parse(t.logs, {}),
    checks: Object.fromEntries(Object.entries(d.checks).map(([k, v]) => { const s = c.situations.find((x) => x.id === k); return [k, { at: v.at, results: (v.results ?? []).map((r) => ({ ...r, label: s?.checks.find((x) => x.id === r.id)?.label ?? r.id })) }]; })),
    ai: Object.fromEntries(Object.entries(ai).map(([k, v]) => [k, v.map((x) => ({ at: x.at, submit: !!x.submit, categories: x.categories.map((id) => ({ id, label: categoryLabel(id) })) }))])),
    events: parse<MiseEvent[]>(t.events, []), stats: liveStats(parse<MiseEvent[]>(t.events, []), now()),
    defaultComment: defaultComment(sc.total, weakNotions(c, sc)),
  };
}
const weakNotions = (c: MiseContent, sc: ReturnType<typeof scoreMise>) =>
  [...new Set([...c.situations.filter((s) => (sc.items[s.id]?.score ?? 0) < 60).flatMap((s) => s.notions), ...c.qcm.filter((q) => (sc.items[q.id]?.score ?? 0) < 60).map((q) => q.notion)])];

/** The teacher's grade of one item (0–100, a comment), or back to the automatic one (score null). */
export async function setGrade(env: Env, g: GuildRow, id: number, b: any) {
  const m = await getMise(env, g, id);
  const t = await one<MiseTakerRow>(env, "SELECT * FROM mise_takers WHERE id = ? AND mise_id = ?", Number(b.taker), id);
  if (!t) throw new MiseError("Unknown learner.", 404);
  const item = itemOf(contentOf(m), b.item);
  if (!item) throw new MiseError("Unknown item.");
  const grades = parse<Record<string, any>>(t.grades, {});
  const note = str(b.comment, 600);
  // no score: back to the automatic one (a comment alone stays, for the learner)
  if (b.score === null || b.score === "") { if (note) grades[item] = { comment: note }; else delete grades[item]; }
  else grades[item] = { score: Math.max(0, Math.min(100, Math.round(Number(b.score) || 0))), comment: note, teacher: true };
  await run(env, "UPDATE mise_takers SET grades = ? WHERE id = ?", JSON.stringify(grades), t.id);
  await refreshScore(env, t.id);
}
export async function setComment(env: Env, g: GuildRow, id: number, b: any) {
  await getMise(env, g, id);
  await run(env, "UPDATE mise_takers SET comment = ? WHERE id = ? AND mise_id = ?", str(b.comment, 1000), Number(b.taker), id);
}

/** The results by DM (only when the teacher clicks): the score, each item, and the comment (theirs, or the default one). */
export async function sendResults(env: Env, g: GuildRow, id: number, b: any) {
  const m = await getMise(env, g, id);
  const c = contentOf(m);
  const only = ids(b?.takers);
  const takers = (await all<MiseTakerRow>(env, "SELECT * FROM mise_takers WHERE mise_id = ? AND status = 'submitted'", id)).filter((t) => !only.length || only.includes(t.discord_id));
  let sent = 0, skipped = 0;
  for (const t of takers.slice(0, 60)) {
    const sc = scoreMise(c, dataOf(t));
    if (sc.toGrade) { skipped++; continue; }
    const icon = (v: number | null, done: boolean) => (!done ? "⚪" : (v ?? 0) >= 85 ? "✅" : (v ?? 0) > 0 ? "🟡" : "❌");
    const d = dataOf(t);
    // each item with what was wrong and what to study again: the teacher's (or Claude's) comment; else what we know
    const note = (id: string, fallback: string) => str(d.grades[id]?.comment, 400) || fallback;
    const fields = [
      ...c.situations.map((s, i) => { const it = sc.items[s.id]; return { name: `${icon(it.score, it.attempted)} Situation ${i + 1} · ${s.title} — ${it.score ?? 0} %`.slice(0, 250),
        value: note(s.id, !it.attempted ? `Pas faite. À travailler : ${s.notions.join(", ") || s.title}.` : (it.score ?? 0) >= 85 ? "Réussie." : `À revoir : ${s.notions.join(", ") || s.title}.`).slice(0, 1000) }; }),
      ...c.qcm.map((q, i) => { const it = sc.items[q.id], ch = d.answers[q.id]?.choice; return { name: `${icon(it.score, it.attempted)} QCM ${i + 1} · ${q.notion}`.slice(0, 250),
        value: note(q.id, ch === q.correct ? "Bonne réponse." : `${ch == null ? "Pas de réponse." : "Mauvaise réponse."} La bonne réponse : ${q.choices[q.correct]}. À revoir : ${q.notion}.`).slice(0, 1000) }; }),
    ].slice(0, 25);
    const comment = str(t.comment, 1000) || defaultComment(sc.total, weakNotions(c, sc));
    // an embed holds 6000 characters at most: the item comments are cut to fit
    let room = 5600 - comment.length - m.title.length;
    for (const f of fields) { const n = f.name.length + f.value.length; if (n > room) f.value = f.value.slice(0, Math.max(20, room - f.name.length - 1)) + "…"; room -= f.name.length + f.value.length; }
    const ok = await dm(env, t.discord_id, { embeds: [{ title: `🧪 ${m.title} : ${sc.total} %`.slice(0, 250), color: sc.total >= 60 ? 0x16a34a : 0xd97706, description: comment.slice(0, 4000), fields: fields.filter((f) => f.value) }] });
    if (ok) { sent++; await run(env, "UPDATE mise_takers SET sent_at = ? WHERE id = ?", now(), t.id); }
  }
  return { sent, skipped };
}

// ------------------------------------------------------------------ CSV
const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const LIVE_FR: Record<string, string> = { "not-started": "pas commencé", working: "en cours", done: "terminé", absent: "absent" };
export async function liveCsv(env: Env, g: GuildRow, id: number) {
  const v = await miseView(env, g, id);
  const c = v.mise.content;
  const label = (k: string | null) => { if (!k) return ""; const i = c.situations.findIndex((s) => s.id === k); return i >= 0 ? `Situation ${i + 1}` : `QCM ${Number(k.slice(1))}`; };
  return toCsv([["Apprenant", "Statut", "Élément en cours", "Progression", "Temps", "Exécutions", "Vérifications IA", "Sorties de la page", "Temps hors de la page", "Collages", "Caractères collés", "Dernière activité"],
    ...v.takers.map((t) => [t.name || t.discord_id, LIVE_FR[t.live], label(t.item), `${t.answered}/${itemIds(c).length}`, fmtSec(t.timeSec), t.runs, t.checks, t.leaves, fmtSec(t.awaySec), t.pastes, t.pasteChars,
      t.lastAt ? new Date(t.lastAt * 1000).toISOString().replace("T", " ").slice(0, 16) : ""])]);
}
export async function resultsCsv(env: Env, g: GuildRow, id: number) {
  const v = await miseView(env, g, id);
  const c = v.mise.content;
  const items = [...c.situations.map((s, i) => ({ id: s.id, h: `S${i + 1} ${s.title}` })), ...c.qcm.map((q, i) => ({ id: q.id, h: `QCM${i + 1} ${q.notion}` }))];
  return toCsv([["Apprenant", "Score %", ...items.map((x) => x.h), "À corriger"],
    ...v.takers.filter((t) => t.status === "submitted").map((t) => [t.name || t.discord_id, t.score, ...items.map((x) => t.items[x.id]?.score ?? ""), t.toGrade])]);
}

// ------------------------------------------------------------------ correction by Claude (claude.ai): out, then back in
/** What the teacher gives Claude to grade with: the instructions, the paper with what's expected, then each learner's work. */
export const GRADE_FORMAT = "classbot-mise-grades@1";
const GRADE_PROMPT = [
  "Tu es formateur en développement web et tu corriges une mise en situation passée en classe.",
  "Ce fichier contient : les éléments de l'épreuve (« items » : les mises en situation avec la consigne, le résultat attendu, une solution modèle et les vérifications automatiques ; les QCM avec la bonne réponse), puis le travail de chaque apprenant (« learners »).",
  "Pour CHAQUE apprenant et CHAQUE mise en situation (kind « situation ») qu'il a remise, donne une note de 0 à 100 :",
  "- d'après ce que la consigne demande et le résultat attendu ; une autre façon de faire qui marche est juste (la solution modèle n'est qu'un exemple) ;",
  "- les vérifications automatiques (auto_checks) sont des indices, pas la note : vérifie le code toi-même ;",
  "- une étape faite en partie vaut une partie des points ; un code vide ou seulement le code de départ vaut 0 ;",
  "- le commentaire (1 à 3 phrases, en français, en tutoyant l'apprenant) dit ce qui est juste, ce qui manque ou est faux et pourquoi (la ligne ou l'instruction en cause), et la notion précise à revoir ; ne donne pas la solution complète.",
  "Écris aussi un commentaire SANS note (pas de « score ») pour :",
  "- chaque mise en situation non faite (attempted: false) : ce qu'elle demandait et la notion à étudier ;",
  "- chaque QCM (ils sont déjà notés automatiquement) : si la réponse est juste, une phrase qui confirme pourquoi ; sinon, pourquoi son choix est faux, ce qui est juste, et la notion à revoir.",
  "Chaque apprenant doit donc avoir un commentaire pour CHAQUE item.",
  "Tout commentaire d'un item qui n'est pas entièrement réussi (score < 100, situation non faite, QCM faux ou sans réponse) se termine par une phrase « À revoir : … » qui nomme les notions précises à retravailler, tirées de SES erreurs (par exemple « À revoir : l'événement submit d'un formulaire ; e.preventDefault() »).",
  "Puis, pour chaque apprenant, un commentaire général (2 à 4 phrases, tutoiement) : ses points forts, ce qu'il doit retravailler.",
  "Garde exactement les identifiants donnés (« learner » et « item »).",
  "Réponds UNIQUEMENT avec un JSON au format de « output_format », sans texte autour (je l'importerai dans ClassBot).",
].join("\n");
export async function answersExport(env: Env, g: GuildRow, id: number) {
  const m = await getMise(env, g, id);
  const c = contentOf(m);
  const takers = await all<MiseTakerRow>(env, "SELECT * FROM mise_takers WHERE mise_id = ? AND status != 'invited' ORDER BY id", id);
  const names = new Map((await all<{ discord_id: string; name: string | null }>(env, "SELECT discord_id, name FROM players WHERE guild_id = ?", g.id)).map((p) => [p.discord_id, p.name || ""] as const));
  const staff = await staffIds(env, g.id);
  const items = [
    ...c.situations.map((s, i) => ({ item: s.id, kind: "situation", label: `Mise en situation ${i + 1}`, title: s.title, points: s.points, competencies: s.competencies, notions: s.notions,
      context: s.context, questions: s.questions, expected: s.expected, starter_files: s.files.map((f) => ({ name: f.name, content: f.starter })),
      model_solution: s.solution, auto_checks: s.checks.map((k) => k.label) })),
    ...c.qcm.map((q, i) => ({ item: q.id, kind: "qcm", label: `QCM ${i + 1}`, points: q.points, notion: q.notion, question: q.question, ...(q.code ? { code: q.code } : {}), choices: q.choices, correct: q.correct, correct_text: q.choices[q.correct] })),
  ];
  const learners = takers.map((t) => {
    const d = dataOf(t), sc = scoreMise(c, d), spent = parse<Record<string, number>>(t.spent, {});
    const work: Record<string, any> = {};
    for (const s of c.situations) {
      const a = d.answers[s.id] || {};
      const res = d.checks[s.id]?.results ?? [];
      work[s.id] = { attempted: !!sc.items[s.id]?.attempted, files: a.files || {}, auto_checks: res.map((r) => ({ check: s.checks.find((k) => k.id === r.id)?.label ?? r.id, ok: !!r.ok })),
        auto_score: sc.items[s.id]?.auto ?? null, minutes: Math.round((spent[s.id] || 0) / 60000) };
    }
    for (const q of c.qcm) {
      const ch = d.answers[q.id]?.choice;
      work[q.id] = { choice: Number.isInteger(ch) ? ch : null, choice_text: Number.isInteger(ch) ? q.choices[ch] ?? null : null, right: ch === q.correct };
    }
    const ev = parse<MiseEvent[]>(t.events, []);
    return { learner: String(t.id), name: names.get(t.discord_id) || t.discord_id, status: t.status, ...(staff.has(t.discord_id) ? { test: true } : {}),
      auto_score: sc.total, pastes: ev.filter((e) => e[1] === "paste").length, work };
  });
  return {
    format: "classbot-mise-answers@1", exported_at: new Date(now() * 1000).toISOString(),
    mise: { id: m.id, title: c.title || m.title, metier: c.metier, week: m.week, competencies: c.competencies },
    instructions: GRADE_PROMPT,
    output_format: {
      format: GRADE_FORMAT,
      grades: [{ learner: "<learner>", item: "<item d'une mise en situation faite>", score: "<0 à 100>", comment: "<1 à 3 phrases>" }, { learner: "<learner>", item: "<item d'un QCM ou d'une situation non faite>", comment: "<1 à 3 phrases, sans score>" }],
      comments: [{ learner: "<learner>", comment: "<2 à 4 phrases>" }],
    },
    items, learners,
  };
}
/** Claude's correction back: each grade becomes the teacher's grade of that item (still editable), each comment theirs. */
export async function importGrades(env: Env, g: GuildRow, id: number, text: unknown) {
  const m = await getMise(env, g, id);
  const c = contentOf(m);
  let j: any;
  try { j = typeof text === "string" ? extractJson(text) : text; } catch { j = null; }
  if (!j || typeof j !== "object" || (!Array.isArray(j.grades) && !Array.isArray(j.comments))) throw new MiseError("This isn't Claude's correction: paste the JSON it answered (with « grades » and « comments »).");
  const takers = await all<MiseTakerRow>(env, "SELECT * FROM mise_takers WHERE mise_id = ? AND status != 'invited'", id);
  const names = new Map((await all<{ discord_id: string; name: string | null }>(env, "SELECT discord_id, name FROM players WHERE guild_id = ?", g.id)).map((p) => [p.discord_id, (p.name || "").toLowerCase()] as const));
  const who = (v: unknown) => { const k = String(v ?? "").trim(); return takers.find((t) => String(t.id) === k) || takers.find((t) => t.discord_id === k) || takers.find((t) => k && names.get(t.discord_id) === k.toLowerCase()) || null; };
  const ids = new Set([...c.situations.map((s) => s.id), ...c.qcm.map((q) => q.id)]);
  // every comment of an item not fully right ends with what to study again: when Claude forgot, the item's notions
  const notionsOf = (item: string) => { const s = c.situations.find((x) => x.id === item); if (s) return s.notions.length ? s.notions.join(", ") : s.title; const q = c.qcm.find((x) => x.id === item); return q ? q.notion : ""; };
  const restudy = (t: MiseTakerRow, item: string, note: string, score: number | null) => {
    if (!note || /à (revoir|étudier|retravailler)\s*:/i.test(note)) return note;
    const q = c.qcm.find((x) => x.id === item);
    const ok = q ? dataOf(t).answers[item]?.choice === q.correct : score != null && score >= 100;
    const n = notionsOf(item);
    return ok || !n ? note : `${note.replace(/\s*$/, "")}${/[.!?…]$/.test(note.trim()) ? "" : "."} À revoir : ${n}.`.slice(0, 600);
  };
  const skipped: string[] = [];
  const byTaker = new Map<number, Record<string, any>>();
  let grades = 0, comments = 0;
  for (const x of (Array.isArray(j.grades) ? j.grades : []).slice(0, 2000)) {
    const t = who(x?.learner), item = String(x?.item ?? "");
    const sc = Number(x?.score);
    if (!t) { skipped.push(`unknown learner « ${String(x?.learner ?? "").slice(0, 40)} »`); continue; }
    if (!ids.has(item)) { skipped.push(`unknown item « ${item.slice(0, 20)} »`); continue; }
    const noScore = x?.score === null || x?.score === undefined || x?.score === "";
    const note = restudy(t, item, str(x?.comment, 560), noScore ? (c.qcm.some((q) => q.id === item) ? null : 0) : Math.round(sc));
    if (noScore && !note) { skipped.push(`nothing for ${item}`); continue; }
    if (!noScore && !Number.isFinite(sc)) { skipped.push(`no score for ${item}`); continue; }
    const gr = byTaker.get(t.id) ?? parse<Record<string, any>>(t.grades, {});
    // no score (a QCM, an item not done): only the comment; the score stays (automatic, or the one already given)
    gr[item] = noScore ? { ...(gr[item] || {}), comment: note } : { score: Math.max(0, Math.min(100, Math.round(sc))), comment: note, teacher: true, by: "claude" };
    byTaker.set(t.id, gr); grades++;
  }
  for (const [tid, gr] of byTaker) { await run(env, "UPDATE mise_takers SET grades = ? WHERE id = ?", JSON.stringify(gr), tid); await refreshScore(env, tid); }
  for (const x of (Array.isArray(j.comments) ? j.comments : []).slice(0, 500)) {
    const t = who(x?.learner), txt = str(x?.comment, 1000);
    if (!t) { skipped.push(`unknown learner « ${String(x?.learner ?? "").slice(0, 40)} »`); continue; }
    if (!txt) continue;
    await run(env, "UPDATE mise_takers SET comment = ? WHERE id = ?", txt, t.id); comments++;
  }
  return { grades, comments, learners: byTaker.size, skipped: [...new Set(skipped)].slice(0, 20) };
}

// ------------------------------------------------------------------ cron
/** Time is up: the session closes, the papers still open are handed in as they are. */
export async function miseCron(env: Env) {
  const late = await all<{ id: number }>(env, "SELECT id FROM mises WHERE status = 'live' AND ends_at IS NOT NULL AND ends_at < ? LIMIT 3", now() - 60).catch(() => []);
  for (const m of late) {
    await run(env, "UPDATE mises SET status = 'closed', closed_at = ? WHERE id = ?", now(), m.id);
    const open = await all<{ id: number }>(env, "SELECT id FROM mise_takers WHERE mise_id = ? AND status IN ('active', 'locked', 'resume') AND minutes IS NULL", m.id);
    for (const t of open) await submitTaker(env, t.id, null, true).catch((e) => console.error("mise auto submit", e));
  }
  // learners given it later: their own time is up
  const lateOpen = await all<{ id: number }>(env, "SELECT id FROM mise_takers WHERE ends_at IS NOT NULL AND ends_at < ? AND status IN ('active', 'locked', 'resume') LIMIT 20", now() - 60).catch(() => []);
  for (const t of lateOpen) await submitTaker(env, t.id, null, true).catch((e) => console.error("mise late auto submit", e));
}
