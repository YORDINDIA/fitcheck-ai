# Clean-checkout setup audit

Last updated: 2026-11-23

## Method and scope

Baseline: `ac79aed`. Rehearsed the README and local setup guide in isolated
tracked-file copies (`git archive HEAD`), without existing `.env` files,
`node_modules`, or backend virtual environments. This simulates a clean checkout,
not a newly installed OS. Host: Linux, Python 3.12.3, Node 24.22.3, npm 11.19.1.
No hosted database was changed and no paid services were provisioned.

## Findings and corrections

| Step / instruction | Observed failure or missing information | Correction |
| --- | --- | --- |
| README fastest start: `./run-dev.sh` | Fresh checkout has no backend virtualenv; runner exits before starting services. The shortcut omitted installation and env setup. | Put a credential-free build first; make the runner explicitly a post-setup command. |
| Prerequisite: Node 18+ | Locked Supabase and React Router require Node >=20; admin's Vite 7 requires a newer minimum still. | Recommend Node 24 LTS; explain the web minimum and optional admin requirements. |
| `pip install -r requirements.txt` | Native `pyswisseph` build failed: `fatal error: Python.h: No such file or directory`. | Document compiler, Python development headers, and venv packages. |
| Bare `pytest` from a clean backend | 155 collection errors: Pydantic settings require four Supabase variables before test fixtures run. | Document CI's dummy test-only values and the virtualenv interpreter. |
| Start API without env files | Settings validation fails for missing Supabase configuration. | Add non-overwriting template copies, development credential instructions, and distinguish unit tests from live app setup. |
| “Keys already available in root .env” | Not true for a new clone; templates are the only committed setup inputs. | Remove workspace-only assumption; retain support for existing root env files. |
| Sequential `cd backend`, then `cd frontend` | Second command resolves inside backend (and foreground servers never return). | Use repository-root subshells and separate terminals for services. |
| Migration count 60 / range 001–059 | Baseline contains 66 SQL files; hard-coded range misses newer files. | List the migration directory in sorted order; distinguish historical database rehearsal from static coverage. |
| README storage and mobile architecture | Supabase storage/GetX descriptions disagree with current R2 and Riverpod implementation. | Correct the overview. |
| Runner: backend never becomes healthy | Original script still starts frontend and prints success after polling exhaustion. | Fail and clean up; bound each curl request. |
| Runner: dependency/process failures | Missing frontend dependencies discovered after backend start; either child crash leaves the other running; SIGTERM reports success. | Preflight checks, explicit virtualenv Python, direct Vite child, strict port, exit monitoring and signal cleanup. |
| `npm run build` postbuild | With the committed IndexNow key, a local build attempts a production indexing request. Reproduced with mocked fetch, without submitting. | Submit only for Netlify production context; preserve verification files for all builds. |
| Optional admin setup | No backend setup prerequisite; stale email-domain admin bootstrap; bundle/e2e prerequisites omitted. | Link backend setup, require explicitly provisioned roles, document build-before-bundle and browser installation. |
| Android release APK in CI | PostHog Flutter 5.11.1 resolves an inclusive native range through incompatible Android SDK 4.0.0; Kotlin cannot resolve feature-flag/replay APIs. | Pin native Android SDK 3.77.1 across subprojects; verify with the release APK check. |
| Optional mobile setup (static inspection) | `.env` is a required asset but copy step was omitted; SDK/test baseline and device API address were unclear. | Add non-overwriting asset copy, CI SDK/non-golden command and emulator/LAN guidance. |
| Aggregate checks | README implies independent app commands but changes directory between them; harness requires toolchains by default. | Root-relative subshells, explicit installation prerequisites, explain opt-in partial runs. |

## Verification

- Original frontend `npm install`, lint, and tests: passed (70 files, 410 tests).
- Frontend build with the IndexNow guard: passed, including 42 prerendered routes.
- Runner: five of six initial regression cases failed against the original;
  all eight final cases pass. IndexNow: local/preview cases failed before the
  fix; all three cases pass afterward, including mocked production submission.
- `bash -n run-dev.sh`, architecture check, docs structure check and Markdown lint pass.
- Final frontend `npm ci && npm run lint && npm test && npm run build`: passed
  from the clean copy, with all 410 tests and 42 prerendered routes.
- Backend dependency installation succeeded using managed Python 3.12 with
  bundled headers after the system-Python header failure; `pip check` passed.
  CI dummy settings produced 4,403 passed / 4 skipped and 94.62% coverage.
  Uvicorn with a loopback database URL served health/Swagger; readiness was
  HTTP 200 with `schema_ready: false`. Check JSON, not only HTTP status.
- Admin clean `npm install`, lint, typecheck, tests, build, schema and bundle
  checks passed (36 files, 241 tests). Bundle check before build failed as
  expected because `dist/assets` did not exist; the docs now specify ordering.
- Mobile changes were checked against `pubspec.yaml`, CI and env-loading code
  only: Flutter/Dart were not installed in this rehearsal. No mobile execution
  or Playwright e2e run is claimed.

## Limits and follow-up

Hosted Supabase authentication, migrations, object storage, AI providers and
mobile device flows require their real development configuration; no live
end-to-end success is claimed. The working no-credential path is frontend
build/tests (plus backend tests with CI placeholders).

The initial frontend install reported 31 dependency advisories (1 low,
12 moderate, 16 high, 2 critical), plus deprecated tooling. These did not block
installation and are not resolved by this documentation patch; avoid automatic
breaking dependency upgrades as an onboarding workaround.
