/** Files shared into the installed app (Android share target) are stashed by the service worker in Cache Storage. */
const CACHE = "lea-share-target";

export async function sharedFileCount(): Promise<number> {
  if (!("caches" in window)) return 0;
  const cache = await caches.open(CACHE);
  return (await cache.keys()).length;
}

let taking = false;

export async function takeSharedFiles(): Promise<File[]> {
  if (!("caches" in window) || taking) return [];
  taking = true;
  try {
    return await readSharedFiles();
  } finally {
    taking = false;
  }
}

async function readSharedFiles(): Promise<File[]> {
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  const files: File[] = [];
  for (const req of keys) {
    const res = await cache.match(req);
    if (!res) continue;
    const blob = await res.blob();
    const name = decodeURIComponent(res.headers.get("X-File-Name") || "shared");
    files.push(new File([blob], name, { type: blob.type || res.headers.get("Content-Type") || "", lastModified: Number(res.headers.get("X-Last-Modified")) || Date.now() }));
    await cache.delete(req);
  }
  return files;
}

/** Events this device has visited (to pick where shared photos go). */
export function knownEvents(): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("lea:visited:")) out.push(k.slice("lea:visited:".length));
  }
  return out;
}

export function rememberEvent(code: string, title: string) {
  localStorage.setItem(`lea:visited:${code}`, JSON.stringify({ title, at: Date.now() }));
}

export function eventTitle(code: string): string {
  try {
    return JSON.parse(localStorage.getItem(`lea:visited:${code}`) || "{}").title || code;
  } catch {
    return code;
  }
}
