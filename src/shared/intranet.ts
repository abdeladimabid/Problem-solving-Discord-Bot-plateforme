// The YouCode intranet (Laravel, its own server): requests signed server to server, never from the browser.
// Nothing to set on the intranet, nothing in Cloudflare: the trainer types the intranet's address and connects once
// with their intranet email and password (Settings → Intranet YouCode). The intranet gives this ClassBot
//   - a token for ClassBot only: it says which trainer (their own classrooms; what's created is written as theirs);
//   - a signing secret for that token: every request is signed with HMAC-SHA256 over
//     "v1\n{unix time}\n{nonce}\n{METHOD}\n{path and query}\n{hex SHA-256 of the raw body}"
//     and sent with X-Classbot-Timestamp / -Nonce / -Signature and the token. The intranet refuses a wrong signature,
//     a request more than 5 minutes off, a nonce it has already seen (replay), and anything without a ClassBot token
//     (app/Http/Middleware/VerifyClassbotSignature.php on the intranet).
// Both are kept encrypted here; the password is never kept.
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

/** The intranet's address: HTTPS (http only on this computer, for tests). */
export function checkUrl(raw: unknown) {
  const url = String(raw ?? "").trim().replace(/\/+$/, "");
  let host = "", safe = false;
  try {
    const u = new URL(url);
    host = u.host;
    safe = u.protocol === "https:" || (u.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$|\.test$|\.localhost$/.test(u.hostname));
  } catch { /* not a URL */ }
  return { url, host, https: safe, ok: !!(host && safe) };
}

// ------------------------------------------------------------ the class's state: address, trainer, classroom
// guilds.intranet = {"url": "https://…", "classroom": {id, name},
//                    "auth": {"tok": <encrypted>, "sig": <encrypted>, "trainer": {id, name, classrooms}, "at": …}}
// The token and its signing secret are encrypted with a key made from this ClassBot's own Cloudflare secret
// (DISCORD_TOKEN): the database alone can't use them.
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function sealKey(env: Env) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`classbot-intranet|${env.DISCORD_TOKEN || ""}`));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function seal(env: Env, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await sealKey(env), new TextEncoder().encode(text)));
  return `${b64(iv)}.${b64(ct)}`;
}
async function unseal(env: Env, sealed: unknown): Promise<string | null> {
  try {
    const [iv, ct] = String(sealed || "").split(".");
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await sealKey(env), unb64(ct)));
  } catch { return null; }
}
async function stateOf(env: Env, guildId: string): Promise<any> {
  const r = await one<{ intranet: string | null }>(env, "SELECT intranet FROM guilds WHERE id = ?", guildId);
  try { return JSON.parse(r?.intranet || "{}") || {}; } catch { return {}; }
}
async function saveState(env: Env, guildId: string, st: any) {
  await run(env, "UPDATE guilds SET intranet = ? WHERE id = ?", Object.keys(st).length ? JSON.stringify(st) : null, guildId);
}

/** What the dashboard may know: the address and the trainer connected (never the token). */
export async function intranetSetup(env: Env, guildId: string) {
  const st = await stateOf(env, guildId);
  const u = checkUrl(st.url || env.INTRANET_URL || "");
  return { url: u.url, host: u.host, https: u.https, ready: u.ok, trainer: st.auth?.tok && st.auth.trainer ? { ...st.auth.trainer, at: st.auth.at || 0 } : null };
}
export async function intranetTrainer(env: Env, guildId: string) {
  return (await intranetSetup(env, guildId)).trainer;
}

