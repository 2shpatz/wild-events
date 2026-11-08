-- Background music on the guest pages: settings JSON (see shared/music.ts). NULL = the default (off).
ALTER TABLE events ADD COLUMN music TEXT;

-- The owner's Google Drive folder for uploaded songs (created on the first upload).
ALTER TABLE owners ADD COLUMN drive_music_folder TEXT;

-- Songs uploaded by the host. The file lives in the event owner's Google Drive; guests stream it through the Worker.
CREATE TABLE event_tracks (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL,
  owner_id   TEXT NOT NULL,
  drive_id   TEXT NOT NULL,
  title      TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  duration   INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX event_tracks_event ON event_tracks (event_id, created_at);
