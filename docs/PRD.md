# PRD.md — Pactrieve Product Requirements

**Project:** Pactrieve — *Every answer, traceable.*  
**Document type:** Product requirements and evaluator-facing acceptance contract  
**Status:** Planned requirements; implementation status must be tracked separately  
**Primary source:** User-provided six-page SDE Engineering Assignment  
**Prepared:** 2026-10-08

---

## 1. Why this product exists

Reviewing legal contracts is slow when answers cannot be traced to source language, long files exceed AI context limits, and revisions hide changes in obligations. Pactrieve is a single-user workspace to upload contracts, ask grounded questions, inspect **independently verified** source quotations and compare agreements/versions. It is a software-engineering assessment, not a production legal-opinion engine.

The reviewers will upload **their own documents** to the live deployment, test real features, inspect GitHub/README and watch a 3–5 minute demo. A staged recording alone is not success.

## 2. Product statement and principles

> Pactrieve lets one person read and compare contracts, with claims traceable to accurately located evidence in the source documents.

Order of value:
1. Evidence accuracy and explainable uncertainty.
2. Reliable processing, persistence and source navigation.
3. Contract-oriented comparison and cross-document analysis.
4. Finished interaction, accessibility and engineering quality.
5. Optional enhancements only after mandatory scope is verified.

## 3. Users and assessment context

**Primary user:** One contract reviewer, analyst or engineer examining PDF/DOCX legal agreements. No registration, accounts, organisations or permissions UI.

**Secondary user:** SDE evaluator, testing fresh documents and adversarial cases. They will judge real behaviour, not a feature checklist.

**Delivery constraint:** Assignment received Oct 7, 2026 at 9:42 PM IST. It states "3 days from the day you receive this assignment" without specifying an exact hour; internal completion target Oct 10 at 6:00 PM IST. Do not claim the external cutoff has been confirmed.

## 4. Mandatory scope: Part A

### A1. Upload, processing and document library

- Accept genuine PDF and DOCX; reject other types with a clear, actionable message.
- Validate file type and process malformed or unsupported inputs without a false-ready state.
- Extract and persist text with document/page/section mapping as available.
- Show meaningful progress states: selected → uploading → extracting → indexing → ready; failed with reason and recovery action.
- If a scanned PDF contains no readable text, explain that text extraction is unavailable; do not save an empty "successful" document.
- Expose library actions to list, open and delete uploaded files; verify durable persistence after refresh.
- Preserve originals for document viewing; make deletion consistent with derived records.

**Acceptance:** new PDF and DOCX are usable after refresh; invalid file and image-only PDF fail clearly; deletion removes file/library state without ghost content.

### A2. Single-document chat

- Ask questions against an explicitly selected document.
- Stream actual model output as generated; do not wait for full completion.
- Provide a stop control; preserve already-generated text and record that output was interrupted.
- Persist conversations/messages *per selected document* and reopen history across refreshes.
- Errors (model, network, aborted stream, deleted document) remain understandable and recoverable.

**Acceptance:** visible incremental response; stop mid-generation; reopening retains partial text and chat history with correct document association.

### A3. Verified quotations — primary criterion

- Every displayed grounded answer includes real supporting quotation(s) from selected document(s).
- Match proposed quotes in stored canonical text *before* displaying as verified; whitespace differences may be normalized, but words and values cannot be silently changed.
- Ignore AI-proposed page and offset values; determine matches independently.
- Verified quotes are visibly distinguished and clickable; fabricated/paraphrased quotes are not passed off as genuine.
- If an answer cannot be established from the document, explicitly abstain instead of inventing.
- A quote's existence and the answer's interpretation are separate checks; do not treat a genuine unrelated quote as proof.

**Acceptance:** genuine multiline quote verified; fake monetary figure rejected; repeated identical phrases preserved as multiple occurrences; wrong-document evidence rejected; unsupported answer abstains.

### A4. Large-document strategy

- Approximately 150-page contracts must work without stuffing the whole text into one AI request.
- Split/index by document structure and overlapping context, retaining source offsets and page coverage.
- Retrieve relevant portions, including clauses late in the document.
- Search absence and coverage must be described honestly; failure to retrieve is not proof of absence.

**Acceptance:** an unfamiliar 150-page fixture can be processed and searched; early and late clauses can be found; unsupported blanket absence claims are not produced.

## 5. Mandatory scope: Part B

### B5. Citation navigation and highlighting

Clicking an answer's verified quote must:
1. Open the **correct source document**.
2. Scroll to its actual passage.
3. Highlight the exact matched source text, not simply the page or heading.
4. Handle text wrapping/multiple lines, cross-page passages and repeated occurrences.
5. Keep highlights aligned after pagination/zoom/resize and support reopening saved citations.

PDF text-layer mapping and DOCX rendered-text mapping are distinct implementation challenges. If an edge case remains incomplete, disclose it rather than claiming success.

### B6. Multi-document questions

- Select multiple documents in one question.
- Return a comparative synthesis, not a stack of separate unrelated answers.
- Identify document origin for **every** citation and verify against that document specifically.
- Clarify conflicting clauses and missing evidence; do not treat all uploaded documents as one anonymous text corpus.

### B7. Two-version contract comparison

