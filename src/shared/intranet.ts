// The YouCode intranet (Laravel, its own server): requests signed server to server, never from the browser.
// Settings (Cloudflare, never in the database): INTRANET_URL and INTRANET_KEY_ID (vars), INTRANET_SECRET (secret,
// 32+ characters, the same as the intranet's CLASSBOT_SECRET).
//
// Each request is signed with HMAC-SHA256 over
//   "v1\n{unix time}\n{nonce}\n{METHOD}\n{path and query}\n{hex SHA-256 of the raw body}"
// and sent with X-Classbot-Key / -Timestamp / -Nonce / -Signature. The intranet refuses a wrong signature, a request
// more than 5 minutes off, a nonce it has already seen (replay) and a key it doesn't know
// (app/Http/Middleware/VerifyClassbotSignature.php on the intranet).
import type { Env } from "./types.ts";
import { all, now, one, run } from "./db.ts";

export class IntranetError extends Error {
  code: string; status: number;
  constructor(msg: string, code = "error", status = 0) { super(msg); this.code = code; this.status = status; }
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (text: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
async function hmac(secret: string, text: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}
/** The string both sides sign (the intranet builds the same one from the request it receives). */
export async function toSign(ts: number, nonce: string, method: string, pathAndQuery: string, body: string) {
  return ["v1", String(ts), nonce, method.toUpperCase(), pathAndQuery, await sha256(body)].join("\n");
}

/** What the dashboard may know: is it set, and where (never the secret). */
export function intranetSetup(env: Env) {
  const raw = String(env.INTRANET_URL || "").trim().replace(/\/+$/, "");
  let host = "", safe = false;
  try {
    const u = new URL(raw);
    host = u.host;
    // HTTPS only, except on this computer (tests with the intranet in Laragon)
    safe = u.protocol === "https:" || (u.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$|\.test$|\.localhost$/.test(u.hostname));
  } catch { /* not a URL */ }
  const secretOk = String(env.INTRANET_SECRET || "").length >= 32;
  return { url: raw, host, https: safe, keyId: String(env.INTRANET_KEY_ID || "").trim(), secretOk, ready: !!(host && safe && env.INTRANET_KEY_ID && secretOk) };
}

/** A signed request to the intranet's ClassBot API (path like "/api/classbot/ping"). */
export async function intranetFetch(env: Env, method: string, path: string, data?: unknown): Promise<any> {
  const s = intranetSetup(env);
  if (!s.host) throw new IntranetError("The intranet address isn't set (INTRANET_URL).", "not_configured");
  if (!s.https) throw new IntranetError("The intranet must be reached in HTTPS (http only for a test on this computer).", "not_https");
  if (!s.keyId || !s.secretOk) throw new IntranetError("The intranet key isn't set (INTRANET_KEY_ID, and the secret INTRANET_SECRET of 32+ characters).", "not_configured");
  const body = data === undefined ? "" : JSON.stringify(data);
  const ts = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const url = new URL(s.url + path);
  const sig = await hmac(String(env.INTRANET_SECRET), await toSign(ts, nonce, method, url.pathname + url.search, body));
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method, body: body || undefined, redirect: "manual", signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}),
        "X-Classbot-Key": s.keyId, "X-Classbot-Timestamp": String(ts), "X-Classbot-Nonce": nonce, "X-Classbot-Signature": sig },
    });
  } catch (e) {
    throw new IntranetError(`The intranet didn't answer (${(e as Error)?.name === "TimeoutError" ? "no answer in 15 s" : "unreachable"}): check its address and that it can be reached from Cloudflare.`, "unreachable");
  }
  const json: any = await res.json().catch(() => null);
  if (res.status >= 300 && res.status < 400) throw new IntranetError("The intranet answered with a redirect (often to its login page): check the address and that /api/classbot exists.", "redirect", res.status);
  if (!res.ok || !json?.success) {
    const why: Record<string, string> = {
      not_configured: "the intranet has no ClassBot key yet (CLASSBOT_KEY_ID, CLASSBOT_SECRET in its .env)",
      unknown_key: "the key id isn't the intranet's (INTRANET_KEY_ID ≠ CLASSBOT_KEY_ID)",
      bad_signature: "the secret isn't the same on both sides (INTRANET_SECRET ≠ CLASSBOT_SECRET)",
      expired: "the clocks differ by more than 5 minutes (check the server's time)",
      replay: "this request was already received",
      bad_headers: "the request headers are malformed",
    };
    const code = json?.code || (res.status === 404 ? "not_found" : "error");
    throw new IntranetError(why[code] ? `Refused: ${why[code]}.` : res.status === 404 ? "The intranet has no ClassBot API yet (/api/classbot)." : `The intranet answered ${res.status}.`, code, res.status);
  }
  return json;
}

