import Link from "next/link";
import { requireSession } from "@/auth/session";
import { StatusBadge } from "@/components/planned";
import { createSupabaseServerClient } from "@/db/supabase/server";
import { CAPTURE_MODES, SUBMISSION_STATUSES } from "@/domain/enums";
import type { Profile, Submission } from "@/domain/types";
import { formatDateTime } from "@/lib/format";

const OPEN_STATUSES = ["submitted", "in_review"] as const;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function HqInboxPage({ searchParams }: PageProps<"/hq/inbox">) {
  const { brands, stores } = await requireSession("hq");
  const sp = await searchParams;
  const filter = {
    brand: one(sp.brand),
    store: one(sp.store),
    station: one(sp.station).trim(),
    mode: one(sp.mode),
    status: one(sp.status) || "open",
  };

  const supabase = await createSupabaseServerClient();
  // RLS: HQ 는 담당 브랜드의 제출된 건만 (작성자의 임시저장은 보이지 않음)
  let query = supabase.from("submissions").select("*").neq("status", "draft");
  if (filter.status === "open") query = query.in("status", OPEN_STATUSES);
  else if ((SUBMISSION_STATUSES as readonly string[]).includes(filter.status)) query = query.eq("status", filter.status);
  if (filter.brand) query = query.eq("brand_id", filter.brand);
  if (filter.store) query = query.eq("store_id", filter.store);
  if ((CAPTURE_MODES as readonly string[]).includes(filter.mode)) query = query.eq("capture_mode", filter.mode);
  if (filter.station) query = query.ilike("station", `%${filter.station.replace(/[%_]/g, "")}%`);
  const { data: submissions, error } = await query.order("submitted_at", { ascending: false }).limit(200).returns<Submission[]>();

  const submitterIds = [...new Set((submissions ?? []).map((s) => s.submitted_by))];
  const { data: profiles } = submitterIds.length
    ? await supabase.from("profiles").select("id, name").in("id", submitterIds).returns<Pick<Profile, "id" | "name">[]>()
    : { data: [] };

  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const personName = new Map((profiles ?? []).map((p) => [p.id, p.name]));
  const selectCls = "rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm";

  return (
    <>
      <h1 className="text-xl font-bold">Inbox</h1>
      <form className="mt-4 flex flex-wrap items-end gap-2" method="get">
        <select name="status" defaultValue={filter.status} className={selectCls} aria-label="Status">
          <option value="open">Open (submitted + in review)</option>
          {SUBMISSION_STATUSES.filter((s) => s !== "draft").map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        {brands.length > 1 && (
          <select name="brand" defaultValue={filter.brand} className={selectCls} aria-label="Brand">
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <select name="store" defaultValue={filter.store} className={selectCls} aria-label="Store">
          <option value="">All stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {brands.length > 1 ? `${brandName.get(s.brand_id)} · ` : ""}
              {s.name}
            </option>
          ))}
        </select>
        <select name="mode" defaultValue={filter.mode} className={selectCls} aria-label="Capture mode">
          <option value="">Guided + quick</option>
          <option value="guided">Guided</option>
          <option value="quick">Quick</option>
        </select>
        <input name="station" defaultValue={filter.station} placeholder="Station" className={`${selectCls} w-32`} />
        <button className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-semibold text-white">Filter</button>
        <Link href="/hq/inbox" className="px-1 text-sm underline">
          Reset
        </Link>
      </form>

      {error && <p className="mt-4 text-sm text-red-700">Could not load submissions.</p>}
      <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Mode</th>
              <th className="px-4 py-2">Brand / Store</th>
              <th className="px-4 py-2">Station</th>
              <th className="px-4 py-2">By</th>
              <th className="px-4 py-2">Submitted</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {submissions?.map((s) => {
              const store = storeById.get(s.store_id);
              return (
                <tr key={s.id}>
                  <td className="px-4 py-2">
                    <Link href={`/hq/inbox/${s.id}`} className="font-medium underline-offset-2 hover:underline">
                      {s.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    {s.capture_mode === "quick" ? <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">quick</span> : "guided"}
                  </td>
                  <td className="px-4 py-2">
                    {brandName.get(s.brand_id) ?? "—"} / {store?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2">{s.station}</td>
                  <td className="px-4 py-2">{personName.get(s.submitted_by) ?? "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(s.submitted_at, store?.timezone)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge value={s.status} />
                  </td>
                </tr>
              );
            })}
            {submissions?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-stone-500">
                  No submissions match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
