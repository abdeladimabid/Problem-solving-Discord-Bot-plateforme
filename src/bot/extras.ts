// Discord handlers: ✋ /help-me queue, ❓ /ask + /faq, 🎤 /interview, 🐙 /project,
// 🏆 /league, 🔗 profile sharing and 🎓 certificates.
import type { Difficulty } from "../shared/types.ts";
import { all, now, one } from "../shared/db.ts";
import { t } from "../shared/i18n.ts";
import { COLORS, btn, linkBtn, modal, row, truncate } from "../shared/discord.ts";
import { getChallenge, pickChallenge, renderFor, startAttempt } from "../shared/challenges.ts";
import { HandError, cancelHand, handText, myHand, raiseHand } from "../shared/hands.ts";
import { FaqError, ask, draftAnswer, escalate, helped, searchFaq } from "../shared/faq.ts";
import type { FaqRow } from "../shared/faq.ts";
import { MAX_ANSWERS, finishInterview, getInterview, interviewReply, openInterview, stars, transcriptOf } from "../shared/interview.ts";
import { ProjectError, findProject, gradeRepo, linkRepo, openProjects, projectEmbed, resultText } from "../shared/projects.ts";
import type { RepoRow } from "../shared/projects.ts";
import { leagueLines, leagueOf, leagueTable, weekStart } from "../shared/league.ts";
import { certUrl, shareProfile, stopSharing } from "../shared/share.ts";
import { type Ix, deferReply, json, later, reply, say } from "./ix.ts";

// ================================================================ ✋ help-me
export async function cmdHelpMe(ix: Ix) {
  const L = ix.L;
  const h = await myHand(ix.env, ix.guild, ix.userId);
  if (h) {
    return reply({
      content: handText(L, h, h.status === "helping" ? 0 : h.position) + (h.status === "helping" ? "\n" + t(L, "hand.coming_short") : ""),
      components: [row(btn(t(L, "hand.cancel"), `hand:cancel:${h.id}`, 4, "✖️"))],
    }, true);
  }
  return json(modal("mhand", t(L, "hand.modal_title"), [
    { id: "q", label: t(L, "hand.modal_q"), long: true, max: 1000 },
    { id: "code", label: t(L, "hand.modal_code"), long: true, required: false, max: 4000 },
  ]));
}

export function handSubmit(ix: Ix, components: any[]) {
  const L = ix.L;
  const val = (id: string) => String(components.flatMap((r: any) => r.components ?? []).find((c: any) => c.custom_id === id)?.value ?? "");
  later(ix, async () => {
    try {
      const r = await raiseHand(ix.env, ix.guild, ix.userId, ix.userName, val("q"), val("code") || null);
      return { content: handText(L, { question: val("q"), code: val("code") || null }, r.position), components: [row(btn(t(L, "hand.cancel"), `hand:cancel:${r.id}`, 4, "✖️"))] };
    } catch (e) {
      if (!(e instanceof HandError)) throw e;
      return { content: t(L, e.message) };
    }
  });
  return deferReply(true);
}

export async function handButton(ix: Ix, action: string, id: number) {
  if (action !== "cancel") return say(t(ix.L, "err.unknown"));
  const ok = await cancelHand(ix.env, ix.guild, ix.userId, id);
  return json({ type: 7, data: { content: t(ix.L, ok ? "hand.cancelled" : "hand.gone"), components: [] } });
}

// ============================================================ ❓ ask / faq
const faqEmbed = (L: string, f: FaqRow) => ({ title: `❓ ${truncate(f.question, 240)}`, description: truncate(f.answer ?? "", 3500), color: COLORS.blue, footer: { text: t(L, "faq.footer", { id: f.id }) } });

