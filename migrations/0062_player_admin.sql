-- The teacher's name for a student: kept as is (the Discord nickname no longer replaces it). 0 = the Discord name.
ALTER TABLE players ADD COLUMN name_lock INTEGER NOT NULL DEFAULT 0;
