// 🚫 Practice blocks: the teacher stops one student from practicing one type of challenge (all levels, or only some:
// e.g. "Find the bug, hard"), for a while or until they lift it, with a reason the student reads. /practice, 🎯 Picked for
// me and "Train <skill>" never give them a blocked challenge: asked for directly, the student gets the teacher's reason;
// picked by the bot, another type or level comes instead. What the teacher hands out (daily challenge, assignments,
// sessions, plans) is never blocked. Kept in app_settings (pblock:<guild>:<student>), so no migration.
import type { Difficulty, Env } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { t } from "./i18n.ts";
import { ts } from "./discord.ts";

export const BLOCK_TYPES = ["write", "output", "bug", "mcq", "complexity", "sql", "regex", "git", "coding"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export const QUICK_TYPES: BlockType[] = ["mcq", "complexity", "output", "bug"];
export const LEVELS: Difficulty[] = ["easy", "medium", "hard"];

export interface Block { type: BlockType; levels: Difficulty[]; until: number | null; reason: string; at: number }

const key = (gid: string, uid: string) => `pblock:${gid}:${uid}`;
const isType = (x: unknown): x is BlockType => BLOCK_TYPES.includes(x as BlockType);
const live = (b: Block, t = now()) => !b.until || b.until > t;

function parse(v: string | null | undefined): Block[] {
  let a: any;
  try { a = JSON.parse(v || "[]"); } catch { return []; }
  if (!Array.isArray(a)) return [];
  return a.filter((b) => b && isType(b.type)).map((b) => ({
    type: b.type, levels: Array.isArray(b.levels) ? LEVELS.filter((l) => b.levels.includes(l)) : [],
    until: Number(b.until) || null, reason: String(b.reason || ""), at: Number(b.at) || 0,
  }));
}

/** The student's blocks still in force (an expired one is simply ignored). */
export async function getBlocks(env: Env, gid: string, uid: string): Promise<Block[]> {
  const r = await one<{ v: string }>(env, "SELECT v FROM app_settings WHERE k = ?", key(gid, uid)).catch(() => null);
  return parse(r?.v).filter((b) => live(b));
}
async function save(env: Env, gid: string, uid: string, list: Block[]) {
  if (!list.length) { await run(env, "DELETE FROM app_settings WHERE k = ?", key(gid, uid)); return; }
  await run(env, "INSERT INTO app_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at",
    key(gid, uid), JSON.stringify(list), now());
}

export class BlockError extends Error {}

/** Block a type (levels empty = every level) for `days` days (0/null = until the teacher lifts it). Replaces that type's block. */
export async function setBlock(env: Env, gid: string, uid: string, b: { type: unknown; levels?: unknown; days?: unknown; reason?: unknown }): Promise<Block[]> {
  if (!isType(b.type)) throw new BlockError("Unknown challenge type");
  const levels = Array.isArray(b.levels) ? LEVELS.filter((l) => (b.levels as unknown[]).includes(l)) : [];
  const days = Math.max(0, Math.min(365, Number(b.days) || 0));
  const t0 = now();
  const block: Block = { type: b.type, levels: levels.length === LEVELS.length ? [] : levels, until: days ? t0 + Math.round(days * 86400) : null, reason: String(b.reason ?? "").trim().slice(0, 300), at: t0 };
  const list = (await getBlocks(env, gid, uid)).filter((x) => x.type !== block.type);
  list.push(block);
  await save(env, gid, uid, list);
  return list;
}
/** Lift a block (type null: all of them). */
export async function removeBlock(env: Env, gid: string, uid: string, type: string | null): Promise<Block[]> {
  const list = type ? (await getBlocks(env, gid, uid)).filter((x) => x.type !== type) : [];
  await save(env, gid, uid, list);
  return list;
}

/** Every blocked student of the class, for the dashboard. */
export async function classBlocks(env: Env, gid: string) {
  const rows = await all<{ k: string; v: string }>(env, "SELECT k, v FROM app_settings WHERE k LIKE ?", `pblock:${gid}:%`).catch(() => []);
  const names = new Map((await all<{ discord_id: string; name: string | null }>(env, "SELECT discord_id, name FROM players WHERE guild_id = ?", gid)).map((p) => [p.discord_id, p.name]));
  const prefix = `pblock:${gid}:`;
  return rows.map((r) => ({ uid: r.k.slice(prefix.length), blocks: parse(r.v).filter((b) => live(b)) }))
    .filter((x) => x.blocks.length && x.uid && !x.uid.includes(":"))
    .map((x) => ({ ...x, name: names.get(x.uid) || x.uid }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The type of a challenge as the teacher sees it (a Git question is a multiple choice about Git). */
export function typeOf(c: { kind: string; topic?: string | null }): BlockType | null {
  if (c.kind === "code") return "coding";
  if (c.kind === "mcq" && (c.topic || "") === "git") return "git";
  return isType(c.kind) ? c.kind : null;
}
/** The block that stops this type at this level (null: allowed). */
export function blockFor(list: Block[], type: string | null, level: Difficulty): Block | null {
  return list.find((b) => b.type === type && (!b.levels.length || b.levels.includes(level))) ?? null;
}
export const isBlocked = (list: Block[], c: { kind: string; topic?: string | null; difficulty: Difficulty }) => !!blockFor(list, typeOf(c), c.difficulty);

/** The level to use for a type: the one asked for if allowed, else the nearest allowed one (easier first). null: none. */
export function allowedLevel(list: Block[], type: string, wanted: Difficulty): Difficulty | null {
  if (!blockFor(list, type, wanted)) return wanted;
  const i = LEVELS.indexOf(wanted);
  const order = LEVELS.map((l, j) => [l, Math.abs(j - i) * 2 + (j > i ? 1 : 0)] as const).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  return order.find((l) => !blockFor(list, type, l)) ?? null;
}
/** For a random quick challenge: null = any kind is fine, a kind = only this one can be generated, "none" = all blocked. */
export function quickKindFor(list: Block[], level: Difficulty): string | null {
  const ok = QUICK_TYPES.filter((k) => !blockFor(list, k, level));
  if (ok.length === QUICK_TYPES.length) return null;
  return ok.length ? ok[Math.floor(Math.random() * ok.length)] : "none";
}

/** A SQL condition (on challenges aliased `a`) leaving out the blocked challenges. */
export function blockSql(list: Block[], a = "c"): { sql: string; args: unknown[] } {
  const parts: string[] = [], args: unknown[] = [];
  for (const b of list) {
    const cond = b.type === "git" ? `(${a}.kind = 'mcq' AND COALESCE(${a}.topic, '') = 'git')`
      : b.type === "mcq" ? `(${a}.kind = 'mcq' AND COALESCE(${a}.topic, '') != 'git')`
      : `${a}.kind = ?`;
    if (b.type !== "git" && b.type !== "mcq") args.push(b.type === "coding" ? "code" : b.type);
    const lv = b.levels.length ? ` AND ${a}.difficulty IN (${b.levels.map(() => "?").join(", ")})` : "";
    args.push(...b.levels);
    parts.push(`AND NOT (${cond}${lv})`);
  }
  return { sql: parts.join(" "), args };
}

// ------------------------------------------------------------------ texts
export const typeName = (L: string, type: string) => t(L, type === "coding" ? "kind.code" : `kind.${type}`);
const levelsText = (L: string, b: { levels: Difficulty[] }) => (b.levels.length ? ` (${b.levels.map((l) => t(L, `diff.${l}`)).join(", ")})` : "");
/** {type} {levels} {until} {reason} for a block's messages. */
export function blockVars(L: string, b: Block) {
  return { type: typeName(L, b.type), levels: levelsText(L, b), until: b.until ? t(L, "blk.until", { when: ts(b.until, "f") }) : "", reason: b.reason ? t(L, "blk.reason", { reason: b.reason }) : "" };
}
/** What a student reads when they ask for a blocked type. */
export const blockedText = (L: string, b: Block) => t(L, "blk.blocked", blockVars(L, b));
/** Every quick type blocked at this level. */
export function quickBlockedText(L: string, list: Block[], level: Difficulty) {
  const b = list.find((x) => QUICK_TYPES.includes(x.type) && x.reason);
  return t(L, "blk.quick_all", { levels: ` (${t(L, `diff.${level}`)})`, reason: b ? t(L, "blk.reason", { reason: b.reason }) : "" });
}
