# Pactrieve — Instructions for Cursor and Coding Agents

Before editing anything, read in order:

1. `docs/rules.md`
2. `docs/PRD.md`
3. `docs/Architecture.md`
4. `docs/Design.md`
5. `docs/phases.md`
6. `docs/PROJECT_CONTEXT.md`
7. `docs/DECISIONS.md`
8. `docs/REQUIREMENTS_MATRIX.md`
9. `docs/ASSIGNMENT_SOURCE.md`

Also consult the original six-page **SDE Assignment.pdf** when accessible. That assignment remains authoritative for the employer's requirements. Governance documents control implementation decisions only where they do not contradict the assignment.

**Conflicts:** assignment PDF > verified repository facts and explicit user direction > rules > PRD > architecture > design > phases > current prompt. Current phase instructions can narrow scope, never silently override higher authority. Stop and report real conflicts rather than guessing.

This is a single-user, evidence-first legal contract workspace. It is NOT a generic AI chatbot, marketing homepage, auth platform or tracked-change redlining implementation. Chosen challenge is **Part C Option 2: agentic document research**.

**Design north star:** Editorial clarity with technical precision, adapted to a usable contract research desk. Make document content, verified citations, comparison and honest status more prominent than decoration. Preserve established design tokens and do not introduce generic AI dashboard styling, gradients, glow, fake metrics or unrelated features. Follow `docs/Design.md` for approved UI direction; do not redesign outside an approved UI phase.

**Evidence invariant:** Never trust model-reported quotes/offsets/pages. Independently verify quotations in the correct canonical document text with whitespace-tolerant literal matching and source-derived positions. A quote match alone is not proof of the model's interpretation. Unverifiable answers abstain or are clearly marked; no hallucinated verified citations.

**Phase invariant:** One approved phase at a time. READ → VERIFY → PLAN → IMPLEMENT → TEST → REVIEW → REPORT → STOP. Do not automatically continue, push, deploy or commit if required checks failed. Limit changes to scoped files. Record actual test results, blocked integrations, security implications and known limitations. Never fabricate completion. Phase boundaries and commit gates live in `docs/phases.md`.

**Existing files:** Preserve `README.md`, `docs/PROJECT_CONTEXT.md`, `docs/DECISIONS.md`, `docs/REQUIREMENTS_MATRIX.md`, `docs/ASSIGNMENT_SOURCE.md` and Git history. Do not overwrite them with governance pack content. Reconcile carefully in documentation-only commits when needed.

**Secrets:** Never commit `.env.local`, API keys or Supabase service role keys. Only synthetic contracts may be used on public no-auth deployment.

**Stop conditions:** Assignment conflict, missing critical source files, destructive schema change, unexpected package/provider cost, compromised citation fidelity, failed required tests, unapproved architecture/design change, or scope drift.

**Phase report required:** starting Git state; implementation and files changed; tests with genuine pass/fail; behaviour verified; requirements matrix updates; limitations; commit hash or no-commit reason; STOP.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
