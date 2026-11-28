# Plan: Clean-machine setup audit

Status: completed
Started: 2026-11-23

## Goal

Follow README and setup docs without existing dependencies or private environment
files, record failures, and provide a verified clone-to-test/build path.

## Acceptance criteria

- Rehearse instructions in isolated tracked-file copies with fresh dependencies.
- Correct missing prerequisites, directory/env instructions and small startup bugs.
- Record original failures and verification, clearly separating hosted-service
  and mobile checks that cannot be exercised without credentials or an SDK.
- Open a pull request with passing applicable checks.

## Non-goals

Provision paid services, mutate hosted databases, deploy apps, or upgrade unrelated dependencies.

## Progress log

- Created clean tracked-file copies at baseline `ac79aed`, without `.env`,
  `node_modules`, or virtual environments. Host: Linux, Python 3.12.3,
  Node 24.22.3, npm 11.19.1 (not a freshly provisioned OS).
- Reproduced backend install/header and settings failures; verified 4,403 tests
  using CI placeholders. Verified web locked-install/lint/410 tests/build and
  admin install/lint/typecheck/241 tests/build/schema/bundle.
- Corrected root, web/API, admin, and mobile setup instructions; fixed runner
  failure handling and local IndexNow submissions, with 11 regression tests.
- Full findings, command results and limits: [setup audit](../../references/setup-audit.md).
- Hosted integrations and mobile execution are not claimed. Dependency advisory
  follow-up is recorded in the tech debt tracker.

## Verification

Fresh frontend install/lint/test/build; fresh backend install/tests; runner
regression tests; architecture/docs/Markdown checks. Detailed results are in the linked audit.
