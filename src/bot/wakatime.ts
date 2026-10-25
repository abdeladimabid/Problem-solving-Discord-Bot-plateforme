// The WakaTime API, the part wakatime-cli (and so the VS Code extension) uses, at /wakatime/api/v1 on the bot.
// A learner only sets api_url and api_key in ~/.wakatime.cfg (/vscode setup). What the CLI expects, from its source:
//   POST /users/current/heartbeats.bulk   201/202 {"responses": [[{"data": {"id"}}, 201], …]}: one [body, status] per heartbeat;
//                                         per item 400 = dropped by the CLI, another error = sent again later
//   POST /users/current/heartbeats        one heartbeat (the documented API; the CLI itself always uses .bulk)
//   GET  /users/current/statusbar/today   200 {"data": {"grand_total": {"text"…}, "categories": […]}} (the status bar)
//   POST /plugins/errors                  the CLI's crash reports: answered, never stored
// 401 = unknown or revoked key ("Invalid Api Key" in VS Code); 429 = too many requests (the CLI keeps them, sends later).
import type { Ctx, Env } from "../shared/types.ts";
import { MAX_PER_REQUEST, checkHeartbeat, keyOf, statusBar, vscSettings, type Hb, type HbCheck } from "../shared/vscode.ts";
import { DIAG_ID, ingest, learnerByKey, todayOf } from "../shared/vscodedb.ts";
import { now } from "../shared/db.ts";
import { t } from "../shared/i18n.ts";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const MAX_BODY = 256 * 1024;

// Per key, in this Worker's memory: 120 requests per 10 minutes (the CLI sends one batch every 2 minutes, and its
// offline queue 10 heartbeats per request). Free and good enough: a key only ever writes its own learner's days,
// which are capped anyway (MAX_PER_DAY).
const RATE = { n: 120, window: 600 };
const hits = new Map<string, number[]>();
export function rateLimited(key: string, t = now()): boolean {
  const list = (hits.get(key) ?? []).filter((x) => x > t - RATE.window);
  list.push(t);
  hits.set(key, list);
  if (hits.size > 5000) for (const k of [...hits.keys()].slice(0, 1000)) hits.delete(k);
  return list.length > RATE.n;
}

export async function handleWakatime(request: Request, env: Env, _ctx: Ctx, sub: string): Promise<Response> {
  const method = request.method;
  const route = sub.replace(/\/+$/, "").replace(/^\/users\/current/, "/me");
  if (method === "POST" && route === "/plugins/errors") return json(201, {});
  const url = new URL(request.url);
  const key = keyOf(request.headers.get("authorization"), url.searchParams.get("api_key"));
  if (!key) return json(401, { error: "Unauthorized: set api_key in ~/.wakatime.cfg (use /vscode setup in Discord)" });
  const who = await learnerByKey(env, key);
  if (!who) return json(401, { error: "Unknown or revoked key: run /vscode setup or /vscode newkey in Discord" });
  if (rateLimited(who.key_hash ?? key)) return json(429, { error: "Too many requests: wait a few minutes" });
  const st = vscSettings(who.vscode), L = who.lang === "fr" ? "fr" : "en";

  if (method === "GET" && (route === "/me/statusbar/today" || route === "/me/status_bar/today")) {
    const off = !st.enabled ? t(L, "vsc.bar_off") : who.paused ? t(L, "vsc.bar_paused") : undefined;
    const d = await todayOf(env, who.guild_id, who.discord_id);
    return json(200, statusBar(d.active_s, d.write_s, L, off));
  }
  if (method === "POST" && route === "/me/file_experts") return json(200, { data: [] });

  const bulk = route === "/me/heartbeats.bulk";
  if (method === "POST" && (bulk || route === "/me/heartbeats")) {
    const len = Number(request.headers.get("content-length") || 0);
    if (len > MAX_BODY) return json(413, { error: "Request too large" });
    const text = await request.text();
    if (text.length > MAX_BODY) return json(413, { error: "Request too large" });
    let body: unknown;
    try { body = JSON.parse(text); } catch { return json(400, { error: "Invalid JSON" }); }
    const items: unknown[] = Array.isArray(body) ? body : [body];
    if (!items.length) return json(bulk ? 202 : 400, bulk ? { responses: [] } : { error: "No heartbeat" });
    if (items.length > MAX_PER_REQUEST) return json(400, { error: `Up to ${MAX_PER_REQUEST} heartbeats per request` });
    // tracking off for the class, or paused by the learner: answered as received, nothing kept (no error in VS Code)
    const keep = st.enabled && !who.paused;
    const ua = request.headers.get("user-agent");
    const t0 = now();
    const results: { status: number; body: unknown }[] = [];
    const good: Hb[] = [];
    for (const raw of items) {
      const c = checkHeartbeat(raw, { now: t0, hideFiles: !st.files || !!who.hide_files, ua, maxAgeDays: st.retention });
      if (!c.ok) {
        const e = c as Extract<HbCheck, { ok: false }>;
        results.push(e.status === 400 ? { status: 400, body: { error: e.error } } : { status: 201, body: { data: { id: "skipped" } } });
        continue;
      }
      if (keep) good.push(c.hb);
      results.push({ status: 201, body: { data: { id: `${who.discord_id === DIAG_ID ? "check" : "hb"}-${Math.floor(c.hb.t)}`, type: "file", time: c.hb.t } } });
    }
    if (good.length) await ingest(env, { gid: who.guild_id, uid: who.discord_id, settings: st }, good);
    if (bulk) return json(202, { responses: results.map((r) => [r.body, r.status]) });
    const r = results[0];
    return json(r.status === 400 ? 400 : 202, r.body);
  }
  return json(404, { error: "Not found" });
}
