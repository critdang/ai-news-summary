# Project Blueprint

## Vision
Create a personal AI‑powered news reader focused on **Software Engineering, AI/LLMs, Data Science, 3D Printing, 3D Modeling/CAD** and **Maker projects**. The app must be fast, responsive, and operable entirely on free‑tier services (Vercel, Supabase, GitHub Actions).

## Core Principles
- **Serverless first** – all background work runs in GitHub Actions; no always‑on server or Redis.
- **Security by design** – secrets live only in Vercel env vars or GitHub Actions secrets; RLS enforced when auth is enabled.
- **Modular reuse** – leverage proven patterns from the four reference repos while respecting their MIT licenses.
- **Idempotent ingestion** – duplicate articles are never created; runs can be re‑executed safely.
- **Configurable retention** – default 45 days, configurable 30‑60 days; bookmarks are never auto‑deleted.

## Milestones (Phase 0 → Phase 5)
| Phase | Target | Success Criteria |
|------|--------|------------------|
| 0 | Audit (completed) | Architecture, reuse map, risk register documented. |
| 1 | Documentation & blueprint (this phase) | `docs/` files added, AGENTS.md updated, implementation plan approved. |
| 2 | Minimum vertical slice | Database schema, one RSS source, deduplication, one AI provider, articles displayed, unit tests passing. |
| 3 | Full ingestion pipeline | Multiple sources/categories, scoring, provider fallback, health tracking, scheduled GH Actions, cleanup job. |
| 4 | UX polish & features | Settings, search, mobile responsiveness, accessibility, observability, deployment docs. |
| 5 | Operational reliability and reader completion | Recover failed AI summaries, honor provider rate limits, add deterministic local mock mode, and wire keyboard navigation. Semantic search, audio/MCP, and scheduled briefings remain optional extensions. |

## High‑Level Component Map
- **Frontend** – Next.js app (Feed2040 UI) deployed on Vercel.
- **API** – Vercel serverless route handlers (`src/app/api/*`).
- **Database** – Supabase PostgreSQL accessed via Prisma.
- **Ingestion Worker** – TypeScript script (`scripts/ingest.ts`) executed by GitHub Actions on schedule.
- **AI Provider Layer** – `src/lib/aiProvider.ts` abstracts Groq, Gemini, and mock mode with timeout/retry/fallback.
- **Retention Job** – `scripts/cleanup.ts` run as a separate GH Action.

## Risks & Mitigations
- **Quota exhaustion** – limit articles per source, honor provider retry windows, and bound queued summary retries.
- **Credential leakage** – never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser; keep it in GH Actions secrets.
- **RSS source failures** – each source processed independently; failures logged but do not abort the run.
- **Model failures** – fallback to alternative provider; persist partial results.

---
*All sections are intentionally concise to allow rapid iteration. Detailed implementation steps will be defined in subsequent phases.*
