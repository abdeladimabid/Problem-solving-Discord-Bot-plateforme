-- Assessments: « Réassigner ». A learner who already took an assessment gets a new attempt: the current attempt stays in
-- assessment_takers (the only one that counts: score, competencies, skills, debrief, exports), the earlier ones are kept
-- here for the teacher's history (« Tentative 1 »). The link carries the attempt: an earlier attempt's link is refused.
ALTER TABLE assessment_takers ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1;
-- the results sent by DM to this learner: when, and a fingerprint of what was sent (« changed since it was sent »)
ALTER TABLE assessment_takers ADD COLUMN sent_at INTEGER;
ALTER TABLE assessment_takers ADD COLUMN sent_hash TEXT;
CREATE TABLE assessment_attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  taker_id      INTEGER NOT NULL,
  assessment_id INTEGER NOT NULL,
  guild_id      TEXT NOT NULL,
  discord_id    TEXT NOT NULL,
  n             INTEGER NOT NULL,      -- 1, 2… (the attempt archived)
  status        TEXT,
  seed          INTEGER,
  answers       TEXT,
  grades        TEXT,
  score         INTEGER,
  summary       TEXT,
  events        TEXT,                  -- leaving, pastes… of that attempt
  ident         TEXT,                  -- its sign-in record (devices, networks)
  started_at    INTEGER,
  submitted_at  INTEGER,
  sent_at       INTEGER,
  archived_at   INTEGER NOT NULL
);
CREATE INDEX assessment_attempts_taker ON assessment_attempts(taker_id, n);
CREATE INDEX assessment_attempts_assessment ON assessment_attempts(assessment_id);
