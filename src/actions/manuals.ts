"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can, type Action } from "@/auth/rbac";
import { requireSession } from "@/auth/session";
import { assembleFromEditorData, getManualEditorData, toMediaStatus } from "@/db/manuals";
import { getSubmissionAggregate } from "@/db/submissions";
import { createSupabaseServerClient } from "@/db/supabase/server";
import { LOCALES, MANUAL_TYPES, STORE_SCOPES } from "@/domain/enums";
import { manualDraftContentSchema, referencedMediaIds, type Block } from "@/domain/manual-content";
import { nextVersionLabel } from "@/domain/templates";
import type { Brand, Manual } from "@/domain/types";
import { importBlocksFromSubmission } from "@/manual/import-submission";
import { servingStandardInputSchema, storageStandardInputSchema } from "@/validation/product-standards";
import { checkPublish, type PublishIssue } from "@/validation/publish-checks";
import { fail, zodFail, type ActionResult } from "./result";

const EDIT_PATHS = ["/hq/manuals/[id]/edit", "/hq/manuals/[id]/preview", "/hq/manuals/[id]/approve"];
function refresh() {
  for (const p of EDIT_PATHS) revalidatePath(p, "page");
  revalidatePath("/hq/manuals");
}

/** 매뉴얼 단위 권한 확인 (앱 계층). DB RLS/트리거가 한 번 더 막는다. */
async function forManual(manualId: string, action: Action) {
  const session = await requireSession("hq");
  const supabase = await createSupabaseServerClient();
  const { data: manual } = await supabase.from("manuals").select("*").eq("id", manualId).maybeSingle<Manual>();
  const brand = manual ? session.brands.find((b) => b.id === manual.brand_id) : undefined;
  if (!manual || !brand) return null;
  if (!can(session.actor, action, { brand: { brandId: brand.id, organizationId: brand.organization_id } })) return null;
  return { session, supabase, manual, brand };
}

const NOT_ALLOWED = "You do not have permission for this manual.";

/** 발행된 매뉴얼의 초안(본문·기준·메타)을 고치면 상태를 draft 로 되돌린다. 발행본은 그대로. */
async function markDraftChanged(ctx: NonNullable<Awaited<ReturnType<typeof forManual>>>) {
  if (ctx.manual.review_status === "published") {
    await ctx.supabase.from("manuals").update({ review_status: "draft" }).eq("id", ctx.manual.id);
  }
}

// ---------------------------------------------------------------------------
// draft body
// ---------------------------------------------------------------------------
export async function saveDraftContent(
  manualId: string,
  expectedVersion: number,
  content: unknown,
): Promise<ActionResult<{ version: number }>> {
  const ctx = await forManual(manualId, "manual.edit_draft");
  if (!ctx) return fail(NOT_ALLOWED);
  const parsed = manualDraftContentSchema.safeParse(content);
  if (!parsed.success) return zodFail(parsed.error);

  const { data } = await ctx.supabase
    .from("manual_drafts")
    .update({ draft_json: parsed.data })
    .eq("manual_id", manualId)
    .eq("optimistic_version", expectedVersion)
    .select("optimistic_version")
    .returns<{ optimistic_version: number }[]>();
  const row = data?.[0];
  if (!row) return fail("CONFLICT: this draft was changed by someone else. Reload to get the latest version.");

  await markDraftChanged(ctx);
  revalidatePath("/hq/manuals/[id]/preview", "page");
  revalidatePath("/hq/manuals/[id]/approve", "page");
  return { ok: true, data: { version: row.optimistic_version } };
}

// ---------------------------------------------------------------------------
// metadata / applicability / sources
// ---------------------------------------------------------------------------
const metaSchema = z.object({
  title: z.string().trim().min(1).max(160),
  station: z.string().trim().min(1).max(60),
  manual_type: z.enum(MANUAL_TYPES),
  display_language: z.enum(LOCALES),
  store_scope: z.enum(STORE_SCOPES),
  store_ids: z.array(z.uuid()).max(500),
  hq_direct_source_note: z.string().trim().max(2000).nullable(),
});

