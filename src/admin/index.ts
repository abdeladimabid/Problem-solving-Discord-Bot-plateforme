// ClassBot teacher dashboard Worker.
//   /api/*   JSON API
//   /*       the dashboard (static files in /public)
// Protected either by Cloudflare Access (TEAM_DOMAIN + POLICY_AUD) or by a
// password (ADMIN_PASSWORD secret, set with `npm run setup:password`).
import type { Ctx, Env } from "../shared/types.ts";
import { checkAccess } from "./access.ts";
import { handleApi } from "./api.ts";
import { handleAuthRoutes, hasSession } from "./password.ts";
import { applyAppSettings } from "../shared/appsettings.ts";

// ------------------------------------------------------------------ the page's files, versioned
// Each worker version comes with its own files: what an isolate computed stays true for its whole life.
const versions = new Map<string, string>();
async function versionOf(env: Env, origin: string, path: string): Promise<string> {
  const hit = versions.get(path);
  if (hit) return hit;
  const r = await env.ASSETS!.fetch(new Request(origin + path));
  if (!r.ok) return "";
  let v = (r.headers.get("etag") || "").replace(/[^\w]/g, "").slice(-16);
  if (!v) v = [...new Uint8Array(await crypto.subtle.digest("SHA-1", await r.arrayBuffer()))].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
  else await r.body?.cancel();
  versions.set(path, v);
  return v;
}
async function versionedPage(request: Request, env: Env): Promise<Response> {
  const origin = new URL(request.url).origin;
  const res = await env.ASSETS!.fetch(new Request(origin + "/"));
  if (!res.ok) return res;
  let html = await res.text();
  const paths = [...new Set([...html.matchAll(/(?:src|href)="(\/[\w.-]+\.(?:js|css))"/g)].map((m) => m[1]))];
  const vs = await Promise.all(paths.map((p) => versionOf(env, origin, p).catch(() => "")));
  paths.forEach((p, i) => { if (vs[i]) html = html.split(`"${p}"`).join(`"${p}?v=${vs[i]}"`); });
  const h = new Headers(res.headers);
  h.set("cache-control", "no-cache");
  h.set("content-type", "text/html; charset=utf-8");
  h.delete("content-length"); h.delete("etag");
  return new Response(html, { status: 200, headers: h });
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(request.url);
    let auth: { email: string; mode?: string };
    const useAccess = !!(env.TEAM_DOMAIN && env.POLICY_AUD) || env.DEV_NO_AUTH === "true";
    if (!useAccess && env.ADMIN_PASSWORD) {
      const r = await handleAuthRoutes(request, env);
      if (r) return r;
      if (!(await hasSession(request, env))) {
        if (url.pathname.startsWith("/api/")) return Response.json({ error: "Please sign in again." }, { status: 401 });
        const next = url.pathname === "/" && !url.search ? "" : `?next=${encodeURIComponent(url.pathname + url.search)}`;
        return new Response(null, { status: 303, headers: { location: `/login${next}` } });
      }
      auth = { email: "teacher", mode: "password" };
    } else {
      const a = await checkAccess(request, env);
      if (a instanceof Response) return a;
      auth = a;
    }
    if (url.pathname.startsWith("/api/")) { await applyAppSettings(env); return handleApi(request, env, ctx, auth); }
    if (!env.ASSETS) return new Response("assets binding missing", { status: 500 });
    // the page: its scripts and styles get a version (?v=…) that changes with their content, so the browser keeps them
    // (no request at all on the next visits) and still takes a new one right after an update
    if (url.pathname === "/" || url.pathname === "/index.html") return versionedPage(request, env);
    const res = await env.ASSETS.fetch(request);
    if (!/\.(js|css|html)$/.test(url.pathname)) return res;
    const out = new Response(res.body, res);
    out.headers.set("cache-control", url.searchParams.has("v") && res.ok ? "public, max-age=31536000, immutable" : "no-cache");
    return out;
  },
};
