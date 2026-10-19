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
   - Fetches RSS/Atom feeds through the SSRF-hardened fetcher and parses feed
     metadata and excerpts; it does not fetch full article pages.
   - Canonicalizes article URLs and checks the database's unique canonical URL
     constraint so reruns and concurrent inserts do not create duplicates.
   - Calls the AI provider once per new article, then retries existing pending
     or failed summaries on later runs within a configured per-run limit.
   - Persists article metadata, summaries, relevance scores, feed health, and
     ingestion run diagnostics.
4. **Retention job** (also a GitHub Action) deletes non‑bookmarked articles older than the configured retention window.
5. **AI Provider Wrapper** abstracts Gemini, Groq, and deterministic mock mode,
   handling timeouts, provider fallback, retry guidance, and exponential back‑off.

## Component Boundaries
| Component | Responsibility | Deployment | Key Tech |
|-----------|----------------|------------|----------|
| Frontend UI | Rendering feed list, article pane, bookmark UI | Vercel (static + serverless) | Next.js 16, React 19, Tailwind, shadcn/ui |
| API Handlers | CRUD for articles, sources, settings | Vercel serverless functions | Next.js API routes, Prisma |
| Database | Persistent storage | Supabase (managed PostgreSQL) | Prisma schema; currently single-user without RLS policies |
| Ingestion Worker | Scheduled RSS fetch, deduplication, AI summarisation | GitHub Actions (node runtime) | Node/TS, rss-parser, AI wrapper |
| Retention Job | Periodic cleanup of old, un‑bookmarked articles | GitHub Actions (cron) | Prisma, date‑fns |
| AI Provider Layer | Unified interface to Gemini, Groq, and mock mode | Runs inside the ingestion worker | TypeScript, fetch, timeout/retry logic |

## Security Boundaries
- **Secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`) are stored only in Vercel env vars (for API) or GitHub Actions secrets (for the worker).
- **Authentication and row ownership are not implemented** for the reader/API. Keep hosted deployments private or behind Vercel Deployment Protection until authentication and RLS policies are added.
- **Input validation**: RSS URLs are validated against a whitelist of `http/https` schemes, private‑IP blocks are blocked, and article content is sanitized before rendering.
- **Rate‑limit handling**: AI wrapper honors provider `Retry-After` guidance for 429 responses and applies bounded exponential backoff for transient server errors. The application splits a total new-article budget across feeds and bounds summary retries per run.

---
*All architectural decisions reflect the constraints in the AGENTS.md and aim for a fully serverless, low‑cost MVP.*
