import Link from "next/link";
import { requireSession } from "@/auth/session";
import { Planned } from "@/components/planned";

export default async function NewSubmissionPage({ searchParams }: PageProps<"/field/submissions/new">) {
  await requireSession("field");
  const { mode } = await searchParams;
  const current = mode === "quick" ? "quick" : "guided";

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
      <div className="mt-6">
        {current === "guided" ? (
          <Planned step={2} title="Guided capture wizard">
            Basics → Ingredient list → BEFORE / DURING / AFTER per ingredient → Cooking steps → Final product → Review &amp; submit.
            Draft save and upload retry.
          </Planned>
        ) : (
          <Planned step={2} title="Quick capture">
            Title, store, station, multiple photos/videos, text or voice memo, related manual.
          </Planned>
        )}
      </div>
    </>
  );
}
