// Coaching commands: /skills (skill map + mistakes), the "train this skill" button.
import type { Difficulty, Env, GuildRow } from "../shared/types.ts";
import { t } from "../shared/i18n.ts";
import { COLORS, btn, dm, row } from "../shared/discord.ts";
import { all, findPlayer, getPlayer, now, one, run } from "../shared/db.ts";
import { dayKey } from "../shared/game.ts";
import { getOrCreatePlan, planRef, savePlanItems } from "../shared/plan.ts";
import { lessonFor, newlyDone, pathProgress, STEP_COINS } from "../shared/path.ts";
import type { StepState } from "../shared/path.ts";
import { latestReport } from "../shared/report.ts";
import { SKILLS, bar, skillName, studentProfile } from "../shared/skills.ts";
import { focusSkills } from "../shared/plan.ts";
import { pickForSkill } from "../shared/coach.ts";
import { getChallenge, renderFor, startAttempt, guildLangs } from "../shared/challenges.ts";
import { enqueue } from "../shared/queue.ts";
import { type Ix, deferReply, later, memberName, reply, say, update } from "./ix.ts";

const STATUS_ICON: Record<string, string> = { strong: "🟢", ok: "🟡", weak: "🔴", new: "⚪" };
// skills that are mostly practiced by writing code
const CODE_SKILLS = ["loops", "strings", "arrays", "dicts", "math", "sorting", "recursion", "stack", "twopointers", "prefix", "binsearch", "greedy", "dp", "graphs", "sql", "web"];
const CORE = SKILLS.map((s) => s.key).filter((k) => !["async", "sql", "regex", "git", "web"].includes(k));

export async function cmdSkills(ix: Ix, memberId: string) {
  const L = ix.L;
  if (memberId !== ix.userId && !ix.teacher) return say(t(L, "skills.only_yours"));
  const name = memberId === ix.userId ? ix.userName : memberName(ix.raw, memberId);
  later(ix, async () => {
    await getPlayer(ix.env, ix.guild.id, memberId, name);
    const p = await studentProfile(ix.env, ix.guild, memberId);
    const tried = p.skills.filter((s) => s.evidence > 0);
    const lines = tried
      .sort((a, b) => SKILLS.findIndex((x) => x.key === a.key) - SKILLS.findIndex((x) => x.key === b.key))
      .map((s) => t(L, "skills.line", { icon: STATUS_ICON[s.status], skill: skillName(s.key, L), bar: bar(s.mastery), pct: s.mastery, next: t(L, `diff.${s.target}`) })
        + (!s.proven ? ` · ${t(L, "skills.no_code")}` : "") + (s.codeMistakes ? ` · ${t(L, "skills.code_mistakes", { n: s.codeMistakes })}` : ""));
    const untried = CORE.filter((k) => !tried.some((s) => s.key === k)).map((k) => skillName(k, L));
    const desc = [
      lines.length ? lines.join("\n") : t(L, "skills.empty"),
      untried.length ? "\n" + t(L, "skills.untried", { list: untried.slice(0, 10).join(" · ") }) : "",
    ].join("\n").slice(0, 4000);
    const fields = [{
      name: t(L, "skills.mistakes_title"),
      value: p.mistakes.length ? p.mistakes.slice(0, 4).map((m) => t(L, `mistake.${m.key}`, { n: m.count, total: m.total })).join("\n\n").slice(0, 1024) : t(L, "skills.no_mistakes"),
    }];
    const focus = memberId === ix.userId ? focusSkills(p.skills) : [];
    const buttons = focus.map((s) => btn(t(L, "skills.train_btn", { skill: skillName(s.key, L) }).slice(0, 78), `sk:${s.key}:${s.target}`, 1));
    if (memberId === ix.userId) buttons.push(btn(t(L, "today.btn"), "today:open", 2, "📋"), btn(t(L, "path.btn"), "path:open", 2, "🧭"), btn(t(L, "report.btn"), "report:open", 2, "📈"));
    return {
      embeds: [{ title: t(L, "skills.title", { name }), description: desc.slice(0, 4000), color: COLORS.blue, fields, footer: { text: t(L, "skills.footer") } }],
      components: memberId === ix.userId ? [row(...buttons.slice(0, 5))] : [],
    };
  });
  return deferReply(true);
}

