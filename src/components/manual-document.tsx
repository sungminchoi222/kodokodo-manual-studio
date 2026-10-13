// ManualContent 웹 렌더러 (미리보기 / 발행본 / 현장 보기 공통). PPTX/PDF 렌더러는 Step 4~5 에서 같은 데이터를 쓴다.
import type { Block, ManualContent, MediaRef, ServingStandardView, StorageStandardView } from "@/domain/manual-content";
import { PRODUCT_STATE_LABEL, SHELF_LIFE_EVENT_LABEL, STORAGE_METHOD_LABEL } from "@/domain/manual-content";
import { formatDateTime } from "@/lib/format";

export interface DocMedia {
  kind: string;
  displayUrl: string | null;
  originalUrl: string | null;
}

const NEEDS = <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[11px] font-bold text-amber-900">NEEDS HQ CONFIRMATION</span>;
const PHOTO_LABEL = { before: "BEFORE", during: "DURING", after: "AFTER" } as const;

function Media({ refItem, media, label }: { refItem: MediaRef | null; media: Record<string, DocMedia>; label?: string }) {
  const m = refItem ? media[refItem.media_id] : undefined;
  return (
    <figure className="break-inside-avoid">
      {label && <p className="mb-1 text-[11px] font-bold tracking-wide text-stone-600">{label}</p>}
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-stone-100">
        {!m ? (
          <span className="text-xs text-stone-400">{refItem ? "Unavailable" : "—"}</span>
        ) : m.kind === "image" && m.displayUrl ? (
          <a href={m.originalUrl ?? m.displayUrl} target="_blank" rel="noreferrer" className="h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.displayUrl} alt={refItem?.caption ?? label ?? ""} className="h-full w-full object-contain" />
          </a>
        ) : m.kind === "video" && m.originalUrl ? (
          <video src={m.originalUrl} controls playsInline preload="metadata" className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-stone-400">Media</span>
        )}
      </div>
      {refItem?.caption && <figcaption className="mt-1 text-xs text-stone-600">{refItem.caption}</figcaption>}
    </figure>
  );
}

function val(v: number | string | null | undefined, draft: boolean, suffix = "") {
  if (v === null || v === undefined || v === "") return draft ? NEEDS : "—";
  return `${v}${suffix}`;
}

function temperature(s: StorageStandardView, draft: boolean) {
  const { temperature_min_c: min, temperature_max_c: max } = s;
  if (min !== null && max !== null) return `${min} – ${max} °C`;
  if (max !== null) return `≤ ${max} °C`;
  if (min !== null) return `≥ ${min} °C`;
  return draft && s.storage_method !== "ambient" && s.storage_method !== "other" ? NEEDS : "—";
}

function shelfLife(s: StorageStandardView, draft: boolean) {
  if (s.shelf_life_value === null || s.shelf_life_unit === null || !s.shelf_life_start_event) return draft ? NEEDS : "—";
  const from = s.shelf_life_start_event === "custom" ? s.start_event_description : SHELF_LIFE_EVENT_LABEL[s.shelf_life_start_event];
  const unit = s.shelf_life_value === 1 ? s.shelf_life_unit.replace(/s$/, "") : s.shelf_life_unit;
  return `${s.shelf_life_value} ${unit} from ${from}`;
}

function portion(s: ServingStandardView, draft: boolean) {
  if (s.quantity === null || s.unit === null) return draft ? NEEDS : "—";
  const t = s.tolerance;
  const tol = t ? ` (${t.minus !== undefined ? `−${t.minus}` : ""}${t.minus !== undefined && t.plus !== undefined ? " / " : ""}${t.plus !== undefined ? `+${t.plus}` : ""} ${t.unit})` : "";
  return `${s.quantity} ${s.unit}${tol}`;
}

function Verified({ v, draft }: { v: { by_name: string; at: string } | null; draft: boolean }) {
  if (v) return <span className="text-[11px] text-emerald-700">✓ Verified by {v.by_name} · {formatDateTime(v.at)}</span>;
  return draft ? <span className="text-[11px] font-semibold text-amber-700">Not verified</span> : null;
}

