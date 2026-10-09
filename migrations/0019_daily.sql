-- Daily challenge settings (language, weekly plan, on/off) and challenges pinned to a date
ALTER TABLE guilds ADD COLUMN daily_cfg TEXT;

CREATE TABLE daily_pins (
  guild_id     TEXT NOT NULL,
  day          TEXT NOT NULL,           -- YYYY-MM-DD
  challenge_id INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (guild_id, day)
);