/** The trainer connects this class's ClassBot: the intranet's address, their intranet email and password (sent once, never kept). */
export async function intranetLogin(env: Env, guildId: string, url: string, email: string, password: string) {
  const u = checkUrl(url);
  if (!u.host) throw new IntranetError("Write the intranet's address (https://…).", "no_url");
  if (!u.https) throw new IntranetError("The intranet must be reached in HTTPS (http only for a test on this computer).", "not_https");
  email = String(email || "").trim().slice(0, 200);
  if (!email || !password) throw new IntranetError("Write your intranet email and password.", "empty");
  const r = await send(u.url, "POST", "/api/classbot/login", JSON.stringify({ email, password: String(password).slice(0, 200) }), null);
  if (!r.token || String(r.signing_secret || "").length < 32) throw new IntranetError("The intranet didn't give a ClassBot token: is its ClassBot API up to date?", "no_token");
  const st = await stateOf(env, guildId);
  const trainer = { id: Number(r.trainer?.id) || 0, name: String(r.trainer?.name || email).slice(0, 120), classrooms: Number(r.trainer?.classrooms) || 0 };
  // another trainer or another intranet: the classroom and the students' links were theirs
  if ((st.auth?.trainer?.id && st.auth.trainer.id !== trainer.id) || (st.url && st.url !== u.url)) { delete st.classroom; await run(env, "DELETE FROM intranet_links WHERE guild_id = ?", guildId); }
  st.url = u.url;
  st.auth = { tok: await seal(env, String(r.token)), sig: await seal(env, String(r.signing_secret)), trainer, at: now() };
  await saveState(env, guildId, st);
  return trainer;
}
/** Disconnect: the intranet forgets the token, and so does ClassBot. */
export async function intranetLogout(env: Env, guildId: string) {
  const st = await stateOf(env, guildId);
  if (st.auth?.tok) await intranetFetch(env, "POST", "/api/classbot/logout", {}, guildId).catch(() => null);
  delete st.auth;
  await saveState(env, guildId, st);
}

/** A request to the intranet's ClassBot API (path like "/api/classbot/ping"), as the trainer this class is connected as. */
export async function intranetFetch(env: Env, method: string, path: string, data: unknown, guildId: string): Promise<any> {
  const st = await stateOf(env, guildId);
  const u = checkUrl(st.url || env.INTRANET_URL || "");
  const token = await unseal(env, st.auth?.tok), secret = await unseal(env, st.auth?.sig);
  if (!token || !secret) throw new IntranetError("Connect your intranet account first (Settings → Intranet YouCode).", "no_trainer");
  if (!u.ok) throw new IntranetError("The intranet's address isn't valid: connect again in Settings → Intranet YouCode.", "no_url");
  return send(u.url, method, path, data === undefined ? "" : JSON.stringify(data), { token, secret });
}

async function send(base: string, method: string, path: string, body: string, auth: { token: string; secret: string } | null): Promise<any> {
  const url = new URL(base + path);
  const headers: Record<string, string> = { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) };
  if (auth) {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomUUID().replace(/-/g, "");
    Object.assign(headers, { Authorization: `Bearer ${auth.token}`, "X-Classbot-Timestamp": String(ts), "X-Classbot-Nonce": nonce,
      "X-Classbot-Signature": await hmac(auth.secret, await toSign(ts, nonce, method, url.pathname + url.search, body)) });
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), { method, body: body || undefined, redirect: "manual", signal: AbortSignal.timeout(15000), headers });
  } catch (e) {
    throw new IntranetError(`The intranet didn't answer (${(e as Error)?.name === "TimeoutError" ? "no answer in 15 s" : "unreachable"}): check its address and that it can be reached from Cloudflare.`, "unreachable");
  }
  const json: any = await res.json().catch(() => null);
  if (res.status >= 300 && res.status < 400) throw new IntranetError("The intranet answered with a redirect (often to its login page): check the address and that /api/classbot exists.", "redirect", res.status);
  if (!res.ok || !json?.success) {
    const why: Record<string, string> = {
      expired: "the clocks differ by more than 5 minutes (check the server's time)",
      replay: "this request was already received",
      bad_headers: "the request headers are malformed",
      bad_signature: "the signature isn't right: connect again in Settings → Intranet YouCode",
      no_trainer: "your intranet login is no longer valid (disconnected, or your password changed): connect again in Settings → Intranet YouCode",
    };
    const code = json?.code || (res.status === 404 ? "not_found" : res.status === 429 ? "too_many" : "error");
    if (code === "too_many") throw new IntranetError("Too many tries: wait a minute and try again.", code, res.status);
    // the intranet's own explanation (in French) for what it refuses
    if (!why[code] && json?.message && code !== "not_found") throw new IntranetError(`The intranet refused: ${String(json.message).slice(0, 300)}`, code, res.status);
    throw new IntranetError(why[code] ? `Refused: ${why[code]}.` : res.status === 404 ? "The intranet has no ClassBot API yet (/api/classbot)." : `The intranet answered ${res.status}.`, code, res.status);
  }
  return json;
}

