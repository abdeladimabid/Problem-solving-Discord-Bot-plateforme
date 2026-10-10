"""Write-code problems about everyday web-development tasks (slugs, e-mails,
query strings, routes, JSON, rate limiting, ...), for students who learn
JavaScript and PHP. Same format as bank_write.py, plus `skills` and `sig`
(the function-mode signature, same rules as signatures.py).

Every `str` read by the signature is ONE whitespace-free token. Outputs given
as `str[]` never contain spaces, except the decoded values of `query-string`.
"""

W2 = []


def problem(**kw):
    W2.append(kw)


# ============================================================================
# 1. URL slug
# ============================================================================
problem(
    slug="web-url-slug", difficulty="easy", time_limit=2.0, topic="web",
    skills="web,strings",
    en=dict(title="Pretty URLs",
            statement="""A blog turns the title of each article into a **slug** for its URL. The title is given as a list of words. For each word:
1. convert it to lowercase;
2. keep only the letters `a-z` and the digits `0-9` (every other character is removed);
3. drop the word if nothing is left.

Join the remaining words with `-`. If no word is left at all, the slug is `untitled`.

Example: the words `How to Build a REST API!` give `how-to-build-a-rest-api`, and `PHP 8.3: what's new?` gives `php-83-whats-new`.

**Input**
The first line contains n. The second line contains the n words, separated by spaces. A word contains printable ASCII characters, without spaces.

**Output**
The slug.

**Constraints**
1 ≤ n ≤ 1 000 · each word has 1 to 20 characters""",
            hint="Clean each word on its own (lowercase, then filter its characters), keep the non-empty ones in a list, then join them with \"-\". Don't forget the case where the list ends up empty."),
    fr=dict(title="De jolies URL",
            statement="""Un blog transforme le titre de chaque article en **slug** pour son URL. Le titre est donné sous forme de liste de mots. Pour chaque mot :
1. mets-le en minuscules ;
2. ne garde que les lettres `a-z` et les chiffres `0-9` (tout autre caractère est supprimé) ;
3. supprime le mot s'il ne reste plus rien.

Relie les mots restants par des `-`. S'il ne reste aucun mot, le slug vaut `untitled`.

Exemple : les mots `How to Build a REST API!` donnent `how-to-build-a-rest-api`, et `PHP 8.3: what's new?` donne `php-83-whats-new`.

**Entrée**
La première ligne contient n. La deuxième contient les n mots, séparés par des espaces. Un mot est formé de caractères ASCII imprimables, sans espace.

**Sortie**
Le slug.

**Contraintes**
1 ≤ n ≤ 1 000 · chaque mot fait de 1 à 20 caractères""",
            hint="Nettoie chaque mot séparément (minuscules, puis filtre ses caractères), garde ceux qui ne sont pas vides dans une liste, puis relie-les avec \"-\". N'oublie pas le cas où la liste finit vide."),
    ref=r"""import sys
data = sys.stdin.read().split()
n = int(data[0])
parts = []
for word in data[1:1 + n]:
    clean = "".join(ch for ch in word.lower() if "a" <= ch <= "z" or "0" <= ch <= "9")
    if clean:
        parts.append(clean)
print("-".join(parts) if parts else "untitled")
""",
    brute=r"""import re
n = int(input())
words = input().split()
text = re.sub(r"[^a-z0-9 ]", "", " ".join(words).lower())
slug = "-".join(text.split())
print(slug or "untitled")
""",
    gen=r"""WORDS = ["How", "to", "the", "PHP", "Laravel", "REST", "API", "Docker", "JS", "Node", "v8", "2024", "Guide", "Tips", "Vue.js", "C++", "e-mail", "Don't", "React?", "HTTP/2"]
PUNCT = "!?.,:;'&#()*@-/"
ALL = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" + PUNCT
out = []
for _ in range(N):
    k = r(0, 9)
    if k < JUNK:
        w = "".join(PUNCT[r(0, len(PUNCT) - 1)] for _ in range(r(1, 3)))
    elif k < 7:
        w = WORDS[r(0, len(WORDS) - 1)]
    else:
        w = "".join(ALL[r(0, len(ALL) - 1)] for _ in range(r(1, 8)))
    out.append(w)
return f"{N}\n{' '.join(out)}\n"
""",
    defaults=dict(N=5, JUNK=1),
    samples=["6\nHow to Build a REST API!\n", "4\nPHP 8.3: what's new?\n"],
    small=[dict(N=2, JUNK=0), dict(N=1, JUNK=10), dict(N=3, JUNK=10), dict(N=4), dict(N=8, JUNK=3), dict(N=12, JUNK=0), dict(N=20, JUNK=5)],
    mid=[dict(N=1000, JUNK=3)],
    big=[],
    sig=dict(read=[dict(n="n", t="int", hide=True), dict(n="words", t="str[]", len="n")], args=["words"], ret="str",
             doc=dict(en="`words` is the list of the words of the title. Return the slug (or `\"untitled\"`).",
                      fr="`words` est la liste des mots du titre. Retourne le slug (ou `\"untitled\"`).")),
)

# ============================================================================
# 2. E-mail validation
# ============================================================================
problem(
    slug="web-email-check", difficulty="medium", time_limit=2.0, topic="web",
    skills="web,strings,regex",
    en=dict(title="Sign-up form",
            statement="""A sign-up form must reject badly written e-mail addresses. An address is **valid** when all these rules hold:
- it contains **exactly one** `@`, which splits it into a *local part* and a *domain*;
- the local part has 1 to 64 characters, all letters (`a-z`, `A-Z`), digits or one of `. _ + -`; it does not start or end with `.` and never contains `..`;
- the domain is made of **at least two labels** separated by `.`; every label is non-empty, has only letters, digits and `-`, and does not start or end with `-`;
- the last label (the TLD) has **2 to 6 letters**, and nothing else.

Example: `bob.smith+news@mail.co.uk` is valid; `bad..dots@site.org` (two dots in a row), `no-at-sign.com` (no `@`) and `user@domain.c0m` (digit in the TLD) are invalid.

**Input**
The first line contains n. Each of the next n lines contains one address (no spaces).

**Output**
n lines: `valid` or `invalid`.

**Constraints**
1 ≤ n ≤ 1 000 · each address has 1 to 100 characters""",
            hint="Split on \"@\" first and check you get exactly two parts. Then check the local part, then split the domain on \".\" and check each label. A regular expression works too, but test it on every rule."),
    fr=dict(title="Formulaire d'inscription",
            statement="""Un formulaire d'inscription doit refuser les adresses e-mail mal écrites. Une adresse est **valide** si toutes ces règles sont respectées :
- elle contient **exactement un** `@`, qui la coupe en une *partie locale* et un *domaine* ;
- la partie locale fait de 1 à 64 caractères, tous des lettres (`a-z`, `A-Z`), des chiffres ou l'un de `. _ + -` ; elle ne commence pas et ne finit pas par `.` et ne contient jamais `..` ;
- le domaine est formé d'**au moins deux étiquettes** séparées par des `.` ; chaque étiquette est non vide, ne contient que des lettres, des chiffres et `-`, et ne commence ni ne finit par `-` ;
- la dernière étiquette (le TLD) est formée de **2 à 6 lettres**, et rien d'autre.

Exemple : `bob.smith+news@mail.co.uk` est valide ; `bad..dots@site.org` (deux points de suite), `no-at-sign.com` (pas de `@`) et `user@domain.c0m` (chiffre dans le TLD) sont invalides.

**Entrée**
La première ligne contient n. Chacune des n lignes suivantes contient une adresse (sans espace).

**Sortie**
n lignes : `valid` ou `invalid`.

**Contraintes**
1 ≤ n ≤ 1 000 · chaque adresse fait de 1 à 100 caractères""",
            hint="Coupe d'abord sur \"@\" et vérifie que tu obtiens exactement deux morceaux. Vérifie ensuite la partie locale, puis coupe le domaine sur \".\" et contrôle chaque étiquette. Une expression régulière marche aussi, mais teste-la sur chaque règle."),
    ref=r"""import sys
LETTERS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")
DIGITS = set("0123456789")
LOCAL_OK = LETTERS | DIGITS | set("._+-")
LABEL_OK = LETTERS | DIGITS | {"-"}

def valid(e):
    parts = e.split("@")
    if len(parts) != 2:
        return False
    local, domain = parts
    if not 1 <= len(local) <= 64 or any(c not in LOCAL_OK for c in local):
        return False
    if local[0] == "." or local[-1] == "." or ".." in local:
        return False
    labels = domain.split(".")
    if len(labels) < 2:
        return False
    for lab in labels:
        if not lab or lab[0] == "-" or lab[-1] == "-" or any(c not in LABEL_OK for c in lab):
            return False
    tld = labels[-1]
    return 2 <= len(tld) <= 6 and all(c in LETTERS for c in tld)

data = sys.stdin.read().split()
n = int(data[0])
print("\n".join("valid" if valid(e) else "invalid" for e in data[1:1 + n]))
""",
    brute=r"""import re
PAT = re.compile(r"(?!\.)(?!.*\.\.)[A-Za-z0-9._+-]{1,64}(?<!\.)@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,6}")
n = int(input())
for _ in range(n):
    e = input().strip()
    print("valid" if PAT.fullmatch(e) else "invalid")
""",
    gen=r"""L = "abcdefghijklmnopqrstuvwxyz"
def word(a, b):
    return "".join(L[r(0, 25)] for _ in range(r(a, b)))
out = []
for _ in range(N):
    local = word(1, 6)
    if r(0, 2) == 0:
        local += "._+-"[r(0, 3)] + word(1, 5)
    if r(0, 3) == 0:
        local = local[0].upper() + local[1:]
    if r(0, 4) == 0:
        local += str(r(0, 99))
    dom = word(2, 8)
    if r(0, 3) == 0:
        dom += "-" + word(1, 4)
    if r(0, 3) == 0:
        dom += "." + word(2, 5)
    tld = word(2, 6)
    e = local + "@" + dom + "." + tld
    if r(0, 99) < BAD:
        k = r(0, 12)
        if k == 0:
            e = e.replace("@", "", 1)
        elif k == 1:
            e = local + "@@" + dom + "." + tld
        elif k == 2:
            e = local + ".." + word(1, 3) + "@" + dom + "." + tld
        elif k == 3:
            e = "." + e
        elif k == 4:
            e = local + ".@" + dom + "." + tld
        elif k == 5:
            e = local + "@" + dom + "." + tld + str(r(0, 9))
        elif k == 6:
            e = local + "@" + dom + "." + word(7, 9)
        elif k == 7:
            e = local + "@" + dom + "." + word(1, 1)
        elif k == 8:
            e = local + "@-" + dom + "." + tld
        elif k == 9:
            e = local + "@" + dom + tld
        elif k == 10:
            p = r(0, len(e))
            e = e[:p] + "!#,%()"[r(0, 5)] + e[p:]
        elif k == 11:
            e = "@" + dom + "." + tld
        else:
            e = local + "@" + dom + "-." + tld
    out.append(e)
return f"{N}\n" + "\n".join(out) + "\n"
""",
    defaults=dict(N=5, BAD=50),
    samples=["5\nalice@example.com\nbob.smith+news@mail.co.uk\nbad..dots@site.org\nno-at-sign.com\nuser@domain.c0m\n",
             "3\n.lead@ex.com\nann@-host.io\nX_9@a-b.travel\n"],
    small=[dict(N=1), dict(N=6, BAD=0), dict(N=10, BAD=100), dict(N=20), dict(N=30, BAD=70), dict(N=40, BAD=30)],
    mid=[dict(N=1000)],
    big=[],
    sig=dict(read=[dict(n="n", t="int", hide=True), dict(n="emails", t="str[]", len="n")], args=["emails"], ret="str[]",
             doc=dict(en="`emails` is the list of addresses. Return a list with `\"valid\"` or `\"invalid\"` for each one, in order.",
                      fr="`emails` est la liste des adresses. Retourne une liste avec `\"valid\"` ou `\"invalid\"` pour chacune, dans l'ordre.")),
)

