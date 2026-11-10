-- Import source account: the Google account whose library the Picker shows. NULL = the owner's login
-- account ("self"), so older jobs and linked albums keep working.
ALTER TABLE import_jobs ADD COLUMN source_ref TEXT;
ALTER TABLE albums ADD COLUMN source_account TEXT; -- linked albums: re-sync reads the same account