/** "Test the connection": a signed ping as the trainer, with how far the two clocks are apart. */
export async function intranetPing(env: Env, guildId: string) {
  const t0 = Math.floor(Date.now() / 1000);
  const r = await intranetFetch(env, "GET", "/api/classbot/ping", undefined, guildId);
  return { ok: true, skew: Number(r.server_time) ? Number(r.server_time) - t0 : null, trainer: r.trainer || null, classrooms: Array.isArray(r.classrooms) ? r.classrooms : [] };
}

// ------------------------------------------------------------ the class's intranet classroom and its learners
export interface Learner { id: number; first_name: string; last_name: string }
export const intranetClassrooms = async (env: Env, guildId: string) => (await intranetFetch(env, "GET", "/api/classbot/classrooms", undefined, guildId)).classrooms as { id: number; name: string; learners: number }[];
export const intranetLearners = async (env: Env, guildId: string, classroomId: number) => (await intranetFetch(env, "GET", `/api/classbot/classrooms/${Math.floor(classroomId)}/learners`, undefined, guildId)).learners as Learner[];

export function intranetClassOf(g: { intranet?: string | null } | null): { id: number; name: string } | null {
  try { const c = JSON.parse(g?.intranet || "{}")?.classroom; return c && Number(c.id) ? { id: Number(c.id), name: String(c.name || "") } : null; } catch { return null; }
}
export async function setIntranetClass(env: Env, guildId: string, c: { id: number; name: string } | null) {
  const st = await stateOf(env, guildId);
  const cur = intranetClassOf({ intranet: JSON.stringify(st) });
  if (c) st.classroom = { id: Math.floor(c.id), name: String(c.name || "").slice(0, 120) }; else delete st.classroom;
  await saveState(env, guildId, st);
  // another classroom: its learners are other people
  if (!c || cur?.id !== Math.floor(c.id)) await run(env, "DELETE FROM intranet_links WHERE guild_id = ?", guildId);
}

// "Hélène  BEN-ALI" → ["ben", "ali", "helene"]: no accents, no case, no punctuation, any order
export const nameTokens = (s: string) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
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
  const learners = await intranetLearners(env, guildId, c.id);
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

// ------------------------------------------------------------ squads → the intranet's group distribution
const parseJson = (s: string | null | undefined, d: any) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

