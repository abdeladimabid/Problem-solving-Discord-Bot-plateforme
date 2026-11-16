-- Indexes for the queries that read a whole table (found with EXPLAIN QUERY PLAN on every query of the test suite).
-- The minute cron asks « is anything due? » on each of these tables: with an index it reads the due rows only.
CREATE INDEX IF NOT EXISTS brief_reviews_guild ON brief_reviews(guild_id, status);
CREATE INDEX IF NOT EXISTS brief_steps_guild ON brief_steps(guild_id);
CREATE INDEX IF NOT EXISTS assessments_brief ON assessments(brief_id);
CREATE INDEX IF NOT EXISTS mises_brief ON mises(json_extract(settings, '$.brief.id'));
CREATE INDEX IF NOT EXISTS mises_due ON mises(status, ends_at);
CREATE INDEX IF NOT EXISTS mise_takers_due ON mise_takers(status, ends_at);
CREATE INDEX IF NOT EXISTS assessment_takers_due ON assessment_takers(status, deadline);
CREATE INDEX IF NOT EXISTS bosses_due ON bosses(status, deadline);
CREATE INDEX IF NOT EXISTS bounties_due ON bounties(status, deadline);
CREATE INDEX IF NOT EXISTS competency_results_ref ON competency_results(source, ref);
