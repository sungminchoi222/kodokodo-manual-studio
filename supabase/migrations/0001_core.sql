-- MANUAL STUDIO — 0001 core schema
-- 원칙: 모든 업무 데이터는 brand_id 소유. 파일 바이너리는 DB 에 넣지 않고 storage_key 만 보관.
-- 안전 기준(온도·사용기한·제공량)은 nullable 로 두고, 값이 없으면 발행 검증에서 차단한다. 기본값/추정값 금지.
-- 주의: CHECK 는 NULL 을 통과시키므로 '값이 있어야 함' 조건은 coalesce 로 NULL 을 실패로 바꾼다.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('field_staff', 'store_manager', 'hq_editor', 'hq_approver', 'system_admin');
create type public.capture_mode as enum ('quick', 'guided');
create type public.submission_status as enum ('draft', 'submitted', 'in_review', 'rejected', 'used');
create type public.manual_type as enum ('recipe', 'service_sop', 'cleaning_sop', 'equipment_instruction');
create type public.store_scope as enum ('brand_all', 'selected_stores');
create type public.locale_code as enum ('en', 'ko', 'tl');
create type public.review_status as enum ('draft', 'in_review', 'revision_requested', 'pending_approval', 'published', 'archived');
create type public.version_status as enum ('published', 'archived');
create type public.product_state as enum ('raw', 'prepared', 'cooked', 'hot_held', 'opened', 'other');
create type public.storage_method as enum ('chilled', 'frozen', 'ambient', 'hot_hold', 'other');
create type public.shelf_life_unit as enum ('hours', 'days');
create type public.shelf_life_start_event as enum ('prepared_at', 'cooked_at', 'opened_at', 'thawed_at', 'received_at', 'custom');
create type public.portion_unit as enum ('g', 'ml', 'pcs', 'scoops', 'ladles', 'bowls', 'servings');
create type public.media_kind as enum ('image', 'video', 'audio', 'document');
create type public.media_role as enum ('before', 'during', 'after', 'step', 'final', 'reference', 'plating', 'attachment', 'voice_memo');
create type public.upload_status as enum ('pending', 'uploaded', 'failed');
create type public.translation_status as enum ('draft', 'in_review', 'approved');
create type public.export_format as enum ('pptx', 'pdf');
create type public.export_scope as enum ('individual', 'combined');
create type public.export_status as enum ('queued', 'running', 'success', 'failed', 'cancelled');

-- ---------------------------------------------------------------------------
-- tenancy
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now()
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  code text not null unique check (code ~ '^[A-Z0-9]{2,10}$'), -- 문서코드 접두사 (예: KK)
  name text not null check (char_length(name) between 1 and 160),
  brand_theme_json jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  name text not null check (char_length(name) between 1 and 160),
  timezone text not null default 'Asia/Manila', -- 표시 변환용. DB 시각은 항상 UTC(timestamptz)
  status text not null default 'active' check (status in ('active', 'inactive')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, brand_id)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  brand_id uuid,
  store_id uuid,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  foreign key (brand_id, organization_id) references public.brands (id, organization_id),
  foreign key (store_id, brand_id) references public.stores (id, brand_id),
  -- 현장 역할은 매장 단위, HQ 역할은 브랜드 단위, system_admin 은 조직 전체(brand null) 또는 특정 브랜드
  constraint memberships_scope_by_role check (
    case role
      when 'field_staff' then brand_id is not null and store_id is not null
      when 'store_manager' then brand_id is not null and store_id is not null
      when 'hq_editor' then brand_id is not null and store_id is null
      when 'hq_approver' then brand_id is not null and store_id is null
      when 'system_admin' then store_id is null
    end
  ),
  unique nulls not distinct (user_id, organization_id, brand_id, store_id, role)
);

