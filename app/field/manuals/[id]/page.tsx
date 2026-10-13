import { notFound } from "next/navigation";
import { requireSession } from "@/auth/session";
import { ManualDocument } from "@/components/manual-document";
import { getManualOr404, getMediaInfo, getVersion } from "@/db/manuals";
import { readSnapshot } from "@/manual/snapshot";

/** 현장: 현재 승인본(active version)의 스냅샷만 표시. 초안은 RLS 로 접근 불가. */
export default async function FieldManualPage({ params }: PageProps<"/field/manuals/[id]">) {
  await requireSession("field");
  const { id } = await params;
  const manual = await getManualOr404(id);
  if (!manual.active_version_id) notFound();
  const version = await getVersion(manual.active_version_id);
  if (!version || version.status !== "published") notFound();
  const { content, error } = readSnapshot(version.content_snapshot_json);
  if (!content) return <p className="text-sm text-red-700">This manual cannot be displayed ({error}). Contact HQ.</p>;
  const media = await getMediaInfo(Object.keys(content.media));

  return (
    <div className="-mx-4 sm:mx-0">
      <ManualDocument content={content} media={media} mode="published" />
    </div>
  );
}
