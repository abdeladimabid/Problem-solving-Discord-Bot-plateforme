// Activités sign-ups: the teacher shares veilles and live codings in a Discord channel, students ask for one
// (/activity choose, with their binôme), the teacher approves or denies, assigns by hand or at random (fewest
// presentations first, no hard subject for a Faible or Critique student), then grades each presenter: the points
// are only given then. The counts per student keep the presentations fair.
import type { Env, GuildRow } from "./types.ts";
import { addPoints, all, now, one, run } from "./db.ts";
import { COLORS, send, truncate } from "./discord.ts";
import { t } from "./i18n.ts";
import { dashLink, dmChecked } from "./notify.ts";
import { progressView } from "./review/debrief.ts";

export class SignupError extends Error {}
const fail = (msg: string): never => { throw new SignupError(msg); };

export type ActKind = "veille" | "live";
export const LEVELS = ["easy", "medium", "hard"] as const;
/** People who present: a veille is a binôme (a third one if the teacher says so), a live coding one or two. */
export const MAX_SIZE: Record<ActKind, number> = { veille: 3, live: 2 };
export const DEF_SIZE: Record<ActKind, number> = { veille: 2, live: 1 };
const LOW = new Set(["faible", "critique"]);

export interface SignupCfg { channel: string | null; veille: number; live: number }
const parse = (s: string | null | undefined, def: any) => { try { return s ? JSON.parse(s) : def; } catch { return def; } };
const today = () => new Date().toISOString().slice(0, 10);
const ids = (s: string) => (parse(s, []) as unknown[]).map(String);

export async function signupCfg(env: Env, gid: string): Promise<SignupCfg> {
  const r = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", `actsign:${gid}`);
  const v = parse(r?.v, {}) || {};
  const pts = (x: unknown, d: number) => (Number.isFinite(Number(x)) ? Math.min(300, Math.max(0, Math.round(Number(x)))) : d);
  return { channel: typeof v.channel === "string" && /^\d{5,25}$/.test(v.channel) ? v.channel : null, veille: pts(v.veille, 20), live: pts(v.live, 40) };
}
export async function saveSignupCfg(env: Env, gid: string, b: Partial<SignupCfg>) {
  const cur = await signupCfg(env, gid);
  const next = { ...cur };
  if (b.channel !== undefined) next.channel = b.channel && /^\d{5,25}$/.test(String(b.channel)) ? String(b.channel) : null;
  for (const k of ["veille", "live"] as const) if (b[k] !== undefined && Number.isFinite(Number(b[k]))) next[k] = Math.min(300, Math.max(0, Math.round(Number(b[k]))));
  await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", `actsign:${gid}`, JSON.stringify(next), now());
  return next;
}

interface ActLite { id: number; day: string; kind: ActKind; title: string | null; md: string }
interface SlotRow { activity_id: number; level: string; size: number; shared_at: number | null }
export interface ClaimRow {
  id: number; guild_id: string; activity_id: number; kind: ActKind; members: string; by: string; status: string; note: string | null;
  grades: string | null; points: number | null; created_at: number; decided_at: number | null; done_at: number | null;
}
const LIVE = "('approved', 'done')";

const actOf = (env: Env, gid: string, id: number) =>
  one<ActLite>(env, "SELECT id, day, kind, title, md FROM activities WHERE id = ? AND guild_id = ? AND kind IN ('veille', 'live')", id, gid);
const slotOf = (env: Env, id: number) => one<SlotRow>(env, "SELECT activity_id, level, size, shared_at FROM activity_slots WHERE activity_id = ?", id);
const takenBy = (env: Env, id: number) => one<ClaimRow>(env, `SELECT * FROM activity_claims WHERE activity_id = ? AND status IN ${LIVE} ORDER BY id DESC LIMIT 1`, id);
async function ensureSlot(env: Env, gid: string, a: ActLite) {
  await run(env, "INSERT OR IGNORE INTO activity_slots (activity_id, guild_id, size) VALUES (?, ?, ?)", a.id, gid, DEF_SIZE[a.kind]);
  return (await slotOf(env, a.id))!;
}
const names = async (env: Env, gid: string, list: string[]) => {
  const rows = list.length ? await all<{ discord_id: string; name: string | null }>(env,
    `SELECT discord_id, name FROM players WHERE guild_id = ? AND discord_id IN (${list.map(() => "?").join(",")})`, gid, ...list) : [];
  const m = new Map(rows.map((r) => [r.discord_id, r.name || r.discord_id]));
  return list.map((id) => m.get(id) ?? id);
};
const inClass = async (env: Env, gid: string, list: string[]) => new Set(list.length ? (await all<{ discord_id: string }>(env,
  `SELECT discord_id FROM players WHERE guild_id = ? AND discord_id IN (${list.map(() => "?").join(",")})`, gid, ...list)).map((r) => r.discord_id) : []);
