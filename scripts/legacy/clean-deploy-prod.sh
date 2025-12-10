#!/bin/bash

# Script de nettoyage et redéploiement production
# Usage: ./scripts/clean-deploy-prod.sh [SERVER_IP]

set -e

SERVER_IP="${1:-}"

if [ -z "$SERVER_IP" ]; then
    echo "❌ Usage: $0 [SERVER_IP]"
    exit 1
fi

echo "🚀 Nettoyage et redéploiement sur $SERVER_IP"

# 1. Nettoyer /opt/meeshy
echo "🧹 Nettoyage complet de /opt/meeshy..."
ssh -o StrictHostKeyChecking=no root@$SERVER_IP << 'EOF'
    cd /opt/meeshy 2>/dev/null || true
    
    # Arrêter tous les services
    docker-compose -f docker-compose.traefik.yml down 2>/dev/null || docker-compose down 2>/dev/null || true
    
    # Supprimer tous les conteneurs arrêtés
    docker container prune -f 2>/dev/null || true
    
    # Supprimer toutes les images non utilisées
    docker image prune -af 2>/dev/null || true
    
    # Supprimer tous les volumes non utilisés (ATTENTION: efface les données !)
    docker volume prune -f 2>/dev/null || true
    
    # Supprimer tous les réseaux non utilisés
    docker network prune -f 2>/dev/null || true
    
    # Nettoyer le répertoire
    cd /opt
    rm -rf /opt/meeshy/*
    
    echo "✅ Nettoyage terminé"
EOF

# 2. Copier les fichiers nécessaires
echo "📦 Copie des fichiers de configuration..."
scp -o StrictHostKeyChecking=no env.production root@$SERVER_IP:/opt/meeshy/.env
scp -o StrictHostKeyChecking=no docker-compose.traefik.yml root@$SERVER_IP:/opt/meeshy/docker-compose.yml
scp -o StrictHostKeyChecking=no -r config root@$SERVER_IP:/opt/meeshy/
scp -o StrictHostKeyChecking=no -r shared root@$SERVER_IP:/opt/meeshy/

# 3. Démarrer les services avec Traefik
echo "🚀 Démarrage des services avec Traefik..."
ssh -o StrictHostKeyChecking=no root@$SERVER_IP << 'EOF'
    cd /opt/meeshy
    
    # Créer les réseaux Docker si nécessaire
    docker network create traefik-public 2>/dev/null || true
    docker network create meeshy-network 2>/dev/null || true
    
    # Démarrer avec docker-compose
    docker-compose pull
    docker-compose up -d
    
    echo "✅ Services démarrés"
    echo ""
    echo "📊 État des services:"
    docker-compose ps
EOF

echo ""
echo "✅ Déploiement terminé !"
echo ""
echo "🔗 Accès:"
echo "   • Frontend: https://meeshy.me"
echo "   • Gateway: https://gate.meeshy.me"
echo "   • Traefik Dashboard: https://traefik.meeshy.me"
