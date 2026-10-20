// The mise en situation: a short task the learner does live, alone, in front of the teacher, on THEIR OWN project:
// add a small feature to their code, or change their code so it does a given feature. It is built from the brief's
// requirements, the programme week (concepts and technologies, never a later week) and the learner's repo (their real
// files, pages, functions), and aims first at what they didn't fully validate.
//   • taskTarget chooses what the task is about (a requirement not validated, else an oral notion missed, else a
//     validated requirement to change); in a squad, never what another member already has
//   • pickFiles chooses the files to show the AI (the member's own files first)
//   • taskPrompt / cleanTask / taskChecks / taskFallback: one AI call with a JSON shape, checked, and a template
import { challengePool, CH_NEEDS_JS, CH_TOO_BIG, chOutsideBrief, noVerif, reviewStates } from "./engine.ts";

export interface TaskTarget { item: number | null; texte: string; done: boolean; notion: string; why: "todo" | "oral" | "done" }
export interface Task {
  titre: string; contexte: string; consigne: string; fichiers: string[]; criteres: string[]; regarder: string;
}

const line = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const pick = <T>(xs: T[], rnd: () => number) => xs[Math.floor(rnd() * xs.length) % Math.max(1, xs.length)];

/**
 * What the task is about. `states`: the switches (saved or on the screen); `exclude`: requirements already used by
 * this learner's previous task or by another member of the squad.
 */
export function taskTarget(rec: any, states: any, o: { exclude?: number[]; rnd?: () => number } = {}): TaskTarget | null {
  const rnd = o.rnd ?? Math.random;
  const st = reviewStates({ ...rec, final: states ?? rec.final });
  const ex: any[] = (rec.result && rec.result.exigences) || [];
  const pool = challengePool(ex) as number[];
  const free = pool.filter((i: number) => !(o.exclude || []).includes(i));
  const usable = free.length ? free : pool;
  const todo = usable.filter((i: number) => !st.ex[i]);
  if (todo.length) { const i = pick(todo, rnd); return { item: i, texte: noVerif(ex[i].texte), done: false, notion: "", why: "todo" }; }
  // everything is validated: a notion they missed at the oral, else a point they did, to change
  const missed = ((rec.oral || []) as any[]).filter((q, i) => !st.oral[i]).map((q) => line(q.notion || q.q, 140)).filter(Boolean);
  if (missed.length) return { item: null, texte: "", done: false, notion: pick(missed, rnd), why: "oral" };
  if (usable.length) { const i = pick(usable, rnd); return { item: i, texte: noVerif(ex[i].texte), done: true, notion: "", why: "done" }; }
  return null;
}

// the extensions a task may touch, per kind of project (images, docs, configs are never "the code")
const CODE = /\.(html?|css|scss|js|mjs|jsx|ts|tsx|php|sql|vue|blade\.php)$/i;
const SKIP = /(^|\/)(node_modules|vendor|dist|build|\.github|\.vscode)\//i;
const words = (t: string) => new Set(String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 3));
/** The files to show: the member's own files first, then those whose name matches the target, then the main pages. */
export function pickFiles(paths: string[], target: TaskTarget, mine: string[] = [], n = 2): string[] {
  const code = paths.filter((p) => CODE.test(p) && !SKIP.test(p));
  const want = words(`${target.texte} ${target.notion}`);
  const score = (p: string) => (mine.includes(p) ? 10 : 0) + [...words(p.replace(/[./_-]/g, " "))].filter((w) => want.has(w)).length * 3
    + (/(^|\/)index\.(html?|php)$/i.test(p) ? 2 : 0) + (/\.(js|php)$/i.test(p) ? 1 : 0) - p.split("/").length * 0.1;
  return [...code].sort((a, b) => score(b) - score(a)).slice(0, n);
}

