// The challenge engine: picking, rendering, answering, judging, scoring.
// Shared by practice, daily challenges, assignments and duels.
import type { AttemptRow, ChallengeRow, Difficulty, DuelRow, Env, GuildRow, PlayerRow } from "./types.ts";
import { addPoints, all, checkBadges, findPlayer, now, one, practicePointsToday, run, totalPoints } from "./db.ts";
import { RULES, basePoints, dayKey, elo, fmtDuration, isCorrectOutput, levelInfo, pointsFor, progressBar, scoringOf, titleKey } from "./game.ts";
import { t } from "./i18n.ts";
import { COLORS, btn, codeBlock, linkBtn, mention, pingUsers, row, send, truncate } from "./discord.ts";
import { aiJudge, codeFeedback, explainQuestions, gradeExplanation } from "./ai.ts";
import type { GeneratedQuick, GeneratedWrite, QuickExample } from "./ai.ts";
import { HackerRankError, recentSolves } from "./hackerrank.ts";
import { LANGS, QUICK_LANGS, RunnerUnavailable, STARTER, isCodeLang, judge } from "./runner.ts";
import type { CodeLang, Judgement, TestCase } from "./runner.ts";
import { arenaChannel } from "./arena.ts";
import { analyzeLog, editorToken, editorUrl, fingerprint, integrityOf, similarity } from "./integrity.ts";
import type { EditorLog, IntegrityReport } from "./integrity.ts";
import { makeStarter, parseSignature, sampleCall, signatureLine } from "./starter.ts";

const LETTERS = ["A", "B", "C", "D"];
const DIFF_COLOR: Record<string, number> = { easy: COLORS.green, medium: COLORS.gold, hard: COLORS.red };
export const QUICK_KINDS = ["mcq", "complexity", "output", "bug"];

export const isChoiceKind = (k: string) => k === "mcq" || k === "bug" || k === "complexity";

/** The programming languages the class learns (guild setting, e.g. "javascript,php"). */
export function guildLangs(g: { code_lang?: string | null }): string[] {
  const list = String(g.code_lang || "python").split(",").map((x) => x.trim().toLowerCase()).filter((x) => QUICK_LANGS.includes(x));
  return list.length ? [...new Set(list)] : ["python"];
}
export const pickGuildLang = (g: { code_lang?: string | null }) => { const l = guildLangs(g); return l[Math.floor(Math.random() * l.length)]; };

/** Language for a write-code submission: the attempt's, else the student's last choice, else the class's first language. */
export function codeLangFor(g: GuildRow, p: { code_lang?: string | null } | null, a?: { lang?: string | null } | null): CodeLang {
  if (isCodeLang(a?.lang)) return a!.lang as CodeLang;
  if (isCodeLang(p?.code_lang)) return p!.code_lang as CodeLang;
  return (guildLangs(g).find(isCodeLang) as CodeLang) ?? "python";
}
export type Mode = "quick" | "write" | "coding";

// --------------------------------------------------------------- picking
export async function getChallenge(env: Env, id: number) {
  return one<ChallengeRow>(env, "SELECT * FROM challenges WHERE id = ?", id);
}

/** A bank challenge none of `players` has seen (null when they've done them all). */
export async function pickChallenge(
  env: Env,
  guild: GuildRow,
  o: { players: string[]; difficulty: Difficulty; mode: Mode; kind?: string | null; exclude?: Set<string>; allowSeen?: boolean; langs?: string[] },
): Promise<ChallengeRow | null> {
  const notSeen = o.allowSeen ? "" : o.players.map(() => "AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.challenge_id = c.id AND a.guild_id = ? AND a.discord_id = ?)").join(" ");
  const seenArgs = o.allowSeen ? [] : o.players.flatMap((p) => [guild.id, p]);
  const scope = "c.status = 'active' AND c.difficulty = ? AND (c.guild_id IS NULL OR c.guild_id = ?)";
  if (o.mode === "coding") {
    const rows = await all<ChallengeRow>(env, `SELECT c.* FROM challenges c WHERE c.kind = 'code' AND ${scope} ${notSeen} ORDER BY RANDOM() LIMIT 25`,
      o.difficulty, guild.id, ...seenArgs);
    return rows.find((c) => !o.exclude?.has((c.hr_slug ?? "").toLowerCase())) ?? null;
  }
  if (o.mode === "write") {
    return one<ChallengeRow>(env, `SELECT c.* FROM challenges c WHERE c.kind = 'write' AND c.lang = ? AND ${scope} ${notSeen}
      ORDER BY (c.source = 'seed') DESC, RANDOM() LIMIT 1`, guild.lang, o.difficulty, guild.id, ...seenArgs);
  }
  const kind = o.kind && QUICK_KINDS.includes(o.kind) ? o.kind : null;
  const langs = o.langs?.length ? o.langs : guildLangs(guild);
  return one<ChallengeRow>(env, `SELECT c.* FROM challenges c WHERE c.kind IN ('mcq', 'complexity', 'output', 'bug') AND c.lang = ?
      AND (c.code_lang IS NULL OR c.code_lang IN (${langs.map(() => "?").join(", ")})) AND ${scope} ${kind ? "AND c.kind = ?" : ""} ${notSeen}
      ORDER BY RANDOM() LIMIT 1`, guild.lang, ...langs, o.difficulty, guild.id, ...(kind ? [kind] : []), ...seenArgs);
}

/** Two bank challenges of the same kind and level: shown to the AI to calibrate difficulty. */
export async function bankExamples(env: Env, guild: GuildRow, kind: string | null, difficulty: Difficulty, codeLang?: string): Promise<QuickExample[]> {
  const k = kind && QUICK_KINDS.includes(kind) ? kind : null;
  const rows = await all<QuickExample & { code_lang: string | null }>(env, `SELECT title, question, code, choices, answer, code_lang FROM challenges
     WHERE source = 'seed' AND status = 'active' AND difficulty = ? AND lang = ? AND kind ${k ? "= ?" : "IN ('mcq', 'complexity', 'output', 'bug')"}
     ORDER BY (code_lang = ?) DESC, RANDOM() LIMIT 2`, difficulty, guild.lang, ...(k ? [k] : []), codeLang ?? "python");
  return rows.map(({ code_lang: _c, ...r }) => r);
}

