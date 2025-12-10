#!/bin/bash

# 🚀 Script de démarrage pour l'environnement de développement LOCAL
# Ce script démarre tous les services Meeshy en mode développement
set -e

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Parse les arguments
START_CONTAINERS=false
USE_HTTPS=false
LOCAL_IP=""
LOCAL_DOMAIN=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --with-containers)
      START_CONTAINERS=true
      shift
      ;;
    --https|--secure)
      USE_HTTPS=true
      shift
      ;;
    --ip)
      LOCAL_IP="$2"
      shift 2
      ;;
    --domain)
      LOCAL_DOMAIN="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --with-containers    Démarre aussi les conteneurs Docker (MongoDB, Redis)"
      echo "  --https, --secure   Démarre le frontend en mode HTTPS (requis pour iOS Safari)"
      echo "  --ip <IP>           Définit l'adresse IP locale (ex: 192.168.1.39)"
      echo "  --domain <DOMAIN>   Définit le domaine local personnalisé (ex: app.localhost.home)"
      echo "  -h, --help          Affiche cette aide"
      echo ""
      echo "Par défaut, seuls les services natifs (Node.js, Python) sont démarrés en HTTP."
      echo "Les conteneurs Docker doivent être déjà en cours d'exécution."
      echo ""
      echo "Configuration réseau:"
      echo "  Variables d'environnement: LOCAL_IP et DOMAIN"
      echo "  Peuvent être définies dans .env ou via les options --ip et --domain"
      echo ""
      echo "Mode HTTPS:"
      echo "  Le mode HTTPS est nécessaire pour tester les appels vidéo sur iPhone Safari."
      echo "  Vous devez d'abord générer des certificats SSL avec mkcert:"
      echo "    cd frontend"
      echo "    mkdir .cert"
      echo "    mkcert -key-file .cert/localhost-key.pem -cert-file .cert/localhost.pem \\"
      echo "           <VOTRE_IP> localhost local ::1 127.0.0.1 '*.localhost.home'"
      echo ""
      echo "Exemples:"
      echo "  $0 --https --ip 192.168.1.39"
      echo "  $0 --https --domain app.localhost.home"
      echo "  $0 --https --ip 192.168.1.39 --domain app.localhost.home"
      echo ""
      echo "Pour démarrer les conteneurs manuellement:"
      echo "  docker-compose -f docker-compose.local.yml up -d"
      exit 0
      ;;
    *)
      echo -e "${RED}❌ Option inconnue: $1${NC}"
      echo "Utilisez -h ou --help pour voir les options disponibles"
      exit 1
      ;;
  esac
done

# Obtenir le répertoire du projet
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_DIR="$PROJECT_ROOT"  # Alias pour compatibilité

# Détecter l'IP locale automatiquement si non fournie
if [ -z "$LOCAL_IP" ]; then
  # Essayer de détecter l'IP locale automatiquement
  if command -v ip &> /dev/null; then
    # Linux
    LOCAL_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}')
  elif command -v ifconfig &> /dev/null; then
    # macOS / BSD
    LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)
  fi

  # Si détection échouée, utiliser une valeur par défaut
  if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="192.168.1.39"
  fi
fi

# Définir le domaine par défaut
if [ -z "$LOCAL_DOMAIN" ]; then
  LOCAL_DOMAIN="localhost"
fi

echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}🚀 MEESHY - DÉMARRAGE ENVIRONNEMENT DE DÉVELOPPEMENT LOCAL${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo ""
if [ "$START_CONTAINERS" = true ]; then
  echo -e "${YELLOW}   Infrastructure: Services natifs + Conteneurs Docker${NC}"
else
  echo -e "${YELLOW}   Infrastructure: Services natifs uniquement${NC}"
fi
if [ "$USE_HTTPS" = true ]; then
  echo -e "${GREEN}   Protocole: HTTPS (Sécurisé - Compatible iOS Safari) 🔒${NC}"
else
  echo -e "${YELLOW}   Protocole: HTTP (Non sécurisé - Desktop uniquement)${NC}"
fi
echo -e "${BLUE}📁 Répertoire du projet: ${PROJECT_ROOT}${NC}"
echo -e "${BLUE}🌐 IP locale détectée: ${LOCAL_IP}${NC}"
if [ "$LOCAL_DOMAIN" != "localhost" ]; then
  echo -e "${BLUE}🏠 Domaine personnalisé: ${LOCAL_DOMAIN}${NC}"
fi
echo ""

cd "$PROJECT_ROOT"

# Variables globales pour les PIDs
TRANSLATOR_PID=""
GATEWAY_PID=""
FRONTEND_PID=""

# Fonction de nettoyage pour l'arrêt propre
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Arrêt des services Meeshy...${NC}"
    
    # Arrêter Frontend
    if [ -n "$FRONTEND_PID" ]; then
        echo -e "${YELLOW}🛑 Arrêt du Frontend (PID: $FRONTEND_PID)...${NC}"
        kill -TERM "$FRONTEND_PID" 2>/dev/null || true
        wait "$FRONTEND_PID" 2>/dev/null || true
        echo -e "${GREEN}✅ Frontend arrêté${NC}"
    fi
    
    # Arrêter Gateway
    if [ -n "$GATEWAY_PID" ]; then
        echo -e "${YELLOW}🛑 Arrêt du Gateway (PID: $GATEWAY_PID)...${NC}"
        kill -TERM "$GATEWAY_PID" 2>/dev/null || true
        wait "$GATEWAY_PID" 2>/dev/null || true
        echo -e "${GREEN}✅ Gateway arrêté${NC}"
    fi
    
    # Arrêter Translator
    if [ -n "$TRANSLATOR_PID" ]; then
        echo -e "${YELLOW}🛑 Arrêt du Translator (PID: $TRANSLATOR_PID)...${NC}"
        kill -TERM "$TRANSLATOR_PID" 2>/dev/null || true
        wait "$TRANSLATOR_PID" 2>/dev/null || true
        echo -e "${GREEN}✅ Translator arrêté${NC}"
    fi
    lsof -ti:3000 -ti:3100 -ti:8000 | xargs kill -9
    # Les conteneurs Docker ne sont jamais arrêtés lors du Ctrl+C
    echo -e "${CYAN}ℹ️  Les conteneurs Docker (MongoDB, Redis) restent actifs${NC}"
    if [ "$START_CONTAINERS" = true ]; then
        echo -e "${YELLOW}💡 Pour les arrêter manuellement:${NC} docker-compose -f docker-compose.local.yml down"
    fi
    
    echo ""
    echo -e "${GREEN}✅ Environnement Meeshy arrêté avec succès !${NC}"
    echo ""
    
    exit 0
}

# Capturer Ctrl+C pour arrêt propre
trap cleanup INT TERM

# Fonction pour vérifier si un port est utilisé
check_port() {
    local port=$1
    local service=$2
    
    if lsof -ti:$port >/dev/null 2>&1; then
        echo -e "${RED}❌ Port $port déjà utilisé ($service)${NC}"
        echo -e "${YELLOW}⚠️  Utilisez './scripts/development/development-stop-local.sh' pour arrêter les services existants${NC}"
        return 1
    else
        echo -e "${GREEN}✅ Port $port disponible ($service)${NC}"
        return 0
    fi
}

# Fonction pour attendre qu'un service soit prêt
wait_for_service() {
    local url=$1
    local service=$2
    local max_attempts=${3:-30}
    local attempt=0
    
    echo -e "${YELLOW}⏳ Attente du démarrage de $service...${NC}"
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s "$url" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ $service est prêt !${NC}"
            return 0
        fi
        attempt=$((attempt + 1))
        echo -e "${BLUE}   Tentative $attempt/$max_attempts...${NC}"
        sleep 2
    done
    
    echo -e "${RED}❌ $service n'a pas démarré dans le temps imparti${NC}"
    return 1
}

# Vérifier les prérequis
echo -e "${BLUE}🔍 Vérification des prérequis...${NC}"
echo ""

# Vérifier Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js n'est pas installé${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node --version)${NC}"

