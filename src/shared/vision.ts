// Reading pictures (a scanned quiz, a PDF exported as images): the class's AIs that can see images, in their order.
// Groq (Llama 4), Gemini, OpenAI and Claude can; the other providers are skipped. Cloudflare's free AI is tried last.
import type { Env } from "./types.ts";
import { callStep, keyedSteps, workersAllowed } from "./aikeys.ts";
import type { Step } from "./aikeys.ts";
import { extractJson } from "./ai.ts";

export class VisionError extends Error {}

const WORKERS_VISION = "@cf/meta/llama-4-scout-17b-16e-instruct";
/** The models of a provider that read images: the class's own model when it can, else the known ones. */
async function visionModels(s: Step): Promise<string[]> {
  const m = s.model || "";
  if (s.type === "groq") {
    const known = ["meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"];
    // Groq changes its models: ask it which ones see images today
    const live = await fetch(`${s.base}/models`, { headers: { authorization: `Bearer ${s.key}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const ids: string[] = (live?.data ?? []).map((x: any) => String(x.id)).filter((id: string) => /llama-4|vision|scout|maverick/i.test(id));
    return [...new Set([...known.filter((k) => !ids.length || ids.includes(k)), ...ids])];
  }
  if (s.type === "gemini") return [/gemini/.test(m) ? m : "gemini-2.5-flash", "gemini-2.0-flash"];
  if (s.type === "openai") return [/gpt-4|gpt-5|o\d/.test(m) ? m : "gpt-4.1-mini"];
  if (s.type === "anthropic") return [m || "claude-haiku-5-5"];
  return [];
}

async function anthropicImages(s: Step, model: string, text: string, images: string[], maxTokens: number): Promise<string> {
  const content = [...images.map((u) => { const [, mt, data] = u.match(/^data:([^;]+);base64,(.*)$/) || []; return { type: "image", source: { type: "base64", media_type: mt || "image/jpeg", data: data || "" } }; }), { type: "text", text }];
  const res = await fetch(`${s.base}/messages`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": s.key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0, messages: [{ role: "user", content }] }) });
  if (!res.ok) throw new Error(`${res.status}`);
  const j: any = await res.json();
  return (j?.content ?? []).map((c: any) => c?.text ?? "").join("");
}

/**
 * Asks one question about some images (data: URLs) and reads the JSON answer. The instructions go with the images in
 * one user message (some vision models refuse a system message next to images).
 */
export async function readImagesJson(env: Env, instructions: string, images: string[], o: { maxTokens?: number } = {}): Promise<{ data: any; model: string }> {
  const maxTokens = o.maxTokens ?? 4000;
  const text = instructions + "\n\nAnswer with one JSON object only.";
  const tried: string[] = [];
  for (const s of await keyedSteps(env)) {
    for (const model of await visionModels(s)) {
      try {
        const raw = s.type === "anthropic" ? await anthropicImages(s, model, text, images, maxTokens)
          : await callStep(s, [{ role: "user", content: [{ type: "text", text }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))] as any }], { maxTokens, temperature: 0, timeoutMs: 90000 }, model);
        const data = extractJson(raw);
        if (data) return { data, model };
        tried.push(`${model}: answer not usable`);
      } catch (e) { tried.push(`${model}: ${String((e as Error)?.message ?? e).slice(0, 80)}`); }
    }
  }
  if (env.AI && (await workersAllowed(env))) {
    try {
      const raw: any = await env.AI.run(WORKERS_VISION as any, { messages: [{ role: "user", content: [{ type: "text", text }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))] }], max_tokens: maxTokens, temperature: 0 } as any);
      const out = typeof raw?.response === "string" ? raw.response : raw?.response ? JSON.stringify(raw.response) : raw?.choices?.[0]?.message?.content ?? "";
      const data = typeof raw?.response === "object" && raw.response ? raw.response : extractJson(String(out));
      if (data) return { data, model: WORKERS_VISION.replace("@cf/", "cloudflare/") };
      tried.push("cloudflare: answer not usable");
    } catch (e) { tried.push(`cloudflare: ${String((e as Error)?.message ?? e).slice(0, 80)}`); }
  }
  throw new VisionError(tried.length
    ? `None of the class's AIs could read the pages (${tried.slice(0, 3).join(" · ")}). A free Gemini or Groq key in Settings → AI reads images.`
    : "Reading scanned pages needs an AI that sees images: add a free Gemini or Groq key in Settings → AI.");
}
