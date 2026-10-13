"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestChanges, submitForApproval } from "@/actions/manuals";
import { Button, TextArea } from "@/components/ui/form";

export function WorkflowBar({
  manualId,
  status,
  reviewComment,
  canEdit,
  canApprove,
  issueCount,
}: {
  manualId: string;
  status: string;
  reviewComment: string | null;
  canEdit: boolean;
  canApprove: boolean;
  issueCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [comment, setComment] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mb-4 space-y-2">
      {status === "revision_requested" && reviewComment && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          <strong>Changes requested:</strong> {reviewComment}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && status !== "pending_approval" && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await submitForApproval(manualId);
                if (!r.ok) setError(r.error);
                router.refresh();
              })
            }
          >
            Submit for approval{issueCount ? ` (${issueCount} open issues)` : ""}
          </Button>
        )}
        {status === "pending_approval" && <span className="text-sm font-semibold text-violet-800">Waiting for approval</span>}
        {canApprove && !asking && status !== "published" && (
          <Button variant="ghost" onClick={() => setAsking(true)}>
            Request changes
          </Button>
        )}
      </div>
      {asking && (
        <div className="max-w-xl space-y-2">
          <TextArea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What needs to change?" rows={2} />
          <div className="flex gap-2">
            <Button
              disabled={pending || !comment.trim()}
              onClick={() =>
                start(async () => {
                  const r = await requestChanges(manualId, comment);
                  if (!r.ok) setError(r.error);
                  else {
                    setAsking(false);
                    setComment("");
                  }
                  router.refresh();
                })
              }
            >
              Send
            </Button>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