const kindLabel = (L: string, k: string) => t(L, k === "live" ? "act.kind_live" : "act.kind_veille");
const dayLabel = (L: string, iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString(L === "fr" ? "fr-FR" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const line = (L: string, a: ActLite) => `**#${a.id}** · ${kindLabel(L, a.kind)} · ${dayLabel(L, a.day)} · ${a.title || "—"}`;

// ------------------------------------------------------------- the teacher's settings for each activity
export async function setSlot(env: Env, g: GuildRow, id: number, b: { level?: string; size?: number }) {
  const a = (await actOf(env, g.id, id)) ?? fail("This activity doesn't exist anymore.");
  await ensureSlot(env, g.id, a);
  if (b.level !== undefined) {
    if (!LEVELS.includes(b.level as any)) fail("invalid difficulty");
    await run(env, "UPDATE activity_slots SET level = ? WHERE activity_id = ?", b.level, id);
  }
  if (b.size !== undefined) {
    const n = Math.round(Number(b.size));
    if (!(n >= 1 && n <= MAX_SIZE[a.kind])) fail(a.kind === "live" ? "A live coding is led by 1 or 2 students." : "A veille is presented by 2 students, or 3 at most.");
    await run(env, "UPDATE activity_slots SET size = ? WHERE activity_id = ?", n, id);
  }
  return slotOf(env, id);
}

// ------------------------------------------------------------- share in Discord
/** Open these activities to the students and post the list in the class's activities channel. */
export async function shareActivities(env: Env, g: GuildRow, list: number[], channel?: string | null) {
  const cfg = channel !== undefined ? await saveSignupCfg(env, g.id, { channel }) : await signupCfg(env, g.id);
  if (!cfg.channel) fail("Pick the Discord channel where the activities are shared.");
  const acts: ActLite[] = [];
  for (const id of [...new Set(list.map(Number))].slice(0, 60)) {
    const a = await actOf(env, g.id, id);
    if (!a || (await takenBy(env, a.id))) continue;
    await ensureSlot(env, g.id, a);
    await run(env, "UPDATE activity_slots SET shared_at = COALESCE(shared_at, ?) WHERE activity_id = ?", now(), a.id);
    acts.push(a);
  }
  if (!acts.length) fail("Nothing to share: the activities picked are already taken, or none was picked.");
  acts.sort((a, b) => (a.day + a.kind).localeCompare(b.day + b.kind));
  const L = g.lang;
  const lines = acts.map((a) => line(L, a));
  await send(env, cfg.channel!, {
    embeds: [{
      title: t(L, "act.share_title"),
      description: truncate([t(L, "act.share_intro", { veille: cfg.veille, live: cfg.live }), "", ...lines, "", t(L, "act.share_how")].join("\n"), 4000),
      color: COLORS.purple,
    }],
    allowed_mentions: { parse: [] },
  });
  return { shared: acts.length, channel: cfg.channel };
}

// ------------------------------------------------------------- what students see
/** Activities open to sign-ups: shared, not over, not taken (an activity with pending requests stays open). */
export async function openActivities(env: Env, gid: string) {
  return all<ActLite & { level: string; size: number; pending: number }>(env,
    `SELECT a.id, a.day, a.kind, a.title, '' AS md, s.level, s.size,
       (SELECT COUNT(*) FROM activity_claims c WHERE c.activity_id = a.id AND c.status = 'pending') AS pending
     FROM activity_slots s JOIN activities a ON a.id = s.activity_id
     WHERE s.guild_id = ? AND s.shared_at IS NOT NULL AND a.day >= ?
       AND NOT EXISTS (SELECT 1 FROM activity_claims c WHERE c.activity_id = a.id AND c.status IN ${LIVE})
     ORDER BY a.day, a.kind`, gid, today());
}

/** A student's activities: asked, approved (with the subject), presented (with the grade). */
export async function myActivities(env: Env, gid: string, uid: string) {
  const rows = await all<ClaimRow & { day: string; title: string | null; md: string }>(env,
    `SELECT c.*, a.day, a.title, a.md FROM activity_claims c JOIN activities a ON a.id = c.activity_id
     WHERE c.guild_id = ? AND c.status IN ('pending', 'approved', 'done', 'denied') AND EXISTS (SELECT 1 FROM json_each(c.members) WHERE value = ?)
     ORDER BY a.day DESC LIMIT 20`, gid, uid);
  return rows.filter((r) => r.status !== "denied" || r.decided_at! > now() - 7 * 86400);
}

/** /activity choose: a request the teacher approves or denies. */
export async function requestActivity(env: Env, g: GuildRow, uid: string, activityId: number, partners: string[]) {
  const L = g.lang;
  const a = await actOf(env, g.id, activityId);
  const slot = a ? await slotOf(env, a.id) : null;
  if (!a || !slot?.shared_at || a.day < today()) return { error: t(L, "act.not_open") };
  if (await takenBy(env, a.id)) return { error: t(L, "act.taken") };
  const members = [...new Set([uid, ...partners.filter(Boolean).map(String)])];
  if (members.length < partners.filter(Boolean).length + 1) return { error: t(L, "act.partner_self") };
  if (a.kind === "veille" && members.length < 2) return { error: t(L, "act.need_partner") };
  // a binôme (or the size the teacher set); a live coding by one or two
  const max = a.kind === "live" ? MAX_SIZE.live : Math.max(2, slot.size);
  if (members.length > max) return { error: t(L, "act.too_many", { n: max }) };
  if (g.teacher_id && members.slice(1).includes(g.teacher_id)) return { error: t(L, "act.partner_teacher") };
  const found = await inClass(env, g.id, members);
  const unknown = members.filter((m) => !found.has(m) && m !== uid);
  if (unknown.length) return { error: t(L, "act.partner_unknown", { who: unknown.map((m) => `<@${m}>`).join(", ") }) };
  // one request at a time: nobody can ask for every subject
  for (const m of members) {
    const p = await one<{ id: number }>(env, "SELECT id FROM activity_claims WHERE guild_id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM json_each(members) WHERE value = ?)", g.id, m);
    if (p) return { error: t(L, m === uid ? "act.you_pending" : "act.partner_pending", { who: `<@${m}>` }) };
  }
  const r = await run(env, "INSERT INTO activity_claims (guild_id, activity_id, kind, members, by, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
    g.id, a.id, a.kind, JSON.stringify(members), uid, now());
  const id = Number(r.meta.last_row_id);
  await notifyRequest(env, g, id).catch((e) => console.warn("activity request DM", e));
  return { ok: true, id, activity: a, members };
}

async function notifyRequest(env: Env, g: GuildRow, id: number) {
  if (!g.teacher_id) return;
  const c = (await one<ClaimRow>(env, "SELECT * FROM activity_claims WHERE id = ?", id))!;
  const a = (await actOf(env, g.id, c.activity_id))!;
  const L = g.lang, mem = ids(c.members);
  const counts = await countsFor(env, g.id);
  const who = (await names(env, g.id, mem)).map((n, i) => {
    const k = counts.get(mem[i]);
    return t(L, "act.notify_member", { name: n, veille: k?.veille ?? 0, live: k?.live ?? 0 });
  });
  const url = dashLink(env, g, "activities");
  await dmChecked(env, g.teacher_id, {
    embeds: [{ title: t(L, "act.notify_title", { server: g.name ?? "" }), description: truncate([line(L, a), "", ...who, "", t(L, "act.notify_avg", { avg: (await signupStats(env, g)).avg })].join("\n"), 4000), color: COLORS.purple }],
    components: url ? [{ type: 1, components: [{ type: 2, style: 5, label: t(L, "act.notify_open"), url, emoji: { name: "✅" } }] }] : [],
  });
}

// ------------------------------------------------------------- the teacher decides
const dmAll = (env: Env, list: string[], payload: Record<string, unknown>) => Promise.all(list.map((m) => dmChecked(env, m, payload).catch(() => null)));
function approvedMsg(L: string, a: ActLite, by: string, mates: string[], note: string | null) {
  return {
    embeds: [{
      title: t(L, by === "random" || by === "teacher" ? "act.assigned_title" : "act.approved_title"),
      description: [line(L, a), mates.length ? t(L, "act.with", { names: mates.join(", ") }) : "", note ? `> ${truncate(note, 500)}` : "", "", t(L, "act.see_details")].filter((x) => x !== "").join("\n"),
      color: COLORS.green,
    }],
  };
}

export async function decideClaim(env: Env, g: GuildRow, id: number, approve: boolean, note: string | null = null) {
  const c = (await one<ClaimRow>(env, "SELECT * FROM activity_claims WHERE id = ? AND guild_id = ?", id, g.id)) ?? fail("This request doesn't exist anymore.");
  if (c.status !== "pending") fail("This request was already handled.");
  const a = (await actOf(env, g.id, c.activity_id)) ?? fail("This activity doesn't exist anymore.");
  const L = g.lang, mem = ids(c.members), clean = note ? String(note).trim().slice(0, 500) || null : null;
  if (!approve) {
    await run(env, "UPDATE activity_claims SET status = 'denied', note = ?, decided_at = ? WHERE id = ?", clean, now(), id);
    await dmAll(env, mem, { embeds: [{ title: t(L, "act.denied_title"), description: [line(L, a), clean ? `> ${clean}` : "", "", t(L, "act.denied_body")].filter((x) => x !== "").join("\n"), color: COLORS.red }] });
    return { ok: true };
  }
  if (await takenBy(env, a.id)) fail("This activity is already taken: deny this request, or cancel the other one first.");
  await run(env, "UPDATE activity_claims SET status = 'approved', note = ?, decided_at = ? WHERE id = ?", clean, now(), id);
  await closeOthers(env, g, a, id);
  const nm = await names(env, g.id, mem);
  await Promise.all(mem.map((m, i) => dmChecked(env, m, approvedMsg(L, a, c.by, nm.filter((_, j) => j !== i), clean)).catch(() => null)));
  return { ok: true };
}
/** The other requests for a subject that's now taken are denied (and told so). */
async function closeOthers(env: Env, g: GuildRow, a: ActLite, keep: number) {
  const others = await all<ClaimRow>(env, "SELECT * FROM activity_claims WHERE activity_id = ? AND status = 'pending' AND id != ?", a.id, keep);
  for (const o of others) {
    await run(env, "UPDATE activity_claims SET status = 'denied', note = ?, decided_at = ? WHERE id = ?", "taken", now(), o.id);
    await dmAll(env, ids(o.members), { embeds: [{ title: t(g.lang, "act.denied_title"), description: [line(g.lang, a), "", t(g.lang, "act.taken_by_other")].join("\n"), color: COLORS.red }] });
  }
}

async function checkMembers(env: Env, g: GuildRow, kind: ActKind, members: unknown[]) {
  const list = [...new Set(members.map(String).filter((x) => /^\d{2,25}$/.test(x)))];
  if (!list.length) fail("Pick at least one student.");
  if (list.length > MAX_SIZE[kind]) fail(kind === "live" ? "A live coding is led by 1 or 2 students." : "A veille is presented by 2 students, or 3 at most.");
  const found = await inClass(env, g.id, list);
  if (list.some((m) => !found.has(m))) fail("This student isn't in the class.");
  return list;
}

/** The teacher gives an activity to chosen students (approved at once). */
export async function assignActivity(env: Env, g: GuildRow, activityId: number, members: unknown[], by: "teacher" | "random" = "teacher", note: string | null = null) {
  const a = (await actOf(env, g.id, activityId)) ?? fail("This activity doesn't exist anymore.");
  if (await takenBy(env, a.id)) fail("This activity is already taken: change its presenters instead.");
  const list = await checkMembers(env, g, a.kind, members);
  await ensureSlot(env, g.id, a);
  const r = await run(env, "INSERT INTO activity_claims (guild_id, activity_id, kind, members, by, status, note, created_at, decided_at) VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?)",
    g.id, a.id, a.kind, JSON.stringify(list), by, note, now(), now());
  const id = Number(r.meta.last_row_id);
  await closeOthers(env, g, a, id);
  const nm = await names(env, g.id, list);
  await Promise.all(list.map((m, i) => dmChecked(env, m, approvedMsg(g.lang, a, by, nm.filter((_, j) => j !== i), note)).catch(() => null)));
  return { id, members: list };
}

/** Change who presents (add a third person to a binôme, swap someone). New presenters are told. */
export async function setMembers(env: Env, g: GuildRow, id: number, members: unknown[]) {
  const c = (await one<ClaimRow>(env, "SELECT * FROM activity_claims WHERE id = ? AND guild_id = ?", id, g.id)) ?? fail("This request doesn't exist anymore.");
  if (c.status === "done") fail("Already graded: the presenters can't change anymore.");
  const a = (await actOf(env, g.id, c.activity_id)) ?? fail("This activity doesn't exist anymore.");
  const list = await checkMembers(env, g, a.kind, members);
  const before = ids(c.members);
  await run(env, "UPDATE activity_claims SET members = ? WHERE id = ?", JSON.stringify(list), id);
  if (list.length > (await slotOf(env, a.id))!.size) await run(env, "UPDATE activity_slots SET size = ? WHERE activity_id = ?", list.length, a.id);
  if (c.status === "approved") {
    const nm = await names(env, g.id, list);
    await Promise.all(list.map((m, i) => (before.includes(m) ? null : dmChecked(env, m, approvedMsg(g.lang, a, "teacher", nm.filter((_, j) => j !== i), null)).catch(() => null))));
  }
  return { members: list };
}

/** Free the activity again (students are told). Graded presentations keep their points: they can't be cancelled. */
export async function cancelClaim(env: Env, g: GuildRow, id: number) {
  const c = (await one<ClaimRow>(env, "SELECT * FROM activity_claims WHERE id = ? AND guild_id = ?", id, g.id)) ?? fail("This request doesn't exist anymore.");
  if (c.status === "done") fail("Already graded: the presenters can't change anymore.");
  await run(env, "UPDATE activity_claims SET status = 'cancelled', decided_at = ? WHERE id = ?", now(), id);
  const a = await actOf(env, g.id, c.activity_id);
  if (a && c.status === "approved") await dmAll(env, ids(c.members), { embeds: [{ title: t(g.lang, "act.cancelled_title"), description: line(g.lang, a), color: COLORS.gray }] });
  return { ok: true };
}

/** After the presentation: each presenter gets a share of the points (100% = presented very well). A second
 *  grading only adds the difference. */
export async function gradeClaim(env: Env, g: GuildRow, id: number, grades: Record<string, unknown>, note: string | null = null) {
  const c = (await one<ClaimRow>(env, "SELECT * FROM activity_claims WHERE id = ? AND guild_id = ?", id, g.id)) ?? fail("This request doesn't exist anymore.");
  if (c.status !== "approved" && c.status !== "done") fail("Approve the presenters first.");
  const a = (await actOf(env, g.id, c.activity_id)) ?? fail("This activity doesn't exist anymore.");
  const cfg = await signupCfg(env, g.id);
  const full = c.points ?? cfg[c.kind];
  const mem = ids(c.members), old = parse(c.grades, {}) as Record<string, number>;
  const next: Record<string, number> = {};
  for (const m of mem) {
    const v = Number(grades[m]);
    if (!Number.isFinite(v) || v < 0 || v > 100) fail("Give each presenter a grade from 0 to 100%.");
    next[m] = Math.round(v);
  }
  const clean = note ? String(note).trim().slice(0, 500) || null : c.note;
  for (const m of mem) {
    const delta = Math.round((full * next[m]) / 100) - Math.round((full * (old[m] ?? 0)) / 100);
    if (delta) await addPoints(env, g, { discordId: m, amount: delta, reason: "activity", ref: id, note: `${a.kind === "live" ? "Live coding" : "Veille"} · ${a.title ?? ""}`.slice(0, 120) });
  }
  await run(env, "UPDATE activity_claims SET status = 'done', grades = ?, points = ?, note = ?, done_at = COALESCE(done_at, ?) WHERE id = ?", JSON.stringify(next), full, clean, now(), id);
  const L = g.lang;
  await Promise.all(mem.map((m) => dmChecked(env, m, {
    embeds: [{ title: t(L, "act.graded_title"), description: [line(L, a), t(L, "act.graded_body", { pct: next[m], pts: Math.round((full * next[m]) / 100) }), clean ? `> ${clean}` : ""].filter(Boolean).join("\n"), color: COLORS.gold }],
  }).catch(() => null)));
  return { ok: true, points: Object.fromEntries(mem.map((m) => [m, Math.round((full * next[m]) / 100)])) };
}

// ------------------------------------------------------------- fairness
interface Count { veille: number; live: number; vDone: number; lDone: number; pending: number; points: number; last: string | null }
async function countsFor(env: Env, gid: string): Promise<Map<string, Count>> {
  const rows = await all<{ members: string; kind: string; status: string; day: string; grades: string | null; points: number | null }>(env,
    `SELECT c.members, c.kind, c.status, a.day, c.grades, c.points FROM activity_claims c JOIN activities a ON a.id = c.activity_id
     WHERE c.guild_id = ? AND c.status IN ('pending', 'approved', 'done')`, gid);
  const m = new Map<string, Count>();
  for (const r of rows) for (const id of ids(r.members)) {
    const k = m.get(id) ?? { veille: 0, live: 0, vDone: 0, lDone: 0, pending: 0, points: 0, last: null };
    if (r.status === "pending") k.pending++;
    else {
      if (r.kind === "live") { k.live++; if (r.status === "done") k.lDone++; } else { k.veille++; if (r.status === "done") k.vDone++; }
      if (r.status === "done") k.points += Math.round(((r.points ?? 0) * (Number(parse(r.grades, {})[id]) || 0)) / 100);
      if (!k.last || r.day > k.last) k.last = r.day;
    }
    m.set(id, k);
  }
  return m;
}
/** The students' last debrief level (Faible / Critique matter for random picks). */
async function levelsOf(env: Env, g: GuildRow): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const P = await progressView(env, g);
    for (const s of P.students) {
      let lv = "";
      for (const b of P.briefs) { const c = P.cells[`${b.id}:${s.discord_id}`]; if (c && (c.lv || c.plv)) lv = c.lv || c.plv; }
      if (lv) out.set(s.discord_id, lv);
    }
  } catch { /* no briefs yet */ }
  return out;
}
const students = (env: Env, g: GuildRow) =>
  all<{ discord_id: string; name: string | null }>(env, "SELECT discord_id, name FROM players WHERE guild_id = ? AND discord_id != ? ORDER BY name COLLATE NOCASE", g.id, g.teacher_id ?? "");

