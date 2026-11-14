// 👁️ « Preview as a student » (the Assessment and Mise en situation pages): the teacher opens the student's page in a
// new tab, as a student sees it (rules, timer, full screen, editor, hand-in), without inviting anyone.
// It's a private copy under its own class id (pv:<guild>, staff.ts), so the class never sees it: not in the lists, the
// Live tab, the results, the statistics, the competencies or the points. No Discord sign-in, no DM. A stopped session
// lets itself back in, and an assessment shows its correction right after the hand-in. A new preview replaces the
// previous one of the same assessment; copies older than two days go when another preview is made.
import type { Env, GuildRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { PREVIEW } from "./staff.ts";
import { AssessError, quizUrl, takerToken } from "./assess.ts";
import type { AssessRow } from "./assess.ts";
import { MiseError, miseUrl, takerToken as miseToken } from "./misesdb.ts";

const KEEP = 2 * 86400;
const keyOf = (kind: "assess" | "mise", gid: string, id: number) => `preview:${kind}:${gid}:${id}`;
const who = (g: GuildRow) => String(g.teacher_id || "0");

async function lastCopy(env: Env, k: string): Promise<number | null> {
  const r = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", k).catch(() => null);
  return r ? Number(r.v) || null : null;
}
async function remember(env: Env, k: string, id: number) {
  await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", k, String(id), now());
}
/** The copies to drop: the previous preview of this one, and the class's previews older than two days. */
async function oldCopies(env: Env, table: "assessments" | "mises", pv: string, prev: number | null) {
  const rows = await all<{ id: number }>(env, `SELECT id FROM ${table} WHERE guild_id = ? AND (id = ? OR created_at < ?)`, pv, prev ?? 0, now() - KEEP);
  return rows.map((r) => r.id);
}

/** A private copy of the assessment and one paper for the teacher: the link of the student's page. */
export async function previewAssessment(env: Env, g: GuildRow, id: number): Promise<{ url: string }> {
  const a = await one<AssessRow>(env, "SELECT * FROM assessments WHERE id = ? AND guild_id = ?", id, g.id);
  if (!a) throw new AssessError("This assessment doesn't exist anymore.");
  if (!a.questions || a.questions === "[]") throw new AssessError("Add at least one question first.");
  const pv = PREVIEW + g.id, k = keyOf("assess", g.id, id), t0 = now();
  const drop = await oldCopies(env, "assessments", pv, await lastCopy(env, k));
  if (drop.length) {
    const q = drop.map(() => "?").join(",");
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM assessment_takers WHERE assessment_id IN (${q})`).bind(...drop),
      env.DB.prepare(`DELETE FROM assessments WHERE id IN (${q})`).bind(...drop),
    ]);
  }
  const r = await run(env, "INSERT INTO assessments (guild_id, title, brief_id, status, settings, questions, created_at, opened_at, closes_at) VALUES (?, ?, NULL, 'open', ?, ?, ?, ?, ?)",
    pv, a.title, a.settings, a.questions, t0, t0, t0 + KEEP);
  const copy = Number(r.meta.last_row_id);
  const tk = await run(env, "INSERT INTO assessment_takers (assessment_id, guild_id, discord_id, seed, invited_at) VALUES (?, ?, ?, ?, ?)", copy, pv, who(g), Math.floor(Math.random() * 2 ** 31), t0);
  await remember(env, k, copy);
  return { url: quizUrl(env, await takerToken(env, Number(tk.meta.last_row_id), t0 + KEEP)) };
}

/** A private copy of the mise en situation, open now, and one paper for the teacher: the link of the learner's page. */
export async function previewMise(env: Env, g: GuildRow, id: number): Promise<{ url: string }> {
  const m = await one<{ title: string; week: number | null; sprint: number | null; comps: string | null; settings: string | null; content: string }>(env,
    "SELECT title, week, sprint, comps, settings, content FROM mises WHERE id = ? AND guild_id = ?", id, g.id);
  if (!m) throw new MiseError("This mise en situation doesn't exist anymore.", 404);
  let st: any = {};
  try { st = JSON.parse(m.settings || "{}") || {}; } catch { st = {}; }
  const pv = PREVIEW + g.id, k = keyOf("mise", g.id, id), t0 = now();
  const drop = await oldCopies(env, "mises", pv, await lastCopy(env, k));
  if (drop.length) {
    const q = drop.map(() => "?").join(",");
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM mise_takers WHERE mise_id IN (${q})`).bind(...drop),
      env.DB.prepare(`DELETE FROM mises WHERE id IN (${q})`).bind(...drop),
    ]);
  }
  // the same rules as the class (time, full screen, copy-paste, files), nobody else in it, nothing posted
  const settings = JSON.stringify({ ...st, testers: [], channel: false });
  const minutes = Math.max(0, Math.min(600, Math.round(Number(st.minutes) || 0)));
  const r = await run(env, "INSERT INTO mises (guild_id, title, week, sprint, comps, target, settings, content, status, starts_at, ends_at, created_at, opened_at) VALUES (?, ?, ?, ?, ?, '[]', ?, ?, 'live', ?, ?, ?, ?)",
    pv, m.title, m.week, m.sprint, m.comps, settings, m.content, t0, minutes ? t0 + minutes * 60 : null, t0, t0);
  const copy = Number(r.meta.last_row_id);
  const tk = await run(env, "INSERT INTO mise_takers (mise_id, guild_id, discord_id, invited_at) VALUES (?, ?, ?, ?)", copy, pv, who(g), t0);
  await remember(env, k, copy);
  return { url: miseUrl(env, await miseToken(env, Number(tk.meta.last_row_id), t0 + KEEP)) };
}
