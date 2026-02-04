# How to Get Your API Working in 5 Minutes

## Step 1: Get a Free API Key (Choose One)

### Option A: OpenRouter (RECOMMENDED - Easiest)
1. Go to https://openrouter.ai/
2. Sign up (free, no credit card required)
3. Go to https://openrouter.ai/keys
4. Click "Create Key"
5. Copy your key (starts with `sk-or-v1-...`)

### Option B: Groq (Fast, Free)
1. Go to https://console.groq.com/
2. Sign up (free, no credit card required)
3. Go to https://console.groq.com/keys
4. Create a new key
5. Copy your key (starts with `gsk_...`)

### Option C: Google Gemini (Free)
1. Go to https://makersuite.google.com/app/apikey
2. Sign in with Google
3. Create API key
4. Copy your key

## Step 2: Add Your Key

Open the file `api/.dev.vars` and replace the placeholder with your real key:

**For OpenRouter:**
```bash
OPENROUTER_API_KEY=sk-or-v1-YOUR-ACTUAL-KEY-HERE
```

**For Groq:**
```bash
GROQ_API_KEY=gsk_YOUR-ACTUAL-KEY-HERE
```

**For Gemini:**
```bash
GEMINI_API_KEY=YOUR-ACTUAL-KEY-HERE
```

## Step 3: Start the API

```bash
cd api
npm run dev
```

Wait for "Ready on http://localhost:8787"

## Step 4: Test It!

### From Terminal:
```bash
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-8b",
    "messages": [{"role": "user", "content": "Say hello!"}]
  }'
```

### From Web App:
1. Open http://localhost:5173/settings in your browser
2. Click "Probar Servidor" button
3. Should show "✅ Funciona" instead of "❌ Falló"

## Troubleshooting

**Still showing "❌ Falló"?**
- Make sure you replaced the placeholder key with your REAL key
- Make sure there are no extra spaces around the key
- Restart the API after changing `.dev.vars`

**"No API keys configured" error?**
- Check that `.dev.vars` file exists in the `api/` folder
- Make sure the key name matches (e.g., `OPENROUTER_API_KEY`, not `OPENROUTER_KEY`)

**"Invalid API key" error?**
- Double-check you copied the full key
- Make sure the key is active/not revoked
- Try generating a new key

## Using Free Models

With OpenRouter, you can use completely free models:

```bash
# Free Gemini 2.0 Flash
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-2.0-flash-exp:free",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Free Llama 3.1 8B
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta-llama/llama-3.1-8b-instruct:free",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Multiple Keys for Better Reliability

You can add multiple API keys. The router will automatically switch if one is rate-limited:

```bash
# In api/.dev.vars
OPENROUTER_API_KEY=sk-or-v1-your-key
GROQ_API_KEY=gsk_your-groq-key
CEREBRAS_API_KEY=your-cerebras-key
GEMINI_API_KEY=your-gemini-key
```

The API tries them in order and switches automatically when needed!
