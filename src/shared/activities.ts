// Activités: the daily veilles (09:15, 30 min) and the live codings (11:00, 45 min, Tuesday and Thursday by default)
// of a date range, from the class's PROGRAMME only (week, sprint, objective, concepts, competencies, technologies):
// classes of the same programme run different briefs but study the same concepts, and share these activities (see
// library.ts). The format is the teacher's reference: docs/activities/TEMPLATES_VEILLE_LIVE_CODING_DWWM_2026-2027.md
// (change both together).
//   • the days of a range: weekends, public holidays, breaks, cross defenses (SC), certification, the teacher's own
//     days off; the days that get a live coding; the range cut in weeks (Monday → Friday)
//   • the AI answers JSON, one call per item (the week's plan, then each veille, then each live coding): a whole week
//     in one answer gets cut. Every item is checked (sections, sizes, a déroulé of 45 min, the code, the links) and
//     asked again once with what's wrong; still wrong, it's kept with its warnings for the teacher.
//   • the teacher can regenerate one item from their own proposal: it's the main instruction, within the programme
//   • the markdown is written here from the JSON, so every item has the template's sections, in its order.
import { libGone } from "./library.ts";
import type { Env, GuildRow } from "./types.ts";
import { aiBudgetOk, aiBudgetUse, all, now, one, run } from "./db.ts";
import { extractJson, groqChat, hasKeyedAi, workersChat } from "./ai.ts";
import type { Msg } from "./ai.ts";
import { perMinuteWait } from "./aikeys.ts";
import { compLabel, compName, parseComp, programOf, techOfWeek, techOutside } from "./program.ts";
import type { Program, ProgramSprint, ProgramWeek } from "./program.ts";

export class ActivityError extends Error { wait: number; constructor(msg: string, wait = 0) { super(msg); this.wait = wait; } }

