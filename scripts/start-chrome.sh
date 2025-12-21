#!/bin/bash

# Script to start Chrome with remote debugging using xvfb
# Usage: ./scripts/start-chrome.sh

CHROME_DEBUG_PORT=${CHROME_DEBUG_PORT:-9222}
USER_DATA_DIR=${CHROME_USER_DATA_DIR:-./chrome-data}

echo "🚀 Starting Chrome with remote debugging on port $CHROME_DEBUG_PORT"

# Check if xvfb is installed
if ! command -v xvfb-run &> /dev/null; then
    echo "⚠️  xvfb-run not found. Installing xvfb..."
    sudo apt-get update && sudo apt-get install -y xvfb
fi

# Create user data directory if it doesn't exist
mkdir -p "$USER_DATA_DIR"

# Start Chrome with xvfb
xvfb-run -a --server-args="-screen 0 1920x1080x24" \
  google-chrome \
  --remote-debugging-port=$CHROME_DEBUG_PORT \
  --no-sandbox \
  --disable-setuid-sandbox \
  --disable-dev-shm-usage \
  --disable-accelerated-2d-canvas \
  --disable-gpu \
  --window-size=1920,1080 \
  --disable-blink-features=AutomationControlled \
  --user-data-dir="$USER_DATA_DIR" \
  --disable-web-security \
  --disable-features=VizDisplayCompositor \
  https://gemini.google.com/app &

CHROME_PID=$!

echo "✅ Chrome started with PID: $CHROME_PID"
echo "📊 Debugging port: $CHROME_DEBUG_PORT"
echo "💾 User data directory: $USER_DATA_DIR"
echo ""
echo "To stop Chrome, run: kill $CHROME_PID"
echo "Or save PID: echo $CHROME_PID > chrome.pid"

# Save PID to file
echo $CHROME_PID > chrome.pid

