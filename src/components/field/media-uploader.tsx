"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { removeMediaLink, updateMediaCaption } from "@/actions/media";
import type { MediaItem } from "@/db/submissions";
import { formatBytes } from "@/domain/media";
import { uploadNewFile, uploadToRegistered, type UploadTarget } from "@/lib/upload-client";

type Accept = "image" | "video" | "media";
const ACCEPT: Record<Accept, string> = { image: "image/*", video: "video/*", media: "image/*,video/*" };

interface QueueItem {
  key: string;
  name: string;
  state: "uploading" | "error";
  error?: string;
  file: File;
}

export function MediaUploader({
  target,
  items,
  editable,
  accept = "image",
  label,
  emptyHint,
  canAdd = true,
}: {
  target: UploadTarget;
  items: MediaItem[];
  editable: boolean;
  accept?: Accept;
  label?: string;
  emptyHint?: string;
  /** false: 목록/캡션/삭제만 (추가는 다른 컴포넌트가 담당, 예: 음성 녹음기) */
  canAdd?: boolean;
}) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const retryRef = useRef<HTMLInputElement>(null);
  const [retryTarget, setRetryTarget] = useState<MediaItem | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [, startTransition] = useTransition();

  async function runUploads(files: File[]) {
    const entries = files.map((file) => ({ key: crypto.randomUUID(), name: file.name, state: "uploading" as const, file }));
    setQueue((q) => [...q, ...entries]);
    // 모바일 회선 부담을 줄이려고 순차 업로드
    for (const entry of entries) {
      const res = await uploadNewFile(entry.file, target);
      setQueue((q) =>
        res.ok ? q.filter((x) => x.key !== entry.key) : q.map((x) => (x.key === entry.key ? { ...x, state: "error", error: res.error } : x)),
      );
    }
    startTransition(() => router.refresh());
  }

  async function retryQueued(entry: QueueItem) {
    setQueue((q) => q.filter((x) => x.key !== entry.key));
    await runUploads([entry.file]);
  }

  async function retryRegistered(item: MediaItem, file: File) {
    const key = crypto.randomUUID();
    setQueue((q) => [...q, { key, name: file.name, state: "uploading", file }]);
    const res = await uploadToRegistered(item, file);
    setQueue((q) => (res.ok ? q.filter((x) => x.key !== key) : q.map((x) => (x.key === key ? { ...x, state: "error", error: res.error } : x))));
    startTransition(() => router.refresh());
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) void runUploads(files);
  };

  return (
    <div data-autosave-ignore>
      {label && <p className="text-sm font-medium text-stone-800">{label}</p>}
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((m) => (
          <MediaTile
            key={m.linkId}
            item={m}
            editable={editable}
            onRetry={() => {
              setRetryTarget(m);
              retryRef.current?.click();
            }}
          />
        ))}
        {queue.map((q) => (
          <div key={q.key} className="flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 p-2 text-center text-xs">
            <span className="line-clamp-2 break-all text-stone-600">{q.name}</span>
            {q.state === "uploading" ? (
              <span className="mt-1 animate-pulse text-sky-700">Uploading…</span>
            ) : (
              <>
                <span className="mt-1 text-red-700">{q.error}</span>
                <button type="button" className="mt-1 font-semibold underline" onClick={() => void retryQueued(q)}>
                  Retry
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      {items.length === 0 && queue.length === 0 && emptyHint && <p className="mt-1 text-xs text-stone-500">{emptyHint}</p>}

      {editable && canAdd && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="min-h-11 rounded-lg bg-stone-900 px-3 text-sm font-semibold text-white"
          >
            {accept === "video" ? "Record video" : "Take photo"}
          </button>
          <button
            type="button"
            onClick={() => filesRef.current?.click()}
            className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold"
          >
            Choose files
          </button>
          <input ref={cameraRef} type="file" accept={accept === "video" ? "video/*" : "image/*"} capture="environment" hidden onChange={onPick} />
          <input ref={filesRef} type="file" accept={ACCEPT[accept]} multiple hidden onChange={onPick} />
          <input
            ref={retryRef}
            type="file"
            accept={ACCEPT[accept]}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file && retryTarget) void retryRegistered(retryTarget, file);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MediaTile({ item, editable, onRetry }: { item: MediaItem; editable: boolean; onRetry: () => void }) {
  const router = useRouter();
  const [caption, setCaption] = useState(item.caption ?? "");
  const [busy, setBusy] = useState(false);
  const done = item.uploadStatus === "uploaded";

  return (
    <div className="flex flex-col">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-stone-200">
        {done && item.kind === "image" && item.displayUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- private signed URL, 최적화 대상 아님
          <a href={item.originalUrl ?? item.displayUrl} target="_blank" rel="noreferrer">
            <img src={item.displayUrl} alt={item.caption ?? item.role} className="h-full w-full object-contain" />
          </a>
        )}
        {done && item.kind === "video" && item.originalUrl && (
          <video src={item.originalUrl} controls playsInline preload="metadata" className="h-full w-full object-contain" />
        )}
        {done && item.kind === "audio" && item.originalUrl && (
          <div className="flex h-full items-center p-1">
            <audio src={item.originalUrl} controls className="w-full" />
          </div>
        )}
        {!done && (
          <div className="flex h-full flex-col items-center justify-center p-2 text-center text-xs">
            <span className={item.uploadStatus === "failed" ? "text-red-700" : "text-amber-700"}>
              {item.uploadStatus === "failed" ? "Upload failed" : "Upload incomplete"}
            </span>
            {editable && (
              <button type="button" onClick={onRetry} className="mt-1 font-semibold underline">
                Choose file again
              </button>
            )}
          </div>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-stone-500">{formatBytes(item.sizeBytes)}</p>
      {editable ? (
        <>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={() => {
              if (caption !== (item.caption ?? "")) void updateMediaCaption(item.linkId, caption);
            }}
            placeholder="Caption"
            className="mt-0.5 w-full rounded border border-stone-200 px-1.5 py-1 text-xs"
          />
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!confirm("Remove this file from the submission?")) return;
              setBusy(true);
              await removeMediaLink(item.linkId);
              router.refresh();
            }}
            className="mt-0.5 self-start text-xs text-red-700 underline"
          >
            Remove
          </button>
        </>
      ) : (
        item.caption && <p className="mt-0.5 text-xs text-stone-700">{item.caption}</p>
      )}
    </div>
  );
}
