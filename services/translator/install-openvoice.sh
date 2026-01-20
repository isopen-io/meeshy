#!/bin/bash

# =============================================================================
# Installation conditionnelle d'OpenVoice pour le service translator
# =============================================================================
# OpenVoice nécessite Python 3.9-3.10 à cause de dépendances PyAV anciennes
# Ce script détecte la version Python et installe OpenVoice si compatible
#
# Usage:
#   ./install-openvoice.sh               # Installation automatique si possible
#   ./install-openvoice.sh --force-py39  # Force utilisation Python 3.9 (pyenv)
#   ./install-openvoice.sh --skip        # Skip installation (use Chatterbox only)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORCE_PY39=false
SKIP_INSTALL=false

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parser les arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --force-py39)
            FORCE_PY39=true
            shift
            ;;
        --skip)
            SKIP_INSTALL=true
            shift
            ;;
        *)
            echo -e "${RED}❌ Argument inconnu: $1${NC}"
            exit 1
            ;;
    esac
done

if [ "$SKIP_INSTALL" = true ]; then
    echo -e "${YELLOW}⏭️  Installation OpenVoice ignorée (--skip)${NC}"
    echo -e "${BLUE}ℹ️  Le clonage vocal utilisera Chatterbox Multilingual uniquement${NC}"
    exit 0
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Installation OpenVoice pour Clonage Vocal Avancé         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Fonction pour vérifier la version Python
check_python_version() {
    local python_cmd=$1
    if ! command -v "$python_cmd" &> /dev/null; then
        return 1
    fi

    local version=$($python_cmd --version 2>&1 | awk '{print $2}')
    local major=$(echo $version | cut -d. -f1)
    local minor=$(echo $version | cut -d. -f2)

    # OpenVoice nécessite Python 3.9 ou 3.10 (PyAV ne compile pas sur 3.11+)
    if [ "$major" -eq 3 ] && [ "$minor" -ge 9 ] && [ "$minor" -le 10 ]; then
        echo "$python_cmd"
        return 0
    fi
    return 1
}

# Trouver Python compatible
COMPATIBLE_PYTHON=""

if [ "$FORCE_PY39" = true ]; then
    echo -e "${YELLOW}🔧 Mode forcé: recherche de Python 3.9 via pyenv...${NC}"
    if command -v pyenv &> /dev/null; then
        PYENV_VERSION=$(pyenv versions --bare 2>/dev/null | grep "^3\.9" | head -1)
        if [ -n "$PYENV_VERSION" ]; then
            COMPATIBLE_PYTHON="python"
            export PYENV_VERSION
            echo -e "${GREEN}✅ Python 3.9 trouvé via pyenv: $PYENV_VERSION${NC}"
        else
            echo -e "${RED}❌ Python 3.9 non trouvé dans pyenv${NC}"
            echo -e "${YELLOW}💡 Installez Python 3.9: pyenv install 3.9${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ pyenv non disponible${NC}"
        exit 1
    fi
else
    # Essayer de trouver Python compatible automatiquement
    for py_cmd in python3.10 python3.9 python3 python; do
        if check_python_version "$py_cmd" > /dev/null 2>&1; then
            COMPATIBLE_PYTHON=$(check_python_version "$py_cmd")
            break
        fi
    done
fi

if [ -z "$COMPATIBLE_PYTHON" ]; then
    echo -e "${YELLOW}⚠️  Python 3.9-3.10 non trouvé${NC}"
    echo ""
    echo -e "${BLUE}ℹ️  OpenVoice nécessite Python 3.9 ou 3.10 (dépendance PyAV)${NC}"
    echo -e "${BLUE}   Votre Python actuel ($($COMPATIBLE_PYTHON --version 2>&1 | awk '{print $2}' || echo 'inconnu')) est incompatible${NC}"
    echo ""
    echo -e "${GREEN}✅ Solution: Le clonage vocal fonctionnera avec Chatterbox Multilingual${NC}"
    echo -e "${BLUE}   - Supporte 23 langues${NC}"
    echo -e "${BLUE}   - Clonage vocal natif de haute qualité${NC}"
    echo -e "${BLUE}   - Aucune installation supplémentaire requise${NC}"
    echo ""
    echo -e "${YELLOW}💡 Pour installer OpenVoice plus tard:${NC}"
    echo -e "   1. Installez Python 3.9: ${YELLOW}pyenv install 3.9${NC}"
    echo -e "   2. Relancez: ${YELLOW}./install-openvoice.sh --force-py39${NC}"
    echo ""
    exit 0
