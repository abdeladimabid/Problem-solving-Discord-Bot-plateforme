-- Chat with your class: the teacher's 👍 / 👎 on an answer, to see where the chat goes wrong (the question, the answer,
-- what was read). Only the last 500 of a class are kept.
CREATE TABLE IF NOT EXISTS chat_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  vote INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sources TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_guild ON chat_feedback (guild_id, id);
