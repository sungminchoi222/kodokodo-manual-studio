-- MANUAL STUDIO — 0002 row level security
-- 모든 테이블 RLS 활성화. 앱 라우트의 rbac.ts 검사와 별개로 DB 가 최종 방어선이다.
-- 헬퍼 함수는 노출되지 않는 app 스키마에 security definer 로 둔다 (memberships 재귀 RLS 방지).

-- ---------------------------------------------------------------------------
-- helper functions
-- ---------------------------------------------------------------------------
create or replace function app.uid() returns uuid
language sql stable as $$ select auth.uid() $$;

-- 활성 사용자의 조직 전체 system_admin 여부
create or replace function app.is_org_admin(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id and p.status = 'active'
    where m.user_id = (select auth.uid())
      and m.role = 'system_admin'
      and m.brand_id is null
      and m.organization_id = p_organization_id
  );
$$;

-- 브랜드 단위 역할 보유 여부. 매장 역할(field_staff/store_manager)도 소속 브랜드에 대해 true.
create or replace function app.has_brand_role(p_brand_id uuid, p_roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id and p.status = 'active'
    where m.user_id = (select auth.uid())
      and m.role = any (p_roles)
      and (
        m.brand_id = p_brand_id
        or (
          m.role = 'system_admin' and m.brand_id is null
          and m.organization_id = (select b.organization_id from public.brands b where b.id = p_brand_id)
        )
      )
  );
$$;

create or replace function app.is_brand_member(p_brand_id uuid) returns boolean
language sql stable as $$
  select app.has_brand_role(p_brand_id, '{field_staff,store_manager,hq_editor,hq_approver,system_admin}');
$$;

create or replace function app.is_hq(p_brand_id uuid) returns boolean
language sql stable as $$
  select app.has_brand_role(p_brand_id, '{hq_editor,hq_approver,system_admin}');
$$;

create or replace function app.is_approver(p_brand_id uuid) returns boolean
language sql stable as $$
  select app.has_brand_role(p_brand_id, '{hq_approver,system_admin}');
$$;

-- 특정 매장에 대한 매장 역할 보유 여부 (HQ 는 브랜드 권한으로 별도 판정)
create or replace function app.has_store_role(p_store_id uuid, p_roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id and p.status = 'active'
    where m.user_id = (select auth.uid())
      and m.role = any (p_roles)
      and m.store_id = p_store_id
  );
$$;

-- 제출 조회: 작성자 본인(브랜드 소속 유지 시), 또는 제출된 건에 대해 해당 매장 매니저/HQ
create or replace function app.can_read_submission(p_submission_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.submissions s
    where s.id = p_submission_id
      and (
        (s.submitted_by = (select auth.uid()) and app.is_brand_member(s.brand_id))
        or (
          s.status <> 'draft'
          and (app.has_store_role(s.store_id, '{store_manager}') or app.is_hq(s.brand_id))
        )
      )
  );
$$;

-- 제출 내용 편집: 작성자 본인 + 임시저장 상태 + 해당 매장 소속 유지
create or replace function app.can_edit_submission(p_submission_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.submissions s
    where s.id = p_submission_id
      and s.submitted_by = (select auth.uid())
      and s.status = 'draft'
      and (app.has_store_role(s.store_id, '{field_staff,store_manager}') or app.is_hq(s.brand_id))
  );
$$;

-- 매뉴얼 적용 범위에 현재 사용자의 매장이 포함되는지 (현장 역할용)
create or replace function app.manual_applies_to_me(p_manual_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.manuals mn
    join public.memberships m on m.user_id = (select auth.uid()) and m.brand_id = mn.brand_id
    join public.profiles p on p.id = m.user_id and p.status = 'active'
    where mn.id = p_manual_id
      and mn.archived_at is null
      and m.role in ('field_staff', 'store_manager')
      and (
        mn.store_scope = 'brand_all'
        or exists (
          select 1 from public.manual_applicability a
          where a.manual_id = mn.id and a.store_id = m.store_id
        )
      )
  );
$$;

-- 발행 버전 조회: HQ 전체, 현장은 적용 매장의 published 상태만
create or replace function app.can_read_version(p_version_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.manual_versions v
    where v.id = p_version_id
      and (
        app.is_hq(v.brand_id)
        or (v.status = 'published' and app.manual_applies_to_me(v.manual_id))
      )
  );
$$;

