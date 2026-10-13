"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@/auth/rbac";
import { requireSession } from "@/auth/session";
import { getSubmissionAggregate, toCheckInput } from "@/db/submissions";
import { createSupabaseServerClient } from "@/db/supabase/server";
import type { Store } from "@/domain/types";
import {
  cookingStepInputSchema,
  finalProductInputSchema,
  guidedSubmissionBasicsSchema,
  ingredientInputSchema,
  preparationInputSchema,
  quickSubmissionSchema,
  type CookingStepInput,
  type FinalProductInput,
  type IngredientInput,
  type PreparationInput,
} from "@/validation/submission";
import { checkSubmission, hasBlockingIssues, type CheckIssue } from "@/validation/submit-checks";
import { fail, numOrNull, strOrNull, zodFail, type ActionResult } from "./result";

const SUBMISSION_PAGE = "/field/submissions/[id]";
const NOT_EDITABLE = "This submission can no longer be edited.";

function refresh() {
  revalidatePath(SUBMISSION_PAGE, "page");
}

/** RLS 로 갱신된 행이 없으면(권한 없음/제출됨) 실패로 본다 */
function affected(rows: unknown[] | null): boolean {
  return Array.isArray(rows) && rows.length > 0;
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------
export async function createSubmission(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { actor, brands } = await requireSession("field");
  const supabase = await createSupabaseServerClient();
  const mode = formData.get("capture_mode") === "quick" ? "quick" : "guided";

  const storeId = String(formData.get("store_id") ?? "");
  const { data: store } = await supabase.from("stores").select("*").eq("id", storeId).maybeSingle<Store>();
  const brand = store ? brands.find((b) => b.id === store.brand_id) : undefined;
  if (!store || !brand) return fail("Select your store.", { store_id: "Select your store." });
  if (!can(actor, "submission.create", { brand: { brandId: brand.id, organizationId: brand.organization_id }, storeId })) {
    return fail("You cannot submit for this store.");
  }

  const common = {
    brand_id: brand.id,
    store_id: store.id,
    station: String(formData.get("station") ?? ""),
    title: String(formData.get("title") ?? ""),
    note: strOrNull(formData.get("note")),
  };
  const parsed =
    mode === "quick"
      ? quickSubmissionSchema.safeParse({ ...common, capture_mode: "quick", source_manual_id: strOrNull(formData.get("source_manual_id")) })
      : guidedSubmissionBasicsSchema.safeParse({
          ...common,
          capture_mode: "guided",
          category: strOrNull(formData.get("category")),
          batch_unit: strOrNull(formData.get("batch_unit")),
          batch_yield: numOrNull(formData.get("batch_yield")),
        });
  if (!parsed.success) return zodFail(parsed.error);

  const { data, error } = await supabase
    .from("submissions")
    .insert({ ...parsed.data, submitted_by: actor.userId, status: "draft" })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return fail("Could not create the submission. Try again.");

  redirect(`/field/submissions/${data.id}${mode === "guided" ? "?step=ingredients" : ""}`);
}

// ---------------------------------------------------------------------------
// basics
// ---------------------------------------------------------------------------
const basicsUpdateSchema = z.object({
  title: guidedSubmissionBasicsSchema.shape.title,
  station: guidedSubmissionBasicsSchema.shape.station,
  note: guidedSubmissionBasicsSchema.shape.note,
  category: guidedSubmissionBasicsSchema.shape.category,
  batch_unit: guidedSubmissionBasicsSchema.shape.batch_unit,
  batch_yield: guidedSubmissionBasicsSchema.shape.batch_yield,
  source_manual_id: z.uuid().nullable(),
});

export async function saveBasics(id: string, input: z.input<typeof basicsUpdateSchema>): Promise<ActionResult> {
  await requireSession("field");
  const parsed = basicsUpdateSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("submissions").update(parsed.data).eq("id", id).eq("status", "draft").select("id");
  if (!affected(data)) return fail(NOT_EDITABLE);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// ingredients + preparation
// ---------------------------------------------------------------------------
export async function addIngredient(submissionId: string, input: IngredientInput): Promise<ActionResult> {
  await requireSession("field");
  const parsed = ingredientInputSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const supabase = await createSupabaseServerClient();

  const { data: last } = await supabase
    .from("submission_ingredients")
    .select("sort_order")
    .eq("submission_id", submissionId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();

  const { data: ing, error } = await supabase
    .from("submission_ingredients")
    .insert({ ...parsed.data, submission_id: submissionId, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("id")
    .single<{ id: string }>();
  if (error || !ing) return fail(NOT_EDITABLE);
  // 재료마다 손질 카드 1개
  await supabase.from("submission_preparations").insert({ ingredient_id: ing.id, no_prep: false });
  refresh();
  return { ok: true };
}

export async function updateIngredient(id: string, input: IngredientInput): Promise<ActionResult> {
  await requireSession("field");
  const parsed = ingredientInputSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("submission_ingredients").update(parsed.data).eq("id", id).select("id");
  if (!affected(data)) return fail(NOT_EDITABLE);
  refresh();
  return { ok: true };
}

export async function deleteIngredient(id: string): Promise<ActionResult> {
  await requireSession("field");
  const supabase = await createSupabaseServerClient();
  // 손질 카드에 연결된 미디어 링크 정리 (미디어 원본은 보존)
  const { data: prep } = await supabase.from("submission_preparations").select("id").eq("ingredient_id", id).maybeSingle<{ id: string }>();
  if (prep) await supabase.from("media_links").delete().eq("entity_type", "submission_preparation").eq("entity_id", prep.id);
  const { data } = await supabase.from("submission_ingredients").delete().eq("id", id).select("id");
  if (!affected(data)) return fail(NOT_EDITABLE);
  refresh();
  return { ok: true };
}

export async function moveIngredient(id: string, direction: "up" | "down"): Promise<ActionResult> {
  await requireSession("field");
  const supabase = await createSupabaseServerClient();
  const { data: cur } = await supabase
    .from("submission_ingredients")
    .select("id, submission_id, sort_order")
    .eq("id", id)
    .maybeSingle<{ id: string; submission_id: string; sort_order: number }>();
  if (!cur) return fail(NOT_EDITABLE);
  const { data: neighbor } = await supabase
    .from("submission_ingredients")
    .select("id, sort_order")
    .eq("submission_id", cur.submission_id)
    [direction === "up" ? "lt" : "gt"]("sort_order", cur.sort_order)
    .order("sort_order", { ascending: direction === "down" })
    .limit(1)
    .maybeSingle<{ id: string; sort_order: number }>();
  if (!neighbor) return { ok: true };
  const a = await supabase.from("submission_ingredients").update({ sort_order: neighbor.sort_order }).eq("id", cur.id).select("id");
  if (!affected(a.data)) return fail(NOT_EDITABLE);
  await supabase.from("submission_ingredients").update({ sort_order: cur.sort_order }).eq("id", neighbor.id);
  refresh();
  return { ok: true };
}

export async function savePreparation(prepId: string, input: PreparationInput): Promise<ActionResult> {
  await requireSession("field");
  const parsed = preparationInputSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("submission_preparations").update(parsed.data).eq("id", prepId).select("id");
  if (!affected(data)) return fail(NOT_EDITABLE);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// cooking steps
// ---------------------------------------------------------------------------
type StepFields = Omit<CookingStepInput, "step_no">;
const stepFieldsSchema = cookingStepInputSchema.omit({ step_no: true });

export async function addStep(submissionId: string): Promise<ActionResult> {
  await requireSession("field");
  const supabase = await createSupabaseServerClient();
  const { data: last } = await supabase
    .from("submission_cooking_steps")
    .select("step_no")
    .eq("submission_id", submissionId)
    .order("step_no", { ascending: false })
    .limit(1)
    .maybeSingle<{ step_no: number }>();
  const { error } = await supabase
    .from("submission_cooking_steps")
    .insert({ submission_id: submissionId, step_no: (last?.step_no ?? 0) + 1, description: "" });
  if (error) return fail(NOT_EDITABLE);
  refresh();
  return { ok: true };
}

export async function updateStep(id: string, input: StepFields): Promise<ActionResult> {
  await requireSession("field");
  const parsed = stepFieldsSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("submission_cooking_steps").update(parsed.data).eq("id", id).select("id");
  if (!affected(data)) return fail(NOT_EDITABLE);
  refresh();
  return { ok: true };
}

export async function deleteStep(id: string): Promise<ActionResult> {
  await requireSession("field");
  const supabase = await createSupabaseServerClient();
  await supabase.from("media_links").delete().eq("entity_type", "submission_cooking_step").eq("entity_id", id);
  const { data } = await supabase
    .from("submission_cooking_steps")
    .delete()
    .eq("id", id)
    .select("submission_id, step_no")
    .returns<{ submission_id: string; step_no: number }[]>();
  const removed = data?.[0];
  if (!removed) return fail(NOT_EDITABLE);
  // 뒤 단계 번호 당기기 (오름차순이면 unique 충돌 없음)
  const { data: rest } = await supabase
    .from("submission_cooking_steps")
    .select("id, step_no")
    .eq("submission_id", removed.submission_id)
    .gt("step_no", removed.step_no)
    .order("step_no")
    .returns<{ id: string; step_no: number }[]>();
  for (const s of rest ?? []) {
    await supabase.from("submission_cooking_steps").update({ step_no: s.step_no - 1 }).eq("id", s.id);
  }
  refresh();
  return { ok: true };
}

export async function moveStep(id: string, direction: "up" | "down"): Promise<ActionResult> {
  await requireSession("field");
  const supabase = await createSupabaseServerClient();
  const { data: cur } = await supabase
    .from("submission_cooking_steps")
    .select("id, submission_id, step_no")
    .eq("id", id)
    .maybeSingle<{ id: string; submission_id: string; step_no: number }>();
  if (!cur) return fail(NOT_EDITABLE);
  const target = cur.step_no + (direction === "up" ? -1 : 1);
  const { data: other } = await supabase
    .from("submission_cooking_steps")
    .select("id")
    .eq("submission_id", cur.submission_id)
    .eq("step_no", target)
    .maybeSingle<{ id: string }>();
  if (!other) return { ok: true };
  // unique(submission_id, step_no) 회피용 임시 번호
  const tmp = await supabase.from("submission_cooking_steps").update({ step_no: 1_000_000 }).eq("id", cur.id).select("id");
  if (!affected(tmp.data)) return fail(NOT_EDITABLE);
  await supabase.from("submission_cooking_steps").update({ step_no: cur.step_no }).eq("id", other.id);
  await supabase.from("submission_cooking_steps").update({ step_no: target }).eq("id", cur.id);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// final product
// ---------------------------------------------------------------------------
export async function saveFinal(id: string, input: FinalProductInput): Promise<ActionResult> {
  await requireSession("field");
  const parsed = finalProductInputSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("submissions").update(parsed.data).eq("id", id).eq("status", "draft").select("id");
  if (!affected(data)) return fail(NOT_EDITABLE);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// submit / delete
// ---------------------------------------------------------------------------
export async function submitSubmission(
  id: string,
  acknowledgeWarnings: boolean,
): Promise<ActionResult<{ issues: CheckIssue[] }>> {
  await requireSession("field");
  const agg = await getSubmissionAggregate(id);
  if (agg.submission.status !== "draft") return fail("Already submitted.");

  const issues = checkSubmission(toCheckInput(agg));
  if (hasBlockingIssues(issues)) return fail("Fix the errors before submitting.");
  if (issues.length > 0 && !acknowledgeWarnings) return fail("Confirm the missing items before submitting.");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("submissions").update({ status: "submitted" }).eq("id", id).eq("status", "draft").select("id");
  if (!affected(data)) return fail(NOT_EDITABLE);
  revalidatePath("/field/submissions");
  redirect(`/field/submissions/${id}`);
}

export async function deleteDraft(id: string): Promise<ActionResult> {
  await requireSession("field");
  const supabase = await createSupabaseServerClient();
  // 폴리모픽 링크는 FK cascade 대상이 아니므로 먼저 정리 (media_assets/스토리지 원본은 보존)
  const { data: assets } = await supabase.from("media_assets").select("id").eq("submission_id", id).returns<{ id: string }[]>();
  if (assets?.length) await supabase.from("media_links").delete().in("media_id", assets.map((a) => a.id));
  const { data } = await supabase.from("submissions").delete().eq("id", id).eq("status", "draft").select("id");
  if (!affected(data)) return fail(NOT_EDITABLE);
  revalidatePath("/field/submissions");
  redirect("/field/submissions");
}
