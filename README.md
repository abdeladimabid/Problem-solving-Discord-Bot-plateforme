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
| `/practice difficulty [type] [topic]` | A challenge at their level, private to them. **Write code**: a real problem (statement, samples, hidden tests including big ones); the statement says exactly what to write: *complete `solve(s)`, which receives the input and **returns** the answer*, with examples shown as calls (`solve("aaab") → "a3b1"`); the template already reads the input and prints what `solve` returns. They write **JavaScript, PHP**, Python, Java, C or C++ in the code editor page, can run the samples first, and the code is **run on the tests** (accepted / wrong answer / too slow / crash), with an **AI coach** explaining mistakes without giving the answer. **Quick** types are answered in Discord: multiple choice, complexity, predict the output, find the bug (always in the class's track language). Also **SQL query**, **regular expression** and **Git** types; choosing `language: SQL` gives a SQL query challenge. **HackerRank problem**: solved on HackerRank, then checked on their verified profile (only solves made after the challenge was given count). A topic like "recursion" makes the AI write a fresh one in the background (about a minute). |
| `/duel @friend [quick / write / HackerRank] [difficulty] [stake]` | 1 vs 1, posted in #arena: both get the same challenge and the first to solve it wins (10, 45 or 60 minutes). Coins can be staked, and the winner gains Elo rating. |
| `/daily` | Today's daily challenge. The first three solvers get a bonus, and solving every day builds a 🔥 streak. |
| `/assignments` | Challenges you assigned to them, with due dates |
| `/profile [@someone]` | Level and title (Novice → Legend), season rank, solved by difficulty, accuracy, duel record, badges |
| `/leaderboard [season / all-time / duels / coins / teams]` | Rankings |
| `/rival add @friend` | They get pinged when their rival passes them in a contest, and can see head-to-head records |
| `/bet place player amount` | Predict a contest winner with play coins |
| `/contest standings` | Live contest leaderboard |
| `/today [remind]` | Their plan for today: 3 challenges picked for them (a rematch of one they missed, one at their edge, a warm-up), a bonus and a 🗓️ plan streak when they finish it |
| `/skills` · `/path` | Their skill map (mastery per skill) and most frequent mistakes · a step-by-step path with a 📖 lesson for each step: written for beginners (a plain explanation with an everyday comparison, one tiny example **in the class's track language**, a 🌐 button to switch English/French, one tip) and links to free tutorials to read more (javascript.info, php.net, Python docs, W3Schools, Khan Academy, VisuAlgo…, in French when the class is in French) |
| `/shop` · `/create` | Spend coins (streak freeze, hint tokens, title, color) · write a challenge for the class (you approve it; they earn points when classmates solve it) |
| `/help-me` | ✋ Raise their hand: question + optional code go to your live **Help queue**; you come over or answer by DM |
| `/ask question` · `/faq` | ❓ Looks in the class FAQ first; otherwise you answer (an AI draft is ready for you to check), they get it by DM and it joins the FAQ |
| `/interview [difficulty]` | 🎤 Mock coding interview: they explain approach, edge cases and complexity to an interviewer, code it, and get a scorecard (+5 pts once a day) |
| `/project list / submit / check` | 🐙 Link their **public GitHub repository** to a project you created; the bot runs the file against your tests after every push and gives points per test passed |
| `/league` | 🏆 Class vs class this week (points per student) |
| `/help [topic]` | Every feature, in pages: getting started, challenges, write code, points, duels, daily & assignments, contests, social, coach, help & projects, teacher tools |

On `/profile`, students can **🔗 share a public profile page** (level, badges, skills, recent solves, never their code; they can stop sharing any time) and open their **🎓 certificate** (print or save as PDF). When you start a new season, every student who scored gets their certificate by DM.

**Points = level base × type multiplier**, so harder and deeper challenges are worth much more:

| | Easy (3) | Medium (6) | Hard (12) |
|---|---|---|---|
| Multiple choice ×1 | 3 | 6 | 12 |
| Complexity ×2 | 6 | 12 | 24 |
| Predict the output ×3 | 9 | 18 | 36 |
| Find the bug ×5 | 15 | 30 | 60 |
| Write code ×8 | 24 | 48 | 96 |
| HackerRank problem ×10 | 30 | 60 | 120 |

Then: daily ×1.5 (+15/+10/+5 for the first three), assignment on time ×1.5, duel win ×2, hint ×0.5, second try ×0.5 (write code: −15% per extra submission, min 40%), quick answer within 60 s +20%. Contests: 120/90/70 for the podium, 40 for the top 10, 15 for taking part, 25 per special award. **No farming of quick challenges:** in `/practice` and duels, multiple choice, complexity, output and bug give full points for the first 5 a day, 20% for the next 5, then nothing (max 150 pts a day), and a challenge solved before never pays twice. **Write code and HackerRank problems are never limited**, and neither is anything you hand out (daily challenge, assignments, class sessions). **You can change all of it in Dashboard → Settings → Scoring**; `/help` shows the current table.

**Difficulty is real.** The built-in bank (62 quick challenges + 18 write-code problems, English and French) was checked by running every snippet; hard write-code problems need a real algorithm (DP, binary search, monotonic stack, Dijkstra, divide and conquer…) and a naive solution fails the big tests on time.

**Contests** work like before, with more show: live commentary (first blood, lead changes, big jumps, photo finishes), a frozen board for the last 15 minutes, then a suspense reveal (3rd… 2nd… *and the winner is…*). Then come awards (🩸 First Blood, 📈 Biggest Climber, 🌱 Most Improved, ⚡ Speed Demon, 🦉 Last-Minute Hero), team results, bet payouts, the 👑 champion role, and a link to an animated **race replay** page.

**Every Monday** the bot posts a weekly recap: top earners, most solves, duelist of the week, longest streak.

## What you can do (dashboard)

- **Overview:** a **Live in your class** panel at the top (raised hands waiting, questions to answer, student challenges to review, a running class session, live events, projects and their next due date, mock interviews and daily plans this week, helpful peer explanations, your league rank), then activity over 30 days, accuracy, a highlighted list of students who **need attention** (inactive, points dropping, low accuracy, missed assignments), top earners, latest answers, and self-reported HackerRank solves to approve (they give **no points until you approve**).
- **Students:** sortable and searchable class list with a trend for each student (↑ improving, ↓ slipping, ⏸ inactive). CSV export for grading.
- **Student page:** points per week, contest results over time, a *strengths and gaps* grid (success rate by challenge type × difficulty), every challenge **solved** and **not solved** (with their wrong answers, and for write-code problems their **submitted code**, verdict and the AI coach's note), assignments, duels and points log. Give bonus points, assign a challenge, or verify / unlink their HackerRank account.
- **Challenges:** the whole bank with success rates. Write your own (for a write-code problem: statement, a reference solution in Python and test inputs; the expected outputs are computed by running your solution), import any HackerRank problem by link, or **generate one with AI**: write-code problems are kept only if the AI's fast solution and a brute-force solution agree when actually run, and the AI's guess is never trusted for "predict the output". Students can 🚩 report a wrong challenge: two reports pause it until you fix it, and fixing an answer automatically gives credit to students who were actually right.
- **Daily challenge:** turn it on or off, choose the channel, the time, the language of quick challenges (e.g. only JavaScript) and the level + type for each weekday (including **SQL** and **regex** days). See the next 14 days and **pick a specific challenge for any date** (or leave it random), **post one right now** (chosen or random, in any channel), and see how many students opened and solved each past daily.
- **Points:** give or remove points for everyone or for selected students, set them to an exact value, and reset the season leaderboard (or everything, levels included). Every change is written to the points log with your reason, and students can be told by DM.
- **Assignments:** give a challenge to everyone, a team, or chosen students, with a due date and a note. Students get a DM and a channel ping, a reminder 24 h before the deadline, and you see who finished on time, late, or not at all.
- **Contests:** follow a contest, end it early, see results, awards, bets and a score-race chart.
- **Teams:** create teams and pick members. A team's contest score is its members' *average*, so helping the weakest member is the best strategy.
- **Class sessions:** pick a few challenges and a duration; the bot posts a button in #arena (and pings a team if you choose one). Students solve in the code editor and you watch a live grid (✅ ❌ ✏️ ⚑ per student and challenge). When time is up, answers stop being accepted.
- **Integrity:** every write-code answer sent with warning signs: paste attempts, big blocks of code appearing at once, leaving the editor page, typing with no corrections or impossibly fast, code almost identical to a classmate's, a weak explanation. Watch a **replay of the typing**, then mark it *looks fine* or *remove points* (with an optional DM). Nothing is removed automatically.
- **Help queue:** live list of raised hands (oldest first, with their code and the challenge they're on), refreshes by itself. *I'm coming* tells the student by DM; *Answer by DM* sends a written reply. Keep it open on a second screen during class.
- **Questions:** questions from `/ask` with an AI draft to check, edit and approve (optionally posted in #arena); approved answers become the class FAQ. Add your own entries (exam dates, rules…).
- **Interviews:** every mock interview with its scorecard and full transcript.
- **Path & lessons:** reorder the steps, see for each step **how many challenges your bank has** for that skill and level (orange when it's running low), and edit any lesson with a live preview of what students see. Each track has its own roadmap; the lesson list shows the roadmap's skills first. Change the track right on this page.
- **✨ Generate with AI, everywhere:** a lesson for any skill (in the track's language, English + French, linking only to known resources); new challenges for a path step or a skill on the Skills page (each one checked before it's saved, then tagged with the skill; SQL challenges are run on several datasets before they're kept); the challenge generator can target a skill; a live-quiz question; a whole GitHub project (instructions + tests whose expected outputs come from really running the AI's reference solution); FAQ answer drafts.
- **GitHub projects:** create a project (instructions, language, file to run, input/output tests, points, due date). See every linked repository, its best score and last result, grade one student now or everyone again.
- **Classes & league:** all your Discord servers side by side (students, active, solved, points per student, accuracy, 4-week trend), join the **class league**, and open or send **certificates** for any season.
- **Settings:** language (English/French), what the class learns (the track), the #arena channel, daily challenge time, roles, seasons, **scoring per type**, and **Diagnostics** (checks that the code runner, the AI and HackerRank answer, shows the AI budget and the bank size).

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
- **GitHub projects read public repositories only.** The bot downloads one file (the one you name, up to 100 KB) from `raw.githubusercontent.com` and runs it like a write-code answer (stdin in, output compared to your tests). Multi-file projects, packages and unit-test frameworks aren't run. It re-checks every 15 minutes (only when the file changed); students who add the webhook shown in `/project submit` get graded within a minute of each push. Grades never go down: the best run counts, and nothing changes after the due date.
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
| No daily challenge | Create a channel named `arena` or run `/teacher setup arena:#channel`. It's posted at the set hour **UTC**. |
| "Judge down" / AI errors | Dashboard → Settings → **Run checks** shows which service is failing. |
| Something went wrong after updating | Run `npm run db:migrate` (new tables), `npm run deploy`, then `npm run register` (new command options). |

## Customizing

- **Scoring:** Dashboard → Settings → Scoring. Other rules (tries, duel times, bonuses): `src/shared/game.ts`, the `RULES` block.
- **All bot texts (English and French):** `src/shared/i18n.ts`.
- **Built-in challenges:** `tools/bank_quick.py` and `tools/bank_write.py`; `python tools/gen_bank.py` re-verifies everything (runs every snippet, reference vs brute force, timing) and writes the migration. Or simply write them in the dashboard.
- After changing code: `npm test`, then `npm run deploy`.

## Project layout

```
src/bot/        Discord interactions, cron jobs, public race replay page
src/admin/      dashboard API + Cloudflare Access check
src/shared/     rules, texts, challenges, contests, AI, HackerRank, Discord helpers
public/         the dashboard (plain HTML/CSS/JS, no build step)
migrations/     database schema + challenge bank
tests/          end-to-end tests (npm test) and the demo preview (npm run preview)
```

`npm test` runs 264 end-to-end checks against the real code, with Discord, HackerRank and the AI faked, the database on Node's built-in SQLite, and students' code **really executed** locally (needs `python3`; `g++` for the C++ check).
