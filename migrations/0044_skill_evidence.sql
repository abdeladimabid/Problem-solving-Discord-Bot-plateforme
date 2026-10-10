-- What each code submission shows about a student's skills, beyond the challenge's own topic:
-- a crash on an array index lowers "arrays", a correct loop raises "loops"…
CREATE TABLE skill_evidence (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  discord_id  TEXT NOT NULL,
  attempt_id  INTEGER NOT NULL,
  skill       TEXT NOT NULL,
  ok          INTEGER NOT NULL,          -- 1 = used correctly, 0 = a mistake in this skill
  weight      REAL NOT NULL DEFAULT 1,
  why         TEXT,                      -- e.g. "crash: list index out of range", "AI review"
  created_at  INTEGER NOT NULL
);
CREATE INDEX skill_evidence_player ON skill_evidence(guild_id, discord_id, id);
