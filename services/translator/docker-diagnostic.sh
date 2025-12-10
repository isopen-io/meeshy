#!/bin/bash

echo "🔍 Diagnostic du service Translator - Vérification des permissions Prisma"
echo "=================================================================="

# Vérifier l'utilisateur actuel
echo "👤 Utilisateur actuel: $(whoami)"
echo "👥 Groupe actuel: $(groups)"
echo "🏠 Répertoire de travail: $(pwd)"

# Vérifier les variables d'environnement Prisma
echo ""
echo "🔧 Variables d'environnement Prisma:"
echo "DATABASE_URL: ${DATABASE_URL:-Non définie}"
echo "PRISMA_QUERY_ENGINE_BINARY: ${PRISMA_QUERY_ENGINE_BINARY:-Non définie}"
echo "PRISMA_QUERY_ENGINE_LIBRARY: ${PRISMA_QUERY_ENGINE_LIBRARY:-Non définie}"

# Vérifier les répertoires de cache Prisma
echo ""
echo "📁 Vérification des répertoires de cache Prisma:"

# Cache dans /root/.cache (problématique)
if [ -d "/root/.cache/prisma-python" ]; then
    echo "❌ Cache trouvé dans /root/.cache/prisma-python (problématique):"
    ls -la /root/.cache/prisma-python/binaries/ 2>/dev/null || echo "  - Répertoire inaccessible"
else
    echo "✅ Aucun cache dans /root/.cache/prisma-python"
fi

# Cache dans /app/.cache (correct)
if [ -d "/app/.cache/prisma-python" ]; then
    echo "✅ Cache trouvé dans /app/.cache/prisma-python:"
    ls -la /app/.cache/prisma-python/binaries/ 2>/dev/null || echo "  - Répertoire inaccessible"
else
    echo "⚠️ Aucun cache dans /app/.cache/prisma-python"
fi

# Cache dans le répertoire utilisateur
if [ -d "$HOME/.cache/prisma-python" ]; then
    echo "✅ Cache trouvé dans $HOME/.cache/prisma-python:"
    ls -la $HOME/.cache/prisma-python/binaries/ 2>/dev/null || echo "  - Répertoire inaccessible"
else
    echo "⚠️ Aucun cache dans $HOME/.cache/prisma-python"
fi

# Vérifier les permissions des binaires Prisma
echo ""
echo "🔐 Vérification des permissions des binaires Prisma:"

# Chercher les binaires Prisma dans tous les emplacements possibles
PRISMA_BINARIES=(
    "/root/.cache/prisma-python/binaries/*/node_modules/prisma/query-engine-*"
    "/app/.cache/prisma-python/binaries/*/node_modules/prisma/query-engine-*"
    "$HOME/.cache/prisma-python/binaries/*/node_modules/prisma/query-engine-*"
    "/usr/local/lib/python3.12/site-packages/prisma/binaries/*/node_modules/prisma/query-engine-*"
)

for pattern in "${PRISMA_BINARIES[@]}"; do
    for binary in $pattern; do
        if [ -f "$binary" ]; then
            echo "📄 Binaire trouvé: $binary"
            echo "   Permissions: $(ls -la "$binary")"
            echo "   Propriétaire: $(stat -c '%U:%G' "$binary")"
            echo "   Exécutable: $([ -x "$binary" ] && echo "✅ Oui" || echo "❌ Non")"
            echo ""
        fi
    done
done

# Vérifier le client Prisma généré
echo "📦 Vérification du client Prisma généré:"

if [ -d "/app/generated/prisma" ]; then
    echo "✅ Client Prisma trouvé dans /app/generated/prisma:"
    ls -la /app/generated/prisma/
    echo ""
else
    echo "❌ Client Prisma non trouvé dans /app/generated/prisma"
fi

if [ -d "/usr/local/lib/python3.12/site-packages/prisma" ]; then
    echo "✅ Client Prisma trouvé dans /usr/local/lib/python3.12/site-packages/prisma:"
    ls -la /usr/local/lib/python3.12/site-packages/prisma/
    echo ""
else
    echo "❌ Client Prisma non trouvé dans /usr/local/lib/python3.12/site-packages/prisma"
fi

# Test de connexion à la base de données
echo "🗄️ Test de connexion à la base de données:"
if [ -n "$DATABASE_URL" ]; then
    DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
    DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
    DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
    
    echo "   Host: $DB_HOST"
    echo "   Port: $DB_PORT"
    echo "   Database: $DB_NAME"
    echo "   User: $DB_USER"
    
    if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
        echo "   ✅ Connexion réussie"
    else
        echo "   ❌ Connexion échouée"
    fi
else
    echo "   ⚠️ DATABASE_URL non définie"
fi

echo ""
echo "🔍 Diagnostic terminé"
