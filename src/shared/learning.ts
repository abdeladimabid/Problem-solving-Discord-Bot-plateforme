// The student's learning record beyond challenges: the competencies of the référentiel (C1…C8, CT1…CT9) validated
// in brief debriefs and assessments, and how those results feed everything else:
//   • skill mastery: each automatic check of a debrief is evidence for a skill (HTML, CSS, DOM, PHP, security, Git…)
//   • points and coins: validated competencies and bonuses done
//   • "what to work on": competencies not validated and checks that failed, with the evidence
import type { Env, GuildRow, PlayerRow } from "./types.ts";
import { addPoints, all, now, one, run } from "./db.ts";
import { dm } from "./discord.ts";
import { t } from "./i18n.ts";
import type { Program } from "./program.ts";
import { compLabel, compName, parseComp } from "./program.ts";
import { reviewStates, verifHint, checkLabel } from "./review/engine.ts";
import { getReview } from "./review/debrief.ts";
import { memberComment } from "./review/comment.ts";
import { memberLevel, memberLevelOf } from "./review/members.ts";

/** Which skills each automatic check of a debrief proves (or shows missing). */
export const CHECK_SKILLS: Record<string, string[]> = {
  pages: ["html"], nav: ["html"], active: ["html", "css"], semantic: ["html"], h1: ["html"], alt: ["html"], seo: ["html"], form: ["html"], map: ["html"], w3c: ["html"], page404: ["html"],
  responsive: ["css"], breakpoints: ["css"], anim: ["css"], layout: ["css"],
  js_dom: ["dom"], js_events: ["dom"], js_storage: ["dom"], js_regex: ["regex"], js_fetch: ["async", "api"], js_errors: ["async"], js_modules: ["functions"],
  php_classes: ["oop", "php"], php_encaps: ["oop"], php_construct: ["oop"], php_getset: ["oop"], php_inherit: ["oop"], php_interface: ["oop"], php_namespace: ["php"], php_composer: ["php"],
  php_mvc: ["mvc"], php_router: ["mvc"], php_htaccess: ["mvc"], php_twig: ["mvc"], lv_repository: ["mvc", "laravel"], lv_service: ["mvc", "laravel"],
  php_session: ["php", "security"], php_password: ["security"], php_validation: ["security"], php_xss: ["security"], php_csrf: ["security"], php_prepared: ["security", "sql"],
  php_pdo: ["php", "sql"], sql_file: ["sql_design"], sql_fk: ["sql_design"], sql_data: ["sql_change"], db_pgsql: ["sql"], db_mysql: ["sql"],
  lv_migrations: ["laravel", "sql_design"], lv_requests: ["laravel", "security"], lv_api: ["laravel", "api"], lv_jwt: ["security", "api"], lv_sanctum: ["security", "laravel"], lv_socialite: ["laravel"],
  pay_stripe: ["api"], rt_websocket: ["api"], mail: ["php"], cache: ["laravel"], slug: ["laravel"], tests: ["testing"], api_docs: ["api"], postman: ["api"],
  commits: ["git"], git: ["git"], branches: ["git"], members_commit: ["git"], pr_review: ["git"],
};
const LEVEL_DIFF = ["easy", "easy", "medium", "hard"];

export interface Rewards { comp: number; coins: number; bonus: number }
export function rewardsOf(g: GuildRow): Rewards {
  let o: any = {};
  try { o = JSON.parse((g as any).github || "{}")?.rewards ?? {}; } catch { o = {}; }
  const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Math.max(0, Math.min(500, Math.round(Number(v)))) : d);
  return { comp: n(o.comp, 15), coins: n(o.coins, 10), bonus: n(o.bonus, 5) };
}

/**
 * Finalize a debrief: the competencies, skill evidence and rewards go into the record of the student
 * (or of every squad member). Doing it again replaces what the previous finalize wrote.
 */
