# Phase 2 MVP: local setup

This vertical slice uses the existing Next.js reader, Supabase PostgreSQL through Prisma, one configurable RSS source, and the Gemini/Groq server-side provider wrapper.

## Prerequisites

- Node.js 22.9 or newer. The manual ingestion command uses Node's built-in TypeScript stripping and optional `.env` loading, so it does not add a TypeScript runner dependency.
- A Supabase PostgreSQL database.
- At least one server-side AI key (`GEMINI_API_KEY` or `GROQ_API_KEY`).

## First run

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, `DIRECT_URL`, and one AI key. Keep both database URLs and AI keys server-side.
   - `DATABASE_URL` can use Supabase's transaction pooler for the app and worker.
   - `DIRECT_URL` should be a direct or session-pooled PostgreSQL URL for Prisma migrations.
3. Review `prisma/migrations/20260101000000_init/migration.sql`. It is a fresh MVP baseline. Apply it with `npx prisma migrate deploy` only to an empty database, or after preparing a reviewed baseline/adoption plan for an existing database. This project has not run migrations against a Supabase database.
4. Start the app with `npm run dev`, then open `/settings` and add the source shown in `config/sources.example.json` (or another permitted RSS URL).
5. Run `npm run ingest` to fetch the configured sources, deduplicate by canonical URL, request summaries, and write articles and run diagnostics.
6. Open `/` to read the saved articles.

The ingestion script writes to the database. Use a development Supabase project for the first run. The GitHub Actions schedule and retention cleanup are Phase 3 work and are not configured yet.

## Current boundaries

- The reader, source management, article APIs, and ingestion worker are single-user MVP code. They do not yet enforce authentication or ownership checks. Keep this deployment local or behind Vercel Deployment Protection until an application-level access boundary is implemented.
- The worker and API require database access; no live database integration test was run as part of this phase.
- The provided source is an example only. Confirm a publisher's feed terms before using it.
