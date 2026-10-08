# Requirements matrix

Source: SDE Assignment.pdf (see `ASSIGNMENT_SOURCE.md`). Behavioural detail: `docs/PRD.md`. Phase gates: `docs/phases.md`.

Status legend: `NOT_STARTED` | `PARTIAL` | `IMPLEMENTED_UNVERIFIED` | `VERIFIED` | `BLOCKED`

Evidence gates for this update (2026-10-08 Phase 2 — local working tree, **not yet user-committed**):

- `npm run typecheck` — pass
- `npm test` — **47/47** pass
- `npm run build` — pass
- Live retrieval (`scripts/phase2-live-retrieval.mjs`) — **10/10** pass
- Fixture: `fixtures/phase2-contract-150.txt` (~284,819 chars, 150 pages, 176 chunks)

| ID | Feature | Status | Relevant files | Tests | Known limitations | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | PDF/DOCX upload; reject other types | VERIFIED | validate, initiate, page | Phase 1 | — | 1 |
| A2 | Text extraction and persistence | VERIFIED | extract, process | Phase 1 | — | 1 |
| A3 | Processing status UX | VERIFIED | page, process | Phase 1 | — | 1 |
| A4 | Scanned / no-text PDF handling | VERIFIED | extract, process | Phase 1 | OCR not supported | 1 |
| A5 | Document library | VERIFIED | page, APIs | Phase 1 | — | 1 |
| A6 | Document chat Q&A | NOT_STARTED | — | — | Uses retrieval in Phase 3 | 3 |
| A7 | Streaming responses | NOT_STARTED | — | — | — | 3 |
| A8 | Stop generation; keep partial | NOT_STARTED | — | — | — | 4 |
| A9 | Per-document chat history | NOT_STARTED | — | — | — | 4 |
| A10 | Verified quotes | VERIFIED | verify.ts | evidence tests | Chat wiring later | 0–3 |
| A11 | Whitespace-tolerant matching | VERIFIED | normalizeWithSourceMap | evidence | — | 0 |
| A12 | Reject unverified quotes in answers | NOT_STARTED | — | — | — | 3 |
| A13 | Abstain when not in document | PARTIAL | retrieval coverage types | retrieval tests | Retrieval exposes coverage; chat abstention is Phase 3 | 2–3 |
| A14 | Large documents (~150 pages) strategy | VERIFIED | chunks + retrieval | retrieval + live | Lexical only; no semantic embeddings; dense host PDFs may still hit 60s ingest limits | 2 |
| A15 | Partial read ≠ full coverage / no false absence | VERIFIED | retrieval coverage | retrieval + live | Semantic equivalents can still be missed by lexical search — notes say so | 2 |
| B1–B3 / C2 | Highlight / multi-doc / compare / agent | NOT_STARTED | — | — | Later phases | 5–10 |
| SUB* | Submission deliverables | PARTIAL / NOT_STARTED | README | — | Screenshots/video/deploy pending | 12–13 |

## Phase 2 retrieval notes

- Offsets: UTF-16 JS units in canonical text (pages joined with `\n`).
- Every returned passage content equals `canonical.slice(start,end)` in tests/live checks.
- Optional SQL: `db/migrations/20261008_phase2_search_helper.sql`.