export function cmdAsk(ix: Ix, question: string) {
  const L = ix.L;
  later(ix, async () => {
    try {
      const r = await ask(ix.env, ix.guild, ix.userId, question);
      if (r.kind === "found") {
        return {
          content: t(L, "faq.found"),
          embeds: r.matches.slice(0, 2).map((m) => faqEmbed(L, m.row)),
          components: [row(
            btn(t(L, "faq.that_helps"), `faqok:${r.suggestion}:${r.matches[0].row.id}`, 3, "✅"),
            btn(t(L, "faq.ask_teacher"), `faqask:${r.suggestion}`, 2, "📨"),
          )],
        };
      }
      if (r.kind === "queued") ix.ctx.waitUntil(draftAnswer(ix.env, ix.guild, r.id).catch((e) => console.error("faq draft", e)));
      return { content: t(L, r.kind === "joined" ? "faq.joined" : "faq.queued") };
    } catch (e) {
      if (!(e instanceof FaqError)) throw e;
      return { content: t(L, e.message) };
    }
  });
  return deferReply(true);
}

export function faqButton(ix: Ix, kind: string, suggestion: number, faqId: number) {
  const L = ix.L;
  later(ix, async () => {
    if (kind === "faqok") {
      await helped(ix.env, ix.guild, ix.userId, suggestion, faqId);
      return { content: t(L, "faq.glad"), components: [] };
    }
    try {
      const r = await escalate(ix.env, ix.guild, ix.userId, suggestion);
      if (r.kind === "queued") ix.ctx.waitUntil(draftAnswer(ix.env, ix.guild, r.id).catch((e) => console.error("faq draft", e)));
      return { content: t(L, r.kind === "joined" ? "faq.joined" : "faq.queued"), embeds: [], components: [] };
    } catch (e) {
      if (!(e instanceof FaqError)) throw e;
      return { content: t(L, e.message), components: [] };
    }
  });
  return json({ type: 6 });
}

export async function cmdFaq(ix: Ix, search: string | null) {
  const L = ix.L;
  if (search && search.trim()) {
    const m = await searchFaq(ix.env, ix.guild, search, "approved", 3);
    if (!m.length) return say(t(L, "faq.nothing", { q: truncate(search, 80) }));
    return reply({ embeds: m.map((x) => faqEmbed(L, x.row)) }, true);
  }
  const rows = await all<FaqRow>(ix.env, "SELECT * FROM faq WHERE guild_id = ? AND status = 'approved' ORDER BY hits DESC, answered_at DESC LIMIT 15", ix.guild.id);
  if (!rows.length) return say(t(L, "faq.empty"));
  return reply({ embeds: [{ title: t(L, "faq.title"), description: truncate(rows.map((r) => `**#${r.id}** ${truncate(r.question, 150)}`).join("\n"), 4000) + "\n\n" + t(L, "faq.hint"), color: COLORS.blue }] }, true);
}

// ========================================================== 🎤 interview
const ivButtons = (L: string, id: number, done = false) => row(
  btn(t(L, "iv.answer_btn"), `ivr:${id}`, 1, "💬", done),
  btn(t(L, "iv.end_btn"), `ive:${id}`, 2, "🏁"),
);

export function cmdInterview(ix: Ix, difficulty: Difficulty) {
  const L = ix.L;
  later(ix, async () => {
    const c = await pickChallenge(ix.env, ix.guild, { players: [ix.userId], difficulty, mode: "write" })
      ?? await pickChallenge(ix.env, ix.guild, { players: [ix.userId], difficulty, mode: "write", allowSeen: true });
    if (!c) return { content: t(L, "iv.none") };
    const a = await startAttempt(ix.env, ix.guild, ix.userId, c, "interview");
    const iv = await openInterview(ix.env, ix.guild, ix.userId, c, a);
    const view = await renderFor(ix.env, ix.guild, c, a, { notice: t(L, "iv.intro") + "\n\n🎤 **" + t(L, "iv.interviewer") + ":** " + transcriptOf(iv)[0].text }) as any;
    const comps = [...(view.components ?? [])].slice(0, 4);
    comps.push(ivButtons(L, iv.id));
    return { ...view, components: comps };
  });
  return deferReply(true);
}

async function ownInterview(ix: Ix, id: number) {
  const iv = await getInterview(ix.env, id);
  if (!iv || iv.guild_id !== ix.guild.id || iv.discord_id !== ix.userId) return null;
  return iv;
}