/** Every student with their presentations: done and planned per kind, who is behind. */
export async function signupStats(env: Env, g: GuildRow) {
  const [list, counts, levels] = await Promise.all([students(env, g), countsFor(env, g.id), levelsOf(env, g)]);
  const rows = list.map((s) => {
    const k = counts.get(s.discord_id) ?? { veille: 0, live: 0, vDone: 0, lDone: 0, pending: 0, points: 0, last: null };
    return { discord_id: s.discord_id, name: s.name || s.discord_id, level: levels.get(s.discord_id) ?? null, ...k, total: k.veille + k.live };
  });
  const avg = rows.length ? rows.reduce((s, r) => s + r.total, 0) / rows.length : 0;
  const avgV = rows.length ? rows.reduce((s, r) => s + r.veille, 0) / rows.length : 0;
  const avgL = rows.length ? rows.reduce((s, r) => s + r.live, 0) / rows.length : 0;
  for (const r of rows as any[]) r.behind = r.total === 0 && avg >= 0.5 ? true : r.total <= avg - 1;
  return { rows, avg: Math.round(avg * 10) / 10, avgVeille: Math.round(avgV * 10) / 10, avgLive: Math.round(avgL * 10) / 10 };
}

/** Random presenters for the activities picked: the fewest presentations of that kind first (ties at random),
 *  nobody twice on the same day, and a hard subject never goes to a Faible or Critique student.
 *  `apply` false: only the proposal (the teacher checks it first). */
