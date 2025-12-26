#!/bin/bash

# =============================================================================
# MEESHY - Script de setup complet pour machine vierge
# =============================================================================
# Ce script installe toutes les dépendances système nécessaires et démarre
# l'application Meeshy en ouvrant automatiquement le navigateur.
#
# Usage:
#   ./scripts/setup.sh [OPTIONS]
#
# Options:
#   --native          Lancer en mode natif (Node.js/Python locaux)
#   --docker          Lancer via Docker (images conteneurisées)
#   --skip-browser    Ne pas ouvrir le navigateur automatiquement
#   --https           Démarrer en mode HTTPS (pour iOS Safari)
#   -h, --help        Afficher cette aide
#
# Ce script fonctionne sur:
#   - Ubuntu/Debian Linux
#   - Fedora/RHEL/CentOS Linux
#   - Arch Linux
#   - macOS (avec Homebrew)
# =============================================================================

set -e

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Options par défaut
SKIP_BROWSER=false
USE_HTTPS=false
RUN_MODE=""  # "native" ou "docker"

# Parse les arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --native)
      RUN_MODE="native"
      shift
      ;;
    --docker)
      RUN_MODE="docker"
      shift
      ;;
    --skip-browser)
      SKIP_BROWSER=true
      shift
      ;;
    --https|--secure)
      USE_HTTPS=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Script de setup complet pour Meeshy sur machine vierge."
      echo "Installe automatiquement toutes les dépendances système nécessaires,"
      echo "configure l'environnement et démarre l'application."
      echo ""
      echo "Options:"
      echo "  --native          Lancer en mode natif (Bun/Python locaux) - Plus rapide au dev"
      echo "  --docker          Lancer via Docker (tout conteneurisé) - Plus simple"
      echo "  --skip-browser    Ne pas ouvrir le navigateur automatiquement"
      echo "  --https           Démarrer en mode HTTPS (pour iOS Safari)"
      echo "  -h, --help        Afficher cette aide"
      echo ""
      echo "Exemples:"
      echo "  $0                  # Menu interactif pour choisir le mode"
      echo "  $0 --native         # Setup + lancement natif"
      echo "  $0 --docker         # Setup + lancement Docker"
      echo "  $0 --native --https # Mode natif avec HTTPS"
      echo ""
      exit 0
      ;;
    *)
      echo -e "${RED}Option inconnue: $1${NC}"
      echo "Utilisez -h ou --help pour voir les options disponibles"
      exit 1
      ;;
  esac
done

# Obtenir le répertoire du projet
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

clear
echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                               ║${NC}"
echo -e "${CYAN}║     ${BOLD}MEESHY - SETUP AUTOMATIQUE POUR MACHINE VIERGE${NC}${CYAN}          ║${NC}"
echo -e "${CYAN}║                                                               ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

cd "$PROJECT_ROOT"

# =============================================================================
# Détection du système d'exploitation
# =============================================================================

detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ -f /etc/os-release ]]; then
        . /etc/os-release
        case "$ID" in
            ubuntu|debian|linuxmint|pop)
                echo "debian"
                ;;
            fedora|rhel|centos|rocky|alma)
                echo "fedora"
                ;;
            arch|manjaro|endeavouros)
                echo "arch"
                ;;
            *)
                echo "linux-unknown"
                ;;
        esac
    else
        echo "unknown"
    fi
}

OS=$(detect_os)
echo -e "${BLUE}Système détecté:${NC} $OS"
echo ""

# =============================================================================
# Menu de sélection du mode
# =============================================================================

