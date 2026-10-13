# ClassBot 🤖🏆

A Discord bot that turns coding practice into a game for your students, with a private teacher dashboard to follow their progress. Everything runs on Cloudflare's **free** plan: no server, no computer to keep on, nothing to pay.

```
 Discord  ──(slash commands, buttons)──►  classbot Worker  ──►  D1 database  ◄──  classbot-admin Worker  ◄──  You (dashboard)
                                           │  every minute:                       │  locked by
 HackerRank ◄──── contest boards, solves ──┤  contests, duels, dailies,           │  a password or
 Workers AI ◄──── new challenges, feedback ┤  reminders, weekly recap,           └─ Cloudflare Access
 Wandbox    ◄──── runs students' code ──────┘  AI generation queue
```

Everything public (daily challenge, duels, contests, level-ups, assignments, weekly recap) is posted in your **#arena** channel. Create a text channel named `arena` and the bot finds it automatically, or choose one with `/teacher setup arena:#channel`.

---

## One track per class

Each class learns **one thing at a time**, so students never see two languages mixed together. Pick the track in **Overview** (the selector in the header), **Settings**, the **Path** page, or with `/teacher setup code_language:`:

| Track | What students get |
|---|---|
| 🟨 JavaScript · 🐘 PHP · 🐍 Python · ☕ Java · 🔧 C · ➕ C++ | The algorithm roadmap (variables → loops → strings → arrays → … → recursion, sorting, dynamic programming), all code in that language |
| 🗄️ SQL (databases) | Its own roadmap: SELECT → WHERE → ORDER BY → COUNT/SUM → GROUP BY → JOIN → subqueries → INSERT/UPDATE → tables & keys. SQL challenges are run on real data to check the answer |
| ⚛️ MERN | JavaScript basics, then asynchronous code, the web, Node.js, Express, MongoDB, React |
| 🤖 Python, AI & LLMs | Python basics, then data with pandas, machine learning, calling LLMs, RAG |

Switching the track changes everything at once: the challenges `/practice` and duels pick, the daily challenge plan, `/today`, the `/path` roadmap and its lessons. Each track keeps its own customized roadmap and lessons, so you can switch a class back and forth without losing your edits. Each class (Discord server) has its own track, so one group can do SQL while another does Java.

**🌐 French / English:** every quick challenge and every lesson has a button that shows it in the other language (the built-in French twin when there is one, otherwise an AI translation that is kept for next time).

---

## What your students can do (in Discord)

