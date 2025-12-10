#!/bin/bash

# 🛑 Script d'arrêt pour l'environnement de développement LOCAL
# Ce script arrête tous les services Meeshy démarrés en mode développement
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
      echo "  --with-containers    Arrête aussi les conteneurs Docker (MongoDB, Redis)"
      echo "  -h, --help          Affiche cette aide"
      echo ""
      echo "Par défaut, seuls les services natifs (Node.js, Python) sont arrêtés."
      echo "Les conteneurs Docker restent actifs sauf si --with-containers est spécifié."
      exit 0
      ;;
    *)
      echo -e "${RED}❌ Option inconnue: $1${NC}"
      echo "Utilisez -h ou --help pour voir les options disponibles"
      exit 1
      ;;
  esac
done

echo -e "${CYAN}🛑 Arrêt de l'environnement Meeshy LOCAL (DEV)${NC}"
if [ "$STOP_CONTAINERS" = true ]; then
  echo -e "${YELLOW}   Mode: Services natifs + Conteneurs Docker${NC}"
else
  echo -e "${YELLOW}   Mode: Services natifs uniquement${NC}"
fi
echo ""

# Fonction pour arrêter un processus par nom
kill_process_by_name() {
    local process_name=$1
    local service_name=$2
    
    echo -e "${YELLOW}🔍 Recherche des processus $service_name...${NC}"
    
    local pids=$(pgrep -f "$process_name" 2>/dev/null || true)
    
    if [ -n "$pids" ]; then
        echo -e "${BLUE}📋 PIDs trouvés pour $service_name: $pids${NC}"
        
        for pid in $pids; do
            echo -e "${YELLOW}🛑 Arrêt du processus $service_name (PID: $pid)...${NC}"
            if kill -TERM "$pid" 2>/dev/null; then
                echo -e "${GREEN}✅ Processus $pid arrêté (SIGTERM)${NC}"
                # Attendre un peu pour l'arrêt gracieux
                sleep 2
                
                # Vérifier si le processus est toujours en cours
                if kill -0 "$pid" 2>/dev/null; then
                    echo -e "${YELLOW}⚠️  Processus $pid toujours actif, arrêt forcé...${NC}"
                    kill -KILL "$pid" 2>/dev/null || true
                    echo -e "${GREEN}✅ Processus $pid arrêté (SIGKILL)${NC}"
                fi
            else
                echo -e "${RED}❌ Impossible d'arrêter le processus $pid${NC}"
            fi
        done
    else
        echo -e "${GREEN}✅ Aucun processus $service_name en cours${NC}"
    fi
}

# Fonction pour vérifier si un port est libre
check_port_free() {
    local port=$1
    local service=$2
    
    if lsof -ti:$port >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Port $port encore occupé ($service)${NC}"
        return 1
    else
        echo -e "${GREEN}✅ Port $port libéré ($service)${NC}"
        return 0
    fi
}

# Arrêt des services Node.js
echo -e "${BLUE}🛑 Arrêt des services Node.js...${NC}"

# Arrêter le Frontend
kill_process_by_name "node.*server.js" "Frontend"
kill_process_by_name "next.*start" "Frontend (Next.js)"
kill_process_by_name "frontend.sh" "Frontend Script"

# Arrêter le Gateway
kill_process_by_name "node.*gateway" "Gateway"
kill_process_by_name "gateway.sh" "Gateway Script"

# Arrêter le Translator
kill_process_by_name "python.*main.py" "Translator"
kill_process_by_name "uvicorn.*main" "Translator (Uvicorn)"
kill_process_by_name "translator.sh" "Translator Script"

# Attendre un peu pour que les processus se terminent
echo -e "${YELLOW}⏳ Attente de l'arrêt des services...${NC}"
sleep 3

# Vérification des ports
echo -e "${BLUE}🔍 Vérification de la libération des ports...${NC}"
check_port_free 3000 "Gateway"
check_port_free 3100 "Frontend"
check_port_free 8000 "Translator"

# Arrêt des services Docker (optionnel)
if [ "$STOP_CONTAINERS" = true ]; then
  echo -e "${BLUE}🐳 Arrêt des services Docker (Infrastructure uniquement)...${NC}"
  cd /Users/smpceo/Documents/Services/Meeshy/meeshy

  # Arrêter les services Docker de développement (infrastructure uniquement)
  echo -e "${YELLOW}🛑 Arrêt des conteneurs Docker (MongoDB, Redis)...${NC}"
  docker-compose -f docker-compose.local.yml stop 2>/dev/null || true

  # Optionnel: supprimer les conteneurs (décommentez si nécessaire)
  # echo -e "${YELLOW}🗑️  Suppression des conteneurs...${NC}"
  # docker-compose -f docker-compose.local.yml rm -f 2>/dev/null || true

  echo -e "${BLUE}📊 Statut des conteneurs Docker:${NC}"
  docker-compose -f docker-compose.local.yml ps 2>/dev/null || echo "Aucun conteneur Docker en cours"
else
  echo -e "${CYAN}ℹ️  Les conteneurs Docker (MongoDB, Redis) restent actifs${NC}"
  echo -e "${CYAN}   Pour les arrêter aussi, utilisez: $0 --with-containers${NC}"
fi

lsof -ti:3000 -ti:3100 -ti:8000 | xargs kill -9 2>/dev/null || true

# Nettoyage des fichiers de logs (optionnel)
echo -e "${BLUE}🧹 Nettoyage des fichiers de logs...${NC}"

if [ -f "/Users/smpceo/Documents/Services/Meeshy/meeshy/translator/translator.log" ]; then
    echo -e "${YELLOW}🗑️  Suppression de translator.log${NC}"
    rm -f "/Users/smpceo/Documents/Services/Meeshy/meeshy/translator/translator.log"
fi

if [ -f "/Users/smpceo/Documents/Services/Meeshy/meeshy/gateway/gateway.log" ]; then
    echo -e "${YELLOW}🗑️  Suppression de gateway.log${NC}"
    rm -f "/Users/smpceo/Documents/Services/Meeshy/meeshy/gateway/gateway.log"
fi

if [ -f "/Users/smpceo/Documents/Services/Meeshy/meeshy/frontend/frontend.log" ]; then
    echo -e "${YELLOW}🗑️  Suppression de frontend.log${NC}"
    rm -f "/Users/smpceo/Documents/Services/Meeshy/meeshy/frontend/frontend.log"
fi

echo ""
echo -e "${GREEN}✅ Environnement Meeshy LOCAL arrêté avec succès !${NC}"
echo ""
echo -e "${CYAN}📋 Résumé:${NC}"
echo -e "  ${GREEN}Services Node.js:${NC} Arrêtés"
if [ "$STOP_CONTAINERS" = true ]; then
  echo -e "  ${GREEN}Services Docker:${NC} Arrêtés"
else
  echo -e "  ${YELLOW}Services Docker:${NC} Toujours actifs (MongoDB, Redis)"
fi
echo -e "  ${GREEN}Ports (3000, 3100, 8000):${NC} Libérés"
echo -e "  ${GREEN}Logs:${NC} Nettoyés"
echo ""
echo -e "${PURPLE}🚀 Pour redémarrer l'environnement:${NC}"
if [ "$STOP_CONTAINERS" = true ]; then
  echo -e "  ${YELLOW}./scripts/development/development-start-local.sh --with-containers${NC}"
else
  echo -e "  ${YELLOW}./scripts/development/development-start-local.sh${NC}"
fi
echo ""
