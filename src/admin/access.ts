// Verifies the Cloudflare Access login token on every dashboard request.
// Access itself blocks strangers; this check makes sure requests really came
// through Access (defence in depth), and tells us the teacher's email.
import type { Env } from "../shared/types.ts";

let certs: { url: string; at: number; keys: JsonWebKey[] } | null = null;

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64urlJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

export function teamDomain(env: Env): string {
  const d = (env.TEAM_DOMAIN ?? "").trim().replace(/\/+$/, "");
  return d.startsWith("http") ? d : `https://${d}`;
}

async function getKeys(env: Env): Promise<JsonWebKey[]> {
  const url = `${teamDomain(env)}/cdn-cgi/access/certs`;
  if (certs && certs.url === url && Date.now() - certs.at < 3600_000) return certs.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cannot load Access certs (${res.status})`);
  const data = (await res.json()) as { keys: JsonWebKey[] };
  certs = { url, at: Date.now(), keys: data.keys ?? [] };
  return certs.keys;
}

export async function checkAccess(request: Request, env: Env): Promise<{ email: string } | Response> {
  if (env.DEV_NO_AUTH === "true") return { email: "dev@localhost" };
  if (!env.POLICY_AUD || !env.TEAM_DOMAIN) {
    return new Response(
      "🔒 Dashboard locked: no sign-in method is set up yet.\nRun `npm run setup:password` in the project folder to choose a dashboard password.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return new Response("Forbidden: sign in through Cloudflare Access.", { status: 403 });
  try {
    const [h, p, s] = token.split(".");
    const header = b64urlJson(h), payload = b64urlJson(p);
    const jwk = (await getKeys(env)).find((k: any) => k.kid === header.kid);
    if (!jwk) throw new Error("unknown key");
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s) as BufferSource, new TextEncoder().encode(`${h}.${p}`));
    const aud: string[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const nowS = Date.now() / 1000;
    if (!ok || !aud.includes(env.POLICY_AUD) || payload.exp < nowS || (payload.iss && payload.iss !== teamDomain(env))) throw new Error("invalid token");
    return { email: String(payload.email ?? "teacher") };
  } catch {
    return new Response("Forbidden: invalid Cloudflare Access token.", { status: 403 });
  }
}
