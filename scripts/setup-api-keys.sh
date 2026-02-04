#!/bin/bash
# Quick setup script for Anglicus API with free API keys
# This script helps you get started quickly with free API providers

echo "========================================="
echo "Anglicus API - Quick Setup with Free Keys"
echo "========================================="
echo ""
echo "To use the Anglicus API, you need at least one API key from a provider."
echo "Here are some providers with FREE tiers:"
echo ""
echo "1. OpenRouter (RECOMMENDED - easiest to get started)"
echo "   - Sign up: https://openrouter.ai/"
echo "   - Get key: https://openrouter.ai/keys"
echo "   - Free models available (e.g., google/gemini-2.0-flash-exp:free)"
echo ""
echo "2. Groq (Very fast, free tier)"
echo "   - Sign up: https://console.groq.com/"
echo "   - Get key: https://console.groq.com/keys"
echo ""
echo "3. Google Gemini (Free tier)"
echo "   - Get key: https://makersuite.google.com/app/apikey"
echo ""
echo "4. Cerebras (Fast inference)"
echo "   - Sign up: https://cloud.cerebras.ai/"
echo ""
echo "========================================="
echo ""
echo "To add your API keys:"
echo "1. Open api/.dev.vars in a text editor"
echo "2. Replace the placeholder keys with your real keys"
echo "3. Save the file"
echo "4. Run: cd api && npm run dev"
echo ""
echo "Example:"
echo "  OPENROUTER_API_KEY=sk-or-v1-abc123..."
echo "  GROQ_API_KEY=gsk_abc123..."
echo ""
echo "========================================="
echo ""

# Check if .dev.vars exists
if [ ! -f "api/.dev.vars" ]; then
    echo "ERROR: api/.dev.vars file not found!"
    echo "Please run this script from the repository root."
    exit 1
fi

echo "✓ Found api/.dev.vars file"
echo ""

# Check if any real API keys are configured
if grep -q "your-.*-key-here" "api/.dev.vars"; then
    echo "⚠ WARNING: Placeholder keys detected in .dev.vars"
    echo "  Please replace them with your real API keys."
    echo ""
else
    echo "✓ .dev.vars appears to have real keys configured"
    echo ""
fi

# Check if API is running
if curl -s http://localhost:8787/ > /dev/null 2>&1; then
    echo "✓ API is running at http://localhost:8787"
    echo ""
    
    # Test the API
    echo "Testing API connection..."
    response=$(curl -s http://localhost:8787/)
    if echo "$response" | grep -q "ok"; then
        echo "✓ API health check passed!"
    else
        echo "✗ API health check failed"
    fi
else
    echo "✗ API is not running"
    echo ""
    echo "To start the API:"
    echo "  cd api && npm run dev"
fi

echo ""
echo "========================================="
echo "Next Steps:"
echo "1. Get free API keys from the providers above"
echo "2. Add them to api/.dev.vars"
echo "3. Run: cd api && npm run dev"
echo "4. Test: curl http://localhost:8787/"
echo "========================================="
