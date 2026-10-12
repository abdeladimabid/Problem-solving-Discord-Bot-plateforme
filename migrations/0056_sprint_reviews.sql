-- Sprint review: each student's level and the teacher's decision for a sprint of the programme, and one comment per sprint.
CREATE TABLE IF NOT EXISTS sprint_reviews (
  guild_id   TEXT NOT NULL,
  program    TEXT NOT NULL,
  sprint     INTEGER NOT NULL,
  discord_id TEXT NOT NULL,
  plevel     TEXT,                       -- proposed level (AI or computed): excellent | bon | moyen | faible | critique
  why        TEXT,
  level      TEXT,                       -- the teacher's level
  decision   TEXT,                       -- valide | non_valide
  note       TEXT,
  updated_at INTEGER,
  PRIMARY KEY (guild_id, program, sprint, discord_id)
);
CREATE TABLE IF NOT EXISTS sprint_comments (
  guild_id   TEXT NOT NULL,
  program    TEXT NOT NULL,
  sprint     INTEGER NOT NULL,
  comment    TEXT,
  updated_at INTEGER,
  PRIMARY KEY (guild_id, program, sprint)
);