| Command | What happens |
|---|---|
| `/link username` | Links their HackerRank account. They must **prove it's theirs** by putting a short code (like `CB-7KQ2`) in their HackerRank bio and pressing Verify, so nobody can claim someone else's solves. You can also verify with `/teacher verify @student`. |
| `/practice [difficulty] [type] [topic]` | A challenge at their level, private to them. **🎯 Picked for me** looks at their answers and code and gives what they need next: a beginner gets a first, easy write-code exercise on the first skill of the track; a student who keeps failing a skill (say arrays, including mistakes found in their code) gets that skill at the level they can manage; otherwise the next step of their path. Leaving `difficulty` empty picks a level that suits them for any type. **Write code**: a real problem (statement, samples, hidden tests including big ones); the statement says exactly what to write: *complete `solve(s)`, which receives the input and **returns** the answer*, with examples shown as calls (`solve("aaab") → "a3b1"`); the template already reads the input and prints what `solve` returns. They write **JavaScript, PHP**, Python, Java, C or C++ in the code editor page, can run the samples first, and the code is **run on the tests** (accepted / wrong answer / too slow / crash), with an **AI coach** explaining mistakes without giving the answer. **Quick** types are answered in Discord: multiple choice, complexity, predict the output, find the bug (always in the class's track language). Also **SQL query**, **regular expression** and **Git** types; choosing `language: SQL` gives a SQL query challenge. **HackerRank problem**: solved on HackerRank, then checked on their verified profile (only solves made after the challenge was given count). A topic like "recursion" makes the AI write a fresh one in the background (about a minute). |
| `/duel @friend [quick / write / HackerRank] [difficulty] [stake]` | 1 vs 1, posted in #arena: both get the same challenge and the first to solve it wins (10, 45 or 60 minutes). Coins can be staked, and the winner gains Elo rating. Quick duels are blocked for a student who has used up today's quick challenges. |
| `/daily` | Today's daily challenge. The first three solvers get a bonus, and solving every day builds a 🔥 streak. |
| `/assignments` | Challenges you assigned to them, with due dates |
| `/profile [@someone]` | Level and title (Novice → Legend), season rank, solved by difficulty, accuracy, duel record, badges |
| `/leaderboard [season / all-time / duels / coins / teams]` | Rankings |
| `/rival add @friend` | They get pinged when their rival passes them in a contest, and can see head-to-head records |
| `/bet place player amount` | Predict a contest winner with play coins |
| `/contest standings` | Live contest leaderboard |
| `/today [remind]` | Their plan for today: 3 challenges picked for them (a rematch of one they missed, one at their edge, a warm-up), a bonus and a 🗓️ plan streak when they finish it |
| `/skills` · `/path` | Their skill map and most frequent mistakes. **Mastery is a difficulty ladder**: easy challenges alone go up to 50%, reliable success at medium adds up to 30% more and hard the last 20% (a solve also proves the easier levels, a failure also counts against the harder ones, and one lucky solve isn't proof: it takes several). **Code counts 4× more than the other types (80/20)**: without code a skill stays at 20% max, and **every code submission updates the skills it uses** (a crash on an array index in a binary-search problem lowers *Arrays*; the AI review names the skill of each mistake, or the error message does). Big-O, Git, web, MERN and AI skills, which can't be run, are measured by their own challenges · a step-by-step path with a 📖 lesson for each step: written for beginners (a plain explanation with an everyday comparison, one tiny example **in the class's track language**, a 🌐 button to switch English/French, one tip) and links to free tutorials to read more (javascript.info, php.net, Python docs, W3Schools, Khan Academy, VisuAlgo…, in French when the class is in French) |
| `/shop` · `/create` | Spend coins from two menus (built-in items, your own rewards). **Items:** 🧊 streak freeze, 🎟️ hint token. **Boosts:** 💎 double code hour (×2 on write-code the student picks: practice, `/today`, `/path`, never on assigned work), 🎯 challenge contract (pick 5 easy / 3 medium / 2 hard code or SQL solves, reach it within 24 hours, win 150 coins), 🛡️ duel shield (a lost duel doesn't cost Elo for 24 h). **Profile:** 🏷️ title, 🎨 name color, 🖼️ theme, 💬 motto, 😎 emoji, 🏅 badge showcase, 💻 favourite language, 📌 proudest solve, 🔲 avatar frame (shown in `/profile` and the shared page). **In the game:** ⚔️ victory message in duels, 🎉 level-up announcement style in #arena, 🌟 flair on every leaderboard · write a challenge for the class (you approve it; they earn points when classmates solve it) |
| `/help-me` | ✋ Raise their hand: question + optional code go to your live **Help queue**; you get a **Discord DM** with the question and a button that opens it in the dashboard; you come over or answer by DM |
| 🙋 **Ask a classmate** (button) | Under a write-code or SQL challenge after a wrong submission: their code and result are posted in #arena, a classmate explains the mistake **in words** (pasted solutions are refused), and if the student rates it 👍 the helper gets **+8 pts and 5 coins** (3 requests a day, 3 rewarded helps a day; not in exams, sessions, duels, bounties or boss battles) |
| `/ask question` · `/faq` | ❓ Looks in the class FAQ first; otherwise you get a **Discord DM** with a button to answer it (an AI draft is ready for you to check); they get your answer by DM and it joins the FAQ |
| `/interview [difficulty]` | 🎤 Mock coding interview: they explain approach, edge cases and complexity to an interviewer, code it, and get a scorecard (+5 pts once a day) |
| `/github` | 🐙 Link their GitHub account once (they install the class's GitHub App on their repos). Their pushes then feed the activity reports, the brief reminders and the debriefs |
| `/brief` · `/brief submit` | 📄 Their briefs (dates, squad, what they handed in, their debrief result and the competencies validated) · hand in the repo (and the planning board) for a brief; in a squad, the scrum master hands in |
| Assessment link (DM) | 📝 Opens the assessment in the browser, **in full screen**, one question at a time, in their own order. Leaving full screen, switching tab or reloading **stops them** until you let them back in; pasting is blocked and logged |
| `/league` | 🏆 Class vs class this week (points per student) |
| `/help [topic]` | Every feature, in pages: getting started, challenges, write code, points, duels, daily & assignments, contests, social, coach, help, briefs & GitHub, teacher tools |

**Teacher commands** (for members with *Manage Server*): `/teacher setup` (language, daily hour, #arena, what the class learns) · `/teacher notify` (🔔 get a DM for every `/help-me` and new `/ask`, with a button to answer in the dashboard; sends a test DM) · `/teacher track` / `stop` (HackerRank contests) · `/teacher season` (new season, certificates) · `/teacher verify @student` · `/teacher dashboard`.

On `/profile`, students can **🔗 share a public profile page** (level, badges, skills, recent solves, never their code; they can stop sharing any time) and open their **🎓 certificate** (print or save as PDF). When you start a new season, every student who scored gets their certificate by DM.

**Points = level base × type multiplier**, so harder and deeper challenges are worth much more:

| | Easy (3) | Medium (6) | Hard (12) |
|---|---|---|---|
| Multiple choice ×1 | 3 | 6 | 12 |
| Complexity ×2 | 6 | 12 | 24 |
| Predict the output ×3 | 9 | 18 | 36 |
| Find the bug ×5 | 15 | 30 | 60 |
| HackerRank problem ×8 | 24 | 48 | 96 |
| Write code ×10 | 30 | 60 | 120 |

Then: daily ×1.5 (+15/+10/+5 for the first three), assignment on time ×1.5, duel win ×2, hint ×0.5, second try ×0.5 (write code: −15% per extra submission, min 40%), quick answer within 60 s +20%. Contests: 120/90/70 for the podium, 40 for the top 10, 15 for taking part, 25 per special award. **No farming of quick challenges:** in `/practice` and duels, multiple choice, complexity, output and bug give full points for the first 3 a day, 50% for the next 2, then they are **locked until the next day** (max 150 pts a day; the lock can be turned off), and a challenge solved before never pays twice. **Write code and HackerRank problems are never limited**, and neither is anything you hand out (daily challenge, assignments, class sessions, `/today` and `/path`): those always give full points and never use up the allowance. **You can change all of it in Dashboard → Settings → Scoring**; `/help` shows the current table.

**Difficulty is real.** The built-in bank (62 quick challenges + 18 write-code problems, English and French) was checked by running every snippet; hard write-code problems need a real algorithm (DP, binary search, monotonic stack, Dijkstra, divide and conquer…) and a naive solution fails the big tests on time.

**Contests** work like before, with more show: live commentary (first blood, lead changes, big jumps, photo finishes), a frozen board for the last 15 minutes, then a suspense reveal (3rd… 2nd… *and the winner is…*). Then come awards (🩸 First Blood, 📈 Biggest Climber, 🌱 Most Improved, ⚡ Speed Demon, 🦉 Last-Minute Hero), team results, bet payouts, the 👑 champion role, and a link to an animated **race replay** page.

**Every Monday** the bot posts a weekly recap: top earners, most solves, duelist of the week, longest streak.

## What you can do (dashboard)

- **Overview:** a **Live in your class** panel at the top (raised hands waiting, questions to answer, student challenges to review, a running class session, live events, briefs in progress and the hand-ins waiting for their debrief, assessments open (and students stopped), mock interviews and daily plans this week, helpful peer explanations, your league rank), then activity over 30 days, accuracy, a highlighted list of students who **need attention** (inactive, points dropping, low accuracy, missed assignments), top earners, latest answers, and self-reported HackerRank solves to approve (they give **no points until you approve**).
- **Students:** sortable and searchable class list with a trend for each student (↑ improving, ↓ slipping, ⏸ inactive). CSV export for grading.
- **Student page:** a header (level, team, GitHub, HackerRank, actions), six key figures and tabs: **Overview** (GitHub snapshot, the current brief, competencies, what to work on, coach), **Briefs & competencies**, **GitHub**, **Challenges**, **Points & history**. The **GitHub tab** shows every commit and pull request of the period (14, 30 or 90 days) flagged *tiny*, *vague message*, *huge* or *node_modules*, a calendar of when they push (and how much at night), the commit quality, their repos with the brief each belongs to, and **✨ What they built**: the AI reads their commits and the brief's requirements and lists the features they implemented per repo and which requirements show up. *Load from GitHub* reads older commits through the class's App. Also: points per week, contest results over time, a *strengths and gaps* grid (success rate by challenge type × difficulty), every challenge **solved** and **not solved** (with their wrong answers, and for write-code problems their **submitted code**, verdict and the AI coach's note), assignments, duels and points log. **Competencies:** the student's record on the programme's référentiel (C1…C8, CT1…CT9, highest level validated, with the history brief by brief and assessment by assessment), their briefs (**what they built**: repo, each feature / requirement done or missing, competencies validated or not with the AI's reason, automatic checks, mise en situation, strengths, comment, and a link to the full debrief), assessments and 14 days of GitHub activity. Give bonus points, assign a challenge, or verify / unlink their HackerRank account. **Coach** panel: a bar per skill (80% from code, 20% from the other types; *no code yet* and *N code mistakes* marks, hover for the details), recurring mistakes and what to work on next. **What to work on**: for each skill they should work on, *why*: the code challenges they didn't solve (and how: wrong answer on hidden test 3, crashed with IndexError…), the mistakes found in their code on other challenges, the questions they missed (what they answered vs the right answer), and the checks their brief projects and assessments failed, with buttons to give them 3 challenges on it or generate new ones.
- **Challenges:** the whole bank with success rates. Write your own (for a write-code problem: statement, a reference solution in Python and test inputs; the expected outputs are computed by running your solution), import any HackerRank problem by link, or **generate one with AI**: write-code problems are kept only if the AI's fast solution and a brute-force solution agree when actually run, and the AI's guess is never trusted for "predict the output". Students can 🚩 report a wrong challenge: two reports pause it until you fix it, and fixing an answer automatically gives credit to students who were actually right.
- **Daily challenge:** turn it on or off, choose the channel, the time, the language of quick challenges (e.g. only JavaScript) and the level + type for each weekday (including **SQL** and **regex** days). See the next 14 days and **pick a specific challenge for any date** (or leave it random), **post one right now** (chosen or random, in any channel), and see how many students opened and solved each past daily.
- **Points:** give or remove points for everyone or for selected students, set them to an exact value, and reset the season leaderboard (or everything, levels included). Every change is written to the points log with your reason, and students can be told by DM.
- **Coins & shop:** every student's coins; give, remove or set coins (0 to zero them) for everyone or selected students, with a reason and an optional DM, and a history of changes. Manage `/shop`: prices, limits, durations (days or hours) and the contract reward of the 17 built-in items, grouped as items, boosts, profile and in the game; turn any of them off; remove a title, motto, emoji or victory message a student wrote (no refund); and add **your own rewards** (e.g. 🪑 choose your seat, 📄 skip one homework) with a stock and a limit per student. When a student buys one, you get a DM and it waits in **Rewards to give** with *Given* / *Refund* buttons.
- **Assignments:** give a challenge to everyone, a team, or chosen students, with a due date and a note. Students get a DM and a channel ping, a reminder 24 h before the deadline, and you see who finished on time, late, or not at all.
- **Contests:** follow a contest, end it early, see results, awards, bets and a score-race chart.
- **Teams:** create teams and pick members. A team's contest score is its members' *average*, so helping the weakest member is the best strategy.
- **Class sessions:** pick a few challenges and a duration; the bot posts a button in #arena (and pings a team if you choose one). Students solve in the code editor and you watch a live grid (✅ ❌ ✏️ ⚑ per student and challenge). When time is up, answers stop being accepted.
- **Integrity:** every write-code answer sent with warning signs: paste attempts, big blocks of code appearing at once, leaving the editor page, typing with no corrections or impossibly fast, code almost identical to a classmate's, a weak explanation. Watch a **replay of the typing**, then mark it *looks fine* or *remove points* (with an optional DM). Nothing is removed automatically.
- **Help queue:** live list of raised hands (oldest first, with their code and the challenge they're on), refreshes by itself. *I'm coming* tells the student by DM; *Answer by DM* sends a written reply. Keep it open on a second screen during class.
- **Questions:** questions from `/ask` with an AI draft to check, edit and approve (optionally posted in #arena); approved answers become the class FAQ. Add your own entries (exam dates, rules…).
- **Interviews:** every mock interview with its scorecard and full transcript.
- **Path & lessons:** reorder the steps, see for each step **how many challenges your bank has** for that skill and level (orange when it's running low), and edit any lesson with a live preview of what students see. Each track has its own roadmap; the lesson list shows the roadmap's skills first. Change the track right on this page.
- **✨ Generate with AI, everywhere:** a lesson for any skill (in the track's language, English + French, linking only to known resources); new challenges for a path step or a skill on the Skills page (each one checked before it's saved, then tagged with the skill; SQL challenges are run on several datasets before they're kept); the challenge generator can target a skill; a live-quiz question; briefs (ideas, whole briefs, one section at a time), evaluation grids, mises en situation and debrief comments; assessment questions; FAQ answer drafts.
- **Competencies:** the whole class on the référentiel: highest level each student validated for each competency, and the % of the class that validated it. Click a cell (or a competency on the student page) to **validate it at a level or invalidate it yourself** (✍️, with a note); your decision overrides earlier results, later briefs and assessments still count, and *Back to automatic* removes it.
- **Briefs:** follows the class's **programme** (the YouCode DWWM 2026/2027 planning is built in: 8 sprints, 32 weeks, competencies per week; classes on another stack get their own copy to edit). The **Planning** tab shows every week with its objective, concepts and competencies, and the briefs given. **✨ New brief**: from your idea, from 5 AI ideas for that week, or from the notes of a meeting with a real client; the AI writes the whole brief in the Simplonline format (context, user stories by role « En tant que …, je vais …, afin de … », bonus, modalities, evaluation, deliverables, performance criteria, professional situation, competencies with their level) plus your product-owner notes (concepts covered, questions to expect, risks). Or **import a Simplonline brief** (save the page as .html: text, stories and competency levels come with it). Edit every section, ✨ rewrite one section, quality checks (stories format, criteria, competencies of the week), **Copy** buttons per Simplonline field. Solo or **squads** (random or by hand, with a scrum master). **Publish**: dates, the evaluation grid, an announcement in Discord, reminders 3 days and 1 day before.
- **Debriefs:** per student (or squad) after the deadline: the bot reads their repo (files, commits, each member's part in a squad, the Trello board), runs **sure checks** on the code (pages, semantic HTML, forms, responsive, fetch, PDO, prepared statements, MVC, migrations… about 70), the AI judges each point of the grid and each competency with the evidence, and you decide with switches. **Mise en situation**: one small task on a point of the brief drawn at random, sized for the level (10/15/20 min), with what to observe and the result. The comment is written from your switches (edit it freely). **Finalize**: the competencies (validated or not yet, at the brief's level), the skills shown or missed in the code, points and coins go on the student's record (and the comment by DM). Reopen takes it all back.
- **Watcher:** the **GitHub** page (who worked today, who needs your attention and why, briefs in progress with 📣 *Announce* in French and *Post status* in Discord, the students' table with filters, search, sort and a **brief filter**; click a student for their panel), **Briefs → Follow-up** (one card per brief: who pushed, hand-ins or squads, grid and steps, type & squads, dates & sprint), **+ Quick brief** (one form), **Sprints** and **Progress**. **Simple mode** (under the menu) keeps only these pages. A push counts only the pusher's own recent commits.
- **Sprints:** the sprint review of each sprint of the programme. Every student: the sprint's competencies reached in its briefs (✓ at the level asked, lower level, ✗, —; the transversal ones in one CT column), briefs evaluated, grid %, a **level** for the administration's report (Excellent → Critique: ✨ proposed for the class, the AI never gets the names; you choose), your decision (✓ / ✗, the proposal dotted) and a note. **Levels** counts the students per level with the names of the weak ones (Copy), and **Sprint comment** writes one comment for the whole class (✨, then edit, Save, Copy). *All sprints* shows the year.
- **Debrief extras:** **oral questions** for the soutenance (✨ at most 5, on the brief only, each with the expected answer; each starts Not valid, the ones still Not valid go in the comment as *Notions à revoir*) and a **level** (Excellent → Critique) proposed from your switches; you choose it and can change it at any time. **Progress:** one column per brief, one square per debrief in the colour of its level, and the count per level over the year.
- **Steps:** a brief cut into parts with dates (« Partie 1, fin du jour 1 : … ») gets its **steps** when you publish it (✨ the AI finds them otherwise; edit them in the *Evaluation grid* tab: `name | YYYY-MM-DD HH:MM | expected`). Day N counts working days from the brief's start. On a debrief, each step has **Propose validation**: the bot reads the repo as it was at the step's date (files, commits before / after) and proposes *on time*, *late*, *not validated* or *to check*; you choose. The comment gets a **Suivi du projet** part (your result for each step, and a line when most commits came during the last step); each squad member's comment shows their commits per step.
- **Assessments:** write questions (write code, explain a concept, multiple choice), or ✨ generate them from a topic, a brief, or **one student's weak points**. Invite the class or some students: each gets their own link. **Live** tab: who is answering, progress, time left, who was stopped and why (left full screen, switched tab, reloaded), *Let back in* (with extra minutes). **Results**: multiple choice graded at once, code and explanations by the AI with your expected answer; click any cell to read the answer and change the grade; send results by DM. Scores feed the competencies and skills of each question.
<<<<<<< HEAD
- **GitHub:** the setup checklist (with the URLs to paste in the GitHub App), 14 days of activity per student (commits, PRs, huge or vague commits, idle days), where messages go (reports & reminders, “X connected GitHub” in its own channel or not at all, the activity forum; a channel named *github* is used when nothing is chosen) with a *send a test* button and the last forum error, daily and weekly reports, one forum post per student (archived posts are reopened, forums that require a tag get one), repos to ignore, what a finalized debrief gives (points and coins per competency), and a one-time **import from GitHub Watcher**.
=======
- **GitHub:** the setup checklist (with the URLs to paste in the GitHub App), 14 days of activity per student (commits, PRs, huge or vague commits, idle days), daily and weekly reports in a channel, one forum post per student (optional), repos to ignore, what a finalized debrief gives (points and coins per competency), and a one-time **import from GitHub Watcher**. Students should choose **All repositories** when they install the App: with *Only select repositories* a new project (the next brief, a squad repo) sends nothing until they add it. The connect page warns them, they are flagged *Some repos*, and **Check repos** asks GitHub again for the class.
>>>>>>> 26cba2e79016457e1e2029fd1c836f4d2e658d8c
- **⚔️ Squad battle:** a game for the class TV. Two teams, one clock each (2 minutes by default). Pick the teams (from your Teams or a brief's squads, or just names), the topics and the kinds of questions (what does this code print, missing keyword, acronym, quick question, true/false, find the bug, A/B/C/D, complete it); the AI writes quick questions (built-in ones fill in). Open the **TV screen** (full screen, sound on): it shows a QR code you scan with your phone to become the **judge** (the first phone; another one needs the PIN). On the phone: who starts, *Start* (3-2-1-GO), the answer of each question, and big buttons: **✓ Correct** (their clock stops, the other team's turn), **✗ Wrong** (a buzz, the clock keeps running), **⏭ Pass** (−8 s and a new question), pause, other question, end. The TV animates every answer (stamps, confetti, sounds made in the browser, the last 10 seconds ticking, 🔥 streaks) and ends on the winner's screen with stats. Optional points for the winners and the result in #arena; *Rematch* swaps who starts.
- **🧩 Squads (Teams & squads):** the class's squads by sprint, separate from the briefs, on a drag-and-drop board (tap-to-move on tablets), ★ scrum master, random squads, history of past squads. A brief in squads or a squad battle loads them. **🤝 Squad buddy** (shop, 800 🪙, once per season): a student picks a classmate; the board shows it and random squads keep them together.
- **🌐 Translate on assessments:** on each question, العربية / FR / EN buttons translate the question (and the sentence choices, never the code) with Google Translate, from the server (no extension needed in full screen).
- **🤖 Settings → AI (Groq):** paste your free Groq key (console.groq.com/keys) and pick the model; ClassBot tests it with Groq before saving, never shows it again, and uses it for every class of this ClassBot (it wins over the `GROQ_API_KEY` secret; remove it to go back).
- **Classes & league:** all your Discord servers side by side (students, active, solved, points per student, accuracy, 4-week trend), join the **class league**, and open or send **certificates** for any season. **League with other teachers' ClassBots** (each teacher hosting their own on Cloudflare): copy *Your league link* and send it to them; paste theirs in *Classes from other ClassBots*. Each ClassBot reads the others' links every 30 minutes (only class numbers: name, size, active students, points, solved; never students' names), and shows them in the dashboard, in `/league` and in the Monday post. *Renew the link* stops the old one.
- **Settings:** language (English/French), what the class learns (the track), the #arena channel, daily challenge time, roles, seasons, **scoring per type**, **🔔 Discord notifications** (who gets the `/help-me` and `/ask` DMs, turn each on or off, send a test DM), and **Diagnostics** (checks that the code runner, the AI and HackerRank answer, shows the AI budget and the bank size).

Want to look before installing anything? Run `npm install && npm run preview` and open http://localhost:8787 to see the dashboard with a demo class.

---

## Saving your challenges in the repo

Challenges you write in the dashboard, the ones the AI generates and HackerRank problems you import live in your Cloudflare database. To keep them with the code, so anyone who clones your repo starts with them:

```bash
npm run export:challenges
```

It reads your live database (you must be logged in to wrangler, as for `npm run update`) and writes `migrations/00NN_my_challenges.sql`. Commit that file. New installs get the challenges during `npm run setup`; your own database already has them, so applying the file there changes nothing. Run it again whenever you've added more: only new challenges are written. Exported challenges are shared by every server using that install, and the author's Discord ID is left out. Your students' answers, points and names are never exported.

## Updating

After you get a new version of the files, run this in the classbot folder:

```bash
npm run update
```

It updates the database (`db:migrate`) and deploys the bot and the dashboard. Slash commands update by themselves within a minute. If the bot ever says *"the database wasn't updated"*, this is the command it means. Dashboard → Settings → **Run checks** shows whether anything is missing.

## Quick setup (about 15 minutes)

1. Create a Discord application at <https://discord.com/developers/applications> (**New Application**), open the **Bot** tab, click **Reset Token**, and copy the token.
2. In this folder, run:
   ```bash
   npm install
   npm run setup
   ```
   Paste the token when asked. It stays hidden and is only stored as an encrypted Cloudflare secret. The assistant invites the bot to your server, logs you in to Cloudflare, creates the database, deploys, connects Discord and registers the commands. Running it again is safe.
3. Lock the dashboard with a password only you know: `npm run setup:password`. This is free, with no card needed. If you'd rather use Cloudflare Access with email codes, see step 9 below and run `npm run setup:access`.

The manual steps below do the same thing by hand, if you prefer or if something goes wrong.

## Setup, step by step (about 45 minutes)

**You need:** a Discord server where you're an admin, a free [Cloudflare account](https://dash.cloudflare.com/sign-up), and [Node.js 22 or newer](https://nodejs.org) on your computer. You'll type a few commands in a terminal; each one is given exactly.

### 1. Install the project
Unzip the folder, open a terminal **inside it**, and run:
```bash
npm install
```

### 2. Create the Discord bot
1. Go to <https://discord.com/developers/applications> → **New Application** → name it (e.g. *ClassBot*).
2. On **General Information**, copy the **Application ID** and the **Public Key** and keep them handy.
3. Open the **Bot** tab → **Reset Token** → copy the token. *This is a password: never share it.* No "Privileged Gateway Intents" are needed.
4. Open **OAuth2 → URL Generator**:
   - Scopes: `bot` and `applications.commands`
   - Bot permissions: `View Channels`, `Send Messages`, `Embed Links`, `Read Message History`, `Manage Roles`
5. Open the generated link at the bottom and add the bot to your server.

### 3. Log in to Cloudflare and create the database
```bash
npx wrangler login
npx wrangler d1 create classbot-db
```
The second command prints a `database_id`. Paste it in **both** `wrangler.bot.jsonc` and `wrangler.admin.jsonc`, replacing `PASTE-YOUR-DATABASE-ID`.

### 4. Fill in the config files
In `wrangler.bot.jsonc`, replace:
- `PASTE-APPLICATION-ID` → your Application ID (step 2)
- `PASTE-PUBLIC-KEY` → your Public Key (step 2)
- `PASTE-YOUR-SUBDOMAIN` (twice) → your workers.dev subdomain. Find it in the Cloudflare dashboard under **Workers & Pages**, shown as *your-name*.workers.dev. If you don't have one yet, it is created on first deploy: deploy once (step 6), then come back and fix these two lines.

In `wrangler.admin.jsonc`, replace `PASTE-APPLICATION-ID` and `PASTE-YOUR-SUBDOMAIN` the same way.

### 5. Create the tables and the challenge bank
```bash
npm run db:migrate
```
Answer **y** when asked. This creates the tables and loads 32 built-in quick challenges (English and French, each answer verified by running the code) and 78 HackerRank problems.

### 6. Store the bot token and deploy
```bash
npx wrangler secret put DISCORD_TOKEN -c wrangler.bot.jsonc
npx wrangler secret put DISCORD_TOKEN -c wrangler.admin.jsonc
npm run deploy
```
Paste the bot token when asked (twice). The deploy prints two URLs:
- `https://classbot.<subdomain>.workers.dev` (the bot)
- `https://classbot-admin.<subdomain>.workers.dev` (your dashboard)

Opening the bot URL should show *"ClassBot is running ✅"*.

### 7. Connect Discord to the bot
Back on the Discord developer portal → **General Information** → **Interactions Endpoint URL**, enter:
```
https://classbot.<subdomain>.workers.dev/interactions
```
Click **Save Changes**. Discord tests the URL immediately; if it saves, the connection works.

### 8. Register the slash commands
Copy `.env.example` to `.env` and fill it in. Your server ID: in Discord, turn on *Settings → Advanced → Developer Mode*, then right-click your server → **Copy Server ID**.
```bash
npm run register
```
You should see `✅ Registered 12 commands on server …`.

### 9. Lock the dashboard with Cloudflare Access
Until you do this, the dashboard shows *"Dashboard locked"*. That's on purpose: it holds student data.
1. Cloudflare dashboard → **Workers & Pages** → **classbot-admin** → **Settings** → **Domains & Routes**.
2. Next to `workers.dev`, click **Enable Cloudflare Access**. If Cloudflare asks you to pick a Zero Trust plan, choose **Free** (up to 50 users). Depending on your account it may ask for a payment method; the Free plan isn't charged.
3. Click **Manage Cloudflare Access** and make sure the policy allows **your email only** (add co-teachers if you like).
4. The Access popup shows an **AUD tag**. Your **team domain** is shown in Zero Trust → Settings, as `https://<team>.cloudflareaccess.com`.
5. Put both in `wrangler.admin.jsonc`:
   ```jsonc
   "TEAM_DOMAIN": "https://<team>.cloudflareaccess.com",
   "POLICY_AUD": "<the AUD tag>"
   ```
6. `npm run deploy:admin`

Open your dashboard URL: you'll get a one-time code by email, and then you're in. The dashboard checks Cloudflare's signed login token on every request, so it can't be reached around Access.

### 10. First run in Discord
1. In the channel where the bot should post, run `/teacher setup` (choose language, daily challenge hour in UTC, and what the class learns: a language, SQL, MERN or AI).
2. Optional, for roles: create two roles, e.g. **👑 Champion** (gold, displayed separately) and **🔥 On Fire**. In *Server Settings → Roles*, drag the **bot's role above them**, then pick them in the dashboard under **Settings → Roles**.
3. Tell students to run `/link <their HackerRank username>`, then `/practice`.
4. Follow a contest with `/teacher track link:<contest URL>` or from the dashboard's **Contests** page.
5. Run `/teacher notify` to get a Discord DM whenever a student uses `/help-me` or `/ask` (a test DM is sent right away).

That's it. 🎉

---

## Things to know (honestly)

- **HackerRank has no official API.** The bot reads the same JSON that hackerrank.com uses for its pages: contest leaderboards, and a student's *recently solved* list for checking coding challenges. These are undocumented and could change, and HackerRank might block requests coming from Cloudflare. I couldn't test against the real HackerRank, so try one practice problem and a small test contest first.
  - Only **verified** links count (code in the HackerRank bio, or verified by you), and only solves made after the challenge was handed out.
  - If HackerRank can't be reached, students get an **"I solved it"** button instead. These self-reports give no points until you approve them in the dashboard.
  - Contest leaderboards must be public on HackerRank.
- **Code is judged by tests, not by the AI.** Students' code runs on [Wandbox](https://wandbox.org), a free public compiler service: one request compiles the program, builds the big test inputs and runs every test with its own time limit, for **JavaScript (Node.js 20), PHP 8.3**, Python, Java, C and C++. [Compiler Explorer](https://godbolt.org) is the backup for Python/C/C++/Java. If both are unreachable, the AI judges from the samples and the solve is marked "judged by AI" in your dashboard.
- **The AI is checked, not trusted.** "Predict the output" answers come from really running the code; multiple choice is re-solved by an independent pass; write-code problems need two solutions that agree on a real computer. Mistakes can still slip through, which is what the 🚩 Report button and the regrade feature are for.
- **Any free AI works.** By default the bot uses Cloudflare Workers AI (`gpt-oss-120b`, free 10,000 neurons a day, about 80 budget units in `RULES.aiDailyLimit`). To use **Ollama** (on your PC, exposed with a Cloudflare Tunnel), **Groq** or **OpenRouter** instead, set `LLM_BASE_URL` (e.g. `https://api.groq.com/openai/v1`), `LLM_MODEL` in `wrangler.bot.jsonc` and `wrangler.admin.jsonc`, and `npx wrangler secret put LLM_API_KEY -c wrangler.bot.jsonc` if the service needs a key.
- **The freeze is Discord-only.** Students can still open HackerRank's own leaderboard during a freeze. Ask them to play along.
- **Free limits** are generous for a class: 100,000 bot requests/day, a 5 GB database, and the AI budget above. AI generation runs one job per minute in the background, and the bank is always used first.
- **Anti-cheat makes AI use visible, not impossible.** A bot can't control a student's computer: they can still read a solution on their phone and retype it. What ClassBot does:
  - **Code editor page** (default for write-code answers): pasting and dropping are blocked, leaving the page is recorded, and every keystroke is kept for a replay.
  - **Explain your code:** after an accepted answer, half the points wait until the student answers 2 AI-written questions about *their own* code within 3 minutes (with no AI available, they get the points).
  - **Similarity:** each submission is compared with the latest 60 from other students (names, spacing and comments ignored); 85%+ similar flags both.
  - **Quick challenges as images** (output, bug, complexity), plus an optional time limit, so the code can't be pasted into a chatbot in time.
  - **Class sessions** for supervised work, and practice points can count less (Settings → Anti-cheat).
  - Flags are reasons to look, not proof. The best check is still asking the student to explain their code in class.
- **Briefs and debriefs use Groq first.** Set `npx wrangler secret put GROQ_API_KEY -c wrangler.bot.jsonc` and the same with `-c wrangler.admin.jsonc` (free key from console.groq.com; never put it in a file). Without it, or when Groq is busy, Workers AI answers. The AI proposes, you decide: sure checks of the code win over the AI, and nothing goes on a student's record until you finalize.
- **GitHub needs a GitHub App** (free): students install it on their repos with `/github`, so the bot can read private repos too. Its secrets: `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_PRIVATE_KEY` (see *Briefs, GitHub and assessments* below). The dashboard's GitHub page tells you what's missing.
- **Full screen can't stop a second device.** The assessment page stops a student who leaves full screen, switches tab or window, or reloads, and blocks pasting; it can't see a phone. The mise en situation in the debrief is the real check.
- **Interviews and FAQ drafts use the AI budget** (about 1 unit per interviewer question, 2 per scorecard, 1 per draft). When the budget is used up, the interviewer asks scripted questions and the scorecard is computed from the judge's results; you write FAQ answers yourself.
- **Certificates are web pages** made for printing: students (or you) press *Print → Save as PDF*. Links are signed, so they can't be forged; the current season's certificate shows "in progress".
- **Coins are play money.** Nobody can drop below 10, so nobody is ever out of the game.

## Troubleshooting

| Problem | Fix |
|---|---|
| Discord refuses the Interactions Endpoint URL | Check `DISCORD_PUBLIC_KEY` in `wrangler.bot.jsonc`, then `npm run deploy:bot` and try again. |
| Slash commands don't appear | Set `GUILD_ID` in `.env` and run `npm run register` again. Restart Discord (Ctrl+R). |
| "This interaction failed" | Run `npm run logs` while you retry; the error shows up there. |
| Dashboard says "locked" | Step 9 isn't finished: `TEAM_DOMAIN`/`POLICY_AUD` missing, or `deploy:admin` not run. |
| "Forbidden: invalid Cloudflare Access token" | The `POLICY_AUD` doesn't match the Access application's AUD tag. |
| Roles aren't given | The bot's role must be above the Champion/Streak roles, and it needs Manage Roles. The bot also posts a warning in the channel. |
| No DM when a student uses `/help-me` or `/ask` | Run `/teacher notify` in your server: it makes you the one who gets them and sends a test DM. If it says Discord refused it, open the server's menu → **Privacy settings** and turn on **Direct messages**. Dashboard → Settings → **🔔 Discord notifications** shows who gets them. |
| No daily challenge | Create a channel named `arena` or run `/teacher setup arena:#channel`. It's posted at the set hour **UTC**. |
| "Judge down" / AI errors | Dashboard → Settings → **Run checks** shows which service is failing. |
| Something went wrong after updating | Run `npm run db:migrate` (new tables), `npm run deploy`, then `npm run register` (new command options). |

## Customizing

- **Scoring:** Dashboard → Settings → Scoring. Other rules (tries, duel times, bonuses): `src/shared/game.ts`, the `RULES` block.
- **All bot texts (English and French):** `src/shared/i18n.ts`.
- **Built-in challenges:** `tools/bank_quick.py` and `tools/bank_write.py`; `python tools/gen_bank.py` re-verifies everything (runs every snippet, reference vs brute force, timing) and writes the migration. Or simply write them in the dashboard.
- After changing code: `npm test`, then `npm run deploy`.

## Briefs, GitHub and assessments (setup)

1. **AI:** `npx wrangler secret put GROQ_API_KEY -c wrangler.bot.jsonc` and `-c wrangler.admin.jsonc`.
2. **Programme:** dashboard → **Settings → Programme**. The DWWM 2026/2027 planning is built in. For another year or stack, download the Excel template (it comes filled with the current programme), change it, and upload it; the YouCode planning workbook (sheets *Planning Annuel* and *02_Sprints*) can be uploaded as it is. You check what was read before it's used.
3. **GitHub App:** dashboard → **Settings → GitHub & Watcher** → **✨ Create the GitHub App for me**: GitHub opens with everything filled in (URLs, permissions, events), you click *Create GitHub App*, and the App is saved for the class. Or do it by hand: It shows the three URLs to paste in the App (Callback, Setup, Webhook) and a step-by-step guide; paste the App ID, slug, Client ID, client secret, webhook secret and private key there. Each class (each teacher) can have its own App. A school-wide App can also be set once in the Worker's secrets (`GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_PRIVATE_KEY`): classes without their own App use it.
4. **Coming from GitHub Watcher?** Settings → GitHub & Watcher → *Import*: give the Cloudflare Account ID, the Watcher's KV namespace ID and an API token with *Workers KV Storage: Read* (used once, never saved). Or bind the namespace as `WATCHER_KV` in both wrangler files and deploy.
5. `npm run update`, then students run `/github` once.

## Project layout

```
src/bot/        Discord interactions, cron jobs, public race replay page
src/admin/      dashboard API + Cloudflare Access check
src/shared/     rules, texts, challenges, contests, AI, HackerRank, Discord helpers
public/         the dashboard (plain HTML/CSS/JS, no build step)
migrations/     database schema + challenge bank
tests/          end-to-end tests (npm test) and the demo preview (npm run preview)
```

`npm test` runs 901 end-to-end checks against the real code, with Discord, HackerRank and the AI faked, the database on Node's built-in SQLite, and students' code **really executed** locally (needs `python3`; `g++` for the C++ check).
