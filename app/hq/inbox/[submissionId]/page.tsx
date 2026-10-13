import Link from "next/link";
import { requireSession } from "@/auth/session";
import { ReviewActions } from "@/components/hq/review-actions";
import { StatusBadge } from "@/components/planned";
import { SubmissionView } from "@/components/submission-view";
import { getSubmissionAggregate, toCheckInput } from "@/db/submissions";
import { formatDateTime } from "@/lib/format";
import { checkSubmission } from "@/validation/submit-checks";

export default async function HqSubmissionPage({ params }: PageProps<"/hq/inbox/[submissionId]">) {
  const { stores, brands } = await requireSession("hq");
  const { submissionId } = await params;
  const agg = await getSubmissionAggregate(submissionId);
  const s = agg.submission;
  const issues = checkSubmission(toCheckInput(agg));
  const store = stores.find((x) => x.id === s.store_id);
  const brand = brands.find((b) => b.id === s.brand_id);

  return (
    <>
      <Link href="/hq/inbox" className="text-sm underline">
        ← Inbox
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{s.title}</h1>
        <StatusBadge value={s.status} />
        {s.capture_mode === "quick" && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Free-form submission</span>
        )}
      </div>
      <p className="mt-1 text-sm text-stone-600">
        {brand?.name} / {store?.name} · {s.station} · by {agg.submitter?.name ?? "—"} · submitted{" "}
        {formatDateTime(s.submitted_at, store?.timezone)}
      </p>
      {s.status === "rejected" && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-800">Returned: {s.rejection_reason}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          {issues.length > 0 && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Missing at submission ({issues.length})</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-amber-900">
                {issues.map((i, n) => (
                  <li key={n}>{i.message}</li>
                ))}
              </ul>
            </section>
          )}
          <SubmissionView agg={agg} />
        </div>
        <aside>
          <ReviewActions
            submissionId={s.id}
            status={s.status}
            defaultTitle={s.title}
            defaultStation={s.station}
            defaultType={s.capture_mode === "guided" ? "recipe" : "service_sop"}
          />
        </aside>
      </div>
    </>
  );
}
