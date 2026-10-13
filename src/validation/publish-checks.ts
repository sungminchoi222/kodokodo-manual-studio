/**
 * 발행 전 검증 (명세 3.3 / 4.3 / 9-2·5). 순수 함수 — 편집기 실시간 표시, 승인 화면, 발행 액션이 같이 쓴다.
 * 모든 문제는 "어디의 무엇"인지 구체적으로 알려준다. 값을 대신 채우지 않는다.
 */
import type { ManualContent, MediaRef } from "@/domain/manual-content";
import { PRODUCT_STATE_LABEL } from "@/domain/manual-content";
import { TEMPERATURE_REQUIRED_METHODS, TEMPLATE_RULES } from "@/domain/templates";

export interface PublishIssue {
  code: string;
  /** 편집기에서 위치를 찾기 위한 경로 (예: blocks.<id>.photos.after, storage.cooked.shelf_life) */
  path: string;
  message: string;
}

export interface MediaStatus {
  uploaded: boolean;
  kind: string;
}

export interface PublishCheckInput {
  content: ManualContent;
  /** 참조 미디어 상태 (RLS 로 조회된 것만 포함. 없으면 접근 불가/삭제로 본다) */
  media: Record<string, MediaStatus>;
  hasPreviousVersion: boolean;
  /** 발행 폼 — 승인 화면에서만 전달 */
  form?: { change_log: string; revision_reason: string };
}

const PHOTO_LABEL = { before: "BEFORE", during: "DURING", after: "AFTER" } as const;

