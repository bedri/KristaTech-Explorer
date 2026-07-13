#!/bin/bash

# Path to the explorer database
DB_DIR="$HOME/.kristatech-explorer"
DB_PATH="$DB_DIR/explorer.db"

echo "=== KristaTech Explorer Database Clean & Reindex Script ==="

# Delete the old database files (including WAL and SHM files)
if [ -f "$DB_PATH" ] || [ -f "${DB_PATH}-wal" ] || [ -f "${DB_PATH}-shm" ]; then
    echo "2. Deleting old database and lock files: $DB_PATH*..."
    rm -f "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm"
    echo "   Database and related files deleted successfully."
else
    echo "2. Database files not found at $DB_PATH, starting fresh."
fi

# 3. Re-create database directory if it doesn't exist
mkdir -p "$DB_DIR"

# 4. Restart the development server to trigger indexer
echo "3. Starting Nuxt development server to trigger re-indexing..."
echo "   The indexer will automatically start catching up from block 0 (Genesis block)."
echo "   Please wait a few seconds..."

pm2 restart krista-explorer --update-env

echo "=========================================================="
