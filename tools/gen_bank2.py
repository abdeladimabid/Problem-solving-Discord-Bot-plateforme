"""More challenges: web-development write-code problems (function mode), SQL, regex and Git questions.

Writes migrations/0027_bank_more*.sql. Everything is checked while generating:
- web problems: same checks as tools/gen_bank.py (reference vs brute force, timing)
- SQL: the reference query runs on every dataset; the `wrong` query must differ on at least one
- regex: the reference matches/rejects every string with JavaScript semantics (run with Node);
  the `wrong` regex must fail at least one string
Run: python3 tools/gen_bank2.py   (needs node)
"""
import json
import sqlite3
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_bank  # noqa: E402  (helpers only, its main() is not called)
from bank_web import W2  # noqa: E402
from bank_sql import SQL  # noqa: E402
from bank_regex import RX  # noqa: E402
from bank_git import GIT  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MIG = ROOT / "migrations"
FIRST = 27
MAX_FILE = 90_000
NOW = gen_bank.NOW
q = gen_bank.q


def norm_value(v):
    if isinstance(v, float):
        v = round(v, 2)
        return int(v) if v == int(v) else v
    return v


def sql_rows(schema: str, dataset: str, query: str):
    con = sqlite3.connect(":memory:")
    con.executescript(schema + "\n" + dataset)
    rows = con.execute(query).fetchall()
    con.close()
    return [[norm_value(v) for v in r] for r in rows]


def table_text(schema: str, dataset: str) -> str:
    """The shown dataset as small text tables (what students see)."""
    con = sqlite3.connect(":memory:")
    con.executescript(schema + "\n" + dataset)
    out = []
    for (name,) in con.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY rowid"):
        cur = con.execute(f"SELECT * FROM {name}")
        cols = [d[0] for d in cur.description]
        rows = [["NULL" if v is None else str(v) for v in r] for r in cur.fetchall()]
        if not rows:
            continue
        w = [max(len(c), *(len(r[i]) for r in rows)) for i, c in enumerate(cols)]
        out.append(name)
        out.append(" | ".join(c.ljust(w[i]) for i, c in enumerate(cols)))
        out.append("-+-".join("-" * x for x in w))
        out.extend(" | ".join(v.ljust(w[i]) for i, v in enumerate(r)) for r in rows)
        out.append("")
    con.close()
    return "\n".join(out).rstrip()


def schema_text(schema: str) -> str:
    lines = [ln.split("--")[0].rstrip() for ln in schema.strip().splitlines()]
    return "\n".join(ln for ln in lines if ln.strip())


def check_regex():
    payload = json.dumps([{k: x[k] for k in ("slug", "flags", "ref", "wrong", "match", "reject", "hidden_match", "hidden_reject")} for x in RX])
    js = r"""
const items = JSON.parse(require("fs").readFileSync(0, "utf8"));
const bad = [];
for (const x of items) {
  const re = new RegExp("^(?:" + x.ref + ")$", x.flags);
  for (const s of [...x.match, ...x.hidden_match]) if (!re.test(s)) bad.push(x.slug + ": ref should match " + JSON.stringify(s));
  for (const s of [...x.reject, ...x.hidden_reject]) if (re.test(s)) bad.push(x.slug + ": ref should reject " + JSON.stringify(s));
  if (x.wrong) {
    const w = new RegExp("^(?:" + x.wrong + ")$", x.flags);
    const fails = [...x.match, ...x.hidden_match].some((s) => !w.test(s)) || [...x.reject, ...x.hidden_reject].some((s) => w.test(s));
    if (!fails) bad.push(x.slug + ": the wrong regex passes everything");
  }
}
console.log(JSON.stringify(bad));
"""
    p = subprocess.run(["node", "-e", js], input=payload, capture_output=True, text=True, check=True)
    bad = json.loads(p.stdout)
    assert not bad, "\n".join(bad)


