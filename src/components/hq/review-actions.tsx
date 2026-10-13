"use client";

import { useActionState, useState, useTransition } from "react";
import { createManualFromSubmission, rejectSubmission, startReview } from "@/actions/review";
import type { ActionResult } from "@/actions/result";
import { LOCALES, MANUAL_TYPES, STATION_PRESETS } from "@/domain/enums";
import { Button, Field, Select, TextArea, TextInput } from "@/components/ui/form";

function stationCode(station: string): string {
  const preset = STATION_PRESETS.find((p) => p.label.toLowerCase() === station.trim().toLowerCase());
  return preset?.code ?? station.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function ReviewActions({
  submissionId,
  status,
  defaultTitle,
  defaultStation,
  defaultType,
}: {
  submissionId: string;
  status: string;
  defaultTitle: string;
  defaultStation: string;
  defaultType: "recipe" | "service_sop";
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [reason, setReason] = useState("");
  const [station, setStation] = useState(defaultStation);
  const [createState, createAction, creating] = useActionState<ActionResult, FormData>(
    createManualFromSubmission.bind(null, submissionId),
    { ok: true },
  );
  const createErr = createState.ok ? {} : (createState.fieldErrors ?? {});
  const open = status === "submitted" || status === "in_review";

  if (!open) return <p className="text-sm text-stone-600">This submission is closed ({status.replace("_", " ")}).</p>;

  return (
    <div className="space-y-6">
      {status === "submitted" && (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => start(async () => setResult(await startReview(submissionId)))}
          className="w-full"
        >
          Mark as in review
        </Button>
      )}

      <form action={createAction} className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
        <p className="font-semibold">Create manual draft</p>
        <p className="text-xs text-stone-600">
          Creates a new manual (draft) linked to this submission and marks the submission as used. Content is assembled in the Manual Builder.
        </p>
        <Field label="Manual title" error={createErr.title}>
          <TextInput name="title" defaultValue={defaultTitle} maxLength={160} required />
        </Field>
        <Field label="Manual type" error={createErr.manual_type}>
          <Select name="manual_type" defaultValue={defaultType}>
            {MANUAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Station" error={createErr.station}>
            <TextInput name="station" value={station} onChange={(e) => setStation(e.target.value)} maxLength={60} required />
          </Field>
          <Field label="Code segment" hint="Document code: BRAND-CODE-001" error={createErr.station_code}>
            <TextInput key={station} name="station_code" defaultValue={stationCode(station)} maxLength={8} required className="uppercase" />
          </Field>
        </div>
        <Field label="Main language" error={createErr.display_language}>
          <Select name="display_language" defaultValue="en">
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </Select>
        </Field>
        {!createState.ok && <p className="text-sm text-red-700">{createState.error}</p>}
        <Button type="submit" disabled={creating} className="w-full">
          {creating ? "Creating…" : "Create manual draft"}
        </Button>
      </form>

      <div className="space-y-2 rounded-xl border border-red-200 bg-white p-4">
        <p className="font-semibold">Return to field</p>
        <Field label="Reason (shown to the submitter)" error={result && !result.ok ? result.fieldErrors?.reason : undefined}>
          <TextArea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={3} />
        </Field>
        <Button
          variant="danger"
          disabled={pending || !reason.trim()}
          onClick={() => start(async () => setResult(await rejectSubmission(submissionId, reason)))}
          className="w-full"
        >
          Return with reason
        </Button>
      </div>
      {result && !result.ok && <p className="text-sm text-red-700">{result.error}</p>}
    </div>
  );
}
