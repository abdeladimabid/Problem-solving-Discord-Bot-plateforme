-- Boss battles told like a tabletop RPG: the AI's story (intro, a line for each hit, half health, almost dead,
-- victory, escape), shown in Discord as the class fights. JSON; NULL = the plain messages.
ALTER TABLE bosses ADD COLUMN lore TEXT;
