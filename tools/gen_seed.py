"""Generates migrations/0002_seed.sql: the built-in challenge bank.

Every "output" challenge is executed here, so the stored answer is exactly what
Python prints, never a guess. Add your own challenges below and re-run:

    python tools/gen_seed.py
"""
import contextlib
import io
import json
import time
from pathlib import Path

NOW = 1767225600  # fixed timestamp so the file is reproducible

# --------------------------------------------------------------------------
# Quick challenges (answered inside Discord). Each has an English and a French
# version. kind: output (type the printed result) | mcq | bug | complexity
# (multiple choice, answer is a letter).
# --------------------------------------------------------------------------
QUICK = [
    # ----------------------------------------------------------- EASY
    dict(kind="output", difficulty="easy", topic="lists", code="""x = [1, 2, 3]
y = x
y.append(4)
print(len(x))""",
         en=dict(title="Shared list", question="What does this code print?",
                 hint="`y = x` does not copy the list.",
                 explanation="`y` and `x` are two names for the same list, so appending through `y` changes `x` too: it has 4 elements."),
         fr=dict(title="Liste partagée", question="Qu'affiche ce code ?",
                 hint="`y = x` ne copie pas la liste.",
                 explanation="`y` et `x` désignent la même liste : ajouter un élément via `y` modifie aussi `x`, qui contient donc 4 éléments.")),
    dict(kind="output", difficulty="easy", topic="strings", code="""s = "hello"
print(s[1:4])""",
         en=dict(title="Slice it", question="What does this code print?",
                 hint="Slices include the start index and exclude the end index.",
                 explanation="`s[1:4]` takes indices 1, 2 and 3: 'e', 'l', 'l'."),
         fr=dict(title="Tranche de texte", question="Qu'affiche ce code ?",
                 hint="Une tranche inclut l'indice de début et exclut l'indice de fin.",
                 explanation="`s[1:4]` prend les indices 1, 2 et 3 : 'e', 'l', 'l'.")),
    dict(kind="output", difficulty="easy", topic="operators", code="""print(7 // 2, 7 % 2)""",
         en=dict(title="Divide and conquer", question="What does this code print?",
                 hint="`//` is integer division, `%` is the remainder.",
                 explanation="7 // 2 = 3 (integer division) and 7 % 2 = 1 (remainder)."),
         fr=dict(title="Diviser pour régner", question="Qu'affiche ce code ?",
                 hint="`//` est la division entière, `%` le reste.",
                 explanation="7 // 2 = 3 (division entière) et 7 % 2 = 1 (reste).")),
    dict(kind="complexity", difficulty="easy", topic="complexity",
         choices=["O(1)", "O(log n)", "O(n)", "O(n log n)"], answer="A",
         en=dict(title="Index access", question="What is the time complexity of reading `my_list[i]` in Python?",
                 hint="A Python list is an array under the hood.",
                 explanation="Lists are arrays: the address of element i is computed directly, so access is O(1)."),
         fr=dict(title="Accès par indice", question="Quelle est la complexité de la lecture de `ma_liste[i]` en Python ?",
                 hint="Une liste Python est un tableau en interne.",
                 explanation="Les listes sont des tableaux : l'adresse de l'élément i est calculée directement, l'accès est donc en O(1).")),
    dict(kind="bug", difficulty="easy", topic="functions", code="""def average(nums):
    total = 0
    for n in nums:
        total += n
    return total / len(nums) - 1""",
         answer="C",
         en=dict(title="Average trouble", question="This function should return the average of a list. What is wrong?",
                 choices=["`total` should start at 1", "The loop skips the last element",
                          "It subtracts 1 from the result", "Nothing, it works"],
                 hint="Read the return line slowly.",
                 explanation="`total / len(nums) - 1` computes the average and then subtracts 1. It should be `total / len(nums)`."),
         fr=dict(title="Moyenne bancale", question="Cette fonction doit renvoyer la moyenne d'une liste. Quel est le problème ?",
                 choices=["`total` devrait commencer à 1", "La boucle saute le dernier élément",
                          "Elle soustrait 1 au résultat", "Rien, elle fonctionne"],
                 hint="Relis lentement la ligne `return`.",
                 explanation="`total / len(nums) - 1` calcule la moyenne puis soustrait 1. Il faut `total / len(nums)`.")),
    # --------------------------------------------------------- MEDIUM
    dict(kind="output", difficulty="medium", topic="recursion", code="""def f(n):
    if n <= 1:
        return n
    return f(n - 1) + f(n - 2)
print(f(7))""",
         en=dict(title="Recursive rabbits", question="What does this code print?",
                 hint="f(0)=0, f(1)=1, and each value is the sum of the two before.",
                 explanation="This is Fibonacci: 0, 1, 1, 2, 3, 5, 8, 13. f(7) = 13."),
         fr=dict(title="Lapins récursifs", question="Qu'affiche ce code ?",
                 hint="f(0)=0, f(1)=1, et chaque valeur est la somme des deux précédentes.",
                 explanation="C'est Fibonacci : 0, 1, 1, 2, 3, 5, 8, 13. f(7) = 13.")),
    dict(kind="output", difficulty="medium", topic="dictionaries", code="""d = {}
for w in "the cat and the hat".split():
    d[w] = d.get(w, 0) + 1
print(d["the"], len(d))""",
         en=dict(title="Word counter", question="What does this code print?",
                 hint="Count how many distinct words there are.",
                 explanation="'the' appears twice; the distinct words are the, cat, and, hat → 4 keys."),
         fr=dict(title="Compteur de mots", question="Qu'affiche ce code ?",
                 hint="Compte le nombre de mots différents.",
                 explanation="'the' apparaît deux fois ; les mots distincts sont the, cat, and, hat → 4 clés.")),
    dict(kind="output", difficulty="medium", topic="generators", code="""nums = [1, 2, 3, 4, 5, 6]
print(sum(n * n for n in nums if n % 2 == 0))""",
         en=dict(title="Even squares", question="What does this code print?",
                 hint="Square only the even numbers, then add them up.",
                 explanation="Even numbers 2, 4, 6 → squares 4, 16, 36 → sum 56."),
         fr=dict(title="Carrés pairs", question="Qu'affiche ce code ?",
                 hint="Élève au carré uniquement les nombres pairs, puis additionne.",
                 explanation="Nombres pairs 2, 4, 6 → carrés 4, 16, 36 → somme 56.")),
    dict(kind="complexity", difficulty="medium", topic="complexity", code="""count = 0
for i in range(n):
    for j in range(i, n):
        count += 1""",
         choices=["O(n)", "O(n log n)", "O(n²)", "O(2ⁿ)"], answer="C",
         en=dict(title="Triangle loops", question="What is the time complexity of this code?",
                 hint="The inner loop runs n, then n-1, then n-2... times.",
                 explanation="n + (n-1) + ... + 1 = n(n+1)/2 iterations, which is O(n²)."),
         fr=dict(title="Boucles en triangle", question="Quelle est la complexité de ce code ?",
                 hint="La boucle interne s'exécute n, puis n-1, puis n-2... fois.",
                 explanation="n + (n-1) + ... + 1 = n(n+1)/2 itérations, soit O(n²).")),
    dict(kind="bug", difficulty="medium", topic="indexing", code="""def is_palindrome(s):
    for i in range(len(s)):
        if s[i] != s[len(s) - i]:
            return False
    return True""",
         answer="B",
         en=dict(title="Mirror, mirror", question="This should check if a string is a palindrome. What is the bug?",
                 choices=["The loop should only go to len(s) // 2", "`s[len(s) - i]` is out of range when i = 0",
                          "It should `return True` inside the loop", "Nothing, it works"],
                 hint="What is `s[len(s)]`?",
                 explanation="When i = 0 the code reads `s[len(s)]`, which raises IndexError. It should be `s[len(s) - 1 - i]`. Stopping at len(s)//2 is only an optimization."),
         fr=dict(title="Miroir, miroir", question="Ce code doit vérifier si une chaîne est un palindrome. Où est le bug ?",
                 choices=["La boucle devrait s'arrêter à len(s) // 2", "`s[len(s) - i]` dépasse quand i = 0",
                          "Il faut `return True` dans la boucle", "Rien, il fonctionne"],
                 hint="Que vaut `s[len(s)]` ?",
                 explanation="Quand i = 0, le code lit `s[len(s)]`, ce qui lève IndexError. Il faut `s[len(s) - 1 - i]`. S'arrêter à len(s)//2 n'est qu'une optimisation.")),
    dict(kind="mcq", difficulty="medium", topic="data structures",
         choices=["list", "set", "tuple", "str"], answer="B",
         en=dict(title="Fast lookup", question="Which built-in type gives O(1) average-time membership tests (`x in container`)?",
                 hint="Think of hashing.",
                 explanation="Sets are hash tables, so `x in my_set` is O(1) on average; lists, tuples and strings are scanned in O(n)."),
         fr=dict(title="Recherche rapide", question="Quel type natif offre un test d'appartenance (`x in conteneur`) en O(1) en moyenne ?",
                 hint="Pense au hachage.",
                 explanation="Les ensembles (set) sont des tables de hachage : `x in mon_set` est en O(1) en moyenne ; les listes, tuples et chaînes sont parcourus en O(n).")),
    # ----------------------------------------------------------- HARD
    dict(kind="output", difficulty="hard", topic="closures", code="""def make():
    fs = []
    for i in range(3):
        fs.append(lambda: i)
    return [f() for f in fs]
print(make())""",
         en=dict(title="Late binding", question="What does this code print?",
                 hint="When is `i` looked up: when the lambda is created or when it is called?",
                 explanation="Closures capture the variable, not its value. All three lambdas read `i` after the loop ended, when i = 2."),
         fr=dict(title="Liaison tardive", question="Qu'affiche ce code ?",
                 hint="Quand `i` est-il lu : à la création de la lambda ou à son appel ?",
                 explanation="Les fermetures capturent la variable, pas sa valeur. Les trois lambdas lisent `i` après la fin de la boucle, quand i = 2.")),
    dict(kind="output", difficulty="hard", topic="default arguments", code="""def g(x, acc=[]):
    acc.append(x)
    return len(acc)
g(1)
g(2)
print(g(3))""",
         en=dict(title="Sticky default", question="What does this code print?",
                 hint="Default values are created once, when the function is defined.",
                 explanation="The same list is reused by every call, so it grows to [1, 2, 3]."),
         fr=dict(title="Valeur par défaut collante", question="Qu'affiche ce code ?",
                 hint="Les valeurs par défaut sont créées une seule fois, à la définition de la fonction.",
                 explanation="La même liste est réutilisée à chaque appel ; elle devient [1, 2, 3].")),
    dict(kind="output", difficulty="hard", topic="sorting", code="""a = [3, 1, 2]
b = sorted(a)
a.sort(reverse=True)
print(a[0] - b[0], b)""",
         en=dict(title="Sorted vs sort", question="What does this code print?",
                 hint="`sorted()` returns a new list; `.sort()` changes the list in place.",
                 explanation="b = [1, 2, 3] (a new list); a becomes [3, 2, 1]. 3 - 1 = 2."),
         fr=dict(title="sorted contre sort", question="Qu'affiche ce code ?",
                 hint="`sorted()` renvoie une nouvelle liste ; `.sort()` modifie la liste sur place.",
                 explanation="b = [1, 2, 3] (nouvelle liste) ; a devient [3, 2, 1]. 3 - 1 = 2.")),
    dict(kind="complexity", difficulty="hard", topic="complexity", code="""i = n
while i > 1:
    i //= 2""",
         choices=["O(1)", "O(log n)", "O(n)", "O(n log n)"], answer="B",
         en=dict(title="Halving", question="What is the time complexity of this loop?",
                 hint="How many times can you halve n before reaching 1?",
                 explanation="i is halved each step, so the loop runs about log₂(n) times: O(log n)."),
         fr=dict(title="Divisions par deux", question="Quelle est la complexité de cette boucle ?",
                 hint="Combien de fois peut-on diviser n par 2 avant d'atteindre 1 ?",
                 explanation="i est divisé par 2 à chaque tour : environ log₂(n) itérations, soit O(log n).")),
    dict(kind="bug", difficulty="hard", topic="iteration", code="""def remove_evens(nums):
    for n in nums:
        if n % 2 == 0:
            nums.remove(n)
    return nums
print(remove_evens([2, 4, 6, 7]))""",
         answer="B", check_output="[4, 7]",
         en=dict(title="Vanishing evens", question="This should print [7]. What actually happens?",
                 choices=["It prints [7]: it works", "It prints [4, 7]: removing while iterating skips items",
                          "It prints [2, 4, 6]", "It raises an error"],
                 hint="What happens to the loop's position when an item is removed?",
                 explanation="Removing shifts the remaining items left, so the loop skips the item after each removal: it prints [4, 7]. Iterate over a copy or build a new list."),
         fr=dict(title="Les pairs qui résistent", question="Ce code devrait afficher [7]. Que se passe-t-il vraiment ?",
                 choices=["Il affiche [7] : ça marche", "Il affiche [4, 7] : supprimer pendant le parcours saute des éléments",
                          "Il affiche [2, 4, 6]", "Il lève une erreur"],
                 hint="Que devient la position de la boucle quand on supprime un élément ?",
                 explanation="Supprimer décale les éléments suivants vers la gauche : la boucle saute l'élément après chaque suppression, d'où [4, 7]. Parcours une copie ou construis une nouvelle liste.")),
]

