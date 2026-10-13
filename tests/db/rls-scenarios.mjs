// Supabase 스텁(auth/storage/roles) 위에 마이그레이션을 임베디드 Postgres(PGlite)로 적용하고
// RLS/트리거 시나리오를 검증한다. 실제 Supabase 없이 실행: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? path.join(process.cwd(), "supabase", "migrations");
const db = await PGlite.create({ extensions: { pgcrypto } });

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  create schema extensions;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant all on storage.objects to authenticated;
`);

for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  try {
    await db.exec(readFileSync(path.join(dir, f), "utf8"));
    console.log(`OK   apply ${f}`);
  } catch (e) {
    console.log(`FAIL apply ${f}: ${e.message}`);
    process.exit(1);
  }
}

// ---- fixtures (superuser) ----
const U = {
  field: "10000000-0000-4000-8000-000000000001",
  fieldOther: "10000000-0000-4000-8000-000000000002",
  editor: "10000000-0000-4000-8000-000000000003",
  approver: "10000000-0000-4000-8000-000000000004",
  manager: "10000000-0000-4000-8000-000000000005",
};
const ORG = "20000000-0000-4000-8000-000000000001";
const KK = "30000000-0000-4000-8000-000000000001";
const OB = "30000000-0000-4000-8000-000000000002";
const MAKATI = "40000000-0000-4000-8000-000000000001";
const BGC = "40000000-0000-4000-8000-000000000002";
const OSTORE = "40000000-0000-4000-8000-000000000003";

await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${U.field}', 'f@x', '{"name":"Field"}'), ('${U.fieldOther}', 'fo@x', '{}'),
    ('${U.editor}', 'e@x', '{}'), ('${U.approver}', 'a@x', '{}'), ('${U.manager}', 'm@x', '{}');
  insert into organizations (id, name) values ('${ORG}', 'Org');
  insert into brands (id, organization_id, code, name) values ('${KK}', '${ORG}', 'KK', 'KODO'), ('${OB}', '${ORG}', 'OB', 'Other');
  insert into stores (id, brand_id, name) values ('${MAKATI}', '${KK}', 'Makati'), ('${BGC}', '${KK}', 'BGC'), ('${OSTORE}', '${OB}', 'O1');
  insert into memberships (user_id, organization_id, brand_id, store_id, role) values
    ('${U.field}', '${ORG}', '${KK}', '${MAKATI}', 'field_staff'),
    ('${U.manager}', '${ORG}', '${KK}', '${BGC}', 'store_manager'),
    ('${U.fieldOther}', '${ORG}', '${OB}', '${OSTORE}', 'field_staff'),
    ('${U.editor}', '${ORG}', '${KK}', null, 'hq_editor'),
    ('${U.approver}', '${ORG}', '${KK}', null, 'hq_approver');
`);

let failures = 0;
async function as(user, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ""}', false);`);
  if (user) await db.exec("set role authenticated");
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
async function expectOk(label, user, sql, params) {
  try {
    const r = await as(user, sql, params);
    console.log(`OK   ${label}`);
    return r;
  } catch (e) {
    failures++;
    console.log(`FAIL ${label}: ${e.message}`);
  }
}
async function expectErr(label, user, sql, params) {
  try {
    await as(user, sql, params);
    failures++;
    console.log(`FAIL ${label}: expected error`);
  } catch (e) {
    console.log(`OK   ${label} (${e.message.slice(0, 70)})`);
  }
}
async function expectRows(label, user, sql, n) {
  try {
    const r = await as(user, sql);
    if (r.rows.length === n) console.log(`OK   ${label}`);
    else {
      failures++;
      console.log(`FAIL ${label}: expected ${n} rows, got ${r.rows.length}`);
    }
    return r;
  } catch (e) {
    failures++;
    console.log(`FAIL ${label}: ${e.message}`);
  }
}

// profiles trigger
await expectRows("profile auto-created from auth.users", null, `select * from profiles where name = 'Field'`, 1);

