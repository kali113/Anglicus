#!/bin/bash
# Test API Connection Script
# This script tests if your API keys are working correctly

echo "========================================"
echo "Anglicus API Connection Test"
echo "========================================"
echo ""

# Check if API is running
echo "1. Checking if API is running..."
if curl -s http://localhost:8787/ > /dev/null 2>&1; then
    response=$(curl -s http://localhost:8787/)
    if echo "$response" | grep -q "ok"; then
        echo "   ✓ API is running at http://localhost:8787"
    else
        echo "   ✗ API returned unexpected response"
        exit 1
    fi
else
    echo "   ✗ API is not running"
    echo ""
    echo "   To start the API:"
    echo "   cd api && npm run dev"
    exit 1
fi

echo ""
echo "2. Testing chat completion..."

# Test chat completion
response=$(curl -s -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-8b",
    "messages": [{"role": "user", "content": "Say hello!"}],
    "max_tokens": 10
  }')

# Check if we got an error or success
if echo "$response" | grep -q '"error"'; then
    echo "   ✗ API returned an error:"
    error_message=$(echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin)['error']['message'])" 2>/dev/null || echo "Unknown error")
    echo "   $error_message"
    echo ""
    
    if echo "$error_message" | grep -q "No API keys configured"; then
        echo "   ACTION REQUIRED:"
        echo "   1. Get a free API key from https://openrouter.ai/keys"
        echo "   2. Add it to api/.dev.vars:"
        echo "      OPENROUTER_API_KEY=sk-or-v1-your-key-here"
        echo "   3. Restart the API: cd api && npm run dev"
    elif echo "$error_message" | grep -q "All providers failed"; then
        echo "   This might mean:"
        echo "   - API keys are invalid or expired"
        echo "   - All providers are rate-limited"
        echo "   - Network connectivity issues"
        echo ""
        echo "   Check your API keys in api/.dev.vars"
    fi
    
    exit 1
elif echo "$response" | grep -q '"content"'; then
    content=$(echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin)['choices'][0]['message']['content'])" 2>/dev/null || echo "")
    provider=$(echo "$response" | python3 -c "import sys, json; import json; d=json.load(sys.stdin); print(d.get('provider', 'unknown'))" 2>/dev/null || echo "unknown")
    
    echo "   ✓ API is working!"
    echo "   Response: $content"
    echo "   Provider used: $provider"
    echo ""
    echo "========================================"
    echo "SUCCESS! Your API is configured correctly!"
    echo "========================================"
    echo ""
    echo "Next steps:"
    echo "1. Start the web app: cd web && npm run dev"
    echo "2. Open http://localhost:5173/settings"
    echo "3. Click 'Probar Servidor' - should show ✅"
    exit 0
else
    echo "   ✗ Unexpected response format"
    echo "   Response: $response"
    exit 1
fi
