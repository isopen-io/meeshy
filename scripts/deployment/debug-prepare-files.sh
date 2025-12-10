#!/bin/bash

# Script de debug pour diagnostiquer le problème de préparation des fichiers

set -e

# Charger la configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

IP="157.230.15.51"

echo "=== DEBUG PREPARATION FILES ==="
echo "IP: $IP"
echo "PROJECT_ROOT: $PROJECT_ROOT"
echo "DOCKER_COMPOSE_FILE: $DOCKER_COMPOSE_FILE"
echo "DEPLOY_TEMP_DIR: $DEPLOY_TEMP_DIR"

# Créer le répertoire temporaire
deploy_dir="$DEPLOY_TEMP_DIR/meeshy-deploy-debug-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$deploy_dir"
echo "Deploy dir: $deploy_dir"

# Vérifier si le fichier source existe
source_file="$PROJECT_ROOT/$DOCKER_COMPOSE_FILE"
echo "Source file: $source_file"
if [ -f "$source_file" ]; then
    echo "✅ Source file exists"
    ls -la "$source_file"
else
    echo "❌ Source file does not exist"
    exit 1
fi

# Copier le fichier
target_file="$deploy_dir/docker-compose.yml"
echo "Target file: $target_file"
cp "$source_file" "$target_file"

if [ -f "$target_file" ]; then
    echo "✅ Target file created"
    ls -la "$target_file"
else
    echo "❌ Target file not created"
    exit 1
fi

# Tester la commande SCP
echo "Testing SCP command..."
echo "Command: scp -o StrictHostKeyChecking=no \"$target_file\" root@$IP:/tmp/test-compose.yml"

scp -o StrictHostKeyChecking=no "$target_file" root@$IP:/tmp/test-compose.yml

if [ $? -eq 0 ]; then
    echo "✅ SCP command successful"
else
    echo "❌ SCP command failed"
fi

# Nettoyer
rm -rf "$deploy_dir"
echo "=== DEBUG COMPLETED ==="
