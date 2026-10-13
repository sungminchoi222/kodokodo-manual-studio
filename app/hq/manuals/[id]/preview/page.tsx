import { Planned } from "@/components/planned";

export default function ManualPreviewPage() {
  return (
    <Planned step={3} title="Draft preview">
      Web preview with DRAFT watermark; unconfirmed fields shown as NEEDS HQ CONFIRMATION. PPTX/PDF preview in Step 5.
    </Planned>
  );
}