- Select two versions and compute changes at clause or paragraph granularity.
- Distinguish unchanged, added, removed, modified, moved and uncertain alignments as warranted.
- Provide a plain-language summary of **substantive** changes (e.g., liability cap AED 100,000 → AED 1,000,000, changed duties/exceptions/dates), not a character diff.
- Filter or sort by significance; explain why severity was assigned, avoid pretending it is legal advice.
- Link significant changes back to their respective originals and verify quoted source excerpts.

## 6. Part C — Chosen challenge: Option 2, agentic document research

The assignment allows either tracked-change redlining or agentic research. **Pactrieve chooses Option 2**, to reuse its source-indexing and evidence-verification architecture.

Required:
- Model chooses real tools, e.g. `search_document(query)`, `get_section(section_id)`, `list_clauses(document_id)`.
- Actual multi-round loop: results of one tool call can influence the next call.
- Display truthful live research activity tied to execution events, not a decorative spinner.
- Enforce maximum rounds and bounded outputs/cost/time.
- Validate unknown tool names, missing arguments, invalid IDs/queries; handle failures without crashing the request.
- All final quotations still undergo independent verification.
- Report honestly if this advanced feature is partial.

Option 1 real tracked-change redlining is **out of scope**. Do not implement an untracked DOCX rewrite disguised as a Part C deliverable.

## 7. Optional extras (not part of core acceptance)

Only consider after Parts A and B are working and Part C's state is honest: reversible consistent anonymisation; embeddings-based semantic search; verified-citation PDF/Word export; automatic standard-clause extraction; Arabic/RTL support; durable background processing after restart; voice question input. None may displace verification, highlighting, comparison, deployment or demo time.

## 8. Information architecture and key journeys

**Global areas:** Library; Document workspace; Compare; Recent conversations / context when appropriate. No marketing hero is required inside the product.

**Journey 1 — Upload:** Library → choose file → validate → upload → process → ready/document view or explicit failure.

**Journey 2 — Review:** Open contract → view actual document → ask → live answer → verified citation → click → highlight corresponding text.

**Journey 3 — Interrupted research:** Ask → partial stream → stop → partial text persisted → reopen same session.

**Journey 4 — Cross-contract question:** Multi-select → question → comparative answer grouped by finding with per-document citations.

**Journey 5 — Compare versions:** Pick old/new → clause alignment → significance-ranked change ledger → inspect both passages.

**Journey 6 — Agent:** Ask complex question → authentic activity log → successive searches/section reads → evidence-first answer or bounded failure/abstention.

## 9. Behavioural states and copy rules

States requiring designed UI: no documents; unsupported type; corrupted file; scanned PDF; partial extraction; processing in progress; upload timeout; indexed/ready; model unavailable; generation streaming; stopped partial; no evidence; repeated passage; deleted source; comparison awaiting two files; comparison empty/no material differences; uncertain alignment; agent tool failure; round cap reached.

Copy must be factual, concise, neutral, actionable. Never imply success while a task is running. Do not fabricate sample customer counts, legal certifications or accuracy percentages. Document wording is quoted precisely; explanatory summaries must be marked as interpretations.

## 10. Quality and acceptance criteria

**Reliability:** no false-positive verified citations; backend-led evidence matching; no fabricated completed status; persisted state across reloads.

**Security:** server-side secret management; private file storage; strict type validation; prompt-injection isolation; bounded work; use synthetic evaluator documents only on the public no-auth demo.

**Performance:** bounded memory on large documents; incremental views; no full-document prompt for 150 pages; meaningful progress; model cost limits; reasonable load and interaction latency measured on real deployment.

**Accessibility:** keyboard operability, visible focus, labelled controls, status announcements, correct semantic structure, contrast-tested palettes, reduced motion and mobile usability.

**Design:** editorial clarity + technical precision adapted to an evidence-led workspace; no generic SaaS hero or glassmorphism; the source text is primary.

**Testing:** unit tests for canonical offsets and quote matching; integration tests for DB/storage/model boundaries; E2E against the deployed application with new unfamiliar documents, stops and citation clicks.

## 11. Explicit non-goals

No authentication or multi-tenant features; no legal-advice guarantee; no contract signing; no real tracked-change redlining; no full CMS; no decorative chat demos pretending to be live; no paid feature dependencies without explicit approval; no optional bonuses before core acceptance. OCR can be deferred if scanned PDFs fail explicitly and safely; the brief does not require OCR.

## 12. Submission deliverables

1. GitHub repository link.
2. Live deployed app (Vercel, Railway, Render or Fly.io permitted).
3. README describing functionality, local startup, completed/incomplete features and screenshots for upload, verified chat, highlighting, document comparison.
4. A **3–5 minute** real screen recording showing upload, Q&A, verification, click-to-highlight, comparison, and Part C including limitations.
5. A **half-page** engineering note: verification algorithm + failure modes; 150-page strategy; chosen Part C and hardest part; what comes next.

## 13. Success definition

An evaluator can upload previously unseen contracts to the public link, recover meaningful source-verified answers, navigate to exact excerpts, compare two contract versions, inspect a real agent investigation, and understand genuine limitations. Passing on one small sample PDF is not sufficient.

## 14. Requirement-to-code traceability

Use `docs/REQUIREMENTS_MATRIX.md` as the live truth of implementation status and test evidence. This PRD records **requirements**, not a claim that each requirement has been delivered. Update matrix entries only after running relevant validation.
