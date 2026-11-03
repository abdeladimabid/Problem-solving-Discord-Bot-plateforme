// 📗 The trainer's Google Sheet "Suivi Formateur", filled by ClassBot (Settings → Google Sheet).
//   • Niveau technique         each student's level per sprint (S1…S8): the teacher's, else the proposed one; ended sprints only
//   • Suivi et Validation      per sprint (3 rows each): the briefs, their start and end dates, the individual debriefing
//                              (Non / En cours / Oui), the collective debriefing and the retro (Oui once every debrief is final)
//   • Suivi fil rouge          never touched
//   • Plan d'action Retro      every plan d'action sent: student, level, difficulties, start, actions (what the plan asks,
//                              summed up), end, feedback (the teacher's word on the plan), résultat (done / partly / not
//                              done, once it's due or done). The columns are found by their titles (row 3).
// ClassBot writes with a Google service account (its key: the Cloudflare secret GOOGLE_SERVICE_ACCOUNT, or pasted in
// Settings, never shown again); the trainer shares the sheet with its email as Editor. Filled on "Fill now", and by
// itself: 2 minutes after a debrief is finalized, a sprint level is set or a plan is sent; every Monday; the day after
// a sprint ends. Cells that ClassBot has no value for are never cleared. Kept in app_settings (gsheet:<guild>).
import type { Env, GuildRow } from "./types.ts";
import { all, getGuild, now, one, run } from "./db.ts";
import { sheetLevels } from "./sprints.ts";
import { chat } from "./ai.ts";
import { forClass } from "./aictx.ts";
import { planStatus } from "./workplan.ts";
import type { Step, WorkPlan } from "./workplan.ts";

export class SheetError extends Error {}

interface SaKey { client_email: string; private_key: string }
export interface FillResult { at: number; ok: boolean; why: string; error?: string; levels?: number; briefs?: number; plans?: number; unmatched?: string[]; missing?: string[]; warn?: string[] }
export interface SheetCfg { id: string; auto: boolean; map: Record<string, string>; dirty?: number | null; week?: string; next_end?: string; plan_rows?: number; last?: FillResult | null }

const CFG = (gid: string) => `gsheet:${gid}`;
const KEY_K = "gsa:key";
const API = "https://sheets.googleapis.com/v4/spreadsheets/";
export const LEVEL_SHEET: Record<string, string> = { excellent: "Excellent(e)", bon: "Bon", moyen: "Moyen", faible: "Faible", critique: "Critique" };

async function put(env: Env, k: string, v: unknown) {
  await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", k, JSON.stringify(v), now());
}
export async function getCfg(env: Env, gid: string): Promise<SheetCfg | null> {
  const r = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", CFG(gid)).catch(() => null);
  if (!r) return null;
  try { const c = JSON.parse(r.v); return { id: String(c.id || ""), auto: c.auto !== false, map: c.map && typeof c.map === "object" ? c.map : {}, dirty: c.dirty ?? null, week: c.week, next_end: c.next_end, plan_rows: Number(c.plan_rows) || 0, last: c.last ?? null }; }
  catch { return null; }
}
const saveCfg = (env: Env, gid: string, c: SheetCfg) => put(env, CFG(gid), c);

/** Something the sheet shows changed (a debrief finalized, a level, a plan): the sheet is filled 2 minutes later. */
export async function markSheetDirty(env: Env, gid: string) {
  await run(env, "UPDATE app_settings SET v = json_set(v, '$.dirty', ?) WHERE k = ?", now(), CFG(gid)).catch(() => {});
}

// ------------------------------------------------------------------ the service account
export function parseKey(text: string): SaKey {
  let j: any;
  try { j = JSON.parse(String(text || "").trim()); } catch { throw new SheetError("Paste the whole JSON key file Google gave you (it starts with {)."); }
  if (!j || j.type !== "service_account" || !/@.+\.iam\.gserviceaccount\.com$/.test(String(j.client_email || "")) || !/BEGIN PRIVATE KEY/.test(String(j.private_key || "")))
    throw new SheetError("This isn't a service account key: in Google Cloud, IAM → Service accounts → your account → Keys → Add key → JSON.");
  return { client_email: j.client_email, private_key: j.private_key };
}
async function saKey(env: Env): Promise<(SaKey & { source: "secret" | "settings" }) | null> {
  if (env.GOOGLE_SERVICE_ACCOUNT) { try { return { ...parseKey(env.GOOGLE_SERVICE_ACCOUNT), source: "secret" }; } catch { /* fall back on the pasted one */ } }
  const r = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", KEY_K).catch(() => null);
  if (!r) return null;
  try { return { ...parseKey(JSON.parse(r.v)), source: "settings" }; } catch { return null; }
}