export async function finalizeReview(env: Env, g: GuildRow, brief: { id: number; title: string; competencies: string | null }, who: string, o: { notify?: boolean } = {}) {
  const r = await getReview(env, brief.id, who);
  if (!r || !r.rec.result) throw new Error("Analyze the work first.");
  const rec = r.rec;
  const st = reviewStates(rec);
  const levels = new Map((brief.competencies ?? "").split(",").map((c) => parseComp(c)).filter(Boolean).map((c) => [c!.code, c!.level ?? 1]));
  const techLevels = [...levels.entries()].filter(([c]) => c.startsWith("C")).map(([, l]) => l);
  const minLevel = techLevels.length ? Math.min(...techLevels) : 1;
  const difficulty = LEVEL_DIFF[minLevel] ?? "easy";
  const students: string[] = who.startsWith("s:") ? (rec.squad?.members ?? []).map((m: any) => String(m.gid)) : [who.slice(2)];
  const rw = rewardsOf(g);
  const exig = rec.result.exigences || [];
  const bonusDone = exig.filter((e: any, i: number) => e.type === "bonus" && st.ex[i]).length;
  const t0 = now();
  rec.awarded = rec.awarded || {};
  const challenge = rec.challenge;
  for (const uid of students) {
    const member = rec.members?.[uid];
    const comps: Record<string, boolean> = member?.co && Object.keys(member.co).length ? member.co : st.co;
    // 1. competencies
    const stmts: any[] = [env.DB.prepare("DELETE FROM competency_results WHERE guild_id = ? AND discord_id = ? AND source = 'brief' AND ref = ?").bind(g.id, uid, brief.id)];
    for (const [raw, ok] of Object.entries(comps)) {
      const pc = parseComp(raw);
      if (!pc) continue;
      stmts.push(env.DB.prepare("INSERT INTO competency_results (guild_id, discord_id, code, level, ok, source, ref, note, at) VALUES (?, ?, ?, ?, ?, 'brief', ?, ?, ?)")
        .bind(g.id, uid, pc.code, pc.level ?? levels.get(pc.code) ?? 1, ok ? 1 : 0, brief.id, brief.title.slice(0, 120), t0));
    }
    // 2. skill evidence from the automatic checks (the teacher's final switches)
    stmts.push(env.DB.prepare("DELETE FROM skill_evidence WHERE guild_id = ? AND discord_id = ? AND source = ?").bind(g.id, uid, `brief:${brief.id}`));
    for (const c of rec.checks || []) {
      if (c.info || !(c.id in st.ck)) continue;
      let ok = st.ck[c.id];
      if (c.id === "members_commit" && rec.contrib) { const m = rec.contrib.find((x: any) => String(x.gid) === uid); if (m) ok = m.commits > 0; }
      for (const skill of CHECK_SKILLS[c.id] ?? []) {
        stmts.push(env.DB.prepare("INSERT INTO skill_evidence (guild_id, discord_id, attempt_id, skill, ok, weight, why, created_at, difficulty, source) VALUES (?, ?, 0, ?, ?, 1, ?, ?, ?, ?)")
          .bind(g.id, uid, skill, ok ? 1 : 0, `${brief.title}: ${c.label}${ok ? "" : " – " + String(c.detail || "").slice(0, 120)}`.slice(0, 240), t0, difficulty, `brief:${brief.id}`));
      }
    }
    // 3. the live challenge (mise en situation): what they showed in front of the teacher
    const mes = member?.mes?.r ? { r: member.mes.r, point: (member.ch || challenge)?.point } : challenge?.result ? { r: challenge.result, point: challenge.point } : null;
    if (mes?.point) {
      const skills = [...new Set(verifHint(mes.point).split(/,\s*/).filter(Boolean).flatMap((id) => CHECK_SKILLS[id] ?? []))];
      for (const skill of skills) {
        const parts = mes.r === "valide" ? [[1, 1.5]] : mes.r === "partiel" ? [[1, 0.75], [0, 0.75]] : [[0, 1.5]];
        for (const [ok, w] of parts) stmts.push(env.DB.prepare("INSERT INTO skill_evidence (guild_id, discord_id, attempt_id, skill, ok, weight, why, created_at, difficulty, source) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)")
          .bind(g.id, uid, skill, ok, w, `${brief.title}: mise en situation (${mes.r})`, t0, difficulty, `brief:${brief.id}`));
      }
    }
    await env.DB.batch(stmts);
    // 4. coins: validated competencies; a new finalize only adds or removes the difference. A debrief gives NO points
    //    (the teacher's choice): the points an older debrief gave stay in the history as they are, untouched.
    const okComps = Object.values(comps).filter(Boolean).length;
    const coins = okComps * rw.coins;
    const given = await one<{ s: number }>(env, "SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE guild_id = ? AND discord_id = ? AND reason = 'brief' AND ref = ?", g.id, uid, String(brief.id));
    const prev = { coins: rec.awarded[uid]?.coins ?? 0 };
    if (coins !== prev.coins) await run(env, "UPDATE players SET coins = MAX(0, coins + ?) WHERE guild_id = ? AND discord_id = ?", coins - prev.coins, g.id, uid);
    rec.awarded[uid] = { pts: given?.s ?? 0, coins };
  }
  // a squad: each member keeps their own level (the teacher's, else the one proposed from their data)
  for (const m of rec.squad ? rec.contrib || [] : []) {
    const ms = (rec.members = rec.members || {})[m.gid] || {};
    const prop = memberLevel(rec, m, ms);
    rec.members[m.gid] = { ...ms, level: { ...(ms.level || {}), prop, lvl: (ms.level && ms.level.lvl) || prop, by: (ms.level && ms.level.lvl) ? ms.level.by || "you" : "calc" } };
  }
  rec.finalAt = Date.now();
  await run(env, "UPDATE brief_reviews SET record = ?, status = 'final', final_at = ?, updated_at = ? WHERE id = ?", JSON.stringify(rec), t0, t0, r.id);
  let sent = 0;
  if (o.notify) sent = await sendResult(env, g, brief, r.id, students, rec);
  return { students: students.length, sent, awarded: rec.awarded };
}

