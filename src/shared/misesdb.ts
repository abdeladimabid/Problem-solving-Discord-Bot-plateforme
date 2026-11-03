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
  AI_CHECKS_PER_ITEM, EVENT_KINDS, aiCheckSystem, aiCheckUser, attempted, buildPrompt, categoryLabel, checkMise, classStats, defaultComment, detectMise,
  evaluateChecks, filterCategories, itemIds, liveStats, liveStatus, miseChecks, normComp, paperOf, previewOf, scoreMise, toCsv,
} from "./mises.ts";
import { chat, extractJson } from "./ai.ts";
import { aiBudgetOk, aiBudgetUse } from "./db.ts";
import { getBrief, simplonText } from "./briefs.ts";
import type { MiseContent, MiseEvent, Situation, TakerData } from "./mises.ts";
import { QCM_RULES, SIT_RULES } from "./mises.ts";

export class MiseError extends Error { status: number; constructor(msg: string, status = 400) { super(msg); this.status = status; } }

export interface MiseRow { id: number; guild_id: string; title: string; week: number | null; sprint: number | null; comps: string | null; target: string | null; settings: string | null; content: string; status: string; starts_at: number | null; ends_at: number | null; created_at: number; opened_at: number | null; closed_at: number | null }
export interface MiseTakerRow { id: number; mise_id: number; guild_id: string; discord_id: string; status: string; answers: string | null; spent: string | null; checks: string | null; ai: string | null; logs: string | null; events: string | null;
  cur_item: string | null; item_since: number | null; last_seen: number | null; grades: string | null; score: number | null; comment: string | null; invited_at: number | null; started_at: number | null; submitted_at: number | null; sent_at: number | null }
// testers: staff who take it to try it (never "the class") · lockScreen: in full screen, leaving it stops the session until
// the teacher lets them back (like an assessment) · brief: the brief it was written for
export interface MiseSettings { minutes: number; noPaste: boolean; channel: boolean; testers: string[]; lockScreen: boolean; brief: { id: number; title: string } | null }

const parse = <T>(s: string | null | undefined, d: T): T => { try { const v = s ? JSON.parse(s) : d; return v ?? d; } catch { return d; } };
const str = (v: unknown, n: number) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, n);
export const contentOf = (m: Pick<MiseRow, "content">) => parse<MiseContent>(m.content, { format: "", title: "", week: null, metier: "", competencies: [], situations: [], qcm: [] });
export const settingsOf = (m: Pick<MiseRow, "settings">): MiseSettings => {
  const s = parse<any>(m.settings, {});
  return { minutes: Math.max(0, Math.min(600, Math.round(Number(s.minutes) || 0))), noPaste: s.noPaste === true, channel: s.channel === true, testers: ids(s.testers).slice(0, 10),
    lockScreen: s.lockScreen === true, brief: briefRef(s.brief) };
};
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
  return { prompt: buildPrompt({ program: p, week: w, next: nextProgrammeWeek(p, w), techs: techSoFar(p, w), comps, metier: str(b.metier, 120), brief: br ? { title: br.title, text: br.text } : null, wishes: str(b.wishes, 1500) }), techs: techSoFar(p, w) };
}

/**
 * The AI writes it here (no copy-paste through Claude): for the brief of the week, or the objectives of the sprint and
 * the week. Checked like an import; when the AI's file has problems it gets them back once to fix them. Nothing is
 * saved: the teacher reads it, can change it, then saves.
 */
