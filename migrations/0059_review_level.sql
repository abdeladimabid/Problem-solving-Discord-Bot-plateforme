-- The level of a debrief (excellent | bon | moyen | faible | critique): the teacher's and the one proposed from the switches,
-- read by the Progress page without opening every debrief record.
ALTER TABLE brief_reviews ADD COLUMN level TEXT;
ALTER TABLE brief_reviews ADD COLUMN plevel TEXT;
