// Watcher's brief messages in Discord, sent when the teacher clicks (the automatic reminders stay as they are):
//   • the announcement in French: dates (Discord timestamps: each student sees their own time), steps, squads with
//     their scrum master, how to hand in (each student, or only the scrum master) and the expected repo name
//   • the status: who pushed on time, late, or nothing (with mentions)
import type { Env, GuildRow } from "./types.ts";
import { all, now, one, run } from "./db.ts";
import { send } from "./discord.ts";
import { githubCfg, pushStatus } from "./github.ts";
import { stepsOf } from "./review/steps.ts";

export class WatcherMsgError extends Error {}
const channelOf = (g: GuildRow) => githubCfg(g).channel || (g as any).announce_channel || (g as any).daily_channel || null;
const ts = (t: number, f: string) => `<t:${t}:${f}>`;

async function briefRow(env: Env, g: GuildRow, id: number) {
  const b = await one<any>(env, "SELECT * FROM briefs WHERE id = ? AND guild_id = ?", id, g.id);
  if (!b) throw new WatcherMsgError("This brief doesn't exist anymore.");
  if (!b.due_at) throw new WatcherMsgError("Publish the brief with its dates first.");
  let squads: any[] = [];
  try { squads = JSON.parse(b.squads || "[]"); } catch { squads = []; }
  return { b, squads: b.kind === "squad" ? squads : [] };
}

/** The announcement of a brief, in French. */
export async function announceFr(env: Env, g: GuildRow, id: number) {
  const { b, squads } = await briefRow(env, g, id);
  const ch = channelOf(g);
  if (!ch) throw new WatcherMsgError("No Discord channel for the reports: Settings → GitHub & Watcher.");
  const names = new Map((await all<{ discord_id: string; name: string | null }>(env, "SELECT discord_id, name FROM players WHERE guild_id = ?", g.id)).map((p) => [p.discord_id, p.name || p.discord_id]));
  const lines = [`**Début :** ${ts(b.start_at ?? b.created_at, "D")}`, `**Rendu :** ${ts(b.due_at, "F")} (${ts(b.due_at, "R")})`];
  const steps = stepsOf(b.steps);
  if (steps.length) lines.push("", "**Étapes à valider :**", ...steps.map((s) => `• **${s.name}** : ${ts(s.due, "f")}${s.expected ? ` — ${s.expected}` : ""}`));
  if (squads.length) lines.push("", "**Squads :**", ...squads.map((s) => `• **${s.name}** : ${(s.members || []).map((m: string) => `<@${m}>`).join(" ")}${s.sm ? ` (Scrum Master : ${names.get(String(s.sm)) || ""})` : ""}`));
  const repo = String(b.repo_hint || "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").replace(/[^\w.-]/g, "").slice(0, 100);
  lines.push("", squads.length ? "📥 **Seul le Scrum Master** de chaque squad dépose le repo du squad avec `/brief submit`, dès qu’il est créé."
    : "📥 **Chacun dépose son propre repo** avec `/brief submit`, dès qu’il est créé.");
  if (repo) lines.push(`Nom du repo : **${repo}**`);
  await send(env, ch, { embeds: [{ color: 0x2563eb, title: `📌 Nouveau brief : ${b.title}`.slice(0, 256), description: lines.join("\n").slice(0, 4000) }] });
  await run(env, "UPDATE briefs SET announced_at = ? WHERE id = ?", now(), b.id);
  return { channel: ch };
}

/** Who pushed for a brief: on time, late, nothing (posted now). */
export async function postStatus(env: Env, g: GuildRow, id: number) {
  const { b } = await briefRow(env, g, id);
  const ch = channelOf(g);
  if (!ch) throw new WatcherMsgError("No Discord channel for the reports: Settings → GitHub & Watcher.");
  const push = await pushStatus(env, g, b);
  const students = await all<{ discord_id: string }>(env, "SELECT discord_id FROM players WHERE guild_id = ? AND github_id IS NOT NULL", g.id);
  const passed = b.due_at <= Math.floor(Date.now() / 1000);
  const on = students.filter((s) => push.get(s.discord_id) === "on").map((s) => `<@${s.discord_id}>`);
  const late = students.filter((s) => push.get(s.discord_id) === "late").map((s) => `<@${s.discord_id}>`);
  const none = students.filter((s) => !push.get(s.discord_id)).map((s) => `<@${s.discord_id}>`);
  const list = (x: string[]) => x.join(" ") || "personne";
  const lines = [`**Rendu :** ${ts(b.due_at, "F")} (${ts(b.due_at, "R")})`, "",
    passed ? `✅ **À temps (${on.length}) :** ${list(on)}` : `✅ **Ont poussé (${on.length + late.length}) :** ${list([...on, ...late])}`,
    ...(passed ? [`🕐 **En retard (${late.length}) :** ${list(late)}`] : []),
    `❌ **${passed ? "Rien poussé" : "Pas encore"} (${none.length}) :** ${list(none)}`];
  await send(env, ch, { embeds: [{ color: passed ? 0x8957e5 : 0xd29922, title: `${passed ? "🏁" : "⏰"} ${b.title}`.slice(0, 256), description: lines.join("\n").slice(0, 4000) }], allowed_mentions: { parse: [] } });
  return { on: on.length, late: late.length, none: none.length };
}
