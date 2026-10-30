// Plan d'action: the students who need help (a weak or critical level, or warning signs), how they're doing since
// (improving or not), whether they do the work given to them (the assignments), and a comment on each one,
// written by the teacher or by the AI.
import type { Env, GuildRow } from "./types.ts";
import { aiBudgetOk, aiBudgetUse, all, now, run } from "./db.ts";
import { chat } from "./ai.ts";
import { getReview, progressView, statesOf } from "./review/debrief.ts";
import { compLabel } from "./program.ts";

export class PlanError extends Error {}

const RANK: Record<string, number> = { critique: 0, faible: 1, moyen: 2, bon: 3, excellent: 4 };
const LOW = new Set(["faible", "critique"]);

/** A student of the Students list (only what the plan reads). */
export interface PlanStudent {
  discord_id: string; name: string | null; team?: string | null; trend: string; attention: string[];
  last_active: number | null; accuracy: number | null;
}

interface NoteRow { discord_id: string; note: string | null; note_by: string | null; note_at: number | null; flagged: number }
interface AsgRow { discord_id: string; status: string; due_at: number | null; created_at: number; completed_at: number | null }

/** Improving or not, from the levels in order (debriefs and sprints), else from the activity of the last weeks. */
export function levelTrend(levels: string[], activity: string): "up" | "down" | "flat" | "unknown" {
  const r = levels.map((l) => RANK[l]).filter((v) => v != null);
  if (r.length >= 2) {
    const last = r.slice(-2), before = r.slice(-4, -2);
    const a = last.reduce((s, v) => s + v, 0) / last.length;
    const b = before.length ? before.reduce((s, v) => s + v, 0) / before.length : r[r.length - 2];
    // with only two levels: the last one against the one before
    const cmp = before.length ? a - b : r[r.length - 1] - r[r.length - 2];
    if (cmp >= 0.5) return "up";
    if (cmp <= -0.5) return "down";
    return "flat";
  }
  if (activity === "up") return "up";
  if (activity === "down" || activity === "inactive") return "down";
  if (activity === "flat") return "flat";
  return "unknown";
}

/** Engaged in the plan: what they did of the work given to them. */
export function engagement(rows: AsgRow[], lastActive: number | null, t0 = now()) {
  const done = rows.filter((r) => r.status === "done").length;
  const late = rows.filter((r) => r.status === "late").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const missed = rows.filter((r) => r.status === "missed").length;
  const open = rows.filter((r) => r.status === "open").length;
  const overdue = rows.filter((r) => r.status === "open" && r.due_at && r.due_at < t0).length;
  const closed = done + late + failed + missed + overdue;
  const pct = closed ? Math.round((100 * (done + late)) / closed) : null;
  let state: "none" | "engaged" | "partial" | "not" | "waiting";
  if (!rows.length) state = "none";
  else if (pct == null) state = lastActive && lastActive > t0 - 7 * 86400 ? "waiting" : "partial";
  else if (pct >= 70) state = "engaged";
  else if (pct >= 35) state = "partial";
  else state = "not";
  const lastDone = Math.max(0, ...rows.map((r) => r.completed_at || 0)) || null;
  return { total: rows.length, done, late, failed, missed, open, overdue, pct, state, lastDone };
}

