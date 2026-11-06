const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export function randomId(bytes = 16): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Short, human friendly event code (no ambiguous characters). */
export function eventCode(len = 6): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const rnd = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(rnd, (b) => alphabet[b % alphabet.length]).join("");
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function aesKey(rawB64: string): Promise<CryptoKey> {
  let k = keyCache.get(rawB64);
  if (!k) {
    k = crypto.subtle.importKey("raw", fromB64url(rawB64), "AES-GCM", false, ["encrypt", "decrypt"]);
    keyCache.set(rawB64, k);
  }
  return k;
}

export async function encrypt(keyB64: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(keyB64), enc.encode(plain));
  return `${b64url(iv)}.${b64url(ct)}`;
}

export async function decrypt(keyB64: string, payload: string): Promise<string> {
  const [iv, ct] = payload.split(".");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64url(iv) },
    await aesKey(keyB64),
    fromB64url(ct),
  );
  return dec.decode(pt);
}

const hmacCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let k = hmacCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]);
    hmacCache.set(secret, k);
  }
  return k;
}

export async function sign(secret: string, data: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(data));
  return b64url(sig).slice(0, 32);
}

export async function verifySig(secret: string, data: string, sig: string): Promise<boolean> {
  const expected = await sign(secret, data);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

// PBKDF2 with modest iterations: Workers Free has a 10ms CPU budget per request.
const PBKDF2_ITER = 10_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${b64url(salt)}$${b64url(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, iter, salt, hash] = stored.split("$");
  if (alg !== "pbkdf2") return false;
  const bits = b64url(await pbkdf2(password, fromB64url(salt), Number(iter)));
  if (bits.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

export async function sha256(data: ArrayBuffer | Uint8Array): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", data)).slice(0, 22);
}
