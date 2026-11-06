-- 🤖 The Claude connector: what each key may do ('drafts': read everything, write drafts; 'full': read and write
-- everything through the dashboard's API), and what Claude did with it (every change, kept for the teacher to see).
ALTER TABLE mcp_keys ADD COLUMN scope TEXT NOT NULL DEFAULT 'drafts';
CREATE TABLE IF NOT EXISTS mcp_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id INTEGER NOT NULL,
  at INTEGER NOT NULL,
  tool TEXT NOT NULL,
  method TEXT,
  path TEXT,
  guild_id TEXT,
  status INTEGER,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS mcp_log_at ON mcp_log (at);
