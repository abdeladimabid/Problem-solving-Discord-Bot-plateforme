"""Builds migrations/0004_bank.sql: the verified challenge bank.

    python tools/gen_bank.py

Quick challenges ("output" kind): the expected answer is what the code really
prints. "check" snippets must print "expect", which proves the claim behind a
question (for example that the bug really happens).

Write-code problems: every test input is generated, the reference solution
computes the expected output, the brute-force solution must agree on every
small test, and the reference must run well within the time limit on the big
tests. Brute force must be too slow on big tests when the statement says so.
"""
from __future__ import annotations

import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bank_quick import QUICK  # noqa: E402
from bank_quick_js import QUICK_JS  # noqa: E402
from bank_quick_php import QUICK_PHP  # noqa: E402
from bank_write import W  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "migrations"
FIRST_BANK_MIGRATION = 4       # 0004_bank_01.sql, 0005_bank_02.sql, …
MAX_FILE = 95_000              # one migration file = one D1 request: keep them small
NOW = 1791475200
MAX_LITERAL = 90_000          # D1 statements must stay under 100 KB
MAX_EXPECTED = 30_000         # the code runner truncates output at 32 KB
LETTERS = "ABCD"

HEADER = """def gen():
    _s = [{seed}]
    def _n():
        _s[0] = (_s[0] * 1103515245 + 12345) % 2147483648
        return _s[0] >> 8
    def r(lo, hi):
        return lo + ((_n() << 23) | _n()) % (hi - lo + 1)
{params}{body}"""


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def norm(s: str) -> str:
    return " ".join(s.split())


def run_capture(code: str, stdin: str = "") -> str:
    buf = io.StringIO()
    old_in = sys.stdin
    sys.stdin = io.StringIO(stdin)
    try:
        with contextlib.redirect_stdout(buf):
            exec(compile(code, "<bank>", "exec"), {"__name__": "__main__"})
    finally:
        sys.stdin = old_in
    return buf.getvalue()


def run_program(src: str, stdin: str, timeout: float) -> tuple[str | None, float]:
    """Run a solution in a fresh interpreter. Returns (stdout or None on timeout, seconds)."""
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
        f.write(src)
        path = f.name
    t = time.perf_counter()
    try:
        p = subprocess.run([sys.executable, "-I", path], input=stdin, capture_output=True, text=True, timeout=timeout)
        dt = time.perf_counter() - t
        if p.returncode != 0:
            raise RuntimeError(f"solution crashed:\n{p.stderr[-2000:]}")
        return p.stdout, dt
    except subprocess.TimeoutExpired:
        return None, time.perf_counter() - t
    finally:
        os.unlink(path)


def make_gen(body: str, params: dict, seed: int) -> str:
    plines = "".join(f"    {k} = {v!r}\n" for k, v in params.items())
    b = "".join("    " + line + "\n" if line.strip() else "\n" for line in body.rstrip("\n").split("\n"))
    return HEADER.format(seed=seed, params=plines, body=b)


def materialize(gen_src: str) -> str:
    ns: dict = {}
    exec(gen_src, ns)
    return ns["gen"]()


def run_other(lang: str, code: str) -> str:
    """Run a JavaScript or PHP snippet, return its stdout (fails loudly on errors)."""
    suffix = ".js" if lang == "javascript" else ".php"
    src = code if lang == "javascript" else "<?php\n" + code
    with tempfile.NamedTemporaryFile("w", suffix=suffix, delete=False) as f:
        f.write(src)
        path = f.name
    try:
        cmd = ["node", path] if lang == "javascript" else ["php", "-d", "display_errors=stderr", "-d", "error_reporting=E_ALL & ~E_DEPRECATED & ~E_WARNING", path]
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        if p.returncode != 0:
            raise RuntimeError(f"{lang} snippet failed:\n{p.stderr[-1500:]}\n---\n{code}")
        return p.stdout
    finally:
        os.unlink(path)


