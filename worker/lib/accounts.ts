import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { accountToken, GoogleError, ownerToken, revokeToken, storageQuota } from "./google";
import { decrypt } from "./crypto";
import type { StorageAccountDTO, StorageAccountRef, StorageInfo } from "../../shared/types";

/**
 * Where an event's photos live. "self" = the Google account the owner logs in with,
 * anything else = a row of storage_accounts (an extra account connected only for storage).
 */
export type AccountRef = string;
export const SELF = "self";

export const STORAGE_ALERT = 0.8;
const STORAGE_TTL = 10 * 60_000;

export const eventRef = (ev: { storage_account_id?: string | null }): AccountRef => ev.storage_account_id || SELF;

/** Access token for the account behind a ref (the owner's own account for "self"). */
export function tokenForRef(env: Env, ownerId: string, ref: AccountRef | null | undefined): Promise<string> {
  return !ref || ref === SELF ? ownerToken(env, ownerId) : accountToken(env, ref);
}

/** Token of the account that currently receives the event's new photos and albums. */
export function eventToken(env: Env, ev: { owner_id: string; storage_account_id?: string | null }) {
  return tokenForRef(env, ev.owner_id, eventRef(ev));
}

interface AccountRow {
  id: string;
  owner_id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  refresh_token_enc: string | null;
  storage_json: string | null;
  storage_checked: number;
  drive_music_folder: string | null;
}

/** The table + row id that stores a ref's tokens, storage cache and music folder. */
function locate(ownerId: string, ref: AccountRef) {
  return ref === SELF ? { table: "owners" as const, id: ownerId } : { table: "storage_accounts" as const, id: ref };
}

async function loadRow(env: Env, ownerId: string, ref: AccountRef): Promise<AccountRow | null> {
  const { table, id } = locate(ownerId, ref);
  const extra = table === "owners" ? "id AS owner_id" : "owner_id";
  return env.DB.prepare(
    `SELECT id, ${extra}, email, name, picture, refresh_token_enc, storage_json, storage_checked, drive_music_folder FROM ${table} WHERE id = ?`,
  )
    .bind(id)
    .first<AccountRow>();
}

export async function accountInfo(env: Env, ownerId: string, ref: AccountRef): Promise<StorageAccountRef> {
  const row = await loadRow(env, ownerId, ref);
  return { id: ref, email: row?.email ?? null, personal: ref === SELF, connected: !!row?.refresh_token_enc };
}

/** Storage quota of an account (cached for 10 minutes in its row). */
export async function accountStorage(env: Env, ownerId: string, ref: AccountRef, fresh = false): Promise<StorageInfo> {
  const row = await loadRow(env, ownerId, ref);
  if (!row) throw new HTTPException(404, { message: "account_not_found" });
  const { table, id } = locate(ownerId, ref);
  let q = row.storage_json ? (JSON.parse(row.storage_json) as { limit: number | null; usage: number }) : null;
  let checkedAt = row.storage_checked ?? 0;
  if (!q || fresh || Date.now() - checkedAt > STORAGE_TTL) {
    q = await storageQuota(await tokenForRef(env, ownerId, ref));
    checkedAt = Date.now();
    await env.DB.prepare(`UPDATE ${table} SET storage_json = ?, storage_checked = ? WHERE id = ?`)
      .bind(JSON.stringify(q), checkedAt, id)
      .run();
  }
  const percent = q.limit ? q.usage / q.limit : null;
  return {
    limit: q.limit,
    usage: q.usage,
    percent,
    alert: percent !== null && percent >= STORAGE_ALERT,
    checkedAt,
    account: { id: ref, email: row.email, personal: ref === SELF, connected: !!row.refresh_token_enc },
  };
}

/** Free bytes in the account (null = unlimited or unknown). */
export async function freeBytes(env: Env, ownerId: string, ref: AccountRef): Promise<number | null> {
  try {
    const s = await accountStorage(env, ownerId, ref, true);
    return s.limit === null ? null : Math.max(0, s.limit - s.usage);
  } catch {
    return null;
  }
}

