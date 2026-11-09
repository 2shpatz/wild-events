import type { EventDesign } from "./design";
import type { EventMusic } from "./music";

export type EventType = "wedding" | "birthday" | "family" | "party" | "general";
export type ThemeId = EventType;
export type Quality = "compressed" | "original";
export type ViewOrder = "mixed" | "timeline" | "albums";
export type ViewMode = "masonry" | "floating" | "carousel" | "slideshow" | "mosaic";

export interface PublicEvent {
  id: string;
  code: string;
  title: string;
  subtitle: string | null;
  welcome: string | null;
  date: string | null;
  /** HH:MM, local event time */
  time: string | null;
  venueName: string | null;
  venueAddress: string | null;
  type: EventType;
  theme: ThemeId;
  background: string | null; // preset id | 'custom' | null
  bgVersion: string | null;
  /** header image that accompanies guests across the event pages */
  headerVersion: string | null;
  /** the invitation card image uploaded by the host, shown above the event details */
  invitationVersion: string | null;
  /** featured (representative) photos uploaded by the host, shown on the invitation page */
  featured: { slot: number; v: string }[];
  /** images of the flexible-design image blocks ('i0'..'i9') */
  images: { slot: number; v: string }[];
  /** guest page layout + title styling (flexible design) */
  design: EventDesign;
  /** background music for the guest pages; null = off (disabled or empty playlist) */
  music: GuestMusic | null;
  quality: Quality;
  keepGps: boolean;
  defaultView: ViewMode;
  defaultOrder: ViewOrder;
  uploadsOpen: boolean;
  mediaCount: number;
  albumCount: number;
  canManage: boolean;
  isOwner: boolean;
  googleAlbumUrl?: string | null;
}

export interface PlayerTrack {
  /** "lib:<id>" | "up:<id>" */
  key: string;
  title: string;
  artist: string | null;
  url: string;
}

export interface GuestMusic {
  autoStart: boolean;
  shuffle: boolean;
  tracks: PlayerTrack[];
}

/** A song the host uploaded (stored in the owner's Google Drive). */
export interface UploadedTrack {
  id: string;
  title: string;
  /** seconds, if the browser could read it */
  duration: number | null;
  size: number;
}

export interface AlbumDTO {
  id: string;
  name: string;
  kind: "guest" | "host" | "custom";
  count: number;
  cover: string | null; // media id
}

export interface MediaDTO {
  id: string;
  album: string;
  kind: "photo" | "video";
  w: number;
  h: number;
  takenAt: number;
  uploadedAt: number;
  url: string | null; // Google base URL (append size params)
  exp: number; // url expiry (ms epoch)
  processing: boolean;
  /** Tag of the uploading device (see shared/deviceTag.ts) - lets a guest's phone show delete on its own items. */
  by?: string | null;
}

export interface FeedResponse {
  cursor: number;
  full: boolean;
  media: MediaDTO[];
  removed: string[];
  albums?: AlbumDTO[];
  eventChanged?: boolean;
}

export interface GuestIdentity {
  album: { id: string; name: string; kind: string };
  token: string;
}

export interface StorageInfo {
  limit: number | null;
  usage: number;
  percent: number | null;
  alert: boolean;
  checkedAt: number;
}

export interface OwnerMe {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  connected: boolean;
}

// ---------------------------------------------------------------- site admin

export type MemberSource = "manual" | "waitlist" | "open" | "legacy" | "admin";

export interface MemberDTO {
  email: string;
  name: string | null;
  picture: string | null;
  status: "approved" | "pending" | "archived";
  source: MemberSource;
  isAdmin: boolean;
  requestedAt: number | null;
  approvedAt: number | null;
  archivedAt: number | null;
  /** When the invitation email was last sent (null = never). */
  invitedAt: number | null;
  lastLoginAt: number | null;
  events: number;
  albums: number;
  photos: number;
}

export interface MemberEventDTO {
  code: string;
  title: string;
  date: string | null;
  createdAt: number;
  albums: number;
  photos: number;
}

export interface AdminOverview {
  counts: { approved: number; pending: number; archived: number };
  waitlistEnabled: boolean;
  mail: { connected: boolean; email: string | null };
  admin: { email: string; name: string | null } | null;
  operator: { name: string; email: string };
}

/** Result of an admin action that may send an email. */
export interface MailOutcome {
  mailed?: boolean;
  mailError?: "not_connected" | "api_disabled" | "reauth" | "error";
}

export interface OwnerEventSummary {
  id: string;
  code: string;
  title: string;
  date: string | null;
  type: EventType;
  theme: ThemeId;
  quality: Quality;
  mediaCount: number;
  albumCount: number;
  googleAlbumUrl: string | null;
  createdAt: number;
}

/** An event album that mirrors an album the owner has in Google Photos (copied in, re-synced on demand). */
export interface AlbumLink {
  sourceUrl: string | null; // the share link the owner pasted, if any
  syncedAt: number; // 0 = never finished a sync
}

export type ManageAlbum = AlbumDTO & { googleAlbumId: string | null; link: AlbumLink | null };

export interface ManageEvent extends PublicEvent {
  hasPassword: boolean;
  albums: ManageAlbum[];
  /** the saved music settings (also when off) */
  musicConfig: EventMusic;
  uploadedTracks: UploadedTrack[];
}

export interface ImportJobDTO {
  id: string;
  status: "picking" | "listed" | "running" | "done" | "cancelled" | "error";
  pickerUri: string | null;
  total: number;
  done: number;
  skipped: number;
  failed: number;
  already: number;
  estBytes: number;
  albumId: string;
  linked: boolean; // links or re-syncs a whole Google Photos album
  error?: string | null;
}

export const MAX_FEATURED = 6;

export const MAX_SINGLE_UPLOAD = 20 * 1024 * 1024; // above this, use chunked resumable upload
export const CHUNK_SIZE = 16 * 1024 * 1024; // multiple of 256 KiB
