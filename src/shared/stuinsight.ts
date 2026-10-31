// 🔭 One student at a glance, for the top of their page: where they stand (level, its journey through the debriefs and
// sprints, the trend), their lacunes (gathered from every debrief, assessment and plan d'action diagnosis, the ones that
// come back first), and what the teacher can do now to help them (ordered: the most useful first).
// Read only: it gathers what ClassBot already knows, no AI call (the AI summary is the plan d'action's comment).
import type { Env, GuildRow } from "./types.ts";
import { all, now, one } from "./db.ts";
import { gapsOf, planView, type PlanStudent } from "./actionplan.ts";
import { listPlans, planStatus } from "./workplan.ts";
import { programOf } from "./program.ts";
import { sprintsOf } from "./sprints.ts";
import { goalsText, parseGoals, touches } from "./sprintdiag.ts";
import { conceptsOf } from "./review/engine.ts";

export const LEVELS = ["critique", "faible", "moyen", "bon", "excellent"];
const RANK: Record<string, number> = { critique: 0, faible: 1, moyen: 2, bon: 3, excellent: 4 };
const LKEY = (gid: string, uid: string) => `stulevel:${gid}:${uid}`;

/** The teacher's own level for a student (empty: removed). */
export async function setTeacherLevel(env: Env, gid: string, uid: string, level: unknown, note: unknown) {
  const lv = String(level ?? "");
  if (!lv) { await env.DB.prepare("DELETE FROM app_settings WHERE k = ?").bind(LKEY(gid, uid)).run(); return null; }
  if (!LEVELS.includes(lv)) throw new Error("Unknown level.");
  const v = { level: lv, note: String(note ?? "").trim().slice(0, 300), at: now() };
  await env.DB.prepare("INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at").bind(LKEY(gid, uid), JSON.stringify(v), v.at).run();
  return v;
}

/** The level ClassBot proposes: how well they did in all their debriefs (the recent ones count more), and how many of
 *  the sprints' objectives (the planning's « Technologies / concepts ») they master so far (none of their lacunes on it). */
export function proposeLevel(debriefLevels: string[], objOk: number, objAll: number) {
  const r = debriefLevels.map((l) => RANK[l]).filter((x) => x != null);
  if (!r.length && !objAll) return null;
  let wsum = 0, w = 0;
  r.forEach((v, i) => { const k = 1 + i / Math.max(1, r.length - 1); wsum += v * k; w += k; });   // the last debrief weighs twice the first
  const deb = w ? wsum / w / 4 : null;                       // 0 … 1
  const obj = objAll ? objOk / objAll : null;                 // 0 … 1
  const score = deb != null && obj != null ? 0.65 * deb + 0.35 * obj : (deb ?? obj)!;
  const level = score >= 0.85 ? "excellent" : score >= 0.62 ? "bon" : score >= 0.42 ? "moyen" : score >= 0.22 ? "faible" : "critique";
  return { level, score: Math.round(score * 100), debriefs: r.length, debAvg: deb != null ? LEVELS[Math.round(deb * 4)] : null, objOk, objAll };
}

