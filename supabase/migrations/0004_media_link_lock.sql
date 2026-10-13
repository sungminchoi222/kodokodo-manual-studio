-- MANUAL STUDIO — 0004 제출 후 미디어 잠금
-- 0002 의 media_links/media_assets 정책은 작성자가 제출 이후에도 링크를 바꿀 수 있었다.
-- 현장 작성자는 "편집 가능한(draft) 제출"에 속한 엔티티의 미디어만 변경할 수 있게 좁힌다.

-- 링크 대상 엔티티가 속한 제출 id (제출 계열이 아니면 null)
create or replace function app.media_link_submission_id(p_entity_type text, p_entity_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case p_entity_type
    when 'submission' then p_entity_id
    when 'submission_ingredient' then (
      select i.submission_id from public.submission_ingredients i where i.id = p_entity_id)
    when 'submission_preparation' then (
      select i.submission_id from public.submission_preparations p
      join public.submission_ingredients i on i.id = p.ingredient_id where p.id = p_entity_id)
    when 'submission_cooking_step' then (
      select c.submission_id from public.submission_cooking_steps c where c.id = p_entity_id)
  end;
$$;
revoke all on function app.media_link_submission_id(text, uuid) from public, anon;
grant execute on function app.media_link_submission_id(text, uuid) to authenticated;

drop policy media_links_write on public.media_links;

-- HQ: 발행본 외 링크 관리 (초안 매뉴얼에 제출 미디어 배치 등)
create policy media_links_hq_write on public.media_links for all to authenticated
  using (entity_type <> 'manual_version' and app.is_hq(brand_id))
  with check (entity_type <> 'manual_version' and app.is_hq(brand_id));

-- 현장 작성자: 본인 미디어 + 편집 가능한 제출의 엔티티에만
create policy media_links_author_write on public.media_links for all to authenticated
  using (
    exists (select 1 from public.media_assets ma where ma.id = media_id and ma.owner_id = (select auth.uid()))
    and app.can_edit_submission(app.media_link_submission_id(entity_type, entity_id))
  )
  with check (
    exists (select 1 from public.media_assets ma where ma.id = media_id and ma.owner_id = (select auth.uid()))
    and app.can_edit_submission(app.media_link_submission_id(entity_type, entity_id))
  );

drop policy media_assets_update on public.media_assets;
create policy media_assets_update on public.media_assets for update to authenticated
  using (
    app.is_hq(brand_id)
    or (owner_id = (select auth.uid()) and (submission_id is null or app.can_edit_submission(submission_id)))
  )
  with check (
    app.is_hq(brand_id)
    or (owner_id = (select auth.uid()) and (submission_id is null or app.can_edit_submission(submission_id)))
  );
