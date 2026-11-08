import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { AlbumDTO, GuestMusic, ManageAlbum, MediaDTO, PlayerTrack, PublicEvent, UploadedTrack } from "../../shared/types";
import { batchGet, createAlbum, ownerToken } from "./google";
import { randomId } from "./crypto";
import { parseDesign } from "../../shared/design";
import { parseMusic, type EventMusic } from "../../shared/music";
import { libraryTrack, libraryUrl } from "../../shared/musicLibrary";
import { deviceTag } from "../../shared/deviceTag";

export interface EventRow {
  id: string;
  owner_id: string;
  code: string;
  title: string;
  subtitle: string | null;
  welcome: string | null;
  event_date: string | null;
  event_time: string | null;
  venue_name: string | null;
  venue_address: string | null;
  type: string;
  theme: string;
  background: string | null;
  quality: string;
  keep_gps: number;
  admin_password_hash: string | null;
  google_album_id: string | null;
  google_album_url: string | null;
  default_view: string;
  default_order: string;
  uploads_open: number;
  design: string | null;
  music: string | null;
  created_at: number;
}

export interface TrackRow {
  id: string;
  event_id: string;
  owner_id: string;
  drive_id: string;
  title: string;
  mime: string;
  size: number;
  duration: number | null;
  created_at: number;
}

export interface AlbumRow {
  id: string;
  event_id: string;
  kind: string;
  name: string;
  name_norm: string;
  google_album_id: string | null;
  created_at: number;
  hidden: number;
  linked: number;
  source_url: string | null;
  synced_at: number;
}

export interface MediaRow {
  id: string;
  event_id: string;
  album_id: string;
  google_id: string;
  kind: string;
  width: number | null;
  height: number | null;
  taken_at: number | null;
  uploaded_at: number;
  base_url: string | null;
  base_url_exp: number;
  processing: number;
  hidden: number;
  device_id: string | null;
}

/** "HH:MM" or null. */
export const cleanTime = (v: unknown) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);

export async function eventByCode(env: Env, code: string): Promise<EventRow> {
  const ev = await env.DB.prepare("SELECT * FROM events WHERE code = ? AND deleted = 0")
    .bind(code.toLowerCase())
    .first<EventRow>();
  if (!ev) throw new HTTPException(404, { message: "event_not_found" });
  return ev;
}

export function normName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function cleanName(name: string, max = 60) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, max);
}

export async function eventAssets(env: Env, eventId: string) {
  const r = await env.DB.prepare("SELECT kind, etag FROM event_assets WHERE event_id = ?")
    .bind(eventId)
    .all<{ kind: string; etag: string }>();
  const bg = r.results.find((a) => a.kind === "bg")?.etag ?? null;
  const header = r.results.find((a) => a.kind === "hd")?.etag ?? null;
  const invitation = r.results.find((a) => a.kind === "inv")?.etag ?? null;
  const featured = r.results
    .filter((a) => /^f\d$/.test(a.kind))
    .map((a) => ({ slot: Number(a.kind.slice(1)), v: a.etag }))
    .sort((a, b) => a.slot - b.slot);
  const images = r.results
    .filter((a) => /^i\d$/.test(a.kind))
    .map((a) => ({ slot: Number(a.kind.slice(1)), v: a.etag }))
    .sort((a, b) => a.slot - b.slot);
  return { bg, header, invitation, featured, images };
}

/** Songs the host uploaded for this event (oldest first). */
export async function eventTracks(env: Env, eventId: string): Promise<UploadedTrack[]> {
  const r = await env.DB.prepare("SELECT id, title, duration, size FROM event_tracks WHERE event_id = ? ORDER BY created_at")
    .bind(eventId)
    .all<{ id: string; title: string; duration: number | null; size: number }>();
  return r.results.map((t) => ({ id: t.id, title: t.title, duration: t.duration, size: t.size }));
}

