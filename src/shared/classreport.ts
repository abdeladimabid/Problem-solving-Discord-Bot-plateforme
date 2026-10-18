// The class report (Export grades): one row per student with what a teacher needs to follow them: their level
// (excellent … critique), the briefs validated or not (a brief is validated when more than half of its technical
// competencies are), the competencies they keep failing, their recurring mistakes, and their plan d'action work.
import type { Env, GuildRow } from "./types.ts";
import { all } from "./db.ts";
import { getReview, progressView, statesOf } from "./review/debrief.ts";
import { assessBase } from "./review/engine.ts";
import { planView, type PlanStudent } from "./actionplan.ts";
import { compLabel, programOf } from "./program.ts";

/** Technical competency (C3N2, C3) rather than transversal (CT5, T5). */
const isTech = (code: string) => assessBase(code).startsWith("C");

export interface BriefResult { b: number; title: string; ok: boolean; tech: number; techOk: number; failed: string[]; passed: string[] }

/** One student's debriefs: each brief validated or not, and what they missed in it. */
async function debriefsOf(env: Env, P: Awaited<ReturnType<typeof progressView>>, sid: string, cache: Map<string, any>) {
  const briefs: BriefResult[] = [], oral: string[] = [], req: string[] = [];
  let mesKo = 0;
  for (const [i, b] of P.briefs.entries()) {
    const c = P.cells[`${b.id}:${sid}`];
    if (!c) continue;
    const key = `${b.id}:${c.who}`;
    if (!cache.has(key)) cache.set(key, await getReview(env, b.id, c.who).catch(() => null));
    const rec = cache.get(key)?.rec;
    const st = statesOf(rec);
    if (!st) continue;
    // in a squad, a member's own competencies (when the teacher set them) win over the squad's
    const own = rec.members?.[sid]?.co;
    const co: Record<string, boolean> = own && Object.keys(own).length ? own : st.co;
    const tech = Object.keys(co).filter(isTech);
    const techOk = tech.filter((k) => co[k]).length;
    briefs.push({ b: i + 1, title: b.title, ok: tech.length > 0 && techOk * 2 > tech.length, tech: tech.length, techOk, failed: Object.keys(co).filter((k) => co[k] === false).map((k) => assessBase(k)), passed: Object.keys(co).filter((k) => co[k]).map((k) => assessBase(k)) });
    ((rec.oral || []) as any[]).forEach((q, k) => { if (!st.oral[k] && (q.notion || q.q)) oral.push(String(q.notion || q.q).trim()); });
    ((rec.result.exigences || []) as any[]).forEach((e, k) => { if (!st.ex[k] && e.type !== "bonus" && e.texte) req.push(String(e.texte).replace(/\s*\(\s*v[ée]rif\s*:[^)]*\)/gi, "").trim()); });
    if (rec.challenge && st.mes.r && st.mes.r !== "valide") mesKo++;
  }
  return { briefs, oral, req, mesKo };
}

/** Each item with how many times it came back, the most frequent first ("X ×3"). */
function counted(items: string[], min = 1, max = 8) {
  const n = new Map<string, number>();
  for (const x of items) n.set(x, (n.get(x) || 0) + 1);
  return [...n.entries()].filter(([, k]) => k >= min).sort((a, b) => b[1] - a[1]).slice(0, max).map(([x, k]) => (k > 1 ? `${x} ×${k}` : x));
}

