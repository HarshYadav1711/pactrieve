# Requirements matrix

Source: SDE Assignment.pdf (see `ASSIGNMENT_SOURCE.md`). Behavioural detail: `docs/PRD.md`. Phase gates: `docs/phases.md`.

Status legend: `NOT_STARTED` | `PARTIAL` | `IMPLEMENTED_UNVERIFIED` | `VERIFIED` | `BLOCKED`

Evidence gates for this update (2026-10-09 — Phase 7 working tree, **not yet user-committed**):

Phase 4–6 remain VERIFIED (committed `eb0c3f8` / `51fce30` / `0253b74`). Live Groq Stop timing **not** proven.

Phase 7 gates:

- `npm run typecheck` — pass
- `npm test` — **153/153** pass (adds `multi-doc.test.mts`)
- `npm run build` — pass (includes `/api/research/*` + `/research`)
- Live Groq: alpha (30d / AED 100,000) vs beta (60d / AED 1,000,000) comparative answer with per-doc citations (~23s)
- Browser: reopen multi-doc conversation; click Alpha citation → Alpha DOCX preview highlight (geometry banners OK)

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
| B3 / C2 | Version compare / agent | NOT_STARTED | — | — | Phases 8–10 | 8–10 |
| SUB* | Submission deliverables | PARTIAL / NOT_STARTED | README | — | Screenshots/video/deploy pending | 12–13 |

## Phase 7 notes

- Evidence IDs are unique across the selected set; verification never searches sibling documents.
- Conversation associations use existing `conversation_documents` with exact-set locking.
- Not clause-level version diffing (Phase 8) and not agentic tool loops (Phase 10).
- Fixtures: `fixtures/phase7-alpha.docx`, `fixtures/phase7-beta.docx`.