# Vérifier pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}❌ pnpm n'est pas installé${NC}"
    echo -e "${YELLOW}   Installez-le avec: npm install -g pnpm${NC}"
    exit 1
fi
echo -e "${GREEN}✅ pnpm $(pnpm --version)${NC}"

# Vérifier Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 n'est pas installé${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Python $(python3 --version)${NC}"

# Vérifier Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker n'est pas installé${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker $(docker --version)${NC}"

# Vérifier docker-compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ docker-compose n'est pas installé${NC}"
    exit 1
fi
echo -e "${GREEN}✅ docker-compose $(docker-compose --version)${NC}"

echo ""

# Vérifier que les ports sont disponibles
echo -e "${BLUE}🔍 Vérification des ports des services natifs...${NC}"
check_port 3000 "Gateway" || exit 1
check_port 3100 "Frontend" || exit 1
check_port 8000 "Translator" || exit 1

# Vérifier les ports Docker uniquement si on va les démarrer
if [ "$START_CONTAINERS" = true ]; then
    echo -e "${BLUE}🔍 Vérification des ports des conteneurs...${NC}"
    check_port 27017 "MongoDB" || exit 1
    check_port 6379 "Redis" || exit 1
else
    echo -e "${CYAN}ℹ️  Vérification de la disponibilité de MongoDB et Redis...${NC}"
    # Vérifier que MongoDB et Redis sont accessibles
    if ! nc -z localhost 27017 2>/dev/null; then
        echo -e "${RED}❌ MongoDB n'est pas accessible sur le port 27017${NC}"
        echo -e "${YELLOW}   Démarrez-le avec: docker-compose -f docker-compose.local.yml up -d${NC}"
        echo -e "${YELLOW}   Ou utilisez: $0 --with-containers${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ MongoDB est accessible${NC}"
    
    if ! nc -z localhost 6379 2>/dev/null; then
        echo -e "${RED}❌ Redis n'est pas accessible sur le port 6379${NC}"
        echo -e "${YELLOW}   Démarrez-le avec: docker-compose -f docker-compose.local.yml up -d${NC}"
        echo -e "${YELLOW}   Ou utilisez: $0 --with-containers${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Redis est accessible${NC}"
fi
echo ""

# Créer les fichiers .env.local
echo -e "${BLUE}📝 Configuration des variables d'environnement...${NC}"

# Déterminer les URLs selon le mode HTTPS
if [ "$USE_HTTPS" = true ]; then
  FRONTEND_PROTOCOL="https"
  FRONTEND_WS_PROTOCOL="wss"
  FRONTEND_URL="https://${LOCAL_IP}:3100"
  GATEWAY_PROTOCOL="https"
  GATEWAY_URL="https://${LOCAL_IP}:3000"
  GATEWAY_WS_URL="wss://${LOCAL_IP}:3000"
  TRANSLATOR_URL="https://${LOCAL_IP}:8000"
  # CORS complètes : localhost, 127.0.0.1, LOCAL_IP (ex: smpdev02.local), et variations avec/sans www
  CORS_ORIGINS="https://localhost:3100,https://localhost:3000,https://127.0.0.1:3100,https://127.0.0.1:3000,https://${LOCAL_IP}:3100,https://${LOCAL_IP}:3000,https://www.${LOCAL_IP}:3100,https://www.${LOCAL_IP}:3000,https://localhost:8000,https://127.0.0.1:8000,https://${LOCAL_IP}:8000"
  echo -e "${GREEN}   Mode HTTPS activé - URLs configurées pour HTTPS/WSS${NC}"
else
  FRONTEND_PROTOCOL="http"
  FRONTEND_WS_PROTOCOL="ws"
  FRONTEND_URL="http://${LOCAL_IP}:3100"
  GATEWAY_PROTOCOL="http"
  GATEWAY_URL="http://${LOCAL_IP}:3000"
  GATEWAY_WS_URL="ws://${LOCAL_IP}:3000"
  TRANSLATOR_URL="http://${LOCAL_IP}:8000"
  # CORS complètes : localhost, 127.0.0.1, LOCAL_IP (ex: smpdev02.local), et variations avec/sans www
  CORS_ORIGINS="http://localhost:3100,http://localhost:3000,http://127.0.0.1:3100,http://127.0.0.1:3000,http://${LOCAL_IP}:3100,http://${LOCAL_IP}:3000,http://www.${LOCAL_IP}:3100,http://www.${LOCAL_IP}:3000,http://localhost:8000,http://127.0.0.1:8000,http://${LOCAL_IP}:8000"