// ---- field capture ----
const S1 = "50000000-0000-4000-8000-000000000001";
await expectOk("field creates draft in own store", U.field,
  `insert into submissions (id, brand_id, store_id, station, capture_mode, title, submitted_by) values ('${S1}', '${KK}', '${MAKATI}', 'Main', 'guided', 'T', '${U.field}')`);
await expectErr("field cannot create in other store", U.field,
  `insert into submissions (brand_id, store_id, station, capture_mode, title, submitted_by) values ('${KK}', '${BGC}', 'Main', 'guided', 'T', '${U.field}')`);
await expectErr("field cannot create as someone else", U.field,
  `insert into submissions (brand_id, store_id, station, capture_mode, title, submitted_by) values ('${KK}', '${MAKATI}', 'Main', 'guided', 'T', '${U.editor}')`);
const ING = "51000000-0000-4000-8000-000000000001";
await expectOk("field adds ingredient to draft", U.field,
  `insert into submission_ingredients (id, submission_id, name) values ('${ING}', '${S1}', 'Galbi')`);
await expectErr("no_prep without reason rejected", U.field,
  `insert into submission_preparations (ingredient_id, no_prep) values ('${ING}', true)`);
await expectRows("HQ does not see field drafts", U.editor, `select * from submissions`, 0);
await expectOk("field submits", U.field, `update submissions set status = 'submitted' where id = '${S1}'`);
await expectRows("submitted_at set by trigger", null, `select * from submissions where submitted_at is not null`, 1);
await expectRows("submitted is read-only for author (0 rows updated via RLS)", U.field,
  `update submissions set title = 'X' where id = '${S1}' returning id`, 0);
await expectRows("ingredient edit blocked after submit", U.field,
  `update submission_ingredients set name = 'X' where id = '${ING}' returning id`, 0);
await expectRows("HQ sees submitted", U.editor, `select * from submissions`, 1);
await expectRows("other-brand field cannot see", U.fieldOther, `select * from submissions`, 0);
await expectRows("other-store manager cannot see", U.manager, `select * from submissions`, 0);
await expectErr("HQ cannot rewrite field facts", U.editor, `update submissions set title = 'HQ edit' where id = '${S1}'`);
await expectErr("HQ invalid transition submitted->draft", U.editor, `update submissions set status = 'draft' where id = '${S1}'`);
await expectErr("reject requires reason", U.editor, `update submissions set status = 'rejected' where id = '${S1}'`);
await expectOk("HQ moves to in_review", U.editor, `update submissions set status = 'in_review' where id = '${S1}'`);
await expectRows("reviewed_by stamped", null, `select * from submissions where reviewed_by = '${U.editor}'`, 1);

// ---- manuals / drafts ----
const code = await expectOk("editor gets document code", U.editor, `select next_document_code('${KK}', 'MAIN') as c`);
console.log(`     code = ${code?.rows[0]?.c}`);
await expectErr("field cannot get document code", U.field, `select next_document_code('${KK}', 'MAIN')`);
await expectErr("editor cannot get code for other brand", U.editor, `select next_document_code('${OB}', 'MAIN')`);
const M1 = "60000000-0000-4000-8000-000000000001";
const D1 = "61000000-0000-4000-8000-000000000001";
await expectOk("editor creates manual", U.editor,
  `insert into manuals (id, brand_id, title, station, manual_type, document_code, created_by) values ('${M1}', '${KK}', 'Galbi', 'Main', 'recipe', 'KK-MAIN-001', '${U.editor}')`);
await expectOk("editor creates draft", U.editor,
  `insert into manual_drafts (id, manual_id, brand_id) values ('${D1}', '${M1}', '${KK}')`);
await expectRows("field cannot see drafts", U.field, `select * from manual_drafts`, 0);
await expectRows("field cannot see unpublished manual", U.field, `select * from manuals`, 0);
await expectOk("optimistic update bumps version", U.editor,
  `update manual_drafts set draft_json = '{"a":1}' where id = '${D1}' and optimistic_version = 1`);
await expectRows("stale optimistic update affects 0 rows", U.editor,
  `update manual_drafts set draft_json = '{"a":2}' where id = '${D1}' and optimistic_version = 1 returning id`, 0);

