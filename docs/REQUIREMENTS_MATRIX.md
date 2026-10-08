# Requirements matrix

Source: SDE Assignment.pdf (see `ASSIGNMENT_SOURCE.md`). Behavioural detail and acceptance criteria: `docs/PRD.md`. Phase gates: `docs/phases.md`. Agent entry: `/AGENTS.md`.

Status legend: `NOT_STARTED` | `PARTIAL` | `IMPLEMENTED_UNVERIFIED` | `VERIFIED` | `BLOCKED`

**Note:** Prefer `docs/phases.md` (0–13) for planning. The “Phase” column may still show coarse labels.

Evidence gates for this update (2026-10-08 Phase 1):

- `npm run typecheck` — pass
- `npm test` — **29/29** pass
- `npm run build` — pass (Next.js 16.4.0)
- Live Supabase smoke (`scripts/phase1-live-smoke.mjs`) — **16/16** pass against configured private bucket + DB
- Live 150-page synthetic PDF via initiate→upload→process→text→delete — pass (~6s locally)

| ID | Feature | Status | Relevant files | Tests | Known limitations | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | PDF/DOCX upload; reject other types | VERIFIED | `validate.ts`, `initiate/route.ts`, `page.tsx` | `validate.test.mts` + live smoke | Client MIME still advisory until process signatures; legacy `.doc` rejected | 1 |
| A2 | Text extraction and persistence | VERIFIED | `extract.ts`, `pdf-text.ts`, `process/route.ts` | `extract.test.mts`, `pdf-text.test.mts` + live | Dense real PDFs may be slower than synthetic fixtures | 1 |
| A3 | Processing status UX | VERIFIED | `page.tsx`, process statuses, Retry | Live list/poll/retry paths | No fake % progress; stuck processing reclaim after 2m | 1 |
| A4 | Scanned / no-text PDF handling | VERIFIED | `extract.ts`, `process/route.ts` | extract + live scanned fixture | OCR not supported; partial empty pages warned via `unreadable_page_count` | 1 |
| A5 | Document library (list, open, delete) | VERIFIED | `page.tsx`, documents APIs | Live list/reopen/delete cleanup | Storage-then-DB delete; partial failure returns 500 honestly | 1 |
| A6 | Document chat Q&A | NOT_STARTED | schema reserves `messages` | — | Phase boundary | 3 |
| A7 | Streaming responses | NOT_STARTED | — | — | — | 3 |
| A8 | Stop generation; keep partial | NOT_STARTED | schema has `stopped` status | — | Not wired | 4 |
| A9 | Per-document chat history | NOT_STARTED | `conversations`, `messages` reserved | — | — | 4 |
| A10 | Verified quotes (deterministic) | VERIFIED | `verify.ts`, verify API | `evidence.test.mts` | Chat answer pipeline not started | 0–3 |
| A11 | Whitespace-tolerant matching | VERIFIED | `normalizeWithSourceMap` | evidence tests | No fuzzy word/digit match | 0 |
| A12 | Reject/remove unverified quotes in answers | NOT_STARTED | verify API exists | — | No answer pipeline yet | 3 |
| A13 | Answer “not in document” instead of inventing | NOT_STARTED | — | — | — | 3 |
| A14 | Large documents (~150 pages) strategy | PARTIAL | `chunks.ts`, process route | live 150-page ingest + chunk tests | **Ingestion** verified on synthetic 150-page PDF; retrieval/coverage/abstention is Phase 2; 60s host limit remains | 1–2 |
| A15 | Partial read must not imply full coverage | NOT_STARTED | — | — | Policy decided; not implemented | 2 |
| B1 | Citation highlighting in viewer | NOT_STARTED | inspector text only | — | — | 5 |
| B2 | Multi-document questions | NOT_STARTED | reserved tables | — | — | 7 |
| B3 | Document comparison | NOT_STARTED | — | — | — | 8–9 |
| C1 | Part C Option 1 | NOT_STARTED | — | — | Not selected | — |
| C2 | Part C Option 2 | NOT_STARTED | — | — | Selected; not started | 10 |
| SUB1 | GitHub repository | PARTIAL | `.git/` | — | Remote may exist; Phase 1 not pushed by agent | 0–12 |
| SUB2 | Deployed link | NOT_STARTED | — | — | — | 12 |
| SUB3 | README | PARTIAL | `README.md` | — | Screenshots still missing | 0–13 |
| SUB4 | Demo video | NOT_STARTED | — | — | — | 13 |
| SUB5 | Short technical note | NOT_STARTED | — | — | — | 13 |
| X1–X7 | Optional extras | NOT_STARTED | — | — | Bonus only after A/B/C | — |

## Notes on offsets after reconstruction

- PDF pages reconstructed via `reconstructPdfPage`, then joined with a single `\n` in `createCanonicalSource`.
- Page `start_offset` / `end_offset` and chunk offsets refer to that canonical string (JS UTF-16 units).
- `verifyQuote` remaps whitespace-normalized matches back through `originalOffset`.
- Visual PDF coordinates are a separate concern (not implemented).
