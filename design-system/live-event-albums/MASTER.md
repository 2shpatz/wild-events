# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Live Event Albums
**Generated:** 2026-11-03 23:23:52
**Category:** Wedding/Event Planning
**Design Dials:** Motion 7/10 (Standard)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#DB2777` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#F472B6` | `--color-secondary` |
| On Secondary | `#0F172A` | `--color-on-secondary` |
| Accent/CTA | `#A16207` | `--color-accent` |
| On Accent/CTA | `#FFFFFF` | `--color-on-accent` |
| Background | `#FDF2F8` | `--color-background` |
| Foreground | `#831843` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#831843` | `--color-card-foreground` |
| Muted | `#F0EDF4` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border | `#FBCFE8` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#DB2777` | `--color-ring` |

**Color Notes:** Romantic pink + elegant gold [Accent adjusted from #CA8A04]

### Typography

- **Heading Font:** Great Vibes
- **Body Font:** Cormorant Infant
- **Mood:** wedding, romance, elegant, script, invitation, feminine
- **Google Fonts:** [Great Vibes + Cormorant Infant](https://fonts.googleapis.com/css2?family=Cormorant+Infant:wght@300;400;500;600;700&family=Great+Vibes&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Infant:wght@300;400;500;600;700&family=Great+Vibes&display=swap');
```

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #A16207;
  color: #FFFFFF;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #831843;
  border: 2px solid #DB2777;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #FDF2F8;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #DB2777;
  outline: none;
  box-shadow: 0 0 0 3px #DB277720;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Soft UI Evolution

**Keywords:** Evolved soft UI, better contrast, modern aesthetics, subtle depth, accessibility-focused, improved shadows, hybrid

**Best For:** Modern enterprise apps, SaaS platforms, health/wellness, modern business tools, professional, hybrid

**Key Effects:** Improved shadows (softer than flat, clearer than neumorphism), modern (200-300ms), focus visible, measured contrast targets

### Page Pattern

**Pattern Name:** Hero + Testimonials + CTA

- **Conversion Strategy:** Social proof before CTA. Use a concise set of verified testimonials with photo, name, and role. CTA after social proof. Provide previous/next and pause controls; stop rotation on focus, hover, and reduced motion; announce slide position. Previous/next buttons and keyboard controls must expose every slide without dragging.
- **CTA Placement:** Hero (sticky) + Post-testimonials
- **Section Order:** Hero > Problem statement > Solution overview > Testimonials carousel > CTA

---

## Motion

**Stagger List** (Standard) - Trigger: load or scroll | Duration: 300-450ms | Easing: `back.out(1.4)`

```js
gsap.from('.grid-item', { opacity: 0, scale: 0.92, y: 16, duration: 0.4, stagger: { each: 0.06, from: 'start', grid: 'auto' }, ease: 'back.out(1.4)' });
```

**Framework notes:** grid: 'auto' lets GSAP infer rows/columns from a CSS grid layout for a natural wave stagger; Use matchMedia('(prefers-reduced-motion: reduce)') to skip non-essential motion and render the final state immediately

- ✅ Combine with from: 'center' for a bento-grid layout to draw the eye inward first
- ❌ Don't use back.out on dense data tables; the overshoot reads as sloppy on informational UI
- ⚡ Group DOM writes; avoid interleaving layout reads (getBoundingClientRect) between staggered tweens

---

## Anti-Patterns (Do NOT Use)

- ❌ Generic templates
- ❌ No portfolio

### Additional Forbidden Patterns

- ❌ **Emojis as icons** - Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** - All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** - Avoid scale transforms that shift layout
- ❌ **Low contrast text** - Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** - Always use transitions (150-300ms)
- ❌ **Invisible focus states** - Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile

---

## Project Overrides (verified for this product - take precedence over generated sections above)

Generated output was checked against the product (Hebrew, RTL, mobile-first live photo sharing). Changes:

### Language & Direction
- `<html lang="he" dir="rtl">`. Use logical CSS properties only (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`), never `left/right`.
- Directional icons (arrows, chevrons) mirror in RTL; carousel "next" moves to the **left**.

### Typography (Latin-only fonts above are NOT used - they have no Hebrew glyphs)
Verified via `--domain google-fonts` (subset: hebrew):
- **Display / headings:** `Bellefair` (wedding, elegant) · `Suez One` (birthday/party, bold)
- **Body / UI:** `Heebo` 300-800
- Base 16px, line-height 1.6 for Hebrew body text, never < 14px for UI labels.

### Event Themes (CSS variables swapped by `data-theme` on `<html>`)
| Theme | Source query | Primary | On Primary | Accent/CTA | On Accent | Background | Foreground | Display font |
|---|---|---|---|---|---|---|---|---|
| `wedding` | event photo sharing gallery wedding | `#DB2777` | `#FFFFFF` | `#A16207` | `#FFFFFF` | `#FDF2F8` | `#831843` | Bellefair |
| `birthday` | birthday party celebration colorful playful | `#F97316` | `#0F172A` | `#2563EB` | `#FFFFFF` | `#FFF7ED` | `#9A3412` | Suez One |
| `family` (bar/bat mitzvah, brit, family) | family event minimal elegant neutral | `#7C3AED` | `#FFFFFF` | `#EA580C` | `#000000` | `#FAF5FF` | `#4C1D95` | Bellefair |
| `party` (night) | night party celebration dark vibrant | `#4338CA` | `#FFFFFF` | `#7C3AED` | `#FFFFFF` | `#0F172A` | `#FFFFFF` | Suez One |
| `general` | photo gallery dark immersive content-first | `#18181B` | `#FFFFFF` | `#18181B` | `#FFFFFF` | `#FAFAFA` | `#09090B` | Heebo |

Destructive is always `#DC2626` / on `#FFFFFF`.

### Gallery surfaces
Viewing surfaces (gallery, lightbox, slideshow) use a **neutral dark canvas** (`#09090B`, text `#FAFAFA`) with the theme accent only for active controls - "let the photos shine" (gallery override).

### Product-specific component rules
- Guest home: two large, visually separated primary actions - **Upload** and **View**, both the same glass card (owner request 2026-11-09); Upload keeps an accent border + accent icon tile so it still reads as the main action - min height 64px, icon + label, full-width on mobile.
- Every destructive action → `ConfirmDialog` stating exact item count; deleting a whole album requires typing its name.
- Wizards: stepper with progress, Back + Skip where safe, progress persisted (ux: Onboarding / Progress Indicators).
- Upload: per-file progress + overall bar, retry on failure, haptic `navigator.vibrate(10)` on completion where supported (ux: Feedback, Haptic).
- View state (order + display mode) is reflected in the URL query string (override recommendation: "Update URL on state/view changes").
- Motion: Stagger List preset for grid entry (≤ 0.06s each), Floating view uses parallax on decorative/background layers only; all motion gated by `prefers-reduced-motion`.
- Icons: Lucide only. No emoji as icons.

## Site footer (global)
- One `SiteFooter` (`src/components/SiteFooter.tsx`) is rendered in `main.tsx` after the routes. Pages must not add their own footer.
- Contents: privacy · terms · "פותח ע"י **ShpatzAppZ**" (external link to the developer's site, `target=_blank`, `rel=noopener`, `aria-label` says it opens a new window).
- Layout: on mobile there are two centered lines (legal links, then the attribution). From `sm` up it is a single line. Links use `min-h-11` hit areas.
- Tone by route: a light band (`bg-bg`, `text-muted-fg`) by default. A dark band on the event page (`bg-zinc-950/85` over the photo background) and on the gallery (`bg-canvas`).
- Fixed bars must never cover it. Routes with fixed bottom UI add bottom padding in `footerVariant()`: the gallery FAB (`pb-28`) and the upload selection bar (`pb-44`). Every other route uses the `safe-area-inset-bottom` padding.
