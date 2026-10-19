# Phase 8: Reader, Briefing, and AI Settings

## Audit

The active MVP reader uses a category/source rail, a paginated article list,
and an overlay reader. It displays stored AI summaries but has no working
on-demand summary route. Daily briefing components from the upstream reader
are not connected to this app's simplified Article/Source schema. Existing
preferences store provider/model columns, but the settings UI and API expose
only language, retention, and ingestion limits.

## Scope

- Keep the current Next.js, Prisma, Supabase, and Gemini/Groq provider design.
- Add a responsive three-panel desktop reader; retain the overlay on small
  screens. Generate an article summary only when the reader requests it.
- Add a daily briefing page that selects recent articles, summarizes them in
  bounded batches, and lets the reader filter Critical, Medium, and Low items.
- Expose the saved provider and model choices in settings without returning
  credentials to the browser. Keep the configured provider as fallback when
  the selected provider is unavailable.
- Use Lucide icons next to navigation and actions, with accessible text and
  labels. No schema migration or new dependency is planned.

## Validation

Add mocked route/helper tests for request validation, severity mapping, and
provider selection. Run type checking, lint, Jest, Prisma validation, and the
production build. Do not call live AI providers or modify production data.
