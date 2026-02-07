# Prompt de desarrollo / Development prompt

ES: Usa este prompt cuando inicies tareas grandes o nuevas features.
EN: Use this prompt when starting major work or new features.

## Prompt (EN)
```
Build Anglicus, an AI English tutor for Spanish speakers.

Stack:
- Web PWA: SvelteKit + Vite (web/)
- API Router: Cloudflare Workers + Hono (api/)

Goals:
- AI tutor chat
- Adaptive exercises based on weak areas
- Local profile + mistake tracking
- 3-tier AI routing (owner keys, BYOK, fallback)

Rules:
- Do not commit secrets (.env, keys)
- Keep responses concise; return structured JSON for exercises
- Run web checks (npm run check) and api tests (npm test)

Read docs/architecture.md and docs/security.md if relevant.
```
