#!/bin/bash
# =============================================================================
# Script de synchronisation des dépendances depuis le container de production
# =============================================================================
# Usage:
#   ./scripts/sync-prod-deps.sh
#   ou depuis production: ssh root@meeshy.me 'docker exec meeshy-translator pip list --format=freeze'
# =============================================================================

set -e

CONTAINER_NAME="${1:-meeshy-translator}"
SSH_HOST="${2:-root@meeshy.me}"
OUTPUT_FILE="services/translator/requirements-from-prod.txt"

echo "🔍 Récupération des dépendances depuis le container de production..."
echo "   Container: $CONTAINER_NAME"
echo "   Host: $SSH_HOST"
echo ""

# Récupérer la liste des packages depuis le container de production
echo "📦 Extraction de pip freeze depuis le container..."
if [[ -n "$SSH_HOST" ]]; then
    # Via SSH
    ssh "$SSH_HOST" "docker exec $CONTAINER_NAME pip freeze" > "$OUTPUT_FILE"
else
    # Local
    docker exec "$CONTAINER_NAME" pip freeze > "$OUTPUT_FILE"
fi

echo "✅ Dépendances extraites dans: $OUTPUT_FILE"
echo ""

# Afficher un résumé des packages critiques
echo "📋 Packages critiques installés en production:"
echo ""

critical_packages=(
    "torch"
    "torchaudio"
    "transformers"
    "numpy"
    "chatterbox-tts"
    "espnet"
    "faster-whisper"
    "fastapi"
    "uvicorn"
    "prisma"
    "pyzmq"
    "grpcio"
)

for pkg in "${critical_packages[@]}"; do
    version=$(grep -i "^$pkg==" "$OUTPUT_FILE" 2>/dev/null || echo "❌ Non trouvé")
    if [[ "$version" != "❌ Non trouvé" ]]; then
        echo "  ✓ $version"
    else
        echo "  $version: $pkg"
    fi
done

echo ""
echo "💡 Prochaines étapes:"
echo "  1. Examiner: cat $OUTPUT_FILE"
echo "  2. Comparer avec: services/translator/requirements.txt"
echo "  3. Mettre à jour requirements.txt avec les bonnes versions"
echo ""
