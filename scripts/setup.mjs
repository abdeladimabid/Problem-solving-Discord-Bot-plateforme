// ClassBot setup assistant: does the whole Cloudflare + Discord setup for you.
//
//   npm run setup           first-time setup; on a ClassBot already installed, an update (packages, new tables,
//                           deploy). Either way, an old GitHub Watcher on the Cloudflare account is imported by itself.
//   npm run setup -- --full redo the whole setup (Discord token, server, commands)
//   npm run setup:access    after enabling Cloudflare Access on the dashboard
//
// You only need: a Discord application with a bot token, and a Cloudflare account.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_FILE = join(ROOT, ".setup.json");
const BOT_CFG = join(ROOT, "wrangler.bot.jsonc");
const ADMIN_CFG = join(ROOT, "wrangler.admin.jsonc");
// your own settings are made once from the examples (they aren't in git: a pull never changes them)
for (const n of ["bot", "admin"]) {
  const mine = join(ROOT, `wrangler.${n}.jsonc`), ex = join(ROOT, `wrangler.${n}.example.jsonc`);
  if (!existsSync(mine) && existsSync(ex)) copyFileSync(ex, mine);
}
const DISCORD = process.env.CLASSBOT_DISCORD_API || "https://discord.com/api/v10";
// View Channels, Send Messages, Embed Links, Read Message History, Manage Roles
const BOT_PERMISSIONS = 1024 + 2048 + 16384 + 65536 + 268435456;

const C = { bold: (s) => `\x1b[1m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m` };
const step = (n, s) => console.log(`\n${C.bold(`[${n}] ${s}`)}`);
const ok = (s) => console.log(C.green("  ✔ " + s));
const warn = (s) => console.log(C.yellow("  ! " + s));
const fail = (s) => { console.log(C.red("\n✖ " + s)); process.exit(1); };

const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

// ------------------------------------------------------------------ input
function ask(q) {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); res(a.trim()); });
  });
}
function askHidden(q) {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); else if (!/[\r\n]/.test(s)) rl.output.write("*".repeat(s.length)); };
    rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); res(a.trim()); });
    muted = true;
  });
}

// --------------------------------------------------------------- commands
/** Run a command; output is shown live. Returns { code, out } (out = captured stdout+stderr). */
function run(cmd, { input, capture = true, env, quiet = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, {
      cwd: ROOT, shell: true, env: { ...process.env, ...env },
      stdio: [input !== undefined ? "pipe" : capture ? "ignore" : "inherit", capture ? "pipe" : "inherit", capture ? "pipe" : "inherit"],
    });
    let out = "";
    if (capture) {
      child.stdout.on("data", (d) => { out += d; if (!quiet) process.stdout.write(C.dim(String(d))); });
      child.stderr.on("data", (d) => { out += d; if (!quiet) process.stderr.write(C.dim(String(d))); });
    }
    if (input !== undefined) { child.stdin.write(input); child.stdin.end(); }
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}
const wrangler = (args, opts) => run(`npx --yes wrangler ${args}`, opts);

function openUrl(url) {
  const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  spawn(cmd, { shell: true, stdio: "ignore", detached: true }).unref();
}

