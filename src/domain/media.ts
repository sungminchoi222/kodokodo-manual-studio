import type { MediaKind } from "./enums";

/** Supabase Free 플랜의 파일당 업로드 한도. 플랜 변경 시 함께 조정. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const THUMBNAIL_MAX_PX = 480;

export function mediaKindFromMime(mime: string): MediaKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
};

export function fileExtension(fileName: string, mime: string): string {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(fileName)?.[1]?.toLowerCase();
  return fromName ?? MIME_EXT[mime.split(";")[0] ?? ""] ?? "bin";
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