fi

# .env racine
cat > .env << EOF
# Configuration locale de développement
NODE_ENV=development
LOG_LEVEL=debug

# Configuration réseau
LOCAL_IP=${LOCAL_IP}
DOMAIN=${LOCAL_DOMAIN}
USE_HTTPS=${USE_HTTPS}

# Base de données MongoDB (sans authentification pour développement local)
DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=dev-secret-key-change-in-production-12345678

# Services URLs
TRANSLATOR_URL=${TRANSLATOR_URL}
GATEWAY_URL=${GATEWAY_URL}
FRONTEND_URL=${FRONTEND_URL}

# CORS (inclut toutes les variations : localhost, 127.0.0.1, IP locale)
CORS_ORIGINS=${CORS_ORIGINS}
EOF
echo -e "${GREEN}✅ .env créé${NC}"

# .env Frontend
cat > frontend/.env << EOF
NODE_ENV=development

# Configuration réseau
LOCAL_IP=${LOCAL_IP}
DOMAIN=${LOCAL_DOMAIN}

# Public URLs (accessibles côté client - utilisent l'IP locale pour accès réseau)
NEXT_PUBLIC_API_URL=${GATEWAY_URL}
NEXT_PUBLIC_WS_URL=${GATEWAY_WS_URL}
NEXT_PUBLIC_BACKEND_URL=${GATEWAY_URL}
NEXT_PUBLIC_TRANSLATION_URL=${TRANSLATOR_URL}
NEXT_PUBLIC_FRONTEND_URL=${FRONTEND_URL}

# Firebase Configuration pour les notifications push PWA
NEXT_PUBLIC_FIREBASE_API_KEY="test_api_key"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="meeshy-me.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="meeshy-me"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="test_sender_id"
NEXT_PUBLIC_FIREBASE_APP_ID="test_app_id"
NEXT_PUBLIC_FIREBASE_VAPID_KEY="your_vapid_key"
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID="G-XF65H07ZRY"

# Server-side URLs (peuvent utiliser localhost pour communication interne)
API_URL=${GATEWAY_URL}
BACKEND_URL=${GATEWAY_URL}
TRANSLATION_URL=http://localhost:8000

# Base de données MongoDB (sans authentification pour développement local)
DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true
EOF
echo -e "${GREEN}✅ frontend/.env créé${NC}"

# .env Gateway
cat > gateway/.env << EOF
NODE_ENV=development
LOG_LEVEL=debug

# HTTPS Configuration
USE_HTTPS=${USE_HTTPS}
LOCAL_IP=${LOCAL_IP}
DOMAIN=${LOCAL_DOMAIN}

# Base de données (sans authentification pour développement local)
DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true

# Redis
REDIS_URL=redis://localhost:6379

# Services (Gateway utilise localhost pour communication interne avec Translator)
TRANSLATOR_URL=http://localhost:8000

# ZMQ Configuration
ZMQ_TRANSLATOR_HOST=localhost
ZMQ_TRANSLATOR_PUSH_PORT=5555
ZMQ_TRANSLATOR_SUB_PORT=5558
ZMQ_TRANSLATOR_PORT=5555

# JWT
JWT_SECRET=dev-secret-key-change-in-production-12345678

# Server
PORT=3000
HOST=0.0.0.0

# URLs complètes pour le Gateway et les attachements
PUBLIC_URL=${GATEWAY_URL}
BACKEND_URL=${GATEWAY_URL}
GATEWAY_URL=${GATEWAY_URL}
FRONTEND_URL=${FRONTEND_URL}

# CORS (inclut toutes les variations : localhost, 127.0.0.1, IP locale)
CORS_ORIGINS=${CORS_ORIGINS}
EOF
echo -e "${GREEN}✅ gateway/.env créé${NC}"

