#!/bin/bash

# ============================================================================
# MEESHY - Script de demarrage developpement local
# Demarre MongoDB + Redis en Docker, services natifs avec Bun
#
# Modes:
#   HTTP:  ./development-start-local.sh
#   HTTPS: ./development-start-local.sh --secure
#   Network: ./development-start-local.sh --secure --domain 192.168.1.171
# ============================================================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Repertoires des services
WEB_DIR="apps/web"
GATEWAY_DIR="services/gateway"
TRANSLATOR_DIR="services/translator"
COMPOSE_DIR="infrastructure/docker/compose"
COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.dev.yml"

# PIDs des services
TRANSLATOR_PID=""
GATEWAY_PID=""
FRONTEND_PID=""

# Options par defaut
SECURE_MODE=false
DOMAIN="localhost"
FORCE_CONTAINERS=false
START_CONTAINERS=auto  # auto, yes, no

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --secure|-s)
      SECURE_MODE=true
      shift
      ;;
    --domain|-d)
      DOMAIN="$2"
      shift 2
      ;;
    --with-containers)
      START_CONTAINERS=yes
      shift
      ;;
    --no-containers)
      START_CONTAINERS=no
      shift
      ;;
    --force-containers)
      FORCE_CONTAINERS=true
      START_CONTAINERS=yes
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  -s, --secure          Mode HTTPS (necessite certificats)"
      echo "  -d, --domain <host>   Domaine ou IP (defaut: localhost)"
      echo "  --with-containers     Demarrer les containers Docker"
      echo "  --no-containers       Ne pas demarrer les containers (doit etre deja en cours)"
      echo "  --force-containers    Forcer le redemarrage des containers"
      echo "  -h, --help            Affiche cette aide"
      echo ""
      echo "Exemples:"
      echo "  $0                                    # HTTP sur localhost"
      echo "  $0 --secure                           # HTTPS sur localhost"
      echo "  $0 --secure --domain meeshy.local     # HTTPS sur meeshy.local"
      echo "  $0 --secure --domain 192.168.1.171    # HTTPS sur IP (acces reseau)"
      echo "  $0 --with-containers                  # Forcer demarrage containers"
      echo ""
      echo "Prerequis:"
      echo "  - make install   (installer les dependances)"
      echo "  - make setup-env (generer les fichiers .env)"
      echo "  - Pour --secure: certificats dans apps/web/.cert/"
      exit 0
      ;;
    *)
      echo -e "${RED}Option inconnue: $1${NC}"
      echo "Utilisez -h pour l'aide"
      exit 1
      ;;
  esac
done

cd "$PROJECT_ROOT"

# Determiner le protocole
if [ "$SECURE_MODE" = true ]; then
    PROTOCOL="https"
    WS_PROTOCOL="wss"
else
    PROTOCOL="http"
    WS_PROTOCOL="ws"
fi

# Construire les URLs
BASE_URL="${PROTOCOL}://${DOMAIN}"
FRONTEND_URL="${BASE_URL}:3100"
GATEWAY_URL="${BASE_URL}:3000"
TRANSLATOR_URL="${BASE_URL}:8000"
WS_URL="${WS_PROTOCOL}://${DOMAIN}:3000"

# Fonction de nettoyage
cleanup() {
    echo ""
    echo -e "${YELLOW}Arret des services...${NC}"

    [ -n "$FRONTEND_PID" ] && kill -TERM "$FRONTEND_PID" 2>/dev/null
    [ -n "$GATEWAY_PID" ] && kill -TERM "$GATEWAY_PID" 2>/dev/null
    [ -n "$TRANSLATOR_PID" ] && kill -TERM "$TRANSLATOR_PID" 2>/dev/null

    sleep 2
    lsof -ti:3000 -ti:3100 -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null || true

    echo -e "${GREEN}Services arretes${NC}"
    echo -e "${CYAN}Les conteneurs Docker restent actifs${NC}"
    exit 0
}

trap cleanup INT TERM

# Afficher la configuration
echo -e "${CYAN}======================================${NC}"
echo -e "${CYAN}  MEESHY - Developpement Local${NC}"
echo -e "${CYAN}======================================${NC}"
echo ""
echo -e "${BLUE}Configuration:${NC}"
PROTOCOL_UPPER=$(echo "$PROTOCOL" | tr '[:lower:]' '[:upper:]')
echo -e "  Mode:    ${GREEN}${PROTOCOL_UPPER}${NC}"
echo -e "  Domain:  ${GREEN}${DOMAIN}${NC}"
echo ""