const SS = "62000000-0000-4000-8000-000000000001";
await expectOk("editor adds empty cooked storage row", U.editor,
  `insert into storage_standards (id, brand_id, draft_id, product_state) values ('${SS}', '${KK}', '${D1}', 'cooked')`);
await expectErr("duplicate product state rejected", U.editor,
  `insert into storage_standards (brand_id, draft_id, product_state) values ('${KK}', '${D1}', 'cooked')`);
await expectErr("min >= max rejected", U.editor,
  `insert into storage_standards (brand_id, draft_id, product_state, temperature_min_c, temperature_max_c) values ('${KK}', '${D1}', 'raw', 5, 1)`);
await expectErr("shelf life without unit rejected", U.editor,
  `insert into storage_standards (brand_id, draft_id, product_state, shelf_life_value) values ('${KK}', '${D1}', 'raw', 3)`);
await expectErr("editor cannot verify", U.editor,
  `update storage_standards set verified_by = '${U.editor}', verified_at = now() where id = '${SS}'`);
await expectErr("approver cannot verify as someone else", U.approver,
  `update storage_standards set verified_by = '${U.editor}', verified_at = now() where id = '${SS}'`);
await expectOk("approver verifies", U.approver,
  `update storage_standards set temperature_max_c = 5, verified_by = '${U.approver}', verified_at = now() where id = '${SS}'`);
await expectOk("editor changes value after verification", U.editor,
  `update storage_standards set temperature_max_c = 4 where id = '${SS}'`);
await expectRows("verification cleared after value change", null,
  `select * from storage_standards where id = '${SS}' and verified_by is null`, 1);
await expectErr("serving qty without unit rejected", U.editor,
  `insert into serving_standards (brand_id, draft_id, quantity) values ('${KK}', '${D1}', 6)`);
await expectOk("serving 6 pcs", U.editor,
  `insert into serving_standards (brand_id, draft_id, quantity, unit) values ('${KK}', '${D1}', 6, 'pcs')`);

// ---- publish ----
const V1 = "70000000-0000-4000-8000-000000000001";
const insertVersion = (who) => `insert into manual_versions (id, manual_id, brand_id, version_label, locale, document_code, content_snapshot_json, content_checksum, change_log, approved_by, approved_at)
  values ('${V1}', '${M1}', '${KK}', 'v1.0', 'en', 'KK-MAIN-001', '{"title":"Galbi","b":1}', 'x', 'Initial', '${who}', now())`;
await expectErr("editor cannot publish version", U.editor, insertVersion(U.editor));
await expectOk("approver publishes version", U.approver, insertVersion(U.approver));
await expectRows("checksum computed (64 hex)", null,
  `select * from manual_versions where length(content_checksum) = 64 and content_checksum <> 'x'`, 1);
await expectErr("editor cannot set active version", U.editor, `update manuals set active_version_id = '${V1}' where id = '${M1}'`);
await expectOk("approver activates version", U.approver,
  `update manuals set active_version_id = '${V1}', review_status = 'published' where id = '${M1}'`);
await expectErr("snapshot content immutable", U.approver,
  `update manual_versions set content_snapshot_json = '{"title":"changed"}' where id = '${V1}'`);
await expectErr("version delete blocked", null, `delete from manual_versions where id = '${V1}'`);
await expectOk("version rows for standards", U.approver,
  `insert into storage_standards (brand_id, version_id, product_state, temperature_max_c) values ('${KK}', '${V1}', 'cooked', 4)`);
await expectErr("published standards immutable", null, `update storage_standards set temperature_max_c = 9 where version_id = '${V1}'`);
await expectRows("field sees published manual (brand_all)", U.field, `select * from manuals`, 1);
await expectRows("field sees published version", U.field, `select * from manual_versions`, 1);
await expectRows("field sees published standards only", U.field, `select * from storage_standards`, 1);
await expectRows("other-brand field sees nothing", U.fieldOther, `select * from manuals`, 0);
await expectOk("restrict to selected stores (BGC)", U.editor,
  `update manuals set store_scope = 'selected_stores' where id = '${M1}'; `);
