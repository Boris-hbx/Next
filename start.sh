#!/bin/sh
# Fix database file permissions on startup.
# The /data volume may have been initialized with root-owned files.
# This script runs as root to fix permissions, then starts the server as nextapp.
echo "[start.sh] Fixing /data permissions..."
chown -R nextapp:nextapp /data 2>/dev/null || true
chmod 664 /data/next.db* 2>/dev/null || true

# Pre-deploy backup: snapshot before new code runs
if [ -f /data/next.db ]; then
    mkdir -p /data/backups
    STAMP=$(date +%Y%m%d-%H%M%S)
    cp /data/next.db "/data/backups/pre-deploy-${STAMP}.db" 2>/dev/null && \
        echo "[start.sh] Pre-deploy backup: pre-deploy-${STAMP}.db" || \
        echo "[start.sh] Pre-deploy backup failed (non-fatal)"
    # Keep only last 10 pre-deploy backups
    ls -t /data/backups/pre-deploy-*.db 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null
fi

echo "[start.sh] Starting next-server as nextapp..."
exec gosu nextapp /app/next-server
