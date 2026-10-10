// Anti-cheat helpers: settings, signed editor links, what the editor recorded
// (pastes, leaving the page, how the code appeared) and code similarity.
//
// Honest limits: a bot can't control a student's computer. This makes AI use
// slower and VISIBLE to the teacher (flags, replay); it doesn't make it impossible.
import type { Env, GuildRow } from "./types.ts";

export interface IntegritySettings {
  editor: "required" | "optional" | "off";   // write-code answers go through the editor page
  explain: boolean;                           // "explain your code" after an accepted solution
  similarity: boolean;                        // compare submissions between students
  codeImage: boolean;                         // show quick-challenge code as an image
  quickLimit: number;                         // seconds to answer a quick challenge (0 = no limit)
  practiceWeight: number;                     // points multiplier for /practice (e.g. 0.5)
}
export const DEFAULT_INTEGRITY: IntegritySettings = {
  editor: "required", explain: true, similarity: true, codeImage: true, quickLimit: 0, practiceWeight: 1,
};

export function integrityOf(g: { integrity?: string | null } | null | undefined): IntegritySettings {
  let o: any = {};
  try { o = g?.integrity ? JSON.parse(g.integrity) : {}; } catch { o = {}; }
  const d = DEFAULT_INTEGRITY;
  const n = (v: unknown, def: number, min: number, max: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def; };
  return {
    editor: ["required", "optional", "off"].includes(o.editor) ? o.editor : d.editor,
    explain: o.explain === undefined ? d.explain : !!o.explain,
    similarity: o.similarity === undefined ? d.similarity : !!o.similarity,
    codeImage: o.codeImage === undefined ? d.codeImage : !!o.codeImage,
    quickLimit: Math.round(n(o.quickLimit, d.quickLimit, 0, 3600)),
    practiceWeight: n(o.practiceWeight, d.practiceWeight, 0, 2),
  };
}

// ------------------------------------------------------------- editor links
const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(env: Env, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode("classbot-editor:" + (env.DISCORD_TOKEN || env.DISCORD_PUBLIC_KEY)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)))).slice(0, 32);
}

/** Sign any short text with the bot's secret (32 url-safe characters). */
export const signText = (env: Env, msg: string) => hmac(env, "sig:" + msg);

