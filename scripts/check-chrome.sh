#!/bin/bash

# Check if Chrome is running on the debug port
CHROME_DEBUG_PORT=${CHROME_DEBUG_PORT:-9222}

echo "🔍 Checking Chrome connection on port $CHROME_DEBUG_PORT..."

if curl -s "http://localhost:$CHROME_DEBUG_PORT/json/version" > /dev/null 2>&1; then
    echo "✅ Chrome is running and accessible on port $CHROME_DEBUG_PORT"
    echo ""
    echo "Chrome version info:"
    curl -s "http://localhost:$CHROME_DEBUG_PORT/json/version" | python3 -m json.tool 2>/dev/null || curl -s "http://localhost:$CHROME_DEBUG_PORT/json/version"
else
    echo "❌ Chrome is not running on port $CHROME_DEBUG_PORT"
    echo ""
    echo "To start Chrome, run:"
    echo "  ./scripts/start-chrome.sh"
    exit 1
fi