const b64url = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
let tokenCache: { email: string; scope: string; token: string; exp: number } | null = null;
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
async function accessToken(k: SaKey, scope = SHEETS_SCOPE): Promise<string> {
  const t0 = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.email === k.client_email && tokenCache.scope === scope && tokenCache.exp > t0 + 60) return tokenCache.token;
  const der = Uint8Array.from(atob(k.private_key.replace(/-----(BEGIN|END)[^-]*-----/g, "").replace(/\\n/g, "").replace(/[^A-Za-z0-9+/=]/g, "")), (c) => c.charCodeAt(0));
  let key: CryptoKey;
  try { key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]); }
  catch { throw new SheetError("The private key in this JSON can't be read: download a new JSON key."); }
  const part = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const data = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iss: k.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: t0 - 30, exp: t0 + 3500 })}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data)));
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${data}.${b64url(sig)}` });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new SheetError(`Google refused the key (${j.error_description || j.error || res.status}). Is the service account still there, and the key not deleted?`);
  tokenCache = { email: k.client_email, scope, token: j.access_token, exp: t0 + (Number(j.expires_in) || 3600) };
  return j.access_token;
}

/** The service account's token to read a Google Doc (the Fiche niveaux), when the class has a key; else null. */
export async function docsToken(env: Env): Promise<(() => Promise<string>) | null> {
  const k = await saKey(env);
  return k ? () => accessToken(k, "https://www.googleapis.com/auth/documents.readonly") : null;
}
export async function serviceEmail(env: Env): Promise<string | null> { return (await saKey(env))?.client_email ?? null; }

async function gapi(env: Env, path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  const k = await saKey(env);
  if (!k) throw new SheetError("No Google service account yet: paste its JSON key first.");
  const tok = await accessToken(k);
  const res = await fetch(API + path, { method: init.method || "GET", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: init.body ? JSON.stringify(init.body) : undefined });
  const j: any = await res.json().catch(() => ({}));
  if (res.status === 403) throw new SheetError(`ClassBot can't open this sheet: share it with ${k.client_email} as Editor (Share button, top right).`);
  if (res.status === 404) throw new SheetError("This Google Sheet doesn't exist (check the link).");
  if (!res.ok) throw new SheetError(`Google Sheets: ${j.error?.message || res.status}`);
  return j;
}

export function sheetIdOf(url: string): string {
  const s = String(url || "").trim();
  const m = s.match(/\/spreadsheets\/d\/([\w-]{20,})/) || s.match(/^([\w-]{30,})$/);
  if (!m) throw new SheetError("Paste the link of the Google Sheet (https://docs.google.com/spreadsheets/d/…).");
  return m[1];
}

// ------------------------------------------------------------------ the tabs
export const norm = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function findTabs(titles: string[]) {
  const by = (f: (t: string) => boolean) => titles.find((t) => f(norm(t))) ?? null;
  return {
    niveau: by((t) => t.includes("niveau")),
    suivi: by((t) => t.includes("validation") && !t.includes("fil")),
    plan: by((t) => t.startsWith("plan d") || t.includes("plan daction") || t.includes("plan d action")),
  };
}
const q = (tab: string) => `'${tab.replace(/'/g, "''")}'`;
async function tabsOf(env: Env, id: string) {
  const j = await gapi(env, `${id}?fields=properties.title,sheets.properties.title`);
  const titles: string[] = (j.sheets || []).map((s: any) => String(s.properties?.title || ""));
  return { title: String(j.properties?.title || ""), titles, tabs: findTabs(titles) };
}

// ------------------------------------------------------------------ names: the sheet's "Nom" ↔ ClassBot's students
const toks = (s: string) => norm(s).split(" ").filter((t) => t.length > 1);
/** Each name of the sheet → a student (by the words of their names: Discord name and intranet name), or "" (none).
 *  The teacher's choices (map, by the sheet's name) win; a student goes to one row only. */
