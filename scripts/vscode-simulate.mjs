// Sends realistic VS Code heartbeats to ClassBot, the way wakatime-cli does (POST …/heartbeats.bulk, Basic auth,
// at most 10 per request), to try « Suivi VS Code » without VS Code.
//   npm run vscode:simulate -- --key waka_… [--key waka_…] [--url https://<bot>.workers.dev] [--minutes 90] [--live]
//   • the keys: the ones `npm run preview` prints (demo learners), or a real learner's (/vscode setup in Discord)
//   • --url: the bot (default http://localhost:8787, the preview); --minutes: how far back to start (default 90)
//   • --live: then keeps sending every 2 minutes, like a learner coding now (Ctrl+C to stop)
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const keys = args.flatMap((a, i) => (a === "--key" ? [args[i + 1]] : [])).filter(Boolean);
const base = String(opt("url", "http://localhost:8787")).replace(/\/+$/, "") + "/wakatime/api/v1";
const minutes = Math.max(5, Math.min(600, Number(opt("minutes", 90)) || 90));
const live = args.includes("--live");
if (!keys.length) {
  console.log("Give at least one key: npm run vscode:simulate -- --key waka_… (npm run preview prints demo keys)");
  process.exit(1);
}
const UA = "wakatime/v1.130.0 (windows-10.0.26100-x86_64) go1.24.4 vscode/1.105.1 vscode-wakatime/25.3.2";
const PROJECTS = [
  { name: "todo-app", root: "C:/Users/apprenant/Documents/cours/todo-app", files: [["src/app.js", "JavaScript"], ["src/style.css", "CSS"], ["index.html", "HTML"], ["src/api.js", "JavaScript"]] },
  { name: "portfolio", root: "C:/Users/apprenant/Documents/cours/portfolio", files: [["index.html", "HTML"], ["css/main.css", "CSS"], ["js/menu.js", "JavaScript"]] },
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const slashes = (dir) => (dir.endsWith("/") ? dir : dir + "/").split("/").length - 1;   // project_root_count, as the CLI counts it

/** One learner's VS Code: a heartbeat every ~2 minutes on the same file, at once on a file switch or a save. */
function learner() {
  const p = pick(PROJECTS);
  const lines = {};
  let file = pick(p.files);
  return (t) => {
    if (Math.random() < 0.25) file = pick(p.files);
    const [rel, language] = file;
    const before = lines[rel] ?? 40 + Math.floor(Math.random() * 100);
    const typed = Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 6) : 0;
    lines[rel] = before + typed;
    const ai = Math.random() < 0.06;
    return {
      entity: `${p.root}/${rel}`, type: "file", category: ai ? "ai coding" : "coding", time: t, project: p.name, project_root_count: slashes(p.root),
      language, lines: lines[rel], lineno: 1 + Math.floor(Math.random() * lines[rel]), cursorpos: 1 + Math.floor(Math.random() * 40),
      is_write: typed > 0 && Math.random() < 0.35, ...(typed ? (ai ? { ai_line_changes: typed * 4 } : { human_line_changes: typed }) : {}), user_agent: UA,
    };
  };
}

async function send(key, hbs) {
  for (let i = 0; i < hbs.length; i += 10) {
    const res = await fetch(base + "/users/current/heartbeats.bulk", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Basic " + Buffer.from(key).toString("base64"), "user-agent": UA },
      body: JSON.stringify(hbs.slice(i, i + 10)),
    });
    if (res.status !== 202 && res.status !== 201) throw new Error(`${res.status} ${await res.text()}`);
  }
}
async function bar(key) {
  const res = await fetch(base + "/users/current/statusbar/today", { headers: { authorization: "Basic " + Buffer.from(key).toString("base64") } });
  const d = await res.json().catch(() => ({}));
  return res.status === 200 ? d.data?.grand_total?.text : `${res.status} ${d.error ?? ""}`;
}

const people = keys.map((key) => ({ key, next: learner(), t: Date.now() / 1000 - minutes * 60 }));
for (const p of people) {
  const hbs = [];
  const now = Date.now() / 1000;
  while (p.t < now - 30) {
    hbs.push(p.next(Math.round(p.t * 1000) / 1000));
    p.t += Math.random() < 0.06 ? 600 + Math.random() * 600 : 45 + Math.random() * 90;   // now and then a break
  }
  try {
    await send(p.key, hbs);
    console.log(`…${p.key.slice(-4)}: ${hbs.length} heartbeats · status bar: ${await bar(p.key)}`);
  } catch (e) { console.log(`…${p.key.slice(-4)}: ${e.message}`); }
}
if (live) {
  console.log("Live: a heartbeat batch every 2 minutes per learner (Ctrl+C to stop)");
  setInterval(async () => {
    for (const p of people) {
      const now = Date.now() / 1000;
      const hbs = [p.next(now - 60), p.next(now - 5)];
      try { await send(p.key, hbs); console.log(`${new Date().toLocaleTimeString()} …${p.key.slice(-4)} · ${await bar(p.key)}`); } catch (e) { console.log(`…${p.key.slice(-4)}: ${e.message}`); }
    }
  }, 120000);
}
