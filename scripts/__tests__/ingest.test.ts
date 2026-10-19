/**
 * scripts/__tests__/ingest.test.ts
 *
 * Integration-style tests for the ingestion worker: dedup by canonical URL,
 * idempotency (reruns don't create duplicates), partial source failure, and
 * feed health tracking. Prisma and the RSS parser are mocked so no real
 * database or network is touched.
 */

import { prisma } from "@/lib/prisma";
import {
  ensureDefaultCategories,
  markStaleIngestionRuns,
  processSource,
  retryExistingArticles,
} from "../ingest";

// Mock Prisma so no real database is touched.
jest.mock("@/lib/prisma", () => ({
  prisma: {
    source: { update: jest.fn(), findMany: jest.fn() },
    article: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    category: { findUnique: jest.fn(), create: jest.fn(), upsert: jest.fn() },
    feedHealth: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    userPreference: { findFirst: jest.fn(), create: jest.fn() },
    ingestionRun: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    $disconnect: jest.fn(),
  },
}));

// Mock the RSS parser to avoid real DNS/HTTP calls.
const mockParsedFeed = {
  title: "Example Feed",
  items: [
    {
      title: "Example Article",
      url: "https://example.com/article",
      summary: "An example excerpt.",
      content: null,
      author: null,
      imageUrl: null,
      publishedAt: new Date("2026-01-01T00:00:00Z"),
      guid: "guid-1",
      enclosureUrl: null,
      enclosureType: null,
      enclosureDuration: null,
    },
  ],
};
jest.mock("@/lib/rss/parser", () => ({
  parseFeed: jest.fn(async () => mockParsedFeed),
}));

// Mock AI so no real calls are made.
jest.mock("@/lib/aiProvider", () => ({
  summarizeArticle: jest.fn(),
}));

import { summarizeArticle } from "@/lib/aiProvider";
import { parseFeed } from "@/lib/rss/parser";
import { canonicalizeUrl } from "@/lib/urlUtils";

const mockPrisma = prisma as unknown as {
  source: { update: jest.Mock; findMany: jest.Mock };
  article: { findMany: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
  category: { findUnique: jest.Mock; create: jest.Mock; upsert: jest.Mock };
  feedHealth: {
    findUnique: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    upsert: jest.Mock;
  };
  userPreference: { findFirst: jest.Mock; create: jest.Mock };
  ingestionRun: { create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  $disconnect: jest.Mock;
};

const mockSummarize = summarizeArticle as jest.Mock;
const mockParseFeed = parseFeed as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSummarize.mockResolvedValue({
    result: {
      summary: "Tóm tắt",
      relevanceScore: 7,
      relevanceExplanation: "Quan trọng",
      tags: ["ai"],
    },
    provider: "gemini",
  });
  mockParseFeed.mockResolvedValue(mockParsedFeed);

  // Default: no existing articles (all new).
  mockPrisma.article.findMany.mockResolvedValue([]);
  mockPrisma.article.create.mockResolvedValue({ id: "art_1" });
  mockPrisma.article.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.source.findMany.mockResolvedValue([]);
  mockPrisma.category.findUnique.mockResolvedValue(null);
  mockPrisma.category.create.mockResolvedValue({ id: "cat_1" });
  mockPrisma.category.upsert.mockResolvedValue({ id: "cat_1" });
  mockPrisma.feedHealth.findUnique.mockResolvedValue(null);
  mockPrisma.ingestionRun.updateMany.mockResolvedValue({ count: 0 });
});

describe("markStaleIngestionRuns", () => {
  it("closes runs older than the worker timeout", async () => {
    mockPrisma.ingestionRun.updateMany.mockResolvedValue({ count: 1 });
    const now = new Date("2026-10-19T12:00:00.000Z");

    await expect(markStaleIngestionRuns(now)).resolves.toBe(1);

    expect(mockPrisma.ingestionRun.updateMany).toHaveBeenCalledWith({
      where: {
        status: "running",
        startedAt: { lt: new Date("2026-10-19T11:30:00.000Z") },
      },
      data: {
        status: "failed",
        completedAt: now,
        errorMessage: "Marked failed because the run did not finish within 30 minutes.",
      },
    });
  });
});