export async function randomAssign(env: Env, g: GuildRow, list: number[], apply = false) {
  const [pool, counts, levels] = await Promise.all([students(env, g), countsFor(env, g.id), levelsOf(env, g)]);
  if (!pool.length) fail("No students in this class yet.");
  const busy = new Map<string, Set<string>>();   // day → students already presenting that day
  const planned = await all<{ members: string; day: string }>(env,
    `SELECT c.members, a.day FROM activity_claims c JOIN activities a ON a.id = c.activity_id WHERE c.guild_id = ? AND c.status IN ('pending', 'approved')`, g.id);
  for (const p of planned) for (const m of ids(p.members)) { if (!busy.has(p.day)) busy.set(p.day, new Set()); busy.get(p.day)!.add(m); }
  const extra = new Map<string, { veille: number; live: number }>();
  const nm = new Map(pool.map((s) => [s.discord_id, s.name || s.discord_id]));
  const out: { activity_id: number; day: string; kind: ActKind; title: string | null; level: string; members: string[]; names: string[]; skipped?: string }[] = [];
  const acts: (ActLite & { level: string; size: number })[] = [];
  for (const id of [...new Set(list.map(Number))].slice(0, 60)) {
    const a = await actOf(env, g.id, id);
    if (!a || (await takenBy(env, a.id))) continue;
    const s = await ensureSlot(env, g.id, a);
    acts.push({ ...a, level: s.level, size: s.size });
  }
  if (!acts.length) fail("Nothing to assign: the activities picked are already taken, or none was picked.");
  acts.sort((a, b) => a.day.localeCompare(b.day));
  for (const a of acts) {
    const day = busy.get(a.day) ?? new Set<string>();
    const n = (id: string) => (counts.get(id)?.[a.kind] ?? 0) + (extra.get(id)?.[a.kind] ?? 0);
    const tot = (id: string) => (counts.get(id)?.veille ?? 0) + (counts.get(id)?.live ?? 0) + (extra.get(id)?.veille ?? 0) + (extra.get(id)?.live ?? 0);
    const ok = pool.map((s) => s.discord_id).filter((id) => !day.has(id) && !(a.level === "hard" && LOW.has(levels.get(id) ?? "")));
    const pick = ok.map((id) => ({ id, k: n(id), t: tot(id), r: Math.random() })).sort((x, y) => x.k - y.k || x.t - y.t || x.r - y.r).slice(0, a.size).map((x) => x.id);
    if (pick.length < Math.min(a.size, a.kind === "veille" ? 2 : 1)) {
      out.push({ activity_id: a.id, day: a.day, kind: a.kind, title: a.title, level: a.level, members: [], names: [], skipped: "Not enough free students that day." });
      continue;
    }
    for (const id of pick) { day.add(id); const e = extra.get(id) ?? { veille: 0, live: 0 }; e[a.kind]++; extra.set(id, e); }
    busy.set(a.day, day);
    out.push({ activity_id: a.id, day: a.day, kind: a.kind, title: a.title, level: a.level, members: pick, names: pick.map((id) => nm.get(id)!) });
  }
  if (apply) for (const p of out) if (p.members.length) await assignActivity(env, g, p.activity_id, p.members, "random");
  return { plan: out, applied: apply };
}

