# GEMINI.md - Instructions for Gemini

## Project Context
Anglicus: AI English tutor application for Spanish speakers

## Tech Stack
| Component | Technology |
|-----------|------------|
| Frontend | SvelteKit + Vite PWA |
| Backend | Cloudflare Workers (Hono) |
| Language | TypeScript |
| Platform | Web PWA + Serverless API |

## Quick Reference

### Directory Structure
```
web/          → SvelteKit frontend
api/          → Cloudflare Workers API
docs/         → Documentation (ES/EN)
```

### Essential Commands

**Web (SvelteKit):**
- `cd web && npm install`
- `npm run dev`     # Development
- `npm run build`   # Production build
- `npm run check`   # TypeScript check

**API (Cloudflare Workers):**
- `cd api && npm install`
- `npm run dev`     # Local development
- `npm run test`    # Test suite
- `npm run deploy`  # Deploy

## Key Files
- `web/src/routes/+page.svelte` - Landing page
- `web/src/routes/tutor/` - Tutor sessions
- `api/src/index.ts` - API entry point
- `api/src/routes/` - API endpoints

## Rules
1. ✅ TypeScript for all code
2. ✅ Match existing patterns
3. ❌ Never commit API keys or .env files
4. ✅ Design for offline PWA usage

## Docs
See `docs/` folder for:
- Architecture, Security, Contributing guides
- Exercise types and Spanish error patterns
