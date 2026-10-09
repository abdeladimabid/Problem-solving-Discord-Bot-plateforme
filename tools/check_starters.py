"""Checks the generated solve() starters: in every language, the starter must
read each built-in problem's input exactly like Python does.

A probe replaces the body of solve(): it folds all its arguments into one
number, then returns it in the problem's return type. Run: python tools/check_starters.py
"""
import json, os, subprocess, sys, tempfile, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from signatures import S  # noqa: E402
from bank_write import W  # noqa: E402
from gen_bank import make_gen, materialize  # noqa: E402

LANGS = ["javascript", "php", "python", "java", "cpp", "c"]


def starters():
    js = f"""
import {{ makeStarter, parseSignature }} from "{ROOT / 'src/shared/starter.ts'}";
const sigs = {json.dumps(S)};
const out = {{}};
for (const [slug, raw] of Object.entries(sigs)) {{
  const sig = parseSignature(raw);
  if (!sig) throw new Error("invalid signature " + slug);
  out[slug] = Object.fromEntries({json.dumps(LANGS)}.map((l) => [l, makeStarter(sig, l)]));
}}
console.log(JSON.stringify(out));
"""
    with tempfile.NamedTemporaryFile("w", suffix=".mts", delete=False) as f:
        f.write(js)
    try:
        p = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", f.name], capture_output=True, text=True, check=True)
    finally:
        os.unlink(f.name)
    return json.loads(p.stdout)


def probe(lang, sig):
    item = {r["n"]: r for r in sig["read"]}
    parts, ret = [], sig["ret"]
    for a in sig["args"]:
        t = item[a]["t"]
        cols = item[a].get("cols")
        parts.append({
            "javascript": {"int": f"F += {a};", "str": f"F += {a}.length;", "int[]": f"for (const v of {a}) F += v;", "str[]": f"for (const v of {a}) F += v.length;", "int[][]": f"for (const r of {a}) for (const v of r) F += v;"},
            "php": {"int": f"$F += ${a};", "str": f"$F += strlen(${a});", "int[]": f"$F += array_sum(${a});", "str[]": f"foreach (${a} as $v) $F += strlen($v);", "int[][]": f"foreach (${a} as $r) $F += array_sum($r);"},
            "python": {"int": f"F += {a}", "str": f"F += len({a})", "int[]": f"F += sum({a})", "str[]": f"F += sum(map(len, {a}))", "int[][]": f"F += sum(map(sum, {a}))"},
            "java": {"int": f"F += {a};", "str": f"F += {a}.length();", "int[]": f"for (long v : {a}) F += v;", "str[]": f"for (String v : {a}) F += v.length();", "int[][]": f"for (long[] r : {a}) for (long v : r) F += v;"},
            "cpp": {"int": f"F += {a};", "str": f"F += (long long) {a}.size();", "int[]": f"for (auto v : {a}) F += v;", "str[]": f"for (auto& v : {a}) F += (long long) v.size();", "int[][]": f"for (auto& r : {a}) for (auto v : r) F += v;"},
            "c": {"int": f"F += {a};", "str": f"F += (long long) strlen({a});", "int[]": f"for (int i = 0; i < {a}_len; i++) F += {a}[i];", "str[]": f"for (int i = 0; i < {a}_len; i++) F += (long long) strlen({a}[i]);", "int[][]": f"for (int i = 0; i < {a}_len; i++) for (int j = 0; j < {cols}; j++) F += {a}[i][j];"},
        }[lang][t])
    init = {"javascript": "let F = 0;", "php": "$F = 0;", "python": "F = 0", "java": "long F = 0;", "cpp": "long long F = 0;", "c": "long long F = 0;"}[lang]
    rets = {
        "javascript": {"int": "return F;", "str": 'return "x" + F;', "int[]": "return [F, 7];", "str[]": 'return [String(F), "ok"];'},
        "php": {"int": "return $F;", "str": 'return "x" . $F;', "int[]": "return [$F, 7];", "str[]": 'return [strval($F), "ok"];'},
        "python": {"int": "return F", "str": 'return "x" + str(F)', "int[]": "return [F, 7]", "str[]": 'return [str(F), "ok"]'},
        "java": {"int": "return F;", "str": 'return "x" + F;', "int[]": "return new long[]{F, 7};", "str[]": 'return new String[]{String.valueOf(F), "ok"};'},
        "cpp": {"int": "return F;", "str": 'return "x" + to_string(F);', "int[]": "return {F, 7};", "str[]": 'return {to_string(F), "ok"};'},
        "c": {"int": "return F;", "str": 'static char buf[64]; sprintf(buf, "x%lld", F); return buf;', "int[]": "out[0] = F; out[1] = 7; *out_len = 2;", "str[]": 'static char b[64]; sprintf(b, "%lld", F); out[0] = b; out[1] = "ok"; *out_len = 2;'},
    }[lang][ret]
    return [init, *parts, rets]


