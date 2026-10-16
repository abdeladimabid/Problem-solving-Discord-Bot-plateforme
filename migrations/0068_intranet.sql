-- The YouCode intranet: the class's intranet classroom ({"classroom":{"id":12,"name":"DWWM 2026"}}) and, once, which
-- intranet learner each student is (matched by name; the teacher fixes the rare ones). Nothing is stored on the intranet.
ALTER TABLE guilds ADD COLUMN intranet TEXT;
CREATE TABLE IF NOT EXISTS intranet_links (
  guild_id     TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  learner_id   INTEGER NOT NULL,
  learner_name TEXT,
  by           TEXT,             -- exact | close (matched by name, to check) | you
  at           INTEGER,
  PRIMARY KEY (guild_id, discord_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS intranet_links_learner ON intranet_links (guild_id, learner_id);
