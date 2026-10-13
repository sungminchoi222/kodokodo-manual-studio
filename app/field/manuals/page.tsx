import Link from "next/link";
import { requireSession } from "@/auth/session";
import { createSupabaseServerClient } from "@/db/supabase/server";
import type { Manual } from "@/domain/types";

export default async function FieldManualsPage() {
  await requireSession("field");
  const supabase = await createSupabaseServerClient();
  // RLS: 현장 역할은 적용 매장의 승인본(active_version_id 존재)만 조회된다. 초안은 노출되지 않는다.
  const { data: manuals, error } = await supabase
    .from("manuals")
    .select("*")
    .not("active_version_id", "is", null)
    .is("archived_at", null)
    .order("title")
    .returns<Manual[]>();

  return (
    <>
      <h1 className="text-xl font-bold">Manuals</h1>
      {error && <p className="mt-4 text-sm text-red-700">Could not load manuals.</p>}
      {manuals?.length === 0 && <p className="mt-4 text-sm text-stone-600">No approved manuals yet.</p>}
      <ul className="mt-4 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
        {manuals?.map((m) => (
          <li key={m.id}>
            <Link href={`/field/manuals/${m.id}`} className="block p-4">
              <p className="font-medium">{m.title}</p>
              <p className="text-xs text-stone-500">
                {m.document_code} · {m.station}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
