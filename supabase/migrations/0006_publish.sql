-- MANUAL STUDIO — 0006 발행(승인) 트랜잭션
-- 발행 = 버전 스냅샷 생성 + 초안 기준 행을 버전 행으로 복제 + 발행 미디어 링크 + 이전 버전 보관 + active 전환.
-- 하나의 함수(=하나의 트랜잭션)로 처리해 일부만 반영되는 일이 없게 한다. security invoker → RLS(승인자) 그대로 적용.

alter table public.manuals add column review_comment text;

-- 버전 행 복제 시 verified_by 는 "검증한 승인자"(다른 사람일 수 있음)를 그대로 보존해야 한다.
-- 0003 의 "본인 이름으로만 검증" 규칙은 초안 행에만 적용한다. (버전 행 insert 는 RLS 상 승인자만 가능)
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

  if new.draft_id is not null
     and new.verified_by is not null
     and (tg_op = 'INSERT' or new.verified_by is distinct from old.verified_by or new.verified_at is distinct from old.verified_at)
     and auth.uid() is not null
     and (not app.is_approver(new.brand_id) or new.verified_by <> auth.uid()) then
    raise exception 'only HQ approver can verify standards as themselves' using errcode = '42501';
  end if;

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

-- 초안 기준 행의 변경 감지용 도장. 검증 시점과 발행 시점 사이에 기준이 바뀌면 발행을 거부한다.
create or replace function public.draft_standards_stamp(p_draft_id uuid) returns text
language sql stable security invoker set search_path = '' as $$
  select md5(coalesce(string_agg(x.k, ',' order by x.k), ''))
  from (
    select 'st:' || s.id::text || ':' || s.updated_at::text || ':' || coalesce(s.verified_at::text, '-') as k
    from public.storage_standards s where s.draft_id = p_draft_id
    union all
    select 'sv:' || v.id::text || ':' || v.updated_at::text || ':' || coalesce(v.verified_at::text, '-')
    from public.serving_standards v where v.draft_id = p_draft_id
  ) x;
$$;
revoke all on function public.draft_standards_stamp(uuid) from public, anon;
grant execute on function public.draft_standards_stamp(uuid) to authenticated;

create or replace function public.publish_manual(
  p_manual_id uuid,
  p_expected_draft_version integer,
  p_standards_stamp text,
  p_version_label text,
  p_change_log text,
  p_revision_reason text,
  p_approval_comment text,
  p_approved_at timestamptz,
  p_content jsonb,
  p_media_ids uuid[]
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_manual public.manuals;
  v_draft public.manual_drafts;
  v_version_id uuid;
  v_unverified integer;
begin
  select * into v_manual from public.manuals where id = p_manual_id for update;
  if not found then
    raise exception 'manual not found' using errcode = 'P0002';
  end if;
  if not app.is_approver(v_manual.brand_id) then
    raise exception 'only HQ approver can publish' using errcode = '42501';
  end if;
  if v_manual.archived_at is not null then
    raise exception 'manual is archived' using errcode = '22023';
  end if;

  select * into v_draft from public.manual_drafts where manual_id = p_manual_id for update;
  if not found then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;
  if v_draft.optimistic_version <> p_expected_draft_version then
    raise exception 'draft changed since validation; review again' using errcode = '40001';
  end if;
  if public.draft_standards_stamp(v_draft.id) <> p_standards_stamp then
    raise exception 'standards changed since validation; review again' using errcode = '40001';
  end if;

  select count(*) into v_unverified from (
    select verified_by from public.storage_standards where draft_id = v_draft.id
    union all
    select verified_by from public.serving_standards where draft_id = v_draft.id
  ) x where x.verified_by is null;
  if v_unverified > 0 then
    raise exception 'unverified standards cannot be published' using errcode = '22023';
  end if;

  if abs(extract(epoch from (now() - p_approved_at))) > 600 then
    raise exception 'approval timestamp out of range' using errcode = '22023';
  end if;
  if v_manual.active_version_id is not null and coalesce(trim(p_revision_reason), '') = '' then
    raise exception 'revision reason is required' using errcode = '22023';
  end if;

  insert into public.manual_versions (
    manual_id, brand_id, version_label, locale, document_code, content_snapshot_json, content_checksum,
    change_log, revision_reason, approval_comment, approved_by, approved_at
  ) values (
    v_manual.id, v_manual.brand_id, p_version_label, v_manual.display_language, v_manual.document_code, p_content, '',
    p_change_log, nullif(trim(p_revision_reason), ''), nullif(trim(p_approval_comment), ''), auth.uid(), p_approved_at
  ) returning id into v_version_id;

  insert into public.storage_standards (
    brand_id, version_id, product_state, product_state_note, storage_method, storage_method_note,
    temperature_min_c, temperature_max_c, shelf_life_value, shelf_life_unit, shelf_life_start_event,
    start_event_description, label_instructions, container_and_cover, disposal_rule, reference_note,
    verified_by, verified_at, sort_order
  )
  select brand_id, v_version_id, product_state, product_state_note, storage_method, storage_method_note,
    temperature_min_c, temperature_max_c, shelf_life_value, shelf_life_unit, shelf_life_start_event,
    start_event_description, label_instructions, container_and_cover, disposal_rule, reference_note,
    verified_by, verified_at, sort_order
  from public.storage_standards where draft_id = v_draft.id;

  insert into public.serving_standards (
    brand_id, version_id, quantity, unit, serving_context, measurement_method, tolerance_json,
    plating_instructions, reference_image_asset_id, verified_by, verified_at, sort_order
  )
  select brand_id, v_version_id, quantity, unit, serving_context, measurement_method, tolerance_json,
    plating_instructions, reference_image_asset_id, verified_by, verified_at, sort_order
  from public.serving_standards where draft_id = v_draft.id;

  -- 발행본이 참조하는 미디어: 현장 직원이 발행본을 통해 볼 수 있도록 링크
  insert into public.media_links (media_id, brand_id, entity_type, entity_id, role, sort_order)
  select t.media_id, v_manual.brand_id, 'manual_version', v_version_id, 'reference', t.ord
  from unnest(coalesce(p_media_ids, '{}')) with ordinality as t(media_id, ord);

  if v_manual.active_version_id is not null then
    update public.manual_versions set status = 'archived' where id = v_manual.active_version_id and status = 'published';
  end if;

  update public.manuals
  set active_version_id = v_version_id, review_status = 'published', review_comment = null
  where id = v_manual.id;

  return v_version_id;
end;
$$;
revoke all on function public.publish_manual(uuid, integer, text, text, text, text, text, timestamptz, jsonb, uuid[]) from public, anon;
grant execute on function public.publish_manual(uuid, integer, text, text, text, text, text, timestamptz, jsonb, uuid[]) to authenticated;