export function matchNames(sheet: string[], students: { id: string; names: string[] }[], map: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  const taken = new Set<string>();
  for (const n of sheet) { const v = map[norm(n)]; if (v !== undefined) { out[n] = v; if (v) taken.add(v); } }
  const freq = new Map<string, number>();
  for (const n of sheet) for (const t of new Set(toks(n))) freq.set(t, (freq.get(t) || 0) + 1);
  const cands: { n: string; id: string; score: number }[] = [];
  for (const n of sheet) {
    if (n in out) continue;
    const a = new Set(toks(n));
    for (const s of students) {
      let best = 0;
      for (const name of s.names) {
        const b = toks(name);
        const common = b.filter((t) => a.has(t));
        const score = common.length >= 2 ? 10 * common.length - Math.abs(b.length - a.size) : common.length === 1 && freq.get(common[0]) === 1 && b.length <= 2 ? 1 : 0;
        best = Math.max(best, score);
      }
      if (best) cands.push({ n, id: s.id, score: best });
    }
  }
  cands.sort((x, y) => y.score - x.score);
  for (const c of cands) {
    if (c.n in out || taken.has(c.id)) continue;
    // a tie between two students for the same row: none (the teacher picks)
    if (cands.some((o) => o.n === c.n && o.id !== c.id && o.score === c.score && !taken.has(o.id))) continue;
    out[c.n] = c.id; taken.add(c.id);
  }
  for (const n of sheet) if (!(n in out)) out[n] = "";
  return out;
}

async function studentNames(env: Env, g: GuildRow, students: { discord_id: string; name: string }[]) {
  const intra = new Map((await all<{ discord_id: string; learner_name: string | null }>(env, "SELECT discord_id, learner_name FROM intranet_links WHERE guild_id = ?", g.id).catch(() => [])).map((r) => [r.discord_id, r.learner_name || ""] as const));
  return students.map((s) => ({ id: s.discord_id, name: s.name || s.discord_id, names: [intra.get(s.discord_id) || "", s.name].filter(Boolean) }));
}

// ------------------------------------------------------------------ values
const day = (ts: number | null | undefined) => (ts ? new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: "Africa/Casablanca" }) : null);   // 2026-11-03: a date in any locale
const text = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s);   // never read as a formula
const today = () => new Date(Date.now()).toLocaleDateString("en-CA", { timeZone: "Africa/Casablanca" });

/** Everything ClassBot writes, as ranges and values (null = leave the cell as it is). */
// ------------------------------------------------------------------ Plan d'action: its columns, the result, the actions summed up
export type PlanCol = "name" | "level" | "diff" | "start" | "actions" | "end" | "feedback" | "result";
/** The old layout (no titles in row 3): B student · C level · D difficulties · E start · F actions · G end. */
export const PLAN_DEFAULT: Partial<Record<PlanCol, number>> = { name: 1, level: 2, diff: 3, start: 4, actions: 5, end: 6 };
/** The columns of the Plan d'action tab, by their titles (row 3, A = 0). null: no titles ClassBot knows (the old layout). */
export function planColumns(headers: string[]): Partial<Record<PlanCol, number>> | null {
  const out: Partial<Record<PlanCol, number>> = {};
  headers.forEach((h, i) => {
    const t = norm(h);
    if (!t) return;
    const k: PlanCol | null = /result/.test(t) ? "result" : /feedback|commentaire|remarque|retour|appreciation/.test(t) ? "feedback"
      : /debut|start/.test(t) ? "start" : /\bfin\b|echeance|deadline|\bend\b/.test(t) ? "end" : /niveau/.test(t) ? "level"
      : /difficult|lacune/.test(t) ? "diff" : /apprenant|\bnom\b|etudiant|stagiaire|eleve/.test(t) ? "name" : /action/.test(t) ? "actions" : null;
    if (k && out[k] === undefined) out[k] = i;
  });
  if (!Object.keys(out).length) return null;
  // the student's column often has no title (ClassBot writes « Apprenant(e) » in B3)
  if (out.name === undefined && !Object.values(out).includes(1) && !String(headers[1] ?? "").trim()) out.name = 1;
  return out;
}
const colL = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));

export type PlanResult = "done" | "partly" | "not";
export const RESULT_DEFAULT: Record<PlanResult, string> = { done: "Fait", partly: "Partiellement fait", not: "Non fait" };
/** The words of the « Résultat » column's list (its dropdown), when it has one: each result → the option that says it. */
export function resultWords(options: string[]): Record<PlanResult, string> {
  const o = options.map((x) => ({ x, t: norm(x) }));
  const partly = o.find((v) => /partiel|en partie|moitie|partly|partial/.test(v.t));
  const not = o.find((v) => v !== partly && /\bnon\b|\bpas\b|not|aucun|echec/.test(v.t));
  const done = o.find((v) => v !== partly && v !== not && /fait|complet|termine|realise|oui|done|valide|atteint/.test(v.t));
  return { done: done?.x ?? RESULT_DEFAULT.done, partly: partly?.x ?? RESULT_DEFAULT.partly, not: not?.x ?? RESULT_DEFAULT.not };
}
/** Done when every action is; once it's due: partly (something done) or not done; before that: nothing yet. */
export function planResult(st: { done: number; total: number; pct: number }, dueAt: number | null, t = now()): PlanResult | null {
  if (st.total && st.done >= st.total) return "done";
  if (!dueAt || t < dueAt) return null;
  return st.done > 0 || st.pct > 0 ? "partly" : "not";
}

