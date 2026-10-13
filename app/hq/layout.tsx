import { requireSession } from "@/auth/session";
import { availableAreas } from "@/auth/rbac";
import { AreaHeader } from "@/components/area-header";

export default async function HqLayout({ children }: LayoutProps<"/hq">) {
  const session = await requireSession("hq");
  const areas = availableAreas(session.actor);

  return (
    <>
      <AreaHeader
        area="HQ"
        userName={session.profile.name}
        nav={[
          { href: "/hq/inbox", label: "Inbox" },
          { href: "/hq/manuals", label: "Manuals" },
          { href: "/hq/exports", label: "Exports" },
          { href: "/hq/admin", label: "Admin" },
        ]}
        switchTo={areas.field ? { href: "/field", label: "Go to Field" } : undefined}
      />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
