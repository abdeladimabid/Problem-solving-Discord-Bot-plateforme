-- 🎮 Class games played on the TV and the students' phones / laptops: Battle Royale quiz, SQL Detective, Code Relay.
CREATE TABLE IF NOT EXISTS games (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  kind        TEXT NOT NULL,          -- royale | sql | relay
  title       TEXT NOT NULL,
  mode        TEXT NOT NULL,          -- solo | squads | random
  squads      TEXT NOT NULL,          -- [{name, emoji, color, members}] (random: made when the game starts)
  settings    TEXT NOT NULL,
  content     TEXT NOT NULL,          -- the questions / the case / the task (with the answers: never sent to the students)
  state       TEXT NOT NULL,          -- {phase, seq, …}: compare-and-set on seq
  tv_token    TEXT NOT NULL,
  join_code   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'ready',   -- ready | live | done
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS games_guild ON games(guild_id, id);
-- who plays (one row per student and device)
CREATE TABLE IF NOT EXISTS game_players (
  game_id   INTEGER NOT NULL,
  pid       TEXT NOT NULL,            -- discord id
  name      TEXT NOT NULL,
  squad     INTEGER NOT NULL DEFAULT -1,
  key       TEXT NOT NULL,            -- the device that joined
  alive     INTEGER NOT NULL DEFAULT 1,
  out_step  INTEGER,
  score     INTEGER NOT NULL DEFAULT 0,
  revived   INTEGER NOT NULL DEFAULT 0,
  mic       INTEGER,                  -- relay: 1 listening, 0 refused
  seen      INTEGER,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, pid)
);
-- the answers (royale: one per question, the first one counts)
CREATE TABLE IF NOT EXISTS game_moves (
  game_id INTEGER NOT NULL,
  pid     TEXT NOT NULL,
  step    INTEGER NOT NULL,
  value   TEXT,
  ok      INTEGER NOT NULL DEFAULT 0,
  at      INTEGER NOT NULL,           -- ms
  PRIMARY KEY (game_id, pid, step)
);
-- each squad's own progress (sql: steps solved; relay: the code, the strikes; royale: revive points)
CREATE TABLE IF NOT EXISTS game_teams (
  game_id INTEGER NOT NULL,
  squad   INTEGER NOT NULL,
  data    TEXT NOT NULL,
  seq     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, squad)
);
