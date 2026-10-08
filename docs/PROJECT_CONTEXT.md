# Pactrieve: project context

**Tagline:** Every answer, traceable.

**Assignment:** Six-page SDE legal-contract web app (see `ASSIGNMENT_SOURCE.md` / SDE Assignment.pdf). Deadline: 3 days from receipt. Most important requirement: independently verified quotes with exact source navigation. Parts A and B required; Part C Option 2 selected (agentic document research).

**Governance (agents read first via `AGENTS.md`):** `docs/rules.md` → `PRD.md` → `Architecture.md` → `Design.md` → `phases.md`, then this file, `DECISIONS.md`, `REQUIREMENTS_MATRIX.md`, `ASSIGNMENT_SOURCE.md`. Phase numbering and gates: `docs/phases.md`. Design system: `docs/Design.md` (proposed tokens — not yet applied to UI).

## Phase 0 continuation (2026-10-08)

- Repository previously held Git init + Phase 0 docs only (`ASSIGNMENT_SOURCE.md`, `REQUIREMENTS_MATRIX.md`, early context/decisions).
- Starter imported from `C:\Users\harsh\Downloads\Pactrieve_Phase1_Starter.zip` into `D:\Fun\pactrieve` without replacing `.git`.
- Original starter docs preserved under `docs/starter-import/`.
- Application code now present: Next.js UI, document APIs, extraction, verifier, unit tests, `db/schema.sql`.

## Current implementation

- Next.js TS UI: library upload/list/delete, document text inspector, quotation verification lab.
- Supabase schema, private signed-upload flow, post-upload extraction, PDF and DOCX parsing, page offsets and overlapping retrieval chunks.
- Deterministic quote verification module and Node unit tests.
- No LLM, chat, PDF text-layer highlighting, cross-document QA, comparison, agent tools, or deployment verified in this environment.
- Live Supabase integration is **blocked** until `.env.local` credentials exist.

## Code map

- `src/lib/evidence/verify.ts` — canonical text mapping + quote match algorithm.
- `src/lib/documents/{extract,chunks,validate,load,pdf-text}.ts` — parsing, reconstruction, chunking, validation, loading.
- `src/app/api/documents/**` — create, process, list, view, verify, delete.
- `src/app/page.tsx` — library client.
- `src/app/documents/[id]/page.tsx` — inspector client.
- `db/schema.sql` — Postgres schema, reserved conversation/citation entities.
- `tests/*.test.mts` — evidence, chunks, pdf-text tests.

## Phase boundaries

- **Phase 0 (complete for local foundation):** Import starter, preserve docs, validate install/typecheck/test/build, audit foundation, update matrix. Governance pack integrated separately (docs-only).
- **Subsequent work:** Follow `docs/phases.md` (Phase 1 = reliable ingestion lifecycle; Phase 2 = retrieval; Phase 3+ = chat, history/stop, highlighting, multi-doc, comparison, Part C, deploy, handoff). Do not auto-start the next phase.

## Next immediate steps

1. Configure Supabase per README; run browser smoke tests (PDF, DOCX, scanned empty PDF) — Phase 1 gate.
2. Follow `docs/phases.md` for retrieval, chat, highlighting, multi-doc, comparison, Part C Option 2, deploy, and demo — one phase at a time.

## Ground rules

No API secrets in repo, no fictional test results, no pretending unfinished features exist, no trusting model-provided source locations.
