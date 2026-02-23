#!/bin/sh
# Fix database file permissions on startup.
# The /data volume may have been initialized with root-owned files.
# This script runs as root to fix permissions, then starts the server as nextapp.
echo "[start.sh] Fixing /data permissions..."
chown -R nextapp:nextapp /data 2>/dev/null || true
chmod 664 /data/next.db* 2>/dev/null || true
echo "[start.sh] Starting next-server as nextapp..."
exec gosu nextapp /app/next-server