await expectOk("applicability BGC", U.editor,
  `insert into manual_applicability (manual_id, store_id, brand_id) values ('${M1}', '${BGC}', '${KK}')`);
await expectRows("Makati field no longer sees BGC-only manual", U.field, `select * from manuals`, 0);
await expectRows("BGC manager sees it", U.manager, `select * from manuals`, 1);
await expectOk("approver archives version", U.approver, `update manual_versions set status = 'archived' where id = '${V1}'`);
await expectErr("archived cannot be republished", U.approver, `update manual_versions set status = 'published' where id = '${V1}'`);

// ---- media ----
const MA = "80000000-0000-4000-8000-000000000001";
const S2 = "50000000-0000-4000-8000-000000000002";
await as(U.field, `insert into submissions (id, brand_id, store_id, station, capture_mode, title, submitted_by) values ('${S2}', '${KK}', '${MAKATI}', 'Main', 'quick', 'Q', '${U.field}')`);
await expectErr("storage key must be under brand folder", U.field,
  `insert into media_assets (brand_id, submission_id, owner_id, storage_key, kind, mime) values ('${KK}', '${S2}', '${U.field}', '${OB}/x.jpg', 'image', 'image/jpeg')`);
await expectOk("field registers media for own draft", U.field,
  `insert into media_assets (id, brand_id, submission_id, owner_id, storage_key, kind, mime) values ('${MA}', '${KK}', '${S2}', '${U.field}', '${KK}/s/${S2}/a.jpg', 'image', 'image/jpeg')`);
await expectOk("field uploads object for pending media", U.field,
  `insert into storage.objects (bucket_id, name) values ('media', '${KK}/s/${S2}/a.jpg')`);
await expectErr("field cannot upload arbitrary key", U.field,
  `insert into storage.objects (bucket_id, name) values ('media', '${KK}/s/${S2}/other.jpg')`);
await expectOk("link media to own submission", U.field,
  `insert into media_links (media_id, brand_id, entity_type, entity_id, role) values ('${MA}', '${KK}', 'submission', '${S2}', 'attachment')`);
await expectErr("link to other-brand entity rejected", null,
  `insert into media_links (media_id, brand_id, entity_type, entity_id, role) values ('${MA}', '${KK}', 'manual_draft', '00000000-0000-4000-8000-000000000999', 'reference')`);
await expectRows("other-brand field cannot read object", U.fieldOther, `select * from storage.objects`, 0);
await expectRows("author reads own object", U.field, `select * from storage.objects`, 1);
await expectErr("storage_key immutable", U.field, `update media_assets set storage_key = '${KK}/z.jpg' where id = '${MA}'`);

// ---- 0004: 제출 후 미디어 잠금 ----
const MB = "80000000-0000-4000-8000-000000000002";
await expectOk("field registers second media", U.field,
  `insert into media_assets (id, brand_id, submission_id, owner_id, storage_key, kind, mime) values ('${MB}', '${KK}', '${S2}', '${U.field}', '${KK}/s/${S2}/b.jpg', 'image', 'image/jpeg')`);
await expectErr("field cannot link own media to another draft-less entity (S1 submitted)", U.field,
  `insert into media_links (media_id, brand_id, entity_type, entity_id, role) values ('${MB}', '${KK}', 'submission', '${S1}', 'attachment')`);
await expectOk("field marks media uploaded while draft", U.field,
  `update media_assets set upload_status = 'uploaded' where id = '${MA}'`);
await expectOk("field submits quick capture", U.field, `update submissions set status = 'submitted' where id = '${S2}'`);
await expectRows("field cannot unlink media after submit", U.field,
  `delete from media_links where media_id = '${MA}' returning id`, 0);
await expectRows("field cannot recaption after submit", U.field,
  `update media_links set caption = 'x' where media_id = '${MA}' returning id`, 0);
await expectRows("field cannot change media after submit", U.field,
  `update media_assets set upload_status = 'failed' where id = '${MA}' returning id`, 0);
await expectOk("HQ links field media to manual draft", U.editor,
  `insert into media_links (media_id, brand_id, entity_type, entity_id, role) values ('${MA}', '${KK}', 'manual_draft', '${D1}', 'reference')`);
