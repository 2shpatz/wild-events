import type { Env } from "../env";
import { decrypt, encrypt } from "./crypto";

export const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/photoslibrary.appendonly",
  "https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata",
  "https://www.googleapis.com/auth/photoslibrary.edit.appcreateddata",
  "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
  // Non-sensitive scope; enough for about.get(storageQuota). Grants no access to existing Drive files.
  "https://www.googleapis.com/auth/drive.file",
];

/** Only the site admin grants this (so the site can email users from the admin's own Gmail). */
export const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";

const PHOTOS = "https://photoslibrary.googleapis.com/v1";
const PICKER = "https://photospicker.googleapis.com/v1";

export class GoogleError extends Error {
  constructor(
    public status: number,
    public googleStatus: string,
    message: string,
  ) {
    super(message);
  }
  /** Owner must log in again (refresh token revoked / expired). */
  get needsReauth() {
    return this.status === 401 || this.googleStatus === "invalid_grant";
  }
  get storageFull() {
    return /quota|storage|insufficient/i.test(this.message) && this.status !== 429;
  }
}

async function gfetch(url: string, init: RequestInit & { token?: string } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let status = "";
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as any;
      status = body?.error?.status || body?.error || "";
      message = body?.error?.message || body?.error_description || message;
    } catch {
      /* not JSON */
    }
    throw new GoogleError(res.status, String(status), message);
  }
  return res;
}

async function gjson<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  return (await gfetch(url, init)).json() as Promise<T>;
}

// ---------------------------------------------------------------- OAuth client

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

let clientCache: { at: number; value: OAuthClient | null } | null = null;

export function clearClientCache() {
  clientCache = null;
}

export async function getOAuthClient(env: Env): Promise<OAuthClient | null> {
  if (clientCache && Date.now() - clientCache.at < 60_000) return clientCache.value;
  const rows = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('google_client_id','google_client_secret_enc')",
  ).all<{ key: string; value: string }>();
  const map = Object.fromEntries(rows.results.map((r) => [r.key, r.value]));
  let value: OAuthClient | null = null;
  if (map.google_client_id && map.google_client_secret_enc) {
    value = {
      clientId: map.google_client_id,
      clientSecret: await decrypt(env.TOKEN_ENC_KEY, map.google_client_secret_enc),
    };
  }
  clientCache = { at: Date.now(), value };
  return value;
}

export function authUrl(
  client: OAuthClient,
  redirectUri: string,
  state: string,
  loginHint?: string,
  extraScopes: string[] = [],
  prompt = "consent",
) {
  const p = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [...SCOPES, ...extraScopes].join(" "),
    access_type: "offline",
    prompt,
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
}

export async function exchangeCode(client: OAuthClient, code: string, redirectUri: string) {
  return gjson<TokenResponse>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
}

async function refresh(client: OAuthClient, refreshToken: string) {
  return gjson<TokenResponse>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      grant_type: "refresh_token",
    }),
  });
}

/** Withdraws a grant (used when someone is not allowed in, or their account is deleted). Never throws. */
export async function revokeToken(token: string) {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    /* best effort */
  }
}

export async function userInfo(accessToken: string) {
  return gjson<{ sub: string; email: string; name?: string; picture?: string }>(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { token: accessToken },
  );
}

type TokenTable = "owners" | "storage_accounts";

/** Returns a valid access token for a stored Google account, refreshing (and persisting) when needed. */
async function cachedToken(env: Env, table: TokenTable, id: string): Promise<string> {
  const row = await env.DB.prepare(`SELECT refresh_token_enc, access_token_enc, access_expires FROM ${table} WHERE id = ?`)
    .bind(id)
    .first<{ refresh_token_enc: string | null; access_token_enc: string | null; access_expires: number }>();
  if (!row?.refresh_token_enc) throw new GoogleError(401, "invalid_grant", `${table} account not connected`);
  if (row.access_token_enc && row.access_expires > Date.now() + 120_000) {
    return decrypt(env.TOKEN_ENC_KEY, row.access_token_enc);
  }
  const client = await getOAuthClient(env);
  if (!client) throw new GoogleError(500, "not_configured", "Google client not configured");
  try {
    const t = await refresh(client, await decrypt(env.TOKEN_ENC_KEY, row.refresh_token_enc));
    await env.DB.prepare(`UPDATE ${table} SET access_token_enc = ?, access_expires = ? WHERE id = ?`)
      .bind(await encrypt(env.TOKEN_ENC_KEY, t.access_token), Date.now() + t.expires_in * 1000, id)
      .run();
    return t.access_token;
  } catch (e) {
    if (e instanceof GoogleError && (e.googleStatus === "invalid_grant" || e.status === 400)) {
      await env.DB.prepare(`UPDATE ${table} SET refresh_token_enc = NULL, access_token_enc = NULL WHERE id = ?`)
        .bind(id)
        .run();
      throw new GoogleError(401, "invalid_grant", "Google access was revoked or expired");
    }
    throw e;
  }
}

