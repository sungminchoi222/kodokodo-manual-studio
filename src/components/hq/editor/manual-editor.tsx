"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { buildImportBlocks, linkSubmission, saveDraftContent, saveManualMeta, unlinkSubmission } from "@/actions/manuals";
import type { LibraryItem, ManualEditorData, MediaInfo } from "@/db/manuals";
import { LOCALES, MANUAL_TYPES } from "@/domain/enums";
import type { Block, ManualDraftContent } from "@/domain/manual-content";
import { assembleManualContent } from "@/manual/assemble";
import { checkPublish, type PublishIssue } from "@/validation/publish-checks";
import { Button, Field, Select, TextArea, TextInput } from "@/components/ui/form";
import { BLOCK_LABEL, BlockEditor, newBlock } from "./block-editors";
import { MediaContext, MediaPickerModal, NumField, TextListEditor, Thumb } from "./shared";
import { ServingPanel, StoragePanel } from "./standards-panel";

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";
type Tab = "checks" | "standards" | "quality" | "details";

export interface LinkableSubmission {
  id: string;
  title: string;
  capture_mode: string;
  status: string;
}

export function ManualEditor({
  data,
  canEdit,
  canVerify,
  linkable,
}: {
  data: ManualEditorData;
  canEdit: boolean;
  canVerify: boolean;
  linkable: LinkableSubmission[];
}) {
  const router = useRouter();
  const manualId = data.manual.id;
  const [content, setContent] = useState<ManualDraftContent>(data.draft.content);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const versionRef = useRef(data.draft.version);
  const firstRender = useRef(true);
  const [tab, setTab] = useState<Tab>("checks");
  const [pickReq, setPickReq] = useState<{ imagesOnly: boolean; multiple: boolean } | null>(null);
  const pickResolve = useRef<((ids: string[]) => void) | null>(null);
  const readOnly = !canEdit || saveState === "conflict";

  // ---- autosave (낙관적 버전 체크) ----
  const flush = useCallback(
    async (next: ManualDraftContent) => {
      setSaveState("saving");
      const r = await saveDraftContent(manualId, versionRef.current, next);
      if (r.ok) {
        versionRef.current = r.data.version;
        setSaveState((s) => (s === "saving" ? "saved" : s));
        setSaveError(null);
      } else if (r.error.startsWith("CONFLICT")) {
        setSaveState("conflict");
        setSaveError(r.error.replace("CONFLICT: ", ""));
      } else {
        setSaveState("error");
        const first = r.fieldErrors ? Object.entries(r.fieldErrors)[0] : undefined;
        setSaveError(first ? `${r.error} (${first[0]}: ${first[1]})` : r.error);
      }
    },
    [manualId],
  );

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!canEdit || saveState === "conflict") return;
    setSaveState("dirty");
    const t = setTimeout(() => void flush(content), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 내용 변경에만 반응
  }, [content]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === "dirty" || saveState === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  // ---- 실시간 발행 검사 (서버와 같은 순수 함수) ----
  const issues = useMemo(() => {
    const assembled = assembleManualContent({
      manual: data.manual,
      brand: data.brand,
      applicableStores: data.brandStores.filter((s) => data.applicableStoreIds.includes(s.id)),
      draft: content,
      storageRows: data.storageRows,
      servingRows: data.servingRows,
      mediaMeta: Object.fromEntries(Object.values(data.media).map((m) => [m.mediaId, { kind: m.kind, mime: m.mime, width: m.width, height: m.height }])),
      profileNames: data.profileNames,
      sourceSubmissionIds: data.sources.map((s) => s.submission.id),
      hqDirectSourceNote: data.draft.hqDirectSourceNote,
    });
    const media = Object.fromEntries(Object.values(data.media).map((m) => [m.mediaId, { uploaded: m.uploadStatus === "uploaded", kind: m.kind }]));
    return checkPublish({ content: assembled, media, hasPreviousVersion: Boolean(data.manual.active_version_id) });
  }, [content, data]);

  const pick = useCallback((opts: { imagesOnly: boolean; multiple: boolean }) => {
    setPickReq(opts);
    return new Promise<string[]>((resolve) => {
      pickResolve.current = resolve;
    });
  }, []);

  const setBlocks = (fn: (b: Block[]) => Block[]) => setContent((c) => ({ ...c, blocks: fn(c.blocks) }));
  const updateBlock = (id: string, b: Block) => setBlocks((bs) => bs.map((x) => (x.id === id ? b : x)));
  const moveBlock = (i: number, d: -1 | 1) =>
    setBlocks((bs) => {
      const next = [...bs];
      const [x] = next.splice(i, 1);
      next.splice(i + d, 0, x!);
      return next;
    });

  let stepCounter = 0;
  const blockIssues = (id: string) => issues.filter((i) => i.path === `blocks.${id}` || i.path.startsWith(`blocks.${id}.`));

  return (
    <MediaContext.Provider value={{ media: data.media, library: data.library, pick, readOnly }}>
      <SaveBanner state={saveState} error={saveError} canEdit={canEdit} onReload={() => window.location.reload()} />
      {data.draft.parseError && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          Stored draft content could not be read ({data.draft.parseError}). Editing is shown from an empty body — do not save until this is resolved.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)_380px]">
        {/* ---- left: sources & media ---- */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
          <SourcesPanel
            manualId={manualId}
            sources={data.sources}
            linkable={linkable}
            canEdit={!readOnly}
            onImport={(blocks) => setBlocks((bs) => [...bs, ...blocks])}
            onChanged={() => router.refresh()}
          />
          <section>
            <h3 className="text-sm font-semibold">Media library ({data.library.length})</h3>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {data.library
                .filter((l) => l.kind !== "audio")
                .map((l) => (
                  <a key={l.linkId} href={l.originalUrl ?? "#"} target="_blank" rel="noreferrer" title={`${l.label} — ${l.caption ?? l.sourceTitle}`}>
                    <Thumb id={l.mediaId} className="aspect-square w-full rounded" />
                    <p className="truncate text-[10px]">{l.label}</p>
                  </a>
                ))}
            </div>
            {data.library.some((l) => l.kind === "audio") && (
              <div className="mt-2 space-y-1">
                {data.library
                  .filter((l) => l.kind === "audio")
                  .map((l) => (
                    <audio key={l.linkId} src={l.originalUrl ?? undefined} controls className="w-full" />
                  ))}
              </div>
            )}
          </section>
        </aside>

        {/* ---- center: builder ---- */}
        <main className="min-w-0 space-y-3">
          {content.blocks.map((b, i) => {
            if (b.type === "step") stepCounter += 1;
            const bi = blockIssues(b.id);
            return (
              <div key={b.id} id={`block-${b.id}`} className={`rounded-xl border bg-white p-4 ${bi.length ? "border-red-300" : "border-stone-200"}`}>
                <div className="mb-2 flex items-center gap-2 text-xs text-stone-500">
                  <span className="flex-1 font-semibold uppercase tracking-wide">{BLOCK_LABEL[b.type]}</span>
                  {!readOnly && (
                    <>
                      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveBlock(i, -1)} className="h-7 w-7 rounded border disabled:opacity-30">
                        ↑
                      </button>
                      <button type="button" aria-label="Move down" disabled={i === content.blocks.length - 1} onClick={() => moveBlock(i, 1)} className="h-7 w-7 rounded border disabled:opacity-30">
                        ↓
                      </button>
                      <button type="button" onClick={() => confirm("Delete this block?") && setBlocks((bs) => bs.filter((x) => x.id !== b.id))} className="px-1 text-red-700 underline">
                        Delete
                      </button>
                    </>
                  )}
                </div>
                <BlockEditor block={b} onChange={(nb) => updateBlock(b.id, nb)} issues={bi} stepNo={stepCounter} />
                {bi.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-xs text-red-700">
                    {bi.map((x, n) => (
                      <li key={n}>{x.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {content.blocks.length === 0 && (
            <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-600">
              Empty manual. Import a linked submission (left) or add blocks below.
            </p>
          )}
          {!readOnly && <AddBlockBar onAdd={(type) => setBlocks((bs) => [...bs, newBlock(type, crypto.randomUUID())])} />}
        </main>

        {/* ---- right: checks / standards / quality / details ---- */}
        <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
          <div className="mb-3 grid grid-cols-4 gap-1 rounded-lg bg-stone-200 p-1 text-xs font-semibold">
            {(["checks", "standards", "quality", "details"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-md py-1.5 capitalize ${tab === t ? "bg-white shadow" : ""}`}>
                {t === "checks" ? `Checks (${issues.length})` : t}
              </button>
            ))}
          </div>
          {tab === "checks" && <ChecksPanel issues={issues} onGoto={setTab} />}
          {tab === "standards" && (
            <div className="space-y-6">
              <StoragePanel manualId={manualId} rows={data.storageRows} names={data.profileNames} canVerify={canVerify} issues={issues} />
              <ServingPanel manualId={manualId} rows={data.servingRows} names={data.profileNames} canVerify={canVerify} issues={issues} />
            </div>
          )}
          {tab === "quality" && <QualityPanel content={content} setContent={setContent} readOnly={readOnly} />}
          {tab === "details" && (
            <DetailsPanel
              data={data}
              readOnly={readOnly}
              onSaved={(v) => {
                versionRef.current = v;
                router.refresh();
              }}
            />
          )}
        </aside>
      </div>

      <MediaPickerModal
        library={data.library}
        media={data.media}
        request={pickReq}
        onClose={(ids) => {
          setPickReq(null);
          pickResolve.current?.(ids);
          pickResolve.current = null;
        }}
      />
    </MediaContext.Provider>
  );
}

function SaveBanner({ state, error, canEdit, onReload }: { state: SaveState; error: string | null; canEdit: boolean; onReload: () => void }) {
  if (!canEdit) return <p className="mb-3 text-sm text-stone-600">Read-only.</p>;
  const label = { saved: "All changes saved", dirty: "Unsaved changes…", saving: "Saving…", error: "Save failed", conflict: "Conflict" }[state];
  return (
    <div
      className={`mb-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
        state === "conflict" || state === "error" ? "bg-red-50 text-red-800" : state === "saved" ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-700"
      }`}
      role="status"
    >
      <span className="font-semibold">{label}</span>
      {error && <span className="min-w-0 flex-1 truncate">{error}</span>}
      {state === "conflict" && (
        <button type="button" onClick={onReload} className="ml-auto font-semibold underline">
          Reload latest
        </button>
      )}
    </div>
  );
}

function AddBlockBar({ onAdd }: { onAdd: (t: Block["type"]) => void }) {
  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-dashed border-stone-300 p-3">
      <span className="self-center text-xs font-semibold text-stone-500">Add:</span>
      {(Object.keys(BLOCK_LABEL) as Block["type"][]).map((t) => (
        <button key={t} type="button" onClick={() => onAdd(t)} className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold">
          {t === "photo_trio" ? "Prep card" : BLOCK_LABEL[t]}
        </button>
      ))}
    </div>
  );
}

function ChecksPanel({ issues, onGoto }: { issues: PublishIssue[]; onGoto: (t: Tab) => void }) {
  if (!issues.length) return <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Ready for approval — no blocking issues.</p>;
  const go = (i: PublishIssue) => {
    if (i.path.startsWith("storage") || i.path.startsWith("serving")) return onGoto("standards");
    if (i.path.startsWith("meta")) return onGoto("details");
    const id = /^blocks\.([^.]+)/.exec(i.path)?.[1];
    if (id) document.getElementById(`block-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return (
    <div>
      <p className="mb-2 text-xs text-stone-600">These block publishing. Values are never filled in automatically.</p>
      <ul className="space-y-1">
        {issues.map((i, n) => (
          <li key={n}>
            <button type="button" onClick={() => go(i)} className="w-full rounded-lg bg-red-50 px-2 py-1.5 text-left text-xs text-red-900 hover:bg-red-100">
              {i.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QualityPanel({
  content,
  setContent,
  readOnly,
}: {
  content: ManualDraftContent;
  setContent: (fn: (c: ManualDraftContent) => ManualDraftContent) => void;
  readOnly: boolean;
}) {
  const q = content.quality;
  const set = (patch: Partial<ManualDraftContent["quality"]>) => setContent((c) => ({ ...c, quality: { ...c.quality, ...patch } }));
  return (
    <div className="space-y-5">
      <TextListEditor label="Accept when (QC)" value={q.acceptance_criteria} onChange={(v) => set({ acceptance_criteria: v })} placeholder="Add criterion" readOnly={readOnly} />
      <TextListEditor label="Reject / redo when" value={q.rejection_criteria} onChange={(v) => set({ rejection_criteria: v })} placeholder="Add criterion" readOnly={readOnly} />
      <TextListEditor label="Critical warnings" value={q.critical_warnings} onChange={(v) => set({ critical_warnings: v })} placeholder="Add warning" readOnly={readOnly} />
      <Field label="Allergen notes" hint="Verify against supplier documents.">
        <TextArea value={q.allergen_notes ?? ""} disabled={readOnly} rows={3} onChange={(e) => set({ allergen_notes: e.target.value || null })} />
      </Field>
      <div>
        <p className="text-sm font-medium">Sauce rules</p>
        {q.sauce_rules.map((r, i) => (
          <div key={i} className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-stone-200 p-2">
            <Field label="Sauce">
              <TextInput value={r.sauce} disabled={readOnly} onChange={(e) => set({ sauce_rules: q.sauce_rules.map((x, j) => (j === i ? { ...x, sauce: e.target.value } : x)) })} />
            </Field>
            <Field label="Condition">
              <TextInput
                value={r.condition ?? ""}
                disabled={readOnly}
                onChange={(e) => set({ sauce_rules: q.sauce_rules.map((x, j) => (j === i ? { ...x, condition: e.target.value || null } : x)) })}
              />
            </Field>
            <NumField label="Amount" value={r.amount} disabled={readOnly} onChange={(v) => set({ sauce_rules: q.sauce_rules.map((x, j) => (j === i ? { ...x, amount: v } : x)) })} />
            <Field label="Unit">
              <TextInput value={r.unit ?? ""} disabled={readOnly} onChange={(e) => set({ sauce_rules: q.sauce_rules.map((x, j) => (j === i ? { ...x, unit: e.target.value || null } : x)) })} />
            </Field>
            {!readOnly && (
              <button type="button" onClick={() => set({ sauce_rules: q.sauce_rules.filter((_, j) => j !== i) })} className="col-span-2 text-left text-xs text-red-700 underline">
                Remove
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button type="button" onClick={() => set({ sauce_rules: [...q.sauce_rules, { sauce: "", amount: null, unit: null, condition: null }] })} className="mt-1 text-sm underline">
            + Sauce rule
          </button>
        )}
      </div>
    </div>
  );
}

function DetailsPanel({ data, readOnly, onSaved }: { data: ManualEditorData; readOnly: boolean; onSaved: (version: number) => void }) {
  const m = data.manual;
  const [f, setF] = useState({
    title: m.title,
    station: m.station,
    manual_type: m.manual_type,
    display_language: m.display_language,
    store_scope: m.store_scope,
    store_ids: data.applicableStoreIds,
    hq_direct_source_note: data.draft.hqDirectSourceNote ?? "",
  });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="space-y-3">
      <Field label="Title">
        <TextInput value={f.title} disabled={readOnly} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={160} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Station">
          <TextInput value={f.station} disabled={readOnly} onChange={(e) => setF({ ...f, station: e.target.value })} maxLength={60} />
        </Field>
        <Field label="Language">
          <Select value={f.display_language} disabled={readOnly} onChange={(e) => setF({ ...f, display_language: e.target.value as typeof f.display_language })}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Manual type" hint={m.active_version_id ? "Locked after first publication" : "Sets which fields are required to publish"}>
        <Select value={f.manual_type} disabled={readOnly || !!m.active_version_id} onChange={(e) => setF({ ...f, manual_type: e.target.value as typeof f.manual_type })}>
          {MANUAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Applies to">
        <Select value={f.store_scope} disabled={readOnly} onChange={(e) => setF({ ...f, store_scope: e.target.value as typeof f.store_scope })}>
          <option value="brand_all">All stores of {data.brand.name}</option>
          <option value="selected_stores">Selected stores</option>
        </Select>
      </Field>
      {f.store_scope === "selected_stores" && (
        <div className="space-y-1 rounded-lg border border-stone-200 p-2">
          {data.brandStores.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={f.store_ids.includes(s.id)}
                onChange={(e) => setF({ ...f, store_ids: e.target.checked ? [...f.store_ids, s.id] : f.store_ids.filter((x) => x !== s.id) })}
              />
              {s.name}
            </label>
          ))}
        </div>
      )}
      <Field label="HQ source note" hint="Required only when no field submission is linked.">
        <TextArea value={f.hq_direct_source_note} disabled={readOnly} rows={2} onChange={(e) => setF({ ...f, hq_direct_source_note: e.target.value })} />
      </Field>
      <p className="text-xs text-stone-500">Document code: {m.document_code}</p>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
      {!readOnly && (
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveManualMeta(m.id, { ...f, hq_direct_source_note: f.hq_direct_source_note.trim() || null });
              if (r.ok) {
                setMsg({ ok: true, text: "Saved." });
                onSaved(r.data.version);
              } else setMsg({ ok: false, text: r.fieldErrors ? `${r.error} ${Object.values(r.fieldErrors).join(" ")}` : r.error });
            })
          }
        >
          Save details
        </Button>
      )}
    </div>
  );
}

function SourcesPanel({
  manualId,
  sources,
  linkable,
  canEdit,
  onImport,
  onChanged,
}: {
  manualId: string;
  sources: ManualEditorData["sources"];
  linkable: LinkableSubmission[];
  canEdit: boolean;
  onImport: (blocks: Block[]) => void;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [linkId, setLinkId] = useState("");
  const linked = new Set(sources.map((s) => s.submission.id));

  return (
    <section>
      <h3 className="text-sm font-semibold">Field submissions</h3>
      <ul className="mt-2 space-y-2">
        {sources.map(({ submission: s }) => (
          <li key={s.id} className="rounded-lg border border-stone-200 bg-white p-2 text-xs">
            <Link href={`/hq/inbox/${s.id}`} className="font-semibold underline" target="_blank">
              {s.title}
            </Link>
            <p className="text-stone-500">{s.capture_mode}</p>
            {canEdit && (
              <div className="mt-1 flex gap-3">
                <button
                  type="button"
                  disabled={pending}
                  className="font-semibold underline"
                  onClick={() =>
                    start(async () => {
                      const r = await buildImportBlocks(manualId, s.id);
                      if (r.ok) onImport(r.data.blocks);
                      else setError(r.error);
                    })
                  }
                >
                  Import into draft
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className="text-red-700 underline"
                  onClick={() =>
                    confirm("Unlink this submission? Media already placed stays in the draft.") &&
                    start(async () => {
                      await unlinkSubmission(manualId, s.id);
                      onChanged();
                    })
                  }
                >
                  Unlink
                </button>
              </div>
            )}
          </li>
        ))}
        {sources.length === 0 && <li className="text-xs text-stone-500">None linked.</li>}
      </ul>
      {canEdit && (
        <div className="mt-2 flex gap-1">
          <select value={linkId} onChange={(e) => setLinkId(e.target.value)} className="min-w-0 flex-1 rounded border border-stone-300 px-1 py-1 text-xs">
            <option value="">Link a submission…</option>
            {linkable
              .filter((l) => !linked.has(l.id))
              .map((l) => (
                <option key={l.id} value={l.id}>
                  [{l.status}] {l.title}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={!linkId || pending}
            onClick={() =>
              start(async () => {
                const r = await linkSubmission(manualId, linkId);
                if (!r.ok) setError(r.error);
                setLinkId("");
                onChanged();
              })
            }
            className="rounded bg-stone-900 px-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            Link
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </section>
  );
}

export type { LibraryItem, MediaInfo };
