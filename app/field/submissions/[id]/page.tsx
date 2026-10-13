import Link from "next/link";
import { requireSession } from "@/auth/session";
import { BasicsStep, FinalStep, IngredientsStep, PrepStep, StepsStep } from "@/components/field/guided-steps";
import { QuickEditor } from "@/components/field/quick-editor";
import { ReviewPanel } from "@/components/field/review-panel";
import { StatusBadge } from "@/components/planned";
import { SubmissionView } from "@/components/submission-view";
import { getSubmissionAggregate, toCheckInput } from "@/db/submissions";
import { createSupabaseServerClient } from "@/db/supabase/server";
import type { Manual } from "@/domain/types";
import { formatDateTime } from "@/lib/format";
import { checkSubmission } from "@/validation/submit-checks";

const GUIDED_STEPS = [
  { key: "basics", label: "Basics" },
  { key: "ingredients", label: "Ingredients" },
  { key: "prep", label: "Prep photos" },
  { key: "steps", label: "Cooking steps" },
  { key: "final", label: "Final product" },
  { key: "review", label: "Review & submit" },
] as const;
type StepKey = (typeof GUIDED_STEPS)[number]["key"];

export default async function SubmissionPage({ params, searchParams }: PageProps<"/field/submissions/[id]">) {
  const { actor } = await requireSession("field");
  const { id } = await params;
  const { step: stepParam } = await searchParams;
  const agg = await getSubmissionAggregate(id);
  const s = agg.submission;
  const editable = s.status === "draft" && s.submitted_by === actor.userId;

  const header = (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{s.title}</h1>
        <StatusBadge value={s.status} />
      </div>
      <p className="mt-1 text-sm text-stone-600">
        {s.capture_mode === "guided" ? "Guided capture" : "Quick capture"} · {s.station}
        {s.submitted_at && ` · submitted ${formatDateTime(s.submitted_at)}`}
      </p>
      {s.status === "rejected" && s.rejection_reason && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          Returned by HQ: {s.rejection_reason}
          <br />
          <Link href={`/field/submissions/new?mode=${s.capture_mode}`} className="font-semibold underline">
            Start a new submission
          </Link>
        </p>
      )}
    </div>
  );

  if (!editable) {
    return (
      <>
        {header}
        <SubmissionView agg={agg} />
      </>
    );
  }

  const issues = checkSubmission(toCheckInput(agg));

  if (s.capture_mode === "quick") {
    const supabase = await createSupabaseServerClient();
    const { data: manuals } = await supabase
      .from("manuals")
      .select("id, title, document_code")
      .not("active_version_id", "is", null)
      .eq("brand_id", s.brand_id)
      .order("title")
      .returns<Pick<Manual, "id" | "title" | "document_code">[]>();
    return (
      <>
        {header}
        <QuickEditor
          submission={s}
          media={agg.media}
          manuals={(manuals ?? []).map((m) => ({ id: m.id, label: `${m.document_code} · ${m.title}` }))}
        />
        <section className="mt-6 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">Review & submit</h2>
          <ReviewPanel submissionId={s.id} issues={issues} mode="quick" />
        </section>
      </>
    );
  }

  const step: StepKey = GUIDED_STEPS.some((g) => g.key === stepParam) ? (stepParam as StepKey) : "basics";
  const idx = GUIDED_STEPS.findIndex((g) => g.key === step);
  const next = GUIDED_STEPS[idx + 1];
  const prev = GUIDED_STEPS[idx - 1];
  const stepIssues = (key: StepKey) => issues.filter((i) => i.step === key).length;

  return (
    <>
      {header}
      <nav className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1 text-sm">
        {GUIDED_STEPS.map((g, n) => (
          <Link
            key={g.key}
            href={`/field/submissions/${s.id}?step=${g.key}`}
            className={`shrink-0 rounded-full border px-3 py-1.5 ${g.key === step ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}
          >
            {n + 1}. {g.label}
            {g.key !== "review" && stepIssues(g.key) > 0 && <span className="ml-1 text-amber-500">•</span>}
          </Link>
        ))}
      </nav>

      <div className={step === "prep" || step === "steps" ? "" : "rounded-xl border border-stone-200 bg-white p-4"}>
        {step === "basics" && <BasicsStep submission={s} />}
        {step === "ingredients" && <IngredientsStep submissionId={s.id} ingredients={agg.ingredients} />}
        {step === "prep" && <PrepStep submissionId={s.id} ingredients={agg.ingredients} media={agg.media} />}
        {step === "steps" && <StepsStep submissionId={s.id} steps={agg.steps} media={agg.media} />}
        {step === "final" && <FinalStep submission={s} media={agg.media} />}
        {step === "review" && <ReviewPanel submissionId={s.id} issues={issues} mode="guided" />}
      </div>

      <div className="mt-6 flex justify-between text-sm">
        {prev ? (
          <Link href={`/field/submissions/${s.id}?step=${prev.key}`} className="underline">
            ← {prev.label}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/field/submissions/${s.id}?step=${next.key}`} className="rounded-lg bg-stone-900 px-4 py-2.5 font-semibold text-white">
            Next: {next.label} →
          </Link>
        )}
      </div>
      <p className="mt-3 text-xs text-stone-500">Changes save automatically when you leave a section. Photos are saved as soon as they upload.</p>
    </>
  );
}
