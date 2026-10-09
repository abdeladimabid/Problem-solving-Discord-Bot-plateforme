-- Anti-cheat: code editor page (paste blocked, focus and typing recorded),
-- "explain your code", similarity between students, supervised class sessions.
ALTER TABLE guilds ADD COLUMN integrity TEXT;            -- JSON settings (editor, explain, similarity, code images, time limit, practice weight)

ALTER TABLE attempts ADD COLUMN integrity TEXT;          -- JSON: flags + typing/focus summary
ALTER TABLE attempts ADD COLUMN fp TEXT;                 -- fingerprint of the submitted code (similarity)
ALTER TABLE attempts ADD COLUMN held INTEGER NOT NULL DEFAULT 0;   -- points waiting for the explanation
ALTER TABLE attempts ADD COLUMN explain TEXT;            -- JSON: questions, answers, score
ALTER TABLE attempts ADD COLUMN runs INTEGER NOT NULL DEFAULT 0;   -- "run on samples" clicks in the editor
ALTER TABLE attempts ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0; -- teacher looked at the flags

CREATE TABLE attempt_logs (
  attempt_id INTEGER PRIMARY KEY,
  events     TEXT NOT NULL,      -- JSON: editor changes and focus changes, for the replay
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  challenges  TEXT NOT NULL,     -- JSON array of challenge ids
  team_id     INTEGER,           -- NULL = everyone
  channel_id  TEXT,
  starts_at   INTEGER NOT NULL,
  ends_at     INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',   -- active | finished
  created_at  INTEGER NOT NULL
);
CREATE INDEX sessions_guild ON sessions(guild_id, status);
