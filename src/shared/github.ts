// GitHub in ClassBot: each student links their GitHub account once (/github), the class's GitHub App sends
// their activity here, and it becomes part of their record:
//   • activity: pushes, pull requests… (counted per day; posted in a forum thread per student if the teacher wants)
//   • briefs: who pushed since the brief started, on time or late; reminders before the due date
//   • reports: daily and weekly GitHub tables, students with no activity for a few working days
// The debrief of a brief (reading the repo, checks, AI review) is in review/debrief.ts.
import type { Env, GuildRow, PlayerRow } from "./types.ts";
import { all, getGuild, now, one, run } from "./db.ts";
import { dapi, send } from "./discord.ts";
import { signText } from "./integrity.ts";
import { installationToken, commitSizes, githubGet, validSignature, GH_WEB } from "./review/gh.ts";
import { classifyCommit } from "./review/engine.ts";
import { countAction, formatWebhook, postStatsTable } from "./review/format.ts";
import { t } from "./i18n.ts";

// ------------------------------------------------------------- settings
export interface GithubCfg {
  channel: string | null;      // where reports, reminders and "connected" messages go (default: #arena)
  forum: string | null;        // a forum channel: one thread per student with their activity (optional)
  daily: boolean; weekly: boolean; hour: number; minute: number; skip: number[]; weeklyDay: number;
  inactiveDays: number; reminders: boolean; tiny: number; huge: number; hidden: string[]; ignore: string[];
  lastDaily?: string; lastWeekly?: string;
}
export function githubCfg(g: Pick<GuildRow, "github"> | null | undefined): GithubCfg {
  let o: any = {};
  try { o = JSON.parse((g as any)?.github || "{}") ?? {}; } catch { o = {}; }
  const n = (v: unknown, d: number, a: number, b: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) && v !== "" && v != null ? Math.min(b, Math.max(a, x)) : d; };
  return {
    channel: o.channel ? String(o.channel) : null, forum: o.forum ? String(o.forum) : null,
    daily: o.daily !== false, weekly: o.weekly !== false, hour: n(o.hour, 17, 0, 23), minute: n(o.minute, 15, 0, 59),
    skip: Array.isArray(o.skip) ? o.skip.map(Number).filter((d: number) => d >= 0 && d <= 6) : [6, 0], weeklyDay: n(o.weeklyDay, 5, 0, 6),
    inactiveDays: n(o.inactiveDays, 3, 0, 14), reminders: o.reminders !== false, tiny: n(o.tiny, 2, 0, 50), huge: n(o.huge, 2000, 100, 100000),
    hidden: Array.isArray(o.hidden) ? o.hidden.map((r: unknown) => String(r).toLowerCase()).slice(0, 100) : [],
    ignore: Array.isArray(o.ignore) ? o.ignore.map(String).slice(0, 20) : [],
    lastDaily: o.lastDaily, lastWeekly: o.lastWeekly,
  };
}
export async function saveGithubCfg(env: Env, g: GuildRow, patch: Partial<GithubCfg>) {
  const cfg = { ...githubCfg(g), ...patch };
  await run(env, "UPDATE guilds SET github = ? WHERE id = ?", JSON.stringify(cfg), g.id);
  return cfg;
}
// ------------------------------------------------------ the GitHub App
/** The GitHub App of a class: its own (saved from the dashboard), else the one in the Worker's secrets. */
export interface GhApp { own: boolean; guildId: string | null; appId: string; slug: string; clientId: string; clientSecret: string; webhookSecret: string; privateKey: string }
export const envApp = (env: Env): GhApp => ({ own: false, guildId: null, appId: env.GITHUB_APP_ID ?? "", slug: env.GITHUB_APP_SLUG ?? "", clientId: env.GITHUB_CLIENT_ID ?? "",
  clientSecret: env.GITHUB_CLIENT_SECRET ?? "", webhookSecret: env.GITHUB_WEBHOOK_SECRET ?? "", privateKey: env.GITHUB_PRIVATE_KEY ?? "" });
