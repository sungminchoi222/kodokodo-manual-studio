import { requireSession } from "@/auth/session";
import { Planned } from "@/components/planned";

export default async function HqExportsPage() {
  await requireSession("hq");
  return (
    <>
      <h1 className="text-xl font-bold">Exports</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Planned step={5} title="Individual PPTX / PDF">
          One approved version → editable PPTX (16:9) or searchable A4 PDF.
        </Planned>
        <Planned step={6} title="Combined PPTX / PDF">
          Select 2+ approved versions, reorder, cover + table of contents, export history.
        </Planned>
      </div>
    </>
  );
}
