# Site Admin (/admin) - Page Overrides

> Overrides MASTER.md (including its "Project Overrides" section). Written by hand from verified searches (2026-11-12), not generated.

## Layout
- Centered column `max-w-5xl`; header (logo + "האירועים שלי"), title, banners, then a 5-tab `tablist`: משתמשים · ממתינים · ארכיון · עדכונים · הגדרות. The tab lives in `?tab=` (deep link: `/admin?tab=updates`).
- Mobile (375px): tabs stack icon over label (`grid-cols-5`), counts/dots sit at the top-end corner; from `sm` they are inline.

## Banners (above the tabs, never on their own tab)
- Order: version news, then "email not connected".
- Version news: emerald card = "האתר עודכן לגרסה X" (dismiss = marks it seen); sky card = "יצאה גרסה חדשה". Same Card + `role="status"` pattern as the waitlist banner.
- The same news shows on the owner Dashboard as a card + a dot on "ניהול האתר" (the dot has screen-reader text, never color alone - ux: Contextual Live Badge Updates, Compact Label Semantics).

## Updates tab
- Cards: current version (+ "בדיקה עכשיו") → what the last update brought ("הבנתי") → what's new in versions not installed yet → how this site updates (automatic: toggle + Deploy Hook; built from own copy; or manual steps) → release history in a native `<details>` (no database match for a disclosure pattern; native element is the fallback, keyboard accessible).
- Release notes are plain text only (`dir="auto"`, `whitespace-pre-line`, never HTML). `adminAction` = amber callout "צריך לעשות בגרסה הזו".
- Versions and URLs are LTR islands inside Hebrew: always `<bdi>` (plain spans with Latin next to punctuation reorder badly).
- Deploy Hook field: visible label, `type="url"`, helper text says the URL is secret (ux: Input Labels, Input Types). Saved hooks are only ever shown masked.
- Async actions: button `loading` → toast success/error (ux: Submit Feedback, Loading Indicators). Removing the hook uses `ConfirmDialog`.
- Icon-only buttons: `aria-label` + 44px hit area.

## Never
- Show the app version outside the admin screens (it is not in the public bundle at all).
- Show the setup code, or open the setup wizard from an admin login: the setup code is the proof of hosting (a stolen admin session must not be able to move the admin role or the Google client).
