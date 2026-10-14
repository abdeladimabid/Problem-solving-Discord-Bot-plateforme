-- Plan d'action: the teacher's (or the AI's) comment on a student who needs help, and the students added to the plan by hand.
CREATE TABLE IF NOT EXISTS plan_notes (
  guild_id   TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  note       TEXT,
  note_by    TEXT,                       -- you | ai
  note_at    INTEGER,
  flagged    INTEGER NOT NULL DEFAULT 0, -- 1: in the plan (added by hand), -1: taken out of the plan by hand, 0: automatic
  updated_at INTEGER,
  PRIMARY KEY (guild_id, discord_id)
);
