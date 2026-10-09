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
- **Phase 7:** Implementation complete in working tree (**uncommitted — user commits manually**). Multi-document comparative Q&A with per-document evidence isolation.
- **Phase 8+:** Not started. Do not auto-start.

## Current implementation

- Document upload/extract/library/delete (Phase 1).
- Structure-aware retrieval (Phase 2).
- Grounded streaming chat with verified citations (Phase 3).
- Persistent chat lifecycle (Phase 4).
- PDF citation navigation (Phase 5).
- DOCX citation navigation (Phase 6).
- **Multi-document research (Phase 7):**
  - Library multi-select (2–5 ready docs) → `/research?docs=…`.
  - Independent retrieval per document; globally unique evidence IDs (`e1…`) tagged with document identity.
  - Comparative synthesis prompt; citations verified only against their own canonical source.
  - Conversations linked via existing `conversation_documents` (exact-set lock on follow-up turns).
  - Citation click focuses the correct PDF/DOCX viewer for that document.
  - Stop/partial recovery reuses Phase 4 DB-authoritative cancellation.

## Phase 7 code map

- `src/lib/chat/multi-pipeline.ts`, `multi-ids.ts`, evidence/citations/prompt extensions.
- `src/lib/chat/persist/durable-multi.ts` + store multi-doc helpers.
- `src/app/api/research/*` routes.
- `src/components/MultiDocumentChat.tsx`, `src/app/research/page.tsx`, library selection on `src/app/page.tsx`.
- `tests/multi-doc.test.mts`, `scripts/phase7-live-multidoc.mjs`.

## Next immediate steps

1. User reviews/commits Phase 7.
2. Phase 8 — clause/paragraph alignment and comparison UI (only after explicit approval).

## Ground rules

No API secrets in repo, no fictional test results, no trusting model-provided source locations, no automatic phase advance or agent commits.
