// 🎤 Mock technical interview (/interview): a write-code problem plus an interviewer who
// asks one question at a time (approach, edge cases, complexity, testing), never gives the
// answer, and ends with a scorecard. Uses the AI when the daily budget allows; otherwise a
// scripted interviewer and a score computed from the judge's results.
import type { AttemptRow, ChallengeRow, Env, GuildRow } from "./types.ts";
import { addPoints, aiBudgetOk, aiBudgetUse, now, one, run } from "./db.ts";
import { t } from "./i18n.ts";
import { chat, extractJson } from "./ai.ts";
import { dayKey } from "./game.ts";

export interface InterviewRow {
  id: number; guild_id: string; discord_id: string; challenge_id: number; attempt_id: number;
  transcript: string; stage: number; status: "active" | "done"; scores: string | null; created_at: number; finished_at: number | null;
}
export interface Turn { who: "ai" | "me"; text: string }
export interface Scorecard {
  problem: number; communication: number; code: number; complexity: number;   // 1..5
  overall: number; verdict: string; strengths: string; improve: string; ai: boolean;
}
export const MAX_ANSWERS = 6, INTERVIEW_POINTS = 5;
const SCRIPT = ["iv.q.approach", "iv.q.edge", "iv.q.complexity", "iv.q.code", "iv.q.test", "iv.q.improve"];

const turns = (iv: InterviewRow): Turn[] => { try { return JSON.parse(iv.transcript || "[]"); } catch { return []; } };
export const transcriptOf = turns;

export async function getInterview(env: Env, id: number) {
  return one<InterviewRow>(env, "SELECT * FROM interviews WHERE id = ?", id);
}

