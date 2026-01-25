#!/bin/bash
# =============================================================================
# MEESHY STAGING - Script de Destruction
# =============================================================================
# Description: Supprime complètement l'environnement staging
# Usage: ./infrastructure/scripts/teardown-staging.sh
# ATTENTION: Cette action est DESTRUCTIVE et IRREVERSIBLE
# =============================================================================

set -euo pipefail

REMOTE_HOST="root@meeshy.me"
STAGING_DIR="/opt/meeshy/staging"

echo "🗑️  Suppression de l'environnement STAGING..."
echo ""
echo "⚠️  ATTENTION: Cette action va:"
echo "   - Arrêter tous les services staging"
echo "   - Supprimer tous les volumes staging (données perdues)"
echo "   - Supprimer le réseau staging"
echo "   - Supprimer les fichiers de configuration staging"
echo ""

read -p "Êtes-vous ABSOLUMENT SÛR de vouloir supprimer staging? (oui/non): " confirm1

if [ "$confirm1" != "oui" ]; then
    echo "Annulé."
    exit 0
fi

read -p "Taper 'DELETE-STAGING' pour confirmer: " confirm2

if [ "$confirm2" != "DELETE-STAGING" ]; then
    echo "Confirmation incorrecte. Annulé."
    exit 0
fi

echo ""
echo "🛑 Destruction en cours..."
echo ""

# =============================================================================
# ÉTAPE 1: ARRÊTER LES SERVICES
# =============================================================================

echo "🛑 Arrêt des services staging..."

ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose down -v 2>/dev/null || echo 'Services déjà arrêtés'"

echo "✅ Services arrêtés"
echo ""

# =============================================================================
# ÉTAPE 2: SUPPRIMER LES VOLUMES
# =============================================================================

echo "🗑️  Suppression des volumes staging..."

VOLUMES=(
    "meeshy-staging-database-data"
    "meeshy-staging-database-config"
    "meeshy-staging-redis-data"
    "meeshy-staging-redis-ui-data"
    "meeshy-staging-traefik-certs"
    "meeshy-staging-models-data"
    "meeshy-staging-gateway-uploads"
    "meeshy-staging-web-uploads"
)

for volume in "${VOLUMES[@]}"; do
    echo "   → Suppression $volume..."
    ssh $REMOTE_HOST "docker volume rm $volume 2>/dev/null || echo '   Volume n'\''existe pas'"
done

echo "✅ Volumes supprimés"
echo ""

# =============================================================================
# ÉTAPE 3: SUPPRIMER LE RÉSEAU
# =============================================================================

echo "🗑️  Suppression du réseau staging..."

ssh $REMOTE_HOST "docker network rm meeshy-staging-network 2>/dev/null || echo 'Réseau déjà supprimé'"

echo "✅ Réseau supprimé"
echo ""

# =============================================================================
# ÉTAPE 4: OPTIONNEL - SUPPRIMER LES FICHIERS DE CONFIGURATION
# =============================================================================

echo "📁 Suppression des fichiers de configuration..."
read -p "Supprimer aussi les fichiers de configuration? (oui/non): " delete_files

if [ "$delete_files" = "oui" ]; then
    echo "   Suppression $STAGING_DIR..."
    ssh $REMOTE_HOST "rm -rf $STAGING_DIR"
    echo "✅ Fichiers supprimés"
else
    echo "⏭️  Fichiers de configuration conservés dans $STAGING_DIR"
fi

echo ""

# =============================================================================
# ÉTAPE 5: NETTOYER LES IMAGES NON UTILISÉES (OPTIONNEL)
# =============================================================================

echo "🐋 Nettoyage des images Docker non utilisées..."
read -p "Nettoyer les images Docker non utilisées? (oui/non): " prune_images

if [ "$prune_images" = "oui" ]; then
    echo "   Suppression des images non utilisées..."
    ssh $REMOTE_HOST "docker image prune -f"
    echo "✅ Images nettoyées"
else
    echo "⏭️  Images conservées"
fi

echo ""

# =============================================================================
# RÉSUMÉ
# =============================================================================

echo "=" | tr -d '\n' | head -c 80; echo
echo "✅ STAGING SUPPRIMÉ AVEC SUCCÈS!"
echo "=" | tr -d '\n' | head -c 80; echo
echo ""
echo "📊 Résumé:"
echo "   - Services arrêtés: ✅"
echo "   - Volumes supprimés: ✅"
echo "   - Réseau supprimé: ✅"

if [ "$delete_files" = "oui" ]; then
    echo "   - Fichiers supprimés: ✅"
else
    echo "   - Fichiers conservés: ⏭️  ($STAGING_DIR)"
fi

echo ""
echo "🌐 URLs staging ne sont plus accessibles:"
echo "   - https://staging.meeshy.me"
echo "   - https://gate.staging.meeshy.me"
echo "   - https://ml.staging.meeshy.me"
echo ""
echo "📝 Pour redéployer staging:"
echo "   ./infrastructure/scripts/deploy-staging.sh"
echo ""
