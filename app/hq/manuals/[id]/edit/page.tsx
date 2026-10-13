import { Planned } from "@/components/planned";

export default function ManualEditPage() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr_1.3fr]">
      <Planned step={3} title="Media & Submissions">
        Source submissions and media library to place into steps.
      </Planned>
      <Planned step={3} title="Manual Builder">
        Block editor: heading, paragraph, ingredient table, photo trio, video, step, warning.
      </Planned>
      <Planned step={3} title="Product Standards / Publish Checks">
        Storage &amp; shelf life per product state, serving &amp; quality, approval &amp; publication.
      </Planned>
    </div>
  );
}
