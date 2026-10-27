// 💼 /portfolio: the student builds the portfolio they show companies (the public page /u/<key>).
//   link       their link (sharing on), what's still missing, buttons: open · about me · contact · stop sharing
//   add        a project: one of their GitHub repos (autocomplete) or any link; GitHub gives its description, languages, stars, demo
//   remove · feature · about (form) · contact (form) · available (internship, work-study…) · show (a part on / off)
import { type Ix, deferReply, json, later, say } from "./ix.ts";
import { t } from "../shared/i18n.ts";
import { COLORS, btn, linkBtn, modal, row } from "../shared/discord.ts";
import { shareProfile } from "../shared/share.ts";
import { PortfolioError, addProject, featureProject, getPortfolio, myRepos, removeProject, saveAbout, setOpen, setShown } from "../shared/portfolio.ts";
import { one } from "../shared/db.ts";

const errText = (L: string, e: unknown) => (e instanceof PortfolioError ? t(L, `pf.err_${e.message}`) : null);

export async function cmdPortfolio(ix: Ix, sub: string | null, o: Record<string, any>): Promise<Response> {
  const L = ix.L, gid = ix.guild.id, uid = ix.userId;
  const safe = (work: () => Promise<Record<string, unknown>>) => {
    later(ix, async () => { try { return await work(); } catch (e) { const m = errText(L, e); if (m) return { content: m }; throw e; } });
    return deferReply(true);
  };
  if (sub === "about") return aboutForm(ix);
  if (sub === "contact") return contactForm(ix);
  if (sub === "add") {
    return safe(async () => {
      const p = await addProject(ix.env, gid, uid, { url: String(o.url ?? ""), title: o.title, desc: o.description, demo: o.demo, featured: !!o.featured });
      const extra = [p.featured ? t(L, "pf.added_featured") : "", p.lang ? ` · ${p.lang}` : "", p.stars ? ` · ⭐ ${p.stars}` : ""].join("");
      const url = await shareProfile(ix.env, ix.guild, uid);
      return { content: t(L, "pf.added", { title: p.title, extra }), components: [row(linkBtn(t(L, "pf.open"), url, "💼"))] };
    });
  }
  if (sub === "remove") return safe(async () => ({ content: t(L, "pf.removed", { title: (await removeProject(ix.env, gid, uid, String(o.project ?? ""))).title }) }));
  if (sub === "feature") return safe(async () => ({ content: t(L, "pf.featured", { title: (await featureProject(ix.env, gid, uid, String(o.project ?? ""))).title }) }));
  if (sub === "available") {
    const v = o.for === "none" ? "" : String(o.for ?? "");
    await setOpen(ix.env, gid, uid, v);
    return say(v ? t(L, "pf.available_on", { what: t(L, `pf.open_${v}`) }) : t(L, "pf.available_none"));
  }
  if (sub === "show") {
    try { await setShown(ix.env, gid, uid, String(o.part ?? ""), !!o.visible); } catch (e) { return say(errText(L, e) ?? String(e)); }
    return say(t(L, o.visible ? "pf.shown" : "pf.hidden", { part: t(L, `pf.part_${o.part}`) }));
  }
  // link: sharing on, what's missing
  return safe(async () => linkPayload(ix));
}

async function linkPayload(ix: Ix) {
  const L = ix.L;
  const url = await shareProfile(ix.env, ix.guild, ix.userId);
  const pf = await getPortfolio(ix.env, ix.guild.id, ix.userId);
  const pl = await one<{ github_login: string | null }>(ix.env, "SELECT github_login FROM players WHERE guild_id = ? AND discord_id = ?", ix.guild.id, ix.userId).catch(() => null);
  const todo = [
    !pf.headline || !pf.bio ? t(L, "pf.todo_headline") : "", !pf.email && !pf.linkedin ? t(L, "pf.todo_contact") : "",
    !pf.projects.length ? t(L, "pf.todo_projects") : "", !pl?.github_login ? t(L, "pf.todo_github") : "", !pf.open ? t(L, "pf.todo_open") : "",
  ].filter(Boolean);
  return {
    embeds: [{ title: t(L, "pf.title"), url, description: `${t(L, "pf.link_text", { url })}\n\n${todo.length ? `**${t(L, "pf.todo")}**\n${todo.join("\n")}` : t(L, "pf.all_good")}`.slice(0, 4000), color: COLORS.blue }],
    components: [row(linkBtn(t(L, "pf.open"), url, "💼"), btn(t(L, "pf.btn_about"), "pf:about", 2, "✍️"), btn(t(L, "pf.btn_contact"), "pf:contact", 2, "📇"), btn(t(L, "share.stop"), "share:off", 4, "🙈"))],
  };
}

