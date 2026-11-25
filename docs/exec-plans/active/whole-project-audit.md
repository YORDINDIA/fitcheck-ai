# Plan: whole-project audit and logged-out visual pass

Status: active  
Started: 2026-11-23  
Owner: agent runs the audit. The owner decides the items on the owner list.

## Goal

Read the whole FitCheck AI repository. Find what is broken, inconsistent, inefficient, or no longer needed. Open the logged-out web pages and the admin sign-in in Chrome, and rank the top five hierarchy and density problems. Fix the items that are sure, and list the rest for owner review.

## Non-goals

- No sign-in, no test accounts, no writes to hosted services, no email, and no paid AI calls.
- No Docker removal, no Flutter web removal, no asset deletion, no migrations, no product behavior change, and no hierarchy or density redesign.
- No push and no merge. The untangle merge waits on the TD-146 owner decision.

## Acceptance criteria

- [x] P0: cleanup, venv launchers, and baseline lanes recorded below.
- [x] P1: static audit of every area. Skipped and sampled files listed below. Findings consolidated below.
- [x] P2 and P3: 161 web jobs screenshotted or failure recorded. 149 at 1440x900 cover all 128 sitemap URLs plus protected and unknown routes. 12 at 390x844. Admin root and sign-in at two sizes. 95 goldens reviewed. `flutter test --tags golden`: 87 passed, 1 skipped, 0 failed.
- [x] P4: top five hierarchy and density problems ranked below.
- [ ] P5: sure fixes committed in small commits. Lanes green after each commit.
- [ ] P6: `scripts/check_all.sh` run on the final head. Owner list written.

## Context

- Spec: `/Users/sakshammittal/.factory/specs/2026-11-23-whole-project-audit-and-logged-out-visual-pass.md`
- Branch: `refactor/untangle-knots`. Audit start point: `27a799d2`. Owner decision: commit here, no new branch.
- Generated output goes to `output/audit/` (screenshots, contact sheets, logs, local tools). That folder is git-ignored from commit (b).
- Owner answers on 2026-11-24: commit the whole `.gitignore`. Untrack `.claude/settings.local.json` and keep it on disk.

## Progress log

| Date | Note |
|------|------|
| 2026-11-23 | Spec approved. Disk had 2.0 GiB free. Owner approved deleting regenerable `flutter/build` output. |
| 2026-11-23 | Checkout was on `main`. Owner chose `refactor/untangle-knots`. Switched at `27a799d`. |
| 2026-11-23 | Deleted regenerable `flutter/build` output. Free space went from 2.0 GiB to 17.1 GiB. Log: `output/audit/p0-cleanup.log`. |
| 2026-11-23 | Reinstalled uvicorn 0.51.0 and pytest 9.1.1 in `backend/.venv`. Both launchers run. |
| 2026-11-24 | Baseline run 1: 28 lanes. 23 pass. 5 fail for environment reasons. |
| 2026-11-24 | Rerun on Node 20.20.2 (CI version), with Chromium installed and `flutter pub get` run: 15 of 15 lanes pass. |
| 2026-11-24 | Re-capture of 161 web jobs on the local API: 161 OK, 0 errors. Zero calls to `api.fitcheckaiapp.com`. Blog pages render an h1. Only `/auth/callback` has no h1. |
| 2026-11-24 | macOS denied access to the repo folder (EPERM) for part of the session. The owner restored access. The previews returned HTTP 500 during the block and HTTP 200 after it. No repo writes happened during the block. |
| 2026-11-24 | Admin capture: 4 of 4 OK. Golden review finished. `add_manual_light.png` checked at full size: the sticky bar clips the last colour row, which is normal scrolling. |
| 2026-11-24 | P3 review written: `output/audit/screens/web/review.md`. P4 ranking written below. P1 findings consolidated below. |
| 2026-11-24 | Owner answers: commit the whole `.gitignore`. Untrack `.claude/settings.local.json`. |

## Decision log

