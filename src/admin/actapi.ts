// Dashboard API for the Activités page: the daily veilles and live codings of a date range (see shared/activities.ts).
// The page asks for one thing at a time (the week's plan, then each item), so every request stays short and the
// teacher sees each card fill in. Returns null when the path isn't one of ours (the main API goes on).
import type { Env, GuildRow } from "../shared/types.ts";
import { aiStatus } from "../shared/aikeys.ts";
import { ActivityError, activitiesView, deleteItem, editItem, generateItem, generateWeek, setDay, setLiveDays } from "../shared/activities.ts";

const ok = (data: unknown) => Response.json(data);

export async function activitiesApi(env: Env, path: string, method: string, body: any, url: URL, guild: () => Promise<GuildRow>): Promise<Response | null> {
  if (!/^\/activities(\/|$)/.test(path)) return null;
  try {
    return await route(env, path, method, body, url, guild);
  } catch (e) {
    // the AI's per-minute limit: the page waits that long and asks again by itself
    if (e instanceof ActivityError && e.wait) return Response.json({ error: e.message, retryIn: e.wait });
    if (e instanceof ActivityError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

async function route(env: Env, path: string, method: string, body: any, url: URL, guild: () => Promise<GuildRow>): Promise<Response | null> {
  let m: RegExpMatchArray | null;
  if (path === "/activities" && method === "GET") {
    const g = await guild();
    return ok({ ...(await activitiesView(env, g, String(url.searchParams.get("from") || ""), String(url.searchParams.get("to") || ""))), ai: !!(await aiStatus(env)) });
  }
  if (path === "/activities/days" && method === "PUT") {
    const g = await guild();
    const mark = body.mark === "off" || body.mark === "on" ? body.mark : null;
    return ok({ overrides: await setDay(env, g.id, String(body.day || ""), mark) });
  }
  if (path === "/activities/week" && method === "POST") {
    const g = await guild();
    return ok({ item: await generateWeek(env, g, { monday: String(body.monday || ""), from: String(body.from || ""), to: String(body.to || ""), live: Array.isArray(body.live) ? body.live.map(String) : null, keep: !!body.keep }) });
  }
  if (path === "/activities/live" && method === "PUT") {
    const g = await guild();
    return ok(await setLiveDays(env, g, String(body.monday || ""), Array.isArray(body.live) ? body.live.map(String) : []) ?? { live: null, removed: [] });
  }
  if (path === "/activities/item" && method === "POST") {
    const g = await guild();
    return ok({ item: await generateItem(env, g, { day: String(body.day || ""), kind: String(body.kind || "") }) });
  }
  if ((m = path.match(/^\/activities\/(\d+)$/))) {
    const g = await guild();
    if (method === "PUT") return ok({ item: await editItem(env, g, Number(m[1]), body.md) });
    if (method === "DELETE") { await deleteItem(env, g, Number(m[1])); return ok({ ok: true }); }
  }
  return null;
}
