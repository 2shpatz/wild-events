/**
 * Background music of the guest pages. Stored as JSON in events.music; always passed through sanitizeMusic().
 * Tracks are either built-in ("lib", see musicLibrary.ts) or uploaded by the host to their Google Drive ("up", event_tracks).
 */
import { libraryTrack, suggestedTracks } from "./musicLibrary";
import type { EventType } from "./types";

export type TrackRef = { src: "lib" | "up"; id: string };

export interface EventMusic {
  v: 1;
  enabled: boolean;
  /** start on the guest's first tap anywhere on the page */
  autoStart: boolean;
  shuffle: boolean;
  tracks: TrackRef[];
}

export const MAX_PLAYLIST = 40;
export const MAX_UPLOADED_TRACKS = 30;
export const MAX_TRACK_BYTES = 20 * 1024 * 1024;
export const AUDIO_MIME_RE = /^audio\/(mpeg|mp3|mp4|x-m4a|aac)$/;

const UP_ID_RE = /^[a-z0-9]{6,32}$/;

export const trackKey = (t: TrackRef) => `${t.src}:${t.id}`;

export function defaultMusic(type: EventType): EventMusic {
  return {
    v: 1,
    enabled: false,
    autoStart: true,
    shuffle: false,
    tracks: suggestedTracks(type).map((t) => ({ src: "lib", id: t.id })),
  };
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Strict whitelist; never throws. Uploaded ids are only shape-checked here - the server also checks they belong to the event. */
export function sanitizeMusic(input: unknown, type: EventType = "general"): EventMusic {
  const m = obj(input);
  if (m.v !== 1) return defaultMusic(type);
  const seen = new Set<string>();
  const tracks: TrackRef[] = [];
  for (const raw of Array.isArray(m.tracks) ? m.tracks : []) {
    if (tracks.length >= MAX_PLAYLIST) break;
    const t = obj(raw);
    const id = typeof t.id === "string" ? t.id : "";
    const ok = (t.src === "lib" && !!libraryTrack(id)) || (t.src === "up" && UP_ID_RE.test(id));
    if (!ok) continue;
    const ref: TrackRef = { src: t.src as TrackRef["src"], id };
    if (seen.has(trackKey(ref))) continue;
    seen.add(trackKey(ref));
    tracks.push(ref);
  }
  return {
    v: 1,
    enabled: m.enabled === true,
    autoStart: m.autoStart !== false,
    shuffle: m.shuffle === true,
    tracks,
  };
}

export function parseMusic(json: string | null | undefined, type: EventType): EventMusic {
  if (!json) return defaultMusic(type);
  try {
    return sanitizeMusic(JSON.parse(json), type);
  } catch {
    return defaultMusic(type);
  }
}