export async function planView(env: Env, g: GuildRow, students: PlanStudent[]) {
  const P = await progressView(env, g, { finalOnly: true });
  const sprints = await all<{ discord_id: string; sprint: number; lv: string | null }>(env,
    "SELECT discord_id, sprint, COALESCE(level, plevel) AS lv FROM sprint_reviews WHERE guild_id = ? ORDER BY sprint", g.id).catch(() => []);
  const notes = await all<NoteRow>(env, "SELECT discord_id, note, note_by, note_at, flagged FROM plan_notes WHERE guild_id = ?", g.id).catch(() => []);
  const asg = await all<AsgRow>(env, "SELECT discord_id, status, due_at, created_at, completed_at FROM assignments WHERE guild_id = ? AND status != 'cancelled'", g.id);
  const noteOf = new Map(notes.map((n) => [n.discord_id, n] as const));
  const asgOf = new Map<string, AsgRow[]>();
  for (const a of asg) { if (!asgOf.has(a.discord_id)) asgOf.set(a.discord_id, []); asgOf.get(a.discord_id)!.push(a); }
  const briefNo = new Map(P.briefs.map((b, i) => [b.id, i + 1]));

  const rows = students.map((s) => {
    const id = s.discord_id;
    // the debriefs in the briefs' order (B1, B2…), then the sprint levels
    const debriefs = P.briefs.map((b) => {
      const c = P.cells[`${b.id}:${id}`];
      const lv = c ? c.lv || c.plv : "";
      return lv ? { b: briefNo.get(b.id)!, bid: b.id, title: b.title, lv, mine: !!c.lv } : null;
    }).filter(Boolean) as { b: number; bid: number; title: string; lv: string; mine: boolean }[];
    const sp = sprints.filter((r) => r.discord_id === id && r.lv && r.lv in RANK).map((r) => ({ sprint: r.sprint, lv: r.lv! }));
    const scores = P.briefs.map((b) => P.assess[`${b.id}:${id}`]).filter((a) => a && a.st === "graded").map((a) => a!.score ?? 0);
    const levels = debriefs.map((d) => d.lv);
    const current = levels[levels.length - 1] || sp[sp.length - 1]?.lv || "";
    const lowCount = levels.filter((l) => LOW.has(l)).length + sp.filter((x) => LOW.has(x.lv)).length;
    const n = noteOf.get(id);
    const eng = engagement(asgOf.get(id) || [], s.last_active);
    // only the debriefs decide (their level: the assessment, the repo analysis and the teacher's level together):
    // Faible or Critique on the last debrief puts a student in the plan; the teacher can add anyone by hand
    const lastDeb = debriefs[debriefs.length - 1];
    const debLevel = lastDeb?.lv || "";
    const why: string[] = [];
    if (LOW.has(debLevel)) why.push(`${debLevel === "critique" ? "Critique" : "Faible"} on B${lastDeb!.b} · ${lastDeb!.title}`);
    const earlierLow = debriefs.slice(0, -1).filter((d) => LOW.has(d.lv)).length;
    if (earlierLow) why.push(`${earlierLow} weak debrief(s) before`);
    if (n?.flagged === 1 && !LOW.has(debLevel)) why.unshift("Added by you");
    const lastScore = scores[scores.length - 1];
    const auto = LOW.has(debLevel);
    const inPlan = n?.flagged === 1 || (auto && n?.flagged !== -1);
    // how worried to be: critical first
    const severity = debLevel === "critique" ? 0 : debLevel === "faible" ? 1 : 2;
    return {
      discord_id: id, name: s.name || id, team: s.team ?? null, current: debLevel || current, lowCount, severity, manual: n?.flagged === 1,
      debriefs: debriefs.slice(-6), sprints: sp.slice(-4), lastScore: lastScore ?? null, avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      trend: levelTrend(levels.length >= 2 ? levels : [...sp.map((x) => x.lv), ...levels], s.trend),
      activity: s.trend, lastActive: s.last_active, accuracy: s.accuracy, why, auto, inPlan, flagged: n?.flagged ?? 0,
      engagement: eng, note: n?.note ? { text: n.note, by: n.note_by || "you", at: n.note_at } : null,
    };
  });
  const plan = rows.filter((r) => r.inPlan).sort((a, b) => a.severity - b.severity || (a.engagement.pct ?? 101) - (b.engagement.pct ?? 101) || a.name.localeCompare(b.name));
  const others = rows.filter((r) => !r.inPlan).sort((a, b) => a.name.localeCompare(b.name));
  const count = (f: (r: (typeof rows)[number]) => boolean) => plan.filter(f).length;
  return {
    plan, others,
    summary: {
      total: plan.length, critique: count((r) => r.current === "critique"), faible: count((r) => r.current === "faible"),
      improving: count((r) => r.trend === "up"), slipping: count((r) => r.trend === "down"),
      engaged: count((r) => r.engagement.state === "engaged"), notEngaged: count((r) => r.engagement.state === "not"), noWork: count((r) => r.engagement.state === "none"),
    },
  };
}

async function upsert(env: Env, g: GuildRow, sid: string, set: { note?: string | null; by?: string; flagged?: number }) {
  const t0 = now();
  await run(env, `INSERT INTO plan_notes (guild_id, discord_id, note, note_by, note_at, flagged, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (guild_id, discord_id) DO UPDATE SET
      note = CASE WHEN ? THEN excluded.note ELSE plan_notes.note END,
      note_by = CASE WHEN ? THEN excluded.note_by ELSE plan_notes.note_by END,
      note_at = CASE WHEN ? THEN excluded.note_at ELSE plan_notes.note_at END,
      flagged = CASE WHEN ? THEN excluded.flagged ELSE plan_notes.flagged END,
      updated_at = excluded.updated_at`,
    g.id, sid, set.note ?? null, set.by ?? "you", t0, set.flagged ?? 0, t0,
    "note" in set ? 1 : 0, "note" in set ? 1 : 0, "note" in set ? 1 : 0, "flagged" in set ? 1 : 0);
}