/** "Train <skill>": a fitting challenge, or a fresh one from the AI if the bank has none left. */
export async function trainSkill(ix: Ix, skill: string, difficulty: Difficulty) {
  const L = ix.L;
  if (!SKILLS.some((s) => s.key === skill)) return say(t(L, "err.unknown"));
  later(ix, async () => {
    const c = await pickForSkill(ix.env, ix.guild, ix.userId, skill, difficulty, { prefer: CODE_SKILLS.includes(skill) ? "write" : "quick" });
    if (!c) {
      const langs = guildLangs(ix.guild);
      const job = await enqueue(ix.env, ix.guild, {
        discordId: ix.userId, kind: CODE_SKILLS.includes(skill) ? "write" : "quick", difficulty,
        topic: SKILLS.find((s) => s.key === skill)!.en, token: ix.raw.token, codeLang: langs[Math.floor(Math.random() * langs.length)],
      });
      return { content: job ? t(L, "skills.none_left", { skill: skillName(skill, L) }) : t(L, "ch.queue_busy"), embeds: [], components: [] };
    }
    const a = await startAttempt(ix.env, ix.guild, ix.userId, c, "practice");
    return renderFor(ix.env, ix.guild, c, a, { notice: t(L, "skills.training", { skill: skillName(skill, L), level: t(L, `diff.${c.difficulty}`) }) });
  });
  return deferReply(true);
}

// ================================================================= /today
const PLAN_ICON: Record<string, string> = { rematch: "🔁", edge: "🎯", warmup: "💪" };
const STATE_ICON: Record<string, string> = { todo: "▫️", pending: "✏️", solved: "✅", failed: "❌" };

async function planView(ix: Ix) {
  const L = ix.L;
  const plan = await getOrCreatePlan(ix.env, ix.guild, ix.userId);
  const p = await findPlayer(ix.env, ix.guild.id, ix.userId);
  if (!plan.items.length) return { content: t(L, "today.empty"), embeds: [], components: [] };
  const lines: string[] = [];
  for (const [i, it] of plan.items.entries()) {
    const c = await getChallenge(ix.env, it.challenge_id);
    if (!c) continue;
    lines.push(t(L, "today.item", {
      n: i + 1, icon: PLAN_ICON[it.kind], kind: t(L, `today.kind.${it.kind}`), title: c.title, skill: skillName(it.skill, L),
      level: t(L, `diff.${c.difficulty}`), type: t(L, `kind.${c.kind}`), state: STATE_ICON[it.status] + (it.status === "solved" && it.points ? ` +${it.points}` : ""),
    }));
    if (it.kind === "rematch" && it.status === "todo") lines.push(t(L, "today.rematch_why"));
  }
  const done = plan.items.filter((i) => i.status === "solved" || i.status === "failed").length;
  const desc = [lines.join("\n"), "", plan.completed_at ? t(L, plan.bonus ? "today.done_line" : "today.done_line_nobonus", { bonus: plan.bonus }) : t(L, "today.goal", { done, total: plan.items.length })].join("\n");
  const buttons = plan.items.map((it, i) => btn(t(L, "today.start", { n: i + 1 }), `plan:${i}`, it.status === "pending" ? 1 : 3, PLAN_ICON[it.kind], it.status === "solved" || it.status === "failed"));
  return {
    content: "",
    embeds: [{
      title: t(L, "today.title"), description: desc, color: COLORS.blue,
      footer: { text: t(L, "today.footer", { streak: p?.plan_streak ?? 0, best: p?.plan_best ?? 0 }) },
    }],
    components: [row(...buttons), row(btn(t(L, p?.plan_dm ? "today.remind_off" : "today.remind_on"), "plan:remind", 2, p?.plan_dm ? "🔕" : "🔔"), btn(t(L, "skills.btn"), "skills:open", 2, "🧭"))],
  };
}

export async function cmdToday(ix: Ix, remind: boolean | null) {
  if (remind !== null) await run(ix.env, "UPDATE players SET plan_dm = ? WHERE guild_id = ? AND discord_id = ?", remind ? 1 : 0, ix.guild.id, ix.userId);
  later(ix, async () => {
    const v = await planView(ix);
    if (remind !== null) v.content = t(ix.L, remind ? "today.remind_set" : "today.remind_unset");
    return v;
  });
  return deferReply(true);
}

