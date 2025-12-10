#!/bin/bash

# ===== MEESHY - MISE À JOUR PRISMA SIMPLE =====
# Script pour mettre à jour les services avec les nouvelles images Docker
# Usage: ./deploy-prisma-simple.sh [DROPLET_IP]

set -e

DROPLET_IP="${1:-157.230.15.51}"

echo "🔄 Mise à jour Prisma sur le serveur de production..."
echo "📍 Serveur: $DROPLET_IP"
echo ""

# Étape 1: Mettre à jour le schema Prisma sur le serveur
echo "📤 Copie du nouveau schema Prisma..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

scp -o StrictHostKeyChecking=no \
    "$PROJECT_ROOT/shared/schema.prisma" \
    "root@$DROPLET_IP:/opt/meeshy/shared/schema.prisma"

echo "✅ Schema Prisma mis à jour"
echo ""

# Étape 2: Utiliser meeshy.sh update pour mettre à jour les services
echo "🔄 Mise à jour des services via meeshy.sh..."
ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'EOF'
cd /opt/meeshy
./meeshy.sh update
EOF

echo ""
echo "✅ Mise à jour terminée!"
echo ""
echo "📋 Vérification des services:"
ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'EOF'
cd /opt/meeshy
docker compose ps meeshy-gateway meeshy-translator
EOF

echo ""
echo "🎉 Migration Prisma terminée avec succès!"
