# Page override: personal RSVP page (`/:code/r/:token`)

The page a family opens from the WhatsApp message. Overrides MASTER.md. Built 2026-11-13.

- Looks like the event: the event's background (`EventBackdrop`), theme and title font (`EventTitle`), a glass card on top (dark backgrounds: `bg-zinc-950/55` + white text, light: `bg-card/90`).
- Greeting with the family name and how many are invited (+ companions' names).
- Three big answer buttons (min 64px, icon + word): מגיעים (green), אולי (amber), לא נוכל להגיע (dark). Selected = filled; the choice is a `radiogroup`.
- Only when coming / maybe: "how many" and "of them kids" steppers (− field +, real number input for keyboards and screen readers), special meals if the hosts ask, then an optional note.
- One primary submit button (xl). After sending: a confirmation sentence with an icon, the table (when the hosts published the seating), and "change answer" while RSVP is open. Closed RSVP shows a plain sentence instead of the form.
- Below: the event's date and place with Waze and add-to-calendar buttons in the apps' colors.
- No music player on this page; no login; nothing about other guests is shown.
