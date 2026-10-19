export const DEFAULT_RETENTION_DAYS = 45;
export const MIN_RETENTION_DAYS = 30;
export const MAX_RETENTION_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseRetentionDays(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_RETENTION_DAYS;
  }

  const days = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(days) || days < MIN_RETENTION_DAYS || days > MAX_RETENTION_DAYS) {
    throw new Error(`RETENTION_DAYS must be an integer from ${MIN_RETENTION_DAYS} to ${MAX_RETENTION_DAYS}`);
  }
  return days;
}

export function retentionCutoff(now: Date, days: number): Date {
  const validatedDays = parseRetentionDays(days);
  return new Date(now.getTime() - validatedDays * DAY_MS);
}

/** Prisma ArticleWhereInput shape: preserve bookmarks and any article with a user note. */
export function expiredArticleWhere(cutoff: Date) {
  return {
    firstSeenAt: { lt: cutoff },
    bookmarked: false,
    bookmarkNote: null,
  };
}
