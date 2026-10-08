# Architecture.md — Pactrieve Engineering Architecture

**Project:** Pactrieve  
**Document type:** Architecture and source-integrity decision record  
**Status:** Proposed target; match against repository before implementing  
**Prepared:** 2026-10-08

---

## 1. Architectural objective

Deliver a reviewable, deployable, single-user legal-document application whose evidence can be inspected and independently verified. The architecture must fit the assignment's tight three-day window, not imitate enterprise-scale infrastructure. Correctness, source mapping, bounded execution, persistence and deployment viability take precedence over architectural novelty.

Guiding invariant: **the model interprets, typed application services execute, deterministic code establishes authentic source locations**.

## 2. Existing starter versus target architecture

The supplied **Pactrieve Phase 1 Starter ZIP** contains a Next.js App Router TypeScript project, Supabase client, private Storage assumptions, PDF.js, Mammoth, Zod, document CRUD/process/verify routes, a simple library UI, evidence verifier and unit tests. Its README explicitly says model chat, streaming/cancellation, PDF rendered highlighting, multi-document Q&A, version comparison and agent are **not implemented** at that snapshot.

The developer's local `D:\Fun\pactrieve` state may differ: Cursor previously reported a docs-only Git repository and was directed to import the ZIP. Do not assume import or integration has succeeded without checking local files and tests.

**Do not replace the starter, fabricate an implementation or claim production validation based on ZIP inspection.**

## 3. Baseline stack and version policy

| Layer | Baseline direction | Rule |
|---|---|---|
| Frontend/backend | Next.js App Router, React, TypeScript | Keep existing package versions if compatible and stable; validate rather than upgrade speculatively |
| Database | Supabase PostgreSQL | Relational source of truth for documents/pages/chunks/chat/comparison |
| File storage | Private Supabase Storage bucket | Original PDF/DOCX and short-lived authorized access |
| PDF extraction/view | `pdfjs-dist` / PDF.js | Source text and viewer text-layer mapping |
| DOCX extraction/preview | `mammoth` | Semantic text/HTML; exact Word-layout fidelity is not guaranteed |
| Input validation | Zod + file structure validation | Validate API, upload, tool arguments; Zod alone does not validate binary signatures |
| AI provider | Environment-defined key/base URL/model | OpenAI-compatible client where possible; chosen model must actually support tool calling |
| Retrieval | Existing PostgreSQL chunk storage, indexed text search | Reuse existing chunk schema; introduce embeddings only as a later optional improvement |
| Testing | Existing Node test setup; Playwright only if approved for E2E | Preserve established tests; add necessary quality gates |

The actual starter `package.json` includes Supabase JS, Mammoth, `pdfjs-dist`, Next.js, React and Zod. It does **not** declare Tailwind, Lucide, Drizzle, Playwright or an LLM SDK at that snapshot. Do not describe those as installed. Prefer existing CSS/React primitives until a specific phase justifies a dependency.

Local Node 24 and npm 11 were observed in Cursor's Phase 0 report; validate against local code before making any runtime claims.

## 4. High-level boundaries

```text
Browser
 ├─ Document library + upload/processing states
 ├─ PDF text-layer / DOCX semantic viewer
 ├─ Streaming chat + evidence citations
 ├─ Version comparison UI
 └─ Agent activity timeline
          │
Next.js routes / application services
 ├─ Upload validation and processing orchestration
 ├─ Extraction + canonical text/source maps
 ├─ Structured chunk/section index + retrieval
 ├─ Provider adapter + streamed message lifecycle
 ├─ Independent quote verifier + citation resolver
 ├─ Clause alignment + material-difference classifier
 └─ Bounded agent dispatcher (validated tools)
          │
   ┌──────┴─────────┐
PostgreSQL      Private object storage
(metadata, text,  (original PDF/DOCX)
chunks, chat,
citations, diffs)
```

Keep API routes thin; put testable domain operations in `src/lib/...`. Use Server Components for noninteractive shells, small client islands for viewer, upload, chat, comparison filters and activity UI.

## 5. File ingestion and processing contract

1. Validate requested upload metadata, permitted extensions, size, and supported MIME.
2. Issue a short-lived signed storage upload operation; ensure original goes to a **private** bucket.
3. After upload, server retrieves and validates actual PDF/DOCX structure/signature. Trusting filename alone is forbidden.
4. Persist a clear processing lifecycle; an extraction error or unreadable scan must not be marked ready.
5. Extract page-by-page PDF text with page identity and layout fragments where available. For DOCX, preserve meaningful paragraphs, headings, lists and tables as structural units where practical.
6. Build canonical text with explicit separators and source-position mapping. Preserve byte/character offset conventions and Unicode behaviour; tests must verify source spans.
7. Create structured chunks with overlap, page range, clause heading, canonical offsets and document ID. Store only after extraction checks pass or mark partial explicitly.
8. Make processing idempotent: retries must not duplicate pages/chunks or corrupt status; failed jobs have intelligible recovery.

