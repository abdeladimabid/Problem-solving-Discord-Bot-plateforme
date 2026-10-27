// A squad debrief, student by student: what ClassBot knows about each member, to fill their card.
//   • their assessment(s) linked to the brief: score, the questions missed, the grader's summary (their comment starts
//     from it), the competencies it validated
//   • AI flags: their VS Code days during the brief (« à vérifier » signals) and their own commits on the squad's repo
//     (very big, faster than typing…)
//   • questions to ask them: the notions they missed in the assessment, the code the flags point at
//   • suggested competency switches, each with its reason: technical ones from their assessment, CT1 / CT2 from their
//     part of the project, CT5 from the links they shared in Discord during the brief, CT6 from their mise en situation
//   • on demand: the links they shared in Discord (read from the channels), and which lines of their commits an AI wrote
//     (each commit's files against their VS Code heartbeats since the commit before)
// Facts and suggestions only: the teacher decides, and what they set is kept.
import type { Env, GuildRow, PlayerRow } from "../types.ts";
import { all, now } from "../db.ts";
import { dapi } from "../discord.ts";
import { assessBase } from "./engine.ts";
import { pushSignals } from "./aicheck.ts";
import { dayClock, dayOf, sameProject, signals as vscSignals, unpackRaw } from "../vscode.ts";
import { parseAgg } from "../vscodedb.ts";
import { githubGet, installationToken } from "./gh.ts";
import { ghAppOf, githubCanRead } from "../github.ts";
import { askReview } from "./debrief.ts";
import type { BriefCtx } from "./debrief.ts";

export interface MemberAssess { aid: number; title: string; taker: number | null; status: string; score: number | null; summary: string; total: number;
  missed: { n: number; prompt: string; verdict: string; comps: string[] }[] }
export interface MemberFlag { kind: "vscode" | "commits"; label: string; detail: string; url?: string }
export interface MemberQuestion { q: string; why: string; from: "assessment" | "ai" }
export interface MemberHint { on: boolean; why: string }
export interface MemberInsight { assess: MemberAssess[]; flags: MemberFlag[]; questions: MemberQuestion[]; hints: Record<string, MemberHint>; vscode: boolean; links: LinkRow[] | null;
  /** precise oral questions on the notions behind each question they missed (written once by the AI, kept in the debrief) */
  probes: Probe[] | null; probeKey: string }
/** A key notion they don't master (seen in one or several missed questions), checked by one or two short oral questions. */
export interface Probe { aid: number; ns: number[]; verdict: string; notion: string; qs: string[] }
const PROBE_V = "v2|";
const MAX_NOTIONS = 4, MAX_QS = 2;
export interface LinkRow { url: string; channel: string; at: number }
export interface LinksScan { at: number; from: number; to: number; byMember: Record<string, LinkRow[]>; scanned: number; hidden: boolean; error?: string }

const line1 = (s: unknown, n = 160) => String(s ?? "").split("\n").map((x) => x.trim()).filter(Boolean)[0]?.slice(0, n) ?? "";
const hm = (t: number) => new Date(t * 1000).toLocaleTimeString("en-GB", { timeZone: "Africa/Casablanca", hour: "2-digit", minute: "2-digit" });
const compsOf = (q: any): string[] => (Array.isArray(q?.comps) ? q.comps : q?.comp ? [q.comp] : [])
  .map((c: any) => assessBase(typeof c === "string" ? c : c?.code ?? "")).filter(Boolean);
const VERDICT: Record<string, string> = { partial: "Partly right", wrong: "Wrong", empty: "Not answered", unanswered: "Not answered" };
export const verdictLabel = (v: string) => VERDICT[v] || "Wrong";
const span = (b: BriefCtx) => ({ from: b.start - 86400, to: (b.due || now()) + 7 * 86400 });

