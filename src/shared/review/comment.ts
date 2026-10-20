// The debrief comment, sent to the learner by Discord DM and copied into Simplonline: written the way the teacher writes
// (French, « tu », the first name then paragraphs that follow each other: verdict, what's done, what's missing, the notions
// to review, a closing that fits the level; « vous » for a squad).
// It comes ONLY from the teacher's decisions on the debrief: the requirements of the brief and the bonus (switches), the
// competencies validated, the level, the one-to-one remarks and the oral questions not answered. The automatic checks
// (pages, menu, commits, branches…) are information for the teacher: they never feed it.
//   • commentData builds every section in code, so the sources are guaranteed
//   • commentText writes it as a template (always available)
//   • the AI may only phrase the same sections (aiCommentPrompt, one call); aiCommentText checks its answer and
//     assembles it, or returns null (then the template is used)
import { REF_NAMES, debriefLevel, firstNameOf, noVerif, reviewStates, saidIn } from "./engine.ts";
import { memberLevelOf } from "./members.ts";

export interface CommentData {
  first: string;             // the first name (never goes to the AI)
  greeting: string;          // "Bonjour Aamr," (kept for older callers; the comment opens with the first name)
  project: string;
  group: boolean;            // a squad's comment (« vous » for everyone)
  team: string;              // the squad's name (its greeting)
  level: string;             // excellent | bon | moyen | faible | critique | ""
  allDone: boolean;          // every feature of the brief validated
  partDone: boolean;         // at least half of them
  themes: string[];          // what the validated requirements are about (2 to 4)
  strengths: string[];       // the validated requirements, short (for the AI)
  comps: string[];           // the competencies validated (their names)
  bonus: string[];           // the bonus items done
  improve: string[];         // the requirements not validated, as written (never the criteria)
  notions: string[];         // from the one-to-one remarks and the oral questions not answered
  remarks: string;           // the teacher's one-to-one remarks, as written (the AI rewrites them as notions)
  positive: string;          // what went well in the one-to-one, one sentence in « vous » (from ✨ on the remarks)
  oralMissed: string[];      // the notions of the oral questions not answered
}

// requirements that show what was done (strengths), and those that say what to do (never the performance criteria)
const STRONG = ["story", "technique", "livrable", "critere"];
const TODO = ["story", "technique", "livrable"];
const MAX = { themes: 4, comps: 4, bonus: 3, improve: 6, notions: 6 };

