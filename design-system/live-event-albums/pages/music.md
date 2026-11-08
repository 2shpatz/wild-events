# Background music - player (guest pages) + "מוזיקה" tab (manage) - Page Overrides

> Overrides MASTER.md. Skill checks used: ux "Auto-Play Video" (click-to-play, always-visible pause),
> "Auto-Rotating Content Controls" (prev / next / play-pause), "Focus States"; icons "icon button accessible label".

## Guest player (`src/components/music/`)
- Mounted once in `main.tsx` outside the routes: music continues between `/:code`, `/:code/upload`, `/:code/gallery`.
  Not shown on manage / admin / app pages, in the design preview iframe, or in gallery immersive mode.
- Position: fixed, top inline-start corner (`start-3`, `top: safe-area + 0.5rem`), `z-40` - above the top bars (z-30),
  below the UploadDock (z-50, centered) and toasts. Sets `--music-inset` so `EventHeader` and the EventHome top bar
  pad their inline start and never sit under it.
- Collapsed: 44px round frosted button (zinc-950/75 + blur, white ring). `Music2` icon; animated equalizer bars while
  playing (frozen under reduced motion); accent-colored pulse ring while auto start waits for the first tap.
- Expanded (tap): pill opens toward the inline end with the track title + artist (credit), then
  `SkipBack | Play/Pause | SkipForward` in LTR order (media-control convention, not mirrored), and an `X` in place of the icon.
  Auto-collapses after 6s idle; Escape / tap outside collapse at once.
- Audio rules: no sound before a user gesture; auto start (owner option) arms on the first click / touchend / keydown.
  Pauses while any `<video>` plays and while the tab is hidden; resumes afterwards.
- Per device + event memory (`localStorage music:<code>`): stopped stays stopped on the next visit; otherwise the next
  visit resumes the same song and position on the first tap.
- All icon buttons have Hebrew `aria-label`s; the toggle has `aria-expanded`; title is `aria-live="polite"`.

## Manage tab "מוזיקה"
- Card 1: toggles (music on, auto start with a plain explanation, shuffle) + the event playlist
  (preview, title, artist / "שיר שהעליתם", duration, move up / down, remove - no drag). Empty state offers the
  suggested tracks for the event type.
- Card 2: built-in library, mood chips (radiogroup, 44px) "מומלץ ל..." / שמח / רגוע / רומנטי / מסיבה / ילדים, with preview + "הוספה".
  License credit line under the list.
- Card 3: "השירים שלי" - upload MP3 / M4A (20MB each, 30 per event) to the owner's Google Drive, progress bar,
  rename inline, delete with confirm, add to playlist. Copyright note.
- Settings + playlist are a draft with a sticky save bar ("שמירת המוזיקה", discard, unsaved status, `beforeunload` guard).
  Uploads / renames / deletes apply at once. One preview plays at a time.
