// A class's programme from an Excel workbook: ClassBot's template (sheets Programme, Référentiel, Sprints, Planning)
// or a YouCode-style planning ("Planning Annuel" + "02_Sprints"). The browser reads the .xlsx and sends the rows;
// here the rows become a programme, with warnings for what couldn't be read.
import type { Program } from "./program.ts";
import { clean } from "./program.ts";

type Rows = unknown[][];
const cell = (v: unknown) => String(v ?? "").replace(/\r/g, "").trim();
const norm = (v: unknown) => cell(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

/** "C1N1, CT2N1, C3" (also "C1N1 – C2", "CT5NN3"…) → ["C1N1", "T2N1", "C3"] */
export function compCodes(v: unknown): string[] {
  const out: string[] = [];
  for (const m of cell(v).toUpperCase().matchAll(/\b(CT|C|T)\s?(\d{1,2})(?:\s*N+\s*(\d))?/g)) {
    const code = (m[1] === "C" ? "C" : "T") + m[2] + (m[3] ? "N" + m[3] : "");
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

/** A date written any way Excel or a teacher writes it → "YYYY-MM-DD" ("" if unreadable). */
export function isoDate(v: unknown): string {
  const s = cell(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).toISOString().slice(0, 10);   // Excel serial
  return "";
}

/** The header row of a sheet (the first row with at least `min` of the words) and the column of each wanted header. */
function header(rows: Rows, want: Record<string, RegExp>, min = 2): { at: number; col: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i] ?? [];
    const col: Record<string, number> = {};
    for (const [k, rx] of Object.entries(want)) {
      const j = r.findIndex((c) => rx.test(norm(c)));
      if (j >= 0) col[k] = j;
    }
    if (Object.keys(col).length >= min) return { at: i, col };
  }
  return null;
}
const sheetLike = (sheets: Record<string, Rows>, rx: RegExp) => Object.entries(sheets).filter(([n]) => rx.test(norm(n)));

export function programFromSheets(sheets: Record<string, Rows>, base: Program, fileName = ""): { program: Program; warnings: string[] } {
  const warnings: string[] = [];
  // ---------------------------------------------------- general
  let name = "", stack = "", lang = base.lang, levels = base.levels;
  for (const [, rows] of sheetLike(sheets, /^programme?$|^program$|^general/)) {
    for (const r of rows) {
      const k = norm(r[0]), v = cell(r[1]);
      if (!v) continue;
      if (/^(nom|name|programme|program|titre)/.test(k)) name = v;
      else if (/^(stack|filiere|parcours)/.test(k)) stack = v;
      else if (/^(langue|language)/.test(k)) lang = /^en/i.test(v) ? "en" : "fr";
      else if (/^(niveaux|levels)/.test(k)) levels = v.split(/[,;/]+/).map((x) => x.trim()).filter(Boolean).slice(0, 5);
    }
  }
  if (!name) {
    // the title of a YouCode workbook ("Matrice des sprints DWWM 2026/2027"), else the file's name
    const t = Object.values(sheets).map((rows) => cell(rows[0]?.[0])).find((x) => /\d{4}/.test(x) && x.length < 120);
    name = t ? t.replace(/^(matrice des sprints|planning technique de formation)\s*[—–-]?\s*/i, "").trim() : fileName.replace(/\.xlsx?$/i, "").replace(/[_]+/g, " ").trim();
  }

  // ---------------------------------------------------- référentiel
  const referential: { code: string; name: string; kind: string }[] = [];
  const addComp = (codeRaw: string, nm: string, kindRaw = "") => {
    const code = compCodes(codeRaw)[0]?.replace(/N\d$/, "");
    if (!code || !nm || referential.some((c) => c.code === code)) return;
    referential.push({ code, name: nm.slice(0, 200), kind: /transv|soft|ct/i.test(kindRaw) || code.startsWith("T") ? "soft" : "tech" });
  };
  for (const [, rows] of sheetLike(sheets, /referentiel|competences|competencies|referential/)) {
    const h = header(rows, { code: /^code$|^competence$|^comp\.?$/, name: /intitule|libelle|nom|name|description|competence vis|^competence$/, kind: /type|nature|kind/ }, 2);
    if (!h) continue;
    for (const r of rows.slice(h.at + 1)) addComp(cell(r[h.col.code]), cell(r[h.col.name]), cell(r[h.col.kind]));
  }
  if (!referential.length) {
    // lines like "C1. Installer et configurer…" or "CT3 : Définir…" anywhere in the workbook
    for (const rows of Object.values(sheets)) for (const r of rows) for (const c of r) for (const line of cell(c).split("\n")) {
      const m = line.trim().match(/^((?:CT|C)\s?\d{1,2})\s*[.:–-]\s*(.{8,})$/i);
      if (m) addComp(m[1], m[2].trim());
    }
  }
  // competencies the planning uses but the file doesn't name: keep their names from the current programme
  const used = new Set<string>();

  // ---------------------------------------------------- sprints
  const sprints: any[] = [];
  for (const [, rows] of sheetLike(sheets, /sprint/)) {
    const h = header(rows, { n: /^sprint/, title: /^(sujet|titre|title|intitule)/, objectives: /objectif/, situation: /situation/, technologies: /technolog|concept/, briefs: /^briefs?/, tech: /techniques?|^competences$/, soft: /transversal/, weeks: /^semaines?$|^weeks?$|duree/ }, 3);
    if (!h) continue;
    for (const r of rows.slice(h.at + 1)) {
      const head = cell(r[h.col.n]);
      const m = head.match(/sprint\s*(\d+)/i) ?? (/^\d+$/.test(head) ? [head, head] : null);
      if (!m) continue;
      const wk = Number((head.match(/(\d+)\s*semaines?/i) ?? [])[1]) || Number(cell(r[h.col.weeks])) || 0;
      const tech = compCodes(r[h.col.tech]), soft = compCodes(r[h.col.soft]);
      [...tech, ...soft].forEach((c) => used.add(c.replace(/N\d$/, "")));
      sprints.push({ n: Number(m[1]), weeks: wk, title: cell(r[h.col.title]), objectives: cell(r[h.col.objectives]), situation: cell(r[h.col.situation]),
        technologies: cell(r[h.col.technologies]), briefs: cell(r[h.col.briefs]), tech, soft });
    }
    if (sprints.length) break;
  }

  // ---------------------------------------------------- weeks
  const weeks: any[] = [];
  const weekSheets = [...sheetLike(sheets, /planning annuel|^planning$|^weeks?$|^semaines$/), ...Object.entries(sheets)];
  for (const [, rows] of weekSheets) {
    const h = header(rows, { n: /^semaine|^week|^s$|^n°?$/, dates: /^dates?$|periode/, start: /^debut|^start|^du$/, end: /^fin$|^end|^au$/, activity: /sprint|activite|^type$/, sprint: /^sprint$/,
      brief: /^brief/, days: /^jours?$|^days$/, mode: /^mode|modalite|travail/, title: /intitule|^titre|^title/, objective: /^objectif/, concepts: /concept|exigence/,
      comps: /^competences?( techniques?)?( visees)?:?$|^competencies$/, soft: /transversal/, deliverables: /livrable|deliverable/ }, 4);
    if (!h || (h.col.dates === undefined && h.col.start === undefined)) continue;
    let n = 0;
    for (const r of rows.slice(h.at + 1)) {
      const label = cell(r[h.col.n]);
      if (!label && !cell(r[h.col.title])) continue;
      const dates = cell(r[h.col.dates]);
      const [d1, d2] = dates ? dates.split(/\s+[-–au]+\s+|\s*→\s*/) : [cell(r[h.col.start]), cell(r[h.col.end])];
      const start = isoDate(h.col.start !== undefined ? r[h.col.start] : d1), end = isoDate(h.col.end !== undefined ? r[h.col.end] : d2) || start;
      if (!start) continue;
      const act = cell(r[h.col.activity]);
      const kindCell = norm(r[h.col.activity]);
      const kind = /vacance|repos|conge|break|holiday/.test(kindCell) ? "break" : /soutenance|cross/.test(kindCell) ? "crossdefense"
        : /certif|fil rouge|jury/.test(kindCell) ? "certification" : /stage|fin de formation|^autre|^other/.test(kindCell) ? "other" : "brief";
      // their own columns first (ClassBot's template), else read in the "Sprint 1 / Brief 2 / (5 jours)" cell (YouCode)
      const num = (k: string, rx: RegExp) => (h.col[k] !== undefined && h.col[k] !== h.col.activity ? Number((cell(r[h.col[k]]).match(/\d+/) ?? [])[0]) || null : Number((act.match(rx) ?? [])[1]) || null);
      const sprint = num("sprint", /sprint\s*(\d+)/i), brief = num("brief", /brief\s*(\d+)/i), days = num("days", /(\d+)\s*jours?/i);
      const modeTxt = norm(r[h.col.mode]) || norm(act);
      const mode = h.col.mode !== undefined && cell(r[h.col.mode]) ? cell(r[h.col.mode]).toLowerCase().slice(0, 30) : /trinome/.test(modeTxt) ? "trinôme" : /binome/.test(modeTxt) ? "binôme" : /collectif|equipe|squad|groupe/.test(modeTxt) ? "collectif" : "individuel";
      const comps = compCodes(r[h.col.comps]);
      let soft = compCodes(r[h.col.soft]);
      const techOnly = comps.filter((c) => c.startsWith("C")), softIn = comps.filter((c) => c.startsWith("T"));
      if (!soft.length) soft = softIn.length ? softIn : (sprints.find((s) => s.n === sprint)?.soft ?? []);
      [...techOnly, ...soft].forEach((c) => used.add(c.replace(/N\d$/, "")));
      const wn = Number((label.match(/(\d+)/) ?? [])[1]) || ++n;
      n = wn;
      weeks.push({ n: wn, start, end, kind, sprint, brief: kind === "brief" ? brief : null, days: kind === "brief" ? days : null, mode,
        title: cell(r[h.col.title]), objective: cell(r[h.col.objective]).replace(/^-$/, ""), concepts: cell(r[h.col.concepts]).replace(/^-$/, ""),
        competencies: techOnly, soft, deliverables: cell(r[h.col.deliverables]).replace(/^-$/, "") });
    }
    if (weeks.length) break;
  }
  // the same week number twice (e.g. "Semaine 31" for the end of the training and the internship): keep both, renumbered
  weeks.forEach((w, i) => { if (i && w.n <= weeks[i - 1].n) w.n = weeks[i - 1].n + 1; });

  for (const code of used) {
    if (referential.some((c) => c.code === code)) continue;
    const old = base.referential.find((c) => c.code === code);
    if (old) referential.push({ ...old });
    else { referential.push({ code, name: code.replace(/^T/, "CT"), kind: code.startsWith("T") ? "soft" : "tech" }); warnings.push(`${code.replace(/^T/, "CT")} is used but its name isn't in the file: add it to the Référentiel sheet.`); }
  }
  referential.sort((a, b) => (a.code[0] === b.code[0] ? Number(a.code.slice(1)) - Number(b.code.slice(1)) : a.code[0] < b.code[0] ? -1 : 1));
  if (!weeks.length) warnings.push("No week found: the Planning sheet needs a header row with Semaine and Dates (or Début / Fin).");
  if (!sprints.length) warnings.push("No sprint found (optional): a Sprints sheet gives the objectives and transversal competencies of each sprint.");
  if (!referential.length) warnings.push("No competency found: fill the Référentiel sheet (Code, Compétence).");
  const program = clean({ key: "custom", name: name || "Programme", stack: stack || base.stack, lang, levels, referential, sprints, weeks });
  if (!referential.length) program.referential = [];
  return { program, warnings };
}