const clean = (t: unknown, max = 160) => noVerif(String(t ?? "")).replace(/\s+/g, " ").trim().replace(/[.;:,\s]+$/, "").slice(0, max);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const low = (t: string) => (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
const uniq = (a: string[]) => a.filter((x, i) => x && a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
const andList = (a: string[]) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} et ${a[a.length - 1]}` : a[0] || "");

/** "En tant que visiteur, je vais voir le menu, afin de…" → "voir le menu" (the action of a user story). */
export function storyCore(t: unknown): string {
  const s = clean(t, 400);
  const m = s.match(/\bje (?:vais|veux|dois|peux|souhaite|pourrai|voudrais)\s+(.+?)(?:,?\s+(?:afin|pour que|pour qu['’])\b.*)?$/i);
  return clean(m ? m[1] : s.replace(/^en tant qu[e']\s*[^,]+,\s*/i, ""), 140);
}
// what a requirement is about: the themes of the strengths
const THEMES: [RegExp, string][] = [
  [/\b(page|menu|nav|navigation|lien|header|footer|en-t[êe]te|pied de page|s[ée]mantique|accueil|structure|section|hero)\b/i, "la structure et la navigation du site"],
  [/flex|grid|responsive|media|mobile|tablette|[ée]cran|mise en page|disposition|css|tailwind|bootstrap|style|maquette|design/i, "la mise en page et l’adaptation aux écrans"],
  [/\balt\b|aria|accessib|contraste|seo|r[ée]f[ée]rencement|meta|w3c|lighthouse/i, "l’accessibilité et le référencement"],
  [/javascript|\bjs\b|dom|[ée]v[ée]nement|clic|formulaire|validation|regex|fetch|api|localstorage|filtr|recherch|tri\b|dynamique|interacti/i, "l’interactivité et la gestion des formulaires"],
  [/sql|base de donn|table|pdo|crud|php|laravel|eloquent|migration|serveur|back-?end|authentif/i, "les données et la partie serveur"],
  // "git" as a word: "GitHub Pages" is the deployment, not the work with Git
  [/\bgit\b|branche|pull request|commit|trello|jira|github projects|planification|scrum|kanban|[ée]quipe/i, "l’organisation du projet et le travail en équipe avec Git"],
  [/readme|documentation|d[ée]ploi|h[ée]berg|github pages|netlify|vercel|en ligne/i, "la documentation et la mise en ligne du projet"],
];
export function themesOf(items: string[]): string[] {
  const out: string[] = [];
  for (const [rx, label] of THEMES) if (items.some((t) => rx.test(t)) && !out.includes(label)) out.push(label);
  return (out.length ? out : items.length ? ["les fonctionnalités du projet"] : []).slice(0, MAX.themes);
}
/** A requirement not validated, said as something to do. */
const USER_VERBS = /^(voir|consulter|acc[ée]der|pouvoir|trouver|lire|naviguer|recevoir|visualiser|parcourir|d[ée]couvrir|savoir|avoir)\b/i;
export function actionOf(t: unknown): string {
  const core = storyCore(t);
  if (!core) return "";
  if (USER_VERBS.test(core)) return `Permettre à l’utilisateur de ${core.replace(/^pouvoir\s+/i, "")}.`;
  if (/^\S+(er|ir|re|oir)\b/i.test(core) && !/^(une?|les?|la|des?|le|mon|ma|mes|son|sa|ses|page|carte|section)\b/i.test(core)) return `${cap(core)}.`;
  // a grid line, not a sentence ("Page des soins avec les prix")
  return `Compléter le point du brief « ${cap(core)} ».`;
}
/** The teacher's one-to-one remarks → the notions to review (what they couldn't explain, confused, missed). What went
 *  well in the remarks is not a notion to review: it's left out. */
const NEGATIVE = /\b(ne|n['’])\s*\S+(?:\s+\S+)?\s+(?:pas|plus|jamais|gu[èe]re)\b|confond|difficult|lacune|[àa] revoir|revoir|fragile|h[ée]sit|oubli|erreur|du mal|incomplet|flou|approximati/i;
export function remarkNotions(text: unknown): string[] {
  const parts = String(text ?? "").split(/(?<=[.!?;])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  return parts.filter((s) => NEGATIVE.test(s)).map((s) => clean(s
    .replace(/^(il|elle|l['’]apprenante?|tu|vous)\s+/i, "")
    .replace(/^(?:ne|n['’])\s*(?:sait|sais|savez|a|as|avez|ma[iî]trise|ma[iî]trises|ma[iî]trisez|comprend|comprends|comprenez|conna[iî]t|connais|connaissez|peut|peux|pouvez|est|es|êtes)\s+(?:pas|plus)\s+(?:bien\s+|encore\s+|vraiment\s+)?(?:expliquer|faire|utiliser|compris|capable d['e]\s*|à l['’]aise avec|clair sur)?\s*/i, "")
    .replace(/^(?:a|as|avez)\s+du mal (?:à|avec)\s+/i, "")
    .replace(/^confond(?:s|ez)?\s+(.+?)\s+et\s+(.+)$/i, "la différence entre $1 et $2")
    .replace(/^(?:à revoir|revoir)\s*:?\s*/i, ""), 140)).filter((x) => x.length > 2).map(low);
}

/**
 * The sections of the comment, from the teacher's decisions only. `states`: the switches (saved or on the screen);
 * `member`: in a squad, a member's own competencies and note (their one-to-one), when the teacher set them.
 */
export function commentData(o: { first?: string; group?: string; project: string; rec: any; states?: any; member?: { co?: Record<string, boolean>; note?: string; level?: string } | null }): CommentData {
  const rec = o.rec || {};
  const st = reviewStates({ ...rec, final: o.states ?? rec.final });
  const ex: any[] = (rec.result && rec.result.exigences) || [];
  const items = ex.map((e, i) => ({ type: String(e.type || ""), texte: String(e.texte || ""), ok: !!st.ex[i] }));
  const stories = items.filter((x) => x.type === "story");
  const okStories = stories.filter((x) => x.ok).length;
  const strong = items.filter((x) => STRONG.includes(x.type) && x.ok).map((x) => storyCore(x.texte));
  const co: Record<string, boolean> = o.member?.co && Object.keys(o.member.co).length ? o.member.co : st.co;
  const comps = uniq(Object.keys(co).filter((c) => co[c]).map((c) => {
    const base = String(c).toUpperCase().replace(/N\d$/, "").replace(/^CT/, "T");
    return low(String((REF_NAMES as any)[base] || ""));
  })).slice(0, MAX.comps);
  // a squad member's own note, else the debrief's remarks; with ✨ on the remarks, the AI already sorted them
  const own = String(o.member?.note || "").trim();
  const R = (!own && rec.remarks) || {};
  const remarks = String(own || R.text || "").trim();
  const oral: any[] = rec.oral || [];
  const oralMissed = uniq(oral.filter((q, i) => !st.oral[i]).map((q) => clean(q.notion || q.q, 140)));
  const fromRemarks = Array.isArray(R.toReview) && R.positive !== undefined ? R.toReview.map((x: unknown) => low(clean(x, 140))).filter(Boolean) : remarkNotions(remarks);
  const notions = uniq([...fromRemarks, ...oralMissed.filter((n) => !saidIn(n, remarks)).map(low)]).slice(0, MAX.notions);
  // a squad member: their own level (members.ts), else the debrief's
  const lv = o.member?.level || (rec.level && (rec.level.lvl || rec.level.prop)) || debriefLevel(rec, st) || "";
  return {
    first: String(o.first || "").trim(), greeting: o.group ? `Bonjour ${o.group},` : `Bonjour${o.first ? ` ${o.first}` : ""},`,
    project: clean(o.project, 120), group: !!o.group, team: String(o.group || "").trim(), level: lv,
    allDone: stories.length > 0 && okStories === stories.length,
    partDone: stories.length > 0 && okStories / stories.length >= 0.5,
    themes: themesOf(items.filter((x) => STRONG.includes(x.type) && x.ok).map((x) => x.texte)),
    strengths: uniq(strong).slice(0, 12),
    comps,
    bonus: uniq(items.filter((x) => x.type === "bonus" && x.ok).map((x) => low(storyCore(x.texte)))).slice(0, MAX.bonus),
    improve: uniq(items.filter((x) => TODO.includes(x.type) && !x.ok).map((x) => clean(x.texte, 400))).slice(0, MAX.improve),
    notions, remarks, oralMissed,
    positive: (o.group ? /\b(tu|ton|ta|tes|toi)\b/i : /\b(vous|votre|vos)\b/i).test(String(R.positive || "")) ? "" : clean(R.positive, 300).replace(/([^.!?])$/, "$1.").replace(/^\.$/, ""),
  };
}

// ------------------------------------------------------------------ the text
// The teacher's own way of writing: the first name, then paragraphs that follow each other (an honest verdict, what was
// done, what is missing, the notions to review, a closing that fits the level). No section titles, no lists, « tu »
// (« vous » for a squad), nothing that the debrief doesn't say.
const Y = (d: CommentData, tu: string, vous: string) => (d.group ? vous : tu);
/** The level said, from the teacher's decision (or what the switches give). */
export function levelOf(d: CommentData): "excellent" | "bon" | "moyen" | "faible" | "critique" {
  const l = String(d.level || "").toLowerCase();
  if (["excellent", "bon", "moyen", "faible", "critique"].includes(l)) return l as any;
  return d.allDone ? "bon" : d.partDone ? "moyen" : "faible";
}
/** A requirement not validated, said so it fits in a sentence: a thing that is missing, or something to do. */
export function missingOf(t: unknown): { kind: "thing" | "todo"; text: string } | null {
  const core = storyCore(t);
  if (!core) return null;
  if (USER_VERBS.test(core)) return { kind: "todo", text: `permettre à l’utilisateur de ${core.replace(/^pouvoir\s+/i, "")}` };
  if (/^(un|une|des|le|la|les|l['’]|du|au|aux|ses|son|sa)\s*/i.test(core)) return { kind: "thing", text: low(core) };
  if (/^\S+(er|ir|re|oir)\b/i.test(core) && !/^(page|carte|section|barre|ombre|couleur|heure|lettre|filtre|footer|header|chiffre|titre|membre)\b/i.test(core)) return { kind: "todo", text: low(core) };
  return { kind: "thing", text: `le point « ${cap(core)} »` };
}
function opening(d: CommentData): string {
  // the themes, at most three, « a, b ainsi que c » (the labels already say « et »)
  const th = d.themes.slice(0, 3), them = th.length > 1 ? `${th.slice(0, -1).join(", ")} ainsi que ${th[th.length - 1]}` : th[0] || "";
  const lv = levelOf(d);
  const s: string[] = [];
  if (lv === "excellent") {
    s.push(Y(d, "Excellent travail.", "Excellent travail."));
    if (d.allDone) s.push(Y(d, "Tu as réalisé l’ensemble des fonctionnalités demandées", "Vous avez réalisé l’ensemble des fonctionnalités demandées") + (them ? `, avec un travail soigné sur ${them}.` : "."));
    else if (them) s.push(Y(d, `Ton travail est solide sur ${them}.`, `Votre travail est solide sur ${them}.`));
  } else if (lv === "bon") {
    s.push(Y(d, "Ton travail est globalement bien réalisé.", "Votre travail est globalement bien réalisé."));
    if (d.allDone) s.push(Y(d, "Tu as mené à bien l’ensemble des fonctionnalités demandées", "Vous avez mené à bien l’ensemble des fonctionnalités demandées") + (them ? Y(d, `, et tu montres une bonne maîtrise de ${them}.`, `, et vous montrez une bonne maîtrise de ${them}.`) : "."));
    else if (d.partDone) s.push(Y(d, "Tu as réalisé une grande partie des fonctionnalités demandées", "Vous avez réalisé une grande partie des fonctionnalités demandées") + (them ? `, notamment sur ${them}.` : "."));
    else if (them) s.push(Y(d, `Tu as bien travaillé ${them}.`, `Vous avez bien travaillé ${them}.`));
  } else if (lv === "moyen") {
    s.push(Y(d, "Ton travail est correct dans l’ensemble, mais certains points restent à consolider.", "Votre travail est correct dans l’ensemble, mais certains points restent à consolider."));
    if (d.partDone) s.push(Y(d, "Tu as réalisé une bonne partie des fonctionnalités demandées", "Vous avez réalisé une bonne partie des fonctionnalités demandées") + (them ? `, notamment sur ${them}.` : "."));
    else if (them) s.push(`Les points les plus aboutis concernent ${them}.`);
  } else if (lv === "faible") {
    s.push(Y(d, "Ton travail est encore fragile : plusieurs aspects importants restent à renforcer.", "Votre travail est encore fragile : plusieurs aspects importants restent à renforcer."));
    if (them) s.push(Y(d, `Tu as tout de même avancé sur ${them}, ce qui est un bon point de départ.`, `Vous avez tout de même avancé sur ${them}, ce qui est un bon point de départ.`));
  } else {
    s.push(Y(d, "Ton travail est encore loin de ce qui est attendu dans ce brief.", "Votre travail est encore loin de ce qui est attendu dans ce brief."));
    if (them) s.push(`Quelques éléments sont en place, notamment sur ${them}, mais l’essentiel reste à construire.`);
  }
  if (d.positive) s.push(`Lors de notre échange, ${low(d.positive)}`);
  if (d.bonus.length) s.push(Y(d, `Tu as aussi réalisé ${d.bonus.length > 1 ? "des bonus" : "un bonus"}, ce qui est une très bonne initiative.`, `Vous avez aussi réalisé ${d.bonus.length > 1 ? "des bonus" : "un bonus"}, ce qui est une très bonne initiative.`));
  return s.join(" ");
}
function missingPara(d: CommentData): string {
  const m = d.improve.map(missingOf).filter((x): x is { kind: "thing" | "todo"; text: string } => !!x);
  const things = m.filter((x) => x.kind === "thing").map((x) => x.text), todos = m.filter((x) => x.kind === "todo").map((x) => x.text);
  const s: string[] = [];
  if (things.length) s.push(`En revanche, il manque encore ${things.length > 1 ? "quelques éléments demandés" : "un élément demandé"} dans le brief : ${andList(things)}.`);
  if (todos.length) s.push(`${Y(d, "Il te reste", "Il vous reste")} ${things.length ? "aussi" : "encore"} à ${andList(todos.map((t, i) => (i ? `à ${t}` : t)))}.`);
  return s.join(" ");
}
function notionsPara(d: CommentData): string {
  if (!d.notions.length) return "";
  const one = d.notions.length === 1;
  return `${d.positive ? "Pendant l’échange, " : "Lors de notre échange, "}${one ? "une notion n’était pas encore claire" : "certaines notions n’étaient pas encore claires"} : ${andList(d.notions.map(low))}. ` +
    Y(d, `Prends le temps de ${one ? "la" : "les"} revoir et de ${one ? "la" : "les"} pratiquer sur de petits exemples.`, `Prenez le temps de ${one ? "la" : "les"} revoir et de ${one ? "la" : "les"} pratiquer sur de petits exemples.`);
}
function closingOf(d: CommentData): string {
  const lv = levelOf(d), clean = !d.improve.length && !d.notions.length, who = !d.group && d.first ? `${d.first}, ` : "";
  if (lv === "excellent") return clean ? Y(d, "Continue comme ça.", "Continuez comme ça.") : Y(d, "Dans l’ensemble, c’est un excellent travail. Consolide ces quelques points et continue sur cette lancée.", "Dans l’ensemble, c’est un excellent travail. Consolidez ces quelques points et continuez sur cette lancée.");
  if (lv === "bon") return clean ? Y(d, "C’est un bon travail, continue sur cette lancée.", "C’est un bon travail, continuez sur cette lancée.") : Y(d, "Dans l’ensemble, c’est un bon travail. Continue sur cette lancée, consolide ces quelques points, et tu atteindras rapidement un niveau encore plus solide.", "Dans l’ensemble, c’est un bon travail. Continuez sur cette lancée, consolidez ces quelques points, et vous atteindrez rapidement un niveau encore plus solide.");
  if (lv === "moyen") return Y(d, "C’est un travail correct. En reprenant ces points, tu vas rapidement gagner en solidité.", "C’est un travail correct. En reprenant ces points, vous allez rapidement gagner en solidité.");
  if (lv === "faible") return cap(`${who}${Y(d, "il faut maintenant consolider ton socle. Avec un travail régulier et ciblé sur ces points, tu vas gagner en confiance et en qualité.", "il faut maintenant consolider votre socle. Avec un travail régulier et ciblé sur ces points, vous allez gagner en confiance et en qualité.")}`);
  return cap(`${who}${Y(d, "il faut reprendre les bases avant d’aller plus loin. Prends le temps de travailler ces points régulièrement : c’est comme ça que tu vas réellement progresser.", "il faut reprendre les bases avant d’aller plus loin. Prenez le temps de travailler ces points régulièrement : c’est comme ça que vous allez réellement progresser.")}`);
}
const greetingOf = (d: CommentData) => (d.group && d.team ? `${d.team},` : d.first && !d.group ? `${d.first},` : "Bonjour,");
/** The comment as a template: always available (and the fallback when the AI can't write it). */
export function commentText(d: CommentData): string {
  return [greetingOf(d), opening(d), missingPara(d), notionsPara(d), closingOf(d)].filter(Boolean).join("\n\n");
}
/** The debrief's comment from the switches: one student, or a squad (« vous » for everyone). */
export function buildComment(firstName: string, rec: any, states?: any): string {
  return commentText(commentData({ first: firstName, group: rec && rec.squad ? rec.squad.name : "", project: String((rec && rec.brief) || ""), rec, states }));
}
/** A squad member's own comment: the squad's work, their own competencies and note (else the squad's remarks). */
export function memberComment(m: any, rec: any, ms: any): string {
  return commentText(commentData({ first: firstNameOf(m.name, m.login), project: String((rec && rec.brief) || ""), rec,
    member: { co: ms && ms.co, note: ms && ms.note, level: (() => { const l = memberLevelOf(rec, String(m.gid)); return l.lvl || l.prop; })() } }));
}
export const wordCount = (t: string) => (String(t).match(/[A-Za-zÀ-ÿ0-9’'-]+/g) || []).length;

// ------------------------------------------------------------------ the AI: writes it like the teacher, from the debrief only
export const AI_COMMENT_SYSTEM = [
  "Tu aides un formateur en développement web à rédiger le commentaire de débriefing d’un projet, envoyé à l’apprenant.",
  "Tu reçois ce que le formateur a DÉCIDÉ pendant le débriefing. Écris le commentaire comme LUI l’écrirait : un texte humain, suivi, en paragraphes qui s’enchaînent.",
  "Son style (exemple d’un de ses commentaires, à imiter pour le ton et la construction, jamais pour le contenu) :",
  "<<<",
  "Ton travail est globalement très bien réalisé. La planification est claire, cohérente et bien structurée, ce qui montre que tu sais organiser ton travail et avancer de manière méthodique.",
  "",
  "Tu montres une bonne maîtrise de ton projet, autant sur le plan fonctionnel que technique. Les seuls points à revoir concernent quelques notions spécifiques en PHP, notamment le type de $pdo ainsi que les types de retour de $stmt->execute() et $stmt->fetch(). Ce sont des détails importants à bien comprendre pour être totalement à l’aise avec PDO.",
  "",
  "Dans l’ensemble, c’est un bon travail. Continue sur cette lancée, consolide ces quelques notions techniques, et tu atteindras rapidement un niveau encore plus professionnel.",
  ">>>",
  "Règles strictes :",
  "- Tutoiement (« tu », « ton », « tes »), sauf si le commentaire est pour toute une équipe : alors « vous ».",
  "- Pas de salutation (le prénom est ajouté avant ton texte), pas de « Cordialement », pas de titres de section, pas de liste à puces, pas de mise en forme (**, #, `), pas d’emoji.",
  "- Le premier paragraphe donne un avis HONNÊTE qui correspond au NIVEAU donné : excellent → « Excellent travail », bon → « bon travail », moyen → « travail correct », faible → travail encore fragile, critique → travail insuffisant. Ne dis jamais « bon travail » ou « excellent » si le niveau est moyen, faible ou critique.",
  "- Parle de ce qui a été réalisé en regroupant les points validés en quelques thèmes, sans les énumérer un par un. Ne cite pas les compétences du référentiel.",
  "- Bonus : s’il y en a, dis simplement qu’il a réalisé des bonus et que c’est une bonne initiative, SANS les lister. S’il n’y en a pas, ne parle pas de bonus.",
  "- Points non validés : dis naturellement ce qui manque encore (« il manque encore… »), dans une phrase, sans recopier la grille et sans « Compléter le point du brief ».",
  "- Notions à revoir : c’est le cœur du commentaire quand il y en a. Appuie-toi sur les REMARQUES DU FORMATEUR et les questions orales non réussies : explique précisément ce qui n’est pas compris ou ce qui est confondu, et pourquoi c’est important, comme dans l’exemple. N’ajoute aucune notion qui n’y est pas.",
  "- Si l’apprenant est en difficulté (niveau faible ou critique) et qu’il y a plusieurs notions à revoir, termine par un paragraphe « pour progresser » avec des conseils concrets UNIQUEMENT sur ces notions-là.",
  "- Si tout est validé et qu’il n’y a rien à revoir, n’invente rien : quelques phrases suffisent pour dire que c’est un excellent ou un bon travail.",
  "- Dernier paragraphe : une conclusion encourageante qui correspond au niveau. Tu peux y écrire {prénom} pour t’adresser à lui par son prénom (il sera remplacé).",
  "- N’invente RIEN : chaque phrase vient des éléments fournis. Aucun score, aucun niveau chiffré, aucun code de compétence.",
  'Réponds UNIQUEMENT avec ce JSON : {"commentaire":"le texte, paragraphes séparés par une ligne vide"}',
].join("\n");
/** The decisions for the AI (no name: the greeting is ours, the AI may write {prénom}). */
export function aiCommentPrompt(d: CommentData): string {
  const list = (a: string[]) => (a.length ? a.map((x) => `- ${x}`).join("\n") : "(aucun)");
  const missing = d.improve.map(missingOf).filter(Boolean).map((x) => x!.text);
  return [
    `PROJET : « ${d.project} »${d.group ? " (commentaire pour toute l’équipe : « vous »)" : ""}`,
    `NIVEAU DÉCIDÉ PAR LE FORMATEUR : ${levelOf(d)}`,
    `FONCTIONNALITÉS : ${d.allDone ? "toutes réalisées" : d.partDone ? "la plupart réalisées" : "en partie seulement"}`,
    `POINTS DU BRIEF VALIDÉS :\n${list(d.strengths)}`,
    `THÈMES DE CES POINTS : ${d.themes.join(" ; ") || "(aucun)"}`,
    `BONUS RÉALISÉS : ${d.bonus.length ? `oui (${d.bonus.length})` : "aucun"}`,
    `POINTS DU BRIEF NON VALIDÉS :\n${list(missing)}`,
    `CE QUI VA BIEN SELON L’ÉCHANGE : ${d.positive || "(rien de particulier)"}`,
    `REMARQUES DU FORMATEUR APRÈS L’ÉCHANGE :\n${d.remarks ? `<<<\n${d.remarks.slice(0, 2000)}\n>>>` : "(aucune)"}`,
    `NOTIONS À REVOIR :\n${list(d.notions)}`,
  ].join("\n\n");
}
const MARKUP = /\*\*|(^|\n)\s*#|`|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const VOUS = /\b(vous|votre|vos)\b/i, TU = /\b(tu|ton|ta|tes|toi|t['’](?:as|es|en|y))\b/i;
/** The AI's comment, checked (form, tone, level, bonus, length) with our greeting; null when it doesn't follow the rules. */
export function aiCommentText(d: CommentData, j: any): string | null {
  if (!j || typeof j !== "object") return null;
  let body = String(j.commentaire ?? "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!body) return null;
  const who = d.group ? d.team : d.first;
  body = who ? body.replace(/\{pr[ée]nom\}/gi, who) : body.replace(/\{pr[ée]nom\}\s*,\s*(\S)/gi, (_, c) => c.toUpperCase()).replace(/\s*\{pr[ée]nom\}/gi, "");
  if (MARKUP.test(body) || /^(bonjour|cordialement)/im.test(body) || /\{|\}/.test(body)) return null;
  if (d.group ? TU.test(body) : VOUS.test(body)) return null;
  // no section titles, no bullet lists
  if (body.split("\n").some((l) => /^\s*[–—•*-]\s/.test(l) || (l.trim() && l.trim().length < 45 && !/[.:?]$/.test(l.trim())))) return null;
  const lv = levelOf(d);
  if (lv !== "excellent" && /excellent/i.test(body)) return null;
  if ((lv === "faible" || lv === "critique") && /\b(bon|très bon|beau) travail\b/i.test(body)) return null;
  if (!d.bonus.length && /bonus/i.test(body)) return null;
  const words = wordCount(body), nothing = !d.improve.length && !d.notions.length;
  if (words < 15 || words > (nothing ? 140 : 520)) return null;
  return `${greetingOf(d)}\n\n${body}`;
}
