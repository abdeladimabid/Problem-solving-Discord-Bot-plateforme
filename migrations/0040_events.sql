-- Events and coins: live quiz, boss battles, bounties, coin shop, 2v2 duels, paid peer help
CREATE TABLE quizzes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  channel_id  TEXT,
  questions   TEXT NOT NULL,            -- JSON list of challenge ids (multiple choice kinds)
  seconds     INTEGER NOT NULL DEFAULT 30,
  current     INTEGER NOT NULL DEFAULT -1,
  q_started   INTEGER,
  q_message   TEXT,
  revealed    INTEGER NOT NULL DEFAULT 0,
  give_points INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'draft',   -- draft | live | done
  created_at  INTEGER NOT NULL
);
CREATE TABLE quiz_answers (
  quiz_id    INTEGER NOT NULL,
  q_idx      INTEGER NOT NULL,
  discord_id TEXT NOT NULL,
  answer     TEXT NOT NULL,
  correct    INTEGER NOT NULL,
  ms         INTEGER NOT NULL,
  score      INTEGER NOT NULL,
  PRIMARY KEY (quiz_id, q_idx, discord_id)
);

CREATE TABLE bosses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  challenge_id INTEGER NOT NULL,
  name         TEXT NOT NULL,
  hp           INTEGER NOT NULL,
  deadline     INTEGER NOT NULL,
  reward       INTEGER NOT NULL DEFAULT 30,
  coins        INTEGER NOT NULL DEFAULT 20,
  channel_id   TEXT,
  message_id   TEXT,
  status       TEXT NOT NULL DEFAULT 'active',  -- active | won | lost
  created_at   INTEGER NOT NULL,
  finished_at  INTEGER
);
CREATE TABLE boss_hits (
  boss_id    INTEGER NOT NULL,
  discord_id TEXT NOT NULL,
  damage     INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (boss_id, discord_id)
);

CREATE TABLE bounties (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  challenge_id INTEGER NOT NULL,
  points       INTEGER NOT NULL DEFAULT 0,
  coins        INTEGER NOT NULL DEFAULT 0,
  deadline     INTEGER,
  channel_id   TEXT,
  message_id   TEXT,
  status       TEXT NOT NULL DEFAULT 'open',    -- open | claimed | expired
  winner_id    TEXT,
  created_at   INTEGER NOT NULL,
  claimed_at   INTEGER
);

-- coin shop
ALTER TABLE players ADD COLUMN hint_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN streak_freezes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN title TEXT;
ALTER TABLE players ADD COLUMN title_until INTEGER;
ALTER TABLE players ADD COLUMN color_role TEXT;
ALTER TABLE players ADD COLUMN color_until INTEGER;
ALTER TABLE attempts ADD COLUMN free_hints INTEGER NOT NULL DEFAULT 0;
CREATE TABLE purchases (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  item       TEXT NOT NULL,
  cost       INTEGER NOT NULL,
  detail     TEXT,
  created_at INTEGER NOT NULL
);

-- 2v2 duels
ALTER TABLE duels ADD COLUMN partner_id TEXT;
ALTER TABLE duels ADD COLUMN opponent2_id TEXT;
ALTER TABLE duels ADD COLUMN accepted TEXT;

-- paid peer help
CREATE TABLE help_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  attempt_id  INTEGER NOT NULL,
  discord_id  TEXT NOT NULL,
  channel_id  TEXT,
  message_id  TEXT,
  status      TEXT NOT NULL DEFAULT 'open',     -- open | closed
  created_at  INTEGER NOT NULL
);
CREATE TABLE help_answers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  INTEGER NOT NULL,
  helper_id   TEXT NOT NULL,
  body        TEXT NOT NULL,
  rating      INTEGER,                          -- 1 helpful, 0 not helpful, NULL not rated yet
  created_at  INTEGER NOT NULL,
  UNIQUE (request_id, helper_id)
);
