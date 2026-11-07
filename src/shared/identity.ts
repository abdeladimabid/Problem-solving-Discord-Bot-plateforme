// Who is really answering: an assessment (/quiz/<token>) or a mise en situation (/mes/<token>) sent by DM can be
// forwarded to someone else. So:
//   1. Sign in with Discord (always on, mandatory): the page opens only after « Se connecter avec Discord » with the
//      Discord account the link was sent to. Discord's implicit grant (scope identify): no secret to set up, only the
//      redirect address <PUBLIC_URL>/auth/discord added once in the Discord Developer Portal (OAuth2 → Redirects).
//   2. One device per paper (option, on by default): the browser that signed in is the paper's device; signing in on
//      another one stops a started session (like leaving full screen) until the teacher lets them back in.
//   3. Network alerts (option, on by default): the connections each paper was opened from, for the teacher's live view:
//      opened from outside the class's network (where most of the class is), or from several networks.
// Each paper's record: app_settings `ident:<quiz|mes>:<takerId>` → { uid, devices, ips }.
import type { Env } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { staffIds } from "./staff.ts";

export type IdentKind = "quiz" | "mes";
export interface IdentRec { uid: string; devices: string[]; ips: { ip: string; at: number }[]; at: number }
const KEY = (k: IdentKind, id: number) => `ident:${k}:${id}`;
const DEV = /^[A-Za-z0-9_-]{16,64}$/;

export const redirectUri = (env: Env) => `${(env.PUBLIC_URL || "").replace(/\/$/, "")}/auth/discord`;
/** The Discord sign-in address for a paper (state = which paper; Discord gives the token back in the address). */
export const signInUrl = (env: Env, kind: IdentKind, token: string) =>
  `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(env.DISCORD_APP_ID)}&response_type=token&scope=identify&redirect_uri=${encodeURIComponent(redirectUri(env))}&state=${encodeURIComponent(`${kind}~${token}`)}`;

export async function identOf(env: Env, kind: IdentKind, takerId: number): Promise<IdentRec | null> {
  const r = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", KEY(kind, takerId)).catch(() => null);
  try { const v = r ? JSON.parse(r.v) : null; return v && typeof v === "object" ? { uid: String(v.uid ?? ""), devices: Array.isArray(v.devices) ? v.devices.map(String) : [], ips: Array.isArray(v.ips) ? v.ips : [], at: Number(v.at) || 0 } : null; } catch { return null; }
}
async function saveIdent(env: Env, kind: IdentKind, takerId: number, rec: IdentRec) {
  await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", KEY(kind, takerId), JSON.stringify(rec), now());
}
const ipOf = (req: Request) => String(req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "").slice(0, 45);
/** Has this browser signed in for this paper? (its device id, sent by the page in « x-cb-dev ») */
export async function identOk(env: Env, kind: IdentKind, takerId: number, req: Request): Promise<boolean> {
  const dev = String(req.headers.get("x-cb-dev") || "");
  if (!DEV.test(dev)) return false;
  const rec = await identOf(env, kind, takerId);
  return !!rec && rec.devices.includes(dev);
}
/**
 * A paper sent to a teacher (staff) is a test: it opens without the Discord sign-in, one device per paper doesn't
 * apply. A forwarded link of a teacher's paper opens their test, never a learner's paper.
 */
