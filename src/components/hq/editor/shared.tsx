"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { LibraryItem, MediaInfo } from "@/db/manuals";
import type { MediaRef } from "@/domain/manual-content";
import { Field, parseNum, TextInput } from "@/components/ui/form";

// ---------------------------------------------------------------------------
// 편집기 공통 컨텍스트: 미디어 표시 정보 + 라이브러리 + 선택 모달
// ---------------------------------------------------------------------------
export interface EditorMediaCtx {
  media: Record<string, MediaInfo>;
  library: LibraryItem[];
  pick: (opts: { imagesOnly: boolean; multiple: boolean }) => Promise<string[]>;
  readOnly: boolean;
}
export const MediaContext = createContext<EditorMediaCtx | null>(null);
export function useEditorMedia() {
  const ctx = useContext(MediaContext);
  if (!ctx) throw new Error("MediaContext missing");
  return ctx;
}

export function Thumb({ id, className = "" }: { id: string; className?: string }) {
  const { media } = useEditorMedia();
  const m = media[id];
  if (!m) return <div className={`flex items-center justify-center bg-stone-200 text-[10px] text-stone-500 ${className}`}>Unavailable</div>;
  if (m.uploadStatus !== "uploaded") return <div className={`flex items-center justify-center bg-amber-100 text-[10px] text-amber-800 ${className}`}>Incomplete</div>;
  if (m.kind === "image" && m.displayUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.displayUrl} alt="" className={`bg-stone-100 object-contain ${className}`} />;
  if (m.kind === "video" && m.originalUrl) return <video src={m.originalUrl} preload="metadata" muted className={`bg-black object-contain ${className}`} />;
  return <div className={`flex items-center justify-center bg-stone-200 text-[10px] ${className}`}>{m.kind}</div>;
}

