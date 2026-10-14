# Templates Veille & Live Coding — YouCode / DWWM 2026-2027 (A1)

> **Purpose:** the reference format Claude must follow every time it generates a daily *veille* or a *live coding* for the A1 promotion.
> **Companion of:** `A1_DWWM_2026-2027_context_analysis.md`, `BRIEF_FORMAT_SPEC_DWWM_2026-2027.md`, `METIERS_POOL_DWWM_2026-2027.md`.
> **Conventions:** rules in English, templates and generated content in **French**. Learners are addressed with **« tu »** in veilles (as in the original template).
>
> ClassBot's **Activités** page (dashboard → Projects → Activités) follows this file: `src/shared/activities.ts` checks every item
> against the rules below and writes the markdown from the AI's JSON with these exact sections. Change both together.

---

## 1. Weekly planning rules

- **One veille per day** (Monday → Friday), **09:15, 30 min**. Learners prepare and present it.
- **Two live codings per week**, **11:00, 45 min**, by default on **Tuesday and Thursday** (the day *after* or *of* the veille they apply).
- Order the veilles **in the order the week's brief needs them** (read the planning row: *Concepts & Exigences techniques*).
- Skip any topic already covered as an introduction (e.g. "intro DOM done this week" → next week starts at the next step).
- Friday veille = lighter topic (good practices, debugging, quality), since it is the brief's submission day.
- **Never require a concept taught in a later brief** (check the next planning row and list it as *Hors périmètre*).
- Public holidays / vacation days → no veille, no live coding that day.

### Week overview block (start of the document)

```markdown
## Analyse de la semaine

{1–2 phrases : semaine N (JJ–JJ/MM/AAAA), sprint, brief, mode, compétences.}

| Jour | Veille 09:15 (30 min) | Live coding 11:00 (45 min) | Avancement attendu du brief |
| --- | --- | --- | --- |
| Lun JJ/MM | {titre} | — | {étape du brief} |
| Mar JJ/MM | {titre} | LC1 : {titre} | {étape du brief} |
| Mer JJ/MM | {titre} | — | {étape du brief} |
| Jeu JJ/MM | {titre} | LC2 : {titre} | {étape du brief} |
| Ven JJ/MM | {titre} | — | Finitions, README, déploiement, soumission avant 23:59 |

**Ce dont les apprenants auront besoin (et où c'est couvert)**
- {besoin} : {veille / live coding}

**Hors périmètre cette semaine** ({brief suivant}) : {notions à ne pas exiger}.

**Points ouverts**
- {question à valider par le formateur}
```

---

## 2. Veille template

### Rules

- **Length:** fits a 30-min learner presentation → 3–5 objectives, plan in 2–3 parts (3–4 bullets each), 2–3 reflection questions.
- **Contexte:** 3–5 sentences, links the topic to what learners already know and to the current brief. No jargon without explanation.
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

{3–5 phrases : ce que l'apprenant sait déjà, pourquoi ce sujet maintenant, lien avec le brief.}

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
- **One small, concrete goal** per live coding, directly reusable in the brief.
- **Small dataset / small form:** max 4–5 items in a data array, max 3 form fields, max 3–4 properties per object.
- **Code size:** `app.js` ≈ 40–60 lines max; HTML starter ≈ 25 lines; CSS minimal (5–6 rules), given ready-made.
- **At most 2 named functions.** Plain `function`, `for...of`, simple `if`. No advanced patterns (no objects of functions, no `DocumentFragment`, no lookaheads in Regex, no chaining tricks) unless the week explicitly teaches them.
- **Only notions seen in the week's veilles** (or before). Reuse a notion from an earlier veille when natural (e.g. `nextElementSibling` from Monday).
- **Build progressively:** first one element / one field "by hand", then generalise (function, loop, delegation).
- **Déroulé table:** 4–5 steps, minutes **must add up to exactly 45**.
- Anything harder goes in **« ➕ Si le temps le permet »** (1–2 items max).
- Theme = the sprint's métier (see `METIERS_POOL_DWWM_2026-2027.md`), fictional names, prices in DH, Moroccan context (e.g. phone 06/07).
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

{2–4 phrases : le besoin du client du métier, ce qu'on va construire, lien avec la partie du brief concernée.}

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

## 4. Pre-delivery checklist

1. Veilles follow the brief's order of needs; no topic already covered as intro.
2. No concept from a later brief is required (checked against the next planning row).
3. Each veille has all 8 sections in the template order, with a live demo in the deliverable.
4. Each live coding: déroulé totals 45 min, ≤ 60 lines of JS, ≤ 2 functions, ≤ 5 data items / ≤ 3 fields.
5. Live coding uses only notions from the week's veilles (or earlier).
6. Métier, names and data are fictional and coherent with the sprint.
7. Links are real (MDN fr, JavaScript.info fr, official docs); no invented URL.
8. French, « tu » in veilles, code names in backticks.