/**
 * DM the comment to the student(s). A squad: each member gets THEIR OWN comment (the one on their card: yours, the AI's,
 * else written now from their switches, their final level and your note), never the squad's.
 */
export function memberDmText(rec: any, uid: string): string {
  if (!rec.squad) return rec.result?.feedback || "";
  const ms = rec.members?.[uid] || {};
  if (ms.text && String(ms.text).trim()) return String(ms.text);
  const m = (rec.contrib || []).find((x: any) => String(x.gid) === uid) || (rec.squad.members || []).find((x: any) => String(x.gid) === uid) || { gid: uid, name: "", login: "" };
  return memberComment(m, rec, ms) || ms.comment || rec.result?.feedback || "";
}
async function sendResult(env: Env, g: GuildRow, brief: { id: number; title: string }, reviewId: number, students: string[], rec: any) {
  const L = g.lang;
  let n = 0;
  for (const uid of students) {
    const text = memberDmText(rec, uid);
    if (!text) continue;
    const ok = await dm(env, uid, { embeds: [{ title: t(L, "debrief.dm_title", { title: brief.title }), description: text.slice(0, 4000), color: 0x2563eb, footer: { text: t(L, "debrief.dm_footer") } }] });
    if (ok) n++;
  }
  if (n) await run(env, "UPDATE brief_reviews SET sent_at = ? WHERE id = ?", now(), reviewId);
  return n;
}

/** Back to draft to change something: the competencies, skill evidence, points and coins the debrief gave leave the
 *  student's record; finalizing again gives them back (as they are then). Never the same points twice. */
