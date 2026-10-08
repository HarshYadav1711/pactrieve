# Pactrieve

**Every answer, traceable.**

Evidence-first contract analysis workspace for an SDE engineering assessment.

> **Status: Phase 1 ingestion complete (local + live Supabase verified).** PDF/DOCX upload through private Storage, extraction, persistence, library reopen, retry, and delete cleanup work against a configured project. AI chat, streaming/cancellation, PDF page-overlay highlights, multi-document Q&A, comparison, and agentic tools are **not implemented**. Do not claim otherwise.

## Technology

Next.js (App Router), TypeScript, Supabase Postgres + private Storage, PDF.js, Mammoth, Zod, and a standalone evidence verifier.

## Assignment (authoritative)

Requirements come from **SDE Assignment.pdf**. Traceability and governance live in:

- `AGENTS.md` — Cursor/agent reading order and invariants
- `docs/rules.md` / `PRD.md` / `Architecture.md` / `Design.md` / `phases.md` — product and phase governance
- `docs/ASSIGNMENT_SOURCE.md` — assignment summary and source path
- `docs/REQUIREMENTS_MATRIX.md` — requirement IDs and implementation status
- `docs/PROJECT_CONTEXT.md` — current state and next phase
- `docs/DECISIONS.md` — engineering decisions
- `docs/starter-import/` — original starter README / context preserved at import time

**Part C choice:** Option 2 — agentic document research (not started).

> Governance documents are specifications and process controls. They do **not** prove features are implemented. See the requirements matrix for evidence-backed status.

## Requirements

- Node.js 22.16+ (Node 24.x also used for Phase 0 validation)
- A Supabase project and a **private** Storage bucket named `pactrieve-documents`
- Windows PowerShell or any standard terminal

## Local setup

```powershell
cd D:\Fun\pactrieve
Copy-Item .env.example .env.local
npm install
```

1. Open the Supabase SQL editor and execute `db/schema.sql`.
2. In Supabase Storage, create a **private** bucket named `pactrieve-documents`. Raise the per-file size limit if needed (app accepts up to 30 MB).
3. Fill `.env.local` from Supabase project settings. The service role key must **never** appear in client bundles, commit history, or screenshots.
4. Start the app:

```powershell
npm run dev
```

Open http://localhost:3000 .

### Environment variables

| Name | Use |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL available to browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key used only for signed upload requests |
| `SUPABASE_URL` | Server project URL (can match public URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database/storage access. Never expose. |
| `SUPABASE_STORAGE_BUCKET` | Defaults to `pactrieve-documents` |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | Reserved for later phases; not used yet |

The browser uploads via a short-lived signed token from a server route; raw files go to private Storage. After upload, the process API downloads, validates signatures, extracts text, and stores page/offset mapping and retrieval chunks.

**Limitations:** Processing runs synchronously in a Next.js request (max duration 60s). Durable workers are needed for timeouts/restarts on large files. Auth is omitted per assignment — use only synthetic/non-confidential contracts on any shared deploy.

## Checks

```powershell
npm run typecheck
npm test
npm run build
```

Unit tests need no model key or database. They cover monetary hallucinations, precise words, whitespace normalization, cross-page quotes, repeated quotes, wrong-document scoping, unicode offsets, empty quotes, chunking, and PDF text reconstruction.

## Evidence engine guarantees

`src/lib/evidence/verify.ts`:

1. Builds a canonical concatenation of extracted pages using a single line-break separator.
2. Normalizes whitespace in both quote and source while retaining a map to source offsets.
3. Finds **every** literal match; no fuzzy word/value substitutions.
4. Derives page indices and exact original snippets from canonical source text.
5. Returns unverified if no occurrence exists. Every call scopes to one document.

**Not guaranteed:** Interpretive correctness of a quote; PDF hyphenation merge; glyph/OCR recovery; physical PDF overlay highlighting.

## Current API

| Method | Route | Result |
|---|---|---|
| `GET` | `/api/documents` | Library metadata |
| `POST` | `/api/documents/initiate` | Validates upload request, issues signed upload token |
| `POST` | `/api/documents/:id/process` | Downloads, validates and extracts uploaded file |
| `GET` | `/api/documents/:id/text` | Canonical extracted text and page boundaries |
| `POST` | `/api/documents/:id/verify` | Deterministically checks a proposed quotation |
| `GET` | `/api/documents/:id/file` | Short-lived signed original-file URL |
| `DELETE` | `/api/documents/:id` | Removes file and DB record (child rows cascade) |

## Finished vs not finished

| Area | Status |
| --- | --- |
| Document upload / extract / library / delete | Phase 1 verified (unit + live Supabase smoke) |
| Deterministic quote verifier + unit tests | Verified (unit); chat integration later |
| Requirements matrix & governance docs | Present |
| Retrieval / coverage honesty for 150 pages | Phase 2 (ingestion of synthetic 150-page PDF verified) |
| AI chat / streaming / cancel / history | Not started |
| Citation highlighting in viewer | Not started |
| Multi-doc Q&A / comparison / Part C | Not started |
| Deployed demo / video / written note | Not started |

## Phase 1 checks

```powershell
npm run typecheck
npm test
npm run build
# with app running and .env.local configured:
node --env-file=.env.local scripts/phase1-live-smoke.mjs
```

## Next milestones

1. Phase 2 — source-aware retrieval and honest absence/coverage behaviour.
2. Streaming LLM chat, persisted messages, cancellation retaining partial content.
3. Citation highlighting; multi-doc QA; comparison; Part C Option 2.
4. Deployment, screenshots, demo video, technical note.

## Security

- Never store API keys in Git (`.env*` ignored except `.env.example`).
- Private Storage for originals; HTTP routes have no auth by assignment design.
- Magic signatures checked after upload; production hardening (ZIP bombs, malware, rate limits, durable retries) still required.
