-- Skill map: which skills each challenge trains (comma-separated keys, see src/shared/skills.ts).
-- Filled in by the bot itself a few minutes after the update; teachers can edit them in the dashboard.
ALTER TABLE challenges ADD COLUMN skills TEXT;
