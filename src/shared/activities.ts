// Activités: the daily veilles (09:15, 30 min) and the live codings (11:00, 45 min, Tuesday and Thursday by default)
// of a date range, from the class's programme, its sprint and the briefs of those days. The format is the teacher's
// reference: docs/activities/TEMPLATES_VEILLE_LIVE_CODING_DWWM_2026-2027.md (change both together).
//   • the days of a range: weekends, public holidays, breaks, cross defenses (SC), certification, the teacher's own
//     days off; the days that get a live coding; the range cut in weeks (Monday → Friday)
//   • the AI answers JSON, one call per item (the week's plan, then each veille, then each live coding): a whole week
//     in one answer gets cut. Every item is checked (sections, sizes, a déroulé of 45 min, the code, the links) and
//     asked again once with what's wrong; still wrong, it's kept with its warnings for the teacher.
//   • the markdown is written here from the JSON, so every item has the template's sections, in its order.
import type { Env, GuildRow } from "./types.ts";
import { aiBudgetOk, aiBudgetUse, all, now, one, run } from "./db.ts";
import { extractJson, groqChat, hasKeyedAi, workersChat } from "./ai.ts";
import type { Msg } from "./ai.ts";
import { perMinuteWait } from "./aikeys.ts";
import { compLabel, parseComp, programOf, techOfWeek, techOutside } from "./program.ts";
import type { Program, ProgramSprint, ProgramWeek } from "./program.ts";
import { getBrief, weekBlock } from "./briefs.ts";

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
export interface DayInfo { day: string; dow: number; kind: DayKind; label: string; week: number | null; sprint: number | null; brief: number | null; approx?: boolean }
/** The teacher's changes: a working day without activities ("off"), a holiday that is worked after all ("on"). */
export type Overrides = Record<string, "off" | "on">;
const KIND_FR: Record<string, string> = { break: "Vacances", crossdefense: "Soutenances croisées", certification: "Certification", other: "Hors brief" };

