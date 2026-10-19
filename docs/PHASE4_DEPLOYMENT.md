# Phase 4: Reader settings and deployment

## User preferences

The Settings → Tuỳ chọn page saves summary language, article retention (30–60
days), and the global ingestion limit (1–50 articles per source) in the existing
`UserPreference` row. Settings → Nguồn allows a feed-specific limit (1–50); a
blank value inherits the global limit. These saved limits apply on later worker
runs. The Settings refresh action reloads saved preferences only and does not
fetch feeds or start ingestion. The cleanup worker reads the saved retention
period. AI provider credentials and provider/model selection remain server-side
environment configuration; they are not exposed in the reader settings or
browser.

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

## Configure the scheduled worker

In GitHub repository **Settings → Secrets and variables → Actions**, configure:

- Secrets: `DATABASE_URL` (Supabase transaction pooler) and at least one of
  `GEMINI_API_KEY` or `GROQ_API_KEY`.
- Variables: optionally `AI_PROVIDER` (defaults to `groq`), `AI_MODEL`
  (defaults to `gemini-3.8-flash`), `GROQ_MODEL` (defaults to
  `openai/gpt-oss-20b`), `DEFAULT_LANGUAGE`, `MAX_ARTICLES_PER_SOURCE`, and
  `MAX_ARTICLE_RETRIES_PER_RUN`.

The worker uses saved language and per-source limit preferences on later runs.
The cleanup worker uses the saved retention setting. Workflow cron times are UTC;
scheduled jobs can start late and are not a guaranteed uptime service. Use the
workflow **Run workflow** action to trigger a run manually.

## Check operations

- Settings → Lịch sử shows recent ingestion runs and the latest successful
  update time.
- Settings → Nguồn shows each feed's latest fetch and health state.
- `GET /api/runs` returns recent run status, counts, errors, and last successful
  update time; `GET /api/health` returns per-source health.
- Review Vercel function logs for reader/API failures and GitHub Actions logs
  for ingestion and cleanup failures. Logs must not contain connection strings
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
