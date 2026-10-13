/**
 * 현장 제출 → 매뉴얼 초안 블록 (순수 함수). HQ 가 이후 자유롭게 수정한다.
 * 현장 값(수량·치수 등)은 그대로 옮기되, 보관·사용기한·공식 제공량은 옮기지 않는다 (HQ 기준 영역).
 */
import type { Block, MediaRef } from "@/domain/manual-content";
import type { MediaRole } from "@/domain/enums";
import type { Submission, SubmissionCookingStep } from "@/domain/types";

export interface ImportMedia {
  mediaId: string;
  entityType: string;
  entityId: string;
  role: MediaRole;
  caption: string | null;
  kind: string;
  uploadStatus: string;
}

export interface ImportIngredient {
  id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  notes: string | null;
  preparation: {
    id: string;
    no_prep: boolean;
    na_reason: string | null;
    cut_method: string | null;
    length_mm: number | null;
    width_mm: number | null;
    thickness_mm: number | null;
    weight_before_g: number | null;
    weight_after_g: number | null;
    tools: string | null;
    caution: string | null;
    notes: string | null;
    before_na_reason: string | null;
    during_na_reason: string | null;
    after_na_reason: string | null;
  } | null;
}

export interface ImportSource {
  submission: Pick<Submission, "id" | "capture_mode" | "title" | "note" | "qc_notes">;
  ingredients: ImportIngredient[];
  steps: Pick<SubmissionCookingStep, "id" | "step_no" | "description" | "duration_seconds" | "temperature_c" | "input_amount" | "safety_note">[];
  media: ImportMedia[];
}

const num = (v: number | string | null) => (v === null ? null : Number(v));

export function importBlocksFromSubmission(src: ImportSource, newId: () => string): Block[] {
  const ready = src.media.filter((m) => m.uploadStatus === "uploaded");
  const ref = (m: ImportMedia): MediaRef => ({ media_id: m.mediaId, caption: m.caption });
  const first = (entityType: string, entityId: string, role: MediaRole) => {
    const m = ready.find((x) => x.entityType === entityType && x.entityId === entityId && x.role === role && x.kind === "image");
    return m ? ref(m) : null;
  };
  const blocks: Block[] = [];

  if (src.submission.capture_mode === "quick") {
    if (src.submission.note) blocks.push({ id: newId(), type: "paragraph", text: src.submission.note });
    const attachments = ready.filter((m) => m.role === "attachment");
    if (attachments.length) {
      blocks.push({
        id: newId(),
        type: "step",
        text: "",
        media: attachments.slice(0, 12).map(ref),
        duration_seconds: null,
        temperature_c: null,
        input_amount: null,
        safety_note: null,
      });
    }
    return blocks;
  }

  if (src.ingredients.length) {
    blocks.push({ id: newId(), type: "heading", text: "Ingredients" });
    blocks.push({
      id: newId(),
      type: "ingredient_table",
      rows: src.ingredients.map((i) => ({ name: i.name, amount: num(i.amount), unit: i.unit, note: i.notes })),
    });
    blocks.push({ id: newId(), type: "heading", text: "Ingredient preparation" });
    for (const i of src.ingredients) {
      const p = i.preparation;
      blocks.push({
        id: newId(),
        type: "photo_trio",
        ingredient: i.name,
        no_prep: p?.no_prep ?? false,
        no_prep_reason: p?.na_reason ?? null,
        photos: {
          before: p ? first("submission_preparation", p.id, "before") : null,
          during: p ? first("submission_preparation", p.id, "during") : null,
          after: p ? first("submission_preparation", p.id, "after") : null,
        },
        na_reasons: {
          before: p?.before_na_reason ?? null,
          during: p?.during_na_reason ?? null,
          after: p?.after_na_reason ?? null,
        },
        specs: {
          cut_method: p?.cut_method ?? null,
          length_mm: num(p?.length_mm ?? null),
          width_mm: num(p?.width_mm ?? null),
          thickness_mm: num(p?.thickness_mm ?? null),
          weight_before_g: num(p?.weight_before_g ?? null),
          weight_after_g: num(p?.weight_after_g ?? null),
          tools: p?.tools ?? null,
          caution: [p?.caution, p?.notes].filter(Boolean).join("\n") || null,
        },
      });
    }
  }

  if (src.steps.length) {
    blocks.push({ id: newId(), type: "heading", text: "Cooking steps" });
    for (const s of [...src.steps].sort((a, b) => a.step_no - b.step_no)) {
      blocks.push({
        id: newId(),
        type: "step",
        text: s.description,
        media: ready.filter((m) => m.entityType === "submission_cooking_step" && m.entityId === s.id).slice(0, 12).map(ref),
        duration_seconds: s.duration_seconds,
        temperature_c: num(s.temperature_c),
        input_amount: s.input_amount,
        safety_note: s.safety_note,
      });
    }
  }

  const finals = ready.filter((m) => m.entityType === "submission" && m.role === "final");
  if (finals.length || src.submission.qc_notes) {
    blocks.push({
      id: newId(),
      type: "final_product",
      text: src.submission.qc_notes ?? "",
      media: finals.slice(0, 12).map(ref),
    });
  }
  return blocks;
}
