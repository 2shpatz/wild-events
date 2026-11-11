-- Checklist deletes can be undone for a short while ("בטל מחיקה"): a deleted item is only marked, and is really
-- removed by the daily cleanup a day later.
ALTER TABLE checklist_items ADD COLUMN deleted_at INTEGER;
