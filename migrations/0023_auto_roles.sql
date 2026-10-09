-- Automatic Discord roles (season leader, top 3, best coder, duel master, level titles)
ALTER TABLE guilds ADD COLUMN auto_roles TEXT;