/** What sending these squads would do: each squad with each student's intranet learner, and who has none yet. */
export async function squadsPreview(env: Env, guildId: string, setId: number) {
  const set = await one<{ id: number; name: string; squads: string }>(env, "SELECT id, name, squads FROM squad_sets WHERE id = ? AND guild_id = ?", setId, guildId);
  if (!set) throw new IntranetError("These squads don't exist any more.", "not_found");
  const c = intranetClassOf(await one<{ intranet: string | null }>(env, "SELECT intranet FROM guilds WHERE id = ?", guildId));
  const links = new Map((await all<{ discord_id: string; learner_id: number; learner_name: string | null }>(env, "SELECT discord_id, learner_id, learner_name FROM intranet_links WHERE guild_id = ?", guildId)).map((x) => [x.discord_id, x]));
  const names = new Map((await all<{ discord_id: string; name: string | null }>(env, "SELECT discord_id, name FROM players WHERE guild_id = ?", guildId)).map((x) => [x.discord_id, x.name || x.discord_id]));
  const groups = (parseJson(set.squads, []) as { id: string; name: string; members: string[] }[]).filter((s) => s.members?.length).map((s) => ({
    key: String(s.id), name: String(s.name || "Squad").slice(0, 255),
    members: s.members.map((m) => { const l = links.get(String(m)); return { id: String(m), name: names.get(String(m)) || String(m), learner: l ? { id: l.learner_id, name: l.learner_name || "" } : null }; }),
  }));
  const sync = await one<{ remote_id: number | null; at: number | null }>(env, "SELECT remote_id, at FROM intranet_sync WHERE guild_id = ? AND kind = 'squads' AND local_id = ?", guildId, setId);
  return { set: { id: set.id, name: set.name }, classroom: c, groups, missing: groups.flatMap((g) => g.members.filter((m) => !m.learner).map((m) => m.name)), sent: sync?.at ? { at: sync.at, distribution_id: sync.remote_id } : null };
}

/** Send the squads (all or nothing): the first time a new group distribution, then the same one updated in place. */
export async function sendSquads(env: Env, guildId: string, setId: number) {
  const p = await squadsPreview(env, guildId, setId);
  if (!p.classroom) throw new IntranetError("Choose the class's intranet classroom first (Settings → Intranet YouCode).", "no_classroom");
  if (!p.groups.length) throw new IntranetError("These squads have nobody in them yet.", "empty");
  if (p.missing.length) throw new IntranetError(`Not linked to an intranet learner yet: ${p.missing.join(", ")}. Link them in Settings → Intranet YouCode.`, "missing");
  const sync = await one<{ remote_id: number | null; map: string | null }>(env, "SELECT remote_id, map FROM intranet_sync WHERE guild_id = ? AND kind = 'squads' AND local_id = ?", guildId, setId);
  const map = parseJson(sync?.map, {}) as Record<string, number>;
  const r = await intranetFetch(env, "POST", `/api/classbot/classrooms/${p.classroom.id}/squads`, {
    ref: `${guildId}:squads:${setId}`, name: p.set.name, distribution_id: sync?.remote_id ?? null,
    groups: p.groups.map((g) => ({ key: g.key, name: g.name, group_id: map[g.key] ?? null, learner_ids: g.members.map((m) => m.learner!.id) })),
  }, guildId);
  await run(env, `INSERT INTO intranet_sync (guild_id, kind, local_id, remote_id, map, at) VALUES (?, 'squads', ?, ?, ?, ?)
    ON CONFLICT (guild_id, kind, local_id) DO UPDATE SET remote_id = excluded.remote_id, map = excluded.map, at = excluded.at`, guildId, setId, Number(r.distribution_id) || null, JSON.stringify(r.groups || {}), now());
  return { distribution_id: Number(r.distribution_id), groups: Object.keys(r.groups || {}).length, learners: Number(r.learners) || 0, kept: Number(r.kept) || 0, again: !!sync?.remote_id };
}

// ------------------------------------------------------------ veilles and live codings → the intranet's activities
// The school's times (Moroccan time, as the intranet keeps them): veille 09:15 for 30 min, live coding 11:00 for 45 min.
/** "2026-10-22 14:00" (a date and time chosen by the teacher). */
const WHEN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
export const ACT_TIME: Record<string, { at: string; minutes: number }> = { veille: { at: "09:15", minutes: 30 }, live: { at: "11:00", minutes: 45 } };