/** "Test the connection": a signed ping, with how far the two clocks are apart. */
export async function intranetPing(env: Env) {
  const t0 = Math.floor(Date.now() / 1000);
  const r = await intranetFetch(env, "GET", "/api/classbot/ping");
  return { ok: true, skew: Number(r.server_time) ? Number(r.server_time) - t0 : null, classrooms: Array.isArray(r.classrooms) ? r.classrooms : [] };
}

// ------------------------------------------------------------ the class's intranet classroom and its learners
export interface Learner { id: number; first_name: string; last_name: string }
export const intranetClassrooms = async (env: Env) => (await intranetFetch(env, "GET", "/api/classbot/classrooms")).classrooms as { id: number; name: string; learners: number }[];
export const intranetLearners = async (env: Env, classroomId: number) => (await intranetFetch(env, "GET", `/api/classbot/classrooms/${Math.floor(classroomId)}/learners`)).learners as Learner[];

export function intranetClassOf(g: { intranet?: string | null } | null): { id: number; name: string } | null {
  try { const c = JSON.parse(g?.intranet || "{}")?.classroom; return c && Number(c.id) ? { id: Number(c.id), name: String(c.name || "") } : null; } catch { return null; }
}
export async function setIntranetClass(env: Env, guildId: string, c: { id: number; name: string } | null) {
  const cur = intranetClassOf(await one<{ intranet: string | null }>(env, "SELECT intranet FROM guilds WHERE id = ?", guildId));
  await run(env, "UPDATE guilds SET intranet = ? WHERE id = ?", c ? JSON.stringify({ classroom: { id: Math.floor(c.id), name: String(c.name || "").slice(0, 120) } }) : null, guildId);
  // another classroom: its learners are other people
  if (!c || cur?.id !== Math.floor(c.id)) await run(env, "DELETE FROM intranet_links WHERE guild_id = ?", guildId);
}

// "Hélène  BEN-ALI" → ["ben", "ali", "helene"]: no accents, no case, no punctuation, any order
export const nameTokens = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const keyOf = (t: string[]) => [...t].sort().join(" ");
// every word of a matches a word of b (a single letter matches a word that starts with it: "Mehdi R." ~ "Mehdi Rahmani")
const covers = (a: string[], b: string[]) => a.length > 0 && a.every((x) => b.some((y) => y === x || (x.length === 1 && y.startsWith(x)))) && a.some((x) => x.length > 1 && b.includes(x));

/** Each student of the bot against the intranet's learners: exact (same words), close (one learner fits), several, none. */
export function matchNames(players: { discord_id: string; name: string | null }[], learners: Learner[]) {
  const L = learners.map((l) => ({ l, t: nameTokens(`${l.first_name} ${l.last_name}`) }));
  const rows = players.map((p) => {
    const t = nameTokens(p.name || "");
    const exact = L.filter((x) => t.length && keyOf(x.t) === keyOf(t));
    const close = exact.length ? [] : L.filter((x) => covers(t, x.t) || covers(x.t, t));
    const cands = exact.length ? exact : close;
    return { discord_id: p.discord_id, name: p.name || p.discord_id, kind: (exact.length === 1 ? "exact" : close.length === 1 ? "close" : cands.length > 1 ? "several" : "none") as "exact" | "close" | "several" | "none",
      candidates: cands.map((x) => x.l.id) };
  });
  // a learner two students point to: nobody gets it automatically
  const taken = new Map<number, number>();
  for (const r of rows) if (r.kind === "exact" || r.kind === "close") taken.set(r.candidates[0], (taken.get(r.candidates[0]) || 0) + 1);
  for (const r of rows) if ((r.kind === "exact" || r.kind === "close") && (taken.get(r.candidates[0]) || 0) > 1) r.kind = "several";
  return rows;
}

