/**
 * 현장 제출 전 누락 검사 (명세 2.1, 2.2-6). 순수 함수 — 화면(Review)·서버 제출 액션·HQ Inbox 가 같이 쓴다.
 * - error: 제출 차단 (업로드 미완료, 필수 기본정보, 재료 없음 등)
 * - warning: 제출은 가능하지만 HQ 검토 대상으로 표시 (사진 누락 등). 작성자가 확인하고 제출한다.
 * 사진 누락을 "차단"할지는 매뉴얼 발행 단계(Step 3)의 정책이며, 현장 제출에서는 사실 수집을 막지 않는다.
 */
import { PREP_PHOTO_ROLES, type CaptureMode, type MediaRole, type PrepPhotoRole } from "@/domain/enums";

export interface CheckMedia {
  entityType: string;
  entityId: string;
  role: MediaRole;
  uploadStatus: "pending" | "uploaded" | "failed";
}

export interface CheckInput {
  captureMode: CaptureMode;
  title: string;
  station: string;
  note: string | null;
  ingredients: {
    id: string;
    name: string;
    preparation: {
      id: string;
      no_prep: boolean;
      na_reason: string | null;
      before_na_reason: string | null;
      during_na_reason: string | null;
      after_na_reason: string | null;
    } | null;
  }[];
  steps: { id: string; step_no: number; description: string }[];
  media: CheckMedia[];
}

export interface CheckIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  /** 화면 이동용 단계 */
  step: "basics" | "ingredients" | "prep" | "steps" | "final" | "media";
  ingredientId?: string;
}

const PHOTO_LABEL: Record<PrepPhotoRole, string> = { before: "BEFORE", during: "DURING", after: "AFTER" };

export function checkSubmission(input: CheckInput): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const add = (i: CheckIssue) => issues.push(i);

  if (!input.title.trim()) add({ level: "error", code: "title", message: "Title is required.", step: "basics" });
  if (!input.station.trim()) add({ level: "error", code: "station", message: "Station is required.", step: "basics" });

  const unfinished = input.media.filter((m) => m.uploadStatus !== "uploaded");
  if (unfinished.length > 0) {
    add({
      level: "error",
      code: "uploads_incomplete",
      message: `${unfinished.length} file(s) have not finished uploading. Retry or remove them.`,
      step: "media",
    });
  }
  const uploaded = input.media.filter((m) => m.uploadStatus === "uploaded");

  if (input.captureMode === "quick") {
    if (uploaded.length === 0 && !input.note?.trim()) {
      add({ level: "error", code: "quick_empty", message: "Add at least one photo/video or a note.", step: "media" });
    }
    return issues;
  }

  // guided
  if (input.ingredients.length === 0) {
    add({ level: "error", code: "no_ingredients", message: "Add at least one ingredient.", step: "ingredients" });
  }

  for (const ing of input.ingredients) {
    const prep = ing.preparation;
    if (prep?.no_prep) {
      if (!prep.na_reason?.trim()) {
        add({
          level: "error",
          code: "no_prep_reason",
          message: `${ing.name}: explain why no preparation is required.`,
          step: "prep",
          ingredientId: ing.id,
        });
      }
      continue;
    }
    for (const role of PREP_PHOTO_ROLES) {
      const hasPhoto = prep
        ? uploaded.some((m) => m.entityType === "submission_preparation" && m.entityId === prep.id && m.role === role)
        : false;
      const naReason = prep?.[`${role}_na_reason`];
      if (!hasPhoto && !naReason?.trim()) {
        add({
          level: "warning",
          code: `missing_${role}`,
          message: `${ing.name}: ${PHOTO_LABEL[role]} photo missing (add a photo or an N/A reason).`,
          step: "prep",
          ingredientId: ing.id,
        });
      }
    }
  }

  if (input.steps.length === 0) {
    add({ level: "warning", code: "no_steps", message: "No cooking steps recorded.", step: "steps" });
  }
  for (const s of input.steps) {
    if (!s.description.trim()) {
      add({ level: "warning", code: "step_description", message: `Step ${s.step_no}: description is empty.`, step: "steps" });
    }
  }

  if (!uploaded.some((m) => m.entityType === "submission" && m.role === "final")) {
    add({ level: "warning", code: "no_final_photo", message: "No final product photo.", step: "final" });
  }
  return issues;
}

export const hasBlockingIssues = (issues: CheckIssue[]) => issues.some((i) => i.level === "error");
