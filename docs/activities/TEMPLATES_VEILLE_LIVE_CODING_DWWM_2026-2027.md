# Templates Veille, Live Coding & Workshop — YouCode / DWWM 2026-2027 (A1)

> **Purpose:** the reference format Claude must follow every time it generates a daily *veille*, a *live coding* or a *workshop* for the A1 promotion.
> **Companion of:** `A1_DWWM_2026-2027_context_analysis.md`, `VEILLE_INSPIRATION_DWWM.md`.
> **Conventions:** rules in English, templates and generated content in **French**. Learners are addressed with **« tu »** in veilles (as in the original template).
>
> ClassBot's **Activités** page (dashboard → Projects → Activités) follows this file: `src/shared/activities.ts` checks every item
> against the rules below and writes the markdown from the AI's JSON with these exact sections. Change both together.
>
> **Programme only:** the classes of a programme run different briefs but study the same concepts (and share these
> activities), so everything comes from the programme week: objective, *Concepts & Exigences techniques*, competencies,
> technologies. No brief is used. Topic ideas: `VEILLE_INSPIRATION_DWWM.md` (inspiration only).

---

## 1. Weekly planning rules

- **One veille per day** (Monday → Friday), **09:15, 30 min**. Learners prepare and present it.
- **Two live codings per week**, **11:00, 45 min**, by default on **Tuesday and Thursday** (the day *after* or *of* the veille they apply).
- Order the veilles **in the order the week's concepts build on each other** (read the planning row: *Concepts & Exigences techniques*).
- Skip any topic already covered as an introduction (e.g. "intro DOM done this week" → next week starts at the next step).
- The last day of the programme week (usually Friday) = lighter topic (good practices, debugging, quality): the week's work is handed in.
- **Never require a concept taught in a later week** (check the next planning row and list it as *Hors périmètre*).
- **Extra activity:** a day without a live coding can get one, or a **workshop** (section 4), at 11:00. One activity per slot: the page asks before replacing what a slot already has, and a week's generation skips what exists ("already generated").
- Public holidays / vacation days → no veille, no live coding that day.

### Week overview block (start of the document)

```markdown
## Analyse de la semaine

{1–2 phrases : semaine N du programme (JJ–JJ/MM/AAAA), sprint, compétences, objectif.}

| Jour | Veille 09:15 (30 min) | Live coding 11:00 (45 min) | Progression attendue (programme) |
| --- | --- | --- | --- |
| Lun JJ/MM | {titre} | — | {notion du programme atteinte} |
| Mar JJ/MM | {titre} | LC1 : {titre} | {notion du programme atteinte} |
| Mer JJ/MM | {titre} | — | {notion du programme atteinte} |
| Jeu JJ/MM | {titre} | LC2 : {titre} | {notion du programme atteinte} |
| Ven JJ/MM | {titre} | — | Consolidation de la semaine : bonnes pratiques, débogage, qualité |

**Ce dont les apprenants auront besoin (et où c'est couvert)**
- {besoin} : {veille / live coding}

**Hors périmètre cette semaine** ({semaine suivante du programme}) : {notions à ne pas exiger}.

**Points ouverts**
- {question à valider par le formateur}
```

---

## 2. Veille template

### Rules

- **Length:** fits a 30-min learner presentation → 3–5 objectives, plan in 2–3 parts (3–4 bullets each), 2–3 reflection questions.
- **Contexte:** 3–5 sentences, links the topic to what learners already know and to the week's concepts. No jargon without explanation.
- **Objectifs:** each starts with an action verb (*Expliquer, Utiliser, Choisir, Distinguer, Mettre en place…*).
- **Questions de réflexion:** questions that make learners think (why / when / what if), not definitions.
- **Ressources:** 3–4 links, French first: MDN (fr) and JavaScript.info (fr), plus one tool if useful (regex101, DevTools docs). Never invent a URL.
- **Livrable:** always the 30-min presentation + one concrete artefact (schema, comparison table, checklist) + one **live demo** + answers to the questions.
- **Critères:** 3–4 observable criteria + always « La présentation est claire et respecte le temps ».
- Code names in backticks (`querySelector`). Emojis only on section headings, as below.

### Template

