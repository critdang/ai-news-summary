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
    end
    UI --> Handlers
    Handlers --> Prisma
    Prisma --> Tables
    Ingest --> Tables
    Cleanup --> Tables
    Handlers --> |on-demand calls| Gemini/Groq
    classDef cloud fill:#f0f9ff,stroke:#333,stroke-width:1px;
    class Frontend,API,Worker cloud;
```

## Data Flow
1. **User visits the Vercel‑hosted UI** → UI fetches articles via API routes (`/api/articles`).
2. **API routes** use Prisma (with RLS if auth enabled) to read/write Supabase tables.
   - On-demand article summaries and Daily Briefing generation use the same
     server-side Gemini/Groq provider wrapper and the saved provider/model
     preference; API keys are never returned to the browser.
3. **GitHub Actions** checks the ingestion script at 07:00 and 19:00 UTC. Settings chooses a 12- or 24-hour minimum interval between scheduled runs; manual dispatch bypasses that cadence:
   - Fetches RSS/Atom feeds through the SSRF-hardened fetcher and parses feed
     metadata and excerpts; it does not fetch full article pages.
   - Canonicalizes article URLs and checks the database's unique canonical URL
     constraint so reruns and concurrent inserts do not create duplicates.
   - Fetches feeds concurrently with a configured bound, then deduplicates
     candidates across all feeds using canonical URLs.
   - Persists new article metadata as pending. Ingestion does not make AI calls,
     so provider errors and quotas cannot block RSS article storage.
   - Records feed health and ingestion diagnostics.
4. **Retention job** (also a GitHub Action) deletes non‑bookmarked articles older than the configured retention window.
5. **AI Provider Wrapper** abstracts Gemini, Groq, and deterministic mock mode,
   handling timeouts, provider fallback, retry guidance, and exponential back‑off.

## Component Boundaries
| Component | Responsibility | Deployment | Key Tech |
|-----------|----------------|------------|----------|
| Frontend UI | Three-panel feed reader, on-demand summaries, briefing filters, settings | Vercel (static + serverless) | Next.js 16, React 19, Tailwind, shadcn/ui |
| API Handlers | CRUD for articles, sources, settings | Vercel serverless functions | Next.js API routes, Prisma |
| Database | Persistent storage | Supabase (managed PostgreSQL) | Prisma schema; currently single-user without RLS policies |
| Ingestion Worker | Scheduled RSS fetch, deduplication, article metadata storage | GitHub Actions (node runtime) | Node/TS, rss-parser |
| Retention Job | Periodic cleanup of old, un‑bookmarked articles | GitHub Actions (cron) | Prisma, date‑fns |
| AI Provider Layer | Unified interface to Gemini, Groq, and mock mode | On-demand API routes | TypeScript, fetch, timeout/retry logic |

## Security Boundaries
- **Secrets** (`DATABASE_URL`, `GEMINI_API_KEY`, `GROQ_API_KEY`) are server-only. AI keys belong in Vercel environment variables for on-demand API routes; GitHub Actions ingestion only needs database access.
- **Authentication and row ownership are not implemented** for the reader/API. Keep hosted deployments private or behind Vercel Deployment Protection until authentication and RLS policies are added.
- **Input validation**: RSS URLs are validated against a whitelist of `http/https` schemes, private‑IP blocks are blocked, and article content is sanitized before rendering.
- **Rate‑limit handling**: AI wrapper honors provider `Retry-After` guidance for 429 responses and applies bounded exponential backoff for transient server errors. RSS ingestion splits the configured total new-article budget across feeds.

---
*All architectural decisions reflect the constraints in the AGENTS.md and aim for a fully serverless, low‑cost MVP.*