export async function saveGeneratedQuick(env: Env, guild: GuildRow, g: GeneratedQuick, difficulty: Difficulty, by = "ai", codeLang?: string) {
  const r = await run(env,
    `INSERT INTO challenges (guild_id, source, kind, difficulty, lang, code_lang, title, question, code, choices, answer, hint, explanation, topic, status, created_by, created_at)
     VALUES (?, 'ai', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    guild.id, g.kind, difficulty, guild.lang, codeLang ?? guildLangs(guild)[0], g.title, g.question, g.code,
    g.choices ? JSON.stringify(g.choices) : null, g.answer, g.hint, g.explanation, g.topic, by, now());
  return getChallenge(env, Number(r.meta.last_row_id));
}

export async function saveGeneratedWrite(env: Env, guild: GuildRow, g: GeneratedWrite, difficulty: Difficulty, by = "ai", source = "ai") {
  const set = `${source}-${crypto.randomUUID().slice(0, 8)}`;
  await env.DB.batch(g.tests.map((tc, i) => env.DB.prepare("INSERT INTO challenge_tests (test_set, idx, input, gen, expected, sample) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(set, i, tc.input, tc.gen, tc.expected, tc.sample)));
  const r = await run(env,
    `INSERT INTO challenges (guild_id, source, kind, difficulty, lang, title, question, hint, topic, test_set, time_limit, solution, status, created_by, created_at)
     VALUES (?, ?, 'write', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    guild.id, source, difficulty, guild.lang, g.title, g.statement, g.hint, g.topic, set, g.timeLimit, g.reference, by, now());
  return getChallenge(env, Number(r.meta.last_row_id));
}

export async function loadTests(env: Env, c: ChallengeRow): Promise<TestCase[]> {
  if (!c.test_set) return [];
  return all<TestCase>(env, "SELECT idx, input, gen, expected, sample FROM challenge_tests WHERE test_set = ? ORDER BY idx", c.test_set);
}

// -------------------------------------------------------------- attempts
export async function startAttempt(env: Env, guild: GuildRow, userId: string, c: ChallengeRow, origin: AttemptRow["origin"], ref: number | null = null): Promise<AttemptRow> {
  if (origin !== "practice") {
    const existing = await one<AttemptRow>(env,
      "SELECT * FROM attempts WHERE guild_id = ? AND discord_id = ? AND origin = ? AND ref IS ? AND challenge_id = ?",
      guild.id, userId, origin, ref, c.id);
    if (existing) return existing;
  }
  const r = await run(env, "INSERT INTO attempts (guild_id, discord_id, challenge_id, origin, ref, started_at) VALUES (?, ?, ?, ?, ?, ?)",
    guild.id, userId, c.id, origin, ref, now());
  return (await one<AttemptRow>(env, "SELECT * FROM attempts WHERE id = ?", Number(r.meta.last_row_id)))!;
}

export async function getAttempt(env: Env, id: number) {
  return one<AttemptRow>(env, "SELECT * FROM attempts WHERE id = ?", id);
}

// ------------------------------------------------------------- rendering
export function maxReward(guild: GuildRow, c: ChallengeRow, origin: string) {
  return pointsFor(scoringOf(guild), { kind: c.kind, difficulty: c.difficulty, origin, usedHint: false, tries: 1, seconds: c.kind === "write" || c.kind === "code" ? 999 : 0 });
}

const maxTries = (a: AttemptRow) => (a.origin === "duel" ? 99 : RULES.writeMaxTries);

export interface RenderOpts {
  hrState?: "none" | "unverified" | "ok"; showClaim?: boolean; notice?: string; samples?: TestCase[]; codeLang?: string;
  editorUrl?: string; editorOnly?: boolean; imageUrl?: string; quickLimit?: number;
}

export function renderChallenge(guild: GuildRow, c: ChallengeRow, a: AttemptRow, o: RenderOpts = {}) {
  const L = guild.lang;
  const lines: string[] = [];
  if (o.notice) lines.push(o.notice, "");
  const components: unknown[] = [];
  const fields = [
    { name: t(L, "ch.type"), value: t(L, `kind.${c.kind}`) + (c.code_lang && c.kind !== "write" && c.kind !== "code" && isCodeLang(c.code_lang) ? ` · ${LANGS[c.code_lang as CodeLang].label}` : ""), inline: true },
    { name: t(L, "ch.difficulty"), value: t(L, `diff.${c.difficulty}`), inline: true },
    { name: t(L, "ch.reward"), value: t(L, "ch.reward_val", { p: maxReward(guild, c, a.origin) }), inline: true },
  ];

  if (c.kind === "code") {
    lines.push(t(L, "ch.code_intro", { title: c.title }));
    if (o.hrState === "none") lines.push("", t(L, "ch.code_link_hint"));
    if (o.hrState === "unverified") lines.push("", t(L, "ch.code_verify_hint"));
    const actions: unknown[] = [];
    if (c.url) actions.push(linkBtn(t(L, "ch.open_btn"), c.url, "🔗"));
    if (o.hrState === "ok") actions.push(btn(t(L, "ch.check_btn"), `chk:${a.id}`, 3, "✅"));
    if (o.showClaim && o.hrState === "ok") actions.push(btn(t(L, "ch.claim_btn"), `claim:${a.id}`, 2, "🙋"));
    components.push(row(...actions));
  } else if (c.kind === "write") {
    const lang = isCodeLang(o.codeLang) ? o.codeLang : "python";
    const sig = parseSignature(c.signature);
    lines.push(c.question ?? "");
    const samples = (o.samples ?? []).filter((s) => s.sample);
    if (sig) {
      // function mode: say exactly what to write, and show the examples as calls
      lines.push("", t(L, "ch.task_fn", { header: signatureLine(sig, lang) }));
      const doc = (L === "fr" ? sig.doc?.fr : sig.doc?.en) ?? sig.doc?.en;
      if (doc) lines.push(doc);
      const calls = samples.map((s) => sampleCall(sig, s.input ?? "", s.expected)).filter(Boolean) as { call: string; result: string }[];
      if (calls.length) lines.push("", `**${t(L, "ch.examples")}**`, codeBlock(truncate(calls.map((x) => `${x.call}  →  ${x.result}`).join("\n"), 900)));
    } else {
      lines.push("", t(L, "ch.task_prog"));
      samples.forEach((s, i) => {
        lines.push("", `**${t(L, "ch.sample", { n: i + 1 })}**`, codeBlock(truncate((s.input ?? "").replace(/\n$/, ""), 600)), `**${t(L, "ch.sample_out")}**`, codeBlock(truncate(s.expected, 300)));
      });
    }
    if (a.used_hint && c.hint) lines.push("", t(L, "ch.hint", { hint: c.hint }));
    if (o.editorUrl && o.editorOnly) lines.push("", t(L, "ch.editor_note"));
    const left = Math.max(0, maxTries(a) - a.tries);
    fields.push(
      { name: t(L, "ch.time_limit"), value: t(L, "ch.time_limit_val", { s: c.time_limit ?? 2 }), inline: true },
      { name: t(L, "ch.language"), value: LANGS[lang].label, inline: true },
      { name: t(L, "ch.tries"), value: a.origin === "duel" ? "∞" : String(left), inline: true },
    );
    if (!o.editorOnly) {
      components.push(row({
        type: 3, custom_id: `lang:${a.id}`, placeholder: t(L, "ch.language"),
        options: (Object.keys(LANGS) as CodeLang[]).map((k) => ({ label: LANGS[k].label, value: k, default: k === lang })),
      }));
    }
    const actions: unknown[] = [];
    if (o.editorUrl) actions.push(linkBtn(t(L, "ch.editor_btn"), o.editorUrl, "💻"));
    if (!o.editorOnly) actions.push(btn(t(L, "ch.submit_btn"), `sub:${a.id}`, o.editorUrl ? 2 : 1, "📤"));
    actions.push(btn(t(L, "ch.hint_btn"), `hint:${a.id}`, 2, "💡", !!a.used_hint || !c.hint), btn(t(L, "ch.report_btn"), `rep:${a.id}`, 2, "🚩"));
    components.push(row(...actions));
  } else {
    lines.push(c.question || t(L, "ch.question_default"));
    if (c.code && !o.imageUrl) lines.push(codeBlock(c.code, c.code_lang ?? ""));
    if (isChoiceKind(c.kind)) {
      const choices: string[] = JSON.parse(c.choices || "[]");
      lines.push(choices.map((ch, i) => `**${LETTERS[i]})** ${ch}`).join("\n"));
      components.push(row(...choices.map((_, i) => btn(LETTERS[i], `ans:${a.id}:${LETTERS[i]}`, 1))));
    } else {
      components.push(row(btn(t(L, "ch.answer_btn"), `ansm:${a.id}`, 1, "✍️")));
    }
    if (a.used_hint && c.hint) lines.push("", t(L, "ch.hint", { hint: c.hint }));
    lines.push("", o.quickLimit ? t(L, "ch.time_left", { s: o.quickLimit }) : t(L, "ch.speed"));
    components.push(row(
      btn(t(L, "ch.hint_btn"), `hint:${a.id}`, 2, "💡", !!a.used_hint || !c.hint),
      btn(t(L, "ch.report_btn"), `rep:${a.id}`, 2, "🚩"),
    ));
  }

  return {
    embeds: [{
      title: `🧩 ${c.title}`,
      description: truncate(lines.join("\n"), 4000),
      color: DIFF_COLOR[c.difficulty] ?? COLORS.blue,
      fields,
      ...(o.imageUrl && c.code && c.kind !== "write" ? { image: { url: o.imageUrl } } : {}),
      footer: { text: t(L, "ch.footer", { id: c.id }) },
    }],
    components,
  };
}

/** Render with everything loaded from the database (samples, language, HackerRank link). */
export async function renderFor(env: Env, guild: GuildRow, c: ChallengeRow, a: AttemptRow, o: RenderOpts = {}) {
  const p = await findPlayer(env, guild.id, a.discord_id);
  const extra: RenderOpts = { ...o };
  if (c.kind === "write") {
    extra.samples = o.samples ?? (await loadTests(env, c)).filter((x) => x.sample);
    extra.codeLang = o.codeLang ?? codeLangFor(guild, p, a);
  }
  if (c.kind === "code") extra.hrState = !p?.hr_username ? "none" : p.hr_verified ? "ok" : "unverified";
  const ig = integrityOf(guild);
  if (c.kind === "write" && a.status === "pending" && (ig.editor !== "off" || a.origin === "session") && env.PUBLIC_URL) {
    extra.editorUrl = editorUrl(env, await editorToken(env, a.id, a.discord_id));
    extra.editorOnly = ig.editor === "required" || a.origin === "session";
  }
  if (c.kind !== "write" && c.kind !== "code") {
    if (c.code && ig.codeImage && env.PUBLIC_URL) extra.imageUrl = codeImageUrl(env, c);
    if (ig.quickLimit) extra.quickLimit = ig.quickLimit;
  }
  return renderChallenge(guild, c, a, extra);
}

/** Public URL of a challenge's code drawn as an image (cached; changes when the code changes). */
export function codeImageUrl(env: Env, c: ChallengeRow): string {
  let h = 2166136261;
  for (const ch of (c.code ?? "") + (c.code_lang ?? "")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return `${(env.PUBLIC_URL || "").replace(/\/$/, "")}/img/${c.id}.png?v=${(h >>> 0).toString(36)}`;
}

// ------------------------------------------------------------- answering
export interface Outcome {
  payload: Record<string, unknown>; // message to show the student (replaces the challenge message)
  solved: boolean;
  finished: boolean;
}

function answerText(c: ChallengeRow, given: string | null) {
  if (!given) return "—";
  if (isChoiceKind(c.kind)) {
    const choices: string[] = JSON.parse(c.choices || "[]");
    const i = LETTERS.indexOf(given);
    return i >= 0 ? `**${given})** ${choices[i] ?? ""}` : given;
  }
  return codeBlock(truncate(given, 500));
}

/** Handle an answer to a quick challenge (a letter, or typed text for "output"). */
export async function answer(env: Env, guild: GuildRow, a: AttemptRow, c: ChallengeRow, given: string): Promise<Outcome> {
  const L = guild.lang;
  if (a.status !== "pending") return { payload: { content: t(L, "res.already"), embeds: [], components: [] }, solved: false, finished: true };
  const tries = a.tries + 1;
  const limit = integrityOf(guild).quickLimit;
  if (limit && now() - a.started_at > limit + 3) {
    await run(env, "UPDATE attempts SET tries = ?, answer_given = ? WHERE id = ?", tries, given, a.id);
    return finish(env, guild, { ...a, tries, answer_given: given }, c, false, { verified: 1, note: t(L, "res.too_late", { s: limit }) });
  }
  const correct = isChoiceKind(c.kind)
    ? given.trim().toUpperCase() === (c.answer ?? "").toUpperCase()
    : isCorrectOutput(given, c.answer ?? "", JSON.parse(c.alternatives || "[]"));

  if (!correct && !isChoiceKind(c.kind) && tries < RULES.outputTries) {
    await run(env, "UPDATE attempts SET tries = ?, answer_given = ? WHERE id = ?", tries, given, a.id);
    return { payload: renderChallenge(guild, c, { ...a, tries, answer_given: given }, { notice: t(L, "res.retry") }), solved: false, finished: false };
  }
  await run(env, "UPDATE attempts SET tries = ?, answer_given = ? WHERE id = ?", tries, given, a.id);
  return finish(env, guild, { ...a, tries, answer_given: given }, c, correct, { verified: 1 });
}

// ------------------------------------------------------------ write code
function verdictLine(L: string, j: Judgement): string {
  const f = j.failed;
  const where = f ? t(L, f.sample ? "judge.on_sample" : f.big ? "judge.on_big" : "judge.on_hidden", { n: f.idx }) : "";
  return t(L, `judge.${j.verdict}`, { where, passed: j.passed, total: j.total, time: j.maxTime.toFixed(2) });
}

function failureDetails(L: string, j: Judgement): string[] {
  const out: string[] = [];
  if (j.verdict === "compile" && j.error) out.push(codeBlock(truncate(j.error, 700)));
  if (j.failed?.error) out.push(codeBlock(truncate(j.failed.error, 500)));
  if (j.failed?.sample && j.verdict === "wrong") {
    out.push(`**${t(L, "judge.input")}**`, codeBlock(truncate((j.failed.input ?? "").replace(/\n$/, ""), 400)),
      `**${t(L, "judge.expected")}** \`${truncate(j.failed.expected ?? "", 150)}\` · **${t(L, "judge.got")}** \`${truncate(j.failed.got || "∅", 150)}\``);
  }
  return out;
}

/**
 * Judge a code submission on the hidden tests (falls back to an AI judge if the
 * code runner can't be reached). Accepted → finish; wrong → feedback + retry.
 */
export async function submitCode(env: Env, guild: GuildRow, a: AttemptRow, c: ChallengeRow, code: string, langIn: string, log: EditorLog | null = null, via: "editor" | "discord" = "discord"): Promise<Outcome> {
  const L = guild.lang;
  if (a.status !== "pending") return { payload: { content: t(L, "res.already"), embeds: [], components: [] }, solved: false, finished: true };
  const lang: CodeLang = isCodeLang(langIn) ? langIn : "python";
  const tests = await loadTests(env, c);
  const samples = tests.filter((x) => x.sample);
  let j: Judgement;
  let aiNote = "";
  try {
    j = await judge(env, code, lang, tests, c.time_limit ?? 2);
  } catch (e) {
    if (!(e instanceof RunnerUnavailable)) throw e;
    const r = await aiJudge(env, { lang: L, codeLang: lang, statement: c.question ?? "", samples: samples.map((s) => ({ input: s.input ?? "", expected: s.expected })), code });
    if (!r) {
      return { payload: await renderFor(env, guild, c, a, { notice: t(L, "judge.unavailable"), codeLang: lang, samples }), solved: false, finished: false };
    }
    j = { verdict: r.accepted ? "accepted" : "wrong", passed: r.accepted ? tests.length : 0, total: tests.length, maxTime: 0, judge: "ai" };
    aiNote = r.feedback;
  }
  const tries = a.tries + 1;
  const accepted = j.verdict === "accepted";
  let feedback = aiNote;
  if (!accepted && !feedback) {
    feedback = (await codeFeedback(env, { lang: L, codeLang: lang, statement: c.question ?? "", code, judgement: j, accepted: false }).catch(() => null)) ?? "";
  }
  await run(env, "UPDATE attempts SET tries = ?, answer_given = ?, lang = ?, result = ?, feedback = ? WHERE id = ?",
    tries, code.slice(0, 8000), lang, JSON.stringify({ ...j, failed: j.failed ? { ...j.failed, input: undefined } : undefined }), feedback || null, a.id);
  await recordIntegrity(env, guild, a, c, code, lang, log, via).catch((e) => console.error("integrity", e));
  const fresh = { ...a, tries, answer_given: code, lang, feedback };

  if (accepted) return finish(env, guild, fresh, c, true, { verified: j.judge === "tests" ? 1 : 0, judgement: j, aiNote });
  if (tries >= maxTries(a)) return finish(env, guild, fresh, c, false, { verified: 1, judgement: j, aiNote: feedback });

  const notice = [verdictLine(L, j), ...failureDetails(L, j)];
  if (j.judge === "ai") notice.push(t(L, "judge.by_ai"));
  if (feedback) notice.push(`🧠 **${t(L, "judge.ai_feedback")}:** ${feedback}`);
  notice.push(t(L, "judge.try_again", { n: maxTries(a) - tries }));
  return { payload: await renderFor(env, guild, c, fresh, { notice: notice.join("\n"), codeLang: lang, samples }), solved: false, finished: false };
}

// ------------------------------------------------------------------ finish
/** Mark an attempt solved/failed, award points and run the origin's hooks. */
export async function finish(
  env: Env,
  guild: GuildRow,
  a: AttemptRow,
  c: ChallengeRow,
  solved: boolean,
  o: { verified?: number; claimed?: boolean; judgement?: Judgement; aiNote?: string; note?: string } = {},
): Promise<Outcome> {
  const L = guild.lang;
  const sc = scoringOf(guild);
  const t0 = now();
  const extra: string[] = [];
  let points = 0;
  let held = 0;
  let capped = false;
  const totalBefore = await totalPoints(env, guild.id, a.discord_id);

  // claim the attempt atomically so a double click can't score twice
  const status = solved ? (o.claimed ? "claimed" : "solved") : "failed";
  const upd = await run(env, "UPDATE attempts SET status = ?, finished_at = ?, verified = ? WHERE id = ? AND status = 'pending'", status, t0, o.verified ?? 0, a.id);
  if (!upd.meta.changes) return { payload: { content: t(L, "res.already"), embeds: [], components: [] }, solved: false, finished: true };

  let assignmentOnTime = true;
  if (a.origin === "assignment" && a.ref) {
    const asg = await one<{ due_at: number | null }>(env, "SELECT due_at FROM assignments WHERE id = ?", a.ref);
    assignmentOnTime = !asg?.due_at || t0 <= asg.due_at;
  }

  let duelWon: boolean | null = null;
  if (a.origin === "duel" && a.ref && solved && !o.claimed) {
    const res = await run(env, "UPDATE duels SET status = 'finished', winner_id = ?, finished_at = ? WHERE id = ? AND status = 'active'", a.discord_id, t0, a.ref);
    duelWon = !!res.meta.changes;
  }

  // self-reported solves never count until a teacher approves them in the dashboard
  if (solved && !o.claimed) {
    points = a.origin === "duel" && duelWon === false
      ? RULES.duelLoserPoints
      : pointsFor(sc, { kind: c.kind, difficulty: c.difficulty, origin: a.origin, usedHint: !!a.used_hint, tries: a.tries || 1, seconds: t0 - a.started_at, onTime: assignmentOnTime });
    if (a.origin === "practice") {
      const w = integrityOf(guild).practiceWeight;
      if (w !== 1) points = Math.round(points * w);
      const today = await practicePointsToday(env, guild.id, a.discord_id);
      if (today + points > sc.cap) {
        points = Math.max(0, sc.cap - today);
        capped = true;
      }
    }
    // "explain your code": half the points now, the rest after a good explanation
    if (c.kind === "write" && a.origin !== "duel" && o.judgement?.judge === "tests" && points >= 2 && integrityOf(guild).explain) {
      held = points - Math.ceil(points / 2);
      points -= held;
      await run(env, "UPDATE attempts SET held = ? WHERE id = ?", held, a.id);
    }
    if (points) {
      await addPoints(env, guild, { discordId: a.discord_id, amount: points, reason: a.origin, ref: a.id });
      await run(env, "UPDATE attempts SET points = ? WHERE id = ?", points, a.id);
    }
  }

  // --- origin hooks
  if (a.origin === "daily" && solved && !o.claimed) extra.push(...(await onDailySolved(env, guild, a)));
  if (a.origin === "assignment" && a.ref) {
    const st = o.claimed ? null : solved ? (assignmentOnTime ? "done" : "late") : "failed";
    if (st) await run(env, "UPDATE assignments SET status = ?, completed_at = ?, attempt_id = ? WHERE id = ? AND status = 'open'", st, t0, a.id, a.ref);
  }
  if (a.origin === "duel" && a.ref) {
    if (solved && duelWon) await settleDuelWin(env, guild, a.ref, a.discord_id, points);
    if (!solved) {
      extra.push(t(L, "duel.you_failed"));
      await maybeDuelDraw(env, guild, a.ref);
    }
  }

  // --- level, badges, arena shout-outs
  const totalAfter = totalBefore + points;
  const lvBefore = levelInfo(totalBefore), lv = levelInfo(totalAfter);
  const shout: string[] = [];
  if (lv.level > lvBefore.level) {
    extra.push(t(L, "res.levelup", { level: lv.level, title: t(L, titleKey(lv.level)) }));
    shout.push(t(L, "arena.levelup", { user: mention(a.discord_id), level: lv.level, title: t(L, titleKey(lv.level)) }));
  }
  if (solved && !o.claimed) {
    for (const b of await checkBadges(env, guild, a.discord_id)) {
      extra.push(t(L, "res.badge", { badge: t(L, `badge.${b}`) }));
      shout.push(t(L, "arena.badge", { user: mention(a.discord_id), badge: t(L, `badge.${b}`) }));
    }
    if (c.difficulty === "hard" && (c.kind === "write" || c.kind === "code" || c.kind === "bug") && a.origin !== "duel") {
      shout.push(t(L, "arena.hard_solve", { user: mention(a.discord_id), title: c.title, kind: t(L, `kind.${c.kind}`), p: points }));
    }
  }
  if (shout.length) {
    const ch = await arenaChannel(env, guild);
    if (ch) await send(env, ch, { content: shout.join("\n") }).catch(() => {});
  }

  // --- result message
  const fields: { name: string; value: string; inline?: boolean }[] = [];
  if (c.kind !== "code" && c.kind !== "write") {
    fields.push({ name: t(L, "res.your_answer"), value: answerText(c, a.answer_given), inline: true });
    if (!solved) fields.push({ name: t(L, "res.correct_answer"), value: answerText(c, c.answer), inline: true });
  }
  if (o.judgement) {
    fields.push({ name: t(L, "judge.tests"), value: t(L, "judge.tests_val", { passed: o.judgement.passed, total: o.judgement.total, time: o.judgement.maxTime.toFixed(2) }), inline: true });
    fields.push({ name: t(L, "ch.language"), value: LANGS[(isCodeLang(a.lang) ? a.lang : "python") as CodeLang].label, inline: true });
  }
  if (solved) {
    const pv = o.claimed ? "⏳ " + t(L, "res.pending") : capped && !points ? t(L, "res.points_capped") : t(L, "res.points_val", { p: points }) + (held ? ` (+${held} 🧠)` : "");
    fields.push({ name: t(L, "res.points"), value: pv, inline: true });
  }
  fields.push({ name: t(L, "res.level"), value: `${lv.level} · ${progressBar(lv.progress)} ${totalAfter}/${lv.next}`, inline: false });

  const desc: string[] = [];
  if (o.note) desc.push(o.note);
  if (held) desc.push(t(L, "explain.pending", { p: held }));
  if (o.claimed) desc.push(t(L, "res.claimed_pending"));
  else if (c.kind === "code" && solved) desc.push(t(L, "res.verify_ok", { title: c.title }));
  if (o.judgement) {
    desc.push(verdictLine(L, o.judgement));
    if (!solved) desc.push(...failureDetails(L, o.judgement));
    if (o.judgement.judge === "ai") desc.push(t(L, "judge.by_ai"));
  }
  if (o.aiNote) desc.push(`🧠 **${t(L, solved ? "judge.ai_review" : "judge.ai_feedback")}:** ${o.aiNote}`);
  if (c.explanation) desc.push(`**${t(L, "res.explanation")}:** ${c.explanation}`);
  if (capped) desc.push(t(L, "ch.cap", { cap: sc.cap }));
  if (extra.length) desc.push(extra.join("\n"));

  const components: unknown[] = [];
  if (held) components.push(row(btn(t(L, "explain.btn", { p: held }), `exp:${a.id}`, 1, "🧠")));
  else if (c.kind === "write" && !o.aiNote) components.push(row(btn(t(L, solved ? "judge.review_btn" : "judge.help_btn"), `fb:${a.id}`, 2, "🧠")));

  return {
    payload: {
      content: "",
      embeds: [{
        title: `${t(L, solved ? (o.claimed ? "res.claimed_title" : "res.correct") : "res.wrong")} · ${c.title}`,
        description: truncate(desc.join("\n\n"), 4000),
        color: solved ? (o.claimed ? COLORS.gold : COLORS.green) : COLORS.red,
        fields,
        footer: { text: t(L, "ch.footer", { id: c.id }) },
      }],
      components,
    },
    solved,
    finished: true,
  };
}

/** AI code review / explanation on demand (button under a finished write-code result). */
export async function feedbackFor(env: Env, guild: GuildRow, a: AttemptRow, c: ChallengeRow): Promise<string | null> {
  if (!a.answer_given) return null;
  let j: Judgement;
  try { j = JSON.parse(a.result || "null") ?? undefined; } catch { j = undefined as unknown as Judgement; }
  if (!j) j = { verdict: a.status === "solved" ? "accepted" : "wrong", passed: 0, total: 0, maxTime: 0, judge: "tests" };
  const text = await codeFeedback(env, { lang: guild.lang, codeLang: (isCodeLang(a.lang) ? a.lang : "python") as CodeLang, statement: c.question ?? "", code: a.answer_given, judgement: j, accepted: a.status === "solved" });
  if (text) await run(env, "UPDATE attempts SET feedback = ? WHERE id = ?", text, a.id);
  return text;
}

// --------------------------------------------------------- HackerRank checks
export type CodingCheck = Outcome | "not_yet" | "unavailable" | "too_old" | "unverified";

export async function verifyCoding(env: Env, guild: GuildRow, a: AttemptRow, c: ChallengeRow, p: PlayerRow | null): Promise<CodingCheck> {
  if (!p?.hr_username || !c.hr_slug) return "unavailable";
  if (!p.hr_verified) return "unverified";
  let solves: Map<string, number>;
  try {
    solves = await recentSolves(p.hr_username);
  } catch (e) {
    if (e instanceof HackerRankError) return "unavailable";
    throw e;
  }
  const when = solves.get(c.hr_slug.toLowerCase());
  if (when === undefined) return "not_yet";
  // only a solve made AFTER the challenge was given counts (2 min grace for clock differences)
  if (when && when < a.started_at - 120) {
    await run(env, "UPDATE attempts SET status = 'expired', finished_at = ? WHERE id = ? AND status = 'pending'", now(), a.id);
    return "too_old";
  }
  return finish(env, guild, a, c, true, { verified: 1 });
}

// ----------------------------------------------------------------- daily
async function onDailySolved(env: Env, guild: GuildRow, a: AttemptRow): Promise<string[]> {
  const L = guild.lang;
  const out: string[] = [];
  const day = dayKey(now());
  await run(env, "UPDATE daily SET solvers = solvers + 1 WHERE guild_id = ? AND day = ?", guild.id, day);
  const d = await one<{ solvers: number }>(env, "SELECT solvers FROM daily WHERE guild_id = ? AND day = ?", guild.id, day);
  const n = d?.solvers ?? 1;
  const bonus = RULES.dailyFirstBonus[n - 1];
  if (bonus) {
    await addPoints(env, guild, { discordId: a.discord_id, amount: bonus, reason: "daily", ref: `bonus:${day}`, note: `#${n} solver` });
    out.push(`${["🥇", "🥈", "🥉"][n - 1]} +${bonus}`);
  }
  const p = await findPlayer(env, guild.id, a.discord_id);
  const yesterday = dayKey(now() - 86400);
  const streak = p?.last_daily_day === day ? p.daily_streak : p?.last_daily_day === yesterday ? (p.daily_streak ?? 0) + 1 : 1;
  await run(env, "UPDATE players SET daily_streak = ?, last_daily_day = ? WHERE guild_id = ? AND discord_id = ?", streak, day, guild.id, a.discord_id);
  out.push(t(L, "daily.streak", { n: streak }));
  const ch = await arenaChannel(env, guild);
  if (ch && n <= 3) await send(env, ch, { content: t(L, "daily.solved", { user: mention(a.discord_id), n }) }).catch(() => {});
  return out;
}

// ------------------------------------------------------------------ duels
async function settleDuelWin(env: Env, guild: GuildRow, duelId: number, winnerId: string, points: number) {
  const L = guild.lang;
  const d = await one<DuelRow>(env, "SELECT * FROM duels WHERE id = ?", duelId);
  if (!d) return;
  const loserId = d.challenger_id === winnerId ? d.opponent_id : d.challenger_id;
  const w = await findPlayer(env, guild.id, winnerId), l = await findPlayer(env, guild.id, loserId);
  const [wr, lr] = elo(w?.rating ?? 1000, l?.rating ?? 1000, 1);
  await env.DB.batch([
    env.DB.prepare("UPDATE players SET rating = ?, coins = coins + ? WHERE guild_id = ? AND discord_id = ?").bind(wr, d.stake * 2, guild.id, winnerId),
    env.DB.prepare("UPDATE players SET rating = ? WHERE guild_id = ? AND discord_id = ?").bind(lr, guild.id, loserId),
    env.DB.prepare("UPDATE attempts SET status = 'expired', finished_at = ? WHERE origin = 'duel' AND ref = ? AND status = 'pending'").bind(now(), duelId),
  ]);
  await addPoints(env, guild, { discordId: loserId, amount: RULES.duelLoserPoints, reason: "duel", ref: duelId, note: "participation" });
  await send(env, d.channel_id, {
    content: t(L, "duel.won", {
      w: mention(winnerId), l: mention(loserId), time: fmtDuration(now() - (d.started_at ?? now())), p: points,
      coins: d.stake ? t(L, "duel.won_coins", { n: d.stake * 2 }) : "", wr, lr, d: wr - (w?.rating ?? 1000),
    }),
    allowed_mentions: pingUsers([winnerId, loserId]),
  }).catch(() => {});
}

async function maybeDuelDraw(env: Env, guild: GuildRow, duelId: number) {
  const d = await one<DuelRow>(env, "SELECT * FROM duels WHERE id = ?", duelId);
  if (!d || d.status !== "active") return;
  const failed = await one<{ n: number }>(env, "SELECT COUNT(*) AS n FROM attempts WHERE origin = 'duel' AND ref = ? AND status = 'failed'", duelId);
  if ((failed?.n ?? 0) >= 2) await endDuelDraw(env, guild, d, "duel.draw");
}

export async function endDuelDraw(env: Env, guild: GuildRow, d: DuelRow, key: "duel.draw" | "duel.timeout") {
  const res = await run(env, "UPDATE duels SET status = 'finished', winner_id = NULL, finished_at = ? WHERE id = ? AND status = 'active'", now(), d.id);
  if (!res.meta.changes) return;
  await env.DB.batch([
    env.DB.prepare("UPDATE players SET coins = coins + ? WHERE guild_id = ? AND discord_id IN (?, ?)").bind(d.stake, guild.id, d.challenger_id, d.opponent_id),
    env.DB.prepare("UPDATE attempts SET status = 'expired', finished_at = ? WHERE origin = 'duel' AND ref = ? AND status = 'pending'").bind(now(), d.id),
  ]);
  await send(env, d.channel_id, {
    content: t(guild.lang, key, { a: mention(d.challenger_id), b: mention(d.opponent_id) }),
    allowed_mentions: pingUsers([d.challenger_id, d.opponent_id]),
  }).catch(() => {});
}

// ------------------------------------------------------------- regrading
/** After a teacher fixes a challenge's answer, give credit to students who were right. */
export async function regrade(env: Env, guild: GuildRow, c: ChallengeRow): Promise<number> {
  if (c.kind === "write" || c.kind === "code") return 0;
  const failed = await all<AttemptRow>(env, "SELECT * FROM attempts WHERE challenge_id = ? AND status = 'failed' AND guild_id = ?", c.id, guild.id);
  let n = 0;
  for (const a of failed) {
    const given = a.answer_given ?? "";
    const ok = isChoiceKind(c.kind) ? given.toUpperCase() === (c.answer ?? "").toUpperCase() : isCorrectOutput(given, c.answer ?? "", JSON.parse(c.alternatives || "[]"));
    if (!ok) continue;
    const pts = pointsFor(scoringOf(guild), { kind: c.kind, difficulty: c.difficulty, origin: a.origin === "duel" ? "practice" : a.origin, usedHint: !!a.used_hint, tries: a.tries, seconds: 999 });
    await run(env, "UPDATE attempts SET status = 'solved', points = ? WHERE id = ?", pts, a.id);
    await addPoints(env, guild, { discordId: a.discord_id, amount: pts, reason: "regrade", ref: a.id });
    n++;
  }
  return n;
}

export { basePoints };


// ------------------------------------------------------------ integrity
/** The template the student started from (its characters don't count as "typed"). */
export function starterFor(c: ChallengeRow, lang: CodeLang, L = "en"): string {
  const sig = parseSignature(c.signature);
  return sig ? makeStarter(sig, lang, L) : STARTER[lang];
}

/** Save what the editor recorded, the flags, and similar code from other students. */
async function recordIntegrity(env: Env, guild: GuildRow, a: AttemptRow, c: ChallengeRow, code: string, lang: CodeLang, log: EditorLog | null, via: "editor" | "discord") {
  const ig = integrityOf(guild);
  const prev = (() => { try { return JSON.parse(a.integrity || "null") as IntegrityReport | null; } catch { return null; } })();
  let report: IntegrityReport;
  if (via === "editor") report = analyzeLog(log, code, starterFor(c, lang, guild.lang).length);
  else report = { flags: ig.editor === "off" ? [] : ["Submitted in Discord, not in the code editor (no typing record)"], level: ig.editor === "off" ? 0 : 1, stats: prev?.stats ?? { typedChars: 0, deletedChars: 0, bigInserts: 0, awayCount: 0, awaySec: 0, activeSec: 0, pastes: 0, finalChars: code.length }, editor: false };
  // flags from earlier submissions stay
  if (prev) {
    for (const f of prev.flags) if (!report.flags.includes(f)) report.flags.push(f);
    report.level = Math.max(report.level, prev.level) as 0 | 1 | 2;
    report.similar = prev.similar;
  }
  let fp: string | null = null;
  if (ig.similarity && code.trim().length >= 120) {
    fp = fingerprint(code);
    const others = await all<{ id: number; discord_id: string; fp: string; name: string | null; integrity: string | null }>(env,
      `SELECT a.id, a.discord_id, a.fp, p.name, a.integrity FROM attempts a LEFT JOIN players p ON p.guild_id = a.guild_id AND p.discord_id = a.discord_id
        WHERE a.guild_id = ? AND a.challenge_id = ? AND a.discord_id != ? AND a.fp IS NOT NULL ORDER BY a.id DESC LIMIT 60`, guild.id, c.id, a.discord_id);
    const seen = new Set<string>();
    for (const o of others) {
      if (seen.has(o.discord_id)) continue;
      seen.add(o.discord_id);
      const sim = similarity(fp, o.fp);
      if (sim.score < 0.85 || sim.size < 25) continue;
      const pct = Math.round(sim.score * 100);
      report.similar = [...(report.similar ?? []).filter((x) => x.discordId !== o.discord_id), { attemptId: o.id, discordId: o.discord_id, name: o.name, score: pct }];
      const flag = `Code ${pct}% similar to ${o.name || "another student"}'s`;
      if (!report.flags.some((f) => f.startsWith("Code ") && f.includes(o.name || "another student"))) report.flags.push(flag);
      report.level = Math.max(report.level, pct >= 95 ? 2 : 1) as 0 | 1 | 2;
      // tell the other attempt too
      const theirs = (() => { try { return JSON.parse(o.integrity || "null") as IntegrityReport | null; } catch { return null; } })()
        ?? { flags: [], level: 0, stats: { typedChars: 0, deletedChars: 0, bigInserts: 0, awayCount: 0, awaySec: 0, activeSec: 0, pastes: 0, finalChars: 0 }, editor: false };
      const me = await one<{ name: string | null }>(env, "SELECT name FROM players WHERE guild_id = ? AND discord_id = ?", guild.id, a.discord_id);
      const back = `Code ${pct}% similar to ${me?.name || "another student"}'s`;
      if (!theirs.flags.includes(back)) theirs.flags.push(back);
      theirs.similar = [...(theirs.similar ?? []).filter((x) => x.discordId !== a.discord_id), { attemptId: a.id, discordId: a.discord_id, name: me?.name, score: pct }];
      theirs.level = Math.max(theirs.level, pct >= 95 ? 2 : 1) as 0 | 1 | 2;
      await run(env, "UPDATE attempts SET integrity = ?, reviewed = 0 WHERE id = ?", JSON.stringify(theirs), o.id);
    }
  }
  await run(env, "UPDATE attempts SET integrity = ?, fp = COALESCE(?, fp), reviewed = CASE WHEN ? > 0 THEN 0 ELSE reviewed END WHERE id = ?",
    JSON.stringify(report), fp, report.level, a.id);
  if (via === "editor" && log) {
    // keep the replay (every editor session, up to ~400 KB)
    const old = await one<{ events: string }>(env, "SELECT events FROM attempt_logs WHERE attempt_id = ?", a.id);
    let sessions: unknown[] = [];
    try { sessions = old ? JSON.parse(old.events) : []; } catch { sessions = []; }
    sessions.push({ at: now(), lang, changes: log.changes.slice(0, 20000), focus: (log.focus ?? []).slice(0, 2000), pastes: log.pastes, openMs: log.openMs });
    let json = JSON.stringify(sessions);
    while (json.length > 400_000 && sessions.length > 1) { sessions.shift(); json = JSON.stringify(sessions); }
    if (json.length <= 900_000) await run(env, "INSERT OR REPLACE INTO attempt_logs (attempt_id, events, created_at) VALUES (?, ?, ?)", a.id, json, now());
  }
}

// --------------------------------------------------------- explain your code
interface ExplainState { questions: string[]; asked_at: number; deadline: number; answers?: string[]; score?: number; feedback?: string; awarded?: number }
export const EXPLAIN_SECONDS = 180;

export function explainState(a: AttemptRow): ExplainState | null {
  try { return a.explain ? JSON.parse(a.explain) : null; } catch { return null; }
}

/** Ask (once) 2 questions about the student's own accepted code. */
export async function startExplain(env: Env, guild: GuildRow, a: AttemptRow, c: ChallengeRow): Promise<ExplainState | "none" | "done"> {
  if (!a.held) return "none";
  const st = explainState(a);
  if (st?.score !== undefined) return "done";
  if (st) return st;
  const qs = await explainQuestions(env, { lang: guild.lang, codeLang: (isCodeLang(a.lang) ? a.lang : "python") as CodeLang, statement: c.question ?? "", code: a.answer_given ?? "" });
  if (!qs) {
    // the AI can't ask right now: don't punish the student, give the held points
    await releaseHeld(env, guild, a, 1, "explanation skipped (AI unavailable)");
    return "none";
  }
  const state: ExplainState = { questions: qs, asked_at: now(), deadline: now() + EXPLAIN_SECONDS };
  await run(env, "UPDATE attempts SET explain = ? WHERE id = ?", JSON.stringify(state), a.id);
  return state;
}

/** Grade the answers and give back the held points in proportion. */
export async function answerExplain(env: Env, guild: GuildRow, a: AttemptRow, c: ChallengeRow, answers: string[]): Promise<{ score: number; awarded: number; feedback: string; late: boolean } | null> {
  const st = explainState(a);
  if (!st || st.score !== undefined || !a.held) return null;
  const late = now() > st.deadline + 15;
  let score = 0, feedback = "";
  if (!late) {
    const g = await gradeExplanation(env, { lang: guild.lang, codeLang: (isCodeLang(a.lang) ? a.lang : "python") as CodeLang, code: a.answer_given ?? "", questions: st.questions, answers });
    if (!g) { score = 1; feedback = ""; } else { score = g.score; feedback = g.feedback; }
  }
  const awarded = await releaseHeld(env, guild, a, score, late ? "explanation too late" : `explained the code (${Math.round(score * 100)}%)`);
  await run(env, "UPDATE attempts SET explain = ? WHERE id = ?", JSON.stringify({ ...st, answers: answers.map((x) => x.slice(0, 1000)), score, feedback, awarded }), a.id);
  if (score < 0.5 && !late) {
    const rep = (() => { try { return JSON.parse(a.integrity || "null") as IntegrityReport | null; } catch { return null; } })()
      ?? { flags: [], level: 0, stats: { typedChars: 0, deletedChars: 0, bigInserts: 0, awayCount: 0, awaySec: 0, activeSec: 0, pastes: 0, finalChars: 0 }, editor: false };
    rep.flags.push(`Couldn't explain their own code (${Math.round(score * 100)}%)`);
    rep.level = Math.max(rep.level, 1) as 0 | 1 | 2;
    await run(env, "UPDATE attempts SET integrity = ?, reviewed = 0 WHERE id = ?", JSON.stringify(rep), a.id);
  }
  return { score, awarded, feedback, late };
}

async function releaseHeld(env: Env, guild: GuildRow, a: AttemptRow, score: number, note: string): Promise<number> {
  const res = await run(env, "UPDATE attempts SET held = 0 WHERE id = ? AND held > 0", a.id);
  if (!res.meta.changes) return 0;
  const pts = Math.round((a.held ?? 0) * Math.max(0, Math.min(1, score)));
  if (pts) {
    await addPoints(env, guild, { discordId: a.discord_id, amount: pts, reason: a.origin, ref: a.id, note });
    await run(env, "UPDATE attempts SET points = points + ? WHERE id = ?", pts, a.id);
  }
  return pts;
}
