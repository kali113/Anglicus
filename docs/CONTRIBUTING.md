# Contributing

## Scope
This repository contains the PWA (web/) and the serverless backend (api/).

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
- (APK) Java 17+ and Android SDK when building

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
- `npm test`
- `npm run deploy`

## APK (TWA)
To generate an APK from the PWA, use Bubblewrap (TWA). It requires the app to be deployed.

```
npx @bubblewrap/cli init --manifest https://kali113.github.io/Anglicus/manifest.json
cd android && gradlew.bat assembleRelease
```

The base config lives in `twa/twa-manifest.json`.

## Workflows (GitHub Actions)
- **Build APK** builds a signed APK on each push to main/master or release and uploads it as the `anglicus-apk` artifact.
- **Analyze (actions)** and **Analyze (javascript-typescript)** are required checks on `master`.

## Security
- Never commit API keys to the repo.
- Use local `.env` files and review `docs/security.md`.

## Pull Requests
1. Create a branch (`git checkout -b my-feature`).
2. Keep changes small and documented.
3. Update documentation when applicable.
4. Open a Pull Request with a clear summary.

## Branch protection
The `master` branch is protected: force-pushes/deletion are blocked, and status checks are required (Analyze (actions), Analyze (javascript-typescript)).
