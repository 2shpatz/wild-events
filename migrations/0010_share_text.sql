-- The hosts' own WhatsApp/share message for the event link (the link itself is always appended). NULL = the built-in text.
ALTER TABLE events ADD COLUMN share_text TEXT;
