import { prisma } from "@/lib/prisma";
import { cleanupMode, runCleanup } from "../cleanup";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    userPreference: { findFirst: jest.fn() },
    article: { count: jest.fn(), deleteMany: jest.fn() },
    $disconnect: jest.fn(),
  },
}));

const mockPrisma = prisma as unknown as {
  userPreference: { findFirst: jest.Mock };
  article: { count: jest.Mock; deleteMany: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.userPreference.findFirst.mockResolvedValue({ retentionDays: 30 });
  mockPrisma.article.count.mockResolvedValue(3);
  mockPrisma.article.deleteMany.mockResolvedValue({ count: 3 });
});

describe("retention command mode", () => {
  it("defaults to preview and rejects conflicting flags", () => {
    expect(cleanupMode([])).toBe("preview");
    expect(cleanupMode(["--dry-run"])).toBe("preview");
    expect(cleanupMode(["--apply"])).toBe("apply");
    expect(() => cleanupMode(["--apply", "--dry-run"])).toThrow(/Choose only one/);
    expect(() => cleanupMode(["--aply"])).toThrow(/Unknown cleanup argument/);
  });

  it("counts eligible articles without deleting in preview mode", async () => {
    await runCleanup(["--dry-run"]);

    expect(mockPrisma.article.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ bookmarked: false, bookmarkNote: null }),
    });
    expect(mockPrisma.article.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes only the same eligible set when explicitly applied", async () => {
    await runCleanup(["--apply"]);

    const where = mockPrisma.article.count.mock.calls[0][0].where;
    expect(mockPrisma.article.deleteMany).toHaveBeenCalledWith({ where });
  });
});
