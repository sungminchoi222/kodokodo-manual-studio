import Link from "next/link";
import { StatusBadge } from "@/components/planned";
import { createSupabaseServerClient } from "@/db/supabase/server";
import type { ManualVersion } from "@/domain/types";
import { formatDateTime } from "@/lib/format";

type Row = Pick<ManualVersion, "id" | "version_label" | "locale" | "status" | "approved_at" | "change_log" | "revision_reason" | "content_checksum">;

export default async function ManualVersionsPage({ params }: PageProps<"/hq/manuals/[id]/versions">) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: versions } = await supabase
    .from("manual_versions")
    .select("id, version_label, locale, status, approved_at, change_log, revision_reason, content_checksum")
    .eq("manual_id", id)
    .order("published_at", { ascending: false })
    .returns<Row[]>();

  if (!versions?.length) return <p className="text-sm text-stone-600">No published versions yet.</p>;
  return (
    <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white text-sm">
      {versions.map((v) => (
        <li key={v.id} className="p-4">
          <div className="flex items-center gap-2">
            <Link href={`/hq/manuals/${id}/versions/${v.id}`} className="font-semibold underline">
              {v.version_label}
            </Link>
            <StatusBadge value={v.status} />
            <span className="text-xs text-stone-500">
              {v.locale.toUpperCase()} · {formatDateTime(v.approved_at)} · {v.content_checksum.slice(0, 12)}…
            </span>
          </div>
          <p className="mt-1">{v.change_log}</p>
          {v.revision_reason && <p className="text-xs text-stone-600">Reason: {v.revision_reason}</p>}
        </li>
      ))}
    </ul>
  );
}
