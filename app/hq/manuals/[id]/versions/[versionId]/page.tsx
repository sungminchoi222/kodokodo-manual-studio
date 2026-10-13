import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/auth/session";
import { StatusBadge } from "@/components/planned";
import { ManualDocument } from "@/components/manual-document";
import { getMediaInfo, getVersion } from "@/db/manuals";
import { formatDateTime } from "@/lib/format";
import { readSnapshot } from "@/manual/snapshot";

export default async function VersionPage({ params }: PageProps<"/hq/manuals/[id]/versions/[versionId]">) {
  await requireSession("hq");
  const { id, versionId } = await params;
  const version = await getVersion(versionId);
  if (!version || version.manual_id !== id) notFound();
  const { content, error } = readSnapshot(version.content_snapshot_json);
  const media = content ? await getMediaInfo(Object.keys(content.media)) : {};

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={`/hq/manuals/${id}/versions`} className="text-sm underline">
        ← All versions
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <strong className="text-lg">{version.version_label}</strong>
        <StatusBadge value={version.status} />
        <span className="text-stone-600">
          {version.locale.toUpperCase()} · approved {formatDateTime(version.approved_at)} · checksum{" "}
          <code className="text-xs">{version.content_checksum.slice(0, 16)}…</code>
        </span>
      </div>
      {version.approval_comment && <p className="mt-1 text-sm text-stone-700">Approval comment: {version.approval_comment}</p>}
      <div className="mt-4">
        {content ? (
          <ManualDocument content={content} media={media} mode="published" />
        ) : (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">This snapshot cannot be displayed ({error}).</p>
        )}
      </div>
    </div>
  );
}
