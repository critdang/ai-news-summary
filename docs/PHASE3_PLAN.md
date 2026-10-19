# Phase 3 Implementation Plan

## Phase 2 recheck

- The five Jest suites pass (34 tests).
- Prisma schema validation passes.
- The first root-level TypeScript/build check included the four ignored reference checkouts beneath the project root. The project now excludes those trees from TypeScript and Git tracking.
- The schema and worker already support multiple source/category records, relevance score/explanation, provider retry/fallback, and per-feed health. Phase 3 will preserve these features and close the missing operations and retention pieces.

## Scope

1. [x] Exclude reference repositories and generated output from project compilation and Git tracking.
2. [x] Ensure the six requested categories exist for a fresh installation; preserve dynamic source/category management.
3. [x] Add a retention worker with a 30–60 day setting (45 day default), preview-only default, and delete criteria that exclude bookmarks and notes.
4. [x] Add manual and twice-daily UTC GitHub Actions ingestion plus scheduled and manually previewable cleanup. Limit permissions, prevent overlapping runs, use Node 22, and keep secrets in Actions secrets.
5. [x] Add unit coverage for category bootstrap and retention selection/preview behavior; update setup documentation and example environment values.

No database schema change was needed: `Article` already has bookmark/note fields, `UserPreference` has a retention setting, and source/category/feed-health/run models already existed. No production database was accessed by this work.

## Outcome

Implemented on `codex/phase-3-ingestion-ops`. Tests, targeted lint, TypeScript, Prisma validation, workflow YAML parsing, and production build pass. The build used a throwaway local `DATABASE_URL`; it did not connect to a database.
