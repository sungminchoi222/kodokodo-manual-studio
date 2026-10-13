// DB 행 타입 (snake_case 그대로). 마이그레이션과 함께 유지한다.
import type {
  AppRole,
  CaptureMode,
  Locale,
  ManualType,
  MediaKind,
  MediaLinkEntityType,
  MediaRole,
  PortionUnit,
  ProductState,
  ReviewStatus,
  ShelfLifeStartEvent,
  ShelfLifeUnit,
  StorageMethod,
  StoreScope,
  SubmissionStatus,
  VersionStatus,
} from "./enums";

type Uuid = string;
type Timestamp = string; // ISO-8601 UTC

export interface Organization {
  id: Uuid;
  name: string;
  created_at: Timestamp;
}

export interface Brand {
  id: Uuid;
  organization_id: Uuid;
  code: string;
  name: string;
  brand_theme_json: Record<string, unknown>;
  is_demo: boolean;
  created_at: Timestamp;
}

export interface Store {
  id: Uuid;
  brand_id: Uuid;
  name: string;
  timezone: string;
  status: "active" | "inactive";
  is_demo: boolean;
  created_at: Timestamp;
}

export interface Profile {
  id: Uuid;
  name: string;
  email: string;
  status: "active" | "disabled";
  created_at: Timestamp;
}

export interface MembershipRow {
  id: Uuid;
  user_id: Uuid;
  organization_id: Uuid;
  brand_id: Uuid | null;
  store_id: Uuid | null;
  role: AppRole;
  created_at: Timestamp;
}

export interface Submission {
  id: Uuid;
  brand_id: Uuid;
  store_id: Uuid;
  station: string;
  capture_mode: CaptureMode;
  title: string;
  category: string | null;
  note: string | null;
  status: SubmissionStatus;
  batch_unit: string | null;
  batch_yield: number | null;
  final_yield_quantity: number | null;
  final_yield_unit: string | null;
  test_portion_note: string | null;
  qc_notes: string | null;
  source_manual_id: Uuid | null;
  submitted_by: Uuid;
  submitted_at: Timestamp | null;
  reviewed_by: Uuid | null;
  reviewed_at: Timestamp | null;
  rejection_reason: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SubmissionIngredient {
  id: Uuid;
  submission_id: Uuid;
  name: string;
  amount: number | null;
  unit: string | null;
  tools: string | null;
  notes: string | null;
  sort_order: number;
}

export interface SubmissionPreparation {
  id: Uuid;
  ingredient_id: Uuid;
  cut_method: string | null;
  length_mm: number | null;
  width_mm: number | null;
  thickness_mm: number | null;
  weight_before_g: number | null;
  weight_after_g: number | null;
  tools: string | null;
  caution: string | null;
  notes: string | null;
  no_prep: boolean;
  na_reason: string | null;
  before_na_reason: string | null;
  during_na_reason: string | null;
  after_na_reason: string | null;
}

export interface SubmissionCookingStep {
  id: Uuid;
  submission_id: Uuid;
  step_no: number;
  description: string;
  duration_seconds: number | null;
  temperature_c: number | null;
  input_amount: string | null;
  safety_note: string | null;
}

export interface MediaAsset {
  id: Uuid;
  brand_id: Uuid;
  submission_id: Uuid | null;
  owner_id: Uuid;
  storage_key: string;
  kind: MediaKind;
  mime: string;
  size_bytes: number | null;
  checksum: string | null;
  thumbnail_key: string | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  upload_status: "pending" | "uploaded" | "failed";
  captured_at: Timestamp | null;
  created_at: Timestamp;
}

export interface MediaLink {
  id: Uuid;
  media_id: Uuid;
  brand_id: Uuid;
  entity_type: MediaLinkEntityType;
  entity_id: Uuid;
  role: MediaRole;
  sort_order: number;
  caption: string | null;
  created_at: Timestamp;
}

export interface Manual {
  id: Uuid;
  brand_id: Uuid;
  title: string;
  station: string;
  manual_type: ManualType;
  store_scope: StoreScope;
  display_language: Locale;
  document_code: string;
  review_status: ReviewStatus;
  active_version_id: Uuid | null;
  created_by: Uuid;
  created_at: Timestamp;
  archived_at: Timestamp | null;
}

export interface ManualDraft {
  id: Uuid;
  manual_id: Uuid;
  brand_id: Uuid;
  draft_json: Record<string, unknown>;
  hq_direct_source_note: string | null;
  optimistic_version: number;
  updated_by: Uuid | null;
  updated_at: Timestamp;
}

export interface ManualVersion {
  id: Uuid;
  manual_id: Uuid;
  brand_id: Uuid;
  version_label: string;
  locale: Locale;
  document_code: string;
  content_snapshot_json: Record<string, unknown>;
  content_checksum: string;
  change_log: string;
  revision_reason: string | null;
  approval_comment: string | null;
  approved_by: Uuid;
  approved_at: Timestamp;
  published_at: Timestamp;
  effective_from: Timestamp | null;
  status: VersionStatus;
  created_at: Timestamp;
}

export interface StorageStandardRow {
  id: Uuid;
  brand_id: Uuid;
  draft_id: Uuid | null;
  version_id: Uuid | null;
  product_state: ProductState;
  product_state_note: string | null;
  storage_method: StorageMethod | null;
  storage_method_note: string | null;
  temperature_min_c: number | null;
  temperature_max_c: number | null;
  shelf_life_value: number | null;
  shelf_life_unit: ShelfLifeUnit | null;
  shelf_life_start_event: ShelfLifeStartEvent | null;
  start_event_description: string | null;
  label_instructions: string | null;
  container_and_cover: string | null;
  disposal_rule: string | null;
  reference_note: string | null;
  verified_by: Uuid | null;
  verified_at: Timestamp | null;
  sort_order: number;
  updated_by: Uuid | null;
  updated_at: Timestamp;
}

export interface ServingStandardRow {
  id: Uuid;
  brand_id: Uuid;
  draft_id: Uuid | null;
  version_id: Uuid | null;
  quantity: number | null;
  unit: PortionUnit | null;
  serving_context: string | null;
  measurement_method: string | null;
  tolerance_json: { minus?: number; plus?: number; unit: PortionUnit } | null;
  plating_instructions: string | null;
  reference_image_asset_id: Uuid | null;
  verified_by: Uuid | null;
  verified_at: Timestamp | null;
  sort_order: number;
  updated_by: Uuid | null;
  updated_at: Timestamp;
}
