import Link from "next/link";
import { storeRoles } from "@/auth/rbac";
import { requireSession } from "@/auth/session";
import { NewSubmissionForm } from "@/components/field/new-submission-form";

export default async function NewSubmissionPage({ searchParams }: PageProps<"/field/submissions/new">) {
  const { actor, stores, brands } = await requireSession("field");
  const { mode } = await searchParams;
  const current = mode === "quick" ? "quick" : "guided";

  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const myStores = stores
    .filter((s) => s.status === "active" && storeRoles(actor, s.id).size > 0)
    .map((s) => ({ id: s.id, label: `${brandName.get(s.brand_id) ?? ""} · ${s.name}` }));

  return (
    <>
      <h1 className="text-xl font-bold">New submission</h1>
      <div className="mt-4 inline-flex rounded-lg border border-stone-300 bg-white p-1 text-sm">
        {(["guided", "quick"] as const).map((m) => (
          <Link
            key={m}
            href={`/field/submissions/new?mode=${m}`}
            className={`rounded-md px-3 py-1.5 ${m === current ? "bg-stone-900 text-white" : ""}`}
          >
            {m === "guided" ? "Guided capture" : "Quick capture"}
          </Link>
        ))}
      </div>
      <p className="mt-3 text-sm text-stone-600">
        {current === "guided"
          ? "Step by step: ingredients → BEFORE / DURING / AFTER prep photos → cooking steps → final product."
          : "Send photos, videos, notes or a voice memo freely. HQ will organise it."}
      </p>
      <div className="mt-6">
        {myStores.length === 0 ? (
          <p className="text-sm text-red-700">You are not assigned to a store.</p>
        ) : (
          <NewSubmissionForm key={current} mode={current} stores={myStores} />
        )}
      </div>
    </>
  );
}
