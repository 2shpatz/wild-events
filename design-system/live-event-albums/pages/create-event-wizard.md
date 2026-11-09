# Create Event Wizard (owner) - Page Overrides

> Overrides MASTER.md (including its "Project Overrides" section). Generated sections referencing conference layouts (speakers/sponsors) were not applicable and were replaced after verification.

## Layout
- Full-screen steps on mobile; event type cards with illustration; live theme preview pane on desktop
- Final step: QR + WhatsApp share + download + copy link

## Color
- Preview applies selected theme tokens live

## Notes
- Original quality selection opens warning modal with storage estimate
- Navigation: update URL on state/view changes.
- Storage step (before create): choose the Google account per event. Recommended green card for a dedicated new account (signup link + connect). Account radio cards with usage bars and "room for ~N photos". Choosing the personal account shows a red destructive alert + required acknowledgment checkbox. Connecting leaves the page, so the draft is saved (sessionStorage + IndexedDB) and restored on return.
