-- "Create the GitHub App for me": the class that started GitHub's app-manifest flow (checked when GitHub comes back).
CREATE TABLE IF NOT EXISTS gh_manifest_states (
  state    TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  exp      INTEGER NOT NULL
);
