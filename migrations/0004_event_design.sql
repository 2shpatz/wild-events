-- Flexible design of the guest page: hero styling + blocks before/after it (JSON, see shared/design.ts).
-- NULL = the default layout. Image blocks store their pictures in event_assets as kind 'i0'..'i9'.
ALTER TABLE events ADD COLUMN design TEXT;
