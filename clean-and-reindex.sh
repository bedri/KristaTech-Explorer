#!/bin/bash

# Path to the explorer database
DB_DIR="$HOME/.kristatech-explorer"
DB_PATH="$DB_DIR/explorer.db"

echo "=== KristaTech Explorer Database Clean & Reindex Script ==="

# 1. Stop any running nuxt dev server or other instances to prevent database locks
echo "1. Checking and killing any running Nuxt/Node development instances..."
pkill -f "nuxt dev" || true
pkill -f "nuxt" || true
pkill -f "node .output/server/index.mjs" || true
sleep 2

# 2. Delete the old database
if [ -f "$DB_PATH" ]; then
    echo "2. Deleting old database file: $DB_PATH..."
    rm -f "$DB_PATH"
    echo "   Database deleted successfully."
else
    echo "2. Database file not found at $DB_PATH, starting fresh."
fi

# 3. Re-create database directory if it doesn't exist
mkdir -p "$DB_DIR"

# 4. Restart the development server to trigger indexer
echo "3. Starting Nuxt development server to trigger re-indexing..."
echo "   The indexer will automatically start catching up from block 0 (Genesis block)."
echo "   Please wait a few seconds..."

# Start Nuxt in the background and redirect output to a log file
npm run dev > explorer_run.log 2>&1 &
NODE_PID=$!

echo "   Explorer started in the background (PID: $NODE_PID)."
echo "   You can view the logs in: Explorer/explorer_run.log"
echo "=========================================================="
