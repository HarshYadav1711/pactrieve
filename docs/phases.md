# phases.md — Pactrieve Controlled Implementation Plan

**Project:** Pactrieve  
**Document type:** Phase-by-phase implementation, acceptance and commit gates  
**Status:** Proposed roadmap; re-evaluate after actual Phase 0 baseline checks  
**Prepared:** 2026-10-08

---

## 0. The workflow applied to every phase

**READ CONTEXT → VERIFY STARTING STATE → PLAN → IMPLEMENT SCOPED WORK → RUN CHECKS → REVIEW DIFF → REPORT → STOP.**

Always begin with: assignment, `docs/PROJECT_CONTEXT.md`, `docs/rules.md`, `docs/PRD.md`, `docs/Architecture.md`, `docs/Design.md`, `docs/phases.md`, `docs/REQUIREMENTS_MATRIX.md` and relevant current source/tests. Declare branch, HEAD, cleanliness, precise files in scope, tests and prohibitions. No automatic transition to the next phase.

Each commit is created **only after required runnable checks pass** and only for reviewed scoped changes. If credentials block an integration, leave status `BLOCKED` and document why; do not invent a successful run. No push/deploy unless explicitly allowed. One meaningful phase, one review and generally one commit, without manufacturing commits for incomplete work.

**Critical delivery context:** Assignment received Oct 7, 2026, 21:42 IST. Internal target Oct 10, 2026, 18:00 IST. External deadline hour is not explicitly confirmed. Prioritize live deployment and real acceptance over optional bonuses.

## Phase 0 — Baseline import, context lock and verified build

**Goal:** Preserve the existing `D:\Fun\pactrieve` repo/documents and import the provided Pactrieve starter if not yet imported; audit actual state without new features.

**Tasks:** Inspect Git and source; import starter only if absent and with merge review; install dependencies; run typecheck, unit tests and production build; inspect existing upload/extraction/verifier; check `.gitignore`, env handling, schema/private bucket instructions; reconcile requirements statuses; verify source offsets against tested behaviour.

**Do not:** generate a second app; replace `.git`; overwrite existing project-context or decisions docs; implement AI/chat/comparison; claim Supabase integration when not connected.

**Exit:** existing app compiles/tests/builds or precise blocker documented; requirements matrix reconciled; no secrets in staged diff; scope preserved.  
**Commit:** `chore: bootstrap Pactrieve and validate project foundation`

## Phase 1 — Reliable ingestion and document lifecycle

**Goal:** PDF/DOCX upload/extraction/list/open/delete, durable status and clear scan failures.

**Tasks:** Validate signatures/limits; detect empty/scanned pages; make processing retry-safe and failures recoverable; persist canonical page text and truthful status; test delete and storage cleanup; confirm unfamiliar DOCX and PDF cases.

**Do not:** chat, UI highlighting, version comparison, Part C agent.

**Exit:** PDF/DOCX fresh uploads work through storage and DB; invalid/scan/corrupt fail appropriately; refresh/list/open/delete work; unit/integration gates pass; deployment-limit caveats recorded.  
**Commit:** `feat: harden document ingestion and processing lifecycle`

## Phase 2 — Structured text retrieval and long-document coverage

**Goal:** Find relevant clauses throughout approximately 150 pages with honest uncertainty.

**Tasks:** Structure-aware chunks and overlaps; canonical offset validity; indexed search and exact-number/phrase fallback; neighbour/parent-section expansion; explicit negative-answer coverage behaviour; realistic long-file tests.

**Do not:** create a semantic vector service unless explicitly approved; claim top-k non-match proves absence; start agent tools.

**Exit:** tests cover early/late clauses, definitions and cross-references; retrieval exposes source identity/offsets and scoped coverage; no unsupported absence claims.  
**Commit:** `feat: implement source-aware document retrieval`

## Phase 3 — Grounded streaming single-document chat

**Goal:** Real model-generated document Q&A with claim/evidence boundaries.

**Tasks:** Environment-defined API key/base URL/model; streaming route, bounded retrieval, document-scoped source passages, independent quote verification, clear abstention/error response, one document workspace chat UI. Test with controlled provider stub and at least one real provider flow if credentials are available.

