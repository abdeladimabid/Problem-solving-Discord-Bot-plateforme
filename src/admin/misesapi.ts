// Dashboard API for « Mises en situation » (src/shared/misesdb.ts). Returns null when the path isn't one of ours.
//   GET  /mises                     the list          GET  /mises/setup        weeks, competencies, learners, teams, squads
//   POST /mises/prompt              the prompt for Claude              POST /mises/import  a JSON: preview + checklist, or saved
//   POST /mises/generate            the AI writes it (for a brief, or the sprint and week): the JSON, its preview and checklist (not saved)
//   GET  /mises/:id                 the session, the live table and the class statistics (refreshed every few seconds)
//   PUT  /mises/:id                 title, learners, options, the JSON of a draft          DELETE /mises/:id
//   POST /mises/:id/launch|add|late|resend|extend|close|remove|results|unlock     GET /mises/:id/links
//   (late: learners absent at the launch get it now, with their own time counted from when they open it)
//   GET  /mises/:id/taker/:t        one learner        PUT /mises/:id/grade|comment        GET /mises/:id/live.csv|results.csv
import type { Ctx, Env, GuildRow } from "../shared/types.ts";
import {
  MiseError, addLate, addTakers, answersExport, importGrades, closeMise, deleteMise, extend, fixMise, generateMise, importMise, launch, links, listMises, liveCsv, miseView, promptFor, removeTaker, resend, resultsCsv,
  reopenTaker, resetTaker, saveMise, sendResults, setComment, setGrade, setupView, takerDetail, unlockTakers,
} from "../shared/misesdb.ts";

const ok = (data: unknown) => Response.json(data);
const csv = (body: string, name: string) => new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` } });

export async function misesApi(env: Env, _ctx: Ctx, path: string, method: string, body: any, guild: () => Promise<GuildRow>): Promise<Response | null> {
  if (!/^\/mises(\/|$)/.test(path)) return null;
  try {
    return await route(env, path, method, body, guild);
  } catch (e) {
    if (e instanceof MiseError) return Response.json({ error: e.message }, { status: e.status });
    if (/no such table: mise/i.test(String((e as Error)?.message))) return Response.json({ error: "The database isn't up to date: run npm run db:migrate (migration 0075_mises.sql)." }, { status: 500 });
    throw e;
  }
}

async function route(env: Env, path: string, method: string, body: any, guild: () => Promise<GuildRow>): Promise<Response | null> {
  let m: RegExpMatchArray | null;
  if (path === "/mises" && method === "GET") return ok(await listMises(env, await guild()));
  if (path === "/mises/setup" && method === "GET") return ok(await setupView(env, await guild()));
  if (path === "/mises/prompt" && method === "POST") return ok(await promptFor(env, await guild(), body));
  if (path === "/mises/import" && method === "POST") return ok(await importMise(env, await guild(), body));
  if (path === "/mises/generate" && method === "POST") return ok(await generateMise(env, await guild(), body));
  if (path === "/mises/fix" && method === "POST") return ok(await fixMise(env, await guild(), body));
  // the learners' work for Claude to grade (claude.ai), and its correction back
  if ((m = path.match(/^\/mises\/(\d+)\/answers\.json$/)) && method === "GET") {
    const id = Number(m[1]);
    return new Response(JSON.stringify(await answersExport(env, await guild(), id), null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="mise-${id}-copies.json"`, "cache-control": "no-store" } });
  }
  if ((m = path.match(/^\/mises\/(\d+)\/claude-grades$/)) && method === "POST") { const g = await guild(), id = Number(m[1]); const r = await importGrades(env, g, id, body.json ?? body); return ok({ ...r, ...(await miseView(env, g, id)) }); }
  if ((m = path.match(/^\/mises\/(\d+)\/(live|results)\.csv$/)) && method === "GET") {
    const g = await guild(), id = Number(m[1]);
    return csv(m[2] === "live" ? await liveCsv(env, g, id) : await resultsCsv(env, g, id), `mise-${id}-${m[2] === "live" ? "live" : "resultats"}.csv`);
  }
  if ((m = path.match(/^\/mises\/(\d+)\/taker\/(\d+)$/)) && method === "GET") return ok(await takerDetail(env, await guild(), Number(m[1]), Number(m[2])));
  if (!(m = path.match(/^\/mises\/(\d+)(?:\/(launch|add|late|resend|extend|close|remove|reset|reopen|results|links|grade|comment|unlock))?$/))) return null;
  const g = await guild(), id = Number(m[1]), act = m[2];
  if (!act && method === "GET") return ok(await miseView(env, g, id));
  if (!act && method === "PUT") { const r = await saveMise(env, g, id, body); return ok(r.problems.length ? r : { ...r, ...(await miseView(env, g, id)) }); }
  if (!act && method === "DELETE") { await deleteMise(env, g, id); return ok({ ok: true }); }
  if (act === "links" && method === "GET") return ok({ links: await links(env, g, id) });
  if (method !== "POST" && method !== "PUT") return null;
  if (act === "launch") { const r = await launch(env, g, id, body); return ok({ ...r, ...(await miseView(env, g, id)) }); }
  if (act === "add") { const r = await addTakers(env, g, id, Array.isArray(body.students) ? body.students : [], body.send !== false); return ok({ ...r, ...(await miseView(env, g, id)) }); }
  if (act === "late") { const r = await addLate(env, g, id, Array.isArray(body.students) ? body.students : [], body.minutes, body.send !== false); return ok({ ...r, ...(await miseView(env, g, id)) }); }
  if (act === "resend") return ok(await resend(env, g, id, Number(body.taker)));
  if (act === "extend") { const r = await extend(env, g, id, Number(body.minutes), body.continue ?? null); return ok({ ...r, ...(await miseView(env, g, id)) }); }
  // delete a learner's paper (work and results), and invite them again if asked
  if (act === "reopen") { const r = await reopenTaker(env, g, id, Number(body.taker)); return ok({ ...r, ...(await miseView(env, g, id)) }); }
  if (act === "reset") { const r = await resetTaker(env, g, id, Number(body.taker), !!body.invite); return ok({ ...r, ...(await miseView(env, g, id)) }); }
  if (act === "close") { await closeMise(env, g, id); return ok(await miseView(env, g, id)); }
  if (act === "unlock") { const r = await unlockTakers(env, g, id, Number(body.taker) || null); return ok({ ...r, ...(await miseView(env, g, id)) }); }
  if (act === "remove") { await removeTaker(env, g, id, Number(body.taker)); return ok(await miseView(env, g, id)); }
  if (act === "grade") { await setGrade(env, g, id, body); return ok(await takerDetail(env, g, id, Number(body.taker))); }
  if (act === "comment") { await setComment(env, g, id, body); return ok({ ok: true }); }
  if (act === "results") return ok(await sendResults(env, g, id, body));
  return null;
}