# .env.local Translator (avec chemins absolus injectés)
TRANSLATOR_ABS_DIR="${PROJECT_DIR}/translator"
cat > translator/.env.local << EOF
# FastAPI Configuration
ENVIRONMENT=development
LOG_LEVEL=DEBUG

# HTTPS Configuration
USE_HTTPS=${USE_HTTPS}

# Base de données (sans authentification pour développement local)
DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true

# Prisma Configuration
PRISMA_CLIENT_ENGINE_TYPE="binary"

# Redis
REDIS_URL=redis://localhost:6379

# Server
PORT=8000
HOST=0.0.0.0

# ZMQ Configuration
TRANSLATOR_ZMQ_PULL_PORT=5555
TRANSLATOR_ZMQ_PUB_PORT=5558
ZMQ_PORT=5555

# ML Models (chemins absolus injectés)
MODELS_PATH=${TRANSLATOR_ABS_DIR}/models
TRANSLATION_MODEL_PATH=${TRANSLATOR_ABS_DIR}/models
HF_HOME=${TRANSLATOR_ABS_DIR}/models
TRANSFORMERS_CACHE=${TRANSLATOR_ABS_DIR}/models
WORKER_COUNT=2

# CORS
CORS_ORIGINS=${CORS_ORIGINS}
EOF
echo -e "${GREEN}✅ translator/.env.local créé (avec chemins absolus: ${TRANSLATOR_ABS_DIR}/models)${NC}"

echo ""

# Démarrer l'infrastructure Docker (optionnel)
if [ "$START_CONTAINERS" = true ]; then
    echo -e "${BLUE}🐳 Démarrage de l'infrastructure Docker (MongoDB, Redis)...${NC}"
    echo -e "${CYAN}   Note: Seuls MongoDB et Redis sont démarrés en Docker${NC}"
    echo -e "${CYAN}   Les services applicatifs seront lancés nativement${NC}"
    docker-compose -f docker-compose.local.yml up -d

    # Attendre que MongoDB soit prêt
    echo -e "${YELLOW}⏳ Attente du démarrage de MongoDB...${NC}"
    sleep 5

    # Initialiser le replica set MongoDB
    echo -e "${BLUE}🔧 Initialisation du replica set MongoDB...${NC}"
    docker exec meeshy-dev-database mongosh --eval '
try {
    rs.status();
    print("Replica set already initialized");
} catch (e) {
    rs.initiate({
        _id: "rs0",
        members: [{ _id: 0, host: "localhost:27017" }]
    });
    print("Replica set initialized");
}
' 2>/dev/null || echo -e "${YELLOW}⚠️  Replica set déjà initialisé ou erreur non critique${NC}"

    echo -e "${GREEN}✅ Services Docker démarrés${NC}"
else
    echo -e "${CYAN}ℹ️  Les conteneurs Docker ne sont pas démarrés (mode natif uniquement)${NC}"
    echo -e "${CYAN}   MongoDB et Redis doivent être déjà en cours d'exécution${NC}"
fi
echo ""

# Vérifier que les dépendances sont installées
echo -e "${BLUE}📦 Vérification des dépendances...${NC}"

# Frontend
if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}📦 Installation des dépendances Frontend...${NC}"
    cd frontend && pnpm install && cd ..
fi
echo -e "${GREEN}✅ Dépendances Frontend OK${NC}"

# Gateway
if [ ! -d "gateway/node_modules" ]; then
    echo -e "${YELLOW}📦 Installation des dépendances Gateway...${NC}"
    cd gateway && pnpm install && cd ..
fi
echo -e "${GREEN}✅ Dépendances Gateway OK${NC}"

# Translator
if [ ! -d "translator/venv" ]; then
    echo -e "${YELLOW}📦 Création de l'environnement virtuel Python...${NC}"
    cd translator && python3 -m venv venv && cd ..
fi

if [ ! -f "translator/venv/bin/activate" ]; then
    echo -e "${RED}❌ Environnement virtuel Python non créé${NC}"
    exit 1
