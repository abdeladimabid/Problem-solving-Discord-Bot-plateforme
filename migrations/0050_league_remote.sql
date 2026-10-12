-- Class league between ClassBots hosted separately (each teacher on their own Cloudflare):
-- the classes another ClassBot shares, as last read from their league link.
CREATE TABLE IF NOT EXISTS league_remote (
  guild_id   TEXT NOT NULL,        -- the class that added it
  url        TEXT NOT NULL,        -- the other class's league link
  data       TEXT,                 -- what the link returned (JSON)
  fetched_at INTEGER,
  error      TEXT,
  PRIMARY KEY (guild_id, url)
);
