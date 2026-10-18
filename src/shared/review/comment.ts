// The debrief comment, sent to the learner by Discord DM and copied into Simplonline: a trainer's professional feedback
// (French, « vous », plain text with short section titles, « – » bullets, 120 to 250 words).
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
  greeting: string;          // "Bonjour Aamr," (the name never goes to the AI)
  project: string;
  group: boolean;            // a squad's comment (« vous » for everyone)
  level: string;             // excellent | bon | moyen | faible | critique | ""
  allDone: boolean;          // every feature of the brief validated
  partDone: boolean;         // at least half of them
  themes: string[];          // what the validated requirements are about (2 to 4)
  strengths: string[];       // the validated requirements, short (for the AI)
  comps: string[];           // the competencies validated (their names)
  bonus: string[];           // the bonus items done
  improve: string[];         // the requirements not validated, as actions (never the criteria)
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
    greeting: o.group ? `Bonjour ${o.group},` : `Bonjour${o.first ? ` ${o.first}` : ""},`,
    project: clean(o.project, 120), group: !!o.group, level: lv,
    allDone: stories.length > 0 && okStories === stories.length,
    partDone: stories.length > 0 && okStories / stories.length >= 0.5,
    themes: themesOf(items.filter((x) => STRONG.includes(x.type) && x.ok).map((x) => x.texte)),
    strengths: uniq(strong).slice(0, 12),
    comps,
    bonus: uniq(items.filter((x) => x.type === "bonus" && x.ok).map((x) => low(storyCore(x.texte)))).slice(0, MAX.bonus),
    improve: uniq(items.filter((x) => TODO.includes(x.type) && !x.ok).map((x) => actionOf(x.texte))).slice(0, MAX.improve),
    notions, remarks, oralMissed,
    positive: /\b(tu|ton|ta|tes|toi)\b/i.test(String(R.positive || "")) ? "" : clean(R.positive, 300).replace(/([^.!?])$/, "$1.").replace(/^\.$/, ""),
  };
}

// ------------------------------------------------------------------ the text
const T = {
  strengths: "Points forts", bonus: "Bonus", improve: "Axes d'amélioration", notions: "Notions à revoir",
  notionsIntro: "À la suite de notre échange, je vous invite à revoir les notions suivantes :",
  further: "L'ensemble des points du brief est validé. Pour aller plus loin, je vous invite à approfondir les notions de ce projet et à soigner la lisibilité et l'organisation de votre code.",
  bonusEnd: "Cette initiative montre votre capacité à aller au-delà des attentes.",
};
const closingOf = (d: CommentData) => (!d.improve.length && !d.notions.length
  ? "Félicitations pour ce travail de qualité. Je reste disponible pour toute question et vous souhaite une bonne continuation pour le prochain brief."
  : d.level === "faible" || d.level === "critique"
    ? "Prenez le temps de reprendre ces points : ils sont essentiels pour la suite de la formation. Je reste disponible pour vous accompagner."
    : "Je reste disponible pour toute question. Bonne continuation pour le prochain brief.");
