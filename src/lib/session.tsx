import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "./api";
import type { OwnerMe, PublicEvent, UpdateFlag } from "../../shared/types";
import { applyTheme } from "./themes";
import { rememberEvent } from "./share";

interface Me {
  owner: OwnerMe | null;
  adminEventId: string | null;
  configured: boolean;
  /** Only for the site admin: how many people wait for approval, and news about versions. */
  siteAdmin?: { pending: number; update?: UpdateFlag } | null;
}

const MeCtx = createContext<{ me: Me | null; refresh: () => Promise<void> }>({ me: null, refresh: async () => {} });

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("/auth/me"));
    } catch {
      setMe({ owner: null, adminEventId: null, configured: true });
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return <MeCtx.Provider value={{ me, refresh }}>{children}</MeCtx.Provider>;
}

export const useMe = () => useContext(MeCtx);

// The last event a guest page loaded, shared with page-independent UI (the music player) so it needs no fetch of its own.
let sharedEvent: PublicEvent | null = null;
const sharedSubs = new Set<() => void>();
function publishEvent(ev: PublicEvent) {
  sharedEvent = ev;
  sharedSubs.forEach((f) => f());
}
const subscribeShared = (f: () => void) => {
  sharedSubs.add(f);
  return () => sharedSubs.delete(f);
};

/** The event most recently loaded by a page for this code (or null). */
export function useSharedEvent(code: string | undefined) {
  const ev = useSyncExternalStore(subscribeShared, () => sharedEvent);
  return ev && code && ev.code === code.toLowerCase() ? ev : null;
}

/** Loads the public event and applies its theme to the document. */
export function useEvent(code: string | undefined, version = 0) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => {
    if (!code) return;
    try {
      const ev = await api<PublicEvent>(`/e/${code}`);
      setEvent(ev);
      publishEvent(ev);
      applyTheme(ev.theme);
      document.title = `${ev.title} · אירוע פרוע`;
      rememberEvent(ev.code, ev.title);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [code]);
  useEffect(() => {
    load();
  }, [load, version]);
  return { event, error, reload: load };
}
