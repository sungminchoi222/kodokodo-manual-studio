import { requireSession } from "@/auth/session";
import { Planned } from "@/components/planned";

export default async function HqAdminPage() {
  const { brands, stores } = await requireSession("hq");

  return (
    <>
      <h1 className="text-xl font-bold">Brands &amp; stores</h1>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {brands.map((b) => (
          <section key={b.id} className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="font-semibold">
              {b.name} <span className="font-mono text-xs text-stone-500">{b.code}</span>
              {b.is_demo && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-900">DEMO</span>}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-stone-700">
              {stores
                .filter((s) => s.brand_id === b.id)
                .map((s) => (
                  <li key={s.id}>
                    {s.name} <span className="text-xs text-stone-500">({s.timezone})</span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-6">
        <Planned step={7} title="Member & role management">
          System admins assign roles per brand / store.
        </Planned>
      </div>
    </>
  );
}
