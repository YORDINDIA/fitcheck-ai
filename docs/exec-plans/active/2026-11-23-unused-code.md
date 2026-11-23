# Conservative unused-code cleanup

- **Status:** active
- **Started:** 2026-11-23
- **Owner:** engineering

## Goal
Remove only code, files, and direct dependencies whose lack of consumers can be established from repository entrypoints, imports, scripts, tests, and configuration.

## Non-goals
No behavior changes, speculative asset deletion, public API removal, or unrelated dependency upgrades.

## Acceptance criteria
- [ ] Document evidence for each removal.
- [ ] Run existing build, lint, and test commands and report any blockers accurately.
- [ ] Review the diff and publish a pull request with removal rationale.

## Context
- [Architecture](../../../ARCHITECTURE.md)
- [Frontend](../../FRONTEND.md)
- [Backend](../../BACKEND.md)

## Progress log
- 2026-11-23: Auditing backend and web independently; checking scripts and dynamic entrypoints before choosing removals.

## Decisions log
- Favor a small proven cleanup over deleting candidates based only on a search miss.

## Verification
Existing package lint/test/build commands and repository harness checks; no coverage reductions.

## Follow-ups / debt
None yet.
