// 브라우저 전용 업로드 파이프라인. 원본은 변환 없이 보존하고, 썸네일만 앱에서 생성한다.
import { completeMedia, markMediaFailed, registerMedia } from "@/actions/media";
import { createSupabaseBrowserClient } from "@/db/supabase/browser";
import type { MediaLinkEntityType, MediaRole } from "@/domain/enums";
import { MAX_UPLOAD_BYTES, mediaKindFromMime, THUMBNAIL_MAX_PX } from "@/domain/media";

export interface UploadTarget {
  submissionId: string;
  entityType: Extract<MediaLinkEntityType, "submission" | "submission_preparation" | "submission_cooking_step">;
  entityId: string;
  role: MediaRole;
  caption?: string | null;
}

export type UploadOutcome = { ok: true } | { ok: false; error: string };

interface Thumb {
  blob: Blob;
  width: number | null;
  height: number | null;
  duration: number | null;
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8));
}

function drawScaled(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const scale = Math.min(1, THUMBNAIL_MAX_PX / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function imageThumb(file: Blob): Promise<Thumb | null> {
  try {
    // EXIF 방향을 반영해 세로 사진이 눕지 않게
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const blob = await canvasToJpeg(drawScaled(bmp, bmp.width, bmp.height));
    const out = blob ? { blob, width: bmp.width, height: bmp.height, duration: null } : null;
    bmp.close();
    return out;
  } catch {
    return null; // HEIC 등 브라우저가 못 읽는 형식: 원본만 업로드
  }
}

function videoThumb(file: Blob): Promise<Thumb | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let done = false;
    const finish = (t: Thumb | null) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(t);
    };
    const timer = setTimeout(() => finish(null), 8000);
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };
    video.onseeked = async () => {
      clearTimeout(timer);
      const blob = await canvasToJpeg(drawScaled(video, video.videoWidth, video.videoHeight));
      finish(
        blob
          ? { blob, width: video.videoWidth || null, height: video.videoHeight || null, duration: Number.isFinite(video.duration) ? video.duration : null }
          : null,
      );
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}

function audioDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    const finish = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    const timer = setTimeout(() => finish(null), 5000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      finish(Number.isFinite(audio.duration) ? audio.duration : null);
    };
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}

/** 등록된(pending/failed) 미디어에 파일을 올리고 완료 처리. 재시도에도 사용한다. */
export async function uploadToRegistered(
  media: { mediaId: string; storageKey: string; thumbnailKey: string | null },
  file: Blob,
): Promise<UploadOutcome> {
  const supabase = createSupabaseBrowserClient();
  const bucket = supabase.storage.from("media");
  const mime = file.type || "application/octet-stream";

  const { error } = await bucket.upload(media.storageKey, file, { contentType: mime, upsert: true });
  if (error) {
    await markMediaFailed(media.mediaId);
    return { ok: false, error: "Upload failed. Check your connection and retry." };
  }

  const kind = mediaKindFromMime(mime);
  let thumb: Thumb | null = null;
  if (kind === "image") thumb = await imageThumb(file);
  else if (kind === "video") thumb = await videoThumb(file);

  let hasThumbnail = false;
  if (thumb && media.thumbnailKey) {
    const t = await bucket.upload(media.thumbnailKey, thumb.blob, { contentType: "image/jpeg", upsert: true });
    hasThumbnail = !t.error; // 썸네일 실패는 치명적이지 않음
  }
  const duration = kind === "audio" ? await audioDuration(file) : (thumb?.duration ?? null);

  const res = await completeMedia({
    mediaId: media.mediaId,
    hasThumbnail,
    width: thumb?.width ?? null,
    height: thumb?.height ?? null,
    durationSeconds: duration,
  });
  if (!res.ok) {
    await markMediaFailed(media.mediaId);
    return { ok: false, error: res.error };
  }
  return { ok: true };
}

export async function uploadNewFile(file: File, target: UploadTarget): Promise<UploadOutcome> {
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `${file.name}: too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).` };
  }
  const reg = await registerMedia({
    ...target,
    caption: target.caption ?? null,
    fileName: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
  });
  if (!reg.ok) return { ok: false, error: reg.error };
  return uploadToRegistered(reg.data, file);
}
