#!/bin/bash
# =============================================================================
# Script d'installation des dépendances de diarisation (identification locuteurs)
# =============================================================================
# Ce script installe pyannote.audio et ses dépendances pour activer la
# diarisation (identification des locuteurs) dans le service Translator.
#
# Fonctionnalités:
#   ✅ Détection automatique de plusieurs locuteurs
#   ✅ Identification du locuteur principal
#   ✅ Flag isCurrentUser pour distinguer l'expéditeur
#   ✅ Affichage coloré par locuteur au frontend
#
# Usage:
#   ./install-diarization.sh
#
# Configuration requise après installation:
#   Dans services/translator/.env:
#   - ENABLE_DIARIZATION=true
#   - HF_TOKEN=your_token (optionnel mais recommandé)
#
# =============================================================================

set -e  # Arrêter en cas d'erreur

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Installation des dépendances de diarisation              ║${NC}"
echo -e "${BLUE}║     (Identification des locuteurs dans les audios)            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Vérifier Python
echo -e "${YELLOW}📋 Vérification de Python...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 n'est pas installé${NC}"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
echo -e "${GREEN}✅ Python $PYTHON_VERSION détecté${NC}"
echo ""

# Vérifier pip
echo -e "${YELLOW}📋 Vérification de pip...${NC}"
if ! command -v pip3 &> /dev/null; then
    echo -e "${RED}❌ pip3 n'est pas installé${NC}"
    exit 1
fi

PIP_VERSION=$(pip3 --version | cut -d' ' -f2)
echo -e "${GREEN}✅ pip $PIP_VERSION détecté${NC}"
echo ""

# Installation des dépendances
echo -e "${YELLOW}📦 Installation des dépendances de diarisation...${NC}"
echo ""

# 1. scikit-learn
echo -e "${BLUE}[1/3]${NC} Installation de scikit-learn (clustering)..."
pip3 install --no-cache-dir scikit-learn>=1.3.0
echo ""

# 2. pyannote.audio (optionnel mais recommandé)
echo -e "${BLUE}[2/3]${NC} Installation de pyannote.audio (diarisation précise)..."
echo -e "${YELLOW}ℹ️  Note: pyannote.audio requiert ~500MB et peut prendre quelques minutes${NC}"
pip3 install --no-cache-dir pyannote.audio>=3.1.0 || {
    echo -e "${YELLOW}⚠️  Installation de pyannote.audio échouée - le fallback pitch clustering sera utilisé${NC}"
}
echo ""

# 3. Vérifier librosa (normalement déjà installé via chatterbox-tts)
echo -e "${BLUE}[3/3]${NC} Vérification de librosa (analyse audio)..."
python3 -c "import librosa; print('✅ librosa est déjà installé')" 2>/dev/null || {
    echo -e "${YELLOW}⚠️  librosa non trouvé, installation...${NC}"
    pip3 install --no-cache-dir librosa>=0.10.0
}
echo ""

# Vérifier les installations
echo -e "${YELLOW}🔍 Vérification des installations...${NC}"
echo ""

# Test pyannote.audio
PYANNOTE_OK=0
python3 -c "from pyannote.audio import Pipeline; print('✅ pyannote.audio installé et fonctionnel')" 2>/dev/null && PYANNOTE_OK=1 || {
    echo -e "${YELLOW}⚠️  pyannote.audio non disponible - le fallback pitch clustering sera utilisé${NC}"
}

# Test scikit-learn
python3 -c "from sklearn.cluster import KMeans; print('✅ scikit-learn installé et fonctionnel')" 2>/dev/null || {
    echo -e "${RED}❌ scikit-learn installation échouée${NC}"
    exit 1
}

# Test librosa
python3 -c "import librosa; print('✅ librosa installé et fonctionnel')" 2>/dev/null || {
    echo -e "${RED}❌ librosa installation échouée${NC}"
    exit 1
}

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           ✅ Installation terminée avec succès !               ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Afficher les prochaines étapes
echo -e "${BLUE}📝 Prochaines étapes:${NC}"
echo ""
echo -e "${YELLOW}1. Activer la diarisation dans .env:${NC}"
echo "   ENABLE_DIARIZATION=true"
echo ""

if [ $PYANNOTE_OK -eq 1 ]; then
    echo -e "${YELLOW}2. Optionnel mais recommandé - Configurer le token HuggingFace:${NC}"
    echo "   a) Créer un compte sur https://huggingface.co/"
    echo "   b) Aller dans Settings > Access Tokens"
    echo "   c) Créer un nouveau token (READ access)"
    echo "   d) Accepter les conditions: https://huggingface.co/pyannote/speaker-diarization-3.1"
    echo "   e) Ajouter dans .env: HF_TOKEN=your_token_here"
    echo ""
    echo -e "${GREEN}   Avec le token HuggingFace, vous bénéficierez de la meilleure précision !${NC}"
else
    echo -e "${YELLOW}2. Note:${NC}"
    echo "   pyannote.audio n'est pas disponible, le service utilisera le fallback pitch clustering"
    echo "   qui offre une précision correcte sans nécessiter de token HuggingFace."
fi

echo ""
echo -e "${YELLOW}3. Redémarrer le service Translator:${NC}"
echo "   cd services/translator"
echo "   make restart"
echo ""

# Afficher les capacités installées
echo -e "${BLUE}📊 Capacités de diarisation installées:${NC}"
echo ""
if [ $PYANNOTE_OK -eq 1 ]; then
    echo -e "  ${GREEN}✅ Méthode principale: pyannote.audio (précision maximale)${NC}"
    echo -e "  ${GREEN}✅ Fallback 1: Pitch clustering (précision moyenne)${NC}"
    echo -e "  ${GREEN}✅ Fallback 2: Single speaker (1 locuteur)${NC}"
else
    echo -e "  ${YELLOW}⚠️  Méthode principale: Pitch clustering (précision moyenne)${NC}"
    echo -e "  ${GREEN}✅ Fallback: Single speaker (1 locuteur)${NC}"
fi

echo ""
echo -e "${BLUE}ℹ️  Documentation complète:${NC}"
echo "   - RESUME_IMPLEMENTATION_DIARISATION.md"
echo "   - COMPARAISON_REPONSE_BACKEND_AVANT_APRES.md"
echo ""

exit 0
