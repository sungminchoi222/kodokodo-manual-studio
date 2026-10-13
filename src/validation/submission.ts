/**
 * 현장 제출 입력 검증 (명세 2.1 / 2.2). 임시저장 단계에서는 부분 입력을 허용하고,
 * 제출 시 누락 검사(사진 업로드 상태 포함)는 Step 2 에서 submit-checks 로 추가한다.
 */
import { z } from "zod";
import { nullablePositive, nullableTemperatureC, nullableText, requiredText } from "./common";

const submissionBase = {
  brand_id: z.uuid(),
  store_id: z.uuid(),
  station: requiredText(1, 60),
  title: requiredText(1, 160),
  note: nullableText(8000),
};

export const quickSubmissionSchema = z.object({
  ...submissionBase,
  capture_mode: z.literal("quick"),
  source_manual_id: z.uuid().nullable(),
});
export type QuickSubmissionInput = z.infer<typeof quickSubmissionSchema>;

export const guidedSubmissionBasicsSchema = z.object({
  ...submissionBase,
  capture_mode: z.literal("guided"),
  category: nullableText(80),
  batch_unit: nullableText(40),
  batch_yield: nullablePositive(),
});
export type GuidedSubmissionBasicsInput = z.infer<typeof guidedSubmissionBasicsSchema>;

export const ingredientInputSchema = z
  .object({
    name: requiredText(1, 160),
    amount: nullablePositive(),
    unit: nullableText(20),
    tools: nullableText(300),
    notes: nullableText(2000),
  })
  .refine((v) => (v.amount === null) === (v.unit === null), {
    path: ["unit"],
    message: "Amount and unit must be entered together.",
  });
export type IngredientInput = z.infer<typeof ingredientInputSchema>;

export const preparationInputSchema = z
  .object({
    cut_method: nullableText(500),
    length_mm: nullablePositive(),
    width_mm: nullablePositive(),
    thickness_mm: nullablePositive(),
    weight_before_g: nullablePositive(),
    weight_after_g: nullablePositive(),
    tools: nullableText(300),
    caution: nullableText(2000),
    notes: nullableText(2000),
    no_prep: z.boolean(),
    na_reason: nullableText(500),
    before_na_reason: nullableText(500),
    during_na_reason: nullableText(500),
    after_na_reason: nullableText(500),
  })
  .refine((v) => !v.no_prep || v.na_reason !== null, {
    path: ["na_reason"],
    message: "Explain why no preparation is required.",
  });
export type PreparationInput = z.infer<typeof preparationInputSchema>;

export const cookingStepInputSchema = z.object({
  step_no: z.number().int().positive(),
  description: z.string().trim().max(8000),
  duration_seconds: z.number().int().positive().nullable(),
  temperature_c: nullableTemperatureC(),
  input_amount: nullableText(300),
  safety_note: nullableText(2000),
});
export type CookingStepInput = z.infer<typeof cookingStepInputSchema>;

export const finalProductInputSchema = z
  .object({
    final_yield_quantity: nullablePositive(),
    final_yield_unit: nullableText(20),
    test_portion_note: nullableText(2000),
    qc_notes: nullableText(4000),
  })
  .refine((v) => (v.final_yield_quantity === null) === (v.final_yield_unit === null), {
    path: ["final_yield_unit"],
    message: "Yield quantity and unit must be entered together.",
  });
export type FinalProductInput = z.infer<typeof finalProductInputSchema>;
