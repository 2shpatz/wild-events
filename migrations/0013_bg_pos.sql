-- Framing of the background picture: "x,y,zoom" - focal point in % (CSS background-position) and zoom (1 = cover,
-- up to 3; scaled around the focal point). NULL = centered, no zoom.
ALTER TABLE events ADD COLUMN bg_pos TEXT;