fi

echo -e "${YELLOW}📦 Installation des dépendances Translator...${NC}"
cd translator && source venv/bin/activate && pip install -q -r requirements.txt && cd ..
echo -e "${GREEN}✅ Dépendances Translator OK${NC}"

echo ""

# Générer les clients Prisma
echo -e "${BLUE}🔧 Génération des clients Prisma...${NC}"
cd gateway
pnpm run generate:prisma 2>/dev/null || echo -e "${YELLOW}⚠️  Prisma déjà généré${NC}"
cd ..
echo -e "${GREEN}✅ Clients Prisma générés${NC}"
echo ""

# Créer les répertoires de logs
mkdir -p translator/logs gateway/logs frontend/.next

# Démarrer les services
echo -e "${BLUE}🚀 Démarrage des services applicatifs...${NC}"
echo ""

# 1. Démarrer le Translator
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}🔤 Démarrage du Translator (Port 8000)${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
cd translator
# Le fichier .env contient déjà les chemins absolus, Python/FastAPI le lit automatiquement
.venv/bin/python src/main.py > translator.log 2>&1 &
TRANSLATOR_PID=$!
cd ..
echo -e "${GREEN}✅ Translator démarré (PID: $TRANSLATOR_PID)${NC}"
sleep 3

# 2. Démarrer le Gateway
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}🌐 Démarrage du Gateway (Port 3000)${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
cd gateway
pnpm run dev > gateway.log 2>&1 &
GATEWAY_PID=$!
cd ..
echo -e "${GREEN}✅ Gateway démarré (PID: $GATEWAY_PID)${NC}"
sleep 5

# 3. Démarrer le Frontend
echo -e "${CYAN}═══════════════════════════════════════${NC}"
if [ "$USE_HTTPS" = true ]; then
  echo -e "${CYAN}🎨 Démarrage du Frontend HTTPS (Port 3100)${NC}"
  echo -e "${CYAN}   🔒 Mode sécurisé activé${NC}"

  # Vérifier que les certificats existent
  if [ ! -f "frontend/.cert/localhost-key.pem" ] || [ ! -f "frontend/.cert/localhost.pem" ]; then
    echo -e "${RED}❌ Certificats SSL non trouvés !${NC}"
    echo -e "${YELLOW}   Générez-les avec mkcert:${NC}"
    echo -e "${BLUE}   cd frontend${NC}"
    echo -e "${BLUE}   mkdir -p .cert${NC}"
    echo -e "${BLUE}   mkcert -key-file .cert/localhost-key.pem -cert-file .cert/localhost.pem \\${NC}"
    echo -e "${BLUE}          192.168.10.1 localhost local ::1 127.0.0.1 '*.localhost.home'${NC}"
    exit 1
  fi
  echo -e "${GREEN}   ✅ Certificats SSL trouvés${NC}"
else
  echo -e "${CYAN}🎨 Démarrage du Frontend HTTP (Port 3100)${NC}"
fi
echo -e "${CYAN}═══════════════════════════════════════${NC}"
cd frontend
if [ "$USE_HTTPS" = true ]; then
  pnpm run dev:https > frontend.log 2>&1 &
else
  pnpm run dev > frontend.log 2>&1 &
fi
FRONTEND_PID=$!
cd ..
echo -e "${GREEN}✅ Frontend démarré (PID: $FRONTEND_PID)${NC}"
sleep 5

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ TOUS LES SERVICES SONT DÉMARRÉS !${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Afficher les informations de connexion
echo -e "${CYAN}📊 INFORMATIONS DES SERVICES${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""
if [ "$USE_HTTPS" = true ]; then
  echo -e "${PURPLE}🌐 Frontend:${NC}     ${GREEN}https://localhost:3100 🔒${NC}"
  echo -e "${PURPLE}   📱 Network:${NC}   ${GREEN}https://${LOCAL_IP}:3100${NC}"
  if [ "$LOCAL_DOMAIN" != "localhost" ]; then
    echo -e "${PURPLE}   🏠 Domain:${NC}    ${GREEN}https://${LOCAL_DOMAIN}:3100${NC}"
  fi
  echo -e "${GREEN}   Mode HTTPS activé - Compatible iOS Safari !${NC}"
else
  echo -e "${PURPLE}🌐 Frontend:${NC}     ${BLUE}http://localhost:3100${NC}"
  echo -e "${PURPLE}   📱 Network:${NC}   ${BLUE}http://${LOCAL_IP}:3100${NC}"
  if [ "$LOCAL_DOMAIN" != "localhost" ]; then
    echo -e "${PURPLE}   🏠 Domain:${NC}    ${BLUE}http://${LOCAL_DOMAIN}:3100${NC}"
  fi
  echo -e "${YELLOW}   ⚠️  HTTP uniquement - getUserMedia ne fonctionnera pas sur iOS${NC}"
fi
echo -e "${PURPLE}🚀 Gateway API:${NC}  ${BLUE}http://localhost:3000${NC}"
echo -e "${PURPLE}🔤 Translator:${NC}   ${BLUE}http://localhost:8000${NC}"
echo -e "${PURPLE}🗄️  MongoDB:${NC}     ${BLUE}mongodb://localhost:27017${NC}"
if [ "$START_CONTAINERS" = true ]; then
    echo -e "   ${GREEN}(démarré par ce script)${NC}"
else
    echo -e "   ${YELLOW}(conteneur externe)${NC}"
fi
echo -e "${PURPLE}💾 Redis:${NC}        ${BLUE}redis://localhost:6379${NC}"
if [ "$START_CONTAINERS" = true ]; then
    echo -e "   ${GREEN}(démarré par ce script)${NC}"
else
    echo -e "   ${YELLOW}(conteneur externe)${NC}"
fi
echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""

# Afficher les informations des logs
echo -e "${YELLOW}📋 LOGS DES SERVICES${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BLUE}• Translator:${NC} tail -f translator/translator.log"
echo -e "  ${BLUE}• Gateway:${NC}    tail -f gateway/gateway.log"
echo -e "  ${BLUE}• Frontend:${NC}   tail -f frontend/frontend.log"
echo ""
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""

# Afficher les PIDs
echo -e "${CYAN}🔧 PROCESS IDs${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "  ${BLUE}• Translator PID:${NC} $TRANSLATOR_PID"
echo -e "  ${BLUE}• Gateway PID:${NC}    $GATEWAY_PID"
echo -e "  ${BLUE}• Frontend PID:${NC}   $FRONTEND_PID"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""

# Instructions d'arrêt
echo -e "${YELLOW}⚠️  POUR ARRÊTER L'ENVIRONNEMENT${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo -e "  ${RED}Appuyez sur Ctrl+C dans ce terminal${NC}"
if [ "$START_CONTAINERS" = true ]; then
    echo -e "  ${BLUE}Ou utilisez:${NC} ./scripts/development/development-stop-local.sh --with-containers"
else
    echo -e "  ${BLUE}Ou utilisez:${NC} ./scripts/development/development-stop-local.sh"
fi
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""

# Monitoring des services
echo -e "${GREEN}🔄 Monitoring des services en cours...${NC}"
echo -e "${GREEN}   (Le script restera actif et surveillera les services)${NC}"
echo ""

# Boucle de monitoring
while true; do
    sleep 10
    
    # Vérifier que les services sont toujours actifs
    if ! kill -0 "$TRANSLATOR_PID" 2>/dev/null; then
        echo -e "${RED}❌ Le Translator s'est arrêté !${NC}"
        echo -e "${YELLOW}📋 Vérifiez les logs: tail -f translator/translator.log${NC}"
    fi
    
    if ! kill -0 "$GATEWAY_PID" 2>/dev/null; then
        echo -e "${RED}❌ Le Gateway s'est arrêté !${NC}"
        echo -e "${YELLOW}📋 Vérifiez les logs: tail -f gateway/gateway.log${NC}"
    fi
    
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo -e "${RED}❌ Le Frontend s'est arrêté !${NC}"
        echo -e "${YELLOW}📋 Vérifiez les logs: tail -f frontend/frontend.log${NC}"
    fi
done

