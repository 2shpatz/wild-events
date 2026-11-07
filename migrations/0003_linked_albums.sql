-- Linked albums: an event album that mirrors an album the owner has in Google Photos (their own, or one
-- shared with them). Google's API can't read albums the app didn't create, so the owner picks the album
-- in the Google Photos Picker and we copy it in; "sync" re-opens the picker and copies only new items.
ALTER TABLE albums ADD COLUMN linked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE albums ADD COLUMN source_url TEXT;           -- optional share link, for "open in Google Photos"
ALTER TABLE albums ADD COLUMN synced_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN linked INTEGER NOT NULL DEFAULT 0; -- job links/syncs a whole album
