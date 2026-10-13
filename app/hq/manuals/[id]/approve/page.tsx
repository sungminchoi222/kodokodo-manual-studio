import Link from "next/link";
import { can } from "@/auth/rbac";
import { requireSession } from "@/auth/session";
import { PublishForm } from "@/components/hq/publish-form";
import { assembleFromEditorData, getManualEditorData, toMediaStatus } from "@/db/manuals";
import { nextVersionLabel } from "@/domain/templates";
import { checkPublish } from "@/validation/publish-checks";

export default async function ManualApprovePage({ params }: PageProps<"/hq/manuals/[id]/approve">) {
  const { actor } = await requireSession("hq");
  const { id } = await params;
  const data = await getManualEditorData(id);
  const canPublish = can(actor, "manual.publish", { brand: { brandId: data.brand.id, organizationId: data.brand.organization_id } });
  const issues = checkPublish({
    content: assembleFromEditorData(data),
    media: toMediaStatus(data.media),
    hasPreviousVersion: Boolean(data.manual.active_version_id),
  });
  const labels = data.versions.map((v) => v.version_label);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <section>
        <h2 className="font-semibold">Publish checks</h2>
        {issues.length === 0 ? (
          <p className="mt-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">All required fields are complete and verified.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-stone-600">{issues.length} issue(s) block publishing:</p>
            <ul className="mt-2 space-y-1">
              {issues.map((i, n) => (
                <li key={n} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
                  {i.message}
                </li>
              ))}
            </ul>
            <Link href={`/hq/manuals/${id}/edit`} className="mt-3 inline-block text-sm font-semibold underline">
              Open editor →
            </Link>
          </>
        )}
        <p className="mt-4 text-sm">
          <Link href={`/hq/manuals/${id}/preview`} className="underline">
            Review the draft preview
          </Link>{" "}
          before approving.
        </p>
      </section>
      <aside>
        {canPublish ? (
          <PublishForm
            manualId={id}
            draftVersion={data.draft.version}
            nextMinor={nextVersionLabel(labels, "minor")}
            nextMajor={nextVersionLabel(labels, "major")}
            hasPrevious={Boolean(data.manual.active_version_id)}
            blocked={issues.length > 0}
          />
        ) : (
          <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-700">
            Only an HQ approver can publish. Use “Submit for approval” in the editor when the draft is ready.
          </p>
        )}
      </aside>
    </div>
  );
}
