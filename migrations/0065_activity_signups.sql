-- Activités: the veilles and live codings the teacher shares in Discord, and who presents them.
-- A slot is an activity open to sign-ups; a claim is a request (or an assignment) by one to three students.
CREATE TABLE IF NOT EXISTS activity_slots (
  activity_id INTEGER PRIMARY KEY,           -- activities.id
  guild_id    TEXT NOT NULL,
  level       TEXT NOT NULL DEFAULT 'medium', -- easy | medium | hard (hard ones never go to a Faible or Critique student by random)
  size        INTEGER NOT NULL DEFAULT 2,     -- people who present it (veille 2, or 3 if the teacher says so; live coding 1 or 2)
  shared_at   INTEGER                          -- posted in Discord (NULL: not open to students yet)
);
CREATE INDEX IF NOT EXISTS activity_slots_g ON activity_slots (guild_id);
CREATE TABLE IF NOT EXISTS activity_claims (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  activity_id INTEGER NOT NULL,
  kind        TEXT NOT NULL,                  -- veille | live
  members     TEXT NOT NULL,                  -- JSON list of discord ids
  by          TEXT NOT NULL,                  -- the student who asked, or 'teacher' / 'random'
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | approved | denied | done | cancelled
  note        TEXT,                           -- the teacher's word (shown to the students)
  grades      TEXT,                           -- JSON {discord id: % of the points}
  points      INTEGER,                        -- the full points of the activity when it was graded
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER,
  done_at     INTEGER
);
CREATE INDEX IF NOT EXISTS activity_claims_g ON activity_claims (guild_id, status);
CREATE INDEX IF NOT EXISTS activity_claims_a ON activity_claims (activity_id);
