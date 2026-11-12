// The running version of the site and the release notes it was built with.
// Values come from vite.config.ts (buildInfo) at build time; see worker/build-info.d.ts.
import type { ReleaseEntry } from "../../shared/types";
import bundledNotes from "../../release-notes.json";

export const APP = {
  version: __APP_VERSION__,
  commit: __APP_COMMIT__,
  source: __BUILD_SOURCE__,
  /** Rebuilding installs the newest version of the original repository. */
  autoCapable: __AUTO_UPDATE__,
  builtAt: __BUILT_AT__,
};

/** release-notes.json on GitHub (or UPDATE_FEED_URL, for local testing and forks with their own releases). */
export const feedUrl = (env: { UPDATE_FEED_URL?: string }) => env.UPDATE_FEED_URL || __UPDATE_FEED_URL__;

/** "1.2.3" -> [1, 2, 3]; anything else (e.g. "unreleased") -> null. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Negative when a < b, 0 when equal, positive when a > b. Invalid versions sort lowest. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

const MAX_RELEASES = 30;
const MAX_NOTES = 50;

/**
 * Strict reader for release-notes.json (bundled, or downloaded from GitHub). Unknown fields are ignored and
 * entries that aren't released versions (like "unreleased") are skipped, so later formats stay readable.
 * Throws "bad_feed" when the file isn't a release list at all.
 */
export function readReleases(data: unknown): ReleaseEntry[] {
  const d = data as { schema?: unknown; releases?: unknown } | null;
  if (!d || typeof d !== "object" || typeof d.schema !== "number" || d.schema < 1 || !Array.isArray(d.releases)) {
    throw new Error("bad_feed");
  }
  const out: ReleaseEntry[] = [];
  for (const r of d.releases.slice(0, 200)) {
    if (!r || typeof r !== "object") continue;
    const { version, date, notes, adminAction } = r as Record<string, unknown>;
    if (typeof version !== "string" || !parseVersion(version)) continue;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!Array.isArray(notes)) continue;
    const clean = notes
      .filter((n): n is string => typeof n === "string")
      .map((n) => n.trim().slice(0, 500))
      .filter(Boolean)
      .slice(0, MAX_NOTES);
    const entry: ReleaseEntry = { version, date, notes: clean };
    if (typeof adminAction === "string" && adminAction.trim()) entry.adminAction = adminAction.trim().slice(0, 1000);
    out.push(entry);
  }
  out.sort((a, b) => compareVersions(b.version, a.version));
  return out.slice(0, MAX_RELEASES);
}

/** Release notes this copy of the code was built with (works offline). */
export const bundledReleases: ReleaseEntry[] = readReleases(bundledNotes);
