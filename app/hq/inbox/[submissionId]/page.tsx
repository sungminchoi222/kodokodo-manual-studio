import { notFound } from "next/navigation";
import { requireSession } from "@/auth/session";
import { Planned, StatusBadge } from "@/components/planned";
import { createSupabaseServerClient } from "@/db/supabase/server";
import type { Submission } from "@/domain/types";
import { formatDateTime } from "@/lib/format";

export default async function HqSubmissionPage({ params }: PageProps<"/hq/inbox/[submissionId]">) {
  await requireSession("hq");
  const { submissionId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: submission } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle<Submission>();
  if (!submission) notFound();

  return (
    <>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">{submission.title}</h1>
        <StatusBadge value={submission.status} />
        {submission.capture_mode === "quick" && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Free-form submission</span>
        )}
      </div>
      <p className="mt-1 text-sm text-stone-600">
        {submission.station} · submitted {formatDateTime(submission.submitted_at)}
      </p>
      <div className="mt-6">
        <Planned step={2} title="Submission review">
          Ingredients, BEFORE / DURING / AFTER photos, specs, cooking steps, final product; return with reason or create a
          manual draft.
        </Planned>
      </div>
    </>
  );
}
