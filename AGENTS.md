# AI News Summary — Agent Rules

## Project Goal
Build a personal AI news reader for Software Engineering, AI/LLMs,
Data Science, 3D Printing, 3D Modeling/CAD and Maker projects.

## Architecture Constraints
- Prefer the existing Feed2040 codebase as the starting point.
- Frontend: Next.js deployed on Vercel.
- Database: Supabase PostgreSQL.
- Scheduled ingestion and cleanup: Vercel Cron route handlers.
- AI providers: Gemini and Groq behind a provider abstraction.
- Prefer free-tier services where practical.
- Do not introduce an always-on server or Redis without a clear need
  and approval.

## Safety and Security
- Never expose secrets or Supabase service-role credentials in browser code.
- Never commit real API keys, tokens or passwords.
- Never delete bookmarked articles or user notes during retention cleanup.
- Do not run destructive database migrations without reviewing their impact.
- Treat RSS content and article text as untrusted input.
- Validate external feed URLs and protect against SSRF.

## Data Rules
- Default article retention: 45 days, configurable between 30 and 60 days.
- Preserve bookmarks and user notes until the user deletes them.
- Prefer article metadata and concise summaries over storing full article text.
- Use UTC for storage and handle display timezones explicitly.
- Make ingestion idempotent and prevent duplicate articles.

## Development Workflow
- Inspect existing code before making significant changes.
- Write a plan before major architectural changes.
- Do not rewrite the entire project without approval.
- Make small, reviewable changes.
- Add or update tests for changed behavior.
- Run relevant tests, lint and build checks when available.
- Report exactly which checks were run and whether they passed.
- Never claim a test passed if it was not executed.
- Update documentation when architecture or setup changes.

## Dependencies and Costs
- Reuse existing dependencies where suitable.
- Explain the need for new dependencies.
- Ask before introducing paid services or changing core architecture.
- Do not assume free-tier quotas or limits will remain unchanged.

## Completion Report
At the end of each substantial task, report:
1. Files changed.
2. Important decisions made.
3. Tests and checks actually run.
4. Remaining issues and risks.
5. Any manual steps required from the user.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