| Date | Decision | Why |
|------|----------|-----|
| 2026-11-23 | Commit audit work on `refactor/untangle-knots`. | Owner decision 1. |
| 2026-11-23 | Keep top-level `flutter/build/shorebird` too. | It is not on the owner's list. It is 1 MB, so keeping it deletes less. |
| 2026-11-24 | Skip frontend prebuild and postbuild in the baseline. | Prebuild rewrites the tracked sitemap. Postbuild pings IndexNow, and the key file exists. `INDEXNOW_KEY` cannot disable the ping. |
| 2026-11-24 | Run the baseline on Node 20.20.2. | CI uses Node 20. Node 26 breaks jsdom `localStorage`: 75 web tests and 261 admin tests fail. |
| 2026-11-24 | Use 12 explorers in P1, not 7. | About 3,000 code files. Seven readers could not read every file. The same rules apply. |
| 2026-11-24 | Commit the whole `.gitignore`, including the three `trajector-doctor-*` and `.claude` lines that were uncommitted before this audit. | Owner answer. |
| 2026-11-24 | Untrack `.claude/settings.local.json` and keep it on disk. Its 78 uncommitted lines stay on disk only. | Owner answer and owner decision 7. The committed copy has no lines that match common credential patterns. |
| 2026-11-24 | Ignore only `.claude/settings.local.json*`, not all of `.claude/`. | The owner's approved scope is this one file. Other `.claude` files stay trackable. Recheck at commit (d). |
| 2026-11-24 | Rank tap targets against 44 px. | Apple HIG and WCAG 2.5.5 use 44 px. WCAG 2.2 AA needs 24 px. The 24 px count was not measured. |
| 2026-11-24 | The golden clip at the sticky "Save piece" bar is not a defect. | Normal scroll behavior in a golden frame. |

## Baseline (P0)

Run 1 used Node 26.13.0 and no Flutter package repair. The rerun used Node 20.20.2 and repaired the environment. No code changed in either run.

| Lane | Run 1 | Rerun (Node 20) | Note |
|------|-------|-----------------|------|
| architecture, docs-structure, markdown-lint, migrations, theme-tokens, ios-deployment, locale-coverage, rtl-layout, locale-scripts, app-store-listing, localization-claims | pass | not rerun | Python and Node scripts, no Node version dependency |
| store-creative | pass (45 s) | not rerun | |
| backend-ruff | pass | not rerun | |
| backend-pytest | pass | not rerun | 4461 passed, 4 skipped, 94.71% coverage, 66 s |
| web-lint | pass | pass | |
| web-vitest | fail: 75 of 562 | pass: 562 of 562 | Node 26 `localStorage` |
| web-build-no-ping | pass | pass | 42 routes prerendered |
| images-worker | pass | not rerun | |
| admin-lint, admin-typecheck | pass | pass | |
| admin-test | fail: 261 of 261 | pass: 261 of 261 | Node 26 `localStorage` |
| admin-check-schema, admin-build, admin-check-bundle | pass | pass | |
| admin-e2e | fail: 14 of 14 | pass: 14 of 14 | Chromium for Playwright was not installed |
| flutter-gen-l10n | pass | pass | |
| flutter-analyze | fail: 7,576 issues | pass: no issues | pub cache lacked `flutter_riverpod` and `go_router` |
| flutter-test | fail: 69 files fail to load | pass: +575 ~1 | `--exclude-tags golden`, same cause |

Notes:

- The Flutter tool rewrote five tracked plugin files during run 1. After `flutter pub get`, they matched HEAD. Nothing needed restoring.
- Local Flutter is 3.47.4. CI pins 3.47.5. The golden run passed on 3.47.4. CI on 3.47.5 has not been checked.
- An earlier note recorded 662 Flutter tests passing with 2 skipped. The CI command gives +575 ~1 with goldens excluded. The earlier figure came from a different command and is not reproduced here.

Baseline logs: `output/audit/baseline/` (run 1) and `output/audit/baseline/rerun/` (rerun). Both folders are git-ignored after commit (b).

## Top five hierarchy and density problems (P4)

Ranked by pages affected times severity. Problems that repeat across templates rank above one-off problems.

