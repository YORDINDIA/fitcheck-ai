# Conservative unused-code cleanup

- **Status:** completed
- **Started:** 2026-11-23
- **Owner:** engineering

## Goal
Remove only code, files, and direct dependencies whose lack of consumers can be established from repository entrypoints, imports, scripts, tests, and configuration.

## Non-goals
No behavior changes, speculative asset deletion, public API removal, or unrelated dependency upgrades.

## Acceptance criteria
- [x] Document evidence for each removal.
- [x] Run existing build, lint, and test commands and report any blockers accurately.
- [x] Review the diff and publish a pull request with removal rationale.

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
The aggregate harness requires untracked generated store creative (see verification limits below).

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

## Verification results

- Backend Ruff and full pytest: 4,403 passed, four skipped, 94.63% branch-inclusive coverage (90% gate). The first full run hit the existing 400ms image-matting timing ceiling under concurrent builds; the unchanged full suite passed on retry with lower contention. Used the CI placeholder Supabase environment, never production credentials.
- Frontend lint, 410 tests, and production build/prerender passed. The ordinary build passed; its optional IndexNow postbuild request reported HTTP 422 non-fatally. Post-removal revalidation ran the same build body plus sitemap/LLMS generation without repeating that external indexing request.
- Admin lint, typecheck, 241 tests, production build, schema drift, and bundle budget passed.
- Widget production build and 59 image-worker tests passed.
- Architecture, docs structure, markdown lint, migration, theme, iOS target, localization, and store-listing checks passed before the aggregate harness reached its store-creative gate.
- Backend API-spec regeneration is unchanged; lockfile comparison confirms 40 frontend and four admin package records removed, with no additions or changes to retained package records.
- Limitation: `scripts/check_all.sh` cannot complete in this checkout because `npm run check` in `scripts/creative` reports 756 missing generated-image errors (`checked 0 file(s)`). These approximately 1.5GB of derived assets are intentionally gitignored and unrelated to this cleanup; no check was weakened. Remaining package checks were run separately as listed above.
- Flutter SDK is absent locally; the existing PR CI runs Flutter analyze/tests and APK build. CI and admin E2E results are tracked on PR #29.

PR: <https://github.com/YORDINDIA/fitcheck-ai/pull/29>

## APK CI compatibility follow-up

The APK gate exposed an unrelated upstream version-range bug: `posthog_flutter` 5.11.1 declares native `posthog-android:[3.25.0,4.0.0]`, including the incompatible 4.0.0 release. Kotlin compilation fails on removed feature-flag and replay APIs. Pin native `posthog-android` to 3.77.1 for all Android subproject configurations, including the plugin compile classpath and app runtime. Its published sources retain the required APIs, and its POM selects core SDK 6.49.1. Dart dependencies and analytics behavior are unchanged. The existing APK build is the verification gate.
