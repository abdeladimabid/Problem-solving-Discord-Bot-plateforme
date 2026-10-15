-- Shared library: teachers of the same programme (e.g. all the A1 classes) share their Activités (veilles, live
-- codings, week overviews), assessments, live quizzes and class games content. One ClassBot hosts the library
-- (library_teams, library_items); every class that joins with its link keeps a local copy (library_cache).
-- One shared copy: any teacher's edit updates it for everyone (last edit wins, with a version number).
CREATE TABLE IF NOT EXISTS library_teams (
  id         TEXT PRIMARY KEY,         -- random
  name       TEXT NOT NULL,
  secret     TEXT NOT NULL,            -- in the link: whoever has the link reads and edits
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS library_items (
  team       TEXT NOT NULL,
  kind       TEXT NOT NULL,            -- activity | assessment | quiz | case | task | royale
  key        TEXT NOT NULL,            -- activity: day:kind (2026-10-19:veille); others: a random id
  title      TEXT,
  data       TEXT,                     -- JSON (never a student's data: only the teachers' content)
  version    INTEGER NOT NULL DEFAULT 1,
  by         TEXT,                     -- the class that wrote this version
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (team, kind, key)
);
CREATE INDEX IF NOT EXISTS library_items_t ON library_items (team, updated_at);
-- each class's copy of its library (what came from the hub, and what it sent)
CREATE TABLE IF NOT EXISTS library_cache (
  guild_id   TEXT NOT NULL,
  kind       TEXT NOT NULL,
  key        TEXT NOT NULL,
  title      TEXT,
  data       TEXT,
  version    INTEGER NOT NULL,
  by         TEXT,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, kind, key)
);
-- deletions waiting to be sent (an activity removed here is removed for everyone)
CREATE TABLE IF NOT EXISTS library_outbox (
  guild_id TEXT NOT NULL,
  kind     TEXT NOT NULL,
  key      TEXT NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (guild_id, kind, key)
);
-- which local rows come from the library, and the version they hold
ALTER TABLE activities ADD COLUMN lib_v INTEGER;
ALTER TABLE activities ADD COLUMN lib_at INTEGER;
ALTER TABLE assessments ADD COLUMN lib_key TEXT;
ALTER TABLE assessments ADD COLUMN lib_v INTEGER;
-- an activity changed here (generated again, edited…) waits to be sent: lib_at back to NULL. Versions coming from
-- the library (lib_v changes) don't count.
CREATE TRIGGER IF NOT EXISTS activities_lib_dirty AFTER UPDATE OF md, title, data, warnings, edited, week, program ON activities
  WHEN NEW.lib_v IS OLD.lib_v
BEGIN
  UPDATE activities SET lib_at = NULL WHERE id = NEW.id;
END;
