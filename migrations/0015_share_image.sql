-- The picture shown in the preview of the event link (WhatsApp, social networks). NULL = the main page's header
-- image when there is one, otherwise the site logo; 'logo' = always the site logo.
ALTER TABLE events ADD COLUMN share_image TEXT;
