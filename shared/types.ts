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

export interface ManageEvent extends PublicEvent {
  hasPassword: boolean;
  albums: (AlbumDTO & { googleAlbumId: string | null })[];
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
  error?: string | null;
}

export const MAX_FEATURED = 6;

export const MAX_SINGLE_UPLOAD = 20 * 1024 * 1024; // above this, use chunked resumable upload
export const CHUNK_SIZE = 16 * 1024 * 1024; // multiple of 256 KiB