1. **Tap targets under 44 px in the shared header and footer.** The header logo link is 128x34 px. The header "Start free" button is 102x40 px (120x40 px on mobile). Footer links are small. 148 of 149 desktop pages and 12 of 12 mobile pages have at least one. Median: 32 per desktop page, 30 per mobile page.
2. **Home page is very long.** 11,197 px on desktop, 12,819 px on mobile. Eleven H2 sections. Pricing starts near 6,800 px. The next longest page is `/blog` at 6,156 px.
3. **Home demo labels at 11.2 px.** Twelve elements, desktop only. The same content renders on three routes: home, `/gamification`, and an unknown path.
4. **Shared-outfit not-found state shows one error twice.** An in-page card and a toast both say the outfit was not found.
5. **`/auth/callback` has no heading.** Red status text sits on a blank page while the page redirects.

Sources: `output/audit/screens/web/results.json` (metrics) and `output/audit/screens/web/review.md` (notes and full-size review). Owner note: items 1 and 2 change layout. Hierarchy and density redesign is out of scope, so all five go to the owner list.

## P1 findings (consolidated)

Type: Broken, Inconsistent, Inefficient, Unneeded, or Hierarchy/density.  
Confidence: High = reproduced or counted by command. Medium = one check, or reported without reproduction. Low = reported, not verified.  
Plan: P5a, P5c, P5e, P5f, or P5h = planned fix commit. Debt or TD-nnn = row in `tech-debt-tracker.md`. Owner = owner review list.

### Backend, MCP, and tests

| ID | Type | Finding and evidence | Confidence | Plan |
|----|------|----------------------|------------|------|
| B-01 | Broken | Launchers call `backend/.venv/bin/uvicorn` and `bin/pytest`. Before the P0 reinstall both pointed at a missing folder. `run-dev.sh:65`, `scripts/check_all.sh:133-139`. | High, reproduced | P5a: `"$VENV/bin/python" -m uvicorn` and `-m pytest` |
| B-02 | Unneeded | `passlib[bcrypt]==1.7.4` in `backend/requirements.txt:8`. No importers. | High, grep | P5e |
| B-03 | Unneeded | `beautifulsoup4` in `backend/requirements.txt`. No `bs4` imports. | High, grep | P5e |
| B-04 | Broken | MCP path parameters are inserted without escaping: `backend/app/mcp/executor.py:61`. Reproduced: `x/../../auth/login` reaches another route. | High, reproduced | P5h. Behavior change for values with `/`, `?`, `#`, or spaces |
| B-05 | Inconsistent | `WIDGET_MIME_TYPE` in `backend/app/mcp/server.py:132` duplicates `WIDGET_MIME` in `backend/app/mcp/widgets.py:28`. | High | P5e if the duplicate is unused, else dedupe |
| B-06 | Unneeded | Obsolete. `_SUPPORTED_PLATFORMS` does not exist (grep, 2026-11-25). The open SIMPLIFY B7 question is TD-149. | Medium | TD-149 |
| B-07 | Broken | Three invalid escape sequences (SyntaxWarning) in `backend/tests/integration/test_items_routes_coverage.py:2562, 2599, 2629`. | High, compile with warnings | P5h: raw strings |
| B-08 | Unneeded | `verify_access_token` (`backend/app/services/mcp_oauth_service.py:189`) and `revoke_all_for_user` (`:454`) have no callers. | Medium | Owner |
| B-09 | Unneeded | `_b64url_encode` (`backend/app/services/apple_iap_service.py:95`) is used only by its own test. | Medium | Owner |
| B-10 | Unneeded | 23 model definitions in `backend/app/models/*` have no users. `backend/app/core/exceptions.py:457` is unused. | Medium | Owner |
| B-11 | Inefficient | `social_scraper_service`: 4 broad `except Exception` blocks and 29 "exhausted" messages (SIMPLIFY B1). | Medium | TD-147 |
| B-12 | Inefficient | 58 `sleep(` calls in 23 backend test files, down from 85. The two async files SIMPLIFY B2 named no longer have any. | High, count | TD-148 |
| B-13 | Inconsistent | `_now()` is duplicated in `backend/app/services/item_service.py:28` and `user_service.py:29`. Both only call `utcnow_iso()`. | High | P5e: call `utcnow_iso()` directly, delete both copies |
| B-14 | Inconsistent | `pytest` and `ruff` ship in the production requirements. | High | Owner: split dev requirements |
| B-15 | Inconsistent | `backend/Dockerfile` creates `/app/logs`. The README says logs go to stdout. | Medium | Owner |
| B-16 | Inefficient | No `backend/.dockerignore`. `COPY . .` would copy `.venv` (327 MB) and tests (13 MB). | High, sizes measured | Owner |
| B-17 | Inconsistent | `scripts/check_migrations.py` POLICY_RE misses unquoted policy names (migrations 016 and 023). | Medium | Owner |
| B-18 | Broken | One of 8 SECURITY DEFINER functions lacks `search_path` and REVOKE. The other 7 have both. Not identified yet. Migrations were checked by structure, not line by line. | Medium, count only | Owner. Identify the function in P6 |
| B-19 | Inconsistent | `backend/README.md:56` lists 19 routers. 25 exist. | High | P5f |
| B-20 | Inconsistent | The admin revenue trends export plan (`docs/exec-plans/active/2026-08-07-admin-revenue-trends-export.md`, line 63) cites `040_admin_dashboard_rpcs.sql`. The real file is `040_admin_dashboard_top_users.sql`. | High | P5f |
| B-21 | Inconsistent | `docs/generated/db-schema.md` (lines 237-238) repeats one line. The generator produces it. | High | P5f, fix in the generator |
| B-22 | Inconsistent | Migration prefix 002 is used twice. Documented. | High | Owner note |

