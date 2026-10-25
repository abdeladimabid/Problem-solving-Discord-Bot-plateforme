// VS Code activity (pure: no database). The learners' WakaTime extension sends its heartbeats to ClassBot instead of
// wakatime.com (src/bot/wakatime.ts); ClassBot computes the time itself, in Africa/Casablanca time.
//   • what wakatime-cli sends, checked in its source (pkg/heartbeat/heartbeat.go, pkg/api/heartbeat.go):
//     POST {api_url}/users/current/heartbeats.bulk, `Authorization: Basic base64(key)`, keys `waka_<uuid v4>` only
//     (the CLI refuses any other format), at most one send every 120 s per computer, 10 heartbeats per request;
//     older heartbeats come later from its offline queue. The status bar asks GET …/users/current/statusbar/today.
//   • a heartbeat: entity (the file, an absolute path unless hide_project_folder), project, project_root_count, language,
//     lines (in the file), is_write (= saved), category ("ai coding" when an AI writes), ai_line_changes and
//     human_line_changes (net line count change since the file's last heartbeat), time, user_agent.
//   • temps actif: the gaps between two heartbeats up to the idle limit (a longer gap counts 0), plus LAST_SLICE after
//     the last heartbeat of a session. Temps d'écriture: the gaps that end on a heartbeat where the file changed
//     (saved, lines changed, or a different line count than the file's previous heartbeat), never "ai coding".
//   • never stored: absolute paths, the computer's name, branches, dependencies, AI prompts and tokens.

