// The mises en situation linked to a brief (settings.brief.id): step 2 of the brief's validation, after the assessment.
// Same shape as the assessments in a debrief (rec.assess, kind "mise"): the score, the competencies it validated or not
// (competency_results source 'mise'), each learner's notions mastered / missed, the notions it's about. Optional: a
// brief without one is debriefed as before.
import type { Env } from "../types.ts";
import { all } from "../db.ts";
import { scoreMise } from "../mises.ts";
import type { MiseContent } from "../mises.ts";

const parse = <T>(s: string | null | undefined, d: T): T => { try { const v = s ? JSON.parse(s) : d; return v ?? d; } catch { return d; } };

export interface MiseMemberFacts { score: number | null; ok: string[]; ko: string[]; summary: string; comps: string[]; compsKo: string[] }

/** The mises en situation of a brief, oldest first. */
export async function misesOfBrief(env: Env, briefId: number) {
  return all<{ id: number; title: string; content: string; status: string }>(env,
    "SELECT id, title, content, status FROM mises WHERE json_extract(settings, '$.brief.id') = ? ORDER BY id", briefId).catch(() => []);
}

/** For the learners `ids` (one, or a squad's members): each linked mise en situation, like briefAssessments' items. */
export async function briefMises(env: Env, briefId: number, ids: string[]) {
  const list = await misesOfBrief(env, briefId);
  if (!list.length || !ids.length) return [];
  const out: any[] = [];
  for (const m of list) {
    const c = parse<MiseContent>(m.content, { format: "", title: "", week: null, metier: "", competencies: [], situations: [], qcm: [] });
    const scope = [...new Set([...c.situations.flatMap((s) => s.notions), ...c.qcm.map((q) => q.notion)])];
    const takers = await all<{ discord_id: string; status: string; score: number | null; answers: string | null; checks: string | null; grades: string | null; comment: string | null }>(env,
      `SELECT discord_id, status, score, answers, checks, grades, comment FROM mise_takers WHERE mise_id = ? AND discord_id IN (${ids.map(() => "?").join(",")})`, m.id, ...ids);
    const done = takers.filter((t) => t.status === "submitted");
    const base = { kind: "mise", id: m.id, title: `Mise en situation · ${m.title}`, done: done.length, of: takers.length, scope };
    if (!done.length) { out.push({ ...base, score: null, comps: {} }); continue; }
    const rows = await all<{ discord_id: string; code: string; ok: number; level: number | null; note: string | null }>(env,
      `SELECT discord_id, code, ok, level, note FROM competency_results WHERE source = 'mise' AND ref = ? AND discord_id IN (${ids.map(() => "?").join(",")})`, m.id, ...ids);
    const comps: Record<string, { ok: boolean; level: number | null; note: string | null }> = {};
    for (const r of rows) {
      const x = comps[r.code];
      // a squad: validated only if every member who took it validated it
      comps[r.code] = x ? { ok: x.ok && !!r.ok, level: Math.min(x.level ?? 1, r.level ?? 1), note: x.note } : { ok: !!r.ok, level: r.level, note: r.note };
    }
    const members: Record<string, MiseMemberFacts> = {};
    const missedBy = new Map<string, number>();
    for (const t of done) {
      const sc = scoreMise(c, { answers: parse(t.answers, {}), checks: parse(t.checks, {}), grades: parse(t.grades, {}) });
      const ok = new Set<string>(), ko = new Set<string>();
      for (const s of c.situations) for (const n of s.notions) ((sc.items[s.id]?.score ?? 0) >= 60 ? ok : ko).add(n);
      for (const q of c.qcm) ((sc.items[q.id]?.score ?? 0) >= 60 ? ok : ko).add(q.notion);
      for (const n of ko) { ok.delete(n); missedBy.set(n, (missedBy.get(n) ?? 0) + 1); }
      members[t.discord_id] = { score: t.score ?? sc.total, ok: [...ok].slice(0, 12), ko: [...ko].slice(0, 12), summary: String(t.comment || "").trim().slice(0, 700),
        comps: rows.filter((r) => r.discord_id === t.discord_id && r.ok).map((r) => r.code), compsKo: rows.filter((r) => r.discord_id === t.discord_id && !r.ok).map((r) => r.code) };
    }
    const avg = Math.round(done.reduce((s, t) => s + (members[t.discord_id]?.score ?? 0), 0) / done.length);
    out.push({ ...base, score: avg, comps, members, gaps: [...missedBy.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 8) });
  }
  return out;
}

/** What the learners missed in the linked mises en situation (for the oral questions and the AI). */
export async function miseLacunes(env: Env, briefId: number, ids: string[]): Promise<string[]> {
  const list = await misesOfBrief(env, briefId);
  if (!list.length || !ids.length) return [];
  const out: string[] = [];
  for (const m of list) {
    const c = parse<MiseContent>(m.content, { format: "", title: "", week: null, metier: "", competencies: [], situations: [], qcm: [] });
    const takers = await all<{ answers: string | null; checks: string | null; grades: string | null }>(env,
      `SELECT answers, checks, grades FROM mise_takers WHERE mise_id = ? AND status = 'submitted' AND discord_id IN (${ids.map(() => "?").join(",")})`, m.id, ...ids);
    for (const t of takers) {
      const sc = scoreMise(c, { answers: parse(t.answers, {}), checks: parse(t.checks, {}), grades: parse(t.grades, {}) });
      c.situations.forEach((s, i) => { const it = sc.items[s.id]; if (it && (it.score ?? 0) < 60) out.push(`Mise en situation S${i + 1} « ${s.title} » (${s.notions.join(", ")}) : ${it.attempted ? `${it.score ?? 0} %` : "non tentée"}`); });
      c.qcm.forEach((q, i) => { const it = sc.items[q.id]; if (it && (it.score ?? 0) < 60) out.push(`Mise en situation QCM ${i + 1} (${q.notion}) : ${it.attempted ? "faux" : "sans réponse"}`); });
    }
  }
  return out.slice(0, 10);
}
