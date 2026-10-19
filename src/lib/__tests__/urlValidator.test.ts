/**
 * src/lib/__tests__/urlValidator.test.ts
 *
 * Unit tests for SSRF-protected URL validation (reuse from Feed2040).
 */

import { validateFeedUrl, isPrivateIP } from "@/lib/utils/url-validator";

describe("validateFeedUrl", () => {
  it("accepts http and https URLs", () => {
    expect(validateFeedUrl("https://example.com/feed.xml").valid).toBe(true);
    expect(validateFeedUrl("http://example.com/feed.xml").valid).toBe(true);
  });

  it("rejects non-http schemes", () => {
    expect(validateFeedUrl("ftp://example.com/feed").valid).toBe(false);
    expect(validateFeedUrl("file:///etc/passwd").valid).toBe(false);
    expect(validateFeedUrl("javascript:alert(1)").valid).toBe(false);
  });

  it("blocks private/internal IPs (SSRF)", () => {
    expect(validateFeedUrl("http://127.0.0.1/feed").valid).toBe(false);
    expect(validateFeedUrl("http://localhost/feed").valid).toBe(false);
    expect(validateFeedUrl("http://10.0.0.1/feed").valid).toBe(false);
    expect(validateFeedUrl("http://192.168.1.1/feed").valid).toBe(false);
    expect(validateFeedUrl("http://172.16.0.1/feed").valid).toBe(false);
    expect(validateFeedUrl("http://169.254.169.254/feed").valid).toBe(false);
    expect(validateFeedUrl("http://[::1]/feed").valid).toBe(false);
  });

  it("blocks metadata and single-label hostnames", () => {
    expect(validateFeedUrl("http://metadata.google.internal/feed").valid).toBe(false);
    expect(validateFeedUrl("http://myserver/feed").valid).toBe(false);
  });

  it("rejects empty or invalid input", () => {
    expect(validateFeedUrl("").valid).toBe(false);
    expect(validateFeedUrl("not a url").valid).toBe(false);
    expect(validateFeedUrl(undefined as unknown as string).valid).toBe(false);
  });
});

describe("isPrivateIP", () => {
  it("detects IPv4 private ranges", () => {
    expect(isPrivateIP("10.0.0.1")).toBe(true);
    expect(isPrivateIP("172.16.0.1")).toBe(true);
    expect(isPrivateIP("172.31.255.255")).toBe(true);
    expect(isPrivateIP("192.168.1.1")).toBe(true);
    expect(isPrivateIP("127.0.0.1")).toBe(true);
    expect(isPrivateIP("169.254.169.254")).toBe(true);
  });

  it("detects public IPs as not private", () => {
    expect(isPrivateIP("8.8.8.8")).toBe(false);
    expect(isPrivateIP("1.1.1.1")).toBe(false);
  });

  it("detects IPv6 private/loopback", () => {
    expect(isPrivateIP("::1")).toBe(true);
    expect(isPrivateIP("fc00::1")).toBe(true);
    expect(isPrivateIP("fd00::1")).toBe(true);
    expect(isPrivateIP("fe80::1")).toBe(true);
    expect(isPrivateIP("2001:4860:4860::8888")).toBe(false);
  });
});