// ------------------------------------------------------------------ settings
export interface VscWindow { on: boolean; from: string; to: string; weekdays: boolean }
export interface VscSettings {
  enabled: boolean;
  idle: number;        // minutes: a longer gap between two heartbeats counts 0
  window: VscWindow;   // only count this time of day (Casablanca), Monday → Friday if weekdays
  retention: number;   // days the raw heartbeats are kept (the totals stay)
  files: boolean;      // store the file names (else the project and language only)
  consent: string;     // the consent text shown by /vscode setup ("" = the default one)
  consent_v: number;   // goes up when the text changes
}
export const VSC_DEFAULTS: VscSettings = {
  enabled: true, idle: 5, window: { on: false, from: "08:00", to: "18:00", weekdays: true }, retention: 30, files: true, consent: "", consent_v: 1,
};
/** Seconds counted after the last heartbeat of a session (the extension sends one every 2 min at most on the same file). */
export const LAST_SLICE = 60;
export const MAX_PER_REQUEST = 25;          // wakatime.com's limit for the bulk endpoint (the CLI sends 10)
export const MAX_PER_DAY = 2000;            // per learner: one every 15 s for 8 h (the extension: one per 2 min per file + saves); more is dropped
export const MAX_AGE_DAYS = 14;             // older heartbeats (an old offline queue) are dropped
export const FUTURE_SLACK = 600;            // a computer clock a few minutes ahead is fine
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function vscSettings(json: string | null | undefined): VscSettings {
  let o: any = {};
  try { o = JSON.parse(json || "{}") || {}; } catch { o = {}; }
  const int = (v: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  const w = o.window && typeof o.window === "object" ? o.window : {};
  const from = HHMM.test(w.from) ? w.from : VSC_DEFAULTS.window.from, to = HHMM.test(w.to) ? w.to : VSC_DEFAULTS.window.to;
  return {
    enabled: o.enabled !== false,
    idle: int(o.idle, VSC_DEFAULTS.idle, 1, 30),
    window: { on: w.on === true && from < to, from, to, weekdays: w.weekdays !== false },
    retention: int(o.retention, VSC_DEFAULTS.retention, 7, 90),
    files: o.files !== false,
    consent: typeof o.consent === "string" ? o.consent.trim().slice(0, 1800) : "",
    consent_v: int(o.consent_v, 1, 1, 1e6),
  };
}
/** The settings sent by the dashboard, merged on the saved ones; the consent version goes up when its text changes. */
export function mergeSettings(cur: VscSettings, body: any): VscSettings {
  const next = vscSettings(JSON.stringify({ ...cur, ...body, window: { ...cur.window, ...(body?.window ?? {}) } }));
  next.consent_v = next.consent !== cur.consent ? cur.consent_v + 1 : cur.consent_v;
  return next;
}

// --------------------------------------------------------------- time zone
// Days and weeks are Moroccan (Africa/Casablanca: UTC+1, UTC+0 during Ramadan); weeks run Monday → Sunday.
export const TZ = "Africa/Casablanca";
let fmt: Intl.DateTimeFormat | null = null;
function parts(t: number) {
  fmt ??= new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(new Date(Math.floor(t) * 1000))) p[x.type] = x.value;
  return p;
}
/** Seconds to add to a UTC time to get the Casablanca wall clock. */
export function tzOffset(t: number): number {
  const p = parts(t);
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000 - Math.floor(t)) / 60) * 60;
}
export const dayOf = (t: number) => { const p = parts(t); return `${p.year}-${p.month}-${p.day}`; };
export const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
export const addDays = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
/** 0 = Monday … 6 = Sunday */
export const weekday = (day: string) => (new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7;
export const mondayOf = (day: string) => addDays(day, -weekday(day));
/** The instant a Casablanca wall-clock time happens (minutes after midnight). */
export function localTime(day: string, minutes: number): number {
  const u = Date.parse(day + "T00:00:00Z") / 1000 + minutes * 60;
  let t = u - tzOffset(u);
  t = u - tzOffset(t);
  return t;
}
export const dayStart = (day: string) => localTime(day, 0);
/** A day's clock: its start and end, and the start of each local hour (24, or 23/25 when the clock changes). */
export function dayClock(day: string) {
  const start = dayStart(day), end = dayStart(addDays(day, 1));
  const hours: number[] = [];
  for (let h = 0; h < 24; h++) hours.push(localTime(day, h * 60));
  return { day, start, end, hours };
}
export type DayClock = ReturnType<typeof dayClock>;

// --------------------------------------------------------------------- keys
/** A learner's key, in the only format wakatime-cli accepts: waka_ + a UUID v4 (122 random bits). */
export const newKey = () => "waka_" + crypto.randomUUID();
export const KEY_RE = /^(waka_)?[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export async function hashKey(key: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key.trim().toLowerCase().replace(/^waka_/, "")));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** The key a request carries: Basic base64(key) like wakatime-cli (also "key:" or ":key"), Bearer, or ?api_key=. */
export function keyOf(auth: string | null, query: string | null): string | null {
  const pick = (s: string) => {
    const k = s.trim().toLowerCase();
    return KEY_RE.test(k) ? k : null;
  };
  const a = (auth ?? "").trim();
  let m = a.match(/^Basic\s+([A-Za-z0-9+/=_-]+)$/i);
  if (m) {
    let dec = "";
    try { dec = atob(m[1].replace(/-/g, "+").replace(/_/g, "/")); } catch { dec = ""; }
    for (const part of [dec, ...dec.split(":")]) { const k = pick(part); if (k) return k; }
    return null;
  }
  m = a.match(/^Bearer\s+(\S+)$/i);
  if (m) return pick(m[1]);
  return query ? pick(query) : null;
}

// --------------------------------------------------------- heartbeats in
export interface Hb {
  t: number;        // unix seconds (decimals kept for the order)
  p: string;        // project ("" unknown)
  f: string;        // file path relative to the project ("" hidden)
  lang: string;
  cat: string;      // coding, debugging, building, ai coding…
  w: 0 | 1;         // saved
  lines: number;    // lines in the file (-1 unknown)
  ai: number;       // ai_line_changes (net)
  hu: number;       // human_line_changes (net)
  lc: 0 | 1;        // the heartbeat carried line changes (so "0 AI lines" is a fact, not missing data)
  ed: string;       // editor (VS Code, Cursor…)
}
const CATEGORIES = ["coding", "building", "indexing", "debugging", "browsing", "running tests", "writing tests", "manual testing", "writing docs",
  "communicating", "code reviewing", "researching", "learning", "designing", "ai coding", "planning", "notes", "translating", "advising", "supporting", "meeting"];
const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n) : "");
const intIn = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);
const baseName = (p: string) => p.split("/").filter(Boolean).pop() ?? "";

/**
 * The path to keep, relative to the project root: never absolute. An absolute path is cut after its project root
 * (project_root_count = the slashes of the project folder, as the CLI counts them), else only the file name stays.
 */
