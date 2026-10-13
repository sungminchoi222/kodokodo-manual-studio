import { describe, expect, it } from "vitest";
import {
  servingStandardInputSchema,
  storageStandardInputSchema,
  storageStandardListSchema,
} from "@/validation/product-standards";
import { ingredientInputSchema, preparationInputSchema } from "@/validation/submission";

const emptyStorage = {
  product_state: "cooked",
  product_state_note: null,
  storage_method: null,
  storage_method_note: null,
  temperature_min_c: null,
  temperature_max_c: null,
  shelf_life_value: null,
  shelf_life_unit: null,
  shelf_life_start_event: null,
  start_event_description: null,
  label_instructions: null,
  container_and_cover: null,
  disposal_rule: null,
  reference_note: null,
};

const issuePaths = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.error?.issues.map((i) => i.path.join(".")) ?? [];

describe("storage standard input", () => {
  it("accepts an empty draft row and keeps values empty (no defaults)", () => {
    const r = storageStandardInputSchema.parse(emptyStorage);
    expect(r.temperature_min_c).toBeNull();
    expect(r.shelf_life_value).toBeNull();
  });

  it("normalizes blank text to null", () => {
    const r = storageStandardInputSchema.parse({ ...emptyStorage, label_instructions: "   " });
    expect(r.label_instructions).toBeNull();
  });

  it("rejects min >= max temperature", () => {
    const r = storageStandardInputSchema.safeParse({ ...emptyStorage, temperature_min_c: 5, temperature_max_c: 5 });
    expect(issuePaths(r)).toContain("temperature_min_c");
  });

  it("allows only one temperature bound", () => {
    expect(storageStandardInputSchema.safeParse({ ...emptyStorage, temperature_max_c: 5 }).success).toBe(true);
  });

  it("requires shelf life value and unit together", () => {
    const r = storageStandardInputSchema.safeParse({ ...emptyStorage, shelf_life_value: 3 });
    expect(issuePaths(r)).toContain("shelf_life_unit");
  });

  it("requires description for custom start event", () => {
    const r = storageStandardInputSchema.safeParse({ ...emptyStorage, shelf_life_start_event: "custom" });
    expect(issuePaths(r)).toContain("start_event_description");
  });

  it("rejects non-positive shelf life", () => {
    const r = storageStandardInputSchema.safeParse({ ...emptyStorage, shelf_life_value: 0, shelf_life_unit: "days" });
    expect(r.success).toBe(false);
  });

  it("keeps one row per product state (except other)", () => {
    const dup = storageStandardListSchema.safeParse([emptyStorage, emptyStorage]);
    expect(issuePaths(dup)).toContain("1.product_state");
    const others = storageStandardListSchema.safeParse([
      { ...emptyStorage, product_state: "other" },
      { ...emptyStorage, product_state: "other" },
    ]);
    expect(others.success).toBe(true);
  });
});

describe("serving standard input", () => {
  const base = {
    quantity: 6,
    unit: "pcs",
    serving_context: "Galbi standard serving",
    measurement_method: null,
    tolerance_json: null,
    plating_instructions: null,
    reference_image_asset_id: null,
  };

  it("accepts 6 pcs", () => {
    expect(servingStandardInputSchema.parse(base)).toMatchObject({ quantity: 6, unit: "pcs" });
  });

  it("rejects unknown units", () => {
    expect(servingStandardInputSchema.safeParse({ ...base, unit: "pieces" }).success).toBe(false);
  });

  it("requires quantity and unit together", () => {
    expect(issuePaths(servingStandardInputSchema.safeParse({ ...base, unit: null }))).toContain("unit");
  });

  it("requires at least one tolerance bound", () => {
    expect(servingStandardInputSchema.safeParse({ ...base, tolerance_json: { unit: "g" } }).success).toBe(false);
    expect(servingStandardInputSchema.safeParse({ ...base, tolerance_json: { plus: 5, unit: "g" } }).success).toBe(true);
  });
});

describe("field capture input", () => {
  it("requires N/A reason when no preparation is required", () => {
    const prep = {
      cut_method: null,
      length_mm: null,
      width_mm: null,
      thickness_mm: null,
      weight_before_g: null,
      weight_after_g: null,
      tools: null,
      caution: null,
      notes: null,
      no_prep: true,
      na_reason: "",
      before_na_reason: null,
      during_na_reason: null,
      after_na_reason: null,
    };
    expect(issuePaths(preparationInputSchema.safeParse(prep))).toContain("na_reason");
    expect(preparationInputSchema.safeParse({ ...prep, na_reason: "Ready-made sauce" }).success).toBe(true);
  });

  it("requires ingredient amount and unit together", () => {
    const r = ingredientInputSchema.safeParse({ name: "Galbi", amount: 500, unit: null, tools: null, notes: null });
    expect(issuePaths(r)).toContain("unit");
  });
});
