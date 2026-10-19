# Reference Repository Audit

Reviewed locally cloned source trees and dependency manifests on 2026-10-19. The MIT license terms permit copying and modification provided the original copyright and permission notice is retained. The Feed2040 `LICENSE` file was copied with the application. The other projects informed design choices only; no source files from them were copied.

## Feed2040

- Source: [0xhav0c/Feed2040](https://github.com/0xhav0c/Feed2040)
- License: MIT; original `LICENSE` retained at the project root.
- Inspected: `package.json`, `src/app`, `src/components`, `src/lib`, `prisma/schema.prisma`, `scripts`, and the README.
- Dependencies: Next.js 16 / React 19 / TypeScript; Prisma 7 and PostgreSQL adapter; `rss-parser`; Zod; Jest/ts-jest; plus UI, authentication, AI, Telegram, Redis, and web-push packages in the upstream manifest. The existing lockfile was carried over. Redis, Telegram polling, and other always-running behavior are outside this project's initial serverless target and need review before use.
- Reuse: Next.js reader structure, article interaction patterns, UI components, and initial project scaffold. The copied application is adapted to this project's Vercel/Supabase/GitHub Actions plan.

## SummaRSS

- Source: [liusonwood/SummaRSS](https://github.com/liusonwood/SummaRSS)
- License: MIT.
- Inspected: `summarize.py`, `requirements.txt`, workflow files, and README.
- Dependencies: Python standard library plus `trafilatura` for article extraction.
- Relevant patterns: scheduled GitHub Actions, per-source processing, bounded batches, processed-item tracking, and restrained extraction. This project uses a database-backed idempotency model instead of copying its Git-as-database implementation.

## rss-digest

- Source: [bkubinszky/rss-digest](https://github.com/bkubinszky/rss-digest)
- License: MIT.
- Inspected: `fetcher.py`, `analyzer.py`, `config.py`, `health.py`, `mock.py`, `requirements.txt`, workflow files, and README.
- Dependencies: pinned `feedparser==6.0.11` and `groq==0.13.0`; Gemini calls use Python's standard-library HTTP client.
- Relevant patterns: independent feed failure handling, timeouts/retries, Gemini-to-Groq fallback, mock mode, feed-health reporting, and structured run diagnostics. The reference README reports deduplication has been removed, so this project must keep its own deduplication behavior.

## ai-daily-summary

- Source: [AlexisBalayre/ai-daily-summary](https://github.com/AlexisBalayre/ai-daily-summary)
- License: MIT.
- Inspected: `ai_daily/etl` extractors, transformers and pipeline; DB models/migrations; API; frontend; tests; `pyproject.toml`; and README.
- Dependencies: Python 3.12+, Google GenAI, aiohttp/requests, BeautifulSoup, feedparser, trafilatura, SQLAlchemy/asyncpg/psycopg2, Alembic, pgvector, Google APIs, FastAPI/Uvicorn, Click, and Rich; optional Playwright and TTS dependencies. The repo also includes a separately managed React/Vite frontend.
- Relevant patterns: modular multi-source ETL, structured enrichment, deduplication, database migrations, and tests. pgvector, Gmail, audio, MCP, and the always-running API/scheduler are outside the MVP.

## Compatibility and attribution notes

The three reference implementations use Python workers while the application being adapted is TypeScript/Next.js. Their workflows and boundaries are useful design references, but bringing in their Python dependency sets would duplicate the current application stack. The planned ingestion worker stays TypeScript unless a later decision documents a concrete reason to add Python.

This audit covers the repositories' declared direct dependencies, not the separate licenses of every transitive package. Their upstream manifests and lockfiles remain the authoritative dependency records. Keep the Feed2040 MIT notice with copied substantial portions and record any future code copied from another project with its source and license notice.
