# Explicit state machines: fix defects and formalize flows

Status: implemented, pending review. Date: 2026-11-20.
Spec: the external spec is not in this repo. The Goal, Workstreams, and Decisions sections below hold the decisions that matter.

## Goal

Make each implicit state machine explicit: one typed state, one transition table, and tests for illegal transitions. Fix the defects that the audit found.

## Non-goals

- Fixing the untraced flows (outfit generation, onboarding, calendar, subscription page, gift claim, OAuth bridge). These are listed under Follow-ups, pending approval.
- Changing API contracts or response shapes.
- Fixing the Node 26 `localStorage` test environment issue.

## Workstreams

| # | Flow | Where | Result |
|---|------|-------|--------|
| W1 | Batch extraction, web | `frontend/src/stores/batchExtractionMachine.ts`, `useBatchExtraction.ts` | One step type (`BatchExtractionStep`). Three transition tables (step, image, item) in one module, `batchExtractionMachine.ts`, each with a `canTransition*` check: `canTransitionStep`, `canTransitionImageStatus`, `canTransitionItemStatus`. Stale events cannot move a step or item backward. |
| W2 | Photoshoot, web + Flutter + backend | `frontend/src/stores/photoshootMachine.ts`, `flutter/.../photoshoot_machine.dart` | Same step table on both clients. A failed start stays on the generating step, where the error shows. Backend terminal guard covered by new tests. |
| W3 | Try-on, web + Flutter | `frontend/src/pages/try-on/tryOnMachine.ts`, `useStateMachine.ts`, `tryon_provider.dart` | The mirror effect that copied the store flag into local state is gone. The store flag is read once at mount and forwarded through a subscription. Flutter `generating` bool replaced by an enum status. |
| W4 | Extraction job tracker, Flutter | `extraction_jobs_transitions.dart`, `extraction_jobs_provider.dart` | Unknown saved status restores as failed, not running. Terminal jobs never revert. Cancel after completion is a no-op. |
| W5 | Social import status, web | `frontend/src/hooks/socialImportMachine.ts`, `useSocialImportQueue.ts` | One status union that matches the backend enum. A terminal job stays terminal against stale snapshots. OAuth success moves `awaiting_auth` to `processing`. |
| W7 | Social import cancel, backend | `social_import_job_store.py`, `social_import_pipeline_service.py` | `cancel_job` on a completed, failed, or cancelled job is a database-level no-op (conditional update). Artifacts are kept. |
| W8 | Batch poll merge, web | `useBatchExtraction.ts` (`overlayServerItem`) | Server status goes through the item table. A stale poll cannot move a `generated` or `failed` item back to `detected`. |

## Transition tables

### Photoshoot step (web and Flutter, identical)

| From | To | Trigger | Condition |
|------|----|---------|-----------|
| upload | configure | continue | always |
| configure | upload | back | always |
| configure | generating | start | not running |
| generating | generating | try again, or failure stays visible | not running |
| generating | results | job complete | always |
| generating | configure | back to options, or cancel | not running, or cancel |
| results | configure | new style | always |
| results | upload | start over | always |

All other pairs are rejected.

### Try-on step (web)

| Step | PICK_GARMENT | START | SUCCESS | FAIL | CANCEL | STEP_BACK | RESET |
|------|--------------|-------|---------|------|--------|-----------|-------|
| upload | options | ignored | ignored | ignored | ignored | ignored | upload |
| options | ignored | generating | ignored | ignored | ignored | upload | upload |
| generating | ignored | ignored | result | options or upload | options or upload | ignored | upload |
| result | ignored | generating | ignored | ignored | ignored | options or upload | upload |

Try-on avatar sub-machine: idle, uploading, processing, done, error.

### Try-on status (Flutter)

| From | changeGarment, changeOptions | start | succeed, fail |
|------|------------------------------|-------|---------------|
| idle | idle | generating | ignored |
| generating | ignored | ignored | idle |

### Batch extraction step

Twelve legal step moves, plus same-step replays. Defined in `batchExtractionMachine.ts`. Rejected moves are logged with `logger.warn`.

### Batch item status

`detected` moves to `generating`, `generated`, `failed`, or `deleted`. `generating` moves to `generated` or `failed`. `generated` and `failed` are terminal for extraction events. `deleted` is final.

### Social import job status

Legal edges as listed in `socialImportMachine.ts`. `completed`, `cancelled`, and `failed` are terminal.

### Extraction tracker status (Flutter)

`running` moves to `complete`, `failed`, or `cancelled`. The other three are final.

## Decisions

