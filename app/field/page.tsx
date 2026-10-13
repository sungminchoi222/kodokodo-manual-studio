import Link from "next/link";
import { requireSession } from "@/auth/session";

export default async function FieldHomePage() {
  const { profile } = await requireSession("field");

  const cards = [
    { href: "/field/manuals", title: "View manuals", body: "Approved manuals for your store." },
    { href: "/field/submissions/new?mode=guided", title: "New guided capture", body: "Ingredients → prep photos → cooking steps → final product." },
    { href: "/field/submissions/new?mode=quick", title: "New quick capture", body: "Send photos, video and notes freely." },
    { href: "/field/submissions", title: "My submissions", body: "Drafts and submitted captures." },
  ];

  return (
    <>
      <h1 className="text-xl font-bold">Hello, {profile.name}</h1>
      <div className="mt-6 grid gap-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="rounded-xl border border-stone-200 bg-white p-4 active:bg-stone-100">
            <p className="font-semibold">{c.title}</p>
            <p className="mt-0.5 text-sm text-stone-600">{c.body}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
