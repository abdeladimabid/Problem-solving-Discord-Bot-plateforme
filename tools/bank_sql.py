"""SQL challenges (SQLite dialect), English + French.

Students type ONE SELECT query. The bot runs it on every dataset (schema + dataset,
via sqlite3.executescript) and compares the rows with those of `ref`:
column names are ignored, row order is compared only when `ordered=True`,
floats are rounded to 2 decimals.

datasets[0] is shown to students; the others are hidden and contain edge cases
(NULLs, ties, duplicates, empty groups) that break wrong or hardcoded queries.
`wrong` is a plausible wrong query that must give a different result than `ref`
on at least one dataset (used as a test).
"""

# ============================================================== SCHOOL schema
SCHOOL_SCHEMA = """
CREATE TABLE students (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    city       TEXT,              -- NULL = unknown
    birth_year INTEGER NOT NULL
);
CREATE TABLE courses (
    id      INTEGER PRIMARY KEY,
    title   TEXT NOT NULL,
    credits INTEGER NOT NULL,
    teacher TEXT                  -- NULL = no teacher assigned yet
);
CREATE TABLE enrollments (
    student_id INTEGER NOT NULL REFERENCES students(id),
    course_id  INTEGER NOT NULL REFERENCES courses(id),
    grade      REAL,              -- out of 20, NULL = not graded yet
    PRIMARY KEY (student_id, course_id)
);
"""

SCHOOL_1 = """
INSERT INTO students (id, name, city, birth_year) VALUES
  (1, 'Amine',   'Casablanca', 2004),
  (2, 'Salma',   'Rabat',      2005),
  (3, 'Youssef', 'Casablanca', 2003),
  (4, 'Imane',   'Fes',        2005),
  (5, 'Omar',    'Rabat',      2004),
  (6, 'Khadija', 'Marrakech',  2006),
  (7, 'Hamza',   'Casablanca', 2005),
  (8, 'Nora',    'Tangier',    2004);
INSERT INTO courses (id, title, credits, teacher) VALUES
  (1, 'Web Basics',  4, 'Benali'),
  (2, 'PHP & MySQL', 5, 'Alaoui'),
  (3, 'JavaScript',  5, 'Benali'),
  (4, 'Algorithms',  3, 'Tazi'),
  (5, 'UX Design',   2, NULL);
INSERT INTO enrollments (student_id, course_id, grade) VALUES
  (1, 1, 15.5), (1, 2, 12),   (2, 1, 18),   (2, 3, 14.5),
  (3, 1, 9),    (3, 2, 11),   (3, 4, 8.5),  (4, 2, 16),
  (4, 3, NULL), (5, 4, 13),   (6, 3, 19),   (7, 1, 10.5);
"""

SCHOOL_2 = """
INSERT INTO students (id, name, city, birth_year) VALUES
  (1, 'Zakaria', 'Rabat',      2005),
  (2, 'Meryem',  'Rabat',      2005),
  (3, 'Ali',     NULL,         2006),
  (4, 'Ghita',   'Agadir',     2004),
  (5, 'Badr',    'Agadir',     2003),
  (6, 'Lamia',   'Casablanca', 2007),
  (7, 'Anas',    NULL,         2005);
INSERT INTO courses (id, title, credits, teacher) VALUES
  (1, 'Databases', 4, 'Tazi'),
  (2, 'Laravel',   5, NULL),
  (3, 'Docker',    3, 'Alaoui'),
  (4, 'React',     4, 'Benali');
INSERT INTO enrollments (student_id, course_id, grade) VALUES
  (1, 1, 14),   (2, 1, 14),   (3, 1, 9.5),
  (1, 2, NULL), (4, 2, 17),   (5, 2, NULL),
  (6, 3, NULL), (7, 3, NULL),
  (2, 4, 12),   (5, 4, 12),   (6, 4, 15);
"""

SCHOOL_3 = """
INSERT INTO students (id, name, city, birth_year) VALUES
  (1, 'Sami',   'Casablanca', 2004),
  (2, 'Rim',    'Casablanca', 2006),
  (3, 'Fatima', 'Fes',        2006),
  (4, 'Driss',  'Fes',        2002);
INSERT INTO courses (id, title, credits, teacher) VALUES
  (1, 'Networks', 3, 'Tazi'),
  (2, 'Python',   4, 'Benali'),
  (3, 'Security', 4, NULL),
  (4, 'Cloud',    2, 'Alaoui');
INSERT INTO enrollments (student_id, course_id, grade) VALUES
  (1, 1, 11),   (2, 1, 16),   (3, 1, 16),   (4, 1, 7),
  (1, 2, NULL), (2, 2, 13),   (3, 2, NULL);
"""

