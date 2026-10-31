// 🏠 The dashboard's home: what the teacher needs to know about the class now, in one request (its reads in parallel).
//   • what waits for them (help, questions, debriefs to do or finalize, mini briefs to validate, plans overdue, papers to grade, integrity)
//   • the students to watch: likely to decline (the outlook from their levels, trend, work and activity), weak without a plan, quiet
//   • the ones improving · the class's levels · the current sprint and its briefs (handed in, debriefed)
import type { Env, GuildRow } from "./types.ts";
import { all, now, one } from "./db.ts";
import { planView, type PlanStudent } from "./actionplan.ts";
import { forecast } from "./stuinsight.ts";
import { plansSummary } from "./workplan.ts";
import { programOf } from "./program.ts";
import { sprintsOf } from "./sprints.ts";

const LOW = new Set(["faible", "critique"]);
const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

export async function classHome(env: Env, g: GuildRow, students: (PlanStudent & { name: string | null })[]) {
  const t0 = now(), today = day(t0);
  const n = (sql: string, ...a: unknown[]) => one<{ n: number }>(env, sql, ...a).then((r) => r?.n ?? 0).catch(() => 0);
  const [pv, tlRows, plans, handsWaiting, oldestHand, faq, drafts, toDebrief, toGrade, flagged, briefRows, prog, handins, finals] = await Promise.all([
    planView(env, g, students),
    all<{ k: string; v: string }>(env, "SELECT k, v FROM app_settings WHERE k LIKE ?", `stulevel:${g.id}:%`).catch(() => []),
    plansSummary(env, g).catch(() => []),
    n("SELECT COUNT(*) AS n FROM hands WHERE guild_id = ? AND status = 'waiting'", g.id),
    one<{ t: number | null }>(env, "SELECT MIN(created_at) AS t FROM hands WHERE guild_id = ? AND status = 'waiting'", g.id).then((r) => r?.t ?? null).catch(() => null),
    n("SELECT COUNT(*) AS n FROM faq WHERE guild_id = ? AND status = 'pending'", g.id),
    n("SELECT COUNT(*) AS n FROM brief_reviews r JOIN briefs b ON b.id = r.brief_id WHERE r.guild_id = ? AND r.status != 'final' AND b.status = 'assigned'", g.id),
    n(`SELECT COUNT(*) AS n FROM brief_handins h JOIN briefs b ON b.id = h.brief_id
        WHERE h.guild_id = ? AND b.status = 'assigned' AND b.due_at < ? AND NOT EXISTS (SELECT 1 FROM brief_reviews r WHERE r.brief_id = h.brief_id AND r.who = h.who)`, g.id, t0),
    n("SELECT COUNT(*) AS n FROM assessment_takers WHERE guild_id = ? AND status = 'submitted'", g.id),
    n("SELECT COUNT(*) AS n FROM attempts WHERE guild_id = ? AND integrity IS NOT NULL AND reviewed = 0 AND json_extract(integrity, '$.level') > 0", g.id),
    all<{ id: number; title: string; week: number | null; due_at: number | null; start_at: number | null; status: string; sprint: number | null; kind: string | null; squads: string | null }>(env,
      "SELECT id, title, week, due_at, start_at, status, sprint, kind, squads FROM briefs WHERE guild_id = ?", g.id),
    programOf(env, g),
    all<{ brief_id: number; n: number }>(env, "SELECT brief_id, COUNT(*) AS n FROM brief_handins WHERE guild_id = ? GROUP BY brief_id", g.id).catch(() => []),
    all<{ brief_id: number; n: number }>(env, "SELECT brief_id, COUNT(*) AS n FROM brief_reviews WHERE guild_id = ? AND status = 'final' GROUP BY brief_id", g.id).catch(() => []),
  ]);
  const teacherLv = new Map<string, string>();
  for (const r of tlRows) { try { const v = JSON.parse(r.v); if (v?.level) teacherLv.set(r.k.split(":").pop()!, v.level); } catch { /* skip */ } }
  const planOf = new Map<string, (typeof plans)[number]>();
  for (const p of plans) if (p.status !== "done" && !planOf.has(p.sid)) planOf.set(p.sid, p);
  const byId = new Map(students.map((s) => [s.discord_id, s]));

  // each student: their level (yours, else their last debrief's), the outlook, and why
  const seen = new Set<string>();
  const people = [...pv.plan, ...pv.others].filter((r) => !seen.has(r.discord_id) && seen.add(r.discord_id)).map((r) => {
    const s = byId.get(r.discord_id);
    const level = teacherLv.get(r.discord_id) || r.current || null;
    const idle = s?.last_active ? Math.floor((t0 - s.last_active) / 86400) : null;
    const plan = planOf.get(r.discord_id) || null;
    const f = forecast({ level, trend: r.trend, themes: [], engagement: r.engagement.state, planPct: plan?.status === "sent" ? plan.pct : null, idleDays: idle, assess: (r as any).scores || [] });
    return { id: r.discord_id, name: r.name, level, mine: teacherLv.has(r.discord_id), trend: r.trend, way: f.way, score: f.score, reasons: f.reasons.filter((x) => !x.good).map((x) => x.t).slice(0, 3),
      good: f.reasons.filter((x) => x.good).map((x) => x.t).slice(0, 2), idle, plan: plan ? { id: plan.id, status: plan.status, pct: plan.pct } : null, inPlan: r.inPlan, avgScore: r.avgScore };
  });
  const decline = people.filter((p) => p.way === "down").sort((a, b) => a.score - b.score);
  const noPlan = people.filter((p) => p.way !== "down" && LOW.has(p.level || "") && !p.plan).sort((a, b) => (a.level === "critique" ? -1 : 0) - (b.level === "critique" ? -1 : 0));
  const quiet = people.filter((p) => p.way !== "down" && !noPlan.includes(p) && p.idle != null && p.idle >= 5).sort((a, b) => (b.idle ?? 0) - (a.idle ?? 0));
  const improving = people.filter((p) => p.way === "up" && !quiet.includes(p)).sort((a, b) => b.score - a.score);

  // the class's levels
  const levels: Record<string, number> = { excellent: 0, bon: 0, moyen: 0, faible: 0, critique: 0, none: 0 };
  for (const p of people) levels[p.level && p.level in levels ? p.level : "none"]++;

  // the sprint now (or the next one), its days, its briefs: handed in and debriefed
  const sps = sprintsOf(prog, briefRows);
  const cur = sps.find((x) => x.start <= today && today <= x.end) || sps.find((x) => x.start > today) || sps[sps.length - 1] || null;
  const hand = new Map(handins.map((r) => [r.brief_id, r.n] as const)), fin = new Map(finals.map((r) => [r.brief_id, r.n] as const));
  const units = (b: (typeof briefRows)[number]) => { if (b.kind === "squad") { try { const q = JSON.parse(b.squads || "[]"); if (Array.isArray(q) && q.length) return q.length; } catch { /* solo */ } } return students.length; };
  const sprint = cur ? {
    n: cur.n, title: cur.title, start: cur.start, end: cur.end,
    daysLeft: Math.max(0, Math.round((Date.parse(cur.end + "T23:59:59Z") / 1000 - t0) / 86400)),
    elapsed: Math.min(100, Math.max(0, Math.round(100 * (t0 - Date.parse(cur.start + "T00:00:00Z") / 1000) / Math.max(1, Date.parse(cur.end + "T23:59:59Z") / 1000 - Date.parse(cur.start + "T00:00:00Z") / 1000)))),
    briefs: briefRows.filter((b) => cur.briefs.includes(b.id)).sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0)).map((b) => ({ id: b.id, title: b.title, due_at: b.due_at, units: units(b), handins: hand.get(b.id) || 0, debriefed: fin.get(b.id) || 0, past: !!(b.due_at && b.due_at < t0) })),
    next: sps.find((x) => x.start > (cur.end || today)) ? { n: sps.find((x) => x.start > cur.end)!.n, title: sps.find((x) => x.start > cur.end)!.title, start: sps.find((x) => x.start > cur.end)!.start } : null,
  } : null;

  const todo = [
    handsWaiting ? { k: "hands", n: handsWaiting, since: oldestHand } : null,
    toDebrief ? { k: "debrief", n: toDebrief } : null,
    drafts ? { k: "finalize", n: drafts } : null,
    plans.reduce((a, p) => a + (p.toReview || 0), 0) ? { k: "minibrief", n: plans.reduce((a, p) => a + (p.toReview || 0), 0) } : null,
    plans.filter((p) => p.status === "sent" && p.due_at && p.due_at < t0).length ? { k: "planlate", n: plans.filter((p) => p.status === "sent" && p.due_at && p.due_at < t0).length } : null,
    toGrade ? { k: "grade", n: toGrade } : null,
    faq ? { k: "faq", n: faq } : null,
    flagged ? { k: "integrity", n: flagged } : null,
  ].filter(Boolean);
  return { todo, decline: decline.slice(0, 8), noPlan: noPlan.slice(0, 6), quiet: quiet.slice(0, 6), improving: improving.slice(0, 6), levels, total: people.length, sprint,
    plans: { live: plans.filter((p) => p.status === "sent").length, drafts: plans.filter((p) => p.status === "draft").length } };
}