export async function ghAppOf(env: Env, guildId: string): Promise<GhApp> {
  const r = await one<{ app_id: string | null; slug: string | null; client_id: string | null; client_secret: string | null; webhook_secret: string | null; private_key: string | null }>(env,
    "SELECT * FROM gh_apps WHERE guild_id = ?", guildId).catch(() => null);
  if (!r) return { ...envApp(env), guildId };
  return { own: true, guildId, appId: r.app_id ?? "", slug: r.slug ?? "", clientId: r.client_id ?? "", clientSecret: r.client_secret ?? "", webhookSecret: r.webhook_secret ?? "", privateKey: r.private_key ?? "" };
}
/** Save a class's own App (empty fields keep what was saved; secrets are never sent back to the dashboard). */
export async function saveGhApp(env: Env, guildId: string, b: Record<string, unknown>) {
  const cur = await ghAppOf(env, guildId);
  const keep = (v: unknown, old: string, max: number) => { const x = String(v ?? "").trim(); return x ? x.slice(0, max) : cur.own ? old : ""; };
  const slug = keep(b.slug, cur.slug, 100).replace(/^https?:\/\/github\.com\/apps\//i, "").replace(/\/.*$/, "");
  const key = keep(b.privateKey, cur.privateKey, 8000);
  if (key && !/-----BEGIN (RSA )?PRIVATE KEY-----/.test(key)) throw new Error("The private key must be the whole .pem file, with its BEGIN and END lines.");
  await run(env, `INSERT INTO gh_apps (guild_id, app_id, slug, client_id, client_secret, webhook_secret, private_key, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (guild_id) DO UPDATE SET app_id = excluded.app_id, slug = excluded.slug, client_id = excluded.client_id, client_secret = excluded.client_secret,
      webhook_secret = excluded.webhook_secret, private_key = excluded.private_key, updated_at = excluded.updated_at`,
    guildId, keep(b.appId, cur.appId, 30).replace(/\D/g, ""), slug, keep(b.clientId, cur.clientId, 60), keep(b.clientSecret, cur.clientSecret, 200),
    keep(b.webhookSecret, cur.webhookSecret, 200), key, now());
  // tokens of the old App are useless now
  await run(env, "DELETE FROM gh_tokens WHERE inst IN (SELECT gh_inst FROM players WHERE guild_id = ? AND gh_inst IS NOT NULL)", guildId);
  return ghAppOf(env, guildId);
}
export const githubReady = (a: GhApp) => !!(a.clientId && a.clientSecret && a.slug);

// ------------------------------------------------ "Create the GitHub App for me" (GitHub's app manifest)
// The teacher clicks once on GitHub ("Create GitHub App"): the URLs, permissions and events are already filled in,
// and GitHub sends back the App ID, slug, Client ID, secrets and private key, saved as the class's own App.
export class ManifestError extends Error {}
const MANIFEST_TTL = 3600;
/** What the dashboard posts to GitHub: the form's address (with a one-time state) and the manifest. */
export async function githubManifest(env: Env, g: GuildRow, dashOrigin: string) {
  if (!env.PUBLIC_URL) throw new ManifestError("The bot's address (PUBLIC_URL) isn't set: run npm run setup first.");
  const state = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await run(env, "DELETE FROM gh_manifest_states WHERE exp < ?", now());
  await run(env, "INSERT INTO gh_manifest_states (state, guild_id, exp) VALUES (?, ?, ?)", state, g.id, now() + MANIFEST_TTL);
  const urls = githubUrls(env, { own: true, guildId: g.id } as GhApp);
  const name = `ClassBot ${String(g.name || g.id)}`.replace(/[^\w .-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 34);
  const manifest = {
    name, url: (env.PUBLIC_URL || "").replace(/\/$/, ""), description: "Follows the students' GitHub work for ClassBot (briefs, debriefs, reports).",
    hook_attributes: { url: urls.webhook, active: true },
    redirect_url: `${dashOrigin.replace(/\/$/, "")}/api/github/manifest/done`,
    callback_urls: [urls.callback], setup_url: urls.setup, setup_on_update: true, request_oauth_on_install: false,
    public: true, // the students install it on their own accounts
    default_permissions: { contents: "read", metadata: "read", pull_requests: "read", issues: "read" },
    default_events: ["push", "pull_request", "pull_request_review", "issues", "create"],
  };
  return { action: `${GH_WEB}/settings/apps/new?state=${state}`, manifest };
}
/** GitHub came back with a code: turn it into the App's credentials and save them for the class that asked. */
export async function finishManifest(env: Env, state: string, code: string) {
  const st = /^[a-f0-9]{32}$/.test(state) ? await one<{ guild_id: string; exp: number }>(env, "SELECT guild_id, exp FROM gh_manifest_states WHERE state = ?", state) : null;
  if (!st || st.exp < now()) throw new ManifestError("This link has expired: click “Create the GitHub App for me” again.");
  await run(env, "DELETE FROM gh_manifest_states WHERE state = ?", state);
  if (!/^[\w-]{1,100}$/.test(code)) throw new ManifestError("GitHub didn't send the code back.");
  const res = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, { method: "POST", headers: { Accept: "application/vnd.github+json", "User-Agent": "classbot", "X-GitHub-Api-Version": "2022-11-28" } });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j?.id || !j?.pem) throw new ManifestError(`GitHub didn't create the App (${res.status} ${String(j?.message || "").slice(0, 120)}).`);
  await saveGhApp(env, st.guild_id, { appId: String(j.id), slug: String(j.slug || ""), clientId: String(j.client_id || ""), clientSecret: String(j.client_secret || ""), webhookSecret: String(j.webhook_secret || ""), privateKey: String(j.pem) });
  return { guildId: st.guild_id, slug: String(j.slug || "") };
}
export const githubCanRead = (a: GhApp) => !!(a.privateKey && (a.appId || a.clientId));
/** The three URLs to paste in the App: a class's own App has its own webhook (its own secret). */
export function githubUrls(env: Env, a: GhApp) {
  const base = (env.PUBLIC_URL || "").replace(/\/$/, "");
  const sfx = a.own && a.guildId ? `/${a.guildId}` : "";
  return { webhook: `${base}/github/webhook${sfx}`, callback: `${base}/github/callback`, setup: `${base}/github/setup` };
}
const reportChannel = (g: GuildRow, cfg: GithubCfg) => cfg.channel || g.announce_channel || g.daily_channel || null;

