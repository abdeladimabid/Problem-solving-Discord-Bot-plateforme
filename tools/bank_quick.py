"""Quick challenges (answered inside Discord), English + French.

kind:
  mcq         multiple choice, checks understanding        (1x points)
  complexity  Big-O of a snippet                           (2x points)
  output      type exactly what the code prints            (3x points)
  bug         find what's wrong (multiple choice)          (5x points)

For "output" the answer is computed by running the code (never typed by hand).
"check" (optional) is code whose printed result must equal "expect": it proves
that the claim in the question/answer is real (e.g. that the bug happens).
Choices are in the same order in both languages; "answer" is a letter.
"""

QUICK = [
    # =================================================================== EASY
    dict(kind="output", difficulty="easy", topic="integer division", code="""print(-7 // 2, -7 % 2, int(-7 / 2))""",
         en=dict(title="Floors and remainders", question="What does this code print?",
                 hint="`//` rounds toward minus infinity, `int()` rounds toward zero.",
                 explanation="-7 // 2 floors -3.5 down to -4; the remainder has the sign of the divisor: -7 = 2*(-4) + 1; int(-3.5) truncates toward zero: -3."),
         fr=dict(title="Divisions et restes", question="Qu'affiche ce code ?",
                 hint="`//` arrondit vers moins l'infini, `int()` arrondit vers zéro.",
                 explanation="-7 // 2 arrondit -3,5 vers le bas : -4 ; le reste a le signe du diviseur : -7 = 2*(-4) + 1 ; int(-3,5) tronque vers zéro : -3.")),
    dict(kind="output", difficulty="easy", topic="slicing", code="""s = "programming"
print(s[1:8:2], s[::-3])""",
         en=dict(title="Step by step", question="What does this code print?",
                 hint="Write the indexes 0..10 under the letters first.",
                 explanation="s[1:8:2] takes indexes 1, 3, 5, 7 (r, g, a, m). s[::-3] starts at the last index (10) and goes back 3 at a time: 10, 7, 4, 1."),
         fr=dict(title="Pas à pas", question="Qu'affiche ce code ?",
                 hint="Écris d'abord les indices 0..10 sous les lettres.",
                 explanation="s[1:8:2] prend les indices 1, 3, 5, 7 (r, g, a, m). s[::-3] part du dernier indice (10) et recule de 3 : 10, 7, 4, 1.")),
    dict(kind="output", difficulty="easy", topic="lists", code="""a = [1, 2, 3]
b = a
c = a[:]
b.append(4)
c.append(5)
print(a, len(c))""",
         en=dict(title="Alias or copy?", question="What does this code print?",
                 hint="One of these lines makes a copy, the other doesn't.",
                 explanation="b is another name for the same list as a, so a gets the 4. a[:] makes a new list, so c's 5 doesn't touch a. c is [1, 2, 3, 5]."),
         fr=dict(title="Alias ou copie ?", question="Qu'affiche ce code ?",
                 hint="Une de ces lignes fait une copie, l'autre non.",
                 explanation="b est un autre nom pour la même liste que a, donc a reçoit le 4. a[:] crée une nouvelle liste : le 5 de c ne touche pas a. c vaut [1, 2, 3, 5].")),
    dict(kind="output", difficulty="easy", topic="loops", code="""for n in [3, 5, 7, 9]:
    if n % 3 == 0 and n > 3:
        print("found", n)
        break
else:
    print("none")
print(n)""",
         en=dict(title="for ... else", question="What does this code print? (write each printed line, separated by a space or a new line)",
                 hint="The `else` of a `for` runs only if the loop was NOT stopped by `break`.",
                 explanation="3 fails `n > 3`, 5 and 7 aren't multiples of 3, 9 matches: it prints \"found 9\" and breaks, so the else block is skipped. The loop variable keeps its last value: 9."),
         fr=dict(title="for ... else", question="Qu'affiche ce code ? (écris chaque ligne affichée, séparées par un espace ou un retour à la ligne)",
                 hint="Le `else` d'un `for` ne s'exécute que si la boucle n'a PAS été arrêtée par `break`.",
                 explanation="3 échoue sur `n > 3`, 5 et 7 ne sont pas des multiples de 3, 9 correspond : « found 9 » puis break, donc le else est sauté. La variable de boucle garde sa dernière valeur : 9.")),
    dict(kind="output", difficulty="easy", topic="dictionaries", code="""d = {}
for w in "to be or not to be".split():
    d[len(w)] = w
print(d)""",
         en=dict(title="Last one wins", question="What does this code print?",
                 hint="A key keeps its first position but its value is overwritten each time.",
                 explanation="Keys are word lengths. Length 2 is first set by 'to' and finally overwritten by the last 2-letter word, 'be'. Length 3 is only 'not'. Keys stay in first-insertion order."),
         fr=dict(title="Le dernier gagne", question="Qu'affiche ce code ?",
                 hint="Une clé garde sa première position mais sa valeur est écrasée à chaque fois.",
                 explanation="Les clés sont les longueurs des mots. La longueur 2 est d'abord 'to', puis écrasée par le dernier mot de 2 lettres, 'be'. La longueur 3 n'est que 'not'. Les clés restent dans l'ordre de première insertion.")),
    dict(kind="output", difficulty="easy", topic="strings", code="""words = ["ab", "c"] * 2
print("-".join(words), len("".join(words) * 2))""",
         en=dict(title="Join the club", question="What does this code print?",
                 hint="Multiplying a list repeats its elements.",
                 explanation="words is ['ab', 'c', 'ab', 'c']. Joined with '-' that's ab-c-ab-c. Joined with '' it's 'abcabc' (6 chars), times 2 is 12 chars."),
         fr=dict(title="Tous ensemble", question="Qu'affiche ce code ?",
                 hint="Multiplier une liste répète ses éléments.",
                 explanation="words vaut ['ab', 'c', 'ab', 'c']. Joint avec '-' : ab-c-ab-c. Joint avec '' : 'abcabc' (6 caractères), fois 2 : 12 caractères.")),

    dict(kind="mcq", difficulty="easy", topic="comparisons", choices=['`0.1 + 0.2 == 0.3`', '`"abc" < "abd"`', '`[1, 2] == (1, 2)`', '`None == 0`'], answer="B",
         check='print(0.1 + 0.2 == 0.3, "abc" < "abd", [1, 2] == (1, 2), None == 0)', expect="False True False False",
         en=dict(title="Only one is True", question="Which expression evaluates to `True`?", hint="Floats are approximations; strings compare letter by letter.",
                 explanation="Strings compare character by character and 'c' < 'd'. 0.1 + 0.2 is 0.30000000000000004, a list never equals a tuple, and None is not 0."),
         fr=dict(title="Une seule est vraie", question="Quelle expression vaut `True` ?", hint="Les flottants sont des approximations ; les chaînes se comparent lettre par lettre.",
                 explanation="Les chaînes se comparent caractère par caractère et 'c' < 'd'. 0.1 + 0.2 vaut 0.30000000000000004, une liste n'est jamais égale à un tuple, et None n'est pas 0.")),
    dict(kind="mcq", difficulty="easy", topic="hashing", choices=["`[1, 2]`", "`{1, 2}`", "`(1, [2])`", "`(1, 2)`"], answer="D",
         check="r=[]\nfor k in ([1,2], {1,2}, (1,[2]), (1,2)):\n    try:\n        hash(k); r.append('ok')\n    except TypeError:\n        r.append('no')\nprint(*r)", expect="no no no ok",
         en=dict(title="Key material", question="Which of these can be used as a dictionary key?", hint="Keys must be hashable, and that applies to everything inside a tuple too.",
                 explanation="Only fully immutable values are hashable. Lists and sets are mutable, and a tuple that contains a list is unhashable too."),
         fr=dict(title="Bonne clé", question="Lequel peut servir de clé de dictionnaire ?", hint="Les clés doivent être hachables, et cela vaut aussi pour le contenu d'un tuple.",
                 explanation="Seules les valeurs entièrement immuables sont hachables. Les listes et les ensembles sont mutables, et un tuple qui contient une liste n'est pas hachable non plus.")),
    dict(kind="mcq", difficulty="easy", topic="range", choices=["3", "4", "10", "0"], answer="B",
         check="print(len(range(10, 0, -3)))", expect="4",
         en=dict(title="Counting down", question="How many numbers does `range(10, 0, -3)` produce?", hint="List them: start at 10, stop before 0.",
                 explanation="10, 7, 4, 1: four numbers. The next one, -2, is past the stop value 0."),
         fr=dict(title="Compte à rebours", question="Combien de nombres `range(10, 0, -3)` produit-il ?", hint="Liste-les : on part de 10 et on s'arrête avant 0.",
                 explanation="10, 7, 4, 1 : quatre nombres. Le suivant, -2, dépasse la borne 0.")),
    dict(kind="mcq", difficulty="easy", topic="truthiness", choices=["`True`", "`False`", "an error", "`None`"], answer="A",
         check="print(bool('False'))", expect="True",
         en=dict(title="Truth be told", question="What does `bool(\"False\")` return?", hint="What matters for a string is whether it's empty.",
                 explanation="Any non-empty string is truthy, whatever it says. Only \"\" is falsy."),
         fr=dict(title="Vrai ou faux", question="Que renvoie `bool(\"False\")` ?", hint="Pour une chaîne, seule compte sa longueur.",
                 explanation="Toute chaîne non vide est vraie, quel que soit son contenu. Seule \"\" est fausse.")),
    dict(kind="mcq", difficulty="easy", topic="binary search", choices=["sorted", "of even length", "free of duplicates", "made of integers"], answer="A",
         en=dict(title="Before you search", question="Binary search on a list only works if the list is…", hint="Binary search throws away half of the list after each comparison. Why is that allowed?",
                 explanation="Each comparison discards half of the list, which is only valid when the elements are in order. Duplicates, length and type don't matter."),
         fr=dict(title="Avant de chercher", question="La recherche dichotomique sur une liste ne fonctionne que si la liste est…", hint="Elle élimine la moitié de la liste à chaque comparaison. Pourquoi est-ce permis ?",
                 explanation="Chaque comparaison élimine la moitié de la liste, ce qui n'est valable que si les éléments sont dans l'ordre. Les doublons, la longueur et le type n'ont pas d'importance."),
         fr_choices=["triée", "de longueur paire", "sans doublons", "composée d'entiers"]),

    dict(kind="bug", difficulty="easy", topic="loops", code="""def count_vowels(s):
    count = 0
    for ch in s:
        if ch in "aeiou":
            count += 1
        return count""", answer="B",
         check='print(count_vowels("banana"))', expect="0",
         en=dict(title="Vowel counter", question="`count_vowels(\"banana\")` should return 3. What is wrong?",
                 choices=["`count` should start at 1", "`return` is inside the loop, so it returns after the first character", "`in` doesn't work on strings", "Nothing, it works"],
                 hint="Look carefully at the indentation of the last line.",
                 explanation="The `return` is indented inside the `for`, so the function returns after checking only the first character ('b' → 0). Dedent it by one level."),
         fr=dict(title="Compteur de voyelles", question="`count_vowels(\"banana\")` devrait renvoyer 3. Qu'est-ce qui ne va pas ?",
                 choices=["`count` devrait commencer à 1", "le `return` est dans la boucle, donc la fonction s'arrête après le premier caractère", "`in` ne fonctionne pas sur les chaînes", "Rien, ça marche"],
                 hint="Regarde bien l'indentation de la dernière ligne.",
                 explanation="Le `return` est indenté dans le `for` : la fonction s'arrête après le premier caractère ('b' → 0). Il faut le désindenter d'un niveau.")),
    dict(kind="bug", difficulty="easy", topic="initialization", code="""def maximum(nums):
    best = 0
    for x in nums:
        if x > best:
            best = x
    return best""", answer="B",
         check="print(maximum([-5, -2, -9]))", expect="0",
         en=dict(title="The maximum", question="This should return the largest number of a non-empty list. When is it wrong?",
                 choices=["It skips the first element", "It returns 0 when all the numbers are negative", "It crashes on any list with duplicates", "It's never wrong"],
                 hint="Try it with [-5, -2, -9].",
                 explanation="best starts at 0, which is bigger than every negative number, so maximum([-5, -2, -9]) returns 0. Start with best = nums[0] instead."),
         fr=dict(title="Le maximum", question="Cette fonction doit renvoyer le plus grand nombre d'une liste non vide. Quand se trompe-t-elle ?",
                 choices=["Elle saute le premier élément", "Elle renvoie 0 quand tous les nombres sont négatifs", "Elle plante sur toute liste avec des doublons", "Jamais"],
                 hint="Essaie avec [-5, -2, -9].",
                 explanation="best commence à 0, plus grand que tout nombre négatif : maximum([-5, -2, -9]) renvoie 0. Il faut commencer avec best = nums[0].")),
    dict(kind="bug", difficulty="easy", topic="methods", code="""def reverse_words(sentence):
    words = sentence.split()
    words.reverse
    return " ".join(words)""", answer="B",
         check='print(reverse_words("one two three"))', expect="one two three",
         en=dict(title="Backwards", question="`reverse_words(\"one two three\")` should return \"three two one\". What is wrong?",
                 choices=["`split()` needs an argument", "`words.reverse` is never called: the parentheses are missing", "`join` only accepts numbers", "Nothing, it works"],
                 hint="What's the difference between `f` and `f()`?",
                 explanation="`words.reverse` only refers to the method without calling it, so the list is unchanged. It must be `words.reverse()`."),
         fr=dict(title="À l'envers", question="`reverse_words(\"one two three\")` devrait renvoyer \"three two one\". Qu'est-ce qui ne va pas ?",
                 choices=["`split()` a besoin d'un argument", "`words.reverse` n'est jamais appelée : il manque les parenthèses", "`join` n'accepte que des nombres", "Rien, ça marche"],
                 hint="Quelle différence entre `f` et `f()` ?",
                 explanation="`words.reverse` désigne la méthode sans l'appeler : la liste ne change pas. Il faut `words.reverse()`.")),
    dict(kind="bug", difficulty="easy", topic="loops", code="""def factorial(n):
    result = 1
    for i in range(n):
        result *= i
    return result""", answer="B",
         check="print(factorial(5))", expect="0",
         en=dict(title="Zero factorial", question="`factorial(5)` should return 120. What is wrong?",
                 choices=["`result` should start at 0", "`range(n)` starts at 0, so `result` is always multiplied by 0", "It should use a `while` loop", "It overflows for big n"],
                 hint="What's the first value of i?",
                 explanation="range(n) yields 0 first, and anything times 0 is 0. Use range(1, n + 1)."),
         fr=dict(title="Factorielle nulle", question="`factorial(5)` devrait renvoyer 120. Qu'est-ce qui ne va pas ?",
                 choices=["`result` devrait commencer à 0", "`range(n)` commence à 0, donc `result` est toujours multiplié par 0", "Il faudrait une boucle `while`", "Ça déborde pour les grands n"],
                 hint="Quelle est la première valeur de i ?",
                 explanation="range(n) donne d'abord 0, et tout nombre multiplié par 0 vaut 0. Il faut range(1, n + 1).")),

    dict(kind="complexity", difficulty="easy", topic="sets", code="""total = 0
for x in nums:        # n elements
    if x in seen:     # seen is a set
        total += 1""", choices=["O(1)", "O(log n)", "O(n)", "O(n²)"], answer="C",
         en=dict(title="Set membership", question="What is the time complexity of this loop?", hint="How long does `x in some_set` take on average?",
                 explanation="The loop runs n times and a set lookup is O(1) on average, so the total is O(n)."),
         fr=dict(title="Appartenance à un ensemble", question="Quelle est la complexité de cette boucle ?", hint="Combien de temps prend `x in un_set` en moyenne ?",
                 explanation="La boucle tourne n fois et une recherche dans un set est en O(1) en moyenne : O(n) au total.")),
    dict(kind="complexity", difficulty="easy", topic="loops", code="""for i in range(n):
    for j in range(5):
        print(i * j)""", choices=["O(n)", "O(n²)", "O(5n²)", "O(log n)"], answer="A",
         en=dict(title="Two loops, but…", question="What is the time complexity?", hint="Does the inner loop depend on n?",
                 explanation="The inner loop always runs 5 times, a constant. 5n operations is O(n): two nested loops don't automatically mean O(n²)."),
         fr=dict(title="Deux boucles, mais…", question="Quelle est la complexité ?", hint="La boucle interne dépend-elle de n ?",
                 explanation="La boucle interne tourne toujours 5 fois, c'est une constante. 5n opérations, c'est O(n) : deux boucles imbriquées ne veulent pas forcément dire O(n²).")),
    dict(kind="complexity", difficulty="easy", topic="loops", code="""i = 1
while i < n:
    i *= 3""", choices=["O(n)", "O(n/3)", "O(log n)", "O(1)"], answer="C",
         en=dict(title="Triple jump", question="How many times does this loop run, in Big-O?", hint="After k steps, i is 3^k.",
                 explanation="i is multiplied by 3 at each step, so it reaches n after about log₃(n) steps: O(log n)."),
         fr=dict(title="Triple saut", question="Combien de fois cette boucle tourne-t-elle, en grand O ?", hint="Après k tours, i vaut 3^k.",
                 explanation="i est multiplié par 3 à chaque tour : il atteint n après environ log₃(n) tours, soit O(log n).")),
    dict(kind="complexity", difficulty="easy", topic="strings", code="""def is_upper_word(word):     # word has n letters
    return word == word.upper()""", choices=["O(1)", "O(n)", "O(n²)", "O(log n)"], answer="B",
         en=dict(title="Shout check", question="What is the time complexity of this function?", hint="What does word.upper() have to build?",
                 explanation="upper() builds a new string of n characters, and comparing two strings of length n is also O(n). One line of code can still be O(n)."),
         fr=dict(title="Tout en majuscules", question="Quelle est la complexité de cette fonction ?", hint="Que doit construire word.upper() ?",
                 explanation="upper() construit une nouvelle chaîne de n caractères, et comparer deux chaînes de longueur n est aussi en O(n). Une seule ligne peut quand même être en O(n).")),

    # ================================================================= MEDIUM
    dict(kind="output", difficulty="medium", topic="default arguments", code="""def add(item, bucket=[]):
    bucket.append(item)
    return bucket

a = add(1)
b = add(2, [])
c = add(3)
print(a, b, c, a is c)""",
         en=dict(title="Shared bucket", question="What does this code print?", hint="When is the default list created: at each call, or once?",
                 explanation="The default list is created once, when `def` runs. Calls a and c both use it, so they return the same list [1, 3]; b used its own list."),
         fr=dict(title="Seau partagé", question="Qu'affiche ce code ?", hint="Quand la liste par défaut est-elle créée : à chaque appel, ou une seule fois ?",
                 explanation="La liste par défaut est créée une seule fois, à l'exécution du `def`. Les appels a et c l'utilisent tous les deux et renvoient la même liste [1, 3] ; b a utilisé sa propre liste.")),
    dict(kind="output", difficulty="medium", topic="closures", code="""def counter():
    count = 0
    def inc():
        nonlocal count
        count += 1
        return count
    return inc

c1, c2 = counter(), counter()
print(c1(), c1(), c2(), c1())""",
         en=dict(title="Two counters", question="What does this code print?", hint="Each call to counter() creates a new `count` variable.",
                 explanation="c1 and c2 each close over their own `count`. c1 goes 1, 2, then c2 starts at 1, then c1 continues at 3."),
         fr=dict(title="Deux compteurs", question="Qu'affiche ce code ?", hint="Chaque appel à counter() crée une nouvelle variable `count`.",
                 explanation="c1 et c2 capturent chacun leur propre `count`. c1 fait 1, 2, puis c2 commence à 1, puis c1 continue à 3.")),
    dict(kind="output", difficulty="medium", topic="sorting", code="""people = [("ana", 25), ("bob", 20), ("cid", 25), ("dan", 20)]
people.sort(key=lambda p: p[1], reverse=True)
print([p[0] for p in people])""",
         en=dict(title="Stable and reversed", question="What does this code print?", hint="Python's sort is stable, even with reverse=True.",
                 explanation="Sorting by age descending puts the 25s first. Python's sort is stable, and reverse=True keeps equal elements in their original order: ana before cid, bob before dan."),
         fr=dict(title="Stable et inversé", question="Qu'affiche ce code ?", hint="Le tri de Python est stable, même avec reverse=True.",
                 explanation="Le tri par âge décroissant met les 25 ans en premier. Le tri de Python est stable, et reverse=True garde les éléments égaux dans leur ordre d'origine : ana avant cid, bob avant dan.")),
    dict(kind="output", difficulty="medium", topic="generators", code="""squares = (x * x for x in range(4))
print(sum(squares), sum(squares), list(squares))""",
         en=dict(title="Used up", question="What does this code print?", hint="A generator can only be iterated once.",
                 explanation="The first sum consumes the generator: 0 + 1 + 4 + 9 = 14. After that it's exhausted, so the second sum is 0 and the list is empty."),
         fr=dict(title="Épuisé", question="Qu'affiche ce code ?", hint="Un générateur ne se parcourt qu'une fois.",
                 explanation="La première somme consomme le générateur : 0 + 1 + 4 + 9 = 14. Ensuite il est épuisé : la deuxième somme vaut 0 et la liste est vide.")),
    dict(kind="output", difficulty="medium", topic="boolean operators", code="""print(0 or [] or "x", 3 and 0 and 5, None or 0)""",
         en=dict(title="and/or return values", question="What does this code print?", hint="`or` returns the first truthy operand (or the last one); `and` returns the first falsy one (or the last one).",
                 explanation="`0 or [] or \"x\"` returns the first truthy value, x. `3 and 0 and 5` stops at the first falsy value, 0. `None or 0`: nothing is truthy, so it returns the last operand, 0."),
         fr=dict(title="Ce que renvoient and/or", question="Qu'affiche ce code ?", hint="`or` renvoie le premier opérande vrai (ou le dernier) ; `and` renvoie le premier faux (ou le dernier).",
                 explanation="`0 or [] or \"x\"` renvoie la première valeur vraie, x. `3 and 0 and 5` s'arrête à la première valeur fausse, 0. `None or 0` : rien n'est vrai, donc le dernier opérande, 0.")),
    dict(kind="output", difficulty="medium", topic="recursion", code="""def f(n):
    if n <= 1:
        return [n]
    return f(n // 2) + [n] + f(n // 3)

print(f(6))""",
         en=dict(title="Recursive tree", question="What does this code print?", hint="Compute f(1), f(0), f(2), f(3) first, then f(6) = f(3) + [6] + f(2).",
                 explanation="f(0)=[0], f(1)=[1], f(2)=f(1)+[2]+f(0)=[1,2,0], f(3)=f(1)+[3]+f(1)=[1,3,1], so f(6)=f(3)+[6]+f(2)."),
         fr=dict(title="Arbre récursif", question="Qu'affiche ce code ?", hint="Calcule d'abord f(1), f(0), f(2), f(3), puis f(6) = f(3) + [6] + f(2).",
                 explanation="f(0)=[0], f(1)=[1], f(2)=f(1)+[2]+f(0)=[1,2,0], f(3)=f(1)+[3]+f(1)=[1,3,1], donc f(6)=f(3)+[6]+f(2).")),

    dict(kind="mcq", difficulty="medium", topic="hash tables", choices=["O(log n), when the dict is large", "O(n), when many keys collide in the hash table", "O(1), always", "O(n log n), while the dict resizes"], answer="B",
         fr_choices=["O(log n), quand le dict est grand", "O(n), quand beaucoup de clés entrent en collision dans la table", "O(1), toujours", "O(n log n), pendant le redimensionnement"],
         en=dict(title="Worst-case lookup", question="A dict lookup is O(1) on average. What is its worst case, and when does it happen?", hint="A hash table puts keys in buckets based on their hash.",
                 explanation="If many keys land in the same bucket (collisions), finding one means checking them one by one: O(n). Good hash functions make this very rare."),
         fr=dict(title="Pire cas d'une recherche", question="Une recherche dans un dict est en O(1) en moyenne. Quel est son pire cas, et quand arrive-t-il ?", hint="Une table de hachage range les clés dans des cases selon leur hash.",
                 explanation="Si beaucoup de clés tombent dans la même case (collisions), il faut les comparer une par une : O(n). De bonnes fonctions de hachage rendent ce cas très rare.")),
    dict(kind="mcq", difficulty="medium", topic="sorting", choices=["Merge sort", "Insertion sort", "Heap sort", "Timsort (Python's `sorted`)"], answer="C",
         fr_choices=["Tri fusion", "Tri par insertion", "Tri par tas", "Timsort (le `sorted` de Python)"],
         en=dict(title="Unstable", question="Which of these sorting algorithms is NOT stable (it can change the order of equal elements)?", hint="Think about how elements jump around in a heap.",
                 explanation="Heap sort moves elements across the array through the heap, which can swap equal elements. Merge sort, insertion sort and Timsort are stable."),
         fr=dict(title="Instable", question="Lequel de ces algorithmes de tri n'est PAS stable (il peut changer l'ordre des éléments égaux) ?", hint="Pense à la façon dont les éléments sautent dans un tas.",
                 explanation="Le tri par tas déplace les éléments à travers le tableau via le tas, ce qui peut inverser des éléments égaux. Le tri fusion, le tri par insertion et Timsort sont stables.")),
    dict(kind="mcq", difficulty="medium", topic="graphs", choices=["BFS", "DFS", "Both always find it", "Neither"], answer="A",
         fr_choices=["BFS (parcours en largeur)", "DFS (parcours en profondeur)", "Les deux la trouvent toujours", "Aucun des deux"],
         en=dict(title="Fewest edges", question="On an unweighted graph, which traversal finds a path with the fewest edges from the start node?", hint="Which one explores nodes in order of distance?",
                 explanation="BFS visits all nodes at distance 1, then 2, and so on, so the first time it reaches a node is along a shortest path. DFS can wander down a long path first."),
         fr=dict(title="Le moins d'arêtes", question="Sur un graphe non pondéré, quel parcours trouve un chemin avec le moins d'arêtes depuis le départ ?", hint="Lequel explore les nœuds par ordre de distance ?",
                 explanation="Le BFS visite tous les nœuds à distance 1, puis 2, etc. : la première fois qu'il atteint un nœud, c'est par un plus court chemin. Le DFS peut d'abord s'enfoncer dans un long chemin.")),
    dict(kind="mcq", difficulty="medium", topic="copying", code="""import copy
a = [[1, 2], [3]]
b = copy.copy(a)
b[0].append(9)
b.append([7])""", choices=["`[[1, 2], [3]]`", "`[[1, 2, 9], [3]]`", "`[[1, 2, 9], [3], [7]]`", "`[[1, 2], [3], [7]]`"], answer="B",
         check="import copy\na = [[1, 2], [3]]\nb = copy.copy(a)\nb[0].append(9)\nb.append([7])\nprint(a)", expect="[[1, 2, 9], [3]]",
         en=dict(title="Shallow copy", question="After this code runs, what is `a`?", hint="copy.copy creates a new outer list, but what about the lists inside?",
                 explanation="A shallow copy makes a new outer list that holds the SAME inner lists. Appending 9 to b[0] changes a[0] too, but appending [7] to b only changes b."),
         fr=dict(title="Copie superficielle", question="Après ce code, que vaut `a` ?", hint="copy.copy crée une nouvelle liste extérieure, mais qu'en est-il des listes intérieures ?",
                 explanation="Une copie superficielle crée une nouvelle liste extérieure qui contient les MÊMES listes intérieures. Ajouter 9 à b[0] modifie aussi a[0], mais ajouter [7] à b ne modifie que b.")),
    dict(kind="mcq", difficulty="medium", topic="recursion", choices=["Python recursion is slow by nature", "It recomputes the same subproblems an exponential number of times", "The integers get too big", "The call stack overflows"], answer="B",
         fr_choices=["La récursivité est lente par nature en Python", "Elle recalcule les mêmes sous-problèmes un nombre exponentiel de fois", "Les entiers deviennent trop grands", "La pile d'appels déborde"],
         en=dict(title="Slow Fibonacci", question="Why is `fib(n) = fib(n-1) + fib(n-2)` (no memo) extremely slow for n = 40?", hint="How many times is fib(30) computed?",
                 explanation="The call tree has about φⁿ ≈ 1.6ⁿ nodes because the same values are recomputed again and again. With memoization it becomes O(n). The recursion depth is only n, so the stack is fine."),
         fr=dict(title="Fibonacci lent", question="Pourquoi `fib(n) = fib(n-1) + fib(n-2)` (sans mémo) est-il extrêmement lent pour n = 40 ?", hint="Combien de fois fib(30) est-il calculé ?",
                 explanation="L'arbre d'appels a environ φⁿ ≈ 1,6ⁿ nœuds car les mêmes valeurs sont recalculées encore et encore. Avec de la mémoïsation, c'est O(n). La profondeur n'est que n, la pile tient.")),

    dict(kind="bug", difficulty="medium", topic="indexing", code="""def is_palindrome(s):
    for i in range(len(s)):
        if s[i] != s[len(s) - i]:
            return False
    return True""", answer="B",
         check='try:\n    is_palindrome("abba")\n    print("ok")\nexcept IndexError:\n    print("IndexError")', expect="IndexError",
         en=dict(title="Mirror, mirror", question="This should check if a string is a palindrome. What is the bug?",
                 choices=["The loop should stop at len(s) // 2", "`s[len(s) - i]` is out of range when i = 0", "It should `return True` inside the loop", "Nothing, it works"],
                 hint="What is s[len(s)]?",
                 explanation="When i = 0 the code reads s[len(s)], which raises IndexError. It must be s[len(s) - 1 - i]. Stopping at len(s) // 2 is only an optimization."),
         fr=dict(title="Miroir, miroir", question="Ce code doit vérifier si une chaîne est un palindrome. Où est le bug ?",
                 choices=["La boucle devrait s'arrêter à len(s) // 2", "`s[len(s) - i]` dépasse quand i = 0", "Il faut `return True` dans la boucle", "Rien, il fonctionne"],
                 hint="Que vaut s[len(s)] ?",
                 explanation="Quand i = 0, le code lit s[len(s)], ce qui lève IndexError. Il faut s[len(s) - 1 - i]. S'arrêter à len(s) // 2 n'est qu'une optimisation.")),
    dict(kind="bug", difficulty="medium", topic="lists", code="""def make_grid(rows, cols):
    return [[0] * cols] * rows

g = make_grid(3, 3)
g[0][0] = 1      # meant to change only the top-left cell""", answer="B",
         check="def make_grid(rows, cols):\n    return [[0] * cols] * rows\ng = make_grid(3, 3)\ng[0][0] = 1\nprint(g)", expect="[[1, 0, 0], [1, 0, 0], [1, 0, 0]]",
         en=dict(title="Clone rows", question="After `g[0][0] = 1`, the first column of every row is 1. Why?",
                 choices=["`[0] * cols` makes the zeros aliases of each other", "`* rows` repeats the SAME inner list, so all rows are one list", "Lists can't be multiplied", "Indexes start at 1"],
                 hint="How many different list objects does g contain?",
                 explanation="`[row] * 3` copies the reference, not the list: the 3 rows are the same object. Integers are immutable, so `[0] * cols` is fine. Use `[[0] * cols for _ in range(rows)]`."),
         fr=dict(title="Lignes clonées", question="Après `g[0][0] = 1`, la première colonne de chaque ligne vaut 1. Pourquoi ?",
                 choices=["`[0] * cols` rend les zéros alias les uns des autres", "`* rows` répète la MÊME liste intérieure : toutes les lignes sont une seule liste", "On ne peut pas multiplier une liste", "Les indices commencent à 1"],
                 hint="Combien d'objets liste différents g contient-il ?",
                 explanation="`[ligne] * 3` copie la référence, pas la liste : les 3 lignes sont le même objet. Les entiers sont immuables, donc `[0] * cols` ne pose pas de problème. Il faut `[[0] * cols for _ in range(rows)]`.")),
    dict(kind="bug", difficulty="medium", topic="binary search", code="""def search(a, target):        # a is sorted
    lo, hi = 0, len(a) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if a[mid] < target:
            lo = mid
        else:
            hi = mid
    return lo if a[lo] == target else -1""", answer="B",
         en=dict(title="Stuck in the middle", question="This binary search sometimes never returns. Why?",
                 choices=["`mid` should use `/`", "`lo = mid` can loop forever (e.g. search([1, 3], 3)); it must be `lo = mid + 1`", "It fails when the list has duplicates", "`hi` should start at len(a)"],
                 hint="Trace search([1, 3], 3): lo = 0, hi = 1, mid = …",
                 explanation="With lo = 0 and hi = 1, mid is 0 and a[0] < 3, so lo = mid = 0 again: no progress, infinite loop. Since a[mid] < target, mid can be excluded: lo = mid + 1."),
         fr=dict(title="Coincé au milieu", question="Cette recherche dichotomique ne se termine parfois jamais. Pourquoi ?",
                 choices=["`mid` devrait utiliser `/`", "`lo = mid` peut boucler à l'infini (ex. search([1, 3], 3)) ; il faut `lo = mid + 1`", "Elle échoue quand la liste a des doublons", "`hi` devrait commencer à len(a)"],
                 hint="Déroule search([1, 3], 3) : lo = 0, hi = 1, mid = …",
                 explanation="Avec lo = 0 et hi = 1, mid vaut 0 et a[0] < 3, donc lo = mid = 0 à nouveau : aucune progression, boucle infinie. Puisque a[mid] < target, on peut exclure mid : lo = mid + 1.")),
    dict(kind="bug", difficulty="medium", topic="dictionaries", code="""groups = {}
for word in ["apple", "avocado", "banana"]:
    groups.get(word[0], []).append(word)
print(groups)    # expected {'a': ['apple', 'avocado'], 'b': ['banana']}""", answer="B",
         check='groups = {}\nfor word in ["apple", "avocado", "banana"]:\n    groups.get(word[0], []).append(word)\nprint(groups)', expect="{}",
         en=dict(title="Lost groups", question="This prints `{}`. Why?",
                 choices=["`word[0]` is not a valid key", "`get` returns a temporary list that is never stored in the dict", "`append` returns None, which erases the list", "Dict keys must be integers"],
                 hint="Does `get` ever put anything into the dict?",
                 explanation="get(key, []) returns the default without inserting it, so each word goes into a throwaway list. Use groups.setdefault(word[0], []).append(word) or a defaultdict(list)."),
         fr=dict(title="Groupes perdus", question="Ce code affiche `{}`. Pourquoi ?",
                 choices=["`word[0]` n'est pas une clé valide", "`get` renvoie une liste temporaire qui n'est jamais rangée dans le dict", "`append` renvoie None, ce qui efface la liste", "Les clés d'un dict doivent être des entiers"],
                 hint="Est-ce que `get` ajoute quelque chose au dict ?",
                 explanation="get(clé, []) renvoie la valeur par défaut sans l'insérer : chaque mot va dans une liste jetable. Il faut groups.setdefault(word[0], []).append(word) ou un defaultdict(list).")),
    dict(kind="bug", difficulty="medium", topic="iteration", code="""def remove_evens(nums):
    for n in nums:
        if n % 2 == 0:
            nums.remove(n)
    return nums

print(remove_evens([2, 4, 6, 7]))""", answer="B",
         check="print(remove_evens([2, 4, 6, 7]))", expect="[4, 7]",
         en=dict(title="Vanishing evens", question="This should print [7]. What actually happens?",
                 choices=["It prints [7]: it works", "It prints [4, 7]: removing while iterating skips items", "It prints [2, 4, 6]", "It raises an error"],
                 hint="What happens to the loop's position when an item is removed?",
                 explanation="Removing shifts the remaining items left, so the loop skips the item right after each removal. Build a new list instead: [n for n in nums if n % 2]."),
         fr=dict(title="Les pairs qui résistent", question="Ce code devrait afficher [7]. Que se passe-t-il vraiment ?",
                 choices=["Il affiche [7] : ça marche", "Il affiche [4, 7] : supprimer pendant le parcours saute des éléments", "Il affiche [2, 4, 6]", "Il lève une erreur"],
                 hint="Que devient la position de la boucle quand on supprime un élément ?",
                 explanation="Supprimer décale les éléments suivants vers la gauche : la boucle saute l'élément juste après chaque suppression. Construis plutôt une nouvelle liste : [n for n in nums if n % 2].")),

    dict(kind="complexity", difficulty="medium", topic="loops", code="""count = 0
for i in range(n):
    for j in range(i, n):
        count += 1""", choices=["O(n)", "O(n log n)", "O(n²)", "O(2ⁿ)"], answer="C",
         en=dict(title="Triangle loops", question="What is the time complexity?", hint="The inner loop runs n, then n-1, then n-2… times.",
                 explanation="n + (n-1) + … + 1 = n(n+1)/2 iterations: O(n²). Halving the work doesn't change the Big-O."),
         fr=dict(title="Boucles en triangle", question="Quelle est la complexité ?", hint="La boucle interne tourne n, puis n-1, puis n-2… fois.",
                 explanation="n + (n-1) + … + 1 = n(n+1)/2 itérations : O(n²). Diviser le travail par deux ne change pas le grand O.")),
    dict(kind="complexity", difficulty="medium", topic="loops", code="""for i in range(n):
    j = 1
    while j < n:
        j *= 2""", choices=["O(n)", "O(n log n)", "O(n²)", "O(log n)"], answer="B",
         en=dict(title="Doubling inside", question="What is the time complexity?", hint="How many times does the inner while run for a single i?",
                 explanation="The inner loop doubles j until n: log₂(n) steps, for each of the n values of i. Total O(n log n)."),
         fr=dict(title="Doublement imbriqué", question="Quelle est la complexité ?", hint="Combien de fois le while interne tourne-t-il pour un seul i ?",
                 explanation="La boucle interne double j jusqu'à n : log₂(n) tours, pour chacune des n valeurs de i. Total O(n log n).")),
    dict(kind="complexity", difficulty="medium", topic="lists", code="""result = []
for x in nums:              # n elements
    if x not in result:     # result is a list
        result.append(x)""", choices=["O(n)", "O(n log n)", "O(n²)", "O(1) per element, so O(n)"], answer="C",
         en=dict(title="Unique, slowly", question="What is the worst-case time complexity?", hint="How long does `x not in some_list` take?",
                 explanation="`in` on a list scans it: up to n checks, for each of the n elements. If all values are distinct that's 1 + 2 + … + n = O(n²). With a set it would be O(n)."),
         fr=dict(title="Unique, lentement", question="Quelle est la complexité dans le pire cas ?", hint="Combien de temps prend `x not in une_liste` ?",
                 explanation="`in` sur une liste la parcourt : jusqu'à n vérifications, pour chacun des n éléments. Si toutes les valeurs sont distinctes, 1 + 2 + … + n = O(n²). Avec un set ce serait O(n).")),
    dict(kind="complexity", difficulty="medium", topic="recursion", code="""def f(n):
    if n <= 1:
        return 1
    return f(n // 2) + f(n // 2)""", choices=["O(log n)", "O(n)", "O(n log n)", "O(2ⁿ)"], answer="B",
         en=dict(title="Two halves", question="What is the time complexity of f(n)?", hint="Count the calls per level of the recursion tree.",
                 explanation="T(n) = 2T(n/2) + O(1). The tree has log n levels and level k has 2ᵏ calls: 1 + 2 + 4 + … + n ≈ 2n calls, so O(n)."),
         fr=dict(title="Deux moitiés", question="Quelle est la complexité de f(n) ?", hint="Compte les appels par niveau de l'arbre de récursion.",
                 explanation="T(n) = 2T(n/2) + O(1). L'arbre a log n niveaux et le niveau k a 2ᵏ appels : 1 + 2 + 4 + … + n ≈ 2n appels, donc O(n).")),

    # =================================================================== HARD
    dict(kind="output", difficulty="hard", topic="closures", code="""def make():
    fs = []
    for i in range(3):
        fs.append(lambda: i)
    return [f() for f in fs]

print(make())""",
         en=dict(title="Late binding", question="What does this code print?", hint="When is `i` looked up: when the lambda is created or when it is called?",
                 explanation="Closures capture the variable, not its value. All three lambdas read `i` after the loop ended, when i = 2. Use `lambda i=i: i` to capture the value."),
         fr=dict(title="Liaison tardive", question="Qu'affiche ce code ?", hint="Quand `i` est-il lu : à la création de la lambda ou à son appel ?",
                 explanation="Les fermetures capturent la variable, pas sa valeur. Les trois lambdas lisent `i` après la fin de la boucle, quand i = 2. `lambda i=i: i` capturerait la valeur.")),
    dict(kind="output", difficulty="hard", topic="mutability", code="""t = ([1], [2])
try:
    t[0] += [3]
except TypeError:
    print("error", end=" ")
print(t)""",
         en=dict(title="Immutable, but…", question="What does this code print?", hint="`x += y` on a list does two things: extend the list, then assign the result back.",
                 explanation="`t[0] += [3]` first extends the list in place (it becomes [1, 3]), then tries `t[0] = …`, which fails because tuples are immutable. So you get the error AND the change."),
         fr=dict(title="Immuable, mais…", question="Qu'affiche ce code ?", hint="`x += y` sur une liste fait deux choses : étendre la liste, puis réaffecter le résultat.",
                 explanation="`t[0] += [3]` étend d'abord la liste sur place (elle devient [1, 3]), puis tente `t[0] = …`, qui échoue car un tuple est immuable. On a donc l'erreur ET la modification.")),
    dict(kind="output", difficulty="hard", topic="exceptions", code="""def f():
    try:
        return "try"
    finally:
        print("finally", end=" ")

def g():
    try:
        return 1
    finally:
        return 2

print(f(), g())""",
         en=dict(title="Finally wins", question="What does this code print?", hint="`finally` always runs before the function actually returns, and arguments are evaluated before print prints.",
                 explanation="Evaluating f() prints \"finally \" before its \"try\" is returned. In g(), the `return 2` in finally replaces the pending `return 1`. Then print shows: try 2."),
         fr=dict(title="Finally a le dernier mot", question="Qu'affiche ce code ?", hint="`finally` s'exécute toujours avant que la fonction ne retourne vraiment, et les arguments sont évalués avant l'affichage.",
                 explanation="L'évaluation de f() affiche « finally » avant que « try » ne soit renvoyé. Dans g(), le `return 2` du finally remplace le `return 1` en attente. Puis print affiche : try 2.")),
    dict(kind="output", difficulty="hard", topic="inheritance", code="""class A:
    def hi(self): return "A"
class B(A):
    def hi(self): return "B" + super().hi()
class C(A):
    def hi(self): return "C" + super().hi()
class D(B, C):
    def hi(self): return "D" + super().hi()

print(D().hi())""",
         en=dict(title="Diamond", question="What does this code print?", hint="super() follows the MRO of the object's class (D), not the parent of the class where it's written.",
                 explanation="D's method resolution order is D, B, C, A. Each super() call goes to the NEXT class in that order, so B's super() reaches C, not A: DBCA."),
         fr=dict(title="Diamant", question="Qu'affiche ce code ?", hint="super() suit le MRO de la classe de l'objet (D), pas le parent de la classe où il est écrit.",
                 explanation="L'ordre de résolution de D est D, B, C, A. Chaque super() passe à la classe SUIVANTE dans cet ordre : le super() de B atteint C, pas A. D'où DBCA.")),
    dict(kind="output", difficulty="hard", topic="classes", code="""class Team:
    members = []
    score = 0
    def add(self, name):
        self.members.append(name)
        self.score += 1

a, b = Team(), Team()
a.add("x"); b.add("y"); a.add("z")
print(Team.members, a.score, b.score, Team.score)""",
         en=dict(title="Class attributes", question="What does this code print?", hint="`self.members.append` mutates the shared class list; `self.score += 1` creates an instance attribute.",
                 explanation="members is one list on the class, shared by everyone. `self.score += 1` reads Team.score (0) the first time, then writes an instance attribute, so a has 2, b has 1, and Team.score stays 0."),
         fr=dict(title="Attributs de classe", question="Qu'affiche ce code ?", hint="`self.members.append` modifie la liste partagée de la classe ; `self.score += 1` crée un attribut d'instance.",
                 explanation="members est une seule liste sur la classe, partagée par tous. `self.score += 1` lit Team.score (0) la première fois puis écrit un attribut d'instance : a a 2, b a 1, et Team.score reste 0.")),
    dict(kind="output", difficulty="hard", topic="generators", code="""def gen():
    total = 0
    while True:
        x = yield total
        if x is None:
            return
        total += x

g = gen()
print(next(g), g.send(5), g.send(10), end=" ")
try:
    g.send(None)
except StopIteration as e:
    print("stop", e.value)""",
         en=dict(title="Send me a value", question="What does this code print?", hint="next() runs to the first yield; send(v) resumes it with x = v.",
                 explanation="next(g) runs to the first yield and gives 0. send(5) sets x = 5, total = 5, yields 5. send(10) → 15. send(None) makes the generator `return` without a value, so StopIteration.value is None."),
         fr=dict(title="Envoie-moi une valeur", question="Qu'affiche ce code ?", hint="next() avance jusqu'au premier yield ; send(v) reprend avec x = v.",
                 explanation="next(g) avance jusqu'au premier yield et donne 0. send(5) met x = 5, total = 5, renvoie 5. send(10) → 15. send(None) fait un `return` sans valeur, donc StopIteration.value vaut None.")),
    dict(kind="output", difficulty="hard", topic="comparisons", code="""x = [1, 2, 3]
print(1 < 2 > 1.5, (1 < 2) > 1.5, x[1:] == x[-2:], x[:] is x)""",
         en=dict(title="Chained", question="What does this code print?", hint="`a < b > c` means `a < b and b > c`. With parentheses, (1 < 2) is a bool, and True == 1.",
                 explanation="1 < 2 > 1.5 is (1 < 2) and (2 > 1.5): True. (1 < 2) > 1.5 is True > 1.5, i.e. 1 > 1.5: False. Both slices are [2, 3]: True. x[:] is a new list: False."),
         fr=dict(title="Enchaînées", question="Qu'affiche ce code ?", hint="`a < b > c` signifie `a < b and b > c`. Avec des parenthèses, (1 < 2) est un booléen, et True == 1.",
                 explanation="1 < 2 > 1.5 vaut (1 < 2) and (2 > 1.5) : True. (1 < 2) > 1.5 vaut True > 1.5, soit 1 > 1.5 : False. Les deux tranches valent [2, 3] : True. x[:] est une nouvelle liste : False.")),

    dict(kind="mcq", difficulty="hard", topic="hashing", code="""class P:
    def __init__(self, x):
        self.x = x
    def __eq__(self, other):
        return self.x == other.x

s = {P(1)}""", choices=["The set contains one P", "`TypeError: unhashable type: 'P'`", "Equal P objects are deduplicated automatically", "It works, but every P gets the same hash"], answer="B",
         fr_choices=["L'ensemble contient un P", "`TypeError: unhashable type: 'P'`", "Les P égaux sont dédupliqués automatiquement", "Ça marche, mais tous les P ont le même hash"],
         check="class P:\n    def __init__(self, x):\n        self.x = x\n    def __eq__(self, other):\n        return self.x == other.x\ntry:\n    s = {P(1)}\n    print('ok')\nexcept TypeError as e:\n    print('TypeError')", expect="TypeError",
         en=dict(title="Equal but unhashable", question="What happens on the last line?", hint="What does Python do to __hash__ when a class defines __eq__?",
                 explanation="Defining __eq__ without __hash__ sets __hash__ to None, because equal objects must have equal hashes. Instances become unhashable and can't go into a set or be dict keys."),
         fr=dict(title="Égaux mais non hachables", question="Que se passe-t-il à la dernière ligne ?", hint="Que fait Python à __hash__ quand une classe définit __eq__ ?",
                 explanation="Définir __eq__ sans __hash__ met __hash__ à None, car des objets égaux doivent avoir le même hash. Les instances deviennent non hachables : impossible de les mettre dans un set ou comme clés de dict.")),
    dict(kind="mcq", difficulty="hard", topic="graphs", choices=["the graph has cycles", "some edge weights are negative", "the graph is undirected", "two paths have the same length"], answer="B",
         fr_choices=["le graphe a des cycles", "certains poids d'arêtes sont négatifs", "le graphe n'est pas orienté", "deux chemins ont la même longueur"],
         en=dict(title="Dijkstra's weakness", question="Dijkstra's algorithm can give a wrong answer when…", hint="Dijkstra finalizes a node the first time it pops it. When can a later path be shorter?",
                 explanation="Dijkstra assumes that once a node is popped with distance d, no later path can be shorter. A negative edge breaks that. Use Bellman-Ford instead. Cycles and ties are fine."),
         fr=dict(title="Le point faible de Dijkstra", question="L'algorithme de Dijkstra peut donner une mauvaise réponse quand…", hint="Dijkstra fige un nœud la première fois qu'il le sort. Quand un chemin trouvé plus tard peut-il être plus court ?",
                 explanation="Dijkstra suppose qu'une fois un nœud sorti avec la distance d, aucun chemin ultérieur ne peut être plus court. Une arête négative casse cette hypothèse : il faut Bellman-Ford. Les cycles et les égalités ne posent pas de problème.")),
    dict(kind="mcq", difficulty="hard", topic="amortized analysis", choices=["Python lists are linked lists", "Capacity grows geometrically, so resizes are rare: amortized O(1) per append", "Python preallocates a million slots", "Appending never copies anything"], answer="B",
         fr_choices=["Les listes Python sont des listes chaînées", "La capacité grandit géométriquement, donc les redimensionnements sont rares : O(1) amorti par ajout", "Python préalloue un million de cases", "Un ajout ne copie jamais rien"],
         en=dict(title="Cheap appends", question="Appending n items one by one to a Python list costs O(n) in total, even though a single append can cost O(n). Why?", hint="How often does the list need to grow, and by how much?",
                 explanation="When full, the list grows its capacity by a constant factor, copying all elements. Copies happen at sizes that grow geometrically, so the total copying is O(n): amortized O(1) per append."),
         fr=dict(title="Ajouts bon marché", question="Ajouter n éléments un par un à une liste Python coûte O(n) au total, alors qu'un seul ajout peut coûter O(n). Pourquoi ?", hint="À quelle fréquence la liste doit-elle grandir, et de combien ?",
                 explanation="Quand elle est pleine, la liste multiplie sa capacité par un facteur constant en copiant tous les éléments. Les copies ont lieu à des tailles qui croissent géométriquement : la copie totale est en O(n), soit O(1) amorti par ajout.")),
    dict(kind="mcq", difficulty="hard", topic="binary search on the answer", choices=["It must run in O(1)", "Once it's True for some v, it stays True for every larger v", "It must be True for exactly one v", "v must be a power of two"], answer="B",
         fr_choices=["Elle doit s'exécuter en O(1)", "Dès qu'elle est vraie pour un v, elle reste vraie pour tout v plus grand", "Elle doit être vraie pour exactement un v", "v doit être une puissance de deux"],
         en=dict(title="Searching the answer", question="You binary-search the smallest speed v such that `can_finish(v)` is True. What property must `can_finish` have?", hint="Binary search needs the answer space to look like F F F F T T T.",
                 explanation="Binary search on the answer needs a monotonic predicate: False for small v, then True from some point on, with no going back. Its own speed only affects the total cost."),
         fr=dict(title="Chercher la réponse", question="Tu cherches par dichotomie la plus petite vitesse v telle que `can_finish(v)` soit vraie. Quelle propriété `can_finish` doit-elle avoir ?", hint="La dichotomie a besoin d'un espace de réponses de la forme F F F F V V V.",
                 explanation="La dichotomie sur la réponse exige un prédicat monotone : faux pour les petits v, puis vrai à partir d'un certain point, sans retour en arrière. Sa vitesse n'affecte que le coût total.")),
    dict(kind="mcq", difficulty="hard", topic="graphs", choices=["the graph is connected", "the graph has no directed cycle", "every node has an incoming edge", "the graph is a tree"], answer="B",
         fr_choices=["le graphe est connexe", "le graphe n'a aucun cycle orienté", "chaque nœud a une arête entrante", "le graphe est un arbre"],
         en=dict(title="Order of tasks", question="A topological order of a directed graph exists if and only if…", hint="If A must come before B and B before A, can you order them?",
                 explanation="A topological order exists exactly when the graph is a DAG (no directed cycle). It doesn't need to be connected or a tree."),
         fr=dict(title="Ordre des tâches", question="Un ordre topologique d'un graphe orienté existe si et seulement si…", hint="Si A doit venir avant B et B avant A, peut-on les ordonner ?",
                 explanation="Un ordre topologique existe exactement quand le graphe est un DAG (aucun cycle orienté). Il n'a pas besoin d'être connexe ni d'être un arbre.")),
    dict(kind="mcq", difficulty="hard", topic="default arguments", code="""import time

def stamp(t=time.time()):
    return t""", choices=["two different times", "the same time twice: the default was computed once, when `def` ran", "an error", "`None`"], answer="B",
         fr_choices=["deux heures différentes", "deux fois la même heure : la valeur par défaut a été calculée une seule fois, au moment du `def`", "une erreur", "`None`"],
         check="import time\ndef stamp(t=time.time()):\n    return t\na = stamp(); time.sleep(0.01); b = stamp()\nprint(a == b)", expect="True",
         en=dict(title="Frozen time", question="Calling `stamp()` twice, one second apart, returns…", hint="When is `time.time()` in the signature evaluated?",
                 explanation="Default values are evaluated once, at function definition time. Use `t=None` and `if t is None: t = time.time()` to get a fresh value."),
         fr=dict(title="Temps figé", question="Appeler `stamp()` deux fois, à une seconde d'intervalle, renvoie…", hint="Quand `time.time()` dans la signature est-il évalué ?",
                 explanation="Les valeurs par défaut sont évaluées une seule fois, à la définition. Il faut `t=None` puis `if t is None: t = time.time()` pour une valeur fraîche.")),

    dict(kind="bug", difficulty="hard", topic="memoization", code="""memo = {}

def paths(r, c, blocked):
    # ways to go from (0,0) to (r,c) moving down/right, avoiding blocked cells
    if r < 0 or c < 0 or (r, c) in blocked:
        return 0
    if r == 0 and c == 0:
        return 1
    if (r, c) in memo:
        return memo[(r, c)]
    memo[(r, c)] = paths(r - 1, c, blocked) + paths(r, c - 1, blocked)
    return memo[(r, c)]

print(paths(2, 2, set()), paths(2, 2, {(1, 1)}))   # expected 6 2""", answer="B",
         check="print(paths(2, 2, set()), paths(2, 2, {(1, 1)}))", expect="6 6",
         en=dict(title="Memory leak of truth", question="This prints `6 6` instead of `6 2`. What is the bug?",
                 choices=["The base case should return 0", "The memo is shared between calls and its key ignores `blocked`, so the second call reuses wrong results", "The recursion goes out of bounds", "Sets can't contain tuples"],
                 hint="What does the memo contain when the second call starts?",
                 explanation="The cache key must include everything the result depends on. memo outlives the first call and its key (r, c) ignores `blocked`, so the second call returns cached results from the first grid."),
         fr=dict(title="Mémoire trompeuse", question="Ce code affiche `6 6` au lieu de `6 2`. Où est le bug ?",
                 choices=["Le cas de base devrait renvoyer 0", "Le memo est partagé entre les appels et sa clé ignore `blocked`, donc le second appel réutilise de mauvais résultats", "La récursion sort de la grille", "Un set ne peut pas contenir de tuples"],
                 hint="Que contient le memo quand le second appel commence ?",
                 explanation="La clé du cache doit inclure tout ce dont le résultat dépend. memo survit au premier appel et sa clé (r, c) ignore `blocked` : le second appel renvoie les résultats de la première grille.")),
    dict(kind="bug", difficulty="hard", topic="BFS", code="""from collections import deque

def shortest(grid, start, goal):
    q = deque([(start, 0)])
    seen = set()
    while q:
        (r, c), d = q.popleft()
        if (r, c) == goal:
            return d
        seen.add((r, c))
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if (0 <= nr < len(grid) and 0 <= nc < len(grid[0])
                    and grid[nr][nc] == "." and (nr, nc) not in seen):
                q.append(((nr, nc), d + 1))
    return -1""", answer="B",
         en=dict(title="Crowded queue", question="The distances it returns are correct, but on a big open grid it never finishes. Why?",
                 choices=["It returns wrong distances on open grids", "Cells are marked as seen only when popped, so the same cell is queued again and again", "A deque is slower than a list", "BFS can't work on grids; it needs DFS"],
                 hint="How many times can the cell (2, 2) be appended before it's popped?",
                 explanation="A cell can be appended by several neighbours before it's popped, and each copy appends its neighbours again: the queue grows with the number of paths, which explodes. Mark cells as seen when you append them."),
         fr=dict(title="File bondée", question="Les distances renvoyées sont justes, mais sur une grande grille ouverte il ne termine jamais. Pourquoi ?",
                 choices=["Il renvoie de mauvaises distances sur les grilles ouvertes", "Les cases ne sont marquées vues qu'au moment où on les sort, donc la même case est ajoutée encore et encore", "Un deque est plus lent qu'une liste", "Le BFS ne marche pas sur une grille, il faut un DFS"],
                 hint="Combien de fois la case (2, 2) peut-elle être ajoutée avant d'être sortie ?",
                 explanation="Une case peut être ajoutée par plusieurs voisins avant d'être sortie, et chaque copie ajoute à nouveau ses voisins : la file grandit avec le nombre de chemins, qui explose. Il faut marquer les cases au moment de les ajouter.")),
    dict(kind="bug", difficulty="hard", topic="sliding window", code="""def longest_unique(s):
    seen = {}
    best = start = 0
    for i, ch in enumerate(s):
        if ch in seen:
            start = seen[ch] + 1
        seen[ch] = i
        best = max(best, i - start + 1)
    return best

print(longest_unique("abba"))   # expected 2""", answer="B",
         check='print(longest_unique("abba"))', expect="3",
         en=dict(title="Window going backwards", question="This prints 3 instead of 2. What is the bug?",
                 choices=["`best` should start at 1", "`start` can jump backwards; it must be `start = max(start, seen[ch] + 1)`", "A dict can't store indexes", "`enumerate` starts at 1"],
                 hint="Trace \"abba\": what is `start` when the last 'a' arrives?",
                 explanation="At the second 'b', start becomes 2. At the last 'a', seen['a'] is 0, so start jumps BACK to 1 and the window \"bba\" (with a repeat) is counted. The left edge must never move left."),
         fr=dict(title="La fenêtre recule", question="Ce code affiche 3 au lieu de 2. Où est le bug ?",
                 choices=["`best` devrait commencer à 1", "`start` peut reculer ; il faut `start = max(start, seen[ch] + 1)`", "Un dict ne peut pas stocker d'indices", "`enumerate` commence à 1"],
                 hint="Déroule \"abba\" : que vaut `start` quand arrive le dernier 'a' ?",
                 explanation="Au deuxième 'b', start passe à 2. Au dernier 'a', seen['a'] vaut 0, donc start RECULE à 1 et la fenêtre \"bba\" (avec un doublon) est comptée. Le bord gauche ne doit jamais reculer.")),
    dict(kind="bug", difficulty="hard", topic="union-find", code="""parent = list(range(5))

def find(x):
    while parent[x] != x:
        x = parent[x]
    return x

def union(a, b):
    parent[a] = b

union(0, 1); union(1, 2); union(0, 3)
print(find(2) == find(3))   # expected True: 0, 1, 2, 3 are connected""", answer="B",
         check="print(find(2) == find(3))", expect="False",
         en=dict(title="Broken links", question="This prints False. What is the bug?",
                 choices=["`find` can loop forever", "`union` links `a` itself instead of `a`'s root, which can cut an existing connection", "`parent` should start at 0 for everyone", "Union-find needs path compression to be correct"],
                 hint="What was parent[0] before `union(0, 3)`?",
                 explanation="union(0, 3) overwrites parent[0] (which was 1), detaching 0 from {1, 2}. Always link the roots: parent[find(a)] = find(b). Path compression only makes it faster."),
         fr=dict(title="Liens cassés", question="Ce code affiche False. Où est le bug ?",
                 choices=["`find` peut boucler à l'infini", "`union` relie `a` lui-même au lieu de sa racine, ce qui peut couper un lien existant", "`parent` devrait commencer à 0 pour tous", "L'union-find a besoin de la compression de chemin pour être correct"],
                 hint="Que valait parent[0] avant `union(0, 3)` ?",
                 explanation="union(0, 3) écrase parent[0] (qui valait 1) et détache 0 de {1, 2}. Il faut toujours relier les racines : parent[find(a)] = find(b). La compression de chemin ne sert qu'à accélérer.")),
    dict(kind="bug", difficulty="hard", topic="hashing", code="""def two_sum(nums, target):
    index = {x: i for i, x in enumerate(nums)}
    for i, x in enumerate(nums):
        j = index.get(target - x)
        if j is not None:
            return i, j
    return None

print(two_sum([3, 2, 4], 6))   # expected (1, 2)""", answer="B",
         check="print(two_sum([3, 2, 4], 6))", expect="(0, 0)",
         en=dict(title="Two of a kind", question="This prints (0, 0). What is the bug?",
                 choices=["The dict comprehension keeps only the first index of duplicates", "It can pair an element with itself; it must check `j != i`", "It must sort the list first", "`get` returns 0 when the key is missing"],
                 hint="3 + 3 = 6. How many 3s are in the list?",
                 explanation="For x = 3 it looks up 6 - 3 = 3 and finds index 0: the same element. Skip j == i (and note that the comprehension keeps the LAST index of duplicates, which is what makes [3, 3] work)."),
         fr=dict(title="La paire", question="Ce code affiche (0, 0). Où est le bug ?",
                 choices=["La compréhension ne garde que le premier indice des doublons", "Il peut associer un élément à lui-même ; il faut vérifier `j != i`", "Il faut d'abord trier la liste", "`get` renvoie 0 quand la clé manque"],
                 hint="3 + 3 = 6. Combien de 3 y a-t-il dans la liste ?",
                 explanation="Pour x = 3, il cherche 6 - 3 = 3 et trouve l'indice 0 : le même élément. Il faut ignorer j == i (la compréhension garde le DERNIER indice des doublons, ce qui fait marcher [3, 3]).")),

    dict(kind="complexity", difficulty="hard", topic="harmonic series", code="""count = 0
for i in range(1, n + 1):
    for j in range(i, n + 1, i):
        count += 1""", choices=["O(n)", "O(n log n)", "O(n√n)", "O(n²)"], answer="B",
         en=dict(title="Multiples", question="What is the time complexity?", hint="For a given i the inner loop runs n / i times.",
                 explanation="Total iterations: n/1 + n/2 + n/3 + … + n/n = n·(1 + 1/2 + … + 1/n) ≈ n·ln n. This harmonic sum appears in sieves: O(n log n)."),
         fr=dict(title="Multiples", question="Quelle est la complexité ?", hint="Pour un i donné, la boucle interne tourne n / i fois.",
                 explanation="Total : n/1 + n/2 + n/3 + … + n/n = n·(1 + 1/2 + … + 1/n) ≈ n·ln n. Cette série harmonique apparaît dans les cribles : O(n log n).")),
    dict(kind="complexity", difficulty="hard", topic="recurrences", code="""def f(n):
    if n <= 1:
        return 0
    s = 0
    for i in range(n):
        s += i
    return s + f(n // 2)""", choices=["O(log n)", "O(n)", "O(n log n)", "O(n²)"], answer="B",
         en=dict(title="Shrinking work", question="What is the time complexity of f(n)?", hint="Add up the loop sizes: n + n/2 + n/4 + …",
                 explanation="T(n) = T(n/2) + O(n). The work is n + n/2 + n/4 + … ≤ 2n, a geometric series, so O(n), not O(n log n)."),
         fr=dict(title="Travail qui fond", question="Quelle est la complexité de f(n) ?", hint="Additionne les tailles des boucles : n + n/2 + n/4 + …",
                 explanation="T(n) = T(n/2) + O(n). Le travail vaut n + n/2 + n/4 + … ≤ 2n, une série géométrique : O(n), et non O(n log n).")),
    dict(kind="complexity", difficulty="hard", topic="memoization", code="""from functools import lru_cache

@lru_cache(None)
def ways(n):
    if n < 0:
        return 0
    if n == 0:
        return 1
    return ways(n - 1) + ways(n - 2) + ways(n - 3)""", choices=["O(3ⁿ)", "O(n)", "O(n³)", "O(n log n)"], answer="B",
         en=dict(title="Cached branches", question="What is the time complexity of the first call ways(n)? (count arithmetic as O(1))", hint="How many different arguments can ways be called with?",
                 explanation="Each distinct n is computed once and then served from the cache. There are about n distinct arguments, each doing O(1) work: O(n). Without the cache it would be about O(1.84ⁿ)."),
         fr=dict(title="Branches en cache", question="Quelle est la complexité du premier appel ways(n) ? (on compte l'arithmétique en O(1))", hint="Avec combien d'arguments différents ways peut-elle être appelée ?",
                 explanation="Chaque n distinct est calculé une fois puis servi par le cache. Il y a environ n arguments distincts, chacun en O(1) : O(n). Sans le cache, ce serait environ O(1,84ⁿ).")),
    dict(kind="complexity", difficulty="hard", topic="two pointers", code="""i = 0
for j in range(n):
    while i < j and a[i] + a[j] > limit:
        i += 1""", choices=["O(n)", "O(n log n)", "O(n²)", "O(n²) only if a is sorted"], answer="A",
         en=dict(title="Two pointers", question="What is the time complexity?", hint="How many times can `i += 1` run in total, over the whole loop?",
                 explanation="i only moves forward and never exceeds n, so the while loop runs at most n times IN TOTAL across all j. Amortized: O(n)."),
         fr=dict(title="Deux pointeurs", question="Quelle est la complexité ?", hint="Combien de fois `i += 1` peut-il s'exécuter au total, sur toute la boucle ?",
                 explanation="i ne fait qu'avancer et ne dépasse jamais n : le while tourne au plus n fois AU TOTAL, tous j confondus. En amorti : O(n).")),
    dict(kind="complexity", difficulty="hard", topic="lists", code="""q = list(range(n))
while q:
    x = q.pop(0)""", choices=["O(n)", "O(n log n)", "O(n²)", "O(1) amortized per pop, so O(n)"], answer="C",
         en=dict(title="Front of the line", question="What is the time complexity?", hint="What does Python have to do with the other elements when the first one is removed?",
                 explanation="pop(0) shifts every remaining element one place left: O(k) for a list of k elements. n + (n-1) + … + 1 = O(n²). collections.deque.popleft() is O(1)."),
         fr=dict(title="Tête de file", question="Quelle est la complexité ?", hint="Que doit faire Python des autres éléments quand on retire le premier ?",
                 explanation="pop(0) décale tous les éléments restants d'une case : O(k) pour une liste de k éléments. n + (n-1) + … + 1 = O(n²). collections.deque.popleft() est en O(1).")),
]
