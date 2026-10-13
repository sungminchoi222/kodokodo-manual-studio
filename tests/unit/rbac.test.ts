import { describe, expect, it } from "vitest";
import { availableAreas, can, type Action, type Actor, type BrandRef } from "@/auth/rbac";
import type { AppRole } from "@/domain/enums";

const ORG = "org-1";
const KK: BrandRef = { brandId: "brand-kk", organizationId: ORG };
const OTHER: BrandRef = { brandId: "brand-other", organizationId: ORG };
const FOREIGN_ORG_BRAND: BrandRef = { brandId: "brand-x", organizationId: "org-2" };
const MAKATI = "store-makati";
const BGC = "store-bgc";

function actor(role: AppRole, opts: { brandId?: string | null; storeId?: string | null; active?: boolean } = {}): Actor {
  return {
    userId: `user-${role}`,
    active: opts.active ?? true,
    memberships: [
      {
        role,
        organizationId: ORG,
        brandId: opts.brandId === undefined ? KK.brandId : opts.brandId,
        storeId: opts.storeId ?? null,
      },
    ],
  };
}

const field = actor("field_staff", { storeId: MAKATI });
const manager = actor("store_manager", { storeId: MAKATI });
const editor = actor("hq_editor");
const approver = actor("hq_approver");
const orgAdmin = actor("system_admin", { brandId: null });

describe("permission matrix (spec §1)", () => {
  const cases: [Action, Record<string, boolean>][] = [
    ["submission.review", { field: false, manager: false, editor: true, approver: true, orgAdmin: true }],
    ["manual.view_draft", { field: false, manager: false, editor: true, approver: true, orgAdmin: true }],
    ["standards.edit", { field: false, manager: false, editor: true, approver: true, orgAdmin: true }],
    ["standards.verify", { field: false, manager: false, editor: false, approver: true, orgAdmin: true }],
    ["manual.publish", { field: false, manager: false, editor: false, approver: true, orgAdmin: true }],
    ["export.draft", { field: false, manager: false, editor: true, approver: true, orgAdmin: true }],
    ["admin.manage_members", { field: false, manager: false, editor: false, approver: false, orgAdmin: true }],
  ];
  const actors = { field, manager, editor, approver, orgAdmin };

  for (const [action, expected] of cases) {
    for (const [name, a] of Object.entries(actors)) {
      it(`${name} ${expected[name] ? "can" : "cannot"} ${action}`, () => {
        expect(can(a, action, { brand: KK })).toBe(expected[name]);
      });
    }
  }
});

describe("brand isolation", () => {
  it("HQ of one brand has no rights on another brand", () => {
    expect(can(editor, "manual.view_draft", { brand: OTHER })).toBe(false);
    expect(can(approver, "manual.publish", { brand: OTHER })).toBe(false);
  });

  it("org-wide admin covers brands of its own organization only", () => {
    expect(can(orgAdmin, "manual.publish", { brand: OTHER })).toBe(true);
    expect(can(orgAdmin, "manual.publish", { brand: FOREIGN_ORG_BRAND })).toBe(false);
  });

  it("brand-scoped admin does not get other brands", () => {
    const brandAdmin = actor("system_admin", { brandId: KK.brandId });
    expect(can(brandAdmin, "manual.publish", { brand: KK })).toBe(true);
    expect(can(brandAdmin, "manual.publish", { brand: OTHER })).toBe(false);
  });

  it("disabled accounts have no rights", () => {
    const disabled = actor("hq_approver", { active: false });
    expect(can(disabled, "manual.publish", { brand: KK })).toBe(false);
    expect(availableAreas(disabled)).toEqual({ field: false, hq: false });
  });
});

describe("field capture", () => {
  it("field staff can submit only for their own store", () => {
    expect(can(field, "submission.create", { brand: KK, storeId: MAKATI })).toBe(true);
    expect(can(field, "submission.create", { brand: KK, storeId: BGC })).toBe(false);
    expect(can(field, "submission.create", { brand: KK })).toBe(false);
  });
});

describe("published manual visibility", () => {
  it("brand_all manuals are visible to store roles of the brand", () => {
    expect(can(field, "manual.view_published", { brand: KK, applicableStoreIds: "all" })).toBe(true);
    expect(can(field, "manual.view_published", { brand: OTHER, applicableStoreIds: "all" })).toBe(false);
  });

  it("selected_stores manuals are visible only in those stores", () => {
    expect(can(field, "manual.view_published", { brand: KK, applicableStoreIds: [BGC] })).toBe(false);
    expect(can(field, "manual.view_published", { brand: KK, applicableStoreIds: [MAKATI, BGC] })).toBe(true);
  });

  it("unknown applicability is denied", () => {
    expect(can(field, "manual.view_published", { brand: KK })).toBe(false);
  });

  it("field export requires the brand policy flag (undecided policy defaults to off)", () => {
    expect(can(field, "export.published", { brand: KK, applicableStoreIds: "all" })).toBe(false);
    expect(can(field, "export.published", { brand: KK, applicableStoreIds: "all", fieldExportAllowed: true })).toBe(true);
    expect(can(editor, "export.published", { brand: KK })).toBe(true);
  });
});

describe("areas", () => {
  it("routes roles to field / hq areas", () => {
    expect(availableAreas(field)).toEqual({ field: true, hq: false });
    expect(availableAreas(editor)).toEqual({ field: false, hq: true });
  });
});
