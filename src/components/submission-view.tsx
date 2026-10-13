// 제출 읽기 전용 보기 (현장: 제출 후, HQ: 검토). 서버 컴포넌트.
import { mediaFor, type MediaItem, type SubmissionAggregate } from "@/db/submissions";
import { PREP_PHOTO_ROLES } from "@/domain/enums";
import { formatBytes } from "@/domain/media";

const PHOTO_LABEL = { before: "BEFORE", during: "DURING", after: "AFTER" } as const;

function MediaGrid({ items, empty }: { items: MediaItem[]; empty?: string }) {
  if (items.length === 0) return empty ? <p className="text-xs text-stone-500">{empty}</p> : null;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {items.map((m) => (
        <figure key={m.linkId} className="text-xs">
          <div className="aspect-square overflow-hidden rounded-lg bg-stone-200">
            {m.uploadStatus !== "uploaded" ? (
              <div className="flex h-full items-center justify-center text-amber-700">Upload incomplete</div>
            ) : m.kind === "image" && m.displayUrl ? (
              <a href={m.originalUrl ?? m.displayUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.displayUrl} alt={m.caption ?? m.role} className="h-full w-full object-contain" />
              </a>
            ) : m.kind === "video" && m.originalUrl ? (
              <video src={m.originalUrl} controls playsInline preload="metadata" className="h-full w-full object-contain" />
            ) : m.kind === "audio" && m.originalUrl ? (
              <div className="flex h-full items-center p-1">
                <audio src={m.originalUrl} controls className="w-full" />
              </div>
            ) : null}
          </div>
          <figcaption className="mt-0.5 text-stone-700">
            {m.caption ?? <span className="text-stone-400">no caption</span>}
            <span className="block text-[11px] text-stone-400">{formatBytes(m.sizeBytes)}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-2 text-sm">
      <dt className="w-36 shrink-0 text-stone-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function SubmissionView({ agg }: { agg: SubmissionAggregate }) {
  const { submission: s, ingredients, steps, media } = agg;
  const section = "rounded-xl border border-stone-200 bg-white p-4";

  if (s.capture_mode === "quick") {
    return (
      <div className="space-y-4">
        <section className={section}>
          <h2 className="font-semibold">Note</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{s.note ?? "—"}</p>
        </section>
        <section className={section}>
          <h2 className="mb-2 font-semibold">Photos & videos</h2>
          <MediaGrid items={mediaFor(media, "submission", s.id, "attachment")} empty="None" />
        </section>
        <section className={section}>
          <h2 className="mb-2 font-semibold">Voice memos</h2>
          <MediaGrid items={mediaFor(media, "submission", s.id, "voice_memo")} empty="None" />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className={section}>
        <h2 className="font-semibold">Basics</h2>
        <dl className="mt-2 space-y-1">
          <Spec label="Category" value={s.category} />
          <Spec label="Batch" value={s.batch_yield !== null ? `${s.batch_yield} ${s.batch_unit ?? ""}` : null} />
          <Spec label="Note" value={s.note} />
        </dl>
      </section>

      <section className={section}>
        <h2 className="font-semibold">Ingredients ({ingredients.length})</h2>
        <ul className="mt-2 divide-y divide-stone-100 text-sm">
          {ingredients.map((i) => (
            <li key={i.id} className="py-1.5">
              <span className="font-medium">{i.name}</span>
              <span className="text-stone-600"> — {i.amount !== null ? `${i.amount} ${i.unit}` : "amount not entered"}</span>
              {i.tools && <span className="text-stone-500"> · {i.tools}</span>}
              {i.notes && <p className="text-xs text-stone-500">{i.notes}</p>}
            </li>
          ))}
        </ul>
      </section>

      {ingredients.map((i) => {
        const p = i.preparation;
        if (!p) return null;
        return (
          <section key={i.id} id={`ing-${i.id}`} className={section}>
            <h2 className="font-semibold">Prep · {i.name}</h2>
            {p.no_prep ? (
              <p className="mt-1 rounded bg-amber-50 p-2 text-sm text-amber-900">No preparation — reason: {p.na_reason}</p>
            ) : (
              <>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {PREP_PHOTO_ROLES.map((role) => (
                    <div key={role}>
                      <p className="mb-1 text-xs font-semibold tracking-wide text-stone-600">{PHOTO_LABEL[role]}</p>
                      <MediaGrid
                        items={mediaFor(media, "submission_preparation", p.id, role)}
                        empty={p[`${role}_na_reason`] ? `N/A: ${p[`${role}_na_reason`]}` : "Missing"}
                      />
                    </div>
                  ))}
                </div>
                <dl className="mt-3 space-y-1">
                  <Spec label="Method" value={p.cut_method} />
                  <Spec
                    label="Size (L×W×T mm)"
                    value={p.length_mm ?? p.width_mm ?? p.thickness_mm ? `${p.length_mm ?? "—"} × ${p.width_mm ?? "—"} × ${p.thickness_mm ?? "—"}` : null}
                  />
                  <Spec label="Weight before (g)" value={p.weight_before_g} />
                  <Spec label="Weight after (g)" value={p.weight_after_g} />
                  <Spec label="Tools" value={p.tools} />
                  <Spec label="Caution" value={p.caution} />
                  <Spec label="Measured notes" value={p.notes} />
                </dl>
              </>
            )}
          </section>
        );
      })}

      <section className={section}>
        <h2 className="font-semibold">Cooking steps ({steps.length})</h2>
        <ol className="mt-2 space-y-4">
          {steps.map((st) => (
            <li key={st.id}>
              <p className="font-medium">Step {st.step_no}</p>
              <p className="whitespace-pre-wrap text-sm">{st.description || <span className="text-stone-400">no description</span>}</p>
              <dl className="mt-1 space-y-0.5">
                <Spec
                  label="Time"
                  value={st.duration_seconds !== null ? `${Math.floor(st.duration_seconds / 60)}m ${st.duration_seconds % 60}s` : null}
                />
                <Spec label="Temp (°C)" value={st.temperature_c} />
                <Spec label="Amount added" value={st.input_amount} />
                <Spec label="Safety" value={st.safety_note} />
              </dl>
              <div className="mt-2">
                <MediaGrid items={mediaFor(media, "submission_cooking_step", st.id)} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={section}>
        <h2 className="font-semibold">Final product (field observation)</h2>
        <div className="mt-2">
          <MediaGrid items={mediaFor(media, "submission", s.id, "final")} empty="No final photo" />
        </div>
        <dl className="mt-3 space-y-1">
          <Spec label="Actual yield" value={s.final_yield_quantity !== null ? `${s.final_yield_quantity} ${s.final_yield_unit ?? ""}` : null} />
          <Spec label="Test portion" value={s.test_portion_note} />
          <Spec label="QC observations" value={s.qc_notes} />
        </dl>
      </section>
    </div>
  );
}
