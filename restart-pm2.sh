#!/bin/bash

echo "=== Restarting krista-explorer on PM2 with updated environment variables ==="
pm2 restart krista-explorer --update-env
echo "=========================================================================="
