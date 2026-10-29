-- The intranet learner's photo (its file name, only to know when it changes): the image itself is fetched from the
-- intranet the first time a page shows it, then kept in Cloudflare's cache. Nothing else of the profile is copied.
ALTER TABLE intranet_links ADD COLUMN photo TEXT;