select_run_mode() {
    if [ -n "$RUN_MODE" ]; then
        return
    fi

    echo -e "${PURPLE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║              CHOISISSEZ VOTRE MODE D'EXÉCUTION                ║${NC}"
    echo -e "${PURPLE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}  [1] ${BOLD}Mode Natif${NC} ${GREEN}(Recommandé pour le développement)${NC}"
    echo -e "      └─ Installe Bun, Python, et exécute les services localement"
    echo -e "      └─ Redémarrage rapide (~5 secondes)"
    echo -e "      └─ Hot reload instantané"
    echo -e "      └─ Nécessite: Docker uniquement pour MongoDB/Redis"
    echo ""
    echo -e "${CYAN}  [2] ${BOLD}Mode Docker${NC} ${BLUE}(Tout-en-un)${NC}"
    echo -e "      └─ Utilise les images Docker pour tous les services"
    echo -e "      └─ Aucune dépendance locale requise (sauf Docker)"
    echo -e "      └─ Redémarrage plus lent (~30-60 secondes)"
    echo -e "      └─ Isolation complète"
    echo ""

    while true; do
        read -p "Votre choix [1/2]: " choice
        case $choice in
            1)
                RUN_MODE="native"
                echo ""
                echo -e "${GREEN}Mode natif sélectionné${NC}"
                break
                ;;
            2)
                RUN_MODE="docker"
                echo ""
                echo -e "${GREEN}Mode Docker sélectionné${NC}"
                break
                ;;
            *)
                echo -e "${RED}Choix invalide. Entrez 1 ou 2.${NC}"
                ;;
        esac
    done
    echo ""
}

# =============================================================================
# Fonctions d'installation par OS
# =============================================================================

# Fonction pour demander confirmation
confirm_install() {
    local package=$1
    echo -e "${YELLOW}Le programme '$package' n'est pas installé.${NC}"
    read -p "Voulez-vous l'installer automatiquement? [O/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo -e "${RED}Installation annulée.${NC}"
        exit 1
    fi
}

# Installation de Homebrew (macOS)
install_homebrew() {
    if ! command -v brew &> /dev/null; then
        echo -e "${YELLOW}Installation de Homebrew...${NC}"
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

        # Ajouter Homebrew au PATH pour la session courante
        if [[ -f "/opt/homebrew/bin/brew" ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [[ -f "/usr/local/bin/brew" ]]; then
            eval "$(/usr/local/bin/brew shellenv)"
        fi
        echo -e "${GREEN}Homebrew installé avec succès${NC}"
    fi
}

# Installation de Bun (remplace Node.js + pnpm)
install_bun() {
    if ! command -v bun &> /dev/null; then
        confirm_install "Bun"
        echo -e "${YELLOW}Installation de Bun...${NC}"

        # Installation universelle via le script officiel
        curl -fsSL https://bun.sh/install | bash

        # Ajouter Bun au PATH pour la session courante
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"

        # Vérifier que l'installation a réussi
        if ! command -v bun &> /dev/null; then
            # Essayer de sourcer le profile
            [ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"
            [ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc"
        fi

        echo -e "${GREEN}Bun installé avec succès${NC}"
    fi

    if command -v bun &> /dev/null; then
        echo -e "${GREEN}Bun $(bun --version)${NC}"
    else
        echo -e "${RED}Bun n'a pas pu être installé. Ajoutez ~/.bun/bin à votre PATH${NC}"
        echo -e "${YELLOW}Puis relancez ce script.${NC}"
        exit 1
    fi
}

# Installation de Python (uniquement pour mode natif)
install_python() {
    if ! command -v python3 &> /dev/null; then
        confirm_install "Python 3"
        echo -e "${YELLOW}Installation de Python 3...${NC}"

        case $OS in
            macos)
                install_homebrew
                brew install python@3.12
                ;;
            debian)
                sudo apt-get update
                sudo apt-get install -y python3 python3-pip python3-venv
                ;;
            fedora)
                sudo dnf install -y python3 python3-pip
                ;;
            arch)
                sudo pacman -S --noconfirm python python-pip
                ;;
            *)
                echo -e "${RED}OS non supporté pour l'installation automatique de Python${NC}"
                exit 1
                ;;
        esac
        echo -e "${GREEN}Python installé avec succès${NC}"
    fi

    # Vérifier la version
    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
    PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d'.' -f1)
    PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d'.' -f2)

    if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 12 ]); then
        echo -e "${YELLOW}Python 3.12+ recommandé (version actuelle: $PYTHON_VERSION)${NC}"
    fi
    echo -e "${GREEN}Python $(python3 --version)${NC}"
}