**Do not:** timed typewriter effect; fake citations; multimodel selector; multi-document questions.

**Exit:** true stream on real server, verified excerpts only, wrong/fake quote rejected, unsupported answer abstains, error shown clearly.  
**Commit:** `feat: add grounded streaming document chat`

## Phase 4 — Saved conversations, stop and partial recovery

**Goal:** Chat sessions survive refreshes and cancellation preserves partial text.

**Tasks:** Persist sessions/messages/evidence; real stop propagation; checkpoint partial messages; distinguish `stopped`, `failed`, `completed`; reopen correct document history; prevent double-terminal race; test refresh and abort.

**Do not:** mark partial as complete; silently discard text; implement cross-document chat.

**Exit:** stop visibly halts generation to extent supported; partial output remains after refresh; history returns correct citations/doc identity; aborted streams do not corrupt state.  
**Commit:** `feat: persist chat sessions and support generation cancellation`

## Phase 5 — PDF.js citation navigation and highlighting

**Goal:** Clicking verified PDF quotes opens the right original, scrolls and highlights actual words.

**Tasks:** PDF viewer/text layers, canonical-to-render map, multiline segments, cross-page continuation, repeated occurrence resolution, navigation from persisted citation, zoom/resize handling, browser tests.

**Do not:** page-only fake highlight; whole-PDF DOM rendering if expensive; DOCX redesign.

**Exit:** successful exact highlight of known single/multiline/cross-page sources, repeats handled deterministically or with user selection, responsive layout validated.  
**Commit:** `feat: implement verified PDF citation navigation`

## Phase 6 — DOCX source navigation and robust evidence cases

**Goal:** Render readable DOCX with passage highlights and close remaining citation integrity cases.

**Tasks:** Semantic preview and source mapping for paragraphs/lists/tables; precise source highlight; duplicate text and extraction limits; security sanitisation; tests across DOCX and PDF saved citations.

**Do not:** claim pixel-identical Word rendering; silently reformat/download tracked changes (Option 1 excluded).

**Exit:** click-to-highlight works for tested DOCX sources, limitations documented, no cross-document leakage; regression gates pass.  
**Commit:** `feat: add DOCX evidence highlighting and occurrence resolution`

## Phase 7 — Cross-document question answering

**Goal:** One question comparing several selected contracts with document-verified evidence.

**Tasks:** Multi-select UI; conversation-document association; scoped retrieval; comparative synthesis; per-document citation verification; conflicts/missing evidence; refreshable history.

**Do not:** concatenate unrelated independent answers; verify quotes against combined text; include unselected documents.

**Exit:** comparative question returns actual differences with properly labelled source citations; missing/conflicting document behaviour and wrong-document quote tests pass.  
**Commit:** `feat: support cross-document evidence-based analysis`

## Phase 8 — Clause/paragraph alignment and comparison UI

**Goal:** Compare two versions at contract-clause level, not as raw character diff.

**Tasks:** Reliable paragraph/heading extraction, aligned old/new candidate sections, added/removed/modified/moved classification, uncertain matches, side-by-side or change-ledger UI, source navigation.

**Do not:** generate giant opaque document diff; invent section numbers; label low-confidence alignment as certain.

**Exit:** real test versions show correct clause changes, moves/reorder and new/deleted provisions; browser comparison usable.  
**Commit:** `feat: implement clause-level contract comparison`

## Phase 9 — Substantive change interpretation and severity

**Goal:** Explain material contract changes clearly, with relevant significance filters.

**Tasks:** Detect changed monetary values/units, obligations, dates, exceptions and parties; differentiate cosmetic wording from changed meaning; severity rationales and sorting/filtering; verify any quotes and link to source; conservative uncertainty.

**Do not:** imply legal certainty or hardcoded high severity for every textual difference.

**Exit:** AED 100,000 → AED 1,000,000 and modal/negation test cases correctly interpreted; significance filters work; no unsupported claims.  
**Commit:** `feat: classify and explain material contract changes`

## Phase 10 — Part C: bounded agentic document research

**Goal:** Real iterative model-selected tool calls with visible authentic activity.