/** A private link to the code editor for one attempt (valid 12 hours). */
export async function editorToken(env: Env, attemptId: number, userId: string, hours = 12): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + hours * 3600;
  const body = `${attemptId}.${userId}.${exp}`;
  return `${body}.${await hmac(env, body)}`;
}
export async function readEditorToken(env: Env, token: string): Promise<{ attemptId: number; userId: string } | null> {
  const m = token.match(/^(\d+)\.(\d+)\.(\d+)\.([A-Za-z0-9_-]{32})$/);
  if (!m) return null;
  if (Number(m[3]) < Date.now() / 1000) return null;
  const want = await hmac(env, `${m[1]}.${m[2]}.${m[3]}`);
  if (want.length !== m[4].length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ m[4].charCodeAt(i);
  return diff ? null : { attemptId: Number(m[1]), userId: m[2] };
}
export function editorUrl(env: Env, token: string): string {
  return `${(env.PUBLIC_URL || "").replace(/\/$/, "")}/code/${token}`;
}

// ---------------------------------------------------------- editor telemetry
/**
 * What the editor page sends: changes [t(ms), from, removedLength, insertedText, origin],
 * focus changes [t, "blur" | "focus"], blocked pastes, total time on the page.
 */
export interface EditorLog {
  changes: [number, number, number, string, string][];
  focus: [number, "blur" | "focus"][];
  pastes: number;
  openMs: number;
  lang?: string;
}

export interface IntegrityReport {
  flags: string[];               // human-readable, shown to the teacher
  level: 0 | 1 | 2;              // 0 ok · 1 worth a look · 2 suspicious
  stats: { typedChars: number; deletedChars: number; bigInserts: number; awayCount: number; awaySec: number; activeSec: number; pastes: number; finalChars: number };
  similar?: { attemptId: number; discordId: string; name?: string | null; score: number }[];
  editor: boolean;               // false = submitted without the editor page
}

/** Turn the raw editor log into flags. `starterLen` = characters of the template the editor started with. */
export function analyzeLog(log: EditorLog | null, finalCode: string, starterLen = 0): IntegrityReport {
  const flags: string[] = [];
  const stats = { typedChars: 0, deletedChars: 0, bigInserts: 0, awayCount: 0, awaySec: 0, activeSec: 0, pastes: 0, finalChars: finalCode.length };
  if (!log || !Array.isArray(log.changes)) {
    return { flags: ["Submitted without the code editor (no typing record)"], level: 1, stats, editor: false };
  }
  stats.pastes = Math.max(0, Number(log.pastes) || 0);
  let lastT = 0, active = 0;
  for (const ch of log.changes.slice(0, 50000)) {
    const [t, , removed, text, origin] = ch;
    if (origin === "setValue" || origin === "template") continue;   // template / language switch
    const ins = String(text ?? "").length;
    stats.typedChars += ins;
    stats.deletedChars += Math.max(0, Number(removed) || 0);
    if (ins >= 40 && origin !== "undo" && origin !== "redo") stats.bigInserts++;
    if (t - lastT < 15000) active += t - lastT;    // pauses over 15 s don't count as typing time
    lastT = t;
  }
  stats.activeSec = Math.round(active / 1000);
  let blurAt = -1;
  for (const [t, kind] of (log.focus ?? []).slice(0, 5000)) {
    if (kind === "blur" && blurAt < 0) { blurAt = t; stats.awayCount++; }
    if (kind === "focus" && blurAt >= 0) { stats.awaySec += Math.round((t - blurAt) / 1000); blurAt = -1; }
  }
  if (blurAt >= 0) stats.awaySec += Math.round(Math.max(0, (Number(log.openMs) || 0) - blurAt) / 1000);

  const written = Math.max(0, finalCode.length - starterLen);
  let score = 0;
  if (stats.pastes >= 1) { flags.push(`Tried to paste ${stats.pastes} time${stats.pastes > 1 ? "s" : ""} (blocked)`); score += stats.pastes >= 3 ? 2 : 1; }
  if (stats.bigInserts) { flags.push(`${stats.bigInserts} block${stats.bigInserts > 1 ? "s" : ""} of 40+ characters appeared at once`); score += 2; }
  if (stats.awayCount >= 3 || stats.awaySec >= 120) {
    flags.push(`Left the editor ${stats.awayCount} time${stats.awayCount > 1 ? "s" : ""} (${fmt(stats.awaySec)} away)`);
    score += stats.awaySec >= 300 || stats.awayCount >= 8 ? 2 : 1;
  }
  if (written >= 250 && stats.deletedChars < written * 0.02) { flags.push("Typed the whole solution with almost no corrections"); score += 1; }
  if (written >= 300 && stats.activeSec > 0 && written / stats.activeSec > 7) { flags.push(`Very fast typing (${Math.round(written / stats.activeSec)} characters per second)`); score += 1; }
  if (written >= 200 && stats.typedChars < written * 0.6) { flags.push("Most of the code wasn't typed in the editor"); score += 2; }
  return { flags, level: score >= 3 ? 2 : score >= 1 ? 1 : 0, stats, editor: true };
}
const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ""}`.trim() : `${s} s`);

// -------------------------------------------------------------- similarity
const KEYWORDS = new Set(("if else elif for while do return function def class const let var new break continue switch case default try catch finally " +
  "throw import from in of and or not true false null none undefined echo print console log len range int long string char void static public " +
  "private include using namespace std vector map set list dict array foreach as fn this self").split(" "));

/** Normalized token k-grams of a program, as a compact string of hashes. */
export function fingerprint(code: string): string {
  const src = code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/(^|\s)#[^\n]*/g, " ")
    .replace(/("([^"\\\n]|\\.)*"|'([^'\\\n]|\\.)*'|`[^`]*`)/g, " S ");
  const toks = src.match(/[A-Za-z_$][A-Za-z0-9_$]*|\d+(\.\d+)?|==|!=|<=|>=|&&|\|\||\+\+|--|[+\-*/%<>=!&|^~?:;,.(){}[\]]/g) ?? [];
  const norm = toks.map((t) => (/^\d/.test(t) ? "N" : /^[A-Za-z_$]/.test(t) ? (KEYWORDS.has(t.replace(/^\$/, "").toLowerCase()) ? t.toLowerCase() : "V") : t));
  const K = 6;
  const hashes = new Set<number>();
  for (let i = 0; i + K <= norm.length; i++) {
    let h = 2166136261;
    for (let k = i; k < i + K; k++) for (const c of norm[k]) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    hashes.add((h >>> 0) % 1000003);
  }
  return [...hashes].sort((a, b) => a - b).map((x) => x.toString(36)).join(",");
}

export function similarity(a: string, b: string): { score: number; size: number } {
  if (!a || !b) return { score: 0, size: 0 };
  const A = new Set(a.split(",")), B = b.split(",");
  let inter = 0;
  for (const x of B) if (A.has(x)) inter++;
  const union = A.size + B.length - inter;
  return { score: union ? inter / union : 0, size: Math.min(A.size, B.length) };
}

/** Points for practice can count less than supervised work (teacher setting). */
export const practiceWeight = (g: GuildRow) => integrityOf(g).practiceWeight;
