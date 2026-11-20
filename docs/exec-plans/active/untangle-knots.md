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
| 1 | Plan limits copied into three apps | A | TD-032 | 2dfed3e |
| 2 | Outfit generation state in two channels | A | TD-049 | c6f3f46 |
| 3 | Profile fields copied twice | A | | 470305f, c604077 |
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

### Knot 4 sub-steps

One route file per sub-step, heaviest first. A sub-step ends with zero `.table(` calls in its route file and one commit. A commit hash lands in the next sub-step's commit.

| # | Route file | Calls | Service module | Commit |
|---|------------|-------|----------------|--------|
| 1 | outfits.py | 65 | outfit_service.py | 419384e |
| 2 | users.py | 51 | user_service.py | d0f4cdf |
| 3 | items.py | 36 | item_service.py | 651e58b |
| 4 | auth.py | 18 | auth_service.py | d84d03c |
| 5 | recommendations.py | 17 | recommendation_service.py | f28bdb3 |
| 6 | calendar.py | 17 | calendar_service.py | d085040 |
| 7 | subscription.py | 14 | subscription_service.py | 6c635bc |
| 8 | blog.py | 11 | blog_service.py | 70c4c9d |
| 9 | iap.py | 8 | iap_service.py | 8f863a6 |
| 10 | gamification.py | 8 | gamification_service.py | 3713e0d |
| 11 | deps.py | 6 | user_service.py | 2087e24 |
| 12 | ai.py | 5 | ai_service.py | e72fe09 |
| 13 | shared_outfits.py | 2 | shared_outfit_service.py | abbbea9 |
| 14 | weather.py | 1 | weather_service.py | f69cb31 |
| 15 | waitlist.py | 1 | waitlist_service.py | |
| 16 | ai_settings.py | 1 | ai_settings_service.py | |
| 17 | architecture rule for `.table(` in app/api/v1 | - | scripts/check_architecture.py | |

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
| 2026-11-20 | Knot 1 commit alone fails the docs freshness check: tracker header 2026-10-26, file last commit 2026-11-20. Knot 2 bumps the header to 2026-11-20. |
| 2026-11-20 | Knot 2 (outfit generation state) done. Vitest 80 files, 558 tests pass (was 555). Lint pass. Build pass, 42 routes prerendered. Root architecture and docs pass. Commit: `refactor: derive outfit generation state from the job map`. |
| 2026-11-20 | Knot 3 (profile fields) done. Helper `app/services/profile_fields.py` serves `oauth_sync` and `_provision_profile`. Ruff and architecture pass. Backend pytest 4426 passed, 4 skipped (10 new tests). Three existing `oauth_sync` tests returned a bare Mock for `user_metadata`. Supabase returns a dict, so those fixtures now return `{}`. The insert failure for names over 255 characters is not reproduced. The limit comes from `users.full_name VARCHAR(255)` in migration 001. Commit: `refactor: share first-login profile fields between auth and deps`. |
| 2026-11-20 | Knot 4 sub-step 1 (outfits.py, 65 calls) done. Route has 0 `.table(` calls. Ruff, architecture, and docs pass. Backend pytest 4426 passed, 4 skipped. Left for later: two alias imports kept for tests (`_collection_counts`, `_normalize_item_images`), and the route still imports `materialize_*` from `app.api.v1.images`. Commit: `refactor: move outfit route queries into outfit_service`. |
| 2026-11-20 | Knot 4 sub-step 1 query check. `output/untangle/check_moves.py --old-rev 419384e~1` reports 20 structure differences and 7 new chains. All come from call-site parameters (`columns`, `limit`, `profile_id`, `completed_at`, `image_url`, `outfit_id`) or from reads merged into `fetch_owned_outfit_row`. Its `operation` argument keeps `execute_with_reconnect` and the same `extra` labels. Each call site was checked against the old literal. No runtime change found. |
| 2026-11-20 | Knot 4 sub-step 2 (users.py, 51 calls) done. Route went from 1448 to 1086 lines and has 0 `.table(` calls. New `app/services/user_service.py` (536 lines) holds the queries. `_get_weather_suggestion` and `_get_outfit_of_the_day` stay in the route, and only their queries moved. Checks: ruff pass; backend pytest 4426 passed, 4 skipped, coverage 94.64%; architecture and docs pass; `check_moves.py` structure 51/51 and names 51/51, no differences. Commit: `refactor: move user route queries into user_service`. |
| 2026-11-20 | Knot 4 sub-step 3 (items.py, 36 calls, 18 functions) done. Route has 0 `.table(` calls and went from 1953 to 1748 lines. New `app/services/item_service.py` (523 lines) holds 38 query functions. Three RPC calls move with their queries: `increment_item_worn`, `set_primary_item_image`, `get_item_stats_aggregate`. Checks: ruff pass; backend pytest 4426 passed, 4 skipped, coverage 94.66%; architecture and docs pass; `check_moves.py` structure 36/36 and names 36/36. Logger calls stay in the route (42 before and after). Left for later: the route and the service each define `_now`. Commit: `refactor: move item route queries into item_service`. |
| 2026-11-20 | Knot 3 follow-up (decision 10) done. `avatar_url` is stored whole. The 500-character cut is removed from `app/services/profile_fields.py`, so both first-login paths keep the full provider URL. `full_name` keeps its 255-character cut. Three tests that asserted the 500-character cut now assert the full value: `test_profile_fields.py`, `test_deps_get_current_user_coverage.py`, and `test_auth_routes_coverage.py`. Checks: ruff pass; backend pytest 4426 passed, 4 skipped (count unchanged); architecture and docs pass. Commit: `fix: store full avatar URLs at first login`. |
| 2026-11-20 | Knot 4 sub-step 4 (auth.py, 18 calls) done. Route has 0 `.table(` calls and went from 1056 to 976 lines. New `app/services/auth_service.py` (189 lines) holds 18 query functions. Checks: ruff pass; backend pytest 4426 passed, 4 skipped, coverage 94.67%; architecture and docs pass; `check_moves.py` structure 18/18. Names review shows one parameter rename (`profile_updates` to `updates`) with no runtime change. No test changed, and no patch needed a retarget: the register patches at `test_auth.py` lines 363 and 420 still reach the route wrapper. Commit: `refactor: move auth route queries into auth_service`. |
| 2026-11-20 | Knot 4 sub-step 5 (recommendations.py, 17 calls) done. Route went from 1372 to 1282 lines and has 0 `.table(` calls. New `app/services/recommendation_service.py` (233 lines) holds 17 query chains in 16 functions. The worker's first version built the match-pool candidate query inside a coroutine, which changed the query builder call order. The coordinator moved the gather into `fetch_match_pool`, which builds the candidate query first, as the route did. Checks: ruff pass; backend pytest 4426 passed, 4 skipped, coverage 94.67%; architecture and docs pass; `check_moves.py` structure 17/17 and names 17/17. Logger calls stay in the route (17 before and after). No test changed. Commit: `refactor: move recommendation route queries into recommendation_service`. |
| 2026-11-20 | Knot 4 sub-step 6 (calendar.py, 17 calls) done. Route went from 800 to 721 lines and has 0 `.table(` calls. New `app/services/calendar_service.py` (211 lines) holds 17 query functions, one per call site. Checks: ruff pass; backend pytest 4426 passed, 4 skipped, coverage 94.68%; architecture and docs pass; `check_moves.py` structure 17/17 and names 17/17. Logger calls and HTTP mapping stay in the route. No test changed: no test patches a calendar name. Commit: `refactor: move calendar route queries into calendar_service`. |
| 2026-11-20 | Knot 4 sub-step 7 (subscription.py, 14 calls) done. Route went from 867 to 812 lines and has 0 `.table(` calls. The 14 queries are module-level functions in a labeled section at the end of `app/services/subscription_service.py`, which now has 34 `.table(` calls (20 existing plus 14). Checks: ruff pass; backend pytest 4426 passed, 4 skipped, coverage 94.68%; architecture and docs pass; `check_moves.py` structure 34/34, zero missing and zero extra. Names review: 4 webhook chains differ because a status constant became a `status` parameter. Each call passes the matching constant, checked by hand. The failure path's `e` became `error`, with the same `str(...)[:1000]`. No test changed. Commit: `refactor: move subscription route queries into subscription_service`. |
| 2026-11-20 | Knot 4 sub-step 8 (blog.py, 11 calls) done. Route went from 567 to 511 lines and has 0 `.table(` calls. New `app/services/blog_service.py` (183 lines) holds 11 query chains, one per function. Checks: ruff pass; backend pytest 4426 passed, 4 skipped, coverage 94.69%; architecture and docs pass; `check_moves.py` structure 11/11 and names 11/11, no differences. The route diff was read by hand for ordering and error paths. Commit: `refactor: move blog route queries into blog_service`. |
| 2026-11-20 | Knot 4 sub-step 9 (iap.py, 8 calls) done. Route went from 842 to 779 lines and has 0 `.table(` calls. New `app/services/iap_service.py` (165 lines) holds 8 query functions, one per call site. Checks: ruff pass; backend pytest 4426 passed, 4 skipped, coverage 94.69%; architecture and docs pass; `check_moves.py` structure 8/8 with zero missing and zero extra. The names review shows 5 parameter or constant substitutions, each checked by hand. The route diff was read by hand for control flow. Commit: `refactor: move iap route queries into iap_service`. |
| 2026-11-20 | Knot 4 sub-step 10 (gamification.py, 8 calls) done. Route went from 379 to 376 lines and has 0 `.table(` calls. New `app/services/gamification_service.py` (84 lines) holds 8 query functions, one per call site. Checks: ruff pass; backend pytest 4426 passed, 4 skipped, coverage 94.70%; architecture and docs pass; `check_moves.py` structure 8/8 with zero missing and zero extra. The names review shows one parameter rename (`me_streak` to `streak`), checked by hand. The route diff was read by hand for control flow. Commit: `refactor: move gamification route queries into gamification_service`. |
| 2026-11-20 | Knot 4 sub-step 11 (deps.py, 6 calls) done. Route went from 434 to 414 lines and has 0 `.table(` calls. The six queries are a labeled section at the end of `app/services/user_service.py`, which now has 594 lines and 57 `.table(` calls. Checks: ruff pass; backend pytest 4426 passed, 4 skipped, coverage 94.70%; architecture and docs pass; `check_moves.py` structure 57/57 across deps.py and user_service.py, zero missing and zero extra. The names review shows two parameters renamed to `columns` (`reduced` and `plain_columns`), checked by hand. The route diff was read by hand for control flow. Twenty patches in three test files now target `user_service`. `test_language_explicit.py` now scans `user_service.py`. Commit: `refactor: move deps route queries into user_service`. |
| 2026-11-20 | Knot 4 sub-step 12 (ai.py, 5 calls) done. Route went from 1005 to 993 lines and has 0 `.table(` calls. Five query functions went into a new section at the end of `app/services/ai_service.py`, which now has 563 lines. Checks: ruff pass; backend pytest 4426 passed, 4 skipped, coverage 94.70%; architecture and docs pass; `check_moves.py` structure 5/5 and names 5/5, zero missing and zero extra. The route diff was read by hand for control flow. No quota, usage, refund, or rate-limit code moved. No test changed. Commit: `refactor: move ai route queries into ai_service`. |
| 2026-11-20 | Knot 4 sub-step 13 (shared_outfits.py, 2 calls) done. Route went from 138 to 135 lines and has 0 `.table(` calls. New `app/services/shared_outfit_service.py` (29 lines) holds 2 query functions, one per call site. The route drops its unused `asyncio` import. Checks: ruff pass; backend pytest 4426 passed, 4 skipped, coverage 94.70%; architecture and docs pass; `check_moves.py` structure 2/2 and names 2/2, zero missing and zero extra. The route diff was read by hand for control flow. No test changed. Commit: `refactor: move shared outfit route queries into shared_outfit_service`. |
| 2026-11-20 | Knot 4 sub-step 14 (weather.py, 1 call) done. Route went from 220 to 213 lines and has 0 `.table(` calls. The one query moves to a labeled section at the end of `app/services/weather_service.py`, which now has 648 lines. The route drops its unused `asyncio` import. Checks: ruff pass; backend pytest 4426 passed, 4 skipped, coverage 94.70%; architecture and docs pass; `check_moves.py` structure 1/1 and names 1/1, zero missing and zero extra. The route and service diffs were read by hand for control flow. No test changed. Commit: `refactor: move weather route queries into weather_service`. |
| 2026-11-20 | Knot 4 sub-step 15 (waitlist.py, 1 call) done. Route has 0 `.table(` calls and stays at 156 lines. New `app/services/waitlist_service.py` (18 lines) holds one function, `insert_waitlist_row`. The route drops its unused `asyncio` import. Checks: ruff pass; backend pytest 4426 passed, 4 skipped, coverage 94.70%; architecture and docs pass; `check_moves.py` structure 1/1 and names 1/1, zero missing and zero extra. The route diff was read by hand for control flow. No test changed. Commit: `refactor: move waitlist route queries into waitlist_service`. |

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
| 2026-11-20 | Knot 2: the `generatingOutfits` map is the only generation record. `isGenerating` and `generationStatus` are removed from `outfitStore`. | TD-049: the two records could disagree. Side effect: a pane job now shows the spinner on its outfit card, which it did not before. |
| 2026-11-20 | Knot 3: `oauth_sync` now cuts `full_name` to 255 and `avatar_url` to 500, as `_provision_profile` already did. One helper serves both. | One set of limits. `full_name` is `VARCHAR(255)`, so a longer name fails the insert. `avatar_url` is `TEXT`, so the 500 cap is app policy only. A URL cut at 500 characters stops working. |
| 2026-11-20 | Knot 4: each route file's queries move into one service module, with the same query chains and log labels. Routes keep HTTP work only. | ARCHITECTURE.md keeps routes thin. Tests patch the service module where the moved name is now looked up. Moved log records carry the service logger name. |
| 2026-11-20 | Knot 4 move check. The AST check compares each `.table(` chain: table, calls, literals, and wrapper must match. Variable renames are allowed. Parameters and merged helpers need a call-site check. | Counting `.table(` calls cannot show that a query changed. The AST check can. |
| 2026-11-20 | Knot 4 users: body-profile writes (count, default clear, users link, create or update) moved into the service in their original order. The route keeps the per-user lock, `_now()`, the response envelope, and error mapping. Tests patch `user_service` where a moved name is looked up. | Write order sets the default profile, so the move keeps it. |
| 2026-11-20 | Knot 4 items: each query keeps its wrapper (`execute_with_reconnect` or `asyncio.to_thread`) and its `extra` labels. The list read keeps its route-level `execute_with_reconnect` wrapper around the service call. `_apply_filters` moves from a closure to a module function with the same body. The move check does not compare RPC names, so each RPC call was checked by hand. Tests that patched moved names now patch `app.services.item_service`. Tests for list-level calls still patch `items_module`. | The checker cannot see RPC names or where a wrapper sits. A patch on a name the code no longer uses passes but tests nothing, so each retarget was checked to hit the call it names. |
| 2026-11-20 | Knot 3 follow-up (owner decision): `avatar_url` is stored whole. `full_name` keeps the 255-character cut. This supersedes the 500-character limit in the knot 3 row above. | A URL cut at 500 characters stops working. Migration 036 widened `avatar_url` to TEXT. The 2026-08-07 RCA plan lists 036 as pending on hosted Supabase, so confirm it is applied before this change deploys. Until then, a URL over 500 characters can fail the first-login insert. |
| 2026-11-20 | Knot 4 auth: each query keeps its order, wrapper, and log label. Login and fallback helpers take the user or payload object and read the id inside the chain. Register and login default chains stay separate functions. Register and OAuth sync keep their route-level `execute_with_reconnect` around `_upsert_user_profile`. | The move check compares chains, so each chain must read the same values in the same places. Tests patch `execute_with_reconnect` on the route module for register, so that patch must keep reaching a call in the route. |
| 2026-11-20 | Knot 4 recommendations: each query keeps its wrapper and builder order. Wardrobe gaps and shopping, and the similar-item and style source reads, have identical chains, so each keeps its own function to match its call site. `upsert_recommendation_rating` takes the request and reads `rating` inside the chain. The route keeps the birth-profile fallback loop, the weather and astrology logic, and the Supabase Auth admin call. | The move check counts one chain per call site, so 17 chains need 17 call sites. The match-pool gather moved with its two queries so the query builder order matches the route. No test patches a moved name, so no retarget was needed. |
| 2026-11-20 | Knot 4 calendar: each query keeps its wrapper, filters, and order. The two identical owned-event reads (delete and outfit assign) keep their own functions, one per call site. Functions that read a field from the request or the loaded row (`fetch_owned_outfit`, `set_event_outfit`, `update_connection_row`) take the object and read the attribute inside the chain. `get_calendar_events` computes the date bounds in the route and passes them in. The service applies the `if bound:` filters and the page range. `_calendar_day_bound` never returns an empty string, so `if bound:` matches the old `if start_date:`. `db.table()` now runs after the bound validation, not before. It only builds a query object, so no result changes. The route's `asyncio` import is removed because nothing in the route uses it. | The move check compares each chain's structure, including attribute reads and dict literals, so those reads sit inside the chain. Route handlers keep their names and signatures, because tests call them directly. |
| 2026-11-20 | Knot 4 subscription: the 14 queries are module-level functions, not `SubscriptionService` methods. The webhook tests patch `app.api.v1.subscription.SubscriptionService` with a mock, so a method would hide its queries from them. Each route call site has its own function. The two subscription lookups (updated and deleted) have identical chains and stay separate, because the move check counts one chain per call site. The lease branch (previous lease null or not) moved into `claim_webhook_event`, which also computes `previous_attempts + 1`. The route keeps every Stripe call, every read of `settings` and `stripe`, the signature check, event dispatch, idempotency decisions, and the status constants, which it passes in as `status`. | Tests patch the route's `settings`, `stripe`, and `SubscriptionService`. A moved query that read one of them would bypass the patch. The move check compares attribute reads and dict literals, so `user`, `event`, `subscription`, and the loaded row are passed whole and read inside the chain. |
| 2026-11-20 | Knot 4 blog: each query keeps its order, filters, and log label. The admin list keeps one chain, with the count read before the range, as at HEAD. The route keeps the search sanitizer (it passes `search_term=None` when the term is empty), the `post_status` to `status_filter` mapping, the NotFound and validation checks in their order, and `record_audit`. Each call site has its own function. | The move check compares chains, not the control flow around them. The route diff was read by hand for ordering and error paths. |
| 2026-11-20 | Knot 4 iap: each query keeps its wrapper, table, filters, order, and log label. The eight functions are module-level in `app/services/iap_service.py`, one per call site. `claim_webhook_event` and `reclaim_webhook_event` have the same body and stay separate, because the move check needs one chain per call site. The route keeps the `_WEBHOOK_STATUS_*` constants and passes the status into each function. `mark_webhook_event_status` takes `processed_status`, so the processed-at check still reads the route's constant. The new module is separate from `apple_iap_service.py`, which holds JWS verification only. | The tests read the status constants from the route module, so the constants stay there. The move check cannot compare parameter substitutions, so each status and user parameter was checked against its call site by hand. |
| 2026-11-20 | Knot 4 gamification: each chain keeps its table, filters, order, limit, and wrapper. The eight functions are async, run with `asyncio.to_thread`, and sit in the new `app/services/gamification_service.py`, one per call site. The route keeps the streak upsert payload, `_now()`, the avatar materialization gather, rank math, response shaping, logging, and error mapping. `DatabaseError` is still raised in the route after the upsert returns. | Tests patch `materialize_avatar_url` on the route module, and that function stays there. No test patches a moved name, so no retarget was needed. The one name difference is a parameter rename with the same SQL. |
| 2026-11-20 | Knot 4 deps: the six queries join `user_service.py` as a labeled section, one function per call site. The plan names that module, and it already holds the users queries. The three embed reads take `columns`, `user_id`, and `operation`, and each keeps its own `extra` labels, including `embed` for the two fallbacks. The two default-row upserts take `token_data`, because their dicts read `token_data.sub`. The embed fallback, the try and except blocks, the provisioning order, and error mapping stay in `deps.py`. | Tests patch `execute_with_reconnect` on the module that calls it. After the move that is `user_service`, so the 20 patches moved there. Without the retarget, `monkeypatch.setattr` raises AttributeError. `test_language_explicit.py` guards the writer of the `"en"` default, and that writer now lives in `user_service.py`, so its scan reads that file. `token_data` is typed `Any`, as the other service helpers type `db`, so the service does not import `app.core.security`. |
| 2026-11-20 | Knot 4 ai: the five queries move to a new section at the end of `app/services/ai_service.py`, one function per call site. The two outfit reads (`include_user_face` and the `use_body_profile` fallback) have identical chains and keep separate functions, because the move check needs one chain per call site. Each function keeps its `asyncio.to_thread` wrapper. The route keeps the rate-limit wrapper, quota and usage counters, refunds, agent calls, and the best-effort try block in `_fetch_user_avatar_base64`. | The move check counts chains, so merging the two identical outfit reads would fail the structure gate. Quota, usage, and refund code is control flow, not a query, so it stays in the route. |
| 2026-11-20 | Knot 4 shared outfits: the share lookup and the feedback insert move to `app/services/shared_outfit_service.py`, one function per call site. Each keeps its chain and `asyncio.to_thread` wrapper. The expiry and `allow_feedback` checks, the not-found mapping, logging, and the response stay in the route. The route's `asyncio` import is removed because nothing else in the route uses it. | The move check needs one chain per call site. Only queries move, so the control flow does not change. |
| 2026-11-20 | Knot 4 weather: the one query (the default location read from `user_settings`) moves to `weather_service.py`. The function's `asyncio` and `Client` imports go at the top of that file. The route keeps the `try` block, its fallback to the default location, the `settings_row` check, and the logging. | One call site, so one chain and one function. The fallback stays in the route, so the control flow around the query does not change. |
| 2026-11-20 | Knot 4 waitlist: the insert moves to `waitlist_service.py` as `insert_waitlist_row`. The route keeps the payload build, the empty-result check, logging, and the try and except chain. | One call site, so one chain and one function. The payload stays in the route, so its fields and their order do not change. |

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
