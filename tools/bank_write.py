"""Write-code problems: students submit a full program that reads stdin and
writes stdout. Each problem has a reference solution and a brute-force
solution. tools/gen_bank.py runs both on every small test (they must agree),
computes every expected output with the reference, and times it on the big
tests, so a wrong test can't ship.

Tests are produced by a tiny `gen()` body (see HEADER in gen_bank.py) using a
deterministic random generator `r(lo, hi)`. The same body runs again in the
judge (for Python submissions) so huge inputs never have to be stored.
"""

W = []


def problem(**kw):
    W.append(kw)


# ============================================================================
# EASY
# ============================================================================
problem(
    slug="second-largest", difficulty="easy", time_limit=2.0, topic="arrays",
    en=dict(title="Runner-up",
            statement="""Given **n** integers, print the **second largest distinct** value. If all values are equal, print `-1`.

**Input**
The first line contains n. The second line contains n integers.

**Output**
One integer.

**Constraints**
1 ≤ n ≤ 200 000 · |aᵢ| ≤ 10⁹""",
            hint="Duplicates of the maximum don't count as the second largest. A set or two variables will do."),
    fr=dict(title="Dauphin",
            statement="""On te donne **n** entiers. Affiche la **deuxième plus grande valeur distincte**. Si toutes les valeurs sont égales, affiche `-1`.

**Entrée**
La première ligne contient n. La deuxième contient n entiers.

**Sortie**
Un entier.

**Contraintes**
1 ≤ n ≤ 200 000 · |aᵢ| ≤ 10⁹""",
            hint="Les doublons du maximum ne comptent pas. Un ensemble ou deux variables suffisent."),
    ref="""import sys
data = sys.stdin.read().split()
n = int(data[0])
vals = sorted(set(map(int, data[1:1 + n])), reverse=True)
print(vals[1] if len(vals) > 1 else -1)
""",
    brute="""n = int(input())
a = list(map(int, input().split()))
m = max(a)
rest = [x for x in a if x != m]
print(max(rest) if rest else -1)
""",
    gen="""n = N
if SAME:
    a = [r(-1000, 1000)] * n
else:
    a = [r(-V, V) for _ in range(n)]
return f"{n}\\n{' '.join(map(str, a))}\\n"
""",
    defaults=dict(SAME=0, V=10),
    samples=["5\n3 1 4 4 2\n", "3\n7 7 7\n"],
    small=[dict(N=1), dict(N=2, V=1), dict(N=6, V=3), dict(N=8, V=100), dict(N=7, SAME=1), dict(N=10, V=2)],
    mid=[dict(N=6000, V=10**9)],
    big=[dict(N=200000, V=10**9), dict(N=200000, SAME=1)],
)

problem(
    slug="run-length", difficulty="easy", time_limit=2.0, topic="strings",
    en=dict(title="Squeeze it",
            statement="""Compress a string with **run-length encoding**: replace every maximal block of identical letters by the letter followed by the length of the block (always written, even when it is 1).

Example: `aaabccdddd` → `a3b1c2d4`

**Input**
One line with a string s of lowercase letters.

**Output**
The encoded string.

**Constraints**
1 ≤ |s| ≤ 10 000""",
            hint="Walk through the string and count how long the current letter repeats before it changes."),
    fr=dict(title="Compresse-moi",
            statement="""Compresse une chaîne avec le **codage par plages** : remplace chaque bloc maximal de lettres identiques par la lettre suivie de la longueur du bloc (toujours écrite, même quand elle vaut 1).

Exemple : `aaabccdddd` → `a3b1c2d4`

**Entrée**
Une ligne avec une chaîne s de lettres minuscules.

**Sortie**
La chaîne encodée.

**Contraintes**
1 ≤ |s| ≤ 10 000""",
            hint="Parcours la chaîne et compte combien de fois la lettre courante se répète avant de changer."),
    ref="""s = input().strip()
out = []
i = 0
while i < len(s):
    j = i
    while j < len(s) and s[j] == s[i]:
        j += 1
    out.append(s[i] + str(j - i))
    i = j
print("".join(out))
""",
    brute="""from itertools import groupby
s = input().strip()
print("".join(k + str(len(list(g))) for k, g in groupby(s)))
""",
    gen="""s = []
while len(s) < N:
    c = chr(97 + r(0, K - 1))
    s.extend(c * r(1, RUN))
return "".join(s[:N]) + "\\n"
""",
    defaults=dict(K=3, RUN=3),
    samples=["aaabccdddd\n", "z\n"],
    small=[dict(N=5, K=2), dict(N=12, K=3, RUN=4), dict(N=9, K=1), dict(N=11, K=26, RUN=1)],
    mid=[dict(N=10000, K=26, RUN=1), dict(N=10000, K=3, RUN=60)],
    big=[],
)

