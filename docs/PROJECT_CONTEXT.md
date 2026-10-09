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
- **Phase 7:** Complete (committed `cfa8140`). Multi-document comparative Q&A with per-document evidence isolation.
- **Phase 8:** Implementation complete in working tree (**uncommitted — user commits manually**). Clause/paragraph version comparison with deterministic alignment and source navigation. Not Part B complete: Phase 9 owns significance/severity.
- **Phase 9+:** Not started. Do not auto-start.

## Current implementation

- Document upload/extract/library/delete (Phase 1).
- Structure-aware retrieval (Phase 2).
- Grounded streaming chat with verified citations (Phase 3).
- Persistent chat lifecycle (Phase 4).
- PDF citation navigation (Phase 5).
- DOCX citation navigation (Phase 6).
- Multi-document research Q&A (Phase 7).
- **Compare Versions (Phase 8):**
  - Library: select exactly two ready docs → `/compare?original=&revised=`.
  - On-the-fly segmentation + alignment (no new DB tables).
  - Classifications: unchanged / modified / added / removed / moved / uncertain.
  - Side-by-side ledger + SourceFocus navigation into existing PDF/DOCX viewers.
  - Not AI-verified citations; not legal-risk scoring.

## Phase 8 code map

- `src/lib/compare/{types,normalize,segment,align,compare,index}.ts`
- `src/app/api/compare/route.ts`
- `src/app/compare/page.tsx`, `src/components/VersionCompareLedger.tsx`
- Viewers accept `SourceFocus` (not only VerifiedCitation).
- `tests/compare.test.mts`, `scripts/phase8-live-compare.mjs`

## Next immediate steps

1. User reviews/commits Phase 8.
2. Phase 9 — substantive change explanations, significance classification, sorting (only after explicit approval).

## Ground rules

No API secrets in repo, no fictional test results, no trusting model-provided source locations, no automatic phase advance or agent commits.
