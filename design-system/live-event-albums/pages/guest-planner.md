# Page override: manage screen layout + guest planner ("ניהול האירוע")

Overrides MASTER.md for `/:code/manage` (all pages) and the planner pages. Built 2026-11-13.

## Layout (user rule, 2026-11-13)
- **Main tabs at the top** (header): "עמוד האורחים" (share + QR, design, music), "תמונות ואלבומים" (photos, albums), "ניהול האירוע" (dashboard, guests, RSVP, seating, gifts, vendors, expenses, settings). On phones the three tabs share the width, text only (no icon), 15px bold.
- **Sub-pages: icon-only rail on the inline-start side (right in RTL)**, sticky, 64px (72px from `sm`). Each icon is a 48px button with `aria-label` = page name, `aria-current="page"` when active, and a tooltip on hover AND keyboard focus (`group-focus-visible`). Active = filled primary.
- **Every page starts with a title row**: icon tile + H1 + one sentence that says what the page is for (`PAGES` in `src/routes/Manage.tsx`).
- The page lives in the URL (`?tab=<page>`; old ids keep working). Page changes push history (phone back button returns).
- `overflow-x-clip` on the screen root: a carousel's `scrollIntoView` must not shift the whole page sideways on phones.
- Wide pages (seating, guests, design) use the full width next to the rail; the rest cap at `max-w-5xl`.

## Planner components
- Stat tiles: label (14px, muted) + 30px tabular number + sub-line. Status tones use text color AND label, never color alone.
- Warnings ("מה דורש טיפול"): critical / warning / info rows, each with an icon, an sr-only level word, the sentence, and an action link to the page that fixes it.
- Seat meter = bullet chart: track = chairs, fill = seated, marker = people to seat, plus a written sentence and a legend (dataviz skill: "performance vs target").
- Breakdown bars (by side / circle): track = invited, fill = confirmed, both numbers written beside the bar; tag dot + name identify the row.
- Replies over time: thin columns, 4px rounded tops, tooltip per column, `role="img"` with the full series in the label.
- Tag colors: `TAG_COLORS` in `shared/guests.ts`. The first 8 passed `validate_palette.js` in light mode (CVD 6.9 = legal band because a tag is ALWAYS shown with its name). Status colors (green / amber / red / slate) are reserved for RSVP status.
- Tables (guest list): sticky header, 44px+ controls in cells, inline edit for status / counts / side / circle, name opens the full card. Phones get cards instead of a table. Bulk bar is sticky at the bottom. Lists render 150 rows then "show more" (no virtualization library).
- Destructive actions: `ConfirmDialog` with counts; quick undo bar after deleting invitations; the seating map has its own undo (Ctrl+Z / button).
- Settings use a draft + sticky save bar (renaming tags would otherwise save on every key).

## Seating map
- SVG, floor units = cm, 10cm snap grid, pan by dragging the empty floor, wheel / pinch / buttons to zoom, "fit".
- **No drag-only interaction**: families are seated by tap-to-pick then tap-a-table, by drag (desktop), from the table inspector's select, or in the list view. Items move with arrow keys (Shift = 50cm), R rotates, Delete removes. List view is a full alternative to the map.
- Chairs are drawn around each shape; filled chairs take the family's color (by side / circle / status), empty chairs are outlined. An over-full table gets a red ring and a red "n/seats".
- Labels stay upright whatever the rotation.
- Printouts open their own clean RTL A4 document (map with inlined colors, list per table, A-Z entrance list, table cards).

## Accessibility notes
- Phone numbers and emails are `dir="ltr"` / `<bdi>`.
- Icon-only buttons always have `aria-label` + `title`.
- Live counts use `role="status"` sentences, not bare numbers.
