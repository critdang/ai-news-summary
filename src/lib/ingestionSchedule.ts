export const INGESTION_INTERVAL_OPTIONS = [12, 24] as const;

export function isScheduledIngestionDue(
  lastCompletedAt: Date | null,
  intervalHours: number,
  now = new Date(),
): boolean {
  if (!lastCompletedAt) return true;
  return now.getTime() - lastCompletedAt.getTime() >= intervalHours * 60 * 60 * 1000;
}
