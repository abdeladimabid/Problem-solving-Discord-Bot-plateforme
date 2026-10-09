"""Quick challenges in PHP 8, English + French.

Same format as bank_quick.py. Code is PHP WITHOUT the opening `<?php` tag (it
is added when running). For "output" the answer is computed by really running
the code with php. "check" is PHP run right after "code"; the last line it
prints must equal "expect" (it proves the claim behind the question).
"""

QUICK_PHP = [
    # =================================================================== EASY
    dict(kind="output", difficulty="easy", topic="comparison", code="""var_dump(0 == "a", "1" == "01", "10" == "1e1", 100 == "1e2", null == false, "abc" === "ABC");""",
         en=dict(title="Loose comparison", question="What does this code print? (write the 6 values, e.g. `bool(true) bool(false) …`)",
                 hint="In PHP 8, a number and a non-numeric string are compared as strings. Two numeric strings are compared as numbers.",
                 explanation="PHP 8: 0 == \"a\" compares \"0\" with \"a\": false. \"1\" and \"01\" are numeric strings, compared as numbers: true. \"10\" == \"1e1\": both numeric (10): true. 100 == \"1e2\": true. null == false: true. === is case-sensitive: false."),
         fr=dict(title="Comparaison souple", question="Qu'affiche ce code ? (écris les 6 valeurs, ex. `bool(true) bool(false) …`)",
                 hint="En PHP 8, un nombre et une chaîne non numérique se comparent comme des chaînes. Deux chaînes numériques se comparent comme des nombres.",
                 explanation="PHP 8 : 0 == \"a\" compare \"0\" et \"a\" : false. \"1\" et \"01\" sont numériques, comparées comme nombres : true. \"10\" == \"1e1\" : toutes deux valent 10 : true. 100 == \"1e2\" : true. null == false : true. === respecte la casse : false.")),
    dict(kind="output", difficulty="easy", topic="arrays", code="""$a = [5 => "x", "y"];
$a[] = "z";
$a["2"] = "w";
$a[] = "v";
echo count($a), " ", implode(",", array_keys($a));""",
         en=dict(title="Who gets which key?", question="What does this code print?",
                 hint="`[]` appends with key = (largest integer key so far) + 1. Numeric string keys like \"2\" become integers.",
                 explanation="\"x\" has key 5, so \"y\" gets 6 and \"z\" gets 7. \"2\" is converted to the integer key 2. The last append uses max key + 1 = 8. 5 elements, keys 5,6,7,2,8 in insertion order."),
         fr=dict(title="Qui reçoit quelle clé ?", question="Qu'affiche ce code ?",
                 hint="`[]` ajoute avec la clé = (plus grande clé entière) + 1. Les clés chaînes numériques comme \"2\" deviennent des entiers.",
                 explanation="\"x\" a la clé 5, donc \"y\" reçoit 6 et \"z\" 7. \"2\" devient la clé entière 2. Le dernier ajout prend max + 1 = 8. 5 éléments, clés 5,6,7,2,8 dans l'ordre d'insertion.")),
    dict(kind="output", difficulty="easy", topic="strings", code="""$s = "Hello";
$t = $s . " " . strtoupper(substr($s, -3)) . strlen($s) + 1;""" + """
echo $t;""",
         en=dict(title="Precedence trap", question="What does this code print?",
                 hint="In PHP 8, `+` binds tighter than `.`.",
                 explanation="PHP 8 evaluates `strlen($s) + 1` first (6), then concatenates: \"Hello\" . \" \" . \"LLO\" . 6. (In PHP 7 the concatenation happened first, which is why this changed.)"),
         fr=dict(title="Piège de priorité", question="Qu'affiche ce code ?",
                 hint="En PHP 8, `+` est prioritaire sur `.`.",
                 explanation="PHP 8 calcule d'abord `strlen($s) + 1` (6), puis concatène : \"Hello\" . \" \" . \"LLO\" . 6. (En PHP 7 la concaténation passait d'abord, d'où ce changement.)")),
    dict(kind="output", difficulty="easy", topic="numbers", code="""echo 7 / 2, " ", intdiv(7, 2), " ", -7 % 3, " ", 7 <=> 3, " ", round(2.5), " ", (int) "12abc";""",
         en=dict(title="Divide and compare", question="What does this code print?",
                 hint="`/` always gives a float when the result isn't whole. `%` keeps the sign of the left operand. round() rounds halves away from zero.",
                 explanation="7 / 2 = 3.5; intdiv truncates: 3; -7 % 3 = -1 (sign of the dividend); 7 <=> 3 = 1; round(2.5) = 3; (int)\"12abc\" reads the leading digits: 12."),
         fr=dict(title="Diviser et comparer", question="Qu'affiche ce code ?",
                 hint="`/` donne un flottant quand le résultat n'est pas entier. `%` garde le signe de l'opérande de gauche. round() arrondit les moitiés en s'éloignant de zéro.",
                 explanation="7 / 2 = 3.5 ; intdiv tronque : 3 ; -7 % 3 = -1 (signe du dividende) ; 7 <=> 3 = 1 ; round(2.5) = 3 ; (int)\"12abc\" lit les chiffres du début : 12.")),

    dict(kind="mcq", difficulty="easy", topic="isset / empty", answer="C",
         choices=['`isset($x)` is `true` when `$x = null`', '`empty("0")` is `false`', '`isset($a["k"])` is `false` when `$a["k"] = null`, but `array_key_exists("k", $a)` is `true`', '`empty([])` throws an error'],
         check='$x = null; $a = ["k" => null]; echo json_encode([isset($x), empty("0"), isset($a["k"]), array_key_exists("k", $a), empty([])]), "\\n";', expect="[false,true,false,true,true]",
         en=dict(title="Is it set?", question="Which statement is true?",
                 hint="isset() checks \"exists AND is not null\". empty() treats \"0\" as empty.",
                 explanation="isset returns false for null values, even if the key exists; array_key_exists only checks the key. empty(\"0\") is true (a famous trap) and empty([]) is true, not an error."),
         fr=dict(title="Défini ou pas ?", question="Quelle affirmation est vraie ?",
                 hint="isset() vérifie « existe ET n'est pas null ». empty() considère \"0\" comme vide.",
                 explanation="isset renvoie false pour une valeur null, même si la clé existe ; array_key_exists ne regarde que la clé. empty(\"0\") vaut true (un piège célèbre) et empty([]) vaut true, sans erreur."),
         fr_choices=['`isset($x)` vaut `true` quand `$x = null`', '`empty("0")` vaut `false`', '`isset($a["k"])` vaut `false` quand `$a["k"] = null`, mais `array_key_exists("k", $a)` vaut `true`', '`empty([])` lève une erreur']),
    dict(kind="mcq", difficulty="easy", topic="arrays", answer="B",
         choices=["Arrays are passed by reference, like objects", "Arrays are passed by value (copied when modified); objects are passed as handles to the same object", "Both arrays and objects are deep-copied", "Neither can be modified inside a function"],
         check='function f($arr, $obj) { $arr[] = 4; $obj->n = 9; } $a = [1, 2, 3]; $o = new stdClass; $o->n = 1; f($a, $o); echo count($a), " ", $o->n, "\n";', expect="3 9",
         en=dict(title="Passing to a function", question="What happens when you pass an array and an object to a function that modifies them?",
                 hint="Try `function f($a) { $a[] = 1; }` and look at the original array.",
                 explanation="Arrays have value semantics (copy-on-write): the function changes its own copy. Objects are handles: the function changes the same object. To modify the caller's array, use `&$arr`."),
         fr=dict(title="Passer à une fonction", question="Que se passe-t-il quand on passe un tableau et un objet à une fonction qui les modifie ?",
                 hint="Essaie `function f($a) { $a[] = 1; }` et regarde le tableau d'origine.",
                 explanation="Les tableaux se comportent comme des valeurs (copie à l'écriture) : la fonction modifie sa propre copie. Les objets sont des poignées : la fonction modifie le même objet. Pour modifier le tableau de l'appelant, utilise `&$arr`."),
         fr_choices=["Les tableaux sont passés par référence, comme les objets", "Les tableaux sont passés par valeur (copiés s'ils sont modifiés) ; les objets sont des poignées vers le même objet", "Tableaux et objets sont copiés en profondeur", "Aucun des deux ne peut être modifié dans une fonction"]),

    dict(kind="complexity", difficulty="easy", topic="arrays", answer="D", code="""function commonCount(array $a, array $b): int {
    $set = array_flip($b);          // values of $b become keys
    $count = 0;
    foreach ($a as $x) {
        if (isset($set[$x])) $count++;
    }
    return $count;
}""",
         choices=["O(n·m)", "O(n²)", "O(n log m)", "O(n + m)"],
         en=dict(title="Flip it", question="With n = count($a) and m = count($b), what is the time complexity?",
                 hint="What does array_flip cost? And a key lookup with isset?",
                 explanation="array_flip goes through $b once: O(m). Each isset on an array key is a hash lookup, O(1) on average, done n times: O(n). Total O(n + m). With in_array instead of isset it would be O(n·m)."),
         fr=dict(title="Retourne-le", question="Avec n = count($a) et m = count($b), quelle est la complexité ?",
                 hint="Combien coûte array_flip ? Et une recherche de clé avec isset ?",
                 explanation="array_flip parcourt $b une fois : O(m). Chaque isset sur une clé est une recherche par hachage, O(1) en moyenne, faite n fois : O(n). Total O(n + m). Avec in_array au lieu de isset, ce serait O(n·m).")),
    dict(kind="complexity", difficulty="easy", topic="loops", answer="A", code="""function powers(int $n): int {
    $steps = 0;
    for ($i = 1; $i < $n; $i *= 3) {
        $steps++;
    }
    return $steps;
}""",
         choices=["O(log n)", "O(n)", "O(n / 3)", "O(√n)"],
         en=dict(title="Times three", question="What is the time complexity of `powers($n)`?",
                 hint="i takes the values 1, 3, 9, 27… How many before reaching n?",
                 explanation="i is multiplied by 3 at each step, so it reaches n after about log₃ n steps: O(log n). O(n / 3) would be a loop where i += 3."),
         fr=dict(title="Fois trois", question="Quelle est la complexité de `powers($n)` ?",
                 hint="i prend les valeurs 1, 3, 9, 27… Combien avant d'atteindre n ?",
                 explanation="i est multiplié par 3 à chaque tour, il atteint n après environ log₃ n tours : O(log n). O(n / 3) correspondrait à i += 3.")),

    dict(kind="bug", difficulty="easy", topic="strings", answer="B", code="""function startsWithHttp(string $url): bool {
    if (strpos($url, "http")) {
        return true;
    }
    return false;
}
var_dump(startsWithHttp("http://example.com"));""",
         check='', expect="bool(false)",
         en=dict(title="Found at zero", question="`startsWithHttp(\"http://example.com\")` returns false. Why?",
                 choices=["strpos is case-insensitive", "strpos returns 0 (the position) when the text is at the start, and 0 is falsy: compare with `!== false`, or use `str_starts_with`", "strpos needs the arguments in the other order", "The function must return `int`"],
                 hint="What does strpos return when it finds the text at the very beginning?",
                 explanation="strpos returns the position of the match. At the start, that's 0, which `if` treats as false. Use `strpos($url, \"http\") === 0` or, in PHP 8, `str_starts_with($url, \"http\")`."),
         fr=dict(title="Trouvé en zéro", question="`startsWithHttp(\"http://example.com\")` renvoie false. Pourquoi ?",
                 choices=["strpos ignore la casse", "strpos renvoie 0 (la position) quand le texte est au début, et 0 est faux : compare avec `!== false`, ou utilise `str_starts_with`", "strpos attend les arguments dans l'autre ordre", "La fonction doit renvoyer un `int`"],
                 hint="Que renvoie strpos quand il trouve le texte tout au début ?",
                 explanation="strpos renvoie la position trouvée. Au début, c'est 0, que `if` considère comme faux. Utilise `strpos($url, \"http\") === 0` ou, en PHP 8, `str_starts_with($url, \"http\")`.")),
    dict(kind="bug", difficulty="easy", topic="sorting", answer="A", code="""$scores = [12, 5, 30];
$sorted = sort($scores);
echo $sorted[0];""",
         check='$s = [12, 5, 30]; $r = sort($s); var_dump($r); echo $s[0], "\n";', expect="5",
         en=dict(title="Sorted… what?", question="This code should print 5 but prints nothing (and a warning). Why?",
                 choices=["`sort()` sorts the array in place and returns `true`, not the sorted array", "`sort()` sorts in descending order", "`$sorted[0]` is the last element", "`sort()` only works on strings"],
                 hint="Read the return type of sort() in the PHP manual.",
                 explanation="sort() modifies $scores itself (passed by reference) and returns a boolean. $sorted is true, and true[0] is null. Use `sort($scores); echo $scores[0];`."),
         fr=dict(title="Trié… quoi ?", question="Ce code devrait afficher 5 mais n'affiche rien (et un avertissement). Pourquoi ?",
                 choices=["`sort()` trie le tableau sur place et renvoie `true`, pas le tableau trié", "`sort()` trie par ordre décroissant", "`$sorted[0]` est le dernier élément", "`sort()` ne marche que sur des chaînes"],
                 hint="Lis le type de retour de sort() dans le manuel PHP.",
                 explanation="sort() modifie $scores lui-même (passé par référence) et renvoie un booléen. $sorted vaut true, et true[0] vaut null. Écris `sort($scores); echo $scores[0];`.")),

    # ================================================================= MEDIUM
    dict(kind="output", difficulty="medium", topic="references", code="""$arr = [1, 2, 3];
foreach ($arr as &$v) {
    $v *= 2;
}
foreach ($arr as $v) {
}
echo implode(",", $arr);""",
         en=dict(title="Dangling reference", question="What does this code print?",
                 hint="After the first loop, `$v` is still a reference to the last element. What does the second loop write into `$v`?",
                 explanation="After loop 1, $arr is [2,4,6] and $v still points to $arr[2]. Loop 2 assigns each element to $v, i.e. to $arr[2]: 2, then 4, then $arr[2] itself (4). Result 2,4,4. Always `unset($v)` after a by-reference foreach."),
         fr=dict(title="Référence pendante", question="Qu'affiche ce code ?",
                 hint="Après la première boucle, `$v` est toujours une référence vers le dernier élément. Qu'écrit la deuxième boucle dans `$v` ?",
                 explanation="Après la boucle 1, $arr vaut [2,4,6] et $v pointe encore vers $arr[2]. La boucle 2 affecte chaque élément à $v, donc à $arr[2] : 2, puis 4, puis $arr[2] lui-même (4). Résultat 2,4,4. Fais toujours `unset($v)` après un foreach par référence.")),
    dict(kind="output", difficulty="medium", topic="arrays", code="""$a = [1 => "a", 2 => "b"];
$b = [2 => "c", 3 => "d"];
$plus = $a + $b;
$merged = array_merge($a, $b);
echo implode("", $plus), " ", implode(",", array_keys($merged)), " ", count(array_unique([1, "1", 1.0, true]));""",
         en=dict(title="+ versus array_merge", question="What does this code print?",
                 hint="`+` keeps the left value when a key exists in both. array_merge renumbers integer keys. array_unique compares values as strings.",
                 explanation="$a + $b keeps a, b and only adds key 3 (d): \"abd\". array_merge renumbers integer keys from 0: 0,1,2,3. array_unique compares (string) values: 1, \"1\", 1.0 and true all become \"1\": 1 element left."),
         fr=dict(title="+ ou array_merge", question="Qu'affiche ce code ?",
                 hint="`+` garde la valeur de gauche si la clé existe des deux côtés. array_merge renumérote les clés entières. array_unique compare les valeurs comme des chaînes.",
                 explanation="$a + $b garde a, b et n'ajoute que la clé 3 (d) : \"abd\". array_merge renumérote les clés entières depuis 0 : 0,1,2,3. array_unique compare les valeurs en chaîne : 1, \"1\", 1.0 et true deviennent tous \"1\" : il reste 1 élément.")),
    dict(kind="output", difficulty="medium", topic="closures", code="""$total = 10;
$byValue = function ($x) use ($total) { return $x + $total; };
$byRef = function ($x) use (&$total) { $total += $x; return $total; };
$arrow = fn($x) => $x * $total;
$total = 100;
echo $byValue(1), " ", $byRef(5), " ", $arrow(2), " ", $total;""",
         en=dict(title="use, &use and fn", question="What does this code print?",
                 hint="`use ($x)` copies the value when the closure is CREATED. `fn` captures by value too, at creation.",
                 explanation="$byValue captured 10: 1 + 10 = 11. $byRef shares $total (now 100): 105, and $total becomes 105. The arrow function captured 10 when it was created: 2 × 10 = 20. Finally $total is 105."),
         fr=dict(title="use, &use et fn", question="Qu'affiche ce code ?",
                 hint="`use ($x)` copie la valeur à la CRÉATION de la closure. `fn` capture aussi par valeur, à la création.",
                 explanation="$byValue a capturé 10 : 1 + 10 = 11. $byRef partage $total (qui vaut 100) : 105, et $total devient 105. La fonction fléchée a capturé 10 à sa création : 2 × 10 = 20. Enfin $total vaut 105.")),
    dict(kind="output", difficulty="medium", topic="static", code="""function visit() {
    static $count = 0;
    $count++;
    return $count;
}
class Counter {
    public static int $made = 0;
    public function __construct() { self::$made++; }
}
visit(); visit();
new Counter(); new Counter(); $c = new Counter();
echo visit(), " ", Counter::$made, " ", $c::$made;""",
         en=dict(title="Static memory", question="What does this code print?",
                 hint="A `static` variable inside a function keeps its value between calls. A static property belongs to the class, not to each object.",
                 explanation="visit() was called twice, so the third call returns 3. Three objects were created, each incrementing the class-wide counter: 3, the same value seen through $c::$made."),
         fr=dict(title="Mémoire statique", question="Qu'affiche ce code ?",
                 hint="Une variable `static` dans une fonction garde sa valeur entre les appels. Une propriété statique appartient à la classe, pas à chaque objet.",
                 explanation="visit() a été appelée deux fois, le troisième appel renvoie donc 3. Trois objets ont été créés, chacun incrémente le compteur de la classe : 3, la même valeur vue par $c::$made.")),

    dict(kind="mcq", difficulty="medium", topic="match", answer="D",
         choices=["`match` compares with `==`, like `switch`", "`match` falls through to the next arm without `break`", "`match` returns `null` when no arm matches", "`match` compares with `===` and throws an `UnhandledMatchError` when no arm matches"],
         check='$r = []; $v = "1"; switch ($v) { case 1: $r[] = "switch-hit"; break; } try { $r[] = match($v) { 1 => "int", "1" => "str" }; } catch (Throwable $e) { $r[] = get_class($e); } try { match(5) { 1 => "a" }; } catch (Throwable $e) { $r[] = get_class($e); } echo implode(" ", $r), "\n";', expect="switch-hit str UnhandledMatchError",
         en=dict(title="switch vs match", question="Which statement about PHP 8's `match` is true?",
                 hint="`switch (\"1\") { case 1: … }` matches. Does `match` behave the same?",
                 explanation="match uses strict comparison (===), never falls through, is an expression that returns a value, and throws UnhandledMatchError when nothing matches. switch uses loose ==."),
         fr=dict(title="switch ou match", question="Quelle affirmation sur le `match` de PHP 8 est vraie ?",
                 hint="`switch (\"1\") { case 1: … }` correspond. `match` se comporte-t-il pareil ?",
                 explanation="match compare strictement (===), n'enchaîne jamais sur la branche suivante, est une expression qui renvoie une valeur et lève UnhandledMatchError si rien ne correspond. switch utilise la comparaison souple ==."),
         fr_choices=["`match` compare avec `==`, comme `switch`", "`match` enchaîne sur la branche suivante sans `break`", "`match` renvoie `null` si aucune branche ne correspond", "`match` compare avec `===` et lève une `UnhandledMatchError` si aucune branche ne correspond"]),
    dict(kind="mcq", difficulty="medium", topic="security", answer="A",
         choices=["Use prepared statements with bound parameters (PDO `prepare` + `execute`)", "Escape quotes with `addslashes()`", "Use `htmlspecialchars()` on the input", "Check that the input is not empty"],
         en=dict(title="SQL injection", question="`$pdo->query(\"SELECT * FROM users WHERE name = '$name'\")` is vulnerable to SQL injection. What is the right fix?",
                 hint="The problem is mixing data and SQL code in one string.",
                 explanation="Prepared statements send the SQL and the data separately, so the data can never be read as SQL. addslashes misses cases (encodings, numeric contexts), htmlspecialchars is for HTML output, not SQL."),
         fr=dict(title="Injection SQL", question="`$pdo->query(\"SELECT * FROM users WHERE name = '$name'\")` est vulnérable à l'injection SQL. Quelle est la bonne correction ?",
                 hint="Le problème est de mélanger données et code SQL dans une même chaîne.",
                 explanation="Les requêtes préparées envoient le SQL et les données séparément : les données ne peuvent jamais être lues comme du SQL. addslashes oublie des cas (encodages, contextes numériques), htmlspecialchars sert à l'affichage HTML, pas au SQL."),
         fr_choices=["Utiliser des requêtes préparées avec paramètres liés (PDO `prepare` + `execute`)", "Échapper les apostrophes avec `addslashes()`", "Appliquer `htmlspecialchars()` à l'entrée", "Vérifier que l'entrée n'est pas vide"]),

    dict(kind="complexity", difficulty="medium", topic="arrays", answer="C", code="""function dedupe(array $items): array {
    $out = [];
    foreach ($items as $x) {
        if (!in_array($x, $out, true)) {
            $out[] = $x;
        }
    }
    return $out;
}""",
         choices=["O(n)", "O(n log n)", "O(n²)", "O(2ⁿ)"],
         en=dict(title="in_array in a loop", question="Worst case (all values different), with n = count($items), what is the complexity?",
                 hint="in_array scans the whole array it searches.",
                 explanation="When every value is new, $out grows to n and each in_array scans it: 0 + 1 + … + (n-1) ≈ n²/2: O(n²). Using the values as keys (`isset($seen[$x])`) makes it O(n)."),
         fr=dict(title="in_array dans une boucle", question="Dans le pire cas (toutes les valeurs différentes), avec n = count($items), quelle est la complexité ?",
                 hint="in_array parcourt tout le tableau où il cherche.",
                 explanation="Si chaque valeur est nouvelle, $out atteint n éléments et chaque in_array le parcourt : 0 + 1 + … + (n-1) ≈ n²/2 : O(n²). Utiliser les valeurs comme clés (`isset($seen[$x])`) donne O(n).")),
    dict(kind="complexity", difficulty="medium", topic="strings", answer="B", code="""function reverseWords(string $s): string {
    // s has n characters
    $words = explode(" ", $s);
    $result = "";
    for ($i = count($words) - 1; $i >= 0; $i--) {
        $result = $result . $words[$i] . " ";
    }
    return rtrim($result);
}""",
         choices=["O(n²) because of the string concatenation", "O(n): PHP appends to $result in place, so each word is copied once", "O(n log n)", "O(1)"],
         en=dict(title="Concatenation cost", question="What is the time complexity of `reverseWords`, with n = strlen($s)?",
                 hint="`$result = $result . $x` where $result is not shared with anything else.",
                 explanation="explode is O(n). PHP strings are reference-counted: when `$result . $x` is assigned back to $result and nothing else shares it, PHP extends the buffer in place (amortized), so the total work is O(n). In languages with immutable strings and no such optimization, this pattern would be O(n²)."),
         fr=dict(title="Coût de la concaténation", question="Quelle est la complexité de `reverseWords`, avec n = strlen($s) ?",
                 hint="`$result = $result . $x` où $result n'est partagé avec rien d'autre.",
                 explanation="explode est en O(n). Les chaînes PHP ont un compteur de références : quand `$result . $x` est réaffecté à $result non partagé, PHP agrandit le tampon sur place (amorti), donc le travail total est O(n). Dans un langage aux chaînes immuables sans cette optimisation, ce motif serait O(n²)."),
         fr_choices=["O(n²) à cause de la concaténation", "O(n) : PHP ajoute à $result sur place, chaque mot est copié une fois", "O(n log n)", "O(1)"]),

    dict(kind="bug", difficulty="medium", topic="sorting", answer="D", code="""$people = [["name" => "Ana", "age" => 30], ["name" => "Bo", "age" => 25], ["name" => "Cy", "age" => 35]];
usort($people, function ($a, $b) {
    return $a["age"] > $b["age"];
});
echo implode(",", array_column($people, "name"));""",
         check='$p = [3, 1, 2]; $r = @usort($p, fn($a, $b) => $a > $b); echo implode(",", $p), "\n";', expect="1,2,3",
         en=dict(title="Comparator contract", question="This sorts by age today, but PHP 8 shows a deprecation warning and it may break. What is wrong?",
                 choices=["usort sorts in descending order", "array_column can't read nested arrays", "The callback must be `static`", "The comparator returns a bool; it must return a negative, zero or positive integer: use `$a[\"age\"] <=> $b[\"age\"]`"],
                 hint="What should a comparison function return when $a < $b?",
                 explanation="usort expects an int < 0, 0 or > 0. A boolean can't say \"less than\" (false means equal), which PHP 8 deprecates and some algorithms mis-sort. The spaceship operator <=> returns exactly -1, 0 or 1."),
         fr=dict(title="Contrat du comparateur", question="Ce tri marche aujourd'hui, mais PHP 8 affiche un avertissement de dépréciation et il peut casser. Qu'est-ce qui ne va pas ?",
                 choices=["usort trie par ordre décroissant", "array_column ne sait pas lire des tableaux imbriqués", "La fonction de rappel doit être `static`", "Le comparateur renvoie un booléen ; il doit renvoyer un entier négatif, nul ou positif : utilise `$a[\"age\"] <=> $b[\"age\"]`"],
                 hint="Que doit renvoyer une fonction de comparaison quand $a < $b ?",
                 explanation="usort attend un entier < 0, 0 ou > 0. Un booléen ne peut pas dire « plus petit » (false veut dire égal), ce que PHP 8 déprécie et que certains algorithmes trient mal. L'opérateur <=> renvoie exactement -1, 0 ou 1.")),
    dict(kind="bug", difficulty="medium", topic="input", answer="C", code="""// input: "3\\n10 20 30\\n"
$n = fgets(STDIN);
$nums = explode(" ", fgets(STDIN));
$last = $nums[$n - 1];
echo $last === "30" ? "ok" : "not ok";""",
         check='$n = "3\n"; $nums = explode(" ", "10 20 30\n"); $last = $nums[$n - 1]; echo strlen($last), "\\n";', expect="3",
         en=dict(title="Reading input", question="With the input `3` then `10 20 30`, this prints \"not ok\". Why?",
                 choices=["fgets reads the whole input at once", "`$n - 1` fails because $n is a string", "fgets keeps the end-of-line `\\n`, so the last piece is \"30\\n\", not \"30\": use `trim()`", "explode needs a regex"],
                 hint="What exactly does fgets return for the line `10 20 30`?",
                 explanation="fgets returns the line WITH its newline, so the last word is \"30\\n\". (\"3\\n\" - 1 still works because PHP reads the leading number.) Use `trim(fgets(STDIN))` before exploding, and `intval` for numbers."),
         fr=dict(title="Lire l'entrée", question="Avec l'entrée `3` puis `10 20 30`, ceci affiche « not ok ». Pourquoi ?",
                 choices=["fgets lit toute l'entrée d'un coup", "`$n - 1` échoue car $n est une chaîne", "fgets garde le saut de ligne `\\n`, donc le dernier morceau est \"30\\n\", pas \"30\" : utilise `trim()`", "explode a besoin d'une regex"],
                 hint="Que renvoie exactement fgets pour la ligne `10 20 30` ?",
                 explanation="fgets renvoie la ligne AVEC son saut de ligne, donc le dernier mot est \"30\\n\". (\"3\\n\" - 1 fonctionne quand même, PHP lit le nombre du début.) Utilise `trim(fgets(STDIN))` avant explode, et `intval` pour les nombres.")),

    # =================================================================== HARD
    dict(kind="output", difficulty="hard", topic="copy-on-write", code="""$a = ["x" => [1, 2]];
$ref = &$a["x"];
$b = $a;
$b["x"][] = 3;
$c = $a;
unset($ref);
$c["x"][] = 4;
echo count($a["x"]), count($b["x"]), count($c["x"]);""",
         en=dict(title="References inside arrays", question="What does this code print?",
                 hint="When an array element is a reference, copying the array copies the reference, not the value.",
                 explanation="$a[\"x\"] became a reference when $ref = &$a[\"x\"] was taken. Copying an array copies that reference, not the value, so $b and $c share the same slot as $a. unset($ref) only removes the name $ref; the slot is still a reference shared by the three arrays. Every push lands in the same list [1, 2, 3, 4], so all three counts are 4. Avoid references inside arrays, or unset them before copying."),
         fr=dict(title="Références dans les tableaux", question="Qu'affiche ce code ?",
                 hint="Quand un élément de tableau est une référence, copier le tableau copie la référence, pas la valeur.",
                 explanation="$a[\"x\"] est devenu une référence quand $ref = &$a[\"x\"] a été pris. Copier un tableau copie cette référence, pas la valeur : $b et $c partagent la même case que $a. unset($ref) ne retire que le nom $ref ; la case reste une référence partagée par les trois tableaux. Chaque ajout va dans la même liste [1, 2, 3, 4], donc les trois comptes valent 4. Évite les références dans les tableaux, ou supprime-les avant de copier.")),
    dict(kind="output", difficulty="hard", topic="strings", code="""$s = "Az";
$s++;
$t = "a9";
$t++;
$z = "Zz";
$z++;
echo $s, " ", $t, " ", $z, " ", "abc"[-1], " ", str_repeat("ab", 3)[4];""",
         en=dict(title="Incrementing strings", question="What does this code print?",
                 hint="`++` on a letter string works like an odometer: z rolls over to a and carries to the left.",
                 explanation="\"Az\"++: z → a with a carry, A → B: \"Ba\". \"a9\"++: 9 → 0 carry, a → b: \"b0\". \"Zz\"++: both roll over and a new letter is added on the left: \"AAa\". \"abc\"[-1] is \"c\". \"ababab\"[4] is \"a\"."),
         fr=dict(title="Incrémenter des chaînes", question="Qu'affiche ce code ?",
                 hint="`++` sur une chaîne de lettres fonctionne comme un compteur kilométrique : z repasse à a avec une retenue vers la gauche.",
                 explanation="\"Az\"++ : z → a avec retenue, A → B : \"Ba\". \"a9\"++ : 9 → 0 retenue, a → b : \"b0\". \"Zz\"++ : les deux repassent et une lettre est ajoutée à gauche : \"AAa\". \"abc\"[-1] vaut \"c\". \"ababab\"[4] vaut \"a\".")),
    dict(kind="output", difficulty="hard", topic="generators", code="""function gen() {
    $x = yield 1;
    echo "[got $x]";
    $y = yield 2;
    echo "[got $y]";
    return $x + $y;
}
$g = gen();
echo $g->current();
echo $g->send(10);
echo $g->send(5);
echo "|", $g->getReturn();""",
         en=dict(title="send() to a generator", question="What does this code print?",
                 hint="current() runs until the first yield. send(v) resumes the generator with v as the result of the paused yield, then runs to the next yield.",
                 explanation="current() prints 1. send(10): $x = 10, it echoes [got 10] and stops at yield 2, which send returns: 2. send(5): $y = 5, echoes [got 5], reaches return: send returns null (prints nothing). getReturn() is 15."),
         fr=dict(title="send() à un générateur", question="Qu'affiche ce code ?",
                 hint="current() s'exécute jusqu'au premier yield. send(v) relance le générateur avec v comme résultat du yield en pause, puis va jusqu'au yield suivant.",
                 explanation="current() affiche 1. send(10) : $x = 10, affiche [got 10] et s'arrête au yield 2, que send renvoie : 2. send(5) : $y = 5, affiche [got 5], atteint le return : send renvoie null (rien). getReturn() vaut 15.")),
    dict(kind="output", difficulty="hard", topic="numbers", code="""$big = PHP_INT_MAX;
var_dump($big + 1 == $big + 2, is_float($big + 1), 0.1 + 0.7 == 0.8, (int) ((0.1 + 0.7) * 10), intdiv(PHP_INT_MIN, -1 + 2));""",
         en=dict(title="Beyond integers", question="What does this code print? (5 values)",
                 hint="Integers overflow into floats. 0.1 + 0.7 is not exactly 0.8 in binary.",
                 explanation="PHP_INT_MAX + 1 becomes a float, and floats near 9.2e18 can't tell +1 from +2: true, and it is a float: true. 0.1 + 0.7 is 0.7999999999999999: false, and × 10 then truncated gives 7. intdiv(PHP_INT_MIN, 1) is PHP_INT_MIN."),
         fr=dict(title="Au-delà des entiers", question="Qu'affiche ce code ? (5 valeurs)",
                 hint="Les entiers débordent en flottants. 0.1 + 0.7 ne vaut pas exactement 0.8 en binaire.",
                 explanation="PHP_INT_MAX + 1 devient un flottant, et vers 9.2e18 les flottants ne distinguent pas +1 de +2 : true, et c'est un float : true. 0.1 + 0.7 vaut 0.7999999999999999 : false, et × 10 puis tronqué donne 7. intdiv(PHP_INT_MIN, 1) vaut PHP_INT_MIN.")),

    dict(kind="mcq", difficulty="hard", topic="OOP", answer="B",
         choices=["`static::` and `self::` always refer to the same class", "`self::` refers to the class where the method is written; `static::` refers to the class that was actually called (late static binding)", "`static::` can only be used for static properties", "`parent::` refers to the object's own class"],
         check='class A { public static function create() { return [get_class(new self()), get_class(new static())]; } } class B extends A {} echo implode(" ", B::create()), "\n";', expect="A B",
         en=dict(title="self or static?", question="In a method of class A called as `B::create()` (B extends A), which statement is true?",
                 hint="Think about factory methods like `return new static();` in a parent class.",
                 explanation="self:: is resolved where the code is written (A). static:: is resolved at runtime to the called class (B): that's late static binding, which lets a parent factory create instances of the child class."),
         fr=dict(title="self ou static ?", question="Dans une méthode de la classe A appelée par `B::create()` (B extends A), quelle affirmation est vraie ?",
                 hint="Pense aux méthodes fabriques comme `return new static();` dans une classe parente.",
                 explanation="self:: est résolu là où le code est écrit (A). static:: est résolu à l'exécution vers la classe appelée (B) : c'est la liaison statique tardive, qui permet à une fabrique du parent de créer des instances de la classe enfant."),
         fr_choices=["`static::` et `self::` désignent toujours la même classe", "`self::` désigne la classe où la méthode est écrite ; `static::` la classe réellement appelée (liaison statique tardive)", "`static::` ne sert qu'aux propriétés statiques", "`parent::` désigne la classe de l'objet lui-même"]),
    dict(kind="mcq", difficulty="hard", topic="sessions & security", answer="D",
         choices=["Store the password in `$_SESSION` to avoid asking again", "Compare `md5($password)` with the stored hash", "Hash with `sha1` and a fixed salt for all users", "Store `password_hash($password, PASSWORD_DEFAULT)` and check with `password_verify`, then call `session_regenerate_id(true)` after login"],
         check='$h = password_hash("s3cret", PASSWORD_DEFAULT); var_dump(password_verify("s3cret", $h) && !password_verify("S3cret", $h) && $h !== password_hash("s3cret", PASSWORD_DEFAULT));', expect="bool(true)",
         en=dict(title="Login done right", question="Which is the correct way to store and check user passwords in PHP?",
                 hint="Fast hashes (md5, sha1) are easy to brute-force. Sessions can be hijacked if the id doesn't change after login.",
                 explanation="password_hash uses a slow algorithm (bcrypt/argon2) with a random salt per password; password_verify checks it in constant time. Regenerating the session id after login prevents session fixation. md5/sha1 are far too fast, and a password must never be stored in the session."),
         fr=dict(title="Connexion bien faite", question="Quelle est la bonne façon de stocker et vérifier les mots de passe en PHP ?",
                 hint="Les hachages rapides (md5, sha1) se cassent facilement par force brute. Une session peut être volée si l'identifiant ne change pas après la connexion.",
                 explanation="password_hash utilise un algorithme lent (bcrypt/argon2) avec un sel aléatoire par mot de passe ; password_verify le vérifie en temps constant. Régénérer l'identifiant de session après la connexion empêche la fixation de session. md5/sha1 sont bien trop rapides, et un mot de passe ne doit jamais être mis en session."),
         fr_choices=["Mettre le mot de passe dans `$_SESSION` pour ne plus le redemander", "Comparer `md5($password)` au hachage stocké", "Hacher avec `sha1` et un sel fixe pour tous", "Stocker `password_hash($password, PASSWORD_DEFAULT)`, vérifier avec `password_verify`, puis appeler `session_regenerate_id(true)` après la connexion"]),

    dict(kind="complexity", difficulty="hard", topic="arrays", answer="A", code="""function process(array $queue): int {
    // $queue has n integers
    $sum = 0;
    while (count($queue) > 0) {
        $x = array_shift($queue);     // take the first element
        $sum += $x;
    }
    return $sum;
}""",
         choices=["O(n²): array_shift re-indexes the whole array every time", "O(n): count() and array_shift are O(1)", "O(n log n)", "O(1)"],
         en=dict(title="Shifting cost", question="What is the time complexity of `process`?",
                 hint="After array_shift, the first element has key 0 again. What did PHP have to do to the others?",
                 explanation="array_shift removes the first element and renumbers every remaining integer key, which is O(n) each time: n + (n-1) + … = O(n²). count() is O(1). Use an index pointer, array_reverse + array_pop, or SplQueue for O(n)."),
         fr=dict(title="Le coût du décalage", question="Quelle est la complexité de `process` ?",
                 hint="Après array_shift, le premier élément a de nouveau la clé 0. Qu'a dû faire PHP aux autres ?",
                 explanation="array_shift retire le premier élément et renumérote toutes les clés entières restantes, en O(n) à chaque fois : n + (n-1) + … = O(n²). count() est en O(1). Utilise un indice, array_reverse + array_pop, ou SplQueue pour O(n)."),
         fr_choices=["O(n²) : array_shift réindexe tout le tableau à chaque fois", "O(n) : count() et array_shift sont en O(1)", "O(n log n)", "O(1)"]),
    dict(kind="complexity", difficulty="hard", topic="recursion", answer="C", code="""function paths(int $r, int $c, array &$memo = []): int {
    // number of paths in a grid, moving right or down
    if ($r === 0 || $c === 0) return 1;
    $key = "$r,$c";
    if (isset($memo[$key])) return $memo[$key];
    return $memo[$key] = paths($r - 1, $c, $memo) + paths($r, $c - 1, $memo);
}""",
         choices=["O(2^(r+c))", "O(r + c)", "O(r·c)", "O((r+c)²)"],
         en=dict(title="Memoized grid", question="What is the time complexity of `paths($r, $c)` (first call, empty memo)?",
                 hint="How many different (r, c) pairs can be stored in $memo? What does each cost?",
                 explanation="Each state (i, j) with 0 ≤ i ≤ r and 0 ≤ j ≤ c is computed once, with O(1) work besides the two calls: O(r·c). Without the memo (or without `&`, which would copy the array) it would explode to about 2^(r+c)."),
         fr=dict(title="Grille mémoïsée", question="Quelle est la complexité de `paths($r, $c)` (premier appel, memo vide) ?",
                 hint="Combien de paires (r, c) différentes peuvent être stockées dans $memo ? Combien coûte chacune ?",
                 explanation="Chaque état (i, j) avec 0 ≤ i ≤ r et 0 ≤ j ≤ c est calculé une fois, avec un travail O(1) en plus des deux appels : O(r·c). Sans memo (ou sans `&`, qui copierait le tableau), on exploserait vers 2^(r+c).")),

    dict(kind="bug", difficulty="hard", topic="recursion", answer="B", code="""function fib(int $n, array $memo = []): int {
    if ($n <= 1) return $n;
    if (isset($memo[$n])) return $memo[$n];
    $memo[$n] = fib($n - 1, $memo) + fib($n - 2, $memo);
    return $memo[$n];
}
echo fib(30);""",
         check='$calls = 0; function fib2(int $n, array $memo = []) { global $calls; $calls++; if ($n <= 1) return $n; if (isset($memo[$n])) return $memo[$n]; $memo[$n] = fib2($n - 1, $memo) + fib2($n - 2, $memo); return $memo[$n]; } fib2(20); echo $calls > 10000 ? "exponential" : "fast", "\n";', expect="exponential",
         en=dict(title="Memo that forgets", question="`fib(30)` gives the right answer but takes millions of calls. Why doesn't the memo help?",
                 choices=["isset() doesn't work with integer keys", "Arrays are passed by value: each call fills its own copy of $memo and the results never reach the caller, so the recursion stays exponential. Use `array &$memo` or a static array", "The return type should be `float`", "The base case must be `$n === 0`"],
                 hint="When fib($n - 1, $memo) writes into $memo, does the caller's $memo change?",
                 explanation="Without &, PHP copies the array for each call (copy-on-write), so values computed in fib(n-1) are lost before fib(n-2) runs. The memo never hits and the complexity stays O(φⁿ). Pass it by reference (`array &$memo = []`) or use `static $memo = []`."),
         fr=dict(title="Le memo qui oublie", question="`fib(30)` donne le bon résultat mais fait des millions d'appels. Pourquoi le memo n'aide-t-il pas ?",
                 choices=["isset() ne marche pas avec des clés entières", "Les tableaux sont passés par valeur : chaque appel remplit sa propre copie de $memo et les résultats ne remontent jamais, la récursion reste exponentielle. Utilise `array &$memo` ou un tableau static", "Le type de retour devrait être `float`", "Le cas de base doit être `$n === 0`"],
                 hint="Quand fib($n - 1, $memo) écrit dans $memo, le $memo de l'appelant change-t-il ?",
                 explanation="Sans &, PHP copie le tableau à chaque appel (copie à l'écriture) : les valeurs calculées dans fib(n-1) sont perdues avant fib(n-2). Le memo ne sert jamais et la complexité reste O(φⁿ). Passe-le par référence (`array &$memo = []`) ou utilise `static $memo = []`.")),
    dict(kind="bug", difficulty="hard", topic="dates", answer="C", code="""$start = new DateTime("2026-01-31");
$due = $start;
$due->modify("+1 month");
echo $start->format("Y-m-d"), " ", $due->format("Y-m-d");""",
         check='', expect="2026-03-03 2026-03-03",
         en=dict(title="Due date", question="The teacher wanted the start date to stay 2026-01-31 and the due date one month later. It prints `2026-03-03 2026-03-03`. What are the TWO problems?",
                 choices=["DateTime can't parse ISO dates, and modify() needs seconds", "format() changes the date, and \"+1 month\" means 30 days", "`$due = $start` copies the object handle, so both variables are the same object; and \"+1 month\" on Jan 31 overflows Feb 31 to March 3. Use `DateTimeImmutable` (or clone) and \"last day of next month\" when needed", "Months start at 0 in PHP"],
                 hint="Objects are handles. And what is February 31?",
                 explanation="Assigning an object doesn't copy it: modifying $due modifies $start. \"+1 month\" adds one to the month (Feb 31), which overflows into March 3 (2026 isn't a leap year). DateTimeImmutable::modify returns a new object, and \"last day of next month\" avoids the overflow."),
         fr=dict(title="Date d'échéance", question="L'enseignant voulait garder le début au 2026-01-31 et l'échéance un mois plus tard. Ça affiche `2026-03-03 2026-03-03`. Quels sont les DEUX problèmes ?",
                 choices=["DateTime ne lit pas les dates ISO, et modify() veut des secondes", "format() modifie la date, et « +1 month » veut dire 30 jours", "`$due = $start` copie la poignée de l'objet : les deux variables sont le même objet ; et « +1 month » le 31 janvier déborde du 31 février au 3 mars. Utilise `DateTimeImmutable` (ou clone) et « last day of next month » si besoin", "Les mois commencent à 0 en PHP"],
                 hint="Les objets sont des poignées. Et qu'est-ce que le 31 février ?",
                 explanation="Affecter un objet ne le copie pas : modifier $due modifie $start. « +1 month » ajoute un au mois (31 février), qui déborde au 3 mars (2026 n'est pas bissextile). DateTimeImmutable::modify renvoie un nouvel objet, et « last day of next month » évite le débordement.")),
    dict(kind="bug", difficulty="hard", topic="security", answer="A", code="""// page.php?file=report.txt
$file = $_GET["file"];
echo file_get_contents(__DIR__ . "/uploads/" . $file);""",
         en=dict(title="Read a file", question="What is the serious problem with this code?",
                 choices=["Path traversal: `?file=../../config.php` reads any file on the server. Use `basename()` and a whitelist, and check the resolved `realpath` stays inside uploads/", "file_get_contents can't read .txt files", "`__DIR__` is the root of the server", "$_GET values are always integers"],
                 hint="What if the user sends `../` in the parameter?",
                 explanation="The user controls part of the path, so `../` escapes the uploads folder (database passwords, source code…). Keep only the file name (basename), check it against the list of allowed files, and verify that realpath() is still inside the uploads directory."),
         fr=dict(title="Lire un fichier", question="Quel est le problème grave de ce code ?",
                 choices=["Traversée de chemin : `?file=../../config.php` lit n'importe quel fichier du serveur. Utilise `basename()` et une liste blanche, et vérifie que le `realpath` reste dans uploads/", "file_get_contents ne lit pas les .txt", "`__DIR__` est la racine du serveur", "Les valeurs de $_GET sont toujours des entiers"],
                 hint="Et si l'utilisateur envoie `../` dans le paramètre ?",
                 explanation="L'utilisateur contrôle une partie du chemin : `../` sort du dossier uploads (mots de passe de la base, code source…). Ne garde que le nom du fichier (basename), compare-le à la liste des fichiers autorisés, et vérifie que realpath() reste dans le dossier uploads.")),
]