export interface OnIntranet { activity_id: number; subject: string; datetime: string; duration: number; by: string; by_id: number; created: string; learner_ids?: number[] }
/** The veilles and live codings already on the intranet for the class over a range (anyone's), by "kind|YYYY-MM-DD HH:MM". */
async function onIntranet(env: Env, guildId: string, classroomId: number, from: string, to: string): Promise<Map<string, OnIntranet>> {
  const r = await intranetFetch(env, "GET", `/api/classbot/classrooms/${classroomId}/activities?from=${from}&to=${to}`, undefined, guildId);
  return new Map((r.activities || []).map((a: OnIntranet & { type: string }) => [`${a.type}|${a.datetime}`, a]));
}
/** The same subject, whatever the accents, capitals, spaces and punctuation. */
export const sameSubject = (a: string, b: string) => {
  const k = (x: string) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return !!k(a) && k(a) === k(b);
};
/** "Already on the intranet: « … », created by X on 16/10/2026" */
export const alreadyText = (e: OnIntranet) => `already on the intranet: « ${e.subject} », created by ${e.by} on ${e.created}`;

/**
 * The veilles and live codings of a range, each with its presenters' intranet learners and what the intranet already
 * has at that time in the class (whoever made it: never sent twice).
 */
export async function activitiesPreview(env: Env, guildId: string, from: string, to: string) {
  const c = intranetClassOf(await one<{ intranet: string | null }>(env, "SELECT intranet FROM guilds WHERE id = ?", guildId));
  const acts = await all<{ id: number; day: string; kind: string; title: string | null }>(env,
    "SELECT id, day, kind, title FROM activities WHERE guild_id = ? AND kind IN ('veille', 'live') AND day >= ? AND day <= ? ORDER BY day, kind DESC LIMIT 60", guildId, from, to);
  const claims = acts.length ? await all<{ activity_id: number; members: string }>(env,
    `SELECT activity_id, members FROM activity_claims WHERE guild_id = ? AND status IN ('approved', 'done') AND activity_id IN (${acts.map(() => "?").join(",")}) ORDER BY id`, guildId, ...acts.map((a) => a.id)) : [];
  const presenters = new Map(claims.map((x) => [x.activity_id, (parseJson(x.members, []) as unknown[]).map(String)]));
  const links = new Map((await all<{ discord_id: string; learner_id: number; learner_name: string | null }>(env, "SELECT discord_id, learner_id, learner_name FROM intranet_links WHERE guild_id = ?", guildId)).map((x) => [x.discord_id, x]));
  const names = new Map((await all<{ discord_id: string; name: string | null }>(env, "SELECT discord_id, name FROM players WHERE guild_id = ?", guildId)).map((x) => [x.discord_id, x.name || x.discord_id]));
  const sent = new Map((await all<{ local_id: number; remote_id: number | null; map: string | null; at: number | null }>(env, "SELECT local_id, remote_id, map, at FROM intranet_sync WHERE guild_id = ? AND kind = 'activity'", guildId)).map((x) => [x.local_id, x]));
  // sent at another date than its slot (the slot had another activity): where it is on the intranet
  const movedTo = (id: number) => { const m = parseJson(sent.get(id)?.map ?? null, null) as { at?: string } | null; return m && typeof m.at === "string" && WHEN.test(m.at) ? m.at : null; };
  const days = [...acts.map((a) => a.day), ...acts.map((a) => movedTo(a.id)?.slice(0, 10)).filter(Boolean) as string[]].sort();
  const lib = await libraryOf(env, guildId, acts);
  const me = (await intranetTrainer(env, guildId))?.name || "";
  let existing = new Map<string, OnIntranet>(), checkError: string | null = null;
  if (c && days.length) {
    try { existing = await onIntranet(env, guildId, c.id, days[0], days[days.length - 1]); } catch (e) { checkError = (e as Error).message; }
  }
  return {
    classroom: c, checkError,
    items: acts.map((a) => {
      const members = (presenters.get(a.id) || []).map((m) => { const l = links.get(m); return { id: m, name: names.get(m) || m, learner: l ? { id: l.learner_id, name: l.learner_name || "" } : null }; });
      const s = sent.get(a.id);
      const moved = movedTo(a.id);
      const ex = existing.get(`${a.kind}|${moved || `${a.day} ${ACT_TIME[a.kind].at}`}`) || null;
      return { id: a.id, day: a.day, kind: a.kind, title: a.title || (a.kind === "live" ? "Live coding" : "Veille"), at: ACT_TIME[a.kind].at, minutes: ACT_TIME[a.kind].minutes, moved,
        members, missing: members.filter((m) => !m.learner).map((m) => m.name), sent: s?.at ? { at: s.at, activity_id: s.remote_id } : null,
        author: (() => { const au = lib.get(`${a.day}:${a.kind}`)?.author; return au && au.toLowerCase() !== me.toLowerCase() ? au : null; })(),
        existing: ex ? { ...ex, text: alreadyText(ex), mine: !!s?.remote_id && s.remote_id === ex.activity_id,
          // the same activity (sent by ClassBot, or the same subject), or another one made at that time on the intranet
          same: (!!s?.remote_id && s.remote_id === ex.activity_id) || sameSubject(ex.subject, a.title || "") } : null,
        // already on the intranet: its presenters from ClassBot not assigned there yet (only added, nothing else changes)
        assign: ex && ((!!s?.remote_id && s.remote_id === ex.activity_id) || sameSubject(ex.subject, a.title || "")) ? members.filter((m) => m.learner && !(ex.learner_ids || []).includes(m.learner.id)).map((m) => ({ id: m.learner!.id, name: m.learner!.name || m.name })) : [] };
    }),
  };
}

