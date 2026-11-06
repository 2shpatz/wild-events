import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { OwnerMe, PublicEvent } from "../../shared/types";
import { applyTheme } from "./themes";
import { rememberEvent } from "./share";

interface Me {
  owner: OwnerMe | null;
  adminEventId: string | null;
  configured: boolean;
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

/** Loads the public event and applies its theme to the document. */
export function useEvent(code: string | undefined, version = 0) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => {
    if (!code) return;
    try {
      const ev = await api<PublicEvent>(`/e/${code}`);
      setEvent(ev);
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
