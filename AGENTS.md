# AGENTS.md

## Purpose (WHY)
Anglicus is an AI English tutor for Spanish speakers. This repository contains the production web app, AI API router, and platform wrappers that deliver that experience.

## Repo Map (WHAT)
TypeScript monorepo:
- `web/`: SvelteKit + Vite PWA frontend.
- `api/`: Cloudflare Workers + Hono API router.
- `docs/`: Product and technical documentation (ES/EN).

## Working Agreement (HOW)
1. Confirm task scope, then inspect only relevant files.
2. Prefer deterministic checks before subjective review.
3. Make the smallest safe change that preserves existing intent.
4. Run relevant validation commands before finishing.
5. Report exactly what changed, what was validated, and any remaining risk.
6. Commit and push completed changes.

## Validation Commands
- Web lint/typecheck: `cd web && npm run check`
- Web tests: `cd web && npm run test`
- API tests: `cd api && npm run test -- --run`
- Web build: `cd web && npm run build`

## Progressive Disclosure (Read Only If Relevant)
Open deeper guidance only when needed:
- `PROMPT.md`: Consolidated review workflow and outputs.
- `agent_docs/review_methodology.md`: 7-phase review flow.
- `agent_docs/analysis_lenses.md`: Analysis angles for deep reviews.
- `agent_docs/quality_checklist.md`: Pass/fail quality gate.
- `agent_docs/standards.md`: Output and evidence standards.

## Guardrails
- Do not invent architecture or behavior not grounded in code or docs.
- Keep AGENTS.md concise, universal, and current.
- Put task-specific instructions in dedicated docs and link them here.
- This repo may have multiple active contributors; unusual or unexpected changes can be normal and are not automatically a problem.