create or replace function app.can_read_media(p_media_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.media_assets ma
    where ma.id = p_media_id
      and (
        ma.owner_id = (select auth.uid()) and app.is_brand_member(ma.brand_id)
        or (ma.submission_id is not null and app.can_read_submission(ma.submission_id))
        or (ma.submission_id is null and app.is_hq(ma.brand_id))
        or exists (
          select 1 from public.media_links l
          where l.media_id = ma.id
            and l.entity_type = 'manual_version'
            and app.can_read_version(l.entity_id)
        )
      )
  );
$$;

create or replace function app.can_view_profile(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_profile_id = (select auth.uid())
    or exists (
      select 1 from public.memberships m
      where m.user_id = p_profile_id
        and (
          (m.brand_id is not null and app.is_hq(m.brand_id))
          or app.is_org_admin(m.organization_id)
        )
    );
$$;

-- storage 경로 첫 폴더 = brand_id
create or replace function app.storage_brand_id(p_name text) returns uuid
language sql immutable as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 1)::uuid
  end;
$$;

revoke all on all functions in schema app from public, anon;
grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------------------
-- enable RLS
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.brands enable row level security;
alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.manuals enable row level security;
alter table public.manual_applicability enable row level security;
alter table public.document_code_counters enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_ingredients enable row level security;
alter table public.submission_preparations enable row level security;
alter table public.submission_cooking_steps enable row level security;
alter table public.media_assets enable row level security;
alter table public.media_links enable row level security;
alter table public.manual_source_submissions enable row level security;
alter table public.manual_drafts enable row level security;
alter table public.manual_versions enable row level security;
alter table public.storage_standards enable row level security;
alter table public.serving_standards enable row level security;
alter table public.manual_translations enable row level security;
alter table public.export_jobs enable row level security;
alter table public.audit_events enable row level security;

-- 익명 접근 전면 차단
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- tenancy
-- ---------------------------------------------------------------------------
create policy organizations_select on public.organizations for select to authenticated
  using (exists (
    select 1 from public.memberships m where m.user_id = (select auth.uid()) and m.organization_id = organizations.id
  ));

create policy brands_select on public.brands for select to authenticated
  using (app.is_brand_member(id));
create policy brands_insert on public.brands for insert to authenticated
  with check (app.is_org_admin(organization_id));
create policy brands_update on public.brands for update to authenticated
  using (app.has_brand_role(id, '{system_admin}'))
  with check (app.has_brand_role(id, '{system_admin}'));

create policy stores_select on public.stores for select to authenticated
  using (app.is_hq(brand_id) or app.has_store_role(id, '{field_staff,store_manager}'));
create policy stores_write on public.stores for all to authenticated
  using (app.has_brand_role(brand_id, '{system_admin}'))
  with check (app.has_brand_role(brand_id, '{system_admin}'));

create policy profiles_select on public.profiles for select to authenticated
  using (app.can_view_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- 본인은 이름만 수정 가능 (status 변경으로 비활성 해제 방지)
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

create policy memberships_select on public.memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or app.is_org_admin(organization_id)
    or (brand_id is not null and app.has_brand_role(brand_id, '{system_admin}'))
  );
-- 브랜드 한정 관리자는 해당 브랜드 멤버십만, 조직 전체 권한 부여는 조직 관리자만
create policy memberships_write on public.memberships for all to authenticated
  using (
    app.is_org_admin(organization_id)
    or (brand_id is not null and app.has_brand_role(brand_id, '{system_admin}'))
  )
  with check (
    app.is_org_admin(organization_id)
    or (brand_id is not null and role <> 'system_admin' and app.has_brand_role(brand_id, '{system_admin}'))
  );

-- ---------------------------------------------------------------------------
-- submissions (field)
-- ---------------------------------------------------------------------------
create policy submissions_select on public.submissions for select to authenticated
  using (app.can_read_submission(id));
create policy submissions_insert on public.submissions for insert to authenticated
  with check (
    submitted_by = (select auth.uid())
    and status = 'draft'
    and (app.has_store_role(store_id, '{field_staff,store_manager}') or app.is_hq(brand_id))
  );
-- 작성자: draft 편집/제출, HQ: 검토 상태 변경. 상태 전이 세부 규칙은 0003 트리거에서 강제.
create policy submissions_update on public.submissions for update to authenticated
  using (app.can_edit_submission(id) or (status <> 'draft' and app.is_hq(brand_id)))
  with check (submitted_by = (select auth.uid()) or app.is_hq(brand_id));
create policy submissions_delete_draft on public.submissions for delete to authenticated
  using (app.can_edit_submission(id));

