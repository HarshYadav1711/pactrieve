# Pactrieve: project context

**Tagline:** Every answer, traceable.

**Assignment:** Six-page SDE legal-contract web app (see `ASSIGNMENT_SOURCE.md` / SDE Assignment.pdf). Deadline: 3 days from receipt. Most important requirement: independently verified quotes with exact source navigation. Parts A and B required; Part C Option 2 selected (agentic document research).

**Governance:** `AGENTS.md` reading order. Phase gates: `docs/phases.md`. Design: `docs/Design.md` (tokens partially reflected in current CSS).

## Phase status (2026-10-08)

- **Phase 0–2:** Complete (committed).
- **Phase 3:** Complete (committed `1579537` + citation fix `f1c7e85`).
- **Phase 4:** Implementation complete in working tree (**uncommitted — user commits manually**). Persistent conversations, Stop cancellation, partial-answer recovery.
- **Phase 5+:** Not started. Do not auto-start.

## Current implementation

- Document upload/extract/library/delete (Phase 1).
- Structure-aware retrieval (Phase 2).
- Grounded streaming chat with verified citations (Phase 3).
- **Persistent chat lifecycle (Phase 4):**
  - Conversations + messages + citations in Supabase.
  - Durable assistant rows before generation; checkpoints during streaming.
  - Stop via `POST /api/documents/:id/messages/:messageId/stop` (`cancel_requested`) + AbortSignal to provider.
  - Terminal states: `complete` | `stopped` | `failed` | `interrupted` (plus `pending`/`streaming`).
  - Stale `streaming`/`pending` (>2 min) recovered as `interrupted` on load.
  - UI: conversation picker, New, Stop, “Stopped · Partial answer saved” after confirmed persistence.

## Phase 4 code map

- `db/migrations/20261008_phase4_chat_persistence.sql` — additive migration.
- `src/lib/chat/persist/*` — store interface, memory + Supabase, durable orchestrator.
- `src/app/api/documents/[id]/conversations/**` — list/create/load.
- `src/app/api/documents/[id]/messages/[messageId]/stop` — cancel request.
- Extended `POST .../chat` — durable streaming.
- `tests/persist.test.mts` — persistence/stop races.
- `scripts/phase4-live-chat.mjs` — live smoke.

## Durability boundary (honest)

- Text acknowledged after a successful Stop finalization is persisted.
- Checkpoints every ~400 chars or ~800 ms while streaming — a hard crash between checkpoints can lose the newest tokens after the last checkpoint.
- Browser `AbortController` alone does not save; Stop hits the DB cancel flag and the stream finalizes after flush.
- In-memory cancel maps are not used as cross-instance authority; `cancel_requested` is DB-backed.

## Next immediate steps

1. Apply `db/migrations/20261008_phase4_chat_persistence.sql` in Supabase if not already.
2. User reviews/commits Phase 4.
3. Phase 5 — PDF citation highlighting.

## Ground rules

No API secrets in repo, no fictional test results, no trusting model-provided source locations, no automatic phase advance or agent commits for Phase 4.
