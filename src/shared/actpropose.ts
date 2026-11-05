// Students propose a veille or a live coding (/activity propose: the kind, a subject, what they want to present). Every
// teacher of this ClassBot sees the proposals of all the classes (Activités → Propositions). A teacher plans one on a
// free day of their own class in the next 4 weeks: the activity is written from it (with AI, like Regenerate with a
// proposal, or as the student wrote it), then shared in the class's activities channel: open to every student
// (/activity choose). Or the teacher turns it down with a word. The student is told either way, by DM.
import type { Env, GuildRow } from "./types.ts";
import { all, getGuild, now, one, run } from "./db.ts";
import { COLORS, truncate } from "./discord.ts";
import { t } from "./i18n.ts";
import { activitiesView, addDays, generateItem } from "./activities.ts";
import { shareActivities, signupCfg } from "./actsignup.ts";
import { dmChecked } from "./notify.ts";

export class ProposalError extends Error {}
const fail = (msg: string): never => { throw new ProposalError(msg); };

export type PropKind = "veille" | "live";
export interface ProposalRow { id: number; guild_id: string; kind: PropKind; title: string; details: string | null; by: string; status: string; note: string | null; plans: string; created_at: number; decided_at: number | null }
interface Plan { guild: string; activity: number; day: string; at: number }

