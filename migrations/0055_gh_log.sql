-- Each commit and pull request of a linked student, with what the bot found (tiny, vague message, huge…),
-- for the GitHub tab of the student page. Filled by the webhook, and from GitHub on demand for older work.
CREATE TABLE IF NOT EXISTS gh_log (
  guild_id TEXT NOT NULL,
  id TEXT NOT NULL,              -- the commit sha, or "pr:owner/repo#12:opened"
  discord_id TEXT NOT NULL,
  kind TEXT NOT NULL,            -- commit | pr
  repo TEXT,
  branch TEXT,
  t INTEGER NOT NULL,
  title TEXT,                    -- the commit message (first lines) or the PR title
  size TEXT,                     -- real | tiny | docs | merge (commits)
  bad INTEGER NOT NULL DEFAULT 0,-- vague message ("update", "fix", "aaa"…)
  flags TEXT,                    -- huge, node_modules
  adds INTEGER, dels INTEGER, files INTEGER,
  action TEXT,                   -- PR: opened / closed / merged…
  url TEXT,
  PRIMARY KEY (guild_id, id)
);
CREATE INDEX IF NOT EXISTS gh_log_who ON gh_log (guild_id, discord_id, t);
-- the AI summary of what a student built (features), kept until the teacher asks again
CREATE TABLE IF NOT EXISTS gh_summaries (guild_id TEXT NOT NULL, discord_id TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (guild_id, discord_id));
