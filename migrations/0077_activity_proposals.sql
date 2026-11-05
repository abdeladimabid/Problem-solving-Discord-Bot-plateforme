-- Students propose a veille or a live coding (/activity propose). Every teacher of this ClassBot sees the proposals of
-- all the classes; one plans it on a free day of their own class (it becomes an activity open to every student), or
-- turns it down with a word. A proposal can be planned in several classes.
CREATE TABLE IF NOT EXISTS activity_proposals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,                   -- the class of the student who proposed
  kind        TEXT NOT NULL,                   -- veille | live
  title       TEXT NOT NULL,
  details     TEXT,                            -- what they want to present, and why
  by          TEXT NOT NULL,                   -- the student's discord id
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | planned | denied
  note        TEXT,                            -- the teacher's word when turned down
  plans       TEXT NOT NULL DEFAULT '[]',      -- JSON [{ guild, activity, day, at }]: where it was planned
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER
);
CREATE INDEX IF NOT EXISTS activity_proposals_s ON activity_proposals (status, created_at);
CREATE INDEX IF NOT EXISTS activity_proposals_by ON activity_proposals (guild_id, by);