// ------------------------------------------------------------------ what blocks what
// How much each concept is a foundation for what comes after, and what it feeds. Only a foundation the coming sprints
// build on can block a student: Git, the semantic tags or the alt text are worth working on, but they never stop anyone
// from following the next sprint.
const C = {
  page: "la structure d’une page HTML (doctype, head, body)", link: "le lien entre une page HTML et sa feuille CSS (<link>)", form: "les formulaires HTML (form, input, label, button)",
  img: "les images et le texte alternatif (img, alt)", a: "les liens hypertextes (a, href, target)", list: "les listes et les tableaux HTML", sem: "les balises sémantiques",
  sel: "les sélecteurs CSS (balise, classe, id)", box: "le modèle de boîte et le centrage (margin, padding)", display: "la propriété display (block, inline)", flex: "Flexbox", grid: "CSS Grid",
  resp: "le responsive (media queries)", text: "la mise en forme du texte et des couleurs en CSS", pos: "le positionnement en CSS", anim: "les transitions et les animations CSS",
  ev: "les événements JavaScript (addEventListener)", dom: "la manipulation du DOM", api: "les appels d’API (fetch, async / await)", loop: "les boucles", cond: "les conditions",
  arr: "les tableaux et leurs méthodes", fn: "les fonctions", vars: "les variables", ls: "le localStorage", sql: "les requêtes SQL", poo: "la programmation orientée objet", git: "Git (commit, branches)",
};
const CSS = [C.sel, C.box, C.display, C.flex, C.grid, C.resp, C.text, C.pos, C.anim];
const JS = [C.vars, C.cond, C.loop, C.fn, C.arr, C.dom, C.ev, C.api, C.ls, C.poo];
export const FOUNDATION: Record<string, { w: number; feeds: string[] }> = {
  [C.page]: { w: 3, feeds: [...CSS, ...JS, C.form] }, [C.link]: { w: 2, feeds: CSS }, [C.sel]: { w: 3, feeds: [...CSS.slice(1), C.dom] },
  [C.box]: { w: 2, feeds: [C.flex, C.grid, C.resp, C.pos] }, [C.display]: { w: 2, feeds: [C.flex, C.grid, C.resp] }, [C.flex]: { w: 2, feeds: [C.resp, C.grid] }, [C.grid]: { w: 1, feeds: [C.resp] },
  [C.resp]: { w: 1, feeds: [] }, [C.pos]: { w: 1, feeds: [C.anim] }, [C.form]: { w: 1, feeds: [C.ev, C.dom] },
  [C.vars]: { w: 3, feeds: JS.slice(1) }, [C.cond]: { w: 3, feeds: [C.loop, C.fn, C.arr, C.dom, C.ev, C.api, C.poo] }, [C.loop]: { w: 3, feeds: [C.arr, C.dom, C.api, C.ls] },
  [C.fn]: { w: 3, feeds: [C.arr, C.dom, C.ev, C.api, C.poo] }, [C.arr]: { w: 2, feeds: [C.dom, C.api, C.ls] }, [C.dom]: { w: 3, feeds: [C.ev, C.api, C.ls] }, [C.ev]: { w: 2, feeds: [C.api] },
  [C.api]: { w: 1, feeds: [] }, [C.poo]: { w: 1, feeds: [] }, [C.sql]: { w: 2, feeds: [] },
  // worth working on, never blocking
  [C.git]: { w: 0, feeds: [] }, [C.sem]: { w: 0, feeds: [] }, [C.img]: { w: 0, feeds: [] }, [C.a]: { w: 0, feeds: [] }, [C.list]: { w: 0, feeds: [] }, [C.text]: { w: 0, feeds: [] },
  [C.anim]: { w: 0, feeds: [] }, [C.ls]: { w: 0, feeds: [] },
};
/** The sprints that need this concept to go on: they teach something it feeds (or build on it directly). */
export function blockedSprints(concept: string | null, next: { sprint: number; items: string[] }[]) {
  const f = concept ? FOUNDATION[concept] : null;
  if (!f || f.w < 2) return [];
  return next.filter((n) => n.items.some((it) => conceptsOf(it).some((c) => f.feeds.includes(c) || (c === concept && f.w >= 3)))).map((n) => `S${n.sprint}`);
}

/** Where they're heading: their level, its trend, the lacunes that are real foundations of what comes next, and what
 *  they do about it. A forecast to discuss, not a verdict: it says « decline » only on clear signs. */
