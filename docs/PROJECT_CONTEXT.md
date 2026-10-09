# Pactrieve: project context

**Tagline:** Every answer, traceable.

**Assignment:** Six-page SDE legal-contract web app (see `ASSIGNMENT_SOURCE.md` / SDE Assignment.pdf). Deadline: 3 days from receipt. Most important requirement: independently verified quotes with exact source navigation. Parts A and B required; Part C Option 2 selected (agentic document research).

**Governance:** `AGENTS.md` reading order. Phase gates: `docs/phases.md`. Design: `docs/Design.md`.

## Phase status (2026-10-09)

- **Phase 0–10:** Complete (committed through `7c02bbc` — bounded agentic research).
- **Phase 11:** Release hardening in working tree (**uncommitted — user commits manually**). Public-API access gate, error hardening, duration headroom, production-mode smoke. See `docs/PHASE11_RELEASE_AUDIT.md`.
- **Phase 12+:** Not started. Do not auto-start. Public deploy requires `PACTRIEVE_ACCESS_TOKEN`.

## Current implementation

- Phases 1–10 as previously documented (Ask Documents, Agent Research, Compare Versions).
- **Phase 11 additions:**
  - Optional `PACTRIEVE_ACCESS_TOKEN` middleware gate for `/api/*` + library unlock UI.
  - Safer public error messages on several routes.
  - Process `maxDuration` 120s; agent research 90s.
  - Access-gate unit tests (`tests/access.test.mts`).

## Next immediate steps

1. User reviews/commits Phase 11.
2. Phase 12 — configure secrets + access token, deploy, evaluator acceptance on live URL.

## Ground rules

No API secrets in repo, no fictional test results, no trusting model-provided source locations, no automatic phase advance or agent commits.
