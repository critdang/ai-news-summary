import { effectiveSourceArticleLimit, isValidSourceArticleLimit } from "@/lib/sourceLimits";

describe("source article limits", () => {
  it("uses a feed override or falls back to the global limit", () => {
    expect(effectiveSourceArticleLimit(45, 20)).toBe(45);
    expect(effectiveSourceArticleLimit(null, 50)).toBe(50);
    expect(effectiveSourceArticleLimit(undefined, 20)).toBe(20);
  });

  it.each([null, 1, 20, 50])("accepts valid feed limits: %s", (value) => {
    expect(isValidSourceArticleLimit(value)).toBe(true);
  });

  it.each([0, 51, 2.5, "10", undefined])("rejects invalid feed limits: %s", (value) => {
    expect(isValidSourceArticleLimit(value)).toBe(false);
  });
});