problem(
    slug="balanced-brackets", difficulty="easy", time_limit=2.0, topic="stacks",
    en=dict(title="Bracket police",
            statement="""For each string made of `()[]{}`, print `YES` if it is **balanced** (every bracket is closed by the matching bracket, in the right order) and `NO` otherwise.

**Input**
The first line contains q. Each of the next q lines contains one non-empty string.

**Output**
q lines, `YES` or `NO`.

**Constraints**
1 ≤ q ≤ 1 000 · each string has at most 2 000 characters""",
            hint="Push opening brackets on a stack. A closing bracket must match the top of the stack. What must the stack look like at the end?"),
    fr=dict(title="Police des parenthèses",
            statement="""Pour chaque chaîne composée de `()[]{}`, affiche `YES` si elle est **bien parenthésée** (chaque symbole ouvrant est fermé par le bon symbole, dans le bon ordre) et `NO` sinon.

**Entrée**
La première ligne contient q. Chacune des q lignes suivantes contient une chaîne non vide.

**Sortie**
q lignes, `YES` ou `NO`.

**Contraintes**
1 ≤ q ≤ 1 000 · chaque chaîne a au plus 2 000 caractères""",
            hint="Empile les symboles ouvrants. Un symbole fermant doit correspondre au sommet de la pile. À quoi doit ressembler la pile à la fin ?"),
    ref="""import sys
lines = sys.stdin.read().split()
q = int(lines[0])
pair = {")": "(", "]": "[", "}": "{"}
out = []
for s in lines[1:1 + q]:
    st = []
    ok = True
    for ch in s:
        if ch in "([{":
            st.append(ch)
        elif not st or st.pop() != pair[ch]:
            ok = False
            break
    out.append("YES" if ok and not st else "NO")
print("\\n".join(out))
""",
    brute="""q = int(input())
for _ in range(q):
    s = input().strip()
    while True:
        t = s.replace("()", "").replace("[]", "").replace("{}", "")
        if t == s:
            break
        s = t
    print("YES" if s == "" else "NO")
""",
    gen="""out = []
for _ in range(Q):
    L = r(1, MAXL)
    s, st = [], []
    for _ in range(L):
        if st and r(0, 1):
            s.append(")]}"["([{".index(st.pop())])
        else:
            c = "([{"[r(0, 2)]
            st.append(c)
            s.append(c)
    while st:
        s.append(")]}"["([{".index(st.pop())])
    if r(0, 1):
        i = r(0, len(s) - 1)
        s[i] = "()[]{}"[r(0, 5)]
    if r(0, 4) == 0 and len(s) > 1:
        s.pop(r(0, len(s) - 1))
    out.append("".join(s))
return f"{Q}\\n" + "\\n".join(out) + "\\n"
""",
    defaults=dict(),
    samples=["4\n([]{})\n([)]\n((\n{[()()]}\n"],
    small=[dict(Q=3, MAXL=2), dict(Q=10, MAXL=4), dict(Q=30, MAXL=8)],
    mid=[dict(Q=1000, MAXL=40)],
    big=[dict(Q=1000, MAXL=1000)],
)

problem(
    slug="longest-plateau", difficulty="easy", time_limit=2.0, topic="arrays",
    en=dict(title="Plateau",
            statement="""A **plateau** is a block of consecutive equal values. Print the length of the longest plateau and its value. If several plateaus have the maximum length, print the one with the **smallest value**.

**Input**
The first line contains n. The second line contains n integers.

**Output**
Two integers: the length and the value.

**Constraints**
1 ≤ n ≤ 200 000 · |aᵢ| ≤ 10⁹""",
            hint="Keep the length of the current run; when the value changes, compare it with the best so far. Don't forget the last run."),
    fr=dict(title="Plateau",
            statement="""Un **plateau** est un bloc de valeurs consécutives égales. Affiche la longueur du plus long plateau et sa valeur. Si plusieurs plateaux ont la longueur maximale, affiche celui dont la **valeur est la plus petite**.

**Entrée**
La première ligne contient n. La deuxième contient n entiers.

**Sortie**
Deux entiers : la longueur et la valeur.

**Contraintes**
1 ≤ n ≤ 200 000 · |aᵢ| ≤ 10⁹""",
            hint="Garde la longueur du bloc courant ; quand la valeur change, compare-la au meilleur. N'oublie pas le dernier bloc."),
    ref="""import sys
data = sys.stdin.read().split()
n = int(data[0])
a = list(map(int, data[1:1 + n]))
best_len, best_val = 0, None
i = 0
while i < n:
    j = i
    while j < n and a[j] == a[i]:
        j += 1
    L = j - i
    if L > best_len or (L == best_len and a[i] < best_val):
        best_len, best_val = L, a[i]
    i = j
print(best_len, best_val)
""",
    brute="""n = int(input())
a = list(map(int, input().split()))
cands = []
for i in range(n):
    j = i
    while j + 1 < n and a[j + 1] == a[i]:
        j += 1
    cands.append((-(j - i + 1), a[i]))
L, v = min(cands)
print(-L, v)
""",
    gen="""a = []
while len(a) < N:
    v = r(-V, V)
    a.extend([v] * r(1, RUN))
a = a[:N]
return f"{N}\\n{' '.join(map(str, a))}\\n"
""",
    defaults=dict(V=3, RUN=3),
    samples=["8\n5 5 2 2 2 9 9 9\n", "3\n4 -1 7\n"],
    small=[dict(N=1), dict(N=6, V=2, RUN=3), dict(N=10, V=1, RUN=4), dict(N=12, V=5, RUN=2)],
    mid=[dict(N=6000, V=50, RUN=8)],
    big=[dict(N=200000, V=10**9, RUN=20)],
)

problem(
    slug="anagram-groups", difficulty="easy", time_limit=2.0, topic="hashing",
    en=dict(title="Anagram families",
            statement="""Two words belong to the same **family** if one is an anagram of the other (same letters, same counts, any order). Print the number of families and the size of the biggest family.

**Input**
The first line contains n. Each of the next n lines contains a word of lowercase letters.

**Output**
Two integers: the number of families and the size of the largest one.

**Constraints**
1 ≤ n ≤ 100 000 · each word has 1 to 20 letters""",
            hint="Give every word a 'signature' that is the same for all anagrams, then count signatures with a dictionary."),
    fr=dict(title="Familles d'anagrammes",
            statement="""Deux mots sont de la même **famille** si l'un est l'anagramme de l'autre (mêmes lettres, mêmes nombres, ordre quelconque). Affiche le nombre de familles et la taille de la plus grande.

**Entrée**
La première ligne contient n. Chacune des n lignes suivantes contient un mot en minuscules.

**Sortie**
Deux entiers : le nombre de familles et la taille de la plus grande.

**Contraintes**
1 ≤ n ≤ 100 000 · chaque mot a de 1 à 20 lettres""",
            hint="Donne à chaque mot une « signature » identique pour toutes ses anagrammes, puis compte les signatures avec un dictionnaire."),
    ref="""import sys
from collections import Counter
data = sys.stdin.read().split()
n = int(data[0])
c = Counter("".join(sorted(w)) for w in data[1:1 + n])
print(len(c), max(c.values()))
""",
    brute="""n = int(input())
words = [input().strip() for _ in range(n)]
family = list(range(n))
for i in range(n):
    for j in range(i):
        if sorted(words[i]) == sorted(words[j]):
            family[i] = family[j]
            break
sizes = {}
for f in family:
    sizes[f] = sizes.get(f, 0) + 1
print(len(sizes), max(sizes.values()))
""",
    gen="""bases = ["".join(chr(97 + r(0, K - 1)) for _ in range(r(1, L))) for _ in range(B)]
words = []
for _ in range(N):
    w = list(bases[r(0, B - 1)])
    for i in range(len(w) - 1, 0, -1):
        j = r(0, i)
        w[i], w[j] = w[j], w[i]
    words.append("".join(w))
return f"{N}\\n" + "\\n".join(words) + "\\n"
""",
    defaults=dict(K=3, L=3, B=3),
    samples=["6\nlisten\nsilent\nenlist\ngoogle\ninlets\nbanana\n"],
    small=[dict(N=1), dict(N=6, B=3), dict(N=8, B=4, K=2, L=4), dict(N=10, B=10, K=26, L=5)],
    mid=[dict(N=5000, B=600, K=6, L=10)],
    big=[dict(N=100000, B=5000, K=8, L=20)],
)