/** The week of the programme that contains a day (none outside the planning). */
export const weekOf = (p: Program, day: string) => p.weeks.find((w) => w.start && w.end && w.start <= day && day <= w.end) ?? null;
export function dayInfo(p: Program, day: string, ov: Overrides = {}): DayInfo {
  const dow = dowOf(day), w = weekOf(p, day);
  const base = { day, dow, week: w?.n ?? null, sprint: w?.sprint ?? null, brief: w?.brief ?? null };
  if (dow > 5) return { ...base, kind: "weekend", label: "Week-end" };
  if (!w) return { ...base, kind: "outside", label: "Hors du programme" };
  if (w.kind !== "brief") return { ...base, kind: w.kind, label: `${KIND_FR[w.kind]}${w.title && w.title !== KIND_FR[w.kind] ? ` : ${w.title}` : ""}` };
  if (ov[day] === "off") return { ...base, kind: "off", label: "Pas d'activité (choix du formateur)" };
  const h = holidayOf(day);
  if (h && ov[day] !== "on") return { ...base, kind: "holiday", label: `Férié : ${h.label}${h.approx ? " (date estimée)" : ""}`, approx: h.approx };
  return { ...base, kind: "work", label: `S${w.n}${w.sprint ? ` · Sprint ${w.sprint}` : ""}${w.brief ? ` · Brief ${w.brief}` : ""}` };
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
/** The last working day of a programme week: the brief is handed in that evening, so its veille is lighter. */
export function submissionDay(p: Program, w: ProgramWeek, ov: Overrides = {}): string | null {
  for (let d = w.end, i = 0; d >= w.start && i < 40; d = addDays(d, -1), i++) if (dayInfo(p, d, ov).kind === "work") return d;
  return null;
}
/** The next week with a brief: its concepts are out of scope this week. */
export const nextBriefWeek = (p: Program, w: ProgramWeek) =>
  [...p.weeks].filter((x) => x.kind === "brief" && x.start > w.end).sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
/** What the class has seen up to a week (the technologies of every brief week until then). */
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

// When no published brief gives the client: one métier per sprint (fictional, Moroccan context).
export const METIERS = [
  "un riad à Marrakech (chambres, réservations, avis des clients)",
  "une coopérative d'huile d'argan à Agadir (produits, commandes, prix en DH)",
  "une auto-école à Casablanca (candidats, séances de conduite, moniteurs)",
  "une salle de sport à Rabat (cours collectifs, abonnements, coachs)",
  "une pharmacie de quartier à Fès (médicaments, stock, ordonnances)",
  "un food truck de msemen et harira à Tanger (menu, commandes, horaires)",
  "une agence de location de voitures à Oujda (véhicules, locations, clients)",
  "une librairie-café à Meknès (livres, événements, réservations de tables)",
];
export const metierOf = (sprint: number | null) => METIERS[(Math.max(1, sprint || 1) - 1) % METIERS.length];

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
  };
}
export function validateVeille(v: Veille): string[] {
  const e: string[] = [];
  if (v.titre.length < 3) e.push("le titre manque");
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
  resume: string; jours: { date: string; veille: string; focus: string; avancement: string; live: string; live_focus: string }[];
  besoins: { besoin: string; ou: string }[]; hors: string[]; points: string[];
}
export function cleanPlan(j: any, days: string[]): WeekPlan {
  const jours = (Array.isArray(j?.jours) ? j.jours : []).map((x: any) => ({
    date: String(x?.date ?? "").slice(0, 10), veille: line(x?.veille, 140), focus: line(x?.focus, 300), avancement: line(x?.avancement, 200), live: line(x?.live, 140), live_focus: line(x?.live_focus, 300),
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
  submission: string[];     // working days that end a programme week (the brief is handed in)
  next: ProgramWeek | null; // the next brief week: out of scope
}
export function weekFacts(p: Program, monday: string, from: string, to: string, live: string[] | null, ov: Overrides = {}): WeekFacts {
  const friday = addDays(monday, 4);
  const lo = from > monday ? from : monday, hi = to < friday ? to : friday;
  const days = rangeDays(p, monday, friday, ov);
  const inRange = days.filter((d) => d.day >= lo && d.day <= hi);
  const work = inRange.filter((d) => d.kind === "work").map((d) => d.day);
  const weeks: ProgramWeek[] = [];
  for (const d of work.length ? work : inRange.map((x) => x.day)) { const w = weekOf(p, d); if (w && !weeks.includes(w)) weeks.push(w); }
  const subs = new Set(weeks.map((w) => submissionDay(p, w, ov)));
  const last = weeks[weeks.length - 1];
  return {
    monday, from: lo, to: hi, days, work,
    live: (live ?? defaultLive(inRange)).filter((d) => work.includes(d)).sort(),
    weeks, sprint: p.sprints.find((s) => s.n === weeks.find((w) => w.sprint)?.sprint) ?? null,
    submission: work.filter((d) => subs.has(d)),
    next: last ? nextBriefWeek(p, last) : null,
  };
}
/** Open points the teacher should look at (found without the AI). */
export function weekNotes(p: Program, f: WeekFacts, published: number): string[] {
  const out: string[] = [];
  for (const w of f.weeks) if (w.kind === "brief" && !w.brief) out.push(`S${w.n} : pas de brief prévu dans le programme, les activités suivent l'intitulé de la semaine (« ${w.title.slice(0, 80)} »).`);
  if (f.weeks.length > 1) out.push(`Cette semaine couvre ${f.weeks.map((w) => `S${w.n}${w.brief ? ` (brief ${w.brief})` : ""}`).join(" et ")} : chaque jour suit le brief de sa semaine.`);
  for (const d of f.days) {
    if (d.day < f.from || d.day > f.to) continue;
    if ((d.dow === 2 || d.dow === 4) && (d.kind === "holiday" || d.kind === "off")) out.push(`${dayFr(d.day)} : ${d.label}, pas de live coding ce jour-là (choisis un autre jour si besoin).`);
    else if (d.kind === "holiday" && d.approx) out.push(`${dayFr(d.day)} : ${d.label}, à confirmer.`);
  }
  if (f.work.length && !published) out.push("Aucun brief publié dans l'application pour ces dates : le contexte vient du programme.");
  return out;
}

// ------------------------------------------------------------------ markdown (the template)
export interface WeekLabels { sprint: string; briefs: string[]; mode: string; comps: string[] }
export function weekLabels(p: Program, f: WeekFacts): WeekLabels {
  const comps: string[] = [];
  for (const w of f.weeks) for (const c of [...w.competencies, ...w.soft]) {
    const pc = parseComp(c);
    const label = pc ? `${compLabel(pc.code)}${pc.level ? "N" + pc.level : ""}` : c;
    if (!comps.includes(label)) comps.push(label);
  }
  return {
    sprint: f.sprint ? `sprint ${f.sprint.n} « ${f.sprint.title} »` : "",
    briefs: f.weeks.map((w) => (w.brief ? `brief ${w.brief} « ${w.title} »` : `« ${w.title} »`)),
    mode: [...new Set(f.weeks.map((w) => w.mode).filter(Boolean))].join(" puis "),
    comps,
  };
}
const SUBMIT = "Finitions, README, déploiement, soumission avant 23:59";
/** "## Analyse de la semaine": the template's overview. `titles` are the titles of the items already written. */
export function renderWeek(pl: WeekPlan, f: WeekFacts, lb: WeekLabels, titles: { veille: Record<string, string>; live: Record<string, string> } = { veille: {}, live: {} }, notes: string[] = []): string {
  const lo = f.from, hi = f.to;
  const span = lo.slice(5, 7) === hi.slice(5, 7) ? `${lo.slice(8, 10)}–${ddmm(hi)}/${hi.slice(0, 4)}` : `${ddmm(lo)}–${ddmm(hi)}/${hi.slice(0, 4)}`;
  const head = [`Semaine ${f.weeks.map((w) => w.n).join(" et ") || "—"} (${span})`, lb.sprint, lb.briefs.join(" puis "), lb.mode, lb.comps.length ? `compétences ${lb.comps.join(", ")}` : ""].filter(Boolean).join(", ") + ".";
  const rows = f.days.filter((d) => d.day >= lo && d.day <= hi).map((d) => {
    if (d.kind !== "work") return `| ${dayShort(d.day)} | ${cell(d.label)} | — | — |`;
    const j = pl.jours.find((x) => x.date === d.day);
    const n = f.live.indexOf(d.day) + 1;
    const lc = n ? `LC${n} : ${cell(titles.live[d.day] || j?.live || "à préparer")}` : "—";
    return `| ${dayShort(d.day)} | ${cell(titles.veille[d.day] || j?.veille || "à préparer")} | ${lc} | ${f.submission.includes(d.day) ? SUBMIT : cell(j?.avancement || "")} |`;
  });
  const next = f.next ? `S${f.next.n}${f.next.brief ? ` · brief ${f.next.brief}` : ""} : ${f.next.title}` : "fin du programme";
  const points = [...notes, ...pl.points];
  return [
    "## Analyse de la semaine", "",
    [head, pl.resume].filter(Boolean).join(" "), "",
    "| Jour | Veille 09:15 (30 min) | Live coding 11:00 (45 min) | Avancement attendu du brief |",
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
- En français, phrases simples, aucun jargon sans explication. Les noms de code entre backticks (\`querySelector\`). Aucun emoji.
- N'exige jamais une notion d'une semaine suivante (voir HORS PÉRIMÈTRE) ni une notion pas encore vue.
- Noms fictifs, contexte marocain, prix en DH, téléphones en 06/07.
- Liens : uniquement des pages dont tu es CERTAIN qu'elles existent, en français d'abord, sur ces sites seulement : ${SITES}. N'invente jamais d'URL.
Réponds UNIQUEMENT avec un objet JSON, sans texte autour.`;

const PLAN_SHAPE = `{"resume": "1 phrase : l'enjeu de la semaine pour les apprenants",
 "jours": [{"date": "AAAA-MM-JJ", "veille": "titre court de la veille", "focus": "ce qu'elle couvre (1 phrase)", "avancement": "étape du brief attendue à la fin du jour", "live": "titre du live coding, seulement les jours avec live coding, sinon \\"\\"", "live_focus": "ce qu'on construit (1 phrase), sinon \\"\\""}],
 "besoins": [{"besoin": "ce dont les apprenants auront besoin pour le brief", "ou": "où c'est couvert (ex. Veille Lun 12/10, LC1)"}],
 "hors_perimetre": ["notion de la semaine suivante à ne pas exiger"],
 "points_ouverts": ["question à valider par le formateur"]}`;
const VEILLE_SHAPE = `{"titre": "titre de la veille",
 "contexte": "3 à 5 phrases : ce que l'apprenant sait déjà, pourquoi ce sujet maintenant, le lien avec le brief",
 "objectifs": ["3 à 5 objectifs, chacun commence par un verbe d'action à l'infinitif (Expliquer, Utiliser, Choisir, Distinguer, Mettre en place…)"],
 "plan": [{"titre": "partie 1", "points": ["3 à 4 points à explorer"]}, {"titre": "partie 2", "points": ["3 à 4 points"]}, {"titre": "partie 3 (optionnelle)", "points": ["1 à 4 points"]}],
 "questions": ["2 à 3 questions qui font réfléchir (pourquoi, quand, que se passe-t-il si…), pas des définitions, chacune finit par ?"],
 "ressources": [{"titre": "titre de la page", "url": "https://…"}],
 "artefact": "l'artefact concret à produire : un schéma, un tableau comparatif ou une checklist (une ligne)",
 "demo": "ce qui doit être montré en direct (une ligne)",
 "criteres": ["3 à 4 critères observables"]}
"ressources" : 3 à 4 liens, MDN en français et JavaScript.info en français d'abord (selon le sujet), plus un outil si utile.`;
const liveShape = (s: Stack) => {
  const S = STACKS[s];
  return `{"titre": "titre du live coding",
 "objectifs": ["3 objectifs, chacun commence par un verbe d'action à l'infinitif"],
 "contexte": "2 à 4 phrases : le besoin du client, ce qu'on construit, la partie du brief concernée",
 "deroule": [{"minutes": 5, "etape": "Présenter le besoin et le starter", "notions": "…"}, {"minutes": 15, "etape": "un seul élément ou champ « à la main »", "notions": "…"}, {"minutes": 10, "etape": "généraliser (fonction, boucle…)", "notions": "…"}, {"minutes": 10, "etape": "cas particulier, envoi ou état", "notions": "…"}, {"minutes": 5, "etape": "Tester en direct, récap", "notions": ""}],
 "starter": {"fichier": "${S.starter}", "code": "…"},
 "support": ${S.support ? `{"fichier": "${S.support}", "code": "…"} (ou null)` : "null"},
 "final": {"fichier": "${S.final}", "code": "…"},
 "tests": [{"action": "champ ou action", "saisie": "valeur tapée", "resultat": "Valide / Invalide (raison)"}],
 "attention": "un piège à montrer et la règle à retenir, 2 à 3 phrases (ou \\"\\")",
 "extensions": ["1 à 2 idées si le temps le permet"],
 "reflexion": ["2 points de réflexion (questions)"],
 "resultat": ["ce que chaque apprenant a sur son écran à la fin", "ce qu'il sait expliquer"]}
Règles du live coding :
- Langage de la semaine : ${S.label}. ${S.hint}
- Un seul petit objectif concret, réutilisable tel quel dans le brief. Construis progressivement : d'abord un élément « à la main », puis généralise.
- 4 ou 5 étapes dont les minutes font EXACTEMENT 45 au total.
- Données : 5 éléments maximum dans une liste, 3 propriétés maximum par objet ; formulaire de 3 champs maximum.
- Code final : 60 lignes maximum${S.fns ? ", 2 fonctions nommées maximum, avec `function`, `for...of` et des `if` simples" : ""}. Pas de motif avancé (objet de fonctions, DocumentFragment, lookahead dans une Regex, chaînages astucieux).
- Starter d'environ 25 lignes ; CSS donné tout fait, 6 règles maximum.
- Uniquement les notions des veilles de la semaine (ou d'avant).
- Commentaires courts en français, seulement là où ils aident.
- "tests" : surtout pour un formulaire (sinon []).`;
};

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
  const d = r.kind === "week" ? parse(r.data, {}) : null;
  return {
    id: r.id, day: r.day, kind: r.kind, week: r.week, title: r.title, md: r.md, warnings: parse(r.warnings, []), edited: !!r.edited, model: r.model, updated_at: r.updated_at ?? r.created_at,
    ...(d ? { live: Array.isArray(d.live) ? d.live : [], planned: Array.isArray(d.plan?.jours) ? d.plan.jours.map((j: any) => j.date) : [] } : {}),
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

// the briefs given in the app for some dates (not the drafts)
interface BriefLite { id: number; week: number | null; title: string; status: string; start: string; due: string }
async function publishedBriefs(env: Env, gid: string, p: Program): Promise<BriefLite[]> {
  const rows = await all<{ id: number; week: number | null; title: string; status: string; start_at: number | null; due_at: number | null }>(env,
    "SELECT id, week, title, status, start_at, due_at FROM briefs WHERE guild_id = ? AND status != 'draft'", gid);
  const iso = (u: number | null) => (u ? new Date(u * 1000).toISOString().slice(0, 10) : "");
  return rows.map((b) => { const w = p.weeks.find((x) => x.n === b.week); return { id: b.id, week: b.week, title: b.title, status: b.status, start: iso(b.start_at) || w?.start || "", due: iso(b.due_at) || w?.end || "" }; })
    .filter((b) => b.start && b.due);
}
const overlaps = (b: BriefLite, lo: string, hi: string) => b.start <= hi && b.due >= lo;

/** Everything the page shows for a range: the days, each week (programme, briefs, live coding days, notes), the saved items. */
export async function activitiesView(env: Env, g: GuildRow, from: string, to: string) {
  if (!isIso(from) || !isIso(to)) throw new ActivityError("Pick a start day and an end day.");
  if (to < from) [from, to] = [to, from];
  if (addDays(from, MAX_DAYS - 1) < to) throw new ActivityError(`Pick ${MAX_DAYS} days at most.`);
  const p = await programOf(env, g), ov = await overridesOf(env, g.id);
  const days = rangeDays(p, from, to, ov);
  const rows = await all<ActivityRow>(env, "SELECT * FROM activities WHERE guild_id = ? AND day >= ? AND day <= ? ORDER BY day, kind", g.id, mondayOf(from), to);
  const briefs = await publishedBriefs(env, g.id, p);
  const weeks = splitWeeks(days).map(({ monday }) => {
    const saved = rows.find((r) => r.kind === "week" && r.day === monday);
    const f = weekFacts(p, monday, from, to, saved ? parse(saved.data, {}).live ?? null : null, ov);
    const mine = briefs.filter((b) => overlaps(b, f.from, f.to));
    return {
      monday, from: f.from, to: f.to, work: f.work, live: f.live, submission: f.submission,
      weeks: f.weeks.map((w) => ({ n: w.n, start: w.start, end: w.end, kind: w.kind, sprint: w.sprint, brief: w.brief, mode: w.mode, title: w.title, objective: w.objective, concepts: w.concepts, competencies: w.competencies, soft: w.soft, stack: STACKS[stackOf(techOfWeek(w))].label })),
      sprint: f.sprint ? { n: f.sprint.n, title: f.sprint.title } : null,
      next: f.next ? { n: f.next.n, brief: f.next.brief, title: f.next.title } : null,
      briefs: mine, notes: weekNotes(p, f, mine.length),
    };
  });
  return { program: { id: p.id, name: p.name }, from, to, days, weeks, items: rows.map(itemView), overrides: ov };
}

/** What the AI needs to know about a week: the programme, the briefs given, the métier, what's out of scope, what's done. */
async function contextOf(env: Env, g: GuildRow, p: Program, f: WeekFacts): Promise<string> {
  const parts = f.weeks.map((w) => weekBlock(p, w));
  const briefs = (await publishedBriefs(env, g.id, p)).filter((b) => overlaps(b, f.from, f.to)).slice(0, 2);
  let client = "";
  for (const b of briefs) {
    const full = await getBrief(env, g, b.id);
    if (!full) continue;
    const d = full.data;
    parts.push(`BRIEF PUBLIÉ DANS L'APPLICATION : « ${d.title} »${d.summary ? `\n${d.summary}` : ""}${d.context ? `\nContexte (début) :\n${d.context.slice(0, 1500)}` : ""}${d.groups.length ? `\nUser stories (extrait) :\n${d.groups.flatMap((x) => x.stories).slice(0, 10).map((x) => "- " + x).join("\n")}` : ""}`);
    client ||= d.situation.title || d.context.split("\n").find((l) => l.trim().length > 30)?.slice(0, 300) || "";
  }
  parts.push(`MÉTIER DES LIVE CODINGS : ${client ? `celui du brief (${client})` : metierOf(f.sprint?.n ?? null)}. Garde le même métier toute la semaine.`);
  if (f.next) parts.push(`HORS PÉRIMÈTRE (semaine suivante, à ne jamais exiger) : S${f.next.n}${f.next.brief ? `, brief ${f.next.brief}` : ""} « ${f.next.title} »\n${f.next.concepts.slice(0, 1200)}`);
  const done = await all<{ title: string }>(env, "SELECT title FROM activities WHERE guild_id = ? AND kind = 'veille' AND day < ? AND day >= ? ORDER BY day DESC LIMIT 15", g.id, f.monday, addDays(f.monday, -42));
  if (done.length) parts.push(`DÉJÀ COUVERT EN VEILLE (ne refais pas ces sujets) :\n${done.map((x) => "- " + x.title).join("\n")}`);
  return parts.join("\n\n");
}

/** The week's plan ("Analyse de la semaine"): a title per day, in the order the brief needs them. `keep` keeps the titles already written. */
export async function generateWeek(env: Env, g: GuildRow, o: { monday: string; from: string; to: string; live?: string[] | null; keep?: boolean }) {
  if (!isIso(o.monday) || !isIso(o.from) || !isIso(o.to)) throw new ActivityError("Pick a start day and an end day.");
  const monday = mondayOf(o.monday);
  const p = await programOf(env, g), ov = await overridesOf(env, g.id);
  const f = weekFacts(p, monday, o.from, o.to, Array.isArray(o.live) ? o.live.filter(isIso) : null, ov);
  if (!f.work.length) throw new ActivityError("No working day this week (holiday, break, cross defense…): nothing to plan.");
  const rows = await weekRows(env, g.id, monday);
  const kept = o.keep ? rows.filter((r) => r.kind !== "week" && f.work.includes(r.day)) : [];
  const dayLine = (d: string) => `- ${d} (${dayFr(d)}) : veille${f.live.includes(d) ? " + live coding" : ""}${f.submission.includes(d) ? " — jour de soumission du brief : veille plus légère (bonnes pratiques, débogage, qualité)" : ""}`;
  const off = f.days.filter((d) => d.day >= f.from && d.day <= f.to && d.kind !== "work").map((d) => `- ${d.day} (${dayFr(d.day)}) : ${d.label}, aucune activité`);
  const user = [
    await contextOf(env, g, p, f),
    `PLANNING DE LA SEMAINE À PRÉPARER (une veille par jour ouvré, dans l'ordre où le brief en a besoin ; chaque live coding applique la veille du jour ou de la veille ; ne refais pas un sujet déjà couvert) :\n${f.work.map(dayLine).join("\n")}${off.length ? "\n" + off.join("\n") : ""}`,
    kept.length ? `DÉJÀ ÉCRITS (garde exactement ces titres) :\n${kept.map((r) => `- ${r.day} ${r.kind === "live" ? "live coding" : "veille"} : « ${r.title} »`).join("\n")}` : "",
    `Réponds UNIQUEMENT avec ce JSON :\n${PLAN_SHAPE}`,
  ].filter(Boolean).join("\n\n");
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
  const briefs = (await publishedBriefs(env, g.id, p)).filter((b) => overlaps(b, f.from, f.to));
  const plan: WeekPlan = { resume: "", jours: [], besoins: [], hors: [], points: [], ...(d.plan ?? {}) };
  if (!wk.edited) await run(env, "UPDATE activities SET md = ? WHERE id = ?", renderWeek(plan, f, weekLabels(p, f), titles, weekNotes(p, f, briefs.length)), wk.id);
  for (const r of rows.filter((x) => x.kind === "live" && !x.edited)) {
    const n = f.live.indexOf(r.day) + 1;
    const l = parse(r.data, null);
    if (l && n) await run(env, "UPDATE activities SET md = ? WHERE id = ?", renderLive({ ...cleanLive({}, "js"), ...l }, r.day, n), r.id);
  }
}

/** One veille or live coding, written from the week's plan. Saved (in place of the old one) with its warnings. */
export async function generateItem(env: Env, g: GuildRow, o: { day: string; kind: string }) {
  if (!isIso(o.day) || !["veille", "live"].includes(o.kind)) throw new ActivityError("Pick a day and a kind (veille or live coding).");
  const p = await programOf(env, g), ov = await overridesOf(env, g.id);
  const info = dayInfo(p, o.day, ov);
  if (info.kind !== "work") throw new ActivityError(`No activity on ${o.day}: ${info.label}.`);
  const monday = mondayOf(o.day);
  const rows = await weekRows(env, g.id, monday);
  const wk = rows.find((r) => r.kind === "week" && r.day === monday);
  if (!wk) throw new ActivityError("Generate the week's plan first.");
  const d = parse(wk.data, {});
  const f = weekFacts(p, monday, d.from || monday, d.to || addDays(monday, 4), Array.isArray(d.live) ? d.live : null, ov);
  if (o.kind === "live" && !f.live.includes(o.day)) throw new ActivityError("No live coding planned on this day: turn it on for this day first.");
  const w = weekOf(p, o.day)!;
  const plan: WeekPlan = { resume: "", jours: [], besoins: [], hors: [], points: [], ...(d.plan ?? {}) };
  const j = plan.jours.find((x) => x.date === o.day);
  const planText = `PLAN DE LA SEMAINE :\n${plan.jours.map((x) => `- ${dayFr(x.date)} : veille « ${x.veille} »${x.live ? ` ; live coding « ${x.live} »` : ""}`).join("\n")}`;
  const ctx = await contextOf(env, g, p, f);
  let saved;
  if (o.kind === "veille") {
    const user = [ctx, planText,
      `VEILLE À ÉCRIRE : ${dayFr(o.day)} (${o.day})${j ? `, titre prévu « ${j.veille} », focus : ${j.focus}${j.avancement ? `, le brief en est à : ${j.avancement}` : ""}` : ", choisis un sujet cohérent avec le plan, sans répéter les autres jours"}.${f.submission.includes(o.day) ? " C'est le jour de soumission du brief : sujet plus léger (bonnes pratiques, débogage, qualité)." : ""}`,
      `Réponds UNIQUEMENT avec ce JSON :\n${VEILLE_SHAPE}`].join("\n\n");
    const r = await askChecked(env, user, 3000, cleanVeille, validateVeille);
    saved = await saveRow(env, g.id, { program: p.id, day: o.day, kind: "veille", week: w.n, title: r.data.titre || j?.veille || "Veille", data: r.data, md: renderVeille(r.data, o.day), warnings: r.errors, model: r.model });
  } else {
    const stack = stackOf(techOfWeek(w));
    // the veilles of the week up to this day: the live coding uses only them (and what came before)
    const veilles = rows.filter((r) => r.kind === "veille" && r.day <= o.day).map((r) => {
      const v = parse(r.data, {});
      return `- ${dayFr(r.day)} : « ${r.title} »${Array.isArray(v.objectifs) ? ` (${v.objectifs.slice(0, 4).join(" ; ")})` : ""}`;
    });
    const planned = plan.jours.filter((x) => x.date <= o.day && !rows.some((r) => r.kind === "veille" && r.day === x.date)).map((x) => `- ${dayFr(x.date)} : « ${x.veille} » (${x.focus})`);
    const n = f.live.indexOf(o.day) + 1;
    const user = [ctx, planText,
      `VEILLES DE LA SEMAINE JUSQU'À CE JOUR (le live coding n'utilise que ces notions et celles d'avant) :\n${[...veilles, ...planned].join("\n") || "- (aucune)"}`,
      `LIVE CODING À ÉCRIRE : LC${n}, ${dayFr(o.day)} (${o.day})${j?.live ? `, titre prévu « ${j.live} », ce qu'on construit : ${j.live_focus}` : ", choisis un sujet cohérent avec la veille du jour"}.`,
      `Réponds UNIQUEMENT avec ce JSON :\n${liveShape(stack)}`].join("\n\n");
    const r = await askChecked(env, user, 4500, (x) => cleanLive(x, stack), (x) => validateLive(x, { stack, allowed: techSoFar(p, w), concepts: conceptsSoFar(p, w) }));
    saved = await saveRow(env, g.id, { program: p.id, day: o.day, kind: "live", week: w.n, title: r.data.titre || j?.live || "Live coding", data: r.data, md: renderLive(r.data, o.day, n), warnings: r.errors, model: r.model });
  }
  await refreshWeek(env, g, p, monday, ov);
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
  for (const r of gone) await run(env, "DELETE FROM activities WHERE id = ?", r.id);
  await refreshWeek(env, g, p, monday, ov);
  return { live: keep, removed: gone.map((r) => r.day) };
}

/** The teacher's own version of an item. */
export async function editItem(env: Env, g: GuildRow, id: number, md: string) {
  const text = String(md ?? "").replace(/\r\n?/g, "\n").slice(0, 30000);
  if (!text.trim()) throw new ActivityError("The text is empty: regenerate the item or delete it instead.");
  const r = await run(env, "UPDATE activities SET md = ?, edited = 1, updated_at = ? WHERE id = ? AND guild_id = ?", text, now(), id, g.id);
  if (!r.meta.changes) throw new ActivityError("This activity doesn't exist anymore.");
  return itemView((await one<ActivityRow>(env, "SELECT * FROM activities WHERE id = ?", id))!);
}
export async function deleteItem(env: Env, g: GuildRow, id: number) {
  const r = await one<ActivityRow>(env, "SELECT * FROM activities WHERE id = ? AND guild_id = ?", id, g.id);
  if (!r) return;
  await run(env, "DELETE FROM activities WHERE id = ?", id);
  if (r.kind !== "week") await refreshWeek(env, g, await programOf(env, g), mondayOf(r.day), await overridesOf(env, g.id));
}
