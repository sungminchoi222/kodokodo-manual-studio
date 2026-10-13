"use client";

import { useState, useTransition } from "react";
import { publishManual } from "@/actions/manuals";
import { Button, Field, Select, TextArea } from "@/components/ui/form";
import type { PublishIssue } from "@/validation/publish-checks";

export function PublishForm({
  manualId,
  draftVersion,
  nextMinor,
  nextMajor,
  hasPrevious,
  blocked,
}: {
  manualId: string;
  draftVersion: number;
  nextMinor: string;
  nextMajor: string;
  hasPrevious: boolean;
  blocked: boolean;
}) {
  const [f, setF] = useState({ change_log: hasPrevious ? "" : "Initial release", revision_reason: "", approval_comment: "", bump: "minor" as "minor" | "major" });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<PublishIssue[]>([]);

  return (
    <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="font-semibold">Approve &amp; publish</h2>
      {hasPrevious && (
        <Field label="Version">
          <Select value={f.bump} onChange={(e) => setF({ ...f, bump: e.target.value as "minor" | "major" })}>
            <option value="minor">{nextMinor} (minor revision)</option>
            <option value="major">{nextMajor} (major revision)</option>
          </Select>
        </Field>
      )}
      {!hasPrevious && <p className="text-sm">Version: <strong>{nextMinor}</strong></p>}
      <Field label="Change log (required)">
        <TextArea value={f.change_log} onChange={(e) => setF({ ...f, change_log: e.target.value })} rows={2} />
      </Field>
      {hasPrevious && (
        <Field label="Revision reason (required)">
          <TextArea value={f.revision_reason} onChange={(e) => setF({ ...f, revision_reason: e.target.value })} rows={2} />
        </Field>
      )}
      <Field label="Approval comment (optional)">
        <TextArea value={f.approval_comment} onChange={(e) => setF({ ...f, approval_comment: e.target.value })} rows={2} />
      </Field>
      <p className="text-xs text-stone-600">
        Publishing creates an immutable snapshot. Later draft edits never change this version; corrections are published as a new version.
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {issues.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-red-700">
          {issues.map((i, n) => (
            <li key={n}>{i.message}</li>
          ))}
        </ul>
      )}
      <Button
        disabled={pending || blocked}
        className="w-full"
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await publishManual(manualId, { expectedDraftVersion: draftVersion, ...f });
            if (r && !r.ok) {
              setError(r.error);
              setIssues(r.issues ?? []);
            }
          })
        }
      >
        {pending ? "Publishing…" : blocked ? "Fix the issues above first" : "Approve & publish"}
      </Button>
    </div>
  );
}
