import { requireSession } from "@/auth/session";
import { availableAreas } from "@/auth/rbac";
import { AreaHeader } from "@/components/area-header";

export default async function FieldLayout({ children }: LayoutProps<"/field">) {
  const session = await requireSession("field");
  const areas = availableAreas(session.actor);

  return (
    <>
      <AreaHeader
        area="Field"
        userName={session.profile.name}
        nav={[
          { href: "/field/manuals", label: "Manuals" },
          { href: "/field/submissions", label: "My submissions" },
        ]}
        switchTo={areas.hq ? { href: "/hq/inbox", label: "Go to HQ" } : undefined}
      />
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </>
  );
}
