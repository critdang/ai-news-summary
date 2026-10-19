/** Return the wrapped next article index for keyboard list navigation. */
export function nextArticleIndex(
  currentIndex: number,
  articleCount: number,
  direction: -1 | 1
): number {
  if (articleCount <= 0) return -1;
  const base = currentIndex < 0 ? (direction === 1 ? -1 : 0) : currentIndex;
  return (base + direction + articleCount) % articleCount;
}
