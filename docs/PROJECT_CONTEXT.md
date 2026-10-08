# Pactrieve: project context

**Tagline:** Every answer, traceable.

**Assignment:** Six-page SDE legal-contract web app (see `ASSIGNMENT_SOURCE.md` / SDE Assignment.pdf). Deadline: 3 days from receipt. Most important requirement: independently verified quotes with exact source navigation. Parts A and B required; Part C Option 2 selected (agentic document research).

**Governance:** `AGENTS.md` reading order. Phase gates: `docs/phases.md`. Design: `docs/Design.md` (tokens not yet applied to UI).

## Phase status (2026-10-08)

- **Phase 0:** Complete — foundation bootstrap + governance.
- **Phase 1:** Complete — ingestion lifecycle verified live.
- **Phase 2:** Implementation complete in working tree (**uncommitted — user commits manually**). Structure-aware chunking, phrase-safe lexical retrieval, coverage semantics, reindex helper, realistic 150-page fixture tests + live Supabase retrieval checks.
- **Phase 3+:** Not started. Do not auto-start.

## Current implementation

- Document upload/extract/library/delete (Phase 1).
- Structure-aware chunking (`src/lib/documents/chunks.ts`) with section detection and offset-faithful slices.
- Retrieval service (`src/lib/retrieval/*`): document-scoped search, phrase/amount-safe ranking, optional Postgres FTS/ILIKE candidate discovery, bounded context expansion, typed coverage statuses that never treat top-k miss as proof of absence.
- Deterministic quote verifier unchanged.
- No LLM chat, highlighting, multi-doc synthesis, comparison, or agent tools.

## Code map (Phase 2 additions)

- `src/lib/documents/chunks.ts` — structure-aware chunker + `detectSections`.
- `src/lib/retrieval/{types,query,memory,expand,pages,supabase,index}.ts` — retrieval API for Phase 3+.
- `db/migrations/20261008_phase2_search_helper.sql` — optional `pactrieve_search_chunks` RPC (additive; app works without it).
- `fixtures/phase2-contract-150.{txt,pdf}` — denser synthetic 150-page contract.
- `tests/retrieval.test.mts` — deterministic retrieval cases.
- `scripts/phase2-live-retrieval.mjs` — live Supabase retrieval smoke.

## Retrieval contract for Phase 3

Call `retrieveDocument({ documentId, query, limit, mode, expand })` → `RetrievalResult` with `passages[]` (offsets, pages, sectionLabel, content) and `coverage.status`:

- `MATCHES_FOUND`
- `NO_MATCH_ESTABLISHED` / `SEARCH_LIMITED` (not proof of absence)
- `PARTIAL_SOURCE` (unreadable pages)
- `DOCUMENT_UNAVAILABLE` / `SEARCH_FAILED`

Chat must abstain or hedge when coverage is not `MATCHES_FOUND`, and must still run `verifyQuote` on any displayed quotation.

## Next immediate steps

1. User reviews/commits Phase 2 when satisfied.
2. Phase 3 — grounded streaming single-document chat using this retrieval contract.

## Ground rules

No API secrets in repo, no fictional test results, no trusting model-provided source locations, no automatic phase advance or agent commits for Phase 2.
