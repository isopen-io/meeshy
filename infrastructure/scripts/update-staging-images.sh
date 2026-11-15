#!/bin/bash
# =============================================================================
# SCRIPT URGENT: Mise à jour images Docker staging avec latest
# =============================================================================

set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-root@meeshy.me}"
STAGING_DIR="/opt/meeshy/staging"

echo "🔄 Mise à jour des images Docker staging vers latest..."

# Purge NON INTERACTIVE avant le pull (#6556). `docker image prune` demande
# `y/N` : sans `-f`, et sans terminal au bout du `ssh`, la confirmation vide
# se lit « N » et rien n'est retiré. La purge précède le pull — après, elle
# arrive trop tard : c'est l'écriture des couches qui manque de place.
# `image prune -a` épargne toujours les images portées par un conteneur.
ssh "$REMOTE_HOST" "docker image prune -f || true; docker image prune -af --filter 'until=168h' || true"

ssh "$REMOTE_HOST" "cd $STAGING_DIR && docker compose pull && docker compose up -d"

echo "✅ Images staging mises à jour et services redémarrés"