function BlockView({ block, media, stepNo, draft }: { block: Block; media: Record<string, DocMedia>; stepNo: number; draft: boolean }) {
  switch (block.type) {
    case "heading":
      return <h2 className="mt-8 border-b border-stone-300 pb-1 text-xl font-bold">{block.text}</h2>;
    case "paragraph":
      return <p className="whitespace-pre-wrap">{block.text}</p>;
    case "warning":
      return <p className="whitespace-pre-wrap rounded-lg border-l-4 border-red-600 bg-red-50 p-3 font-medium text-red-900">⚠ {block.text}</p>;
    case "ingredient_table":
      return (
        <table className="w-full break-inside-avoid border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-stone-800 text-left">
              <th className="py-1 pr-2">Ingredient</th>
              <th className="py-1 pr-2">Amount</th>
              <th className="py-1">Note</th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((r, i) => (
              <tr key={i} className="border-b border-stone-200">
                <td className="py-1 pr-2 font-medium">{r.name}</td>
                <td className="py-1 pr-2 whitespace-nowrap">{r.amount !== null ? `${r.amount} ${r.unit ?? ""}` : "—"}</td>
                <td className="py-1 text-stone-600">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "photo_trio": {
      const s = block.specs;
      const size = [s.length_mm, s.width_mm, s.thickness_mm].some((x) => x !== null)
        ? `${s.length_mm ?? "—"} × ${s.width_mm ?? "—"} × ${s.thickness_mm ?? "—"} mm`
        : null;
      return (
        <section className="break-inside-avoid rounded-xl border border-stone-200 p-4">
          <h3 className="text-lg font-semibold">{block.ingredient}</h3>
          {block.no_prep ? (
            <p className="mt-1 text-sm text-stone-700">No preparation required — {block.no_prep_reason ?? (draft ? NEEDS : "")}</p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {(["before", "during", "after"] as const).map((role) =>
                  block.photos[role] || !block.na_reasons[role] ? (
                    <Media key={role} refItem={block.photos[role]} media={media} label={PHOTO_LABEL[role]} />
                  ) : (
                    <div key={role}>
                      <p className="mb-1 text-[11px] font-bold tracking-wide text-stone-600">{PHOTO_LABEL[role]}</p>
                      <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-stone-300 p-2 text-center text-xs text-stone-500">
                        N/A — {block.na_reasons[role]}
                      </div>
                    </div>
                  ),
                )}
              </div>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {s.cut_method && (<><dt className="text-stone-500">Method</dt><dd className="whitespace-pre-wrap">{s.cut_method}</dd></>)}
                {size && (<><dt className="text-stone-500">Size (L×W×T)</dt><dd>{size}</dd></>)}
                {(s.weight_before_g !== null || s.weight_after_g !== null) && (
                  <><dt className="text-stone-500">Weight</dt><dd>{s.weight_before_g ?? "—"} g → {s.weight_after_g ?? "—"} g</dd></>
                )}
                {s.tools && (<><dt className="text-stone-500">Tools</dt><dd>{s.tools}</dd></>)}
                {s.caution && (<><dt className="text-stone-500">Caution</dt><dd className="whitespace-pre-wrap text-red-800">{s.caution}</dd></>)}
              </dl>
            </>
          )}
        </section>
      );
    }
    case "step":
      return (
        <section className="break-inside-avoid">
          <div className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-900 font-bold text-white">{stepNo}</span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-pre-wrap">{block.text}</p>
              <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-stone-600">
                {block.duration_seconds !== null && <span>⏱ {Math.floor(block.duration_seconds / 60)}m {block.duration_seconds % 60}s</span>}
                {block.temperature_c !== null && <span>🌡 {block.temperature_c} °C</span>}
                {block.input_amount && <span>Amount: {block.input_amount}</span>}
              </p>
              {block.safety_note && <p className="mt-1 text-sm font-medium text-red-800">⚠ {block.safety_note}</p>}
              {block.media.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {block.media.map((m, i) => (
                    <Media key={i} refItem={m} media={media} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      );
    case "final_product":
      return (
        <section className="break-inside-avoid rounded-xl bg-stone-50 p-4">
          <h3 className="font-semibold">Final product</h3>
          {block.text && <p className="mt-1 whitespace-pre-wrap text-sm">{block.text}</p>}
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {block.media.map((m, i) => (
              <Media key={i} refItem={m} media={media} />
            ))}
          </div>
        </section>
      );
  }
}

export function ManualDocument({
  content,
  media,
  mode,
}: {
  content: ManualContent;
  media: Record<string, DocMedia>;
  mode: "draft" | "published";
}) {
  const draft = mode === "draft";
  const { manual, quality } = content;
  let stepCounter = 0;

  return (
    <article className="relative overflow-hidden rounded-xl border border-stone-200 bg-white p-5 text-stone-900 sm:p-8">
      {draft && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center overflow-hidden">
          <span className="mt-40 -rotate-30 whitespace-nowrap text-5xl font-black tracking-widest text-red-600/15 sm:text-7xl">
            DRAFT — NOT FOR OPERATIONAL USE
          </span>
        </div>
      )}
      {draft && (
        <p className="mb-4 rounded-lg bg-red-600 px-3 py-2 text-center text-sm font-bold text-white">DRAFT — NOT FOR OPERATIONAL USE</p>
      )}

      <header className="border-b-2 border-stone-900 pb-4">
        <p className="text-xs font-semibold tracking-widest text-stone-500">
          {manual.brand.name} · {manual.document_code}
        </p>
        <h1 className="mt-1 text-3xl font-black">{manual.title}</h1>
        <p className="mt-2 text-sm text-stone-600">
          {manual.station} · {manual.manual_type.replace(/_/g, " ")} · {manual.locale.toUpperCase()} ·{" "}
          {manual.store_scope === "brand_all" ? "All stores" : manual.stores.map((s) => s.name).join(", ")}
        </p>
        {content.version && (
          <p className="mt-1 text-sm text-stone-600">
            {content.version.label} · approved by {content.version.approved_by_name} · {formatDateTime(content.version.approved_at)}
          </p>
        )}
      </header>

      <div className="mt-6 space-y-4">
        {content.blocks.map((b) => {
          if (b.type === "step") stepCounter += 1;
          return <BlockView key={b.id} block={b} media={media} stepNo={stepCounter} draft={draft} />;
        })}
        {content.blocks.length === 0 && <p className="text-stone-500">No content yet.</p>}
      </div>

      {(content.storage_standards.length > 0 || draft) && (
        <section className="mt-10 break-inside-avoid">
          <h2 className="border-b border-stone-300 pb-1 text-xl font-bold">Storage &amp; shelf life</h2>
          {content.storage_standards.length === 0 ? (
            <p className="mt-2">{NEEDS}</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {content.storage_standards.map((s, i) => (
                <div key={i} className="break-inside-avoid rounded-xl border border-stone-200 p-4">
                  <p className="text-lg font-bold">
                    {PRODUCT_STATE_LABEL[s.product_state]}
                    {s.product_state_note && <span className="ml-2 text-sm font-normal text-stone-500">{s.product_state_note}</span>}
                  </p>
                  <Verified v={s.verified} draft={draft} />
                  <dl className="mt-2 grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-stone-500">Storage</dt>
                    <dd>
                      {s.storage_method ? STORAGE_METHOD_LABEL[s.storage_method] : val(null, draft)}
                      {s.storage_method_note && <span className="block text-xs text-stone-500">{s.storage_method_note}</span>}
                    </dd>
                    <dt className="text-stone-500">Temperature</dt>
                    <dd className="font-semibold">{temperature(s, draft)}</dd>
                    <dt className="text-stone-500">Use within</dt>
                    <dd className="font-semibold">{shelfLife(s, draft)}</dd>
                    {s.label_instructions && (<><dt className="text-stone-500">Label</dt><dd>{s.label_instructions}</dd></>)}
                    {s.container_and_cover && (<><dt className="text-stone-500">Container</dt><dd>{s.container_and_cover}</dd></>)}
                    {s.disposal_rule && (<><dt className="text-stone-500">Discard</dt><dd className="text-red-800">{s.disposal_rule}</dd></>)}
                  </dl>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {(content.serving_standards.length > 0 || draft) && (
        <section className="mt-8 break-inside-avoid">
          <h2 className="border-b border-stone-300 pb-1 text-xl font-bold">Serving standard</h2>
          {content.serving_standards.length === 0 && <p className="mt-2">{NEEDS}</p>}
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            {content.serving_standards.map((s, i) => (
              <div key={i} className="rounded-xl border border-stone-200 p-4">
                {s.serving_context && <p className="text-sm text-stone-600">{s.serving_context}</p>}
                <p className="text-2xl font-black">{portion(s, draft)}</p>
                <Verified v={s.verified} draft={draft} />
                {s.measurement_method && <p className="mt-2 text-sm">Measure: {s.measurement_method}</p>}
                {s.plating_instructions && <p className="mt-1 whitespace-pre-wrap text-sm">{s.plating_instructions}</p>}
                {s.reference_image && (
                  <div className="mt-2">
                    <Media refItem={s.reference_image} media={media} label="Reference plating" />
                  </div>
                )}
              </div>
            ))}
          </div>
          {quality.sauce_rules.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-stone-800 text-left">
                  <th className="py-1">Sauce</th>
                  <th className="py-1">Amount</th>
                  <th className="py-1">Condition</th>
                </tr>
              </thead>
              <tbody>
                {quality.sauce_rules.map((r, i) => (
                  <tr key={i} className="border-b border-stone-200">
                    <td className="py-1">{r.sauce}</td>
                    <td className="py-1">{r.amount !== null ? `${r.amount} ${r.unit ?? ""}` : "—"}</td>
                    <td className="py-1">{r.condition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {(quality.acceptance_criteria.length > 0 || quality.rejection_criteria.length > 0) && (
        <section className="mt-8 grid break-inside-avoid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="text-lg font-bold text-emerald-800">✓ Accept when</h2>
            <ul className="mt-1 list-disc pl-5 text-sm">{quality.acceptance_criteria.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
          <div>
            <h2 className="text-lg font-bold text-red-800">✗ Reject / redo when</h2>
            <ul className="mt-1 list-disc pl-5 text-sm">{quality.rejection_criteria.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        </section>
      )}

      {(quality.critical_warnings.length > 0 || quality.allergen_notes) && (
        <section className="mt-8 break-inside-avoid rounded-xl border-2 border-red-600 p-4">
          <h2 className="text-lg font-bold text-red-800">Critical warnings</h2>
          <ul className="mt-1 list-disc pl-5 text-sm">{quality.critical_warnings.map((t, i) => <li key={i}>{t}</li>)}</ul>
          {quality.allergen_notes && <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Allergens:</strong> {quality.allergen_notes}</p>}
        </section>
      )}

      {content.version && (
        <footer className="mt-10 border-t border-stone-300 pt-3 text-xs text-stone-600">
          <p>
            <strong>{content.version.label}</strong> — {content.version.change_log}
          </p>
          {content.version.revision_reason && <p>Reason: {content.version.revision_reason}</p>}
        </footer>
      )}
    </article>
  );
}
