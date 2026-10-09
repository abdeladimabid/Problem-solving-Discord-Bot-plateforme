-- ClassBot database schema (Cloudflare D1 / SQLite)
-- All times are unix timestamps in seconds.

CREATE TABLE guilds (
  id               TEXT PRIMARY KEY,           -- Discord server id
  name             TEXT,
  lang             TEXT NOT NULL DEFAULT 'en', -- en | fr
  season           TEXT NOT NULL DEFAULT 'Season 1',
  code_lang        TEXT NOT NULL DEFAULT 'python',
  announce_channel TEXT,
  daily_channel    TEXT,
  daily_hour       INTEGER NOT NULL DEFAULT 9,  -- UTC hour for the daily challenge
  champion_role    TEXT,
  streak_role      TEXT,
  champion_holders TEXT NOT NULL DEFAULT '[]',
  streak_holders   TEXT NOT NULL DEFAULT '[]',
  trust_claims     INTEGER NOT NULL DEFAULT 1,  -- accept self-reported HackerRank solves
  last_daily       TEXT,                        -- YYYY-MM-DD
  last_digest      TEXT,
  created_at       INTEGER NOT NULL
);

CREATE TABLE players (
  guild_id       TEXT NOT NULL,
  discord_id     TEXT NOT NULL,
  name           TEXT,
  hr_username    TEXT,            -- lowercase HackerRank username
  hr_display     TEXT,
  coins          INTEGER NOT NULL DEFAULT 100,
  rating         INTEGER NOT NULL DEFAULT 1000, -- duel Elo
  daily_streak   INTEGER NOT NULL DEFAULT 0,
  last_daily_day TEXT,
  last_active    INTEGER,
  created_at     INTEGER NOT NULL,
  PRIMARY KEY (guild_id, discord_id)
);
CREATE UNIQUE INDEX players_hr ON players(guild_id, hr_username) WHERE hr_username IS NOT NULL;

-- Every point a student earns, with its reason. Season tables are sums of this.
CREATE TABLE ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  discord_id  TEXT,               -- NULL for contest results of not-yet-linked students
  hr_username TEXT,
  season      TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  reason      TEXT NOT NULL,      -- contest|award|practice|daily|assignment|duel|bonus|regrade|team
  ref         TEXT,
  note        TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX ledger_player ON ledger(guild_id, discord_id, season);
CREATE INDEX ledger_time ON ledger(guild_id, created_at);

CREATE TABLE contests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  slug         TEXT NOT NULL,
  name         TEXT NOT NULL,
  channel_id   TEXT NOT NULL,
  start_at     INTEGER,
  end_at       INTEGER,
  interval_min INTEGER NOT NULL DEFAULT 5,
  freeze_min   INTEGER NOT NULL DEFAULT 15,
  status       TEXT NOT NULL DEFAULT 'active',   -- active|finished|cancelled
  season       TEXT NOT NULL,
  next_poll    INTEGER NOT NULL DEFAULT 0,
  bets_close   INTEGER,
  state        TEXT NOT NULL DEFAULT '{}',       -- live tracking data
  snaps        TEXT NOT NULL DEFAULT '[]',       -- leaderboard snapshots for the replay
  errors       INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  finished_at  INTEGER
);
CREATE INDEX contests_active ON contests(status, next_poll);

CREATE TABLE contest_results (
  contest_id   INTEGER NOT NULL,
  guild_id     TEXT NOT NULL,
  hr_username  TEXT NOT NULL,
  hr_display   TEXT NOT NULL,
  discord_id   TEXT,
  rank         INTEGER NOT NULL,
  score        REAL NOT NULL,
  time_taken   REAL,
  participants INTEGER NOT NULL,
  PRIMARY KEY (contest_id, hr_username)
);

CREATE TABLE awards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  contest_id  INTEGER,
  hr_username TEXT NOT NULL,
  discord_id  TEXT,
  award       TEXT NOT NULL,
  detail      TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE bets (
  contest_id   INTEGER NOT NULL,
  discord_id   TEXT NOT NULL,
  pick         TEXT NOT NULL,
  pick_display TEXT NOT NULL,
  amount       INTEGER NOT NULL,
  outcome      TEXT,
  payout       INTEGER,
  PRIMARY KEY (contest_id, discord_id)
);