**Large files:** server-function body and duration limits are real; do not route large PDF bytes through a small API request. The starter uses signed browser-to-storage upload and synchronous processing with a documented 60-second max duration. Assess real 150-page performance before declaring deployment reliable; a durable worker is optional per assignment but may become necessary to satisfy mandatory processing on the chosen host.

**OCR:** not required. Detect zero-readable-text scans and fail cleanly. Partially unreadable documents must carry limitations; never confidently rule out content hidden in unreadable pages.

## 6. Canonical source representation

Each source must have a durable **canonical extracted text string** and a reversible mapping from normalized-search offsets back to original canonical offsets, page numbers and rendered text fragments. Assign source document identity at every stage.

Suggested structure (interface example, not a schema migration mandate):

```ts
type SourceRange = {
  documentId: string;
  startOffset: number; // canonical text units, documented and tested
  endOffset: number;   // exclusive
  pages: number[];
  occurrenceIndex: number;
};

type VerifiedEvidence = {
  verified: true;
  quote: string;           // exact source-derived content
  range: SourceRange;
};
```

A Unicode offset can differ depending on codepoints/UTF-16 handling. Select an explicit convention and test surrogate pairs, line breaks and punctuation. Do not treat PDF text-extraction ordering as the same thing as visual reading order without verification.

## 7. Deterministic evidence engine

Keep `src/lib/evidence/verify.ts` independent of the model and display components if that remains its actual path.

Algorithm:
- Normalize whitespace in proposed quotation and canonical extracted text while constructing an offset map.
- Find **literal normalized matches**, not semantic/fuzzy substitutions. Especially preserve amounts, negations, names and modal verbs.
- For each match, reconstruct canonical source range, exact source quotation, document/page identity and all duplicate occurrences.
- Require the correct `documentId`; never verify a quote against a merged multi-document corpus.
- Return explicit unverified/no match when appropriate. The application can omit unsupported quoted text, repair answer with genuine evidence, or abstain.

A genuine quotation can still support an incorrect summary. Introduce claim-to-evidence checking or conservative phrasing rather than pretending literal matching proves entailment. Verified quotation badges are **not** universal legal correctness guarantees.

## 8. Retrieval and 150-page coverage

Use heading/clause-aware segmentation and paragraph-level boundaries when reliably extracted; otherwise use bounded overlapping chunks, preserving offsets. Index document ID, normalized terms, numeric strings, section labels, page ranges and adjacency.

Retrieval for a question:
1. Query and filter **selected** document IDs.
2. Search with lexical/indexed retrieval and exact amount/phrase support.
3. Expand to parent section and adjacent chunks when needed.
4. Inspect referenced clauses, exceptions and definitions when the question depends on them.
5. Log coverage evidence, not arbitrary completeness percentages.
6. For negative/existence questions, broaden search across clauses and full indexed text; never infer absence from only top-k hits.

Rankings return candidates, not proof. If relevant evidence is not established, say retrieval was inconclusive rather than stating a missing clause does not exist.

## 9. Real streaming + persisted cancellation

Proposed message lifecycle:

`queued → researching → streaming → completed | stopped | failed`

Use actual provider stream events with a structured server response (e.g., event stream frames for status, deltas, evidence results, errors and terminal state). Persist message/session ID before generation. Periodically checkpoint text and persist a final partial record when generation is aborted or the connection drops. Design for a race between cancel, late provider chunks and completion; completion/stopped must be consistent and idempotent.

Client `AbortController` alone can stop rendering without guaranteeing server persistence. Ensure cancellation reaches the server/provider where supported and design a durable fallback to recover persisted partial content. Never mark partial content as completed or verified without evidence.

Chat history must reopen by its document selection. Multi-document sessions need explicit link records (starter schema includes `conversation_documents`).

## 10. PDF / DOCX evidence highlighting

**PDF:** use PDF.js rendered pages and actual text layer; reconstruct a mapping between canonical extraction and rendered text spans. Navigate to affected page(s), wait for render/text layer readiness, highlight exact character spans, and scroll first occurrence into view. For cross-page quotes, highlight spans on both pages. For repeated quotes, use occurrence/context selector or explicit disambiguation. Recompute highlights on zoom/reflow; avoid fixed absolute pixel rectangles disconnected from text.

**DOCX:** use a semantic rendered preview with stable paragraph/run IDs and source mapping. Convert to safe HTML as appropriate, sanitize any untrusted external links/markup, and range-highlight the corresponding text. Mammoth preview is not guaranteed pixel-identical to Word; record this limitation clearly.

No citation should resolve to a different document based on same-text coincidence. Clicking a deleted or unavailable original yields an explicit failure state, not a fake highlight.

## 11. Multi-document analysis

Sessions reference a set of selected document IDs. Scope every retrieval/tool call to that set. The synthesis should compare findings across selected contracts (differences, overlap, conflicts, qualifications), not merely append mini-summaries. Each evidence item includes origin document and is independently verified. Do not hide uncertainty for a document lacking evidence.

