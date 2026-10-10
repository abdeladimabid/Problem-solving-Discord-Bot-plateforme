// Built-in lessons for /path, written for beginners: a short, plain introduction (with an
// everyday comparison), one tiny example in the class's own programming language(s),
// one tip, and links to good free resources to read more (in English or French).
// Teachers can replace any lesson in the dashboard (Path & lessons), or have the AI write one.

type Code = "python" | "javascript" | "php" | "java" | "c" | "cpp";
type Text = { title: string; intro: string; tip: string };
type Link = [label: string, url: string];
export interface Lesson {
  en: Text;
  fr: Text;
  code?: Partial<Record<Code, string>>;
  /** Skills that aren't about one programming language (SQL, Git, web). */
  shared?: { fence: string; code: string };
  /** Where to read more in each language's tutorial (see langLink). */
  docs?: Partial<Record<Code, string>>;
  /** Language-neutral resources (visual explanations, interactive courses). */
  more?: { en: Link[]; fr: Link[] };
}

const FENCE: Record<Code, string> = { python: "py", javascript: "js", php: "php", java: "java", c: "c", cpp: "cpp" };
const LABEL: Record<Code, string> = { python: "Python", javascript: "JavaScript", php: "PHP", java: "Java", c: "C", cpp: "C++" };
const ORDER: Code[] = ["javascript", "php", "python", "java", "c", "cpp"];