export function relPath(entity: string, rootCount: number | null): string {
  let e = entity.replace(/\\/g, "/").trim();
  if (/^HIDDEN(\.[\w-]{1,12})?$/.test(e)) return e;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(e)) return baseName(e.replace(/[?#].*$/, ""));      // remote (ssh://, vscode-remote://…)
  const absolute = /^\//.test(e) || /^[A-Za-z]:\//.test(e) || /^~\//.test(e);
  let segs: string[];
  if (absolute) {
    const all = e.split("/");
    if (!rootCount || rootCount < 1 || rootCount >= all.length) return baseName(e);
    segs = all.slice(rootCount).filter(Boolean);
  } else {
    segs = e.split("/").filter((s) => s && s !== ".");
    if (segs.some((s) => s === "..") || /^[A-Za-z]:$/.test(segs[0] ?? "")) return baseName(e);
  }
  if (!segs.length) return "";
  let out = segs.join("/");
  if (out.length > 200) out = segs.slice(-3).join("/").slice(-200);
  return out;
}

/** The editor from the user agent ("wakatime/v1.x (windows-…) go1.x vscode/1.95.0 vscode-wakatime/25.0.0"). */
export function editorOf(ua: unknown): string {
  const s = str(ua, 300).toLowerCase();
  const names: [RegExp, string][] = [[/\bcursor\//, "Cursor"], [/\bwindsurf\//, "Windsurf"], [/\bvscodium\//, "VSCodium"], [/\b(vscode|code-oss)\//, "VS Code"],
    [/\b(jetbrains|intellij|idea|pycharm|webstorm|phpstorm|goland|clion|rider|android studio)/, "JetBrains"], [/\bsublime/, "Sublime Text"], [/\bneovim|\bnvim/, "Neovim"],
    [/\bvim\//, "Vim"], [/\bemacs/, "Emacs"], [/\bzed\//, "Zed"], [/claude/, "Claude Code"], [/codex/, "Codex"]];
  for (const [re, n] of names) if (re.test(s)) return n;
  const toks = [...s.matchAll(/([a-z][\w.-]{1,30})\/[\w.+-]+/g)].map((m) => m[1]).filter((x) => x !== "wakatime" && !/^go\d/.test(x));
  return (toks[0] ?? "").slice(0, 24);
}

export type HbCheck = { ok: true; hb: Hb } | { ok: false; status: 400 | 201; error: string };
/**
 * One heartbeat from wakatime-cli, checked and reduced to what ClassBot keeps. 400 = malformed (the CLI drops it),
 * 201 = fine but not kept (not a file, too old): the CLI must not send it again.
 */
export function checkHeartbeat(h: any, o: { now: number; hideFiles: boolean; ua?: string | null; maxAgeDays?: number }): HbCheck {
  if (!h || typeof h !== "object" || Array.isArray(h)) return { ok: false, status: 400, error: "heartbeat must be an object" };
  const entity = typeof h.entity === "string" ? h.entity : "";
  if (!entity.trim() || entity.length > 2048) return { ok: false, status: 400, error: "entity: required (up to 2048 characters)" };
  const t = typeof h.time === "number" ? h.time : Number(h.time);
  if (!Number.isFinite(t) || t <= 0) return { ok: false, status: 400, error: "time: a unix timestamp is required" };
  if (t > o.now + FUTURE_SLACK) return { ok: false, status: 400, error: "time: in the future" };
  if ((h.type ?? "file") !== "file") return { ok: false, status: 201, error: "only files are kept" };
  if (t < o.now - Math.min(MAX_AGE_DAYS, o.maxAgeDays ?? MAX_AGE_DAYS) * 86400) return { ok: false, status: 201, error: "too old: not kept" };
  const cat = str(h.category, 30).toLowerCase();
  const lines = intIn(h.lines, 0, 1_000_000);
  const ai = intIn(h.ai_line_changes, -100_000, 100_000), hu = intIn(h.human_line_changes, -100_000, 100_000);
  const rc = intIn(h.project_root_count, 0, 200);
  return {
    ok: true,
    hb: {
      t: Math.round(t * 1000) / 1000,
      p: str(h.project, 100),
      f: o.hideFiles ? "" : relPath(entity, rc),
      lang: str(h.language, 40),
      cat: CATEGORIES.includes(cat) ? cat : "coding",
      w: h.is_write === true ? 1 : 0,
      lines: lines ?? -1,
      ai: ai ?? 0, hu: hu ?? 0, lc: ai !== null || hu !== null ? 1 : 0,
      ed: editorOf(h.user_agent ?? o.ua),
    },
  };
}

/** Same second, same file, same save: the same heartbeat sent twice (the offline queue replays some). */
export const hbKey = (h: Hb) => `${Math.floor(h.t)}|${h.p}|${h.f}|${h.w}|${h.cat}`;
/**
 * Heartbeats of the same file and category less than COALESCE seconds after the first one of their burst become one
 * (saved if any was, line changes added, the last line count). Auto Save or Ctrl+S every few seconds sends one per
 * save: a day stays small and fast to recompute, and the time hardly moves (each gap was counted anyway).
 */
export const COALESCE = 30;
export function mergeHeartbeats(old: Hb[], add: Hb[]): { list: Hb[]; added: number } {
  const seen = new Set(old.map(hbKey));
  const all = [...old];
  let added = 0;
  for (const h of add) {
    const k = hbKey(h);
    if (seen.has(k)) continue;
    seen.add(k); all.push({ ...h }); added++;
  }
  all.sort((a, b) => a.t - b.t);
  const list: Hb[] = [];
  for (const h of all) {
    const p = list[list.length - 1];
    if (p && p.p === h.p && p.f === h.f && p.cat === h.cat && h.t - p.t < COALESCE) {
      p.w = p.w || h.w ? 1 : 0; p.ai += h.ai; p.hu += h.hu; p.lc = p.lc || h.lc ? 1 : 0;
      if (h.lines >= 0) p.lines = h.lines;
      p.ed ||= h.ed;
      continue;
    }
    if (list.length >= MAX_PER_DAY) break;
    list.push(h);
  }
  return { list, added };
}

// ------------------------------------------------------ the raw, compact
// Stored per learner and day: dictionaries + one short array per heartbeat ([dt, file, lang, cat, w, lines, ai, hu, lc, ed]),
// about 30 bytes each. Cleared after the retention days; the day's totals stay.
export function packRaw(list: Hb[], start: number): string {
  const dict = () => { const m = new Map<string, number>(), arr: string[] = []; return { arr, i: (v: string) => { let n = m.get(v); if (n === undefined) { n = arr.length; m.set(v, n); arr.push(v); } return n; } }; };
  const files = dict(), langs = dict(), cats = dict(), eds = dict();
  const h = list.map((x) => [Math.round((x.t - start) * 10) / 10, files.i(x.p + "\t" + x.f), langs.i(x.lang), cats.i(x.cat), x.w, x.lines, x.ai, x.hu, x.lc, eds.i(x.ed)]);
  return JSON.stringify({ v: 1, files: files.arr, langs: langs.arr, cats: cats.arr, eds: eds.arr, h });
}
export function unpackRaw(json: string | null | undefined, start: number): Hb[] {
  if (!json) return [];
  let o: any;
  try { o = JSON.parse(json); } catch { return []; }
  if (!o || !Array.isArray(o.h)) return [];
  return o.h.map((r: any[]) => {
    const [p, f] = String(o.files?.[r[1]] ?? "\t").split("\t");
    return { t: start + Number(r[0]), p: p ?? "", f: f ?? "", lang: o.langs?.[r[2]] ?? "", cat: o.cats?.[r[3]] ?? "coding", w: r[4] ? 1 : 0, lines: Number(r[5] ?? -1), ai: Number(r[6] ?? 0), hu: Number(r[7] ?? 0), lc: r[8] ? 1 : 0, ed: o.eds?.[r[9]] ?? "" } as Hb;
  });
}

// ---------------------------------------------------------------- one day
export interface DayAgg {
  active: number; write: number; first: number | null; last: number | null; n: number;
  ai: number; hu: number; lineData: boolean;    // lines changed by an AI / by the learner (abs of the net changes)
  aiTime: number;                               // seconds in "ai coding"
  hours: [number, number][];                    // per local hour: [active, writing] seconds
  projects: [string, number, number][];         // [project, active, writing], most first
  files: [string, string, string, number, number][];   // [project, file, language, active, writing]
  langs: [string, number, number][];
  editors: [string, number][];
  sessions: [number, number, number, number][]; // [start, end, active, writing]
  big: [number, string, string, number][];      // big insertions: [time, project, file, lines added]
  cur: { p: string; f: string; ed: string; cat: string } | null;
  head: { t: number; changed: boolean } | null;          // the day's first heartbeat (the day before ends its session on it)
  edge: { prev: { t: number } | null; next: { t: number; changed: boolean } | null };   // the neighbour days' heartbeats used across midnight
}
export const emptyAgg = (): DayAgg => ({ active: 0, write: 0, first: null, last: null, n: 0, ai: 0, hu: 0, lineData: false, aiTime: 0, hours: Array.from({ length: 24 }, () => [0, 0] as [number, number]), projects: [], files: [], langs: [], editors: [], sessions: [], big: [], cur: null, head: null, edge: { prev: null, next: null } });

const BIG_LINES = 80, BIG_SECONDS = 180;

/** Where a file's content changed, from the heartbeats alone (saved, line changes, or a different line count). */
export function changedFlags(list: Hb[]): boolean[] {
  const lines = new Map<string, number>();
  return list.map((h) => {
    const k = h.p + "\t" + h.f;
    const before = h.f ? lines.get(k) : undefined;
    if (h.f && h.lines >= 0) lines.set(k, h.lines);
    return !!h.w || h.ai !== 0 || h.hu !== 0 || (before !== undefined && h.lines >= 0 && h.lines !== before);
  });
}

/** The counted part of a day: all of it, or the class's time window (none on a weekend when it is weekdays only). */
export function countedSpan(clk: DayClock, win: VscWindow | null | undefined): [number, number] | null {
  if (!win?.on) return [clk.start, clk.end];
  if (win.weekdays && weekday(clk.day) > 4) return null;
  const [fh, fm] = win.from.split(":").map(Number), [th, tm] = win.to.split(":").map(Number);
  const lo = Math.max(clk.start, localTime(clk.day, fh * 60 + fm)), hi = Math.min(clk.end, localTime(clk.day, th * 60 + tm));
  return hi > lo ? [lo, hi] : null;
}

/**
 * A learner's day from its heartbeats (sorted). `prev` / `next`: the last heartbeat of the day before and the first of
 * the day after, so a session across midnight is cut at midnight instead of being counted twice or lost.
 */
export function computeDay(list: Hb[], clk: DayClock, o: { idle: number; window?: VscWindow | null; prev?: { t: number } | null; next?: { t: number; changed: boolean } | null }): DayAgg {
  const agg = emptyAgg();
  const limit = Math.max(60, o.idle * 60), slice = Math.min(LAST_SLICE, limit), span = countedSpan(clk, o.window);
  const changed = changedFlags(list);
  const proj = new Map<string, [number, number]>(), file = new Map<string, [string, string, string, number, number]>(), lang = new Map<string, [number, number]>(), ed = new Map<string, number>();
  let sess: [number, number, number, number] | null = null;
  const hourEnd = (i: number) => (i < 23 ? clk.hours[i + 1] : clk.end);
  let hi0 = 0;   // the hour the last interval started in (intervals come in time order)
  const add = (a: number, b: number, h: Hb, writing: boolean) => {
    if (!span) return;
    const lo = Math.max(a, span[0]), hi = Math.min(b, span[1]);
    if (hi > lo) {
      const d = hi - lo, wd = writing ? d : 0;
      agg.active += d; agg.write += wd;
      if (h.cat === "ai coding") agg.aiTime += d;
      // the local hours it covers
      if (clk.hours[hi0] > lo) hi0 = 0;
      while (hi0 < 23 && hourEnd(hi0) <= lo) hi0++;
      for (let i = hi0; i < 24 && clk.hours[i] < hi; i++) {
        const x = Math.min(hi, hourEnd(i)) - Math.max(lo, clk.hours[i]);
        if (x > 0) { agg.hours[i][0] += x; if (writing) agg.hours[i][1] += x; }
      }
      const pk = proj.get(h.p) ?? [0, 0]; pk[0] += d; pk[1] += wd; proj.set(h.p, pk);
      if (h.f) { const fk = h.p + "\t" + h.f; const fv = file.get(fk) ?? [h.p, h.f, h.lang, 0, 0]; fv[3] += d; fv[4] += wd; file.set(fk, fv); }
      if (h.lang) { const lk = lang.get(h.lang) ?? [0, 0]; lk[0] += d; lk[1] += wd; lang.set(h.lang, lk); }
      if (h.ed) ed.set(h.ed, (ed.get(h.ed) ?? 0) + d);
      // a gap that wasn't counted starts a new session
      if (!sess || lo > sess[1] + 1) { if (sess) agg.sessions.push(sess); sess = [lo, hi, 0, 0]; }
      sess[1] = Math.max(sess[1], hi); sess[2] += d; sess[3] += wd;
    }
  };
  // across midnight: from the day before's last heartbeat to the first one of today
  if (list.length && o.prev && list[0].t - o.prev.t > 0 && list[0].t - o.prev.t <= limit) {
    add(o.prev.t, list[0].t, list[0], changed[0] && list[0].cat !== "ai coding");
    agg.edge.prev = { t: o.prev.t };
  }
  const lastLines = new Map<string, [number, number]>();
  list.forEach((h, i) => {
    const nx = list[i + 1];
    if (nx) {
      const gap = nx.t - h.t;
      if (gap <= limit) add(h.t, nx.t, h, changed[i + 1] && nx.cat !== "ai coding");
      else add(h.t, h.t + slice, h, false);
    } else if (o.next && o.next.t - h.t > 0 && o.next.t - h.t <= limit) {
      add(h.t, o.next.t, h, o.next.changed);
      agg.edge.next = { t: o.next.t, changed: o.next.changed };
    } else add(h.t, h.t + slice, h, false);
    // lines: what the AI and the learner changed; a big jump of the line count in a short time (pasted, generated)
    if (h.lc) agg.lineData = true;
    agg.ai += Math.abs(h.ai); agg.hu += Math.abs(h.hu);
    if (h.f && h.lines >= 0) {
      const k = h.p + "\t" + h.f, b = lastLines.get(k);
      if (b && h.lines - b[0] >= BIG_LINES && h.t - b[1] <= BIG_SECONDS && h.cat !== "ai coding" && agg.big.length < 20) agg.big.push([Math.round(h.t), h.p, h.f, h.lines - b[0]]);
      lastLines.set(k, [h.lines, h.t]);
    }
  });
  if (sess) agg.sessions.push(sess);
  const inDay = list.filter((h) => h.t >= clk.start && h.t < clk.end);
  agg.n = inDay.length;
  agg.first = inDay.length ? Math.floor(inDay[0].t) : null;
  agg.last = inDay.length ? Math.floor(inDay[inDay.length - 1].t) : null;
  const lh = inDay[inDay.length - 1], i0 = list.findIndex((h) => h.t >= clk.start && h.t < clk.end);
  agg.cur = lh ? { p: lh.p, f: lh.f, ed: lh.ed, cat: lh.cat } : null;
  agg.head = i0 >= 0 ? { t: Math.floor(list[i0].t), changed: changed[i0] && list[i0].cat !== "ai coding" } : null;
  const r = (x: number) => Math.round(x);
  agg.active = r(agg.active); agg.write = r(agg.write); agg.aiTime = r(agg.aiTime);
  agg.hours = agg.hours.map(([a, w]) => [r(a), r(w)]);
  agg.projects = [...proj].map(([p, [a, w]]) => [p, r(a), r(w)] as [string, number, number]).sort((x, y) => y[1] - x[1]).slice(0, 20);
  agg.files = [...file.values()].map(([p, f, l, a, w]) => [p, f, l, r(a), r(w)] as [string, string, string, number, number]).sort((x, y) => y[3] - x[3]).slice(0, 60);
  agg.langs = [...lang].map(([l, [a, w]]) => [l, r(a), r(w)] as [string, number, number]).sort((x, y) => y[1] - x[1]).slice(0, 12);
  agg.editors = [...ed].map(([e, a]) => [e, r(a)] as [string, number]).sort((x, y) => y[1] - x[1]);
  agg.sessions = agg.sessions.slice(0, 40).map(([s, e, a, w]) => [Math.floor(s), Math.ceil(e), r(a), r(w)]);
  return agg;
}

/** Several days added up (a week, a brief's dates): the totals, projects, files and languages. */
export function sumDays(days: DayAgg[]) {
  const out = { active: 0, write: 0, ai: 0, hu: 0, lineData: false, aiTime: 0, days: 0, projects: new Map<string, [number, number]>(), files: new Map<string, [string, string, string, number, number]>(), langs: new Map<string, [number, number]>() };
  for (const d of days) {
    out.active += d.active; out.write += d.write; out.ai += d.ai; out.hu += d.hu; out.aiTime += d.aiTime || 0; out.lineData ||= d.lineData;
    if (d.active > 0) out.days++;
    for (const [p, a, w] of d.projects) { const v = out.projects.get(p) ?? [0, 0]; v[0] += a; v[1] += w; out.projects.set(p, v); }
    for (const [p, f, l, a, w] of d.files) { const k = p + "\t" + f; const v = out.files.get(k) ?? [p, f, l, 0, 0]; v[3] += a; v[4] += w; out.files.set(k, v); }
    for (const [l, a, w] of d.langs) { const v = out.langs.get(l) ?? [0, 0]; v[0] += a; v[1] += w; out.langs.set(l, v); }
  }
  return {
    active: out.active, write: out.write, ai: out.ai, hu: out.hu, lineData: out.lineData, aiTime: out.aiTime, days: out.days,
    projects: [...out.projects].map(([p, [a, w]]) => ({ project: p, active: a, write: w })).sort((x, y) => y.active - x.active),
    files: [...out.files.values()].map(([p, f, l, a, w]) => ({ project: p, file: f, lang: l, active: a, write: w })).sort((x, y) => y.active - x.active),
    langs: [...out.langs].map(([l, [a, w]]) => ({ lang: l, active: a, write: w })).sort((x, y) => y.active - x.active),
  };
}

/** A project and a GitHub repo are the same work when the names match (the folder is usually the repo's name). */
export const sameProject = (project: string, repo: string | null | undefined) => {
  const norm = (s: string) => s.toLowerCase().replace(/\.git$/, "").replace(/[^a-z0-9]+/g, "");
  const r = String(repo ?? "").split("/").pop() ?? "";
  return !!project && !!r && norm(project) === norm(r);
};

// ------------------------------------------------------------------ signals
// Shown as « à vérifier », never as an accusation (like the Integrity page): facts and where to look.
export interface Commit { t: number; repo: string | null; adds: number | null; dels: number | null; size?: string | null }
export interface Signal { kind: "commit_little_writing" | "long_no_commit" | "big_insert" | "ai_share"; day: string; project?: string; file?: string; n?: number; minutes?: number; pct?: number; t?: number }
export const SIG = { commitLines: 150, littleWriting: 10 * 60, longFile: 90 * 60, aiShare: 50, aiLines: 50 };
export function signals(day: string, d: DayAgg, commits: Commit[]): Signal[] {
  const out: Signal[] = [];
  // many lines committed on a project with little writing time on it that day (GitHub has no file names per commit)
  const byRepo = new Map<string, number>();
  for (const c of commits) if (c.repo && c.size !== "merge") byRepo.set(c.repo, (byRepo.get(c.repo) ?? 0) + (c.adds ?? 0));
  for (const [repo, adds] of byRepo) {
    if (adds < SIG.commitLines) continue;
    const p = d.projects.find(([name]) => sameProject(name, repo));
    const w = p ? p[2] : 0;
    if (w < SIG.littleWriting) out.push({ kind: "commit_little_writing", day, project: repo.split("/").pop(), n: adds, minutes: Math.round(w / 60) });
  }
  // a long time on one file, and nothing committed on its project that day: maybe stuck
  for (const [p, f, , a] of d.files) {
    if (a < SIG.longFile) continue;
    if (!commits.some((c) => sameProject(p, c.repo))) out.push({ kind: "long_no_commit", day, project: p, file: f, minutes: Math.round(a / 60) });
  }
  for (const [t, p, f, n] of d.big) out.push({ kind: "big_insert", day, project: p, file: f, n, t });
  if (d.lineData && d.ai >= SIG.aiLines && d.ai + d.hu > 0) {
    const pct = Math.round((100 * d.ai) / (d.ai + d.hu));
    if (pct >= SIG.aiShare) out.push({ kind: "ai_share", day, n: d.ai, pct });
  }
  return out;
}

// --------------------------------------------------------------- the status bar
/** "1 h 20 min" (fr) / "1 hr 20 mins" (en), like WakaTime writes it. */
export function durText(sec: number, L: string): string {
  const m = Math.floor(sec / 60), h = Math.floor(m / 60), mm = m % 60;
  if (L === "fr") return h ? `${h} h ${String(mm).padStart(2, "0")}` : `${mm} min`;
  if (h) return `${h} hr${h > 1 ? "s" : ""} ${mm} min${mm === 1 ? "" : "s"}`;
  return `${mm} min${mm === 1 ? "" : "s"}`;
}
/** GET …/statusbar/today: the extension shows "<text> <name>, <text> <name>" when there are 2 categories, else grand_total.text. */
export function statusBar(active: number, write: number, L: string, note?: string) {
  const piece = (sec: number) => {
    const m = Math.floor(sec / 60);
    return { decimal: (sec / 3600).toFixed(2), digital: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`, hours: Math.floor(m / 60), minutes: m % 60, seconds: Math.floor(sec % 60), total_seconds: sec, text: durText(sec, L) };
  };
  const [na, nw] = L === "fr" ? ["actif", "écriture"] : ["active", "writing"];
  const text = note ?? `${durText(active, L)} ${na} · ${durText(write, L)} ${nw}`;
  const cats = note ? [] : [{ name: na, percent: 100, ...piece(active) }, { name: nw, percent: active ? Math.round((100 * write) / active) : 0, ...piece(write) }];
  return { cached_at: new Date().toISOString(), has_team_features: false, data: { grand_total: { ...piece(active), text }, categories: cats, dependencies: [], editors: [], languages: [], machines: [], operating_systems: [], projects: [] } };
}

// ------------------------------------------------------------- the setup
/** The bot URL wakatime-cli is pointed at. */
export const apiUrlOf = (publicUrl: string) => `${publicUrl.replace(/\/+$/, "")}/wakatime/api/v1`;
/** ~/.wakatime.cfg, the lines ClassBot needs (hide_project_folder: the full path never leaves the computer). */
export const cfgBlock = (apiUrl: string, key: string) => `[settings]\napi_url = ${apiUrl}\napi_key = ${key}\nhide_project_folder = true`;
/**
 * One PowerShell line: adds or replaces only these keys of [settings] in ~/.wakatime.cfg (a .bak copy first), keeps every
 * other line and section, reads and writes UTF-8 without BOM (what wakatime-cli reads).
 */
export function psLine(apiUrl: string, key: string): string {
  return String.raw`$f="$HOME\.wakatime.cfg";$s=[ordered]@{api_url='${apiUrl}';api_key='${key}';hide_project_folder='true'};$l=@();if(Test-Path $f){Copy-Item $f "$f.bak" -Force;$l=@([IO.File]::ReadAllLines($f))};if(-not($l|?{$_ -match '^\s*\[settings\]\s*$'})){$l=@('[settings]')+$l};$c='';$o=@(foreach($x in $l){if($x -match '^\s*\[(.+?)\]\s*$'){$c=$matches[1]};$k=($x -split '=',2)[0].Trim();if($c -eq 'settings' -and $s.Contains($k)){"$k = $($s[$k])";$s.Remove($k)}else{$x}});$i=[array]::IndexOf(@($o|%{$_.Trim()}),'[settings]');$o=@($o[0..$i])+@($s.Keys|%{"$_ = $($s[$_])"})+@(if($i+1 -lt $o.Count){$o[($i+1)..($o.Count-1)]});[IO.File]::WriteAllLines($f,[string[]]$o)`;
}
/** The same for macOS / Linux: one awk pass over a .bak copy; only these keys of [settings] change. */
export function shLine(apiUrl: string, key: string): string {
  return String.raw`f=~/.wakatime.cfg; touch "$f" && cp "$f" "$f.bak" && awk -v u='${apiUrl}' -v k='${key}' 'BEGIN{v["api_url"]=u;v["api_key"]=k;v["hide_project_folder"]="true"} function flush(){for(n in v) if(!(n in done)) print n" = "v[n]; fl=1} /^[[:space:]]*\[/{if(sec=="settings"&&!fl)flush(); sec=$0; gsub(/^[[:space:]]*\[|\][[:space:]]*$/,"",sec); print; if(sec=="settings") seen=1; next} {if(sec=="settings"){split($0,a,"="); n=a[1]; gsub(/^[[:space:]]+|[[:space:]]+$/,"",n); if(n in v){print n" = "v[n]; done[n]=1; next}} print} END{if(!seen){print "[settings]"} if(!fl) flush()}' "$f.bak" > "$f"`;
}
