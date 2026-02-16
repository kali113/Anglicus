# AGENTS.md

## WHY
Anglicus is an AI English tutor for Spanish speakers.
The repository contains the production web app, API router, and platform wrappers that deliver that experience.

## WHAT
TypeScript monorepo:
- `web/`: SvelteKit + Vite PWA frontend.
- `api/`: Cloudflare Workers + Hono API router for AI providers.
- `docs/`: Product and technical documentation (ES/EN).
- `desktop/`: Electron packaging.
- `twa/`: Trusted Web Activity assets.

## HOW (Default Working Agreement)
1. Understand task scope, then inspect only relevant files.
2. Prefer deterministic checks before subjective review.
3. Make the smallest safe change that solves the task and preserves existing intent.
4. Validate with the project commands below.
5. Report exactly what changed, what was validated, and any remaining risk.

## Verification Commands
- Lint/typecheck (`web`): `cd web && npm run check`
- Format: `echo "No formatter script configured in this repository"`
- Tests: `cd web && npm run test && cd ../api && npm run test -- --run`
- Build (`web`): `cd web && npm run build`

## Progressive Disclosure (Read Only If Relevant)
Use these docs as needed for deeper guidance instead of loading everything by default:
- `PROMPT.md`: Consolidated review workflow and outputs.
- `agent_docs/review_methodology.md`: 7-phase review flow.
- `agent_docs/analysis_lenses.md`: analysis angles for deep reviews.
- `agent_docs/quality_checklist.md`: pass/fail validation gate.
- `agent_docs/standards.md`: output and evidence standards.

## Guardrails
- Do not invent architecture or behavior that is not grounded in the code or docs.
- Treat AGENTS.md as high-priority, always-on context: keep it short, universal, and current.
- Put task-specific instructions in dedicated docs and reference them here.