export async function interviewButton(ix: Ix, kind: string, id: number) {
  const L = ix.L;
  const iv = await ownInterview(ix, id);
  if (!iv) return say(t(L, "err.not_yours"));
  if (kind === "ivr") {
    if (iv.status !== "active") return say(t(L, "iv.over"));
    return json(modal(`miv:${id}`, t(L, "iv.modal_title"), [{ id: "a", label: t(L, "iv.modal_label"), long: true, max: 1200 }]));
  }
  later(ix, async () => {
    const { card, bonus } = await finishInterview(ix.env, ix.guild, iv);
    return {
      embeds: [{
        title: t(L, "iv.card_title"),
        description: [
          `**${t(L, "iv.verdict")}:** ${card.verdict} · **${card.overall}/5**`, "",
          `${stars(card.problem)} ${t(L, "iv.c.problem")}`, `${stars(card.communication)} ${t(L, "iv.c.communication")}`,
          `${stars(card.code)} ${t(L, "iv.c.code")}`, `${stars(card.complexity)} ${t(L, "iv.c.complexity")}`, "",
          `💪 ${card.strengths}`, `🎯 ${card.improve}`,
          bonus ? "\n" + t(L, "iv.bonus", { p: bonus }) : "",
        ].join("\n"),
        color: card.overall >= 3.5 ? COLORS.green : card.overall >= 2.5 ? COLORS.gold : COLORS.red,
        footer: { text: t(L, card.ai ? "iv.footer_ai" : "iv.footer_stats") },
      }],
      components: [row(btn(t(L, "iv.again"), `ivnew:${(await getChallenge(ix.env, iv.challenge_id))?.difficulty ?? "easy"}`, 1, "🎤"))],
    };
  });
  return deferReply(true);
}

export function interviewSubmit(ix: Ix, id: number, answer: string) {
  const L = ix.L;
  later(ix, async () => {
    const iv = await ownInterview(ix, id);
    if (!iv || iv.status !== "active") return { content: t(L, "iv.over") };
    if (answer.trim().length < 2) return { content: t(L, "iv.empty") };
    const r = await interviewReply(ix.env, ix.guild, iv, answer);
    const left = MAX_ANSWERS - transcriptOf({ ...iv, transcript: JSON.stringify([...transcriptOf(iv), { who: "me", text: answer }]) }).filter((x) => x.who === "me").length;
    return {
      content: `> ${truncate(answer.trim(), 400).split("\n").join("\n> ")}\n\n🎤 **${t(L, "iv.interviewer")}:** ${r.text}\n-# ${t(L, r.last ? "iv.last" : "iv.left", { n: Math.max(0, left) })}`,
      components: [ivButtons(L, id, r.last)],
    };
  });
  return deferReply(true);
}

// ============================================================ 🐙 projects
export async function cmdProject(ix: Ix, sub: string, o: Record<string, any>) {
  const L = ix.L, g = ix.guild;
  if (sub === "list") {
    later(ix, async () => {
      const ps = await openProjects(ix.env, g);
      if (!ps.length) return { content: t(L, "proj.none") };
      const mine = await all<RepoRow>(ix.env, "SELECT * FROM project_repos WHERE guild_id = ? AND discord_id = ?", g.id, ix.userId);
      return {
        embeds: ps.slice(0, 5).map((p) => {
          const e = projectEmbed(g, p);
          const r = mine.find((x) => x.project_id === p.id);
          return { ...e, fields: [{ name: t(L, "proj.yours"), value: r ? t(L, "proj.status", { repo: r.repo, best: r.best, total: r.total || JSON.parse(p.tests).length, pts: r.points }) + (r.error ? "\n⚠️ " + t(L, r.error, { file: p.entry, repo: r.repo }) : "") : t(L, "proj.not_linked") }] };
        }),
      };
    });
    return deferReply(true);
  }
  const p = await findProject(ix.env, g, o.project ?? null);
  if (!p) return say(t(L, (await openProjects(ix.env, g)).length ? "proj.which" : "proj.none"));
  later(ix, async () => {
    try {
      let pr: RepoRow | null;
      if (sub === "submit") pr = await linkRepo(ix.env, g, ix.userId, p, String(o.repo ?? ""));
      else pr = await one<RepoRow>(ix.env, "SELECT * FROM project_repos WHERE project_id = ? AND discord_id = ?", p.id, ix.userId);
      if (!pr) return { content: t(L, "proj.link_first") };
      if (sub === "check" && pr.checked_at && now() - pr.checked_at < 30) return { content: t(L, "proj.wait") };
      const r = await gradeRepo(ix.env, g, p, pr);
      const fresh = (await one<RepoRow>(ix.env, "SELECT * FROM project_repos WHERE project_id = ? AND discord_id = ?", p.id, ix.userId))!;
      return { content: (sub === "submit" ? t(L, "proj.linked", { repo: pr.repo }) + "\n" : "") + resultText(L, p, fresh, r) + (sub === "submit" ? "\n\n" + t(L, "proj.webhook", { url: `${(ix.env.PUBLIC_URL || "").replace(/\/$/, "")}/gh/hook` }) : "") };
    } catch (e) {
      if (!(e instanceof ProjectError)) throw e;
      return { content: t(L, e.message) };
    }
  });
  return deferReply(true);
}

