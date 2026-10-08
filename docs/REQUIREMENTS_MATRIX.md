# Requirements matrix

Source: SDE Assignment.pdf (see `ASSIGNMENT_SOURCE.md`). Behavioural detail and acceptance criteria: `docs/PRD.md`. Phase gates: `docs/phases.md`. Agent entry: `/AGENTS.md`.

Status legend: `NOT_STARTED` | `PARTIAL` | `IMPLEMENTED_UNVERIFIED` | `VERIFIED` | `BLOCKED`

**Note:** The “Phase” column below still uses the earlier coarse labels (0–6) from Phase 0 bootstrap. Prefer `docs/phases.md` (0–13) for new work planning; statuses themselves were not changed by the governance-pack integration.

Evidence gates for this update (2026-10-08 Phase 0 import):

- `npm run typecheck` — pass
- `npm test` — 16/16 pass
- `npm run build` — pass (Next.js 16.4.0)
- Live Supabase E2E — **not run** (no `.env.local`)

| ID | Feature | Status | Relevant files | Tests | Known limitations | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | PDF/DOCX upload; reject other types | IMPLEMENTED_UNVERIFIED | `src/lib/documents/validate.ts`, `src/app/api/documents/initiate/route.ts`, `src/app/page.tsx` | MIME/ext Zod refine; magic signatures in extract path | Needs live Storage smoke; client MIME can be spoofed until process signature check | 0–1 |
| A2 | Text extraction and persistence | IMPLEMENTED_UNVERIFIED | `extract.ts`, `pdf-text.ts`, `process/route.ts`, `db/schema.sql` | `pdf-text.test.mts` | Needs live PDF/DOCX against Supabase | 0–1 |
| A3 | Processing status UX | PARTIAL | `src/app/page.tsx`, documents status fields | — | Statuses exist (uploading/processing/ready/failed); live polling UX not E2E verified | 0–1 |
| A4 | Scanned / no-text PDF handling | IMPLEMENTED_UNVERIFIED | `extract.ts`, `process/route.ts` | — | Throws `NO_READABLE_TEXT`; OCR not supported; needs scanned sample smoke | 0–1 |
| A5 | Document library (list, open, delete) | IMPLEMENTED_UNVERIFIED | `src/app/page.tsx`, `api/documents/**` | — | Needs live Supabase | 0–1 |
| A6 | Document chat Q&A | NOT_STARTED | schema reserves `messages` | — | Phase boundary | 2 |
| A7 | Streaming responses | NOT_STARTED | — | — | — | 2 |
| A8 | Stop generation; keep partial | NOT_STARTED | schema has `stopped` status | — | Not wired | 2 |
| A9 | Per-document chat history | NOT_STARTED | `conversations`, `messages` tables reserved | — | — | 2 |
| A10 | Verified quotes (deterministic) | VERIFIED | `src/lib/evidence/verify.ts`, `api/.../verify` | `evidence.test.mts` (unit) | Chat integration not started; live API path needs Supabase | 0–2 |
| A11 | Whitespace-tolerant matching | VERIFIED | `normalizeWithSourceMap` | evidence tests | Does not fuzzy-match words/digits | 0 |
| A12 | Reject/remove unverified quotes in answers | NOT_STARTED | verify API exists | — | No answer pipeline yet | 2 |
| A13 | Answer “not in document” instead of inventing | NOT_STARTED | — | — | — | 2 |
| A14 | Large documents (~150 pages) strategy | PARTIAL | `chunks.ts`, FTS column | `chunks.test.mts` | Chunks exist; retrieval/coverage/abstention not built; sync process may timeout at 60s | 1–2 |
| A15 | Partial read must not imply full coverage | NOT_STARTED | — | — | Policy decided; not implemented | 2 |
| B1 | Citation highlighting in viewer | NOT_STARTED | inspector shows text only | — | Offsets ready for later PDF.js layer mapping | 3 |
| B2 | Multi-document questions | NOT_STARTED | `conversation_documents` reserved | — | — | 4 |
| B3 | Document comparison | NOT_STARTED | — | — | — | 4 |
| C1 | Part C Option 1: DOCX tracked changes | NOT_STARTED | — | — | Not selected | — |
| C2 | Part C Option 2: Agentic document research | NOT_STARTED | — | — | Selected; not started | 5 |
| SUB1 | GitHub repository | PARTIAL | `.git/` | — | Local repo; remote/push not done | 0–6 |
| SUB2 | Deployed link | NOT_STARTED | — | — | — | 6 |
| SUB3 | README (run locally, done vs not) | PARTIAL | `README.md` | — | Screenshots still missing | 0–6 |
| SUB4 | Demo video | NOT_STARTED | — | — | — | 6 |
| SUB5 | Short technical note | NOT_STARTED | — | — | — | 6 |
| X1–X7 | Optional extras | NOT_STARTED | — | — | Bonus only after A/B/C | — |

## Notes on offsets after reconstruction

- PDF pages reconstructed via `reconstructPdfPage`, then joined with a single `\n` in `createCanonicalSource`.
- Page `start_offset` / `end_offset` and chunk offsets refer to that canonical string (JS UTF-16 units).
- `verifyQuote` remaps whitespace-normalized matches back through `originalOffset`, so verification offsets remain valid in canonical text even when quote whitespace differs.
- Visual PDF coordinates are a separate concern (not implemented).

## Stack paths (now present)

`src/lib/evidence/verify.ts`, `src/lib/documents/*`, `db/schema.sql`, `tests/*` — imported from Phase 1 starter ZIP.