/** Buttons under the plan: start item i, or toggle the morning reminder. */
export async function planButton(ix: Ix, arg: string, fromDm: boolean) {
  const L = ix.L;
  if (arg === "remind") {
    const p = await findPlayer(ix.env, ix.guild.id, ix.userId);
    await run(ix.env, "UPDATE players SET plan_dm = ? WHERE guild_id = ? AND discord_id = ?", p?.plan_dm ? 0 : 1, ix.guild.id, ix.userId);
    later(ix, async () => ({ ...(await planView(ix)), content: t(L, p?.plan_dm ? "today.remind_unset" : "today.remind_set") }));
    return deferReply(true);
  }
  const i = Number(arg);
  later(ix, async () => {
    const plan = await getOrCreatePlan(ix.env, ix.guild, ix.userId);
    const it = plan.items[i];
    if (!it) return { content: t(L, "today.old") };
    const c = await getChallenge(ix.env, it.challenge_id);
    if (!c) return { content: t(L, "err.unknown") };
    if (it.status === "solved" || it.status === "failed") return { content: t(L, "res.already") };
    const a = await startAttempt(ix.env, ix.guild, ix.userId, c, "plan", planRef(plan.day));
    if (a.status !== "pending") {
      it.status = a.status === "solved" ? "solved" : "failed";
      await savePlanItems(ix.env, ix.guild, ix.userId, plan.day, plan.items);
      return { content: t(L, "res.already") };
    }
    if (it.attempt_id !== a.id || it.status !== "pending") {
      it.attempt_id = a.id; it.status = "pending";
      await savePlanItems(ix.env, ix.guild, ix.userId, plan.day, plan.items);
    }
    return renderFor(ix.env, ix.guild, c, a, { notice: t(L, "today.notice", { n: i + 1, kind: t(L, `today.kind.${it.kind}`), skill: skillName(it.skill, L) }) });
  });
  void fromDm;
  return deferReply(true);
}

/** Morning: send their plan to students who asked for it (a few per run). */
// 2 per minute: building a plan takes ~20 queries, and one cron run may use 50 in total
export async function sendMorningPlans(env: Env, perRun = 2) {
  const t0 = now(), hour = new Date(t0 * 1000).getUTCHours(), day = dayKey(t0);
  const rows = await all<{ guild_id: string; discord_id: string }>(env,
    `SELECT p.guild_id, p.discord_id FROM players p JOIN guilds g ON g.id = p.guild_id
      WHERE p.plan_dm = 1 AND g.daily_hour <= ?
        AND NOT EXISTS (SELECT 1 FROM daily_plans d WHERE d.guild_id = p.guild_id AND d.discord_id = p.discord_id AND d.day = ?)
      LIMIT ?`, hour, day, perRun);
  for (const r of rows) {
    const g = await one<GuildRow>(env, "SELECT * FROM guilds WHERE id = ?", r.guild_id);
    if (!g) continue;
    const fake: Ix = { raw: { token: "" }, env, ctx: { waitUntil() {} } as any, guild: g, L: g.lang, userId: r.discord_id, userName: "", teacher: false };
    const v = await planView(fake);
    await dm(env, r.discord_id, { content: t(g.lang, "today.morning"), embeds: v.embeds, components: v.components }).catch(() => {});
  }
}

// ================================================================== /path
const RANK_ICON = (s: StepState, i: number, cur: number) => (s.done ? "✅" : i === cur ? "▶️" : "🔒");

