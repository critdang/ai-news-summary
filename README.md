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

Requirements: Node.js 20 or later and npm.

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

Database migrations and deployment are described in the project documentation. Review a migration before applying it to any persistent database.

## Attribution and license

The reader started from [Feed2040](https://github.com/0xhav0c/Feed2040), distributed under MIT. Its original `LICENSE` is retained in this repository. The other three MIT-licensed projects were reviewed as references; their implementation code was not copied into this project. See the reference audit for details.