# ================================================================ SHOP schema
SHOP_SCHEMA = """
CREATE TABLE customers (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL
);
CREATE TABLE products (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL,
    category TEXT NOT NULL,
    price    REAL NOT NULL        -- in MAD
);
CREATE TABLE orders (
    id          INTEGER PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),   -- NULL = guest checkout
    order_date  TEXT NOT NULL                       -- 'YYYY-MM-DD'
);
CREATE TABLE order_items (
    order_id   INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    qty        INTEGER NOT NULL,
    PRIMARY KEY (order_id, product_id)
);
"""

SHOP_1 = """
INSERT INTO customers (id, name, city) VALUES
  (1, 'Karim',   'Rabat'),
  (2, 'Lina',    'Casablanca'),
  (3, 'Mehdi',   'Fes'),
  (4, 'Sara',    'Rabat'),
  (5, 'Yassine', 'Agadir'),
  (6, 'Hiba',    'Casablanca');
INSERT INTO products (id, name, category, price) VALUES
  (1,  'USB-C Cable',          'accessories', 49),
  (2,  'Wireless Mouse',       'accessories', 129),
  (3,  'Mechanical Keyboard',  'accessories', 450),
  (4,  'Laptop Stand',         'accessories', 199),
  (5,  '27in Monitor',         'screens',     1890),
  (6,  '24in Monitor',         'screens',     1290),
  (7,  'USB Hub 4 ports',      'accessories', 159),
  (8,  'Webcam HD',            'video',       349),
  (9,  'Ring Light',           'video',       210),
  (10, 'Portable SSD 1TB',     'storage',     990),
  (11, 'Flash Drive usb 64GB', 'storage',     89);
INSERT INTO orders (id, customer_id, order_date) VALUES
  (1, 1, '2026-01-05'),
  (2, 2, '2026-01-05'),
  (3, 1, '2026-01-07'),
  (4, 3, '2026-01-08'),
  (5, 4, '2026-01-08'),
  (6, 2, '2026-01-10');
INSERT INTO order_items (order_id, product_id, qty) VALUES
  (1, 1, 2),  (1, 2, 1),  (2, 5, 1),  (3, 3, 1),  (3, 1, 1),
  (4, 11, 3), (5, 8, 1),  (5, 9, 1),  (6, 10, 1), (6, 4, 2);
"""

SHOP_2 = """
INSERT INTO customers (id, name, city) VALUES
  (1, 'Adam',   'Rabat'),
  (2, 'Zineb',  'Fes'),
  (3, 'Rachid', 'Tangier'),
  (4, 'Aya',    'Rabat'),
  (5, 'Bilal',  'Oujda');
INSERT INTO products (id, name, category, price) VALUES
  (1, 'USB Microphone',      'audio',       300),
  (2, 'Headset Pro',         'audio',       300),
  (3, 'Gaming Mouse',        'accessories', 300),
  (4, 'Studio Monitor 32in', 'screens',     2500),
  (5, 'Monitor 27in',        'screens',     2500),
  (6, 'usb-c dock',          'accessories', 650),
  (7, 'Cable HDMI',          'accessories', 60),
  (8, 'Speakers',            'audio',       250),
  (9, 'Studio Headphones',   'audio',       400);
INSERT INTO orders (id, customer_id, order_date) VALUES
  (1, 1,    '2026-02-01'),
  (2, NULL, '2026-02-01'),
  (3, 2,    '2026-02-03'),
  (4, 1,    '2026-02-03'),
  (5, 5,    '2026-02-04'),
  (6, 2,    '2026-02-05');
INSERT INTO order_items (order_id, product_id, qty) VALUES
  (1, 4, 1), (1, 7, 2), (2, 1, 2), (3, 8, 2), (3, 7, 1),
  (4, 3, 1), (5, 6, 1), (5, 3, 1);
"""