problem(
    slug="digit-rounds", difficulty="easy", time_limit=2.0, topic="math",
    en=dict(title="Digit crusher",
            statement="""Start with a (possibly huge) number. In one **round**, replace it by the sum of its digits. Repeat until the number has a single digit. Print the number of rounds and the final digit.

**Input**
One line with the number (no leading zeros, except the number 0 itself).

**Output**
Two integers: the number of rounds and the final digit.

**Constraints**
the number has between 1 and 100 000 digits""",
            hint="The number doesn't fit comfortably in many languages: work on the string of digits. After the first round, it's small."),
    fr=dict(title="Broyeur de chiffres",
            statement="""On part d'un nombre (éventuellement énorme). En un **tour**, on le remplace par la somme de ses chiffres. On recommence jusqu'à n'avoir plus qu'un chiffre. Affiche le nombre de tours et le chiffre final.

**Entrée**
Une ligne avec le nombre (sans zéros en tête, sauf le nombre 0 lui-même).

**Sortie**
Deux entiers : le nombre de tours et le chiffre final.

**Contraintes**
le nombre a entre 1 et 100 000 chiffres""",
            hint="Le nombre ne tient pas dans un entier dans beaucoup de langages : travaille sur la chaîne de chiffres. Après le premier tour, il est petit."),
    ref="""s = input().strip()
rounds = 0
while len(s) > 1:
    s = str(sum(int(c) for c in s))
    rounds += 1
print(rounds, s)
""",
    brute="""s = input().strip()
rounds = 0
x = s
while len(x) > 1:
    x = str(sum(map(int, list(x))))
    rounds += 1
v = int(s)
d = 0 if v == 0 else (9 if v % 9 == 0 else v % 9)
assert str(d) == x
print(rounds, d)
""",
    gen="""if N == 0:
    return "0\\n"
s = [str(r(1, 9))] + [str(r(0, D)) for _ in range(N - 1)]
return "".join(s) + "\\n"
""",
    defaults=dict(D=9),
    samples=["9875\n", "7\n"],
    small=[dict(N=0), dict(N=1), dict(N=3, D=9), dict(N=12), dict(N=50, D=0), dict(N=30)],
    mid=[dict(N=60000)],
    big=[dict(N=100000)],
)

# ============================================================================
# MEDIUM
# ============================================================================
problem(
    slug="subarray-sum-k", difficulty="medium", time_limit=2.0, topic="prefix sums",
    en=dict(title="Exactly k",
            statement="""Count the **subarrays** (contiguous, non-empty) whose sum is exactly **k**. Values can be negative.

**Input**
The first line contains n and k. The second line contains n integers.

**Output**
One integer: the number of subarrays.

**Constraints**
1 ≤ n ≤ 200 000 · |aᵢ| ≤ 10 000 · |k| ≤ 10⁹

⚠️ The big tests make an O(n²) solution far too slow.""",
            hint="sum(a[i..j]) = prefix[j+1] - prefix[i]. For each j, how many earlier prefixes equal prefix[j+1] - k? A dictionary answers that in O(1)."),
    fr=dict(title="Exactement k",
            statement="""Compte les **sous-tableaux** (contigus, non vides) dont la somme vaut exactement **k**. Les valeurs peuvent être négatives.

**Entrée**
La première ligne contient n et k. La deuxième contient n entiers.

**Sortie**
Un entier : le nombre de sous-tableaux.

**Contraintes**
1 ≤ n ≤ 200 000 · |aᵢ| ≤ 10 000 · |k| ≤ 10⁹

⚠️ Les gros tests rendent une solution en O(n²) beaucoup trop lente.""",
            hint="somme(a[i..j]) = prefix[j+1] - prefix[i]. Pour chaque j, combien de préfixes précédents valent prefix[j+1] - k ? Un dictionnaire répond en O(1)."),
    ref="""import sys
data = sys.stdin.read().split()
n, k = int(data[0]), int(data[1])
seen = {0: 1}
s = 0
total = 0
for x in data[2:2 + n]:
    s += int(x)
    total += seen.get(s - k, 0)
    seen[s] = seen.get(s, 0) + 1
print(total)
""",
    brute="""n, k = map(int, input().split())
a = list(map(int, input().split()))
c = 0
for i in range(n):
    s = 0
    for j in range(i, n):
        s += a[j]
        if s == k:
            c += 1
print(c)
""",
    gen="""a = [r(-V, V) for _ in range(N)]
return f"{N} {K}\\n{' '.join(map(str, a))}\\n"
""",
    defaults=dict(V=3, K=0),
    samples=["5 3\n1 2 1 -1 3\n", "3 0\n0 0 0\n"],
    small=[dict(N=1, K=0, V=1), dict(N=5, K=3), dict(N=8, K=0, V=2), dict(N=12, K=-2, V=4), dict(N=20, K=1, V=1)],
    mid=[dict(N=6000, K=5, V=10)],
    big=[dict(N=200000, K=0, V=3), dict(N=200000, K=7, V=10000)],
)

