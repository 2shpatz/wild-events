import type { GuestIdentity } from "../../shared/types";

const DEVICE_KEY = "lea:device";

/** Stable per-device id: localStorage + cookie (survives one of them being cleared). */
export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY) || readCookie(DEVICE_KEY);
  if (!id || id.length < 12) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  localStorage.setItem(DEVICE_KEY, id);
  document.cookie = `${DEVICE_KEY}=${id}; path=/; max-age=${60 * 60 * 24 * 400}; SameSite=Lax`;
  return id;
}

function readCookie(name: string) {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.split("=")[1];
}

const idKey = (code: string) => `lea:guest:${code}`;

export function savedIdentity(code: string): GuestIdentity | null {
  try {
    return JSON.parse(localStorage.getItem(idKey(code)) || "null");
  } catch {
    return null;
  }
}

export function saveIdentity(code: string, id: GuestIdentity) {
  localStorage.setItem(idKey(code), JSON.stringify(id));
}

export function clearIdentity(code: string) {
  localStorage.removeItem(idKey(code));
}

/** Android browsers (Chrome, Samsung Internet, ...) - their file pickers and camera intents behave differently from iOS. */
export const isAndroid = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
/** iPhone / iPad (iPadOS reports itself as a Mac with touch). */
export const isIOS =
  typeof navigator !== "undefined" && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