// ------------------------------------------------------------- the page's view
/** For the Activités page: each activity's slot and current claim, the pending requests, the stats. */
export async function signupView(env: Env, g: GuildRow, from: string, to: string) {
  const cfg = await signupCfg(env, g.id);
  const acts = await all<{ id: number }>(env, "SELECT id FROM activities WHERE guild_id = ? AND day >= ? AND day <= ? AND kind IN ('veille', 'live')", g.id, from, to);
  const slots = acts.length ? await all<SlotRow>(env, `SELECT activity_id, level, size, shared_at FROM activity_slots WHERE activity_id IN (${acts.map(() => "?").join(",")})`, ...acts.map((a) => a.id)) : [];
  const claims = await all<ClaimRow & { day: string; title: string | null }>(env,
    `SELECT c.*, a.day, a.title FROM activity_claims c JOIN activities a ON a.id = c.activity_id
     WHERE c.guild_id = ? AND (c.status = 'pending' OR (a.day >= ? AND a.day <= ? AND c.status IN ('approved', 'done')))
     ORDER BY c.created_at`, g.id, from, to);
  const everyone = [...new Set(claims.flatMap((c) => ids(c.members)))];
  const shown = await names(env, g.id, everyone);
  const nm = new Map(everyone.map((id, i) => [id, shown[i]]));
  const [counts, stats] = await Promise.all([countsFor(env, g.id), signupStats(env, g)]);
  const view = (c: (typeof claims)[number]) => ({
    id: c.id, activity_id: c.activity_id, kind: c.kind, day: c.day, title: c.title, status: c.status, by: c.by, note: c.note,
    members: ids(c.members).map((id) => ({ id, name: nm.get(id) || id, veille: counts.get(id)?.veille ?? 0, live: counts.get(id)?.live ?? 0 })),
    grades: parse(c.grades, null), points: c.points, created_at: c.created_at,
  });
  return {
    cfg,
    slots: Object.fromEntries(slots.map((s) => [s.activity_id, { level: s.level, size: s.size, shared: !!s.shared_at }])),
    taken: Object.fromEntries(claims.filter((c) => c.status !== "pending").map((c) => [c.activity_id, view(c)])),
    pending: claims.filter((c) => c.status === "pending").map(view),
    avg: stats.avg,
    behind: stats.rows.filter((r: any) => r.behind).map((r) => ({ id: r.discord_id, name: r.name, total: r.total, level: r.level })),
  };
}

