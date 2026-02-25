# Contributing

## Scope
This repository contains the PWA (web/) and the serverless backend (api/).

## Canonical docs
- `AGENTS.md` for quick repository map and workflows.
- `docs/CONTRIBUTING.md` for contributor setup and process.

## Structure
```
/web   - PWA web app (SvelteKit + Vite)
/api   - Serverless API (Cloudflare Workers + Hono)
/docs  - Bilingual technical docs (ES/EN)
```

## Product context
- Paywall for premium features and upgrades.
- Crypto payment support for upgrades.
- i18n UI with ES/EN locales.

## Requirements
- Node.js 20+ and npm
- Git
- (API) Wrangler CLI (via devDependencies)

## Quick setup
### Web
```
cd web
npm install
npm run dev
```

### API
```
cd api
npm install
npm run dev
```

## Main scripts
**Web**
- `npm run dev`
- `npm run build`
- `npm run check`

**API**
- `npm run dev`
- `npm run test`
- `npm run deploy`

## Workflows (GitHub Actions)
- **Tests** runs web check/test and API tests on pushes and pull requests.
- **Deploy to GitHub Pages** publishes the web app from `web/`.

## Security
- Never commit API keys to the repo.
- Use local `.env` files and review `docs/security.md`.

## Pull Requests
1. Create a branch (`git checkout -b my-feature`).
2. Keep changes small and documented.
3. Update documentation when applicable.
4. Open a Pull Request with a clear summary.

## Branch protection
The `master` branch is protected: force-pushes/deletion are blocked, and required status checks must pass before merge.
