# Requirements matrix

Source: SDE Assignment.pdf (see `ASSIGNMENT_SOURCE.md`). Behavioural detail: `docs/PRD.md`. Phase gates: `docs/phases.md`.

Status legend: `NOT_STARTED` | `PARTIAL` | `IMPLEMENTED_UNVERIFIED` | `VERIFIED` | `BLOCKED`

Evidence gates for this update (2026-10-09 — Phase 5 working tree, **not yet user-committed**):

Phase 4 (committed `eb0c3f8`, migration applied) remains VERIFIED:

- Live Phase 4 A/B/C PASS; live Groq Stop timing **not** proven (fake-provider Stop is the token-boundary proof).

Phase 5 gates:

- `npm run typecheck` — pass
- `npm test` — **116/116** pass (adds `pdf-citation.test.mts`)
- `npm run build` — pass
- Fixture PDF locate (sample + 150-page addressability) — pass in unit/integration tests
- Browser: uploaded `phase5-sample.pdf`, verified quote `AED 100,000` → status “Highlighted on page 1.”; overlay rect matched Range geometry for offsets 21–32 (not first-word false highlight)

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
| B1 | PDF citation navigation / highlight | VERIFIED | PdfCitationViewer, src/lib/pdf/* | pdf-citation.test.mts + browser AED highlight on sample PDF | Pathological PDF text order may fail align (honest fallback); DOCX layout is Phase 6; Playwright not installed | 5 |
| B2–B3 / C2 | Multi-doc / compare / agent | NOT_STARTED | — | — | Later phases | 7–10 |
| SUB* | Submission deliverables | PARTIAL / NOT_STARTED | README | — | Screenshots/video/deploy pending | 12–13 |

## Phase 4 notes

- Message statuses: `pending` → `streaming` → `complete` | `stopped` | `failed` | `interrupted`.
- Stop sets `cancel_requested`; generation polls DB and aborts provider.
- UI shows “Stopped · Partial answer saved” only when `persistenceOk` and `persistedStatus=stopped`.
- Migration `db/migrations/20261008_phase4_chat_persistence.sql` applied on live Supabase.
- Fake-provider Stop + reopen (A) VERIFIED; Supabase persist/Stop (B) VERIFIED; Groq durable complete (C) VERIFIED.
