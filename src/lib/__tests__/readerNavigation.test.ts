import { nextArticleIndex } from "@/lib/readerNavigation";

describe("nextArticleIndex", () => {
  it("starts at the first article when moving forward without a selection", () => {
    expect(nextArticleIndex(-1, 3, 1)).toBe(0);
  });

  it("starts at the last article when moving backward without a selection", () => {
    expect(nextArticleIndex(-1, 3, -1)).toBe(2);
  });

  it("wraps at both ends of the list", () => {
    expect(nextArticleIndex(2, 3, 1)).toBe(0);
    expect(nextArticleIndex(0, 3, -1)).toBe(2);
  });

  it("returns -1 for an empty list", () => {
    expect(nextArticleIndex(-1, 0, 1)).toBe(-1);
  });
});
