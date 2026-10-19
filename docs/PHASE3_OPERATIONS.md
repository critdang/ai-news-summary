# Phase 3 Operations

## Scheduled ingestion

`.github/workflows/ingest.yml` runs at 07:00 and 19:00 UTC and supports `workflow_dispatch` for manual runs. The worker processes each saved source independently, stores canonical-URL deduplicated articles, records feed health and run diagnostics, and continues after an individual source failure. It makes one AI call per new article and retries a bounded number of previously failed or pending summaries on each run. Gemini and Groq retries/fallback are server-side and only configured keys are attempted.

Configure these repository **Actions secrets**:

- `DATABASE_URL`: server-side Supabase PostgreSQL connection string for the worker.
- `GEMINI_API_KEY` and/or `GROQ_API_KEY`: at least one provider key.

Optional repository **Actions variables**:

- `AI_PROVIDER` (`groq` by default; `gemini` or `mock` are also available),
  `AI_MODEL` (`gemini-3.8-flash`), `GROQ_MODEL` (`openai/gpt-oss-20b`)
- `DEFAULT_LANGUAGE` (`vi` by default)
- `MAX_ARTICLES_PER_RUN` (`50` total new articles across all feeds by default;
  divided evenly unless feed-specific allocations are configured)
- `MAX_ARTICLE_RETRIES_PER_RUN` (`25` by default)

The schedule is UTC and may run late under GitHub Actions load. Manual dispatch uses the same secrets and worker limits.

The worker closes `running` ingestion records older than 30 minutes as failed
before starting a new run. Summary retries update only AI fields and processing
status; article URLs, bookmarks, and notes are left alone. Set
`MAX_ARTICLE_RETRIES_PER_RUN=0` only if retries should be paused; the current
worker enforces a minimum retry batch of one when the setting is non-positive.

## Article retention

`.github/workflows/cleanup.yml` runs daily at 08:30 UTC. Scheduled runs apply cleanup. Manual runs default to preview; select `apply` only after reviewing the preview output. The local `npm run cleanup` command is preview-only by default; `npm run cleanup -- --apply` is required to delete.

Retention defaults to 45 days and accepts only whole days from 30 through 60. The saved `UserPreference.retentionDays` value takes precedence over `RETENTION_DAYS`. Eligibility is based on `firstSeenAt`; cleanup deletes only rows where `bookmarked` is false and `bookmarkNote` is null. The worker counts candidates before applying the same delete filter. Tests exercise the cutoff and preserved-row predicates without connecting to a database.

## Workflow safety

All workflows use read-only repository permissions. Ingestion and cleanup each have their own concurrency group to prevent overlapping runs of the same operation. Neither workflow runs migrations. Apply the reviewed baseline migration manually to a development database before configuring production secrets. The application is currently single-user and API routes do not enforce user authentication; keep the deployment private or behind Vercel Deployment Protection until that boundary is implemented.
