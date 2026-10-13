"use server";

/**
 * 미디어 업로드 3단계:
 * 1) registerMedia: media_assets(pending) + media_links 생성, 저장 키 발급
 * 2) 클라이언트가 Supabase Storage(private 버킷)에 직접 업로드 — storage RLS 가 pending 행의 소유자만 허용
 * 3) completeMedia: 객체 존재 확인 후 uploaded 로 전환 (실패 시 markMediaFailed → 재시도 가능)
 * 파일 바이너리는 서버 액션/DB 를 거치지 않는다.
 */
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/auth/session";
import { createSupabaseServerClient } from "@/db/supabase/server";
import { MEDIA_ROLES } from "@/domain/enums";
import { fileExtension, MAX_UPLOAD_BYTES, mediaKindFromMime } from "@/domain/media";
import { fail, zodFail, type ActionResult } from "./result";

const SUBMISSION_ENTITY_TYPES = ["submission", "submission_preparation", "submission_cooking_step"] as const;

const registerSchema = z.object({
  submissionId: z.uuid(),
  entityType: z.enum(SUBMISSION_ENTITY_TYPES),
  entityId: z.uuid(),
  role: z.enum(MEDIA_ROLES),
  fileName: z.string().max(300),
  mime: z.string().min(1).max(120),
  size: z.number().int().nonnegative(),
  caption: z.string().trim().max(1000).nullable(),
});

export interface RegisteredMedia {
  mediaId: string;
  linkId: string;
  storageKey: string;
  thumbnailKey: string;
}

function refresh() {
  revalidatePath("/field/submissions/[id]", "page");
}

export async function registerMedia(input: z.input<typeof registerSchema>): Promise<ActionResult<RegisteredMedia>> {
  const { actor } = await requireSession("field");
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const p = parsed.data;

  const kind = mediaKindFromMime(p.mime);
  if (!kind) return fail("Only photos, videos and audio can be uploaded.");
  if (p.size > MAX_UPLOAD_BYTES) return fail(`File is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`);

  const supabase = await createSupabaseServerClient();
  const { data: sub } = await supabase
    .from("submissions")
    .select("id, brand_id, status, submitted_by")
    .eq("id", p.submissionId)
    .maybeSingle<{ id: string; brand_id: string; status: string; submitted_by: string }>();
  if (!sub || sub.status !== "draft" || sub.submitted_by !== actor.userId) return fail("This submission can no longer be edited.");

  // 링크 대상이 이 제출에 속하는지 확인
  let entityOk = false;
  if (p.entityType === "submission") {
    entityOk = p.entityId === sub.id;
  } else if (p.entityType === "submission_preparation") {
    const { data } = await supabase
      .from("submission_preparations")
      .select("id, submission_ingredients!inner(submission_id)")
      .eq("id", p.entityId)
      .eq("submission_ingredients.submission_id", sub.id)
      .maybeSingle();
    entityOk = Boolean(data);
  } else {
    const { data } = await supabase
      .from("submission_cooking_steps")
      .select("id")
      .eq("id", p.entityId)
      .eq("submission_id", sub.id)
      .maybeSingle();
    entityOk = Boolean(data);
  }
  if (!entityOk) return fail("Invalid upload target.");

  const mediaId = randomUUID();
  const base = `${sub.brand_id}/submissions/${sub.id}/${mediaId}`;
  const storageKey = `${base}.${fileExtension(p.fileName, p.mime)}`;
  const thumbnailKey = `${base}.thumb.jpg`;

  const { error: assetErr } = await supabase.from("media_assets").insert({
    id: mediaId,
    brand_id: sub.brand_id,
    submission_id: sub.id,
    owner_id: actor.userId,
    storage_key: storageKey,
    // 썸네일 업로드도 storage RLS(키 일치)를 통과해야 하므로 미리 기록. 썸네일이 없으면 complete 에서 null 로.
    thumbnail_key: thumbnailKey,
    kind,
    mime: p.mime,
    size_bytes: p.size,
    upload_status: "pending",
  });
  if (assetErr) return fail("Could not start the upload.");

  const { count } = await supabase
    .from("media_links")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", p.entityType)
    .eq("entity_id", p.entityId)
    .eq("role", p.role);
  const { data: link, error: linkErr } = await supabase
    .from("media_links")
    .insert({
      media_id: mediaId,
      brand_id: sub.brand_id,
      entity_type: p.entityType,
      entity_id: p.entityId,
      role: p.role,
      caption: p.caption,
      sort_order: (count ?? 0) + 1,
    })
    .select("id")
    .single<{ id: string }>();
  if (linkErr || !link) return fail("Could not start the upload.");

  return { ok: true, data: { mediaId, linkId: link.id, storageKey, thumbnailKey } };
}

const completeSchema = z.object({
  mediaId: z.uuid(),
  hasThumbnail: z.boolean(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
});

export async function completeMedia(input: z.input<typeof completeSchema>): Promise<ActionResult> {
  await requireSession("field");
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const p = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: asset } = await supabase
    .from("media_assets")
    .select("id, storage_key")
    .eq("id", p.mediaId)
    .maybeSingle<{ id: string; storage_key: string }>();
  if (!asset) return fail("Upload not found.");

  // 클라이언트 보고만 믿지 않고 스토리지에 실제 객체가 있는지 확인
  const { data: exists } = await supabase.storage.from("media").exists(asset.storage_key);
  if (!exists) return fail("The file did not reach storage. Retry the upload.");

  const thumbnailKey = asset.storage_key.replace(/\.[^.]+$/, ".thumb.jpg");
  const { data } = await supabase
    .from("media_assets")
    .update({
      upload_status: "uploaded",
      thumbnail_key: p.hasThumbnail ? thumbnailKey : null,
      width: p.width,
      height: p.height,
      duration_seconds: p.durationSeconds,
    })
    .eq("id", p.mediaId)
    .select("id");
  if (!data?.length) return fail("This submission can no longer be edited.");
  refresh();
  return { ok: true };
}

export async function markMediaFailed(mediaId: string): Promise<ActionResult> {
  await requireSession("field");
  const supabase = await createSupabaseServerClient();
  await supabase.from("media_assets").update({ upload_status: "failed" }).eq("id", mediaId).neq("upload_status", "uploaded");
  refresh();
  return { ok: true };
}

export async function updateMediaCaption(linkId: string, caption: string): Promise<ActionResult> {
  await requireSession("field");
  const text = caption.trim().slice(0, 1000) || null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("media_links").update({ caption: text }).eq("id", linkId).select("id");
  if (!data?.length) return fail("This submission can no longer be edited.");
  refresh();
  return { ok: true };
}

/** 제출 초안에서 빼기. 원본 파일과 media_assets 행은 보존한다. */
export async function removeMediaLink(linkId: string): Promise<ActionResult> {
  await requireSession("field");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("media_links").delete().eq("id", linkId).select("id");
  if (!data?.length) return fail("This submission can no longer be edited.");
  refresh();
  return { ok: true };
}
