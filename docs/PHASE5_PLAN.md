# Phase 5: Reliability and Reader Follow-through

## Goal

Close the operational gaps found when comparing this app with Feed2040,
SummaRSS, rss-digest, and ai-daily-summary. Keep the single-user Next.js,
Supabase PostgreSQL, and GitHub Actions architecture. Do not add a paid service,
always-on worker, Python runtime, Redis, pgvector, MCP, or audio feature.

## Scope

1. Align local and GitHub Actions provider defaults with the verified Groq
   model; do not change or expose provider credentials.
2. Make transient AI throttling honor `Retry-After` and Groq's retry guidance.
3. Retry persisted `failed` / `pending` article summaries on later ingestion
   runs without inserting duplicate articles or changing bookmarks and notes.
4. Add deterministic mock provider behavior and tests for model selection,
   retry/backoff, and existing-article recovery.
5. Wire keyboard navigation into the active reader and document its shortcuts.
6. Correct architecture and operations documentation to describe the actual
   per-article AI calls and RSS metadata handling. Keep exact canonical-URL
   deduplication; leave semantic deduplication and daily briefing as future
   work. The old `Sidebar` and `DigestModal` components are not mounted in the
   active reader, so no new digest API or schema is in scope.

## Sequence

1. Fix provider/workflow defaults and rate-limit behavior.
2. Add safe retry processing for saved articles and run diagnostics.
3. Add mock-mode and regression tests.
4. Add reader keyboard navigation and update documentation.
5. Review the diff, run targeted tests/lint/type checks/build where available,
   then commit and push this branch with descriptive messages.

## Data and deployment safety

- No database schema change or migration is planned.
- Retry updates only AI summary fields and processing status. Bookmarks and
  notes remain untouched.
- Database URL, API keys, and populated `.env` values stay out of Git and logs.
- Existing per-run and per-source limits continue to bound work.
