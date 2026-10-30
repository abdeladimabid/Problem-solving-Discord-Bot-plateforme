// 📗 The trainer's Google Sheet "Suivi Formateur", filled by ClassBot (Settings → Google Sheet).
//   • Niveau technique         each student's level per sprint (S1…S8): the teacher's, else the proposed one; ended sprints only
//   • Suivi et Validation      per sprint (3 rows each): the briefs, their start and end dates, the individual debriefing
//                              (Non / En cours / Oui), the collective debriefing and the retro (Oui once every debrief is final)
//   • Suivi fil rouge          never touched
//   • Plan d'action Retro      every plan d'action sent: student, level, difficulties, start, actions, end
// ClassBot writes with a Google service account (its key: the Cloudflare secret GOOGLE_SERVICE_ACCOUNT, or pasted in
// Settings, never shown again); the trainer shares the sheet with its email as Editor. Filled on "Fill now", and by
// itself: 2 minutes after a debrief is finalized, a sprint level is set or a plan is sent; every Monday; the day after
// a sprint ends. Cells that ClassBot has no value for are never cleared. Kept in app_settings (gsheet:<guild>).
import type { Env, GuildRow } from "./types.ts";
import { all, getGuild, now, one, run } from "./db.ts";
import { sheetLevels } from "./sprints.ts";

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
let tokenCache: { email: string; token: string; exp: number } | null = null;
async function accessToken(k: SaKey): Promise<string> {
  const t0 = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.email === k.client_email && tokenCache.exp > t0 + 60) return tokenCache.token;
  const der = Uint8Array.from(atob(k.private_key.replace(/-----(BEGIN|END)[^-]*-----/g, "").replace(/\\n/g, "").replace(/[^A-Za-z0-9+/=]/g, "")), (c) => c.charCodeAt(0));
  let key: CryptoKey;
  try { key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]); }
  catch { throw new SheetError("The private key in this JSON can't be read: download a new JSON key."); }
  const part = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const data = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iss: k.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: t0 - 30, exp: t0 + 3500 })}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data)));
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${data}.${b64url(sig)}` });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new SheetError(`Google refused the key (${j.error_description || j.error || res.status}). Is the service account still there, and the key not deleted?`);
  tokenCache = { email: k.client_email, token: j.access_token, exp: t0 + (Number(j.expires_in) || 3600) };
  return j.access_token;
}

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
export async function buildFill(env: Env, g: GuildRow, cfg: SheetCfg, tabs: ReturnType<typeof findTabs>, sheetNames: string[]) {
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

  // 3. Plan d'action Retro: row 4 on, B student · C level · D difficulties · E start · F actions · G end
  if (tabs.plan) {
    const plans = await all<{ sid: string; name: string | null; status: string; sent_at: number | null; created_at: number | null; due_at: number | null; lac: string | null; steps: string | null; summary: string | null }>(env,
      `SELECT json_extract(a.v, '$.sid') AS sid, json_extract(a.v, '$.name') AS name, json_extract(a.v, '$.status') AS status, json_extract(a.v, '$.sent_at') AS sent_at,
        json_extract(a.v, '$.created_at') AS created_at, json_extract(a.v, '$.due_at') AS due_at, json_extract(a.v, '$.diag.summary') AS summary,
        (SELECT json_group_array(json_extract(l.value, '$.notion')) FROM json_each(a.v, '$.diag.lacunes') l) AS lac,
        (SELECT json_group_array(COALESCE(NULLIF(json_extract(s.value, '$.title'), ''), json_extract(s.value, '$.notion'))) FROM json_each(a.v, '$.steps') s) AS steps
       FROM app_settings a WHERE a.k LIKE ?`, `wplan:${g.id}:%`).catch(() => []);
    const sheetOf = new Map(Object.entries(match).filter(([, v]) => v).map(([n, v]) => [v, n]));
    const arr = (s: string | null) => { try { const a = JSON.parse(s || "[]"); return Array.isArray(a) ? a.filter((x) => x).map(String) : []; } catch { return []; } };
    const rows = plans.filter((p) => p.status === "sent" || p.status === "done").sort((a, b) => (a.sent_at || a.created_at || 0) - (b.sent_at || b.created_at || 0)).map((p) => {
      const lac = arr(p.lac), steps = arr(p.steps);
      return [text(sheetOf.get(p.sid) || p.name || p.sid), LEVEL_SHEET[lastLevel(p.sid)] || null, text(lac.join(", ") || String(p.summary || "")), day(p.sent_at || p.created_at),
        text(steps.map((s, i) => `${i + 1}. ${s}`).join("\n")), day(p.due_at)];
    });
    data.push({ range: `${q(tabs.plan)}!B3`, values: [["Apprenant(e)"]] });
    if (rows.length) data.push({ range: `${q(tabs.plan)}!B4:G${3 + rows.length}`, values: rows });
    if ((cfg.plan_rows || 0) > rows.length) clear.push(`${q(tabs.plan)}!B${4 + rows.length}:G${3 + (cfg.plan_rows || 0)}`);
    res.plans = rows.length; res.plan_rows = rows.length;
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
    const b = await buildFill(env, g, cfg, tabs, names);
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