/** Throws unless the ref is the owner's own account or one of their connected storage accounts. */
export async function assertOwnAccount(env: Env, ownerId: string, ref: string | undefined | null): Promise<AccountRef> {
  if (!ref || ref === SELF) return SELF;
  const row = await env.DB.prepare("SELECT refresh_token_enc FROM storage_accounts WHERE id = ? AND owner_id = ?")
    .bind(ref, ownerId)
    .first<{ refresh_token_enc: string | null }>();
  if (!row) throw new HTTPException(400, { message: "bad_account" });
  if (!row.refresh_token_enc) throw new HTTPException(409, { message: "account_disconnected" });
  return ref;
}

/** The owner's own account first, then the storage accounts they connected (oldest first). */
export async function listAccounts(env: Env, ownerId: string, fresh = false): Promise<StorageAccountDTO[]> {
  const extra = await env.DB.prepare("SELECT id FROM storage_accounts WHERE owner_id = ? ORDER BY created_at")
    .bind(ownerId)
    .all<{ id: string }>();
  const counts = await env.DB.prepare(
    "SELECT COALESCE(storage_account_id, 'self') AS ref, COUNT(*) AS n FROM events WHERE owner_id = ? AND deleted = 0 GROUP BY ref",
  )
    .bind(ownerId)
    .all<{ ref: string; n: number }>();
  const byRef = new Map(counts.results.map((r) => [r.ref, r.n]));
  const refs = [SELF, ...extra.results.map((r) => r.id)];
  return Promise.all(
    refs.map(async (ref): Promise<StorageAccountDTO> => {
      const row = await loadRow(env, ownerId, ref);
      let storage: StorageInfo | null = null;
      let connected = !!row?.refresh_token_enc;
      if (connected) {
        try {
          storage = await accountStorage(env, ownerId, ref, fresh);
        } catch (e) {
          // A revoked grant clears the token: the list says "connect again" right away.
          if (e instanceof GoogleError && e.needsReauth) connected = false;
          else console.warn("storage read failed", ref, e);
        }
      }
      return {
        id: ref,
        email: row?.email ?? null,
        name: row?.name ?? null,
        picture: row?.picture ?? null,
        personal: ref === SELF,
        connected,
        storage,
        eventsCount: byRef.get(ref) ?? 0,
      };
    }),
  );
}

/** Revokes Google access and forgets the account. Callers check it holds no events. */
export async function removeAccount(env: Env, accountId: string) {
  const row = await env.DB.prepare("SELECT refresh_token_enc FROM storage_accounts WHERE id = ?")
    .bind(accountId)
    .first<{ refresh_token_enc: string | null }>();
  if (row?.refresh_token_enc) {
    try {
      await revokeToken(await decrypt(env.TOKEN_ENC_KEY, row.refresh_token_enc));
    } catch {
      /* best effort */
    }
  }
  await env.DB.prepare("DELETE FROM storage_accounts WHERE id = ?").bind(accountId).run();
}

export const MUSIC_FOLDER = "אירוע פרוע - מוזיקה";

/** Music folder id in an account's Drive (stored per account). */
export async function musicFolder(env: Env, ownerId: string, ref: AccountRef) {
  return (await loadRow(env, ownerId, ref))?.drive_music_folder ?? null;
}

export async function setMusicFolder(env: Env, ownerId: string, ref: AccountRef, folderId: string) {
  const { table, id } = locate(ownerId, ref);
  await env.DB.prepare(`UPDATE ${table} SET drive_music_folder = ? WHERE id = ?`).bind(folderId, id).run();
}

/** Stops new photo writes while the event moves to another account. */
export function assertNotMigrating(ev: { migrating?: string | null }) {
  if (ev.migrating) throw new HTTPException(409, { message: "migrating" });
}
