-- Activités: the daily veilles (09:15) and live codings (11:00) generated for a class, and the overview of each week
-- ("Analyse de la semaine"), one per class, day and kind. The teacher reopens and edits them on the Activités page.
CREATE TABLE IF NOT EXISTS activities (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  program    TEXT,                       -- the class's programme when it was generated
  day        TEXT NOT NULL,              -- YYYY-MM-DD (for a week: its Monday)
  kind       TEXT NOT NULL,              -- week | veille | live
  week       INTEGER,                    -- the week of the programme
  title      TEXT,
  data       TEXT,                       -- the AI's answer, cleaned (JSON)
  md         TEXT NOT NULL,              -- the markdown shown and copied (the teacher may edit it)
  warnings   TEXT,                       -- JSON list: the template's rules it still breaks
  edited     INTEGER NOT NULL DEFAULT 0, -- 1: changed by hand (not written again from the JSON)
  model      TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  UNIQUE (guild_id, day, kind)
);
CREATE INDEX IF NOT EXISTS activities_day ON activities (guild_id, day);