# --------------------------------------------------------------------------
# HackerRank problems (solved on hackerrank.com, verified by the bot).
# Edit or extend in the dashboard; slugs come from hackerrank.com/challenges/<slug>.
# --------------------------------------------------------------------------
HACKERRANK = {
    "easy": [
        ("solve-me-first", "Solve Me First"), ("simple-array-sum", "Simple Array Sum"),
        ("compare-the-triplets", "Compare the Triplets"), ("a-very-big-sum", "A Very Big Sum"),
        ("diagonal-difference", "Diagonal Difference"), ("plus-minus", "Plus Minus"),
        ("staircase", "Staircase"), ("mini-max-sum", "Mini-Max Sum"),
        ("birthday-cake-candles", "Birthday Cake Candles"), ("time-conversion", "Time Conversion"),
        ("grading", "Grading Students"), ("apple-and-orange", "Apple and Orange"),
        ("kangaroo", "Number Line Jumps"), ("between-two-sets", "Between Two Sets"),
        ("breaking-best-and-worst-records", "Breaking the Records"), ("migratory-birds", "Migratory Birds"),
        ("sock-merchant", "Sales by Match"), ("counting-valleys", "Counting Valleys"),
        ("electronics-shop", "Electronics Shop"), ("cats-and-a-mouse", "Cats and a Mouse"),
        ("picking-numbers", "Picking Numbers"), ("the-hurdle-race", "The Hurdle Race"),
        ("designer-pdf-viewer", "Designer PDF Viewer"), ("utopian-tree", "Utopian Tree"),
        ("angry-professor", "Angry Professor"), ("beautiful-days-at-the-movies", "Beautiful Days at the Movies"),
        ("strange-advertising", "Viral Advertising"), ("save-the-prisoner", "Save the Prisoner!"),
        ("circular-array-rotation", "Circular Array Rotation"), ("jumping-on-the-clouds", "Jumping on the Clouds"),
        ("repeated-string", "Repeated String"), ("equality-in-a-array", "Equalize the Array"),
        ("cut-the-sticks", "Cut the Sticks"), ("find-digits", "Find Digits"),
        ("divisible-sum-pairs", "Divisible Sum Pairs"), ("drawing-book", "Drawing Book"),
        ("camelcase", "CamelCase"), ("mars-exploration", "Mars Exploration"),
        ("pangrams", "Pangrams"), ("alternating-characters", "Alternating Characters"),
        ("caesar-cipher-1", "Caesar Cipher"), ("funny-string", "Funny String"),
        ("making-anagrams", "Making Anagrams"), ("two-strings", "Two Strings"),
        ("marcs-cakewalk", "Marc's Cakewalk"), ("grid-challenge", "Grid Challenge"),
    ],
    "medium": [
        ("climbing-the-leaderboard", "Climbing the Leaderboard"), ("extra-long-factorials", "Extra Long Factorials"),
        ("magic-square-forming", "Forming a Magic Square"), ("the-time-in-words", "The Time in Words"),
        ("organizing-containers-of-balls", "Organizing Containers of Balls"), ("encryption", "Encryption"),
        ("bigger-is-greater", "Bigger is Greater"), ("queens-attack-2", "Queen's Attack II"),
        ("non-divisible-subset", "Non-Divisible Subset"), ("3d-surface-area", "3D Surface Area"),
        ("absolute-permutation", "Absolute Permutation"), ("the-grid-search", "The Grid Search"),
        ("almost-sorted", "Almost Sorted"), ("larrys-array", "Larry's Array"),
        ("bomber-man", "The Bomberman Game"), ("coin-change", "The Coin Change Problem"),
        ("sherlock-and-valid-string", "Sherlock and the Valid String"), ("common-child", "Common Child"),
        ("sherlock-and-anagrams", "Sherlock and Anagrams"), ("pairs", "Pairs"),
        ("journey-to-the-moon", "Journey to the Moon"), ("count-triplets-1", "Count Triplets"),
        ("frequency-queries", "Frequency Queries"), ("candies", "Candies"),
        ("abbr", "Abbreviation"), ("largest-rectangle", "Largest Rectangle"),
    ],
    "hard": [
        ("crush", "Array Manipulation"), ("matrix-rotation-algo", "Matrix Layer Rotation"),
        ("maximum-subarray-sum", "Maximum Subarray Sum"), ("poisonous-plants", "Poisonous Plants"),
        ("queries-with-fixed-length", "Queries with Fixed Length"), ("and-xor-or", "AND xor OR"),
    ],
}


