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

- **Web App**: React/Next.js or similar
- **Android App**: Kotlin + Jetpack Compose
- **Backend**: Cloudflare Worker (free serverless)
- **Local Storage**: User profiles, mistakes, settings

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
