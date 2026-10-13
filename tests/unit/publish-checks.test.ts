import { describe, expect, it } from "vitest";
import type { Block, ManualContent, StorageStandardView } from "@/domain/manual-content";
import { nextVersionLabel } from "@/domain/templates";
import { importBlocksFromSubmission, type ImportSource } from "@/manual/import-submission";
import { checkPublish, type MediaStatus } from "@/validation/publish-checks";

const M = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ref = (n: number) => ({ media_id: M(n), caption: null });
const verified = { by_name: "Approver", at: "2026-10-13T00:00:00Z" };

const storage = (over: Partial<StorageStandardView> = {}): StorageStandardView => ({
  product_state: "cooked",
  product_state_note: null,
  storage_method: "chilled",
  storage_method_note: null,
  temperature_min_c: null,
  temperature_max_c: 5,
  shelf_life_value: 2,
  shelf_life_unit: "days",
  shelf_life_start_event: "cooked_at",
  start_event_description: null,
  label_instructions: null,
  container_and_cover: null,
  disposal_rule: null,
  reference_note: null,
  verified,
  ...over,
});

function recipe(blocksOver?: Block[], over: Partial<ManualContent> = {}): ManualContent {
  const blocks: Block[] = blocksOver ?? [
    { id: "b1", type: "ingredient_table", rows: [{ name: "Galbi", amount: 500, unit: "g", note: null }] },
    {
      id: "b2",
      type: "photo_trio",
      ingredient: "Galbi",
      no_prep: false,
      no_prep_reason: null,
      photos: { before: ref(1), during: ref(2), after: ref(3) },
      na_reasons: { before: null, during: null, after: null },
      specs: { cut_method: null, length_mm: null, width_mm: null, thickness_mm: null, weight_before_g: null, weight_after_g: null, tools: null, caution: null },
    },
    { id: "b3", type: "step", text: "Grill", media: [ref(4)], duration_seconds: 240, temperature_c: 220, input_amount: null, safety_note: null },
    { id: "b4", type: "final_product", text: "", media: [ref(5)] },
  ];
  return {
    schema_version: 1,
    manual: {
      id: M(100),
      document_code: "KK-MAIN-001",
      title: "Galbi",
      brand: { id: M(200), name: "KODO KODO", code: "KK" },
      station: "Main",
      manual_type: "recipe",
      store_scope: "brand_all",
      stores: [],
      locale: "en",
    },
    blocks,
    quality: { acceptance_criteria: [], rejection_criteria: [], critical_warnings: [], allergen_notes: null, sauce_rules: [] },
    storage_standards: [storage()],
    serving_standards: [
      { quantity: 6, unit: "pcs", serving_context: "Standard", measurement_method: null, tolerance: null, plating_instructions: null, reference_image: null, verified },
    ],
    media: {},
    sources: { submission_ids: [M(300)], hq_direct_source_note: null },
    ...over,
  };
}
const allMedia: Record<string, MediaStatus> = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [M(n), { uploaded: true, kind: "image" }]));
const codes = (c: ManualContent, media = allMedia) => checkPublish({ content: c, media, hasPreviousVersion: false }).map((i) => i.code);

