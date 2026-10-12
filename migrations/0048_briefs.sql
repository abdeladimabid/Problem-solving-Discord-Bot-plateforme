-- Programmes, project briefs (with GitHub hand-ins and debriefs), competencies and web assessments.
-- Everything here feeds the student's record: competencies validated, skill mastery, what to work on, points.
-- A class follows a programme (competencies + year planning): built-in ("builtin:dwwm-2026") or its own copy ("db:<id>").
ALTER TABLE guilds ADD COLUMN program TEXT;
CREATE TABLE programs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  name       TEXT NOT NULL,
  stack      TEXT,
  data       TEXT NOT NULL,          -- JSON: { referential, levels, sprints, weeks }
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
CREATE INDEX programs_guild ON programs(guild_id);

-- Project briefs (Simplonline structure). data = JSON of every section; internal = product-owner notes (never shown to students).
CREATE TABLE briefs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  program      TEXT,                 -- programme id it was written for
  week         INTEGER,              -- week of the planning
  title        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft',   -- draft | assigned | archived
  source       TEXT,                 -- ai | import | manual
  data         TEXT NOT NULL,
  internal     TEXT,
  competencies TEXT,                 -- "C1N1,C3N1,T1N1"
  start_at     INTEGER,
  due_at       INTEGER,
  kind         TEXT NOT NULL DEFAULT 'solo',     -- solo | squad
  squads       TEXT,                 -- JSON [{ id, name, members: [discord ids], sm }]
  grid         TEXT,                 -- JSON evaluation grid { contexte, tech, items: [{ type, texte, check }], by, at }
  repo_hint    TEXT,                 -- part of the repo name to look for (when nothing was handed in)
  sent         TEXT,                 -- JSON reminders already posted { announce, d3, d1, final }
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER
);
CREATE INDEX briefs_guild ON briefs(guild_id, id);

-- Web assessments: questions (write code / explain / multiple choice), one link per student, fullscreen, AI grading.
CREATE TABLE assessments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  title      TEXT NOT NULL,
  brief_id   INTEGER,
  status     TEXT NOT NULL DEFAULT 'draft',     -- draft | open | closed
  settings   TEXT,                   -- JSON { minutes, lang, codeLang, showResults }
  questions  TEXT NOT NULL,          -- JSON [{ id, type, prompt, … }]
  created_at INTEGER NOT NULL,
  opened_at  INTEGER,
  closes_at  INTEGER
);
CREATE INDEX assessments_guild ON assessments(guild_id, id);
CREATE TABLE assessment_takers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL,
  guild_id      TEXT NOT NULL,
  discord_id    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'invited', -- invited | active | locked | submitted | graded
  seed          INTEGER NOT NULL,
  sid           TEXT,                -- the browser session allowed to answer (a reload is a new session)
  answers       TEXT,                -- JSON { qid: answer }
  pos           INTEGER NOT NULL DEFAULT 0,
  started_at    INTEGER,
  deadline      INTEGER,
  submitted_at  INTEGER,
  locked_at     INTEGER,
  lock_reason   TEXT,
  resume_ok     INTEGER NOT NULL DEFAULT 0,  -- the teacher let them back in
  unlocks       INTEGER NOT NULL DEFAULT 0,
  events        TEXT,                -- JSON [[t, what]]
  grades        TEXT,                -- JSON { qid: { verdict, score, comment, teacher? } }
  score         INTEGER,
  summary       TEXT,
  invited_at    INTEGER,
  UNIQUE (assessment_id, discord_id)
);
CREATE INDEX assessment_takers_a ON assessment_takers(assessment_id);

-- GitHub: each student links their account (GitHub App installation) once, with /github.
ALTER TABLE players ADD COLUMN github_id TEXT;
ALTER TABLE players ADD COLUMN github_login TEXT;
ALTER TABLE players ADD COLUMN gh_inst TEXT;
ALTER TABLE players ADD COLUMN gh_linked_at INTEGER;
ALTER TABLE players ADD COLUMN gh_thread TEXT;       -- their thread in the GitHub activity forum
CREATE INDEX players_github ON players(github_id);
CREATE INDEX players_gh_inst ON players(gh_inst);
ALTER TABLE guilds ADD COLUMN github TEXT;           -- JSON settings: activity channel/forum, reports, hidden repos…
-- one row per counted GitHub event (push, pull request, other), kept 60 days
CREATE TABLE gh_activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  delivery   TEXT NOT NULL,
  day        TEXT NOT NULL,            -- YYYY-MM-DD (UTC)
  t          INTEGER NOT NULL,
  repo       TEXT,
  commits    INTEGER NOT NULL DEFAULT 0,
  real       INTEGER NOT NULL DEFAULT 0,  -- commits that count (not tiny, not huge, not docs only)
  tiny       INTEGER NOT NULL DEFAULT 0,
  flagged    INTEGER NOT NULL DEFAULT 0,  -- huge or node_modules
  bad        INTEGER NOT NULL DEFAULT 0,  -- vague messages
  lines      INTEGER NOT NULL DEFAULT 0,
  prs        INTEGER NOT NULL DEFAULT 0,
  other      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (guild_id, discord_id, delivery)
);
CREATE INDEX gh_activity_day ON gh_activity(guild_id, day);
CREATE INDEX gh_activity_player ON gh_activity(guild_id, discord_id, t);
CREATE TABLE gh_tokens (inst TEXT PRIMARY KEY, token TEXT NOT NULL, exp INTEGER NOT NULL);

-- What a student (or a squad: who = "s:<squad id>") handed in for a brief
CREATE TABLE brief_handins (
  brief_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  who      TEXT NOT NULL,              -- "u:<discord id>" or "s:<squad id>"
  repo     TEXT NOT NULL,
  plan     TEXT,
  at       INTEGER NOT NULL,
  by       TEXT,
  PRIMARY KEY (brief_id, who)
);
-- The debrief of a brief for a student (or a squad): automatic checks, AI review, the teacher's switches, challenge, comment
CREATE TABLE brief_reviews (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  brief_id  INTEGER NOT NULL,
  guild_id  TEXT NOT NULL,
  who       TEXT NOT NULL,
  record    TEXT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'draft',   -- draft | final
  final_at  INTEGER,
  sent_at   INTEGER,
  updated_at INTEGER,
  UNIQUE (brief_id, who)
);
-- Competencies of the référentiel, validated or not, with the evidence (a brief debrief, an assessment…)
CREATE TABLE competency_results (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  code       TEXT NOT NULL,             -- C3, T5…
  level      INTEGER,
  ok         INTEGER NOT NULL,
  source     TEXT NOT NULL,             -- brief | assessment | manual
  ref        INTEGER NOT NULL DEFAULT 0,
  note       TEXT,
  at         INTEGER NOT NULL,
  UNIQUE (guild_id, discord_id, source, ref, code)
);
CREATE INDEX competency_results_player ON competency_results(guild_id, discord_id);
-- skill evidence from a brief or an assessment carries its own level
ALTER TABLE skill_evidence ADD COLUMN difficulty TEXT;
ALTER TABLE skill_evidence ADD COLUMN source TEXT;
