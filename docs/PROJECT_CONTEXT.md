# Pactrieve: project context

**Tagline:** Every answer, traceable.

**Assignment:** Six-page SDE legal-contract web app (see `ASSIGNMENT_SOURCE.md` / SDE Assignment.pdf). Deadline: 3 days from receipt. Most important requirement: independently verified quotes with exact source navigation. Parts A and B required; Part C Option 2 selected (agentic document research).

**Governance:** `AGENTS.md` reading order. Phase gates: `docs/phases.md`. Design: `docs/Design.md` (tokens partially reflected in current CSS).

## Phase status (2026-10-08)

- **Phase 0:** Complete — foundation bootstrap + governance.
- **Phase 1:** Complete — ingestion lifecycle verified live.
- **Phase 2:** Complete (committed `437933c`) — structure-aware retrieval + coverage semantics.
- **Phase 3:** Implementation + live citation corrective patch in working tree (**uncommitted — user commits manually**). Grounded streaming chat; citation parser accepts `[eN]` and observed Groq `【eN】`; unsupported answers replace provisional streamed claims. Live Groq verification **PASS** (`answered` + ≥1 verified citation).
- **Phase 4+:** Not started. Do not auto-start.

## Current implementation

- Document upload/extract/library/delete (Phase 1).
- Structure-aware chunking + phrase-safe retrieval (Phase 2).
- **Grounded chat (Phase 3):**
  - `POST /api/documents/:id/chat` — SSE stream.
  - OpenAI-compatible provider via `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`.
  - Pipeline: validate → `retrieveDocument` → verified evidence registry (`eN`) → stream answer → resolve citations against registry + `verifyQuote`.
  - Document workspace chat UI with progressive deltas and verified citation cards.
  - Insufficient-evidence abstention from coverage statuses; no absence claims from top-k misses.
  - Session messages are in-memory UI state only — durable history / Stop persistence is Phase 4.

## Code map (Phase 3 additions)

- `src/lib/llm/*` — config, OpenAI-compatible streaming client, SSE frame parser, fake provider.
- `src/lib/chat/*` — evidence registry, prompts, citation resolution, pipeline, SSE event codec.
- `src/app/api/documents/[id]/chat/route.ts` — chat SSE endpoint.
- `src/components/DocumentChat.tsx` — streaming chat panel.
- `tests/chat.test.mts` — deterministic Phase 3 cases (fake provider).
- `scripts/phase3-live-chat.mjs` — live provider smoke (exits BLOCKED without credentials).

## Streaming event contract

SSE `event` name equals payload `type`:

| Event | Meaning |
|---|---|
| `retrieval_started` | Search begun |
| `evidence_prepared` | Verified registry + coverage + prompt size |
| `generation_started` | Provider stream begun |
| `answer_delta` | Incremental answer text |
| `citation` | Server-verified quotation metadata |
| `completed` | Terminal status (`answered` / `insufficient_evidence` / `failed`) |
| `error` | Provider/pipeline failure |

Answer prose during streaming is **provisional**. Verified citation cards are emitted only after registry + `verifyQuote` success.

## Next immediate steps

1. User reviews/commits Phase 3 when satisfied.
2. Configure `LLM_*` and run `scripts/phase3-live-chat.mjs` for live verification.
3. Phase 4 — persist conversations, Stop control, partial recovery.

## Ground rules

No API secrets in repo, no fictional test results, no trusting model-provided source locations, no automatic phase advance or agent commits for Phase 3.
