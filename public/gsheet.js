// 📗 Settings → Google Sheet: ClassBot fills the trainer's "Suivi Formateur" sheet (src/shared/gsheet.ts).
//   1. ClassBot's Google account (a service account: its JSON key, pasted once, never shown again)
//   2. the sheet (shared with that account as Editor), automatic fills on or off
//   3. Fill now, and what the last fill did
//   4. the names: which student goes on which row of "Niveau technique"
/* global $, $$, api, esc, toast, busy, fmtAgo, confirmDialog */

const GS_WHY = { manual: "you clicked Fill now", change: "after a change (debrief, level, plan)", weekly: "the weekly fill", "sprint end": "a sprint ended" };

function gsLast(l) {
  if (!l) return `<p class="small muted">Not filled yet.</p>`;
  if (!l.ok) return `<div class="notice danger">❌ ${esc(fmtAgo(l.at))} (${esc(GS_WHY[l.why] || l.why)}): ${esc(l.error)}</div>`;
  const list = (t, a) => (a && a.length ? `<details class="gs-det"><summary>${t} <span class="pill">${a.length}</span></summary><p class="small">${a.map(esc).join(" · ")}</p></details>` : "");
  return `<div class="gs-last"><p>✅ Filled ${esc(fmtAgo(l.at))} <span class="muted small">· ${esc(GS_WHY[l.why] || l.why)}</span></p>
    <div class="gs-counts"><span><b>${l.levels || 0}</b> sprint levels</span><span><b>${l.briefs || 0}</b> briefs</span><span><b>${l.plans || 0}</b> plans d'action</span></div>
    ${(l.warn || []).map((w) => `<p class="small gh-warn">⚠️ ${esc(w)}</p>`).join("")}
    ${list("Names of the sheet with no student", l.unmatched)}${list("Students not in the sheet", l.missing)}</div>`;
}

