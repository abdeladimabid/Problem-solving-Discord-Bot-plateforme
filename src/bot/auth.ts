// /auth/discord: the Discord sign-in of an assessment or a mise en situation (src/shared/identity.ts).
//   GET   the page Discord sends the browser back to (the token is in the address, read by the page)
//   POST  { state: "quiz~<token>" | "mes~<token>", token, dev }: the account must be the one the link was sent to
import type { Env } from "../shared/types.ts";
import { AUTH_PAGE, discordUser, signIn } from "../shared/identity.ts";
import type { IdentKind } from "../shared/identity.ts";
import { deviceLock, readTakerToken as quizTaker, takerIdent } from "../shared/assess.ts";
import { lockTaker, miseTakerIdent, readTakerToken as miseTaker } from "../shared/misesdb.ts";

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function handleAuth(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") return new Response(AUTH_PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" } });
  if (request.method !== "POST") return json({ error: "method" }, 405);
  let b: any = {};
  try { b = await request.json(); } catch { b = {}; }
  const m = /^(quiz|mes)~(\d+\.\d+\.[A-Za-z0-9_-]{32})$/.exec(String(b.state ?? ""));
  if (!m) return json({ error: "expired" }, 400);
  const kind = m[1] as IdentKind;
  const takerId = kind === "quiz" ? await quizTaker(env, m[2]) : await miseTaker(env, m[2]);
  if (!takerId) return json({ error: "expired" }, 404);
  const paper = kind === "quiz" ? await takerIdent(env, takerId) : await miseTakerIdent(env, takerId);
  if (!paper) return json({ error: "expired" }, 404);
  const user = await discordUser(String(b.token ?? ""));
  if (!user) return json({ error: "discord" }, 401);
  const r = await signIn(env, kind, takerId, paper.uid, user, String(b.dev ?? ""), request, { oneDevice: paper.oneDevice, started: paper.started });
  if (!r.ok) return json({ error: r.error }, 403);
  // one device per paper: signing in on another one while working stops the session (the teacher lets them back in)
  if (r.switched) { if (kind === "quiz") await deviceLock(env, takerId); else await lockTaker(env, takerId, "device"); }
  return json({ ok: true, switched: r.switched });
}
