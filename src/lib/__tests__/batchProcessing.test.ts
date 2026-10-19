import { mapWithConcurrency, prepareArticleBatches } from "@/lib/batchProcessing";
import type { BatchArticleInput } from "@/lib/aiProvider";

const article = (id: number, excerpt = "x".repeat(80)): BatchArticleInput => ({
  canonicalUrl: `https://example.com/${id}`,
  title: `Article ${id}`,
  publisher: "Example",
  publishedAt: null,
  excerpt,
  category: "AI",
});

describe("prepareArticleBatches", () => {
  it("respects both item count and serialized input size limits", () => {
    const result = prepareArticleBatches([article(1), article(2), article(3)], {
      maxArticles: 2,
      maxInputChars: 300,
      maxExcerptChars: 20,
    });
    expect(result.skipped).toHaveLength(0);
    expect(result.batches.every((batch) => batch.length <= 2)).toBe(true);
    expect(result.batches.flat().every((item) => (item.excerpt?.length ?? 0) <= 20)).toBe(true);
    expect(result.batches.every((batch) => JSON.stringify(batch).length <= 500)).toBe(true);
  });
});

describe("mapWithConcurrency", () => {
  it("runs no more than the configured number of tasks at once and preserves order", async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([3, 2, 1], 2, async (value) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, value));
      active--;
      return value * 2;
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(result).toEqual([6, 4, 2]);
  });
});
