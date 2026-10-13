-- MANUAL STUDIO — 0005 SELECT 정책을 행 컬럼 기준으로 재작성
-- 문제: app.can_read_submission(id) 처럼 "같은 테이블을 id 로 다시 조회하는" 함수는
-- INSERT ... RETURNING 시점에 새 행을 볼 수 없어(문 시작 스냅샷) 방금 만든 행의 반환이 RLS 위반으로 실패한다.
-- 해결: 자기 테이블 SELECT 정책은 행 컬럼으로 직접 판정한다 (규칙은 0002 와 동일).

drop policy submissions_select on public.submissions;
create policy submissions_select on public.submissions for select to authenticated
  using (
    (submitted_by = (select auth.uid()) and app.is_brand_member(brand_id))
    or (
      status <> 'draft'
      and (app.has_store_role(store_id, '{store_manager}') or app.is_hq(brand_id))
    )
  );

drop policy manual_versions_select on public.manual_versions;
create policy manual_versions_select on public.manual_versions for select to authenticated
  using (
    app.is_hq(brand_id)
    or (status = 'published' and app.manual_applies_to_me(manual_id))
  );

-- 발행본에 연결된 미디어 여부. media_links RLS 를 거치면 media_assets 정책과 서로 참조해 재귀가 생기므로 definer 함수로 조회.
create or replace function app.media_in_readable_version(p_media_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.media_links l
    where l.media_id = p_media_id
      and l.entity_type = 'manual_version'
      and app.can_read_version(l.entity_id)
  );
$$;
revoke all on function app.media_in_readable_version(uuid) from public, anon;
grant execute on function app.media_in_readable_version(uuid) to authenticated;

drop policy media_assets_select on public.media_assets;
create policy media_assets_select on public.media_assets for select to authenticated
  using (
    (owner_id = (select auth.uid()) and app.is_brand_member(brand_id))
    or (submission_id is not null and app.can_read_submission(submission_id))
    or (submission_id is null and app.is_hq(brand_id))
    or app.media_in_readable_version(id)
  );
