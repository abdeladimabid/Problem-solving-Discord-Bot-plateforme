-- 🤖 The Claude connector (src/admin/mcp.ts): the teacher's keys, kept only as their SHA-256; revoked ones stay as a trace.
CREATE TABLE IF NOT EXISTS mcp_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_used INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER
);
