import { Planned } from "@/components/planned";

export default function ManualApprovePage() {
  return (
    <Planned step={3} title="Publish checks & approval">
      Validates required fields (missing photos without N/A reason, unverified temperature / shelf life, invalid units,
      unapproved translations), then creates an immutable version snapshot.
    </Planned>
  );
}
