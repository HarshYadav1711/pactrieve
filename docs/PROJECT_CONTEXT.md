# Pactrieve: project context

**Tagline:** Every answer, traceable.

**Assignment:** Six-page SDE legal-contract web app (see `ASSIGNMENT_SOURCE.md` / SDE Assignment.pdf). Deadline: 3 days from receipt. Most important requirement: independently verified quotes with exact source navigation. Parts A and B required; Part C Option 2 selected (agentic document research).

**Governance:** `AGENTS.md` reading order. Phase gates: `docs/phases.md`. Design: `docs/Design.md` (tokens partially reflected in current CSS).

## Phase status (2026-10-09)

- **Phase 0–8:** Complete (committed through `f559ae7`).
- **Phase 9:** Complete (committed `025fd88`). Substantive significance + severity filter/sort.
- **Phase 10:** Implementation complete in working tree (**uncommitted — user commits manually**). Bounded agentic document research with model-selected tools, SSE activity, verified citations. Not Word redlining / Phase 11.
- **Phase 11+:** Not started. Do not auto-start.

## Current implementation

- Phases 1–9 as previously documented.
- **Agent Research (Phase 10):**
  - Tools: `search_documents`, `inspect_passage`, `list_document_sections` (Zod-validated, document-scoped).
  - Server orchestrator with round/tool/time/identical-call limits.
  - OpenAI-compatible `chatWithTools` + streamed final answer.
  - Observable SSE activity (real tool events only).
  - Persistence via existing conversation tables; Stop via DB-authoritative cancel.
  - UI: `/agent?docs=` · library CTA **Agent Research**.

## Phase 10 code map

- `src/lib/agent/*` — tools, dispatch, evidence, orchestrate, durable, events
- `src/lib/llm/types.ts` + `openai-compatible.ts` `chatWithTools`; `agent-fake.ts`
- `src/app/api/agent/research`, `conversations`
- `src/app/agent/page.tsx`, `AgentResearchChat.tsx`
- `tests/agent.test.mts`, `scripts/phase10-live-agent.mjs`

## Next immediate steps

1. User reviews/commits Phase 10.
2. Phase 11 — adversarial / accessibility / UX review (only after explicit approval).

## Ground rules

No API secrets in repo, no fictional test results, no trusting model-provided source locations, no automatic phase advance or agent commits.