/** The tutorial page for a language: javascript.info, php.net and docs.python.org exist in French too. */
function langLink(code: Code, path: string, fr: boolean): Link {
  if (/^https?:\/\//.test(path)) return [new URL(path).hostname.replace(/^(www|en)\./, ""), path];
  if (code === "javascript") return ["javascript.info", `https://${fr ? "fr." : ""}javascript.info/${path}`];
  if (code === "php") return ["php.net", `https://www.php.net/manual/${fr ? "fr" : "en"}/${path}`];
  if (code === "python") return ["docs.python.org", `https://docs.python.org/${fr ? "fr/" : ""}3/${path}`];
  return ["W3Schools", `https://www.w3schools.com/${code}/${path}`];
}

export const LESSONS: Record<string, Lesson> = {
  basics: {
    en: { title: "Variables & conditions", intro: "A **variable** is a labelled box that keeps a value (a number, a word…) so you can use it later. A **condition** (`if … else`) lets your program make a choice: *if it's raining, take an umbrella, else take sunglasses*.", tip: "To **compare** two values use `==` (or `===` in JavaScript and PHP). A single `=` puts a value in a box." },
    fr: { title: "Variables et conditions", intro: "Une **variable** est une boîte avec une étiquette qui garde une valeur (un nombre, un mot…) pour s'en servir plus tard. Une **condition** (`if … else`) permet au programme de faire un choix : *s'il pleut, prends un parapluie, sinon prends des lunettes de soleil*.", tip: "Pour **comparer** deux valeurs, utilise `==` (ou `===` en JavaScript et PHP). Un seul `=` range une valeur dans une boîte." },
    code: {
      python: 'age = 17\nif age >= 18:\n    print("adult")\nelse:\n    print("minor")      # prints: minor',
      javascript: 'let age = 17;\nif (age >= 18) {\n  console.log("adult");\n} else {\n  console.log("minor");   // prints: minor\n}',
      php: '$age = 17;\nif ($age >= 18) {\n    echo "adult";\n} else {\n    echo "minor";       // prints: minor\n}',
      java: 'int age = 17;\nif (age >= 18) {\n    System.out.println("adult");\n} else {\n    System.out.println("minor");   // prints: minor\n}',
      c: 'int age = 17;\nif (age >= 18) {\n    printf("adult\\n");\n} else {\n    printf("minor\\n");    /* prints: minor */\n}',
      cpp: 'int age = 17;\nif (age >= 18) {\n    cout << "adult\\n";\n} else {\n    cout << "minor\\n";    // prints: minor\n}',
    },
    docs: { javascript: "ifelse", php: "control-structures.if.php", python: "tutorial/controlflow.html#if-statements", java: "java_conditions.asp", c: "c_conditions.php", cpp: "cpp_conditions.asp" },
  },
  loops: {
    en: { title: "Loops", intro: "A **loop** repeats the same instructions several times, so you don't have to copy-paste them. Like a teacher calling every name on the list, one after the other. `for` is used when you know how many times; `while` repeats *as long as* something is true.", tip: "Check the first and the last turn by hand: does it start at 0 or 1? Does it stop at `<` or `<=`?" },
    fr: { title: "Boucles", intro: "Une **boucle** répète les mêmes instructions plusieurs fois, pour ne pas les copier-coller. Comme un professeur qui appelle tous les noms de la liste, l'un après l'autre. `for` sert quand on sait combien de fois ; `while` répète *tant que* quelque chose est vrai.", tip: "Vérifie le premier et le dernier tour à la main : on commence à 0 ou à 1 ? On s'arrête avec `<` ou `<=` ?" },
    code: {
      python: "for i in range(1, 6):     # 1, 2, 3, 4, 5\n    print(i)",
      javascript: "for (let i = 1; i <= 5; i++) {   // 1, 2, 3, 4, 5\n  console.log(i);\n}",
      php: "for ($i = 1; $i <= 5; $i++) {    // 1, 2, 3, 4, 5\n    echo $i, \"\\n\";\n}",
      java: "for (int i = 1; i <= 5; i++) {    // 1, 2, 3, 4, 5\n    System.out.println(i);\n}",
      c: "for (int i = 1; i <= 5; i++) {    /* 1, 2, 3, 4, 5 */\n    printf(\"%d\\n\", i);\n}",
      cpp: "for (int i = 1; i <= 5; i++) {    // 1, 2, 3, 4, 5\n    cout << i << \"\\n\";\n}",
    },
    docs: { javascript: "while-for", php: "control-structures.for.php", python: "tutorial/controlflow.html#for-statements", java: "java_for_loop.asp", c: "c_for_loop.php", cpp: "cpp_for_loop.asp" },
  },
  strings: {
    en: { title: "Strings", intro: "A **string** is text: a row of characters, like beads on a necklace. Each character has a position number called an **index**, and the first one is at index **0**. You can read one character, cut a piece, or glue two strings together.", tip: "Upper-case and lower-case letters are different: `\"A\"` is not `\"a\"`." },
    fr: { title: "Chaînes de caractères", intro: "Une **chaîne** est du texte : une suite de caractères, comme des perles sur un collier. Chaque caractère a un numéro de position appelé **indice**, et le premier est à l'indice **0**. On peut lire un caractère, couper un morceau, ou coller deux chaînes ensemble.", tip: "Majuscules et minuscules sont différentes : `\"A\"` n'est pas `\"a\"`." },
    code: {
      python: 'name = "Lina"\nprint(name[0])          # L   (first character)\nprint(len(name))        # 4   (length)\nprint("Hi " + name)     # Hi Lina',
      javascript: 'const name = "Lina";\nconsole.log(name[0]);        // L   (first character)\nconsole.log(name.length);    // 4   (length)\nconsole.log("Hi " + name);   // Hi Lina',
      php: '$name = "Lina";\necho $name[0];          // L   (first character)\necho strlen($name);     // 4   (length)\necho "Hi " . $name;     // Hi Lina',
      java: 'String name = "Lina";\nSystem.out.println(name.charAt(0));   // L   (first character)\nSystem.out.println(name.length());    // 4   (length)\nSystem.out.println("Hi " + name);     // Hi Lina',
      c: 'char name[] = "Lina";\nprintf("%c\\n", name[0]);        /* L   (first character) */\nprintf("%zu\\n", strlen(name));  /* 4   (length) */\nprintf("Hi %s\\n", name);        /* Hi Lina */',
      cpp: 'string name = "Lina";\ncout << name[0] << "\\n";        // L   (first character)\ncout << name.size() << "\\n";    // 4   (length)\ncout << "Hi " + name << "\\n";   // Hi Lina',
    },
    docs: { javascript: "string", php: "language.types.string.php", python: "tutorial/introduction.html#text", java: "java_strings.asp", c: "c_strings.php", cpp: "cpp_strings.asp" },
  },
  arrays: {
    en: { title: "Arrays & lists", intro: "An **array** (or **list**) keeps many values in order under one name, like a row of numbered lockers. You reach a value with its index (starting at **0**), add new values at the end, and loop over all of them.", tip: "The last index is *length − 1*. Asking for index *length* is a classic error." },
    fr: { title: "Tableaux et listes", intro: "Un **tableau** (ou **liste**) garde plusieurs valeurs dans l'ordre sous un seul nom, comme une rangée de casiers numérotés. On atteint une valeur par son indice (qui commence à **0**), on ajoute à la fin, et on parcourt toutes les valeurs avec une boucle.", tip: "Le dernier indice est *taille − 1*. Demander l'indice *taille* est une erreur classique." },
    code: {
      python: "marks = [12, 15, 9]\nmarks.append(18)        # [12, 15, 9, 18]\nprint(marks[0])         # 12\nfor m in marks:\n    print(m)",
      javascript: "const marks = [12, 15, 9];\nmarks.push(18);                 // [12, 15, 9, 18]\nconsole.log(marks[0]);          // 12\nfor (const m of marks) console.log(m);",
      php: "$marks = [12, 15, 9];\n$marks[] = 18;                  // [12, 15, 9, 18]\necho $marks[0];                 // 12\nforeach ($marks as $m) echo $m, \"\\n\";",
      java: "ArrayList<Integer> marks = new ArrayList<>(List.of(12, 15, 9));\nmarks.add(18);                       // [12, 15, 9, 18]\nSystem.out.println(marks.get(0));    // 12\nfor (int m : marks) System.out.println(m);",
      c: "int marks[10] = {12, 15, 9};\nint n = 3;                      /* how many are used */\nmarks[n++] = 18;                /* 12 15 9 18 */\nprintf(\"%d\\n\", marks[0]);       /* 12 */\nfor (int i = 0; i < n; i++) printf(\"%d\\n\", marks[i]);",
      cpp: "vector<int> marks = {12, 15, 9};\nmarks.push_back(18);            // 12 15 9 18\ncout << marks[0] << \"\\n\";       // 12\nfor (int m : marks) cout << m << \"\\n\";",
    },
    docs: { javascript: "array", php: "language.types.array.php", python: "tutorial/introduction.html#lists", java: "java_arraylist.asp", c: "c_arrays.php", cpp: "cpp_vectors.asp" },
  },
  functions: {
    en: { title: "Functions", intro: "A **function** is a small machine with a name: you give it inputs (**parameters**), it does its job and gives back a result with `return`. Like a coffee machine: water and coffee in, a cup of coffee out. You write it once and use it as many times as you want.", tip: "`return` gives the result back; printing it is not the same thing. Most exercises want the result **returned**." },
    fr: { title: "Fonctions", intro: "Une **fonction** est une petite machine avec un nom : on lui donne des entrées (**paramètres**), elle fait son travail et renvoie un résultat avec `return`. Comme une machine à café : de l'eau et du café entrent, une tasse de café sort. On l'écrit une fois et on l'utilise autant de fois qu'on veut.", tip: "`return` renvoie le résultat ; l'afficher n'est pas la même chose. La plupart des exercices veulent le résultat **renvoyé**." },
    code: {
      python: "def square(x):\n    return x * x\n\nprint(square(4))      # 16",
      javascript: "function square(x) {\n  return x * x;\n}\nconsole.log(square(4));   // 16",
      php: "function square($x) {\n    return $x * $x;\n}\necho square(4);          // 16",
      java: "static int square(int x) {\n    return x * x;\n}\n// square(4) gives 16",
      c: "int square(int x) {\n    return x * x;\n}\n/* square(4) gives 16 */",
      cpp: "int square(int x) {\n    return x * x;\n}\n// square(4) gives 16",
    },
    docs: { javascript: "function-basics", php: "functions.user-defined.php", python: "tutorial/controlflow.html#defining-functions", java: "java_methods.asp", c: "c_functions.php", cpp: "cpp_functions.asp" },
  },
  dicts: {
    en: { title: "Dictionaries & sets", intro: "A **dictionary** (also called *map* or *associative array*) stores pairs **key → value**, like a phone book: you look up a name and get the number instantly, without reading the whole book. A **set** is a bag of values without duplicates, to answer \"have I already seen this?\" quickly.", tip: "Perfect for counting: \"how many times does each word appear?\"" },
    fr: { title: "Dictionnaires et ensembles", intro: "Un **dictionnaire** (aussi appelé *map* ou *tableau associatif*) range des paires **clé → valeur**, comme un annuaire : on cherche un nom et on obtient le numéro tout de suite, sans lire tout l'annuaire. Un **ensemble** (*set*) est un sac de valeurs sans doublons, pour répondre vite à « l'ai-je déjà vu ? ».", tip: "Parfait pour compter : « combien de fois apparaît chaque mot ? »" },
    code: {
      python: 'phone = {"Lina": "0611", "Omar": "0622"}\nprint(phone["Lina"])        # 0611\nphone["Sara"] = "0633"      # add a pair',
      javascript: 'const phone = { Lina: "0611", Omar: "0622" };\nconsole.log(phone["Lina"]);     // 0611\nphone["Sara"] = "0633";         // add a pair',
      php: '$phone = ["Lina" => "0611", "Omar" => "0622"];\necho $phone["Lina"];            // 0611\n$phone["Sara"] = "0633";        // add a pair',
      java: 'HashMap<String, String> phone = new HashMap<>();\nphone.put("Lina", "0611");\nphone.put("Omar", "0622");\nSystem.out.println(phone.get("Lina"));   // 0611',
      c: "/* C has no dictionary: for small keys (letters, digits)\n   an array of counters does the job */\nint count[26] = {0};\nchar word[] = \"banana\";\nfor (int i = 0; word[i]; i++) count[word[i] - 'a']++;\nprintf(\"%d\\n\", count['a' - 'a']);   /* 3 (three a's) */",
      cpp: 'map<string, string> phone;\nphone["Lina"] = "0611";\nphone["Omar"] = "0622";\ncout << phone["Lina"] << "\\n";   // 0611',
    },
    docs: { javascript: "map-set", php: "language.types.array.php", python: "tutorial/datastructures.html#dictionaries", java: "java_hashmap.asp", c: "c_arrays.php", cpp: "cpp_maps.asp" },
  },
  oop: {
    en: { title: "Objects & classes", intro: "A **class** is a blueprint, like the plan of a house. An **object** is one real thing built from it, like one house. The class says what every object *has* (properties: owner, balance) and what it *can do* (methods: deposit money).", tip: "Start by listing the nouns of the problem (student, account…): they're often your classes." },
    fr: { title: "Objets et classes", intro: "Une **classe** est un plan, comme le plan d'une maison. Un **objet** est une vraie chose construite à partir de ce plan, comme une maison. La classe dit ce que chaque objet *a* (propriétés : propriétaire, solde) et ce qu'il *sait faire* (méthodes : déposer de l'argent).", tip: "Commence par lister les noms du problème (élève, compte…) : ce sont souvent tes classes." },
    code: {
      python: 'class Account:\n    def __init__(self, owner):\n        self.owner = owner\n        self.balance = 0\n\n    def deposit(self, amount):\n        self.balance += amount\n\nacc = Account("Lina")\nacc.deposit(50)\nprint(acc.balance)        # 50',
      javascript: 'class Account {\n  constructor(owner) {\n    this.owner = owner;\n    this.balance = 0;\n  }\n  deposit(amount) {\n    this.balance += amount;\n  }\n}\nconst acc = new Account("Lina");\nacc.deposit(50);\nconsole.log(acc.balance);   // 50',
      php: 'class Account {\n    public $owner;\n    public $balance = 0;\n    function __construct($owner) { $this->owner = $owner; }\n    function deposit($amount) { $this->balance += $amount; }\n}\n$acc = new Account("Lina");\n$acc->deposit(50);\necho $acc->balance;         // 50',
      java: 'class Account {\n    String owner;\n    int balance = 0;\n    Account(String owner) { this.owner = owner; }\n    void deposit(int amount) { balance += amount; }\n}\n// Account acc = new Account("Lina"); acc.deposit(50);  → balance 50',
      c: '/* C has no classes: a struct groups the data */\nstruct Account { char owner[20]; int balance; };\n\nstruct Account acc = {"Lina", 0};\nacc.balance += 50;\nprintf("%d\\n", acc.balance);   /* 50 */',
      cpp: 'class Account {\npublic:\n    string owner;\n    int balance = 0;\n    Account(string o) { owner = o; }\n    void deposit(int amount) { balance += amount; }\n};\n// Account acc("Lina"); acc.deposit(50);  → balance 50',
    },
    docs: { javascript: "class", php: "language.oop5.basic.php", python: "tutorial/classes.html", java: "java_classes.asp", c: "c_structs.php", cpp: "cpp_classes.asp" },
  },
  math: {
    en: { title: "Math tricks", intro: "Many exercises are easier with a little math. The most useful tool is the **remainder** `%` (modulo): `17 % 5` is `2`, what's left after making groups of 5. It tells you if a number is even (`n % 2 == 0`), gives the last digit (`n % 10`), and helps with anything that goes round in circles (days of the week, clock hours).", tip: "Very big numbers can be too large for a normal variable: watch the limits given in the exercise." },
    fr: { title: "Astuces de maths", intro: "Beaucoup d'exercices deviennent plus simples avec un peu de maths. L'outil le plus utile est le **reste** `%` (modulo) : `17 % 5` vaut `2`, ce qui reste après avoir fait des groupes de 5. Il dit si un nombre est pair (`n % 2 == 0`), donne le dernier chiffre (`n % 10`) et aide pour tout ce qui tourne en rond (jours de la semaine, heures d'une horloge).", tip: "Les très grands nombres peuvent dépasser la taille d'une variable normale : regarde les limites données dans l'exercice." },
    code: {
      python: "n = 1234\nprint(n % 10)        # 4     (last digit)\nprint(n // 10)       # 123   (remove the last digit)\nprint(n % 2 == 0)    # True  (even)",
      javascript: "const n = 1234;\nconsole.log(n % 10);               // 4    (last digit)\nconsole.log(Math.floor(n / 10));   // 123  (remove the last digit)\nconsole.log(n % 2 === 0);          // true (even)",
      php: "$n = 1234;\necho $n % 10;            // 4    (last digit)\necho intdiv($n, 10);     // 123  (remove the last digit)\nvar_dump($n % 2 === 0);  // true (even)",
      java: "int n = 1234;\nSystem.out.println(n % 10);       // 4    (last digit)\nSystem.out.println(n / 10);       // 123  (remove the last digit)\nSystem.out.println(n % 2 == 0);   // true (even)",
      c: "int n = 1234;\nprintf(\"%d\\n\", n % 10);        /* 4    (last digit) */\nprintf(\"%d\\n\", n / 10);        /* 123  (remove the last digit) */\nprintf(\"%d\\n\", n % 2 == 0);    /* 1    (even) */",
      cpp: "int n = 1234;\ncout << n % 10 << \"\\n\";        // 4    (last digit)\ncout << n / 10 << \"\\n\";        // 123  (remove the last digit)\ncout << (n % 2 == 0) << \"\\n\";  // 1    (even)",
    },
    docs: { javascript: "operators", php: "language.operators.arithmetic.php", python: "tutorial/introduction.html#numbers", java: "java_operators.asp", c: "c_operators.php", cpp: "cpp_operators.asp" },
    more: { en: [["Khan Academy: modulo", "https://www.khanacademy.org/computing/computer-science/cryptography/modarithmetic/a/what-is-modular-arithmetic"]], fr: [["Wikipédia : arithmétique modulaire", "https://fr.wikipedia.org/wiki/Arithm%C3%A9tique_modulaire"]] },
  },
  sorting: {
    en: { title: "Sorting", intro: "**Sorting** puts values in order, like arranging cards in your hand from smallest to largest. Every language already has a sort function, so you rarely write one yourself. Once data is sorted, many problems become easy: the smallest is first, the largest is last, equal values sit next to each other.", tip: "In JavaScript, always sort numbers with `sort((a, b) => a - b)`: without it, numbers are sorted like words (10 before 9)." },
    fr: { title: "Tri", intro: "**Trier** met des valeurs dans l'ordre, comme ranger les cartes de sa main de la plus petite à la plus grande. Chaque langage a déjà une fonction de tri : on en écrit rarement une soi-même. Une fois les données triées, beaucoup de problèmes deviennent faciles : le plus petit est au début, le plus grand à la fin, les valeurs égales sont côte à côte.", tip: "En JavaScript, trie toujours les nombres avec `sort((a, b) => a - b)` : sinon ils sont triés comme des mots (10 avant 9)." },
    code: {
      python: "marks = [15, 8, 12]\nmarks.sort()\nprint(marks)        # [8, 12, 15]",
      javascript: "const marks = [15, 8, 12];\nmarks.sort((a, b) => a - b);\nconsole.log(marks);   // [8, 12, 15]",
      php: "$marks = [15, 8, 12];\nsort($marks);\nprint_r($marks);      // 8, 12, 15",
      java: "int[] marks = {15, 8, 12};\nArrays.sort(marks);\nSystem.out.println(Arrays.toString(marks));   // [8, 12, 15]",
      c: "int cmp(const void *a, const void *b) {\n    return *(const int *)a - *(const int *)b;\n}\n\nint marks[] = {15, 8, 12};\nqsort(marks, 3, sizeof(int), cmp);   /* 8 12 15 */",
      cpp: "vector<int> marks = {15, 8, 12};\nsort(marks.begin(), marks.end());   // 8 12 15",
    },
    docs: { javascript: "array-methods#sort-fn", php: "array.sorting.php", python: "howto/sorting.html", java: "java_arrays.asp", c: "https://en.cppreference.com/w/c/algorithm/qsort", cpp: "https://en.cppreference.com/w/cpp/algorithm/sort" },
    more: { en: [["VisuAlgo: watch sorting step by step", "https://visualgo.net/en/sorting"]], fr: [["VisuAlgo : voir le tri pas à pas", "https://visualgo.net/en/sorting"], ["Wikipédia : algorithme de tri", "https://fr.wikipedia.org/wiki/Algorithme_de_tri"]] },
  },
  complexity: {
    en: { title: "Complexity (Big-O)", intro: "**Complexity** answers: *if the input gets 10 times bigger, how much longer does my program take?* We write it with **Big-O**:\n- **O(1)**: always the same time (reading `a[5]`).\n- **O(n)**: one loop over the data. 10× more data → 10× longer.\n- **O(n²)**: a loop inside a loop. 10× more data → 100× longer!\n- **O(log n)**: you cut the problem in half each time (like a dictionary search): super fast.\nA computer does about 100 million simple steps per second.", tip: "Look at the limits in the exercise: with n = 100 000, an O(n²) program does 10 billion steps: too slow. You need O(n) or O(n log n)." },
    fr: { title: "Complexité (grand O)", intro: "La **complexité** répond à : *si l'entrée devient 10 fois plus grande, combien de temps de plus prend mon programme ?* On l'écrit avec le **grand O** :\n- **O(1)** : toujours le même temps (lire `a[5]`).\n- **O(n)** : une boucle sur les données. 10× plus de données → 10× plus long.\n- **O(n²)** : une boucle dans une boucle. 10× plus de données → 100× plus long !\n- **O(log n)** : on coupe le problème en deux à chaque fois (comme chercher dans un dictionnaire) : très rapide.\nUn ordinateur fait environ 100 millions d'étapes simples par seconde.", tip: "Regarde les limites de l'exercice : avec n = 100 000, un programme en O(n²) fait 10 milliards d'étapes : trop lent. Il faut du O(n) ou du O(n log n)." },
    more: {
      en: [["Khan Academy: Big-O notation", "https://www.khanacademy.org/computing/computer-science/algorithms/asymptotic-notation/a/big-o-notation"]],
      fr: [["Wikipédia : complexité des algorithmes", "https://fr.wikipedia.org/wiki/Analyse_de_la_complexit%C3%A9_des_algorithmes"]],
    },
  },
  recursion: {
    en: { title: "Recursion", intro: "A **recursive** function is a function that **calls itself** on a smaller version of the same problem, until it reaches a case so small that the answer is obvious (the **base case**). Like Russian dolls: you open one, there's a smaller one inside, until the tiniest one that doesn't open.", tip: "Always write the base case first, otherwise the function calls itself forever and the program crashes." },
    fr: { title: "Récursivité", intro: "Une fonction **récursive** est une fonction qui **s'appelle elle-même** sur une version plus petite du même problème, jusqu'à un cas si petit que la réponse est évidente (le **cas de base**). Comme des poupées russes : on en ouvre une, il y en a une plus petite dedans, jusqu'à la toute petite qui ne s'ouvre pas.", tip: "Écris toujours le cas de base en premier, sinon la fonction s'appelle à l'infini et le programme plante." },
    code: {
      python: "def factorial(n):\n    if n <= 1:                    # base case\n        return 1\n    return n * factorial(n - 1)   # smaller problem\n\nprint(factorial(5))   # 120",
      javascript: "function factorial(n) {\n  if (n <= 1) return 1;             // base case\n  return n * factorial(n - 1);      // smaller problem\n}\nconsole.log(factorial(5));   // 120",
      php: "function factorial($n) {\n    if ($n <= 1) return 1;            // base case\n    return $n * factorial($n - 1);    // smaller problem\n}\necho factorial(5);   // 120",
      java: "static int factorial(int n) {\n    if (n <= 1) return 1;             // base case\n    return n * factorial(n - 1);      // smaller problem\n}\n// factorial(5) gives 120",
      c: "int factorial(int n) {\n    if (n <= 1) return 1;             /* base case */\n    return n * factorial(n - 1);      /* smaller problem */\n}\n/* factorial(5) gives 120 */",
      cpp: "int factorial(int n) {\n    if (n <= 1) return 1;             // base case\n    return n * factorial(n - 1);      // smaller problem\n}\n// factorial(5) gives 120",
    },
    docs: { javascript: "recursion", php: "functions.user-defined.php", python: "tutorial/controlflow.html#defining-functions", java: "java_recursion.asp", c: "c_functions_recursion.php", cpp: "cpp_functions_recursion.asp" },
    more: { en: [["Khan Academy: recursion", "https://www.khanacademy.org/computing/computer-science/algorithms/recursive-algorithms/a/recursion"]], fr: [["Wikipédia : algorithme récursif", "https://fr.wikipedia.org/wiki/Algorithme_r%C3%A9cursif"]] },
  },
  stack: {
    en: { title: "Stacks & queues", intro: "A **stack** is like a pile of plates: you add on top and take from the top, so the **last one in is the first one out**. The \"undo\" button of an editor is a stack. A **queue** is like a line at the bakery: the **first one in is the first one out**.", tip: "Stacks are great for checking brackets: every `(` must be closed by a `)` in the right order." },
    fr: { title: "Piles et files", intro: "Une **pile** est comme une pile d'assiettes : on pose dessus et on prend dessus, donc **le dernier arrivé est le premier sorti**. Le bouton « annuler » d'un éditeur est une pile. Une **file** est comme la queue à la boulangerie : **le premier arrivé est le premier servi**.", tip: "Les piles sont parfaites pour vérifier des parenthèses : chaque `(` doit être fermée par une `)` dans le bon ordre." },
    code: {
      python: 'stack = []\nstack.append("a")       # put on top\nstack.append("b")\nprint(stack.pop())      # b   (last in, first out)\nprint(stack.pop())      # a',
      javascript: 'const stack = [];\nstack.push("a");             // put on top\nstack.push("b");\nconsole.log(stack.pop());    // b   (last in, first out)\nconsole.log(stack.pop());    // a',
      php: '$stack = [];\n$stack[] = "a";              // put on top\n$stack[] = "b";\necho array_pop($stack);      // b   (last in, first out)\necho array_pop($stack);      // a',
      java: 'ArrayDeque<String> stack = new ArrayDeque<>();\nstack.push("a");                       // put on top\nstack.push("b");\nSystem.out.println(stack.pop());       // b   (last in, first out)\nSystem.out.println(stack.pop());       // a',
      c: "char stack[100];\nint top = 0;                 /* number of items */\nstack[top++] = 'a';          /* put on top */\nstack[top++] = 'b';\nprintf(\"%c\\n\", stack[--top]);  /* b   (last in, first out) */\nprintf(\"%c\\n\", stack[--top]);  /* a */",
      cpp: 'stack<string> st;\nst.push("a");                  // put on top\nst.push("b");\ncout << st.top() << "\\n";      // b   (last in, first out)\nst.pop();\ncout << st.top() << "\\n";      // a',
    },
    docs: { javascript: "array#methods-pop-push-shift-unshift", php: "function.array-pop.php", python: "tutorial/datastructures.html#using-lists-as-stacks", java: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayDeque.html", c: "c_arrays.php", cpp: "https://en.cppreference.com/w/cpp/container/stack" },
    more: { en: [["VisuAlgo: stacks and queues", "https://visualgo.net/en/list"]], fr: [["Wikipédia : pile", "https://fr.wikipedia.org/wiki/Pile_(informatique)"], ["VisuAlgo : piles et files", "https://visualgo.net/en/list"]] },
  },
  twopointers: {
    en: { title: "Two pointers", intro: "Instead of comparing every pair of values (slow), you keep **two positions** in the data and move them step by step. Example: to check if a word is a palindrome (reads the same both ways, like *kayak*), put one finger on the first letter, one on the last, compare, and move both fingers toward the middle.", tip: "Ask yourself after each comparison: which finger should move, and why?" },
    fr: { title: "Deux pointeurs", intro: "Au lieu de comparer toutes les paires de valeurs (lent), on garde **deux positions** dans les données et on les déplace pas à pas. Exemple : pour savoir si un mot est un palindrome (il se lit dans les deux sens, comme *kayak*), mets un doigt sur la première lettre, un sur la dernière, compare, et rapproche les deux doigts du milieu.", tip: "Demande-toi après chaque comparaison : quel doigt doit bouger, et pourquoi ?" },
    code: {
      python: 'word = "kayak"\nleft, right = 0, len(word) - 1\nis_pal = True\nwhile left < right:\n    if word[left] != word[right]:\n        is_pal = False\n    left += 1\n    right -= 1\nprint(is_pal)     # True',
      javascript: 'const word = "kayak";\nlet left = 0, right = word.length - 1, isPal = true;\nwhile (left < right) {\n  if (word[left] !== word[right]) isPal = false;\n  left++;\n  right--;\n}\nconsole.log(isPal);   // true',
      php: '$word = "kayak";\n$left = 0; $right = strlen($word) - 1; $isPal = true;\nwhile ($left < $right) {\n    if ($word[$left] !== $word[$right]) $isPal = false;\n    $left++;\n    $right--;\n}\nvar_dump($isPal);     // true',
      java: 'String word = "kayak";\nint left = 0, right = word.length() - 1;\nboolean isPal = true;\nwhile (left < right) {\n    if (word.charAt(left) != word.charAt(right)) isPal = false;\n    left++;\n    right--;\n}\nSystem.out.println(isPal);   // true',
      c: 'char word[] = "kayak";\nint left = 0, right = strlen(word) - 1, is_pal = 1;\nwhile (left < right) {\n    if (word[left] != word[right]) is_pal = 0;\n    left++;\n    right--;\n}\nprintf("%d\\n", is_pal);   /* 1 */',
      cpp: 'string word = "kayak";\nint left = 0, right = (int) word.size() - 1;\nbool isPal = true;\nwhile (left < right) {\n    if (word[left] != word[right]) isPal = false;\n    left++;\n    right--;\n}\ncout << isPal << "\\n";   // 1',
    },
    more: { en: [["USACO Guide: two pointers", "https://usaco.guide/silver/two-pointers"]], fr: [["USACO Guide (anglais) : deux pointeurs", "https://usaco.guide/silver/two-pointers"]] },
  },
  prefix: {
    en: { title: "Prefix sums", intro: "A **prefix sum** is a running total: like a bank statement where each line shows the balance so far. Compute these totals once; then the total between any two positions is just **one subtraction**, instead of adding everything again.", tip: "Make the totals array one longer than the data and start it with 0: `total[0] = 0`." },
    fr: { title: "Sommes préfixes", intro: "Une **somme préfixe** est un total qui s'accumule : comme un relevé bancaire où chaque ligne montre le solde jusque-là. On calcule ces totaux une seule fois ; ensuite le total entre deux positions n'est qu'**une soustraction**, au lieu de tout additionner à nouveau.", tip: "Fais un tableau de totaux d'une case de plus que les données, qui commence par 0 : `total[0] = 0`." },
    code: {
      python: "a = [3, 1, 4, 1, 5]\ntotal = [0]\nfor x in a:\n    total.append(total[-1] + x)   # [0, 3, 4, 8, 9, 14]\n# sum of a[1..3] = 1 + 4 + 1\nprint(total[4] - total[1])        # 6",
      javascript: "const a = [3, 1, 4, 1, 5];\nconst total = [0];\nfor (const x of a) total.push(total[total.length - 1] + x);   // [0, 3, 4, 8, 9, 14]\n// sum of a[1..3] = 1 + 4 + 1\nconsole.log(total[4] - total[1]);   // 6",
      php: "$a = [3, 1, 4, 1, 5];\n$total = [0];\nforeach ($a as $x) $total[] = end($total) + $x;   // 0 3 4 8 9 14\n// sum of a[1..3] = 1 + 4 + 1\necho $total[4] - $total[1];   // 6",
      java: "int[] a = {3, 1, 4, 1, 5};\nint[] total = new int[a.length + 1];   // total[0] = 0\nfor (int i = 0; i < a.length; i++) total[i + 1] = total[i] + a[i];\n// sum of a[1..3] = 1 + 4 + 1\nSystem.out.println(total[4] - total[1]);   // 6",
      c: "int a[] = {3, 1, 4, 1, 5};\nint total[6] = {0};\nfor (int i = 0; i < 5; i++) total[i + 1] = total[i] + a[i];\n/* sum of a[1..3] = 1 + 4 + 1 */\nprintf(\"%d\\n\", total[4] - total[1]);   /* 6 */",
      cpp: "vector<int> a = {3, 1, 4, 1, 5};\nvector<int> total(a.size() + 1, 0);\nfor (size_t i = 0; i < a.size(); i++) total[i + 1] = total[i] + a[i];\n// sum of a[1..3] = 1 + 4 + 1\ncout << total[4] - total[1] << \"\\n\";   // 6",
    },
    more: { en: [["USACO Guide: prefix sums", "https://usaco.guide/silver/prefix-sums"]], fr: [["USACO Guide (anglais) : sommes préfixes", "https://usaco.guide/silver/prefix-sums"]] },
  },
  binsearch: {
    en: { title: "Binary search", intro: "The \"guess my number between 1 and 100\" game: you say 50, I answer *higher* or *lower*, and you throw away half of the numbers each time. In 7 guesses you always find it. **Binary search** does the same in a **sorted** list: look at the middle, then keep only the half where the value can be.", tip: "It only works if the data is sorted. Sort first if needed." },
    fr: { title: "Recherche dichotomique", intro: "Le jeu « devine mon nombre entre 1 et 100 » : tu dis 50, je réponds *plus* ou *moins*, et tu élimines la moitié des nombres à chaque fois. En 7 essais tu trouves toujours. La **recherche dichotomique** fait pareil dans une liste **triée** : regarde le milieu, puis garde seulement la moitié où la valeur peut se trouver.", tip: "Ça ne marche que si les données sont triées. Trie d'abord si besoin." },
    code: {
      python: "a = [2, 5, 8, 12, 16, 23]     # sorted\nx = 12\nlo, hi = 0, len(a) - 1\nwhile lo <= hi:\n    mid = (lo + hi) // 2\n    if a[mid] == x:\n        print(\"found at\", mid)   # found at 3\n        break\n    elif a[mid] < x:\n        lo = mid + 1             # look right\n    else:\n        hi = mid - 1             # look left",
      javascript: "const a = [2, 5, 8, 12, 16, 23];   // sorted\nconst x = 12;\nlet lo = 0, hi = a.length - 1;\nwhile (lo <= hi) {\n  const mid = Math.floor((lo + hi) / 2);\n  if (a[mid] === x) { console.log(\"found at\", mid); break; }   // found at 3\n  if (a[mid] < x) lo = mid + 1;     // look right\n  else hi = mid - 1;                // look left\n}",
      php: "$a = [2, 5, 8, 12, 16, 23];   // sorted\n$x = 12;\n$lo = 0; $hi = count($a) - 1;\nwhile ($lo <= $hi) {\n    $mid = intdiv($lo + $hi, 2);\n    if ($a[$mid] === $x) { echo \"found at $mid\"; break; }   // found at 3\n    if ($a[$mid] < $x) $lo = $mid + 1;     // look right\n    else $hi = $mid - 1;                   // look left\n}",
      java: "int[] a = {2, 5, 8, 12, 16, 23};   // sorted\nint x = 12, lo = 0, hi = a.length - 1;\nwhile (lo <= hi) {\n    int mid = (lo + hi) / 2;\n    if (a[mid] == x) { System.out.println(\"found at \" + mid); break; }   // found at 3\n    if (a[mid] < x) lo = mid + 1;     // look right\n    else hi = mid - 1;                // look left\n}",
      c: "int a[] = {2, 5, 8, 12, 16, 23};   /* sorted */\nint x = 12, lo = 0, hi = 5;\nwhile (lo <= hi) {\n    int mid = (lo + hi) / 2;\n    if (a[mid] == x) { printf(\"found at %d\\n\", mid); break; }   /* found at 3 */\n    if (a[mid] < x) lo = mid + 1;     /* look right */\n    else hi = mid - 1;                /* look left */\n}",
      cpp: "vector<int> a = {2, 5, 8, 12, 16, 23};   // sorted\nint x = 12, lo = 0, hi = (int) a.size() - 1;\nwhile (lo <= hi) {\n    int mid = (lo + hi) / 2;\n    if (a[mid] == x) { cout << \"found at \" << mid << \"\\n\"; break; }   // found at 3\n    if (a[mid] < x) lo = mid + 1;     // look right\n    else hi = mid - 1;                // look left\n}",
    },
    more: { en: [["Khan Academy: binary search", "https://www.khanacademy.org/computing/computer-science/algorithms/binary-search/a/binary-search"]], fr: [["Wikipédia : recherche dichotomique", "https://fr.wikipedia.org/wiki/Recherche_dichotomique"]] },
  },
  greedy: {
    en: { title: "Greedy", intro: "A **greedy** method takes the best-looking choice at each step and never goes back. Example: a cashier giving change uses the **biggest coin possible** first, then the next biggest, and so on. It's simple and fast, and it works for many problems.", tip: "Greedy is not always right: with coins of 1, 3 and 4, making 6 greedily gives 4+1+1 (3 coins) but 3+3 is better. Test small examples by hand first." },
    fr: { title: "Glouton", intro: "Une méthode **gloutonne** prend le choix qui semble le meilleur à chaque étape, sans jamais revenir en arrière. Exemple : une caissière qui rend la monnaie donne d'abord **la plus grosse pièce possible**, puis la suivante, etc. C'est simple et rapide, et ça marche pour beaucoup de problèmes.", tip: "Le glouton n'a pas toujours raison : avec des pièces de 1, 3 et 4, faire 6 en glouton donne 4+1+1 (3 pièces) mais 3+3 est mieux. Teste d'abord de petits exemples à la main." },
    code: {
      python: "coins = [200, 100, 50, 20, 10, 5, 2, 1]   # biggest first\namount, used = 287, 0\nfor c in coins:\n    while amount >= c:\n        amount -= c\n        used += 1\nprint(used)     # 6  (200 + 50 + 20 + 10 + 5 + 2)",
      javascript: "const coins = [200, 100, 50, 20, 10, 5, 2, 1];   // biggest first\nlet amount = 287, used = 0;\nfor (const c of coins) {\n  while (amount >= c) { amount -= c; used++; }\n}\nconsole.log(used);   // 6  (200 + 50 + 20 + 10 + 5 + 2)",
      php: "$coins = [200, 100, 50, 20, 10, 5, 2, 1];   // biggest first\n$amount = 287; $used = 0;\nforeach ($coins as $c) {\n    while ($amount >= $c) { $amount -= $c; $used++; }\n}\necho $used;   // 6  (200 + 50 + 20 + 10 + 5 + 2)",
      java: "int[] coins = {200, 100, 50, 20, 10, 5, 2, 1};   // biggest first\nint amount = 287, used = 0;\nfor (int c : coins) {\n    while (amount >= c) { amount -= c; used++; }\n}\nSystem.out.println(used);   // 6",
      c: "int coins[] = {200, 100, 50, 20, 10, 5, 2, 1};   /* biggest first */\nint amount = 287, used = 0;\nfor (int i = 0; i < 8; i++) {\n    while (amount >= coins[i]) { amount -= coins[i]; used++; }\n}\nprintf(\"%d\\n\", used);   /* 6 */",
      cpp: "vector<int> coins = {200, 100, 50, 20, 10, 5, 2, 1};   // biggest first\nint amount = 287, used = 0;\nfor (int c : coins) {\n    while (amount >= c) { amount -= c; used++; }\n}\ncout << used << \"\\n\";   // 6",
    },
    more: { en: [["Wikipedia: greedy algorithm", "https://en.wikipedia.org/wiki/Greedy_algorithm"]], fr: [["Wikipédia : algorithme glouton", "https://fr.wikipedia.org/wiki/Algorithme_glouton"]] },
  },
  dp: {
    en: { title: "Dynamic programming", intro: "**Dynamic programming** means: solve small versions of the problem first, **write down** their answers, and build the big answer from them, so you never compute the same thing twice. Example: to climb a staircase taking 1 or 2 steps at a time, the number of ways to reach step *n* = ways to reach *n − 1* + ways to reach *n − 2*.", tip: "Before coding, write in one sentence what each box `ways[i]` means. Then find how it's built from smaller boxes." },
    fr: { title: "Programmation dynamique", intro: "La **programmation dynamique**, c'est : résoudre d'abord les petites versions du problème, **noter** leurs réponses, et construire la grande réponse à partir d'elles, pour ne jamais calculer deux fois la même chose. Exemple : pour monter un escalier une ou deux marches à la fois, le nombre de façons d'atteindre la marche *n* = façons d'atteindre *n − 1* + façons d'atteindre *n − 2*.", tip: "Avant de coder, écris en une phrase ce que veut dire chaque case `ways[i]`. Puis trouve comment elle se calcule avec des cases plus petites." },
    code: {
      python: "n = 5\nways = [0] * (n + 1)\nways[0] = ways[1] = 1\nfor i in range(2, n + 1):\n    ways[i] = ways[i - 1] + ways[i - 2]\nprint(ways[n])      # 8",
      javascript: "const n = 5;\nconst ways = Array(n + 1).fill(0);\nways[0] = ways[1] = 1;\nfor (let i = 2; i <= n; i++) ways[i] = ways[i - 1] + ways[i - 2];\nconsole.log(ways[n]);   // 8",
      php: "$n = 5;\n$ways = array_fill(0, $n + 1, 0);\n$ways[0] = $ways[1] = 1;\nfor ($i = 2; $i <= $n; $i++) $ways[$i] = $ways[$i - 1] + $ways[$i - 2];\necho $ways[$n];   // 8",
      java: "int n = 5;\nint[] ways = new int[n + 1];\nways[0] = ways[1] = 1;\nfor (int i = 2; i <= n; i++) ways[i] = ways[i - 1] + ways[i - 2];\nSystem.out.println(ways[n]);   // 8",
      c: "int n = 5;\nint ways[6];\nways[0] = ways[1] = 1;\nfor (int i = 2; i <= n; i++) ways[i] = ways[i - 1] + ways[i - 2];\nprintf(\"%d\\n\", ways[n]);   /* 8 */",
      cpp: "int n = 5;\nvector<int> ways(n + 1, 0);\nways[0] = ways[1] = 1;\nfor (int i = 2; i <= n; i++) ways[i] = ways[i - 1] + ways[i - 2];\ncout << ways[n] << \"\\n\";   // 8",
    },
    more: { en: [["CP-Algorithms: intro to dynamic programming", "https://cp-algorithms.com/dynamic_programming/intro-to-dp.html"]], fr: [["Wikipédia : programmation dynamique", "https://fr.wikipedia.org/wiki/Programmation_dynamique"]] },
  },
  graphs: {
    en: { title: "Graphs", intro: "A **graph** is a set of points (**nodes**) connected by lines (**edges**): cities and roads, people and friendships, rooms and doors. We usually store, for each node, the **list of its neighbors**. To explore a graph, you visit a node, then its neighbors, then *their* neighbors… (that's **BFS**, breadth-first search), and you mark the nodes already visited.", tip: "Always remember which nodes you've already visited, otherwise you go round in circles forever." },
    fr: { title: "Graphes", intro: "Un **graphe** est un ensemble de points (**sommets**) reliés par des traits (**arêtes**) : des villes et des routes, des personnes et des amitiés, des pièces et des portes. On range en général, pour chaque sommet, la **liste de ses voisins**. Pour explorer un graphe, on visite un sommet, puis ses voisins, puis *leurs* voisins… (c'est le **parcours en largeur**, BFS), en marquant les sommets déjà visités.", tip: "Retiens toujours les sommets déjà visités, sinon tu tournes en rond à l'infini." },
    code: {
      python: 'friends = {\n    "Lina": ["Omar", "Sara"],\n    "Omar": ["Lina"],\n    "Sara": ["Lina", "Adam"],\n    "Adam": ["Sara"],\n}\nfor f in friends["Lina"]:\n    print(f)          # Omar, Sara',
      javascript: 'const friends = {\n  Lina: ["Omar", "Sara"],\n  Omar: ["Lina"],\n  Sara: ["Lina", "Adam"],\n  Adam: ["Sara"],\n};\nfor (const f of friends["Lina"]) console.log(f);   // Omar, Sara',
      php: '$friends = [\n    "Lina" => ["Omar", "Sara"],\n    "Omar" => ["Lina"],\n    "Sara" => ["Lina", "Adam"],\n    "Adam" => ["Sara"],\n];\nforeach ($friends["Lina"] as $f) echo $f, "\\n";   // Omar, Sara',
      java: 'Map<String, List<String>> friends = new HashMap<>();\nfriends.put("Lina", List.of("Omar", "Sara"));\nfriends.put("Sara", List.of("Lina", "Adam"));\nfor (String f : friends.get("Lina")) System.out.println(f);   // Omar, Sara',
      c: "/* nodes are numbers 0..3; adj[i] lists the neighbors of i */\nint adj[4][4] = {{1, 2}, {0}, {0, 3}, {2}};\nint deg[4] = {2, 1, 2, 1};       /* how many neighbors */\nfor (int k = 0; k < deg[0]; k++) printf(\"%d\\n\", adj[0][k]);   /* 1, 2 */",
      cpp: 'map<string, vector<string>> friends;\nfriends["Lina"] = {"Omar", "Sara"};\nfriends["Sara"] = {"Lina", "Adam"};\nfor (auto& f : friends["Lina"]) cout << f << "\\n";   // Omar, Sara',
    },
    more: { en: [["VisuAlgo: explore a graph step by step", "https://visualgo.net/en/dfsbfs"], ["CP-Algorithms: BFS", "https://cp-algorithms.com/graph/breadth-first-search.html"]], fr: [["Wikipédia : parcours en largeur", "https://fr.wikipedia.org/wiki/Algorithme_de_parcours_en_largeur"], ["VisuAlgo : parcours de graphe", "https://visualgo.net/en/dfsbfs"]] },
  },
  async: {
    en: { title: "Asynchronous code", intro: "Some work is slow: downloading a page, reading a file, waiting for a timer. **Asynchronous** code starts that work and keeps going instead of freezing. Like ordering at a restaurant: you don't stand in the kitchen, you sit down and the dish comes when it's ready. `await` means *wait here for the result*.", tip: "If you forget `await`, you get a \"promise\" of a result instead of the result itself." },
    fr: { title: "Code asynchrone", intro: "Certains travaux sont lents : télécharger une page, lire un fichier, attendre un minuteur. Le code **asynchrone** lance ce travail et continue au lieu de rester bloqué. Comme au restaurant : tu ne restes pas en cuisine, tu t'assois et le plat arrive quand il est prêt. `await` veut dire *attends ici le résultat*.", tip: "Si tu oublies `await`, tu obtiens une « promesse » de résultat au lieu du résultat lui-même." },
    code: {
      javascript: 'async function getUser() {\n  const res = await fetch("https://api.github.com/users/octocat");\n  const user = await res.json();\n  console.log(user.name);   // The Octocat\n}\ngetUser();',
      python: 'import asyncio\n\nasync def make_tea():\n    await asyncio.sleep(2)      # waiting, without blocking\n    return "tea is ready"\n\nprint(asyncio.run(make_tea()))',
    },
    docs: { javascript: "async-await", python: "library/asyncio-task.html" },
  },
  sql: {
    en: { title: "SQL", intro: "**SQL** is the language to ask questions to a database. Data is stored in **tables** (like spreadsheets: rows and columns). `SELECT` chooses the columns, `FROM` the table, `WHERE` filters the rows, `ORDER BY` sorts them.", tip: "Write the query in the order you think: *which table?* (FROM), *which rows?* (WHERE), *which columns?* (SELECT)." },
    fr: { title: "SQL", intro: "**SQL** est le langage pour poser des questions à une base de données. Les données sont rangées dans des **tables** (comme un tableur : des lignes et des colonnes). `SELECT` choisit les colonnes, `FROM` la table, `WHERE` filtre les lignes, `ORDER BY` les trie.", tip: "Écris la requête dans l'ordre où tu réfléchis : *quelle table ?* (FROM), *quelles lignes ?* (WHERE), *quelles colonnes ?* (SELECT)." },
    shared: { fence: "sql", code: "-- names and marks of students with at least 10, best first\nSELECT name, mark\nFROM students\nWHERE mark >= 10\nORDER BY mark DESC;" },
    more: { en: [["W3Schools SQL tutorial (try it online)", "https://www.w3schools.com/sql/"], ["SQLBolt: interactive lessons", "https://sqlbolt.com/"]], fr: [["sql.sh : cours SQL en français", "https://sql.sh/"], ["W3Schools SQL (essai en ligne)", "https://www.w3schools.com/sql/"]] },
  },
  regex: {
    en: { title: "Regular expressions", intro: "A **regular expression** (regex) is a pattern to recognize text, like a search with super-powers. `\\d` means *a digit*, `+` means *one or more*, `^` and `$` mean *the start* and *the end*. So `^\\d+$` means: *only digits, from start to end*.", tip: "Test your pattern on regex101.com: it explains every symbol and shows what matches." },
    fr: { title: "Expressions régulières", intro: "Une **expression régulière** (regex) est un motif pour reconnaître du texte, comme une recherche avec des super-pouvoirs. `\\d` veut dire *un chiffre*, `+` veut dire *un ou plus*, `^` et `$` veulent dire *le début* et *la fin*. Donc `^\\d+$` veut dire : *seulement des chiffres, du début à la fin*.", tip: "Teste ton motif sur regex101.com : le site explique chaque symbole et montre ce qui correspond." },
    code: {
      javascript: 'const onlyDigits = /^\\d+$/;\nconsole.log(onlyDigits.test("2024"));   // true\nconsole.log(onlyDigits.test("20a4"));   // false',
      php: "var_dump(preg_match('/^\\d+$/', '2024'));   // int(1)  → matches\nvar_dump(preg_match('/^\\d+$/', '20a4'));   // int(0)  → no match",
      python: 'import re\nprint(bool(re.fullmatch(r"\\d+", "2024")))   # True\nprint(bool(re.fullmatch(r"\\d+", "20a4")))   # False',
      java: 'System.out.println("2024".matches("\\\\d+"));   // true\nSystem.out.println("20a4".matches("\\\\d+"));   // false',
      cpp: 'regex onlyDigits("\\\\d+");\ncout << regex_match(string("2024"), onlyDigits) << "\\n";   // 1\ncout << regex_match(string("20a4"), onlyDigits) << "\\n";   // 0',
      c: '#include <regex.h>\nregex_t re;\nregcomp(&re, "^[0-9]+$", REG_EXTENDED);\nprintf("%d\\n", regexec(&re, "2024", 0, NULL, 0) == 0);   /* 1 */',
    },
    more: { en: [["RegexOne: interactive lessons", "https://regexone.com/"], ["regex101: test your patterns", "https://regex101.com/"]], fr: [["MDN : les expressions régulières", "https://developer.mozilla.org/fr/docs/Web/JavaScript/Guide/Regular_expressions"], ["regex101 : tester tes motifs", "https://regex101.com/"]] },
  },
  git: {
    en: { title: "Git", intro: "**Git** keeps the history of your project, like save points in a video game. Each save is a **commit** with a message saying what changed. You can go back to any save, and work with others without overwriting their work.", tip: "Commit small and often, with a clear message (\"Add login form\" rather than \"update\")." },
    fr: { title: "Git", intro: "**Git** garde l'historique de ton projet, comme des points de sauvegarde dans un jeu vidéo. Chaque sauvegarde est un **commit** avec un message qui dit ce qui a changé. Tu peux revenir à n'importe quelle sauvegarde, et travailler à plusieurs sans écraser le travail des autres.", tip: "Commite souvent, par petits morceaux, avec un message clair (« Ajout du formulaire de connexion » plutôt que « maj »)." },
    shared: { fence: "bash", code: 'git status                     # what changed?\ngit add .                      # choose the changes to save\ngit commit -m "Add login form" # save them with a message\ngit push                       # send them to GitHub\ngit log --oneline              # see the history' },
    more: { en: [["Learn Git Branching (interactive)", "https://learngitbranching.js.org/"], ["The Git book", "https://git-scm.com/book/en/v2"]], fr: [["Learn Git Branching (en français)", "https://learngitbranching.js.org/?locale=fr_FR"], ["Le livre Git (en français)", "https://git-scm.com/book/fr/v2"]] },
  },
  web: {
    en: { title: "Web development", intro: "When you open a website, your browser sends a **request** to a server (\"give me this page\"), and the server sends back a **response**: the page (HTML) or data (JSON), with a **status code** that says how it went: 200 = OK, 404 = not found, 500 = the server crashed.", tip: "Open your browser's developer tools (F12 → Network tab) to see every request and response of a page." },
    fr: { title: "Développement web", intro: "Quand tu ouvres un site, ton navigateur envoie une **requête** à un serveur (« donne-moi cette page »), et le serveur renvoie une **réponse** : la page (HTML) ou des données (JSON), avec un **code de statut** qui dit comment ça s'est passé : 200 = OK, 404 = introuvable, 500 = le serveur a planté.", tip: "Ouvre les outils de développement du navigateur (F12 → onglet Réseau) pour voir chaque requête et réponse d'une page." },
    shared: { fence: "http", code: "GET /students/42      → 200 OK         (here is student 42)\nPOST /students        → 201 Created    (new student saved)\nGET /missing-page     → 404 Not Found\nany server crash      → 500 Internal Server Error" },
    more: { en: [["MDN: an overview of HTTP", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview"], ["MDN: learn web development", "https://developer.mozilla.org/en-US/docs/Learn_web_development"]], fr: [["MDN : un aperçu de HTTP", "https://developer.mozilla.org/fr/docs/Web/HTTP/Guides/Overview"]] },
  },
  // ======================================================= SQL track
  sql_select: {
    en: { title: "SQL: SELECT basics", intro: "A database keeps data in **tables**, like spreadsheets: each **row** is one thing (a student), each **column** is one piece of information (name, city). `SELECT` chooses the columns you want to see, `FROM` says which table.", tip: "`SELECT *` shows every column: handy to explore a table, but in exercises list exactly the columns asked, in the right order." },
    fr: { title: "SQL : bases de SELECT", intro: "Une base de données range les données dans des **tables**, comme des feuilles de calcul : chaque **ligne** est une chose (un élève), chaque **colonne** une information (nom, ville). `SELECT` choisit les colonnes à afficher, `FROM` dit quelle table.", tip: "`SELECT *` montre toutes les colonnes : pratique pour explorer, mais dans les exercices liste exactement les colonnes demandées, dans le bon ordre." },
    shared: { fence: "sql", code: "SELECT name, city\nFROM students;\n\n-- every column:\nSELECT * FROM students;" },
    more: { en: [["SQLBolt: SELECT queries", "https://sqlbolt.com/lesson/select_queries_introduction"], ["W3Schools: SELECT", "https://www.w3schools.com/sql/sql_select.asp"]], fr: [["sql.sh : SELECT", "https://sql.sh/cours/select"], ["SQLBolt (anglais, interactif)", "https://sqlbolt.com/lesson/select_queries_introduction"]] },
  },
  sql_filter: {
    en: { title: "SQL: filtering with WHERE", intro: "`WHERE` keeps only the rows that match a condition, like a sieve. Combine conditions with `AND` (both must be true) and `OR` (at least one). `LIKE 'A%'` means \"starts with A\".", tip: "Text goes between single quotes: `'Rabat'`. To find empty values write `IS NULL`, never `= NULL`." },
    fr: { title: "SQL : filtrer avec WHERE", intro: "`WHERE` garde seulement les lignes qui respectent une condition, comme une passoire. Combine les conditions avec `AND` (les deux vraies) et `OR` (au moins une). `LIKE 'A%'` veut dire « commence par A ».", tip: "Le texte se met entre apostrophes : `'Rabat'`. Pour trouver les valeurs vides, écris `IS NULL`, jamais `= NULL`." },
    shared: { fence: "sql", code: "SELECT name, birth_year\nFROM students\nWHERE city = 'Rabat' AND birth_year >= 2004;\n\nSELECT name FROM students WHERE name LIKE 'A%';\nSELECT name FROM students WHERE city IS NULL;" },
    more: { en: [["SQLBolt: queries with constraints", "https://sqlbolt.com/lesson/select_queries_with_constraints"], ["W3Schools: WHERE", "https://www.w3schools.com/sql/sql_where.asp"]], fr: [["sql.sh : WHERE", "https://sql.sh/cours/where"]] },
  },
  sql_sort: {
    en: { title: "SQL: ORDER BY & LIMIT", intro: "Without `ORDER BY`, rows come out in no guaranteed order. `ORDER BY mark DESC` sorts from biggest to smallest (`ASC` = smallest first, the default). `LIMIT 3` keeps only the first 3 rows: perfect for a \"top 3\".", tip: "To break ties, sort by a second column: `ORDER BY mark DESC, name ASC`." },
    fr: { title: "SQL : ORDER BY et LIMIT", intro: "Sans `ORDER BY`, les lignes sortent dans un ordre non garanti. `ORDER BY mark DESC` trie du plus grand au plus petit (`ASC` = du plus petit, par défaut). `LIMIT 3` garde seulement les 3 premières lignes : parfait pour un « top 3 ».", tip: "Pour départager les égalités, trie par une deuxième colonne : `ORDER BY mark DESC, name ASC`." },
    shared: { fence: "sql", code: "-- the 3 best marks\nSELECT name, mark\nFROM students\nORDER BY mark DESC, name ASC\nLIMIT 3;" },
    more: { en: [["SQLBolt: filtering and sorting", "https://sqlbolt.com/lesson/filtering_sorting_query_results"], ["W3Schools: ORDER BY", "https://www.w3schools.com/sql/sql_orderby.asp"]], fr: [["sql.sh : ORDER BY", "https://sql.sh/cours/order-by"]] },
  },
  sql_agg: {
    en: { title: "SQL: COUNT, SUM, AVG", intro: "**Aggregate functions** turn many rows into one number: `COUNT(*)` counts rows, `SUM` adds, `AVG` gives the average, `MIN` and `MAX` the smallest and biggest. Like asking \"how many students?\" or \"what's the class average?\"", tip: "Give the result a readable name with `AS`: `AVG(mark) AS average`." },
    fr: { title: "SQL : COUNT, SUM, AVG", intro: "Les **fonctions d'agrégation** transforment beaucoup de lignes en un seul nombre : `COUNT(*)` compte les lignes, `SUM` additionne, `AVG` donne la moyenne, `MIN` et `MAX` le plus petit et le plus grand. Comme demander « combien d'élèves ? » ou « quelle est la moyenne de la classe ? »", tip: "Donne un nom lisible au résultat avec `AS` : `AVG(mark) AS moyenne`." },
    shared: { fence: "sql", code: "SELECT COUNT(*) AS students,\n       AVG(mark) AS average,\n       MAX(mark) AS best\nFROM students;" },
    more: { en: [["SQLBolt: aggregates", "https://sqlbolt.com/lesson/select_queries_with_aggregates"]], fr: [["sql.sh : fonctions d'agrégation", "https://sql.sh/fonctions/agregation"]] },
  },
  sql_group: {
    en: { title: "SQL: GROUP BY & HAVING", intro: "`GROUP BY` puts rows into piles (one pile per city, for example), then the aggregate is computed **for each pile**: the number of students per city. `HAVING` filters the piles afterwards (\"only cities with at least 2 students\").", tip: "`WHERE` filters rows **before** grouping; `HAVING` filters groups **after**." },
    fr: { title: "SQL : GROUP BY et HAVING", intro: "`GROUP BY` range les lignes en tas (un tas par ville, par exemple), puis l'agrégat est calculé **pour chaque tas** : le nombre d'élèves par ville. `HAVING` filtre les tas ensuite (« seulement les villes avec au moins 2 élèves »).", tip: "`WHERE` filtre les lignes **avant** le regroupement ; `HAVING` filtre les groupes **après**." },
    shared: { fence: "sql", code: "SELECT city, COUNT(*) AS n\nFROM students\nGROUP BY city\nHAVING COUNT(*) >= 2\nORDER BY n DESC;" },
    more: { en: [["SQLBolt: aggregates (part 2)", "https://sqlbolt.com/lesson/select_queries_with_aggregates_pt_2"], ["W3Schools: GROUP BY", "https://www.w3schools.com/sql/sql_groupby.asp"]], fr: [["sql.sh : GROUP BY", "https://sql.sh/cours/group-by"], ["sql.sh : HAVING", "https://sql.sh/cours/having"]] },
  },
  sql_join: {
    en: { title: "SQL: JOIN", intro: "Data is often split over several tables: students in one, their marks in another, linked by an id. A **JOIN** glues matching rows together, like matching each exam paper to the student who wrote it. `LEFT JOIN` keeps every row of the first table, even without a match.", tip: "Give tables short nicknames (`students s`) and always write the link with `ON`." },
    fr: { title: "SQL : jointures", intro: "Les données sont souvent réparties dans plusieurs tables : les élèves dans une, leurs notes dans une autre, reliées par un identifiant. Une **jointure** (`JOIN`) colle les lignes qui correspondent, comme associer chaque copie à l'élève qui l'a écrite. `LEFT JOIN` garde toutes les lignes de la première table, même sans correspondance.", tip: "Donne des petits surnoms aux tables (`students s`) et écris toujours le lien avec `ON`." },
    shared: { fence: "sql", code: "SELECT s.name, c.title, e.grade\nFROM enrollments e\nJOIN students s ON s.id = e.student_id\nJOIN courses c  ON c.id = e.course_id;" },
    more: { en: [["SQLBolt: JOINs", "https://sqlbolt.com/lesson/select_queries_with_joins"], ["W3Schools: JOIN", "https://www.w3schools.com/sql/sql_join.asp"]], fr: [["sql.sh : jointures", "https://sql.sh/cours/jointures"]] },
  },
  sql_sub: {
    en: { title: "SQL: subqueries", intro: "A **subquery** is a query inside another query, in parentheses. The inner one answers a small question first (\"what's the average mark?\"), the outer one uses the answer (\"who is above it?\").", tip: "Write and test the inner query alone first, then put it in parentheses." },
    fr: { title: "SQL : sous-requêtes", intro: "Une **sous-requête** est une requête dans une autre requête, entre parenthèses. Celle de l'intérieur répond d'abord à une petite question (« quelle est la moyenne ? »), celle de l'extérieur utilise la réponse (« qui est au-dessus ? »).", tip: "Écris et teste d'abord la requête intérieure toute seule, puis mets-la entre parenthèses." },
    shared: { fence: "sql", code: "SELECT name, mark\nFROM students\nWHERE mark > (SELECT AVG(mark) FROM students);" },
    more: { en: [["SQLBolt: subqueries", "https://sqlbolt.com/topic/subqueries"]], fr: [["sql.sh : sous-requêtes", "https://sql.sh/cours/sous-requete"]] },
  },
  sql_change: {
    en: { title: "SQL: INSERT, UPDATE, DELETE", intro: "`SELECT` only reads. To change data: `INSERT INTO` adds a row, `UPDATE … SET` modifies rows, `DELETE FROM` removes rows. These are permanent, so be careful!", tip: "Always put a `WHERE` on `UPDATE` and `DELETE`: without it, **every** row of the table is changed or deleted." },
    fr: { title: "SQL : INSERT, UPDATE, DELETE", intro: "`SELECT` ne fait que lire. Pour modifier les données : `INSERT INTO` ajoute une ligne, `UPDATE … SET` modifie des lignes, `DELETE FROM` supprime des lignes. C'est définitif, alors attention !", tip: "Mets toujours un `WHERE` sur `UPDATE` et `DELETE` : sans lui, **toutes** les lignes de la table sont modifiées ou supprimées." },
    shared: { fence: "sql", code: "INSERT INTO students (name, city, mark) VALUES ('Lina', 'Rabat', 15);\nUPDATE students SET mark = 16 WHERE name = 'Lina';\nDELETE FROM students WHERE name = 'Lina';" },
    more: { en: [["SQLBolt: inserting rows", "https://sqlbolt.com/lesson/inserting_rows"], ["SQLBolt: updating rows", "https://sqlbolt.com/lesson/updating_rows"]], fr: [["sql.sh : INSERT INTO", "https://sql.sh/cours/insert-into"], ["sql.sh : UPDATE", "https://sql.sh/cours/update"]] },
  },
  sql_design: {
    en: { title: "SQL: tables & keys", intro: "`CREATE TABLE` describes a table: its columns and their types (`INTEGER`, `TEXT`…). The **primary key** is a unique number for each row, like a student ID. A **foreign key** points to a row of another table: that's how tables are linked.", tip: "One table per kind of thing (students, courses), and never copy the same information in two places: link with ids instead." },
    fr: { title: "SQL : tables et clés", intro: "`CREATE TABLE` décrit une table : ses colonnes et leurs types (`INTEGER`, `TEXT`…). La **clé primaire** est un numéro unique pour chaque ligne, comme un numéro d'étudiant. Une **clé étrangère** pointe vers une ligne d'une autre table : c'est comme ça qu'on relie les tables.", tip: "Une table par sorte de chose (élèves, cours), et ne copie jamais la même information à deux endroits : relie avec des identifiants." },
    shared: { fence: "sql", code: "CREATE TABLE students (\n  id   INTEGER PRIMARY KEY,\n  name TEXT NOT NULL\n);\nCREATE TABLE marks (\n  id         INTEGER PRIMARY KEY,\n  student_id INTEGER REFERENCES students(id),\n  mark       REAL\n);" },
    more: { en: [["SQLBolt: creating tables", "https://sqlbolt.com/lesson/creating_tables"]], fr: [["sql.sh : CREATE TABLE", "https://sql.sh/cours/create-table"]] },
  },
  // ====================================================== MERN track
  node: {
    en: { title: "Node.js", intro: "**Node.js** runs JavaScript outside the browser, on your computer or a server. With it you can read files, build web servers and command-line tools. **npm** installs ready-made packages written by others (`npm install express`).", tip: "Run a file with `node file.js`, and keep your project's packages listed in `package.json` (`npm init -y` creates it)." },
    fr: { title: "Node.js", intro: "**Node.js** exécute du JavaScript en dehors du navigateur, sur ton ordinateur ou un serveur. Avec lui on peut lire des fichiers, créer des serveurs web et des outils en ligne de commande. **npm** installe des paquets tout prêts écrits par d'autres (`npm install express`).", tip: "Lance un fichier avec `node fichier.js`, et garde la liste des paquets du projet dans `package.json` (`npm init -y` le crée)." },
    shared: { fence: "js", code: "// hello.js: run it with  node hello.js\nconst fs = require(\"fs\");\nfs.writeFileSync(\"note.txt\", \"Hello from Node!\");\nconsole.log(fs.readFileSync(\"note.txt\", \"utf8\"));   // Hello from Node!" },
    more: { en: [["Node.js: introduction", "https://nodejs.org/learn/getting-started/introduction-to-nodejs"]], fr: [["Node.js : introduction (anglais)", "https://nodejs.org/learn/getting-started/introduction-to-nodejs"], ["MDN : Express et Node.js", "https://developer.mozilla.org/fr/docs/Learn_web_development/Extensions/Server-side/Express_Nodejs"]] },
  },
  express: {
    en: { title: "Express & REST APIs", intro: "**Express** builds web servers with Node.js. You write **routes**: \"when someone asks GET /api/students, answer with this list\". A **REST API** uses the HTTP verbs as actions: GET reads, POST creates, PUT updates, DELETE removes.", tip: "Test your API with your browser (GET) or a tool like Postman / Thunder Client (POST, PUT, DELETE)." },
    fr: { title: "Express et API REST", intro: "**Express** sert à créer des serveurs web avec Node.js. On écrit des **routes** : « quand quelqu'un demande GET /api/students, réponds avec cette liste ». Une **API REST** utilise les verbes HTTP comme actions : GET lit, POST crée, PUT modifie, DELETE supprime.", tip: "Teste ton API avec le navigateur (GET) ou un outil comme Postman / Thunder Client (POST, PUT, DELETE)." },
    shared: { fence: "js", code: "const express = require(\"express\");\nconst app = express();\napp.use(express.json());\n\nconst students = [{ id: 1, name: \"Lina\" }];\napp.get(\"/api/students\", (req, res) => res.json(students));\napp.post(\"/api/students\", (req, res) => {\n  students.push(req.body);\n  res.status(201).json(req.body);\n});\napp.listen(3000);" },
    more: { en: [["Express: hello world", "https://expressjs.com/en/starter/hello-world.html"], ["MDN: Express tutorial", "https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Server-side/Express_Nodejs"]], fr: [["Express : premier exemple", "https://expressjs.com/fr/starter/hello-world.html"], ["MDN : Express et Node.js", "https://developer.mozilla.org/fr/docs/Learn_web_development/Extensions/Server-side/Express_Nodejs"]] },
  },
  mongodb: {
    en: { title: "MongoDB", intro: "**MongoDB** stores data as **documents**: little JavaScript-like objects (`{ name: \"Lina\", mark: 15 }`) kept in **collections**. No fixed columns like SQL: each document can have its own fields. **Mongoose** adds a schema and easy functions to create and find documents.", tip: "Queries are objects too: `{ mark: { $gte: 10 } }` means \"mark ≥ 10\"." },
    fr: { title: "MongoDB", intro: "**MongoDB** range les données sous forme de **documents** : de petits objets comme en JavaScript (`{ name: \"Lina\", mark: 15 }`) rangés dans des **collections**. Pas de colonnes fixes comme en SQL : chaque document peut avoir ses propres champs. **Mongoose** ajoute un schéma et des fonctions simples pour créer et chercher des documents.", tip: "Les requêtes sont aussi des objets : `{ mark: { $gte: 10 } }` veut dire « note ≥ 10 »." },
    shared: { fence: "js", code: "const Student = mongoose.model(\"Student\", { name: String, mark: Number });\n\nawait Student.create({ name: \"Lina\", mark: 15 });\nconst passed = await Student.find({ mark: { $gte: 10 } });   // mark ≥ 10\nconsole.log(passed.length);" },
    more: { en: [["MongoDB: CRUD operations", "https://www.mongodb.com/docs/manual/crud/"]], fr: [["MongoDB : opérations CRUD (anglais)", "https://www.mongodb.com/docs/manual/crud/"]] },
  },
  react: {
    en: { title: "React", intro: "**React** builds web pages from **components**: small reusable pieces (a button, a card, a menu), each one a function that returns what to show (JSX, which looks like HTML). **State** (`useState`) is data a component remembers; when it changes, React redraws the component by itself.", tip: "Never change state directly (`count = 5`): always use its setter (`setCount(5)`), otherwise the page won't update." },
    fr: { title: "React", intro: "**React** construit les pages web avec des **composants** : de petites pièces réutilisables (un bouton, une carte, un menu), chacune étant une fonction qui renvoie ce qu'il faut afficher (du JSX, qui ressemble à du HTML). L'**état** (`useState`) est une donnée dont le composant se souvient ; quand elle change, React redessine le composant tout seul.", tip: "Ne modifie jamais l'état directement (`count = 5`) : utilise toujours sa fonction (`setCount(5)`), sinon la page ne se met pas à jour." },
    shared: { fence: "jsx", code: "import { useState } from \"react\";\n\nfunction Counter() {\n  const [count, setCount] = useState(0);\n  return (\n    <button onClick={() => setCount(count + 1)}>\n      Clicked {count} times\n    </button>\n  );\n}" },
    more: { en: [["react.dev: quick start", "https://react.dev/learn"]], fr: [["react.dev : démarrage rapide", "https://fr.react.dev/learn"]] },
  },
  // ================================================== AI & LLMs track
  ai_data: {
    en: { title: "Data with pandas", intro: "Before any AI, there is **data**. **pandas** loads tables (from CSV or Excel files) into a **DataFrame**: a table you can filter, sort and summarize with one line of Python. It's the first tool of every data scientist.", tip: "Start every new dataset with `df.head()` (first rows) and `df.describe()` (quick statistics)." },
    fr: { title: "Données avec pandas", intro: "Avant toute IA, il y a des **données**. **pandas** charge des tableaux (fichiers CSV ou Excel) dans un **DataFrame** : un tableau qu'on filtre, trie et résume en une ligne de Python. C'est le premier outil de tout data scientist.", tip: "Commence chaque nouveau jeu de données par `df.head()` (premières lignes) et `df.describe()` (statistiques rapides)." },
    shared: { fence: "py", code: "import pandas as pd\n\ndf = pd.DataFrame({\"name\": [\"Lina\", \"Omar\", \"Sara\"], \"mark\": [15, 9, 12]})\nprint(df[\"mark\"].mean())      # 12.0\nprint(df[df[\"mark\"] >= 10])   # Lina and Sara\n# from a file: df = pd.read_csv(\"marks.csv\")" },
    more: { en: [["pandas: getting started", "https://pandas.pydata.org/docs/getting_started/intro_tutorials/index.html"]], fr: [["pandas : premiers pas (anglais)", "https://pandas.pydata.org/docs/getting_started/intro_tutorials/index.html"]] },
  },
  ai_ml: {
    en: { title: "Machine learning basics", intro: "**Machine learning** means: show the computer many examples with the right answer, and it **learns a rule** by itself to answer new cases. We keep some examples aside (the **test set**) to check that the model really learned, instead of memorizing.", tip: "A model that is perfect on its training data but bad on the test set has memorized (**overfitting**)." },
    fr: { title: "Bases du machine learning", intro: "Le **machine learning**, c'est : montrer à l'ordinateur beaucoup d'exemples avec la bonne réponse, et il **apprend une règle** tout seul pour répondre à de nouveaux cas. On garde des exemples de côté (le **jeu de test**) pour vérifier que le modèle a vraiment appris, au lieu d'apprendre par cœur.", tip: "Un modèle parfait sur ses données d'entraînement mais mauvais sur le jeu de test a appris par cœur (**surapprentissage**)." },
    shared: { fence: "py", code: "from sklearn.datasets import load_iris\nfrom sklearn.model_selection import train_test_split\nfrom sklearn.tree import DecisionTreeClassifier\n\nX, y = load_iris(return_X_y=True)              # flowers and their species\nX_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0)\nmodel = DecisionTreeClassifier().fit(X_train, y_train)   # learn\nprint(model.score(X_test, y_test))             # about 0.97 (97% right)" },
    more: { en: [["scikit-learn: getting started", "https://scikit-learn.org/stable/getting_started.html"]], fr: [["scikit-learn : premiers pas (anglais)", "https://scikit-learn.org/stable/getting_started.html"]] },
  },
  ai_llm: {
    en: { title: "Using an LLM", intro: "A **large language model** (LLM, like the ones behind chatbots) predicts text: you give it a **prompt** (instructions + question) and it writes the continuation. In code, you send messages to a model and read its answer. The clearer the prompt, the better the answer.", tip: "A good prompt says who the model is, what you want, and the format: \"You are a math teacher. Explain fractions to a 10-year-old in 3 short sentences.\"" },
    fr: { title: "Utiliser un LLM", intro: "Un **grand modèle de langage** (LLM, comme ceux derrière les chatbots) prédit du texte : on lui donne un **prompt** (instructions + question) et il écrit la suite. En code, on envoie des messages à un modèle et on lit sa réponse. Plus le prompt est clair, meilleure est la réponse.", tip: "Un bon prompt dit qui est le modèle, ce que tu veux, et le format : « Tu es professeur de maths. Explique les fractions à un enfant de 10 ans en 3 phrases courtes. »" },
    shared: { fence: "py", code: "from transformers import pipeline\n\n# a small free model that runs on your computer\nchat = pipeline(\"text-generation\", model=\"Qwen/Qwen2.5-0.5B-Instruct\")\nmessages = [{\"role\": \"user\", \"content\": \"Explain a loop in one sentence.\"}]\nanswer = chat(messages, max_new_tokens=60)\nprint(answer[0][\"generated_text\"][-1][\"content\"])" },
    more: { en: [["Hugging Face: LLM course", "https://huggingface.co/learn/llm-course/chapter1/1"], ["Prompt Engineering Guide", "https://www.promptingguide.ai/"]], fr: [["Hugging Face : cours LLM (français)", "https://huggingface.co/learn/llm-course/fr/chapter1/1"], ["Guide du prompt engineering", "https://www.promptingguide.ai/fr"]] },
  },
  ai_rag: {
    en: { title: "Embeddings & RAG", intro: "An **embedding** turns a text into a list of numbers so that texts with similar meanings get similar numbers: the computer can find \"exam\" when you ask about \"test\". **RAG** (retrieval-augmented generation) uses this to find the right documents first, then gives them to the LLM so it answers from **your** documents instead of guessing.", tip: "If the right document isn't found in the first step, the LLM can't answer well: check what was retrieved before blaming the model." },
    fr: { title: "Embeddings et RAG", intro: "Un **embedding** transforme un texte en une liste de nombres, de sorte que des textes au sens proche ont des nombres proches : l'ordinateur trouve « examen » quand tu demandes « contrôle ». Le **RAG** (génération augmentée par la recherche) s'en sert pour trouver d'abord les bons documents, puis les donner au LLM pour qu'il réponde à partir de **tes** documents au lieu de deviner.", tip: "Si le bon document n'est pas trouvé à la première étape, le LLM ne peut pas bien répondre : regarde ce qui a été trouvé avant d'accuser le modèle." },
    shared: { fence: "py", code: "from sentence_transformers import SentenceTransformer, util\n\nmodel = SentenceTransformer(\"all-MiniLM-L6-v2\")\ndocs = [\"The exam is on Friday.\", \"The library opens at 8.\"]\nquestion = \"When is the test?\"\nscores = util.cos_sim(model.encode(question), model.encode(docs))[0]\nbest = docs[int(scores.argmax())]\nprint(best)   # The exam is on Friday.  → give it to the LLM with the question" },
    more: { en: [["Wikipedia: retrieval-augmented generation", "https://en.wikipedia.org/wiki/Retrieval-augmented_generation"], ["Hugging Face: LLM course", "https://huggingface.co/learn/llm-course/chapter1/1"]], fr: [["Wikipédia : génération augmentée de récupération", "https://fr.wikipedia.org/wiki/G%C3%A9n%C3%A9ration_augment%C3%A9e_de_r%C3%A9cup%C3%A9ration"], ["Hugging Face : cours LLM (français)", "https://huggingface.co/learn/llm-course/fr/chapter1/1"]] },
  },
};

/** The languages a lesson shows, in the class's order (falls back to the first available). */
function langsFor(lesson: Lesson, classLangs: string[]): Code[] {
  const avail = ORDER.filter((l) => lesson.code?.[l]);
  const wanted = classLangs.filter((l): l is Code => (ORDER as string[]).includes(l) && !!lesson.code?.[l]);
  return wanted.length ? wanted.slice(0, 1) : avail.slice(0, 1);   // one language at a time: the class's
}

/** Resources to read more: the class languages' tutorials first, then visual/neutral ones. */
export function lessonLinks(skill: string, lang: string, classLangs: string[]): Link[] {
  const l = LESSONS[skill];
  if (!l) return [];
  const fr = lang === "fr";
  const codes = classLangs.filter((c): c is Code => (ORDER as string[]).includes(c) && !!l.docs?.[c]).slice(0, 1);
  const out: Link[] = codes.map((c) => { const [site, url] = langLink(c, l.docs![c]!, fr); return [`${LABEL[c]} (${site})`, url]; });
  for (const m of (fr ? l.more?.fr : l.more?.en) ?? []) out.push(m);
  return out.slice(0, 4);
}

/** A built-in lesson for a class: explanation in `lang`, code in the class languages, links to read more. */
export function renderLesson(skill: string, lang: string, classLangs: string[]): string {
  const l = LESSONS[skill];
  if (!l) return "";
  const fr = lang === "fr";
  const T = fr ? l.fr : l.en;
  const langs = langsFor(l, classLangs);
  const blocks = l.shared
    ? ["```" + l.shared.fence + "\n" + l.shared.code + "\n```"]
    : langs.map((c) => (langs.length > 1 ? `**${LABEL[c]}**\n` : "") + "```" + FENCE[c] + "\n" + l.code![c] + "\n```");
  const links = lessonLinks(skill, lang, classLangs);
  return [
    `**${T.title}**`, T.intro, "", ...blocks,
    `💡 ${T.tip}`,
    links.length ? `\n📚 **${fr ? "Pour aller plus loin :" : "Learn more:"}** ${links.map(([label, url]) => `[${label}](${url})`).join(" · ")}` : "",
  ].filter((x) => x !== "").join("\n");
}