/** 단일 미디어 슬롯 (손질 사진, 기준 플레이팅 사진) */
export function MediaSlot({
  value,
  onChange,
  label,
  imagesOnly = true,
  invalid,
}: {
  value: MediaRef | null;
  onChange: (v: MediaRef | null) => void;
  label: string;
  imagesOnly?: boolean;
  invalid?: boolean;
}) {
  const { pick, readOnly } = useEditorMedia();
  return (
    <div>
      <p className={`mb-1 text-[11px] font-bold tracking-wide ${invalid ? "text-red-700" : "text-stone-600"}`}>{label}</p>
      <div className={`aspect-[4/3] overflow-hidden rounded-lg border ${invalid ? "border-red-500 border-2" : "border-stone-200"}`}>
        {value ? <Thumb id={value.media_id} className="h-full w-full" /> : <div className="flex h-full items-center justify-center text-xs text-stone-400">No photo</div>}
      </div>
      {value && (
        <input
          value={value.caption ?? ""}
          onChange={(e) => onChange({ ...value, caption: e.target.value || null })}
          placeholder="Caption"
          disabled={readOnly}
          className="mt-1 w-full rounded border border-stone-200 px-1.5 py-1 text-xs"
        />
      )}
      {!readOnly && (
        <div className="mt-1 flex gap-2 text-xs">
          <button
            type="button"
            className="font-semibold underline"
            onClick={async () => {
              const [id] = await pick({ imagesOnly, multiple: false });
              if (id) onChange({ media_id: id, caption: value?.media_id === id ? value.caption : null });
            }}
          >
            {value ? "Change" : "Choose"}
          </button>
          {value && (
            <button type="button" className="text-red-700 underline" onClick={() => onChange(null)}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 여러 미디어 (조리 단계, 완성품) */
export function MediaList({ value, onChange, imagesOnly = false }: { value: MediaRef[]; onChange: (v: MediaRef[]) => void; imagesOnly?: boolean }) {
  const { pick, readOnly } = useEditorMedia();
  const move = (i: number, d: -1 | 1) => {
    const next = [...value];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((m, i) => (
          <div key={`${m.media_id}-${i}`}>
            <Thumb id={m.media_id} className="aspect-[4/3] w-full rounded-lg" />
            <input
              value={m.caption ?? ""}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, caption: e.target.value || null } : x)))}
              placeholder="Caption"
              disabled={readOnly}
              className="mt-1 w-full rounded border border-stone-200 px-1.5 py-1 text-xs"
            />
            {!readOnly && (
              <div className="mt-0.5 flex gap-2 text-xs">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="disabled:opacity-30">
                  ←
                </button>
                <button type="button" disabled={i === value.length - 1} onClick={() => move(i, 1)} className="disabled:opacity-30">
                  →
                </button>
                <button type="button" className="ml-auto text-red-700 underline" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {!readOnly && value.length < 12 && (
        <button
          type="button"
          className="mt-2 text-sm font-semibold underline"
          onClick={async () => {
            const ids = await pick({ imagesOnly, multiple: true });
            onChange([...value, ...ids.filter((id) => !value.some((v) => v.media_id === id)).map((id) => ({ media_id: id, caption: null }))].slice(0, 12));
          }}
        >
          + Add media
        </button>
      )}
    </div>
  );
}

export function MediaPickerModal({
  library,
  media,
  request,
  onClose,
}: {
  library: LibraryItem[];
  media: Record<string, MediaInfo>;
  request: { imagesOnly: boolean; multiple: boolean } | null;
  onClose: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setSelected([]), [request]);
  if (!request) return null;
  const items = library.filter((l) => l.kind !== "audio" && (!request.imagesOnly || l.kind === "image"));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center border-b border-stone-200 p-4">
          <h2 className="flex-1 font-semibold">Choose {request.imagesOnly ? "photo" : "media"} from linked submissions</h2>
          <button type="button" onClick={() => onClose([])} className="text-sm underline">
            Cancel
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 && <p className="text-sm text-stone-600">No media. Link a field submission with photos first.</p>}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {items.map((l) => {
              const on = selected.includes(l.mediaId);
              return (
                <button
                  key={l.linkId}
                  type="button"
                  onClick={() =>
                    request.multiple ? setSelected(on ? selected.filter((x) => x !== l.mediaId) : [...selected, l.mediaId]) : onClose([l.mediaId])
                  }
                  className={`text-left ${on ? "ring-4 ring-sky-500" : ""} rounded-lg`}
                >
                  <MediaContext.Provider value={{ media, library, pick: async () => [], readOnly: true }}>
                    <Thumb id={l.mediaId} className="aspect-square w-full rounded-lg" />
                  </MediaContext.Provider>
                  <p className="mt-0.5 truncate text-[11px] font-semibold">{l.label}</p>
                  <p className="truncate text-[10px] text-stone-500">{l.caption ?? l.sourceTitle}</p>
                </button>
              );
            })}
          </div>
        </div>
        {request.multiple && (
          <div className="border-t border-stone-200 p-4 text-right">
            <button type="button" disabled={!selected.length} onClick={() => onClose(selected)} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              Add {selected.length || ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 숫자 입력: 문자열 편집 상태를 유지하고 유효할 때만 숫자(또는 null)를 올린다. 빈칸 = null (기본값 없음)
// ---------------------------------------------------------------------------
export function NumField({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => {
    setText((prev) => (parseNum(prev) === value ? prev : value === null ? "" : String(value)));
  }, [value]);
  const invalid = Number.isNaN(parseNum(text));
  return (
    <Field label={label} error={invalid ? "Enter a number" : undefined} hint={hint}>
      <TextInput
        value={text}
        inputMode="decimal"
        disabled={disabled}
        invalid={invalid}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseNum(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </Field>
  );
}

/** 문자열 목록 편집 (합격/불합격 기준, 경고 등) */
export function TextListEditor({
  label,
  value,
  onChange,
  placeholder,
  readOnly,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <ul className="mt-1 space-y-1">
        {value.map((t, i) => (
          <li key={i} className="flex gap-1">
            <input
              value={t}
              disabled={readOnly}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))}
              className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm"
            />
            {!readOnly && (
              <button type="button" aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))} className="px-2 text-red-700">
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <button type="button" onClick={() => onChange([...value, ""])} className="mt-1 text-sm underline">
          + {placeholder ?? "Add"}
        </button>
      )}
    </div>
  );
}
