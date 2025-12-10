#!/bin/bash
# ===========================================
# Meeshy - Démarrage local sans Docker
# Supporte: bun, pnpm, npm
# ===========================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Répertoire racine
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Détection du package manager
detect_pm() {
    if command -v bun &> /dev/null; then
        echo "bun"
    elif command -v pnpm &> /dev/null; then
        echo "pnpm"
    elif command -v npm &> /dev/null; then
        echo "npm"
    else
        echo ""
    fi
}

PM="${MEESHY_PM:-$(detect_pm)}"

if [ -z "$PM" ]; then
    echo -e "${RED}❌ Aucun package manager trouvé (bun, pnpm, npm)${NC}"
    exit 1
fi

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          MEESHY - Démarrage Local (${PM})              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Vérification des services externes
check_services() {
    echo -e "${YELLOW}🔍 Vérification des services externes...${NC}"

    # MongoDB
    if command -v mongosh &> /dev/null; then
        if mongosh --eval "db.runCommand({ping:1})" --quiet &> /dev/null; then
            echo -e "  ${GREEN}✓${NC} MongoDB accessible"
        else
            echo -e "  ${RED}✗${NC} MongoDB non accessible (lancez mongod ou utilisez Docker)"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} mongosh non installé - vérifiez MongoDB manuellement"
    fi

    # Redis
    if command -v redis-cli &> /dev/null; then
        if redis-cli ping &> /dev/null; then
            echo -e "  ${GREEN}✓${NC} Redis accessible"
        else
            echo -e "  ${RED}✗${NC} Redis non accessible (lancez redis-server ou utilisez Docker)"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} redis-cli non installé - vérifiez Redis manuellement"
    fi
    echo ""
}

# Installation des dépendances
install_deps() {
    echo -e "${BLUE}📦 Installation des dépendances avec ${PM}...${NC}"

    case $PM in
        bun)
            bun install
            ;;
        pnpm)
            pnpm install
            ;;
        npm)
            npm install
            ;;
    esac

    echo -e "${GREEN}✓ Dépendances installées${NC}"
    echo ""
}

# Génération Prisma
generate_prisma() {
    echo -e "${BLUE}🔧 Génération des clients Prisma...${NC}"

    case $PM in
        bun)
            bun run --cwd packages/shared prisma generate
            ;;
        pnpm)
            pnpm --filter @meeshy/shared exec prisma generate
            ;;
        npm)
            npm run generate --workspace=@meeshy/shared
            ;;
    esac

    echo -e "${GREEN}✓ Prisma généré${NC}"
    echo ""
}

# Démarrage des services Node.js
start_node_services() {
    echo -e "${BLUE}🚀 Démarrage des services...${NC}"
    echo ""

    # Créer un dossier pour les logs
    mkdir -p "$ROOT_DIR/logs"

    # Gateway
    echo -e "  ${YELLOW}→${NC} Démarrage Gateway (port 3000)..."
    case $PM in
        bun)
            (cd services/gateway && bun run dev) &
            ;;
        pnpm)
            pnpm --filter @meeshy/gateway run dev &
            ;;
        npm)
            npm run dev --workspace=@meeshy/gateway &
            ;;
    esac
    GATEWAY_PID=$!
    echo $GATEWAY_PID > "$ROOT_DIR/logs/gateway.pid"

    sleep 2

    # Web
    echo -e "  ${YELLOW}→${NC} Démarrage Web (port 3100)..."
    case $PM in
        bun)
            (cd apps/web && bun run dev) &
            ;;
        pnpm)
            pnpm --filter @meeshy/web run dev &
            ;;
        npm)
            npm run dev --workspace=@meeshy/web &
            ;;
    esac
    WEB_PID=$!
    echo $WEB_PID > "$ROOT_DIR/logs/web.pid"

    echo ""
    echo -e "${GREEN}✨ Services Node.js démarrés!${NC}"
}

# Démarrage du translator Python
start_translator() {
    echo -e "${BLUE}🐍 Démarrage Translator Python (port 8000)...${NC}"

    cd "$ROOT_DIR/services/translator"

    # Vérifier/créer le venv
    if [ ! -d ".venv" ]; then
        echo -e "  ${YELLOW}→${NC} Création de l'environnement virtuel..."
        python3 -m venv .venv
    fi

    source .venv/bin/activate

    # Installer les dépendances si nécessaire
    if [ ! -f ".venv/.deps_installed" ]; then
        echo -e "  ${YELLOW}→${NC} Installation des dépendances Python..."
        pip install -r requirements.txt -q
        touch .venv/.deps_installed
    fi

    # Démarrer uvicorn
    echo -e "  ${YELLOW}→${NC} Démarrage uvicorn..."
    uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload &
    TRANSLATOR_PID=$!
    echo $TRANSLATOR_PID > "$ROOT_DIR/logs/translator.pid"

    cd "$ROOT_DIR"
    echo -e "${GREEN}✓ Translator démarré${NC}"
    echo ""
}

# Afficher les URLs
show_urls() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                    URLs d'accès                         ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "   Frontend:        ${GREEN}http://localhost:3100${NC}"
    echo -e "   Gateway API:     ${GREEN}http://localhost:3000${NC}"
    echo -e "   Translator API:  ${GREEN}http://localhost:8000${NC}"
    echo ""
    echo -e "${YELLOW}Pour arrêter: ./scripts/stop-local.sh${NC}"
    echo ""
}

# Fonction stop
stop_all() {
    echo -e "${YELLOW}⏹️  Arrêt des services...${NC}"

    for pidfile in "$ROOT_DIR/logs"/*.pid; do
        if [ -f "$pidfile" ]; then
            pid=$(cat "$pidfile")
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null || true
            fi
            rm -f "$pidfile"
        fi
    done

    echo -e "${GREEN}✓ Services arrêtés${NC}"
}

# Main
case "${1:-start}" in
    start)
        check_services
        install_deps
        generate_prisma
        start_node_services
        start_translator
        show_urls

        # Attendre Ctrl+C
        echo -e "${YELLOW}Appuyez sur Ctrl+C pour arrêter tous les services${NC}"
        trap stop_all EXIT
        wait
        ;;
    stop)
        stop_all
        ;;
    install)
        install_deps
        generate_prisma
        ;;
    web)
        case $PM in
            bun) (cd apps/web && bun run dev) ;;
            pnpm) pnpm --filter @meeshy/web run dev ;;
            npm) npm run dev --workspace=@meeshy/web ;;
        esac
        ;;
    gateway)
        case $PM in
            bun) (cd services/gateway && bun run dev) ;;
            pnpm) pnpm --filter @meeshy/gateway run dev ;;
            npm) npm run dev --workspace=@meeshy/gateway ;;
        esac
        ;;
    translator)
        start_translator
        wait
        ;;
    *)
        echo "Usage: $0 {start|stop|install|web|gateway|translator}"
        exit 1
        ;;
esac
