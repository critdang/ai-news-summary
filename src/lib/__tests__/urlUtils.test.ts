/**
 * src/lib/__tests__/urlUtils.test.ts
 *
 * Unit tests for URL canonicalization and title normalization used in
 * article deduplication.
 */

import { canonicalizeUrl, normalizeTitle } from "@/lib/urlUtils";

describe("canonicalizeUrl", () => {
  it("strips tracking/utm query params", () => {
    expect(
      canonicalizeUrl("https://example.com/article?utm_source=feed&utm_campaign=x&id=123")
    ).toBe("https://example.com/article?id=123");
  });

  it("lowercases the hostname", () => {
    expect(canonicalizeUrl("https://Example.COM/Article")).toBe(
      "https://example.com/Article"
    );
  });

  it("removes default ports", () => {
    expect(canonicalizeUrl("http://example.com:80/article")).toBe(
      "http://example.com/article"
    );
    expect(canonicalizeUrl("https://example.com:443/article")).toBe(
      "https://example.com/article"
    );
  });

  it("removes trailing slash on path (but keeps root)", () => {
    expect(canonicalizeUrl("https://example.com/article/")).toBe(
      "https://example.com/article"
    );
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("removes fragment", () => {
    expect(canonicalizeUrl("https://example.com/article#section")).toBe(
      "https://example.com/article"
    );
  });

  it("treats same article via different tracking URLs as identical", () => {
    const a = canonicalizeUrl(
      "https://example.com/news/item?utm_source=rss&ref=nav"
    );
    const b = canonicalizeUrl("https://example.com/news/item?utm_medium=email");
    expect(a).toBe(b);
    expect(a).toBe("https://example.com/news/item");
  });

  it("rejects invalid and non-http URLs while preserving path case", () => {
    expect(canonicalizeUrl("not-a-url")).toBe("");
    expect(canonicalizeUrl("javascript:alert(1)")).toBe("");
    expect(canonicalizeUrl("  https://example.com/Item  ")).toBe(
      "https://example.com/Item"
    );
    // Hostname is lowercased.
    expect(canonicalizeUrl("https://Example.COM/Item")).toBe(
      "https://example.com/Item"
    );
  });
});

describe("normalizeTitle", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeTitle("  Hello   World  ")).toBe("hello world");
  });

  it("removes punctuation", () => {
    expect(normalizeTitle("AI: The Future (2026)!")).toBe("ai the future 2026");
  });
});