Verified clean: ruff F401, F811, and F841 are clean for `app`, `db`, and `scripts`. All 51 tables have RLS enabled. There are 150 policies.

### Web (`frontend/`)

| ID | Type | Finding and evidence | Confidence | Plan |
|----|------|----------------------|------------|------|
| W-01 | Unneeded | `icon-sm` button variant in `frontend/src/components/ui/button.tsx:49`. No uses. | High, grep | P5e |
| W-02 | Unneeded | Aliases `@/agents` and `@/assets` in `frontend/vite.config.ts:23-24` and `frontend/tsconfig.json:37-38`. The directories are absent. | High | P5e |
| W-03 | Unneeded | `isAuthenticated()` in `frontend/src/lib/auth.ts:84`, `api/auth.ts:126`, and `api/client.ts:128`. No bare-function callers. | High, grep | P5e |
| W-04 | Unneeded | `storeUser` and `clearUser` in `frontend/src/lib/auth.ts:103,111`. No callers. | High, grep | P5e |
| W-05 | Unneeded | `frontend/src/lib/utils.ts`: `calculateCostPerWear` (line 44), `debounce` (60), `generateId` (82), `sleep` (89). Keep the `sleep` copies in `client.ts:248`, `retry.ts:118`, and `photoshootStore.ts:36`. | High, grep | P5e for the unused helpers |
| W-06 | Broken | Import cycle. `frontend/src/lib/endpoints.ts:142` re-exports `UPLOAD_TIMEOUT_MS` from `@/api/client`. `api/outfits.ts:7` imports it through endpoints. `client.ts:19` imports endpoints. | High, reproduced by grep | P5h |
| W-07 | Inconsistent | `formatDate` in `frontend/src/i18n/runtime.ts:94` and `frontend/src/lib/utils.ts:26`. The `utils` copy only forwards to `runtime`, and two blog pages import it. | Medium | P5e: import from `@/i18n`, delete the wrapper |
| W-08 | Inconsistent | `frontend/nginx.conf:37,60` say "(for docker-compose)". Compose uses `Dockerfile.dev`. | High | P5f |
| W-09 | Inconsistent | `frontend/Dockerfile:5` and `Dockerfile.dev:2` use `node:18-alpine`. CI uses Node 20. | High | Owner |
| W-10 | Inconsistent | Crawler lists differ between the `og-tags` and `seo-html` edge functions. `/gift/` is missing from the not-found KNOWN_PREFIXES. `isCrawler` and `escapeHtml` are duplicated. | Medium | Owner |
| W-11 | Broken | Unknown paths and `/gamification` return HTTP 200 and show the home page. This is a soft 404. | High, observed in run 2 | Owner |
| W-12 | Inconsistent | `netlify.toml:191` forces the woff2 Content-Type on `/fonts/*`, including a license `.txt`. | Medium | Owner |
| W-13 | Inconsistent | `outfitStore` still imports `skipToast` from `../api/client` (SIMPLIFY F3, partly done). | High, grep | TD-150 |
| W-14 | Inconsistent | SIMPLIFY F7 `usePolling` was never added. Timers remain in `useSocialImportQueue.ts:313` and `useBatchSSE.ts:183`, so the item still applies. | Medium, grep | TD-151 |