# ============================================================================
# 3. HTTP status classes
# ============================================================================
problem(
    slug="web-http-status", difficulty="easy", time_limit=2.0, topic="web",
    skills="web,basics",
    en=dict(title="Status check",
            statement="""A monitoring tool reads the HTTP status code of every response and files it in a class:

| codes | class |
|---|---|
| 100 – 199 | `informational` |
| 200 – 299 | `success` |
| 300 – 399 | `redirect` |
| 400 – 499 | `client-error` |
| 500 – 599 | `server-error` |
| anything else | `invalid` |

Example: `200 404 301 503 42` → `success`, `client-error`, `redirect`, `server-error`, `invalid`.

**Input**
The first line contains n. The second line contains n integers, the codes.

**Output**
n lines, the class of each code.

**Constraints**
1 ≤ n ≤ 1 000 · -1 000 ≤ code ≤ 1 000""",
            hint="The hundreds digit tells the class, but only for codes between 100 and 599: check that range first."),
    fr=dict(title="Bilan de santé",
            statement="""Un outil de supervision lit le code de statut HTTP de chaque réponse et le range dans une classe :

| codes | classe |
|---|---|
| 100 – 199 | `informational` |
| 200 – 299 | `success` |
| 300 – 399 | `redirect` |
| 400 – 499 | `client-error` |
| 500 – 599 | `server-error` |
| tout le reste | `invalid` |

Exemple : `200 404 301 503 42` → `success`, `client-error`, `redirect`, `server-error`, `invalid`.

**Entrée**
La première ligne contient n. La deuxième contient n entiers, les codes.

**Sortie**
n lignes, la classe de chaque code.

**Contraintes**
1 ≤ n ≤ 1 000 · -1 000 ≤ code ≤ 1 000""",
            hint="Le chiffre des centaines donne la classe, mais seulement pour les codes entre 100 et 599 : vérifie d'abord cet intervalle."),
    ref=r"""import sys
data = sys.stdin.read().split()
n = int(data[0])
out = []
for x in data[1:1 + n]:
    c = int(x)
    if 100 <= c <= 199:
        out.append("informational")
    elif 200 <= c <= 299:
        out.append("success")
    elif 300 <= c <= 399:
        out.append("redirect")
    elif 400 <= c <= 499:
        out.append("client-error")
    elif 500 <= c <= 599:
        out.append("server-error")
    else:
        out.append("invalid")
print("\n".join(out))
""",
    brute=r"""NAMES = {1: "informational", 2: "success", 3: "redirect", 4: "client-error", 5: "server-error"}
n = int(input())
codes = list(map(int, input().split()))
for c in codes:
    print(NAMES[c // 100] if 100 <= c < 600 else "invalid")
""",
    gen=r"""COMMON = [100, 101, 200, 201, 204, 299, 300, 301, 302, 304, 399, 400, 401, 403, 404, 418, 422, 429, 499, 500, 502, 503, 599, 600, 99, 0, 700, -200]
out = []
for _ in range(N):
    if r(0, 1):
        out.append(COMMON[r(0, len(COMMON) - 1)])
    else:
        out.append(r(LO, HI))
return f"{N}\n{' '.join(map(str, out))}\n"
""",
    defaults=dict(N=5, LO=0, HI=700),
    samples=["5\n200 404 301 503 42\n", "4\n100 599 600 -404\n"],
    small=[dict(N=1), dict(N=6), dict(N=10, LO=95, HI=105), dict(N=15, LO=590, HI=610), dict(N=30, LO=-1000, HI=1000), dict(N=40)],
    mid=[dict(N=1000, LO=-1000, HI=1000)],
    big=[],
    sig=dict(read=[dict(n="n", t="int", hide=True), dict(n="codes", t="int[]", len="n")], args=["codes"], ret="str[]",
             doc=dict(en="`codes` is the list of status codes. Return the list of their classes, in order.",
                      fr="`codes` est la liste des codes de statut. Retourne la liste de leurs classes, dans l'ordre.")),
)

