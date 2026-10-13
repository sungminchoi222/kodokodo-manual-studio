"use client";

import type { Block, BlockOf, IngredientRow } from "@/domain/manual-content";
import type { PublishIssue } from "@/validation/publish-checks";
import { Field, TextArea, TextInput } from "@/components/ui/form";
import { MediaList, MediaSlot, NumField, useEditorMedia } from "./shared";

export const BLOCK_LABEL: Record<Block["type"], string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  ingredient_table: "Ingredient table",
  photo_trio: "Preparation card (BEFORE / DURING / AFTER)",
  step: "Step",
  warning: "Warning",
  final_product: "Final product",
};

export function newBlock(type: Block["type"], id: string): Block {
  switch (type) {
    case "heading":
    case "paragraph":
    case "warning":
      return { id, type, text: "" };
    case "ingredient_table":
      return { id, type, rows: [{ name: "", amount: null, unit: null, note: null }] };
    case "photo_trio":
      return {
        id,
        type,
        ingredient: "",
        no_prep: false,
        no_prep_reason: null,
        photos: { before: null, during: null, after: null },
        na_reasons: { before: null, during: null, after: null },
        specs: { cut_method: null, length_mm: null, width_mm: null, thickness_mm: null, weight_before_g: null, weight_after_g: null, tools: null, caution: null },
      };
    case "step":
      return { id, type, text: "", media: [], duration_seconds: null, temperature_c: null, input_amount: null, safety_note: null };
    case "final_product":
      return { id, type, text: "", media: [] };
  }
}

const orNull = (s: string) => (s === "" ? null : s);

export function BlockEditor({
  block,
  onChange,
  issues,
  stepNo,
}: {
  block: Block;
  onChange: (b: Block) => void;
  issues: PublishIssue[];
  stepNo: number;
}) {
  const { readOnly } = useEditorMedia();
  const has = (suffix: string) => issues.some((i) => i.path === `blocks.${block.id}${suffix}`);

  switch (block.type) {
    case "heading":
      return <TextInput value={block.text} disabled={readOnly} onChange={(e) => onChange({ ...block, text: e.target.value })} placeholder="Heading" className="text-lg font-bold" />;
    case "paragraph":
    case "warning":
      return (
        <TextArea
          value={block.text}
          disabled={readOnly}
          rows={block.type === "paragraph" ? 4 : 2}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder={block.type === "warning" ? "Warning text" : "Text"}
          className={block.type === "warning" ? "border-red-300 bg-red-50" : ""}
        />
      );
    case "ingredient_table":
      return <IngredientTableEditor block={block} onChange={onChange} readOnly={readOnly} />;
    case "photo_trio":
      return <PhotoTrioEditor block={block} onChange={onChange} has={has} readOnly={readOnly} />;
    case "step":
      return (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Step {stepNo}</p>
          <TextArea value={block.text} disabled={readOnly} rows={3} onChange={(e) => onChange({ ...block, text: e.target.value })} placeholder="What to do" invalid={has("")} />
          <MediaList value={block.media} onChange={(media) => onChange({ ...block, media })} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <NumField
              label="Time (min)"
              value={block.duration_seconds === null ? null : Math.round((block.duration_seconds / 60) * 100) / 100}
              onChange={(v) => onChange({ ...block, duration_seconds: v === null ? null : Math.max(1, Math.round(v * 60)) })}
              disabled={readOnly}
            />
            <NumField label="Temp (°C)" value={block.temperature_c} onChange={(v) => onChange({ ...block, temperature_c: v })} disabled={readOnly} />
            <Field label="Amount added">
              <TextInput value={block.input_amount ?? ""} disabled={readOnly} onChange={(e) => onChange({ ...block, input_amount: orNull(e.target.value) })} />
            </Field>
            <Field label="Safety note">
              <TextInput value={block.safety_note ?? ""} disabled={readOnly} onChange={(e) => onChange({ ...block, safety_note: orNull(e.target.value) })} />
            </Field>
          </div>
        </div>
      );
    case "final_product":
      return (
        <div className="space-y-2">
          <MediaList value={block.media} onChange={(media) => onChange({ ...block, media })} />
          <TextArea value={block.text} disabled={readOnly} rows={2} onChange={(e) => onChange({ ...block, text: e.target.value })} placeholder="Finished state description" />
        </div>
      );
  }
}