async function pathView(ix: Ix, all = false) {
  const L = ix.L;
  const { steps, current } = await pathProgress(ix.env, ix.guild, ix.userId);
  const fresh = await newlyDone(ix.env, ix.guild, ix.userId, steps);
  const extra: string[] = [];
  if (fresh.length) {
    const coins = Math.min(fresh.length, 3) * STEP_COINS;
    await run(ix.env, "UPDATE players SET coins = coins + ? WHERE guild_id = ? AND discord_id = ?", coins, ix.guild.id, ix.userId);
    extra.push(t(L, "path.celebrate", { steps: fresh.slice(0, 3).map((s) => `${skillName(s.skill, L)} (${t(L, `diff.${s.level}`)})`).join(", "), coins }));
  }
  const line = (s: StepState, i: number) => t(L, "path.line", { icon: RANK_ICON(s, i, current), n: i + 1, skill: skillName(s.skill, L), level: t(L, `diff.${s.level}`), solved: s.solved, need: s.need });
  const doneN = steps.filter((s) => s.done).length;
  let body: string;
  if (all) body = steps.map(line).join("\n");
  else if (current < 0) body = t(L, "path.finished");
  else {
    const from = Math.max(0, current - 2), to = Math.min(steps.length, current + 4);
    const cur = steps[current];
    body = [
      t(L, "path.current", { skill: skillName(cur.skill, L), level: t(L, `diff.${cur.level}`), solved: cur.solved, need: cur.need, bar: bar((100 * cur.solved) / cur.need, 10) }),
      "", ...steps.slice(from, to).map((s, k) => line(s, from + k)),
    ].join("\n");
  }
  const cur = current >= 0 ? steps[current] : null;
  const buttons = [];
  if (cur) buttons.push(btn(t(L, "path.go"), `path:go`, 1, "▶️"), btn(t(L, "path.lesson"), `path:lesson:${cur.skill}`, 2, "📖"));
  buttons.push(btn(t(L, all ? "path.short" : "path.all"), all ? "path:open" : "path:all", 2, "🗺️"));
  return {
    content: extra.join("\n"),
    embeds: [{ title: t(L, "path.title", { done: doneN, total: steps.length }), description: body.slice(0, 4000), color: COLORS.blue, footer: { text: t(L, "path.footer") } }],
    components: [row(...buttons)],
  };
}

export async function cmdPath(ix: Ix) {
  later(ix, () => pathView(ix));
  return deferReply(true);
}

export async function pathButton(ix: Ix, arg: string, extra: string | undefined) {
  const L = ix.L;
  if (arg === "lesson") {
    const skill = String(extra ?? "");
    // a 4th part picks the language (the 🌐 button switches between English and French)
    const want = String(ix.raw.data?.custom_id ?? "").split(":")[3];
    const LL = want === "fr" || want === "en" ? want : L;
    const text = lessonFor(ix.guild, skill, LL);
    if (!text) return say(t(L, "path.no_lesson"));
    const other = LL === "fr" ? "en" : "fr";
    // an embed: room for 4000 characters, and links don't unfold into big previews
    const payload = { embeds: [{ title: `📖 ${skillName(skill, LL)}`, description: text.slice(0, 4000), color: COLORS.blue }], components: [row(btn(t(LL, "tr.btn"), `path:lesson:${skill}:${other}`, 2, "🌐"))] };
    return want ? update(payload) : reply(payload, true);
  }
  if (arg === "go") {
    later(ix, async () => {
      const { steps, current } = await pathProgress(ix.env, ix.guild, ix.userId);
      if (current < 0) return { content: t(L, "path.finished") };
      const s = steps[current];
      const c = await pickForSkill(ix.env, ix.guild, ix.userId, s.skill, s.level, { prefer: CODE_SKILLS.includes(s.skill) ? "write" : undefined });
      if (!c) {
        const langs = guildLangs(ix.guild);
        const job = await enqueue(ix.env, ix.guild, { discordId: ix.userId, kind: CODE_SKILLS.includes(s.skill) ? "write" : "quick", difficulty: s.level, topic: SKILLS.find((x) => x.key === s.skill)!.en, token: ix.raw.token, codeLang: langs[0] });
        return { content: job ? t(L, "skills.none_left", { skill: skillName(s.skill, L) }) : t(L, "ch.queue_busy") };
      }
      const a = await startAttempt(ix.env, ix.guild, ix.userId, c, "path");
      return renderFor(ix.env, ix.guild, c, a, { notice: t(L, "path.notice", { skill: skillName(s.skill, L), level: t(L, `diff.${s.level}`), solved: s.solved, need: s.need }) });
    });
    return deferReply(true);
  }
  later(ix, () => pathView(ix, arg === "all"));
  return deferReply(true);
}

// ================================================================ report
export async function reportButton(ix: Ix) {
  later(ix, async () => ({ embeds: [await latestReport(ix.env, ix.guild, ix.userId, ix.userName)] }));
  return deferReply(true);
}
