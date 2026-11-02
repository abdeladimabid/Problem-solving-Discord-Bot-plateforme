-- A retake: a student who missed an assessment (absent, never started, or handed in without a single answer) gets their
-- own link open until this date, even when the assessment is closed for the others. See retake() in src/shared/assess.ts.
ALTER TABLE assessment_takers ADD COLUMN open_until INTEGER;
