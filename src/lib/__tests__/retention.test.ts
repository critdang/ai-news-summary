import {
  DEFAULT_RETENTION_DAYS,
  expiredArticleWhere,
  parseRetentionDays,
  retentionCutoff,
} from "@/lib/retention";

describe("retention configuration", () => {
  it("defaults to 45 days and accepts the configured range", () => {
    expect(parseRetentionDays(undefined)).toBe(DEFAULT_RETENTION_DAYS);
    expect(parseRetentionDays("30")).toBe(30);
    expect(parseRetentionDays(60)).toBe(60);
  });

  it.each(["29", "61", "45.5", "invalid"])(
    "rejects invalid retention value %s",
    (value) => expect(() => parseRetentionDays(value)).toThrow(/integer from 30 to 60/)
  );

  it("calculates a UTC-safe timestamp cutoff and preserves notes and bookmarks", () => {
    const now = new Date("2026-10-19T12:00:00.000Z");
    const cutoff = retentionCutoff(now, 45);

    expect(cutoff.toISOString()).toBe("2026-09-04T12:00:00.000Z");
    expect(expiredArticleWhere(cutoff)).toEqual({
      firstSeenAt: { lt: cutoff },
      bookmarked: false,
      bookmarkNote: null,
    });
  });
});
