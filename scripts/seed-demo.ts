/**
 * DEMO 데이터 시드 (반복 실행해도 같은 결과). 실제 매장·직원·식품안전 기준이 아니다.
 * - 보관 온도/사용기한은 일부러 비워 둔다 → 발행 검증에서 "NEEDS HQ CONFIRMATION" 으로 차단되어야 한다.
 * - 제공량 6 pcs 는 명세 예시값이며 미검증(verified_by null) 상태로 넣는다.
 *
 * 사용: npm run db:seed  (.env.local 의 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_USER_PASSWORD)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { DEMO_ACCOUNTS, DEMO_IDS } from "../src/demo/accounts";

config({ path: ".env.local" });

function env(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  throw new Error(`${names.join(" or ")} 가 .env.local 에 없습니다.`);
}

const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const password = env("DEMO_USER_PASSWORD");
if (password.length < 10) throw new Error("DEMO_USER_PASSWORD 는 10자 이상으로 설정하세요.");

async function must<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function ensureUser(client: SupabaseClient, email: string, name: string): Promise<string> {
  // 데모 계정 수가 적으므로 첫 페이지 조회로 충분
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const existing = data.users.find((u) => u.email === email);
  if (existing) {
    await client.auth.admin.updateUserById(existing.id, { password, user_metadata: { name } });
    return existing.id;
  }
  const created = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (created.error || !created.data.user) throw new Error(`createUser ${email}: ${created.error?.message}`);
  return created.data.user.id;
}

async function main() {
  const { organization, brandKodo, brandOther, storeMakati, storeBgc, storeOther } = DEMO_IDS;

  await must("organization", supabase.from("organizations").upsert({ id: organization, name: "DEMO Organization" }));
  await must(
    "brands",
    supabase.from("brands").upsert([
      {
        id: brandKodo,
        organization_id: organization,
        code: "KK",
        name: "KODO KODO",
        is_demo: true,
        brand_theme_json: { theme_key: "kodo", note: "DEMO theme placeholder; real logo/fonts pending" },
      },
      { id: brandOther, organization_id: organization, code: "DEMOB", name: "DEMO Brand B", is_demo: true },
    ]),
  );
  await must(
    "stores",
    supabase.from("stores").upsert([
      { id: storeMakati, brand_id: brandKodo, name: "DEMO Makati", is_demo: true },
      { id: storeBgc, brand_id: brandKodo, name: "DEMO BGC", is_demo: true },
      { id: storeOther, brand_id: brandOther, name: "DEMO Brand B Store 1", is_demo: true },
    ]),
  );

  const brandIds = { kodo: brandKodo, other: brandOther } as const;
  const storeIds = { makati: storeMakati, bgc: storeBgc, other: storeOther } as const;
  const userIds = new Map<string, string>();

  for (const account of DEMO_ACCOUNTS) {
    const userId = await ensureUser(supabase, account.email, account.name);
    userIds.set(account.email, userId);
    await must("profile", supabase.from("profiles").upsert({ id: userId, name: account.name, email: account.email }));
    await must("clear memberships", supabase.from("memberships").delete().eq("user_id", userId));
    await must(
      "membership",
      supabase.from("memberships").insert({
        user_id: userId,
        organization_id: organization,
        brand_id: account.brand ? brandIds[account.brand] : null,
        store_id: account.store ? storeIds[account.store] : null,
        role: account.role,
      }),
    );
    console.log(`user ${account.email} (${account.role})`);
  }

  const fieldMakati = userIds.get("field.makati@example.com")!;
  const editor = userIds.get("editor@example.com")!;

  // --- 현장 Guided 제출 1건 (사진 없음, 수량 미입력: 현장 사실은 실제 촬영 시 입력) ---
  const existingSubmission = await must(
    "find submission",
    supabase.from("submissions").select("id").eq("id", DEMO_IDS.submissionGuided).maybeSingle(),
  );
  if (!existingSubmission) {
    await must(
      "submission",
      supabase.from("submissions").insert({
        id: DEMO_IDS.submissionGuided,
        brand_id: brandKodo,
        store_id: storeMakati,
        station: "Main",
        capture_mode: "guided",
        title: "DEMO Galbi preparation capture",
        category: "Main dish",
        note: "DEMO data. Not a real recipe.",
        status: "submitted",
        submitted_by: fieldMakati,
        submitted_at: new Date().toISOString(),
      }),
    );
    const ingredients = await must(
      "ingredients",
      supabase
        .from("submission_ingredients")
        .insert([
          { submission_id: DEMO_IDS.submissionGuided, name: "DEMO Galbi (beef short rib)", sort_order: 1 },
          { submission_id: DEMO_IDS.submissionGuided, name: "DEMO Marinade sauce", sort_order: 2 },
          { submission_id: DEMO_IDS.submissionGuided, name: "DEMO Green onion", sort_order: 3 },
        ])
        .select("id, name"),
    );
    await must(
      "preparations",
      supabase.from("submission_preparations").insert(
        (ingredients ?? []).map((i) =>
          i.name.includes("sauce")
            ? { ingredient_id: i.id, no_prep: true, na_reason: "DEMO: ready-made sauce, no preparation" }
            : { ingredient_id: i.id, no_prep: false },
        ),
      ),
    );
  }

  // --- HQ 초안 매뉴얼 1건 ---
  const existingManual = await must(
    "find manual",
    supabase.from("manuals").select("id").eq("id", DEMO_IDS.manualGalbi).maybeSingle(),
  );
  if (!existingManual) {
    const code = await must("document code", supabase.rpc("next_document_code", { p_brand_id: brandKodo, p_station_code: "MAIN" }));
    await must(
      "manual",
      supabase.from("manuals").insert({
        id: DEMO_IDS.manualGalbi,
        brand_id: brandKodo,
        title: "DEMO Galbi Serving Procedure",
        station: "Main",
        manual_type: "recipe",
        store_scope: "brand_all",
        display_language: "en",
        document_code: code,
        created_by: editor,
      }),
    );
    await must(
      "manual source",
      supabase.from("manual_source_submissions").insert({
        manual_id: DEMO_IDS.manualGalbi,
        submission_id: DEMO_IDS.submissionGuided,
        brand_id: brandKodo,
      }),
    );
    await must(
      "draft",
      supabase.from("manual_drafts").insert({
        id: DEMO_IDS.draftGalbi,
        manual_id: DEMO_IDS.manualGalbi,
        brand_id: brandKodo,
        draft_json: { schema_version: 1, blocks: [] },
        updated_by: editor,
      }),
    );
    await must(
      "storage standard",
      supabase.from("storage_standards").insert({
        brand_id: brandKodo,
        draft_id: DEMO_IDS.draftGalbi,
        product_state: "cooked",
        // 온도·기한·기산점 모두 의도적으로 비움 (HQ 확인 필요)
      }),
    );
    await must(
      "serving standard",
      supabase.from("serving_standards").insert({
        brand_id: brandKodo,
        draft_id: DEMO_IDS.draftGalbi,
        quantity: 6,
        unit: "pcs",
        serving_context: "DEMO Galbi standard serving",
      }),
    );
    console.log(`manual ${code}`);
  }

  console.log("seed complete (DEMO data)");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
