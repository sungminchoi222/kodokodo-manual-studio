/**
 * HQ Product Standards 초안 입력 검증 (명세 3.2 B/C).
 * 여기서는 "입력된 값이 서로 모순되지 않는지"만 본다. 값이 비어 있는 것은 초안에서 허용되며,
 * 발행 가능 여부(필수값 누락 → NEEDS HQ CONFIRMATION)는 Step 3 의 publish-checks 에서 판정한다.
 * DB CHECK 제약(0001_core.sql)과 같은 규칙을 유지한다.
 */
import { z } from "zod";
import {
  PORTION_UNITS,
  PRODUCT_STATES,
  SHELF_LIFE_START_EVENTS,
  SHELF_LIFE_UNITS,
  STORAGE_METHODS,
} from "@/domain/enums";
import { nullablePositive, nullableTemperatureC, nullableText } from "./common";

export const storageStandardInputSchema = z
  .object({
    product_state: z.enum(PRODUCT_STATES),
    product_state_note: nullableText(500),
    storage_method: z.enum(STORAGE_METHODS).nullable(),
    storage_method_note: nullableText(500),
    temperature_min_c: nullableTemperatureC(),
    temperature_max_c: nullableTemperatureC(),
    shelf_life_value: nullablePositive(),
    shelf_life_unit: z.enum(SHELF_LIFE_UNITS).nullable(),
    shelf_life_start_event: z.enum(SHELF_LIFE_START_EVENTS).nullable(),
    start_event_description: nullableText(500),
    label_instructions: nullableText(),
    container_and_cover: nullableText(),
    disposal_rule: nullableText(),
    reference_note: nullableText(),
  })
  .superRefine((v, ctx) => {
    if (v.temperature_min_c !== null && v.temperature_max_c !== null && !(v.temperature_min_c < v.temperature_max_c)) {
      ctx.addIssue({
        code: "custom",
        path: ["temperature_min_c"],
        message: "Minimum temperature must be lower than maximum temperature.",
      });
    }
    if ((v.shelf_life_value === null) !== (v.shelf_life_unit === null)) {
      ctx.addIssue({
        code: "custom",
        path: [v.shelf_life_value === null ? "shelf_life_value" : "shelf_life_unit"],
        message: "Shelf life value and unit must be entered together.",
      });
    }
    if (v.shelf_life_start_event === "custom" && !v.start_event_description) {
      ctx.addIssue({
        code: "custom",
        path: ["start_event_description"],
        message: "Describe the custom start event.",
      });
    }
    if (v.storage_method === "other" && !v.storage_method_note) {
      ctx.addIssue({
        code: "custom",
        path: ["storage_method_note"],
        message: "Describe the storage method.",
      });
    }
  });
export type StorageStandardInput = z.infer<typeof storageStandardInputSchema>;

/** 상태별 1행 규칙 (other 제외) */
export const storageStandardListSchema = z.array(storageStandardInputSchema).superRefine((rows, ctx) => {
  const seen = new Map<string, number>();
  rows.forEach((row, i) => {
    if (row.product_state === "other") return;
    const prev = seen.get(row.product_state);
    if (prev !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [i, "product_state"],
        message: `Duplicate product state "${row.product_state}" (row ${prev + 1}). Use one row per state.`,
      });
    } else {
      seen.set(row.product_state, i);
    }
  });
});

export const toleranceSchema = z
  .object({
    minus: z.number().finite().nonnegative().optional(),
    plus: z.number().finite().nonnegative().optional(),
    unit: z.enum(PORTION_UNITS),
  })
  .refine((t) => t.minus !== undefined || t.plus !== undefined, {
    message: "Enter at least one tolerance bound.",
  });

export const servingStandardInputSchema = z
  .object({
    quantity: nullablePositive(),
    unit: z.enum(PORTION_UNITS).nullable(),
    serving_context: nullableText(300),
    measurement_method: nullableText(),
    tolerance_json: toleranceSchema.nullable(),
    plating_instructions: nullableText(4000),
    reference_image_asset_id: z.uuid().nullable(),
  })
  .superRefine((v, ctx) => {
    if ((v.quantity === null) !== (v.unit === null)) {
      ctx.addIssue({
        code: "custom",
        path: [v.quantity === null ? "quantity" : "unit"],
        message: "Portion quantity and unit must be entered together.",
      });
    }
  });
export type ServingStandardInput = z.infer<typeof servingStandardInputSchema>;
