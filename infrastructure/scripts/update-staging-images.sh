#!/bin/bash
# =============================================================================
# SCRIPT URGENT: Mise à jour images Docker staging avec latest
# =============================================================================

set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-root@meeshy.me}"
STAGING_DIR="/opt/meeshy/staging"

echo "🔄 Mise à jour des images Docker staging vers latest..."

ssh "$REMOTE_HOST" "cd $STAGING_DIR && docker compose pull && docker compose up -d"

echo "✅ Images staging mises à jour et services redémarrés"