export async function reopenReview(env: Env, g: GuildRow, briefId: number, who: string, takeBack = true) {
  const r = await getReview(env, briefId, who);
  if (!r) return;
  const students: string[] = who.startsWith("s:") ? (r.rec.squad?.members ?? []).map((m: any) => String(m.gid)) : [who.slice(2)];
  for (const uid of students) {
    if (takeBack) {
      const prev = r.rec.awarded?.[uid];
      // the debrief's own lines leave the points history (the season total drops by what it gave)
      // the points an older debrief gave stay (debriefs give no points anymore: finalizing again never gives them back)
      if (prev?.coins) await run(env, "UPDATE players SET coins = MAX(0, coins - ?) WHERE guild_id = ? AND discord_id = ?", prev.coins, g.id, uid);
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM competency_results WHERE guild_id = ? AND discord_id = ? AND source = 'brief' AND ref = ?").bind(g.id, uid, briefId),
      env.DB.prepare("DELETE FROM skill_evidence WHERE guild_id = ? AND discord_id = ? AND source = ?").bind(g.id, uid, `brief:${briefId}`),
    ]);
  }
  if (takeBack) r.rec.awarded = {};
  await run(env, "UPDATE brief_reviews SET record = ?, status = 'draft', final_at = NULL WHERE id = ?", JSON.stringify(r.rec), r.id);
}

// ---------------------------------------------------------- the student's map
type CompRow = { code: string; level: number | null; ok: number; source: string; ref: number; note: string | null; at: number };
/** The results that count, newest first: a teacher's decision ("manual") overrides everything before it; later briefs and assessments still add up. */
export function effectiveRows<T extends { source: string; at: number }>(rowsNewestFirst: T[]): T[] {
  const i = rowsNewestFirst.findIndex((r) => r.source === "manual");
  return i < 0 ? rowsNewestFirst : rowsNewestFirst.slice(0, i + 1);
}
/** Highest level validated (0 = none) from a code's rows, newest first. */
export function bestLevel(rowsNewestFirst: { source: string; at: number; ok: number | boolean; level: number | null }[]) {
  return Math.max(0, ...effectiveRows(rowsNewestFirst).filter((r) => r.ok).map((r) => r.level ?? 1));
}

export interface CompState { code: string; label: string; name: string; kind: string; level: number; tried: number; status: "validated" | "progress" | "not_yet" | "none"; manual: { ok: boolean; level: number | null; note: string | null; at: number } | null; history: { source: string; ref: number; note: string | null; level: number | null; ok: boolean; at: number }[] }
/** Every competency of the programme: highest level validated, the last results (brief by brief, assessment by assessment). */
export async function competencyMap(env: Env, g: GuildRow, uid: string, p: Program): Promise<CompState[]> {
  const rows = await all<CompRow>(env,
    "SELECT code, level, ok, source, ref, note, at FROM competency_results WHERE guild_id = ? AND discord_id = ? ORDER BY at DESC, id DESC", g.id, uid);
  return p.referential.map((c) => {
    const mine = rows.filter((r) => r.code === c.code);
    const eff = effectiveRows(mine);
    const level = bestLevel(mine);
    const last = eff[0];
    const man = mine.find((r) => r.source === "manual");
    return {
      code: c.code, label: compLabel(c.code), name: c.name, kind: c.kind, level, tried: mine.length,
      status: !mine.length ? "none" : level && last?.ok ? "validated" : level ? "progress" : "not_yet",
      manual: man ? { ok: !!man.ok, level: man.level, note: man.note, at: man.at } : null,
      history: mine.slice(0, 15).map((r) => ({ source: r.source, ref: r.ref, note: r.note, level: r.level, ok: !!r.ok, at: r.at })),
    };
  });
}

/** The teacher decides: validated at a level, or not validated (ok = false). Replaces the previous decision; null removes it (back to automatic). */
export async function setManualCompetency(env: Env, g: GuildRow, uid: string, code: string, d: { ok: boolean; level?: number | null; note?: string | null } | null) {
  if (!d) return run(env, "DELETE FROM competency_results WHERE guild_id = ? AND discord_id = ? AND source = 'manual' AND code = ?", g.id, uid, code);
  const level = d.ok ? Math.max(1, Math.min(3, Number(d.level) || 1)) : null;
  return run(env, `INSERT INTO competency_results (guild_id, discord_id, code, level, ok, source, ref, note, at) VALUES (?, ?, ?, ?, ?, 'manual', 0, ?, ?)
    ON CONFLICT (guild_id, discord_id, source, ref, code) DO UPDATE SET level = excluded.level, ok = excluded.ok, note = excluded.note, at = excluded.at`,
    g.id, uid, code, level, d.ok ? 1 : 0, String(d.note ?? "").slice(0, 200) || null, now());
}