def main():
    rows: list[dict] = []
    tests: list[dict] = []

    # ---- web problems (function mode): reuse the write-code pipeline
    print("Web problems…")
    gen_bank.W = W2
    n_web = gen_bank.build_write(rows, tests)
    sig_by_slug = {p["slug"]: p for p in W2}
    for r in rows:
        p = sig_by_slug[r["test_set"]]
        r["signature"] = json.dumps(p["sig"], ensure_ascii=False)
        r["skills"] = p["skills"]

    # ---- SQL
    print("SQL…")
    for x in SQL:
        res = [sql_rows(x["schema"], d, x["ref"]) for d in x["datasets"]]
        assert res[0], f"{x['slug']}: empty result on the shown dataset"
        assert any(r != res[0] for r in res[1:]), f"{x['slug']}: hidden datasets give the same result as the shown one"
        if x.get("wrong"):
            assert any(sql_rows(x["schema"], d, x["wrong"]) != res[i] for i, d in enumerate(x["datasets"])), f"{x['slug']}: wrong query not caught"
        display = schema_text(x["schema"]) + "\n\n" + table_text(x["schema"], x["datasets"][0])
        for i, d in enumerate(x["datasets"]):
            exp = json.dumps(res[i], ensure_ascii=False, separators=(",", ":"))
            tests.append(dict(test_set=x["slug"], idx=i, input=x["schema"].strip() + "\n" + d.strip(), gen=None, expected=exp, sample=1 if i == 0 else 0))
        for lang in ("en", "fr"):
            t = x[lang]
            rows.append(dict(guild_id=None, source="seed", kind="sql", difficulty=x["difficulty"], lang=lang, code_lang=None,
                             title=t["title"], question=t["statement"], code=display, choices=None,
                             answer="ordered" if x.get("ordered", True) else "unordered", hint=t["hint"], explanation=None,
                             topic="sql", test_set=x["slug"], time_limit=2.0, solution=x["ref"], status="active",
                             created_by="seed", created_at=NOW, signature=None, skills=x.get("skills", "sql")))
        print(f"  {x['slug']:<32} {len(x['datasets'])} datasets")

    # ---- regex
    print("Regex…")
    check_regex()
    for x in RX:
        for lang in ("en", "fr"):
            t = x[lang]
            rows.append(dict(guild_id=None, source="seed", kind="regex", difficulty=x["difficulty"], lang=lang, code_lang=None,
                             title=t["title"], question=t["statement"],
                             code=json.dumps({"flags": x.get("flags", ""), "match": x["match"], "reject": x["reject"]}, ensure_ascii=False),
                             choices=None, answer=x["ref"], hint=t["hint"], explanation=None, topic="regex",
                             test_set=None, time_limit=None, solution=None, status="active", created_by="seed", created_at=NOW,
                             signature=None, skills=x.get("skills", "regex"),
                             alternatives=json.dumps({"match": x["hidden_match"], "reject": x["hidden_reject"]}, ensure_ascii=False)))
    print(f"  {len(RX)} regex challenges, all strings checked with Node")

    # ---- git questions
    for x in GIT:
        for lang in ("en", "fr"):
            t = x[lang]
            assert len(t["choices"]) == 4 and t["answer"] in "ABCD"
            rows.append(dict(guild_id=None, source="seed", kind="mcq", difficulty=x["difficulty"], lang=lang, code_lang=None,
                             title=t["title"], question=t["question"], code=x.get("code"), choices=json.dumps(t["choices"], ensure_ascii=False),
                             answer=t["answer"], hint=t.get("hint"), explanation=t["explanation"], topic="git",
                             test_set=None, time_limit=None, solution=None, status="active", created_by="seed", created_at=NOW,
                             signature=None, skills="git"))
    print(f"Git: {len(GIT)} questions")

    cols = ["guild_id", "source", "kind", "difficulty", "lang", "code_lang", "title", "question", "code", "choices", "answer", "alternatives",
            "hint", "explanation", "topic", "test_set", "time_limit", "solution", "status", "created_by", "created_at", "signature", "skills"]
    lines = []
    for r in rows:
        r.setdefault("alternatives", None)
        lines.append(f"INSERT INTO challenges ({', '.join(cols)}) VALUES ({', '.join(q(r.get(c)) for c in cols)});")
    tcols = ["test_set", "idx", "input", "gen", "expected", "sample"]
    for t in tests:
        lines.append(f"INSERT OR IGNORE INTO challenge_tests ({', '.join(tcols)}) VALUES ({', '.join(q(t[c]) for c in tcols)});")
    for ln in lines:
        assert len(ln.encode()) < 100_000, "statement too long for D1"
    for old in MIG.glob("*_bank_more*.sql"):
        old.unlink()
    files: list[list[str]] = [[]]
    size = 0
    for ln in lines:
        n = len(ln.encode()) + 1
        if files[-1] and size + n > MAX_FILE:
            files.append([])
            size = 0
        files[-1].append(ln)
        size += n
    names = []
    for i, chunk in enumerate(files):
        name = f"{FIRST + i:04d}_bank_more_{i + 1:02d}.sql"
        (MIG / name).write_text(f"-- Web, SQL, regex and Git challenges (generated by tools/gen_bank2.py: do not edit by hand) part {i + 1}/{len(files)}\n" + "\n".join(chunk) + "\n", encoding="utf-8")
        names.append(name)
    print(f"wrote {', '.join(names)}: {n_web} web problems, {len(SQL)} SQL, {len(RX)} regex, {len(GIT)} Git ({len(rows)} rows with French, {len(tests)} tests)")


if __name__ == "__main__":
    main()
