# AI News Summary

A personal news reader for software engineering, AI/LLMs, data science, 3D printing, CAD, and maker projects. This repository contains the application at its root so changes are tracked together with its project documentation.

## Current direction

- Next.js reader and server routes, deployed on Vercel.
- Supabase PostgreSQL for article and source data.
- A short-lived ingestion worker scheduled with GitHub Actions.
- Server-side AI provider integration; credentials stay in server or Actions secrets.
- No always-on server or Redis requirement for the planned single-user deployment.

Phase and setup details are in [the project blueprint](docs/PROJECT_BLUEPRINT.md), [architecture](docs/ARCHITECTURE.md), [development notes](docs/DEVELOPMENT_NOTES.md), and [Phase 2 MVP notes](docs/PHASE2_MVP.md). The four-repository source, dependency, and license review is recorded in [the reference audit](docs/REFERENCE_REPOSITORIES.md).

## Local development

Requirements: Node.js 22.9 or later and npm.

```sh
npm ci
cp .env.example .env
npm run dev
```

Configure the values in `.env` for the services you use. Never commit populated credentials. The Supabase service-role key belongs only in GitHub Actions secrets; it must not be exposed to browser code.

Available project commands:

```sh
npm test -- --runInBand
npm run lint
npx tsc --noEmit --incremental false
npx next build --webpack
```

`npm run ingest` fetches configured RSS sources, deduplicates items, and stores each article separately without making AI calls. Article summaries are generated and saved only when requested from the reader; Daily Briefing is also generated on demand. Settings lets you choose scheduled RSS collection twice daily or daily; GitHub Actions checks at 07:00 and 19:00 UTC, while manual refresh runs immediately. `npm run cleanup` only previews eligible expired rows; use `npm run cleanup -- --apply` to delete eligible rows. Cleanup retains bookmarked articles and any article with a note. Review database migrations before applying them to a persistent database.

In Settings, the global new-article limit is the total budget across all feeds
per RSS run. The worker divides it evenly by default. Set a custom allocation under
**Sources** for preferred feeds; the remaining budget is divided among feeds on
automatic allocation. Apply pending Prisma
migrations before using new database fields.

In the reader, press `J`/`K` to move between articles, `/` to focus search, `B` to toggle the selected bookmark, and `Escape` to close the article panel.

The reader uses three panels for feed navigation, article selection, and reading. Daily Briefing opens inside the home reader and summarizes up to 50 articles from a selectable time range, with Critical, Medium, and Low relevance filters. Briefings are generated on demand and are not archived yet. The refresh button dispatches the existing GitHub Actions ingestion workflow and reloads articles when the run succeeds. Configure server-only `GITHUB_TOKEN` and `GITHUB_REPOSITORY` values to enable it; the token needs Actions read/write access to the repository. Choose the provider/model for on-demand AI work under **Settings → AI Provider**; the settings page checks the key and model against the provider API. RSS ingestion does not use AI credentials.

GitHub Actions operations, required repository secrets, the UTC schedule, and cleanup modes are documented in [Phase 3 operations](docs/PHASE3_OPERATIONS.md). Vercel deployment, reader settings, and operational checks are documented in [Phase 4 deployment](docs/PHASE4_DEPLOYMENT.md).

## Attribution and license

The reader started from [Feed2040](https://github.com/0xhav0c/Feed2040), distributed under MIT. Its original `LICENSE` is retained in this repository. The other three MIT-licensed projects were reviewed as references; their implementation code was not copied into this project. See the reference audit for details.
