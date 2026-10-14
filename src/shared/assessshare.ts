// Share an assessment with other teachers: a link to its questions (not the students' papers). The other teacher
// pastes it in Assessments → Import from a link, on their own ClassBot or this one, and gets a draft copy to adjust.
// The link can be renewed (the old one stops working).
import type { Env, GuildRow } from "./types.ts";
import { now, one } from "./db.ts";
import { signText } from "./integrity.ts";
import { type AssessRow, type Question, cleanQuestion, cleanSettings, questionsOf, saveAssessment, settingsOf } from "./assess.ts";

const base = (env: Env) => (env.PUBLIC_URL || "").replace(/\/$/, "");
const LINK_RX = /^https?:\/\/[^\s/]+(?:\/[^\s]*)?\/share\/assessment\/(\d{1,9})\.([A-Za-z0-9_-]{32})\/?$/;
export class ShareError extends Error {}

async function version(env: Env, id: number): Promise<number> {
  const r = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", `share:a:${id}`).catch(() => null);
  return Number(r?.v) || 1;
}
const sig = (env: Env, id: number, v: number) => signText(env, `share-assess:${id}:${v}`);

/** The link to give other teachers. */
export async function shareLink(env: Env, id: number) {
  return `${base(env)}/share/assessment/${id}.${await sig(env, id, await version(env, id))}`;
}
/** A new link: the old one stops working. */
export async function renewShareLink(env: Env, id: number) {
  await env.DB.prepare("INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at")
    .bind(`share:a:${id}`, String((await version(env, id)) + 1), now()).run();
  return shareLink(env, id);
}

export interface SharedAssessment {
  kind: "classbot-assessment"; v: 1; title: string; from: string; at: number;
  settings: { minutes: number; lang: string; codeLang: string; passAt: number; points: number };
  questions: Question[];
}
/** What the link gives (null if it's wrong or was renewed). */
export async function sharedAssessment(env: Env, id: number, s: string): Promise<SharedAssessment | null> {
  if (s !== (await sig(env, id, await version(env, id)))) return null;
  const a = await one<AssessRow & { gname: string | null }>(env, "SELECT a.*, g.name AS gname FROM assessments a LEFT JOIN guilds g ON g.id = a.guild_id WHERE a.id = ?", id);
  if (!a) return null;
  const st = settingsOf(a);
  return { kind: "classbot-assessment", v: 1, title: a.title, from: a.gname || "ClassBot", at: now(),
    settings: { minutes: st.minutes, lang: st.lang, codeLang: st.codeLang, passAt: st.passAt, points: st.points }, questions: questionsOf(a) };
}

/** Read a shared link: on this ClassBot directly, on another one through the internet. */
async function readLink(env: Env, url: string): Promise<SharedAssessment> {
  const u = String(url || "").trim();
  const m = u.match(LINK_RX);
  if (!m) throw new ShareError("This isn't an assessment link. It looks like https://…/share/assessment/12.Ab3…");
  let data: any = null;
  if (base(env) && u.startsWith(base(env) + "/")) data = await sharedAssessment(env, Number(m[1]), m[2]);
  else {
    if (!u.startsWith("https://")) throw new ShareError("The link must start with https://");
    try {
      const res = await fetch(u.replace(/\/$/, "") + "?json=1", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (res.ok) data = await res.json();
    } catch { throw new ShareError("The other ClassBot didn't answer. Check the link, or try again in a minute."); }
  }
  if (!data || data.kind !== "classbot-assessment" || !Array.isArray(data.questions)) throw new ShareError("This link doesn't work anymore (it was renewed or the assessment was deleted). Ask for a new one.");
  return data as SharedAssessment;
}

/** Preview (what will be imported) or import as a draft in this class. */
export async function importShared(env: Env, g: GuildRow, url: string, doImport: boolean) {
  const d = await readLink(env, url);
  const qs = d.questions.slice(0, 60).map((q, i) => cleanQuestion({ ...q, id: undefined }, i)).filter(Boolean) as Question[];
  if (!qs.length) throw new ShareError("This assessment has no questions.");
  const count = (t: string) => qs.filter((q) => q.type === t).length;
  const comps = [...new Set(qs.flatMap((q) => (q.comps ?? []).map((c) => c.code)))];
  const preview = { title: String(d.title || "Assessment").slice(0, 120), from: String(d.from || "").slice(0, 80), n: qs.length, code: count("code"), explain: count("explain"), mcq: count("mcq"),
    points: qs.reduce((s, q) => s + q.points, 0), minutes: Number(d.settings?.minutes) || 0, comps, prompts: qs.slice(0, 5).map((q) => q.prompt.slice(0, 140)) };
  if (!doImport) return { preview };
  const id = await saveAssessment(env, g, null, { title: preview.title, questions: qs, settings: { ...d.settings, target: [] } });
  return { preview, id };
}

/** GET /share/assessment/<id>.<sig>: JSON for ClassBot, a small page for a teacher who opens it in a browser. */
export async function sharePage(request: Request, env: Env, id: number, s: string): Promise<Response> {
  const d = await sharedAssessment(env, id, s);
  const url = new URL(request.url);
  const wantsJson = url.searchParams.has("json") || !(request.headers.get("accept") || "").includes("text/html");
  if (wantsJson) return Response.json(d ?? { error: "This link doesn't work anymore." }, { status: d ? 200 : 404, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
  const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const body = d ? `<h1>📝 ${esc(d.title)}</h1><p class="from">Shared by ${esc(d.from)} · ${d.questions.length} questions${d.settings.minutes ? ` · ${d.settings.minutes} min` : ""}</p>
    <ol>${d.questions.slice(0, 8).map((q) => `<li>${esc(q.prompt.slice(0, 160))}</li>`).join("")}${d.questions.length > 8 ? "<li>…</li>" : ""}</ol>
    <div class="how"><b>To use it in your class</b><br>Open your ClassBot dashboard → <b>Assessments</b> → <b>Import from a link</b>, and paste this page's address.
    <button onclick="navigator.clipboard.writeText(location.href.split('?')[0]).then(()=>this.textContent='Copied ✓')">Copy the link</button></div>`
    : `<h1>Link expired</h1><p>This assessment link was renewed or deleted. Ask the teacher for a new one.</p>`;
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${d ? esc(d.title) : "Link expired"} · ClassBot</title>
<style>:root{color-scheme:light dark}body{font:16px/1.55 system-ui,sans-serif;margin:0;padding:24px 16px;background:#f5f8ff;color:#0f172a}main{max-width:680px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:26px}
h1{margin:0 0 4px;font-size:24px}.from{color:#64748b;margin:0 0 14px}ol{padding-left:20px;color:#334155}li{margin:6px 0}.how{margin-top:18px;background:#eef4ff;border-radius:12px;padding:14px}
button{margin-top:10px;font:inherit;font-weight:600;border:0;border-radius:10px;padding:8px 14px;background:#2563eb;color:#fff;cursor:pointer}
@media (prefers-color-scheme:dark){body{background:#0b1220;color:#e5ecff}main{background:#111a2e;border-color:#22304d}ol{color:#cbd5e1}.from{color:#94a3b8}.how{background:#16223d}}</style></head>
<body><main>${body}</main></body></html>`, { status: d ? 200 : 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
