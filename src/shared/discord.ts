// Discord REST API + message building helpers.
import type { Env } from "./types.ts";

const API = "https://discord.com/api/v10";
export const EPHEMERAL = 64;
export const COLORS = { green: 0x1ba94c, gold: 0xf1c40f, ice: 0x5dade2, purple: 0x9b59b6, red: 0xe34948, blue: 0x2a78d6, gray: 0x6b7280 };
export const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
export const NO_PINGS = { parse: [] as string[] };
export const pingUsers = (ids: string[]) => ({ parse: [] as string[], users: ids.slice(0, 100) });

export class DiscordError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

export async function dapi<T = any>(env: Env, method: string, path: string, body?: unknown, auth = true): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(API + path, {
      method,
      headers: {
        ...(auth ? { Authorization: `Bot ${env.DISCORD_TOKEN}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        "User-Agent": "ClassBot (https://github.com, 1.0)",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const data = (await res.json().catch(() => ({}))) as { retry_after?: number };
      await sleep(Math.min(10, data.retry_after ?? 1) * 1000 + 100);
      continue;
    }
    if (!res.ok) throw new DiscordError(res.status, `${method} ${path} → ${res.status} ${await res.text().catch(() => "")}`);
    if (res.status === 204) return null as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }
  throw new DiscordError(429, "rate limited");
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function send(env: Env, channelId: string, payload: Record<string, unknown>) {
  return dapi(env, "POST", `/channels/${channelId}/messages`, { allowed_mentions: NO_PINGS, ...payload });
}

/** Send a DM; returns false if the user doesn't accept DMs from the server. */
export async function dm(env: Env, userId: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const ch = await dapi<{ id: string }>(env, "POST", "/users/@me/channels", { recipient_id: userId });
    await send(env, ch.id, payload);
    return true;
  } catch {
    return false;
  }
}

export function editOriginal(env: Env, token: string, payload: Record<string, unknown>) {
  return dapi(env, "PATCH", `/webhooks/${env.DISCORD_APP_ID}/${token}/messages/@original`, { allowed_mentions: NO_PINGS, ...payload }, false);
}

export function followup(env: Env, token: string, payload: Record<string, unknown>) {
  return dapi(env, "POST", `/webhooks/${env.DISCORD_APP_ID}/${token}`, { allowed_mentions: NO_PINGS, ...payload }, false);
}

export function addRole(env: Env, guildId: string, userId: string, roleId: string) {
  return dapi(env, "PUT", `/guilds/${guildId}/members/${userId}/roles/${roleId}`);
}
export function removeRole(env: Env, guildId: string, userId: string, roleId: string) {
  return dapi(env, "DELETE", `/guilds/${guildId}/members/${userId}/roles/${roleId}`);
}

// ------------------------------------------------------ request signing
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

let cachedKey: { hex: string; key: CryptoKey } | null = null;

export async function verifyDiscord(request: Request, publicKeyHex: string): Promise<string | null> {
  const sig = request.headers.get("x-signature-ed25519");
  const ts = request.headers.get("x-signature-timestamp");
  const body = await request.text();
  if (!sig || !ts || !/^[0-9a-f]+$/i.test(sig)) return null;
  if (!cachedKey || cachedKey.hex !== publicKeyHex) {
    const key = await crypto.subtle.importKey("raw", hexToBytes(publicKeyHex) as BufferSource, { name: "Ed25519" }, false, ["verify"]);
    cachedKey = { hex: publicKeyHex, key };
  }
  const ok = await crypto.subtle.verify("Ed25519", cachedKey.key, hexToBytes(sig) as BufferSource, new TextEncoder().encode(ts + body));
  return ok ? body : null;
}

// --------------------------------------------------------- components
export const row = (...components: unknown[]) => ({ type: 1, components });
export const btn = (label: string, custom_id: string, style: 1 | 2 | 3 | 4 = 2, emoji?: string, disabled = false) => ({
  type: 2, style, label, custom_id, ...(emoji ? { emoji: { name: emoji } } : {}), ...(disabled ? { disabled } : {}),
});
export const linkBtn = (label: string, url: string, emoji?: string) => ({ type: 2, style: 5, label, url, ...(emoji ? { emoji: { name: emoji } } : {}) });

export function modal(custom_id: string, title: string, inputs: { id: string; label: string; long?: boolean; required?: boolean; max?: number; value?: string }[]) {
  return {
    type: 9,
    data: {
      custom_id,
      title: title.slice(0, 45),
      components: inputs.map((i) =>
        row({ type: 4, custom_id: i.id, label: i.label.slice(0, 45), style: i.long ? 2 : 1, required: i.required ?? true, max_length: i.max ?? 400, ...(i.value ? { value: i.value } : {}) }),
      ),
    },
  };
}

export const mention = (id: string) => `<@${id}>`;
export const ts = (unix: number, style = "R") => `<t:${Math.floor(unix)}:${style}>`;

export function codeBlock(code: string, lang = "") {
  return "```" + lang + "\n" + code.replace(/```/g, "ˋˋˋ") + "\n```";
}

export function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
