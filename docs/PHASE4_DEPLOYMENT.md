# Phase 4: Reader settings and deployment

## User preferences

The Settings → Tuỳ chọn page saves summary language, article retention (30–60
days), and a total new-article budget (1–50) for each ingestion run. By default,
the worker splits that budget evenly across configured feeds. Settings → Nguồn
allows explicit per-feed allocations; the remaining budget is shared evenly
among feeds left on automatic allocation. Explicit allocations must sum to no
more than the total budget. The Settings refresh action reloads saved preferences
only and does not fetch feeds or start ingestion. The cleanup worker reads the
saved retention period. AI provider credentials and provider/model selection
remain server-side environment configuration; they are not exposed in the reader
settings or browser.

## Deploy the reader to Vercel

1. Import the GitHub repository into Vercel and select the Next.js framework.
2. Add `DATABASE_URL` to the Vercel project environment variables. Use the
   Supabase transaction pooler URL for the serverless app.
3. Apply the reviewed Prisma migrations to the Supabase database before the first
   reader request. The migration command loads `.env` and uses `DIRECT_URL` when available:

   ```sh
   node --env-file-if-exists=.env ./node_modules/prisma/build/index.js migrate deploy --config prisma/prisma.config.ts
   ```

4. Deploy and confirm the reader loads and `/api/runs` and `/api/health` respond.
   The app is currently single-user and does not authenticate reader/API routes.
   Keep the Vercel project private with Deployment Protection or another trusted
   access boundary. Do not expose it publicly until authentication and database
   ownership policies are implemented.

5. Add a strong random `CRON_SECRET` to the Vercel environment variables. Vercel
  sends it automatically when invoking the routes in `vercel.json`; it protects
  the ingestion and cleanup endpoints from public invocation. The reader refresh
  button starts the same ingestion worker directly and polls its database-backed
  run status. Keep Vercel Deployment Protection enabled because API routes are
  single-user and do not enforce application authentication.

## Configure the scheduled worker

On the Vercel Hobby plan, Vercel deploys the schedules in `vercel.json`: ingestion
runs at 07:00 UTC, and retention cleanup runs at 08:30 UTC. Configure `DATABASE_URL`,
`DIRECT_URL`, `CRON_SECRET`, and the AI provider variables in the Vercel project.
The worker uses saved language and the total article budget on later runs; cleanup
uses the saved retention setting. Cron availability and execution duration depend
on the Vercel plan, so review the project usage and function logs after deployment.

## Check operations

- Settings → Lịch sử shows recent ingestion runs and the latest successful
  update time.
- Settings → Nguồn shows each feed's latest fetch and health state.
- `GET /api/runs` returns recent run status, counts, errors, and last successful
  update time; `GET /api/health` returns per-source health.
- Review Vercel function logs for reader/API, ingestion, and cleanup failures.
  Logs must not contain connection strings
  or API keys.

## Recovery and data safety

Supabase remains the system of record. Before production use, enable and review
Supabase backups appropriate to the project plan and periodically verify a
restore path. Export articles and source configuration before large schema or
retention changes. Cleanup preserves bookmarked articles and articles with
bookmark notes. See [Phase 3 operations](PHASE3_OPERATIONS.md) for preview and
apply behavior.

Free-tier quotas, project pausing, and scheduled-job availability can change.
Check current provider dashboards and Supabase/Vercel usage before increasing
source counts or run frequency.
