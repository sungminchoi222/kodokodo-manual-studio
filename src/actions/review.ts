"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@/auth/rbac";
import { requireSession, type SessionContext } from "@/auth/session";
import { createSupabaseServerClient } from "@/db/supabase/server";
import { LOCALES, MANUAL_TYPES } from "@/domain/enums";
import { fail, zodFail, type ActionResult } from "./result";

async function loadForReview(session: SessionContext, submissionId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select("id, brand_id, status")
    .eq("id", submissionId)
    .maybeSingle<{ id: string; brand_id: string; status: string }>();
  const brand = sub ? session.brands.find((b) => b.id === sub.brand_id) : undefined;
  if (!sub || !brand) return null;
  if (!can(session.actor, "submission.review", { brand: { brandId: brand.id, organizationId: brand.organization_id } })) return null;
  return { supabase, sub, brand };
}

function refresh() {
  revalidatePath("/hq/inbox");
  revalidatePath("/hq/inbox/[submissionId]", "page");
}

export async function startReview(submissionId: string): Promise<ActionResult> {
  const session = await requireSession("hq");
  const ctx = await loadForReview(session, submissionId);
  if (!ctx) return fail("Not allowed.");
  if (ctx.sub.status !== "submitted") return fail("Only newly submitted items can be moved to review.");
  const { error } = await ctx.supabase.from("submissions").update({ status: "in_review" }).eq("id", submissionId);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

export async function rejectSubmission(submissionId: string, reason: string): Promise<ActionResult> {
  const session = await requireSession("hq");
  const text = reason.trim();
  if (!text) return fail("Enter a reason so the field team knows what to fix.", { reason: "Required" });
  if (text.length > 2000) return fail("Reason is too long.", { reason: "Max 2000 characters" });
  const ctx = await loadForReview(session, submissionId);
  if (!ctx) return fail("Not allowed.");
  if (!["submitted", "in_review"].includes(ctx.sub.status)) return fail("This submission is already closed.");
  const { error } = await ctx.supabase
    .from("submissions")
    .update({ status: "rejected", rejection_reason: text })
    .eq("id", submissionId);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

const createManualSchema = z.object({
  title: z.string().trim().min(1).max(160),
  manual_type: z.enum(MANUAL_TYPES),
  station: z.string().trim().min(1).max(60),
  station_code: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, "1–8 uppercase letters or digits"),
  display_language: z.enum(LOCALES),
});

export async function createManualFromSubmission(
  submissionId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireSession("hq");
  const parsed = createManualSchema.safeParse({
    title: formData.get("title"),
    manual_type: formData.get("manual_type"),
    station: formData.get("station"),
    station_code: String(formData.get("station_code") ?? "").toUpperCase(),
    display_language: formData.get("display_language"),
  });
  if (!parsed.success) return zodFail(parsed.error);
  const ctx = await loadForReview(session, submissionId);
  if (!ctx) return fail("Not allowed.");
  if (!["submitted", "in_review"].includes(ctx.sub.status)) return fail("This submission is already closed.");
  const { supabase, brand } = ctx;
  const { station_code, ...manualFields } = parsed.data;

  const { data: code, error: codeErr } = await supabase.rpc("next_document_code", {
    p_brand_id: brand.id,
    p_station_code: station_code,
  });
  if (codeErr || typeof code !== "string") return fail("Could not issue a document code.");

  const { data: manual, error: manualErr } = await supabase
    .from("manuals")
    .insert({ ...manualFields, brand_id: brand.id, document_code: code, created_by: session.actor.userId })
    .select("id")
    .single<{ id: string }>();
  if (manualErr || !manual) return fail("Could not create the manual.");

  // 초안 본문은 Step 3 Manual Builder 에서 원본 제출을 불러와 구성한다
  await supabase.from("manual_drafts").insert({
    manual_id: manual.id,
    brand_id: brand.id,
    draft_json: { schema_version: 1, blocks: [] },
  });
  await supabase.from("manual_source_submissions").insert({
    manual_id: manual.id,
    submission_id: submissionId,
    brand_id: brand.id,
  });
  await supabase.from("submissions").update({ status: "used" }).eq("id", submissionId);

  refresh();
  revalidatePath("/hq/manuals");
  redirect(`/hq/manuals/${manual.id}/edit`);
}
