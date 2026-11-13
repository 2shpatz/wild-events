import type { EventDesign } from "./design";
import type { EventMusic } from "./music";

export type EventType = "wedding" | "birthday" | "family" | "party" | "trip" | "general";
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
  /** extra scroll at the end of the guest page that shows the whole background image (off by default) */
  bgReveal: boolean;
  /** framing of the background picture: focal point in % (CSS background-position; 50/50 = centered) + zoom (1-3) */
  bgPos: BgPos;
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
  /** items on each checklist element, by block id (an empty list is hidden from guests unless they may add items) */
  checklistCounts: Record<string, number>;
  canManage: boolean;
  isOwner: boolean;
  googleAlbumUrl?: string | null;
  /** The event is moving to another Google account: uploads pause, viewing keeps working. */
  maintenance?: boolean;
}

export type BgPos = { x: number; y: number; zoom: number };
export const MAX_BG_ZOOM = 3;
/** Below 1 the picture shrinks inside the screen; a blurred copy of it fills the edges. */
export const MIN_BG_ZOOM = 0.5;

/** A message on the message board ("לוח ברכות"). */
export interface BoardMessage {
  id: string;
  name: string;
  body: string;
  createdAt: number;
  /** written from this device (it may delete it) */
  mine: boolean;
  /** short tag of the writer's device (not reversible) - the same guest gets the same color on the board */
  by: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  /** who ticked it (null = the hosts, or not done) */
  doneBy: string | null;
  /** the guest who added it (null = the hosts) */
  addedBy: string | null;
  /** added from this device - its guest may always remove it */
  mine: boolean;
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
  /** Which Google account this is (missing on old responses). */
  account?: StorageAccountRef;
}

/** "self" = the Google account the owner logs in with; otherwise a storage account id. */
export interface StorageAccountRef {
  id: string;
  email: string | null;
  personal: boolean;
  /** false = Google access was revoked/expired and the account must be connected again */
  connected: boolean;
}

export interface StorageAccountDTO extends StorageAccountRef {
  name: string | null;
  picture: string | null;
  /** null = could not read the quota right now */
  storage: StorageInfo | null;
  /** active events stored in this account */
  eventsCount: number;
}

export interface MigrationDTO {
  id: string;
  status: "running" | "done" | "error" | "cancelled";
  from: string;
  to: string;
  toEmail: string | null;
  total: number;
  done: number;
  failed: number;
  /** items still waiting to be copied */
  remaining: number;
  oldAlbumUrl: string | null;
  error: string | null;
}

/** What moving an event would take (shown before starting). */
export interface MigrationEstimate {
  items: number;
  bytes: number;
  tracks: number;
}

export interface OwnerMe {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  connected: boolean;
}

/** Who hosts this copy of the site, shown to users who are not the site admin. */
export interface SiteOperator {
  name: string | null;
  email: string | null;
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

// ---------------------------------------------------------------- versions & updates

/** One entry of release-notes.json (Hebrew, plain text). */
export interface ReleaseEntry {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  notes: string[];
  /** Something the site admin must do by hand after this version (shown even when the site updated itself). */
  adminAction?: string;
}

/** What the site admin's dashboard shows: "available" = a newer version exists; "updated" = the site was just updated. */
export type UpdateFlag = "available" | "updated" | null;

export interface UpdatesInfo {
  current: { version: string; commit: string; builtAt: string };
  /** "git" = installed from GitHub through Cloudflare (can update itself); "manual" = deployed from a computer. */
  source: "git" | "manual";
  /** This build follows the original repository, so a rebuild installs the newest version. */
  autoCapable: boolean;
  latest: string | null;
  /** Releases newer than the running version, newest first. */
  newer: ReleaseEntry[];
  /** Set after an update landed and until the admin marks it as seen: what the update brought. */
  justUpdated: { from: string | null; releases: ReleaseEntry[] } | null;
  /** Release history known to this copy (bundled + feed), newest first. */
  history: ReleaseEntry[];
  checkedAt: number | null;
  checkError: string | null;
  auto: {
    enabled: boolean;
    hook: { set: boolean; masked: string | null };
    /** Last automatic or manual rebuild request. */
    last: { version: string; at: number; attempts: number; ok: boolean; error?: string } | null;
    /**
     * null = a newer version is installed automatically the coming night; requested = asked for it in the last 12
     * hours; stopped = the platform rejected the Deploy Hook URL.
     */
    waiting: "requested" | "stopped" | null;
  };
  schemaError: string | null;
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
  /** the hosts' share message (see ManageEvent.shareText) */
  shareText: string | null;
  createdAt: number;
  /** the Google account that holds the event ("self" = the login account) */
  storageAccountId: string;
  /** the event is moving to another account right now */
  migrating: boolean;
  /** version of the header image of the main page (null = none), shown on the event's card */
  headerVersion: string | null;
  /** focal point of the header image (HeroDesign.headerPos) */
  headerPos: { x: number; y: number };
}

/** An event album that mirrors an album the owner has in Google Photos (copied in, re-synced on demand). */
export interface AlbumLink {
  sourceUrl: string | null; // the share link the owner pasted, if any
  syncedAt: number; // 0 = never finished a sync
  /** the Google account the album is picked from ("self" = the login account) */
  sourceAccount: string;
}

export type ManageAlbum = AlbumDTO & { googleAlbumId: string | null; link: AlbumLink | null };

export type ShareImage = "header" | "logo";

export interface ManageEvent extends PublicEvent {
  hasPassword: boolean;
  /** the hosts' own share message (the event link is appended automatically); null = the built-in text */
  shareText: string | null;
  /** the picture in the preview of the event link: the header image (when there is one) or the site logo */
  shareImage: ShareImage;
  /** the small copy of the header image made for link previews exists */
  headerShareReady: boolean;
  albums: ManageAlbum[];
  /** the saved music settings (also when off) */
  musicConfig: EventMusic;
  uploadedTracks: UploadedTrack[];
  /** The Google account that holds this event's photos (owner only sees email). */
  storageAccount: StorageAccountRef;
  /** Running or last move to another account (owner only). */
  migration: MigrationDTO | null;
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
  /** the Google account whose library the picker shows ("self" = the login account) */
  source: string;
  error?: string | null;
}

export const MAX_FEATURED = 6;

export const MAX_SINGLE_UPLOAD = 20 * 1024 * 1024; // above this, use chunked resumable upload
export const CHUNK_SIZE = 16 * 1024 * 1024; // multiple of 256 KiB
