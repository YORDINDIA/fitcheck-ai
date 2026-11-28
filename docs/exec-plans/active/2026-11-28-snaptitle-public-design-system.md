# Plan: Snaptitle Crayon & Paper Public Design System

Status: active  
Started: 2026-11-28  
Owner: agent

## Goal

Adopt the complete Snaptitle (`https://snaptitle.app/`) crayon-and-paper design
system across FitCheck AI's public website (`PublicLayout`, `Navbar`, `Footer`,
landing page `/`, feature pages, SEO intent pages, tools, legal pages, and
blog), with full light and dark mode support while keeping the logged-in web app
on the Clay system.

## Non-goals

- Logged-in app routes (`/dashboard`, `/wardrobe`, `/outfits`, etc.) stay on Clay.
- `scripts/creative/` and `public/fonts/paper-studio-*` remain intact for store
  creatives.
- No change to pricing, limits, promo logic, or demo API behavior.

## Acceptance criteria

- [x] Self-hosted `Gaegu` (700) and `JetBrains Mono` Latin WOFF2 fonts added under `frontend/public/fonts/`.
- [x] `.cp` and `.dark .cp` CSS variables, grain overlay, SVG filters (`#cp-line`, `#cp-scribble`, `#cp-wax`), and layout primitives implemented in `frontend/src/styles/crayon.css` and `frontend/src/components/crayon/`.
- [x] `Navbar`, `Footer`, `LandingPage` (all 11 sections including interactive `ClosetStage` and `StylePreview`), and all public feature/SEO/legal/blog pages migrated to `.cp`.
- [x] `scripts/check_theme_tokens.py` Rule 4 budgets for `components/landing` and `components/seo` ratcheted to `0`.
- [x] `frontend/scripts/prerender-html.mjs` updated to preload `gaegu-700-latin.woff2` and `inter-latin-var.woff2` on `/`.
- [x] `npm run lint`, `npm test`, `npm run build`, `check_theme_tokens.py`, `check_architecture.py`, `check_docs_structure.py`, and browser QA pass.

## Progress log

| Date | Note |
|------|------|
| 2026-11-28 | Implemented fonts, `crayon.css`, `CrayonFilters`, `CrayonPrimitives`, `PublicLayout`, `Navbar`, `Footer`, all 11 landing sections, and all public subpages. |
| 2026-11-28 | Hardened keyboard a11y, ARIA live regions, mobile drawer bounds, `#cp-wax` contrast, `.cp-dots` / `ClosetStage` mobile touch targets, `.cp-pair` mobile single-column stacking, and expanded unit tests (82 files, 569 tests passing). |

## Verification

```bash
cd frontend && npm run lint && npm test && npm run build
cd .. && python3 scripts/check_theme_tokens.py && python3 scripts/check_architecture.py && python3 scripts/check_docs_structure.py
```
