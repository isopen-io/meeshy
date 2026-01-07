#!/bin/bash

# ============================================================================
# MEESHY - Script de demarrage developpement local
# Demarre MongoDB + Redis en Docker, services natifs avec Bun
# Accessible sur https://meeshy.local (configurer /etc/hosts)
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
LOCAL_DOMAIN="${LOCAL_DOMAIN:-meeshy.local}"

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

# Parse arguments
FORCE_CONTAINERS=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --force-containers)
      FORCE_CONTAINERS=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --force-containers  Forcer le redemarrage des containers"
      echo "  -h, --help          Affiche cette aide"
      echo ""
      echo "Note: Les containers sont demarres automatiquement si necessaire"
      echo ""
      echo "Prerequis:"
      echo "  - make install   (installer les dependances)"
      echo "  - make setup-env (generer les fichiers .env)"
      exit 0
      ;;
    *)
      echo -e "${RED}Option inconnue: $1${NC}"
      exit 1
      ;;
  esac
done

cd "$PROJECT_ROOT"

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

# Verifier les prerequis
echo -e "${CYAN}======================================${NC}"
echo -e "${CYAN}  MEESHY - Developpement Local${NC}"
echo -e "${CYAN}======================================${NC}"
echo ""

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

# Verifier si l'infrastructure est deja en cours
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

# Demarrer les containers si necessaire ou force
if [ "$MONGO_OK" = false ] || [ "$REDIS_OK" = false ] || [ "$FORCE_CONTAINERS" = true ]; then
    if [ "$FORCE_CONTAINERS" = true ]; then
        echo -e "${YELLOW}  Redemarrage force des containers...${NC}"
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

    echo -e "${GREEN}  Infrastructure demarree${NC}"
else
    echo -e "${GREEN}  Infrastructure deja en cours${NC}"
fi
echo ""

# Creer les repertoires de logs
mkdir -p "${TRANSLATOR_DIR}/logs" "${GATEWAY_DIR}/logs"

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
echo -e "${BLUE}URLs:${NC}"
echo -e "  Frontend:   ${GREEN}http://localhost:3100${NC}"
echo -e "  Gateway:    ${GREEN}http://localhost:3000${NC}"
echo -e "  Translator: ${GREEN}http://localhost:8000${NC}"
echo -e "  MongoDB:    ${GREEN}mongodb://localhost:27017${NC}"
echo -e "  Redis:      ${GREEN}redis://localhost:6379${NC}"
echo ""
echo -e "${BLUE}Logs:${NC}"
echo -e "  tail -f ${TRANSLATOR_DIR}/logs/translator.log"
echo -e "  tail -f ${GATEWAY_DIR}/logs/gateway.log"
echo -e "  tail -f ${WEB_DIR}/.next/frontend.log"
echo ""
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
