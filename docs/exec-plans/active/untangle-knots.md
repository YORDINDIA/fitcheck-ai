# Plan: untangle the knots

Status: active  
Started: 2026-11-20  
Owner: agent / human

## Goal

Remove the 14 worst couplings found in the wiring diagram. Land each knot as its own local commit on `refactor/untangle-knots`. That branch starts from `feat/explicit-state-machines` at `8ddf190`. Each commit must pass the checks for the apps it touches. A knot that fails is rolled back and logged in the progress log. Nothing is pushed or merged.

Knots run worst first. The order is fixed in the table below.

## Non-goals

- Broad `except Exception` handling in services (about 80 sites).
- Shared base type for job-status enums (second half of TD-021).
- Profile trigger in migrations 002 and 008.
- `setInterval` hooks and `LONG_RUNNING_PREFIXES`.
- Running migration 066 on hosted Supabase. The owner applies it.
- Flutter `ai_extraction_widget.dart` and `item_add_provider.dart`. They belong to a later UI phase.

## Acceptance criteria

- [ ] Knots 1 to 14 each have a commit on the branch, or a logged rollback.
- [ ] Knot 6 has two commits. Commit B ships only after the new app build is live.
- [ ] Knot 4 has one commit per route file, heaviest first. The `.table(` architecture rule comes last.
- [ ] Each commit passes the checks for the apps it touches.
- [ ] `output/untangle/wiring-after.html` and `output/untangle/before-after.png` exist. Both stay local.
- [ ] Nothing is pushed or merged.

## Knots

| # | Knot | Group | Debt | Commit |
|---|------|-------|------|--------|
| 1 | Plan limits copied into three apps | A | TD-032 | |
| 2 | Outfit generation state in two channels | A | TD-049 | |
| 3 | Profile fields copied twice | A | | |
| 4 | Routes run database queries directly | A | TD-013, TD-107, TD-112 | |
| 5 | Storage key shim kept as a workaround | A | | |
| 6 | `complete` vs `completed` photoshoot status | B | TD-021 (first half) | |
| 7 | Admin page titles in placeholder namespace | B | TD-079 | |
| 8 | 114 identical Flutter DioException blocks | B | TD-113 | |
| 9 | Dead `batchCreateItems` | B | TD-092 | |
| 10 | Dead Flutter status method | B | TD-025 | |
| 11 | Auth builds its own subscription repository | C | | |
| 12 | Empty `getApiError` wrapper | C | | |
| 13 | Dead UI files | C | TD-098 | |
| 14 | Legacy settings tab names | C | | |

## Context and links

- Wiring diagram (before): `output/untangle/wiring-before.html`. Generated, local only, gitignored.
- Plan policy: `docs/PLANS.md`. Debt list: `docs/exec-plans/tech-debt-tracker.md`.
- Architecture rules: `ARCHITECTURE.md`, `scripts/check_architecture.py`.

## Progress log

| Date | Note |
|------|------|
| 2026-11-20 | Wiring diagram built. Fits one screen at 1440x900. Every knot panel lists file, line, and method. |
| 2026-11-20 | Baseline run on `8ddf190`. Results below. |
| 2026-11-20 | Branch `refactor/untangle-knots` created from `8ddf190`. |
| 2026-11-20 | Knot 1 (plan limits) done. Backend 4416 passed, 4 skipped. Vitest 80 files, 555 tests. Frontend build pass. Flutter analyze clean; test 654 passed, 2 skipped. Commit: `refactor: serve plan limits from /plans`. |

## Decision log

| Date | Decision | Why |
|------|----------|-----|
| 2026-11-20 | Base branch is `feat/explicit-state-machines` at `8ddf190`. | Owner decision. Other branches are not touched. |
| 2026-11-20 | Legacy settings tab names are removed. Unknown `?tab=` values open `account`. | Owner decision. Outside links to the Plan tab now open Account. |
| 2026-11-20 | Photoshoot status becomes `completed` everywhere, in two commits. Clients accept both values first. | Owner decision. Old app builds keep working until the new build ships. |
| 2026-11-20 | Storage key shims are deleted. No flag keeps them. | Owner decision. Legacy rows stop resolving. Run `backend/scripts/storage_inventory.py` before merge. |
| 2026-11-20 | Frontend and admin checks run on Node 20.20.2. | CI pins Node 20. Node 26 exposes an experimental `localStorage` global that is undefined, so jsdom suites fail. |
| 2026-11-20 | Backend tests run as `backend/.venv/bin/python -m pytest`. | The venv `pytest` script has a stale shebang from another checkout path. The venv itself works. |
| 2026-11-20 | Flutter `analyze`, `test`, and `build_runner` run with the local SDK (3.47.4). | Owner approved. SDK writes stay in the SDK cache. |
| 2026-11-20 | Prerendered marketing pages keep the constants in `plan-limits.ts`. `docs/generated/plan-limits.json` is checked by a backend test and a vitest test. | Prerender runs at build time and cannot call `/plans`. The snapshot makes drift fail a test. |

## Verification

```bash
# backend (cd backend)
.venv/bin/ruff check .
.venv/bin/python -m pytest

# repo root
python3 scripts/check_architecture.py
python3 scripts/check_docs_structure.py

# frontend (cd frontend, Node 20)
npm run lint
npx vitest run
npx tsc && npx vite build && node scripts/prerender-meta.mjs && node scripts/prerender-html.mjs

# admin (cd admin, Node 20)
npm run lint && npm run typecheck && npm test && npm run check:schema && npm run build

# flutter (cd flutter)
flutter analyze
flutter test
```

The frontend `prebuild` and `postbuild` scripts are skipped. The first rewrites `public/sitemap.xml`. The second posts to IndexNow.

### Baseline on `8ddf190`

Lanes ran in parallel, so times are rough.

| Check | Result | Time |
|-------|--------|------|
| backend `ruff check .` | pass | 0 s |
| backend `pytest` | 4414 passed, 4 skipped, coverage 94.62% (gate 90%) | 89 s |
| `check_architecture.py` | pass | 1 s |
| `check_docs_structure.py` | pass | 0 s |
| frontend `npm run lint` | pass | 3 s |
| frontend `npx vitest run` | 79 files, 552 tests pass | 12 s |
| frontend build | pass, 42 routes prerendered | 17 s |
| admin `npm run lint` | pass | 19 s |
| admin `npm run typecheck` | pass | 6 s |
| admin `npm test` | 36 files, 241 tests pass | 34 s |
| admin `npm run check:schema` | pass | 1 s |
| admin `npm run build` | pass, chunk size warning (existing) | 7 s |
| flutter `analyze` | no issues | 15 s |
| flutter `test` | 654 passed, 2 skipped | 46 s |

Node 26 was the first runtime tried. It failed the frontend suite (74 tests in 16 files) and the admin suite (241 tests in 36 files), with `Cannot read properties of undefined (reading 'getItem')`. The logs are in `output/untangle/baseline/` (local).

## Deferred debt

- The non-goals above. Add them to `tech-debt-tracker.md` when this plan closes.
