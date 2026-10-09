# Requirements matrix

Source: SDE Assignment.pdf (see `ASSIGNMENT_SOURCE.md`). Behavioural detail: `docs/PRD.md`. Phase gates: `docs/phases.md`.

Status legend: `NOT_STARTED` | `PARTIAL` | `IMPLEMENTED_UNVERIFIED` | `VERIFIED` | `BLOCKED`

Evidence gates for this update (2026-10-09 — Phase 6 working tree, **not yet user-committed**):

Phase 4–5 remain VERIFIED (committed `eb0c3f8` / `51fce30`). Live Groq Stop timing **not** proven.

Phase 6 gates:

- `npm run typecheck` — pass
- `npm test` — **136/136** pass (adds `docx-citation.test.mts`)
- `npm run build` — pass (includes `GET …/docx-preview`)
- Preview flatten matches stored `extractRawText` for `phase1-sample.docx`
- Browser (local): DOCX `AED 100,000` table-cell highlight geometry match; resize recalculates overlays; long DOCX (~517 leaves) preview load ~308ms / nav ~1.6s; PDF regression highlight on `phase5-sample.pdf` still works

| ID | Feature | Status | Relevant files | Tests | Known limitations | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | PDF/DOCX upload; reject other types | VERIFIED | validate, initiate, page | Phase 1 | — | 1 |
| A2 | Text extraction and persistence | VERIFIED | extract, process | Phase 1 | — | 1 |
| A3 | Processing status UX | VERIFIED | page, process | Phase 1 | — | 1 |
| A4 | Scanned / no-text PDF handling | VERIFIED | extract, process | Phase 1 | OCR not supported | 1 |
| A5 | Document library | VERIFIED | page, APIs | Phase 1 | — | 1 |
| A6 | Document chat Q&A | VERIFIED | chat pipeline, DocumentChat, chat route | chat + live Groq | — | 3 |
| A7 | Streaming responses | VERIFIED | openai-compatible, SSE, DocumentChat | chat + live | — | 3 |
| A8 | Stop generation; keep partial | VERIFIED | persist/*, stop route, DocumentChat | persist.test.mts + live A/B | Crash may lose tokens after last checkpoint; live Groq Stop timing not proven | 4 |
| A9 | Per-document chat history | VERIFIED | conversations API, DocumentChat | persist tests + live B | Bounded message limit | 4 |
| A10 | Verified quotes | VERIFIED | verify.ts + chat citations | evidence + chat | Literal match ≠ entailment | 0–3 |
| A11 | Whitespace-tolerant matching | VERIFIED | normalizeWithSourceMap | evidence | — | 0 |
| A12 | Reject unverified quotes in answers | VERIFIED | citations.ts, pipeline | chat tests | — | 3 |
| A13 | Abstain when not in document | VERIFIED | prompts + coverage + pipeline | chat tests | — | 2–3 |
| A14 | Large documents (~150 pages) strategy | VERIFIED | chunks + retrieval + chat budget | retrieval + chat | Lexical only | 2–3 |
| A15 | Partial read ≠ full coverage / no false absence | VERIFIED | retrieval + chat abstention | retrieval + chat | — | 2–3 |
| B1 | PDF citation navigation / highlight | VERIFIED | PdfCitationViewer, src/lib/pdf/* | pdf-citation.test.mts + browser | Pathological PDF text order may fail align | 5 |
| B1b | DOCX citation navigation / highlight | VERIFIED | DocxCitationViewer, src/lib/docx/* | docx-citation.test.mts + browser | Not Word page-fidelity; headers/footers limited; pathological Mammoth vs extractRawText mismatch → extracted-text fallback | 6 |
| B2–B3 / C2 | Multi-doc / compare / agent | NOT_STARTED | — | — | Later phases | 7–10 |
| SUB* | Submission deliverables | PARTIAL / NOT_STARTED | README | — | Screenshots/video/deploy pending | 12–13 |

## Phase 6 notes

- Semantic preview only — no fabricated Word page numbers.
- Canonical offsets remain from Mammoth `extractRawText` (unchanged).
- Visual map failure ≠ verification failure; extracted-text fallback available.
- Browser-proven: table-cell `AED 100,000` (offsets 69–80), paragraph quotes, resize overlay update, long FloNeo DOCX, PDF regression.