/** The owner's own login account. */
export function ownerToken(env: Env, ownerId: string): Promise<string> {
  return cachedToken(env, "owners", ownerId);
}

/** An extra storage account the owner connected for event photos. */
export function accountToken(env: Env, accountId: string): Promise<string> {
  return cachedToken(env, "storage_accounts", accountId);
}

// ---------------------------------------------------------------- Photos Library

export interface GMediaItem {
  id: string;
  baseUrl?: string;
  productUrl?: string;
  mimeType?: string;
  filename?: string;
  mediaMetadata?: {
    creationTime?: string;
    width?: string;
    height?: string;
    photo?: object;
    video?: { status?: "UNSPECIFIED" | "PROCESSING" | "READY" | "FAILED" };
  };
}

export async function createAlbum(token: string, title: string) {
  return gjson<{ id: string; productUrl: string }>(`${PHOTOS}/albums`, {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ album: { title: title.slice(0, 480) } }),
  });
}

export async function renameAlbum(token: string, albumId: string, title: string) {
  return gjson(`${PHOTOS}/albums/${albumId}?updateMask=title`, {
    method: "PATCH",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title.slice(0, 480) }),
  });
}

/** Single-request upload; body must have a known length. Returns an upload token. */
export async function uploadRaw(token: string, body: BodyInit, mime: string, length?: number) {
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "X-Goog-Upload-Content-Type": mime || "application/octet-stream",
    "X-Goog-Upload-Protocol": "raw",
  };
  if (length !== undefined) headers["Content-Length"] = String(length);
  const res = await gfetch(`${PHOTOS}/uploads`, { method: "POST", token, headers, body });
  return (await res.text()).trim();
}

export async function startResumable(token: string, mime: string, size: number) {
  const res = await gfetch(`${PHOTOS}/uploads`, {
    method: "POST",
    token,
    headers: {
      "Content-Length": "0",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Content-Type": mime || "application/octet-stream",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Raw-Size": String(size),
    },
  });
  const url = res.headers.get("X-Goog-Upload-URL");
  if (!url) throw new GoogleError(502, "no_upload_url", "Google did not return an upload URL");
  return { url, granularity: Number(res.headers.get("X-Goog-Upload-Chunk-Granularity") || 262144) };
}

/** Uploads one chunk of a resumable session. Returns the upload token when finalized. */
export async function uploadChunk(
  token: string,
  url: string,
  body: BodyInit,
  length: number,
  offset: number,
  finalize: boolean,
): Promise<string | null> {
  const res = await gfetch(url, {
    method: "POST",
    token,
    headers: {
      "Content-Length": String(length),
      "X-Goog-Upload-Command": finalize ? "upload, finalize" : "upload",
      "X-Goog-Upload-Offset": String(offset),
    },
    body,
  });
  if (!finalize) return null;
  return (await res.text()).trim();
}

export interface BatchCreateResult {
  uploadToken: string;
  status: { message?: string; code?: number };
  mediaItem?: GMediaItem;
}

export async function batchCreate(
  token: string,
  albumId: string | null,
  items: { uploadToken: string; fileName?: string; description?: string }[],
) {
  const body: any = {
    newMediaItems: items.map((i) => ({
      description: i.description?.slice(0, 900),
      simpleMediaItem: { uploadToken: i.uploadToken, fileName: i.fileName?.slice(0, 250) },
    })),
  };
  if (albumId) body.albumId = albumId;
  const res = await gjson<{ newMediaItemResults: BatchCreateResult[] }>(`${PHOTOS}/mediaItems:batchCreate`, {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.newMediaItemResults || [];
}

export async function addToAlbum(token: string, albumId: string, mediaItemIds: string[]) {
  for (let i = 0; i < mediaItemIds.length; i += 50) {
    await gfetch(`${PHOTOS}/albums/${albumId}:batchAddMediaItems`, {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaItemIds: mediaItemIds.slice(i, i + 50) }),
    });
  }
}