/** The teacher's comment (empty: removed), or in / out of the plan by hand. */
export async function savePlan(env: Env, g: GuildRow, sid: string, b: any) {
  const set: { note?: string | null; by?: string; flagged?: number } = {};
  if ("note" in (b || {})) { const t = String(b.note ?? "").trim().slice(0, 2000); set.note = t || null; set.by = b.by === "ai" ? "ai" : "you"; }
  if ("flagged" in (b || {})) set.flagged = [1, -1].includes(Number(b.flagged)) ? Number(b.flagged) : 0;
  if (!Object.keys(set).length) throw new PlanError("Nothing to save.");
  await upsert(env, g, sid, set);
  return { ok: true };
}

/** The AI writes the comment from what the plan knows about the student (it's saved; the teacher can edit it). */
export async function aiPlanNote(env: Env, g: GuildRow, row: Awaited<ReturnType<typeof planView>>["plan"][number]) {
  if (!(await aiBudgetOk(env, 1))) throw new PlanError("The AI is used up for today (see Settings → AI). Write the comment yourself.");
  await aiBudgetUse(env, 1);
  const fr = g.lang === "fr";
  const e = row.engagement;
  const facts = [
    `Debrief levels (oldest to newest): ${row.debriefs.map((d) => `B${d.b} ${d.title}: ${d.lv}`).join("; ") || "none yet"}`,
    row.sprints.length ? `Sprint levels: ${row.sprints.map((s) => `sprint ${s.sprint}: ${s.lv}`).join("; ")}` : "",
    row.avgScore != null ? `Assessments: average ${row.avgScore}%, last ${row.lastScore}%` : "",
    `Trend: ${row.trend === "up" ? "improving" : row.trend === "down" ? "slipping" : row.trend === "flat" ? "steady" : "not enough data"}; activity: ${row.activity}`,
    e.total ? `Plan d'action work: ${e.total} given, ${e.done} done on time, ${e.late} late, ${e.failed} not solved, ${e.missed} missed, ${e.open} still open (${e.overdue} overdue)` : "No work given in the plan yet",
    row.accuracy != null ? `Practice accuracy: ${row.accuracy}%` : "",
    row.why.length ? `Warning signs: ${row.why.join(", ")}` : "",
    row.note?.text && row.note.by === "you" ? `The teacher's earlier comment: ${row.note.text}` : "",
  ].filter(Boolean).join("\n") + await gapsOf(env, g, row.discord_id).then((gp) => {
    const d = gp.debriefs.filter((x: any) => x.analyzed).slice(-3).map((x: any) => `B${x.b} ${x.title}: ${[x.comps.length ? `competencies not validated ${x.comps.map((c: any) => c.code).join(", ")}` : "", x.req.length ? `requirements missed: ${x.req.slice(0, 5).join("; ")}` : "", x.oral.length ? `oral notions to review: ${x.oral.join(", ")}` : ""].filter(Boolean).join(" · ")}`);
    const a = gp.assess.slice(-2).map((x: any) => `${x.title}: ${x.score}%, missed ${x.missed.slice(0, 5).map((m: any) => m.prompt.slice(0, 60)).join("; ")}`);
    return d.length || a.length ? `\nWeak points (lacunes):\n${[...d, ...a].join("\n")}` : "";
  }).catch(() => "");
  const text = await chat(env, [
    { role: "system", content: `You help a programming teacher (web development bootcamp) follow a student in an action plan for weak students. Write, in ${fr ? "French" : "English"}, a short comment for the teacher (not for the student), 3 to 4 sentences: where the student stands, their main weak points (lacunes), whether they improve and do the work given, and the one next step the teacher should take. Factual, from the data only, no invented facts, no headings, no lists, no greeting.` },
    { role: "user", content: `Student: ${row.name}\n${facts}` },
  ], { maxTokens: 900, temperature: 0.4, timeoutMs: 25000 }).catch(() => "");
  const t = text.trim().slice(0, 1200);
  if (!t) throw new PlanError("The AI couldn't write the comment right now (see Settings → AI). Write it yourself.");
  await upsert(env, g, row.discord_id, { note: t, by: "ai" });
  return { note: { text: t, by: "ai", at: now() } };
}

