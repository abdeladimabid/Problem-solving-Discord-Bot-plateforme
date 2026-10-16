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