# ============================================================================
# 4. Query string
# ============================================================================
problem(
    slug="web-query-string", difficulty="medium", time_limit=2.0, topic="web",
    skills="web,strings,dicts",
    en=dict(title="Behind the question mark",
            statement="""Parse the **query string** of a URL (the part after `?`), like PHP fills `$_GET`, but keep every value of a repeated key.

- Pairs are separated by `&`. Empty pairs (for example in `a=1&&b=2`) are ignored.
- In a pair, the key is what comes before the **first** `=`, the value what comes after. A pair without `=` is a key with an **empty** value.
- Keys and values are **decoded** after splitting: `+` becomes a space and `%XX` (two hexadecimal digits, upper or lower case) becomes the character with that ASCII code. So `%26` is a `&` that does not separate pairs.

Print one line per distinct key, in the order of their **first appearance**: `key=value1,value2,...` (the values in order of appearance).

Example: `a=1&b=x%20y&a=2&flag` gives
```
a=1,2
b=x y
flag=
```

**Input**
One line with the query string (no spaces).

**Output**
One line per distinct key, as described.

**Constraints**
1 ≤ length ≤ 2 000 · there is at least one non-empty pair · every key is non-empty · every `%` is followed by two hexadecimal digits that encode a printable ASCII character""",
            hint="Split on \"&\" first, then each pair on its first \"=\", and only then decode. A dictionary of lists plus a list of keys in order of appearance does the rest."),
    fr=dict(title="Derrière le point d'interrogation",
            statement="""Analyse la **chaîne de requête** d'une URL (la partie après `?`), comme PHP remplit `$_GET`, mais en gardant toutes les valeurs d'une clé répétée.

- Les paires sont séparées par `&`. Les paires vides (par exemple dans `a=1&&b=2`) sont ignorées.
- Dans une paire, la clé est ce qui précède le **premier** `=`, la valeur ce qui suit. Une paire sans `=` est une clé avec une valeur **vide**.
- Clés et valeurs sont **décodées** après le découpage : `+` devient une espace et `%XX` (deux chiffres hexadécimaux, majuscules ou minuscules) devient le caractère de ce code ASCII. Ainsi `%26` est un `&` qui ne sépare pas les paires.

Affiche une ligne par clé distincte, dans l'ordre de leur **première apparition** : `clé=valeur1,valeur2,...` (les valeurs dans leur ordre d'apparition).

Exemple : `a=1&b=x%20y&a=2&flag` donne
```
a=1,2
b=x y
flag=
```

**Entrée**
Une ligne avec la chaîne de requête (sans espace).

**Sortie**
Une ligne par clé distincte, comme décrit.

**Contraintes**
1 ≤ longueur ≤ 2 000 · il y a au moins une paire non vide · chaque clé est non vide · chaque `%` est suivi de deux chiffres hexadécimaux qui codent un caractère ASCII imprimable""",
            hint="Coupe d'abord sur \"&\", puis chaque paire sur son premier \"=\", et seulement ensuite décode. Un dictionnaire de listes et une liste des clés dans l'ordre d'apparition font le reste."),
    ref=r"""def decode(s):
    out = []
    i = 0
    while i < len(s):
        c = s[i]
        if c == "+":
            out.append(" ")
            i += 1
        elif c == "%":
            out.append(chr(int(s[i + 1:i + 3], 16)))
            i += 3
        else:
            out.append(c)
            i += 1
    return "".join(out)

query = input().strip()
order = []
values = {}
for part in query.split("&"):
    if not part:
        continue
    if "=" in part:
        key, val = part.split("=", 1)
    else:
        key, val = part, ""
    key, val = decode(key), decode(val)
    if key not in values:
        values[key] = []
        order.append(key)
    values[key].append(val)
for key in order:
    print(key + "=" + ",".join(values[key]))
""",
    brute=r"""from urllib.parse import parse_qsl
pairs = parse_qsl(input().strip(), keep_blank_values=True)
keys = []
for k, v in pairs:
    if k not in keys:
        keys.append(k)
for k in keys:
    print(k + "=" + ",".join(v for kk, v in pairs if kk == k))
""",
    gen=r"""KEYS = ["page", "sort", "q", "tag", "lang", "id", "debug", "filter"][:K]
CH = "abcxyz019-_.~="
ENC = ["%20", "+", "%26", "%3D", "%2C", "%25", "%2F", "%3a", "%3F", "%2b", "%41"]
parts = []
for i in range(N):
    key = KEYS[r(0, len(KEYS) - 1)]
    if r(0, 5) == 0:
        key += "%5B%5D"
    m = r(0, 9)
    if m == 0:
        parts.append(key)
    elif m == 1:
        parts.append(key + "=")
    else:
        val = "".join(CH[r(0, len(CH) - 1)] if r(0, 3) else ENC[r(0, len(ENC) - 1)] for _ in range(r(1, V)))
        parts.append(key + "=" + val)
    if i > 0 and r(0, 9) == 0:
        parts.append("")
return "&".join(parts) + "\n"
""",
    defaults=dict(N=5, K=4, V=6),
    samples=["a=1&b=x%20y&a=2&flag\n", "q=php+tutorial&tags%5B%5D=web&tags%5B%5D=api&&page=2\n"],
    small=[dict(N=1), dict(N=1, K=1), dict(N=3, K=2), dict(N=6, K=3), dict(N=10, K=8), dict(N=15, K=2, V=3), dict(N=20, K=5)],
    mid=[dict(N=150, K=8, V=8)],
    big=[],
    sig=dict(read=[dict(n="query", t="str")], args=["query"], ret="str[]",
             doc=dict(en="`query` is the query string. Return the list of lines `key=value1,value2,...`, one per distinct key, in order of first appearance.",
                      fr="`query` est la chaîne de requête. Retourne la liste des lignes `clé=valeur1,valeur2,...`, une par clé distincte, dans l'ordre de première apparition.")),
)

# ============================================================================
# 5. kebab-case to camelCase
# ============================================================================
problem(
    slug="web-css-camel", difficulty="easy", time_limit=2.0, topic="web",
    skills="web,strings",
    en=dict(title="From CSS to JavaScript",
            statement="""In JavaScript, `element.style` uses **camelCase** names for CSS properties: `background-color` becomes `backgroundColor`. The rule: **remove every `-` and write the character that follows it in uppercase**.

A vendor-prefixed property starts with `-`, so its first letter becomes uppercase too: `-webkit-transition` → `WebkitTransition`.

Example: `font-size`, `z-index`, `color` → `fontSize`, `zIndex`, `color`.

**Input**
The first line contains n. Each of the next n lines contains a property name: lowercase letters and digits, with single `-` between words and possibly one `-` at the start (never at the end, never two in a row).

**Output**
n lines, the camelCase names.

**Constraints**
1 ≤ n ≤ 1 000 · each name has 1 to 40 characters""",
            hint="Walk through the name with a flag \"the next character must be uppercase\": a \"-\" sets the flag and is not copied."),
    fr=dict(title="Du CSS au JavaScript",
            statement="""En JavaScript, `element.style` utilise des noms en **camelCase** pour les propriétés CSS : `background-color` devient `backgroundColor`. La règle : **supprime chaque `-` et écris en majuscule le caractère qui le suit**.

Une propriété avec préfixe navigateur commence par `-`, donc sa première lettre passe aussi en majuscule : `-webkit-transition` → `WebkitTransition`.

Exemple : `font-size`, `z-index`, `color` → `fontSize`, `zIndex`, `color`.

**Entrée**
La première ligne contient n. Chacune des n lignes suivantes contient un nom de propriété : lettres minuscules et chiffres, avec un seul `-` entre les mots et éventuellement un `-` au début (jamais à la fin, jamais deux de suite).

**Sortie**
n lignes, les noms en camelCase.

**Contraintes**
1 ≤ n ≤ 1 000 · chaque nom fait de 1 à 40 caractères""",
            hint="Parcours le nom avec un drapeau « le prochain caractère doit être en majuscule » : un \"-\" lève le drapeau et n'est pas recopié."),
    ref=r"""import sys
data = sys.stdin.read().split()
n = int(data[0])
for name in data[1:1 + n]:
    out = []
    up = False
    for ch in name:
        if ch == "-":
            up = True
        else:
            out.append(ch.upper() if up else ch)
            up = False
    print("".join(out))
""",
    brute=r"""n = int(input())
for _ in range(n):
    words = input().strip().split("-")
    first = words[0]
    rest = words[1:]
    print(first + "".join(w[0].upper() + w[1:] for w in rest))
""",
    gen=r"""WORDS = ["background", "color", "font", "size", "border", "top", "left", "radius", "margin", "z", "index", "line", "height",
         "transition", "box", "shadow", "grid", "template", "columns", "flex", "wrap", "align", "items", "2d", "x", "user", "select"]
PREFIX = ["webkit", "moz", "ms", "o"]
out = []
for _ in range(N):
    words = [WORDS[r(0, len(WORDS) - 1)] for _ in range(r(1, MAXW))]
    name = "-".join(words)
    if r(0, 99) < VENDOR:
        name = "-" + PREFIX[r(0, 3)] + "-" + name
    out.append(name)
return f"{N}\n" + "\n".join(out) + "\n"
""",
    defaults=dict(N=5, MAXW=3, VENDOR=20),
    samples=["3\nfont-size\nz-index\ncolor\n", "2\n-webkit-transition\nborder-top-left-radius\n"],
    small=[dict(N=1), dict(N=1, MAXW=1, VENDOR=100), dict(N=5, MAXW=1), dict(N=8), dict(N=10, VENDOR=60), dict(N=20, MAXW=5)],
    mid=[dict(N=1000, MAXW=4)],
    big=[],
    sig=dict(read=[dict(n="n", t="int", hide=True), dict(n="names", t="str[]", len="n")], args=["names"], ret="str[]",
             doc=dict(en="`names` is the list of CSS property names. Return the list of their camelCase versions, in order.",
                      fr="`names` est la liste des noms de propriétés CSS. Retourne la liste de leurs versions en camelCase, dans l'ordre.")),
)

