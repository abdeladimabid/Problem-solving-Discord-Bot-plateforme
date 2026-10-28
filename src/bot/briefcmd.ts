// /github (link GitHub to your record) and /brief (your briefs: dates, hand-in, your debrief).
import type { PlayerRow } from "../shared/types.ts";
import { t } from "../shared/i18n.ts";
import { COLORS, linkBtn, row } from "../shared/discord.ts";
import { all, now, one, run } from "../shared/db.ts";
import { canRead, connectUrl, ghAppOf, githubReady, parseRepo } from "../shared/github.ts";
import { planLinkIn } from "../shared/review/engine.ts";
import { cleanSquads, squadOf } from "../shared/review/debrief.ts";
import { studentBriefs } from "../shared/learning.ts";
import { compLabel, parseComp } from "../shared/program.ts";
import { type Ix, deferReply, json, later, reply, say } from "./ix.ts";

export async function cmdGithub(ix: Ix) {
  const L = ix.L;
  if (!githubReady(await ghAppOf(ix.env, ix.guild.id))) return say(t(L, "gh.not_ready"));
  const p = await one<PlayerRow>(ix.env, "SELECT * FROM players WHERE guild_id = ? AND discord_id = ?", ix.guild.id, ix.userId);
  const url = await connectUrl(ix.env, ix.guild.id, ix.userId);
  return reply({
    embeds: [{ title: t(L, "gh.link_title"), description: (p?.github_login ? t(L, "gh.linked_already", { login: p.github_login }) + "\n\n" : "") + t(L, "gh.link_body"), color: COLORS.gray }],
    components: [row(linkBtn(t(L, "gh.link_btn"), url, "🐙"))],
  }, true);
}

const openBriefs = (ix: Ix) => all<{ id: number; title: string; start_at: number | null; due_at: number | null; kind: string; squads: string | null }>(ix.env,
  "SELECT id, title, start_at, due_at, kind, squads FROM briefs WHERE guild_id = ? AND status = 'assigned' AND (due_at IS NULL OR due_at > ?) ORDER BY COALESCE(due_at, 9e15)", ix.guild.id, now() - 14 * 86400);

export async function briefChoices(ix: Ix, cur: string) {
  return (await openBriefs(ix)).filter((b) => b.title.toLowerCase().includes(cur)).slice(0, 25).map((b) => ({ name: b.title.slice(0, 100), value: String(b.id) }));
}

export async function cmdBrief(ix: Ix, sub: string, o: Record<string, any>) {
  const L = ix.L, g = ix.guild;
  if (sub !== "submit") {
    later(ix, async () => {
      const list = await studentBriefs(ix.env, g, ix.userId);
      if (!list.length) return { content: t(L, "brief.none") };
      // each brief's page on Simplonline, when the teacher gave it: the title opens it
      const ids = list.slice(0, 8).map((b) => b.id);
      const links = new Map((await all<{ id: number; link: string | null }>(ix.env, `SELECT id, json_extract(data, '$.link') AS link FROM briefs WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids).catch(() => []))
        .filter((r) => r.link && /^https:\/\//.test(r.link)).map((r) => [r.id, r.link!]));
      const lines = list.slice(0, 8).map((b) => {
        const squad = b.squad ? t(L, "brief.squad", { name: b.squad.name, sm: b.squad.sm ? t(L, "brief.sm") : "" }) : "";
        const handin = b.handin ? t(L, "brief.handed", { repo: `[${b.handin.repo}](https://github.com/${b.handin.repo})` }) : t(L, "brief.not_handed");
        const res = b.review?.status === "final" ? "\n" + t(L, "brief.result", { pct: b.review.pct ?? "—", ok: (b.review.ok ?? []).map((c: string) => { const pc = parseComp(c); return pc ? compLabel(pc.code) + (pc.level ? "N" + pc.level : "") : c; }).join(", ") || "—" }) : "";
        return t(L, "brief.line", { title: links.has(b.id) ? `[${b.title}](${links.get(b.id)})` : b.title, squad, due: b.due ? `<t:${b.due}:R>` : "—", handin }) + res;
      });
      return { embeds: [{ title: t(L, "brief.list_title"), description: lines.join("\n\n").slice(0, 4000), color: COLORS.blue }] };
    });
    return deferReply(true);
  }
  // submit: the repo (and the planning board) for an open brief
  const open = await openBriefs(ix);
  const b = o.brief ? open.find((x) => String(x.id) === String(o.brief)) : open.length === 1 ? open[0] : null;
  if (!b) return say(t(L, open.length ? "brief.which" : "brief.none"));
  const repo = parseRepo(String(o.repo ?? ""));
  if (!repo) return say(t(L, "brief.bad_repo"));
  const plan = String(o.plan ?? "").trim() ? planLinkIn(String(o.plan)) : "";
  if (String(o.plan ?? "").trim() && !plan) return say(t(L, "brief.bad_plan"));
  const p = await one<PlayerRow>(ix.env, "SELECT * FROM players WHERE guild_id = ? AND discord_id = ?", g.id, ix.userId);
  if (!p?.gh_inst) return say(t(L, "brief.no_github"));
  let who = `u:${ix.userId}`;
  if (b.kind === "squad") {
    const sq = squadOf(cleanSquads(b.squads || "[]"), ix.userId);
    if (!sq) return say(t(L, "brief.no_squad"));
    if (sq.sm !== ix.userId) return say(t(L, "brief.not_sm", { name: sq.name }));
    who = `s:${sq.id}`;
  }
  later(ix, async () => {
    const full = await canRead(ix.env, g.id, p.gh_inst!, repo);
    if (!full) return { content: t(L, "brief.cant_read", { repo }) };
    await run(ix.env, `INSERT INTO brief_handins (brief_id, guild_id, who, repo, plan, at, by) VALUES (?, ?, ?, ?, ?, ?, 'student')
      ON CONFLICT (brief_id, who) DO UPDATE SET repo = excluded.repo, plan = excluded.plan, at = excluded.at, by = 'student'`, b.id, g.id, who, full, plan || null, now());
    return { content: t(L, "brief.submitted", { title: b.title, repo: full, late: b.due_at && now() > b.due_at ? t(L, "brief.late") : "" }) };
  });
  return deferReply(true);
}
export { json };