async function discord(token, method, path, body) {
  const res = await fetch(DISCORD + path, {
    method,
    headers: { Authorization: `Bot ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

// ---------------------------------------------------------------- config
function setVar(file, key, value) {
  let s = readFileSync(file, "utf8");
  const re = new RegExp(`("${key}"\\s*:\\s*)"[^"]*"`);
  if (!re.test(s)) fail(`Couldn't find "${key}" in ${file.split(/[\\/]/).pop()}.`);
  s = s.replace(re, `$1"${value}"`);
  writeFileSync(file, s);
}

// ------------------------------------------------------ steps used by the setup and the update
async function cloudflareLogin() {
  let who = await wrangler("whoami");
  if (/not authenticated|You are not logged in/i.test(who.out) || who.code !== 0) {
    console.log("  A browser page opens: log in to Cloudflare and click Allow.");
    const r = await wrangler("login", { capture: false });
    if (r.code !== 0) fail("Cloudflare login didn't finish. Run `npm run setup` again.");
    who = await wrangler("whoami");
  }
  ok("Logged in to Cloudflare");
}
// the tables: only the new ones are added (a ClassBot already installed gets those of the new version)
async function migrate() {
  const r = await wrangler("d1 migrations apply classbot-db --remote -c wrangler.bot.jsonc");
  if (r.code !== 0) fail("Updating the tables failed. See the message above, then run `npm run setup` again.");
  state.migrated = true;
  save();
  ok("Tables and challenge bank up to date");
}

// An old GitHub Watcher on this Cloudflare account: its storage (KV) is bound to ClassBot as WATCHER_KV, and the bot
// imports it by itself, once (students, briefs, squads, hand-ins, debriefs, GitHub activity). No Watcher: nothing.
async function findWatcher() {
  const r = await wrangler("kv namespace list", { quiet: true });
  let list = [];
  try { list = JSON.parse(r.out.slice(r.out.indexOf("["), r.out.lastIndexOf("]") + 1)); } catch { return null; }
  const ns = list.filter((n) => /watcher/i.test(n.title || ""));
  return ns.find((n) => n.title === "github-watcher-db") ?? ns[0] ?? null;
}
function bindWatcher(file, id) {
  let t = readFileSync(file, "utf8");
  if (/"binding"\s*:\s*"WATCHER_KV"/.test(t)) t = t.replace(/("binding"\s*:\s*"WATCHER_KV"\s*,\s*"id"\s*:\s*)"[^"]*"/, `$1"${id}"`);
  else if (/"kv_namespaces"\s*:\s*\[/.test(t)) t = t.replace(/"kv_namespaces"\s*:\s*\[/, `"kv_namespaces": [{ "binding": "WATCHER_KV", "id": "${id}" }, `);
  else if (/\n([ \t]*)"vars"\s*:/.test(t)) t = t.replace(/\n([ \t]*)"vars"\s*:/, `\n$1// the old GitHub Watcher's storage, found by npm run setup: the bot imports it once by itself\n$1"kv_namespaces": [{ "binding": "WATCHER_KV", "id": "${id}" }],\n\n$1"vars":`);
  else fail(`Couldn't add the Watcher's storage to ${file.split(/[\\/]/).pop()}.`);
  writeFileSync(file, t);
}
async function watcherStep() {
  if (state.watcher?.done) { ok("GitHub Watcher data already imported"); return false; }
  const ns = await findWatcher();
  if (!ns) return false;
  for (const f of [BOT_CFG, ADMIN_CFG]) bindWatcher(f, ns.id);
  state.watcher = { id: ns.id, title: ns.title, done: false };
  save();
  ok(`Found your GitHub Watcher (${ns.title}): its students, briefs and debriefs will be imported after the deploy`);
  return true;
}
// after the deploy: the bot imports within a minute; wait for it and say what came in
async function waitWatcher() {
  console.log("  Importing your GitHub Watcher data (about a minute)…");
  for (let i = 0; i < 18; i++) {
    await new Promise((r) => setTimeout(r, process.env.CLASSBOT_SKIP_HEALTH ? 10 : 10000));
    const r = await wrangler(`d1 execute classbot-db --remote -c wrangler.bot.jsonc --json --command "SELECT github FROM guilds WHERE github LIKE '%watcherImport%'"`, { quiet: true });
    let rows = [];
    try { rows = JSON.parse(r.out.slice(r.out.indexOf("[")))[0]?.results ?? []; } catch { continue; }
    for (const row of rows) {
      let st = null;
      try { st = JSON.parse(row.github || "{}").watcherImport; } catch { st = null; }
      if (!st?.at) continue;
      state.watcher.done = true;
      save();
      ok(`Imported from GitHub Watcher: ${st.students} students, ${st.briefs} briefs, ${st.handins} hand-ins, ${st.reviews} debriefs (${st.levels} with a level), ${st.activity} GitHub events`);
      return st;
    }
  }
  warn("The import isn't finished yet: it goes on by itself. Dashboard → Settings → GitHub & Watcher shows it when it's done.");
  return null;
}
function watcherNotes(st) {
  if (!state.watcher) return "";
  const stopCron = "remove the cron trigger of the old Watcher's Worker (Cloudflare → Workers & Pages → github-watcher → Settings → Triggers),\n  so its reports stop. Its data stays as a backup.";
  // the class uses the Watcher's own App: its webhook now goes to ClassBot (keep it Active), students do nothing
  if (st && st.keepInst) return `
  ${C.bold("Your GitHub Watcher data")} is in ClassBot (dashboard → Progress: the debriefs are drafts, finalize them there).
  Students keep their GitHub App: nothing to do for them. Last step: ${stopCron}
`;
  return `
  ${C.bold("Your GitHub Watcher data")} is in ClassBot (dashboard → Progress: the debriefs are drafts, finalize them there).
  ${C.bold("No /github for students:")} put the Watcher's GitHub App in ClassBot (dashboard → Settings → GitHub & Watcher: its App ID,
  slug, Client ID, a new client secret, a webhook secret, a new private key; and ClassBot's 3 URLs in the App), then click Import again.
  Or keep the class's new App: each student runs ${C.bold("/github")} once, and you turn off the Watcher App's webhook.
  Either way, ${stopCron}
`;
}

// ================================================================== update
// ClassBot is already installed (npm run setup finished once): the new version's packages, tables and code
async function update() {
  console.log(C.bold("\n🤖 ClassBot is already installed: updating it"));
  console.log(C.dim("  (npm run setup -- --full redoes the whole setup)\n"));
  step(1, "Packages");
  const r = await run("npm install", { capture: false });
  if (r.code !== 0) fail("npm install failed. Fix the error above, then run `npm run setup` again.");
  ok("Packages up to date");
  step(2, "Cloudflare");
  await cloudflareLogin();
  step(3, "Database");
  await migrate();
  const watcher = await watcherStep();
  step(4, "Deploying");
  for (const [cfg, name] of [["wrangler.bot.jsonc", "classbot"], ["wrangler.admin.jsonc", "classbot-admin"]]) {
    const d = await wrangler(`deploy -c ${cfg}`);
    if (d.code !== 0) fail(`Deploying ${name} failed. See the message above.`);
  }
  ok(`Bot and dashboard deployed (https://classbot-admin.${state.subdomain}.workers.dev)`);
  const st = watcher || (state.watcher && !state.watcher.done) ? await waitWatcher() : null;
  console.log(C.bold(C.green("\n✅ ClassBot is up to date.")) + " Slash commands update by themselves within a minute.");
  console.log(watcherNotes(st));
}

// ================================================================== main
async function main() {
  const [major] = process.versions.node.split(".").map(Number);
  if (major < 22) fail(`Node.js 22 or newer is needed (you have ${process.versions.node}). Install the LTS from https://nodejs.org and try again.`);

  const mine = [BOT_CFG, ADMIN_CFG].map((f) => (existsSync(f) ? readFileSync(f, "utf8") : "PASTE_")).join("\n");
  if (!process.argv.includes("--full") && state.appId && state.dbId && state.subdomain && state.guildId && !/PASTE_|YOUR-SUBDOMAIN/.test(mine)) return update();

  console.log(C.bold("\n🤖 ClassBot setup assistant"));
  console.log("It's safe to run this again: finished steps are skipped.\n");

  // ---------------------------------------------------------------- 1
  step(1, "Checking the project");
  if (!existsSync(join(ROOT, "node_modules", "wrangler"))) {
    warn("Installing dependencies (npm install)…");
    const r = await run("npm install", { capture: false });
    if (r.code !== 0) fail("npm install failed. Fix the error above, then run `npm run setup` again.");
  }
  ok("Dependencies installed");

  // ---------------------------------------------------------------- 2
  step(2, "Your Discord bot");
  let token = "";
  for (;;) {
    console.log("  If you haven't yet: https://discord.com/developers/applications → New Application,");
    console.log("  then the Bot tab → Reset Token → Copy.");
    token = await askHidden("  Paste the bot token here (it stays hidden, it's never saved in a file): ");
    if (!token) continue;
    const me = await discord(token, "GET", "/applications/@me");
    if (me.ok) {
      state.appId = me.data.id;
      state.publicKey = me.data.verify_key;
      state.appName = me.data.name;
      save();
      ok(`Token works: application "${me.data.name}" (${me.data.id})`);
      break;
    }
    warn(me.status === 401 ? "Discord says this token is invalid. Copy it again (Reset Token gives a new one)." : `Discord answered ${me.status}. Try again.`);
  }

  // ---------------------------------------------------------------- 3
  step(3, "Adding the bot to your server");
  let guilds = (await discord(token, "GET", "/users/@me/guilds")).data;
  if (!Array.isArray(guilds) || !guilds.length || state.reinvite) {
    const invite = `https://discord.com/oauth2/authorize?client_id=${state.appId}&permissions=${BOT_PERMISSIONS}&scope=bot%20applications.commands`;
    console.log("  Opening the invite page in your browser. Pick your server and click Authorize.");
    console.log(C.dim("  " + invite));
    openUrl(invite);
    for (;;) {
      await ask("  Press Enter once the bot is in your server… ");
      guilds = (await discord(token, "GET", "/users/@me/guilds")).data;
      if (Array.isArray(guilds) && guilds.length) break;
      warn("I don't see the bot in any server yet.");
    }
  }
  if (guilds.length === 1) state.guildId = guilds[0].id;
  else {
    guilds.forEach((g, i) => console.log(`   ${i + 1}. ${g.name}`));
    const n = Number(await ask("  Which server is your class? Type its number: "));
    state.guildId = (guilds[n - 1] ?? guilds[0]).id;
  }
  save();
  ok(`Server: ${guilds.find((g) => g.id === state.guildId)?.name}`);

  // ---------------------------------------------------------------- 4
  step(4, "Logging in to Cloudflare");
  await cloudflareLogin();

  // ---------------------------------------------------------------- 5
  step(5, "Database");
  if (!state.dbId) {
    const list = await wrangler("d1 list --json");
    try {
      const dbs = JSON.parse(list.out.slice(list.out.indexOf("[")));
      state.dbId = dbs.find((d) => d.name === "classbot-db")?.uuid;
    } catch { /* not JSON: no databases or old wrangler */ }
    if (!state.dbId) {
      const r = await wrangler("d1 create classbot-db");
      state.dbId = r.out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
      if (!state.dbId) fail("Couldn't create the database. See the message above.");
    }
    save();
  }
  for (const f of [BOT_CFG, ADMIN_CFG]) {
    setVar(f, "database_id", state.dbId);
    setVar(f, "DISCORD_APP_ID", state.appId);
  }
  setVar(BOT_CFG, "DISCORD_PUBLIC_KEY", state.publicKey);
  ok(`Database classbot-db (${state.dbId})`);
  await migrate();
  const watcher = await watcherStep();

  // ---------------------------------------------------------------- 6
  step(6, "Deploying to Cloudflare");
  const deploy = async (cfg, name) => {
    for (;;) {
      const r = await wrangler(`deploy -c ${cfg}`);
      const m = r.out.match(new RegExp(`https://${name}\\.([a-z0-9-]+)\\.workers\\.dev`, "i"));
      if (r.code === 0 && m) return m[1];
      if (/subdomain/i.test(r.out)) {
        warn("Your Cloudflare account needs a free workers.dev subdomain first.");
        openUrl("https://dash.cloudflare.com/?to=/:account/workers-and-pages");
        await ask("  In the page that opened, choose a subdomain (Workers & Pages asks for it), then press Enter… ");
        continue;
      }
      fail(`Deploying ${name} failed. See the message above.`);
    }
  };
  state.subdomain = await deploy("wrangler.bot.jsonc", "classbot");
  const botUrl = `https://classbot.${state.subdomain}.workers.dev`;
  const dashUrl = `https://classbot-admin.${state.subdomain}.workers.dev`;
  setVar(BOT_CFG, "PUBLIC_URL", botUrl);
  setVar(BOT_CFG, "DASHBOARD_URL", dashUrl);
  setVar(ADMIN_CFG, "PUBLIC_URL", botUrl);
  save();
  await deploy("wrangler.bot.jsonc", "classbot"); // again, now with the right URLs
  await deploy("wrangler.admin.jsonc", "classbot-admin");
  ok(`Bot:       ${botUrl}`);
  ok(`Dashboard: ${dashUrl}`);

  for (const cfg of ["wrangler.bot.jsonc", "wrangler.admin.jsonc"]) {
    const r = await wrangler(`secret put DISCORD_TOKEN -c ${cfg}`, { input: token + "\n" });
    if (r.code !== 0) fail("Saving the bot token in Cloudflare failed. See the message above.");
  }
  ok("Bot token stored as an encrypted Cloudflare secret");

  // wait until the new version answers
  for (let i = 0; i < 10 && !process.env.CLASSBOT_SKIP_HEALTH; i++) {
    const res = await fetch(botUrl + "/").catch(() => null);
    if (res?.ok && (await res.text()).includes("ClassBot")) break;
    await new Promise((r) => setTimeout(r, 3000));
  }

  // ---------------------------------------------------------------- 7
  step(7, "Connecting Discord to the bot");
  const endpoint = `${botUrl}/interactions`;
  let connected = false;
  for (let i = 0; i < 5 && !connected; i++) {
    const r = await discord(token, "PATCH", "/applications/@me", { interactions_endpoint_url: endpoint });
    if (r.ok) connected = true;
    else await new Promise((res) => setTimeout(res, process.env.CLASSBOT_SKIP_HEALTH ? 10 : 5000)); // Cloudflare can take a few seconds to serve the new version
  }
  if (connected) ok(`Discord now sends commands to ${endpoint}`);
  else {
    warn("Discord didn't accept the endpoint automatically. Do it by hand:");
    console.log(`  Developer portal → your app → General Information → Interactions Endpoint URL:\n  ${endpoint}`);
  }

  // ---------------------------------------------------------------- 8
  step(8, "Registering the slash commands");
  const reg = await run("node --experimental-strip-types --no-warnings scripts/register-commands.mjs", { env: { DISCORD_APP_ID: state.appId, DISCORD_TOKEN: token, GUILD_ID: state.guildId } });
  if (reg.code !== 0) fail("Registering commands failed. See the message above.");
  writeFileSync(join(ROOT, ".env"), `DISCORD_APP_ID=${state.appId}\nGUILD_ID=${state.guildId}\n# DISCORD_TOKEN=paste-it-here-only-if-you-run "npm run register" yourself\n`);
  ok("Commands registered");
  const wst = watcher || (state.watcher && !state.watcher.done) ? await waitWatcher() : null;

  // ---------------------------------------------------------------- done
  console.log(C.bold(C.green("\n🎉 The bot is live!")));
  console.log(`
  ${C.bold("In Discord")}, go to the channel where the bot should post and type:
      /teacher setup
  Then try /practice difficulty:Easy

  ${C.bold("Last step: choose your dashboard password")} (it holds student data):
      ${C.bold("npm run setup:password")}
${watcherNotes(wst)}`);
}

// ============================================================ access step
async function access() {
  console.log(C.bold("\n🔒 Locking the dashboard with Cloudflare Access\n"));
  if (!state.subdomain) fail("Run `npm run setup` first.");
  console.log("  In Cloudflare: Workers & Pages → classbot-admin → Settings → Domains & Routes →");
  console.log("  workers.dev → Enable Cloudflare Access. The popup shows the AUD tag.\n");
  let team = await ask("  Your team domain (Zero Trust → Settings), e.g. myschool.cloudflareaccess.com: ");
  team = team.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(team)) fail("That doesn't look like <team>.cloudflareaccess.com");
  const aud = await ask("  The AUD tag (a long code): ");
  if (!/^[0-9a-f]{32,}$/i.test(aud)) fail("That doesn't look like an AUD tag (a long hexadecimal code).");
  const certs = await fetch(`https://${team}/cdn-cgi/access/certs`).then((r) => r.ok).catch(() => false);
  if (!certs) warn("I couldn't reach that team domain's login keys. Double-check the spelling.");
  setVar(ADMIN_CFG, "TEAM_DOMAIN", `https://${team}`);
  setVar(ADMIN_CFG, "POLICY_AUD", aud);
  const r = await wrangler("deploy -c wrangler.admin.jsonc");
  if (r.code !== 0) fail("Deploy failed. See the message above.");
  state.access = true;
  save();
  const url = `https://classbot-admin.${state.subdomain}.workers.dev`;
  console.log(C.green(`\n🎉 Done! Open ${url}: you'll get a code by email, and then you're in.`));
  openUrl(url);
}

// ========================================================== password step
async function password() {
  console.log(C.bold("\n🔑 Choose the dashboard password\n"));
  if (!state.subdomain) fail("Run `npm run setup` first.");
  console.log("  Only people with this password can open your dashboard. Use at least 10 characters,");
  console.log("  e.g. three random words. You'll stay signed in for 30 days on each browser.\n");
  let pw = "";
  for (;;) {
    pw = await askHidden("  New password: ");
    if (pw.length < 10) { warn("Too short: use at least 10 characters."); continue; }
    const again = await askHidden("  Type it again: ");
    if (again !== pw) { warn("The two passwords are different. Try again."); continue; }
    break;
  }
  const d = await wrangler("deploy -c wrangler.admin.jsonc");
  if (d.code !== 0) fail("Deploying the dashboard failed. See the message above.");
  const r = await wrangler("secret put ADMIN_PASSWORD -c wrangler.admin.jsonc", { input: pw + "\n" });
  if (r.code !== 0) fail("Saving the password in Cloudflare failed. See the message above.");
  state.password = true;
  save();
  const url = `https://classbot-admin.${state.subdomain}.workers.dev`;
  console.log(C.green(`\n🎉 Done! Open ${url} and sign in with your password.`));
  console.log("  To change it later, run this command again.");
  console.log(`  ${C.bold("GitHub")} (briefs, debriefs, reports): in the dashboard, Settings → GitHub & Watcher → ${C.bold("✨ Create the GitHub App for me")} (2 clicks).`);
  openUrl(url);
}

const cmd = process.argv[2];
(cmd === "access" ? access() : cmd === "password" ? password() : main()).catch((e) => fail(e?.stack || String(e)));
