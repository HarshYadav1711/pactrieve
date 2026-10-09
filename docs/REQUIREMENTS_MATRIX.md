# Requirements matrix

Source: SDE Assignment.pdf (see `ASSIGNMENT_SOURCE.md`). Behavioural detail: `docs/PRD.md`. Phase gates: `docs/phases.md`.

Status legend: `NOT_STARTED` | `PARTIAL` | `IMPLEMENTED_UNVERIFIED` | `VERIFIED` | `BLOCKED`

Evidence gates for this update (2026-10-09 — Phase 8 working tree, **not yet user-committed**):

Phase 4–7 remain VERIFIED (committed through `cfa8140`). Live Groq Stop timing **not** proven.

Phase 8 gates:

- `npm run typecheck` — pass
- `npm test` — **174/174** pass (adds `compare.test.mts`)
- `npm run build` — pass (includes `/api/compare` + `/compare`)
- Live Supabase: alpha (30d / AED 100,000) vs beta (60d / AED 1,000,000) → 2 `modified`; amounts preserved; self-compare 400; invalid ID 400
- Browser: Compare Versions auto-run; side-by-side modified ledger; Show in original/revised → DOCX SourceFocus highlight on correct document

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
| B1b | DOCX citation navigation / highlight | VERIFIED | DocxCitationViewer, src/lib/docx/* | docx-citation.test.mts + browser | Not Word page-fidelity; headers/footers limited | 6 |
| B2 | Multi-document questions / comparative synthesis | VERIFIED | multi-pipeline, research APIs, MultiDocumentChat, /research | multi-doc.test.mts + live Groq + browser | Selection 2–5; lexical miss ≠ absence; not clause-level version diff | 7 |
| B3 | Document version comparison (structural) | PARTIAL | compare/*, /api/compare, /compare, VersionCompareLedger | compare.test.mts + live + browser | Structural alignment only; significance/severity = Phase 9; full Part B not VERIFIED | 8 |
| C2 | Agentic research tools | NOT_STARTED | — | — | Phase 10 | 10 |
| SUB* | Submission deliverables | PARTIAL / NOT_STARTED | README | — | Screenshots/video/deploy pending | 12–13 |

## Phase 8 notes

- Clause/paragraph alignment with source offsets; not character-diff UI.
- `moved` only when near-identical text relocates with sufficient confidence.
- Coverage notes surface empty/partially unreadable sources; do not invent deletions from unread pages.
- Phase 9 will add substantive explanations and severity sorting — do not claim B3 fully VERIFIED until then.
- Fixtures reused: `fixtures/phase7-alpha.docx`, `fixtures/phase7-beta.docx`.
