# Pactrieve: project context

**Tagline:** Every answer, traceable.

**Assignment:** Six-page SDE legal-contract web app (see `ASSIGNMENT_SOURCE.md` / SDE Assignment.pdf). Deadline: 3 days from receipt. Most important requirement: independently verified quotes with exact source navigation. Parts A and B required; Part C Option 2 selected (agentic document research).

**Governance:** `AGENTS.md` reading order. Phase gates: `docs/phases.md`. Design: `docs/Design.md` (tokens partially reflected in current CSS).

## Phase status (2026-10-09)

- **Phase 0–2:** Complete (committed).
- **Phase 3:** Complete (committed `1579537` + citation fix `f1c7e85`).
- **Phase 4:** Complete (committed `eb0c3f8`). Migration applied; live A/B/C verified. Persistent conversations, Stop cancellation, partial-answer recovery. Live Groq Stop timing not proven.
- **Phase 5:** Implementation complete in working tree (**uncommitted — user commits manually**). PDF.js viewer + canonical-offset highlighting.
- **Phase 6+:** Not started. Do not auto-start.

## Current implementation

- Document upload/extract/library/delete (Phase 1).
- Structure-aware retrieval (Phase 2).
- Grounded streaming chat with verified citations (Phase 3).
- Persistent chat lifecycle (Phase 4).
- **PDF citation navigation (Phase 5):**
  - In-app PDF viewer (page nav, zoom, text layer).
  - Citation click → locate verified offsets → highlight text-layer spans.
  - Multiline / multi-span / cross-page ranges; repeated occurrences via offsets.
  - Alignment failure: keep verified status, page navigate, no fake highlight.
  - Historical citations: derive `pageIndices` from stored page boundaries.
  - DOCX: extracted-text path only (Phase 6 for layout highlight).

## Phase 5 code map

- `src/lib/pdf/*` — page ranges, reconstruct-with-map, align, locate, DOM measure.
- `src/components/PdfCitationViewer.tsx` — viewer + highlight overlays.
- `src/app/api/documents/[id]/file/route.ts` — `?raw=1` same-origin stream.
- `tests/pdf-citation.test.mts` — mapping + fixture PDF locate.
- `scripts/copy-pdf-worker.mjs` — postinstall worker copy.

## Durability / highlight honesty

- Phase 4 checkpoint durability unchanged.
- Visual highlight claims precision only when `locateCitationOnPdf` succeeds; otherwise status explains alignment failure.

## Next immediate steps

1. User reviews/commits Phase 5.
2. Phase 6 — DOCX evidence highlighting.

## Ground rules

No API secrets in repo, no fictional test results, no trusting model-provided source locations, no automatic phase advance or agent commits.
