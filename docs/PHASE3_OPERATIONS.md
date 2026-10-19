# Phase 3 Operations

## Scheduled ingestion

`.github/workflows/ingest.yml` checks at 07:00 and 19:00 UTC and supports `workflow_dispatch` for manual runs. Settings selects whether scheduled runs proceed twice daily or once a day; manual runs always proceed immediately. The worker fetches feeds with bounded concurrency, deduplicates canonical URLs across sources, and persists each article separately with `pending` status. It does not call AI. The reader’s individual **AI Summary** action sends the saved article to the server-side provider and stores the validated result in Supabase. Daily Briefing also makes an explicit on-demand AI request. The worker records feed health and continues after an individual source failure.

Configure these repository **Actions secrets**:

- `DATABASE_URL`: server-side Supabase PostgreSQL connection string for the worker.

Optional repository **Actions variables**:

- `DEFAULT_LANGUAGE` (`vi` by default), used to initialize saved preferences.
- `MAX_ARTICLES_PER_RUN` (`50` total new articles across all feeds by default;
  divided evenly unless feed-specific allocations are configured)
- `FEED_FETCH_CONCURRENCY` (`4`) bounds parallel feed requests.

The saved **Settings → AI Provider** choice is used for on-demand summaries and
briefings. Store `GEMINI_API_KEY` and `GROQ_API_KEY` as Vercel server environment
variables, not Actions secrets. Settings checks provider authentication and
lists the models available to that account. If the selected service is not
configured or a request fails, another configured provider may be tried. Daily
briefings are generated on demand from at most 50 articles and are not persisted
as briefing history in this phase.

The schedule is UTC and may run late under GitHub Actions load. Manual dispatch uses the same secrets and worker limits.

The worker closes `running` ingestion records older than 30 minutes as failed
before starting a new run. Since ingestion no longer calls AI, provider
credentials and AI rate limits cannot prevent RSS article metadata from being
stored.

## Article retention

`.github/workflows/cleanup.yml` runs daily at 08:30 UTC. Scheduled runs apply cleanup. Manual runs default to preview; select `apply` only after reviewing the preview output. The local `npm run cleanup` command is preview-only by default; `npm run cleanup -- --apply` is required to delete.

Retention defaults to 45 days and accepts only whole days from 30 through 60. The saved `UserPreference.retentionDays` value takes precedence over `RETENTION_DAYS`. Eligibility is based on `firstSeenAt`; cleanup deletes only rows where `bookmarked` is false and `bookmarkNote` is null. The worker counts candidates before applying the same delete filter. Tests exercise the cutoff and preserved-row predicates without connecting to a database.

## Workflow safety

All workflows use read-only repository permissions. Ingestion and cleanup each have their own concurrency group to prevent overlapping runs of the same operation. Neither workflow runs migrations. Apply the reviewed baseline migration manually to a development database before configuring production secrets. The application is currently single-user and API routes do not enforce user authentication; keep the deployment private or behind Vercel Deployment Protection until that boundary is implemented.
