-- Which repos the student lets the GitHub App see: "all", or "selected" (a new project is then not followed until added).
ALTER TABLE players ADD COLUMN gh_sel TEXT;
