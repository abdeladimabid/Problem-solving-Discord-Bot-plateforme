-- One track per class (the language or stack it learns): javascript, php, python, java, c, cpp,
-- sql, mern (MongoDB, Express, React, Node) or ai (Python for AI & LLMs).
ALTER TABLE guilds ADD COLUMN track TEXT;
-- "Show in French / English": translations of a challenge's text, made once and kept.
ALTER TABLE challenges ADD COLUMN translations TEXT;
-- SQL challenges get finer skills (SELECT, WHERE, JOIN…): let the bot tag them again.
UPDATE challenges SET skills = NULL WHERE kind = 'sql';
