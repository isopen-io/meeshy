#!/bin/bash

# Script de déploiement production complet Meeshy
# Usage: ./scripts/deploy-production-full.sh [SERVER_IP]

set -e

SERVER_IP="${1:-}"

if [ -z "$SERVER_IP" ]; then
    echo "❌ Usage: $0 [SERVER_IP]"
    echo "Exemple: $0 157.230.15.51"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 Déploiement Production Complet Meeshy"
echo "========================================"
echo "Serveur: $SERVER_IP"
echo "Compose: docker-compose.traefik.yml"
echo ""

# 1. Vérifier les fichiers critiques
echo "📋 Vérification des fichiers critiques..."
if [ ! -f "$PROJECT_ROOT/env.production" ]; then
    echo "❌ Fichier env.production manquant"
    exit 1
fi

if [ ! -f "$PROJECT_ROOT/docker-compose.traefik.yml" ]; then
    echo "❌ Fichier docker-compose.traefik.yml manquant"
    exit 1
fi

echo "✅ Fichiers critiques présents"
echo ""

# 2. Vérifier la configuration (FORCE_DB_RESET=false, URLs correctes)
echo "🔍 Vérification de la configuration..."
FORCE_RESET=$(grep "^FORCE_DB_RESET=" "$PROJECT_ROOT/env.production" | grep -v "^#" | tail -1 | cut -d'=' -f2 | tr -d '"')
INTERNAL_URL=$(grep "^INTERNAL_BACKEND_URL=" "$PROJECT_ROOT/env.production" | grep -v "^#" | tail -1 | cut -d'=' -f2 | tr -d '"')

if [ "$FORCE_RESET" = "true" ]; then
    echo "❌ ERREUR: FORCE_DB_RESET=true détecté!"
    echo "   Ceci supprimerait toutes les données en production!"
    echo "   Changez FORCE_DB_RESET=false dans env.production"
    exit 1
fi