/**
 * Where an activity comes from in the shared library (the same for every class of that library) and who made it:
 * sent to the intranet, a second class's copy is a reused copy of the first one, and the author is credited.
 */
async function libraryOf(env: Env, guildId: string, rows: { day: string; kind: string }[]) {
  const cfg = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", `lib:${guildId}`);
  const team = (parseJson(cfg?.v, {})?.link || "").match(/\/library\/([a-f0-9]{12})\./)?.[1];
  if (!team || !rows.length) return new Map<string, { key: string; author: string | null }>();
  const keys = rows.map((r) => `${r.day}:${r.kind}`);
  const cache = await all<{ key: string; author: string | null }>(env, `SELECT key, author FROM library_cache WHERE guild_id = ? AND kind = 'activity' AND deleted = 0 AND key IN (${keys.map(() => "?").join(",")})`, guildId, ...keys);
  return new Map(cache.map((c) => [c.key, { key: `${team}:${c.key}`, author: c.author }]));
}

/** Send the chosen activities (each on its own: one refused doesn't stop the others); what the intranet already has is skipped. */
export async function sendActivities(env: Env, guildId: string, ids: number[], when: Record<string, unknown> = {}) {
  const want = [...new Set(ids.map((x) => Math.floor(Number(x))).filter((x) => x > 0))].slice(0, 20);
  if (!want.length) throw new IntranetError("Choose the activities to send.", "empty");
  const c = intranetClassOf(await one<{ intranet: string | null }>(env, "SELECT intranet FROM guilds WHERE id = ?", guildId));
  if (!c) throw new IntranetError("Choose the class's intranet classroom first (Settings → Intranet YouCode).", "no_classroom");
  const rows = await all<{ id: number; day: string; kind: string; title: string | null; md: string }>(env,
    `SELECT id, day, kind, title, md FROM activities WHERE guild_id = ? AND kind IN ('veille', 'live') AND id IN (${want.map(() => "?").join(",")})`, guildId, ...want);
  if (!rows.length) throw new IntranetError("These activities don't exist any more.", "empty");
  const days = rows.map((a) => a.day).sort();
  // checked again now: someone may have made one on the intranet since the preview
  const view = await activitiesPreview(env, guildId, days[0], days[days.length - 1]);
  if (view.checkError) throw new IntranetError(`Couldn't check what's already on the intranet: ${view.checkError}`, "check");
  const info = new Map(view.items.map((x) => [x.id, x]));
  const results: Record<number, { ok: boolean; message?: string; existing?: boolean; reused?: string; assigned?: number }> = {};
  const items: any[] = [];
  const lib = await libraryOf(env, guildId, rows);
  for (const a of rows) {
    const v = info.get(a.id)!;
    if (v.missing.length) { results[a.id] = { ok: false, message: `not linked to an intranet learner: ${v.missing.join(", ")}` }; continue; }
    // its slot has another activity on the intranet: sent at the date the teacher chose, else not sent
    const other = !!v.existing && !v.existing.same;
    const at = other ? String(when?.[a.id] ?? "").replace("T", " ").slice(0, 16) : "";
    if (other && !WHEN.test(at)) { results[a.id] = { ok: false, existing: true, message: `you already have a ${a.kind === "live" ? "live coding" : "veille"} at this date on the intranet: « ${v.existing!.subject} », created by ${v.existing!.by} on ${v.existing!.created}. Choose another date.` }; continue; }
    if (!other && v.existing && v.assign.length) {
      // already there: only its presenters are added
      try {
        const r = await intranetFetch(env, "POST", `/api/classbot/classrooms/${c.id}/activities/${v.existing.activity_id}/learners`, { learner_ids: v.assign.map((m) => m.id) }, guildId);
        results[a.id] = { ok: true, assigned: Number(r.added) || 0 };
      } catch (e) { results[a.id] = { ok: false, message: String((e as Error).message).slice(0, 200) }; }
      continue;
    }
    if (!other && v.existing) { results[a.id] = { ok: false, existing: true, message: v.existing.text }; continue; }
    const l = lib.get(`${a.day}:${a.kind}`);
    items.push({ ref: `${guildId}:activity:${a.id}`, activity_id: null, type: a.kind, subject: v.title.slice(0, 255),
      datetime: other ? at : `${a.day} ${ACT_TIME[a.kind].at}`, duration: ACT_TIME[a.kind].minutes, description_md: String(a.md || "").slice(0, 60000), learner_ids: v.members.map((m) => m.learner!.id),
      ...(l ? { library_key: l.key.slice(0, 160), credit: l.author ? l.author.slice(0, 120) : null } : {}) });
  }
  if (items.length) {
    const r = await intranetFetch(env, "POST", `/api/classbot/classrooms/${c.id}/activities`, { items }, guildId);
    for (const it of items) {
      const id = Number(String(it.ref).split(":").pop());
      const res = r.results?.[it.ref];
      if (res?.ok) {
        // a date other than its slot is kept: the next checks look for it there
        const moved = it.datetime !== `${rows.find((r) => r.id === id)!.day} ${ACT_TIME[it.type].at}` ? JSON.stringify({ at: it.datetime }) : null;
        await run(env, `INSERT INTO intranet_sync (guild_id, kind, local_id, remote_id, map, at) VALUES (?, 'activity', ?, ?, ?, ?)
          ON CONFLICT (guild_id, kind, local_id) DO UPDATE SET remote_id = excluded.remote_id, map = excluded.map, at = excluded.at`, guildId, id, Number(res.activity_id) || null, moved, now());
        results[id] = { ok: true, ...(res.reused_from ? { reused: `reused from « ${res.reused_from.subject} », created by ${res.reused_from.by} on ${res.reused_from.created}` } : {}) };
      } else if (res?.code === "exists" && res.existing) results[id] = { ok: false, existing: true, message: alreadyText(res.existing) };
      else results[id] = { ok: false, message: String(res?.message || "refused by the intranet").slice(0, 200) };
    }
  }
  const failed = Object.values(results).filter((x) => !x.ok);
  return { sent: Object.values(results).filter((x) => x.ok && x.assigned === undefined).length, assigned: Object.values(results).filter((x) => x.assigned !== undefined).length, reused: Object.values(results).filter((x) => x.reused).length, skipped: failed.filter((x) => x.existing).length, failed: failed.filter((x) => !x.existing).length, results };
}
