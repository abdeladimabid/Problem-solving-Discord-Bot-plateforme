// The brief an assessment is linked to (assessments.brief_id: the only place the link is kept; the brief page and every
// debrief read it from there). The teacher can change it or remove it at any time, from the assessment or from the
// brief, even after the invitations and the results:
//   • the assessment keeps its papers, grades and invitations: only the link moves
//   • the draft debriefs of the old brief stop using it (they read the project only, as with no assessment), the ones
//     of the new brief start using it; their level is computed again. The oral questions written from its missed
//     questions stay (with their switches) and are marked "from an assessment no longer linked"
//   • a finalized debrief never changes (it keeps the assessment as it was when it was finalized)
//   • a brief can have several assessments; moving one onto a brief that has one asks to replace it or keep both
// planLink is pure (tested); changeLink reads and writes D1.
import type { Env, GuildRow } from "./types.ts";
import { all, now, run } from "./db.ts";
import { getReview } from "./review/debrief.ts";
import { debriefLevel, reviewStates } from "./review/engine.ts";

/** 404: the brief or the assessment doesn't exist (in this class); 400: not a brief id. */
export class LinkError extends Error { status: number; constructor(msg: string, status = 400) { super(msg); this.status = status; } }

export interface LinkPlan {
  assessment: number;
  from: number | null; to: number | null;
  same: boolean;                                     // nothing would change
  replace: number[];                                 // the other assessments of the new brief unlinked (replace = true)
  others: { id: number; title: string }[];           // the assessments already linked to the new brief
  drafts: { from: number; to: number };              // draft debriefs of each brief (they follow the change)
  finals: { from: number; to: number };              // finalized ones (never changed)
}
/**
 * What changing the link would do (pure). `briefs`: the ids of the class's briefs; `linked`: the class's assessments
 * and their brief; `reviews`: the debriefs of the two briefs. Throws a LinkError for a brief that isn't in the class.
 */
export function planLink(o: {
  assessment: number; to: unknown; replace?: boolean;
  briefs: number[]; linked: { id: number; title: string; brief_id: number | null }[]; reviews: { brief_id: number; status: string }[];
}): LinkPlan {
  const me = o.linked.find((a) => a.id === o.assessment);
  if (!me) throw new LinkError("This assessment doesn't exist anymore.", 404);
  const raw = o.to;
  const to = raw === null || raw === undefined || raw === "" || raw === 0 || raw === "0" ? null : Number(raw);
  if (to !== null && (!Number.isInteger(to) || to < 1)) throw new LinkError("Choose a brief, or none.");
  if (to !== null && !o.briefs.includes(to)) throw new LinkError("This brief isn't in this class (or doesn't exist anymore).", 404);
  const from = me.brief_id ?? null;
  const others = to === null ? [] : o.linked.filter((a) => a.brief_id === to && a.id !== o.assessment).map((a) => ({ id: a.id, title: a.title }));
  const count = (bid: number | null, final: boolean) => (bid === null ? 0 : o.reviews.filter((r) => r.brief_id === bid && (r.status === "final") === final).length);
  const same = from === to;
  return {
    assessment: o.assessment, from, to, same,
    replace: o.replace && !same ? others.map((x) => x.id) : [], others: same ? [] : others,
    drafts: { from: same ? 0 : count(from, false), to: same ? 0 : count(to, false) },
    finals: { from: same ? 0 : count(from, true), to: same ? 0 : count(to, true) },
  };
}

/**
 * A draft debrief that stops using an assessment (pure): its oral questions written from the assessment's missed
 * questions are kept, with their switches, and marked as coming from an assessment no longer linked; linked again,
 * the mark goes. Returns how many questions changed.
 */
export function markOral(rec: any, assessmentId: number, unlinked: boolean): number {
  let n = 0;
  for (const q of Array.isArray(rec?.oral) ? rec.oral : []) {
    if (!q || q.src !== "evaluation") continue;
    if (unlinked && q.unlinked == null) { q.unlinked = assessmentId; n++; }
    else if (!unlinked && Number(q.unlinked) === assessmentId) { delete q.unlinked; n++; }
  }
  return n;
}

