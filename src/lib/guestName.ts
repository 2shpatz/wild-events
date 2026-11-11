import { useSyncExternalStore } from "react";
import { api } from "./api";
import { deviceId, savedIdentity } from "./device";

/**
 * The name a guest writes with on the message board / checklist. Asked once per event and kept on the device;
 * a guest who already gave a name for uploading is not asked again.
 */
const key = (code: string) => `lea:name:${code.toLowerCase()}`;
const subs = new Set<() => void>();

export function guestName(code: string): string {
  try {
    return localStorage.getItem(key(code)) || savedIdentity(code)?.album.name || "";
  } catch {
    return "";
  }
}

export function setGuestName(code: string, name: string) {
  try {
    localStorage.setItem(key(code), name.trim());
  } catch {
    /* private mode: the name lives only in memory for this page */
  }
  subs.forEach((f) => f());
}

export function useGuestName(code: string) {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => guestName(code),
  );
}

/** API call that identifies this device (for "my messages" and guest permissions). */
export const boardApi = <T>(path: string, init: Parameters<typeof api>[1] = {}) =>
  api<T>(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), "X-Device": deviceId() } });
