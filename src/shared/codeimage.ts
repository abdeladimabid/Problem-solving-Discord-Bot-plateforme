// Draws code as a PNG image (so it can't be copy-pasted into an AI chat).
// Pure TypeScript: a 2-bit glyph atlas, a tiny syntax colorer and a PNG
// encoder (indexed colors, compressed with the built-in CompressionStream).
import { GLYPHS_B64, GLYPH_CHARS, GLYPH_H, GLYPH_W } from "./font.ts";

const BG = [0x11, 0x18, 0x27];
// text, keyword, string, number, comment, line numbers
const COLORS = [[0xe5, 0xe7, 0xeb], [0xc4, 0xb5, 0xfd], [0x86, 0xef, 0xac], [0xfc, 0xd3, 0x4d], [0x94, 0xa3, 0xb8], [0x4b, 0x55, 0x63]];
const MAX_LINES = 40, MAX_COLS = 90, PAD = 18, GAP = 14;

let atlas: Uint8Array | null = null;
const glyphIndex = new Map<string, number>([...GLYPH_CHARS].map((c, i) => [c, i]));
function glyphs(): Uint8Array {
  if (atlas) return atlas;
  const bin = atob(GLYPHS_B64);
  const packed = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const out = new Uint8Array(packed.length * 4);
  for (let i = 0; i < packed.length; i++) for (let k = 0; k < 4; k++) out[i * 4 + k] = (packed[i] >> (6 - 2 * k)) & 3;
  atlas = out;
  return out;
}

const KEYWORDS: Record<string, string[]> = {
  python: "and as assert break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield print len range".split(" "),
  javascript: "await break case catch class const continue default delete do else export extends false finally for function if import in instanceof let new null of return super switch this throw true try typeof undefined var void while yield console".split(" "),
  php: "abstract and array as break case catch class const continue declare default do echo else elseif empty endif endforeach endwhile extends false final finally fn for foreach function global if implements include instanceof isset list match new null or print private protected public require return static switch throw true try unset use var while".split(" "),
  java: "abstract boolean break byte case catch char class continue default do double else extends false final finally float for if implements import instanceof int interface long new null package private protected public return short static super switch this throw true try void while String System".split(" "),
  c: "auto break case char const continue default do double else enum extern float for if int long return short signed sizeof static struct switch typedef unsigned void while include printf NULL".split(" "),
  cpp: "auto bool break case catch char class const continue default delete do double else false float for if include int long namespace new nullptr return std string struct switch template this true try using vector void while cout cin endl".split(" "),
};

/** One color class per character: 0 text, 1 keyword, 2 string, 3 number, 4 comment. */
function colorize(src: string, lang: string): Uint8Array {
  const kw = new Set(KEYWORDS[lang] ?? KEYWORDS.python);
  const hashComments = lang === "python" || lang === "php";
  const out = new Uint8Array(src.length);
  let i = 0;
  while (i < src.length) {
    const ch = src[i], two = src.slice(i, i + 2);
    if ((hashComments && ch === "#") || two === "//") {
      const end = src.indexOf("\n", i);
      const e = end < 0 ? src.length : end;
      out.fill(4, i, e); i = e; continue;
    }
    if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      const e = end < 0 ? src.length : end + 2;
      out.fill(4, i, e); i = e; continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      out.fill(2, i, Math.min(src.length, j + 1)); i = j + 1; continue;
    }
    if (/[0-9]/.test(ch) && !/[A-Za-z_$]/.test(src[i - 1] ?? "")) {
      let j = i;
      while (j < src.length && /[0-9._xXa-fA-F]/.test(src[j])) j++;
      out.fill(3, i, j); i = j; continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const w = src.slice(i, j).replace(/^\$/, "");
      if (kw.has(w)) out.fill(1, i, j);
      i = j; continue;
    }
    i++;
  }
  return out;
}

// ------------------------------------------------------------------ PNG
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Render code as a PNG (dark theme, line numbers, syntax colors). */
export async function codeToPng(code: string, lang: string): Promise<Uint8Array> {
  const g = glyphs();
  let lines = code.replace(/\r/g, "").replace(/\t/g, "    ").replace(/\s+$/, "").split("\n");
  if (lines.length > MAX_LINES) lines = [...lines.slice(0, MAX_LINES - 1), "…"];
  lines = lines.map((l) => (l.length > MAX_COLS ? l.slice(0, MAX_COLS - 1) + "…" : l));
  const text = lines.join("\n");
  const colors = colorize(text, lang);
  const gutter = String(lines.length).length;
  const cols = Math.max(20, ...lines.map((l) => l.length));
  const width = PAD * 2 + gutter * GLYPH_W + GAP + cols * GLYPH_W;
  const height = PAD * 2 + lines.length * GLYPH_H;
  // palette: 0 = background, then 3 ink levels for each color
  const pal = new Uint8Array(3 * (1 + COLORS.length * 3));
  pal.set(BG, 0);
  COLORS.forEach((c, ci) => {
    for (let lv = 1; lv <= 3; lv++) {
      const a = lv / 3;
      for (let k = 0; k < 3; k++) pal[3 * (1 + ci * 3 + lv - 1) + k] = Math.round(BG[k] + (c[k] - BG[k]) * a);
    }
  });
  const stride = width + 1;
  const px = new Uint8Array(stride * height);   // filter byte 0 + indices; background = 0
  const draw = (ch: string, x0: number, y0: number, color: number) => {
    const gi = glyphIndex.get(ch) ?? glyphIndex.get("?")!;
    const base = gi * GLYPH_W * GLYPH_H;
    for (let y = 0; y < GLYPH_H; y++) {
      const row = (y0 + y) * stride + 1 + x0;
      for (let x = 0; x < GLYPH_W; x++) {
        const lv = g[base + y * GLYPH_W + x];
        if (lv) px[row + x] = 1 + color * 3 + lv - 1;
      }
    }
  };
  let off = 0;
  lines.forEach((line, li) => {
    const y0 = PAD + li * GLYPH_H;
    const num = String(li + 1).padStart(gutter, " ");
    for (let k = 0; k < num.length; k++) if (num[k] !== " ") draw(num[k], PAD + k * GLYPH_W, y0, 5);
    const x0 = PAD + gutter * GLYPH_W + GAP;
    for (let k = 0; k < line.length; k++) if (line[k] !== " ") draw(line[k], x0 + k * GLYPH_W, y0, colors[off + k]);
    off += line.length + 1;
  });
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("PLTE", pal), chunk("IDAT", await deflate(px)), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
