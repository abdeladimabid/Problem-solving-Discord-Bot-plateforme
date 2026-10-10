"""Regular-expression challenges (JavaScript syntax), English + French.

The bot tests the student's pattern as a FULL match: new RegExp('^(?:' + pattern + ')$', flags).
Every string of `match` + `hidden_match` must match, every string of `reject` + `hidden_reject`
must not. `match`/`reject` are shown to students, the hidden lists stop hardcoding.
`ref` is a reference solution; `wrong` is a plausible naive regex that fails at least
one hidden string (used as a test).
"""

RX = [
    # ================================================================= EASY
    dict(
        slug="rx-digits-only", difficulty="easy", skills="regex,strings",
        en=dict(title="Digits only",
                statement="Match a string made only of digits `0`-`9`, with at least one digit.",
                hint="`\\d` is one digit; which quantifier means \"one or more\"?"),
        fr=dict(title="Uniquement des chiffres",
                statement="Reconnaissez une chaîne composée uniquement de chiffres `0`-`9`, avec au moins un chiffre.",
                hint="`\\d` est un chiffre ; quel quantificateur veut dire « un ou plus » ?"),
        flags="",
        match=["0", "7", "42", "2026", "000123"],
        reject=["12a", "-5", "3.14", "1 000", "abc"],
        hidden_match=["9", "1234567890", "00", "31415926535"],
        hidden_reject=["", " 12", "12 ", "+1", "1e5", "٣"],
        ref=r"\d+",
        wrong=r"\d*",
    ),
    dict(
        slug="rx-postal-code", difficulty="easy", skills="regex,web",
        en=dict(title="Postal code",
                statement="Match a Moroccan postal code: **exactly 5 digits**.",
                hint="A quantifier with a fixed count: `{5}`."),
        fr=dict(title="Code postal",
                statement="Reconnaissez un code postal marocain : **exactement 5 chiffres**.",
                hint="Un quantificateur avec un nombre fixe : `{5}`."),
        flags="",
        match=["20000", "10100", "30050", "90000", "40000"],
        reject=["2000", "200000", "2O000", "20 000", "abcde"],
        hidden_match=["00000", "12345", "99999", "80060"],
        hidden_reject=["", "1234", "123456", "12345-6789", "1234a", " 12345"],
        ref=r"\d{5}",
        wrong=r"\d{5,}",
    ),
    dict(
        slug="rx-hashtag", difficulty="easy", skills="regex,web",
        en=dict(title="Hashtag",
                statement="Match a hashtag: `#`, then a letter (`a-z` or `A-Z`), then any number of letters, "
                          "digits or underscores `_`.",
                hint="`#[A-Za-z]` for the start, then a character class with `*`. Be careful: `\\w` also accepts a digit first."),
        fr=dict(title="Hashtag",
                statement="Reconnaissez un hashtag : `#`, puis une lettre (`a-z` ou `A-Z`), puis un nombre quelconque de "
                          "lettres, chiffres ou tirets bas `_`.",
                hint="`#[A-Za-z]` pour le début, puis une classe de caractères avec `*`. Attention : `\\w` accepte aussi un chiffre en premier."),
        flags="",
        match=["#php", "#WebDev", "#js_2026", "#a", "#Laravel11"],
        reject=["php", "#", "#web-dev", "##php", "#hello world"],
        hidden_match=["#X", "#code_review", "#HTML5", "#a_1_b"],
        hidden_reject=["#2026", "#_private", "#9gag", "# php", "#café", "#php!"],
        ref=r"#[A-Za-z][A-Za-z0-9_]*",
        wrong=r"#\w+",
    ),
    dict(
        slug="rx-hex-color", difficulty="easy", skills="regex,web",
        en=dict(title="CSS hex color",
                statement="Match a CSS hex color: `#` followed by **exactly 3 or exactly 6** hexadecimal digits "
                          "(`0-9`, `a-f`, upper or lower case).",
                hint="Two alternatives: `{3}` or `{6}`. The flag `i` makes the match case-insensitive."),
        fr=dict(title="Couleur hexadécimale CSS",
                statement="Reconnaissez une couleur hexadécimale CSS : `#` suivi d'**exactement 3 ou exactement 6** "
                          "chiffres hexadécimaux (`0-9`, `a-f`, majuscules ou minuscules).",
                hint="Deux alternatives : `{3}` ou `{6}`. Le flag `i` rend la correspondance insensible à la casse."),
        flags="i",
        match=["#fff", "#000000", "#1E90FF", "#a3c", "#C0ffee"],
        reject=["fff", "#ffff", "#12345g", "#abcdefa", "# fff"],
        hidden_match=["#ABC", "#09f", "#deadbe", "#FfFfFf"],
        hidden_reject=["#abcd", "#12345", "#", "#ab", "#ggg", "#fffffff0"],
        ref=r"#(?:[0-9a-f]{3}|[0-9a-f]{6})",
        wrong=r"#[0-9a-f]{3,6}",
    ),

    # =============================================================== MEDIUM
    dict(
        slug="rx-time-24h", difficulty="medium", skills="regex,web",
        en=dict(title="24-hour time",
                statement="Match a time `HH:MM` in 24-hour format: hours `00` to `23`, minutes `00` to `59`, "
                          "always 2 digits each.",
                hint="Hours: `[01]\\d` or `2[0-3]`. Minutes: `[0-5]\\d`."),
        fr=dict(title="Heure sur 24 h",
                statement="Reconnaissez une heure `HH:MM` au format 24 h : heures de `00` à `23`, minutes de `00` à `59`, "
                          "toujours sur 2 chiffres.",
                hint="Heures : `[01]\\d` ou `2[0-3]`. Minutes : `[0-5]\\d`."),
        flags="",
        match=["00:00", "09:30", "12:05", "23:59", "18:45"],
        reject=["24:00", "9:30", "12:60", "12-30", "1230"],
        hidden_match=["19:00", "20:20", "10:10", "01:01"],
        hidden_reject=["25:00", "29:59", "24:30", "12:5", "123:00", "12:345"],
        ref=r"(?:[01]\d|2[0-3]):[0-5]\d",
        wrong=r"[0-2]\d:[0-5]\d",
    ),
    dict(
        slug="rx-username", difficulty="medium", skills="regex,web",
        en=dict(title="Username",
                statement="Match a username: **3 to 16** characters in total, only letters (`a-z`, `A-Z`), digits "
                          "and underscores `_`, and it must **start with a letter**.",
                hint="One letter, then `{2,15}` more allowed characters."),
        fr=dict(title="Nom d'utilisateur",
                statement="Reconnaissez un nom d'utilisateur : **3 à 16** caractères au total, uniquement des lettres "
                          "(`a-z`, `A-Z`), des chiffres et des tirets bas `_`, et il doit **commencer par une lettre**.",
                hint="Une lettre, puis `{2,15}` caractères autorisés."),
        flags="",
        match=["abc", "dev_2026", "Youssef", "a_b", "Admin007"],
        reject=["ab", "2fast", "john.doe", "user name", "a_very_long_username"],
        hidden_match=["Zed", "x12", "abcdefghijklmnop", "L_33t"],
        hidden_reject=["1abc", "_admin", "abcdefghijklmnopq", "jo", "émile", "ab-c"],
        ref=r"[A-Za-z][A-Za-z0-9_]{2,15}",
        wrong=r"\w{3,16}",
    ),
    dict(
        slug="rx-url-slug", difficulty="medium", skills="regex,web",
        en=dict(title="URL slug",
                statement="Match a URL slug: one or more words of lowercase letters `a-z` and digits, separated by "
                          "**single** hyphens `-`. No hyphen at the start or the end, no two hyphens in a row.",
                hint="A word, then a group \"hyphen + word\" repeated zero or more times: `word(?:-word)*`."),
        fr=dict(title="Slug d'URL",
                statement="Reconnaissez un slug d'URL : un ou plusieurs mots de lettres minuscules `a-z` et de chiffres, "
                          "séparés par **un seul** tiret `-`. Pas de tiret au début ni à la fin, pas deux tirets de suite.",
                hint="Un mot, puis un groupe « tiret + mot » répété zéro ou plusieurs fois : `mot(?:-mot)*`."),
        flags="",
        match=["hello", "my-first-post", "laravel-11-tips", "2026", "a-b-c"],
        reject=["Hello-World", "my_post", "my post", "-start", "end-"],
        hidden_match=["x", "top-10-js-tricks", "php8", "a1-b2-c3"],
        hidden_reject=["a--b", "-", "--", "post-", "-post", "café-au-lait", "a.b"],
        ref=r"[a-z0-9]+(?:-[a-z0-9]+)*",
        wrong=r"[a-z0-9-]+",
    ),
    dict(
        slug="rx-image-file", difficulty="medium", skills="regex,web",
        en=dict(title="Image file name",
                statement="Match an image file name: a name made of one or more letters, digits, `_` or `-`, "
                          "then a dot, then one of the extensions `jpg`, `jpeg`, `png` or `gif`, in any case.",
                hint="`[\\w-]+` for the name, `\\.` for a literal dot, an alternation for the extension and the flag `i`. "
                     "`jpe?g` covers two extensions at once."),
        fr=dict(title="Nom de fichier image",
                statement="Reconnaissez un nom de fichier image : un nom fait d'une ou plusieurs lettres, chiffres, `_` "
                          "ou `-`, puis un point, puis l'une des extensions `jpg`, `jpeg`, `png` ou `gif`, quelle que soit la casse.",
                hint="`[\\w-]+` pour le nom, `\\.` pour un point littéral, une alternative pour l'extension et le flag `i`. "
                     "`jpe?g` couvre deux extensions d'un coup."),
        flags="i",
        match=["photo.jpg", "logo.PNG", "my-avatar_2.gif", "IMG_0042.JPG", "banner.png"],
        reject=["photo", "photo.pdf", ".png", "photo.jpg.exe", "my photo.png"],
        hidden_match=["cover.jpeg", "SCAN.JPEG", "a.Gif", "x-1.jpeg"],
        hidden_reject=["photo.jpgg", "photo.jpe", "photo,png", "photo.", "archive.tar.gif", "photo png"],
        ref=r"[\w-]+\.(?:jpe?g|png|gif)",
        wrong=r"[\w-]+\.(jpg|png|gif)",
    ),
    dict(
        slug="rx-moroccan-mobile", difficulty="medium", skills="regex,web",
        en=dict(title="Moroccan mobile number",
                statement="Match a Moroccan mobile number, without spaces, in one of two forms:\n"
                          "- `06` or `07` followed by 8 digits (e.g. `0612345678`);\n"
                          "- `+2126` or `+2127` followed by 8 digits (e.g. `+212612345678`).",
                hint="An alternation for the prefix: `0[67]` or `\\+212[67]` (the `+` must be escaped), then `\\d{8}`."),
        fr=dict(title="Numéro de mobile marocain",
                statement="Reconnaissez un numéro de mobile marocain, sans espaces, sous l'une des deux formes :\n"
                          "- `06` ou `07` suivi de 8 chiffres (ex. `0612345678`) ;\n"
                          "- `+2126` ou `+2127` suivi de 8 chiffres (ex. `+212612345678`).",
                hint="Une alternative pour le préfixe : `0[67]` ou `\\+212[67]` (le `+` doit être échappé), puis `\\d{8}`."),
        flags="",
        match=["0612345678", "0798765432", "+212612345678", "0600000000", "+212700112233"],
        reject=["0512345678", "061234567", "06123456789", "06 12 34 56 78", "212612345678"],
        hidden_match=["0711223344", "+212799999999", "+212600000000", "0699887766"],
        hidden_reject=["+2120612345678", "+212512345678", "0812345678", "+21261234567", "06-12345678", "+33612345678"],
        ref=r"(?:0[67]|\+212[67])\d{8}",
        wrong=r"0[67]\d{8}",
    ),
    dict(
        slug="rx-css-length", difficulty="medium", skills="regex,web",
        en=dict(title="CSS length",
                statement="Match a CSS length: an optional minus sign `-`, then a number, then a unit among "
                          "`px`, `em`, `rem` or `%` (lowercase, no space). The number is either an integer "
                          "(`12`), a decimal with digits on both sides of the dot (`1.5`), or a decimal starting "
                          "with the dot (`.5`).",
                hint="Number: `\\d+(?:\\.\\d+)?` or `\\.\\d+`. Unit: an alternation `(?:px|em|rem|%)`."),
        fr=dict(title="Longueur CSS",
                statement="Reconnaissez une longueur CSS : un signe moins `-` facultatif, puis un nombre, puis une unité "
                          "parmi `px`, `em`, `rem` ou `%` (minuscules, sans espace). Le nombre est soit un entier "
                          "(`12`), soit un décimal avec des chiffres des deux côtés du point (`1.5`), soit un décimal "
                          "qui commence par le point (`.5`).",
                hint="Nombre : `\\d+(?:\\.\\d+)?` ou `\\.\\d+`. Unité : une alternative `(?:px|em|rem|%)`."),
        flags="",
        match=["16px", "1.5rem", "100%", "-2em", "0px"],
        reject=["16", "px", "1.5 rem", "12pt", "1.rem"],
        hidden_match=[".5em", "-.25rem", "33.333%", "0.75rem", "-10px"],
        hidden_reject=["--2px", "1..5em", "12PX", ".em", "+3px", "1.5.2em"],
        ref=r"-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|rem|%)",
        wrong=r"-?\d+(?:\.\d+)?(?:px|em|rem|%)",
    ),
    dict(
        slug="rx-simple-email", difficulty="medium", skills="regex,web",
        en=dict(title="Simple email",
                statement="Match a (simplified) email address:\n"
                          "- a local part of one or more letters, digits, `.`, `_`, `%`, `+` or `-`;\n"
                          "- then `@`;\n"
                          "- then one or more domain labels (letters, digits, `-`), **each followed by a dot**;\n"
                          "- then a top-level domain of **at least 2 letters**.",
                hint="Domain: `(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}`. Inside a character class, put `-` last."),
        fr=dict(title="Email simple",
                statement="Reconnaissez une adresse email (simplifiée) :\n"
                          "- une partie locale d'une ou plusieurs lettres, chiffres, `.`, `_`, `%`, `+` ou `-` ;\n"
                          "- puis `@` ;\n"
                          "- puis un ou plusieurs labels de domaine (lettres, chiffres, `-`), **chacun suivi d'un point** ;\n"
                          "- puis une extension d'**au moins 2 lettres**.",
                hint="Domaine : `(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}`. Dans une classe de caractères, mettez `-` à la fin."),
        flags="",
        match=["ali@gmail.com", "sara.benali@ofppt.ma", "dev+test@mail.co.uk", "a_b-c@my-site.org", "X1@y2.io"],
        reject=["ali@gmail", "@gmail.com", "ali.gmail.com", "ali@gmail.c", "ali @gmail.com"],
        hidden_match=["first.last@sub.domain.ma", "o%k@x.dev", "user@host.travel", "a@b.cd"],
        hidden_reject=["user@site", "a@b@c.com", "user@.com", "user@site.c0m", "user@site..com", "user@site.com."],
        ref=r"[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}",
        wrong=r"\S+@\S+",
    ),
    dict(
        slug="rx-html-open-tag", difficulty="medium", skills="regex,web",
        en=dict(title="HTML opening tag",
                statement="Match an HTML opening tag **without attributes**: `<`, then a lowercase letter `a-z`, "
                          "then any number of lowercase letters or digits, then `>`. No spaces, no `/`.",
                hint="`<[a-z]` then a character class with `*` then `>`. `\\w` is too permissive (digits first, `_`, uppercase)."),
        fr=dict(title="Balise HTML ouvrante",
                statement="Reconnaissez une balise HTML ouvrante **sans attributs** : `<`, puis une lettre minuscule `a-z`, "
                          "puis un nombre quelconque de lettres minuscules ou de chiffres, puis `>`. Pas d'espace, pas de `/`.",
                hint="`<[a-z]` puis une classe de caractères avec `*` puis `>`. `\\w` est trop permissif (chiffre en premier, `_`, majuscules)."),
        flags="",
        match=["<div>", "<h1>", "<p>", "<section>", "<li>"],
        reject=["</div>", "<div class=\"x\">", "<br/>", "div", "<>"],
        hidden_match=["<a>", "<h6>", "<thead>", "<b>"],
        hidden_reject=["<1div>", "<my_tag>", "<DIV>", "< div>", "<div >", "<<div>>"],
        ref=r"<[a-z][a-z0-9]*>",
        wrong=r"<\w+>",
    ),

    # ================================================================= HARD
    dict(
        slug="rx-iso-date", difficulty="hard", skills="regex,web",
        en=dict(title="ISO date",
                statement="Match a date `YYYY-MM-DD`: 4 digits for the year, a month from `01` to `12`, "
                          "a day from `01` to `31` (no need to check the number of days of each month).",
                hint="Month: `0[1-9]` or `1[0-2]`. Day: `0[1-9]`, `[12]\\d` or `3[01]`."),
        fr=dict(title="Date ISO",
                statement="Reconnaissez une date `YYYY-MM-DD` : 4 chiffres pour l'année, un mois de `01` à `12`, "
                          "un jour de `01` à `31` (inutile de vérifier le nombre de jours de chaque mois).",
                hint="Mois : `0[1-9]` ou `1[0-2]`. Jour : `0[1-9]`, `[12]\\d` ou `3[01]`."),
        flags="",
        match=["2026-10-10", "1999-01-31", "2000-12-01", "2024-02-29", "2026-07-15"],
        reject=["2026-13-01", "2026-1-5", "26-10-10", "2026/10/10", "2026-10-32"],
        hidden_match=["0001-01-01", "2030-11-30", "1987-09-09", "2026-10-20"],
        hidden_reject=["2026-00-10", "2026-10-00", "2026-19-01", "2026-10-40", "20261010", "2026-10-1"],
        ref=r"\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])",
        wrong=r"\d{4}-\d{2}-\d{2}",
    ),
    dict(
        slug="rx-strong-password", difficulty="hard", skills="regex,web",
        en=dict(title="Strong password",
                statement="Match a password of **at least 8** characters, with no whitespace, containing at least "
                          "one lowercase letter `a-z`, at least one uppercase letter `A-Z` and at least one digit.",
                hint="Use lookaheads, one per rule: `(?=.*[a-z])`, `(?=.*[A-Z])`, `(?=.*\\d)`, then `\\S{8,}`."),
        fr=dict(title="Mot de passe fort",
                statement="Reconnaissez un mot de passe d'**au moins 8** caractères, sans espace, contenant au moins "
                          "une lettre minuscule `a-z`, au moins une lettre majuscule `A-Z` et au moins un chiffre.",
                hint="Utilisez des lookaheads, un par règle : `(?=.*[a-z])`, `(?=.*[A-Z])`, `(?=.*\\d)`, puis `\\S{8,}`."),
        flags="",
        match=["Passw0rd", "aB3defgh", "Laravel11!", "123abcXYZ", "S3cure#Pass"],
        reject=["password", "PASSWORD1", "Password", "Pa55", "Pass w0rd"],
        hidden_match=["zZ9zZ9zZ", "1aaaaaaA", "Hello2026", "Q1w2e3r4"],
        hidden_reject=["abc123xyz", "abcdefg1", "ABCDEFGH", "Ab1", "Abcdefg 1", "12345678"],
        ref=r"(?=.*[a-z])(?=.*[A-Z])(?=.*\d)\S{8,}",
        wrong=r"(?=.*[a-z])(?=.*\d)\S{8,}",
    ),
    dict(
        slug="rx-ipv4", difficulty="hard", skills="regex,web",
        en=dict(title="IPv4 address",
                statement="Match an IPv4 address: 4 numbers separated by dots, each number from `0` to `255`, "
                          "written **without leading zeros** (`0` is fine, `01` is not).",
                hint="One part: `25[0-5]`, `2[0-4]\\d`, `1\\d\\d` or `[1-9]?\\d`. Then `(?:part\\.){3}part`."),
        fr=dict(title="Adresse IPv4",
                statement="Reconnaissez une adresse IPv4 : 4 nombres séparés par des points, chaque nombre de `0` à `255`, "
                          "écrit **sans zéro inutile devant** (`0` est accepté, `01` non).",
                hint="Une partie : `25[0-5]`, `2[0-4]\\d`, `1\\d\\d` ou `[1-9]?\\d`. Puis `(?:partie\\.){3}partie`."),
        flags="",
        match=["192.168.1.1", "10.0.0.255", "127.0.0.1", "8.8.8.8", "255.255.255.0"],
        reject=["256.1.1.1", "192.168.1", "1.2.3.4.5", "192.168.01.1", "a.b.c.d"],
        hidden_match=["0.0.0.0", "249.250.199.100", "172.16.254.3", "1.10.100.200"],
        hidden_reject=["300.1.1.1", "1.1.1.260", "999.999.999.999", "00.1.1.1", "1.1.1.", "1..1.1"],
        ref=r"(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)",
        wrong=r"(?:\d{1,3}\.){3}\d{1,3}",
    ),
    dict(
        slug="rx-price-mad", difficulty="hard", skills="regex,web",
        en=dict(title="Price in MAD",
                statement="Match a price like `12.50 MAD` or `1,250.00 MAD`:\n"
                          "- the integer part is either `0`, or a number without leading zero written with no "
                          "separator (`1250`), or with a comma every 3 digits (`1,250`, `12,500,000`: the first "
                          "group has 1 to 3 digits and does not start with 0, each following group has exactly 3 digits);\n"
                          "- then a dot and **exactly 2** decimals;\n"
                          "- then one space and `MAD`.",
                hint="Integer part: `0`, `[1-9]\\d*` or `[1-9]\\d{0,2}(?:,\\d{3})+`. Then `\\.\\d{2} MAD`."),
        fr=dict(title="Prix en MAD",
                statement="Reconnaissez un prix comme `12.50 MAD` ou `1,250.00 MAD` :\n"
                          "- la partie entière est soit `0`, soit un nombre sans zéro devant écrit sans séparateur "
                          "(`1250`), soit avec une virgule tous les 3 chiffres (`1,250`, `12,500,000` : le premier "
                          "groupe a 1 à 3 chiffres et ne commence pas par 0, chaque groupe suivant a exactement 3 chiffres) ;\n"
                          "- puis un point et **exactement 2** décimales ;\n"
                          "- puis un espace et `MAD`.",
                hint="Partie entière : `0`, `[1-9]\\d*` ou `[1-9]\\d{0,2}(?:,\\d{3})+`. Puis `\\.\\d{2} MAD`."),
        flags="",
        match=["12.50 MAD", "1,250.00 MAD", "0.99 MAD", "1250.00 MAD", "12,500,000.00 MAD"],
        reject=["12.5 MAD", "12.50MAD", "12.50 mad", "1,25.00 MAD", "12.50"],
        hidden_match=["999,999.99 MAD", "7.00 MAD", "100.10 MAD", "1,000,000.00 MAD"],
        hidden_reject=[",100.00 MAD", "1,2500.00 MAD", "012.50 MAD", "1,,250.00 MAD", "0,100.00 MAD", "12.500 MAD", "1,250 MAD"],
        ref=r"(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)\.\d{2} MAD",
        wrong=r"[\d,]+\.\d{2} MAD",
    ),
]
