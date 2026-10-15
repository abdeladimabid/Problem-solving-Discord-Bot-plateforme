// Ready-made boss battles: a story told like a tabletop RPG and a write-code problem already checked
// (the reference solution agrees with a brute force on the small tests; the big tests run in about a second).
// Used from the boss dialog ("📚 Ready-made bosses") and when the AI cannot produce a problem.

export interface BankLore { intro: string; hits: string[]; bloodied: string; dying: string; victory: string; escape: string }
export interface BankBoss {
  id: string; skill: string; difficulty: "easy" | "medium" | "hard"; emoji: string;
  name: Record<"fr" | "en", string>; title: Record<"fr" | "en", string>; statement: Record<"fr" | "en", string>; hint: Record<"fr" | "en", string>;
  lore: Record<"fr" | "en", BankLore>; solution: string;
  tests: { input: string | null; gen: string | null; expected: string; sample: number }[];
}

export const BOSS_BANK: BankBoss[] = [
 {
  "id": "atlas-dragon",
  "skill": "prefix",
  "difficulty": "hard",
  "emoji": "🐉",
  "name": {
   "fr": "Azgar, le Dragon de l'Atlas",
   "en": "Azgar, the Atlas Dragon"
  },
  "title": {
   "fr": "Le trésor d'Azgar",
   "en": "Azgar's hoard"
  },
  "statement": {
   "fr": "Sous les cimes de l'Atlas dort **Azgar**, un dragon assis sur une rangée de **n** coffres d'or. Pour l'affaiblir, votre compagnie doit savoir où frapper : chaque éclaireur revient avec une zone, du coffre **l** au coffre **r**, et l'or de cette zone est la force que le dragon y puise.\n\nVous recevez **q** zones. Trouvez la zone qui contient **le plus d'or** : c'est là que la compagnie frappera. En cas d'égalité, prenez celle qui a été donnée en premier.\n\n**Input**\n- Ligne 1 : `n q`\n- Ligne 2 : `n` entiers, l'or de chaque coffre (il peut être négatif : un coffre maudit)\n- Puis `q` lignes : `l r` (1 ≤ l ≤ r ≤ n)\n\n**Output**\nUne ligne : le numéro de la zone (à partir de 1) et son or, séparés par un espace.\n\n**Constraints**\n- 1 ≤ n, q ≤ 200 000\n- -10^9 ≤ or ≤ 10^9",
   "en": "Beneath the peaks of the Atlas sleeps **Azgar**, a dragon lying on a row of **n** gold chests. To weaken it, your company must know where to strike: each scout comes back with a zone, from chest **l** to chest **r**, and the gold of that zone is the strength the dragon draws from it.\n\nYou get **q** zones. Find the zone holding **the most gold**: that's where the company strikes. On a tie, take the one given first.\n\n**Input**\n- Line 1: `n q`\n- Line 2: `n` integers, the gold of each chest (it can be negative: a cursed chest)\n- Then `q` lines: `l r` (1 ≤ l ≤ r ≤ n)\n\n**Output**\nOne line: the zone's number (from 1) and its gold, separated by a space.\n\n**Constraints**\n- 1 ≤ n, q ≤ 200,000\n- -10^9 ≤ gold ≤ 10^9"
  },
  "hint": {
   "fr": "Additionner chaque zone une par une est trop lent : calcule une fois les sommes cumulées (préfixes), puis chaque zone se lit en O(1).",
   "en": "Adding up each zone one by one is too slow: compute the running sums (prefix sums) once, then each zone reads in O(1)."
  },
  "lore": {
   "fr": {
    "intro": "La montagne gronde. Sous les cimes enneigées de l'Atlas, Azgar ouvre un œil d'or fondu : quelqu'un a osé compter son trésor. Héros de la classe, levez vos claviers : le dragon se réveille !",
    "hits": [
     "{hero} lance une boucle de feu sur les écailles d'Azgar : {dmg} dégâts !",
     "{hero} trouve la faille entre deux coffres et y plante son index : {dmg} dégâts !",
     "D'un préfixe parfait, {hero} transperce l'aile du dragon : {dmg} dégâts !",
     "{hero} brandit son tableau de sommes et frappe en O(1) : {dmg} dégâts !",
     "Le sort de {hero} fait trembler la montagne : {dmg} dégâts !",
     "{hero} esquive une flamme et contre-attaque : {dmg} dégâts !"
    ],
    "bloodied": "Azgar rugit, la moitié de ses écailles éparpillées sur l'or. Ses flammes deviennent folles !",
    "dying": "Le dragon titube, ses ailes déchirées. Un dernier effort, héros : la victoire est à portée de main !",
    "victory": "Le dernier rugissement s'éteint dans la vallée. Le trésor d'Azgar appartient à la classe, et les bardes chanteront le coup de {hero}, le plus terrible de la bataille.",
    "escape": "Dans un battement d'ailes, Azgar s'envole vers les sommets, emportant son or. Il reviendra…"
   },
   "en": {
    "intro": "The mountain growls. Beneath the snowy peaks of the Atlas, Azgar opens an eye of molten gold: someone dared to count its hoard. Heroes of the class, raise your keyboards: the dragon awakens!",
    "hits": [
     "{hero} casts a loop of fire on Azgar's scales: {dmg} damage!",
     "{hero} finds the gap between two chests and drives an index in: {dmg} damage!",
     "With a perfect prefix, {hero} pierces the dragon's wing: {dmg} damage!",
     "{hero} raises a table of sums and strikes in O(1): {dmg} damage!",
     "{hero}'s spell shakes the mountain: {dmg} damage!",
     "{hero} dodges a flame and strikes back: {dmg} damage!"
    ],
    "bloodied": "Azgar roars, half its scales scattered on the gold. Its flames go wild!",
    "dying": "The dragon staggers, wings torn. One last push, heroes: victory is within reach!",
    "victory": "The last roar fades in the valley. Azgar's hoard belongs to the class, and the bards will sing of {hero}'s strike, the mightiest of the battle.",
    "escape": "With a beat of its wings, Azgar flies to the peaks, taking its gold. It will return…"
   }
  },
  "solution": "import sys\ndef main():\n    d=sys.stdin.buffer.read().split()\n    n,q=int(d[0]),int(d[1])\n    p=[0]*(n+1)\n    for i in range(n): p[i+1]=p[i]+int(d[2+i])\n    best=None;bi=0;k=2+n\n    for j in range(q):\n        l=int(d[k]);r=int(d[k+1]);k+=2\n        s=p[r]-p[l-1]\n        if best is None or s>best: best=s;bi=j+1\n    print(bi,best)\nmain()",
  "tests": [
   {
    "input": "5 3\n4 -2 7 1 -5\n1 3\n2 4\n3 5\n",
    "gen": null,
    "expected": "1 9",
    "sample": 1
   },
   {
    "input": "4 2\n-1 -1 -1 -1\n1 1\n2 2\n",
    "gen": null,
    "expected": "1 -1",
    "sample": 1
   },
   {
    "input": "1 1\n-7\n1 1\n",
    "gen": null,
    "expected": "1 -7",
    "sample": 0
   },
   {
    "input": "6 4\n0 0 0 0 0 0\n1 6\n2 3\n4 4\n1 1\n",
    "gen": null,
    "expected": "1 0",
    "sample": 0
   },
   {
    "input": "5 5\n1000000000 -1000000000 1000000000 -1000000000 1000000000\n1 5\n1 1\n2 2\n3 5\n1 3\n",
    "gen": null,
    "expected": "1 1000000000",
    "sample": 0
   },
   {
    "input": "3 3\n-5 10 -5\n1 3\n2 2\n1 2\n",
    "gen": null,
    "expected": "2 10",
    "sample": 0
   },
   {
    "input": "8 3\n1 2 3 4 5 6 7 8\n1 8\n8 8\n1 1\n",
    "gen": null,
    "expected": "1 36",
    "sample": 0
   },
   {
    "input": null,
    "gen": "def gen():\n    import random\n    R=random.Random(11);n=q=200000\n    a=[R.randint(-10**9,10**9) for _ in range(n)]\n    out=[f\"{n} {q}\",\" \".join(map(str,a))]\n    for _ in range(q):\n        l=R.randint(1,n);r=R.randint(l,min(n,l+R.randint(0,n)));out.append(f\"{l} {r}\")\n    return \"\\n\".join(out)+\"\\n\"",
    "expected": "115301 235718559194",
    "sample": 0
   },
   {
    "input": null,
    "gen": "def gen():\n    import random\n    R=random.Random(5);n=q=200000\n    out=[f\"{n} {q}\",\" \".join([\"1\"]*n)]\n    for _ in range(q): out.append(f\"1 {n}\")\n    return \"\\n\".join(out)+\"\\n\"",
    "expected": "1 200000",
    "sample": 0
   }
  ]
 },
 {
  "id": "ogre-maze",
  "skill": "graphs",
  "difficulty": "hard",
  "emoji": "👹",
  "name": {
   "fr": "Grok, l'Ogre du Labyrinthe",
   "en": "Grok, the Maze Ogre"
  },
  "title": {
   "fr": "Le labyrinthe de Grok",
   "en": "Grok's maze"
  },
  "statement": {
   "fr": "L'ogre **Grok** s'est enfermé au cœur de son labyrinthe. La compagnie entre par la case **S** et doit atteindre la tanière **G** avant que l'ogre ne se réveille : chaque pas compte.\n\nLe labyrinthe est une grille de `h` lignes et `w` colonnes : `.` est un couloir, `#` un mur. On se déplace d'une case vers le haut, le bas, la gauche ou la droite.\n\nDonnez le **nombre minimum de pas** de S à G, ou `-1` si la tanière est inaccessible.\n\n**Input**\n- Ligne 1 : `h w`\n- Puis `h` lignes de `w` caractères (`.`, `#`, un seul `S`, un seul `G`)\n\n**Output**\nUn entier : le nombre minimum de pas, ou `-1`.\n\n**Constraints**\n- 1 ≤ h, w ≤ 700",
   "en": "The ogre **Grok** locked itself at the heart of its maze. The company enters at cell **S** and must reach the lair **G** before the ogre wakes up: every step counts.\n\nThe maze is a grid of `h` rows and `w` columns: `.` is a corridor, `#` a wall. You move one cell up, down, left or right.\n\nGive the **minimum number of steps** from S to G, or `-1` if the lair can't be reached.\n\n**Input**\n- Line 1: `h w`\n- Then `h` lines of `w` characters (`.`, `#`, one `S`, one `G`)\n\n**Output**\nOne integer: the minimum number of steps, or `-1`.\n\n**Constraints**\n- 1 ≤ h, w ≤ 700"
  },
  "hint": {
   "fr": "Un parcours en largeur (BFS) avec une file trouve le plus court chemin : chaque case n'est visitée qu'une fois.",
   "en": "A breadth-first search (BFS) with a queue finds the shortest path: each cell is visited once."
  },
  "lore": {
   "fr": {
    "intro": "Un grondement roule sous la pierre. Au fond du labyrinthe, Grok l'ogre renifle l'air : il sent les héros approcher. Les couloirs se tordent, les murs se resserrent… Trouvez le plus court chemin avant qu'il ne vous trouve !",
    "hits": [
     "{hero} trace le chemin le plus court et frappe Grok au genou : {dmg} dégâts !",
     "D'un pas parfait dans la file, {hero} surprend l'ogre : {dmg} dégâts !",
     "{hero} explore niveau par niveau et touche Grok en pleine face : {dmg} dégâts !",
     "La torche de {hero} éclaire un raccourci : {dmg} dégâts !",
     "{hero} ne revisite aucune case et frappe sans perdre de temps : {dmg} dégâts !",
     "{hero} contourne le mur et assène un coup puissant : {dmg} dégâts !"
    ],
    "bloodied": "Grok hurle et frappe les murs de son gourdin : la moitié de ses forces s'est envolée !",
    "dying": "L'ogre vacille contre un mur, à bout de souffle. Encore un chemin, héros !",
    "victory": "Grok s'effondre dans un fracas qui fait trembler tout le labyrinthe. Les couloirs s'ouvrent devant la classe, et {hero} sort en tête, porté en triomphe.",
    "escape": "Grok s'enfonce dans un passage secret que personne n'avait vu. Ses ricanements résonnent encore…"
   },
   "en": {
    "intro": "A rumble rolls under the stone. Deep in the maze, Grok the ogre sniffs the air: it smells the heroes coming. Corridors twist, walls close in… Find the shortest path before it finds you!",
    "hits": [
     "{hero} traces the shortest path and hits Grok in the knee: {dmg} damage!",
     "With a perfect step in the queue, {hero} surprises the ogre: {dmg} damage!",
     "{hero} explores level by level and strikes Grok in the face: {dmg} damage!",
     "{hero}'s torch reveals a shortcut: {dmg} damage!",
     "{hero} never revisits a cell and strikes without losing time: {dmg} damage!",
     "{hero} goes round the wall and lands a mighty blow: {dmg} damage!"
    ],
    "bloodied": "Grok howls and smashes the walls with its club: half its strength is gone!",
    "dying": "The ogre staggers against a wall, out of breath. One more path, heroes!",
    "victory": "Grok collapses with a crash that shakes the whole maze. The corridors open before the class, and {hero} walks out first, carried in triumph.",
    "escape": "Grok slips into a secret passage nobody had seen. Its sneer still echoes…"
   }
  },
  "solution": "import sys\nfrom collections import deque\ndef main():\n    d=sys.stdin.read().split('\\n');h,w=map(int,d[0].split());g=d[1:1+h]\n    for i in range(h):\n        j=g[i].find('S')\n        if j>=0: s=(i,j)\n    dist=[[-1]*w for _ in range(h)];dist[s[0]][s[1]]=0;Q=deque([s])\n    while Q:\n        i,j=Q.popleft()\n        if g[i][j]=='G': print(dist[i][j]);return\n        for a,b in ((i+1,j),(i-1,j),(i,j+1),(i,j-1)):\n            if 0<=a<h and 0<=b<w and g[a][b]!='#' and dist[a][b]<0: dist[a][b]=dist[i][j]+1;Q.append((a,b))\n    print(-1)\nmain()",
  "tests": [
   {
    "input": "3 4\nS..#\n.#..\n...G\n",
    "gen": null,
    "expected": "5",
    "sample": 1
   },
   {
    "input": "3 3\nS#G\n##.\n...\n",
    "gen": null,
    "expected": "-1",
    "sample": 1
   },
   {
    "input": "1 2\nSG\n",
    "gen": null,
    "expected": "1",
    "sample": 0
   },
   {
    "input": "2 2\nS#\n#G\n",
    "gen": null,
    "expected": "-1",
    "sample": 0
   },
   {
    "input": "4 4\nS...\n###.\n.#..\nG..#\n",
    "gen": null,
    "expected": "9",
    "sample": 0
   },
   {
    "input": "3 5\nS.#.G\n..#..\n.....\n",
    "gen": null,
    "expected": "8",
    "sample": 0
   },
   {
    "input": "5 1\nS\n.\n.\n.\nG\n",
    "gen": null,
    "expected": "4",
    "sample": 0
   },
   {
    "input": null,
    "gen": "def gen():\n    import random\n    R=random.Random(3);h=w=700\n    g=[[\".\" if R.random()>0.3 else \"#\" for _ in range(w)] for _ in range(h)]\n    g[0][0]=\"S\";g[h-1][w-1]=\"G\"\n    for i in range(h): g[i][0]=\".\"\n    for j in range(w): g[h-1][j]=\".\"\n    g[0][0]=\"S\";g[h-1][w-1]=\"G\"\n    return f\"{h} {w}\\n\"+\"\\n\".join(\"\".join(r) for r in g)+\"\\n\"",
    "expected": "1398",
    "sample": 0
   },
   {
    "input": null,
    "gen": "def gen():\n    h=w=699\n    g=[[\"#\"]*w for _ in range(h)]\n    for i in range(h):\n        if i%2==0:\n            for j in range(w): g[i][j]=\".\"\n        else:\n            g[i][w-1 if (i//2)%2==0 else 0]=\".\"\n    g[0][0]=\"S\";g[h-1][w-1 if ((h-1)//2)%2==0 else 0]=\"G\"\n    return f\"{h} {w}\\n\"+\"\\n\".join(\"\".join(r) for r in g)+\"\\n\"",
    "expected": "244998",
    "sample": 0
   }
  ]
 },
 {
  "id": "echo-lich",
  "skill": "twopointers",
  "difficulty": "medium",
  "emoji": "💀",
  "name": {
   "fr": "Morvane, la Liche des Échos",
   "en": "Morvane, the Echo Lich"
  },
  "title": {
   "fr": "L'incantation sans écho",
   "en": "The echoless chant"
  },
  "statement": {
   "fr": "La liche **Morvane** ne craint qu'une chose : une incantation **sans écho**, c'est-à-dire une suite de runes où **aucune rune n'apparaît deux fois**. Plus l'incantation est longue, plus elle la blesse.\n\nLe grimoire de la classe contient une longue chaîne de runes (lettres minuscules). Trouvez la **longueur du plus long passage continu** sans rune répétée.\n\n**Input**\nUne ligne : la chaîne `s` (lettres de `a` à `z`).\n\n**Output**\nUn entier : la longueur du plus long passage sans rune répétée.\n\n**Constraints**\n- 1 ≤ |s| ≤ 300 000",
   "en": "The lich **Morvane** fears only one thing: an **echoless** chant, a run of runes where **no rune appears twice**. The longer the chant, the more it hurts her.\n\nThe class's spellbook holds a long string of runes (lowercase letters). Find the **length of the longest continuous passage** with no repeated rune.\n\n**Input**\nOne line: the string `s` (letters `a` to `z`).\n\n**Output**\nOne integer: the length of the longest passage with no repeated rune.\n\n**Constraints**\n- 1 ≤ |s| ≤ 300,000"
  },
  "hint": {
   "fr": "Une fenêtre glissante : avance la fin, et quand une rune se répète, avance le début juste après sa dernière apparition.",
   "en": "A sliding window: move the end forward, and when a rune repeats, move the start just after its last appearance."
  },
  "lore": {
   "fr": {
    "intro": "Un froid de tombeau envahit la salle. Morvane la liche se dresse, et sa voix revient en mille échos. Seule une incantation sans écho peut la briser : héros, ouvrez le grimoire !",
    "hits": [
     "{hero} récite un passage sans écho et brise un os de la liche : {dmg} dégâts !",
     "La fenêtre de {hero} glisse sans faute : {dmg} dégâts !",
     "{hero} fait taire un écho d'un seul coup d'index : {dmg} dégâts !",
     "Les runes de {hero} brûlent le manteau de Morvane : {dmg} dégâts !",
     "{hero} avance le début juste au bon endroit et frappe : {dmg} dégâts !",
     "Un sort pur et sans répétition de {hero} touche la liche : {dmg} dégâts !"
    ],
    "bloodied": "Morvane hurle, sa couronne fendue. Les échos deviennent chaotiques !",
    "dying": "La liche se fissure de toutes parts. Une dernière incantation, héros !",
    "victory": "Le silence tombe enfin. Morvane se disperse en poussière, et l'incantation de {hero} résonne une dernière fois, sans écho.",
    "escape": "Morvane se fond dans ses propres échos et disparaît… Le froid, lui, reste."
   },
   "en": {
    "intro": "A tomb's chill fills the room. Morvane the lich rises, and her voice comes back in a thousand echoes. Only an echoless chant can break her: heroes, open the spellbook!",
    "hits": [
     "{hero} chants an echoless passage and breaks one of the lich's bones: {dmg} damage!",
     "{hero}'s window slides flawlessly: {dmg} damage!",
     "{hero} silences an echo with a single index: {dmg} damage!",
     "{hero}'s runes burn Morvane's cloak: {dmg} damage!",
     "{hero} moves the start to just the right place and strikes: {dmg} damage!",
     "A pure spell with no repetition from {hero} hits the lich: {dmg} damage!"
    ],
    "bloodied": "Morvane screams, her crown cracked. The echoes turn chaotic!",
    "dying": "The lich cracks all over. One last chant, heroes!",
    "victory": "Silence falls at last. Morvane scatters into dust, and {hero}'s chant rings one last time, without an echo.",
    "escape": "Morvane melts into her own echoes and vanishes… The cold stays."
   }
  },
  "solution": "import sys\ns=sys.stdin.readline().strip();last={};st=0;best=0\nfor i,c in enumerate(s):\n    if c in last and last[c]>=st: st=last[c]+1\n    last[c]=i\n    if i-st+1>best: best=i-st+1\nprint(best)",
  "tests": [
   {
    "input": "abcabcbb\n",
    "gen": null,
    "expected": "3",
    "sample": 1
   },
   {
    "input": "pwwkew\n",
    "gen": null,
    "expected": "3",
    "sample": 1
   },
   {
    "input": "a\n",
    "gen": null,
    "expected": "1",
    "sample": 0
   },
   {
    "input": "aaaa\n",
    "gen": null,
    "expected": "1",
    "sample": 0
   },
   {
    "input": "abcdefghijklmnopqrstuvwxyz\n",
    "gen": null,
    "expected": "26",
    "sample": 0
   },
   {
    "input": "abba\n",
    "gen": null,
    "expected": "2",
    "sample": 0
   },
   {
    "input": "dvdf\n",
    "gen": null,
    "expected": "3",
    "sample": 0
   },
   {
    "input": null,
    "gen": "def gen():\n    import random\n    R=random.Random(9)\n    return \"\".join(R.choice(\"abcdefghijklmnopqrstuvwxyz\") for _ in range(300000))+\"\\n\"",
    "expected": "22",
    "sample": 0
   },
   {
    "input": null,
    "gen": "def gen():\n    return (\"abcdefghijklmnopqrstuvwxy\"*12000)[:300000]+\"\\n\"",
    "expected": "25",
    "sample": 0
   }
  ]
 },
 {
  "id": "tide-kraken",
  "skill": "sorting",
  "difficulty": "medium",
  "emoji": "🐙",
  "name": {
   "fr": "Thalassa, le Kraken des Marées",
   "en": "Thalassa, the Tide Kraken"
  },
  "title": {
   "fr": "Les tentacules de Thalassa",
   "en": "Thalassa's tentacles"
  },
  "statement": {
   "fr": "Le kraken **Thalassa** attaque le port ! Chacun de ses **n** tentacules recouvre une portion du quai, du mètre `a` au mètre `b`. Les tentacules se chevauchent souvent.\n\nPour placer les canons, la capitaine veut connaître la **longueur totale du quai recouverte** par au moins un tentacule.\n\n**Input**\n- Ligne 1 : `n`\n- Puis `n` lignes : `a b` (a < b), une portion `[a, b)`\n\n**Output**\nUn entier : la longueur totale recouverte.\n\n**Constraints**\n- 1 ≤ n ≤ 200 000\n- 0 ≤ a < b ≤ 10^9",
   "en": "The kraken **Thalassa** attacks the harbour! Each of its **n** tentacles covers a stretch of the quay, from metre `a` to metre `b`. Tentacles often overlap.\n\nTo place the cannons, the captain wants the **total length of quay covered** by at least one tentacle.\n\n**Input**\n- Line 1: `n`\n- Then `n` lines: `a b` (a < b), a stretch `[a, b)`\n\n**Output**\nOne integer: the total length covered.\n\n**Constraints**\n- 1 ≤ n ≤ 200,000\n- 0 ≤ a < b ≤ 10^9"
  },
  "hint": {
   "fr": "Trie les portions par début, puis fusionne celles qui se chevauchent en un seul passage.",
   "en": "Sort the stretches by start, then merge the overlapping ones in a single pass."
  },
  "lore": {
   "fr": {
    "intro": "La mer se soulève et les cloches du port sonnent l'alarme : Thalassa, le kraken des marées, enroule ses tentacules autour des quais ! Héros, aux canons : mesurez son emprise et repoussez-le !",
    "hits": [
     "Le boulet de {hero} tranche un tentacule : {dmg} dégâts !",
     "{hero} fusionne deux intervalles et frappe au point faible : {dmg} dégâts !",
     "Après un tri éclair, {hero} vise juste : {dmg} dégâts !",
     "{hero} harponne le kraken entre deux vagues : {dmg} dégâts !",
     "Le canon de {hero} tonne sur le quai : {dmg} dégâts !",
     "{hero} repousse un tentacule dans les flots : {dmg} dégâts !"
    ],
    "bloodied": "Thalassa rugit sous l'eau : la moitié de ses tentacules pend, inerte !",
    "dying": "Le kraken lâche prise, il sombre lentement. Une dernière salve, héros !",
    "victory": "Thalassa s'enfonce dans les profondeurs dans un tourbillon d'écume. Le port est sauvé, et c'est le canon de {hero} qu'on entendra dans les chansons de marins.",
    "escape": "Le kraken disparaît sous les vagues, laissant le port meurtri. La marée reviendra…"
   },
   "en": {
    "intro": "The sea rises and the harbour bells ring the alarm: Thalassa, the tide kraken, wraps its tentacles around the quays! Heroes, to the cannons: measure its grip and drive it back!",
    "hits": [
     "{hero}'s cannonball cuts a tentacle: {dmg} damage!",
     "{hero} merges two intervals and strikes the weak spot: {dmg} damage!",
     "After a lightning sort, {hero} aims true: {dmg} damage!",
     "{hero} harpoons the kraken between two waves: {dmg} damage!",
     "{hero}'s cannon thunders on the quay: {dmg} damage!",
     "{hero} drives a tentacle back into the waves: {dmg} damage!"
    ],
    "bloodied": "Thalassa roars under the water: half its tentacles hang limp!",
    "dying": "The kraken lets go and slowly sinks. One last volley, heroes!",
    "victory": "Thalassa sinks into the depths in a whirl of foam. The harbour is saved, and it's {hero}'s cannon that sailors will sing about.",
    "escape": "The kraken vanishes under the waves, leaving the harbour battered. The tide will return…"
   }
  },
  "solution": "import sys\nd=sys.stdin.buffer.read().split();n=int(d[0])\niv=sorted((int(d[1+2*i]),int(d[2+2*i])) for i in range(n))\ntot=0;cs,ce=iv[0]\nfor a,b in iv[1:]:\n    if a<=ce: ce=max(ce,b)\n    else: tot+=ce-cs;cs,ce=a,b\ntot+=ce-cs\nprint(tot)",
  "tests": [
   {
    "input": "3\n1 5\n3 8\n10 12\n",
    "gen": null,
    "expected": "9",
    "sample": 1
   },
   {
    "input": "2\n0 10\n2 3\n",
    "gen": null,
    "expected": "10",
    "sample": 1
   },
   {
    "input": "1\n0 1\n",
    "gen": null,
    "expected": "1",
    "sample": 0
   },
   {
    "input": "2\n1 2\n2 3\n",
    "gen": null,
    "expected": "2",
    "sample": 0
   },
   {
    "input": "3\n5 6\n1 2\n3 4\n",
    "gen": null,
    "expected": "3",
    "sample": 0
   },
   {
    "input": "4\n1 10\n2 9\n3 8\n4 7\n",
    "gen": null,
    "expected": "9",
    "sample": 0
   },
   {
    "input": "3\n0 5\n5 10\n10 15\n",
    "gen": null,
    "expected": "15",
    "sample": 0
   },
   {
    "input": null,
    "gen": "def gen():\n    import random\n    R=random.Random(21);n=200000;out=[str(n)]\n    for _ in range(n):\n        a=R.randint(0,10**9-1);b=min(10**9,a+R.randint(1,10**5));out.append(f\"{a} {b}\")\n    return \"\\n\".join(out)+\"\\n\"",
    "expected": "999884187",
    "sample": 0
   },
   {
    "input": null,
    "gen": "def gen():\n    n=200000;out=[str(n)]\n    for i in range(n): out.append(f\"{i*3} {i*3+5}\")\n    return \"\\n\".join(out)+\"\\n\"",
    "expected": "600002",
    "sample": 0
   }
  ]
 },
 {
  "id": "forge-golem",
  "skill": "dp",
  "difficulty": "hard",
  "emoji": "🗿",
  "name": {
   "fr": "Basalt, le Golem de la Forge",
   "en": "Basalt, the Forge Golem"
  },
  "title": {
   "fr": "Le sac du forgeron",
   "en": "The smith's pack"
  },
  "statement": {
   "fr": "Le golem **Basalt** garde la forge, et seules les armes les plus puissantes peuvent l'entamer. Le forgeron vous laisse emporter ce que vous voulez, mais votre sac ne supporte que **W** kilos.\n\nIl y a **n** armes ; l'arme `i` pèse `w_i` kilos et a une puissance `p_i`. Chaque arme est unique (on la prend ou non). Quelle est la **puissance totale maximale** que la compagnie peut emporter ?\n\n**Input**\n- Ligne 1 : `n W`\n- Puis `n` lignes : `w_i p_i`\n\n**Output**\nUn entier : la puissance totale maximale.\n\n**Constraints**\n- 1 ≤ n ≤ 200\n- 1 ≤ W ≤ 20 000\n- 1 ≤ w_i ≤ 20 000, 0 ≤ p_i ≤ 10^6",
   "en": "The golem **Basalt** guards the forge, and only the mightiest weapons can dent it. The smith lets you take what you want, but your pack only holds **W** kilos.\n\nThere are **n** weapons; weapon `i` weighs `w_i` kilos and has power `p_i`. Each weapon is unique (take it or not). What is the **maximum total power** the company can carry?\n\n**Input**\n- Line 1: `n W`\n- Then `n` lines: `w_i p_i`\n\n**Output**\nOne integer: the maximum total power.\n\n**Constraints**\n- 1 ≤ n ≤ 200\n- 1 ≤ W ≤ 20,000\n- 1 ≤ w_i ≤ 20,000, 0 ≤ p_i ≤ 10^6"
  },
  "hint": {
   "fr": "Le sac à dos 0/1 : un tableau best[poids], parcouru du poids le plus grand au plus petit pour chaque arme.",
   "en": "The 0/1 knapsack: an array best[weight], walked from the heaviest weight down for each weapon."
  },
  "lore": {
   "fr": {
    "intro": "Les braises s'embrasent d'un coup. Dans un fracas de roche, Basalt le golem se lève de l'enclume, ses poings rougis par mille ans de forge. Choisissez vos armes avec sagesse, héros : votre sac n'est pas infini !",
    "hits": [
     "{hero} choisit la meilleure combinaison d'armes et frappe : {dmg} dégâts !",
     "Le marteau de {hero} fend la roche du golem : {dmg} dégâts !",
     "{hero} remplit sa table de programmation dynamique et brise un bras de pierre : {dmg} dégâts !",
     "D'un calcul parfait, {hero} trouve le coup optimal : {dmg} dégâts !",
     "{hero} parcourt les poids à l'envers et ne compte chaque arme qu'une fois : {dmg} dégâts !",
     "L'épée de {hero} fait jaillir des étincelles : {dmg} dégâts !"
    ],
    "bloodied": "Basalt se fissure de la tête aux pieds, de la lave coule de ses blessures !",
    "dying": "Le golem chancelle, ses jambes de pierre s'effritent. Un dernier coup de marteau, héros !",
    "victory": "Basalt s'effondre en un tas de pierres fumantes. La forge s'apaise, et sur l'enclume, on gravera le nom de {hero}, qui porta le coup le plus lourd.",
    "escape": "Le golem s'enfonce dans la lave de la forge et disparaît. Les braises gardent sa chaleur…"
   },
   "en": {
    "intro": "The embers flare all at once. With a crash of rock, Basalt the golem rises from the anvil, its fists glowing from a thousand years of forging. Choose your weapons wisely, heroes: your pack isn't endless!",
    "hits": [
     "{hero} picks the best combination of weapons and strikes: {dmg} damage!",
     "{hero}'s hammer splits the golem's rock: {dmg} damage!",
     "{hero} fills the dynamic programming table and breaks a stone arm: {dmg} damage!",
     "With a perfect calculation, {hero} finds the optimal blow: {dmg} damage!",
     "{hero} walks the weights backwards and counts each weapon once: {dmg} damage!",
     "{hero}'s sword throws up sparks: {dmg} damage!"
    ],
    "bloodied": "Basalt cracks from head to toe, lava flowing from its wounds!",
    "dying": "The golem staggers, its stone legs crumbling. One last hammer blow, heroes!",
    "victory": "Basalt collapses into a heap of smoking stones. The forge calms, and on the anvil they'll carve the name of {hero}, who struck the heaviest blow.",
    "escape": "The golem sinks into the forge's lava and vanishes. The embers keep its heat…"
   }
  },
  "solution": "import sys\nd=sys.stdin.buffer.read().split();n,W=int(d[0]),int(d[1]);best=[0]*(W+1)\nfor i in range(n):\n    w,p=int(d[2+2*i]),int(d[3+2*i])\n    if w>W: continue\n    for c in range(W,w-1,-1):\n        v=best[c-w]+p\n        if v>best[c]: best[c]=v\nprint(best[W])",
  "tests": [
   {
    "input": "4 10\n5 10\n4 40\n6 30\n3 50\n",
    "gen": null,
    "expected": "90",
    "sample": 1
   },
   {
    "input": "3 5\n6 100\n7 200\n8 300\n",
    "gen": null,
    "expected": "0",
    "sample": 1
   },
   {
    "input": "1 1\n1 7\n",
    "gen": null,
    "expected": "7",
    "sample": 0
   },
   {
    "input": "3 6\n1 1\n2 2\n3 3\n",
    "gen": null,
    "expected": "6",
    "sample": 0
   },
   {
    "input": "4 7\n7 9\n3 4\n4 5\n1 1\n",
    "gen": null,
    "expected": "9",
    "sample": 0
   },
   {
    "input": "5 3\n1 0\n1 0\n1 1\n2 5\n3 5\n",
    "gen": null,
    "expected": "6",
    "sample": 0
   },
   {
    "input": "6 8\n2 3\n3 4\n4 5\n5 6\n1 1\n8 10\n",
    "gen": null,
    "expected": "10",
    "sample": 0
   },
   {
    "input": null,
    "gen": "def gen():\n    import random\n    R=random.Random(31);n=200;W=20000;out=[f\"{n} {W}\"]\n    for _ in range(n): out.append(f\"{R.randint(1,2000)} {R.randint(0,10**6)}\")\n    return \"\\n\".join(out)+\"\\n\"",
    "expected": "37888591",
    "sample": 0
   },
   {
    "input": null,
    "gen": "def gen():\n    import random\n    R=random.Random(32);n=200;W=20000;out=[f\"{n} {W}\"]\n    for _ in range(n):\n        w=R.randint(50,400);out.append(f\"{w} {w*R.randint(900,1100)}\")\n    return \"\\n\".join(out)+\"\\n\"",
    "expected": "21031834",
    "sample": 0
   }
  ]
 },
 {
  "id": "twin-basilisk",
  "skill": "dicts",
  "difficulty": "medium",
  "emoji": "🐍",
  "name": {
   "fr": "Nyx, le Basilic Jumeau",
   "en": "Nyx, the Twin Basilisk"
  },
  "title": {
   "fr": "Les paires de Nyx",
   "en": "Nyx's pairs"
  },
  "statement": {
   "fr": "Le basilic **Nyx** ne peut être blessé que par **deux runes dont les valeurs s'additionnent exactement à K**. Le sac de la compagnie contient **n** runes, chacune avec une valeur.\n\nCombien de **paires de runes différentes** (positions `i < j`) ont une somme égale à **K** ?\n\n**Input**\n- Ligne 1 : `n K`\n- Ligne 2 : `n` entiers, les valeurs des runes\n\n**Output**\nUn entier : le nombre de paires.\n\n**Constraints**\n- 1 ≤ n ≤ 200 000\n- -10^9 ≤ valeurs, K ≤ 10^9",
   "en": "The basilisk **Nyx** can only be hurt by **two runes whose values add up to exactly K**. The company's bag holds **n** runes, each with a value.\n\nHow many **pairs of different runes** (positions `i < j`) have a sum equal to **K**?\n\n**Input**\n- Line 1: `n K`\n- Line 2: `n` integers, the runes' values\n\n**Output**\nOne integer: the number of pairs.\n\n**Constraints**\n- 1 ≤ n ≤ 200,000\n- -10^9 ≤ values, K ≤ 10^9"
  },
  "hint": {
   "fr": "Parcours les runes une fois en comptant, dans un dictionnaire, combien de fois chaque valeur a déjà été vue : la partenaire d'une valeur v est K − v.",
   "en": "Walk the runes once, counting in a dictionary how many times each value was already seen: the partner of a value v is K − v."
  },
  "lore": {
   "fr": {
    "intro": "Deux yeux s'ouvrent dans l'ombre, puis deux autres : Nyx, le basilic jumeau, glisse hors de la crypte. Une seule chose peut le blesser : des paires de runes parfaitement accordées. Héros, ne le regardez pas dans les yeux… et comptez juste !",
    "hits": [
     "{hero} trouve la rune partenaire en un clin d'œil : {dmg} dégâts !",
     "Le dictionnaire de {hero} se souvient de chaque rune : {dmg} dégâts !",
     "{hero} accorde deux runes et frappe les deux têtes : {dmg} dégâts !",
     "D'un seul passage, {hero} transperce les écailles : {dmg} dégâts !",
     "Le bouclier miroir de {hero} renvoie le regard du basilic : {dmg} dégâts !",
     "{hero} cherche K − v et le trouve aussitôt : {dmg} dégâts !"
    ],
    "bloodied": "Nyx siffle de rage, une de ses têtes pend, aveuglée !",
    "dying": "Le basilic rampe à peine, ses écailles s'effritent. Une dernière paire, héros !",
    "victory": "Les deux têtes de Nyx s'abattent en même temps. La crypte se tait, et c'est la paire parfaite de {hero} qui scella le destin du basilic.",
    "escape": "Nyx se glisse dans une fissure du mur et disparaît. On entend encore son sifflement…"
   },
   "en": {
    "intro": "Two eyes open in the dark, then two more: Nyx, the twin basilisk, slides out of the crypt. Only one thing can hurt it: pairs of perfectly matched runes. Heroes, don't look it in the eye… and count right!",
    "hits": [
     "{hero} finds the partner rune in the blink of an eye: {dmg} damage!",
     "{hero}'s dictionary remembers every rune: {dmg} damage!",
     "{hero} matches two runes and strikes both heads: {dmg} damage!",
     "In a single pass, {hero} pierces the scales: {dmg} damage!",
     "{hero}'s mirror shield turns the basilisk's gaze back: {dmg} damage!",
     "{hero} looks for K − v and finds it at once: {dmg} damage!"
    ],
    "bloodied": "Nyx hisses with rage, one of its heads hanging, blinded!",
    "dying": "The basilisk barely crawls, its scales crumbling. One last pair, heroes!",
    "victory": "Both of Nyx's heads fall at once. The crypt goes silent, and it was {hero}'s perfect pair that sealed the basilisk's fate.",
    "escape": "Nyx slips into a crack in the wall and vanishes. Its hiss still echoes…"
   }
  },
  "solution": "import sys\nd=sys.stdin.buffer.read().split();n,K=int(d[0]),int(d[1]);seen={};c=0\nfor i in range(n):\n    v=int(d[2+i]);c+=seen.get(K-v,0);seen[v]=seen.get(v,0)+1\nprint(c)",
  "tests": [
   {
    "input": "5 6\n1 5 3 3 2\n",
    "gen": null,
    "expected": "2",
    "sample": 1
   },
   {
    "input": "4 0\n0 0 0 0\n",
    "gen": null,
    "expected": "6",
    "sample": 1
   },
   {
    "input": "1 2\n1\n",
    "gen": null,
    "expected": "0",
    "sample": 0
   },
   {
    "input": "2 2\n1 1\n",
    "gen": null,
    "expected": "1",
    "sample": 0
   },
   {
    "input": "6 10\n5 5 5 5 1 9\n",
    "gen": null,
    "expected": "7",
    "sample": 0
   },
   {
    "input": "5 -2\n-1 -1 3 -5 0\n",
    "gen": null,
    "expected": "2",
    "sample": 0
   },
   {
    "input": "4 100\n1 2 3 4\n",
    "gen": null,
    "expected": "0",
    "sample": 0
   },
   {
    "input": null,
    "gen": "def gen():\n    import random\n    R=random.Random(41);n=200000;K=0\n    return f\"{n} {K}\\n\"+\" \".join(str(R.randint(-1000,1000)) for _ in range(n))+\"\\n\"",
    "expected": "9990491",
    "sample": 0
   },
   {
    "input": null,
    "gen": "def gen():\n    n=200000\n    return f\"{n} 14\\n\"+\" \".join(\"7\" for _ in range(n))+\"\\n\"",
    "expected": "19999900000",
    "sample": 0
   }
  ]
 }
];
