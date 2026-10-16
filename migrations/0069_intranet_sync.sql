-- What ClassBot sent to the YouCode intranet: for squads, the intranet's group distribution and, for each squad, its
-- intranet group (sent again: the same groups are updated, so the activities assigned to them stay linked).
CREATE TABLE IF NOT EXISTS intranet_sync (
  guild_id  TEXT NOT NULL,
  kind      TEXT NOT NULL,      -- squads
  local_id  INTEGER NOT NULL,   -- squad_sets.id
  remote_id INTEGER,            -- classroom_group_distributions.id
  map       TEXT,               -- {"<squad id>": <classroom_groups.id>}
  at        INTEGER,
  PRIMARY KEY (guild_id, kind, local_id)
);
