# Pactrieve: project context

**Tagline:** Every answer, traceable.

**Assignment:** Six-page SDE legal-contract web app (see `ASSIGNMENT_SOURCE.md` / SDE Assignment.pdf). Deadline: 3 days from receipt. Most important requirement: independently verified quotes with exact source navigation. Parts A and B required; Part C Option 2 selected (agentic document research).

**Governance:** `AGENTS.md` reading order. Phase gates: `docs/phases.md`. Design: `docs/Design.md` (tokens partially reflected in current CSS).

## Phase status (2026-10-09)

- **Phase 0–2:** Complete (committed).
- **Phase 3:** Complete (committed `1579537` + citation fix `f1c7e85`).
- **Phase 4:** Complete (committed `eb0c3f8`). Migration applied; live A/B/C verified. Live Groq Stop timing not proven.
- **Phase 5:** Complete (committed `51fce30`). PDF.js viewer + canonical-offset highlighting.
- **Phase 6:** Complete (committed `0253b74`). Semantic DOCX preview + verified citation highlighting.
- **Phase 7:** Complete (committed `cfa8140`). Multi-document comparative Q&A.
- **Phase 8:** Complete (committed `f559ae7`). Clause/paragraph version comparison + SourceFocus navigation.
- **Phase 9:** Implementation complete in working tree (**uncommitted — user commits manually**). Deterministic significance analysis, optional grounded LLM enrichment, working severity filter/sort. Not legal advice; not Part C agent tools.
- **Phase 10+:** Not started. Do not auto-start.

## Current implementation

- Document upload/extract/library/delete (Phase 1).
- Structure-aware retrieval (Phase 2).
- Grounded streaming chat with verified citations (Phase 3).
- Persistent chat lifecycle (Phase 4).
- PDF citation navigation (Phase 5).
- DOCX citation navigation (Phase 6).
- Multi-document research Q&A (Phase 7).
- Structural Compare Versions (Phase 8).
- **Substantive significance (Phase 9):**
  - Deterministic signals (money, duration, modal, negation, party, topics, jurisdiction).
  - Severity: `high` / `medium` / `low` / `review_needed` with transparent rubric.
  - Optional batched LLM enrichment validated against source amounts (falls back when missing/failed).
  - Working UI filters + sort; overview counts; SourceFocus unchanged.

## Phase 9 code map

- `src/lib/compare/significance/{types,signals,rubric,analyze,enrich,sort-filter,index}.ts`
- `VersionCompareLedger.tsx` filters/sort/overview
- `POST /api/compare` optional `enrich` (default true)
- `tests/significance.test.mts`, `scripts/phase9-live-significance.mjs`

## Next immediate steps

1. User reviews/commits Phase 9.
2. Phase 10 — bounded agentic document research (only after explicit approval).

## Ground rules

No API secrets in repo, no fictional test results, no trusting model-provided source locations, no automatic phase advance or agent commits.
