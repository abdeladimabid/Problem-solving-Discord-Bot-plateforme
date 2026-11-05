-- A mise en situation given later to a learner who was absent: their own time (minutes, counted from when they open it)
-- and their own end, while the session itself stays closed for the class.
ALTER TABLE mise_takers ADD COLUMN minutes INTEGER;
ALTER TABLE mise_takers ADD COLUMN ends_at INTEGER;