// -------------------------------------------------------- linking (/github)
const STATE_TTL = 1800;
/** The link a student opens to connect GitHub (signed: the bot knows who they are, no Discord login needed). */
export async function connectUrl(env: Env, guildId: string, discordId: string): Promise<string> {
  const exp = now() + STATE_TTL;
  const body = `${guildId}.${discordId}.${exp}`;
  return `${(env.PUBLIC_URL || "").replace(/\/$/, "")}/github/connect?s=${body}.${await signText(env, "gh:" + body)}`;
}
async function readState(env: Env, s: string | null): Promise<{ guildId: string; discordId: string; state: string } | null> {
  const m = String(s || "").match(/^(\d+)\.(\d+)\.(\d+)\.([A-Za-z0-9_-]{32})$/);
  if (!m || Number(m[3]) < now()) return null;
  if ((await signText(env, `gh:${m[1]}.${m[2]}.${m[3]}`)) !== m[4]) return null;
  return { guildId: m[1], discordId: m[2], state: s! };
}
const html = (status: number, title: string, body: string, headers: Record<string, string> = {}) => new Response(
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#f5f8ff;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
.card{max-width:460px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;text-align:center;box-shadow:0 6px 24px #0f172a14}
h1{font-size:22px;margin:0 0 10px}p{color:#475569;margin:0}a{color:#2563eb}
@media (prefers-color-scheme:dark){body{background:#0b1220;color:#e5ecff}.card{background:#111a2e;border-color:#22304d}p{color:#94a3b8}}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", ...headers } });
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const cookie = (state: string) => `cb_gh=${state}; Path=/github; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_TTL}`;
const readCookie = (req: Request) => (String(req.headers.get("cookie") || "").match(/(?:^|;\s*)cb_gh=([0-9A-Za-z._-]+)/) || [])[1] || null;
const authorizeUrl = (a: GhApp, origin: string, state: string) => {
  const u = new URL(`${GH_WEB}/login/oauth/authorize`);
  u.searchParams.set("client_id", a.clientId);
  // no redirect_uri: GitHub sends the student back to the App's own Callback URL, so a small difference
  // (http/https, a trailing slash, an old class-specific address) can't make GitHub refuse the sign-in
  u.searchParams.set("state", state);
  return u.toString();
};

/** GET /github/connect, /github/callback, /github/setup — the GitHub App connection, in the student's browser. */
export async function githubPages(request: Request, env: Env, path: string): Promise<Response> {
  const url = new URL(request.url), origin = url.origin;
  const notReady = html(503, "GitHub isn't set up yet", "Your teacher still has to connect the class's GitHub App.");
  // the signed state says which class (so which GitHub App) this is for
  if (path === "connect") {
    const st = await readState(env, url.searchParams.get("s"));
    if (!st) return html(400, "Link expired", "Type <b>/github</b> in Discord again to get a new link.");
    const app = await ghAppOf(env, st.guildId);
    if (!githubReady(app)) return notReady;
    return new Response(null, { status: 302, headers: { Location: authorizeUrl(app, origin, st.state), "Set-Cookie": cookie(st.state) } });
  }
  if (path === "setup") {
    // back from installing the App: sign in to GitHub again (instant) to finish
    const st = await readState(env, readCookie(request));
    if (!st) return html(200, "App installed", "Now type <b>/github</b> in Discord again to finish connecting.");
    const app = await ghAppOf(env, st.guildId);
    if (!githubReady(app)) return notReady;
    return new Response(null, { status: 302, headers: { Location: authorizeUrl(app, origin, st.state) } });
  }
  // callback
  const st = await readState(env, url.searchParams.get("state"));
  if (!st || st.state !== readCookie(request)) return html(400, "Link expired", "Type <b>/github</b> in Discord again to get a new link.");
  const app = await ghAppOf(env, st.guildId);
  if (!githubReady(app)) return notReady;
  const code = url.searchParams.get("code");
  if (!code) return html(400, "Not authorized", "GitHub access was not granted. Type <b>/github</b> in Discord to try again.");
  const tok = await fetch(`${GH_WEB}/login/oauth/access_token`, {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, code }),
  }).then((r) => r.json()).catch(() => ({})) as any;
  if (!tok.access_token) return html(400, "GitHub said no", "The connection could not be finished. Type <b>/github</b> in Discord to try again.");
  const user = await githubGet("/user", tok.access_token);
  const { installations = [] } = await githubGet("/user/installations?per_page=100", tok.access_token);
  const mine = installations.find((i: any) => i.account && i.account.id === user.id);
  // authorized but the App isn't installed on their account yet: install it (GitHub comes back to /github/setup)
  if (!mine) return new Response(null, { status: 302, headers: { Location: `${GH_WEB}/apps/${app.slug}/installations/new`, "Set-Cookie": cookie(st.state) } });
  await linkGithub(env, st.guildId, st.discordId, { id: String(user.id), login: String(user.login), inst: String(mine.id) });
  return html(200, "✅ GitHub connected", `Your account <b>${esc(user.login)}</b> is connected. Your work now counts in your learning record. You can close this tab.`,
    { "Set-Cookie": "cb_gh=; Path=/github; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });
}

/** Link a GitHub account to a student (in every class they are in) and say so in Discord. */
export async function linkGithub(env: Env, guildId: string, discordId: string, gh: { id: string; login: string; inst: string }) {
  // one GitHub account belongs to one student
  await run(env, "UPDATE players SET github_id = NULL, github_login = NULL, gh_inst = NULL WHERE github_id = ? AND discord_id != ?", gh.id, discordId);
  // the installation belongs to one GitHub App: link it in every class of this student that uses the same App
  const app = await ghAppOf(env, guildId);
  const same: string[] = [];
  for (const r of await all<{ guild_id: string }>(env, "SELECT guild_id FROM players WHERE discord_id = ?", discordId)) {
    const other = r.guild_id === guildId ? app : await ghAppOf(env, r.guild_id);
    if ((other.appId || other.clientId) === (app.appId || app.clientId)) same.push(r.guild_id);
  }
  if (!same.includes(guildId)) same.push(guildId);
  await run(env, `UPDATE players SET github_id = ?, github_login = ?, gh_inst = ?, gh_linked_at = COALESCE(gh_linked_at, ?) WHERE discord_id = ? AND guild_id IN (${same.map(() => "?").join(",")})`,
    gh.id, gh.login, gh.inst, now(), discordId, ...same);
  const g = await getGuild(env, guildId);
  if (g) {
    const ch = reportChannel(g, githubCfg(g));
    if (ch) await send(env, ch, { content: t(g.lang, "gh.connected", { user: `<@${discordId}>`, login: gh.login, url: `${GH_WEB}/${gh.login}` }) }).catch(() => {});
  }
}

// ------------------------------------------------------------- webhook
/** POST /github/webhook: verified with the App's webhook secret, handled after answering GitHub. */
export async function githubWebhook(request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }, guildId: string | null = null): Promise<Response> {
  const body = await request.text();
  // /github/webhook/<class>: that class's own App (and its secret); /github/webhook: the App of the Worker's secrets
  const app = guildId ? await ghAppOf(env, guildId) : envApp(env);
  if (!(await validSignature(app.webhookSecret, body, request.headers.get("x-hub-signature-256")))) return new Response("Bad signature", { status: 401 });
  const event = request.headers.get("x-github-event") || "";
  let p: any;
  try { p = JSON.parse(body); } catch { return new Response("bad json", { status: 400 }); }
  const delivery = request.headers.get("x-github-delivery") || crypto.randomUUID();
  ctx.waitUntil(handleEvent(env, event, p, delivery, app).catch((e) => console.error("github webhook", event, e)));
  return new Response("ok", { status: 202 });
}

export async function handleEvent(env: Env, event: string, p: any, delivery: string, app: GhApp = envApp(env)) {
  const inst = p?.installation?.id ? String(p.installation.id) : null;
  if (!inst || event === "ping") return;
  // installation ids are unique on GitHub; a class's own App only counts for that class
  const owners = await all<PlayerRow & { guild_id: string }>(env, app.own && app.guildId ? "SELECT * FROM players WHERE gh_inst = ? AND guild_id = ?" : "SELECT * FROM players WHERE gh_inst = ?",
    ...(app.own && app.guildId ? [inst, app.guildId] : [inst]));
  if (!owners.length) return;           // installation not linked to a student
  if (event === "installation" && ["deleted", "suspend"].includes(p.action)) {
    await run(env, "UPDATE players SET github_id = NULL, github_login = NULL, gh_inst = NULL WHERE gh_inst = ?", inst);
    for (const o of owners) {
      const g = await getGuild(env, o.guild_id);
      const ch = g && reportChannel(g, githubCfg(g));
      if (g && ch) await send(env, ch, { content: t(g.lang, "gh.disconnected", { user: `<@${o.discord_id}>`, login: o.github_login ?? "" }) }).catch(() => {});
    }
    return;
  }
  if (event === "installation" || event === "installation_repositories") return;
  const repoName = String(p?.repository?.full_name || "").toLowerCase();
  // commit sizes once (needs the App's private key), for every class
  const pushCommits = event === "push" && !p.deleted ? (p.commits || []).filter((c: any) => c.distinct !== false) : [];
  let sizes: Record<string, any> = {};
  if (pushCommits.length && githubCanRead(app) && p.repository?.full_name) {
    const shas = pushCommits.map((c: any) => c.id).filter((s: string) => /^[0-9a-f]{40}$/.test(s)).slice(-50);
    try { sizes = await commitSizes(env, app, inst, p.repository.full_name, shas); } catch (e) { console.error("commit sizes", e); }
  }
  for (const owner of owners) {
    const g = await getGuild(env, owner.guild_id);
    if (!g) continue;
    const cfg = githubCfg(g);
    if (cfg.ignore.includes(event) || (repoName && cfg.hidden.includes(repoName))) continue;
    // the person who acted (a squad mate pushing to this repo is counted for themselves)
    const sender = p.sender && String(p.sender.id) !== String(owner.github_id)
      ? await one<PlayerRow>(env, "SELECT * FROM players WHERE guild_id = ? AND github_id = ?", g.id, String(p.sender.id)) : owner;
    const analysis = pushCommits.length ? Object.fromEntries(pushCommits.map((c: any) => [c.id, classifyCommit(c, sizes[c.id], { TINY_LINES: cfg.tiny, HUGE_LINES: cfg.huge })])) : null;
    // only the pusher's own recent commits count for them: a copied project (starter, a classmate's repo, an old project)
    // brings old commits or commits written by other people
    if (analysis) {
      const login = String(p.sender?.login || "").toLowerCase();
      for (const c of pushCommits) {
        const a: any = analysis[c.id], who = String(c.author?.username || "").toLowerCase(), t = Date.parse(c.timestamp || "");
        if (who && login && who !== login) a.notMine = true;
        if (t && Date.now() - t > 14 * 86400000) a.old = true;
      }
    }
    const embed = formatWebhook(event, p, sender?.discord_id ?? null, analysis, sender?.name ?? null);
    if (!embed) continue;
    if (sender) {
      const c: any = countAction(event, p, analysis);
      if (c.commits + c.prs + c.other > 0) {
        const t0 = now();
        await run(env, `INSERT OR IGNORE INTO gh_activity (guild_id, discord_id, delivery, day, t, repo, commits, real, tiny, flagged, bad, lines, prs, other)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, g.id, sender.discord_id, delivery, dayOf(t0), t0, p.repository?.full_name?.slice(0, 120) ?? null,
          c.commits || 0, c.real || 0, c.tiny || 0, c.flagged || 0, c.bad || 0, c.lines || 0, c.prs || 0, c.other || 0);
      }
    }
    if (cfg.forum) await postActivity(env, g, cfg, owner, { embeds: [cleanEmbed(embed)] }).catch((e) => console.error("activity post", e));
  }
}

function cleanEmbed(obj: any) {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    out[k] = typeof v === "string" ? v.slice(0, k === "title" ? 256 : 4096) : v;
  }
  return out;
}

/** One forum thread per student ("Name (login)"); a new one if it was deleted. */
async function postActivity(env: Env, g: GuildRow, cfg: GithubCfg, owner: PlayerRow, payload: Record<string, unknown>) {
  if (owner.gh_thread) {
    try { await send(env, owner.gh_thread, payload); return; } catch { /* deleted or locked: start a new thread */ }
  }
  const name = (owner.name && owner.name !== owner.github_login ? `${owner.name} (${owner.github_login})` : String(owner.github_login || owner.name || "student")).slice(0, 100);
  const th = await dapi<{ id: string }>(env, "POST", `/channels/${cfg.forum}/threads`, { name, message: { ...payload, allowed_mentions: { parse: [] } } });
  await run(env, "UPDATE players SET gh_thread = ? WHERE guild_id = ? AND discord_id = ?", th.id, g.id, owner.discord_id);
}

// ------------------------------------------------------------- activity
export const dayOf = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);
const shiftDay = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(day + "T00:00:00Z").getUTCDay();

/** 14 days of activity per linked student: [commits, lines, PRs, other, tiny, huge, vague] per day, repos, idle working days. */
export async function activityOf(env: Env, g: GuildRow, days = 14) {
  const today = dayOf(now());
  const list = Array.from({ length: days }, (_, i) => shiftDay(today, i - days + 1));
  const linked = await all<{ discord_id: string; name: string | null; github_login: string; gh_linked_at: number | null }>(env,
    "SELECT discord_id, name, github_login, gh_linked_at FROM players WHERE guild_id = ? AND github_id IS NOT NULL", g.id);
  const rows = await all<{ discord_id: string; day: string; t: number; repo: string | null; real: number; lines: number; prs: number; other: number; tiny: number; flagged: number; bad: number }>(env,
    "SELECT discord_id, day, t, repo, real, lines, prs, other, tiny, flagged, bad FROM gh_activity WHERE guild_id = ? AND day >= ?", g.id, shiftDay(today, -30));
  const cfg = githubCfg(g), skip = new Set(cfg.skip);
  const ix = new Map(list.map((d, i) => [d, i]));
  const by = new Map<string, typeof rows>();
  for (const r of rows) (by.get(r.discord_id) ?? by.set(r.discord_id, []).get(r.discord_id)!).push(r);
  return {
    days: list,
    students: linked.map((s) => {
      const mine = by.get(s.discord_id) ?? [];
      const grid = list.map(() => [0, 0, 0, 0, 0, 0, 0]);
      const repos: Record<string, [number, number]> = {};
      let last = 0;
      for (const r of mine) {
        if (r.t > last) last = r.t;
        if (r.repo) { const x = repos[r.repo] ?? (repos[r.repo] = [0, 0]); x[0]++; x[1] = Math.max(x[1], r.t); }
        const i = ix.get(r.day);
        if (i === undefined) continue;
        const a = grid[i];
        a[0] += r.real; a[1] += r.lines; a[2] += r.prs; a[3] += r.other; a[4] += r.tiny; a[5] += r.flagged; a[6] += r.bad;
      }
      // working days in a row without any activity (never before they connected)
      const active = new Set(mine.map((r) => r.day));
      const since = s.gh_linked_at ? dayOf(s.gh_linked_at) : list[0];
      let idle = 0;
      for (let i = 0, d = today; i < 14; i++, d = shiftDay(d, -1)) {
        if (d < since || active.has(d)) break;
        if (!skip.has(weekday(d))) idle++;
      }
      return { discord_id: s.discord_id, name: s.name, login: s.github_login, days: grid, last, idle,
        repos: Object.entries(repos).map(([r, [n, tt]]) => [r, n, tt] as [string, number, number]).sort((a, b) => b[1] - a[1]).slice(0, 8) };
    }),
  };
}

/** Score rows for a period: real commits + PRs + other actions (tiny / huge / docs-only commits don't count). */
async function scoreRows(env: Env, g: GuildRow, from: string, to: string) {
  const linked = await all<{ discord_id: string; name: string | null; github_login: string }>(env, "SELECT discord_id, name, github_login FROM players WHERE guild_id = ? AND github_id IS NOT NULL", g.id);
  const sums = await all<{ discord_id: string; real: number; tiny: number; flagged: number; bad: number; lines: number; prs: number; other: number }>(env,
    `SELECT discord_id, SUM(real) AS real, SUM(tiny) AS tiny, SUM(flagged) AS flagged, SUM(bad) AS bad, SUM(lines) AS lines, SUM(prs) AS prs, SUM(other) AS other
       FROM gh_activity WHERE guild_id = ? AND day >= ? AND day <= ? GROUP BY discord_id`, g.id, from, to);
  const m = new Map(sums.map((s) => [s.discord_id, s]));
  return linked.map((s) => {
    const x = m.get(s.discord_id) ?? { real: 0, tiny: 0, flagged: 0, bad: 0, lines: 0, prs: 0, other: 0 } as any;
    return { discordId: s.discord_id, display: s.name ?? s.github_login, login: s.github_login, real: x.real || 0, tiny: x.tiny || 0, flagged: x.flagged || 0, bad: x.bad || 0, lines: x.lines || 0, prs: x.prs || 0, other: x.other || 0, total: (x.real || 0) + (x.prs || 0) + (x.other || 0) };
  }).sort((a, b) => b.total - a.total || b.lines - a.lines || a.display.localeCompare(b.display));
}

const niceDate = (day: string, L: string) => new Date(day + "T00:00:00Z").toLocaleDateString(L === "fr" ? "fr-FR" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Cron (every minute): daily / weekly GitHub tables at the class's report time, inactive students, brief reminders, clean-up. */
export async function githubCron(env: Env, at = now()) {
  const guilds = await all<GuildRow>(env, "SELECT * FROM guilds WHERE EXISTS (SELECT 1 FROM players p WHERE p.guild_id = guilds.id AND p.github_id IS NOT NULL) OR EXISTS (SELECT 1 FROM briefs b WHERE b.guild_id = guilds.id AND b.status = 'assigned')");
  for (const g of guilds) {
    const cfg = githubCfg(g);
    const d = new Date(at * 1000), hm = d.getUTCHours() * 60 + d.getUTCMinutes();
    const today = dayOf(at);
    if (hm >= cfg.hour * 60 + cfg.minute) {
      if (cfg.daily && cfg.lastDaily !== today && !cfg.skip.includes(weekday(today))) {
        await saveGithubCfg(env, g, { lastDaily: today });
        await sendDaily(env, g, cfg, today).catch((e) => console.error("gh daily", e));
      }
      if (cfg.weekly && cfg.lastWeekly !== today && weekday(today) === cfg.weeklyDay) {
        await saveGithubCfg(env, (await getGuild(env, g.id))!, { lastWeekly: today });
        await sendWeekly(env, g, today).catch((e) => console.error("gh weekly", e));
      }
    }
    if (cfg.reminders && d.getUTCMinutes() % 15 === 0) await briefReminders(env, g, at).catch((e) => console.error("brief reminders", e));
  }
  if (new Date(at * 1000).getUTCHours() === 3 && new Date(at * 1000).getUTCMinutes() === 0) {
    await run(env, "DELETE FROM gh_activity WHERE day < ?", shiftDay(dayOf(at), -60));
    await run(env, "DELETE FROM gh_tokens WHERE exp < ?", at);
  }
}

export async function sendDaily(env: Env, g: GuildRow, cfg = githubCfg(g), today = dayOf(now())) {
  const ch = reportChannel(g, cfg);
  if (!ch) return;
  // the first working day after skipped days (e.g. Monday) also covers them
  let from = today;
  for (let d = shiftDay(today, -1), i = 0; cfg.skip.includes(weekday(d)) && i < 6; d = shiftDay(d, -1), i++) from = d;
  const rows = await scoreRows(env, g, from, today);
  if (!rows.length) return;
  const L = g.lang;
  await postStatsTable((p) => send(env, ch, p), from === today ? t(L, "gh.daily_title", { day: niceDate(today, L) }) : t(L, "gh.days_title", { from: niceDate(from, L), to: niceDate(today, L) }), rows, t(L, from === today ? "gh.in_24h" : "gh.in_days"));
  const act = await activityOf(env, g);
  const idle = act.students.filter((s) => cfg.inactiveDays && s.idle >= cfg.inactiveDays).sort((a, b) => b.idle - a.idle);
  if (idle.length) {
    await send(env, ch, {
      content: t(L, "gh.inactive", { n: cfg.inactiveDays, list: idle.map((s) => `• <@${s.discord_id}> — ${s.idle >= 10 ? "10+" : s.idle} (${s.login})`).join("\n") }).slice(0, 2000),
      allowed_mentions: { parse: [], users: idle.slice(0, 100).map((s) => s.discord_id) },
    });
  }
}
export async function sendWeekly(env: Env, g: GuildRow, today = dayOf(now())) {
  const ch = reportChannel(g, githubCfg(g));
  if (!ch) return;
  const L = g.lang;
  const rows = await scoreRows(env, g, shiftDay(today, -6), today);
  const prev = new Map((await scoreRows(env, g, shiftDay(today, -13), shiftDay(today, -7))).map((r) => [r.discordId, r.total]));
  const oldest = await one<{ d: string }>(env, "SELECT MIN(day) AS d FROM gh_activity WHERE guild_id = ?", g.id);
  const trendOk = !!oldest?.d && oldest.d <= shiftDay(today, -13);
  await postStatsTable((p) => send(env, ch, p), t(L, "gh.weekly_title", { from: niceDate(shiftDay(today, -6), L), to: niceDate(today, L) }),
    rows.map((r) => ({ ...r, trend: trendOk && prev.has(r.discordId) ? r.total - prev.get(r.discordId)! : null })), t(L, "gh.this_week"), 0xd29922, true);
}

// ------------------------------------------------------------- briefs
/** For each student: the first push since the brief started ("on" time, "late", or "none"). */
export async function pushStatus(env: Env, g: GuildRow, b: { start_at: number | null; due_at: number | null; created_at: number }) {
  const start = b.start_at ?? b.created_at, due = b.due_at ?? now() + 86400 * 365;
  const rows = await all<{ discord_id: string; first: number }>(env,
    "SELECT discord_id, MIN(t) AS first FROM gh_activity WHERE guild_id = ? AND t >= ? AND t <= ? AND commits > 0 GROUP BY discord_id", g.id, start, due + 7 * 86400);
  return new Map(rows.map((r) => [r.discord_id, r.first <= due ? "on" : "late"] as [string, "on" | "late"]));
}

/** Reminders of assigned briefs: announced at the start, 3 days and 1 day before, then the final status. */
export async function briefReminders(env: Env, g: GuildRow, at = now()) {
  const ch = reportChannel(g, githubCfg(g));
  if (!ch) return;
  const L = g.lang;
  const briefs = await all<{ id: number; title: string; start_at: number | null; due_at: number | null; created_at: number; sent: string | null; kind: string; squads: string | null }>(env,
    "SELECT id, title, start_at, due_at, created_at, sent, kind, squads FROM briefs WHERE guild_id = ? AND status = 'assigned' AND due_at IS NOT NULL AND due_at > ?", g.id, at - 2 * 86400);
  for (const b of briefs) {
    let sent: Record<string, boolean> = {};
    try { sent = JSON.parse(b.sent || "{}") || {}; } catch { sent = {}; }
    const left = b.due_at! - at;
    const mode = left <= 0 ? (sent.final ? null : "final") : left <= 86400 ? (sent.d1 ? null : "d1") : left <= 3 * 86400 ? (sent.d3 || sent.d1 ? null : "d3") : null;
    if (!mode) continue;
    sent[mode] = true;
    if (mode === "d1") sent.d3 = true;
    await run(env, "UPDATE briefs SET sent = ? WHERE id = ?", JSON.stringify(sent), b.id);
    const students = await all<{ discord_id: string }>(env, "SELECT discord_id FROM players WHERE guild_id = ? AND github_id IS NOT NULL", g.id);
    const st = await pushStatus(env, g, b);
    const handed = new Set((await all<{ who: string }>(env, "SELECT who FROM brief_handins WHERE brief_id = ?", b.id)).map((h) => h.who));
    const done = (id: string) => st.has(id) || handed.has(`u:${id}`);
    const on = students.filter((s) => done(s.discord_id) && st.get(s.discord_id) !== "late"), late = students.filter((s) => st.get(s.discord_id) === "late"), none = students.filter((s) => !done(s.discord_id));
    const who = (l: { discord_id: string }[]) => (l.length ? l.map((s) => `<@${s.discord_id}>`).join(" ") : "—");
    const lines = [t(L, "brief.due_line", { when: `<t:${b.due_at}:F> (<t:${b.due_at}:R>)` }), ""];
    if (mode === "final") lines.push(t(L, "brief.st_on", { n: on.length, list: who(on) }), t(L, "brief.st_late", { n: late.length, list: who(late) }), t(L, "brief.st_none", { n: none.length, list: who(none) }));
    else lines.push(t(L, "brief.st_pushed", { n: on.length + late.length, list: who([...on, ...late]) }), t(L, "brief.st_notyet", { n: none.length, list: who(none) }));
    lines.push("", t(L, "brief.handin_hint"));
    await send(env, ch, {
      ...(mode === "d1" && none.length ? { content: t(L, "brief.last_call", { title: b.title, list: who(none) }).slice(0, 2000), allowed_mentions: { parse: [], users: none.slice(0, 100).map((s) => s.discord_id) } } : {}),
      embeds: [{ color: mode === "final" ? 0x8957e5 : mode === "d1" ? 0xf85149 : 0xd29922, title: t(L, mode === "final" ? "brief.final_title" : "brief.due_title", { title: b.title }), description: lines.join("\n").slice(0, 4000) }],
    }).catch(() => {});
  }
}

/** A repo link → "owner/repo" (as typed: GitHub keeps the capitals). */
export function parseRepo(input: string): string | null {
  const m = String(input || "").trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?github\.com\//i, "").match(/^([\w.-]+)\/([\w.-]+)/);
  return m ? `${m[1]}/${m[2].replace(/\.git$/i, "")}` : null;
}

/** Can the class's GitHub App read this repo for this student? Returns its exact full name, or null. */
export async function canRead(env: Env, guildId: string, inst: string, repo: string): Promise<string | null> {
  try {
    const token = await installationToken(env, await ghAppOf(env, guildId), inst);
    const info = await githubGet(`/repos/${repo}`, token);
    return info?.full_name ?? null;
  } catch { return null; }
}