/** The Presentations page: every veille and live coding from two weeks ago on (with its slot and presenters),
 *  the requests, the ones to grade, the history and each student's counts. */
export async function presentationsView(env: Env, g: GuildRow) {
  const from = new Date(Date.now() - 14 * 86400e3).toISOString().slice(0, 10);
  const [cfg, base, stats] = await Promise.all([signupCfg(env, g.id), signupView(env, g, from, "9999-12-31"), signupStats(env, g)]);
  const acts = await all<{ id: number; day: string; kind: ActKind; title: string | null }>(env,
    "SELECT id, day, kind, title FROM activities WHERE guild_id = ? AND kind IN ('veille', 'live') AND day >= ? ORDER BY day, kind DESC LIMIT 300", g.id, from);
  const t0 = today();
  const items = acts.map((a) => {
    const slot = base.slots[a.id] ?? { level: "medium", size: DEF_SIZE[a.kind], shared: false };
    const c = base.taken[a.id] ?? null;
    return { ...a, ...slot, past: a.day < t0, claim: c, requests: base.pending.filter((p) => p.activity_id === a.id).length };
  });
  const hist = await all<ClaimRow & { day: string; title: string | null }>(env,
    `SELECT c.*, a.day, a.title FROM activity_claims c JOIN activities a ON a.id = c.activity_id
     WHERE c.guild_id = ? AND c.status IN ('done', 'denied', 'cancelled') ORDER BY COALESCE(c.done_at, c.decided_at, c.created_at) DESC LIMIT 150`, g.id);
  const everyone = [...new Set(hist.flatMap((c) => ids(c.members)))];
  const shown = await names(env, g.id, everyone);
  const nm = new Map(everyone.map((id, i) => [id, shown[i]]));
  return {
    cfg, items, pending: base.pending, stats,
    toGrade: items.filter((i) => i.claim?.status === "approved").map((i) => ({ ...i.claim!, day: i.day, title: i.title, past: i.past })),
    history: hist.map((c) => ({
      id: c.id, kind: c.kind, day: c.day, title: c.title, status: c.status, by: c.by, note: c.note === "taken" ? null : c.note,
      members: ids(c.members).map((id) => ({ id, name: nm.get(id) || id })), grades: parse(c.grades, null), points: c.points, at: c.done_at ?? c.decided_at ?? c.created_at,
    })),
  };
}

/** The activity deleted on the page: its sign-ups go too. */
export async function dropSignups(env: Env, gid: string, activityId: number) {
  await run(env, "DELETE FROM activity_slots WHERE activity_id = ? AND guild_id = ?", activityId, gid);
  await run(env, "UPDATE activity_claims SET status = 'cancelled' WHERE activity_id = ? AND guild_id = ? AND status IN ('pending', 'approved')", activityId, gid);
}

/** The subject in a few Discord messages (an embed holds 4096 characters). */
export function subjectChunks(md: string, max = 3900): string[] {
  const out: string[] = [];
  let cur = "";
  for (const para of md.split(/\n(?=#{1,3} |\n)/)) {
    if ((cur + "\n" + para).length > max && cur) { out.push(cur); cur = ""; }
    cur = cur ? cur + "\n" + para : para;
    while (cur.length > max) { out.push(cur.slice(0, max)); cur = cur.slice(max); }
  }
  if (cur.trim()) out.push(cur);
  return out;
}
