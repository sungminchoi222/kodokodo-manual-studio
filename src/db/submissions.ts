import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { MediaKind, MediaLinkEntityType, MediaRole } from "@/domain/enums";
import type {
  MediaAsset,
  MediaLink,
  Profile,
  Submission,
  SubmissionCookingStep,
  SubmissionIngredient,
  SubmissionPreparation,
} from "@/domain/types";
import type { CheckInput } from "@/validation/submit-checks";
import { createSupabaseServerClient } from "./supabase/server";

/** 화면 표시용 signed URL 수명. 문서/QR 에는 절대 쓰지 않는다. */
const DISPLAY_URL_TTL_SECONDS = 60 * 60;

export interface MediaItem {
  linkId: string;
  mediaId: string;
  entityType: MediaLinkEntityType;
  entityId: string;
  role: MediaRole;
  caption: string | null;
  sortOrder: number;
  kind: MediaKind;
  mime: string;
  sizeBytes: number | null;
  uploadStatus: MediaAsset["upload_status"];
  storageKey: string;
  thumbnailKey: string | null;
  createdAt: string;
  /** 이미지: 썸네일(없으면 원본), 영상/음성: 원본 */
  displayUrl: string | null;
  originalUrl: string | null;
}

export interface IngredientWithPrep extends SubmissionIngredient {
  preparation: SubmissionPreparation | null;
}

export interface SubmissionAggregate {
  submission: Submission;
  submitter: Pick<Profile, "id" | "name"> | null;
  ingredients: IngredientWithPrep[];
  steps: SubmissionCookingStep[];
  media: MediaItem[];
}

type LinkWithAsset = MediaLink & { media_assets: MediaAsset | null };

export const getSubmissionAggregate = cache(async (id: string): Promise<SubmissionAggregate> => {
  const supabase = await createSupabaseServerClient();
  const { data: submission } = await supabase.from("submissions").select("*").eq("id", id).maybeSingle<Submission>();
  if (!submission) notFound(); // RLS 로 막힌 경우와 구분하지 않는다

  const [ingRes, stepRes, submitterRes, assetRes] = await Promise.all([
    supabase
      .from("submission_ingredients")
      .select("*, submission_preparations(*)")
      .eq("submission_id", id)
      .order("sort_order")
      .returns<(SubmissionIngredient & { submission_preparations: SubmissionPreparation | SubmissionPreparation[] | null })[]>(),
    supabase
      .from("submission_cooking_steps")
      .select("*")
      .eq("submission_id", id)
      .order("step_no")
      .returns<SubmissionCookingStep[]>(),
    supabase.from("profiles").select("id, name").eq("id", submission.submitted_by).maybeSingle<Pick<Profile, "id" | "name">>(),
    supabase.from("media_assets").select("id").eq("submission_id", id).returns<{ id: string }[]>(),
  ]);

  const ingredients: IngredientWithPrep[] = (ingRes.data ?? []).map(({ submission_preparations, ...ing }) => ({
    ...ing,
    preparation: Array.isArray(submission_preparations) ? (submission_preparations[0] ?? null) : submission_preparations,
  }));

  const mediaIds = (assetRes.data ?? []).map((a) => a.id);
  let links: LinkWithAsset[] = [];
  if (mediaIds.length > 0) {
    const { data } = await supabase
      .from("media_links")
      .select("*, media_assets(*)")
      .in("media_id", mediaIds)
      .neq("entity_type", "manual_version")
      .order("sort_order")
      .order("created_at")
      .returns<LinkWithAsset[]>();
    links = data ?? [];
  }

  // 업로드 완료된 파일만 signed URL 발급
  const paths = new Set<string>();
  for (const l of links) {
    const a = l.media_assets;
    if (!a || a.upload_status !== "uploaded") continue;
    paths.add(a.storage_key);
    if (a.thumbnail_key) paths.add(a.thumbnail_key);
  }
  const signed = new Map<string, string>();
  if (paths.size > 0) {
    const { data } = await supabase.storage.from("media").createSignedUrls([...paths], DISPLAY_URL_TTL_SECONDS);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }

  const media: MediaItem[] = links
    .filter((l): l is LinkWithAsset & { media_assets: MediaAsset } => l.media_assets !== null)
    .map((l) => {
      const a = l.media_assets;
      const originalUrl = signed.get(a.storage_key) ?? null;
      const thumbUrl = a.thumbnail_key ? (signed.get(a.thumbnail_key) ?? null) : null;
      return {
        linkId: l.id,
        mediaId: a.id,
        entityType: l.entity_type,
        entityId: l.entity_id,
        role: l.role,
        caption: l.caption,
        sortOrder: l.sort_order,
        kind: a.kind,
        mime: a.mime,
        sizeBytes: a.size_bytes,
        uploadStatus: a.upload_status,
        storageKey: a.storage_key,
        thumbnailKey: a.thumbnail_key,
        createdAt: a.created_at,
        displayUrl: a.kind === "image" ? (thumbUrl ?? originalUrl) : originalUrl,
        originalUrl,
      };
    });

  return { submission, submitter: submitterRes.data ?? null, ingredients, steps: stepRes.data ?? [], media };
});

export function toCheckInput(agg: SubmissionAggregate): CheckInput {
  return {
    captureMode: agg.submission.capture_mode,
    title: agg.submission.title,
    station: agg.submission.station,
    note: agg.submission.note,
    ingredients: agg.ingredients.map((i) => ({ id: i.id, name: i.name, preparation: i.preparation })),
    steps: agg.steps,
    media: agg.media,
  };
}

export function mediaFor(media: MediaItem[], entityType: MediaLinkEntityType, entityId: string, role?: MediaRole) {
  return media.filter((m) => m.entityType === entityType && m.entityId === entityId && (!role || m.role === role));
}