```markdown
## {Jour JJ/MM} — Veille : {Titre}

09:15 · 30 min · Veille

**📌 Contexte**

{3–5 phrases : ce que l'apprenant sait déjà, pourquoi ce sujet maintenant, lien avec les concepts de la semaine.}

**🎯 Objectifs d'apprentissage**

À la fin de cette veille, tu dois être capable de :

- {Verbe d'action + objectif}
- {Verbe d'action + objectif}
- {Verbe d'action + objectif}

**📚 Plan à suivre**

1️⃣ {Partie 1}

- {Point à explorer}
- {Point à explorer}

2️⃣ {Partie 2}

- {Point à explorer}
- {Point à explorer}

3️⃣ {Partie 3 — optionnelle}

- {Point à explorer}

**❓ Questions de réflexion**

Tu dois répondre à ces questions dans ta présentation :

- {Question pourquoi / quand / que se passe-t-il si…}
- {Question}

**🔗 Ressources conseillées**

- MDN – {Titre} : {URL}
- JavaScript.info – {Titre} : {URL}

**📦 Livrable attendu**

- Une présentation (slides ou démo) de 30 minutes maximum
- {Artefact : schéma / tableau comparatif / checklist}
- Une démo : {ce qui doit être montré en direct}
- Les réponses aux questions de réflexion

**✅ Critères d'évaluation**

- {Critère observable}
- {Critère observable}
- {Critère observable}
- La présentation est claire et respecte le temps
```

---

## 3. Live coding template

### Rules — keep it simple (learners are beginners)

- **Trainer at the keyboard, learners code in parallel** → every step must be typeable live in the time given.
- **One small, concrete goal** per live coding, directly reusable in the week's projects (whatever brief each class runs).
- **Small dataset / small form:** max 4–5 items in a data array, max 3 form fields, max 3–4 properties per object.
- **Code size:** `app.js` ≈ 40–60 lines max; HTML starter ≈ 25 lines; CSS minimal (5–6 rules), given ready-made.
- **At most 2 named functions.** Plain `function`, `for...of`, simple `if`. No advanced patterns (no objects of functions, no `DocumentFragment`, no lookaheads in Regex, no chaining tricks) unless the week explicitly teaches them.
- **Only notions seen in the week's veilles** (or before). Reuse a notion from an earlier veille when natural (e.g. `nextElementSibling` from Monday).
- **Build progressively:** first one element / one field "by hand", then generalise (function, loop, delegation).
- **Déroulé table:** 4–5 steps, minutes **must add up to exactly 45**.
- Anything harder goes in **« ➕ Si le temps le permet »** (1–2 items max).
- Theme = the concept practised (e.g. a list of users for a CRUD), never a client, a company or a class's project: the sprint, the planning and the competencies decide. Fictional Moroccan first names, prices in DH, phones 06/07. The teacher's proposal (Regenerate) can set the example.
- Comments in the code: short, in French, only where they help.

### Template

````markdown
## {Jour JJ/MM} — Live coding {N} : {Titre}

11:00 · 45 min · Live coding (formateur au clavier, apprenants qui codent en parallèle)

**🎯 Objectifs pédagogiques**

