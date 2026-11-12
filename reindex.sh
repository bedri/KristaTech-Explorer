#!/bin/bash
set -e

# Path to the explorer database
DB_DIR="$HOME/.kristatech-explorer"
DB_PATH="$DB_DIR/explorer.db"
APP_NAME="krista-explorer"

echo "=== KristaTech Explorer Database Clean & Reindex Script ==="

# 1. Stop the running explorer service first so SQLite files are not locked or written to during deletion
echo "1. Stopping $APP_NAME on PM2..."
pm2 stop "$APP_NAME" >/dev/null 2>&1 || true

# Ensure no lingering KristaTech-Explorer node preview process holds the database open
pkill -f "/home/bedri/KristaTech-Explorer/.*/nuxt preview" 2>/dev/null || true
pkill -f "/home/bedri/KristaTech-Explorer/.output/server/index.mjs" 2>/dev/null || true
sleep 1

# 2. Delete the old database files (including WAL and SHM files)
if [ -f "$DB_PATH" ] || [ -f "${DB_PATH}-wal" ] || [ -f "${DB_PATH}-shm" ]; then
    echo "2. Deleting old database and lock files: $DB_PATH*..."
    rm -f "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm"
    echo "   Database and related files deleted successfully."
else
    echo "2. Database files not found at $DB_PATH, starting fresh."
fi

# 3. Re-create database directory if it doesn't exist
mkdir -p "$DB_DIR"

# 4. Restart the explorer server to trigger indexer
echo "3. Starting $APP_NAME on PM2 to trigger re-indexing..."
pm2 restart "$APP_NAME" --update-env

echo "4. Waiting for indexer to initialize and sync blocks..."
for i in {1..60}; do
    sleep 2
    STATUS_JSON=$(curl -s http://127.0.0.1:27799/api/status || true)
    if echo "$STATUS_JSON" | grep -q '"success":true'; then
        HEIGHT=$(echo "$STATUS_JSON" | grep -o '"height":[0-9]*' | head -n1 | cut -d: -f2)
        INDEXED=$(echo "$STATUS_JSON" | grep -o '"indexedHeight":[0-9]*' | head -n1 | cut -d: -f2)
        echo "   Progress: Indexed $INDEXED / $HEIGHT blocks..."
        if [ -n "$HEIGHT" ] && [ -n "$INDEXED" ] && [ "$INDEXED" -ge "$HEIGHT" ] && [ "$HEIGHT" -gt 0 ]; then
            echo "   Re-indexing completed! All $INDEXED blocks are indexed."
            break
        fi
    fi
done

echo "=========================================================="
