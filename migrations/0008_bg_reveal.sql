-- Optional extra scroll at the end of the guest page that reveals the whole background image (off by default).
ALTER TABLE events ADD COLUMN bg_reveal INTEGER NOT NULL DEFAULT 0;
