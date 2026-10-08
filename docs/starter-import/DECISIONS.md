# Engineering decisions (Oct 8, 2026)

## Objective
Build a reliable single-user legal-contract workspace for a three-day SDE assignment. Deadline: received Oct 7 at 9:42 PM IST; three days makes Oct 10 at 9:42 PM IST if exactly 72 hours, but "3 days from the day" could mean a different cutoff. Target an earlier internal completion.

## Product philosophy
The original source is authoritative, the LLM isn't. No model-suggested offsets or page numbers are accepted as verification. Verified literal source text is necessary but not sufficient to guarantee an answer's interpretation is correct.

## Choice of Part C
Option 2, agentic document research. It shares retrieval, section navigation, bounded execution and evidence verification primitives with required Parts A and B. Genuine multi-round tools and transparent activity events are required; hardcoded fake activity does not count.

## Why direct signed uploads
Browser-to-storage uploads avoid request payload ceilings in serverless hosts. The browser's token cannot grant arbitrary server database access. Post-upload process route validates magic signatures and extractability before marking ready. For larger files, replace the standard signed upload with resumable signed TUS.

## Canonical text and citation positions
PDF pages are extracted independently and joined with a single newline. Source offsets are UTF-16 JavaScript string offsets, not PDF byte offsets. This makes deterministic text evidence checking feasible. They are not reliable rendered PDF coordinates; visual highlighting requires separate PDF.js text-layer span mapping and occurrence disambiguation.

## Large document policy
Chunking code is initially overlapping character windows with offsets and Postgres full-text indexes. It is **not** yet structure-aware and the retrieval/coverage/abstention endpoint is not yet built. Next step: split at clauses and headings, use lexical search + section expansion. Absence assertions require broader search or a cautious refusal, not a top-K guess.

## Known risks
- npm install/build, Supabase live integration and deployment are not yet verified in this environment.
- Synchronous processing may time out, especially on scanned/large PDFs.
- DOCX text preview has no Word-equivalent pagination or formatting.
- Certain PDFs may require better spacing/layout reconstruction and OCR.
- Quote existence check alone cannot guarantee semantic entailment.
- Current demo lacks authentication; do not upload confidential files.

## Stop/go gates
Every milestone needs explicit failing/passing tests and manual regression of earlier features. README and demo must distinguish working, partial and missing capabilities.