# ============================================================================
# 6. Money format
# ============================================================================
problem(
    slug="web-money-format", difficulty="easy", time_limit=2.0, topic="web",
    skills="web,strings,math",
    en=dict(title="Price tags",
            statement="""An online shop stores prices as an integer number of **cents** (to avoid floating-point errors) and formats them only for display:
- the amount in units, with a `,` between every group of three digits (counted from the right);
- then `.` and **exactly two** digits of cents;
- a `-` in front when the amount is negative.

Example: `123456` → `1,234.56`, `-5` → `-0.05`, `100000000` → `1,000,000.00`, `0` → `0.00`.

**Input**
The first line contains n. The second line contains n integers, the amounts in cents.

**Output**
n lines, the formatted amounts.

**Constraints**
1 ≤ n ≤ 1 000 · |amount| ≤ 10¹² (use 64-bit integers)""",
            hint="Work on the absolute value: units = cents // 100 and the rest = cents % 100 (padded to two digits). Group the digits of the units by three from the right. Add the sign at the very end."),
    fr=dict(title="Étiquettes de prix",
            statement="""Une boutique en ligne enregistre les prix en nombre entier de **centimes** (pour éviter les erreurs des nombres à virgule) et ne les met en forme que pour l'affichage :
- le montant en unités, avec une `,` entre chaque groupe de trois chiffres (en partant de la droite) ;
- puis `.` et **exactement deux** chiffres de centimes ;
- un `-` devant si le montant est négatif.

Exemple : `123456` → `1,234.56`, `-5` → `-0.05`, `100000000` → `1,000,000.00`, `0` → `0.00`.

**Entrée**
La première ligne contient n. La deuxième contient n entiers, les montants en centimes.

**Sortie**
n lignes, les montants mis en forme.

**Contraintes**
1 ≤ n ≤ 1 000 · |montant| ≤ 10¹² (utilise des entiers 64 bits)""",
            hint="Travaille sur la valeur absolue : unités = centimes // 100 et reste = centimes % 100 (sur deux chiffres). Groupe les chiffres des unités par trois en partant de la droite. Ajoute le signe tout à la fin."),
    ref=r"""import sys
data = sys.stdin.read().split()
n = int(data[0])
out = []
for x in data[1:1 + n]:
    c = int(x)
    sign = "-" if c < 0 else ""
    c = abs(c)
    units = str(c // 100)
    groups = []
    while len(units) > 3:
        groups.append(units[-3:])
        units = units[:-3]
    groups.append(units)
    cents = str(c % 100).rjust(2, "0")
    out.append(sign + ",".join(reversed(groups)) + "." + cents)
print("\n".join(out))
""",
    brute=r"""n = int(input())
for c in map(int, input().split()):
    a = abs(c)
    s = f"{a // 100:,}.{a % 100:02d}"
    print(("-" if c < 0 else "") + s)
""",
    gen=r"""out = []
for _ in range(N):
    d = r(0, D)
    v = r(0, 10 ** d)
    if r(0, 99) < NEG:
        v = -v
    out.append(v)
return f"{N}\n{' '.join(map(str, out))}\n"
""",
    defaults=dict(N=5, D=8, NEG=30),
    samples=["4\n123456 -5 100000000 0\n", "3\n99 100 -123456789\n"],
    small=[dict(N=1), dict(N=5, D=2), dict(N=8, D=4, NEG=50), dict(N=10, D=6), dict(N=15, D=12), dict(N=20, D=12, NEG=100)],
    mid=[dict(N=1000, D=12)],
    big=[],
    sig=dict(read=[dict(n="n", t="int", hide=True), dict(n="amounts", t="int[]", len="n")], args=["amounts"], ret="str[]",
             doc=dict(en="`amounts` is the list of amounts in cents. Return the list of formatted strings, in order.",
                      fr="`amounts` est la liste des montants en centimes. Retourne la liste des chaînes mises en forme, dans l'ordre.")),
)

# ============================================================================
# 7. Breadcrumb
# ============================================================================
problem(
    slug="web-breadcrumb", difficulty="easy", time_limit=2.0, topic="web",
    skills="web,strings",
    en=dict(title="Breadcrumbs",
            statement="""A website shows a **breadcrumb** trail above each page, built from the URL path:
- it always starts with `Home`;
- then each non-empty segment of the path (the parts between `/`), in order;
- a segment is displayed by splitting it on `-`, dropping empty words, writing the **first character of each word in uppercase**, and joining the words with one space;
- the items are joined with ` > `.

Example: `/products/winter-shoes/` → `Home > Products > Winter Shoes` and `/` → `Home`.

**Input**
One line with the path. It starts with `/` and contains only lowercase letters, digits, `-` and `/`. Every segment that is not empty contains at least one letter or digit.

**Output**
The breadcrumb.

**Constraints**
1 ≤ length of the path ≤ 2 000""",
            hint="Split on \"/\" and skip the empty pieces (they come from the leading, trailing or doubled slashes). Do the same with \"-\" inside each segment."),
    fr=dict(title="Fil d'Ariane",
            statement="""Un site affiche un **fil d'Ariane** au-dessus de chaque page, construit à partir du chemin de l'URL :
- il commence toujours par `Home` ;
- puis chaque segment non vide du chemin (les morceaux entre les `/`), dans l'ordre ;
- un segment s'affiche en le coupant sur les `-`, en supprimant les mots vides, en mettant **en majuscule le premier caractère de chaque mot**, et en reliant les mots par une espace ;
- les éléments sont reliés par ` > `.

Exemple : `/products/winter-shoes/` → `Home > Products > Winter Shoes` et `/` → `Home`.

**Entrée**
Une ligne avec le chemin. Il commence par `/` et ne contient que des lettres minuscules, des chiffres, des `-` et des `/`. Chaque segment non vide contient au moins une lettre ou un chiffre.

**Sortie**
Le fil d'Ariane.

**Contraintes**
1 ≤ longueur du chemin ≤ 2 000""",
            hint="Coupe sur \"/\" et ignore les morceaux vides (ils viennent des barres au début, à la fin ou doublées). Fais pareil avec \"-\" dans chaque segment."),
    ref=r"""path = input().strip()
items = ["Home"]
for seg in path.split("/"):
    if not seg:
        continue
    words = [w[0].upper() + w[1:] for w in seg.split("-") if w]
    items.append(" ".join(words))
print(" > ".join(items))
""",
    brute=r"""import re
path = input().strip()
out = "Home"
for seg in re.findall(r"[^/]+", path):
    words = re.findall(r"[a-z0-9]+", seg)
    out += " > " + " ".join(w[:1].upper() + w[1:] for w in words)
print(out)
""",
    gen=r"""WORDS = ["products", "winter", "shoes", "blog", "2024", "my", "first", "post", "docs", "api", "v2", "getting", "started", "faq", "3d", "a", "x1"]
segs = []
for _ in range(N):
    words = [WORDS[r(0, len(WORDS) - 1)] for _ in range(r(1, MAXW))]
    seg = "-".join(words)
    if r(0, 99) < MESSY:
        seg = "-" * r(0, 2) + seg.replace("-", "-" * r(1, 3)) + "-" * r(0, 2)
    segs.append(seg)
    if r(0, 99) < MESSY:
        segs.append("")
path = "/" + "/".join(segs)
if r(0, 1):
    path += "/"
return path + "\n"
""",
    defaults=dict(N=3, MAXW=3, MESSY=0),
    samples=["/products/winter-shoes/\n", "/\n"],
    small=[dict(N=1), dict(N=1, MAXW=1), dict(N=2, MESSY=50), dict(N=4), dict(N=5, MESSY=100), dict(N=8, MAXW=4, MESSY=30)],
    mid=[dict(N=60, MAXW=4, MESSY=20)],
    big=[],
    sig=dict(read=[dict(n="path", t="str")], args=["path"], ret="str",
             doc=dict(en="`path` is the URL path. Return the breadcrumb, for example `\"Home > Products > Winter Shoes\"`.",
                      fr="`path` est le chemin de l'URL. Retourne le fil d'Ariane, par exemple `\"Home > Products > Winter Shoes\"`.")),
)