# Installation de Docker
install_docker() {
    if ! command -v docker &> /dev/null; then
        confirm_install "Docker"
        echo -e "${YELLOW}Installation de Docker...${NC}"

        case $OS in
            macos)
                echo -e "${YELLOW}Sur macOS, installez Docker Desktop manuellement:${NC}"
                echo -e "${BLUE}https://www.docker.com/products/docker-desktop/${NC}"
                echo ""
                echo -e "${YELLOW}Ou via Homebrew Cask:${NC}"
                read -p "Installer Docker Desktop via Homebrew? [O/n] " -n 1 -r
                echo
                if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                    install_homebrew
                    brew install --cask docker
                    echo -e "${YELLOW}Lancez Docker Desktop depuis Applications pour terminer l'installation${NC}"
                    echo -e "${YELLOW}Puis relancez ce script.${NC}"
                    exit 0
                fi
                ;;
            debian)
                # Installation officielle Docker
                sudo apt-get update
                sudo apt-get install -y ca-certificates curl gnupg
                sudo install -m 0755 -d /etc/apt/keyrings
                curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
                sudo chmod a+r /etc/apt/keyrings/docker.gpg

                echo \
                  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
                  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
                  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

                sudo apt-get update
                sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

                # Ajouter l'utilisateur au groupe docker
                sudo usermod -aG docker $USER
                echo -e "${YELLOW}Vous devrez vous déconnecter/reconnecter pour utiliser Docker sans sudo${NC}"
                ;;
            fedora)
                sudo dnf -y install dnf-plugins-core
                sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
                sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
                sudo systemctl start docker
                sudo systemctl enable docker
                sudo usermod -aG docker $USER
                ;;
            arch)
                sudo pacman -S --noconfirm docker docker-compose
                sudo systemctl start docker
                sudo systemctl enable docker
                sudo usermod -aG docker $USER
                ;;
            *)
                echo -e "${RED}OS non supporté pour l'installation automatique de Docker${NC}"
                echo -e "${YELLOW}Installez Docker manuellement: https://docs.docker.com/engine/install/${NC}"
                exit 1
                ;;
        esac
        echo -e "${GREEN}Docker installé avec succès${NC}"
    fi

    # Vérifier que Docker daemon est en cours d'exécution
    if ! docker info &> /dev/null; then
        echo -e "${YELLOW}Docker n'est pas en cours d'exécution.${NC}"
        case $OS in
            macos)
                echo -e "${YELLOW}Lancez Docker Desktop depuis Applications${NC}"
                ;;
            *)
                echo -e "${YELLOW}Démarrage de Docker...${NC}"
                sudo systemctl start docker || true
                ;;
        esac

        # Attendre que Docker soit prêt
        echo -e "${YELLOW}Attente du démarrage de Docker...${NC}"
        for i in {1..30}; do
            if docker info &> /dev/null; then
                break
            fi
            sleep 2
        done

        if ! docker info &> /dev/null; then
            echo -e "${RED}Docker n'a pas pu démarrer.${NC}"
            echo -e "${YELLOW}Démarrez Docker manuellement puis relancez ce script.${NC}"
            exit 1
        fi
    fi
    echo -e "${GREEN}Docker $(docker --version)${NC}"
}

# Installation de docker-compose (si nécessaire)
install_docker_compose() {
    # Docker Compose v2 est inclus avec docker-compose-plugin
    if ! command -v docker-compose &> /dev/null; then
        # Vérifier si docker compose (v2) est disponible
        if docker compose version &> /dev/null; then
            echo -e "${GREEN}Docker Compose v2 disponible via 'docker compose'${NC}"
            # Créer un alias/wrapper
            if [ ! -f /usr/local/bin/docker-compose ]; then
                echo -e "${YELLOW}Création d'un wrapper pour docker-compose...${NC}"
                sudo tee /usr/local/bin/docker-compose > /dev/null << 'EOF'
#!/bin/bash
docker compose "$@"
EOF
                sudo chmod +x /usr/local/bin/docker-compose
            fi
        else
            confirm_install "docker-compose"
            echo -e "${YELLOW}Installation de docker-compose...${NC}"

            case $OS in
                macos)
                    echo -e "${GREEN}docker-compose est inclus avec Docker Desktop${NC}"
                    ;;
                debian|fedora)
                    sudo apt-get install -y docker-compose-plugin 2>/dev/null || \
                    sudo dnf install -y docker-compose-plugin 2>/dev/null || true
                    ;;
                arch)
                    sudo pacman -S --noconfirm docker-compose
                    ;;
            esac
        fi
    fi

    # Vérification finale
    if command -v docker-compose &> /dev/null; then
        echo -e "${GREEN}docker-compose $(docker-compose --version)${NC}"
    elif docker compose version &> /dev/null; then
        echo -e "${GREEN}docker compose $(docker compose version)${NC}"
    fi
}

