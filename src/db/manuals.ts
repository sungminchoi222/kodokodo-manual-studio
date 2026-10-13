import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Brand, Manual, ManualVersion, MediaAsset, Profile, ServingStandardRow, StorageStandardRow, Store, Submission } from "@/domain/types";
import { parseDraftContent, referencedMediaIds, type ManualContent, type ManualDraftContent, type MediaMeta } from "@/domain/manual-content";
import { assembleManualContent } from "@/manual/assemble";
import type { MediaStatus } from "@/validation/publish-checks";
import { getSubmissionAggregate, type MediaItem } from "./submissions";
import { createSupabaseServerClient } from "./supabase/server";

const DISPLAY_URL_TTL_SECONDS = 60 * 60;

/** RLS 경유 매뉴얼 조회. 권한 밖이거나 없으면 404 (존재 여부를 구분해 노출하지 않음). */
export const getManualOr404 = cache(async (id: string): Promise<Manual> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("manuals").select("*").eq("id", id).maybeSingle<Manual>();
  if (!data) notFound();
  return data;
});

/** 화면 표시용 미디어 정보 (signed URL 은 화면 전용, 1시간) */
export interface MediaInfo {
  mediaId: string;
  kind: MediaAsset["kind"];
  mime: string;
  width: number | null;
  height: number | null;
  uploadStatus: MediaAsset["upload_status"];
  displayUrl: string | null;
  originalUrl: string | null;
}

export async function getMediaInfo(ids: string[]): Promise<Record<string, MediaInfo>> {
  const out: Record<string, MediaInfo> = {};
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  const supabase = await createSupabaseServerClient();
  const { data: assets } = await supabase.from("media_assets").select("*").in("id", unique).returns<MediaAsset[]>();
  const paths = new Set<string>();
  for (const a of assets ?? []) {
    if (a.upload_status !== "uploaded") continue;
    paths.add(a.storage_key);
    if (a.thumbnail_key) paths.add(a.thumbnail_key);
  }
  const signed = new Map<string, string>();
  if (paths.size) {
    const { data } = await supabase.storage.from("media").createSignedUrls([...paths], DISPLAY_URL_TTL_SECONDS);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }
  for (const a of assets ?? []) {
    const originalUrl = signed.get(a.storage_key) ?? null;
    const thumb = a.thumbnail_key ? (signed.get(a.thumbnail_key) ?? null) : null;
    out[a.id] = {
      mediaId: a.id,
      kind: a.kind,
      mime: a.mime,
      width: a.width,
      height: a.height,
      uploadStatus: a.upload_status,
      displayUrl: a.kind === "image" ? (thumb ?? originalUrl) : originalUrl,
      originalUrl,
    };
  }
  return out;
}

export function toMediaMeta(info: Record<string, MediaInfo>): Record<string, MediaMeta> {
  return Object.fromEntries(Object.values(info).map((m) => [m.mediaId, { kind: m.kind, mime: m.mime, width: m.width, height: m.height }]));
}

export function toMediaStatus(info: Record<string, MediaInfo>): Record<string, MediaStatus> {
  return Object.fromEntries(Object.values(info).map((m) => [m.mediaId, { uploaded: m.uploadStatus === "uploaded", kind: m.kind }]));
}

export interface LibraryItem extends MediaItem {
  sourceTitle: string;
  /** 사람이 읽는 출처 (예: "Galbi · BEFORE", "Step 2", "Final") */
  label: string;
}

export interface SourceSummary {
  submission: Pick<Submission, "id" | "title" | "capture_mode" | "status" | "submitted_at">;
}

export interface ManualEditorData {
  manual: Manual;
  brand: Brand;
  brandStores: Store[];
  applicableStoreIds: string[];
  draft: { id: string; version: number; content: ManualDraftContent; parseError: string | null; hqDirectSourceNote: string | null };
  storageRows: StorageStandardRow[];
  servingRows: ServingStandardRow[];
  sources: SourceSummary[];
  library: LibraryItem[];
  media: Record<string, MediaInfo>;
  profileNames: Record<string, string>;
  versions: Pick<ManualVersion, "id" | "version_label" | "status" | "published_at">[];
}