# ============================================================ quick bank
def build_quick(rows: list[dict], bank: list[dict], code_lang: str) -> int:
    n = 0
    for c in bank:
        kind = c["kind"]
        answer = c.get("answer")
        if code_lang != "python":
            if kind == "output":
                answer = run_other(code_lang, c["code"]).rstrip("\n")
                assert answer.strip(), c["en"]["title"]
                assert len(answer) <= 200, c["en"]["title"]
            if "check" in c:
                if c["check"]:
                    sep = "\nconsole.log();\n" if code_lang == "javascript" else "\necho \"\\n\";\n"
                    out = run_other(code_lang, (c.get("code") or "") + sep + c["check"]).strip().split("\n")[-1].strip()
                else:
                    out = run_other(code_lang, c["code"]).strip()
                assert out == c["expect"], f'{c["en"]["title"]}: check printed {out!r}, expected {c["expect"]!r}'
        elif kind == "output":
            answer = run_capture(c["code"]).rstrip("\n")
            assert answer.strip(), c["en"]["title"]
            assert len(answer) <= 200, c["en"]["title"]
        if "check" in c and code_lang == "python":
            ns: dict = {"__name__": "__main__"}
            with contextlib.redirect_stdout(io.StringIO()):
                if kind == "bug" and c.get("code"):
                    exec(c["code"], ns)
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                exec(c["check"], ns)
            got = buf.getvalue().strip()
            assert got == c["expect"], f'{c["en"]["title"]}: check printed {got!r}, expected {c["expect"]!r}'
        for lang in ("en", "fr"):
            t = c[lang]
            choices = None
            if kind != "output":
                choices = t.get("choices") or (c.get("fr_choices") if lang == "fr" else None) or c.get("choices")
                assert choices and len(choices) == 4, (c["en"]["title"], lang)
                assert answer in LETTERS, c["en"]["title"]
            rows.append(dict(
                guild_id=None, source="seed", kind=kind, difficulty=c["difficulty"], lang=lang, code_lang=code_lang,
                title=t["title"], question=t["question"], code=c.get("code"),
                choices=json.dumps(choices, ensure_ascii=False) if choices else None,
                answer=answer, hint=t["hint"], explanation=t["explanation"], topic=c["topic"],
                test_set=None, time_limit=None, solution=None, status="active", created_by="seed", created_at=NOW,
            ))
        n += 1
    return n


# ============================================================ write bank
def build_write(rows: list[dict], tests: list[dict]) -> int:
    for p in W:
        slug = p["slug"]
        limit = p["time_limit"]
        print(f"  {slug:<20}", end="", flush=True)
        idx = 0
        cases = []  # (kind, input, gen, sample)
        for s in p["samples"]:
            cases.append(("sample", s, None))
        for group in ("small", "mid", "big"):
            for params in p[group]:
                seed = (zlib.crc32(f"{slug}:{group}:{idx}".encode()) % 2_000_000_000) + 1
                idx += 1
                full = {**p["defaults"], **params}
                gen_src = make_gen(p["gen"], full, seed)
                cases.append((group, materialize(gen_src), gen_src))

        brute_checked = 0
        worst = 0.0
        for i, (group, inp, gen_src) in enumerate(cases):
            out, dt = run_program(p["ref"], inp, timeout=limit * 3)
            assert out is not None, f"{slug}: reference too slow on test {i} ({group})"
            if group == "big":
                worst = max(worst, dt)
                assert dt < limit * 0.6, f"{slug}: reference takes {dt:.2f}s on test {i}, limit {limit}s"
            expected = norm(out)
            assert expected, f"{slug}: empty output on test {i}"
            assert len(expected) <= MAX_EXPECTED, f"{slug}: expected output too long on test {i}"
            if group in ("sample", "small"):
                bout, _ = run_program(p["brute"], inp, timeout=30)
                assert bout is not None and norm(bout) == expected, f"{slug}: brute and reference disagree on test {i}:\n{inp[:300]}\nref={expected[:200]}\nbrute={(bout or '')[:200]}"
                brute_checked += 1
            literal = inp if len(inp) <= MAX_LITERAL else None
            assert group == "big" or literal is not None, f"{slug}: test {i} ({group}) is too big to store ({len(inp)} bytes)"
            tests.append(dict(test_set=slug, idx=i, input=literal, gen=gen_src if group != "sample" and literal is None else None,
                              expected=expected, sample=1 if group == "sample" else 0))
        # the warning in the statement must be true: brute force times out on a big test
        if "⚠️" in p["en"]["statement"]:
            big = [c for c in cases if c[0] == "big"]
            assert big, f"{slug}: claims brute force is too slow but has no big test"
            bout, bdt = run_program(p["brute"], big[0][1], timeout=limit * 2)
            assert bout is None, f"{slug}: brute force finished in {bdt:.2f}s, the big test doesn't block O(n²)"
        print(f"{len(cases)} tests, brute ok on {brute_checked}, worst {worst:.2f}s / {limit}s")

        for lang in ("en", "fr"):
            t = p[lang]
            rows.append(dict(
                guild_id=None, source="seed", kind="write", difficulty=p["difficulty"], lang=lang, code_lang=None,
                title=t["title"], question=t["statement"], code=None, choices=None, answer=None,
                hint=t["hint"], explanation=None, topic=p["topic"], test_set=slug, time_limit=limit,
                solution=p["ref"], status="active", created_by="seed", created_at=NOW,
            ))
    return len(W)


