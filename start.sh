#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Starting Qwen Local Chat project services..."

# 1. Check and start Ollama
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✅ Ollama service is already running."
else
    echo "⚙️  Starting Ollama service in background..."
    ollama serve > /dev/null 2>&1 &
    
    echo "⌛ Waiting for Ollama server to initialize..."
    RETRIES=15
    until curl -s http://localhost:11434/api/tags > /dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
        sleep 1
        RETRIES=$((RETRIES - 1))
    done

    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "✅ Ollama started successfully."
    else
        echo "⚠️  Warning: Ollama service did not respond within timeout. Ensure 'ollama' is installed."
    fi
fi

# 2. Check Prisma / SQLite database
if [ ! -f "dev.db" ] && [ ! -f "prisma/dev.db" ]; then
    echo "📦 Initializing database schema with Prisma..."
    npx prisma db push
fi

# 3. Start Next.js Development Server
echo "🌐 Starting Next.js server on http://localhost:3000..."
npm run dev