// ------------------------------------------------------------------ days
const DAY_MS = 86400000;
export const isIso = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
/** 1 = Monday … 7 = Sunday */
export const dowOf = (iso: string) => ((new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
export const mondayOf = (iso: string) => addDays(iso, 1 - dowOf(iso));
export const DAY_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** "Lundi 12/10" */
export const dayFr = (iso: string) => `${DAY_FR[dowOf(iso) - 1]} ${ddmm(iso)}`;
/** "Lun 12/10" */
export const dayShort = (iso: string) => `${DAY_FR[dowOf(iso) - 1].slice(0, 3)} ${ddmm(iso)}`;
/** The longest range the page works on (a calendar month view is 42 days). */
export const MAX_DAYS = 62;

// Moroccan public holidays: the school is closed. The Islamic ones follow the moon, so their dates are an estimate:
// the teacher fixes a day in the calendar when it moves (day off / working day).
const FIXED: Record<string, string> = {
  "01-01": "Nouvel an", "01-11": "Manifeste de l'Indépendance", "01-14": "Nouvel an amazigh", "05-01": "Fête du Travail",
  "07-30": "Fête du Trône", "08-14": "Allégeance Oued Eddahab", "08-20": "Révolution du Roi et du Peuple", "08-21": "Fête de la Jeunesse",
  "10-31": "Fête de l'Unité", "11-06": "Marche Verte", "11-18": "Fête de l'Indépendance",
};
const LUNAR: Record<string, string> = {
  "2026-05-27": "Aïd al-Adha", "2026-05-28": "Aïd al-Adha", "2026-06-17": "Nouvel an de l'Hégire", "2026-08-26": "Aïd al-Mawlid", "2026-08-27": "Aïd al-Mawlid",
  "2027-03-10": "Aïd al-Fitr", "2027-03-11": "Aïd al-Fitr", "2027-05-17": "Aïd al-Adha", "2027-05-18": "Aïd al-Adha", "2027-06-07": "Nouvel an de l'Hégire",
  "2027-08-16": "Aïd al-Mawlid", "2027-08-17": "Aïd al-Mawlid",
};
export function holidayOf(day: string): { label: string; approx: boolean } | null {
  if (FIXED[day.slice(5)]) return { label: FIXED[day.slice(5)], approx: false };
  return LUNAR[day] ? { label: LUNAR[day], approx: true } : null;
}

export type DayKind = "work" | "weekend" | "holiday" | "off" | "break" | "crossdefense" | "certification" | "other" | "outside";
export interface DayInfo { day: string; dow: number; kind: DayKind; label: string; week: number | null; sprint: number | null; approx?: boolean }
/** The teacher's changes: a working day without activities ("off"), a holiday that is worked after all ("on"). */
export type Overrides = Record<string, "off" | "on">;
const KIND_FR: Record<string, string> = { break: "Vacances", crossdefense: "Soutenances croisées", certification: "Certification", other: "Autre" };

/** The week of the programme that contains a day (none outside the planning). */
export const weekOf = (p: Program, day: string) => p.weeks.find((w) => w.start && w.end && w.start <= day && day <= w.end) ?? null;
export function dayInfo(p: Program, day: string, ov: Overrides = {}): DayInfo {
  const dow = dowOf(day), w = weekOf(p, day);
  const base = { day, dow, week: w?.n ?? null, sprint: w?.sprint ?? null };
  if (dow > 5) return { ...base, kind: "weekend", label: "Week-end" };
  if (!w) return { ...base, kind: "outside", label: "Hors du programme" };
  if (w.kind !== "brief") return { ...base, kind: w.kind, label: `${KIND_FR[w.kind]}${w.title && w.title !== KIND_FR[w.kind] ? ` : ${w.title}` : ""}` };
  if (ov[day] === "off") return { ...base, kind: "off", label: "Pas d'activité (choix du formateur)" };
  const h = holidayOf(day);
  if (h && ov[day] !== "on") return { ...base, kind: "holiday", label: `Férié : ${h.label}${h.approx ? " (date estimée)" : ""}`, approx: h.approx };
  return { ...base, kind: "work", label: `S${w.n}${w.sprint ? ` · Sprint ${w.sprint}` : ""}` };
}
/** Every day from `from` to `to` (at most MAX_DAYS). */
export function rangeDays(p: Program, from: string, to: string, ov: Overrides = {}): DayInfo[] {
  const out: DayInfo[] = [];
  for (let d = from; d <= to && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(dayInfo(p, d, ov));
  return out;
}
/** Live codings on Tuesday and Thursday, when they are working days. */
export const defaultLive = (days: DayInfo[]) => days.filter((d) => d.kind === "work" && (d.dow === 2 || d.dow === 4)).map((d) => d.day);
/** The range cut in weeks: Monday → Friday, only the weekdays of the range. */
export function splitWeeks(days: DayInfo[]): { monday: string; days: DayInfo[] }[] {
  const out: { monday: string; days: DayInfo[] }[] = [];
  for (const d of days) {
    if (d.dow > 5) continue;
    const m = mondayOf(d.day);
    if (out[out.length - 1]?.monday === m) out[out.length - 1].days.push(d); else out.push({ monday: m, days: [d] });
  }
  return out;
}
/** The last working day of a programme week (the week's work is handed in that evening): its veille is lighter. */
export function closingDay(p: Program, w: ProgramWeek, ov: Overrides = {}): string | null {
  for (let d = w.end, i = 0; d >= w.start && i < 40; d = addDays(d, -1), i++) if (dayInfo(p, d, ov).kind === "work") return d;
  return null;
}
/** The next teaching week of the programme: its concepts are out of scope this week. */
export const nextProgrammeWeek = (p: Program, w: ProgramWeek) =>
  [...p.weeks].filter((x) => x.kind === "brief" && x.start > w.end).sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
/** What the class has seen up to a week (the technologies of every teaching week until then: kind "brief" in the programme). */
export function techSoFar(p: Program, w: ProgramWeek): string[] {
  const out = new Set<string>();
  for (const x of p.weeks) if (x.kind === "brief" && x.start <= w.start) techOfWeek(x).forEach((t) => out.add(t));
  return [...out];
}
/** The concepts written in the planning up to a week (to allow a pattern the class was taught). */
export const conceptsSoFar = (p: Program, w: ProgramWeek) => p.weeks.filter((x) => x.kind === "brief" && x.start <= w.start).map((x) => x.concepts).join("\n");

// ------------------------------------------------------------------ the code of the week
export type Stack = "web" | "js" | "sql" | "php" | "laravel" | "react";
/** The language of a live coding follows the week: HTML/CSS, then JavaScript, SQL, PHP, Laravel, React. */
export function stackOf(tech: string[]): Stack {
  const has = (n: string) => tech.includes(n);
  if (has("React")) return "react";
  if (has("Laravel")) return "laravel";
  if (["PHP", "PDO", "OOP", "MVC"].some(has)) return "php";
  if (has("SQL & database")) return "sql";
  if (["JavaScript", "DOM", "Fetch / API", "localStorage", "TypeScript", "Node.js & Express"].some(has)) return "js";
  return "web";
}
/** Each stack: the files of the live coding (starter given, support given ready-made, final written live). */
export const STACKS: Record<Stack, { label: string; ext: string[]; starter: string; support: string; final: string; fns: boolean; hint: string }> = {
  web: { label: "HTML et CSS", ext: ["html", "css"], starter: "index.html", support: "", final: "style.css", fns: false,
    hint: "Pas de JavaScript cette semaine : le live coding se fait en HTML et CSS. Le starter est la page HTML, le code final est le CSS (ou le HTML) écrit en direct." },
  js: { label: "HTML, CSS et JavaScript", ext: ["html", "css", "js"], starter: "index.html", support: "style.css", final: "app.js", fns: true,
    hint: "Le starter HTML charge le script avec defer. Le code final est le JavaScript écrit en direct." },
  sql: { label: "SQL (MySQL)", ext: ["sql"], starter: "schema.sql", support: "", final: "requetes.sql", fns: false,
    hint: "Le starter crée les tables (CREATE TABLE) et insère 5 lignes maximum par table. Le code final est les requêtes écrites en direct, chacune précédée d'un commentaire." },
  php: { label: "PHP 8", ext: ["php", "html", "css", "sql"], starter: "index.php", support: "", final: "traitement.php", fns: true,
    hint: "Du PHP simple et lisible, au niveau de la semaine. Le starter est la page ou les données de départ, le code final est le PHP écrit en direct." },
  laravel: { label: "Laravel", ext: ["php"], starter: "routes/web.php", support: "", final: "app/Http/Controllers/ProduitController.php", fns: true,
    hint: "Routes, contrôleur et vue Blade ; les commandes artisan vont dans les étapes du déroulé. Le code final est le fichier principal écrit en direct (contrôleur ou vue)." },
  react: { label: "React (Vite)", ext: ["jsx", "js", "css", "html"], starter: "src/main.jsx", support: "src/index.css", final: "src/App.jsx", fns: true,
    hint: "Composants fonctionnels et useState, au niveau de la semaine. Le code final est le composant écrit en direct." },
};
const FENCE: Record<string, string> = { html: "html", css: "css", js: "javascript", jsx: "jsx", sql: "sql", php: "php" };
const extOf = (file: string) => (file.match(/\.([a-z]+)$/i)?.[1] ?? "").toLowerCase();
const fenceOf = (file: string) => (/\.blade\.php$/i.test(file) ? "blade" : FENCE[extOf(file)] ?? "");

// Veille topics of the earlier promotions (docs/activities/VEILLE_INSPIRATION_DWWM.md, keep both the same), by the
// technology of the programme they belong to (the names of TECHS in program.ts). Only inspiration: the AI sees the
// ones of the week's technologies and may use, reword or ignore them; the programme stays the only scope. "Culture"
// fits any week, for the lighter last day.
export const INSPIRATION: Record<string, string[]> = {
  "HTML": ["SEO", "Accessibilité", "UI / UX"],
  "CSS": ["L'approche mobile first et le responsive design", "Le 8 point grid, les systèmes de grille et les unités de mesure", "Les sélecteurs CSS, les transitions et les animations", "Les pseudo-classes", "L'architecture CSS (BEM)"],
  "Tailwind CSS": ["Les frameworks CSS"],
  "Bootstrap": ["Les frameworks CSS"],
  "Sass": ["Les préprocesseurs CSS : Sass et Less"],
  "Lighthouse / accessibility": ["Accessibilité"],
  "Git & GitHub": ["La méthode agile", "SCRUM"],
  "Trello / Jira": ["La méthode agile", "SCRUM"],
  "JavaScript": ["Les bases de JavaScript", "Le débogage", "Les Web APIs (canvas, drag & drop…)", "L'Event Loop", "Babel", "GSAP"],
  "DOM": ["Le DOM en JavaScript", "Les événements et les animations en JavaScript"],
  "TypeScript": ["TypeScript"],
  "Fetch / API": ["Ajax", "Fetch et Axios", "L'Event Loop", "Les PWA", "CORS", "API REST", "REST et GraphQL", "La documentation d'une API", "Les bonnes pratiques de sécurité des API"],
  "PHP": ["PHP", "Les failles de sécurité en PHP", "PHPMailer", "Le débogage en PHP", "Autoload et namespaces", "Les normes PHP-FIG (PSR)", "Les algorithmes de hachage"],
  "PDO": ["PDO et MySQLi"],
  "OOP": ["La POO", "Le pattern Singleton en PHP", "Les design patterns", "SOLID"],
  "UML": ["UML", "Les cas d'utilisation (use cases)", "Le diagramme de classes"],
  "SQL & database": ["Comment concevoir une base de données (relations entre tables)", "SQL", "NoSQL", "Les jointures SQL et les relations entre tables", "Les index en SQL", "Les vues en SQL", "Les transactions SQL", "Les procédures stockées", "PostgreSQL"],
  "MVC": ["MVC", "Le système de routage en PHP", "Les middlewares dans l'architecture MVC", "Performance et optimisation d'une application MVC (cache, lazy loading)"],
  "Back-end & auth": ["L'évolution des méthodes d'authentification : sessions, Basic, OAuth", "JWT", "Sessions, cookies et CSRF"],
  "Laravel": ["Laravel 101", "Le moteur de templates Blade", "Eloquent", "DTO et DAO", "L'authentification avec Laravel", "Les autorisations avec Spatie", "Migrations, seeders et factories",
    "Les relations polymorphiques de Laravel", "Optimiser les requêtes avec Query Builder et Eloquent", "Les notifications Laravel", "Les jobs et les queues", "Events, broadcasting et Reverb",
    "Le cache dans Laravel", "Gates et Policies", "Les tests en PHP et les tests unitaires en Laravel", "Les façades de Laravel", "Le scheduler (cron) de Laravel", "Le rate limiting", "Laravel Dusk"],
  "Docker": ["La virtualisation", "La conteneurisation", "Docker", "DevOps", "VPS et RDP", "Les pipelines CI/CD"],
  "React": ["React JS", "Vue JS", "Le state management", "DOM, Virtual DOM et Shadow DOM", "Les SPA (Single Page Applications)", "Le rendu côté serveur et côté client (SSR / CSR)"],
  "MongoDB": ["MongoDB", "Firebase"],
  "Culture": ["Comment bien préparer sa soutenance", "Les lois et réglementations du développement web", "La cybersécurité", "La notation Big O", "Les structures de données"],
};
/** The inspiration topics of some weeks (their technologies), without duplicates; with the "Culture" ones when asked. */
export function topicsFor(weeks: ProgramWeek[], culture = false): string[] {
  const out: string[] = [];
  for (const t of [...new Set(weeks.flatMap((w) => techOfWeek(w)))]) for (const x of INSPIRATION[t] ?? []) if (!out.includes(x)) out.push(x);
  if (culture) for (const x of INSPIRATION.Culture) if (!out.includes(x)) out.push(x);
  return out.slice(0, 24);
}

// ------------------------------------------------------------------ the teacher's proposal (Regenerate)
export const PROPOSAL_MAX = 1500;
export const cleanProposal = (v: unknown) => String(v ?? "").replace(/\r\n?/g, "\n").trim().slice(0, PROPOSAL_MAX);
/** What a proposal asks that the class hasn't seen yet at that point of the programme (catalog names). */
export const proposalOutside = (proposal: string, allowed: string[]) => (proposal && allowed.length ? techOutside(proposal, allowed) : []);
/** The proposal as the main instruction of the prompt, within the template, the programme's scope and the rules. */
export function proposalBlock(proposal: string, outside: string[]): string {
  if (!proposal) return "";
  return [
    "PROPOSITION DU FORMATEUR (c'est la consigne principale : elle décide du sujet, des notions, de l'exemple, des données, du piège ou du niveau ; elle remplace le titre prévu dans le plan) :",
    `<<<\n${proposal}\n>>>`,
    "Suis-la à la lettre : si elle nomme un exemple ou des données (ex. « CRUD users » = un CRUD d'utilisateurs), utilise exactement celui-là, pas un autre thème.",
    "Elle ne change ni le format du JSON, ni les règles ci-dessus, ni le périmètre du programme.",
    outside.length ? `ATTENTION : elle demande ${outside.join(", ")}, pas encore au programme à ce moment de l'année. Ne l'utilise pas : reste dans le périmètre et dis-le dans "ecarte".` : "",
    `Si une partie de la proposition sort du programme de la semaine (une notion d'une semaine suivante), laisse-la de côté et écris-la dans "ecarte" (une ligne courte par élément laissé de côté). Sinon "ecarte": [].`,
  ].filter(Boolean).join("\n");
}

// ------------------------------------------------------------------ links
// Only pages of these sites (French first). Anything else, or a malformed URL, is dropped: the AI invents URLs.
export const LINK_SITES: [string, string, string][] = [
  ["developer.mozilla.org", "/fr/", "MDN"], ["fr.javascript.info", "/", "JavaScript.info"], ["php.net", "/manual/fr/", "PHP.net"],
  ["laravel.com", "/docs", "Laravel"], ["fr.react.dev", "/", "React"], ["react.dev", "/", "React"], ["git-scm.com", "/", "Git"],
  ["w3.org", "/", "W3C"], ["web.dev", "/", "web.dev"], ["regex101.com", "/", "regex101"], ["developer.chrome.com", "/docs/devtools", "Chrome DevTools"],
  ["tailwindcss.com", "/docs", "Tailwind CSS"], ["getbootstrap.com", "/docs", "Bootstrap"], ["docs.github.com", "/fr", "GitHub Docs"],
  ["sql.sh", "/", "SQL.sh"], ["dev.mysql.com", "/doc", "MySQL"], ["postgresql.org", "/docs", "PostgreSQL"],
];
export function linkOk(u: unknown): { url: string; source: string } | null {
  const raw = String(u ?? "").trim();
  if (!raw || /\s/.test(raw)) return null;
  let x: URL;
  try { x = new URL(raw); } catch { return null; }
  if (x.protocol !== "https:" || x.username || x.password) return null;
  const host = x.hostname.toLowerCase().replace(/^www\./, "");
  const hit = LINK_SITES.find(([h, path]) => host === h && x.pathname.startsWith(path));
  return hit ? { url: x.href, source: hit[2] } : null;
}

// ------------------------------------------------------------------ cleaning the AI's JSON
const EMOJI = /(?:\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|⃣)[️‍]*/gu;
/** Text without emojis (the template puts them on the headings only). */
const txt = (v: unknown, max: number) => String(v ?? "").replace(EMOJI, "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim().slice(0, max);
const line = (v: unknown, max: number) => txt(v, max).replace(/\s*\n\s*/g, " ");
const strList = (v: unknown, n = 10, max = 400) => (Array.isArray(v) ? v : []).map((x) => line(x && typeof x === "object" ? (x as any).texte ?? (x as any).text ?? "" : x, max).replace(/^[-•*]\s*/, "")).filter(Boolean).slice(0, n);
const cell = (s: string) => s.replace(/\|/g, "\\|") || "—";
const sentences = (s: string) => (s.match(/[^.!?…]+[.!?…]+(?=\s|$)/g) ?? []).length + (/[^.!?…\s]\s*$/.test(s) ? 1 : 0);
const VERB = /^[A-ZÀÂÉÈÊÎÔÛ][a-zàâäéèêëîïôöûüç'’-]*(?:er|ir|re|oir)\b/;

export interface Veille {
  titre: string; contexte: string; objectifs: string[]; plan: { titre: string; points: string[] }[]; questions: string[];
  ressources: { titre: string; url: string; source: string }[]; artefact: string; demo: string; criteres: string[]; dropped: string[];
  ecarte: string[]; proposal: string;   // what was left out of the teacher's proposal (out of scope), and the proposal itself
}
export function cleanVeille(j: any): Veille {
  const dropped: string[] = [];
  const ressources = (Array.isArray(j?.ressources) ? j.ressources : []).slice(0, 8).map((r: any) => {
    const ok = linkOk(r?.url);
    if (!ok) { if (r?.url) dropped.push(String(r.url).slice(0, 200)); return null; }
    return { titre: line(r?.titre ?? r?.title, 140) || ok.url, url: ok.url, source: ok.source };
  }).filter(Boolean);
  return {
    titre: line(j?.titre, 140), contexte: line(j?.contexte, 1500), objectifs: strList(j?.objectifs, 8, 300),
    plan: (Array.isArray(j?.plan) ? j.plan : []).slice(0, 5).map((x: any) => ({ titre: line(x?.titre, 160), points: strList(x?.points, 8, 300) })).filter((x: { titre: string }) => x.titre),
    questions: strList(j?.questions, 6, 300), ressources, artefact: line(j?.artefact, 300), demo: line(j?.demo, 300), criteres: strList(j?.criteres, 8, 300), dropped,
    ecarte: strList(j?.ecarte, 6, 200), proposal: cleanProposal(j?.proposal),
  };
}
/** `allowed`: the technologies seen up to this week; the subject (its title) must stay within them. */
export function validateVeille(v: Veille, allowed: string[] = []): string[] {
  const e: string[] = [];
  if (v.titre.length < 3) e.push("le titre manque");
  const outside = allowed.length ? techOutside(v.titre, allowed) : [];
  if (outside.length) e.push(`le sujet sort du programme de la semaine (${outside.join(", ")}, pas encore vu) : reste dans les concepts de la semaine`);
  const n = sentences(v.contexte);
  if (n < 3 || n > 5) e.push(`le contexte doit faire 3 à 5 phrases (il en fait ${n})`);
  if (v.objectifs.length < 3 || v.objectifs.length > 5) e.push(`3 à 5 objectifs (il y en a ${v.objectifs.length})`);
  const noVerb = v.objectifs.filter((o) => !VERB.test(o));
  if (noVerb.length) e.push(`chaque objectif commence par un verbe d'action à l'infinitif (pas : « ${noVerb[0].slice(0, 60)} »)`);
  if (v.plan.length < 2 || v.plan.length > 3) e.push(`le plan a 2 ou 3 parties (il en a ${v.plan.length})`);
  v.plan.forEach((x, i) => { const min = i < 2 ? 3 : 1; if (x.points.length < min || x.points.length > 4) e.push(`la partie ${i + 1} du plan a ${min === 3 ? "3" : "1"} à 4 points (elle en a ${x.points.length})`); });
  if (v.questions.length < 2 || v.questions.length > 3) e.push(`2 ou 3 questions de réflexion (il y en a ${v.questions.length})`);
  if (v.questions.some((q) => !q.endsWith("?"))) e.push("chaque question de réflexion finit par « ? »");
  if (v.ressources.length < 3 || v.ressources.length > 4) e.push(`3 à 4 ressources avec une URL réelle des sites permis (${v.ressources.length} valable${v.ressources.length > 1 ? "s" : ""}${v.dropped.length ? `, refusées : ${v.dropped.slice(0, 3).join(", ")}` : ""})`);
  if (!v.artefact) e.push("l'artefact du livrable manque (schéma, tableau comparatif ou checklist)");
  if (!v.demo) e.push("la démo en direct du livrable manque");
  if (v.criteres.length < 3 || v.criteres.length > 4) e.push(`3 à 4 critères d'évaluation (il y en a ${v.criteres.length})`);
  return e;
}

export interface CodeFile { file: string; code: string }
export interface Live {
  titre: string; objectifs: string[]; contexte: string; deroule: { minutes: number; etape: string; notions: string }[];
  starter: CodeFile | null; support: CodeFile | null; final: CodeFile | null;
  tests: { action: string; saisie: string; resultat: string }[]; attention: string; extensions: string[]; reflexion: string[]; resultat: string[];
  ecarte: string[]; proposal: string;
}
const code = (v: unknown) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/^\s*```[\w-]*\n/, "").replace(/\n```\s*$/, "").replace(/^\n+|\s+$/g, "").slice(0, 8000);
function codeFile(v: any, stack: Stack, def: string): CodeFile | null {
  if (!v || typeof v !== "object" || !String(v.code ?? "").trim()) return null;
  const f = line(v.fichier ?? v.file, 80).replace(/^\/+/, "");
  return { file: f && STACKS[stack].ext.includes(extOf(f)) && /^[\w./-]+$/.test(f) ? f : def || STACKS[stack].final, code: code(v.code) };
}
export function cleanLive(j: any, stack: Stack): Live {
  const S = STACKS[stack];
  return {
    titre: line(j?.titre, 140), objectifs: strList(j?.objectifs, 6, 300), contexte: line(j?.contexte, 1200),
    deroule: (Array.isArray(j?.deroule) ? j.deroule : []).slice(0, 8).map((x: any) => ({ minutes: Math.round(Number(x?.minutes)) || 0, etape: line(x?.etape, 200), notions: line(x?.notions, 200) })).filter((x: { etape: string }) => x.etape),
    starter: codeFile(j?.starter, stack, S.starter), support: codeFile(j?.support, stack, S.support), final: codeFile(j?.final, stack, S.final),
    tests: (Array.isArray(j?.tests) ? j.tests : []).slice(0, 8).map((x: any) => ({ action: line(x?.action, 120), saisie: line(x?.saisie, 120), resultat: line(x?.resultat, 160) })).filter((x: { action: string }) => x.action),
    attention: line(j?.attention, 600), extensions: strList(j?.extensions, 5, 300), reflexion: strList(j?.reflexion, 5, 300), resultat: strList(j?.resultat, 5, 300),
    ecarte: strList(j?.ecarte, 6, 200), proposal: cleanProposal(j?.proposal),
  };
}

// the code checks (plain scans: the code is small)
const lines = (s: string) => s.split("\n").filter((l) => l.trim()).length;
/** Named functions: `function name(`, and `const name = (…) =>` / `= function`. */
export function namedFunctions(src: string): number {
  return (src.match(/\bfunction\s+[A-Za-z_$][\w$]*\s*\(/g)?.length ?? 0)
    + (src.match(/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:function\b|\([^()]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g)?.length ?? 0);
}
/** The elements of the list whose "[" is at `i` (what's inside strings and nested brackets doesn't count). */
function listSize(src: string, i: number): number {
  let depth = 0, n = 0, cur = false, quote = "";
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (quote) { if (c === "\\") k++; else if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; if (depth === 1) cur = true; continue; }
    if ("[{(".includes(c)) { if (depth === 1) cur = true; depth++; continue; }
    if ("]})".includes(c)) { if (--depth === 0) return n + (cur ? 1 : 0); continue; }
    if (depth === 1) { if (c === ",") { if (cur) n++; cur = false; } else if (!/\s/.test(c)) cur = true; }
  }
  return n + (cur ? 1 : 0);
}
/** The biggest data list of the code: an array given to a variable (`= [ … ]`, `return [ … ]`, `useState([ … ])`), or the rows of an INSERT. */
export function dataItems(src: string): number {
  let max = 0;
  for (const m of src.matchAll(/(?:=|\breturn|\buseState\()\s*\[/g)) max = Math.max(max, listSize(src, m.index! + m[0].length - 1));
  const perTable = new Map<string, number>();
  for (const m of src.matchAll(/INSERT\s+INTO\s+[`"]?(\w+)[^;]*?VALUES\s*/gi)) {
    let k = m.index! + m[0].length, rows = 0;
    while (src[k] === "(") {
      let depth = 0, quote = "";
      for (; k < src.length; k++) {
        const c = src[k];
        if (quote) { if (c === "\\") k++; else if (c === quote) quote = ""; continue; }
        if (c === "'" || c === '"') quote = c; else if (c === "(") depth++; else if (c === ")" && --depth === 0) { k++; break; }
      }
      rows++;
      while (/[\s,]/.test(src[k] ?? "")) k++;
    }
    perTable.set(m[1].toLowerCase(), (perTable.get(m[1].toLowerCase()) ?? 0) + rows);
  }
  return Math.max(max, ...perTable.values());
}
/** Fields of a form: inputs (not buttons or hidden ones), selects, text areas. */
export function formFields(src: string): number {
  const inputs = (src.match(/<input\b[^>]*>/gi) ?? []).filter((t) => !/type\s*=\s*["']?(submit|button|hidden|reset|image)\b/i.test(t)).length;
  return inputs + (src.match(/<select\b/gi)?.length ?? 0) + (src.match(/<textarea\b/gi)?.length ?? 0);
}
const cssRules = (src: string) => (src.match(/\{/g)?.length ?? 0) - (src.match(/@(media|supports|keyframes|layer)\b/g)?.length ?? 0);
// patterns too advanced for beginners, unless the planning teaches them
const ADVANCED: { rx: RegExp; name: string; taught: RegExp }[] = [
  { rx: /DocumentFragment|createDocumentFragment/, name: "DocumentFragment", taught: /fragment/i },
  { rx: /\(\?<?[=!]/, name: "un lookahead / lookbehind dans une Regex", taught: /lookahead|lookbehind|assertion/i },
];

export interface LiveRules { stack: Stack; allowed: string[]; concepts: string }
export function validateLive(l: Live, r: LiveRules): string[] {
  const e: string[] = [];
  const S = STACKS[r.stack];
  if (l.titre.length < 3) e.push("le titre manque");
  if (l.objectifs.length < 3 || l.objectifs.length > 4) e.push(`3 objectifs pédagogiques (il y en a ${l.objectifs.length})`);
  if (l.objectifs.some((o) => !VERB.test(o))) e.push("chaque objectif commence par un verbe d'action à l'infinitif");
  const n = sentences(l.contexte);
  if (n < 2 || n > 4) e.push(`le contexte général fait 2 à 4 phrases (il en fait ${n})`);
  const total = l.deroule.reduce((a, x) => a + x.minutes, 0);
  if (l.deroule.length < 4 || l.deroule.length > 5) e.push(`le déroulé a 4 ou 5 étapes (il en a ${l.deroule.length})`);
  if (total !== 45 || l.deroule.some((x) => x.minutes < 1)) e.push(`les minutes du déroulé font exactement 45 au total (ici ${total})`);
  if (!l.starter) e.push(`le starter (${S.starter}) manque`);
  if (!l.final) e.push(`le code final (${S.final}) manque`);
  const files = [l.starter, l.support, l.final].filter(Boolean) as CodeFile[];
  const all = files.map((f) => f.code).join("\n");
  if (l.final && lines(l.final.code) > 60) e.push(`le code final fait ${lines(l.final.code)} lignes (60 maximum)`);
  if (l.starter && extOf(l.starter.file) === "html" && lines(l.starter.code) > 35) e.push(`le starter HTML fait ${lines(l.starter.code)} lignes (environ 25)`);
  const css = files.filter((f) => f !== l.final && extOf(f.file) === "css");
  if (css.some((f) => cssRules(f.code) > 6)) e.push(`le CSS donné a ${Math.max(...css.map((f) => cssRules(f.code)))} règles (6 maximum)`);
  if (S.fns) { const fns = namedFunctions(all); if (fns > 2) e.push(`${fns} fonctions nommées (2 maximum)`); }
  const items = dataItems(all);
  if (items > 5) e.push(`${items} éléments dans les données (5 maximum)`);
  const fields = Math.max(0, ...files.map((f) => formFields(f.code)));
  if (fields > 3) e.push(`${fields} champs de formulaire (3 maximum)`);
  if (l.extensions.length < 1 || l.extensions.length > 2) e.push(`« Si le temps le permet » a 1 ou 2 idées (il y en a ${l.extensions.length})`);
  if (l.reflexion.length < 2 || l.reflexion.length > 3) e.push(`2 points de réflexion (il y en a ${l.reflexion.length})`);
  if (!l.resultat.length) e.push("le résultat attendu manque");
  // nothing the class hasn't seen yet
  const outside = r.allowed.length ? techOutside([all, ...l.deroule.map((x) => x.notions)].join("\n"), r.allowed) : [];
  if (outside.length) e.push(`utilise ${outside.join(", ")}, pas encore vu à ce moment du programme`);
  if (r.stack === "web" && /<script\b/i.test(all)) e.push("pas de JavaScript cette semaine (balise <script>)");
  for (const a of ADVANCED) if (a.rx.test(all) && !a.taught.test(r.concepts)) e.push(`pas de ${a.name} (motif trop avancé)`);
  return e;
}

export interface WeekPlan {
  resume: string; jours: { date: string; veille: string; focus: string; progression: string; live: string; live_focus: string }[];
  besoins: { besoin: string; ou: string }[]; hors: string[]; points: string[];
}
// plans saved before had "avancement" (a step of the brief): it isn't read anymore, the days show the programme only
export function cleanPlan(j: any, days: string[]): WeekPlan {
  const jours = (Array.isArray(j?.jours) ? j.jours : []).map((x: any) => ({
    date: String(x?.date ?? "").slice(0, 10), veille: line(x?.veille, 140), focus: line(x?.focus, 300), progression: line(x?.progression, 200), live: line(x?.live, 140), live_focus: line(x?.live_focus, 300),
  })).filter((x: { date: string }) => days.includes(x.date));
  return {
    resume: line(j?.resume, 400), jours: days.map((d) => jours.find((x: { date: string }) => x.date === d)).filter(Boolean),
    besoins: (Array.isArray(j?.besoins) ? j.besoins : []).slice(0, 10).map((x: any) => ({ besoin: line(x?.besoin, 200), ou: line(x?.ou, 120) })).filter((x: { besoin: string }) => x.besoin),
    hors: strList(j?.hors_perimetre ?? j?.hors, 10, 120), points: strList(j?.points_ouverts ?? j?.points, 6, 300),
  };
}
export function validatePlan(pl: WeekPlan, f: WeekFacts): string[] {
  const e: string[] = [];
  for (const d of f.work) {
    const x = pl.jours.find((j) => j.date === d);
    if (!x?.veille) e.push(`la veille du ${dayFr(d)} (${d}) manque`);
    if (f.live.includes(d) && !x?.live) e.push(`le live coding du ${dayFr(d)} (${d}) manque`);
    if (x && !x.progression) e.push(`la progression du ${dayFr(d)} (la notion du programme atteinte ce jour) manque`);
  }
  if (pl.besoins.length < 2) e.push("au moins 2 besoins des apprenants, avec où ils sont couverts");
  if (f.next && !pl.hors.length) e.push("la liste « hors_perimetre » (notions de la semaine suivante) manque");
  return e;
}

// ------------------------------------------------------------------ a week of the range
export interface WeekFacts {
  monday: string; from: string; to: string;
  days: DayInfo[];          // Monday → Friday
  work: string[];           // the working days of the range in this week
  live: string[];           // the days with a live coding
  weeks: ProgramWeek[];     // the programme weeks of those days
  sprint: ProgramSprint | null;
  closing: string[];        // working days that end a programme week (lighter veille)
  next: ProgramWeek | null; // the next teaching week of the programme: out of scope
}
export function weekFacts(p: Program, monday: string, from: string, to: string, live: string[] | null, ov: Overrides = {}): WeekFacts {
  const friday = addDays(monday, 4);
  const lo = from > monday ? from : monday, hi = to < friday ? to : friday;
  const days = rangeDays(p, monday, friday, ov);
  const inRange = days.filter((d) => d.day >= lo && d.day <= hi);
  const work = inRange.filter((d) => d.kind === "work").map((d) => d.day);
  const weeks: ProgramWeek[] = [];
  for (const d of work.length ? work : inRange.map((x) => x.day)) { const w = weekOf(p, d); if (w && !weeks.includes(w)) weeks.push(w); }
  const ends = new Set(weeks.map((w) => closingDay(p, w, ov)));
  const last = weeks[weeks.length - 1];
  return {
    monday, from: lo, to: hi, days, work,
    live: (live ?? defaultLive(inRange)).filter((d) => work.includes(d)).sort(),
    weeks, sprint: p.sprints.find((s) => s.n === weeks.find((w) => w.sprint)?.sprint) ?? null,
    closing: work.filter((d) => ends.has(d)),
    next: last ? nextProgrammeWeek(p, last) : null,
  };
}
/** Open points the teacher should look at (found without the AI). */
export function weekNotes(f: WeekFacts): string[] {
  const out: string[] = [];
  for (const w of f.weeks) if (w.kind === "brief" && w.concepts.trim().length < 40) out.push(`S${w.n} : le programme ne détaille pas les concepts de cette semaine ; les activités suivent son objectif, son sprint et ses compétences.`);
  if (f.weeks.length > 1) out.push(`Cette semaine couvre ${f.weeks.map((w) => `S${w.n}`).join(" et ")} du programme : chaque jour suit les concepts de sa semaine.`);
  for (const d of f.days) {
    if (d.day < f.from || d.day > f.to) continue;
    if ((d.dow === 2 || d.dow === 4) && (d.kind === "holiday" || d.kind === "off")) out.push(`${dayFr(d.day)} : ${d.label}, pas de live coding ce jour-là (choisis un autre jour si besoin).`);
    else if (d.kind === "holiday" && d.approx) out.push(`${dayFr(d.day)} : ${d.label}, à confirmer.`);
  }
  return out;
}

// ------------------------------------------------------------------ the programme, as the AI and the overview see it
/** The competencies of some weeks of the programme ("C3N1", "CT1N2"…), without duplicates. */
export function weekComps(weeks: ProgramWeek[]): string[] {
  const out: string[] = [];
  for (const w of weeks) for (const c of [...w.competencies, ...w.soft]) {
    const pc = parseComp(c);
    const label = pc ? `${compLabel(pc.code)}${pc.level ? "N" + pc.level : ""}` : c;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}
/** One week of the programme for the prompts: objective, concepts, competencies, technologies. Never a brief. */
// ------------------------------------------------------------------ the week's objectives: the sprint's, divided over its weeks
const STOP = new Set("avec dans pour une des les aux sur par son ses leur leurs cette ainsi entre plus tout tous toutes être faire selon côté type types base bases moderne modernes web site sites application applications interface interfaces projet données".split(" "));
const words = (t: string) => new Set(t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9+#.]+/).filter((x) => x.length >= 4 && !STOP.has(x)));
/** The sprint's objectives (its "objectives", else the bullets of its "situation"), one per line. */
export function sprintObjectives(sp: ProgramSprint | null | undefined): string[] {
  const src = (sp?.objectives || "").trim() || (sp?.situation || "").trim();
  return src.split(/\n+/).map((x) => x.replace(/^\s*(?:[•\-*–·]|\d+[.)])\s*/, "").trim()).filter((x) => x.length > 3);
}
/**
 * The objectives of a programme week: the sprint's own objectives, divided over the sprint's weeks — each one goes
 * to the week whose title and concepts speak of it (in order when nothing tells them apart). Nothing is invented:
 * the week's "objective" column of a planning (often the brief's project) is not used.
 */
export function weekObjectives(p: Program, w: ProgramWeek): string[] {
  const sp = p.sprints.find((x) => x.n === w.sprint);
  const obj = sprintObjectives(sp);
  if (!sp || !obj.length) return [];
  const sw = p.weeks.filter((x) => x.sprint === sp.n && x.kind === "brief").sort((a, b) => a.n - b.n);
  if (sw.length <= 1) return obj;
  const vocab = sw.map((x) => words(`${x.title}\n${x.concepts}`));
  const score = (o: string, k: number) => { let n = 0; for (const t of words(o)) if (vocab[k].has(t)) n++; return n; };
  const of: number[][] = sw.map(() => []);
  obj.forEach((o, i) => {
    const by = sw.map((_, k) => score(o, k));
    const best = Math.max(...by);
    const near = Math.min(sw.length - 1, Math.floor((i * sw.length) / obj.length));   // its place in the list
    const k = best > 0 ? (by[near] === best ? near : by.indexOf(best)) : near;
    of[k].push(i);
  });
  // a week left with nothing: the objective that speaks of it the most (shared with its first week)
  sw.forEach((_, k) => {
    if (of[k].length) return;
    const by = obj.map((o, i) => [score(o, k), -Math.abs(Math.floor((i * sw.length) / obj.length) - k)] as const);
    let bi = 0; by.forEach((b, i) => { if (b[0] > by[bi][0] || (b[0] === by[bi][0] && b[1] > by[bi][1])) bi = i; });
    of[k].push(bi);
  });
  const me = sw.findIndex((x) => x.n === w.n);
  return me < 0 ? obj : of[me].sort((a, b) => a - b).map((i) => obj[i]);
}

export function programmeBlock(p: Program, w: ProgramWeek): string {
  const sp = p.sprints.find((x) => x.n === w.sprint);
  const comps = [...w.competencies, ...w.soft].map((c) => { const pc = parseComp(c); return pc ? `${compLabel(pc.code)}${pc.level ? "N" + pc.level : ""} (${compName(p, pc.code)})` : c; });
  const tech = techOfWeek(w);
  return [
    `SEMAINE ${w.n} DU PROGRAMME (${w.start} → ${w.end})${sp ? `, sprint ${sp.n} « ${sp.title} »` : ""}`,
    (() => { const o = weekObjectives(p, w); return o.length ? `Objectifs de la semaine (ceux du sprint pour cette semaine : la semaine poursuit UNIQUEMENT ceux-là, n'en invente pas d'autres et ne parle d'aucun projet) :\n${o.map((x) => "- " + x).join("\n")}` : ""; })(),
    w.concepts ? `Concepts et exigences techniques :\n${w.concepts}` : "",
    comps.length ? `Compétences visées (chaque activité en fait pratiquer au moins une) : ${comps.join(", ")}` : "",
    sp && sp.tech.length + sp.soft.length ? `Compétences du sprint : ${weekComps([{ competencies: sp.tech, soft: sp.soft } as ProgramWeek]).join(", ")}` : "",
    tech.length ? `Technologies de la semaine : ${tech.join(", ")}` : "",
    sp?.situation ? `Situation du sprint :\n${sp.situation.slice(0, 800)}` : "",
  ].filter(Boolean).join("\n");
}

// ------------------------------------------------------------------ markdown (the template)
export interface WeekLabels { sprint: string; comps: string[]; objective: string }
export function weekLabels(p: Program, f: WeekFacts): WeekLabels {
  const obj = [...new Set(f.weeks.flatMap((w) => weekObjectives(p, w)))].map((x) => x.replace(/[.;\s]+$/, "")).join(" ; ");
  return {
    sprint: f.sprint ? `sprint ${f.sprint.n} « ${f.sprint.title} »` : "",
    comps: weekComps(f.weeks),
    objective: obj.length > 320 ? obj.slice(0, 317).replace(/\s+\S*$/, "") + "…" : obj,
  };
}
const CLOSING = "Consolidation de la semaine : bonnes pratiques, débogage, qualité";
/** "## Analyse de la semaine": the template's overview, from the programme. `titles` are the titles of the items already written. */
export function renderWeek(pl: WeekPlan, f: WeekFacts, lb: WeekLabels, titles: { veille: Record<string, string>; live: Record<string, string> } = { veille: {}, live: {} }, notes: string[] = []): string {
  const lo = f.from, hi = f.to;
  const span = lo.slice(5, 7) === hi.slice(5, 7) ? `${lo.slice(8, 10)}–${ddmm(hi)}/${hi.slice(0, 4)}` : `${ddmm(lo)}–${ddmm(hi)}/${hi.slice(0, 4)}`;
  const head = [`Semaine ${f.weeks.map((w) => w.n).join(" et ") || "—"} du programme (${span})`, lb.sprint, lb.comps.length ? `compétences ${lb.comps.join(", ")}` : ""].filter(Boolean).join(", ") + ".";
  const rows = f.days.filter((d) => d.day >= lo && d.day <= hi).map((d) => {
    if (d.kind !== "work") return `| ${dayShort(d.day)} | ${cell(d.label)} | — | — |`;
    const j = pl.jours.find((x) => x.date === d.day);
    const n = f.live.indexOf(d.day) + 1;
    const lc = n ? `LC${n} : ${cell(titles.live[d.day] || j?.live || "à préparer")}` : "—";
    return `| ${dayShort(d.day)} | ${cell(titles.veille[d.day] || j?.veille || "à préparer")} | ${lc} | ${f.closing.includes(d.day) ? CLOSING : cell(j?.progression || "")} |`;
  });
  const next = f.next ? `S${f.next.n} du programme, à partir du ${ddmm(f.next.start)}` : "fin du programme";
  const points = [...notes, ...pl.points];
  return [
    "## Analyse de la semaine", "",
    [head, lb.objective ? `Objectifs (sprint) : ${lb.objective}.` : "", pl.resume].filter(Boolean).join(" ").replace(/\.\./g, "."), "",
    "| Jour | Veille 09:15 (30 min) | Live coding 11:00 (45 min) | Progression attendue (programme) |",
    "| --- | --- | --- | --- |",
    ...rows, "",
    "**Ce dont les apprenants auront besoin (et où c'est couvert)**",
    ...(pl.besoins.length ? pl.besoins.map((b) => `- ${b.besoin} : ${b.ou || "—"}`) : ["- —"]), "",
    `**Hors périmètre cette semaine** (${next}) : ${pl.hors.join(", ") || "—"}.`, "",
    "**Points ouverts**",
    ...(points.length ? points.map((x) => `- ${x}`) : ["- Aucun"]),
  ].join("\n");
}
const NUM = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
export function renderVeille(v: Veille, day: string): string {
  return [
    `## ${dayFr(day)} — Veille : ${v.titre}`, "",
    "09:15 · 30 min · Veille", "",
    "**📌 Contexte**", "", v.contexte, "",
    "**🎯 Objectifs d'apprentissage**", "", "À la fin de cette veille, tu dois être capable de :", "", ...v.objectifs.map((o) => `- ${o}`), "",
    "**📚 Plan à suivre**", "", ...v.plan.flatMap((x, i) => [`${NUM[i] ?? `${i + 1}.`} ${x.titre}`, "", ...x.points.map((pt) => `- ${pt}`), ""]),
    "**❓ Questions de réflexion**", "", "Tu dois répondre à ces questions dans ta présentation :", "", ...v.questions.map((q) => `- ${q}`), "",
    "**🔗 Ressources conseillées**", "", ...(v.ressources.length ? v.ressources.map((r) => `- ${r.source} – ${r.titre} : ${r.url}`) : ["- À compléter par le formateur"]), "",
    "**📦 Livrable attendu**", "",
    "- Une présentation (slides ou démo) de 30 minutes maximum", `- ${v.artefact || "Un schéma, un tableau comparatif ou une checklist"}`, `- Une démo : ${v.demo || "à préciser"}`, "- Les réponses aux questions de réflexion", "",
    "**✅ Critères d'évaluation**", "", ...v.criteres.map((c) => `- ${c}`), "- La présentation est claire et respecte le temps",
  ].join("\n");
}
const block = (title: string, f: CodeFile | null) => (f ? [title, "", "```" + fenceOf(f.file), f.code, "```", ""] : []);
export function renderLive(l: Live, day: string, n: number): string {
  let t = 0;
  const rows = l.deroule.map((x) => { const a = t; t += x.minutes; return `| ${a}–${t} | ${cell(x.etape)} | ${cell(x.notions)} |`; });
  return [
    `## ${dayFr(day)} — Live coding ${n || 1} : ${l.titre}`, "",
    "11:00 · 45 min · Live coding (formateur au clavier, apprenants qui codent en parallèle)", "",
    "**🎯 Objectifs pédagogiques**", "", ...l.objectifs.map((o) => `- ${o}`), "",
    "**📌 Contexte général**", "", l.contexte, "",
    "**⏱️ Déroulé**", "", "| Minutes | Étape | Notions montrées |", "| --- | --- | --- |", ...rows, "",
    ...block(`**💻 Starter — ${l.starter?.file}**`, l.starter),
    ...block(`**💻 ${l.support?.file} (minimal)**`, l.support),
    ...block(`**💻 Code final — ${l.final?.file}**`, l.final),
    ...(l.tests.length ? ["**🧪 Cas à tester en direct**", "", "| Champ / Action | Saisie | Résultat |", "| --- | --- | --- |",
      ...l.tests.map((x) => `| ${cell(x.action)} | ${x.saisie ? "`" + x.saisie.replace(/`/g, "'").replace(/\|/g, "\\|") + "`" : "—"} | ${cell(x.resultat)} |`), ""] : []),
    ...(l.attention ? ["**⚠️ Point d'attention**", "", l.attention, ""] : []),
    "**➕ Si le temps le permet**", "", ...l.extensions.map((x) => `- ${x}`), "",
    "**❓ Points de réflexion**", "", ...l.reflexion.map((x) => `- ${x}`), "",
    "**✅ Résultat attendu**", "", ...l.resultat.map((x) => `- ${x}`),
  ].join("\n");
}

// ------------------------------------------------------------------ the AI
const SITES = LINK_SITES.map(([h, path]) => `${h}${path === "/" ? "" : path}`).join(", ");
const SYS = `Tu prépares les activités quotidiennes d'une promotion de développeurs web débutants (YouCode, Maroc, formation « Développeur web et web mobile », première année).
- Veille : 09:15, 30 minutes. Les apprenants la préparent et la présentent. On s'adresse à l'apprenant avec « tu ».
- Live coding : 11:00, 45 minutes. Le formateur code au clavier, les apprenants codent en parallèle : chaque étape doit pouvoir être tapée en direct dans le temps donné.
Règles communes :
- Tout part du PROGRAMME : le sprint, la semaine du planning (objectif, concepts et exigences techniques, technologies) et les compétences visées. Plusieurs classes suivent ce programme avec des projets différents : ne parle d'aucun projet, brief, client ni entreprise.
- Exemples et données : simples et fictifs, choisis pour faire pratiquer le concept de la semaine (une liste d'utilisateurs, de tâches, de notes, de livres…), jamais le client ou le projet d'une classe. Prénoms marocains fictifs ; s'il y a des prix, en DH ; téléphones en 06/07.
- En français, phrases simples, aucun jargon sans explication. Les noms de code entre backticks (\`querySelector\`). Aucun emoji.
- N'exige jamais une notion d'une semaine suivante (voir HORS PÉRIMÈTRE) ni une notion pas encore vue.
- Liens : uniquement des pages dont tu es CERTAIN qu'elles existent, en français d'abord, sur ces sites seulement : ${SITES}. N'invente jamais d'URL.
Réponds UNIQUEMENT avec un objet JSON, sans texte autour.`;

const PLAN_SHAPE = `{"resume": "1 phrase : l'enjeu de la semaine pour les apprenants, à partir de ses objectifs ci-dessus (aucun nouvel objectif, aucun projet)",
 "jours": [{"date": "AAAA-MM-JJ", "veille": "titre court de la veille (un concept du programme)", "focus": "ce qu'elle couvre (1 phrase)", "progression": "la notion du programme que la classe doit atteindre à la fin du jour, avec la compétence visée (ex. Sélectionner et modifier le DOM — C4N1)", "live": "titre du live coding (le concept pratiqué, pas un client), seulement les jours avec live coding, sinon \\"\\"", "live_focus": "ce qu'on construit pour pratiquer le concept (1 phrase), sinon \\"\\""}],
 "besoins": [{"besoin": "ce dont les apprenants auront besoin cette semaine (une notion du programme)", "ou": "où c'est couvert (ex. Veille Lun 12/10, LC1)"}],
 "hors_perimetre": ["notion de la semaine suivante à ne pas exiger"],
 "points_ouverts": ["question à valider par le formateur"]}`;
const VEILLE_SHAPE = `{"titre": "titre de la veille",
 "contexte": "3 à 5 phrases : ce que l'apprenant sait déjà, pourquoi ce sujet maintenant, le lien avec les concepts et les compétences de la semaine",
 "objectifs": ["3 à 5 objectifs, chacun commence par un verbe d'action à l'infinitif (Expliquer, Utiliser, Choisir, Distinguer, Mettre en place…)"],
 "plan": [{"titre": "partie 1", "points": ["3 à 4 points à explorer"]}, {"titre": "partie 2", "points": ["3 à 4 points"]}, {"titre": "partie 3 (optionnelle)", "points": ["1 à 4 points"]}],
 "questions": ["2 à 3 questions qui font réfléchir (pourquoi, quand, que se passe-t-il si…), pas des définitions, chacune finit par ?"],
 "ressources": [{"titre": "titre de la page", "url": "https://…"}],
 "artefact": "l'artefact concret à produire : un schéma, un tableau comparatif ou une checklist (une ligne)",
 "demo": "ce qui doit être montré en direct (une ligne)",
 "criteres": ["3 à 4 critères observables"],
 "ecarte": []}
"ressources" : 3 à 4 liens, MDN en français et JavaScript.info en français d'abord (selon le sujet), plus un outil si utile.`;
const liveShape = (s: Stack) => {
  const S = STACKS[s];
  return `{"titre": "titre du live coding (le concept pratiqué)",
 "objectifs": ["3 objectifs, chacun commence par un verbe d'action à l'infinitif"],
 "contexte": "2 à 4 phrases : le concept du programme travaillé, la compétence visée, ce qu'on construit pour le pratiquer",
 "deroule": [{"minutes": 5, "etape": "Présenter le besoin et le starter", "notions": "…"}, {"minutes": 15, "etape": "un seul élément ou champ « à la main »", "notions": "…"}, {"minutes": 10, "etape": "généraliser (fonction, boucle…)", "notions": "…"}, {"minutes": 10, "etape": "cas particulier, envoi ou état", "notions": "…"}, {"minutes": 5, "etape": "Tester en direct, récap", "notions": ""}],
 "starter": {"fichier": "${S.starter}", "code": "…"},
 "support": ${S.support ? `{"fichier": "${S.support}", "code": "…"} (ou null)` : "null"},
 "final": {"fichier": "${S.final}", "code": "…"},
 "tests": [{"action": "champ ou action", "saisie": "valeur tapée", "resultat": "Valide / Invalide (raison)"}],
 "attention": "un piège à montrer et la règle à retenir, 2 à 3 phrases (ou \\"\\")",
 "extensions": ["1 à 2 idées si le temps le permet"],
 "reflexion": ["2 points de réflexion (questions)"],
 "resultat": ["ce que chaque apprenant a sur son écran à la fin", "ce qu'il sait expliquer"],
 "ecarte": []}
Règles du live coding :
- Langage de la semaine : ${S.label}. ${S.hint}
- Un seul petit objectif concret qui fait pratiquer un concept et une compétence de la semaine, réutilisable dans n'importe quel projet de la semaine. Construis progressivement : d'abord un élément « à la main », puis généralise.
- 4 ou 5 étapes dont les minutes font EXACTEMENT 45 au total.
- Données : 5 éléments maximum dans une liste, 3 propriétés maximum par objet ; formulaire de 3 champs maximum.
- Code final : 60 lignes maximum${S.fns ? ", 2 fonctions nommées maximum, avec `function`, `for...of` et des `if` simples" : ""}. Pas de motif avancé (objet de fonctions, DocumentFragment, lookahead dans une Regex, chaînages astucieux).
- Starter d'environ 25 lignes ; CSS donné tout fait, 6 règles maximum.
- Uniquement les notions des veilles de la semaine (ou d'avant).
- Commentaires courts en français, seulement là où ils aident.
- "tests" : surtout pour un formulaire (sinon []).`;
};

/**
 * What the AI knows about a week: the programme (sprint, weeks of the planning with their objective, concepts and
 * technologies, competencies), what's out of scope, the topics already done, ideas from earlier promotions.
 * Never a brief, a client or a theme: the classes of the programme run different projects.
 */
export function weekContext(p: Program, f: WeekFacts, done: string[] = []): string {
  const parts = f.weeks.map((w) => programmeBlock(p, w));
  if (f.next) parts.push(`HORS PÉRIMÈTRE (semaine ${f.next.n} du programme, à ne jamais exiger) :\n${(f.next.concepts || f.next.objective).slice(0, 1200)}`);
  const ideas = topicsFor(f.weeks, f.closing.length > 0);
  if (ideas.length) parts.push(`IDÉES DE SUJETS (veilles des promotions précédentes, simple inspiration : tu peux t'en servir, les reformuler ou en choisir d'autres ; le programme de la semaine reste la seule référence) :\n${ideas.map((x) => "- " + x).join("\n")}`);
  if (done.length) parts.push(`DÉJÀ COUVERT EN VEILLE (ne refais pas ces sujets) :\n${done.map((x) => "- " + x).join("\n")}`);
  return parts.join("\n\n");
}
/** The prompt of a week's plan. `kept`: items already written whose titles stay. */
export function weekPrompt(ctx: string, f: WeekFacts, kept: { day: string; kind: string; title: string }[] = []): string {
  const dayLine = (d: string) => `- ${d} (${dayFr(d)}) : veille${f.live.includes(d) ? " + live coding" : ""}${f.closing.includes(d) ? " — dernier jour de la semaine du programme : veille plus légère (bonnes pratiques, débogage, qualité)" : ""}`;
  const off = f.days.filter((d) => d.day >= f.from && d.day <= f.to && d.kind !== "work").map((d) => `- ${d.day} (${dayFr(d.day)}) : ${d.label}, aucune activité`);
  return [
    ctx,
    `PLANNING DE LA SEMAINE À PRÉPARER (une veille par jour ouvré, dans l'ordre où les concepts du programme s'enchaînent ; chaque jour fait progresser vers les compétences visées ; chaque live coding applique la veille du jour ou de la veille ; ne refais pas un sujet déjà couvert) :\n${f.work.map(dayLine).join("\n")}${off.length ? "\n" + off.join("\n") : ""}`,
    kept.length ? `DÉJÀ ÉCRITS (garde exactement ces titres) :\n${kept.map((r) => `- ${r.day} ${r.kind === "live" ? "live coding" : "veille"} : « ${r.title} »`).join("\n")}` : "",
    `Réponds UNIQUEMENT avec ce JSON :\n${PLAN_SHAPE}`,
  ].filter(Boolean).join("\n\n");
}
const planLines = (plan: WeekPlan, day: string) => `LES AUTRES JOURS DE LA SEMAINE (seulement pour ne pas répéter leurs sujets) :\n${plan.jours.filter((x) => x.date !== day).map((x) => `- ${dayFr(x.date)} : veille « ${x.veille} »${x.live ? ` ; live coding « ${x.live} »` : ""}`).join("\n") || "- (aucun)"}`;
/** How the teacher wants it regenerated: a totally new subject (away from the current one), or the same subject rewritten. */
export interface Regen { mode: "new" | "same"; current: string; theme: string }
export function regenBlock(r: Regen | null): string {
  if (!r) return "";
  if (r.mode === "same") return r.current ? `MÊME SUJET : le formateur garde le sujet actuel. Garde exactement le titre « ${r.current} » et réécris le contenu (nouvelle formulation, nouvel exemple si utile).` : "";
  return [
    `NOUVEAU SUJET : le formateur veut une activité TOTALEMENT DIFFÉRENTE de la version actuelle${r.current ? ` « ${r.current} »` : ""} : autre sujet, autre titre, autre exemple, autres données. Ne reprends ni ce titre ni son angle.`,
    r.theme ? `THÈME CHOISI PAR LE FORMATEUR : « ${r.theme} ». Le titre et tout le contenu portent sur ce thème (dans les concepts de la semaine).` : "Choisis toi-même un autre sujet utile, dans les concepts de la semaine, qui ne répète pas les autres jours.",
  ].join("\n");
}
/** What to write: with a proposal (or a new subject asked), the planned title is left out; otherwise the plan's day. */
const target = (what: string, day: string, title: string, focus: string, proposal: string, more = "", fresh = false) =>
  proposal || fresh ? `${what} : ${dayFr(day)} (${day}). Le sujet, l'exemple et les données viennent de la PROPOSITION DU FORMATEUR ci-dessous, dans les concepts de la semaine.${more}`
    : `${what} : ${dayFr(day)} (${day})${title ? `, titre prévu « ${title} », ${focus}` : ", choisis un sujet cohérent avec les concepts de la semaine, sans répéter les autres jours"}.${more}`;
/** The prompt of one veille (with the teacher's proposal, when there is one). */
export function veillePrompt(ctx: string, plan: WeekPlan, f: WeekFacts, day: string, proposal = "", outside: string[] = [], regen: Regen | null = null): string {
  const j = plan.jours.find((x) => x.date === day);
  return [ctx, planLines(plan, day),
    target("VEILLE À ÉCRIRE", day, j?.veille || "", `focus : ${j?.focus || "—"}${j?.progression ? `, la classe doit atteindre : ${j.progression}` : ""}`, proposal,
      f.closing.includes(day) ? " C'est le dernier jour de la semaine du programme : sujet plus léger (bonnes pratiques, débogage, qualité)." : "", regen?.mode === "new"),
    regenBlock(regen),
    proposalBlock(proposal, outside),
    `Réponds UNIQUEMENT avec ce JSON :\n${VEILLE_SHAPE}`].filter(Boolean).join("\n\n");
}
/** The prompt of one live coding: it knows the veilles of the week up to its day. */
export function livePrompt(ctx: string, plan: WeekPlan, f: WeekFacts, day: string, stack: Stack, veilles: string[], proposal = "", outside: string[] = [], regen: Regen | null = null): string {
  const j = plan.jours.find((x) => x.date === day);
  return [ctx, planLines(plan, day),
    `VEILLES DE LA SEMAINE JUSQU'À CE JOUR (le live coding n'utilise que ces notions et celles d'avant) :\n${veilles.join("\n") || "- (aucune)"}`,
    target(`LIVE CODING À ÉCRIRE (LC${f.live.indexOf(day) + 1 || 1})`, day, j?.live || "", `ce qu'on construit : ${j?.live_focus || "—"}`, proposal, "", regen?.mode === "new"),
    regenBlock(regen),
    proposalBlock(proposal, outside),
    `Réponds UNIQUEMENT avec ce JSON :\n${liveShape(stack)}`].filter(Boolean).join("\n\n");
}

async function askJson(env: Env, user: string, maxTokens: number): Promise<{ json: any; model: string }> {
  if (!(await aiBudgetOk(env, 2))) throw new ActivityError("ClassBot's free AI is used up for this class today: add your own AI key in Settings → AI (free with Groq or Gemini), or try again tomorrow.");
  await aiBudgetUse(env, 2);
  const messages: Msg[] = [{ role: "system", content: SYS }, { role: "user", content: user }];
  let why = "";
  // the class's own AIs, then Cloudflare's (like askReview, with room for a whole item)
  if (await hasKeyedAi(env)) {
    try { const r = await groqChat(env, messages, { maxTokens, temperature: 0.4, json: true, timeoutMs: 120000 }); return { json: extractJson(r.text), model: r.model }; }
    catch (e) { why = String((e as Error)?.message ?? e); }
  }
  try { const r = await workersChat(env, messages, { maxTokens: Math.max(maxTokens, 3500), temperature: 0.4, timeoutMs: 120000 }); return { json: extractJson(r.text), model: r.model }; }
  catch (e) { why = [why, String((e as Error)?.message ?? e)].filter(Boolean).join("; "); }
  const wait = perMinuteWait(why);
  throw new ActivityError(wait ? `The AI reached its per-minute limit: trying again in ${wait} s.`
    : /4006|neurons|daily/i.test(why) ? "Cloudflare's free AI limit for today is reached: add your own AI key in Settings → AI, or try again tomorrow."
    : `The AI didn't answer (${why.slice(0, 140) || "no answer"}). Try again in a minute.`, wait);
}
/** Ask, check, and ask once more with what's wrong. The better answer is kept, with the rules it still breaks. */
async function askChecked<T>(env: Env, user: string, maxTokens: number, clean: (j: any) => T, check: (x: T) => string[]): Promise<{ data: T; errors: string[]; model: string }> {
  let best: { data: T; errors: string[]; model: string } | null = null;
  let prompt = user;
  for (let i = 0; i < 2; i++) {
    const r = await askJson(env, prompt, maxTokens);
    let errors = ["la réponse n'était pas un objet JSON valide"];
    if (r.json) {
      const data = clean(r.json);
      errors = check(data);
      if (!best || errors.length < best.errors.length) best = { data, errors, model: r.model };
      if (!errors.length) break;
    }
    prompt = `${user}\n\nTA RÉPONSE PRÉCÉDENTE NE RESPECTE PAS CES RÈGLES :\n${errors.map((x) => "- " + x).join("\n")}\nCorrige-la et renvoie le JSON complet.`;
  }
  if (!best) throw new ActivityError("The AI didn't answer with usable JSON. Try again in a minute.");
  return best;
}

// ------------------------------------------------------------------ storage
export interface ActivityRow {
  id: number; guild_id: string; program: string | null; day: string; kind: string; week: number | null; title: string | null;
  data: string | null; md: string; warnings: string | null; edited: number; model: string | null; created_at: number; updated_at: number | null;
}
const parse = (s: string | null, def: any) => { try { return s ? JSON.parse(s) : def; } catch { return def; } };
export function itemView(r: ActivityRow) {
  const d = parse(r.data, {}) ?? {};
  const week = r.kind === "week";
  return {
    id: r.id, day: r.day, kind: r.kind, week: r.week, title: r.title, md: r.md, warnings: parse(r.warnings, []), edited: !!r.edited, model: r.model, updated_at: r.updated_at ?? r.created_at,
    // a veille or live coding: the teacher's last proposal (to start from it again)
    ...(!week && typeof d.proposal === "string" && d.proposal ? { proposal: d.proposal } : {}),
    // a week: its live coding days, and the titles planned for each day (shown while the items are written)
    ...(week ? { live: Array.isArray(d.live) ? d.live : [], plan: Array.isArray(d.plan?.jours) ? d.plan.jours.map((j: any) => ({ date: j.date, veille: j.veille, live: j.live })) : [] } : {}),
  };
}
async function saveRow(env: Env, gid: string, o: { program: string; day: string; kind: string; week: number | null; title: string; data: unknown; md: string; warnings: string[]; model: string }) {
  await run(env, `INSERT INTO activities (guild_id, program, day, kind, week, title, data, md, warnings, edited, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    ON CONFLICT (guild_id, day, kind) DO UPDATE SET program = excluded.program, week = excluded.week, title = excluded.title, data = excluded.data, md = excluded.md,
      warnings = excluded.warnings, edited = 0, model = excluded.model, updated_at = excluded.updated_at`,
    gid, o.program, o.day, o.kind, o.week, o.title, JSON.stringify(o.data), o.md, JSON.stringify(o.warnings), o.model, now(), now());
  return (await one<ActivityRow>(env, "SELECT * FROM activities WHERE guild_id = ? AND day = ? AND kind = ?", gid, o.day, o.kind))!;
}
const weekRows = (env: Env, gid: string, monday: string) =>
  all<ActivityRow>(env, "SELECT * FROM activities WHERE guild_id = ? AND day >= ? AND day <= ? ORDER BY day, kind", gid, monday, addDays(monday, 4));

export async function overridesOf(env: Env, gid: string): Promise<Overrides> {
  const r = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", `actoff:${gid}`);
  const o = parse(r?.v ?? null, {});
  return o && typeof o === "object" ? o : {};
}
/** The teacher marks a day: no activity ("off"), worked although it's a holiday ("on"), or back to the calendar (null). */
export async function setDay(env: Env, gid: string, day: string, mark: "off" | "on" | null) {
  if (!isIso(day)) throw new ActivityError("Pick a day.");
  const o = await overridesOf(env, gid);
  if (mark) o[day] = mark; else delete o[day];
  await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", `actoff:${gid}`, JSON.stringify(o), now());
  return o;
}

/** Everything the page shows for a range: the days, each week (the programme only, live coding days, notes), the saved items. */
export async function activitiesView(env: Env, g: GuildRow, from: string, to: string) {
  if (!isIso(from) || !isIso(to)) throw new ActivityError("Pick a start day and an end day.");
  if (to < from) [from, to] = [to, from];
  if (addDays(from, MAX_DAYS - 1) < to) throw new ActivityError(`Pick ${MAX_DAYS} days at most.`);
  const p = await programOf(env, g), ov = await overridesOf(env, g.id);
  const days = rangeDays(p, from, to, ov);
  const rows = await all<ActivityRow>(env, "SELECT * FROM activities WHERE guild_id = ? AND day >= ? AND day <= ? ORDER BY day, kind", g.id, mondayOf(from), to);
  const weeks = splitWeeks(days).map(({ monday }) => {
    const saved = rows.find((r) => r.kind === "week" && r.day === monday);
    const f = weekFacts(p, monday, from, to, saved ? parse(saved.data, {}).live ?? null : null, ov);
    return {
      monday, from: f.from, to: f.to, work: f.work, live: f.live, closing: f.closing,
      weeks: f.weeks.map((w) => ({ n: w.n, start: w.start, end: w.end, kind: w.kind, sprint: w.sprint, objective: weekObjectives(p, w).join(" · "), concepts: w.concepts, competencies: w.competencies, soft: w.soft,
        tech: techOfWeek(w), stack: STACKS[stackOf(techOfWeek(w))].label })),
      sprint: f.sprint ? { n: f.sprint.n, title: f.sprint.title } : null,
      // the weekdays of the range without activity, and why
      off: f.days.filter((d) => d.day >= f.from && d.day <= f.to && d.kind !== "work").map((d) => ({ day: d.day, kind: d.kind, label: d.label })),
      next: f.next ? { n: f.next.n, start: f.next.start } : null,
      notes: weekNotes(f),
    };
  });
  return { program: { id: p.id, name: p.name }, from, to, days, weeks, items: rows.map(itemView), overrides: ov };
}

/** The week's context for the AI, with the topics this class already covered (the 6 weeks before). */
async function contextOf(env: Env, g: GuildRow, p: Program, f: WeekFacts): Promise<string> {
  const done = await all<{ title: string }>(env, "SELECT title FROM activities WHERE guild_id = ? AND kind = 'veille' AND day < ? AND day >= ? ORDER BY day DESC LIMIT 15", g.id, f.monday, addDays(f.monday, -42));
  return weekContext(p, f, done.map((x) => x.title));
}

/** The week's plan ("Analyse de la semaine"): a title per day, in the order the programme's concepts come. `keep` keeps the titles already written. */
export async function generateWeek(env: Env, g: GuildRow, o: { monday: string; from: string; to: string; live?: string[] | null; keep?: boolean }) {
  if (!isIso(o.monday) || !isIso(o.from) || !isIso(o.to)) throw new ActivityError("Pick a start day and an end day.");
  const monday = mondayOf(o.monday);
  const p = await programOf(env, g), ov = await overridesOf(env, g.id);
  const f = weekFacts(p, monday, o.from, o.to, Array.isArray(o.live) ? o.live.filter(isIso) : null, ov);
  if (!f.work.length) throw new ActivityError("No working day this week (holiday, break, cross defense…): nothing to plan.");
  const rows = await weekRows(env, g.id, monday);
  const kept = o.keep ? rows.filter((r) => r.kind !== "week" && f.work.includes(r.day)) : [];
  const user = weekPrompt(await contextOf(env, g, p, f), f, kept.map((r) => ({ day: r.day, kind: r.kind, title: r.title || "" })));
  const r = await askChecked(env, user, 2500, (j) => cleanPlan(j, f.work), (x) => validatePlan(x, f));
  for (const k of kept) { const j = r.data.jours.find((x) => x.date === k.day); if (j && k.title) j[k.kind === "live" ? "live" : "veille"] = k.title; }
  const w = weekOf(p, f.work[0]);
  const row = await saveRow(env, g.id, { program: p.id, day: monday, kind: "week", week: w?.n ?? null, title: `Semaine du ${ddmm(monday)}`,
    data: { plan: r.data, live: f.live, from: f.from, to: f.to }, md: "", warnings: r.errors, model: r.model });
  await refreshWeek(env, g, p, monday, ov);
  return itemView((await one<ActivityRow>(env, "SELECT * FROM activities WHERE id = ?", row.id))!);
}

/** Write the week's overview and the live codings' numbers again from their JSON (not the ones edited by hand). */
async function refreshWeek(env: Env, g: GuildRow, p: Program, monday: string, ov: Overrides) {
  const rows = await weekRows(env, g.id, monday);
  const wk = rows.find((r) => r.kind === "week" && r.day === monday);
  if (!wk) return;
  const d = parse(wk.data, {});
  const f = weekFacts(p, monday, d.from || monday, d.to || addDays(monday, 4), Array.isArray(d.live) ? d.live : null, ov);
  const titles = { veille: {} as Record<string, string>, live: {} as Record<string, string> };
  for (const r of rows) if (r.kind !== "week" && r.title) titles[r.kind === "live" ? "live" : "veille"][r.day] = r.title;
  // a plan saved before (with brief steps in "avancement") is read again through cleanPlan: only the programme stays
  const plan = cleanPlan(d.plan ?? {}, (Array.isArray(d.plan?.jours) ? d.plan.jours : []).map((x: any) => String(x?.date ?? "")));
  if (!wk.edited) await run(env, "UPDATE activities SET md = ? WHERE id = ?", renderWeek(plan, f, weekLabels(p, f), titles, weekNotes(f)), wk.id);
  for (const r of rows.filter((x) => x.kind === "live" && !x.edited)) {
    const n = f.live.indexOf(r.day) + 1;
    const l = parse(r.data, null);
    if (l && n) await run(env, "UPDATE activities SET md = ? WHERE id = ?", renderLive({ ...cleanLive({}, "js"), ...l }, r.day, n), r.id);
  }
}

/** Where an item stands: its day, its week's plan, the programme week, what the class has seen. */
async function itemCtx(env: Env, g: GuildRow, day: string, kind: string) {
  if (!isIso(day) || !["veille", "live"].includes(kind)) throw new ActivityError("Pick a day and a kind (veille or live coding).");
  const p = await programOf(env, g), ov = await overridesOf(env, g.id);
  const info = dayInfo(p, day, ov);
  if (info.kind !== "work") throw new ActivityError(`No activity on ${day}: ${info.label}.`);
  const monday = mondayOf(day);
  const rows = await weekRows(env, g.id, monday);
  // no plan for the week (items that came from the shared library, or written before it): the programme is enough
  const wk = rows.find((r) => r.kind === "week" && r.day === monday);
  const d = wk ? parse(wk.data, {}) : {};
  const f = weekFacts(p, monday, d.from || monday, d.to || addDays(monday, 4), Array.isArray(d.live) ? d.live : null, ov);
  if (!wk) f.live = [...new Set([...f.live, ...rows.filter((r) => r.kind === "live").map((r) => r.day)])].filter((x) => f.work.includes(x)).sort();
  if (kind === "live" && !f.live.includes(day)) throw new ActivityError("No live coding planned on this day: turn it on for this day first.");
  const w = weekOf(p, day)!;
  const plan = cleanPlan(d.plan ?? {}, (Array.isArray(d.plan?.jours) ? d.plan.jours : []).map((x: any) => String(x?.date ?? "")));
  return { p, ov, monday, rows, f, w, plan, stack: stackOf(techOfWeek(w)), allowed: techSoFar(p, w) };
}
type ItemCtx = Awaited<ReturnType<typeof itemCtx>>;
const checkOf = (c: ItemCtx, kind: string) => (kind === "veille"
  ? (x: Veille) => validateVeille(x, c.allowed)
  : (x: Live) => validateLive(x, { stack: c.stack, allowed: c.allowed, concepts: conceptsSoFar(c.p, c.w) })) as (x: any) => string[];
const renderOf = (c: ItemCtx, kind: string, data: any, day: string) => (kind === "veille" ? renderVeille(data, day) : renderLive(data, day, c.f.live.indexOf(day) + 1));

/**
 * One veille or live coding, written from the week's plan; with the teacher's proposal as the main instruction.
 * Saved in place of the old one, unless `preview` (the teacher compares, then keeps it with keepItem).
 */
export async function generateItem(env: Env, g: GuildRow, o: { day: string; kind: string; proposal?: unknown; preview?: boolean; mode?: unknown; theme?: unknown }) {
  const c = await itemCtx(env, g, o.day, o.kind);
  const proposal = cleanProposal(o.proposal);
  const theme = String(o.theme ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  // Regenerate: a totally new subject (the current title is avoided), or the same subject rewritten
  const cur = c.rows.find((x) => x.kind === o.kind && x.day === o.day);
  const regen: Regen | null = o.mode === "new" || o.mode === "same" ? { mode: o.mode, current: cur?.title || "", theme: o.mode === "new" ? theme : "" } : null;
  const outside = proposalOutside([theme, proposal].filter(Boolean).join("\n"), c.allowed);
  const ctx = await contextOf(env, g, c.p, c.f);
  let r: { data: Veille | Live; errors: string[]; model: string };
  if (o.kind === "veille") r = await askChecked(env, veillePrompt(ctx, c.plan, c.f, o.day, proposal, outside, regen), 3000, cleanVeille, checkOf(c, "veille"));
  else {
    // the veilles of the week up to this day: the live coding uses only them (and what came before)
    const veilles = c.rows.filter((x) => x.kind === "veille" && x.day <= o.day).map((x) => {
      const v = parse(x.data, {});
      return `- ${dayFr(x.day)} : « ${x.title} »${Array.isArray(v.objectifs) ? ` (${v.objectifs.slice(0, 4).join(" ; ")})` : ""}`;
    });
    const planned = c.plan.jours.filter((x) => x.date <= o.day && !c.rows.some((y) => y.kind === "veille" && y.day === x.date)).map((x) => `- ${dayFr(x.date)} : « ${x.veille} » (${x.focus})`);
    r = await askChecked(env, livePrompt(ctx, c.plan, c.f, o.day, c.stack, [...veilles, ...planned], proposal, outside, regen), 4500, (x) => cleanLive(x, c.stack), checkOf(c, "live"));
  }
  if (regen?.mode === "same" && regen.current) r.data.titre = regen.current;
  const data = { ...r.data, proposal, ...(theme && regen?.mode === "new" ? { theme } : {}), ecarte: [...new Set([...outside.map((x) => `${x} (pas encore au programme)`), ...r.data.ecarte])].slice(0, 6) };
  const title = data.titre || c.plan.jours.find((x) => x.date === o.day)?.[o.kind === "live" ? "live" : "veille"] || (o.kind === "live" ? "Live coding" : "Veille");
  const md = renderOf(c, o.kind, data, o.day);
  if (o.preview) return { draft: { day: o.day, kind: o.kind, title, md, warnings: r.errors, ecarte: data.ecarte, data, model: r.model } };
  const saved = await saveRow(env, g.id, { program: c.p.id, day: o.day, kind: o.kind, week: c.w.n, title, data, md, warnings: r.errors, model: r.model });
  await refreshWeek(env, g, c.p, c.monday, c.ov);
  return { item: itemView((await one<ActivityRow>(env, "SELECT * FROM activities WHERE id = ?", saved.id))!) };
}
/** "Replace": the version the teacher previewed is saved (cleaned and checked again here, nothing is trusted), with their proposal. */
export async function keepItem(env: Env, g: GuildRow, o: { day: string; kind: string; data: unknown; proposal?: unknown; model?: unknown }) {
  const c = await itemCtx(env, g, o.day, o.kind);
  const data = { ...(o.kind === "veille" ? cleanVeille(o.data) : cleanLive(o.data, c.stack)), proposal: cleanProposal(o.proposal) };
  if (!data.titre) throw new ActivityError("This version is empty: generate it again.");
  const saved = await saveRow(env, g.id, { program: c.p.id, day: o.day, kind: o.kind, week: c.w.n, title: data.titre, data, md: renderOf(c, o.kind, data, o.day),
    warnings: checkOf(c, o.kind)(data), model: String(o.model ?? "").slice(0, 80) });
  await refreshWeek(env, g, c.p, c.monday, c.ov);
  return itemView((await one<ActivityRow>(env, "SELECT * FROM activities WHERE id = ?", saved.id))!);
}

/** The days with a live coding in a week (the live codings of the other days are removed). */
export async function setLiveDays(env: Env, g: GuildRow, monday: string, live: string[]) {
  if (!isIso(monday)) throw new ActivityError("Pick a week.");
  monday = mondayOf(monday);
  const p = await programOf(env, g), ov = await overridesOf(env, g.id);
  const wk = await one<ActivityRow>(env, "SELECT * FROM activities WHERE guild_id = ? AND day = ? AND kind = 'week'", g.id, monday);
  if (!wk) return null;
  const d = parse(wk.data, {});
  const keep = live.filter((x) => isIso(x) && dayInfo(p, x, ov).kind === "work" && mondayOf(x) === monday).sort();
  await run(env, "UPDATE activities SET data = ?, updated_at = ? WHERE id = ?", JSON.stringify({ ...d, live: keep }), now(), wk.id);
  const gone = (await weekRows(env, g.id, monday)).filter((r) => r.kind === "live" && !keep.includes(r.day));
  for (const r of gone) { await run(env, "DELETE FROM activities WHERE id = ?", r.id); await libGone(env, g.id, "activity", `${r.day}:${r.kind}`); }
  await refreshWeek(env, g, p, monday, ov);
  return { live: keep, removed: gone.map((r) => r.day) };
}

/** The teacher's own version of an item: its text, and its title (the card, the week's overview and the next Regenerate follow it). */
export async function editItem(env: Env, g: GuildRow, id: number, md: string, title?: unknown) {
  let text = String(md ?? "").replace(/\r\n?/g, "\n").slice(0, 30000);
  if (!text.trim()) throw new ActivityError("The text is empty: regenerate the item or delete it instead.");
  const row = await one<ActivityRow>(env, "SELECT * FROM activities WHERE id = ? AND guild_id = ?", id, g.id);
  if (!row) throw new ActivityError("This activity doesn't exist anymore.");
  let t = row.title || "";
  if (row.kind !== "week" && title !== undefined) {
    t = String(title ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
    if (!t) throw new ActivityError("Give it a title.");
    // the heading of the text says the title too ("## Mardi 27/10 — Veille : …"): it follows
    const lines = text.split("\n"), h = lines.findIndex((l) => /^##\s/.test(l));
    if (h >= 0 && /(Veille|Live coding[^:]*)\s*:\s*/.test(lines[h])) lines[h] = lines[h].replace(/((?:Veille|Live coding[^:]*)\s*:\s*).*$/, `$1${t}`);
    text = lines.join("\n");
  }
  const d = parse(row.data, {});
  if (row.kind !== "week" && d && typeof d === "object") d.titre = t;
  await run(env, "UPDATE activities SET md = ?, title = ?, data = ?, edited = 1, updated_at = ? WHERE id = ?", text, t, JSON.stringify(d), now(), id);
  if (row.kind !== "week" && t !== row.title) {
    // the week's plan says this title from now on (an unchanged Regenerate starts from it)
    const monday = mondayOf(row.day);
    const wk = await one<ActivityRow>(env, "SELECT * FROM activities WHERE guild_id = ? AND day = ? AND kind = 'week'", g.id, monday);
    if (wk) {
      const wd = parse(wk.data, {});
      const j = Array.isArray(wd?.plan?.jours) ? wd.plan.jours.find((x: any) => x?.date === row.day) : null;
      if (j) { j[row.kind === "live" ? "live" : "veille"] = t; await run(env, "UPDATE activities SET data = ? WHERE id = ?", JSON.stringify(wd), wk.id); }
    }
    await refreshWeek(env, g, await programOf(env, g), monday, await overridesOf(env, g.id)).catch(() => null);
  }
  return itemView((await one<ActivityRow>(env, "SELECT * FROM activities WHERE id = ?", id))!);
}
export async function deleteItem(env: Env, g: GuildRow, id: number) {
  const r = await one<ActivityRow>(env, "SELECT * FROM activities WHERE id = ? AND guild_id = ?", id, g.id);
  if (!r) return;
  await run(env, "DELETE FROM activities WHERE id = ?", id);
  await libGone(env, g.id, "activity", `${r.day}:${r.kind}`);
  if (r.kind !== "week") await refreshWeek(env, g, await programOf(env, g), mondayOf(r.day), await overridesOf(env, g.id));
}