# Installation des dépendances système supplémentaires
install_system_deps() {
    echo -e "${BLUE}Vérification des dépendances système...${NC}"

    case $OS in
        debian)
            DEPS_TO_INSTALL=""
            command -v curl &> /dev/null || DEPS_TO_INSTALL="$DEPS_TO_INSTALL curl"
            command -v git &> /dev/null || DEPS_TO_INSTALL="$DEPS_TO_INSTALL git"
            command -v nc &> /dev/null || DEPS_TO_INSTALL="$DEPS_TO_INSTALL netcat-openbsd"
            command -v lsof &> /dev/null || DEPS_TO_INSTALL="$DEPS_TO_INSTALL lsof"
            command -v unzip &> /dev/null || DEPS_TO_INSTALL="$DEPS_TO_INSTALL unzip"

            if [ -n "$DEPS_TO_INSTALL" ]; then
                echo -e "${YELLOW}Installation des dépendances:$DEPS_TO_INSTALL${NC}"
                sudo apt-get update
                sudo apt-get install -y $DEPS_TO_INSTALL
            fi
            ;;
        fedora)
            DEPS_TO_INSTALL=""
            command -v curl &> /dev/null || DEPS_TO_INSTALL="$DEPS_TO_INSTALL curl"
            command -v git &> /dev/null || DEPS_TO_INSTALL="$DEPS_TO_INSTALL git"
            command -v nc &> /dev/null || DEPS_TO_INSTALL="$DEPS_TO_INSTALL nc"
            command -v lsof &> /dev/null || DEPS_TO_INSTALL="$DEPS_TO_INSTALL lsof"
            command -v unzip &> /dev/null || DEPS_TO_INSTALL="$DEPS_TO_INSTALL unzip"

            if [ -n "$DEPS_TO_INSTALL" ]; then
                sudo dnf install -y $DEPS_TO_INSTALL
            fi
            ;;
        arch)
            DEPS_TO_INSTALL=""
            command -v curl &> /dev/null || DEPS_TO_INSTALL="$DEPS_TO_INSTALL curl"
            command -v git &> /dev/null || DEPS_TO_INSTALL="$DEPS_TO_INSTALL git"
            command -v nc &> /dev/null || DEPS_TO_INSTALL="$DEPS_TO_INSTALL openbsd-netcat"
            command -v lsof &> /dev/null || DEPS_TO_INSTALL="$DEPS_TO_INSTALL lsof"
            command -v unzip &> /dev/null || DEPS_TO_INSTALL="$DEPS_TO_INSTALL unzip"

            if [ -n "$DEPS_TO_INSTALL" ]; then
                sudo pacman -S --noconfirm $DEPS_TO_INSTALL
            fi
            ;;
        macos)
            install_homebrew
            command -v git &> /dev/null || brew install git
            ;;
    esac

    echo -e "${GREEN}Dépendances système OK${NC}"
}

# Fonction pour ouvrir le navigateur
open_browser() {
    local url=$1

    echo -e "${BLUE}Ouverture du navigateur...${NC}"

    case $OS in
        macos)
            open "$url"
            ;;
        *)
            # Linux - essayer différentes commandes
            if command -v xdg-open &> /dev/null; then
                xdg-open "$url" &> /dev/null &
            elif command -v gnome-open &> /dev/null; then
                gnome-open "$url" &> /dev/null &
            elif command -v kde-open &> /dev/null; then
                kde-open "$url" &> /dev/null &
            elif command -v sensible-browser &> /dev/null; then
                sensible-browser "$url" &> /dev/null &
            elif [ -n "$BROWSER" ]; then
                $BROWSER "$url" &> /dev/null &
            else
                echo -e "${YELLOW}Impossible d'ouvrir le navigateur automatiquement${NC}"
                echo -e "${BLUE}Ouvrez manuellement: $url${NC}"
            fi
            ;;
    esac
}

