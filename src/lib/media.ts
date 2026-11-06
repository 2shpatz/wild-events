import type { MediaDTO } from "../../shared/types";

/** Google base URL size params: https://developers.google.com/photos/library/guides/access-media-items#base-urls */
export function thumbUrl(m: MediaDTO, width = 480) {
  if (!m.url) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return `${m.url}=w${Math.round(width * dpr)}`;
}

export function fullUrl(m: MediaDTO) {
  if (!m.url) return null;
  const w = Math.min(2560, Math.round(window.innerWidth * Math.min(window.devicePixelRatio || 1, 2)));
  const h = Math.min(2560, Math.round(window.innerHeight * Math.min(window.devicePixelRatio || 1, 2)));
  return `${m.url}=w${w}-h${h}`;
}

export function videoUrl(m: MediaDTO) {
  return m.url ? `${m.url}=dv` : null;
}

export function downloadUrl(m: MediaDTO) {
  if (!m.url) return null;
  return m.kind === "video" ? `${m.url}=dv` : `${m.url}=d`;
}

export function aspect(m: MediaDTO) {
  return m.w && m.h ? m.w / m.h : 4 / 3;
}

/** Deterministic shuffle (stable across re-renders / live updates) seeded per visit. */
export function seededRank(id: string, seed: number) {
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