await expectRows("HQ reads submitted field media", U.editor, `select * from media_assets where id = '${MA}'`, 1);
await expectRows("other-brand field cannot read media rows", U.fieldOther, `select * from media_assets`, 0);

// ---- 0005: INSERT ... RETURNING (supabase-js .insert().select()) ----
await expectRows("field insert submission returning id", U.field,
  `insert into submissions (brand_id, store_id, station, capture_mode, title, submitted_by) values ('${KK}', '${MAKATI}', 'Main', 'guided', 'R', '${U.field}') returning id`, 1);
await expectRows("field insert media_asset returning id", U.field,
  `with s as (insert into submissions (brand_id, store_id, station, capture_mode, title, submitted_by) values ('${KK}', '${MAKATI}', 'Main', 'quick', 'R2', '${U.field}') returning id)
   select 1`, 1);
const S3 = (await as(U.field, `select id from submissions where title = 'R2'`)).rows[0].id;
await expectRows("field insert media returning", U.field,
  `insert into media_assets (brand_id, submission_id, owner_id, storage_key, kind, mime) values ('${KK}', '${S3}', '${U.field}', '${KK}/s/${S3}/r.jpg', 'image', 'image/jpeg') returning id`, 1);
await expectRows("editor insert manual returning id", U.editor,
  `insert into manuals (brand_id, title, station, manual_type, document_code, created_by) values ('${KK}', 'R', 'Main', 'recipe', 'KK-MAIN-099', '${U.editor}') returning id`, 1);
const M2 = (await as(U.editor, `select id from manuals where document_code = 'KK-MAIN-099'`)).rows[0].id;
await expectRows("approver insert version returning id", U.approver,
  `insert into manual_versions (manual_id, brand_id, version_label, locale, document_code, content_snapshot_json, content_checksum, change_log, approved_by, approved_at)
   values ('${M2}', '${KK}', 'v1.0', 'en', 'KK-MAIN-099', '{}', 'x', 'Initial', '${U.approver}', now()) returning id`, 1);
await expectRows("still hidden from other brand", U.fieldOther, `select * from submissions`, 0);