export async function saveManualMeta(manualId: string, input: z.input<typeof metaSchema>): Promise<ActionResult<{ version: number }>> {
  const ctx = await forManual(manualId, "manual.edit_draft");
  if (!ctx) return fail(NOT_ALLOWED);
  const parsed = metaSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const p = parsed.data;
  if (p.manual_type !== ctx.manual.manual_type && ctx.manual.active_version_id) {
    return fail("Manual type cannot change after the first publication.", { manual_type: "Locked after publication" });
  }
  if (p.store_scope === "selected_stores" && p.store_ids.length === 0) {
    return fail("Select at least one store.", { store_ids: "Select at least one store" });
  }

  const { error } = await ctx.supabase
    .from("manuals")
    .update({ title: p.title, station: p.station, manual_type: p.manual_type, display_language: p.display_language, store_scope: p.store_scope })
    .eq("id", manualId);
  if (error) return fail(error.message);

  // 적용 매장: 전체 교체
  await ctx.supabase.from("manual_applicability").delete().eq("manual_id", manualId);
  if (p.store_scope === "selected_stores") {
    const { error: appErr } = await ctx.supabase
      .from("manual_applicability")
      .insert(p.store_ids.map((store_id) => ({ manual_id: manualId, store_id, brand_id: ctx.manual.brand_id })));
    if (appErr) return fail("Invalid store selection.");
  }

  const { data } = await ctx.supabase
    .from("manual_drafts")
    .update({ hq_direct_source_note: p.hq_direct_source_note || null })
    .eq("manual_id", manualId)
    .select("optimistic_version")
    .returns<{ optimistic_version: number }[]>();
  await markDraftChanged(ctx);
  refresh();
  return { ok: true, data: { version: data?.[0]?.optimistic_version ?? 0 } };
}

export async function linkSubmission(manualId: string, submissionId: string): Promise<ActionResult> {
  const ctx = await forManual(manualId, "manual.edit_draft");
  if (!ctx) return fail(NOT_ALLOWED);
  const { error } = await ctx.supabase
    .from("manual_source_submissions")
    .insert({ manual_id: manualId, submission_id: submissionId, brand_id: ctx.manual.brand_id });
  if (error) return fail(error.code === "23505" ? "Already linked." : "Cannot link this submission.");
  // 제출 상태: 매뉴얼에 반영됨
  await ctx.supabase.from("submissions").update({ status: "used" }).eq("id", submissionId).in("status", ["submitted", "in_review"]);
  refresh();
  return { ok: true };
}

export async function unlinkSubmission(manualId: string, submissionId: string): Promise<ActionResult> {
  const ctx = await forManual(manualId, "manual.edit_draft");
  if (!ctx) return fail(NOT_ALLOWED);
  await ctx.supabase.from("manual_source_submissions").delete().eq("manual_id", manualId).eq("submission_id", submissionId);
  refresh();
  return { ok: true };
}

/** 제출 내용을 초안 블록으로 변환해 돌려준다 (클라이언트가 본문 끝에 붙이고 저장). */
export async function buildImportBlocks(manualId: string, submissionId: string): Promise<ActionResult<{ blocks: Block[] }>> {
  const ctx = await forManual(manualId, "manual.edit_draft");
  if (!ctx) return fail(NOT_ALLOWED);
  const agg = await getSubmissionAggregate(submissionId);
  if (agg.submission.brand_id !== ctx.manual.brand_id) return fail("Submission belongs to another brand.");
  const blocks = importBlocksFromSubmission(
    {
      submission: agg.submission,
      ingredients: agg.ingredients,
      steps: agg.steps,
      media: agg.media.map((m) => ({
        mediaId: m.mediaId,
        entityType: m.entityType,
        entityId: m.entityId,
        role: m.role,
        caption: m.caption,
        kind: m.kind,
        uploadStatus: m.uploadStatus,
      })),
    },
    () => randomUUID(),
  );
  return { ok: true, data: { blocks } };
}

// ---------------------------------------------------------------------------
// standards (정규화 행)
// ---------------------------------------------------------------------------
async function draftIdOf(ctx: NonNullable<Awaited<ReturnType<typeof forManual>>>) {
  const { data } = await ctx.supabase.from("manual_drafts").select("id").eq("manual_id", ctx.manual.id).single<{ id: string }>();
  return data?.id ?? null;
}

export async function saveStorageStandard(
  manualId: string,
  rowId: string | null,
  input: z.input<typeof storageStandardInputSchema>,
): Promise<ActionResult> {
  const ctx = await forManual(manualId, "standards.edit");
  if (!ctx) return fail(NOT_ALLOWED);
  const parsed = storageStandardInputSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const draftId = await draftIdOf(ctx);
  if (!draftId) return fail("Draft not found.");

  const q = rowId
    ? ctx.supabase.from("storage_standards").update(parsed.data).eq("id", rowId).eq("draft_id", draftId).select("id")
    : ctx.supabase.from("storage_standards").insert({ ...parsed.data, brand_id: ctx.manual.brand_id, draft_id: draftId }).select("id");
  const { data, error } = await q;
  if (error) {
    return fail(
      error.code === "23505" ? `There is already a row for "${parsed.data.product_state}". Use one row per state.` : error.message,
      error.code === "23505" ? { product_state: "Duplicate state" } : undefined,
    );
  }
  if (!data?.length) return fail(NOT_ALLOWED);
  await markDraftChanged(ctx);
  refresh();
  return { ok: true };
}