if [[ "$INTERNAL_URL" != https://* ]]; then
    echo "⚠️  AVERTISSEMENT: INTERNAL_BACKEND_URL n'utilise pas HTTPS: $INTERNAL_URL"
    echo "   Pour la production, utilisez: https://gate.meeshy.me"
    read -p "Continuer quand même? (yes/NO): " confirm
    if [ "$confirm" != "yes" ]; then
        exit 0
    fi
fi

echo "✅ Configuration validée"
echo ""

# 3. Nettoyer l'environnement de production
echo "🧹 Nettoyage de l'environnement de production..."
ssh -o StrictHostKeyChecking=no root@$SERVER_IP << 'EOF'
    echo "Arrêt des services existants..."
    cd /opt/meeshy 2>/dev/null || true
    
    # Arrêter avec le compose Traefik si existant
    docker-compose -f docker-compose.traefik.yml down 2>/dev/null || \
    docker-compose down 2>/dev/null || \
    docker compose down 2>/dev/null || true
    
    # Nettoyer les conteneurs arrêtés
    docker container prune -f 2>/dev/null || true
    
    # Nettoyer les images non utilisées (garde les volumes de données)
    docker image prune -af 2>/dev/null || true
    
    # Nettoyer les réseaux non utilisés
    docker network prune -f 2>/dev/null || true
    
    # Créer le répertoire s'il n'existe pas
    mkdir -p /opt/meeshy
    
    # Nettoyer les fichiers de config (garde les volumes Docker)
    cd /opt/meeshy
    rm -f docker-compose.yml .env 2>/dev/null || true
    rm -rf config shared 2>/dev/null || true
    
    echo "✅ Nettoyage terminé"
EOF

echo "✅ Environnement nettoyé"
echo ""

# 4. Préparer le fichier .env avec échappement correct des mots de passe
echo "🔐 Préparation du fichier .env avec échappement des mots de passe..."
TEMP_ENV="/tmp/meeshy-env-escaped-$$"

# Copier env.production et échapper les variables contenant des mots de passe
while IFS='=' read -r key value; do
    # Ignorer les commentaires et lignes vides
    if [[ "$key" =~ ^[[:space:]]*# ]] || [[ -z "$key" ]]; then
        echo "$key=$value" >> "$TEMP_ENV"
        continue
    fi
    
    # Échapper les variables de mots de passe (TRAEFIK_USERS, API_USERS, etc.)
    if [[ "$key" =~ (TRAEFIK_USERS|API_USERS|MONGO_USERS|REDIS_USERS) ]]; then
        # Supprimer les guillemets existants et échapper correctement
        clean_value=$(echo "$value" | sed 's/^"//;s/"$//')
        # Échapper les caractères spéciaux pour bash
        escaped_value=$(printf '%s' "$clean_value" | sed 's/\$/\\$/g; s/"/\\"/g; s/`/\\`/g')
        echo "$key=\"$escaped_value\"" >> "$TEMP_ENV"
    else
        echo "$key=$value" >> "$TEMP_ENV"
    fi
done < "$PROJECT_ROOT/env.production"

echo "✅ Fichier .env préparé avec échappement correct"

# 5. Copier les fichiers de configuration
echo "📦 Copie des fichiers de configuration..."
scp -o StrictHostKeyChecking=no "$TEMP_ENV" root@$SERVER_IP:/opt/meeshy/.env
scp -o StrictHostKeyChecking=no "$PROJECT_ROOT/docker-compose.traefik.yml" root@$SERVER_IP:/opt/meeshy/docker-compose.yml

# Nettoyer le fichier temporaire
rm -f "$TEMP_ENV"

# Copier les dossiers de configuration
if [ -d "$PROJECT_ROOT/config" ]; then
    scp -o StrictHostKeyChecking=no -r "$PROJECT_ROOT/config" root@$SERVER_IP:/opt/meeshy/
fi

if [ -d "$PROJECT_ROOT/shared" ]; then
    scp -o StrictHostKeyChecking=no -r "$PROJECT_ROOT/shared" root@$SERVER_IP:/opt/meeshy/
fi

echo "✅ Fichiers copiés"
echo ""

# 5. Créer les réseaux Docker
echo "🌐 Création des réseaux Docker..."
ssh -o StrictHostKeyChecking=no root@$SERVER_IP << 'EOF'
    # Créer les réseaux si nécessaire
    docker network create traefik-public 2>/dev/null || echo "Réseau traefik-public existe déjà"
    docker network create meeshy-network 2>/dev/null || echo "Réseau meeshy-network existe déjà"
    echo "✅ Réseaux Docker créés/vérifiés"
EOF

echo ""

# 6. Démarrer les services de manière séquentielle
echo "🚀 Démarrage des services..."
ssh -o StrictHostKeyChecking=no root@$SERVER_IP << 'EOF'
    cd /opt/meeshy
    
    echo "📥 Téléchargement des images Docker..."
    docker-compose pull
    
    echo ""
    echo "🔧 Démarrage de l'infrastructure..."
    
    # 1. Traefik
    echo "  → Traefik..."
    docker-compose up -d traefik
    sleep 3
    
    # 2. Redis
    echo "  → Redis..."
    docker-compose up -d redis
    sleep 3
    
    # 3. MongoDB
    echo "  → MongoDB..."
    docker-compose up -d mongodb
    sleep 10
    
    echo ""
    echo "🚀 Démarrage des services applicatifs..."
    
    # 4. Gateway
    echo "  → Gateway..."
    docker-compose up -d gateway
    sleep 5
    
    # 5. Translator
    echo "  → Translator..."
    docker-compose up -d translator
    sleep 15
    
    # 6. Frontend
    echo "  → Frontend..."
    docker-compose up -d frontend
    sleep 5

    # 7. Zone Web v3 (préfixe /__v3, port 3300) — un service déclaré que rien
    #    ne démarre n'enregistre aucun routeur Traefik.
    echo "  → Web v3..."
    docker-compose up -d frontend-v3
    sleep 3

    echo ""
    echo "✅ Tous les services démarrés"
EOF

echo ""

# 7. Vérification de santé
echo "🏥 Vérification de santé des services..."
sleep 5

ssh -o StrictHostKeyChecking=no root@$SERVER_IP << 'EOF'
    cd /opt/meeshy
    
    echo "📊 État des services:"
    docker-compose ps
    
    echo ""
    echo "🔍 Tests de connectivité:"
    
    # Test Gateway
    if curl -f -s -k https://gate.meeshy.me/health >/dev/null 2>&1 || curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
        echo "✅ Gateway: OK"
    else
        echo "⚠️  Gateway: Inaccessible (peut prendre quelques secondes de plus)"
    fi
    
    # Test Frontend
    if curl -f -s -k https://meeshy.me >/dev/null 2>&1 || curl -f -s http://localhost:3100 >/dev/null 2>&1; then
        echo "✅ Frontend: OK"
    else
        echo "⚠️  Frontend: Inaccessible (peut prendre quelques secondes de plus)"
    fi
    
    # Test Traefik
    if curl -f -s http://localhost:8080 >/dev/null 2>&1; then
        echo "✅ Traefik: OK"
    else
        echo "⚠️  Traefik: Inaccessible"
    fi
    
    echo ""
    echo "📋 Logs récents (dernières 20 lignes):"
    docker-compose logs --tail=20
EOF

echo ""
echo "🎉 Déploiement terminé !"
echo "======================="
echo ""
echo "🔗 Accès aux services:"
echo "   • Frontend: https://meeshy.me"
echo "   • Gateway API: https://gate.meeshy.me"
echo "   • Traefik Dashboard: https://traefik.meeshy.me"
echo ""
echo "📋 Commandes utiles:"
echo "   • Logs: ssh root@$SERVER_IP 'cd /opt/meeshy && docker-compose logs -f'"
echo "   • Status: ssh root@$SERVER_IP 'cd /opt/meeshy && docker-compose ps'"
echo "   • Restart: ssh root@$SERVER_IP 'cd /opt/meeshy && docker-compose restart [service]'"
echo ""