export async function generateMise(env: Env, g: GuildRow, b: any) {
  const p = await programOf(env, g);
  const { br, w, comps } = await scopeOf(env, g, p, b);
  if (!w) throw new MiseError("Pick the week of the programme: the AI keeps to what the class has seen by then.");
  if (!comps.length) throw new MiseError("Choose at least one competency.");
  if (!(await aiBudgetOk(env, 4))) throw new MiseError("ClassBot's free AI is used up for this class today: add your own AI key in Settings → AI, or try again tomorrow.");
  await aiBudgetUse(env, 4);
  const techs = techSoFar(p, w);
  const prompt = buildPrompt({ program: p, week: w, next: nextProgrammeWeek(p, w), techs, comps, metier: str(b.metier, 120), brief: br ? { title: br.title, text: br.text } : null, wishes: str(b.wishes, 1500) });
  const opts = { known: new Set(p.referential.map((c) => c.code)), selected: comps, techs, week: w.n };
  const ask = (extra: string) => chat(env, [
    { role: "system", content: "Tu es formateur en développement web. Tu réponds UNIQUEMENT avec un objet JSON valide, complet, sans texte avant ni après." },
    { role: "user", content: prompt + extra },
  ], { maxTokens: 16000, temperature: 0.5, timeoutMs: 170000, json: true });
  const read = (raw: string) => { try { return extractJson(raw); } catch { return null; } };
  let data = read(await ask("").catch((e) => { throw new MiseError(`The AI couldn't write it right now (${String((e as Error)?.message || e).slice(0, 120)}). Try again in a minute.`, 502); }));
  if (!data) throw new MiseError("The AI's answer wasn't a complete JSON. Try again (or ask for it with fewer words in your wishes).", 502);
  if (data.week == null) data.week = w.n;
  // until it matches the requirements: what can be fixed here is fixed here, the rest is written again by the AI
  // (only the situations / QCM that have a problem; the whole file when the problem is the file's), 4 rounds at most
  tidyMise(data);
  let r = checkMise(data, opts);
  // once the file is valid: a second look at the QCM (can they be guessed without knowing the notion?), twice at most
  let reviews = 0;
  const weakQcm = async () => (r.problems.length || reviews >= 2 ? [] : (reviews++, await reviewQcm(env, r.content!)));
  let weak = await weakQcm();
  for (let round = 0; round < 5 && (r.problems.length || weak.length); round++) {
    const todo = r.problems.length ? r.problems : weak;
    const next = await repairMise(data, todo, { ask, read, techs, next: nextProgrammeWeek(p, w) });
    if (!next) continue;
    if (next.week == null) next.week = w.n;
    tidyMise(next);
    const r2 = checkMise(next, opts);
    // a round that makes it worse is dropped (the next one starts again from the better file)
    if (r2.problems.length <= r.problems.length) { data = next; r = r2; weak = await weakQcm(); }
  }
  return {
    json: JSON.stringify(data, null, 2), problems: r.problems, preview: r.problems.length ? null : r.preview,
    checks: r.content ? miseChecks(r.content, { weekComps: weekComps(w), selected: comps, brief: br?.title }) : [],
    detected: { week: w.n, sprint: w.sprint ?? null, comps }, brief: br?.id ? { id: br.id, title: br.title } : null,
  };
}

/**
 * The file read again by the AI as a strict reviewer: QCM that can be guessed (traps too easy to rule out, or two right
 * answers) and situations too easy or too guided (the instructions name the method, the starter code gives the steps)
 * come back as problems to rewrite. An unavailable AI: nothing.
 */