CREATE TABLE teams (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name     TEXT NOT NULL,
  UNIQUE (guild_id, name)
);
CREATE TABLE team_members (
  team_id    INTEGER NOT NULL,
  guild_id   TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, discord_id)
);
CREATE TABLE team_points (
  guild_id   TEXT NOT NULL,
  team_id    INTEGER NOT NULL,
  season     TEXT NOT NULL,
  contest_id INTEGER NOT NULL,
  rank       INTEGER NOT NULL,
  avg_score  REAL NOT NULL,
  points     INTEGER NOT NULL,
  PRIMARY KEY (team_id, contest_id)
);

CREATE TABLE rivals (
  guild_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  rival_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, owner_id, rival_id)
);

-- Challenge bank. guild_id NULL = built-in, shared by every server.
CREATE TABLE challenges (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT,
  source       TEXT NOT NULL,          -- seed|ai|teacher|hackerrank
  kind         TEXT NOT NULL,          -- code|mcq|output|bug|complexity
  difficulty   TEXT NOT NULL,          -- easy|medium|hard
  lang         TEXT NOT NULL DEFAULT 'en',
  code_lang    TEXT,
  title        TEXT NOT NULL,
  question     TEXT,
  code         TEXT,
  choices      TEXT,                   -- JSON array (choice kinds)
  answer       TEXT,                   -- letter A-D, or expected output
  alternatives TEXT,                   -- JSON array of other accepted outputs
  hint         TEXT,
  explanation  TEXT,
  topic        TEXT,
  hr_slug      TEXT,
  url          TEXT,
  status       TEXT NOT NULL DEFAULT 'active',  -- active|flagged|archived
  created_by   TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX challenges_pick ON challenges(kind, difficulty, lang, status);

CREATE TABLE attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  challenge_id INTEGER NOT NULL,
  origin       TEXT NOT NULL,          -- practice|daily|assignment|duel
  ref          INTEGER,                -- duel id, assignment id, or daily day key
  status       TEXT NOT NULL DEFAULT 'pending', -- pending|solved|claimed|failed|expired
  tries        INTEGER NOT NULL DEFAULT 0,
  used_hint    INTEGER NOT NULL DEFAULT 0,
  answer_given TEXT,
  verified     INTEGER NOT NULL DEFAULT 0,  -- coding: 1 = confirmed by HackerRank
  points       INTEGER NOT NULL DEFAULT 0,
  started_at   INTEGER NOT NULL,
  finished_at  INTEGER
);
CREATE INDEX attempts_player ON attempts(guild_id, discord_id, status);
CREATE INDEX attempts_challenge ON attempts(challenge_id);
CREATE INDEX attempts_origin ON attempts(origin, ref, discord_id);

CREATE TABLE assignments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  challenge_id INTEGER NOT NULL,
  discord_id   TEXT NOT NULL,
  note         TEXT,
  due_at       INTEGER,
  status       TEXT NOT NULL DEFAULT 'open',  -- open|done|late|failed|missed
  attempt_id   INTEGER,
  reminded     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX assignments_open ON assignments(status, due_at);

CREATE TABLE duels (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT NOT NULL,
  channel_id    TEXT NOT NULL,
  challenger_id TEXT NOT NULL,
  opponent_id   TEXT NOT NULL,
  mode          TEXT NOT NULL,          -- quick|coding
  difficulty    TEXT NOT NULL,
  stake         INTEGER NOT NULL DEFAULT 0,
  challenge_id  INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending|active|finished|declined|expired
  winner_id     TEXT,                   -- NULL with status finished = draw
  created_at    INTEGER NOT NULL,
  started_at    INTEGER,
  finished_at   INTEGER
);
CREATE INDEX duels_status ON duels(status);

CREATE TABLE reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  challenge_id INTEGER NOT NULL,
  discord_id   TEXT NOT NULL,
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'open',
  created_at   INTEGER NOT NULL,
  UNIQUE (challenge_id, discord_id)
);

CREATE TABLE badges (
  guild_id   TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  badge      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, discord_id, badge)
);

CREATE TABLE daily (
  guild_id     TEXT NOT NULL,
  day          TEXT NOT NULL,           -- YYYY-MM-DD
  challenge_id INTEGER NOT NULL,
  solvers      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, day)
);

CREATE TABLE ai_usage (
  day   TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);