export const getManualEditorData = cache(async (manualId: string): Promise<ManualEditorData> => {
  const manual = await getManualOr404(manualId);
  const supabase = await createSupabaseServerClient();

  const [brandRes, storesRes, applRes, draftRes, sourcesRes, versionsRes] = await Promise.all([
    supabase.from("brands").select("*").eq("id", manual.brand_id).single<Brand>(),
    supabase.from("stores").select("*").eq("brand_id", manual.brand_id).order("name").returns<Store[]>(),
    supabase.from("manual_applicability").select("store_id").eq("manual_id", manualId).returns<{ store_id: string }[]>(),
    supabase.from("manual_drafts").select("*").eq("manual_id", manualId).maybeSingle<{
      id: string;
      draft_json: unknown;
      optimistic_version: number;
      hq_direct_source_note: string | null;
    }>(),
    supabase.from("manual_source_submissions").select("submission_id").eq("manual_id", manualId).returns<{ submission_id: string }[]>(),
    supabase
      .from("manual_versions")
      .select("id, version_label, status, published_at")
      .eq("manual_id", manualId)
      .order("published_at", { ascending: false })
      .returns<Pick<ManualVersion, "id" | "version_label" | "status" | "published_at">[]>(),
  ]);
  if (!brandRes.data || !draftRes.data) notFound(); // HQ 가 아니면 draft 가 보이지 않는다

  const draftRow = draftRes.data;
  const { content, error: parseError } = parseDraftContent(draftRow.draft_json);

  const [storageRes, servingRes] = await Promise.all([
    supabase.from("storage_standards").select("*").eq("draft_id", draftRow.id).order("sort_order").returns<StorageStandardRow[]>(),
    supabase.from("serving_standards").select("*").eq("draft_id", draftRow.id).order("sort_order").returns<ServingStandardRow[]>(),
  ]);
  const storageRows = storageRes.data ?? [];
  const servingRows = servingRes.data ?? [];

  // 원본 제출과 미디어 라이브러리
  const sources: SourceSummary[] = [];
  const library: LibraryItem[] = [];
  for (const { submission_id } of sourcesRes.data ?? []) {
    const agg = await getSubmissionAggregate(submission_id).catch(() => null);
    if (!agg) continue;
    const s = agg.submission;
    sources.push({ submission: { id: s.id, title: s.title, capture_mode: s.capture_mode, status: s.status, submitted_at: s.submitted_at } });
    const prepName = new Map(agg.ingredients.filter((i) => i.preparation).map((i) => [i.preparation!.id, i.name]));
    const stepNo = new Map(agg.steps.map((st) => [st.id, st.step_no]));
    for (const m of agg.media) {
      if (m.uploadStatus !== "uploaded") continue;
      const label =
        m.entityType === "submission_preparation"
          ? `${prepName.get(m.entityId) ?? "Ingredient"} · ${m.role.toUpperCase()}`
          : m.entityType === "submission_cooking_step"
            ? `Step ${stepNo.get(m.entityId) ?? "?"}`
            : m.role === "final"
              ? "Final"
              : m.role === "voice_memo"
                ? "Voice memo"
                : "Attachment";
      library.push({ ...m, sourceTitle: s.title, label });
    }
  }

  // 본문/제공기준이 참조하는 미디어 (원본 제출 연결이 끊긴 것 포함)
  const refIds = [
    ...referencedMediaIds({ blocks: content.blocks, serving_standards: [] }),
    ...servingRows.map((r) => r.reference_image_asset_id).filter((x): x is string => !!x),
  ];
  const media = await getMediaInfo([...refIds, ...library.map((l) => l.mediaId)]);

  const profileIds = [...new Set([...storageRows, ...servingRows].map((r) => r.verified_by).filter((x): x is string => !!x))];
  const profileNames: Record<string, string> = {};
  if (profileIds.length) {
    const { data } = await supabase.from("profiles").select("id, name").in("id", profileIds).returns<Pick<Profile, "id" | "name">[]>();
    for (const p of data ?? []) profileNames[p.id] = p.name;
  }

  return {
    manual,
    brand: brandRes.data,
    brandStores: storesRes.data ?? [],
    applicableStoreIds: (applRes.data ?? []).map((a) => a.store_id),
    draft: { id: draftRow.id, version: draftRow.optimistic_version, content, parseError, hqDirectSourceNote: draftRow.hq_direct_source_note },
    storageRows,
    servingRows,
    sources,
    library,
    media,
    profileNames,
    versions: versionsRes.data ?? [],
  };
});

export function assembleFromEditorData(d: ManualEditorData): ManualContent {
  return assembleManualContent({
    manual: d.manual,
    brand: d.brand,
    applicableStores: d.brandStores.filter((s) => d.applicableStoreIds.includes(s.id)),
    draft: d.draft.content,
    storageRows: d.storageRows,
    servingRows: d.servingRows,
    mediaMeta: toMediaMeta(d.media),
    profileNames: d.profileNames,
    sourceSubmissionIds: d.sources.map((s) => s.submission.id),
    hqDirectSourceNote: d.draft.hqDirectSourceNote,
  });
}

/** 발행 버전 조회 (RLS: HQ 전체, 현장은 적용 매장의 published 만) */
export async function getVersion(versionId: string): Promise<ManualVersion | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("manual_versions").select("*").eq("id", versionId).maybeSingle<ManualVersion>();
  return data;
}
