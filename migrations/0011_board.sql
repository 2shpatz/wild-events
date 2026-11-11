-- Message board ("לוח ברכות") and checklist page elements (see shared/design.ts).
-- Guests are known by the name they typed + their random device id (no Google album is created for this).
-- The rows stay when the element is removed from the page, so adding it back brings the content back.
CREATE TABLE event_messages (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL,
  name       TEXT NOT NULL,
  body       TEXT NOT NULL,
  device_id  TEXT NOT NULL,             -- only the sending device may delete it (hosts may delete any)
  created_at INTEGER NOT NULL
);
CREATE INDEX event_messages_event ON event_messages(event_id, created_at);

CREATE TABLE checklist_items (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL,
  text       TEXT NOT NULL,
  position   INTEGER NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  done_by    TEXT,                      -- name of who ticked it (null when a host did)
  done_at    INTEGER,
  added_by   TEXT,                      -- name of the guest who added it (null = the hosts)
  device_id  TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX checklist_items_event ON checklist_items(event_id, position);