export async function removeFromAlbum(token: string, albumId: string, mediaItemIds: string[]) {
  for (let i = 0; i < mediaItemIds.length; i += 50) {
    await gfetch(`${PHOTOS}/albums/${albumId}:batchRemoveMediaItems`, {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaItemIds: mediaItemIds.slice(i, i + 50) }),
    });
  }
}

/** Fetch fresh media items (base URLs expire after 60 minutes). Max 50 ids per call. */
export async function batchGet(token: string, ids: string[]): Promise<GMediaItem[]> {
  const out: GMediaItem[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const p = new URLSearchParams();
    for (const id of ids.slice(i, i + 50)) p.append("mediaItemIds", id);
    const res = await gjson<{ mediaItemResults?: { mediaItem?: GMediaItem }[] }>(
      `${PHOTOS}/mediaItems:batchGet?${p}`,
      { token },
    );
    for (const r of res.mediaItemResults || []) if (r.mediaItem) out.push(r.mediaItem);
  }
  return out;
}

// ---------------------------------------------------------------- Picker

export interface PickerSession {
  id: string;
  pickerUri: string;
  mediaItemsSet?: boolean;
  expireTime?: string;
  pollingConfig?: { pollInterval?: string; timeoutIn?: string };
}

export interface PickedItem {
  id: string;
  createTime?: string;
  type?: "PHOTO" | "VIDEO" | "TYPE_UNSPECIFIED";
  mediaFile?: {
    baseUrl: string;
    mimeType?: string;
    filename?: string;
    mediaFileMetadata?: { width?: number; height?: number };
  };
}

export async function pickerCreate(token: string) {
  return gjson<PickerSession>(`${PICKER}/sessions`, {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pickingConfig: { maxItemCount: "2000" } }),
  });
}

export async function pickerGet(token: string, id: string) {
  return gjson<PickerSession>(`${PICKER}/sessions/${id}`, { token });
}

export async function pickerList(token: string, sessionId: string, pageToken?: string) {
  const p = new URLSearchParams({ sessionId, pageSize: "100" });
  if (pageToken) p.set("pageToken", pageToken);
  return gjson<{ mediaItems?: PickedItem[]; nextPageToken?: string }>(`${PICKER}/mediaItems?${p}`, { token });
}

export async function pickerDelete(token: string, id: string) {
  try {
    await gfetch(`${PICKER}/sessions/${id}`, { method: "DELETE", token });
  } catch {
    /* best effort */
  }
}

/** Downloads picked media bytes (picker base URLs need the OAuth header). */
export async function pickerDownload(token: string, baseUrl: string, suffix: string) {
  return gfetch(`${baseUrl}${suffix}`, { token });
}

/** Downloads the bytes of an item the app created (Library API base URL; =d photo, =dv video). */
export const mediaDownload = pickerDownload;

// ---------------------------------------------------------------- Drive storage

export interface StorageQuota {
  limit: number | null; // null = unlimited
  usage: number;
}

export async function storageQuota(token: string): Promise<StorageQuota> {
  const res = await gjson<{ storageQuota: { limit?: string; usage?: string } }>(
    "https://www.googleapis.com/drive/v3/about?fields=storageQuota",
    { token },
  );
  return {
    limit: res.storageQuota.limit ? Number(res.storageQuota.limit) : null,
    usage: Number(res.storageQuota.usage || 0),
  };
}

// ---------------------------------------------------------------- Drive files (uploaded songs)
// drive.file only reaches files this app created, which is exactly the music folder and the songs in it.

const DRIVE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

/** Returns the id of the app's music folder, creating it again if it is missing or in the trash. */
export async function driveEnsureFolder(token: string, folderId: string | null, name: string): Promise<string> {
  if (folderId) {
    try {
      const f = await gjson<{ id: string; trashed?: boolean }>(`${DRIVE}/files/${encodeURIComponent(folderId)}?fields=id,trashed`, { token });
      if (!f.trashed) return f.id;
    } catch (e) {
      if (!(e instanceof GoogleError && e.status === 404)) throw e;
    }
  }
  const f = await gjson<{ id: string }>(`${DRIVE}/files?fields=id`, {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
  });
  return f.id;
}

