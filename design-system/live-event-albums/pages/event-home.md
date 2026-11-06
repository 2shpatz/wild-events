# Event Home (the event's page) - Page Overrides

> Overrides MASTER.md (including its "Project Overrides" section). Pattern: skill "Event/Conference Landing"
> (hero carries date + location, CTA sticky + repeated at the end), adapted so photo sharing is the main job.

## Section order
1. Hero: header image, title, subtitle, invitation-style date, time + static countdown, venue (tap = scroll to details),
   then the hosts' welcome message (glass quote card). No action buttons in the hero (user decision 2026-11-06).
2. Invitation image (optional, asset `inv`, uploaded by the host): white "paper" card, tap opens a full-screen
   native `<dialog>` (X / Esc / backdrop close). Sits above the event details (user decision 2026-11-06).
3. Event details (only when date/time/venue exist): when, where, navigation (Waze highlighted, Google Maps, Apple Maps),
   share address (WhatsApp + Web Share / copy), add to calendar (Google link + .ics).
4. Hosts' featured photos.
5. Live album strip (moved to the end, user decision 2026-11-06): newest 6 (mobile) / 8 (tablet) / 12 (desktop)
   thumbnails from `/api/e/:code/latest`, refresh 30s while visible, live count in the subtitle,
   closing with the two big Upload / View cards. No separate "מה תרצו לעשות?" section.

## Rules
- Mobile: sticky bottom action bar (Upload / Album) after the hero, inside safe-area; hidden while the big Upload / View cards are on screen.
  The top header bar (header image) stays; its action buttons show from `sm` up only.
- No embedded maps / third-party scripts - navigation is plain links. Brand names as text labels with lucide icons (no logos, no emoji).
- Countdown is static text (no ticking animation). Reduced motion renders final states.
- Labels must not wrap in 2-column button grids at 375px (`whitespace-nowrap`, 15px text on narrow screens).
- Text over the background always on a scrim / glass card (contrast ≥ 4.5:1).