-- ---------------------------------------------------------------------------
-- manuals (submissions.source_manual_id 가 참조하므로 먼저 생성)
-- ---------------------------------------------------------------------------
create table public.manuals (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  title text not null check (char_length(title) between 1 and 160),
  station text not null check (char_length(station) between 1 and 60),
  manual_type public.manual_type not null,
  store_scope public.store_scope not null default 'brand_all',
  display_language public.locale_code not null default 'en',
  document_code text not null unique,
  review_status public.review_status not null default 'draft',
  active_version_id uuid, -- FK 는 manual_versions 생성 후 추가
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, brand_id)
);

create table public.manual_applicability (
  manual_id uuid not null,
  store_id uuid not null,
  brand_id uuid not null,
  primary key (manual_id, store_id),
  foreign key (manual_id, brand_id) references public.manuals (id, brand_id) on delete cascade,
  foreign key (store_id, brand_id) references public.stores (id, brand_id)
);

-- 문서코드 카운터: KK-MAIN-001
create table public.document_code_counters (
  brand_id uuid not null references public.brands (id),
  station_code text not null check (station_code ~ '^[A-Z0-9]{1,8}$'),
  next_value integer not null default 1 check (next_value > 0),
  primary key (brand_id, station_code)
);

-- ---------------------------------------------------------------------------
-- field submissions
-- ---------------------------------------------------------------------------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  store_id uuid not null,
  station text not null check (char_length(station) between 1 and 60),
  capture_mode public.capture_mode not null,
  title text not null check (char_length(title) between 1 and 160),
  category text,
  note text,
  status public.submission_status not null default 'draft',
  -- guided: 기본정보
  batch_unit text,
  batch_yield numeric check (batch_yield > 0),
  -- guided: 완성품 (현장 관찰값. HQ 기준이 아님)
  final_yield_quantity numeric check (final_yield_quantity > 0),
  final_yield_unit text,
  test_portion_note text,
  qc_notes text,
  -- quick: 기존 매뉴얼 수정 제안
  source_manual_id uuid,
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brand_id),
  foreign key (store_id, brand_id) references public.stores (id, brand_id),
  foreign key (source_manual_id, brand_id) references public.manuals (id, brand_id),
  constraint submissions_submitted_at check (status = 'draft' or submitted_at is not null),
  constraint submissions_rejection_reason check (status <> 'rejected' or coalesce(char_length(trim(rejection_reason)), 0) > 0)
);

create table public.submission_ingredients (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  amount numeric check (amount > 0),
  unit text,
  tools text,
  notes text,
  sort_order integer not null default 0,
  constraint submission_ingredients_amount_unit check ((amount is null) = (unit is null))
);

create table public.submission_preparations (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null unique references public.submission_ingredients (id) on delete cascade,
  cut_method text,
  length_mm numeric check (length_mm > 0),
  width_mm numeric check (width_mm > 0),
  thickness_mm numeric check (thickness_mm > 0),
  weight_before_g numeric check (weight_before_g > 0),
  weight_after_g numeric check (weight_after_g > 0),
  tools text,
  caution text,
  notes text,
  -- 손질 자체가 없는 재료 (기성 소스 등)
  no_prep boolean not null default false,
  na_reason text,
  -- 개별 사진 N/A (예: DURING 사진이 의미 없는 경우). 허용 여부는 미확정 정책 → HQ 확인 대상
  before_na_reason text,
  during_na_reason text,
  after_na_reason text,
  constraint submission_preparations_na_reason check (not no_prep or coalesce(char_length(trim(na_reason)), 0) > 0)
);

create table public.submission_cooking_steps (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  step_no integer not null check (step_no > 0),
  description text not null default '',
  duration_seconds integer check (duration_seconds > 0),
  temperature_c numeric,
  input_amount text,
  safety_note text,
  unique (submission_id, step_no)
);

-- ---------------------------------------------------------------------------
-- media
-- ---------------------------------------------------------------------------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  submission_id uuid,
  owner_id uuid not null references public.profiles (id),
  storage_key text not null unique check (storage_key like brand_id::text || '/%'),
  kind public.media_kind not null,
  mime text not null,
  size_bytes bigint check (size_bytes >= 0),
  checksum text,
  thumbnail_key text check (thumbnail_key is null or thumbnail_key like brand_id::text || '/%'),
  duration_seconds numeric check (duration_seconds >= 0),
  width integer check (width > 0),
  height integer check (height > 0),
  upload_status public.upload_status not null default 'pending',
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, brand_id),
  foreign key (submission_id, brand_id) references public.submissions (id, brand_id) on delete set null (submission_id)
);