const bullets = (a: string[]) => a.map((x) => `– ${x}`);
/** The parts in their order: greeting, intro, sections (title + text), closing, signature. */
function assemble(d: CommentData, p: { strengths: string; bonus: string; improve: string[]; further: string; notions: string[]; closing: string }): string {
  const out = [d.greeting, `Voici le bilan du débriefing de votre projet « ${d.project} ».`];
  if (p.strengths) out.push(`${T.strengths}\n${p.strengths}`);
  if (d.bonus.length && p.bonus) out.push(`${T.bonus}\n${p.bonus}`);
  out.push(`${T.improve}\n${p.improve.length ? bullets(p.improve).join("\n") : p.further}`);
  if (p.notions.length) out.push(`${T.notions}\n${T.notionsIntro}\n${bullets(p.notions).join("\n")}`);
  out.push(p.closing, "Cordialement,");
  return out.join("\n\n");
}
/** The comment as a template: always available (and the fallback when the AI can't phrase it). */
export function commentText(d: CommentData): string {
  const s: string[] = [];
  if (d.allDone) s.push("Vous avez réalisé l'ensemble des fonctionnalités demandées.");
  else if (d.partDone) s.push("Vous avez réalisé une grande partie des fonctionnalités demandées.");
  if (d.themes.length) s.push(`Votre travail est solide sur ${andList(d.themes)}.`);
  if (d.comps.length) s.push(`Vous avez également validé ${d.comps.length > 1 ? "les compétences suivantes" : "la compétence suivante"} : ${andList(d.comps.map((c) => `« ${c} »`))}.`);
  if (d.positive) s.push(`Lors de notre échange, ${low(d.positive)}`);
  const notions = d.notions.map(low);
  return assemble(d, {
    strengths: s.join(" "),
    bonus: d.bonus.length ? `Vous avez également travaillé ${d.bonus.length > 1 ? "les bonus suivants" : "le bonus suivant"} : ${andList(d.bonus)}. ${T.bonusEnd}` : "",
    improve: d.improve, further: T.further, notions: notions.map((n, i) => `${n}${i < notions.length - 1 ? " ;" : "."}`), closing: closingOf(d),
  });
}
/** The debrief's comment from the switches: one student, or a squad (« Bonjour {squad}, », « vous » for everyone). */
export function buildComment(firstName: string, rec: any, states?: any): string {
  return commentText(commentData({ first: firstName, group: rec && rec.squad ? rec.squad.name : "", project: String((rec && rec.brief) || ""), rec, states }));
}
/** A squad member's own comment: the squad's work, their own competencies and note (else the squad's remarks). */
export function memberComment(m: any, rec: any, ms: any): string {
  return commentText(commentData({ first: firstNameOf(m.name, m.login), project: String((rec && rec.brief) || ""), rec,
    member: { co: ms && ms.co, note: ms && ms.note, level: (() => { const l = memberLevelOf(rec, String(m.gid)); return l.lvl || l.prop; })() } }));
}
export const wordCount = (t: string) => (String(t).match(/[A-Za-zÀ-ÿ0-9’'-]+/g) || []).length;

// ------------------------------------------------------------------ the AI: phrasing only
export const AI_COMMENT_SYSTEM = [
  "Tu aides un formateur en développement web à rédiger le commentaire de débriefing d’un projet, envoyé à l’apprenant.",
  "Tu reçois les éléments DÉJÀ DÉCIDÉS par le formateur. Ta seule tâche : les formuler en un français professionnel, chaleureux, précis et encourageant.",
  "Règles strictes :",
  "- Vouvoiement (« vous », « votre », « vos »). Jamais « tu », « ton », « ta », « tes ».",
  "- Texte brut : aucun symbole de mise en forme (pas de **, #, `, ni d’emoji). Aucun point d’exclamation.",
  "- N’invente RIEN : chaque phrase vient des éléments fournis. Ne cite aucun code de compétence, aucun score, aucun niveau.",
  "- « points_forts » : 2 à 4 phrases qui regroupent les points validés et les compétences validées en 2 à 4 thèmes (pas de liste point par point), et ce qui va bien selon l’ÉCHANGE (s’il y en a).",
  "- « bonus » : seulement s’il y a des bonus : « Vous avez également travaillé les bonus suivants : … . » puis une phrase courte qui valorise l’initiative. Sinon \"\".",
  "- « amelioration » : une ligne par point NON validé fourni, en conseil concret et actionnable, commençant par un verbe à l’infinitif (ex. « Rendre le site adaptatif aux points de rupture demandés »). Aucun autre point. Si la liste fournie est vide : [] et « aller_plus_loin » = une phrase pour aller plus loin.",
  "- « notions » : seulement les NOTIONS À REVOIR SELON L’ÉCHANGE et les NOTIONS DES QUESTIONS ORALES NON RÉUSSIES : une notion claire à étudier par ligne, regroupées, sans recopier les questions. Ce qui est positif dans les remarques n’est jamais une notion à revoir. Si les deux sources sont vides : [].",
  "- « conclusion » : une ou deux phrases professionnelles (disponibilité pour les questions, encouragement pour le prochain brief).",
  "- L’ensemble fait environ 120 à 230 mots.",
  'Réponds UNIQUEMENT avec ce JSON : {"points_forts":"…","bonus":"…","amelioration":["…"],"aller_plus_loin":"…","notions":["…"],"conclusion":"…"}',
].join("\n");
/** The decisions for the AI (no name: the greeting is ours). */
export function aiCommentPrompt(d: CommentData): string {
  const list = (a: string[]) => (a.length ? a.map((x) => `- ${x}`).join("\n") : "(aucun)");
  return [
    `PROJET : « ${d.project} »${d.group ? " (commentaire pour toute l’équipe)" : ""}`,
    `FONCTIONNALITÉS : ${d.allDone ? "toutes réalisées" : d.partDone ? "la plupart réalisées" : "en partie réalisées"}`,
    `POINTS DU BRIEF VALIDÉS :\n${list(d.strengths)}`,
    `THÈMES DE CES POINTS : ${d.themes.join(" ; ") || "(aucun)"}`,
    `COMPÉTENCES VALIDÉES :\n${list(d.comps)}`,
    `CE QUI VA BIEN SELON L’ÉCHANGE (pour « points_forts ») : ${d.positive || "(rien de particulier)"}`,
    `NOTIONS À REVOIR SELON L’ÉCHANGE :\n${list(d.notions.filter((n) => !d.oralMissed.some((m) => m.toLowerCase() === n.toLowerCase())))}`,
    `BONUS RÉALISÉS :\n${list(d.bonus)}`,
    `POINTS DU BRIEF NON VALIDÉS (pour « amelioration ») :\n${list(d.improve)}`,
    `REMARQUES DU FORMATEUR APRÈS L’ÉCHANGE :\n${d.remarks ? `<<<\n${d.remarks.slice(0, 1500)}\n>>>` : "(aucune)"}`,
    `NOTIONS DES QUESTIONS ORALES NON RÉUSSIES :\n${list(d.oralMissed)}`,
    d.level === "faible" || d.level === "critique" ? "TON : bienveillant mais ferme, l’apprenant doit reprendre ces points." : "",
  ].filter(Boolean).join("\n\n");
}
const TU = /\b(tu|ton|ta|tes|toi|t['’](?:as|es|en|y))\b/i;
const MARKUP = /\*\*|(^|\n)\s*#|`|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const line = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().replace(/^[–—•*-]\s*/, "");
/** The AI's answer, checked (form, sources, length) and assembled; null when it doesn't follow the rules. */
export function aiCommentText(d: CommentData, j: any): string | null {
  if (!j || typeof j !== "object") return null;
  const strengths = line(j.points_forts), bonus = line(j.bonus), further = line(j.aller_plus_loin), closing = line(j.conclusion);
  const improve = (Array.isArray(j.amelioration) ? j.amelioration : []).map(line).filter(Boolean);
  const notions = (Array.isArray(j.notions) ? j.notions : []).map(line).filter(Boolean);
  const all = [strengths, bonus, further, closing, ...improve, ...notions].join("\n");
  if (TU.test(all) || MARKUP.test(all) || /!/.test(all.replace(/!$/, ""))) return null;
  if ((d.strengths.length || d.comps.length || d.positive) && !strengths) return null;
  if (!closing) return null;
  if (!!d.bonus.length !== !!bonus) return null;
  if (d.improve.length ? !improve.length || improve.length > d.improve.length : improve.length || !further) return null;
  const sources = d.remarks || d.oralMissed.length;
  if (sources ? notions.length > 8 : notions.length) return null;
  const text = assemble(d, { strengths, bonus, improve, further, notions: notions.map((n, i) => `${low(n).replace(/[.;]$/, "")}${i < notions.length - 1 ? " ;" : "."}`), closing });
  const words = wordCount(text);
  return words >= 90 && words <= 300 ? text : null;
}
