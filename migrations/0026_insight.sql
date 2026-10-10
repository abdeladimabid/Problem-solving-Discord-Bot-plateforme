-- Teacher insight: exam mode for sessions, the teacher's Monday summary
ALTER TABLE sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'class';   -- class | exam
ALTER TABLE sessions ADD COLUMN grades TEXT;                          -- exam: {discord_id: {grade, scores{challenge: 0..1}}}
ALTER TABLE sessions ADD COLUMN notified TEXT;                        -- exam: students already sent their grade (JSON list)
ALTER TABLE guilds ADD COLUMN teacher_id TEXT;                        -- who ran /teacher setup (gets the Monday summary)
ALTER TABLE guilds ADD COLUMN last_teacher_digest TEXT;
