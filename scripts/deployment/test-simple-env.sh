#!/bin/bash

# Test simple d'intégration des secrets
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo "=== TEST D'INTÉGRATION DES SECRETS ==="
echo "Project Root: $PROJECT_ROOT"
echo ""

# Créer un répertoire de test
TEST_DIR="/tmp/test-env-$(date +%s)"
mkdir -p "$TEST_DIR"

echo "1. Copie de env.digitalocean comme base..."
if [ -f "$PROJECT_ROOT/env.digitalocean" ]; then
    cp "$PROJECT_ROOT/env.digitalocean" "$TEST_DIR/.env"
    echo "✅ env.digitalocean copié"
else
    echo "❌ env.digitalocean non trouvé"
    exit 1
fi

echo ""
echo "2. Intégration des secrets de production..."
if [ -f "$PROJECT_ROOT/secrets/production-secrets.env" ]; then
    # Lire les secrets et les ajouter au fichier .env
    while IFS='=' read -r key value; do
        # Ignorer les commentaires et lignes vides
        if [[ ! "$key" =~ ^[[:space:]]*# ]] && [[ -n "$key" ]]; then
            # Vérifier si la variable existe déjà dans .env
            if grep -q "^${key}=" "$TEST_DIR/.env"; then
                # Remplacer la valeur existante
                sed -i.bak "s/^${key}=.*/${key}=${value}/" "$TEST_DIR/.env"
            else
                # Ajouter la nouvelle variable
                echo "${key}=${value}" >> "$TEST_DIR/.env"
            fi
        fi
    done < "$PROJECT_ROOT/secrets/production-secrets.env"
    
    # Nettoyer le fichier de sauvegarde
    rm -f "$TEST_DIR/.env.bak"
    
    echo "✅ Secrets de production intégrés"
else
    echo "⚠️  Fichier de secrets de production non trouvé"
fi

echo ""
echo "3. Analyse du fichier .env créé..."
if [ -f "$TEST_DIR/.env" ]; then
    # Compter les variables
    TOTAL_VARS=$(grep -c "^[A-Z_][A-Z0-9_]*=" "$TEST_DIR/.env" 2>/dev/null || echo "0")
    echo "Nombre total de variables: $TOTAL_VARS"
    
    # Vérifier les variables importantes
    IMPORTANT_VARS=("TRAEFIK_USERS" "API_USERS" "JWT_SECRET" "MONGODB_PASSWORD" "REDIS_PASSWORD" "ADMIN_PASSWORD" "MEESHY_PASSWORD" "ATABETH_PASSWORD")
    
    echo ""
    echo "Variables importantes:"
    for var in "${IMPORTANT_VARS[@]}"; do
        if grep -q "^${var}=" "$TEST_DIR/.env"; then
            echo "✅ $var"
        else
            echo "❌ $var"
        fi
    done
    
    echo ""
    echo "4. Échantillon du fichier .env (premières 10 lignes):"
    head -10 "$TEST_DIR/.env" | sed 's/=.*/=***/'
    
    echo ""
    echo "5. Fichier .env créé: $TEST_DIR/.env"
    echo "Taille: $(wc -l < "$TEST_DIR/.env") lignes"
    
else
    echo "❌ Fichier .env non créé"
    exit 1
fi

echo ""
echo "=== TEST TERMINÉ ==="
echo "Fichier de test conservé: $TEST_DIR/.env"
echo "Pour le nettoyer: rm -rf $TEST_DIR"
