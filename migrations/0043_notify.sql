-- Teacher notifications by Discord DM: which events send one ({"hands":true,"ask":true}; NULL = all on)
ALTER TABLE guilds ADD COLUMN notify TEXT;