fi

PYTHON_VERSION=$($COMPATIBLE_PYTHON --version 2>&1 | awk '{print $2}')
echo -e "${GREEN}✅ Python compatible trouvé: $PYTHON_VERSION${NC}"
echo ""

# Activer l'environnement virtuel s'il existe
if [ -f "${SCRIPT_DIR}/.venv/bin/activate" ]; then
    source "${SCRIPT_DIR}/.venv/bin/activate"
    echo -e "${GREEN}✅ Environnement virtuel activé${NC}"
else
    echo -e "${YELLOW}⚠️  Environnement virtuel non trouvé. Créez-le d'abord avec install-local.sh${NC}"
    exit 1
fi

# Vérifier que nous utilisons bien le bon Python dans le venv
VENV_PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}')
VENV_MAJOR=$(echo $VENV_PYTHON_VERSION | cut -d. -f1)
VENV_MINOR=$(echo $VENV_PYTHON_VERSION | cut -d. -f2)

if [ "$VENV_MAJOR" -ne 3 ] || [ "$VENV_MINOR" -gt 10 ]; then
    echo -e "${RED}❌ L'environnement virtuel utilise Python $VENV_PYTHON_VERSION (incompatible)${NC}"
    echo -e "${YELLOW}💡 Recréez le venv avec Python 3.9 ou 3.10:${NC}"
    echo -e "   rm -rf .venv"
    echo -e "   python3.9 -m venv .venv"
    echo -e "   source .venv/bin/activate"
    echo -e "   pip install -r requirements.txt"
    echo ""
    echo -e "${GREEN}✅ Le service fonctionnera avec Chatterbox Multilingual (clonage vocal inclus)${NC}"
    exit 1
fi

echo -e "${BLUE}📦 Tentative d'installation d'OpenVoice...${NC}"
echo ""

# Désinstaller l'ancienne version si elle existe
if pip show MyShell-OpenVoice &> /dev/null; then
    echo -e "${YELLOW}🔄 Désinstallation de l'ancienne version d'OpenVoice...${NC}"
    pip uninstall MyShell-OpenVoice -y
fi

# Essayer d'installer OpenVoice
echo -e "${BLUE}📥 Installation depuis GitHub...${NC}"
if pip install git+https://github.com/myshell-ai/OpenVoice.git 2>&1 | tee /tmp/openvoice_install.log; then
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ OpenVoice installé avec succès !                      ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}🎤 Clonage vocal disponible via:${NC}"
    echo -e "   • ${GREEN}Chatterbox Multilingual${NC} (backend principal - 23 langues)"
    echo -e "   • ${GREEN}OpenVoice V2${NC} (backend avancé - extraction embeddings)"
    echo ""

    # Vérifier que l'import fonctionne
    if python -c "from openvoice import se_extractor; print('✅')" &> /dev/null; then
        echo -e "${GREEN}✅ Import OpenVoice vérifié${NC}"
    else
        echo -e "${YELLOW}⚠️  OpenVoice installé mais import échoue${NC}"
    fi

    exit 0
else
    echo ""
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  ⚠️  Installation OpenVoice échouée                       ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}ℹ️  Cause probable: dépendances PyAV incompatibles avec Python $VENV_PYTHON_VERSION${NC}"
    echo ""
    echo -e "${GREEN}✅ Solution: Le clonage vocal fonctionnera avec Chatterbox Multilingual${NC}"
    echo -e "${BLUE}   - Clonage vocal natif de haute qualité${NC}"
    echo -e "${BLUE}   - Support de 23 langues${NC}"
    echo -e "${BLUE}   - Aucune configuration supplémentaire requise${NC}"
    echo ""
    echo -e "${YELLOW}📋 Log d'installation: /tmp/openvoice_install.log${NC}"
    echo ""

    # Le service continuera de fonctionner
    exit 0
fi
