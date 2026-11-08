/**
 * Background-music engine: one module-level <audio>, so playback survives page changes inside an event.
 * Browsers only allow sound after a user gesture - auto start waits for the guest's first tap anywhere.
 */
import { useSyncExternalStore } from "react";
import type { GuestMusic, PlayerTrack } from "../../../shared/types";

export interface MusicState {
  code: string | null;
  tracks: PlayerTrack[];
  index: number;
  playing: boolean;
  loading: boolean;
  /** auto start is armed and waiting for the guest's first tap */
  waitingForTap: boolean;
}

const VOLUME = 0.7;

/** Saved per device + event: did the guest stop the music, and where were they in the playlist. */
interface Saved {
  off?: boolean;
  /** the guest had the music playing last time */
  on?: boolean;
  key?: string;
  /** seconds into that track */
  t?: number;
}
const savedKey = (code: string) => `music:${code}`;
function readSaved(code: string): Saved {
  try {
    return JSON.parse(localStorage.getItem(savedKey(code)) || "{}") as Saved;
  } catch {
    return {};
  }
}
function save(patch: Saved) {
  if (!state.code) return;
  try {
    localStorage.setItem(savedKey(state.code), JSON.stringify({ ...readSaved(state.code), ...patch }));
  } catch {
    /* private mode / full storage */
  }
}
let lastSave = 0;
/** where the guest is now (throttled while playing, immediately on leave) */
function savePosition(force = false) {
  const t = current();
  if (!t || !audio) return;
  if (!force && Date.now() - lastSave < 5000) return;
  lastSave = Date.now();
  save({ key: t.key, t: Math.floor(audio.currentTime || 0) });
}
/** seek to apply once the next track's metadata is loaded (resume from the saved position) */
let resumeAt = 0;
/** the song that is playing was removed from the playlist - when it ends, continue at state.index (not +1) */
let removedPlaying = false;

let state: MusicState = { code: null, tracks: [], index: 0, playing: false, loading: false, waitingForTap: false };
const subs = new Set<() => void>();
const set = (patch: Partial<MusicState>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};

let audio: HTMLAudioElement | null = null;
let shuffle = false;
let history: number[] = [];
let errorsInRow = 0;
let fadeTimer = 0;
/** why we paused on our own (resume when the reason ends) */
let pausedBy: "video" | "hidden" | null = null;
let videoWatch = 0;
let disarm: (() => void) | null = null;

function el() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "none";
  audio.addEventListener("playing", () => {
    errorsInRow = 0;
    set({ playing: true, loading: false });
  });
  audio.addEventListener("pause", () => set({ playing: false, loading: false }));
  audio.addEventListener("waiting", () => set({ loading: true }));
  audio.addEventListener("timeupdate", () => savePosition());
  audio.addEventListener("loadedmetadata", () => {
    if (resumeAt && audio && resumeAt < audio.duration - 5) audio.currentTime = resumeAt;
    resumeAt = 0;
  });
  audio.addEventListener("ended", () => {
    if (removedPlaying) {
      removedPlaying = false;
      start(state.index);
    } else next();
  });
  audio.addEventListener("error", () => {
    if (!audio?.getAttribute("src")) return;
    errorsInRow++;
    if (errorsInRow < state.tracks.length) next();
    else set({ playing: false, loading: false });
  });
  return audio;
}

const current = () => state.tracks[state.index] as PlayerTrack | undefined;

function fadeIn(a: HTMLAudioElement) {
  clearInterval(fadeTimer);
  a.volume = 0;
  fadeTimer = window.setInterval(() => {
    a.volume = Math.min(VOLUME, a.volume + VOLUME / 10);
    if (a.volume >= VOLUME) clearInterval(fadeTimer);
  }, 70);
}

/** Must run synchronously inside a user gesture the first time (iOS). */
function start(index = state.index) {
  const t = state.tracks[index];
  if (!t) return;
  if (index !== state.index) removedPlaying = false;
  const a = el();
  if (a.getAttribute("src") !== t.url) {
    if (index !== state.index) resumeAt = 0;
    a.src = t.url;
    a.preload = "auto";
  }
  set({ index, loading: true, waitingForTap: false });
  updateSession();
  fadeIn(a);
  a.play().catch(() => set({ playing: false, loading: false }));
}

export function play() {
  if (!state.code || !state.tracks.length) return;
  pausedBy = null;
  disarmAutoStart();
  save({ off: false, on: true });
  start();
}

/** Guest pressed pause: remember it, so the music doesn't start again by itself on this event. */
export function pause() {
  pausedBy = null;
  disarmAutoStart();
  save({ off: true, on: false });
  savePosition(true);
  audio?.pause();
}

export const toggle = () => (state.playing || state.loading ? pause() : play());