const KIND_SUM: Record<string, [string, string]> = { challenge: ["défi", "défis"], code: ["exercice de code", "exercices de code"], answer: ["question", "questions"], mcq: ["QCM", "QCM"], brief: ["mini-projet", "mini-projets"] };
const stepWhat = (s: Step) => (s.kind === "brief" ? `« ${s.title || s.notion} »${s.brief?.hours ? ` (≈ ${s.brief.hours} h)` : ""}` : s.notion && s.title && norm(s.title) !== norm(s.notion) ? `${s.notion} : ${s.title}` : s.title || s.notion || "");
/** What the plan asks, summed up without the AI: the actions by kind, with their notions. */
export function sumupCalc(steps: Step[]): string {
  const kinds = ["challenge", "code", "answer", "mcq", "brief"].map((k) => steps.filter((s) => s.kind === k)).filter((l) => l.length);
  const parts = kinds.map((l) => { const w = KIND_SUM[l[0].kind] || [l[0].kind, l[0].kind]; const what = l.map(stepWhat).filter(Boolean); return `${l.length} ${l.length > 1 ? w[1] : w[0]}${what.length ? ` (${what.join(", ")})` : ""}`; });
  return parts.length ? `À faire : ${parts.join(" ; ")}.` : "";
}
const stepsHash = (steps: Step[]) => { let h = 0; for (const c of JSON.stringify(steps.map((s) => [s.kind, s.title, s.notion, s.brief?.tasks ?? []]))) h = (h * 31 + c.charCodeAt(0)) | 0; return String(h >>> 0); };
/** What the plan asks, summed up by the AI in 1 to 3 sentences (else without it). */
export async function sumupAi(env: Env, steps: Step[]): Promise<{ text: string; by: "ai" | "calc" }> {
  const calc = sumupCalc(steps);
  const lines = steps.map((s, i) => `${i + 1}. [${(KIND_SUM[s.kind] || [s.kind])[0]}] ${s.title || ""}${s.notion ? ` — notion : ${s.notion}` : ""}${s.kind === "brief" && s.brief ? `\n   mini-projet : ${s.brief.tasks.slice(0, 8).join(" ; ")}${s.brief.hours ? ` (≈ ${s.brief.hours} h)` : ""}` : s.prompt ? `\n   consigne : ${s.prompt.replace(/\s+/g, " ").slice(0, 300)}` : ""}`);
  try {
    const out = await chat(env, [
      { role: "system", content: "Tu résumes un plan d'action pédagogique pour le tableau de suivi du formateur (colonne « Actions »)." },
      { role: "user", content: `LES ACTIONS DU PLAN :\n${lines.join("\n")}\n\nEn 1 à 3 phrases courtes (300 caractères au plus), dis ce que ce plan demande concrètement à l'apprenant : ce qu'il doit faire (défis, code à écrire, questions, mini-projet) et sur quelles notions. Écris à l'infinitif (« Résoudre… », « Écrire… »), sans « tu », sans liste numérotée, sans guillemets autour du texte. Réponds seulement par ce texte.` },
    ], { maxTokens: 300, temperature: 0.3, timeoutMs: 20000 });
    const t = String(out || "").replace(/^["«\s]+|["»\s]+$/g, "").replace(/\s*\n+\s*/g, " ").trim();
    if (t.length >= 20 && t.length <= 600 && !/^\s*[{\[]/.test(t)) return { text: t, by: "ai" };
  } catch { /* the calculated one */ }
  return { text: calc, by: "calc" };
}

/** Everything ClassBot writes, as ranges and values (null = leave the cell as it is). */
export async function buildFill(env: Env, g: GuildRow, cfg: SheetCfg, tabs: ReturnType<typeof findTabs>, sheetNames: string[], plan: { cols: Partial<Record<PlanCol, number>> | null; results: string[]; bTitled?: boolean; b3?: boolean } = { cols: null, results: [] }) {
  const S = await sheetLevels(env, g);
  const names = await studentNames(env, g, S.students);
  const match = matchNames(sheetNames, names, cfg.map);
  const data: { range: string; values: (string | null)[][] }[] = [];
  const clear: string[] = [];
  const warn: string[] = [];
  const d0 = today();
  const res = { levels: 0, briefs: 0, plans: 0, plan_rows: cfg.plan_rows || 0, next_end: "" };
  // the last level of each student (for the plans d'action)
  const lastLevel = (uid: string) => { const l = S.levels.get(uid) || {}; const ns = Object.keys(l).map(Number).sort((a, b) => a - b); return ns.length ? l[ns[ns.length - 1]] : ""; };

  // 1. Niveau technique: row 3 on, S1…S8 in G…N, the sprints that ended
  if (tabs.niveau) {
    const ended = new Set(S.sprints.filter((s) => s.end && s.end < d0).map((s) => s.n));
    sheetNames.forEach((n, i) => {
      const uid = match[n];
      if (!n || !uid) return;
      const lv = S.levels.get(uid) || {};
      const row = [1, 2, 3, 4, 5, 6, 7, 8].map((sp) => (ended.has(sp) && lv[sp] ? LEVEL_SHEET[lv[sp]] || null : null));
      if (row.some((v) => v)) { data.push({ range: `${q(tabs.niveau!)}!G${3 + i}:N${3 + i}`, values: [row] }); res.levels += row.filter(Boolean).length; }
    });
  }
  res.next_end = S.sprints.map((s) => s.end).filter((e) => e && e >= d0).sort()[0] || "";

  // 2. Suivi et Validation Classe: sprint n = rows 2+3(n-1) … +2
  const briefs = await all<{ id: number; title: string; start_at: number | null; due_at: number | null; kind: string | null; squads: string | null }>(env,
    "SELECT id, title, start_at, due_at, kind, squads FROM briefs WHERE guild_id = ? AND status != 'draft'", g.id);
  const reviews = await all<{ brief_id: number; who: string; status: string }>(env, "SELECT brief_id, who, status FROM brief_reviews WHERE guild_id = ?", g.id);
  const ids = new Set(S.students.map((s) => s.discord_id));
  const stateOf = (b: (typeof briefs)[number]) => {
    let sq: string[] = [];
    if (b.kind === "squad") { try { sq = (JSON.parse(b.squads || "[]") as any[]).map((x) => `s:${x.id}`); } catch { sq = []; } }
    const units = new Set(sq.length ? sq : [...ids].map((u) => `u:${u}`));
    const mine = reviews.filter((r) => r.brief_id === b.id && units.has(r.who));
    const final = mine.filter((r) => r.status === "final").length;
    return units.size && final >= units.size ? "Oui" : mine.length ? "En cours" : "Non";
  };
  if (tabs.suivi) {
    for (const sp of S.sprints) {
      if (sp.n < 1 || sp.n > 8) continue;
      const list = briefs.filter((b) => sp.briefs.includes(b.id)).sort((a, b) => (a.start_at || a.due_at || 0) - (b.start_at || b.due_at || 0));
      if (!list.length) continue;
      if (list.length > 3) warn.push(`S${sp.n}: ${list.length} briefs, only the first 3 fit (${list.slice(3).map((b) => b.title).join(", ")})`);
      const top = 2 + 3 * (sp.n - 1);
      const st = list.map(stateOf);
      list.slice(0, 3).forEach((b, k) => {
        data.push({ range: `${q(tabs.suivi!)}!B${top + k}:F${top + k}`, values: [[text(b.title), day(b.start_at), day(b.due_at), st[k], st[k] === "Oui" ? "Oui" : null]] });
        res.briefs++;
      });
      // the retro (one cell for the sprint): once every brief of the sprint is finalized
      if (st.slice(0, 3).every((s) => s === "Oui")) data.push({ range: `${q(tabs.suivi!)}!G${top}`, values: [["Oui"]] });
    }
  }

  // 3. Plan d'action Retro: row 4 on, a plan per row, in the columns found by their titles (else B…G)
  if (tabs.plan) {
    const cols = plan.cols ?? PLAN_DEFAULT;
    const words = resultWords(plan.results);
    const recs = await all<{ k: string; v: string }>(env, "SELECT k, v FROM app_settings WHERE k LIKE ?", `wplan:${g.id}:%`).catch(() => []);
    const plans: WorkPlan[] = [];
    for (const r of recs) { try { const p = JSON.parse(r.v); if (p && (p.status === "sent" || p.status === "done")) plans.push({ ...p, steps: Array.isArray(p.steps) ? p.steps : [] }); } catch { /* skip */ } }
    plans.sort((a, b) => (a.sent_at || a.created_at || 0) - (b.sent_at || b.created_at || 0));
    const sheetOf = new Map(Object.entries(match).filter(([, v]) => v).map(([n, v]) => [v, n]));
    // the actions summed up (the AI, once per plan: kept until its actions change), 6 new ones per fill at most
    const aiEnv = forClass(env, g.id);
    let made = 0;
    for (const p of plans) {
      const h = stepsHash(p.steps);
      if (p.sumup && p.sumup.h === h && (p.sumup.by === "ai" || made >= 6)) continue;
      if (made >= 6) { p.sumup = { h, text: sumupCalc(p.steps), by: "calc" }; continue; }
      made++;
      const su = await sumupAi(aiEnv, p.steps);
      p.sumup = { h, ...su };
      await run(env, "UPDATE app_settings SET v = json_set(v, '$.sumup', json(?)) WHERE k = ?", JSON.stringify(p.sumup), `wplan:${g.id}:${p.id}`).catch(() => {});
    }
    const sts = await Promise.all(plans.map((p) => planStatus(env, p).catch(() => null)));
    const value: Record<PlanCol, (p: WorkPlan, i: number) => string | null> = {
      name: (p) => text(sheetOf.get(p.sid) || p.name || p.sid),
      level: (p) => LEVEL_SHEET[lastLevel(p.sid)] || null,
      diff: (p) => { const lac = (p.diag?.lacunes || []).map((l) => l.notion).filter(Boolean); return text(lac.join(", ") || String(p.diag?.summary || "")); },
      start: (p) => day(p.sent_at || p.created_at),
      actions: (p) => text(p.sumup?.text || sumupCalc(p.steps)),
      end: (p) => day(p.due_at),
      feedback: (p) => (p.feedback ? text(p.feedback) : null),   // none: what the teacher typed in the sheet stays
      result: (p, i) => { const r = sts[i] ? planResult(sts[i]!, p.due_at) : null; return r ? words[r] : null; },
    };
    // the student's column has no title: ClassBot gives it one
    if (cols.name === 1 && !plan.bTitled) data.push({ range: `${q(tabs.plan)}!B3`, values: [["Apprenant(e)"]] });
    if (plan.b3) clear.push(`${q(tabs.plan)}!B3`);
    for (const [k, c] of Object.entries(cols) as [PlanCol, number][]) {
      const L = colL(c);
      if (plans.length) data.push({ range: `${q(tabs.plan)}!${L}4:${L}${3 + plans.length}`, values: plans.map((p, i) => [value[k](p, i)]) });
      // rows of plans deleted since: emptied (the feedback typed in the sheet too, it was theirs)
      if ((cfg.plan_rows || 0) > plans.length) clear.push(`${q(tabs.plan)}!${L}${4 + plans.length}:${L}${3 + (cfg.plan_rows || 0)}`);
    }
    res.plans = plans.length; res.plan_rows = plans.length;
  }
  const unmatched = sheetNames.filter((n) => n && !match[n]);
  const inSheet = new Set(Object.values(match).filter(Boolean));
  const missing = names.filter((s) => !inSheet.has(s.id)).map((s) => s.name);
  return { data, clear, warn, res, match, unmatched, missing, names };
}

async function readNames(env: Env, id: string, tab: string | null): Promise<string[]> {
  if (!tab) return [];
  const j = await gapi(env, `${id}/values/${encodeURIComponent(`${q(tab)}!A3:A80`)}?majorDimension=COLUMNS`);
  const col: string[] = (j.values?.[0] || []).map((v: unknown) => String(v ?? "").trim());
  // the class list stops at the first empty name
  const end = col.findIndex((v) => !v);
  return end < 0 ? col : col.slice(0, end);
}

/** The Plan d'action tab: its columns (titles in row 3) and the words of the « Résultat » list, when it has one. */
async function readPlanLayout(env: Env, id: string, tab: string | null) {
  if (!tab) return { cols: null, results: [] as string[], bTitled: false, b3: false };
  // the titles: the row of 1 to 3 that has the most titles ClassBot knows (a Google Sheets table has them in row 1)
  const j = await gapi(env, `${id}/values/${encodeURIComponent(`${q(tab)}!A1:Z3`)}`);
  const rows3: string[][] = [0, 1, 2].map((r) => (j.values?.[r] || []).map((v: unknown) => String(v ?? "")));
  const known = (h: string[]) => { const c = planColumns(h.map((x) => (norm(x) === "apprenant e" ? "" : x))); return c ? Object.keys(c).length - (c.name === 1 && !String(h[1] ?? "").trim() ? 1 : 0) : 0; };
  const score = rows3.map(known);
  const best = score.indexOf(Math.max(...score));
  const heads = score[best] >= 2 ? rows3[best] : rows3[2];
  const cols = planColumns(heads.map((x, i) => (i === 1 && norm(x) === "apprenant e" ? "" : x)));
  const bTitled = !!String(heads[1] ?? "").trim() && norm(heads[1]) !== "apprenant e";
  // ClassBot's old « Apprenant(e) » in B3, when the titles are in another row: it's in the way (removed)
  const b3 = score[best] >= 2 && best !== 2 && norm(rows3[2][1] ?? "") === "apprenant e";
  let results: string[] = [];
  if (cols?.result !== undefined) {
    // its dropdown (data validation « list of items »), read on the first row of plans
    const L = colL(cols.result);
    const v = await gapi(env, `${id}?ranges=${encodeURIComponent(`${q(tab)}!${L}4:${L}5`)}&fields=${encodeURIComponent("sheets(data(rowData(values(dataValidation))))")}`).catch(() => null);
    const rows: any[] = v?.sheets?.[0]?.data?.[0]?.rowData || [];
    for (const r of rows) {
      const c = r?.values?.[0]?.dataValidation?.condition;
      if (c?.type === "ONE_OF_LIST" && Array.isArray(c.values)) { results = c.values.map((x: any) => String(x?.userEnteredValue ?? "")).filter(Boolean); break; }
    }
  }
  return { cols, results, bTitled: bTitled || (score[best] >= 2 && best !== 2), b3 };
}

// ------------------------------------------------------------------ filling
/** Fill the sheet now. Never throws: the result (ok, or the error) is kept for the Settings page. */
export async function fillSheet(env: Env, g: GuildRow, why = "manual"): Promise<FillResult> {
  const cfg = await getCfg(env, g.id);
  if (!cfg?.id) throw new SheetError("Link the Google Sheet first.");
  const week = weekKey();
  let out: FillResult;
  try {
    const { tabs } = await tabsOf(env, cfg.id);
    if (!tabs.niveau && !tabs.suivi && !tabs.plan) throw new SheetError("None of the tabs Niveau technique, Suivi et Validation Classe or Plan d'action is in this sheet.");
    const names = await readNames(env, cfg.id, tabs.niveau);
    const plan = await readPlanLayout(env, cfg.id, tabs.plan);
    const b = await buildFill(env, g, cfg, tabs, names, plan);
    if (b.data.length) await gapi(env, `${cfg.id}/values:batchUpdate`, { method: "POST", body: { valueInputOption: "USER_ENTERED", data: b.data } });
    if (b.clear.length) await gapi(env, `${cfg.id}/values:batchClear`, { method: "POST", body: { ranges: b.clear } });
    const warn = [...b.warn];
    for (const [k, t] of Object.entries({ niveau: "Niveau technique", suivi: "Suivi et Validation Classe", plan: "Plan d'action" })) if (!(tabs as any)[k]) warn.push(`No tab “${t}” found: skipped`);
    out = { at: now(), ok: true, why, levels: b.res.levels, briefs: b.res.briefs, plans: b.res.plans, unmatched: b.unmatched, missing: b.missing, warn };
    cfg.plan_rows = b.res.plan_rows; cfg.next_end = b.res.next_end;
  } catch (e) {
    out = { at: now(), ok: false, why, error: e instanceof SheetError ? e.message : `Unexpected error: ${(e as Error).message}` };
    if (!(e instanceof SheetError)) console.error("google sheet fill failed", e);
  }
  // re-read: a debrief finalized meanwhile keeps its "dirty" mark
  const fresh = (await getCfg(env, g.id)) || cfg;
  await saveCfg(env, g.id, { ...fresh, plan_rows: cfg.plan_rows, next_end: cfg.next_end, week, dirty: fresh.dirty && fresh.dirty > out.at - 5 ? fresh.dirty : null, last: out });
  return out;
}

/** The ISO week, from Monday 08:00 (Morocco). */
export function weekKey(t = Date.now()) {
  const d = new Date(t + 3600_000 - 8 * 3600_000);
  const day = (d.getUTCDay() + 6) % 7;
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return mon.toISOString().slice(0, 10);
}

/** Every 5 minutes: the class whose sheet is due (a change 2 minutes ago, a new week, a sprint that ended), one per run. */
export async function sheetCron(env: Env) {
  if (new Date(Date.now()).getUTCMinutes() % 5 !== 2) return;
  const rows = await all<{ k: string; dirty: number | null; week: string | null; next_end: string | null; auto: number | null; id: string | null }>(env,
    "SELECT k, json_extract(v, '$.dirty') AS dirty, json_extract(v, '$.week') AS week, json_extract(v, '$.next_end') AS next_end, json_extract(v, '$.auto') AS auto, json_extract(v, '$.id') AS id FROM app_settings WHERE k LIKE 'gsheet:%'").catch(() => []);
  const t0 = now(), wk = weekKey(), d0 = today();
  for (const r of rows) {
    if (!r.id || r.auto === 0) continue;
    const why = r.dirty && r.dirty <= t0 - 120 ? "change" : r.week !== wk ? "weekly" : r.next_end && r.next_end < d0 ? "sprint end" : null;
    if (!why) continue;
    const g = await getGuild(env, r.k.slice("gsheet:".length)).catch(() => null);
    if (g) { await fillSheet(env, g, why); return; }
  }
}

// ------------------------------------------------------------------ Settings
export async function sheetView(env: Env, g: GuildRow) {
  const k = await saKey(env);
  const c = await getCfg(env, g.id);
  return { key: k ? { email: k.client_email, source: k.source } : null, sheet: c?.id ? { id: c.id, url: `https://docs.google.com/spreadsheets/d/${c.id}/edit` } : null, auto: c ? c.auto : true, last: c?.last ?? null, mapped: Object.keys(c?.map || {}).length };
}
/** The pasted JSON key: tested (Google gives a token) before it is kept. */
export async function saveKey(env: Env, text: string | null) {
  if (text === null) { await run(env, "DELETE FROM app_settings WHERE k = ?", KEY_K); tokenCache = null; return; }
  const k = parseKey(text);
  tokenCache = null;
  await accessToken(k);
  await put(env, KEY_K, JSON.stringify({ type: "service_account", client_email: k.client_email, private_key: k.private_key }));
}
/** Link (or unlink) the sheet, turn the automatic fills on or off. Linking reads it: the tabs found. */
export async function saveSheet(env: Env, g: GuildRow, b: { url?: unknown; auto?: unknown; unlink?: unknown }) {
  const c: SheetCfg = (await getCfg(env, g.id)) || { id: "", auto: true, map: {} };
  if (b.unlink) { await run(env, "DELETE FROM app_settings WHERE k = ?", CFG(g.id)); return { tabs: null }; }
  let found = null;
  if (b.url !== undefined) {
    const id = sheetIdOf(String(b.url));
    if (id !== c.id) { c.plan_rows = 0; c.last = null; }
    c.id = id;
    found = await tabsOf(env, id);
  }
  if (b.auto !== undefined) c.auto = !!b.auto;
  await saveCfg(env, g.id, c);
  return { tabs: found };
}
/** The names of the sheet and who ClassBot puts on each row. */
export async function namesView(env: Env, g: GuildRow) {
  const c = await getCfg(env, g.id);
  if (!c?.id) throw new SheetError("Link the Google Sheet first.");
  const { tabs } = await tabsOf(env, c.id);
  if (!tabs.niveau) throw new SheetError("No “Niveau technique” tab in this sheet: the names are read there (column A, from row 3).");
  const sheet = await readNames(env, c.id, tabs.niveau);
  const S = await sheetLevels(env, g);
  const names = await studentNames(env, g, S.students);
  const match = matchNames(sheet, names, c.map);
  return { rows: sheet.map((n, i) => ({ row: 3 + i, name: n, uid: match[n] || "", chosen: c.map[norm(n)] !== undefined })), students: names.map((s) => ({ id: s.id, name: s.name })) };
}
/** The teacher's choices: sheet name → student ("" = nobody); "auto" puts it back to ClassBot's guess. */
export async function saveNames(env: Env, g: GuildRow, map: Record<string, unknown>) {
  const c = await getCfg(env, g.id);
  if (!c) throw new SheetError("Link the Google Sheet first.");
  const ids = new Set((await all<{ discord_id: string }>(env, "SELECT discord_id FROM players WHERE guild_id = ?", g.id)).map((r) => r.discord_id));
  for (const [n, v] of Object.entries(map || {})) {
    const k = norm(n);
    if (!k) continue;
    if (v === "auto") delete c.map[k];
    else if (v === "" || ids.has(String(v))) c.map[k] = String(v);
  }
  await saveCfg(env, g.id, c);
}
