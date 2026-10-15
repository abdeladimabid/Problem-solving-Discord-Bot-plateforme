// /activity: the veilles and live codings the teacher shared. list (still free), choose (with your binôme: the
// teacher approves), mine (your activities, and the subject once it's yours).
import { t } from "../shared/i18n.ts";
import { COLORS, truncate } from "../shared/discord.ts";
import { myActivities, openActivities, requestActivity, signupCfg, subjectChunks } from "../shared/actsignup.ts";
import { type Ix, deferReply, later, reply, say } from "./ix.ts";

const dayLabel = (L: string, iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString(L === "fr" ? "fr-FR" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const kindLabel = (L: string, k: string) => t(L, k === "live" ? "act.kind_live" : "act.kind_veille");

export async function activityChoices(ix: Ix, cur: string) {
  const L = ix.L;
  return (await openActivities(ix.env, ix.guild.id))
    .map((a) => ({ name: `#${a.id} · ${kindLabel(L, a.kind)} · ${dayLabel(L, a.day)} · ${a.title ?? ""}`.slice(0, 100), value: String(a.id) }))
    .filter((c) => c.name.toLowerCase().includes(cur.replace(/^#/, "")))
    .slice(0, 25);
}

export async function cmdActivity(ix: Ix, sub: string, o: Record<string, any>) {
  const L = ix.L, g = ix.guild;
  if (sub === "list") {
    const [list, cfg] = await Promise.all([openActivities(ix.env, g.id), signupCfg(ix.env, g.id)]);
    if (!list.length) return say(t(L, "act.none_open"));
    const lines = list.slice(0, 30).map((a) => `**#${a.id}** · ${kindLabel(L, a.kind)} · ${dayLabel(L, a.day)} · ${a.title ?? "—"}${a.pending ? ` · ${t(L, "act.asked_n", { n: a.pending })}` : ""}`);
    return reply({ embeds: [{ title: t(L, "act.list_title"), description: truncate([t(L, "act.share_intro", { veille: cfg.veille, live: cfg.live }), "", ...lines, "", t(L, "act.list_how")].join("\n"), 4000), color: COLORS.purple }] }, true);
  }
  if (sub === "choose") {
    const id = Number(String(o.activity ?? "").replace(/^#/, ""));
    if (!id) return say(t(L, "act.not_open"));
    later(ix, async () => {
      const r: any = await requestActivity(ix.env, g, ix.userId, id, [o.partner, o.partner2].filter(Boolean).map(String));
      if (r.error) return { content: r.error };
      const mates = r.members.filter((m: string) => m !== ix.userId).map((m: string) => `<@${m}>`).join(", ");
      return { content: t(L, "act.requested", { title: r.activity.title ?? `#${id}`, day: dayLabel(L, r.activity.day), mates: mates ? t(L, "act.with", { names: mates }) : "" }), allowed_mentions: { parse: [] } };
    });
    return deferReply(true);
  }
  // mine: what I asked for, what's mine (with the subject), what I presented
  later(ix, async () => {
    const rows = await myActivities(ix.env, g.id, ix.userId);
    if (!rows.length) return { content: t(L, "act.mine_none") };
    const st = (s: string) => t(L, `act.st_${s}`);
    const lines = rows.map((r) => {
      const grade = r.status === "done" && r.grades ? ` · ${JSON.parse(r.grades)[ix.userId] ?? 0}%` : "";
      return `**#${r.activity_id}** · ${kindLabel(L, r.kind)} · ${dayLabel(L, r.day)} · ${r.title ?? "—"}\n${st(r.status)}${grade}${r.note && r.note !== "taken" ? ` · ${truncate(r.note, 200)}` : ""}`;
    });
    // the subject of the next approved one, in full (a few embeds if it's long)
    const next = rows.filter((r) => r.status === "approved").sort((a, b) => a.day.localeCompare(b.day))[0];
    const embeds: any[] = [{ title: t(L, "act.mine_title"), description: truncate(lines.join("\n\n"), 4000), color: COLORS.purple }];
    if (next) {
      const parts = subjectChunks(next.md, 3900).slice(0, 2);
      parts.forEach((p, i) => embeds.push({ title: i ? undefined : `${kindLabel(L, next.kind)} · ${next.title ?? ""}`.slice(0, 250), description: p, color: COLORS.green }));
      if (subjectChunks(next.md, 3900).length > 2) embeds.push({ description: t(L, "act.subject_more"), color: COLORS.gray });
    }
    return { embeds };
  });
  return deferReply(true);
}
