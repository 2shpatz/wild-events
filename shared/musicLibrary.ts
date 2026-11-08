/**
 * Built-in background tracks (files in public/music, credits in public/music/CREDITS.md).
 * All by Kevin MacLeod (incompetech.com), Creative Commons: By Attribution 4.0 - credit is shown wherever a track is named.
 */
import type { EventType } from "./types";

export type Mood = "happy" | "calm" | "romantic" | "party" | "kids";

export const MOODS: { id: Mood; label: string }[] = [
  { id: "happy", label: "שמח" },
  { id: "calm", label: "רגוע" },
  { id: "romantic", label: "רומנטי" },
  { id: "party", label: "מסיבה" },
  { id: "kids", label: "ילדים" },
];

export interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  mood: Mood;
  /** seconds */
  duration: number;
}

export const LIBRARY_LICENSE = "CC BY 4.0";
export const LIBRARY_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

const KM = "Kevin MacLeod";

export const LIBRARY: LibraryTrack[] = [
  { id: "carefree", title: "Carefree", artist: KM, mood: "happy", duration: 205 },
  { id: "life-of-riley", title: "Life of Riley", artist: KM, mood: "happy", duration: 235 },
  { id: "easy-lemon", title: "Easy Lemon", artist: KM, mood: "calm", duration: 126 },
  { id: "gymnopedie", title: "Gymnopedie No 1", artist: KM, mood: "calm", duration: 187 },
  { id: "dreamer", title: "Dreamer", artist: KM, mood: "calm", duration: 204 },
  { id: "canon-in-d", title: "Canon in D Major", artist: KM, mood: "romantic", duration: 356 },
  { id: "touching-moments", title: "Touching Moments", artist: KM, mood: "romantic", duration: 174 },
  { id: "heartwarming", title: "Heartwarming", artist: KM, mood: "romantic", duration: 72 },
  { id: "pamgaea", title: "Pamgaea", artist: KM, mood: "party", duration: 169 },
  { id: "funky-chunk", title: "Funky Chunk", artist: KM, mood: "party", duration: 239 },
  { id: "fluffing-a-duck", title: "Fluffing a Duck", artist: KM, mood: "kids", duration: 67 },
  { id: "monkeys-spinning", title: "Monkeys Spinning Monkeys", artist: KM, mood: "kids", duration: 125 },
];

export const libraryTrack = (id: string) => LIBRARY.find((t) => t.id === id);
export const libraryUrl = (id: string) => `/music/${id}.mp3`;

/** Moods suggested for each event type, in playlist order. */
export const SUGGESTED_MOODS: Record<EventType, Mood[]> = {
  wedding: ["romantic", "calm"],
  birthday: ["happy", "kids"],
  family: ["happy", "calm"],
  party: ["party", "happy"],
  general: ["calm", "happy"],
};

export const suggestedTracks = (type: EventType) =>
  SUGGESTED_MOODS[type].flatMap((m) => LIBRARY.filter((t) => t.mood === m));
