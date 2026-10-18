-- One activity per class, day and slot: 09:15 the veille, 11:00 a live coding OR a workshop (never both), the week's plan.
-- The app asks the teacher before replacing what is in a slot (generation never writes over it); this index keeps it so.
CREATE UNIQUE INDEX IF NOT EXISTS activities_slot ON activities (guild_id, day, (CASE WHEN kind IN ('live', 'workshop') THEN '11:00' ELSE kind END));
