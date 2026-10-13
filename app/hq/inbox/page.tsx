import Link from "next/link";
import { requireSession } from "@/auth/session";
import { StatusBadge } from "@/components/planned";
import { createSupabaseServerClient } from "@/db/supabase/server";
import type { Submission } from "@/domain/types";
import { formatDateTime } from "@/lib/format";

export default async function HqInboxPage() {
  const { brands, stores } = await requireSession("hq");
  const supabase = await createSupabaseServerClient();
  // RLS: HQ 는 담당 브랜드의 제출된 건만 (작성자의 임시저장은 보이지 않음)
  const { data: submissions, error } = await supabase
    .from("submissions")
    .select("*")
    .neq("status", "draft")
    .order("submitted_at", { ascending: false })
    .limit(200)
    .returns<Submission[]>();

  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));

  return (
    <>
      <h1 className="text-xl font-bold">Inbox</h1>
      <p className="mt-1 text-sm text-stone-600">Field submissions for your brands. Filters and review actions arrive in Step 2.</p>
      {error && <p className="mt-4 text-sm text-red-700">Could not load submissions.</p>}
      <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Mode</th>
              <th className="px-4 py-2">Brand / Store</th>
              <th className="px-4 py-2">Station</th>
              <th className="px-4 py-2">Submitted</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {submissions?.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2">
                  <Link href={`/hq/inbox/${s.id}`} className="font-medium underline-offset-2 hover:underline">
                    {s.title}
                  </Link>
                </td>
                <td className="px-4 py-2">{s.capture_mode}</td>
                <td className="px-4 py-2">
                  {brandName.get(s.brand_id) ?? "—"} / {storeName.get(s.store_id) ?? "—"}
                </td>
                <td className="px-4 py-2">{s.station}</td>
                <td className="px-4 py-2">{formatDateTime(s.submitted_at)}</td>
                <td className="px-4 py-2">
                  <StatusBadge value={s.status} />
                </td>
              </tr>
            ))}
            {submissions?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-stone-500">
                  No submissions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
