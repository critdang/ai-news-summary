# Development Notes

## Tooling & Environment
- **Node**: v20 (runtime used by Vercel and GitHub Actions).  
- **Package manager**: npm (lockfile is `package-lock.json`).  
- **TypeScript**: strict mode enabled, target ES2022.  
- **Database client**: Prisma 7.x with the `@prisma/adapter-pg` for Supabase.
- **AI providers**: Gemini (via `google-generative-ai` REST endpoint) and Groq (`groq-sdk` wrapper).  
- **Linting/Formatting**: ESLint (config from Next.js) + Prettier (via `eslint-config-next`).
- **Testing**: Jest (unit) + Playwright (e2e).  
- **CI**: GitHub Actions workflow `ci.yml` runs `npm ci`, `npm run lint`, `npm run test`, and `npm run build` on every PR.

## Repository Layout (post‑Phase 1)
```
/docs/
  ├─ PROJECT_BLUEPRINT.md   # Vision, milestones, risk register (created)
  ├─ ARCHITECTURE.md        # System diagram, data flow, component map (created)
  └─ DEVELOPMENT_NOTES.md  # This file – developer onboarding & conventions

/Feed2040/                # Main application (UI + API)
  ├─ src/                # Next.js source tree
  ├─ prisma/             # Prisma schema & migrations
  ├─ scripts/            # Ingestion & cleanup workers (run by GH Actions)
  └─ .github/            # Workflows (ci.yml, ingest.yml, cleanup.yml)

/SummaRSS/               # Reference only – patterns for incremental RSS & GH Action
/rss-digest/             # Reference only – scoring & provider‑fallback logic
/ai‑daily‑summary/       # Reference only – daily briefing orchestration ideas
```

## Conventions
- **Commit messages**: follow Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`).
- **Branch strategy**: `main` protected, feature branches named `feat/<short‑desc>`.
- **PR checks**: CI must pass before merge; reviewers must confirm that any DB migration has been reviewed.
- **Licensing**: All copied MIT‑licensed code must retain the original license header and a comment indicating the source repository.
- **Environment variables**: Provide a `.env.example` with placeholders (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `RETENTION_DAYS`). Do **not** commit real values.

## Testing Strategy (Phase 2 onward)
1. **Unit tests** for:
   - URL normalisation & canonicalisation (`src/lib/urlUtils.ts`).
   - Deduplication logic (`src/lib/rssFetcher.ts`).
   - AI provider wrapper timeout/retry (`src/lib/aiProvider.ts`).
   - Relevance scoring (`src/lib/scoring.ts`).
2. **Integration tests** using a temporary Supabase project (or a Docker‑Postgres instance) to verify:
   - Prisma migrations apply cleanly.
   - API routes respect RLS when auth is enabled.
   - Ingestion script correctly upserts without creating duplicates.
3. **End‑to‑end UI tests** (Playwright) covering:
   - Feed list rendering.
   - Article view with AI summary.
   - Bookmark creation & persistence.
   - Settings persistence.

## CI Workflow Overview
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run test -- --ci
      - run: npm run build
```
A separate workflow (`ingest.yml`) will run on a cron schedule (`0 7 * * *` UTC) and on manual `workflow_dispatch`.

## Next Steps (Phase 2 preparation)
- Define the minimal Prisma schema (source, article, ingestion_run).  
- Scaffold `src/lib/aiProvider.ts` with the provider interface.  
- Write unit tests for the URL utilities.  
- Add the CI workflow file to `.github/workflows/ci.yml`.

---
*All notes are intended for developers joining the project after Phase 1. They will be refined as we progress through the subsequent phases.*
