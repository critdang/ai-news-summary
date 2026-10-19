import { allocateSourceArticleLimits, isValidSourceArticleLimit } from "@/lib/sourceLimits";

describe("source article limits", () => {
  it("splits the total budget evenly across feeds by default", () => {
    expect(allocateSourceArticleLimits([
      { id: "a", maxArticlesPerRun: null },
      { id: "b", maxArticlesPerRun: null },
      { id: "c", maxArticlesPerRun: null },
    ], 50)).toEqual(new Map([["a", 17], ["b", 17], ["c", 16]]));
  });

  it("reserves custom feed allocations and divides the remaining total", () => {
    expect(allocateSourceArticleLimits([
      { id: "preferred", maxArticlesPerRun: 20 },
      { id: "other-a", maxArticlesPerRun: null },
      { id: "other-b", maxArticlesPerRun: null },
    ], 50)).toEqual(new Map([["preferred", 20], ["other-a", 15], ["other-b", 15]]));
  });

  it("rejects allocations whose sum exceeds the global total", () => {
    expect(() => allocateSourceArticleLimits([
      { id: "a", maxArticlesPerRun: 30 },
      { id: "b", maxArticlesPerRun: 25 },
    ], 50)).toThrow("exceeds the total ingestion limit");
  });

  it.each([null, 1, 20, 50])("accepts valid feed limits: %s", (value) => {
    expect(isValidSourceArticleLimit(value)).toBe(true);
  });

  it.each([0, 51, 2.5, "10", undefined])("rejects invalid feed limits: %s", (value) => {
    expect(isValidSourceArticleLimit(value)).toBe(false);
  });
});
