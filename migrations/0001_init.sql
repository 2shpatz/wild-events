-- Site-wide settings (Google OAuth client, setup wizard progress).
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Event owners (Google accounts).
CREATE TABLE owners (
  id                TEXT PRIMARY KEY,
  google_sub        TEXT NOT NULL UNIQUE,
  email             TEXT,
  name              TEXT,
  picture           TEXT,
  refresh_token_enc TEXT,
  access_token_enc  TEXT,
  access_expires    INTEGER NOT NULL DEFAULT 0,
  scopes            TEXT,
  storage_json      TEXT,
  storage_checked   INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL
);

-- Login sessions. kind = 'owner' (Google) | 'event_admin' (password) | 'setup'.
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  owner_id   TEXT,
  event_id   TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expires ON sessions(expires_at);

CREATE TABLE events (
  id                  TEXT PRIMARY KEY,
  owner_id            TEXT NOT NULL REFERENCES owners(id),
  code                TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  subtitle            TEXT,
  welcome             TEXT,           -- welcome message on the invitation page
  event_date          TEXT,
  type                TEXT NOT NULL DEFAULT 'general',
  theme               TEXT NOT NULL DEFAULT 'general',
  background          TEXT,           -- preset id, or 'custom'
  quality             TEXT NOT NULL DEFAULT 'compressed', -- 'compressed' | 'original'
  keep_gps            INTEGER NOT NULL DEFAULT 0,
  admin_password_hash TEXT,
  google_album_id     TEXT,           -- master album with every photo of the event
  google_album_url    TEXT,
  default_view        TEXT NOT NULL DEFAULT 'masonry',
  default_order       TEXT NOT NULL DEFAULT 'mixed',
  uploads_open        INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL,
  deleted             INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX events_owner ON events(owner_id);

-- Custom background image ('bg') and featured photos ('f0'..'f5'), compressed client-side.
CREATE TABLE event_assets (
  event_id TEXT NOT NULL,
  kind     TEXT NOT NULL,
  mime     TEXT NOT NULL,
  data     BLOB NOT NULL,
  etag     TEXT NOT NULL,
  PRIMARY KEY (event_id, kind)
);

-- One album per guest, plus the host album and custom (import) albums.
CREATE TABLE albums (
  id              TEXT PRIMARY KEY,
  event_id        TEXT NOT NULL REFERENCES events(id),
  kind            TEXT NOT NULL,      -- 'guest' | 'host' | 'custom'
  name            TEXT NOT NULL,
  name_norm       TEXT NOT NULL,
  google_album_id TEXT,
  created_at      INTEGER NOT NULL,
  hidden          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX albums_event ON albums(event_id);
CREATE INDEX albums_name ON albums(event_id, name_norm);

CREATE TABLE album_devices (
  album_id  TEXT NOT NULL,
  device_id TEXT NOT NULL,
  event_id  TEXT NOT NULL,
  PRIMARY KEY (event_id, device_id)
);

CREATE TABLE media (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL,
  album_id     TEXT NOT NULL,
  google_id    TEXT NOT NULL,
  kind         TEXT NOT NULL,         -- 'photo' | 'video'
  mime         TEXT,
  filename     TEXT,
  width        INTEGER,
  height       INTEGER,
  taken_at     INTEGER,
  uploaded_at  INTEGER NOT NULL,
  size         INTEGER,
  source       TEXT NOT NULL DEFAULT 'upload', -- 'upload' | 'import' | 'share'
  picked_id    TEXT,
  device_id    TEXT,
  base_url     TEXT,
  base_url_exp INTEGER NOT NULL DEFAULT 0,
  processing   INTEGER NOT NULL DEFAULT 0,
  hidden       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX media_event ON media(event_id, hidden);
CREATE INDEX media_album ON media(album_id);
CREATE UNIQUE INDEX media_picked ON media(event_id, picked_id) WHERE picked_id IS NOT NULL;

-- Change feed for live updates (polling cursor = seq).
CREATE TABLE changes (
  seq      INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  op       TEXT NOT NULL,            -- 'add' | 'remove' | 'album' | 'event'
  ref_id   TEXT
);
CREATE INDEX changes_event ON changes(event_id, seq);

-- In-flight uploads (upload tokens are kept server-side, never trusted from the client).
CREATE TABLE uploads (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL,
  album_id     TEXT NOT NULL,
  device_id    TEXT,
  filename     TEXT,
  mime         TEXT,
  size         INTEGER NOT NULL,
  taken_at     INTEGER,
  width        INTEGER,
  height       INTEGER,
  source       TEXT NOT NULL DEFAULT 'upload',
  upload_url   TEXT,
  offset       INTEGER NOT NULL DEFAULT 0,
  upload_token TEXT,
  status       TEXT NOT NULL DEFAULT 'started', -- started | uploaded | done | failed
  created_at   INTEGER NOT NULL
);
CREATE INDEX uploads_event ON uploads(event_id, status);

-- Import from Google Photos (Picker API).
CREATE TABLE import_jobs (
  id                TEXT PRIMARY KEY,
  event_id          TEXT NOT NULL,
  owner_id          TEXT NOT NULL,
  album_id          TEXT NOT NULL,
  picker_session_id TEXT NOT NULL,
  picker_uri        TEXT,
  status            TEXT NOT NULL DEFAULT 'picking', -- picking | listed | running | done | cancelled
  total             INTEGER NOT NULL DEFAULT 0,
  done              INTEGER NOT NULL DEFAULT 0,
  skipped           INTEGER NOT NULL DEFAULT 0,
  failed            INTEGER NOT NULL DEFAULT 0,
  est_bytes         INTEGER NOT NULL DEFAULT 0,
  already           INTEGER NOT NULL DEFAULT 0,
  quality           TEXT NOT NULL DEFAULT 'compressed',
  page_token        TEXT,             -- listing progress
  listed_at         INTEGER NOT NULL DEFAULT 0,
  relist            INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  created_at        INTEGER NOT NULL
);

CREATE TABLE import_items (
  job_id      TEXT NOT NULL,
  picked_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,
  mime        TEXT,
  filename    TEXT,
  width       INTEGER,
  height      INTEGER,
  create_time INTEGER,
  base_url    TEXT,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | done | skipped | failed
  error       TEXT,
  PRIMARY KEY (job_id, picked_id)
);

-- Simple fixed-window rate limiting (login attempts etc.).
CREATE TABLE rate_limits (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL,
  window_end INTEGER NOT NULL
);
