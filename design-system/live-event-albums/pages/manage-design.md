# Manage - Design tab ("עיצוב") - Page Overrides

> Overrides MASTER.md (including its "Project Overrides" section). Skill checks used: ux "Dragging Movements"
> (single-pointer alternative), "Touch Target Size", "Mobile First"; google-fonts (subset: hebrew) for the font list.

## Tab content (in order)
1. ערכת נושא ורקע - event type + background (draft, saved with its own button).
2. עיצוב גמיש - the flexible page editor (below).
3. עמוד הכניסה לאורחים - header image, invitation image, featured photos, welcome text (images save immediately).

The guest page button in the manage header opens in a new tab (`target=_blank`, aria-label says so).

## Flexible design editor
- Model: `shared/design.ts`. The main page (hero) is fixed; blocks live in `before` / `after` lists.
  Blocks: text, image (repeatable), event details, featured photos, invitation, live album (once each).
- Live preview = the real guest page in an iframe (`/<code>?preview=design`), draft streamed by postMessage.
  Clicking anything in the preview selects it (no navigation inside the preview). Phone (390x844) / desktop (1280x800) frames, scaled to fit.
- Structure list: "לפני העמוד הראשי" / "העמוד הראשי" (fixed row) / "אחרי העמוד הראשי". Reorder with
  Move up / Move down buttons (crossing the main page is allowed). No drag-only interactions.
- Hero editing: title font, size (md / lg / xl), title color, text color, date style
  (הזמנה / שורה / מספרים / תאריך עברי with gematria / לועזי + עברי), show/hide toggles, and the title font for the other pages
  (default: same as the main title).
- Font picker: ◀ name ▶ stepper (RTL: "next" is on the left; ←/→ keys) swaps the font live in the preview;
  search, "רק גופנים עם עברית" filter (on by default), list rendered in each font (glyph subsets lazy-loaded with `&text=`).
- Colors: theme default, 10 swatches, native color picker; inline warning under 3:1 (titles) / 4.5:1 (text).
- Nothing reaches guests until "שמירת העיצוב" (sticky save bar with discard + unsaved status, `beforeunload` guard).

## Responsive
- `lg+`: two columns - editing panel and a sticky phone preview. Desktop-frame preview goes full width above the panel.
- Below `lg`: Segmented "עריכה / תצוגה מקדימה". Tapping an element in the preview switches back to editing it.
- Mobile font tuning mode ("לדפדף בגופנים על הדף עצמו"): full-screen preview with a bottom bar (◀ font ▶, ביטול, שמירה)
  inside the safe areas; page scroll locked behind it.
- All controls >= 44px, 8px gaps, Lucide icons only, logical properties only.
