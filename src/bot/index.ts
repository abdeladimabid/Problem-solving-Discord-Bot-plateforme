// ClassBot: the public Worker that Discord talks to.
//   POST /interactions     Discord slash commands, buttons, forms
//   GET  /replay/:id       public race replay of a finished contest
//   GET  /u/:key           a student's shared profile page
//   GET  /cert/:token      an end-of-season certificate (print / save as PDF)
//   POST /gh/hook          optional GitHub push webhook for graded projects
//   cron every minute      contests, duels, assignments, daily, weekly recap
import type { Ctx, Env } from "../shared/types.ts";
import { verifyDiscord } from "../shared/discord.ts";
import { handleInteraction } from "./interactions.ts";
import { runCron } from "./cron.ts";
import { replayData, replayPage } from "./replay.ts";
import { handleEditor } from "./editor.ts";
import { codeToPng } from "../shared/codeimage.ts";
import { one } from "../shared/db.ts";
import { certPage, profilePage } from "./pages.ts";
import { onPush } from "../shared/projects.ts";

/** A quick challenge's code as a PNG (Discord shows it instead of copyable text). Cached at the edge. */
async function codeImage(request: Request, env: Env, ctx: Ctx, id: number): Promise<Response> {
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  const hit = cache ? await cache.match(request) : undefined;
  if (hit) return hit;
  const c = await one<{ code: string | null; code_lang: string | null }>(env, "SELECT code, code_lang FROM challenges WHERE id = ?", id);
  if (!c?.code) return new Response("not found", { status: 404 });
  const png = await codeToPng(c.code, c.code_lang ?? "python");
  const res = new Response(png as BodyInit, { headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" } });
  if (cache) ctx.waitUntil(cache.put(request, res.clone()));
  return res;
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/interactions" && request.method === "POST") {
      const body = await verifyDiscord(request, env.DISCORD_PUBLIC_KEY);
      if (body === null) return new Response("invalid request signature", { status: 401 });
      return handleInteraction(JSON.parse(body), env, ctx);
    }
    const m = url.pathname.match(/^\/replay\/(\d+)(\/data)?$/);
    if (m && request.method === "GET") {
      if (m[2]) {
        const d = await replayData(env, Number(m[1]));
        return d ? Response.json(d, { headers: { "cache-control": "public, max-age=300" } }) : new Response("not found", { status: 404 });
      }
      return new Response(replayPage(Number(m[1])), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    const ed = url.pathname.match(/^\/code\/([0-9]+\.[0-9]+\.[0-9]+\.[A-Za-z0-9_-]{32})(?:\/(data|run|submit|explain|answer))?$/);
    if (ed) return handleEditor(request, env, ctx, ed[1], ed[2]);
    const img = url.pathname.match(/^\/img\/(\d+)\.png$/);
    if (img && request.method === "GET") return codeImage(request, env, ctx, Number(img[1]));
    const prof = url.pathname.match(/^\/u\/([a-z0-9]{8,32})$/);
    if (prof && request.method === "GET") return profilePage(env, prof[1]);
    const cert = url.pathname.match(/^\/cert\/([A-Za-z0-9._-]{40,260})$/);
    if (cert && request.method === "GET") return certPage(env, cert[1]);
    if (url.pathname === "/gh/hook" && request.method === "POST") {
      // GitHub sends "ping" when the webhook is created, then "push" events. We only use the
      // repository name and download the file ourselves, so a forged call can't change a grade.
      const event = request.headers.get("x-github-event") ?? "";
      if (event === "ping") return new Response("pong");
      if (event !== "push") return new Response(null, { status: 204 });
      const text = await request.text();
      let payload: any = null;
      try { payload = JSON.parse(text.startsWith("payload=") ? decodeURIComponent(text.slice(8).replace(/\+/g, " ")) : text); } catch { payload = null; }
      const n = payload ? await onPush(env, payload) : 0;
      return new Response(n ? "queued" : "unknown repository", { status: 202 });
    }
    if (url.pathname === "/") return new Response("ClassBot is running ✅ (Discord endpoint: /interactions)");
    return new Response("not found", { status: 404 });
  },

  async scheduled(_controller: unknown, env: Env, ctx: Ctx) {
    ctx.waitUntil(runCron(env));
  },
};
