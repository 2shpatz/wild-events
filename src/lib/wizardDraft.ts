/**
 * Keeps the new-event wizard across the trip to Google (connecting another account leaves the page).
 * Text fields go to sessionStorage, images (Blobs) to IndexedDB. Both are cleared once restored.
 */
const KEY = "new-event-draft";
const DB_NAME = "new-event-draft";
const STORE = "blobs";
const MAX_AGE = 60 * 60_000;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function saveDraft<F extends object>(fields: F, blobs: Record<string, Blob>) {
  sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), fields, keys: Object.keys(blobs) }));
  try {
    await withStore("readwrite", (s) => {
      s.clear();
      for (const [k, b] of Object.entries(blobs)) s.put(b, k);
    });
  } catch {
    // Private browsing without IndexedDB: the text survives, the images need picking again.
  }
}

export async function loadDraft<F extends object>(): Promise<{ fields: F; blobs: Record<string, Blob> } | null> {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  let parsed: { at: number; fields: F; keys: string[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (Date.now() - parsed.at > MAX_AGE) {
    await clearDraft();
    return null;
  }
  const blobs: Record<string, Blob> = {};
  try {
    for (const k of parsed.keys) {
      const b = await withStore<Blob>("readonly", (s) => s.get(k));
      if (b) blobs[k] = b;
    }
  } catch {
    /* see saveDraft */
  }
  return { fields: parsed.fields, blobs };
}

export async function clearDraft() {
  sessionStorage.removeItem(KEY);
  try {
    await withStore("readwrite", (s) => {
      s.clear();
    });
  } catch {
    /* nothing stored */
  }
}
