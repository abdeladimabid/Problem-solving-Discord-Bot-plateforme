-- Squads of the class, by sprint (separate from the briefs): a brief or a squad battle can load them.
CREATE TABLE IF NOT EXISTS squad_sets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  name       TEXT NOT NULL,          -- "Sprint 3", "Semaine 12"…
  squads     TEXT NOT NULL,          -- [{id, name, members, sm}]
  active     INTEGER NOT NULL DEFAULT 0,   -- the current squads
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS squad_sets_guild ON squad_sets(guild_id, id);
