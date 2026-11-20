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
import { REF_NAMES, conceptsOf, debriefLevel, firstNameOf, noVerif, reviewStates, saidIn } from "./engine.ts";
import { memberLevelOf } from "./members.ts";

export interface CommentData {
  first: string;             // the first name (never goes to the AI)
  greeting: string;          // "Bonjour Aamr," (kept for older callers; the comment opens with the first name)
  project: string;
  group: boolean;            // a squad's comment (« vous » for everyone)
  team: string;              // the squad's name (its greeting)
  level: string;             // excellent | bon | moyen | faible | critique | ""
  off?: string[];            // the subjects the brief's sprint isn't about (never said: e.g. HTML, CSS in a JavaScript sprint)
  allDone: boolean;          // every feature of the brief validated
  partDone: boolean;         // at least half of them
  themes: string[];          // what the validated requirements are about (2 to 4)
  strengths: string[];       // the validated requirements, short (for the AI)
  comps: string[];           // the competencies validated (their names)
  bonus: string[];           // the bonus items done
  improve: string[];         // the requirements not validated, as written (never the criteria)
  notions: string[];         // what is still to learn (the notions of toLearn, in its order)
  mastered: string[];        // what they showed they master (assessments, oral questions answered), short
  toLearn: ToLearn[];        // what is still to learn, from the most important: where it comes from, why, how to work it
  remarks: string;           // the teacher's one-to-one remarks, as written (the AI rewrites them as notions)
  positive: string;          // what went well in the one-to-one, one sentence in « vous » (from ✨ on the remarks)
  oralMissed: string[];      // the notions of the oral questions not answered
  // which comment: a squad's (about the PROJECT), one learner's from their assessment (a squad member, or a learner
  // whose assessment is graded), or one learner's from the project only (no graded assessment)
  mode: "group" | "assess" | "project";
  memberOnly: boolean;       // a squad member: the project's features are in the squad's comment, not here
  assess: AssessFacts | null;
  proj: ProjectFacts | null; // a squad: what the project shows (interface, planning, README, commits, team)
  scope: string[];           // the notions the comment may talk about: the brief's requirements, the assessment's
                             // questions, the teacher's remarks, the oral questions (never anything else)
}
/** One thing still to learn: the notion, what was seen (why), how to work it, its sources and its weight (the order). */
export interface ToLearn { notion: string; why: string; how: string; from: string[]; w: number }
/** One learner's graded assessment(s) of the brief: what they mastered, what they missed, the grader's comment. */
export interface AssessFacts { score: number | null; ok: string[]; ko: string[]; summary: string; comps: string[]; compsKo: string[]; missed?: string[]; right?: string[] }
/** A squad's project beyond the features: interface and UX, planning, README, commits, team work. */
export interface ProjectFacts { good: string[]; bad: string[]; team: string[] }