export async function classReport(env: Env, g: GuildRow, students: (PlanStudent & { name: string | null })[]) {
  const P = await progressView(env, g);
  const plan = await planView(env, g, students);
  const byId = new Map([...plan.plan, ...plan.others].map((r) => [r.discord_id, r]));
  const prog = await programOf(env, g as any).catch(() => null);
  const compName = new Map<string, string>((prog?.referential || []).map((c) => [c.code, c.name] as [string, string]));
  // the assessments: average score and questions missed
  const papers = await all<{ discord_id: string; score: number | null; grades: string | null }>(env,
    `SELECT t.discord_id, t.score, t.grades FROM assessment_takers t JOIN assessments a ON a.id = t.assessment_id WHERE a.guild_id = ? AND t.status = 'graded'`, g.id).catch(() => [] as { discord_id: string; score: number | null; grades: string | null }[]);
  // commits: how many have a vague message (a habit to fix)
  const commits = await all<{ discord_id: string; n: number; bad: number }>(env,
    "SELECT discord_id, COUNT(*) AS n, SUM(bad) AS bad FROM gh_log WHERE guild_id = ? AND kind = 'commit' AND COALESCE(size, '') != 'merge' GROUP BY discord_id", g.id).catch(() => [] as { discord_id: string; n: number; bad: number }[]);
  const ghOf = new Map(commits.map((c) => [c.discord_id, c]));
  const cache = new Map<string, any>();
  const rows = [];
  for (const s of students) {
    const d = await debriefsOf(env, P, s.discord_id, cache);
    const p = byId.get(s.discord_id);
    // the competencies failed again and again, or failed and never validated since
    const fails = new Map<string, number>(), lastOk = new Map<string, number>(), lastKo = new Map<string, number>();
    d.briefs.forEach((b, i) => {
      for (const k of b.failed) { fails.set(k, (fails.get(k) || 0) + 1); lastKo.set(k, i); }
      for (const k of b.passed) lastOk.set(k, i);
    });
    // failed twice or more, or failed and not validated in a later brief
    const weak = [...fails.entries()].filter(([k, n]) => n >= 2 || !lastOk.has(k) || lastKo.get(k)! > lastOk.get(k)!)
      .sort((a, b) => b[1] - a[1]).map(([k, n]) => `${compLabel(k)}${compName.get(k) ? ` ${compName.get(k)}` : ""}${n > 1 ? ` ×${n}` : ""}`);
    const mine = papers.filter((x) => x.discord_id === s.discord_id);
    let missedQ = 0;
    for (const x of mine) { try { missedQ += Object.values(JSON.parse(x.grades || "{}") as Record<string, any>).filter((v) => v && v.verdict !== "correct").length; } catch { /* old row */ } }
    const gh = ghOf.get(s.discord_id);
    const e = p?.engagement;
    const recurring = [
      ...counted(d.req, 2, 4),
      ...(d.mesKo ? [`mise en situation non validée ×${d.mesKo}`] : []),
      ...(gh && gh.n >= 5 && gh.bad / gh.n >= 0.3 ? [`commits vagues ${gh.bad}/${gh.n}`] : []),
      ...s.attention,
    ];
    rows.push({
      name: s.name || s.discord_id, team: (s as any).team || "", level: p?.current || "", trend: p?.trend || "",
      briefs: d.briefs.length, ok: d.briefs.filter((b) => b.ok).length, ko: d.briefs.filter((b) => !b.ok).length,
      okList: d.briefs.filter((b) => b.ok).map((b) => `B${b.b} ${b.title} (${b.techOk}/${b.tech})`).join(" | "),
      koList: d.briefs.filter((b) => !b.ok).map((b) => `B${b.b} ${b.title} (${b.techOk}/${b.tech})`).join(" | "),
      weak: weak.join(" | "), oral: counted(d.oral).join(" | "), recurring: recurring.join(" | "),
      assessAvg: mine.length ? Math.round(mine.reduce((a, x) => a + (x.score ?? 0), 0) / mine.length) : "", assessMissed: mine.length ? missedQ : "",
      inPlan: p?.inPlan ? "oui" : "non", planGiven: e?.total ?? 0, planDone: e ? e.done + e.late : 0, planNotDone: e ? e.failed + e.missed + e.overdue : 0,
      planOpen: e ? e.open - e.overdue : 0, planPct: e?.pct ?? "", planNote: p?.note?.text || "",
    });
  }
  return rows;
}

const COLS: [keyof Awaited<ReturnType<typeof classReport>>[number], string, string][] = [
  ["name", "Apprenant", "Student"], ["team", "Équipe", "Team"], ["level", "Niveau", "Level"], ["trend", "Tendance", "Trend"],
  ["briefs", "Briefs débriefés", "Briefs debriefed"], ["ok", "Briefs validés", "Briefs validated"], ["ko", "Briefs non validés", "Briefs not validated"],
  ["okList", "Validés (compétences techniques)", "Validated (technical competencies)"], ["koList", "Non validés (compétences techniques)", "Not validated (technical competencies)"],
  ["weak", "Compétences à retravailler", "Competencies to work on"], ["oral", "Notions orales à revoir", "Oral notions to review"],
  ["recurring", "Problèmes récurrents", "Recurring problems"], ["assessAvg", "Évaluations (moyenne %)", "Assessments (average %)"],
  ["assessMissed", "Questions ratées", "Questions missed"], ["inPlan", "Plan d'action", "Action plan"], ["planGiven", "Travaux donnés", "Work given"],
  ["planDone", "Terminés", "Completed"], ["planNotDone", "Non terminés", "Not completed"], ["planOpen", "En cours", "In progress"],
  ["planPct", "Engagement %", "Engagement %"], ["planNote", "Commentaire", "Comment"],
];

/** The report as a CSV that opens in Excel (French: ";" as separator, like Excel in French expects). */
export function reportCsv(rows: Awaited<ReturnType<typeof classReport>>, fr: boolean) {
  const sep = fr ? ";" : ",";
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const TREND: Record<string, [string, string]> = { up: ["en progrès", "improving"], down: ["en baisse", "slipping"], flat: ["stable", "steady"] };
  const val = (r: Awaited<ReturnType<typeof classReport>>[number], k: (typeof COLS)[number][0]) =>
    k === "trend" ? (TREND[r.trend] || ["", ""])[fr ? 0 : 1] : k === "inPlan" && !fr ? (r.inPlan === "oui" ? "yes" : "no") : r[k];
  return "\ufeff" + [COLS.map((c) => (fr ? c[1] : c[2])).join(sep), ...rows.map((r) => COLS.map((c) => esc(val(r, c[0]))).join(sep))].join("\r\n");
}
