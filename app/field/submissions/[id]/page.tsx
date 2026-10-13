import { notFound } from "next/navigation";
import { requireSession } from "@/auth/session";
import { Planned, StatusBadge } from "@/components/planned";
import { createSupabaseServerClient } from "@/db/supabase/server";
import type { Submission } from "@/domain/types";
import { formatDateTime } from "@/lib/format";

export default async function SubmissionDetailPage({ params }: PageProps<"/field/submissions/[id]">) {
  await requireSession("field");
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: submission } = await supabase.from("submissions").select("*").eq("id", id).maybeSingle<Submission>();
  if (!submission) notFound();

  return (
    <>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">{submission.title}</h1>
        <StatusBadge value={submission.status} />
      </div>
      <p className="mt-1 text-sm text-stone-600">
        {submission.capture_mode} · {submission.station} · submitted {formatDateTime(submission.submitted_at)}
      </p>
      {submission.status === "rejected" && submission.rejection_reason && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">Returned: {submission.rejection_reason}</p>
      )}
      <div className="mt-6">
        <Planned step={2} title="Submission detail / continue draft" />
      </div>
    </>
  );
}
