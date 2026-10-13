"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteServingStandard,
  deleteStorageStandard,
  saveServingStandard,
  saveStorageStandard,
  setStandardVerified,
} from "@/actions/manuals";
import type { ActionResult } from "@/actions/result";
import { PORTION_UNITS, PRODUCT_STATES, SHELF_LIFE_START_EVENTS, SHELF_LIFE_UNITS, STORAGE_METHODS } from "@/domain/enums";
import { PRODUCT_STATE_LABEL, SHELF_LIFE_EVENT_LABEL, STORAGE_METHOD_LABEL, type MediaRef } from "@/domain/manual-content";
import type { ServingStandardRow, StorageStandardRow } from "@/domain/types";
import type { PublishIssue } from "@/validation/publish-checks";
import { formatDateTime } from "@/lib/format";
import { Button, Field, Select, TextArea, TextInput } from "@/components/ui/form";
import { MediaSlot, NumField, useEditorMedia } from "./shared";

const orNull = (s: string) => (s.trim() === "" ? null : s);
const num = (v: number | string | null) => (v === null ? null : Number(v));

function useRowAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, result, run };
}

function VerifyBar({
  verifiedBy,
  verifiedAt,
  names,
  canVerify,
  dirty,
  onVerify,
  pending,
}: {
  verifiedBy: string | null;
  verifiedAt: string | null;
  names: Record<string, string>;
  canVerify: boolean;
  dirty: boolean;
  onVerify: (v: boolean) => void;
  pending: boolean;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${verifiedBy ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
      {verifiedBy ? (
        <span>
          ✓ Verified by {names[verifiedBy] ?? "approver"} · {formatDateTime(verifiedAt)}
        </span>
      ) : (
        <span className="font-semibold">Not verified — NEEDS HQ CONFIRMATION</span>
      )}
      {canVerify && (
        <button
          type="button"
          disabled={pending || dirty}
          title={dirty ? "Save changes first" : undefined}
          onClick={() => onVerify(!verifiedBy)}
          className="ml-auto rounded border border-current px-2 py-0.5 font-semibold disabled:opacity-40"
        >
          {verifiedBy ? "Remove verification" : "Verify as approver"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Storage & shelf life (상태별 1행)
// ---------------------------------------------------------------------------
type StorageForm = {
  product_state: (typeof PRODUCT_STATES)[number];
  product_state_note: string;
  storage_method: string;
  storage_method_note: string;
  temperature_min_c: number | null;
  temperature_max_c: number | null;
  shelf_life_value: number | null;
  shelf_life_unit: string;
  shelf_life_start_event: string;
  start_event_description: string;
  label_instructions: string;
  container_and_cover: string;
  disposal_rule: string;
  reference_note: string;
};

function storageForm(r: StorageStandardRow | null, state: StorageForm["product_state"]): StorageForm {
  return {
    product_state: r?.product_state ?? state,
    product_state_note: r?.product_state_note ?? "",
    storage_method: r?.storage_method ?? "",
    storage_method_note: r?.storage_method_note ?? "",
    temperature_min_c: num(r?.temperature_min_c ?? null),
    temperature_max_c: num(r?.temperature_max_c ?? null),
    shelf_life_value: num(r?.shelf_life_value ?? null),
    shelf_life_unit: r?.shelf_life_unit ?? "",
    shelf_life_start_event: r?.shelf_life_start_event ?? "",
    start_event_description: r?.start_event_description ?? "",
    label_instructions: r?.label_instructions ?? "",
    container_and_cover: r?.container_and_cover ?? "",
    disposal_rule: r?.disposal_rule ?? "",
    reference_note: r?.reference_note ?? "",
  };
}

function StorageRowEditor({
  manualId,
  row,
  usedStates,
  names,
  canVerify,
  issues,
  onDone,
}: {
  manualId: string;
  row: StorageStandardRow | null;
  usedStates: string[];
  names: Record<string, string>;
  canVerify: boolean;
  issues: PublishIssue[];
  onDone?: () => void;
}) {
  const firstFree = PRODUCT_STATES.find((s) => s === "other" || !usedStates.includes(s)) ?? "other";
  const [f, setF] = useState<StorageForm>(() => storageForm(row, firstFree));
  const [dirty, setDirty] = useState(row === null);
  const { pending, result, run } = useRowAction();
  const set = <K extends keyof StorageForm>(k: K, v: StorageForm[K]) => {
    setF({ ...f, [k]: v });
    setDirty(true);
  };
  const err = (k: string) => (result && !result.ok ? result.fieldErrors?.[k] : undefined);
  const rowIssues = row ? issues.filter((i) => i.path.startsWith(`storage.${row.product_state}`)) : [];

  const save = () =>
    run(
      () =>
        saveStorageStandard(manualId, row?.id ?? null, {
          product_state: f.product_state,
          product_state_note: orNull(f.product_state_note),
          storage_method: (orNull(f.storage_method) as StorageStandardRow["storage_method"]) ?? null,
          storage_method_note: orNull(f.storage_method_note),
          temperature_min_c: f.temperature_min_c,
          temperature_max_c: f.temperature_max_c,
          shelf_life_value: f.shelf_life_value,
          shelf_life_unit: (orNull(f.shelf_life_unit) as StorageStandardRow["shelf_life_unit"]) ?? null,
          shelf_life_start_event: (orNull(f.shelf_life_start_event) as StorageStandardRow["shelf_life_start_event"]) ?? null,
          start_event_description: orNull(f.start_event_description),
          label_instructions: orNull(f.label_instructions),
          container_and_cover: orNull(f.container_and_cover),
          disposal_rule: orNull(f.disposal_rule),
          reference_note: orNull(f.reference_note),
        }),
      () => {
        setDirty(false);
        onDone?.();
      },
    );

  return (
    <div id={row ? `storage-${row.product_state}` : undefined} className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Product state" error={err("product_state")}>
          <Select value={f.product_state} disabled={!!row} onChange={(e) => set("product_state", e.target.value as StorageForm["product_state"])}>
            {PRODUCT_STATES.map((s) => (
              <option key={s} value={s} disabled={s !== "other" && s !== row?.product_state && usedStates.includes(s)}>
                {PRODUCT_STATE_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="State note">
          <TextInput value={f.product_state_note} onChange={(e) => set("product_state_note", e.target.value)} placeholder="e.g. marinated" />
        </Field>
        <Field label="Storage method" error={err("storage_method")}>
          <Select value={f.storage_method} onChange={(e) => set("storage_method", e.target.value)}>
            <option value="">— not set —</option>
            {STORAGE_METHODS.map((m) => (
              <option key={m} value={m}>
                {STORAGE_METHOD_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Method note" error={err("storage_method_note")}>
          <TextInput value={f.storage_method_note} onChange={(e) => set("storage_method_note", e.target.value)} />
        </Field>
        <NumField label="Min °C" value={f.temperature_min_c} onChange={(v) => set("temperature_min_c", v)} />
        <NumField label="Max °C" value={f.temperature_max_c} onChange={(v) => set("temperature_max_c", v)} />
        <NumField label="Use within" value={f.shelf_life_value} onChange={(v) => set("shelf_life_value", v)} />
        <Field label="Unit" error={err("shelf_life_unit")}>
          <Select value={f.shelf_life_unit} onChange={(e) => set("shelf_life_unit", e.target.value)}>
            <option value="">—</option>
            {SHELF_LIFE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Counted from">
          <Select value={f.shelf_life_start_event} onChange={(e) => set("shelf_life_start_event", e.target.value)}>
            <option value="">— not set —</option>
            {SHELF_LIFE_START_EVENTS.map((s) => (
              <option key={s} value={s}>
                {SHELF_LIFE_EVENT_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Custom start event" error={err("start_event_description")}>
          <TextInput value={f.start_event_description} onChange={(e) => set("start_event_description", e.target.value)} disabled={f.shelf_life_start_event !== "custom"} />
        </Field>
      </div>
      {err("temperature_min_c") && <p className="text-xs text-red-700">{err("temperature_min_c")}</p>}
      <Field label="Label instructions">
        <TextInput value={f.label_instructions} onChange={(e) => set("label_instructions", e.target.value)} placeholder="Prep time, opened time, initials…" />
      </Field>
      <Field label="Container & cover">
        <TextInput value={f.container_and_cover} onChange={(e) => set("container_and_cover", e.target.value)} />
      </Field>
      <Field label="Discard / no-reuse rule">
        <TextInput value={f.disposal_rule} onChange={(e) => set("disposal_rule", e.target.value)} />
      </Field>
      <Field label="Basis / reference" hint="Source of the standard (food-safety references must be verified).">
        <TextArea value={f.reference_note} rows={2} onChange={(e) => set("reference_note", e.target.value)} />
      </Field>
      {row && (
        <VerifyBar
          verifiedBy={row.verified_by}
          verifiedAt={row.verified_at}
          names={names}
          canVerify={canVerify}
          dirty={dirty}
          pending={pending}
          onVerify={(v) => run(() => setStandardVerified(manualId, "storage", row.id, v))}
        />
      )}
      {rowIssues.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-red-700">
          {rowIssues.map((i, n) => (
            <li key={n}>{i.message}</li>
          ))}
        </ul>
      )}
      {result && !result.ok && <p className="text-xs text-red-700">{result.error}</p>}
      <div className="flex gap-2">
        <Button disabled={pending || !dirty} onClick={save}>
          {row ? "Save" : "Add"}
        </Button>
        {row && (
          <Button variant="ghost" disabled={pending} onClick={() => confirm("Delete this storage standard?") && run(() => deleteStorageStandard(manualId, row.id))}>
            Delete
          </Button>
        )}
        {!row && onDone && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
      {dirty && row?.verified_by && <p className="text-[11px] text-amber-800">Saving changes will remove the verification.</p>}
    </div>
  );
}

export function StoragePanel({
  manualId,
  rows,
  names,
  canVerify,
  issues,
}: {
  manualId: string;
  rows: StorageStandardRow[];
  names: Record<string, string>;
  canVerify: boolean;
  issues: PublishIssue[];
}) {
  const [adding, setAdding] = useState(false);
  const used = rows.map((r) => r.product_state);
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Storage &amp; shelf life</h3>
      <p className="text-xs text-stone-600">One row per product state. Enter only approved values — leave blank if unknown; blanks block publishing.</p>
      {rows.map((r) => (
        <StorageRowEditor key={`${r.id}-${r.updated_at}`} manualId={manualId} row={r} usedStates={used} names={names} canVerify={canVerify} issues={issues} />
      ))}
      {adding ? (
        <StorageRowEditor manualId={manualId} row={null} usedStates={used} names={names} canVerify={false} issues={[]} onDone={() => setAdding(false)} />
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)} className="w-full">
          + Add product state
        </Button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Serving
// ---------------------------------------------------------------------------
function ServingRowEditor({
  manualId,
  row,
  index,
  names,
  canVerify,
  issues,
  onDone,
}: {
  manualId: string;
  row: ServingStandardRow | null;
  index: number;
  names: Record<string, string>;
  canVerify: boolean;
  issues: PublishIssue[];
  onDone?: () => void;
}) {
  const { readOnly } = useEditorMedia();
  const [f, setF] = useState({
    quantity: num(row?.quantity ?? null),
    unit: row?.unit ?? "",
    serving_context: row?.serving_context ?? "",
    measurement_method: row?.measurement_method ?? "",
    tol_minus: row?.tolerance_json?.minus ?? null,
    tol_plus: row?.tolerance_json?.plus ?? null,
    tol_unit: row?.tolerance_json?.unit ?? "",
    plating_instructions: row?.plating_instructions ?? "",
    reference: row?.reference_image_asset_id ? ({ media_id: row.reference_image_asset_id, caption: null } as MediaRef) : null,
  });
  const [dirty, setDirty] = useState(row === null);
  const { pending, result, run } = useRowAction();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF({ ...f, [k]: v });
    setDirty(true);
  };
  const err = (k: string) => (result && !result.ok ? result.fieldErrors?.[k] : undefined);
  const rowIssues = row ? issues.filter((i) => i.path.startsWith(`serving.${index}`)) : [];
  const hasTol = f.tol_minus !== null || f.tol_plus !== null;

  const save = () =>
    run(
      () =>
        saveServingStandard(manualId, row?.id ?? null, {
          quantity: f.quantity,
          unit: (orNull(f.unit) as ServingStandardRow["unit"]) ?? null,
          serving_context: orNull(f.serving_context),
          measurement_method: orNull(f.measurement_method),
          tolerance_json: hasTol
            ? {
                ...(f.tol_minus !== null ? { minus: f.tol_minus } : {}),
                ...(f.tol_plus !== null ? { plus: f.tol_plus } : {}),
                unit: (f.tol_unit || f.unit) as (typeof PORTION_UNITS)[number],
              }
            : null,
          plating_instructions: orNull(f.plating_instructions),
          reference_image_asset_id: f.reference?.media_id ?? null,
        }),
      () => {
        setDirty(false);
        onDone?.();
      },
    );

  return (
    <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
      <Field label="Serving context" hint="Menu / size this portion applies to">
        <TextInput value={f.serving_context} onChange={(e) => set("serving_context", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Portion" value={f.quantity} onChange={(v) => set("quantity", v)} />
        <Field label="Unit" error={err("unit") ?? err("quantity")}>
          <Select value={f.unit} onChange={(e) => set("unit", e.target.value)}>
            <option value="">—</option>
            {PORTION_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <NumField label="Tolerance −" value={f.tol_minus} onChange={(v) => set("tol_minus", v)} hint="HQ-approved only" />
        <NumField label="Tolerance +" value={f.tol_plus} onChange={(v) => set("tol_plus", v)} />
      </div>
      <Field label="How to measure">
        <TextInput value={f.measurement_method} onChange={(e) => set("measurement_method", e.target.value)} placeholder="Scale, scoop, count…" />
      </Field>
      <Field label="Plating instructions">
        <TextArea value={f.plating_instructions} rows={2} onChange={(e) => set("plating_instructions", e.target.value)} />
      </Field>
      <div className="w-40">
        <MediaSlot label="Reference plating photo" value={f.reference} onChange={(v) => set("reference", v)} />
      </div>
      {row && (
        <VerifyBar
          verifiedBy={row.verified_by}
          verifiedAt={row.verified_at}
          names={names}
          canVerify={canVerify && !readOnly}
          dirty={dirty}
          pending={pending}
          onVerify={(v) => run(() => setStandardVerified(manualId, "serving", row.id, v))}
        />
      )}
      {rowIssues.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-red-700">
          {rowIssues.map((i, n) => (
            <li key={n}>{i.message}</li>
          ))}
        </ul>
      )}
      {result && !result.ok && <p className="text-xs text-red-700">{result.error}</p>}
      <div className="flex gap-2">
        <Button disabled={pending || !dirty} onClick={save}>
          {row ? "Save" : "Add"}
        </Button>
        {row && (
          <Button variant="ghost" disabled={pending} onClick={() => confirm("Delete this serving standard?") && run(() => deleteServingStandard(manualId, row.id))}>
            Delete
          </Button>
        )}
        {!row && onDone && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
      {dirty && row?.verified_by && <p className="text-[11px] text-amber-800">Saving changes will remove the verification.</p>}
    </div>
  );
}

export function ServingPanel({
  manualId,
  rows,
  names,
  canVerify,
  issues,
}: {
  manualId: string;
  rows: ServingStandardRow[];
  names: Record<string, string>;
  canVerify: boolean;
  issues: PublishIssue[];
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Serving standard</h3>
      {rows.map((r, i) => (
        <ServingRowEditor key={`${r.id}-${r.updated_at}`} manualId={manualId} row={r} index={i} names={names} canVerify={canVerify} issues={issues} />
      ))}
      {adding ? (
        <ServingRowEditor manualId={manualId} row={null} index={rows.length} names={names} canVerify={false} issues={[]} onDone={() => setAdding(false)} />
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)} className="w-full">
          + Add serving standard
        </Button>
      )}
    </section>
  );
}