# =============================================================================
# Sélection du mode
# =============================================================================

select_run_mode

# =============================================================================
# Installation principale
# =============================================================================

echo -e "${PURPLE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║         ÉTAPE 1: Installation des programmes système          ║${NC}"
echo -e "${PURPLE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

install_system_deps
install_docker
install_docker_compose

if [ "$RUN_MODE" = "native" ]; then
    install_bun
    install_python
fi

echo ""
echo -e "${GREEN}Tous les programmes système sont installés !${NC}"
echo ""

# =============================================================================
# Installation des dépendances du projet
# =============================================================================

if [ "$RUN_MODE" = "native" ]; then
    echo -e "${PURPLE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║         ÉTAPE 2: Installation des dépendances du projet       ║${NC}"
    echo -e "${PURPLE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    echo -e "${BLUE}Installation des dépendances avec Bun...${NC}"

    # S'assurer que bun est dans le PATH
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    bun install

    echo ""
    echo -e "${GREEN}Dépendances du projet installées !${NC}"
    echo ""
fi

# =============================================================================
# Démarrage de l'application
# =============================================================================

echo -e "${PURPLE}╔═══════════════════════════════════════════════════════════════╗${NC}"
if [ "$RUN_MODE" = "native" ]; then
    echo -e "${PURPLE}║      ÉTAPE 3: Démarrage de l'application (Mode Natif)         ║${NC}"
else
    echo -e "${PURPLE}║      ÉTAPE 3: Démarrage de l'application (Mode Docker)        ║${NC}"
fi
echo -e "${PURPLE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

FRONTEND_URL="http://localhost:3100"
if [ "$USE_HTTPS" = true ]; then
    FRONTEND_URL="https://localhost:3100"
fi

if [ "$RUN_MODE" = "docker" ]; then
    # ==========================================================================
    # MODE DOCKER - Tout en conteneurs
    # ==========================================================================

    echo -e "${BLUE}Démarrage de tous les services via Docker Compose...${NC}"
    echo ""

    COMPOSE_FILE="$PROJECT_ROOT/infrastructure/docker/compose/docker-compose.dev.yml"

    if [ ! -f "$COMPOSE_FILE" ]; then
        echo -e "${RED}Fichier docker-compose non trouvé: $COMPOSE_FILE${NC}"
        exit 1
    fi

    # Démarrer tous les services
    docker-compose -f "$COMPOSE_FILE" up -d

    echo ""
    echo -e "${YELLOW}Attente du démarrage des services...${NC}"

    # Attendre que les services soient prêts
    MAX_WAIT=120
    WAIT_COUNT=0
    STARTUP_COMPLETE=false

    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
        if curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" 2>/dev/null | grep -q "200\|301\|302"; then
            STARTUP_COMPLETE=true
            break
        fi

        sleep 2
        WAIT_COUNT=$((WAIT_COUNT + 2))
        echo -ne "\r${BLUE}Attente... ${WAIT_COUNT}s / ${MAX_WAIT}s${NC}    "
    done

    echo ""

    if [ "$STARTUP_COMPLETE" = true ]; then
        echo ""
        echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║                    MEESHY EST PRÊT !                          ║${NC}"
        echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${CYAN}URLs disponibles:${NC}"
        echo -e "  ${PURPLE}Frontend:${NC}      $FRONTEND_URL"
        echo -e "  ${PURPLE}Gateway API:${NC}   http://localhost:3000"
        echo -e "  ${PURPLE}Translator:${NC}    http://localhost:8000"
        echo -e "  ${PURPLE}MongoDB UI:${NC}    http://localhost:3001"
        echo -e "  ${PURPLE}Redis UI:${NC}      http://localhost:7843"
        echo ""
        echo -e "${CYAN}Comptes par défaut:${NC}"
        echo -e "  ${BLUE}Admin:${NC}    admin@meeshy.local / admin123"
        echo -e "  ${BLUE}Meeshy:${NC}   meeshy@meeshy.local / meeshy123"
        echo ""

        # Ouvrir le navigateur si demandé
        if [ "$SKIP_BROWSER" = false ]; then
            sleep 2
            open_browser "$FRONTEND_URL"
            echo -e "${GREEN}Navigateur ouvert sur $FRONTEND_URL${NC}"
        fi

        echo ""
        echo -e "${YELLOW}Commandes utiles:${NC}"
        echo -e "  ${BLUE}Voir les logs:${NC}     docker-compose -f $COMPOSE_FILE logs -f"
        echo -e "  ${BLUE}Arrêter:${NC}           docker-compose -f $COMPOSE_FILE down"
        echo -e "  ${BLUE}Redémarrer:${NC}        docker-compose -f $COMPOSE_FILE restart"
        echo ""
    else
        echo -e "${RED}Les services n'ont pas démarré dans le temps imparti${NC}"
        echo -e "${YELLOW}Vérifiez les logs: docker-compose -f $COMPOSE_FILE logs${NC}"
        exit 1
    fi