SHOP_3 = """
INSERT INTO customers (id, name, city) VALUES
  (1, 'Nadia', 'Casablanca'),
  (2, 'Tarik', 'Casablanca'),
  (3, 'Ilyas', 'Meknes');
INSERT INTO products (id, name, category, price) VALUES
  (1, 'Keyboard',        'accessories', 200),
  (2, 'Mouse Pad XL',    'accessories', 80),
  (3, 'Monitor Arm',     'accessories', 200),
  (4, 'Usb Fan',         'gadgets',     80),
  (5, 'Lamp',            'gadgets',     120),
  (6, 'Cable Organizer', 'accessories', 200),
  (7, 'Webcam',          'accessories', 200),
  (8, 'Adapter',         'accessories', 200);
INSERT INTO orders (id, customer_id, order_date) VALUES
  (1, 3, '2026-03-01'),
  (2, 3, '2026-03-01'),
  (3, 1, '2026-03-02'),
  (4, 2, '2026-03-02');
INSERT INTO order_items (order_id, product_id, qty) VALUES
  (1, 1, 1), (2, 4, 5), (3, 5, 1), (3, 2, 1), (4, 6, 1), (4, 8, 2);
"""

SCHOOL = [SCHOOL_1, SCHOOL_2, SCHOOL_3]
SHOP = [SHOP_1, SHOP_2, SHOP_3]