def main():
    rows: list[dict] = []
    tests: list[dict] = []
    nq = 0
    for bank, code_lang in ((QUICK, "python"), (QUICK_JS, "javascript"), (QUICK_PHP, "php")):
        print(f"Quick challenges ({code_lang})…")
        n = build_quick(rows, bank, code_lang)
        nq += n
        print(f"  {n} verified ({n * 2} rows with French)")
    print("Write-code problems…")
    nw = build_write(rows, tests)
    out = ["-- Verified challenge bank (generated by tools/gen_bank.py: do not edit by hand)"]
    cols = list(rows[0].keys())
    for r in rows:
        out.append(f"INSERT INTO challenges ({', '.join(cols)}) VALUES ({', '.join(q(r[c]) for c in cols)});")
    tcols = list(tests[0].keys())
    for t in tests:
        line = f"INSERT INTO challenge_tests ({', '.join(tcols)}) VALUES ({', '.join(q(t[c]) for c in tcols)});"
        assert len(line.encode()) < 100_000, f"statement too long for D1: {t['test_set']} #{t['idx']}"
        out.append(line)
    for old in MIGRATIONS.glob("*_bank*.sql"):
        old.unlink()
    files: list[list[str]] = [[]]
    size = 0
    for line in out[1:]:
        n = len(line.encode()) + 1
        if files[-1] and size + n > MAX_FILE:
            files.append([])
            size = 0
        files[-1].append(line)
        size += n
    total = 0
    for i, chunk in enumerate(files):
        path = MIGRATIONS / f"{FIRST_BANK_MIGRATION + i:04d}_bank_{i + 1:02d}.sql"
        path.write_text(out[0] + f" (part {i + 1}/{len(files)})\n" + "\n".join(chunk) + "\n", encoding="utf-8")
        total += path.stat().st_size
    names = sorted(p.name for p in MIGRATIONS.glob("*.sql"))
    (ROOT / "src" / "shared" / "schema.ts").write_text(
        "// Database migrations this version of the code expects (generated by tools/gen_bank.py).\n"
        "// The dashboard's diagnostics compare this list with what D1 has applied.\n"
        f"export const MIGRATIONS = {json.dumps(names)};\n", encoding="utf-8")
    print(f"wrote {len(files)} migration files: {nq} quick + {nw} write-code problems, {len(tests)} tests, {total // 1024} KB")


if __name__ == "__main__":
    main()