# Verifier les certificats si mode HTTPS
if [ "$SECURE_MODE" = true ]; then
    CERT_DIR="${WEB_DIR}/.cert"
    CERT_OK=false

    # Verifier les differentes conventions de nommage
    if [ -f "${CERT_DIR}/cert.pem" ] && [ -f "${CERT_DIR}/key.pem" ]; then
        CERT_OK=true
    elif [ -f "${CERT_DIR}/localhost.pem" ] && [ -f "${CERT_DIR}/localhost-key.pem" ]; then
        CERT_OK=true
    elif [ -f "${CERT_DIR}/${DOMAIN}.pem" ] && [ -f "${CERT_DIR}/${DOMAIN}-key.pem" ]; then
        CERT_OK=true
    fi

    if [ "$CERT_OK" = false ]; then
        echo -e "${RED}Certificats SSL manquants pour le mode HTTPS!${NC}"
        echo -e "${YELLOW}  Attendu dans: ${CERT_DIR}/${NC}"
        echo -e "${YELLOW}    - cert.pem + key.pem${NC}"
        echo -e "${YELLOW}    - localhost.pem + localhost-key.pem${NC}"
        echo -e "${YELLOW}    - ${DOMAIN}.pem + ${DOMAIN}-key.pem${NC}"
        echo ""
        echo -e "${YELLOW}Pour generer les certificats:${NC}"
        echo -e "  mkcert -install"
        echo -e "  mkcert -cert-file ${CERT_DIR}/cert.pem -key-file ${CERT_DIR}/key.pem localhost ${DOMAIN} 127.0.0.1 ::1"
        exit 1
    fi
    echo -e "${GREEN}  Certificats SSL OK${NC}"
    echo ""
fi

# Verifier les fichiers .env
echo -e "${BLUE}Verification des fichiers .env...${NC}"
MISSING_ENV=false

if [ ! -f "${GATEWAY_DIR}/.env" ]; then
    echo -e "${RED}  Manquant: ${GATEWAY_DIR}/.env${NC}"
    MISSING_ENV=true
fi

if [ ! -f "${TRANSLATOR_DIR}/.env" ]; then
    echo -e "${RED}  Manquant: ${TRANSLATOR_DIR}/.env${NC}"
    MISSING_ENV=true
fi

if [ ! -f "${WEB_DIR}/.env" ]; then
    echo -e "${RED}  Manquant: ${WEB_DIR}/.env${NC}"
    MISSING_ENV=true
fi

if [ "$MISSING_ENV" = true ]; then
    echo ""
    echo -e "${YELLOW}Executez d'abord: make setup-env${NC}"
    exit 1
fi
echo -e "${GREEN}  Fichiers .env OK${NC}"
echo ""

# Verifier les dependances
echo -e "${BLUE}Verification des dependances...${NC}"

if [ ! -d "node_modules" ]; then
    echo -e "${RED}  node_modules manquant${NC}"
    echo -e "${YELLOW}  Executez: make install${NC}"
    exit 1
fi

if [ ! -d "${TRANSLATOR_DIR}/.venv" ]; then
    echo -e "${RED}  Python venv manquant${NC}"
    echo -e "${YELLOW}  Executez: make install${NC}"
    exit 1
fi

if [ ! -d "packages/shared/dist" ]; then
    echo -e "${YELLOW}  Shared non builde, generation...${NC}"
    make generate
fi
echo -e "${GREEN}  Dependances OK${NC}"
echo ""

# Detecter le runtime JS
if command -v bun &> /dev/null; then
    JS_RUNTIME="bun"
else
    JS_RUNTIME="pnpm"
fi
echo -e "${BLUE}Runtime JS: ${JS_RUNTIME}${NC}"
echo ""

# Verifier les ports
echo -e "${BLUE}Verification des ports...${NC}"
PORTS_BUSY=false

for port in 3000 3100 8000; do
    if lsof -ti:$port >/dev/null 2>&1; then
        echo -e "${RED}  Port $port occupe${NC}"
        PORTS_BUSY=true
    fi
done

if [ "$PORTS_BUSY" = true ]; then
    echo ""
    echo -e "${YELLOW}Arretez les services existants:${NC}"
    echo -e "${YELLOW}  ./scripts/development/development-stop-local.sh${NC}"
    exit 1
fi
echo -e "${GREEN}  Ports disponibles${NC}"
echo ""

# Gestion des containers
echo -e "${BLUE}Verification de l'infrastructure...${NC}"
MONGO_OK=false
REDIS_OK=false

if nc -z localhost 27017 2>/dev/null; then
    MONGO_OK=true
    echo -e "${GREEN}  MongoDB deja accessible${NC}"
fi

if nc -z localhost 6379 2>/dev/null; then
    REDIS_OK=true
    echo -e "${GREEN}  Redis deja accessible${NC}"
fi

# Decider si on demarre les containers
SHOULD_START_CONTAINERS=false

if [ "$START_CONTAINERS" = "yes" ]; then
    SHOULD_START_CONTAINERS=true
elif [ "$START_CONTAINERS" = "no" ]; then
    # Verifier qu'ils sont disponibles
    if [ "$MONGO_OK" = false ] || [ "$REDIS_OK" = false ]; then
        echo -e "${RED}  MongoDB ou Redis non accessible!${NC}"
        echo -e "${YELLOW}  Utilisez --with-containers pour les demarrer${NC}"
        exit 1
    fi
elif [ "$START_CONTAINERS" = "auto" ]; then
    # Mode auto: demarrer si necessaire
    if [ "$MONGO_OK" = false ] || [ "$REDIS_OK" = false ]; then
        SHOULD_START_CONTAINERS=true
    fi
