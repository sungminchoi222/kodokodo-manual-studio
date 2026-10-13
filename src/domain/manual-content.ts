/**
 * 매뉴얼 본문 모델.
 * - ManualDraftContent: manual_drafts.draft_json (블록 + 품질/안전 텍스트 기준). HQ 편집 대상.
 * - ManualContent: 화면 미리보기·발행 스냅샷(content_snapshot_json)·내보내기(Step 4)의 공통 원천.
 *   보관/제공 기준은 정규화 테이블에서 읽어 합친다. 레이아웃 정보는 넣지 않는다 (렌더러 책임).
 */
import { z } from "zod";
import {
  LOCALES,
  MANUAL_TYPES,
  PORTION_UNITS,
  PRODUCT_STATES,
  SHELF_LIFE_START_EVENTS,
  SHELF_LIFE_UNITS,
  STORAGE_METHODS,
  STORE_SCOPES,
  type MediaKind,
} from "./enums";

const text = (max: number) => z.string().max(max);
const optText = (max: number) => z.string().max(max).nullable();
const optPositive = z.number().finite().positive().nullable();
const blockId = z.string().min(1).max(64);

export const mediaRefSchema = z.object({
  media_id: z.uuid(),
  caption: optText(1000),
});
export type MediaRef = z.infer<typeof mediaRefSchema>;

export const ingredientRowSchema = z.object({
  name: text(160),
  amount: optPositive,
  unit: optText(20),
  note: optText(500),
});
export type IngredientRow = z.infer<typeof ingredientRowSchema>;

export const prepSpecsSchema = z.object({
  cut_method: optText(1000),
  length_mm: optPositive,
  width_mm: optPositive,
  thickness_mm: optPositive,
  weight_before_g: optPositive,
  weight_after_g: optPositive,
  tools: optText(300),
  caution: optText(2000),
});
export type PrepSpecs = z.infer<typeof prepSpecsSchema>;

const PHOTO_SLOTS = z.object({
  before: mediaRefSchema.nullable(),
  during: mediaRefSchema.nullable(),
  after: mediaRefSchema.nullable(),
});
const NA_SLOTS = z.object({
  before: optText(500),
  during: optText(500),
  after: optText(500),
});

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ id: blockId, type: z.literal("heading"), text: text(300) }),
  z.object({ id: blockId, type: z.literal("paragraph"), text: text(20000) }),
  z.object({ id: blockId, type: z.literal("ingredient_table"), rows: z.array(ingredientRowSchema).max(200) }),
  z.object({
    id: blockId,
    type: z.literal("photo_trio"),
    ingredient: text(160),
    no_prep: z.boolean(),
    no_prep_reason: optText(500),
    photos: PHOTO_SLOTS,
    na_reasons: NA_SLOTS,
    specs: prepSpecsSchema,
  }),
  z.object({
    id: blockId,
    type: z.literal("step"),
    text: text(20000),
    media: z.array(mediaRefSchema).max(12),
    duration_seconds: z.number().int().positive().nullable(),
    temperature_c: z.number().finite().nullable(),
    input_amount: optText(300),
    safety_note: optText(2000),
  }),
  z.object({ id: blockId, type: z.literal("warning"), text: text(4000) }),
  z.object({ id: blockId, type: z.literal("final_product"), text: text(8000), media: z.array(mediaRefSchema).max(12) }),
]);
export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

export const sauceRuleSchema = z.object({
  sauce: text(160),
  amount: optPositive,
  unit: optText(20),
  condition: optText(500),
});

export const qualitySchema = z.object({
  acceptance_criteria: z.array(text(500)).max(50).default([]),
  rejection_criteria: z.array(text(500)).max(50).default([]),
  critical_warnings: z.array(text(500)).max(50).default([]),
  allergen_notes: optText(4000).default(null),
  sauce_rules: z.array(sauceRuleSchema).max(30).default([]),
});
export type Quality = z.infer<typeof qualitySchema>;

export const manualDraftContentSchema = z.object({
  schema_version: z.literal(1).default(1),
  blocks: z.array(blockSchema).max(300).default([]),
  quality: qualitySchema.default({
    acceptance_criteria: [],
    rejection_criteria: [],
    critical_warnings: [],
    allergen_notes: null,
    sauce_rules: [],
  }),
});
export type ManualDraftContent = z.infer<typeof manualDraftContentSchema>;

export function emptyDraftContent(): ManualDraftContent {
  return manualDraftContentSchema.parse({});
}

/** DB 의 draft_json 을 읽는다. 형식이 깨졌으면 빈 본문과 오류를 함께 돌려준다 (데이터를 조용히 버리지 않도록 호출자가 표시). */
export function parseDraftContent(json: unknown): { content: ManualDraftContent; error: string | null } {
  const r = manualDraftContentSchema.safeParse(json ?? {});
  if (r.success) return { content: r.data, error: null };
  return { content: emptyDraftContent(), error: r.error.issues[0]?.message ?? "Invalid draft content" };
}

