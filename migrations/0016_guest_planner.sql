-- The hosts' event planner ("רשימת אורחים"): guest list + RSVP, seating chart, gifts, vendors and expenses.
-- Shapes of the JSON columns are in shared/guests.ts (sanitized there, on both sides).
-- Rows are soft-deleted (deleted_at) so an undo can bring them back; the daily job purges them after 30 days.

-- One row per event: settings (sides, circles, extra columns, RSVP texts, budget), the floor plan, and the
-- link to the Google Sheet. version grows on every change (the planner page polls it).
CREATE TABLE guest_planner (
  event_id        TEXT PRIMARY KEY,
  config          TEXT NOT NULL,
  floor           TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  sheet_id        TEXT,
  sheet_url       TEXT,
  sheet_synced_at INTEGER,
  sheet_error     TEXT,
  sheet_dirty     INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX guest_planner_dirty ON guest_planner(sheet_dirty) WHERE sheet_dirty = 1;

-- One row = one invitation (a family / household) = one row in the Google Sheet.
CREATE TABLE households (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL,
  rsvp_token TEXT NOT NULL,          -- the personal RSVP link /<event>/r/<token>
  data       TEXT NOT NULL,          -- names, phone, side, circle, counts, status, meals, gift, seats, extra columns
  sort       REAL NOT NULL,
  snapshot   TEXT,                   -- the row's cells as last synced with the Google Sheet (3-way merge)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX households_event ON households(event_id, sort);
CREATE UNIQUE INDEX households_token ON households(rsvp_token);

-- Every RSVP answer / status change (history in the guest card, replies-over-time on the dashboard).
CREATE TABLE rsvp_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id     TEXT NOT NULL,
  household_id TEXT NOT NULL,
  at           INTEGER NOT NULL,
  by           TEXT NOT NULL,        -- 'guest' | 'host' | 'sheet'
  status       TEXT NOT NULL,
  coming       INTEGER NOT NULL
);
CREATE INDEX rsvp_log_event ON rsvp_log(event_id, at);

-- Vendors ("נותני שירות") and expenses (with their payment schedule), kind = 'vendor' | 'expense'.
CREATE TABLE planner_records (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL,
  kind       TEXT NOT NULL,
  data       TEXT NOT NULL,
  sort       REAL NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX planner_records_event ON planner_records(event_id, kind, sort);
