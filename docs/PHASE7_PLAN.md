# Phase 7: RSS batch processing

## Audit

The worker currently fetches feeds sequentially, deduplicates canonical URLs,
then makes one AI request and one article insert per new item. RSS parsing is
SSRF-hardened, the article table has a unique canonical URL, AI output is
validated with Zod, source failures are isolated, and GitHub Actions already
prevents overlapping scheduled/manual workers. New articles are not persisted
until after the AI request succeeds or fails.

## Vertical slice

- Fetch feeds with a bounded worker pool and retain per-source failure handling.
- Normalize and deduplicate candidates across feeds and against stored URLs.
- Save new metadata as pending before sending anything to AI.
- Batch across sources, constrained by item count, input characters, AI calls,
  and concurrency; use the current provider abstraction with batch JSON schema
  validation and fallback.
- Update only pending rows with validated summaries; preserve titles, links,
  source metadata, bookmarks, and notes. Unreturned items stay pending for a
  bounded later retry.
- Record batch, call, duplicate, skipped, input-size, latency, and run-duration
  diagnostics. Report provider token counts only when returned by the provider;
  also record a clearly labeled character-based estimate.
- Add mocked tests and document limits, metrics, and configuration. No live
  feeds, ingestion, or production DB mutation during development.

## Deferred

Near-duplicate clustering, source-title duplicate heuristics, global DB schema
changes beyond additive diagnostics, automatic token-price accounting, and
replacing the existing single-article retry path are deferred until the batch
pipeline is measured.
