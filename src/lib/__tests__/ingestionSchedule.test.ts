import { isScheduledIngestionDue } from "@/lib/ingestionSchedule";

describe("isScheduledIngestionDue", () => {
  const now = new Date("2026-10-19T19:00:00.000Z");

  it("runs when there has not been a completed ingestion", () => {
    expect(isScheduledIngestionDue(null, 12, now)).toBe(true);
  });

  it("waits until the selected interval has elapsed", () => {
    expect(isScheduledIngestionDue(new Date("2026-10-19T07:00:00.000Z"), 24, now)).toBe(false);
    expect(isScheduledIngestionDue(new Date("2026-10-19T07:00:00.000Z"), 12, now)).toBe(true);
  });
});