async function reviewQcm(env: Env, c: MiseContent): Promise<{ where: string; msg: string }[]> {
  try {
    const raw = await chat(env, [
      { role: "system", content: `Tu es un formateur exigeant qui relit une évaluation de développement web avant de la donner.
QCM : imagine un apprenant qui NE CONNAÎT PAS la notion avec précision. Peut-il trouver la bonne réponse en éliminant des choix (hors sujet, d'une autre forme, absurdes) ou parce qu'elle se distingue ? Un mauvais choix est-il AUSSI juste ? Règles :
${QCM_RULES.join("\n")}
SITUATIONS : sont-elles trop faciles ou trop guidées (sous-questions qui nomment la méthode / la propriété / l'événement à utiliser, code de départ qui donne les étapes en commentaires, une seule notion triviale, aucun cas limite) ? Règles :
${SIT_RULES.join("\n")}
Réponds UNIQUEMENT avec ce JSON : {"weak": [{"n": 2, "why": "…"}], "easy": [{"n": 1, "why": "…"}]} ("weak" = numéros des QCM à refaire, "easy" = numéros des situations à rendre plus exigeantes ; listes vides si tout est bon).` },
      { role: "user", content: JSON.stringify({
        qcm: c.qcm.map((q, i) => ({ n: i + 1, question: q.question, code: q.code ?? "", choices: q.choices, correct: q.choices[q.correct] })),
        situations: c.situations.map((x, i) => ({ n: i + 1, difficulty: x.difficulty, context: x.context, questions: x.questions, starter: x.files.map((f) => f.starter).join("\n").slice(0, 1500), checks: x.checks.map((k) => k.label) })),
      }) },
    ], { maxTokens: 2500, temperature: 0.1, timeoutMs: 90000, json: true });
    const j = extractJson(raw);
    const pick = (v: any, max: number) => (Array.isArray(v) ? v : []).filter((x: any) => Number.isInteger(Number(x?.n)) && Number(x.n) >= 1 && Number(x.n) <= max).slice(0, max);
    return [
      ...pick(j?.weak, c.qcm.length).map((x: any) => ({ where: `QCM ${Number(x.n)}`, msg: `trop facile à deviner : ${String(x.why ?? "").slice(0, 200)}. Garde la notion ; réécris la question et les 4 choix : 3 pièges qui ressemblent à la bonne réponse (même forme, un détail exact change), une seule réponse juste.` })),
      ...pick(j?.easy, c.situations.length).map((x: any) => ({ where: `situation ${Number(x.n)}`, msg: `trop facile ou trop guidée : ${String(x.why ?? "").slice(0, 200)}. Rends-la plus exigeante (même difficulté relative, même métier) : plusieurs notions combinées, des cas limites, des sous-questions qui disent quoi faire sans dire comment, un code de départ sans les étapes, des vérifications sur les cas limites ; mets à jour la solution et les vérifications.` })),
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
async function repairMise(data: any, problems: { where: string; msg: string }[], o: { ask: (extra: string) => Promise<string>; read: (raw: string) => any; techs: string[]; next: ProgramWeek | null }) {
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
    return `- ${where} (clé "${kind === "QCM" ? "q" : "s"}${n}") :\n  problèmes : ${msgs.join(" | ")}\n  actuel : ${JSON.stringify(cur ?? {}).slice(0, 9000)}`;
  });
  const d = o.read(await o.ask(`\n\nDANS TA PROPOSITION, CES ÉLÉMENTS NE RESPECTENT PAS LES EXIGENCES. Réécris UNIQUEMENT ces éléments, entièrement, en réglant chaque problème (garde le même thème, la même difficulté et la même notion quand c'est possible ; si une notion est hors périmètre, remplace-la par une notion du périmètre) :\n${list.join("\n")}\n${scope}\nRéponds UNIQUEMENT avec ce JSON : {"items": {"s5": { …la mise en situation complète… }, "q5": { …le QCM complet… }}}`).catch(() => ""));
  const got = d?.items && typeof d.items === "object" ? d.items : null;
  if (!got) return null;
  for (const [k, v] of Object.entries(got)) {
    const m = /^([sq])(\d)$/.exec(k);
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
  const r = checkMise(b.json, { known: new Set(p.referential.map((c) => c.code)), selected: comps, techs: w ? techSoFar(p, w) : [], week: w?.n ?? null });
  const detected = { week: w?.n ?? null, sprint: w?.sprint ?? null, comps, title: det.title };
  const brief = br?.id ? { id: br.id, title: br.title } : null;
  const checks = r.content ? miseChecks(r.content, { weekComps: weekComps(w), selected: comps, brief: brief?.title }) : [];
  if (r.problems.length || !b.save) return { problems: r.problems, preview: r.problems.length ? null : r.preview, checks, detected, brief };
  const c = r.content!;
  const res = await run(env, "INSERT INTO mises (guild_id, title, week, sprint, comps, target, settings, content, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)",
    g.id, str(b.title, 120) || c.title, w?.n ?? null, w?.sprint ?? null, JSON.stringify(comps.length ? comps : c.competencies), JSON.stringify(ids(b.target)),
    JSON.stringify({ minutes: 0, noPaste: false, channel: false, testers: ids(b.testers).slice(0, 10), lockScreen: true, brief }), JSON.stringify(c), now());
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
    const r = checkMise(b.json ?? contentOf(m), { known: new Set(p.referential.map((c) => c.code)), selected: comps, techs: w ? techSoFar(p, w) : [], week: w?.n ?? null });
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
export const miseUrl = (env: Env, token: string) => `${(env.PUBLIC_URL || "").replace(/\/$/, "")}/mes/${token}`;

async function sendLink(env: Env, m: MiseRow, tk: { id: number; discord_id: string }) {
  const url = miseUrl(env, await takerToken(env, tk.id, linkExp(m)));
  const c = contentOf(m), st = settingsOf(m);
  const when = m.starts_at && m.starts_at > now() ? `Elle commence <t:${m.starts_at}:F>.` : "Elle est ouverte maintenant.";
  return dm(env, tk.discord_id, {
    embeds: [{ title: `🧪 Mise en situation : ${m.title}`, color: 0x2563eb,
      description: [`${c.situations.length} mises en situation avec du code et ${c.qcm.length} QCM, dans ton navigateur.`, when,
        m.ends_at ? `À rendre avant <t:${m.ends_at}:F>.` : st.minutes ? `Durée : ${st.minutes} minutes.` : "", "Ce lien est personnel : ne le partage pas."].filter(Boolean).join("\n") }],
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
export async function resend(env: Env, g: GuildRow, id: number, takerId: number) {
  const m = await getMise(env, g, id);
  const tk = await one<{ id: number; discord_id: string }>(env, "SELECT id, discord_id FROM mise_takers WHERE id = ? AND mise_id = ?", takerId, id);
  if (!tk) throw new MiseError("Unknown learner.", 404);
  if (statusOf(m) === "closed") throw new MiseError("This mise en situation is closed.");
  return { sent: (await sendLink(env, m, tk)) ? 1 : 0 };
}
/** The links, to copy when a DM didn't arrive. */
export async function links(env: Env, g: GuildRow, id: number) {
  const m = await getMise(env, g, id);
  const takers = await all<{ id: number; discord_id: string }>(env, "SELECT id, discord_id FROM mise_takers WHERE mise_id = ?", id);
  return Object.fromEntries(await Promise.all(takers.map(async (t) => [t.discord_id, miseUrl(env, await takerToken(env, t.id, linkExp(m)))] as [string, string])));
}
/** More time for everyone (a session without an end gets one only when asked). */
export async function extend(env: Env, g: GuildRow, id: number, minutes: number) {
  const m = await getMise(env, g, id);
  const add = Math.max(1, Math.min(600, Math.round(minutes) || 0));
  if (m.status === "draft") throw new MiseError("Launch it first.");
  const base = Math.max(m.ends_at ?? now(), now());
  await run(env, "UPDATE mises SET ends_at = ?, status = 'live', closed_at = NULL WHERE id = ?", base + add * 60, id);
}
/** Close it for everyone: the papers still open are handed in as they are. */
export async function closeMise(env: Env, g: GuildRow, id: number) {
  await getMise(env, g, id);
  await run(env, "UPDATE mises SET status = 'closed', closed_at = ?, ends_at = COALESCE(MIN(ends_at, ?), ?) WHERE id = ?", now(), now(), now(), id);
  const open = await all<{ id: number }>(env, "SELECT id FROM mise_takers WHERE mise_id = ? AND status IN ('active', 'locked', 'resume')", id);
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
  return { title: m.title, metier: c.metier, status: t.status === "submitted" ? "submitted" : statusOf(m), taker: t.status, name: p?.name ?? null,
    n: { situations: c.situations.length, qcm: c.qcm.length }, startsAt: m.starts_at, endsAt: m.ends_at, now: now(), noPaste: st.noPaste,
    lockScreen: st.lockScreen, lockWhy: t.status === "locked" || t.status === "resume" ? lockWhy(t) : null };
}
/** Why their session stopped (the last "lock" event): fullscreen, hidden, blur, reload. */
const lockWhy = (t: Pick<MiseTakerRow, "events">) => String(parse<MiseEvent[]>(t.events, []).filter((e) => e[1] === "lock").at(-1)?.[4] ?? "fullscreen");
/** The learner writes: only theirs, only while the session is live and their paper isn't handed in (nor stopped). */
async function writable(env: Env, takerId: number) {
  const x = await loadTaker(env, takerId);
  if (!x) throw new MiseError("unknown", 404);
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
  if (t.status === "invited") {
    await run(env, "UPDATE mise_takers SET status = 'active', started_at = ?, last_seen = ?, cur_item = ?, item_since = ? WHERE id = ? AND status = 'invited'", t0, t0, c.situations[0]?.id ?? "q1", t0, t.id);
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
    endsAt: m.ends_at, now: t0, noPaste: settingsOf(m).noPaste, lockScreen: settingsOf(m).lockScreen, status: "active",
  };
}

/** Full screen rule: they left it (or the tab, the window): the session stops until the teacher lets them back. */
export async function lockTaker(env: Env, takerId: number, what: unknown) {
  const x = await loadTaker(env, takerId);
  if (!x || x.t.status !== "active" || !settingsOf(x.m).lockScreen) return { ok: false };
  const why = ["fullscreen", "hidden", "blur", "reload"].includes(String(what)) ? String(what) : "fullscreen";
  const r = await run(env, "UPDATE mise_takers SET status = 'locked', last_seen = ? WHERE id = ? AND status = 'active'", now(), x.t.id);
  if (r.meta.changes) await pushEvent(env, x.t.id, [now(), "lock", x.t.cur_item ?? "", 0, why]);
  return { ok: true, status: "locked" };
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
/** The files of a situation as the learner sent them (only its own file names, sizes capped). */
function filesOf(s: Situation, raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of s.files) { const v = raw && typeof raw === "object" ? (raw as any)[f.name] : undefined; out[f.name] = typeof v === "string" ? v.slice(0, 20000) : f.starter; }
  return out;
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
    const ans = s ? { files: filesOf(s, b.answer?.files) } : { choice: Number.isInteger(Number(b.answer?.choice)) && Number(b.answer.choice) >= 0 && Number(b.answer.choice) < (q?.choices.length ?? 0) ? Number(b.answer.choice) : null };
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
  for (const [name, f] of Object.entries(raw.files).slice(0, 4) as [string, any][]) {
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
  const extra = kind === "paste" || kind === "paste-blocked" ? str(b.text, 400) : undefined;
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
  const files = filesOf(s, b.files);
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
      const outs = await Promise.all(stdins.map((x) => runOnce(env, lang, files[main.name], x)));
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
  const files = b.files ? filesOf(s, b.files) : filesOf(s, parse<any>(t.answers, {})[s.id]?.files);
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
  const rows = takers.map((t) => {
    const ev = parse<MiseEvent[]>(t.events, []);
    const st = liveStats(ev, t0);
    const d = dataOf(t);
    const sc = scoreMise(c, d);
    const spent = parse<Record<string, number>>(t.spent, {});
    return {
      id: t.id, discord_id: t.discord_id, name: names.get(t.discord_id) ?? null, test: staff.has(t.discord_id), status: t.status, live: liveStatus(t, st, t0),
      lockWhy: t.status === "locked" || t.status === "resume" ? lockWhy(t) : null, locks: ev.filter((e) => e[1] === "lock").length,
      // right so far: a QCM answered right, a situation whose last run passed every check
      correct: itemIds(c).filter((k) => sc.items[k]?.attempted && sc.items[k]?.score === 100).length,
      item: t.cur_item, itemSince: t.item_since, answered: itemIds(c).filter((k) => attempted(c, k, d.answers[k])).length,
      timeSec: t.started_at ? Math.max(0, (t.submitted_at ?? t0) - t.started_at) : 0, workSec: Math.round(Object.values(spent).reduce((a, b) => a + (Number(b) || 0), 0) / 1000),
      runs: st.runs, checks: st.checks, leaves: st.leaves, awaySec: st.awaySec, away: st.away, pastes: st.pastes, pasteChars: st.pasteChars, blockedPastes: st.blockedPastes,
      lastAt: Math.max(t.last_seen ?? 0, st.lastAt ?? 0) || null, started_at: t.started_at, submitted_at: t.submitted_at,
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
  if (b.score === null || b.score === "") delete grades[item];
  else grades[item] = { score: Math.max(0, Math.min(100, Math.round(Number(b.score) || 0))), comment: str(b.comment, 600), teacher: true };
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
    const lines = [...c.situations.map((s, i) => `${icon(sc.items[s.id].score, sc.items[s.id].attempted)} **Situation ${i + 1}** · ${s.title} — ${sc.items[s.id].score ?? 0} %`),
      ...c.qcm.map((q, i) => `${icon(sc.items[q.id].score, sc.items[q.id].attempted)} **QCM ${i + 1}** · ${q.notion}`)];
    const comment = str(t.comment, 1000) || defaultComment(sc.total, weakNotions(c, sc));
    const ok = await dm(env, t.discord_id, { embeds: [{ title: `🧪 ${m.title} : ${sc.total} %`, color: sc.total >= 60 ? 0x16a34a : 0xd97706, description: [comment, "", ...lines].join("\n").slice(0, 4000) }] });
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

// ------------------------------------------------------------------ cron
/** Time is up: the session closes, the papers still open are handed in as they are. */
export async function miseCron(env: Env) {
  const late = await all<{ id: number }>(env, "SELECT id FROM mises WHERE status = 'live' AND ends_at IS NOT NULL AND ends_at < ? LIMIT 3", now() - 60).catch(() => []);
  for (const m of late) {
    await run(env, "UPDATE mises SET status = 'closed', closed_at = ? WHERE id = ?", now(), m.id);
    const open = await all<{ id: number }>(env, "SELECT id FROM mise_takers WHERE mise_id = ? AND status IN ('active', 'locked', 'resume')", m.id);
    for (const t of open) await submitTaker(env, t.id, null, true).catch((e) => console.error("mise auto submit", e));
  }
}