# ============================================================================
# 8. Route matching
# ============================================================================
problem(
    slug="web-route-match", difficulty="medium", time_limit=2.0, topic="web",
    skills="web,strings",
    en=dict(title="Router",
            statement="""Frameworks like Express or Laravel match each requested path against **route patterns** such as `/users/:id/posts/:pid`. Write that matcher.

- A single `/` at the end of a path or pattern is ignored (`/users/7/` is the same as `/users/7`), unless the whole string is `/`.
- Then both are split into segments on `/` (after the leading `/`). They match when they have the **same number of segments** and every pattern segment matches the path segment at the same position:
  - a segment starting with `:` is a **parameter**: it matches any **non-empty** segment;
  - any other segment must be **exactly equal** (case matters).

For each path print the parameters in the order of the pattern, as `name=value` separated by `,` (for example `id=7,pid=42`), or `match` if the pattern has no parameter, or `404` if the path does not match.

Example with the pattern `/users/:id/posts/:pid`: `/users/7/posts/42` → `id=7,pid=42`, `/users/7/posts/42/` → `id=7,pid=42`, `/users/7/posts` → `404` (one segment missing), `/users//posts/3` → `404` (empty `id`).

**Input**
The first line contains the pattern. The second line contains n. Each of the next n lines contains a path. Pattern and paths start with `/` and contain no spaces; the pattern has at least one segment, no empty segment, and its parameter names are distinct.

**Output**
n lines, as described.

**Constraints**
1 ≤ n ≤ 1 000 · each line has at most 200 characters""",
            hint="Write a small function that removes the trailing \"/\" and splits into segments, use it on the pattern and on each path, then compare the two lists position by position."),
    fr=dict(title="Routeur",
            statement="""Les frameworks comme Express ou Laravel comparent chaque chemin demandé à des **motifs de route** comme `/users/:id/posts/:pid`. Écris ce comparateur.

- Un seul `/` à la fin d'un chemin ou d'un motif est ignoré (`/users/7/` équivaut à `/users/7`), sauf si la chaîne entière vaut `/`.
- On coupe ensuite les deux en segments sur les `/` (après le `/` initial). Ils correspondent s'ils ont le **même nombre de segments** et si chaque segment du motif correspond au segment du chemin à la même position :
  - un segment qui commence par `:` est un **paramètre** : il accepte n'importe quel segment **non vide** ;
  - tout autre segment doit être **exactement identique** (majuscules comprises).

Pour chaque chemin, affiche les paramètres dans l'ordre du motif, sous la forme `nom=valeur` séparés par des `,` (par exemple `id=7,pid=42`), ou `match` si le motif n'a aucun paramètre, ou `404` si le chemin ne correspond pas.

Exemple avec le motif `/users/:id/posts/:pid` : `/users/7/posts/42` → `id=7,pid=42`, `/users/7/posts/42/` → `id=7,pid=42`, `/users/7/posts` → `404` (il manque un segment), `/users//posts/3` → `404` (`id` vide).

**Entrée**
La première ligne contient le motif. La deuxième contient n. Chacune des n lignes suivantes contient un chemin. Le motif et les chemins commencent par `/` et ne contiennent pas d'espace ; le motif a au moins un segment, aucun segment vide, et ses noms de paramètres sont distincts.

**Sortie**
n lignes, comme décrit.

**Contraintes**
1 ≤ n ≤ 1 000 · chaque ligne fait au plus 200 caractères""",
            hint="Écris une petite fonction qui retire le \"/\" final et découpe en segments, utilise-la sur le motif et sur chaque chemin, puis compare les deux listes position par position."),
    ref=r"""import sys

def segments(s):
    if len(s) > 1 and s.endswith("/"):
        s = s[:-1]
    return s[1:].split("/")

data = sys.stdin.read().split()
pattern = segments(data[0])
n = int(data[1])
out = []
for path in data[2:2 + n]:
    segs = segments(path)
    if len(segs) != len(pattern):
        out.append("404")
        continue
    params = []
    ok = True
    for p, s in zip(pattern, segs):
        if p.startswith(":"):
            if not s:
                ok = False
                break
            params.append(p[1:] + "=" + s)
        elif p != s:
            ok = False
            break
    if not ok:
        out.append("404")
    else:
        out.append(",".join(params) if params else "match")
print("\n".join(out))
""",
    brute=r"""import re
pattern = input().strip()
if len(pattern) > 1 and pattern.endswith("/"):
    pattern = pattern[:-1]
names = []
rx = ""
for seg in pattern[1:].split("/"):
    if seg.startswith(":"):
        names.append(seg[1:])
        rx += "/([^/]+)"
    else:
        rx += "/" + re.escape(seg)
rx = re.compile(rx + "/?")
n = int(input())
for _ in range(n):
    m = rx.fullmatch(input().strip())
    if not m:
        print("404")
    elif not names:
        print("match")
    else:
        print(",".join(f"{a}={b}" for a, b in zip(names, m.groups())))
""",
    gen=r"""PATS = ["/users/:id", "/users/:id/posts/:pid", "/api/v1/products/:sku/reviews", "/blog/:year/:slug", "/about", "/:lang/docs/:page", "/shop/cart/"]
AL = "abcdefghijklmnopqrstuvwxyz0123456789-_"
pattern = PATS[P]
segs = pattern.rstrip("/")[1:].split("/")
out = []
for _ in range(N):
    vals = []
    for s in segs:
        if s[0] == ":":
            v = "".join(AL[r(0, len(AL) - 1)] for _ in range(r(1, 5)))
            if r(0, 7) == 0:
                v = ""
        else:
            v = s
            k = r(0, 11)
            if k == 0:
                v = s.upper()
            elif k == 1:
                v = s[:-1]
            elif k == 2:
                v = ":" + s
        vals.append(v)
    k = r(0, 9)
    if k == 0:
        vals.append("".join(AL[r(0, 25)] for _ in range(r(1, 4))))
    elif k == 1 and len(vals) > 1:
        vals.pop()
    p = "/" + "/".join(vals)
    if r(0, 3) == 0:
        p += "/"
    if r(0, 12) == 0:
        p += "/"
    out.append(p)
return pattern + "\n" + f"{N}\n" + "\n".join(out) + "\n"
""",
    defaults=dict(N=5, P=1),
    samples=["/users/:id/posts/:pid\n4\n/users/7/posts/42\n/users/7/posts/42/\n/users/7/posts\n/users//posts/3\n",
             "/about\n3\n/about/\n/About\n/about//\n"],
    small=[dict(N=1, P=0), dict(N=6, P=0), dict(N=10, P=1), dict(N=12, P=2), dict(N=12, P=3), dict(N=10, P=4), dict(N=15, P=5), dict(N=10, P=6)],
    mid=[dict(N=1000, P=1), dict(N=1000, P=5)],
    big=[],
    sig=dict(read=[dict(n="pattern", t="str"), dict(n="n", t="int", hide=True), dict(n="paths", t="str[]", len="n")], args=["pattern", "paths"], ret="str[]",
             doc=dict(en="`pattern` is the route pattern, `paths` the list of requested paths. Return one string per path: `\"id=7,pid=42\"`, `\"match\"` or `\"404\"`.",
                      fr="`pattern` est le motif de route, `paths` la liste des chemins demandés. Retourne une chaîne par chemin : `\"id=7,pid=42\"`, `\"match\"` ou `\"404\"`.")),
)

# ============================================================================
# 9. Password rules
# ============================================================================
problem(
    slug="web-password-rules", difficulty="easy", time_limit=2.0, topic="web",
    skills="web,strings",
    en=dict(title="Strong enough?",
            statement="""A sign-up form checks every password against five rules, always in this order:
1. `length`: at least 8 characters;
2. `lower`: at least one lowercase letter `a-z`;
3. `upper`: at least one uppercase letter `A-Z`;
4. `digit`: at least one digit `0-9`;
5. `symbol`: at least one character that is neither a letter nor a digit.

For each password print `ok` if it passes every rule, otherwise the names of the **failed** rules, in the order above, separated by `,` (no spaces).

Example: `Passw0rd!` → `ok`, `hello` → `length,upper,digit,symbol`, `HELLO-WORLD-42` → `lower`.

**Input**
The first line contains n. Each of the next n lines contains a password: printable ASCII characters, without spaces.

**Output**
n lines, as described.

**Constraints**
1 ≤ n ≤ 1 000 · each password has 1 to 64 characters""",
            hint="Compute five booleans in one pass over the characters, then build the list of the names whose test failed."),
    fr=dict(title="Assez solide ?",
            statement="""Un formulaire d'inscription vérifie chaque mot de passe avec cinq règles, toujours dans cet ordre :
1. `length` : au moins 8 caractères ;
2. `lower` : au moins une lettre minuscule `a-z` ;
3. `upper` : au moins une lettre majuscule `A-Z` ;
4. `digit` : au moins un chiffre `0-9` ;
5. `symbol` : au moins un caractère qui n'est ni une lettre ni un chiffre.

Pour chaque mot de passe, affiche `ok` s'il respecte toutes les règles, sinon les noms des règles **non respectées**, dans l'ordre ci-dessus, séparés par des `,` (sans espace).

Exemple : `Passw0rd!` → `ok`, `hello` → `length,upper,digit,symbol`, `HELLO-WORLD-42` → `lower`.

**Entrée**
La première ligne contient n. Chacune des n lignes suivantes contient un mot de passe : caractères ASCII imprimables, sans espace.

**Sortie**
n lignes, comme décrit.

**Contraintes**
1 ≤ n ≤ 1 000 · chaque mot de passe fait de 1 à 64 caractères""",
            hint="Calcule cinq booléens en un seul parcours des caractères, puis construis la liste des noms des tests qui ont échoué."),
    ref=r"""import sys
data = sys.stdin.read().split()
n = int(data[0])
out = []
for pw in data[1:1 + n]:
    low = up = dig = sym = False
    for c in pw:
        if "a" <= c <= "z":
            low = True
        elif "A" <= c <= "Z":
            up = True
        elif "0" <= c <= "9":
            dig = True
        else:
            sym = True
    failed = [name for name, ok in (("length", len(pw) >= 8), ("lower", low), ("upper", up), ("digit", dig), ("symbol", sym)) if not ok]
    out.append(",".join(failed) if failed else "ok")
print("\n".join(out))
""",
    brute=r"""import re
n = int(input())
for _ in range(n):
    pw = input().strip()
    failed = []
    if len(pw) < 8:
        failed.append("length")
    if not re.search("[a-z]", pw):
        failed.append("lower")
    if not re.search("[A-Z]", pw):
        failed.append("upper")
    if not re.search("[0-9]", pw):
        failed.append("digit")
    if not re.search("[^a-zA-Z0-9]", pw):
        failed.append("symbol")
    print(",".join(failed) or "ok")
""",
    gen=r"""POOLS = ["abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "0123456789", "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"]
out = []
for _ in range(N):
    use = [p for p in POOLS if r(0, 99) < KEEP]
    if not use:
        use = [POOLS[r(0, 3)]]
    pw = ""
    for _ in range(r(1, MAXLEN)):
        pool = use[r(0, len(use) - 1)]
        pw += pool[r(0, len(pool) - 1)]
    out.append(pw)
return f"{N}\n" + "\n".join(out) + "\n"
""",
    defaults=dict(N=5, KEEP=70, MAXLEN=14),
    samples=["3\nPassw0rd!\nhello\nHELLO-WORLD-42\n", "2\nAb1!\n12345678\n"],
    small=[dict(N=1), dict(N=5, KEEP=100), dict(N=8, KEEP=30), dict(N=10, MAXLEN=8), dict(N=20), dict(N=25, KEEP=50, MAXLEN=10)],
    mid=[dict(N=1000, MAXLEN=64)],
    big=[],
    sig=dict(read=[dict(n="n", t="int", hide=True), dict(n="passwords", t="str[]", len="n")], args=["passwords"], ret="str[]",
             doc=dict(en="`passwords` is the list of passwords. Return, for each one, `\"ok\"` or the failed rules joined with `,` (for example `\"length,digit\"`).",
                      fr="`passwords` est la liste des mots de passe. Retourne, pour chacun, `\"ok\"` ou les règles non respectées reliées par `,` (par exemple `\"length,digit\"`).")),
)

