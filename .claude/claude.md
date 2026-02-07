# CLAUDE.md - Instructions for Claude

## Project Overview
Anglicus is an AI English tutor for Spanish speakers, featuring a SvelteKit PWA frontend and Cloudflare Workers API backend.

## Architecture
- **Frontend**: SvelteKit + Vite PWA (`web/`)
- **Backend**: Cloudflare Workers with Hono router (`api/`)
- **Documentation**: Bilingual ES/EN guides in `docs/`

## Key Entry Points
- `web/src/routes/+page.svelte` - Homepage
- `web/src/routes/tutor/` - Tutor interface
- `api/src/index.ts` - API entry
- `api/src/routes/` - API routes

## Development Workflows

### Setup
```bash
# Install dependencies
cd web && npm install
cd api && npm install
```

### Web Development
```bash
cd web
npm run dev      # Start dev server
npm run build    # Production build
npm run check    # Type check
```

### API Development
```bash
cd api
npm run dev      # Local dev
npm run test     # Run tests
npm run deploy   # Deploy to Cloudflare
```

## Critical Guidelines
1. **TypeScript Only** - All new code must be TypeScript
2. **Security** - Never commit `.env` files or API keys
3. **Offline-First** - PWA must work offline
4. **Follow Patterns** - Match existing code style in each directory

## Documentation References
- `docs/architecture.md` - System design
- `docs/security.md` - Security practices
- `docs/exercises.md` - Exercise types
- `docs/spanish-errors.md` - Common Spanish learner mistakes
- `docs/development-prompt.md` - Build specifications

## Claude-Specific Notes
- Prefer detailed explanations when asked
- Always run type checking (`npm run check`) after web changes
- Run tests (`npm run test`) after API changes
- Keep responses concise unless detailed analysis is requested
