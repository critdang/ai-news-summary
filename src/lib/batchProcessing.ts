import type { BatchArticleInput } from "@/lib/aiProvider";

export type BatchPreparation = {
  batches: BatchArticleInput[][];
  skipped: Array<{ article: BatchArticleInput; reason: string }>;
  inputCharacters: number;
};

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(items.length, Math.floor(concurrency) || 1));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }));

  return results;
}

export function prepareArticleBatches(
  inputs: BatchArticleInput[],
  options: { maxArticles: number; maxInputChars: number; maxExcerptChars: number }
): BatchPreparation {
  const batches: BatchArticleInput[][] = [];
  const skipped: BatchPreparation["skipped"] = [];
  let current: BatchArticleInput[] = [];
  let currentChars = 2; // JSON array brackets.
  let inputCharacters = 0;
  const maxArticles = Math.max(1, Math.floor(options.maxArticles));
  const maxInputChars = Math.max(500, Math.floor(options.maxInputChars));
  const maxExcerptChars = Math.max(0, Math.floor(options.maxExcerptChars));

  for (const input of inputs) {
    const compact: BatchArticleInput = {
      ...input,
      title: input.title.slice(0, 500),
      publisher: input.publisher.slice(0, 200),
      category: input.category.slice(0, 100),
      excerpt: input.excerpt?.slice(0, maxExcerptChars) ?? null,
    };
    const baseChars = JSON.stringify({ ...compact, excerpt: null }).length;
    if (baseChars > maxInputChars) {
      skipped.push({ article: input, reason: "metadata exceeds the configured batch input character limit" });
      continue;
    }

    const availableExcerptChars = Math.max(0, maxInputChars - baseChars - 4);
    compact.excerpt = compact.excerpt?.slice(0, availableExcerptChars) ?? null;
    let itemChars = JSON.stringify(compact).length;
    while (itemChars + 2 > maxInputChars && compact.excerpt) {
      compact.excerpt = compact.excerpt.slice(0, Math.max(0, compact.excerpt.length - (itemChars + 2 - maxInputChars)));
      itemChars = JSON.stringify(compact).length;
    }
    const separatorChars = current.length > 0 ? 1 : 0;
    if (
      current.length >= maxArticles ||
      (current.length > 0 && currentChars + separatorChars + itemChars > maxInputChars)
    ) {
      batches.push(current);
      current = [];
      currentChars = 2;
    }

    if (itemChars + 2 > maxInputChars) {
      skipped.push({ article: input, reason: "article cannot fit within the configured batch input character limit" });
      continue;
    }

    current.push(compact);
    currentChars += (current.length > 1 ? 1 : 0) + itemChars;
    inputCharacters += itemChars;
  }

  if (current.length > 0) batches.push(current);
  return { batches, skipped, inputCharacters };
}