export async function deleteStorageStandard(manualId: string, rowId: string): Promise<ActionResult> {
  const ctx = await forManual(manualId, "standards.edit");
  if (!ctx) return fail(NOT_ALLOWED);
  const draftId = await draftIdOf(ctx);
  await ctx.supabase.from("storage_standards").delete().eq("id", rowId).eq("draft_id", draftId ?? "");
  await markDraftChanged(ctx);
  refresh();
  return { ok: true };
}

export async function saveServingStandard(
  manualId: string,
  rowId: string | null,
  input: z.input<typeof servingStandardInputSchema>,
): Promise<ActionResult> {
  const ctx = await forManual(manualId, "standards.edit");
  if (!ctx) return fail(NOT_ALLOWED);
  const parsed = servingStandardInputSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const draftId = await draftIdOf(ctx);
  if (!draftId) return fail("Draft not found.");
  const q = rowId
    ? ctx.supabase.from("serving_standards").update(parsed.data).eq("id", rowId).eq("draft_id", draftId).select("id")
    : ctx.supabase.from("serving_standards").insert({ ...parsed.data, brand_id: ctx.manual.brand_id, draft_id: draftId }).select("id");
  const { data, error } = await q;
  if (error) return fail(error.message);
  if (!data?.length) return fail(NOT_ALLOWED);
  await markDraftChanged(ctx);
  refresh();
  return { ok: true };
}

export async function deleteServingStandard(manualId: string, rowId: string): Promise<ActionResult> {
  const ctx = await forManual(manualId, "standards.edit");
  if (!ctx) return fail(NOT_ALLOWED);
  const draftId = await draftIdOf(ctx);
  await ctx.supabase.from("serving_standards").delete().eq("id", rowId).eq("draft_id", draftId ?? "");
  await markDraftChanged(ctx);
  refresh();
  return { ok: true };
}

