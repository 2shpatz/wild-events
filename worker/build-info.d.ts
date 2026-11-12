// Build-time constants from vite.config.ts (buildInfo). Declared for Worker code only, on purpose: the app
// version must not end up in the public JavaScript. The admin screen gets it from /api/admin/updates.

/** package.json version of the code that is running, e.g. "1.2.0". */
declare const __APP_VERSION__: string;
/** Short git commit of the build ("" for ZIP installs). */
declare const __APP_COMMIT__: string;
/** "git" = built by a git-connected platform (Cloudflare Workers Builds); "manual" = deployed from a computer. */
declare const __BUILD_SOURCE__: "git" | "manual";
/** The build fetched the original repo's latest code (scripts/ci-bootstrap.mjs) and may rebuild itself on new versions. */
declare const __AUTO_UPDATE__: boolean;
declare const __BUILT_AT__: string;
/** Where new versions are announced (release-notes.json on GitHub), "" if unknown. */
declare const __UPDATE_FEED_URL__: string;

declare module "virtual:migrations" {
  /** migrations/*.sql in wrangler's order, split into statements at build time. */
  const migrations: { name: string; statements: string[] }[];
  export default migrations;
}