## 12. Version comparison pipeline

Input: two explicitly selected documents, ordered old → new.

1. Parse clauses/paragraphs with stable headings/numbers where available.
2. Align candidates using numbering, headings, text similarity and neighbourhood; tolerate moved/reordered clauses. Mark low-confidence matches uncertain.
3. Classify unchanged/modified/added/removed/moved.
4. Extract critical values/units/dates/duties/parties/negations/exceptions and detect substantive differences with deterministic comparisons where possible.
5. Use a bounded LLM prompt for plain-language *grounded* explanation of aligned text.
6. Verify any displayed excerpts against each original document; map change rows to source positions.
7. Filter/sort by significance; severity should be transparent, conservative and reviewable, not legal advice.

Avoid whole-document character diff or claims that semantic relevance is a solved problem.

## 13. Part C bounded agent tool loop

Representative typed tools:

```ts
search_document({ documentId, query, limit? })
get_section({ documentId, sectionId })
list_clauses({ documentId })
```

The server validates model-selected names, arguments, document membership and sensible size limits. Unknown tool, missing arguments, nonsensical section, provider error or oversized output returns a controlled error, not an uncaught exception. Support multiple rounds (proposed 6 max; set and test actual cap), a per-round timeout and total token/cost budgets. Send truthful activity events after real operations occur. Final answers pass through the same verifier as basic chat.

Do not stage canned research steps. Prompt injection embedded inside a contract cannot elevate privileges or alter allowed tool definitions.

## 14. Persistence and deletion model

Starter schema identifies `documents`, `document_pages`, `document_chunks`, `conversations`, `conversation_documents`, `messages`, `citations`. Verify actual columns/constraints before adding new migrations. A future `comparisons` + `comparison_changes` pair may be justified in the comparison phase; do not create it pre-emptively without need.

Maintain referential integrity and correct user-facing state after delete. Deleting source storage and database records is not automatically atomic across systems; implement and test a recovery/compensation strategy or document a bounded failure state.

## 15. Security, privacy and limits

No accounts per spec. Public demo + service-role backend is not tenant isolation. Restrict supported files, rate/size-limit endpoints where appropriate, keep originals private and issue short-lived read/upload grants. Log operational metadata but no contract bodies/API keys by default. Sanitize DOCX render output, escape model text, bound prompt/tool outputs and avoid document-driven code execution. Deploy with **synthetic data**, warn users not to upload real confidential contracts.

## 16. Tests and evaluation

**Unit:** normalizer offset maps, duplicate/cross-page quotes, wrong-document match, corruption/scans, chunk offsets, clause alignment and changed numerical terms, agent argument validation/round cap.

**Integration:** signed upload and storage, DB commit/retry/delete, provider streaming/abort/error, persisted conversations, source-specific citations.

**E2E:** new PDF/DOCX, scan rejection, 150-page late clause, click highlight including cross-page, multi-document contrast, version comparison significance filter, bounded agent activity, refresh history, stop partial.

No E2E success claims until a real server/deployment and credentials have been exercised. Record exact fixtures and failures.

## 17. Deployment and constraints

Deploy the real app on an assignment-approved provider (Vercel, Railway, Render or Fly.io) with managed PostgreSQL and private storage configured. Test actual function limits, document size, processing duration, streaming headers and API key availability. Do not postpone all deployment until the last hour. Infrastructure choice is reviewable against observed failures, not selected for novelty.

Required submission: GitHub, live URL, README and 4 screenshots, 3–5 minute screen recording, half-page technical note. Document any incomplete feature explicitly.

## 18. Architecture decision records

| ID | Decision | Rationale |
|---|---|---|
| ADR-001 | Keep Next.js App Router from starter | Assignment preference, unified backend/frontend, fewer moving parts |
| ADR-002 | Retain Supabase PostgreSQL + private Storage baseline | Durable text/state/originals; direct upload flow |
| ADR-003 | Separate deterministic verification from AI | Prevent hallucinated evidence and untrusted offsets |
| ADR-004 | Canonical text + reversible offsets | Enables genuine quote matching and source highlighting |
| ADR-005 | Indexed source-aware retrieval rather than full-document prompting | 150 pages, cost and coverage honesty |
| ADR-006 | Real streaming lifecycle with saved partial results | Assignment requires streaming, stop, history |
| ADR-007 | Clause-level aligned comparison | Detect meaningfully changed contract terms |
| ADR-008 | Part C Option 2 bounded tool-calling | Reuses evidence architecture, avoids high-risk tracked-change XML |
| ADR-009 | Tokens/typography custom; no default dashboard kit | Preserves human-authored editorial precision |

## 19. Architecture change protocol

For a proposed change, record: current assumption; verified defect/need; alternatives; files/schema affected; tests; deployment impact; approval status; and rollback. If the change is RED under `rules.md`, stop for review. Do not rewrite unrelated modules during a single phase.
