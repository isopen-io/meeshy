#!/bin/bash

# Test qui simule exactement ce que fait le script original

set -e

# Charger la configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

IP="157.230.15.51"
DOMAIN="localhost"

echo "=== TEST PREPARE FILES ==="
echo "IP: $IP"
echo "DOMAIN: $DOMAIN"

# Simuler la fonction prepare_essential_files
echo "Creating deploy directory..."
deploy_dir="$DEPLOY_TEMP_DIR/meeshy-deploy-test-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$deploy_dir"
echo "Deploy dir: $deploy_dir"

# Copier le fichier Docker Compose
echo "Copying Docker Compose file..."
if [ -f "$PROJECT_ROOT/$DOCKER_COMPOSE_FILE" ]; then
    cp "$PROJECT_ROOT/$DOCKER_COMPOSE_FILE" "$deploy_dir/docker-compose.yml"
    echo "✅ Docker Compose file copied"
else
    echo "❌ Docker Compose file not found"
    exit 1
fi

# Créer un fichier .env simple
echo "Creating .env file..."
echo "NODE_ENV=production" > "$deploy_dir/.env"
echo "✅ .env file created"

# Tester la commande SCP
echo "Testing SCP command..."
echo "Command: scp -o StrictHostKeyChecking=no \"$deploy_dir/docker-compose.yml\" root@$IP:/tmp/test-compose.yml"

scp -o StrictHostKeyChecking=no "$deploy_dir/docker-compose.yml" root@$IP:/tmp/test-compose.yml

if [ $? -eq 0 ]; then
    echo "✅ SCP command successful"
else
    echo "❌ SCP command failed"
fi

# Nettoyer
rm -rf "$deploy_dir"
echo "=== TEST COMPLETED ==="