const learnerName = (l: Learner | undefined) => (l ? `${l.first_name} ${l.last_name}`.trim() : "");

/** The matching screen: each student, the learner linked (or proposed), and the intranet's learners to choose from. */
export async function intranetMatchView(env: Env, guildId: string) {
  const g = await one<{ intranet: string | null }>(env, "SELECT intranet FROM guilds WHERE id = ?", guildId);
  const c = intranetClassOf(g);
  if (!c) throw new IntranetError("Choose the class's intranet classroom first.", "no_classroom");
  const learners = await intranetLearners(env, c.id);
  const players = await all<{ discord_id: string; name: string | null }>(env, "SELECT discord_id, name FROM players WHERE guild_id = ? ORDER BY name COLLATE NOCASE", guildId);
  const links = new Map((await all<{ discord_id: string; learner_id: number; by: string | null }>(env, "SELECT discord_id, learner_id, by FROM intranet_links WHERE guild_id = ?", guildId)).map((x) => [x.discord_id, x]));
  const byId = new Map(learners.map((l) => [l.id, l]));
  const rows = matchNames(players, learners).map((r) => {
    const ln = links.get(r.discord_id);
    return { ...r, linked: ln && byId.has(ln.learner_id) ? { id: ln.learner_id, by: ln.by || "you", name: learnerName(byId.get(ln.learner_id)) } : null };
  });
  const used = new Set(rows.filter((r) => r.linked).map((r) => r.linked!.id));
  return {
    classroom: c, rows,
    learners: learners.map((l) => ({ id: l.id, name: learnerName(l) })).sort((a, b) => a.name.localeCompare(b.name)),
    free: learners.filter((l) => !used.has(l.id)).map((l) => ({ id: l.id, name: learnerName(l) })),
  };
}

/** Link every student whose name fits one learner only (exact, or close: to check); those already linked stay. */
export async function intranetAutoLink(env: Env, guildId: string) {
  const v = await intranetMatchView(env, guildId);
  const used = new Set(v.rows.filter((r) => r.linked).map((r) => r.linked!.id));
  const names = new Map(v.learners.map((l) => [l.id, l.name]));
  let n = 0;
  for (const r of v.rows) {
    if (r.linked || (r.kind !== "exact" && r.kind !== "close") || used.has(r.candidates[0])) continue;
    used.add(r.candidates[0]);
    await run(env, "INSERT OR REPLACE INTO intranet_links (guild_id, discord_id, learner_id, learner_name, by, at) VALUES (?, ?, ?, ?, ?, ?)", guildId, r.discord_id, r.candidates[0], names.get(r.candidates[0]) || null, r.kind, now());
    n++;
  }
  return n;
}

/** The teacher's choice for one student (null: not linked); a learner linked to someone else moves to this student. */
export async function setIntranetLink(env: Env, guildId: string, discordId: string, learnerId: number | null, learnerName: string | null) {
  if (!learnerId) { await run(env, "DELETE FROM intranet_links WHERE guild_id = ? AND discord_id = ?", guildId, discordId); return; }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM intranet_links WHERE guild_id = ? AND learner_id = ? AND discord_id != ?").bind(guildId, Math.floor(learnerId), discordId),
    env.DB.prepare("INSERT OR REPLACE INTO intranet_links (guild_id, discord_id, learner_id, learner_name, by, at) VALUES (?, ?, ?, ?, 'you', ?)").bind(guildId, discordId, Math.floor(learnerId), learnerName ? String(learnerName).slice(0, 120) : null, now()),
  ]);
}