export async function staffPaper(env: Env, kind: IdentKind, takerId: number): Promise<boolean> {
  const t = await one<{ guild_id: string; discord_id: string }>(env, `SELECT guild_id, discord_id FROM ${kind === "mes" ? "mise_takers" : "assessment_takers"} WHERE id = ?`, takerId).catch(() => null);
  return !!t && (await staffIds(env, t.guild_id)).has(t.discord_id);
}
/** A new attempt of a paper (« Réassigner »): its sign-in starts again (the record is archived with the old attempt). */
export async function forgetIdent(env: Env, kind: IdentKind, takerId: number) {
  await run(env, "DELETE FROM app_settings WHERE k = ?", KEY(kind, takerId));
}
/** Write down the connection a paper is used from (at most 8, the last ones). */
export async function noteIp(env: Env, kind: IdentKind, takerId: number, req: Request) {
  const ip = ipOf(req), rec = await identOf(env, kind, takerId);
  if (!ip || !rec) return;
  const last = rec.ips[rec.ips.length - 1];
  if (last && last.ip === ip) return;
  rec.ips = [...rec.ips.filter((x) => x.ip !== ip), { ip, at: now() }].slice(-8);
  await saveIdent(env, kind, takerId, rec);
}

/** The Discord account behind a token from the sign-in (null when Discord refuses it). */
export async function discordUser(token: string): Promise<{ id: string; username: string } | null> {
  if (!/^[A-Za-z0-9._-]{6,200}$/.test(token)) return null;
  try {
    const r = await fetch("https://discord.com/api/v10/users/@me", { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    return j?.id ? { id: String(j.id), username: String(j.username || "") } : null;
  } catch { return null; }
}

/**
 * After « Se connecter avec Discord »: the account must be the one the link was sent to. This browser becomes the
 * paper's device; with « one device per paper », a different browser on a started paper stops it (`switched`).
 */
export async function signIn(env: Env, kind: IdentKind, takerId: number, expectUid: string, user: { id: string }, dev: string, req: Request, o: { oneDevice: boolean; started: boolean }) {
  if (!DEV.test(dev)) return { ok: false as const, error: "device" };
  if (user.id !== expectUid) return { ok: false as const, error: "wrong-account" };
  const rec = (await identOf(env, kind, takerId)) ?? { uid: user.id, devices: [], ips: [], at: now() };
  const known = rec.devices.includes(dev);
  const switched = o.oneDevice && o.started && rec.devices.length > 0 && !known;
  rec.uid = user.id;
  rec.devices = o.oneDevice ? [dev] : [...rec.devices.filter((x) => x !== dev), dev].slice(-5);
  const ip = ipOf(req);
  if (ip) rec.ips = [...rec.ips.filter((x) => x.ip !== ip), { ip, at: now() }].slice(-8);
  rec.at = now();
  await saveIdent(env, kind, takerId, rec);
  return { ok: true as const, switched };
}

// ------------------------------------------------------------------ network alerts
/** The network part of an address: the first 3 parts of an IPv4, the first 3 groups of an IPv6. */
export const netOf = (ip: string) => (ip.includes(":") ? ip.split(":").slice(0, 3).join(":") : ip.split(".").slice(0, 3).join("."));
export interface NetFlag { nets: number; outside: boolean; last: string | null }
/**
 * For each paper of a session: how many networks it was opened from, and whether its last one is outside the class's
 * network (the one most papers come from, when at least 3 papers say so).
 */
export async function netFlags(env: Env, kind: IdentKind, takerIds: number[]): Promise<Record<number, NetFlag>> {
  if (!takerIds.length) return {};
  const rows = await all<{ k: string; v: string }>(env, `SELECT k, v FROM app_settings WHERE k IN (${takerIds.map(() => "?").join(",")})`, ...takerIds.map((id) => KEY(kind, id))).catch(() => []);
  const recs = new Map<number, IdentRec>();
  for (const r of rows) { try { const v = JSON.parse(r.v); recs.set(Number(r.k.split(":").pop()), { uid: v.uid, devices: v.devices ?? [], ips: Array.isArray(v.ips) ? v.ips : [], at: v.at }); } catch { /* skip */ } }
  const count = new Map<string, number>();
  for (const rec of recs.values()) for (const n of new Set(rec.ips.map((x) => netOf(x.ip)))) count.set(n, (count.get(n) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  const classNet = top && top[1] >= 3 ? top[0] : null;
  const out: Record<number, NetFlag> = {};
  for (const [id, rec] of recs) {
    const nets = new Set(rec.ips.map((x) => netOf(x.ip)));
    const last = rec.ips[rec.ips.length - 1]?.ip ?? null;
    out[id] = { nets: nets.size, outside: !!(classNet && last && netOf(last) !== classNet), last: last ? netOf(last) : null };
  }
  return out;
}

// ------------------------------------------------------------------ the pages
/** What every paper page shows before it can be opened: who must sign in, and the button. */
export const SIGN_IN_FR = { title: "Connecte-toi avec Discord", text: "Ce lien est personnel : pour l’ouvrir, connecte-toi avec le compte Discord qui l’a reçu en message privé.", btn: "Se connecter avec Discord" };

/** /auth/discord: Discord sends the browser back here with the token in the address (#access_token=…&state=…). */
export const AUTH_PAGE = String.raw`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Connexion · ClassBot</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7fc;color:#0f1d3a;font:16px/1.55 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme:dark){body{background:#0b1222;color:#e7edf8}.c{background:#111a2e!important;border-color:#22304d!important}}
.c{max-width:460px;margin:20px;padding:28px;border-radius:18px;background:#fff;border:1px solid #dfe6f2;text-align:center}h1{font-size:21px;margin:8px 0}p{color:#64748b}
a.b{display:inline-block;margin-top:10px;padding:11px 20px;border-radius:12px;background:#5865f2;color:#fff;text-decoration:none;font-weight:650}</style></head>
<body><div class="c" id="c"><div style="font-size:40px">⏳</div><h1>Connexion…</h1><p>Vérification de ton compte Discord.</p></div>
<script>
(function () {
  var c = document.getElementById("c");
  var h = new URLSearchParams(location.hash.slice(1)), q = new URLSearchParams(location.search);
  var state = h.get("state") || q.get("state") || "", tok = h.get("access_token") || "";
  history.replaceState(null, "", location.pathname);
  var m = /^(quiz|mes)~([0-9]+\.[0-9]+\.[A-Za-z0-9_-]{32})$/.exec(state);
  var back = m ? "/" + m[1] + "/" + m[2] : "";
  var show = function (ico, t, p, link) { c.innerHTML = '<div style="font-size:40px">' + ico + "</div><h1>" + t + "</h1><p>" + p + "</p>" + (link ? '<a class="b" href="' + link + '">Réessayer</a>' : ""); };
  if (!m) return show("🔗", "Lien incomplet", "Rouvre le lien reçu par message privé.");
  if (!tok) return show("✋", "Connexion annulée", "Pour ouvrir ce lien, il faut te connecter avec ton compte Discord.", back);
  var dev = ""; try { dev = localStorage.getItem("cb-dev") || ""; if (!dev) { dev = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/[^A-Za-z0-9]/g, ""); localStorage.setItem("cb-dev", dev); } } catch (e) {}
  if (!dev) return show("⚠️", "Navigateur bloqué", "Ton navigateur bloque le stockage local (navigation privée ?) : ouvre le lien dans une fenêtre normale.");
  fetch("/auth/discord", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: state, token: tok, dev: dev }) })
    .then(function (r) { return r.json(); })
    .then(function (r) {
      if (r && r.ok) { location.replace(back); return; }
      var e = r && r.error;
      if (e === "wrong-account") return show("🚫", "Ce lien n’est pas à toi", "Il a été envoyé à un autre compte Discord. Connecte-toi avec le compte qui l’a reçu (déconnecte-toi de Discord dans ce navigateur si besoin).", back);
      if (e === "expired") return show("🔗", "Ce lien a expiré", "Demande un nouveau lien à ton formateur.");
      show("⚠️", "Connexion impossible", "Discord n’a pas confirmé ton compte. Réessaie.", back);
    }, function () { show("📶", "Pas de connexion", "Vérifie ta connexion internet et réessaie.", back); });
})();
</script></body></html>`;
