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
    // the dashboard's own files: always check for a newer version, so an update shows up without Ctrl+F5
    const res = await env.ASSETS.fetch(request);
    if (!/\.(js|css|html)$|\/$/.test(url.pathname)) return res;
    const out = new Response(res.body, res);
    out.headers.set("cache-control", "no-cache");
    return out;
  },
};
