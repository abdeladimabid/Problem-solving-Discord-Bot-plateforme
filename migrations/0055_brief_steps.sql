-- Steps of a brief (parts to validate at given dates) and each student's (or squad's) result for each step.
ALTER TABLE briefs ADD COLUMN steps TEXT;   -- JSON [{ n, name, day, due (unix), expected }]
CREATE TABLE IF NOT EXISTS brief_steps (
  brief_id   INTEGER NOT NULL,
  guild_id   TEXT NOT NULL,
  who        TEXT NOT NULL,              -- "u:<discord id>" or "s:<squad id>"
  n          INTEGER NOT NULL,
  prop       TEXT,                       -- JSON proposal of the bot { statut, raison, before, after, files, added, repo, at }
  final      TEXT,                       -- a_temps | en_retard | non_fait (the teacher's decision)
  note       TEXT,
  updated_at INTEGER,
  PRIMARY KEY (brief_id, who, n)
);