# ============================================================================
# 10. Pagination
# ============================================================================
problem(
    slug="web-pagination", difficulty="easy", time_limit=2.0, topic="web",
    skills="web,math",
    en=dict(title="Next page",
            statement="""A list of **total** items is shown **per_page** items at a time. Pages and items are numbered from 1. For a requested **page**, compute three numbers:
- the number of pages (the last page may be incomplete; 0 items means 0 pages);
- the number of the first item and of the last item shown on that page.

If the page does not exist (less than 1 or more than the number of pages), the two item numbers are `0 0`.

Example: 45 items, 10 per page, page 5 → `5 41 45`. Page 6 → `5 0 0`.

**Input**
One line with three integers: total, per_page and page.

**Output**
Three integers on one line: pages, first item, last item.

**Constraints**
0 ≤ total ≤ 10⁹ · 1 ≤ per_page ≤ 1 000 · -10 ≤ page ≤ 10⁹""",
            hint="pages = ceil(total / per_page), which you can compute with integers as (total + per_page - 1) // per_page. The first item of page p is (p - 1) × per_page + 1; the last can't go past total."),
    fr=dict(title="Page suivante",
            statement="""Une liste de **total** éléments est affichée par **per_page** éléments à la fois. Les pages et les éléments sont numérotés à partir de 1. Pour une **page** demandée, calcule trois nombres :
- le nombre de pages (la dernière peut être incomplète ; 0 élément donne 0 page) ;
- le numéro du premier et du dernier élément affichés sur cette page.

Si la page n'existe pas (inférieure à 1 ou supérieure au nombre de pages), les deux numéros d'éléments valent `0 0`.

Exemple : 45 éléments, 10 par page, page 5 → `5 41 45`. Page 6 → `5 0 0`.

**Entrée**
Une ligne avec trois entiers : total, per_page et page.

**Sortie**
Trois entiers sur une ligne : nombre de pages, premier élément, dernier élément.

**Contraintes**
0 ≤ total ≤ 10⁹ · 1 ≤ per_page ≤ 1 000 · -10 ≤ page ≤ 10⁹""",
            hint="pages = plafond(total / per_page), qu'on calcule avec des entiers : (total + per_page - 1) // per_page. Le premier élément de la page p est (p - 1) × per_page + 1 ; le dernier ne peut pas dépasser total."),
    ref=r"""total, per_page, page = map(int, input().split())
pages = (total + per_page - 1) // per_page
if 1 <= page <= pages:
    first = (page - 1) * per_page + 1
    last = min(page * per_page, total)
    print(pages, first, last)
else:
    print(pages, 0, 0)
""",
    brute=r"""total, per_page, page = map(int, input().split())
pages = 0
first = last = 0
start = 1
while start <= total:
    pages += 1
    if pages == page:
        first, last = start, min(start + per_page - 1, total)
    start += per_page
print(pages, first, last)
""",
    gen=r"""total = r(0, T)
per = r(1, PER)
pages = (total + per - 1) // per
k = r(0, 9)
if k == 0:
    page = r(-10, 0)
elif k == 1:
    page = pages + r(1, 3)
elif k == 2:
    page = pages
elif k == 3:
    page = 1
else:
    page = r(1, max(1, pages))
return f"{total} {per} {page}\n"
""",
    defaults=dict(T=100, PER=10),
    samples=["45 10 5\n", "45 10 6\n"],
    small=[dict(T=0), dict(T=10, PER=3), dict(T=50), dict(T=100, PER=1), dict(T=1000, PER=100), dict(T=500, PER=7), dict(T=3000, PER=1000), dict(T=20, PER=20)],
    mid=[dict(T=10**9, PER=1000), dict(T=10**9, PER=1)],
    big=[],
    sig=dict(read=[dict(n="total", t="int"), dict(n="per_page", t="int"), dict(n="page", t="int")], args=["total", "per_page", "page"], ret="int[]",
             doc=dict(en="Return three numbers: `[pages, first item, last item]` (the last two are `0` when the page doesn't exist).",
                      fr="Retourne trois nombres : `[pages, premier élément, dernier élément]` (les deux derniers valent `0` si la page n'existe pas).")),
)

# ============================================================================
# 11. JSON depth
# ============================================================================
problem(
    slug="web-json-depth", difficulty="medium", time_limit=2.0, topic="web",
    skills="web,stack,strings",
    en=dict(title="How deep is your JSON?",
            statement=r"""An API refuses JSON documents that are nested too deeply. Given a valid JSON document written **without spaces**, print its **maximum nesting depth**: the largest number of objects `{...}` and arrays `[...]` open at the same time.

Careful: brackets **inside strings** don't count. A string starts and ends with `"`; inside it, `\"` is an escaped quote (it does not end the string) and `\\` is an escaped backslash.

Example: `{"a":[1,{"b":"[x]"}],"c":{}}` → `3` (the outer object, the array, the inner object; the `[x]` is inside a string). A lone value like `42` or `"[]"` has depth `0`.

**Input**
One line with the JSON document (no spaces).

**Output**
One integer.

**Constraints**
1 ≤ length ≤ 100 000 · depth ≤ 1 000 · the document is valid JSON""",
            hint=r"""Read the characters one by one with a flag "inside a string". Outside strings, { and [ add one level, } and ] remove one. Inside a string, a \ means "skip the next character"."""),
    fr=dict(title="Quelle profondeur pour ton JSON ?",
            statement=r"""Une API refuse les documents JSON trop imbriqués. Pour un document JSON valide écrit **sans espace**, affiche sa **profondeur d'imbrication maximale** : le plus grand nombre d'objets `{...}` et de tableaux `[...]` ouverts en même temps.

Attention : les crochets et accolades **dans les chaînes** ne comptent pas. Une chaîne commence et finit par `"` ; à l'intérieur, `\"` est un guillemet échappé (il ne termine pas la chaîne) et `\\` est une barre oblique inverse échappée.

Exemple : `{"a":[1,{"b":"[x]"}],"c":{}}` → `3` (l'objet extérieur, le tableau, l'objet intérieur ; le `[x]` est dans une chaîne). Une valeur seule comme `42` ou `"[]"` a une profondeur de `0`.

**Entrée**
Une ligne avec le document JSON (sans espace).

**Sortie**
Un entier.

**Contraintes**
1 ≤ longueur ≤ 100 000 · profondeur ≤ 1 000 · le document est du JSON valide""",
            hint=r"""Lis les caractères un par un avec un drapeau « dans une chaîne ». Hors des chaînes, { et [ ajoutent un niveau, } et ] en retirent un. Dans une chaîne, un \ veut dire « saute le caractère suivant »."""),
    ref=r"""s = input().strip()
depth = best = 0
in_str = False
i = 0
while i < len(s):
    c = s[i]
    if in_str:
        if c == "\\":
            i += 1
        elif c == '"':
            in_str = False
    elif c == '"':
        in_str = True
    elif c in "{[":
        depth += 1
        best = max(best, depth)
    elif c in "}]":
        depth -= 1
    i += 1
print(best)
""",
    brute=r"""import json, sys
sys.setrecursionlimit(10000)

def depth(v):
    if isinstance(v, dict):
        return 1 + max([depth(x) for x in v.values()], default=0)
    if isinstance(v, list):
        return 1 + max([depth(x) for x in v], default=0)
    return 0

print(depth(json.loads(input().strip())))
""",
    gen=r"""CH = "ab{}[],:x1"
def jstr():
    s = '"'
    for _ in range(r(0, 5)):
        k = r(0, 9)
        if k == 0:
            s += '\\"'
        elif k == 1:
            s += '\\\\'
        else:
            s += CH[r(0, len(CH) - 1)]
    return s + '"'
def scalar():
    k = r(0, 3)
    if k == 0:
        return jstr()
    if k == 1:
        return str(r(-99, 999))
    return ["true", "false", "null"][r(0, 2)]
def val(d):
    k = r(0, 9)
    if d >= D or k < LEAF:
        return scalar()
    if k < 7:
        return "[" + ",".join(val(d + 1) for _ in range(r(0, WIDE))) + "]"
    return "{" + ",".join(jstr() + ":" + val(d + 1) for _ in range(r(0, WIDE))) + "}"
doc = val(0)
for i in range(CHAIN):
    if r(0, 1):
        doc = "[" + doc + "," + scalar() + "]"
    else:
        doc = "{" + jstr() + ":" + doc + "}"
return doc + "\n"
""",
    defaults=dict(D=4, WIDE=3, LEAF=2, CHAIN=0),
    samples=['{"a":[1,{"b":"[x]"}],"c":{}}\n', '"[]"\n'],
    small=[dict(D=0), dict(D=1, LEAF=0), dict(D=3), dict(D=5, WIDE=2), dict(D=6, WIDE=3, LEAF=1), dict(D=8, WIDE=2, LEAF=0), dict(D=2, CHAIN=6)],
    mid=[dict(D=7, WIDE=4, LEAF=1), dict(D=3, CHAIN=995)],
    big=[],
    sig=dict(read=[dict(n="text", t="str")], args=["text"], ret="int",
             doc=dict(en="`text` is the JSON document (one string). Return its maximum nesting depth.",
                      fr="`text` est le document JSON (une seule chaîne). Retourne sa profondeur d'imbrication maximale.")),
)

