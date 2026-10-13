"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  addIngredient,
  addStep,
  deleteIngredient,
  deleteStep,
  moveIngredient,
  moveStep,
  saveBasics,
  saveFinal,
  savePreparation,
  updateIngredient,
  updateStep,
} from "@/actions/submissions";
import type { ActionResult } from "@/actions/result";
import type { IngredientWithPrep, MediaItem } from "@/db/submissions";
import { PREP_PHOTO_ROLES, STATION_PRESETS } from "@/domain/enums";
import type { Submission, SubmissionCookingStep } from "@/domain/types";
import { Button, Field, FormMessage, parseNum, TextArea, TextInput, textOrNull } from "@/components/ui/form";
import { MediaUploader } from "./media-uploader";

type Result = ActionResult | null;
const errOf = (r: Result, key: string) => (r && !r.ok ? r.fieldErrors?.[key] : undefined);

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result>(null);
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, result, run, setResult };
}

/**
 * 섹션 단위 자동 저장: 내용이 바뀐 뒤 포커스가 섹션 밖으로 나가거나 다른 단계로 이동(언마운트)하면 저장한다.
 * 모바일에서 저장 버튼을 누르지 않고 이동해도 입력이 사라지지 않게 하기 위함.
 */
export function AutoSave({ onSave, children, className }: { onSave: () => void; children: React.ReactNode; className?: string }) {
  const dirty = useRef(false);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });
  useEffect(
    () => () => {
      if (dirty.current) saveRef.current();
    },
    [],
  );
  return (
    <div
      className={className}
      onChange={(e) => {
        // 파일 선택/캡션은 업로더가 따로 저장한다
        const t = e.target as HTMLInputElement;
        if (t.type !== "file" && !t.closest("[data-autosave-ignore]")) dirty.current = true;
      }}
      onBlur={(e) => {
        if (dirty.current && !e.currentTarget.contains(e.relatedTarget as Node | null)) {
          dirty.current = false;
          saveRef.current();
        }
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Basics
// ---------------------------------------------------------------------------
export function BasicsStep({ submission }: { submission: Submission }) {
  const { pending, result, run } = useAction();
  const [f, setF] = useState({
    title: submission.title,
    station: submission.station,
    category: submission.category ?? "",
    batch_yield: submission.batch_yield?.toString() ?? "",
    batch_unit: submission.batch_unit ?? "",
    note: submission.note ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = () =>
    run(() =>
      saveBasics(submission.id, {
        title: f.title,
        station: f.station,
        category: textOrNull(f.category),
        batch_yield: parseNum(f.batch_yield),
        batch_unit: textOrNull(f.batch_unit),
        note: textOrNull(f.note),
        source_manual_id: submission.source_manual_id,
      }),
    );

  return (
    <AutoSave onSave={save} className="space-y-4">
      <Field label="Menu / task name" error={errOf(result, "title")}>
        <TextInput value={f.title} onChange={set("title")} maxLength={160} />
      </Field>
      <Field label="Station / part" error={errOf(result, "station")}>
        <TextInput value={f.station} onChange={set("station")} list="station-presets" maxLength={60} />
        <datalist id="station-presets">
          {STATION_PRESETS.map((s) => (
            <option key={s.code} value={s.label} />
          ))}
        </datalist>
      </Field>
      <Field label="Category">
        <TextInput value={f.category} onChange={set("category")} maxLength={80} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Batch yield" error={errOf(result, "batch_yield")}>
          <TextInput value={f.batch_yield} onChange={set("batch_yield")} inputMode="decimal" />
        </Field>
        <Field label="Batch unit">
          <TextInput value={f.batch_unit} onChange={set("batch_unit")} maxLength={40} />
        </Field>
      </div>
      <Field label="Note">
        <TextArea value={f.note} onChange={set("note")} maxLength={8000} />
      </Field>
      <div className="flex items-center gap-3">
        <Button disabled={pending} onClick={save}>
          Save
        </Button>
        <FormMessage result={result} />
      </div>
    </AutoSave>
  );
}

// ---------------------------------------------------------------------------
// 2. Ingredient list
// ---------------------------------------------------------------------------
interface IngredientDraft {
  name: string;
  amount: string;
  unit: string;
  tools: string;
  notes: string;
}
const emptyIngredient: IngredientDraft = { name: "", amount: "", unit: "", tools: "", notes: "" };
const toIngredientInput = (d: IngredientDraft) => ({
  name: d.name,
  amount: parseNum(d.amount),
  unit: textOrNull(d.unit),
  tools: textOrNull(d.tools),
  notes: textOrNull(d.notes),
});

function IngredientFields({ value, onChange, result }: { value: IngredientDraft; onChange: (v: IngredientDraft) => void; result: Result }) {
  const set = (k: keyof IngredientDraft) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-3">
      <Field label="Ingredient" error={errOf(result, "name")}>
        <TextInput value={value.name} onChange={set("name")} maxLength={160} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" error={errOf(result, "amount")}>
          <TextInput value={value.amount} onChange={set("amount")} inputMode="decimal" />
        </Field>
        <Field label="Unit" hint="g, ml, pcs…" error={errOf(result, "unit")}>
          <TextInput value={value.unit} onChange={set("unit")} maxLength={20} />
        </Field>
      </div>
      <Field label="Tools (optional)">
        <TextInput value={value.tools} onChange={set("tools")} maxLength={300} />
      </Field>
      <Field label="Notes (optional)">
        <TextInput value={value.notes} onChange={set("notes")} maxLength={2000} />
      </Field>
    </div>
  );
}

export function IngredientsStep({ submissionId, ingredients }: { submissionId: string; ingredients: IngredientWithPrep[] }) {
  const { pending, result, run } = useAction();
  const [draft, setDraft] = useState<IngredientDraft>(emptyIngredient);

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {ingredients.map((ing, idx) => (
          <IngredientRow key={ing.id} ing={ing} first={idx === 0} last={idx === ingredients.length - 1} />
        ))}
      </ul>
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="mb-3 font-semibold">Add ingredient</p>
        <IngredientFields value={draft} onChange={setDraft} result={result} />
        <div className="mt-3 flex items-center gap-3">
          <Button disabled={pending || !draft.name.trim()} onClick={() => run(() => addIngredient(submissionId, toIngredientInput(draft)), () => setDraft(emptyIngredient))}>
            Add
          </Button>
          {result && !result.ok && <p className="text-sm text-red-700">{result.error}</p>}
        </div>
      </div>
    </div>
  );
}

function IngredientRow({ ing, first, last }: { ing: IngredientWithPrep; first: boolean; last: boolean }) {
  const { pending, result, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<IngredientDraft>({
    name: ing.name,
    amount: ing.amount?.toString() ?? "",
    unit: ing.unit ?? "",
    tools: ing.tools ?? "",
    notes: ing.notes ?? "",
  });

  if (editing) {
    return (
      <li className="rounded-xl border border-stone-300 bg-white p-4">
        <IngredientFields value={draft} onChange={setDraft} result={result} />
        <div className="mt-3 flex gap-2">
          <Button disabled={pending} onClick={() => run(() => updateIngredient(ing.id, toIngredientInput(draft)), () => setEditing(false))}>
            Save
          </Button>
          <Button variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
        {result && !result.ok && <p className="mt-2 text-sm text-red-700">{result.error}</p>}
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{ing.name}</p>
        <p className="text-xs text-stone-500">
          {ing.amount !== null ? `${ing.amount} ${ing.unit}` : "amount not entered"}
          {ing.tools ? ` · ${ing.tools}` : ""}
        </p>
      </div>
      <button type="button" aria-label="Move up" disabled={first || pending} onClick={() => run(() => moveIngredient(ing.id, "up"))} className="h-9 w-9 rounded border disabled:opacity-30">
        ↑
      </button>
      <button type="button" aria-label="Move down" disabled={last || pending} onClick={() => run(() => moveIngredient(ing.id, "down"))} className="h-9 w-9 rounded border disabled:opacity-30">
        ↓
      </button>
      <button type="button" onClick={() => setEditing(true)} className="px-2 text-sm underline">
        Edit
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => confirm(`Delete ${ing.name}? Its prep photos will be unlinked.`) && run(() => deleteIngredient(ing.id))}
        className="px-2 text-sm text-red-700 underline"
      >
        Delete
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// 3. Ingredient preparation (card per ingredient)
// ---------------------------------------------------------------------------
const PHOTO_LABEL = { before: "BEFORE", during: "DURING", after: "AFTER" } as const;

export function PrepStep({
  submissionId,
  ingredients,
  media,
}: {
  submissionId: string;
  ingredients: IngredientWithPrep[];
  media: MediaItem[];
}) {
  if (ingredients.length === 0) return <p className="text-sm text-stone-600">Add ingredients first.</p>;
  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-sky-50 p-3 text-xs text-sky-900">
        Photo guide: close up, good light, true colour. Include a knife, ruler or scale for size/weight reference. Keep the same angle for BEFORE / DURING / AFTER.
      </p>
      {ingredients.map((ing) =>
        ing.preparation ? <PrepCard key={ing.id} submissionId={submissionId} ing={ing} prep={ing.preparation} media={media} /> : null,
      )}
    </div>
  );
}

function PrepCard({
  submissionId,
  ing,
  prep,
  media,
}: {
  submissionId: string;
  ing: IngredientWithPrep;
  prep: NonNullable<IngredientWithPrep["preparation"]>;
  media: MediaItem[];
}) {
  const { pending, result, run } = useAction();
  const str = (v: number | string | null) => (v === null ? "" : String(v));
  const [f, setF] = useState({
    no_prep: prep.no_prep,
    na_reason: str(prep.na_reason),
    cut_method: str(prep.cut_method),
    length_mm: str(prep.length_mm),
    width_mm: str(prep.width_mm),
    thickness_mm: str(prep.thickness_mm),
    weight_before_g: str(prep.weight_before_g),
    weight_after_g: str(prep.weight_after_g),
    tools: str(prep.tools),
    caution: str(prep.caution),
    notes: str(prep.notes),
    before_na_reason: str(prep.before_na_reason),
    during_na_reason: str(prep.during_na_reason),
    after_na_reason: str(prep.after_na_reason),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const save = () =>
    run(() =>
      savePreparation(prep.id, {
        no_prep: f.no_prep,
        na_reason: textOrNull(f.na_reason),
        cut_method: textOrNull(f.cut_method),
        length_mm: parseNum(f.length_mm),
        width_mm: parseNum(f.width_mm),
        thickness_mm: parseNum(f.thickness_mm),
        weight_before_g: parseNum(f.weight_before_g),
        weight_after_g: parseNum(f.weight_after_g),
        tools: textOrNull(f.tools),
        caution: textOrNull(f.caution),
        notes: textOrNull(f.notes),
        before_na_reason: textOrNull(f.before_na_reason),
        during_na_reason: textOrNull(f.during_na_reason),
        after_na_reason: textOrNull(f.after_na_reason),
      }),
    );

  return (
    <section id={`ing-${ing.id}`} className="rounded-xl border border-stone-200 bg-white p-4">
      <AutoSave onSave={save}>
      <h3 className="text-lg font-semibold">{ing.name}</h3>

      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.no_prep} onChange={(e) => setF({ ...f, no_prep: e.target.checked })} className="h-5 w-5" />
        No preparation required (e.g. ready-made sauce, oil)
      </label>
      {f.no_prep && (
        <div className="mt-2">
          <Field label="Reason (HQ will review)" error={errOf(result, "na_reason")}>
            <TextInput value={f.na_reason} onChange={set("na_reason")} maxLength={500} />
          </Field>
        </div>
      )}

      {!f.no_prep && (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {PREP_PHOTO_ROLES.map((role) => (
              <div key={role} className="rounded-lg bg-stone-50 p-2">
                <MediaUploader
                  label={PHOTO_LABEL[role]}
                  target={{ submissionId, entityType: "submission_preparation", entityId: prep.id, role }}
                  items={media.filter((m) => m.entityType === "submission_preparation" && m.entityId === prep.id && m.role === role)}
                  editable
                />
                <div className="mt-2">
                  <Field label={`${PHOTO_LABEL[role]} not applicable? Reason`}>
                    <TextInput value={f[`${role}_na_reason`]} onChange={set(`${role}_na_reason`)} maxLength={500} className="text-sm" />
                  </Field>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3">
            <Field label="Cutting / prep method">
              <TextArea value={f.cut_method} onChange={set("cut_method")} maxLength={500} rows={2} />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Length (mm)" error={errOf(result, "length_mm")}>
                <TextInput value={f.length_mm} onChange={set("length_mm")} inputMode="decimal" />
              </Field>
              <Field label="Width (mm)" error={errOf(result, "width_mm")}>
                <TextInput value={f.width_mm} onChange={set("width_mm")} inputMode="decimal" />
              </Field>
              <Field label="Thickness (mm)" error={errOf(result, "thickness_mm")}>
                <TextInput value={f.thickness_mm} onChange={set("thickness_mm")} inputMode="decimal" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Weight before (g)" error={errOf(result, "weight_before_g")}>
                <TextInput value={f.weight_before_g} onChange={set("weight_before_g")} inputMode="decimal" />
              </Field>
              <Field label="Weight after (g)" error={errOf(result, "weight_after_g")}>
                <TextInput value={f.weight_after_g} onChange={set("weight_after_g")} inputMode="decimal" />
              </Field>
            </div>
            <Field label="Tools">
              <TextInput value={f.tools} onChange={set("tools")} maxLength={300} />
            </Field>
            <Field label="Caution">
              <TextInput value={f.caution} onChange={set("caution")} maxLength={2000} />
            </Field>
            <Field label="Measured notes">
              <TextArea value={f.notes} onChange={set("notes")} maxLength={2000} rows={2} />
            </Field>
          </div>
        </>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button disabled={pending} onClick={save}>
          Save {ing.name}
        </Button>
        <FormMessage result={result} />
      </div>
      </AutoSave>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 4. Cooking steps
// ---------------------------------------------------------------------------
export function StepsStep({ submissionId, steps, media }: { submissionId: string; steps: SubmissionCookingStep[]; media: MediaItem[] }) {
  const { pending, run } = useAction();
  return (
    <div className="space-y-4">
      {steps.map((s, idx) => (
        <StepCard key={s.id} submissionId={submissionId} step={s} media={media} first={idx === 0} last={idx === steps.length - 1} />
      ))}
      <Button variant="secondary" disabled={pending} onClick={() => run(() => addStep(submissionId))} className="w-full">
        + Add step {steps.length + 1}
      </Button>
    </div>
  );
}

function StepCard({
  submissionId,
  step,
  media,
  first,
  last,
}: {
  submissionId: string;
  step: SubmissionCookingStep;
  media: MediaItem[];
  first: boolean;
  last: boolean;
}) {
  const { pending, result, run } = useAction();
  const secs = step.duration_seconds;
  const [f, setF] = useState({
    description: step.description,
    minutes: secs !== null ? String(Math.floor(secs / 60)) : "",
    seconds: secs !== null ? String(secs % 60) : "",
    temperature_c: step.temperature_c?.toString() ?? "",
    input_amount: step.input_amount ?? "",
    safety_note: step.safety_note ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const duration = () => {
    const m = parseNum(f.minutes);
    const s = parseNum(f.seconds);
    if (m === null && s === null) return null;
    return Math.round((m ?? 0) * 60 + (s ?? 0));
  };
  const save = () =>
    run(() =>
      updateStep(step.id, {
        description: f.description,
        duration_seconds: duration(),
        temperature_c: parseNum(f.temperature_c),
        input_amount: textOrNull(f.input_amount),
        safety_note: textOrNull(f.safety_note),
      }),
    );

  return (
    <AutoSave onSave={save} className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-lg font-semibold">Step {step.step_no}</h3>
        <button type="button" aria-label="Move up" disabled={first || pending} onClick={() => run(() => moveStep(step.id, "up"))} className="h-9 w-9 rounded border disabled:opacity-30">
          ↑
        </button>
        <button type="button" aria-label="Move down" disabled={last || pending} onClick={() => run(() => moveStep(step.id, "down"))} className="h-9 w-9 rounded border disabled:opacity-30">
          ↓
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => confirm(`Delete step ${step.step_no}?`) && run(() => deleteStep(step.id))}
          className="px-2 text-sm text-red-700 underline"
        >
          Delete
        </button>
      </div>
      <div className="mt-3">
        <MediaUploader
          target={{ submissionId, entityType: "submission_cooking_step", entityId: step.id, role: "step" }}
          items={media.filter((m) => m.entityType === "submission_cooking_step" && m.entityId === step.id)}
          editable
          accept="media"
        />
      </div>
      <div className="mt-3 grid gap-3">
        <Field label="What to do" error={errOf(result, "description")}>
          <TextArea value={f.description} onChange={set("description")} maxLength={8000} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Time (min)" error={errOf(result, "duration_seconds")}>
            <TextInput value={f.minutes} onChange={set("minutes")} inputMode="numeric" />
          </Field>
          <Field label="(sec)">
            <TextInput value={f.seconds} onChange={set("seconds")} inputMode="numeric" />
          </Field>
          <Field label="Temp (°C)" error={errOf(result, "temperature_c")}>
            <TextInput value={f.temperature_c} onChange={set("temperature_c")} inputMode="decimal" />
          </Field>
        </div>
        <Field label="Amount added">
          <TextInput value={f.input_amount} onChange={set("input_amount")} maxLength={300} />
        </Field>
        <Field label="Safety note">
          <TextInput value={f.safety_note} onChange={set("safety_note")} maxLength={2000} />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button disabled={pending} onClick={save}>
          Save step {step.step_no}
        </Button>
        <FormMessage result={result} />
      </div>
    </AutoSave>
  );
}

// ---------------------------------------------------------------------------
// 5. Final product
// ---------------------------------------------------------------------------
export function FinalStep({ submission, media }: { submission: Submission; media: MediaItem[] }) {
  const { pending, result, run } = useAction();
  const [f, setF] = useState({
    final_yield_quantity: submission.final_yield_quantity?.toString() ?? "",
    final_yield_unit: submission.final_yield_unit ?? "",
    test_portion_note: submission.test_portion_note ?? "",
    qc_notes: submission.qc_notes ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = () =>
    run(() =>
      saveFinal(submission.id, {
        final_yield_quantity: parseNum(f.final_yield_quantity),
        final_yield_unit: textOrNull(f.final_yield_unit),
        test_portion_note: textOrNull(f.test_portion_note),
        qc_notes: textOrNull(f.qc_notes),
      }),
    );

  return (
    <AutoSave onSave={save} className="space-y-4">
      <MediaUploader
        label="Final product photos"
        target={{ submissionId: submission.id, entityType: "submission", entityId: submission.id, role: "final" }}
        items={media.filter((m) => m.entityType === "submission" && m.role === "final")}
        editable
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Actual yield" error={errOf(result, "final_yield_quantity")}>
          <TextInput value={f.final_yield_quantity} onChange={set("final_yield_quantity")} inputMode="decimal" />
        </Field>
        <Field label="Unit" error={errOf(result, "final_yield_unit")}>
          <TextInput value={f.final_yield_unit} onChange={set("final_yield_unit")} maxLength={20} />
        </Field>
      </div>
      <Field label="Test portion (as served in this test)" hint="Field observation only — HQ sets the official portion.">
        <TextArea value={f.test_portion_note} onChange={set("test_portion_note")} maxLength={2000} rows={2} />
      </Field>
      <Field label="QC observations">
        <TextArea value={f.qc_notes} onChange={set("qc_notes")} maxLength={4000} />
      </Field>
      <div className="flex items-center gap-3">
        <Button disabled={pending} onClick={save}>
          Save
        </Button>
        <FormMessage result={result} />
      </div>
    </AutoSave>
  );
}