export async function projectChoices(ix: Ix, cur: string) {
  return (await openProjects(ix.env, ix.guild)).filter((p) => p.title.toLowerCase().includes(cur)).slice(0, 25).map((p) => ({ name: p.title.slice(0, 100), value: String(p.id) }));
}

// ============================================================== 🏆 league
export function cmdLeague(ix: Ix) {
  const L = ix.L;
  later(ix, async () => {
    const lg = leagueOf(ix.guild);
    const table = await leagueTable(ix.env);
    if (!lg.on && !table.length) return { content: t(L, "league.off") };
    const last = await leagueTable(ix.env, weekStart(now()) - 7 * 86400);
    return {
      embeds: [{
        title: t(L, "league.title"),
        description: [lg.on ? "" : t(L, "league.not_in"), ...(table.length ? leagueLines(table, ix.guild.id, L) : [t(L, "league.empty")]),
          last.length > 1 && last[0].score > 0 ? "\n" + t(L, "league.last_winner", { name: last[0].name, score: last[0].score }) : ""].filter(Boolean).join("\n"),
        color: COLORS.gold,
        footer: { text: t(L, "league.how") },
      }],
    };
  });
  return deferReply(false);
}

// ==================================================== 🔗 share / 🎓 certificate
export function profileButtons(L: string) {
  return row(btn(t(L, "share.btn"), "share:on", 2, "🔗"), btn(t(L, "cert.btn"), "cert:0", 2, "🎓"));
}

export function shareButton(ix: Ix, action: string) {
  const L = ix.L;
  later(ix, async () => {
    if (action === "off") {
      await stopSharing(ix.env, ix.guild, ix.userId);
      return { content: t(L, "share.stopped"), components: [] };
    }
    const url = await shareProfile(ix.env, ix.guild, ix.userId);
    return { content: t(L, "share.on", { url }), components: [row(linkBtn(t(L, "share.open"), url, "🔗"), btn(t(L, "share.stop"), "share:off", 4, "🙈"))] };
  });
  return deferReply(true);
}

export function certButton(ix: Ix) {
  const L = ix.L;
  later(ix, async () => {
    const seasons = await all<{ season: string; pts: number }>(ix.env,
      "SELECT season, SUM(amount) AS pts FROM ledger WHERE guild_id = ? AND discord_id = ? GROUP BY season HAVING pts > 0 ORDER BY MAX(created_at) DESC LIMIT 5", ix.guild.id, ix.userId);
    if (!seasons.length) return { content: t(L, "cert.none") };
    const links = await Promise.all(seasons.map(async (s) => linkBtn(s.season === ix.guild.season ? t(L, "cert.current", { season: s.season.slice(0, 40) }) : s.season.slice(0, 60), await certUrl(ix.env, ix.guild.id, ix.userId, s.season), "🎓")));
    return { content: t(L, "cert.pick"), components: [row(...links)] };
  });
  return deferReply(true);
}