// ------------------------------------------------------------------ D1
async function facts(env: Env, g: GuildRow, assessmentId: number, to: unknown) {
  const briefs = (await all<{ id: number }>(env, "SELECT id FROM briefs WHERE guild_id = ?", g.id)).map((b) => b.id);
  const linked = await all<{ id: number; title: string; brief_id: number | null }>(env, "SELECT id, title, brief_id FROM assessments WHERE guild_id = ?", g.id);
  const me = linked.find((a) => a.id === assessmentId);
  const ids = [me?.brief_id, Number(to) || null].filter((x): x is number => !!x);
  const reviews = ids.length ? await all<{ brief_id: number; status: string }>(env,
    `SELECT brief_id, status FROM brief_reviews WHERE guild_id = ? AND brief_id IN (${ids.map(() => "?").join(",")})`, g.id, ...ids) : [];
  return { briefs, linked, reviews };
}
/** What the change would do, for the confirmation (nothing written). */
export async function previewLink(env: Env, g: GuildRow, assessmentId: number, to: unknown) {
  const f = await facts(env, g, assessmentId, to);
  return planLink({ assessment: assessmentId, to, briefs: f.briefs, ...f });
}
/** Change (or remove) the link, then bring the draft debriefs of both briefs up to date. Finalized ones never change. */
export async function changeLink(env: Env, g: GuildRow, assessmentId: number, to: unknown, o: { replace?: boolean } = {}) {
  const f = await facts(env, g, assessmentId, to);
  const plan = planLink({ assessment: assessmentId, to, replace: o.replace, briefs: f.briefs, ...f });
  if (plan.same) return { plan, updated: 0 };
  await run(env, "UPDATE assessments SET brief_id = ? WHERE id = ? AND guild_id = ?", plan.to, assessmentId, g.id);
  for (const id of plan.replace) await run(env, "UPDATE assessments SET brief_id = NULL WHERE id = ? AND guild_id = ?", id, g.id);
  let updated = 0;
  // the old brief's drafts: without it (and without the ones replaced, which were on the new brief: nothing to do there)
  if (plan.from) updated += await refreshDrafts(env, plan.from, (rec) => markOral(rec, assessmentId, true));
  if (plan.to) updated += await refreshDrafts(env, plan.to, (rec) => { let n = markOral(rec, assessmentId, false); for (const id of plan.replace) n += markOral(rec, id, true); return n; });
  return { plan, updated };
}
/** Every draft debrief of a brief, read again with the assessments linked now: level proposed again, oral marks. */
async function refreshDrafts(env: Env, briefId: number, touch: (rec: any) => number): Promise<number> {
  const rows = await all<{ who: string }>(env, "SELECT who FROM brief_reviews WHERE brief_id = ? AND status != 'final'", briefId);
  let n = 0;
  for (const row of rows) {
    const r = await getReview(env, briefId, row.who);   // reads the assessments linked now (rec.assess)
    if (!r || r.status === "final") continue;
    const rec = r.rec;
    const marked = touch(rec);
    let lv = rec.level || {};
    if (rec.result) {
      const prop = debriefLevel(rec, reviewStates(rec)) || "";
      // a level the AI or the switches gave follows; the one the teacher chose stays theirs
      const auto = !lv.lvl || lv.by === "calc" || lv.lvl === lv.prop;
      lv = { ...lv, prop, ...(auto && lv.lvl ? { lvl: prop, by: "calc", why: "Mis à jour : l’évaluation liée au brief a changé." } : {}), at: Date.now() };
      rec.level = lv;
    }
    await run(env, "UPDATE brief_reviews SET record = ?, level = ?, plevel = ?, updated_at = ? WHERE brief_id = ? AND who = ? AND status != 'final'",
      JSON.stringify(rec), lv.lvl || null, lv.prop || null, now(), briefId, row.who);
    if (marked || rec.result) n++;
  }
  return n;
}
/** A brief deleted: its assessments aren't linked to anything anymore (no link to a brief that doesn't exist). */
export async function unlinkBrief(env: Env, g: GuildRow, briefId: number) {
  await run(env, "UPDATE assessments SET brief_id = NULL WHERE brief_id = ? AND guild_id = ?", briefId, g.id);
}
