# Onboarding Flow

User's first experience - determines level and weak areas.

## Flow

### Step 1: Welcome
- "¡Hola! Let's find out your English level"
- Language selector (always Spanish for now)

### Step 2: Self-Assessment
Ask user to pick their approximate level with examples:

| Level | Description | Example |
|-------|-------------|---------|
| **Beginner** | "I know basic words" | Hello, goodbye, numbers |
| **Elementary** | "I can make simple sentences" | "I like coffee" |
| **Intermediate** | "I can have conversations" | "I went to the store yesterday" |
| **Upper-Int** | "I'm comfortable but make mistakes" | Complex sentences |
| **Advanced** | "I'm fluent, want to perfect it" | Idioms, nuances |

### Step 3: Diagnostic Questions
AI asks 5-10 quick questions that detect weak areas:

1. **Articles**: "I want ___ apple" (a/an/the)
2. **Verb tenses**: "Yesterday I ___ to school" (go/went/gone)
3. **False friends**: "Actually means..." (actualmente ≠ actually)
4. **Prepositions**: "I depend ___ you" (of/on/in)
5. **Pronunciation awareness**: Audio recognition (optional)

### Step 4: Goals
What do you want to learn English for?
- [ ] Travel
- [ ] Work/Business
- [ ] Studies
- [ ] Movies/Music
- [ ] General improvement

### Step 5: Profile Created
Save to local storage:
```json
{
  "name": "María",
  "level": "B1",
  "nativeLanguage": "es",
  "goals": ["work", "travel"],
  "weakAreas": ["articles", "present_perfect", "false_friends"],
  "createdAt": "2026-02-03"
}
```

## AI Prompt for Onboarding

```
You are an English tutor assessing a Spanish speaker.
Ask 5 diagnostic questions to detect their weak areas.
Focus on: articles, verb tenses, prepositions, false friends.
Keep questions short. Explain errors briefly in Spanish.
After 5 questions, summarize their level and weak areas as JSON.
```

## Token Optimization
- Onboarding is the ONLY time we do extensive AI conversation
- After this, we have user profile and don't need to re-assess
- Compress results into local storage immediately
