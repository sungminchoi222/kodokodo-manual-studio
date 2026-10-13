import { redirect } from "next/navigation";
import { availableAreas, isHq } from "@/auth/rbac";
import { requireSession } from "@/auth/session";
import { getManualOr404 } from "@/db/manuals";

/**
 * QR/문서 링크용 안정 딥링크. 만료되는 storage signed URL 대신 이 주소를 인쇄한다.
 * 로그인(proxy.ts) → RLS 로 매뉴얼 조회 → 역할에 맞는 화면으로 이동.
 */
export default async function ManualDeepLinkPage({ params }: PageProps<"/m/[manualId]">) {
  const { actor, brands } = await requireSession();
  const { manualId } = await params;
  const manual = await getManualOr404(manualId);
  const brand = brands.find((b) => b.id === manual.brand_id);

  if (brand && isHq(actor, { brandId: brand.id, organizationId: brand.organization_id })) {
    redirect(`/hq/manuals/${manual.id}/edit`);
  }
  if (availableAreas(actor).field) redirect(`/field/manuals/${manual.id}`);
  redirect("/?error=forbidden");
}
