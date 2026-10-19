import { categorySlug } from "@/lib/categoryUtils";

describe("categorySlug", () => {
  it("normalizes whitespace and punctuation", () => {
    expect(categorySlug("  AI / LLMs  ")).toBe("ai-llms");
  });

  it("removes accents and falls back for empty labels", () => {
    expect(categorySlug("Dữ liệu khoa học")).toBe("du-lieu-khoa-hoc");
    expect(categorySlug("!!!")).toBe("uncategorized");
  });
});
