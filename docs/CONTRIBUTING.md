# Contribuir / Contributing

## Alcance / Scope
ES: Este repositorio contiene la PWA (web/) y el backend serverless (api/).
EN: This repository contains the PWA (web/) and the serverless backend (api/).

## Estructura / Structure
```
/web   - Aplicación web PWA (SvelteKit + Vite)
/api   - API serverless (Cloudflare Workers + Hono)
/docs  - Documentación técnica bilingüe (ES/EN)
```

## Requisitos / Requirements
- Node.js 20+ y npm
- Git
- (API) Wrangler CLI (vía devDependencies)
- (APK) Java 17+ y Android SDK cuando se construya

## Configuración rápida / Quick setup
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

## Scripts principales / Main scripts
**Web**
- `npm run dev`
- `npm run build`
- `npm run check`

**API**
- `npm run dev`
- `npm test`
- `npm run deploy`

## APK (TWA) / APK (TWA)
ES: Para generar un APK desde la PWA usa Bubblewrap (TWA). Requiere la app desplegada.
EN: To generate an APK from the PWA, use Bubblewrap (TWA). It requires the app to be deployed.

```
npx @bubblewrap/cli init --manifest https://kali113.github.io/Anglicus/manifest.json
cd android && gradlew.bat assembleRelease
```

## Seguridad / Security
- Nunca subas claves API al repositorio.
- Usa `.env` local y revisa `docs/security.md`.

## Pull Requests / Pull Requests
1. Crea una rama (`git checkout -b mi-feature`).
2. Mantén cambios pequeños y documentados.
3. Actualiza documentación si aplica.
4. Abre un Pull Request con un resumen claro.