SQL = [
    # ================================================================= EASY
    dict(
        slug="sql-casablanca-students", difficulty="easy", skills="sql,sorting",
        en=dict(
            title="Students from Casablanca",
            statement="Return the students who live in Casablanca.\n"
                      "Columns, in this order: `name`, `birth_year`.\n"
                      "Sort by `name` ascending.",
            hint="`WHERE city = '...'` then `ORDER BY name`. Without ORDER BY, rows come out in no guaranteed order.",
        ),
        fr=dict(
            title="Les étudiants de Casablanca",
            statement="Renvoyez les étudiants qui habitent à Casablanca.\n"
                      "Colonnes, dans cet ordre : `name`, `birth_year`.\n"
                      "Triez par `name` croissant.",
            hint="`WHERE city = '...'` puis `ORDER BY name`. Sans ORDER BY, l'ordre des lignes n'est pas garanti.",
        ),
        schema=SCHOOL_SCHEMA, datasets=SCHOOL,
        ref="""SELECT name, birth_year FROM students WHERE city = 'Casablanca' ORDER BY name""",
        wrong="""SELECT name, birth_year FROM students WHERE city = 'Casablanca' ORDER BY id""",
        ordered=True,
    ),
    dict(
        slug="sql-top3-expensive", difficulty="easy", skills="sql,sorting",
        en=dict(
            title="Top 3 most expensive products",
            statement="Return the 3 most expensive products.\n"
                      "Columns, in this order: `name`, `price`.\n"
                      "Sort by `price` descending, then by `name` ascending (to break ties), "
                      "and keep only the first 3 rows.",
            hint="`ORDER BY price DESC, name` then `LIMIT 3`. The tiebreaker decides which product wins when prices are equal.",
        ),
        fr=dict(
            title="Les 3 produits les plus chers",
            statement="Renvoyez les 3 produits les plus chers.\n"
                      "Colonnes, dans cet ordre : `name`, `price`.\n"
                      "Triez par `price` décroissant, puis par `name` croissant (pour départager les égalités), "
                      "et gardez seulement les 3 premières lignes.",
            hint="`ORDER BY price DESC, name` puis `LIMIT 3`. Le second critère décide qui gagne quand les prix sont égaux.",
        ),
        schema=SHOP_SCHEMA, datasets=SHOP,
        ref="""SELECT name, price FROM products ORDER BY price DESC, name ASC LIMIT 3""",
        wrong="""SELECT name, price FROM products ORDER BY price DESC LIMIT 3""",
        ordered=True,
    ),
    dict(
        slug="sql-young-cities", difficulty="easy", skills="sql",
        en=dict(
            title="Cities of the youngest students",
            statement="Return the list of cities where at least one student born in 2005 or later lives, "
                      "each city only once. Ignore students whose city is unknown (`NULL`).\n"
                      "One column: `city`. Sort alphabetically (ascending).",
            hint="`SELECT DISTINCT city ... WHERE birth_year >= 2005 AND city IS NOT NULL`.",
        ),
        fr=dict(
            title="Les villes des plus jeunes",
            statement="Renvoyez la liste des villes où habite au moins un étudiant né en 2005 ou après, "
                      "chaque ville une seule fois. Ignorez les étudiants dont la ville est inconnue (`NULL`).\n"
                      "Une colonne : `city`. Triez par ordre alphabétique (croissant).",
            hint="`SELECT DISTINCT city ... WHERE birth_year >= 2005 AND city IS NOT NULL`.",
        ),
        schema=SCHOOL_SCHEMA, datasets=SCHOOL,
        ref="""SELECT DISTINCT city FROM students
WHERE birth_year >= 2005 AND city IS NOT NULL
ORDER BY city""",
        wrong="""SELECT city FROM students
WHERE birth_year >= 2005 AND city IS NOT NULL
ORDER BY city""",
        ordered=True,
    ),
    dict(
        slug="sql-usb-search", difficulty="easy", skills="sql,strings",
        en=dict(
            title="Search bar: \"usb\"",
            statement="A customer types `usb` in the search bar. Return every product whose `name` contains "
                      "`usb` anywhere, in any case (USB, usb, Usb...).\n"
                      "Columns, in this order: `id`, `name`, `price`.\n"
                      "Sort by `price` ascending, then by `id` ascending.",
            hint="`LIKE` with `%` on both sides. In SQLite, `LIKE` ignores the case of ASCII letters.",
        ),
        fr=dict(
            title="Barre de recherche : « usb »",
            statement="Un client tape `usb` dans la barre de recherche. Renvoyez tous les produits dont le `name` "
                      "contient `usb` n'importe où, quelle que soit la casse (USB, usb, Usb...).\n"
                      "Colonnes, dans cet ordre : `id`, `name`, `price`.\n"
                      "Triez par `price` croissant, puis par `id` croissant.",
            hint="`LIKE` avec `%` des deux côtés. En SQLite, `LIKE` ignore la casse des lettres ASCII.",
        ),
        schema=SHOP_SCHEMA, datasets=SHOP,
        ref="""SELECT id, name, price FROM products WHERE name LIKE '%usb%' ORDER BY price, id""",
        wrong="""SELECT id, name, price FROM products WHERE name LIKE 'USB%' ORDER BY price, id""",
        ordered=True,
    ),

    # =============================================================== MEDIUM
    dict(
        slug="sql-students-per-city", difficulty="medium", skills="sql",
        en=dict(
            title="Students per city",
            statement="Count the students of each city. Students whose city is unknown (`NULL`) "
                      "must not appear in the result.\n"
                      "Columns, in this order: `city`, number of students.\n"
                      "Sort by the number of students descending, then by `city` ascending.",
            hint="`GROUP BY city` with `COUNT(*)`. GROUP BY puts all the NULL cities in their own group: filter them out first.",
        ),
        fr=dict(
            title="Étudiants par ville",
            statement="Comptez les étudiants de chaque ville. Les étudiants dont la ville est inconnue (`NULL`) "
                      "ne doivent pas apparaître dans le résultat.\n"
                      "Colonnes, dans cet ordre : `city`, nombre d'étudiants.\n"
                      "Triez par nombre d'étudiants décroissant, puis par `city` croissant.",
            hint="`GROUP BY city` avec `COUNT(*)`. GROUP BY range toutes les villes NULL dans un groupe à part : filtrez-les avant.",
        ),
        schema=SCHOOL_SCHEMA, datasets=SCHOOL,
        ref="""SELECT city, COUNT(*) AS n FROM students
WHERE city IS NOT NULL
GROUP BY city
ORDER BY n DESC, city ASC""",
        wrong="""SELECT city, COUNT(*) AS n FROM students
GROUP BY city
ORDER BY n DESC, city ASC""",
        ordered=True,
    ),
    dict(
        slug="sql-course-averages", difficulty="medium", skills="sql",
        en=dict(
            title="Course averages",
            statement="For each course that has **at least 2 grades** (ungraded enrollments, `grade IS NULL`, "
                      "do not count), return its average grade.\n"
                      "Columns, in this order: course `title`, number of grades, average grade.\n"
                      "Sort by the average descending, then by `title` ascending.",
            hint="JOIN courses and enrollments, `GROUP BY` the course, `HAVING ...`. "
                 "`COUNT(grade)` skips NULLs, `COUNT(*)` does not.",
        ),
        fr=dict(
            title="Moyennes par cours",
            statement="Pour chaque cours qui a **au moins 2 notes** (les inscriptions non notées, `grade IS NULL`, "
                      "ne comptent pas), renvoyez sa moyenne.\n"
                      "Colonnes, dans cet ordre : `title` du cours, nombre de notes, moyenne.\n"
                      "Triez par moyenne décroissante, puis par `title` croissant.",
            hint="JOIN entre courses et enrollments, `GROUP BY` le cours, `HAVING ...`. "
                 "`COUNT(grade)` ignore les NULL, `COUNT(*)` non.",
        ),
        schema=SCHOOL_SCHEMA, datasets=SCHOOL,
        ref="""SELECT c.title, COUNT(e.grade) AS n, AVG(e.grade) AS average
FROM courses c JOIN enrollments e ON e.course_id = c.id
GROUP BY c.id, c.title
HAVING COUNT(e.grade) >= 2
ORDER BY average DESC, c.title ASC""",
        wrong="""SELECT c.title, COUNT(*) AS n, AVG(e.grade) AS average
FROM courses c JOIN enrollments e ON e.course_id = c.id
GROUP BY c.id, c.title
HAVING COUNT(*) >= 2
ORDER BY average DESC, c.title ASC""",
        ordered=True,
    ),
    dict(
        slug="sql-customers-without-orders", difficulty="medium", skills="sql",
        en=dict(
            title="Customers who never ordered",
            statement="Return the customers who have never placed an order. "
                      "Careful: guest orders have `customer_id = NULL`.\n"
                      "Columns, in this order: `name`, `city`.\n"
                      "Sort by `name` ascending.",
            hint="`LEFT JOIN orders` then keep the rows where the order side `IS NULL`. "
                 "`NOT IN (subquery)` returns nothing at all if the subquery contains a NULL!",
        ),
        fr=dict(
            title="Clients qui n'ont jamais commandé",
            statement="Renvoyez les clients qui n'ont jamais passé de commande. "
                      "Attention : les commandes invitées ont `customer_id = NULL`.\n"
                      "Colonnes, dans cet ordre : `name`, `city`.\n"
                      "Triez par `name` croissant.",
            hint="`LEFT JOIN orders` puis gardez les lignes où le côté commande `IS NULL`. "
                 "`NOT IN (sous-requête)` ne renvoie rien du tout si la sous-requête contient un NULL !",
        ),
        schema=SHOP_SCHEMA, datasets=SHOP,
        ref="""SELECT c.name, c.city
FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL
ORDER BY c.name""",
        wrong="""SELECT name, city FROM customers
WHERE id NOT IN (SELECT customer_id FROM orders)
ORDER BY name""",
        ordered=True,
    ),
    dict(
        slug="sql-enrollments-per-course", difficulty="medium", skills="sql",
        en=dict(
            title="Enrollments per course (even empty ones)",
            statement="For **every** course, count the enrolled students (graded or not). "
                      "Courses with no enrollment must appear with `0`.\n"
                      "Columns, in this order: course `title`, number of enrolled students.\n"
                      "Sort by the number descending, then by `title` ascending.",
            hint="`LEFT JOIN` keeps courses without enrollments. Then count a column of enrollments "
                 "(e.g. `COUNT(e.student_id)`), because `COUNT(*)` would count the empty row as 1.",
        ),
        fr=dict(
            title="Inscrits par cours (même les vides)",
            statement="Pour **chaque** cours, comptez les étudiants inscrits (notés ou non). "
                      "Les cours sans inscription doivent apparaître avec `0`.\n"
                      "Colonnes, dans cet ordre : `title` du cours, nombre d'inscrits.\n"
                      "Triez par nombre décroissant, puis par `title` croissant.",
            hint="`LEFT JOIN` garde les cours sans inscription. Comptez ensuite une colonne d'enrollments "
                 "(ex. `COUNT(e.student_id)`), car `COUNT(*)` compterait la ligne vide comme 1.",
        ),
        schema=SCHOOL_SCHEMA, datasets=SCHOOL,
        ref="""SELECT c.title, COUNT(e.student_id) AS n
FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id
GROUP BY c.id, c.title
ORDER BY n DESC, c.title ASC""",
        wrong="""SELECT c.title, COUNT(*) AS n
FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id
GROUP BY c.id, c.title
ORDER BY n DESC, c.title ASC""",
        ordered=True,
    ),
    dict(
        slug="sql-big-orders", difficulty="medium", skills="sql",
        en=dict(
            title="Big orders",
            statement="The amount of an order is the sum of `qty * price` over its items. "
                      "Return the orders whose amount is **at least 500**.\n"
                      "Columns, in this order: order `id`, customer `name` (`NULL` for guest orders, "
                      "which have no customer), amount.\n"
                      "Sort by amount descending, then by order `id` ascending.",
            hint="JOIN order_items and products, `LEFT JOIN customers` (guest orders have no customer), "
                 "`GROUP BY` the order, `HAVING SUM(...) >= 500`.",
        ),
        fr=dict(
            title="Grosses commandes",
            statement="Le montant d'une commande est la somme de `qty * price` sur ses lignes. "
                      "Renvoyez les commandes dont le montant est **d'au moins 500**.\n"
                      "Colonnes, dans cet ordre : `id` de la commande, `name` du client (`NULL` pour les "
                      "commandes invitées, qui n'ont pas de client), montant.\n"
                      "Triez par montant décroissant, puis par `id` de commande croissant.",
            hint="JOIN order_items et products, `LEFT JOIN customers` (les commandes invitées n'ont pas de client), "
                 "`GROUP BY` la commande, `HAVING SUM(...) >= 500`.",
        ),
        schema=SHOP_SCHEMA, datasets=SHOP,
        ref="""SELECT o.id, c.name, SUM(oi.qty * p.price) AS amount
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id
LEFT JOIN customers c ON c.id = o.customer_id
GROUP BY o.id, c.name
HAVING SUM(oi.qty * p.price) >= 500
ORDER BY amount DESC, o.id ASC""",
        wrong="""SELECT o.id, c.name, SUM(oi.qty * p.price) AS amount
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id
JOIN customers c ON c.id = o.customer_id
GROUP BY o.id, c.name
HAVING SUM(p.price) >= 500
ORDER BY amount DESC, o.id ASC""",
        ordered=True,
    ),
    dict(
        slug="sql-grade-status", difficulty="medium", skills="sql",
        en=dict(
            title="Pass, fail or pending",
            statement="For every enrollment, return a status: `'pass'` if the grade is 10 or more, "
                      "`'fail'` if it is below 10, `'pending'` if there is no grade yet (`NULL`).\n"
                      "Columns, in this order: student `name`, course `title`, status.\n"
                      "Sort by student `name` ascending, then by course `title` ascending.",
            hint="`CASE WHEN grade IS NULL THEN ... WHEN grade >= 10 THEN ... ELSE ... END`. "
                 "A comparison with NULL is never true, so NULL falls into the ELSE.",
        ),
        fr=dict(
            title="Validé, échoué ou en attente",
            statement="Pour chaque inscription, renvoyez un statut : `'pass'` si la note vaut 10 ou plus, "
                      "`'fail'` si elle est inférieure à 10, `'pending'` s'il n'y a pas encore de note (`NULL`).\n"
                      "Colonnes, dans cet ordre : `name` de l'étudiant, `title` du cours, statut.\n"
                      "Triez par `name` de l'étudiant croissant, puis par `title` du cours croissant.",
            hint="`CASE WHEN grade IS NULL THEN ... WHEN grade >= 10 THEN ... ELSE ... END`. "
                 "Une comparaison avec NULL n'est jamais vraie : NULL tombe dans le ELSE.",
        ),
        schema=SCHOOL_SCHEMA, datasets=SCHOOL,
        ref="""SELECT s.name, c.title,
       CASE WHEN e.grade IS NULL THEN 'pending'
            WHEN e.grade >= 10 THEN 'pass'
            ELSE 'fail' END AS status
FROM enrollments e
JOIN students s ON s.id = e.student_id
JOIN courses c ON c.id = e.course_id
ORDER BY s.name, c.title""",
        wrong="""SELECT s.name, c.title,
       CASE WHEN e.grade >= 10 THEN 'pass' ELSE 'fail' END AS status
FROM enrollments e
JOIN students s ON s.id = e.student_id
JOIN courses c ON c.id = e.course_id
ORDER BY s.name, c.title""",
        ordered=True,
    ),

    # ================================================================= HARD
    dict(
        slug="sql-above-course-average", difficulty="hard", skills="sql",
        en=dict(
            title="Above the course average",
            statement="Return the enrollments whose grade is **strictly above the average grade of the same course** "
                      "(the average ignores ungraded enrollments).\n"
                      "Columns, in this order: student `name`, course `title`, `grade`.\n"
                      "Sort by course `title` ascending, then `grade` descending, then student `name` ascending.",
            hint="Correlated subquery: `WHERE e.grade > (SELECT AVG(e2.grade) FROM enrollments e2 WHERE e2.course_id = e.course_id)`.",
        ),
        fr=dict(
            title="Au-dessus de la moyenne du cours",
            statement="Renvoyez les inscriptions dont la note est **strictement supérieure à la moyenne du même cours** "
                      "(la moyenne ignore les inscriptions non notées).\n"
                      "Colonnes, dans cet ordre : `name` de l'étudiant, `title` du cours, `grade`.\n"
                      "Triez par `title` du cours croissant, puis `grade` décroissant, puis `name` croissant.",
            hint="Sous-requête corrélée : `WHERE e.grade > (SELECT AVG(e2.grade) FROM enrollments e2 WHERE e2.course_id = e.course_id)`.",
        ),
        schema=SCHOOL_SCHEMA, datasets=SCHOOL,
        ref="""SELECT s.name, c.title, e.grade
FROM enrollments e
JOIN students s ON s.id = e.student_id
JOIN courses c ON c.id = e.course_id
WHERE e.grade > (SELECT AVG(e2.grade) FROM enrollments e2 WHERE e2.course_id = e.course_id)
ORDER BY c.title ASC, e.grade DESC, s.name ASC""",
        wrong="""SELECT s.name, c.title, e.grade
FROM enrollments e
JOIN students s ON s.id = e.student_id
JOIN courses c ON c.id = e.course_id
WHERE e.grade > (SELECT AVG(grade) FROM enrollments)
ORDER BY c.title ASC, e.grade DESC, s.name ASC""",
        ordered=True,
    ),
    dict(
        slug="sql-best-per-course", difficulty="hard", skills="sql",
        en=dict(
            title="Best student of each course",
            statement="For each course, return the student(s) with the highest grade. "
                      "If several students share the best grade, return **all** of them. "
                      "Ignore ungraded enrollments: a course with no grade at all does not appear.\n"
                      "Columns, in this order: course `title`, student `name`, `grade`.\n"
                      "Sort by course `title` ascending, then student `name` ascending.",
            hint="`RANK() OVER (PARTITION BY course_id ORDER BY grade DESC)` in a subquery or CTE, then keep rank 1. "
                 "`ROW_NUMBER()` would keep only one student in case of a tie.",
        ),
        fr=dict(
            title="Le meilleur de chaque cours",
            statement="Pour chaque cours, renvoyez l'étudiant (ou les étudiants) ayant la meilleure note. "
                      "Si plusieurs étudiants ont la meilleure note, renvoyez-les **tous**. "
                      "Ignorez les inscriptions non notées : un cours sans aucune note n'apparaît pas.\n"
                      "Colonnes, dans cet ordre : `title` du cours, `name` de l'étudiant, `grade`.\n"
                      "Triez par `title` du cours croissant, puis `name` de l'étudiant croissant.",
            hint="`RANK() OVER (PARTITION BY course_id ORDER BY grade DESC)` dans une sous-requête ou un CTE, puis gardez le rang 1. "
                 "`ROW_NUMBER()` ne garderait qu'un seul étudiant en cas d'égalité.",
        ),
        schema=SCHOOL_SCHEMA, datasets=SCHOOL,
        ref="""WITH ranked AS (
  SELECT e.course_id, e.student_id, e.grade,
         RANK() OVER (PARTITION BY e.course_id ORDER BY e.grade DESC) AS rk
  FROM enrollments e
  WHERE e.grade IS NOT NULL
)
SELECT c.title, s.name, r.grade
FROM ranked r
JOIN courses c ON c.id = r.course_id
JOIN students s ON s.id = r.student_id
WHERE r.rk = 1
ORDER BY c.title, s.name""",
        wrong="""WITH ranked AS (
  SELECT e.course_id, e.student_id, e.grade,
         ROW_NUMBER() OVER (PARTITION BY e.course_id ORDER BY e.grade DESC) AS rk
  FROM enrollments e
  WHERE e.grade IS NOT NULL
)
SELECT c.title, s.name, r.grade
FROM ranked r
JOIN courses c ON c.id = r.course_id
JOIN students s ON s.id = r.student_id
WHERE r.rk = 1
ORDER BY c.title, s.name""",
        ordered=True,
    ),
    dict(
        slug="sql-top2-per-category", difficulty="hard", skills="sql",
        en=dict(
            title="Top 2 per category",
            statement="For each category, return its 2 most expensive products (fewer if the category has fewer). "
                      "When prices are equal, the product whose `name` comes first alphabetically wins. "
                      "Exactly 2 products per category at most, even with ties.\n"
                      "Columns, in this order: `category`, `name`, `price`.\n"
                      "Sort by `category` ascending, then `price` descending, then `name` ascending.",
            hint="`ROW_NUMBER() OVER (PARTITION BY category ORDER BY price DESC, name)` then keep `<= 2`. "
                 "`RANK()` would give the same rank to tied products and return too many rows.",
        ),
        fr=dict(
            title="Top 2 par catégorie",
            statement="Pour chaque catégorie, renvoyez ses 2 produits les plus chers (moins si la catégorie en a moins). "
                      "À prix égal, le produit dont le `name` vient en premier dans l'ordre alphabétique gagne. "
                      "Au plus 2 produits par catégorie, même en cas d'égalité.\n"
                      "Colonnes, dans cet ordre : `category`, `name`, `price`.\n"
                      "Triez par `category` croissant, puis `price` décroissant, puis `name` croissant.",
            hint="`ROW_NUMBER() OVER (PARTITION BY category ORDER BY price DESC, name)` puis gardez `<= 2`. "
                 "`RANK()` donnerait le même rang aux ex æquo et renverrait trop de lignes.",
        ),
        schema=SHOP_SCHEMA, datasets=SHOP,
        ref="""SELECT category, name, price FROM (
  SELECT category, name, price,
         ROW_NUMBER() OVER (PARTITION BY category ORDER BY price DESC, name ASC) AS rn
  FROM products
)
WHERE rn <= 2
ORDER BY category ASC, price DESC, name ASC""",
        wrong="""SELECT category, name, price FROM (
  SELECT category, name, price,
         RANK() OVER (PARTITION BY category ORDER BY price DESC) AS rn
  FROM products
)
WHERE rn <= 2
ORDER BY category ASC, price DESC, name ASC""",
        ordered=True,
    ),
    dict(
        slug="sql-daily-running-total", difficulty="hard", skills="sql",
        en=dict(
            title="Daily revenue and running total",
            statement="The revenue of a day is the sum of `qty * price` of all the items of all the orders of that day. "
                      "For each day that has at least one ordered item, return the revenue of the day and the "
                      "running total (sum of the revenues of that day and all previous days).\n"
                      "Columns, in this order: `order_date`, day revenue, running total.\n"
                      "Sort by `order_date` ascending.",
            hint="First aggregate per day (`GROUP BY order_date`, in a CTE), then "
                 "`SUM(revenue) OVER (ORDER BY order_date)`. Several orders can share the same day!",
        ),
        fr=dict(
            title="Chiffre d'affaires du jour et cumul",
            statement="Le chiffre d'affaires d'un jour est la somme de `qty * price` de toutes les lignes de toutes "
                      "les commandes de ce jour. Pour chaque jour ayant au moins une ligne commandée, renvoyez le "
                      "chiffre du jour et le cumul (somme des chiffres de ce jour et de tous les jours précédents).\n"
                      "Colonnes, dans cet ordre : `order_date`, chiffre du jour, cumul.\n"
                      "Triez par `order_date` croissant.",
            hint="Agrégez d'abord par jour (`GROUP BY order_date`, dans un CTE), puis "
                 "`SUM(revenue) OVER (ORDER BY order_date)`. Plusieurs commandes peuvent tomber le même jour !",
        ),
        schema=SHOP_SCHEMA, datasets=SHOP,
        ref="""WITH daily AS (
  SELECT o.order_date, SUM(oi.qty * p.price) AS revenue
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN products p ON p.id = oi.product_id
  GROUP BY o.order_date
)
SELECT order_date, revenue, SUM(revenue) OVER (ORDER BY order_date) AS running
FROM daily
ORDER BY order_date""",
        wrong="""WITH per_order AS (
  SELECT o.id, o.order_date, SUM(oi.qty * p.price) AS revenue
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN products p ON p.id = oi.product_id
  GROUP BY o.id, o.order_date
)
SELECT order_date, revenue, SUM(revenue) OVER (ORDER BY order_date, id) AS running
FROM per_order
ORDER BY order_date, id""",
        ordered=True,
    ),
]
