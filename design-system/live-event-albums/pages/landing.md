# Landing (site home `/`) - page override

Overrides MASTER "Page Pattern" (Hero + Testimonials + CTA). Testimonials stay out: no real ones exist.

**Pattern:** Feature-Rich Showcase (`--domain landing`, id `feature-rich-showcase`):
Hero (value prop) > Feature spotlight > Feature grid > How it works > CTA. CTA in hero + bottom.

## Content rules
- Hero must say plainly that this is the **home of all events** (not a specific event), and give guests
  who arrived here by mistake a hint: open the event link / scan the QR they received.
- **Albums are the #1 feature.** They get their own spotlight section right after the hero, with the
  largest visual weight (2-column text + album-grid illustration). Every other feature sits below in
  a uniform grid of equal cards, so the hierarchy reads albums > everything else.
- Describe only features that exist in the app. No invented numbers, stats or testimonials.
- The album-grid illustration is decorative: `role="img"` + Hebrew `aria-label`, no fake counts.
- Album covers are **real event photos, not icons** (CC0 from StockSnap, sources in
  `src/assets/albums/CREDITS.md`). WebP 4:3, 320w/640w `srcSet`, lazy-loaded, fixed width/height
  (no CLS), `alt=""` because the parent carries the label. Any new cover photo must be CC0/public
  domain or have a license that allows commercial use; add it to CREDITS.md.

## Brand header
- Centered: big logo (`/logo-hero.webp`, 384px, transparent "sticker" of the dancing-couple logo, shown
  144/192px with a drop shadow, no frame), wordmark "אירוע פרוע" underneath.
- App logo source = `design-system/brand/logo-dancing.jpg` (NOT the old `logo.jpg`). All icons come from
  `scripts/generate-icons.py`; it reproduces the shipped icons byte-for-byte. Login link stays small in the top corner.
- Wordmark font: **Rubik Moonrocks** (Google Fonts, hebrew subset; confetti-dot letters = happy + wild).
  Owner rejected Rubik Wet Paint and Rubik Bubbles. Picked from rendered comparisons of ~45 Hebrew fonts
  (`--domain google-fonts`, every hebrew-subset family). Loaded with `&text=` (only the name's letters).
- Wordmark colors follow the logo, not the page theme: fill #3b1d5e (logo purple), white sticker edge,
  lavender #d8c0d8 3D offset, -2deg tilt (`.brand-wordmark` in index.css, em-based so it scales).
  Solid fill beat a purple gradient (gradient was invisible at this size). Logotype: WCAG contrast n/a.
- **Approved base** (owner: "remember this design"): snapshot `design-system/brand/approved/wordmark-moonrocks.css`.
- **Sparkle layer (experiment, additive):** `.brand-sparkle` overlay = gold glitter dots + gold light sweep
  right-to-left (3 passes after load, then stops; ux: no endless decorative loops), plus `<BrandStars/>`:
  6 SVG 4-point stars (gold #ffd166 / white, logo-purple outline) that twinkle 4 times, then rest.
  Reduced motion: final state, no movement. Overlay + stars are `aria-hidden`; the name is read once.
  Revert = delete the `.brand-sparkle` span and `<BrandStars/>` from Landing.tsx.
- Size `clamp(3rem, 14.5vw, 8rem)` + `nowrap`: always one line, from 360px phones to desktop.

## Layout
- Mobile-first: spotlight stacks (text, then illustration); `lg:` two columns.
- Secondary grid: 1 > 2 > 3 columns, 6 equal cards + 1 full-width card (navigation) so no orphan at any breakpoint.
- Heading order h1 > h2 > h3, no skipped levels (ux: Heading Hierarchy).
- Hover: shadow lift only, no scale (MASTER: no layout-shifting hovers). Motion via `Reveal`, which
  already honors `prefers-reduced-motion`.
