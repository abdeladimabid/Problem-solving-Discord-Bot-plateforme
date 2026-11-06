// 🤖 ClassBot as a connector for Claude (a remote MCP server, « Streamable HTTP », answers in JSON).
//   POST /mcp/<key>     JSON-RPC: initialize, tools/list, tools/call, ping
// The key is the teacher's (Settings → Claude connector): made there, shown once, kept only as its SHA-256, revocable.
// Claude reads every class live (learners, Fiche niveaux, lacunes, briefs, debriefs, assessments, mises en situation,
// activities, plans d'action, and any page through api_get) and writes drafts (an assessment, a mise en situation, an
// activity, a plan d'action). A key with « full access » also writes everything (api_write: any action of the dashboard,
// launching, sending, deleting included): each change is kept in a log the teacher sees in Settings.
// Every tool goes through the dashboard's own API (the same checks as the page), as the teacher.
import type { Ctx, Env } from "../shared/types.ts";
import { all, one, run } from "../shared/db.ts";
import { handleApi } from "./api.ts";
import { applyAppSettings } from "../shared/appsettings.ts";
import { ROUTES } from "./mcproutes.ts";

const now = () => Math.floor(Date.now() / 1000);
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_OUT = 90_000;   // characters of one tool's answer (Claude gets the rest by asking narrower)