problem(
    slug="longest-unique", difficulty="medium", time_limit=2.0, topic="sliding window",
    en=dict(title="No repeats",
            statement="""Print the length of the **longest substring** (contiguous) of s in which **no character appears twice**.

**Input**
One line with the string s. It contains printable ASCII characters, without spaces.

**Output**
One integer.

**Constraints**
1 ≤ |s| ≤ 200 000""",
            hint="Keep a window [left, right] with no repeats. When s[right] is already in the window, move left just past its previous position. Left never moves back."),
    fr=dict(title="Sans répétition",
            statement="""Affiche la longueur de la plus longue **sous-chaîne** (contiguë) de s dans laquelle **aucun caractère n'apparaît deux fois**.

**Entrée**
Une ligne avec la chaîne s. Elle contient des caractères ASCII imprimables, sans espaces.

**Sortie**
Un entier.

**Contraintes**
1 ≤ |s| ≤ 200 000""",
            hint="Garde une fenêtre [gauche, droite] sans doublon. Quand s[droite] est déjà dans la fenêtre, avance gauche juste après son ancienne position. Gauche ne recule jamais."),
    ref="""s = input().strip()
last = {}
best = left = 0
for i, ch in enumerate(s):
    if ch in last and last[ch] >= left:
        left = last[ch] + 1
    last[ch] = i
    best = max(best, i - left + 1)
print(best)
""",
    brute="""s = input().strip()
best = 0
for i in range(len(s)):
    seen = set()
    for j in range(i, len(s)):
        if s[j] in seen:
            break
        seen.add(s[j])
    best = max(best, len(seen))
print(best)
""",
    gen="""return "".join(chr(33 + r(0, A - 1)) for _ in range(N)) + "\\n"
""",
    defaults=dict(A=3),
    samples=["abcabcbb\n", "pwwkew\n", "abba\n"],
    small=[dict(N=1, A=1), dict(N=6, A=3), dict(N=10, A=2), dict(N=12, A=94), dict(N=40, A=8)],
    mid=[dict(N=60000, A=40)],
    big=[dict(N=200000, A=94), dict(N=200000, A=10)],
)

problem(
    slug="covered-length", difficulty="medium", time_limit=2.0, topic="sorting",
    en=dict(title="Painted fence",
            statement="""n painters each paint a segment [l, r) of a very long fence. Print the **total length** of fence that is painted at least once.

**Input**
The first line contains n. Each of the next n lines contains l and r.

**Output**
One integer: the painted length.

**Constraints**
1 ≤ n ≤ 200 000 · 0 ≤ l < r ≤ 10⁹""",
            hint="Sort the segments by l, then merge overlapping ones while you sweep from left to right."),
    fr=dict(title="Clôture peinte",
            statement="""n peintres peignent chacun un segment [l, r) d'une très longue clôture. Affiche la **longueur totale** de clôture peinte au moins une fois.

**Entrée**
La première ligne contient n. Chacune des n lignes suivantes contient l et r.

**Sortie**
Un entier : la longueur peinte.

**Contraintes**
1 ≤ n ≤ 200 000 · 0 ≤ l < r ≤ 10⁹""",
            hint="Trie les segments par l, puis fusionne ceux qui se chevauchent en balayant de gauche à droite."),
    ref="""import sys
data = sys.stdin.read().split()
n = int(data[0])
segs = sorted((int(data[1 + 2 * i]), int(data[2 + 2 * i])) for i in range(n))
total = 0
cur_l, cur_r = segs[0]
for l, r in segs[1:]:
    if l <= cur_r:
        cur_r = max(cur_r, r)
    else:
        total += cur_r - cur_l
        cur_l, cur_r = l, r
total += cur_r - cur_l
print(total)
""",
    brute="""n = int(input())
cells = set()
for _ in range(n):
    l, r = map(int, input().split())
    cells.update(range(l, r))
print(len(cells))
""",
    gen="""lines = []
for _ in range(N):
    l = r(0, M - 1)
    rr = min(M, l + r(1, L))
    lines.append(f"{l} {rr}")
return f"{N}\\n" + "\\n".join(lines) + "\\n"
""",
    defaults=dict(M=20, L=5),
    samples=["3\n1 4\n2 6\n8 10\n", "2\n0 5\n5 7\n"],
    small=[dict(N=1), dict(N=4), dict(N=8, M=30, L=10), dict(N=15, M=60, L=4)],
    mid=[dict(N=3500, M=10**9, L=10**6)],
    big=[dict(N=200000, M=10**9, L=10**7)],
)

problem(
    slug="meeting-rooms", difficulty="medium", time_limit=2.0, topic="sweep line",
    en=dict(title="Room booking",
            statement="""Each meeting uses a room during [s, e) (a meeting ending at time t frees its room for a meeting starting at t). Print the **minimum number of rooms** needed to hold all meetings.

**Input**
The first line contains n. Each of the next n lines contains s and e.

**Output**
One integer.

**Constraints**
1 ≤ n ≤ 200 000 · 0 ≤ s < e ≤ 10⁹""",
            hint="Turn each meeting into two events (+1 at s, -1 at e), sort them (ends before starts at the same time) and track the maximum running total."),
    fr=dict(title="Réservation de salles",
            statement="""Chaque réunion occupe une salle pendant [s, e) (une réunion qui finit à l'instant t libère sa salle pour une réunion qui commence à t). Affiche le **nombre minimum de salles** nécessaires.

**Entrée**
La première ligne contient n. Chacune des n lignes suivantes contient s et e.

**Sortie**
Un entier.

**Contraintes**
1 ≤ n ≤ 200 000 · 0 ≤ s < e ≤ 10⁹""",
            hint="Transforme chaque réunion en deux événements (+1 en s, -1 en e), trie-les (les fins avant les débuts au même instant) et suis le maximum du total courant."),
    ref="""import sys
data = sys.stdin.read().split()
n = int(data[0])
ev = []
for i in range(n):
    s, e = int(data[1 + 2 * i]), int(data[2 + 2 * i])
    ev.append((s, 1))
    ev.append((e, -1))
ev.sort()
cur = best = 0
for _, d in ev:
    cur += d
    best = max(best, cur)
print(best)
""",
    brute="""n = int(input())
m = [tuple(map(int, input().split())) for _ in range(n)]
best = 0
for s, _ in m:
    best = max(best, sum(1 for a, b in m if a <= s < b))
print(best)
""",
    gen="""lines = []
for _ in range(N):
    s = r(0, M - 1)
    e = min(M, s + r(1, L))
    lines.append(f"{s} {e}")
return f"{N}\\n" + "\\n".join(lines) + "\\n"
""",
    defaults=dict(M=20, L=5),
    samples=["3\n0 30\n5 10\n15 20\n", "2\n1 5\n5 9\n"],
    small=[dict(N=1), dict(N=5), dict(N=9, M=10, L=8), dict(N=20, M=40, L=6)],
    mid=[dict(N=3500, M=10**9, L=10**7)],
    big=[dict(N=200000, M=10**9, L=10**6)],
)

