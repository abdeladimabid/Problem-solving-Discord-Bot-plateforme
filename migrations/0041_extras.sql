-- Raise-hand queue, questions bank (FAQ), mock interviews, public profiles,
-- class vs class league and GitHub project autograder.

-- ✋ /help-me: students raise their hand, the teacher sees a live queue in the dashboard
CREATE TABLE hands (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  discord_id  TEXT NOT NULL,
  name        TEXT,
  question    TEXT NOT NULL,
  code        TEXT,
  attempt_id  INTEGER,                         -- the challenge they were working on, if any
  status      TEXT NOT NULL DEFAULT 'waiting', -- waiting | helping | done | cancelled
  reply       TEXT,                            -- the teacher's written answer (sent by DM)
  created_at  INTEGER NOT NULL,
  taken_at    INTEGER,
  done_at     INTEGER
);
CREATE INDEX hands_guild ON hands (guild_id, status);

-- ❓ /ask: questions bank. Approved answers become the class FAQ.
CREATE TABLE faq (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  question    TEXT NOT NULL,
  answer      TEXT,                            -- approved answer (shown to everyone)
  draft       TEXT,                            -- AI draft, waiting for the teacher
  asked_by    TEXT,                            -- discord id (NULL when the teacher wrote it)
  askers      TEXT,                            -- JSON list of everyone waiting for this answer
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  hits        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  answered_at INTEGER
);
CREATE INDEX faq_guild ON faq (guild_id, status);

-- 🎤 /interview: a mock technical interview on a write-code problem
CREATE TABLE interviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  discord_id  TEXT NOT NULL,
  challenge_id INTEGER NOT NULL,
  attempt_id  INTEGER NOT NULL,
  transcript  TEXT NOT NULL DEFAULT '[]',      -- [{"who": "ai" | "me", "text": "..."}]
  stage       INTEGER NOT NULL DEFAULT 0,      -- questions asked so far
  status      TEXT NOT NULL DEFAULT 'active',  -- active | done
  scores      TEXT,                            -- final scorecard (JSON)
  created_at  INTEGER NOT NULL,
  finished_at INTEGER
);

-- 🔗 public profile pages: a random key a student can share (or revoke)
ALTER TABLE players ADD COLUMN share_key TEXT;
CREATE UNIQUE INDEX players_share ON players (share_key);

-- 🏆 class vs class league: classes that opted in, by name
ALTER TABLE guilds ADD COLUMN league TEXT;          -- {"on": true, "name": "Group A"}
ALTER TABLE guilds ADD COLUMN last_league TEXT;     -- week the last league result was announced

-- 🐙 GitHub projects: the bot runs a file of the student's repository against tests
CREATE TABLE projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  lang        TEXT NOT NULL,                   -- python | javascript | php | java | c | cpp
  entry       TEXT NOT NULL,                   -- path of the file to run, e.g. main.py
  tests       TEXT NOT NULL,                   -- JSON [{"input": "...", "output": "..."}]
  time_limit  REAL NOT NULL DEFAULT 2,
  points      INTEGER NOT NULL DEFAULT 50,
  due_at      INTEGER,
  status      TEXT NOT NULL DEFAULT 'open',    -- open | closed
  created_at  INTEGER NOT NULL
);
CREATE TABLE project_repos (
  project_id  INTEGER NOT NULL,
  guild_id    TEXT NOT NULL,
  discord_id  TEXT NOT NULL,
  repo        TEXT NOT NULL,                   -- owner/name
  branch      TEXT NOT NULL DEFAULT 'HEAD',
  content_hash TEXT,                           -- hash of the entry file last graded
  passed      INTEGER NOT NULL DEFAULT 0,
  total       INTEGER NOT NULL DEFAULT 0,
  best        INTEGER NOT NULL DEFAULT 0,      -- best number of tests passed
  points      INTEGER NOT NULL DEFAULT 0,      -- points awarded so far
  result      TEXT,                            -- last verdict (JSON)
  error       TEXT,                            -- last fetch problem (file missing, private repo…)
  runs        INTEGER NOT NULL DEFAULT 0,
  due_check   INTEGER NOT NULL DEFAULT 0,      -- 1 = check as soon as possible (push webhook, button)
  checked_at  INTEGER,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (project_id, discord_id)
);
CREATE INDEX project_repos_repo ON project_repos (repo);
