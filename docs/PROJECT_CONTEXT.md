# Pactrieve: project context

**Tagline:** Every answer, traceable.

**Assignment:** Six-page SDE legal-contract web app (see `ASSIGNMENT_SOURCE.md` / SDE Assignment.pdf). Deadline: 3 days from receipt. Most important requirement: independently verified quotes with exact source navigation. Parts A and B required; Part C Option 2 selected (agentic document research).

**Governance:** `AGENTS.md` reading order. Phase gates: `docs/phases.md`. Design: `docs/Design.md` (tokens partially reflected in current CSS).

## Phase status (2026-10-09)

- **Phase 0–2:** Complete (committed).
- **Phase 3:** Complete (committed `1579537` + citation fix `f1c7e85`).
- **Phase 4:** Complete (committed `eb0c3f8`). Migration applied; live A/B/C verified. Live Groq Stop timing not proven.
- **Phase 5:** Complete (committed `51fce30`). PDF.js viewer + canonical-offset highlighting.
- **Phase 6:** Implementation complete in working tree (**uncommitted — user commits manually**). Semantic DOCX preview + verified citation highlighting. Gates: typecheck / **136** tests / build pass; browser acceptance on sample + long DOCX; PDF regression OK.
- **Phase 7+:** Not started. Do not auto-start.

## Current implementation

- Document upload/extract/library/delete (Phase 1).
- Structure-aware retrieval (Phase 2).
- Grounded streaming chat with verified citations (Phase 3).
- Persistent chat lifecycle (Phase 4).
- PDF citation navigation (Phase 5).
- **DOCX citation navigation (Phase 6):**
  - Mammoth HTML → allowlisted semantic AST (React-only; no raw HTML).
  - Flatten with `\n\n` block separators to match `extractRawText` canonical text.
  - Citation offsets → leaf text nodes → DOM Range overlays.
  - Align failure keeps verified status and falls back to extracted-text highlight.
  - Not pixel-perfect Word layout; no fabricated page numbers.
  - Browser: `AED 100,000` table-cell highlight (geometry match); resize recalculates; FloNeo DOCX ~517 leaves load ~308ms / cite ~1.6s.

## Phase 6 code map

- `src/lib/docx/*` — safe HTML AST, flatten, align, locate, preview builder.
- `src/components/DocxCitationViewer.tsx` — semantic preview + highlights.
- `src/app/api/documents/[id]/docx-preview` — server-side preview JSON.
- `tests/docx-citation.test.mts` + `tests/helpers/docx-fixture.mts`.

## Next immediate steps

1. User reviews/commits Phase 6.
2. Phase 7 — cross-document evidence-based analysis (only after explicit approval).

## Ground rules

No API secrets in repo, no fictional test results, no trusting model-provided source locations, no automatic phase advance or agent commits.