create policy submission_ingredients_select on public.submission_ingredients for select to authenticated
  using (app.can_read_submission(submission_id));
create policy submission_ingredients_write on public.submission_ingredients for all to authenticated
  using (app.can_edit_submission(submission_id))
  with check (app.can_edit_submission(submission_id));

create policy submission_preparations_select on public.submission_preparations for select to authenticated
  using (exists (
    select 1 from public.submission_ingredients i
    where i.id = ingredient_id and app.can_read_submission(i.submission_id)
  ));
create policy submission_preparations_write on public.submission_preparations for all to authenticated
  using (exists (
    select 1 from public.submission_ingredients i
    where i.id = ingredient_id and app.can_edit_submission(i.submission_id)
  ))
  with check (exists (
    select 1 from public.submission_ingredients i
    where i.id = ingredient_id and app.can_edit_submission(i.submission_id)
  ));

create policy submission_cooking_steps_select on public.submission_cooking_steps for select to authenticated
  using (app.can_read_submission(submission_id));
create policy submission_cooking_steps_write on public.submission_cooking_steps for all to authenticated
  using (app.can_edit_submission(submission_id))
  with check (app.can_edit_submission(submission_id));

-- ---------------------------------------------------------------------------
-- media
-- ---------------------------------------------------------------------------
create policy media_assets_select on public.media_assets for select to authenticated
  using (app.can_read_media(id));
create policy media_assets_insert on public.media_assets for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and app.is_brand_member(brand_id)
    and (submission_id is null and app.is_hq(brand_id) or app.can_edit_submission(submission_id))
  );
-- 업로드 상태/썸네일 갱신만 (원본 키 변경은 0003 트리거에서 차단)
create policy media_assets_update on public.media_assets for update to authenticated
  using (owner_id = (select auth.uid()) or app.is_hq(brand_id))
  with check (owner_id = (select auth.uid()) or app.is_hq(brand_id));

create policy media_links_select on public.media_links for select to authenticated
  using (app.can_read_media(media_id));
create policy media_links_write on public.media_links for all to authenticated
  using (
    entity_type <> 'manual_version'
    and (
      app.is_hq(brand_id)
      or exists (select 1 from public.media_assets ma where ma.id = media_id and ma.owner_id = (select auth.uid()))
    )
  )
  with check (
    entity_type <> 'manual_version'
    and (
      app.is_hq(brand_id)
      or exists (select 1 from public.media_assets ma where ma.id = media_id and ma.owner_id = (select auth.uid()))
    )
  );
-- 발행본 미디어 링크는 승인자만 생성 (수정/삭제 불가)
create policy media_links_version_insert on public.media_links for insert to authenticated
  with check (entity_type = 'manual_version' and app.is_approver(brand_id));

-- ---------------------------------------------------------------------------
-- manuals
-- ---------------------------------------------------------------------------
create policy manuals_select on public.manuals for select to authenticated
  using (app.is_hq(brand_id) or (active_version_id is not null and app.manual_applies_to_me(id)));
create policy manuals_insert on public.manuals for insert to authenticated
  with check (app.is_hq(brand_id) and created_by = (select auth.uid()));
create policy manuals_update on public.manuals for update to authenticated
  using (app.is_hq(brand_id)) with check (app.is_hq(brand_id));

create policy manual_applicability_select on public.manual_applicability for select to authenticated
  using (app.is_hq(brand_id) or app.manual_applies_to_me(manual_id));
create policy manual_applicability_write on public.manual_applicability for all to authenticated
  using (app.is_hq(brand_id)) with check (app.is_hq(brand_id));

create policy manual_source_submissions_all on public.manual_source_submissions for all to authenticated
  using (app.is_hq(brand_id)) with check (app.is_hq(brand_id));

-- 초안은 HQ 전용. 현장 역할에는 절대 노출하지 않는다.
create policy manual_drafts_all on public.manual_drafts for all to authenticated
  using (app.is_hq(brand_id)) with check (app.is_hq(brand_id));

create policy manual_versions_select on public.manual_versions for select to authenticated
  using (app.can_read_version(id));
create policy manual_versions_insert on public.manual_versions for insert to authenticated
  with check (app.is_approver(brand_id) and approved_by = (select auth.uid()));
-- 보관처리(status 변경)만 허용. 본문 불변성은 0003 트리거에서 강제.
create policy manual_versions_update on public.manual_versions for update to authenticated
  using (app.is_approver(brand_id)) with check (app.is_approver(brand_id));