/** Resolves the saved music settings into the guest player's playlist (null = no player). */
export function guestMusic(code: string, music: EventMusic, uploaded: UploadedTrack[]): GuestMusic | null {
  if (!music.enabled) return null;
  const byId = new Map(uploaded.map((t) => [t.id, t]));
  const tracks = music.tracks.flatMap((ref): PlayerTrack[] => {
    if (ref.src === "lib") {
      const t = libraryTrack(ref.id);
      return t ? [{ key: `lib:${t.id}`, title: t.title, artist: t.artist, url: libraryUrl(t.id) }] : [];
    }
    const t = byId.get(ref.id);
    return t ? [{ key: `up:${t.id}`, title: t.title, artist: null, url: `/api/e/${code}/track/${t.id}` }] : [];
  });
  return tracks.length ? { autoStart: music.autoStart, shuffle: music.shuffle, tracks } : null;
}

export async function toPublicEvent(
  env: Env,
  ev: EventRow,
  opts: { canManage: boolean; isOwner: boolean },
): Promise<PublicEvent> {
  const counts = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM media WHERE event_id = ?1 AND hidden = 0) AS m,
            (SELECT COUNT(*) FROM albums a WHERE a.event_id = ?1 AND a.hidden = 0
               AND EXISTS (SELECT 1 FROM media x WHERE x.album_id = a.id AND x.hidden = 0)) AS a`,
  )
    .bind(ev.id)
    .first<{ m: number; a: number }>();
  const assets = await eventAssets(env, ev.id);
  const music = parseMusic(ev.music, ev.type as PublicEvent["type"]);
  const uploaded = music.enabled && music.tracks.some((t) => t.src === "up") ? await eventTracks(env, ev.id) : [];
  return {
    id: ev.id,
    code: ev.code,
    title: ev.title,
    subtitle: ev.subtitle,
    welcome: ev.welcome,
    date: ev.event_date,
    time: ev.event_time,
    venueName: ev.venue_name,
    venueAddress: ev.venue_address,
    type: ev.type as PublicEvent["type"],
    theme: ev.theme as PublicEvent["theme"],
    background: ev.background,
    bgVersion: ev.background === "custom" ? assets.bg : null,
    headerVersion: assets.header,
    invitationVersion: assets.invitation,
    featured: assets.featured,
    images: assets.images,
    design: parseDesign(ev.design),
    music: guestMusic(ev.code, music, uploaded),
    quality: ev.quality as PublicEvent["quality"],
    keepGps: !!ev.keep_gps,
    defaultView: ev.default_view as PublicEvent["defaultView"],
    defaultOrder: ev.default_order as PublicEvent["defaultOrder"],
    uploadsOpen: !!ev.uploads_open,
    mediaCount: counts?.m ?? 0,
    albumCount: counts?.a ?? 0,
    canManage: opts.canManage,
    isOwner: opts.isOwner,
    googleAlbumUrl: opts.canManage ? ev.google_album_url : undefined,
  };
}

export async function listAlbums(env: Env, eventId: string, includeEmpty = false): Promise<ManageAlbum[]> {
  const rows = await env.DB.prepare(
    `SELECT a.id, a.name, a.kind, a.google_album_id, a.linked, a.source_url, a.synced_at,
            (SELECT COUNT(*) FROM media m WHERE m.album_id = a.id AND m.hidden = 0) AS count,
            (SELECT m.id FROM media m WHERE m.album_id = a.id AND m.hidden = 0 AND m.kind = 'photo'
               ORDER BY m.uploaded_at DESC LIMIT 1) AS cover
       FROM albums a WHERE a.event_id = ? AND a.hidden = 0
      ORDER BY CASE a.kind WHEN 'host' THEN 0 WHEN 'custom' THEN 1 ELSE 2 END, a.created_at`,
  )
    .bind(eventId)
    .all<{
      id: string;
      name: string;
      kind: string;
      google_album_id: string | null;
      linked: number;
      source_url: string | null;
      synced_at: number;
      count: number;
      cover: string | null;
    }>();
  return rows.results
    .filter((r) => includeEmpty || r.count > 0)
    .map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind as AlbumDTO["kind"],
      count: r.count,
      cover: r.cover,
      googleAlbumId: r.google_album_id,
      link: r.linked ? { sourceUrl: r.source_url, syncedAt: r.synced_at } : null,
    }));
}

export function toMediaDTO(r: MediaRow): MediaDTO {
  const valid = r.base_url && r.base_url_exp > Date.now() + 60_000;
  return {
    id: r.id,
    album: r.album_id,
    kind: r.kind as MediaDTO["kind"],
    w: r.width || 1600,
    h: r.height || 1200,
    takenAt: r.taken_at || r.uploaded_at,
    uploadedAt: r.uploaded_at,
    url: valid ? r.base_url : null,
    exp: valid ? r.base_url_exp : 0,
    processing: !!r.processing,
    by: deviceTag(r.device_id),
  };
}

const URL_TTL = 55 * 60_000;
const MAX_REFRESH_PER_REQUEST = 250; // keeps CPU time & subrequests within the free plan

/**
 * Ensures media rows have a fresh Google base URL. Refreshes at most MAX_REFRESH_PER_REQUEST
 * items (newest first); the client lazily requests the rest via /urls.
 */
export async function ensureUrls(env: Env, ownerId: string, rows: MediaRow[]): Promise<MediaRow[]> {
  const now = Date.now();
  const stale = rows.filter((r) => !r.base_url || r.base_url_exp < now + 5 * 60_000).slice(0, MAX_REFRESH_PER_REQUEST);
  if (!stale.length) return rows;
  const token = await ownerToken(env, ownerId);
  const fresh = await batchGet(
    token,
    stale.map((r) => r.google_id),
  );
  const byGoogle = new Map(fresh.map((m) => [m.id, m]));
  const stmts: D1PreparedStatement[] = [];
  for (const r of stale) {
    const g = byGoogle.get(r.google_id);
    if (!g?.baseUrl) continue;
    r.base_url = g.baseUrl;
    r.base_url_exp = now + URL_TTL;
    const vs = g.mediaMetadata?.video?.status;
    r.processing = vs && vs !== "READY" ? 1 : 0;
    if (g.mediaMetadata?.width) r.width = Number(g.mediaMetadata.width);
    if (g.mediaMetadata?.height) r.height = Number(g.mediaMetadata.height);
    stmts.push(
      env.DB.prepare(
        "UPDATE media SET base_url = ?, base_url_exp = ?, processing = ?, width = ?, height = ? WHERE id = ?",
      ).bind(r.base_url, r.base_url_exp, r.processing, r.width, r.height, r.id),
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
  return rows;
}

/**
 * SELECT ... WHERE x IN (ids) split into chunks - D1 allows at most 100 bound parameters per query.
 * `sql` receives the placeholder list, e.g. (ph) => `SELECT * FROM media WHERE event_id = ? AND id IN (${ph})`.
 */
export async function selectIn<T>(env: Env, sql: (ph: string) => string, fixed: unknown[], ids: string[]): Promise<T[]> {
  const out: T[] = [];
  const size = 90 - fixed.length;
  for (let i = 0; i < ids.length; i += size) {
    const chunk = ids.slice(i, i + size);
    const res = await env.DB.prepare(sql(chunk.map(() => "?").join(",")))
      .bind(...fixed, ...chunk)
      .all<T>();
    out.push(...res.results);
  }
  return out;
}

export function changeStmt(env: Env, eventId: string, op: string, refId: string | null) {
  return env.DB.prepare("INSERT INTO changes (event_id, op, ref_id) VALUES (?,?,?)").bind(eventId, op, refId);
}

/** Creates an album row + the matching Google Photos album. */
export async function createEventAlbum(
  env: Env,
  ev: Pick<EventRow, "id" | "owner_id" | "title">,
  kind: "guest" | "host" | "custom",
  name: string,
): Promise<AlbumRow> {
  const token = await ownerToken(env, ev.owner_id);
  const g = await createAlbum(token, `${ev.title} · ${name}`);
  const row: AlbumRow = {
    id: randomId(9),
    event_id: ev.id,
    kind,
    name,
    name_norm: normName(name),
    google_album_id: g.id,
    created_at: Date.now(),
    hidden: 0,
    linked: 0,
    source_url: null,
    synced_at: 0,
  };
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO albums (id, event_id, kind, name, name_norm, google_album_id, created_at) VALUES (?,?,?,?,?,?,?)",
    ).bind(row.id, row.event_id, row.kind, row.name, row.name_norm, row.google_album_id, row.created_at),
    changeStmt(env, ev.id, "album", row.id),
  ]);
  return row;
}