/** The class view: for each student, the highest level validated of each competency (a teacher's decision overrides older results). */
export async function classCompetencies(env: Env, g: GuildRow) {
  const rows = await all<CompRow & { discord_id: string }>(env,
    "SELECT discord_id, code, level, ok, source, ref, note, at FROM competency_results WHERE guild_id = ? ORDER BY at DESC, id DESC", g.id);
  const by = new Map<string, (CompRow & { discord_id: string })[]>();
  for (const r of rows) { const k = r.discord_id + "|" + r.code; if (!by.has(k)) by.set(k, []); by.get(k)!.push(r); }
  return [...by.values()].map((rs) => {
    const eff = effectiveRows(rs);
    const best = bestLevel(rs);
    return { discord_id: rs[0].discord_id, code: rs[0].code, best: best || null, tries: rs.length, fails: eff.filter((r) => !r.ok).length, manual: (() => { const m = rs.find((r) => r.source === "manual"); return m ? { ok: !!m.ok, level: m.level, note: m.note } : null; })() };
  });
}

/** For "what to work on": competencies not validated and checks that failed in the last finalized debriefs. */
export async function briefFindings(env: Env, g: GuildRow, uid: string, p: Program | null, limit = 3) {
  const reviews = await all<{ brief_id: number; who: string; record: string; final_at: number; title: string }>(env,
    `SELECT r.brief_id, r.who, r.record, r.final_at, b.title FROM brief_reviews r JOIN briefs b ON b.id = r.brief_id
      WHERE r.guild_id = ? AND r.status = 'final' AND (r.who = ? OR r.who LIKE 's:%') ORDER BY r.final_at DESC LIMIT 12`, g.id, `u:${uid}`);
  const out: { brief: number; title: string; at: number; comps: { code: string; name: string }[]; checks: { id: string; label: string; detail: string }[]; challenge: string | null }[] = [];
  for (const r of reviews) {
    let rec: any;
    try { rec = JSON.parse(r.record); } catch { continue; }
    if (r.who.startsWith("s:") && !(rec.squad?.members ?? []).some((m: any) => String(m.gid) === uid)) continue;
    const st = reviewStates(rec);
    const co = rec.members?.[uid]?.co ?? st.co;
    const comps = Object.entries(co).filter(([, ok]) => !ok).map(([code]) => { const pc = parseComp(code)!; return { code: compLabel(pc.code) + (pc.level ? "N" + pc.level : ""), name: p ? compName(p, pc.code) : pc.code }; });
    const checks = (rec.checks || []).filter((c: any) => !c.info && st.ck[c.id] === false).map((c: any) => ({ id: c.id, label: c.label || checkLabel(c.id), detail: String(c.detail || "").slice(0, 200) }));
    const mes = rec.members?.[uid]?.mes?.r || rec.challenge?.result || "";
    out.push({ brief: r.brief_id, title: r.title, at: r.final_at, comps, checks, challenge: mes && mes !== "valide" ? `${rec.challenge?.titre ?? ""} (${mes})` : null });
    if (out.length >= limit) break;
  }
  return out;
}

