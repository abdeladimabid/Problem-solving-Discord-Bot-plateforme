-- v2: write-code challenges, verified HackerRank links, scoring per type, #arena

-- challenges: write-code problems keep their tests in challenge_tests
ALTER TABLE challenges ADD COLUMN test_set TEXT;       -- shared by the EN/FR versions of a problem
ALTER TABLE challenges ADD COLUMN time_limit REAL;     -- seconds per test (Python)
ALTER TABLE challenges ADD COLUMN solution TEXT;       -- reference solution (teachers only)

CREATE TABLE challenge_tests (
  test_set TEXT NOT NULL,
  idx      INTEGER NOT NULL,
  input    TEXT,                 -- stored input (NULL when only a generator is kept)
  gen      TEXT,                 -- Python `def gen()` that builds a big input
  expected TEXT NOT NULL,        -- expected output, whitespace-normalized
  sample   INTEGER NOT NULL DEFAULT 0,  -- 1 = shown in the statement
  PRIMARY KEY (test_set, idx)
);

-- attempts: submitted code, language and judge results
ALTER TABLE attempts ADD COLUMN lang TEXT;
ALTER TABLE attempts ADD COLUMN result TEXT;           -- JSON summary of the last judging
ALTER TABLE attempts ADD COLUMN feedback TEXT;         -- AI feedback shown to the student

-- players: preferred language, HackerRank ownership proof
ALTER TABLE players ADD COLUMN code_lang TEXT;          -- language last picked for write-code problems
ALTER TABLE players ADD COLUMN hr_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN hr_code TEXT;

-- guilds: arena channel and custom scoring
ALTER TABLE guilds ADD COLUMN arena_channel TEXT;
ALTER TABLE guilds ADD COLUMN scoring TEXT;
ALTER TABLE guilds ADD COLUMN commands_version TEXT;   -- slash commands registered by the bot itself            -- JSON {base:{easy,medium,hard}, mult:{mcq,...}}

-- self-reported HackerRank solves never count until a teacher approves them
UPDATE guilds SET trust_claims = 0;
INSERT INTO ledger (guild_id, discord_id, season, amount, reason, ref, note, created_at)
  SELECT a.guild_id, a.discord_id, g.season, -a.points, 'regrade', a.id,
         'self-reported solve: waiting for teacher approval', CAST(strftime('%s', 'now') AS INTEGER)
    FROM attempts a JOIN guilds g ON g.id = a.guild_id
   WHERE a.status = 'claimed' AND a.points > 0;
UPDATE attempts SET verified = 0, points = 0 WHERE status = 'claimed';

-- retire the first, too-easy bank and the old AI challenges (history is kept)
UPDATE challenges SET status = 'archived' WHERE source IN ('seed', 'ai') AND kind != 'code';

-- AI generation runs in the background (cron) so Discord never times out
CREATE TABLE ai_queue (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  discord_id   TEXT,
  kind         TEXT NOT NULL,          -- write | mcq | complexity | output | bug | quick
  code_lang    TEXT,                   -- programming language for quick challenges
  difficulty   TEXT NOT NULL,
  topic        TEXT,
  token        TEXT,                   -- interaction token: the bot edits that message when ready
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | working | done | failed
  challenge_id INTEGER,
  error        TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER
);
CREATE INDEX ai_queue_status ON ai_queue(status, created_at);
