-- The shared library: who made each item (a teacher's name), set when it's made and never changed by later edits.
-- An activity sent to the intranet by another teacher says "Conçue par <author>".
ALTER TABLE library_items ADD COLUMN author TEXT;
ALTER TABLE library_cache ADD COLUMN author TEXT;