/** The AI's answer → a task (or empty fields). */
export function cleanTask(j: any): Task {
  return {
    titre: line(j?.titre, 80), contexte: line(j?.contexte, 300), consigne: line(j?.consigne, 700),
    fichiers: (Array.isArray(j?.fichiers) ? j.fichiers : []).map((x: unknown) => line(x, 160).replace(/^\.?\//, "")).filter(Boolean).slice(0, 6),
    criteres: (Array.isArray(j?.criteres) ? j.criteres : Array.isArray(j?.observer) ? j.observer : []).map((x: unknown) => line(x, 160)).filter(Boolean).slice(0, 5),
    regarder: line(j?.regarder, 300),
  };
}
// « tu » anywhere, or an order given with « tu » at the start of a sentence (« Ajoute… », not « Ajoutez… »)
const TU = /(?<![\p{L}\p{N}])(tu|ton|ta|tes|toi)(?![\p{L}\p{N}])|(^|[.!?:]\s+)(ajoute|modifie|cr[ée]e|change|utilise|fais|mets|v[ée]rifie|rends|place)(?![\p{L}\p{N}])/iu;
const sentences = (s: string) => (s.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? []).length + (/[^.!?\s]\s*$/.test(s) ? 1 : 0);
/** What doesn't follow the rules (in French: it goes back to the AI). `files`: the repo's files when they were read. */
export function taskChecks(t: Task, o: { js: boolean; scope: string; files?: string[]; duree: string }): string[] {
  const e: string[] = [];
  if (t.titre.length < 3) e.push("le titre manque");
  if (!t.contexte || sentences(t.contexte) > 2) e.push("le contexte tient en une phrase");
  const n = sentences(t.consigne);
  if (!t.consigne || n > 3) e.push(`la consigne fait 1 à 3 phrases (elle en fait ${n})`);
  if (t.criteres.length !== 3) e.push(`exactement 3 critères d’acceptation observables (il y en a ${t.criteres.length})`);
  if (!t.regarder) e.push("« regarder » (ce que le formateur observe) manque");
  if (!t.fichiers.length || t.fichiers.length > 4) e.push("1 à 4 fichiers du projet à modifier");
  if (o.files && o.files.length) {
    const lost = t.fichiers.filter((f) => !o.files!.includes(f) && !o.files!.some((p) => p.endsWith("/" + f)));
    if (lost.length) e.push(`ces fichiers n’existent pas dans le dépôt : ${lost.join(", ")} (utilise les fichiers listés)`);
  }
  const student = [t.titre, t.contexte, t.consigne, ...t.criteres].join(" ");
  if (TU.test(student)) e.push("vouvoie l’apprenant (« vous », « ajoutez », « modifiez »), jamais « tu »");
  if (CH_TOO_BIG.test(`${t.titre} ${t.consigne}`)) e.push(`la tâche est trop grosse pour ${o.duree} (une page entière)`);
  if (!o.js && CH_NEEDS_JS.test(`${t.titre} ${t.consigne} ${t.criteres.join(" ")}`)) e.push("le brief est en HTML et CSS : pas de JavaScript ni d’interaction");
  const outside = chOutsideBrief(`${student}`, o.scope);
  if (outside.length) e.push(`elle nomme ${outside.join(", ")}, que le brief ne demande pas`);
  return e;
}

/** Without a usable AI answer: the same target, as a plain task on the learner's files. */
export function taskFallback(target: TaskTarget, o: { project: string; files: string[]; duree: string }): Task {
  const f = o.files.slice(0, 2);
  const where = f.length ? ` dans ${f.map((x) => `« ${x} »`).join(" et ")}` : "";
  const point = target.notion || target.texte.replace(/^en tant qu[e']\s*[^,]+,\s*/i, "").replace(/,?\s+(afin|pour que)\b.*$/i, "").replace(/\.$/, "");
  return {
    titre: (target.why === "done" ? "Faire évoluer : " : target.why === "oral" ? "Mettre en pratique : " : "Ajouter : ") + line(point, 60),
    contexte: `Vous travaillez en direct sur votre projet « ${line(o.project, 80)} ».`,
    consigne: target.why === "done"
      ? `Modifiez votre code${where} pour faire évoluer ce point : ${line(point, 200)}. Vous avez ${o.duree}.`
      : target.why === "oral"
        ? `Montrez dans votre code${where} que vous savez utiliser cette notion : ${line(point, 200)}. Vous avez ${o.duree}.`
        : `Ajoutez à votre projet${where} ce point du brief : ${line(point, 200)}. Vous avez ${o.duree}.`,
    fichiers: f,
    criteres: ["Le résultat demandé est visible dans le navigateur.", "La modification se trouve dans le bon fichier, avec un code lisible.", "Le reste du projet fonctionne toujours."],
    regarder: "Observez comment l’apprenant retrouve le bon endroit dans son code et vérifie son résultat.",
  };
}

export const TASK_SYSTEM = (o: { duree: string; lvl: number; lvlName: string; lvlRule: string; js: boolean }) => [
  "Tu aides un formateur en développement web (titre Développeur Web et Web Mobile, approche par compétences). Réponds en français, simplement.",
  `Propose UNE mise en situation : une petite tâche que l’apprenant réalise seul, en direct, devant le formateur, sur SON propre projet, en ${o.duree}.`,
  "La tâche lui demande soit d’AJOUTER une petite fonctionnalité à son code, soit de MODIFIER son code pour qu’il fasse une fonctionnalité donnée (ex. un état actif sur le lien du menu de la page en cours, un point de rupture à 768 px qui empile les cartes, un champ obligatoire avec un pattern dans le formulaire ; plus tard : un nouveau filtre sur un résultat de fetch, une nouvelle requête SQL, une nouvelle route…).",
  "Règles :",
  `- Niveau ${o.lvl} (${o.lvlName}) : ${o.lvlRule}`,
  `- Taille : la tâche tient vraiment en ${o.duree}. Jamais une page entière ni plusieurs fonctionnalités : une seule chose, sur le POINT VISÉ.`,
  "- Seulement ce que le brief demande et les concepts de la SEMAINE DU PROGRAMME ; jamais rien du HORS PÉRIMÈTRE.",
  `- ${o.js ? "Utilise le langage du projet." : "Le brief est en HTML et CSS : pas de JavaScript, rien d’interactif."}`,
  "- Ne nomme aucune technique ou propriété que le brief ne cite pas : décris le résultat à obtenir, l’apprenant choisit comment faire.",
  "- Appuie-toi sur SES vrais fichiers (liste fournie) : nomme les fichiers, pages ou fonctions à toucher.",
  "- Textes pour l’apprenant (titre, contexte, consigne, critères) au vouvoiement (« Ajoutez… », « Modifiez… »). « regarder » est pour le formateur seulement.",
  "- 3 critères d’acceptation, chacun vérifiable en quelques secondes à l’écran ou dans le code.",
  'Réponds UNIQUEMENT avec ce JSON : {"titre":"max 8 mots","contexte":"une phrase","consigne":"1 à 3 phrases","fichiers":["chemin réel du dépôt"],"criteres":["…","…","…"],"regarder":"pour le formateur : ce qu’il faut observer, une phrase"}',
].join("\n");

export function taskPrompt(o: {
  project: string; brief: string; target: TaskTarget; week?: { n: number; concepts: string; tech: string[] } | null; next?: string;
  files: string[]; mine: string[]; excerpts: { path: string; text: string }[]; lacunes: string[]; remarks: string; others: string[]; proposal: string; extra?: string;
}): string {
  const T = o.target;
  return [
    `PROJET : ${o.project}`, `BRIEF :\n${o.brief.slice(0, 4000)}`,
    T.notion ? `POINT VISÉ : une notion qu’il n’a pas su expliquer à l’oral : ${T.notion}`
      : `POINT VISÉ (${T.done ? "réussi dans son projet : il le fait évoluer" : "pas réussi ou pas terminé dans son projet : il en ajoute un petit morceau"}) : ${T.texte}`,
    o.week ? `SEMAINE ${o.week.n} DU PROGRAMME : concepts et exigences techniques :\n${o.week.concepts.slice(0, 1500)}${o.week.tech.length ? `\nTechnologies vues jusqu’ici : ${o.week.tech.join(", ")}` : ""}` : "",
    o.next ? `HORS PÉRIMÈTRE (semaine suivante, jamais dans la tâche) :\n${o.next.slice(0, 800)}` : "",
    o.files.length ? `FICHIERS DU PROJET :\n${o.files.slice(0, 60).map((p) => "- " + p).join("\n")}` : "FICHIERS DU PROJET : (non lus : décris l’endroit à modifier sans inventer de chemin)",
    o.mine.length ? `FICHIERS QU’IL A MODIFIÉS LUI-MÊME (vise-les en priorité) :\n${o.mine.slice(0, 15).map((p) => "- " + p).join("\n")}` : "",
    ...o.excerpts.map((x) => `EXTRAIT DE ${x.path} :\n<<<\n${x.text.slice(0, 1500)}\n>>>`),
    o.lacunes.length ? `SES LACUNES À L’ÉVALUATION :\n${o.lacunes.slice(0, 6).map((x) => "- " + x).join("\n")}` : "",
    o.remarks ? `REMARQUES DU FORMATEUR (face-à-face) : ${line(o.remarks, 400)}` : "",
    o.others.length ? `TÂCHES DES AUTRES MEMBRES DU SQUAD (la sienne doit être différente) :\n${o.others.map((x) => "- " + x).join("\n")}` : "",
    o.proposal ? `PROPOSITION DU FORMATEUR (consigne principale, dans les règles et le périmètre) :\n<<<\n${o.proposal.slice(0, 1000)}\n>>>` : "",
    o.extra || "",
  ].filter(Boolean).join("\n");
}
