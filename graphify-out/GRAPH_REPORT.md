# Graph Report - classbot  (2026-10-27)

## Corpus Check
- Large corpus: 231 files · ~897,283 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 3071 nodes · 11888 edges · 102 communities (97 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 116 edges (avg confidence: 0.85)
- Token cost: 119,102 input · 0 output

## Community Hubs (Navigation)
- Dashboard App Core & Games UI
- Briefs, Sprints & Program Planning
- VS Code Activity Tracking
- Discord Interaction Handlers
- Coding Challenges & Integrity
- Battle Royale Quiz & QR
- Admin Auth, Code Images & Core Types
- Debrief Review Engine (AI Checks)
- GitHub Activity Sync
- Admin Dashboard API
- Review Engine Detectors
- Activities Generation Core
- Cron Jobs & Scheduled Reports
- Contests & HackerRank Scoring
- Shop, Cosmetics & Sharing
- Discord Events & Help System
- Activity Signup System
- AI Provider Keys & Context
- Test Harness & Core Utilities
- Activities UI (Frontend)
- GitHub Watcher UI
- Learning Dashboard UI (Assessments)
- Intranet Feature
- AI Generation & Translation
- Code Relay Game
- Claude Assessment Workflow
- Assessment Core
- Coaching & Skill Paths
- Shared Content Library
- Package Config & Deploy Scripts
- Learning/Brief Commands
- Code Runner & SQL Regex Judge
- Code Relay Bot Commands
- AI Chat & Health
- Setup Script
- Daily Challenges & AI Generation
- Discord Roles & Shop
- Activities View & Errors
- AI Review Comments
- Config Check Script
- Squads & Hand-Raising
- Action Plans & Class Reports
- VS Code Dashboard UI
- League System
- Presentations UI
- Season & Arena
- Code Starter Templates
- Skills Tracking
- Notifications & Activity Commands
- Challenge Creation & i18n
- Activities Rendering Helpers
- Project Docs & README Concepts
- Learning UI: Assessment Verdicts
- Extras UI (Cert Generation)
- Review Steps & Briefs
- Learning Paths
- Starter Check Tool
- Assessment Grading Helpers
- Assessment Sharing
- Game Content Generation
- Challenge Bank Generator (Quick)
- Challenge Bank Generator 2
- Challenge Export Script
- Quiz Assessment Bot
- GitHub Student UI
- Learning UI: Grading Dialogs
- FAQ System
- Learning UI: Brief Dialogs
- Lessons Content
- Learning UI: Live Assessment
- VS Code Heartbeat Simulator
- Mock Interview Feature
- AI Check Signals
- D1 Statement Types & Test Harness
- TypeScript Config
- Battle UI
- Learning UI: Debrief Tools
- Learning UI: Analyze Work
- Squads UI
- Code Relay Game Logic
- Work-On / Evidence Tracking
- Tracks & Roadmaps
- Icons & i18n UI Helpers
- Learning UI: Review Steps Display
- Assessment Link Sharing
- Code Skills Evidence
- Game Case Matching
- Activities Live Prompt Generation
- Planning Import
- SQL Detective Cases
- Seed Data Generator
- Activities Docs & Templates
- Learning UI: Import Dialogs
- Web Translation
- Personalized Recommendations
- Dashboard Nav State
- Discord Command Registration
- Boss Event Bank
- Graphify Usage Rules

## God Nodes (most connected - your core abstractions)
1. `run()` - 317 edges
2. `now()` - 290 edges
3. `t()` - 220 edges
4. `handleApi()` - 204 edges
5. `route()` - 141 edges
6. `one()` - 99 edges
7. `Env` - 87 edges
8. `all()` - 84 edges
9. `ts` - 84 edges
10. `esc()` - 72 edges

## Surprising Connections (you probably didn't know these)
- `wire()` --indirect_call--> `levelOf()`  [INFERRED]
  public/squads.js → src/shared/review/comment.ts
- `Weekly planning rules (one veille/day, two live codings/week)` --references--> `YouCode DWWM A1 2026/2027 programme`  [INFERRED]
  docs/activities/TEMPLATES_VEILLE_LIVE_CODING_DWWM_2026-2027.md → README.md
- `Inspiration-only / programme-scope rule` --conceptually_related_to--> `Activités feature (veille, live coding, workshop generation)`  [INFERRED]
  docs/activities/VEILLE_INSPIRATION_DWWM.md → README.md
- `Dashboard navigation sections (Overview, Students, Briefs, Activités, VS Code tracking, Settings, etc.)` --conceptually_related_to--> `Teacher dashboard`  [INFERRED]
  public/index.html → README.md
- `draw()` --indirect_call--> `q()`  [INFERRED]
  public/squads.js → tests/run.ts

## Import Cycles
- 3-file cycle: `src/shared/challenges.ts -> src/shared/plan.ts -> src/shared/coach.ts -> src/shared/challenges.ts`

## Hyperedges (group relationships)
- **Activités generation pipeline (programme scope, templates, inspiration list)** — readme_activites_feature, docs_activities_templates_veille_live_coding_dwwm_2026_2027_doc, docs_activities_veille_inspiration_dwwm_doc, readme_programme_youcode_dwwm_a1 [EXTRACTED 1.00]
- **Claude-assisted assessment grading workflow (three versioned JSON formats)** — readme_assessclaude_flow, readme_classbot_assessment_v1, readme_classbot_grading_export_v1, readme_classbot_grading_result_v1 [EXTRACTED 1.00]
- **Dashboard navigation sections mirroring the documented teacher-dashboard menu** — public_index_nav, readme_dashboard, readme_activites_feature, readme_vscode_tracking [INFERRED 0.85]

## Communities (102 total, 5 thin omitted)

### Community 0 - "Dashboard App Core & Games UI"
Cohesion: 0.05
Nodes (139): aiSettings(), AP, AP_ENG, AP_LV, AP_TREND, apCard(), api(), areaChart() (+131 more)

### Community 1 - "Briefs, Sprints & Program Planning"
Cohesion: 0.05
Nodes (108): ApiError, bad(), briefView(), learningApi(), ok(), reviewView(), route(), techList() (+100 more)

### Community 2 - "VS Code Activity Tracking"
Cohesion: 0.05
Nodes (96): ok(), runCheck(), settingsView(), vscodeApi(), setupEmbeds(), handleWakatime(), hits, json() (+88 more)

### Community 3 - "Discord Interaction Handlers"
Cohesion: 0.10
Nodes (95): cmdGithub(), cmdPath(), cmdToday(), reportButton(), trainSkill(), askButton(), bossButton(), bountyButton() (+87 more)

### Community 4 - "Coding Challenges & Integrity"
Cohesion: 0.06
Nodes (88): EDITOR_HTML, editorData(), EXPLAIN_LIMIT, explainAnswer(), explainForClient(), explainStart(), handleEditor(), json() (+80 more)

### Community 5 - "Battle Royale Quiz & QR"
Cohesion: 0.06
Nodes (74): ACTIONS, esc(), handleBattle(), html(), json(), JUDGE(), TV(), act() (+66 more)

### Community 6 - "Admin Auth, Code Images & Core Types"
Cohesion: 0.05
Nodes (64): b64urlJson(), b64urlToBytes(), checkAccess(), getKeys(), teamDomain(), fetch(), attr(), enc (+56 more)

### Community 7 - "Debrief Review Engine (AI Checks)"
Cohesion: 0.08
Nodes (74): finalizedIn(), nextProgrammeWeek(), refreshDrafts(), aiLevel(), assessSignal(), buildComment(), memberComment(), analyze() (+66 more)

### Community 8 - "GitHub Activity Sync"
Cohesion: 0.08
Nodes (69): firstLines(), GhDetailError, logPr(), logPush(), LogRow, studentGithub(), summarizeStudentGithub(), syncStudentGithub() (+61 more)

### Community 9 - "Admin Dashboard API"
Cohesion: 0.07
Nodes (64): assignments(), attemptLog(), bulkPoints(), challengeDetail(), challenges(), cleanChallenge(), computeTests(), contestDetail() (+56 more)

### Community 10 - "Review Engine Detectors"
Cohesion: 0.05
Nodes (58): assessCap(), backlogMember(), backlogText(), badMessage(), base(), briefBreakpoints(), briefItems(), CH_LEVEL (+50 more)

### Community 11 - "Activities Generation Core"
Cohesion: 0.05
Nodes (65): ActivityRow, ADVANCED, closingDay(), code(), CodeFile, cssRules(), dataItems(), DAY_FR (+57 more)

### Community 12 - "Cron Jobs & Scheduled Reports"
Cohesion: 0.12
Nodes (60): assign(), dailySettings(), sendMorningPlans(), postDailies(), runCron(), safe(), sweepAssignments(), sweepDuels() (+52 more)

### Community 13 - "Contests & HackerRank Scoring"
Cohesion: 0.08
Nodes (53): settleDuelWin(), awardsEmbed(), commentary(), contestConfig, contestUrl(), CState, finishContest(), hrNames() (+45 more)

### Community 14 - "Shop, Cosmetics & Sharing"
Cohesion: 0.07
Nodes (52): coinsView(), doBuy(), GROUPS, itemVars(), pickerOptions(), PICKERS, shopButton(), shopView() (+44 more)

### Community 15 - "Discord Events & Help System"
Cohesion: 0.08
Nodes (52): ivButtons(), profileButtons(), duelAccept(), linkMessage(), deferUpdate(), Ix, options(), update() (+44 more)

### Community 16 - "Activity Signup System"
Cohesion: 0.13
Nodes (52): activitiesApi(), ok(), route(), ACT_COINS, ActKind, ActLite, actOf(), approvedMsg() (+44 more)

### Community 17 - "AI Provider Keys & Context"
Cohesion: 0.09
Nodes (49): AiProvider, cache, CLASS, classAi, dropClassAi(), addProvider(), AiCallError, AiKeyError (+41 more)

### Community 18 - "Test Harness & Core Utilities"
Cohesion: 0.06
Nodes (38): DICTS, access, ai, aiFake, clock, d1, discordCalls, discordFake (+30 more)

### Community 19 - "Activities UI (Frontend)"
Cohesion: 0.14
Nodes (50): ACT, ACT_CHIPS, ACT_KIND, ACT_WD, actAdd(), actButtons(), actCall(), actCard() (+42 more)

### Community 20 - "GitHub Watcher UI"
Cohesion: 0.08
Nodes (43): openWatchStudent(), pgAssess(), quickBrief(), renderSprint(), SP_LVL, SP_LVL_NAME, spCell(), spFrom() (+35 more)

### Community 21 - "Learning Dashboard UI (Assessments)"
Cohesion: 0.07
Nodes (40): assessPanelHtml(), assessQuestionsTab(), AVIS, CODE_LANGS, compRow(), COPY_FIELD, EXTYPE, generateQuestionsDialog() (+32 more)

### Community 22 - "Intranet Feature"
Cohesion: 0.12
Nodes (41): ACT_TIME, activitiesPreview(), alreadyText(), b64(), checkUrl(), covers(), hex(), hmac() (+33 more)

### Community 23 - "AI Generation & Translation"
Cohesion: 0.13
Nodes (38): aiJudge(), chat(), chatJson(), codeReview(), explainQuestions(), extractJson(), generateHints(), gradeExplanation() (+30 more)

### Community 24 - "Code Relay Game"
Cohesion: 0.08
Nodes (39): shuffle(), RelayLang, cleanRQ(), cleanSettings(), cleanSquads(), CLIPS, code(), createGame() (+31 more)

### Community 25 - "Claude Assessment Workflow"
Cohesion: 0.09
Nodes (38): classbot-assessment@1 JSON format, classbot-grading-export@1 JSON format, classbot-grading-result@1 JSON format, Grade, scoreOf(), TakerRow, applyGrading(), assignRefs() (+30 more)

### Community 26 - "Assessment Core"
Cohesion: 0.08
Nodes (36): FORMS, frPrompt(), generateQuestions(), GenOpts, gradeLocally(), gradeTaker(), importPages(), keyWords() (+28 more)

### Community 27 - "Coaching & Skill Paths"
Cohesion: 0.12
Nodes (34): cmdSkills(), CODE_SKILLS, pathButton(), pathView(), PLAN_ICON, planButton(), planView(), RANK_ICON() (+26 more)

### Community 28 - "Shared Content Library"
Cohesion: 0.14
Nodes (34): activityData(), apply(), assessmentData(), authorOf(), base(), call(), contentKey(), createLibrary() (+26 more)

### Community 29 - "Package Config & Deploy Scripts"
Cohesion: 0.06
Nodes (33): description, devDependencies, @types/node, typescript, wrangler, engines, node, name (+25 more)

### Community 30 - "Learning/Brief Commands"
Cohesion: 0.10
Nodes (31): briefChoices(), cmdBrief(), openBriefs(), connectUrl(), parseRepo(), bestLevel(), CHECK_SKILLS, classCompetencies() (+23 more)

### Community 31 - "Code Runner & SQL Regex Judge"
Cohesion: 0.12
Nodes (32): RenderOpts, b64(), enc, evaluate(), Exec, godbolt(), HARNESS, HarnessRow (+24 more)

### Community 32 - "Code Relay Bot Commands"
Cohesion: 0.16
Nodes (31): body(), esc(), handleGame(), HOST_ACTIONS, html(), json(), PLAY(), TV() (+23 more)

### Community 33 - "AI Chat & Health"
Cohesion: 0.09
Nodes (30): askJson(), agrees(), agreesOutput(), AI_COST, aiHealth(), aiProviderLabel(), CODE_STYLE, codeFeedback() (+22 more)

### Community 34 - "Setup Script"
Cohesion: 0.20
Nodes (28): access(), ADMIN_CFG, ask(), askHidden(), bindWatcher(), BOT_CFG, C, cloudflareLogin() (+20 more)

### Community 35 - "Daily Challenges & AI Generation"
Cohesion: 0.14
Nodes (27): bankBoss(), eventWithAi(), whyWriteFailed(), bankCoverage(), challengeForSkill(), bankExamples(), guildLangs(), pickGuildLang() (+19 more)

### Community 36 - "Discord Roles & Shop"
Cohesion: 0.12
Nodes (27): discordInfo(), rolesState(), addRole(), dapi(), followup(), removeRole(), AutoRoles, autoRolesOf() (+19 more)

### Community 37 - "Activities View & Errors"
Cohesion: 0.20
Nodes (27): activitiesView(), ActivityError, addDays(), askChecked(), cleanPlan(), contextOf(), deleteItem(), editItem() (+19 more)

### Community 38 - "AI Review Comments"
Cohesion: 0.17
Nodes (27): actionOf(), AI_COMMENT_SYSTEM, aiCommentPrompt(), aiCommentText(), andList(), cap(), clean(), closingOf() (+19 more)

### Community 39 - "Config Check Script"
Cohesion: 0.08
Nodes (14): ROOT, asgC, bug, code, ins, led, names, now (+6 more)

### Community 40 - "Squads & Hand-Raising"
Cohesion: 0.14
Nodes (25): squadSources(), one(), HandError, handQueue(), HandRow, myHand(), position(), raiseHand() (+17 more)

### Community 41 - "Action Plans & Class Reports"
Cohesion: 0.15
Nodes (24): aiPlanNote(), AsgRow, engagement(), gapsOf(), levelTrend(), LOW, niveaux(), NoteRow (+16 more)

### Community 42 - "VS Code Dashboard UI"
Cohesion: 0.21
Nodes (24): viewVscode(), VS, VS_SIG, VS_STATE, vsAdd(), vscodeSettings(), vsDayChart(), vsDayLabel() (+16 more)

### Community 43 - "League System"
Cohesion: 0.18
Nodes (23): overviewLive(), inClass(), leagueHidden(), addRemote(), classNumbers(), ClassScore, cleanLink(), compareClasses() (+15 more)

### Community 44 - "Presentations UI"
Cohesion: 0.23
Nodes (22): intranetActsConfirm(), intranetActsDialog(), PR_GRADES, PR_LV, prActsPane(), prCard(), prDay(), presTab (+14 more)

### Community 45 - "Season & Arena"
Cohesion: 0.16
Nodes (20): checked, BADGE_RULES, linkHackerRank(), playerByHr(), setTeacherRank(), StandingRow, standings(), teacherRank (+12 more)

### Community 46 - "Code Starter Templates"
Cohesion: 0.16
Nodes (22): CodeLang, cHeader(), COMMENT, cParams(), cppStarter(), cStarter(), defaultRet(), item() (+14 more)

### Community 47 - "Skills Tracking"
Cohesion: 0.12
Nodes (22): AttemptLite, backfillSkills(), BY_SET, BY_SLUG, CODE_KINDS, CODE_SHARE, DIFF_W, guessSkills() (+14 more)

### Community 48 - "Notifications & Activity Commands"
Cohesion: 0.20
Nodes (19): activityChoices(), cmdActivity(), dayLabel(), kindLabel(), myActivities(), openActivities(), subjectChunks(), DiscordError (+11 more)

### Community 49 - "Challenge Creation & i18n"
Cohesion: 0.16
Nodes (17): cmdCreate(), createSubmit(), APPROVAL_POINTS, AUTHOR_MAX_SOLVERS, AUTHOR_POINTS, CreateError, createMcq(), createWrite() (+9 more)

### Community 50 - "Activities Rendering Helpers"
Cohesion: 0.17
Nodes (22): block(), cell(), checkOf(), cleanLive(), cleanOf(), cleanProposal(), cleanVeille(), cleanWorkshop() (+14 more)

### Community 51 - "Project Docs & README Concepts"
Cohesion: 0.13
Nodes (15): Dashboard navigation sections (Overview, Students, Briefs, Activités, VS Code tracking, Settings, etc.), Class games (Battle Royale quiz, SQL Detective, Code Relay, Squad battle), ClassBot, classbot-admin Worker (src/admin/ + public/), classbot Worker (src/bot/), Competency framework (C1-C8 technical, CT1-CT9 transversal), Cloudflare D1 (SQLite) database, Teacher dashboard (+7 more)

### Community 52 - "Learning UI: Assessment Verdicts"
Cohesion: 0.17
Nodes (21): assessVerdicts(), briefGenerator(), BSTATE(), cLabel(), codesTxt(), compChip(), cText(), dayLabelOf() (+13 more)

### Community 53 - "Extras UI (Cert Generation)"
Cohesion: 0.15
Nodes (17): certCards(), discordMarkdown(), GEN_KINDS, genForSkillDialog(), interviewDialog(), loadLive(), NO_AI_SKILLS, NO_RUN_SKILLS (+9 more)

### Community 54 - "Review Steps & Briefs"
Cohesion: 0.15
Nodes (19): BriefData, BriefCtx, STEP_FR, STEP_RESULTS, dayDate(), iso(), makeSteps(), MAX_STEPS (+11 more)

### Community 55 - "Learning Paths"
Cohesion: 0.20
Nodes (18): pathView(), allCfg(), classLangs(), DEFAULT_STEPS, defaultSteps(), G, lessonFor(), pathCfg (+10 more)

### Community 56 - "Starter Check Tool"
Cohesion: 0.20
Nodes (8): expected(), main(), plug(), probe(), run(), starters(), make_gen(), materialize()

### Community 57 - "Assessment Grading Helpers"
Cohesion: 0.26
Nodes (18): assessView(), applyResults(), invite(), needsGrading(), paperFor(), parse(), questionsOf(), quizUrl() (+10 more)

### Community 58 - "Assessment Sharing"
Cohesion: 0.22
Nodes (17): AssessRow, cleanQuestion(), cleanSettings(), pick(), Question, rid(), saveAssessment(), saveOptions() (+9 more)

### Community 59 - "Game Content Generation"
Cohesion: 0.18
Nodes (17): buildCase(), cleanStoredCase(), cleanTask(), generateTask(), PY_KW, RELAY_LANGS, RELAY_TASKS, relayProgram() (+9 more)

### Community 60 - "Challenge Bank Generator (Quick)"
Cohesion: 0.16
Nodes (8): build_quick(), build_write(), main(), norm(), q(), run_capture(), run_other(), run_program()

### Community 61 - "Challenge Bank Generator 2"
Cohesion: 0.18
Nodes (6): check_regex(), main(), norm_value(), schema_text(), sql_rows(), table_text()

### Community 62 - "Challenge Export Script"
Cohesion: 0.21
Nodes (11): alreadyExported(), challengeSql(), COLS, keyOf(), main(), MIG, nextNumber(), query() (+3 more)

### Community 63 - "Quiz Assessment Bot"
Cohesion: 0.27
Nodes (15): handleQuiz(), json(), PAGE(), activeTaker(), AssessError, leaveEvent(), letBackIn(), loadTaker() (+7 more)

### Community 64 - "GitHub Student UI"
Cohesion: 0.30
Nodes (13): aiSummaryHtml(), drawLog(), ghDay(), ghDayLabel(), ghNum(), ghRepoShort(), GHS, GHS_tips() (+5 more)

### Community 65 - "Learning UI: Grading Dialogs"
Cohesion: 0.24
Nodes (15): answerHtml(), assessOptionsDialog(), assessResultsTab(), gradeAllDialog(), gradeDialog(), gradeOne(), gradeWhy(), inviteDialog() (+7 more)

### Community 66 - "FAQ System"
Cohesion: 0.20
Nodes (14): ask(), AskResult, closeness(), escalate(), FaqError, faqList(), FaqRow, fold() (+6 more)

### Community 67 - "Learning UI: Brief Dialogs"
Cohesion: 0.19
Nodes (14): assignBriefDialog(), briefEditorTab(), briefPoTab(), groupHtml(), lines(), readBriefEditor(), readPo(), rewriteDialog() (+6 more)

### Community 68 - "Lessons Content"
Cohesion: 0.18
Nodes (13): Code, FENCE, LABEL, langLink(), langsFor(), Lesson, lessonLinks(), LESSONS (+5 more)

### Community 69 - "Learning UI: Live Assessment"
Cohesion: 0.21
Nodes (13): assessLiveTab(), copyText(), currentStates(), exportGradingDialog(), githubSettings(), loadMemberVsc(), meter(), saveBlob() (+5 more)

### Community 70 - "VS Code Heartbeat Simulator"
Cohesion: 0.19
Nodes (9): args, keys, learner(), live, minutes, people, pick(), PROJECTS (+1 more)

### Community 71 - "Mock Interview Feature"
Cohesion: 0.23
Nodes (12): clamp(), context(), finishInterview(), INTERVIEW_POINTS, interviewReply(), InterviewRow, MAX_ANSWERS, Scorecard (+4 more)

### Community 72 - "AI Check Signals"
Cohesion: 0.24
Nodes (12): ADVANCED, AiCheck, AiPart, AiSignal, codeSignals(), commentsOf(), commitPart(), msg() (+4 more)

### Community 73 - "D1 Statement Types & Test Harness"
Cohesion: 0.19
Nodes (3): D1Stmt, execLocal(), Stmt

### Community 74 - "TypeScript Config"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+4 more)

### Community 75 - "Battle UI"
Cohesion: 0.30
Nodes (11): battleDialog(), BT_COLORS, BT_EMOJI, BT_PHASE, fmtClock(), liveHtml(), playerPicker(), squadSourceHtml() (+3 more)

### Community 76 - "Learning UI: Debrief Tools"
Cohesion: 0.26
Nodes (12): analyzeAllDialog(), briefGridTab(), briefLinkFlow(), briefStudentsTab(), debriefQueue(), debriefToolsHtml(), handinCell(), moveAssessmentDialog() (+4 more)

### Community 77 - "Learning UI: Analyze Work"
Cohesion: 0.27
Nodes (12): analyzeDialog(), analyzeRun(), analyzeWork(), compAdvice(), compName(), debriefOrder(), debriefTarget(), memberLevelHtml() (+4 more)

### Community 78 - "Squads UI"
Cohesion: 0.29
Nodes (11): balancedSquads(), SQ_COLORS, SQ_LV, sqHex(), sqLvName(), sqPairKey(), squadBoard(), draw() (+3 more)

### Community 79 - "Code Relay Game Logic"
Cohesion: 0.38
Nodes (12): accuseSql(), bestSquad(), feed(), finish(), getGame(), hostAction(), liveGame(), playersOf() (+4 more)

### Community 80 - "Work-On / Evidence Tracking"
Cohesion: 0.27
Nodes (11): skillsOf(), roadmapFor(), choice(), CODE, Evidence, KIND, plain(), revisitFor() (+3 more)

### Community 81 - "Tracks & Roadmaps"
Cohesion: 0.18
Nodes (10): dailyPlanFor(), Family, isTrack(), ROADMAPS, setTrack(), Step, Track, TRACK_KEYS (+2 more)

### Community 82 - "Icons & i18n UI Helpers"
Cohesion: 0.22
Nodes (5): iconFor(), iconize(), iconizeText(), ClassBot dashboard HTML shell (public/index.html), XL

### Community 83 - "Learning UI: Review Steps Display"
Cohesion: 0.29
Nodes (11): briefTeamTab(), compDecisionDialog(), dots(), mesHtml(), renderSteps(), segHtml(), segVal(), SRC_LABEL() (+3 more)

### Community 84 - "Assessment Link Sharing"
Cohesion: 0.33
Nodes (8): changeLink(), facts(), LinkError, LinkPlan, markOral(), planLink(), previewLink(), unlinkBrief()

### Community 85 - "Code Skills Evidence"
Cohesion: 0.27
Nodes (9): BASIC_SKILLS, ERROR_RULES, mistakeSkills(), recordCodeEvidence(), save(), skillsInCode(), Judgement, CODE_RULES (+1 more)

### Community 86 - "Game Case Matching"
Cohesion: 0.33
Nodes (10): literal(), caseOf(), closestByAi(), gameCase(), playerView(), relayLang(), relayStarter(), relayTurn() (+2 more)

### Community 87 - "Activities Live Prompt Generation"
Cohesion: 0.39
Nodes (9): livePrompt(), liveShape(), planLines(), proposalBlock(), regenBlock(), target(), veillePrompt(), workshopPrompt() (+1 more)

### Community 88 - "Planning Import"
Cohesion: 0.53
Nodes (8): cell(), compCodes(), header(), isoDate(), norm(), programFromSheets(), Rows, sheetLike()

### Community 89 - "SQL Detective Cases"
Cohesion: 0.33
Nodes (8): bag(), caseForPlayers(), checkResult(), culpritOk(), normValue(), SQL_CASES, SqlCase, SqlStep

### Community 90 - "Seed Data Generator"
Cohesion: 0.32
Nodes (3): main(), q(), run_python()

### Community 91 - "Activities Docs & Templates"
Cohesion: 0.36
Nodes (4): Templates: Veille, Live Coding & Workshop (DWWM 2026-2027), Veille topics of earlier promotions (inspiration only), Activités feature (veille, live coding, workshop generation), Shared library (cross-class content sharing)

### Community 92 - "Learning UI: Import Dialogs"
Cohesion: 0.38
Nodes (7): importAssessmentDialog(), importGradingDialog(), importQuizJsonDialog(), jsonBox(), problemsHtml(), viewAssessments(), wireJsonBox()

### Community 93 - "Web Translation"
Cohesion: 0.38
Nodes (6): google(), key(), LANG_NAME, TR_LANGS, translateTexts(), TrLang

### Community 94 - "Personalized Recommendations"
Cohesion: 0.33
Nodes (5): kindFor(), Reason, Tailored, QUICK_ONLY_SKILLS, SkillScore

### Community 97 - "Discord Command Registration"
Cohesion: 0.50
Nodes (3): COMMANDS, diff(), fr()

### Community 98 - "Boss Event Bank"
Cohesion: 0.50
Nodes (3): BankBoss, BankLore, BOSS_BANK

## Knowledge Gaps
- **8 isolated node(s):** `@types/node`, `typescript`, `wrangler`, `graphify-out/ artifacts (graph.json, GRAPH_REPORT.md, wiki/index.md)`, `Discord integration (slash commands, buttons, forms)` (+3 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 594 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ClassBot dashboard HTML shell (public/index.html)` connect `Icons & i18n UI Helpers` to `Dashboard App Core & Games UI`, `GitHub Student UI`, `Battle UI`, `Squads UI`, `Project Docs & README Concepts`, `GitHub Watcher UI`, `Extras UI (Cert Generation)`, `Learning Dashboard UI (Assessments)`?**
  _High betweenness centrality (0.265) - this node is a cross-community bridge._
- **What connects `@types/node`, `typescript`, `wrangler` to the rest of the system?**
  _8 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard App Core & Games UI` be split into smaller, more focused modules?**
  _Cohesion score 0.053141544301268606 - nodes in this community are weakly interconnected._
- **Why does `Activités feature (veille, live coding, workshop generation)` connect `Activities Docs & Templates` to `Activities Generation Core`, `Project Docs & README Concepts`?**
  _High betweenness centrality (0.248) - this node is a cross-community bridge._
- **Should `Briefs, Sprints & Program Planning` be split into smaller, more focused modules?**
  _Cohesion score 0.05201886236368995 - nodes in this community are weakly interconnected._
- **Why does `Dashboard navigation sections (Overview, Students, Briefs, Activités, VS Code tracking, Settings, etc.)` connect `Project Docs & README Concepts` to `Icons & i18n UI Helpers`, `Activities Docs & Templates`?**
  _High betweenness centrality (0.248) - this node is a cross-community bridge._
- **Should `VS Code Activity Tracking` be split into smaller, more focused modules?**
  _Cohesion score 0.05425742574257426 - nodes in this community are weakly interconnected._