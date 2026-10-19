# Phase 6: Per-feed ingestion limits

## Goal

Let the user allocate more of the existing ingestion capacity to preferred RSS
feeds and verify the saved global setting without starting an ingestion run.

## Scope

- Treat the saved global article limit as the total new-article budget per run
  (1–50) and divide it evenly among feeds by default.
- Allow optional per-feed allocations (1–50); remaining budget is divided
  evenly among feeds left on automatic allocation.
- Apply the override when slicing items already returned by the existing RSS
  parser. Keep the current global limit, deduplication, and AI behavior.
- Add an explicit Settings action to reload the saved preferences and show the
  configured global limit. It must not trigger feed fetching or ingestion.
- Add an additive nullable database column and update setup documentation.
- Test limit selection and validation with mocked parser/database calls only.

## Out of scope

- Do not invoke the ingestion worker or retrieve any feeds during this phase.
- No migration that drops or rewrites existing user data.
- No changes to feed URLs, schedules, retention, or provider behavior.
