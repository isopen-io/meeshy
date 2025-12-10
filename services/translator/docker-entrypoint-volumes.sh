#!/bin/bash
# Script d'initialisation des volumes avec permissions correctes
# Meeshy Translator - FastAPI Service

set -euo pipefail

echo "🔧 Initialisation des volumes avec permissions correctes..."

# Fonction pour corriger les permissions d'un répertoire
fix_permissions() {
    local dir="$1"
    local description="$2"
    
    if [ -d "$dir" ]; then
        echo "  • Correction des permissions pour $description ($dir)..."
        # S'assurer que le répertoire existe et a les bonnes permissions
        mkdir -p "$dir"
        chown -R 42420:42420 "$dir" 2>/dev/null || true
        chmod -R 755 "$dir" 2>/dev/null || true
        echo "    ✅ Permissions corrigées pour $description"
    else
        echo "  • Création et configuration de $description ($dir)..."
        mkdir -p "$dir"
        chown -R 42420:42420 "$dir"
        chmod -R 755 "$dir"
        echo "    ✅ $description créé et configuré"
    fi
}

# Correction des permissions pour tous les volumes critiques
fix_permissions "/workspace/models" "volume translator_models"
fix_permissions "/workspace/cache" "volume translator_cache"
fix_permissions "/workspace/generated" "volume translator_generated"
fix_permissions "/workspace/logs" "répertoire de logs"

# Vérification des permissions
echo "🔍 Vérification des permissions des volumes..."
for dir in "/workspace/models" "/workspace/cache" "/workspace/generated" "/workspace/logs"; do
    if [ -d "$dir" ]; then
        perms=$(ls -ld "$dir" | awk '{print $1, $3, $4}')
        echo "  • $dir: $perms"
    fi
done

echo "✅ Initialisation des volumes terminée"

# Exécution du script principal de démarrage
echo "🚀 Démarrage du service translator..."
exec /workspace/docker-entrypoint-mongodb.sh "$@"
