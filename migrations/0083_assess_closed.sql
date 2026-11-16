-- Assessments: the questions a student can't go back to (validated with an answer, « no going back »), and the minutes
-- given to finish the questions not attempted when the teacher reopens a paper
ALTER TABLE assessment_takers ADD COLUMN closed TEXT;
ALTER TABLE assessment_takers ADD COLUMN extra_min INTEGER;
