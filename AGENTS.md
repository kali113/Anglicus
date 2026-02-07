# AGENTS.md

## Why
Anglicus is an AI English tutor for Spanish speakers, with a web PWA and a serverless API router.

## What (repo map)
- `web/` : SvelteKit + Vite PWA UI.
- `api/` : Cloudflare Workers (Hono) API router for AI providers.
- `docs/` : Bilingual (ES/EN) architecture, security, onboarding, and exercise references.

Key entry points:
- `api/src/index.ts`
- `api/src/routes/`
- `web/src/routes/+page.svelte`
- `web/src/routes/tutor/`

## How (workflows)
- Install deps per package:
  - web: `cd web && npm install`
  - api: `cd api && npm install`
- Web tasks:
  - `npm run dev`
  - `npm run build`
  - `npm run check`
- API tasks:
  - `npm run dev`
  - `npm run test`
  - `npm run deploy`

## Deeper context (read only if relevant)
- `docs/CONTRIBUTING.md` (dev setup + commands)
- `docs/architecture.md` (system overview)
- `docs/security.md` (API key handling; never commit .env*)
- `docs/onboarding.md` (first-run flow)
- `docs/exercises.md` (exercise types)
- `docs/spanish-errors.md` (common ES learner mistakes)
- `docs/development-prompt.md` (build prompt)

## Coding Standards
- TypeScript for all new code
- Follow existing patterns in each directory
- Never commit API keys or .env files
- Keep PWA offline-first in mind for web features