create table public.media_links (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null,
  brand_id uuid not null,
  entity_type text not null check (entity_type in (
    'submission', 'submission_ingredient', 'submission_preparation', 'submission_cooking_step',
    'manual_draft', 'manual_version'
  )),
  entity_id uuid not null,
  role public.media_role not null,
  sort_order integer not null default 0,
  caption text,
  created_at timestamptz not null default now(),
  foreign key (media_id, brand_id) references public.media_assets (id, brand_id) on delete cascade
);
create index media_links_entity_idx on public.media_links (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- manual drafts / versions
-- ---------------------------------------------------------------------------
create table public.manual_source_submissions (
  manual_id uuid not null,
  submission_id uuid not null,
  brand_id uuid not null,
  primary key (manual_id, submission_id),
  foreign key (manual_id, brand_id) references public.manuals (id, brand_id) on delete cascade,
  foreign key (submission_id, brand_id) references public.submissions (id, brand_id)
);

create table public.manual_drafts (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null unique,
  brand_id uuid not null,
  -- 블록 본문 + 비정규화 HQ 필드(소스 규정, QC 기준, 경고, 알레르겐 등). 앱에서 zod 로 검증.
  draft_json jsonb not null default '{}'::jsonb,
  hq_direct_source_note text, -- source submission 이 없을 때 HQ 직접 작성 출처
  optimistic_version integer not null default 1,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (id, brand_id),
  foreign key (manual_id, brand_id) references public.manuals (id, brand_id) on delete cascade
);

create table public.manual_versions (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null,
  brand_id uuid not null,
  version_label text not null check (version_label ~ '^v[0-9]+\.[0-9]+$'),
  locale public.locale_code not null,
  document_code text not null,
  content_snapshot_json jsonb not null,
  content_checksum text not null, -- 트리거가 sha256 으로 계산
  change_log text not null check (char_length(trim(change_log)) > 0),
  revision_reason text,
  approval_comment text,
  approved_by uuid not null references public.profiles (id),
  approved_at timestamptz not null,
  published_at timestamptz not null default now(),
  effective_from timestamptz,
  status public.version_status not null default 'published',
  created_at timestamptz not null default now(),
  unique (id, brand_id),
  unique (manual_id, version_label, locale),
  foreign key (manual_id, brand_id) references public.manuals (id, brand_id)
);

alter table public.manuals
  add constraint manuals_active_version_fk
  foreign key (active_version_id, brand_id) references public.manual_versions (id, brand_id);

-- 상태별 보관기준. draft 행과 발행본 행을 같은 구조로 두되 부모는 정확히 하나.
create table public.storage_standards (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  draft_id uuid,
  version_id uuid,
  product_state public.product_state not null,
  product_state_note text,
  storage_method public.storage_method,
  storage_method_note text,
  temperature_min_c numeric(5, 2),
  temperature_max_c numeric(5, 2),
  shelf_life_value numeric check (shelf_life_value > 0),
  shelf_life_unit public.shelf_life_unit,
  shelf_life_start_event public.shelf_life_start_event,
  start_event_description text,
  label_instructions text,
  container_and_cover text,
  disposal_rule text,
  reference_note text,
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  sort_order integer not null default 0,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  foreign key (draft_id, brand_id) references public.manual_drafts (id, brand_id) on delete cascade,
  foreign key (version_id, brand_id) references public.manual_versions (id, brand_id),
  constraint storage_standards_one_parent check (num_nonnulls(draft_id, version_id) = 1),
  constraint storage_standards_temp_range check (
    temperature_min_c is null or temperature_max_c is null or temperature_min_c < temperature_max_c
  ),
  constraint storage_standards_shelf_life_pair check ((shelf_life_value is null) = (shelf_life_unit is null)),
  constraint storage_standards_custom_event check (
    shelf_life_start_event is distinct from 'custom' or coalesce(char_length(trim(start_event_description)), 0) > 0
  ),
  constraint storage_standards_other_method check (
    storage_method is distinct from 'other' or coalesce(char_length(trim(storage_method_note)), 0) > 0
  ),
  constraint storage_standards_verified_pair check ((verified_by is null) = (verified_at is null))
);
-- 같은 부모에서 상태별 1행 (other 는 설명을 달리하여 여러 행 허용)
create unique index storage_standards_draft_state_uq on public.storage_standards (draft_id, product_state)
  where draft_id is not null and product_state <> 'other';
create unique index storage_standards_version_state_uq on public.storage_standards (version_id, product_state)
  where version_id is not null and product_state <> 'other';

create table public.serving_standards (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  draft_id uuid,
  version_id uuid,
  quantity numeric check (quantity > 0),
  unit public.portion_unit,
  serving_context text,
  measurement_method text,
  tolerance_json jsonb, -- {"minus": n, "plus": n, "unit": "g"} 본사 승인값만
  plating_instructions text,
  reference_image_asset_id uuid,
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  sort_order integer not null default 0,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  foreign key (draft_id, brand_id) references public.manual_drafts (id, brand_id) on delete cascade,
  foreign key (version_id, brand_id) references public.manual_versions (id, brand_id),
  foreign key (reference_image_asset_id, brand_id) references public.media_assets (id, brand_id),
  constraint serving_standards_one_parent check (num_nonnulls(draft_id, version_id) = 1),
  constraint serving_standards_quantity_pair check ((quantity is null) = (unit is null)),
  constraint serving_standards_verified_pair check ((verified_by is null) = (verified_at is null))
);

create table public.manual_translations (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null,
  brand_id uuid not null,
  base_version_id uuid,
  locale public.locale_code not null,
  content_json jsonb not null default '{}'::jsonb,
  status public.translation_status not null default 'draft',
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  foreign key (manual_id, brand_id) references public.manuals (id, brand_id) on delete cascade,
  foreign key (base_version_id, brand_id) references public.manual_versions (id, brand_id),
  unique nulls not distinct (manual_id, base_version_id, locale),
  constraint manual_translations_approved check (
    status <> 'approved' or (approved_by is not null and approved_at is not null)
  )
);

-- ---------------------------------------------------------------------------
-- export / audit
-- ---------------------------------------------------------------------------
create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles (id),
  brand_id uuid not null references public.brands (id),
  format public.export_format not null,
  scope public.export_scope not null,
  locale public.locale_code not null,
  ordered_version_ids_json jsonb not null check (jsonb_typeof(ordered_version_ids_json) = 'array'),
  options_json jsonb not null default '{}'::jsonb,
  template_version text not null,
  is_draft_export boolean not null default false,
  status public.export_status not null default 'queued',
  progress integer not null default 0 check (progress between 0 and 100),
  file_key text,
  checksum text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint export_jobs_combined_count check (
    scope <> 'combined' or jsonb_array_length(ordered_version_ids_json) >= 2
  ),
  constraint export_jobs_individual_count check (
    scope <> 'individual' or jsonb_array_length(ordered_version_ids_json) = 1
  ),
  constraint export_jobs_success_file check (status <> 'success' or (file_key is not null and checksum is not null))
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid,
  brand_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id, created_at desc);

-- 자주 쓰는 조회 인덱스
create index submissions_brand_status_idx on public.submissions (brand_id, status, submitted_at desc);
create index submissions_submitted_by_idx on public.submissions (submitted_by);
create index manuals_brand_idx on public.manuals (brand_id, review_status);
create index manual_versions_manual_idx on public.manual_versions (manual_id, published_at desc);
create index memberships_user_idx on public.memberships (user_id);
create index export_jobs_requested_by_idx on public.export_jobs (requested_by, created_at desc);
