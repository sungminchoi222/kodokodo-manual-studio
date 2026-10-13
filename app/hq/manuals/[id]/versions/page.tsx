import { createSupabaseServerClient } from "@/db/supabase/server";
import type { ManualVersion } from "@/domain/types";
import { formatDateTime } from "@/lib/format";

export default async function ManualVersionsPage({ params }: PageProps<"/hq/manuals/[id]/versions">) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: versions } = await supabase
    .from("manual_versions")
    .select("id, version_label, locale, status, approved_at, published_at, change_log, content_checksum")
    .eq("manual_id", id)
    .order("published_at", { ascending: false })
    .returns<Pick<ManualVersion, "id" | "version_label" | "locale" | "status" | "approved_at" | "published_at" | "change_log" | "content_checksum">[]>();

  if (!versions?.length) {
    return <p className="text-sm text-stone-600">No published versions yet.</p>;
  }
  return (
    <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white text-sm">
      {versions.map((v) => (
        <li key={v.id} className="p-4">
          <p className="font-medium">
            {v.version_label} · {v.locale.toUpperCase()} · {v.status}
          </p>
          <p className="text-xs text-stone-500">
            Approved {formatDateTime(v.approved_at)} · checksum {v.content_checksum.slice(0, 12)}…
          </p>
          <p className="mt-1">{v.change_log}</p>
        </li>
      ))}
    </ul>
  );
}
