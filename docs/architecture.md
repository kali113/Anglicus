# Architecture

## System Overview

```
[Client Apps: Web + Android]
         │
         ├─► Tier 1: Cloudflare Worker (owner's keys)
         ├─► Tier 2: Direct API (BYOK)
         └─► Tier 3: Puter.js (free fallback)
```

## Components

- **Web App**: SvelteKit + Vite (PWA)
- **Android App**: Kotlin + Jetpack Compose
- **Backend**: Cloudflare Worker (free serverless)
- **Local Storage**: User profiles, mistakes, settings

## API Module Architecture

```
api/src/
├── index.ts           # Hono app entry point
├── routes/
│   ├── chat.ts        # AI chat completions with multi-provider failover
│   └── feedback.ts    # Email feedback via Resend
└── lib/
    ├── providers.ts   # Provider configs (12 AI services)
    ├── models.ts      # Model-to-provider mappings
    ├── response.ts    # JSON response utilities
    ├── cors.ts        # CORS middleware
    └── rate-limiter.ts # In-memory rate limiting (best-effort, per-isolate)
```

### Provider Priority (Failover Order)

1. OpenRouter - Full model access
2. Cerebras - Very fast, free tier
3. Mistral - Free tier available
4. Hugging Face - Free tier
5. Groq - Fast, free tier
6. Nvidia, Cohere, Gemini, Together

## Web App Architecture

```
web/src/
├── routes/            # SvelteKit pages
│   ├── +layout.svelte # Global layout + navbar
│   ├── +page.svelte   # Dashboard
│   ├── tutor/         # AI chat
│   └── settings/      # Configuration
└── lib/
    ├── components/    # Reusable UI
    │   ├── Card.svelte
    │   ├── StatCard.svelte
    │   └── NextLessonCard.svelte
    ├── storage/       # LocalStorage wrappers
    │   ├── base-store.ts    # Generic LocalStore<T>
    │   ├── user-store.ts
    │   └── settings-store.ts
    ├── ai/            # 3-tier AI client
    └── types/         # TypeScript interfaces
```

## Context Compression Strategy (Token Optimization)

### User Context Format (~100-200 tokens)

Send this compressed context with each AI request:

```
[USER]
Name: Maria | Level: B1 | Goal: Business English
Native: Spanish | Streak: 12 days

[WEAK AREAS]
- Articles (the/a): 45% accuracy
- Present perfect: 60% accuracy
- False friends: actualmente→currently

[RECENT ERRORS]
- "I am agree" → "I agree"
- "depend of" → "depend on"
- "make a question" → "ask a question"

[SESSION]
Topic: Job interviews | Mood: practicing
```

### What NOT to Send

- Full conversation history (summarize instead)
- Raw exercise logs (send stats only)
- Unchanged profile data (cache it)

### Conversation Memory

- Keep last 3-5 exchanges in context
- Summarize older conversation into 1-2 sentences
- Store full history locally, compress for AI

## Feedback System

```
User clicks "Report" → Cloudflare Worker → Email Service → Owner
                              ↓
                    OWNER_EMAIL env var (hidden)
```

Email services with free tier:

- Resend: 3k emails/month free
- SendGrid: 100 emails/day free

## Data Flow

See [security.md](security.md) for API key handling.
See [development-prompt.md](development-prompt.md) for full build spec.
