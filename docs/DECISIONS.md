# Engineering decisions

## 2026-10-09 — Phase 8 clause-level version comparison

- **Decision:** Compute comparison **on the fly** from canonical text (`getDocumentSource`). No new comparison tables or migrations.
- **Decision:** Dedicated `/compare` workspace and `POST /api/compare` — separate from Phase 7 multi-document research Q&A (`/research`).
- **Decision:** Segmentation prefers `detectSections` legal headings, then paragraph fallback; soft-split oversized blocks. Retrieval chunks are **not** treated as legal clauses.
- **Decision:** Alignment is deterministic and bounded: Stage A unique structural keys require text similarity ≥ `STRUCTURAL_FLOOR` (0.58) so renumbering cannot force weak pairs; Stage B/C order window + near-exact move scan; Stage D unmatched → added/removed. Cap `MAX_CANDIDATE_PAIRS` at 25k.
- **Decision:** Classifications: `unchanged` / `modified` / `added` / `removed` / `moved` / `uncertain`. Safe whitespace normalization only — `shall`/`may`, amounts, and party names remain distinct.
- **Decision:** Source navigation uses `SourceFocus` (documentId + UTF-16 offsets) into existing PDF/DOCX viewers — not fake `VerifiedCitation` / AI-verified labels.
- **Decision:** Phase 8 left **uncommitted** for manual user review. Phase 9 significance/severity deferred.
- **Observation:** Live API alpha→beta: 2 `modified` (30→60 days; AED 100,000→1,000,000), amounts preserved, ~5ms align after load. Browser PASS: ledger + original/revised DOCX SourceFocus highlights. Unit suite **174/174**; typecheck + build pass (`/compare`, `/api/compare`). Large synthetic (~120 clauses) bound &lt;8s / candidatePairs &lt;30k in unit test.
- **Limitation:** Split/merge may surface as conservative add/remove/modified rather than explicit multi-block links. Duplicate boilerplate can remain uncertain. No severity scoring (Phase 9). Unreadable extraction never counted as confirmed deletion.

## 2026-10-09 — Phase 7 multi-document comparative Q&A

- **Decision:** Reuse existing `conversation_documents` (no new tables). Conversations for research are exact-set locked: follow-up questions must send the same document ID set.
- **Decision:** Selection limit **2–5** ready documents — balances comparative value against retrieval fan-out and LLM evidence budget (`MULTI_DOC_EVIDENCE_CHAR_BUDGET` ≈ 8k chars with per-document fair share).
- **Decision:** Retrieve independently per document (optional concept sub-queries for termination/liability/etc.), then merge into one globally unique evidence registry (`e1…`) each carrying `documentId` + `documentName`.
- **Decision:** `resolveCitationsMulti` verifies each evidence ID only against that ID’s own canonical source — identical quotes in two contracts never cross-attribute.
- **Decision:** Comparative system prompt requires a synthesis with similarities/differences; stacking unrelated per-doc summaries is insufficient.
- **Decision:** Citation persistence stores each citation’s own `document_id` (not only the conversation primary id).
- **Decision:** UI: library checkboxes → `/research` desk with MultiDocumentChat + switchable PDF/DOCX viewers. Single-document `/documents/:id` chat unchanged.
- **Decision:** Phase 7 committed as `cfa8140` after manual review. No Phase 8 clause-diff in that commit.
- **Observation:** Live Groq PASS on `phase7-alpha` vs `phase7-beta` — comparative notice (30 vs 60 days) and liability (AED 100,000 vs AED 1,000,000) with citations bound to the correct document IDs. Browser PASS: historical conversation reopen + Alpha citation opens Alpha DOCX preview with highlight.
- **Limitation:** Lexical retrieval may miss provisions; missing evidence ≠ absence. Aggregate coverage notes gaps per document. Live Groq Stop timing still unproven.

## 2026-10-09 — Phase 6 DOCX semantic preview and citation highlighting