export function next() {
  const n = state.tracks.length;
  if (!n) return;
  let i = (state.index + 1) % n;
  if (shuffle && n > 1) {
    do i = Math.floor(Math.random() * n);
    while (i === state.index);
  }
  history.push(state.index);
  if (history.length > 50) history.shift();
  start(i);
}

export function prev() {
  const n = state.tracks.length;
  if (!n) return;
  if (audio && audio.currentTime > 4) {
    audio.currentTime = 0;
    if (audio.paused) start();
    return;
  }
  const i = shuffle && history.length ? history.pop()! : (state.index - 1 + n) % n;
  start(i);
}

function updateSession() {
  const t = current();
  if (!t || !("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist ?? "", album: document.title });
    navigator.mediaSession.setActionHandler("play", play);
    navigator.mediaSession.setActionHandler("pause", pause);
    navigator.mediaSession.setActionHandler("nexttrack", next);
    navigator.mediaSession.setActionHandler("previoustrack", prev);
  } catch {
    /* unsupported action */
  }
}

function armAutoStart() {
  disarmAutoStart();
  const onGesture = (e: Event) => {
    // The player's own buttons handle themselves (else "pause" would first start and then stop the music).
    if (e.target instanceof Element && e.target.closest("[data-music-controls]")) return;
    disarmAutoStart();
    if (!state.playing) play();
  };
  // Events that count as user activation on iOS / Android / desktop.
  const types = ["click", "touchend", "keydown"] as const;
  types.forEach((t) => document.addEventListener(t, onGesture, { capture: true }));
  disarm = () => types.forEach((t) => document.removeEventListener(t, onGesture, { capture: true }));
  set({ waitingForTap: true });
}

function disarmAutoStart() {
  disarm?.();
  disarm = null;
  if (state.waitingForTap) set({ waitingForTap: false });
}

function stop() {
  if (audio?.getAttribute("src") && !audio.paused) savePosition(true);
  disarmAutoStart();
  clearInterval(videoWatch);
  pausedBy = null;
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  history = [];
  if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
}

/**
 * Called by the player whenever the route's event (or its music) changes. null = leave / no music.
 * A playlist update of the same event keeps the current song playing.
 */
export function setMusic(code: string | null, music: GuestMusic | null) {
  if (!code || !music?.tracks.length) {
    if (state.code) {
      stop();
      set({ code: null, tracks: [], index: 0, playing: false, loading: false, waitingForTap: false });
    }
    return;
  }
  shuffle = music.shuffle;
  if (code === state.code) {
    const key = current()?.key;
    const i = music.tracks.findIndex((t) => t.key === key);
    // The playing song was removed: it finishes, then the list continues from the same position.
    set({ tracks: music.tracks, index: i >= 0 ? i : Math.min(state.index, music.tracks.length - 1) });
    removedPlaying = i < 0 && !!audio && !audio.paused;
    return;
  }
  stop();
  // Pick up where this device left off: same song and position, and the guest's own on/off choice.
  const saved = readSaved(code);
  const savedIndex = saved.key ? music.tracks.findIndex((t) => t.key === saved.key) : -1;
  const first = savedIndex >= 0 ? savedIndex : music.shuffle ? Math.floor(Math.random() * music.tracks.length) : 0;
  resumeAt = savedIndex >= 0 ? saved.t ?? 0 : 0;
  set({ code, tracks: music.tracks, index: first, playing: false, loading: false, waitingForTap: false });
  // Browsers still need one tap before sound: if the guest had it playing, the first tap resumes it.
  if (!saved.off && (music.autoStart || saved.on)) armAutoStart();
}

// ------------------------------------------------------------- pause for videos / hidden tab (installed once)

if (typeof document !== "undefined") {
  // A video started playing (e.g. in the lightbox): music steps aside and comes back when the video stops.
  document.addEventListener(
    "play",
    (e) => {
      const v = e.target;
      if (!(v instanceof HTMLVideoElement) || !audio || audio.paused) return;
      audio.pause();
      pausedBy = "video";
      clearInterval(videoWatch);
      // Polling also covers a video removed from the page while playing (no event reaches the document then).
      videoWatch = window.setInterval(() => {
        if (v.isConnected && !v.paused && !v.ended) return;
        clearInterval(videoWatch);
        if (pausedBy === "video") {
          pausedBy = null;
          start();
        }
      }, 700);
    },
    true,
  );
  // Phone locked / tab in the background: don't keep playing from a pocket.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      savePosition(true);
      if (audio && !audio.paused) {
        audio.pause();
        pausedBy = "hidden";
      }
    } else if (pausedBy === "hidden") {
      pausedBy = null;
      start();
    }
  });
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};
export const useMusic = () => useSyncExternalStore(subscribe, () => state);