**Tasks:** Typed tools (`search_document`, `get_section`, `list_clauses` or equivalent); validated dispatch; multi-round loop with results reinjected; max rounds (proposed 6) and output/time/cost budgets; control malformed/invented calls; stream actual activity states; verify final quotes.

**Do not:** fake scripted agent timeline; expose private keys/tools; allow indefinite loops or unbounded tokens.

**Exit:** model performs at least two meaningful rounds in a test, malformed tool calls fail closed, cap enforced, UI reflects actual operations, final quote verification applies. If partial, describe exactly what does not work.  
**Commit:** `feat: implement bounded agentic contract research`

## Phase 11 — Adversarial, accessibility, integration and UX review

**Goal:** Break the app before the evaluator does.

**Tasks:** Invalid file/signature, scan, partial scan, large contract, quote hallucination, wrong-document matching, Unicode, cross-page, duplicate passages, delete/reload, streaming interruptions, malicious document instructions, bad agent calls, timeouts; visual review at 1440/1024/768/390/360; keyboard/focus/contrast/reduced motion; design critique against `Design.md`.

**Do not:** add optional bonuses; redesign from scratch; call a skipped integration a pass.

**Exit:** documented results and fixes; all available unit/type/build/E2E gates green; residual limitations declared.  
**Commit:** `test: harden contract analysis and evidence workflows`

## Phase 12 — Live deployment and evaluator acceptance

**Goal:** Ensure the real deployed link behaves like the tested local build.

**Tasks:** Configure secrets/private storage/DB; deploy; test fresh unknown PDF and DOCX, chat/stop/history, citation click, multi-doc comparison, Part C; check browser console and function timeouts; verify no committed credentials.

**Do not:** hide broken deployment by recording local-only demo; use confidential real-world contracts on public no-auth instance.

**Exit:** URL accessible, mandatory implemented features demonstrably work under deployed conditions, weaknesses noted.  
**Commit:** `chore: prepare and verify production deployment`

## Phase 13 — Assessment handoff

**Goal:** Deliver all five submission items with factual documentation.

**Tasks:** README local setup, screenshots of upload/verified answer/highlight/comparison, real 3–5 minute demo with Part C and limitations, half-page engineering note covering quote verifier failure cases, 150-page strategy, Part C rationale/progress, future work; GitHub link and live URL; final smoke checks.

**Do not:** rewrite code for vanity polish, fabricate features/screenshots, claim legal accuracy.

**Exit:** complete five deliverables, URLs verified, known limitations honestly disclosed.  
**Commit:** `docs: finalize assessment submission and engineering notes`

---

# Final acceptance checklist

## Product
- [ ] PDF/DOCX valid uploads and invalid-file errors.
- [ ] Scanned PDF no-text handling and truthful processing states.
- [ ] Persistent document library and delete.
- [ ] Real streamed grounded chat; stop keeps partial response; history restored.
- [ ] Independently verified citations with correct source locations.
- [ ] Accurate multiline, cross-page and repeat citation highlighting.
- [ ] Reliable 150-page search with coverage honesty.
- [ ] Multi-document comparative answers and per-source verification.
- [ ] Clause/paragraph differences, substantive summaries, significance filters.
- [ ] Part C agent loop, live activity, input validation, hard cap, verified final quotes.

## Design/accessibility
- [ ] Information hierarchy prioritises source document and evidence.
- [ ] No decorative fake metrics, generic SaaS hero or template tropes.
- [ ] Responsive checks at 1440/1024/768/390/360.
- [ ] Keyboard navigation, labels, visible focus, contrast and reduced motion.
- [ ] Honest empty, failure, progress, partial and uncertainty states.

## Security/engineering
- [ ] No secrets in repo/logs, private storage as intended.
- [ ] Malformed documents/tools handled without crashes.
- [ ] Deterministic verifier tests and whole-flow integration/e2e evidence.
- [ ] Build/typecheck/tests genuinely run and results recorded.
- [ ] No paid or out-of-scope extras introduced unexpectedly.

## Submission
- [ ] GitHub repository URL.
- [ ] Live URL tested with fresh evaluator-style files.
- [ ] README + four required feature screenshots.
- [ ] 3–5 minute real demo including Part C state.
- [ ] Half-page verification/large-document/Part-C/future-work note.