- **Decision:** Do **not** claim Word page-fidelity. Navigate by verified UTF-16 canonical offsets into a semantic HTML/React preview (headings, paragraphs, lists, tables, emphasis).
- **Decision:** Preview pipeline: Mammoth `convertToHtml` → allowlisted AST (no `dangerouslySetInnerHTML`) → flatten with `\n\n` block separators to match stored `extractRawText` canonical text → DOM Range overlays.
- **Decision:** No new sanitizer package; hand-rolled allowlist strips scripts, event handlers, `javascript:`/`data:` URLs, and embedded active content.
- **Decision:** On visual align failure, keep verified-source status and fall back to the extracted-text highlighter (same offsets).
- **Decision:** Phase 6 left **uncommitted** for manual user review.
- **Observation:** Local browser acceptance PASS for table-cell `AED 100,000` (exact DOM Range geometry), paragraph citations, viewport resize overlay update, long FloNeo DOCX (~517 leaves), and PDF regression highlight on `phase5-sample.pdf`. Full chat-stream + historical citation reload not re-proven in this browser pass (covered by automated persist/chat tests).
- **Limitation:** Headers/footers and some Word-only constructs may not appear in Mammoth HTML; pathological whitespace differences can fail visual map while verification still succeeds.

## 2026-10-09 — Phase 5 PDF citation navigation and highlighting

- **Decision:** Use installed `pdfjs-dist` (client `getDocument` + canvas + `TextLayer`) against the **original uploaded PDF**, loaded same-origin via `GET /api/documents/:id/file?raw=1` (service-role download; bucket stays private). No new viewer package; no CDN worker (`postinstall` copies worker to `public/`).
- **Decision:** Mapping is two-stage: (1) verified canonical UTF-16 offsets from `verifyQuote` / persisted citations; (2) page-local align onto PDF.js text items using the same `reconstructPdfPage` geometry rules, with whitespace-tolerant fallback via `normalizeWithSourceMap`. Never invent highlight rectangles when alignment fails — navigate to the known page and report unavailable precise highlight.
- **Decision:** Repeated occurrences resolve by stored `startOffset`/`endOffset` (and derived page indices from stored page boundaries). Empty `pageIndices` on historical citations are derived client-side from `source.pages`.
- **Decision:** Viewport windowing renders only pages near the current page / citation pages so page ~150 is reachable without full-document rasterization.
- **Decision:** DOCX original-layout highlighting remains Phase 6; extracted-text inspector stays available.
- **Decision:** Phase 5 left **uncommitted** for manual user review.
- **Limitation:** Some PDFs with pathological text item order / custom encodings may fail visual alignment while remaining verified in canonical text.

## 2026-10-08 — Phase 4 persistent chat and cancellation

- **Decision:** Reuse existing `conversations` / `conversation_documents` / `messages` / `citations` tables with an **additive** migration (`pending`/`interrupted` statuses, `cancel_requested`, `updated_at`, optional `citations.section_label`).
- **Decision:** Map Phase 3 answer outcomes to DB statuses: `answered`/`insufficient_evidence` → `complete`; user Stop → `stopped`; provider failure → `failed`; client disconnect mid-stream → `interrupted`.
- **Decision:** Cancellation is **DB-authoritative** (`messages.cancel_requested`) polled by the durable chat loop, which also aborts the provider `AbortSignal`. No Redis/workers.
- **Decision:** Checkpoint assistant content ~every 400 characters or 800 ms while `streaming`. Flush before Stop/failure finalization.
- **Decision:** Terminal transitions are idempotent; a late `complete` cannot overwrite `stopped`.
- **Decision:** On Stop, resolve citations only against accepted partial text; incomplete markers are not verified.
- **Decision:** Phase 4 committed as `eb0c3f8` after manual review; migration applied on live Supabase.
- **Limitation:** Tokens after the last checkpoint may be lost on hard process death before finalization.
- **Limitation:** Live Groq Stop timing was not reproducibly demonstrated; fake-provider Stop remains the token-boundary proof.

## 2026-10-08 — Phase 3 grounded streaming chat

