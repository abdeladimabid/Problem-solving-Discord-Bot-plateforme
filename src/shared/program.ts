// Programmes: the competency framework (référentiel) and the year planning a class follows.
// A class uses a built-in programme (the YouCode DWWM planning) or its own copy/import, so
// classes on other stacks (AI, MERN, Java…) can have their own competencies and weeks.
import type { Env, GuildRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { DWWM_2026 } from "./programs/dwwm-2026.ts";

export interface Competency { code: string; name: string; kind: "tech" | "soft" }
export interface ProgramSprint { n: number; weeks: number; title: string; objectives: string; situation: string; technologies: string; briefs: string; tech: string[]; soft: string[] }
export interface ProgramWeek {
  n: number; start: string; end: string;
  kind: "brief" | "break" | "crossdefense" | "certification" | "other";
  sprint: number | null; brief: number | null; days: number | null; mode: string;
  title: string; objective: string; concepts: string; competencies: string[]; soft: string[]; deliverables: string;
}
export interface Program { key: string; name: string; stack: string; lang: string; levels: string[]; referential: Competency[]; sprints: ProgramSprint[]; weeks: ProgramWeek[] }

export const BUILTIN: Program[] = [DWWM_2026];

/** "C3N2" → { code: "C3", level: 2 } (also accepts "CT3N2" for transversal ones, written T3). */
const compMemo = new Map<string, { code: string; level: number | null } | null>();
export function parseComp(s: string): { code: string; level: number | null } | null {
  const k = String(s);
  if (compMemo.has(k)) { const c = compMemo.get(k); return c ? { ...c } : null; }
  const m = k.trim().toUpperCase().match(/^(CT|C|T)(\d{1,2})(?:N(\d))?$/);
  const out = m ? { code: (m[1] === "C" ? "C" : "T") + m[2], level: m[3] ? Number(m[3]) : null } : null;
  if (compMemo.size > 2000) compMemo.clear();
  compMemo.set(k, out);
  return out ? { ...out } : null;
}
export const compLabel = (code: string) => (code.startsWith("T") ? "C" + code : code);   // T1 is shown as CT1, like the planning

/** The programme a class uses (its own copy if it has one, else the built-in it picked, else DWWM). */
export async function programOf(env: Env, g: Pick<GuildRow, "id"> & { program?: string | null }): Promise<Program & { id: string; custom: boolean }> {
  const ref = (g as any).program as string | null | undefined;
  if (ref?.startsWith("db:")) {
    const row = await one<{ id: number; data: string }>(env, "SELECT id, data FROM programs WHERE id = ? AND (guild_id = ? OR guild_id IS NULL)", Number(ref.slice(3)), g.id);
    if (row) { try { return { ...clean(JSON.parse(row.data)), id: ref, custom: true }; } catch { /* broken: fall back */ } }
  }
  const b = BUILTIN.find((p) => `builtin:${p.key}` === ref) ?? BUILTIN[0];
  return { ...b, id: `builtin:${b.key}`, custom: false };
}

export async function programList(env: Env, g: Pick<GuildRow, "id">) {
  const mine = await all<{ id: number; name: string; stack: string | null; updated_at: number | null }>(env, "SELECT id, name, stack, updated_at FROM programs WHERE guild_id = ? ORDER BY id", g.id);
  return [...BUILTIN.map((p) => ({ id: `builtin:${p.key}`, name: p.name, stack: p.stack, builtin: true })), ...mine.map((p) => ({ id: `db:${p.id}`, name: p.name, stack: p.stack, builtin: false, updated_at: p.updated_at }))];
}

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
/** Keep only what a programme needs, with sane sizes (it comes from the dashboard or an import). */
export function clean(p: any): Program {
  const referential: Competency[] = (Array.isArray(p?.referential) ? p.referential : []).slice(0, 60)
    .map((c: any) => ({ code: str(c.code, 8).toUpperCase().replace(/^CT/, "T"), name: str(c.name, 200), kind: c.kind === "soft" || /^T/.test(String(c.code).toUpperCase().replace(/^CT/, "T")) ? "soft" : "tech" }))
    .filter((c: Competency) => /^[CT]\d{1,2}$/.test(c.code) && c.name);
  const codes = (v: unknown) => (Array.isArray(v) ? v : String(v ?? "").split(/[,\s]+/)).map((x) => String(x).toUpperCase().replace(/^CT/, "T")).filter((x) => /^[CT]\d{1,2}(N\d)?$/.test(x)).slice(0, 20);
  const KINDS = ["brief", "break", "crossdefense", "certification", "other"];
  const weeks: ProgramWeek[] = (Array.isArray(p?.weeks) ? p.weeks : []).slice(0, 80).map((w: any, i: number) => ({
    n: Number(w.n) || i + 1, start: str(w.start, 10), end: str(w.end, 10), kind: KINDS.includes(w.kind) ? w.kind : "brief",
    sprint: w.sprint == null || w.sprint === "" ? null : Number(w.sprint) || null, brief: w.brief == null || w.brief === "" ? null : Number(w.brief) || null,
    days: w.days == null || w.days === "" ? null : Math.min(30, Math.max(1, Number(w.days) || 5)), mode: str(w.mode || "individuel", 30),
    title: str(w.title, 300), objective: str(w.objective, 2000), concepts: str(w.concepts, 4000), competencies: codes(w.competencies), soft: codes(w.soft), deliverables: str(w.deliverables, 1000),
  }));
  const sprints: ProgramSprint[] = (Array.isArray(p?.sprints) ? p.sprints : []).slice(0, 30).map((s: any, i: number) => ({
    n: Number(s.n) || i + 1, weeks: Number(s.weeks) || 0, title: str(s.title, 300), objectives: str(s.objectives, 3000), situation: str(s.situation, 300),
    technologies: str(s.technologies, 4000), briefs: str(s.briefs, 4000), tech: codes(s.tech), soft: codes(s.soft),
  }));
  return {
    key: str(p?.key || "custom", 40), name: str(p?.name || "Programme", 120), stack: str(p?.stack || "custom", 30), lang: p?.lang === "en" ? "en" : "fr",
    levels: Array.isArray(p?.levels) && p.levels.length ? p.levels.slice(0, 5).map((x: unknown) => str(x, 30)) : ["imiter", "adapter", "transposer"],
    referential: referential.length ? referential : DWWM_2026.referential, sprints, weeks,
  };
}

/** Save a class's own programme (a new one, or changes to one it owns). Returns its id ("db:<n>"). */
export async function saveProgram(env: Env, g: Pick<GuildRow, "id">, id: string | null, data: unknown): Promise<string> {
  const p = clean(data);
  if (id?.startsWith("db:")) {
    const r = await run(env, "UPDATE programs SET name = ?, stack = ?, data = ?, updated_at = ? WHERE id = ? AND guild_id = ?", p.name, p.stack, JSON.stringify(p), now(), Number(id.slice(3)), g.id);
    if (r.meta.changes) return id;
  }
  const r = await run(env, "INSERT INTO programs (guild_id, name, stack, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", g.id, p.name, p.stack, JSON.stringify(p), now(), now());
  return `db:${r.meta.last_row_id}`;
}

/** The week of the planning that contains a day (YYYY-MM-DD), or the next one. */
export function weekAt(p: Program, day: string): ProgramWeek | null {
  const inside = p.weeks.find((w) => w.start && w.end && w.start <= day && day <= w.end);
  return inside ?? p.weeks.find((w) => w.start > day) ?? null;
}
export const compName = (p: Program, code: string) => p.referential.find((c) => c.code === code)?.name ?? code;

// ------------------------------------------------------------ technologies
// What a brief may use. Tools (Figma, Git…) are never "outside" a brief; the others are, when the teacher didn't pick them.
export const TECHS: { name: string; rx: RegExp; tool?: boolean }[] = [
  { name: "HTML", rx: /\bhtml5?\b|balis(e|age) s[ée]mantique/i },
  { name: "CSS", rx: /\bcss3?\b|flexbox|\bgrid\b|media quer/i },
  { name: "Figma", rx: /figma|maquett|wirefram|zoning/i, tool: true },
  { name: "Git & GitHub", rx: /\bgit\b|github(?! pages)/i, tool: true },
  { name: "GitHub Pages", rx: /github pages|netlify|vercel|d[ée]ploi/i, tool: true },
  { name: "Trello / Jira", rx: /trello|jira|scrum|kanban|backlog/i, tool: true },
  { name: "Lighthouse / accessibility", rx: /lighthouse|wcag|axe dev|accessibilit/i, tool: true },
  { name: "Tailwind CSS", rx: /tailwind/i },
  { name: "Bootstrap", rx: /bootstrap/i },
  { name: "Sass", rx: /\bsass\b|\bscss\b/i },
  { name: "JavaScript", rx: /javascript|(?<![.\w/-])js\b(?!\s*:)|\bes6\b|ecmascript|addEventListener|querySelector/i },
  { name: "DOM", rx: /\bdom\b/i },
  { name: "Fetch / API", rx: /\bfetch\b|\bapi\b|\bajax\b|axios|\bjson\b/i },
  { name: "localStorage", rx: /localstorage|sessionstorage/i },
  { name: "TypeScript", rx: /typescript/i },
  { name: "PHP", rx: /\bphp\b/i },
  { name: "OOP", rx: /\bpoo\b|orient[ée]e? objet|classes? abstraites?|h[ée]ritage|encapsulation/i },
  { name: "SQL & database", rx: /\bsql\b|mysql|postgre|base de donn[ée]es|database|sch[ée]ma (er|e-r|relationnel|de (la )?(base|donn[ée]es))|\bmcd\b|\bmld\b|merise|tables? (relationnelle|sql)|cl[ée]s? [ée]trang[èe]re/i },
  { name: "PDO", rx: /\bpdo\b/i },
  { name: "MVC", rx: /\bmvc\b|contr[ôo]leur|\brouteur\b|router\b/i },
  { name: "UML", rx: /\buml\b|diagramme de (classes|cas d.utilisation|s[ée]quence)/i },
  { name: "Laravel", rx: /laravel|eloquent|blade\b|artisan/i },
  { name: "Docker", rx: /docker/i },
  { name: "Node.js & Express", rx: /node\.?js|\bexpress\b|\bnpm\b/i },
  { name: "MongoDB", rx: /mongo/i },
  { name: "React", rx: /\breact\b|jsx/i },
  { name: "Back-end & auth", rx: /back-?end|c[ôo]t[ée] serveur|authentification|mot de passe hach|session utilisateur/i },
];
const techByName = (n: string) => TECHS.find((t) => t.name.toLowerCase() === n.trim().toLowerCase());
/** Technologies a text talks about (catalog names). */
export function techFound(text: string): string[] {
  return TECHS.filter((t) => t.rx.test(text)).map((t) => t.name);
}
/** What a week of the planning uses (from its title, objective, concepts and deliverables). */
export function techOfWeek(w: ProgramWeek | null): string[] {
  if (!w) return [];
  const found = techFound([w.title, w.objective, w.concepts, w.deliverables].join("\n"));
  // a page is always HTML: CSS (or a CSS framework) means HTML too
  if (!found.includes("HTML") && found.some((t) => ["CSS", "Tailwind CSS", "Bootstrap", "Sass", "JavaScript", "React"].includes(t))) found.unshift("HTML");
  return found;
}
/** The catalog entries a text uses although the teacher didn't allow them (tools never count). */
export function techOutside(text: string, allowed: string[]): string[] {
  const ok = new Set<string>();
  for (const a of allowed) { const t = techByName(a); if (t) ok.add(t.name); for (const n of techFound(a)) ok.add(n); }
  // what comes with an allowed technology
  if (ok.has("JavaScript")) { ok.add("DOM"); ok.add("localStorage"); }
  if (ok.has("Laravel")) ["PHP", "OOP", "MVC", "SQL & database", "Back-end & auth"].forEach((n) => ok.add(n));
  if (ok.has("PHP")) ok.add("Back-end & auth");
  if (ok.has("Node.js & Express") || ok.has("MongoDB")) ["Back-end & auth", "JavaScript", "Fetch / API"].forEach((n) => ok.add(n));
  if (ok.has("React")) ["JavaScript", "DOM"].forEach((n) => ok.add(n));
  return TECHS.filter((t) => !t.tool && !ok.has(t.name) && t.rx.test(text)).map((t) => t.name);
}
