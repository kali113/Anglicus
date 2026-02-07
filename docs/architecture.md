# Arquitectura / Architecture

## Resumen / Overview
ES: Anglicus combina una PWA en SvelteKit con un backend serverless en Cloudflare Workers.
EN: Anglicus combines a SvelteKit PWA with a serverless backend on Cloudflare Workers.

## Componentes / Components
- **Web (web/):** UI PWA con SvelteKit + Vite.
- **API (api/):** Router de IA con Hono en Cloudflare Workers.
- **Docs (docs/):** Documentación técnica bilingüe.

## Flujo de IA (3 niveles) / AI Routing (3 tiers)
1. **Tier 1:** Router backend con claves del owner.
2. **Tier 2:** BYOK (clave del usuario, directo al proveedor).
3. **Tier 3:** Fallback gratuito (Puter.js) si está habilitado.

## API module / Módulo API
- `api/src/index.ts` (entrada del Worker)
- `api/src/routes/` (chat, feedback)
- `api/src/lib/` (providers, models, CORS, rate limiting)

## Web app / Aplicación web
- `web/src/routes/` páginas principales (dashboard, tutor, settings)
- `web/src/lib/` componentes y almacenamiento local

## Contexto comprimido / Context compression
ES: Enviar solo perfil resumido, errores recientes y 3-5 últimos turnos.
EN: Send only a summarized profile, recent errors, and the last 3-5 turns.

## Feedback
ES: Reporte → Worker → servicio de email → owner.
EN: Report → Worker → email service → owner.
