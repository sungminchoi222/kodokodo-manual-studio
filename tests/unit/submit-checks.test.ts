import { describe, expect, it } from "vitest";
import { checkSubmission, hasBlockingIssues, type CheckInput, type CheckMedia } from "@/validation/submit-checks";

const prep = (id: string, over: Partial<NonNullable<CheckInput["ingredients"][number]["preparation"]>> = {}) => ({
  id,
  no_prep: false,
  na_reason: null,
  before_na_reason: null,
  during_na_reason: null,
  after_na_reason: null,
  ...over,
});
const photo = (prepId: string, role: CheckMedia["role"], uploadStatus: CheckMedia["uploadStatus"] = "uploaded"): CheckMedia => ({
  entityType: "submission_preparation",
  entityId: prepId,
  role,
  uploadStatus,
});
const final: CheckMedia = { entityType: "submission", entityId: "s1", role: "final", uploadStatus: "uploaded" };

function guided(over: Partial<CheckInput> = {}): CheckInput {
  return {
    captureMode: "guided",
    title: "Galbi",
    station: "Main",
    note: null,
    ingredients: [{ id: "i1", name: "Galbi", preparation: prep("p1") }],
    steps: [{ id: "st1", step_no: 1, description: "Grill" }],
    media: [photo("p1", "before"), photo("p1", "during"), photo("p1", "after"), final],
    ...over,
  };
}
const codes = (input: CheckInput) => checkSubmission(input).map((i) => i.code);

describe("guided submit checks", () => {
  it("passes a complete capture", () => {
    expect(checkSubmission(guided())).toEqual([]);
  });

  it("warns per missing prep photo and names the ingredient (acceptance #2 at capture time)", () => {
    const issues = checkSubmission(guided({ media: [photo("p1", "before"), photo("p1", "during"), final] }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: "warning", code: "missing_after", ingredientId: "i1" });
    expect(issues[0]?.message).toContain("Galbi");
    expect(issues[0]?.message).toContain("AFTER");
  });

  it("accepts an N/A reason instead of a photo", () => {
    const input = guided({
      ingredients: [{ id: "i1", name: "Galbi", preparation: prep("p1", { during_na_reason: "No intermediate state" }) }],
      media: [photo("p1", "before"), photo("p1", "after"), final],
    });
    expect(codes(input)).toEqual([]);
  });

  it("skips photos for no-prep ingredients but requires the reason", () => {
    const ok = guided({ ingredients: [{ id: "i1", name: "Sauce", preparation: prep("p1", { no_prep: true, na_reason: "Ready-made" }) }], media: [final] });
    expect(codes(ok)).toEqual([]);
    const bad = guided({ ingredients: [{ id: "i1", name: "Sauce", preparation: prep("p1", { no_prep: true, na_reason: " " }) }], media: [final] });
    expect(codes(bad)).toEqual(["no_prep_reason"]);
    expect(hasBlockingIssues(checkSubmission(bad))).toBe(true);
  });

  it("blocks on unfinished uploads and does not count them as photos", () => {
    const input = guided({ media: [photo("p1", "before"), photo("p1", "during"), photo("p1", "after", "failed"), final] });
    const issues = checkSubmission(input);
    expect(issues.map((i) => i.code)).toEqual(["uploads_incomplete", "missing_after"]);
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it("blocks without ingredients, warns without steps or final photo", () => {
    const input = guided({ ingredients: [], steps: [], media: [] });
    const issues = checkSubmission(input);
    expect(issues.find((i) => i.code === "no_ingredients")?.level).toBe("error");
    expect(issues.find((i) => i.code === "no_steps")?.level).toBe("warning");
    expect(issues.find((i) => i.code === "no_final_photo")?.level).toBe("warning");
  });

  it("checks three ingredients independently (acceptance #1)", () => {
    const ingredients = ["a", "b", "c"].map((x) => ({ id: `i${x}`, name: x, preparation: prep(`p${x}`) }));
    const media = ingredients.flatMap((i) => (["before", "during", "after"] as const).map((r) => photo(i.preparation.id, r)));
    expect(codes(guided({ ingredients, media: [...media, final] }))).toEqual([]);
  });
});

describe("quick submit checks", () => {
  const quick = (over: Partial<CheckInput> = {}): CheckInput => ({
    captureMode: "quick",
    title: "Fryer issue",
    station: "Main",
    note: null,
    ingredients: [],
    steps: [],
    media: [],
    ...over,
  });

  it("requires a file or a note", () => {
    expect(codes(quick())).toEqual(["quick_empty"]);
    expect(codes(quick({ note: "Oil smells burnt" }))).toEqual([]);
    expect(codes(quick({ media: [{ entityType: "submission", entityId: "s", role: "attachment", uploadStatus: "uploaded" }] }))).toEqual([]);
  });

  it("does not apply guided photo rules", () => {
    expect(codes(quick({ note: "x" }))).not.toContain("no_ingredients");
  });
});
