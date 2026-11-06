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
import { progressView } from "./review/debrief.ts";

const LOW = new Set(["faible", "critique"]);
const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

export async function classHome(env: Env, g: GuildRow, students: (PlanStudent & { name: string | null })[]) {
  const t0 = now(), today = day(t0);
  const n = (sql: string, ...a: unknown[]) => one<{ n: number }>(env, sql, ...a).then((r) => r?.n ?? 0).catch(() => 0);
  // 8 weeks back from now: week 7 = the last 7 days, week 6 = the 7 before…
  const W0 = t0 - 8 * 7 * 86400, wk = 7 * 86400;
  const [pv, tlRows, plans, handsWaiting, oldestHand, faq, drafts, toDebrief, toGrade, flagged, briefRows, prog, handins, finals, att, act, PA] = await Promise.all([
    planView(env, g, students),
    all<{ k: string; v: string }>(env, "SELECT k, v FROM app_settings WHERE k LIKE ?", `stulevel:${g.id}:%`).catch(() => []),
    plansSummary(env, g).catch(() => [] as Awaited<ReturnType<typeof plansSummary>>),
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
    // week by week (8 weeks): the problems solved and failed by each student, and who was active (practice or GitHub)
    all<{ discord_id: string; w: number; solved: number; failed: number }>(env,
      `SELECT discord_id, CAST((finished_at - ?) / ? AS INTEGER) AS w, SUM(status = 'solved' OR (status = 'claimed' AND verified = 1)) AS solved, SUM(status = 'failed') AS failed
         FROM attempts WHERE guild_id = ? AND finished_at >= ? GROUP BY discord_id, w`, W0, wk, g.id, W0).catch(() => []),
    all<{ discord_id: string; w: number }>(env,
      `SELECT discord_id, CAST((t - ?) / ? AS INTEGER) AS w FROM (SELECT discord_id, started_at AS t FROM attempts WHERE guild_id = ? AND started_at >= ?
         UNION ALL SELECT discord_id, t FROM gh_activity WHERE guild_id = ? AND t >= ?) GROUP BY discord_id, w`, W0, wk, g.id, W0, g.id, W0).catch(() => []),
    // every debrief, the ones in progress too (the levels debrief after debrief)
    progressView(env, g).catch(() => null),
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
  // the sprint running now; between two sprints, the one that just ended (its briefs are still being handed in and debriefed)
  const running = sps.find((x) => x.start <= today && today <= x.end);
  const cur = running || [...sps].reverse().find((x) => x.start <= today) || sps.find((x) => x.start > today) || null;
  const hand = new Map(handins.map((r) => [r.brief_id, r.n] as const)), fin = new Map(finals.map((r) => [r.brief_id, r.n] as const));
  const units = (b: (typeof briefRows)[number]) => { if (b.kind === "squad") { try { const q = JSON.parse(b.squads || "[]"); if (Array.isArray(q) && q.length) return q.length; } catch { /* solo */ } } return students.length; };
  const sprint = cur ? {
    n: cur.n, title: cur.title, start: cur.start, end: cur.end, state: running ? "now" : cur.start > today ? "soon" : "ended",
    startsIn: Math.max(0, Math.round((Date.parse(cur.start + "T00:00:00Z") / 1000 - t0) / 86400)),
    daysLeft: Math.max(0, Math.round((Date.parse(cur.end + "T23:59:59Z") / 1000 - t0) / 86400)),
    elapsed: Math.min(100, Math.max(0, Math.round(100 * (t0 - Date.parse(cur.start + "T00:00:00Z") / 1000) / Math.max(1, Date.parse(cur.end + "T23:59:59Z") / 1000 - Date.parse(cur.start + "T00:00:00Z") / 1000)))),
    briefs: briefRows.filter((b) => cur.briefs.includes(b.id)).sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0)).map((b) => ({ id: b.id, title: b.title, due_at: b.due_at, units: units(b), handins: hand.get(b.id) || 0, debriefed: fin.get(b.id) || 0, past: !!(b.due_at && b.due_at < t0) })),
    next: (() => { const x = sps.find((y) => y.start > cur.end); return x ? { n: x.n, title: x.title, start: x.start, startsIn: Math.max(0, Math.round((Date.parse(x.start + "T00:00:00Z") / 1000 - t0) / 86400)) } : null; })(),
  } : null;

  // 📈 week by week (8 weeks, students only): problems solved, accuracy, students active
  const isStudent = new Set(students.map((x) => x.discord_id));
  const weeks = Array.from({ length: 8 }, (_, w) => ({ w, from: day(W0 + w * wk), solved: 0, failed: 0, active: 0, accuracy: null as number | null }));
  for (const r of att) if (isStudent.has(r.discord_id) && weeks[r.w]) { weeks[r.w].solved += r.solved || 0; weeks[r.w].failed += r.failed || 0; }
  for (const r of act) if (isStudent.has(r.discord_id) && weeks[r.w]) weeks[r.w].active++;
  for (const x of weeks) x.accuracy = x.solved + x.failed >= 5 ? Math.round((100 * x.solved) / (x.solved + x.failed)) : null;
  const [prevW, thisW] = [weeks[6], weeks[7]];

  // 🎓 the class's levels debrief after debrief: finalized or in progress (a draft's level is the one proposed so far)
  const perBrief = new Map<number, { b: number; bid: number; title: string; draft: number; counts: Record<string, number> }>();
  if (PA) PA.briefs.forEach((b, i) => {
    const counts: Record<string, number> = { excellent: 0, bon: 0, moyen: 0, faible: 0, critique: 0 };
    let n = 0, draft = 0;
    for (const p of people) { const c = PA.cells[`${b.id}:${p.id}`]; const lv = c ? c.lv || c.plv : ""; if (lv && lv in counts) { counts[lv]++; n++; if (!c!.final) draft++; } }
    if (n) perBrief.set(b.id, { b: i + 1, bid: b.id, title: b.title, draft, counts });
  });
  const RK: Record<string, number> = { critique: 0, faible: 1, moyen: 2, bon: 3, excellent: 4 };
  const byBrief = [...perBrief.values()].sort((a, b) => a.b - b.b).slice(-8).map((x) => {
    const n = Object.values(x.counts).reduce((a, v) => a + v, 0);
    return { ...x, n, avg: n ? Math.round((100 * Object.entries(x.counts).reduce((a, [k, v]) => a + RK[k] * v, 0)) / n) / 100 : null, low: n ? Math.round((100 * (x.counts.faible + x.counts.critique)) / n) : null };
  });

  // the briefs given with a deadline
  const given = briefRows.filter((b) => b.status === "assigned" && b.due_at).sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0));
  const RANKS: Record<string, number> = { critique: 0, faible: 1, moyen: 2, bon: 3, excellent: 4 };
  const ranked = people.filter((p) => p.level && p.level in RANKS);
  const avgRank = ranked.length ? ranked.reduce((a, p) => a + RANKS[p.level!], 0) / ranked.length : null;
  const live = plans.filter((p) => p.status === "sent");
  const lastB = byBrief[byBrief.length - 1], prevB = byBrief[byBrief.length - 2];
  const stats = {
    students: people.length,
    active: thisW.active, activePrev: prevW.active,
    solved: thisW.solved, solvedPrev: prevW.solved,
    accuracy: thisW.accuracy, accuracyPrev: prevW.accuracy,
    toDebrief, drafts, left: toDebrief + drafts,
    avgLevel: avgRank == null ? null : (["critique", "faible", "moyen", "bon", "excellent"][Math.round(avgRank)]), avgRank: avgRank == null ? null : Math.round(avgRank * 10) / 10,
    low: people.filter((p) => LOW.has(p.level || "")).length,
    lastBrief: lastB ? { b: lastB.b, avg: lastB.avg, low: lastB.low } : null, prevBrief: prevB ? { b: prevB.b, avg: prevB.avg, low: prevB.low } : null,
    plansPct: live.length ? Math.round(live.reduce((a, p) => a + (p.pct || 0), 0) / live.length) : null,
    plansLate: plans.filter((p) => p.status === "sent" && p.due_at && p.due_at < t0).length,
  };
  // ⚠️ what to watch out for: only clear signs (enough data, a real gap)
  const down = people.filter((p) => p.trend === "down").length, up = people.filter((p) => p.trend === "up").length;
  const oldHandins = given.filter((b) => (b.due_at ?? 0) < t0 - 7 * 86400).reduce((a, b) => a + Math.max(0, (hand.get(b.id) || 0) - (fin.get(b.id) || 0)), 0);
  const alerts = [
    thisW.accuracy != null && prevW.accuracy != null && prevW.accuracy - thisW.accuracy >= 10 ? { k: "accuracy", t: `Accuracy fell from ${prevW.accuracy}% to ${thisW.accuracy}% this week`, href: "#/challenges" } : null,
    prevW.solved >= 10 && thisW.solved <= prevW.solved * 0.7 ? { k: "solved", t: `${thisW.solved} problems solved this week, ${prevW.solved} the week before`, href: "#/students" } : null,
    prevW.active >= 4 && thisW.active <= prevW.active * 0.75 ? { k: "active", t: `${prevW.active - thisW.active} fewer students active than last week`, href: "#/students" } : null,
    lastB && prevB && lastB.low != null && prevB.low != null && lastB.low - prevB.low >= 10 ? { k: "low", t: `More Faible or Critique on B${lastB.b} (${lastB.low}%) than on B${prevB.b} (${prevB.low}%)`, href: "#/progress" } : null,
    down >= 3 && down > up ? { k: "down", t: `${down} students going down, ${up} going up`, href: "#/assignments" } : null,
    oldHandins ? { k: "debrief", t: `${oldHandins} hand-in${oldHandins > 1 ? "s" : ""} from over a week ago not debriefed yet`, href: "#/progress" } : null,
    stats.plansLate ? { k: "plans", t: `${stats.plansLate} plan${stats.plansLate > 1 ? "s" : ""} d'action past their due date`, href: "#/assignments" } : null,
  ].filter(Boolean);


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
  // doing well: a solid level and nothing pointing down (to fill « Improving » when few move up)
  const strong = people.filter((p) => (p.level === "excellent" || p.level === "bon") && p.way !== "down" && !improving.includes(p) && !quiet.includes(p))
    .sort((a, b) => (a.level === "excellent" ? 0 : 1) - (b.level === "excellent" ? 0 : 1) || b.score - a.score);
  return { todo, decline: decline.slice(0, 8), noPlan: noPlan.slice(0, 6), quiet: quiet.slice(0, 6), improving: improving.slice(0, 6), strong: strong.slice(0, 6), levels, total: people.length, sprint,
    trends: { up: people.filter((p) => p.trend === "up").length, flat: people.filter((p) => p.trend === "flat").length, down: people.filter((p) => p.trend === "down").length },
    plans: { live: live.length, drafts: plans.filter((p) => p.status === "draft" && p.sid !== "class").length }, stats, alerts, weeks, byBrief };
}
