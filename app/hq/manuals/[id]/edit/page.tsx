import { can } from "@/auth/rbac";
import { requireSession } from "@/auth/session";
import { ManualEditor, type LinkableSubmission } from "@/components/hq/editor/manual-editor";
import { WorkflowBar } from "@/components/hq/workflow-bar";
import { assembleFromEditorData, getManualEditorData, toMediaStatus } from "@/db/manuals";
import { createSupabaseServerClient } from "@/db/supabase/server";
import { checkPublish } from "@/validation/publish-checks";

export default async function ManualEditPage({ params }: PageProps<"/hq/manuals/[id]/edit">) {
  const { actor } = await requireSession("hq");
  const { id } = await params;
  const data = await getManualEditorData(id);
  const brandRef = { brandId: data.brand.id, organizationId: data.brand.organization_id };

  const supabase = await createSupabaseServerClient();
  const { data: linkable } = await supabase
    .from("submissions")
    .select("id, title, capture_mode, status")
    .eq("brand_id", data.brand.id)
    .in("status", ["submitted", "in_review", "used"])
    .order("submitted_at", { ascending: false })
    .limit(100)
    .returns<LinkableSubmission[]>();

  const issues = checkPublish({
    content: assembleFromEditorData(data),
    media: toMediaStatus(data.media),
    hasPreviousVersion: Boolean(data.manual.active_version_id),
  });

  return (
    <>
      <WorkflowBar
        manualId={id}
        status={data.manual.review_status}
        reviewComment={data.manual.review_comment}
        canEdit={can(actor, "manual.edit_draft", { brand: brandRef })}
        canApprove={can(actor, "manual.publish", { brand: brandRef })}
        issueCount={issues.length}
      />
      <ManualEditor
        data={data}
        canEdit={can(actor, "manual.edit_draft", { brand: brandRef })}
        canVerify={can(actor, "standards.verify", { brand: brandRef })}
        linkable={linkable ?? []}
      />
    </>
  );
}