- **Decision:** OpenAI-compatible `/chat/completions` over native `fetch` (no LLM SDK). Configure with `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` only on the server.
- **Decision:** Build a **verified evidence registry** from retrieved passages *before* generation. Assign stable request-scoped IDs (`e1`…). Model may cite IDs only; positions always come from registry + `verifyQuote`.
- **Decision:** Stream via SSE over `POST /api/documents/:id/chat`. Answer deltas are provisional; citation events fire only after post-generation registry resolution.
- **Decision:** When coverage is not generable (`NO_MATCH_ESTABLISHED`, `SEARCH_LIMITED`, empty registry, etc.), abstain without calling the provider. Never claim absence from a retrieval miss.
- **Decision:** Prefer higher-scoring / phrase-literal passages when filling the prompt char budget (expansion returns document order).
- **Decision:** No durable chat persistence or Stop-and-save in Phase 3 (reserved for Phase 4). UI keeps ephemeral thread state only.
- **Decision:** No new npm dependencies.
- **Decision:** Phase 3 left **uncommitted** for manual user review.
- **Corrective (live Groq):** Parse CJK corner-bracket citations `【eN】` in addition to canonical `[eN]` (observed from `openai/gpt-oss-20b`). When no verified citations remain, **replace** provisional streamed prose with an explicit insufficient-evidence message (`replacedProvisional`) instead of appending a warning under an unsupported claim.
- **Observation:** Live Groq verification PASS after corrective patch (streaming + grounded citation + abstention probes).

## 2026-10-08 — Phase 2 structure-aware retrieval

- **Decision:** No schema-breaking migration. Reuse `document_chunks` + existing `search_vector` GIN. Optional additive SQL function `pactrieve_search_chunks` for FTS candidate discovery; application falls back safely if absent.
- **Decision:** Derive `sectionLabel` at chunk/retrieval time from heading heuristics; do not require a new DB column.
- **Decision:** Final ranking is phrase-safe in-process scoring over persisted chunks (amounts/negations). Postgres FTS/ILIKE may propose candidates but must not outrank exact amount phrases via token overlap (`100` vs `1,000,000`).
- **Decision:** Typed coverage statuses distinguish matches, inconclusive search, partial unreadable source, and failures — never “clause absent” from top-k miss.
- **Decision:** Context expansion always retains seed hits; neighbors fill remaining char budget only.
- **Decision:** Phase 2 changes left **uncommitted** for manual user review (per phase instructions).

## 2026-10-08 — Phase 1 ingestion hardening

- **Decision:** Keep multi-step Supabase writes (no fake cross-storage transaction). Use status claim (`uploading|failed` → `processing`), optional stale `processing` reclaim after 2 minutes, purge-then-insert for pages/chunks, and best-effort derived-row cleanup on failure before marking `failed`.
- **Decision:** Validate DOCX as OOXML (`[Content_Types].xml` + `word/document.xml`), not ZIP magic alone. Reject empty buffers, MIME/extension mismatches, oversized metadata, and PDFs declaring `/Encrypt`.
- **Decision:** Mark `pdfjs-dist` and `mammoth` as Next.js `serverExternalPackages` after live evidence that bundled `next start` could not open valid PDFs while the same extract path worked outside Next.
- **Decision:** Deletion removes storage first (missing object tolerated), then DB row (cascade). Do not return success if either required step fails after a real error.
- **Decision:** UI gains a **Retry** control for `uploading`/`failed` only — no design-system redesign.
- **Observation:** Synthetic 150-page PDF processed live end-to-end in ~6s locally; dense commercial PDFs may still hit the 60s `maxDuration` on serverless hosts.

## 2026-10-08 — Governance pack adoption (docs-only)

