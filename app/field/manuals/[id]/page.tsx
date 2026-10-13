import { notFound } from "next/navigation";
import { requireSession } from "@/auth/session";
import { Planned } from "@/components/planned";
import { createSupabaseServerClient } from "@/db/supabase/server";
import type { Manual } from "@/domain/types";

export default async function FieldManualPage({ params }: PageProps<"/field/manuals/[id]">) {
  await requireSession("field");
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: manual } = await supabase.from("manuals").select("*").eq("id", id).maybeSingle<Manual>();
  // RLS 로 걸러진 경우와 존재하지 않는 경우를 구분하지 않는다 (존재 여부 노출 방지)
  if (!manual || !manual.active_version_id) notFound();

  return (
    <>
      <p className="text-xs text-stone-500">{manual.document_code}</p>
      <h1 className="text-xl font-bold">{manual.title}</h1>
      <div className="mt-6">
        <Planned step={3} title="Approved manual viewer">
          Renders the published snapshot of the active version.
        </Planned>
      </div>
    </>
  );
}
