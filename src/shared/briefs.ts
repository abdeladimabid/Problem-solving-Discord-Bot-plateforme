// Project briefs, in the Simplonline structure the teacher uses:
//   title · short description · technologies · Contexte du projet (context + user stories by role + bonus)
//   Modalités pédagogiques · Modalités d'évaluation · Livrables · Critères de performance
//   Situation professionnelle · Compétences visées (code + level)
// plus product-owner notes that students never see (learning goals, coverage of the week's concepts,
// questions for the client, risks, assumptions).
//
// The AI can brainstorm ideas for a week of the planning, write a whole brief from an idea, and
// rewrite one section on request. It never invents facts about a real client: those go to the
// assumptions and questions to ask.
import type { Env, GuildRow } from "./types.ts";
import { all, aiBudgetOk, aiBudgetUse, now, one, run } from "./db.ts";
import { chat, extractJson } from "./ai.ts";
import type { Program, ProgramWeek } from "./program.ts";
import { compLabel, compName, parseComp, techOfWeek, techOutside } from "./program.ts";

export interface StoryGroup { title: string; emoji: string; stories: string[] }
export interface BriefData {
  title: string; summary: string; tags: string[];
  context: string; groups: StoryGroup[]; bonus: string[];
  modalities: { days: number; mode: string; start: string; due: string; text: string; time?: string };
  evaluation: { minutes: number; parts: { minutes: number; label: string }[] };
  deliverables: string[]; criteria: string[];
  situation: { title: string; need: string };
  competencies: string[]; resources: string[];
}
export interface BriefInternal {
  learning: string[]; coverage: { concept: string; where: string }[];
  questions: string[]; risks: string[]; assumptions: string[]; client: string; notes: string;
}
export interface BriefRow {
  id: number; guild_id: string; program: string | null; week: number | null; title: string; status: string; source: string | null;
  data: string; internal: string | null; competencies: string | null; start_at: number | null; due_at: number | null; created_at: number; updated_at: number | null;
  sprint?: number | null; announced_at?: number | null;
}
export const SECTIONS = ["title", "summary", "tags", "context", "groups", "bonus", "modalities", "evaluation", "deliverables", "criteria", "situation", "competencies", "resources"] as const;
export type Section = typeof SECTIONS[number];

export class BriefError extends Error {}

// ------------------------------------------------------------------ cleaning
const s = (v: unknown, max: number) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v : String(v ?? "").split(/\n+/)).map((x) => s(String(x).replace(/^\s*[-•*|_]+\s*/, ""), max)).filter(Boolean).slice(0, n);
const int = (v: unknown, def: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && v !== "" && v != null ? Math.min(max, Math.max(min, n)) : def; };

export function cleanComps(v: unknown): string[] {
  const out: string[] = [];
  for (const x of Array.isArray(v) ? v : String(v ?? "").split(/[,;\s]+/)) {
    const c = parseComp(String(x));
    if (c) { const k = c.code + (c.level ? "N" + c.level : ""); if (!out.includes(k)) out.push(k); }
  }
  return out.slice(0, 20);
}

export function cleanBrief(b: any): BriefData {
  const groups: StoryGroup[] = (Array.isArray(b?.groups) ? b.groups : []).slice(0, 6).map((g: any) => ({
    title: s(g?.title, 80) || "En tant que développeur", emoji: s(g?.emoji, 8), stories: list(g?.stories, 120, 600),
  })).filter((g: StoryGroup) => g.stories.length);
  const parts = (Array.isArray(b?.evaluation?.parts) ? b.evaluation.parts : []).slice(0, 8)
    .map((p: any) => ({ minutes: int(p?.minutes, 5, 1, 120), label: s(p?.label, 120) })).filter((p: { label: string }) => p.label);
  return {
    title: s(b?.title, 160) || "Nouveau brief",
    summary: s(b?.summary, 600),
    tags: list(b?.tags, 12, 40),
    context: s(b?.context, 12000),
    groups,
    bonus: list(b?.bonus, 10, 600),
    modalities: {
      days: int(b?.modalities?.days, 5, 1, 30), mode: s(b?.modalities?.mode, 40) || "individuel",
      start: s(b?.modalities?.start, 10), due: s(b?.modalities?.due, 10), text: s(b?.modalities?.text, 1500),
      ...(/^\d\d:\d\d$/.test(String(b?.modalities?.time ?? "")) ? { time: String(b.modalities.time) } : {}),
    },
    evaluation: { minutes: int(b?.evaluation?.minutes, parts.reduce((a: number, p: { minutes: number }) => a + p.minutes, 0) || 15, 5, 180), parts },
    deliverables: list(b?.deliverables, 15, 300),
    criteria: list(b?.criteria, 20, 400),
    situation: { title: s(b?.situation?.title, 200), need: s(b?.situation?.need, 1200) },
    competencies: cleanComps(b?.competencies),
    resources: list(b?.resources, 10, 300),
  };
}
export function cleanInternal(i: any): BriefInternal {
  return {
    learning: list(i?.learning, 12, 300),
    coverage: (Array.isArray(i?.coverage) ? i.coverage : []).slice(0, 25).map((c: any) => ({ concept: s(c?.concept, 200), where: s(c?.where, 300) })).filter((c: { concept: string }) => c.concept),
    questions: list(i?.questions, 15, 300), risks: list(i?.risks, 12, 300), assumptions: list(i?.assumptions, 12, 300),
    client: s(i?.client, 2000), notes: s(i?.notes, 3000),
  };
}

