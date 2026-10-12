-- Settings of this ClassBot set from the dashboard (e.g. the Groq API key), for all its classes.
CREATE TABLE IF NOT EXISTS app_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL);
