-- ⚔️ Squad battles: two teams, a chess clock each, questions on the class TV, the teacher judges from their phone.
CREATE TABLE IF NOT EXISTS battles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  teams       TEXT NOT NULL,          -- [{name, emoji, color, members}]
  settings    TEXT NOT NULL,          -- {seconds, penalty, topics, kinds, level, reward, announce, lang}
  questions   TEXT NOT NULL,          -- [{id, kind, topic, prompt, code, options, answer, explain}]
  state       TEXT NOT NULL,          -- the game (clocks, turn, question order, events)
  tv_token    TEXT NOT NULL,
  judge_token TEXT NOT NULL,
  judge_key   TEXT,                   -- the phone that judges (the first to open the link)
  judge_pin   TEXT NOT NULL,          -- to let another phone judge
  judge_seen  INTEGER,
  status      TEXT NOT NULL DEFAULT 'ready',   -- ready | live | done
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS battles_guild ON battles(guild_id, id);