/** Start: closes any interview still open, opens a new one on the given attempt. */
export async function openInterview(env: Env, g: GuildRow, uid: string, c: ChallengeRow, a: AttemptRow): Promise<InterviewRow> {
  await run(env, "UPDATE interviews SET status = 'done', finished_at = ? WHERE guild_id = ? AND discord_id = ? AND status = 'active'", now(), g.id, uid);
  const opening = t(g.lang, "iv.opening", { title: c.title });
  const r = await run(env, "INSERT INTO interviews (guild_id, discord_id, challenge_id, attempt_id, transcript, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    g.id, uid, c.id, a.id, JSON.stringify([{ who: "ai", text: opening }]), now());
  return (await getInterview(env, Number(r.meta.last_row_id)))!;
}

function context(c: ChallengeRow, a: AttemptRow | null) {
  let verdict = "not submitted yet";
  try {
    const j = a?.result ? JSON.parse(a.result) : null;
    if (j) verdict = `${j.verdict}, ${j.passed}/${j.total} tests`;
  } catch { /* ignore */ }
  return `PROBLEM: ${c.title}\n${(c.question ?? "").slice(0, 2500)}\n\nCANDIDATE'S CURRENT CODE (${a?.lang ?? "?"}): ${a?.answer_given ? "\n" + a.answer_given.slice(0, 3000) : "none yet"}\nJUDGE: ${verdict}`;
}

/** The candidate answers; the interviewer asks the next question. Returns the interviewer's line. */
export async function interviewReply(env: Env, g: GuildRow, iv: InterviewRow, answer: string): Promise<{ text: string; last: boolean }> {
  const L = g.lang;
  const hist = turns(iv);
  hist.push({ who: "me", text: answer.trim().slice(0, 1200) });
  const answers = hist.filter((x) => x.who === "me").length;
  const last = answers >= MAX_ANSWERS;
  let next = "";
  if (!last && (await aiBudgetOk(env, 1))) {
    const c = await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ?", iv.challenge_id);
    const a = await one<AttemptRow>(env, "SELECT * FROM attempts WHERE id = ?", iv.attempt_id);
    if (c) {
      await aiBudgetUse(env, 1);
      next = (await chat(env, [
        { role: "system", content: `You are a friendly but rigorous technical interviewer running a mock coding interview for a student. Speak ${L === "fr" ? "French" : "English"}. Ask exactly ONE short question or remark per turn (under 70 words). Follow a real interview: clarify the problem and approach, then edge cases, then time/space complexity, then ask them to code it in the editor, then how they would test it, then possible improvements. React to what they actually said: if something is wrong or vague, probe it. NEVER give the solution, code, or the name of the algorithm they should use. ${context(c, a)}` },
        ...hist.map((x) => ({ role: x.who === "ai" ? "assistant" : "user", content: x.text } as const)),
      ], { maxTokens: 300, temperature: 0.4, timeoutMs: 30000 }).catch(() => "")).trim().slice(0, 700);
    }
  }
  if (!next) next = t(L, last ? "iv.wrap_up" : SCRIPT[Math.min(answers - 1, SCRIPT.length - 1)]);
  hist.push({ who: "ai", text: next });
  await run(env, "UPDATE interviews SET transcript = ?, stage = ? WHERE id = ?", JSON.stringify(hist), answers, iv.id);
  return { text: next, last };
}

const clamp = (n: unknown, d = 3) => Math.max(1, Math.min(5, Math.round(Number(n) || d)));

/** Scorecard from the judge and the answers only (no AI). */
export function statsScorecard(L: string, hist: Turn[], a: AttemptRow | null): Scorecard {
  let j: any = null;
  try { j = a?.result ? JSON.parse(a.result) : null; } catch { j = null; }
  const mine = hist.filter((x) => x.who === "me").map((x) => x.text);
  const words = mine.join(" ").split(/\s+/).filter(Boolean).length;
  const accepted = a?.status === "solved" || j?.verdict === "accepted";
  const ratio = j?.total ? j.passed / j.total : 0;
  const problem = accepted ? 5 : ratio >= 0.7 ? 4 : ratio >= 0.3 ? 3 : a?.answer_given ? 2 : 1;
  const code = accepted ? ((a?.tries ?? 1) <= 2 ? 5 : 4) : j?.verdict === "compile" ? 1 : a?.answer_given ? 2 : 1;
  const communication = mine.length >= 4 && words >= 60 ? 5 : mine.length >= 3 && words >= 35 ? 4 : mine.length >= 2 ? 3 : mine.length ? 2 : 1;
  const complexity = mine.some((s) => /O\s*\(|log|linear|quadratic|lin[ée]aire|quadratique|n\s*\^?\s*2|n²/i.test(s)) ? 4 : j?.verdict === "tle" ? 1 : 2;
  const overall = Math.round(((problem + communication + code + complexity) / 4) * 10) / 10;
  return {
    problem, communication, code, complexity, overall, ai: false,
    verdict: t(L, overall >= 4.3 ? "iv.v.strong" : overall >= 3.5 ? "iv.v.hire" : overall >= 2.5 ? "iv.v.lean" : "iv.v.no"),
    strengths: t(L, accepted ? "iv.s.solved" : communication >= 4 ? "iv.s.talk" : "iv.s.tried"),
    improve: t(L, complexity <= 2 ? "iv.i.complexity" : communication <= 3 ? "iv.i.talk" : !accepted ? "iv.i.code" : "iv.i.edge"),
  };
}

/** End the interview: scorecard (AI if possible), small bonus once a day for a real effort. */
export async function finishInterview(env: Env, g: GuildRow, iv: InterviewRow): Promise<{ card: Scorecard; bonus: number }> {
  if (iv.status === "done" && iv.scores) return { card: JSON.parse(iv.scores), bonus: 0 };
  const L = g.lang;
  const hist = turns(iv);
  const a = await one<AttemptRow>(env, "SELECT * FROM attempts WHERE id = ?", iv.attempt_id);
  const c = await one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ?", iv.challenge_id);
  let card = statsScorecard(L, hist, a);
  if (c && hist.some((x) => x.who === "me") && (await aiBudgetOk(env, 2))) {
    await aiBudgetUse(env, 2);
    const raw = await chat(env, [
      { role: "system", content: `You write the interview scorecard for a mock coding interview of a student. Be honest and encouraging. Write the text fields in ${L === "fr" ? "French" : "English"}. Answer ONLY with JSON: {"problem": 1-5, "communication": 1-5, "code": 1-5, "complexity": 1-5, "verdict": "short verdict", "strengths": "one or two sentences", "improve": "one or two concrete things to practice"}. Base the code score on the judge results.` },
      { role: "user", content: `${context(c, a)}\n\nTRANSCRIPT:\n${hist.map((x) => `${x.who === "ai" ? "Interviewer" : "Candidate"}: ${x.text}`).join("\n")}` },
    ], { maxTokens: 500, temperature: 0.2, timeoutMs: 40000 }).catch(() => "");
    let j: any = null;
    try { j = extractJson(raw); } catch { j = null; }
    if (j && j.verdict) {
      // never let the AI claim working code that the judge refused
      const codeCap = a?.status === "solved" ? 5 : card.code + 1;
      const s = { problem: clamp(j.problem), communication: clamp(j.communication), code: Math.min(codeCap, clamp(j.code)), complexity: clamp(j.complexity) };
      card = { ...s, overall: Math.round(((s.problem + s.communication + s.code + s.complexity) / 4) * 10) / 10, verdict: String(j.verdict).slice(0, 120), strengths: String(j.strengths ?? "").slice(0, 400), improve: String(j.improve ?? "").slice(0, 400), ai: true };
    }
  }
  const changed = await run(env, "UPDATE interviews SET status = 'done', scores = ?, finished_at = ? WHERE id = ? AND (status = 'active' OR scores IS NULL)", JSON.stringify(card), now(), iv.id);
  let bonus = 0;
  if (changed.meta.changes && hist.filter((x) => x.who === "me").length >= 3) {
    const today = await one(env, "SELECT 1 AS x FROM ledger WHERE guild_id = ? AND discord_id = ? AND reason = 'interview' AND ref = ?", g.id, iv.discord_id, dayKey(now()));
    if (!today) {
      bonus = INTERVIEW_POINTS;
      await addPoints(env, g, { discordId: iv.discord_id, amount: bonus, reason: "interview", ref: dayKey(now()) });
    }
  }
  // an unsolved interview problem stays open as practice: close the attempt so it doesn't linger
  await run(env, "UPDATE attempts SET status = 'expired', finished_at = ? WHERE id = ? AND status = 'pending'", now(), iv.attempt_id);
  return { card, bonus };
}

export const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
