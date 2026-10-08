# Pactrieve: project context

**Tagline:** Every answer, traceable.

**Assignment:** Six-page SDE legal-contract web app (see `ASSIGNMENT_SOURCE.md` / SDE Assignment.pdf). Deadline: 3 days from receipt. Most important requirement: independently verified quotes with exact source navigation. Parts A and B required; Part C Option 2 selected (agentic document research).

**Governance (agents read first via `AGENTS.md`):** `docs/rules.md` → `PRD.md` → `Architecture.md` → `Design.md` → `phases.md`, then this file, `DECISIONS.md`, `REQUIREMENTS_MATRIX.md`, `ASSIGNMENT_SOURCE.md`. Phase numbering and gates: `docs/phases.md`. Design system: `docs/Design.md` (proposed tokens — not yet applied to UI).

## Phase status (2026-10-08)

- **Phase 0:** Complete — starter imported; typecheck/test/build green; governance pack committed.
- **Phase 1:** Complete for local + live Supabase acceptance — ingestion hardened; PDF/DOCX upload→extract→persist→reopen→delete verified against configured project.
- **Phase 2+:** Not started. Do not auto-start.

## Current implementation

- Next.js TS UI: library upload/list/delete/retry, document text inspector, quotation verification lab.
- Supabase schema, private signed-upload flow, post-upload extraction, PDF and DOCX parsing, page offsets and overlapping retrieval chunks.
- Deterministic quote verification module and expanded Node unit tests (validation + extraction fixtures).
- Live Supabase: private bucket `pactrieve-documents`, DB connectivity, signed browser upload, process, text reopen, delete cleanup — exercised via `scripts/phase1-live-smoke.mjs`.
- No LLM, chat, PDF text-layer highlighting, cross-document QA, comparison, agent tools, or deployment verified.

## Code map

- `src/lib/evidence/verify.ts` — canonical text mapping + quote match algorithm.
- `src/lib/documents/{extract,chunks,validate,load,pdf-text}.ts` — parsing, reconstruction, chunking, validation, loading.
- `src/app/api/documents/**` — create, process (idempotent replace + stale reclaim), list, view, verify, delete.
- `src/app/page.tsx` — library client (Retry for `uploading`/`failed`).
- `src/app/documents/[id]/page.tsx` — inspector client.
- `db/schema.sql` — Postgres schema, reserved conversation/citation entities.
- `tests/*.test.mts` — evidence, chunks, pdf-text, validate, extract.
- `fixtures/` — synthetic PDF/DOCX cases; `scripts/phase1-live-smoke.mjs` — live API smoke.

## Processing notes (Phase 1)

- Workflow: initiate → signed private Storage upload → `POST /process` → validate signature/OOXML → extract → purge/replace pages+chunks → `ready` or `failed`.
- Writes are **not** one DB transaction across storage; consistency uses claim/lease, idempotent derived-row replacement, best-effort cleanup on failure, and delete that refuses success if storage or DB cleanup fails.
- Stuck `processing` older than ~2 minutes can be reclaimed by a new process call.
- `maxDuration = 60` on process route. Synthetic 150-page fixture ingested live in ~6s locally; dense real contracts may approach host limits — durable workers remain out of Phase 1 scope.
- Scanned/image-only PDFs fail with `NO_READABLE_TEXT`. Partial empty pages set `unreadable_page_count` while allowing `ready` if any text exists.
- `pdfjs-dist` and `mammoth` are `serverExternalPackages` so production `next start` can open PDFs.

## Next immediate steps

1. Phase 2 — structured retrieval and honest coverage for ~150-page contracts (`docs/phases.md`).
2. Later: streaming chat, stop/history, highlighting, multi-doc, comparison, Part C Option 2, deploy, demo.

## Ground rules

No API secrets in repo, no fictional test results, no pretending unfinished features exist, no trusting model-provided source locations.