problem(
    slug="grid-escape", difficulty="medium", time_limit=2.0, topic="BFS",
    en=dict(title="Maze runner",
            statement="""A maze has `.` (free), `#` (wall), one `S` (start) and one `E` (exit). You move up, down, left or right to a free cell (S and E are free). Print the **minimum number of moves** from S to E, or `-1` if it's impossible.

**Input**
The first line contains R and C. Then R lines of C characters.

**Output**
One integer.

**Constraints**
1 ≤ R, C ≤ 500""",
            hint="Breadth-first search from S: the first time you reach a cell is with its shortest distance. Mark cells as visited when you add them to the queue."),
    fr=dict(title="Labyrinthe",
            statement="""Un labyrinthe contient `.` (libre), `#` (mur), un `S` (départ) et un `E` (sortie). On se déplace en haut, en bas, à gauche ou à droite vers une case libre (S et E sont libres). Affiche le **nombre minimum de déplacements** de S à E, ou `-1` si c'est impossible.

**Entrée**
La première ligne contient R et C. Puis R lignes de C caractères.

**Sortie**
Un entier.

**Contraintes**
1 ≤ R, C ≤ 500""",
            hint="Parcours en largeur depuis S : la première fois qu'on atteint une case, c'est avec sa plus courte distance. Marque les cases visitées au moment de les ajouter à la file."),
    ref="""import sys
from collections import deque
data = sys.stdin.read().split()
R, C = int(data[0]), int(data[1])
g = data[2:2 + R]
for i in range(R):
    j = g[i].find("S")
    if j >= 0:
        s = (i, j)
    j = g[i].find("E")
    if j >= 0:
        e = (i, j)
dist = [[-1] * C for _ in range(R)]
dist[s[0]][s[1]] = 0
q = deque([s])
while q:
    r, c = q.popleft()
    if (r, c) == e:
        break
    d = dist[r][c] + 1
    for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
        if 0 <= nr < R and 0 <= nc < C and dist[nr][nc] < 0 and g[nr][nc] != "#":
            dist[nr][nc] = d
            q.append((nr, nc))
print(dist[e[0]][e[1]])
""",
    brute="""R, C = map(int, input().split())
g = [input().strip() for _ in range(R)]
INF = float("inf")
d = {}
for i in range(R):
    for j in range(C):
        if g[i][j] == "S":
            s = (i, j)
        if g[i][j] == "E":
            e = (i, j)
d = {s: 0}
changed = True
while changed:
    changed = False
    for (r, c), v in list(d.items()):
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < R and 0 <= nc < C and g[nr][nc] != "#" and d.get((nr, nc), INF) > v + 1:
                d[(nr, nc)] = v + 1
                changed = True
print(d.get(e, -1))
""",
    gen="""g = [["#" if r(1, 100) <= P else "." for _ in range(C)] for _ in range(R)]
sr, sc = r(0, R - 1), r(0, C - 1)
while True:
    er, ec = r(0, R - 1), r(0, C - 1)
    if (er, ec) != (sr, sc):
        break
g[sr][sc] = "S"
g[er][ec] = "E"
return f"{R} {C}\\n" + "\\n".join("".join(row) for row in g) + "\\n"
""",
    defaults=dict(P=30),
    samples=["3 4\nS..#\n.#..\n...E\n", "2 3\nS#E\n.#.\n"],
    small=[dict(R=1, C=2, P=0), dict(R=3, C=3), dict(R=5, C=6, P=35), dict(R=6, C=6, P=55), dict(R=8, C=8, P=20)],
    mid=[dict(R=200, C=200, P=25)],
    big=[dict(R=500, C=500, P=30), dict(R=500, C=500, P=0)],
)

problem(
    slug="coin-combinations", difficulty="medium", time_limit=2.0, topic="dynamic programming",
    en=dict(title="Making change",
            statement="""You have n coin values (unlimited coins of each). In how many ways can you pay exactly **x**? The order of the coins doesn't matter: 2+3 and 3+2 are the same way. Print the answer **modulo 1 000 000 007**.

**Input**
The first line contains n and x. The second line contains n distinct coin values.

**Output**
One integer.

**Constraints**
1 ≤ n ≤ 50 · 1 ≤ x ≤ 20 000 · 1 ≤ cᵢ ≤ x""",
            hint="ways[v] = number of ways to make v. Loop over coins in the OUTER loop and over amounts in the inner loop, so each combination is counted once."),
    fr=dict(title="Rendre la monnaie",
            statement="""Tu as n valeurs de pièces (en quantité illimitée). De combien de façons peux-tu payer exactement **x** ? L'ordre des pièces ne compte pas : 2+3 et 3+2 sont la même façon. Affiche la réponse **modulo 1 000 000 007**.

**Entrée**
La première ligne contient n et x. La deuxième contient n valeurs de pièces distinctes.

**Sortie**
Un entier.

**Contraintes**
1 ≤ n ≤ 50 · 1 ≤ x ≤ 20 000 · 1 ≤ cᵢ ≤ x""",
            hint="ways[v] = nombre de façons de faire v. Boucle sur les pièces dans la boucle EXTÉRIEURE et sur les montants dans la boucle intérieure, pour compter chaque combinaison une seule fois."),
    ref="""n, x = map(int, input().split())
coins = list(map(int, input().split()))
MOD = 10**9 + 7
ways = [0] * (x + 1)
ways[0] = 1
for c in coins:
    for v in range(c, x + 1):
        ways[v] = (ways[v] + ways[v - c]) % MOD
print(ways[x])
""",
    brute="""from functools import lru_cache
n, x = map(int, input().split())
coins = sorted(map(int, input().split()))
@lru_cache(None)
def f(i, rest):
    if rest == 0:
        return 1
    if i == len(coins):
        return 0
    return sum(f(i + 1, rest - k * coins[i]) for k in range(rest // coins[i] + 1))
print(f(0, x) % (10**9 + 7))
""",
    gen="""pool = list(range(1, min(X, CMAX) + 1))
coins = []
for _ in range(min(N, len(pool))):
    i = r(0, len(pool) - 1)
    coins.append(pool.pop(i))
return f"{len(coins)} {X}\\n{' '.join(map(str, coins))}\\n"
""",
    defaults=dict(CMAX=10),
    samples=["3 9\n2 3 5\n", "1 7\n2\n"],
    small=[dict(N=1, X=1), dict(N=3, X=12, CMAX=6), dict(N=4, X=17, CMAX=9), dict(N=5, X=30, CMAX=12)],
    mid=[dict(N=50, X=20000, CMAX=200), dict(N=5, X=20000, CMAX=100)],
    big=[],
)

