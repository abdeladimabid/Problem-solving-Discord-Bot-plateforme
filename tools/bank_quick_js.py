"""Quick challenges in JAVASCRIPT (Node.js), English + French.

Same format as bank_quick.py. For "output" the answer is computed by really
running the code with Node.js. "check" is JavaScript run right after "code";
it must print "expect" (it proves the claim behind the question).
"""

QUICK_JS = [
    # =================================================================== EASY
    dict(kind="output", difficulty="easy", topic="equality", code="""console.log(1 == "1", 1 === "1", null == undefined, null === undefined);
console.log(NaN === NaN, [1] == 1);""",
         en=dict(title="Double or triple?", question="What does this code print? (both lines)",
                 hint="`==` converts types before comparing, `===` never does. NaN is special.",
                 explanation="`==` converts \"1\" to 1 and [1] to \"1\" then 1, so both are true. `===` compares type too. null == undefined is a special rule, but they are different types. NaN is never equal to anything, not even itself."),
         fr=dict(title="Double ou triple ?", question="Qu'affiche ce code ? (les deux lignes)",
                 hint="`==` convertit les types avant de comparer, `===` jamais. NaN est un cas spécial.",
                 explanation="`==` convertit \"1\" en 1 et [1] en \"1\" puis 1 : les deux sont vrais. `===` compare aussi le type. null == undefined est une règle spéciale, mais ce sont deux types différents. NaN n'est égal à rien, même pas à lui-même.")),
    dict(kind="output", difficulty="easy", topic="arrays", code="""const a = [1, 2, 3];
const b = a;
const c = [...a];
b.push(4);
c.push(5);
console.log(a.length, b.length, c.length, a === b);""",
         en=dict(title="Same box?", question="What does this code print?",
                 hint="Assigning an array copies the reference; spreading creates a new array.",
                 explanation="b is the same array as a, so push(4) changes both: length 4. [...a] makes a new array of 3, then 5 is added: length 4. a === b compares references: true."),
         fr=dict(title="Même boîte ?", question="Qu'affiche ce code ?",
                 hint="Affecter un tableau copie la référence ; le spread crée un nouveau tableau.",
                 explanation="b est le même tableau que a, donc push(4) modifie les deux : longueur 4. [...a] crée un nouveau tableau de 3, puis on ajoute 5 : longueur 4. a === b compare les références : true.")),
    dict(kind="output", difficulty="easy", topic="strings", code="""const s = "JavaScript";
console.log(s.slice(-6, -2), s.indexOf("a", 2), s.split("a").length);""",
         en=dict(title="Cut and count", question="What does this code print?",
                 hint="Negative slice indexes count from the end. indexOf's second argument is where the search starts.",
                 explanation="Length 10: slice(-6, -2) is slice(4, 8) = \"Scri\". The first \"a\" at index ≥ 2 is at 3. Splitting on the two \"a\" gives 3 pieces: \"J\", \"v\", \"Script\"."),
         fr=dict(title="Couper et compter", question="Qu'affiche ce code ?",
                 hint="Les indices négatifs de slice comptent depuis la fin. Le 2e argument d'indexOf est le point de départ.",
                 explanation="Longueur 10 : slice(-6, -2) = slice(4, 8) = \"Scri\". Le premier \"a\" à partir de l'indice 2 est en 3. Couper sur les deux \"a\" donne 3 morceaux : \"J\", \"v\", \"Script\".")),
    dict(kind="output", difficulty="easy", topic="loops", code="""let out = "";
for (let i = 0; i < 10; i++) {
  if (i % 2 === 0) continue;
  if (i > 6) break;
  out += i;
}
console.log(out, out.length);""",
         en=dict(title="Skip and stop", question="What does this code print?",
                 hint="`continue` skips the rest of this turn, `break` leaves the loop.",
                 explanation="Even numbers are skipped. 1, 3, 5 are added to the string. At 7, i > 6 so the loop stops. out is the string \"135\", of length 3."),
         fr=dict(title="Sauter et s'arrêter", question="Qu'affiche ce code ?",
                 hint="`continue` saute la fin de ce tour, `break` sort de la boucle.",
                 explanation="Les pairs sont sautés. 1, 3, 5 sont ajoutés à la chaîne. À 7, i > 6 donc la boucle s'arrête. out est la chaîne \"135\", de longueur 3.")),

    dict(kind="mcq", difficulty="easy", topic="variables", answer="C",
         choices=["`var` cannot be reassigned", "`let` is visible in the whole function", "`const` must be initialized when declared, and can't be reassigned", "`let` and `var` are exactly the same"],
         check='let r=[]; try { eval("const z;"); r.push("ok"); } catch(e) { r.push(e.name); } const o={a:1}; o.a=2; r.push(o.a); console.log(r.join(" "));', expect="SyntaxError 2",
         en=dict(title="Declare it right", question="Which statement about `var`, `let` and `const` is true?",
                 hint="Try `const x;` in your head. And remember `var` is the old one.",
                 explanation="`const` needs a value immediately and the binding can't be reassigned (an object it points to can still change). `var` is function-scoped and reassignable; `let` is block-scoped."),
         fr=dict(title="Bien déclarer", question="Quelle affirmation sur `var`, `let` et `const` est vraie ?",
                 hint="Essaie `const x;` dans ta tête. Et `var` est l'ancienne façon.",
                 explanation="`const` exige une valeur tout de suite et ne peut pas être réaffectée (un objet pointé peut encore changer). `var` a une portée de fonction et se réaffecte ; `let` a une portée de bloc."),
         fr_choices=["`var` ne peut pas être réaffectée", "`let` est visible dans toute la fonction", "`const` doit être initialisée à la déclaration et ne peut pas être réaffectée", "`let` et `var` sont exactement pareils"]),
    dict(kind="mcq", difficulty="easy", topic="types", answer="B",
         choices=['`typeof null === "null"`', '`typeof [] === "object"`', '`typeof NaN === "NaN"`', '`typeof function(){} === "object"`'],
         check='console.log(typeof null, typeof [], typeof NaN, typeof function(){})', expect="object object number function",
         en=dict(title="What type is it?", question="Which expression is `true`?",
                 hint="JavaScript has only a few typeof answers: \"number\", \"string\", \"boolean\", \"undefined\", \"object\", \"function\", \"symbol\", \"bigint\".",
                 explanation="Arrays are objects, so typeof [] is \"object\" (use Array.isArray). typeof null is also \"object\" (a historic bug), NaN is a \"number\", and functions are \"function\"."),
         fr=dict(title="Quel type ?", question="Quelle expression vaut `true` ?",
                 hint="typeof n'a que quelques réponses : \"number\", \"string\", \"boolean\", \"undefined\", \"object\", \"function\", \"symbol\", \"bigint\".",
                 explanation="Les tableaux sont des objets, donc typeof [] vaut \"object\" (utilise Array.isArray). typeof null vaut aussi \"object\" (un vieux bug), NaN est un \"number\", et une fonction donne \"function\".")),

    dict(kind="complexity", difficulty="easy", topic="loops", answer="C", code="""function f(arr) {
  let count = 0;
  for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < 5; j++) {
      count += arr[i] * j;
    }
  }
  return count;
}""",
         choices=["O(1)", "O(log n)", "O(n)", "O(n²)"],
         en=dict(title="Inner loop, fixed size", question="With n = arr.length, what is the time complexity of `f`?",
                 hint="How many times does the inner loop run, and does it depend on n?",
                 explanation="The inner loop always runs 5 times, a constant. The total is 5·n steps, which is O(n). Two nested loops are only O(n²) when both depend on n."),
         fr=dict(title="Boucle interne fixe", question="Avec n = arr.length, quelle est la complexité de `f` ?",
                 hint="Combien de tours fait la boucle interne, et dépend-elle de n ?",
                 explanation="La boucle interne fait toujours 5 tours, une constante. Le total est 5·n, donc O(n). Deux boucles imbriquées ne font O(n²) que si les deux dépendent de n.")),
    dict(kind="complexity", difficulty="easy", topic="arrays", answer="B", code="""function hasDuplicate(arr) {
  const seen = new Set();
  for (const x of arr) {
    if (seen.has(x)) return true;
    seen.add(x);
  }
  return false;
}""",
         choices=["O(n²)", "O(n)", "O(n log n)", "O(1)"],
         en=dict(title="Seen it before", question="What is the worst-case time complexity of `hasDuplicate` for an array of n elements?",
                 hint="What does a Set lookup cost on average?",
                 explanation="Set.has and Set.add take constant time on average, and each element is visited once: O(n). With `arr.includes` inside the loop instead, it would be O(n²)."),
         fr=dict(title="Déjà vu", question="Quelle est la complexité dans le pire cas de `hasDuplicate` pour un tableau de n éléments ?",
                 hint="Combien coûte une recherche dans un Set en moyenne ?",
                 explanation="Set.has et Set.add sont en temps constant en moyenne, et chaque élément est vu une fois : O(n). Avec `arr.includes` dans la boucle, ce serait O(n²).")),

    dict(kind="bug", difficulty="easy", topic="arrays", answer="A", code="""function average(nums) {
  let total = 0;
  for (let i = 0; i <= nums.length; i++) {
    total += nums[i];
  }
  return total / nums.length;
}
console.log(average([2, 4, 6]));""",
         check='', expect="NaN",
         en=dict(title="Average trouble", question="`average([2, 4, 6])` should print 4. What actually goes wrong?",
                 choices=["`i <= nums.length` reads one element too far: `nums[3]` is `undefined`, so the total becomes `NaN`", "`total` must be declared with `const`", "Division by `nums.length` is integer division in JavaScript", "`let i` is not visible inside the loop"],
                 hint="What is the last index of an array of length 3?",
                 explanation="Valid indexes are 0..length-1. With `<=` the loop also adds nums[3], which is undefined, and 12 + undefined is NaN. Use `i < nums.length`."),
         fr=dict(title="Moyenne en panne", question="`average([2, 4, 6])` devrait afficher 4. Qu'est-ce qui se passe vraiment ?",
                 choices=["`i <= nums.length` lit un élément de trop : `nums[3]` vaut `undefined`, donc le total devient `NaN`", "`total` doit être déclaré avec `const`", "La division par `nums.length` est entière en JavaScript", "`let i` n'est pas visible dans la boucle"],
                 hint="Quel est le dernier indice d'un tableau de longueur 3 ?",
                 explanation="Les indices valides vont de 0 à length-1. Avec `<=`, la boucle ajoute aussi nums[3], qui vaut undefined, et 12 + undefined donne NaN. Utilise `i < nums.length`.")),
    dict(kind="bug", difficulty="easy", topic="strings", answer="C", code="""function capitalize(word) {
  word[0] = word[0].toUpperCase();
  return word;
}
console.log(capitalize("hello"));""",
         check='', expect="hello",
         en=dict(title="Big first letter", question="`capitalize(\"hello\")` should return \"Hello\". What is wrong?",
                 choices=["`toUpperCase` only works on whole strings", "The function needs `return word[0]`", "Strings are immutable: assigning `word[0]` silently does nothing, so \"hello\" comes back unchanged", "`word[0]` is undefined for strings"],
                 hint="Can you change one character of a string in place?",
                 explanation="JavaScript strings can't be modified. `word[0] = ...` is ignored (outside strict mode) and the original string is returned. Build a new one: `word[0].toUpperCase() + word.slice(1)`."),
         fr=dict(title="Grande première lettre", question="`capitalize(\"hello\")` devrait renvoyer \"Hello\". Qu'est-ce qui ne va pas ?",
                 choices=["`toUpperCase` ne marche que sur des chaînes entières", "La fonction doit faire `return word[0]`", "Les chaînes sont immuables : affecter `word[0]` ne fait rien, \"hello\" revient inchangé", "`word[0]` vaut undefined pour une chaîne"],
                 hint="Peut-on modifier un caractère d'une chaîne sur place ?",
                 explanation="Les chaînes JavaScript ne se modifient pas. `word[0] = ...` est ignoré (hors mode strict) et la chaîne d'origine est renvoyée. Crée une nouvelle chaîne : `word[0].toUpperCase() + word.slice(1)`.")),

    # ================================================================= MEDIUM
    dict(kind="output", difficulty="medium", topic="closures", code="""const fns = [];
for (var i = 0; i < 3; i++) fns.push(() => i);
const gns = [];
for (let j = 0; j < 3; j++) gns.push(() => j);
console.log(fns.map(f => f()).join(","), gns.map(g => g()).join(","));""",
         en=dict(title="var vs let in loops", question="What does this code print?",
                 hint="How many `i` variables exist? How many `j`?",
                 explanation="`var i` is one variable shared by every arrow function; when they run, the loop is over and i is 3. `let j` creates a fresh binding for each iteration, so each function remembers its own j."),
         fr=dict(title="var ou let dans les boucles", question="Qu'affiche ce code ?",
                 hint="Combien de variables `i` existent ? Combien de `j` ?",
                 explanation="`var i` est une seule variable partagée par toutes les fonctions ; quand elles s'exécutent, la boucle est finie et i vaut 3. `let j` crée une nouvelle liaison à chaque tour : chaque fonction garde son propre j.")),
    dict(kind="output", difficulty="medium", topic="sorting", code="""const a = [10, 9, 1, 100, 25];
const b = [...a].sort();
const c = [...a].sort((x, y) => x - y);
console.log(b.join(" "));
console.log(c.join(" "));""",
         en=dict(title="Sort it out", question="What does this code print? (both lines)",
                 hint="Without a compare function, sort() converts the elements to strings.",
                 explanation="The default sort compares strings: \"1\" < \"10\" < \"100\" < \"25\" < \"9\". With (x, y) => x - y the numbers are compared as numbers."),
         fr=dict(title="Faire le tri", question="Qu'affiche ce code ? (les deux lignes)",
                 hint="Sans fonction de comparaison, sort() convertit les éléments en chaînes.",
                 explanation="Le tri par défaut compare des chaînes : \"1\" < \"10\" < \"100\" < \"25\" < \"9\". Avec (x, y) => x - y, les nombres sont comparés comme des nombres.")),
    dict(kind="output", difficulty="medium", topic="objects", code="""const user = { name: "Ana", tags: ["a"] };
const copy = { ...user };
copy.name = "Bo";
copy.tags.push("b");
const { name, tags: [first, second = "none"] } = user;
console.log(name, first, second, user.tags.length);""",
         en=dict(title="Shallow copy", question="What does this code print?",
                 hint="The spread copies the first level only. Then follow the destructuring carefully.",
                 explanation="{ ...user } copies the properties, but tags is still the same array, so push(\"b\") also changes user.tags. user.name stays \"Ana\". Destructuring gives first = \"a\" and second = \"b\" (the default is not used because there is a value)."),
         fr=dict(title="Copie superficielle", question="Qu'affiche ce code ?",
                 hint="Le spread ne copie que le premier niveau. Suis ensuite la déstructuration avec soin.",
                 explanation="{ ...user } copie les propriétés, mais tags est toujours le même tableau : push(\"b\") modifie aussi user.tags. user.name reste \"Ana\". La déstructuration donne first = \"a\" et second = \"b\" (la valeur par défaut n'est pas utilisée car il y a une valeur).")),
    dict(kind="output", difficulty="medium", topic="higher-order functions", code="""const r = ["1", "2", "3", "10"].map(parseInt);
const s = [1, 2, 3, 4].reduce((acc, x) => acc + (x % 2 ? x : -x), 10);
console.log(r.join(" "), s);""",
         en=dict(title="map(parseInt)", question="What does this code print?",
                 hint="map calls its function with (element, index, array). What is parseInt's second parameter?",
                 explanation="parseInt receives the index as the radix: parseInt(\"1\", 0) = 1 (radix 0 means 10), parseInt(\"2\", 1) = NaN (radix 1 is invalid), parseInt(\"3\", 2) = NaN (3 is not a binary digit), parseInt(\"10\", 3) = 3. The reduce does 10 + 1 - 2 + 3 - 4 = 8."),
         fr=dict(title="map(parseInt)", question="Qu'affiche ce code ?",
                 hint="map appelle sa fonction avec (élément, indice, tableau). Quel est le 2e paramètre de parseInt ?",
                 explanation="parseInt reçoit l'indice comme base : parseInt(\"1\", 0) = 1 (base 0 signifie 10), parseInt(\"2\", 1) = NaN (base 1 invalide), parseInt(\"3\", 2) = NaN (3 n'est pas un chiffre binaire), parseInt(\"10\", 3) = 3. Le reduce fait 10 + 1 - 2 + 3 - 4 = 8.")),

    dict(kind="mcq", difficulty="medium", topic="asynchronous", answer="D",
         choices=["`await` blocks the whole program until the promise settles", "An `async` function returns its value directly, not a promise", "`setTimeout(f, 0)` runs `f` immediately, before the next line", "`await` pauses only the current async function; other code keeps running"],
         check='const log=[]; async function f(){ log.push("a"); await null; log.push("c"); } const p=f(); log.push("b"); p.then(()=>console.log(log.join(""), typeof p.then));', expect="abc function",
         en=dict(title="What does await do?", question="Which statement about `async`/`await` is true?",
                 hint="Think of the event loop: is there one thread or many?",
                 explanation="`await` suspends only the async function it is in; the caller continues and the function resumes later from the microtask queue. An async function always returns a promise, and setTimeout callbacks run after the current code finishes."),
         fr=dict(title="Que fait await ?", question="Quelle affirmation sur `async`/`await` est vraie ?",
                 hint="Pense à la boucle d'événements : un seul fil ou plusieurs ?",
                 explanation="`await` suspend seulement la fonction async où il se trouve ; l'appelant continue et la fonction reprend plus tard via la file des micro-tâches. Une fonction async renvoie toujours une promesse, et les callbacks de setTimeout passent après le code en cours."),
         fr_choices=["`await` bloque tout le programme jusqu'à la fin de la promesse", "Une fonction `async` renvoie sa valeur directement, pas une promesse", "`setTimeout(f, 0)` exécute `f` immédiatement, avant la ligne suivante", "`await` met en pause seulement la fonction async en cours ; le reste du code continue"]),
    dict(kind="mcq", difficulty="medium", topic="this", answer="B",
         choices=["Arrow functions get `this` from the object that calls them", "Arrow functions don't have their own `this`: they use the `this` of the surrounding code", "`this` inside a regular function always refers to the function itself", "`bind` changes `this` for arrow functions"],
         check='const o={v:1, reg(){ return this && this.v; }, arr: () => typeof this}; const f=o.reg; const g=(()=>this).bind({v:9}); console.log(o.reg(), f(), o.arr(), g()===this);', expect="1 undefined object true",
         en=dict(title="Who is this?", question="Which statement about `this` is true?",
                 hint="Arrow functions were designed to keep the outer `this`, for example inside callbacks.",
                 explanation="An arrow function has no `this` of its own; it uses the `this` where it was defined, and even bind/call can't change it. A regular function's `this` depends on how it is called (o.reg() vs f())."),
         fr=dict(title="Qui est this ?", question="Quelle affirmation sur `this` est vraie ?",
                 hint="Les fonctions fléchées ont été conçues pour garder le `this` extérieur, par exemple dans les callbacks.",
                 explanation="Une fonction fléchée n'a pas son propre `this` : elle utilise le `this` de l'endroit où elle est définie, et même bind/call ne le changent pas. Le `this` d'une fonction classique dépend de la façon dont on l'appelle (o.reg() ou f())."),
         fr_choices=["Les fonctions fléchées prennent `this` de l'objet qui les appelle", "Les fonctions fléchées n'ont pas leur propre `this` : elles utilisent celui du code qui les entoure", "Dans une fonction classique, `this` désigne toujours la fonction elle-même", "`bind` change le `this` des fonctions fléchées"]),

    dict(kind="complexity", difficulty="medium", topic="arrays", answer="C", code="""function uniqueSorted(arr) {
  const out = [];
  for (const x of arr) {
    if (!out.includes(x)) out.push(x);
  }
  return out.sort((a, b) => a - b);
}""",
         choices=["O(n)", "O(n log n)", "O(n²)", "O(n² log n)"],
         en=dict(title="includes in a loop", question="Worst case, with n = arr.length (all values different), what is the time complexity?",
                 hint="`includes` scans the array it's called on. How big does `out` get?",
                 explanation="When every value is new, out grows to n elements and each `includes` scans all of it: 0 + 1 + … + (n-1) ≈ n²/2 steps. The final sort is O(n log n), which is smaller. Total: O(n²). A Set would make it O(n log n)."),
         fr=dict(title="includes dans une boucle", question="Dans le pire cas, avec n = arr.length (toutes les valeurs différentes), quelle est la complexité ?",
                 hint="`includes` parcourt le tableau sur lequel on l'appelle. Quelle taille atteint `out` ?",
                 explanation="Si chaque valeur est nouvelle, out atteint n éléments et chaque `includes` le parcourt entièrement : 0 + 1 + … + (n-1) ≈ n²/2 étapes. Le tri final est en O(n log n), plus petit. Total : O(n²). Un Set donnerait O(n log n).")),
    dict(kind="complexity", difficulty="medium", topic="strings", answer="B", code="""function countPairs(s) {
  // s has n characters
  let pairs = 0;
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 1; j < s.length; j *= 2) {
      if (s[i] === s[j]) pairs++;
    }
  }
  return pairs;
}""",
         choices=["O(n²)", "O(n log n)", "O(n)", "O(log n)"],
         en=dict(title="Doubling inside", question="What is the time complexity of `countPairs`?",
                 hint="How many values does j take when it doubles each time, up to n?",
                 explanation="For each i, j goes i+1, 2(i+1), 4(i+1)… until n: at most about log₂ n steps. n outer turns × log n inner turns = O(n log n)."),
         fr=dict(title="Doublement à l'intérieur", question="Quelle est la complexité de `countPairs` ?",
                 hint="Combien de valeurs prend j s'il double à chaque tour jusqu'à n ?",
                 explanation="Pour chaque i, j vaut i+1, 2(i+1), 4(i+1)… jusqu'à n : au plus environ log₂ n étapes. n tours extérieurs × log n tours intérieurs = O(n log n).")),

    dict(kind="bug", difficulty="medium", topic="asynchronous", answer="B", code="""function loadAll(ids) {
  const results = [];
  ids.forEach(async (id) => {
    const value = await fetchValue(id);   // returns a promise
    results.push(value);
  });
  return results;
}""",
         check='async function fetchValue(id){ return id * 10; } const r = loadAll([1, 2, 3]); console.log(r.length);', expect="0",
         en=dict(title="Empty results", question="`loadAll([1, 2, 3])` returns an empty array. Why?",
                 choices=["`fetchValue` must be called without `await`", "`forEach` doesn't wait for async callbacks: `results` is returned before any `await` finishes", "`results` is a `const`, so `push` fails silently", "Arrow functions can't be `async`"],
                 hint="What does forEach do with the promise each callback returns?",
                 explanation="forEach ignores the promises returned by the async callbacks; it finishes immediately and the function returns the still-empty array. Use `return Promise.all(ids.map(fetchValue))` in an async function, or a `for...of` loop with await."),
         fr=dict(title="Résultats vides", question="`loadAll([1, 2, 3])` renvoie un tableau vide. Pourquoi ?",
                 choices=["`fetchValue` doit être appelée sans `await`", "`forEach` n'attend pas les callbacks async : `results` est renvoyé avant la fin de chaque `await`", "`results` est un `const`, donc `push` échoue sans rien dire", "Les fonctions fléchées ne peuvent pas être `async`"],
                 hint="Que fait forEach de la promesse renvoyée par chaque callback ?",
                 explanation="forEach ignore les promesses renvoyées par les callbacks async ; il se termine tout de suite et la fonction renvoie le tableau encore vide. Utilise `return Promise.all(ids.map(fetchValue))` dans une fonction async, ou une boucle `for...of` avec await.")),
    dict(kind="bug", difficulty="medium", topic="numbers", answer="A", code="""function total(prices) {
  let sum = 0;
  for (const p of prices) sum += p;
  return sum === 0.6 ? "exact" : "wrong";
}
console.log(total([0.1, 0.2, 0.3]));""",
         check='', expect="wrong",
         en=dict(title="Floating money", question="`total([0.1, 0.2, 0.3])` prints \"wrong\". Why?",
                 choices=["Decimal numbers are stored in binary floating point, so the sum is 0.6000000000000001, not exactly 0.6", "`for...of` skips the last element", "`===` can't compare numbers", "`sum` starts at 0 instead of 0.0"],
                 hint="Try 0.1 + 0.2 in the console.",
                 explanation="0.1, 0.2 and 0.3 have no exact binary representation, so the sum is 0.6000000000000001. Compare with a tolerance (`Math.abs(a - b) < 1e-9`) or work in cents with integers."),
         fr=dict(title="Argent flottant", question="`total([0.1, 0.2, 0.3])` affiche \"wrong\". Pourquoi ?",
                 choices=["Les décimaux sont stockés en virgule flottante binaire : la somme vaut 0.6000000000000001, pas exactement 0.6", "`for...of` saute le dernier élément", "`===` ne peut pas comparer des nombres", "`sum` commence à 0 au lieu de 0.0"],
                 hint="Essaie 0.1 + 0.2 dans la console.",
                 explanation="0.1, 0.2 et 0.3 n'ont pas de représentation binaire exacte : la somme vaut 0.6000000000000001. Compare avec une tolérance (`Math.abs(a - b) < 1e-9`) ou calcule en centimes avec des entiers.")),
    dict(kind="bug", difficulty="medium", topic="objects", answer="D", code="""function countWords(text) {
  const counts = {};
  for (const w of text.split(" ")) {
    counts[w] = counts[w] + 1 || 1;
  }
  return counts;
}
console.log(countWords("constructor of the class").constructor);""",
         check='const r = countWords("the constructor"); console.log(typeof r.constructor, r.the);', expect="string 1",
         en=dict(title="Word count surprise", question="`countWords(\"the constructor\")` should give `{ the: 1, constructor: 1 }`, but `counts.constructor` is a strange string. What is the real problem?",
                 choices=["`split(\" \")` keeps the spaces", "`|| 1` should be `?? 1`", "Objects can't have more than one key", "A plain `{}` inherits keys like `constructor` from `Object.prototype`, so `counts[\"constructor\"]` already exists: use a `Map` or `Object.create(null)`"],
                 hint="Is `counts[\"constructor\"]` really undefined before the first word?",
                 explanation="{} has a prototype, so counts.constructor is the Object function. Adding 1 concatenates its source code with \"1\". Words like constructor, toString or __proto__ break plain-object counters; a Map (or Object.create(null)) has no inherited keys."),
         fr=dict(title="Comptage surprise", question="`countWords(\"the constructor\")` devrait donner `{ the: 1, constructor: 1 }`, mais `counts.constructor` est une chaîne bizarre. Quel est le vrai problème ?",
                 choices=["`split(\" \")` garde les espaces", "`|| 1` devrait être `?? 1`", "Un objet ne peut pas avoir plus d'une clé", "Un `{}` hérite de clés comme `constructor` depuis `Object.prototype`, donc `counts[\"constructor\"]` existe déjà : utilise une `Map` ou `Object.create(null)`"],
                 hint="`counts[\"constructor\"]` vaut-il vraiment undefined avant le premier mot ?",
                 explanation="{} a un prototype, donc counts.constructor est la fonction Object. Lui ajouter 1 concatène son code source avec \"1\". Des mots comme constructor, toString ou __proto__ cassent les compteurs en objet simple ; une Map (ou Object.create(null)) n'a pas de clés héritées.")),

    # =================================================================== HARD
    dict(kind="output", difficulty="hard", topic="event loop", code="""const log = [];
setTimeout(() => log.push("timeout"), 0);
Promise.resolve().then(() => log.push("micro1")).then(() => log.push("micro2"));
(async () => {
  log.push("async-start");
  await null;
  log.push("after-await");
})();
queueMicrotask(() => log.push("qm"));
log.push("sync");
setTimeout(() => console.log(log.join(" ")), 10);""",
         en=dict(title="Event loop order", question="What does this code print?",
                 hint="Synchronous code first, then ALL microtasks (in the order they were queued, including new ones), then timers.",
                 explanation="Sync: async-start (the async body runs immediately until await), then sync. Microtasks in queue order: micro1, after-await, qm; micro1's then queues micro2, which runs before any timer. Then the timeout."),
         fr=dict(title="Ordre de la boucle d'événements", question="Qu'affiche ce code ?",
                 hint="D'abord le code synchrone, puis TOUTES les micro-tâches (dans l'ordre, y compris les nouvelles), puis les timers.",
                 explanation="Synchrone : async-start (le corps async s'exécute jusqu'au await), puis sync. Micro-tâches dans l'ordre : micro1, after-await, qm ; le then de micro1 ajoute micro2, qui passe avant tout timer. Puis le timeout.")),
    dict(kind="output", difficulty="hard", topic="hoisting", code="""var x = 1;
function f() {
  console.log(x);
  if (false) { var x = 2; }
  return typeof g + " " + typeof h;
  function g() {}
  var h = function () {};
}
console.log(f());
try { console.log(y); let y = 3; } catch (e) { console.log(e.name); }""",
         en=dict(title="Hoisted", question="What does this code print? (3 lines)",
                 hint="`var` declarations and function declarations are moved to the top of their function. `let` is in a temporal dead zone until its line.",
                 explanation="Inside f, `var x` is hoisted (even in an `if (false)`), so the local x shadows the global one and is undefined. g is a hoisted function declaration; h is declared but the assignment never runs (after return), so it's undefined. Reading y before `let y` throws a ReferenceError."),
         fr=dict(title="Remontée", question="Qu'affiche ce code ? (3 lignes)",
                 hint="Les déclarations `var` et les déclarations de fonctions remontent en haut de leur fonction. `let` est en zone morte temporaire jusqu'à sa ligne.",
                 explanation="Dans f, `var x` est remontée (même dans un `if (false)`), donc le x local masque le global et vaut undefined. g est une déclaration de fonction remontée ; h est déclarée mais l'affectation n'a jamais lieu (après le return) : undefined. Lire y avant `let y` lève une ReferenceError.")),
    dict(kind="output", difficulty="hard", topic="generators", code="""function* counter() {
  let n = 0;
  while (true) {
    const reset = yield n++;
    if (reset) n = 10;
  }
}
const it = counter();
const out = [it.next().value, it.next().value, it.next(true).value, it.next().value];
const [a, , b] = counter();
console.log(out.join(","), a, b);""",
         en=dict(title="Talking to a generator", question="What does this code print?",
                 hint="The value passed to next(v) becomes the result of the `yield` where the generator is paused. Destructuring also pulls values from an iterator.",
                 explanation="next() → 0, next() → 1 (n is now 2), next(true): the paused yield returns true so n becomes 10, then it yields 10 (n is 11), next() → 11. Destructuring takes values 0, 1, 2 and keeps the 1st and 3rd: 0 and 2."),
         fr=dict(title="Parler à un générateur", question="Qu'affiche ce code ?",
                 hint="La valeur passée à next(v) devient le résultat du `yield` où le générateur est en pause. La déstructuration lit aussi un itérateur.",
                 explanation="next() → 0, next() → 1 (n vaut 2), next(true) : le yield en pause renvoie true donc n devient 10, puis il produit 10 (n vaut 11), next() → 11. La déstructuration prend 0, 1, 2 et garde le 1er et le 3e : 0 et 2.")),
    dict(kind="output", difficulty="hard", topic="coercion", code="""console.log([] + {}, [1, 2] + [3], true + "1" - 1);
console.log([10, 1, 3].sort() + "", ("b" + "a" + +"a" + "a").toLowerCase());""",
         en=dict(title="Coercion madness", question="What does this code print? (2 lines)",
                 hint="`+` with a string or object concatenates; `-` and unary `+` always convert to numbers.",
                 explanation="[] + {} → \"\" + \"[object Object]\". [1, 2] + [3] → \"1,2\" + \"3\" = \"1,23\". true + \"1\" is \"true1\", minus 1 is NaN. Default sort is by string: 1, 10, 3. +\"a\" is NaN, so the word becomes \"baNaNa\", lowercased \"banana\"."),
         fr=dict(title="Folie des conversions", question="Qu'affiche ce code ? (2 lignes)",
                 hint="`+` avec une chaîne ou un objet concatène ; `-` et le `+` unaire convertissent toujours en nombre.",
                 explanation="[] + {} → \"\" + \"[object Object]\". [1, 2] + [3] → \"1,2\" + \"3\" = \"1,23\". true + \"1\" donne \"true1\", moins 1 donne NaN. Le tri par défaut est textuel : 1, 10, 3. +\"a\" vaut NaN, donc le mot devient \"baNaNa\", en minuscules \"banana\".")),

    dict(kind="mcq", difficulty="hard", topic="prototypes", answer="A",
         choices=["`Object.getPrototypeOf(d) === Dog.prototype`, and `speak` is found on `Animal.prototype` through the chain", "`speak` is copied into `d` when it is created", "`class Dog extends Animal` copies every method of Animal into Dog", "`d.hasOwnProperty(\"speak\")` is `true`"],
         check='class Animal { speak(){ return "..." } } class Dog extends Animal {} const d = new Dog(); console.log(Object.getPrototypeOf(d) === Dog.prototype, d.hasOwnProperty("speak"), Object.getPrototypeOf(Dog.prototype) === Animal.prototype, Dog.prototype.hasOwnProperty("speak"));', expect="true false true false",
         en=dict(title="Under the class", question="With `class Animal { speak() {} }`, `class Dog extends Animal {}` and `const d = new Dog()`, which statement is true?",
                 hint="Classes are syntax over prototypes. Where do methods live?",
                 explanation="Methods live on the prototype objects, not on instances or subclasses. d → Dog.prototype → Animal.prototype (which has speak) → Object.prototype. Nothing is copied, so d has no own `speak`."),
         fr=dict(title="Sous la classe", question="Avec `class Animal { speak() {} }`, `class Dog extends Animal {}` et `const d = new Dog()`, quelle affirmation est vraie ?",
                 hint="Les classes sont une syntaxe au-dessus des prototypes. Où vivent les méthodes ?",
                 explanation="Les méthodes vivent sur les objets prototypes, pas sur les instances ni les sous-classes. d → Dog.prototype → Animal.prototype (qui a speak) → Object.prototype. Rien n'est copié : d n'a pas de `speak` propre."),
         fr_choices=["`Object.getPrototypeOf(d) === Dog.prototype`, et `speak` est trouvée sur `Animal.prototype` via la chaîne", "`speak` est copiée dans `d` à sa création", "`class Dog extends Animal` copie toutes les méthodes d'Animal dans Dog", "`d.hasOwnProperty(\"speak\")` vaut `true`"]),
    dict(kind="mcq", difficulty="hard", topic="promises", answer="C",
         choices=["`Promise.all` returns the results in the order the promises finish", "`Promise.all` waits for every promise, even after one rejects, and then rejects", "`Promise.all` rejects as soon as one promise rejects, but the other promises keep running", "`Promise.allSettled` rejects if any promise rejects"],
         check='const log=[]; const slow = new Promise(r => setTimeout(() => { log.push("slow done"); r(2); }, 30)); const fast = new Promise((_, j) => setTimeout(() => j(new Error("x")), 5)); Promise.all([slow, fast]).catch(e => log.push("rejected")); Promise.all([new Promise(r=>setTimeout(()=>r("a"),20)), Promise.resolve("b")]).then(v => log.push(v.join(""))); setTimeout(() => console.log(log.join(", ")), 60);', expect="rejected, ab, slow done",
         en=dict(title="All or nothing", question="Which statement about `Promise.all` is true?",
                 hint="A promise can't be cancelled.",
                 explanation="Promise.all rejects with the first rejection, immediately, but nothing stops the other operations: they finish in the background. When everything succeeds, results keep the input order, not the finishing order. allSettled never rejects."),
         fr=dict(title="Tout ou rien", question="Quelle affirmation sur `Promise.all` est vraie ?",
                 hint="Une promesse ne peut pas être annulée.",
                 explanation="Promise.all est rejetée dès le premier rejet, mais rien n'arrête les autres opérations : elles se terminent en arrière-plan. Quand tout réussit, les résultats gardent l'ordre d'entrée, pas l'ordre de fin. allSettled n'est jamais rejetée."),
         fr_choices=["`Promise.all` renvoie les résultats dans l'ordre où les promesses se terminent", "`Promise.all` attend toutes les promesses, même après un rejet, puis échoue", "`Promise.all` est rejetée dès qu'une promesse échoue, mais les autres continuent de s'exécuter", "`Promise.allSettled` est rejetée si une promesse échoue"]),

    dict(kind="complexity", difficulty="hard", topic="strings", answer="D", code="""function build(n) {
  let s = "";
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.unshift(String(i % 10));   // add at the front
  }
  for (let i = 0; i < n; i++) {
    s = parts.slice(0, i).join("").length + s.slice(0, 1);
  }
  return s;
}""",
         choices=["O(n)", "O(n log n)", "O(n²) for the first loop only", "O(n²): both loops are quadratic"],
         en=dict(title="Hidden costs", question="What is the time complexity of `build(n)`?",
                 hint="What does `unshift` do to the other elements? What does `slice(0, i).join(\"\")` cost?",
                 explanation="unshift shifts every existing element one place: 1 + 2 + … + n = O(n²). In the second loop, slice(0, i) and join copy i elements each time: also O(n²). Both loops are quadratic; the total is O(n²)."),
         fr=dict(title="Coûts cachés", question="Quelle est la complexité de `build(n)` ?",
                 hint="Que fait `unshift` aux autres éléments ? Combien coûte `slice(0, i).join(\"\")` ?",
                 explanation="unshift décale tous les éléments existants d'une case : 1 + 2 + … + n = O(n²). Dans la deuxième boucle, slice(0, i) et join copient i éléments à chaque tour : aussi O(n²). Les deux boucles sont quadratiques ; le total est O(n²)."),
         fr_choices=["O(n)", "O(n log n)", "O(n²) pour la première boucle seulement", "O(n²) : les deux boucles sont quadratiques"]),
    dict(kind="complexity", difficulty="hard", topic="recursion", answer="B", code="""const memo = new Map();
function ways(n, k) {        // number of ways to climb n steps, 1..k at a time
  if (n === 0) return 1;
  if (n < 0) return 0;
  const key = n + "," + k;
  if (memo.has(key)) return memo.get(key);
  let total = 0;
  for (let s = 1; s <= k; s++) total += ways(n - s, k);
  memo.set(key, total);
  return total;
}""",
         choices=["O(kⁿ)", "O(n·k)", "O(n + k)", "O(n²·k)"],
         en=dict(title="Memoized stairs", question="For one call `ways(n, k)` on an empty memo, what is the time complexity?",
                 hint="k never changes. How many different keys can be stored, and what does each one cost the first time?",
                 explanation="k is fixed, so there are at most n + 1 distinct states (n, n-1, …, 0). Each is computed once with a loop of k calls (later calls hit the memo in O(1)): O(n·k). Without the memo it would be exponential, O(kⁿ)."),
         fr=dict(title="Escaliers mémoïsés", question="Pour un appel `ways(n, k)` avec un memo vide, quelle est la complexité ?",
                 hint="k ne change jamais. Combien de clés différentes peuvent être stockées, et combien coûte chacune la première fois ?",
                 explanation="k est fixe, donc il y a au plus n + 1 états distincts (n, n-1, …, 0). Chacun est calculé une fois avec une boucle de k appels (les appels suivants trouvent le memo en O(1)) : O(n·k). Sans memo ce serait exponentiel, O(kⁿ).")),

    dict(kind="bug", difficulty="hard", topic="closures", answer="C", code="""function makeCounters(n) {
  const counters = [];
  for (var i = 0; i < n; i++) {
    counters.push({ id: i, next: () => ++i });
  }
  return counters;
}
const cs = makeCounters(3);
console.log(cs[0].next(), cs[1].next(), cs[0].id);""",
         check='', expect="4 5 0",
         en=dict(title="Shared counter", question="Each counter should count on its own, starting from its id: `cs[0].next()` → 1, `cs[1].next()` → 2. Instead it prints `4 5 0`. Why?",
                 choices=["`++i` should be `i++`", "Objects can't contain arrow functions", "All the arrow functions close over the SAME `var i`, which is 3 after the loop, and they all increment it", "`id: i` is evaluated after the loop ends"],
                 hint="How many variables named `i` exist with `var`? Why is `id` correct but `next` not?",
                 explanation="`id: i` is copied immediately (0, 1, 2), but the arrow functions capture the single function-scoped `var i`, which ends at 3. Each next() increments that shared variable: 4, then 5. Use `let` and a separate variable per counter: `let c = i; next: () => ++c`."),
         fr=dict(title="Compteur partagé", question="Chaque compteur devrait compter seul à partir de son id : `cs[0].next()` → 1, `cs[1].next()` → 2. Ça affiche `4 5 0`. Pourquoi ?",
                 choices=["`++i` devrait être `i++`", "Un objet ne peut pas contenir de fonction fléchée", "Toutes les fonctions fléchées capturent le MÊME `var i`, qui vaut 3 après la boucle, et l'incrémentent toutes", "`id: i` est évalué après la fin de la boucle"],
                 hint="Combien de variables `i` existent avec `var` ? Pourquoi `id` est correct mais pas `next` ?",
                 explanation="`id: i` est copié tout de suite (0, 1, 2), mais les fonctions fléchées capturent l'unique `var i` de la fonction, qui finit à 3. Chaque next() incrémente cette variable partagée : 4, puis 5. Utilise `let` et une variable par compteur : `let c = i; next: () => ++c`.")),
    dict(kind="bug", difficulty="hard", topic="algorithms", answer="B", code="""function binarySearch(arr, target) {
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (arr[mid] < target) lo = mid;
    else hi = mid;
  }
  return arr[lo] === target ? lo : -1;
}""",
         check='const t0 = Date.now(); let r = []; for (const [a, x] of [[[1, 3, 5, 7], 7], [[2, 4], 4]]) { let lo = 0, hi = a.length - 1, steps = 0; while (lo < hi && steps < 1000) { const mid = Math.floor((lo + hi) / 2); if (a[mid] < x) lo = mid; else hi = mid; steps++; } r.push(steps); } console.log(r.join(" "));', expect="1000 1000",
         en=dict(title="Search forever", question="`binarySearch([2, 4], 4)` never returns. What is the bug?",
                 choices=["`hi` should start at `arr.length`", "When `arr[mid] < target`, `lo = mid` can leave `lo` unchanged (mid rounds down), so the loop never ends: it must be `lo = mid + 1`", "`Math.floor` should be `Math.ceil` in the `else` branch only", "The loop must be `while (lo <= hi)` and nothing else"],
                 hint="Run it by hand with lo = 0, hi = 1. What is mid? What is lo after the step?",
                 explanation="With lo = 0 and hi = 1, mid = 0. Since arr[0] < target, lo = mid = 0 again: no progress, infinite loop. Discarding mid itself (`lo = mid + 1`) guarantees the range shrinks every iteration."),
         fr=dict(title="Recherche sans fin", question="`binarySearch([2, 4], 4)` ne termine jamais. Quel est le bug ?",
                 choices=["`hi` devrait commencer à `arr.length`", "Quand `arr[mid] < target`, `lo = mid` peut laisser `lo` inchangé (mid est arrondi vers le bas) : la boucle ne finit jamais, il faut `lo = mid + 1`", "Il faut `Math.ceil` seulement dans la branche `else`", "Il suffit d'écrire `while (lo <= hi)`"],
                 hint="Déroule-le à la main avec lo = 0, hi = 1. Que vaut mid ? Et lo après le tour ?",
                 explanation="Avec lo = 0 et hi = 1, mid = 0. Comme arr[0] < target, lo = mid = 0 encore : aucun progrès, boucle infinie. Exclure mid (`lo = mid + 1`) garantit que l'intervalle rétrécit à chaque tour.")),
    dict(kind="bug", difficulty="hard", topic="objects", answer="A", code="""function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
const event = { title: "Exam", date: new Date(2026, 5, 1), attendees: new Set(["ana"]), score: NaN };
const copy = deepClone(event);
console.log(typeof copy.date, copy.attendees, copy.score);""",
         check='', expect="string {} null",
         en=dict(title="Clone gone wrong", question="Why is `deepClone` wrong for this object?",
                 choices=["JSON can't represent Dates, Sets or NaN: the Date becomes a string, the Set becomes `{}` and NaN becomes `null`", "`JSON.stringify` throws on nested objects", "`JSON.parse` returns the same object, not a copy", "It works, but it's slow"],
                 hint="What does JSON know about? Strings, numbers, booleans, null, arrays, plain objects…",
                 explanation="JSON only has strings, finite numbers, booleans, null, arrays and plain objects. A Date is serialized as an ISO string, a Set has no enumerable properties ({}), and NaN/Infinity become null. Use `structuredClone(obj)`."),
         fr=dict(title="Clone raté", question="Pourquoi `deepClone` est-elle fausse pour cet objet ?",
                 choices=["JSON ne sait pas représenter les Date, Set ou NaN : la date devient une chaîne, le Set devient `{}` et NaN devient `null`", "`JSON.stringify` plante sur les objets imbriqués", "`JSON.parse` renvoie le même objet, pas une copie", "Ça marche, mais c'est lent"],
                 hint="Que connaît JSON ? Chaînes, nombres, booléens, null, tableaux, objets simples…",
                 explanation="JSON ne connaît que les chaînes, les nombres finis, les booléens, null, les tableaux et les objets simples. Une Date devient une chaîne ISO, un Set n'a pas de propriétés énumérables ({}), et NaN/Infinity deviennent null. Utilise `structuredClone(obj)`.")),
]
