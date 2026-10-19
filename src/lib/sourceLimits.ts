export function isValidSourceArticleLimit(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 50);
}

export function effectiveSourceArticleLimit(
  override: number | null | undefined,
  globalLimit: number
): number {
  return override ?? globalLimit;
}