// ---- 0006: publish_manual ----
{
  const A2 = "10000000-0000-4000-8000-000000000006";
  await as(null, `insert into auth.users (id, email) values ('${A2}', 'a2@x')`);
  await as(null, `insert into memberships (user_id, organization_id, brand_id, role) values ('${A2}', '${ORG}', '${KK}', 'hq_approver')`);
  const M3 = "60000000-0000-4000-8000-000000000003";
  const D3 = "61000000-0000-4000-8000-000000000003";
  await as(U.editor, `insert into manuals (id, brand_id, title, station, manual_type, document_code, created_by) values ('${M3}', '${KK}', 'Pub', 'Main', 'recipe', 'KK-MAIN-050', '${U.editor}')`);
  await as(U.editor, `insert into manual_drafts (id, manual_id, brand_id, draft_json) values ('${D3}', '${M3}', '${KK}', '{"schema_version":1}')`);
  await as(U.editor, `insert into storage_standards (brand_id, draft_id, product_state, storage_method, temperature_max_c, shelf_life_value, shelf_life_unit, shelf_life_start_event) values ('${KK}', '${D3}', 'cooked', 'chilled', 5, 2, 'days', 'cooked_at')`);
  await as(U.editor, `insert into serving_standards (brand_id, draft_id, quantity, unit) values ('${KK}', '${D3}', 6, 'pcs')`);
  await expectRows("BGC manager cannot read Makati media before publish", U.manager, `select * from media_assets where id = '${MA}'`, 0);

  const stamp = async (who) => (await as(who, `select draft_standards_stamp('${D3}') as s`)).rows[0].s;
  const ver = async () => (await as(null, `select optimistic_version as v from manual_drafts where id = '${D3}'`)).rows[0].v;
  const publish = (label, st, v, reason = null) =>
    `select publish_manual('${M3}', ${v}, '${st}', '${label}', 'Initial', ${reason ? `'${reason}'` : "null"}, null, now(), '{"schema_version":1}'::jsonb, array['${MA}']::uuid[]) as id`;

  await expectErr("publish blocked while standards unverified", U.approver, publish("v1.0", await stamp(U.approver), await ver()));
  await expectOk("approver verifies storage", U.approver, `update storage_standards set verified_by = '${U.approver}', verified_at = now() where draft_id = '${D3}'`);
  await expectOk("second approver verifies serving", A2, `update serving_standards set verified_by = '${A2}', verified_at = now() where draft_id = '${D3}'`);
  const st1 = await stamp(U.editor);
  await expectErr("editor cannot publish", U.editor, publish("v1.0", st1, await ver()));
  await expectErr("stale draft version rejected", U.approver, publish("v1.0", st1, (await ver()) - 1));
  await expectErr("wrong stamp rejected", U.approver, publish("v1.0", "deadbeef", await ver()));
  const r1 = await expectOk("approver publishes v1.0 (keeps other approver's verification)", U.approver, publish("v1.0", st1, await ver()));
  const V3 = r1?.rows[0]?.id;
  await expectRows("manual active version set", null, `select * from manuals where id = '${M3}' and active_version_id = '${V3}' and review_status = 'published'`, 1);
  await expectRows("standards copied to version with verifiers", null,
    `select * from serving_standards where version_id = '${V3}' and verified_by = '${A2}' union all select * from serving_standards where 1=0`, 1);
  await expectRows("storage copied", null, `select * from storage_standards where version_id = '${V3}' and verified_by = '${U.approver}'`, 1);
  await expectRows("BGC manager reads media via published link", U.manager, `select * from media_assets where id = '${MA}'`, 1);
  await expectRows("BGC manager can read object via published link", U.manager, `select * from storage.objects where name like '%/a.jpg'`, 1);

  await expectOk("editor changes draft standard after publish", U.editor, `update storage_standards set temperature_max_c = 4 where draft_id = '${D3}'`);
  await expectRows("published copy unchanged", null, `select * from storage_standards where version_id = '${V3}' and temperature_max_c = 5`, 1);
  await expectErr("old stamp rejected after change", U.approver, publish("v1.1", st1, await ver(), "Temp"));
  await expectErr("unverified after change", U.approver, publish("v1.1", await stamp(U.approver), await ver(), "Temp"));
  await as(U.approver, `update storage_standards set verified_by = '${U.approver}', verified_at = now() where draft_id = '${D3}'`);
  await expectErr("revision reason required for v1.1", U.approver, publish("v1.1", await stamp(U.approver), await ver()));
  const r2 = await expectOk("approver publishes v1.1", U.approver, publish("v1.1", await stamp(U.approver), await ver(), "Lower temperature"));
  await expectRows("v1.0 archived", null, `select * from manual_versions where id = '${V3}' and status = 'archived'`, 1);
  await expectRows("field sees only latest version", U.field, `select * from manual_versions where manual_id = '${M3}'`, 1);
  await expectRows("field reads latest version standards", U.field,
    `select * from storage_standards where version_id = '${r2?.rows[0]?.id}' and temperature_max_c = 4`, 1);
}

// ---- export jobs ----
await expectErr("field cannot request draft export", U.field,
  `insert into export_jobs (requested_by, brand_id, format, scope, locale, ordered_version_ids_json, template_version, is_draft_export) values ('${U.field}', '${KK}', 'pdf', 'individual', 'en', '["${V1}"]', 't1', true)`);
await expectErr("combined needs >= 2 versions", U.editor,
  `insert into export_jobs (requested_by, brand_id, format, scope, locale, ordered_version_ids_json, template_version) values ('${U.editor}', '${KK}', 'pdf', 'combined', 'en', '["${V1}"]', 't1')`);

// ---- audit ----
await expectRows("approver can read audit", U.approver, `select * from audit_events limit 1`, 1);
await expectRows("field cannot read audit", U.field, `select * from audit_events`, 0);
await expectErr("profile status not self-editable", U.field, `update profiles set status = 'disabled' where id = '${U.field}'`);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