describe("publish checks", () => {
  it("passes a complete, verified recipe", () => {
    expect(codes(recipe())).toEqual([]);
  });

  it("acceptance #2: missing AFTER photo without N/A names the ingredient and slot", () => {
    const c = recipe();
    const trio = c.blocks[1] as Extract<Block, { type: "photo_trio" }>;
    trio.photos.after = null;
    const issues = checkPublish({ content: c, media: allMedia, hasPreviousVersion: false });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "prep_photo", path: "blocks.b2.photos.after" });
    expect(issues[0]?.message).toBe("Galbi: AFTER photo is missing and no N/A reason is given.");
    trio.na_reasons.after = "Same as DURING";
    expect(codes(c)).toEqual([]);
  });

  it("acceptance #5: unconfirmed temperature / shelf life blocks publishing", () => {
    const c = recipe(undefined, {
      storage_standards: [storage({ storage_method: null, temperature_max_c: null, shelf_life_value: null, shelf_life_unit: null, shelf_life_start_event: null, verified: null })],
    });
    expect(codes(c)).toEqual(["storage_method", "shelf_life", "shelf_life_start", "storage_unverified"]);
    const chilledNoTemp = recipe(undefined, { storage_standards: [storage({ temperature_max_c: null })] });
    expect(codes(chilledNoTemp)).toEqual(["storage_temp"]);
    const ambient = recipe(undefined, { storage_standards: [storage({ storage_method: "ambient", temperature_max_c: null })] });
    expect(codes(ambient)).toEqual([]);
  });

  it("requires approver verification on serving", () => {
    const c = recipe();
    c.serving_standards[0]!.verified = null;
    expect(codes(c)).toEqual(["serving_unverified"]);
  });

  it("recipe requires storage, serving, steps, final photo, and a prep card per ingredient", () => {
    const c = recipe([{ id: "b1", type: "ingredient_table", rows: [{ name: "Galbi", amount: null, unit: null, note: null }] }], {
      storage_standards: [],
      serving_standards: [],
    });
    expect(codes(c)).toEqual(["prep_card", "steps", "final_photo", "storage", "serving"]);
  });

  it("service SOP only requires steps", () => {
    const c = recipe([{ id: "s", type: "step", text: "Greet guest", media: [], duration_seconds: null, temperature_c: null, input_amount: null, safety_note: null }], {
      storage_standards: [],
      serving_standards: [],
    });
    c.manual.manual_type = "service_sop";
    expect(codes(c)).toEqual([]);
  });

  it("flags unavailable, incomplete, or non-image media in photo slots", () => {
    const media = { ...allMedia, [M(1)]: { uploaded: false, kind: "image" }, [M(2)]: { uploaded: true, kind: "video" } };
    delete (media as Record<string, MediaStatus>)[M(3)];
    expect(codes(recipe(), media)).toEqual(["media_incomplete", "media_kind", "media_missing"]);
  });

  it("requires a source and selected stores", () => {
    const c = recipe(undefined, { sources: { submission_ids: [], hq_direct_source_note: " " } });
    c.manual.store_scope = "selected_stores";
    expect(codes(c)).toEqual(["stores", "source"]);
  });

  it("requires change log, and revision reason for revisions", () => {
    const r = (hasPrev: boolean) =>
      checkPublish({ content: recipe(), media: allMedia, hasPreviousVersion: hasPrev, form: { change_log: "", revision_reason: "" } }).map((i) => i.code);
    expect(r(false)).toEqual(["change_log"]);
    expect(r(true)).toEqual(["change_log", "revision_reason"]);
  });
});

describe("version labels", () => {
  it("starts at v1.0 and bumps minor/major", () => {
    expect(nextVersionLabel([], "minor")).toBe("v1.0");
    expect(nextVersionLabel(["v1.0"], "minor")).toBe("v1.1");
    expect(nextVersionLabel(["v1.0", "v1.9", "v1.10"], "minor")).toBe("v1.11");
    expect(nextVersionLabel(["v1.3"], "major")).toBe("v2.0");
  });
});

describe("import from submission", () => {
  const src: ImportSource = {
    submission: { id: M(1), capture_mode: "guided", title: "Galbi", note: null, qc_notes: "Glossy" },
    ingredients: [
      {
        id: "i1",
        name: "Galbi",
        amount: 500,
        unit: "g",
        notes: null,
        preparation: {
          id: "p1", no_prep: false, na_reason: null, cut_method: "Butterfly", length_mm: 80, width_mm: null, thickness_mm: 12,
          weight_before_g: 500, weight_after_g: 460, tools: "Knife", caution: null, notes: null,
          before_na_reason: null, during_na_reason: "No intermediate", after_na_reason: null,
        },
      },
    ],
    steps: [{ id: "s1", step_no: 1, description: "Grill", duration_seconds: 240, temperature_c: 220, input_amount: null, safety_note: null }],
    media: [
      { mediaId: M(11), entityType: "submission_preparation", entityId: "p1", role: "before", caption: "raw", kind: "image", uploadStatus: "uploaded" },
      { mediaId: M(12), entityType: "submission_preparation", entityId: "p1", role: "after", caption: null, kind: "image", uploadStatus: "failed" },
      { mediaId: M(13), entityType: "submission_cooking_step", entityId: "s1", role: "step", caption: null, kind: "video", uploadStatus: "uploaded" },
      { mediaId: M(14), entityType: "submission", entityId: M(1), role: "final", caption: null, kind: "image", uploadStatus: "uploaded" },
    ],
  };
  let n = 0;
  const blocks = importBlocksFromSubmission(src, () => `id${++n}`);

  it("maps ingredients, prep card, steps and final product", () => {
    expect(blocks.map((b) => b.type)).toEqual(["heading", "ingredient_table", "heading", "photo_trio", "heading", "step", "final_product"]);
    const trio = blocks[3] as Extract<Block, { type: "photo_trio" }>;
    expect(trio.photos.before).toEqual({ media_id: M(11), caption: "raw" });
    expect(trio.photos.after).toBeNull(); // failed upload is not imported
    expect(trio.na_reasons.during).toBe("No intermediate");
    expect(trio.specs).toMatchObject({ cut_method: "Butterfly", length_mm: 80, weight_after_g: 460 });
    expect((blocks[5] as Extract<Block, { type: "step" }>).media).toEqual([{ media_id: M(13), caption: null }]);
    expect((blocks[6] as Extract<Block, { type: "final_product" }>).text).toBe("Glossy");
  });
});
