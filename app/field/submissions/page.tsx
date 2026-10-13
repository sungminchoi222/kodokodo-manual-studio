import Link from "next/link";
import { requireSession } from "@/auth/session";
import { StatusBadge } from "@/components/planned";
import { createSupabaseServerClient } from "@/db/supabase/server";
import type { Submission } from "@/domain/types";
import { formatDateTime } from "@/lib/format";

export default async function MySubmissionsPage() {
  const { actor } = await requireSession("field");
  const supabase = await createSupabaseServerClient();
  const { data: submissions, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("submitted_by", actor.userId)
    .order("updated_at", { ascending: false })
    .returns<Submission[]>();

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">My submissions</h1>
        <Link href="/field/submissions/new?mode=guided" className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white">
          New
        </Link>
      </div>
      {error && <p className="mt-4 text-sm text-red-700">Could not load submissions.</p>}
      {submissions?.length === 0 && <p className="mt-4 text-sm text-stone-600">No submissions yet.</p>}
      <ul className="mt-4 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
        {submissions?.map((s) => (
          <li key={s.id}>
            <Link href={`/field/submissions/${s.id}`} className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="text-xs text-stone-500">
                  {s.capture_mode} · {s.station} · {formatDateTime(s.submitted_at ?? s.updated_at)}
                </p>
              </div>
              <StatusBadge value={s.status} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
