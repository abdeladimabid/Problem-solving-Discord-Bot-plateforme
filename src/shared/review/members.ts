// Squad debriefs: each member gets their OWN level (Excellent → Critique), so a strong member isn't pulled down by the
// squad and a member who didn't commit doesn't get the squad's level.
//   • memberLevel proposes it from that member's data: their part of the work (commits, active days, pull requests and
//     reviews, compared with the squad), their competency switches, their quiz / oral %, their mise en situation, and
//     the squad's requirements and oral questions (shared work)
//   • memberLevelOf is what everything downstream reads (Progress, the student page, the comment, sprints): the teacher's
//     choice, else the proposal; a record from before (no member data) falls back to the squad's level
import { DEBRIEF_LEVELS, reviewStates } from "./engine.ts";

const toLevel = (sc: number) => (sc >= 0.9 ? "excellent" : sc >= 0.75 ? "bon" : sc >= 0.55 ? "moyen" : sc >= 0.35 ? "faible" : "critique");
const rank = (l: string) => DEBRIEF_LEVELS.indexOf(l);   // 0 = excellent … 4 = critique
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const part = (v: number, ref: number) => (ref > 0 ? Math.min(1, v / ref) : v > 0 ? 1 : 0);

/** A member's part of the squad's work, 0 to 1: commits and active days against the squad's average, PRs and reviews. */
export function contribution(m: any, squad: any[]): number {
  if (!m || !m.commits) return 0;
  const others = squad.length ? squad : [m];
  const c = part(m.commits, avg(others.map((x) => x.commits || 0)));
  const d = part(m.days || 0, avg(others.map((x) => x.days || 0)));
  const prAvg = avg(others.map((x) => (x.prs || 0) + (x.reviews || 0)));
  const pr = prAvg > 0 ? part((m.prs || 0) + (m.reviews || 0), prAvg) : 1;   // a squad that never opens PRs: not counted against anyone
  return 0.5 * c + 0.3 * d + 0.2 * pr;
}

/**
 * The level proposed for one member. `m`: their line of the squad's contribution (rec.contrib); `ms`: what the teacher
 * set for them (rec.members[gid]: quiz, co, mes); `states`: the squad's switches (saved, or on the screen).
 */
export function memberLevel(rec: any, m: any, ms: any = {}, states?: any): string {
  if (!rec || !m) return "";
  const st = reviewStates({ ...rec, final: states ?? rec.final });
  const ex: any[] = (rec.result && rec.result.exigences) || [];
  const main = ex.map((_, i) => i).filter((i) => ex[i].type !== "bonus" && ex[i].type !== "critere" && ex[i].type !== "oral");
  const parts: [number, number][] = [[0.3, contribution(m, rec.contrib || [])]];
  const co: Record<string, boolean> = ms && ms.co && Object.keys(ms.co).length ? ms.co : st.co;
  const codes = Object.keys(co);
  if (codes.length) parts.push([0.3, codes.filter((c) => co[c]).length / codes.length]);
  if (main.length) parts.push([0.15, main.filter((i) => st.ex[i]).length / main.length]);
  if (ms && typeof ms.quiz === "number") parts.push([0.15, Math.max(0, Math.min(100, ms.quiz)) / 100]);
  const mes = ({ valide: 1, partiel: 0.5, non_valide: 0 } as Record<string, number>)[(ms && ms.mes && ms.mes.r) || ""];
  if (mes !== undefined) parts.push([0.15, mes]);
  const or = st.oral || [];
  if (or.length) parts.push([0.1, or.filter(Boolean).length / or.length]);
  let lv = toLevel(parts.reduce((a, p) => a + p[0] * p[1], 0) / parts.reduce((a, p) => a + p[0], 0));
  // no commit in the squad's repo: never better than Faible, whatever the squad did
  if (!m.commits && rank(lv) < rank("faible")) lv = "faible";
  return lv;
}

/** Every member's level: the teacher's (lvl), the proposal (prop) and the AI's reason, for the debrief page. */
export function memberLevels(rec: any, states?: any): Record<string, { lvl: string; prop: string; why: string; by: string }> {
  const out: Record<string, { lvl: string; prop: string; why: string; by: string }> = {};
  for (const m of (rec && rec.contrib) || []) {
    const ms = (rec.members || {})[m.gid] || {};
    const L = ms.level || {};
    out[m.gid] = { lvl: L.lvl || "", prop: memberLevel(rec, m, ms, states), why: L.why || "", by: L.by || "" };
  }
  return out;
}

/** The level of one student in a debrief: in a squad, the member's own (chosen, else proposed); else the review's. */
export function memberLevelOf(rec: any, uid: string, squad: { lvl?: string | null; prop?: string | null } = {}): { lvl: string; prop: string } {
  const m = ((rec && rec.contrib) || []).find((x: any) => String(x.gid) === String(uid));
  if (!m) return { lvl: squad.lvl || "", prop: squad.prop || "" };
  const ms = (rec.members || {})[uid] || {};
  return { lvl: (ms.level && ms.level.lvl) || "", prop: memberLevel(rec, m, ms) };
}