/** Streams a file into Drive (resumable session, single PUT). Body must have exactly `size` bytes. */
export async function driveUpload(
  token: string,
  file: { name: string; mime: string; size: number; folderId: string; body: ReadableStream | ArrayBuffer },
): Promise<string> {
  const start = await gfetch(`${DRIVE_UPLOAD}/files?uploadType=resumable&fields=id`, {
    method: "POST",
    token,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": file.mime,
      "X-Upload-Content-Length": String(file.size),
    },
    body: JSON.stringify({ name: file.name, mimeType: file.mime, parents: [file.folderId] }),
  });
  const session = start.headers.get("Location");
  if (!session) throw new GoogleError(502, "no_upload_url", "Drive did not return an upload URL");
  const res = await gfetch(session, {
    method: "PUT",
    headers: { "Content-Type": file.mime, "Content-Length": String(file.size) },
    body: file.body,
  });
  const out = (await res.json()) as { id?: string };
  if (!out.id) throw new GoogleError(502, "no_file_id", "Drive did not return a file id");
  return out.id;
}

/** File bytes; the Range header (if any) is passed through, so the response may be 206. */
export function driveMedia(token: string, fileId: string, range?: string | null) {
  const headers: Record<string, string> = {};
  if (range) headers.Range = range;
  return gfetch(`${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media`, { token, headers });
}

export async function driveDelete(token: string, fileId: string) {
  try {
    await gfetch(`${DRIVE}/files/${encodeURIComponent(fileId)}`, { method: "DELETE", token });
  } catch (e) {
    if (!(e instanceof GoogleError && e.status === 404)) throw e;
  }
}

// ---------------------------------------------------------------- Google Sheets (the guest list sheet)
// drive.file is enough for spreadsheets this app created. The Sheets API must be enabled in the Cloud project.

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

export type SheetTab = { sheetId: number; title: string };
export type CellValue = string | number | boolean;

/** True when Google says the Sheets API is not enabled in the site's Cloud project. */
export const sheetsDisabled = (e: unknown) =>
  e instanceof GoogleError && e.status === 403 && /SERVICE_DISABLED|has not been used|is disabled|accessNotConfigured/i.test(`${e.googleStatus} ${e.message}`);

export async function sheetsCreate(token: string, title: string, tabs: { sheetId: number; title: string }[]) {
  return gjson<{ spreadsheetId: string; spreadsheetUrl: string }>(`${SHEETS}?fields=spreadsheetId,spreadsheetUrl`, {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title, locale: "iw_IL" },
      sheets: tabs.map((t) => ({ properties: { sheetId: t.sheetId, title: t.title, rightToLeft: true, gridProperties: { frozenRowCount: 1 } } })),
    }),
  });
}

export async function sheetsTabs(token: string, id: string): Promise<SheetTab[]> {
  const r = await gjson<{ sheets?: { properties: SheetTab }[] }>(`${SHEETS}/${encodeURIComponent(id)}?fields=sheets.properties(sheetId,title)`, { token });
  return (r.sheets ?? []).map((s) => s.properties);
}

/** A1 range on a tab whatever its name ('my tab'!A1:ZZ). */
export const a1 = (tab: string, range: string) => `'${tab.replace(/'/g, "''")}'!${range}`;

export async function sheetsRead(token: string, id: string, range: string): Promise<CellValue[][]> {
  const r = await gjson<{ values?: CellValue[][] }>(
    `${SHEETS}/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    { token },
  );
  return r.values ?? [];
}

/** Writes several ranges in one call (RAW: "050..." stays text, numbers stay numbers). */
export async function sheetsWrite(token: string, id: string, data: { range: string; values: CellValue[][] }[]) {
  await gfetch(`${SHEETS}/${encodeURIComponent(id)}/values:batchUpdate`, {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
}

export async function sheetsClear(token: string, id: string, ranges: string[]) {
  if (!ranges.length) return;
  await gfetch(`${SHEETS}/${encodeURIComponent(id)}/values:batchClear`, {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ranges }),
  });
}

export async function sheetsBatch(token: string, id: string, requests: unknown[]) {
  if (!requests.length) return;
  await gfetch(`${SHEETS}/${encodeURIComponent(id)}:batchUpdate`, {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
}

/** Lets another Google account edit a file this app created (no notification email). */
export async function driveShare(token: string, fileId: string, email: string) {
  await gfetch(`${DRIVE}/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false`, {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "writer", type: "user", emailAddress: email }),
  });
}
