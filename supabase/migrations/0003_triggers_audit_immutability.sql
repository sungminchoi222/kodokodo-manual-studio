-- MANUAL STUDIO — 0003 triggers: profile 생성, updated_at, 상태 전이, 불변성, 브랜드 일관성, audit
-- auth.uid() 가 null 인 경우는 서버(service role)/마이그레이션 실행이며, 세부 권한 검사를 생략한다.

-- ---------------------------------------------------------------------------
-- auth.users → profiles
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), new.email), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at / updated_by
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if (to_jsonb(new) ? 'updated_by') and auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger submissions_touch before update on public.submissions
  for each row execute function app.touch_updated();
create trigger storage_standards_touch before update on public.storage_standards
  for each row execute function app.touch_updated();
create trigger serving_standards_touch before update on public.serving_standards
  for each row execute function app.touch_updated();
create trigger manual_translations_touch before update on public.manual_translations
  for each row execute function app.touch_updated();

-- 초안: 낙관적 버전 증가. 앱은 `where optimistic_version = :expected` 로 갱신하고 0행이면 충돌로 처리.
create or replace function app.touch_manual_draft() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.optimistic_version := old.optimistic_version + 1;
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger manual_drafts_touch before update on public.manual_drafts
  for each row execute function app.touch_manual_draft();

-- ---------------------------------------------------------------------------
-- submissions: 상태 전이 + 현장 사실 보존
-- ---------------------------------------------------------------------------
create or replace function app.guard_submission_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_review_cols text[] := array['status', 'reviewed_by', 'reviewed_at', 'rejection_reason', 'updated_at'];
begin
  if new.brand_id <> old.brand_id or new.store_id <> old.store_id
     or new.submitted_by <> old.submitted_by or new.capture_mode <> old.capture_mode then
    raise exception 'submission ownership fields are immutable' using errcode = '42501';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  -- HQ 검토: 제출된 건의 상태/검토 필드만 변경 가능 (현장 수집 내용 수정 금지)
  if old.status <> 'draft' then
    if not app.is_hq(old.brand_id) then
      raise exception 'submitted submission is read-only' using errcode = '42501';
    end if;
    if (to_jsonb(new) - v_review_cols) <> (to_jsonb(old) - v_review_cols) then
      raise exception 'HQ cannot modify field-captured content' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      if not (
        (old.status = 'submitted' and new.status in ('in_review', 'rejected', 'used'))
        or (old.status = 'in_review' and new.status in ('rejected', 'used'))
      ) then
        raise exception 'invalid submission status transition % -> %', old.status, new.status using errcode = '22023';
      end if;
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    return new;
  end if;

  -- 작성자: draft 편집 또는 제출
  if new.status not in ('draft', 'submitted') then
    raise exception 'author can only save draft or submit' using errcode = '42501';
  end if;
  if new.status = 'submitted' then
    new.submitted_at := now();
  end if;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.rejection_reason := old.rejection_reason;
  return new;
end;
$$;

create trigger submissions_guard before update on public.submissions
  for each row execute function app.guard_submission_update();

-- ---------------------------------------------------------------------------
-- media: 원본 식별 필드 불변 + 링크 대상의 브랜드 일치
-- ---------------------------------------------------------------------------
create or replace function app.guard_media_asset_update() returns trigger
language plpgsql as $$
begin
  if new.storage_key <> old.storage_key or new.brand_id <> old.brand_id
     or new.owner_id <> old.owner_id or new.kind <> old.kind then
    raise exception 'media original fields are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger media_assets_guard before update on public.media_assets
  for each row execute function app.guard_media_asset_update();

create or replace function app.check_media_link() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_entity_brand uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.entity_type = 'manual_version' then
    raise exception 'published media links are immutable' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  v_entity_brand := case new.entity_type
    when 'submission' then (select s.brand_id from public.submissions s where s.id = new.entity_id)
    when 'submission_ingredient' then (
      select s.brand_id from public.submission_ingredients i
      join public.submissions s on s.id = i.submission_id where i.id = new.entity_id)
    when 'submission_preparation' then (
      select s.brand_id from public.submission_preparations p
      join public.submission_ingredients i on i.id = p.ingredient_id
      join public.submissions s on s.id = i.submission_id where p.id = new.entity_id)
    when 'submission_cooking_step' then (
      select s.brand_id from public.submission_cooking_steps c
      join public.submissions s on s.id = c.submission_id where c.id = new.entity_id)
    when 'manual_draft' then (select d.brand_id from public.manual_drafts d where d.id = new.entity_id)
    when 'manual_version' then (select v.brand_id from public.manual_versions v where v.id = new.entity_id)
  end;

  if v_entity_brand is null or v_entity_brand <> new.brand_id then
    raise exception 'media link entity % % not found in brand', new.entity_type, new.entity_id using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger media_links_check before insert or update or delete on public.media_links
  for each row execute function app.check_media_link();

