-- The teacher manages the coin shop: prices, limits, items on/off, and their own rewards
-- (e.g. "skip one homework"), which students buy and the teacher hands out.
ALTER TABLE guilds ADD COLUMN shop TEXT;                 -- JSON: { items: { freeze: { on, price, max } … }, custom: [ { id, name, emoji, price, desc, stock, per_student, on } ] }
ALTER TABLE purchases ADD COLUMN status TEXT;            -- own rewards: 'pending' until the teacher marks it 'given' (or 'refunded')
CREATE INDEX IF NOT EXISTS purchases_guild ON purchases(guild_id, id);
-- coins added, removed or set by the teacher (history in the dashboard)
CREATE TABLE coin_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  delta      INTEGER NOT NULL,
  balance    INTEGER NOT NULL,
  reason     TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX coin_log_guild ON coin_log(guild_id, id);