/** 기준 확정(검증 표시). HQ Approver 본인 이름으로만. 값이 바뀌면 DB 트리거가 자동 해제한다. */
export async function setStandardVerified(
  manualId: string,
  table: "storage" | "serving",
  rowId: string,
  verified: boolean,
): Promise<ActionResult> {
  const ctx = await forManual(manualId, "standards.verify");
  if (!ctx) return fail("Only an HQ approver can verify standards.");
  const draftId = await draftIdOf(ctx);
  const { data, error } = await ctx.supabase
    .from(table === "storage" ? "storage_standards" : "serving_standards")
    .update(verified ? { verified_by: ctx.session.actor.userId, verified_at: new Date().toISOString() } : { verified_by: null, verified_at: null })
    .eq("id", rowId)
    .eq("draft_id", draftId ?? "")
    .select("id");
  if (error || !data?.length) return fail(error?.message ?? NOT_ALLOWED);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// workflow
// ---------------------------------------------------------------------------
export async function submitForApproval(manualId: string): Promise<ActionResult> {
  const ctx = await forManual(manualId, "manual.edit_draft");
  if (!ctx) return fail(NOT_ALLOWED);
  await ctx.supabase.from("manuals").update({ review_status: "pending_approval", review_comment: null }).eq("id", manualId);
  refresh();
  return { ok: true };
}

export async function requestChanges(manualId: string, comment: string): Promise<ActionResult> {
  const ctx = await forManual(manualId, "manual.publish");
  if (!ctx) return fail(NOT_ALLOWED);
  const text = comment.trim();
  if (!text) return fail("A comment is required when requesting changes.", { comment: "Required" });
  await ctx.supabase.from("manuals").update({ review_status: "revision_requested", review_comment: text.slice(0, 4000) }).eq("id", manualId);
  refresh();
  return { ok: true };
}

const publishSchema = z.object({
  expectedDraftVersion: z.number().int(),
  change_log: z.string().max(4000),
  revision_reason: z.string().max(4000),
  approval_comment: z.string().max(4000),
  bump: z.enum(["minor", "major"]),
});

export async function publishManual(
  manualId: string,
  input: z.input<typeof publishSchema>,
): Promise<{ ok: false; error: string; issues?: PublishIssue[]; fieldErrors?: Record<string, string> }> {
  const ctx = await forManual(manualId, "manual.publish");
  if (!ctx) return fail("Only an HQ approver can publish.");
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const form = parsed.data;

  // 1) 기준 도장을 먼저 읽고 2) 데이터를 읽는다 → 사이에 바뀌면 DB 함수가 거부
  const draftId = await draftIdOf(ctx);
  const { data: stamp } = await ctx.supabase.rpc("draft_standards_stamp", { p_draft_id: draftId });
  const data = await getManualEditorData(manualId);
  if (data.draft.version !== form.expectedDraftVersion) {
    return fail("The draft changed while you were reviewing. Reload and review again.");
  }
  if (data.draft.parseError) return fail(`Draft content is invalid: ${data.draft.parseError}`);

  const content = assembleFromEditorData(data);
  const issues = checkPublish({
    content,
    media: toMediaStatus(data.media),
    hasPreviousVersion: Boolean(data.manual.active_version_id),
    form,
  });
  if (issues.length) return { ok: false, error: `${issues.length} issue(s) must be fixed before publishing.`, issues };

  const label = nextVersionLabel(
    data.versions.map((v) => v.version_label),
    form.bump,
  );
  const approvedAt = new Date().toISOString();
  content.version = {
    label,
    change_log: form.change_log.trim(),
    revision_reason: form.revision_reason.trim() || null,
    approved_by_name: ctx.session.profile.name,
    approved_at: approvedAt,
  };

  const { data: versionId, error } = await ctx.supabase.rpc("publish_manual", {
    p_manual_id: manualId,
    p_expected_draft_version: form.expectedDraftVersion,
    p_standards_stamp: stamp,
    p_version_label: label,
    p_change_log: form.change_log.trim(),
    p_revision_reason: form.revision_reason,
    p_approval_comment: form.approval_comment,
    p_approved_at: approvedAt,
    p_content: content,
    p_media_ids: referencedMediaIds(content),
  });
  if (error || typeof versionId !== "string") {
    return fail(error?.code === "40001" ? "The draft or standards changed during approval. Reload and review again." : `Publish failed: ${error?.message ?? "unknown error"}`);
  }
  refresh();
  revalidatePath("/hq/manuals/[id]/versions", "page");
  revalidatePath("/field/manuals");
  redirect(`/hq/manuals/${manualId}/versions/${versionId}`);
}

// ---------------------------------------------------------------------------
// HQ 직접 작성 매뉴얼
// ---------------------------------------------------------------------------
const createSchema = z.object({
  brand_id: z.uuid(),
  title: z.string().trim().min(1).max(160),
  manual_type: z.enum(MANUAL_TYPES),
  station: z.string().trim().min(1).max(60),
  station_code: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, "1–8 uppercase letters or digits"),
  display_language: z.enum(LOCALES),
});

export async function createManual(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireSession("hq");
  const parsed = createSchema.safeParse({
    brand_id: formData.get("brand_id"),
    title: formData.get("title"),
    manual_type: formData.get("manual_type"),
    station: formData.get("station"),
    station_code: String(formData.get("station_code") ?? "").toUpperCase(),
    display_language: formData.get("display_language"),
  });
  if (!parsed.success) return zodFail(parsed.error);
  const brand: Brand | undefined = session.brands.find((b) => b.id === parsed.data.brand_id);
  if (!brand || !can(session.actor, "manual.edit_draft", { brand: { brandId: brand.id, organizationId: brand.organization_id } })) {
    return fail(NOT_ALLOWED);
  }
  const supabase = await createSupabaseServerClient();
  const { station_code, ...fields } = parsed.data;
  const { data: code, error: codeErr } = await supabase.rpc("next_document_code", { p_brand_id: brand.id, p_station_code: station_code });
  if (codeErr || typeof code !== "string") return fail("Could not issue a document code.");
  const { data: manual, error } = await supabase
    .from("manuals")
    .insert({ ...fields, document_code: code, created_by: session.actor.userId })
    .select("id")
    .single<{ id: string }>();
  if (error || !manual) return fail("Could not create the manual.");
  await supabase.from("manual_drafts").insert({ manual_id: manual.id, brand_id: brand.id, draft_json: { schema_version: 1 } });
  refresh();
  redirect(`/hq/manuals/${manual.id}/edit`);
}

