#!/bin/bash

# ============================================================================
# MEESHY - Script d'arret developpement local
# Arrete les services natifs et optionnellement les conteneurs Docker
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
COMPOSE_DIR="infrastructure/docker/compose"
COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.dev.yml"

# Parse arguments
STOP_CONTAINERS=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --with-containers)
      STOP_CONTAINERS=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --with-containers  Arreter aussi MongoDB/Redis"
      echo "  -h, --help         Affiche cette aide"
      exit 0
      ;;
    *)
      echo -e "${RED}Option inconnue: $1${NC}"
      exit 1
      ;;
  esac
done

cd "$PROJECT_ROOT"

echo -e "${CYAN}======================================${NC}"
echo -e "${CYAN}  MEESHY - Arret des services${NC}"
echo -e "${CYAN}======================================${NC}"
echo ""

# Fonction pour tuer les processus sur un port
kill_port() {
    local port=$1
    local service=$2

    local pids=$(lsof -ti:$port 2>/dev/null || true)

    if [ -n "$pids" ]; then
        echo -e "${YELLOW}Arret de $service (port $port)...${NC}"
        echo "$pids" | xargs kill -TERM 2>/dev/null || true
        sleep 1

        # Force kill si necessaire
        pids=$(lsof -ti:$port 2>/dev/null || true)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -9 2>/dev/null || true
        fi
        echo -e "${GREEN}  $service arrete${NC}"
    else
        echo -e "${GREEN}  $service deja arrete${NC}"
    fi
}

# Arreter les services natifs
echo -e "${BLUE}Arret des services natifs...${NC}"
kill_port 8000 "Translator"
kill_port 3000 "Gateway"
kill_port 3100 "Frontend"
echo ""

# Arreter les conteneurs Docker (optionnel)
if [ "$STOP_CONTAINERS" = true ]; then
    echo -e "${BLUE}Arret des conteneurs Docker...${NC}"
    docker compose -f "$COMPOSE_FILE" stop 2>/dev/null || true
    echo -e "${GREEN}  Conteneurs arretes${NC}"
else
    echo -e "${CYAN}Les conteneurs Docker restent actifs${NC}"
    echo -e "${CYAN}  Pour les arreter: $0 --with-containers${NC}"
fi
echo ""

# Nettoyage des logs
echo -e "${BLUE}Nettoyage des logs...${NC}"
rm -f services/translator/logs/*.log 2>/dev/null || true
rm -f services/gateway/logs/*.log 2>/dev/null || true
rm -f apps/web/.next/frontend.log 2>/dev/null || true
echo -e "${GREEN}  Logs nettoyes${NC}"
echo ""

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}  Environnement arrete${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "${BLUE}Pour redemarrer:${NC}"
echo -e "  ./scripts/development/development-start-local.sh"
echo ""
