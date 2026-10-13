"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteDraft, submitSubmission } from "@/actions/submissions";
import { Button } from "@/components/ui/form";
import type { CheckIssue } from "@/validation/submit-checks";

export function ReviewPanel({ submissionId, issues, mode }: { submissionId: string; issues: CheckIssue[]; mode: "quick" | "guided" }) {
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  const link = (i: CheckIssue) => {
    if (mode === "quick") return null;
    const step = i.step === "media" ? "review" : i.step;
    return `/field/submissions/${submissionId}?step=${step}${i.ingredientId ? `#ing-${i.ingredientId}` : ""}`;
  };

  return (
    <div className="space-y-4">
      {issues.length === 0 && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Everything looks complete.</p>}
      {errors.length > 0 && (
        <div className="rounded-lg bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-900">Must fix before submitting</p>
          <IssueList issues={errors} link={link} />
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">Missing items (HQ will see this list)</p>
          <IssueList issues={warnings} link={link} />
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-5 w-5" />
            I checked these items and want to submit anyway.
          </label>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={pending || errors.length > 0 || (warnings.length > 0 && !ack)}
          onClick={() =>
            start(async () => {
              const r = await submitSubmission(submissionId, ack);
              if (r && !r.ok) setError(r.error);
            })
          }
          className="flex-1"
        >
          {pending ? "Submitting…" : "Submit to HQ"}
        </Button>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() =>
            confirm("Delete this draft? Uploaded files are kept for audit but removed from the draft.") &&
            start(async () => {
              const r = await deleteDraft(submissionId);
              if (r && !r.ok) setError(r.error);
            })
          }
        >
          Delete draft
        </Button>
      </div>
      <p className="text-xs text-stone-500">Your draft is saved. You can leave and continue later from My submissions.</p>
    </div>
  );
}

function IssueList({ issues, link }: { issues: CheckIssue[]; link: (i: CheckIssue) => string | null }) {
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
      {issues.map((i, n) => {
        const href = link(i);
        return <li key={`${i.code}-${n}`}>{href ? <Link href={href} className="underline">{i.message}</Link> : i.message}</li>;
      })}
    </ul>
  );
}
