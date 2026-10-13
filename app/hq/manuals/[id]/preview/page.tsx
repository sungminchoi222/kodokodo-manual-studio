import { requireSession } from "@/auth/session";
import { ManualDocument } from "@/components/manual-document";
import { assembleFromEditorData, getManualEditorData } from "@/db/manuals";

export default async function ManualPreviewPage({ params }: PageProps<"/hq/manuals/[id]/preview">) {
  await requireSession("hq");
  const { id } = await params;
  const data = await getManualEditorData(id);
  const content = assembleFromEditorData(data);

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-3 text-sm text-stone-600">
        Preview of the current draft. Unconfirmed values show <strong>NEEDS HQ CONFIRMATION</strong>. PPTX / PDF preview arrives with the export
        engine (Step 5).
      </p>
      <ManualDocument content={content} media={data.media} mode="draft" />
    </div>
  );
}
