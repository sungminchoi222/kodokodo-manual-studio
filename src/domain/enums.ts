// DB enum 과 1:1. 값을 바꾸면 supabase/migrations 에 새 마이그레이션이 필요하다.

export const APP_ROLES = ["field_staff", "store_manager", "hq_editor", "hq_approver", "system_admin"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const STORE_ROLES = ["field_staff", "store_manager"] as const satisfies readonly AppRole[];
export const HQ_ROLES = ["hq_editor", "hq_approver", "system_admin"] as const satisfies readonly AppRole[];
export const APPROVER_ROLES = ["hq_approver", "system_admin"] as const satisfies readonly AppRole[];

export const CAPTURE_MODES = ["quick", "guided"] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];

export const SUBMISSION_STATUSES = ["draft", "submitted", "in_review", "rejected", "used"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const MANUAL_TYPES = ["recipe", "service_sop", "cleaning_sop", "equipment_instruction"] as const;
export type ManualType = (typeof MANUAL_TYPES)[number];

export const STORE_SCOPES = ["brand_all", "selected_stores"] as const;
export type StoreScope = (typeof STORE_SCOPES)[number];

export const LOCALES = ["en", "ko", "tl"] as const;
export type Locale = (typeof LOCALES)[number];

export const REVIEW_STATUSES = [
  "draft",
  "in_review",
  "revision_requested",
  "pending_approval",
  "published",
  "archived",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const VERSION_STATUSES = ["published", "archived"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const PRODUCT_STATES = ["raw", "prepared", "cooked", "hot_held", "opened", "other"] as const;
export type ProductState = (typeof PRODUCT_STATES)[number];

export const STORAGE_METHODS = ["chilled", "frozen", "ambient", "hot_hold", "other"] as const;
export type StorageMethod = (typeof STORAGE_METHODS)[number];

export const SHELF_LIFE_UNITS = ["hours", "days"] as const;
export type ShelfLifeUnit = (typeof SHELF_LIFE_UNITS)[number];

export const SHELF_LIFE_START_EVENTS = [
  "prepared_at",
  "cooked_at",
  "opened_at",
  "thawed_at",
  "received_at",
  "custom",
] as const;
export type ShelfLifeStartEvent = (typeof SHELF_LIFE_START_EVENTS)[number];

export const PORTION_UNITS = ["g", "ml", "pcs", "scoops", "ladles", "bowls", "servings"] as const;
export type PortionUnit = (typeof PORTION_UNITS)[number];

export const MEDIA_KINDS = ["image", "video", "audio", "document"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_ROLES = [
  "before",
  "during",
  "after",
  "step",
  "final",
  "reference",
  "plating",
  "attachment",
  "voice_memo",
] as const;
export type MediaRole = (typeof MEDIA_ROLES)[number];

export const PREP_PHOTO_ROLES = ["before", "during", "after"] as const satisfies readonly MediaRole[];
export type PrepPhotoRole = (typeof PREP_PHOTO_ROLES)[number];

export const MEDIA_LINK_ENTITY_TYPES = [
  "submission",
  "submission_ingredient",
  "submission_preparation",
  "submission_cooking_step",
  "manual_draft",
  "manual_version",
] as const;
export type MediaLinkEntityType = (typeof MEDIA_LINK_ENTITY_TYPES)[number];

export const EXPORT_FORMATS = ["pptx", "pdf"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_SCOPES = ["individual", "combined"] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

export const EXPORT_STATUSES = ["queued", "running", "success", "failed", "cancelled"] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

// station 은 DB 상 자유 텍스트. 아래는 UI 제안값이며 문서코드 세그먼트(KK-MAIN-001)를 함께 정의한다.
export const STATION_PRESETS = [
  { label: "Main", code: "MAIN" },
  { label: "Prep", code: "PREP" },
  { label: "Grill", code: "GRILL" },
  { label: "Service", code: "SVC" },
  { label: "Cleaning", code: "CLEAN" },
  { label: "Equipment", code: "EQUIP" },
] as const;

export const ROLE_LABELS: Record<AppRole, string> = {
  field_staff: "Field Staff",
  store_manager: "Store Manager",
  hq_editor: "HQ Editor",
  hq_approver: "HQ Approver",
  system_admin: "System Admin",
};
