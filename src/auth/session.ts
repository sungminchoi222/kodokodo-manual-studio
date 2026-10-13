import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Brand, MembershipRow, Profile, Store } from "@/domain/types";
import { createSupabaseServerClient } from "@/db/supabase/server";
import { availableAreas, type Actor } from "./rbac";

export interface SessionContext {
  actor: Actor;
  profile: Profile;
  brands: Brand[];
  stores: Store[];
}

/** 요청당 1회: 로그인 사용자, 멤버십, 접근 가능한 브랜드/매장 (모두 RLS 경유 조회) */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, membershipRes, brandRes, storeRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    supabase.from("memberships").select("*").eq("user_id", user.id).returns<MembershipRow[]>(),
    supabase.from("brands").select("*").order("name").returns<Brand[]>(),
    supabase.from("stores").select("*").order("name").returns<Store[]>(),
  ]);
  if (!profileRes.data) return null;

  const actor: Actor = {
    userId: user.id,
    active: profileRes.data.status === "active",
    memberships: (membershipRes.data ?? []).map((m) => ({
      role: m.role,
      organizationId: m.organization_id,
      brandId: m.brand_id,
      storeId: m.store_id,
    })),
  };
  return { actor, profile: profileRes.data, brands: brandRes.data ?? [], stores: storeRes.data ?? [] };
});

/** 영역 진입 가드. 권한이 없으면 로그인/홈으로 보낸다. */
export async function requireSession(area?: "field" | "hq"): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.actor.active) redirect("/login?error=disabled");
  if (area && !availableAreas(session.actor)[area]) redirect("/?error=forbidden");
  return session;
}
