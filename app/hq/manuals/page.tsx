import Link from "next/link";
import { isHq } from "@/auth/rbac";
import { requireSession } from "@/auth/session";
import { NewManualForm } from "@/components/hq/new-manual-form";
import { StatusBadge } from "@/components/planned";
import { createSupabaseServerClient } from "@/db/supabase/server";
import type { Manual } from "@/domain/types";

export default async function HqManualsPage() {
  const { brands, actor } = await requireSession("hq");
  const supabase = await createSupabaseServerClient();
  const { data: manuals, error } = await supabase
    .from("manuals")
    .select("*")
    .is("archived_at", null)
    .order("document_code")
    .returns<Manual[]>();
  const brandName = new Map(brands.map((b) => [b.id, b.name]));

  return (
    <>
      <h1 className="text-xl font-bold">Manuals</h1>
      <div className="mt-4">
        <NewManualForm brands={brands.filter((b) => isHq(actor, { brandId: b.id, organizationId: b.organization_id })).map((b) => ({ id: b.id, name: b.name }))} />
      </div>
      {error && <p className="mt-4 text-sm text-red-700">Could not load manuals.</p>}
      <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Brand</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Station</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {manuals?.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2 font-mono text-xs">{m.document_code}</td>
                <td className="px-4 py-2">
                  <Link href={`/hq/manuals/${m.id}/edit`} className="font-medium hover:underline">
                    {m.title}
                  </Link>
                </td>
                <td className="px-4 py-2">{brandName.get(m.brand_id) ?? "—"}</td>
                <td className="px-4 py-2">{m.manual_type.replace(/_/g, " ")}</td>
                <td className="px-4 py-2">{m.station}</td>
                <td className="px-4 py-2">
                  <StatusBadge value={m.review_status} />
                </td>
              </tr>
            ))}
            {manuals?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-stone-500">
                  No manuals yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