// ---------------------------------------------------------------------------
// ManualContent (미리보기/스냅샷 공통)
// ---------------------------------------------------------------------------
export const storageStandardViewSchema = z.object({
  product_state: z.enum(PRODUCT_STATES),
  product_state_note: optText(500),
  storage_method: z.enum(STORAGE_METHODS).nullable(),
  storage_method_note: optText(500),
  temperature_min_c: z.number().nullable(),
  temperature_max_c: z.number().nullable(),
  shelf_life_value: z.number().nullable(),
  shelf_life_unit: z.enum(SHELF_LIFE_UNITS).nullable(),
  shelf_life_start_event: z.enum(SHELF_LIFE_START_EVENTS).nullable(),
  start_event_description: optText(500),
  label_instructions: optText(4000),
  container_and_cover: optText(4000),
  disposal_rule: optText(4000),
  reference_note: optText(4000),
  verified: z.object({ by_name: z.string(), at: z.string() }).nullable(),
});
export type StorageStandardView = z.infer<typeof storageStandardViewSchema>;

export const servingStandardViewSchema = z.object({
  quantity: z.number().nullable(),
  unit: z.enum(PORTION_UNITS).nullable(),
  serving_context: optText(300),
  measurement_method: optText(4000),
  tolerance: z
    .object({ minus: z.number().optional(), plus: z.number().optional(), unit: z.enum(PORTION_UNITS) })
    .nullable(),
  plating_instructions: optText(4000),
  reference_image: mediaRefSchema.nullable(),
  verified: z.object({ by_name: z.string(), at: z.string() }).nullable(),
});
export type ServingStandardView = z.infer<typeof servingStandardViewSchema>;

export interface MediaMeta {
  kind: MediaKind;
  mime: string;
  width: number | null;
  height: number | null;
}

export const manualContentSchema = z.object({
  schema_version: z.literal(1),
  manual: z.object({
    id: z.uuid(),
    document_code: z.string(),
    title: z.string(),
    brand: z.object({ id: z.uuid(), name: z.string(), code: z.string() }),
    station: z.string(),
    manual_type: z.enum(MANUAL_TYPES),
    store_scope: z.enum(STORE_SCOPES),
    stores: z.array(z.object({ id: z.uuid(), name: z.string() })),
    locale: z.enum(LOCALES),
  }),
  blocks: z.array(blockSchema),
  quality: qualitySchema,
  storage_standards: z.array(storageStandardViewSchema),
  serving_standards: z.array(servingStandardViewSchema),
  media: z.record(
    z.string(),
    z.object({
      kind: z.enum(["image", "video", "audio", "document"]),
      mime: z.string(),
      width: z.number().nullable(),
      height: z.number().nullable(),
    }),
  ),
  sources: z.object({ submission_ids: z.array(z.uuid()), hq_direct_source_note: z.string().nullable() }),
  version: z
    .object({
      label: z.string(),
      change_log: z.string(),
      revision_reason: z.string().nullable(),
      approved_by_name: z.string(),
      approved_at: z.string(),
    })
    .optional(),
});
export type ManualContent = z.infer<typeof manualContentSchema>;

/** 본문이 참조하는 모든 미디어 id (중복 제거, 등장 순서 유지) */
export function referencedMediaIds(content: Pick<ManualContent, "blocks" | "serving_standards">): string[] {
  const ids: string[] = [];
  const push = (r: MediaRef | null | undefined) => {
    if (r && !ids.includes(r.media_id)) ids.push(r.media_id);
  };
  for (const b of content.blocks) {
    if (b.type === "photo_trio") {
      push(b.photos.before);
      push(b.photos.during);
      push(b.photos.after);
    } else if (b.type === "step" || b.type === "final_product") {
      b.media.forEach(push);
    }
  }
  for (const s of content.serving_standards) push(s.reference_image);
  return ids;
}

export const SHELF_LIFE_EVENT_LABEL: Record<(typeof SHELF_LIFE_START_EVENTS)[number], string> = {
  prepared_at: "preparation",
  cooked_at: "cooking",
  opened_at: "opening",
  thawed_at: "thawing",
  received_at: "receiving",
  custom: "custom event",
};

export const PRODUCT_STATE_LABEL: Record<(typeof PRODUCT_STATES)[number], string> = {
  raw: "Raw",
  prepared: "Prepared",
  cooked: "Cooked",
  hot_held: "Hot held",
  opened: "Opened",
  other: "Other",
};

export const STORAGE_METHOD_LABEL: Record<(typeof STORAGE_METHODS)[number], string> = {
  chilled: "Chilled",
  frozen: "Frozen",
  ambient: "Ambient",
  hot_hold: "Hot hold",
  other: "Other",
};