# ============================================================================
# HARD
# ============================================================================
problem(
    slug="lis", difficulty="hard", time_limit=3.0, topic="binary search · DP",
    en=dict(title="Always climbing",
            statement="""Print the length of the **longest strictly increasing subsequence** of the array (a subsequence keeps the order but can skip elements).

**Input**
The first line contains n. The second line contains n integers.

**Output**
One integer.

**Constraints**
1 ≤ n ≤ 200 000 · |aᵢ| ≤ 10⁹

⚠️ The classic O(n²) DP is far too slow for the big tests. You need O(n log n).""",
            hint="Keep tails[k] = the smallest possible last value of an increasing subsequence of length k+1. tails stays sorted, so each new value is placed with a binary search."),
    fr=dict(title="Toujours plus haut",
            statement="""Affiche la longueur de la **plus longue sous-suite strictement croissante** du tableau (une sous-suite garde l'ordre mais peut sauter des éléments).

**Entrée**
La première ligne contient n. La deuxième contient n entiers.

**Sortie**
Un entier.

**Contraintes**
1 ≤ n ≤ 200 000 · |aᵢ| ≤ 10⁹

⚠️ La programmation dynamique classique en O(n²) est bien trop lente pour les gros tests. Il faut du O(n log n).""",
            hint="Garde tails[k] = la plus petite dernière valeur possible d'une sous-suite croissante de longueur k+1. tails reste trié : chaque nouvelle valeur se place par dichotomie."),
    ref="""import sys
from bisect import bisect_left
data = sys.stdin.read().split()
n = int(data[0])
tails = []
for x in map(int, data[1:1 + n]):
    i = bisect_left(tails, x)
    if i == len(tails):
        tails.append(x)
    else:
        tails[i] = x
print(len(tails))
""",
    brute="""n = int(input())
a = list(map(int, input().split()))
dp = [1] * n
for i in range(n):
    for j in range(i):
        if a[j] < a[i]:
            dp[i] = max(dp[i], dp[j] + 1)
print(max(dp))
""",
    gen="""if MODE == 1:
    a = [i * 3 + r(0, 2) for i in range(N)]
elif MODE == 2:
    a = [r(-V, V) for _ in range(N)]
    a.sort(reverse=True)
else:
    a = [r(-V, V) for _ in range(N)]
return f"{N}\\n{' '.join(map(str, a))}\\n"
""",
    defaults=dict(V=5, MODE=0),
    samples=["8\n10 9 2 5 3 7 101 18\n", "5\n7 7 7 7 7\n"],
    small=[dict(N=1), dict(N=8), dict(N=12, V=3), dict(N=15, MODE=1), dict(N=10, MODE=2, V=4), dict(N=40, V=20)],
    mid=[dict(N=6000, V=10**9)],
    big=[dict(N=200000, V=10**9), dict(N=200000, MODE=1)],
)

problem(
    slug="inversions", difficulty="hard", time_limit=3.0, topic="divide and conquer",
    en=dict(title="Out of order",
            statement="""An **inversion** is a pair of positions i < j with aᵢ > aⱼ. Print the number of inversions.

**Input**
The first line contains n. The second line contains n integers.

**Output**
One integer (it can be larger than 2³¹).

**Constraints**
1 ≤ n ≤ 200 000 · 1 ≤ aᵢ ≤ 10⁹

⚠️ O(n²) is far too slow for the big tests.""",
            hint="Merge sort: when you take an element from the right half before elements of the left half, each remaining left element forms an inversion with it. A Fenwick tree works too."),
    fr=dict(title="Dans le désordre",
            statement="""Une **inversion** est une paire de positions i < j avec aᵢ > aⱼ. Affiche le nombre d'inversions.

**Entrée**
La première ligne contient n. La deuxième contient n entiers.

**Sortie**
Un entier (il peut dépasser 2³¹).

**Contraintes**
1 ≤ n ≤ 200 000 · 1 ≤ aᵢ ≤ 10⁹

⚠️ Une solution en O(n²) est bien trop lente pour les gros tests.""",
            hint="Tri fusion : quand on prend un élément de la moitié droite avant des éléments de la moitié gauche, chaque élément gauche restant forme une inversion avec lui. Un arbre de Fenwick marche aussi."),
    ref="""import sys
def count(a):
    n = len(a)
    if n < 2:
        return a, 0
    mid = n // 2
    left, x = count(a[:mid])
    right, y = count(a[mid:])
    inv = x + y
    merged = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            merged.append(left[i]); i += 1
        else:
            merged.append(right[j]); j += 1
            inv += len(left) - i
    merged.extend(left[i:]); merged.extend(right[j:])
    return merged, inv
data = sys.stdin.read().split()
n = int(data[0])
print(count(list(map(int, data[1:1 + n])))[1])
""",
    brute="""n = int(input())
a = list(map(int, input().split()))
print(sum(1 for i in range(n) for j in range(i + 1, n) if a[i] > a[j]))
""",
    gen="""if MODE == 1:
    a = list(range(N, 0, -1))
else:
    a = [r(1, V) for _ in range(N)]
return f"{N}\\n{' '.join(map(str, a))}\\n"
""",
    defaults=dict(V=5, MODE=0),
    samples=["5\n2 4 1 3 5\n", "4\n4 3 2 1\n"],
    small=[dict(N=1), dict(N=6), dict(N=10, V=3), dict(N=12, MODE=1), dict(N=30, V=100)],
    mid=[dict(N=6000, V=10**9)],
    big=[dict(N=200000, V=10**9), dict(N=200000, MODE=1)],
)

