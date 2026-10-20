# Phase 4: Reader settings and deployment

## User preferences

The Settings → Tuỳ chọn page saves summary language, article retention (30–60
days), and a total new-article budget (1–50) for each ingestion run. By default,
the worker splits that budget evenly across configured feeds. Settings → Nguồn
allows explicit per-feed allocations; the remaining budget is shared evenly
among feeds left on automatic allocation. Explicit allocations must sum to no
more than the total budget. The Settings refresh action reloads saved preferences
only and does not fetch feeds or start ingestion. The cleanup worker reads the
saved retention period. AI provider and model selection are stored per user.
Users can enter Gemini and Groq API keys in Settings; keys are encrypted in
Supabase using a key derived from `AUTH_SECRET` and are never returned to the
browser. Keep `AUTH_SECRET` stable when backing up or restoring encrypted keys.
Environment provider keys remain optional deployment defaults and fallbacks.

## Deploy the reader to Vercel

1. Import the GitHub repository into Vercel and select the Next.js framework.
2. Add `DATABASE_URL` to the Vercel project environment variables. Use the
   Supabase transaction pooler URL for the serverless app.
3. Set a strong random `AUTH_SECRET` in Vercel (or keep the legacy
   `NEXTAUTH_SECRET` variable used by existing Docker deployments) and apply
   the reviewed Prisma migrations to the Supabase database before the first
   reader request. The
   migration command loads `.env` and uses `DIRECT_URL` when available:

   ```sh
   node --env-file-if-exists=.env ./node_modules/prisma/build/index.js migrate deploy --config prisma/prisma.config.ts
   ```

   If both variables exist, `AUTH_SECRET` takes precedence. The secret must be
   at least 32 characters and must remain unchanged across deployments, or
   existing sessions and encrypted provider credentials will stop working.

4. Deploy and visit `/setup` to create the first admin account. Existing feeds,
   folders, preferences, and ingestion history are assigned to that account.
   Subsequent users can create accounts from `/register`; each user's feeds,
   articles, folders, preferences, and history are scoped to their account.

5. Add a strong random `CRON_SECRET` to the Vercel environment variables. Vercel
  sends it automatically when invoking the routes in `vercel.json`; it protects
  the ingestion and cleanup endpoints from public invocation. The reader refresh
button starts ingestion only for the signed-in user's feeds. API routes require
an authenticated session.

## Configure the scheduled worker

On the Vercel Hobby plan, Vercel deploys the schedules in `vercel.json`: ingestion
runs at 07:00 UTC, and retention cleanup runs at 08:30 UTC. Configure `DATABASE_URL`,
`DIRECT_URL`, `CRON_SECRET`, and the AI provider variables in the Vercel project.
For higher shared GitHub API quota in Discover → Projects, optionally set
`GITHUB_TOKEN` as a server-only Vercel variable. GitHub discovery still works
without it, subject to anonymous API limits. Never use a `NEXT_PUBLIC_` prefix.
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