function IngredientTableEditor({ block, onChange, readOnly }: { block: BlockOf<"ingredient_table">; onChange: (b: Block) => void; readOnly: boolean }) {
  const setRow = (i: number, patch: Partial<IngredientRow>) => onChange({ ...block, rows: block.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-stone-500">
            <th className="pb-1">Ingredient</th>
            <th className="pb-1">Amount</th>
            <th className="pb-1">Unit</th>
            <th className="pb-1">Note</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {block.rows.map((r, i) => (
            <tr key={i}>
              <td className="pr-1">
                <input value={r.name} disabled={readOnly} onChange={(e) => setRow(i, { name: e.target.value })} className="w-full rounded border border-stone-300 px-2 py-1" />
              </td>
              <td className="w-24 pr-1">
                <input
                  defaultValue={r.amount ?? ""}
                  disabled={readOnly}
                  inputMode="decimal"
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    const n = v === "" ? null : Number(v);
                    if (n === null || (Number.isFinite(n) && n > 0)) setRow(i, { amount: n });
                  }}
                  className="w-full rounded border border-stone-300 px-2 py-1"
                />
              </td>
              <td className="w-20 pr-1">
                <input value={r.unit ?? ""} disabled={readOnly} onChange={(e) => setRow(i, { unit: orNull(e.target.value) })} className="w-full rounded border border-stone-300 px-2 py-1" />
              </td>
              <td className="pr-1">
                <input value={r.note ?? ""} disabled={readOnly} onChange={(e) => setRow(i, { note: orNull(e.target.value) })} className="w-full rounded border border-stone-300 px-2 py-1" />
              </td>
              <td>
                {!readOnly && (
                  <button type="button" aria-label="Remove row" onClick={() => onChange({ ...block, rows: block.rows.filter((_, j) => j !== i) })} className="px-2 text-red-700">
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <button type="button" onClick={() => onChange({ ...block, rows: [...block.rows, { name: "", amount: null, unit: null, note: null }] })} className="mt-1 text-sm underline">
          + Row
        </button>
      )}
    </div>
  );
}

function PhotoTrioEditor({
  block,
  onChange,
  has,
  readOnly,
}: {
  block: BlockOf<"photo_trio">;
  onChange: (b: Block) => void;
  has: (suffix: string) => boolean;
  readOnly: boolean;
}) {
  const spec = (patch: Partial<BlockOf<"photo_trio">["specs"]>) => onChange({ ...block, specs: { ...block.specs, ...patch } });
  return (
    <div className="space-y-3">
      <Field label="Ingredient">
        <TextInput value={block.ingredient} disabled={readOnly} onChange={(e) => onChange({ ...block, ingredient: e.target.value })} invalid={has("")} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={block.no_prep} disabled={readOnly} onChange={(e) => onChange({ ...block, no_prep: e.target.checked })} />
        No preparation required
      </label>
      {block.no_prep ? (
        <Field label="Reason">
          <TextInput value={block.no_prep_reason ?? ""} disabled={readOnly} onChange={(e) => onChange({ ...block, no_prep_reason: orNull(e.target.value) })} invalid={has(".no_prep_reason")} />
        </Field>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {(["before", "during", "after"] as const).map((role) => (
              <div key={role}>
                <MediaSlot
                  label={role.toUpperCase()}
                  value={block.photos[role]}
                  onChange={(v) => onChange({ ...block, photos: { ...block.photos, [role]: v } })}
                  invalid={has(`.photos.${role}`)}
                />
                {!block.photos[role] && (
                  <input
                    value={block.na_reasons[role] ?? ""}
                    disabled={readOnly}
                    onChange={(e) => onChange({ ...block, na_reasons: { ...block.na_reasons, [role]: orNull(e.target.value) } })}
                    placeholder="or N/A reason"
                    className="mt-1 w-full rounded border border-stone-300 px-1.5 py-1 text-xs"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <NumField label="Length (mm)" value={block.specs.length_mm} onChange={(v) => spec({ length_mm: v })} disabled={readOnly} />
            <NumField label="Width (mm)" value={block.specs.width_mm} onChange={(v) => spec({ width_mm: v })} disabled={readOnly} />
            <NumField label="Thickness (mm)" value={block.specs.thickness_mm} onChange={(v) => spec({ thickness_mm: v })} disabled={readOnly} />
            <NumField label="Weight before (g)" value={block.specs.weight_before_g} onChange={(v) => spec({ weight_before_g: v })} disabled={readOnly} />
            <NumField label="Weight after (g)" value={block.specs.weight_after_g} onChange={(v) => spec({ weight_after_g: v })} disabled={readOnly} />
            <Field label="Tools">
              <TextInput value={block.specs.tools ?? ""} disabled={readOnly} onChange={(e) => spec({ tools: orNull(e.target.value) })} />
            </Field>
          </div>
          <Field label="Method">
            <TextArea value={block.specs.cut_method ?? ""} disabled={readOnly} rows={2} onChange={(e) => spec({ cut_method: orNull(e.target.value) })} />
          </Field>
          <Field label="Caution">
            <TextInput value={block.specs.caution ?? ""} disabled={readOnly} onChange={(e) => spec({ caution: orNull(e.target.value) })} />
          </Field>
        </>
      )}
    </div>
  );
}
