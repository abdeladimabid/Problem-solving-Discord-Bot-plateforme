// Password login for the dashboard: a free alternative to Cloudflare Access.
// The password is stored as an encrypted Cloudflare secret (ADMIN_PASSWORD).
// After login the browser keeps a signed, HTTP-only cookie for 30 days.
// Changing the password signs everyone out.
import type { Env } from "../shared/types.ts";

const COOKIE = "cb_session";
const DAYS = 30;
const enc = new TextEncoder();

async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(request: Request, name: string): string | null {
  const m = (request.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

export async function hasSession(request: Request, env: Env): Promise<boolean> {
  const c = readCookie(request, COOKIE);
  if (!c || !env.ADMIN_PASSWORD) return false;
  const [exp, sig] = c.split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return sameString(sig, await hmac(env.ADMIN_PASSWORD, `session:${exp}`));
}

const page = (error = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ClassBot · Sign in</title>
<style>
:root{--board:#22463a;--chalk:#eef3ee;--paper:#f3f5f4;--ink:#1d2a26;--line:#dde3e0;--down:#b4421a}
@media (prefers-color-scheme:dark){:root{--paper:#151b19;--ink:#e8eeeb;--line:#2e3a36;--down:#ff8a5c}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--paper);color:var(--ink);font:16px/1.5 "Atkinson Hyperlegible",system-ui,sans-serif;padding:16px}
form{width:min(360px,100%);background:var(--board);color:var(--chalk);border-radius:12px;padding:28px 24px}
h1{margin:0 0 4px;font-size:24px}p{margin:0 0 18px;opacity:.8;font-size:14px}
label{display:block;font-weight:700;font-size:14px;margin-bottom:6px}
input{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #ffffff33;background:#1a372d;color:var(--chalk);font:inherit}
input:focus-visible,button:focus-visible{outline:3px solid #ffe45c;outline-offset:2px}
button{margin-top:16px;width:100%;padding:10px;border:0;border-radius:8px;background:#ffe45c;color:#2b2500;font:inherit;font-weight:700;cursor:pointer}
.err{color:#ffb39a;font-size:14px;margin-top:12px}
</style></head><body>
<form method="post" action="/login">
<h1>ClassBot</h1><p>Teacher dashboard</p>
<label for="pw">Password</label>
<input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
<button type="submit">Sign in</button>
${error ? `<div class="err" role="alert">${error}</div>` : ""}
</form></body></html>`;

const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers } });

/** Handles /login and /logout. Returns null for any other path. */
export async function handleAuthRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/logout") {
    return new Response(null, { status: 303, headers: { location: "/login", "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
  }
  if (url.pathname !== "/login") return null;
  if (request.method !== "POST") return html(page());
  const form = await request.formData().catch(() => null);
  const given = String(form?.get("password") ?? "");
  // compare HMACs so the comparison takes the same time whatever the input
  const ok = !!env.ADMIN_PASSWORD && sameString(await hmac(env.ADMIN_PASSWORD, `pw:${given}`), await hmac(env.ADMIN_PASSWORD, `pw:${env.ADMIN_PASSWORD}`));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 1200)); // slows down guessing
    return html(page("Wrong password. Try again."), 401);
  }
  const exp = Math.floor(Date.now() / 1000) + DAYS * 86400;
  const sig = await hmac(env.ADMIN_PASSWORD!, `session:${exp}`);
  return new Response(null, {
    status: 303,
    headers: { location: "/", "set-cookie": `${COOKIE}=${exp}.${sig}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax` },
  });
}