const WEEKS_AHEAD = 4;
const clean = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const plansOf = (r: ProposalRow): Plan[] => { try { const v = JSON.parse(r.plans || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const today = () => new Date().toISOString().slice(0, 10);

/** A student's proposal (/activity propose): a veille or a live coding, its subject, and what they want to present. */
export async function proposeActivity(env: Env, g: GuildRow, uid: string, b: { kind?: unknown; title?: unknown; details?: unknown }) {
  const kind = b.kind === "live" ? "live" : b.kind === "veille" ? "veille" : fail("Choose a veille or a live coding.");
  const title = clean(b.title, 120);
  if (title.length < 4) fail("Write the subject (4 characters at least).");
  const details = clean(b.details, 1500) || null;
  const r = await one<{ id: number }>(env, "INSERT INTO activity_proposals (guild_id, kind, title, details, by, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    g.id, kind, title, details, uid, now());
  return { id: r!.id, kind, title };
}

/** A student's own proposals (the latest), for /activity mine. */
export async function myProposals(env: Env, gid: string, uid: string) {
  return all<ProposalRow>(env, "SELECT * FROM activity_proposals WHERE guild_id = ? AND by = ? ORDER BY created_at DESC LIMIT 10", gid, uid);
}

/** The free days of a class in the next weeks: a work day without a veille, a live-coding day without a live coding. */
async function freeDays(env: Env, g: GuildRow) {
  const from = addDays(today(), 1), to = addDays(from, WEEKS_AHEAD * 7 - 1);
  const v = await activitiesView(env, g, from, to).catch(() => null);
  if (!v) return { veille: [] as string[], live: [] as string[] };
  const taken = (kind: string) => new Set(v.items.filter((i: any) => i.kind === kind).map((i: any) => i.day));
  const work = v.days.filter((d: any) => d.kind === "work" && d.day >= from).map((d: any) => d.day);
  const live = v.weeks.flatMap((w: any) => w.live || []).filter((d: string) => d >= from);
  const tv = taken("veille"), tl = taken("live");
  return { veille: work.filter((d: string) => !tv.has(d)), live: [...new Set<string>(live)].sort().filter((d) => !tl.has(d)) };
}

/** Every class's proposals (the teacher's class first), with who and where they were planned; the free days of this class. */
export async function proposalsView(env: Env, g: GuildRow) {
  const rows = await all<ProposalRow>(env, "SELECT * FROM activity_proposals ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 300");
  const classes = new Map((await all<{ id: string; name: string | null }>(env, "SELECT id, name FROM guilds")).map((c) => [c.id, c.name || c.id]));
  const names = new Map<string, string>();
  for (const r of rows) {
    const k = `${r.guild_id}:${r.by}`;
    if (names.has(k)) continue;
    const p = await one<{ name: string | null }>(env, "SELECT name FROM players WHERE guild_id = ? AND discord_id = ?", r.guild_id, r.by);
    names.set(k, p?.name || r.by);
  }
  const items = rows.map((r) => ({
    id: r.id, kind: r.kind, title: r.title, details: r.details, status: r.status, note: r.note, created_at: r.created_at, decided_at: r.decided_at,
    by: r.by, name: names.get(`${r.guild_id}:${r.by}`), guild: r.guild_id, className: classes.get(r.guild_id) || r.guild_id, mine: r.guild_id === g.id,
    plans: plansOf(r).map((p) => ({ ...p, className: classes.get(p.guild) || p.guild, here: p.guild === g.id })),
  })).sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || Number(b.mine) - Number(a.mine) || b.created_at - a.created_at);
  return { items, free: await freeDays(env, g), channel: !!(await signupCfg(env, g.id)).channel };
}

/** The student told what happened to their proposal (in their class's language). */
async function tell(env: Env, r: ProposalRow, key: string, vars: Record<string, string>) {
  const sg = await getGuild(env, r.guild_id).catch(() => null);
  const L = sg?.lang || "fr";
  await dmChecked(env, r.by, { embeds: [{ title: t(L, "prop.dm_title"), description: truncate(t(L, key, { title: r.title, ...vars }), 4000), color: key === "prop.dm_denied" ? COLORS.gray : COLORS.green }] }).catch(() => null);
}

/**
 * A proposal planned in the teacher's class on a free day: the activity written from it (with AI: the template's
 * sections, within the programme; or as the student wrote it), then shared in the class's activities channel, open
 * to every student. Returns the activity and whether it was shared.
 */
export async function planProposal(env: Env, g: GuildRow, id: number, b: { day?: unknown; ai?: unknown }) {
  const r = await one<ProposalRow>(env, "SELECT * FROM activity_proposals WHERE id = ?", id) ?? fail("This proposal doesn't exist any more.");
  if (r.status === "denied") fail("This proposal was turned down.");
  if (plansOf(r).some((p) => p.guild === g.id)) fail("This proposal is already planned in this class.");
  const day = String(b.day || "");
  const free = await freeDays(env, g);
  if (!free[r.kind].includes(day)) fail(`Pick a free ${r.kind === "live" ? "live-coding" : "veille"} day of the next ${WEEKS_AHEAD} weeks.`);
  const proposal = `${r.title}${r.details ? `\n\n${r.details}` : ""}`;
  let activity: number | null = null, ai = false;
  if (b.ai !== false) {
    const out: any = await generateItem(env, g, { day, kind: r.kind, proposal }).catch(() => null);
    if (out?.item?.id) { activity = Number(out.item.id); ai = true; }
  }
  if (!activity) {
    // as the student wrote it (no AI, or the AI didn't answer): the teacher can regenerate it from the Activités page
    const author = (await one<{ name: string | null }>(env, "SELECT name FROM players WHERE guild_id = ? AND discord_id = ?", r.guild_id, r.by))?.name || "";
    const md = [`# ${r.title}`, "", `*${r.kind === "live" ? "Live coding" : "Veille"} proposé${author ? ` par ${author}` : " par un apprenant"}.*`, "", r.details || ""].join("\n").trim();
    const row = await one<{ id: number }>(env, "INSERT INTO activities (guild_id, day, kind, title, data, md, warnings, edited, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, '[]', 1, ?, ?) RETURNING id",
      g.id, day, r.kind, r.title, md, now(), now()).catch(() => null);
    activity = row?.id ?? fail("This day was just taken: pick another one.");
  }
  let shared = false;
  if ((await signupCfg(env, g.id)).channel) shared = await shareActivities(env, g, [activity!]).then(() => true, () => false);
  const plans = [...plansOf(r), { guild: g.id, activity: activity!, day, at: now() }];
  await run(env, "UPDATE activity_proposals SET status = 'planned', plans = ?, decided_at = ? WHERE id = ?", JSON.stringify(plans), now(), id);
  const date = new Date(day + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  await tell(env, r, g.id === r.guild_id ? "prop.dm_planned" : "prop.dm_planned_other", { day: date, class: g.name || g.id });
  return { activity, day, ai, shared };
}

/** A proposal turned down, with the teacher's word for the student. */
export async function denyProposal(env: Env, g: GuildRow, id: number, note: unknown) {
  const r = await one<ProposalRow>(env, "SELECT * FROM activity_proposals WHERE id = ?", id) ?? fail("This proposal doesn't exist any more.");
  if (r.status !== "pending") fail("Only a proposal still waiting can be turned down.");
  const word = clean(note, 500) || null;
  await run(env, "UPDATE activity_proposals SET status = 'denied', note = ?, decided_at = ? WHERE id = ?", word, now(), id);
  await tell(env, r, "prop.dm_denied", { note: word ? `\n> ${word}` : "" });
  void g;
  return { ok: true };
}

/** Proposals still waiting (all the classes): the menu's count. */
export async function pendingProposals(env: Env) {
  return (await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM activity_proposals WHERE status = 'pending'").catch(() => null))?.n ?? 0;
}
