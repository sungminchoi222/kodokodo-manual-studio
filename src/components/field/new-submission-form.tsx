"use client";

import { useActionState } from "react";
import { createSubmission } from "@/actions/submissions";
import type { ActionResult } from "@/actions/result";
import { STATION_PRESETS } from "@/domain/enums";
import { Field, Select, TextArea, TextInput } from "@/components/ui/form";

export interface StoreOption {
  id: string;
  label: string;
}

export function NewSubmissionForm({ mode, stores }: { mode: "quick" | "guided"; stores: StoreOption[] }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(createSubmission, { ok: true });
  const err = state.ok ? {} : (state.fieldErrors ?? {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="capture_mode" value={mode} />
      <Field label="Store" error={err.store_id}>
        <Select name="store_id" required defaultValue={stores.length === 1 ? stores[0]?.id : ""} invalid={!!err.store_id}>
          {stores.length !== 1 && <option value="">Select…</option>}
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={mode === "guided" ? "Menu / task name" : "Title"} error={err.title}>
        <TextInput name="title" required maxLength={160} invalid={!!err.title} />
      </Field>
      <Field label="Station / part" error={err.station}>
        <TextInput name="station" required maxLength={60} list="station-presets" invalid={!!err.station} />
        <datalist id="station-presets">
          {STATION_PRESETS.map((s) => (
            <option key={s.code} value={s.label} />
          ))}
        </datalist>
      </Field>

      {mode === "guided" ? (
        <>
          <Field label="Category" hint="e.g. Main dish, Side, Sauce" error={err.category}>
            <TextInput name="category" maxLength={80} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Batch yield" hint="As actually produced" error={err.batch_yield}>
              <TextInput name="batch_yield" inputMode="decimal" invalid={!!err.batch_yield} />
            </Field>
            <Field label="Batch unit" hint="e.g. portions, kg" error={err.batch_unit}>
              <TextInput name="batch_unit" maxLength={40} />
            </Field>
          </div>
        </>
      ) : (
        <Field label="Note" hint="What is this about? You can also add photos, video and a voice memo next." error={err.note}>
          <TextArea name="note" maxLength={8000} />
        </Field>
      )}

      {!state.ok && <p className="text-sm text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="min-h-12 w-full rounded-lg bg-brand font-semibold text-white disabled:opacity-60">
        {pending ? "Creating…" : mode === "guided" ? "Start guided capture" : "Continue"}
      </button>
    </form>
  );
}
