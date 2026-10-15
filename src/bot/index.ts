// ClassBot: the public Worker that Discord talks to.
//   POST /interactions     Discord slash commands, buttons, forms
//   GET  /replay/:id       public race replay of a finished contest
//   GET  /u/:key           a student's shared profile page
//   GET  /cert/:token      an end-of-season certificate (print / save as PDF)
//   GET  /quiz/:token      a student's assessment (full screen)
//   GET  /github/connect   a student links GitHub (from /github); POST /github/webhook: the class's GitHub App
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
import { handleQuiz } from "./quiz.ts";
import { leagueFeed } from "../shared/league.ts";
import { handleBattle } from "./battle.ts";
import { handleGame } from "./games.ts";
import { sharePage } from "../shared/assessshare.ts";
import { applyAppSettings } from "../shared/appsettings.ts";
import { githubPages, githubWebhook } from "../shared/github.ts";

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
    await applyAppSettings(env);   // the AI key set in the dashboard (Settings → AI)
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
    const quiz = url.pathname.match(/^\/quiz\/(\d+\.\d+\.[A-Za-z0-9_-]{32}|expired)(?:\/(info|start|answer|event|state|submit|translate))?$/);
    if (quiz) return handleQuiz(request, env, ctx, quiz[1], quiz[2]);
    const bt = url.pathname.match(/^\/battle\/(tv|judge)\/(\d{1,9})\.([a-f0-9]{24})(?:\/(state|qr\.svg|claim|act))?\/?$/);
    if (bt) return handleBattle(request, env, bt[1] as "tv" | "judge", Number(bt[2]), bt[3], bt[4]);
    const gt = url.pathname.match(/^\/game\/(\d{1,9})\.([a-f0-9]{24})(?:\/(state|qr\.svg|act|codes))?\/?$/);
    if (gt) return handleGame(request, env, "tv", Number(gt[1]), gt[2], gt[3]);
    const gp = url.pathname.match(/^\/play\/(\d{1,9})\.([a-z0-9]{8})(?:\/(roster|join|state|answer|revive|check|hint|accuse|code|noise|mic|case|try))?\/?$/);
    if (gp) return handleGame(request, env, "play", Number(gp[1]), gp[2], gp[3]);
    const shr = url.pathname.match(/^\/share\/assessment\/(\d{1,9})\.([A-Za-z0-9_-]{32})\/?$/);
    if (shr && request.method === "GET") return sharePage(request, env, Number(shr[1]), shr[2]);
    const lgf = url.pathname.match(/^\/league\/feed\/([\w-]{1,30})\.([a-f0-9]{24})$/);
    if (lgf && request.method === "GET") return leagueFeed(env, lgf[1], lgf[2]);
    const ghw = url.pathname.match(/^\/github\/webhook(?:\/([\w-]{1,30}))?$/);
    if (ghw && request.method === "POST") return githubWebhook(request, env, ctx, ghw[1] ?? null);
    const ghp = url.pathname.match(/^\/github\/(connect|callback|setup)(?:\/[\w-]{1,30})?$/);
    if (ghp && request.method === "GET") return githubPages(request, env, ghp[1]);
    if (url.pathname === "/") return new Response("ClassBot is running ✅ (Discord endpoint: /interactions)");
    return new Response("not found", { status: 404 });
  },

  async scheduled(_controller: unknown, env: Env, ctx: Ctx) {
    ctx.waitUntil(applyAppSettings(env).then(() => runCron(env)));
  },
};