### Admin (`admin/`)

| ID | Type | Finding and evidence | Confidence | Plan |
|----|------|----------------------|------------|------|
| A-01 | Unneeded | `isDev` and `isProd` in `admin/src/config/env.ts:62-63`. No uses. | High, grep | P5e |
| A-02 | Unneeded | `groupHasResults` in `admin/src/features/search/lib/results.ts:38`. No uses. | High, grep | P5e |
| A-03 | Inconsistent | `admin/eslint.config.js` featureDirs (lines 23-36) omit `gifts`. | High | P5e if lint stays green, else Owner |
| A-04 | Inconsistent | README test counts (33 Vitest, 6 and 7 e2e) do not match 37 test files and 9 to 11 e2e specs. | Medium | P5f after counting |
| A-05 | Inconsistent | README RBAC table omits `subscriptions.write` and `quotas.write`. | Medium | P5f after checking the code |
| A-06 | Broken | `admin/netlify.toml:40` CSP `connect-src` lacks the Sentry ingest host. | Medium, unverified | Owner |
| A-07 | Unneeded | `admin/src/config/feature-flags.ts` refund and storage-cleanup flags. Use not verified. | Low | Owner |
| A-08 | Hierarchy/density | 23 uses of `text-[9px]`, `text-[10px]`, and `text-[11px]`. About 19 English literals sit outside `t()`. | High, grep | Owner |

### Flutter (`flutter/`)

| ID | Type | Finding and evidence | Confidence | Plan |
|----|------|----------------------|------------|------|
| F-01 | Unneeded | `cupertino_icons` in `flutter/pubspec.yaml:62`. No imports. | High, grep | P5e |
| F-02 | Unneeded | `flutter_appauth` placeholder in `flutter/android/app/build.gradle.kts:40` and `flutter/android/app/src/main/AndroidManifest.xml:38`. The package is not in pubspec. | High, grep (lock check in P5e) | P5e |
| F-03 | Unneeded | `flutter/lib/core/utils/locale_format.dart` has no importers. `docs/FLUTTER.md` (line 281) says it is used. | High, grep | Owner |
| F-04 | Unneeded | `flutter/lib/features/feedback/index.dart` barrel has no importers. | High, grep | Owner |
| F-05 | Unneeded | `flutter/lib/features/subscription/views/subscription_page.dart:9` imports `models/subscription_model.dart`. Many names are unreferenced by grep. | Medium | P5e only if the analyzer reports an unused import |
| F-06 | Inconsistent | `auth` imports the subscription providers in `auth/providers/auth_provider.dart:14` and `auth/views/register_page.dart:12` (SIMPLIFY FL4). `user_initialization_service.dart` imports only core code. | Medium | TD-152 |
| F-07 | Broken | `flutter/lib/features/feedback/data/feedback_repository.dart:38,87,94` calls `Platform.isIOS` without a `kIsWeb` guard. | Medium | Owner |
| F-08 | Inconsistent | 205 `?? 'English'` fallbacks across 28 files. | High, count | Owner |
| F-09 | Inconsistent | Widget literals not from ARB: wardrobe 19, core widgets 19, subscription 4, calendar 4, auth 2, gifts 1. Non-widget English: wardrobe 106, subscription 63, settings 31. | High, count | Owner |
| F-10 | Inconsistent | Mixed logging: `print(` at `sse_service.dart:212,65`, `image_utils.dart:50,83,124`, `batch_extraction_repository.dart:109`. 36 `debugPrint` calls, 24 unguarded. | High, count | Owner |
| F-11 | Unneeded | 24 providers have zero readers in `lib/`. | Medium | Owner |
| F-12 | Unneeded | `flutter/assets/images/auth_background.jpg` (97 KB) is unreferenced. | High, grep | Owner |
| F-13 | Inconsistent | `flutter/test/visual/auth_screens_golden_test.dart:44` skips `splash_light` with no reason. | High | Owner |
| F-14 | Broken | Release signing falls back to the debug key: `flutter/android/app/build.gradle.kts:56-59`. | High, read | Owner. Release risk, high priority |
| F-15 | Inconsistent | Smaller items: macOS entitlements lack Sign in with Apple. `flutter/web/**` has 7 files. Windows `generated_plugins.cmake` may be stale. Template `RunnerTests.swift` asserts nothing. `dashboard_provider_test.dart:68` has a race. | Low | Owner |
| F-16 | Obsolete | `secure_local_storage.dart:37` is the one-time migration of the legacy session key, so it stays. SIMPLIFY FL2 is otherwise done: other reads go through `PersistenceService`. | High, grep | None (done) |
| F-17 | Unneeded | The auth controller moved to `auth/providers/auth_provider.dart` (422 lines). SIMPLIFY FL7 measured 496. | Low | TD-154 |
| F-18 | Inconsistent | Three silent `catch (_) {}` blocks: `core/services/network_service.dart:32`, `core/network/api_interceptors.dart:100`, `features/onboarding/intro_seen_provider.dart:28` (SIMPLIFY FL6). The dashboard catch blocks it named are gone. | Low | TD-153 |