export function forecast(o: { level: string | null; trend: string; themes: Theme[]; engagement: string; planPct: number | null; idleDays: number | null; assess: number[] }) {
  const reasons: { t: string; w: number }[] = [];
  let s = 0;
  const lv = o.level ? RANK[o.level] : null;
  if (lv != null && lv >= 3) { s += 0.75; reasons.push({ t: `a solid level (${o.level === "excellent" ? "Excellent" : "Bon"})`, w: 0.75 }); }
  if (lv != null && lv <= 1) { s -= 0.75; reasons.push({ t: `a ${o.level === "critique" ? "critical" : "weak"} level`, w: -0.75 }); }
  if (o.trend === "up") { s += 1; reasons.push({ t: "their levels went up lately", w: 1 }); }
  if (o.trend === "down") { s -= 1; reasons.push({ t: "their levels went down lately", w: -1 }); }
  // only real foundations needed by the coming sprints count, the more basic the more
  const blockers = o.themes.filter((t) => t.blocks.length).map((t) => ({ text: t.label, needs: t.blocks, weight: (FOUNDATION[t.concept || ""]?.w || 0) + (t.items.length >= 3 ? 1 : 0) + (t.priority === 1 ? 1 : 0) }))
    .sort((a, b) => b.weight - a.weight);
  const heavy = blockers.filter((b) => b.weight >= 4).length;
  if (heavy >= 2 || blockers.length >= 3) { s -= 1.25; reasons.push({ t: `${blockers.length} basics the next sprints build on aren't mastered`, w: -1.25 }); }
  else if (blockers.length) { s -= 0.5; reasons.push({ t: `${blockers[0].text} isn't mastered and ${blockers[0].needs.join(", ")} builds on it`, w: -0.5 }); }
  else if (o.themes.length) { s += 0.25; reasons.push({ t: "their lacunes don't block the next sprints", w: 0.25 }); }
  if (o.engagement === "engaged") { s += 0.5; reasons.push({ t: "they do the work given", w: 0.5 }); }
  if (o.engagement === "not") { s -= 1; reasons.push({ t: "the work given isn't done", w: -1 }); }
  if (o.planPct != null && o.planPct >= 50) { s += 0.5; reasons.push({ t: `their plan d'action is ${o.planPct}% done`, w: 0.5 }); }
  if (o.idleDays != null && o.idleDays >= 7) { s -= 1; reasons.push({ t: `no activity for ${o.idleDays} days`, w: -1 }); }
  if (o.assess.length >= 2) {
    const last = o.assess[o.assess.length - 1], before = o.assess.slice(0, -1).reduce((a, b) => a + b, 0) / (o.assess.length - 1);
    if (last - before >= 12) { s += 0.5; reasons.push({ t: "their last assessment is better than the ones before", w: 0.5 }); }
    if (before - last >= 12) { s -= 0.5; reasons.push({ t: "their last assessment is worse than the ones before", w: -0.5 }); }
  }
  // « improving » needs a sign of movement (levels up, a better assessment, their plan moving), not only a good level
  const moving = o.trend === "up" || reasons.some((r) => /better than|plan d'action is/.test(r.t));
  const way = s >= 1 && moving ? "up" : s <= -1.25 ? "down" : "flat";
  const data = (o.trend !== "unknown" ? 1 : 0) + (o.themes.length ? 1 : 0) + (o.engagement !== "none" ? 1 : 0) + (o.assess.length ? 1 : 0) + (lv != null ? 1 : 0);
  return { way, score: Math.round(s * 100) / 100, confidence: data >= 4 ? "high" : data >= 2 ? "medium" : "low",
    reasons: reasons.sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, 4).map((r) => ({ t: r.t, good: r.w > 0 })), blockers: blockers.slice(0, 4) };
}

