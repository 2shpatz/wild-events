-- Who may use the site (create events). Managed by the site admin (the person who hosts the site).
-- status: 'approved' (may log in) | 'pending' (waitlist) | 'archived' (blocked, event pages offline)
-- source: how they got here - 'manual' (admin added) | 'waitlist' | 'open' (waitlist was off) | 'legacy' | 'admin'
CREATE TABLE members (
  email        TEXT PRIMARY KEY,        -- lowercased
  name         TEXT,
  status       TEXT NOT NULL,
  source       TEXT NOT NULL,
  google_sub   TEXT,
  picture      TEXT,
  requested_at INTEGER,
  approved_at  INTEGER,
  archived_at  INTEGER,
  invited_at   INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX members_status ON members(status);
CREATE UNIQUE INDEX members_sub ON members(google_sub) WHERE google_sub IS NOT NULL;

ALTER TABLE owners ADD COLUMN last_login_at INTEGER;

-- Everyone who already uses the site keeps access.
INSERT OR IGNORE INTO members (email, name, status, source, google_sub, picture, approved_at, created_at)
  SELECT lower(email), name, 'approved', 'legacy', google_sub, picture, created_at, created_at
    FROM owners WHERE email IS NOT NULL;