async function gsheetSettings(root, d = null) {
  d = d || (await api("/settings/gsheet"));
  const again = (r) => gsheetSettings(root, r);
  const email = d.key?.email || "";
  root.innerHTML = `
    <div class="panel set-card"><h3>1 · ClassBot's Google account</h3>
      ${d.key ? `<p>✅ ClassBot writes as <code class="gs-mail">${esc(email)}</code> <button class="btn small" id="gs-copy">Copy</button></p>
        <p class="small muted">${d.key.source === "secret" ? "Its key is the Cloudflare secret GOOGLE_SERVICE_ACCOUNT." : "Its key was pasted here; it is never shown again. Same account for every class of this ClassBot."}</p>
        ${d.key.source === "settings" ? `<div class="set-foot" style="justify-content:flex-start"><button class="btn small" id="gs-key-new">Replace the key</button><button class="btn small danger" id="gs-key-del">Remove the key</button></div>` : ""}`
        : `<p class="small muted" style="margin-top:0">A Google “service account”: a robot account that only sees the sheets you share with it. Free, once, about 5 minutes:</p>`}
      <div id="gs-key-form" ${d.key ? "hidden" : ""}>
        <ol class="gs-steps small">
          <li>Open <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a> and create a project (any name, e.g. <i>ClassBot</i>).</li>
          <li>Enable the <a href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" target="_blank" rel="noopener">Google Sheets API</a> for this project (<b>Enable</b>).</li>
          <li><a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener">IAM → Service accounts</a> → <b>Create service account</b>: a name, then <b>Done</b> (no role needed).</li>
          <li>Click it → <b>Keys</b> → <b>Add key</b> → <b>Create new key</b> → <b>JSON</b>: a file downloads.</li>
          <li>Open that file, copy everything, paste it here.</li>
        </ol>
        <label for="gs-key">JSON key</label>
        <textarea id="gs-key" rows="4" spellcheck="false" autocomplete="off" placeholder='{ "type": "service_account", "project_id": "…", "private_key": "-----BEGIN PRIVATE KEY-----…", "client_email": "…@….iam.gserviceaccount.com", … }' style="width:100%;font-family:var(--mono, monospace);font-size:12px"></textarea>
        <div class="set-foot" style="justify-content:flex-start"><button class="btn primary" id="gs-key-save">Save the key</button><span class="small muted">Tested with Google first. Kept in ClassBot's database, never shown again.</span></div>
      </div>
    </div>

    <div class="panel set-card"><h3>2 · Your sheet</h3>
      ${d.sheet ? `<p>📗 <a href="${esc(d.sheet.url)}" target="_blank" rel="noopener">Open the linked sheet</a></p>` : ""}
      <p class="small muted" style="margin-top:0">${email ? `In the sheet: <b>Share</b> → add <code>${esc(email)}</code> as <b>Editor</b>.` : "Once the key is saved: share the sheet with ClassBot's account as Editor."}
        An .xlsx uploaded to Drive must first be saved as a Google Sheet (File → Save as Google Sheets).</p>
      <label for="gs-url">Link of the Google Sheet</label>
      <div class="toolbar" style="margin:0"><input type="url" id="gs-url" placeholder="https://docs.google.com/spreadsheets/d/…/edit" value="${esc(d.sheet?.url || "")}" style="flex:1;min-width:220px">
        <button class="btn ${d.sheet ? "" : "primary"}" id="gs-link">${d.sheet ? "Change" : "Link"}</button>${d.sheet ? `<button class="btn" id="gs-unlink">Unlink</button>` : ""}</div>
      <div id="gs-tabs"></div>
      ${d.sheet ? `<label class="check" style="margin-top:12px"><input type="checkbox" id="gs-auto" ${d.auto ? "checked" : ""}> Fill it by myself</label>
        <p class="small muted" style="margin:2px 0 0 26px">2 minutes after you finalize a debrief, set a sprint level or send a plan d'action; every Monday morning; the day after a sprint ends.</p>` : ""}
    </div>

    ${d.sheet ? `<div class="panel set-card"><h3>3 · Fill</h3>
      <ul class="gs-what small">
        <li><b>Niveau technique</b>: each student's level per sprint (S1…S8) once the sprint ended: your level, else the proposed one.</li>
        <li><b>Suivi et Validation Classe</b>: per sprint, the briefs, their start and end dates, the individual debriefing (Non · En cours · Oui); collective debriefing and retro “Oui” once every debrief is finalized.</li>
        <li><b>Plan d'action</b>: every plan sent: student, level, difficulties, start, actions, end.</li>
        <li><b>Suivi fil rouge</b>: never touched. The other columns (scores, decision, Simplonline…) neither.</li>
      </ul>
      <p class="small muted">ClassBot writes its values over what is in those cells; a cell it has nothing for is left as it is.</p>
      <div class="set-foot" style="justify-content:flex-start"><button class="btn primary" id="gs-fill">📗 Fill now</button></div>
      <div id="gs-last">${gsLast(d.last)}</div></div>

    <div class="panel set-card"><h3>4 · Names</h3>
      <p class="small muted" style="margin-top:0">The students are found by their name in column A of Niveau technique (Discord name and intranet name). Check them once; pick the right one where ClassBot is wrong.</p>
      <div id="gs-names"><button class="btn" id="gs-names-load">Check the names</button></div></div>` : ""}`;

  if ($("#gs-copy", root)) $("#gs-copy", root).onclick = () => navigator.clipboard?.writeText(email).then(() => toast("Copied")).catch(() => {});
  if ($("#gs-key-new", root)) $("#gs-key-new", root).onclick = () => { $("#gs-key-form", root).hidden = false; $("#gs-key", root).focus(); };
  if ($("#gs-key-del", root)) $("#gs-key-del", root).onclick = () => confirmDialog("Remove the Google key?", "ClassBot can't fill any sheet until a key is pasted again. The sheets stay as they are.", "Remove",
    async () => again(await api("/settings/gsheet/key", { method: "DELETE" })), true);
  $("#gs-key-save", root).onclick = (e) => busy(e.currentTarget, async () => {
    const r = await api("/settings/gsheet/key", { method: "PUT", body: { key: $("#gs-key", root).value } });
    toast("Key saved: Google accepted it");
    again(r);
  });
  $("#gs-link", root).onclick = (e) => busy(e.currentTarget, async () => {
    const r = await api("/settings/gsheet", { method: "PUT", body: { url: $("#gs-url", root).value } });
    await gsheetSettings(root, r);
    const t = r.tabs?.tabs || {};
    const ok = (k, n) => `<li>${t[k] ? `✅ <b>${esc(n)}</b> → “${esc(t[k])}”` : `⚠️ no “${esc(n)}” tab: skipped`}</li>`;
    $("#gs-tabs", root).innerHTML = `<p class="small" style="margin:10px 0 2px">Linked to <b>${esc(r.tabs?.title || "the sheet")}</b>:</p><ul class="small gs-what">${ok("niveau", "Niveau technique")}${ok("suivi", "Suivi et Validation Classe")}${ok("plan", "Plan d'action")}</ul>`;
    toast("Sheet linked");
  });
  if ($("#gs-unlink", root)) $("#gs-unlink", root).onclick = () => confirmDialog("Unlink this sheet?", "ClassBot stops filling it. What it already wrote stays in the sheet.", "Unlink",
    async () => again(await api("/settings/gsheet", { method: "PUT", body: { unlink: true } })), true);
  if ($("#gs-auto", root)) $("#gs-auto", root).onchange = async (e) => { await api("/settings/gsheet", { method: "PUT", body: { auto: e.target.checked } }); toast(e.target.checked ? "Filled by itself" : "Only when you click Fill now"); };
  if ($("#gs-fill", root)) $("#gs-fill", root).onclick = (e) => busy(e.currentTarget, async () => {
    const r = await api("/settings/gsheet/fill", { method: "POST", body: {} });
    $("#gs-last", root).innerHTML = gsLast(r.result);
    toast(r.result.ok ? "Sheet filled" : "The sheet couldn't be filled", !r.result.ok);
  });
  if ($("#gs-names-load", root)) $("#gs-names-load", root).onclick = (e) => busy(e.currentTarget, async () => gsNames($("#gs-names", root), await api("/settings/gsheet/names")));
}

function gsNames(box, n) {
  const opts = (uid) => `<option value="">— nobody —</option>${n.students.map((s) => `<option value="${esc(s.id)}" ${s.id === uid ? "selected" : ""}>${esc(s.name)}</option>`).join("")}`;
  const used = new Set(n.rows.map((r) => r.uid).filter(Boolean));
  const free = n.students.filter((s) => !used.has(s.id));
  box.innerHTML = n.rows.length ? `<div class="table-wrap"><table class="grid-table gs-tbl"><thead><tr><th>Row</th><th>In the sheet</th><th>Student in ClassBot</th></tr></thead><tbody>
      ${n.rows.map((r) => `<tr class="${r.uid ? "" : "gs-none"}"><td class="muted">${r.row}</td><td>${esc(r.name)}</td><td><select data-gs-name="${esc(r.name)}">${opts(r.uid)}</select>
        ${r.chosen ? `<button class="btn small" data-gs-auto="${esc(r.name)}" title="Let ClassBot find them again">Auto</button>` : `<span class="small muted">${r.uid ? "found" : "not found"}</span>`}</td></tr>`).join("")}</tbody></table></div>
    ${free.length ? `<p class="small muted">Students not in the sheet: ${free.map((s) => esc(s.name)).join(" · ")}</p>` : ""}
    <div class="set-foot" style="justify-content:flex-start"><button class="btn primary" id="gs-names-save">Save the names</button></div>`
    : `<p class="empty small">No name in column A of Niveau technique (from row 3).</p>`;
  const save = (map) => api("/settings/gsheet/names", { method: "PUT", body: { map } }).then((r) => { toast("Names saved"); gsNames(box, r); });
  if ($("#gs-names-save", box)) $("#gs-names-save", box).onclick = (e) => busy(e.currentTarget, () => {
    const map = {};
    $$("[data-gs-name]", box).forEach((s) => { const r = n.rows.find((x) => x.name === s.dataset.gsName); if (r && (r.chosen || s.value !== r.uid)) map[s.dataset.gsName] = s.value; });
    return save(map);
  });
  $$("[data-gs-auto]", box).forEach((b) => b.onclick = () => busy(b, () => save({ [b.dataset.gsAuto]: "auto" })));
}
