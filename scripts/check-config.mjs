// Before every deploy / migration: your own Cloudflare settings (wrangler.bot.jsonc and wrangler.admin.jsonc).
// They aren't in git (each teacher deploys to their own account), so a pull never changes them. This check:
//   • makes them from the examples the first time (then you fill them in, or run `npm run setup`)
//   • stops when a value still says PASTE / YOUR-SUBDOMAIN
//   • tells you when the example has a setting your file doesn't have yet (after an update of ClassBot)
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const red = (s) => `\x1b[31m${s}\x1b[0m`, yellow = (s) => `\x1b[33m${s}\x1b[0m`, green = (s) => `\x1b[32m${s}\x1b[0m`;

// JSON with comments → object (the comments and trailing commas wrangler accepts)
function parse(text) {
  let out = "", inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inStr) { out += c; if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "/" && n === "/") { while (i < text.length && text[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

let stop = false;
for (const n of ["bot", "admin"]) {
  const mineFile = join(ROOT, `wrangler.${n}.jsonc`), exFile = join(ROOT, `wrangler.${n}.example.jsonc`);
  if (!existsSync(mineFile)) {
    if (!existsSync(exFile)) continue;
    copyFileSync(exFile, mineFile);
    console.log(red(`✗ wrangler.${n}.jsonc didn't exist: it was made from the example.`) + ` Run ${green("npm run setup")} (or fill in its PASTE values), then try again.`);
    stop = true;
    continue;
  }
  const text = readFileSync(mineFile, "utf8");
  if (/PASTE_|YOUR-SUBDOMAIN/.test(text)) {
    console.log(red(`✗ wrangler.${n}.jsonc still has values to fill in`) + ` (PASTE… / YOUR-SUBDOMAIN). Run ${green("npm run setup")} or fill them in.`);
    stop = true;
    continue;
  }
  if (!existsSync(exFile)) continue;
  try {
    const mine = parse(text), ex = parse(readFileSync(exFile, "utf8"));
    const missing = [
      ...Object.keys(ex).filter((k) => !(k in mine) && k !== "$schema"),
      ...Object.keys(ex.vars || {}).filter((k) => !(k in (mine.vars || {}))).map((k) => `vars.${k}`),
    ];
    if (missing.length) console.log(yellow(`! wrangler.${n}.jsonc doesn't have these settings of the new example yet: ${missing.join(", ")}.`) + ` Copy them from wrangler.${n}.example.jsonc.`);
    if (ex.compatibility_date && mine.compatibility_date && mine.compatibility_date < ex.compatibility_date) console.log(yellow(`! wrangler.${n}.jsonc: compatibility_date ${mine.compatibility_date}, the example has ${ex.compatibility_date}.`));
  } catch (e) {
    console.log(red(`✗ wrangler.${n}.jsonc can't be read: ${e.message}`));
    stop = true;
  }
}
if (stop) process.exit(1);
