"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveBasics } from "@/actions/submissions";
import type { ActionResult } from "@/actions/result";
import type { MediaItem } from "@/db/submissions";
import { STATION_PRESETS } from "@/domain/enums";
import type { Submission } from "@/domain/types";
import { Button, Field, FormMessage, Select, TextArea, TextInput, textOrNull } from "@/components/ui/form";
import { AutoSave } from "./guided-steps";
import { MediaUploader } from "./media-uploader";
import { VoiceRecorder } from "./voice-recorder";

export function QuickEditor({
  submission,
  media,
  manuals,
}: {
  submission: Submission;
  media: MediaItem[];
  manuals: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [f, setF] = useState({
    title: submission.title,
    station: submission.station,
    note: submission.note ?? "",
    source_manual_id: submission.source_manual_id ?? "",
  });
  const err = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const target = { submissionId: submission.id, entityType: "submission" as const, entityId: submission.id };
  const save = () =>
    start(async () => {
      const r = await saveBasics(submission.id, {
        title: f.title,
        station: f.station,
        note: textOrNull(f.note),
        category: submission.category,
        batch_unit: submission.batch_unit,
        batch_yield: submission.batch_yield,
        source_manual_id: f.source_manual_id || null,
      });
      setResult(r);
      if (r.ok) router.refresh();
    });

  return (
    <div className="space-y-6">
      <AutoSave onSave={save} className="space-y-4 rounded-xl border border-stone-200 bg-white p-4">
        <Field label="Title" error={err.title}>
          <TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={160} />
        </Field>
        <Field label="Station / part" error={err.station}>
          <TextInput value={f.station} onChange={(e) => setF({ ...f, station: e.target.value })} list="station-presets" maxLength={60} />
          <datalist id="station-presets">
            {STATION_PRESETS.map((s) => (
              <option key={s.code} value={s.label} />
            ))}
          </datalist>
        </Field>
        <Field label="Note">
          <TextArea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={8000} rows={4} />
        </Field>
        <Field label="Related manual (if suggesting a change)">
          <Select value={f.source_manual_id} onChange={(e) => setF({ ...f, source_manual_id: e.target.value })}>
            <option value="">None</option>
            {manuals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center gap-3">
          <Button disabled={pending} onClick={save}>
            Save
          </Button>
          <FormMessage result={result} />
        </div>
      </AutoSave>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <MediaUploader
          label="Photos & videos"
          target={{ ...target, role: "attachment" }}
          items={media.filter((m) => m.role === "attachment")}
          editable
          accept="media"
          emptyHint="Add as many as needed. Add a caption to each so HQ knows what it shows."
        />
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="mb-2 text-sm font-medium">Voice memo</p>
        <MediaUploader target={{ ...target, role: "voice_memo" }} items={media.filter((m) => m.role === "voice_memo")} editable canAdd={false} />
        <div className="mt-2">
          <VoiceRecorder target={{ ...target, role: "voice_memo" }} />
        </div>
      </section>
    </div>
  );
}
