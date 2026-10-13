"use client";

import { useActionState, useState } from "react";
import { createManual } from "@/actions/manuals";
import type { ActionResult } from "@/actions/result";
import { LOCALES, MANUAL_TYPES, STATION_PRESETS } from "@/domain/enums";
import { Button, Field, Select, TextInput } from "@/components/ui/form";

const codeFor = (station: string) =>
  STATION_PRESETS.find((p) => p.label.toLowerCase() === station.trim().toLowerCase())?.code ?? station.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

export function NewManualForm({ brands }: { brands: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [station, setStation] = useState("Main");
  const [state, action, pending] = useActionState<ActionResult, FormData>(createManual, { ok: true });
  const err = state.ok ? {} : (state.fieldErrors ?? {});
  if (!open) return <Button onClick={() => setOpen(true)}>+ New manual (HQ authored)</Button>;

  return (
    <form action={action} className="grid max-w-3xl gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-2">
      <Field label="Brand">
        <Select name="brand_id" defaultValue={brands[0]?.id}>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Title" error={err.title}>
        <TextInput name="title" required maxLength={160} />
      </Field>
      <Field label="Manual type">
        <Select name="manual_type" defaultValue="service_sop">
          {MANUAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Language">
        <Select name="display_language" defaultValue="en">
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Station" error={err.station}>
        <TextInput name="station" value={station} onChange={(e) => setStation(e.target.value)} required maxLength={60} />
      </Field>
      <Field label="Code segment" hint="Document code: BRAND-CODE-001" error={err.station_code}>
        <TextInput key={station} name="station_code" defaultValue={codeFor(station)} required maxLength={8} className="uppercase" />
      </Field>
      {!state.ok && <p className="text-sm text-red-700 sm:col-span-2">{state.error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
