# SEO Guide

This document defines the SEO contract for Anglicus public pages.

## Indexable routes

Only these routes are indexable:

- `/en/`
- `/es/`
- `/en/legal/`
- `/es/legal/`

All other routes must remain `noindex,follow`.

## Canonical and hreflang policy

- Use trailing-slash canonical URLs for indexable localized pages.
- Keep root canonical as `https://kali113.github.io/Anglicus/`.
- Emit `hreflang` links for `en`, `es`, and `x-default`.
- Home `x-default` points to `/`.
- Legal `x-default` points to `/en/legal/`.

## Locale SSR policy

- Route locale is sourced from route data (`/en` and `/es` layout loaders).
- Server-rendered HTML `lang` must match route locale.
- Client bootstrap may infer locale for non-localized URLs, but localized paths win.

## Structured data policy

For indexable localized pages, include:

- `Organization` schema
- `WebSite` schema with route locale `inLanguage`

## Validation commands

Run these before release:

```bash
cd web && npm run check
cd web && npm run test
cd web && GITHUB_PAGES=true npm run build
cd web && npm run test:seo
```

`test:seo` validates generated HTML in `web/build` for lang, robots, canonical, hreflang, and JSON-LD.
