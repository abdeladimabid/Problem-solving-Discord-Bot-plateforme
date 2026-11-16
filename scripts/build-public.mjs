// The dashboard's files, minified for the deploy: public/ (the sources, unchanged) → dist/public/ (what is served).
// Each script stays a classic script with the same global names (the files call each other's functions): esbuild's
// transform keeps a script's top-level names. A file whose names would change, or that esbuild can't read, is
// copied as it is — a build never breaks the dashboard.
import { transform } from "esbuild";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = "public", OUT = join("dist", "public");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tops = (s) => [...s.matchAll(/^(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
let before = 0, after = 0;
for (const f of readdirSync(SRC)) {
  const from = join(SRC, f), to = join(OUT, f);
  if (statSync(from).isDirectory()) { cpSync(from, to, { recursive: true }); continue; }
  const src = readFileSync(from, "utf8");
  if (!/\.(js|css)$/.test(f)) { writeFileSync(to, src); continue; }
  let out = src;
  try {
    const r = await transform(src, { loader: f.endsWith(".css") ? "css" : "js", minify: true, target: "es2020", legalComments: "none", charset: "utf8" });
    out = r.code;
    if (f.endsWith(".js")) { const lost = tops(src).filter((n) => !new RegExp(`\\b${n.replace(/\$/g, "\\$")}\\b`).test(out)); if (lost.length) { console.warn(`  ${f}: kept as it is (${lost.slice(0, 3).join(", ")} would change)`); out = src; } }
  } catch (e) { console.warn(`  ${f}: kept as it is (${String(e.message || e).split("\n")[0]})`); out = src; }
  writeFileSync(to, out);
  before += src.length; after += out.length;
}
console.log(`dashboard files: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB (dist/public)`);
