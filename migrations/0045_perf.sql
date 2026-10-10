-- Speed: indexes for the queries that run every minute or on every page, so the database
-- reads a few rows instead of whole tables (the free plan counts rows read per day).

-- cron: expire old practice attempts (reads only pending ones)
CREATE INDEX IF NOT EXISTS attempts_pending ON attempts(origin, started_at) WHERE status = 'pending';
-- one class over a time window: heatmap, roles, weekly reports, overview, summaries
CREATE INDEX IF NOT EXISTS attempts_guild_finished ON attempts(guild_id, finished_at);
-- "not seen yet" when picking a challenge, per-challenge stats (replaces attempts_challenge)
CREATE INDEX IF NOT EXISTS attempts_challenge_guild ON attempts(challenge_id, guild_id, discord_id);
DROP INDEX IF EXISTS attempts_challenge;
-- integrity: submissions waiting for a review
CREATE INDEX IF NOT EXISTS attempts_unreviewed ON attempts(guild_id, id) WHERE integrity IS NOT NULL AND reviewed = 0;

-- what each code submission showed (looked up on every submission)
CREATE INDEX IF NOT EXISTS skill_evidence_attempt ON skill_evidence(attempt_id, ok);
CREATE INDEX IF NOT EXISTS skill_evidence_time ON skill_evidence(guild_id, created_at);

-- challenges not tagged with skills yet
CREATE INDEX IF NOT EXISTS challenges_noskills ON challenges(id) WHERE skills IS NULL;

-- duel wins, a student's assignments and contest results (profiles, badges, students list)
CREATE INDEX IF NOT EXISTS duels_winner ON duels(guild_id, winner_id);
CREATE INDEX IF NOT EXISTS assignments_player ON assignments(guild_id, discord_id, status);
CREATE INDEX IF NOT EXISTS contest_results_player ON contest_results(guild_id, discord_id);

-- cron sweeps
CREATE INDEX IF NOT EXISTS sessions_due ON sessions(status, ends_at);
CREATE INDEX IF NOT EXISTS players_title_exp ON players(title_until) WHERE title IS NOT NULL;
CREATE INDEX IF NOT EXISTS players_color_exp ON players(color_until) WHERE color_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS players_plan_dm ON players(guild_id) WHERE plan_dm = 1;

-- weekly reports: a class is marked done once all its reports are sent
ALTER TABLE guilds ADD COLUMN last_reports TEXT;