# ============================================================================
# 12. Rate limiter
# ============================================================================
problem(
    slug="web-rate-limiter", difficulty="hard", time_limit=2.0, topic="web",
    skills="web,twopointers,complexity",
    en=dict(title="Too many requests",
            statement="""An API protects itself with a **sliding-window rate limiter**: at most **limit** requests are accepted in any window of **window** seconds. Requests arrive at times t₁ ≤ t₂ ≤ … ≤ tₙ (in seconds, several can share the same second) and are processed in this order.

The request at time t is **allowed** if fewer than `limit` *allowed* requests have a time in the interval (t − window, t] (strictly after t − window, up to t included). Otherwise it is **denied** (HTTP 429), and a denied request does not count for later requests.

Print the number of **denied** requests.

Example: limit = 2, window = 10, times `1 2 3 11 12 13`:
- 1 → allowed, 2 → allowed, 3 → denied (1 and 2 are in (−7, 3]);
- 11 → allowed (only 2 is in (1, 11]); 12 → 2 is **not** in (2, 12] (the interval starts strictly after 2), only 11 counts → allowed;
- 13 → denied (11 and 12 are in (3, 13]).

Answer: `2`.

**Input**
The first line contains n, limit and window. The second line contains the n times, in non-decreasing order.

**Output**
One integer: the number of denied requests.

**Constraints**
1 ≤ n ≤ 200 000 · 1 ≤ limit ≤ n · 1 ≤ window ≤ 10⁹ · 0 ≤ tᵢ ≤ 10⁹

⚠️ The big tests make an O(n²) solution (recounting all the allowed requests for each new one) far too slow.""",
            hint="Keep the times of the allowed requests in a queue. Before deciding on a request at time t, remove from the front every time ≤ t − window: they will never count again because times only grow. Then compare the size of the queue with limit."),
    fr=dict(title="Trop de requêtes",
            statement="""Une API se protège avec un **limiteur de débit à fenêtre glissante** : au plus **limit** requêtes sont acceptées sur toute fenêtre de **window** secondes. Les requêtes arrivent aux instants t₁ ≤ t₂ ≤ … ≤ tₙ (en secondes, plusieurs peuvent tomber la même seconde) et sont traitées dans cet ordre.

La requête à l'instant t est **acceptée** si moins de `limit` requêtes *acceptées* ont un instant dans l'intervalle ]t − window, t] (strictement après t − window, jusqu'à t inclus). Sinon elle est **refusée** (HTTP 429), et une requête refusée ne compte pas pour les suivantes.

Affiche le nombre de requêtes **refusées**.

Exemple : limit = 2, window = 10, instants `1 2 3 11 12 13` :
- 1 → acceptée, 2 → acceptée, 3 → refusée (1 et 2 sont dans ]−7, 3]) ;
- 11 → acceptée (seule 2 est dans ]1, 11]) ; 12 → 2 n'est **pas** dans ]2, 12] (l'intervalle commence strictement après 2), seule 11 compte → acceptée ;
- 13 → refusée (11 et 12 sont dans ]3, 13]).

Réponse : `2`.

**Entrée**
La première ligne contient n, limit et window. La deuxième contient les n instants, dans l'ordre croissant (au sens large).

**Sortie**
Un entier : le nombre de requêtes refusées.

**Contraintes**
1 ≤ n ≤ 200 000 · 1 ≤ limit ≤ n · 1 ≤ window ≤ 10⁹ · 0 ≤ tᵢ ≤ 10⁹

⚠️ Les gros tests rendent une solution en O(n²) (qui recompte toutes les requêtes acceptées à chaque nouvelle requête) beaucoup trop lente.""",
            hint="Garde les instants des requêtes acceptées dans une file. Avant de décider pour une requête à l'instant t, retire du début tous les instants ≤ t − window : ils ne compteront plus jamais, puisque le temps ne fait qu'avancer. Compare ensuite la taille de la file à limit."),
    ref=r"""import sys
from collections import deque
data = sys.stdin.buffer.read().split()
n, limit, window = int(data[0]), int(data[1]), int(data[2])
allowed = deque()
denied = 0
for x in data[3:3 + n]:
    t = int(x)
    while allowed and allowed[0] <= t - window:
        allowed.popleft()
    if len(allowed) < limit:
        allowed.append(t)
    else:
        denied += 1
print(denied)
""",
    brute=r"""n, limit, window = map(int, input().split())
times = list(map(int, input().split()))
allowed = []
denied = 0
for t in times:
    count = 0
    for a in allowed:
        if t - window < a <= t:
            count += 1
    if count < limit:
        allowed.append(t)
    else:
        denied += 1
print(denied)
""",
    gen=r"""t = r(0, 5)
out = []
for _ in range(N):
    if r(0, 99) >= BURST:
        t += r(0, STEP)
    out.append(t)
return f"{N} {L} {WIN}\n{' '.join(map(str, out))}\n"
""",
    defaults=dict(N=6, L=2, WIN=10, STEP=5, BURST=30),
    samples=["6 2 10\n1 2 3 11 12 13\n", "5 1 1\n7 7 8 8 9\n"],
    small=[dict(N=1, L=1), dict(N=5, L=1, WIN=1, STEP=2), dict(N=10, L=3, WIN=5, STEP=3), dict(N=15, L=2, WIN=20, STEP=8, BURST=50),
           dict(N=20, L=5, WIN=10, STEP=2), dict(N=30, L=4, WIN=7, STEP=3, BURST=60), dict(N=25, L=25, WIN=1000, STEP=10)],
    mid=[dict(N=5000, L=50, WIN=100, STEP=4)],
    big=[dict(N=200000, L=60, WIN=200, STEP=4, BURST=20), dict(N=200000, L=1000, WIN=1000000, STEP=5000, BURST=50)],
    sig=dict(read=[dict(n="n", t="int", hide=True), dict(n="limit", t="int"), dict(n="window", t="int"), dict(n="times", t="int[]", len="n")],
             args=["times", "limit", "window"], ret="int",
             doc=dict(en="`times` is the list of request times (non-decreasing), `limit` and `window` the limiter settings. Return the number of denied requests.",
                      fr="`times` est la liste des instants des requêtes (croissante au sens large), `limit` et `window` les réglages du limiteur. Retourne le nombre de requêtes refusées.")),
)