/** Every member's card data (everything but the Discord scan and the AI lines, which are read on demand). */
export async function memberInsights(env: Env, g: GuildRow, b: BriefCtx, rec: any): Promise<Record<string, MemberInsight>> {
  const contrib: any[] = Array.isArray(rec?.contrib) ? rec.contrib : [];
  const ids = contrib.map((m) => String(m.gid));
  const out: Record<string, MemberInsight> = {};
  if (!ids.length) return out;
  const qs = (_n: number) => ids.map(() => "?").join(",");
  const repo = String((rec.repos || [])[0] || "");
  const { from, to } = span(b);

  // 1. the assessments of the brief, each member's own paper
  const list = await all<{ id: number; title: string; questions: string | null }>(env, "SELECT id, title, questions FROM assessments WHERE brief_id = ? ORDER BY id", b.id).catch(() => []);
  const takers = list.length ? await all<{ id: number; assessment_id: number; discord_id: string; status: string; score: number | null; grades: string | null; answers: string | null; summary: string | null }>(env,
    `SELECT id, assessment_id, discord_id, status, score, grades, answers, summary FROM assessment_takers WHERE assessment_id IN (${list.map(() => "?").join(",")}) AND discord_id IN (${qs(ids.length)})`,
    ...list.map((a) => a.id), ...ids).catch(() => []) : [];
  const crows = list.length ? await all<{ discord_id: string; code: string; ok: number; ref: string }>(env,
    `SELECT discord_id, code, ok, ref FROM competency_results WHERE source = 'assessment' AND ref IN (${list.map(() => "?").join(",")}) AND discord_id IN (${qs(ids.length)})`,
    ...list.map((a) => String(a.id)), ...ids).catch(() => []) : [];

  // 2. VS Code days during the brief, and each member's commits
  const d0 = dayOf(b.start), d1 = dayOf(Math.min(b.due || now(), now()));
  const days = d1 >= d0 ? await all<{ discord_id: string; day: string; agg: string | null }>(env,
    `SELECT discord_id, day, agg FROM vsc_days WHERE guild_id = ? AND day >= ? AND day <= ? AND discord_id IN (${qs(ids.length)})`, g.id, d0, d1, ...ids).catch(() => []) : [];
  const commits = await all<{ id: string; discord_id: string; t: number; repo: string | null; title: string | null; adds: number | null; dels: number | null; files: number | null; size: string | null; url: string | null; branch: string | null }>(env,
    `SELECT id, discord_id, t, repo, title, adds, dels, files, size, url, branch FROM gh_log WHERE guild_id = ? AND kind = 'commit' AND t >= ? AND t <= ? AND discord_id IN (${qs(ids.length)}) ORDER BY t`,
    g.id, from, to, ...ids).catch(() => []);
  const scan: LinksScan | null = rec.links && rec.links.byMember ? rec.links : null;

  for (const m of contrib) {
    const gid = String(m.gid), ms = (rec.members || {})[gid] || {};
    // assessment
    const assess: MemberAssess[] = [];
    for (const a of list) {
      const t = takers.find((x) => x.assessment_id === a.id && x.discord_id === gid);
      let questions: any[] = [], grades: Record<string, any> = {};
      try { questions = JSON.parse(a.questions || "[]"); } catch { questions = []; }
      try { grades = JSON.parse(t?.grades || "{}") || {}; } catch { grades = {}; }
      const graded = t?.status === "graded";
      const missed = graded ? questions.map((q, k) => ({ q, k, gr: grades[q.id] }))
        .filter((x) => !x.gr || x.gr.verdict !== "correct")
        .map((x) => ({ n: x.k + 1, prompt: line1(x.q.prompt), verdict: String(x.gr?.verdict || "unanswered"), comps: compsOf(x.q) })) : [];
      assess.push({ aid: a.id, title: a.title, taker: t?.id ?? null, status: t?.status ?? "not invited", score: graded ? t!.score ?? null : null,
        summary: graded ? String(t?.summary || "").trim() : "", total: questions.length, missed });
    }
    // AI flags: VS Code (« à vérifier » days) and their commits on the repo
    const flags: MemberFlag[] = [];
    const mine = commits.filter((c) => c.discord_id === gid);
    for (const r of days.filter((x) => x.discord_id === gid)) {
      for (const s of vscSignals(r.day, parseAgg(r.agg), mine.filter((c) => dayOf(c.t) === r.day))) {
        if (s.kind === "ai_share") flags.push({ kind: "vscode", label: "AI in VS Code", detail: `${s.day}: ${s.pct}% of the lines changed came from an AI (${s.n} lines)` });
        else if (s.kind === "commit_little_writing") flags.push({ kind: "vscode", label: "Committed, little writing", detail: `${s.day}: ${s.n} lines committed on ${s.project}, with ${s.minutes} min of writing on it that day` });
        else if (s.kind === "big_insert") flags.push({ kind: "vscode", label: "Big insertion", detail: `${s.day} ${s.t ? hm(s.t) : ""}: +${s.n} lines at once${s.file ? ` in ${s.file}` : ""}${s.project ? ` (${s.project})` : ""}` });
      }
    }
    const onRepo = mine.filter((c) => c.size !== "merge" && c.adds != null && (!repo || String(c.repo || "").toLowerCase() === repo.toLowerCase()));
    const push = pushSignals(onRepo.map((c) => ({ id: c.id, t: c.t, title: c.title || "", adds: c.adds || 0, dels: c.dels || 0, files: c.files || 0, repo: c.repo || repo, branch: c.branch || "", main: repo })));
    for (const s of push.signals) flags.push({ kind: "commits", label: s.label, detail: s.detail });
    // questions to ask: what they missed, then what the flags point at
    const questions: MemberQuestion[] = [];
    for (const a of assess) for (const x of a.missed.slice(0, 4)) questions.push({ q: x.prompt, why: `${verdictLabel(x.verdict)} in the assessment (question ${x.n})`, from: "assessment" });
    for (const p of push.parts.slice(0, 2)) questions.push({ q: `Explique-moi ce que fait ${p.where.replace(/^commit [0-9a-f]+ /, "ce commit ")} et comment tu l'as écrit.`, why: p.why, from: "ai" });
    if (flags.some((f) => f.label === "AI in VS Code")) questions.push({ q: "Montre-moi une partie du code que l'IA a écrite pour toi et explique-la ligne par ligne, puis modifie-la devant moi.", why: "An AI wrote a large part of their lines in VS Code", from: "ai" });
    // suggested switches, with their reason
    const hints: Record<string, MemberHint> = {};
    const codes = Object.keys(ms.co || {}).length ? Object.keys(ms.co) : (rec.result?.competences || []).map((x: any) => x.code);
    for (const code of codes) {
      const base = assessBase(code);
      if (base.startsWith("C")) {
        const rs = crows.filter((r) => r.discord_id === gid && assessBase(r.code) === base);
        if (rs.length) hints[code] = { on: rs.every((r) => !!r.ok), why: rs.every((r) => !!r.ok) ? "Validated in their assessment" : "Not validated in their assessment" };
      } else if (base === "T1") {
        hints[code] = (m.days || 0) >= 2 && (m.commits || 0) >= 3
          ? { on: true, why: `Worked on ${m.days} days (${m.commits} commits)` } : { on: false, why: m.commits ? `Commits on ${m.days || 1} day(s) only` : "No commit in the squad's repo" };
      } else if (base === "T2") {
        const collab = (m.prs || 0) + (m.reviews || 0) + (m.cardsDone || 0);
        hints[code] = collab ? { on: true, why: [m.prs ? `${m.prs} PR` : "", m.reviews ? `${m.reviews} reviews` : "", m.cardsDone ? `${m.cardsDone} cards done` : ""].filter(Boolean).join(", ") }
          : { on: false, why: "No PR, review or planning card" };
      } else if (base === "T5" && scan) {
        const n = (scan.byMember[gid] || []).length;
        if (!scan.hidden || n) hints[code] = n ? { on: true, why: `${n} link${n > 1 ? "s" : ""} shared on Discord during the brief` } : { on: false, why: "No link shared on Discord during the brief" };
      } else if (base === "T6") {
        const r = ms.mes?.r;
        if (r === "valide") hints[code] = { on: true, why: "Mise en situation: validated" };
        else if (r === "non_valide") hints[code] = { on: false, why: "Mise en situation: not validated" };
      }
    }
    const probeKey = PROBE_V + assess.flatMap((a) => a.missed.map((x) => `${a.aid}:${x.n}:${x.verdict}`)).join(",");
    const kept = rec.probes?.[gid];
    const probes: Probe[] | null = kept && kept.key === probeKey && Array.isArray(kept.items) && kept.items.length ? kept.items : null;
    out[gid] = { assess, flags, questions: questions.slice(0, 7), hints, vscode: days.some((x) => x.discord_id === gid), links: scan ? scan.byMember[gid] || [] : null, probes, probeKey };
  }
  return out;
}

