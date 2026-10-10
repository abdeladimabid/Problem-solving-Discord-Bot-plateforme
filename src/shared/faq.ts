// ❓ Questions bank: /ask looks in the class FAQ first; new questions get an AI draft
// that the teacher edits and approves in the dashboard. Approved answers are DMed to
// everyone who asked and become part of the FAQ (/faq).
import type { Env, GuildRow } from "./types.ts";
import { aiBudgetOk, aiBudgetUse, all, now, one, run } from "./db.ts";
import { t } from "./i18n.ts";
import { COLORS, dm, send, truncate } from "./discord.ts";
import { chat } from "./ai.ts";
import { arenaChannel } from "./arena.ts";

export interface FaqRow {
  id: number; guild_id: string; question: string; answer: string | null; draft: string | null; asked_by: string | null; askers: string | null;
  status: "suggested" | "pending" | "approved" | "rejected"; hits: number; created_at: number; answered_at: number | null;
}
export class FaqError extends Error {}

// ------------------------------------------------------------- matching
const STOP = new Set(("the a an and or of to in on for is are be it this that what how why when do does i my me you your can with " +
  "from as at by not no if into than then there which who will would should could about use using get " +
  "le la les un une des et ou de du en dans pour est sont ce cet cette que qui quoi comment pourquoi quand je mon ma mes tu ton ta tes " +
  "vous votre il elle on avec pas ne se sa son ses au aux par sur plus est-ce").split(" "));
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export function words(s: string): Set<string> {
  const out = new Set<string>();
  for (let w of fold(s).split(/[^a-z0-9+#]+/)) {
    if (w.length < 3 || STOP.has(w)) continue;
    if (w.length > 4 && w.endsWith("s")) w = w.slice(0, -1);   // loops ≈ loop
    out.add(w);
  }
  return out;
}
/** 0..1: how close two questions are (cosine similarity of their word sets). */
export function closeness(a: string, b: string): number {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.sqrt(A.size * B.size);
}
export const MATCH = 0.5, RELATED = 0.34;

export async function searchFaq(env: Env, g: GuildRow, q: string, status = "approved", limit = 3) {
  const rows = await all<FaqRow>(env, "SELECT * FROM faq WHERE guild_id = ? AND status = ? ORDER BY hits DESC LIMIT 400", g.id, status);
  // mostly the question itself; the answer's words help a little (a question asked differently)
  return rows.map((r) => ({ row: r, score: Math.max(closeness(q, r.question), status === "approved" ? 0.8 * closeness(q, r.question + " " + (r.answer ?? "").slice(0, 300)) : 0) }))
    .filter((x) => x.score >= RELATED).sort((a, b) => b.score - a.score).slice(0, limit);
}

// ----------------------------------------------------------------- /ask
export type AskResult =
  | { kind: "found"; matches: { row: FaqRow; score: number }[]; suggestion: number }
  | { kind: "joined"; id: number }
  | { kind: "queued"; id: number };

/** A student asks a question. Looks in the FAQ first, then joins or creates a pending question. */
export async function ask(env: Env, g: GuildRow, uid: string, question: string, force = false): Promise<AskResult> {
  question = question.trim().replace(/\s+\n/g, "\n").slice(0, 600);
  if (question.length < 8) throw new FaqError("faq.too_short");
  const pendingByMe = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM faq WHERE guild_id = ? AND asked_by = ? AND status = 'pending'", g.id, uid);
  if (!force) {
    const matches = await searchFaq(env, g, question);
    if (matches.length && matches[0].score >= MATCH) {
      // keep the question aside: one click sends it to the teacher if the FAQ didn't help
      const r = await run(env, "INSERT INTO faq (guild_id, question, asked_by, askers, status, created_at) VALUES (?, ?, ?, ?, 'suggested', ?)", g.id, question, uid, JSON.stringify([uid]), now());
      return { kind: "found", matches, suggestion: Number(r.meta.last_row_id) };
    }
  }
  if ((pendingByMe?.n ?? 0) >= 5) throw new FaqError("faq.too_many");
  const same = (await searchFaq(env, g, question, "pending", 1))[0];
  if (same && same.score >= 0.6) {
    const askers = new Set<string>(JSON.parse(same.row.askers || "[]"));
    askers.add(uid);
    await run(env, "UPDATE faq SET askers = ? WHERE id = ?", JSON.stringify([...askers]), same.row.id);
    return { kind: "joined", id: same.row.id };
  }
  const r = await run(env, "INSERT INTO faq (guild_id, question, asked_by, askers, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)", g.id, question, uid, JSON.stringify([uid]), now());
  return { kind: "queued", id: Number(r.meta.last_row_id) };
}

/** "The FAQ didn't answer me": the kept question goes to the teacher. */
export async function escalate(env: Env, g: GuildRow, uid: string, suggestionId: number) {
  const s = await one<FaqRow>(env, "SELECT * FROM faq WHERE id = ? AND guild_id = ? AND asked_by = ?", suggestionId, g.id, uid);
  if (!s) throw new FaqError("faq.gone");
  if (s.status !== "suggested") return { kind: "queued" as const, id: s.id };
  await run(env, "DELETE FROM faq WHERE id = ?", s.id);
  return ask(env, g, uid, s.question, true);
}

/** "That answered it": count a hit for the FAQ entry, forget the kept question. */
export async function helped(env: Env, g: GuildRow, uid: string, suggestionId: number, faqId: number) {
  await run(env, "DELETE FROM faq WHERE id = ? AND guild_id = ? AND asked_by = ? AND status = 'suggested'", suggestionId, g.id, uid);
  await run(env, "UPDATE faq SET hits = hits + 1 WHERE id = ? AND guild_id = ? AND status = 'approved'", faqId, g.id);
}

// ---------------------------------------------------------------- AI draft
const DRAFT_COST = 1;
export async function draftAnswer(env: Env, g: GuildRow, id: number): Promise<string | null> {
  const f = await one<FaqRow>(env, "SELECT * FROM faq WHERE id = ? AND guild_id = ?", id, g.id);
  if (!f || f.status !== "pending" || f.draft) return f?.draft ?? null;
  if (!(await aiBudgetOk(env, DRAFT_COST))) return null;
  await aiBudgetUse(env, DRAFT_COST);
  const lang = g.lang === "fr" ? "French" : "English";
  const text = await chat(env, [
    { role: "system", content: `You are a teaching assistant for a beginner-to-intermediate programming class (algorithms, problem solving; languages ${g.code_lang || "python"}). Draft an answer that the teacher will check before students see it. Write in ${lang}. Be correct, short (under 180 words), friendly, and teach the idea: explain why, give at most one tiny code example in a fenced block. Never write the full solution to a graded exercise; if the question asks for one, explain the approach instead.` },
    { role: "user", content: f.question },
  ], { maxTokens: 700, temperature: 0.3, timeoutMs: 40000 }).catch(() => "");
  const draft = text.trim().slice(0, 3000);
  if (!draft) return null;
  await run(env, "UPDATE faq SET draft = ? WHERE id = ? AND status = 'pending'", draft, id);
  return draft;
}

// ------------------------------------------------------------- teacher side
export async function faqList(env: Env, g: GuildRow) {
  const rows = await all<FaqRow>(env, "SELECT * FROM faq WHERE guild_id = ? AND status IN ('pending', 'approved', 'rejected') ORDER BY status = 'pending' DESC, COALESCE(answered_at, created_at) DESC LIMIT 300", g.id);
  return rows.map((r) => ({ ...r, askers: JSON.parse(r.askers || "[]") as string[] }));
}

/** Approve (and DM everyone who asked), edit, reject, or add an entry yourself. */
export async function saveFaq(env: Env, g: GuildRow, b: { id?: number; question?: string; answer?: string; status?: string; announce?: boolean }) {
  const L = g.lang;
  const answer = String(b.answer ?? "").trim().slice(0, 3500);
  const question = String(b.question ?? "").trim().slice(0, 600);
  if (!b.id) {
    if (question.length < 5 || !answer) throw new FaqError("question and answer are required");
    const r = await run(env, "INSERT INTO faq (guild_id, question, answer, status, created_at, answered_at) VALUES (?, ?, ?, 'approved', ?, ?)", g.id, question, answer, now(), now());
    return one<FaqRow>(env, "SELECT * FROM faq WHERE id = ?", Number(r.meta.last_row_id));
  }
  const f = await one<FaqRow>(env, "SELECT * FROM faq WHERE id = ? AND guild_id = ?", b.id, g.id);
  if (!f) throw new FaqError("unknown question");
  const status = b.status === "rejected" ? "rejected" : b.status === "pending" ? "pending" : "approved";
  if (status === "approved" && !answer) throw new FaqError("write an answer first");
  const firstTime = f.status !== "approved" && status === "approved";
  await run(env, "UPDATE faq SET question = ?, answer = ?, status = ?, answered_at = ? WHERE id = ?",
    question || f.question, answer || f.answer, status, status === "pending" ? null : now(), f.id);
  const askers: string[] = JSON.parse(f.askers || "[]");
  if (firstTime) {
    for (const uid of askers.slice(0, 40)) {
      await dm(env, uid, { embeds: [{ title: t(L, "faq.answered_title"), description: truncate(`> ${(question || f.question).split("\n").join("\n> ")}\n\n${answer}`, 4000), color: COLORS.green, footer: { text: t(L, "faq.answered_footer") } }] }).catch(() => false);
    }
    if (b.announce) {
      const ch = await arenaChannel(env, g);
      if (ch) await send(env, ch, { embeds: [{ title: t(L, "faq.new_entry"), description: truncate(`**${question || f.question}**\n\n${answer}`, 4000), color: COLORS.blue }] }).catch(() => {});
    }
  } else if (status === "rejected" && f.status === "pending" && answer) {
    for (const uid of askers.slice(0, 40)) await dm(env, uid, { content: t(L, "faq.rejected", { q: truncate(f.question, 200), note: answer }) }).catch(() => false);
  }
  return one<FaqRow>(env, "SELECT * FROM faq WHERE id = ?", f.id);
}
