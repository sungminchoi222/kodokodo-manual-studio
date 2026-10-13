/**
 * 앱 계층 권한 판정. supabase/migrations/0002_rls.sql 의 app.* 함수와 같은 규칙을 따른다.
 * 화면/서버 액션/API 에서 1차 검사하고, DB RLS 가 최종 방어선이 된다 (둘 다 필수).
 */
import { APPROVER_ROLES, HQ_ROLES, STORE_ROLES, type AppRole } from "@/domain/enums";

export interface ActorMembership {
  role: AppRole;
  organizationId: string;
  brandId: string | null;
  storeId: string | null;
}

export interface Actor {
  userId: string;
  active: boolean;
  memberships: ActorMembership[];
}

export interface BrandRef {
  brandId: string;
  organizationId: string;
}

export type Action =
  | "submission.create"
  | "submission.review"
  | "manual.view_published"
  | "manual.view_draft"
  | "manual.edit_draft"
  | "standards.edit"
  | "standards.verify"
  | "manual.publish"
  | "export.published"
  | "export.draft"
  | "export.cross_brand"
  | "admin.manage_stores"
  | "admin.manage_members";

export interface PermissionContext {
  brand: BrandRef;
  /** submission.create: 대상 매장 */
  storeId?: string;
  /** manual.view_published / export.published: 매뉴얼 적용 매장 */
  applicableStoreIds?: readonly string[] | "all";
  /**
   * 현장 역할의 승인본 다운로드 허용 여부 (브랜드별 정책, 미확정 → 기본 false).
   * docs/decisions.md "직원 다운로드 권한" 참고.
   */
  fieldExportAllowed?: boolean;
}

const includesRole = (roles: readonly AppRole[], role: AppRole) => roles.includes(role);

/** 브랜드에 대해 유효한 역할 (매장 역할 포함, 조직 전체 system_admin 포함) */
export function rolesInBrand(actor: Actor, brand: BrandRef): Set<AppRole> {
  const roles = new Set<AppRole>();
  if (!actor.active) return roles;
  for (const m of actor.memberships) {
    const orgWideAdmin = m.role === "system_admin" && m.brandId === null && m.organizationId === brand.organizationId;
    if (m.brandId === brand.brandId || orgWideAdmin) roles.add(m.role);
  }
  return roles;
}

/** 특정 매장에 직접 부여된 매장 역할 */
export function storeRoles(actor: Actor, storeId: string): Set<AppRole> {
  const roles = new Set<AppRole>();
  if (!actor.active) return roles;
  for (const m of actor.memberships) {
    if (m.storeId === storeId && includesRole(STORE_ROLES, m.role)) roles.add(m.role);
  }
  return roles;
}

const hasAny = (roles: Set<AppRole>, wanted: readonly AppRole[]) => wanted.some((r) => roles.has(r));

export function isHq(actor: Actor, brand: BrandRef): boolean {
  return hasAny(rolesInBrand(actor, brand), HQ_ROLES);
}

export function isApprover(actor: Actor, brand: BrandRef): boolean {
  return hasAny(rolesInBrand(actor, brand), APPROVER_ROLES);
}

function storeMembershipsInBrand(actor: Actor, brandId: string): string[] {
  if (!actor.active) return [];
  return actor.memberships
    .filter((m) => m.brandId === brandId && m.storeId !== null && includesRole(STORE_ROLES, m.role))
    .map((m) => m.storeId as string);
}

function manualAppliesToActor(actor: Actor, ctx: PermissionContext): boolean {
  const stores = storeMembershipsInBrand(actor, ctx.brand.brandId);
  if (stores.length === 0) return false;
  const applicable = ctx.applicableStoreIds;
  if (applicable === undefined) return false; // 적용 범위를 모르면 거부
  if (applicable === "all") return true;
  return stores.some((s) => applicable.includes(s));
}

export function can(actor: Actor, action: Action, ctx: PermissionContext): boolean {
  if (!actor.active) return false;
  const brandRoles = rolesInBrand(actor, ctx.brand);
  const hq = hasAny(brandRoles, HQ_ROLES);
  const approver = hasAny(brandRoles, APPROVER_ROLES);

  switch (action) {
    case "submission.create": {
      if (!ctx.storeId) return false;
      return hq || storeRoles(actor, ctx.storeId).size > 0;
    }
    case "submission.review":
    case "manual.view_draft":
    case "manual.edit_draft":
    case "standards.edit":
    case "export.draft":
      return hq;
    case "standards.verify":
    case "manual.publish":
      return approver;
    case "manual.view_published":
      return hq || manualAppliesToActor(actor, ctx);
    case "export.published":
      return hq || (ctx.fieldExportAllowed === true && manualAppliesToActor(actor, ctx));
    case "export.cross_brand":
    case "admin.manage_stores":
    case "admin.manage_members":
      return brandRoles.has("system_admin");
  }
}

/** 로그인 후 진입 가능한 영역 */
export function availableAreas(actor: Actor): { field: boolean; hq: boolean } {
  if (!actor.active) return { field: false, hq: false };
  return {
    field: actor.memberships.some((m) => includesRole(STORE_ROLES, m.role)),
    hq: actor.memberships.some((m) => includesRole(HQ_ROLES, m.role)),
  };
}
