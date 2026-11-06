-- Event page details: time, venue and address (shown with navigation links).
ALTER TABLE events ADD COLUMN event_time TEXT;
ALTER TABLE events ADD COLUMN venue_name TEXT;
ALTER TABLE events ADD COLUMN venue_address TEXT;