describe("retryExistingArticles", () => {
  it("retries stored failed articles without creating a duplicate or touching user fields", async () => {
    mockPrisma.article.findMany.mockResolvedValue([
      {
        id: "art_failed",
        title: "Saved article",
        excerpt: "Original excerpt",
        summary: null,
      },
    ]);

    const result = await retryExistingArticles("en", 10);

    expect(result).toEqual({ attempted: 1, completed: 1, failed: 0 });
    expect(mockSummarize).toHaveBeenCalledWith("Saved article", "Original excerpt", "en");
    expect(mockPrisma.article.create).not.toHaveBeenCalled();
    expect(mockPrisma.article.updateMany).toHaveBeenCalledWith({
      where: { id: "art_failed", processingStatus: { in: ["pending", "failed"] } },
      data: {
        aiSummary: "Tóm tắt",
        relevanceScore: 7,
        relevanceExplanation: "Quan trọng",
        tags: ["ai"],
        processingStatus: "completed",
      },
    });
  });
});

describe("processSource — dedup by canonical URL", () => {
  it("skips articles whose canonical URL already exists in DB", async () => {
    const canonical = canonicalizeUrl("https://example.com/article");
    mockPrisma.article.findMany.mockResolvedValue([
      { canonicalUrl: canonical },
    ]);

    await processSource({
      id: "src_1",
      url: "https://example.com/feed.xml",
      title: "Example",
      category: "AI",
    });

    expect(mockPrisma.article.create).not.toHaveBeenCalled();
  });

  it("creates articles for new canonical URLs", async () => {
    mockPrisma.article.findMany.mockResolvedValue([]);

    await processSource({
      id: "src_1",
      url: "https://example.com/feed.xml",
      title: "Example",
      category: "AI",
    });

    expect(mockPrisma.article.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.article.create.mock.calls[0][0].data.canonicalUrl).toBe(
      canonicalizeUrl("https://example.com/article")
    );
  });

  it("honors the per-source article limit when slicing parsed feed items", async () => {
    mockParseFeed.mockResolvedValue({
      ...mockParsedFeed,
      items: [
        mockParsedFeed.items[0],
        { ...mockParsedFeed.items[0], title: "Second article", url: "https://example.com/second" },
        { ...mockParsedFeed.items[0], title: "Third article", url: "https://example.com/third" },
      ],
    });

    await processSource(
      {
        id: "src_preferred",
        url: "https://example.com/feed.xml",
        title: "Preferred source",
        category: "AI",
      },
      { maxArticlesPerSource: 2 }
    );

    expect(mockPrisma.article.findMany.mock.calls[0][0].where.canonicalUrl.in).toHaveLength(2);
    expect(mockPrisma.article.create).toHaveBeenCalledTimes(2);
  });

  it("keeps an article when both AI providers fail and records the failure", async () => {
    mockSummarize.mockResolvedValue(null);

    const result = await processSource({
      id: "src_1",
      url: "https://example.com/feed.xml",
      title: "Example",
      category: "AI",
    });

    expect(result.new).toBe(1);
    expect(result.aiCalls).toBe(1);
    expect(result.aiFailures).toBe(1);
    expect(mockPrisma.article.create.mock.calls[0][0].data.processingStatus).toBe("failed");
    expect(mockPrisma.article.create.mock.calls[0][0].data.aiSummary).toBeNull();
  });

  it("does not hide non-duplicate database write errors", async () => {
    mockPrisma.article.create.mockRejectedValue(new Error("database unavailable"));

    await expect(
      processSource({
        id: "src_1",
        url: "https://example.com/feed.xml",
        title: "Example",
        category: "AI",
      })
    ).rejects.toThrow("database unavailable");
  });

  it("treats a concurrent canonical URL insert as a duplicate", async () => {
    mockPrisma.article.create.mockRejectedValue({ code: "P2002" });

    const result = await processSource({
      id: "src_1",
      url: "https://example.com/feed.xml",
      title: "Example",
      category: "AI",
    });

    expect(result.new).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("is idempotent: rerun with same data does not duplicate", async () => {
    mockPrisma.article.findMany.mockResolvedValue([]);
    await processSource({
      id: "src_1",
      url: "https://example.com/feed.xml",
      title: "Example",
      category: "AI",
    });
    const firstRunCreates = mockPrisma.article.create.mock.calls.length;

    // Simulate DB now containing the article (rerun scenario).
    const canonical = canonicalizeUrl("https://example.com/article");
    mockPrisma.article.findMany.mockResolvedValue([{ canonicalUrl: canonical }]);
    await processSource({
      id: "src_1",
      url: "https://example.com/feed.xml",
      title: "Example",
      category: "AI",
    });

    expect(mockPrisma.article.create.mock.calls.length).toBe(firstRunCreates);
  });

  it("calls parseFeed with the source URL", async () => {
    await processSource({
      id: "src_1",
      url: "https://example.com/feed.xml",
      title: "Example",
      category: "AI",
    });
    expect(mockParseFeed).toHaveBeenCalledWith("https://example.com/feed.xml");
  });
});

describe("default categories", () => {
  it("upserts the six supported categories idempotently", async () => {
    await ensureDefaultCategories();

    expect(mockPrisma.category.upsert).toHaveBeenCalledTimes(6);
    expect(mockPrisma.category.upsert).toHaveBeenCalledWith({
      where: { slug: "3d-modeling-cad" },
      update: {},
      create: { name: "3D Modeling/CAD", slug: "3d-modeling-cad", sortOrder: 4 },
    });
  });
});

describe("processSource — partial source failure", () => {
  it("marks feed health failure when fetch throws, without crashing", async () => {
    // Force parseFeed to throw (e.g. network/DNS failure).
    mockParseFeed.mockRejectedValue(new Error("DNS resolution failed"));

    await processSource({
      id: "src_bad",
      url: "https://example.com/feed.xml",
      title: "Bad",
      category: "AI",
    });

    // findUnique returns null (no existing health) -> create is called.
    expect(mockPrisma.feedHealth.create).toHaveBeenCalled();
    const healthCreate = mockPrisma.feedHealth.create.mock.calls[0]?.[0]?.data;
    expect(healthCreate.consecutiveFailures).toBe(1);
    expect(healthCreate.sourceId).toBe("src_bad");

    // Source error count incremented and error recorded.
    expect(mockPrisma.source.update).toHaveBeenCalled();
    const sourceUpdate = mockPrisma.source.update.mock.calls[0]?.[0]?.data;
    // Prisma expresses atomic increments as { increment: 1 }.
    expect(sourceUpdate.errorCount).toEqual({ increment: 1 });
    expect(sourceUpdate.fetchError).toBe("DNS resolution failed");
  });

  it("records recovery when a previously failing source succeeds", async () => {
    // Existing health with consecutive failures.
    mockPrisma.feedHealth.findUnique.mockResolvedValue({
      sourceId: "src_1",
      consecutiveFailures: 3,
    });

    await processSource({
      id: "src_1",
      url: "https://example.com/feed.xml",
      title: "Example",
      category: "AI",
    });

    expect(mockPrisma.feedHealth.update).toHaveBeenCalled();
    const healthUpdate = mockPrisma.feedHealth.update.mock.calls[0]?.[0]?.data;
    expect(healthUpdate.consecutiveFailures).toBe(0);
    expect(healthUpdate.lastSuccess).toBeDefined();
  });
});
