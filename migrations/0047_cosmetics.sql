-- Shop v3: profile cosmetics and boosts.
--   cosmetics  JSON {theme, motto, emoji, showcase, lang, pin, frame, victory, levelup, flair}: each {v, until}
--   boosts     JSON {double_until, shield_until, contract: {level, target, ids, until, reward, done}}
ALTER TABLE players ADD COLUMN cosmetics TEXT;
ALTER TABLE players ADD COLUMN boosts TEXT;