def plug(code, lang, sig):
    """Replace the default body of solve() with the probe."""
    lines = code.split("\n")
    for i, l in enumerate(lines):
        if "solve(" in l and not l.lstrip().startswith(("//", "#")):
            ind = {"javascript": "  ", "java": "        "}.get(lang, "    ")
            end = i + 1
            while end < len(lines) and not lines[end].strip().startswith(("return", "*out_len")):
                end += 1
            return "\n".join(lines[:i + 1] + [ind + x for x in probe(lang, sig)] + lines[end + 1:])
    raise RuntimeError("solve not found")


def expected(sig, inp):
    tok = inp.split()
    p = 0
    vals = {}
    for r in sig["read"]:
        n = int(vals[r["len"]]) if r.get("len") else 0
        t = r["t"]
        if t == "int": vals[r["n"]] = int(tok[p]); p += 1
        elif t == "str": vals[r["n"]] = tok[p]; p += 1
        elif t == "int[]": vals[r["n"]] = [int(x) for x in tok[p:p + n]]; p += n
        elif t == "str[]": vals[r["n"]] = tok[p:p + n]; p += n
        else:
            c = r["cols"]; vals[r["n"]] = [[int(x) for x in tok[p + i * c:p + (i + 1) * c]] for i in range(n)]; p += n * c
    item = {r["n"]: r for r in sig["read"]}
    F = 0
    for a in sig["args"]:
        v, t = vals[a], item[a]["t"]
        F += v if t == "int" else len(v) if t == "str" else sum(v) if t == "int[]" else sum(map(len, v)) if t == "str[]" else sum(map(sum, v))
    return {"int": f"{F}", "str": f"x{F}", "int[]": f"{F} 7", "str[]": f"{F} ok"}[sig["ret"]]


def run(lang, code, inp, d):
    files = {"javascript": "main.js", "php": "main.php", "python": "main.py", "java": "Main.java", "cpp": "main.cpp", "c": "main.c"}
    path = os.path.join(d, files[lang])
    Path(path).write_text(code)
    if lang == "cpp":
        subprocess.run(["g++", "-O2", "-std=c++20", path, "-o", os.path.join(d, "a")], check=True, capture_output=True)
        cmd = [os.path.join(d, "a")]
    elif lang == "c":
        r = subprocess.run(["gcc", "-O2", path, "-o", os.path.join(d, "a"), "-lm"], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        cmd = [os.path.join(d, "a")]
    elif lang == "java":
        r = subprocess.run(["javac", "-d", d, path], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        cmd = ["java", "-Xss64m", "-cp", d, "Main"]
    else:
        cmd = {"javascript": ["node"], "php": ["php"], "python": ["python3"]}[lang] + [path]
    p = subprocess.run(cmd, input=inp, capture_output=True, text=True, timeout=60)
    assert p.returncode == 0, p.stderr[-800:]
    return " ".join(p.stdout.split())


def main():
    st = starters()
    bad = 0
    for prob in W:
        slug = prob["slug"]
        sig = S[slug]
        inputs = list(prob["samples"])
        for params in (prob["mid"] or prob["small"])[:1]:
            inputs.append(materialize(make_gen(prob["gen"], {**prob["defaults"], **params}, zlib.crc32(slug.encode()) % 1000 + 1)))
        for lang in LANGS:
            code = plug(st[slug][lang], lang, sig)
            with tempfile.TemporaryDirectory() as d:
                for inp in inputs:
                    try:
                        got = run(lang, code, inp, d)
                    except Exception as e:
                        got = f"ERROR {e}"
                    want = expected(sig, inp)
                    if got != want:
                        bad += 1
                        print(f"✗ {slug} {lang}: got {got[:80]!r} want {want!r}")
                        break
        print(f"  {slug:<20} ok" if not bad else f"  {slug}")
    print("all starters read the input correctly" if not bad else f"{bad} failures")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
