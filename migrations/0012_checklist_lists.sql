-- A page may hold several checklists: each item belongs to one (list_id = the checklist block id in events.design).
-- Items from before this migration have no list_id; they belong to the page's first checklist (claimed on the next save).
ALTER TABLE checklist_items ADD COLUMN list_id TEXT;
CREATE INDEX checklist_items_list ON checklist_items(event_id, list_id, position);
