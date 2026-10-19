# Architecture Overview

## High‑Level Diagram
```mermaid
flowchart TD
    subgraph Frontend[Next.js UI (Vercel)]
        UI[Reader UI & Settings]
    end
    subgraph API[Serverless API (Vercel)]
        Handlers[API Route Handlers]
        Prisma[Prisma Client]
    end
    subgraph DB[Supabase PostgreSQL]
        Tables[Articles, Sources, Categories, Bookmarks, Runs, Health]
    end
    subgraph Worker[GitHub Actions Worker]
        Ingest[Ingestion Script]
        Cleanup[Retention Script]
        AI[AI Provider Wrapper]
    end
    UI --> Handlers
    Handlers --> Prisma
    Prisma --> Tables
    Ingest --> AI
    Ingest --> Tables
    Cleanup --> Tables
    AI --> |calls| Gemini/Groq
    classDef cloud fill:#f0f9ff,stroke:#333,stroke-width:1px;
    class Frontend,API,Worker cloud;
```

## Data Flow
1. **User visits the Vercel‑hosted UI** → UI fetches articles via API routes (`/api/articles`).
2. **API routes** use Prisma (with RLS if auth enabled) to read/write Supabase tables.
3. **GitHub Actions** runs the ingestion script on schedule:
   - Pulls RSS feeds, normalises URLs, checks for duplicates.
   - Optionally extracts full article text (via `trafilatura`‑style logic).
   - Sends batched content to the AI provider wrapper.
   - Persists articles, summaries, relevance scores.
   - Records an `ingestion_run` entry for idempotency & diagnostics.
4. **Retention job** (also a GitHub Action) deletes non‑bookmarked articles older than the configured retention window.
5. **AI Provider Wrapper** abstracts Gemini and Groq, handling timeouts, retries, exponential back‑off, and fallback.

## Component Boundaries
| Component | Responsibility | Deployment | Key Tech |
|-----------|----------------|------------|----------|
| Frontend UI | Rendering feed list, article pane, bookmark UI | Vercel (static + serverless) | Next.js 16, React 19, Tailwind, shadcn/ui |
| API Handlers | Auth‑aware CRUD for articles, sources, settings | Vercel serverless functions | Next.js API routes, Prisma, Supabase client |
| Database | Persistent storage, RLS, row‑level ownership | Supabase (managed PostgreSQL) | Prisma schema, built‑in RLS |
| Ingestion Worker | Scheduled RSS fetch, deduplication, AI summarisation | GitHub Actions (node runtime) | Node/TS, rss‑parser, trafilatura‑style extraction, AI wrapper |
| Retention Job | Periodic cleanup of old, un‑bookmarked articles | GitHub Actions (cron) | Prisma, date‑fns |
| AI Provider Layer | Unified interface to Gemini & Groq with fallback | Runs inside the ingestion worker | TypeScript, fetch, timeout/retry logic |

## Security Boundaries
- **Secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`) are stored only in Vercel env vars (for API) or GitHub Actions secrets (for the worker).
- **RLS** is optional but recommended for multi‑user setups; policies restrict access to rows owned by the authenticated user.
- **Input validation**: RSS URLs are validated against a whitelist of `http/https` schemes, private‑IP blocks are blocked, and article content is sanitized before rendering.
- **Rate‑limit handling**: AI wrapper enforces per‑provider token caps and backs off on 429 responses.

---
*All architectural decisions reflect the constraints in the AGENTS.md and aim for a fully serverless, low‑cost MVP.*