// ------------------------------------------------------------------ CT5: the links they shared in Discord
// ClassBot answers commands only: it never keeps the server's messages. Here it reads the channels' messages of the
// brief's dates through Discord (the bot needs View Channel + Read Message History; the text of the messages needs the
// Message Content intent, else Discord sends it empty: then « hidden » is true and nothing is counted).
const DISCORD_EPOCH = 1420070400000n;
const snowflake = (unix: number) => String((BigInt(Math.floor(unix * 1000)) - DISCORD_EPOCH) << 22n);
const URL_RE = /https?:\/\/[^\s<>()"']+/g;
export async function scanLinks(env: Env, g: GuildRow, members: string[], from: number, to: number): Promise<LinksScan> {
  const res: LinksScan = { at: now(), from, to, byMember: Object.fromEntries(members.map((m) => [m, []])), scanned: 0, hidden: false };
  let channels: any[] = [];
  try {
    channels = ((await dapi<any[]>(env, "GET", `/guilds/${g.id}/channels`)) || []).filter((c) => c.type === 0 || c.type === 5);
    const th = await dapi<any>(env, "GET", `/guilds/${g.id}/threads/active`).catch(() => null);
    channels.push(...((th?.threads || []) as any[]));
  } catch (e) { return { ...res, error: `Discord didn't list the channels (${String((e as Error)?.message ?? e).slice(0, 80)})` }; }
  const mine = new Set(members);
  let withText = 0, ofMembers = 0;
  for (const ch of channels.slice(0, 40)) {
    let before = snowflake(Math.min(to, now()));
    for (let page = 0; page < 5; page++) {
      let msgs: any[] = [];
      try { msgs = (await dapi<any[]>(env, "GET", `/channels/${ch.id}/messages?limit=100&before=${before}`)) || []; } catch { break; }   // no access: next channel
      if (!msgs.length) break;
      for (const msg of msgs) {
        const at = Math.floor(Date.parse(msg.timestamp) / 1000);
        if (at < from || at > to) continue;
        res.scanned++;
        if (!mine.has(String(msg.author?.id))) continue;
        ofMembers++;
        const text = String(msg.content || "");
        if (text) withText++;
        const urls = new Set<string>([...(text.match(URL_RE) || []), ...((msg.embeds || []) as any[]).map((e) => e?.url).filter(Boolean)]);
        for (const u of urls) res.byMember[String(msg.author.id)].push({ url: String(u).slice(0, 300), channel: String(ch.name || ""), at });
      }
      const last = Math.floor(Date.parse(msgs[msgs.length - 1].timestamp) / 1000);
      if (last < from || msgs.length < 100) break;
      before = msgs[msgs.length - 1].id;
    }
  }
  // their messages came without any text: Discord hides it (Message Content intent off)
  res.hidden = ofMembers >= 3 && withText === 0;
  for (const k of Object.keys(res.byMember)) res.byMember[k] = res.byMember[k].sort((a, b) => a.at - b.at).slice(0, 30);
  return res;
}

// ------------------------------------------------------------------ the AI lines of a member's commits
// WakaTime never sends code: only how many lines of a file changed, by an AI or by the learner. The commit has the lines.
// So each file of each commit is matched with that learner's heartbeats on that file since their commit before: all the
// changes came from an AI → its added lines are « AI »; all from them → « typed »; both → « partly AI » with the share.
export interface AiLineFile { file: string; adds: number; ai: number; hu: number; pct: number | null; label: "ai" | "typed" | "mixed" | "unknown"; lines: string[]; more: number }
export interface AiLineCommit { sha: string; url: string | null; title: string; t: number; files: AiLineFile[] }
const normPath = (s: string) => String(s || "").replace(/\\/g, "/").replace(/^\.?\//, "").toLowerCase();
const samePath = (a: string, b: string) => { const x = normPath(a), y = normPath(b); return !!x && !!y && (x === y || x.endsWith("/" + y) || y.endsWith("/" + x)); };
export function attribute(ai: number, hu: number): { pct: number | null; label: AiLineFile["label"] } {
  if (ai + hu <= 0) return { pct: null, label: "unknown" };
  const pct = Math.round((100 * ai) / (ai + hu));
  return { pct, label: pct >= 80 ? "ai" : pct <= 20 ? "typed" : "mixed" };
}
export async function aiLines(env: Env, g: GuildRow, b: BriefCtx, rec: any, gid: string) {
  const repo = String((rec.repos || [])[0] || "");
  if (!repo) return { repo, vscode: false, commits: [] as AiLineCommit[], note: "This debrief has no repo yet: analyze the work first." };
  const { from, to } = span(b);
  const commits = (await all<{ id: string; t: number; title: string | null; url: string | null; repo: string | null; size: string | null }>(env,
    "SELECT id, t, title, url, repo, size FROM gh_log WHERE guild_id = ? AND discord_id = ? AND kind = 'commit' AND t >= ? AND t <= ? ORDER BY t", g.id, gid, from, to).catch(() => []))
    .filter((c) => c.size !== "merge" && String(c.repo || "").toLowerCase() === repo.toLowerCase() && /^[0-9a-f]{40}$/.test(c.id));
  if (!commits.length) return { repo, vscode: false, commits: [] as AiLineCommit[], note: "No commit of theirs on the squad's repo during the brief (from GitHub's webhook)." };
  // their heartbeats of those days
  const d0 = dayOf(commits[0].t - 7 * 86400), d1 = dayOf(commits[commits.length - 1].t);
  const rows = await all<{ day: string; raw: string | null }>(env, "SELECT day, raw FROM vsc_days WHERE guild_id = ? AND discord_id = ? AND day >= ? AND day <= ? AND raw IS NOT NULL", g.id, gid, d0, d1).catch(() => []);
  const hbs = rows.flatMap((r) => unpackRaw(r.raw, dayClock(r.day).start)).filter((h) => sameProject(h.p, repo) && h.lc).sort((x, y) => x.t - y.t);
  // a token that can read the repo: theirs, else a squad mate's
  const app = await ghAppOf(env, g.id);
  if (!githubCanRead(app)) return { repo, vscode: hbs.length > 0, commits: [] as AiLineCommit[], note: "Set up the class's GitHub App first (dashboard → GitHub)." };
  const ids = [gid, ...((rec.contrib || []) as any[]).map((m) => String(m.gid)).filter((x) => x !== gid)];
  const players = await all<PlayerRow>(env, `SELECT * FROM players WHERE guild_id = ? AND discord_id IN (${ids.map(() => "?").join(",")})`, g.id, ...ids);
  let token = "";
  for (const id of ids) { const p = players.find((x) => x.discord_id === id && x.gh_inst); if (!p) continue; try { token = await installationToken(env, app, p.gh_inst!); break; } catch { /* the next one */ } }
  if (!token) return { repo, vscode: hbs.length > 0, commits: [] as AiLineCommit[], note: "Can't read the repo: nobody in the squad has linked GitHub (/github)." };
  const out: AiLineCommit[] = [];
  const list = commits.slice(-12);
  for (let i = 0; i < list.length; i++) {
    const c = list[i], prevT = i ? list[i - 1].t : (commits[commits.indexOf(c) - 1]?.t ?? b.start - 86400);
    const d = await githubGet(`/repos/${repo}/commits/${c.id}`, token).catch(() => null);
    if (!d) continue;
    const win = hbs.filter((h) => h.t > prevT && h.t <= c.t + 120);
    const files: AiLineFile[] = [];
    for (const f of ((d.files || []) as any[]).filter((x) => (x.additions || 0) > 0).slice(0, 8)) {
      const name = String(f.filename || "");
      const mine = win.filter((h) => (h.f ? samePath(h.f, name) : true));
      const ai = mine.reduce((s, h) => s + Math.max(0, h.ai), 0), hu = mine.reduce((s, h) => s + Math.max(0, h.hu), 0);
      const added = String(f.patch || "").split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
      files.push({ file: name, adds: f.additions || 0, ai, hu, ...attribute(ai, hu), lines: added.slice(0, 60), more: Math.max(0, added.length - 60) });
    }
    if (files.length) out.push({ sha: c.id, url: c.url || `https://github.com/${repo}/commit/${c.id}`, title: line1(c.title, 120), t: c.t, files });
  }
  return { repo, vscode: hbs.length > 0, commits: out.reverse(), note: hbs.length ? "" : "No VS Code data for them on this repo during the brief: the lines can't be told apart (they may not use the VS Code tracking)." };
}
export const _test = { snowflake, samePath };

// ------------------------------------------------------------------ precise questions on what they missed
// A question missed in the assessment says little by itself (« partly right on the navbar question »): the AI reads the
// question, the expected answer, their answer and the grader's comment, and writes short direct oral questions, each on
// ONE notion the question relies on, so the teacher finds out exactly what they don't understand.
const PROBE_SYSTEM = [
  "Tu es formateur du titre professionnel Développeur Web et Web Mobile (DWWM). Tu prépares l'oral d'un apprenant de première année : quelques minutes, pas un interrogatoire.",
  "Lis toutes les questions qu'il a ratées, sa réponse et la correction. Choisis AU PLUS 4 notions : les plus importantes, celles qui reviennent dans plusieurs questions ratées, et celles sans lesquelles il ne peut pas progresser (les bases avant les détails).",
  "Ignore les détails secondaires et la culture générale (SEO, accessibilité théorique, unités conseillées, variantes de syntaxe…) sauf si c'est le cœur de ce qu'il a raté.",
  "Pour chaque notion, écris 1 ou 2 questions orales courtes et directes, chacune sur UNE idée précise, qui montrent s'il la comprend vraiment.",
  "Exemples du ton attendu : « Sur quel élément applique-t-on display: flex : le conteneur ou ses enfants ? » ; « Que fait justify-content: space-evenly ? En quoi est-ce différent de space-between et de space-around ? ».",
  "Interdit : reformuler la question d'origine, demander de refaire l'exercice, donner un thème ou un contexte, poser une question vague (« Explique Flexbox »), poser deux fois la même question sous une autre forme.",
  "Tout est en français, quelle que soit la langue de l'évaluation. Le code (propriétés, balises, commandes) reste tel quel, entre `accents graves`.",
  'Réponds en JSON, les notions de la plus importante à la moins importante : {"items":[{"notion":"<la notion en 2 à 6 mots>","ns":[<numéros des questions ratées où elle manque>],"qs":["…"]}]}',
].join("\n");

const answerText = (q: any, a: unknown): string => {
  if (a == null || a === "") return "(pas de réponse)";
  if (q?.type === "mcq" && Array.isArray(a)) return a.map((i) => String(q.choices?.[Number(i)] ?? i)).join(" | ") || "(pas de réponse)";
  return String(typeof a === "string" ? a : JSON.stringify(a));
};

/** Writes the precise questions of the members whose missed questions changed (or all with force); kept in rec.probes. */
export async function makeProbes(env: Env, b: BriefCtx, rec: any, members: string[] | null, force = false): Promise<{ probes: Record<string, any>; errors: Record<string, string> }> {
  const contrib: any[] = Array.isArray(rec?.contrib) ? rec.contrib : [];
  const ids = contrib.map((m) => String(m.gid)).filter((x) => !members || members.includes(x));
  const probes: Record<string, any> = { ...(rec.probes || {}) }, errors: Record<string, string> = {};
  if (!ids.length) return { probes, errors };
  const list = await all<{ id: number; title: string; questions: string | null }>(env, "SELECT id, title, questions FROM assessments WHERE brief_id = ? ORDER BY id", b.id).catch(() => []);
  if (!list.length) return { probes, errors };
  const takers = await all<{ assessment_id: number; discord_id: string; status: string; grades: string | null; answers: string | null }>(env,
    `SELECT assessment_id, discord_id, status, grades, answers FROM assessment_takers WHERE assessment_id IN (${list.map(() => "?").join(",")}) AND discord_id IN (${ids.map(() => "?").join(",")})`,
    ...list.map((a) => a.id), ...ids).catch(() => []);
  const parse = (t: string | null, d: any) => { try { return JSON.parse(t || "") ?? d; } catch { return d; } };
  await Promise.all(ids.map(async (gid) => {
    const missed: { aid: number; n: number; verdict: string; q: any; ans: unknown; gr: any }[] = [];
    for (const a of list) {
      const t = takers.find((x) => x.assessment_id === a.id && x.discord_id === gid);
      if (t?.status !== "graded") continue;
      const qs: any[] = parse(a.questions, []), grades = parse(t.grades, {}), answers = parse(t.answers, {});
      qs.forEach((q, k) => { const gr = grades[q.id]; if (!gr || gr.verdict !== "correct") missed.push({ aid: a.id, n: k + 1, verdict: String(gr?.verdict || "unanswered"), q, ans: answers[q.id], gr }); });
    }
    const key = PROBE_V + missed.map((x) => `${x.aid}:${x.n}:${x.verdict}`).join(",");
    if (!missed.length) { delete probes[gid]; return; }
    if (!force && probes[gid]?.key === key && probes[gid]?.items?.length) return;
    const take = missed.slice(0, 10);
    const user = (compact: boolean) => take.map((x) => [
      `=== Question ${x.n} (${x.verdict === "partial" ? "en partie juste" : x.verdict === "wrong" ? "fausse" : "sans réponse"})`,
      `Énoncé : ${String(x.q.prompt || "").slice(0, compact ? 500 : 1500)}`,
      x.q.type === "mcq" && Array.isArray(x.q.choices) ? `Choix : ${x.q.choices.join(" | ")} · bonne(s) réponse(s) : ${(x.q.answer || []).map((i: number) => x.q.choices[i]).join(" | ")}` : "",
      x.q.expected ? `Attendu : ${String(x.q.expected).slice(0, compact ? 400 : 1200)}` : "",
      `Sa réponse : ${answerText(x.q, x.ans).slice(0, compact ? 500 : 1500)}`,
      [x.gr?.comment, x.gr?.wrong].filter(Boolean).length ? `Correction : ${[x.gr?.comment, x.gr?.wrong].filter(Boolean).join(" ").slice(0, 600)}` : "",
    ].filter(Boolean).join("\n")).join("\n\n");
    const ask = await askReview(env, PROBE_SYSTEM, user, 1, { maxTokens: 1800 }).catch((e) => ({ ok: false as const, msg: String((e as Error)?.message ?? e) }));
    if (!ask.ok) { errors[gid] = ask.msg; return; }
    const items: Probe[] = [];
    const seen = new Set<string>();
    for (const it of Array.isArray(ask.data?.items) ? ask.data.items : []) {
      if (items.length >= MAX_NOTIONS) break;
      const ns = [...new Set((Array.isArray(it?.ns) ? it.ns : [it?.n]).map(Number).filter((n: number) => take.some((m) => m.n === n)))] as number[];
      const qs = (Array.isArray(it?.qs) ? it.qs : []).map((q: unknown) => String(q ?? "").trim().slice(0, 300))
        .filter((q: string) => q && !seen.has(q.toLowerCase())).slice(0, MAX_QS);
      if (!ns.length || !qs.length) continue;
      qs.forEach((q: string) => seen.add(q.toLowerCase()));
      const x = take.find((m) => m.n === ns[0])!;
      const verdict = ns.map((n) => take.find((m) => m.n === n)!.verdict).sort((a, b) => (a === "partial" ? 1 : 0) - (b === "partial" ? 1 : 0))[0];
      items.push({ aid: x.aid, ns: ns.sort((a, b) => a - b), verdict, notion: String(it.notion || "").trim().slice(0, 80), qs });
    }
    if (items.length) probes[gid] = { at: now(), key, items };
    else errors[gid] = "The AI's answer was not usable.";
  }));
  return { probes, errors };
}