### Docs, scripts, infra, assets, and store

| ID | Type | Finding and evidence | Confidence | Plan |
|----|------|----------------------|------------|------|
| R-01 | Inconsistent | `README.md:10` says "Flutter mobile app (GetX)". The app uses Riverpod and go_router. | High | P5f |
| R-02 | Inconsistent | `docs/exec-plans/tech-debt-tracker.md` has stale references: TD-034 (`dashboard_controller.dart`), TD-064 (`migrate_storage_to_r2.py`), TD-095 (`tryon_content.dart`). | High, files absent | P5c for the references. Owner for the status |
| R-03 | Inconsistent | Eight plans marked done sit in `docs/exec-plans/active/`. | High | Owner |
| R-04 | Unneeded | `scripts/i18n/translate_arb.py:452` has an unused variable `path` (F841). | High, ruff | P5e |
| R-05 | Inconsistent | `scripts/check_web_locales.py` is not in CI (TD-136). Duplicate logic: `check_locales` and `check_web_locales`, `translate_arb` and `translate_web`, blog publish and verify. | High | Owner |
| R-06 | Unneeded | `scripts/apply_script_fixes.py` and `scripts/fix_arb_locales.py` have no references. `plan.mjs:139` points to a missing `scripts/growth`. | Medium | Owner |
| R-07 | Inefficient | `scripts/asc/asc.mjs:185` and `scripts/creative/fonts.mjs:66,71` fetch without a timeout. | High, grep | TD-156 |
| R-08 | Broken | `infra/images-worker/worker.js:11-12,25-30` can return 404 for legacy-key requests. | Medium | Owner |
| R-09 | Inconsistent | `widgets/vite.config.ts:23` sets `emptyOutDir` only for `listWidgets()[0]`, which follows `readdirSync` order. Latent: it deletes earlier outputs if that pass does not run first. | Low | TD-157 |
| R-10 | Unneeded | `videos/fitcheck-ai-explainer/compositions/frames/04-snap-catalog.html:4-14` and `12-start-free.html` map distinct font weights to the same file. | Medium | Owner |
| R-11 | Broken | 54 dead links in 13 frame-packet `.md` files. | High, count | Owner |
| R-12 | Inconsistent | `.agents/skills/react-best-practices/` rename was not applied. The skills-refresh plan says done. `.agents` has 364 files. The owner counted 243. | Medium | Owner |
| R-13 | Unneeded | 13 duplicate `voice/NN-2.wav` files. `videos/` is not referenced. `SCRIPT.md` runs 93 s, BRIEF says 90 s. Absolute `/Users/...` paths in video scripts. | Medium | Owner |
| R-14 | Unneeded | `store/creative` holds byte-identical locale frame copies (67.5 MB). `store/creative/.cache/html/` holds 13.7 MB of scratch files. | High, measured | Owner |
| R-15 | Unneeded | Root `video.mp4` duplicates `frontend/public/video/promo.mp4`. Kept by owner decision. | High | Owner |
| R-16 | Unneeded | `flutter/web` has no CI or doc users. 14 `kIsWeb` branches remain. Kept by owner decision. | High | Owner |
| R-17 | Inconsistent | Docker files conflict with AGENTS.md ("Never use Docker for local development"). TD-003 is open. Kept by owner decision. | High | Owner |
| R-18 | Unneeded | `fitcheck-pr27` worktree (0.58 GB) and five stashes. Not touched. | High | Owner |

