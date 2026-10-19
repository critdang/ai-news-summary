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
  fetchSourceCandidates,
  retryExistingArticles,
} from "../ingest";

// Mock Prisma so no real database is touched.
jest.mock("@/lib/prisma", () => ({
  prisma: {
    source: { update: jest.fn(), findMany: jest.fn() },
    article: { findMany: jest.fn(), create: jest.fn(), createMany: jest.fn(), updateMany: jest.fn() },
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
  article: { findMany: jest.Mock; create: jest.Mock; createMany: jest.Mock; updateMany: jest.Mock };
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

describe("fetchSourceCandidates — normalization", () => {
  const source = { id: "src_1", url: "https://example.com/feed.xml", title: "Example", category: "AI" };

  it("returns normalized candidates without making AI or article writes", async () => {
    const result = await fetchSourceCandidates(source, 10);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].canonicalUrl).toBe(canonicalizeUrl("https://example.com/article"));
    expect(mockPrisma.article.create).not.toHaveBeenCalled();
    expect(mockSummarize).not.toHaveBeenCalled();
  });

  it("honors the source allocation when slicing parsed feed items", async () => {
    mockParseFeed.mockResolvedValue({
      ...mockParsedFeed,
      items: [mockParsedFeed.items[0], { ...mockParsedFeed.items[0], title: "Second", url: "https://example.com/second" }],
    });
    const result = await fetchSourceCandidates(source, 1);
    expect(result.candidates).toHaveLength(1);
  });

  it("records feed health failure without aborting on a fetch error", async () => {
    mockParseFeed.mockRejectedValue(new Error("DNS resolution failed"));
    const result = await fetchSourceCandidates({ ...source, id: "src_bad" }, 10);
    expect(result.error).toBe("DNS resolution failed");
    expect(mockPrisma.feedHealth.create).toHaveBeenCalled();
    expect(mockPrisma.source.update).toHaveBeenCalled();
  });

  it("records recovery when a previously failing source succeeds", async () => {
    mockPrisma.feedHealth.findUnique.mockResolvedValue({ sourceId: "src_1", consecutiveFailures: 3 });
    await fetchSourceCandidates(source, 10);
    expect(mockPrisma.feedHealth.update).toHaveBeenCalled();
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