// requirements that show what was done (strengths), and those that say what to do (never the performance criteria)
const STRONG = ["story", "technique", "livrable", "critere"];
const TODO = ["story", "technique", "livrable"];
const MAX = { themes: 4, comps: 4, bonus: 3, improve: 6, notions: 8 };

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
const NEGATIVE = /\b(ne|n['’])\s*\S+(?:\s+\S+)?\s+(?:pas|plus|jamais|gu[èe]re)\b|\b(?:il|elle|tu)\s+\S+\s+pas\b|am[ée]lior|incompl|au lieu d|\b(?:a|as|avez|est)\s+pas\b|\bpas (?:pu|su|réussi)\b|confond|difficult|lacune|[àa] revoir|revoir|fragile|h[ée]sit|oubli|erreur|du mal|incomplet|flou|approximati/i;
// « planification à revoir / à améliorer, il met pas de description… »: a subject, then what the teacher noted about it
const SUBJECT_TO_REVIEW = /^(.{3,60}?)\s+(?:est |sont )?(?:encore )?[àa] (?:revoir|retravailler|reprendre|am[ée]lior[^\s,:;]*)\s*[,:;]\s*(.+?)\s*[.!?]*$/i;
export function remarkNotions(text: unknown): string[] {
  const parts = String(text ?? "").split(/(?<=[.!?;])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  // one sentence can hold a positive and a gap (« elle a su X, mais elle doit revoir Y »): only the gap is a notion
  // « elle doit revoir X, elle a pas pu Y, elle a pas pu Z »: each clause that names the learner is its own point
  const gaps = parts.flatMap((s) => s.split(/,?\s+(?:mais|par contre|cependant|en revanche|toutefois)\s+/i))
    .flatMap((s) => (SUBJECT_TO_REVIEW.test(s) ? [s] : s.split(/,\s*(?=(?:il|elle|l['’]apprenante?|tu)\s)/i))).map((s) => s.trim()).filter(Boolean);
  return gaps.filter((s) => NEGATIVE.test(s)).map((s) => clean(s
    .replace(/^(?:mais|et|par contre|cependant|en revanche|toutefois|par ailleurs)\s*,?\s+/i, "")
    .replace(/^(il|elle|l['’]apprenante?|tu|vous)\s+/i, "")
    .replace(/^(?:doit|dois|devez|devra|devras|faut|il faut|a besoin de|as besoin de)\s+(?:encore\s+|bien\s+|absolument\s+)?(?:revoir|retravailler|reprendre|approfondir|consolider|travailler(?: sur)?|réviser)\s+/i, "")
    .replace(/^(?:ne|n['’])\s*(?:sait|sais|savez|a|as|avez|ma[iî]trise|ma[iî]trises|ma[iî]trisez|comprend|comprends|comprenez|conna[iî]t|connais|connaissez|peut|peux|pouvez|est|es|êtes)\s+(?:pas|plus)\s+(?:bien\s+|encore\s+|vraiment\s+)?(?:expliquer|faire|utiliser|compris|capable d['e]\s*|à l['’]aise avec|clair sur)?\s*/i, "")
    .replace(/^(?:a|as|avez)\s+du mal (?:à|avec)\s+/i, "")
    .replace(/^(?:(?:a|as|avez|n['’]a|n['’]as)\s+)?(?:pas\s+)?(?:aussi\s+|encore\s+)?(?:su|pu|réussi à|réussi)\s+(?:aussi\s+)?/i, "")
    .replace(/^confond(?:s|ez)?\s+(.+?)\s+et\s+(.+)$/i, "la différence entre $1 et $2")
    .replace(/^(?:à revoir|revoir)\s*:?\s*/i, "")
    // « planification à revoir, pas de description, user stories… »: the subject, then what the teacher noted
    .replace(SUBJECT_TO_REVIEW, "$1 : $2")
    // « Planification à revoir », « README incomplet »: the subject only
    .replace(/\s+(?:est |sont )?(?:encore )?(?:à revoir|à retravailler|à reprendre|à améliorer|à consolider|à approfondir|incompl[eè]te?s?|insuffisante?s?|fragiles?|approximati(?:f|ve)s?)[.!;\s]*$/i, ""), 140)).filter((x) => x.length > 2).map(low);
}

const compName = (c: string) => low(String((REF_NAMES as any)[String(c).toUpperCase().replace(/N\d$/, "").replace(/^CT/, "T")] || ""));
/** The learner's own graded assessment(s) of the brief (debrief.ts briefAssessments: members). A learner alone: their uid
 *  is the only one there. */
export function assessFacts(rec: any, uid?: string | null): AssessFacts | null {
  const list = (rec?.assess || []).filter((a: any) => a && a.members);
  let id = uid ? String(uid) : "";
  if (!id) { const keys = uniq(list.flatMap((a: any) => Object.keys(a.members))); if (keys.length !== 1) return null; id = keys[0]; }
  const mine = list.map((a: any) => a.members[id]).filter(Boolean);
  if (!mine.length) return null;
  const ko = uniq(mine.flatMap((m: any) => m.ko || []));
  const scores = mine.map((m: any) => m.score).filter((x: any) => typeof x === "number");
  return {
    score: scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : null,
    ok: uniq(mine.flatMap((m: any) => m.ok || [])).filter((c) => !ko.includes(c)).slice(0, 6), ko: ko.slice(0, 6),
    summary: mine.map((m: any) => String(m.summary || "").trim()).filter(Boolean).join(" ").slice(0, 900),
    comps: uniq(mine.flatMap((m: any) => (m.comps || []).map(compName))).filter(Boolean).slice(0, 4),
    compsKo: uniq(mine.flatMap((m: any) => (m.compsKo || []).map(compName))).filter(Boolean).slice(0, 4),
    // question by question (assessments and mises en situation): the real mistakes and the real successes
    missed: mine.flatMap((m: any) => (Array.isArray(m.missed) ? m.missed : [])).slice(0, 24),
    right: mine.flatMap((m: any) => (Array.isArray(m.right) ? m.right : [])).slice(0, 24),
  };
}
// the automatic checks of the repo, by what the squad comment talks about (the features are the requirements)
const PROJECT_PARTS: [RegExp, string][] = [
  [/^(responsive|breakpoints|layout|anim|semantic|nav|active|h1|alt|seo|w3c|map|page404|figma|contrast|aria|form)$/, "Interface et expérience utilisateur"],
  [/^(planning)$/, "Planification"],
  [/^(docs|api_docs|pages_site|uml|postman)$/, "README, documentation et mise en ligne"],
  [/^(commits|git|branches?|prs?|reviews?|members_commit)$/, "Commits et Git"],
];
/** A squad's project beyond its features, from the repo (the teacher's switches on the checks win). */
export function projectFacts(rec: any, st: any): ProjectFacts {
  const good: string[] = [], bad: string[] = [], team: string[] = [];
  for (const [rx, part] of PROJECT_PARTS) {
    const cs = (rec.checks || []).filter((c: any) => !c.info && rx.test(String(c.id)));
    const ok = (c: any) => (typeof st.ck?.[c.id] === "boolean" ? st.ck[c.id] : c.ok);
    const yes = cs.filter((c: any) => ok(c) === true).map((c: any) => clean(c.label, 80)), no = cs.filter((c: any) => ok(c) === false).map((c: any) => `${clean(c.label, 80)}${c.detail ? ` (${clean(c.detail, 120)})` : ""}`);
    if (yes.length) good.push(`${part} : ${yes.join(", ")}`);
    if (no.length) bad.push(`${part} : ${no.join(" ; ")}`);
  }
  const cm: any[] = rec.result?.commits || [];
  const vague = cm.filter((c) => c && c.ok === false).length;
  if (cm.length) (vague > cm.length / 3 ? bad : good).push(`Messages de commit : ${vague ? `${vague} sur ${cm.length} trop vagues ou sans rapport avec le code` : "clairs et en rapport avec le code"}`);
  const contrib: any[] = rec.contrib || [];
  if (contrib.length) {
    for (const m of contrib) team.push(`${firstNameOf(m.name, m.login) || m.login || "membre"} : ${m.commits ?? 0} commits${m.prs ? `, ${m.prs} pull requests` : ""}${m.reviews ? `, ${m.reviews} revues` : ""}${m.cards != null ? `, ${m.cardsDone ?? 0}/${m.cards} cartes de planification terminées` : ""}`);
    const n = contrib.map((m) => m.commits || 0), total = n.reduce((a, b) => a + b, 0);
    if (total) (Math.min(...n) < total / contrib.length / 3 ? bad : good).push(`Répartition du travail : ${Math.min(...n) < total / contrib.length / 3 ? "très inégale entre les membres" : "équilibrée entre les membres"}`);
    if (contrib.some((m) => m.prs) || contrib.some((m) => m.reviews)) good.push("Travail en équipe avec Git : pull requests et revues de code");
  }
  return { good: good.slice(0, 6), bad: bad.slice(0, 6), team: team.slice(0, 8) };
}

// What is still to learn is said by SUBJECT (HTML, CSS, JavaScript, Tailwind, Git, the planning…): one short line each,
// what to work on in that subject (from every source: the remarks, the Fiche, the oral questions, the assessments and
// the mises en situation, the live task), then one sentence on how to practise. Never where it was seen.
type Subject = { name: string; title?: string; rx?: RegExp; essentials?: { t: string; m?: RegExp }[]; practice: string };
export const SUBJECTS: Subject[] = [
  { name: "La planification", rx: /plann?if|planning|jira|trello|backlog|kanban|scrum|gestion de projet/i,
    essentials: [{ t: "découper le brief en user stories puis en tâches courtes" }, { t: "estimer et répartir ces tâches sur les jours disponibles" }, { t: "tenir le tableau à jour chaque jour" }],
    practice: "Refais la planification de ce brief sur Jira ou Trello et compare-la à ce que tu as réellement fait." },
  { name: "Tailwind", title: "L’utilisation de Tailwind", rx: /tailwind/i,
    essentials: [{ t: "les classes utilitaires et les espacements" }, { t: "Flexbox et Grid avec Tailwind", m: /flex|grid/i }, { t: "le responsive avec les préfixes", m: /responsive|media/i }, { t: "les états au survol et au focus" }],
    practice: "Reproduis une section de ta maquette uniquement avec Tailwind." },
  { name: "Bootstrap", title: "L’utilisation de Bootstrap", rx: /bootstrap/i,
    essentials: [{ t: "la grille et ses points de rupture", m: /responsive|grid/i }, { t: "les composants" }, { t: "la personnalisation sans casser le framework" }],
    practice: "Refais une page de ton projet avec la grille et deux composants." },
  { name: "Le README", title: "La rédaction du README", rx: /readme|documentation/i,
    essentials: [{ t: "présenter le projet" }, { t: "expliquer son installation et son lancement" }, { t: "décrire ses fonctionnalités avec des captures" }],
    practice: "Demande à un camarade de lancer ton projet en suivant uniquement ton README." },
  { name: "La maquette", rx: /maquette|figma|wireframe|zoning/i,
    essentials: [{ t: "passer du zoning au wireframe" }, { t: "prévoir le mobile et l’ordinateur", m: /responsive|media/i }, { t: "définir une charte graphique et la suivre dans le code" }],
    practice: "Refais la maquette d’une page en mobile et en ordinateur, puis compare-la à ton rendu." },
  { name: "L’accessibilité", rx: /accessib|\baria\b|contraste|lecteur d['’]écran/i,
    essentials: [{ t: "une hiérarchie de titres correcte" }, { t: "des textes alternatifs utiles", m: /\balt\b/i }, { t: "un contraste suffisant et la navigation au clavier" }],
    practice: "Passe ta page dans Lighthouse et corrige chaque problème relevé." },
  { name: "Les outils de développement du navigateur", rx: /devtools|dev tools|outils de d[ée]veloppement|inspecteur|console/i,
    essentials: [{ t: "l’inspecteur pour lire le HTML et le CSS appliqué" }, { t: "la console pour lire les erreurs et tester du code" }],
    practice: "À chaque bug, ouvre les DevTools pour en trouver la cause avant de modifier le code." },
  { name: "HTML", rx: /\bhtml\b|\bbalises?\b/i,
    practice: "Refais une page de zéro, sans modèle, en vérifiant le rôle de chaque balise." },
  { name: "CSS", rx: /\bcss\b|\bsass\b|\bscss\b/i,
    practice: "Reproduis une section de ta maquette sans framework, en vérifiant chaque règle dans l’inspecteur." },
  { name: "JavaScript", title: "Les bases de JavaScript", rx: /javascript|\bjs\b/i,
    essentials: [{ t: "les conditions et les boucles", m: /condition|boucle/i }, { t: "les fonctions", m: /fonction/i }, { t: "les tableaux et leurs méthodes", m: /tableau|array/i }, { t: "la manipulation du DOM", m: /DOM|querySelector/i }, { t: "les événements", m: /[ée]v[ée]nement|addEventListener/i }],
    practice: "Fais chaque jour un petit exercice sur ces points, sans copier de solution, jusqu’à pouvoir les expliquer." },
  { name: "Git", title: "Le travail avec Git", rx: /\bgit(hub)?\b|commit|branche|versionn|pull request/i,
    essentials: [{ t: "des commits petits et clairs" }, { t: "une branche par tâche" }, { t: "la fusion par pull request" }],
    practice: "Fais ta prochaine tâche sur sa propre branche, en commits clairs, puis ouvre une pull request." },
  { name: "PHP", title: "Les bases de PHP", rx: /\bphp\b|\bpdo\b/i,
    essentials: [{ t: "la syntaxe de base" }, { t: "les données d’un formulaire et leur validation" }, { t: "PDO et les requêtes préparées", m: /pdo|requ[êe]te/i }],
    practice: "Refais seul un petit CRUD complet en expliquant chaque ligne." },
  { name: "Laravel", title: "Les bases de Laravel", rx: /laravel|eloquent|\bblade\b|artisan|migrations?\b|contr[ôo]leurs?\b|\broutes?\b|routing|\$fillable|belongsTo|hasMany|hasOne|\bcompact\(|composer/i,
    essentials: [{ t: "le chemin route, contrôleur, vue" }, { t: "les migrations et les modèles Eloquent" }, { t: "la validation" }],
    practice: "Construis seul un petit CRUD avec une relation entre deux modèles." },
  { name: "SQL", title: "La conception de la base de données", rx: /\bsql\b|merise|\bmcd\b|\bmld\b|base de donn/i,
    essentials: [{ t: "les entités et leurs relations" }, { t: "les clés primaires et étrangères" }, { t: "les requêtes de base et les jointures", m: /requ[êe]te|select/i }],
    practice: "Écris toi-même les requêtes de ton projet et vérifie chaque résultat." },
  { name: "React", title: "Les bases de React", rx: /\breact\b|\bjsx\b|useState|useEffect|\bprops\b|\bhooks?\b/i,
    essentials: [{ t: "les composants et les props" }, { t: "l’état avec useState" }, { t: "les effets avec useEffect" }, { t: "l’affichage des listes et des conditions" }],
    practice: "Construis un petit composant de zéro, puis fais-le évoluer en ajoutant un état et un effet." },
  { name: "Node.js et Express", rx: /\bnode(?:\.?js)?\b|\bexpress\b|middleware|\bnpm\b/i,
    essentials: [{ t: "créer un serveur et ses routes" }, { t: "les middlewares" }, { t: "la lecture des paramètres et du corps d’une requête" }],
    practice: "Écris une petite API de zéro avec deux ou trois routes, et teste chacune." },
  { name: "Les API REST", rx: /\bapi\b|\brest(?:ful)?\b|endpoint|postman|\bjson\b|codes? (?:http|de statut)/i,
    essentials: [{ t: "les verbes HTTP et leurs usages" }, { t: "les codes de statut" }, { t: "le format JSON des réponses" }],
    practice: "Teste chaque route de ton API dans Postman et vérifie le code de statut et la réponse." },
  { name: "Docker", title: "Les bases de Docker", rx: /docker|conteneur|dockerfile|compose\.ya?ml/i,
    essentials: [{ t: "la différence entre image et conteneur" }, { t: "l’écriture d’un Dockerfile" }, { t: "docker compose pour lancer plusieurs services" }],
    practice: "Conteneurise toi-même un petit projet de zéro et lance-le avec docker compose." },
  { name: "La programmation orientée objet", practice: "Modélise un objet de ton projet avec une classe, puis explique ce qu’est une instance." },
  { name: "La mise en ligne", rx: /d[ée]ploi|h[ée]berg|mise en ligne|netlify|vercel|github pages/i,
    essentials: [{ t: "préparer et publier le projet" }, { t: "tester la version en ligne sur mobile" }],
    practice: "Mets ce projet en ligne et vérifie chaque page depuis ton téléphone." },
  { name: "La présentation de ton travail", rx: /pr[ée]sentation|soutenance|expliquer son code/i,
    essentials: [{ t: "expliquer le besoin et la solution" }, { t: "expliquer chaque partie de ton code avec tes mots" }],
    practice: "Présente ton projet à voix haute en cinq minutes, sans lire ton code." },
  { name: "La qualité du code", rx: /nommage|lisibilit|propret[ée]|clean code|indent|organisation du code|structure du code/i,
    essentials: [{ t: "des noms clairs" }, { t: "une indentation régulière" }, { t: "des fichiers rangés par rôle" }],
    practice: "Relis un de tes fichiers et renomme, range et simplifie ce qui n’est pas clair." },
];
// the notions of engine.ts's CONCEPTS, by subject, said shortly (without their subject's name)
// each notion of engine.ts's CONCEPTS said directly: what to learn in it, in a few words
export const LEARN: Record<string, string> = {
  "la structure d’une page HTML (doctype, head, body)": "le rôle du doctype, de head et de body, et l’ordre des balises de base",
  "le lien entre une page HTML et sa feuille CSS (<link>)": "relier une feuille de style avec la balise link et vérifier son chemin",
  "les formulaires HTML (form, input, label, button)": "relier chaque label à son champ et choisir le bon type de champ et de bouton",
  "les images et le texte alternatif (img, alt)": "insérer une image et écrire un texte alternatif qui la décrit",
  "les liens hypertextes (a, href, target)": "créer des liens vers une page, une section ou un autre site, avec le bon chemin",
  "les listes et les tableaux HTML": "choisir entre une liste et un tableau, puis les structurer correctement",
  "les balises sémantiques": "choisir la balise qui correspond au rôle de chaque zone de la page",
  "les sélecteurs CSS (balise, classe, id)": "cibler une balise, une classe ou un id, et savoir quelle règle l’emporte",
  "le modèle de boîte et le centrage (margin, padding)": "la différence entre margin, padding et border, et le centrage d’un bloc",
  "la propriété display (block, inline)": "la différence entre un élément block et un élément inline",
  "Flexbox": "aligner et répartir des éléments sur une ligne ou une colonne",
  "CSS Grid": "placer des éléments sur une grille de lignes et de colonnes",
  "le responsive (media queries)": "adapter la mise en page à chaque taille d’écran avec les media queries, en partant du mobile",
  "la mise en forme du texte et des couleurs en CSS": "régler la taille, la graisse et la couleur du texte en gardant un bon contraste",
  "le positionnement en CSS": "placer un élément avec position relative, absolute ou fixed",
  "les transitions et les animations CSS": "animer un changement d’état avec transition et keyframes",
  "les événements JavaScript (addEventListener)": "réagir à un clic ou à une saisie avec addEventListener",
  "la manipulation du DOM": "sélectionner un élément, modifier son contenu et ses classes, créer et insérer de nouveaux éléments",
  "les appels d’API (fetch)": "récupérer des données d’une API avec fetch et les afficher dans la page",
  "l’asynchrone (promesses, async / await)": "attendre le résultat d’une opération avec async et await, et gérer les erreurs",
  "les boucles": "parcourir une suite de valeurs avec for et for...of",
  "les conditions": "écrire des conditions avec if, else et les opérateurs de comparaison",
  "les tableaux et leurs méthodes": "ajouter, transformer et garder une partie des valeurs d’un tableau avec push, map et filter",
  "les fonctions": "écrire une fonction avec des paramètres et une valeur de retour",
  "les variables": "choisir entre let et const et nommer clairement ses données",
  "le localStorage": "enregistrer et relire des données avec localStorage et JSON",
  "les requêtes SQL": "écrire les requêtes de base et les jointures",
  "la programmation orientée objet": "créer une classe avec son constructeur et ses méthodes, puis l’instancier",
  "Git (commit, branches)": "faire des commits clairs, travailler sur une branche et fusionner par pull request",
};
// the notions of the frameworks and tools (not in CONCEPTS), said the same way
// what to look up about a point (the concepts only, as the student will type them: never a site's name), and what to pay attention to: never an
// explanation — the student searches and finds it. The first that fits; the most precise first.
const GUIDE: [RegExp, string[], string][] = [
  [/(?:acc[ée]d|v[ée]rifi|savoir|tester|lire|r[ée]cup[ée]r)\w*[^.]{0,30}\bclasses?\b|classList\.contains/i, ["classList contains", "classList"], "classList.contains(\"nom\") renvoie true ou false, sans le point devant le nom de la classe."],
  [/(?:r[ée]cup[ée]r|s[ée]lectionn|acc[ée]d|trouv|cibl)\w*[^.]{0,30}\b(?:images?|img)\b|images? (?:qui existe|existante|d[ée]j[àa])/i, ["querySelector", "sélecteur descendant CSS", "getAttribute"], "pars de l’élément parent (div img), et vérifie dans la console que le résultat n’est pas null."],
  [/relations? Eloquent|hasMany|belongsTo/i, ["Laravel Eloquent relationships"], "la clé étrangère va dans la table du côté belongsTo."],
  [/migrations?/i, ["Laravel migrations"], "up() crée, down() annule : les deux doivent correspondre."],
  [/donn[ée]es? (?:à|vers) la vue|\bview\(|compact/i, ["Laravel passing data to views", "Blade foreach"], ""],
  [/composer|artisan/i, ["Laravel Artisan console", "Composer install"], ""],
  [/tailwind/i, ["Tailwind CSS utility classes", "Tailwind responsive design"], "les préfixes sm: md: lg: s’appliquent à partir de cette largeur."],
  [/\bvariables?\b|\blet\b|\bconst\b|port[ée]e/i, ["let const var", "portée des variables JavaScript"], "const par défaut, let seulement si la valeur change, jamais var."],
  [/supprim|\bremove\b/i, ["element remove", "removeChild"], "on supprime l’élément lui-même (element.remove()), pas son contenu."],
  [/plan+ifi|user stor|deadline|estim|trello|github projects|kanban|t[âa]ches?\b/i, ["rédiger une user story", "GitHub Projects kanban"], "chaque tâche a une estimation et une date limite, et le lien du tableau est dans le README."],
  [/HTMLCollection|NodeList|liste vivante|liste statique/i, ["HTMLCollection", "NodeList"], "querySelectorAll ne se met pas à jour, getElementsByClassName oui."],
  [/children|childNodes/i, ["children", "childNodes"], "childNodes compte aussi les textes et les espaces."],
  [/currentTarget|e\.target|event\.target|d[ée]l[ée]gation/i, ["event.target", "event.currentTarget", "délégation d’événements"], ""],
  [/textContent|innerHTML/i, ["textContent", "innerHTML"], "innerHTML avec ce que tape l’utilisateur est une faille."],
  [/images?\b|\bimg\b|\balt\b|\bsrc\b/i, ["HTMLImageElement", "createElement"], "une image a toujours un alt qui la décrit."],
  [/classList|classes?\b/i, ["classList"], "add, remove, toggle et contains : sans le point devant le nom de la classe."],
  [/[ée]v[ée]nements?|addEventListener|clic|\bclick\b/i, ["addEventListener", "event.target", "preventDefault"], "on passe la fonction sans l’appeler : addEventListener(\"click\", maFonction), pas maFonction()."],
  [/createElement|appendChild|cr[ée]er (?:et|des)|ins[ée]rer|manipulation (?:du )?dom/i, ["createElement", "appendChild", "remove"], "un élément créé n’apparaît pas tant qu’il n’est pas ajouté à la page."],
  [/s[ée]lect|querySelector|getElementBy|\bDOM\b/i, ["querySelector", "querySelectorAll"], "le # pour un id, le . pour une classe, et vérifie que le résultat n’est pas null."],
  [/localStorage|sauvegard/i, ["localStorage", "JSON.stringify", "JSON.parse"], "localStorage ne garde que du texte."],
  [/formulaires?|validation|\binput\b|\bchange\b|saisie/i, ["input event", "submit event", "validation de formulaire JavaScript"], ""],
  [/forEach|\bmap\b|\bfilter\b|tableaux? JS|tableaux? JavaScript|boucles?/i, ["Array forEach", "Array map", "Array filter"], "map et filter renvoient un nouveau tableau."],
  [/async|await|fetch|promesse|promise/i, ["fetch", "async function"], "await seulement dans une fonction async, et un try/catch autour."],
  [/ES6|fl[ée]ch[ée]e|destructur|modules?\b|import|export|template literal/i, ["arrow functions", "destructuring", "modules JavaScript"], ""],
  [/doctype|structure (?:de base )?d.une page|\bhead\b|\bbody\b/i, ["structure document HTML"], ""],
  [/fonctions?\b|param[èe]tres?|return/i, ["fonction paramètres return"], "une fonction fait une seule chose et renvoie son résultat avec return."],
  [/\bgit\b|commits?|branches?|pull request|merge/i, ["git branch", "pull request GitHub", "conventional commits"], "un commit par petite étape, avec un message clair."],
  [/README|documentation/i, ["README GitHub exemple"], ""],
  [/flex|centr/i, ["flexbox", "justify-content", "align-items"], ""],
  [/\bgrid\b/i, ["CSS grid", "grid-template-columns"], ""],
  [/margin|padding|bo[îi]te|border/i, ["box model", "margin", "padding"], ""],
  [/responsive|media|breakpoint/i, ["media queries", "mobile first"], ""],
  [/s[ée]mantique|header|footer|<main>/i, ["balises sémantiques HTML"], ""],
  [/\bSQL\b|jointure|requ[êe]te/i, ["SQL JOIN", "SQL WHERE", "SQL GROUP BY"], ""],
];
/** What to look up and what to pay attention to, about a point to learn (« Cherche … Attention : … »). */
export function guideOf(text: string): string {
  const g = GUIDE.find(([rx]) => rx.test(text));
  if (!g) return "";
  const q = g[1].map((x) => `« ${x} »`);
  return `Cherche ${q.length > 1 ? `${q.slice(0, -1).join(", ")} et ${q[q.length - 1]}` : q[0]}.${g[2] ? ` Attention : ${g[2]}` : ""}`;
}

const LEARN_MORE: [RegExp, string][] = [
  [/relations?|hasMany|belongsTo|hasOne|cl[ée] [ée]trang[èe]re/i, "définir hasMany et belongsTo dans les modèles et placer la clé étrangère du bon côté"],
  [/migrations?/i, "créer une table avec Schema::create() et comprendre le rôle de up() et down()"],
  [/fillable|mass assignment/i, "protéger les champs remplis en masse avec $fillable"],
  [/eager|\bwith\(/i, "charger les relations en une seule requête avec with()"],
  [/passage de donn|donn[ée]es? (?:à|vers) la vue|compact/i, "envoyer des données du contrôleur à la vue avec view() et compact()"],
  [/composer.*artisan|artisan.*composer/i, "Composer installe les dépendances, Artisan est la ligne de commande de Laravel"],
  [/\broutes?\b|routing/i, "écrire une route avec Route::get(), avec un paramètre, puis vers un contrôleur"],
  [/contr[ôo]leurs?/i, "créer un contrôleur dont chaque méthode traite une route et retourne une vue"],
  [/\bblade\b/i, "afficher des données et réutiliser un layout avec Blade"],
  [/eloquent/i, "lire et enregistrer des données avec les modèles Eloquent"],
  [/useState|\bétat\b/i, "garder et modifier l’état d’un composant avec useState"],
  [/useEffect/i, "lancer un effet au bon moment avec useEffect"],
  [/\bprops\b/i, "transmettre des données d’un composant parent à son enfant avec les props"],
  [/dockerfile|conteneur|docker/i, "écrire un Dockerfile et lancer les services avec docker compose"],
  [/devtools|inspecteur|console/i, "lire le HTML, le CSS appliqué et les erreurs dans les outils de développement du navigateur"],
];
const LV_W: Record<string, number> = { faible: 4.6, moyen: 4.2, bon: 3, excellent: 2 };
const FILLER = /^(le|la|les|l['’]|du|de|des|d['’]|et|en|à|au|aux|sur|revoir|travail|projet|bien|son|sa|ses|utilisation|ma[iî]trise|notion|notions|bases?)$/i;
/** A named subject a point is about (Tailwind, the planning, Laravel…): only those the CONCEPTS don't cover. */
const topicOf = (text: string) => SUBJECTS.find((x) => x.rx && x.essentials && x.rx.test(text) && !["HTML", "CSS"].includes(x.name)) || null;
// a remark about the code itself (not a feature of the project)
const CAMEL = /\b[a-z]+[A-Z]\w*\b|\(\)|::|->|\$\w/;
const TECH = /syntaxe|fonction|méthode|variable|classe|objet|requête|commande|algorithme|logique|framework|biblioth[èe]que|paquet|module|import|export|erreur|debug|\btypes?\b|compil|\btests?\b/i;
/** A point that only names its subject (« planification à revoir », « revoir Tailwind », « Git »). */
function vague(fact: string, s: Subject): boolean {
  const words = fact.replace(/['’]/g, "’ ").split(/\s+/).filter((w) => w && !FILLER.test(w.replace(/’$/, "’")) && !FILLER.test(w));
  return words.length <= 1 && words.every((w) => !!s.rx && s.rx.test(w));
}
/** A concept label said as a title: « les sélecteurs CSS (balise, classe, id) » → « les sélecteurs CSS ». */
/** The teacher's note about the learner (« il met pas de description ») said to them (« tu ne mets pas de description »). */
export function toTu(t: string): string {
  const IRR: Record<string, string> = { a: "as", est: "es", peut: "peux", sait: "sais", fait: "fais", met: "mets", doit: "dois", veut: "veux", prend: "prends", comprend: "comprends", connaît: "connais", connait: "connais", va: "vas", voit: "vois", lit: "lis", écrit: "écris", ecrit: "écris" };
  const verb = (v: string) => IRR[v.toLowerCase()] ?? (/e$/.test(v) ? v + "s" : v);
  return t
    .replace(/\b(?:il|elle)\s+n['’]\s*(\S+)/gi, (_, v) => `tu n’${verb(v)}`)
    .replace(/\b(?:il|elle)\s+ne\s+(\S+)/gi, (_, v) => `tu ne ${verb(v)}`)
    .replace(/\b(?:il|elle)\s+(\S+)\s+pas\b/gi, (_, v) => `tu ${/^[aeiouéèêh]/i.test(v) ? "n’" : "ne "}${verb(v)} pas`)
    .replace(/\b(?:il|elle)\s+(\S+)/gi, (_, v) => `tu ${verb(v)}`)
    .replace(/\b(son|sa|ses)\b/gi, (m) => ({ son: "ton", sa: "ta", ses: "tes" } as any)[m.toLowerCase()]);
}
const titleOf = (label: string) => label.replace(/\s*\([^)]*\)/g, "").trim();
/**
 * What the learner still has to learn, said directly (never a category: « HTML », « CSS »…), from the most important:
 * the teacher's remarks, the Fiche niveaux's items not known (the lowest level first), the oral questions not answered,
 * the notions missed in the assessments and mises en situation, the live task. The same notion from several sources is
 * one point, and goes up. Each point: what to learn, then in a few words what it is about (its notion, or for a subject
 * only named — « planification à revoir » — its essentials, without what the learner already showed).
 */
export function toLearnOf(o: { fromRemarks: string[]; gaps: { code?: string; text: string; level: string }[]; oral: { q: string; a: string; notion: string }[]; ko: string[]; remarks: string; mastered?: string; task?: string[]; lang?: string }): ToLearn[] {
  const M = o.mastered || "";
  type P = { title: string; cs: string[]; topic: Subject | null; vague: boolean; from: string[]; w: number; i: number };
  const ps: P[] = [];
  const add = (fact: string, ctx: string, from: string, w: number) => {
    const raw = clean(fact, 140);
    if (!raw) return;
    const isLabel = from === "evaluation" && !!LEARN[raw];
    const title = from === "remarque" ? toTu(raw.charAt(0).toUpperCase() + raw.slice(1)) : isLabel ? titleOf(raw) : titleOf(raw).replace(/^(?:L['’]|(?:Le|La|Les|Un|Une|Des|Du)(?=\s))/, (x) => x.toLowerCase());
    const topic = topicOf(raw);
    const cs = conceptsOf(`${raw} ${raw.split(/\s+/).length <= 3 ? ctx : ""}`).filter((c: string) => LEARN[c]);
    // a point with nothing technical to learn (a feature of the project: « la page grimoire »): not here
    // (but the teacher's note that the project is incomplete, and what is missing, stays)
    if (!topic && !cs.length && (from === "tache" || (from === "remarque" && !TECH.test(raw) && !CAMEL.test(raw) && !/incompl|manqu|absent|pas (?:fini|termin|impl[ée]ment)|non (?:fini|termin)/i.test(raw)))) return;
    const same = ps.find((p) => p.title.toLowerCase() === title.toLowerCase() || saidIn(title, p.title) || saidIn(p.title, title) ||
      (!!topic && p.topic === topic && (p.vague || vague(raw, topic))) || (cs.length > 0 && cs[0] === p.cs[0]));
    if (same) {
      same.w = Math.max(same.w, w) + 0.5;
      if (!same.from.includes(from)) same.from.push(from);
      for (const c of cs) if (!same.cs.includes(c)) same.cs.push(c);
      // the teacher's words win over a label; a vague mention gets the precise one
      if (same.vague && !(topic && vague(raw, topic))) { same.title = title; same.vague = false; }
      // the teacher's two words (« JS DOM ») give way to their precise note (« la manipulation du DOM »)
      else if (from === "remarque" && same.from[0] === "remarque" && same.title.split(/\s+/).length <= 2 && title.split(/\s+/).length > 2) same.title = title;
      return;
    }
    ps.push({ title, cs, topic, vague: !!topic && vague(raw, topic), from: [from], w, i: ps.length });
  };
  // the teacher's notes first, as written; a list « les sélecteurs, les événements et la manipulation du DOM »: one point each
  for (const n of o.fromRemarks) {
    const parts = n.split(/\s*,\s*|\s+et\s+/).map((x) => x.trim()).filter(Boolean);
    if (n.includes(",") && !/[()]/.test(n) && parts.length > 1 && parts.every((x) => x.split(/\s+/).length <= 4)) parts.forEach((x, k) => add(x, "", "remarque", 5 - k * 0.01));
    else add(n, "", "remarque", 5);
  }
  for (const g of o.gaps) add(g.text, "", "fiche", LV_W[g.level] ?? 2);
  for (const q of o.oral) { const n = q.notion || q.q; if (n && !saidIn(n, o.remarks)) add(n, `${q.q} ${q.a}`, "oral", 3.8); }
  o.ko.forEach((k, i) => { if (!saidIn(k, o.remarks)) add(k, "", "evaluation", 3.4 - i * 0.1); });
  for (const t of o.task || []) add(t, "", "tache", 3.6);
  // the teacher's notes first, in the order they wrote them; then the rest, the most important first
  const own = (p: P) => (p.from[0] === "remarque" ? 1 : 0);
  return ps.sort((a, b) => own(b) - own(a) || (own(a) ? a.i - b.i : b.w - a.w || a.i - b.i)).slice(0, 8).map((p) => {
    const ess = p.topic?.essentials ? p.topic.essentials.filter((e) => !e.m || !e.m.test(M)).map((e) => e.t) : [];
    const title = p.vague && p.topic ? p.topic.title || p.topic.name : cap(p.title);
    // what it is about: a subject only named → its essentials; else its notion (said once, if the title doesn't already)
    const more = LEARN_MORE.find(([rx]) => rx.test(p.title));
    const about = p.vague && ess.length ? andList(ess) : p.cs.length && !saidIn(LEARN[p.cs[0]], p.title) ? LEARN[p.cs[0]] : more && !saidIn(more[1], p.title) ? more[1] : "";
    return { notion: title, why: about, how: guideOf(p.title) || guideOf(about) || (() => { const q = title.replace(/\s*\([^)]*\)/g, "").replace(/^(?:les?|la|l['’]|des?|du)\s*/i, "").trim(); return q.split(/\s+/).length <= 4 && familyOf(q) && !/incompl|manqu|absent|pas fini|non fait/i.test(q) ? `Cherche « ${familyOf(`${title} ${about}`) === "php" ? "Laravel " : ""}${q} ».` : ""; })(), from: p.from, w: p.w };
  });
}

// ------------------------------------------------------------------ the sprint's subjects
// A comment teaches what the brief's sprint is about: in a JavaScript sprint, never HTML or CSS (a notion the assessment
// touched, but not the sprint's). The teacher's own remarks are always kept. Git, planning, method: always.
const FAMILY: [string, RegExp][] = [
  ["javascript", /JavaScript|\bJS\b|\bDOM\b|querySelector|addEventListener|createElement|appendChild|classList|événement|localStorage|\bfetch\b|\bES6|fonction fléchée|forEach|NodeList|HTMLCollection|textContent|innerHTML|preventDefault|\bconsole\b|\bvariables?\b|\bboucles?\b|\bfonctions?\b/i],
  ["php", /\bPHP\b|Laravel|Eloquent|Blade|Artisan/i],
  ["sql", /\bSQL\b|jointure|base de données|MySQL|PostgreSQL/i],
  ["css", /\bCSS\b|Tailwind|Flexbox|\bflex\b|\bgrid\b|margin|padding|modèle de boîte|positionnement|media quer|responsive|couleurs?\b|typographie|polices?\b|centrage/i],
  ["html", /\bHTML\b|balises?\b|sémantique|<[a-z]+>|attribut alt|doctype/i],
];
/** The subject of a notion (javascript, css, html…), or null when it is about none (Git, planning, method). */
export function familyOf(text: unknown): string | null {
  const t = String(text || "");
  return FAMILY.find(([, rx]) => rx.test(t))?.[0] ?? null;
}
/** The subjects the sprint is about (its title, objectives, technologies), or null when unknown (nothing removed then). */
export function sprintFamilies(text: unknown): Set<string> | null {
  const t = String(text || "").trim();
  if (!t) return null;
  const f = new Set(FAMILY.filter(([, rx]) => rx.test(t)).map(([k]) => k));
  // « interfaces web » sprints without a word on HTML/CSS: still HTML and CSS
  if (!f.size) return null;
  return f;
}
const inSprint = (fam: Set<string> | null, text: unknown) => { if (!fam) return true; const k = familyOf(text); return !k || fam.has(k); };

/**
 * The sections of the comment, from the teacher's decisions only. `states`: the switches (saved or on the screen);
 * `member`: in a squad, a member's own competencies and note (their one-to-one), when the teacher set them.
 */
export function commentData(o: { first?: string; group?: string; project: string; rec: any; states?: any; uid?: string | null; member?: { uid?: string; co?: Record<string, boolean>; note?: string; level?: string } | null }): CommentData {
  const rec = o.rec || {};
  const st = reviewStates({ ...rec, final: o.states ?? rec.final });
  // a skipped step (the requirements, or the live check) isn't in the comment
  const ex: any[] = st.skip.project ? [] : (rec.result && rec.result.exigences) || [];
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
  const oral: any[] = st.skip.live ? [] : rec.oral || [];
  const oralMissed = uniq(oral.filter((q, i) => !st.oral[i]).map((q) => clean(q.notion || q.q, 140)));
  // the teacher's own words (each fact they noted), the AI's summary of them only when they can't be read
  const ownNotes = remarkNotions(remarks);
  const fromRemarks = ownNotes.length ? ownNotes : Array.isArray(R.toReview) && R.positive !== undefined ? R.toReview.map((x: unknown) => low(clean(x, 140))).filter(Boolean) : [];
  // one learner (a squad member, or alone): their assessment says what they mastered; a squad: the project only
  const assess = o.group ? null : assessFacts(rec, o.member?.uid ?? o.uid ?? null);
  const memberOnly = !o.group && !!o.member;
  const mode: CommentData["mode"] = o.group ? "group" : assess ? "assess" : "project";
  // the Fiche niveaux's items not known yet (sent by the debrief page with the switches): one learner only
  // the Fiche's items this learner missed in THIS brief (debrief.ts briefGaps): never the sprint's items in general
  // (a list saved before that check has no « seen »: not used)
  const gaps: { code?: string; text: string; level: string }[] = !o.group && !o.member && Array.isArray(rec.level?.gaps) ? rec.level.gaps.filter((x: any) => x && x.seen === true) : [];
  // what they showed they master (the assessment, the oral questions answered, the remarks' good points): left out of the tips
  const mastered = [...(assess ? assess.ok : []), ...oral.filter((q, i) => st.oral[i]).map((q) => `${q.notion || ""} ${q.q || ""}`), String(R.positive || ""),
    ...remarks.split(/(?<=[.!?;])\s+|\n+|,?\s+(?:mais|par contre|cependant|en revanche|toutefois)\s+/i).filter((x) => x && !NEGATIVE.test(x))].join("\n");
  // the live task (mise en situation in the debrief) not done: the gaps the teacher wrote about it
  const task = !st.skip.live && st.mes && ["non_valide", "partiel"].includes(st.mes.r) ? remarkNotions(st.mes.note) : [];
  // the brief's language: the general notions (functions, loops…) are said in it
  const lang = /\bphp\b|laravel|eloquent|\bblade\b|symfony|\bpdo\b/i.test([o.project, remarks, ...items.map((x) => x.texte), ...oral.map((q) => q.q || ""), ...((rec.assess || []) as any[]).map((a) => a?.title || "")].join("\n")) ? "PHP" : "JavaScript";
  // the sprint's subjects: what is outside them (HTML/CSS in a JavaScript sprint) is never said — the teacher's remarks always are
  const fam = sprintFamilies(rec.sprintText);
  const toLearn = toLearnOf({ fromRemarks, gaps, ko: assess ? assess.ko : [], remarks, mastered, task, lang,
    oral: oral.filter((q, i) => !st.oral[i]).map((q) => ({ q: String(q.q || ""), a: String(q.a || ""), notion: String(q.notion || "") })) })
    .filter((x) => x.from.includes("remarque") || inSprint(fam, `${x.notion} ${x.why}`));
  const notions = toLearn.map((x) => x.notion);
  // outside the sprint, still allowed: what the teacher wrote, and the points to learn kept (the teacher's)
  const keep = new Set<string>(conceptsOf([remarks, ...toLearn.map((x) => `${x.notion} ${x.why} ${x.how}`)].join("\n")));
  // what the comment may talk about: the notions of the brief, of the assessment's questions, of the exchange
  const scope = uniq([
    ...conceptsOf([o.project, ...items.map((x) => x.texte), remarks, ...oral.map((q) => `${q.q || ""} ${q.notion || ""}`), ...oral.filter((q, i) => !st.oral[i]).map((q) => String(q.a || "")), ...fromRemarks, ...gaps.map((x) => x.text), ...toLearn.map((x) => `${x.why} ${x.how}`)].join("\n")),
    ...((rec.assess || []) as any[]).flatMap((a) => (Array.isArray(a?.scope) ? a.scope : [])),
    ...(assess ? [...assess.ok, ...assess.ko] : []),
  ]).filter((c: string) => inSprint(fam, c) || keep.has(c));
  // a squad member: their own level (members.ts), else the debrief's
  const lv = o.member?.level || (rec.level && (rec.level.lvl || rec.level.prop)) || debriefLevel(rec, st) || "";
  return {
    first: String(o.first || "").trim(), greeting: o.group ? `Bonjour ${o.group},` : `Bonjour${o.first ? ` ${o.first}` : ""},`,
    project: clean(o.project, 120), group: !!o.group, team: String(o.group || "").trim(), level: lv,
    off: fam ? FAMILY.map(([k]) => k).filter((k) => !fam.has(k)) : [],
    allDone: stories.length > 0 && okStories === stories.length,
    partDone: stories.length > 0 && okStories / stories.length >= 0.5,
    themes: themesOf(items.filter((x) => STRONG.includes(x.type) && x.ok).map((x) => x.texte)),
    strengths: uniq(strong).slice(0, 12),
    comps,
    bonus: memberOnly ? [] : uniq(items.filter((x) => x.type === "bonus" && x.ok).map((x) => low(storyCore(x.texte)))).slice(0, MAX.bonus),
    improve: memberOnly ? [] : uniq(items.filter((x) => TODO.includes(x.type) && !x.ok).map((x) => clean(x.texte, 400))).slice(0, MAX.improve),
    notions, toLearn, remarks, oralMissed, mode,
    mastered: o.group ? [] : uniq([...(assess ? assess.ok : []), ...oral.filter((q, i) => st.oral[i]).map((q) => String(q.notion || ""))]
      .filter((x) => inSprint(fam, x))
      .map((x) => clean(x, 80).replace(/\s*\([^)]*\)/g, "").replace(/^(?:L['’]|(?:Le|La|Les|Un|Une|Des|Du)(?=\s))/, (w) => w.toLowerCase())).filter(Boolean)).filter((x, i, a) => !a.slice(0, i).some((y) => saidIn(x, y) || saidIn(y, x)))
      // never said mastered when it is in what to learn (the same words, or the same notion)
      .filter((x) => !toLearn.some((t) => saidIn(x, t.notion) || saidIn(t.notion, x) || conceptsOf(x).some((c: string) => conceptsOf(`${t.notion} ${t.why}`).includes(c)))).slice(0, 4), memberOnly, assess, proj: o.group ? projectFacts(rec, st) : null, scope,
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
/** One learner's opening from their assessment: the verdict, then what they showed they master (never the project's features). */
function openingAssess(d: CommentData): string {
  const a = d.assess!, lv = levelOf(d), s: string[] = [];
  s.push({ excellent: "Excellent travail.", bon: "Ton travail est globalement bien réalisé.", moyen: "Ton travail est correct dans l’ensemble, mais certains points restent à consolider.",
    faible: "Ton travail est encore fragile : plusieurs aspects importants restent à renforcer.", critique: "Ton travail est encore loin de ce qui est attendu dans ce brief." }[lv]);
  const ok = a.ok.slice(0, 3);
  // never which competencies are validated: what they showed they master, in plain words
  if (ok.length) s.push(`Tu maîtrises déjà ${andList(ok)}.`);
  if (d.positive) s.push(cap(d.positive));
  if (d.bonus.length) s.push(`Tu as aussi réalisé ${d.bonus.length > 1 ? "des bonus" : "un bonus"}, ce qui est une très bonne initiative.`);
  return s.join(" ");
}
/** A squad: the project beyond its features (interface, planning, README, commits, team). */
function projectPara(d: CommentData): string {
  const p = d.proj;
  if (!p || (!p.good.length && !p.bad.length)) return "";
  // each part said as French says it, praised or to improve
  const SAY: [RegExp, string, string][] = [
    [/^Interface/, "l’interface et l’expérience utilisateur", "l’interface et l’expérience utilisateur"],
    [/^Planification/, "la planification", "la planification du projet"],
    [/^README/, "la documentation (README)", "la documentation du projet (README)"],
    [/^Commits et Git/, "l’utilisation de Git", "la régularité des commits"],
    [/^Messages de commit/, "des messages de commit clairs", "les messages de commit"],
    [/^Répartition/, "une bonne répartition du travail", "la répartition du travail entre les membres"],
    [/^Travail en équipe/, "le travail en équipe avec Git (pull requests, revues)", "le travail en équipe avec Git"],
  ];
  const say = (x: string, good: boolean) => { const m = SAY.find(([rx]) => rx.test(x)); return m ? m[good ? 1 : 2] : low(x.split(" : ")[0]); };
  const s: string[] = [];
  const g = uniq(p.good.map((x) => say(x, true))).slice(0, 3), b = uniq(p.bad.map((x) => say(x, false))).slice(0, 3);
  if (g.length) s.push(`Sur la réalisation du projet, plusieurs points sont réussis : ${andList(g)}.`);
  if (b.length) s.push(`Il faut en revanche améliorer ${andList(b)}.`);
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
  const L = d.toLearn && d.toLearn.length ? d.toLearn : [];
  if (!L.length) return "";
  // « Le modèle… » → « le modèle… », « Écrire… » → « écrire… »; never a name (Git, Tailwind, Flexbox…)
  const lc = (t: string) => (/^(?:(?:Le|La|Les|Un|Une|Des|Du|De|Ce|Cette|Ces|Son|Sa|Ses)\s|L[’']|[A-ZÀ-Ý][a-zà-ÿ]{2,}(?:er|ir|re)\s)/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  if (d.group) {
    const items = L.map((x) => `${lc(String(x.notion))}${x.why && !saidIn(x.why, x.notion) ? ` (${lc(String(x.why)).replace(/[.\s]+$/, "")})` : ""}`);
    return `Ce que vous devez encore travailler en priorité, c’est ${andList(items)}.`;
  }
  // one learner: each point in its own paragraph (no numbers): what it is, then what to do and what to look up
  const one = (x: ToLearn) => {
    // what it is (the teacher's or the corrector's words), unless the advice already says it
    const words = (t: string) => (t.toLowerCase().match(/[a-zà-ÿ]{5,}/g) || []);
    const ww = words(String(x.why || "")), hw = new Set(words(String(x.how || "")));
    const repeats = ww.length > 0 && ww.filter((w) => hw.has(w)).length / ww.length >= 0.5;
    // never an explanation: the point, then what to look up and what to pay attention to (the explanation only without them)
    const what = !x.how && x.why && !saidIn(x.why, x.notion) && !repeats ? ` : ${lc(String(x.why)).replace(/[.\s]+$/, "")}.` : ".";
    return `${cap(String(x.notion).replace(/[.\s]+$/, ""))}${what}${x.how ? ` ${cap(x.how)}` : ""}`;
  };
  return [`Ce que tu dois encore travailler en priorité, point par point :`, ...L.map(one)].join("\n\n");
}
// a tip is written with « tu »: a squad's comment says « vous »
const VOUS_OF: Record<string, string> = { réécris: "réécrivez", relie: "reliez", construis: "construisez", ajoute: "ajoutez", crée: "créez", reproduis: "reproduisez", reprends: "reprenez", écris: "écrivez", dessine: "dessinez", compare: "comparez", refais: "refaites", pars: "partez", mets: "mettez", entraîne: "entraînez", récupère: "récupérez", comprends: "comprenez", parcours: "parcourez", manipule: "manipulez", explique: "expliquez", enregistre: "enregistrez", modélise: "modélisez", travaille: "travaillez", teste: "testez", fais: "faites", vérifie: "vérifiez", nomme: "nommez", passe: "passez", observe: "observez", appelle: "appelez", relis: "relisez", utilise: "utilisez", gère: "gérez", convertis: "convertissez", fusionne: "fusionnez", présente: "présentez", demande: "demandez", corrige: "corrigez", renomme: "renommez", range: "rangez", simplifie: "simplifiez", remplace: "remplacez", cherche: "cherchez", garde: "gardez", transforme: "transformez" };
const W = "A-Za-zÀ-ÿ’'";
function toVous(t: string): string {
  return t.replace(new RegExp(`(?<![${W}])(${Object.keys(VOUS_OF).join("|")})(?![${W}])`, "gi"), (w) => {
    const v = VOUS_OF[w.toLowerCase()];
    return w.charAt(0) === w.charAt(0).toUpperCase() ? cap(v) : v;
  }).replace(/-toi\b/g, "-vous").replace(/(?<![A-Za-zÀ-ÿ])t[’']/g, "vous ").replace(/(?<![A-Za-zÀ-ÿ])tes(?![A-Za-zÀ-ÿ])/g, "vos").replace(/(?<![A-Za-zÀ-ÿ])t(?:on|a)(?![A-Za-zÀ-ÿ])/g, "votre").replace(/(?<![A-Za-zÀ-ÿ])tu(?![A-Za-zÀ-ÿ])/g, "vous");
}
function closingOf(d: CommentData): string {
  const lv = levelOf(d), clean = (!d.group || !d.improve.length) && !d.notions.length, who = !d.group && d.first ? `${d.first}, ` : "";
  if (lv === "excellent") return clean ? Y(d, "Continue comme ça.", "Continuez comme ça.") : Y(d, "Dans l’ensemble, c’est un excellent travail. Consolide ces quelques points et continue sur cette lancée.", "Dans l’ensemble, c’est un excellent travail. Consolidez ces quelques points et continuez sur cette lancée.");
  if (lv === "bon") return clean ? Y(d, "C’est un bon travail, continue sur cette lancée.", "C’est un bon travail, continuez sur cette lancée.") : Y(d, "Dans l’ensemble, c’est un bon travail. Continue sur cette lancée, consolide ces quelques points, et tu vas encore gagner en solidité.", "Dans l’ensemble, c’est un bon travail. Continuez sur cette lancée, consolidez ces quelques points, et vous allez encore gagner en solidité.");
  if (lv === "moyen") return Y(d, "C’est un travail correct. En reprenant ces points, tu vas rapidement gagner en solidité.", "C’est un travail correct. En reprenant ces points, vous allez rapidement gagner en solidité.");
  if ((lv === "faible" || lv === "critique") && methodPara(d)) return cap(`${who}${Y(d, "en reprenant ces bases sérieusement, tu peux rattraper ton retard rapidement.", "en reprenant ces bases sérieusement, vous pouvez rattraper votre retard rapidement.")}`);
  if (lv === "faible") return cap(`${who}${Y(d, "il faut maintenant consolider ton socle. Avec un travail régulier et ciblé sur ces points, tu vas gagner en confiance et en qualité.", "il faut maintenant consolider votre socle. Avec un travail régulier et ciblé sur ces points, vous allez gagner en confiance et en qualité.")}`);
  return cap(`${who}${Y(d, "il faut reprendre les bases avant d’aller plus loin. Prends le temps de travailler ces points régulièrement : c’est comme ça que tu vas réellement progresser.", "il faut reprendre les bases avant d’aller plus loin. Prenez le temps de travailler ces points régulièrement : c’est comme ça que vous allez réellement progresser.")}`);
}
const greetingOf = (d: CommentData) => (d.group && d.team ? `${d.team},` : d.first && !d.group ? `${d.first},` : "Bonjour,");
/** The comment as a template: always available (and the fallback when the AI can't write it). */
export function commentText(d: CommentData): string {
  if (d.group) return [greetingOf(d), opening(d), projectPara(d), missingPara(d), notionsPara(d), closingOf(d)].filter(Boolean).join("\n\n");
  // one learner: what they can and can't do technically (never the brief's deliverables or features)
  return [greetingOf(d), learnerOpening(d), notionsPara(d), methodPara(d), closingOf(d)].filter(Boolean).join("\n\n");
}
const VERDICT: Record<string, string> = {
  excellent: "Excellent travail : tu as une très bonne compréhension des notions de ce brief et tu sais les expliquer.",
  bon: "Ton travail est globalement bien réalisé : l’essentiel est maîtrisé, il reste quelques points à préciser.",
  moyen: "Ton travail est correct dans l’ensemble : les bases sont là, mais certains points ne sont pas encore assez solides.",
  faible: "Ton travail est encore fragile : tu connais une partie des notions, mais plusieurs bases ne sont pas encore solides.",
  critique: "Ton travail est encore loin de ce qui est attendu dans ce brief : les bases ne sont pas encore en place.",
};
/** One learner: an honest verdict, then what they master (the assessments, the oral questions, the one-to-one). */
function learnerOpening(d: CommentData): string {
  const s = [VERDICT[levelOf(d)] || VERDICT.moyen];
  if (d.mastered.length) s.push(`${["excellent", "bon"].includes(levelOf(d)) ? "Tu maîtrises notamment" : "Tu maîtrises déjà"} ${andList(d.mastered)}.`);
  if (d.positive) s.push(cap(d.positive));
  return s.join(" ");
}
/** In difficulty with several points: how to work (practice, the documentation), like the teacher says it. */
function methodPara(d: CommentData): string {
  const lv = levelOf(d);
  if (!["faible", "critique"].includes(lv) || d.toLearn.length < 2) return "";
  return "Le plus important maintenant, c’est la pratique : écris le code toi-même chaque jour, sans copier, refais les mêmes exercices jusqu’à ne plus hésiter, et appuie-toi sur la documentation officielle.";
}
/** The debrief's comment from the switches: one student, or a squad (« vous » for everyone). */
export function buildComment(firstName: string, rec: any, states?: any): string {
  return commentText(commentData({ first: firstName, group: rec && rec.squad ? rec.squad.name : "", project: String((rec && rec.brief) || ""), rec, states }));
}
/** A squad member's own comment: the squad's work, their own competencies and note (else the squad's remarks). */
export function memberCommentData(m: any, rec: any, ms: any): CommentData {
  return commentData({ first: firstNameOf(m.name, m.login), project: String((rec && rec.brief) || ""), rec,
    member: { uid: String(m.gid), co: ms && ms.co, note: ms && ms.note, level: (() => { const l = memberLevelOf(rec, String(m.gid)); return l.lvl || l.prop; })() } });
}
export function memberComment(m: any, rec: any, ms: any): string {
  return commentText(memberCommentData(m, rec, ms));
}
export const wordCount = (t: string) => (String(t).match(/[A-Za-zÀ-ÿ0-9’'-]+/g) || []).length;

// ------------------------------------------------------------------ the AI: writes it like the teacher, from the debrief only
export const AI_COMMENT_SYSTEM = [
  "Tu aides un formateur en développement web à rédiger le commentaire de débriefing d’un brief, envoyé à l’apprenant.",
  "Tu reçois ce que le formateur a DÉCIDÉ pendant le débriefing. Écris le commentaire comme LUI l’écrirait : un message humain, direct, clair et COURT (250 mots au plus), qui aide l’apprenant à progresser.",
  "Son style (exemple d’un de ses commentaires INDIVIDUELS, à imiter pour le ton et la construction, jamais pour le contenu) :",
  "<<<",
  "Ton travail montre que tu connais la surface de Laravel, mais pas encore sa structure. Tu sais ce que sont Blade et Artisan, tu écris des routes simples et tu passes des variables à une vue avec compact().",
  "",
  "Ce que tu dois encore travailler en priorité, ce sont les relations Eloquent (le rôle de $fillable, l’eager loading avec with() et le sens de hasMany et belongsTo) et les migrations (la structure de Schema::create() et le rôle de up() et down()).",
  "",
  "Le plus important maintenant, c’est la pratique : écris le code toi-même chaque jour, sans copier, et appuie-toi sur la documentation officielle.",
  "",
  "En reprenant ces bases sérieusement, tu peux rattraper ton retard en quelques semaines.",
  ">>>",
  "Règles strictes :",
  "- Tutoiement (« tu », « ton », « tes »), sauf si le commentaire est pour toute une équipe : alors « vous ».",
  "- Pas de salutation (le prénom est ajouté avant ton texte), pas de « Cordialement », pas de titres de section, aucune liste (ni puces, ni numéros : uniquement des paragraphes), pas de mise en forme (**, #, `), pas d’emoji.",
  "- Le premier paragraphe donne un avis HONNÊTE qui correspond au NIVEAU donné, en une ou deux phrases : excellent → « Excellent travail », bon → « bon travail », moyen → « travail correct », faible → travail encore fragile, critique → les bases ne sont pas encore en place. Ne dis jamais « bon travail » ou « excellent » si le niveau est moyen, faible ou critique.",
  "- INDIVIDUEL : uniquement ce qu’il SAIT FAIRE et ne sait PAS ENCORE FAIRE techniquement, et ce que le formateur a noté en face à face. JAMAIS les livrables, les fonctionnalités, les pages ou les exigences du brief, ni les bonus. Dans le premier paragraphe, après l’avis, ce qu’il maîtrise : UNIQUEMENT ce qui est dans « CE QU’IL MAÎTRISE » (et ce qui va bien selon l’échange), en une phrase ; si c’est vide, ne dis RIEN de ce qu’il maîtrise. Le commentaire du correcteur sert seulement à préciser ce qu’il doit apprendre.",
  "- ÉQUIPE : parle du PROJET (fonctionnalités, interface, planification, README, commits, travail en équipe) : ce qui est réussi, ce qui manque encore (« il manque encore… », sans recopier la grille), ce qui est à améliorer. Bonus : s’il y en a, dis seulement qu’ils en ont réalisé, sans les lister ; sinon n’en parle pas.",
  "- Ne dis JAMAIS quelles compétences sont validées ou non (ni leur code, ni leur intitulé du référentiel).",
  "- CE QU’IL DOIT ENCORE APPRENDRE : c’est le cœur du commentaire quand il y en a. Annonce-le par « Ce que tu dois encore travailler en priorité, point par point : », puis UN court paragraphe par point (sans numéro ni puce), avec tous les points donnés, dans l’ORDRE donné (d’abord ce que le formateur a noté, avec SES faits précis : ce que l’apprenant n’a pas réussi à faire), sans en ajouter. Chaque paragraphe : le point, puis tel quel « Cherche « … » » et « Attention : … » donnés dans « quoi chercher et à quoi faire attention ». N’explique jamais la notion (pas de définition, pas de cours) et ne cite jamais de site ni de source (ni MDN, ni W3Schools, ni autre).",
  "- Ne dis JAMAIS d’où vient un point : pas de « à l’oral », « la question… », « lors de l’évaluation », « pendant l’échange », « en face à face », « mise en situation ».",
  "- Si l’apprenant est en difficulté (faible ou critique) avec plusieurs points, un court paragraphe sur la méthode : pratiquer chaque jour, écrire le code soi-même sans copier, s’appuyer sur la documentation officielle.",
  "- Si tout est maîtrisé et qu’il n’y a rien à travailler (« CE QU’IL DOIT ENCORE APPRENDRE : (rien) »), n’invente rien : pas de liste, pas de conseil général, deux ou trois phrases sur ce qu’il réussit suffisent. Un apprenant au niveau bon ou excellent n’a pas de points à apprendre en plus de ceux donnés, et jamais le conseil de pratiquer chaque jour sans copier.",
  "- PERSONNEL : chaque commentaire est propre à CET apprenant (ce qu’il a réussi et raté, ce que le formateur a noté de lui) ; jamais un texte qui pourrait être envoyé à toute la classe.",
  "- Dernier paragraphe : une conclusion encourageante et lucide, en une ou deux phrases. Tu peux y écrire {prénom} pour t’adresser à lui par son prénom (il sera remplacé).",
  "- N’invente RIEN : chaque phrase vient des éléments fournis. Aucun score, aucun code de compétence. Ne parle JAMAIS du niveau de l’apprenant (ni « niveau », ni Faible, Moyen, Bon, Critique…), ni de la fiche des niveaux, ni d’aucun outil ou document interne de la formation.",
  'Réponds UNIQUEMENT avec ce JSON : {"commentaire":"le texte, paragraphes séparés par une ligne vide"}',
].join("\n");
/**
 * One learner's comment: written by the AI from everything known about them — the teacher's notes first, then their
 * assessment's and mise en situation's real answers. Built on the teacher's own model of a good comment.
 */
export const AI_COMMENT_SYSTEM_SOLO = [
  "Tu aides un formateur en développement web à rédiger le commentaire de débriefing d’un brief, envoyé à UN apprenant.",
  "Le commentaire doit l’aider à progresser : PRÉCIS (ses vraies erreurs, pas des généralités), HONNÊTE et PERSONNEL. Un texte qui pourrait être envoyé à un autre apprenant est raté.",
  "Exemple d’un commentaire que le formateur juge bon (imite la construction, la précision et le ton, jamais le contenu) :",
  "<<<",
  "Ton évaluation montre une maîtrise correcte des bases théoriques de Laravel : tu sais que Blade est le moteur de template par défaut, que la configuration est dans le fichier .env et les routes web dans routes/web.php, tu crées un contrôleur avec make:controller, tu passes des variables d’un contrôleur à une vue et tu connais le rôle de $fillable et des méthodes up() et down() des migrations.",
  "",
  "Tes points faibles sont des erreurs de base et un manque de précision : tu crées un projet avec php artisan new au lieu de composer create-project, ta route welcome est incomplète (point-virgule manquant), tes flags pour créer modèle, contrôleur et migration sont faux, ta migration n’a pas de Schema::create, tu expliques User::with('posts')->get() comme un tableau associatif sans parler d’eager loading, et tu places belongsTo du mauvais côté de la relation.",
  "",
  "Tu as le potentiel pour avancer, mais il faut abandonner les approximations et viser la précision.",
  "",
  "Plan d’action",
  "",
  "Commandes et syntaxe : refais un projet avec composer create-project, puis les commandes Artisan make:model -mc et serve, en tapant chaque route jusqu’au point-virgule. Cherche « composer create-project laravel » et « artisan make:model options ».",
  "",
  "Relations Eloquent : écris hasMany d’un côté et belongsTo de l’autre, avec la clé étrangère du bon côté, puis charge-les avec with() et get(). Cherche « eloquent relationships » et « eager loading ».",
  ">>>",
  "Construction :",
  "1) Ce qu’il réussit, avec des exemples PRÉCIS, UNIQUEMENT à partir de « QUESTIONS ET EXERCICES RÉUSSIS », « CE QU’IL MAÎTRISE » et de ce que le formateur a noté de positif. S’il n’a rien réussi, n’écris PAS ce paragraphe et n’invente RIEN pour le remplir.",
  "2) Ses points faibles, précis : d’abord ce que le formateur a noté (ses faits à lui, avec ses mots, adressés à l’apprenant), puis les erreurs réelles de « QUESTIONS ET EXERCICES RATÉS » (ce qu’il a répondu ou fait, et ce qui était attendu), regroupées par thème. Jamais une erreur qui n’est pas dans les données.",
  "3) Une phrase de bilan, honnête et sans flatterie, qui correspond au NIVEAU.",
  "4) La ligne « Plan d’action », puis un court paragraphe par axe (3 à 5 axes, sans numéro ni puce), d’abord les points du formateur : « Thème : ce qu’il doit refaire concrètement. Cherche « … » et « … ». » Les recherches sont des NOTIONS à taper (comme dans « quoi chercher » des points à apprendre), jamais un nom de site ou de source (ni MDN, ni W3Schools, ni documentation de…).",
  "Règles strictes :",
  "- Tutoiement. Pas de salutation (le prénom est ajouté avant ton texte), pas de « Cordialement », pas de mise en forme (**, #, `), pas d’emoji, aucune liste à puces ni numérotée.",
  "- Uniquement le technique et ce que le formateur a noté : jamais les livrables, les fonctionnalités, les pages du brief, ni les bonus.",
  "- Ne parle JAMAIS des sujets marqués « HORS DU SPRINT », sauf si le formateur les a notés.",
  "- Aucun score, aucun pourcentage, aucun code ni intitulé de compétence, jamais le niveau (ni « niveau », ni Faible, Moyen, Bon, Critique), ni d’outil interne.",
  "- Ne dis « bon travail » ou « excellent » que si le niveau est bon ou excellent.",
  'Réponds UNIQUEMENT avec ce JSON : {"commentaire":"le texte, paragraphes séparés par une ligne vide"}',
].join("\n");
/** The system prompt for this comment: one learner, or a team. */
export const aiSystemOf = (d: CommentData) => (d.group ? AI_COMMENT_SYSTEM : AI_COMMENT_SYSTEM_SOLO);

/** The decisions for the AI (no name: the greeting is ours, the AI may write {prénom}). */
export function aiCommentPrompt(d: CommentData): string {
  const list = (a: string[]) => (a.length ? a.map((x) => `- ${x}`).join("\n") : "(aucun)");
  const missing = d.improve.map(missingOf).filter(Boolean).map((x) => x!.text);
  const remarks = `REMARQUES DU FORMATEUR APRÈS L’ÉCHANGE :\n${d.remarks ? `<<<\n${d.remarks.slice(0, 2000)}\n>>>` : "(aucune)"}`;
  const head = [`PROJET : « ${d.project} »${d.group ? " (commentaire pour toute l’équipe : « vous »)" : ""}`, `NIVEAU DÉCIDÉ PAR LE FORMATEUR : ${levelOf(d)}`,
    d.group ? `NOTIONS DU BRIEF ET DE L’ÉVALUATION (les SEULES notions techniques dont tu peux parler ; n’en cite aucune autre, même si le commentaire du correcteur en parle) :\n${list(d.scope)}`
      : `NOTIONS DU BRIEF ET DE L’ÉVALUATION :\n${list(d.scope)}`,
    ...(d.off && d.off.length ? [`SUJETS HORS DU SPRINT (n’en parle JAMAIS, ni en bien ni en mal, même si le correcteur en parle) : ${d.off.map((k) => k === "javascript" ? "JavaScript" : k.toUpperCase()).join(", ")}`] : [])];
  if (!d.group) {
    const a = d.assess;
    return [
      ...head,
      "TYPE DE COMMENTAIRE : INDIVIDUEL, TECHNIQUE. Parle uniquement de ce qu’il sait faire et ne sait pas encore faire techniquement, et de ce que le formateur a noté. Jamais les livrables, les fonctionnalités, les exigences du brief ni les bonus.",
      `CE QU’IL MAÎTRISE :\n${list(d.mastered)}`,
      `QUESTIONS ET EXERCICES RÉUSSIS (évaluation et mise en situation) :\n${list(a?.right || [])}`,
      `QUESTIONS ET EXERCICES RATÉS (question → sa réponse → attendu) :\n${list(a?.missed || [])}`,
      `COMMENTAIRE DU CORRECTEUR DE SON ÉVALUATION (pour préciser ce qu’il sait et ne sait pas faire ; jamais de score) :\n${a && a.summary ? `<<<\n${a.summary}\n>>>` : "(aucun)"}`,
      `CE QUI VA BIEN SELON L’ÉCHANGE : ${d.positive || "(rien de particulier)"}`,
      remarks,
      learnList(d),
    ].join("\n\n");
  }
  if (d.mode === "group") {
    const p = d.proj || { good: [], bad: [], team: [] };
    return [
      ...head,
      "TYPE DE COMMENTAIRE : ÉQUIPE. Parle du PROJET : fonctionnalités, interface et expérience utilisateur, planification, README et documentation, commits et travail en équipe. Ne parle pas de l’évaluation individuelle.",
      `FONCTIONNALITÉS : ${d.allDone ? "toutes réalisées" : d.partDone ? "la plupart réalisées" : "en partie seulement"}`,
      `FONCTIONNALITÉS DU BRIEF VALIDÉES :\n${list(d.strengths)}`,
      `THÈMES DE CES POINTS : ${d.themes.join(" ; ") || "(aucun)"}`,
      `BONUS RÉALISÉS : ${d.bonus.length ? `oui (${d.bonus.length})` : "aucun"}`,
      `CE QUI EST RÉUSSI DANS LE PROJET (interface, planification, README, commits) :\n${list(p.good)}`,
      `CE QUI EST À AMÉLIORER DANS LE PROJET (interface, planification, README, commits) :\n${list(p.bad)}`,
      `CONTRIBUTION DE CHAQUE MEMBRE (pour juger le travail en équipe, ne cite pas les chiffres) :\n${list(p.team)}`,
      `POINTS DU BRIEF NON VALIDÉS :\n${list(missing)}`,
      `CE QUI VA BIEN SELON L’ÉCHANGE : ${d.positive || "(rien de particulier)"}`,
      remarks,
      learnList(d),
    ].join("\n\n");
  }
  return [
    ...head,
    `FONCTIONNALITÉS : ${d.allDone ? "toutes réalisées" : d.partDone ? "la plupart réalisées" : "en partie seulement"}`,
    `POINTS DU BRIEF VALIDÉS :\n${list(d.strengths)}`,
    `THÈMES DE CES POINTS : ${d.themes.join(" ; ") || "(aucun)"}`,
    `BONUS RÉALISÉS : ${d.bonus.length ? `oui (${d.bonus.length})` : "aucun"}`,
    `POINTS DU BRIEF NON VALIDÉS :\n${list(missing)}`,
    `CE QUI VA BIEN SELON L’ÉCHANGE : ${d.positive || "(rien de particulier)"}`,
    remarks,
    learnList(d),
  ].join("\n\n");
}
/** What is still to learn, for the AI: in its order, with what was seen and how to work it. */
function learnList(d: CommentData): string {
  const L = d.toLearn || [];
  return `CE QU’IL DOIT ENCORE APPRENDRE (déjà classé du plus important au moins important ; garde cet ordre et tous les points) :\n${L.length
    ? L.map((x, i) => `${i + 1}. ${x.notion}${x.why ? ` — en quoi ça consiste : ${x.why}` : ""}${x.how ? ` — quoi chercher et à quoi faire attention : ${x.how}` : ""}`).join("\n") : "(rien)"}`;
}
/** The notions a comment talks about that are neither in the brief, nor in the assessment, nor in the exchange. */
export function outsideNotions(d: Pick<CommentData, "scope">, body: string): string[] {
  const scope = new Set(d.scope || []);
  return conceptsOf(body).filter((c: string) => !scope.has(c));
}
const MARKUP = /\*\*|(^|\n)\s*#|`|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const VOUS = /\b(vous|votre|vos)\b/i, TU = /\b(tu|ton|ta|tes|toi|t['’](?:as|es|en|y))\b/i;
/** The AI's comment, checked (form, tone, level, bonus, length) with our greeting; null when it doesn't follow the rules. */
/**
 * One learner's AI comment: only what really matters is checked — no list, no site, nothing outside the sprint, no score
 * nor level nor competency, no praise the level doesn't allow, and the teacher's own notes in it. The AI is free to name
 * the learner's real mistakes precisely (that is the point).
 */
const OFF_STRICT: Record<string, RegExp> = {
  css: /\bCSS\b|Tailwind|Flexbox|\bgrid\b|\bmargin\b|\bpadding\b|modèle de boîte|media quer|\bresponsive\b|typographie/i,
  html: /balises? sémantiques?|tableaux? HTML|listes? HTML|formulaires? HTML|structure (?:de base )?d['’]une page|doctype|\bW3C\b/i,
  php: /\bPHP\b|Laravel|Eloquent|Blade|Artisan/i,
  sql: /\bSQL\b|jointure|base de données|MySQL|PostgreSQL/i,
};
/** Why the AI's last comment was refused (for the second try and for the teacher), "" when it was kept. */
export let aiCommentWhy = "";
function soloCheck(d: CommentData, body: string): string | null {
  const no = (why: string) => { aiCommentWhy = why; return null; };
  const lines = body.split("\n");
  if (lines.some((l) => /^\s*(?:[–—•*-]|\d+[.)])\s/.test(l))) return no("it used a list (bullets or numbers)");
  if (/\bMDN\b|mozilla|w3schools|openclassrooms|stack ?overflow|css-tricks|youtube/i.test(body)) return no("it named a website");
  // a subject outside the sprint: its own notions (« margin », « Flexbox », « balises sémantiques »), not a word the DOM
  // shares with it (« la balise img », « un élément HTML », « HTMLCollection »)
  const off = (d.off || []).find((k) => { const rx = OFF_STRICT[k]; return !!rx && rx.test(body) && !rx.test(d.remarks || ""); });
  if (off) return no(`it talked about ${off.toUpperCase()}, outside the sprint`);
  if (/\d+\s*%/.test(body)) return no("it gave a score");
  if (/\bniveau\s+(?:est\s+|reste\s+)?(?:faible|moyen|bon|critique|excellent|insuffisant)|\b(?:ton|son|ce)\s+niveau\b|fiche (?:des )?niveaux|\bla fiche\b|classbot/i.test(body)) return no("it talked about the level or the Fiche");
  if (/\bC[T]?\d{1,2}(N\d)?\b/.test(body)) return no("it named a competency code");
  const lv = levelOf(d);
  if (lv !== "excellent" && /\bexcellent/i.test(body)) return no("it said « excellent » above the level");
  if (!["bon", "excellent"].includes(lv) && /\b(bon|très bon|beau) travail\b/i.test(body)) return no("it said « bon travail » above the level");
  if (/\bbonus\b/i.test(body)) return no("it talked about the bonus");
  if (!["faible", "critique"].includes(lv) && /sans copier|chaque jour|tous les jours/i.test(body)) return no("it gave the « practise every day » advice to a good learner");
  // the teacher's notes are in it (one of the main words of each)
  const notes = (d.toLearn || []).filter((x) => x.from.includes("remarque"));
  const missing = notes.filter((x) => { const w = String(x.notion).toLowerCase().match(/[a-zà-ÿ0-9]{5,}/g) || []; return w.length && !w.some((k) => body.toLowerCase().includes(k)); });
  if (missing.length > (notes.length >= 3 ? 1 : 0)) return no(`it left out the teacher's note « ${missing[0].notion} »`);
  const words = wordCount(body);
  if (words < 15 || words > 600) return no(words < 15 ? "it was too short" : "it was too long");
  aiCommentWhy = "";
  return `${greetingOf(d)}\n\n${body}`;
}
export function aiCommentText(d: CommentData, j: any): string | null {
  if (!j || typeof j !== "object") return null;
  let body = String(j.commentaire ?? "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!body) return null;
  const who = d.group ? d.team : d.first;
  body = who ? body.replace(/\{pr[ée]nom\}/gi, who) : body.replace(/\{pr[ée]nom\}\s*,\s*(\S)/gi, (_, c) => c.toUpperCase()).replace(/\s*\{pr[ée]nom\}/gi, "");
  if (MARKUP.test(body) || /^(bonjour|cordialement)/im.test(body) || /\{|\}/.test(body)) return null;
  if (d.group ? TU.test(body) : VOUS.test(body)) return null;
  if (!d.group) return soloCheck(d, body);
  // no section titles, no lists (neither bullets nor numbers): paragraphs only
  const lines = body.split("\n");
  if (lines.some((l) => /^\s*(?:[–—•*-]|\d+[.)])\s/.test(l) || (l.trim() && l.trim().length < 45 && !/[.:?!]$/.test(l.trim())))) return null;
  if (/à l['’]oral|la question «|lors de l['’]évaluation|pendant (?:notre|l['’])échange|face à face|mise en situation/i.test(body)) return null;
  // every point to learn said (one of its main words)
  const nL = (d.toLearn || []).length;
  const said = (d.toLearn || []).filter((x) => { const w = String(x.notion).toLowerCase().match(/[a-zà-ÿ0-9]{5,}/g) || []; return !w.length || w.some((k) => body.toLowerCase().includes(k)); }).length;
  if (nL >= 2 && said < nL - 1) return null;
  // never a site or a source (the student searches the concepts)
  if (/\bMDN\b|mozilla|w3schools|openclassrooms|stack ?overflow|css-tricks|youtube/i.test(body)) return null;
  // never a subject outside the brief's sprint (HTML, CSS in a JavaScript sprint)
  // (a subject the teacher wrote about in the one-to-one remarks stays allowed)
  if (!d.group && (d.off || []).some((k) => { const rx = FAMILY.find(([f]) => f === k)![1]; return k !== "javascript" && rx.test(body) && !rx.test(d.remarks || ""); })) return null;
  const lv = levelOf(d);
  // the « practise every day, without copying » advice is for a learner in difficulty, never a good one
  if (!["faible", "critique"].includes(lv) && /sans copier|chaque jour|tous les jours|documentation officielle/i.test(body)) return null;
  if (lv !== "excellent" && /excellent/i.test(body)) return null;
  // never the learner's level, nor the Fiche niveaux or any internal tool
  if (/\bniveaux?\b|\bfiche\b|\bcritique\b|\b(?:faible|moyen)\s*[,.]|classbot/i.test(body)) return null;
  if ((lv === "faible" || lv === "critique") && /\b(bon|très bon|beau) travail\b/i.test(body)) return null;
  if (!d.bonus.length && /bonus/i.test(body)) return null;
  // never which competencies were validated
  if (/(valid[ée]|acquis|atteint)[a-zé]*\s+(la |les |une |des |l['’]|ta |tes )?comp[ée]tence|comp[ée]tences?\s+(est |sont |a été |ont été |bien )?(valid|acquis)|\bC[T]?\d{1,2}(N\d)?\b/i.test(body)) return null;
  // never a notion that is neither in the brief nor in the assessment (nor in the teacher's remarks)
  if (outsideNotions(d, body).length) return null;
  const words = wordCount(body), nothing = !d.improve.length && !d.notions.length;
  if (words < 15 || words > (nothing ? 120 : 170 + 45 * nL)) return null;
  // one learner: never the brief's deliverables nor the bonus
  if (!d.group && /\bbonus\b|il manque encore|livrables?\b|fonctionnalités demandées/i.test(body)) return null;
  return `${greetingOf(d)}\n\n${body}`;
}