- {Objectif 1 — verbe d'action}
- {Objectif 2}
- {Objectif 3}

**📌 Contexte général**

{2–4 phrases : le concept du programme travaillé, la compétence visée, ce qu'on va construire pour le pratiquer.}

**⏱️ Déroulé**

| Minutes | Étape | Notions montrées |
| --- | --- | --- |
| 0–5 | Présenter le besoin et le starter | {notions} |
| 5–20 | {Étape 1 : un seul élément / champ « à la main »} | {notions} |
| 20–30 | {Étape 2 : généraliser (fonction, boucle, délégation)} | {notions} |
| 30–40 | {Étape 3 : cas particulier / envoi / état} | {notions} |
| 40–45 | Tester en direct, récap | — |

**💻 Starter — index.html**

```html
{HTML minimal, script chargé avec defer}
```

**💻 style.css (minimal)**

```css
{5–6 règles max}
```

**💻 Code final — app.js**

```javascript
{40–60 lignes max, 2 fonctions nommées max}
```

**🧪 Cas à tester en direct** *(optionnel, surtout pour les formulaires)*

| Champ / Action | Saisie | Résultat |
| --- | --- | --- |
| {champ} | `{valeur}` | {Valide / Invalide (raison)} |

**⚠️ Point d'attention** *(optionnel : piège à montrer, ex. innerHTML)*

{2–3 phrases : quoi montrer, quelle règle retenir.}

**➕ Si le temps le permet**

- {Extension 1}
- {Extension 2}

**❓ Points de réflexion**

- {Question}
- {Question}

**✅ Résultat attendu**

- {Ce que chaque apprenant a sur son écran à la fin}
- {Ce que l'apprenant sait expliquer}
````

---

## 4. Workshop template

An **extra activity** for a day without a live coding (Monday, Wednesday, Friday by default): on the Activités page,
**✨ Generate an activity** on the day's free 11:00 lets the teacher choose a **live coding** (template 3) or a **workshop**.
The 11:00 slot holds one of them, never both. Like everything else, a workshop comes from the programme week only.

### Rules

- **Learners at the keyboard, in small groups (2 or 3); the trainer goes from group to group.** Every step must be doable alone with its instructions.
- **45 to 60 min.** The déroulé has **4 to 6 steps** whose minutes **add up exactly** to the duration given.
- **One short, guided exercise** on the day's concept (usually the morning's veille), reusable in any project of the week.
- **3 objectives** (each starts with an action verb in the infinitive), a context of **2 to 4 sentences**, the groups' organisation.
- **3 to 6 step-by-step instructions** (*Consignes par étapes*), each saying precisely what to do.
- **Data or a starter:** max 5 data items, max 3 form fields, a starter of **40 lines max**.
- **3 to 5 success criteria** (observable), **1 or 2** ideas *Pour aller plus loin*, **2 or 3** *Points de réflexion*.
- **Only notions seen in the week's veilles** (or before); no advanced pattern; no JavaScript in an HTML/CSS week.

### Template

````markdown
## {Jour JJ/MM} — Workshop : {Titre}

11:00 · {45–60} min · Workshop (les apprenants codent en petits groupes, le formateur circule)

**🎯 Objectifs pédagogiques**

- {Objectif 1 — verbe d'action}
- {Objectif 2}
- {Objectif 3}

**📌 Contexte**

{2–4 phrases : le concept du programme pratiqué, la compétence visée, ce que les groupes construisent.}

Organisation : {groupes de 2 ou 3, le formateur circule et aide}

**⏱️ Déroulé**

| Minutes | Étape | Notions travaillées |
| --- | --- | --- |
| 0–5 | Présentation de l'exercice et des groupes | {notions} |
| 5–20 | {Étape 1} | {notions} |
| 20–35 | {Étape 2} | {notions} |
| 35–45 | {Étape 3} | {notions} |
| 45–50 | Mise en commun, récap | — |

**🧭 Consignes par étapes**

1️⃣ {Étape 1 : titre}

{Ce que les apprenants font, précisément.}

2️⃣ {Étape 2 : titre}

{…}

**💻 Données / starter — {fichier}**

```{langage}
{40 lignes max}
```

{ou, sans starter : **💻 Données de l'exercice** puis les données en une phrase ou une courte liste}

**✅ Critères de réussite**

- {Critère observable 1}
- {Critère observable 2}
- {Critère observable 3}

**➕ Pour aller plus loin**

- {Pour les groupes en avance}

**❓ Points de réflexion**

- {Question}
- {Question}
````

---

## 5. Pre-delivery checklist

1. Veilles follow the order of the week's concepts; no topic already covered as intro.
2. No concept from a later week is required (checked against the next planning row).
3. Each veille has all 8 sections in the template order, with a live demo in the deliverable.
4. Each live coding: déroulé totals 45 min, ≤ 60 lines of JS, ≤ 2 functions, ≤ 5 data items / ≤ 3 fields.
5. Live coding uses only notions from the week's veilles (or earlier).
6. Each workshop: 45–60 min, déroulé of 4–6 steps adding up exactly, 3–6 instructions, 3–5 success criteria, starter ≤ 40 lines.
7. Métier, names and data are fictional and coherent with the sprint.
8. Links are real (MDN fr, JavaScript.info fr, official docs); no invented URL.
9. French, « tu » in veilles, code names in backticks.
