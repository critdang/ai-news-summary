export function isValidSourceArticleLimit(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 50);
}

export type SourceLimit = { id: string; maxArticlesPerRun: number | null };

/** Explicit feed limits are reserved first; the remaining total is divided evenly among inheriting feeds. */
export function allocateSourceArticleLimits(
  sources: SourceLimit[],
  totalLimit: number
): Map<string, number> {
  const explicitTotal = sources.reduce(
    (total, source) => total + (source.maxArticlesPerRun ?? 0),
    0
  );
  if (explicitTotal > totalLimit) {
    throw new RangeError("The sum of per-feed allocations exceeds the total ingestion limit");
  }

  const inherited = sources.filter((source) => source.maxArticlesPerRun === null);
  const remaining = totalLimit - explicitTotal;
  const base = inherited.length > 0 ? Math.floor(remaining / inherited.length) : 0;
  const extra = inherited.length > 0 ? remaining % inherited.length : 0;
  const allocations = new Map<string, number>();
  let inheritedIndex = 0;

  for (const source of sources) {
    if (source.maxArticlesPerRun !== null) {
      allocations.set(source.id, source.maxArticlesPerRun);
    } else {
      allocations.set(source.id, base + (inheritedIndex < extra ? 1 : 0));
      inheritedIndex++;
    }
  }

  return allocations;
}
