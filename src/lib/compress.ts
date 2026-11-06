import type { Quality } from "../../shared/types";

export interface PreparedFile {
  blob: Blob;
  name: string;
  mime: string;
  takenAt: number | null;
  w: number | null;
  h: number | null;
  compressed: boolean;
}

const MAX_EDGE = 2560;
const JPEG_QUALITY = 0.85;

async function readExif(file: Blob) {
  try {
    const exifr = (await import("exifr")).default;
    const tags = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "ExifImageWidth", "ExifImageHeight", "latitude", "longitude", "GPSLatitude", "GPSLongitude", "GPSLatitudeRef", "GPSLongitudeRef"],
      gps: true,
    });
    return tags || {};
  } catch {
    return {};
  }
}

function exifDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function toDegRational(v: number): [number, number][] {
  const abs = Math.abs(v);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60 * 100);
  return [
    [deg, 1],
    [min, 1],
    [sec, 100],
  ];
}

/** Re-inserts capture time (and GPS when allowed) into the compressed JPEG so Google keeps the right date. */
async function withExif(jpeg: Blob, takenAt: Date | null, gps: { lat: number; lon: number } | null) {
  if (!takenAt && !gps) return jpeg;
  try {
    const piexif = (await import("piexifjs")).default;
    const bin = await blobToBinaryString(jpeg);
    const exif: any = { "0th": {}, Exif: {}, GPS: {} };
    exif["0th"][piexif.ImageIFD.Orientation] = 1; // pixels are already rotated
    if (takenAt) {
      exif["0th"][piexif.ImageIFD.DateTime] = exifDate(takenAt);
      exif.Exif[piexif.ExifIFD.DateTimeOriginal] = exifDate(takenAt);
      exif.Exif[piexif.ExifIFD.DateTimeDigitized] = exifDate(takenAt);
    }
    if (gps) {
      exif.GPS[piexif.GPSIFD.GPSLatitudeRef] = gps.lat >= 0 ? "N" : "S";
      exif.GPS[piexif.GPSIFD.GPSLatitude] = toDegRational(gps.lat);
      exif.GPS[piexif.GPSIFD.GPSLongitudeRef] = gps.lon >= 0 ? "E" : "W";
      exif.GPS[piexif.GPSIFD.GPSLongitude] = toDegRational(gps.lon);
    }
    const out = piexif.insert(piexif.dump(exif), bin);
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
    return new Blob([bytes], { type: "image/jpeg" });
  } catch {
    return jpeg;
  }
}

function blobToBinaryString(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsBinaryString(b);
  });
}

async function compressImage(file: File, keepGps: boolean): Promise<PreparedFile> {
  const tags: any = await readExif(file);
  const taken: Date | null = tags.DateTimeOriginal || tags.CreateDate || null;
  const base: PreparedFile = {
    blob: file,
    name: file.name,
    mime: file.type || "image/jpeg",
    takenAt: taken ? taken.getTime() : file.lastModified || null,
    w: tags.ExifImageWidth || null,
    h: tags.ExifImageHeight || null,
    compressed: false,
  };
  if (file.type === "image/gif" || file.type === "image/svg+xml") return base;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return base; // e.g. HEIC on a browser that can't decode it → upload the original (Google supports HEIC)
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  let blob: Blob;
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", JPEG_QUALITY));
  }
  bitmap.close();
  if (blob.size >= file.size) return { ...base, w, h };
  const gps = keepGps && typeof tags.latitude === "number" ? { lat: tags.latitude, lon: tags.longitude } : null;
  blob = await withExif(blob, taken, gps);
  return {
    blob,
    name: file.name.replace(/\.(heic|heif|png|webp|jpe?g)$/i, "") + ".jpg",
    mime: "image/jpeg",
    takenAt: base.takenAt,
    w,
    h,
    compressed: true,
  };
}

const VIDEO_MAX_EDGE = 1920;
const VIDEO_MIN_SIZE_TO_COMPRESS = 25 * 1024 * 1024;

async function compressVideo(file: File, onProgress?: (p: number) => void): Promise<PreparedFile> {
  const base: PreparedFile = {
    blob: file,
    name: file.name,
    mime: file.type || "video/mp4",
    takenAt: file.lastModified || null,
    w: null,
    h: null,
    compressed: false,
  };
  if (file.size < VIDEO_MIN_SIZE_TO_COMPRESS || typeof VideoEncoder === "undefined") return base;
  try {
    const mb = await import("mediabunny");
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) return base;
    const W = track.displayWidth;
    const H = track.displayHeight;
    const landscape = W >= H;
    const needsResize = Math.max(W, H) > VIDEO_MAX_EDGE;
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: {
        ...(needsResize ? (landscape ? { width: VIDEO_MAX_EDGE } : { height: VIDEO_MAX_EDGE }) : {}),
        codec: "avc",
        bitrate: mb.QUALITY_MEDIUM,
      },
      audio: { codec: "aac", bitrate: 128_000 },
    });
    if (!conversion.isValid) return base;
    conversion.onProgress = (p) => onProgress?.(p);
    await conversion.execute();
    const buf = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
    if (!buf || buf.byteLength >= file.size * 0.9) return base;
    const outW = needsResize ? (landscape ? VIDEO_MAX_EDGE : Math.round((W / H) * VIDEO_MAX_EDGE)) : W;
    const outH = needsResize ? (landscape ? Math.round((H / W) * VIDEO_MAX_EDGE) : VIDEO_MAX_EDGE) : H;
    return {
      blob: new Blob([buf], { type: "video/mp4" }),
      name: file.name.replace(/\.[^.]+$/, "") + ".mp4",
      mime: "video/mp4",
      takenAt: base.takenAt,
      w: outW,
      h: outH,
      compressed: true,
    };
  } catch (e) {
    console.warn("video compression skipped", e);
    return base;
  }
}

export async function prepareFile(
  file: File,
  quality: Quality,
  keepGps: boolean,
  onProgress?: (p: number) => void,
): Promise<PreparedFile> {
  const isVideo = file.type.startsWith("video/");
  if (quality === "original") {
    const tags: any = isVideo ? {} : await readExif(file);
    const taken: Date | null = tags.DateTimeOriginal || tags.CreateDate || null;
    return {
      blob: file,
      name: file.name,
      mime: file.type || (isVideo ? "video/mp4" : "image/jpeg"),
      takenAt: taken ? taken.getTime() : file.lastModified || null,
      w: tags.ExifImageWidth || null,
      h: tags.ExifImageHeight || null,
      compressed: false,
    };
  }
  return isVideo ? compressVideo(file, onProgress) : compressImage(file, keepGps);
}
