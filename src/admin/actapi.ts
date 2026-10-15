// Dashboard API for the Activités page: the daily veilles and live codings of a date range (see shared/activities.ts).
// The page asks for one thing at a time (the week's plan, then each item), so every request stays short and the
// teacher sees each card fill in. Returns null when the path isn't one of ours (the main API goes on).
import type { Env, GuildRow } from "../shared/types.ts";
import { aiStatus } from "../shared/aikeys.ts";
import { libCfg, syncLibrary } from "../shared/library.ts";
import { SignupError, presentationsView, assignActivity, cancelClaim, decideClaim, dropSignups, gradeClaim, randomAssign, saveSignupCfg, setMembers, setSlot, shareActivities, signupStats, signupView } from "../shared/actsignup.ts";
import { ActivityError, activitiesView, deleteItem, editItem, generateItem, generateWeek, setDay, setLiveDays } from "../shared/activities.ts";

const ok = (data: unknown) => Response.json(data);

export async function activitiesApi(env: Env, path: string, method: string, body: any, url: URL, guild: () => Promise<GuildRow>): Promise<Response | null> {
  if (!/^\/activities(\/|$)/.test(path)) return null;
  try {
    // the shared library: what the other classes changed comes in before the page is shown; what changes here goes out
    if (method === "GET" && (path === "/activities" || path === "/activities/presentations")) await syncLibrary(env, await guild()).catch(() => null);
    const res = await route(env, path, method, body, url, guild);
    if (method !== "GET" && res && res.ok && !/^\/activities\/(signups|share|random|claims|stats|presentations|\d+\/(slot|assign))/.test(path)) await syncLibrary(env, await guild(), { force: false, pushOnly: true }).catch(() => null);
    return res;
  } catch (e) {
    // the AI's per-minute limit: the page waits that long and asks again by itself
    if (e instanceof ActivityError && e.wait) return Response.json({ error: e.message, retryIn: e.wait });
    if (e instanceof ActivityError || e instanceof SignupError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

async function route(env: Env, path: string, method: string, body: any, url: URL, guild: () => Promise<GuildRow>): Promise<Response | null> {
  let m: RegExpMatchArray | null;
  if (path === "/activities" && method === "GET") {
    const g = await guild();
    return ok({ ...(await activitiesView(env, g, String(url.searchParams.get("from") || ""), String(url.searchParams.get("to") || ""))), ai: !!(await aiStatus(env)), library: (await libCfg(env, g.id))?.name ?? null });
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
    if (method === "DELETE") { await deleteItem(env, g, Number(m[1])); await dropSignups(env, g.id, Number(m[1])); return ok({ ok: true }); }
  }
  // ---- sign-ups: shared in Discord, asked for by students, approved, assigned, graded
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter((n) => n > 0) : []);
  if (path === "/activities/signups" && method === "GET") {
    const g = await guild();
    return ok(await signupView(env, g, String(url.searchParams.get("from") || "0000"), String(url.searchParams.get("to") || "9999")));
  }
  if (path === "/activities/signups" && method === "PUT") return ok({ cfg: await saveSignupCfg(env, (await guild()).id, body) });
  if (path === "/activities/presentations" && method === "GET") return ok(await presentationsView(env, await guild()));
  if (path === "/activities/stats" && method === "GET") return ok(await signupStats(env, await guild()));
  if (path === "/activities/share" && method === "POST") return ok(await shareActivities(env, await guild(), ids(body.ids), body.channel === undefined ? undefined : body.channel || null));
  if (path === "/activities/random" && method === "POST") return ok(await randomAssign(env, await guild(), ids(body.ids), !!body.apply));
  if ((m = path.match(/^\/activities\/(\d+)\/slot$/)) && method === "PUT") return ok({ slot: await setSlot(env, await guild(), Number(m[1]), { level: body.level, size: body.size }) });
  if ((m = path.match(/^\/activities\/(\d+)\/assign$/)) && method === "POST") return ok(await assignActivity(env, await guild(), Number(m[1]), Array.isArray(body.members) ? body.members : [], "teacher", body.note ? String(body.note) : null));
  if ((m = path.match(/^\/activities\/claims\/(\d+)\/(decide|members|cancel|grade)$/)) && method !== "GET") {
    const g = await guild(), id = Number(m[1]);
    if (m[2] === "decide") return ok(await decideClaim(env, g, id, !!body.approve, body.note ? String(body.note) : null));
    if (m[2] === "members") return ok(await setMembers(env, g, id, Array.isArray(body.members) ? body.members : []));
    if (m[2] === "cancel") return ok(await cancelClaim(env, g, id));
    return ok(await gradeClaim(env, g, id, body.grades && typeof body.grades === "object" ? body.grades : {}, body.note ? String(body.note) : null));
  }
  return null;
}