else
    # ==========================================================================
    # MODE NATIF - Services locaux avec Bun
    # ==========================================================================

    # Préparer le script de développement
    DEV_SCRIPT="$PROJECT_ROOT/scripts/development/development-start-local.sh"

    if [ ! -f "$DEV_SCRIPT" ]; then
        echo -e "${RED}Script de démarrage non trouvé: $DEV_SCRIPT${NC}"
        exit 1
    fi

    chmod +x "$DEV_SCRIPT"

    # Construire les arguments
    DEV_ARGS="--with-containers"
    if [ "$USE_HTTPS" = true ]; then
        DEV_ARGS="$DEV_ARGS --https"
    fi

    echo -e "${BLUE}Démarrage des services en mode natif...${NC}"
    echo ""

    # Lancer le script de développement
    $DEV_SCRIPT $DEV_ARGS &
    DEV_PID=$!

    # Attendre que les services soient prêts
    echo -e "${YELLOW}Attente du démarrage des services...${NC}"

    MAX_WAIT=120
    WAIT_COUNT=0
    STARTUP_COMPLETE=false

    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
        if curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" 2>/dev/null | grep -q "200\|301\|302"; then
            STARTUP_COMPLETE=true
            break
        fi

        # Vérifier que le processus de développement est toujours en cours
        if ! kill -0 $DEV_PID 2>/dev/null; then
            echo -e "${RED}Le script de développement s'est arrêté de manière inattendue${NC}"
            exit 1
        fi

        sleep 2
        WAIT_COUNT=$((WAIT_COUNT + 2))
        echo -ne "\r${BLUE}Attente... ${WAIT_COUNT}s / ${MAX_WAIT}s${NC}    "
    done

    echo ""

    if [ "$STARTUP_COMPLETE" = true ]; then
        echo ""
        echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║                    MEESHY EST PRÊT !                          ║${NC}"
        echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${CYAN}URLs disponibles:${NC}"
        echo -e "  ${PURPLE}Frontend:${NC}     $FRONTEND_URL"
        echo -e "  ${PURPLE}Gateway API:${NC}  http://localhost:3000"
        echo -e "  ${PURPLE}Translator:${NC}   http://localhost:8000"
        echo ""

        # Ouvrir le navigateur si demandé
        if [ "$SKIP_BROWSER" = false ]; then
            sleep 2
            open_browser "$FRONTEND_URL"
            echo -e "${GREEN}Navigateur ouvert sur $FRONTEND_URL${NC}"
        fi

        echo ""
        echo -e "${YELLOW}Appuyez sur Ctrl+C pour arrêter tous les services${NC}"
        echo ""

        # Attendre le script de développement
        wait $DEV_PID
    else
        echo -e "${RED}Les services n'ont pas démarré dans le temps imparti${NC}"
        echo -e "${YELLOW}Vérifiez les logs pour plus de détails${NC}"
        kill $DEV_PID 2>/dev/null
        exit 1
    fi
fi
