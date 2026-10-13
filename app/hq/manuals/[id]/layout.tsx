import Link from "next/link";
import { requireSession } from "@/auth/session";
import { StatusBadge } from "@/components/planned";
import { getManualOr404 } from "@/db/manuals";

export default async function HqManualLayout({ children, params }: LayoutProps<"/hq/manuals/[id]">) {
  await requireSession("hq");
  const { id } = await params;
  const manual = await getManualOr404(id);

  const tabs = [
    { href: `/hq/manuals/${id}/edit`, label: "Edit" },
    { href: `/hq/manuals/${id}/preview`, label: "Preview" },
    { href: `/hq/manuals/${id}/approve`, label: "Approve" },
    { href: `/hq/manuals/${id}/versions`, label: "Versions" },
  ];

  return (
    <>
      <p className="font-mono text-xs text-stone-500">{manual.document_code}</p>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">{manual.title}</h1>
        <StatusBadge value={manual.review_status} />
      </div>
      <nav className="mt-4 flex gap-4 border-b border-stone-200 text-sm">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className="-mb-px border-b-2 border-transparent pb-2 hover:border-stone-400">
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">{children}</div>
    </>
  );
}