// ------------------------------------------------------------------ the keys
async function sha(s: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function newKey() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return "cbk_" + btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function mcpKeys(env: Env) {
  const rows = await all<{ id: number; label: string; created_at: number; last_used: number | null; uses: number; scope: string }>(env,
    "SELECT id, label, created_at, last_used, uses, scope FROM mcp_keys WHERE revoked_at IS NULL ORDER BY id DESC").catch(() => null);
  if (!rows) return { keys: [], log: [], needsMigration: true };
  // what Claude changed (the last ones), for the teacher to see
  const log = await all<{ at: number; tool: string; method: string | null; path: string | null; guild_id: string | null; status: number | null; key_id: number; label: string | null }>(env,
    "SELECT l.at, l.tool, l.method, l.path, l.guild_id, l.status, l.key_id, k.label FROM mcp_log l LEFT JOIN mcp_keys k ON k.id = l.key_id ORDER BY l.id DESC LIMIT 40").catch(() => []);
  return { keys: rows, log };
}
/** A new key: its connector URL is shown once (only its hash is kept). */
export async function createMcpKey(env: Env, origin: string, label: unknown, scope?: unknown) {
  const key = newKey();
  const name = String(label ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || "Claude";
  await run(env, "INSERT INTO mcp_keys (label, hash, created_at, uses, scope) VALUES (?, ?, ?, 0, ?)", name, await sha(key), now(), scope === "full" ? "full" : "drafts");
  // the dashboard's own address (where /mcp/ answers), never PUBLIC_URL: that one is the bot's (the learners' links)
  const base = origin.replace(/^http:/, "https:");
  return { url: `${base}/mcp/${key}`, ...(await mcpKeys(env)) };
}
export async function revokeMcpKey(env: Env, id: number) {
  await run(env, "UPDATE mcp_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", now(), id);
  return mcpKeys(env);
}
type Key = { id: number; scope: string };
async function keyOk(env: Env, key: string): Promise<Key | null> {
  if (!/^cbk_[\w-]{40,60}$/.test(key)) return null;
  const k = await one<Key>(env, "SELECT id, scope FROM mcp_keys WHERE hash = ? AND revoked_at IS NULL", await sha(key)).catch(() => null);
  if (k) await run(env, "UPDATE mcp_keys SET last_used = ?, uses = uses + 1 WHERE id = ?", now(), k.id).catch(() => null);
  return k;
}

// ------------------------------------------------------------------ the dashboard's API, as the teacher
class ToolError extends Error {}
type Call = (method: string, path: string, q?: Record<string, unknown>, body?: unknown) => Promise<any>;
// never through the connector: its own keys and log (a key can't make itself a new one, nor hide what it did)
const BLOCKED = /^\/(mcp-keys|mcp-log)(\/|$)/;
function caller(env: Env, ctx: Ctx, origin: string, key: Key, tool: string): Call {
  return async (method, path, q = {}, body) => {
    if (BLOCKED.test(path)) throw new ToolError("Not through the connector.");
    const u = new URL(`${origin}/api${path}`);
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
    const req = new Request(u.toString(), { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify({ ...(body as object || {}), ...(q.g ? { g: q.g } : {}) }) });
    const res = await handleApi(req, env, ctx, { email: "claude-connector", mode: "mcp" });
    // every change Claude makes is kept (the teacher sees them in Settings → Claude connector)
    if (method !== "GET") await run(env, "INSERT INTO mcp_log (key_id, at, tool, method, path, guild_id, status, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      key.id, now(), tool, method, path, q.g ? String(q.g) : null, res.status, JSON.stringify(body ?? {}).slice(0, 2000)).catch(() => null);
    const ct = res.headers.get("content-type") ?? "";
    const data: any = ct.includes("json") ? await res.json().catch(() => ({})) : await res.text();
    if (res.status >= 400) throw new ToolError(typeof data === "object" && data?.error ? String(data.error) : `ClassBot answered ${res.status}.`);
    return data;
  };
}

// a class by its id or (part of) its name; a learner by their id or name
async function classOf(api: Call, v: unknown): Promise<{ id: string; name: string }> {
  const list: any[] = await api("GET", "/guilds");
  const s = String(v ?? "").trim();
  if (!s) { if (list.length === 1) return { id: list[0].id, name: list[0].name }; throw new ToolError(`Which class? ${list.map((g) => `${g.name} (${g.id})`).join(", ")}`); }
  const g = list.find((x) => x.id === s) || list.find((x) => String(x.name || "").toLowerCase() === s.toLowerCase()) || list.find((x) => String(x.name || "").toLowerCase().includes(s.toLowerCase()));
  if (!g) throw new ToolError(`No class "${s}". The classes: ${list.map((x) => `${x.name} (${x.id})`).join(", ")}`);
  return { id: g.id, name: g.name };
}
async function learnerOf(api: Call, g: string, v: unknown): Promise<{ id: string; name: string }> {
  const list: any[] = await api("GET", "/students", { g });
  const s = String(v ?? "").trim().toLowerCase();
  const fold = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const st = list.find((x) => x.discord_id === s) || list.find((x) => fold(String(x.name || "")) === fold(s)) || list.find((x) => fold(String(x.name || "")).includes(fold(s)));
  if (!st) throw new ToolError(`No learner "${v}" in this class.`);
  return { id: st.discord_id, name: st.name };
}
// what Claude never needs (and shouldn't see): tokens, keys, e-mails, avatars, raw logs
const DROP = /^(token|tokens|key|keys|api_?key|secret|secrets|password|email|emails|avatar|avatar_url|webhook|webhooks|hash|logs|events|log|raw|files_raw|private_key|client_secret|ai_keys|providers)$/i;
function slim(x: any, depth = 0): any {
  if (Array.isArray(x)) return x.map((v) => slim(v, depth + 1));
  if (x && typeof x === "object") {
    const o: any = {};
    for (const [k, v] of Object.entries(x)) if (!DROP.test(k) && v !== null && v !== undefined && v !== "") o[k] = depth > 12 ? "…" : slim(v, depth + 1);
    return o;
  }
  // a JSON kept as text in a column (settings, league…): read, so its secrets go too
  if (typeof x === "string" && /^\s*[{[]/.test(x) && x.length < 200_000) { try { return slim(JSON.parse(x), depth + 1); } catch { /* plain text */ } }
  return typeof x === "string" && x.length > 8000 ? x.slice(0, 8000) + "…" : x;
}
const out = (data: unknown) => {
  let s = JSON.stringify(slim(data));
  if (s.length > MAX_OUT) s = s.slice(0, MAX_OUT) + `\n…(cut at ${MAX_OUT} characters: ask for something narrower)`;
  return s;
};

// ------------------------------------------------------------------ the tools
type Tool = { name: string; description: string; inputSchema: any; write?: boolean; full?: boolean; run: (a: any, api: Call) => Promise<unknown> };
const CLASS = { type: "string", description: "The class: its name (e.g. DevStorm) or its id. Optional when there is only one." };
const LEARNER = { type: "string", description: "The learner: their name (or part of it) or their Discord id." };
const obj = (props: Record<string, any>, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });

export const TOOLS: Tool[] = [
  { name: "list_classes", description: "The teacher's classes (Discord servers) in ClassBot: their name and id.", inputSchema: obj({}),
    run: async (_a, api) => (await api("GET", "/guilds")).map((g: any) => ({ id: g.id, name: g.name, players: g.players ?? g.n ?? undefined })) },
  { name: "class_overview", description: "A class at a glance: its learners (with their level when set), the programme's current sprint and week, recent activity.", inputSchema: obj({ class: CLASS }),
    run: async (a, api) => { const g = await classOf(api, a.class); const [ov, st, sp] = await Promise.all([api("GET", "/overview", { g: g.id }), api("GET", "/students", { g: g.id }), api("GET", "/sprints", { g: g.id }).catch(() => null)]);
      return { class: g, overview: ov, learners: st.map((s: any) => ({ id: s.discord_id, name: s.name, niveau: s.niveau, points: s.points, level: s.level })), sprints: sp }; } },
  { name: "class_diagnosis", description: "The diagnosis of a sprint for the whole class: objectives reached, the lacunes shared by the class, features not done, the learners to follow, suggested actions. Use it to target an assessment or a mise en situation on what the class misses most.", inputSchema: obj({ class: CLASS, sprint: { type: "number", description: "The sprint number (default: the current one)." } }),
    run: async (a, api) => { const g = await classOf(api, a.class); let n = Number(a.sprint) || 0;
      if (!n) { const sp: any = await api("GET", "/sprints", { g: g.id }); n = sp?.current ?? sp?.sprint ?? (Array.isArray(sp?.sprints) ? (sp.sprints.find((x: any) => x.current)?.n ?? sp.sprints[sp.sprints.length - 1]?.n) : 0); }
      if (!n) throw new ToolError("No sprint found: give its number.");
      return { class: g, sprint: n, diagnosis: await api("GET", `/sprints/${n}/diag`, { g: g.id }), levels: await api("GET", `/sprints/${n}`, { g: g.id }).catch(() => null) }; } },
  { name: "learner_profile", description: "Everything about one learner: their level journey, their lacunes (what they don't master yet), how to help them, their Fiche niveaux items (known / not known, with the proofs: assessments, mises en situation, debriefs, code), their results, their plans d'action.", inputSchema: obj({ class: CLASS, learner: LEARNER, sprint: { type: "number", description: "The sprint of the Fiche niveaux (default: the current one)." } }, ["learner"]),
    run: async (a, api) => { const g = await classOf(api, a.class); const s = await learnerOf(api, g.id, a.learner);
      const [ins, det, fiche, plans] = await Promise.all([api("GET", `/students/${s.id}/insight`, { g: g.id }).catch(() => null), api("GET", `/students/${s.id}`, { g: g.id }).catch(() => null),
        api("GET", "/concepts/mastery", { g: g.id, uid: s.id, sprint: a.sprint }).catch(() => null), api("GET", "/wplans", { g: g.id, student: s.id }).catch(() => null)]);
      return { class: g, learner: s, insight: ins, detail: det, fiche_niveaux: fiche, plans_d_action: plans }; } },
  { name: "fiche_niveaux", description: "The Fiche niveaux of the class: per sprint, the items (capacities) of each level (Critique, Faible, Moyen, Bon, Excellent) with their codes (S{n}.{C|F|M|B|E}{k}). The codes to link assessment and mise en situation questions to.", inputSchema: obj({ class: CLASS }),
    run: async (a, api) => { const g = await classOf(api, a.class); return { class: g, fiche: await api("GET", "/settings/concepts", { g: g.id }) }; } },
  { name: "list_briefs", description: "The briefs (projects) of a class: id, title, week, competencies, status.", inputSchema: obj({ class: CLASS }),
    run: async (a, api) => { const g = await classOf(api, a.class); return { class: g, briefs: await api("GET", "/briefs", { g: g.id }) }; } },
  { name: "brief_details", description: "One brief: its text, requirements and competencies.", inputSchema: obj({ class: CLASS, brief: { type: "number", description: "The brief's id." } }, ["brief"]),
    run: async (a, api) => { const g = await classOf(api, a.class); return { class: g, brief: await api("GET", `/briefs/${Number(a.brief)}`, { g: g.id }) }; } },
  { name: "debrief", description: "A learner's debrief of a brief: the requirements done, the teacher's one-to-one remarks, the oral questions and answers, the mise en situation, the level proposed, the competencies, the comment.", inputSchema: obj({ class: CLASS, brief: { type: "number" }, learner: LEARNER }, ["brief", "learner"]),
    run: async (a, api) => { const g = await classOf(api, a.class); const s = await learnerOf(api, g.id, a.learner); return { class: g, learner: s, debrief: await api("GET", `/briefs/${Number(a.brief)}/review`, { g: g.id, who: `u:${s.id}` }) }; } },
  { name: "progress", description: "The class's progress table: every learner across the briefs (handed in, debriefed, level), and the competencies.", inputSchema: obj({ class: CLASS }),
    run: async (a, api) => { const g = await classOf(api, a.class); const [p, c] = await Promise.all([api("GET", "/progress", { g: g.id }), api("GET", "/competencies", { g: g.id }).catch(() => null)]); return { class: g, progress: p, competencies: c }; } },
  { name: "list_assessments", description: "The assessments of a class: id, title, status, how many took it, the average.", inputSchema: obj({ class: CLASS }),
    run: async (a, api) => { const g = await classOf(api, a.class); return { class: g, assessments: (await api("GET", "/assessments", { g: g.id })).items }; } },
  { name: "assessment_results", description: "One assessment: its questions (with their Fiche items) and each learner's results, question by question.", inputSchema: obj({ class: CLASS, assessment: { type: "number" } }, ["assessment"]),
    run: async (a, api) => { const g = await classOf(api, a.class); return { class: g, assessment: await api("GET", `/assessments/${Number(a.assessment)}`, { g: g.id }) }; } },
  { name: "list_mises", description: "The mises en situation of a class: id, title, week, status, papers handed in.", inputSchema: obj({ class: CLASS }),
    run: async (a, api) => { const g = await classOf(api, a.class); return { class: g, mises: await api("GET", "/mises", { g: g.id }) }; } },
  { name: "mise_results", description: "One mise en situation: its situations and QCM, the class statistics per item (success, common mistakes), each learner's results.", inputSchema: obj({ class: CLASS, mise: { type: "number" } }, ["mise"]),
    run: async (a, api) => { const g = await classOf(api, a.class); return { class: g, mise: await api("GET", `/mises/${Number(a.mise)}`, { g: g.id }) }; } },
  { name: "list_activities", description: "The Activités (veilles and live codings) of a date range, with their sign-ups.", inputSchema: obj({ class: CLASS, from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" } }),
    run: async (a, api) => { const g = await classOf(api, a.class); return { class: g, activities: await api("GET", "/activities", { g: g.id, from: a.from, to: a.to }) }; } },

  // ---------------------------------------------------------------- any page of the dashboard
  { name: "api_routes", description: "The dashboard API's routes (method, path, what it does), to read or do anything the named tools don't cover: filter them by a word (e.g. \"assessments\", \"students\", \"sprints\", \"wplans\", \"mises\", \"activities\", \"briefs\").", inputSchema: obj({ filter: { type: "string" } }),
    run: async (a) => { const f = String(a.filter ?? "").toLowerCase(); const r = f ? ROUTES.filter((x) => (x.path + " " + x.note).toLowerCase().includes(f)) : ROUTES; return { routes: r.filter((x) => !BLOCKED.test(x.path)), note: "Call them with api_get (GET) or api_write (the others). :id is a number. The class goes in `class`." }; } },
  { name: "api_get", description: "Read anything of the dashboard: GET one of the API's routes (see api_routes), e.g. path \"/students/123/insight\" or \"/sprints/2/diag\". Query parameters in `query`.", inputSchema: obj({ class: CLASS, path: { type: "string", description: "The route, starting with / (without /api)." }, query: { type: "object" } }, ["path"]),
    run: async (a, api) => { const p = String(a.path ?? ""); if (!p.startsWith("/")) throw new ToolError("The path starts with /.");
      const g = p === "/guilds" ? null : await classOf(api, a.class); return api("GET", p.split("?")[0], { ...(a.query && typeof a.query === "object" ? a.query : {}), ...Object.fromEntries(new URLSearchParams(p.split("?")[1] ?? "")), ...(g ? { g: g.id } : {}) }); } },
  { name: "api_write", write: true, full: true, description: "Do anything the teacher can do in the dashboard: POST / PUT / DELETE one of the API's routes (see api_routes), launching, assigning, sending messages and deleting included. It acts for real on the class and the learners: ALWAYS tell the teacher exactly what you are about to do and get their yes first, and prefer the draft tools when they fit. Every change is logged.", inputSchema: obj({ class: CLASS, method: { type: "string", enum: ["POST", "PUT", "DELETE"] }, path: { type: "string" }, body: { type: "object" }, query: { type: "object" } }, ["method", "path"]),
    run: async (a, api) => { const p = String(a.path ?? ""); if (!p.startsWith("/")) throw new ToolError("The path starts with /.");
      const m = String(a.method ?? "").toUpperCase(); if (!["POST", "PUT", "DELETE"].includes(m)) throw new ToolError("method: POST, PUT or DELETE.");
      const g = await classOf(api, a.class); return api(m, p, { ...(a.query && typeof a.query === "object" ? a.query : {}), g: g.id }, a.body && typeof a.body === "object" ? a.body : {}); } },

  // ---------------------------------------------------------------- writing drafts
  { name: "assessment_instructions", description: "BEFORE writing an assessment: ClassBot's exact instructions and JSON format for a programme week (its competencies, technologies seen so far, the Fiche niveaux items to cover, 5 questions per item at least, the class's level). Follow them, then call create_assessment with the JSON.", inputSchema: obj({ class: CLASS, week: { type: "number", description: "The programme week (default: the current one)." }, concepts: { type: "array", items: { type: "string" }, description: "The Fiche items to cover (codes like S2.M3); default: the sprint's Moyen and Bon items." } }),
    run: async (a, api) => { const g = await classOf(api, a.class); return { class: g, ...(await api("GET", "/assessments/claude-prompt", { g: g.id, week: a.week, concepts: Array.isArray(a.concepts) ? a.concepts.join(",") : undefined })) }; } },
  { name: "create_assessment", write: true, description: "Save an assessment as a DRAFT in ClassBot (never assigned: the teacher reviews it and assigns it in the dashboard). `json`: the JSON written from assessment_instructions. With check_only, only checks it (problems, preview, duplicates).", inputSchema: obj({ class: CLASS, json: { type: "string", description: "The assessment's JSON, as a string." }, concepts: { type: "array", items: { type: "string" }, description: "The Fiche items it covers (the ones of the instructions)." }, check_only: { type: "boolean" } }, ["json"]),
    run: async (a, api) => { const g = await classOf(api, a.class); const r = await api("POST", "/assessments/claude-import", { g: g.id }, { json: a.json, concepts: Array.isArray(a.concepts) ? a.concepts : undefined, import: !a.check_only });
      return r.id ? { saved: true, id: r.id, note: "Saved as a draft: open Assessments in ClassBot to review and assign it." } : r; } },
  { name: "mise_instructions", description: "BEFORE writing a mise en situation: ClassBot's exact instructions and JSON format for a week (its competencies, the technologies seen, the Fiche items, the brief it's linked to, the teacher's wishes such as the learners' lacunes to target). Then call create_mise with the JSON.", inputSchema: obj({ class: CLASS, week: { type: "number" }, brief: { type: "number", description: "The brief it's linked to (optional)." }, comps: { type: "array", items: { type: "string" }, description: "Competency codes like C3N2 (default: the week's)." }, metier: { type: "string", description: "The job of the scenario (optional)." }, wishes: { type: "string", description: "What to focus on: the lacunes to target, the learners it's for…" }, concepts: { type: "array", items: { type: "string" } }, situations: { type: "number", description: "How many coding situations (1 to 15; default 5)." }, qcm: { type: "number", description: "How many QCM (0 to 30; 0 = none; default 5)." } }),
    run: async (a, api) => { const g = await classOf(api, a.class); return { class: g, ...(await api("POST", "/mises/prompt", { g: g.id }, { week: a.week, brief_id: a.brief, comps: a.comps, metier: a.metier, wishes: a.wishes, concepts: a.concepts, nSituations: a.situations, nQcm: a.qcm })) }; } },
  { name: "create_mise", write: true, description: "Save a mise en situation as a DRAFT in ClassBot (never launched: the teacher reviews it and launches it in the dashboard). For specific learners, give them in `learners` (names or ids); otherwise the whole class. With check_only, only checks it (problems, checklist).", inputSchema: obj({ class: CLASS, json: { type: "string" }, week: { type: "number" }, brief: { type: "number" }, comps: { type: "array", items: { type: "string" } }, concepts: { type: "array", items: { type: "string" } }, title: { type: "string" }, learners: { type: "array", items: { type: "string" } }, situations: { type: "number", description: "The count asked in mise_instructions (checked)." }, qcm: { type: "number" }, check_only: { type: "boolean" } }, ["json"]),
    run: async (a, api) => { const g = await classOf(api, a.class);
      const target = Array.isArray(a.learners) ? await Promise.all(a.learners.map(async (x: string) => (await learnerOf(api, g.id, x)).id)) : [];
      const r = await api("POST", "/mises/import", { g: g.id }, { json: a.json, week: a.week, brief_id: a.brief, comps: a.comps, concepts: a.concepts, title: a.title, target, nSituations: a.situations, nQcm: a.qcm, save: !a.check_only });
      return r.id ? { saved: true, id: r.id, checks: r.checks, note: "Saved as a draft: open Mises en situation in ClassBot to review and launch it." } : r; } },
  { name: "create_activity", write: true, description: "Save a veille or a live coding for a day of the class's calendar (shown in Activités; not shared with the learners until the teacher does it). kind \"veille\": data { titre, contexte, objectifs[], plan[{ titre, points[] }], questions[], ressources[{ titre, url }], artefact, demo, criteres[] }. kind \"live\": data { titre, objectifs[], contexte, deroule[{ minutes, etape, notions }], starter, support, final (code), tests[{ action, saisie, resultat }], attention, extensions[], reflexion[], resultat[] }. In French. It replaces what that day's slot has.", inputSchema: obj({ class: CLASS, day: { type: "string", description: "YYYY-MM-DD (a working day of the programme)." }, kind: { type: "string", enum: ["veille", "live"] }, data: { type: "object" } }, ["day", "kind", "data"]),
    run: async (a, api) => { const g = await classOf(api, a.class); const r = await api("POST", "/activities/item/keep", { g: g.id }, { day: a.day, kind: a.kind, data: a.data, model: "claude (connector)" });
      return { saved: true, item: r.item, note: "Saved in Activités: share it with the learners from the dashboard when ready." }; } },
  { name: "create_action_plan", write: true, description: "A plan d'action for one learner, as a DRAFT (never sent: the teacher reviews and sends it from the dashboard). steps: up to 15 actions, each { kind: \"code\" | \"answer\" | \"mcq\" | \"brief\", title, notion, why, prompt, lang?, starter?, expected?, choices? (mcq), answer? (mcq: indexes of the right choices), brief? ({ context, tasks[], deliverable, hours }) }. In French, on the learner's lacunes.", inputSchema: obj({ class: CLASS, learner: LEARNER, title: { type: "string" }, message: { type: "string", description: "The word to the learner at the top of the plan." }, steps: { type: "array", items: { type: "object" } } }, ["learner", "steps"]),
    run: async (a, api) => { const g = await classOf(api, a.class); const s = await learnerOf(api, g.id, a.learner);
      const p = await api("POST", "/wplans", { g: g.id }, { student: s.id });
      const v = await api("PUT", `/wplans/${p.id}`, { g: g.id }, { ...(a.title ? { title: a.title } : {}), ...(a.message ? { message: a.message } : {}), steps: a.steps });
      return { saved: true, id: p.id, learner: s, steps: (v.plan?.steps ?? v.steps ?? []).length, note: "Saved as a draft: open the learner's plans d'action in ClassBot to review and send it." }; } },
];

// ------------------------------------------------------------------ JSON-RPC
const INSTRUCTIONS = "ClassBot is the teacher's class platform (web development training, Simplon/YouCode programme). Read the classes live with the tools (learners, their Fiche niveaux and lacunes, briefs, debriefs, assessments, mises en situation, activities); anything else through api_routes + api_get. To make an assessment or a mise en situation, ALWAYS call assessment_instructions / mise_instructions first and follow them exactly, then save it with create_assessment / create_mise (check_only first if unsure): they are drafts the teacher reviews. With a full-access link, api_write does any action of the dashboard (launch, assign, send, delete…): it acts for real on the learners, so say exactly what you will do and wait for the teacher's yes before each one. Write in French for the learners. Never invent a learner's result: read it.";
const rpc = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcErr = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function answer(msg: any, env: Env, ctx: Ctx, origin: string, key: Key): Promise<any | null> {
  const id = msg?.id, method = String(msg?.method ?? "");
  if (msg?.jsonrpc !== "2.0" || !method) return rpcErr(id, -32600, "Invalid request");
  if (id === undefined || id === null) return null;   // a notification (initialized, cancelled…): nothing to answer
  if (method === "initialize") {
    const asked = String(msg.params?.protocolVersion ?? "");
    return rpc(id, { protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "classbot", title: "ClassBot", version: "1.0.0" }, instructions: INSTRUCTIONS });
  }
  if (method === "ping") return rpc(id, {});
  if (method === "tools/list") return rpc(id, { tools: TOOLS.filter((t) => !t.full || key.scope === "full").map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: !t.write, destructiveHint: !!t.full, idempotentHint: !t.write, openWorldHint: !!t.full } })) });
  if (method === "tools/call") {
    const t = TOOLS.find((x) => x.name === msg.params?.name);
    if (!t || (t.full && key.scope !== "full")) return rpcErr(id, -32602, t ? "This connector link reads and writes drafts only: make a « full access » link in ClassBot → Settings → Claude connector." : `Unknown tool: ${msg.params?.name}`);
    try {
      const r = await t.run(msg.params?.arguments ?? {}, caller(env, ctx, origin, key, t.name));
      return rpc(id, { content: [{ type: "text", text: out(r) }], isError: false });
    } catch (e) {
      const m = e instanceof ToolError ? e.message : (e as Error)?.message || "ClassBot failed: try again.";
      if (!(e instanceof ToolError)) console.error("mcp tool", t.name, e);
      return rpc(id, { content: [{ type: "text", text: m }], isError: true });
    }
  }
  if (method === "resources/list") return rpc(id, { resources: [] });
  if (method === "prompts/list") return rpc(id, { prompts: [] });
  return rpcErr(id, -32601, `Method not found: ${method}`);
}

/** /mcp/<key>: Claude's connector. */
export async function handleMcp(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.split("/")[2] ?? "");
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, authorization", "access-control-allow-methods": "POST, GET, OPTIONS, DELETE" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const k = await keyOk(env, key);
  if (!k) return Response.json({ error: "This connector link isn't valid (or was revoked): make a new one in ClassBot → Settings → Claude connector." }, { status: 401, headers: cors });
  // no server-to-client stream: answers come in each POST's response
  if (request.method === "GET") return new Response(null, { status: 405, headers: { ...cors, allow: "POST" } });
  if (request.method === "DELETE") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: cors });
  let body: any;
  try { body = await request.json(); } catch { return Response.json(rpcErr(null, -32700, "Parse error"), { status: 400, headers: cors }); }
  await applyAppSettings(env);
  const origin = url.origin;
  const res = Array.isArray(body) ? (await Promise.all(body.map((m) => answer(m, env, ctx, origin, k)))).filter(Boolean) : await answer(body, env, ctx, origin, k);
  if (res === null || (Array.isArray(res) && !res.length)) return new Response(null, { status: 202, headers: cors });
  return Response.json(res, { headers: { ...cors, "cache-control": "no-store" } });
}
