# Pactrieve governance pack — safe integration

These files adapt the **five original cybersecurity editorial project control documents** to Pactrieve, plus a root `AGENTS.md` so Cursor can discover the rules.

## Included

- `docs/rules.md` — change authority, evidence/non-fake-functionality rules, stop conditions.
- `docs/PRD.md` — Part A/B/C Option 2 requirements and acceptance criteria.
- `docs/Architecture.md` — architecture, source maps, retrieval, chat, highlights, comparison, tools, deployment.
- `docs/Design.md` — evidence-led, editorial research-desk UI design tokens and behaviour.
- `docs/phases.md` — gated phases, commits, tests and STOP points.
- `AGENTS.md` — short Cursor instruction entry point.

## Import (Windows)

From your repo at `D:\Fun\pactrieve`:

1. Download the ZIP and **inspect it first**.
2. Extract to a temporary directory rather than blindly overwriting the repository.
3. Copy the five `.md` files into `D:\Fun\pactrieve\docs\`.
4. Copy `AGENTS.md` to the repository root, merging if one already exists.
5. Preserve your current `docs/PROJECT_CONTEXT.md`, `docs/DECISIONS.md`, `docs/ASSIGNMENT_SOURCE.md`, `docs/REQUIREMENTS_MATRIX.md`, `README.md`, code and Git history.
6. Run `git status` and `git diff --check`; review every file before committing.
7. Reconcile any disagreements with the original assignment or verified local implementation before treating the documents as adopted.

These are **specification/planning documents**; they are not proof of completed code or tests. The last known report said the local repository initially had no application source; the starter ZIP was subsequently supplied for importing. Validate the actual current repository before running phases.

Suggested docs-only commit after review:

`docs: establish Pactrieve product architecture design and phase governance`