const LOW = new Set(["faible", "critique"]);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[`'"«»().,:;!?]/g, " ").replace(/\s+/g, " ").trim();

export interface Lacune { text: string; kind: "plan" | "comp" | "oral" | "req" | "assess" | "mes"; where: string[]; times: number; why?: string; priority?: number; last: number }

/** The lacunes, from every source, the same one counted once with where it was seen; the most recent and the most
 *  repeated first (the plan d'action's diagnosis, written for this student, leads). */
export function gatherLacunes(gp: Awaited<ReturnType<typeof gapsOf>>, diag: { notion: string; why: string; priority: number }[] | null) {
  const map = new Map<string, Lacune>();
  let order = 0;
  const add = (kind: Lacune["kind"], text: string, where: string, extra: Partial<Lacune> = {}) => {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (t.length < 3) return;
    const k = kind === "comp" ? `comp:${t.split(/\s/)[0]}` : `${kind === "req" ? "req" : "n"}:${norm(t).slice(0, 80)}`;
    const cur = map.get(k);
    order++;
    if (cur) { if (!cur.where.includes(where)) cur.where.push(where); cur.times++; cur.last = order; if (extra.why && !cur.why) cur.why = extra.why; return; }
    map.set(k, { text: t.slice(0, 220), kind, where: [where], times: 1, last: order, ...extra });
  };
  for (const d of gp.debriefs) {
    if (!d.analyzed) continue;
    const at = `B${d.b}`;
    for (const c of d.comps || []) add("comp", c.code, at, { why: c.why || undefined });
    for (const o of d.oral || []) add("oral", o, at);
    if (d.mes) add("mes", `Mise en situation : ${d.mes.title}`, at);
  }
  // requirements missed: only the last analyzed debrief's (older briefs are behind them)
  // requirements not done: only a finalized debrief's (checked by the teacher), the last one
  const lastDeb = [...gp.debriefs].reverse().find((d) => d.analyzed && d.final);
  for (const r of (lastDeb?.req || []).slice(0, 6)) add("req", r, `B${lastDeb.b}`);
  for (const a of gp.assess) for (const m of a.missed.filter((x: any) => x.verdict === "wrong" || x.verdict === "empty" || (x.score ?? 100) < 50).slice(0, 4)) add("assess", m.prompt, a.title);
  const rest = [...map.values()].sort((a, b) => b.times - a.times || b.last - a.last);
  const plan: Lacune[] = (diag || []).map((l, i) => ({ text: l.notion, kind: "plan", where: ["Plan d'action"], times: 1, why: l.why, priority: l.priority, last: 1e6 - i }));
  return [...plan, ...rest].slice(0, 60);
}

export interface Theme { label: string; concept: string | null; next: string[]; kind: "concept" | "req" | "other"; plan: { notion: string; why: string } | null; items: { text: string; kind: Lacune["kind"]; where: string[] }[];
  where: string[]; priority: number | null; blocks: string[]; score: number }
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** The lacunes grouped by concept (« les boucles », « Flexbox »…): what the teacher can work on, with the evidence
 *  inside; the brief's features not done in one group. The competencies not validated are listed apart. */
export function themesOf(lac: Lacune[], next: { sprint: number; items: string[] }[]): Theme[] {
  const map = new Map<string, Theme>();
  for (const l of lac) {
    if (l.kind === "comp") continue;
    const c = conceptsOf(l.text)[0] || null;
    const key = l.kind === "req" && !c ? "req" : c ? `c:${c}` : `x:${l.text.toLowerCase().slice(0, 60)}`;
    let t = map.get(key);
    if (!t) {
      t = { label: l.kind === "req" && !c ? "Fonctionnalités du brief non faites" : c ? cap(c.replace(/^(les?|la|l’|l')\s*/i, "")) : l.text, kind: l.kind === "req" && !c ? "req" : c ? "concept" : "other",
        concept: c, next: [], plan: null, items: [], where: [], priority: null, blocks: [], score: 0 };
      map.set(key, t);
    }
    if (l.kind === "plan") { t.plan = t.plan || { notion: l.text, why: l.why || "" }; t.priority = Math.min(t.priority ?? 9, l.priority ?? 2); }
    else t.items.push({ text: l.text, kind: l.kind, where: l.where });
    for (const w of l.where) if (!t.where.includes(w)) t.where.push(w);
    t.score += l.times;
  }
  const out = [...map.values()];
  for (const t of out) {
    // blocks: a foundation the coming sprints build on; next: it simply comes back in a coming sprint (not blocking)
    t.blocks = t.kind === "concept" ? blockedSprints(t.concept, next) : [];
    t.next = t.kind === "concept" ? next.filter((n) => n.items.some((it) => conceptsOf(it).includes(t.concept!) || touches(it, t.label))).map((n) => `S${n.sprint}`).filter((x) => !t.blocks.includes(x)) : [];
    t.score += (t.priority === 1 ? 4 : t.priority === 2 ? 2 : t.priority === 3 ? 1 : 0) + t.blocks.length * 3 + (FOUNDATION[t.concept || ""]?.w ?? 1) + (t.where.length >= 2 ? 2 : 0) + (t.kind === "other" ? -1 : 0) + (t.kind === "req" ? -2 : 0);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 10);
}

export async function studentInsight(env: Env, g: GuildRow, st: PlanStudent) {
  const sid = st.discord_id;
  const t0 = now();
  const pv = await planView(env, g, [st]);
  const row = [...pv.plan, ...pv.others][0];
  const gp = await gapsOf(env, g, sid);
  const plans = await listPlans(env, g.id, sid);
  const live = plans.filter((p) => p.status !== "done").sort((a, b) => b.updated_at - a.updated_at)[0] || null;
  const lastSent = plans.filter((p) => p.status !== "draft" && p.diag).sort((a, b) => (b.sent_at || 0) - (a.sent_at || 0))[0] || null;
  let planInfo = null;
  if (live) {
    const s = live.status === "draft" ? null : await planStatus(env, live);
    planInfo = { id: live.id, status: live.status, title: live.title, steps: live.steps.length, done: s?.done ?? 0, pct: s?.pct ?? 0, objDone: s?.objDone ?? 0, objTotal: s?.objTotal ?? 0,
      due_at: live.due_at, sent_at: live.sent_at, toReview: live.steps.filter((x) => x.kind === "brief" && x.work && !x.review).length,
      overdue: !!(live.status === "sent" && live.due_at && live.due_at < t0) };
  }
  const lacunes = gatherLacunes(gp, lastSent?.diag ? lastSent.diag.lacunes.map((l) => ({ notion: l.notion, why: l.why, priority: l.priority })) : null);
  // briefs: the debriefs to finalize, the ones not debriefed yet (due date passed)
  const seen = new Map(gp.debriefs.map((d: any) => [d.bid, d]));
  const toFinalize = gp.debriefs.filter((d: any) => !d.final).map((d: any) => ({ bid: d.bid, who: d.who, title: d.title, n: d.b }));
  const notDebriefed = gp.briefs.filter((b) => b.due_at && b.due_at < t0 && !seen.has(b.id)).slice(-3).map((b) => ({ bid: b.id, title: b.title, n: b.n }));
  const hands = await all<{ id: number; status: string; question: string; created_at: number }>(env,
    "SELECT id, status, question, created_at FROM hands WHERE guild_id = ? AND discord_id = ? AND created_at > ? ORDER BY id DESC LIMIT 5", g.id, sid, t0 - 30 * 86400).catch(() => []);
  const assess = gp.assess.filter((a) => a.score != null).map((a) => ({ title: a.title, score: Math.round(a.score as number) }));
  const lastActive = (await one<{ t: number | null }>(env, "SELECT last_active AS t FROM players WHERE guild_id = ? AND discord_id = ?", g.id, sid))?.t ?? null;
  // the sprints' objectives: the ones started so far (mastered: none of their lacunes on it), and the coming ones
  const prog = await programOf(env, g);
  const bRows = await all<{ id: number; week: number | null; due_at: number | null; status: string; sprint: number | null }>(env, "SELECT id, week, due_at, status, sprint FROM briefs WHERE guild_id = ?", g.id).catch(() => []);
  const today = new Date(t0 * 1000).toISOString().slice(0, 10);
  const sprints = sprintsOf(prog, bRows).map((sp) => ({ n: sp.n, start: sp.start, end: sp.end, briefs: sp.briefs, items: parseGoals(goalsText(prog.sprints.find((x) => x.n === sp.n) as any)).flatMap((x) => x.items) }));
  const allLac = [...lacunes, ...gp.debriefs.flatMap((d: any) => (d.req || []).map((r: string) => ({ text: r })))];
  // only the sprints where we saw their work (a debrief of one of its briefs): no evidence, no objective counted
  const debriefed = new Set(gp.debriefs.map((d: any) => d.bid));
  const past = sprints.filter((sp) => sp.start && sp.start <= today && sp.items.length && sp.briefs.some((b) => debriefed.has(b)));
  const objs = past.flatMap((sp) => sp.items.map((it) => ({ sprint: sp.n, item: it, ok: !allLac.some((l) => touches(it, l.text)) })));
  const hasWork = gp.debriefs.length > 0 || gp.assess.length > 0;
  const proposed = proposeLevel(row.debriefs.length ? gp.debriefs.map((d: any) => d.lv).filter(Boolean) : [], hasWork ? objs.filter((o) => o.ok).length : 0, hasWork ? objs.length : 0);
  const next = sprints.filter((sp) => sp.end && sp.end >= today && sp.items.length).slice(0, 2).map((sp) => ({ sprint: sp.n, items: sp.items }));
  const tl = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", LKEY(g.id, sid)).catch(() => null);
  let teacherLevel: { level: string; note: string; at: number } | null = null;
  try { teacherLevel = tl ? JSON.parse(tl.v) : null; } catch { teacherLevel = null; }
  const themes = themesOf(lacunes, next);
  const comps = lacunes.filter((l) => l.kind === "comp").map((l) => ({ code: l.text, where: l.where, times: l.times, why: l.why || "" }));
  const fc = forecast({ level: teacherLevel?.level || proposed?.level || row.current || null, trend: row.trend, themes, engagement: row.engagement.state, planPct: planInfo?.status === "sent" ? planInfo.pct : null,
    idleDays: lastActive ? Math.floor((t0 - lastActive) / 86400) : null, assess: gp.assess.filter((a) => a.score != null).map((a) => a.score as number) });
  return {
    current: row.current || null, trend: row.trend, why: row.why, inPlan: row.inPlan, severity: row.severity,
    journey: [...row.sprints.map((x) => ({ k: `S${x.sprint}`, lv: x.lv, t: `Sprint ${x.sprint}`, kind: "sprint" })), ...row.debriefs.map((x) => ({ k: `B${x.b}`, lv: x.lv, t: x.title, kind: "brief", bid: x.bid }))],
    assess, avgScore: row.avgScore, engagement: row.engagement, note: row.note, lacunes: lacunes.slice(0, 14), themes, comps, plan: planInfo,
    toFinalize, notDebriefed, hands: hands.map((h) => ({ ...h, question: h.question.replace(/^🧭[^\n]*\n/, "").slice(0, 160) })), openHand: hands.find((h) => h.status === "waiting" || h.status === "helping") || null,
    proposed, teacherLevel, objectives: { ok: objs.filter((o) => o.ok).length, all: objs.length, missed: objs.filter((o) => !o.ok).slice(0, 12) }, forecast: fc, next,
    lastActive, idleDays: lastActive ? Math.floor((t0 - lastActive) / 86400) : null, low: LOW.has(row.current || ""),
  };
}
