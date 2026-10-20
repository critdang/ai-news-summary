import { prisma } from "@/lib/prisma";
import { cleanupMode, runCleanup } from "../cleanup";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: jest.fn() },
    userPreference: { findUnique: jest.fn() },
    article: { count: jest.fn(), deleteMany: jest.fn() },
    $disconnect: jest.fn(),
  },
}));

const mockPrisma = prisma as unknown as {
  user: { findMany: jest.Mock };
  userPreference: { findUnique: jest.Mock };
  article: { count: jest.Mock; deleteMany: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findMany.mockResolvedValue([{ id: "user-1" }]);
  mockPrisma.userPreference.findUnique.mockResolvedValue({ retentionDays: 30 });
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