- **Decision:** Import `Pactrieve_Governance_Pack.zip` into the repo as `AGENTS.md` plus `docs/{rules,PRD,Architecture,Design,phases}.md` (and preserve pack `INSTALL_NOTES.md` under `docs/`).
- **Decision:** Cursor/agent reading order is defined in root `AGENTS.md` (rules → PRD → Architecture → Design → phases → PROJECT_CONTEXT → DECISIONS → REQUIREMENTS_MATRIX → ASSIGNMENT_SOURCE).
- **Decision:** Employer assignment PDF remains highest authority for *what* must be built; governance docs control *how* and phase gates where they do not contradict the assignment.
- **Open for review:** `rules.md` §1 lists reading assignment / `ASSIGNMENT_SOURCE` / `PROJECT_CONTEXT` before `rules.md`, while `AGENTS.md` starts with `rules.md` per integration instructions. Conflict resolution order still places the assignment PDF first; reading-order meta-difference left documented rather than silently rewriting `rules.md`.
- **Open for review:** Earlier coarse “Phase 1+” labels in historical notes differ from the finer `phases.md` roadmap (Phase 1 ingestion … Phase 13 handoff). Adopt `phases.md` going forward; do not rewrite historical matrix phase columns without a dedicated status pass.

## 2026-10-08 — Requirements authority (preserved from early Phase 0)

- **Decision:** Treat `C:\Users\harsh\Downloads\SDE Assignment.pdf` as the authoritative feature and submission checklist.
- **Decision:** Treat the Pactrieve engineering brief (Supabase stack, file layout) as implementation guidance.
- **Decision:** Part C target is **Option 2 (agentic document research)**; not started until Parts A/B foundations exist.

## 2026-10-08 — Repository baseline then starter import

- **Observation:** Initial workspace had Git on `main` with no commits and docs-only content; starter was missing.
- **Decision:** Import `Pactrieve_Phase1_Starter.zip` into the existing repo; preserve `.git`, `docs/ASSIGNMENT_SOURCE.md`, and `docs/REQUIREMENTS_MATRIX.md`.
- **Decision:** Preserve pre-import and starter documentation by merging README / PROJECT_CONTEXT / DECISIONS and storing unmodified starter copies under `docs/starter-import/`.
- **Decision:** Do not scaffold a second Next.js app.

## Objective (from starter)

Build a reliable single-user legal-contract workspace for a three-day SDE assignment. Internal target: complete earlier than the absolute deadline.

## Product philosophy

The original source is authoritative; the LLM is not. No model-suggested offsets or page numbers are accepted as verification. Verified literal source text is necessary but not sufficient to guarantee an answer's interpretation is correct.

## Choice of Part C

Option 2, agentic document research. It shares retrieval, section navigation, bounded execution and evidence verification primitives with required Parts A and B. Genuine multi-round tools and transparent activity events are required; hardcoded fake activity does not count.

## Why direct signed uploads

Browser-to-storage uploads avoid request payload ceilings in serverless hosts. The browser's token cannot grant arbitrary server database access. Post-upload process route validates magic signatures and extractability before marking ready. For larger files, replace the standard signed upload with resumable signed TUS.

## Canonical text and citation positions

PDF pages are extracted independently and joined with a single newline. Source offsets are UTF-16 JavaScript string offsets, not PDF byte offsets. This makes deterministic text evidence checking feasible. They are not reliable rendered PDF coordinates; visual highlighting requires separate PDF.js text-layer span mapping and occurrence disambiguation.

## Large document policy

Chunking uses overlapping character windows with offsets and Postgres full-text indexes. It is **not** yet structure-aware and the retrieval/coverage/abstention endpoint is not yet built. Next step: split at clauses and headings, use lexical search + section expansion. Absence assertions require broader search or a cautious refusal, not a top-K guess.

## Known risks

- Live Supabase integration and deployment are not yet verified until credentials are configured.
- Synchronous processing may time out, especially on scanned/large PDFs.
- DOCX text preview has no Word-equivalent pagination or formatting.
- Certain PDFs may require better spacing/layout reconstruction and OCR.
- Quote existence check alone cannot guarantee semantic entailment.
- Current demo lacks authentication; do not upload confidential files.

## Stop/go gates

Every milestone needs explicit failing/passing tests and manual regression of earlier features. README and demo must distinguish working, partial and missing capabilities.
