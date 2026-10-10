// /create: students write a challenge for the class; the teacher approves it in the dashboard.
import type { Difficulty } from "../shared/types.ts";
import { t } from "../shared/i18n.ts";
import { findPlayer } from "../shared/db.ts";
import { modal } from "../shared/discord.ts";
import { CreateError, MAX_PENDING, createMcq, createWrite, pendingCount } from "../shared/create.ts";
import { type Ix, deferReply, json, later, say } from "./ix.ts";

export async function cmdCreate(ix: Ix, type: "write" | "mcq", difficulty: Difficulty) {
  const L = ix.L;
  if ((await pendingCount(ix.env, ix.guild, ix.userId)) >= MAX_PENDING) return say(t(L, "create.too_many", { n: MAX_PENDING }));
  if (type === "mcq") {
    return json(modal(`mcreate:mcq-${difficulty}`, t(L, "create.title_mcq"), [
      { id: "title", label: t(L, "create.f_title"), max: 80 },
      { id: "question", label: t(L, "create.f_question"), long: true, max: 1500 },
      { id: "choices", label: t(L, "create.f_choices"), long: true, max: 800 },
      { id: "answer", label: t(L, "create.f_answer"), max: 1 },
      { id: "explanation", label: t(L, "create.f_explanation"), long: true, max: 800, required: false },
    ]));
  }
  const p = await findPlayer(ix.env, ix.guild.id, ix.userId);
  return json(modal(`mcreate:write-${difficulty}`, t(L, "create.title_write"), [
    { id: "title", label: t(L, "create.f_title"), max: 80 },
    { id: "statement", label: t(L, "create.f_statement"), long: true, max: 3500 },
    { id: "tests", label: t(L, "create.f_tests"), long: true, max: 3000 },
    { id: "solution", label: t(L, "create.f_solution"), long: true, max: 4000 },
    { id: "lang", label: t(L, "create.f_lang"), max: 12, value: p?.code_lang ?? "javascript" },
  ]));
}

export async function createSubmit(ix: Ix, arg: string, rows: any[]) {
  const L = ix.L;
  const v: Record<string, string> = {};
  for (const r of rows) for (const c of r.components ?? []) v[c.custom_id] = String(c.value ?? "");
  const [type, diff] = arg.split("-");
  const difficulty = (["easy", "medium", "hard"].includes(diff) ? diff : "easy") as Difficulty;
  later(ix, async () => {
    try {
      if (type === "mcq") {
        await createMcq(ix.env, ix.guild, ix.userId, { title: v.title ?? "", question: v.question ?? "", choices: v.choices ?? "", answer: v.answer ?? "", explanation: v.explanation ?? "", difficulty });
        return { content: t(L, "create.sent") };
      }
      const r = await createWrite(ix.env, ix.guild, ix.userId, { title: v.title ?? "", statement: v.statement ?? "", tests: v.tests ?? "", solution: v.solution ?? "", lang: v.lang ?? "python", difficulty });
      return { content: t(L, "create.sent_write", { n: r.tests, out: r.sampleOut.slice(0, 200) }) };
    } catch (e) {
      if (!(e instanceof CreateError)) throw e;
      const [key, a, b] = e.message.split("|");
      return { content: t(L, key, { detail: a ?? "", n: a ?? "", error: b ?? a ?? "" }) };
    }
  });
  return deferReply(true);
}
