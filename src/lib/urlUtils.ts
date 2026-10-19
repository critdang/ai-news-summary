/**
 * src/lib/urlUtils.ts
 *
 * URL normalization helpers used for article deduplication.
 *
 * Dedup is by canonicalized URL (and optionally normalized title/source).
 * Canonicalization strips tracking parameters, normalizes the host, and removes
 * trailing slashes so that the same article fetched via different URLs is
 * recognized as a duplicate.
 */

import { cleanTrackingParams } from "./utils/url-cleaner.ts";

/**
 * Canonicalize a URL for dedup comparison.
 * - Strips tracking / utm / referral query params.
 * - Lowercases the hostname.
 * - Removes default ports (80 for http, 443 for https).
 * - Removes trailing slash on the path.
 * - Removes fragment.
 */
export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());

    // Only http/https are valid for our purposes.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    // Lowercase hostname.
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove default ports.
    if (
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443")
    ) {
      parsed.port = "";
    }

    // Strip tracking params.
    const cleaned = cleanTrackingParams(parsed.toString());
    const reparsed = new URL(cleaned);

    // Remove fragment.
    reparsed.hash = "";

    // Remove trailing slash on path (keep root "/").
    if (reparsed.pathname.length > 1 && reparsed.pathname.endsWith("/")) {
      reparsed.pathname = reparsed.pathname.slice(0, -1);
    }

    return reparsed.toString();
  } catch {
    // Invalid feed links cannot be safely stored or used as deduplication keys.
    return "";
  }
}

/**
 * Normalize a title for dedup comparison: lowercase, collapse whitespace,
 * remove common punctuation.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