problem(
    slug="cheapest-route", difficulty="hard", time_limit=3.0, topic="Dijkstra",
    en=dict(title="Cheapest route",
            statement="""A country has n cities and m two-way roads, each with a toll. Print the **minimum total toll** to travel from city 1 to city n, or `-1` if city n can't be reached.

**Input**
The first line contains n and m. Each of the next m lines contains u, v, w: a road between u and v with toll w.

**Output**
One integer.

**Constraints**
2 ≤ n ≤ 100 000 · 1 ≤ m ≤ 200 000 · 1 ≤ w ≤ 10⁹ (several roads can join the same cities)""",
            hint="Dijkstra with a priority queue (heapq). Skip a popped entry if its distance is larger than the best known one."),
    fr=dict(title="Trajet le moins cher",
            statement="""Un pays a n villes et m routes à double sens, chacune avec un péage. Affiche le **péage total minimum** pour aller de la ville 1 à la ville n, ou `-1` si la ville n est inaccessible.

**Entrée**
La première ligne contient n et m. Chacune des m lignes suivantes contient u, v, w : une route entre u et v avec un péage w.

**Sortie**
Un entier.

**Contraintes**
2 ≤ n ≤ 100 000 · 1 ≤ m ≤ 200 000 · 1 ≤ w ≤ 10⁹ (plusieurs routes peuvent relier les mêmes villes)""",
            hint="Dijkstra avec une file de priorité (heapq). Ignore une entrée sortie de la file si sa distance dépasse la meilleure connue."),
    ref="""import sys, heapq
data = sys.stdin.buffer.read().split()
n, m = int(data[0]), int(data[1])
adj = [[] for _ in range(n + 1)]
p = 2
for _ in range(m):
    u, v, w = int(data[p]), int(data[p + 1]), int(data[p + 2])
    p += 3
    adj[u].append((v, w))
    adj[v].append((u, w))
INF = float("inf")
dist = [INF] * (n + 1)
dist[1] = 0
pq = [(0, 1)]
while pq:
    d, u = heapq.heappop(pq)
    if d > dist[u]:
        continue
    if u == n:
        break
    for v, w in adj[u]:
        nd = d + w
        if nd < dist[v]:
            dist[v] = nd
            heapq.heappush(pq, (nd, v))
print(dist[n] if dist[n] < INF else -1)
""",
    brute="""n, m = map(int, input().split())
edges = [tuple(map(int, input().split())) for _ in range(m)]
INF = float("inf")
d = [INF] * (n + 1)
d[1] = 0
for _ in range(n):
    for u, v, w in edges:
        if d[u] + w < d[v]:
            d[v] = d[u] + w
        if d[v] + w < d[u]:
            d[u] = d[v] + w
print(d[n] if d[n] < INF else -1)
""",
    gen="""lines = []
for _ in range(M):
    u = r(1, N)
    v = r(1, N)
    lines.append(f"{u} {v} {r(1, W)}")
if CHAIN:
    for i in range(1, N):
        lines.append(f"{i} {i + 1} {r(W // 2, W)}")
return f"{N} {len(lines)}\\n" + "\\n".join(lines) + "\\n"
""",
    defaults=dict(W=10, CHAIN=0),
    samples=["4 5\n1 2 5\n2 4 3\n1 3 2\n3 4 9\n2 3 1\n", "3 1\n1 2 4\n"],
    small=[dict(N=2, M=1), dict(N=5, M=6), dict(N=6, M=4), dict(N=8, M=14, W=100), dict(N=10, M=9, CHAIN=1)],
    mid=[dict(N=2000, M=4000, W=10**9)],
    big=[dict(N=100000, M=180000, W=10**9), dict(N=100000, M=100000, W=1000, CHAIN=1)],
)

problem(
    slug="window-max-sum", difficulty="hard", time_limit=3.0, topic="monotonic deque",
    en=dict(title="Peak watch",
            statement="""For every window of k **consecutive** elements, take its maximum. Print the **sum** of all these maximums (there are n - k + 1 windows).

**Input**
The first line contains n and k. The second line contains n integers.

**Output**
One integer.

**Constraints**
1 ≤ k ≤ n ≤ 200 000 · |aᵢ| ≤ 10⁹

⚠️ With k around n / 2, recomputing every maximum (O(n·k)) is far too slow.""",
            hint="A deque of indexes whose values are decreasing: the front is the window's maximum. Pop smaller values from the back before pushing, and drop the front when it leaves the window."),
    fr=dict(title="Vigie des sommets",
            statement="""Pour chaque fenêtre de k éléments **consécutifs**, prends son maximum. Affiche la **somme** de tous ces maximums (il y a n - k + 1 fenêtres).

**Entrée**
La première ligne contient n et k. La deuxième contient n entiers.

**Sortie**
Un entier.

**Contraintes**
1 ≤ k ≤ n ≤ 200 000 · |aᵢ| ≤ 10⁹

⚠️ Avec k autour de n / 2, recalculer chaque maximum (O(n·k)) est bien trop lent.""",
            hint="Un deque d'indices aux valeurs décroissantes : l'avant est le maximum de la fenêtre. Retire les valeurs plus petites à l'arrière avant d'ajouter, et l'avant quand il sort de la fenêtre."),
    ref="""import sys
from collections import deque
data = sys.stdin.read().split()
n, k = int(data[0]), int(data[1])
a = list(map(int, data[2:2 + n]))
dq = deque()
total = 0
for i, x in enumerate(a):
    while dq and a[dq[-1]] <= x:
        dq.pop()
    dq.append(i)
    if dq[0] <= i - k:
        dq.popleft()
    if i >= k - 1:
        total += a[dq[0]]
print(total)
""",
    brute="""n, k = map(int, input().split())
a = list(map(int, input().split()))
print(sum(max(a[i:i + k]) for i in range(n - k + 1)))
""",
    gen="""a = [r(-V, V) for _ in range(N)]
if MODE == 1:
    a.sort()
k = max(1, min(N, K if K > 0 else N // 2))
return f"{N} {k}\\n{' '.join(map(str, a))}\\n"
""",
    defaults=dict(V=10, K=0, MODE=0),
    samples=["5 3\n1 3 2 5 4\n", "4 1\n-2 7 0 3\n"],
    small=[dict(N=1, K=1), dict(N=6, K=2), dict(N=10), dict(N=12, K=12), dict(N=15, MODE=1, K=4)],
    mid=[dict(N=6000, V=10**9)],
    big=[dict(N=200000, V=10**9), dict(N=200000, V=10**9, MODE=1)],
)

