-- Coaching: daily plans, step-by-step path, hints in steps, model solutions, weekly reports
ALTER TABLE challenges ADD COLUMN hints TEXT;        -- {"approach": "...", "pseudo": "..."} written once by the AI
ALTER TABLE challenges ADD COLUMN solutions TEXT;    -- {"javascript": "...", "php": "...", "note": "O(n) because..."}
ALTER TABLE players ADD COLUMN plan_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN plan_best INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN last_plan_day TEXT;
ALTER TABLE players ADD COLUMN plan_dm INTEGER NOT NULL DEFAULT 0;   -- 1 = send me my plan every morning
ALTER TABLE players ADD COLUMN path_done TEXT;                       -- path steps already celebrated (JSON list)
ALTER TABLE guilds ADD COLUMN path_cfg TEXT;                         -- teacher's own path steps and lessons
ALTER TABLE guilds ADD COLUMN last_plan_dm TEXT;                     -- day the morning plans were sent

CREATE TABLE daily_plans (
  guild_id     TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  day          TEXT NOT NULL,
  items        TEXT NOT NULL,              -- [{kind, challenge_id, skill, attempt_id, status}]
  completed_at INTEGER,
  bonus        INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (guild_id, discord_id, day)
);

CREATE TABLE weekly_reports (
  guild_id   TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  week       TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, discord_id, week)
);