// --------------------------------------------------------- Simplonline text
const fmtDay = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
/** The text of each Simplonline field, ready to paste. */
export function simplonFields(b: BriefData, p?: Program): Record<string, string> {
  const ctx = [
    b.context,
    ...b.groups.map((g) => `${g.emoji ? g.emoji + " " : ""}${g.title}\n${g.stories.map((x) => "- " + x).join("\n")}`),
    b.bonus.length ? `BONUS\n${b.bonus.map((x) => "- " + x).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  const m = b.modalities;
  const modal = m.text || [
    `Vous disposez de ${m.days} jours ${/indiv/i.test(m.mode) ? "en autonomie" : `en ${m.mode}`} pour réaliser le brief en utilisant les technologies appropriées.`,
    m.start ? `Date de lancement du brief : ${fmtDay(m.start)} à 09h00` : "",
    m.due ? `Date limite de soumission : ${fmtDay(m.due)} à 23h59` : "",
    "Aidez-vous les uns les autres.",
  ].filter(Boolean).join("\n");
  const evalTxt = b.evaluation.parts.length
    ? `Présentation de ${b.evaluation.minutes} minutes :\n${b.evaluation.parts.map((x) => `${x.minutes} minutes : ${x.label}`).join("\n")}` : "";
  return {
    title: b.title,
    summary: b.summary,
    tags: b.tags.join(", "),
    context: ctx,
    modalities: modal,
    evaluation: evalTxt,
    deliverables: b.deliverables.map((x) => "|__ " + x).join("\n"),
    criteria: b.criteria.join("\n"),
    situation: [b.situation.title, b.situation.need].filter(Boolean).join("\n\n"),
    competencies: b.competencies.map((c) => { const pc = parseComp(c)!; return `${compLabel(pc.code)}. ${p ? compName(p, pc.code) : ""}${pc.level ? ` — niveau ${pc.level}${p?.levels[pc.level - 1] ? ", " + p.levels[pc.level - 1] : ""}` : ""}`; }).join("\n"),
    resources: b.resources.join("\n"),
  };
}
export function simplonText(b: BriefData, p?: Program): string {
  const f = simplonFields(b, p);
  return [
    `${f.title}\n${f.summary}`, f.tags ? `Technologies : ${f.tags}` : "",
    `Contexte du projet\n${f.context}`, `Modalités pédagogiques\n${f.modalities}`,
    f.evaluation ? `Modalités d'évaluation\n${f.evaluation}` : "", f.deliverables ? `Livrables\n${f.deliverables}` : "",
    f.criteria ? `Critères de performance\n${f.criteria}` : "", f.situation ? `Situation professionnelle\n${f.situation}` : "",
    f.competencies ? `Compétences visées\n${f.competencies}` : "", f.resources ? `Ressources\n${f.resources}` : "",
  ].filter(Boolean).join("\n\n");
}

