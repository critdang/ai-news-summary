# Development Notes

## Tooling

- Node.js 22.9 or newer; npm and the tracked `package-lock.json`.
- TypeScript strict mode, Next.js 16, React 19.
- Prisma 7 with the PostgreSQL adapter for Supabase.
- Gemini and Groq through `src/lib/aiProvider.ts`.
- Jest unit tests and ESLint. GitHub Actions CI runs targeted lint, tests, type-checking, Prisma validation, and a production build.

## Repository layout

The repository root is the Next.js application root.

```text
src/                     Reader, API routes and shared libraries
prisma/                  PostgreSQL schema and migrations
scripts/                 RSS ingestion and retention worker
.github/workflows/       CI, scheduled/manual ingestion and cleanup
config/                  Example source configuration
docs/                    Architecture, operation and phase documentation
```

Reference repositories kept locally under `Feed2040/`, `SummaRSS/`, `rss-digest/` and `ai-daily-summary/` are ignored by Git and excluded from the TypeScript program.

## Conventions

- Use conventional commit messages (`feat:`, `fix:`, `docs:`, `refactor:`).
- Create work branches with a `codex/` prefix and open a pull request to `main`.
- Review migration impact before applying it to a persistent database.
- Keep API keys, database URLs and passwords out of source control. `.env.example` contains placeholders only.
- Preserve the Feed2040 MIT notice for the copied reader and add attribution/license notices if source code from another project is copied later.

## Checks

```sh
npm test -- --runInBand
npm run lint -- src/lib scripts
npx tsc --noEmit --incremental false
npx prisma validate
npx next build --webpack
```

The production build imports database-backed routes during page collection, so set a safe local `DATABASE_URL` when building if the environment does not already provide one. The build does not need to connect to that database.

## Operations

- The ingestion worker supports multiple saved sources, canonical URL deduplication, metadata-only storage, and feed-health/run diagnostics. AI summaries run on demand from the reader; Daily Briefing is also on demand.
- Ingestion runs twice daily at 07:00 and 19:00 UTC and can be started with `workflow_dispatch`.
- Cleanup runs daily at 08:30 UTC. Manual runs preview by default; scheduled cleanup applies the configured retention rule.
- Retention is 45 days by default (allowed range: 30–60 days), and cleanup preserves bookmarked articles and all articles with notes.
- See [Phase 3 operations](PHASE3_OPERATIONS.md) for Actions secrets, variables, and the cleanup preview/apply process.