create policy storage_standards_select on public.storage_standards for select to authenticated
  using (
    (draft_id is not null and app.is_hq(brand_id))
    or (version_id is not null and app.can_read_version(version_id))
  );
create policy storage_standards_draft_write on public.storage_standards for all to authenticated
  using (draft_id is not null and app.is_hq(brand_id))
  with check (draft_id is not null and app.is_hq(brand_id));
create policy storage_standards_version_insert on public.storage_standards for insert to authenticated
  with check (version_id is not null and app.is_approver(brand_id));

create policy serving_standards_select on public.serving_standards for select to authenticated
  using (
    (draft_id is not null and app.is_hq(brand_id))
    or (version_id is not null and app.can_read_version(version_id))
  );
create policy serving_standards_draft_write on public.serving_standards for all to authenticated
  using (draft_id is not null and app.is_hq(brand_id))
  with check (draft_id is not null and app.is_hq(brand_id));
create policy serving_standards_version_insert on public.serving_standards for insert to authenticated
  with check (version_id is not null and app.is_approver(brand_id));

create policy manual_translations_all on public.manual_translations for all to authenticated
  using (app.is_hq(brand_id)) with check (app.is_hq(brand_id));

-- ---------------------------------------------------------------------------
-- export / audit
-- ---------------------------------------------------------------------------
create policy export_jobs_select on public.export_jobs for select to authenticated
  using (requested_by = (select auth.uid()) or app.is_hq(brand_id));
-- 버전별 세부 권한은 POST /api/export-jobs 에서 검증. 진행상태 갱신은 서버(service role)만.
create policy export_jobs_insert on public.export_jobs for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and status = 'queued'
    and app.is_brand_member(brand_id)
    and (not is_draft_export or app.is_hq(brand_id))
  );

create policy audit_events_select on public.audit_events for select to authenticated
  using (brand_id is not null and app.is_approver(brand_id));

-- document_code_counters: 정책 없음 → next_document_code() 로만 접근

-- ---------------------------------------------------------------------------
-- RPC: 문서코드 발급 (KK-MAIN-001)
-- ---------------------------------------------------------------------------
create or replace function public.next_document_code(p_brand_id uuid, p_station_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_brand_code text;
  v_value integer;
begin
  -- auth.uid() null = 서버(service role). anon 은 아래 grant 에서 차단.
  if auth.uid() is not null and not app.is_hq(p_brand_id) then
    raise exception 'permission denied: HQ role required' using errcode = '42501';
  end if;
  if p_station_code !~ '^[A-Z0-9]{1,8}$' then
    raise exception 'invalid station code: %', p_station_code using errcode = '22023';
  end if;

  select code into strict v_brand_code from public.brands where id = p_brand_id;

  insert into public.document_code_counters as c (brand_id, station_code, next_value)
  values (p_brand_id, p_station_code, 2)
  on conflict (brand_id, station_code) do update set next_value = c.next_value + 1
  returning next_value - 1 into v_value;

  return v_brand_code || '-' || p_station_code || '-' || lpad(v_value::text, 3, '0');
end;
$$;
revoke all on function public.next_document_code(uuid, text) from public, anon;
grant execute on function public.next_document_code(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- storage: private bucket. 경로 = {brand_id}/{...}. public bucket 사용 금지.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do update set public = false;

-- 읽기: media_assets RLS 를 통과하는 행의 원본/썸네일만
create policy media_objects_select on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1 from public.media_assets ma
      where ma.storage_key = storage.objects.name or ma.thumbnail_key = storage.objects.name
    )
  );

-- 쓰기: 먼저 media_assets(pending) 행을 만든 본인만 해당 키로 업로드 (재시도 포함)
create policy media_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and app.storage_brand_id(name) is not null
    and exists (
      select 1 from public.media_assets ma
      where (ma.storage_key = storage.objects.name or ma.thumbnail_key = storage.objects.name)
        and ma.owner_id = (select auth.uid())
        and ma.brand_id = app.storage_brand_id(storage.objects.name)
        and ma.upload_status <> 'uploaded'
    )
  );
create policy media_objects_update on storage.objects for update to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1 from public.media_assets ma
      where (ma.storage_key = storage.objects.name or ma.thumbnail_key = storage.objects.name)
        and ma.owner_id = (select auth.uid())
        and ma.upload_status <> 'uploaded'
    )
  );
-- 삭제 정책 없음: 원본 보존. exports 버킷은 서버(service role)만 접근.