// --------------------------------------------------------- import from text
const HEADS: [RegExp, string][] = [
  [/^contexte du projet\s*:?$/i, "context"], [/^modalit[ée]s p[ée]dagogiques\s*:?$/i, "modalities"], [/^modalit[ée]s d['’][ée]valuation\s*:?$/i, "evaluation"],
  [/^livrables?\s*:?$/i, "deliverables"], [/^crit[èe]res de performance\s*:?$/i, "criteria"], [/^situation professionnelle\s*:?$/i, "situation"],
  [/^besoin vis[ée] ou probl[èe]me rencontr[ée]\s*:?$/i, "need"], [/^(\d+\s+)?comp[ée]tences vis[ée]es.*$/i, "comps"], [/^ressources\s*:?$/i, "resources"], [/^r[ée]f[ée]rentiels\s*:?$/i, "ref"],
];
/**
 * Turn the text of a Simplonline brief page (copied, or read from a saved .html) into a brief.
 * `comps` are competencies already found by the caller (e.g. the levels marked on the page).
 */
/** "14/11/2025" → "2025-11-14" */
const frDay = (d?: string) => (d ? d.split("/").reverse().join("-") : "");
export function briefFromText(text: string, title = "", comps: string[] = []): BriefData {
  const lines = text.normalize("NFC").replace(/\r/g, "").split("\n").map((l) => l.replace(/ /g, " ").trim()).filter(Boolean);
  const buckets: Record<string, string[]> = { head: [] };
  let cur = "head";
  for (const l of lines) {
    const h = HEADS.find(([rx]) => rx.test(l));
    if (h) { cur = h[1]; buckets[cur] = buckets[cur] ?? []; continue; }
    (buckets[cur] = buckets[cur] ?? []).push(l);
  }
  // context: free text until the first story; stories grouped by the lines that start a role ("🎨 En tant que concepteur")
  const groups: StoryGroup[] = [];
  const ctx: string[] = [], bonus: string[] = [];
  let inBonus = false;
  for (const l of buckets.context ?? []) {
    const clean = l.replace(/^[-•*]\s*/, "");
    if (/^(💡\s*)?bonus\b/i.test(clean) && clean.length < 30) { inBonus = true; continue; }
    const head = clean.match(/^(\p{Extended_Pictographic}️?)?\s*(En tant que [^,]{2,40})\s*:?$/u);
    if (head && !inBonus) { groups.push({ emoji: head[1] ?? "", title: head[2], stories: [] }); continue; }
    if (inBonus) { bonus.push(clean); continue; }
    if (/^en tant qu/i.test(clean)) {
      if (!groups.length) groups.push({ emoji: "", title: "User stories", stories: [] });
      groups[groups.length - 1].stories.push(clean);
    } else if (groups.length && groups[groups.length - 1].stories.length) groups[groups.length - 1].stories.push(clean);
    else ctx.push(l);
  }
  const ev = buckets.evaluation ?? [];
  const parts = ev.map((l) => l.match(/^(\d+)\s*min(?:utes?)?\s*:?\s*(.+)$/i)).filter(Boolean).map((m) => ({ minutes: Number(m![1]), label: m![2].trim() }));
  const total = Number((ev.join(" ").match(/pr[ée]sentation de (\d+)\s*min/i) ?? [])[1]) || parts.reduce((a, p) => a + p.minutes, 0);
  const mod = (buckets.modalities ?? []).join("\n");
  const days = Number((mod.match(/(\d+)\s*jours?/i) ?? [])[1]) || 5;
  // the page's own menu and header (before the title) are not part of the brief
  const rawHead = buckets.head ?? [];
  const at = title ? rawHead.lastIndexOf(title) : -1;
  const head = (at >= 0 ? rawHead.slice(at) : rawHead).filter((l) => !/^(accueil|contenu p[ée]dago|promotion|suivi)$/i.test(l));
  const t = title || head.find((l) => l.length > 6 && !/^(brief|options|assign[ée]|fr|en|aa)$/i.test(l)) || "Brief importé";
  const summary = head.slice(head.indexOf(t) + 1).find((l) => l.length > 40 && !/créé\s*:/.test(l)) ?? (head.find((l) => /créé\s*:/.test(l))?.replace(/^.*créé\s*:\s*\d{2}\/\d{2}\/\d{2,4}/, "") ?? "");
  const tags = head.filter((l) => l !== t && l.length <= 24 && /^[-•]?\s*[A-Za-z][\w .#+/-]*$/.test(l) && !/^(brief|options|assign|fr|en|aa)$/i.test(l.replace(/^[-•]\s*/, ""))).map((l) => l.replace(/^[-•]\s*/, "")).slice(0, 12);
  return cleanBrief({
    title: t, summary, tags, context: ctx.join("\n"), groups, bonus,
    modalities: { days, start: frDay(mod.match(/lancement[^\n]*?(\d{2}\/\d{2}\/\d{4})/i)?.[1]), due: frDay(mod.match(/(?:limite|soumission|rendu)[^\n]*?(\d{2}\/\d{2}\/\d{4})/i)?.[1]), mode: /groupe|collectif|bin[ôo]me|trin[ôo]me/i.test(mod) ? (mod.match(/bin[ôo]me|trin[ôo]me|groupe|collectif/i)![0].toLowerCase()) : "individuel",
      // with the dates read, the text is written again from the fields (so new dates show); else keep it as it was
      text: /\d{2}\/\d{2}\/\d{4}/.test(mod) ? "" : mod },
    evaluation: { minutes: total, parts },
    // "|__ item" lines when the page uses them (other lines are headings like "5ème jour")
    deliverables: ((buckets.deliverables ?? []).some((l) => /^\|_/.test(l)) ? (buckets.deliverables ?? []).filter((l) => /^\|_/.test(l)) : buckets.deliverables ?? []).map((l) => l.replace(/^[|_\s-]+/, "")),
    criteria: buckets.criteria ?? [],
    situation: { title: (buckets.situation ?? [])[0] ?? "", need: (buckets.need ?? []).join("\n") },
    competencies: comps,
    resources: (buckets.resources ?? []).filter((l) => !/^template$/i.test(l)),
  });
}

// ----------------------------------------------------------------- the AI
const STYLE = `Tu rédiges des briefs de projet pour une formation intensive de développeurs web (YouCode, Maroc, référentiel Simplon « Développeur web et web mobile »).
Un brief est un projet de quelques jours qui fait pratiquer les technologies de la semaine sur un cas réaliste, avec un client (fictif sauf indication contraire).
Règles de rédaction :
- En français, ton professionnel et motivant, tutoiement ou vouvoiement cohérent (vouvoiement dans le contexte, « je » dans les user stories).
- LE CONTEXTE EST UN VRAI CAHIER DES CHARGES, détaillé : un apprenant doit pouvoir réaliser tout le projet en le lisant, sans poser de question. Il contient, avec ces titres (une ligne vide entre les parties) :
  « 🏢 Le client » (qui il est, son activité, son public, ce qu'il veut),
  « 🎯 Objectif du projet »,
  « 🗂️ Pages et contenu » : CHAQUE page nommée (ex. « Accueil (index.html) »), et pour chacune ses sections dans l'ordre, avec leur contenu précis (textes à mettre, nombre de cartes, champs du formulaire avec leur type et leurs règles, images, liens du menu…),
  « ⚙️ Fonctionnalités » : chaque comportement attendu, décrit précisément (ce qui se passe au clic, au survol, sur mobile, les messages d'erreur, les états vide/chargement…), seulement ce que permettent les technologies du brief,
  « 🎨 Charte graphique » : couleurs en hexadécimal (principale, secondaire, fond, texte), polices (Google Fonts), style (arrondis, ombres), logo,
  « 📱 Responsive et accessibilité » : points de rupture en px et ce qui change à chacun, exigences d'accessibilité,
  « 🧰 Contraintes techniques » : technologies imposées, organisation des fichiers, conventions (nommage, commits, branches).
  Utilise des listes « - » ; sois concret (noms, nombres, valeurs), jamais vague (« une belle page », « des fonctionnalités modernes »).
- Les user stories découpent ce cahier des charges : une story par élément concret à réaliser (une section d'une page, un champ, un comportement, une maquette), en nommant la page et l'élément (ex. « En tant que visiteur, je vais voir sur la page Accueil un hero avec le titre du hammam, une photo et un bouton « Réserver » qui mène à Contact, afin de… »). Pas de story générique sur une technique (« implémenter la mise en page avec Flexbox ») : la technique se voit dans les critères. Au moins 8 stories, réparties par rôle (concepteur pour la maquette, visiteur ou utilisateur pour chaque page et fonctionnalité, développeur pour le dépôt et le déploiement).
- Chaque user story suit exactement : « En tant que <rôle>, je vais <action précise et vérifiable>, afin de <bénéfice>. » Une seule action par story. Elle doit pouvoir être vérifiée dans le code, une maquette ou un document.
- Les stories sont groupées par rôle (ex. « 🎨 En tant que concepteur », « 💻 En tant que développeur », « 🗄️ En tant que concepteur de base de données »).
- Le périmètre tient dans le nombre de jours et le niveau (niveau 1 = imiter : consignes guidées ; niveau 2 = adapter ; niveau 3 = transposer : plus d'autonomie). Pas de fonctionnalité hors des technologies et concepts de la semaine. Pas d'authentification, de paiement, de back-end ou d'API sauf si la semaine les couvre.
- Les bonus (3 à 5) vont plus loin, sans être indispensables.
- Les critères de performance sont concrets et testables (ex. points de rupture en px, validation W3C, accessibilité WCAG, Lighthouse, conventions de commit, séparation des couches…), adaptés aux technologies.
- Les livrables reprennent ceux du planning (dépôt GitHub avec README, lien de planification, déploiement…).
- Modalités d'évaluation : 3 jours ou moins → 15 min (5 démonstration, 5 explication du code, 5 questions/réponses) ; 4-5 jours → 20 min (5 démonstration, 10 explication du code, 5 Q/R) ; plus de 5 jours ou en groupe → 30 à 40 min avec une mise en situation.
- Ne jamais inventer de faits sur un vrai client : si des informations manquent, fais des hypothèses explicites dans "assumptions" et des questions dans "questions".`;

const SHAPE = `{
 "title": "titre accrocheur et descriptif",
 "summary": "1 à 2 phrases (affichées sous le titre)",
 "tags": ["HTML5", "CSS3", "Git", "…"],
 "context": "le cahier des charges complet avec les parties 🏢 Le client, 🎯 Objectif du projet, 🗂️ Pages et contenu (chaque page et ses sections), ⚙️ Fonctionnalités, 🎨 Charte graphique, 📱 Responsive et accessibilité, 🧰 Contraintes techniques (texte avec des sauts de ligne et des listes « - »)",
 "groups": [{"emoji": "🎨", "title": "En tant que concepteur", "stories": ["En tant que concepteur, je vais …, afin de …."]}, {"emoji": "👤", "title": "En tant que visiteur", "stories": ["En tant que visiteur, je vais voir sur la page … la section … avec …, afin de …."]}, {"emoji": "💻", "title": "En tant que développeur", "stories": ["…"]}],
 "bonus": ["En tant que développeur, je vais …, afin de …."],
 "modalities": {"days": 5, "mode": "individuel", "text": "Vous disposez de … jours en autonomie … Date limite de soumission : …"},
 "evaluation": {"minutes": 20, "parts": [{"minutes": 5, "label": "Démonstration du livrable"}, {"minutes": 10, "label": "Explication du code"}, {"minutes": 5, "label": "Évaluation des savoirs (Q/R)"}]},
 "deliverables": ["Un lien vers un repository GitHub contenant le code source et un README", "…"],
 "criteria": ["…"],
 "situation": {"title": "situation professionnelle (une ligne)", "need": "besoin visé ou problème rencontré (2 à 3 phrases)"},
 "competencies": ["C1N1", "C3N1", "T1N1"],
 "resources": ["ressource utile (lien ou nom)"],
 "internal": {
   "learning": ["objectif pédagogique observable"],
   "coverage": [{"concept": "concept de la semaine", "where": "story ou critère qui le fait pratiquer"}],
   "questions": ["question à poser au client ou à préparer"],
   "risks": ["risque (périmètre, difficulté…) et comment le limiter"],
   "assumptions": ["hypothèse faite faute d'information"],
   "notes": "conseils au formateur pour le débriefing et la mise en situation"
 }
}`;

export function weekBlock(p: Program, w: ProgramWeek | null): string {
  if (!w) return "Aucune semaine du planning choisie.";
  const sp = p.sprints.find((x) => x.n === w.sprint);
  const comps = [...w.competencies, ...w.soft].map((c) => { const pc = parseComp(c); return pc ? `${compLabel(pc.code)}${pc.level ? "N" + pc.level : ""} (${compName(p, pc.code)})` : c; });
  return [
    `Programme : ${p.name}`,
    sp ? `Sprint ${sp.n} — ${sp.title}\nObjectifs du sprint :\n${sp.objectives}\nTechnologies du sprint :\n${sp.technologies}` : "",
    `Semaine ${w.n} (${w.start} → ${w.end})${w.brief ? `, brief ${w.brief}` : ""}${w.days ? `, ${w.days} jours` : ""}, travail ${w.mode}`,
    `Intitulé prévu : ${w.title}`,
    w.objective ? `Objectif : ${w.objective}` : "",
    w.concepts ? `Concepts et exigences techniques à faire pratiquer :\n${w.concepts}` : "",
    comps.length ? `Compétences visées (code + niveau) : ${comps.join(", ")}` : "",
    w.deliverables ? `Livrables prévus : ${w.deliverables}` : "",
  ].filter(Boolean).join("\n");
}

async function ask(env: Env, system: string, user: string, maxTokens: number, temperature: number): Promise<any> {
  if (!(await aiBudgetOk(env, 4))) throw new BriefError("ClassBot's free AI is used up for this class today: add your own AI key in Settings → AI (free with Groq or Gemini), or try again tomorrow.");
  await aiBudgetUse(env, 4);
  let last: unknown = null;
  for (let i = 0; i < 2; i++) {
    try {
      const j = extractJson(await chat(env, [{ role: "system", content: system }, { role: "user", content: user }], { maxTokens, temperature, timeoutMs: 120000, json: true }));
      if (j) return j;
    } catch (e) { last = e; }
  }
  throw new BriefError(last instanceof Error && /limit|timeout/i.test(last.message) ? "The AI is busy right now. Try again in a minute." : "The AI didn't answer properly. Try again.");
}

/** The technologies the teacher picked: the brief uses them and nothing else. */
function techRule(tech: string[]): string {
  if (!tech.length) return "";
  return [
    `\nTECHNOLOGIES DU BRIEF (imposées par le formateur) : ${tech.join(", ")}.`,
    "RÈGLE STRICTE : le brief n’utilise QUE ces technologies. Aucune user story, aucun bonus, aucun critère, aucun livrable ne demande autre chose.",
    "Donc, si elles ne sont pas dans la liste : pas de base de données ni de schéma de données (MCD, ER, SQL), pas de back-end ni d’authentification, pas d’API, pas de JavaScript, pas de framework.",
    "Pas de rôle « concepteur de base de données » ou « développeur back-end » si ces technologies ne sont pas dans la liste. Les outils (Figma, Git, GitHub, Trello) restent permis.",
  ].join("\n");
}
/** Everything a brief asks the students to do (to look for technologies outside the brief). */
export const briefWork = (b: BriefData) => [b.context, ...b.groups.flatMap((g) => [g.title, ...g.stories]), ...b.bonus, ...b.criteria, ...b.deliverables, b.situation.need].join("\n");
/** Remove what still asks for a technology outside the brief (a role, a story, a bonus, a criterion…). */
function stripOutside(b: BriefData, tech: string[]): { data: BriefData; removed: string[] } {
  const removed: string[] = [];
  const keep = (x: string) => { const out = techOutside(x, tech); if (out.length) removed.push(x); return !out.length; };
  const groups = b.groups.filter((g) => keep(g.title)).map((g) => ({ ...g, stories: g.stories.filter(keep) })).filter((g) => g.stories.length);
  return { data: { ...b, groups, bonus: b.bonus.filter(keep), criteria: b.criteria.filter(keep), deliverables: b.deliverables.filter(keep) }, removed };
}

/** Five project ideas for a week of the planning (optionally around a theme or a real client). */
export async function brainstorm(env: Env, p: Program, w: ProgramWeek | null, o: { theme?: string; avoid?: string[]; tech?: string[] } = {}) {
  const tech = o.tech?.length ? o.tech : techOfWeek(w);
  const j = await ask(env, `${STYLE}\n\nTu proposes des idées de projets. Réponds UNIQUEMENT avec ce JSON : {"ideas": [{"title": "…", "client": "nom et type d'entreprise ou d'organisation (fictive, contexte marocain bienvenu)", "pitch": "le projet en 2 phrases", "why": "pourquoi il fait pratiquer les concepts de la semaine", "difficulty": "facile|moyen|ambitieux"}]}. 5 idées variées (secteurs différents : santé, sport, tourisme, commerce, éducation, associatif, culture…), réalistes pour le nombre de jours.`,
    `${weekBlock(p, w)}${techRule(tech)}${o.theme ? `\n\nThème ou piste souhaités par le formateur : ${o.theme}` : ""}${o.avoid?.length ? `\n\nÉvite ces idées déjà utilisées : ${o.avoid.join(" ; ")}` : ""}`, 2500, 0.95);
  const ideas = (Array.isArray(j?.ideas) ? j.ideas : []).slice(0, 6).map((x: any) => ({
    title: s(x?.title, 160), client: s(x?.client, 200), pitch: s(x?.pitch, 500), why: s(x?.why, 400), difficulty: s(x?.difficulty, 20),
  })).filter((x: { title: string }) => x.title);
  if (!ideas.length) throw new BriefError("The AI didn't answer properly. Try again.");
  return ideas;
}

export interface GenerateInput {
  idea?: string;            // the teacher's idea, or the idea picked from the brainstorm
  client?: string;          // notes about a REAL client (discovery meeting): never invent beyond them
  days?: number; mode?: string; start?: string; due?: string;
  wishes?: string;          // anything else ("add a mise en situation", "Tailwind mandatory"…)
  tech?: string[];          // the technologies of the brief (default: those of the week); nothing else is asked
  /** a brief to look like (last year's, a colleague's): close = same project for another client, twist = same skills on another subject, loose = only the level and format */
  model?: { text: string; title?: string; comps?: string[]; how?: "close" | "twist" | "loose" };
}

const SIMILAR: Record<string, string> = {
  close: `MÊME TYPE DE PROJET, AUTRE CLIENT : garde le même genre d'application, le même périmètre (autant de pages, des fonctionnalités équivalentes, la même difficulté), la même structure de brief, des livrables, modalités d'évaluation et critères de même nature. Change le client, le secteur, les noms, les contenus, les données, les détails des fonctionnalités (leur équivalent pour ce nouveau client).`,
  twist: `MÊMES APPRENTISSAGES, AUTRE SUJET : garde la difficulté, le périmètre, la structure du brief et ce que les apprenants doivent pratiquer (les mêmes concepts techniques et compétences), mais sur un projet d'une autre nature et d'un autre domaine.`,
  loose: `INSPIRATION : reprends seulement le niveau, l'ampleur et la forme du brief de référence ; le sujet, le client et les fonctionnalités sont nouveaux.`,
};
function modelBlock(m: NonNullable<GenerateInput["model"]>): string {
  return [`\nBRIEF DE RÉFÉRENCE (celui de l'an dernier ou d'un collègue) :\n<<<\n${m.text.slice(0, 9000)}\n>>>`,
    `\nÉcris un NOUVEAU brief SEMBLABLE À CELUI-CI MAIS PAS IDENTIQUE. ${SIMILAR[m.how || "close"]}`,
    `Ne recopie aucune phrase du brief de référence, pas le même titre${m.title ? ` (« ${m.title} »)` : ""}, pas le même client ni les mêmes noms. Le nouveau brief doit être au moins aussi détaillé (cahier des charges complet, user stories concrètes) même si la référence l'est moins.`].join("\n");
}
/** A complete brief (and its product-owner notes) for a week of the planning. */
export async function generateBrief(env: Env, p: Program, w: ProgramWeek | null, o: GenerateInput): Promise<{ data: BriefData; internal: BriefInternal }> {
  const days = o.days ?? w?.days ?? 5, mode = o.mode || w?.mode || "individuel";
  const tech = (o.tech?.length ? o.tech : techOfWeek(w)).map((x) => s(x, 40)).filter(Boolean);
  const user = [
    weekBlock(p, w),
    `\nDurée : ${days} jours, travail ${mode}.${o.start ? ` Lancement : ${o.start}.` : ""}${o.due ? ` Date limite : ${o.due} à 23h59.` : ""}`,
    o.model ? modelBlock(o.model) : "",
    o.idea ? `\nIdée du projet : ${o.idea}` : o.model ? "\nLe nouveau sujet et le nouveau client sont à toi de choisir (crédibles, originaux)." : "\nPas d'idée imposée : choisis un client fictif crédible et original.",
    o.client ? `\nINFORMATIONS RÉELLES DU CLIENT (n'invente rien au-delà, mets le reste en hypothèses et questions) :\n${o.client}` : "",
    o.wishes ? `\nSouhaits du formateur : ${o.wishes}` : "",
    techRule(tech),
    `\nCompétences à mettre dans "competencies" : ${[...(w?.competencies ?? []), ...(w?.soft ?? [])].join(", ") || o.model?.comps?.join(", ") || "celles qui conviennent"} (codes C1…C8 et T1…T9, avec le niveau N1/N2/N3).`,
    `\nRéponds UNIQUEMENT avec ce JSON :\n${SHAPE}`,
  ].join("\n");
  let j = await ask(env, STYLE, user, 12000, 0.7);
  let data = cleanBrief(j);
  // the AI asked for something outside the technologies: once more, saying what to remove
  const outside = tech.length ? techOutside(briefWork(data), tech) : [];
  if (outside.length && data.groups.length) {
    const j2 = await ask(env, STYLE, `${user}\n\nATTENTION : ta proposition précédente demandait ${outside.join(", ")}, qui ne sont PAS dans les technologies du brief (${tech.join(", ")}). Réécris tout le brief sans aucune tâche qui en a besoin.`, 12000, 0.5).catch(() => null);
    const d2 = j2 ? cleanBrief(j2) : null;
    if (d2?.groups.length && techOutside(briefWork(d2), tech).length < outside.length) { j = j2; data = d2; }
  }
  // still there: take those lines out, and tell the teacher in the PO notes
  let removed: string[] = [];
  if (tech.length) ({ data, removed } = stripOutside(data, tech));
  if (!data.groups.length) throw new BriefError("The AI didn't write any user story. Try again.");
  data.modalities = { ...data.modalities, days, mode, start: o.start ?? "", due: o.due ?? "" };
  if (tech.length) data.tags = tech.slice(0, 15);
  if (!data.competencies.length && w) data.competencies = [...w.competencies, ...w.soft];
  if (!data.competencies.length && o.model?.comps?.length) data.competencies = o.model.comps;
  // the AI kept the reference's title: say it's a new brief
  if (o.model?.title && data.title.trim().toLowerCase() === o.model.title.trim().toLowerCase()) data.title = `${data.title} (variante)`;
  const internal = cleanInternal({ ...(j.internal ?? {}), client: o.client ?? "" });
  if (removed.length) internal.notes = [internal.notes, `Retiré car hors des technologies du brief (${tech.join(", ")}) :\n${removed.map((x) => "- " + x).join("\n")}`].filter(Boolean).join("\n\n").slice(0, 3000);
  return { data, internal };
}

const SECTION_HELP: Record<string, string> = {
  title: '{"title": "…"}', summary: '{"summary": "…"}', tags: '{"tags": ["…"]}', context: '{"context": "le cahier des charges complet : 🏢 Le client, 🎯 Objectif du projet, 🗂️ Pages et contenu (chaque page et ses sections), ⚙️ Fonctionnalités, 🎨 Charte graphique, 📱 Responsive et accessibilité, 🧰 Contraintes techniques"}',
  groups: '{"groups": [{"emoji": "…", "title": "En tant que …", "stories": ["En tant que …, je vais …, afin de …."]}]}',
  bonus: '{"bonus": ["…"]}', modalities: '{"modalities": {"days": 5, "mode": "…", "text": "…"}}',
  evaluation: '{"evaluation": {"minutes": 20, "parts": [{"minutes": 5, "label": "…"}]}}', deliverables: '{"deliverables": ["…"]}',
  criteria: '{"criteria": ["…"]}', situation: '{"situation": {"title": "…", "need": "…"}}', competencies: '{"competencies": ["C1N1"]}', resources: '{"resources": ["…"]}',
};
/** Rewrite one section of a brief following the teacher's instruction (the rest stays as it is). */
export async function rewriteSection(env: Env, p: Program, w: ProgramWeek | null, b: BriefData, section: Section, instruction: string): Promise<BriefData> {
  if (!SECTIONS.includes(section)) throw new BriefError("unknown section");
  const tech = section === "tags" ? [] : b.tags;
  const j = await ask(env, STYLE, [
    weekBlock(p, w), `\nLe brief actuel (JSON) :\n${JSON.stringify(b)}`, techRule(tech),
    `\nRéécris UNIQUEMENT la partie "${section}"${instruction ? ` en suivant cette consigne du formateur : ${instruction}` : " pour l'améliorer (plus précise, mieux adaptée au niveau et aux concepts de la semaine)"}.`,
    `Garde la cohérence avec le reste du brief. Réponds UNIQUEMENT avec ce JSON : ${SECTION_HELP[section]}`,
  ].join("\n"), 3500, 0.7);
  if (j?.[section] == null) throw new BriefError("The AI didn't answer properly. Try again.");
  let next = cleanBrief({ ...b, [section]: j[section] });
  // a rewritten list never brings a technology outside the brief
  if (tech.length && ["groups", "bonus", "criteria", "deliverables"].includes(section)) next = stripOutside(next, tech).data;
  if (section === "groups" && !next.groups.length) throw new BriefError("The AI didn't write any user story. Try again.");
  return next;
}

/** Problems a teacher should fix before publishing (no AI: quick checks). */
export function briefChecks(b: BriefData, w: ProgramWeek | null): { ok: boolean; text: string }[] {
  const stories = b.groups.flatMap((g) => g.stories);
  const bad = stories.filter((x) => !/^en tant qu/i.test(x) || !/afin (de|d['’]|que)/i.test(x));
  const want = w ? [...w.competencies, ...w.soft].map((c) => parseComp(c)?.code).filter(Boolean) as string[] : [];
  const have = b.competencies.map((c) => parseComp(c)?.code);
  const miss = want.filter((c) => !have.includes(c));
  const outside = b.tags.length ? techOutside(briefWork(b), b.tags) : [];
  return [
    ...(b.tags.length ? [{ ok: !outside.length, text: outside.length ? `Asks for technologies not in the brief: ${outside.join(", ")}` : `Only uses its technologies (${b.tags.join(", ")})` }] : []),
    { ok: stories.length >= 4, text: `${stories.length} user stories${stories.length < 4 ? " (4 or more is better)" : ""}` },
    { ok: !bad.length, text: bad.length ? `${bad.length} stor${bad.length > 1 ? "ies don't" : "y doesn't"} follow « En tant que …, je vais …, afin de … »` : "Every story follows « En tant que …, je vais …, afin de … »" },
    { ok: b.criteria.length >= 3, text: `${b.criteria.length} performance criteria` },
    { ok: b.deliverables.length >= 1, text: `${b.deliverables.length} deliverable(s)` },
    { ok: !miss.length, text: miss.length ? `Competencies of the week missing: ${miss.map(compLabel).join(", ")}` : "All the competencies of the week are there" },
    { ok: !!b.modalities.due, text: b.modalities.due ? `Deadline ${fmtDay(b.modalities.due)}` : "No deadline set" },
  ];
}

// --------------------------------------------------------------- storage
export async function listBriefs(env: Env, g: Pick<GuildRow, "id">) {
  return all<Omit<BriefRow, "data" | "internal">>(env, "SELECT id, guild_id, program, week, title, status, source, competencies, start_at, due_at, created_at, updated_at, sprint, announced_at FROM briefs WHERE guild_id = ? ORDER BY COALESCE(due_at, created_at) DESC, id DESC LIMIT 200", g.id);
}
export async function getBrief(env: Env, g: Pick<GuildRow, "id">, id: number) {
  const r = await one<BriefRow>(env, "SELECT * FROM briefs WHERE id = ? AND guild_id = ?", id, g.id);
  if (!r) return null;
  let data: BriefData, internal: BriefInternal;
  try { data = cleanBrief(JSON.parse(r.data)); } catch { data = cleanBrief({}); }
  try { internal = cleanInternal(JSON.parse(r.internal || "{}")); } catch { internal = cleanInternal({}); }
  return { ...r, data, internal };
}
// the due time is 23:59 UTC unless the teacher chose one
const toTs = (iso: string, end = false, time = "") => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? Math.floor(Date.parse(iso + (end ? "T" + (/^\d\d:\d\d$/.test(time) ? time : "23:59") + ":00Z" : "T09:00:00Z")) / 1000) : null);
export async function saveBrief(env: Env, g: Pick<GuildRow, "id">, id: number | null, o: { data: unknown; internal?: unknown; program?: string | null; week?: number | null; status?: string; source?: string }): Promise<number> {
  const data = cleanBrief(o.data), internal = cleanInternal(o.internal ?? {});
  const status = ["draft", "assigned", "archived"].includes(o.status ?? "") ? o.status! : "draft";
  const comps = data.competencies.join(",");
  const start = toTs(data.modalities.start), due = toTs(data.modalities.due, true, data.modalities.time);
  if (id) {
    const r = await run(env, "UPDATE briefs SET title = ?, data = ?, internal = ?, competencies = ?, start_at = ?, due_at = ?, status = ?, week = COALESCE(?, week), program = COALESCE(?, program), updated_at = ? WHERE id = ? AND guild_id = ?",
      data.title, JSON.stringify(data), JSON.stringify(internal), comps, start, due, status, o.week ?? null, o.program ?? null, now(), id, g.id);
    if (!r.meta.changes) throw new BriefError("This brief doesn't exist anymore.");
    return id;
  }
  const r = await run(env, "INSERT INTO briefs (guild_id, program, week, title, status, source, data, internal, competencies, start_at, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    g.id, o.program ?? null, o.week ?? null, data.title, status, o.source ?? "manual", JSON.stringify(data), JSON.stringify(internal), comps, start, due, now(), now());
  return Number(r.meta.last_row_id);
}
export async function deleteBrief(env: Env, g: Pick<GuildRow, "id">, id: number) {
  await run(env, "DELETE FROM briefs WHERE id = ? AND guild_id = ?", id, g.id);
}
