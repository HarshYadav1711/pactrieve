# Requirements matrix

Source: SDE Assignment.pdf (see `ASSIGNMENT_SOURCE.md`). Behavioural detail: `docs/PRD.md`. Phase gates: `docs/phases.md`.

Status legend: `NOT_STARTED` | `PARTIAL` | `IMPLEMENTED_UNVERIFIED` | `VERIFIED` | `BLOCKED`

Evidence gates for this update (2026-10-08 Phase 4 — local working tree, **not yet user-committed**):

- `npm run typecheck` — pass
- `npm test` — **96/96** pass
- `npm run build` — pass (chat + conversations + stop routes)
- Live Phase 4 (`npm run test:phase4-live`):
  - **PASS[A]** fake-provider stop + reopen partial (non-empty `stopped` content)
  - **BLOCKED[B]** Supabase: `messages.cancel_requested` missing until `db/migrations/20261008_phase4_chat_persistence.sql` is applied
  - **PASS[C]** Groq durable grounded answer (`complete`, ≥1 verified citation)
- Phase 3 live Groq grounding remains VERIFIED from prior commit

| ID | Feature | Status | Relevant files | Tests | Known limitations | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | PDF/DOCX upload; reject other types | VERIFIED | validate, initiate, page | Phase 1 | — | 1 |
| A2 | Text extraction and persistence | VERIFIED | extract, process | Phase 1 | — | 1 |
| A3 | Processing status UX | VERIFIED | page, process | Phase 1 | — | 1 |
| A4 | Scanned / no-text PDF handling | VERIFIED | extract, process | Phase 1 | OCR not supported | 1 |
| A5 | Document library | VERIFIED | page, APIs | Phase 1 | — | 1 |
| A6 | Document chat Q&A | VERIFIED | chat pipeline, DocumentChat, chat route | chat + live Groq | — | 3 |
| A7 | Streaming responses | VERIFIED | openai-compatible, SSE, DocumentChat | chat + live | — | 3 |
| A8 | Stop generation; keep partial | VERIFIED | persist/*, stop route, DocumentChat | persist.test.mts + live A | Live Supabase stop BLOCKED until migration; crash may lose tokens after last checkpoint; live A uses fake provider for token-boundary Stop | 4 |
| A9 | Per-document chat history | IMPLEMENTED_UNVERIFIED | conversations API, DocumentChat | persist tests (memory) | Live Supabase history BLOCKED until Phase 4 migration applied; bounded message limit | 4 |
| A10 | Verified quotes | VERIFIED | verify.ts + chat citations | evidence + chat | Literal match ≠ entailment | 0–3 |
| A11 | Whitespace-tolerant matching | VERIFIED | normalizeWithSourceMap | evidence | — | 0 |
| A12 | Reject unverified quotes in answers | VERIFIED | citations.ts, pipeline | chat tests | — | 3 |
| A13 | Abstain when not in document | VERIFIED | prompts + coverage + pipeline | chat tests | — | 2–3 |
| A14 | Large documents (~150 pages) strategy | VERIFIED | chunks + retrieval + chat budget | retrieval + chat | Lexical only | 2–3 |
| A15 | Partial read ≠ full coverage / no false absence | VERIFIED | retrieval + chat abstention | retrieval + chat | — | 2–3 |
| B1–B3 / C2 | Highlight / multi-doc / compare / agent | NOT_STARTED | — | — | Later phases | 5–10 |
| SUB* | Submission deliverables | PARTIAL / NOT_STARTED | README | — | Screenshots/video/deploy pending | 12–13 |

## Phase 4 notes

- Message statuses: `pending` → `streaming` → `complete` | `stopped` | `failed` | `interrupted`.
- Stop sets `cancel_requested`; generation polls DB and aborts provider.
- UI shows “Stopped · Partial answer saved” only when `persistenceOk` and `persistedStatus=stopped`.
- Apply `db/migrations/20261008_phase4_chat_persistence.sql` before live Supabase chat history works.
- Fake-provider Stop + reopen (live A) VERIFIED; Groq durable complete (live C) VERIFIED; live Supabase persist (B) BLOCKED on migration.