/** A student's briefs: dates, what they handed in, whether they pushed, and the state of the debrief. */
export async function studentBriefs(env: Env, g: GuildRow, uid: string) {
  const briefs = await all<{ id: number; title: string; status: string; start_at: number | null; due_at: number | null; created_at: number; kind: string; squads: string | null; competencies: string | null }>(env,
    "SELECT id, title, status, start_at, due_at, created_at, kind, squads, competencies FROM briefs WHERE guild_id = ? AND status IN ('assigned', 'archived') ORDER BY COALESCE(due_at, created_at) DESC LIMIT 30", g.id);
  if (!briefs.length) return [];
  const out = [];
  for (const b of briefs) {
    let squads: any[] = [];
    try { squads = JSON.parse(b.squads || "[]"); } catch { squads = []; }
    const sq = b.kind === "squad" ? squads.find((s) => (s.members || []).map(String).includes(uid)) : null;
    const who = sq ? `s:${sq.id}` : `u:${uid}`;
    const handin = await one<{ repo: string; plan: string | null; at: number }>(env, "SELECT repo, plan, at FROM brief_handins WHERE brief_id = ? AND who = ?", b.id, who);
    const push = await one<{ first: number | null }>(env, "SELECT MIN(t) AS first FROM gh_activity WHERE guild_id = ? AND discord_id = ? AND t >= ? AND commits > 0", g.id, uid, b.start_at ?? b.created_at);
    const rv = await one<{ status: string; final_at: number | null; sent_at: number | null; record: string; level: string | null; plevel: string | null }>(env, "SELECT status, final_at, sent_at, record, level, plevel FROM brief_reviews WHERE brief_id = ? AND who = ?", b.id, who);
    let summary: any = null;
    let own = { lvl: rv?.level || "", prop: rv?.plevel || "" };   // in a squad: the member's own level
    if (rv) {
      try {
        const rec = JSON.parse(rv.record);
        if (sq) own = memberLevelOf(rec, uid, { lvl: rv.level, prop: rv.plevel });
        const st = reviewStates(rec);
        const co = rec.members?.[uid]?.co ?? st.co;
        const ex = rec.result?.exigences || [];
        const main = ex.map((e: any, i: number) => [e, st.ex[i]]).filter(([e]: any) => !/^(bonus|crit|oral)/i.test(String(e.type || "")));   // only the brief's requirements count
        summary = {
          pct: main.length ? Math.round((main.filter(([, v]: any) => v).length / main.length) * 100) : null,
          ok: Object.entries(co).filter(([, v]) => v).map(([c]) => c), ko: Object.entries(co).filter(([, v]) => !v).map(([c]) => c),
          comment: rec.members?.[uid]?.comment || rec.result?.feedback || "", repo: rec.repos?.[0] ?? null, repos: rec.repos ?? [], at: rec.at,
          resume: rec.result?.resume || "", forts: rec.result?.forts ?? [], ameliorer: rec.result?.ameliorer ?? [], commits: rec.count ?? null,
          reqs: ex.map((e: any, i: number) => ({ t: String(e.texte || "").slice(0, 300), type: e.type || "", done: !!st.ex[i] })),
          comps: (rec.result?.competences || []).map((c: any) => ({ code: c.code, ok: !!co[c.code], why: String(c.raison || "").slice(0, 300) })),
          checks: (rec.checks || []).filter((c: any) => !c.info && typeof st.ck[c.id] === "boolean").map((c: any) => ({ label: c.label || checkLabel(c.id), ok: !!st.ck[c.id], detail: String(c.detail || "").slice(0, 200) })),
          mes: rec.challenge ? { title: rec.challenge.titre || "", r: rec.members?.[uid]?.mes?.r || st.mes?.r || "", note: rec.members?.[uid]?.mes?.note || st.mes?.note || "" } : null,
        };
      } catch { summary = null; }
    }
    out.push({ id: b.id, title: b.title, status: b.status, start: b.start_at, due: b.due_at, kind: b.kind, squad: sq ? { id: sq.id, name: sq.name, sm: sq.sm === uid } : null, who,
      handin, pushed: push?.first ? (b.due_at && push.first > b.due_at ? "late" : "on") : null, review: rv ? { status: rv.status, final_at: rv.final_at, sent_at: rv.sent_at, level: own.lvl || own.prop || null, levelProposed: !own.lvl && !!own.prop, ...summary } : null });
  }
  return out;
}