# ============================================================================
# 13. Semantic versions
# ============================================================================
problem(
    slug="web-semver-sort", difficulty="medium", time_limit=2.0, topic="web",
    skills="web,sorting,strings",
    en=dict(title="Release order",
            statement="""npm and Composer name package versions with **semantic versioning**: `MAJOR.MINOR.PATCH`, optionally followed by `-` and a **pre-release** tag, like `2.1.0-beta` or `1.0.0-rc.1`. Sort a list of versions from oldest to newest:
1. compare MAJOR, then MINOR, then PATCH **as numbers** (`1.10.0` is newer than `1.9.0`);
2. if they are equal, a pre-release comes **before** the release without tag (`1.0.0-rc.1` < `1.0.0`);
3. two pre-releases of the same version are compared as **plain strings** (character by character, ASCII order: `alpha` < `beta` < `rc.1` < `rc.10` < `rc.2`).

Identical versions stay in the list.

Example: `1.10.0 1.2.0 1.0.0 1.0.0-rc.1 1.0.0-alpha` → `1.0.0-alpha 1.0.0-rc.1 1.0.0 1.2.0 1.10.0` (one per line).

**Input**
The first line contains n. Each of the next n lines contains a version. Numbers have no leading zeros; a tag contains lowercase letters, digits and `.`.

**Output**
n lines, the sorted versions.

**Constraints**
1 ≤ n ≤ 2 000 · 0 ≤ MAJOR, MINOR, PATCH ≤ 10⁹""",
            hint="Turn each version into a sort key: (major, minor, patch, 0 if there is a tag else 1, tag). Most languages compare such tuples or arrays element by element; otherwise write a comparison function."),
    fr=dict(title="Ordre des versions",
            statement="""npm et Composer nomment les versions des paquets avec le **versionnage sémantique** : `MAJOR.MINOR.PATCH`, éventuellement suivi de `-` et d'une étiquette de **pré-version**, comme `2.1.0-beta` ou `1.0.0-rc.1`. Trie une liste de versions de la plus ancienne à la plus récente :
1. compare MAJOR, puis MINOR, puis PATCH **comme des nombres** (`1.10.0` est plus récente que `1.9.0`) ;
2. s'ils sont égaux, une pré-version passe **avant** la version sans étiquette (`1.0.0-rc.1` < `1.0.0`) ;
3. deux pré-versions de la même version se comparent comme de **simples chaînes** (caractère par caractère, ordre ASCII : `alpha` < `beta` < `rc.1` < `rc.10` < `rc.2`).

Les versions identiques restent dans la liste.

Exemple : `1.10.0 1.2.0 1.0.0 1.0.0-rc.1 1.0.0-alpha` → `1.0.0-alpha 1.0.0-rc.1 1.0.0 1.2.0 1.10.0` (une par ligne).

**Entrée**
La première ligne contient n. Chacune des n lignes suivantes contient une version. Les nombres n'ont pas de zéros inutiles en tête ; une étiquette contient des lettres minuscules, des chiffres et des `.`.

**Sortie**
n lignes, les versions triées.

**Contraintes**
1 ≤ n ≤ 2 000 · 0 ≤ MAJOR, MINOR, PATCH ≤ 10⁹""",
            hint="Transforme chaque version en clé de tri : (major, minor, patch, 0 s'il y a une étiquette sinon 1, étiquette). Beaucoup de langages comparent ces tuples ou tableaux élément par élément ; sinon, écris une fonction de comparaison."),
    ref=r"""import sys

def key(v):
    core, _, tag = v.partition("-")
    major, minor, patch = map(int, core.split("."))
    return (major, minor, patch, 0 if tag else 1, tag)

data = sys.stdin.read().split()
n = int(data[0])
print("\n".join(sorted(data[1:1 + n], key=key)))
""",
    brute=r"""def less(a, b):
    ca, ta = (a.split("-", 1) + [""])[:2]
    cb, tb = (b.split("-", 1) + [""])[:2]
    na = [int(x) for x in ca.split(".")]
    nb = [int(x) for x in cb.split(".")]
    if na != nb:
        return na < nb
    if ta == "" or tb == "":
        return ta != "" and tb == ""
    return ta < tb

n = int(input())
vs = [input().strip() for _ in range(n)]
for i in range(1, n):
    j = i
    while j > 0 and less(vs[j], vs[j - 1]):
        vs[j], vs[j - 1] = vs[j - 1], vs[j]
        j -= 1
print("\n".join(vs))
""",
    gen=r"""TAGS = ["alpha", "beta", "rc.1", "rc.2", "rc.10", "alpha.1", "beta.2", "dev", "0.3"]
out = []
for _ in range(N):
    v = f"{r(0, M)}.{r(0, M)}.{r(0, M)}"
    if r(0, 99) < PRE:
        v += "-" + TAGS[r(0, len(TAGS) - 1)]
    out.append(v)
return f"{N}\n" + "\n".join(out) + "\n"
""",
    defaults=dict(N=5, M=3, PRE=40),
    samples=["5\n1.10.0\n1.2.0\n1.0.0\n1.0.0-rc.1\n1.0.0-alpha\n", "4\n2.0.0\n2.0.0-rc.10\n2.0.0-rc.2\n0.9.12\n"],
    small=[dict(N=1), dict(N=4, M=1), dict(N=8, M=0, PRE=80), dict(N=10, M=12), dict(N=15, M=2, PRE=60), dict(N=20, M=10**9, PRE=20), dict(N=30, M=1, PRE=50)],
    mid=[dict(N=2000, M=20)],
    big=[],
    sig=dict(read=[dict(n="n", t="int", hide=True), dict(n="versions", t="str[]", len="n")], args=["versions"], ret="str[]",
             doc=dict(en="`versions` is the list of versions. Return them sorted from oldest to newest.",
                      fr="`versions` est la liste des versions. Retourne-les triées de la plus ancienne à la plus récente.")),
)

# ============================================================================
# 14. Top routes
# ============================================================================
problem(
    slug="web-top-routes", difficulty="medium", time_limit=2.0, topic="web",
    skills="web,dicts,sorting",
    en=dict(title="Hot endpoints",
            statement="""A server writes one line per request in its access log, as `METHOD:path` (for example `GET:/home` or `POST:/api/login`). Find the **k most requested** endpoints.

Sort the distinct entries by number of requests, **highest first**; break ties by the entry itself in **alphabetical order** (plain ASCII comparison of the whole `METHOD:path` string). Print the first k as `METHOD:path=count`. If there are fewer than k distinct entries, print them all.

Example: with k = 2 and the log `GET:/home POST:/login GET:/home GET:/about POST:/login GET:/home`, the counts are `GET:/home` 3, `POST:/login` 2, `GET:/about` 1, so the answer is `GET:/home=3` and `POST:/login=2`.

**Input**
The first line contains n and k. The second line contains the n log entries, separated by spaces.

**Output**
At most k lines, as described.

**Constraints**
1 ≤ n ≤ 200 000 · 1 ≤ k ≤ 100 · each entry has at most 40 characters, without spaces

⚠️ There can be tens of thousands of distinct endpoints: counting each one by rescanning the whole log (O(n × distinct)) is far too slow.""",
            hint="Count with a dictionary (a Map in JS, an array in PHP) in a single pass, then sort the distinct entries with a comparator: count descending, then the string ascending."),
    fr=dict(title="Routes les plus demandées",
            statement="""Un serveur écrit une ligne par requête dans son journal d'accès, sous la forme `METHOD:path` (par exemple `GET:/home` ou `POST:/api/login`). Trouve les **k routes les plus demandées**.

Trie les entrées distinctes par nombre de requêtes, **de la plus grande à la plus petite** ; en cas d'égalité, par l'entrée elle-même dans l'**ordre alphabétique** (comparaison ASCII simple de toute la chaîne `METHOD:path`). Affiche les k premières sous la forme `METHOD:path=nombre`. S'il y a moins de k entrées distinctes, affiche-les toutes.

Exemple : avec k = 2 et le journal `GET:/home POST:/login GET:/home GET:/about POST:/login GET:/home`, on compte `GET:/home` 3, `POST:/login` 2, `GET:/about` 1, donc la réponse est `GET:/home=3` puis `POST:/login=2`.

**Entrée**
La première ligne contient n et k. La deuxième contient les n entrées du journal, séparées par des espaces.

**Sortie**
Au plus k lignes, comme décrit.

**Contraintes**
1 ≤ n ≤ 200 000 · 1 ≤ k ≤ 100 · chaque entrée fait au plus 40 caractères, sans espace

⚠️ Il peut y avoir des dizaines de milliers de routes distinctes : compter chacune en reparcourant tout le journal (O(n × distinctes)) est bien trop lent.""",
            hint="Compte avec un dictionnaire (une Map en JS, un tableau en PHP) en un seul parcours, puis trie les entrées distinctes avec un comparateur : nombre décroissant, puis chaîne croissante."),
    ref=r"""import sys
data = sys.stdin.buffer.read().split()
n, k = int(data[0]), int(data[1])
counts = {}
for e in data[2:2 + n]:
    counts[e] = counts.get(e, 0) + 1
best = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:k]
sys.stdout.write("\n".join(f"{e.decode()}={c}" for e, c in best) + "\n")
""",
    brute=r"""n, k = map(int, input().split())
log = input().split()
distinct = []
for e in log:
    if e not in distinct:
        distinct.append(e)
pairs = [(log.count(e), e) for e in distinct]
pairs.sort(key=lambda p: p[1])
pairs.sort(key=lambda p: p[0], reverse=True)
for c, e in pairs[:k]:
    print(f"{e}={c}")
""",
    gen=r"""METHODS = ["GET", "GET", "GET", "POST", "PUT", "DELETE", "PATCH"]
BASE = ["/home", "/about", "/login", "/api/items", "/api/users", "/blog", "/cart", "/search"]
routes = []
for i in range(D):
    p = BASE[r(0, len(BASE) - 1)]
    if i >= len(BASE):
        p += "/" + str(r(1, ID))
    routes.append(METHODS[r(0, len(METHODS) - 1)] + ":" + p)
out = []
for _ in range(N):
    a = r(0, D - 1)
    if SKEW:
        a = min(a, r(0, D - 1))
    out.append(routes[a])
return f"{N} {K}\n{' '.join(out)}\n"
""",
    defaults=dict(N=6, K=3, D=4, ID=5, SKEW=1),
    samples=["6 2\nGET:/home POST:/login GET:/home GET:/about POST:/login GET:/home\n", "3 5\nGET:/a GET:/b GET:/a\n"],
    small=[dict(N=1, K=1, D=1), dict(N=8, K=2, D=3), dict(N=10, K=10, D=5, SKEW=0), dict(N=20, K=3, D=8), dict(N=30, K=5, D=15, ID=3),
           dict(N=40, K=4, D=20, ID=9, SKEW=0)],
    mid=[dict(N=3000, K=20, D=200, ID=100)],
    big=[dict(N=200000, K=100, D=200000, ID=10**6), dict(N=200000, K=10, D=50, ID=20)],
    sig=dict(read=[dict(n="n", t="int", hide=True), dict(n="k", t="int"), dict(n="entries", t="str[]", len="n")], args=["entries", "k"], ret="str[]",
             doc=dict(en="`entries` is the list of log entries, `k` the number to keep. Return the lines `\"METHOD:path=count\"`, most requested first.",
                      fr="`entries` est la liste des entrées du journal, `k` le nombre à garder. Retourne les lignes `\"METHOD:path=nombre\"`, la plus demandée en premier.")),
)
