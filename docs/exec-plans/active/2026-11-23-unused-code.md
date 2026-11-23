# Conservative unused-code cleanup

- **Status:** active
- **Started:** 2026-11-23
- **Owner:** engineering

## Goal
Remove only code, files, and direct dependencies whose lack of consumers can be established from repository entrypoints, imports, scripts, tests, and configuration.

## Non-goals
No behavior changes, speculative asset deletion, public API removal, or unrelated dependency upgrades.

## Acceptance criteria
- [x] Document evidence for each removal.
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

## Removal evidence

- Frontend `src/components/ui/{checkbox,pagination,table}.tsx` and `src/types/blog.ts`: no incoming imports/re-exports in application, tests, or build entrypoints, including literal dynamic imports. No glob-based module loading exists. Blog consumers use `src/types/index.ts` instead.
- Admin `src/shared/ui/{FeatureErrorBoundary,separator}.tsx`: no importing modules or runtime registration. The app uses the shared `ErrorBoundary` directly.
- Frontend `@hookform/resolvers`, `react-hook-form`, and `@types/d3`: no source, tooling, or configuration consumers. `@radix-ui/react-checkbox` served only the deleted wrapper.
- Admin `date-fns-tz` and `openapi-fetch`: no source/tooling consumers; formatting uses `date-fns` and the API client uses native fetch. `@radix-ui/react-separator` served only the deleted wrapper. Corrected the stale API-client descriptions.
- Backend `passlib[bcrypt]` and `beautifulsoup4`: no imports in application, tests, or scripts. Password authentication delegates to Supabase; social import parsing uses HTTPX and standard-library/regex helpers.
- Backend `revoke_all_for_user`: no call sites or registration decorators. The actual OAuth revocation route calls `revoke_refresh_token`, which remains unchanged.
- npm lockfiles only prune removed direct dependencies and their orphaned dependency entries; no upgrades intended.

## Preserved candidates
Public assets, operational scripts, framework callbacks, indirect configuration dependencies such as `python-dotenv`, mobile icon fonts, and advertised API error types were retained where absence of ordinary imports did not establish safe removal.
