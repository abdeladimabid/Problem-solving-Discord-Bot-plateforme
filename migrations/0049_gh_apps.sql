-- Each class can use its own GitHub App (several teachers on one ClassBot). Without a row, the class uses the
-- App set in the Worker's secrets (GITHUB_*). The secrets never leave the server: the dashboard only sees if they are set.
CREATE TABLE gh_apps (
  guild_id       TEXT PRIMARY KEY,
  app_id         TEXT,
  slug           TEXT,
  client_id      TEXT,
  client_secret  TEXT,
  webhook_secret TEXT,
  private_key    TEXT,
  updated_at     INTEGER
);