async function aboutForm(ix: Ix) {
  const L = ix.L, pf = await getPortfolio(ix.env, ix.guild.id, ix.userId);
  return json(modal("mpfa:0", t(L, "pf.about_title"), [
    { id: "headline", label: t(L, "pf.f_headline"), required: false, max: 90, value: pf.headline },
    { id: "bio", label: t(L, "pf.f_bio"), long: true, required: false, max: 800, value: pf.bio },
    { id: "city", label: t(L, "pf.f_city"), required: false, max: 60, value: pf.city },
  ]));
}
async function contactForm(ix: Ix) {
  const L = ix.L, pf = await getPortfolio(ix.env, ix.guild.id, ix.userId);
  return json(modal("mpfc:0", t(L, "pf.contact_title"), [
    { id: "email", label: t(L, "pf.f_email"), required: false, max: 120, value: pf.email },
    { id: "linkedin", label: t(L, "pf.f_linkedin"), required: false, max: 300, value: pf.linkedin },
    { id: "website", label: t(L, "pf.f_website"), required: false, max: 300, value: pf.website },
    { id: "cv", label: t(L, "pf.f_cv"), required: false, max: 300, value: pf.cv },
  ]));
}

/** The « about me » and « contact » buttons open their form. */
export function portfolioButton(ix: Ix, action: string) {
  return action === "contact" ? contactForm(ix) : aboutForm(ix);
}

/** The forms' answers. */
export async function portfolioSubmit(ix: Ix, kind: string, comps: any[]): Promise<Response> {
  const L = ix.L;
  const v: Record<string, string> = {};
  for (const r of comps) for (const c of r.components ?? []) v[c.custom_id] = String(c.value ?? "");
  try {
    await saveAbout(ix.env, ix.guild.id, ix.userId, kind === "mpfc" ? { email: v.email, linkedin: v.linkedin, website: v.website, cv: v.cv } : { headline: v.headline, bio: v.bio, city: v.city });
  } catch (e) { return say(errText(L, e) ?? String(e)); }
  return say(t(L, "pf.saved"));
}

/** Autocomplete: their GitHub repos (add), their projects (remove, feature). */
export async function portfolioChoices(ix: Ix, focused: string, cur: string) {
  if (focused === "url") {
    const list = await myRepos(ix.env, ix.guild.id, ix.userId).catch(() => []);
    const pf = await getPortfolio(ix.env, ix.guild.id, ix.userId);
    const have = new Set(pf.projects.map((p) => (p.repo || "").toLowerCase()));
    const out = list.filter((r) => !have.has(r.full.toLowerCase()) && (r.full.toLowerCase().includes(cur) || r.desc.toLowerCase().includes(cur)))
      .slice(0, 25).map((r) => ({ name: `${r.full}${r.lang ? ` · ${r.lang}` : ""}${r.desc ? ` · ${r.desc}` : ""}`.slice(0, 100), value: `https://github.com/${r.full}` }));
    // what they're typing stays a choice (a link that isn't one of their repos)
    if (cur && /[./]/.test(cur) && !out.length) out.push({ name: cur.slice(0, 100), value: cur.slice(0, 100) });
    return out;
  }
  const pf = await getPortfolio(ix.env, ix.guild.id, ix.userId);
  return pf.projects.filter((p) => p.title.toLowerCase().includes(cur)).slice(0, 25).map((p) => ({ name: `${p.featured ? "⭐ " : ""}${p.title}`.slice(0, 100), value: p.id }));
}
