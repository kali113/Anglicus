# Copilot Instructions

## Project: Anglicus
AI English tutor for Spanish speakers with PWA frontend and serverless API backend.

## Repository Structure
```
web/     → SvelteKit + Vite PWA (Frontend)
api/     → Cloudflare Workers + Hono (Backend API)
docs/    → Bilingual documentation (ES/EN)
```

## Entry Points
- **Frontend**: `web/src/routes/+page.svelte`
- **Tutor UI**: `web/src/routes/tutor/`
- **API**: `api/src/index.ts`
- **Routes**: `api/src/routes/`

## Development Commands

### Web (SvelteKit)
```bash
cd web
npm install
npm run dev      # Dev server
npm run build    # Production
npm run check    # Type check
```

### API (Cloudflare Workers)
```bash
cd api
npm install
npm run dev      # Local dev
npm run test     # Tests
npm run deploy   # Deploy
```

## Guidelines
- Use **TypeScript** for all new code
- Follow existing patterns in each directory
- **Never commit** API keys or `.env*` files
- Keep **PWA offline-first** in mind

## Documentation
- `docs/architecture.md` - System overview
- `docs/security.md` - API key handling
- `docs/CONTRIBUTING.md` - Dev setup
- `docs/exercises.md` - Exercise types
- `docs/spanish-errors.md` - Common mistakes
- `docs/development-prompt.md` - Build specs