fi

# Demarrer les containers si necessaire
if [ "$SHOULD_START_CONTAINERS" = true ] || [ "$FORCE_CONTAINERS" = true ]; then
    if [ "$FORCE_CONTAINERS" = true ]; then
        echo -e "${YELLOW}  Redemarrage force des containers...${NC}"
        docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
    else
        echo -e "${YELLOW}  Demarrage de l'infrastructure Docker...${NC}"
    fi

    docker compose -f "$COMPOSE_FILE" up -d

    # Attendre MongoDB
    echo -e "${YELLOW}  Attente de MongoDB...${NC}"
    for i in {1..30}; do
        if nc -z localhost 27017 2>/dev/null; then
            break
        fi
        sleep 1
    done

    # Initialiser le replica set
    docker exec meeshy-dev-database mongosh --eval '
    try {
        rs.status();
    } catch (e) {
        rs.initiate({
            _id: "rs0",
            members: [{ _id: 0, host: "localhost:27017" }]
        });
    }
    ' 2>/dev/null || true

    sleep 2
    echo -e "${GREEN}  Infrastructure demarree${NC}"
else
    echo -e "${GREEN}  Infrastructure deja en cours${NC}"
fi
echo ""

# Creer les repertoires de logs
mkdir -p "${TRANSLATOR_DIR}/logs" "${GATEWAY_DIR}/logs" "${WEB_DIR}/.next"

# Demarrer les services
echo -e "${BLUE}Demarrage des services natifs...${NC}"
echo ""

# 1. Translator (Python)
echo -e "${CYAN}[1/3] Translator (port 8000)...${NC}"
cd "${TRANSLATOR_DIR}"
.venv/bin/python src/main.py > logs/translator.log 2>&1 &
TRANSLATOR_PID=$!
cd "$PROJECT_ROOT"
echo -e "${GREEN}  PID: $TRANSLATOR_PID${NC}"
sleep 3

# 2. Gateway (Node.js)
echo -e "${CYAN}[2/3] Gateway (port 3000)...${NC}"
cd "${GATEWAY_DIR}"
${JS_RUNTIME} run dev > logs/gateway.log 2>&1 &
GATEWAY_PID=$!
cd "$PROJECT_ROOT"
echo -e "${GREEN}  PID: $GATEWAY_PID${NC}"
sleep 3

# 3. Frontend (Next.js)
echo -e "${CYAN}[3/3] Frontend (port 3100)...${NC}"
cd "${WEB_DIR}"
${JS_RUNTIME} run dev > .next/frontend.log 2>&1 &
FRONTEND_PID=$!
cd "$PROJECT_ROOT"
echo -e "${GREEN}  PID: $FRONTEND_PID${NC}"
sleep 3

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}  SERVICES DEMARRES${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "${BLUE}URLs (${PROTOCOL_UPPER}):${NC}"
echo -e "  Frontend:   ${GREEN}${FRONTEND_URL}${NC}"
echo -e "  Gateway:    ${GREEN}${GATEWAY_URL}${NC}"
echo -e "  Translator: ${GREEN}${TRANSLATOR_URL}${NC}"
echo -e "  WebSocket:  ${GREEN}${WS_URL}${NC}"
echo ""
echo -e "${BLUE}Infrastructure:${NC}"
echo -e "  MongoDB:    ${GREEN}mongodb://localhost:27017${NC}"
echo -e "  Redis:      ${GREEN}redis://localhost:6379${NC}"
echo ""
echo -e "${BLUE}Logs:${NC}"
echo -e "  tail -f ${TRANSLATOR_DIR}/logs/translator.log"
echo -e "  tail -f ${GATEWAY_DIR}/logs/gateway.log"
echo -e "  tail -f ${WEB_DIR}/.next/frontend.log"
echo ""

# Afficher les variables .env importantes
if [ "$DOMAIN" != "localhost" ]; then
    echo -e "${YELLOW}Note: Verifiez que vos .env utilisent le bon domaine:${NC}"
    echo -e "  NEXT_PUBLIC_API_URL=${GATEWAY_URL}"
    echo -e "  NEXT_PUBLIC_WS_URL=${WS_URL}"
    echo -e "  FRONTEND_URL=${FRONTEND_URL}"
    echo -e "  CORS_ORIGINS=...${FRONTEND_URL}..."
    echo ""
fi

echo -e "${YELLOW}Ctrl+C pour arreter${NC}"
echo ""

# Monitoring
while true; do
    sleep 10

    if ! kill -0 "$TRANSLATOR_PID" 2>/dev/null; then
        echo -e "${RED}Translator arrete! Voir logs/translator.log${NC}"
    fi

    if ! kill -0 "$GATEWAY_PID" 2>/dev/null; then
        echo -e "${RED}Gateway arrete! Voir logs/gateway.log${NC}"
    fi

    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo -e "${RED}Frontend arrete! Voir .next/frontend.log${NC}"
    fi
done