problem(
    slug="histogram", difficulty="hard", time_limit=3.0, topic="monotonic stack",
    en=dict(title="Biggest poster",
            statement="""n buildings stand side by side, each 1 meter wide, with heights h₁ … hₙ. Print the **largest area** of a rectangle (aligned with the ground) that fits entirely inside the skyline.

**Input**
The first line contains n. The second line contains n heights.

**Output**
One integer.

**Constraints**
1 ≤ n ≤ 200 000 · 0 ≤ hᵢ ≤ 10⁹

⚠️ O(n²) is far too slow for the big tests.""",
            hint="For each bar, find how far it can stretch left and right before meeting a lower bar. A stack of increasing heights gives both limits in one pass."),
    fr=dict(title="La plus grande affiche",
            statement="""n immeubles sont côte à côte, chacun large d'1 mètre, de hauteurs h₁ … hₙ. Affiche la **plus grande aire** d'un rectangle (aligné avec le sol) qui tient entièrement dans la silhouette.

**Entrée**
La première ligne contient n. La deuxième contient n hauteurs.

**Sortie**
Un entier.

**Contraintes**
1 ≤ n ≤ 200 000 · 0 ≤ hᵢ ≤ 10⁹

⚠️ Une solution en O(n²) est bien trop lente pour les gros tests.""",
            hint="Pour chaque barre, cherche jusqu'où elle peut s'étendre à gauche et à droite avant une barre plus basse. Une pile de hauteurs croissantes donne les deux limites en un seul passage."),
    ref="""import sys
data = sys.stdin.read().split()
n = int(data[0])
h = list(map(int, data[1:1 + n])) + [0]
st = []
best = 0
for i, x in enumerate(h):
    start = i
    while st and st[-1][1] >= x:
        j, y = st.pop()
        best = max(best, y * (i - j))
        start = j
    st.append((start, x))
print(best)
""",
    brute="""n = int(input())
h = list(map(int, input().split()))
best = 0
for i in range(n):
    m = h[i]
    for j in range(i, n):
        m = min(m, h[j])
        best = max(best, m * (j - i + 1))
print(best)
""",
    gen="""if MODE == 1:
    a = list(range(1, N + 1))
elif MODE == 2:
    a = [V] * N
else:
    a = [r(0, V) for _ in range(N)]
return f"{N}\\n{' '.join(map(str, a))}\\n"
""",
    defaults=dict(V=6, MODE=0),
    samples=["7\n2 1 5 6 2 3 1\n", "3\n4 4 4\n"],
    small=[dict(N=1), dict(N=6), dict(N=10, V=3), dict(N=12, MODE=1), dict(N=9, MODE=2, V=0), dict(N=30, V=50)],
    mid=[dict(N=6000, V=10**9)],
    big=[dict(N=200000, V=10**9), dict(N=200000, MODE=1)],
)

problem(
    slug="edit-distance", difficulty="hard", time_limit=3.0, topic="dynamic programming",
    en=dict(title="Typo fixer",
            statement="""Turn string s into string t using the fewest operations. One operation inserts one character, deletes one character, or replaces one character by another. Print the minimum number of operations.

**Input**
Two lines: s and t (lowercase letters).

**Output**
One integer.

**Constraints**
1 ≤ |s|, |t| ≤ 1 000""",
            hint="dp[i][j] = cost to turn the first i letters of s into the first j letters of t. Each cell depends on its left, top and top-left neighbours. Keeping two rows is enough."),
    fr=dict(title="Correcteur de fautes",
            statement="""Transforme la chaîne s en la chaîne t avec le moins d'opérations possible. Une opération insère un caractère, supprime un caractère, ou remplace un caractère par un autre. Affiche le nombre minimum d'opérations.

**Entrée**
Deux lignes : s et t (lettres minuscules).

**Sortie**
Un entier.

**Contraintes**
1 ≤ |s|, |t| ≤ 1 000""",
            hint="dp[i][j] = coût pour transformer les i premières lettres de s en les j premières de t. Chaque case dépend de ses voisines de gauche, du haut et en diagonale. Deux lignes suffisent."),
    ref="""s = input().strip()
t = input().strip()
prev = list(range(len(t) + 1))
for i in range(1, len(s) + 1):
    cur = [i] + [0] * len(t)
    si = s[i - 1]
    for j in range(1, len(t) + 1):
        if si == t[j - 1]:
            cur[j] = prev[j - 1]
        else:
            cur[j] = 1 + min(prev[j], cur[j - 1], prev[j - 1])
    prev = cur
print(prev[len(t)])
""",
    brute="""from functools import lru_cache
s = input().strip()
t = input().strip()
@lru_cache(None)
def f(i, j):
    if i == len(s):
        return len(t) - j
    if j == len(t):
        return len(s) - i
    if s[i] == t[j]:
        return f(i + 1, j + 1)
    return 1 + min(f(i + 1, j), f(i, j + 1), f(i + 1, j + 1))
print(f(0, 0))
""",
    gen="""s = "".join(chr(97 + r(0, K - 1)) for _ in range(N))
t = list(s[:M]) if SIMILAR else [chr(97 + r(0, K - 1)) for _ in range(M)]
if SIMILAR:
    while len(t) < M:
        t.append(chr(97 + r(0, K - 1)))
    for _ in range(max(1, M // 10)):
        t[r(0, M - 1)] = chr(97 + r(0, K - 1))
return s + "\\n" + "".join(t) + "\\n"
""",
    defaults=dict(K=3, SIMILAR=0),
    samples=["kitten\nsitting\n", "abc\nabc\n"],
    small=[dict(N=1, M=1), dict(N=5, M=3), dict(N=7, M=9, K=2), dict(N=10, M=10, SIMILAR=1), dict(N=12, M=6, K=26)],
    mid=[dict(N=1000, M=1000, K=4), dict(N=1000, M=900, K=26, SIMILAR=1)],
    big=[],
)
