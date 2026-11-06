import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { AlbumDTO, FeedResponse, MediaDTO } from "../../shared/types";

const POLL_VISIBLE = 12_000;
const POLL_MAX = 60_000;

export interface Feed {
  media: MediaDTO[];
  albums: AlbumDTO[];
  loading: boolean;
  error: unknown;
  /** ids that arrived via live updates since the page was opened */
  fresh: Set<string>;
  eventVersion: number;
  requestUrls: (ids: string[], force?: boolean) => void;
  removeLocal: (ids: string[]) => void;
  addLocal: (items: MediaDTO[]) => void;
  reload: () => void;
}

/**
 * Live event feed: full load, then cheap incremental polling (only while the tab is visible),
 * plus lazy refresh of Google base URLs (they expire after ~60 minutes).
 */
export function useFeed(code: string | undefined): Feed {
  const [media, setMedia] = useState<Map<string, MediaDTO>>(new Map());
  const [albums, setAlbums] = useState<AlbumDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [eventVersion, setEventVersion] = useState(0);
  const cursor = useRef(0);
  const pending = useRef<Set<string>>(new Set());
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRef = useRef(media);
  mediaRef.current = media;

  const merge = useCallback((items: MediaDTO[], removed: string[] = [], markFresh = false) => {
    if (!items.length && !removed.length) return;
    setMedia((prev) => {
      const next = new Map(prev);
      for (const m of items) next.set(m.id, m);
      for (const id of removed) next.delete(id);
      return next;
    });
    if (markFresh && items.length) {
      setFresh((prev) => {
        const next = new Set(prev);
        for (const m of items) next.add(m.id);
        return next;
      });
    }
  }, []);

  const load = useCallback(async () => {
    if (!code) return;
    try {
      const r = await api<FeedResponse>(`/e/${code}/feed`);
      cursor.current = r.cursor;
      setMedia(new Map(r.media.map((m) => [m.id, m])));
      setAlbums(r.albums || []);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Incremental polling.
  useEffect(() => {
    if (!code) return;
    let delay = POLL_VISIBLE;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible" && cursor.current > 0) {
        try {
          const r = await api<FeedResponse>(`/e/${code}/feed?since=${cursor.current}`);
          if (r.full) await load();
          else {
            cursor.current = r.cursor;
            merge(r.media, r.removed, true);
            if (r.albums) setAlbums(r.albums);
            if (r.eventChanged) setEventVersion((v) => v + 1);
          }
          delay = r.media.length || r.removed.length ? POLL_VISIBLE : Math.min(delay * 1.25, POLL_MAX / 2);
        } catch {
          delay = Math.min(delay * 2, POLL_MAX);
        }
      } else if (cursor.current === 0) {
        await load();
      }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, POLL_VISIBLE);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        delay = POLL_VISIBLE;
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [code, load, merge]);

  const flushUrls = useCallback(async () => {
    urlTimer.current = null;
    if (!code) return;
    const ids = [...pending.current].slice(0, 200);
    ids.forEach((id) => pending.current.delete(id));
    if (!ids.length) return;
    try {
      const r = await api<{ media: MediaDTO[] }>(`/e/${code}/urls`, { method: "POST", json: { ids } });
      merge(r.media);
    } catch {
      /* will retry on next request */
    }
    if (pending.current.size) urlTimer.current = setTimeout(flushUrls, 300);
  }, [code, merge]);

  const requestUrls = useCallback(
    (ids: string[], force = false) => {
      const now = Date.now();
      for (const id of ids) {
        const m = mediaRef.current.get(id);
        if (m && (force || !m.url || m.exp < now + 120_000 || m.processing)) pending.current.add(id);
      }
      if (pending.current.size && !urlTimer.current) urlTimer.current = setTimeout(flushUrls, 150);
    },
    [flushUrls],
  );

  // Proactively refresh URLs that are about to expire (long-running slideshow screens).
  useEffect(() => {
    const t = setInterval(() => {
      const soon = Date.now() + 5 * 60_000;
      const ids = [...mediaRef.current.values()].filter((m) => m.url && m.exp < soon).map((m) => m.id);
      if (ids.length) requestUrls(ids.slice(0, 200));
    }, 60_000);
    return () => clearInterval(t);
  }, [requestUrls]);

  return {
    media: [...media.values()],
    albums,
    loading,
    error,
    fresh,
    eventVersion,
    requestUrls,
    removeLocal: (ids) => merge([], ids),
    addLocal: (items) => merge(items, [], false),
    reload: load,
  };
}
