-- Storage accounts: extra Google accounts an owner connects just to hold event photos (so guests
-- don't fill the owner's personal account). The owner's own login account is the ref 'self'.
CREATE TABLE storage_accounts (
  id                 TEXT PRIMARY KEY,
  owner_id           TEXT NOT NULL,
  google_sub         TEXT NOT NULL,
  email              TEXT,
  name               TEXT,
  picture            TEXT,
  refresh_token_enc  TEXT,
  access_token_enc   TEXT,
  access_expires     INTEGER NOT NULL DEFAULT 0,
  scopes             TEXT,
  storage_json       TEXT,
  storage_checked    INTEGER NOT NULL DEFAULT 0,
  drive_music_folder TEXT,
  created_at         INTEGER NOT NULL,
  UNIQUE (owner_id, google_sub)
);
CREATE INDEX storage_accounts_owner ON storage_accounts(owner_id);

-- Where the event's photos, albums and songs live. NULL = the owner's login account.
ALTER TABLE events ADD COLUMN storage_account_id TEXT;
-- Id of the running storage_migrations job; while set, guest uploads pause ("maintenance").
ALTER TABLE events ADD COLUMN migrating TEXT;

-- Which account holds each item ('self' | storage_accounts.id). Lets the gallery keep working while an
-- event moves between accounts (some items already moved, some not yet).
ALTER TABLE media ADD COLUMN account_ref TEXT NOT NULL DEFAULT 'self';
UPDATE media SET account_ref = COALESCE((SELECT e.storage_account_id FROM events e WHERE e.id = media.event_id), 'self');

-- Which account holds each uploaded song ('self' | storage_accounts.id).
ALTER TABLE event_tracks ADD COLUMN account_ref TEXT NOT NULL DEFAULT 'self';

-- Moving an event to another account: copies every item, then switches the event over.
CREATE TABLE storage_migrations (
  id               TEXT PRIMARY KEY,
  event_id         TEXT NOT NULL,
  from_ref         TEXT NOT NULL,
  to_ref           TEXT NOT NULL,
  status           TEXT NOT NULL,          -- running | done | error | cancelled
  total            INTEGER NOT NULL DEFAULT 0,
  done             INTEGER NOT NULL DEFAULT 0,
  failed           INTEGER NOT NULL DEFAULT 0,
  master_album_id  TEXT,                   -- the new "all photos" album in the target account
  master_album_url TEXT,
  old_album_url    TEXT,                   -- the old "all photos" album (copies stay there)
  error            TEXT,
  lock_until       INTEGER NOT NULL DEFAULT 0, -- one copy step at a time (two open tabs must not copy twice)
  created_at       INTEGER NOT NULL,
  finished_at      INTEGER
);
CREATE INDEX storage_migrations_event ON storage_migrations(event_id, created_at);

-- Google album created in the target account for each event album (created lazily during the copy).
CREATE TABLE storage_migration_albums (
  job_id          TEXT NOT NULL,
  album_id        TEXT NOT NULL,
  google_album_id TEXT NOT NULL,
  album_url       TEXT,
  PRIMARY KEY (job_id, album_id)
);

-- Copy attempts that failed for an item, so one broken file can't block the move forever.
ALTER TABLE media ADD COLUMN move_failures INTEGER NOT NULL DEFAULT 0;
