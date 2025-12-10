#!/bin/bash

# Test de la fonction create_production_env_file

set -e

# Charger la configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

echo "=== TEST CREATE PRODUCTION ENV FILE ==="

# Créer un répertoire de test
test_dir="/tmp/test-env-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$test_dir"
echo "Test dir: $test_dir"

# Vérifier si env.digitalocean existe
if [ -f "$PROJECT_ROOT/env.digitalocean" ]; then
    echo "✅ env.digitalocean exists"
    cp "$PROJECT_ROOT/env.digitalocean" "$test_dir/.env"
    echo "✅ env.digitalocean copied"
else
    echo "❌ env.digitalocean not found"
    touch "$test_dir/.env"
fi

# Vérifier si production-secrets.env existe
if [ -f "$PROJECT_ROOT/secrets/production-secrets.env" ]; then
    echo "✅ production-secrets.env exists"
    
    # Tester l'intégration des secrets
    echo "Testing secrets integration..."
    while IFS='=' read -r key value; do
        # Ignorer les commentaires et lignes vides
        if [[ ! "$key" =~ ^[[:space:]]*# ]] && [[ -n "$key" ]]; then
            echo "Processing: $key"
            # Échapper les caractères spéciaux dans la valeur
            escaped_value=$(printf '%s\n' "$value" | sed 's/[[\.*^$()+?{|]/\\&/g')
            
            # Vérifier si la variable existe déjà dans .env
            if grep -q "^${key}=" "$test_dir/.env"; then
                # Remplacer la valeur existante
                sed -i.bak "s/^${key}=.*/${key}=${escaped_value}/" "$test_dir/.env"
            else
                # Ajouter la nouvelle variable
                echo "${key}=${escaped_value}" >> "$test_dir/.env"
            fi
        fi
    done < "$PROJECT_ROOT/secrets/production-secrets.env"
    
    # Nettoyer le fichier de sauvegarde
    rm -f "$test_dir/.env.bak"
    
    echo "✅ Secrets integrated"
else
    echo "❌ production-secrets.env not found"
fi

# Vérifier le fichier final
if [ -f "$test_dir/.env" ]; then
    echo "✅ .env file created successfully"
    echo "File size: $(wc -l < "$test_dir/.env") lines"
    echo "First 10 lines:"
    head -10 "$test_dir/.env"
else
    echo "❌ .env file not created"
fi

# Nettoyer
rm -rf "$test_dir"
echo "=== TEST COMPLETED ==="
