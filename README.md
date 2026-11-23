# FitCheck AI

FitCheck AI is a multi-platform wardrobe intelligence product with AI-assisted item extraction, outfit planning, outfit generation, recommendations, and social sharing.

## Monorepo apps

- `backend/` — FastAPI API and business logic
- `frontend/` — React + TypeScript web app (Vite)
- `admin/` — Internal admin console (React 19 SPA, server-enforced RBAC)
- `flutter/` — Flutter mobile app (Riverpod + go_router)
- `infra/` — Cloudflare images worker
- `docs/` — Agent-first knowledge base (product, design, plans, quality)
- `scripts/` — Harness checks (architecture + docs structure)

## Agent / contributor maps

- **Agents:** `AGENTS.md`
- **Architecture layers:** `ARCHITECTURE.md`
- **Knowledge hub:** `docs/README.md`

## Core capabilities

- AI wardrobe extraction (single or batch, SSE jobs)
- Wardrobe CRUD, filtering, condition tracking
- Outfit creation and generation
- Virtual try-on
- Calendar and weather-informed planning
- Recommendations (match, complete look, gap-oriented)
- Photoshoot image generation
- Social sharing and public outfit links
- Referral, subscription, and flag-gated gamification flows
- Optional social import pipeline
- Admin console (internal, server-enforced RBAC)

## High-level architecture

1. Web and mobile clients call FastAPI under `/api/v1/*`.
2. Routes coordinate domain services (`backend/app/services/`).
3. Supabase provides Postgres + auth; private uploads use S3-compatible storage (Cloudflare R2).
4. AI provider abstraction (custom/OpenAI; Gemini for embeddings).
5. Optional vector features use Pinecone.

Details and **enforced layer rules:** `ARCHITECTURE.md`.

## Local development

Hosted Supabase only. **Do not** use Docker or local Supabase for development.

### Prerequisites

- Git, Bash, Python 3.12, and Node.js 24 LTS (includes npm)
- Node 20 is the minimum required by the locked web dependencies; Node 18 is unsupported.
- Hosted Supabase and private object storage are needed for authenticated app
  flows, **not** for the frontend build/tests below.
- Optional: Flutter SDK, Pinecone, AI provider keys

### Clone to a working build (no credentials required)

```bash
git clone https://github.com/YORDINDIA/fitcheck-ai.git
cd fitcheck-ai
(cd frontend && npm ci && npm run lint && npm test && npm run build)
```

The production web bundle is written to `frontend/dist/`. This verifies the web
app, not hosted authentication, uploads, or AI. Local builds do not submit
IndexNow notifications; production Netlify builds still do.

### Run web + API

First complete the dependency and environment setup in
[Development Setup](docs/references/local-setup.md). Then, from the repository root:

```bash
./run-dev.sh
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000`
- API docs: `http://localhost:8000/api/v1/docs`

The runner starts installed services; it does not install dependencies or
provision Supabase.

## Environment

A fresh clone has **no private environment files**. Copy the templates only if
the destination does not already exist, then fill in your own development
credentials as described in the setup guide:

- `backend/.env.example` → `backend/.env`
- `frontend/.env.example` → `frontend/.env`
- `admin/.env.example` → `admin/.env`
- `flutter/.env.example` → `flutter/.env`

Never commit credentials or put backend secret keys in a frontend/mobile env.

## Documentation map

| Need | Location |
|------|----------|
| Agent map | `AGENTS.md` |
| Architecture | `ARCHITECTURE.md` |
| Knowledge hub | `docs/README.md` |
| Backend depth | `docs/BACKEND.md` |
| Frontend depth | `docs/FRONTEND.md` |
| Admin console | `docs/ADMIN.md`, `admin/README.md` |
| Product specs | `docs/product-specs/` |
| Setup | `docs/references/local-setup.md` |
| Quality / debt | `docs/QUALITY_SCORE.md`, `docs/exec-plans/tech-debt-tracker.md` |
| Exec plans | `docs/exec-plans/` |

## Validation

Run each command from the repository root, after installing that app's
dependencies (see the setup guide and optional app READMEs):

```bash
./scripts/check_all.sh
(cd backend && .venv/bin/python -m pytest)
(cd frontend && npm run lint && npm test && npm run build)
(cd admin && npm run lint && npm run typecheck && npm test && npm run check:schema)
(cd flutter && flutter test)
```

The aggregate harness requires its toolchains by default. Its opt-in
`--allow-missing-checks` and `--allow-no-pytest` flags permit partial runs;
a partial run is not proof that every app was tested.

Harness CI: docs structure + architecture (`.github/workflows/docs-ci.yml`); backend also runs architecture in `backend-ci.yml`.

## Notes

- Keep business logic in services; keep routes thin.
- Update docs in the same change as behavior/API/env changes.
- Do not grow `AGENTS.md`—update `docs/` instead.