export function checkPublish({ content, media, hasPreviousVersion, form }: PublishCheckInput): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const rules = TEMPLATE_RULES[content.manual.manual_type];
  const { blocks } = content;

  // ---- metadata ----
  if (!content.manual.title.trim()) add("title", "meta.title", "Manual title is required.");
  if (content.manual.store_scope === "selected_stores" && content.manual.stores.length === 0) {
    add("stores", "meta.stores", "Select at least one store, or apply to all stores of the brand.");
  }
  if (content.sources.submission_ids.length === 0 && !content.sources.hq_direct_source_note?.trim()) {
    add("source", "meta.source", "Link at least one field submission, or describe the HQ source.");
  }

  // ---- media ----
  const checkMedia = (ref: MediaRef | null, path: string, label: string, mustBeImage: boolean) => {
    if (!ref) return;
    const m = media[ref.media_id];
    if (!m) add("media_missing", path, `${label}: media is not available (removed or no access).`);
    else if (!m.uploaded) add("media_incomplete", path, `${label}: media upload is incomplete.`);
    else if (mustBeImage && m.kind !== "image") add("media_kind", path, `${label}: must be a photo.`);
  };

  // ---- blocks ----
  const ingredientRows = blocks.flatMap((b) => (b.type === "ingredient_table" ? b.rows : []));
  const trios = blocks.filter((b) => b.type === "photo_trio");
  const steps = blocks.filter((b) => b.type === "step");

  if (rules.requireIngredients && ingredientRows.length === 0) {
    add("ingredients", "blocks", "Add an ingredient table with at least one ingredient.");
  }
  ingredientRows.forEach((r, i) => {
    const name = r.name.trim() || `Row ${i + 1}`;
    if (!r.name.trim()) add("ingredient_name", "blocks.ingredients", `Ingredient row ${i + 1}: name is empty.`);
    if ((r.amount === null) !== (r.unit === null || r.unit.trim() === "")) {
      add("ingredient_unit", "blocks.ingredients", `${name}: amount and unit must be entered together.`);
    }
  });

  if (rules.requirePrepCardPerIngredient) {
    const trioNames = new Set(trios.map((t) => t.ingredient.trim().toLowerCase()));
    for (const r of ingredientRows) {
      if (r.name.trim() && !trioNames.has(r.name.trim().toLowerCase())) {
        add("prep_card", "blocks.ingredients", `${r.name}: no preparation card (BEFORE / DURING / AFTER).`);
      }
    }
  }

  for (const t of trios) {
    const name = t.ingredient.trim() || "Unnamed ingredient";
    if (!t.ingredient.trim()) add("trio_name", `blocks.${t.id}`, "Preparation card: ingredient name is empty.");
    if (t.no_prep) {
      if (!t.no_prep_reason?.trim()) add("no_prep_reason", `blocks.${t.id}.no_prep_reason`, `${name}: reason for "no preparation" is required.`);
      continue;
    }
    for (const role of ["before", "during", "after"] as const) {
      const photo = t.photos[role];
      if (!photo && !t.na_reasons[role]?.trim()) {
        add("prep_photo", `blocks.${t.id}.photos.${role}`, `${name}: ${PHOTO_LABEL[role]} photo is missing and no N/A reason is given.`);
      }
      checkMedia(photo, `blocks.${t.id}.photos.${role}`, `${name} ${PHOTO_LABEL[role]}`, true);
    }
  }

  if (rules.requireSteps && steps.length === 0) add("steps", "blocks", "Add at least one step.");
  steps.forEach((s, i) => {
    if (!s.text.trim()) add("step_text", `blocks.${s.id}`, `Step ${i + 1}: description is empty.`);
    s.media.forEach((m, j) => checkMedia(m, `blocks.${s.id}.media.${j}`, `Step ${i + 1} media`, false));
  });

  const finals = blocks.filter((b) => b.type === "final_product");
  finals.forEach((f) => f.media.forEach((m, j) => checkMedia(m, `blocks.${f.id}.media.${j}`, "Final product media", false)));
  if (rules.requireFinalPhoto && !finals.some((f) => f.media.some((m) => media[m.media_id]?.kind === "image"))) {
    add("final_photo", "blocks", "Add a final product block with at least one photo.");
  }

  for (const b of blocks) {
    if ((b.type === "heading" || b.type === "warning") && !b.text.trim()) add("empty_block", `blocks.${b.id}`, `Empty ${b.type} block.`);
  }

  // ---- storage & shelf life ----
  if (rules.requireStorage && content.storage_standards.length === 0) {
    add("storage", "storage", "Add at least one storage & shelf-life standard (per product state).");
  }
  for (const s of content.storage_standards) {
    const label = `Storage (${PRODUCT_STATE_LABEL[s.product_state]}${s.product_state_note ? ` – ${s.product_state_note}` : ""})`;
    const path = `storage.${s.product_state}`;
    if (!s.storage_method) add("storage_method", `${path}.storage_method`, `${label}: storage method NEEDS HQ CONFIRMATION.`);
    if (
      s.storage_method &&
      TEMPERATURE_REQUIRED_METHODS.includes(s.storage_method) &&
      s.temperature_min_c === null &&
      s.temperature_max_c === null
    ) {
      add("storage_temp", `${path}.temperature`, `${label}: temperature NEEDS HQ CONFIRMATION.`);
    }
    if (s.shelf_life_value === null || s.shelf_life_unit === null) {
      add("shelf_life", `${path}.shelf_life`, `${label}: shelf life NEEDS HQ CONFIRMATION.`);
    }
    if (!s.shelf_life_start_event) add("shelf_life_start", `${path}.shelf_life_start_event`, `${label}: shelf-life start event NEEDS HQ CONFIRMATION.`);
    if (s.shelf_life_start_event === "custom" && !s.start_event_description?.trim()) {
      add("start_event_description", `${path}.start_event_description`, `${label}: describe the custom start event.`);
    }
    if (!s.verified) add("storage_unverified", `${path}.verified`, `${label}: not verified by an HQ approver.`);
  }

  // ---- serving ----
  if (rules.requireServing && content.serving_standards.length === 0) {
    add("serving", "serving", "Add the official portion (serving standard).");
  }
  content.serving_standards.forEach((s, i) => {
    const label = `Serving${s.serving_context ? ` (${s.serving_context})` : ` ${i + 1}`}`;
    if (s.quantity === null || s.unit === null) add("portion", `serving.${i}.quantity`, `${label}: portion quantity and unit NEED HQ CONFIRMATION.`);
    if (!s.verified) add("serving_unverified", `serving.${i}.verified`, `${label}: not verified by an HQ approver.`);
    checkMedia(s.reference_image, `serving.${i}.reference_image`, `${label} reference photo`, true);
  });

  // ---- publication form ----
  if (form) {
    if (!form.change_log.trim()) add("change_log", "form.change_log", "Change log is required.");
    if (hasPreviousVersion && !form.revision_reason.trim()) {
      add("revision_reason", "form.revision_reason", "Revision reason is required when revising a published manual.");
    }
  }
  return issues;
}
