-- VS Code activity: the learners' WakaTime extension sends its heartbeats to ClassBot (see src/shared/vscode.ts).
-- The class's settings (on/off, idle limit, time window, retention, file names, consent text)
ALTER TABLE guilds ADD COLUMN vscode TEXT;

-- One row per learner who said yes: their personal key (only its SHA-256 is kept), consent, pause
CREATE TABLE IF NOT EXISTS vsc_learners (
  guild_id   TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  key_hash   TEXT,                   -- NULL: no key (never issued, or deleted)
  key_hint   TEXT,                   -- the key's last 4 characters, to tell keys apart
  consent_at INTEGER,
  consent_v  INTEGER,                -- the version of the consent text they accepted
  paused     INTEGER NOT NULL DEFAULT 0,
  hide_files INTEGER NOT NULL DEFAULT 0,
  first_seen INTEGER,                -- the first heartbeat received
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, discord_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS vsc_learners_key ON vsc_learners (key_hash);

-- One row per learner and day (Africa/Casablanca): the totals the dashboard reads, and the day's heartbeats (raw,
-- compact) until the retention days are over. Recomputed from raw at each request, so the CLI's late offline
-- replays, duplicates and midnight are counted right. rev: two requests at once can't overwrite each other.
CREATE TABLE IF NOT EXISTS vsc_days (
  guild_id    TEXT NOT NULL,
  discord_id  TEXT NOT NULL,
  day         TEXT NOT NULL,         -- YYYY-MM-DD
  active_s    INTEGER NOT NULL DEFAULT 0,
  write_s     INTEGER NOT NULL DEFAULT 0,
  first_t     INTEGER,
  last_t      INTEGER,
  n           INTEGER NOT NULL DEFAULT 0,
  ai_lines    INTEGER NOT NULL DEFAULT 0,
  human_lines INTEGER NOT NULL DEFAULT 0,
  agg         TEXT,                  -- JSON: hours, projects, files, languages, sessions, big insertions, current file
  raw         TEXT,                  -- JSON (compact); NULL after the retention days
  rev         INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (guild_id, discord_id, day)
);
CREATE INDEX IF NOT EXISTS vsc_days_day ON vsc_days (guild_id, day);
