// Dashboard API for « Suivi VS Code »: the class today and this week, one learner, the squads of a brief, the CSV,
// the setup reminder by DM, the settings and their check (see shared/vscodedb.ts). Null when the path isn't ours.
import type { Ctx, Env, GuildRow } from "../shared/types.ts";
import { all, now } from "../shared/db.ts";
import { dm } from "../shared/discord.ts";
import { t } from "../shared/i18n.ts";
import { apiUrlOf, dayOf, isDay, newKey, vscSettings } from "../shared/vscode.ts";
import { DIAG_ID, VscError, acceptConsent, briefMembersTime, classDay, classWeek, deleteLearner, exportCsv, learnerDays, learnerDetail, saveSettings, squadView } from "../shared/vscodedb.ts";
import { handleWakatime } from "../bot/wakatime.ts";
import { consentText } from "../bot/vscodecmd.ts";

const ok = (data: unknown) => Response.json(data);

export async function vscodeApi(env: Env, ctx: Ctx, path: string, method: string, body: any, url: URL, guild: () => Promise<GuildRow>): Promise<Response | null> {
  if (!/^\/vscode(\/|$)/.test(path)) return null;
  try {
    const g = await guild();
    const q = url.searchParams.get("date");
    const day = isDay(q) ? q : dayOf(now());
    if (path === "/vscode/day" && method === "GET") return ok(await classDay(env, g, day, url.searchParams.get("live") === "1"));
    if (path === "/vscode/week" && method === "GET") return ok(await classWeek(env, g, day));
    const lm = path.match(/^\/vscode\/learner\/(\d{1,25})$/);
    if (lm && method === "GET") return ok(await learnerDetail(env, g, lm[1], day));
    const dm2 = path.match(/^\/vscode\/days\/(\d{1,25})$/);
    if (dm2 && method === "GET") return ok(await learnerDays(env, g, dm2[1], Number(url.searchParams.get("days")) || 30));
    const bm = path.match(/^\/vscode\/brief\/(\d+)$/);
    if (bm && method === "GET") return ok(await briefMembersTime(env, g, Number(bm[1]), String(url.searchParams.get("who") ?? "")));
    if (path === "/vscode/squads" && method === "GET") {
      const briefs = await all<{ id: number; title: string; start_at: number | null; due_at: number | null }>(env,
        "SELECT id, title, start_at, due_at FROM briefs WHERE guild_id = ? AND kind = 'squad' AND status != 'draft' ORDER BY COALESCE(start_at, created_at) DESC LIMIT 20", g.id);
      const id = Number(url.searchParams.get("brief")) || briefs[0]?.id;
      return ok({ briefs, view: id ? await squadView(env, g, id) : null });
    }
    if (path === "/vscode/export.csv" && method === "GET") {
      const period = url.searchParams.get("period") === "week" ? "week" : "day";
      return new Response(await exportCsv(env, g, period, day), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="vscode-${period}-${day}.csv"` } });
    }
    // « Pas encore connectés »: the setup reminder by DM (only to students of the class who haven't sent anything)
    if (path === "/vscode/remind" && method === "POST") {
      const want = new Set((Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, 60));
      const d = await classDay(env, g, day, true);
      const to = d.notConnected.filter((r) => want.has(r.id));
      let sent = 0;
      for (const r of to) if (await dm(env, r.id, { content: t(g.lang, "vsc.remind") })) sent++;
      return ok({ sent, failed: to.length - sent });
    }
    if (path === "/vscode/settings" && method === "GET") return ok(settingsView(env, g, vscSettings(g.vscode)));
    if (path === "/vscode/settings" && method === "PUT") return ok(settingsView(env, g, await saveSettings(env, g, body)));
    if (path === "/vscode/check" && method === "POST") return ok(await runCheck(env, ctx, g));
    return null;
  } catch (e) {
    if (e instanceof VscError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

function settingsView(env: Env, g: GuildRow, st: ReturnType<typeof vscSettings>) {
  return { settings: st, apiUrl: env.PUBLIC_URL ? apiUrlOf(env.PUBLIC_URL) : null, consentDefault: consentText(g.lang, { ...st, consent: "" }), lang: g.lang };
}

/**
 * « Run checks »: a fake heartbeat through the same code as a learner's VS Code (the bot's WakaTime endpoint, run here
 * on the same database), read back, then deleted. Then the public address: a Worker can't always fetch another
 * Worker of the same account (Cloudflare error 1042), so not reaching it from here is a warning, not a failure.
 */
async function runCheck(env: Env, ctx: Ctx, g: GuildRow) {
  const st = vscSettings(g.vscode);
  const steps: { name: string; ok: boolean | null; detail: string }[] = [];
  const base = env.PUBLIC_URL?.replace(/\/+$/, "");
  steps.push({ name: "Bot address (PUBLIC_URL)", ok: !!base, detail: base ? apiUrlOf(base) : "PUBLIC_URL isn't set in wrangler.bot.jsonc and wrangler.admin.jsonc: learners can't get their setup." });
  steps.push({ name: "Tracking for the class", ok: st.enabled, detail: st.enabled ? `tracking on · idle limit ${st.idle} min · details kept ${st.retention} days${st.window.on ? ` · counted ${st.window.from}–${st.window.to}${st.window.weekdays ? ", Monday → Friday" : ""}` : ""}` : "tracking off: heartbeats are answered but not kept" });
  const key = await acceptConsent(env, g.id, DIAG_ID, st.consent_v);
  const auth = { authorization: "Basic " + btoa(key), "content-type": "application/json", "user-agent": "wakatime/check classbot-dashboard/1.0" };
  const local = (sub: string, init: RequestInit) => handleWakatime(new Request("https://classbot.local/wakatime/api/v1" + sub, init), env, ctx, sub);
  try {
    const t0 = now() - 90;
    const hb = [
      { entity: "C:/Users/check/cours/classbot-check/src/check.js", type: "file", category: "coding", time: t0, project: "classbot-check", project_root_count: 5, language: "JavaScript", lines: 10, is_write: false },
      { entity: "C:/Users/check/cours/classbot-check/src/check.js", type: "file", category: "coding", time: t0 + 60, project: "classbot-check", project_root_count: 5, language: "JavaScript", lines: 14, is_write: true, human_line_changes: 4 },
    ];
    const r1 = await local("/users/current/heartbeats.bulk", { method: "POST", headers: auth, body: JSON.stringify(hb) });
    const b1: any = await r1.json().catch(() => null);
    steps.push({ name: "Send heartbeats (like wakatime-cli)", ok: r1.status === 202 && b1?.responses?.every((x: any) => x[1] === 201), detail: `${r1.status} · ${JSON.stringify(b1?.responses?.map((x: any) => x[1]) ?? b1)}` });
    const row = await all<{ active_s: number; write_s: number; raw: string | null }>(env, "SELECT active_s, write_s, raw FROM vsc_days WHERE guild_id = ? AND discord_id = ?", g.id, DIAG_ID);
    const kept = row.reduce((n, r) => n + r.active_s, 0);
    steps.push({ name: "Read back", ok: st.enabled ? kept > 0 && !row.some((r) => (r.raw ?? "").includes("Users")) : null, detail: st.enabled ? `${Math.round(kept / 60)} min active, ${Math.round(row.reduce((n, r) => n + r.write_s, 0) / 60)} min writing · stored path: src/check.js (no absolute path)` : "not kept: tracking off" });
    const r2 = await local("/users/current/statusbar/today", { method: "GET", headers: auth });
    const b2: any = await r2.json().catch(() => null);
    steps.push({ name: "Status bar (VS Code)", ok: r2.status === 200 && !!b2?.data?.grand_total, detail: `${r2.status} · « ${b2?.data?.grand_total?.text ?? "?"} »` });
    const r3 = await local("/users/current/statusbar/today", { method: "GET", headers: { authorization: "Basic " + btoa(newKey()) } });
    steps.push({ name: "Unknown key refused", ok: r3.status === 401, detail: String(r3.status) });
  } finally {
    await deleteLearner(env, g.id, DIAG_ID);
  }
  // the public address, as a learner's computer calls it
  if (base) {
    try {
      const r = await fetch(apiUrlOf(base) + "/users/current/statusbar/today", { headers: { "user-agent": "classbot-check" } });
      const isOurs = r.status === 401 && (r.headers.get("content-type") ?? "").includes("json");
      steps.push({ name: "Public address answers", ok: isOurs ? true : null, detail: isOurs ? "401 without a key, as expected" : `${r.status}: Cloudflare may block a Worker calling another Worker of the same account. Check from a learner's computer: curl -i ${apiUrlOf(base)}/users/current/statusbar/today (expect 401)` });
    } catch (e) {
      steps.push({ name: "Public address answers", ok: null, detail: `not reachable from the dashboard (${String((e as Error).message).slice(0, 80)}). Check from a learner's computer: curl -i ${apiUrlOf(base)}/users/current/statusbar/today (expect 401)` });
    }
  }
  return { ok: steps.every((s) => s.ok !== false), steps, cleaned: true };
}
