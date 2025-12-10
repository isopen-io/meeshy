#!/bin/bash

# Test de la commande SCP exacte du script original

set -e

# Charger la configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

IP="157.230.15.51"
DOMAIN="meeshy.me"

echo "=== TEST SCP COMMAND ==="
echo "IP: $IP"
echo "DOMAIN: $DOMAIN"

# Créer le répertoire temporaire exactement comme dans le script
deploy_dir="$DEPLOY_TEMP_DIR/meeshy-deploy-optimized-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$deploy_dir"
echo "Deploy dir: $deploy_dir"

# Copier le fichier Docker Compose
if [ -f "$PROJECT_ROOT/$DOCKER_COMPOSE_FILE" ]; then
    cp "$PROJECT_ROOT/$DOCKER_COMPOSE_FILE" "$deploy_dir/docker-compose.yml"
    echo "✅ Docker Compose file copied"
else
    echo "❌ Docker Compose file not found"
    exit 1
fi

# Créer un fichier .env simple
echo "NODE_ENV=production" > "$deploy_dir/.env"
echo "✅ .env file created"

# Tester la commande SCP exacte du script
echo "Testing exact SCP command from script..."
echo "Command: scp -o StrictHostKeyChecking=no \"$deploy_dir/docker-compose.yml\" root@$IP:/opt/meeshy/"

# Créer le répertoire sur le serveur
echo "Creating directory on server..."
ssh -o StrictHostKeyChecking=no root@$IP "mkdir -p /opt/meeshy"

# Exécuter la commande SCP
scp -o StrictHostKeyChecking=no "$deploy_dir/docker-compose.yml" root@$IP:/opt/meeshy/

if [ $? -eq 0 ]; then
    echo "✅ SCP command successful"
else
    echo "❌ SCP command failed"
fi

# Nettoyer
rm -rf "$deploy_dir"
echo "=== TEST COMPLETED ==="
