# ClassBot 🤖🏆

ClassBot is a Discord bot plus a private teacher dashboard for a programming class. Students practise in Discord: challenges, duels, a daily challenge, a coach and games. Teachers run the class from the dashboard: briefs and their debriefs, GitHub follow-up, assessments, competencies, sprint reviews, daily activities and presentations. Everything runs on Cloudflare's free plan, so there is no server to keep on.

```
 Discord ──(slash commands, buttons, forms)──► classbot Worker ──► D1 database ◄── classbot-admin Worker ◄── you (dashboard)
                                                │  every minute:                     │  password or
 HackerRank ◄── contest boards, solves ─────────┤  AI queue, contests, duels,        │  Cloudflare Access
 Wandbox / Compiler Explorer ◄── runs code ─────┤  assignments, daily challenge,     │
 AI (your keys, then Workers AI) ◄──────────────┤  reports, GitHub, assessments,     │
 GitHub App ──(webhook)──► /github/webhook ─────┘  league                            │
 Students' browsers ◄── code editor, assessments, class games, TV screens, profile pages
```

---

## Contents

1. [What it is](#1-what-it-is)
2. [Quick start](#2-quick-start)
3. [For learners: Discord](#3-for-learners-discord)
4. [For teachers: the dashboard](#4-for-teachers-the-dashboard)
5. [Points, scoring and anti-farming](#5-points-scoring-and-anti-farming)
6. [AI](#6-ai)
7. [GitHub](#7-github)
8. [Data and privacy](#8-data-and-privacy)
9. [For developers](#9-for-developers)
10. [Known limitations and FAQ](#10-known-limitations-and-faq)

---

## 1. What it is

ClassBot is made of two Cloudflare Workers that share one D1 (SQLite) database:

| Part | What it does |
|---|---|
| **classbot** (`src/bot/`) | The public Worker. It answers Discord (`POST /interactions`) and serves the student pages: code editor, assessments (`/quiz/…`), class games (`/game/…`, `/play/…`), squad battles (`/battle/…`), shared profiles (`/u/…`), certificates (`/cert/…`), contest replays (`/replay/…`) and the GitHub connection and webhook (`/github/…`). A cron trigger runs every minute. |
| **classbot-admin** (`src/admin/` + `public/`) | The teacher dashboard: a JSON API (`/api/*`) and the static pages, in plain HTML, CSS and JS with no build step. It is locked by a password or by Cloudflare Access. |

**One ClassBot, several classes.** Each Discord server is a class, with its own settings, track, programme, AI keys and GitHub App. One teacher can run several classes from the same dashboard (the server selector at the top of the menu). Each teacher can also host their own ClassBot and still share a class league and a content library with the others.

**What a class learns.** There are two layers.

- **The track**, for practice. It is one thing at a time, so students never see two languages mixed. The track sets the language of the quick challenges and code examples, the `/path` roadmap and its lessons, the daily challenge and `/today`. You can change it in Settings → General, on Path & lessons, or with `/teacher setup code_language:`.

  | Track | What students get |
  |---|---|
  | JavaScript · PHP · Python · Java · C · C++ | The algorithm roadmap (variables → loops → strings → arrays → … → recursion, sorting, dynamic programming), with all code in that language |
  | SQL (databases) | SELECT → WHERE → ORDER BY → COUNT/SUM → GROUP BY → JOIN → subqueries → INSERT/UPDATE → tables & keys; queries run on real data |
  | MERN (MongoDB, Express, React, Node) | JavaScript basics, then asynchronous code, the web, Node.js, Express, MongoDB, React |
  | Python for AI & LLMs | Python basics, then pandas, machine learning, calling LLMs, RAG |

  Each track keeps its own roadmap and lessons, so switching back and forth loses nothing.

- **The programme**, for projects. It holds the year's planning (weeks, sprints, objectives, concepts, technologies) and the competency framework (référentiel). Briefs, debriefs, Activités, sprint reviews and the competency record all follow it. The YouCode DWWM A1 2026/2027 programme is built in: 32 weeks, 8 sprints, 17 competencies (C1–C8 technical, CT1–CT9 transversal). A class on another stack gets its own copy, which you edit or upload from Excel (Settings → Programme).

**Languages.** The bot speaks English or French (Settings → General, or `/teacher setup language:`). Every quick challenge and lesson has a 🌐 button for the other language. The dashboard has an **FR / EN** button and a light / dark theme button at the bottom of the menu.

---

## 2. Quick start

### Look before installing

```bash
npm install
npm run preview
```

Open <http://localhost:8787>: the dashboard runs with a demo class, with no Cloudflare and no Discord needed.

### Install (about 15 minutes)

You need a Discord server where you're an admin, a free [Cloudflare account](https://dash.cloudflare.com/sign-up), and [Node.js](https://nodejs.org) 22.6 or newer.

1. Create a Discord application at <https://discord.com/developers/applications> (**New Application**). Open the **Bot** tab, click **Reset Token**, and copy the token.
2. In this folder, run:
   ```bash
   npm install
   npm run setup
   ```
   Paste the token when asked. It stays hidden and is only stored as an encrypted Cloudflare secret. The assistant then:
   - invites the bot to your server and logs you in to Cloudflare
   - creates the database, applies the migrations and deploys both Workers
   - connects Discord and registers the commands

   Running it again is safe: on an installed ClassBot, setup is the update.
3. Lock the dashboard: `npm run setup:password` sets a password (free, no card needed). For Cloudflare Access with email codes instead, run `npm run setup:access` (see [Manual setup](#manual-setup), step 9).
4. In Discord, run `/teacher setup` in the channel the bot should use. Create a text channel named `arena` (or pick one with `arena:`). Then run `/teacher notify` so you get a DM for each `/help-me` and `/ask`.
5. Tell students to run `/practice`, `/github` (for projects) and `/link` (for HackerRank).

**Coming from GitHub Watcher?** If your Cloudflare account has the Watcher's storage, setup finds it and the bot imports it once by itself:
- students and their GitHub links
- briefs and squads, hand-ins
- debriefs with your switches, levels and comments
- forum posts, GitHub activity and sprint decisions

Setup prints what came in and what's left: each student runs `/github` once, and you turn off the old Watcher (its App's webhook and its Worker's cron trigger) so nothing is posted twice.

### Updating

```bash
npm run setup
```

On a ClassBot already installed, this installs the new packages, applies the new migrations and deploys both Workers without asking anything. `npm run setup -- --full` redoes the whole setup, and `npm run update` (migrate + deploy) does the same without the checks. Slash commands reach Discord by themselves within a minute: the cron compares a fingerprint of the command list and re-registers when it changes. Dashboard → Settings → **Diagnostics** shows a missing migration.

### Manual setup

The steps below do by hand what `npm run setup` does.

1. **Install:** `npm install`.
2. **Discord app:** create the application. Copy the **Application ID** and **Public Key** (General Information) and the bot token (Bot → Reset Token). No privileged intents are needed. In OAuth2 → URL Generator, pick the scopes `bot` and `applications.commands` and the permissions View Channels, Send Messages, Embed Links, Read Message History and Manage Roles. Open the link and add the bot to your server.
3. **Database:** `npx wrangler login`, then `npx wrangler d1 create classbot-db`.
4. **Config files:** copy `wrangler.bot.example.jsonc` to `wrangler.bot.jsonc` and `wrangler.admin.example.jsonc` to `wrangler.admin.jsonc` (setup does it the first time). Replace every `PASTE_…` value (database ID, application ID, public key) and `YOUR-SUBDOMAIN` (your workers.dev subdomain). These two files are yours: they are not in git, so `git pull` never changes them. Before each deploy, `npm run check-config` stops if a file is missing, still says PASTE, or the example has a new setting to copy.
5. **Tables and challenge bank:** `npm run db:migrate`.
6. **Token and deploy:** `npx wrangler secret put DISCORD_TOKEN -c wrangler.bot.jsonc`, the same with `-c wrangler.admin.jsonc`, then `npm run deploy`. Opening the bot's URL shows *"ClassBot is running ✅"*.
7. **Connect Discord:** in the developer portal → General Information → **Interactions Endpoint URL**, enter `https://classbot.<subdomain>.workers.dev/interactions` and save. Discord tests it at once.
8. **Commands:** copy `.env.example` to `.env` (application ID, token, and your server ID for instant registration), then `npm run register`. It prints `✅ Registered 26 commands …`.
9. **Lock the dashboard:** either `npm run setup:password`, or Cloudflare Access. For Access, open Workers & Pages → classbot-admin → Settings → Domains & Routes and click **Enable Cloudflare Access** (the Zero Trust Free plan). Allow your email only, and put the team domain (`https://<team>.cloudflareaccess.com`) and the AUD tag in `wrangler.admin.jsonc` as `TEAM_DOMAIN` and `POLICY_AUD`. Then run `npm run deploy:admin`. The dashboard checks Access's signed token on every request. Until one of the two is set, it shows *"Dashboard locked"*.
10. **Roles (optional):** in Server Settings → Roles, drag the bot's role above the roles it should hand out.

### Several teachers, one repo

Everyone deploys the same code to their own Cloudflare account, with their own `wrangler.*.jsonc`. Classes on one ClassBot keep their AI keys and GitHub Apps apart (Settings → AI keys, Settings → GitHub & Watcher).

---

## 3. For learners: Discord

Answers are private to the student (ephemeral). Public news goes to **#arena**. `/help [topic]` shows every feature in pages.

### Commands

| Command | What happens |
|---|---|
| `/practice [difficulty] [type] [topic] [language]` | A challenge at their level. Empty `difficulty` lets the bot pick a level that suits them. Types: 🎯 **Picked for me** (what they need next: first steps, a skill they keep missing, or the next step of their path), **Write code** (judged by hidden tests), **Quick** (any, in Discord), **Predict the output**, **Find the bug**, **Multiple choice**, **Complexity**, **SQL query**, **Regular expression**, **Git question**, **HackerRank problem** (verified on their profile). A `topic` (e.g. recursion) makes the AI write a new, checked challenge in the background (about a minute). `language` is remembered. |
| `/daily` | Today's daily challenge: ×1.5 points, +15 / +10 / +5 for the first three solvers, +5 coins, and a 🔥 streak. |
| `/assignments` | The challenges you gave them, with due dates (×1.5 on time, a reminder 24 h before). |
| `/duel opponent [mode] [difficulty] [stake] [partner] [opponent2]` | 1 vs 1 (or 2 vs 2), posted in #arena. The opponent has 10 minutes to accept. Both get the same unseen challenge, and the first correct solve wins. Time limits: quick 10 min, write code 45 min, HackerRank 60 min. The winner gets ×2 points, both stakes and Elo; the loser gets +3. A draw refunds the stakes. |
| `/today [remind]` | Their plan for today: 3 challenges picked for them (a rematch of one they missed, one at their edge, a warm-up). Finishing it gives +20% of what the plan earned (at least 5), +10 coins and a 🗓️ plan streak. `remind:true` sends it every morning. |
| `/skills [member]` | Their skill map (80% from code, 20% from the other types) and their most frequent mistakes. A teacher can view a student's map. |
| `/path` | A step-by-step roadmap with a 📖 lesson for each step. A step is done after enough solves of that skill at that level or harder, and gives +15 coins. |
| `/shop` | Spend coins (see [Coins and the shop](#coins-and-the-shop)). |
| `/create type difficulty` | Write a challenge for the class (write code with tests, or multiple choice). You approve it; the author earns points when classmates solve it. |
| `/profile [member]` | Level and title, season rank, solved by difficulty, accuracy, duels, badges and cosmetics. Buttons: 🔗 **Share my profile** (a public page they can stop sharing) and 🎓 **My certificate**. |
| `/leaderboard [board]` | Season, All-time / levels, Duel ratings, Coins, Teams. |
| `/rival add\|remove\|list` | They get pinged when a rival passes them in a contest; `list` shows head-to-head records. |
| `/bet place player amount` · `/bet coins` | Bet coins on a contest winner before bets close: ×3 if right, refunded if the player makes the top 3. `coins` shows the coin ranking. |
| `/contest standings [contest]` · `/contest list` | Live standings (hidden during the final freeze) and tracked contests. |
| `/link username` | Link their HackerRank account. They prove it's theirs with a short code in their HackerRank bio (or you verify it). |
| `/help-me` | ✋ Raise their hand: their question and code go to your live Help queue, and you get a DM. |
| `/ask question` · `/faq [search]` | Looks in the class FAQ first. Otherwise you get a DM with an AI draft to check; they get your answer by DM, and it joins the FAQ. |
| `/interview [difficulty]` | 🎤 A mock coding interview: they explain approach, edge cases and complexity, write the code, and get a scorecard (+5 points once a day). |
| `/github` | 🐙 Link GitHub once, by installing the class's GitHub App on their repositories. |
| `/brief list` · `/brief submit repo [plan] [brief]` | Their briefs (dates, squad, hand-in, debrief result, competencies) · hand in the repo and the planning board (Trello, Jira, GitHub Project). In a squad, the scrum master hands in. |
| `/activity list\|choose\|mine` | The veilles and live codings you shared: the free ones, ask for one (`partner` is required for a veille; `partner2` if you allow a third), and their own with the subject once approved. |
| `/play` | 🎮 Their own link to the class game on the TV. |
| `/league` | 🏆 Class vs class this week. |
| `/help [topic]` | Getting started, Challenges, Write code, Points, Duels, Daily & assignments, HackerRank contests, Profile/rivals/teams, Coach/plan/skills/shop, Quiz/boss/bounties, Help/briefs/assessments/league, Teacher tools. |

Teacher commands are in [Teacher commands in Discord](#teacher-commands-in-discord).

### Buttons and pages students meet

- **Code editor** (write code): pasting and dropping are blocked, leaving the page is recorded, and every change is kept for your replay. They can **▶ Run samples**, then **Submit** (up to 5 submissions). Verdicts: ✅ Accepted, ❌ Wrong answer, ⏱️ Too slow, 💥 Runtime error. Most problems say *"Complete the function `solve(...)`"*, and the template already reads the input and prints what `solve` returns. Languages: JavaScript, PHP, Python, Java, C, C++.
- **Hints:** quick challenges cost ×0.5. Write code has three steps: a nudge (−15%), the approach (−35%) and pseudocode (−60%). A 🎟️ hint token makes one hint free.
- **🧠 Explain your code:** after an accepted answer, half the points wait until they answer 2 questions about their own code within 3 minutes.
- **🙋 Ask a classmate** (under a write-code or SQL challenge, after a wrong submission): their code and result are posted in #arena, and a classmate explains in words (pasted solutions are refused). A 👍 gives the helper +8 points and 5 coins. Limits: 3 requests a day, 3 rewarded helps a day, and not in exams, sessions, duels, bounties or bosses.
- **📘 Model solution** after solving, **🚩 Report** a wrong challenge, and **🌐** to read it in the other language.
- **Assessment link** (by DM): full screen, one question at a time in their own order. Leaving full screen, switching tab or reloading stops them until you let them back in. Pasting is blocked and logged. العربية / FR / EN buttons translate the question (never the code).
- **Class games and squad battles:** their own signed link from 🎮 Join or `/play`.
- **Live quiz, boss battles and bounties** in #arena (see [Events](#events)).

---

## 4. For teachers: the dashboard

Open `https://classbot-admin.<subdomain>.workers.dev`. The menu has **Overview**, then six sections that open and close (remembered in the browser). A closed section shows its waiting counts.

- **Simple mode** (under the menu) keeps one section open at a time; the GitHub page becomes the home.
- The **FR / EN** and **light / dark** buttons sit next to your name.

### Overview

- **This class learns** (the track selector) and the week's numbers: active this week, solved this week, 30-day accuracy, duels this week.
- **Live in your class:** raised hands, questions to answer, student challenges to review, a running class session, live events, briefs in progress and hand-ins waiting for their debrief, open assessments (and stopped students), interviews and daily plans, peer help, your league rank.
- Charts over 30 days: Activity, Students active per day, Solved by type, Success by level, Success by type, and Code submitted by language.
- **Needs your attention**, Season leaderboard, Latest answers, **Quick actions** and **Self-reported HackerRank solves** to approve. A self-report gives no points until you approve it.
- Warnings when the database needs `npm run update` or there is no #arena channel.

### Class

#### Students
- A searchable, sortable list. Columns: Niveau (the level of their last debrief, else of their last sprint, with ↑ ↓ when it moves), Team, XP level, season points, solved, accuracy, trend (Improving / Slipping / Inactive), streak, open tasks, last active.
- Filters: All students / Needs attention, and by level.
- **Export CSV.**

**Student page** (click a student):
- **Header:** level, team, GitHub, HackerRank, and the actions: Assign a challenge, Give points, ✏️ Edit name, Mark HackerRank verified / Unlink HackerRank, Remove from class.
- **Tabs:** Overview, Briefs & debriefs (sprint reviews, each debrief with its level), Assessments, Competencies, GitHub, Challenges, Points & history.
- **Coach:**
  - skill bars: 80% from code, 20% from the rest, with *no code* and *mistakes found in their code* marks
  - recurring mistakes, and what's next on their path
- **🎯 What to work on, and why** (no AI, from their last 4 months):
  - write-code problems they failed and how (wrong answer on hidden test 3, crashed…)
  - mistakes found in their code, quick questions they missed, failed checks of briefs and assessments
  - buttons: 📚 Give 3 challenges on it, ✨ Generate new ones, ✍️ Write a note to the student (an AI draft from the evidence, sent by DM)
- **GitHub tab:**
  - every commit and pull request of the period (14, 30 or 90 days), flagged tiny, vague, huge or node_modules
  - when they push (including at night) and their repos with the brief each belongs to
  - **✨ What they built:** the AI lists the features per repo and the requirements they show
- **Challenges:** solved and not solved, with their wrong answers, and for write code their code, verdict and coach note.
- **Integrity:** every editor submission with its flags.
- Also: points per week, contest results over time, and *Strengths and gaps* (success by type × difficulty).

#### Teams & squads
- **🧩 Squads by sprint** on a drag-and-drop board (tap-to-move on tablets):
  - ★ scrum master, and **⚖️ Balanced squads** (the same mix of Critique / Faible / Moyen / Bon in each, and students who already worked together are kept apart)
  - history of past squads, and **📨 Send to the students** (a DM with their squad)
  - **🏫 Send to the intranet** (a group distribution of the class on the YouCode intranet)
  - a brief in squads, or a squad battle, loads them
  - **🤝 Squad buddy** (bought in the shop) keeps two students together
- **🏆 Contest teams:** a team's contest score is the average of its members. A student is in one team.

#### Help queue
- Raised hands from `/help-me`, oldest first, with their code and the challenge they're on. The page refreshes by itself.
- **🏃 I'm coming** tells the student by DM, and **✍️ Answer by DM** sends a written reply.
- Numbers: waiting, helped in the last 24 h, average wait.

#### Questions
- Questions from `/ask` with an **AI draft: check it**. Edit it, then **Approve & post in #arena** or approve quietly, ask for a **New AI draft**, or **Reject** (the text is sent as a note).
- Approving DMs everyone who asked and adds the answer to `/faq`. You can add your own FAQ entries.

#### Plan d'action
- The students who need help. They land here by themselves when their last debrief is Faible or Critique, and you can add others by hand.
- For each student: how they're doing since, the **Work given** (assignments, which you can cancel), and a teacher-only comment. You write the comment, or the AI drafts it from their results.
- **Give work:** a challenge for everyone, a team or chosen students, with a due date and a note. Students get a DM and a channel ping, and a reminder 24 h before. You see on time / late / not done.

### Projects

#### Briefs
Tabs:
- **Briefs**, the list.
- **Follow-up:** one card per brief, with who pushed, the hand-ins or squads, the grid and steps, dates and sprint.
- **Planning:** every programme week with its objective, concepts, competencies and briefs.
- **Programme & competencies.**

Ways to start a brief:
- **✨ New brief** from your idea, from 5 AI ideas for the week, from a client meeting's notes, or from a reference brief. The AI writes it in the Simplonline structure:
  - title, description, technologies
  - context, user stories by role (« En tant que …, je vais …, afin de … ») and bonus
  - modalités pédagogiques and d'évaluation, livrables, critères de performance
  - situation professionnelle, and the targeted competencies with their level
  - plus **PO notes** students never see (what they learn, the client, questions to expect, risks, assumptions)
- **📄 Import a brief page:** a Simplonline page saved as .html, or pasted text.
- **Blank brief**, or **+ Quick brief** (one form).

**Brief page.**
- Tabs: Brief (each section editable, ✨ Rewrite one section, quality checks, **Copy** buttons per Simplonline field), Evaluation grid, PO notes.
- Work: Alone, In pairs or In squads (🎲 Random pairs, class squads, scrum master).
- **Assign to the class:** dates, the expected repo name, an announcement in Discord (#general, or the channel in Settings), and reminders 3 days and 1 day before.
- **Evaluation grid:** one point per line. A point linked to an automatic check (`vérif : form, map`) is decided by the code, not the AI.
- **Steps:** dated parts (`name | YYYY-MM-DD HH:MM | expected`), found in the brief or with ✨.
- **Assessment of the brief:** link one, or ✨ generate it, once for the whole class.
- **Debriefs:** 🔍 Analyze all, and one row per student or squad.

**Debrief** (per student or squad):
1. **Assessment** (when one is linked): it comes first and decides where each competency starts. ClassBot suggests a check when the assessment and the project disagree; for example, the project shows a competency the assessment doesn't, so the code may be copied.
2. **Project (GitHub):** ClassBot reads the repo (files, commits, branches, PRs, the planning board; in a squad, each member's part) and runs **66 automatic checks** (semantic HTML, forms, responsive, fetch, PDO, prepared statements, MVC, migrations…). The AI then judges each requirement and competency with evidence.
   - **Requirements of the brief:** you switch each one to validated or not.
   - The bonus, 👍 Strengths / 🛠️ To improve, commits, and the **other automatic checks** (folded; for your information only).
3. **One-to-one remarks:** what you noticed face to face. They count in the level and the comment. With ✨, the AI sorts them into strengths and notions to review, switches on the oral questions your remarks say were answered, and says which competencies they confirm or question.
4. **Competencies:** from the assessment, the project, the one-to-one, the mise en situation and the oral questions. Your switch decides.
5. **Oral questions:** ✨ up to 5, on the brief only, each with its expected answer. Each one starts Not valid, and those still Not valid go into the comment as *Notions à revoir*.
6. **Mise en situation:** a short task on the learner's own project, done live (10/15/20 min by level).
   - It either adds a small feature to their code or changes it to do one.
   - It is built from the brief's requirements, the programme week's concepts and technologies (never a later week) and their real repo files, aiming first at what they didn't fully validate.
   - The card shows the title, context, what to do, the files, 3 acceptance criteria, the time and a hint **for you**.
   - In a squad, each member gets a different task on the files of their own commits.
   - **✨ Generate** / **✨ Regenerate** (with your proposal). It is one checked AI call with one retry, else a template (tagged *template*). You then record the result (valid / partial / not valid).
7. **Steps:** **Propose validation** reads the repo as it was at the step's date and proposes on time / late / not validated / to check.
8. **Level:** Excellent → Critique, proposed from your switches. ✨ generates it from the switches, the oral questions and the comment, without the name.
9. **Squad members:** for each member, their commits, active days, PRs, reviews and cards.
   - Their own quiz/oral %, mise en situation, competency switches and note.
   - Their own **Level**: five chips, a *Proposed:* line from their own data, and ✨. A member with no commit is never proposed above Faible.
   - The squad's Level panel stays as the overall level.
10. **Comment:** a professional comment in French, using « vous ». It comes only from your decisions: requirements and bonus, competencies, level, one-to-one remarks, oral questions not answered and the steps. The automatic checks never feed it.
    - Edit it freely and your text is kept. **↻ Rebuild** writes it again from the switches.
    - **✨ Write with AI** phrases the same points, checked, else the template.
    - In a squad, each member gets their own comment.
11. **💾 Save draft** or **Finalize** (optionally **Send the comment by Discord DM**). Finalize writes the competencies (at the brief's level), the skill evidence, the points and coins, and each squad member's own level onto each student's record. **Reopen** takes it all back.

#### Activités
The daily activities of a period, from the **programme only**: no brief is used, because the classes of a programme run different briefs but study the same concepts.

- **Schedule:**
  - **veille** at 09:15 (30 min), every working day
  - **live coding** at 11:00 (45 min), Tuesday and Thursday by default (toggle the days per week)
  - on a day without a live coding (Monday, Wednesday, Friday by default), **✨ Generate an activity** adds a **live coding** or a **workshop** at 11:00
- **Calendar:** pick the first and last day of a period of up to two months. It shows the sprints, Moroccan public holidays (the Islamic ones are estimates), vacations, cross defenses and certification. Right-click or hold a day to mark it off or worked.
- **Week summary:** programme week, sprint, objective, competencies, technologies, concepts, days without activity, and what's out of scope (the next week).
- **✨ Generate:** writes the « Analyse de la semaine », then each item one at a time; the cards fill in. The AI answers JSON and ClassBot writes the markdown, so every item has the template's sections (`docs/activities/TEMPLATES_VEILLE_LIVE_CODING_DWWM_2026-2027.md`).
- **Checks:** an item that fails is asked again once, then kept with ⚠️ warnings.
  - live coding: a 45-minute déroulé, ≤ 60 lines and ≤ 2 named functions, ≤ 5 data items, ≤ 3 form fields
  - workshop: 45–60 min in 4–6 steps that add up exactly, 3–6 instructions, 3–5 success criteria, a starter ≤ 40 lines
  - all items: nothing the class hasn't seen yet, and links only to MDN fr, JavaScript.info fr and official docs
- **The code language follows the week:** HTML/CSS, JavaScript, SQL, PHP, Laravel or React. Examples serve the concept (no client, no theme). Veille topics of earlier promotions are inspiration only (`docs/activities/VEILLE_INSPIRATION_DWWM.md`).
- **One activity per slot:**
  - a slot is 09:15 (the veille) or 11:00 (a live coding *or* a workshop), and a database index enforces it
  - generating the week or a range skips what exists and tags it **already generated**
  - generating a single item asks « Une activité existe déjà pour ce créneau. La remplacer ? » and shows the existing one first
  - **↻ Regenerate all** replaces everything after a confirmation
- **Per item:** Preview, ✏️ Edit (title and markdown), 📋 Copy, and **✨ Regenerate** with your proposal. Your proposal sets the topic and example (quick chips like « plus simple »). Choose « A different … » or « Same subject, rewritten ». The new version shows next to the current one before you **Replace** it, and what goes beyond the programme is listed as left out.
- **Export:** copy or download a week, or the whole period, as .md. Everything is saved per class and day.

#### Presentations
The veilles (in binôme, 3 at most) and live codings (1 or 2 people) your students present.

1. **📣 Share in Discord:** pick the week and the channel. Default points are 20 per veille and 40 per live coding.
2. Students ask with `/activity choose`, and you get a DM. **✓ Approve** (other requests for the same subject are turned down) or **Deny**.
3. Or assign by hand, or **🎲 Assign the week at random**: fewest presentations first, nobody twice on the same day, and never a Hard subject for a Faible or Critique student.
4. **🎤 Grade** each presenter after the talk (a % of the points). Points are given then; changing a grade later only adds or removes the difference.

**Who presented what** shows each student's counts against the class average. **🏫 Send to the intranet** sends the week's veilles and live codings, with their presenters, to the class on the YouCode intranet.

#### GitHub
- Numbers: students linked, worked today, pushed in the last 7 days, commits in 14 days.
- **Needs your attention:** idle students and why.
- **Briefs in progress**, with 📣 Announce and **Post status** in Discord.
- The students' table (score, trend, commits, lines, PRs, last push, warnings) with filters, search, sort and a brief filter.
- Click a student for their panel: day by day, repos, **Recount since the brief started**, Unlink.
- Buttons: **Send today's report**, **Weekly report**, **Check repos** (asks GitHub again which repos each student installed the App on).

### Evaluation

#### Sprints
- The sprint review of each sprint of the programme. For every student: the sprint's competencies reached in its briefs (✓ at the level asked, lower level, ✗, —; the transversal ones in one CT column), briefs evaluated and grid %.
- A **level** for the administration's report, Excellent → Critique: **✨ Propose levels** for the class (the AI never gets names), then you choose.
- Your decision (✓ / ✗) and a note.
- **Levels** counts students per level, with the weak ones' names (Copy). **Sprint comment** writes one comment for the whole class (✨, edit, Save, Copy).
- **All sprints (the year).**

#### Progress
- One column per brief and one square per learner, coloured by the debrief's level. In a squad, each member's square shows **their own** level.
- Click a square to open the debrief. **Over the year** counts the levels.

#### Assessments
Web tests in full screen. Create one from **✨ Generate with AI** (a topic and the technologies to assess, a brief, or **one student's weak points**), **Blank assessment**, or **🔗 Import from a link**.

- **Questions:** + Write code, + Explain, + Multiple choice, or ✨ Add with AI. Each question has an expected answer (never shown), skills and competencies.
- **Settings:** time, page language, passed at (%), points for 100%, and a **linked brief**: its results count in that brief's debrief (competencies and comment).
- **Invite:** each student gets their own link by DM, open for N days, with the order and going back set in Options.
- **Live:** refreshes every 5 s. Who is answering, progress, who was stopped and why, **Let back in** (with extra minutes), and Remove.
- **Results:**
  - multiple choice is graded at once; code and explanations by the AI with your expected answer (spelling and language mistakes are ignored)
  - **↻ Grade with AI** grades what's left, keeping your changes
  - click a student to read their paper, or a score to change it
  - also: the average per question, the hardest questions, an AI summary per student, and **Send results by DM**
- **🔗 Share:** a link to the questions (never the papers). Another teacher imports a draft copy. **New link** stops the old one.

Scores feed the skills and competencies of each question.

#### Competencies
- The whole class on the référentiel: the highest level each student validated, and the % of the class that validated each competency.
- Click a cell to **validate it at a level or invalidate it yourself** (✍️, with a note). Your decision replaces earlier results; later briefs and assessments still count on top. *Back to automatic* removes it.

#### Integrity
- Every write-code answer with warning signs: paste attempts, big blocks of code at once, leaving the editor, typing with no corrections or impossibly fast, code very similar to a classmate's, a weak explanation.
- **▶ Play** the typing replay, then **Looks fine** or **Remove points** (optional DM). Nothing is removed automatically.

#### Interviews
- Every `/interview` with its scorecard (problem solving, communication and complexity, each /5) and the full transcript.

### Practice

#### Challenges
- The bank with success rates, plus challenges **Written by students** (Approve / Reject) and **Reported by students**. Two reports pause a challenge until you fix it, and fixing an answer credits students who were right.
- **Difficulty check** suggests a level from real results (Apply / Apply all suggestions).
- **New challenge:**
  - **Write it** (for write code: statement, a Python reference solution and test inputs; the outputs come from running it)
  - **Generate with AI** (checked by running it)
  - **Import from HackerRank** (by link)
- **✨ Generate in bulk:** skills, levels and types, checked one by one.

#### Daily challenge
- On / off, channel, time (UTC), the language of quick challenges, and a weekly plan (level + type per weekday, including SQL and regex).
- The next 14 days: pick a challenge for any date, or 🎲 Random.
- **Replace today's challenge**, post one now, and past dailies (opened / solved).

#### Path & lessons
- Reorder the steps. Each row shows how many challenges your bank has for that skill and level; it turns orange when there are fewer than twice the solves needed, and ✨ writes more.
- Edit any lesson with a live preview (English and Français), **✨ Write with AI**, or go back to the built-in lesson.
- Change the track right on this page.

#### Class sessions
- Pick challenges (**Add 3 random write-code**), a length and who takes part. The bot posts it in #arena (and pings a team).
- Two kinds:
  - **Class session:** students see results right away
  - **Exam:** no feedback until the end, the best submission counts, graded /20
- A live grid: ✅ solved · ❌ out of tries · ✏️ working · ⌛ not finished · ⚑ warning signs (click a cell for the replay). **End now** closes it.

### Games & rewards

#### Class games
Show them on the class TV. Students join from Discord with their own signed link, so nobody can play as someone else. Play solo, with the class's squads, or with random squads.

| Game | How it plays |
|---|---|
| 👑 **Battle Royale quiz** | Everyone answers the same question, and a wrong answer knocks you out; the last one standing wins. A teammate can spend squad points to bring someone back. Questions come from ✨ AI on topics, 📝 an assessment, or 📚 the shared library. |
| 🕵️ **SQL Detective** | A mystery in a database. Squads run real SQL in the browser (sql.js), and each right result unlocks the next clue. A hint costs 60 s and a wrong accusation 120 s (by default). The first to name the culprit wins. Cases are built-in, written, or ✨ generated; ClassBot runs every solution query to check them. |
| 🏃 **Code Relay** | Squad members write the same function in turn without talking: each device's microphone listens and gives strikes (3 by default). Tests run on the TV at the end, and the most tests passed wins. JavaScript, Python or PHP; built-in, written, or ✨ generated and checked. |
| ⚔️ **Squad battle** | Two teams with one chess clock each (2 minutes by default). Questions show on the TV (what does it print, missing piece, acronym, quick question, true/false, find the bug, A/B/C/D, complete it). You judge from your phone by scanning the QR code: ✓ Correct passes the turn, ✗ Wrong keeps the clock running, ⏭ Pass costs 8 s. The first clock at 0 loses. The server picks every question, so the TV and your phone always show the same one, and a tap made on a screen that has just changed (a double tap, a late tap) is refused, never counted twice. A question is never asked twice in a battle, rematches included: when they have all been asked, built-in questions on the battle's topics fill in, and once none are left the game ends (the team with more time left wins). |

Winners get 20 points by default (0–200), and the result can be posted in #arena.

#### Contests
- Follow a HackerRank contest (its leaderboard must be public): the channel, check every N minutes (5 by default), and freeze the last N minutes (15).
- Live commentary in #arena (first blood, lead changes, photo finishes), a frozen board, then a suspense reveal.
- Awards: 🩸 First Blood, 📈 Biggest Climber, 🌱 Most Improved, ⚡ Speed Demon, 🦉 Last-Minute Hero. Also team results, bet payouts, the 🏆 champion role and a **race replay** page.
- **End now and reveal** or Cancel.

#### Events
- **🎤 Live quiz:** up to 30 questions (multiple choice, find the bug, Big-O), with seconds per question. Put #arena on the projector, then press Start.
  - Scoring: 500 for a right answer, up to +500 for speed. The podium gets 15 / 10 / 5 coins, and optionally leaderboard points (quiz score ÷ 100).
  - Questions from past quizzes or 📚 the shared library.
- **⚔️ Boss battles:** a hard write-code problem with a health bar the class fights together. Each fighter's best submission deals up to 40 damage (by share of tests passed). Beat it before the deadline and everyone who hit it gets the reward (points + coins).
  - 📚 Ready-made bosses come with a story and a tested quest; or write the story yourself (appears, half health, almost dead, victory, escapes).
- **💰 Bounties:** the first correct solution takes the points and coins.

#### Points
- Give, remove or set points for everyone or selected students, for the season or all-time too, with a reason (in their points log) and an optional DM (up to 20).
- **Reset** everyone's season points, or everything (levels too). Resets add correcting entries, so the history stays.

#### Coins & shop
- Tabs: **🪙 Coins** (give, remove, set, Set to 0), **🛒 Shop** and **🧾 History**.
- **The shop:** price, max held, duration (days or hours) and the contract reward of each built-in item, and an on/off switch per item. You can also remove a title, motto, emoji or victory message a student wrote (no refund).
- **🎁 Your own rewards** with a stock and a per-student limit. When a student buys one, you get a DM and it waits in **Rewards to give** (✅ Given / ↩️ Refund).

#### Skills
- **Class map:** each student × skill over 4 months (65%+ solid, 35–64% getting there, under 35% needs work).
- **Skill by skill:** **✨ Challenges** or a **Practice set**. Each student gets challenges at their own level (one step above what they reliably solve) as assignments with a DM.

### Setup

#### Classes & league
- **Your classes side by side:** students, active, solved, points per student, accuracy, and a 4-week trend.
- **🏆 Class league:** points earned this week ÷ class size (at least 5), with points you give by hand not counting. Tick **Plays in the league** and set a name.
- **Other ClassBots:** **🔗 Invite other classes** gives a link for teachers on other ClassBots. Paste theirs under **🌍 Classes from other ClassBots**; they are read every 30 minutes, and only class numbers are shared. *Renew the link* stops the old one. Results go to #arena on Mondays and to `/league`.
- **🎓 Certificates** for any season: open them, or **Send by DM now**.

#### Settings
| Tab | What's in it |
|---|---|
| ⚙️ **General** | Bot language, what the class learns (track), #arena and other channels, and the daily challenge. |
| 🎓 **Programme** | The planning and the competency framework. Download the Excel template (it comes filled with the current programme), change it, and upload it. The YouCode planning workbook (*Planning Annuel* + *02_Sprints*) works as it is. You check what was read before it's used. |
| 🐙 **GitHub & Watcher** | The class's GitHub App (✨ **Create the GitHub App for me**, or by hand), where messages go, reports and reminders, repos to ignore, what a finalized debrief gives, and the import from GitHub Watcher. See [GitHub](#7-github). |
| 🤖 **AI keys** | This class's AIs, in order. See [AI](#6-ai). |
| 📚 **Shared library** | Create a library (hosted on this ClassBot) or join one with a link. It shares Activités, assessments, live quizzes and class-game content with the other classes of your programme. Only teachers' content travels; sign-ups, papers and grades stay in each class. Last edit wins. Buttons: ↻ Sync now, Share everything this class has, Leave the library. |
| 🏫 **Intranet YouCode** | Connect once with your intranet email and password (the password is never kept; a ClassBot token is kept, encrypted). Choose the class's intranet classroom and match students with intranet learners. Squads and activities can then be sent there. Every request is signed (HMAC-SHA256) and dated. |
| 🏷️ **Roles** | The Champion and Streak (On Fire) roles, and **Automatic roles**: 👑 Class Leader, 🥈 Top 3, 🏆 Contest Champion, 💻 Code Machine, ⚔️ Duel Master, 🔥 On Fire, and level roles (🌱 Apprentice, 💡 Coder, ⚡ Hacker, 🔮 Wizard, 🌟 Legend). The bot's role must be above them. |
| 🧮 **Scoring** | Base points per level, the multiplier per type, the anti-farming of quick challenges, contest points, with a live preview. |
| 🛡️ **Anti-cheat** | Write-code answers only in the code editor (recommended) / editor or Discord form / form only. Explain your code, the similarity check, code as an image in quick challenges, the time to answer a quick challenge, and points in /practice. |
| 🔔 **Notifications** | Who gets the `/help-me`, `/ask` and shop-reward DMs, and **Send me a test DM**. |
| 🗓️ **Season** | Start a new season (season points restart from zero, history stays), optionally announced in #arena, with certificates by DM. |
| 🩺 **Diagnostics** | Checks from Cloudflare that the code runner, the AI and HackerRank answer. Also the AI budget today, the challenge bank by type and level, missing migrations, and role permissions. |

### Teacher commands in Discord
`/teacher` is for members with *Manage Server*:

| Command | What it does |
|---|---|
| `/teacher setup [arena] [language] [daily_hour] [code_language]` | The #arena channel, the bot language, the daily challenge hour (UTC), and what the class learns. |
| `/teacher notify [help_me] [ask]` | You get a DM for each `/help-me` and new `/ask`, with a button to the dashboard. It sends a test DM. |
| `/teacher track link [channel] [every_minutes] [freeze_minutes]` · `/teacher stop [contest] [announce]` | Follow or stop a HackerRank contest. |
| `/teacher season name [certificates]` | Start a new season. |
| `/teacher verify member` | Confirm a student's HackerRank link yourself. |
| `/teacher dashboard` | A link to the dashboard. |

### What runs by itself
The bot Worker's cron runs every minute and does the following:
- the AI generation queue (one job a minute) and the slash command sync
- contests, class sessions, duel timeouts, assignment reminders, expired practice attempts
- the daily challenge, the Monday recap in #arena, automatic roles
- the morning plans (`/today remind`), the weekly report DM to each active student (Mondays) and the teacher's summary
- events, shop expiry, GitHub (reports, brief reminders, idle students), assessments, and the league (other ClassBots' links every 30 minutes, the Monday results)

---

## 5. Points, scoring and anti-farming

All the numbers below are defaults. Points can be changed in Settings → Scoring; the rest of the rules live in `RULES` (`src/shared/game.ts`). `/help` shows the current table to students.

### Points per challenge
**Points = level base × type multiplier.** The bases are Easy 3, Medium 6, Hard 12.

| Type | × | Easy | Medium | Hard |
|---|---|---|---|---|
| Multiple choice | 1 | 3 | 6 | 12 |
| Complexity | 2 | 6 | 12 | 24 |
| Predict the output | 3 | 9 | 18 | 36 |
| Regular expression | 3 | 9 | 18 | 36 |
| Find the bug | 5 | 15 | 30 | 60 |
| SQL query | 6 | 18 | 36 | 72 |
| HackerRank problem | 8 | 24 | 48 | 96 |
| Write code | 10 | 30 | 60 | 120 |

Then the modifiers apply:

| Modifier | Effect |
|---|---|
| Where it comes from | Daily ×1.5 (+15 / +10 / +5 for the first three solvers) · assignment on time ×1.5 · duel win ×2 (the loser gets 3) |
| Tries | Predict the output: 2 tries, the second ×0.5 · multiple choice: 1 try · SQL and regex: 3 tries (×0.75, then ×0.5) · write code: up to 5 submissions, −15% each, never below 40% |
| Hints | Quick types ×0.5 · write code: 85% / 65% / 40% after the 1st / 2nd / 3rd step |
| Speed | A quick type answered within 60 s: +20% |
| 💎 Double code hour | ×2 on write code the student picked (practice, `/today`, `/path`), never on assigned work |
| 🧠 Explain your code | Half of an accepted write-code answer is held until the explanation (not in duels) |

Every point earned on a challenge also gives **one coin**. Self-reported HackerRank solves count only after you approve them.

### Anti-farming
- **Limited types:** multiple choice, complexity, predict the output, find the bug and regular expressions, in `/practice` and duels only.
  - The first **3** a day give full points, the next **2** give **50%**, then **0**. With the lock on, students can't pick more until midnight UTC.
  - At most **150** points a day from these types.
  - A challenge already solved never pays again.
  - **Points in /practice** (Settings → Anti-cheat) can make them count less.
- **Never limited:** write code, SQL and HackerRank problems, and everything you hand out (daily challenge, assignments, class sessions, `/today`, `/path`).
- **Peer help:** +8 points and 5 coins per 👍, at most 3 rewarded helps a day.
- **Interviews:** +5 points once a day.

### Other points
| Source | Default |
|---|---|
| HackerRank contest | 🥇 120 · 🥈 90 · 🥉 70 · top 10: 40 · took part: 15 · special award: 25 |
| Daily plan (`/today`) | +20% of what the plan earned (at least 5) and +10 coins |
| Finalized debrief | 15 points and 10 coins per validated competency, and 5 points per bonus done (0–500 each, in Settings → GitHub & Watcher). A new finalize only adds or removes the difference. |
| Presentation | 20 points per veille and 40 per live coding (0–300, in Presentations), split by each presenter's grade % |
| Class games / squad battle | 20 points to the winners (0–200) |
| Live quiz | Optional: the quiz score ÷ 100 |
| Boss battle, bounty | The points and coins you set |
| `/create` | Points for the author each time a classmate solves their approved challenge |

### Levels and titles
- **Level** = ⌊√(all-time points ÷ 25)⌋ + 1. So level 2 is at 25 points, level 3 at 100, 5 at 400, 8 at 1,225, 12 at 3,025 and 16 at 5,625.
- **Titles:** Novice (1–2) → Apprentice (3–4) → Coder (5–7) → Hacker (8–11) → Wizard (12–15) → Legend (16+). Level-ups are announced in #arena.
- **Badges:** 🎯 First Steps, 🔟 Ten Down, 🏅 Half Century, 💎 Diamond Mind (5 hard), ⚔️ Duelist, 🗡️ Gladiator (5 duel wins), 📅 Dedicated (7-day daily streak), 🏆 Champion, 🥉 Podium Regular (3 podiums), 📚 Diligent (10 assignments), 🚀 Rising Star (level 5), 🌟 Star (level 10).
- Duels use **Elo** (K = 32). The 🛡️ duel shield keeps a lost duel from costing rating for 24 h.

### Debrief levels
Excellent / Bon / Moyen / Faible / Critique.
- **Proposed from the switches:** a score of at least 0.9 is Excellent, 0.75 Bon, 0.55 Moyen, 0.35 Faible, and below that Critique.
- **Squad member's level:** weighted from their share of the squad's work (commits 50%, active days 30%, PRs + reviews 20%, each compared with the squad's average), their competencies, the squad's requirements, their quiz, their mise en situation and the squad's oral questions. Without a commit, never above Faible.
- **Old records** with no member data use the squad's level.

### Coins and the shop
Students start with 100 coins and never drop below 10.
- **Earning:** challenge points, daily +5, plan +10, path step +15, duel stakes, bets (×3), quiz podium, bosses, bounties, peer help and debriefs.

| Group | Item | Price | Notes |
|---|---|---|---|
| Items | 🧊 Streak freeze | 60 | Max 2 held |
| | 🎟️ Hint token | 30 | Max 5 held |
| | 🤝 Squad buddy | 800 | Once per class per season |
| Boosts | 💎 Double code hour | 120 | 1 h |
| | 🎯 Challenge contract | 50 | 24 h; reach the goal you picked to win 150 |
| | 🛡️ Duel shield | 80 | 24 h |
| Profile | 🏷️ Title · 🎨 Color | 100 · 200 | 7 days |
| | 🖼️ Theme · 💬 Motto · 😎 Emoji · 🏅 Badge showcase · 💻 Favourite language · 📌 Proudest solve · 🔲 Avatar frame | 150 · 80 · 100 · 60 · 50 · 120 · 200 | 30 days |
| In the game | ⚔️ Victory message · 🎉 Level-up style · 🌟 Leaderboard flair | 120 · 150 · 100 | 30 days |

Every price, limit and duration can be changed or switched off, and you can add your own real-life rewards.

---

## 6. AI

**What uses it:**
- briefs (ideas, whole briefs, one section), evaluation grids and steps
- debrief analysis, oral questions, remarks, the mise en situation, levels and the comment's wording
- sprint levels and comments, assessments (questions and grading), Activités
- new challenges (practice topics, bulk, a skill), lessons, live-quiz and squad-battle questions, class-game content
- the code coach, explain-your-code questions, mock interviews, FAQ drafts, Plan d'action comments, weekly report notes, and translations

**Where it comes from** (Settings → AI keys, per class):
1. **This class's keys**, in your order: Groq, Google Gemini, OpenRouter, Cerebras, Mistral, OpenAI (ChatGPT), Anthropic (Claude), DeepSeek, or any OpenAI-compatible address (Together, Fireworks, Ollama or LM Studio through a tunnel…). Each key is tested before it's saved and never shown again. When one fails or hits its limit, the next one answers. Keys of the same provider can take turns, so their per-minute limits add up. Copy them to your other classes with **Use the same AIs in my other classes**.
2. **The ClassBot's own key:** the Cloudflare secret `GROQ_API_KEY` (or `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY`). Only classes allowed to use it do (by default, only when the ClassBot has one class).
3. **Cloudflare Workers AI** as the last backup (`@cf/openai/gpt-oss-120b`, then `@cf/meta/llama-3.3-70b-instruct-fp8-fast`). It can be turned off per class.

**Budget.** Cloudflare's free AI is about 10,000 neurons a day for the whole account.
- Each class gets **80 units a day** (`RULES.aiDailyLimit`, or `AI_DAILY_LIMIT` in the wrangler file; the example sets 60), and the whole ClassBot gets three times that.
- Typical costs: a quick challenge 2, a write-code problem 4, code feedback 1, an AI judgement 2, a debrief call about 3.
- A class with its own keys has no ClassBot limit. Diagnostics shows today's use.
- When the budget is spent, the features degrade:
  - the interviewer asks scripted questions
  - the debrief comment and the mise en situation use their templates
  - levels are computed from the data
  - you write the FAQ answers yourself

**Checked, not trusted:**
- **Challenges:** "predict the output" answers come from running the code; multiple choice is re-solved by an independent pass; write-code problems are kept only when a fast solution and a brute force agree on a real run; SQL challenges run on several datasets; class-game content is run before it's kept.
- **Debriefs:** the automatic checks always win over the AI.
- **Activités and the mise en situation:** answered as JSON in a fixed shape, validated, asked again once, else kept with warnings or replaced by a template.
- **Names:** the AI never gets students' names for levels (debrief, squad member, sprint).

---

## 7. GitHub

**The class's GitHub App** (Settings → GitHub & Watcher):
- **✨ Create the GitHub App for me:** GitHub opens with everything filled in, you click *Create GitHub App*, and it's saved for the class.
- **By hand:** paste the three URLs shown (Callback, Setup, Webhook).
  - Permissions, read-only: Contents, Metadata, Pull requests, Issues.
  - Events: Push, Pull request, Pull request review, Issues, Create.
  - Copy back the App ID, slug, Client ID, client secret, webhook secret and private key. Secrets stay on the server and are never shown again.
- **A school-wide App** can be set once as Worker secrets (`GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_PRIVATE_KEY`). Classes without their own App use it.

**Students** run `/github` once and install the App, preferably on **All repositories**.
- With *Only select repositories*, a new project (the next brief, a squad repo) sends nothing until they add it. They are flagged *Some repos*, and **Check repos** asks GitHub again.
- When a repo is added later, its earlier pushes since the start of the brief in progress are counted.

**What it feeds:**
- **Activity:** pushes, PRs and reviews per day. A push counts only the pusher's own recent commits.
- **Messages** (choose where they go):
  - reports and brief reminders: daily and weekly tables, idle students after N working days, reminders 3 days, 1 day and on the deadline
  - "X connected GitHub" (or not at all)
  - new briefs announced (#general by default)
  - an **activity forum** with one post per student (archived posts are reopened; forums that need a tag get one)
  - **🧪 Save and send a test**
- **Commits:** tiny (≤ N lines) and huge (≥ N lines) thresholds, and repos to ignore.
- **Briefs:** who pushed since the start, on time or late, and the expected repo name to find a repo that wasn't handed in.
- **Debriefs:** the repo's files, commits, branches and PRs; the step check reads the files as they were at the step's date.
- **Import from GitHub Watcher:** automatic during `npm run setup`, or with a Cloudflare Account ID, the Watcher's KV namespace ID and an API token with *Workers KV Storage: Read* (used once, never saved). You can also bind the namespace as `WATCHER_KV`. Debriefs come in as drafts, which you finalize from Progress.

---

## 8. Data and privacy

**Where data lives:** everything is in your own Cloudflare D1 database, on your account.

**What it holds:**
- **Students:** Discord ID and name, the HackerRank username and GitHub login they linked, answers and submitted code, and the editor's typing record (for the replay).
- **Results:** the points and coins log, skills, competencies, debrief records (your switches, notes, comments, levels), assessment papers and grades, presentations, sign-ups.
- **Class settings:** AI keys, GitHub App secrets and the intranet token. They are never sent back to the browser; the intranet token and secret are kept encrypted.

**What leaves your Cloudflare account, and why:**

| Service | What it gets |
|---|---|
| Discord | Messages, DMs and roles the bot sends |
| AI providers (your keys, Workers AI) | The texts each feature needs: briefs, repo excerpts and commits, answers and code to grade or explain, your remarks. Not students' names for levels. |
| Wandbox / Compiler Explorer | Students' code and the test inputs, to run them |
| HackerRank | Public profile and contest pages are read (usernames) |
| GitHub | ClassBot reads the repos the App was installed on |
| Google Translate | The assessment question text a student asks to translate (never the code) |
| Other ClassBots (league) | Class numbers only: name, size, active students, points, solved |
| Shared library | Teachers' content only (activities, assessments, quizzes, games); never a student's name, answer, paper or grade |
| YouCode intranet (if connected) | Squads, and activities with their presenters, sent to your own classrooms; signed server to server |

**Public pages:**
- **Shared profiles:** only when the student chooses to share; they never show code, and the student can stop any time.
- **Certificates:** signed links.
- **Race replays:** HackerRank usernames and scores, which are public anyway.

**Access:**
- **The dashboard:** a password (an encrypted secret, `ADMIN_PASSWORD`; a signed HTTP-only cookie for 30 days, and changing the password signs everyone out) or Cloudflare Access (its signed token is checked on every request).
- **Student pages** (editor, assessment, game) use links signed per student.

**Exporting challenges:** `npm run export:challenges` writes the challenges you added to `migrations/00NN_my_challenges.sql`. It never exports students' answers, points or names, or the author's Discord ID.

**Removing a student:** "Remove from class" on their page. Pending practice attempts expire after 24 h. Nothing else is deleted automatically.

---

## 9. For developers

### Layout
```
src/bot/        the public Worker: Discord interactions, cron, editor, assessment, games, battle and public pages
src/admin/      the dashboard Worker: API (api.ts, learnapi.ts, actapi.ts), Access and password login
src/shared/     everything both use: rules (game.ts), challenges, AI, GitHub, briefs, activities, library, i18n…
src/shared/review/  debriefs: engine (checks, grid, states), debrief (AI steps), comment, members, task, steps, gh
public/         the dashboard: plain HTML/CSS/JS, no build step (i18n-fr.js is the French dictionary)
migrations/     D1 schema and the challenge bank (applied in order)
docs/activities/  the veille / live coding / workshop templates and the veille inspiration list
tools/          Python generators that verify and write the challenge bank
scripts/        setup, config check, command registration, challenge export
tests/          end-to-end tests (run.ts, harness.ts) and the demo preview (preview.ts)
```

### Commands
| Command | What it does |
|---|---|
| `npm test` | 1460 end-to-end checks against the real code. Discord, HackerRank, GitHub and the AI are faked, the database is Node's built-in SQLite, and students' code really runs locally (needs `python3`; `g++` for the C++ check). |
| `npx tsc --noEmit -p .` | The type check |
| `npm run preview` | The dashboard with a demo class at <http://localhost:8787> |
| `npm run db:migrate` · `npm run deploy` · `npm run update` | Apply migrations, deploy both Workers, or both |
| `npm run deploy:bot` · `npm run deploy:admin` | Deploy one Worker |
| `npm run register` | Register slash commands by hand (uses `.env`) |
| `npm run logs` | Tail the bot Worker's logs |
| `npm run check-config` | Check the wrangler files (runs before migrate and deploy) |
| `npm run export:challenges` | Export your own challenges to a migration |

### Conventions
- **A new migration** goes in `migrations/` with the next number, and in `MIGRATIONS` (`src/shared/schema.ts`) so Diagnostics reports it when missing.
- **Bot texts** (English and French) are in `src/shared/i18n.ts` and `src/shared/i18n_more.ts`. Dashboard pages are written in English and translated by `public/i18n-fr.js` (keys with `{n}` and `{s}` templates; elements with `data-notr` are left alone).
- **Built-in challenges:** `tools/bank_*.py`; `python tools/gen_bank.py` re-verifies everything (runs each snippet, reference vs brute force, timing) and writes the migration. The bank has 529 built-in challenges: 102 multiple choice, 57 complexity, 104 predict the output, 64 find the bug, 32 regex, 28 SQL, 64 write code (each in English and French), and 78 HackerRank problems.
- **Templates for Activités** live in `docs/activities/` and in `src/shared/activities.ts` (checks and markdown). Change both together.
- **Scoring defaults** are in `DEFAULT_SCORING` and `RULES` (`src/shared/game.ts`).
- **Worker settings** (see `src/shared/types.ts`): `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_TOKEN`, `PUBLIC_URL`, `DASHBOARD_URL`, `AI_DAILY_LIMIT`, `TEAM_DOMAIN`, `POLICY_AUD`, `ADMIN_PASSWORD`, `RUNNER_URL`, `WANDBOX_URL`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`, the `GITHUB_*` secrets, `WATCHER_KV` and `INTRANET_URL`.

---

## 10. Known limitations and FAQ

**Limitations:**
- **HackerRank has no official API.** ClassBot reads the JSON hackerrank.com uses for its own pages; it can change or be blocked. Only verified links count, and only solves made after the challenge was handed out. If HackerRank can't be reached, students get an **I solved it** button that gives no points until you approve. Contest leaderboards must be public, and the freeze is Discord-only.
- **Code runs on free public services** (Wandbox; Compiler Explorer as the backup). If both are down, the AI judges from the samples and the solve is marked "judged by AI".
- **Anti-cheat makes AI use visible, not impossible.** No tool controls a student's computer or a second device. The editor, explain-your-code, similarity, code as images, full-screen assessments and the mise en situation make it slower and visible; the best check is still asking the student to explain.
- **Islamic holidays are estimates** on the Activités calendar: mark the real day off or worked.
- **Workshops** are not offered in Presentations or sent to the intranet: those take veilles and live codings only.
- **The shared library** keeps the last edit: two teachers editing the same day's activity at the same time keep the later one.
- **Certificates are web pages:** students use *Print → Save as PDF*.

**FAQ and troubleshooting:**

| Question | Answer |
|---|---|
| Discord refuses the Interactions Endpoint URL | Check `DISCORD_PUBLIC_KEY` in `wrangler.bot.jsonc`, run `npm run deploy:bot`, and try again. |
| Slash commands don't appear | Wait a minute (the cron syncs them), or set `GUILD_ID` in `.env` and run `npm run register`. Restart Discord (Ctrl+R). |
| "This interaction failed" | Run `npm run logs` while you retry. |
| The dashboard says "locked" | Set a password (`npm run setup:password`) or finish Cloudflare Access (`TEAM_DOMAIN`, `POLICY_AUD`, `npm run deploy:admin`). |
| "Forbidden: invalid Cloudflare Access token" | `POLICY_AUD` doesn't match the Access application's AUD tag. |
| Roles aren't given | The bot's role must be above them and needs Manage Roles (Settings → Roles shows a warning). |
| No DM for `/help-me` or `/ask` | Run `/teacher notify`. If Discord refuses it, open the server's menu → Privacy settings and turn on Direct messages. |
| No daily challenge | Create a channel named `arena` or run `/teacher setup arena:#channel`. It's posted at the set hour in **UTC**. |
| "The database wasn't updated" | Run `npm run setup` (or `npm run update`). Diagnostics lists missing migrations. |
| "ClassBot's free AI is used up for this class today" | Add the class's own key in Settings → AI keys (free with Groq or Gemini), or wait until tomorrow. |
| A student's new repo sends nothing | They installed the App on *Only select repositories*: they add the repo, or you press **Check repos**. |
| Can several teachers share one ClassBot? | Yes: each class has its own settings, AI keys and GitHub App. To share content between ClassBots, use the Shared library and the league link. |
| Where do I change the points? | Settings → Scoring (per type and level, anti-farming, contests); debrief rewards in Settings → GitHub & Watcher; presentation points in Presentations. |
