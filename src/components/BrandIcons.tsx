// Multicolor / brand glyphs for the navigation and calendar buttons (decorative: the button text names the app).

/** Google Maps pin (2020 app icon). */
export function GoogleMapsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 92.3 132.3" className={className} aria-hidden>
      <path fill="#1a73e8" d="M60.2 2.2C55.8.8 51 0 46.1 0 32 0 19.3 6.4 10.8 16.5l21.8 18.3L60.2 2.2z" />
      <path fill="#ea4335" d="M10.8 16.5C4.1 24.5 0 34.9 0 46.1c0 8.7 1.7 15.7 4.6 22l28-33.3-21.8-18.3z" />
      <path fill="#4285f4" d="M46.2 28.5c9.8 0 17.7 7.9 17.7 17.7 0 4.3-1.6 8.3-4.2 11.4 0 0 13.9-16.6 27.5-32.7-5.6-10.8-15.3-19-27-22.7L32.6 34.8c3.3-3.8 8.1-6.3 13.6-6.3" />
      <path fill="#fbbc04" d="M46.2 63.8c-9.8 0-17.7-7.9-17.7-17.7 0-4.3 1.5-8.3 4.1-11.3l-28 33.3c4.8 10.6 12.8 19.2 21 29.9l34.1-40.5c-3.3 3.9-8.1 6.3-13.5 6.3" />
      <path fill="#34a853" d="M59.1 109.2c15.4-24.1 33.3-35 33.3-63 0-7.7-1.9-14.9-5.2-21.3L25.6 98c2.6 3.4 5.3 7.3 7.9 11.3 9.4 14.5 6.8 23.1 12.8 23.1s3.4-8.7 12.8-23.2" />
    </svg>
  );
}

/** Apple logo (Simple Icons, CC0) - Apple Maps button. */
export function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

/** Google Calendar (2020 app icon): colored frame, folded corner, "31". */
export function GoogleCalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden>
      <g transform="translate(3.75 3.75)">
        <path fill="#fff" d="M148.882 43.618l-47.368-5.263-57.895 5.263-5.264 52.632 5.263 52.632 52.632 6.579 52.632-6.579 5.263-53.947z" />
        <text x="96.25" y="128" textAnchor="middle" fill="#1a73e8" fontFamily="Roboto, Arial, sans-serif" fontWeight="700" fontSize="78" direction="ltr">
          31
        </text>
        <path fill="#ea4335" d="M148.882 196.25l47.368-47.368-23.684-10.526-23.684 10.526-10.526 23.684z" />
        <path fill="#34a853" d="M33.092 172.566l10.526 23.684h105.263v-47.368H43.618z" />
        <path fill="#4285f4" d="M11.974-3.75C3.25-3.75-3.75 3.25-3.75 11.974v136.908l23.684 10.526 23.684-10.526V43.618h105.263l10.526-23.684L148.882-3.75z" />
        <path fill="#188038" d="M-3.75 148.882v31.579c0 8.724 7.066 15.789 15.789 15.789h31.579v-47.368z" />
        <path fill="#fbbc04" d="M148.882 43.618v105.263h47.368V43.618l-23.684-10.526z" />
        <path fill="#1967d2" d="M196.25 43.618V11.974c0-8.724-7.066-15.789-15.789-15.789h-31.579v47.368z" />
      </g>
    </svg>
  );
}