1. **Photoshoot failed start stays on generating.** The generating step already renders the error, Try again, and Back (web). Flutter now matches.
2. **Flutter plan limit (HTTP 429) still goes to configure** with the referral dialog. The table is the same, but the outcome differs. Open: align or keep.
3. **Unknown extraction-job status restores as failed.** A job with no readable status has no live stream, so `running` would keep it active forever.
4. **Social import cancel is a database-level filter.** The filter holds across processes. A read-then-write under the in-process lock would not.
5. **`overlayServerItem` keeps `preserveGenerating`.** For the item statuses the server returns today (`detected`, `generating`, `generated`, `failed`), the table gives the same result. Not checked against every status value the server could send. Removing it is a follow-up after that check.
6. **The store flag stays in `jobUiStore`.** The app-wide job pill reads it, so the try-on page does not own it.

## Verification (run on the final tree)

PR review fixes to this plan were applied in a follow-up commit. The results below are from the implementation commit. They were not re-run for the follow-up.


| Check | Result |
|-------|--------|
| Frontend lint (`npm run lint`) | exit 0 |
| Frontend typecheck (`npx tsc --noEmit -p tsconfig.json`) | exit 0 |
| Frontend tests (`NODE_OPTIONS=--no-experimental-webstorage npx vitest run`) | 79 files, 552 tests passed |
| Frontend build (`npm run build`) | exit 0. Its postbuild step submitted 128 URLs to IndexNow (HTTP 422). See Follow-ups. |
| Flutter analyze | no issues |
| Flutter test (`flutter test`) | all tests passed |
| Backend ruff (`ruff check .`) | all checks passed |
| Backend unit tests (`pytest -o addopts="" tests/unit`) | 2710 passed, 1 skipped |
| `scripts/check_architecture.py` | passed |
| `scripts/check_docs_structure.py` | passed |

Default `npm test` on Node 26 fails about 76 tests in 17 files with `Cannot read properties of undefined (reading 'getItem')`. This is the experimental `localStorage` global shadowing jsdom. The fix is outside this scope. Workers saw the same failures on the default Node run. I did not re-run that default run on `main` for a baseline.

Not verified: a live browser walkthrough of the web flows (cancel mid-generation, back-step, replayed event). It needs hosted Supabase and a signed-in user. The page-level tests cover these paths with mocks.

## Review pass (after validation)

Re-read the diffs and the externally changed social import files. Findings:

- Cancel on a finished social import job is a database no-op. The early return also skips `cancel_scheduled_job`. Low risk: a finished job should have no live task. Not verified against every scheduling path.
- Try-on: if another job replaces the shared pill while a try-on run is generating, the page abandons the run. The old mirror effect behaved similarly. Only matters if two jobs can run at once.
- The try-on test "a second Generate click" does not reach the guard, because the button unmounts after the first click. The machine tests cover the guard.
- Two existing photoshoot tests changed. One expectation moved from configure to generating (Flutter server-busy case). Two web usage tests now set `configure` before `generate()`, because the UI only generates from there.
- Frontend `postbuild` submitted URLs to IndexNow during this run's `npm run build`. This was not requested.

## Follow-ups (need approval)

1. **Cancel response shape.** On a terminal social import job, `POST /social-import/jobs/{job_id}/cancel` still returns `"status": "cancelled"` with HTTP 200. The DB row is unchanged. Decide whether to return the real status. <!-- UPDATE-AFTER-BACKEND-DECISION -->
2. **Retry on unreadable failed jobs.** `extraction_jobs_page.dart:147` shows Retry for failed single jobs. Not verified whether `_open` can recover a job restored from an unknown status.
3. **Untraced flows (research only, fix not yet approved).** These defects come from research. Onboarding and calendar are not fully read.
   - **Gift claim, English error-text match.** `frontend/src/pages/gifts/GiftClaimPage.tsx:141`: `message.includes('already been claimed') || message.includes('expired')` decides the state from English server text. A localized or changed message breaks the branch.
   - **Gift claim, double-claim window.** `frontend/src/pages/gifts/GiftClaimPage.tsx:124-127`: `submitClaim` checks `canClaim` from the last render, then sets `isClaiming` at line 127. Two clicks before the re-render can both pass the check. The button disables at line 313 only after the re-render.
   - **Google Play status mapping.** `backend/app/services/google_play_service.py:345-354`: `subscription_to_entitlement` sets `active` when `cancelReason` is 0, 1, or 3 (line 350) and when `paymentState` is not 0 (line 354). It sets `past_due` when `paymentState` is 0 (line 352). Grace and on-hold are not separate states here. RTDN types 5 and 6 are named at lines 51-52 but not used in this mapping. Whether grace and on-hold map to `active` is not verified against Play's payment-state values.
4. **Docs.** Add the tables above to `docs/FRONTEND.md` and `docs/FLUTTER.md`.
5. **Label and wording.** Flutter's failed-state Back button says "Back". Web says "Back to options". Needs a new l10n key.
6. **IndexNow on every build.** `frontend/package.json` `postbuild` submits URLs on each build. Decide whether to keep it.
7. **Node 26 test environment.** Fix `src/test/setup.ts` or pin the Node version.
8. **Cleanup.** Remove `MultiItemExtractionState` (no consumers) and `preserveGenerating`.