### UX deferrals from `UI_UX_IMPROVEMENTS.md`

| ID | Type | Finding and evidence | Confidence | Plan |
|----|------|----------------------|------------|------|
| U-01 | Obsolete | Phase F is built as client orchestration (`docs/exec-plans/completed/2026-08-01-auto-outfit-from-upload.md`). The `outfit_suggestion` SSE event was never built. | High, grep | None (done) |
| U-02 | Obsolete | Auto-extract and default outfit per upload ship in `BatchExtractionFlow` (same completed plan). | High, grep | None (done) |
| U-03 | Obsolete | rembg was rejected on purpose. Backdrop removal uses Pillow only and writes WebP with alpha (`backend/app/utils/background_removal.py:15`; `docs/BACKEND.md`, line 522). | High, read | None (decided) |
| U-04 | Inconsistent | The route stays `/wardrobe` while the UI says Closet. No `/closet` route or redirect exists (UI_UX section 6). | Low | TD-155 |

### Already fixed or obsolete (not carried forward)

SIMPLIFY items fixed: F1, F2, F5, F6, F8, B4, B5, B6, FL1, FL3, FL5, S1 to S3. SIMPLIFY F4 is done enough: five panels exist and `ProfilePage` is 619 lines, so it has no row. SIMPLIFY R1 is obsolete. UI_UX Phases 1 to 4 are implemented, and the photo-to-outfit and rembg deferrals are obsolete (U-01 to U-03). SIMPLIFY FL6 is partly done, and F-18 covers the rest. Items B3 and FL2 are covered above or fixed.

## Skipped and sampled files

- Never opened: every `.env` file. This is a rule. No credentials were read.
- Not read: generated and vendor output (`node_modules`, `.venv`, `flutter/.dart_tool`, `build/`), lock files, and prerendered HTML (sampled). `docs/generated/*` was sampled, which found the generator bug (B-21).
- Binary files, checked by listing and reference only: images, audio, video, and fonts under `store/`, `videos/`, `widgets/`, and `flutter/assets/`.
- Golden images (`flutter/test/visual/goldens/*.png`, 95 files): reviewed as thumbnails on 8 contact sheets. One golden checked at full size.
- Migrations (`backend/db/supabase/migrations/`): checked by structure (tables, RLS, policies, SECURITY DEFINER). Not read line by line.
- Out of scope: `output/` (except the audit's own logs), stashes, the `fitcheck-pr27` worktree, and other branches.
- Per-explorer skipped lists are not kept in this plan. Each explorer used the rules above.

## Fixed in this audit

Filled in at P5 and P6.

## Owner review list

Filled in at P6. Until then, every row marked Owner in the findings tables is on the working list.

## Verification

- Baseline lanes: as in the table above.
- P3 review: `output/audit/screens/web/review.md`. Goldens: `output/audit/logs/flutter-golden.log`.
- P5 lanes after each commit: backend `ruff check .`, targeted pytest, and `python scripts/check_architecture.py`. Web `npm run lint`, `npm test`, and `npm run build`. Admin `npm run lint`, `npm run typecheck`, `npm test`, `npm run check:schema`, and `npm run build`. Flutter `flutter analyze` and `flutter test --exclude-tags golden`. Docs `python scripts/check_docs_structure.py`.

## Deferred debt

Debt rows moved to `docs/exec-plans/tech-debt-tracker.md` as TD-147 to TD-157 in commit (c). Plan cells now name the TD ID.
