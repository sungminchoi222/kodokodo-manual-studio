// 단계별 개발 중인 화면 자리표시. 해당 Step 구현 시 교체한다.
export function Planned({ step, title, children }: { step: number; title: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-dashed border-stone-300 bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Planned · Step {step}</p>
      <h2 className="mt-1 text-lg font-semibold">{title}</h2>
      {children && <div className="mt-3 text-sm text-stone-700">{children}</div>}
    </section>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const tone: Record<string, string> = {
    draft: "bg-stone-100 text-stone-700",
    submitted: "bg-sky-100 text-sky-800",
    in_review: "bg-amber-100 text-amber-800",
    rejected: "bg-red-100 text-red-800",
    used: "bg-emerald-100 text-emerald-800",
    revision_requested: "bg-red-100 text-red-800",
    pending_approval: "bg-violet-100 text-violet-800",
    published: "bg-emerald-100 text-emerald-800",
    archived: "bg-stone-200 text-stone-600",
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tone[value] ?? "bg-stone-100"}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}
