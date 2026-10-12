-- A brief's sprint chosen by the teacher (NULL = by its week or due date, 0 = not in a sprint, e.g. a cross defense, n = sprint n),
-- and when it was announced in Discord (the dashboard says "Announce again").
ALTER TABLE briefs ADD COLUMN sprint INTEGER;
ALTER TABLE briefs ADD COLUMN announced_at INTEGER;
