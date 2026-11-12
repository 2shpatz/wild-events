export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** base64 32-byte key for AES-GCM (refresh tokens, client secret). */
  TOKEN_ENC_KEY: string;
  /** random string for HMAC (guest tokens, session ids). */
  SESSION_SECRET: string;
  /** one-time token that unlocks /setup. */
  SETUP_TOKEN: string;
  /** main address (e.g. https://photos.example.com); workers.dev page requests redirect to it. */
  CANONICAL_ORIGIN?: string;
  /** Optional: where to look for new versions instead of the original repository (local testing, own forks). */
  UPDATE_FEED_URL?: string;
}

export type AppVars = {
  ownerId?: string;
  adminEventId?: string;
};

export type AppEnv = { Bindings: Env; Variables: AppVars };