def run_python(code: str) -> str:
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        exec(compile(code, "<seed>", "exec"), {})
    return buf.getvalue().rstrip("\n")


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def main():
    rows = []
    for c in QUICK:
        answer = c.get("answer")
        if c["kind"] == "output":
            answer = run_python(c["code"])
        if "check_output" in c:
            got = run_python(c["code"])
            assert got == c["check_output"], (c["en"]["title"], got)
        for lang in ("en", "fr"):
            t = c[lang]
            choices = t.get("choices") or c.get("choices")
            rows.append(dict(
                guild_id=None, source="seed", kind=c["kind"], difficulty=c["difficulty"], lang=lang,
                code_lang="python", title=t["title"], question=t["question"], code=c.get("code"),
                choices=json.dumps(choices, ensure_ascii=False) if choices else None,
                answer=answer, alternatives=None, hint=t["hint"], explanation=t["explanation"],
                topic=c["topic"], hr_slug=None, url=None, status="active", created_by="seed", created_at=NOW,
            ))
    for diff, items in HACKERRANK.items():
        for slug, title in items:
            rows.append(dict(
                guild_id=None, source="hackerrank", kind="code", difficulty=diff, lang="any",
                code_lang=None, title=title, question=None, code=None, choices=None, answer=None,
                alternatives=None, hint=None, explanation=None, topic=None, hr_slug=slug,
                url=f"https://www.hackerrank.com/challenges/{slug}/problem", status="active",
                created_by="seed", created_at=NOW,
            ))
    cols = list(rows[0].keys())
    out = ["-- Built-in challenge bank (generated by tools/gen_seed.py, do not edit by hand)"]
    for r in rows:
        out.append(f"INSERT INTO challenges ({', '.join(cols)}) VALUES ({', '.join(q(r[c]) for c in cols)});")
    path = Path(__file__).resolve().parent.parent / "migrations" / "0002_seed.sql"
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    n_quick = sum(1 for r in rows if r["kind"] != "code")
    print(f"wrote {path.name}: {n_quick} quick challenges, {len(rows) - n_quick} HackerRank problems")


if __name__ == "__main__":
    main()