-- ---------------------------------------------------------------------------
-- manuals: 소유 브랜드/문서코드 불변, 발행 관련 필드는 승인자만
-- ---------------------------------------------------------------------------
create or replace function app.guard_manual_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.brand_id <> old.brand_id or new.document_code <> old.document_code then
    raise exception 'manual brand/document_code are immutable' using errcode = '42501';
  end if;
  if auth.uid() is not null
     and (new.active_version_id is distinct from old.active_version_id
          or (new.review_status is distinct from old.review_status and new.review_status = 'published'))
     and not app.is_approver(old.brand_id) then
    raise exception 'only HQ approver can publish' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger manuals_guard before update on public.manuals
  for each row execute function app.guard_manual_update();

-- ---------------------------------------------------------------------------
-- manual_versions: 발행 스냅샷 불변 + checksum
-- ---------------------------------------------------------------------------
-- security definer: 호출자에게 extensions 스키마 권한이 없어도 checksum 계산
create or replace function app.prepare_manual_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.status := 'published';
  -- jsonb 의 text 표현은 키 순서가 정규화되어 동일 내용이면 동일 checksum
  new.content_checksum := encode(extensions.digest(convert_to(new.content_snapshot_json::text, 'UTF8'), 'sha256'), 'hex');
  return new;
end;
$$;

create trigger manual_versions_prepare before insert on public.manual_versions
  for each row execute function app.prepare_manual_version();

create or replace function app.guard_manual_version() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'published manual versions cannot be deleted' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'status') <> (to_jsonb(old) - 'status') then
    raise exception 'published manual versions are immutable; publish a new version instead' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not (old.status = 'published' and new.status = 'archived') then
    raise exception 'invalid version status transition % -> %', old.status, new.status using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger manual_versions_guard before update or delete on public.manual_versions
  for each row execute function app.guard_manual_version();

-- ---------------------------------------------------------------------------
-- storage/serving standards: 발행본 행 불변, 검증 표시는 승인자만, 값 변경 시 검증 해제
-- ---------------------------------------------------------------------------
create or replace function app.guard_standard_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_meta_cols text[] := array['verified_by', 'verified_at', 'updated_by', 'updated_at', 'sort_order'];
begin
  if tg_op in ('UPDATE', 'DELETE') and old.version_id is not null then
    raise exception '% rows of published versions are immutable', tg_table_name using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.draft_id is distinct from old.draft_id or new.version_id is distinct from old.version_id) then
    raise exception 'standard row parent cannot change' using errcode = '42501';
  end if;

  -- 검증 표시 변경 = 기준 확정 행위 → 승인자만, 본인 이름으로만
  if new.verified_by is not null
     and (tg_op = 'INSERT' or new.verified_by is distinct from old.verified_by or new.verified_at is distinct from old.verified_at)
     and auth.uid() is not null
     and (not app.is_approver(new.brand_id) or new.verified_by <> auth.uid()) then
    raise exception 'only HQ approver can verify standards as themselves' using errcode = '42501';
  end if;

  -- 검증 이후 기준 값이 바뀌면 검증 해제 (같은 갱신에서 재검증한 경우는 유지)
  if tg_op = 'UPDATE'
     and old.verified_by is not null
     and new.verified_by is not distinct from old.verified_by
     and new.verified_at is not distinct from old.verified_at
     and (to_jsonb(new) - v_meta_cols) <> (to_jsonb(old) - v_meta_cols) then
    new.verified_by := null;
    new.verified_at := null;
  end if;
  return new;
end;
$$;

create trigger storage_standards_guard before insert or update or delete on public.storage_standards
  for each row execute function app.guard_standard_row();
create trigger serving_standards_guard before insert or update or delete on public.serving_standards
  for each row execute function app.guard_standard_row();

-- ---------------------------------------------------------------------------
-- audit
-- ---------------------------------------------------------------------------
create or replace function app.write_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_events (actor_id, brand_id, entity_type, entity_id, action, before_json, after_json)
  values (
    auth.uid(),
    nullif(v_row ->> 'brand_id', '')::uuid,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'manual_id')::uuid,
    lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger submissions_audit after insert or update or delete on public.submissions
  for each row execute function app.write_audit();
create trigger manuals_audit after insert or update or delete on public.manuals
  for each row execute function app.write_audit();
create trigger manual_applicability_audit after insert or update or delete on public.manual_applicability
  for each row execute function app.write_audit();
create trigger manual_drafts_audit after insert or update or delete on public.manual_drafts
  for each row execute function app.write_audit();
create trigger manual_versions_audit after insert or update on public.manual_versions
  for each row execute function app.write_audit();
create trigger storage_standards_audit after insert or update or delete on public.storage_standards
  for each row execute function app.write_audit();
create trigger serving_standards_audit after insert or update or delete on public.serving_standards
  for each row execute function app.write_audit();
create trigger manual_translations_audit after insert or update or delete on public.manual_translations
  for each row execute function app.write_audit();
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function app.write_audit();
create trigger media_links_audit after insert or update or delete on public.media_links
  for each row execute function app.write_audit();