/** Each student's niveau (excellent … critique): their last debrief's level, else their last sprint's, and how it moves. */
export async function niveaux(env: Env, g: GuildRow) {
  const P = await progressView(env, g, { finalOnly: true });
  const sprints = await all<{ discord_id: string; sprint: number; lv: string | null }>(env,
    "SELECT discord_id, sprint, COALESCE(level, plevel) AS lv FROM sprint_reviews WHERE guild_id = ? ORDER BY sprint", g.id).catch(() => []);
  const out: Record<string, { lv: string; from: string; trend: string; history: string[] }> = {};
  for (const s of P.students) {
    const deb = P.briefs.map((b, i) => { const c = P.cells[`${b.id}:${s.discord_id}`]; const lv = c ? c.lv || c.plv : ""; return lv in RANK ? { lv, from: `B${i + 1} · ${b.title}` } : null; }).filter(Boolean) as { lv: string; from: string }[];
    const sp = sprints.filter((r) => r.discord_id === s.discord_id && r.lv && r.lv in RANK).map((r) => ({ lv: r.lv!, from: `Sprint ${r.sprint}` }));
    const last = deb[deb.length - 1] ?? sp[sp.length - 1];
    if (!last) continue;
    const seq = (deb.length >= 2 ? deb : [...sp, ...deb]).map((x) => x.lv);
    out[s.discord_id] = { lv: last.lv, from: last.from, trend: levelTrend(seq, ""), history: seq.slice(-6) };
  }
  return out;
}

/** All of a student's weak points (lacunes), debrief by debrief: requirements not met, competencies not validated,
 *  oral notions to review, the mise en situation, and the assessment questions missed. */
export async function gapsOf(env: Env, g: GuildRow, sid: string) {
  const P = await progressView(env, g);
  const out: any[] = [];
  for (const [i, b] of P.briefs.entries()) {
    const c = P.cells[`${b.id}:${sid}`];
    if (!c) continue;
    const r = await getReview(env, b.id, c.who).catch(() => null);
    const rec = r?.rec;
    if (!rec?.result) { out.push({ b: i + 1, bid: b.id, who: c.who, title: b.title, lv: c.lv || c.plv, final: c.final, analyzed: false }); continue; }
    const st = statesOf(rec)!;
    const ex = (rec.result.exigences || []) as any[];
    const req = ex.map((e, k) => ({ e, ok: st.ex[k] })).filter((x) => !x.ok && x.e.type !== "bonus" && x.e.type !== "critere").map((x) => String(x.e.texte || "").replace(/\s*\(\s*v[ée]rif\s*:[^)]*\)/gi, "").trim()).filter(Boolean);
    const comps = ((rec.result.competences || []) as any[]).filter((x) => st.co[x.code] === false).map((x) => ({ code: compLabel(String(x.code)), why: String(x.preuve || x.justification || "").slice(0, 200) }));
    const oral = ((rec.oral || []) as any[]).map((q, k) => ({ q, ok: st.oral[k] })).filter((x) => !x.ok).map((x) => String(x.q.notion || x.q.q || "")).filter(Boolean);
    const mes = rec.challenge && st.mes.r && st.mes.r !== "valide" ? { title: String(rec.challenge.titre || rec.challenge.title || "Mise en situation"), r: st.mes.r, note: st.mes.note } : null;
    const comment = String((rec.members || {})[sid]?.comment || rec.result.feedback || "").slice(0, 1500);
    out.push({ b: i + 1, bid: b.id, who: c.who, title: b.title, lv: c.lv || c.plv, final: c.final, analyzed: true, req, comps, oral, mes, comment });
  }
  // the assessments: the questions missed or only partly right, the competencies they didn't validate
  const papers = await all<{ id: number; title: string; grades: string | null; score: number | null; questions: string; brief_id: number | null }>(env,
    `SELECT t.id, a.title, t.grades, t.score, a.questions, a.brief_id FROM assessment_takers t JOIN assessments a ON a.id = t.assessment_id
      WHERE a.guild_id = ? AND t.discord_id = ? AND t.status = 'graded' ORDER BY t.id`, g.id, sid).catch(() => []);
  const assess = papers.map((p) => {
    let grades: Record<string, any> = {}, qs: any[] = [];
    try { grades = JSON.parse(p.grades || "{}"); qs = JSON.parse(p.questions || "[]"); } catch { /* old row */ }
    const missed = qs.map((q, k) => ({ n: k + 1, prompt: String(q.prompt || "").split("\n")[0].slice(0, 160), g: grades[q.id] })).filter((x) => x.g && x.g.verdict !== "correct")
      .map((x) => ({ n: x.n, prompt: x.prompt, verdict: x.g.verdict, score: x.g.score, comment: String(x.g.comment || "").slice(0, 300) }));
    return { id: p.id, title: p.title, score: p.score, missed };
  });
  return { debriefs: out, assess };
}
