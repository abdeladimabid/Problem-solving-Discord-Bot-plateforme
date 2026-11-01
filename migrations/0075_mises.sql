-- Mises en situation: live practical tests (5 situations with code + 5 QCM) written with Claude outside the app,
-- taken in the browser with a code editor, followed live by the teacher. See src/shared/mises.ts.
CREATE TABLE IF NOT EXISTS mises (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  title      TEXT NOT NULL,
  week       INTEGER,                     -- the programme week it was written for
  sprint     INTEGER,
  comps      TEXT,                        -- JSON ["C3N1", "CT2N1"]: the competencies chosen
  target     TEXT,                        -- JSON [discord_id]: the learners chosen ([] = the whole class)
  settings   TEXT,                        -- JSON { minutes, noPaste, channel }
  content    TEXT NOT NULL,               -- JSON: the classbot-mise-en-situation@1 file, checked (solutions inside: never sent to a learner)
  status     TEXT NOT NULL DEFAULT 'draft',   -- draft | live | closed (scheduled = live with starts_at in the future)
  starts_at  INTEGER,
  ends_at    INTEGER,                     -- NULL = open until the teacher closes it
  created_at INTEGER NOT NULL,
  opened_at  INTEGER,
  closed_at  INTEGER
);
CREATE INDEX IF NOT EXISTS mises_guild ON mises(guild_id, id);

CREATE TABLE IF NOT EXISTS mise_takers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  mise_id      INTEGER NOT NULL,
  guild_id     TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'invited',   -- invited | active | submitted
  answers      TEXT,        -- JSON { m1: { files: { "index.html": "…" } }, q1: { choice: 2 } }
  spent        TEXT,        -- JSON { m1: ms on the item }
  checks       TEXT,        -- JSON { m1: { at, results: [{ id, ok }] } }: the last automatic checks
  ai           TEXT,        -- JSON { m1: [{ at, categories: ["selection"] }] }: the AI checks (3 per item at most)
  logs         TEXT,        -- JSON { m1: { changes: [[t, from, removed, text, origin]], openMs } }: the typing record
  events       TEXT,        -- JSON [[t, kind, item, n, extra]]: leave / back / paste / run / check / item / submit
  cur_item     TEXT,
  item_since   INTEGER,
  last_seen    INTEGER,
  grades       TEXT,        -- JSON { m1: { score, comment, teacher } }: the teacher's changes over the automatic score
  score        INTEGER,
  comment      TEXT,        -- the teacher's comment sent with the results
  invited_at   INTEGER,
  started_at   INTEGER,
  submitted_at INTEGER,
  sent_at      INTEGER,
  UNIQUE (mise_id, discord_id)
);
CREATE INDEX IF NOT EXISTS mise_takers_m ON mise_takers(mise_id);
